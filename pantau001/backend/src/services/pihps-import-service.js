import {
  PIHPS_COMMODITIES,
  PIHPS_REGIONS,
  PIHPS_BASE_URL,
  marketLabelForSourceCommodity,
  matchPihpsCommodities,
  searchPihpsCatalog,
} from "../integrations/pihps-catalog.js";
import { HttpError } from "../middleware/http-error.js";

const normalize = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/\([^)]*\)/g, "")
    .replace(/^(kota|kabupaten|kab\.?)\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function isValidDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parsePihpsPrice(value) {
  if (typeof value === "number")
    return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(normalized))
    return null;
  const price = Number(normalized.replaceAll(",", ""));
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function parsePihpsDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (!isValidDate(year, month, day)) return null;
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function jakartaDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function resolveCity(cities, name) {
  const exact = cities.find((city) => city.name.toLocaleLowerCase("id-ID") === String(name).trim().toLocaleLowerCase("id-ID"));
  if (exact) return exact;
  const expected = normalize(name);
  const candidates = cities.filter((city) => normalize(city.name) === expected);
  const cityType = (value) => /^kota\s/i.test(value) ? "city" : /^(kabupaten|kab\.?)\s/i.test(value) ? "regency" : null;
  if (cityType(name)) return candidates.find((city) => cityType(city.name) === cityType(name));
  if (candidates.length === 1) return candidates[0];
  return (
    candidates.find((city) =>
      city.name.toLocaleLowerCase("id-ID").startsWith("kota "),
    ) || candidates[0]
  );
}

const nonProductWords = new Set([
  "ada",
  "apa",
  "barang",
  "berapa",
  "beli",
  "cari",
  "cek",
  "dan",
  "di",
  "dong",
  "harga",
  "ingin",
  "mau",
  "pasar",
  "produk",
  "saja",
  "saya",
  "yang",
]);

function catalogCandidatesForQuery(query, catalog) {
  const queryTokens = normalize(query)
    .split(" ")
    .filter(
      (token) =>
        token.length >= 3 &&
        !nonProductWords.has(token) &&
        !/^\d+$/.test(token),
    );
  if (!queryTokens.length) return [];

  return catalog.filter((item) => {
    if (
      typeof item.id !== "string" ||
      !item.id.startsWith("com_") ||
      typeof item.name !== "string" ||
      typeof item.denomination !== "string" ||
      !item.denomination.trim()
    )
      return false;
    const nameTokens = normalize(item.name).split(" ");
    return queryTokens.some((queryToken) =>
      nameTokens.some(
        (nameToken) =>
          nameToken.startsWith(queryToken) || queryToken.startsWith(nameToken),
      ),
    );
  });
}

function sourceUrl({ provinceId, cityId, startDate, endDate }) {
  const url = new URL("GetGridDataDaerah", PIHPS_BASE_URL);
  url.search = new URLSearchParams({
    price_type_id: "1",
    comcat_id: "",
    province_id: String(provinceId),
    regency_id: String(cityId),
    market_id: "",
    tipe_laporan: "1",
    start_date: startDate,
    end_date: endDate,
  });
  return url.href;
}

export function createPihpsImportService({
  client,
  repository,
  resolveCommodity = async () => null,
  clock = () => new Date(),
}) {
  async function getResolvedCommodity(query) {
    const catalog = await client.getCommodityCatalog();
    const knownSourceName = matchPihpsCommodities(query)[0]?.sourceName;
    const knownCommodity = knownSourceName
      ? catalog.find(
          (item) => normalize(item.name) === normalize(knownSourceName),
        )
      : null;
    const fuzzyCommodity =
      knownCommodity || searchPihpsCatalog(query, catalog, 1)[0] || null;
    const candidateCatalog = fuzzyCommodity
      ? []
      : catalogCandidatesForQuery(query, catalog);
    const aiCommodity = fuzzyCommodity
      ? null
      : candidateCatalog.length
        ? await resolveCommodity({
            query,
            candidates: candidateCatalog,
          })
        : null;
    const suggested = fuzzyCommodity || aiCommodity;
    const commodity = suggested ? catalog.find((item) => item.id === suggested.id && item.name === suggested.name) : null;
    if (!commodity)
      return { catalog, commodity: null, aiAssisted: false };
    if (
      typeof commodity.id !== "string" ||
      !commodity.id.startsWith("com_") ||
      !commodity.denomination?.trim()
    )
      throw new Error(
        `Informasi komoditas PIHPS "${commodity.name}" tidak lengkap.`,
      );
    return { catalog, commodity, aiAssisted: Boolean(aiCommodity) };
  }

  async function getLocation(provinceName, cityName) {
    const provinces = await client.getProvinces();
    const province = provinces.find(
      (item) => normalize(item.name) === normalize(provinceName),
    );
    if (!province) return null;
    const cities = await client.getCities(province.id);
    const city = resolveCity(cities, cityName);
    if (!city) return null;
    return { province, city };
  }

  async function fetchCommodity({
    commodity,
    province,
    city,
    days,
    location: selectedLocation,
    refresh = false,
  }) {
    const location = selectedLocation || await getLocation(province, city);
    if (!location) return { observations: [], commodity };

    const endDate = jakartaDate(clock());
    const startDate = shiftDate(endDate, -(days - 1));
    const gridParams = {
      provinceId: location.province.id,
      cityId: location.city.id,
      startDate,
      endDate,
    };
    const grid = await client.getPriceGrid(gridParams, { refresh });
    const row = grid.find(
      (item) => normalize(item.name) === normalize(commodity.name),
    );
    if (!row) return { observations: [], commodity };

    const observations = Object.entries(row).flatMap(([label, rawPrice]) => {
      const observedAt = parsePihpsDate(label);
      const price = parsePihpsPrice(rawPrice);
      if (!observedAt || price === null || observedAt.slice(0, 10) < startDate || observedAt.slice(0, 10) > endDate) return [];
      return [
        {
          commodity: commodity.name,
          province,
          city,
          price,
          unit: commodity.denomination.trim(),
          currency: "IDR",
          source_name: "Bank Indonesia (PIHPS)",
          source_url: sourceUrl(gridParams),
          observed_at: observedAt,
          confidence_score: null,
        },
      ];
    });
    return {
      observations,
      commodity: {
        ...commodity,
        marketLabel: marketLabelForSourceCommodity(commodity.name),
      },
    };
  }

  async function importCommodity(params) {
    if (!repository)
      throw new Error("PostgreSQL tidak tersedia untuk menyimpan impor.");
    const result = await fetchCommodity(params);
    const stored = await repository.upsertObservations(result.observations);
    return {
      imported: stored,
      commodity: result.commodity,
    };
  }

  return {
    async searchProducts(query) {
      const catalog = await client.getCommodityCatalog();
      const known = matchPihpsCommodities(query)
        .map((item) =>
          catalog.find(
            (source) => normalize(source.name) === normalize(item.sourceName),
          ),
        )
        .filter(Boolean);
      const matches = searchPihpsCatalog(query, catalog);
      const merged = new Map(
        [...known, ...matches].map((item) => [item.name, item]),
      );
      return [...merged.values()].slice(0, 8).map((item) => ({
        label: marketLabelForSourceCommodity(item.name),
        unit: item.denomination.trim(),
      }));
    },

    async importProduct({ product, province, city, days = 30 }) {
      if (!Number.isInteger(days) || days < 1 || days > 90)
        throw new RangeError("Jumlah hari impor harus antara 1 dan 90.");
      const { commodity } = await getResolvedCommodity(product);
      if (!commodity) return { imported: 0, commodity: null };
      return importCommodity({ commodity, province, city, days });
    },

    async fetchProduct({ product, province, city, days = 30, refresh = false }) {
      if (!Number.isInteger(days) || days < 1 || days > 90)
        throw new RangeError("Jumlah hari impor harus antara 1 dan 90.");
      const location = await getLocation(province, city);
      if (!location) throw new HttpError(404, "LOCATION_NOT_FOUND",
        "Wilayah belum dikenali oleh sumber PIHPS. Periksa nama provinsi dan kota/kabupaten.");
      const { commodity, aiAssisted } = await getResolvedCommodity(product);
      if (!commodity) return { observations: [], commodity: null };
      return {
        ...(await fetchCommodity({ commodity, province, city, days, location, refresh })),
        ai_assisted: aiAssisted,
      };
    },

    async importRecent({ days = 30 } = {}) {
      if (!Number.isInteger(days) || days < 1 || days > 90)
        throw new RangeError("Jumlah hari impor harus antara 1 dan 90.");
      if (!repository)
        throw new Error("PostgreSQL tidak tersedia untuk menyimpan impor.");

      const endDate = jakartaDate(clock());
      const startDate = shiftDate(endDate, -(days - 1));
      const [provinces, catalog] = await Promise.all([
        client.getProvinces(),
        client.getCommodityCatalog(),
      ]);
      const resolvedCommodities = PIHPS_COMMODITIES.map((commodity) => {
        const source = catalog.find(
          (item) => normalize(item.name) === normalize(commodity.sourceName),
        );
        if (!source || typeof source.denomination !== "string")
          throw new Error(
            `Komoditas PIHPS "${commodity.sourceName}" tidak ditemukan di katalog resmi.`,
          );
        return { ...commodity, unit: source.denomination.trim() };
      });

      const observations = [];
      const unavailableLocations = [];
      const missingCommodities = [];
      let gridRequests = 0;
      for (const region of PIHPS_REGIONS) {
        const province = provinces.find(
          (item) => normalize(item.name) === normalize(region.province),
        );
        if (!province) {
          for (const city of region.cities)
            unavailableLocations.push(`${city}, ${region.province}`);
          continue;
        }

        const cities = await client.getCities(province.id);
        for (const cityName of region.cities) {
          const city = resolveCity(cities, cityName);
          if (!city) {
            unavailableLocations.push(`${cityName}, ${region.province}`);
            continue;
          }
          if (gridRequests > 0) await client.pause();
          const gridParams = {
            provinceId: province.id,
            cityId: city.id,
            startDate,
            endDate,
          };
          const grid = await client.getPriceGrid(gridParams);
          gridRequests++;
          const url = sourceUrl(gridParams);
          for (const commodity of resolvedCommodities) {
            const row = grid.find(
              (item) => normalize(item.name) === normalize(commodity.sourceName),
            );
            if (!row) {
              missingCommodities.push(
                `${commodity.sourceName} · ${cityName}, ${region.province}`,
              );
              continue;
            }

            for (const [label, rawPrice] of Object.entries(row)) {
              const observedAt = parsePihpsDate(label);
              const price = parsePihpsPrice(rawPrice);
              if (!observedAt || price === null || observedAt.slice(0, 10) < startDate || observedAt.slice(0, 10) > endDate) continue;
              observations.push({
                commodity: commodity.sourceName,
                province: region.province,
                city: cityName,
                price,
                unit: commodity.unit,
                currency: "IDR",
                source_name: "Bank Indonesia (PIHPS)",
                source_url: url,
                observed_at: observedAt,
                confidence_score: null,
              });
            }
          }
        }
      }

      const stored = await repository.upsertObservations(observations);
      return {
        source: "Bank Indonesia (PIHPS)",
        priceType: "Pasar Tradisional",
        startDate,
        endDate,
        observations: observations.length,
        stored,
        locations: [...new Set(observations.map(({ province, city }) => `${city}, ${province}`))],
        unavailableLocations,
        missingCommodities,
      };
    },
  };
}
