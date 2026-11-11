/* ───────── training: the focus mitts (лапы) ─────────
   The coach holds two focus mitts and feeds them; a punch that lands on the pad is answered by the pad and the forearm springing
   back, a ripple running through the leather and a short slap. A punch that misses the pad gets nothing.

   • the mitt (mittGeo): a curved pad 27 × 19 × 7.5 cm — a shallow dome over the palm, a thick rolled seam round the silhouette
     with stitching, a round target sewn on the striking side, a cuff over the wrist with a strap across the back of the hand.
     Canvas textures only (colour, roughness/metalness, a normal map built from a height field) — see mittTextures().
   • the rig (mittWear): the pad is built in the hand's own frame (origin at the wrist, +y along the fingers, +z the palm — the
     same frame 04b_gloves_headgear.js uses for the boxing glove) and parented to CC_Base_{L,R}_Hand with a constant local
     matrix, so it rides the bone exactly like a glove. The coach's arms are then posed by IK (Fighter.ik) to the feed targets,
     and the hand's own orientation is written straight (Fighter.setMQuat) so the pad's face looks where the feed says while its
     long axis stays along the forearm — no broken wrist.
   • the response: each arm carries a damped spring (00_looks_templates_punches.js: Spring). A landed punch kicks it along the
     punch direction, which the IK turns into the mitt and the forearm giving way and coming back. The leather ripples in the
     vertex shader (uHit / uHitT) and sfx.mitt() cracks.
   • the drill is driven by window.__mitts = { start, stop, hold, hit } — the judge's API. It runs in LOCS.boxgym, in the ring. */
const MT_T = Math.PI * 2;
const MITTS = {
  on: false, coach: null, hold: 'jab', t: 0,
  score: 0, hits: 0, combo: 0, best: 0, lastT: -9, dmg: 0,
  geo: null, tex: null, mat: null, trim: null, tmat: null, arm: {},
  uHit: { value: new THREE.Vector4(0, 0, 0, 0) }, uHitT: { value: 9 },
};
/* scratch (the fighter's own _v* / _j* / _q* belong to ik() and pose()) */
const _mt1 = new V3(), _mt2 = new V3(), _mt3 = new V3(), _mt4 = new V3(), _mt5 = new V3(), _mt6 = new V3();
const _mtm = new M4(), _mtm2 = new M4(), _mtq = new Quat(), _mtq2 = new Quat();

/* ───────── the model ─────────
   Hand frame, centimetres: origin at the wrist, +x across (y × z), +y along the fingers (the knuckle bone sits at 10.3), +z out
   of the palm. The pad lies over the palm and runs from 7 cm behind the wrist to 20 cm past it. */
const MT_L = 25;                                       // the pad's length along the fingers (cm)
function mtPad(u, v, o) {
  const a = u * MT_T, cs = Math.cos(a), sn = Math.sin(a);
  const t = clamp((v - 0.82) / 0.18, 0, 1), cap = Math.pow(Math.max(0, 1 - Math.pow(t, 3.4)), 1 / 2.6);   // the tip: blunt and rounded, not a point
  const w = lerp(5.8, 9.6, gsm(0.02, 0.62, v)) * cap;                              // half width (19 cm across)
  const d = lerp(2.6, 3.4, gsm(0, 0.5, v)) * cap;                                  // half thickness (7.3 cm through)
  const n = sn > 0 ? 5.0 : 2.6;                                                    // a flat-ish striking face, a rounder back of the hand
  const k = Math.pow(Math.pow(Math.abs(cs), n) + Math.pow(Math.abs(sn), n), -1 / n);
  const y = -6 + MT_L * v + 1.0 * Math.sin(Math.PI * v);
  const z = sn * k * d * (sn > 0 ? 1.16 : 0.84) + 0.5 * gsm(0.2, 1, v);
  return o.set(cs * k * w, y, z);
}
const MT_IN = new V3(0, 7, 0.4);                       // a point inside the pad (gridGeo turns the surface away from it)
function mtPadN(u, v, o) {
  mtPad(u, v, _mt1); mtPad(u + 0.004, v, _mt2); mtPad(u, v + 0.004, _mt3);
  o.copy(_mt2).sub(_mt1).cross(_mt3.sub(_mt1)).normalize();
  if (o.dot(_mt1.sub(MT_IN)) < 0) o.negate();
  return o;
}
const mtOff = (u, v, e, o) => { mtPad(u, v, o); return o.addScaledVector(mtPadN(u, v, _mt4), e); };
function mtCuff(u, v, o) {   // the cuff over the wrist: flared where the pad's mouth is, waisted at the wrist, the rim rolled back in
  const a = u * MT_T;
  if (v < 0.76) { const t = v / 0.76, rx = lerp(6.2, 3.9, gsm(0, 1, t)), rz = lerp(3.4, 2.9, gsm(0, 1, t));
    return o.set(rx * Math.cos(a), -6.4 - 6.6 * t, rz * Math.sin(a) + 0.4 * (1 - t)); }
  const s = Math.sin((v - 0.76) / 0.24 * Math.PI * 0.5);
  return o.set(lerp(3.9, 3.2, s) * Math.cos(a), -13.0 + 1.3 * s, lerp(2.9, 2.4, s) * Math.sin(a));
}
/* the round target sewn on the striking side: a disc laid on the pad's face, a little proud of it. Its uv is polar
   (u = radius, v = angle), so the bullseye texture is concentric rings — a stripe per ring (mittTextures) */
const MT_TU = 0.085, MT_TV = 0.134;                    // the disc's half size in the pad's own (u, v) (≈ 7.5 cm across)
function mtTarget(s, t, o) {
  const a = t * MT_T, u = 0.25 + s * MT_TU * Math.cos(a), v = 0.53 + s * MT_TV * Math.sin(a);
  mtPad(u, v, o); return o.addScaledVector(mtPadN(u, v, _mt5), 0.10 + 0.05 * (1 - s));
}
function mtGeo() {
  if (MITTS.geo) return MITTS.geo;
  const parts = [], tgt = [], pipes = [];
  parts.push(gridGeo(mtPad, 56, 40, { c: MT_IN, ku: 1, kv: 1 }));                       // the pad
  parts.push(gridGeo(mtCuff, 40, 24, { c: new V3(0, -8, 0), ku: 2, kv: 1 }));           // the cuff
  parts.push(gridGeo((u, v, o) => { mtCuff(u, 0, o); o.x *= 1 - 0.82 * v; o.z *= 1 - 0.82 * v; return o; }, 24, 2, { c: new V3(0, -30, 0), col: () => 0.05 }));   // dark lining inside the mouth
  // the strap across the back of the hand and the one round the wrist (webbing: a flatter, greyer tone)
  parts.push(gridGeo((u, v, o) => mtOff(u, lerp(0.20, 0.40, v), 0.16 + 0.30 * clamp(Math.min(v / 0.10, (1 - v) / 0.10), 0, 1), o), 56, 6, { c: MT_IN, col: () => 0.34 }));
  parts.push(gridGeo((u, v, o) => { const a = u * MT_T, b = clamp(Math.min(v / 0.12, (1 - v) / 0.12), 0, 1); return o.set((4.1 + 0.34 * b) * Math.cos(a), -9.9 - 3.2 * v, (3.0 + 0.34 * b) * Math.sin(a)); }, 44, 6, { c: new V3(0, -11, 0), col: () => 0.34 }));
  // the rolled seam round the silhouette, and the cuff's rim
  const ring = (f, n) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i / n, new V3())); return a; };
  const loop = []; for (let i = 0; i <= 22; i++) loop.push(mtOff(0.045, 0.05 + 0.915 * (i / 22), 0.09, new V3()));
  for (let i = 22; i >= 0; i--) loop.push(mtOff(0.455, 0.05 + 0.915 * (i / 22), 0.09, new V3()));
  pipes.push(pipeGeo(loop, 0.32, true));
  pipes.push(pipeGeo(ring((u, o) => { const a = u * MT_T; return o.set(3.2 * Math.cos(a), -11.8, 2.4 * Math.sin(a)); }, 26), 0.22, true));
  tgt.push(gridGeo(mtTarget, 44, 40, { c: MT_IN, ku: 0.5, kv: 1 }));
  pipes.push(pipeGeo(ring((u, o) => mtTarget(1, u, o), 40), 0.11, true));              // the target's own seam
  for (const g of [...parts, ...tgt]) g.scale(0.01, 0.01, 0.01);
  for (const g of pipes) g.scale(0.01, 0.01, 0.01);
  return MITTS.geo = { body: mergeGeos(parts), tgt: mergeGeos(tgt), trim: mergeGeos(pipes) };
}

/* ───────── textures ─────────
   Layout (canvas, v down): u runs round the mitt (0 the thumb-side silhouette, 0.25 the middle of the striking face, 0.5 the
   other silhouette, 0.75 the back of the hand, and it wraps); v runs from the wrist (0) to the tip (1). The canvas is 1.7 : 1,
   like the pad itself (≈46 cm round, 27 cm long). */
function mittTextures() {
  if (MITTS.tex) return MITTS.tex;
  const W = 1024, H = 600;
  let seed = 5171; const R = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const wrapX = (g, fn) => { for (const ox of [-W, 0, W]) { g.save(); g.translate(ox, 0); fn(); g.restore(); } };
  const stitch = (g, x0, y0, x1, y1, col, lw = 1.5, dash = [5, 4]) => { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); };
  const SEAM = [0.02, 0.48], PATCH = [0.075, 0.425];       // the rolled seam, and the stitched border of the striking panel
  const scuffs = [], scratches = [], creases = [];
  for (let i = 0; i < 30; i++) scuffs.push({ x: W * (0.06 + R() * 0.88), y: H * (0.04 + R() * 0.9), rx: 16 + R() * 54, ry: 9 + R() * 26, a: R() * 3, k: R() });
  for (let i = 0; i < 150; i++) { const x = R() * W, y = R() * H, l = 6 + R() * R() * 66, a = (R() - 0.5) * 1.5; scratches.push({ x, y, x2: x + Math.cos(a) * l, y2: y + Math.sin(a) * l * 0.7, k: R() }); }
  for (let i = 0; i < 40; i++) creases.push({ x: R() * W, y: H * (0.1 + R() * 0.8), l: 40 + R() * 130, b1: (R() - 0.5) * 16, b2: (R() - 0.5) * 16, k: R() });

  /* colour: oxblood leather, a paler striking panel, near-black webbing and seam */
  const cc = mk(), c = cc.getContext('2d');
  c.fillStyle = '#63170f'; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 420; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,205,180' : '0,0,0'},${0.012 + R() * 0.04})`; c.beginPath(); c.ellipse(R() * W, R() * H, 16 + R() * 80, 10 + R() * 44, R() * 3, 0, 7); c.fill(); }
  { const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,.22)'); gr.addColorStop(0.35, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.18)'); c.fillStyle = gr; c.fillRect(0, 0, W, H); }
  c.save(); c.globalAlpha = 0.5; c.fillStyle = '#7c2116'; c.fillRect(W * PATCH[0], 0, W * (PATCH[1] - PATCH[0]), H); c.restore();   // the striking panel
  for (const s of creases) { c.strokeStyle = `rgba(0,0,0,${0.06 + s.k * 0.1})`; c.lineWidth = 1 + s.k * 1.3; wrapX(c, () => { c.beginPath(); c.moveTo(s.x, s.y); c.bezierCurveTo(s.x + s.l / 3, s.y + s.b1, s.x + 2 * s.l / 3, s.y + s.b2, s.x + s.l, s.y + (s.b1 + s.b2) * 0.2); c.stroke(); }); }
  for (const s of scuffs) wrapX(c, () => { c.save(); c.translate(s.x, s.y); c.rotate(s.a); c.scale(1, s.ry / s.rx); const gr = c.createRadialGradient(0, 0, 0, 0, 0, s.rx); gr.addColorStop(0, `rgba(206,164,132,${0.09 + s.k * 0.2})`); gr.addColorStop(1, 'rgba(206,164,132,0)'); c.fillStyle = gr; c.beginPath(); c.arc(0, 0, s.rx, 0, 7); c.fill(); c.restore(); });
  for (const s of scratches) { c.strokeStyle = s.k < 0.6 ? `rgba(232,206,182,${0.07 + s.k * 0.2})` : `rgba(0,0,0,${0.1 + s.k * 0.16})`; c.lineWidth = 0.6 + s.k; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x2, s.y2); c.stroke(); }
  for (const u of SEAM) { const x = W * u; c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(x - 2, 0, 4, H); c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(x - 10, 0, 20, H); stitch(c, x - 7, 0, x - 7, H, '#d9c39a'); stitch(c, x + 7, 0, x + 7, H, '#d9c39a'); }
  for (const u of PATCH) { const x = W * u; c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x - 1.5, H * 0.03, 3, H * 0.94); stitch(c, x + 6, H * 0.05, x + 6, H * 0.95, 'rgba(226,200,164,.75)', 1.4, [6, 5]); }
  stitch(c, 0, H * 0.045, W, H * 0.045, 'rgba(226,200,164,.7)', 1.4, [6, 5]);
  stitch(c, 0, H * 0.955, W, H * 0.955, 'rgba(226,200,164,.7)', 1.4, [6, 5]);
  c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, 0, W, H * 0.03); c.fillRect(0, H * 0.97, W, H * 0.03);
  { c.save(); c.translate(W * 0.75, H * 0.5); c.rotate(-Math.PI / 2); c.globalAlpha = 0.55; brandMark(c, 'IRON JAW', 0, 0, 30, '#e2c8a4'); c.restore(); }   // the maker's stamp, as on the bag
  { const im = c.getImageData(0, 0, W, H), d = im.data; for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 15; d[i] += n; d[i + 1] += n; d[i + 2] += n; } c.putImageData(im, 0, 0); }
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.wrapS = THREE.RepeatWrapping;

  /* roughness (G) / metalness (B): polished where the fists land, dry and scuffed elsewhere, the webbing flat and matte */
  const oc = mk(), o = oc.getContext('2d'), rg = (r, m = 0) => `rgb(0,${Math.round(r * 255)},${Math.round(m * 255)})`;
  o.fillStyle = rg(0.52); o.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) { o.fillStyle = `rgba(0,${R() < 0.5 ? 255 : 70},0,${0.03 + R() * 0.06})`; o.beginPath(); o.ellipse(R() * W, R() * H, 16 + R() * 70, 10 + R() * 44, R() * 3, 0, 7); o.fill(); }
  { const gr = o.createLinearGradient(W * PATCH[0], 0, W * PATCH[1], 0); gr.addColorStop(0, 'rgba(0,60,0,0)'); gr.addColorStop(0.5, 'rgba(0,58,0,.55)'); gr.addColorStop(1, 'rgba(0,60,0,0)'); o.fillStyle = gr; o.fillRect(W * PATCH[0], 0, W * (PATCH[1] - PATCH[0]), H); }
  for (const s of scuffs) wrapX(o, () => { o.save(); o.translate(s.x, s.y); o.rotate(s.a); o.scale(1, s.ry / s.rx); const gr = o.createRadialGradient(0, 0, 0, 0, 0, s.rx); gr.addColorStop(0, `rgba(0,215,0,${0.25 + s.k * 0.35})`); gr.addColorStop(1, 'rgba(0,215,0,0)'); o.fillStyle = gr; o.beginPath(); o.arc(0, 0, s.rx, 0, 7); o.fill(); o.restore(); });
  for (const s of scratches) { o.strokeStyle = 'rgba(0,225,0,.45)'; o.lineWidth = 1 + s.k; o.beginPath(); o.moveTo(s.x, s.y); o.lineTo(s.x2, s.y2); o.stroke(); }
  for (const u of [...SEAM, ...PATCH]) { o.fillStyle = rg(0.8); o.fillRect(W * u - 8, 0, 16, H); }
  o.fillStyle = rg(0.86); o.fillRect(0, 0, W, H * 0.045); o.fillRect(0, H * 0.955, W, H * 0.045);
  o.fillStyle = rg(0.9); o.fillRect(0, H * 0.20, W, H * 0.20); o.fillRect(0, H * 0.70, W, H * 0.10);   // the straps
  const orm = new THREE.CanvasTexture(oc); orm.anisotropy = 4; orm.wrapS = THREE.RepeatWrapping;

  /* height → normal: pebbled grain, the rolled seam (a raised roll with a groove and stitches either side), the panel border */
  const hc = mk(), h = hc.getContext('2d');
  h.fillStyle = '#808080'; h.fillRect(0, 0, W, H);
  for (let i = 0; i < 22000; i++) { const x = R() * W, y = R() * H, r = 1.1 + R() * 2.1; h.fillStyle = `rgba(255,255,255,${0.04 + R() * 0.07})`; h.beginPath(); h.ellipse(x, y, r, r * 0.72, R() * 3, 0, 7); h.fill(); }
  for (const s of creases) for (const [lw, a] of [[7, 0.05], [3.5, 0.1], [1.5, 0.18]]) { h.strokeStyle = `rgba(0,0,0,${a * (0.5 + s.k)})`; h.lineWidth = lw; wrapX(h, () => { h.beginPath(); h.moveTo(s.x, s.y); h.bezierCurveTo(s.x + s.l / 3, s.y + s.b1, s.x + 2 * s.l / 3, s.y + s.b2, s.x + s.l, s.y + (s.b1 + s.b2) * 0.2); h.stroke(); }); }
  for (const s of scratches) { h.strokeStyle = `rgba(0,0,0,${0.14 + s.k * 0.22})`; h.lineWidth = 0.8 + s.k; h.beginPath(); h.moveTo(s.x, s.y); h.lineTo(s.x2, s.y2); h.stroke(); }
  for (const s of scuffs) wrapX(h, () => { h.save(); h.translate(s.x, s.y); h.rotate(s.a); h.scale(1, s.ry / s.rx); const gr = h.createRadialGradient(0, 0, 0, 0, 0, s.rx); gr.addColorStop(0, `rgba(128,128,128,${0.2 + s.k * 0.35})`); gr.addColorStop(1, 'rgba(128,128,128,0)'); h.fillStyle = gr; h.beginPath(); h.arc(0, 0, s.rx, 0, 7); h.fill(); h.restore(); });
  for (const u of SEAM) { const x = W * u; for (const [k, a] of [[1, 0.2], [0.6, 0.24]]) { h.fillStyle = `rgba(255,255,255,${a})`; h.fillRect(x - 15 * k, 0, 30 * k, H); } h.fillStyle = 'rgba(0,0,0,.8)'; h.fillRect(x - 2, 0, 4, H); stitch(h, x - 8, 0, x - 8, H, 'rgba(255,255,255,.65)', 2.2); stitch(h, x + 8, 0, x + 8, H, 'rgba(255,255,255,.65)', 2.2); }
  for (const u of PATCH) { h.fillStyle = 'rgba(255,255,255,.16)'; h.fillRect(W * u - 5, 0, 10, H); h.fillStyle = 'rgba(0,0,0,.5)'; h.fillRect(W * u - 1.5, 0, 3, H); }
  for (const [y0, y1] of [[0, 0.045], [0.955, 1]]) { h.fillStyle = 'rgba(255,255,255,.22)'; h.fillRect(0, H * y0, W, H * (y1 - y0)); h.fillStyle = 'rgba(0,0,0,.55)'; h.fillRect(0, H * y0, W, 3); h.fillRect(0, H * y1 - 3, W, 3); }
  h.fillStyle = 'rgba(255,255,255,.16)'; h.fillRect(0, H * 0.20, W, H * 0.20); h.fillRect(0, H * 0.70, W, H * 0.10);
  h.fillStyle = 'rgba(0,0,0,.5)'; for (const y of [0.20, 0.40, 0.70, 0.80]) h.fillRect(0, H * y - 2, W, 4);
  { const src = h.getImageData(0, 0, W, H).data, im = h.createImageData(W, H), hv = (x, y) => src[((y < 0 ? 0 : y >= H ? H - 1 : y) * W + (x + W) % W) * 4] / 255, d = im.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (hv(x - 1, y) - hv(x + 1, y)) * 2.4, dy = (hv(x, y + 1) - hv(x, y - 1)) * 2.4 * (W / H) / 1.7, l = 1 / Math.hypot(dx, dy, 1), k = (y * W + x) * 4;
      d[k] = (dx * l * 0.5 + 0.5) * 255; d[k + 1] = (dy * l * 0.5 + 0.5) * 255; d[k + 2] = (l * 0.5 + 0.5) * 255; d[k + 3] = 255; }
    h.putImageData(im, 0, 0); }
  const nrm = new THREE.CanvasTexture(hc); nrm.anisotropy = 8; nrm.wrapS = THREE.RepeatWrapping;

  /* the target: concentric rings in polar uv (u = radius, v = angle, wrapping) — cream, red, cream, red, then the seam */
  const tc = mk(), g = tc.getContext('2d'), bands = [[0.00, 0.17, '#a8231a'], [0.17, 0.25, '#e9dfc8'], [0.25, 0.74, '#d6c7a8'], [0.74, 0.86, '#a8231a'], [0.86, 1.00, '#e9dfc8']];
  for (const [a, b, col] of bands) { g.fillStyle = col; g.fillRect(a * W * 0.5, 0, (b - a) * W * 0.5, H); }
  g.fillStyle = '#26242a'; g.fillRect(W * 0.5, 0, W * 0.5, H);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + R() * 0.06})`; g.fillRect(R() * W * 0.5, R() * H, 2 + R() * 9, 1 + R() * 2); }
  for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(0,0,0,${0.05 + R() * 0.12})`; g.lineWidth = 0.8 + R() * 2; const x = R() * W * 0.5, y = R() * H, l = 8 + R() * 46, a = (R() - 0.5) * 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const tmap = new THREE.CanvasTexture(tc); tmap.colorSpace = THREE.SRGBColorSpace; tmap.anisotropy = 8; tmap.wrapS = THREE.RepeatWrapping;

  return MITTS.tex = { map, orm, nrm, tmap };
}

/* the leather: one material for the pad, the cuff and the straps (vertex colours separate them), a plain one for the seam and the
   target's rim, and the bullseye for the patch. The pad ripples where a fist just landed (uHit: the point in the mesh's own
   space, uHit.w the amplitude, uHitT seconds since) */
function mittMats() {
  if (MITTS.mat) return;
  const T = mittTextures();
  MITTS.mat = new THREE.MeshPhysicalMaterial({ map: T.map, normalMap: T.nrm, roughnessMap: T.orm, metalnessMap: T.orm, roughness: 1, metalness: 1, normalScale: new THREE.Vector2(0.85, 0.85), clearcoat: 0.45, clearcoatRoughness: 0.35, vertexColors: true });
  MITTS.mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uHit: MITTS.uHit, uHitT: MITTS.uHitT });
    sh.vertexShader = 'uniform vec4 uHit;\nuniform float uHitT;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  { float d = distance( position, uHit.xyz );
    transformed += objectNormal * ( uHit.w * exp( -d * d * 900.0 ) * sin( uHitT * 170.0 - d * 110.0 ) * exp( -uHitT * 8.0 ) ); }`);
  };
  MITTS.trim = new THREE.MeshPhysicalMaterial({ color: '#2a2628', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.45 });
  MITTS.tmat = new THREE.MeshPhysicalMaterial({ map: T.tmap, roughness: 0.62, clearcoat: 0.2, vertexColors: true });
}

/* ───────── the rig: the mitts on the coach's hands ─────────
   Built in the hand's own frame (as 04b builds the boxing glove), so the pad sits over the palm and runs along the fingers. The
   frame is taken with the fingers in their bind pose, so it does not depend on how the hand happens to be curled right now. */
const MT_FINGERS = ['Index1', 'Index2', 'Index3', 'Mid1', 'Mid2', 'Mid3', 'Ring1', 'Ring2', 'Ring3', 'Pinky1', 'Pinky2', 'Pinky3', 'Thumb1', 'Thumb2', 'Thumb3'];
function mittWear(F) {
  mittMats(); const geo = mtGeo(), B = F.bones, saved = [];
  for (const S of ['L', 'R']) for (const n of MT_FINGERS) { const b = B[`CC_Base_${S}_${n}`]; if (b) { saved.push([b, b.quaternion.clone()]); b.quaternion.copy(F.bindQ.get(b) || b.quaternion); } }
  F.group.updateMatrixWorld(true);
  MITTS.arm = {};
  for (const S of ['L', 'R']) {
    const hb = B[`CC_Base_${S}_Hand`], hp = F.mpos(hb, new V3());
    const Y = F.mpos(B[`CC_Base_${S}_Mid1`], new V3()).sub(hp).normalize();
    const X0 = F.mpos(B[`CC_Base_${S}_Index1`], new V3()).sub(F.mpos(B[`CC_Base_${S}_Pinky1`], new V3()));
    X0.addScaledVector(Y, -X0.dot(Y)).normalize();
    const Z = new V3().crossVectors(X0, Y).multiplyScalar(S === 'R' ? 1 : -1);   // the palm (the glove's own convention)
    const X = new V3().crossVectors(Y, Z);                                      // x = y × z: a right-handed frame, so the pad is not mirrored
    const rel = new M4().copy(hb.matrixWorld).invert().multiply(F.group.matrixWorld).multiply(new M4().makeBasis(X, Y, Z).setPosition(hp));
    const grp = new THREE.Group(); grp.add(new THREE.Mesh(geo.body, MITTS.mat), new THREE.Mesh(geo.trim, MITTS.trim), new THREE.Mesh(geo.tgt, MITTS.tmat));
    grp.matrixAutoUpdate = false; grp.matrix.copy(rel);
    for (const m of grp.children) m.castShadow = m.receiveShadow = true;
    hb.add(grp);
    const qrel = new Quat().setFromRotationMatrix(new M4().extractRotation(rel));
    MITTS.arm[S] = { grp, hb, qrelI: qrel.clone().invert(), face: new V3(), nrm: new V3(0, 0, 1), faceL: mtPad(0.25, 0.53, new V3()).multiplyScalar(0.01),
      t: new V3(), rx: new Spring(320, 20), ry: new Spring(320, 20), rz: new Spring(320, 20) };
    MITTS.arm[S].t.copy(F.mpos(hb, new V3()));
  }
  for (const [b, q] of saved) b.quaternion.copy(q);
  F.group.updateMatrixWorld(true);
  MITTS.uHit.value.set(0, 0, 0, 0); MITTS.uHitT.value = 9;
}

/* ───────── the feeds ─────────
   Where the coach holds the mitts, in his own model space (metres): +z faces the boxer, +x is the side of the `_L_` bones (the
   man faces the player, so his L hand is on the same side of the line as the player's L). [wrist x, y, z, face normal x, y, z].
   The pad's long axis is not given — the pose takes it from the forearm, so the wrist never breaks. */
/* The numbers were measured, not guessed: for every (feed, side) the man's own punch was thrown at it and the wrist target was
   walked in until his knuckle passed within a few centimetres of the pad's face — see the note in the drill below. The other
   mitt of a feed is only ever held, never hit (mittsThrow presents the side it is asked for), so it is free to sit at the chin. */
const FEEDS = {
  jab: { L: [0.092, 1.440, 0.146, 0, 0, 1], R: [-0.090, 1.360, 0.100, 0.30, -0.16, 0.94] },     // the lead mitt out in front of the face, the other at the chin
  cross: { L: [0.090, 1.360, 0.100, -0.30, -0.16, 0.94], R: [-0.050, 1.460, 0.130, 0, 0, 1] },   // the second mitt out, the lead hand back at the chin
  hook: { L: [0.110, 1.449, 0.209, 0.90, 0.04, 0.43], R: [-0.078, 1.355, 0.117, -0.90, 0.04, 0.43] },   // turned side-on for a hook
};
/* the arms: IK to the feed, then the hand written straight so the pad looks where the feed says */
function mittsPose(F, dt) {
  const B = F.bones, feed = FEEDS[MITTS.hold] || FEEDS.jab;
  for (const S of ['L', 'R']) {
    const A = MITTS.arm[S]; if (!A) continue;
    const f = feed[S], k = Math.min(1, dt * 10);
    A.t.lerp(_mt1.set(f[0] + A.rx.x, f[1] + A.ry.x, f[2] + A.rz.x), k);
    F.ik(B[`CC_Base_${S}_Upperarm`], B[`CC_Base_${S}_Forearm`], B[`CC_Base_${S}_Hand`], A.t);
  }
  F.cc.updateMatrixWorld(true);
  for (const S of ['L', 'R']) {
    const A = MITTS.arm[S]; if (!A) continue;
    const f = feed[S];
    const Y = _mt1.copy(F.mpos(A.hb, _mt2)).sub(F.mpos(B[`CC_Base_${S}_Forearm`], _mt3)).normalize();   // the forearm: the pad's long axis
    const Z = _mt2.set(f[3], f[4], f[5]).addScaledVector(Y, -_mt2.dot(Y)).normalize();                  // the face, square to it
    const X = _mt3.crossVectors(Y, Z);
    F.setMQuat(A.hb, _mtq.setFromRotationMatrix(_mtm.makeBasis(X, Y, Z)).multiply(A.qrelI));
  }
  F.cc.updateMatrixWorld(true);
  for (const S of ['L', 'R']) { const A = MITTS.arm[S]; if (!A) continue; A.grp.localToWorld(A.face.copy(A.faceL)); A.nrm.set(0, 0, 1).transformDirection(A.grp.matrixWorld); }
}

/* ───────── the response ───────── */
function mittHit(S, pos, dir, power) {
  const A = MITTS.arm[S], F = MITTS.coach; if (!A || !F) return;
  const dm = _mt1.copy(dir).transformDirection(_mtm.copy(F.group.matrixWorld).invert()).normalize();   // the punch, in the coach's own frame
  const J = 0.55 + 1.45 * power;
  A.rx.v += dm.x * J; A.ry.v += dm.y * J - 0.18 * J; A.rz.v += dm.z * J;
  A.grp.worldToLocal(_mt2.copy(pos));
  MITTS.uHit.value.set(_mt2.x, _mt2.y, _mt2.z, 0.008 + 0.010 * power); MITTS.uHitT.value = 0;
  sfx.mitt(power);
}
/* a punch of the player's that reaches a pad: the pad takes it (no damage to the coach). Called from Fighter.tick before the
   normal resolution, so the punch counts as landed and the fist is not pushed out of his face by armClear (patched below). */
function mittsTry(F) {
  if (!MITTS.on || F !== P1 || !F.cur || F.resolved) return false;
  const P = PUNCH[F.cur], t = F.act[F.cur].time;
  if (t < P.impact - 0.14 || t > P.impact + 0.06) return false;
  const kn = F.knuckle(_mt1), dir = _mt2.copy(kn).sub(F.kOld || kn);
  if (dir.lengthSq() < 1e-8) return false;
  dir.normalize();
  for (const S of ['L', 'R']) {
    const A = MITTS.arm[S]; if (!A) continue;
    if (kn.distanceTo(A.face) > 0.115 || dir.dot(A.nrm) > -0.2) continue;   // on the pad, and coming at its face
    F.resolved = true; F.whiff = false; F.lastLand = G.t;
    let dmg = P.dmg * (F.dmgMul || 1) * (1 + 0.06 * SK(F, 'pow')) * (F.sig && sigOf(F.cur) === F.sig ? 1.12 : 1) * (F.punchK ?? 1);
    const power = clamp(dmg / 18, 0.2, 1.6);
    mittHit(S, kn, dir, power);
    MITTS.combo = G.t - MITTS.lastT < 1.1 ? MITTS.combo + 1 : 1; MITTS.lastT = G.t; MITTS.best = Math.max(MITTS.best, MITTS.combo);
    const pts = Math.round(dmg * (1 + 0.15 * (MITTS.combo - 1)));
    MITTS.score += pts; MITTS.hits++; MITTS.dmg += dmg;
    G.hitstop = 0.008 + 0.016 * power; G.shake = Math.max(G.shake, 0.005 + 0.016 * power);
    popup(kn, MITTS.combo > 1 ? `${pts} ×${MITTS.combo}` : String(pts), MITTS.combo >= 4 ? 'crit' : 'hit');
    if (MITTS.combo === 5) msg('Серия ×5');
    const sl = $('st2'); if (sl) sl.textContent = 'очки ' + MITTS.score;
    return true;
  }
  return false;
}

/* ───────── the drill ───────── */
function mittsTick(dt) {
  if (!MITTS.on) return;
  MITTS.t += dt;
  const F = MITTS.coach; if (!F) return;
  if (G.state === 'fight') { G.roundT = ROUND_LEN; P1.stamina = Math.min(100, P1.stamina + 14 * dt); }   // no rounds and no gassing out in a drill
  F.wrapMesh.visible = false; for (const t of F.tails) t.mesh.visible = false; F.flesh.u.uGlv.value = 1;   // bare hands under the mitts: no wraps, and the hand itself is not drawn
  for (const S of ['L', 'R']) { const A = MITTS.arm[S]; if (!A) continue; A.rx.step(dt); A.ry.step(dt); A.rz.step(dt); }
  MITTS.uHitT.value += dt;
}
function mittsStart() {
  if (!P1 || !P2 || !P1.bones) return false;
  if (MITTS.on) return true;
  G.mode = 'mitts'; if (G.diff !== G.userDiff && G.userDiff) G.diff = G.userDiff;
  startFight(true);
  MITTS.on = true; MITTS.coach = P2; MITTS.hold = 'jab'; MITTS.t = 0;
  MITTS.score = 0; MITTS.hits = 0; MITTS.combo = 0; MITTS.best = 0; MITTS.dmg = 0; MITTS.lastT = -9;
  // a coach stands further off than an opponent: the mitts are held out to be hit, and his own face must stay behind them
  P1.mark.set(-0.72, 0, 0); P2.mark.set(0.66, 0, 0);
  P1.resetState(); P2.resetState();
  P1.sparGear(false); P2.sparGear(false);
  P2.wrapMesh.visible = false; for (const t of P2.tails) t.mesh.visible = false; P2.flesh.u.uGlv.value = 1;
  mittWear(P2);
  G.state = 'fight'; G.introT = 0; G.stareT = 0; G.flyT = 0; G.cardT = 0; G.roundT = ROUND_LEN; G.hitstop = 0;
  camCut = true; show('hl', false); show('vs', false); show('result', false); show('rec', false); show('bar-t', false); show('bar-b', false); show('hud', true); show('pad', true);
  $('n2').textContent = 'Тренер'; const sl = $('st2'); if (sl) sl.textContent = 'лапы';
  msg('Лапы'); P1.aimTarget = null;
  return true;
}
function mittsStop() {
  if (!MITTS.on) return false;
  MITTS.on = false;
  for (const S of ['L', 'R']) { const A = MITTS.arm[S]; if (A && A.grp.parent) A.grp.parent.remove(A.grp); }
  MITTS.arm = {};
  const F = MITTS.coach; if (F) { F.wrapMesh.visible = true; for (const t of F.tails) t.mesh.visible = true; }
  MITTS.coach = null;
  toMenu();
  return true;
}
/* the judge's API (issue #26): start() puts both men in the gym and turns the drill on, hold(kind) presents a mitt,
   hit(side, power) makes the player throw a real punch at it */
function mittsThrow(side, power) {
  if (!MITTS.on || !P1 || !P1.canAct()) return false;
  const S = side === 'R' ? 'R' : 'L', p = clamp(power == null ? 0.7 : power, 0, 1);
  // the mitt on the side that is being hit comes out for it, whatever was held before (a jab feeds the left hand, a cross the right)
  MITTS.hold = MITTS.hold === 'hook' ? 'hook' : S === 'L' ? 'jab' : 'cross';
  const n = MITTS.hold === 'hook' ? (S === 'L' ? 'hookL' : 'hookR') : S === 'L' ? 'jab' : 'cross';
  P1.wantBody = false; P1.powerNext = p > 0.62;
  P1.startPunch(n);
  P1.dmgMul = 0.55 + 1.1 * p;   // startPunch resets it: the judge's power lands after
  return n;
}
window.__mitts = {
  start: mittsStart, stop: mittsStop, throw: mittsThrow,
  hold(kind) { MITTS.hold = FEEDS[kind] ? kind : 'jab'; return MITTS.hold; },
  hit(side, power) { return mittsThrow(side, power); },
  get on() { return MITTS.on; }, state: MITTS, feeds: FEEDS,
};

/* ───────── the hooks into the fighter ─────────
   pose: the coach's arms after his own pose; the player aims his punch at the pad that is out.
   tick: a punch that reaches a pad is settled by the pad, before the ordinary resolution sees it.
   armClear: in the drill nobody's arms are pushed out of anybody's face — the fist is meant to reach the pad in front of it.
   footwork: the coach stands where he stands (05_fighter.js already does this for the heavy bag). */
{ const p0 = Fighter.prototype.pose;
  Fighter.prototype.pose = function (dt) {
    if (!MITTS.on) return p0.call(this, dt);
    if (this === P1 && !this.ko) { const S = this.cur ? PUNCH[this.cur].arm : MITTS.hold === 'cross' ? 'R' : 'L', A = MITTS.arm[S]; this.aimTarget = A && A.face || null; }
    p0.call(this, dt);
    if (this === MITTS.coach) mittsPose(this, dt);
  }; }
{ const t0 = Fighter.prototype.tick;
  Fighter.prototype.tick = function (dt) { if (MITTS.on && this === P1) mittsTry(this); t0.call(this, dt); }; }
{ const a0 = Fighter.prototype.armClear;
  Fighter.prototype.armClear = function () { if (!MITTS.on) a0.call(this); }; }
/* the coach is not a target: a punch that is not taken by a pad is a miss (no contact, no near miss), so nothing of the ordinary
   resolution — which would otherwise settle the punch on his head a frame before the fist reaches the pad — ever fires on him */
{ const c0 = contactTest, n0 = nearMiss;
  contactTest = function (att, def) { return MITTS.on && def === MITTS.coach ? null : c0(att, def); };
  nearMiss = function (att, def) { return MITTS.on && def === MITTS.coach ? 9 : n0(att, def); }; }
