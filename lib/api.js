/* =====================================================================
   The API. One handler, used by both the local Node server and the
   Vercel function, so there is exactly one implementation to reason
   about and deploying cannot change how anything behaves.
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const Engine = require('../public/engine.js');
const { getStore, mkUser, checkPw, hashPw } = require('./store.js');

const SESSION_MS = 1000 * 60 * 60 * 8;            // 8 hours
const log = m => console.log('[prahari] ' + m);

let ready = null;
const store = () => getStore();
function whenReady(){ if (!ready) ready = store().init(); return ready; }

/* ---------- plumbing ---------- */
function send(res, code, obj, headers){
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  }, headers || {}));
  res.end(JSON.stringify(obj));
}
const ok   = (res, o, h) => send(res, 200, Object.assign({ ok:true }, o || {}), h);
const fail = (res, c, m) => send(res, c, { ok:false, error:m });

const cookie = token => ({
  'Set-Cookie': `sahara_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS/1000}` +
                (process.env.VERCEL || process.env.FORCE_SECURE_COOKIE ? '; Secure' : '')
});
const safeUser = u => ({ id:u.id, username:u.username, role:u.role, name:u.name || u.username, caseId:u.caseId });
const withAssessment = c => ({ case:c, assessment: Engine.assess(c) });

function readJSON(req){
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);   // Vercel pre-parses
  return new Promise((resolve, reject) => {
    let s = '', size = 0;
    req.on('data', d => {
      size += d.length;
      if (size > 1e6){ reject(new Error('body too large')); req.destroy(); return; }
      s += d;
    });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch(e){ resolve({}); } });
    req.on('error', reject);
  });
}

function tokenOf(req){
  const m = (req.headers.cookie || '').match(/sahara_session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}
async function sessionUser(req){
  const t = tokenOf(req);
  if (!t) return null;
  const s = await store().getSession(t);
  if (!s) return null;
  return await store().getUserById(s.userId);
}
async function newSession(userId){
  const token = crypto.randomBytes(32).toString('hex');
  await store().createSession(token, userId, Date.now() + SESSION_MS);
  return token;
}

async function nextCaseId(role){
  const prefix = role === 'Witness' ? 'WT' : 'SH';
  for (let i = 0; i < 200; i++){
    const id = prefix + '-' + (1000 + Math.floor(Math.random() * 8999));
    if (!(await store().getCase(id))) return id;
  }
  return prefix + '-' + Date.now().toString().slice(-4);
}

/* every read of a case by a human is written to the case's own log */
function logAccess(c, user, what){
  c.access = c.access || [];
  c.access.unshift({ t: Date.now(), who: user.name || user.username, role: user.role, what });
  c.access = c.access.slice(0, 60);
}

const SECURITY = {
  storage:  'Your answers are held in one database that only this application can reach. Nothing is sent to any third party, and there is no analytics or advertising code anywhere in Prahari.',
  passwords:'Your password is never stored. It is salted and stretched with PBKDF2-SHA512 over 120,000 rounds, and only the result is saved — nobody, including the people running Prahari, can read it back.',
  access:   'Only you and the support worker assigned to your case can open your record. Every single time somebody opens it, their name and the time are written to your access log, which you can read.',
  voice:    'Voice answers are turned into text in your own browser. The audio is never uploaded and never stored.',
  control:  'You choose what is shared, and you can change it or withdraw it at any time. Nothing is shared with police, courts or family unless you switch it on yourself.',
  demo:     'This is a hackathon prototype. Please use fictional information only.'
};

/* =====================================================================
   ROUTES
   ===================================================================== */
async function handle(req, res, pathname){
  await whenReady();

  const route = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const body  = ['POST','PATCH','PUT'].includes(req.method) ? await readJSON(req).catch(() => ({})) : {};
  const S = store();

  if (route[0] === 'health')
    return ok(res, { storage:S.kind, time:Date.now() });

  if (route[0] === 'security')
    return ok(res, { security: SECURITY });

  /* ---- register ---- */
  if (route[0] === 'register' && req.method === 'POST'){
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');
    if (!/^[a-z0-9_.-]{3,24}$/.test(username)) return fail(res, 400, 'Pick a username of 3–24 letters, numbers, dots, dashes or underscores.');
    if (password.length < 6) return fail(res, 400, 'Use a password of at least 6 characters.');
    if (await S.getUserByName(username)) return fail(res, 409, 'That username is already taken.');

    const p = body.profile || {};

    if (body.role === 'worker'){
      const u = await S.createUser(mkUser(username, password, 'worker', { name: p.name || username }));
      return ok(res, { user: safeUser(u) }, cookie(await newSession(u.id)));
    }

    const role = p.role === 'Unsure' ? 'Not yet stated' : (p.role || 'Victim');
    const worker = await S.anyWorker();
    const c = Engine.mkCase({
      id: await nextCaseId(role),
      alias: p.name || username, initials: String(p.name || username)[0].toUpperCase(),
      role, age: p.age || '', lang: p.lang || 'English', reasons: p.reasons || [],
      window: p.window || { when:'Any time', how:'Phone call' },
      safeword: String(p.safeword || '').toLowerCase(),
      consents: p.consents || { share:true, voice:true, trusted:false, research:false },
      minor: p.age === 'u18',
      worker: worker ? worker.name : 'Unassigned',
      workerId: worker ? worker.id : null,
      reviewedAt: Date.now(), lastContact: Date.now(), createdAt: Date.now()
    });
    if (c.minor) c.worker = (worker ? worker.name : 'Unassigned') + ' (child protection)';
    await S.putCase(c);
    const u = await S.createUser(mkUser(username, password, 'survivor', { caseId: c.id, name: c.alias }));
    log(`registered survivor ${username} -> case ${c.id}`);
    return ok(res, { user: safeUser(u), case: c }, cookie(await newSession(u.id)));
  }

  /* ---- login ---- */
  if (route[0] === 'login' && req.method === 'POST'){
    const u = await S.getUserByName(String(body.username || ''));
    /* same message and the same work either way, so the reply never
       reveals whether an account exists */
    if (!u || !checkPw(u, String(body.password || ''))){
      if (!u) hashPw(String(body.password || ''), 'decoy-salt-value');
      return fail(res, 401, 'That username and password do not match.');
    }
    log(`login ${u.username} (${u.role})`);
    return ok(res, { user: safeUser(u) }, cookie(await newSession(u.id)));
  }

  if (route[0] === 'logout'){
    const t = tokenOf(req);
    if (t) await S.deleteSession(t);
    return ok(res, {}, { 'Set-Cookie':'sahara_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  /* ---- everything past here needs a session ---- */
  const me = await sessionUser(req);
  if (!me) return fail(res, 401, 'Please sign in.');

  if (route[0] === 'me' && req.method === 'GET'){
    if (me.role === 'worker'){
      const load = await S.casesByWorker(me.id);
      return ok(res, { user: safeUser(me), caseload: load.map(withAssessment) });
    }
    const c = await S.getCase(me.caseId);
    if (!c) return fail(res, 404, 'Your case could not be found.');
    return ok(res, { user: safeUser(me), case: c, assessment: Engine.assess(c),
                     questions: Engine.pickQuestions(c.sittings || 0) });
  }

  if (route[0] === 'profile' && req.method === 'PATCH'){
    if (me.role !== 'survivor') return fail(res, 403, 'Only a survivor account can do that.');
    const c = await S.getCase(me.caseId);
    if (!c) return fail(res, 404, 'Case not found.');
    if (body.consents) c.consents = body.consents;
    if (typeof body.safeword === 'string') c.safeword = body.safeword.toLowerCase().trim();
    if (typeof body.pin === 'string' && /^\d{3,8}$/.test(body.pin)) c.pin = body.pin;
    if (typeof body.autoHide === 'boolean') c.autoHide = body.autoHide;
    if (body.window) c.window = body.window;
    await S.putCase(c);
    return ok(res, { case:c, assessment: Engine.assess(c) });
  }

  /* ---- a whole check-in sitting ---- */
  if (route[0] === 'checkin' && req.method === 'POST'){
    if (me.role !== 'survivor') return fail(res, 403, 'Only a survivor account can check in.');
    const c = await S.getCase(me.caseId);
    if (!c) return fail(res, 404, 'Case not found.');
    const answers = Array.isArray(body.answers) ? body.answers.slice(0, 40) : [];
    if (!answers.length) return fail(res, 400, 'Nothing was answered.');

    const r = Engine.scoreSitting(answers);
    c.events.push(Engine.ev('sitting', Date.now(), {
      text: r.answers.filter(a => a.text).map(a => a.text).join(' '),
      answers: r.answers, domains: r.domains, score: r.score,
      indicators: r.indicators, needs: r.needs,
      mood: (answers.find(a => a.mood) || {}).mood
    }));
    c.sittings = (c.sittings || 0) + 1;

    /* safe word — silent. The reply is identical either way. */
    const joined = answers.map(a => String(a.text || '')).join(' ').toLowerCase();
    if (c.safeword && joined.includes(c.safeword)){
      c.events.push(Engine.ev('duress', Date.now(), {
        text:`Safe word "${c.safeword}" appeared in a check-in. Treat as coercion until confirmed otherwise. Do not call — the survivor may not be alone.`
      }));
      log(`DURESS on ${c.id}`);
    }
    await S.putCase(c);
    return ok(res, { saved:true, case:c, assessment: Engine.assess(c),
                     questions: Engine.pickQuestions(c.sittings) });
  }

  if (route[0] === 'event' && req.method === 'POST'){
    if (me.role !== 'survivor') return fail(res, 403, 'Only a survivor account can do that.');
    const c = await S.getCase(me.caseId);
    const type = ['incident','panic'].includes(body.type) ? body.type : null;
    if (!type) return fail(res, 400, 'Unknown event type.');
    c.events.push(Engine.scoreEvent(Engine.ev(type, Date.now(), { text: String(body.text || '').slice(0, 4000) })));
    if (type === 'panic') log(`PANIC on ${c.id}`);
    await S.putCase(c);
    return ok(res, { case:c, assessment: Engine.assess(c) });
  }

  if (route[0] === 'cancel-panic' && req.method === 'POST'){
    const c = await S.getCase(me.caseId);
    if (!c) return fail(res, 404, 'Case not found.');
    c.events = c.events.filter(e => e.type !== 'panic');
    c.events.push(Engine.ev('review', Date.now(), { text:'Emergency alert cancelled by the survivor. The worker is still notified to confirm safety — a cancelled alert is never silently dropped.' }));
    await S.putCase(c);
    return ok(res, { case:c, assessment: Engine.assess(c) });
  }

  if (route[0] === 'caseload' && req.method === 'GET'){
    if (me.role !== 'worker') return fail(res, 403, 'Caseworkers only.');
    return ok(res, { caseload: (await S.casesByWorker(me.id)).map(withAssessment) });
  }

  if (route[0] === 'case' && route[1]){
    const c = await S.getCase(route[1]);
    if (!c) return fail(res, 404, 'Case not found.');
    const mine = me.role === 'worker' ? c.workerId === me.id : c.id === me.caseId;
    if (!mine) return fail(res, 403, 'That case is not assigned to you.');

    if (req.method === 'GET'){
      if (me.role === 'worker'){ logAccess(c, me, 'opened the case'); await S.putCase(c); }
      return ok(res, { case:c, assessment: Engine.assess(c) });
    }

    if (req.method === 'POST' && route[2] === 'action'){
      if (me.role !== 'worker') return fail(res, 403, 'Caseworkers only.');
      const note = String(body.note || '').slice(0, 2000);
      if (body.kind === 'review'){
        c.events.push(Engine.ev('review', Date.now(), { text:`Case reviewed by ${me.name}. Human-review gate cleared — the alert was seen and acted on by a named person.` }));
        c.reviewedAt = Date.now();
      } else if (body.kind === 'followup'){
        c.events.push(Engine.ev('review', Date.now(), { text:'Follow-up scheduled in 3 days. If it does not happen, this case re-surfaces automatically.' }));
      } else if (body.kind === 'intervention'){
        if (!note) return fail(res, 400, 'Describe what was actually done.');
        c.interventions.push({ t: Date.now(), note, closes: body.closes || '', by: me.name });
        c.events.push(Engine.ev('intervention', Date.now(), { text: note, closes: body.closes || '' }));
        c.lastContact = Date.now();
      } else return fail(res, 400, 'Unknown action.');
      logAccess(c, me, body.kind);
      await S.putCase(c);
      return ok(res, { case:c, assessment: Engine.assess(c) });
    }

    if (req.method === 'POST' && route[2] === 'simulate'){
      if (me.role !== 'worker') return fail(res, 403, 'Caseworkers only.');
      const before = Engine.assess(c);
      [['I am feeling a little better this week. The counselling helped a lot and I slept well for two nights.',3],
       ['Things are calmer. I managed to go back to work and I feel stronger than last month.',4]]
        .forEach(([t,m]) => c.events.push(Engine.scoreEvent(Engine.ev('followup', Date.now(), { text:t, mood:m }))));
      c.lastContact = Date.now();
      await S.putCase(c);
      return ok(res, { case:c, assessment: Engine.assess(c), before:{ score:before.score, label:before.state.label } });
    }
  }

  /* ---- demo helpers, kept clearly apart from the real routes ---- */
  if (route[0] === 'demo' && req.method === 'POST'){
    const c = me.role === 'survivor' ? await S.getCase(me.caseId) : await S.getCase(body.caseId || 'SH-2291');
    if (!c) return fail(res, 404, 'Case not found.');
    if (route[1] === 'missed'){
      c.events.push(Engine.ev('missed', Engine.ago(3), { text:'Scheduled check-in not completed.' }));
      c.events.push(Engine.ev('missed', Engine.ago(1), { text:'Scheduled check-in not completed.' }));
      c.lastContact = Engine.ago(16);
      await S.putCase(c);
      return ok(res, { case:c, assessment: Engine.assess(c) });
    }
    if (route[1] === 'reset'){
      const fresh = Engine.seedCases().find(x => x.id === 'SH-2291') || Engine.seedCases()[0];
      Object.assign(c, { events:fresh.events, interventions:[], closedNeeds:[], sittings:0,
                         reviewedAt: Engine.ago(6), lastContact: Engine.ago(4) });
      await S.putCase(c);
      return ok(res, { case:c, assessment: Engine.assess(c) });
    }
  }

  return fail(res, 404, 'No such endpoint.');
}

module.exports = { handle, fail, SESSION_MS };
