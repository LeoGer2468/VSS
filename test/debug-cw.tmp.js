const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await context.newPage();
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
  await page.fill('#li-user', 'meera');
  await page.fill('#li-pass', 'sahara123');
  await page.click('#li-go');
  await page.waitForTimeout(700);
  await page.click('#roles button[data-r="cw"]');
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => {
    const vw = window.innerWidth;
    const all = [...document.querySelectorAll('#r-cw *')];
    const wide = all
      .map(el => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, id: el.id, cls: (el.className+'').slice(0,50), w: Math.round(r.width), right: Math.round(r.right), left: Math.round(r.left) };
      })
      .filter(x => x.right > vw + 1 || x.w > vw)
      .sort((a,b) => b.right - a.right);
    return { vw, wide: wide.slice(0, 20) };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
