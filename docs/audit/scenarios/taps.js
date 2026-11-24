/* R-07: every tap target under 44 CSS px on every menu screen, the fight HUD and the pause — no screenshots, just the list.
   Also: the bottom of the stick caption and of the main menu column. Run (phone sizes):
   bash tools/shot.sh /tmp/shots/taps.jpg js "return await eval(await (await fetch('docs/audit/scenarios/taps.js')).text())" 740x360 touch */
(async () => {
  const c = id => { const e = document.getElementById(id); if (e) e.click(); return !!e; };
  const g = __g, G = g.G, log = [];
  const taps = tag => {
    const r = [...document.querySelectorAll('button, .sw, [role=button], input, select')].filter(e => e.offsetParent !== null).map(e => { const b = e.getBoundingClientRect(); return [Math.round(Math.min(b.width, b.height)), (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + e.className) + '[' + (e.textContent || '').trim().slice(0, 10) + '] ' + Math.round(b.width) + 'x' + Math.round(b.height)]; }).filter(x => x[0] > 0);
    log.push(tag + ' (' + r.length + ' targets, ' + r.filter(x => x[0] < 44).length + ' under 44): ' + r.filter(x => x[0] < 44).map(x => x[1]).join(', '));
  };
  const low = (tag, sel) => { const e = document.querySelector(sel); if (e && e.offsetParent !== null) { const b = e.getBoundingClientRect(); log.push(tag + ' bottom ' + Math.round(b.bottom) + ' of ' + innerHeight); } };
  taps('main'); low('main #ladder', '#ladder'); low('main #rec-line', '#rec-line');
  if (!document.getElementById('tut-ask').hidden) { taps('tut-ask'); c('tut-no'); taps('main2'); }
  c('go-quick'); taps('quick'); c('quick-back');
  c('go-fighter'); __step(5, 1 / 60); taps('creator');
  for (const b of document.querySelectorAll('#cats button')) { b.click(); if (b.dataset.cat !== 'name') taps('creator/' + b.dataset.cat); }
  document.querySelector('#cats button').click(); c('cr-done');
  c('go-shop'); __step(5, 1 / 60); taps('shop'); c('shop-back');
  c('go-set'); taps('settings'); c('set-back');
  c('go-train'); taps('train'); c('train-back');
  c('go-social'); taps('social'); c('so-back');
  c('go-story'); taps('story'); c('st-back');
  c('go-net'); taps('net'); c('net-back');
  c('go-quick'); c('go');
  let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
  __tick(30, 1 / 60); taps('fight'); low('stick caption', '.stick .sl');
  c('pause-btn'); __tick(2, 1 / 60); taps('pause'); c('p-set'); taps('pause-settings');
  return log.join(' | ');
})()
