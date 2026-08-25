<script>
/* ===================== RENDERING ===================== */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

function toast(m){ const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._x); t._x = setTimeout(() => t.classList.remove('on'), 3200); }
function fmtAgo(t){
  const d = (now()-t)/DAY;
  if (d < .02) return 'just now';
  if (d < 1)  return Math.round(d*24) + 'h ago';
  if (d < 2)  return 'yesterday';
  return Math.round(d) + ' days ago';
}

/* severity ramp — validated for colour-vision separation.
   Every use is paired with a word, so colour is never the only signal. */
const SEV = [
  { max:24,  key:'stable', word:'Steady',     c:'var(--sev-1)', bg:'#E6F0EA' },
  { max:44,  key:'mild',   word:'Watch',      c:'var(--sev-2)', bg:'#FAF2DC' },
  { max:69,  key:'elev',   word:'Strained',   c:'var(--sev-3)', bg:'#FAEADF' },
  { max:999, key:'urgent', word:'Struggling', c:'var(--sev-4)', bg:'#F6E5E2' }
];
const sevOf = v => SEV.find(s => v <= s.max);

const EVM = {
  sitting:      { nb:'brd', t:'Check-in' },
  checkin:      { nb:'brd', t:'Text check-in' },
  voice:        { nb:'brd', t:'Voice check-in' },
  incident:     { nb:'org', t:'Incident report' },
  panic:        { nb:'red', t:'Emergency alert' },
  duress:       { nb:'red', t:'Safe word used — possible coercion' },
  missed:       { nb:'amb', t:'Check-in missed' },
  review:       { nb:'',    t:'Human review' },
  intervention: { nb:'grn', t:'Intervention recorded' },
  followup:     { nb:'grn', t:'Follow-up check-in' }
};

/* one check-in sitting, question by question */
function answerList(e, survivorView){
  return '<div class="tx" style="padding:2px 14px">' + e.answers.map(a => {
    const q = QUESTIONS.find(x => x.id === a.qid) || { q:a.qid, mode:a.mode };
    const body = a.mood && !a.text
      ? `<span class="tag">felt ${['','struggling','low','flat','okay','good'][a.mood]}</span>`
      : esc(a.text || '');
    const tags = (!survivorView && a.indicators && a.indicators.length)
      ? '<div>' + a.indicators.map(h => `<span class="tag ${h.weight>0?'w':'g'}">${esc(h.label)}</span>`).join('') + '</div>' : '';
    const vf = (!survivorView && a.voice)
      ? `<div class="t-fine" style="margin-top:6px">spoken · ${a.voice.rate} wpm · ${a.voice.pauses} long pauses/min · steadiness ${a.voice.steady}/100</div>` : '';
    return `<div style="padding:11px 0;border-bottom:1px solid var(--line)">
      <div class="t-fine" style="margin-bottom:5px">${esc(q.q)} <span style="opacity:.65">· ${a.mode === 'voice' ? 'spoken' : a.mode === 'text' ? 'written' : 'tapped'}</span></div>
      <div>${body}</div>${tags}${vf}</div>`;
  }).join('') + '</div>';
}

function renderTL(el, events, survivorView){
  el.innerHTML = [...events].sort((a,b) => b.t-a.t).map(e => {
    const m = EVM[e.type] || { nb:'', t:e.type };
    /* the survivor never sees the duress event surfaced — that is the point */
    const title = survivorView && e.type === 'duress' ? 'Check-in' : m.t;
    let extra = '';
    if (!survivorView && e.indicators && e.indicators.length && !e.answers)
      extra += '<div>' + e.indicators.map(h => `<span class="tag ${h.weight>0?'w':'g'}">${esc(h.label)}</span>`).join('') + '</div>';
    if (!survivorView && e.voice)
      extra += `<div class="t-fine" style="margin-top:7px">Voice features (simulated): ${e.voice.rate} wpm · ${e.voice.pauses} long pauses/min · steadiness ${e.voice.steady}/100</div>`;
    return `<li><i class="nb ${survivorView && e.type==='duress' ? 'brd' : m.nb}"></i>
      <div class="tm">${fmtAgo(e.t)}${e.mood?' · mood '+e.mood+'/5':''}</div>
      <div class="tt">${esc(title)}</div>
      ${e.answers ? answerList(e, survivorView) : (e.text ? `<div class="tx">${esc(e.text)}</div>` : '')}${extra}</li>`;
  }).join('') || '<li style="border:0;padding-left:0"><span class="t-fine">Nothing here yet.</span></li>';
}

/* ---------- consents ---------- */
const CONSENT_DEFS = [
  ['share',    'Share my check-ins with my support worker', 'Without this, nobody sees what you write.'],
  ['voice',    'Allow voice notes to be transcribed',       'The audio is never stored — only the text.'],
  ['trusted',  'Alert my trusted contact in an emergency',  'Only when you send an emergency alert.'],
  ['research', 'Use my case anonymously to improve support','Names and details removed. Off by default.']
];
function renderConsents(el, c){
  el.innerHTML = CONSENT_DEFS.map(([k,t,d]) =>
    `<label class="tog"><input type="checkbox" data-c="${k}" ${c.consents[k]?'checked':''}><i class="sw"></i>
      <span class="grow"><span class="tl2">${t}</span><span class="ds">${d}</span></span></label>`).join('');
  el.querySelectorAll('[data-c]').forEach(i => i.onchange = e => {
    c.consents[e.target.dataset.c] = e.target.checked;
    saveProfile({ consents: c.consents }, 'Saved. You can change this again whenever you want.');
  });
}

/* ---------- per-subject bars ---------- */
function renderDomains(a){
  const el = $('#domains');
  const keys = Object.keys(a.domains || {});
  if (!keys.length){ el.innerHTML = '<p class="t-small">No question-based check-in has been completed yet. The subject breakdown appears after the first one.</p>'; return; }
  el.innerHTML = keys.sort((x,y) => a.domains[y] - a.domains[x]).map(d => {
    const v = a.domains[d], s = sevOf(v);
    return `<div class="dom"><div class="dn">${esc(DOMAINS[d] || d)}</div>
      <div class="db"><i style="width:${Math.max(4,v)}%;background:${s.c}"></i></div>
      <div class="dv" style="color:${s.c}">${s.word}</div></div>`;
  }).join('');
}

function renderAccess(el, c){
  const log = c.access || [];
  el.innerHTML = log.length
    ? log.slice(0,10).map(a => `<div class="acc"><span class="aw"><b>${esc(a.who)}</b> · ${esc(a.role)} — ${esc(a.what)}</span><span class="at">${fmtAgo(a.t)}</span></div>`).join('')
    : '<p class="t-small">Nobody has opened this record yet.</p>';
}

/* ===================== SURVIVOR ===================== */
function renderSurvivor(){
  const c = survivor();
  if (!c) return;
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('#nv-name').textContent = c.alias;
  $('#nv-code').textContent = 'Case ' + c.id;
  $('#hm-greet').textContent = `${part}, ${c.alias}.`;
  $('#sup-name').textContent = c.worker;
  $('#sup-init').textContent = c.worker.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
  $('#sup-last').textContent = 'Last spoke ' + fmtAgo(c.lastContact);
  $('#sup-window').innerHTML = `They will only contact you <b>${esc(c.window.when.toLowerCase())}</b>, by <b>${esc(c.window.how.toLowerCase())}</b> — the window you chose when you signed up.`;
  $('#safeword').value = c.safeword || '';
  const done = c.events.filter(e => e.type === 'sitting').length;
  $('#hm-next').textContent = done
    ? `You have completed ${done} so far. The questions rotate, so it never becomes the same form twice.`
    : 'A short set of questions about how life has been. It takes a few minutes and you can stop anywhere.';

  /* the survivor sees her own words and what was done — never a score */
  const visible = c.events.filter(e => !['review','missed','duress'].includes(e.type));
  renderTL($('#hm-tl'), visible.slice(-3), true);
  renderTL($('#sv-tl'), visible, true);
  renderAccess($('#sv-access'), c);
  renderConsents($('#consents'), c);

  $('#sv-facts').innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">
      <div class="grow"><div class="t-fine">Case number</div>
        <div class="serif" style="font-size:26px;margin-top:3px">${esc(c.id)}</div></div>
      <div style="text-align:right"><div class="t-fine">Opened</div>
        <div style="font-weight:550;font-size:14.5px;margin-top:6px">${fmtAgo(c.events[0]?c.events[0].t:now())}</div></div>
    </div>
    <hr class="rule">
    <div style="font-size:14.5px;line-height:2;color:var(--ink-2)">
      <div><b style="color:var(--ink)">Here as</b> · ${esc(c.role)}</div>
      ${c.reasons.length?`<div><b style="color:var(--ink)">About</b> · ${c.reasons.map(esc).join(', ')}</div>`:''}
      <div><b style="color:var(--ink)">Language</b> · ${esc(c.lang)}</div>
      <div><b style="color:var(--ink)">Safe to contact</b> · ${esc(c.window.when)}, ${esc(c.window.how.toLowerCase())}</div>
      <div><b style="color:var(--ink)">Support worker</b> · ${esc(c.worker)}</div>
    </div>`;
}

/* ===================== CASELOAD ===================== */
function sparkline(trend, color){
  if (!trend || trend.length < 2) return '';
  const W = 120, H = 22;
  const xs = trend.map((_,i) => i*(W-2)/(trend.length-1) + 1);
  const ys = trend.map(p => H-2 - (p.s/100)*(H-4));
  const d = xs.map((x,i) => `${i?'L':'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" opacity=".8"/>
    <circle cx="${xs[xs.length-1].toFixed(1)}" cy="${ys[ys.length-1].toFixed(1)}" r="2.6" fill="${color}"/>
  </svg>`;
}

function renderList(){
  const rows = CASES.map(c => ({ c, a:look(c) })).sort((x,y) => y.a.score - x.a.score);
  $('#cl-n').textContent = CASES.length + (CASES.length === 1 ? ' case' : ' cases');

  /* KPI strip — the operational read of the whole caseload */
  const overdue = rows.filter(r => r.a.daysContact >= 10).length;
  const needing = rows.filter(r => ['elev','urgent'].includes(r.a.state.cls)).length;
  const openNeeds = rows.reduce((n,r) => n + r.a.openNeeds.length, 0);
  $('#kpi-active').textContent  = CASES.length;
  $('#kpi-review').textContent  = needing;
  $('#kpi-overdue').textContent = overdue;
  $('#kpi-needs').textContent   = openNeeds;
  $('#cw-stamp').textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

  $('#caselist').innerHTML = rows.map(({c,a}) =>
    `<div class="ci ${c.id===activeId?'on':''}" data-id="${c.id}" role="button" tabindex="0">
       <div style="display:flex;gap:10px;align-items:flex-start">
         <span class="nm grow">${esc(c.alias)}</span>
         <span class="st ${a.state.cls}"><i></i><span>${a.state.label}</span></span>
       </div>
       <div class="mt">${esc(c.id)} · ${esc(c.role)} · contact ${fmtAgo(c.lastContact)}</div>
       ${sparkline(a.trend, a.state.color)}
     </div>`).join('');
  $$('.ci').forEach(el => {
    const open = async () => {
      activeId = el.dataset.id;
      renderCase();
      if (!OFFLINE){ try { adopt(await API.get('/case/' + activeId)); renderCase(); } catch(e){} }
      if (window.matchMedia('(max-width:1080px)').matches)
        $('.dossier').scrollIntoView({ behavior:'smooth', block:'start' });
    };
    el.onclick = open;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } };
  });

  const f = rows.map(r => ({ c:r.c, d:r.a.daysContact })).filter(x => x.d >= 10).sort((a,b) => b.d-a.d);
  $('#forgotten').innerHTML = f.length
    ? f.map(x => `<li><b>${esc(x.c.alias)}</b> — ${x.d} days since anyone spoke to them</li>`).join('')
    : '<li class="muted">Everyone has been contacted in the last 10 days.</li>';
}

/* ===================== TREND CHART =====================
   One series, so no legend — the heading names it. Bands behind the
   line carry the four states; the line itself is the brand green so
   it never competes with the severity ramp. Hover/tap gives a
   crosshair and a tooltip, which an HTML chart should always have.
   ===================================================================== */
function renderChart(trend){
  const el = $('#chart');
  if (!trend || trend.length < 2){ el.innerHTML = '<p class="t-small" style="margin-top:12px">Not enough check-ins yet to show a trend.</p>'; return; }
  const W = 640, H = 190, PL = 8, PR = 8, PT = 12, PB = 26;
  const n = trend.length;
  const x = i => PL + i * (W-PL-PR) / (n-1);
  const y = v => PT + (1 - v/100) * (H-PT-PB);
  const pts = trend.map((p,i) => [x(i), y(p.s)]);
  const line = pts.map((p,i) => `${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = line + ` L${pts[n-1][0].toFixed(1)},${y(0)} L${pts[0][0].toFixed(1)},${y(0)} Z`;
  const bands = [[0,24,'#E9F1EB'],[24,44,'#FBF4E2'],[44,69,'#FBEDE4'],[69,100,'#F8E9E6']];

  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Well-being trend over time">
      ${bands.map(([a,b,col]) => `<rect x="0" y="${y(b).toFixed(1)}" width="${W}" height="${(y(a)-y(b)).toFixed(1)}" fill="${col}"/>`).join('')}
      ${[24,44,69].map(v => `<line x1="0" y1="${y(v).toFixed(1)}" x2="${W}" y2="${y(v).toFixed(1)}" stroke="#FFFFFF" stroke-width="1"/>`).join('')}
      <path d="${area}" fill="var(--green)" opacity=".07"/>
      <path d="${line}" fill="none" stroke="var(--green)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line id="cx" x1="0" y1="${PT}" x2="0" y2="${H-PB}" stroke="var(--ink-4)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
      ${pts.map((p,i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===n-1?4.5:3}" fill="#fff" stroke="var(--green)" stroke-width="2"/>`).join('')}
      <circle id="chit" r="6" fill="var(--green)" stroke="#fff" stroke-width="2.5" opacity="0"/>
      <rect id="cover" x="0" y="0" width="${W}" height="${H}" fill="transparent" style="cursor:crosshair"/>
    </svg>
    <div class="ctip" id="ctip"></div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:10px">
      <span class="t-fine">${fmtAgo(trend[0].t)}</span><span class="grow"></span><span class="t-fine">now</span>
    </div>
    <div class="legend">
      ${SEV.map(s => `<span class="lg"><i style="background:${s.bg};border:1px solid ${s.c}33"></i>${s.word}</span>`).join('')}
    </div>`;

  const svg = el.querySelector('svg'), tip = $('#ctip');
  const cx = el.querySelector('#cx'), hit = el.querySelector('#chit');
  const move = ev => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
    let i = Math.round((px - PL) / ((W-PL-PR)/(n-1)));
    i = Math.max(0, Math.min(n-1, i));
    const p = pts[i], s = sevOf(trend[i].s);
    cx.setAttribute('x1', p[0]); cx.setAttribute('x2', p[0]); cx.setAttribute('opacity','.55');
    hit.setAttribute('cx', p[0]); hit.setAttribute('cy', p[1]); hit.setAttribute('opacity','1');
    tip.textContent = `${fmtAgo(trend[i].t)} — ${s.word}`;
    tip.style.left = (p[0]/W*100) + '%';
    tip.style.top  = (p[1]/H*r.height) + 'px';
    tip.classList.add('on');
  };
  const leave = () => { cx.setAttribute('opacity','0'); hit.setAttribute('opacity','0'); tip.classList.remove('on'); };
  svg.addEventListener('mousemove', move);
  svg.addEventListener('mouseleave', leave);
  svg.addEventListener('touchstart', move, { passive:true });
  svg.addEventListener('touchmove', move, { passive:true });
  svg.addEventListener('touchend', leave);
}


/* ===================== PERSONAL BASELINE =====================
   Her own previous check-ins versus this one. Levels run 1-5 where 5 is
   best, because a level is read faster in a queue than a percentage.
   ============================================================= */
function pips(n, colour){
  return `<span class="pips" style="color:${colour}">` +
    [1,2,3,4,5].map(i => `<i class="${i<=n?'on':''}"></i>`).join('') + '</span>';
}
function renderBaseline(c){
  const el = $('#baseline'); if (!el) return;
  const b = baseline(c);

  if (!b.ready){
    el.innerHTML = `<div class="note" style="margin-top:16px">${esc(b.reason)}</div>`;
    return;
  }

  const row = (label, from, to, delta, fromTxt, toTxt) => {
    const worse = delta < 0, same = delta === 0;
    const cls = worse ? 'worse' : same ? 'same' : 'better';
    const word = Math.abs(delta) >= 2 ? (worse ? '↓ Significant' : '↑ Significant')
               : same ? '—' : (worse ? '↓' : '↑');
    const col = worse ? (Math.abs(delta) >= 2 ? 'var(--sev-4)' : 'var(--sev-3)')
              : same ? 'var(--ink-4)' : 'var(--sev-1)';
    return `<div class="bl-row">
      <div class="bl-k">${esc(label)}</div>
      <div class="bl-v">
        <span class="was">${fromTxt !== undefined ? esc(fromTxt) : from + '/5'}</span>
        <span class="arw">→</span>
        <span style="color:${col}">${toTxt !== undefined ? esc(toTxt) : to + '/5'}</span>
        ${toTxt === undefined ? pips(to, col) : ''}
      </div>
      <div class="bl-d ${cls}">${word}</div>
    </div>`;
  };

  const subject = b.rows.map(r => row(r.label, r.from, r.to, r.delta)).join('');
  const threats = row('Threats / incidents', 0, 0,
                      b.threats.to - b.threats.from > 0 ? -2 : b.threats.to - b.threats.from < 0 ? 2 : 0,
                      String(b.threats.from), String(b.threats.to));
  const checks  = row('Check-in behaviour', 0, 0, b.checkins.missed ? -2 : 0,
                      b.checkins.from, b.checkins.to);

  el.innerHTML = `<div class="bl">
      <div class="bl-row head"><div>Subject</div><div>Previous → now</div><div style="text-align:right">Change</div></div>
      ${subject}${threats}${checks}
    </div>
    <p class="t-fine" style="margin-top:10px">Comparing the check-in of ${fmtAgo(b.to)} against the average of her previous ones. Higher is better; 5 is best.</p>`;
}

/* ===================== WHY FLAGGED =====================
   The headline of the dashboard: what the system noticed, in plain
   sentences, with the survivor's own words as the evidence.
   ======================================================= */
function renderFlag(c, a){
  const el = $('#flagbox'); if (!el) return;
  const b = baseline(c);
  const calm = a.state.key === 'stable';
  const reasons = [];

  /* baseline movement, in words a person would use */
  if (b.ready) b.worst.forEach(r => {
    if (r.delta <= -1) reasons.push({ t:`${r.label} decreased from ${r.from} to ${r.to}` + (r.significant ? ' — a significant drop' : '') });
  });
  if (b.ready && b.threats.to > 0)
    reasons.push({ t:`${b.threats.to} safety incident${b.threats.to>1?'s':''} reported in the last 14 days` });
  if (b.ready && b.checkins.missed)
    reasons.push({ t:`${b.checkins.missed} scheduled check-in${b.checkins.missed>1?'s were':' was'} missed — read as a possible barrier, not non-compliance` });
  if (a.daysContact >= 7)
    reasons.push({ t:`${a.daysContact} days since the last human contact` });
  a.openNeeds.forEach(n => reasons.push({ t:`Unresolved need: ${NEEDS[n].label.toLowerCase()}` }));
  if (c.events.some(e => e.type === 'duress'))
    reasons.push({ t:'Safe word used in a check-in — the survivor may be under coercion right now' });
  if (calm && !reasons.length)
    reasons.push({ t:'Nothing is currently pushing this case up the queue', good:true });

  /* the strongest quote the survivor actually gave us */
  const quote = (a.indicators[0] && a.indicators[0].quote) ||
    (() => { const s = c.events.filter(e => e.type === 'incident' && e.text).pop(); return s && s.text; })() || '';

  el.innerHTML = `<div class="flagbox ${calm?'calm':''}">
    <div class="flaghead">
      <span class="flagdot"></span>
      <span class="flagtitle">${calm ? 'No review needed right now' : 'Human review recommended'}</span>
      <span class="grow"></span>
      <span class="st ${a.state.cls}"><i></i><span>${a.state.label}</span></span>
    </div>
    <p class="t-body" style="margin-top:10px">${calm
      ? 'The indicators are steady against this survivor\'s own baseline. She stays in the routine rhythm.'
      : 'Indicators suggest increased distress or safety concern compared with this survivor\'s own baseline.'}</p>

    <ul class="reasons">
      ${reasons.slice(0,7).map(r => `<li class="${r.good?'good':''}">${esc(r.t)}</li>`).join('')}
    </ul>

    ${quote ? `<div class="evidence"><q>${esc(quote)}</q>
        <div class="src">Evidence from the survivor's own check-in</div></div>` : ''}

    <div class="sysrole"><b>System role:</b> decision-support only. Prahari does not diagnose any condition
      and takes no action on its own — a named person reviews every flagged case and decides what happens next.</div>
  </div>`;
}

/* ===================== ALERT → ACTION PIPELINE ===================== */
function renderPipe(c){
  const el = $('#pipe'); if (!el) return;
  const st = caseStage(c);
  el.innerHTML = st.stages.map((s,i) =>
    `<div class="pstep ${s.done?'done':''} ${i===st.at && !s.done?'at':''}">
       <div class="pd">${s.done ? '✓' : i+1}</div>
       <div class="pl">${esc(s.label)}</div>
     </div>`).join('');

  const log = $('#actlog'); if (!log) return;
  const acts = c.actions || [];
  const ACT_LABEL = { review:'Reviewed', contact:'Contacted survivor', counsel:'Referred to counsellor',
                      legal:'Referred to legal advocate', safety:'Safety concern reviewed',
                      followup:'Follow-up scheduled', resolve:'Marked resolved', intervention:'Intervention logged' };
  log.innerHTML = acts.length
    ? acts.slice(0,12).map(a => `<div class="actrow">
        <span class="ak">${esc(ACT_LABEL[a.kind] || a.kind)}</span>
        <span class="an">${esc(a.note || '—')}${a.followUp ? ` · follow-up ${esc(a.followUp)}` : ''}</span>
        <span class="at">${esc(a.by || 'worker')} · ${fmtAgo(a.t)}</span>
      </div>`).join('')
    : '<p class="t-small">No action has been recorded on this case yet.</p>';
}

/* ===================== CASE DETAIL ===================== */
const KIND = { red:'Escalation', org:'Accumulation', amb:'Engagement', grn:'Support' };

function renderCase(){
  renderList();
  const c = active(); if (!c) return;
  const a = look(c);

  $('#d-name').textContent = c.alias;
  $('#d-meta').textContent = `${c.id} · ${c.role} · ${c.lang} · safe to contact ${c.window.when.toLowerCase()}, ${c.window.how.toLowerCase()} · worker ${c.worker}`;
  $('#d-st').className = 'st ' + a.state.cls;
  $('#d-st').innerHTML = `<i></i><span>${a.state.label}</span>`;
  $('#score-tag').textContent = 'priority score ' + a.score + '/100';

  const wellbeing = 100 - a.score;
  const safety = c.events.some(e => ['panic','duress'].includes(e.type)) ? 8
               : c.events.some(e => e.type==='incident' && e.t > ago(14)) ? 34 : 82;
  const engagement = Math.max(10, 100 - a.gaps.length*28 - Math.min(40, a.daysContact*2));
  const support = Math.max(6, 100 - a.openNeeds.length*22 - (a.daysContact>=14?25:0));
  $('#meters').innerHTML = [['Well-being',wellbeing],['Safety',safety],['Engagement',engagement],['Support in place',support]]
    .map(([k,v]) => {
      const s = sevOf(100 - v);
      return `<div class="mt1"><div class="k">${k}</div><div class="v" style="color:${s.c}">${s.word}</div>
        <div class="trk"><i style="width:${Math.max(4,v)}%;background:${s.c}"></i></div></div>`;
    }).join('');

  const bits = [];
  if (a.indicators.length) bits.push(a.indicators.length + ' distress indicator' + (a.indicators.length>1?'s':'') + ' in recent check-ins');
  if (a.factors.length)    bits.push(a.factors.length + ' case pattern' + (a.factors.length>1?'s':''));
  const pn = $('#pulse-note');
  pn.className = 'note ' + (a.state.key==='urgent'?'urg':a.state.key==='stable'?'green':'warn');
  pn.innerHTML = a.state.key === 'stable'
    ? 'Nothing is currently pushing this case up the queue. It stays in the routine rhythm.'
    : `At <b>${a.state.label}</b> because of ${bits.join(' and ')}. <b>Human review recommended.</b>`;

  renderChart(a.trend);
  renderDomains(a);
  renderBaseline(c);
  renderFlag(c, a);
  renderPipe(c);

  const nw = c.events.filter(e => e.t > c.reviewedAt).sort((x,y) => y.t-x.t);
  $('#changed').innerHTML = nw.length
    ? `<p class="t-fine" style="margin-bottom:10px">Since the last review ${fmtAgo(c.reviewedAt)}:</p>` + nw.map(e =>
        `<div style="padding:9px 0;border-bottom:1px solid var(--line)">
          <span style="font-size:14.5px;font-weight:550">${esc((EVM[e.type]||{}).t || e.type)}</span>
          <span class="t-fine"> · ${fmtAgo(e.t)}</span>
          ${e.indicators && e.indicators.length ? `<div>${e.indicators.slice(0,4).map(h=>`<span class="tag ${h.weight>0?'w':'g'}">${esc(h.label)}</span>`).join('')}</div>` : ''}
        </div>`).join('')
    : '<p class="t-small">No new activity since the last review.</p>';

  $('#explain').innerHTML = [
    ...a.indicators.map(h => `<div class="sig"><div class="k">${esc(h.label)}</div>
      <div class="b" style="font-style:italic;color:var(--ink-2)">“${esc(h.quote)}”</div>
      <div class="w" style="color:var(--sev-3)">+${h.weight}</div></div>`),
    ...a.factors.map(f => `<div class="sig"><div class="k">${KIND[f.kind]||'Pattern'}</div>
      <div class="b">${esc(f.t)}</div>
      <div class="w" style="color:${f.w.startsWith('−')?'var(--sev-1)':f.kind==='red'?'var(--sev-4)':'var(--sev-3)'}">${f.w}</div></div>`)
  ].join('') || '<p class="t-small" style="padding:10px 0">No distress indicators are contributing. This case sits in the routine queue.</p>';

  $('#needs').innerHTML = a.openNeeds.length
    ? a.openNeeds.map(n => `<li><b>${NEEDS[n].label}</b> — raised by the survivor, no intervention logged against it</li>`).join('')
    : '<li class="muted">Every need raised has an intervention logged against it.</li>';
  $('#iv-need').innerHTML = '<option value="">— none —</option>' + a.openNeeds.map(n => `<option value="${n}">${NEEDS[n].label}</option>`).join('');

  const ci = c.events.filter(e => ['checkin','voice','sitting','followup'].includes(e.type));
  $('#barriers').innerHTML = `
    <div>Last check-in · <b>${ci.length ? fmtAgo(Math.max(...ci.map(e=>e.t))) : 'never'}</b></div>
    <div style="margin-top:6px">Last human contact · <b>${a.daysContact} days ago</b></div>
    <div style="margin-top:12px">${a.gaps.length
      ? `<span class="tag w">${a.gaps.length} long gap(s): ${a.gaps.join(', ')} days</span>
         <p class="t-fine" style="margin-top:9px">Flagged as a <b>possible barrier</b> — no phone credit, no privacy at home, fear of being seen. Something to ask about, not to penalise.</p>`
      : '<span class="tag g">Check-in rhythm is steady</span>'}</div>`;

  renderTL($('#cw-tl'), c.events, false);
  renderAccess($('#cw-access'), c);
  $('#outcome').innerHTML = c._outcome || '';

  const flag = CASES.find(x => x.events.some(e => ['panic','duress'].includes(e.type)));
  const bar = $('#alert');
  if (flag){
    const e = flag.events.filter(x => ['panic','duress'].includes(x.type)).pop();
    bar.classList.add('on');
    $('#alert-t').textContent = (e.type === 'duress' ? 'Safe word used — ' : 'Emergency alert — ') + flag.alias + ' (' + flag.id + ')';
    $('#alert-b').textContent = e.type === 'duress'
      ? 'Triggered ' + fmtAgo(e.t) + '. The survivor may not be alone. Do not call — use the agreed silent protocol.'
      : 'Triggered ' + fmtAgo(e.t) + '. Contact immediately and confirm safety.';
    $('#alert-go').onclick = () => { activeId = flag.id; renderCase(); window.scrollTo({top:0,behavior:'smooth'}); };
  } else bar.classList.remove('on');
}

function renderLive(){
  const c = survivor(); if (!c) return;
  const a = look(c);
  $('#live').innerHTML = `
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <span class="st ${a.state.cls}"><i></i><span>${a.state.label}</span></span>
      <span class="tag">score ${a.score}/100</span>
    </div>
    <p class="t-small" style="margin-top:12px">Case ${esc(c.id)} · ${c.events.length} events · ${a.openNeeds.length} open need(s) · ${a.indicators.length} active indicator(s)</p>
    ${c.events.some(e=>e.type==='duress') ? '<div class="note urg" style="margin-top:12px">Safe word is live on this case — the survivor\'s screen shows nothing unusual.</div>' : ''}
    ${panicOn ? '<div class="note urg" style="margin-top:12px">Emergency alert is live on this case.</div>' : ''}`;
}

const renderAll = () => { renderSurvivor(); renderCase(); renderLive(); };
</script>
