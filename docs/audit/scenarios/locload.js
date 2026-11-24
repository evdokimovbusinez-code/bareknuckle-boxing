/* audit scenario (R-24): a cold place is prepared in steps under «Готовим площадку…» — the bar a few frames in, then the
   __perf.locReport() table (total CPU time of a cold entry, the longest loading frame, programs left for the first frame) on
   low and high. Run:
   bash tools/shot.sh /tmp/shots/load.jpg js "return await eval(await (await fetch('docs/audit/scenarios/locload.js')).text())"
   → load-bar.jpg (the loading screen). window.__levels = ['low'] limits the levels. Times are SwiftShader (software GL) times. */
(async () => {
  const g = __g, G = g.G, out = [];
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  // the loading screen: a quick fight in a place that is not built yet, a few frames in
  __loc.dispose(__loc.LOCS.tires); G.loc = 'tires'; G.mode = 'quick'; g.startFight(true);
  __tick(8, 1 / 60);
  const scr = document.getElementById('loc-load');
  out.push(`screen ${scr.hidden ? 'hidden' : 'shown'}, bar ${document.getElementById('ll-bar').style.width}, state ${G.state}`);
  await __shot('bar');
  let n = 0; while (!scr.hidden && n++ < 600) __tick(1, 1 / 60);
  out.push(`ready after ${n} more frames, the intro runs: introT ${G.introT.toFixed(2)}`);
  for (const lv of window.__levels || ['low', 'high']) { g.applyGfx(lv); out.push(__perf.locReport().table); }
  return '\n' + out.join('\n');
})()
