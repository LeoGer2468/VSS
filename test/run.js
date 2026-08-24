const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const BASE = process.env.BASE || 'http://localhost:3111';

const PG = !!process.env.DATABASE_URL;
async function readDump(){
  if (!PG) return fs.readFileSync(__dirname + '/../data/db.json','utf8');
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const u = await c.query('select * from users'); const cs = await c.query('select data from cases');
  await c.end();
  return JSON.stringify(u.rows) + JSON.stringify(cs.rows);
}
async function findCase(alias){
  if (!PG) return JSON.parse(fs.readFileSync(__dirname + '/../data/db.json','utf8')).cases.find(c => c.alias === alias);
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const r = await c.query("select data from cases where data->>'alias' = $1", [alias]);
  await c.end();
  return r.rows[0] && r.rows[0].data;
}
(async () => {
  fs.rmSync(__dirname + '/../data', { recursive:true, force:true });
  if (PG){ const { Client } = require('pg'); const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect(); await c.query('drop table if exists users, cases, sessions'); await c.end(); }
  const srv = spawn('node', ['server.js'], { cwd:__dirname + '/..', env:{ ...process.env, PORT:'3111', HOST:'127.0.0.1' } });
  let boot = '';
  srv.stdout.on('data', d => boot += d);
  srv.stderr.on('data', d => boot += d);
  await sleep(1200);
  console.log('--- server boot ---\n' + boot.trim().split('\n').slice(0,4).join('\n'));

  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport:{ width:1400, height:1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|fonts/.test(m.text())) errs.push(m.text()); });

  // ---------- API-level checks first ----------
  const api = async (method, path, body, cookie) => {
    const r = await fetch(BASE + '/api' + path, {
      method, headers: Object.assign(body?{'Content-Type':'application/json'}:{}, cookie?{Cookie:cookie}:{}),
      body: body ? JSON.stringify(body) : undefined });
    const sc = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean);
    return { status:r.status, cookie: sc.length ? sc[0].split(';')[0] : '', body: await r.json() };
  };
  let r = await api('POST','/login',{ username:'meera', password:'wrong' });
  console.log('bad password ->', r.status, r.body.error);
  r = await api('POST','/login',{ username:'nosuchuser', password:'x' });
  console.log('unknown user ->', r.status, JSON.stringify(r.body.error));
  const meera = (await api('POST','/login',{ username:'meera', password:'sahara123' })).cookie;
  const anjali = (await api('POST','/login',{ username:'anjali', password:'sahara123' })).cookie;
  console.log('logins ok:', !!meera, !!anjali);

  r = await api('GET','/me',null,meera);
  console.log('meera /me -> case', r.body.case.id, '| questions served:', r.body.questions.length,
              '| modes:', r.body.questions.map(q=>q.mode).join(','));
  r = await api('GET','/me',null,anjali);
  console.log('anjali /me -> caseload of', r.body.caseload.length);

  // access control: survivor cannot read another case
  r = await api('GET','/case/SH-2104',null,meera);
  console.log('meera reading someone else\'s case ->', r.status, r.body.error);
  r = await api('GET','/case/SH-2104',null,anjali);
  console.log('anjali reading her assigned case ->', r.status, r.body.case ? 'allowed' : 'denied');
  r = await api('POST','/case/SH-2104/action',{ kind:'review' },meera);
  console.log('meera acting on a case ->', r.status, r.body.error);
  r = await api('GET','/me',null,'sahara_session=' + 'f'.repeat(64));
  console.log('forged session ->', r.status, r.body.error);

  // password never stored in the clear
  const dump = await readDump();
  console.log('password in dump?', dump.includes('sahara123') ? 'LEAK!' : 'no (correct)');

  // ---------- browser: register a brand new survivor ----------
  await p.goto(BASE);
  await p.waitForTimeout(700);
  await p.click('#land-start');
  await p.waitForTimeout(400);
  await p.click('#aswitch button[data-a="up"]');
  await p.click('#su-go'); await p.waitForTimeout(300);
  await p.click('#o-next');                                    // welcome
  await p.fill('#q-name','Anita'); await p.click('#o-next');
  await p.click('#q-age .opt[data-v="u18"]');                  // minor branch
  console.log('minor notice shown:', await p.$eval('#minor-note', e => e.style.display !== 'none'));
  await p.click('#q-age .opt[data-v="26-40"]'); await p.click('#o-next');
  await p.click('#q-role .opt[data-v="Witness"]'); await p.click('#o-next');
  await p.click('#q-reason .chip[data-v="Trafficking"]'); await p.click('#o-next');
  await p.click('#q-when .chip[data-v="Morning"]');
  await p.click('#q-how .opt[data-v="In-app only"]'); await p.click('#o-next');
  await p.fill('#q-safe','tulip'); await p.click('#o-next');
  await p.waitForTimeout(150); await p.click('#o-next');       // consent
  await p.fill('#q-user','anita'); await p.fill('#q-pass','hunter2'); await p.fill('#q-pass2','nomatch');
  await p.click('#o-next'); await p.waitForTimeout(300);
  console.log('mismatched passwords ->', (await p.textContent('#q-err')).trim());
  await p.fill('#q-pass2','hunter2'); await p.click('#o-next'); await p.waitForTimeout(700);
  console.log('registered ->', (await p.textContent('#done-h')).trim(), '| case', (await p.textContent('#done-code')).trim());
  await p.click('#o-next'); await p.waitForTimeout(700);
  console.log('in app:', await p.$eval('#app', e => !e.classList.contains('hide')));

  // ---------- questionnaire ----------
  await p.click('.nlink[data-p="checkin"]'); await p.waitForTimeout(400);
  const modes = [];
  for (let i=0;i<12;i++){
    const has = await p.$('#qbody .qmode');
    if (!has) break;
    const mode = await p.$eval('#qbody .qmode', e => e.className.replace('qmode ',''));
    const dom  = await p.$eval('#qbody .qdom', e => e.textContent);
    modes.push(mode + ':' + dom);
    // enforcement check: text question must have NO mic, voice question NO textarea
    const hasTA  = !!(await p.$('#qta'));
    const hasMic = !!(await p.$('#qmic'));
    if (mode === 'text'  && (hasMic || !hasTA)) console.log('!! text question offers a mic');
    if (mode === 'voice' && (hasTA || !hasMic)) console.log('!! voice question offers a keyboard');
    if (mode === 'scale') await p.click('#qbody .mo[data-m="2"]');
    else await p.click('#qbody [data-s="hard"]');
    await p.waitForTimeout(120);
    await p.click('#qnext'); await p.waitForTimeout(220);
  }
  console.log('questions asked:', modes.length);
  console.log(modes.join('\n  '));
  await p.click('#q-send'); await p.waitForTimeout(900);

  // ---------- did it persist? ----------
  const anita = await findCase('Anita');
  const sitting = anita.events.find(e => e.type === 'sitting');
  console.log('stored on disk -> case', anita.id, '| answers', sitting.answers.length,
              '| domains', Object.keys(sitting.domains).join(','));


  // reload = still signed in, data comes back from the server
  await p.reload(); await p.waitForTimeout(900);
  console.log('after reload, signed in:', await p.$eval('#app', e => !e.classList.contains('hide')));
  await p.click('.nlink[data-p="case"]'); await p.waitForTimeout(300);
  const facts = await p.textContent('#sv-facts');
  console.log('case page shows:', /Witness/.test(facts) ? 'role persisted' : 'ROLE LOST');

  // ---------- caseworker view ----------
  await p.click('#signout'); await p.waitForTimeout(600);
  await p.click('#land-signin'); await p.waitForTimeout(400);
  await p.fill('#li-user','anjali'); await p.fill('#li-pass','sahara123');
  await p.click('#li-go'); await p.waitForTimeout(900);
  console.log('worker caseload count:', await p.textContent('#cl-n'));
  const svVisible = await p.$eval('#roles button[data-r="sv"]', e => e.style.display !== 'none');
  console.log('survivor tab hidden for worker:', !svVisible);
  await p.click('#cw-tabs button[data-t="over"]'); await p.waitForTimeout(300);
  await p.screenshot({ path:'b-worker.png' });

  // open Anita's case -> domain bars + access log
  await p.click(`.ci[data-id="${anita.id}"]`); await p.waitForTimeout(500);
  const doms = await p.textContent('#domains');
  console.log('domain bars:', doms.replace(/\s+/g,' ').slice(0,120));
  await p.click('#cw-tabs button[data-t="time"]'); await p.waitForTimeout(300);
  console.log('access log:', (await p.textContent('#cw-access')).replace(/\s+/g,' ').slice(0,90));
  await p.screenshot({ path:'b-case.png' });

  // ---------- demo runner ----------
  await p.click('#roles button[data-r="dm"]'); await p.waitForTimeout(200);
  for (let i=0;i<11;i++){
    await p.click('#roles button[data-r="dm"]'); await p.waitForTimeout(120);
    await p.click('#d-next'); await p.waitForTimeout(420);
  }
  await p.click('#roles button[data-r="cw"]'); await p.waitForTimeout(400);
  console.log('demo end state:', (await p.textContent('#d-st')).trim(), '|', (await p.textContent('#score-tag')).trim());
  await p.screenshot({ path:'b-demo.png' });

  console.log('ERRORS:', errs.length ? errs : 'none');
  await b.close();
  srv.kill();
})();
