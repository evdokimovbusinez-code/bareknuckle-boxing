/* #83 audit: walking without skating. A quick fight with the AI held back (it never punches, AI.t = 99); P1 holds each direction
   for 3 s (forward, back, left, right, two diagonals), then lets go for 0.7 s; then P1 stands and the AI circles (AI.lat) for 3 s each
   way. Every frame (dt 1/60) both men's balls of the feet (CC_Base_*_ToeBase: what stays on the canvas when the heel comes up) and
   ankles are read in the ring frame (the floor: the ring turns when the men circle). A foot is on the canvas while its ball is within
   CONTACT m of the lowest height it had standing still; for every stretch on the canvas (≥ 3 frames) the slip = the largest
   horizontal distance of the ball from where it touched down (the ankle's is printed too: a heel turning on the ball moves it).
   Target (#83): mean < 1 cm, max < 2.5 cm. Also the walker's speed, strides per second (lift-offs of both feet / 2) and metres a
   stride (each foot moves that far per cycle) over 0.25–1.25 s of a hold (before the ropes stop him): speed = stride × cadence.
   Then a film strip: 6 frames of walking forward and 6 sideways, the legs close up (frames `fwd`, `side`).
   Run: bash tools/shot.sh /tmp/shots/w.jpg js "return await eval(await (await fetch('docs/audit/scenarios/walk.js')).text())"
   window.__wkNoShots = true skips the frames; window.__wkSecs = 1.5 shortens every hold. */
(async () => {
  const g = __g, G = g.G, THREE = g.THREE, P1 = g.P1, P2 = g.P2, log = [];
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  const CONTACT = 0.012, HOLD = window.__wkSecs || 3, dt = 1 / 60;
  const inv = new THREE.Matrix4(), wp = new THREE.Vector3();
  const start = () => {
    G.mode = 'quick'; g.OPT.cine = false; g.startFight(); G.state = 'fight'; G.introT = 9; G.stareT = 0;
    g.AI.t = 99; g.AI.latT = 99; g.AI.lat = 0; P2.startDodge = () => {}; P1.moveDir = P1.moveLat = 0;
    for (let i = 0; i < 40; i++) { g.AI.t = 99; window.__tick(1, dt); }
  };
  const ball = (F, S) => wp.setFromMatrixPosition(F.bones[`CC_Base_${S}_ToeBase`].matrixWorld).clone();
  const ankle = (F, S) => wp.setFromMatrixPosition(F.bones[`CC_Base_${S}_Foot`].matrixWorld).clone();
  const key = (F, S) => (F === P1 ? 'P1' : 'P2') + S;
  // calibrate: both men stand still a second — the lowest ball of each foot
  const ymin = new Map();
  const calib = () => { for (let i = 0; i < 60; i++) { g.AI.t = 99; window.__tick(1, dt); for (const F of [P1, P2]) for (const S of ['L', 'R']) { const k = key(F, S); ymin.set(k, Math.min(ymin.get(k) ?? 9, ball(F, S).y)); } } };
  // per foot on the canvas: the touch-down points, frames, slip so far
  const feet = new Map(), R = {};
  let win = false;
  const sample = (tag, who) => {
    g.ARENA.updateMatrixWorld(true); inv.copy(g.ARENA.matrixWorld).invert();
    const r = R[tag] || (R[tag] = { slip: [], ank: [], steps: 0, dist: 0, t: 0 });
    for (const F of who) for (const S of ['L', 'R']) {
      const k = key(F, S), p = ball(F, S), on = p.y - ymin.get(k) < CONTACT, a = ankle(F, S).applyMatrix4(inv); p.applyMatrix4(inv);
      let c = feet.get(k);
      if (on && !c) feet.set(k, c = { p0: p.clone(), a0: a.clone(), n: 0, s: 0, sa: 0, air: 0, k });
      if (on) { c.n++; c.s = Math.max(c.s, Math.hypot(p.x - c.p0.x, p.z - c.p0.z)); c.sa = Math.max(c.sa, Math.hypot(a.x - c.a0.x, a.z - c.a0.z)); if (F.ftOff && F.ftOff['s' + S]) c.air++; }
      if (!on && c) { done(r, c); feet.delete(k); if (F === who[0] && win) r.steps++; }
    }
  };
  // a stance over 2.5 cm is told apart: `air` = plantFeet had the foot stepping for some of its frames on the canvas
  const done = (r, c) => { if (c.n < 3) return; r.slip.push(c.s); r.ank.push(c.sa); if (c.s > 0.025) { const w = c.k + (c.air ? ' air' + c.air : '') + ' n' + c.n; r.why = r.why || []; r.why.push(w); } };
  const flush = tag => { for (const c of feet.values()) done(R[tag], c); feet.clear(); };
  const root = F => { g.ARENA.updateMatrixWorld(true); return F.group.position.clone().applyMatrix4(inv.copy(g.ARENA.matrixWorld).invert()); };
  const run = (tag, secs, set, who) => {
    feet.clear(); set(); let r0 = null, r1 = null;
    for (let i = 0; i < Math.round(secs / dt); i++) {
      g.AI.t = 99; window.__tick(1, dt); win = i >= 15 && i < 75; sample(tag, who);
      if (i === 15) r0 = root(who[0]); if (i === 75) r1 = root(who[0]);
    }
    flush(tag); win = false;
    if (r1) { R[tag].dist = Math.hypot(r1.x - r0.x, r1.z - r0.z); R[tag].t = 1; }
  };
  const DIRS = [['fwd', 1, 0], ['back', -1, 0], ['left', 0, 1], ['right', 0, -1], ['diagF', 1, 1], ['diagB', -1, -1]];
  start(); calib();
  for (const [tag, x, y] of DIRS) {
    start();
    run(tag, HOLD, () => { P1.moveDir = x; P1.moveLat = y; }, [P1, P2]);   // P2: the AI keeps its range (follows / backs off)
    run(tag + '-stop', 0.7, () => { P1.moveDir = P1.moveLat = 0; }, [P1, P2]);
  }
  for (const [tag, l] of [['aiCircle+', 1], ['aiCircle-', -1]]) {
    start(); run(tag, HOLD, () => { g.AI.lat = l; }, [P2, P1]); run(tag + '-stop', 0.7, () => { g.AI.lat = 0; }, [P2, P1]);
  }
  const all = [], f = x => (100 * x).toFixed(2);
  for (const k in R) {
    const r = R[k], s = r.slip; all.push(...s); if (!s.length) { log.push(`${k}: no contact`); continue; }
    const mean = s.reduce((a, b) => a + b, 0) / s.length, v = r.dist / (r.t || 1), cad = r.steps / (r.t || 1);
    log.push(`${k.padEnd(14)} slip mean ${f(mean)} cm max ${f(Math.max(...s))} cm, ankle max ${f(Math.max(...r.ank))} cm (${s.length} stances)`
      + (k.includes('stop') ? '' : ` | ${v.toFixed(2)} m/s, ${(cad / 2).toFixed(1)} strides/s, ${cad > 0 ? (2 * v / cad).toFixed(2) : '-'} m a stride`)
      + (r.why ? ` | >2.5 cm: ${r.why.join(', ')}` : ''));
  }
  const mean = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length), mx = Math.max(...all);
  log.push(`ALL: slip mean ${f(mean)} cm, max ${f(mx)} cm over ${all.length} stances — ${mean < 0.01 && mx < 0.025 ? 'OK' : 'FAIL'} (target mean < 1, max < 2.5 cm)`);
  if (!window.__wkNoShots) {
    // film strip: 6 frames 1/12 s apart, the legs close up from the side, pasted into one picture over the page
    const strip = async (tag, x, y) => {
      start(); P1.moveDir = x; P1.moveLat = y; for (let i = 0; i < 30; i++) { g.AI.t = 99; window.__tick(1, dt); }
      const cv = document.createElement('canvas'), src = g.renderer.domElement, cw = 420, ch = Math.round(cw * src.height / src.width);
      cv.width = cw * 3; cv.height = ch * 2; const c2 = cv.getContext('2d');
      for (let i = 0; i < 6; i++) {
        g.AI.t = 99; window.__tick(4, dt);
        const m = (P1.group.position.x + P2.group.position.x) / 2;
        window.__camHold = { p: [m, 0.6, 2.7], l: [m, 0.4, 0] }; window.__step(1, dt);
        c2.drawImage(src, (i % 3) * cw, (i / 3 | 0) * ch, cw, ch);
        c2.fillStyle = '#ff0'; c2.font = 'bold 18px sans-serif'; c2.fillText(`${tag} +${(i * 5 / 60).toFixed(2)} s`, (i % 3) * cw + 8, (i / 3 | 0) * ch + 24);
      }
      const im = document.createElement('img'); im.src = cv.toDataURL('image/jpeg', 0.9);
      im.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;object-fit:contain;background:#000;z-index:99999';
      document.body.appendChild(im); await new Promise(r => im.onload = r);
      await __shot(tag); im.remove(); delete window.__camHold;
    };
    await strip('fwd', 1, 0); await strip('side', 0, 1);
  }
  P1.moveDir = P1.moveLat = 0;
  return '\n' + log.join('\n');
})()
