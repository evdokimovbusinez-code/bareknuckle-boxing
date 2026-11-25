/* Issue 88 audit: blood, sweat and injuries up close. The `masher` bot (P1) fights the easy AI (P2) with the full simulation
   (lite: false — drops fall, stains land); at each mark of the round clock (window.__blT, default 30 / 60 / 90 s) the fight is
   held and P2 is shot: `fNN` his face (3/4 front, lit side), `sNN` the far side of the face, `bNN` his flank (body shots),
   and once `drop` (sweat + blood thrown off a fresh hit, 3 frames later) and `floor` (the canvas between them).
   window.__blLoc = 'tires' picks the place, window.__blSeed the fight. Run:
   bash tools/shot.sh /tmp/shots/bl.jpg js "return await eval(await (await fetch('docs/audit/scenarios/blood.js')).text())" */
(async () => {
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, out = [], marks = window.__blT || [30, 60, 90], loc = window.__blLoc || 'gym';
  const quick = !!window.__blQuick, pre = loc === 'gym' ? '' : loc + '-';   // quick: only the face and the drops (the lit places)
  const OPT = g.OPT, FX = g.FX;
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  OPT.cine = false; OPT.shake = false; window.__noKD = true;   // a long fight: nobody goes down, hp is held above 25 (wounds grow with the damage taken)
  const r0 = __bot.run('masher', 'easy', 1, { loc, dt: 1 / 60, stopAt: 1, seed: window.__blSeed || 2, lite: false }).rows[0];
  OPT.cine = false; OPT.shake = false;
  if (r0.result !== 'stopped') return 'fight ended at once: ' + JSON.stringify(r0);
  const pol = __bot.BOT_POL.masher, b = { r: Math.random, next: 0 }; let t = 1;
  const ctx = () => ({ fwd: Math.sign(P2.group.position.x - P1.group.position.x) || 1, dist: Math.abs(P2.group.position.x - P1.group.position.x) });
  const run = until => { let guard = 0;
    while ((t < until || G.state !== 'fight') && guard++ < 60 * 400) {
      if (G.state === 'fight') { pol(b, ctx()); t += G.hitstop > 0 ? 0 : G.slow / 60; P1.hp = Math.max(P1.hp, 50); P2.hp = Math.max(P2.hp, 45); }
      else { P1.moveDir = 0; if (G.state === 'intro' || G.state === 'rend') g.introSkip(); if (['over', 'result', 'replay', 'ko'].includes(G.state)) return false; }
      __tick(1, 1 / 60);
    }
    P1.moveDir = 0; return true; };
  const still = () => { for (const F of [P1, P2]) { F.moveDir = 0; F.moveLat = 0; } };
  const face = async (tag, side) => {
    const h = P2.headNow, s = side ? -1 : 1;
    window.__camHold = { p: [h.x - 0.46, h.y - 0.12, h.z + 0.24 * s], l: [h.x, h.y - 0.02, h.z] }; __tick(0, 0); await __shot(pre + tag);
  };
  const flank = async tag => { const h = P2.headNow;
    window.__camHold = { p: [h.x - 0.32, h.y - 0.3, h.z + 0.72], l: [h.x, h.y - 0.4, h.z] }; __tick(0, 0); await __shot(pre + tag); };
  for (const m of marks) {
    if (!run(m)) { out.push('fight over before ' + m + ' s: ' + G.state); break; }
    still(); const fl = P2.flesh;
    out.push(`${m} s: hp ${P2.hp.toFixed(0)} wounds ${fl.wounds.map(w => w.kind + ':' + w.sev.toFixed(2)).join(' ')} eye ${fl.eyeSwell.map(v => v.toFixed(2))} ` +
      `smears ${fl.u.uSm.value.filter(v => v.w > 0).length} bruises ${fl.u.uBr.value.filter(v => v.w > 0).length}` + (fl.blood ? ` film ${fl.blood.n}` : ''));
    await face('f' + m); if (!quick) { await face('s' + m, true); await flank('b' + m); }
    if (m === marks[0]) {
      const h = P2.headNow.clone(), d = new g.THREE.Vector3(1, 0.15, 0.1).normalize();
      FX.spawn(h.clone().add(new g.THREE.Vector3(-0.08, 0, 0)), d, 1); FX.mist(h.clone().add(new g.THREE.Vector3(-0.05, -0.05, 0)), d, 1, 0.6);
      G.paused = false; for (let i = 0; i < 4; i++) __tick(1, 1 / 60); still();
      window.__camHold = { p: [h.x - 0.3, h.y + 0.05, h.z + 0.75], l: [h.x + 0.2, h.y - 0.05, h.z] }; __tick(0, 0); await __shot(pre + 'drop'); if (quick) continue;
      const c = (P1.group.position.x + P2.group.position.x) / 2;
      window.__camHold = { p: [c - 0.2, 1.1, 1.1], l: [c + 0.1, 0, 0] }; __tick(0, 0); await __shot(pre + 'floor');
    }
  }
  delete window.__camHold;
  return '\n' + loc + '\n' + out.join('\n');
})()
