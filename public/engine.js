/* =====================================================================
   PRAHARI — shared analysis engine.
   This exact file runs in TWO places:
     · the Node backend  (require('./public/engine.js'))
     · the browser        (<script src="/engine.js">  ->  window.Engine)
   One source of truth, so the score a survivor's answer produces on the
   server is the same score the dashboard explains. Nothing here diagnoses
   anything: it produces potential distress indicators and a trend.
   ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const DAY = 86400000;
  const now = () => Date.now();
  const ago = d => Date.now() - d * DAY;

  /* ---------- potential distress indicators ---------- */
  const LEX = {
    fear:     { label:'Fear / feeling unsafe',  w:14, terms:['scared','afraid','frightened','terrified','threat','threaten','danger','unsafe','not safe','following me','watching me','frighten'] },
    safety:   { label:'Safety concern',         w:18, terms:['came to my','showed up','outside my','followed me','hit me','hurt me','beat me','called me again','messages from him','near my house','waiting for me','he found','they found','turned up'] },
    anxiety:  { label:'Anxiety / arousal',      w:11, terms:['anxious','panic','on edge','heart racing','shaking','cannot relax',"can't relax",'tense','nightmare','bad dreams','jumpy'] },
    sleep:    { label:'Sleep disturbance',      w:8,  terms:["can't sleep",'cannot sleep','not sleeping','awake all night','no sleep','waking up at','barely slept','hardly slept','two hours'] },
    hopeless: { label:'Hopelessness',           w:20, terms:['no point','pointless','hopeless','give up','giving up','nothing matters','nothing will change','tired of everything',"can't go on",'cannot go on','worthless','why bother','no use','nothing to look forward'] },
    withdraw: { label:'Withdrawal / isolation', w:12, terms:['alone','isolated','stopped going',"don't want to talk",'dont want to talk','avoid','stay inside',"haven't left",'not seeing anyone','no one to','nobody to','stopped answering','nobody really','spoken to no one'] },
    shame:    { label:'Shame / self-blame',     w:10, terms:['my fault','ashamed','embarrassed','blame myself','people talk','what people say','disgrace'] },
    appetite: { label:'Appetite / self-care',   w:9,  terms:['not eating',"haven't eaten",'no appetite','skipping meals','forget to eat','lost weight'] },
    somatic:  { label:'Physical symptoms',      w:7,  terms:['headache','stomach','chest','dizzy','pain all','body aches','not well'] },
    positive: { label:'Signs of stabilising',   w:-16,terms:['better','calmer','slept well','feeling okay','feeling ok','helped a lot','hopeful','improving','stronger','thank you','grateful','went well','managed','looking forward'] }
  };

  /* ---------- needs raised, tracked until somebody closes them ---------- */
  const NEEDS = {
    legal:   { label:'Legal / case support', terms:['lawyer','advocate','court','hearing','police station','case status','chargesheet','summons'] },
    money:   { label:'Money / livelihood',   terms:['money','rent','salary','compensation','fees','afford','no income','lost my job','no job'] },
    housing: { label:'Safe place to stay',   terms:['place to stay','somewhere to stay','shelter','place to live','landlord','moved out','nowhere to go'] },
    medical: { label:'Medical care',         terms:['doctor','hospital','medicine','injury','pain','treatment'] },
    child:   { label:'Children / schooling', terms:['school','my child','my daughter','my son','my kids'] },
    counsel: { label:'Counselling',          terms:['counsel','talk to someone','therapy','someone to talk'] }
  };

  /* ---------- life domains the check-in covers ---------- */
  const DOMAINS = {
    mood:    'Mood',
    sleep:   'Sleep',
    safety:  'Safety',
    social:  'Connection',
    home:    'Home',
    routine: 'Routine & work',
    money:   'Money',
    health:  'Health',
    care:    'Eating & self-care',
    legal:   'The case',
    depend:  'People depending on you',
    outlook: 'Outlook',
    support: 'Feeling supported'
  };

  /* ---------- the question bank ----------
     mode is fixed per question, and deliberately so:
       voice  — the answer carries more in how it is said than what is said
       text   — the answer is unsafe or hard to say out loud
       scale  — a single tap, no words needed
  */
  const QUESTIONS = [
    { id:'mood',    domain:'mood',    mode:'scale', core:true,
      q:'How are you feeling today?',
      why:'One tap. No words needed at all.' },

    { id:'days',    domain:'mood',    mode:'voice', core:true,
      q:'How would you describe the last few days?',
      why:'Spoken, so we hear how you are — not only what you say.' },

    { id:'unsafe',  domain:'safety',  mode:'text',  core:true,
      q:'Has anything happened recently that made you feel unsafe?',
      why:'Written rather than spoken, so nobody near you can overhear the answer.' },

    { id:'sleep',   domain:'sleep',   mode:'voice',
      q:'How have you been sleeping?',
      why:'Tiredness shows in a voice long before anyone writes it down.' },

    { id:'contact', domain:'safety',  mode:'text',
      q:'Has that person tried to contact you, or turned up anywhere?',
      why:'Kept silent and written — this is the one nobody should hear you answer.' },

    { id:'who',     domain:'social',  mode:'voice',
      q:'Who have you spoken to this week, apart from us?',
      why:'Spoken, because hesitation here tells us as much as the names do.' },

    { id:'home',    domain:'home',    mode:'voice',
      q:'Does home feel calm at the moment?',
      why:'Spoken — the answer is usually short, and the way it is said matters.' },

    { id:'eat',     domain:'care',    mode:'text',
      q:'Have you been eating properly and looking after yourself?',
      why:'Written, because it is an easy thing to be honest about on paper.' },

    { id:'routine', domain:'routine', mode:'text',
      q:'How have work, study or your daily routine been going?',
      why:'Written — dates, hours and details are easier typed than spoken.' },

    { id:'money',   domain:'money',   mode:'text',
      q:'Are there money worries at the moment?',
      why:'Written and private. Money is nobody else’s business.' },

    { id:'health',  domain:'health',  mode:'text',
      q:'Any pain, headaches or health problems you have not mentioned?',
      why:'Written, so you can be specific and we can pass it on accurately.' },

    { id:'case',    domain:'legal',   mode:'text',
      q:'How are you feeling about the case itself?',
      why:'Written, because case details should never be said out loud in a shared room.' },

    { id:'depend',  domain:'depend',  mode:'voice',
      q:'How are the people who depend on you — children, parents, anyone?',
      why:'Spoken, because people talk about others more openly than about themselves.' },

    { id:'forward', domain:'outlook', mode:'voice',
      q:'Is there anything you are looking forward to, even a small thing?',
      why:'Spoken. A long pause before this one is worth noticing.' },

    { id:'coping',  domain:'outlook', mode:'voice',
      q:'What helped you get through this week?',
      why:'Spoken, so it ends on your own words rather than a form field.' },

    { id:'need',    domain:'support', mode:'text',
      q:'Is there anything you need that you have not been given?',
      why:'Written, so it goes on the record exactly as you put it.' },

    { id:'helped',  domain:'support', mode:'text',
      q:'Does it feel like anyone is actually helping?',
      why:'Written, and read by a person — not scored by a machine.' }
  ];

  /* A session asks the three core questions plus a rotating handful, so a
     check-in never becomes an interrogation. Rotation is deterministic on
     the sitting number, so the demo repeats exactly. */
  function pickQuestions(sitting, count){
    count = count || 7;
    const core = QUESTIONS.filter(q => q.core);
    const rest = QUESTIONS.filter(q => !q.core);
    const out  = core.slice();
    const used = new Set(core.map(q => q.domain));
    const want = Math.max(0, count - core.length);
    /* walk the bank from a rotating offset, skipping subjects already
       covered this sitting so one check-in never asks about the same
       part of life twice, and the set changes every time */
    for (let pass = 0; pass < 2 && out.length < count; pass++){
      for (let i = 0; i < rest.length && out.length < count; i++){
        const q = rest[(sitting * want + i) % rest.length];
        if (out.includes(q)) continue;
        if (pass === 0 && used.has(q.domain)) continue;
        used.add(q.domain); out.push(q);
      }
    }
    /* keep the written and spoken questions interleaved rather than clumped */
    const head = out.slice(0, core.length);
    const tail = out.slice(core.length);
    const v = tail.filter(q => q.mode === 'voice'), t = tail.filter(q => q.mode === 'text');
    const mixed = [];
    while (v.length || t.length){ if (t.length) mixed.push(t.shift()); if (v.length) mixed.push(v.shift()); }
    return head.concat(mixed);
  }

  const STATES = [
    { key:'stable', label:'Stable',        cls:'stable', max:24, color:'#2F6B45' },
    { key:'mild',   label:'Mild concern',  cls:'mild',   max:44, color:'#8C6A18' },
    { key:'elev',   label:'Elevated',      cls:'elev',   max:69, color:'#AE5320' },
    { key:'urgent', label:'Urgent review', cls:'urgent', max:999,color:'#9C2F2A' }
  ];
  const stateFor = s => STATES.find(x => s <= x.max);

  const sentences = t => String(t).split(/(?<=[.!?।])\s+|\n+/).filter(s => s.trim());

  function analyze(text){
    const low = ' ' + String(text).toLowerCase().replace(/\s+/g,' ') + ' ';
    const sents = sentences(text);
    const indicators = [];
    for (const key in LEX){
      const def = LEX[key];
      const hit = def.terms.find(t => low.includes(t));
      if (hit){
        const q = sents.find(s => s.toLowerCase().includes(hit)) || text;
        indicators.push({ key, label:def.label, weight:def.w, quote:String(q).trim().slice(0,150) });
      }
    }
    const needs = Object.keys(NEEDS).filter(k => NEEDS[k].terms.some(t => low.includes(t)));
    const raw = indicators.reduce((a,h) => a + h.weight, 0);
    return { indicators, needs, score: Math.max(0, Math.min(100, raw + 8)) };
  }

  /* Voice features are SIMULATED in this prototype and derived from the
     transcript, so the demo is deterministic. The UI says so on screen. */
  const voiceFeatures = (text, s) => ({
    rate:   Math.round(118 - s * 0.28 + (String(text).trim().split(/\s+/).length % 7)),
    pauses: +(0.9 + s * 0.035).toFixed(1),
    steady: Math.max(12, Math.round(94 - s * 0.62))
  });

  const ev = (type, t, o) => Object.assign({ type, t, indicators:[], needs:[] }, o);

  function scoreEvent(e){
    if (!e.text || ['review','missed','panic','duress','intervention'].indexOf(e.type) >= 0) return e;
    const r = analyze(e.text);
    e.indicators = r.indicators; e.needs = r.needs;
    e.score = e.type === 'incident' ? Math.min(100, r.score + 22) : r.score;
    if (e.mode === 'voice' || e.type === 'voice') e.voice = voiceFeatures(e.text, e.score);
    return e;
  }

  /* A whole check-in sitting: many answers, one event, per-domain scores. */
  function scoreSitting(answers){
    const scored = answers.filter(a => (a.text && a.text.trim()) || a.mood).map(a => {
      const q = QUESTIONS.find(x => x.id === a.qid) || { domain:'mood', mode:a.mode };
      if (a.mood && !a.text) return { qid:a.qid, domain:q.domain, mode:'scale', mood:a.mood,
                                      score:(5 - a.mood) * 20, indicators:[], needs:[] };
      const r = analyze(a.text);
      const out = { qid:a.qid, domain:q.domain, mode:q.mode, text:a.text, mood:a.mood,
                    score:r.score, indicators:r.indicators, needs:r.needs };
      if (q.mode === 'voice') out.voice = voiceFeatures(a.text, r.score);
      return out;
    });
    const domains = {};
    scored.forEach(s => { (domains[s.domain] = domains[s.domain] || []).push(s.score); });
    for (const d in domains) domains[d] = Math.round(domains[d].reduce((a,b)=>a+b,0) / domains[d].length);
    /* One severe answer must not be averaged away by six mild ones, and a
       worry that shows up across many subjects matters more than the same
       worry said once. So: part mean, mostly the worst answer, plus a small
       amount for how many different kinds of indicator appeared at all. */
    const all = scored.map(s => s.score);
    const mean = all.length ? all.reduce((a,b)=>a+b,0) / all.length : 0;
    const worst = all.length ? Math.max.apply(null, all) : 0;
    const breadth = new Set(scored.reduce((a,s) =>
      a.concat((s.indicators||[]).filter(h => h.weight > 0).map(h => h.key)), [])).size;
    return {
      answers: scored,
      domains,
      score: Math.max(0, Math.min(100, Math.round(0.4*mean + 0.6*worst + 3*breadth))),
      indicators: scored.reduce((a,s) => a.concat(s.indicators), []),
      needs: [...new Set(scored.reduce((a,s) => a.concat(s.needs), []))]
    };
  }

  /* rolling per-domain picture across the last few sittings */
  function domainScores(c){
    const out = {};
    c.events.filter(e => e.domains).slice(-3).forEach(e => {
      for (const d in e.domains) (out[d] = out[d] || []).push(e.domains[d]);
    });
    const final = {};
    for (const d in out) final[d] = Math.round(out[d].reduce((a,b)=>a+b,0) / out[d].length);
    return final;
  }

  function openNeedsOf(c){
    const raised = new Set();
    c.events.forEach(e => (e.needs||[]).forEach(n => raised.add(n)));
    (c.closedNeeds||[]).forEach(n => raised.delete(n));
    (c.interventions||[]).forEach(i => i.closes && raised.delete(i.closes));
    c.events.forEach(e => e.closes && raised.delete(e.closes));
    return [...raised];
  }

  function missedGaps(c){
    const ts = c.events.filter(e => ['checkin','voice','sitting','followup'].indexOf(e.type) >= 0)
                       .map(e => e.t).sort((a,b) => a-b);
    const g = [];
    for (let i=1;i<ts.length;i++){ const d = Math.round((ts[i]-ts[i-1])/DAY); if (d >= 7) g.push(d); }
    const last = ts[ts.length-1];
    if (last && (Date.now()-last)/DAY >= 7) g.push(Math.round((Date.now()-last)/DAY));
    return g;
  }

  function assess(c){
    const signal = c.events.filter(e => typeof e.score === 'number');
    const recent = signal.slice(-5);
    let base = 0, wsum = 0;
    recent.forEach((e,i) => { base += e.score * (i+1); wsum += i+1; });
    base = wsum ? base / wsum : 0;

    const factors = [];
    const openNeeds = openNeedsOf(c);
    const daysContact = Math.floor((Date.now() - c.lastContact) / DAY);
    const gaps = missedGaps(c);
    let score = base;

    if (c.events.some(e => e.type === 'duress')){
      score += 55; factors.push({ t:'Safe word used in a check-in — the survivor may be under coercion right now', w:'+55', kind:'red' });
    }
    if (c.events.some(e => e.type === 'panic')){
      score += 45; factors.push({ t:'Emergency alert triggered by the survivor', w:'+45', kind:'red' });
    }
    if (c.events.some(e => e.type === 'incident' && e.t > ago(14))){
      score += 14; factors.push({ t:'Safety incident reported in the last 14 days', w:'+14', kind:'red' });
    }
    if (openNeeds.length >= 2){
      score += openNeeds.length * 5;
      factors.push({ t:openNeeds.length + ' needs raised by the survivor and never closed out', w:'+'+(openNeeds.length*5), kind:'org' });
    }
    if (gaps.length){
      const w = Math.min(12, gaps.length*6); score += w;
      factors.push({ t:gaps.length + ' unusually long gap(s) between check-ins — possible barrier, not non-compliance', w:'+'+w, kind:'amb' });
    }
    const missed = c.events.filter(e => e.type === 'missed').length;
    if (missed){
      score += missed*9;
      factors.push({ t:missed + ' scheduled check-in(s) missed — read as a possible barrier, not non-compliance', w:'+'+(missed*9), kind:'amb' });
    }
    if (daysContact >= 14){
      const w = daysContact >= 21 ? 18 : 11; score += w;
      factors.push({ t:'No meaningful human contact for ' + daysContact + ' days', w:'+'+w, kind:'amb' });
    }
    const supported = (c.interventions||[]).filter(i => i.t > ago(30)).length
                    + c.events.filter(e => e.type === 'intervention' && e.t > ago(30)).length;
    if (supported){ score -= 8; factors.push({ t:'Support action recorded in the last 30 days', w:'−8', kind:'grn' }); }

    score = Math.max(0, Math.min(100, Math.round(score)));

    const seen = {};
    signal.slice(-3).forEach(e => (e.indicators||[]).forEach(h => {
      if (h.weight > 0 && (!seen[h.key] || seen[h.key].weight < h.weight)) seen[h.key] = h;
    }));
    const indicators = Object.keys(seen).map(k => seen[k]).sort((a,b) => b.weight - a.weight);

    return { score, state:stateFor(score), factors, indicators, openNeeds, daysContact, gaps,
             domains: domainScores(c),
             trend: signal.map(e => ({ t:e.t, s:e.score })) };
  }

  /* ---------- fictional seed cases, used by the server on first run ---------- */
  const mkCase = o => Object.assign({
    events:[], interventions:[], closedNeeds:[], safeword:'', sittings:0,
    consents:{ share:true, voice:true, trusted:false, research:false },
    reviewedAt: ago(9), lastContact: ago(4), worker:'Anjali Kaur',
    window:{ when:'Any time', how:'Phone call' }, reasons:[]
  }, o);

  function seedCases(){
    const A = mkCase({ id:'SH-2291', alias:'Meera', initials:'M', role:'Victim', age:'26-40',
      lang:'Hindi / English', reasons:['Domestic violence'], safeword:'jasmine', demo:true,
      window:{ when:'Evening', how:'Text message' }, reviewedAt: ago(6), lastContact: ago(4),
      events:[
        ev('checkin', ago(18), { text:"Things are steady this week. I went to my sister's place and it helped a lot.", mood:4 }),
        ev('checkin', ago(14), { text:'Nothing much to report. I slept well most nights.', mood:4 }),
        ev('review',  ago(6),  { text:'Case reviewed by Anjali Kaur. No concerns raised.' }),
        ev('checkin', ago(5),  { text:'Feeling okay. Managed to go to work all week.', mood:4 })
      ] });
    const B = mkCase({ id:'SH-2104', alias:'Rekha S.', initials:'R', role:'Victim', age:'41-60',
      lang:'Marathi', reasons:['Financial abuse'], reviewedAt: ago(21), lastContact: ago(12),
      events:[
        ev('checkin', ago(30), { text:'I asked about the court hearing but nobody has told me anything. I need a lawyer who can explain it.', mood:3 }),
        ev('checkin', ago(22), { text:'Still no answer about the hearing. Money is very tight and I could not pay the rent this month.', mood:2 }),
        ev('voice',   ago(11), { text:'I cannot sleep. Every night I am awake all night thinking about it. I am tired of everything.', mood:2 }),
        ev('checkin', ago(4),  { text:"I stay inside most days now. I don't want to talk to the neighbours, people talk. There is no point explaining again.", mood:1 })
      ] });
    const C = mkCase({ id:'WT-0733', alias:'Farhan Q.', initials:'F', role:'Witness', age:'18-25',
      lang:'Urdu / Hindi', reasons:['Threats / intimidation'], reviewedAt: ago(26), lastContact: ago(24),
      events:[
        ev('checkin', ago(27), { text:'All fine here. I am waiting to hear about the date.', mood:4 }),
        ev('checkin', ago(25), { text:'No problems. Please let me know about the court date.', mood:4 })
      ] });
    const D = mkCase({ id:'SH-1988', alias:'Priya N.', initials:'P', role:'Victim', age:'26-40',
      lang:'Tamil', reasons:['Domestic violence'], closedNeeds:['housing','counsel'],
      reviewedAt: ago(3), lastContact: ago(2),
      events:[
        ev('checkin', ago(24), { text:'He showed up outside my house again. I am scared to go out.', mood:1 }),
        ev('incident',ago(23), { text:'He came to the gate at around 9pm and waited there.' }),
        ev('review',  ago(21), { text:'Escalated to urgent review by Anjali Kaur.' }),
        ev('intervention', ago(20), { text:'Safety review completed, shelter referral arranged, counselling started.', closes:'housing' }),
        ev('checkin', ago(12), { text:'The new place feels safer. I slept well for the first time.', mood:3 }),
        ev('checkin', ago(3),  { text:'Feeling better. Counselling helped a lot and I am stronger now.', mood:4 })
      ] });
    const all = [A,B,C,D];
    all.forEach(c => c.events.forEach(scoreEvent));
    return all;
  }

  return { DAY, now, ago, LEX, NEEDS, DOMAINS, QUESTIONS, STATES, pickQuestions,
           stateFor, analyze, voiceFeatures, ev, scoreEvent, scoreSitting,
           domainScores, openNeedsOf, missedGaps, assess, mkCase, seedCases };
});
