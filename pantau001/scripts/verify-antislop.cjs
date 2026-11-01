const { chromium } = require(require('node:path').join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const checks = [], errors = [];
  try {
    for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: width < 640 ? 844 : 950 }, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const contrast = [];
      for (const view of ['harga', 'untung', 'simulasi', 'saran']) {
        await page.goto('http://localhost:4186/#' + view);
        await page.waitForTimeout(250);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow ${width}/${theme}/${view}`);
        const samples = await page.locator('#' + view).evaluate(root => {
          const rgb = value => (value.match(/[\d.]+/g) || []).map(Number).slice(0, 3);
          const luminance = color => rgb(color).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
          const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
          return [...root.querySelectorAll('h1,h2,p,label,button,input,textarea,summary')].filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height).map(el => {
            const style = getComputedStyle(el);
            let parent = el;
            while (parent.parentElement && getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
            const background = getComputedStyle(parent).backgroundColor;
            const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
            return { element: el.id || el.className || el.tagName, text: (el.textContent || el.value || '').trim().slice(0, 60), ratio: +ratio(style.color, background).toFixed(2), required: large ? 3 : 4.5 };
          });
        });
        contrast.push(...samples);
        await page.screenshot({ path: `qa/audit-${width}-${theme}-${view}.png`, fullPage: false });
      }
      await page.goto('http://localhost:4186/#harga');
      await page.locator('[data-commodity="Beras medium"]').click();
      assert.equal(await page.locator('[data-commodity="Beras medium"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-commodity][aria-pressed="true"]').count(), 1);
      await page.locator('#product').fill('Jeruk');
      await page.waitForFunction(() => document.querySelector('.form-help').textContent.includes('belum ditemukan'));
      assert.equal(await page.locator('[data-commodity][aria-pressed="true"]').count(), 0);
      assert.equal(await page.locator('[data-free-search]').count(), 0);
      await page.locator('#product').fill('Beras');
      await page.waitForSelector('[data-product-option]');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('[data-product-option]').first().getAttribute('aria-selected'), 'true');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#product').getAttribute('aria-expanded'), 'false');
      await page.locator('.compare-options summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('.compare-options').evaluate(el => el.open), true);
      assert.notEqual(await page.locator('.compare-options summary').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      checks.push({ width, theme, overflow: false, shortcut_selection: true, catalogue_keyboard: true, compare_keyboard: true, contrast_failures: contrast.filter(item => item.ratio < item.required), contrast_samples: contrast.length });
      await context.close();
    }
    fs.writeFileSync('qa/antislop-results.json', JSON.stringify({ checked_at: new Date().toISOString(), checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors }));
    assert.deepEqual(errors, []);
    assert.equal(checks.some(check => check.contrast_failures.length), false, 'Text contrast failed; see qa/antislop-results.json');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
