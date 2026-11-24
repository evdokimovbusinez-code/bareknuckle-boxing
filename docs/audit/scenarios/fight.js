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
