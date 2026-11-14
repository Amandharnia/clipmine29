"use strict";

const { createHash, timingSafeEqual } = require("node:crypto");

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

function authorize(request, response) {
  const token = process.env.REPLICATE_API_TOKEN;
  const expectedCode = process.env.GENERATOR_ACCESS_CODE;
  if (!token || !expectedCode || expectedCode.length < 24) {
    sendJson(response, 503, { error: "AI generation is not configured. The site owner must set a Replicate token and an app access code of at least 24 characters." });
    return false;
  }

  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin && host) {
    let originUrl;
    try {
      originUrl = new URL(origin);
    } catch {
      sendJson(response, 403, { error: "This request origin is not allowed." });
      return false;
    }
    if (originUrl.host !== host || !["http:", "https:"].includes(originUrl.protocol)) {
      sendJson(response, 403, { error: "This request origin is not allowed." });
      return false;
    }
  }

  const providedCode = request.headers["x-generator-access-code"];
  if (typeof providedCode !== "string" || !constantTimeEqual(providedCode, expectedCode)) {
    sendJson(response, 401, { error: "The app access code is missing or incorrect." });
    return false;
  }
  return true;
}

function constantTimeEqual(left, right) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash) && left.length === right.length;
}

function methodNotAllowed(response, method) {
  response.setHeader("Allow", method);
  sendJson(response, 405, { error: `Use ${method} for this endpoint.` });
}

function providerErrorMessage(payload, fallback) {
  if (payload && typeof payload.detail === "string" && payload.detail.length < 400) return payload.detail;
  if (payload && typeof payload.title === "string" && payload.title.length < 200) return payload.title;
  return fallback;
}

module.exports = { authorize, methodNotAllowed, providerErrorMessage, sendJson };
