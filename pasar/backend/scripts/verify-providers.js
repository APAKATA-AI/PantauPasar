import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { requestVleeeJson, getVleeeConfiguration } from "../src/integrations/vleee-client.js";
import { createVleeeWebMarketSearch } from "../src/integrations/vleee-web-market-search.js";
import { getProviderStatus } from "../src/integrations/provider-runtime.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
const report = { checked_at: new Date().toISOString(), vleee: {} };
const safeCode = (error) => typeof error?.code === "string" && /^(VLEEE|MARKET)_[A-Z_]+$/.test(error.code) ? error.code : "CHECK_FAILED";
const safeModel = (model) => /^[a-zA-Z0-9_.:/-]{1,120}$/.test(model) && !model.includes(process.env.VLEEE_API_KEY || "\0") ? model : "configured_model";
const messages = [{ role: "user", content: 'Return exactly this JSON object: {"ok":true}.' }];
let config;

if (!process.env.VLEEE_API_KEY?.trim()) {
  report.vleee = { status: "not_configured", model_acceptance: "not_verified" };
} else {
  try {
    config = getVleeeConfiguration();
    report.vleee.status = "configured";
    try {
      const response = await fetch(`${config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${process.env.VLEEE_API_KEY.trim()}` },
        redirect: "error", signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        report.vleee.model_listing = { status: "unavailable", http_status: response.status };
        await response.body?.cancel?.();
      } else {
        const payload = await response.json();
        const ids = Array.isArray(payload?.data) ? payload.data.map((item) => item?.id) : [];
        report.vleee.model_listing = {
          status: Array.isArray(payload?.data) ? "received" : "invalid_format",
          configured_models: config.models.map((model) => ({ model: safeModel(model), listed: ids.includes(model) })),
        };
      }
    } catch { report.vleee.model_listing = { status: "unavailable" }; }
    report.vleee.streaming = [];
    for (const model of config.models) {
      const started = Date.now();
      try {
        const result = await requestVleeeJson({ messages, maxTokens: 4096, models: [model] });
        report.vleee.streaming.push({ model: safeModel(model), accepted: true, json_valid: result.ok === true, duration_ms: Date.now() - started });
      } catch (error) {
        report.vleee.streaming.push({ model: safeModel(model), accepted: false, error_code: safeCode(error), duration_ms: Date.now() - started });
        if (["VLEEE_AUTH_FAILED", "VLEEE_QUOTA_EXCEEDED", "VLEEE_RATE_LIMITED"].includes(error.code)) break;
      }
    }
    const fallback = report.vleee.streaming[1];
    if (config.models.length > 1 && fallback?.accepted && fallback.json_valid) {
      let primaryInjected = false;
      let fallbackCalled = false;
      try {
        const result = await requestVleeeJson({
          messages, maxTokens: 4096,
          fetchImpl: (url, options) => {
            const model = JSON.parse(options.body).model;
            if (model === config.models[0]) { primaryInjected = true; return Promise.resolve({ ok: false, status: 503 }); }
            fallbackCalled = true;
            return fetch(url, options);
          },
        });
        report.vleee.fallback = { status: result.ok === true && primaryInjected && fallbackCalled ? "passed" : "failed", primary_failure: "injected_503", fallback_response: "live" };
      } catch (error) { report.vleee.fallback = { status: "failed", error_code: safeCode(error), primary_failure: "injected_503" }; }
    } else report.vleee.fallback = { status: "not_verified", reason: "fallback_streaming_not_verified" };
    report.vleee.status = report.vleee.streaming.length === config.models.length && report.vleee.streaming.every((item) => item.accepted && item.json_valid) ? "verified" : "verification_incomplete";
  } catch (error) { report.vleee = { status: "error", error_code: safeCode(error) }; }
}

report.web_search = {status: "unavailable", reason: "native_web_search_not_verified"};
report.operational = getProviderStatus();
// Intentionally print a fixed-schema report only, never provider bodies or caught errors.
console.log(JSON.stringify(report, null, 2));
if (report.vleee.status !== "verified") process.exitCode = 2;
