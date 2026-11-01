import { HttpError } from "./http-error.js";

export function errorHandler(error, req, res, _next) {
  const status =
    error instanceof HttpError
      ? error.status
      : Number.isInteger(error.status) && error.status >= 400 && error.status < 500
        ? error.status
        : 500;
  const code =
    error instanceof HttpError
      ? error.code
      : status === 400
        ? "INVALID_REQUEST"
        : "INTERNAL_ERROR";
  if (status >= 500) console.error("API request failed", {
    status, code: /^[A-Z_]{2,80}$/.test(code) ? code : "INTERNAL_ERROR",
  });
  if (Number.isFinite(error.retryAfter) && error.retryAfter > 0)
    res.set("Retry-After", String(Math.min(3600, Math.ceil(error.retryAfter))));
  res.status(status).json({
    error: {
      code,
      message:
        status === 500
          ? "Terjadi kesalahan pada server."
          : error instanceof HttpError ? error.message : "Permintaan tidak dapat diproses.",
    },
  });
}
