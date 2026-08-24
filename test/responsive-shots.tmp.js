const { chromium } = require('playwright');
const fs = require('fs');

const OUT = 'C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots';
fs.mkdirSync(OUT, { recursive: true });

const sizes = [
  [320, 700, '320'],
  [375, 812, '375'],
  [390, 844, '390'],
  [768, 1024, '768'],
  [1024, 768, '1024ls'],
  [1440, 900, '1440'],
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const [w, h, tag] of sizes) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${tag}-01-auth.png` });

    await page.click('#aswitch button[data-a="up"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${tag}-02-signup.png` });

    await page.click('#aswitch button[data-a="in"]');
    await page.fill('#li-user', 'meera');
    await page.fill('#li-pass', 'sahara123');
    await page.click('#li-go');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${tag}-03-home.png`, fullPage: true });

    await page.click('[data-p="checkin"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${tag}-04-checkin.png` });

    // go to a voice-mode question if possible (click through until mic or text shows)
    for (let i = 0; i < 6; i++) {
      const mic = await page.$('#qmic');
      if (mic) break;
      const next = await page.$('#qnext');
      if (next) { await next.click(); await page.waitForTimeout(150); }
    }
    await page.screenshot({ path: `${OUT}/${tag}-05-checkin-voice.png` });

    await page.click('[data-p="support"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${tag}-06-support.png`, fullPage: true });

    await page.click('#roles button[data-r="cw"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${tag}-07-caseworker.png`, fullPage: true });

    await page.click('#cw-tabs button[data-t="act"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${tag}-08-cw-act.png`, fullPage: true });

    await page.click('#roles button[data-r="dm"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${tag}-09-demo.png`, fullPage: true });

    // onboarding flow (sign out then start create-account -> survivor)
    await page.click('#signout');
    await page.waitForTimeout(300);
    await page.click('#aswitch button[data-a="up"]');
    await page.click('#su-go');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${tag}-10-onb-welcome.png` });
    await page.click('#o-next');
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${tag}-11-onb-name.png` });

    await context.close();
  }

  await browser.close();
  console.log('done, screenshots at', OUT);
})();
