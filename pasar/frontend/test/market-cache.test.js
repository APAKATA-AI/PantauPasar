import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

class MemoryStorage {
  #items = new Map();

  get length() {
    return this.#items.size;
  }

  key(index) {
    return [...this.#items.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#items.get(key) ?? null;
  }

  setItem(key, value) {
    this.#items.set(key, String(value));
  }

  removeItem(key) {
    this.#items.delete(key);
  }
}

async function loadCache() {
  const storage = new MemoryStorage();
  const window = {};
  const source = await readFile(
    new URL("../js/services/market-cache.js", import.meta.url),
    "utf8",
  );
  vm.runInNewContext(source, { window, localStorage: storage });
  return { cache: window.PantauMarketCache, storage };
}

test("market cache evicts oldest entries when its local limit is exceeded", async () => {
  const { cache, storage } = await loadCache();
  const market = {
    produk: "barang",
    harga_rata_rata: 1000,
    satuan: "kg",
    daftar_sumber: [],
    updated_at: "2026-11-01T00:00:00.000Z",
  };

  for (let index = 0; index < 31; index++)
    cache.write(
      { product: `item-${index}`, province: "Jawa Timur", city: "Surabaya" },
      market,
      60_000,
      index,
    );

  assert.equal(storage.length, 30);
  assert.equal(
    cache.read({
      product: "item-0",
      province: "Jawa Timur",
      city: "Surabaya",
    }).entry,
    null,
  );
  assert.equal(
    cache.read({
      product: "item-30",
      province: "Jawa Timur",
      city: "Surabaya",
    }, 100).entry.product,
    "barang",
  );
});
