const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await context.newPage();
  page.on('console', m => console.log('PAGE LOG:', m.text()));
  page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await page.fill('#li-user', 'meera');
  await page.fill('#li-pass', 'sahara123');
  await page.click('#li-go');
  await page.waitForTimeout(600);
  await page.click('#roles button[data-r="dm"]');
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const dm = document.querySelector('#r-dm');
    const dnext = document.querySelector('#d-next');
    return {
      dmOn: dm.classList.contains('on'),
      dmDisplay: getComputedStyle(dm).display,
      dnextExists: !!dnext,
      dnextVisible: dnext ? dnext.offsetParent !== null : null,
      dnextRect: dnext ? dnext.getBoundingClientRect() : null,
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
})();
