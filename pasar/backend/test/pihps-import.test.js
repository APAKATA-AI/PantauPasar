import assert from "node:assert/strict";
import test from "node:test";
import { createPihpsClient } from "../src/integrations/pihps-client.js";
import { PIHPS_COMMODITIES, PIHPS_REGIONS } from "../src/integrations/pihps-catalog.js";
import {
  createPihpsImportService,
  parsePihpsDate,
  parsePihpsPrice,
} from "../src/services/pihps-import-service.js";

test("PIHPS price and date parsers reject malformed source values", () => {
  assert.equal(parsePihpsPrice("16,450"), 16450);
  assert.equal(parsePihpsPrice("16450.5"), 16450.5);
  assert.equal(parsePihpsPrice("-"), null);
  assert.equal(parsePihpsPrice("16,45"), null);
  assert.equal(parsePihpsPrice(0), null);
  assert.equal(parsePihpsDate("30/10/2026"), "2026-10-30T00:00:00.000Z");
  assert.equal(parsePihpsDate("31/02/2026"), null);
  assert.equal(parsePihpsDate("2026-10-30"), null);
});

test("PIHPS importer maps source locations and upserts only parsed observations", async () => {
  const pauseCalls = [];
  let saved = [];
  const client = {
    async getProvinces() {
      return PIHPS_REGIONS.map((region, index) => ({
        id: index + 10,
        name: region.province,
      }));
    },
    async getCommodityCatalog() {
      return PIHPS_COMMODITIES.map((item, index) => ({
        id: `com_${index}`,
        name: item.sourceName,
        denomination: "kg",
      }));
    },
    async getCities(provinceId) {
      const region = PIHPS_REGIONS[provinceId - 10];
      return region.cities.map((city, index) => ({
        id: `${provinceId}${index}`,
        name: `Kota ${city}`,
      }));
    },
    async getPriceGrid() {
      return PIHPS_COMMODITIES.map((item) => ({
        name: item.sourceName,
        "30/10/2026": "16,450",
        "31/10/2026": "-",
      }));
    },
    async pause() {
      pauseCalls.push(true);
    },
  };
  const service = createPihpsImportService({
    client,
    repository: {
      async upsertObservations(rows) {
        saved = rows;
        return rows.length;
      },
    },
    clock: () => new Date("2026-10-30T12:00:00.000Z"),
  });

  const result = await service.importRecent({ days: 30 });
  assert.equal(result.startDate, "2026-10-01");
  assert.equal(result.endDate, "2026-10-30");
  assert.equal(result.observations, 9 * PIHPS_COMMODITIES.length);
  assert.equal(result.stored, result.observations);
  assert.equal(result.locations.length, 9);
  assert.deepEqual(result.unavailableLocations, []);
  assert.equal(pauseCalls.length, 8);
  assert.equal(saved[0].commodity, PIHPS_COMMODITIES[0].sourceName);
  assert.equal(saved[0].source_name, "Bank Indonesia (PIHPS)");
  assert.match(saved[0].source_url, /regency_id=/);
  assert.equal(saved[0].confidence_score, null);
});

test("PIHPS client reports non-success HTTP responses", async () => {
  const client = createPihpsClient({
    fetchImpl: async () => ({ ok: false, status: 503 }),
    pauseMs: 0,
  });
  await assert.rejects(client.getProvinces(), /HTTP 503/);
});

test("PIHPS discovery imports an unseeded catalog commodity for the requested region", async () => {
  const saved = [];
  const client = {
    async getCommodityCatalog() {
      return [
        {
          id: "com_900",
          name: "Minyak Goreng Kemasan Bermerk 1",
          denomination: "kg",
        },
      ];
    },
    async getProvinces() {
      return [{ id: 16, name: "Jawa Timur" }];
    },
    async getCities() {
      return [{ id: 42, name: "Kota Surabaya" }];
    },
    async getPriceGrid(params) {
      assert.equal(params.provinceId, 16);
      assert.equal(params.cityId, 42);
      return [
        {
          name: "Minyak Goreng Kemasan Bermerk 1",
          "30/10/2026": "18,500",
        },
      ];
    },
    async upsertObservations() {},
  };
  const service = createPihpsImportService({
    client,
    repository: {
      async upsertObservations(rows) {
        saved.push(...rows);
        return rows.length;
      },
    },
    clock: () => new Date("2026-10-30T12:00:00.000Z"),
  });

  assert.deepEqual(
    await service.searchProducts("minyak goreng kemasan bermerk 1"),
    [{ label: "Minyak Goreng Kemasan Bermerk 1", unit: "kg" }],
  );
  const result = await service.importProduct({
    product: "minyak goreng kemasan bermerk 1",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  assert.equal(result.imported, 1);
  assert.equal(result.commodity.name, "Minyak Goreng Kemasan Bermerk 1");
  assert.equal(saved[0].commodity, "Minyak Goreng Kemasan Bermerk 1");
  assert.equal(saved[0].price, 18500);
  assert.equal(saved[0].source_name, "Bank Indonesia (PIHPS)");
  assert.equal(saved[0].unit, "kg");
});

test("PIHPS discovery returns no result for products absent from its catalog", async () => {
  const service = createPihpsImportService({
    client: {
      async getCommodityCatalog() {
        return [
          {
            id: "com_1",
            name: "Minyak Goreng Kemasan Bermerk 1",
            denomination: "kg",
          },
        ];
      },
    },
    repository: { async upsertObservations() { return 0; } },
  });
  assert.deepEqual(await service.searchProducts("produk yang tidak ada"), []);
  assert.deepEqual(
    await service.importProduct({
      product: "produk yang tidak ada",
      province: "Jawa Timur",
      city: "Surabaya",
    }),
    { imported: 0, commodity: null },
  );
});

test("PIHPS fetch returns verified observations without a database repository", async () => {
  const service = createPihpsImportService({
    client: {
      async getCommodityCatalog() {
        return [
          {
            id: "com_1",
            name: "Minyak Goreng Curah",
            denomination: "kg",
          },
        ];
      },
      async getProvinces() {
        return [{ id: 16, name: "Jawa Timur" }];
      },
      async getCities() {
        return [{ id: 42, name: "Kota Surabaya" }];
      },
      async getPriceGrid() {
        return [
          {
            name: "Minyak Goreng Curah",
            "30/10/2026": "18,500",
          },
        ];
      },
    },
    clock: () => new Date("2026-10-30T12:00:00.000Z"),
  });

  const result = await service.fetchProduct({
    product: "Minyak goreng",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].price, 18500);
  assert.equal(result.observations[0].source_name, "Bank Indonesia (PIHPS)");
  assert.equal(result.observations[0].observed_at, "2026-10-30T00:00:00.000Z");
  assert.equal(result.commodity.name, "Minyak Goreng Curah");
});

test("Gemini can only resolve a commodity already present in the official catalog", async () => {
  const candidate = {
    id: "com_7",
    name: "Minyak Goreng Curah",
    denomination: "kg",
  };
  const service = createPihpsImportService({
    client: {
      async getCommodityCatalog() {
        return [candidate];
      },
      async getProvinces() {
        return [{ id: 16, name: "Jawa Timur" }];
      },
      async getCities() {
        return [{ id: 42, name: "Kota Surabaya" }];
      },
      async getPriceGrid() {
        return [
          {
            name: "Minyak Goreng Curah",
            "30/10/2026": "12,000",
          },
        ];
      },
    },
    clock: () => new Date("2026-10-30T12:00:00.000Z"),
    resolveCommodity: async ({ query, candidates }) => {
      assert.equal(query, "Minyak goreng tambahan");
      assert.deepEqual(candidates, [candidate]);
      return candidate;
    },
  });

  const result = await service.fetchProduct({
    product: "Minyak goreng tambahan",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  assert.equal(result.ai_assisted, true);
  assert.equal(result.commodity.name, "Minyak Goreng Curah");
  assert.equal(result.observations[0].price, 12000);
});

test("PIHPS skips Gemini matching for unrelated product names", async () => {
  let resolveCalls = 0;
  const service = createPihpsImportService({
    client: {
      async getCommodityCatalog() {
        return [
          {
            id: "com_1",
            name: "Minyak Goreng Curah",
            denomination: "kg",
          },
        ];
      },
    },
    resolveCommodity: async () => {
      resolveCalls++;
      return null;
    },
  });

  const result = await service.fetchProduct({
    product: "Paket data Telkomsel 10 GB",
    province: "Jawa Timur",
    city: "Surabaya",
  });
  assert.equal(result.commodity, null);
  assert.equal(resolveCalls, 0);
});
