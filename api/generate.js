"use strict";

const { authorize, methodNotAllowed, providerErrorMessage, sendJson } = require("../lib/security");

const MAX_PROMPT_LENGTH = 1200;

module.exports = async function generate(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, "POST");
    return;
  }
  if (!authorize(request, response)) return;

  const body = request.body && typeof request.body === "object" && !Array.isArray(request.body)
    ? request.body
    : {};
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 8 || prompt.length > MAX_PROMPT_LENGTH) {
    sendJson(response, 400, { error: `Prompt must be between 8 and ${MAX_PROMPT_LENGTH} characters.` });
    return;
  }
  if (body.prompt_optimizer !== undefined && typeof body.prompt_optimizer !== "boolean") {
    sendJson(response, 400, { error: "Prompt optimizer must be true or false." });
    return;
  }

  let upstream;
  try {
    upstream = await fetch("https://api.replicate.com/v1/models/minimax/video-01/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          prompt,
          prompt_optimizer: body.prompt_optimizer !== false,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    sendJson(response, 502, { error: "Could not reach Replicate. Check your connection and account status before submitting again." });
    return;
  }

  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const message = upstream.status === 401 || upstream.status === 403
      ? "Replicate rejected the server API token. The site owner must check the token and model access."
      : upstream.status === 429
        ? "Replicate is receiving too many requests. Wait a little before trying again."
        : upstream.status === 402
          ? "Replicate needs available billing credits before it can generate this video."
          : providerErrorMessage(payload, "Replicate could not start this video generation.");
    sendJson(response, upstream.status === 429 ? 429 : upstream.status === 402 ? 402 : 502, { error: message });
    return;
  }
  if (!payload || typeof payload.id !== "string" || typeof payload.status !== "string") {
    sendJson(response, 502, { error: "Replicate returned an unexpected response. Check your Replicate dashboard before retrying." });
    return;
  }

  sendJson(response, 202, {
    id: payload.id,
    status: payload.status,
    created_at: payload.created_at || null,
  });
};
