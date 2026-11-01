import { requiredText } from "../middleware/validate.js";

export function createActivityController(repository) {
  return {
    async list(req, res) {
      const items = await repository.list(res.locals.sessionId, 20);
      res.json({ items });
    },

    async add(req, res) {
      const body = req.body || {};
      const item = await repository.add(res.locals.sessionId, {
        province: requiredText(body.province, "Provinsi", 100),
        city: requiredText(body.city, "Kota/kabupaten", 100),
        product: requiredText(body.product, "Produk", 120),
      });
      res.status(201).json(item);
    },
  };
}
