const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await page.click('#aswitch button[data-a="up"]');
  await page.click('#su-go');
  await page.waitForTimeout(300);
  // step through to step 8 (account) which has the "Create my account" button
  for (let i = 0; i < 8; i++) {
    // fill required fields minimally as we go
    const step = await page.evaluate(() => window.step);
    if (step === 1) await page.fill('#q-name', 'Test User');
    if (step === 2) await page.click('#q-age .opt[data-v="26-40"]');
    if (step === 3) await page.click('#q-role .opt[data-v="Victim"]');
    if (step === 5) { await page.click('#q-when .chip[data-v="Morning"]'); await page.click('#q-how .opt[data-v="Phone call"]'); }
    await page.waitForTimeout(80);
    await page.click('#o-next');
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(200);
  const btnText = await page.evaluate(() => document.querySelector('#o-next').textContent);
  console.log('step8 button text:', btnText);
  await page.screenshot({ path: 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\onb-step8-footer.png' });
  const overflow = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
  console.log('overflow', overflow);
  await browser.close();
})();
