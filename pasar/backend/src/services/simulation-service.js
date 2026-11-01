import { HttpError } from "../middleware/http-error.js";
import { requiredNumber } from "../middleware/validate.js";

export function simulateCosts(input) {
  const materials = requiredNumber(input.bahan_baku, "Biaya bahan baku");
  const quantity = requiredNumber(input.jumlah_produk, "Jumlah produk", {
    min: 1,
    max: 100_000,
  });
  const salePrice = requiredNumber(input.harga_jual, "Harga jual");
  const rawIncrease = requiredNumber(input.kenaikan_bahan, "Kenaikan bahan", {
    max: 100,
  });
  const operationalIncrease = requiredNumber(
    input.kenaikan_operasional,
    "Kenaikan operasional",
    { max: 100 },
  );
  const operatingCost = requiredNumber(input.operasional, "Biaya operasional");
  if (
    !Number.isInteger(quantity) ||
    quantity > 100_000
  )
    throw new HttpError(400, "INVALID_INPUT", "Nilai simulasi di luar rentang yang diizinkan.");

  const materialPerProduct = materials / quantity;
  const operationalPerProduct = operatingCost / quantity;
  const before = salePrice - materialPerProduct - operationalPerProduct;
  const after =
    salePrice -
    materialPerProduct * (1 + rawIncrease / 100) -
    operationalPerProduct * (1 + operationalIncrease / 100);
  return {
    untung_sebelum: before,
    untung_sesudah: after,
    ringkasan: `Simulasi menunjukkan untung per produk berubah dari Rp${Math.round(before).toLocaleString("id-ID")} menjadi Rp${Math.round(after).toLocaleString("id-ID")}. Ini bukan prediksi harga.`,
  };
}
