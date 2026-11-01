import assert from "node:assert/strict";
import test from "node:test";
import { requestVleeeJson } from "../src/integrations/vleee-client.js";

function setVleeeEnvironment() {
  const previous = {
    VLEEE_API_KEY: process.env.VLEEE_API_KEY,
    VLEEE_BASE_URL: process.env.VLEEE_BASE_URL,
    VLEEE_MODEL: process.env.VLEEE_MODEL,
    VLEEE_FALLBACK_MODEL: process.env.VLEEE_FALLBACK_MODEL,
  };
  process.env.VLEEE_API_KEY = "test-key";
  delete process.env.VLEEE_BASE_URL;
  delete process.env.VLEEE_MODEL;
  delete process.env.VLEEE_FALLBACK_MODEL;
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function streamResponse(content, finishReason = "stop") {
  const events = [
    { choices: [{ delta: { content: content.slice(0, 12) } }] },
    { choices: [{ delta: { content: content.slice(12) } }] },
    { choices: [{ delta: {}, finish_reason: finishReason }] },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  const bytes = new TextEncoder().encode(`${events}data: [DONE]\n\n`);
  return {
    ok: true,
    body: {
      async *[Symbol.asyncIterator]() {
        yield bytes.slice(0, 17);
        yield bytes.slice(17, 61);
        yield bytes.slice(61);
      },
    },
  };
}

test("Vleee uses streaming chat completion and bounds requested token usage", async () => {
  const restore = setVleeeEnvironment();
  try {
    let requestBody;
    const result = await requestVleeeJson({
      messages: [{ role: "user", content: "Return JSON." }],
      maxTokens: 10,
      fetchImpl: async (url, options) => {
        assert.equal(
          url,
          "https://my.vleee.net/v1/chat/completions",
        );
        assert.equal(options.headers.Authorization, "Bearer test-key");
        requestBody = JSON.parse(options.body);
        return streamResponse('{"ok":true}');
      },
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(requestBody.model, "deepseek-v4.1-flash-1017");
    assert.equal(requestBody.stream, true);
    assert.equal(requestBody.max_tokens, 64);
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
  } finally {
    restore();
  }
});

test("Vleee tries the configured fallback model if the primary model is unavailable", async () => {
  const restore = setVleeeEnvironment();
  try {
    process.env.VLEEE_MODEL = "primary-model";
    process.env.VLEEE_FALLBACK_MODEL = "fallback-model";
    const models = [];
    const result = await requestVleeeJson({
      messages: [{ role: "user", content: "Return JSON." }],
      fetchImpl: async (_url, options) => {
        const { model } = JSON.parse(options.body);
        models.push(model);
        if (model === "primary-model") return { ok: false, status: 404 };
        return streamResponse('{"model":"fallback"}');
      },
    });
    assert.deepEqual(models, ["primary-model", "fallback-model"]);
    assert.deepEqual(result, { model: "fallback" });
  } finally {
    restore();
  }
});

test("Vleee does not retry another model when API credentials are rejected", async () => {
  const restore = setVleeeEnvironment();
  try {
    let calls = 0;
    await assert.rejects(
      requestVleeeJson({
        messages: [{ role: "user", content: "Return JSON." }],
        fetchImpl: async () => {
          calls++;
          return { ok: false, status: 401 };
        },
      }),
      { status: 503, code: "VLEEE_AUTH_FAILED" },
    );
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});

test("Vleee reports truncated streaming output explicitly", async () => {
  const restore = setVleeeEnvironment();
  try {
    await assert.rejects(
      requestVleeeJson({
        messages: [{ role: "user", content: "Return JSON." }],
        fetchImpl: async () => streamResponse('{"ok":', "length"),
      }),
      { status: 502, code: "VLEEE_OUTPUT_TRUNCATED" },
    );
  } finally {
    restore();
  }
});
