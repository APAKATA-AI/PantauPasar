import assert from "node:assert/strict";
import test from "node:test";
import { createMarketController } from "../src/controllers/market-controller.js";

function request() {
  return {
    query: {
      provinsi: "Jawa Timur",
      kota: "Surabaya",
      produk: "Bandingkan harga cabai di Surabaya dan Sidoarjo",
    },
  };
}

function marketResult({ city, price, unit = "kg", marketType } = {}) {
  return {
    produk: "Cabai Rawit Merah",
    provinsi: "Jawa Timur",
    kota: city,
    harga_rata_rata: price,
    harga_terendah: price,
    harga_tertinggi: price,
    satuan: unit,
    confidence_score: null,
    tren_7_hari_terakhir: [],
    perbandingan_wilayah: [],
    daftar_sumber: [
      {
        nama: "PIHPS",
        url: `https://example.test/${city}`,
        tanggal: "2026-11-01T00:00:00.000Z",
        harga: price,
      },
    ],
    updated_at: "2026-11-01T00:00:00.000Z",
    ai_assisted: false,
    ...(marketType ? { market_type: marketType } : {}),
  };
}

test("market controller resolves a natural-language query and returns its locations", async () => {
  const searchCalls = [];
  let responseBody;
  const controller = createMarketController(
    {
      async getMarket(query) {
        searchCalls.push(query);
        return marketResult({ city: query.city, price: 60000 });
      },
    },
    {
      async parseQuery() {
        return {
          product: "cabai rawit merah",
          intent: "search",
          locations: [{ province: "Jawa Timur", city: "Sidoarjo" }],
        };
      },
    },
  );

  await controller.getMarket(request(), {
    json(value) {
      responseBody = value;
    },
  });

  assert.deepEqual(searchCalls, [
    {
      product: "cabai rawit merah",
      province: "Jawa Timur",
      city: "Sidoarjo",
    },
  ]);
  assert.equal(responseBody.resolved_query.product, "cabai rawit merah");
  assert.equal(responseBody.resolved_query.city, "Sidoarjo");
  assert.equal(
    responseBody.resolved_query.search_text,
    "Bandingkan harga cabai di Surabaya dan Sidoarjo",
  );
});

test("market controller compares multiple locations without mixing units", async () => {
  let responseBody;
  const controller = createMarketController(
    {
      async getMarket(query) {
        return marketResult({
          city: query.city,
          price: query.city === "Surabaya" ? 60000 : 55000,
        });
      },
    },
    {
      async parseQuery() {
        return {
          product: "cabai rawit merah",
          intent: "compare",
          locations: [
            { province: "Jawa Timur", city: "Surabaya" },
            { province: "Jawa Timur", city: "Sidoarjo" },
          ],
        };
      },
    },
  );

  await controller.getMarket(request(), {
    json(value) {
      responseBody = value;
    },
  });

  assert.equal(responseBody.comparison, true);
  assert.deepEqual(responseBody.perbandingan_wilayah.map(({kota,harga}) => ({kota,harga})), [
    { kota: "Surabaya", harga: 60000 },
    { kota: "Sidoarjo", harga: 55000 },
  ]);
  assert.equal(responseBody.daftar_sumber.length, 2);
});

test("market controller rejects comparison results from different sources or units", async () => {
  const controller = createMarketController(
    {
      async getMarket(query) {
        return marketResult({
          city: query.city,
          price: 60000,
          unit: query.city === "Surabaya" ? "kg" : "ikat",
        });
      },
    },
    {
      async parseQuery() {
        return {
          product: "cabai",
          intent: "compare",
          locations: [
            { province: "Jawa Timur", city: "Surabaya" },
            { province: "Jawa Timur", city: "Sidoarjo" },
          ],
        };
      },
    },
  );

  await assert.rejects(
    controller.getMarket(request(), { json() {} }),
    { status: 409, code: "INCONSISTENT_UNITS" },
  );
});

test('explicit comparison bypasses AI location parsing and returns partial results honestly', async () => {
 const calls=[];let response;
 const controller=createMarketController({async getMarket(query){calls.push(query.city);if(query.city==='Kota Malang')throw Object.assign(new Error('no data'),{code:'MARKET_DATA_UNAVAILABLE'});return marketResult({city:query.city,price:16000});}}, {parseQuery:async()=>null});
 await controller.getMarket({query:{produk:'Beras medium',provinsi:'Jawa Timur',kota:'Surabaya',bandingkan:'Kota Malang;Kabupaten Kediri'}},{json(value){response=value;}});
 assert.deepEqual(calls,['Surabaya','Kota Malang','Kabupaten Kediri']);
 assert.equal(response.completeness,'partial');assert.equal(response.perbandingan_wilayah.length,2);assert.equal(response.unavailable_locations[0].city,'Kota Malang');
});
test('comparison rejects more than two additional cities', async()=>{
 const controller=createMarketController({}, {parseQuery:async()=>null});
 await assert.rejects(controller.getMarket({query:{produk:'Beras',provinsi:'Jawa Timur',kota:'Surabaya',bandingkan:'A;B;C'}},{}),{status:400,code:'INVALID_INPUT'});
});
