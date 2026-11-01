import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimit } from "../src/middleware/rate-limit.js";

test("market rate limit rejects repeated requests with a retry delay", () => {
  const limit = createRateLimit({ limit: 1, windowMs: 60_000 });
  const response = {
    headers: {},
    set(name, value) {
      this.headers[name] = value;
    },
  };
  const request = { ip: "127.0.0.1" };
  let firstError;
  limit(request, response, (error) => {
    firstError = error;
  });
  assert.equal(firstError, undefined);

  let secondError;
  limit(request, response, (error) => {
    secondError = error;
  });
  assert.equal(secondError.status, 429);
  assert.equal(secondError.code, "RATE_LIMITED");
  assert.match(response.headers["Retry-After"], /^[1-6]\d?$/);
});
