const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await page.fill('#li-user', 'meera');
  await page.fill('#li-pass', 'sahara123');
  await page.click('#li-go');
  await page.waitForTimeout(600);
  await page.click('#roles button[data-r="dm"]');
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) {
    await page.locator('#d-next').scrollIntoViewIfNeeded();
    await page.click('#d-next', { force: true });
    await page.waitForTimeout(300);
  }
  await page.click('#roles button[data-r="cw"]');
  await page.waitForTimeout(300);
  await page.click('#cw-tabs button[data-t="why"]');
  await page.waitForTimeout(200);
  const ov1 = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
  await page.screenshot({ path: 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\sig-why-320.png', fullPage: true });

  await page.click('#cw-tabs button[data-t="over"]');
  await page.waitForTimeout(200);
  const ov2 = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
  await page.screenshot({ path: 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\dom-over-320.png', fullPage: true });

  console.log('overflow why:', ov1, 'overflow overview:', ov2);
  await browser.close();
})();
