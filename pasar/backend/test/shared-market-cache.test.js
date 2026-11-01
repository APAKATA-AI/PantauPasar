import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createSharedMarketCache } from "../src/services/shared-market-cache.js";
import { HttpError } from "../src/middleware/http-error.js";

const query = { product: "Beras", province: "Jawa Timur", city: "Surabaya" };
const result = () => ({ produk: "Beras", harga_rata_rata: 16000, satuan: "kg",
  daftar_sumber: [{ nama: "PIHPS", url: "https://example.test/prices", tanggal: "2026-10-31", harga: 16000 }],
  updated_at: "2026-10-31T00:00:00.000Z", demo: false });

test("server cache coalesces simultaneous searches and isolates product/location", async () => {
  const cache = createSharedMarketCache();
  let calls = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const loader = async () => { calls++; await barrier; return result(); };
  const one = cache.getOrLoad(query, loader);
  const two = cache.getOrLoad({ ...query, product: " BERAS " }, loader);
  release();
  const [first, second] = await Promise.all([one, two]);
  assert.equal(calls, 1);
  assert.equal(first.cache.fetched_at, second.cache.fetched_at);
  first.daftar_sumber[0].harga = 1;
  const next = await cache.getOrLoad(query, loader);
  assert.equal(next.daftar_sumber[0].harga, 16000);
  assert.equal(next.cache.hit, true);
  await cache.getOrLoad({ ...query, city: "Kota Malang" }, loader);
  await cache.getOrLoad({ ...query, city: "Kabupaten Malang" }, loader);
  assert.equal(calls, 3);
});

test("expired refresh failure keeps source timestamps and explicitly marks bounded stale data", async () => {
  let now = Date.parse("2026-11-01T00:00:00Z");
  const cache = createSharedMarketCache({ clock: () => now, officialTtlMs: 100, officialStaleMs: 500 });
  const first = await cache.getOrLoad(query, async () => result());
  now += 99;
  const hit = await cache.getOrLoad(query, () => { throw new Error("must not load"); });
  assert.equal(hit.cache.expires_at, first.cache.expires_at);
  now += 2;
  const stale = await cache.getOrLoad(query, async () => { throw new Error("secret-provider-key"); });
  assert.equal(stale.cache.status, "stale");
  assert.equal(stale.searched_at, first.searched_at);
  assert.equal(stale.updated_at, first.updated_at);
  assert.doesNotMatch(JSON.stringify(stale), /secret-provider-key/);
  now += 500;
  await assert.rejects(cache.getOrLoad(query, async () => { throw new HttpError(502, "DOWN", "Unavailable"); }), { code: "DOWN" });
});

test("force refresh reloads fresh entries; rejected invalid input never falls back", async () => {
  const cache = createSharedMarketCache();
  await cache.getOrLoad(query, async () => result());
  const fresh = await cache.getOrLoad(query, async () => ({ ...result(), harga_rata_rata: 17000 }), { refresh: true });
  assert.equal(fresh.harga_rata_rata, 17000);
  await assert.rejects(cache.getOrLoad(query, async () => { throw new HttpError(400, "INVALID_INPUT", "Invalid"); }, { refresh: true }), { code: "INVALID_INPUT" });
});

test("cache persists verified results across restarts, bounds entries, tolerates corrupt files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "market-cache-test-"));
  try {
    const filePath = path.join(directory, "cache.json");
    let cache = createSharedMarketCache({ filePath, maxEntries: 2 });
    await cache.getOrLoad(query, async () => result());
    await cache.getOrLoad({ ...query, product: "Cabai" }, async () => result());
    await cache.getOrLoad({ ...query, product: "Gula" }, async () => result());
    cache = createSharedMarketCache({ filePath, maxEntries: 2 });
    assert.equal((await cache.status()).entries, 2);
    const hit = await cache.getOrLoad({ ...query, product: "Gula" }, () => { throw new Error("must not load"); });
    assert.equal(hit.cache.hit, true);
    assert.equal(JSON.parse(await readFile(filePath, "utf8")).entries.length, 2);
    await writeFile(filePath, "invalid");
    cache = createSharedMarketCache({ filePath });
    assert.equal((await cache.status()).storage, "memory_fallback");
    assert.equal((await cache.getOrLoad(query, async () => result())).harga_rata_rata, 16000);
    assert.equal((await cache.status()).storage, "persistent");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unverified or empty results are never cached", async () => {
  const cache = createSharedMarketCache();
  await cache.getOrLoad(query, async () => ({ ...result(), daftar_sumber: [] }));
  assert.equal((await cache.status()).entries, 0);
});
