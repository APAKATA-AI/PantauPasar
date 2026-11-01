import assert from "node:assert/strict";
import test from "node:test";
import { createRequestLogger } from "../src/middleware/request-logger.js";

function createResponse(statusCode = 200) {
  const listeners = new Map();
  return {
    statusCode,
    once(event, callback) {
      listeners.set(event, callback);
    },
    finish() {
      listeners.get("finish")?.();
    },
  };
}

test("request logger includes market activity without logging other query data", () => {
  const messages = [];
  let now = 100;
  const middleware = createRequestLogger({
    log: (message) => messages.push(message),
    clock: () => now,
  });
  const req = {
    method: "GET",
    path: "/api/market",
    query: {
      produk: "Minyak goreng",
      kota: "Surabaya",
      provinsi: "Jawa Timur",
      token: "secret-value",
    },
  };
  const res = createResponse(200);
  let proceeded = false;

  middleware(req, res, () => {
    proceeded = true;
  });
  now = 145;
  res.finish();

  assert.equal(proceeded, true);
  assert.match(messages[0], /INFO GET \/api\/market -> 200 \(45 ms\)/);
  assert.match(messages[0], /Minyak goreng \(Surabaya, Jawa Timur\)/);
  assert.doesNotMatch(messages[0], /secret-value/);
});

test("request logger skips static assets and marks failed API requests", () => {
  const messages = [];
  const middleware = createRequestLogger({ log: (message) => messages.push(message) });
  const staticResponse = createResponse();
  middleware(
    { method: "GET", path: "/js/main.js", query: {} },
    staticResponse,
    () => {},
  );
  staticResponse.finish();
  assert.equal(messages.length, 0);

  const apiResponse = createResponse(503);
  middleware(
    { method: "GET", path: "/api/activity", query: {} },
    apiResponse,
    () => {},
  );
  apiResponse.finish();
  assert.match(messages[0], /ERROR GET \/api\/activity -> 503/);
});
