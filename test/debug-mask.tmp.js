const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [w,h,tag] of [[320,568,'320'],[430,932,'430'],[1440,900,'1440']]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
    await page.fill('#li-user', 'meera');
    await page.fill('#li-pass', 'sahara123');
    await page.click('#li-go');
    await page.waitForTimeout(600);
    await page.click('#mask-btn');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\mask-${tag}.png` });
    await context.close();
  }
  await browser.close();
})();
