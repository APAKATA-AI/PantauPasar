import { HttpError } from "./http-error.js";

export function createRateLimit({ limit = 20, windowMs = 60_000, maxClients = 5000, clock = Date.now } = {}) {
  const requests = new Map();
  let lastCleanup = 0;

  return (req, res, next) => {
    const now = clock();
    if (now - lastCleanup > windowMs) {
      for (const [key, timestamps] of requests)
        if (!timestamps.length || timestamps.at(-1) <= now - windowMs)
          requests.delete(key);
      lastCleanup = now;
    }

    const key = req.ip || req.socket?.remoteAddress || "unknown";
    if (!requests.has(key) && requests.size >= maxClients) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return next(new HttpError(429, "RATE_LIMITED", "Layanan sedang sibuk. Tunggu sebentar lalu coba lagi."));
    }
    const recent = (requests.get(key) || []).filter(
      (timestamp) => timestamp > now - windowMs,
    );
    res.set("RateLimit-Limit", String(limit));
    res.set("RateLimit-Remaining", String(Math.max(0, limit - recent.length - 1)));
    if (recent.length >= limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((recent[0] + windowMs - now) / 1000),
      );
      res.set("Retry-After", String(retryAfter));
      return next(
        new HttpError(
          429,
          "RATE_LIMITED",
          "Pencarian terlalu sering. Tunggu sebentar lalu coba lagi.",
        ),
      );
    }
    recent.push(now);
    requests.set(key, recent);
    return next();
  };
}
