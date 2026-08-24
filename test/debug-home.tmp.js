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

  const info = await page.evaluate(() => {
    const pane = document.querySelector('.pane[data-p="home"]');
    const g2 = pane.querySelector('.g2');
    const cards = [...g2.children].map(c => {
      const r = c.getBoundingClientRect();
      return { tag: c.tagName, cls: c.className, h: r.height, w: r.width, display: getComputedStyle(c).display };
    });
    const recentlyBox = [...pane.querySelectorAll('.box')].find(b => b.querySelector('#hm-tl'));
    const bodyH = document.body.scrollHeight;
    const docH = document.documentElement.scrollHeight;
    return {
      g2Rect: g2.getBoundingClientRect(),
      g2Display: getComputedStyle(g2).display,
      g2GridCols: getComputedStyle(g2).gridTemplateColumns,
      cards,
      recentlyBoxExists: !!recentlyBox,
      recentlyBoxRect: recentlyBox ? recentlyBox.getBoundingClientRect() : null,
      hmTlChildren: document.querySelector('#hm-tl') ? document.querySelector('#hm-tl').children.length : 'no #hm-tl',
      bodyH, docH,
      paneChildren: [...pane.children].map(c => ({tag:c.tagName, cls:c.className}))
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
