<script>
/* =====================================================================
   SAFETY MASK — Prahari becomes a working calculator, instantly.
   ===================================================================== */
const MASK = { pin:'2580', auto:false, idleMs:120000 };
let masked = false, idleTimer = null, realTitle = document.title;

function maskOn(){
  if (masked) return;
  masked = true; calcClear();
  $('#mask').classList.add('on');
  document.title = 'Calculator';
  clearTimeout(idleTimer);
}
function maskOff(){ masked = false; $('#mask').classList.remove('on'); document.title = realTitle; armIdle(); }
$('#mask-btn').onclick = maskOn;
$('#quiet').onclick = maskOn;
$('#try-mask').onclick = () => { toast('Type ' + MASK.pin + ' then = to come back.'); setTimeout(maskOn, 700); };
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#app').classList.contains('hide')){ e.preventDefault(); maskOn(); }
});
function armIdle(){
  clearTimeout(idleTimer);
  if (MASK.auto && !masked) idleTimer = setTimeout(maskOn, MASK.idleMs);
}
['click','keydown','touchstart','scroll'].forEach(t =>
  document.addEventListener(t, () => { if (!masked) armIdle(); }, { passive:true }));

function renderMaskSettings(){
  const c = survivor();
  if (c && c.pin) MASK.pin = c.pin;
  if (c && typeof c.autoHide === 'boolean') MASK.auto = c.autoHide;
  $('#pin').value = MASK.pin;
  $('#autohide').innerHTML =
    `<label class="tog" style="border-bottom:0;padding-bottom:0"><input type="checkbox" id="ah" ${MASK.auto?'checked':''}><i class="sw"></i>
      <span class="grow"><span class="tl2">Hide by itself when I stop using it</span>
      <span class="ds">After two minutes untouched, the calculator appears on its own — so a phone left face-up is never sitting open on your case.</span></span></label>`;
  $('#ah').onchange = e => {
    MASK.auto = e.target.checked; armIdle();
    saveProfile({ autoHide: MASK.auto }, MASK.auto ? 'Prahari will hide itself after two minutes.' : 'Automatic hiding turned off.');
  };
}
$('#save-pin').onclick = () => {
  const v = $('#pin').value.replace(/\D/g,'');
  if (v.length < 3) return toast('Use at least three digits.');
  MASK.pin = v;
  saveProfile({ pin:v }, 'Code saved. Type it into the calculator and press = to come back.');
};

/* the calculator genuinely calculates */
let cAcc = null, cOp = null, cFresh = true, cBuf = '0';
const cShow = () => { $('#cd').textContent = cBuf.length > 9 ? (+cBuf).toPrecision(7).replace(/\.?0+e/,'e') : cBuf; };
function calcClear(){ cAcc = null; cOp = null; cFresh = true; cBuf = '0'; cShow(); }
function calcApply(){
  const b = parseFloat(cBuf);
  if (cAcc === null || cOp === null) return b;
  const a = cAcc;
  const r = cOp === '+' ? a+b : cOp === '-' ? a-b : cOp === '*' ? a*b : b === 0 ? NaN : a/b;
  return Math.round(r * 1e10) / 1e10;
}
$$('#mask .ck').forEach(b => b.onclick = () => {
  const k = b.dataset.k;
  if (k === 'c'){ calcClear(); return; }
  if (/^[0-9]$/.test(k)){ cBuf = (cFresh || cBuf === '0') ? k : cBuf + k; cFresh = false; return cShow(); }
  if (k === '.'){ if (cFresh){ cBuf = '0.'; cFresh = false; } else if (!cBuf.includes('.')) cBuf += '.'; return cShow(); }
  if (k === 'neg'){ cBuf = cBuf.startsWith('-') ? cBuf.slice(1) : '-' + cBuf; return cShow(); }
  if (k === 'pct'){ cBuf = String(parseFloat(cBuf) / 100); return cShow(); }
  if (k === '='){
    if (cOp === null && cBuf === MASK.pin){ maskOff(); return; }
    const r = calcApply(); cAcc = null; cOp = null; cFresh = true;
    cBuf = isNaN(r) ? 'Error' : String(r); return cShow();
  }
  const r = calcApply(); cAcc = isNaN(r) ? 0 : r; cOp = k; cFresh = true;
  cBuf = String(cAcc); cShow();
});
calcClear();

/* =====================================================================
   DEMO RUNNER
   The scripted demo runs on local data so one person can play both the
   survivor and the caseworker. The live app keeps its real access
   control — a survivor account genuinely cannot open anyone else's case.
   ===================================================================== */
function ensureDemoMode(){
  if (OFFLINE) return;
  goOffline('demo runner');
  $('#demomark').textContent = 'Demo sandbox · local data';
  $$('#roles button').forEach(b => b.style.display = '');
  renderMaskSettings(); renderSafety(); resetQuestionnaire(); renderAll(); syncMobileNav();
  toast('Demo sandbox: local data, both roles available. Sign out and back in for live data.');
}

/* build a whole sitting from the sample answers, as if she had typed them */
function autoSitting(kind){
  const c = survivor();
  const answers = QSET.map(q => {
    if (q.mode === 'scale') return { qid:q.id, mode:'scale', mood: kind === 'hard' ? 2 : 4 };
    const t = SAMPLE[kind][q.id];
    return t ? { qid:q.id, mode:q.mode, text:t } : null;
  }).filter(Boolean);
  const r = scoreSitting(answers);
  c.events.push(ev('sitting', now(), {
    text: r.answers.filter(a => a.text).map(a => a.text).join(' '),
    answers: r.answers, domains: r.domains, score: r.score,
    indicators: r.indicators, needs: r.needs, mood: kind === 'hard' ? 2 : 4
  }));
  c.sittings = (c.sittings || 0) + 1;
  QSET = pickQuestions(c.sittings);
  localSave();
}


/* =====================================================================
   DEMO SCENARIOS
   Three fictional cases loaded side by side, so a judge can see green,
   amber and red in one queue and compare them. Local sandbox only.
   ===================================================================== */
let scenarioLoaded = false;

function loadScenarios(pick){
  ensureDemoMode();
  if (!scenarioLoaded){
    const S = scenarios();
    /* keep them in one caseload so the priority queue tells the story */
    CASES = [S.threat, S.decline, S.stable];
    MYCASE = S.threat.id;
    scenarioLoaded = true;
  }
  const map = { stable:'SH-3101', decline:'SH-3102', threat:'SH-3103' };
  activeId = map[pick] || CASES[0].id;
  QSET = pickQuestions(0);
  localSave();
  $$('#scen .scard').forEach(b => b.classList.toggle('on', b.dataset.s === pick));
  goRole('cw'); goTab(pick === 'stable' ? 'over' : 'why');
  renderAll();
  const names = { stable:'Stable case', decline:'Gradual deterioration', threat:'Threat & duress' };
  toast(names[pick] + ' loaded — ' + (CASES.find(c => c.id === activeId) || {}).alias);
}
$$('#scen .scard').forEach(b => b.onclick = () => loadScenarios(b.dataset.s));

const STEPS = [
  { a:'Open a fictional case in the Stable state', r:'Case Pulse reads green',
    run(){ ensureDemoMode(); goRole('cw'); activeId = 'SH-2291'; goTab('over'); renderCase(); } },
  { a:'Complete a check-in with steady answers', r:'No significant change',
    run(){ ensureDemoMode(); goPane('checkin'); autoSitting('calm'); renderAll(); } },
  { a:'Complete a check-in with worrying answers', r:'Indicators appear and the subject bars move',
    run(){ goPane('checkin'); autoSitting('hard'); goRole('cw'); activeId='SH-2291'; goTab('over'); renderAll(); } },
  { a:'Add a safety / incident report', r:'Case Pulse moves to Elevated',
    run(){ goPane('report'); addEvent('incident','He came and stood outside my house at around 9pm last night and waited there for almost an hour.'); } },
  { a:'Simulate reduced engagement', r:'The early-warning alert triggers',
    run(){ const c = survivor();
      c.events.push(ev('missed', ago(3), { text:'Scheduled check-in not completed.' }));
      c.events.push(ev('missed', ago(1), { text:'Scheduled check-in not completed.' }));
      c.lastContact = ago(16); localSave(); goRole('cw'); activeId='SH-2291'; renderAll(); } },
  { a:'Open "Why flagged"', r:'Every signal is explained in plain language',
    run(){ goRole('cw'); activeId='SH-2291'; renderCase(); goTab('why'); } },
  { a:'Caseworker reviews the case', r:'The human-review gate is demonstrated',
    run(){ goRole('cw'); goTab('act'); $('#a-review').click(); } },
  { a:'Record an intervention', r:'The support action appears in the timeline',
    run(){ $('#iv-note').value = 'Called the survivor, confirmed safety, arranged an escort to the next hearing and started counselling.';
           $('#iv-save').click(); goRole('cw'); goTab('time'); } },
  { a:'Run the follow-up simulation', r:'The trend begins improving — the loop closes',
    run(){ goRole('cw'); goTab('act'); $('#sim-follow').click(); } },
  { a:'Survivor uses her safe word in an answer', r:'Silent duress alert — her screen shows nothing', x:true,
    run(){ const c = survivor(); if (!c.safeword) c.safeword = 'jasmine';
      goPane('checkin');
      c.events.push(scoreEvent(ev('sitting', now(), { text:`Everything is fine here, I even watered the ${c.safeword} outside. Nothing to worry about.`, mood:4 })));
      c.events.push(ev('duress', now(), { text:`Safe word "${c.safeword}" appeared in a check-in. Treat as coercion until confirmed otherwise. Do not call — the survivor may not be alone.` }));
      localSave(); toast('Check-in received. Thank you.');
      setTimeout(() => { goRole('cw'); activeId='SH-2291'; renderCase(); renderAll(); }, 1100); } },
  { a:'Survivor holds the emergency button', r:'Case jumps to Urgent review with a live alert', x:true,
    run(){ goPane('support'); firePanic(); setTimeout(() => { goRole('cw'); activeId='SH-2291'; renderCase(); }, 1000); } }
];
let at = 0;

function renderSteps(){
  $('#steps').innerHTML = STEPS.map((s,i) =>
    `<div class="stp ${i<at?'done':''} ${i===at?'now':''}">
      <div class="n">${i<at?'✓':(s.x?'★':i+1)}</div>
      <div><div class="a">${esc(s.a)}</div><div class="r">${esc(s.r)}</div></div>
    </div>`).join('');
}
$('#d-next').onclick = () => {
  if (at >= STEPS.length) return toast('Demo complete. Reset to run it again.');
  STEPS[at].run(); at++; renderSteps(); renderLive();
  if (at >= STEPS.length) toast('Detect → Explain → Connect → Intervene → Follow up.');
};
$('#d-auto').onclick = () => { goRole('dm'); (function tick(){ if (at >= STEPS.length) return; $('#d-next').click(); setTimeout(() => { goRole('dm'); tick(); }, 1700); })(); };
$('#d-reset').onclick = () => {
  ensureDemoMode();
  if (scenarioLoaded){
    CASES = seedCases();
    CASES.forEach(x => { x.workerId = 'local'; x.pin = '2580'; });
    MYCASE = 'SH-2291'; activeId = 'SH-2291'; scenarioLoaded = false;
    $$('#scen .scard').forEach(b => b.classList.remove('on'));
  }
  const c = survivor();
  const fresh = seedCases().find(x => x.id === 'SH-2291');
  Object.assign(c, { events:fresh.events, interventions:[], closedNeeds:[], sittings:0,
                     reviewedAt: ago(6), lastContact: ago(4), _outcome:'' });
  at = 0; panicOn = false;
  $('#panic-sent').classList.remove('on'); panic.style.background = '';
  $('#panic-lb').textContent = 'Hold to send an emergency alert';
  $('#inc').value = '';
  QSET = pickQuestions(0);
  localSave(); renderSteps(); resetQuestionnaire(); renderAll();
  toast('Reset to the starting state.');
};
$('#d-onb').onclick = () => { screenOnb(); step = 0; paint(); };

/* =====================================================================
   BOOT
   ===================================================================== */
(async function boot(){
  renderSteps();
  try {
    adopt(await API.get('/me'));
    await afterAuth();
  } catch (e) {
    const noServer = /Failed to fetch|NetworkError|offline|Load failed/i.test(e.message || '');
    if (noServer){
      goOffline('the backend is not running');
      $('#demomark').textContent = 'Local demo mode · no server · nothing is saved';
      screenApp();
      renderMaskSettings(); renderSafety(); resetQuestionnaire(); renderAll();
      setTimeout(() => toast('No backend reachable — running on local demo data. Start it with: node server.js'), 900);
    } else {
      screenLand();
    }
  }
  console.log('[Prahari] ready' + (OFFLINE ? ' (local demo mode)' : ' (connected to backend)'));
})();
</script>
</body>
</html>
