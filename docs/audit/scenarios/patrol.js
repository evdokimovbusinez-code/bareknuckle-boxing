/* R-18 check: story chapter 2 «Патруль» — dialog, the fight in the yard under the flashing light bar, the sergeant's baton,
   the rules (knock him down → win; stay up 60 s → win), the chapter list after it. Run:
   bash tools/shot.sh /tmp/shots/pat.jpg js "return await eval(await (await fetch('docs/audit/scenarios/patrol.js')).text())" [WxH touch]
   Frames: patrol-dlg (the sergeant speaks), patrol-dlg2 (the hero's line with the answers), patrol-fight (default camera),
   patrol-baton (close-up on the sergeant), patrol-end (result after the KO), patrol-list (the «История» list), patrol-held (result
   after 60 s on the feet). The log: the baton's reach (m past the knuckle), his baton punches (landed / mean damage), the states. */
(async () => {
  const c = id => { const e = document.getElementById(id); if (e) e.click(); return !!e; };
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, log = [], wait = ms => new Promise(r => setTimeout(r, ms));
  const toFight = () => { let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); } return n; };
  const toResult = () => { let n = 0; while (n++ < 80 && document.getElementById('result').hidden && G.state !== 'menu') { if (__story.DLG.active) __story.next(1); __tick(30, 1 / 60); } return n; };
  const st = t => log.push(t + ': ' + G.state + '/' + G.mode);
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  log.push('unlock: ' + __story.unlock(1));
  // the dialog
  log.push('play: ' + __story.play(1)); __tick(200, 1 / 60); await wait(1500);
  const to = who => { let n = 0; while (__story.DLG.active && n++ < 20) { const L = __story.DLG.lines[__story.DLG.i]; if (L && !L.card && L.who === who) return true; __story.next(1); } return false; };
  to('o'); __tick(60, 1 / 60); await wait(600); await __shot('patrol-dlg'); st('dlg');
  to('p'); __tick(60, 1 / 60); await wait(600); await __shot('patrol-dlg2');
  log.push('lines: ' + __story.DLG.lines.length);
  // the fight
  log.push('begin: ' + __story.begin(1)); toFight(); __tick(240, 1 / 60); st('fight');
  log.push('loc=' + __loc.get().id + ' baton=' + !!P2.gear.baton + ' p1baton=' + !!P1.gear.baton + ' style=' + g.AI.style.label);
  { const V = g.THREE.Vector3, a = P2.aimArm; P2.aimArm = 'L'; const k = P2.knuckle(new V()), m = new V().setFromMatrixPosition(P2.bones.CC_Base_L_Mid1.matrixWorld); P2.aimArm = a;
    log.push('reach +' + k.distanceTo(m).toFixed(3) + ' m'); }
  // catch the light bar at a blink of each colour (sim steps of 1/60 until the point light peaks)
  const S = __loc.get().siren, peak = red => { for (let i = 0; i < 120; i++) { __tick(1, 1 / 60); if (S.pl.intensity > 0.85 * 140 && (S.pl.color.r > S.pl.color.b) === red) return S.pl.intensity.toFixed(0); } return 'none'; };
  __tick(200, 1 / 60); log.push('red I=' + peak(true)); await __shot('patrol-fight'); log.push('blue I=' + peak(false)); await __shot('patrol-blue');
  window.__camHold = { p: [0.1, 1.55, 1.25], l: [0.45, 1.35, 0] }; __tick(2, 1 / 60); await __shot('patrol-baton'); delete window.__camHold;
  // rule «уронить»: his first knockdown ends it
  log.push('ko: ' + __story.ko(true)); toResult(); await __shot('patrol-end'); st('end');
  log.push('car: ' + document.getElementById('r-car').textContent + ' · done=' + __story.done);
  c('r-menu'); __tick(5, 1 / 60); c('go-story'); await wait(900); await __shot('patrol-list');
  log.push('list: ' + [...document.querySelectorAll('#st-list .stc')].map(e => e.className.replace('stc ', '')).join(','));
  c('st-back'); __tick(5, 1 / 60);
  // rule «продержись»: 60 s on the feet (P1 is kept alive and just stands there; the sergeant's baton punches are counted)
  log.push('again: ' + __story.begin(1)); toFight();
  window.__dmgLog = []; window.__noKD = true; let n = 0;
  while ((G.state === 'fight' || G.state === 'break') && n++ < 90) { P1.hp = Math.max(P1.hp, 60); for (const w of P1.flesh.wounds) w.sev = Math.min(w.sev, 0.5); __tick(60, 1 / 60); }   // (no doctor's stop either)
  delete window.__noKD;
  const bl = window.__dmgLog.filter(r => r[0] === 1 && ['jab', 'hookL', 'upperL'].includes(r[2]) && !r[5]), ot = window.__dmgLog.filter(r => r[0] === 1 && !['jab', 'hookL', 'upperL'].includes(r[2]) && !r[5]);
  log.push('held after ' + n + ' s, hold=' + __story.hold + ', state=' + G.state + ' · baton hits ' + bl.length + ' (mean ' + (bl.reduce((s, r) => s + r[1], 0) / Math.max(1, bl.length)).toFixed(1) + ') · rear hand ' + ot.length);
  delete window.__dmgLog;
  toResult(); await __shot('patrol-held'); st('held');
  log.push('sub: ' + document.getElementById('r-sub').textContent);
  c('r-menu'); __tick(5, 1 / 60); st('menu');
  log.push('menu: baton visible=' + !!(P2.gear.batonM && P2.gear.batonM.m.visible));
  return log.join(' | ');
})()
