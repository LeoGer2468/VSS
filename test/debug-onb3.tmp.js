const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await page.click('#aswitch button[data-a="up"]');
  await page.click('#su-go');
  await page.waitForTimeout(300);

  for (let guard = 0; guard < 15; guard++) {
    const s = await page.evaluate(() => document.querySelector('.onb-step.on').dataset.s);
    if (s === '8') break;
    if (s === '1') await page.fill('#q-name', 'Test User');
    if (s === '2') await page.click('#q-age .opt[data-v="26-40"]');
    if (s === '3') await page.click('#q-role .opt[data-v="Victim"]');
    if (s === '5') { await page.click('#q-when .chip[data-v="Morning"]'); await page.click('#q-how .opt[data-v="Phone call"]'); }
    await page.waitForTimeout(60);
    await page.click('#o-next');
    await page.waitForTimeout(150);
  }
  const s = await page.evaluate(() => document.querySelector('.onb-step.on').dataset.s);
  const btnText = await page.evaluate(() => document.querySelector('#o-next').textContent);
  console.log('landed on step', s, 'button text:', btnText);
  await page.screenshot({ path: 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\onb-step8-footer.png', fullPage: true });
  const overflow = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
  console.log('overflow', overflow);
  await browser.close();
})();
