"use strict";

(() => {
  const normalize = (value) =>
    String(value)
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("id-ID")
      .replace(/\s+/g, " ");
  const cachePrefix = "pp_market_cache_v2:";
  const maxEntries = 30;
  const maxStaleMs = 7 * 24 * 60 * 60 * 1000;
  const timestamp = (value) => typeof value === "number" ? value : Date.parse(value);

  function keyFor({ product, province, city, compare = "" }) {
    return [
      "pp_market_cache_v2",
      compare ? JSON.stringify([product, compare]) : product,
      province,
      city,
    ]
      .map((value, index) =>
        index === 0 ? value : encodeURIComponent(normalize(value)),
      )
      .join(":");
  }

  function read(query, now = Date.now()) {
    const key = keyFor(query);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { entry: null, error: null };
      const entry = JSON.parse(raw);
      if (
        entry?.schema !== 1 ||
        entry.key !== key ||
        !entry.market ||
        !Number.isFinite(entry.expires_at) ||
        !Number.isFinite(entry.searched_at) ||
        entry.searched_at > now + 60_000 ||
        entry.expires_at < entry.searched_at ||
        entry.expires_at - entry.searched_at > maxStaleMs
      )
        return { entry: null, error: null };
      const staleUntil = Math.min(
        Number.isFinite(timestamp(entry.market.cache?.stale_until))
          ? timestamp(entry.market.cache.stale_until)
          : entry.expires_at + maxStaleMs,
        entry.expires_at + maxStaleMs,
      );
      if (staleUntil <= now) {
        localStorage.removeItem(key);
        return { entry: null, error: null };
      }
      return {
        entry,
        error: null,
        fresh: entry.expires_at > now && entry.market.cache?.status !== "stale",
      };
    } catch (error) {
      return { entry: null, error };
    }
  }

  function write(query, market, ttlMs, now = Date.now()) {
    const key = keyFor(query);
    const serverTime = timestamp(market.cache?.fetched_at || market.searched_at);
    const searchedAt = Number.isFinite(serverTime) ? Math.min(serverTime, now) : now;
    const serverExpiry = timestamp(market.cache?.expires_at);
    const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? Math.min(ttlMs, maxStaleMs) : 0;
    const expiresAt = Math.min(searchedAt + ttl, Number.isFinite(serverExpiry) ? serverExpiry : Infinity);
    const entry = {
      schema: 1,
      key,
      product: market.produk || query.product,
      category: market.kategori || null,
      province: query.province,
      city: query.city,
      price: market.harga_rata_rata,
      unit: market.satuan,
      source: market.daftar_sumber,
      source_date: market.updated_at,
      searched_at: searchedAt,
      expires_at: expiresAt,
      market,
    };
    try {
      const cacheEntries = [];
      for (let index = 0; index < localStorage.length; index++) {
        const cacheKey = localStorage.key(index);
        if (!cacheKey?.startsWith(cachePrefix)) continue;
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey));
          cacheEntries.push({
            key: cacheKey,
            searchedAt: Number.isFinite(cached?.searched_at)
              ? cached.searched_at
              : 0,
          });
        } catch {
          cacheEntries.push({ key: cacheKey, searchedAt: 0 });
        }
      }
      cacheEntries.sort((a, b) => a.searchedAt - b.searchedAt);
      const currentEntryExists = cacheEntries.some((item) => item.key === key);
      while (
        !currentEntryExists &&
        cacheEntries.length >= maxEntries
      ) {
        const oldest = cacheEntries.shift();
        localStorage.removeItem(oldest.key);
      }
      localStorage.setItem(key, JSON.stringify(entry));
      return { entry, error: null };
    } catch (error) {
      return { entry: null, error };
    }
  }

  window.PantauMarketCache = Object.freeze({ read, write });
})();
