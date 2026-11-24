/* R-13 acceptance: 10 forced knockouts (__g.knockout), P1 and P2 winning in turn, a third of them with the winner out of breath.
   On the result screen, from the bones: each hand of the winner above its shoulder or on the belt; his pelvis / feet ≥ 0.9 m
   (horizontal) from the downed man's pelvis; his feet and toes clear of the downed man's limbs and trunk (capsules). Also the replay:
   it still runs its segments over the recorded frames. One frame per pose: celebrate-up / -fist / -hips. Run:
   bash tools/shot.sh /tmp/shots/cel.jpg js "return await eval(await (await fetch('docs/audit/scenarios/celebrate.js')).text())" */
(async () => {
  const c = id => document.getElementById(id).click();
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, V3 = g.THREE.Vector3, log = [], N = +(window.__celN || 10), shot = {};
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  const toFight = () => { let n = 0; while (G.state !== 'fight' && n++ < 60) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); } return G.state === 'fight'; };
  const wp = (F, n) => new V3().setFromMatrixPosition(F.bones['CC_Base_' + n].matrixWorld);
  const segD = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  const SEGS = [['Hip', 'Spine02'], ['Spine02', 'Head'], ['Hip', 'L_Thigh'], ['Hip', 'R_Thigh']];
  for (const S of ['L', 'R']) SEGS.push([S + '_Thigh', S + '_Calf'], [S + '_Calf', S + '_Foot'], [S + '_Foot', S + '_ToeBase'], [S + '_Upperarm', S + '_Forearm'], [S + '_Forearm', S + '_Hand'], ['Spine02', S + '_Upperarm']);
  const R = { ok: 0, fails: [] };
  c('go-quick'); c('go');
  for (let i = 0; i < N; i++) {
    if (!toFight()) { log.push(i + ': no fight (' + G.state + ')'); break; }
    __tick(60 + 37 * i % 180, 1 / 60);   // a different moment of the bout every time
    const W = i % 2 ? P2 : P1, L = W.other, f = W === P1 ? 1 : -1;
    if (i % 3 === 2) W.stamina = 20;   // out of breath: hands on the belt
    L.lastContact = L.headNow.clone();
    g.knockout(W, L, new V3(f, 0.2, 0).normalize(), 1.3, ['hookR', 'cross', 'jab', 'hookL'][i % 4], f, true, false);
    const pose = G.cel && G.cel.pose;
    let n = 0; while (G.state !== 'replay' && n++ < 400) __tick(1, 1 / 60);
    const segs = G.state === 'replay' ? g.RP ? g.RP.segs.length : -1 : 0; let rp = 0;
    while (G.state === 'replay' && rp++ < 2000) __tick(1, 1 / 60);
    n = 0; while (document.getElementById('result').hidden && n++ < 120) __tick(5, 1 / 60);
    __tick(20, 1 / 60);
    // the measurements
    const hip = wp(L, 'Hip'), hand = [], sh = [];
    let hOK = true; const hs = [];
    for (const S of ['L', 'R']) {
      const h = wp(W, S + '_Hand'), s = wp(W, S + '_Upperarm'), wh = wp(W, 'Hip');
      const up = h.y > s.y, belt = Math.hypot(h.x - wh.x, h.z - wh.z) < 0.32 && Math.abs(h.y - wh.y) < 0.22;
      hs.push(S + (up ? ':up' : belt ? ':belt' : ':NO') + '(' + (h.y - s.y).toFixed(2) + ')'); if (!up && !belt) hOK = false;
    }
    const pts = ['Hip', 'L_Foot', 'R_Foot', 'L_ToeBase', 'R_ToeBase'].map(n => wp(W, n));
    const dist = Math.min(...pts.map(p => Math.hypot(p.x - hip.x, p.z - hip.z)));
    let clr = 9; for (const p of pts.slice(1)) for (const [a, b] of SEGS) clr = Math.min(clr, segD(p, wp(L, a), wp(L, b)));
    const pass = hOK && dist >= 0.9 && clr >= 0.1 && segs >= 1 && rp > 60;
    if (pass) R.ok++; else R.fails.push(i);
    log.push(`${i}: ${W === P1 ? 'P1' : 'P2'} ${pose} hands ${hs.join(' ')} dist ${dist.toFixed(2)} feetClear ${clr.toFixed(2)} replay ${segs} segs ${(rp / 60).toFixed(1)}s ${pass ? 'OK' : 'FAIL'}` + (pass ? '' : ` [gap ${G.cel && G.cel.gap.toFixed(2)} W.x ${W.group.position.x.toFixed(2)} L.hip ${hip.x.toFixed(2)},${hip.z.toFixed(2)} adv ${W.adv.toFixed(2)} ring ${g.ARENA.position.x.toFixed(2)},${g.ARENA.position.z.toFixed(2)}]`));
    if (pose && !shot[pose]) { shot[pose] = 1; await __shot(pose); }
    c('r-again');
  }
  log.unshift(`R-13: ${R.ok}/${N} pass` + (R.fails.length ? ' fails ' + R.fails.join(',') : ''));
  return log.join('\n');
})()
