const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await page.click('#aswitch button[data-a="up"]');
  await page.click('#su-go');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.step = 8; window.paint(); });
  await page.waitForTimeout(200);
  const btnText = await page.evaluate(() => document.querySelector('#o-next').textContent);
  console.log('step8 button text:', btnText);
  await page.screenshot({ path: 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\onb-step8-footer.png', fullPage: true });
  const overflow = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
  console.log('overflow', overflow);
  await browser.close();
})();
