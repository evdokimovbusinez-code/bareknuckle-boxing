/* audit scenario: every menu screen. Run:
   bash tools/shot.sh /tmp/shots/menu.jpg js "return await eval(await (await fetch('docs/audit/scenarios/menu.js')).text())" [WxH touch] */
(async () => {
  const c = id => document.getElementById(id).click();
  const vis = () => [...document.querySelectorAll('#menu,#quick,#creator,#shop,#social,#story,#settings,#net,#pause,#tut-ask,#result,#tut,#credits')].filter(e => !e.hidden && e.offsetParent !== null).map(e => e.id).join(',');
  const log = [], wait = ms => new Promise(r => setTimeout(r, ms));   // the screens slide in with a CSS transition (real time)
  const shot = async t => { await wait(700); await __shot(t); log.push(t + ':' + vis()); };
  await shot('main');
  if (!document.getElementById('tut-ask').hidden) { c('tut-no'); await shot('main2'); }
  c('go-quick'); await shot('quick'); c('quick-back');
  c('go-fighter'); __step(30, 1 / 60); await shot('creator'); c('cr-done');
  c('go-shop'); __step(30, 1 / 60); await shot('shop'); c('shop-back');
  c('go-social'); await shot('social'); c('so-back');
  c('go-story'); await shot('story'); c('st-back');
  c('go-set'); await shot('settings'); c('set-back');
  c('go-train'); await shot('train'); c('train-back');
  c('go-net'); await shot('net'); c('net-back');
  return log.join(' | ');
})()
