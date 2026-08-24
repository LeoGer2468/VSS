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
  // advance a couple questions so Back is visible, and reach last question for "Finish check-in" label
  const qsetLen = await page.evaluate(() => window.QSET ? QSET.length : null);
  console.log('QSET length', qsetLen);
  await page.click('#qnext');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\qnav-q2.png', fullPage: true });

  // jump to near-last question by repeatedly clicking skip (fast, no validation)
  for (let i=0;i<20;i++){
    const skip = await page.$('#qskip');
    const isDone = await page.$('#q-again');
    if (isDone) break;
    if (skip) { await skip.click(); await page.waitForTimeout(80); } else break;
  }
  await page.screenshot({ path: 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\qnav-lastq-or-done.png', fullPage: true });

  const overflow = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
  console.log('overflow check', overflow);

  await browser.close();
})();
