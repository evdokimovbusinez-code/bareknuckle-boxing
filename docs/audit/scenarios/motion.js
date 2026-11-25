/* #87 audit: the fighter's motion against the player's shadow boxing (docs/ref/shadow/). A quick fight, P2 does nothing, P1 is
   posed and stopped at each moment, shot close: guard (front / side), high block, every punch at the contact frame, slip, duck, the
   fist. Also samples the finger joints of both men over the whole run (`__fist.min(F)`, 05b_motion.js): the smallest flexion at any
   joint of any finger, degrees (≥ 70 wanted). Frames -guard, -side, -block, -jab … -over, -slip, -duck, -fist.
   window.__motionOff = true: the #87 layers off (FIST.on / FORM.on = false) = the "before".
   window.__motionSheet = true: no frames saved; both passes (off, then on) run in one page and the result ends with
   `SHEET data:image/jpeg;base64,…` = docs/audit/motion.jpg (before | after per moment). Run:
   bash tools/shot.sh /tmp/shots/m.jpg js "return await eval(await (await fetch('docs/audit/scenarios/motion.js')).text())" 640x480
   sheet: … js "window.__motionSheet = true; return …" 640x480 > /tmp/m.txt; grep -o 'base64,[^ ]*' /tmp/m.txt | cut -c8- | base64 -d > docs/audit/motion.jpg */
(async () => {
  const c = id => document.getElementById(id).click();
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, AI = g.AI, log = [], FI = window.__fist, SHEET = !!window.__motionSheet;
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  window.__noKD = true;
  c('go-quick'); c('go');
  let n = 0; while (G.state !== 'fight' && n++ < 60) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
  log.push('fight after ' + n + ': ' + G.state);
  P2.startDodge = () => {}; P2.startPunch = () => {};
  let fmin = 999, fwhere = '';
  const keep = () => { AI.t = 99; AI.blockUntil = 0; P1.hp = P2.hp = 95; P1.stamina = P2.stamina = 100; P2.daze = P1.daze = 0; P2.knock = 0; P1.blocking = false; P2.blocking = false; P1.moveDir = 0; };
  const step = (k, tag) => { for (let i = 0; i < k; i++) { keep(); __tick(1, 1 / 60); if (FI && FI.FIST.on) for (const F of [P1, P2]) { const m = FI.min(F); if (m.a < fmin) { fmin = m.a; fwhere = tag + ' ' + m.where; } } } };
  const H = () => { const p = P1.headNow; return [p.x, p.y, p.z]; };
  const hold = (dp, dl) => { const h = H(); window.__camHold = { p: [h[0] + dp[0], h[1] + dp[1], h[2] + dp[2]], l: [h[0] + dl[0], h[1] + dl[1], h[2] + dl[2]] }; __tick(0, 0); };
  const FRONT = [[0.85, -0.05, 0.75], [0.05, -0.15, 0]], SIDE = [[0.25, -0.35, 1.75], [0.25, -0.45, 0]];
  const BODY = () => { const x = P1.group.position.x, z = P1.group.position.z; window.__camHold = { p: [x + 1.1, 1.25, z + 2.7], l: [x + 0.3, 0.85, z] }; __tick(0, 0); };
  if (FI) log.push('fist rig ok: ' + FI.rig(P1).ok);
  // the sheet: TAGS in 3 columns of (before | after) pairs, cells half the frame
  const TAGS = ['guard', 'side', 'block', 'fist', 'jab', 'cross', 'hookL', 'hookR', 'upperR', 'over', 'slip', 'duck'];
  const cv = g.renderer.domElement, CW = cv.width >> 1, CH = cv.height >> 1, COLS = 3, LH = 22;
  const sh = document.createElement('canvas'); sh.width = COLS * (2 * CW + 8); sh.height = Math.ceil(TAGS.length / COLS) * (CH + LH);
  const sx = sh.getContext('2d'); sx.fillStyle = '#181818'; sx.fillRect(0, 0, sh.width, sh.height); sx.font = '15px sans-serif';
  let pass = 0;
  const shot = async tag => {
    if (!SHEET) return __shot(tag);
    const i = TAGS.indexOf(tag), x0 = (i % COLS) * (2 * CW + 8) + pass * CW, y0 = ((i / COLS) | 0) * (CH + LH);
    // __shot renders the scene for real (sceneRT); composer.render() posts that again into the canvas and drawImage reads it in the
    // same task (the drawing buffer is not preserved)
    await __shot('cell'); g.composer.render(); sx.drawImage(cv, 0, 0, cv.width, cv.height, x0, y0 + LH, CW, CH);
    sx.fillStyle = '#ddd'; sx.fillText(`${tag} — ${pass ? 'после' : 'до'}`, x0 + 6, y0 + 16);
  };
  const run = async () => {
    step(90, 'idle');
    hold(...FRONT); await shot('guard');
    hold(...SIDE); await shot('side');
    step(1, 'idle'); P1.blocking = true; for (let i = 0; i < 20; i++) { keep(); P1.blocking = true; __tick(1, 1 / 60); }
    hold(...FRONT); await shot('block'); P1.blocking = false;
    for (const nm of ['jab', 'cross', 'hookL', 'hookR', 'upperR', 'over']) {
      step(50, 'idle'); P1.startPunch(nm); const P = g.PUNCH[nm]; let k = 0;
      while (P1.cur === nm && P1.act[nm].time < P.impact - 0.01 && k++ < 120) step(1, nm);
      BODY(); log.push(`${nm}: t ${P1.act[nm].time.toFixed(2)} / impact ${P.impact}`); await shot(nm);
      step(40, nm);
    }
    for (const d of ['slipL', 'duck']) { step(40, 'idle'); P1.startDodge(d); step(12, d); if (d === 'duck') BODY(); else hold(...FRONT); await shot(d === 'duck' ? 'duck' : 'slip'); step(30, d); }
    step(30, 'idle');
    const hp = P1.bones.CC_Base_L_Mid2.getWorldPosition(new g.THREE.Vector3());
    window.__camHold = { p: [hp.x + 0.30, hp.y + 0.06, hp.z + 0.20], l: [hp.x, hp.y - 0.01, hp.z] }; __tick(0, 0); await shot('fist');
    delete window.__camHold;
  };
  const set = on => { if (FI) { FI.FIST.on = on; FI.FORM.on = on; } };
  if (SHEET) { set(false); pass = 0; await run(); set(true); pass = 1; await run(); }
  else { if (window.__motionOff) { set(false); log.push('#87 layers off (before)'); } await run(); }
  log.push(FI ? `fist: min flexion ${fmin.toFixed(1)}° (${fwhere})` : 'fist: no __fist');
  if (SHEET) log.push('SHEET ' + sh.toDataURL('image/jpeg', 0.82));
  return log.join('\n');
})()
