"use strict";

const { authorize, methodNotAllowed, providerErrorMessage, sendJson } = require("../../lib/security");

module.exports = async function getPrediction(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, "GET");
    return;
  }
  if (!authorize(request, response)) return;

  const id = request.query?.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    sendJson(response, 400, { error: "A valid prediction ID is required." });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    sendJson(response, 502, { error: "Could not reach Replicate to check this generation." });
    return;
  }

  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const status = upstream.status === 404 ? 404 : upstream.status === 429 ? 429 : 502;
    const error = upstream.status === 404
      ? "This generation could not be found. Check your Replicate account."
      : upstream.status === 429
        ? "Replicate is receiving too many status requests. Wait a moment and check again."
        : providerErrorMessage(payload, "Could not read the generation status from Replicate.");
    sendJson(response, status, { error });
    return;
  }
  if (!payload || typeof payload.status !== "string") {
    sendJson(response, 502, { error: "Replicate returned an unexpected status response." });
    return;
  }

  const output = typeof payload.output === "string"
    ? payload.output
    : Array.isArray(payload.output) && typeof payload.output[0] === "string"
      ? payload.output[0]
      : null;
  const safeOutput = output && isReplicateVideoUrl(output) ? output : null;
  const error = typeof payload.error === "string" ? payload.error.slice(0, 500) : null;
  if (payload.status === "succeeded" && !safeOutput) {
    sendJson(response, 502, { error: "Replicate completed this job but did not return a recognized video link." });
    return;
  }
  sendJson(response, 200, {
    id: payload.id,
    status: payload.status,
    output: safeOutput,
    error,
  });
};

function isReplicateVideoUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "replicate.delivery" || url.hostname.endsWith(".replicate.delivery"));
  } catch {
    return false;
  }
}
