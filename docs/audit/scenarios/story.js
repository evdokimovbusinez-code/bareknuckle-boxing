/* R-17 check: story chapter «Бар» — dialog camera framing (head box on screen, margins), the hero's street clothes, the HUD clock,
   the player's look after the chapter. Run:
   bash tools/shot.sh /tmp/shots/story.jpg js "return await eval(await (await fetch('docs/audit/scenarios/story.js')).text())"
   Frames: story-dlg-p (the hero speaks), story-dlg-o (the opponent), story-dlg2 (the hero's line with the answers), story-fight,
   story-menu (back in the menu). The log: head box per dialog frame in % of the frame (top / bottom / left / right margins). */
(async () => {
  const c = id => { const e = document.getElementById(id); if (e) e.click(); return !!e; };
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, cam = g.camera, log = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  const lookOf = F => JSON.stringify(F.gear.look);
  const saved = () => { try { return JSON.stringify(JSON.parse(localStorage.getItem('ko-ring')).look); } catch (e) { return 'none'; } };
  const LOOK0 = saved(), P1L0 = lookOf(P1);   // P1.gear.look is LOOK itself in the menu (applyLook(LOOK) at boot)
  // the head on screen: skinned body vertices weighted mostly to the head bone (+ its children: jaw, eyes) → NDC box; hair adds above
  const headBox = F => {
    const m = F.body, sk = m.skeleton, head = F.head, ids = new Set();
    sk.bones.forEach((b, i) => { let o = b; while (o) { if (o === head) { ids.add(i); break; } o = o.parent; } });
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight, n = si.count, v = new g.THREE.Vector3();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    m.updateMatrixWorld(true); cam.updateMatrixWorld(true);
    for (let i = 0; i < n; i += 3) {
      let w = 0; for (let k = 0; k < 4; k++) if (ids.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
      if (w < 0.6) continue;
      m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); v.project(cam);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    }
    const pc = a => Math.round(a * 1000) / 10;   // NDC → % margins
    return { top: pc((1 - y1) / 2), bottom: pc((1 + y0) / 2), left: pc((1 + x0) / 2), right: pc((1 - x1) / 2) };
  };
  const dlgTop = () => { const r = document.getElementById('dlg').getBoundingClientRect(); return Math.round(r.top / innerHeight * 1000) / 10; };
  log.push('story play: ' + __story.play(0)); __tick(200, 1 / 60); await wait(1500);
  // walk the intro to the first hero line, then the first opponent line
  const to = who => { let n = 0; while (__story.DLG.active && n++ < 20) { const L = __story.DLG.lines[__story.DLG.i]; if (L && !L.card && L.who === who) return true; __story.next(1); } return false; };
  to('p'); __tick(90, 1 / 60); await wait(600); log.push('dlg-p head % ' + JSON.stringify(headBox(P1)) + ' box top ' + dlgTop() + '%'); await __shot('story-dlg-p');
  to('o'); __tick(90, 1 / 60); await wait(600); log.push('dlg-o head % ' + JSON.stringify(headBox(P2)) + ' box top ' + dlgTop() + '%'); await __shot('story-dlg-o');
  to('p'); __tick(90, 1 / 60); await wait(600); log.push('dlg2 head % ' + JSON.stringify(headBox(P1)) + ' box top ' + dlgTop() + '%'); await __shot('story-dlg2');
  log.push('begin: ' + __story.begin(0));
  let n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
  __tick(600, 1 / 60); await __shot('story-fight');
  const W = P1.gear.look || {};
  log.push('fight: hero top=' + JSON.stringify(W.top) + ' bottom=' + JSON.stringify(W.bottom) + ' shoes=' + JSON.stringify(W.shoes) + ' hud=' + document.getElementById('diffl').textContent);
  log.push('ko: ' + __story.ko(true)); n = 0; while (n++ < 60 && document.getElementById('result').hidden && G.state !== 'menu') { if (__story.DLG.active) __story.next(1); __tick(30, 1 / 60); }
  c('r-menu'); __tick(30, 1 / 60); await wait(800); await __shot('story-menu');
  log.push('after: state=' + G.state + ' saved LOOK same=' + (saved() === LOOK0 || (LOOK0 === 'none' && saved() === P1L0)) + ' (save ' + (LOOK0 === 'none' ? 'was empty' : 'existed') + ')' + ' P1 look same=' + (lookOf(P1) === P1L0) + ' storyLook=' + P1.storyLook);
  return log.join(' | ');
})()
