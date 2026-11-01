import assert from "node:assert/strict";
import test from "node:test";
import { createGeminiWebMarketSearch } from "../src/integrations/gemini-web-market-search.js";

function groundedResponse({
  price = 15000,
  sourceDate = "2026-10-31",
  citationUrl = "https://shop.example.test/product",
  citationEnd,
} = {}) {
  const text = JSON.stringify({
    offers: [
      {
        title: "Paket data 10 GB",
        seller: "Toko resmi",
        price,
        unit: "1 paket",
        source_date: sourceDate,
      },
    ],
  });
  return {
    steps: [
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text,
            annotations: [
              {
                type: "url_citation",
                url: citationUrl,
                title: "Toko Resmi",
                start_index: 0,
                end_index: citationEnd ?? text.length,
              },
            ],
          },
        ],
      },
    ],
  };
}

function responseWithEvidence({
  price = 15000,
  sourceDate = "2026-10-31",
  citationUrl = "https://shop.example.test/product",
} = {}) {
  const text = JSON.stringify({
    offers: [
      {
        title: "Paket data 10 GB",
        seller: "Toko resmi",
        price,
        unit: "1 paket",
        source_date: sourceDate,
      },
    ],
  });
  return {
    steps: [
      {
        type: "model_output",
        content: [
          {
            type: "text",
            text,
            annotations: [
              {
                type: "url_citation",
                url: citationUrl,
                title: "Toko Resmi",
                start_index: 0,
                end_index: text.length,
              },
            ],
          },
        ],
      },
    ],
  };
}

test("web market search returns only prices tied to grounding citations", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  let fetchCalls = 0;
  const search = createGeminiWebMarketSearch({
    clock: () => Date.parse("2026-10-31T03:00:00.000Z"),
    fetchImpl: async (url, options) => {
      fetchCalls++;
      assert.match(url, /\/v1beta\/interactions$/);
      assert.equal(options.headers["x-goog-api-key"], "test-key");
      assert.deepEqual(JSON.parse(options.body).tools, [{ type: "google_search" }]);
      assert.equal(JSON.parse(options.body).model, "gemini-3.8-flash");
      return { ok: true, json: async () => responseWithEvidence() };
    },
  });
  try {
    const query = {
      product: "paket data 10 GB",
      province: "Jawa Timur",
      city: "Surabaya",
    };
    const result = await search(query);
    assert.equal(result.market_type, "web_offers");
    assert.equal(result.offer_list[0].price, 15000);
    assert.equal(result.offer_list[0].unit, "1 paket");
    assert.equal(result.offer_list[0].source_date, "2026-10-31T00:00:00.000Z");
    assert.equal(result.offer_list[0].accessed_at, "2026-10-31T03:00:00.000Z");
    assert.equal(result.daftar_sumber[0].url, "https://shop.example.test/product");
    await search(query);
    assert.equal(fetchCalls, 1);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("web market search refuses prices without a matching source citation", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const search = createGeminiWebMarketSearch({
    fetchImpl: async () => ({
      ok: true,
      json: async () =>
        groundedResponse({
          citationEnd: 10,
          citationUrl: "https://shop.example.test/product",
        }),
    }),
  });
  try {
    await assert.rejects(
      search({ product: "paket data", province: "Jawa Timur", city: "Surabaya" }),
      { status: 404, code: "MARKET_DATA_UNAVAILABLE" },
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("web market search rejects insecure citation links", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const search = createGeminiWebMarketSearch({
    fetchImpl: async () => ({
      ok: true,
      json: async () =>
        responseWithEvidence({
          citationUrl: "http://shop.example.test/product",
        }),
    }),
  });
  try {
    await assert.rejects(
      search({ product: "paket data", province: "Jawa Timur", city: "Surabaya" }),
      { status: 404, code: "MARKET_DATA_UNAVAILABLE" },
    );
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("web market search leaves source dates blank when the source has none", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const search = createGeminiWebMarketSearch({
    clock: () => Date.parse("2026-10-31T03:00:00.000Z"),
    fetchImpl: async () => ({
      ok: true,
      json: async () =>
        responseWithEvidence({ sourceDate: null }),
    }),
  });

  test("web market search explains exhausted Gemini quota without exposing credentials", async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    const search = createGeminiWebMarketSearch({
      fetchImpl: async () => ({ ok: false, status: 429 }),
    });
    try {
      await assert.rejects(
        search({ product: "paket data", province: "Jawa Timur", city: "Surabaya" }),
        {
          status: 503,
          code: "GEMINI_QUOTA_EXCEEDED",
          message:
            "Kuota Gemini untuk pencarian web habis atau belum diaktifkan. Periksa limit dan billing project API.",
        },
      );
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });
  try {
    const result = await search({
      product: "paket data",
      province: "Jawa Timur",
      city: "Surabaya",
    });
    assert.equal(result.offer_list[0].source_date, null);
    assert.equal(result.daftar_sumber[0].tanggal_sumber, null);
    assert.equal(result.daftar_sumber[0].tanggal, "2026-10-31T03:00:00.000Z");
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
