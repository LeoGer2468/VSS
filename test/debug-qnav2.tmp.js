const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await page.fill('#li-user', 'meera');
  await page.fill('#li-pass', 'sahara123');
  await page.click('#li-go');
  await page.waitForTimeout(700);
  await page.click('[data-p="checkin"]');
  await page.waitForTimeout(300);

  const len = await page.evaluate(() => QSET.length);
  console.log('QSET length', len);
  for (let i = 0; i < len - 1; i++) {
    await page.click('#qskip');
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(150);
  const btnText = await page.evaluate(() => document.querySelector('#qnext').textContent);
  console.log('final button text:', btnText);
  await page.screenshot({ path: 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\qnav-finish-btn.png' });
  const overflow = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
  console.log('overflow', overflow);
  await browser.close();
})();
