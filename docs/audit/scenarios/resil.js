/* R-26 scenario: the game survives the tab going away, a lost WebGL context and an error inside frame(). Run:
   bash tools/shot.sh /tmp/shots/resil.jpg js "return await eval(await (await fetch('docs/audit/scenarios/resil.js')).text())" [WxH touch]
   (part of the smoke set: tools/test/smoke.py). Throws on a failed check; the artificial error carries «R-26 test» (smoke.py lets it through). */
(async () => {
  const $ = id => document.getElementById(id), c = id => $(id).click(), wait = ms => new Promise(r => setTimeout(r, ms));
  const g = __g, G = g.G, log = [], vis = el => !!el && !el.hidden && el.offsetParent !== null;
  const fail = m => { throw new Error('R-26: ' + m + ' | ' + log.join(' | ')); };
  const toFight = () => { let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); } };
  if (!$('tut-ask').hidden) c('tut-no');
  c('go-quick'); c('go'); toFight(); __tick(120, 1 / 60);
  if (G.state !== 'fight') fail('no fight: ' + G.state);

  // 1. the tab is hidden in a fight → pause, the round clock stands; shown again → still paused until «Продолжить»
  const hide = h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
    document.dispatchEvent(new Event('visibilitychange')); };
  const t0 = G.roundT; hide(true); __tick(120, 1 / 60); const t1 = G.roundT;
  log.push(`hidden: paused=${G.paused} roundT ${t0.toFixed(2)}→${t1.toFixed(2)}`);
  if (G.paused !== true) fail('visibilitychange did not pause');
  if (t1 !== t0) fail('the round clock ran in the pause');
  hide(false); delete document.hidden; delete document.visibilityState;
  await wait(700); await __shot('hidden');
  log.push('pause screen: ' + vis($('pause')));
  c('p-resume'); __tick(60, 1 / 60);
  log.push(`resumed: paused=${G.paused} roundT=${G.roundT.toFixed(2)}`);
  if (G.paused || !(G.roundT < t1)) fail('did not resume');

  // 2. the WebGL context lost → overlay, the game stands; restored → the fight goes on, drawn
  const R = g.renderer, t2 = G.roundT;
  R.forceContextLoss();
  for (let i = 0; i < 40 && $('gl-lost').hidden; i++) await wait(50);
  __tick(60, 1 / 60);
  log.push(`lost: overlay=${vis($('gl-lost'))} ctxLost=${R.getContext().isContextLost()} roundT ${t2.toFixed(2)}→${G.roundT.toFixed(2)}`);
  if (!vis($('gl-lost'))) fail('no overlay on context loss');
  if (G.roundT !== t2) fail('the fight ran with no context');
  await __shot('ctx-lost');
  R.forceContextRestore();
  for (let i = 0; i < 60 && !$('gl-lost').hidden; i++) await wait(50);
  __tick(120, 1 / 60);
  log.push(`restored: overlay=${vis($('gl-lost'))} ctxLost=${R.getContext().isContextLost()} state=${G.state} roundT=${G.roundT.toFixed(2)}`);
  if (vis($('gl-lost'))) fail('the overlay stayed after the restore');
  if (G.state !== 'fight' || !(G.roundT < t2)) fail('the fight did not go on after the restore');
  for (let i = 0; i < 6; i++) { g.press('punch', ['jab', 'cross', 'hookL'][i % 3]); __tick(25, 1 / 60); }
  await __shot('ctx-back');

  // 3. an error inside frame() → the toast with «Перезагрузить»; the game goes on
  const P1 = g.P1;
  P1.update = function () { delete P1.update; throw new Error('R-26 test: an error inside frame()'); };
  setTimeout(() => __tick(1, 1 / 60), 0); await wait(200);
  // the game clock (G.real), not the round clock: the punches above may have put a man down (kd: the round clock stands)
  const t3 = G.real; __tick(60, 1 / 60);
  log.push(`error: toast=${vis($('err-toast'))} text=«${$('err-msg').textContent}» errs=${window.__errs.length} state=${G.state} G.real ${t3.toFixed(2)}→${G.real.toFixed(2)}`);
  if (!vis($('err-toast'))) fail('no toast after an error in frame()');
  if (!(G.real > t3 + 0.9)) fail('the game stopped after the error');
  await __shot('err-toast');
  c('err-x'); log.push('toast closed: ' + !vis($('err-toast')));
  return log.join(' | ');
})()
