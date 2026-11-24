/* audit scenario: heavy bag, sparring, tutorial, pause + settings, story chapter «Бар», career card. Run:
   bash tools/shot.sh /tmp/shots/mode.jpg js "return await eval(await (await fetch('docs/audit/scenarios/modes.js')).text())" [WxH touch] */
(async () => {
  const c = id => { const e = document.getElementById(id); if (e) e.click(); return !!e; };
  const key = (k, code) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: code || k, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code: code || k, bubbles: true })); };
  const g = __g, G = g.G, log = [];
  const toFight = () => { let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); } return n; };
  const st = t => log.push(t + ': ' + G.state + '/' + G.mode);
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  // heavy bag
  c('go-train'); c('go-bag'); toFight(); __tick(60, 1 / 60);
  for (let i = 0; i < 8; i++) { g.press('punch', ['jab', 'cross', 'hookL', 'hookR'][i % 4]); __tick(22, 1 / 60); }
  await __shot('bag'); st('bag');
  // pause over the bag drill, settings from the pause
  const wait = ms => new Promise(r => setTimeout(r, ms));   // CSS transitions of the screens run in real time
  key('Escape'); __tick(2, 1 / 60); await wait(700); await __shot('pause'); st('pause paused=' + G.paused);
  c('p-set'); await wait(900); await __shot('pause-settings'); c('set-back'); await wait(300); c('p-quit'); __tick(5, 1 / 60); st('after quit');
  // sparring
  c('go-train'); c('go-spar'); toFight(); __tick(200, 1 / 60);
  for (let i = 0; i < 6; i++) { g.press('punch', ['jab', 'cross', 'hookL'][i % 3]); __tick(25, 1 / 60); }
  await __shot('spar'); st('spar');
  key('Escape'); __tick(2, 1 / 60); c('p-quit'); __tick(5, 1 / 60);
  // tutorial
  c('go-train'); c('go-tutorial'); __tick(120, 1 / 60); await __shot('tutorial'); st('tut ' + JSON.stringify(__tut.state()));
  __tut.end(); __tick(5, 1 / 60); if (G.state !== 'menu') { key('Escape'); c('p-quit'); __tick(5, 1 / 60); } st('after tut');
  // story: chapter list → dialog → bar fight → KO → outro
  log.push('story play: ' + __story.play(0)); __tick(240, 1 / 60); await wait(2500); __tick(60, 1 / 60); await __shot('story-dlg'); st('dlg');
  log.push('next: ' + __story.next(3)); __tick(60, 1 / 60); await wait(900); await __shot('story-dlg2');
  log.push('begin: ' + __story.begin(0)); toFight(); __tick(240, 1 / 60); await __shot('story-fight'); st('story fight');
  log.push('ko: ' + __story.ko(true)); let n = 0; while (n++ < 60 && document.getElementById('result').hidden && G.state !== 'menu') { if (__story.DLG.active) __story.next(1); __tick(30, 1 / 60); }
  await __shot('story-end'); st('story end');
  c('r-menu'); __tick(5, 1 / 60); st('menu?');
  // career: the opponent's card
  c('go-story'); c('go-ladder'); __tick(90, 1 / 60); await __shot('career-card'); st('career');
  toFight(); __tick(200, 1 / 60); await __shot('career-fight'); st('career fight loc=' + __loc.get().id);
  return log.join(' | ');
})()
