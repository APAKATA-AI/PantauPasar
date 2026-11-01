const knownPaths = new Set(["/api/market", "/api/market/products", "/api/advisor", "/api/health", "/api/activity", "/api/calculator", "/api/simulate"]);

function describeRequest(req) {
  if (req.path === "/api/market") return "pencarian harga";
  if (req.path === "/api/market/products")
    return "saran produk";
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
        `[${new Date().toISOString()}] ${level} ${["GET", "POST", "HEAD", "OPTIONS"].includes(req.method) ? req.method : "OTHER"} ${knownPaths.has(req.path) ? req.path : "/api/unknown"} -> ${status} (${duration} ms) | ${describeRequest(req)}`,
      );
    });
    next();
  };
}
