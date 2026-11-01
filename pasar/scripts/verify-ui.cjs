const {chromium}=require(process.env.PLAYWRIGHT_PATH || require('node:path').join(process.env.USERPROFILE || process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const checks=[],errors=[];
 try {
 for(const width of [390,1440]) for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height:950},colorScheme:theme,reducedMotion:'reduce'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.QA_BASE_URL||'http://127.0.0.1:4186');
  await page.locator('#product').fill('Beras medium');
  await page.locator('#province').fill('Jawa Timur');
  await page.locator('#city').fill('Surabaya');
  await page.locator('#search-button').click();
  await page.waitForSelector('#hasil:not([hidden])',{timeout:60000});
  assert.match(await page.locator('#result-price').innerText(),/Rp\s*[\d.,]+/);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false);
  await page.screenshot({path:`qa/${width}-${theme}-results.png`,fullPage:true});
  await page.locator('#back-search').click();
  await page.screenshot({path:`qa/${width}-${theme}-home.png`,fullPage:true});
  await page.locator('#product').fill('Jeruk');await page.locator('#city').fill('Wilayah tidak dikenal');
  await page.locator('#search-button').click();
  await page.waitForSelector('#search-error:not([hidden])',{timeout:60000});
  const failure=await page.locator('#search-error').innerText();assert.ok(failure.length>10);
  checks.push({width,theme,overflow,success:true,unknown_location_error:failure});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync('qa/ui-results.json',JSON.stringify({checked_at:new Date().toISOString(),checks,errors},null,2));
 console.log(JSON.stringify({checks,errors}));
 } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
