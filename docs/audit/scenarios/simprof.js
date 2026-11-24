/* R-23: the CPU budget of the simulation. Prints, for the quick fight of perf.js (the player stands, the AI works) and for the
   knockout ragdoll: ms per 1/60 step without the profiler, the profile (shares by subsystem + self time per function, __simProf in
   src/bench.js) and the growth of the JS heap over 60 s of fighting (needs chrome's --enable-precise-memory-info, tools/shot.py has it).
   Run:  bash tools/shot.sh /tmp/shots/sp.jpg js "return await eval(await (await fetch('docs/audit/scenarios/simprof.js')).text())"
   Options (set before it): window.__spGfx = 'low' — the preset (default: what the page picked; headless = high);
   window.__spNoProf = true — timings and heap only. */
(async () => {
  const g = __g, G = g.G, out = [], MB = 1048576;
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  if (window.__spGfx) g.setGfx(window.__spGfx);
  const start = () => { g.G.mode = 'quick'; g.startFight(true);
    let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); } __tick(120, 1 / 60); };
  const sim = k => { const t = performance.now(); __tick(k, 1 / 60); return (performance.now() - t) / k; };
  const ko = () => { g.P2.lastContact = g.P2.headNow.clone(); g.knockout(g.P1, g.P2, new g.THREE.Vector3(1, 0.2, 0).normalize(), 1.3, 'hookR', 1, true, false); };
  const heap = () => performance.memory ? performance.memory.usedJSHeapSize : 0, GC = () => { if (window.gc) window.gc(); };
  document.getElementById('go-quick').click(); document.getElementById('go').click();
  { let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); } __tick(120, 1 / 60); }
  { const S = g.P1.shorts; out.push('gfx ' + g.GFX.level + ', state ' + G.state + '; trunks cloth: ' + S.n + ' particles, ' + S.CA.length + ' links, ' + S.map.length + ' render vertices (' + S.nv0 + ' before indexing)'); }
  // 1. plain timings as perf.js takes them, then the same fight with the profiler
  out.push('sim, fight (ms per 1/60 step, no render): ' + sim(600).toFixed(2));
  if (!window.__spNoProf) out.push('PROFILE fight\n' + __simProf(600).table);
  if (window.__spMem) out.push('GARBAGE fight\n' + __simProf(600, 1 / 60, true).table);   // who allocates (kB per step)
  // 2. the heap over 60 s of the fight (3600 steps): growth, growth after a forced GC, garbage made per step
  { if (G.state !== 'fight') start();
    GC(); const h0 = heap(); let alloc = 0, prev = h0, n = 0; const t = performance.now();
    for (; n < 3600; n++) { __tick(1, 1 / 60); const h = heap(); if (h > prev) alloc += h - prev; prev = h; g.P1.hp = g.P2.hp = 100; }
    const ms = (performance.now() - t) / n, h1 = heap(); GC(); const h2 = heap();
    out.push('60 s of fight: ' + ms.toFixed(2) + ' ms / step, state ' + G.state + ', heap ' + (h0 / MB).toFixed(1) + ' → ' + (h1 / MB).toFixed(1) + ' MB (growth ' + ((h1 - h0) / MB).toFixed(2)
      + ' MB), after GC ' + ((h2 - h0) / MB).toFixed(2) + ' MB, allocated ' + (alloc / MB).toFixed(1) + ' MB = ' + (alloc / n / 1024).toFixed(1) + ' kB / step' + (window.gc ? '' : ' (no gc())')); }
  // 3. the knockout ragdoll
  if (G.state !== 'fight') start();
  ko(); out.push('sim, knockout ragdoll: ' + sim(120).toFixed(2));
  if (!window.__spNoProf) { start(); ko(); out.push('PROFILE knockout\n' + __simProf(120).table); }
  return '\n' + out.join('\n');
})()
