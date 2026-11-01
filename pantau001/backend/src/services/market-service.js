import { HttpError } from "../middleware/http-error.js";
import {
  marketLabelForSourceCommodity,
  matchPihpsCommodities,
  sourceCommodityForMarketLabel,
} from "../integrations/pihps-catalog.js";

const asNumber = (value) => Number(value);
const dateDay = (value) => Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString().slice(0, 10) : null;

function aggregateMarket({ product, province, city, observations, regions, aiAssisted }) {
  const rejectedCount = observations.filter((item) => !validObservation(item)).length;
  observations = observations.filter(validObservation);
  if (!observations.length)
    throw new HttpError(
      404,
      "MARKET_DATA_UNAVAILABLE",
      "PIHPS belum memiliki pembacaan harga untuk produk dan wilayah tersebut.",
    );

  const units = new Set(observations.map((item) => item.unit));
  if (units.size !== 1)
    throw new HttpError(
      409,
      "INCONSISTENT_UNITS",
      "Data harga memiliki satuan yang berbeda dan belum dapat dibandingkan.",
    );

  const latestDay = observations.map((item) => new Date(item.observed_at).toISOString().slice(0, 10)).sort().at(-1);
  const latest = observations.filter((item) => new Date(item.observed_at).toISOString().startsWith(latestDay));
  const prices = latest.map((item) => asNumber(item.price));
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const daily = new Map();
  const sourceMap = new Map();
  for (const item of observations) {
    const date = new Date(item.observed_at);
    const day = date.toISOString().slice(0, 10);
    const dayValues = daily.get(day) || [];
    dayValues.push(asNumber(item.price));
    daily.set(day, dayValues);

    const key = `${item.source_name}\u0000${item.source_url || ""}`;
    const source = sourceMap.get(key);
    if (!source || date > new Date(source.tanggal))
      sourceMap.set(key, {
        nama: item.source_name,
        url: item.source_url,
        tanggal: date.toISOString(),
        harga: asNumber(item.price),
        komoditas: item.commodity,
      });
  }

  const confidenceScores = latest
    .filter((item) => item.confidence_score != null)
    .map((item) => Number(item.confidence_score))
    .filter(Number.isFinite);
  return {
    produk: marketLabelForSourceCommodity(product),
    kategori: null,
    provinsi: province,
    kota: city,
    harga_rata_rata: Math.round(average),
    harga_terendah: Math.min(...prices),
    harga_tertinggi: Math.max(...prices),
    satuan: units.values().next().value,
    confidence_score: confidenceScores.length
      ? Math.round(
          confidenceScores.reduce((sum, score) => sum + score, 0) /
            confidenceScores.length,
        )
      : null,
    tren_7_hari_terakhir: [...daily]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([tanggal, values]) => ({
        tanggal: new Date(`${tanggal}T00:00:00.000Z`).toISOString(),
        harga: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      })),
    perbandingan_wilayah: regions.filter((item) => Number.isFinite(asNumber(item.average_price)) && asNumber(item.average_price) > 0 &&
      item.observed_at && dateDay(item.observed_at) === latestDay).map((item) => ({
      kota: item.city,
      harga: Math.round(asNumber(item.average_price)),
      tanggal: new Date(item.observed_at).toISOString(),
      satuan: units.values().next().value,
    })),
    daftar_sumber: [...sourceMap.values()],
    updated_at: new Date(
      Math.max(...observations.map((item) => new Date(item.observed_at).getTime())),
    ).toISOString(),
    ai_assisted: Boolean(aiAssisted),
    market_type: "pihps",
    price_basis: "latest_observation_date",
    observation_count: latest.length,
    rejected_observations: rejectedCount,
    coverage: {
      observed_days: daily.size,
      comparison_available: regions.some((item) => item.observed_at && dateDay(item.observed_at) === latestDay),
      note: "Harga utama memakai tanggal pembacaan terbaru yang tersedia. Wilayah tanpa pembacaan pada tanggal yang sama tidak dibandingkan.",
    },
    demo: false,
  };
}

function validObservation(item) {
  const value = Number(item?.price);
  const date = new Date(item?.observed_at);
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(date.getTime()) ||
      !item.source_name || !item.unit?.trim() || (item.currency && item.currency !== "IDR")) return false;
  try { return new URL(item.source_url).protocol === "https:"; } catch { return false; }
}

export function createMarketService(repository, pihpsImportService, searchWebMarket) {
  return {
    async searchProducts(query) {
      if (pihpsImportService)
        try {
          return await pihpsImportService.searchProducts(query);
        } catch (error) {
          throw new HttpError(
            502,
            "PIHPS_UNAVAILABLE",
            "Katalog PIHPS belum dapat dicari. Coba lagi beberapa saat.",
          );
        }
      return matchPihpsCommodities(query).map(({ marketLabel }) => ({
        label: marketLabel,
      }));
    },

    async getMarket({ product, province, city, refresh = false }) {
      if (pihpsImportService?.fetchProduct) {
        let result;
        try {
          result = await pihpsImportService.fetchProduct({
            product,
            province,
            city,
            ...(refresh ? { refresh: true } : {}),
          });
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(
            502,
            "PIHPS_UNAVAILABLE",
            "Sumber harga PIHPS belum dapat dihubungi. Coba lagi beberapa saat.",
          );
        }
        if (!result.commodity) {
          if (searchWebMarket)
            return searchWebMarket({ product, province, city, ...(refresh ? { refresh: true } : {}) });
          throw new HttpError(
            404,
            "PRODUCT_NOT_FOUND",
            "Komoditas tidak ditemukan pada katalog resmi PIHPS.",
          );
        }

        if (!result.observations.length && searchWebMarket)
          return searchWebMarket({ product, province, city, ...(refresh ? { refresh: true } : {}) });

        let regions = [];
        if (repository?.findRegionalAverages)
          try {
            regions = await repository.findRegionalAverages({
              product: result.commodity.name,
              province,
              unit: result.commodity.denomination.trim(),
            });
          } catch (error) {
            console.error("Regional comparison is unavailable.");
          }
        return aggregateMarket({
          product: result.commodity.name,
          province,
          city,
          observations: result.observations,
          regions,
          aiAssisted: result.ai_assisted,
        });
      }

      let commodity = sourceCommodityForMarketLabel(product);
      let observations = [];
      const importFromPihps = async () => {
        let result;
        try {
          result = await pihpsImportService.importProduct({
            product,
            province,
            city,
          });
        } catch (error) {
          throw new HttpError(
            502,
            "PIHPS_UNAVAILABLE",
            "Data belum tersedia dan PIHPS belum dapat dihubungi. Coba lagi beberapa saat.",
          );
        }
        if (!result.commodity)
          throw new HttpError(
            404,
            "PRODUCT_NOT_FOUND",
            "Komoditas tidak ditemukan pada katalog resmi PIHPS.",
          );
        commodity = result.commodity.name;
      };

      if (!commodity) {
        if (!pihpsImportService)
          throw new HttpError(
            404,
            "PRODUCT_NOT_FOUND",
            "Produk belum terdaftar pada katalog komoditas yang tersedia.",
          );
        await importFromPihps();
        observations = await repository.findObservations({
          product: commodity,
          province,
          city,
        });
      } else {
        observations = await repository.findObservations({
          product: commodity,
          province,
          city,
        });
        if (!observations.length && pihpsImportService) {
          await importFromPihps();
          observations = await repository.findObservations({
            product: commodity,
            province,
            city,
          });
        }
      }
      const regions = repository?.findRegionalAverages
        ? await repository.findRegionalAverages({
            product: commodity,
            province,
            unit: observations[0]?.unit,
          })
        : [];
      return aggregateMarket({
        product: commodity,
        province,
        city,
        observations,
        regions,
        aiAssisted: false,
      });
    },
  };
}
