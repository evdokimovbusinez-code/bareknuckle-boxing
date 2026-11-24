/* ───────── wardrobe ×3 (issue 84): more cuts, a pattern for any cloth, sort and «новое» ─────────
   Everything here reuses the generators of 04f_tops.js (topGeo / topTex), 04d_street.js (pantsGeo / pantsTex / shoeGeo / shoeTex) and
   04e_wardrobe.js (hatGeo / hatTex): a new cut is a row of parameters, its look is a `deco` painter called from those textures.
   · tops: polo, raglan long sleeve, open flannel shirt over a tee (btn: buttons, not a zip), track jacket, bomber, windbreaker with a hood,
     puffer vest (quilt: baffles bulge out of the torso rows) over a long sleeve, mesh tee, pullover hood (pocket / cords: 0), football jersey (num);
   · bottoms: track pants, long cargo, ripped jeans (rip), bermudas, cycling shorts (tight: the clearance is scaled down), boxing tights with a belt;
   · shoes: high tops, combat boots, low canvas shoes, slides over socks, tall boxing boots;
   · head: balaclava (the eye slit is cut by alpha: HATS.hole), bucket hat (brim), headband (vmax: only a band of the crown), flat-peak cap,
     a bandana folded into a band; more gum shield colours;
   · patterns (WPAT): solid, stripe, check, camo, tie-dye, brand monogram — `pat` of a look entry ({ id, color, pat }), or an item's default
     (model.pat); painted by patPaint into the item's own canvas (key = item + colour + pattern, see itemVar);
   · the shop and the creator sort their lists (WSORT: as listed / new first / cheapest first); `v: 3` marks the items of this update. */
const FAB_GLOSS = { nylon: [0.42, 0.55, 0.2], puffer: [0.36, 0.5, 0.35], tricot: [0.5, 0.65, 0.1], poly: [0.62, 0.5, 0], pique: [0.94, 0.3, 0], flannel: [0.97, 0.5, 0] };   // [roughness, sheen, clear coat]
const WPAT = [{ id: 'solid', label: 'однотон' }, { id: 'stripe', label: 'полоска' }, { id: 'check', label: 'клетка' }, { id: 'camo', label: 'камуфляж' }, { id: 'tiedye', label: 'тай-дай' }, { id: 'logo', label: 'лого' }];
const WSORT = [{ id: 'all', label: 'все' }, { id: 'new', label: 'новые' }, { id: 'cheap', label: 'дешёвые' }];
// which items take a pattern: cloth with a canvas of its own (not leather, not the hand-made / GLB tee, not the boxing trunks)
function wearPatOk(it) {
  if (!it || !it.model) return false; const m = it.model;
  if (it.cat === 'top') { const C = m.cut && TOP_CUTS[m.cut]; return !!C && !C.cloth && !C.hand && C.fab !== 'leather'; }
  return (it.cat === 'bottom' && !!m.cut) || (it.cat === 'head' && !!m.hat) || (it.cat === 'shoes' && !!m.top);
}
function wearPatRow(id, it, sel, set) {
  const el = $(id); if (!el) return; const ok = wearPatOk(it); el.parentElement.hidden = !ok; el.textContent = ''; if (!ok) return;
  swatches(id, WPAT, () => { const s = sel(); return s.color === 'camo' ? 'camo' : s.pat || it.model.pat || 'solid'; }, set, true);
}
const wearFresh = it => !!(PROF.seen && !PROF.seen[it.id] && it.price && (!it.reward || itemOwned(it.id)));   // «новое»: as the shop's (R-21)
function wearSort(a, sort, fresh) {
  const ix = new Map(a.map((it, i) => [it.id, i])), nw = it => (fresh ? fresh.has(it.id) : wearFresh(it)) ? 1 : 0;
  if (sort === 'new') return [...a].sort((x, y) => nw(y) - nw(x) || (y.v || 0) - (x.v || 0) || ix.get(x.id) - ix.get(y.id));
  if (sort === 'cheap') return [...a].sort((x, y) => (x.reward && !itemOwned(x.id) ? 1 : 0) - (y.reward && !itemOwned(y.id) ? 1 : 0) || x.price - y.price || ix.get(x.id) - ix.get(y.id));
  return a;
}

/* —— patterns: painted over the base colour, before the grain; s = scale (px per cm differ per canvas) —— */
function patPaint(v, g, w, h, s = 1) {
  const p = v.pat, c2 = v.c2 || wInk(v.c);
  if (p === 'camo') return camoPaint(g, w, h, s);
  if (p === 'stripe') { const P = 30 * s; g.fillStyle = c2; for (let y = 0; y < h; y += P) g.fillRect(0, y, w, P * 0.42); return; }
  if (p === 'check') {   // tartan: dark bands both ways (darker where they cross) + thin lines of the second colour
    const P = 84 * s; g.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 0; x < w; x += P) g.fillRect(x, 0, P * 0.42, h); for (let y = 0; y < h; y += P) g.fillRect(0, y, w, P * 0.42);
    g.fillStyle = c2; g.globalAlpha = 0.6; for (let x = P * 0.7; x < w; x += P) g.fillRect(x, 0, 2.5 * s, h); for (let y = P * 0.7; y < h; y += P) g.fillRect(0, y, w, 2.5 * s); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1; for (let x = -h; x < w; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); } return; }   // (the twill)
  if (p === 'tiedye') {   // spirals out of three knots, three hues about the colour, white where the dye did not get in
    const q = 4, cw = Math.ceil(w / q), ch = Math.ceil(h / q), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const x = cv.getContext('2d'), im = x.createImageData(cw, ch), d = im.data, o = new THREE.Color(v.c).getHSL({}), R = wRng(19);
    const pal = [0, 0.3, 0.62].map(dh => new THREE.Color().setHSL((o.h + dh) % 1, Math.max(0.6, o.s), clamp(o.l, 0.38, 0.55)));
    const K = [0, 1, 2].map(() => [R() * cw, R() * ch]), sc = 26 * s / q;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      let best = 1e9, a = 0; for (const [kx, ky] of K) { let dx = i - kx; dx -= Math.round(dx / cw) * cw; const dy = j - ky, r = Math.hypot(dx, dy); if (r < best) { best = r; a = Math.atan2(dy, dx); } }
      const t = a / 6.2832 * 3 + best / sc + 0.4 * Math.sin(best / sc * 2.3), k = ((Math.floor(t) % 3) + 3) % 3, f = t - Math.floor(t), c = pal[k], wh = sstep(0.82, 0.97, f) * 0.75, n = (i * 4 + j * cw * 4);
      d[n] = lerp(c.r * 255, 245, wh); d[n + 1] = lerp(c.g * 255, 243, wh); d[n + 2] = lerp(c.b * 255, 238, wh); d[n + 3] = 255; }
    x.putImageData(im, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(cv, 0, 0, w, h); return; }
  if (p === 'logo') { const b = v.brand || 'STRAY DOGS', P = 64 * s; g.globalAlpha = 0.32; for (let y = 0, r = 0; y < h + P; y += P, r++) for (let x = (r % 2) * P / 2; x < w + P; x += P) brandMark(g, b, x, y, P * 0.2, c2); g.globalAlpha = 1; }
}

/* —— tops —— */
Object.assign(TOP_CUTS, {
  polo: { hem: 92, cl: 1.2, fit: 0.94, neck: [7.4, 4.5, -1, 2], rib: 3.4, sl: 19, ease: [1.5, 2.0], fab: 'pique', deco: 'polo' },
  raglan: { ...TOP_CUTS.long, deco: 'raglan' },
  flannel: { hem: 95, cl: 1.7, fit: 1.0, neck: [9.2, 8.5, -1.5, 2], rib: 1.2, sl: 58, ease: [1.2, 0.8], cuff: 5, open: [6, 7.5], lap: 116, lapW: 5, fab: 'flannel', btn: 1, under: 'under', deco: 'flannel' },
  trackJ: { hem: 92, cl: 1.3, fit: 0.93, band: 5, neck: [8.2, 3.5, -1.5, 2], rib: 4.2, sl: 57, ease: [1.1, 0.7], cuff: 5, fab: 'tricot', deco: 'track' },
  bomber: { hem: 94, cl: 2.2, fit: 1.04, band: 7, neck: [8.8, 6.5, -0.5, 2], rib: 2.8, sl: 57.5, ease: [1.6, 1.2], cuff: 6, fab: 'nylon', deco: 'bomber' },
  wind: { hem: 90, cl: 2.4, fit: 1.06, neck: [9.6, 7.5, -1, 2], rib: 1.6, sl: 57, ease: [2.0, 1.4], cuff: 3, hood: 1, pocket: 0, fab: 'nylon', deco: 'wind' },
  puffer: { hem: 92, cl: 3.0, fit: 1.06, neck: [8.6, 4, -1.5, 2], rib: 3.2, sl: 0, arm: [26, 2.5, 146, 16, 19, 15], quilt: 8, fab: 'puffer', under: 'long', deco: 'puffer' },
  meshTee: { hem: 92, cl: 1.4, fit: 0.97, neck: [8.6, 7, -0.5, 2], rib: 1.8, sl: 17, ease: [1.6, 2.2], fab: 'mesh' },
  hoodPO: { hem: 86, cl: 1.8, fit: 1.04, band: 7, neck: [9.6, 7.5, -1, 2], rib: 2.4, sl: 58, ease: [1.5, 1.0], cuff: 7, hood: 1, pocket: 0, cords: 0, fab: 'fleece' },
  jersey: { hem: 91, cl: 1.6, fit: 1.0, neck: [8.2, 12, -0.5, 1.1], rib: 1.8, sl: 21, ease: [1.8, 2.4], fab: 'poly', deco: 'jersey' },
});
// colour map details of a cut (o: the painter's helpers of topTex; torso u 0.25 = front, 0.75 = back; sleeve x = XS(cm from the shoulder))
function topDeco(g, v, C, D, o) {
  const { X, Y, TV, XS, W, line, stitch, ySl, ySh, yR, y6 } = o, Z = z => Y(TV(z)), cmu = 1 / D.circ, k = C.deco, c2 = v.c2;
  const zip = (z0, z1, pull) => { line([[X(0.25), Z(z0)], [X(0.25), z1]], 'rgba(0,0,0,0.6)', 9); g.setLineDash([2.5, 2]); line([[X(0.25), Z(z0)], [X(0.25), z1]], '#b4b7bf', 3.6); g.setLineDash([]); if (pull) { g.fillStyle = '#c9ccd2'; g.fillRect(X(0.25) - 4, z1 + 2, 8, 16); } };
  const btn = (x, y, r = 5) => { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x, y + 1, r + 1, 0, 7); g.fill(); g.fillStyle = '#e8e4da'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 2, y - 1, 1.5, 1.5); g.fillRect(x + 1, y - 1, 1.5, 1.5); };
  const sleeveBand = (s0, s1, c) => { g.fillStyle = c; g.fillRect(XS(s0), ySl, XS(s1) - XS(s0), ySh - ySl); };
  if (k === 'polo') { const hw = 1.7 * cmu * W, yb = Z(D.zC - 8); g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(X(0.25) - hw, y6, 2 * hw, yb - y6); stitch([[X(0.25) - hw, y6], [X(0.25) - hw, yb], [X(0.25) + hw, yb], [X(0.25) + hw, y6]]); for (let i = 0; i < 3; i++) btn(X(0.25), lerp(yR + 14, yb - 10, i / 2), 4.5);
    sleeveBand(C.sl - 2.6, C.sl, 'rgba(0,0,0,0.12)'); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5; for (let y = ySl; y < ySh; y += 5) { g.beginPath(); g.moveTo(XS(C.sl - 2.6), y); g.lineTo(X(0.6), y); g.stroke(); } }
  if (k === 'raglan') { g.fillStyle = c2; g.fillRect(0, ySl, X(0.6), ySh - ySl);
    for (const u of [0, 0.5, 1]) { g.beginPath(); g.moveTo(X(u - 0.05), Z(D.zC - 5)); g.lineTo(X(u + 0.05), Z(D.zC - 5)); g.lineTo(X(u + 0.15), y6); g.lineTo(X(u - 0.15), y6); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, y6, W, yR - y6); }
  if (k === 'flannel') { for (const sg of [-1, 1]) { const u = 0.25 + sg * 0.085, hw = 6 * cmu, a = Z(D.zC - 22), b = Z(D.zC - 9); g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(X(u - hw), b, 2 * hw * W, a - b); stitch([[X(u - hw), b], [X(u - hw), a], [X(u + hw), a], [X(u + hw), b]]);
      line([[X(u - hw), b], [X(u + hw), b]], 'rgba(0,0,0,0.35)', 2); line([[X(u - hw), b + 22], [X(u + hw), b + 22]], 'rgba(0,0,0,0.3)', 2); btn(X(u), b + 16, 4); }
    sleeveBand(C.sl - C.cuff, C.sl, 'rgba(0,0,0,0.08)'); btn(XS(C.sl - 2.5), Y(0.88), 4); }
  if (k === 'track') { g.fillStyle = c2; g.fillRect(0, y6, W, yR - y6);
    for (const u of [0, 0.5, 1]) for (const d of [-0.014, 0.008]) g.fillRect(X(u + d), y6, 0.006 * W, Z(C.hem + C.band) - y6);   // stripes down the sides
    for (const v0 of [0.632, 0.65, 0.952, 0.97]) g.fillRect(0, Y(v0), XS(C.sl - C.cuff), 7);   // and along the top of the sleeves
    zip(C.hem, y6 - 2, 1); }
  if (k === 'bomber') { for (const [y0, y1] of [[Z(C.hem + C.band), Z(C.hem)], [y6, yR]]) for (const f of [0.3, 0.6]) { g.fillStyle = c2; g.fillRect(0, lerp(y0, y1, f) - 3, W, 6); }
    { const x0 = XS(9), x1 = XS(17), y0 = Y(0.95), y1 = Y(0.87); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0, y0, x1 - x0, y1 - y0); stitch([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]); line([[x0 + 6, y0 + 7], [x1 - 6, y0 + 7]], '#b4b7bf', 3); }   // the sleeve pocket
    zip(C.hem, y6 - 2, 1); }
  if (k === 'wind') { const a = Z(D.zC - 14), b = Z(D.zC + 0.5); g.fillStyle = c2; g.fillRect(0, b, W, a - b); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, a, W, 5); g.fillStyle = c2; g.fillRect(XS(12), ySl, XS(26) - XS(12), ySh - ySl);
    zip(D.zC - 18, y6 - 2, 1); }
  if (k === 'puffer') { for (let z = C.hem + C.quilt; z < D.zC + 8; z += C.quilt) { line([[0, Z(z)], [W, Z(z)]], 'rgba(0,0,0,0.42)', 3); stitch([[0, Z(z) - 4], [W, Z(z) - 4]]); }
    zip(C.hem, y6 - 2, 1); g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y6, W, yR - y6); }
  if (k === 'jersey') { g.fillStyle = c2; g.fillRect(0, y6, W, yR - y6); sleeveBand(C.sl - 5, C.sl - 3.2, c2); sleeveBand(C.sl - 2.4, C.sl - 1.2, c2);
    for (const u of [0.5 - 0.01, 0, 1 - 0.01]) g.fillRect(X(u), Z(D.zC - 2), 0.02 * W, Z(C.hem) - Z(D.zC - 2)); }
  if (v.num !== undefined) {   // the number: small on the chest, big on the back (outlined)
    for (const [u, z, hcm] of [[0.25 + 0.06, D.zC - 12, 9], [0.75, D.zC - 14, 24]]) { const px = hcm * cmu * W * 1.25; g.font = `900 ${px}px "Arial Black", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = px * 0.09; g.strokeStyle = wLum(c2) > 0.3 ? '#17181c' : '#ecebe6'; g.strokeText(String(v.num), X(u), Z(z)); g.fillStyle = c2; g.fillText(String(v.num), X(u), Z(z)); } }
}
// normal map details (zips, baffles, pockets)
function topDecoN(g, C, D, o) {
  const { X, Y, TV, XS, W, ridge, ySl, ySh, yR } = o, Z = z => Y(TV(z)), k = C.deco;
  if (k === 'track' || k === 'bomber' || k === 'puffer') ridge([[X(0.25), Z(C.hem)], [X(0.25), Y(0.6)]], 10, 0.3, 1);
  if (k === 'wind') ridge([[X(0.25), Z(D.zC - 18)], [X(0.25), Y(0.6)]], 10, 0.3, 1);
  if (k === 'puffer') for (let z = C.hem + C.quilt; z < D.zC + 8; z += C.quilt) ridge([[0, Z(z)], [W, Z(z)]], 14, 0.4, 1);
  if (k === 'flannel') for (const sg of [-1, 1]) { const u = 0.25 + sg * 0.085, hw = 6 / D.circ; ridge([[X(u - hw), Z(D.zC - 9)], [X(u - hw), Z(D.zC - 22)], [X(u + hw), Z(D.zC - 22)], [X(u + hw), Z(D.zC - 9)]], 4, 0.25, 1); }
  if (k === 'polo') ridge([[X(0.25), Y(0.6)], [X(0.25), Z(D.zC - 8)]], 6, 0.2, 1);
}

/* —— bottoms —— */
Object.assign(PANT_CUTS, {
  trackP: { hem: 6, skin: 11, elastic: 1, shiny: 1, deco: 'track', prof: [[5, 8.2], [30, 8.6], [49, 8.6], [66, 10], [84, 10.8]], sway: 0.9, fwd: 1, swayH: 26 },
  cargoL: { hem: 6, skin: 12, deco: 'cargoL', prof: [[5, 9.8], [30, 10], [49, 10], [66, 10.8], [84, 11.4]], sway: 1, fwd: 1.4, swayH: 24 },
  bermuda: { hem: 47, skin: 54, deco: 'bermuda', prof: [[43, 11.8], [66, 11.8], [84, 11.8]], sway: 1.1, fwd: 0, swayH: 14 },
  bike: { hem: 55, skin: 56.5, elastic: 1, shiny: 1, tight: 0.25, deco: 'bike', prof: [[55, 0], [84, 0]], sway: 0, fwd: 0, swayH: 4 },
  trico: { hem: 47, skin: 53, elastic: 1, shiny: 1, deco: 'trico', prof: [[47, 10.5], [66, 11.2], [84, 11.6]], sway: 0.8, fwd: 0, swayH: 12 },
});
function pantsDeco(g, b, C, o) {
  const { X, Y, box, line, stitch, top, crotch, W } = o, k = C.deco, c2 = b.c2;
  if (k === 'track') { box(0.455, top - 4.6, 0.475, C.hem, c2); box(0.525, top - 4.6, 0.545, C.hem, c2); box(0.49, top - 4.6, 0.51, C.hem, c2);
    line([[0.5, C.hem], [0.5, C.hem + 16]], 'rgba(0,0,0,0.6)', 6); g.setLineDash([2, 2]); line([[0.5, C.hem], [0.5, C.hem + 16]], '#b4b7bf', 2.4); g.setLineDash([]); }
  if (k === 'cargoL' || k === 'bermuda') {
    if (k === 'cargoL') { g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; for (let x = 0; x < W; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, o.H); g.stroke(); } }
    const a = k === 'cargoL' ? 48 : C.hem + 6, t2 = a + (k === 'cargoL' ? 19 : 14);   // the side pocket with its flap
    box(0.39, t2, 0.61, a, 'rgba(0,0,0,0.08)'); stitch([[0.39, t2], [0.61, t2], [0.61, a], [0.39, a], [0.39, t2]]); box(0.385, t2 + 0.6, 0.615, t2 - 5, 'rgba(0,0,0,0.14)'); stitch([[0.385, t2 - 5], [0.615, t2 - 5]]);
    line([[0.45, a], [0.45, t2 - 5]], 'rgba(0,0,0,0.3)', 2); line([[0.55, a], [0.55, t2 - 5]], 'rgba(0,0,0,0.3)', 2); g.fillStyle = '#1c1c1a'; g.beginPath(); g.arc(X(0.5), Y(t2 - 3), 3.5, 0, 7); g.fill();
    if (k === 'cargoL') { box(0, C.hem + 3, 1, C.hem, 'rgba(0,0,0,0.12)'); line([[0.47, C.hem + 3], [0.47, C.hem + 9]], 'rgba(0,0,0,0.4)', 2); }   // ankle tabs
    else { box(0, C.hem + 3.5, 1, C.hem, 'rgba(0,0,0,0.1)'); line([[0, C.hem + 3.5], [1, C.hem + 3.5]], 'rgba(0,0,0,0.45)', 2); stitch([[0, C.hem + 2.8], [1, C.hem + 2.8]]); } }   // the turn-up
  if (k === 'bike') { box(0.43, top - 4.6, 0.57, C.hem, c2); box(0.445, top - 4.6, 0.555, C.hem, b.c); box(0, C.hem + 2.5, 1, C.hem, c2);
    if (b.brand) { g.save(); g.translate(X(0.42), Y((C.hem + top) / 2 - 4)); g.rotate(-Math.PI / 2); brandLogo(g, b.brand, 0, 0, 22 * o.cm, c2, 'word'); g.restore(); } }
  if (k === 'trico') { box(0, top, 1, top - 9, c2); line([[0, top - 9], [1, top - 9]], 'rgba(0,0,0,0.45)', 2.5); stitch([[0, top - 1], [1, top - 1]]); stitch([[0, top - 8.3], [1, top - 8.3]]);
    if (b.brand) brandLogo(g, b.brand, X(0.32), Y(top - 4.5), 0.2 * W, wInk(c2), 'word');
    box(0.47, top - 9, 0.53, C.hem, c2); box(0, C.hem + 2.4, 1, C.hem, c2); }
  if (b.rip) {   // rips: the weft threads stay across the hole, a frayed edge round it
    for (const [u, h, ru, rh] of [[0.26, 50, 0.07, 3.2], [0.3, 63, 0.05, 2.0], [0.2, 72, 0.035, 1.3], [0.72, 46, 0.04, 1.6]]) {
      g.fillStyle = 'rgba(40,32,28,0.75)'; g.beginPath(); g.ellipse(X(u), Y(h), ru * W, rh * o.cm, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(238,236,228,0.9)'; g.lineWidth = 1.6; for (let y = -rh; y <= rh; y += 0.45) { const hw = ru * Math.sqrt(Math.max(0, 1 - (y / rh) ** 2)) * 1.05; g.beginPath(); g.moveTo(X(u - hw), Y(h + y)); g.quadraticCurveTo(X(u), Y(h + y + (rr() - 0.5) * 0.4), X(u + hw), Y(h + y)); g.stroke(); }
      g.strokeStyle = 'rgba(225,225,230,0.7)'; g.lineWidth = 1; for (let i = 0; i < 40; i++) { const a = rr() * 6.283, x = X(u) + Math.cos(a) * ru * W, y = Y(h) + Math.sin(a) * rh * o.cm; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rr() - 0.5) * 8, y + (rr() - 0.5) * 8); g.stroke(); } } }
}
function pantsDecoN(g, b, C, o) {
  const { ridge } = o;
  if (b.rip) for (const [u, h] of [[0.26, 50], [0.3, 63], [0.2, 72], [0.72, 46]]) { ridge([[u - 0.06, h], [u + 0.06, h]], 18, 0.12, 1); }
}

/* —— shoes: the upper half of the canvas is the foot (y 60…196 the upper, 128 = over the laces), the lower half the collar (top edge at y 256) —— */
function shoeDeco(g, f, W) {
  const k = f.deco, dk = 'rgba(0,0,0,0.35)';
  if (k === 'hi') {   // high tops: a padded collar, a panel, an ankle patch
    g.fillStyle = f.c2; g.fillRect(0, 256, W, 34); g.fillStyle = dk; g.fillRect(0, 289, W, 2);
    g.strokeStyle = f.c2; g.lineWidth = 12; g.lineCap = 'round'; for (const [y0, y1] of [[180, 150], [76, 106]]) { g.beginPath(); g.moveTo(120, y0); g.quadraticCurveTo(250, y1 + (y0 > y1 ? 8 : -8), 390, y1); g.stroke(); }
    for (const x of [0, W]) { g.fillStyle = '#f1eee6'; g.beginPath(); g.arc(x, 360, 28, 0, 7); g.fill(); g.fillStyle = f.c; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 8 : 19; g.lineTo(x + Math.cos(a) * r, 360 + Math.sin(a) * r); } g.fill(); } }
  if (k === 'boot') {   // combat boots: a lug sole, toe and heel caps, hooks up the shaft, a pull loop
    g.fillStyle = '#18181a'; g.fillRect(0, 0, W, 60); g.fillRect(0, 196, W, 60); g.fillStyle = '#2a2a2d'; for (let x = 0; x < W; x += 22) { g.fillRect(x, 18, 12, 26); g.fillRect(x + 6, 212, 12, 26); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(400, 60, 112, 136); g.fillRect(0, 60, 80, 136); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.setLineDash([4, 3]); g.lineWidth = 1.5; g.strokeRect(402, 62, 108, 132); g.strokeRect(2, 62, 76, 132); g.setLineDash([]);
    g.fillStyle = '#8d8f94'; for (let y = 272; y < 500; y += 28) for (const x of [104, 152]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(372, 256, 24, 40); }
  if (k === 'slide') {   // slides over socks: the sock everywhere above the sole, one wide strap across the instep
    const sock = f.sock || '#efeee9'; g.fillStyle = sock; g.fillRect(0, 60, W, 136); g.fillRect(0, 256, W, 256);
    g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 2; for (let x = 0; x < W; x += 6) { g.beginPath(); g.moveTo(x, 256); g.lineTo(x, 512); g.stroke(); }
    g.fillStyle = f.c; for (const y of [272, 292]) g.fillRect(0, y, W, 10);
    g.fillStyle = f.c; g.fillRect(180, 60, 170, 136); if (f.pat) { g.save(); g.beginPath(); g.rect(180, 60, 170, 136); g.clip(); patPaint(f, g, W, W, 0.8); g.restore(); } g.fillStyle = dk; g.fillRect(180, 60, 3, 136); g.fillRect(347, 60, 3, 136);
    if (f.brand) brandLogo(g, f.brand, 265, 128, 120, wInk(f.c), 'word');
    g.fillStyle = f.sole; g.fillRect(0, 0, W, 60); g.fillRect(0, 196, W, 60); }
  if (k === 'boxhi') {   // tall boxing boots: a side panel and a stripe up the shaft
    g.fillStyle = f.c2; g.fillRect(150, 256, 60, 256); g.fillRect(300, 256, 60, 256); g.fillStyle = dk; g.fillRect(0, 300, W, 2); g.fillRect(0, 420, W, 2); }
}

/* —— head —— */
Object.assign(HATS, {
  balaclava: { lo: () => -10.5, gap: 0.35, th: () => 0.3, deco: 1, hole: 1 },
  panama: { lo: a => 3.4 - 0.9 * gsm(60, 170, a), gap: 0.9, th: (a, v) => 0.3 + 0.5 * gsm(0.6, 1, v), brim: 5.5, deco: 1 },
  headband: { lo: a => 3.0 - 1.4 * gsm(40, 170, a), gap: 0.35, th: () => 0.6, vmax: 0.16, deco: 1 },
  bandB: { lo: a => 3.4 - 1.4 * gsm(40, 170, a), gap: 0.35, th: () => 0.15, vmax: 0.2, knot: 1, deco: 1 },
  capF: { ...HATS.cap, flat: 1 },
});
function hatDeco(g, v, W, H, Y, ink) {
  const k = v.hat;
  if (k === 'balaclava') {
    for (let x = 0; x < W; x += 5) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 2, H); }
    const e = Math.asin(0.98), sE = -Math.sin(e), cE = Math.cos(e);   // the lower edge: straight down (HATS.balaclava.lo)
    for (let y = Math.floor(Y(1)); y < H; y++) { const t = (H - y) / (H * 0.75), el = Math.atan2(sE * (1 - t) + t, cE * (1 - t)) * 180 / Math.PI, q = (el - 5) / 10;   // the eye slit: elevation −5°…15°, ±40° about the face
      if (Math.abs(q) < 1) { const hw = 40 / 360 * W * Math.sqrt(1 - q * q); g.clearRect(W / 2 - hw, y, 2 * hw, 1); } }
  } else if (k === 'panama') {
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1.5; g.setLineDash([4, 3]); for (let y = 6; y < H * 0.24; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } for (const t of [0.12, 0.3, 0.5]) { g.beginPath(); g.moveTo(0, Y(t)); g.lineTo(W, Y(t)); g.stroke(); } g.setLineDash([]);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, Y(0.09), W, 3);
    if (v.brand) brandLogo(g, v.brand, W / 2, Y(0.22), 50, ink, 'row');
  } else if (k === 'headband') {
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,255'},${rr() * 0.14})`; g.fillRect(rr() * W, rr() * H, 2.2, 2.2); }   // terry
    g.fillStyle = v.c2; g.fillRect(0, Y(0.95), W, Y(0.8) - Y(0.95)); g.fillRect(0, Y(0.2), W, Y(0.05) - Y(0.2));
    if (v.brand) brandLogo(g, v.brand, W / 2, Y(0.5), 40, ink, 'mark');
  } else if (k === 'bandB') {
    g.fillStyle = ink; for (let y = 8; y < H; y += 22) for (let x = (y % 44 ? 0 : 11); x < W; x += 22) { g.globalAlpha = 0.75; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); g.globalAlpha = 0.5; g.beginPath(); g.ellipse(x + 9, y + 9, 5, 2, 0.8, 0, 7); g.stroke(); } g.globalAlpha = 1;
  }
}
GUARDS.push({ id: 'green', c: '#2fae5a', label: 'зелёная' }, { id: 'pink', c: '#e07a9c', label: 'розовая' }, { id: 'orange', c: '#e8742a', label: 'оранжевая' }, { id: 'white', c: '#f2f1ec', label: 'белая' }, { id: 'purple', c: '#6a3aa8', label: 'фиолетовая' });

/* —— the items —— */
const W3 = { v: 3 };
Object.assign(ITEMS, Object.fromEntries(Object.entries({
  // tops
  polo: { cat: 'top', label: 'поло', model: { cut: 'polo' }, colors: ['white', 'navy', 'red'], price: 350, tags: ['street', 'basic'] },
  poloRL: { cat: 'top', label: 'поло', model: { cut: 'polo', decal: { f: [-8, 15, 6] } }, colors: ['black', 'white', 'olive'], price: 600, reward: 2, tags: ['street'], brand: 'REDLINE' },
  raglan: { cat: 'top', label: 'лонгслив-реглан', model: { cut: 'raglan' }, colors: ['white', 'grey', 'sand'], price: 320, tags: ['street', 'basic'] },
  flannel: { cat: 'top', label: 'фланелевая рубашка', model: { cut: 'flannel', pat: 'check' }, colors: ['red', 'navy', 'olive'], price: 650, tags: ['street'] },
  flannelB: { cat: 'top', label: 'фланель «лесоруб»', model: { cut: 'flannel', pat: 'check', c2: '#1b1c20', uc: '#1b1c20' }, colors: ['red', 'yellow', 'blue'], price: 800, reward: 3, tags: ['street'], brand: 'CONCRETE SAINTS' },
  trackJ: { cat: 'top', label: 'олимпийка', model: { cut: 'trackJ', decal: { f: [-8, 15, 6] } }, colors: ['navy', 'black', 'red'], price: 700, tags: ['street'], brand: 'COLDBLOOD' },
  trackJR: { cat: 'top', label: 'олимпийка «ретро»', model: { cut: 'trackJ', c2: '#e0b92e' }, colors: ['blue', 'wine', 'olive'], price: 900, reward: 5, tags: ['street'] },
  bomber: { cat: 'top', label: 'бомбер', model: { cut: 'bomber', c2: '#d9641e', decal: { b: [0, 20, 22] } }, colors: ['olive', 'black', 'navy'], price: 1400, tags: ['street'], brand: 'BLACKOUT SUPPLY' },
  wind: { cat: 'top', label: 'ветровка', model: { cut: 'wind' }, colors: ['blue', 'red', 'olive'], price: 850, tags: ['street'], brand: 'GUTTERWAVE' },
  puffer: { cat: 'top', label: 'жилетка-пуховик', model: { cut: 'puffer', uc: '#2b2e36' }, colors: ['black', 'red', 'sand'], price: 1100, reward: 6, tags: ['street'], brand: 'AFTERHOURS' },
  meshTee: { cat: 'top', label: 'футболка-сетка', model: { cut: 'meshTee' }, colors: ['black', 'white', 'red'], price: 260, tags: ['street'] },
  hoodPO: { cat: 'top', label: 'свитшот с капюшоном', model: { cut: 'hoodPO', decal: { f: [0, 18, 20] } }, colors: ['grey', 'black', 'sand'], price: 650, tags: ['street'], brand: 'STRAY DOGS' },
  jersey: { cat: 'top', label: 'футбольная джерси', model: { cut: 'jersey', num: 10 }, colors: ['red', 'blue', 'yellow'], price: 500, tags: ['street'] },
  jersey7: { cat: 'top', label: 'джерси «7»', model: { cut: 'jersey', num: 7, pat: 'stripe' }, colors: ['white', 'black'], nat: wNat({ white: '#ecebe6', black: '#1b1c20' }, { white: { c2: '#b3202c' }, black: { c2: '#e0b92e' } }), price: 750, reward: 4, tags: ['street'], brand: 'LOW BLOW' },
  teeStripe: { cat: 'top', label: 'тельняшка', model: { cut: 'tee', pat: 'stripe' }, colors: ['white', 'black'], nat: wNat({ white: '#ecebe6' }, { white: { c2: '#1d2a4a' } }), price: 200, tags: ['street', 'basic'] },
  teeTie: { cat: 'top', label: 'футболка тай-дай', model: { cut: 'teeOv', pat: 'tiedye' }, colors: ['pink', 'blue', 'yellow'], price: 450, tags: ['street'] },
  teeLogo: { cat: 'top', label: 'футболка-монограмма', model: { cut: 'tee', pat: 'logo' }, colors: ['black', 'sand', 'wine'], price: 750, tags: ['street'], brand: 'IRON JAW' },
  // bottoms
  trackP: { cat: 'bottom', label: 'спортивные с лампасами', model: { cut: 'trackP', c2: '#ecebe6' }, colors: ['black', 'navy', 'red'], price: 500, tags: ['street'] },
  cargoL: { cat: 'bottom', label: 'карго длинные', model: { cut: 'cargoL', belt: 1 }, colors: ['olive', 'sand', 'black', 'camo'], price: 550, tags: ['street'], brand: 'BLACKOUT SUPPLY' },
  jeansR: { cat: 'bottom', label: 'рваные джинсы', model: { cut: 'jeans', belt: 1, rip: 1 }, colors: ['worn', 'indigo', 'black'], nat: ITEMS.jeans.nat, price: 450, tags: ['street'] },
  bermuda: { cat: 'bottom', label: 'бермуды', model: { cut: 'bermuda', belt: 1 }, colors: ['sand', 'navy', 'olive'], price: 300, tags: ['street', 'basic'] },
  bermudaC: { cat: 'bottom', label: 'бермуды в клетку', model: { cut: 'bermuda', belt: 1, pat: 'check' }, colors: ['red', 'navy', 'olive'], price: 380, reward: 2, tags: ['street'] },
  bike: { cat: 'bottom', label: 'велосипедки', model: { cut: 'bike' }, colors: ['black', 'navy', 'red'], price: 280, tags: ['street', 'ring'], brand: 'REDLINE' },
  trico: { cat: 'bottom', label: 'трико боксёрское', model: { cut: 'trico', c2: '#d6a640' }, colors: ['red', 'blue', 'black', 'white'], price: 600, tags: ['ring', 'street'], brand: 'IRON JAW' },
  sweatTie: { cat: 'bottom', label: 'спортивки тай-дай', model: { cut: 'sweat', pat: 'tiedye' }, colors: ['pink', 'blue', 'yellow'], price: 400, reward: 1, tags: ['street'] },
  // shoes
  hiTop: { cat: 'shoes', label: 'высокие кроссовки', model: { sole: '#f4f2ec', top: 15, lace: '#ffffff', deco: 'hi', c2: '#ecebe6' }, colors: ['red', 'black', 'blue'], price: 650, tags: ['street'] },
  combat: { cat: 'shoes', label: 'берцы', model: { sole: '#18181a', top: 19, lace: '#141416', tab: '#111113', deco: 'boot' }, colors: ['black', 'brown', 'sand'], price: 900, reward: 3, tags: ['street'], brand: 'BLACKOUT SUPPLY' },
  kedsLo: { cat: 'shoes', label: 'кеды низкие', model: { sole: '#f1eee6', top: 7.5, cap: '#f1eee6', band: '#2f55b5', canvas: 1, lace: '#f4f2ec' }, colors: ['white', 'red', 'black'], price: 220, tags: ['street', 'basic'] },
  slides: { cat: 'shoes', label: 'шлёпанцы с носками', model: { sole: '#202124', top: 21, deco: 'slide', sock: '#efeee9' }, colors: ['black', 'red', 'navy'], price: 180, tags: ['street'], brand: 'STRAY DOGS' },
  bootsHi: { cat: 'shoes', label: 'боксёрки высокие', model: { sole: '#d9d4c8', top: 26, boot: '#f2f0ea', lace: '#f2f0ea', deco: 'boxhi', c2: '#d6a640' }, colors: ['red', 'blue', 'black'], price: 800, tags: ['ring'], brand: '16OZ' },
  // head
  balaclava: { cat: 'head', label: 'балаклава', model: { hat: 'balaclava', off: [0.85, 0.2] }, colors: ['black', 'olive', 'red'], price: 350, tags: ['street'] },
  panama: { cat: 'head', label: 'панама', model: { hat: 'panama', off: [0.5, 0.85] }, colors: ['sand', 'black', 'olive'], price: 280, tags: ['street'], brand: 'AFTERHOURS' },
  headband: { cat: 'head', label: 'повязка на голову', model: { hat: 'headband', off: [0.9, 0.2] }, colors: ['white', 'red', 'black'], price: 150, tags: ['street', 'ring'], brand: 'REDLINE' },
  bandB: { cat: 'head', label: 'бандана-повязка', model: { hat: 'bandB', off: [0.95, 0.2] }, colors: ['black', 'red', 'navy'], price: 140, tags: ['street'] },
  capF: { cat: 'head', label: 'снэпбэк', model: { hat: 'capF', off: [0.6, 0.75], logo: 'front' }, colors: ['black', 'red', 'olive'], price: 400, reward: 2, tags: ['street'], brand: 'LOW BLOW' },
  // printed versions of the cuts (the same model, another print: they read as other things, not as a recolour)
  poloSt: { cat: 'top', label: 'поло в полоску', model: { cut: 'polo', pat: 'stripe' }, colors: ['white', 'navy', 'red'], price: 420, tags: ['street'] },
  longSt: { cat: 'top', label: 'лонгслив в полоску', model: { cut: 'long', pat: 'stripe' }, colors: ['white', 'black', 'red'], price: 380, tags: ['street'] },
  sweatChk: { cat: 'top', label: 'свитшот в клетку', model: { cut: 'sweatshirt', pat: 'check' }, colors: ['wine', 'navy', 'olive'], price: 600, reward: 5, tags: ['street'] },
  hoodTie: { cat: 'top', label: 'худи тай-дай', model: { cut: 'hoodPO', pat: 'tiedye' }, colors: ['blue', 'pink', 'orange'], price: 800, tags: ['street'] },
  trackJLg: { cat: 'top', label: 'олимпийка-монограмма', model: { cut: 'trackJ', pat: 'logo' }, colors: ['black', 'navy', 'wine'], price: 1100, reward: 7, tags: ['street'], brand: 'REDLINE' },
  windCamo: { cat: 'top', label: 'ветровка камуфляж', model: { cut: 'wind', pat: 'camo' }, colors: ['olive', 'black'], price: 950, tags: ['street'], brand: 'BLACKOUT SUPPLY' },
  jersey99: { cat: 'top', label: 'джерси «99»', model: { cut: 'jersey', num: 99, pat: 'logo' }, colors: ['black', 'blue', 'red'], price: 900, tags: ['street'], brand: 'GUTTERWAVE' },
  tankCamo: { cat: 'top', label: 'майка камуфляж', model: { cut: 'tank', pat: 'camo' }, colors: ['olive', 'black'], price: 220, tags: ['street'] },
  bikeCamo: { cat: 'bottom', label: 'велосипедки камуфляж', model: { cut: 'bike', pat: 'camo' }, colors: ['olive', 'black'], price: 340, tags: ['street'] },
  trackPLg: { cat: 'bottom', label: 'спортивки-монограмма', model: { cut: 'trackP', pat: 'logo', c2: '#ecebe6' }, colors: ['black', 'navy'], price: 750, reward: 4, tags: ['street'], brand: 'COLDBLOOD' },
  bermudaSt: { cat: 'bottom', label: 'бермуды в полоску', model: { cut: 'bermuda', belt: 1, pat: 'stripe' }, colors: ['white', 'navy', 'sand'], price: 360, tags: ['street'] },
  tricoSt: { cat: 'bottom', label: 'трико в полоску', model: { cut: 'trico', pat: 'stripe', c2: '#ecebe6' }, colors: ['red', 'blue', 'black'], price: 700, reward: 3, tags: ['ring', 'street'], brand: 'IRON JAW' },
  panamaCamo: { cat: 'head', label: 'панама камуфляж', model: { hat: 'panama', off: [0.5, 0.85], pat: 'camo' }, colors: ['olive', 'sand'], price: 320, tags: ['street'] },
  panamaTie: { cat: 'head', label: 'панама тай-дай', model: { hat: 'panama', off: [0.5, 0.85], pat: 'tiedye' }, colors: ['pink', 'blue'], price: 340, tags: ['street'] },
  capChk: { cat: 'head', label: 'кепка в клетку', model: { hat: 'cap', off: [0.6, 0.75], pat: 'check' }, colors: ['red', 'navy', 'sand'], price: 360, tags: ['street'] },
  beanieSt: { cat: 'head', label: 'бини в полоску', model: { hat: 'beanie', off: [0.8, 0.4], pat: 'stripe' }, colors: ['red', 'navy', 'yellow'], price: 260, tags: ['street'] },
  slidesLg: { cat: 'shoes', label: 'шлёпанцы-монограмма', model: { sole: '#202124', top: 21, deco: 'slide', sock: '#efeee9', pat: 'logo' }, colors: ['black', 'wine'], price: 300, tags: ['street'], brand: 'AFTERHOURS' },
  hiTopChk: { cat: 'shoes', label: 'высокие кеды в клетку', model: { sole: '#f4f2ec', top: 15, lace: '#ffffff', deco: 'hi', c2: '#ecebe6', canvas: 1, pat: 'check' }, colors: ['red', 'navy'], price: 600, tags: ['street'] },
}).map(([k, it]) => [k, { ...it, ...W3 }])));
for (const k in ITEMS) ITEMS[k].id = k;
ITEMS.guard.colors = GUARDS.map(x => x.id);
