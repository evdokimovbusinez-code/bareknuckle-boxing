/* audit scenario for a phone (append `740x360 touch` or `390x800 touch`): menu, quick-fight list, creator, shop, settings,
   a fight with the touch pad, pause, result. Run:
   bash tools/shot.sh /tmp/shots/ph.jpg js "return await eval(await (await fetch('docs/audit/scenarios/phone.js')).text())" 740x360 touch */
(async () => {
  const c = id => { const e = document.getElementById(id); if (e) e.click(); return !!e; };
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, V3 = g.THREE.Vector3, log = [];
  // smallest tap targets on the visible screen (CSS px)
  const taps = tag => { const r = [...document.querySelectorAll('button, .sw, [role=button], input, select')].filter(e => e.offsetParent !== null).map(e => { const b = e.getBoundingClientRect(); return [Math.round(Math.min(b.width, b.height)), (e.id || e.textContent || '').trim().slice(0, 14)]; }).filter(x => x[0] > 0).sort((a, b) => a[0] - b[0]); log.push(tag + ' minTap ' + r.slice(0, 3).map(x => x.join('px ')).join(', ') + ' (' + r.length + ' targets, ' + r.filter(x => x[0] < 40).length + ' under 40px)'); };
  const over = tag => { const d = document.documentElement; log.push(tag + ' scroll ' + d.scrollWidth + 'x' + d.scrollHeight + ' vs ' + innerWidth + 'x' + innerHeight); };
  await __shot('main'); taps('main'); over('main');
  if (!document.getElementById('tut-ask').hidden) { c('tut-no'); await __shot('main2'); taps('main2'); }
  c('go-quick'); await __shot('quick'); taps('quick'); c('quick-back');
  c('go-fighter'); __step(30, 1 / 60); await __shot('creator'); taps('creator'); c('cr-done');
  c('go-shop'); __step(30, 1 / 60); await __shot('shop'); taps('shop'); c('shop-back');
  c('go-set'); await __shot('settings'); taps('settings'); c('set-back');
  c('go-quick'); c('go');
  let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
  __tick(200, 1 / 60);
  for (let i = 0; i < 6; i++) { g.press('punch', ['jab', 'cross', 'hookL'][i % 3]); __tick(25, 1 / 60); }
  await __shot('fight'); taps('fight');
  c('pause-btn'); __tick(2, 1 / 60); await __shot('pause'); taps('pause'); log.push('paused=' + G.paused);
  c('p-resume'); __tick(5, 1 / 60);
  for (let i = 0; i < 60 && G.state !== 'fight'; i++) __tick(15, 1 / 60);   // a knockdown / clinch from the punches above: wait for the fight to resume (KO only from 'fight')
  if (G.state === 'fight') { P2.lastContact = P2.headNow.clone(); g.knockout(P1, P2, new V3(1, 0.2, 0).normalize(), 1.3, 'hookR', 1, true, false); }
  __tick(120, 1 / 60); await __shot('ko');
  n = 0; while (n++ < 120 && document.getElementById('result').hidden) { try { g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
  await __shot('result'); taps('result'); log.push('end ' + G.state + ' n=' + n);
  return log.join(' | ');
})()
