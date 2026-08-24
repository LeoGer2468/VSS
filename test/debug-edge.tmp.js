const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const results = [];

  for (const [w, h] of [[320, 700], [375, 812]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' });

    // 1. login error state (long-ish error text)
    await page.fill('#li-user', 'nosuchuser');
    await page.fill('#li-pass', 'wrongpassword');
    await page.click('#li-go');
    await page.waitForTimeout(500);
    let ov = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
    results.push({ w, stage: 'login-error', ov, errText: await page.textContent('#li-err') });

    // 2. register with a very long, unbroken alias (worst case for name rendering)
    await page.click('#aswitch button[data-a="up"]');
    await page.click('#su-go');
    await page.waitForTimeout(300);
    await page.click('#o-next'); // step0 welcome -> step1
    await page.waitForTimeout(200);
    const longName = 'Supercalifragilisticexpialidocious-Wraithmoor-Constantinopolitanization';
    await page.fill('#q-name', longName);
    await page.click('#o-next'); // step1 -> 2
    await page.click('#q-age .opt[data-v="26-40"]');
    await page.click('#o-next'); // 2->3
    await page.click('#q-role .opt[data-v="Victim"]');
    await page.click('#o-next'); // 3->4
    await page.click('#o-next'); // 4->5 (reason optional)
    await page.click('#q-when .chip[data-v="Morning"]');
    await page.click('#q-how .opt[data-v="Phone call"]');
    await page.click('#o-next'); // 5->6
    await page.click('#o-next'); // 6->7 (safeword optional)
    await page.click('#o-next'); // 7->8 (consent, no validation needed)
    await page.waitForTimeout(150);
    const longUser = ('a'.repeat(18)) + (Date.now() % 1000000).toString().padStart(6,'0').slice(-6).slice(0, 24-18);
    await page.fill('#q-user', longUser);
    await page.fill('#q-pass', 'password123');
    await page.fill('#q-pass2', 'password123');
    await page.click('#o-next'); // register
    await page.waitForTimeout(900);
    ov = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
    results.push({ w, stage: 'register-done-longname', ov });
    await page.screenshot({ path: `C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\edge-${w}-longname-done.png`, fullPage: true });

    await page.click('#o-next'); // enter app
    await page.waitForTimeout(600);
    ov = await page.evaluate(() => ({sw: document.documentElement.scrollWidth, iw: window.innerWidth}));
    results.push({ w, stage: 'survivor-home-longname', ov });
    await page.screenshot({ path: `C:\\Users\\munch\\AppData\\Local\\Temp\\claude\\C--Users-munch-OneDrive-Desktop-sih\\ffd73378-0a81-413c-a3fb-05ee45661131\\scratchpad\\shots\\edge-${w}-home-longname.png` });

    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})();
