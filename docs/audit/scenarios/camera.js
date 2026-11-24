/* R-03 acceptance: the corner posts must not cover the fighters. Random ring turns with the pair at each corner, in the states
   fight / kd / ko / result: on screen, the box of a post (foot … top 1.45 m, ± pad radius) must not cross the box of a head or a torso
   that stands behind it — unless the post is faded (opacity ≤ 0.2). Also: in kd / ko / result, how often the standing man's pelvis
   projects within 0.2 NDC of the downed man's head and in front of it. Run:
   bash tools/shot.sh /tmp/shots/cam.jpg js "window.__camN = 300; return await eval(await (await fetch('docs/audit/scenarios/camera.js')).text())"
   (window.__camN = number of samples, default 300; window.__camShots = true saves a frame of each failure as cam-fail-N.jpg) */
(async () => {
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, THREE = g.THREE, V3 = THREE.Vector3, cam = g.camera, A = g.ARENA;
  const c = id => document.getElementById(id).click();
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  const N = window.__camN || 300, H = 2.65, log = [], fails = [], t0 = performance.now();
  let rs = 12345; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  const posts = []; A.traverse(o => { const p = o.geometry && o.geometry.parameters; if (o.isMesh && o.geometry.type === 'CylinderGeometry' && Math.abs(p.radiusTop - 0.09) < 1e-3) posts.push(o); });
  const toFight = () => { let n = 0; while (G.state !== 'fight' && n++ < 60) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(20, 1 / 60); } return G.state === 'fight'; };
  // put the middle of the pair ~0.6-1.1 m in from corner ci, the ring turned by a random angle; both men inside the ropes
  const place = ci => {
    const sx = ci & 1 ? 1 : -1, sz = ci & 2 ? 1 : -1, mx = (P1.group.position.x + P2.group.position.x) / 2;
    for (let k = 0; k < 80; k++) {
      const th = rnd() * Math.PI * 2, s = 0.62 + rnd() * 0.2, lx = sx * H * s, lz = sz * H * s, c = Math.cos(th), sn = Math.sin(th);
      // world = R(th)·local + A  (three.js y-rotation: x' = x c + z s, z' = −x s + z c)
      const ax = mx - (lx * c + lz * sn), az = 0 - (-lx * sn + lz * c);
      const ok = [P1, P2].every(F => { const wx = F.group.position.x - ax, wz = -az; const x = wx * c - wz * sn, z = wx * sn + wz * c; return Math.abs(x) < 2.4 && Math.abs(z) < 2.4; });
      if (ok) { A.rotation.y = th; A.position.set(ax, 0, az); A.updateMatrixWorld(true); return th; }
    }
    return null;
  };
  const right = new V3(), up = new V3(), q = new V3(), pw = new V3();
  const box = (pts, r) => { const b = [1e9, 1e9, -1e9, -1e9, 1e9];
    for (const p of pts) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      q.copy(p).addScaledVector(right, dx * r).addScaledVector(up, dy * r); const d = q.clone().sub(cam.position).dot(new V3(0, 0, -1).applyQuaternion(cam.quaternion));
      q.project(cam); b[0] = Math.min(b[0], q.x); b[2] = Math.max(b[2], q.x); b[1] = Math.min(b[1], q.y); b[3] = Math.max(b[3], q.y); b[4] = Math.min(b[4], d); }
    return b; };
  const measure = (tag) => {
    cam.updateMatrixWorld(); right.set(1, 0, 0).applyQuaternion(cam.quaternion); up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const bodies = []; for (const F of [P1, P2]) { const j = F.jp; bodies.push(['head', box([F.headNow], 0.12)], ['torso', box([j[0], j[1], j[2], j[3], j[4]], 0.08)]); }
    let bad = 0, faded = 0;
    for (const p of posts) {
      if (!p.visible) continue; p.getWorldPosition(pw);
      const pb = box([new V3(pw.x, 0, pw.z), new V3(pw.x, 1.45, pw.z)], 0.09); if (pb[4] < 0.05) continue;
      // only the part of the screen that is actually in the frame counts
      const inFrame = b => b[0] < 1 && b[2] > -1 && b[1] < 1 && b[3] > -1;
      for (const [nm, b] of bodies) if (inFrame(b) && pb[4] < b[4] && pb[0] < b[2] && pb[2] > b[0] && pb[1] < b[3] && pb[3] > b[1]) {
        if (p.material.opacity <= 0.2) { faded++; } else { bad++; fails.push(tag + ':' + nm + ' op=' + p.material.opacity.toFixed(2)); }
        break;
      }
    }
    // both men whole in the frame: every joint and the crown inside NDC ±1
    const whole = [P1, P2].every(F => [...F.jp, F.headNow.clone().add(new V3(0, 0.14, 0))].every(p => { const n = p.clone().project(cam); return Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1 && n.z < 1; }));
    return { bad, faded, whole };
  };
  // standing man in front of the downed head, within 0.2 NDC of it: [pelvis (as in the task), pelvis or knees or feet]
  const winCover = () => {
    const W = G.state === 'kd' ? G.kd.att : G.winner, L = G.state === 'kd' ? G.kd.def : G.loser; if (!W || !L) return [false, false];
    const b = L.headNow.clone().project(cam), dH = L.headNow.distanceTo(cam.position), j = W.jp;
    const near = p => p.distanceTo(cam.position) < dH && (q => Math.hypot(q.x - b.x, q.y - b.y) < 0.2)(p.clone().project(cam));
    const pv = j[0].clone().add(j[1]).multiplyScalar(0.5);
    return [near(pv), near(pv) || [9, 12, 10, 13].some(i => near(j[i]))];
  };
  const S = { fight: [0, 0, 0, 0], kd: [0, 0, 0, 0], ko: [0, 0, 0, 0], result: [0, 0, 0, 0] }, cover = { kd: [0, 0], ko: [0, 0], result: [0, 0] }, yaw = [];
  const rec = async (st, tag) => { const r = measure(tag); S[st][0]++; S[st][1] += r.bad ? 1 : 0; S[st][2] += r.faded ? 1 : 0; S[st][3] += r.whole ? 1 : 0;
    if (st !== 'fight') { const w = winCover(); cover[st][0] += w[0]; cover[st][1] += w[1]; }
    yaw.push(Math.abs(__camClear.CC.yaw) * 180 / Math.PI); if (r.bad && window.__camShots && fails.length < 12) await __shot('fail-' + fails.length); };
  c('go-quick'); c('go'); toFight();
  if (window.__camCorner) {   // the close-up at a corner: the ring turned 45°, the near corner post 1 m in front of the pair, between them and the camera
    window.__camOff = window.__camCorner === 'off';
    const ph = -Math.PI / 4; A.rotation.y = ph; A.position.set((P1.group.position.x + P2.group.position.x) / 2, 0, 1.0 - H * Math.SQRT2); A.updateMatrixWorld(true);
    __tick(40, 1 / 60); const r = measure('corner'); await __shot('corner');
    return 'corner ' + (window.__camOff ? 'OLD' : 'NEW') + ': covered=' + r.bad + ' faded=' + r.faded + ' yaw=' + (__camClear.CC.yaw * 180 / Math.PI).toFixed(1) + ' ' + fails.join(',');
  }
  let i = 0;
  while (i < N) {
    const kind = ['fight', 'kd', 'ko'][(i / 4 | 0) % 3], ci = i % 4;
    if (G.state !== 'fight') { g.startFight(); if (!toFight()) { log.push('no fight: ' + G.state); break; } }
    __tick(20, 1 / 60); if (G.state !== 'fight') continue;
    const th = place(ci); if (th === null) { __tick(30, 1 / 60); continue; }
    if (kind === 'fight') { __tick(50, 1 / 60); if (G.state === 'fight') { await rec('fight', 'f' + i + 'c' + ci); i++; } continue; }
    const p1 = rnd() < 0.5, att = p1 ? P1 : P2, def = p1 ? P2 : P1, fwd = p1 ? 1 : -1;
    def.lastContact = def.headNow.clone();
    if (kind === 'kd') { g.knockdown(att, def, new V3(fwd, 0.2, 0).normalize(), 1.1, 'cross', fwd); __tick(110, 1 / 60); if (G.state === 'kd') { await rec('kd', 'kd' + i + 'c' + ci); i++; } g.startFight(); toFight(); continue; }
    g.knockout(att, def, new V3(fwd, 0.2, 0).normalize(), 1.3, 'hookR', fwd, true, false); __tick(150, 1 / 60);
    if (G.state === 'ko') { await rec('ko', 'ko' + i + 'c' + ci); i++; }
    if (G.state === 'ko' || G.state === 'replay') { __camClear.endReplay(); __tick(40, 1 / 60); if (G.state === 'result') { await rec('result', 'res' + i + 'c' + ci); i++; } }
    g.startFight(); toFight();
  }
  yaw.sort((a, b) => a - b);
  log.push('samples ' + i + ' in ' + ((performance.now() - t0) / 1000).toFixed(0) + ' s');
  for (const k in S) log.push(`${k}: n=${S[k][0]} covered=${S[k][1]} faded=${S[k][2]} bothWhole=${S[k][3]}` + (k in cover ? ` winnerOverHead pelvis=${cover[k][0]} pelvis|legs=${cover[k][1]}` : ''));
  log.push('|yaw| deg p50=' + (yaw[yaw.length >> 1] || 0).toFixed(1) + ' p90=' + (yaw[(yaw.length * 0.9) | 0] || 0).toFixed(1) + ' max=' + (yaw[yaw.length - 1] || 0).toFixed(1));
  log.push('fails: ' + fails.slice(0, 20).join(', '));
  return log.join(' | ');
})()
