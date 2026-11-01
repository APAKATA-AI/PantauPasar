import assert from 'node:assert/strict';
import test from 'node:test';
import { createVleeeWebMarketSearch } from '../src/integrations/vleee-web-market-search.js';
test('free search refuses unsupported web capability and never invents prices', async () => {
 const previous=process.env.VLEEE_API_KEY;
 try {
  process.env.VLEEE_API_KEY='test-key';
  await assert.rejects(createVleeeWebMarketSearch()({product:'Jeruk'}), {status:422,code:'VLEEE_WEB_SEARCH_UNAVAILABLE'});
  delete process.env.VLEEE_API_KEY;
  await assert.rejects(createVleeeWebMarketSearch()({product:'Jeruk'}), {status:503,code:'VLEEE_NOT_CONFIGURED'});
 } finally {if(previous===undefined)delete process.env.VLEEE_API_KEY;else process.env.VLEEE_API_KEY=previous;}
});
