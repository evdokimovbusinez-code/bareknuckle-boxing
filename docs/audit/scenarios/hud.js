/* R-06 audit scenario: the HUD clock over four places + the heavy bag panel. Run:
   bash tools/shot.sh /tmp/shots/hud.jpg js "return await eval(await (await fetch('docs/audit/scenarios/hud.js')).text())" [740x360 touch]
   For every place (metro, boxgym = sparring, yard, gym) a fight is started, run 2 s, one frame rendered (__step) and the WebGL canvas
   read back in the same task. The pixels under the clock text (#tmr box) are composited with what the HUD lays over them — the
   band .hud::before (its linear-gradient is parsed from the computed style) and the clock's plate (#diffl background) — and the
   WCAG contrast of the text colour against each pixel is averaged («mean»; «ofMean» = against the mean luminance, «p10» = 10th
   percentile). The vignette is left out (it only darkens, so the numbers are a lower bound). «before» = the old pill: 10 px muted
   #968f80 straight on the canvas. Also: the clock / bag panel must not overlap the pause / full-screen buttons (touch).
   Frames: hud-metro, hud-boxgym (= mode-spar), hud-yard, hud-gym (= fight / ph-fight), hud-bag (= mode-bag). */
(async () => {
  const g = __g, G = g.G, log = [], res = {};
  const c = id => { const e = document.getElementById(id); if (e) e.click(); return !!e; };
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  const toFight = () => { let n = 0; while (G.state !== 'fight' && n++ < 300) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(20, 1 / 60); } return n; };
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (r, gg, b) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  const rgba = s => { const m = s.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]; };
  const cr = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const hit = (a, b) => { const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); return x > 0 && y > 0 ? Math.round(x * y) : 0; };
  function overlap() {
    const out = {}; const pz = ['pause-btn', 'fs-btn'].map(id => document.getElementById(id)).filter(e => e && e.offsetParent !== null);
    for (const id of ['diffl', 'bagp', 'tmr']) { const e = document.getElementById(id); if (!e || e.offsetParent === null) continue;
      out[id] = pz.reduce((s, p) => s + hit(e.getBoundingClientRect(), p.getBoundingClientRect()), 0); }
    return out;
  }
  function contrast() {
    window.__step(1, 1 / 60);   // render one frame; the drawing buffer is still there in this task
    const cv = g.renderer.domElement, el = document.getElementById('tmr'), hud = document.getElementById('hud');
    const R = el.getBoundingClientRect(), C = cv.getBoundingClientRect(), H = hud.getBoundingClientRect();
    const sx = cv.width / C.width, sy = cv.height / C.height;
    const x0 = Math.round((R.left - C.left) * sx), y0 = Math.round((R.top - C.top) * sy), w = Math.max(1, Math.round(R.width * sx)), h = Math.max(1, Math.round(R.height * sy));
    const t = document.createElement('canvas'); t.width = w; t.height = h; const x = t.getContext('2d'); x.drawImage(cv, x0, y0, w, h, 0, 0, w, h);
    const px = x.getImageData(0, 0, w, h).data;
    // what the HUD lays over the canvas: the band (::before, stops in px from the top of #hud) and the clock's plate
    const bg = getComputedStyle(hud, '::before').backgroundImage, stops = [...bg.matchAll(/rgba?\(([^)]+)\)\s*([\d.]+)px/g)].map(m => [parseFloat(m[2]), rgba('(' + m[1] + ')')]);
    const bandA = y => { if (!stops.length) return [0, 0, 0, 0]; if (y <= stops[0][0]) return stops[0][1]; for (let i = 1; i < stops.length; i++) if (y <= stops[i][0]) {
      const [ya, ca] = stops[i - 1], [yb, cb] = stops[i], k = (y - ya) / (yb - ya || 1); return ca.map((v, j) => v + (cb[j] - v) * k); } return stops[stops.length - 1][1]; };
    const plate = rgba(getComputedStyle(document.getElementById('diffl')).backgroundColor), tc = rgba(getComputedStyle(el).color);
    const Lt = lum(tc[0], tc[1], tc[2]), Lold = lum(0x96, 0x8f, 0x80);
    const cs = [], ls = [], old = [];
    for (let j = 0; j < h; j++) { const yc = R.top + (j + 0.5) / sy - H.top, b = bandA(yc);
      for (let i = 0; i < w; i++) { const o = (j * w + i) * 4; let r = px[o], gg = px[o + 1], bb = px[o + 2];
        old.push(cr(Lold, lum(r, gg, bb)));
        r = r * (1 - b[3]) + b[0] * b[3]; gg = gg * (1 - b[3]) + b[1] * b[3]; bb = bb * (1 - b[3]) + b[2] * b[3];
        r = r * (1 - plate[3]) + plate[0] * plate[3]; gg = gg * (1 - plate[3]) + plate[1] * plate[3]; bb = bb * (1 - plate[3]) + plate[2] * plate[3];
        const L = lum(r, gg, bb); ls.push(L); cs.push(cr(Lt, L)); } }
    const mean = a => a.reduce((s, v) => s + v, 0) / a.length, sorted = [...cs].sort((a, b) => a - b);
    return { mean: +mean(cs).toFixed(2), ofMean: +cr(Lt, mean(ls)).toFixed(2), p10: +sorted[Math.floor(sorted.length * 0.1)].toFixed(2), before: +mean(old).toFixed(2),
      px: w + 'x' + h, font: getComputedStyle(el).fontSize + ' ' + getComputedStyle(el).fontWeight, text: document.getElementById('diffl').textContent };
  }
  for (const loc of ['metro', 'boxgym', 'yard', 'gym']) {
    if (loc === 'boxgym') G.mode = 'spar'; else { G.loc = loc; G.mode = 'quick'; }
    g.startFight(); const n = toFight(); __tick(120, 1 / 60);
    const r = contrast(); r.loc = __loc.get().id; r.state = G.state; r.ov = overlap(); r.n = n; res[loc] = r;
    await __shot(loc); log.push(loc + ' ' + JSON.stringify(r));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); __tick(2, 1 / 60); c('p-quit'); __tick(5, 1 / 60);
  }
  // the heavy bag: no health bars / VS; score, combo, time
  G.mode = 'bag'; g.startFight(); toFight(); __tick(60, 1 / 60);
  for (let i = 0; i < 6; i++) { g.press('punch', ['jab', 'cross', 'hookL'][i % 3]); __tick(16, 1 / 60); }
  const vis = id => { const e = document.getElementById(id); return !!e && e.offsetParent !== null && getComputedStyle(e).display !== 'none'; };
  const bag = { hp1: vis('hpb1'), hp2: vis('hpb2'), vs: vis('diffl') || getComputedStyle(document.querySelector('#mid .vsl')).display !== 'none', panel: vis('bagp'),
    score: document.getElementById('bag-sc').textContent, combo: document.getElementById('bag-cb').textContent, best: document.getElementById('bag-best').textContent,
    time: document.getElementById('bag-t').textContent, scoreFont: getComputedStyle(document.getElementById('bag-sc')).fontSize, ov: overlap(), BAG: g.BAG.score + '/' + g.BAG.best };
  await __shot('bag'); log.push('bag ' + JSON.stringify(bag));
  const ok = Object.values(res).every(r => r.mean >= 4.5) && Object.values(res).concat([bag]).every(r => !Object.values(r.ov).some(v => v > 0)) && !bag.hp1 && !bag.hp2 && !bag.vs && bag.panel;
  log.push('R06 ' + (ok ? 'PASS' : 'FAIL'));
  return log.join('\n');
})()
