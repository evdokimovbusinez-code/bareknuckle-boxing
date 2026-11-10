/* ───────── street clothes: loose trousers, long shorts, shoes ─────────
   Unlike the shells of 04_gear.js these are their own skinned geometry: per leg ONE tube from the hem to the waist (rings of N
   vertices, radius from a profile but never inside the body's bind-pose outline). Above the crotch the tube is the D-shaped half of
   the pelvis: its inner wall lies on the midline plane, so the two tubes join into the seat and the waistband without a seam, and
   below the crotch the same plane keeps the two thighs from running into each other. Weights go by height (the average of the
   body's own weights at that height: ThighTwist → KneeShare → CalfTwist), so the knee bends as smoothly as the leg itself.
   One mesh = one draw call; the only "cloth" is a damped spring per hem (pantsTick). */
const PANT_CUTS = {
  // hem: cm above the soles · skin: the leg is not drawn above this height · prof: [height, radius] cm · sway: how far the hem swings · fwd: the hem sits forward over the instep
  jeans: { hem: 5.2, skin: 14, prof: [[5, 9.3], [30, 8.9], [49, 8.5], [66, 9.7], [84, 10.6]], sway: 1, fwd: 1.6, swayH: 24 },
  sweat: { hem: 9.5, skin: 10.7, cuff: 5, prof: [[9, 4.9], [14.5, 4.9], [19.5, 8.2], [32, 8.9], [49, 8.7], [66, 10.1], [84, 11.0]], sway: 0.5, fwd: 0, swayH: 30 },
  short: { hem: 49, skin: 56, prof: [[49, 12.6], [66, 12.3], [84, 12.0]], sway: 1.3, fwd: 0, swayH: 16 },
};
// the body's bind-pose outline: legs, hips and the low trunk, the right half mirrored onto the left: [|x|, y, z, leg?, vertex] (cm, z up, front = -y)
function bodyEnv(F) {
  if (GEAR.env) return GEAR.env;
  const pos = F.body.geometry.attributes.position, gh = GEAR.gh, P = [], n = pos.count; let z0 = 1e9;
  for (let i = 0; i < n; i++) z0 = Math.min(z0, pos.getZ(i));
  for (let i = 0; i < n; i++) { const R = gh[i * 3 + 1], z = pos.getZ(i) - z0; if ((R !== 1 && R !== 2) || z > GEAR.top + 10) continue;
    P.push(Math.abs(pos.getX(i)), pos.getY(i), z, /_[LR]_/.test(GEAR.names[GEAR.dom[i]]) ? 1 : 0, i); }
  return GEAR.env = { P, z0 };
}
// average skin weights of a set of body vertices, as a Map(bone name with R → L, weight); drop = bones to leave out
function envWeights(F, P, ids, drop) {
  const si = F.body.geometry.attributes.skinIndex, sw = F.body.geometry.attributes.skinWeight, m = new Map(); let sum = 0;
  for (const i of ids) { const v = P[i + 4]; for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (!(w > 0)) continue; const nm = GEAR.names[si.getComponent(v, k)].replace('_R_', '_L_'); if (drop && drop.test(nm)) continue; m.set(nm, (m.get(nm) || 0) + w); sum += w; } }
  for (const [k, w] of m) m.set(k, w / (sum || 1));
  return m;
}
function mixWeights(A, B, a, side) {   // a·A + (1-a)·B → the four strongest as [[bone index, weight] × 4]
  const m = new Map(); for (const [k, w] of A) m.set(k, w * a); for (const [k, w] of B) m.set(k, (m.get(k) || 0) + w * (1 - a));
  const r = [...m.entries()].filter(e => e[1] > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4), s = r.reduce((t, e) => t + e[1], 0) || 1;
  const out = r.map(([k, w]) => [Math.max(0, GEAR.names.indexOf(side < 0 ? k.replace('_L_', '_R_') : k)), w / s]); while (out.length < 4) out.push([out[0] ? out[0][0] : 0, 0]);
  return out;
}
const profAt = (pr, h) => { if (h <= pr[0][0]) return pr[0][1]; for (let i = 1; i < pr.length; i++) if (h < pr[i][0]) return lerp(pr[i - 1][1], pr[i][1], sstep(pr[i - 1][0], pr[i][0], h)); return pr[pr.length - 1][1]; };
// a ring of the body's outline seen from (cx, cy): for every direction the farthest body point of the slab
function envRing(P, S, cx, cy, ang, w) {
  const A = [], Rr = []; for (const i of S) { A.push(Math.atan2(cy - P[i + 1], cx - P[i])); Rr.push(Math.hypot(cx - P[i], cy - P[i + 1])); }
  return ang.map(a => { let m = 0; for (let q = 0; q < A.length; q++) { let d = Math.abs(A[q] - a) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; if (d < w && Rr[q] > m) m = Rr[q]; } return m; });
}
function pantsGeo(F, cut) {
  const key = 'pg_' + cut; if (GEAR[key]) return GEAR[key];
  const C = PANT_CUTS[cut], { P, z0 } = bodyEnv(F), N = 20, jF = 3, jB = N - 3, top = GEAR.top + 1.6, TAU = Math.PI * 2;
  let cb = 1e9; for (let i = 0; i < P.length; i += 5) if (!P[i + 3] && P[i] < 2.5 && P[i + 2] > 60) cb = Math.min(cb, P[i + 2]);   // the body's crotch
  const crotch = cb - 3.5;   // loose trousers: theirs hangs a little lower
  const hs = []; for (let h = C.hem; h < top - 0.8;) { hs.push(h); h += h < C.hem + 6 ? 1.6 : Math.abs(h - 49) < 10 ? 2.4 : h > top - 7 ? 1.5 : 3.2; } hs.push(top, top);   // (the last ring is a lip turned in under the waistband)
  const slab = (z, dz, f) => { const S = []; for (let i = 0; i < P.length; i += 5) if (Math.abs(P[i + 2] - z) < dz && (!f || f(i))) S.push(i); return S; };
  const rings = hs.map((h, k) => { const S = slab(Math.max(h, 12), 2.6); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, yF = 1e9, yB = -1e9;
    for (const i of S) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); if (P[i] < 3) { yF = Math.min(yF, P[i + 1]); yB = Math.max(yB, P[i + 1]); } }
    if (yF > yB) { yF = y0; yB = y1; }
    return { h, lip: k === hs.length - 1, S, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, yF, yB }; });
  for (let it = 0; it < 2; it++) for (const f of ['cx', 'cy', 'yF', 'yB']) { const v = rings.map(r => r[f]); for (let k = 1; k < rings.length - 2; k++) rings[k][f] = (v[k - 1] + 2 * v[k] + v[k + 1]) / 4; }
  { const a = rings[rings.length - 2], b = rings[rings.length - 1]; for (const f of ['cx', 'cy', 'yF', 'yB']) b[f] = a[f]; }
  const legW = h => envWeights(F, P, slab(clamp(h, 11, cb + 5), 2.6, i => P[i + 3]), /Foot|Toe/), trunkW = h => envWeights(F, P, slab(Math.max(h, cb + 2.5), 3, i => !P[i + 3]));
  const nv = rings.length * (N + 1), pos = new Float32Array(nv * 6), nrm = new Float32Array(nv * 6), uv = new Float32Array(nv * 4), si = new Uint16Array(nv * 8), sw = new Float32Array(nv * 8), hem = new Float32Array(nv * 4), idx = [];
  rings.forEach((r, k) => {
    const h = r.h, t = sstep(crotch - 5, crotch + 3, h), gap = lerp(0.35, 0, t);
    const cl = r.lip ? -0.9 : lerp(lerp(1.0, 1.7, sstep(crotch - 10, crotch + 6, h)), 0.55, sstep(top - 9, top - 3.5, h));
    const cx = r.cx, cy = r.cy - C.fwd * sstep(C.hem + 10, C.hem, h), a0 = TAU * jF / N;
    const aF = lerp(a0, Math.atan2(cy - (r.yF - cl * 0.9), cx - gap), t), aB = lerp(a0, Math.atan2(r.yB + cl * 0.9 - cy, cx - gap), t);
    const ang = []; for (let j = 0; j < N; j++) ang.push(j <= jF ? aF * j / jF : j >= jB ? TAU - aB * (N - j) / jF : lerp(aF, TAU - aB, (j - jF) / (jB - jF)));
    const env = envRing(P, r.S, r.cx, r.cy, ang, TAU / N * 0.9), pf = r.lip ? 0 : profAt(C.prof, h) * (1 - sstep(crotch + 2, crotch + 14, h));
    let rad = env.map(e => Math.max(pf, e + cl)); rad = rad.map((x, j) => (rad[(j + N - 1) % N] + 2 * x + rad[(j + 1) % N]) / 4);
    const lw = legW(h), tw = trunkW(h), wT = 1 - sstep(crotch - 1, crotch + 17, h);
    for (let j = 0; j <= N; j++) {
      const q = j % N, a = ang[q], ca = Math.cos(a), pl = ca > 1e-3 ? (cx - gap) / ca : 1e9, inner = q <= jF || q >= jB;
      let rr2 = Math.min(rad[q], pl); if (inner) rr2 = lerp(rr2, Math.min(pl, 40), t);
      const x = cx - rr2 * ca, y = cy - rr2 * Math.sin(a), lat = inner ? 0 : sstep(0, 1, Math.min(q - jF, jB - q) / 4), W = lerp(1, lat, sstep(crotch - 11, crotch - 2, h)) * wT;   // (the inner wall goes over to the pelvis well below the crotch: a gusset, not a slit, when the legs spread)
      for (let s = 0; s < 2; s++) { const v = (s * rings.length + k) * (N + 1) + j, sd = s ? -1 : 1, w4 = mixWeights(lw, tw, W, sd);
        pos[v * 3] = sd * x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = h + z0; uv[v * 2] = j / N; uv[v * 2 + 1] = (h - C.hem) / (top - C.hem);
        for (let c = 0; c < 4; c++) { si[v * 4 + c] = w4[c][0]; sw[v * 4 + c] = w4[c][1]; }
        hem[v * 2] = Math.pow(sstep(C.hem + C.swayH, C.hem, h), 1.5); hem[v * 2 + 1] = sd; }
    }
    if (k < rings.length - 1) for (let s = 0; s < 2; s++) for (let j = 0; j < N; j++) { const a = (s * rings.length + k) * (N + 1) + j, b = a + 1, c = a + N + 1, d = c + 1; if (s) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  { const nm = geo.attributes.normal.array;   // the u seam and the midline, where the two tubes meet, must shade as one surface
    for (let s = 0; s < 2; s++) rings.forEach((r, k) => { const b = (s * rings.length + k) * (N + 1), t = sstep(crotch - 2, crotch + 3, r.h);
      for (let c = 0; c < 3; c++) nm[b * 3 + c] = nm[(b + N) * 3 + c] = nm[b * 3 + c] + nm[(b + N) * 3 + c];
      for (const j of [jF, jB]) nm[(b + j) * 3] *= 1 - t; });
    geo.normalizeNormals(); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); geo.setAttribute('aHem', new THREE.BufferAttribute(hem, 2));
  geo.userData = { top, crotch, hem: C.hem };
  return GEAR[key] = geo;
}
// grey height canvas → tangent-space normal map (u wraps)
function heightToNormal(c, k) {
  const w = c.width, h = c.height, src = c.getContext('2d').getImageData(0, 0, w, h).data, o = document.createElement('canvas'); o.width = w; o.height = h;
  const g = o.getContext('2d'), img = g.createImageData(w, h), d = img.data, H = (x, y) => src[(Math.min(h - 1, Math.max(0, y)) * w + (x + w) % w) * 4];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const nx = -(H(x + 1, y) - H(x - 1, y)) * k / 255, ny = (H(x, y + 1) - H(x, y - 1)) * k / 255, l = 1 / Math.hypot(nx, ny, 1), q = (y * w + x) * 4;
    d[q] = (nx * l * 0.5 + 0.5) * 255; d[q + 1] = (ny * l * 0.5 + 0.5) * 255; d[q + 2] = (l * 0.5 + 0.5) * 255; d[q + 3] = 255; }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(o); t.anisotropy = 4; return t;
}
// colour and normal map of a pair of trousers. u: 0 inseam · 0.15 fly (front midline) · 0.25 front of the leg · 0.5 outseam · 0.75 back · 0.85 seat seam; v: hem → waist
function pantsTex(b, geo) {
  const C = PANT_CUTS[b.cut], { top, crotch } = geo.userData, W = 512, H = 1024, X = u => u * W, Y = h => (1 - (h - C.hem) / (top - C.hem)) * H, cm = H / (top - C.hem), jeans = b.cut === 'jeans', sweat = b.cut === 'sweat', st = b.style;
  const path = (g, pts) => { g.beginPath(); pts.forEach(([u, h], i) => i ? g.lineTo(X(u), Y(h)) : g.moveTo(X(u), Y(h))); };
  const map = GEAR['pt_' + b.id] || (GEAR['pt_' + b.id] = canvasTex(W, H, g => {
    const dark = new THREE.Color(b.c).getHSL({}).l < 0.2, thr = jeans ? (dark ? '#6a6b72' : '#c9973f') : dark ? '#3a3b42' : 'rgba(0,0,0,0.45)';
    const stitch = (pts, c) => { g.setLineDash([5, 3.5]); g.strokeStyle = c || thr; g.lineWidth = 1.6; path(g, pts); g.stroke(); g.setLineDash([]); };
    const line = (pts, c, w) => { g.strokeStyle = c; g.lineWidth = w; path(g, pts); g.stroke(); };
    const box = (u0, h1, u1, h0, c) => { g.fillStyle = c; g.fillRect(X(u0), Y(h1), X(u1) - X(u0), Y(h0) - Y(h1)); };
    const fade = (u, h, ru, rh, a, c) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, `rgba(${c || '255,255,255'},${a})`); gr.addColorStop(1, `rgba(${c || '255,255,255'},0)`); g.save(); g.translate(X(u), Y(h)); g.scale(ru * W, rh * cm); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); };
    g.fillStyle = b.c; g.fillRect(0, 0, W, H);
    if (jeans) for (let y = -W; y < H; y += 3) { g.strokeStyle = `rgba(${rr() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rr() * 0.035})`; g.lineWidth = 1.1; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + W); g.stroke(); }
    if (st === 'cargo') { g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; for (let x = 0; x < W; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
    if (st === 'bball') { g.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < H; y += 6) for (let x = (y / 6 % 2) * 3; x < W; x += 6) g.fillRect(x, y, 1.6, 1.6); }
    for (let i = 0; i < 14000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,255'},${rr() * (sweat ? 0.13 : 0.06)})`; g.fillRect(rr() * W, rr() * H, 1.6, 1.6); }
    if (jeans) {   // wear: thighs, knees, seat, calves; whiskers at the hips
      const k = b.worn ? 2.1 : dark ? 0.6 : 1;
      fade(0.27, 68, 0.14, 21, 0.15 * k); fade(0.25, 49, 0.11, 8.5, 0.2 * k); fade(0.72, 93, 0.13, 9, 0.14 * k); fade(0.75, 30, 0.1, 15, 0.07 * k); fade(0.5, 60, 0.03, 60, 0.12, '0,0,0'); fade(0.0, 55, 0.04, 50, 0.14, '0,0,0'); fade(1.0, 55, 0.04, 50, 0.14, '0,0,0');
      for (let i = 0; i < 7; i++) line([[0.165, crotch + 9 - i * 2.1], [0.27, crotch + 10.5 - i * 2.5], [0.36 + rr() * 0.06, crotch + 12.5 - i * 3]], `rgba(255,255,255,${0.09 * k})`, 2.5);
      if (b.worn) for (let i = 0; i < 26; i++) line([[0.2 + rr() * 0.1, 46 + rr() * 6], [0.21 + rr() * 0.1, 46 + rr() * 6]], 'rgba(255,255,255,0.25)', 1.2);
    }
    // seams
    line([[0.5, C.hem], [0.5, top]], 'rgba(0,0,0,0.3)', 2.5); if (!st || st === 'cargo') { stitch([[0.488, C.hem], [0.488, top - 4.2]]); if (jeans) stitch([[0.512, C.hem], [0.512, top - 4.2]]); }
    line([[0.002, C.hem], [0.002, crotch]], 'rgba(0,0,0,0.3)', 3); line([[0.998, C.hem], [0.998, crotch]], 'rgba(0,0,0,0.3)', 3);
    line([[0.15, crotch - 2], [0.15, top]], 'rgba(0,0,0,0.3)', 3); line([[0.85, crotch - 2], [0.85, top]], 'rgba(0,0,0,0.35)', 3.5);
    if (sweat || st === 'bball') {
      if (b.stripe) { if (st === 'bball') { box(0.44, top - 4.5, 0.56, C.hem, b.stripe); box(0.47, top - 4.5, 0.53, C.hem, b.c); box(0, C.hem + 2.6, 1, C.hem, b.stripe); } else for (const u of [0.462, 0.494, 0.526]) box(u, top - 4.5, u + 0.02, C.hem + (C.cuff || 0), b.stripe); }
      box(0, top, 1, top - 4.6, 'rgba(0,0,0,0.14)'); g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1.5; for (let x = 0; x < W; x += 5) { g.beginPath(); g.moveTo(x, Y(top)); g.lineTo(x, Y(top - 4.6)); g.stroke(); if (C.cuff) { g.beginPath(); g.moveTo(x, Y(C.hem + C.cuff)); g.lineTo(x, H); g.stroke(); } }
      line([[0, top - 4.6], [1, top - 4.6]], 'rgba(0,0,0,0.4)', 2); if (C.cuff) { box(0, C.hem + C.cuff, 1, C.hem, 'rgba(0,0,0,0.12)'); line([[0, C.hem + C.cuff], [1, C.hem + C.cuff]], 'rgba(0,0,0,0.4)', 2); }
      const cord = dark ? '#d9d6cf' : '#f1efe9'; line([[0.156, top - 2.3], [0.166, top - 8], [0.172, top - 14]], cord, 3.2); line([[0.158, top - 2.3], [0.185, top - 7], [0.2, top - 11.5]], cord, 3.2); g.fillStyle = cord; g.fillRect(X(0.172) - 3, Y(top - 14) - 2, 6, 8); g.fillRect(X(0.2) - 3, Y(top - 11.5) - 2, 6, 8);
      line([[0.37, top - 6.5], [0.46, top - 19]], 'rgba(0,0,0,0.5)', 3); stitch([[0.36, top - 7], [0.45, top - 19.5]]);
    } else {
      // waistband, belt loops, belt and its buckle, fly, front pockets, back yoke and pockets
      box(0, top, 1, top - 4.2, 'rgba(0,0,0,0.16)'); stitch([[0, top - 0.5], [1, top - 0.5]]); stitch([[0, top - 3.9], [1, top - 3.9]]); line([[0, top - 4.2], [1, top - 4.2]], 'rgba(0,0,0,0.4)', 1.5);
      box(0, top - 0.9, 1, top - 3.5, st === 'cargo' ? '#2a2a26' : '#231a12'); line([[0, top - 1.2], [1, top - 1.2]], 'rgba(255,255,255,0.14)', 1.5);
      for (const u of [0.25, 0.43, 0.6, 0.79]) { box(u, top + 0.1, u + 0.02, top - 4.5, b.c); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.strokeRect(X(u), Y(top + 0.1), 0.02 * W, 4.6 * cm); }
      g.strokeStyle = '#c4c4c8'; g.lineWidth = 3.5; g.strokeRect(X(0.152), Y(top - 0.5), 0.038 * W, 3.4 * cm); line([[0.15, top - 2.2], [0.19, top - 2.2]], '#c4c4c8', 2.5);
      stitch([[0.176, top - 4.2], [0.176, crotch + 9], [0.166, crotch + 5], [0.15, crotch + 3.5]]);
      for (const o of [0, 0.7]) stitch([[0.29, top - 4.2 - o], [0.3, top - 9 - o], [0.35, top - 12 - o], [0.5, top - 13.5 - o]]);
      g.fillStyle = '#b87333'; for (const [u, h] of [[0.292, top - 4.9], [0.49, top - 13.6]]) { g.beginPath(); g.arc(X(u), Y(h), 2.6, 0, 7); g.fill(); }
      for (const o of [0, 0.7]) stitch([[0.5, top - 8.5 - o], [0.85, top - 11.5 - o]]);
      const pk = [[0.6, top - 14], [0.79, top - 14], [0.785, top - 25], [0.695, top - 28], [0.605, top - 25], [0.6, top - 14]];
      g.fillStyle = 'rgba(0,0,0,0.07)'; path(g, pk); g.fill(); stitch(pk); stitch(pk.map(([u, h]) => [0.695 + (u - 0.695) * 0.93, top - 14.6 + (h - top + 14) * 0.95]));
      if (jeans) { stitch([[0.61, top - 18], [0.695, top - 21.5], [0.78, top - 18]]); stitch([[0.61, top - 19.3], [0.695, top - 22.8], [0.78, top - 19.3]]); }
      stitch([[0, C.hem + 1.7], [1, C.hem + 1.7]]); line([[0, C.hem + 2.1], [1, C.hem + 2.1]], 'rgba(0,0,0,0.3)', 1.5);
      if (st === 'cargo') { const a = C.hem + 5, t2 = C.hem + 22; box(0.39, t2, 0.61, a, 'rgba(0,0,0,0.08)'); stitch([[0.39, t2], [0.61, t2], [0.61, a], [0.39, a], [0.39, t2]]); box(0.385, t2 + 0.6, 0.615, t2 - 5, 'rgba(0,0,0,0.13)'); stitch([[0.385, t2 - 5], [0.615, t2 - 5]]);
        line([[0.5, t2 - 5], [0.5, a]], 'rgba(0,0,0,0.35)', 2); g.fillStyle = '#1c1c1a'; g.beginPath(); g.arc(X(0.5), Y(t2 - 3), 3.5, 0, 7); g.fill(); }
    }
  }));
  const nk = 'pn_' + b.cut + (st || ''), nmap = GEAR[nk] || (GEAR[nk] = (() => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); g.lineCap = 'round'; g.lineJoin = 'round';
    const ridge = (pts, w, a, dk) => { for (const f of [1, 0.6, 0.3]) { g.strokeStyle = `rgba(${dk ? '0,0,0' : '255,255,255'},${a})`; g.lineWidth = w * f; path(g, pts); g.stroke(); } };
    // an accordion fold around the leg: strongest at `u0`, wavy
    const fold = (h, a, u0, amp, w) => { const ph = rr() * 7, sl = (rr() - 0.5) * 3; for (let u = 0; u < 1; u += 0.04) { const k = u0 < 0 ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.cos((u - u0) * 6.283)), f = q => h + sl * Math.sin(q * 6.283) + amp * Math.sin(q * 25 + ph); ridge([[u, f(u)], [u + 0.045, f(u + 0.045)]], w, a * k); } };
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,255'},${rr() * 0.07})`; g.fillRect(rr() * W, rr() * H, 2, 2); }
    if (jeans) for (let y = -W; y < H; y += 4) { g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + W); g.stroke(); }
    for (let i = 0; i < 5; i++) { const u = 0.1 + rr() * 0.8, h0 = C.hem + 14 + rr() * 20; ridge([[u, h0], [u + (rr() - 0.5) * 0.08, h0 + 14], [u + (rr() - 0.5) * 0.12, Math.min(crotch - 6, h0 + 30)]], 26, 0.045); }   // long soft drapes
    if (C.hem < 30) {
      for (let i = 0; i < 8; i++) fold(49 + (i - 3.5) * 2.5 + rr(), jeans ? 0.085 : 0.07, 0.75, 0.6, jeans ? 9 : 13);   // the knee
      if (C.cuff) { for (let i = 0; i < 6; i++) fold(C.hem + C.cuff + 1.2 + i * 2.3, 0.13 - i * 0.012, -1, 0.5, 12); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; for (let x = 0; x < W; x += 5) { g.beginPath(); g.moveTo(x, Y(C.hem + C.cuff)); g.lineTo(x, H); g.stroke(); } ridge([[0, C.hem + C.cuff], [1, C.hem + C.cuff]], 6, 0.3, 1); }
      else { for (let i = 0; i < 6; i++) fold(C.hem + 3.4 + i * 2.6, 0.12 - i * 0.013, -1, 0.5, 10); ridge([[0, C.hem + 1.9], [1, C.hem + 1.9]], 5, 0.25, 1); }   // the trouser leg stacks on the shoe
    } else { for (let i = 0; i < 3; i++) fold(C.hem + 4 + i * 4, 0.05, 0.75, 0.8, 16); ridge([[0, C.hem + 2], [1, C.hem + 2]], 5, 0.25, 1); }
    for (let i = 0; i < 6; i++) { ridge([[0.16, crotch + 8 - i * 2.2], [0.27, crotch + 9.5 - i * 2.6], [0.38 + rr() * 0.05, crotch + 12 - i * 3.1]], 10, 0.075); ridge([[0.84, crotch + 2 - i * 2.4], [0.74, crotch - 0.5 - i * 2.5], [0.62, crotch + 1.5 - i * 2.4]], 12, 0.06); }   // whiskers from the fly, folds under the seat
    ridge([[0.5, C.hem], [0.5, top]], 6, 0.2); ridge([[0.15, crotch], [0.15, top]], 5, 0.18, 1); ridge([[0.85, crotch], [0.85, top]], 6, 0.2, 1);
    if (sweat || st === 'bball') { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; for (let x = 0; x < W; x += 5) { g.beginPath(); g.moveTo(x, Y(top)); g.lineTo(x, Y(top - 4.6)); g.stroke(); } ridge([[0, top - 4.6], [1, top - 4.6]], 6, 0.3, 1); for (let i = 0; i < 3; i++) fold(top - 6.5 - i * 2.2, 0.05, -1, 0.5, 9); ridge([[0.37, top - 6.5], [0.46, top - 19]], 6, 0.3, 1); }
    else { ridge([[0, top - 2.2], [1, top - 2.2]], 2.6 * cm, 0.16); ridge([[0, top - 4.3], [1, top - 4.3]], 4, 0.3, 1); for (const o of [0, 0.7]) ridge([[0.29, top - 4.2 - o], [0.3, top - 9 - o], [0.35, top - 12 - o], [0.5, top - 13.5 - o]], 3, 0.2, 1);
      ridge([[0.6, top - 14], [0.79, top - 14], [0.785, top - 25], [0.695, top - 28], [0.605, top - 25], [0.6, top - 14]], 4, 0.2, 1); ridge([[0.5, top - 8.8], [0.85, top - 11.8]], 4, 0.2, 1);
      if (st === 'cargo') { const a = C.hem + 5, t2 = C.hem + 22; g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(X(0.39), Y(t2), 0.22 * W, (t2 - a) * cm); ridge([[0.39, t2], [0.61, t2], [0.61, a], [0.39, a], [0.39, t2]], 5, 0.25, 1); ridge([[0.385, t2 - 5], [0.615, t2 - 5]], 5, 0.3, 1); } }
    return heightToNormal(c, jeans ? 5 : 6);
  })());
  return { map, nmap };
}
function pantsMesh(F, b) {
  const geo = pantsGeo(F, b.cut), { map, nmap } = pantsTex(b, geo), jeans = b.cut === 'jeans', shiny = b.style === 'bball';
  const mat = new THREE.MeshPhysicalMaterial({ map, normalMap: nmap, normalScale: new THREE.Vector2(jeans ? 0.6 : 0.9, jeans ? 0.6 : 0.9), roughness: shiny ? 0.55 : jeans ? 0.82 : 0.93, sheen: shiny ? 0.6 : 0.3, sheenRoughness: shiny ? 0.4 : 0.8, sheenColor: new THREE.Color(b.c).multiplyScalar(1.4), side: THREE.DoubleSide, envMapIntensity: 0.5 });
  const U = { uHemL: { value: new V3() }, uHemR: { value: new V3() } };
  mat.onBeforeCompile = s => { Object.assign(s.uniforms, U);
    s.vertexShader = 'attribute vec2 aHem; uniform vec3 uHemL; uniform vec3 uHemR;\n' + s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += aHem.x * ( aHem.y > 0.0 ? uHemL : uHemR );'); };
  mat.customProgramCacheKey = () => 'pants';
  const m = new THREE.SkinnedMesh(geo, mat); m.bind(F.body.skeleton, F.body.bindMatrix); m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
  F.body.parent.add(m); m.position.copy(F.body.position); m.quaternion.copy(F.body.quaternion); m.scale.copy(F.body.scale);
  m.userData = { U, sway: PANT_CUTS[b.cut].sway };
  return m;
}
// the hems lag behind the ankles on a damped spring (the whole "cloth simulation" of the trousers)
function pantsTick(F, m, dt) {
  const st = F.gear.hem || (F.gear.hem = [new V3(), new V3(), new V3(), new V3()]), inv = _m1.copy(m.matrixWorld).invert(), h = Math.min(dt || 0, 1 / 30);
  for (let s = 0; s < 2; s++) {
    const tgt = F.bpos(s ? 'CC_Base_R_Foot' : 'CC_Base_L_Foot', _v1), p = st[s * 2], v = st[s * 2 + 1];
    if (!(h > 0) || p.distanceToSquared(tgt) > 0.04) { if (!(h > 0) && p.lengthSq() > 0) { /* paused: keep */ } else { p.copy(tgt); v.set(0, 0, 0); } }
    else { v.addScaledVector(_v2.copy(tgt).sub(p), 240 * h).multiplyScalar(Math.exp(-8 * h)); p.addScaledVector(v, h); }
    const d = _v2.copy(p).sub(tgt); d.y *= 0.3; d.multiplyScalar(m.userData.sway * 0.04 / Math.hypot(0.04, d.length()));
    const a = _v3.copy(tgt).applyMatrix4(inv); (s ? m.userData.U.uHemR : m.userData.U.uHemL).value.copy(d.add(tgt).applyMatrix4(inv).sub(a));
  }
}

/* shoes: a lofted foot (flat sole, rounded upper, heel → toe) plus a collar tube around the ankle, one skinned mesh for both feet.
   UV: upper half of the texture = the foot (u heel → toe, v around: sole · outer side · laces · inner side · sole), lower half = the collar. */
function shoeGeo(F, top) {
  const key = 'sg_' + top; if (GEAR[key]) return GEAR[key];
  const { P, z0 } = bodyEnv(F), NS = 15, NR = 16, NA = 14, TAU = Math.PI * 2;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; const foot = [];
  for (let i = 0; i < P.length; i += 5) if (P[i + 3] && P[i + 2] < 6) { foot.push(i); x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
  const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2 + 0.45, yH = y1 + 0.9, L = yH - (y0 - 1.1), tb = Math.min(top, 7.2);
  const hz = []; for (let h = 3.2; h < top - 0.5; h += 2.1) hz.push(h); hz.push(top, top);
  const nv = (NS * (NR + 1) + hz.length * (NA + 1)), pos = new Float32Array(nv * 6), uv = new Float32Array(nv * 4), si = new Uint16Array(nv * 8), sw = new Float32Array(nv * 8), idx = [];
  const put = (v, sd, x, y, z, u, w, w4) => { const q = v + (sd < 0 ? nv : 0); pos[q * 3] = sd * x; pos[q * 3 + 1] = y; pos[q * 3 + 2] = z + z0; uv[q * 2] = u; uv[q * 2 + 1] = w; for (let c = 0; c < 4; c++) { si[q * 4 + c] = w4[c][0]; sw[q * 4 + c] = w4[c][1]; } };
  const quad = (a, n1) => { const b = a + 1, c = a + n1, d = c + 1; idx.push(a, b, c, b, d, c, a + nv, c + nv, b + nv, b + nv, c + nv, d + nv); };
  const none = new Map(), fk = [0, 0.45, 0.8, 0.96, 1];
  for (let i = 0; i < NS; i++) {
    const s = 0.5 - 0.5 * Math.cos(Math.PI * i / (NS - 1)), E = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(2 * s - 1), 5))), y = yH - s * L;
    const w = hw * (0.76 + 0.24 * sstep(0.05, 0.6, s)) * Math.pow(E, 0.8), t = Math.max(2.7, lerp(tb, 4.7, sstep(0.2, 0.7, s)) * (0.45 + 0.55 * E)), so = 0.35 * E, tip = E < 1e-3;
    const ids = foot.filter(q => Math.abs(P[q + 1] - y) < 2.2), wm = envWeights(F, P, ids.length ? ids : foot.filter(q => Math.abs(P[q + 1] - y) < 5));
    const half = [[0, 0], [0.75 * w, 0], [w + so, 0.3], [w + so, 1.9], [w, 2.3], [0.96 * w, 2.3 + (t - 2.3) * fk[1]], [0.78 * w, 2.3 + (t - 2.3) * fk[2]], [0.4 * w, 2.3 + (t - 2.3) * fk[3]], [0, t]];
    for (let k = 0; k <= NR; k++) { const [px, pz] = k <= 8 ? half[k] : [-half[NR - k][0], half[NR - k][1]];
      for (const sd of [1, -1]) put(i * (NR + 1) + k, sd, tip ? cx : cx + px, y, tip ? 1.6 : pz, s, 0.5 + 0.5 * k / NR, mixWeights(wm, none, 1, sd)); }
    if (i < NS - 1) for (let k = 0; k < NR; k++) quad(i * (NR + 1) + k, NR + 1);
  }
  const base = NS * (NR + 1);
  hz.forEach((h, k) => {
    const lip = k === hz.length - 1, S = []; for (let i = 0; i < P.length; i += 5) if (P[i + 3] && Math.abs(P[i + 2] - Math.max(h, 10.5)) < 2.2) S.push(i);
    let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const i of S) { a0 = Math.min(a0, P[i]); a1 = Math.max(a1, P[i]); b0 = Math.min(b0, P[i + 1]); b1 = Math.max(b1, P[i + 1]); }
    const ccx = (a0 + a1) / 2, ccy = (b0 + b1) / 2, ang = []; for (let j = 0; j < NA; j++) ang.push(TAU * j / NA);
    const env = envRing(P, S, ccx, ccy, ang, TAU / NA), wm = envWeights(F, P, P.reduce ? (() => { const r = []; for (let i = 0; i < P.length; i += 5) if (P[i + 3] && Math.abs(P[i + 2] - Math.max(h, 7)) < 2.2) r.push(i); return r; })() : S);
    for (let j = 0; j <= NA; j++) { const q = j % NA, r = env[q] + (lip ? -0.8 : 0.75 + 0.5 * sstep(8, 3, h));
      for (const sd of [1, -1]) put(base + k * (NA + 1) + j, sd, ccx - r * Math.cos(ang[q]), ccy - r * Math.sin(ang[q]), h, j / NA, 0.5 * (h - 3.2) / (top - 3.2), mixWeights(wm, none, 1, sd)); }
    if (k < hz.length - 1) for (let j = 0; j < NA; j++) quad(base + k * (NA + 1) + j, NA + 1);
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  { const nm = geo.attributes.normal.array, join = (a, b) => { for (let c = 0; c < 3; c++) nm[a * 3 + c] = nm[b * 3 + c] = nm[a * 3 + c] + nm[b * 3 + c]; };
    for (const o of [0, nv]) { for (let i = 0; i < NS; i++) join(o + i * (NR + 1), o + i * (NR + 1) + NR); for (let k = 0; k < hz.length; k++) join(o + base + k * (NA + 1), o + base + k * (NA + 1) + NA); }
    geo.normalizeNormals(); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return GEAR[key] = geo;
}
function shoeTex(f) {
  return GEAR['st_' + f.id] || (GEAR['st_' + f.id] = canvasTex(512, 512, (g, W) => {
    const lace = f.lace || '#f2f0ea', sole = f.sole, dk = 'rgba(0,0,0,0.35)';
    g.fillStyle = f.c; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,255'},${rr() * (f.canvas ? 0.09 : 0.04)})`; g.fillRect(rr() * W, rr() * W, 1.6, 1.6); }
    // the foot: y 0…256 (sole · inner side · top 128 · outer side · sole)
    g.fillStyle = sole; g.fillRect(0, 0, W, 60); g.fillRect(0, 196, W, 60); g.fillStyle = dk; g.fillRect(0, 59, W, 2); g.fillRect(0, 195, W, 2);
    if (f.band) { g.fillStyle = f.band; g.fillRect(0, 50, W, 3); g.fillRect(0, 203, W, 3); }
    if (f.cap) { g.fillStyle = f.cap; g.fillRect(415, 60, 97, 136); g.strokeStyle = dk; g.lineWidth = 2; g.beginPath(); g.moveTo(415, 60); g.lineTo(415, 196); g.stroke(); for (let x = 428; x < 500; x += 9) { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.moveTo(x, 62); g.lineTo(x, 194); g.stroke(); } }
    else { g.strokeStyle = dk; g.lineWidth = 2; g.beginPath(); g.moveTo(400, 62); g.quadraticCurveTo(372, 128, 400, 194); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(120, 113, 230, 30);   // tongue
    g.strokeStyle = lace; g.lineWidth = 4; g.lineCap = 'round'; for (let x = 132; x < 340; x += 26) { g.beginPath(); g.moveTo(x, 111); g.lineTo(x + 26, 145); g.moveTo(x, 145); g.lineTo(x + 26, 111); g.stroke(); }
    g.fillStyle = '#c9c9cd'; for (let x = 132; x <= 366; x += 26) for (const y of [110, 146]) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
    if (f.stripe) { g.strokeStyle = f.stripe; g.lineWidth = 7; for (const [ya, yb] of [[176, 150], [80, 106]]) for (const o of [0, 22]) { g.beginPath(); g.moveTo(150 + o, ya); g.lineTo(196 + o, yb); g.stroke(); } }
    g.fillStyle = f.tab || 'rgba(0,0,0,0.25)'; g.fillRect(0, 62, 56, 132);
    // the collar: y 256…512, front of the ankle at x 128, back at 384
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(104, 256, 48, 256);
    g.strokeStyle = lace; g.lineWidth = 4; for (let y = 268; y < 512; y += 30) { g.beginPath(); g.moveTo(108, y); g.lineTo(148, y + 30); g.moveTo(148, y); g.lineTo(108, y + 30); g.stroke(); }
    g.fillStyle = '#c9c9cd'; for (let y = 268; y < 512; y += 30) for (const x of [107, 149]) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
    g.fillStyle = f.tab || 'rgba(0,0,0,0.25)'; g.fillRect(366, 256, 36, 256); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 256, W, 9);
    if (f.patch) for (const x of [0, W]) { g.fillStyle = f.patch; g.beginPath(); g.arc(x, 330, 26, 0, 7); g.fill(); g.strokeStyle = f.c; g.lineWidth = 3; g.beginPath(); g.arc(x, 330, 19, 0, 7); g.stroke(); }
    if (f.boot) { g.fillStyle = f.boot; g.fillRect(236, 256, 40, 256); }
  }));
}
function shoeMesh(F, f) {
  const mat = new THREE.MeshPhysicalMaterial({ map: shoeTex(f), roughness: f.canvas ? 0.9 : 0.55, clearcoat: f.canvas ? 0 : 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.5 });
  const m = new THREE.SkinnedMesh(shoeGeo(F, f.top), mat); m.bind(F.body.skeleton, F.body.bindMatrix); m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
  F.body.parent.add(m); m.position.copy(F.body.position); m.quaternion.copy(F.body.quaternion); m.scale.copy(F.body.scale);
  return m;
}
// a random street outfit (underground fights): the hook for rollOpponent / career opponents; r = a random source
function streetLook(r = rr) {
  const pick = a => a[(r() * a.length) | 0];
  return { street: true, bottom: pick(['jeans', 'jeans', 'jeansB', 'jeansL', 'sweatG', 'pants', 'sweatS', 'cargo', 'bball']), top: pick(['none', 'none', 'none', 'tank', 'tankB', 'teeW', 'teeB', 'teeG', 'hoodie']), shoes: pick(['none', 'sneak', 'sneak', 'sneakB', 'keds', 'keds']) };
}
const isStreet = () => G.mode !== 'spar' && G.mode !== 'bag' && !!G.loc && G.loc !== 'gym';   // a street fight = any location but the gym
