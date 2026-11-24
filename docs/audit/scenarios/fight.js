/* audit scenario: quick fight → exchange → forced knockdown → forced knockout → replay → result screen. Run:
   bash tools/shot.sh /tmp/shots/fight.jpg js "return await eval(await (await fetch('docs/audit/scenarios/fight.js')).text())" [WxH touch] */
(async () => {
  const c = id => document.getElementById(id).click();
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, V3 = g.THREE.Vector3; const log = [];
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  c('go-quick'); c('go');
  log.push('after go: ' + G.state + ' introT=' + (+G.introT || 0).toFixed(2));
  __tick(60, 1 / 60); await __shot('intro'); log.push('s=' + G.state);
  let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) { log.push('skipErr ' + e.message); } __tick(30, 1 / 60); }
  log.push('fight after ' + n + ' : ' + G.state);
  __tick(240, 1 / 60); await __shot('f4');
  /* issue 81: 300 random spots at the ropes (pair midpoint 0.35–1.0 m inside the fighters' boundary, any turn of the ring) — the camera
     settled there; the corner posts' cylinders (screen box) must take < 8 % of the frame. «before» = the same camera without the rule
     (CC.noFrac). Worst spot of each is shot (posts-before / posts-after) */
  if (__loc.get().ring) {
    const CX = __camClear, A = g.ARENA, sp = A.position.clone(), sy = A.rotation.y, half = __loc.get().bound.half || 2.2;
    let sd = 81; const rnd = () => ((sd = (sd * 1103515245 + 12345) % 2147483648) / 2147483648);
    const m = new V3((P1.group.position.x + P2.group.position.x) / 2, 0, 0), q = new V3(), dir = new V3();
    const spots = []; while (spots.length < 300) {
      const th = rnd() * 6.2832, s = (rnd() * 4) | 0, d = 0.35 + rnd() * 0.65, u = (rnd() * 2 - 1) * (half - 0.3);
      q.set(s & 1 ? u : (s & 2 ? 1 : -1) * (half - d), 0, s & 1 ? (s & 2 ? 1 : -1) * (half - d) : u);
      A.position.set(0, 0, 0); A.rotation.y = th; A.updateMatrixWorld(true); const w = q.clone().applyMatrix4(A.matrixWorld);
      A.position.copy(m).sub(w); A.updateMatrixWorld(true); const inv = A.matrixWorld.clone().invert();
      const ok = [P1, P2].every(F => { const l = F.group.position.clone().applyMatrix4(inv); return half - Math.max(Math.abs(l.x), Math.abs(l.z)) > 0.1; });
      if (ok) spots.push([A.position.x, A.position.z, th]);
    }
    const run = tag => { let worst = 0, wi = 0, over = 0, sum = 0;
      spots.forEach(([x, z, th], i) => { A.position.set(x, 0, z); A.rotation.y = th; A.updateMatrixWorld(true); CX.settle();
        const cp = g.camera.position, cl = cp.clone().add(g.camera.getWorldDirection(dir)), f = CX.ccPostsFrac(CX.ccPostsWorld(), cp, cl);
        sum += f; if (f >= 0.08) over++; if (f > worst) { worst = f; wi = i; } });
      log.push(`posts ${tag}: worst ${(worst * 100).toFixed(1)}% mean ${(sum / spots.length * 100).toFixed(2)}% ≥8%: ${over}/300`);
      if (tag === 'after') { const [x, z, th] = spots[wi]; A.position.set(x, 0, z); A.rotation.y = th; A.updateMatrixWorld(true); CX.settle();
        log.push(`worst: yaw ${(CX.CC.yaw * 57.3).toFixed(0)}° lift ${CX.CC.lift.toFixed(2)} cam ${g.camera.position.toArray().map(v => v.toFixed(2))}`); }
      if (tag === 'after' && over) console.error(`issue 81: a corner post takes ≥ 8 % of the frame on ${over} of 300 spots at the ropes`);   // fails the smoke set
      return wi; };
    const shotAt = async (i, tag) => { const [x, z, th] = spots[i]; A.position.set(x, 0, z); A.rotation.y = th; A.updateMatrixWorld(true); CX.settle(); g.camera.updateMatrixWorld(); __tick(8, 1 / 60); CX.settle(); await __shot(tag); };
    CX.CC.noFrac = true; const wb = run('before'); await shotAt(wb, 'posts-before');
    CX.CC.noFrac = false; const wa = run('after'); await shotAt(wa, 'posts-after'); await shotAt(wb, 'posts-after-b');
    A.position.copy(sp); A.rotation.y = sy; A.updateMatrixWorld(true); CX.settle();
  }
  for (let i = 0; i < 12; i++) { try { g.press('punch', ['jab', 'cross', 'hookL', 'hookR'][i % 4]); } catch (e) { log.push('pressErr ' + e.message); break; } __tick(25, 1 / 60); }
  await __shot('f9'); log.push('hp ' + P1.hp + ' / ' + P2.hp + ' st=' + G.state);
  const t0 = performance.now(); __tick(300, 1 / 60); log.push('sim ms/frame (fight, no render): ' + ((performance.now() - t0) / 300).toFixed(2));
  if (G.state === 'fight') { P2.lastContact = P2.headNow.clone(); g.knockdown(P1, P2, new V3(1, 0.2, 0).normalize(), 1.1, 'cross', 1); }
  __tick(50, 1 / 60); await __shot('kd1'); log.push('kd: ' + G.state);
  __tick(120, 1 / 60); await __shot('kd2'); log.push('kd2: ' + G.state);
  n = 0; while (G.state !== 'fight' && n++ < 60) { try { g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
  log.push('back to fight after ' + n * 0.5 + 's: ' + G.state);
  if (G.state === 'result') { await __shot('countout'); c('r-again'); n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); } __tick(150, 1 / 60); log.push('rematch: ' + G.state); }
  if (G.state === 'fight') { P2.lastContact = P2.headNow.clone(); g.knockout(P1, P2, new V3(1, 0.2, 0).normalize(), 1.3, 'hookR', 1, true, false); }
  __tick(40, 1 / 60); await __shot('ko1'); log.push('ko: ' + G.state);
  __tick(140, 1 / 60); await __shot('ko2'); log.push('ko2: ' + G.state);
  n = 0; while (G.state !== 'replay' && n++ < 30) __tick(30, 1 / 60);
  __tick(90, 1 / 60); await __shot('replay'); log.push('rp: ' + G.state);
  n = 0; while (n++ < 80 && document.getElementById('result').hidden) { __tick(30, 1 / 60); }
  await __shot('result'); log.push('end: ' + G.state + ' n=' + n);
  return log.join(' | ');
})()
