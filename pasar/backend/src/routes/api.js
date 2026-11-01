import { Router } from "express";
import { createActivityController } from "../controllers/activity-controller.js";
import { advisorController } from "../controllers/advisor-controller.js";
import { calculatorController } from "../controllers/calculator-controller.js";
import { createMarketController } from "../controllers/market-controller.js";
import { simulationController } from "../controllers/simulation-controller.js";
import { createActivityRepository } from "../repositories/activity-repository.js";
import { createMarketRepository } from "../repositories/market-repository.js";
import { createPihpsClient } from "../integrations/pihps-client.js";
import { resolvePihpsCommodity } from "../integrations/gemini-market-search.js";
import { createGeminiWebMarketSearch } from "../integrations/gemini-web-market-search.js";
import { HttpError } from "../middleware/http-error.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { sessionId } from "../middleware/validate.js";
import { createMarketService } from "../services/market-service.js";
import { createPihpsImportService } from "../services/pihps-import-service.js";

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve()
    .then(() => handler(req, res, next))
    .catch(next);

export function createApiRouter({ pool, databaseConfigured }) {
  const router = Router();
  const marketRepository = pool ? createMarketRepository(pool) : null;
  const pihpsImportService = createPihpsImportService({
    client: createPihpsClient(),
    repository: marketRepository,
    resolveCommodity: resolvePihpsCommodity,
  });
  const marketService = createMarketService(
    marketRepository,
    pihpsImportService,
    createGeminiWebMarketSearch(),
  );
  const activityController = createActivityController(
    pool
      ? createActivityRepository(pool)
      : {
          async list() {
            throw new HttpError(503, "DATABASE_NOT_CONFIGURED", "Riwayat server belum tersedia.");
          },
          async add() {
            throw new HttpError(503, "DATABASE_NOT_CONFIGURED", "Riwayat server belum tersedia.");
          },
        },
  );
  const marketController = createMarketController(marketService);
  const marketRateLimit = createRateLimit({ limit: 20, windowMs: 60_000 });
  const suggestionRateLimit = createRateLimit({ limit: 90, windowMs: 60_000 });

  router.get(
    "/health",
    asyncRoute(async (_req, res) => {
      let database = "not_configured";
      if (databaseConfigured) {
        try {
          await pool.query("SELECT 1");
          database = "connected";
        } catch {
          database = "unavailable";
        }
      }
      res.json({
        status: database === "connected" ? "ok" : "degraded",
        database,
        gemini: process.env.GEMINI_API_KEY ? "configured" : "not_configured",
      });
    }),
  );
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
  router.post("/advisor", asyncRoute(advisorController.ask));
  router.get("/activity", sessionId, asyncRoute(activityController.list));
  router.post("/activity", sessionId, asyncRoute(activityController.add));

  return router;
}
