/* issue 90 (critic): what a player sees of a whole bout on a place with its own light — the fight from the fight camera, the frame
   a clean punch lands on (flash, caption, camera), the walk, a knockdown, the knockout, its replay, the result card.
   The `masher` bot fights the normal AI with the full simulation. window.__crLoc picks the place ('tires'). Run:
   bash tools/shot.sh /tmp/shots/cr.jpg js "return await eval(await (await fetch('docs/audit/scenarios/critic.js')).text())" 960x540
   Frames: -fight, -hit, -walk, -kd, -ko, -replay, -result. (Close-ups of the motion: motion.js; of the blood: blood.js.) */
(async () => {
  const g = __g, { G, P1, P2, OPT } = g, V3 = g.THREE.Vector3, out = [], loc = window.__crLoc || 'tires';
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  const r0 = __bot.run('masher', 'normal', 1, { loc, dt: 1 / 60, stopAt: 20, seed: 3, lite: false }).rows[0];
  OPT.cine = false;
  if (r0.result !== 'stopped') return 'fight ended at once: ' + JSON.stringify(r0);
  const pol = __bot.BOT_POL.masher, b = { r: Math.random, next: 0 };
  const ctx = () => ({ fwd: Math.sign(P2.group.position.x - P1.group.position.x) || 1, dist: Math.abs(P2.group.position.x - P1.group.position.x) });
  const play = k => { for (let i = 0; i < k && G.state === 'fight'; i++) { pol(b, ctx()); __tick(1, 1 / 60); } };
  P1.hp = Math.max(P1.hp, 70); P2.hp = Math.max(P2.hp, 70);
  const SK = window.__crSkip || [], shot = tag => SK.includes(tag) ? null : __shot(tag);   // window.__crSkip = ['fight', 'hit', 'walk', 'kd']: frames not saved (a quicker rerun)
  __tick(2, 1 / 60); await shot('fight'); out.push(`20 s: hp ${P1.hp.toFixed(0)} / ${P2.hp.toFixed(0)}, stamina ${P1.stamina.toFixed(0)} / ${P2.stamina.toFixed(0)}`);
  // the frame a clean punch of at least 4 hp lands on
  { const L = window.__dmgLog = []; let n = 0, hit = null; window.__noKD = true;
    while (!hit && n++ < 1500 && G.state === 'fight') { P1.stamina = Math.max(P1.stamina, 70); play(1); hit = L.find(e => !e[5] && e[1] >= 4); if (!hit) L.length = 0; }
    out.push('hit: ' + JSON.stringify(hit) + ` hitstop ${G.hitstop.toFixed(3)} slow ${G.slow} popups ${document.querySelectorAll('.pop').length}`);
    await shot('hit'); window.__dmgLog = null; }
  // the walk: P1 backs off, shot from the side at mid-stride
  { play(40); P1.moveDir = -ctx().fwd; __tick(22, 1 / 60); const p = P1.group.position;
    window.__camHold = { p: [p.x - 0.2, 0.9, p.z + 3.1], l: [p.x + 0.35, 0.85, p.z] }; __tick(0, 0); await shot('walk'); delete window.__camHold; P1.moveDir = 0; }
  window.__noKD = false; play(30);
  if (G.state === 'fight') { P2.lastContact = P2.headNow.clone(); g.knockdown(P1, P2, new V3(1, 0.2, 0).normalize(), 1.1, 'cross', 1); }
  __tick(70, 1 / 60); await shot('kd'); out.push('kd: ' + G.state);
  let n = 0; while (G.state !== 'fight' && document.getElementById('result').hidden && n++ < 80) __tick(30, 1 / 60);
  out.push('after the count: ' + G.state);
  if (G.state !== 'fight') {   // counted out (the AI does not mash its way up): a rematch for the knockout
    document.getElementById('r-again').click(); n = 0;
    while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
    out.push('rematch: ' + G.state);
  }
  if (G.state === 'fight') {
    play(60); P2.lastContact = P2.headNow.clone(); g.knockout(P1, P2, new V3(1, 0.2, 0).normalize(), 1.3, 'hookR', 1, true, false);
    __tick(100, 1 / 60); await shot('ko'); out.push('ko: ' + G.state);
    n = 0; while (G.state !== 'replay' && n++ < 30) __tick(30, 1 / 60);
    __tick(90, 1 / 60); await shot('replay'); out.push('replay: ' + G.state);
  }
  n = 0; while (n++ < 80 && document.getElementById('result').hidden) __tick(30, 1 / 60);
  await shot('result'); out.push('end: ' + G.state);
  return '\n' + out.join('\n');
})()
