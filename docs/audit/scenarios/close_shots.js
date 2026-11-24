/* R-14 audit: close-ups of the two men at close quarters. A bot fight (pressure AI vs `turtle`, or window.__csPol) runs with nothing
   drawn until the wanted moment, is stopped there and shot from the side:
   · window.__csBreak = true — the first break of a clinch (10b_close.js): frames `brk0` (it starts), `brk1` (+0.15 s, the forearms
     push), `brk2` (+0.3 s), `brk3` (+0.7 s, apart);
   · otherwise — the first frame after 4 s with the heads closer than 0.38 m while somebody punches: frame `close`.
   window.__csLoc = 'bar' picks the place. Returns the overlap depth (__g.bodyOverlap.pen) and the distances of every frame. Run:
   bash tools/shot.sh /tmp/shots/c.jpg js "window.__csLoc = 'bar'; return await eval(await (await fetch('docs/audit/scenarios/close_shots.js')).text())" */
(async () => {
  const g = __g, G = g.G, B = g.bodyOverlap, loc = window.__csLoc || 'gym', brk = !!window.__csBreak, out = [];
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  const tk = window.__tick, STOP = new Error('close_shots: stop here'); let t = 0;
  const up = F => !F.ko && !F.gu && !F.slide && !F.rag.on;
  window.__tick = (n, dt) => { tk(n, dt); if (G.state !== 'fight' || !up(g.P1) || !up(g.P2)) return; t += n * dt;
    if (brk ? G.brk && G.brk.on : t > 4 && B.gap(g.P1, g.P2) < 0.38 && (g.P1.cur || g.P2.cur) && G.hitstop <= 0) throw STOP; };
  let seed = window.__csSeed || 3, hit = false;
  try { while (!hit && seed < 9) { t = 0; try { __bot.run(window.__csPol || 'turtle', 'normal', 1, { loc, dt: 1 / 60, stopAt: 110, seed: seed++, style: 'pressure' }); } catch (e) { if (e !== STOP) throw e; hit = true; } } }
  finally { window.__tick = tk; }
  if (!hit) return 'the moment did not come in ' + (seed - 3) + ' fights';
  const shot = async tag => {
    const mid = (g.P1.headNow.x + g.P2.headNow.x) / 2, r = B.pen(g.P1, g.P2);
    window.__camHold = { p: [mid, 1.5, 2.3], l: [mid, 1.32, 0] }; __tick(0, 0);
    out.push(`${tag}: overlap ${r.d.toFixed(3)} m${r.d > 0 ? ' (' + r.a + ' in ' + r.b + ')' : ''}, heads ${B.gap(g.P1, g.P2).toFixed(2)} m, roots ${Math.abs(g.P1.group.position.x - g.P2.group.position.x).toFixed(2)} m` + (G.brk && G.brk.on ? `, break t ${G.brk.t.toFixed(2)}` : ''));
    await __shot(tag);
  };
  if (!brk) await shot('close');
  else { g.P1.moveDir = 0; await shot('brk0'); __tick(9, 1 / 60); await shot('brk1'); __tick(9, 1 / 60); await shot('brk2'); __tick(24, 1 / 60); await shot('brk3'); }
  delete window.__camHold;
  return '\n' + loc + ' seed ' + (seed - 1) + ', t ' + t.toFixed(1) + ' s\n' + out.join('\n');
})()
