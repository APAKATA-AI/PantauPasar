import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { advisorController } from "../controllers/advisor-controller.js";
import { calculatorController } from "../controllers/calculator-controller.js";
import { createMarketController } from "../controllers/market-controller.js";
import { simulationController } from "../controllers/simulation-controller.js";
import { createMarketRepository } from "../repositories/market-repository.js";
import { createPihpsClient } from "../integrations/pihps-client.js";
import { resolvePihpsCommodity } from "../integrations/vleee-market-search.js";
import { createVleeeWebMarketSearch } from "../integrations/vleee-web-market-search.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { createMarketService } from "../services/market-service.js";
import { createPihpsImportService } from "../services/pihps-import-service.js";
import { createSharedMarketCache } from "../services/shared-market-cache.js";
import { getProviderStatus } from "../integrations/provider-runtime.js";
import { requiredText } from "../middleware/validate.js";
import { HttpError } from "../middleware/http-error.js";

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve()
    .then(() => handler(req, res, next))
    .catch(next);

export function createApiRouter({
  pool,
  databaseConfigured,
  databaseEnabled = databaseConfigured,
}) {
  const router = Router();
  const marketRepository = pool ? createMarketRepository(pool) : null;
  const pihpsClient = createPihpsClient();
  const pihpsImportService = createPihpsImportService({
    client: pihpsClient,
    repository: marketRepository,
    resolveCommodity: resolvePihpsCommodity,
  });
  const marketService = createMarketService(
    marketRepository,
    pihpsImportService,
    createVleeeWebMarketSearch(),
  );
  const cache = createSharedMarketCache({
    filePath: process.env.MARKET_CACHE_FILE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/market-cache.json"),
  });
  const marketController = createMarketController(marketService, { cache });
  const marketRateLimit = createRateLimit({ limit: 20, windowMs: 60_000 });
  const suggestionRateLimit = createRateLimit({ limit: 90, windowMs: 60_000 });
  const advisorRateLimit = createRateLimit({ limit: 10, windowMs: 60_000 });

  router.get(
    "/health",
    asyncRoute(async (_req, res) => {
      let database = databaseEnabled ? "not_configured" : "disabled";
      if (databaseConfigured) {
        try {
          await pool.query({ text: "SELECT 1", query_timeout: 2000 });
          database = "connected";
        } catch {
          database = "unavailable";
        }
      }
      const providers = { ...getProviderStatus(), pihps: pihpsClient.status() };
      const freeConfigured = false;
      res.json({
        status: ["unavailable", "not_configured"].includes(database) || Object.values(providers).some((provider) => provider.verification === "error") ? "degraded" : "ok",
        database,
        vleee: process.env.VLEEE_API_KEY ? "configured" : "not_configured",
        web_search: "unavailable",
        providers,
        capabilities: {
          catalog_search: providers.pihps.verification === "error" ? "unavailable" : "available",
          free_search: "unavailable",
          advisor: providers.vleee.configured ? "configured" : "not_configured",
        },
        shared_cache: await cache.status(),
      });
    }),
  );
  router.get("/market/regions", suggestionRateLimit, asyncRoute(async (req, res) => {
    try {
      const provinces = await pihpsClient.getProvinces();
      const safeProvinces = provinces.filter((item) => typeof item.name === "string" && item.name.trim())
        .map((item) => ({ id: String(item.id), name: item.name }));
      if (!req.query.provinsi) return res.json({ provinces: safeProvinces, source: "PIHPS" });
      const name = requiredText(req.query.provinsi, "Provinsi", 100);
      const province = safeProvinces.find((item) => item.name.toLocaleLowerCase("id-ID") === name.toLocaleLowerCase("id-ID"));
      if (!province) throw new HttpError(404, "LOCATION_NOT_FOUND", "Provinsi belum dikenali oleh sumber PIHPS.");
      const cities = (await pihpsClient.getCities(province.id))
        .filter((item) => typeof item.name === "string" && item.name.trim())
        .map((item) => ({ id: String(item.id), name: item.name }));
      res.json({ province: province.name, cities, source: "PIHPS" });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(502, "PIHPS_UNAVAILABLE", "Daftar wilayah PIHPS belum dapat dimuat. Coba lagi beberapa saat.");
    }
  }));
  router.get(
    "/market/products",
    suggestionRateLimit,
    asyncRoute((req, res) => marketController.searchProducts(req, res)),
  );
  router.get("/market", marketRateLimit, asyncRoute(marketController.getMarket));
  router.post(
    "/simulate",
    asyncRoute((req, res) => simulationController.simulate(req, res)),
  );
  router.post(
    "/calculator",
    asyncRoute((req, res) => calculatorController.calculate(req, res)),
  );
  router.post("/advisor", advisorRateLimit, asyncRoute(advisorController.ask));
  return router;
}
