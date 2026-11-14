"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const generate = require("../api/generate");
const getPrediction = require("../api/predictions/[id]");

const originalToken = process.env.REPLICATE_API_TOKEN;
const originalCode = process.env.GENERATOR_ACCESS_CODE;
const originalFetch = global.fetch;
const accessCode = "this-is-a-test-access-code-with-32";

function responseMock() {
  return {
    headers: {},
    statusCode: 0,
    body: "",
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    },
    json() {
      return JSON.parse(this.body);
    },
  };
}

function requestMock({ method = "POST", body = {}, id = "pred-123", code = accessCode, origin = "https://clipmine.test" } = {}) {
  return {
    method,
    body,
    query: { id },
    headers: {
      host: "clipmine.test",
      origin,
      "x-generator-access-code": code,
    },
  };
}

test.beforeEach(() => {
  process.env.REPLICATE_API_TOKEN = "test-token";
  process.env.GENERATOR_ACCESS_CODE = accessCode;
});

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.REPLICATE_API_TOKEN;
  else process.env.REPLICATE_API_TOKEN = originalToken;
  if (originalCode === undefined) delete process.env.GENERATOR_ACCESS_CODE;
  else process.env.GENERATOR_ACCESS_CODE = originalCode;
});

test("generator rejects methods other than POST", async () => {
  const response = responseMock();
  await generate(requestMock({ method: "GET" }), response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "POST");
});

test("generator reports missing provider configuration instead of accepting a job", async () => {
  delete process.env.REPLICATE_API_TOKEN;
  const response = responseMock();
  await generate(requestMock(), response);
  assert.equal(response.statusCode, 503);
  assert.match(response.json().error, /not configured/);
});

test("generator rejects incorrect access codes and cross-origin requests", async () => {
  const unauthorized = responseMock();
  await generate(requestMock({ code: "incorrect" }), unauthorized);
  assert.equal(unauthorized.statusCode, 401);

  const crossOrigin = responseMock();
  await generate(requestMock({ origin: "https://attacker.test" }), crossOrigin);
  assert.equal(crossOrigin.statusCode, 403);
});

test("generator validates prompts before calling Replicate", async () => {
  global.fetch = assert.fail;
  const response = responseMock();
  await generate(requestMock({ body: { prompt: "short" } }), response);
  assert.equal(response.statusCode, 400);

  const invalidBody = responseMock();
  await generate(requestMock({ body: null }), invalidBody);
  assert.equal(invalidBody.statusCode, 400);
});

test("generator refuses a short shared access code", async () => {
  process.env.GENERATOR_ACCESS_CODE = "too-short";
  const response = responseMock();
  await generate(requestMock(), response);
  assert.equal(response.statusCode, 503);
});

test("generator sends the prompt server-side and returns only the prediction job", async () => {
  let upstreamRequest;
  global.fetch = async (url, options) => {
    upstreamRequest = { url, options };
    return new Response(JSON.stringify({ id: "pred-123", status: "starting", created_at: "2026-11-14T00:00:00Z" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  };

  const response = responseMock();
  await generate(requestMock({
    body: { prompt: "A whale floating through a starry night sky", prompt_optimizer: false },
  }), response);

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.json(), {
    id: "pred-123",
    status: "starting",
    created_at: "2026-11-14T00:00:00Z",
  });
  assert.equal(upstreamRequest.url, "https://api.replicate.com/v1/models/minimax/video-01/predictions");
  assert.equal(upstreamRequest.options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(upstreamRequest.options.body), {
    input: { prompt: "A whale floating through a starry night sky", prompt_optimizer: false },
  });
});

test("status endpoint returns a validated Replicate video URL", async () => {
  global.fetch = async () => new Response(JSON.stringify({
    id: "pred-123",
    status: "succeeded",
    output: "https://replicate.delivery/video.mp4",
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const response = responseMock();
  await getPrediction(requestMock({ method: "GET" }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().output, "https://replicate.delivery/video.mp4");
});

test("status endpoint refuses unexpected output hosts", async () => {
  global.fetch = async () => new Response(JSON.stringify({
    id: "pred-123",
    status: "succeeded",
    output: "https://example.com/video.mp4",
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const response = responseMock();
  await getPrediction(requestMock({ method: "GET" }), response);
  assert.equal(response.statusCode, 502);
  assert.match(response.json().error, /recognized video link/);
});

test("status endpoint validates prediction IDs before calling Replicate", async () => {
  global.fetch = assert.fail;
  const response = responseMock();
  await getPrediction(requestMock({ method: "GET", id: "../secrets" }), response);
  assert.equal(response.statusCode, 400);
});
