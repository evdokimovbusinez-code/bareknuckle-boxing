/* R-04 audit: the weight of a hit — hit-stop by power, on a block, over a flurry; the lens push; the contact flash. Run:
   bash tools/shot.sh /tmp/shots/hit.jpg js "return await eval(await (await fetch('docs/audit/scenarios/hitfeel.js')).text())"
   Frames: -flash (close-up of the frame of a clean power hook, paused on it), -flash2 (the frame after), -block (a cross into the
   guard), -wide (the fight camera on the frame of a power hook). Returns a log + `R04 {...}` with the numbers and PASS/FAIL. */
(async () => {
  const c = id => document.getElementById(id).click();
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, AI = g.AI, HF = window.__hitFeel, log = [];
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  window.__noKD = true; window.__hsLog = [];
  c('go-quick'); c('go');
  let n = 0; while (G.state !== 'fight' && n++ < 60) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
  log.push('fight after ' + n + ': ' + G.state);
  P2.startDodge = () => {}; P2.startPunch = () => {};   // he neither slips nor trades back: only P1's punches are measured
  // the AI stands still (AI.t), nobody tires or falls; P2.knock = 0: he does not step back out of range (a flurry that keeps landing
  // is the worst case for the freeze budget)
  const keep = block => { AI.t = 99; AI.blockUntil = block ? 1e9 : 0; P1.hp = P2.hp = 95; P1.stamina = P2.stamina = 100; P2.daze = 0; P2.knock = 0;
    if (block) { P2.blocking = true; P2.blockW = 1; P2.guardDown = 0; } else { P2.blocking = false; P2.blockW = 0; } };
  const calm = (sec, block) => { for (let i = 0; i < sec * 60; i++) { keep(block); __tick(1, 1 / 60); } };
  // throw one punch; step until it resolves; returns the hit-stop row (or null: a miss), G.hitstop and the fov right after that frame
  const hit = (name, pow, block, frozen) => {
    for (let i = 0; i < 120 && !(P1.canAct() && !P1.cur); i++) { keep(block); const t0 = G.t; __tick(1, 1 / 60); if (frozen && G.t === t0) frozen.f++; }
    const k = window.__hsLog.length; P1.wantBody = false; P1.powerNext = !!pow; P1.startPunch(name);
    for (let i = 0; i < 90; i++) { keep(block); const t0 = G.t; __tick(1, 1 / 60); if (frozen && G.t === t0) frozen.f++;
      if (window.__hsLog.length > k) return Object.assign({}, window.__hsLog[k], { G: +G.hitstop.toFixed(3), fov: +g.camera.fov.toFixed(2) });
      if (P1.resolved && P1.whiff) return null; }
    return null;
  };
  const land = (name, pow, block) => { for (let a = 0; a < 5; a++) { const r = hit(name, pow, block); if (r) return r; calm(0.8, block); } return null; };   // a whiff: again
  const R = {};
  // 1. a clean cross
  calm(2.2); let r = land('cross'); R.cross = r; log.push('cross ' + JSON.stringify(r));
  // 2. a power hook (right), clean
  calm(2.2); r = land('hookR', true); R.hook = r; log.push('power hookR ' + JSON.stringify(r));
  // 3. a cross into the guard
  calm(2.2, true); r = land('cross', false, true); R.block = r; log.push('block ' + JSON.stringify(r));
  calm(0.5, true);
  // 4. flurries of 4 quick punches: frozen frames from the first press to 1 s after the last hit
  const flurry = (names, pow) => { calm(2.2); const fz = { f: 0 }, rows = names.map(nm => hit(nm, pow, false, fz));
    for (let i = 0; i < 60; i++) { keep(); const t0 = G.t; __tick(1, 1 / 60); if (G.t === t0) fz.f++; }
    return { landed: rows.filter(Boolean).length, hs: rows.map(x => x && x.hs), frozen: +(fz.f / 60).toFixed(3) }; };
  R.flurry = flurry(['jab', 'cross', 'jab', 'cross']); log.push('flurry jab-cross ' + JSON.stringify(R.flurry));
  R.flurryHooks = flurry(['cross', 'hookL', 'cross', 'hookL'], true); log.push('flurry power cross-hook ' + JSON.stringify(R.flurryHooks));
  // 4b. the worst case, forced: 4 clean power right hooks resolved 0.25 s apart (no aiming, straight into resolveHit)
  { calm(2.2); const fz = { f: 0 }, hs = []; for (let i = 0; i < 4; i++) { keep(); P1.heavy = true; P1.punchK = 1.45; const k = window.__hsLog.length;
      g.resolveHit(P1, 'hookR', P2.headNow.clone()); hs.push(window.__hsLog.length > k ? window.__hsLog[k].hs : null);
      for (let j = 0; j < 15; j++) { keep(); const t0 = G.t; __tick(1, 1 / 60); if (G.t === t0) fz.f++; } }
    for (let i = 0; i < 60; i++) { keep(); const t0 = G.t; __tick(1, 1 / 60); if (G.t === t0) fz.f++; }
    P1.heavy = false; P1.punchK = 1; R.forced = { landed: hs.filter(x => x !== null).length, hs, frozen: +(fz.f / 60).toFixed(3) }; log.push('forced 4 power hooks ' + JSON.stringify(R.forced)); }
  // 5. the flash: a power hook, paused on its frame, close-up; then the next frame; then a block
  calm(2.2); r = land('hookR', true); G.paused = true;
  const cp = P2.lastContact ? P2.lastContact.clone() : P2.headNow.clone();
  window.__camHold = { p: [cp.x - 0.35, cp.y + 0.08, cp.z + 1.25], l: [cp.x, cp.y - 0.02, cp.z] };
  await __shot('flash'); G.paused = false; await __shot('flash2'); delete window.__camHold; log.push('flash shot ' + JSON.stringify(r));
  calm(2.2, true); r = land('cross', false, true); G.paused = true;
  const cb = P1.knuckle(new g.THREE.Vector3());   // a block flashes at the knuckles
  window.__camHold = { p: [cb.x - 0.35, cb.y + 0.08, cb.z + 1.25], l: [cb.x, cb.y - 0.02, cb.z] };
  await __shot('block'); G.paused = false; delete window.__camHold; log.push('block shot ' + JSON.stringify(r) + ' at ' + cb.toArray().map(v => v.toFixed(2)) + ' head ' + P2.headNow.toArray().map(v => v.toFixed(2)) + ' P1 ' + P1.group.position.x.toFixed(2) + ' P2 ' + P2.group.position.x.toFixed(2));
  calm(2.2); r = land('hookR', true); G.paused = true; await __shot('wide'); G.paused = false; log.push('wide ' + JSON.stringify(r));
  // OPT.shake off: no kick, no lens push
  const shk0 = g.OPT.shake; g.OPT.shake = false; calm(2.2); r = land('hookR', true); R.noShake = { fov: r && r.fov, shake: +G.shake.toFixed(4) }; g.OPT.shake = shk0;
  log.push('no shake ' + JSON.stringify(R.noShake));
  const ok = {
    cross: !!R.cross && R.cross.G >= 0.06, hook: !!R.hook && R.hook.G >= 0.09, block: !!R.block && R.block.blocked && R.block.G <= 0.02,
    flurry: R.flurry.landed >= 3 && R.flurry.frozen <= 0.25, flurryPow: R.flurryHooks.frozen <= 0.25, forced: R.forced.landed === 4 && R.forced.frozen <= 0.25,
    fov: !!R.hook && Math.abs(R.hook.fov - (HF.SHK.fov0 - 2)) < 0.01, noShake: R.noShake.fov === HF.SHK.fov0 && R.noShake.shake === 0,
  };
  log.push('R04 ' + JSON.stringify({ ok, pass: Object.values(ok).every(Boolean) }));
  return log.join('\n');
})()
