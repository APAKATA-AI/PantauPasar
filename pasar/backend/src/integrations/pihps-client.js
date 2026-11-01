import { PIHPS_BASE_URL } from "./pihps-catalog.js";
import { HttpError } from "../middleware/http-error.js";

const requestTimeoutMs = 20_000;

export function createPihpsClient({
  fetchImpl = fetch,
  pauseMs = 250,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const cache = new Map();
  const metrics = { requests: 0, successes: 0, failures: 0, in_flight: 0, last_success_at: null, last_error_code: null };
  let cooldownUntil = 0;

  async function getData(endpoint, params = {}) {
    if (cooldownUntil > Date.now() || metrics.in_flight >= 6) {
      const error = new HttpError(503, "PIHPS_RATE_LIMITED", "Sumber PIHPS sedang membatasi permintaan. Coba lagi beberapa saat.");
      error.retryAfter = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
      throw error;
    }
    metrics.requests++;
    metrics.in_flight++;
    try {
    const url = new URL(endpoint, PIHPS_BASE_URL);
    url.search = new URLSearchParams(params);
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (response.status === 429) {
      const retry = Number(response.headers?.get?.("retry-after"));
      cooldownUntil = Date.now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 300) : 60) * 1000;
      const error = new HttpError(503, "PIHPS_RATE_LIMITED", "Sumber PIHPS sedang membatasi permintaan. Coba lagi beberapa saat.");
      error.retryAfter = Math.ceil((cooldownUntil - Date.now()) / 1000);
      throw error;
    }
    if (!response.ok)
      throw new Error(
        `PIHPS ${endpoint} gagal dengan HTTP ${response.status}.`,
      );

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`Respons PIHPS ${endpoint} bukan JSON yang valid.`, {
        cause: error,
      });
    }
    if (!payload || !Array.isArray(payload.data))
      throw new Error(`Format respons PIHPS ${endpoint} tidak dikenali.`);
    metrics.successes++;
    metrics.last_success_at = new Date().toISOString();
    metrics.last_error_code = null;
    return payload.data;
    } catch (error) {
      metrics.failures++;
      metrics.last_error_code = error.code === "PIHPS_RATE_LIMITED" ? error.code : "PIHPS_UNAVAILABLE";
      throw error;
    } finally { metrics.in_flight--; }
  }

  function getCachedData(key, endpoint, params = {}, refresh = false) {
    const now = Date.now();
    const cached = cache.get(key);
    if (!refresh && cached && cached.expiresAt > now) return cached.promise;
    for (const [entryKey, entry] of cache) if (entry.expiresAt <= now) cache.delete(entryKey);
    while (cache.size >= 400) cache.delete(cache.keys().next().value);

    const promise = getData(endpoint, params).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, { expiresAt: now + 5 * 60_000, promise });
    return promise;
  }

  return Object.freeze({
    status() {
      return { ...metrics, configured: true, verification: metrics.last_error_code ? "error" : metrics.successes ? "verified" : "not_verified",
        cooldown_until: cooldownUntil > Date.now() ? new Date(cooldownUntil).toISOString() : null,
        cached_requests: cache.size };
    },
    getProvinces() {
      return getCachedData("provinces", "GetRefProvince");
    },
    getCities(provinceId) {
      return getCachedData(`cities:${provinceId}`, "GetRefRegency", {
        price_type_id: "1",
        ref_prov_id: String(provinceId),
      });
    },
    getCommodityCatalog() {
      return getCachedData("commodity-catalog", "GetRefCommodityAndCategory");
    },
    getPriceGrid(params, { refresh = false } = {}) {
      return getCachedData(`price-grid:${JSON.stringify(params)}`, "GetGridDataDaerah", {
        price_type_id: "1",
        comcat_id: "",
        province_id: String(params.provinceId),
        regency_id: String(params.cityId),
        market_id: "",
        tipe_laporan: "1",
        start_date: params.startDate,
        end_date: params.endDate,
      }, refresh);
    },
    pause() {
      return sleep(pauseMs);
    },
  });
}
