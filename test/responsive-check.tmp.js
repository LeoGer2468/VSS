const { chromium } = require('playwright');

const sizes = [
  [320, 568, 'small phone'],
  [360, 800, 'phone'],
  [375, 812, 'phone'],
  [390, 844, 'phone'],
  [412, 915, 'phone'],
  [430, 932, 'phone'],
  [768, 1024, 'tablet portrait'],
  [1024, 768, 'tablet landscape'],
  [1280, 720, 'laptop'],
  [1366, 768, 'laptop'],
  [1440, 900, 'laptop'],
  [1920, 1080, 'desktop'],
  [2560, 1440, 'ultrawide'],
];

const routes = [
  { name: 'auth', setup: null },
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];

  for (const [w, h, label] of sizes) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    const check = async (tag) => {
      const info = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
        bodyScrollW: document.body.scrollWidth,
      }));
      const overflow = info.scrollW > info.innerW + 1;
      results.push({ w, h, label, tag, overflow, scrollW: info.scrollW, innerW: info.innerW });
      if (overflow) {
        // find worst offending elements
        const offenders = await page.evaluate(() => {
          const vw = window.innerWidth;
          const els = [...document.querySelectorAll('body *')];
          const bad = [];
          for (const el of els) {
            const r = el.getBoundingClientRect();
            if (r.right > vw + 2 || r.left < -2) {
              bad.push({ tag: el.tagName, id: el.id, cls: (el.className+'').slice(0,60), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
            }
          }
          bad.sort((a,b) => b.right - a.right);
          return bad.slice(0, 8);
        });
        results.push({ offenders });
      }
    };

    // 1. Auth screen (login)
    await check('auth-login');

    // switch to "create account" tab
    try {
      await page.click('#aswitch button[data-a="up"]', { timeout: 2000 });
      await page.waitForTimeout(200);
      await check('auth-signup');
    } catch (e) { results.push({ tag: 'auth-signup', error: e.message }); }

    // log in as demo survivor to reach onboarding-complete app (use offline/local demo instead: click "Demo" isn't available pre-auth)
    // Try logging in with seeded demo account
    try {
      await page.click('#aswitch button[data-a="in"]', { timeout: 2000 });
      await page.fill('#li-user', 'meera');
      await page.fill('#li-pass', 'sahara123');
      await page.click('#li-go');
      await page.waitForTimeout(700);
      await check('survivor-home');

      // check-in flow
      await page.click('[data-p="checkin"]');
      await page.waitForTimeout(300);
      await check('checkin-q1');

      // click through a few questions if possible
      for (let i = 0; i < 3; i++) {
        const nextBtn = await page.$('#qnext');
        if (nextBtn) { await nextBtn.click(); await page.waitForTimeout(200); }
      }
      await check('checkin-later');

      await page.click('[data-p="report"]');
      await page.waitForTimeout(200);
      await check('report');

      await page.click('[data-p="case"]');
      await page.waitForTimeout(200);
      await check('my-case');

      await page.click('[data-p="support"]');
      await page.waitForTimeout(200);
      await check('support');

      // switch to caseworker role
      await page.click('#roles button[data-r="cw"]');
      await page.waitForTimeout(300);
      await check('caseworker-overview');

      await page.click('#cw-tabs button[data-t="why"]');
      await page.waitForTimeout(200);
      await check('caseworker-why');

      await page.click('#cw-tabs button[data-t="time"]');
      await page.waitForTimeout(200);
      await check('caseworker-timeline');

      await page.click('#cw-tabs button[data-t="act"]');
      await page.waitForTimeout(200);
      await check('caseworker-act');

      // demo role
      await page.click('#roles button[data-r="dm"]');
      await page.waitForTimeout(200);
      await check('demo');

      // safety mask
      await page.click('#roles button[data-r="sv"]');
      await page.waitForTimeout(200);
      await page.click('[data-p="support"]');
      await page.waitForTimeout(200);
      await page.click('#mask-btn');
      await page.waitForTimeout(300);
      await check('mask');
    } catch (e) {
      results.push({ tag: 'app-flow-error', error: e.message, w, h });
    }

    await context.close();
  }

  await browser.close();

  const overflows = results.filter(r => r.overflow);
  console.log(JSON.stringify({ totalChecks: results.filter(r=>r.tag).length, overflowCount: overflows.length }, null, 2));
  console.log('---OVERFLOWS---');
  console.log(JSON.stringify(results.filter(r => r.overflow || r.offenders || r.error), null, 2));
})();
