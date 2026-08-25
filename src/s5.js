<script>
/* =====================================================================
   State and the API client.
   The engine above is the same file the server runs, so a score shown
   here is the score the backend computed, not a second opinion.
   ===================================================================== */
const { DAY, now, ago, LEX, NEEDS, DOMAINS, QUESTIONS, STATES, STAGES, pickQuestions,
        stateFor, analyze, voiceFeatures, ev, scoreEvent, scoreSitting,
        domainScores, openNeedsOf, missedGaps, assess, mkCase, seedCases,
        toLevel, baseline, caseStage, scenarios, multimodal, readCamera } = Engine;

let ME = null;              /* signed-in user */
let CASES = [];             /* what this user is allowed to see */
let MYCASE = null;          /* a survivor's own case id */
let activeId = null;
let QSET = [];              /* questions served for this sitting */
let OFFLINE = false;        /* no server reachable — local demo mode */
let panicOn = false;

const getCase  = id => CASES.find(c => c.id === id);
const active   = () => getCase(activeId) || CASES[0] || null;
const survivor = () => getCase(MYCASE) || CASES.find(c => c.id === 'SH-2291') || CASES[0] || null;

/* ---------------------------------------------------------------
   API — every call goes through here, so there is exactly one place
   that knows how to talk to the backend, and one place that decides
   what to do when the backend is not there.
   --------------------------------------------------------------- */
const API = {
  async call(method, path, body){
    if (OFFLINE) throw new Error('offline');
    const res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type':'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch(e){}
    if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || ('HTTP ' + res.status)), { status:res.status });
    return data;
  },
  get:   p       => API.call('GET', p),
  post:  (p,b)   => API.call('POST', p, b || {}),
  patch: (p,b)   => API.call('PATCH', p, b || {})
};

/* Adopt whatever the server just told us. One function, so state can
   never drift out of step with the backend. */
function adopt(data){
  if (data.user) ME = data.user;
  if (data.caseload){
    CASES = data.caseload.map(x => x.case);
    CASES.forEach((c,i) => c._a = data.caseload[i].assessment);
  }
  if (data.case){
    const i = CASES.findIndex(c => c.id === data.case.id);
    if (i >= 0) CASES[i] = data.case; else CASES.push(data.case);
    if (data.assessment) data.case._a = data.assessment;
    if (ME && ME.role === 'survivor') MYCASE = data.case.id;
  }
  if (data.questions) QSET = data.questions;
  if (!activeId && CASES.length) activeId = (survivor() || CASES[0]).id;
}

/* The assessment the server computed, with a local recompute as a
   fallback so the offline demo still works. */
const look = c => (c && c._a) || (c ? assess(c) : null);

/* ---------------------------------------------------------------
   Local demo mode. If there is no backend — the file was opened
   straight off disk, or node was never started — Prahari still runs,
   holding everything in memory for the length of the session. The
   banner says so, so nobody mistakes it for the real thing.
   --------------------------------------------------------------- */
function goOffline(reason){
  OFFLINE = true;
  CASES = seedCases();
  CASES.forEach(c => { c.workerId = 'local'; c.pin = '2580'; });
  MYCASE = 'SH-2291';
  activeId = 'SH-2291';
  QSET = pickQuestions(0);
  ME = ME || { username:'demo', role:'survivor', name:'Meera', caseId:'SH-2291' };
  console.warn('[Prahari] local demo mode — ' + reason);
}

/* keep local state in step after a local (offline) mutation */
function localSave(){ CASES.forEach(c => { c._a = assess(c); }); }
</script>
