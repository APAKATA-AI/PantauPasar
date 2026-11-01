import { HttpError } from "../middleware/http-error.js";
import { requiredNumber } from "../middleware/validate.js";

export function calculateBusiness({ ingredients, quantity, salePrice, operatingCost = 0 }) {
  if (!Array.isArray(ingredients) || ingredients.length === 0 || ingredients.length > 100)
    throw new HttpError(400, "INVALID_INPUT", "Isi 1 sampai 100 bahan baku.");

  const materialCost = ingredients.reduce(
    (sum, ingredient, index) =>
      sum + requiredNumber(ingredient?.cost, `Biaya bahan ${index + 1}`),
    0,
  );
  const unitCount = Number(quantity);
  const unitSalePrice = Number(salePrice);
  const operations = Number(operatingCost);
  if (!Number.isInteger(unitCount) || unitCount < 1 || unitCount > 100_000)
    throw new HttpError(400, "INVALID_INPUT", "Jumlah produk harus 1 sampai 100.000.");
  if (![unitSalePrice, operations].every(Number.isFinite) || unitSalePrice < 0 || operations < 0)
    throw new HttpError(400, "INVALID_INPUT", "Harga jual dan biaya operasional tidak valid.");

  const totalCost = materialCost + operations;
  const revenue = unitSalePrice * unitCount;
  const profit = revenue - totalCost;
  return {
    quantity: unitCount,
    revenue,
    total_cost: totalCost,
    profit,
    profit_per_product: profit / unitCount,
    margin_percent: revenue ? (profit / revenue) * 100 : 0,
  };
}
