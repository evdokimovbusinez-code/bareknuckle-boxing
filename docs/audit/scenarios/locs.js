/* audit scenario: a quick fight on every location, 5 s in (the AI fights, the player stands). Run:
   bash tools/shot.sh /tmp/shots/loc.jpg js "return await eval(await (await fetch('docs/audit/scenarios/locs.js')).text())" [WxH touch]
   window.__locs = ['metro', 'bar'] limits the list. */
(async () => {
  const g = __g, G = g.G, log = [];
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  for (const id of window.__locs || ['parking', 'tires', 'yard', 'warehouse', 'metro', 'bar']) {
    const t0 = performance.now();
    G.loc = id; G.mode = 'quick'; g.startFight(true);
    const build = performance.now() - t0;
    let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
    __tick(150, 1 / 60);
    for (let i = 0; i < 6; i++) { g.press('punch', ['jab', 'cross', 'hookL'][i % 3]); __tick(25, 1 / 60); }
    const t1 = performance.now(); __tick(120, 1 / 60); const sim = (performance.now() - t1) / 120;
    const r = g.renderer.info.render;
    await __shot(id);
    log.push(id + ': start ' + build.toFixed(0) + ' ms, sim ' + sim.toFixed(2) + ' ms/frame, state ' + G.state + ', tris ' + g.renderer.info.render.triangles + ', calls ' + g.renderer.info.render.calls);
  }
  return log.join(' | ');
})()
