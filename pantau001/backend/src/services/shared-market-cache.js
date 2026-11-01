import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const normalize = (value) => String(value).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
const cacheKey = ({ product, province, city }) => createHash("sha256")
  .update(JSON.stringify([product, province, city].map(normalize))).digest("hex");
const iso = (value) => new Date(value).toISOString();
const clone = (value) => structuredClone(value);

function validResult(value) {
  return value && typeof value === "object" && !value.demo &&
    Number.isFinite(value.harga_rata_rata) && value.harga_rata_rata > 0 &&
    typeof value.satuan === "string" && value.satuan.trim() &&
    Array.isArray(value.daftar_sumber) && value.daftar_sumber.length > 0;
}

export function createSharedMarketCache({
  filePath = null,
  clock = Date.now,
  maxEntries = 200,
  maxFileBytes = 8 * 1024 * 1024,
  officialTtlMs = 60 * 60_000,
  webTtlMs = 15 * 60_000,
  officialStaleMs = 7 * 24 * 60 * 60_000,
  webStaleMs = 24 * 60 * 60_000,
} = {}) {
  const entries = new Map();
  const inFlight = new Map();
  const counters = { hits: 0, misses: 0, stale: 0, refresh_failures: 0, coalesced: 0 };
  let storage = filePath ? "pending" : "memory";
  let persistence = Promise.resolve();
  const ready = (async () => {
    if (!filePath) return;
    try {
      const info = await stat(filePath);
      if (info.size > maxFileBytes) throw new Error("CACHE_TOO_LARGE");
      const document = JSON.parse(await readFile(filePath, "utf8"));
      if (document.version !== 1 || !Array.isArray(document.entries)) throw new Error("CACHE_INVALID");
      for (const [key, entry] of document.entries.slice(-maxEntries)) {
        if (/^[a-f0-9]{64}$/.test(key) && validResult(entry?.data) &&
          Number.isFinite(entry.fetchedAt) && Number.isFinite(entry.expiresAt) &&
          Number.isFinite(entry.staleUntil) && entry.fetchedAt <= clock() &&
          entry.expiresAt >= entry.fetchedAt && entry.staleUntil > clock() &&
          entry.staleUntil - entry.fetchedAt <= Math.max(officialTtlMs + officialStaleMs, webTtlMs + webStaleMs))
          entries.set(key, entry);
      }
      storage = "persistent";
    } catch (error) {
      storage = error.code === "ENOENT" ? "persistent" : "memory_fallback";
    }
  })();

  function prune() {
    for (const [key, entry] of entries) if (entry.staleUntil <= clock()) entries.delete(key);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }

  function persist() {
    if (!filePath) return Promise.resolve();
    persistence = persistence.then(async () => {
      prune();
      let document = JSON.stringify({ version: 1, entries: [...entries] });
      while (Buffer.byteLength(document) > maxFileBytes && entries.size) {
        entries.delete(entries.keys().next().value);
        document = JSON.stringify({ version: 1, entries: [...entries] });
      }
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      try {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(temporary, document, { encoding: "utf8", mode: 0o600 });
        await rename(temporary, filePath);
        storage = "persistent";
      } catch {
        storage = "memory_fallback";
        await unlink(temporary).catch(() => {});
      }
    });
    return persistence;
  }

  function response(entry, { hit = true, error = null } = {}) {
    const stale = Boolean(error) || entry.expiresAt <= clock();
    return {
      ...clone(entry.data),
      searched_at: entry.data.searched_at || iso(entry.fetchedAt),
      cache: {
        scope: "server",
        status: stale ? "stale" : "fresh",
        hit,
        fetched_at: iso(entry.fetchedAt),
        expires_at: iso(entry.expiresAt),
        stale_until: iso(entry.staleUntil),
        refresh_error: error ? {
          code: /^[A-Z_]{2,80}$/.test(error.code) ? error.code : "REFRESH_FAILED",
          message: "Pembaruan gagal. Harga tersimpan ditampilkan; periksa tanggal sumber sebelum digunakan.",
        } : null,
      },
    };
  }

  return {
    async getOrLoad(query, loader, { refresh = false } = {}) {
      await ready;
      prune();
      const key = cacheKey(query);
      const existing = entries.get(key);
      if (existing && existing.expiresAt > clock() && !refresh) {
        counters.hits++;
        entries.delete(key);
        entries.set(key, existing);
        return response(existing);
      }
      if (inFlight.has(key)) {
        counters.coalesced++;
        return clone(await inFlight.get(key));
      }
      counters.misses++;
      const pending = (async () => {
        try {
          const data = await loader();
          if (!validResult(data)) return data;
          const fetchedAt = clock();
          const web = data.market_type === "web_offers";
          const ttl = web ? webTtlMs : officialTtlMs;
          const entry = {
            data: clone(data), fetchedAt, expiresAt: fetchedAt + ttl,
            staleUntil: fetchedAt + ttl + (web ? webStaleMs : officialStaleMs),
          };
          delete entry.data.cache;
          entries.delete(key);
          entries.set(key, entry);
          await persist();
          return response(entry, { hit: false });
        } catch (error) {
          counters.refresh_failures++;
          const eligible = !error.status || error.status >= 500 || [404, 429].includes(error.status);
          if (existing && existing.staleUntil > clock() && eligible) {
            counters.stale++;
            return response(existing, { error });
          }
          throw error;
        } finally {
          inFlight.delete(key);
        }
      })();
      inFlight.set(key, pending);
      return clone(await pending);
    },
    async status() {
      await ready;
      prune();
      return { scope: "server", storage, entries: entries.size, max_entries: maxEntries,
        in_flight: inFlight.size, ...counters, official_ttl_seconds: officialTtlMs / 1000,
        web_ttl_seconds: webTtlMs / 1000, deployment: "single_process" };
    },
    async flush() { await ready; await persistence; },
  };
}
