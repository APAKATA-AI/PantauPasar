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
  if (status >= 500) console.error("Unhandled request error:", error);
  res.status(status).json({
    error: {
      code,
      message:
        status === 500
          ? "Terjadi kesalahan pada server."
          : error.message,
    },
  });
}
