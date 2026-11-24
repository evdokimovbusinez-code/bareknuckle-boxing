/* R-05 audit: hit captions (damage numbers, «блок», «мимо», …) without noise. Run:
   bash tools/shot.sh /tmp/shots/pop.jpg js "return await eval(await (await fetch('docs/audit/scenarios/popups.js')).text())" [WxH touch]
   Frame -series: the 12-punch series of fight.js thrown into an opponent who keeps his guard up; every caption of it is held on
   screen (their removal timers are held, the CSS flights paused at 300 ms) — the worst moment of that series, the same before / after
   (the game's random stream is seeded — `__rrSeed`, debug build — the opponent's look may still differ). Frame -open: the same series
   into a man who keeps his guard down and does not slip, the right hook thrown as a power shot.
   Then 300 punches of P1 (blocks of 25: into the guard, into an open man, against the normal AI that hits back):
   `R05 {...}` = captions reading 0 / 1 / 2, captions whose box (measured at 5 points of the flight) meets #hud, the smallest gap
   below #hud (px, wanted ≥ 8), the most captions on screen at once (wanted ≤ 4), PASS / FAIL. */
(async () => {
  const c = id => document.getElementById(id).click();
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, AI = g.AI, log = [];
  const pops = document.getElementById('pops'), hud = document.getElementById('hud');
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  window.__noKD = true;
  // the same fight every run (opponent, AI, the punches below): the game's stream (rr, debug build) and Math.random are seeded
  const mathRandom = Math.random; let seed = 4242; Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  if (window.__rrSeed) window.__rrSeed(4242);
  c('go-quick'); c('go');
  const toFight = () => { let n = 0; while (G.state !== 'fight' && n++ < 80) { try { g.introSkip(); g.cineSkip(); } catch (e) {} if (G.state === 'result') c('r-again'); __tick(30, 1 / 60); } return n; };
  log.push('fight after ' + toFight() + ': ' + G.state);
  __tick(240, 1 / 60);
  const guard = on => { AI.blockUntil = on ? G.t + 9 : 0; if (on) { P2.blocking = true; P2.blockW = 1; P2.guardDown = 0; } else { P2.blocking = false; P2.blockW = 0; } };
  // 1. the series of fight.js (12 punches, 25 frames apart); captions are not allowed to go away until the frame is taken.
  //    -series: into the guard (the case of the audit), -open: into a man who does not defend (numbers, counters, events)
  const st = window.setTimeout;
  const series = async (tag, block) => {
    await new Promise(r => st(r, 1000));   // the captions of the exchange before it go on their own (real-time timers) first
    const held = []; let most = 0;
    window.setTimeout = function (f, ms, ...a) { if (typeof f === 'function' && ms >= 500 && ms <= 1500 && /remove/i.test(String(f))) { held.push(f); return 0; } return st.call(window, f, ms, ...a); };
    const dodge = P2.startDodge; if (!block) P2.startDodge = () => {};   // -open: he does not slip either, the punches land
    for (let i = 0; i < 12; i++) {
      g.press('punch', ['jab', 'cross', 'hookL', 'hookR'][i % 4]); if (!block && i % 4 === 3) P1.powerNext = true;   // -open: the right hook a power shot
      for (let k = 0; k < 25; k++) { guard(block); if (!block) AI.t = 99; P1.hp = P2.hp = 95; __tick(1, 1 / 60); most = Math.max(most, pops.children.length); }
    }
    P2.startDodge = dodge;
    window.setTimeout = st;
    // a flight that already ended (real time) is gone from getAnimations: restart each one, then pause it at 300 ms
    for (const el of pops.children) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; const a = el.getAnimations()[0]; if (a) { a.pause(); a.currentTime = 300; } }
    for (const a of document.getAnimations()) { const t = a.effect && a.effect.target; if (t && t.id === 'msg') a.finish(); }   // «Раунд 1» out of the way
    log.push(tag + ': ' + pops.children.length + ' on screen [' + [...pops.children].map(e => { const r = e.getBoundingClientRect(); return e.textContent + ' @' + Math.round(r.left) + ',' + Math.round(r.top) + ' a' + (+getComputedStyle(e).opacity).toFixed(2); }).join(', ') + '], most ' + most);
    await __shot(tag);
    for (const f of held) { try { f(); } catch (e) {} }
    pops.textContent = '';
  };
  await series('series', true);
  __tick(60, 1 / 60);
  await series('open', false);
  // 2. 300 punches
  const seen = new WeakSet(), H = () => hud.getBoundingClientRect();
  const R = { punches: 0, captions: 0, low: 0, hud: 0, gap: 1e9, most: 0, texts: {} };
  const measure = el => {
    const a = el.getAnimations()[0], h = H(), t0 = a ? a.currentTime : 0; let over = 0;
    for (const t of [0, 150, 280, 500, 790]) {
      if (a) a.currentTime = t; const r = el.getBoundingClientRect();
      if (r.top < h.bottom && r.bottom > h.top && r.left < h.right && r.right > h.left) over++;
      R.gap = Math.min(R.gap, r.top - h.bottom);
    }
    if (a) a.currentTime = t0; return over;
  };
  // one macrotask per frame, so the captions' own removal timers get to run (a plain loop would never let them)
  const mc = new MessageChannel(), yieldTask = () => new Promise(r => { mc.port1.onmessage = () => r(); mc.port2.postMessage(0); });
  let pc = null, pt = 0, f = 0;
  while (R.punches < 300 && f++ < 60 * 400) {
    if (G.state !== 'fight') { toFight(); pc = null; continue; }
    const mode = Math.floor(R.punches / 25) % 3;   // 0 guard up, 1 open, 2 the AI as it is
    if (mode === 0) guard(true); else if (mode === 1) { guard(false); AI.t = 99; }
    P1.hp = Math.max(P1.hp, 40); P2.hp = Math.max(P2.hp, 40); P1.stamina = Math.max(P1.stamina, 60);
    const dist = Math.abs(P2.group.position.x - P1.group.position.x), fwd = Math.sign(P2.group.position.x - P1.group.position.x) || 1;
    P1.moveDir = dist > 1.1 ? fwd : 0;
    if (P1.canAct() && !P1.cur && Math.random() < 0.5) g.press('punch', ['jab', 'cross', 'hookL', 'hookR', 'upperL', 'upperR'][Math.random() * 6 | 0]);
    __tick(1, 1 / 60); await yieldTask();
    if (P1.cur && (P1.cur !== pc || P1.act[P1.cur].time < pt)) R.punches++;
    pc = P1.cur; pt = P1.cur ? P1.act[P1.cur].time : 0;
    for (const el of pops.children) {
      if (seen.has(el)) continue; seen.add(el); R.captions++;
      const tx = el.textContent; R.texts[tx] = (R.texts[tx] || 0) + 1;
      if (/^[0-2]$/.test(tx)) R.low++;
      if (measure(el)) R.hud++;
    }
    R.most = Math.max(R.most, pops.children.length);
  }
  P1.moveDir = 0; Math.random = mathRandom; if (window.__rrSeed) window.__rrSeed(0);
  R.gap = Math.round(R.gap); R.pass = R.punches >= 300 && R.low === 0 && R.hud === 0 && R.most <= 4;
  log.push('R05 ' + JSON.stringify(R));
  return log.join(' | ');
})()
