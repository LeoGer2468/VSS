<script>
/* =====================================================================
   AUTH
   ===================================================================== */
const SCREENS = ['#land','#auth','#onb','#app'];
function screen(id){
  SCREENS.forEach(s => { const el = $(s); if (el) el.classList.toggle('hide', s !== id); });
  window.scrollTo(0, 0);
}
const screenLand = () => screen('#land');
const screenAuth = () => screen('#auth');
const screenOnb  = () => screen('#onb');
const screenApp  = () => screen('#app');

/* landing -> auth / straight into registration */
function openAuth(tab){
  screenAuth();
  const b = $(`#aswitch button[data-a="${tab || 'in'}"]`);
  if (b) b.click();
}
['#land-signin','#land-signin-2'].forEach(id => { const el = $(id); if (el) el.onclick = () => openAuth('in'); });
['#land-start','#land-start-2','#land-start-3'].forEach(id => { const el = $(id); if (el) el.onclick = () => openAuth('up'); });
$('#land-demo').onclick = () => document.querySelector('.band').scrollIntoView({ behavior:'smooth', block:'start' });
$('#auth-back').onclick = () => screenLand();
function aerr(sel, msg){ const e = $(sel); e.textContent = msg; e.classList.toggle('on', !!msg); }

$$('#aswitch button').forEach(b => b.onclick = () => {
  $$('#aswitch button').forEach(x => x.classList.toggle('on', x === b));
  $('#a-in').style.display = b.dataset.a === 'in' ? '' : 'none';
  $('#a-up').style.display = b.dataset.a === 'up' ? '' : 'none';
  aerr('#li-err',''); aerr('#su-err','');
});

let signupRole = 'survivor';
$$('#su-role .opt').forEach(b => b.onclick = () => {
  $$('#su-role .opt').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); signupRole = b.dataset.v;
});

$('#li-go').onclick = async () => {
  const username = $('#li-user').value.trim(), password = $('#li-pass').value;
  if (!username || !password) return aerr('#li-err','Fill in both fields.');
  aerr('#li-err','');
  $('#li-go').disabled = true; $('#li-go').textContent = 'Signing in…';
  try {
    adopt(await API.post('/login', { username, password }));
    await afterAuth();
  } catch (e) {
    aerr('#li-err', e.message === 'offline' || e.message === 'Failed to fetch'
      ? 'Cannot reach the Prahari server. Start it with "node server.js" and reload.'
      : e.message);
  } finally { $('#li-go').disabled = false; $('#li-go').textContent = 'Sign in'; }
};
$('#li-pass').addEventListener('keydown', e => { if (e.key === 'Enter') $('#li-go').click(); });

$('#su-go').onclick = () => {
  aerr('#su-err','');
  if (signupRole === 'survivor'){ screenOnb(); step = 0; paint(); return; }
  /* caseworkers do not need the survivor questionnaire, so they get a short form */
  $('#a-up').innerHTML = `
    <h2>Caseworker account.</h2>
    <p class="cap" style="margin-top:6px">You will see only the cases assigned to you.</p>
    <div class="field" style="margin-top:18px"><label class="label" for="w-name">Your name</label><input class="inp" id="w-name" placeholder="e.g. Anjali Kaur"></div>
    <div class="field" style="margin-top:14px"><label class="label" for="w-user">Username</label><input class="inp" id="w-user" autocapitalize="off" spellcheck="false"></div>
    <div class="field" style="margin-top:14px"><label class="label" for="w-pass">Password</label><input class="inp" id="w-pass" type="password"></div>
    <button class="btn pri wide" style="margin-top:20px" id="w-go">Create caseworker account</button>
    <div class="note urg aerr" id="w-err"></div>`;
  $('#w-go').onclick = async () => {
    const username = $('#w-user').value.trim(), password = $('#w-pass').value, name = $('#w-name').value.trim();
    if (!username || !password) return aerr('#w-err','Fill in a username and a password.');
    try {
      adopt(await API.post('/register', { username, password, role:'worker', profile:{ name } }));
      await afterAuth();
    } catch (e) { aerr('#w-err', e.message); }
  };
};

$('#signout').onclick = async () => {
  try { await API.post('/logout'); } catch(e){}
  ME = null; CASES = []; MYCASE = null; activeId = null; at = 0;
  $('#li-user').value = ''; $('#li-pass').value = '';
  screenLand();
};

/* what happens once we know who you are */
async function afterAuth(){
  if (ME.role === 'worker'){
    adopt(await API.get('/caseload'));
    activeId = CASES.length ? CASES[0].id : null;
  } else {
    adopt(await API.get('/me'));
    activeId = MYCASE;
  }
  screenApp();
  $$('#roles button').forEach(b => b.style.display =
    (ME.role === 'worker' && b.dataset.r === 'sv') ? 'none' : '');
  goRole(ME.role === 'worker' ? 'cw' : 'sv');
  renderMaskSettings();
  renderSafety();
  resetQuestionnaire();
  renderAll();
}

/* =====================================================================
   ONBOARDING  (registration for survivors)
   ===================================================================== */
const LANGS = { 'en-IN':'English', 'hi-IN':'Hindi', 'mr-IN':'Marathi', 'bn-IN':'Bengali', 'ta-IN':'Tamil', 'te-IN':'Telugu' };
const P = { name:'', age:'', role:'', reasons:[], lang:'en-IN', when:'', how:'', safeword:'',
            consents:{ share:true, voice:true, trusted:false, research:false } };
const LAST = 9;
let step = 0;

function pickOne(wrap, key, after){
  $$(wrap + ' .opt').forEach(b => b.onclick = () => {
    $$(wrap + ' .opt').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); P[key] = b.dataset.v; after && after(b.dataset.v);
  });
}
function pickChipOne(wrap, key){
  $$(wrap + ' .chip').forEach(b => b.onclick = () => {
    $$(wrap + ' .chip').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); P[key] = b.dataset.v;
  });
}
pickOne('#q-age', 'age', v => { $('#minor-note').style.display = v === 'u18' ? 'block' : 'none'; });
pickOne('#q-role', 'role');
pickOne('#q-how', 'how');
pickChipOne('#q-when', 'when');
$$('#q-reason .chip').forEach(b => b.onclick = () => {
  b.classList.toggle('on');
  P.reasons = $$('#q-reason .chip.on').map(x => x.dataset.v);
});

$('#dots').innerHTML = Array.from({length:8}, () => '<i></i>').join('');
function paint(){
  $$('.onb-step').forEach(s => s.classList.toggle('on', +s.dataset.s === step));
  $$('#dots i').forEach((d,i) => { d.className = ''; if (i === step-1) d.className = 'on'; else if (i < step-1) d.className = 'done'; });
  $('#dots').style.visibility = (step >= 1 && step <= 8) ? 'visible' : 'hidden';
  $('#o-back').style.visibility = (step > 0 && step < LAST) ? 'visible' : 'hidden';
  $('#o-skip').style.display = [4,6].includes(step) ? '' : 'none';
  $('#o-next').textContent = step === 0 ? 'Get started' : step === 8 ? 'Create my account' : step === LAST ? 'Enter Prahari' : 'Continue';
  const notes = {
    0:'Nothing is saved until the last step.',
    1:'You can change this later under Support & privacy.',
    2:'Age decides which safeguarding rules apply — it is not shared beyond your team.',
    3:'', 4:'Both of these are optional.',
    5:'Your worker is blocked from contacting you outside this window.',
    6:'Skipping this is fine. You can set a safe word later.',
    7:'You can change every one of these at any time.',
    8:'This is the only point where anything is written to the server.',
    9:''
  };
  $('#o-note').textContent = notes[step] || '';
  $('.onb-body').scrollTop = 0;
}

$('#o-back').onclick = () => { if (step > 0){ step--; paint(); } else screenAuth(); };
$('#o-skip').onclick = () => { step++; paint(); };
$('#o-next').onclick = async () => {
  if (step === 1){
    P.name = $('#q-name').value.trim();
    if (!P.name){ $('#q-name').focus(); return toast('Give us any name at all — it does not have to be real.'); }
  }
  if (step === 2 && !P.age)  return toast('Choose one, or pick “Prefer not to say”.');
  if (step === 3 && !P.role) return toast('Choose one, or pick the last option.');
  if (step === 4) P.lang = $('#q-lang').value;
  if (step === 5){
    if (!P.when) return toast('Pick a time of day that is safe for you.');
    if (!P.how)  return toast('Choose how they should reach you.');
  }
  if (step === 6) P.safeword = $('#q-safe').value.trim().toLowerCase();
  if (step === 8) return register();
  if (step === LAST) return afterAuth();
  step++;
  if (step === 7) renderConsents($('#q-consent'), { consents:P.consents });
  paint();
};

async function register(){
  const username = $('#q-user').value.trim().toLowerCase();
  const pass = $('#q-pass').value, pass2 = $('#q-pass2').value;
  if (!/^[a-z0-9_.-]{3,24}$/.test(username)) return aerr('#q-err','Use 3–24 letters, numbers, dots, dashes or underscores.');
  if (pass.length < 6)  return aerr('#q-err','Use a password of at least 6 characters.');
  if (pass !== pass2)   return aerr('#q-err','The two passwords do not match.');
  aerr('#q-err','');
  $('#o-next').disabled = true; $('#o-next').textContent = 'Creating…';
  try {
    const profile = { name:P.name, age:P.age, role:P.role, reasons:P.reasons,
                      lang:LANGS[P.lang] || 'English', window:{ when:P.when || 'Any time', how:P.how || 'Phone call' },
                      safeword:P.safeword, consents:P.consents };
    const data = await API.post('/register', { username, password:pass, role:'survivor', profile });
    adopt(data);
    const c = data.case;
    $('#done-h').textContent = `Thank you, ${c.alias}.`;
    $('#done-code').textContent = c.id;
    $('#done-worker').textContent = c.worker;
    $('#done-sum').innerHTML = [
      `<div><b>Here as</b> · ${esc(c.role)}</div>`,
      c.reasons.length ? `<div><b>About</b> · ${c.reasons.map(esc).join(', ')}</div>` : '',
      `<div><b>Language</b> · ${esc(c.lang)}</div>`,
      `<div><b>Safe to contact</b> · ${esc(c.window.when)}, ${esc(c.window.how.toLowerCase())}</div>`,
      c.safeword ? `<div><b>Safe word</b> · set (only you and the system know it)</div>` : `<div><b>Safe word</b> · not set — you can add one later</div>`,
      c.minor ? `<div style="color:var(--elev)"><b>Child protection route</b> · an appropriate adult will be involved</div>` : ''
    ].join('');
    step = LAST; paint();
  } catch (e) {
    aerr('#q-err', e.message === 'offline' || e.message === 'Failed to fetch'
      ? 'Cannot reach the Prahari server. Start it with "node server.js" and reload.' : e.message);
  } finally { $('#o-next').disabled = false; $('#o-next').textContent = step === 8 ? 'Create my account' : 'Enter Prahari'; }
}

/* =====================================================================
   NAVIGATION
   ===================================================================== */
$$('#roles button').forEach(b => b.onclick = () => {
  $$('#roles button').forEach(x => x.classList.toggle('on', x === b));
  $$('.role').forEach(s => s.classList.toggle('on', s.id === 'r-' + b.dataset.r));
  syncMobileNav();
  window.scrollTo({ top:0, behavior:'smooth' });
});
const goRole = r => $(`#roles button[data-r="${r}"]`).click();
function syncMobileNav(){
  const svOn = $('#r-sv').classList.contains('on');
  $('#mnav').style.display = svOn ? '' : 'none';
}
function goPane(p){
  $$('.nlink').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  $$('#mnav button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  $$('.pane').forEach(s => s.classList.toggle('on', s.dataset.p === p));
  goRole('sv'); window.scrollTo({ top:0, behavior:'smooth' });
}
$$('.nlink').forEach(b => b.onclick = () => goPane(b.dataset.p));
$$('#mnav button').forEach(b => b.onclick = () => goPane(b.dataset.p));
$$('[data-jump]').forEach(b => b.onclick = () => goPane(b.dataset.jump));
$('#go-help').onclick = () => goPane('support');
$$('#cw-tabs button').forEach(b => b.onclick = () => {
  $$('#cw-tabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.cwt').forEach(s => s.style.display = s.dataset.t === b.dataset.t ? '' : 'none');
});
const goTab = t => $(`#cw-tabs button[data-t="${t}"]`).click();

/* =====================================================================
   THE QUESTIONNAIRE
   Each question is fixed to one answer mode and the UI enforces it:
   a voice question offers no keyboard, a written one offers no mic.
   ===================================================================== */
const SAMPLE = {
  calm: {
    days:'The last few days have been steady. Nothing dramatic, I got through the week.',
    sleep:'I have been sleeping better this week, maybe six hours most nights.',
    unsafe:'No, nothing has happened. It has been quiet.',
    contact:'No contact at all this week.',
    who:'I spoke to my sister twice and a neighbour on Sunday.',
    home:'Home is calm at the moment. Quiet, actually.',
    eat:'Eating properly, three meals most days.',
    routine:'Work went fine, I did all five days.',
    money:'Money is tight but manageable this month.',
    health:'No pain, nothing to report.',
    case:'I am waiting for the hearing date but I feel okay about it.',
    depend:'The children are fine, school is going well for them.',
    forward:'My sister is visiting next month, I am looking forward to that.',
    coping:'Being at work helped, and talking to my sister helped a lot.',
    need:'Nothing I can think of right now.',
    helped:'Yes, I feel supported at the moment.'
  },
  hard: {
    days:'The last few days have been hard. I feel scared all the time and some days I think there is no point in any of this.',
    sleep:'I am not sleeping. I am awake all night and I barely slept two hours.',
    unsafe:'He came and stood outside my house on Tuesday night and waited there.',
    contact:'He called me again three times and sent messages from a new number.',
    who:'Nobody really. I have spoken to no one this week.',
    home:'No. I stay inside most days and I do not want to talk to the neighbours.',
    eat:'I have not eaten properly, I have no appetite and I forget to eat.',
    routine:'I stopped going to work. I could not face it.',
    money:'I could not pay the rent this month and I lost my job.',
    health:'I have a headache every day and my chest feels tight.',
    case:'Nobody has told me anything about the hearing and I need a lawyer who can explain.',
    depend:'My daughter keeps asking questions and I do not know what to tell her.',
    forward:'Nothing to look forward to really. Nothing will change.',
    coping:'I am not sure anything helped this week. I am tired of everything.',
    need:'I need somewhere to stay and someone to talk to.',
    helped:'It does not feel like anyone is actually helping.'
  }
};

let qIdx = 0, qAnswers = [], qMood = null, qTranscript = '';

function resetQuestionnaire(){
  qIdx = 0; qAnswers = []; qMood = null; qTranscript = '';
  if (!QSET.length) QSET = pickQuestions((survivor() && survivor().sittings) || 0);
  renderQuestion();
}

function renderQuestion(){
  const body = $('#qbody');
  $('#qbar').style.width = Math.round((qIdx / QSET.length) * 100) + '%';

  if (qIdx >= QSET.length) return renderQuestionDone();

  const q = QSET[qIdx];
  const modeLabel = q.mode === 'voice' ? 'Speak your answer' : q.mode === 'text' ? 'Write your answer' : 'One tap';
  $('#q-title').textContent = 'Check in';
  $('#q-sub').textContent = `Question ${qIdx+1} of ${QSET.length}. Answer what you want, skip what you don't.`;

  let input = '';
  if (q.mode === 'scale'){
    input = `<div class="mood-row" id="moods">
      ${[[5,'Good','#4E8C63'],[4,'Okay','#7FA46B'],[3,'Flat','#C7A44B'],[2,'Low','#C97F4B'],[1,'Struggling','#B5563E']]
        .map(([m,l,col]) => `<button class="mo ${qMood===m?'on':''}" data-m="${m}"><i class="bl" style="background:${col}"></i><span class="lb">${l}</span></button>`).join('')}
    </div>`;
  } else if (q.mode === 'text'){
    input = `<textarea class="inp" id="qta" placeholder="In your own words…" enterkeyhint="done"></textarea>
      <div style="display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-top:14px">
        <span class="t-fine">Examples:</span>
        <button class="btn sm" data-s="calm">a steady week</button>
        <button class="btn sm" data-s="hard">a hard week</button>
      </div>`;
  } else {
    input = `<div class="mic-wrap">
        <button class="mic" id="qmic" aria-label="Record">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>
        </button>
        <span class="t-small" id="qmic-state">Tap and speak — there is no keyboard for this one</span>
      </div>
      <div class="tsc" id="qtsc">Your words appear here first. Nothing is sent until you press continue.</div>
      <div style="display:flex;flex-wrap:wrap;gap:9px;align-items:center;margin-top:14px">
        <span class="t-fine">No microphone? Use a sample:</span>
        <button class="btn sm" data-s="calm">steady</button>
        <button class="btn sm" data-s="hard">hard week</button>
      </div>`;
  }

  body.innerHTML = `<div class="panel">
      <div class="qhead">
        <span class="qdom">${esc(DOMAINS[q.domain] || q.domain)}</span>
        <span class="qmode ${q.mode}">${modeLabel}</span>
      </div>
      <div class="qtext">${esc(q.q)}</div>
      <p class="qwhy">${esc(q.why)}</p>
      ${input}
      <div class="qnav">
        <button class="btn ghost" id="qback" ${qIdx===0?'style="visibility:hidden"':''}>Back</button>
        <span class="grow"></span>
        <button class="btn ghost" id="qskip">Skip this</button>
        <button class="btn pri" id="qnext">${qIdx === QSET.length-1 ? 'Finish check-in' : 'Continue'}</button>
      </div>
    </div>`;

  qTranscript = '';
  const prev = qAnswers.find(a => a.qid === q.id);
  if (prev && q.mode === 'text' && $('#qta')) $('#qta').value = prev.text || '';
  if (prev && q.mode === 'voice') setQTranscript(prev.text || '');

  $$('#qbody [data-s]').forEach(b => b.onclick = () => {
    const t = SAMPLE[b.dataset.s][q.id] || SAMPLE[b.dataset.s].days;
    if (q.mode === 'text') $('#qta').value = t; else setQTranscript(t);
  });
  $$('#qbody .mo').forEach(b => b.onclick = () => {
    $$('#qbody .mo').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); qMood = +b.dataset.m;
  });
  if ($('#qmic')) $('#qmic').onclick = () => startVoice(q);
  $('#qback').onclick = () => { if (qIdx > 0){ qIdx--; renderQuestion(); } };
  $('#qskip').onclick = () => { qIdx++; renderQuestion(); };
  $('#qnext').onclick = () => {
    const q2 = QSET[qIdx];
    if (q2.mode === 'scale' && qMood) recordAnswer(q2, { mood:qMood });
    if (q2.mode === 'text'){ const v = $('#qta').value.trim(); if (v) recordAnswer(q2, { text:v }); }
    if (q2.mode === 'voice' && qTranscript.trim()) recordAnswer(q2, { text:qTranscript.trim() });
    qIdx++; renderQuestion();
  };
}

function recordAnswer(q, o){
  const i = qAnswers.findIndex(a => a.qid === q.id);
  const rec = Object.assign({ qid:q.id, mode:q.mode }, o);
  if (i >= 0) qAnswers[i] = rec; else qAnswers.push(rec);
}

function setQTranscript(t){
  qTranscript = t;
  const el = $('#qtsc');
  if (!el) return;
  el.textContent = t || 'Your words appear here first. Nothing is sent until you press continue.';
  el.classList.toggle('has', !!t);
}

function renderQuestionDone(){
  const answered = qAnswers.length;
  $('#qbar').style.width = '100%';
  $('#q-title').textContent = 'That is everything';
  $('#q-sub').textContent = 'Thank you for taking the time.';
  $('#qbody').innerHTML = `<div class="panel qdone">
      <div class="qtext">Thank you.</div>
      <p class="t-body" style="max-width:42ch;margin:8px auto 0">You answered ${answered} of ${QSET.length} question${QSET.length>1?'s':''}. Your worker will read this — nothing about it is decided by a machine.</p>
      <div style="display:flex;justify-content:center;flex-wrap:wrap;gap:10px;margin-top:24px">
        <button class="btn" id="q-again">Go back and add more</button>
        <button class="btn pri" id="q-send" ${answered?'':'disabled'}>Send my check-in</button>
      </div>
    </div>`;
  $('#q-again').onclick = () => { qIdx = 0; renderQuestion(); };
  $('#q-send').onclick = sendCheckin;
}

async function sendCheckin(){
  if (!qAnswers.length) return toast('Nothing has been answered yet.');
  $('#q-send').disabled = true; $('#q-send').textContent = 'Sending…';
  try {
    if (OFFLINE){
      const c = survivor();
      const r = scoreSitting(qAnswers);
      c.events.push(ev('sitting', now(), { text:r.answers.filter(a=>a.text).map(a=>a.text).join(' '),
        answers:r.answers, domains:r.domains, score:r.score, indicators:r.indicators, needs:r.needs,
        mood:(qAnswers.find(a=>a.mood)||{}).mood }));
      c.sittings = (c.sittings||0) + 1;
      const joined = qAnswers.map(a => String(a.text||'')).join(' ').toLowerCase();
      if (c.safeword && joined.includes(c.safeword))
        c.events.push(ev('duress', now(), { text:`Safe word "${c.safeword}" appeared in a check-in. Treat as coercion until confirmed otherwise. Do not call — the survivor may not be alone.` }));
      QSET = pickQuestions(c.sittings);
      localSave();
    } else {
      adopt(await API.post('/checkin', { answers: qAnswers }));
    }
    /* the reply is deliberately identical whether or not a safe word was used */
    toast('Check-in received. Thank you.');
    qIdx = 0; qAnswers = []; qMood = null; qTranscript = '';
    renderAll(); renderQuestion(); goPane('home');
  } catch (e) {
    toast('Could not send: ' + e.message);
    $('#q-send').disabled = false; $('#q-send').textContent = 'Send my check-in';
  }
}

/* voice, restricted to voice questions */
let recog = null, listening = false;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function startVoice(){
  if (!SR){ toast('This browser cannot listen. Use one of the sample answers.'); return; }
  if (listening){ recog && recog.stop(); return; }
  recog = new SR();
  recog.lang = P.lang || 'en-IN';
  recog.interimResults = true; recog.continuous = true;
  let final = '';
  recog.onstart  = () => { listening = true; $('#qmic') && $('#qmic').classList.add('rec');
                           $('#qmic-state') && ($('#qmic-state').textContent = 'Listening — tap again to stop'); };
  recog.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++){
      const r = e.results[i];
      if (r.isFinal) final += r[0].transcript + ' '; else interim += r[0].transcript;
    }
    setQTranscript((final + interim).trim());
  };
  recog.onerror = () => toast('Could not hear anything. You can use a sample answer.');
  recog.onend   = () => { listening = false; $('#qmic') && $('#qmic').classList.remove('rec');
                          $('#qmic-state') && ($('#qmic-state').textContent = qTranscript ? 'Tap to record again' : 'Tap and speak'); };
  recog.start();
}

/* =====================================================================
   SURVIVOR — incident, panic, settings
   ===================================================================== */
async function saveProfile(patch, msg){
  const c = survivor(); if (!c) return;
  Object.assign(c, patch);
  if (OFFLINE){ localSave(); return msg && toast(msg); }
  try { adopt(await API.patch('/profile', patch)); msg && toast(msg); }
  catch (e){ toast('Could not save: ' + e.message); }
}

$('#fill-inc').onclick = () => {
  $('#inc').value = 'He came and stood outside my house at around 9pm last night and waited there for almost an hour. My neighbour saw him too.';
};
$('#send-inc').onclick = async () => {
  const t = $('#inc').value.trim();
  if (!t) return toast('Describe what happened, or tap the example.');
  await addEvent('incident', t);
  $('#inc').value = '';
  toast('Saved with a timestamp and a tamper-evident reference.');
  goPane('home');
};

async function addEvent(type, text){
  const c = survivor();
  if (OFFLINE){
    c.events.push(scoreEvent(ev(type, now(), { text })));
    if (text && c.safeword && text.toLowerCase().includes(c.safeword))
      c.events.push(ev('duress', now(), { text:`Safe word "${c.safeword}" appeared in a check-in.` }));
    localSave(); renderAll(); return;
  }
  try { adopt(await API.post('/event', { type, text })); renderAll(); }
  catch (e){ toast('Could not save: ' + e.message); }
}

$('#save-safe').onclick = () => {
  const w = $('#safeword').value.trim().toLowerCase();
  saveProfile({ safeword:w }, w ? 'Safe word saved. Use it in any answer.' : 'Safe word removed.');
};
$('#test-safe').onclick = () => { goRole('cw'); if (survivor()) activeId = survivor().id; renderCase(); goTab('why');
  toast('This is the caseworker side — the survivor sees none of it.'); };

/* panic */
let hold = null, holdT = 0;
const panic = $('#panic'), fl = $('#panic-fl');
function startHold(e){
  e.preventDefault(); if (panicOn) return;
  holdT = Date.now(); $('#panic-lb').textContent = 'Keep holding…';
  hold = setInterval(() => {
    const p = Math.min(1, (Date.now()-holdT)/2000);
    fl.style.width = (p*100) + '%';
    if (p >= 1){ endHold(); firePanic(); }
  }, 40);
}
function endHold(){ clearInterval(hold); hold = null; fl.style.width = '0%'; if (!panicOn) $('#panic-lb').textContent = 'Hold to send an emergency alert'; }
['mousedown','touchstart'].forEach(t => panic.addEventListener(t, startHold, { passive:false }));
['mouseup','mouseleave','touchend','touchcancel'].forEach(t => panic.addEventListener(t, endHold));

async function firePanic(){
  panicOn = true;
  const c = survivor();
  await addEvent('panic', 'Emergency alert triggered by the survivor from the app.');
  $('#panic-lb').textContent = 'Alert sent — help has been notified';
  panic.style.background = '#8E402D';
  $('#panic-sent').classList.add('on');
  $('#panic-meta').innerHTML =
    `Sent ${new Date().toLocaleTimeString()} · reference PA-${Math.floor(Math.random()*9000+1000)}<br>` +
    `Notified: ${esc(c.worker)}${c.consents.trusted ? ' · your trusted contact' : ''} · 24×7 helpline (simulated)<br>` +
    `Approximate location shared: <b>${c.consents.share ? 'yes' : 'no'}</b>`;
  toast('Emergency alert sent to your support worker.');
  renderAll();
}
$('#panic-cancel').onclick = async () => {
  const c = survivor();
  if (OFFLINE){
    c.events = c.events.filter(e => e.type !== 'panic');
    c.events.push(ev('review', now(), { text:'Emergency alert cancelled by the survivor. The worker is still notified to confirm safety.' }));
    localSave();
  } else { try { adopt(await API.post('/cancel-panic')); } catch(e){ toast(e.message); } }
  panicOn = false;
  $('#panic-sent').classList.remove('on'); panic.style.background = '';
  $('#panic-lb').textContent = 'Hold to send an emergency alert';
  toast('Cancelled. Your worker will still check in once.');
  renderAll();
};

/* what the server says about how your data is held */
async function renderSafety(){
  const el = $('#safety');
  if (!el) return;
  const fallback = {
    storage:'Running without the server, so nothing is being stored at all — this session lives in memory and disappears when you close the tab.',
    control:'You choose what is shared, and you can change it at any time.'
  };
  let s = fallback;
  if (!OFFLINE){ try { s = (await API.get('/security')).security; } catch(e){} }
  el.innerHTML = Object.keys(s).map(k => `<div class="acc"><span class="aw">${esc(s[k])}</span></div>`).join('');
}

/* =====================================================================
   CASEWORKER
   ===================================================================== */
async function caseAction(kind, extra){
  const c = active(); if (!c) return;
  if (OFFLINE){
    const note = (extra && extra.note) || '', follow = (extra && extra.followUp) || '';
    c.actions = c.actions || [];
    c.actions.unshift({ t:now(), kind, by:c.worker, note, followUp:follow });
    if (kind === 'review'){
      c.events.push(ev('review', now(), { text:`Case reviewed by ${c.worker}. Human-review gate cleared.${note ? ' Note: ' + note : ''}` }));
      c.reviewedAt = now();
    } else if (kind === 'followup'){
      c.followUp = follow;
      c.events.push(ev('review', now(), { text: follow ? `Follow-up scheduled for ${follow} by ${c.worker}.` : 'Follow-up scheduled.' }));
    } else if (kind === 'resolve'){
      c.resolved = true;
      c.events.push(ev('review', now(), { text:`Case closed by ${c.worker}.${note ? ' ' + note : ''}` }));
    } else {
      const text = (note || ACT_TEXT[kind] || 'Intervention recorded.') + (ACT_TEXT[kind] ? ` (by ${c.worker})` : '');
      const closes = (extra && extra.closes) || (kind === 'counsel' ? 'counsel' : kind === 'legal' ? 'legal' : '');
      c.interventions.push({ t:now(), note:note || ACT_TEXT[kind] || '', closes, kind });
      c.events.push(ev('intervention', now(), { text, closes }));
      c.lastContact = now();
      if (follow) c.followUp = follow;
    }
    localSave(); renderAll(); return;
  }
  try { adopt(await API.post(`/case/${c.id}/action`, Object.assign({ kind }, extra || {}))); renderAll(); }
  catch (e){ toast(e.message); }
}
/* the six actions a worker can take, each recorded with who and when */
function actionNote(){ const el = $('#a-note'); return el ? el.value.trim() : ''; }
function actionDate(){ const el = $('#a-date'); return el ? el.value : ''; }
function clearAction(){ if ($('#a-note')) $('#a-note').value = ''; }

const ACT_TEXT = {
  contact: 'Spoke with the survivor and confirmed immediate safety.',
  counsel: 'Referred to a counsellor. First session being arranged.',
  legal:   'Referred to a legal advocate for case guidance and representation.',
  safety:  'Safety concern reviewed with the survivor. Risks documented and a safety plan agreed.'
};
const ACT_TOAST = {
  review:  'Reviewed. The decision now belongs to a named person.',
  contact: 'Contact recorded — the "nobody forgotten" clock resets.',
  counsel: 'Counsellor referral logged.',
  legal:   'Legal advocate referral logged.',
  safety:  'Safety review logged.',
  followup:'Follow-up scheduled.',
  resolve: 'Case marked resolved. It re-opens automatically if new indicators appear.'
};

async function takeAction(kind){
  const note = actionNote(), followUp = actionDate();
  await caseAction(kind, { note, followUp });
  clearAction();
  toast(ACT_TOAST[kind] || 'Action recorded.');
}
['review','contact','counsel','legal','safety','follow','resolve'].forEach(k => {
  const el = $('#a-' + k); if (!el) return;
  const kind = k === 'follow' ? 'followup' : k;
  el.onclick = () => takeAction(kind);
});

$('#iv-save').onclick = async () => {
  const note = $('#iv-note').value.trim(), closes = $('#iv-need').value;
  if (!note) return toast('Describe what was actually done.');
  await caseAction('intervention', { note, closes });
  $('#iv-note').value = '';
  toast(closes ? 'Logged, and "' + NEEDS[closes].label + '" closed out.' : 'Intervention logged.');
};
$('#sim-follow').onclick = async () => {
  const c = active(); if (!c) return;
  const before = look(c);
  if (OFFLINE){
    [['I am feeling a little better this week. The counselling helped a lot and I slept well for two nights.',3],
     ['Things are calmer. I managed to go back to work and I feel stronger than last month.',4]]
      .forEach(([t,m]) => c.events.push(scoreEvent(ev('followup', now(), { text:t, mood:m }))));
    c.lastContact = now(); localSave();
  } else {
    try { adopt(await API.post(`/case/${c.id}/simulate`)); } catch(e){ return toast(e.message); }
  }
  const after = look(active());
  active()._outcome = `<div class="note brand"><b>Closed-loop outcome</b><br>
    Priority score <b>${before.score}</b> (${before.state.label}) → <b>${after.score}</b> (${after.state.label}) across two follow-up check-ins after the intervention.
    ${after.score < before.score
      ? 'The trend is moving in the right direction — the help that was promised is showing up in the survivor\'s own words.'
      : 'No improvement yet. This case stays in the review queue.'}</div>`;
  toast('Follow-up simulated — the trend has been recalculated.');
  renderAll();
};
</script>
