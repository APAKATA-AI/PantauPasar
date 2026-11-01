import { HttpError } from "../middleware/http-error.js";

const names = ["vleee"];
const boundedInteger = (value, fallback, max) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
};

export function createProviderRuntime({ clock = Date.now } = {}) {
  const state = Object.fromEntries(names.map((name) => [name, {
    requests: 0, successes: 0, failures: 0, in_flight: 0,
    last_success_at: null, last_error_code: null, cooldown_until: 0, starts: [],
  }]));
  function limits(name) {
    const prefix = name.toUpperCase();
    return {
      rpm: boundedInteger(process.env[`${prefix}_LOCAL_RPM`], 30, 1000),
      concurrent: boundedInteger(process.env[`${prefix}_MAX_CONCURRENT`], 3, 20),
    };
  }
  return {
    async run(name, task) {
      const entry = state[name];
      const now = clock();
      const limit = limits(name);
      entry.starts = entry.starts.filter((time) => time > now - 60_000);
      if (entry.cooldown_until > now || entry.starts.length >= limit.rpm || entry.in_flight >= limit.concurrent) {
        const error = new HttpError(503, `${name.toUpperCase()}_RATE_LIMITED`, "Layanan sedang membatasi permintaan. Tunggu sebentar lalu coba lagi.");
        error.retryAfter = Math.max(1, Math.ceil((entry.cooldown_until - now) / 1000));
        throw error;
      }
      entry.starts.push(now);
      entry.requests++;
      entry.in_flight++;
      try {
        const result = await task();
        entry.successes++;
        entry.last_success_at = new Date(clock()).toISOString();
        entry.last_error_code = null;
        return result;
      } catch (error) {
        entry.failures++;
        entry.last_error_code = typeof error?.code === "string" && /^(VLEEE)_[A-Z_]+$/.test(error.code) ? error.code : "PROVIDER_UNAVAILABLE";
        if (error?.retryAfter) entry.cooldown_until = clock() + Math.min(Math.max(error.retryAfter, 1), 3600) * 1000;
        throw error;
      } finally {
        entry.in_flight--;
      }
    },
    status() {
      return Object.fromEntries(names.map((name) => {
        const { starts, cooldown_until, ...publicState } = state[name];
        const configured = Boolean(process.env[`${name.toUpperCase()}_API_KEY`]?.trim());
        const limit = limits(name);
        return [name, {
          configured,
          verification: !configured ? "not_configured" : publicState.last_error_code ? "error" : publicState.last_success_at ? "verified" : "not_verified",
          ...publicState,
          cooldown_until: cooldown_until > clock() ? new Date(cooldown_until).toISOString() : null,
          local_requests_per_minute: limit.rpm,
          local_max_concurrent: limit.concurrent,
        }];
      }));
    },
  };
}

export function retryAfterSeconds(response, now = Date.now()) {
  const value = response.headers?.get?.("retry-after");
  const seconds = Number(value);
  if (value && Number.isFinite(seconds)) return Math.min(3600, Math.max(1, Math.ceil(seconds)));
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) ? Math.min(3600, Math.max(1, Math.ceil((date - now) / 1000))) : 60;
}

export const providerRuntime = createProviderRuntime();
export const getProviderStatus = () => providerRuntime.status();
