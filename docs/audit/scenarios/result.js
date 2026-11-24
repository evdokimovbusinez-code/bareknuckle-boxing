/* R-09 acceptance: the result card. Three ways in — a knockout win (after the replay), a loss on the cards, the heavy bag — and on a
   short / touch stage also the card with «Подробнее» open. On every screen, from getBoundingClientRect of the text itself (Range
   rects of every visible text node on the stage, opacity / visibility / display of all ancestors counted): no two texts of different
   elements overlap; every text of #result ≥ 13 px (desktop) / ≥ 12 px (short or touch stage); the three buttons ≥ 44 px tall;
   #msg, the get-up bar and the HUD are hidden; the men's heads (projected) sit left of the card. Frames: result-ko, -dec, -bag, -more. Run:
   bash tools/shot.sh /tmp/shots/res.jpg js "return await eval(await (await fetch('docs/audit/scenarios/result.js')).text())" [740x360 touch] */
(async () => {
  const c = id => document.getElementById(id).click(), $ = id => document.getElementById(id);
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, V3 = g.THREE.Vector3, log = [], fails = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (!$('tut-ask').hidden) c('tut-no');
  const toFight = () => { let n = 0; while (G.state !== 'fight' && n++ < 60) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); } return G.state === 'fight'; };
  const stage = $('stage'), cmp = stage.classList.contains('short') || stage.classList.contains('touch'), minF = cmp ? 12 : 13;
  const seen = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { if (e.hidden) return false; const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; } return true; };
  function check(tag) {
    const T = [], w = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      if (!n.textContent.trim() || !seen(n.parentElement)) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const q of r.getClientRects()) if (q.width > 1 && q.height > 1) T.push({ el: n.parentElement, q, t: n.textContent.trim().slice(0, 24) });
    }
    let ov = 0;
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
      const a = T[i], b = T[j]; if (a.el === b.el) continue;
      const x = Math.min(a.q.right, b.q.right) - Math.max(a.q.left, b.q.left), y = Math.min(a.q.bottom, b.q.bottom) - Math.max(a.q.top, b.q.top);
      if (x > 1 && y > 1) { ov++; fails.push(`${tag}: «${a.t}» × «${b.t}» ${x.toFixed(0)}×${y.toFixed(0)}`); }
    }
    let fmin = 99, small = [];
    for (const t of T) if ($('result').contains(t.el)) { const f = parseFloat(getComputedStyle(t.el).fontSize); fmin = Math.min(fmin, f); if (f < minF) small.push(t.t + ' ' + f); }
    if (small.length) fails.push(`${tag}: font < ${minF}: ${small.slice(0, 4).join(', ')}`);
    const bh = ['r-again', 'r-replay', 'r-menu'].filter(id => seen($(id))).map(id => $(id).offsetHeight);
    if (bh.some(h => h < 44)) fails.push(`${tag}: button ${bh.join('/')} px`);
    for (const id of ['msg', 'kdbar', 'hud']) if (seen($(id)) && $(id).textContent.trim()) fails.push(`${tag}: #${id} visible`);
    // the men's heads left of the card (in stage pixels: the projection already has the card's skew)
    const card = $('r-card'), cl = card.offsetLeft, cam = g.camera, VW = stage.clientWidth;
    const hx = [P1, P2].filter(F => F.group.visible).map(F => (F.headNow.clone().project(cam).x + 1) / 2 * VW);
    const left = hx.every(x => x < cl);
    if (!left && tag !== 'more') fails.push(`${tag}: a head at x=${hx.map(x => x.toFixed(0)).join('/')} ≥ card ${cl}`);
    log.push(`${tag}: texts ${T.length}, overlaps ${ov}, min font ${fmin}px, buttons ${bh.join('/')} px, heads x ${hx.map(x => x.toFixed(0)).join('/')} | card ${cl}–${cl + card.offsetWidth}, big «${[...card.querySelectorAll('.rn b')].map(b => b.textContent).join(' · ')}»`);
  }
  const settle = async () => { __tick(40, 1 / 60); await wait(1700); __tick(60, 1 / 60); };
  // 1) knockout win → replay → result
  c('go-quick'); c('go');
  if (!toFight()) log.push('no fight ' + G.state);
  __tick(120, 1 / 60); for (let i = 0; i < 8; i++) { try { g.press('punch', ['jab', 'cross', 'hookL', 'hookR'][i % 4]); } catch (e) {} __tick(25, 1 / 60); }
  P2.lastContact = P2.headNow.clone(); g.knockout(P1, P2, new V3(1, 0.2, 0).normalize(), 1.3, 'hookR', 1, true, false);
  let n = 0; while (n++ < 120 && $('result').hidden) { try { g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
  await settle(); check('ko'); await __shot('ko');
  if (cmp) { c('r-more'); __tick(5, 1 / 60); await wait(300); check('more'); await __shot('more'); c('r-more'); }
  // 2) a loss on the cards
  c('r-again'); if (!toFight()) log.push('no rematch ' + G.state);
  __tick(120, 1 / 60); __res.decision([[9, 10], [9, 10]]);
  await settle(); check('dec'); await __shot('dec');
  // 3) the heavy bag
  c('r-menu'); __tick(10, 1 / 60); c('go-train'); __tick(10, 1 / 60);
  const bagBtn = $('go-bag'); if (bagBtn) { bagBtn.click(); n = 0; while (G.state !== 'fight' && n++ < 60) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
    __tick(60, 1 / 60); n = 0; while ($('result').hidden && n++ < 120) { try { g.press('punch', 'jab'); } catch (e) {} __tick(30, 1 / 60); }
    await settle(); check('bag'); await __shot('bag'); } else log.push('no #go-bag');
  log.push(fails.length ? 'FAIL ' + fails.length + ': ' + fails.slice(0, 12).join(' ; ') : 'OK');
  return log.join('\n');
})()
