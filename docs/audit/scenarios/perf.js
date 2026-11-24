/* audit scenario: triangles / draw calls / textures per location on low and high (tools: __perf.report, 16_perf_report.js),
   the CPU cost of one simulation step in a fight (no rendering) and the F3 overlay. Run:
   bash tools/shot.sh /tmp/shots/perf.jpg js "return await eval(await (await fetch('docs/audit/scenarios/perf.js')).text())"
   Frame times of a headless run are SwiftShader (software) times — only triangles, calls and the sim cost are comparable. */
(async () => {
  const g = __g, G = g.G, out = [];
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  const rep = __perf.report({ frames: 3, levels: ['low', 'high'], locs: ['gym', 'parking', 'tires', 'yard', 'warehouse', 'boxgym', 'metro', 'bar'] });
  out.push(rep.table);
  document.getElementById('go-quick').click(); document.getElementById('go').click();
  let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
  const sim = k => { const t = performance.now(); __tick(k, 1 / 60); return ((performance.now() - t) / k).toFixed(2); };
  __tick(120, 1 / 60); out.push('sim, fight (ms per 1/60 step, no render): ' + sim(600));
  if (G.state === 'fight') { g.P2.lastContact = g.P2.headNow.clone(); g.knockout(g.P1, g.P2, new g.THREE.Vector3(1, 0.2, 0).normalize(), 1.3, 'hookR', 1, true, false); }
  out.push('sim, knockout ragdoll: ' + sim(120));
  out.push('heap MB: ' + (performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 'n/a') + ', geometries ' + g.renderer.info.memory.geometries + ', textures ' + g.renderer.info.memory.textures);
  try { g.perfToggle(); __step(3, 1 / 60); } catch (e) { out.push('perfToggle: ' + e.message); }
  return '\n' + out.join('\n');
})()
