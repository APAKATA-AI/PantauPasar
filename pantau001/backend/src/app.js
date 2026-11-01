import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import {
  pool,
  databaseConfigured,
  databaseEnabled,
} from "./config/database.js";
import { errorHandler } from "./middleware/error-handler.js";
import { HttpError } from "./middleware/http-error.js";
import { createRequestLogger } from "./middleware/request-logger.js";
import { createApiRouter } from "./routes/api.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(currentDirectory, "../../frontend");

export const app = express();

app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        styleSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  }),
);
app.use(createRequestLogger());
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "16kb" }));
app.use("/api", createApiRouter({ pool, databaseConfigured, databaseEnabled }));
app.use(express.static(frontendDirectory, { index: "index.html" }));
app.use((_req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", "Rute tidak ditemukan."));
});
app.use(errorHandler);
