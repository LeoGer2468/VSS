const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await page.fill('#li-user', 'nosuchuser');
  await page.fill('#li-pass', 'wrongpassword');
  await page.click('#li-go');
  await page.waitForTimeout(600);
  console.log('after login error, li-err:', await page.textContent('#li-err'));
  await page.click('#aswitch button[data-a="up"]');
  await page.waitForTimeout(200);
  console.log('a-up display:', await page.evaluate(() => getComputedStyle(document.querySelector('#a-up')).display));
  await page.click('#su-go');
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({
    onbHidden: document.querySelector('#onb').classList.contains('hide'),
    authHidden: document.querySelector('#auth').classList.contains('hide'),
    qnameVisible: document.querySelector('#q-name') ? document.querySelector('#q-name').offsetParent !== null : 'no element'
  }));
  console.log('state after su-go:', state);
  await page.screenshot({ path: 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\debug-after-sugo.png' });
  await browser.close();
})();
