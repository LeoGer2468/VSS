/* TEMPORARY — camera consent, capture, privacy and failure paths. Deleted after. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 3266, BASE = 'http://localhost:' + PORT;
const DB = __dirname + '/../data/db.json';

(async () => {
  fs.rmSync(__dirname + '/../data', { recursive:true, force:true });
  const srv = spawn('node', ['server.js'], { cwd:__dirname + '/..', env:{ ...process.env, PORT:String(PORT), HOST:'127.0.0.1' } });
  srv.stdout.on('data', () => {}); srv.stderr.on('data', () => {});
  await sleep(1400);

  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium',
    args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] });
  const errs = [];

  const login = async (ctx, who) => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE); await sleep(700);
    await p.click('#land-signin'); await sleep(400);
    await p.fill('#li-user', who); await p.fill('#li-pass','sahara123');
    await p.click('#li-go'); await sleep(1300);
    return p;
  };

  /* ---------- A · camera OFF by default, no permission requested ---------- */
  let ctx = await b.newContext({ viewport:{ width:1280, height:900 }, permissions:[] });
  let p = await login(ctx, 'meera');
  const consentAtStart = await p.evaluate(() => !!(survivor().consents && survivor().consents.camera));
  console.log('A default camera consent:', consentAtStart, consentAtStart === false ? '(correct — OFF)' : '(WRONG)');
  const askedAtBoot = await p.evaluate(() => window.__gum_called === true);
  console.log('A getUserMedia called at boot:', !!askedAtBoot, !askedAtBoot ? '(correct)' : '(WRONG)');

  /* consent screen appears only at the END of a check-in */
  await p.evaluate(() => goPane('checkin')); await sleep(500);
  console.log('A camera UI during questions:', await p.$('#cam-step') ? 'present-but-empty' : 'absent');
  for (let i = 0; i < 9; i++){
    const skip = await p.$('#qskip'); if (!skip) break;
    await skip.click(); await sleep(200);
  }
  await sleep(500);
  const hasConsent = await p.$('#cam-allow');
  console.log('A consent screen after finishing:', hasConsent ? 'shown' : 'MISSING');
  const words = (await p.textContent('#cam-step')).replace(/\s+/g,' ');
  console.log('A says optional:', /optional/i.test(words),
              '· says no effect:', /no effect whatsoever/i.test(words),
              '· says stays on device:', /never leaves this device/i.test(words));

  /* ---------- B · skip path leaves everything untouched ---------- */
  await p.click('#cam-skip'); await sleep(400);
  console.log('B after skip, consent:', await p.evaluate(() => !!survivor().consents.camera), '(should stay false)');
  console.log('B skip message:', (await p.textContent('#cam-step')).replace(/\s+/g,' ').trim().slice(0,70));
  await ctx.close();

  /* ---------- C · allow path, real capture with a fake camera ---------- */
  ctx = await b.newContext({ viewport:{ width:1280, height:900 }, permissions:['camera'] });
  p = await login(ctx, 'meera');
  await p.evaluate(() => goPane('checkin')); await sleep(400);
  await p.click('#qbody .mo[data-m="4"]').catch(()=>{});
  await p.click('#qnext'); await sleep(300);
  for (let i = 0; i < 8; i++){
    const skip = await p.$('#qskip'); if (!skip) break;
    await skip.click(); await sleep(180);
  }
  await sleep(400);
  await p.click('#cam-allow'); await sleep(900);
  const liveState = await p.$('#cam-state') ? (await p.textContent('#cam-state')).trim() : '(none)';
  const videoOn = await p.$('#cam-video') ? await p.$eval('#cam-video', v => !!v.srcObject) : false;
  console.log('C state while running:', liveState, '· stream attached:', videoOn);
  console.log('C stop button present:', !!(await p.$('#cam-stopnow')));

  await sleep(7000);   // let the 6s capture finish
  const doneTxt = (await p.textContent('#cam-step')).replace(/\s+/g,' ');
  const result = await p.evaluate(() => CAM.result);
  console.log('C result:', JSON.stringify(result));
  console.log('C stream released:', await p.evaluate(() => CAM.stream === null));
  console.log('C final state:', (await p.textContent('#cam-state')).trim());
  console.log('C wording ok (no emotion words):',
    !/depress|sad|happy|emotion confirmed|detected depression/i.test(doneTxt) ? 'yes' : 'NO — PROBLEM');

  /* send it and check what actually reaches the database */
  await p.click('#q-send'); await sleep(1400);
  const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const kase = db.cases.find(c => c.id === 'SH-2291');
  const sitting = kase.events.filter(e => e.type === 'sitting').pop();
  console.log('C stored camera block:', JSON.stringify(sitting.camera));
  const raw = JSON.stringify(db);
  console.log('C raw image data in db:', /data:image|base64|blob:/i.test(raw) ? 'FOUND — PROBLEM' : 'none (correct)');

  /* ---------- D · the score must be identical with and without it ---------- */
  const scoreCmp = await p.evaluate(() => {
    const c = survivor();
    const withCam = assess(c).score;
    const copy = JSON.parse(JSON.stringify(c));
    copy.events.forEach(e => { if (e.camera) delete e.camera; });
    return { withCam, without: assess(copy).score };
  });
  console.log('D score with camera:', scoreCmp.withCam, '· without:', scoreCmp.without,
              scoreCmp.withCam === scoreCmp.without ? '(identical — correct)' : '(DIFFERENT — PROBLEM)');

  /* ---------- E · withdrawal clears collected signals ---------- */
  await p.evaluate(() => goPane('support')); await sleep(500);
  await p.click('#cam-withdraw'); await sleep(1200);
  const db2 = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const k2 = db2.cases.find(c => c.id === 'SH-2291');
  const anyCam = k2.events.some(e => e.camera);
  console.log('E consent after withdraw:', await p.evaluate(() => !!survivor().consents.camera));
  console.log('E camera data left in db:', anyCam ? 'YES — PROBLEM' : 'none (correct)');
  const logged = (k2.access || []).some(a => /camera check-in/i.test(a.what));
  console.log('E consent change in access log:', logged ? 'yes' : 'NO');
  await ctx.close();

  /* ---------- F · denied permission must not block or penalise ---------- */
  const ctx2 = await b.newContext({ viewport:{ width:1280, height:900 } });
  await ctx2.grantPermissions([], { origin: BASE });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errs.push(e.message));
  await p2.goto(BASE); await sleep(700);
  await p2.click('#land-signin'); await sleep(400);
  await p2.fill('#li-user','meera'); await p2.fill('#li-pass','sahara123');
  await p2.click('#li-go'); await sleep(1300);
  await p2.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), { name:'NotAllowedError' })); });
  await p2.evaluate(() => goPane('checkin')); await sleep(400);
  await p2.click('#qbody .mo[data-m="3"]').catch(()=>{});   // answer one, so there IS something to send
  await p2.click('#qnext'); await sleep(250);
  for (let i = 0; i < 8; i++){ const s2 = await p2.$('#qskip'); if (!s2) break; await s2.click(); await sleep(180); }
  await sleep(400);
  await p2.click('#cam-allow'); await sleep(1200);
  console.log('F denied ->', JSON.stringify(await p2.evaluate(() => CAM.result)));
  console.log('F message:', (await p2.textContent('#cam-step')).replace(/\s+/g,' ').trim().slice(0,90));
  console.log('F send button still usable:', await p2.$eval('#q-send', e => !e.disabled));
  await p2.click('#q-send'); await sleep(1300);
  console.log('F check-in completed despite camera denial:', await p2.$eval('.pane[data-p="home"]', e => e.classList.contains('on')));
  await ctx2.close();

  /* ---------- G · caseworker multimodal view ---------- */
  const ctx3 = await b.newContext({ viewport:{ width:1440, height:980 } });
  const p3 = await login(ctx3, 'anjali');
  await p3.evaluate(() => goRole('dm')); await sleep(300);
  await p3.click('#scen .scard[data-s="camera"]'); await sleep(1000);
  const mm = (await p3.textContent('#multimodal')).replace(/\s+/g,' ');
  console.log('\nG multimodal panel:');
  const rows = await p3.$$eval('#multimodal .mmrow', els => els.map(e => e.textContent.replace(/\s+/g,' ').trim()));
  rows.forEach(r => console.log('   ' + r.slice(0, 110)));
  console.log('G disagreement notice:', /Signals disagree/i.test(mm) ? 'shown' : 'MISSING');
  console.log('G says contributes nothing to score:', /contributes nothing to the priority score/i.test(mm) ? 'yes' : 'NO');
  console.log('G banned wording present:', /depress|detected sadness|emotion confirmed/i.test(mm) ? 'YES — PROBLEM' : 'no (correct)');
  await p3.screenshot({ path:__dirname + '/../shot-mm.png' });
  await ctx3.close();

  console.log('\nPAGE ERRORS: ' + (errs.length ? errs.slice(0,5).join(' | ') : 'none'));
  await b.close(); srv.kill();
})();
