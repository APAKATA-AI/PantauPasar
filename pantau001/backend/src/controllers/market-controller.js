import { requiredText } from "../middleware/validate.js";
import { parseVleeeMarketQuery } from "../integrations/vleee-market-search.js";
import { HttpError } from "../middleware/http-error.js";

export function createMarketController(
  service,
  { parseQuery = parseVleeeMarketQuery, cache } = {},
) {
  return {
    async searchProducts(req, res) {
      const query = requiredText(req.query.q, "Kata pencarian", 120);
      res.json({ items: await service.searchProducts(query) });
    },

    async getMarket(req, res) {
      const input = {
        province: requiredText(req.query.provinsi, "Provinsi", 100),
        city: requiredText(req.query.kota, "Kota/kabupaten", 100),
        product: requiredText(req.query.produk, "Produk", 120),
      };
      if (req.query.refresh !== undefined && !["0", "1"].includes(req.query.refresh))
        throw new HttpError(400, "INVALID_INPUT", "Parameter pembaruan harus 0 atau 1.");
      const compareText = req.query.bandingkan === undefined ? "" : requiredText(req.query.bandingkan, "Kota pembanding", 210);
      const compareCities = [...new Set(compareText.split(";").map(value => value.trim()).filter(Boolean))];
      if (compareCities.length > 2) throw new HttpError(400, "INVALID_INPUT", "Pilih maksimal dua kota pembanding.");
      const load = async () => {
      const parsed = await parseQuery(input);
      const query = {
        product: parsed?.product || input.product,
        province: parsed?.locations?.[0]?.province || input.province,
        city: parsed?.locations?.[0]?.city || input.city,
      };
      const locations = compareCities.length ? [{ province: query.province, city: query.city }, ...compareCities.filter(city => city.toLowerCase() !== query.city.toLowerCase()).map(city => ({ province: query.province, city }))] : parsed?.locations || [
        { province: query.province, city: query.city },
      ];
      const outcomes = await Promise.allSettled(
        locations.map((location) =>
          service.getMarket({
            product: query.product,
            province: location.province,
            city: location.city,
            ...(req.query.refresh === "1" ? { refresh: true } : {}),
          }),
        ),
      );
      const available = outcomes.flatMap((outcome, index) => outcome.status === "fulfilled"
        ? [{ result: outcome.value, location: locations[index] }] : []);
      if (!available.length) throw outcomes[0].reason;
      const results = available.map(({ result }) => result);
      const unavailable = outcomes.flatMap((outcome, index) => outcome.status === "rejected"
        ? [{ ...locations[index], code: /^[A-Z_]{2,80}$/.test(outcome.reason?.code)
          ? outcome.reason.code : "MARKET_DATA_UNAVAILABLE",
          message: "Harga untuk lokasi ini belum tersedia." }] : []);
      const primary = results[0];
      if (results.length > 1) {
        if (results.some((result) => result.market_type !== primary.market_type))
          throw new HttpError(
            409,
            "INCONSISTENT_MARKET_SOURCES",
            "Lokasi memiliki jenis sumber harga berbeda dan belum dapat dibandingkan.",
          );
        if (results.some((result) => result.satuan !== primary.satuan))
          throw new HttpError(
            409,
            "INCONSISTENT_UNITS",
            "Lokasi memiliki satuan harga berbeda dan belum dapat dibandingkan.",
          );
      }

      const comparison = results.map((result, index) => ({
        kota: available[index].location.city,
        harga: result.harga_rata_rata,
        provinsi: available[index].location.province,
        tanggal: result.updated_at,
        satuan: result.satuan,
      }));
      const sources = [
        ...new Map(
          results
            .flatMap((result) => result.daftar_sumber)
            .map((source) => [
              `${source.url}\u0000${source.harga}\u0000${source.tanggal}`,
              source,
            ]),
        ).values(),
      ];
      const offers = results.flatMap((result, index) =>
        (result.offer_list || []).map((offer) => ({
          ...offer,
          requested_city: available[index].location.city,
          requested_province: available[index].location.province,
        })),
      );
      return {
        ...primary,
        produk: primary.produk || query.product,
        provinsi: available[0].location.province,
        kota: available[0].location.city,
        perbandingan_wilayah:
          primary.market_type === "web_offers" ? [] : locations.length > 1 ? comparison : primary.perbandingan_wilayah,
        daftar_sumber: results.length > 1 ? sources : primary.daftar_sumber,
        offer_list: results.length > 1 ? offers : primary.offer_list,
        comparison: locations.length > 1,
        completeness: unavailable.length ? "partial" : "complete",
        unavailable_locations: unavailable,
        resolved_query: {
          ...query,
          search_text: input.product,
          comparison_locations: locations,
        },
      };
      };
      const result = cache
        ? await cache.getOrLoad({ ...input, product: JSON.stringify(["history-v2", input.product, compareCities]) }, load, { refresh: req.query.refresh === "1" })
        : await load();
      res.set?.("Cache-Control", "no-store");
      res.json(result);
    },
  };
}
