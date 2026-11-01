const safeText = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

function describeRequest(req) {
  const query = req.query || {};
  if (req.path === "/api/market") {
    const product = safeText(query.produk);
    const city = safeText(query.kota);
    const province = safeText(query.provinsi);
    return product && city && province
      ? `cari harga: ${product} (${city}, ${province})`
      : "pencarian harga";
  }
  if (req.path === "/api/market/products")
    return `saran produk: ${safeText(query.q) || "tanpa kata kunci"}`;
  if (req.path === "/api/advisor") return "permintaan AI Advisor";
  if (req.path.startsWith("/api/activity")) return "aktivitas riwayat";
  if (req.path === "/api/health") return "cek kesehatan server";
  return "request API";
}

export function createRequestLogger({ log = console.log, clock = Date.now } = {}) {
  return (req, res, next) => {
    if (!req.path.startsWith("/api/") && req.path !== "/api")
      return next();

    const startedAt = clock();
    res.once("finish", () => {
      const duration = Math.max(0, Math.round(clock() - startedAt));
      const status = res.statusCode;
      const level = status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";
      log(
        `[${new Date().toISOString()}] ${level} ${req.method} ${req.path} -> ${status} (${duration} ms) | ${describeRequest(req)}`,
      );
    });
    next();
  };
}
