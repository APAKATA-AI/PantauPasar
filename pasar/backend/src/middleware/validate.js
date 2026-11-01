import { HttpError } from "./http-error.js";

export function requiredText(value, field, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength)
    throw new HttpError(
      400,
      "INVALID_INPUT",
      `${field} wajib diisi dan maksimal ${maxLength} karakter.`,
    );
  return value.trim();
}

export function requiredNumber(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const isNumericInput =
    typeof value === "number" ||
    (typeof value === "string" && value.trim().length > 0);
  const parsed = isNumericInput ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max)
    throw new HttpError(400, "INVALID_INPUT", `${field} di luar rentang yang diizinkan.`);
  return parsed;
}

export function sessionId(req, res, next) {
  const value = req.get("X-Session-Id");
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return next(
      new HttpError(
        400,
        "INVALID_SESSION",
        "Sesi anonim tidak valid. Muat ulang aplikasi lalu coba lagi.",
      ),
    );
  res.locals.sessionId = value;
  return next();
}
