import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { app } from "../src/app.js";

test("HTTP app protects configuration, validates inputs and returns useful health", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "no-store");
  const status = await health.json();
  assert.ok(["ok", "degraded"].includes(status.status));
  assert.ok(["configured", "not_configured"].includes(status.vleee));
  for (const name of ["VLEEE_API_KEY", "DATABASE_URL"])
    if (process.env[name]) assert.equal(JSON.stringify(status).includes(process.env[name]), false);

  for (const resource of ["/.env", "/backend/server.js", "/data/market-cache.json"])
    assert.equal((await fetch(base + resource)).status, 404);

  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(page.headers.get("x-powered-by"), null);

  for (const query of ["", "?produk[]=Jeruk&provinsi=Jawa+Timur&kota=Surabaya", "?produk=Jeruk&provinsi=Jawa+Timur&kota[]=Surabaya"])
    assert.equal((await fetch(`${base}/api/market${query}`)).status, 400);

  const invalidJson = await fetch(`${base}/api/calculator`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"secret":"private-marker",' });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.text()).includes("private-marker"), false);

  const tooLarge = await fetch(`${base}/api/advisor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pertanyaan: "x".repeat(18_000) }) });
  assert.equal(tooLarge.status, 413);

  const calculation = await fetch(`${base}/api/calculator`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredients: [{ cost: 120000 }, { cost: 40000 }], quantity: 20, sale_price: 15000, operating_cost: 20000 }) });
  assert.equal(calculation.status, 200);
  assert.equal((await calculation.json()).profit, 120000);

  const invalidCalculation = await fetch(`${base}/api/calculator`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredients: [{ cost: -1 }], quantity: 20, sale_price: 15000 }) });
  assert.equal(invalidCalculation.status, 400);
});
