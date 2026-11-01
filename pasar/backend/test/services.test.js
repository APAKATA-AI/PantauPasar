import assert from "node:assert/strict";
import test from "node:test";
import { calculateBusiness } from "../src/services/calculator-service.js";
import { HttpError } from "../src/middleware/http-error.js";
import { createMarketService } from "../src/services/market-service.js";
import { simulateCosts } from "../src/services/simulation-service.js";

test("simulation matches the existing per-product cost formula", () => {
  const result = simulateCosts({
    bahan_baku: 160_000,
    jumlah_produk: 20,
    harga_jual: 15_000,
    kenaikan_bahan: 10,
    kenaikan_operasional: 5,
    operasional: 20_000,
  });
  assert.equal(result.untung_sebelum, 6_000);
  assert.equal(result.untung_sesudah, 5_150);
});

test("calculator returns revenue, total cost, profit, and margin", () => {
  assert.deepEqual(
    calculateBusiness({
      ingredients: [{ cost: 120_000 }, { cost: 40_000 }],
      quantity: 20,
      salePrice: 15_000,
      operatingCost: 20_000,
    }),
    {
      quantity: 20,
      revenue: 300_000,
      total_cost: 180_000,
      profit: 120_000,
      profit_per_product: 6_000,
      margin_percent: 40,
    },
  );
});

test("simulation rejects invalid input instead of returning fallback values", () => {
  assert.throws(
    () => simulateCosts({ bahan_baku: 1, jumlah_produk: 0 }),
    { status: 400, code: "INVALID_INPUT" },
  );
  assert.throws(
    () =>
      simulateCosts({
        bahan_baku: null,
        jumlah_produk: 1,
        harga_jual: 0,
        kenaikan_bahan: 0,
        kenaikan_operasional: 0,
        operasional: 0,
      }),
    { status: 400, code: "INVALID_INPUT" },
  );
});

test("market service refuses to invent prices when there are no observations", async () => {
  const service = createMarketService({
    async findObservations() {
      return [];
    },
  });
  await assert.rejects(
    service.getMarket({ product: "Cabai", province: "Jawa Timur", city: "Surabaya" }),
    { status: 404, code: "MARKET_DATA_UNAVAILABLE" },
  );
});

test("market service derives its result only from database observations", async () => {
  const service = createMarketService({
    async findObservations() {
      return [
        {
          commodity: "Cabai Rawit Merah",
          unit: "kg",
          price: "10000",
          source_name: "Sumber terverifikasi",
          source_url: "https://example.test/prices",
          observed_at: "2026-10-29T08:00:00.000Z",
          confidence_score: 80,
        },
        {
          commodity: "Cabai Rawit Merah",
          unit: "kg",
          price: "12000",
          source_name: "Sumber terverifikasi",
          source_url: "https://example.test/prices",
          observed_at: "2026-10-30T08:00:00.000Z",
          confidence_score: 90,
        },
      ];
    },
    async findRegionalAverages() {
      return [{ city: "Surabaya", average_price: "11000" }];
    },
  });
  const result = await service.getMarket({
    product: "Cabai",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  assert.equal(result.harga_rata_rata, 11_000);
  assert.equal(result.harga_terendah, 10_000);
  assert.equal(result.harga_tertinggi, 12_000);
  assert.equal(result.confidence_score, 85);
  assert.equal(result.daftar_sumber.length, 1);
  assert.equal(result.daftar_sumber[0].harga, 12_000);
  assert.equal(result.demo, false);
});

test("market service maps the UI rice label to the exact PIHPS commodity", async () => {
  let queriedProduct;
  const service = createMarketService({
    async findObservations({ product }) {
      queriedProduct = product;
      return [
        {
          commodity: "Beras Kualitas Medium I",
          unit: "kg",
          price: "16100",
          source_name: "Bank Indonesia (PIHPS)",
          source_url: "https://www.bi.go.id/hargapangan/",
          observed_at: "2026-10-30T05:00:00.000Z",
          confidence_score: null,
        },
      ];
    },
    async findRegionalAverages() {
      return [{ city: "Surabaya", average_price: "16100" }];
    },
  });
  const result = await service.getMarket({
    product: "Beras medium",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  assert.equal(queriedProduct, "Beras Kualitas Medium I");
  assert.equal(result.confidence_score, null);
  assert.equal(result.daftar_sumber[0].komoditas, "Beras Kualitas Medium I");
});

test("market service resolves broad product queries to a stored commodity", async () => {
  const queriedProducts = [];
  const service = createMarketService({
    async findObservations({ product }) {
      queriedProducts.push(product);
      return [
        {
          commodity: "Minyak Goreng Curah",
          unit: "kg",
          price: "18000",
          source_name: "Bank Indonesia (PIHPS)",
          source_url: "https://www.bi.go.id/hargapangan/",
          observed_at: "2026-10-30T00:00:00.000Z",
          confidence_score: null,
        },
      ];
    },
    async findRegionalAverages() {
      return [{ city: "Surabaya", average_price: "18000" }];
    },
  });

  const broadResult = await service.getMarket({
    product: "minyak goreng saja",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  const typoResult = await service.getMarket({
    product: "minyak goreng odang",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  assert.deepEqual(queriedProducts, [
    "Minyak Goreng Curah",
    "Minyak Goreng Curah",
  ]);
  assert.equal(broadResult.produk, "Minyak goreng curah");
  assert.equal(typoResult.produk, "Minyak goreng curah");
  assert.deepEqual(await service.searchProducts("minyak goreng odang"), [
    { label: "Minyak goreng curah" },
  ]);
});

test("market service reports unknown products instead of querying arbitrary names", async () => {
  const service = createMarketService({
    async findObservations() {
      throw new Error("Unrecognized product should not reach the repository");
    },
  });
  await assert.rejects(
    service.getMarket({
      product: "produk fiktif",
      province: "Jawa Timur",
      city: "Surabaya",
    }),
    { status: 404, code: "PRODUCT_NOT_FOUND" },
  );
});

test("market service fetches an unseeded product from PIHPS and reads the saved data", async () => {
  let lookupCount = 0;
  const service = createMarketService(
    {
      async findObservations({ product }) {
        lookupCount++;
        assert.equal(product, "Minyak Goreng Kemasan Bermerk 1");
        return [
          {
            commodity: "Minyak Goreng Kemasan Bermerk 1",
            unit: "kg",
            price: "18500",
            source_name: "Bank Indonesia (PIHPS)",
            source_url: "https://www.bi.go.id/hargapangan/",
            observed_at: "2026-10-30T00:00:00.000Z",
            confidence_score: null,
          },
        ];
      },
      async findRegionalAverages() {
        return [{ city: "Surabaya", average_price: "18500" }];
      },
    },
    {
      async importProduct(params) {
        assert.deepEqual(params, {
          product: "minyak goreng kemasan bermerk 1",
          province: "Jawa Timur",
          city: "Surabaya",
        });
        return {
          imported: 1,
          commodity: { name: "Minyak Goreng Kemasan Bermerk 1" },
        };
      },
    },
  );

  const result = await service.getMarket({
    product: "minyak goreng kemasan bermerk 1",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  assert.equal(result.produk, "Minyak Goreng Kemasan Bermerk 1");
  assert.equal(result.harga_rata_rata, 18500);
  assert.equal(lookupCount, 1);
});

test("market search works without PostgreSQL and keeps results separated by region", async () => {
  const seenRegions = [];
  const service = createMarketService(null, {
    async fetchProduct({ product, province, city }) {
      seenRegions.push({ product, province, city });
      return {
        commodity: {
          name: "Minyak Goreng Curah",
          denomination: "kg",
        },
        observations: [
          {
            commodity: "Minyak Goreng Curah",
            unit: "kg",
            price: city === "Surabaya" ? 18500 : 19200,
            source_name: "Bank Indonesia (PIHPS)",
            source_url: "https://www.bi.go.id/hargapangan/source",
            observed_at: "2026-10-30T00:00:00.000Z",
            confidence_score: null,
          },
        ],
        ai_assisted: false,
      };
    },
  });

  test("market service searches public web offers when PIHPS has no matching commodity", async () => {
    const searchCalls = [];
    const service = createMarketService(
      null,
      {
        async fetchProduct() {
          return { commodity: null, observations: [] };
        },
      },
      async (query) => {
        searchCalls.push(query);
        return { market_type: "web_offers", offer_list: [] };
      },
    );
    const query = {
      product: "paket data internet",
      province: "Jawa Timur",
      city: "Surabaya",
    };
    const result = await service.getMarket(query);
    assert.deepEqual(searchCalls, [query]);
    assert.equal(result.market_type, "web_offers");
  });

  test("market service falls back to web offers when PIHPS name matching is unavailable", async () => {
    const service = createMarketService(
      null,
      {
        async fetchProduct() {
          throw new HttpError(
            502,
            "GEMINI_UNAVAILABLE",
            "Gemini temporarily unavailable",
          );
        },
      },
      async () => ({ market_type: "web_offers", offer_list: [] }),
    );
    const result = await service.getMarket({
      product: "paket data internet",
      province: "Jawa Timur",
      city: "Surabaya",
    });
    assert.equal(result.market_type, "web_offers");
  });
  const surabaya = await service.getMarket({
    product: "Minyak goreng",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  const malang = await service.getMarket({
    product: "Minyak goreng",
    province: "Jawa Timur",
    city: "Malang",
  });

  assert.equal(surabaya.harga_rata_rata, 18500);
  assert.equal(malang.harga_rata_rata, 19200);
  assert.equal(surabaya.kota, "Surabaya");
  assert.equal(malang.kota, "Malang");
  assert.equal(surabaya.daftar_sumber[0].nama, "Bank Indonesia (PIHPS)");
  assert.deepEqual(seenRegions.map(({ city }) => city), ["Surabaya", "Malang"]);
});
