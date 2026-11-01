import assert from "node:assert/strict";
import test from "node:test";
import {
  parseVleeeMarketQuery,
  resolvePihpsCommodity,
} from "../src/integrations/vleee-market-search.js";

const candidate = {
  id: "com_1",
  name: "Minyak Goreng Curah",
  denomination: "kg",
};

function streamJson(json) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    body: {
      async *[Symbol.asyncIterator]() {
        yield encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: { content: json } }] })}\n\n`,
        );
        yield encoder.encode(
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
        );
      },
    },
  };
}

test("Vleee parses a natural-language request and preserves comparison locations", async () => {
  const previousKey = process.env.VLEEE_API_KEY;
  process.env.VLEEE_API_KEY = "test-key";
  try {
    const parsed = await parseVleeeMarketQuery(
      {
        product: "Bandingkan harga cabai di Surabaya dan Sidoarjo",
        province: "Jawa Timur",
        city: "Surabaya",
      },
      async (_url, options) => {
        assert.equal(JSON.parse(options.body).max_tokens, 4096);
        return streamJson(
          '{"product":"cabai rawit merah","intent":"compare","locations":[{"province":"Jawa Timur","city":"Surabaya"},{"province":"Jawa Timur","city":"Sidoarjo"}]}',
        );
      },
    );
    assert.deepEqual(parsed, {
      product: "cabai rawit merah",
      intent: "compare",
      locations: [
        { province: "Jawa Timur", city: "Surabaya" },
        { province: "Jawa Timur", city: "Sidoarjo" },
      ],
    });
  } finally {
    if (previousKey === undefined) delete process.env.VLEEE_API_KEY;
    else process.env.VLEEE_API_KEY = previousKey;
  }
});

test("Vleee is not called for a plain product name", async () => {
  assert.equal(
    await parseVleeeMarketQuery(
      {
        product: "minyak goreng",
        province: "Jawa Timur",
        city: "Surabaya",
      },
      async () => {
        throw new Error("Vleee should not be called");
      },
    ),
    null,
  );
});

test("Vleee resolves a PIHPS commodity only from the provided catalog", async () => {
  const previousKey = process.env.VLEEE_API_KEY;
  process.env.VLEEE_API_KEY = "test-key";
  try {
    const result = await resolvePihpsCommodity({
      query: "minyak goreng",
      candidates: [candidate],
      fetchImpl: async (_url, options) => {
        assert.equal(options.headers.Authorization, "Bearer test-key");
        assert.equal(JSON.parse(options.body).max_tokens, 4096);
        return streamJson('{"commodity_id":"com_1"}');
      },
    });
    assert.equal(result, candidate);
  } finally {
    if (previousKey === undefined) delete process.env.VLEEE_API_KEY;
    else process.env.VLEEE_API_KEY = previousKey;
  }
});

test("Vleee cannot invent a PIHPS catalog commodity", async () => {
  const previousKey = process.env.VLEEE_API_KEY;
  process.env.VLEEE_API_KEY = "test-key";
  try {
    const result = await resolvePihpsCommodity({
      query: "minyak goreng",
      candidates: [candidate],
      fetchImpl: async () => streamJson('{"commodity_id":"com_unknown"}'),
    });
    assert.equal(result, null);
  } finally {
    if (previousKey === undefined) delete process.env.VLEEE_API_KEY;
    else process.env.VLEEE_API_KEY = previousKey;
  }
});

test("PIHPS commodity matching does not require Vleee when no key is configured", async () => {
  const previousKey = process.env.VLEEE_API_KEY;
  delete process.env.VLEEE_API_KEY;
  try {
    assert.equal(
      await resolvePihpsCommodity({
        query: "minyak goreng",
        candidates: [candidate],
        fetchImpl: async () => {
          throw new Error("Vleee should not be called");
        },
      }),
      null,
    );
  } finally {
    if (previousKey !== undefined) process.env.VLEEE_API_KEY = previousKey;
  }
});
