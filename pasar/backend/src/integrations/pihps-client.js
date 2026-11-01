import { PIHPS_BASE_URL } from "./pihps-catalog.js";

const requestTimeoutMs = 20_000;

export function createPihpsClient({
  fetchImpl = fetch,
  pauseMs = 250,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  const cache = new Map();

  async function getData(endpoint, params = {}) {
    const url = new URL(endpoint, PIHPS_BASE_URL);
    url.search = new URLSearchParams(params);
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
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
    return payload.data;
  }

  function getCachedData(key, endpoint, params = {}) {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return cached.promise;

    const promise = getData(endpoint, params).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, { expiresAt: now + 5 * 60_000, promise });
    return promise;
  }

  return Object.freeze({
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
    getPriceGrid(params) {
      return getCachedData(`price-grid:${JSON.stringify(params)}`, "GetGridDataDaerah", {
        price_type_id: "1",
        comcat_id: "",
        province_id: String(params.provinceId),
        regency_id: String(params.cityId),
        market_id: "",
        tipe_laporan: "1",
        start_date: params.startDate,
        end_date: params.endDate,
      });
    },
    pause() {
      return sleep(pauseMs);
    },
  });
}
