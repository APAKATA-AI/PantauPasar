import { calculateBusiness } from "../services/calculator-service.js";
import { requiredNumber } from "../middleware/validate.js";

export const calculatorController = {
  calculate(req, res) {
    const body = req.body || {};
    res.json(
      calculateBusiness({
        ingredients: body.ingredients,
        quantity: requiredNumber(body.quantity, "Jumlah produk", {
          min: 1,
          max: 100_000,
        }),
        salePrice: requiredNumber(body.sale_price, "Harga jual"),
        operatingCost:
          body.operating_cost === undefined
            ? 0
            : requiredNumber(body.operating_cost, "Biaya operasional"),
      }),
    );
  },
};
