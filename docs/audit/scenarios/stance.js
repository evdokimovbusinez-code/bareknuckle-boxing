/* R-12 audit: the stance and the feet. The AI (normal) against the `mover` bot of R-02 for 60 s of fight on three locations;
   every frame (dt 1/60) of state `fight` for both men standing: the distance between the feet (ankle bones, on the floor plane),
   its length along the fight line and its width across it, the depth of the hips below the standing height, and the slide of the
   support foot — the foot nearer its own lowest ankle height, while it stays that foot — in the ring frame (the ring turns when
   the men circle). Needs the
   debug build (src/bench.js: __bot). Run:
   bash tools/shot.sh /tmp/shots/st.jpg js "return await eval(await (await fetch('docs/audit/scenarios/stance.js')).text())"
   window.__stLocs = ['bar'] limits the list, window.__stSecs = 20 shortens the fights.
   R-12 acceptance: gap p95 ≤ 0.85 m, max ≤ 1.0 m; slide ≤ 2 cm a frame in ≥ 98 % of the frames. */
(async () => {
  const g = __g, G = g.G, THREE = g.THREE, log = [], all = { gap: [], slide: [] };
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  const pc = (a, q) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const f2 = x => (+x).toFixed(3);
  const inv = new THREE.Matrix4(), wp = new THREE.Vector3();
  const ok = F => !F.rag.on && !F.ko && !F.gu && !F.slide && !F.doomed;
  for (const loc of window.__stLocs || ['parking', 'warehouse', 'bar']) {
    const S = { gap: [], len: [], wid: [], hip: [], hipR: [], slide: [], why: {}, n: 0 }, prev = new Map();
    const tk = window.__tick;
    const sample = () => {
      if (G.state !== 'fight') { prev.clear(); return; }
      g.ARENA.updateMatrixWorld(true); inv.copy(g.ARENA.matrixWorld).invert();
      for (const F of [g.P1, g.P2]) {
        if (!ok(F)) { prev.delete(F); continue; }
        const L = wp.setFromMatrixPosition(F.bones.CC_Base_L_Foot.matrixWorld).clone(), R = wp.setFromMatrixPosition(F.bones.CC_Base_R_Foot.matrixWorld).clone();
        const len = Math.abs(L.x - R.x), wid = Math.abs(L.z - R.z), gap = Math.hypot(len, wid);   // the men face each other along world x
        S.gap.push(gap); S.len.push(len); S.wid.push(wid); S.n++;
        F.__hip0 = F.__hip0 || F.hip.getWorldPosition(new THREE.Vector3()).y;
        const hd = F.__hip0 - F.hip.getWorldPosition(wp).y; S.hip.push(hd); if (!F.dodge && !F.cur) S.hipR.push(hd);
        // the support foot: the one nearer its own lowest ankle height (the rear heel is up in the stance, so the lower ankle
        // of the two is often the front foot in the middle of a step), and on the floor (within 3 cm of that lowest height)
        const m = F.__ymin || (F.__ymin = [9, 9]); m[0] = Math.min(m[0], L.y); m[1] = Math.min(m[1], R.y);
        const hL = L.y - m[0], hR = R.y - m[1], low = hL <= hR ? 'L' : 'R', p = (low === 'L' ? L : R).applyMatrix4(inv), q = prev.get(F);
        if (q && q.low === low && Math.min(hL, hR) < 0.03 && G.hitstop <= 0) {
          const s = Math.hypot(p.x - q.p.x, p.z - q.p.z); S.slide.push(s);
          if (s > 0.02) { const k = (F === g.P1 ? 'P1' : 'P2') + (F.ftOff && F.ftOff['s' + low] ? ' step' : '') + (F.cur ? ' punch' : ''); S.why[k] = (S.why[k] || 0) + 1; }
        }
        prev.set(F, { low, p });
      }
    };
    window.__tick = (n, dt) => { for (let i = 0; i < n; i++) { tk(1, dt); sample(); } };
    let r;
    try { r = __bot.run('mover', 'normal', 1, { loc, dt: 1 / 60, stopAt: window.__stSecs || 60, seed: 3 }).rows[0]; } finally { window.__tick = tk; }
    for (const F of [g.P1, g.P2]) { delete F.__hip0; delete F.__ymin; }
    all.gap.push(...S.gap); all.slide.push(...S.slide);
    const sl2 = S.slide.filter(x => x <= 0.02).length / Math.max(1, S.slide.length);
    log.push(`${loc}: ${S.n} samples, ${r.result} ${r.dur}s | gap p50 ${f2(pc(S.gap, 0.5))} p95 ${f2(pc(S.gap, 0.95))} max ${f2(Math.max(...S.gap))}`
      + ` | len p5 ${f2(pc(S.len, 0.05))} p50 ${f2(pc(S.len, 0.5))} p95 ${f2(pc(S.len, 0.95))} | wid p5 ${f2(pc(S.wid, 0.05))} p50 ${f2(pc(S.wid, 0.5))} p95 ${f2(pc(S.wid, 0.95))}`
      + ` | hipDrop p50 ${f2(pc(S.hip, 0.5))} p95 ${f2(pc(S.hip, 0.95))} rest p95 ${f2(pc(S.hipR, 0.95))} | slide p50 ${f2(pc(S.slide, 0.5))} p98 ${f2(pc(S.slide, 0.98))} max ${f2(Math.max(...S.slide))} ≤2cm ${(100 * sl2).toFixed(1)}% (>2cm: ${JSON.stringify(S.why)})`);
  }
  const sl = all.slide.filter(x => x <= 0.02).length / Math.max(1, all.slide.length);
  log.push(`ALL: gap p95 ${f2(pc(all.gap, 0.95))} max ${f2(Math.max(...all.gap))} | slide ≤2cm ${(100 * sl).toFixed(1)}% of ${all.slide.length}`);
  const st = []; for (let i = 0; i < 20; i++) { const L = g.streetLook ? g.streetLook() : null; if (L) st.push(L.shoes && L.shoes.id !== 'none' ? 1 : 0); }
  if (st.length) log.push(`streetLook x20: shoes in ${st.reduce((a, b) => a + b, 0)}`);
  return log.join('\n');
})()
