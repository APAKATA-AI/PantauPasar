import { requiredText } from "../middleware/validate.js";

export function createMarketController(service) {
  return {
    async searchProducts(req, res) {
      const query = requiredText(req.query.q, "Kata pencarian", 120);
      res.json({ items: await service.searchProducts(query) });
    },

    async getMarket(req, res) {
      const query = {
        province: requiredText(req.query.provinsi, "Provinsi", 100),
        city: requiredText(req.query.kota, "Kota/kabupaten", 100),
        product: requiredText(req.query.produk, "Produk", 120),
      };
      res.json(await service.getMarket(query));
    },
  };
}
