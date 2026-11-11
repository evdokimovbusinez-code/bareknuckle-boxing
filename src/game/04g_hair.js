/* ───────── hair styles and beards ─────────
   A style = scalp shading (uniforms of the head shader: uHS, uRows, uGloss) + a rigid mesh on the head (cards / coil clumps / tubes,
   one geometry per style shared by both men, one draw call) + for the long ones strands simulated with the same PS solver as the
   original cut (cards → renderHair, ropes → renderTubes). Everything is built on first use and cached. */
const HAIR_STYLES = [
  { id: 'bald', label: 'лысый', amt: [0.05, 0.05], gloss: 1 },
  { id: 'buzz', label: 'под машинку', amt: [0.8, 0.8], rigid: 1 },
  { id: 'crew', label: 'полубокс', amt: [0.72, 1], fade: 0.4, rigid: 1 },
  { id: 'classic', label: 'классика', amt: [1, 1] },                                  // the original cut (its own strands + base layer)
  { id: 'slick', label: 'зачёс назад', amt: [1, 1], rigid: 1, rough: 0.34 },
  { id: 'coils', label: 'короткие кудри', amt: [1, 1], rigid: 1, rough: 0.8 },
  { id: 'curly', label: 'кудри', amt: [0.75, 1], fade: 0.3, rigid: 1, rough: 0.8 },
  { id: 'afro', label: 'афро', amt: [1, 1], rigid: 1, big: 1, rough: 0.85 },
  { id: 'twists', label: 'твисты', amt: [0.9, 0.9], rigid: 1, big: 1, rough: 0.75 },
  { id: 'dreads', label: 'дреды', amt: [0.9, 0.9], sim: 1, big: 1, rough: 0.8 },
  { id: 'rows', label: 'косички', amt: [1, 1], rows: 11, rigid: 1, rough: 0.7 },
  { id: 'bun', label: 'пучок', amt: [0.72, 1], fade: 0.25, rigid: 1, big: 1 },
  { id: 'pony', label: 'хвост', amt: [1, 1], rigid: 1, sim: 1, big: 1 },
  { id: 'mohawk', label: 'ирокез', amt: [0.22, 1], strip: 0.2, rigid: 1, big: 1 },
  { id: 'mullet', label: 'маллет', amt: [1, 1], rigid: 1, sim: 1 },
];
const BEARD_STYLES = [
  { id: 'none', label: 'нет', k: 0, u: [0.3, 0.3] },
  { id: 'stubble', label: 'щетина', k: 1, u: [1.7, 1.7] },
  { id: 'boxed', label: 'короткая', k: 1, u: [1, 1], geo: 1 },                       // the original beard
  { id: 'full', label: 'длинная', k: 1, u: [1.6, 1.6], geo: 1 },
  { id: 'goatee', label: 'эспаньолка', k: 2, u: [2.6, 0.3], geo: 1 },
  { id: 'stache', label: 'усы', k: 3, u: [2.6, 0.3], geo: 1 },
  { id: 'strap', label: 'шкиперская', k: 4, u: [2.6, 0.3], geo: 1 },
];
const hairStyleOf = L => HAIR_STYLES.find(s => s.id === (L.hair === 'bald' ? 'bald' : L.hairStyle || 'classic')) || HAIR_STYLES[3];
const beardStyleOf = L => BEARD_STYLES.find(s => s.id === (typeof L.beard === 'string' ? L.beard : L.beard ? 'boxed' : 'none')) || BEARD_STYLES[0];
const hairColOf = id => (HAIR_LOOKS.find(x => x.id === id) || HAIR_LOOKS[id === 'bald' ? 0 : 2]).c;
const ROW_DPHI = 15 * Math.PI / 180, ROW_Y0 = 0.2;   // cornrows: planes through an axis parallel to z, 15° apart (the same numbers in the head shader)

// own generator: the builds are lazy, they must not disturb the shared rnd() sequence
let _hSeed = 1234567;
const hr = () => { _hSeed = (_hSeed * 1664525 + 1013904223) >>> 0; return _hSeed / 4294967296; };
// height above the hairline on the unit head (0 at the line, ≈1.4 on the crown) — the line of hairMask()
const hairEdge = d => d.y - (-0.40 + 0.88 * sstep(-0.2, 0.9, d.z) + 0.34 * clamp((Math.abs(d.x) - 0.6) / 0.4, 0, 1) * (1 - sstep(0.3, 0.8, d.z)));
const headDir = (p, out) => out.set((p.x - HEAD.C.x) / HEAD.R.x, (p.y - HEAD.C.y) / HEAD.R.y, (p.z - HEAD.C.z) / HEAD.R.z).normalize();
// the scalp under a direction of the unit head: a blend of the nearest roots
function scalpAt(d) {
  const best = [];
  for (const r of HEAD.hairRoots) { const q = r.d.distanceToSquared(d); if (best.length < 6 || q < best[5].q) { best.push({ q, r }); best.sort((a, b) => a.q - b.q); if (best.length > 6) best.pop(); } }
  const p = new V3(), n = new V3(); let ws = 0;
  for (const b of best) { const w = 1 / (b.q + 1e-4); p.addScaledVector(b.r.p, w); n.addScaledVector(b.r.n, w); ws += w; }
  return { p: p.multiplyScalar(1 / ws), n: n.normalize(), d: d.clone() };
}
// roots no closer than `min` to each other
function hSparse(roots, min) {
  const out = [], m2 = min * min, idx = roots.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = (hr() * (i + 1)) | 0, t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  for (const i of idx) { const r = roots[i]; let ok = true; for (const o of out) if (o.p.distanceToSquared(r.p) < m2) { ok = false; break; } if (ok) out.push(r); }
  return out;
}
// more roots: copies moved a few millimetres along the skin
function hDense(roots, times, jit) {
  const out = [], t = new V3();
  for (const r of roots) { out.push(r); for (let k = 1; k < times; k++) { t.set(hr() - 0.5, hr() - 0.5, hr() - 0.5).cross(r.n).multiplyScalar(2 * jit); const p = r.p.clone().add(t); out.push({ p, n: r.n, d: headDir(p, new V3()) }); } }
  return out;
}
// a strand from a root: leaves along the normal, bends into `flow` (a vector or f(pos)), stays above the skull
function hTrace(r, L, np, flow, nK, bend, jit, pad0, padK) {
  const C = HEAD.C, R = HEAD.R, pts = [], fn = typeof flow === 'function', f0 = fn ? flow(r.p) : flow;
  const fs = Math.max(1, Math.hypot((r.p.x - C.x) / R.x, (r.p.y - C.y) / R.y, (r.p.z - C.z) / R.z));
  const dir = r.n.clone().multiplyScalar(nK).add(f0).normalize(), pos = r.p.clone().addScaledVector(r.n, -0.001), seg = L / (np - 1);
  const jx = (hr() - 0.5) * jit, jz = (hr() - 0.5) * jit;
  pts.push(pos.clone());
  for (let k = 1; k < np; k++) {
    dir.lerp(fn ? flow(pos) : flow, bend); dir.x += jx * 0.3 + (hr() - 0.5) * jit * 0.4; dir.z += jz * 0.3 + (hr() - 0.5) * jit * 0.4; dir.normalize();
    pos.addScaledVector(dir, seg);
    const pad = pad0 + k * padK, x = (pos.x - C.x) / (R.x * fs + pad), y = (pos.y - C.y) / (R.y * fs + pad), z = (pos.z - C.z) / (R.z * fs + pad), q = x * x + y * y + z * z;
    if (q < 1) { const m = 1 / Math.sqrt(q); pos.set(C.x + (pos.x - C.x) * m, C.y + (pos.y - C.y) * m, C.z + (pos.z - C.z) * m); }
    pts.push(pos.clone());
  }
  pts.fs = fs;
  return pts;
}

/* one texture for all the new styles, four columns: 0 straight strands (alpha) · 1 coil clumps, four tiles (alpha) · 2 twisted rope · 3 braid */
let _hAtlas = null;
function hairAtlas() {
  if (_hAtlas) return _hAtlas;
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d'), cw = 128;
  const grey = (s, a = 1) => `rgba(${s | 0},${s | 0},${s | 0},${a})`;
  // 0: strands, as the original card texture
  for (let i = 0; i < 170; i++) {
    const x = 5 + hr() * (cw - 10), len = 512 * (0.5 + hr() * 0.5), curl = (hr() - 0.5) * 12, sh = 150 + hr() * 105, gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, grey(sh)); gr.addColorStop(0.75, grey(sh, 0.95)); gr.addColorStop(1, grey(sh, 0));
    g.strokeStyle = gr; g.lineWidth = 0.6 + hr(); g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + curl, len * 0.35, x - curl, len * 0.7, x + curl * 0.5, len); g.stroke();
  }
  // 1: coil clumps — a ragged dark mass (so the card stays opaque in the far mips) with tight light and dark ringlets on it
  for (let t = 0; t < 4; t++) {
    const ox = cw, oy = t * 128; g.save(); g.beginPath(); g.rect(ox + 2, oy + 2, cw - 4, 124); g.clip();
    for (let i = 0; i < 46; i++) { const a = hr() * 6.283, rr = 34 * Math.sqrt(hr()); g.fillStyle = grey(95 + hr() * 40); g.beginPath(); g.arc(ox + 64 + Math.cos(a) * rr, oy + 64 + Math.sin(a) * rr, 9 + hr() * 13, 0, 6.283); g.fill(); }
    for (let i = 0; i < 150; i++) {
      const a = hr() * 6.283, rr = 46 * Math.sqrt(hr()), x = ox + 64 + Math.cos(a) * rr, y = oy + 64 + Math.sin(a) * rr, dark = hr() < 0.4;
      g.strokeStyle = grey(dark ? 40 + hr() * 40 : 165 + hr() * 90, 0.9); g.lineWidth = dark ? 2.4 : 1.5 + hr() * 0.8;
      g.beginPath(); g.arc(x, y, 3 + hr() * 4.5, hr() * 6.283, hr() * 6.283 + 3.6 + hr() * 2.4); g.stroke();
    }
    g.restore();
  }
  // 2: rope (dreadlocks, twists): matted strands winding round, a dark groove every half turn
  { const ox = 2 * cw; g.fillStyle = grey(150); g.fillRect(ox, 0, cw, 512);
    for (let y = -64; y < 560; y += 32) { g.strokeStyle = grey(52); g.lineWidth = 7; g.beginPath(); g.moveTo(ox - 4, y + 44); g.lineTo(ox + cw + 4, y); g.stroke(); g.strokeStyle = grey(225, 0.55); g.lineWidth = 4; g.beginPath(); g.moveTo(ox - 4, y + 60); g.lineTo(ox + cw + 4, y + 16); g.stroke(); }
    g.save(); g.beginPath(); g.rect(ox, 0, cw, 512); g.clip();
    for (let i = 0; i < 1500; i++) { const x = ox + hr() * cw, y = hr() * 512, l = 5 + hr() * 12; g.strokeStyle = grey(hr() < 0.5 ? 70 + hr() * 50 : 190 + hr() * 60, 0.5); g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y - l * 0.34 + (hr() - 0.5) * 4); g.stroke(); }
    g.restore(); }
  // 3: braid: plaits crossing in a herring-bone
  { const ox = 3 * cw; g.fillStyle = grey(60); g.fillRect(ox, 0, cw, 512);
    for (let y = -32, k = 0; y < 544; y += 16, k++) {
      const s = k & 1 ? 1 : -1, x0 = ox + 64 - s * 50, x1 = ox + 64 + s * 14;
      const gr = g.createLinearGradient(x0, y, x1, y + 26); gr.addColorStop(0, grey(120)); gr.addColorStop(0.5, grey(235)); gr.addColorStop(1, grey(110));
      g.strokeStyle = gr; g.lineWidth = 15; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo(ox + 64, y + 4, x1, y + 26); g.stroke();
      g.strokeStyle = grey(30, 0.6); g.lineWidth = 1; for (let q = -5; q <= 5; q += 2.5) { g.beginPath(); g.moveTo(x0, y + q); g.quadraticCurveTo(ox + 64, y + 4 + q, x1, y + 26 + q); g.stroke(); }
    } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return (_hAtlas = t);
}
function hairMat2() {
  const mat = new THREE.MeshPhysicalMaterial({ map: hairAtlas(), vertexColors: true, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.62, specularIntensity: 0.6, specularColor: new THREE.Color('#a89480'), envMapIntensity: 0.2 });
  mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', HAIR_NB); };
  mat.customProgramCacheKey = () => 'hair-cards';
  return mat;
}

/* geometry collector (head rest space, metres) */
class HairGeo {
  constructor() { this.P = []; this.N = []; this.UV = []; this.C = []; this.I = []; }
  get nv() { return this.P.length / 3; }
  vtx(p, n, u, v, c) { this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.UV.push(u, v); this.C.push(c, c, c); }
  // a card along a polyline; the normal looks away from the head centre; col = atlas column, or -1: the whole texture (beard cards)
  ribbon(pts, side, w0, w1, col, c0, c1) {
    const n = pts.length, b = this.nv, t = new V3(), s = new V3(), nn = new V3(), p = new V3(), u0 = col < 0 ? 0 : (col + 0.07) / 4, u1 = col < 0 ? 1 : (col + 0.93) / 4;
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1); t.copy(pts[Math.min(k + 1, n - 1)]).sub(pts[Math.max(k - 1, 0)]).normalize();
      s.copy(side).addScaledVector(t, -side.dot(t)).normalize().multiplyScalar(lerp(w0, w1, f) * 0.5);
      nn.copy(pts[k]).sub(HEAD.C).normalize(); const c = lerp(c0, c1, f);
      this.vtx(p.copy(pts[k]).sub(s), nn, u0, 1 - f, c); this.vtx(p.copy(pts[k]).add(s), nn, u1, 1 - f, c);
      if (k < n - 1) { const v = b + 2 * k; this.I.push(v, v + 2, v + 1, v + 1, v + 2, v + 3); }
    }
  }
  // a round rope along a polyline (m sides); `turns` texture periods per metre
  tube(pts, r0, r1, m, col, c0, c1, turns) {
    const n = pts.length, b = this.nv, t = new V3(), a = new V3(), bb = new V3(), nn = new V3(), p = new V3(); let len = 0;
    a.set(0.31, 0.87, 0.38);
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1); t.copy(pts[Math.min(k + 1, n - 1)]).sub(pts[Math.max(k - 1, 0)]).normalize(); if (k) len += pts[k].distanceTo(pts[k - 1]);
      a.addScaledVector(t, -a.dot(t)).normalize(); bb.crossVectors(t, a);
      const r = lerp(r0, r1, f), c = lerp(c0, c1, f), v = 1 - Math.min(len * turns, 15.9) / 16;
      for (let j = 0; j <= m; j++) { const an = j / m * 6.2832; nn.copy(a).multiplyScalar(Math.cos(an)).addScaledVector(bb, Math.sin(an)); this.vtx(p.copy(pts[k]).addScaledVector(nn, r), nn, (col + 0.04 + 0.92 * j / m) / 4, v, c); }
      if (k < n - 1) for (let j = 0; j < m; j++) { const v0 = b + k * (m + 1) + j, v1 = v0 + m + 1; this.I.push(v0, v1, v0 + 1, v0 + 1, v1, v1 + 1); }
    }
  }
  // a low ridge lying on the skin (cornrow): pts with their skin normals
  ridge(pts, nrm, w, h, col, turns) {
    const n = pts.length, b = this.nv, t = new V3(), s = new V3(), nn = new V3(), p = new V3(), X = [-1, -0.62, 0, 0.62, 1], Y = [-0.15, 0.72, 1, 0.72, -0.15]; let len = 0;
    for (let k = 0; k < n; k++) {
      t.copy(pts[Math.min(k + 1, n - 1)]).sub(pts[Math.max(k - 1, 0)]).normalize(); s.crossVectors(t, nrm[k]).normalize(); if (k) len += pts[k].distanceTo(pts[k - 1]);
      const e = Math.min(1, Math.min(k, n - 1 - k) / 2 + 0.35), v = 1 - (len * turns % 15.9) / 16;
      for (let j = 0; j < 5; j++) { nn.copy(nrm[k]).multiplyScalar(0.35 + Y[j]).addScaledVector(s, X[j] * 0.9).normalize(); this.vtx(p.copy(pts[k]).addScaledVector(s, X[j] * w * 0.5 * e).addScaledVector(nrm[k], Y[j] * h * e), nn, (col + 0.06 + 0.88 * j / 4) / 4, v, 0.75 + 0.3 * Y[j]); }
      if (k < n - 1) for (let j = 0; j < 4; j++) { const v0 = b + k * 5 + j, v1 = v0 + 5; this.I.push(v0, v0 + 1, v1, v0 + 1, v1 + 1, v1); }
    }
  }
  // a coil clump: a square card (tile of column 1) in the plane ax / ay
  clump(c, ax, ay, n, c0) {
    const b = this.nv, t = (hr() * 4) | 0, u0 = 1.03 / 4, u1 = 1.97 / 4, v1 = 1 - (t + 0.03) / 4, v0 = 1 - (t + 0.97) / 4, p = new V3();
    this.vtx(p.copy(c).sub(ax).sub(ay), n, u0, v0, c0); this.vtx(p.copy(c).add(ax).sub(ay), n, u1, v0, c0); this.vtx(p.copy(c).add(ax).add(ay), n, u1, v1, c0); this.vtx(p.copy(c).sub(ax).add(ay), n, u0, v1, c0);
    this.I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  build() {
    if (!this.nv) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setIndex(this.I);
    return g;
  }
}
const _hSide = new V3();
const hSideOf = (flow, n) => _hSide.crossVectors(flow, n).normalize().clone();
// short stubble-like cards standing on the scalp (buzz cut, faded sides): len(r) in metres, 0 = none
function hShort(G, roots, len, lean) {
  const pts = [new V3(), new V3()], s = new V3();
  for (const r of roots) {
    const L = len(r); if (L <= 0) continue;
    pts[0].copy(r.p).addScaledVector(r.n, -0.0008); pts[1].copy(r.n).multiplyScalar(1 - lean).add(s.set(0.1 * r.d.x + (hr() - 0.5) * 0.5, -0.5 * lean + (hr() - 0.5) * 0.3, -lean + (hr() - 0.5) * 0.5)).normalize().multiplyScalar(L).add(pts[0]);
    s.set(hr() - 0.5, hr() - 0.5, hr() - 0.5).cross(r.n).normalize();
    G.ribbon(pts, s, 0.0032, 0.0022, 0, 0.8 + hr() * 0.4, 1.1 + hr() * 0.4);
  }
}
// coil clumps filling the space between the scalp and an outer surface `h(r)` metres above it (round: an ellipsoid about the head)
function hBush(G, roots, h, size, round) {
  const C = HEAD.C, R = HEAD.R, Ca = new V3(C.x, C.y + 0.012, C.z - 0.008), d = new V3(), po = new V3(), c = new V3(), out = new V3(), q = new V3(), ax = new V3(), ay = new V3(), n = new V3();
  for (const r of roots) {
    const H = h(r); if (H <= 0) continue;
    d.set((r.p.x - Ca.x) / R.x, (r.p.y - Ca.y) / R.y, (r.p.z - Ca.z) / R.z).normalize();
    po.set(Ca.x + d.x * (R.x + H * round.x), Ca.y + d.y * (R.y + H * round.y), Ca.z + d.z * (R.z + H * round.z));
    out.copy(po).sub(r.p); const dist = out.length(); out.normalize(); if (out.dot(r.n) < 0.2) out.lerp(r.n, 0.6).normalize();
    const t = Math.pow(hr(), 0.45); c.copy(r.p).addScaledVector(out, Math.max(dist, H * 0.4) * (0.12 + 0.88 * t) - size * 0.25);
    q.set(hr() - 0.5, hr() - 0.5, hr() - 0.5).multiplyScalar(1.5).add(out).normalize();
    ax.set(hr() - 0.5, hr() - 0.5, hr() - 0.5).cross(q).normalize(); ay.crossVectors(q, ax);
    const s = size * (0.75 + hr() * 0.5); ax.multiplyScalar(s); ay.multiplyScalar(s);
    n.copy(c).sub(Ca).normalize().lerp(q, 0.25).normalize();
    G.clump(c, ax, ay, n, (0.34 + 0.8 * t * t) * (0.85 + hr() * 0.3));
  }
}
const HAIR_BACK = d => new V3(0.12 * d.x, -0.3 - 0.5 * sstep(0.3, -0.6, d.y), -1).normalize();

/* the rigid part of a style (null: none) */
function hairRigid(id) {
  const cache = T.hairGeoS || (T.hairGeoS = {}); if (id in cache) return cache[id];
  _hSeed = 977 + id.length * 7919 + id.charCodeAt(0) * 131;
  const G = new HairGeo(), roots = HEAD.hairRoots, C = HEAD.C, R = HEAD.R, v = new V3();
  if (id === 'buzz') hShort(G, hDense(roots, 2, 0.003), () => 0.0035 + hr() * 0.002, 0.1);
  else if (id === 'crew') {
    hShort(G, roots, r => r.d.y < 0.55 ? 0.0035 + hr() * 0.002 : 0, 0.1);
    for (const r of hDense(roots.filter(r => r.d.y > 0.3), 2, 0.003)) {
      const top = sstep(0.3, 0.7, r.d.y), L = lerp(0.005, 0.016 + hr() * 0.006, top), flow = v.set(0.1 * r.d.x, 0.25, 0.75).normalize();
      const pts = hTrace(r, L, 3, flow, 1.6, 0.3, 0.3, 0.002, 0.001);
      G.ribbon(pts, hSideOf(flow, r.n), 0.008, 0.004, 0, 0.7 + hr() * 0.3, 1.0 + hr() * 0.4);
    }
  } else if (id === 'slick') {
    for (const r of roots) {
      const flow = HAIR_BACK(r.d), L = 0.06 + hr() * 0.035 + 0.03 * sstep(0.2, 0.9, r.d.y) * sstep(-0.2, 0.7, r.d.z);
      const pts = hTrace(r, L, 5, flow, 0.1, 0.5, 0.06, 0.0025, 0.0011);
      G.ribbon(pts, hSideOf(flow, r.n), 0.015 * (0.8 + hr() * 0.5), 0.008, 0, 0.72 + hr() * 0.3, 1.05 + hr() * 0.35);
    }
  } else if (id === 'coils') hBush(G, roots, r => 0.016 * (0.5 + 0.5 * sstep(0.0, 0.3, hairEdge(r.d))), 0.011, new V3(1, 1, 1));
  else if (id === 'curly') {
    hShort(G, roots, r => r.d.y < 0.45 ? 0.004 + hr() * 0.003 : 0, 0.1);
    hBush(G, hDense(roots.filter(r => r.d.y > 0.2), 2, 0.004), r => 0.045 * sstep(0.2, 0.55, r.d.y) * (0.75 + 0.25 * sstep(-0.9, 0.6, r.d.z)), 0.017, new V3(0.6, 1, 1));
  } else if (id === 'afro') {
    hBush(G, hDense(roots, 2, 0.004), r => 0.085 * (0.42 + 0.58 * sstep(0.02, 0.5, hairEdge(r.d))), 0.024, new V3(1.05, 0.95, 1));
  } else if (id === 'twists') {
    for (const r of hSparse(roots, 0.0098)) {
      const L = 0.02 + hr() * 0.014, flow = v.set(r.d.x * 0.8 + (hr() - 0.5) * 0.5, -0.55 + 0.5 * r.d.y + (hr() - 0.5) * 0.4, r.d.z * 0.6 + (hr() - 0.5) * 0.5).normalize().clone();
      const pts = hTrace(r, L, 5, flow, 2.2, 0.3, 0.3, 0.003, 0.002);
      G.tube(pts, 0.0046, 0.0034, 5, 2, 0.6, 1.3, 110);
    }
  } else if (id === 'rows') {
    const d = new V3();
    for (let i = -5; i <= 5; i++) {
      const ph = i * ROW_DPHI, pts = [], nrm = []; let last = null;
      for (let k = 0; k <= 46; k++) {
        const th = 0.25 + (Math.PI - 0.5) * k / 46, z = Math.cos(th), q = 1 - z * z - ROW_Y0 * ROW_Y0 * Math.sin(ph) ** 2; if (q <= 0) continue;
        const rho = ROW_Y0 * Math.cos(ph) + Math.sqrt(q); d.set(rho * Math.sin(ph), rho * Math.cos(ph) - ROW_Y0, z).normalize();
        if (hairEdge(d) < 0.03) continue;
        const s = scalpAt(d); pts.push(s.p.addScaledVector(s.n, 0.0005)); nrm.push(s.n); last = s;
      }
      if (pts.length < 4) continue;
      G.ridge(pts, nrm, 0.0125, 0.0058, 3, 55);
      // the end of the braid hangs loose at the nape
      const a = pts[pts.length - 1], tail = [a.clone()], dir = a.clone().sub(pts[pts.length - 2]).normalize();
      for (let k = 1; k < 4; k++) { dir.lerp(v.set(0, -1, -0.15), 0.4).normalize(); tail.push(tail[k - 1].clone().addScaledVector(dir, 0.011)); }
      G.tube(tail, 0.004, 0.0024, 5, 3, 0.8, 1.1, 55);
    }
  } else if (id === 'bun' || id === 'pony') {
    const K = scalpAt(id === 'bun' ? new V3(0, 0.6, -0.8).normalize() : new V3(0, 0.22, -0.975).normalize());
    T.hairKnot = T.hairKnot || {}; T.hairKnot[id] = K;
    if (id === 'bun') hShort(G, roots, r => r.d.y < 0.4 ? 0.004 + hr() * 0.002 : 0, 0.1);
    for (const r of id === 'bun' ? hDense(roots.filter(r => r.d.y > 0.15), 2, 0.003) : roots) {
      const dist = r.p.distanceTo(K.p); if (dist < 0.012) continue;
      const flow = p => v.copy(K.p).sub(p).normalize(), L = Math.min(dist * 1.08, 0.085 + hr() * 0.04);
      const pts = hTrace(r, L, 5, flow, 0.1, 0.6, 0.04, 0.0022, 0.0009);
      G.ribbon(pts, hSideOf(flow(r.p), r.n), 0.014 * (0.8 + hr() * 0.5), 0.007, 0, 0.72 + hr() * 0.3, 1.05 + hr() * 0.3);
    }
    if (id === 'bun') {   // the knot: bands of hair wound round a ball
      const c = K.p.clone().addScaledVector(K.n, 0.024), rad = 0.027, ax = new V3(), u = new V3(), w = new V3();
      for (let i = 0; i < 26; i++) {
        ax.set(hr() - 0.5, hr() - 0.5, hr() - 0.5).normalize().lerp(K.n, 0.35 + hr() * 0.4).normalize(); u.set(hr() - 0.5, hr() - 0.5, hr() - 0.5).cross(ax).normalize(); w.crossVectors(ax, u);
        const pts = [], off = (hr() - 0.5) * 0.02, rr = Math.sqrt(Math.max(rad * rad - off * off, 1e-6)) * (0.92 + hr() * 0.14), a0 = hr() * 6.283, span = 3.6 + hr() * 2.4;
        for (let k = 0; k <= 9; k++) { const a = a0 + span * k / 9; pts.push(c.clone().addScaledVector(ax, off).addScaledVector(u, Math.cos(a) * rr).addScaledVector(w, Math.sin(a) * rr)); }
        const b = G.nv; G.ribbon(pts, ax, 0.016, 0.014, 0, 0.8 + hr() * 0.3, 0.9 + hr() * 0.35);
        for (let q = b; q < G.nv; q++) { v.set(G.P[3 * q] - c.x, G.P[3 * q + 1] - c.y, G.P[3 * q + 2] - c.z).normalize(); G.N[3 * q] = v.x; G.N[3 * q + 1] = v.y; G.N[3 * q + 2] = v.z; G.UV[2 * q + 1] = 0.55 + 0.4 * G.UV[2 * q + 1]; }
      }
    }
  } else if (id === 'mohawk') {
    hShort(G, roots, r => Math.abs(r.d.x) > 0.2 ? 0.002 + hr() * 0.0015 : 0, 0.1);
    for (const r of hDense(roots.filter(r => Math.abs(r.d.x) < 0.21 && hairEdge(r.d) > 0.02), 3, 0.004)) {
      const k = 1 - Math.abs(r.d.x) / 0.21, L = (0.03 + 0.04 * sstep(-0.95, 0.2, r.d.z) * sstep(1.0, 0.75, r.d.z * 0.9)) * (0.55 + 0.45 * k) * (0.85 + hr() * 0.3);
      const flow = v.set(r.d.x * 0.25, 1, -0.12 + (hr() - 0.5) * 0.2).normalize().clone();
      const pts = hTrace(r, L, 4, flow, 1.2, 0.35, 0.12, 0.002, 0.001);
      G.ribbon(pts, new V3((hr() - 0.5) * 1.1, 0, 1).normalize(), 0.014, 0.003, 0, 0.6 + hr() * 0.25, 1.1 + hr() * 0.4);
    }
  } else if (id === 'mullet') {
    for (const r of roots) {
      const back = sstep(0.1, -0.5, r.d.z) * sstep(0.6, 0.1, r.d.y), flow = HAIR_BACK(r.d), L = 0.022 + hr() * 0.014 + 0.03 * back;
      const pts = hTrace(r, L, 4, flow, 0.5, 0.4, 0.22, 0.003, 0.0018);
      G.ribbon(pts, hSideOf(flow, r.n), 0.012 * (0.8 + hr() * 0.5), 0.006, 0, 0.7 + hr() * 0.3, 1.05 + hr() * 0.4);
    }
  }
  return (cache[id] = G.build());
}

/* the simulated part: strands as rest polylines (head rest space), shared; the particles are per fighter */
function hairStrandSet(id) {
  const cache = T.hairSets || (T.hairSets = {}); if (cache[id]) return cache[id];
  _hSeed = 4241 + id.length * 104729;
  const roots = HEAD.hairRoots, S = { list: [], tube: false, np: 6 }, v = new V3();
  if (id === 'dreads') {
    S.tube = true; S.np = 7;
    for (const r of hSparse(roots, 0.0205)) {
      const front = sstep(0.1, 0.6, r.d.z), sx = Math.abs(r.d.x) < 0.08 ? (hr() < 0.5 ? -1 : 1) : Math.sign(r.d.x);
      const flow = v.set(lerp(r.d.x * 0.45, sx * 0.7, front), -1, lerp(Math.min(r.d.z, 0) * 0.5 - 0.1, -0.8, front)).normalize().clone();   // the front ones are thrown back, off the face
      const L = 0.13 + hr() * 0.07 + 0.05 * sstep(0.3, -0.5, r.d.z) + 0.03 * sstep(0.2, 0.9, r.d.y);
      const pts = hTrace(r, L, S.np, flow, 1.1, 0.42, 0.34, 0.006, 0.0016);
      S.list.push({ pts, side: hSideOf(flow, r.n), w: 0.0056 + hr() * 0.0016, c: 0.8 + hr() * 0.35 });
    }
  } else if (id === 'pony') {
    hairRigid('pony'); const K = T.hairKnot.pony; S.np = 6;
    for (let i = 0; i < 40; i++) {
      const r = { p: K.p.clone().add(v.set(hr() - 0.5, hr() - 0.5, 0).multiplyScalar(0.016)).addScaledVector(K.n, 0.004), n: K.n, d: K.d };
      const flow = v.set((hr() - 0.5) * 0.3, -1, -0.3 + (hr() - 0.5) * 0.25).normalize().clone();
      const pts = hTrace(r, 0.13 + hr() * 0.06, S.np, flow, 1.4, 0.4, 0.1, 0.005, 0.002);
      S.list.push({ pts, side: new V3(hr() - 0.5, (hr() - 0.5) * 0.3, hr() - 0.5).normalize(), w: 0.017 * (0.8 + hr() * 0.4), c: 0.75 + hr() * 0.4 });
    }
  } else if (id === 'mullet') {
    S.np = 5;
    for (const r of hDense(roots.filter(r => r.d.z < -0.05 && r.d.y < 0.5 && hr() < 0.5), 2, 0.004)) {
      const flow = v.set(0.2 * r.d.x, -1, -0.22).normalize().clone(), low = sstep(0.5, -0.2, r.d.y);
      const pts = hTrace(r, 0.07 + 0.05 * low + hr() * 0.03, S.np, flow, 0.4, 0.42, 0.2, 0.004, 0.0022);
      S.list.push({ pts, side: hSideOf(flow, r.n), w: 0.013 * (0.8 + hr() * 0.5), c: 0.72 + hr() * 0.4 });
    }
  }
  return (cache[id] = S);
}
const TUBE_M = 6;
function hairSim(F, id) {
  const S = hairStrandSet(id), np = S.np, nc = S.list.length, ps = new PS(nc * np, F.headFrame), C = HEAD.C, tube = S.tube, per = tube ? TUBE_M + 1 : 2;
  const nv = nc * np * per, P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), UV = new Float32Array(nv * 2), CO = new Float32Array(nv * 3), idx = [], side = [], width = [];
  S.list.forEach((st, s) => {
    for (let k = 0; k < np; k++) {
      const i = s * np + k, p = st.pts[k];
      if (k === 0) ps.inv[i] = 0; else { ps.hs[i] = st.pts.fs; ps.sm[i] = tube ? (k === 1 ? 0.5 : 0.3 * Math.pow(1 - k / np, 1.5) + 0.04) : 0.3 * Math.pow(1 - k / np, 1.4) + 0.03; }
      ps.setL(i, p.x - C.x, p.y - C.y, p.z - C.z);
      const f = k / (np - 1), c = st.c * (tube ? 1.3 + 0.5 * f : 1 + 0.5 * f), v0 = i * per;
      for (let j = 0; j < per; j++) {
        const v = v0 + j; CO[3 * v] = CO[3 * v + 1] = CO[3 * v + 2] = c;
        if (tube) { UV[2 * v] = (2 + 0.04 + 0.92 * j / TUBE_M) / 4; UV[2 * v + 1] = 1 - Math.min(f * 0.2 * 62, 15.9) / 16 - (s % 5) * 0.01; }
        else { UV[2 * v] = (j ? 0.93 : 0.07) / 4; UV[2 * v + 1] = 1 - f; }
      }
      if (k < np - 1) { if (tube) for (let j = 0; j < TUBE_M; j++) { const a = v0 + j, b = a + per; idx.push(a, b, a + 1, a + 1, b, b + 1); } else idx.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3); }
    }
    for (let k = 0; k < np - 1; k++) ps.link(s * np + k, s * np + k + 1, 1);
    for (let k = 0; k < np - 2; k++) ps.link(s * np + k, s * np + k + 2, tube ? 0.55 : 0.3);
    side.push(st.side); width.push(st.w);
  });
  ps.build(); ps.damp = tube ? 0.972 : 0.965; ps.iters = tube ? 3 : 2; ps.thick = tube ? 0.006 : 0.002; ps.fric = tube ? 0.4 : 0.3;
  ps.cols = [F.COL.head, F.COL.neck, F.COL.chest]; ps.reset();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2)); geo.setAttribute('color', new THREE.BufferAttribute(CO, 3)); geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, F.hairMatA); mesh.castShadow = true; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
  return { ps, nc, np, side, width, geo, mesh, frame: F.headFrame, tube };
}
// ropes: a ring of TUBE_M + 1 vertices round every particle (no allocations)
function renderTubes(H) {
  const p = H.ps.p, P = H.geo.attributes.position.array, N = H.geo.attributes.normal.array, np = H.np, e = H.frame.elements, per = TUBE_M + 1;
  for (let s = 0; s < H.nc; s++) {
    const sl = H.side[s], sx = e[0] * sl.x + e[4] * sl.y + e[8] * sl.z, sy = e[1] * sl.x + e[5] * sl.y + e[9] * sl.z, sz = e[2] * sl.x + e[6] * sl.y + e[10] * sl.z, r0 = H.width[s];
    for (let k = 0; k < np; k++) {
      const i = s * np + k, q = 3 * i, a = 3 * (k > 0 ? i - 1 : i), b = 3 * (k < np - 1 ? i + 1 : i);
      let tx = p[b] - p[a], ty = p[b + 1] - p[a + 1], tz = p[b + 2] - p[a + 2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const dt = sx * tx + sy * ty + sz * tz; let ax = sx - tx * dt, ay = sy - ty * dt, az = sz - tz * dt; const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
      const bx = ty * az - tz * ay, by = tz * ax - tx * az, bz = tx * ay - ty * ax, r = r0 * (k === np - 1 ? 0.3 : k === 0 ? 0.85 : 1 - 0.18 * k / np);
      for (let j = 0; j < per; j++) {
        const an = j / TUBE_M * 6.2832, c = Math.cos(an), sn = Math.sin(an), nx = ax * c + bx * sn, ny = ay * c + by * sn, nz = az * c + bz * sn, v = 3 * (i * per + j);
        P[v] = p[q] + nx * r; P[v + 1] = p[q + 1] + ny * r; P[v + 2] = p[q + 2] + nz * r; N[v] = nx; N[v + 1] = ny; N[v + 2] = nz;
      }
    }
  }
  H.geo.attributes.position.needsUpdate = true; H.geo.attributes.normal.needsUpdate = true;
}

/* beards: where each style grows on the unit head (the same regions in the head shader: beardReg) */
function beardReg(k, d) {
  const ax = Math.abs(d.x);
  if (k < 2) return k;
  if (k === 2) return sstep(0.42, 0.3, ax) * sstep(-0.42, -0.5, d.y) * (d.z > 0.5 ? 1 : 0);
  if (k === 3) return sstep(0.5, 0.38, ax) * sstep(-0.6, -0.54, d.y) * (d.z > 0.5 ? 1 : 0);
  return sstep(0.12, 0.06, d.y - (-0.97 + 0.8 * Math.pow(sstep(0.3, 1.0, ax), 1.5))) * sstep(-0.46, -0.6, d.y - 0.5 * sstep(0.45, 0.8, ax));
}
function beardGeo(id) {
  if (id === 'boxed') return T.beardGeo;
  const cache = T.beardGeoS || (T.beardGeoS = {}); if (id in cache) return cache[id];
  const st = BEARD_STYLES.find(b => b.id === id); if (!st || !st.geo) return (cache[id] = null);
  _hSeed = 31337 + id.length * 7919;
  const G = new HairGeo(), flow = new V3(), all = HEAD.beardRoots;
  const roots = id === 'full' ? hDense(all, 3, 0.003) : hDense(all.filter(r => beardReg(st.k, r.d) > 0.5), id === 'strap' ? 3 : 4, 0.0028);
  for (const r of roots) {
    const d = r.d, must = d.y > -0.52 && Math.abs(d.x) < 0.42 && d.z > 0.55, chin = sstep(-0.6, -0.95, d.y) * sstep(0, 0.6, d.z);
    let L = 0.007 + hr() * 0.005 + 0.008 * chin, w = 0.0032, np = 3;
    if (id === 'full') { L = must ? 0.014 + hr() * 0.006 : 0.014 + hr() * 0.01 + 0.04 * sstep(-0.45, -0.9, d.y) * sstep(-0.3, 0.5, d.z); w = 0.0075; np = 4; }
    else if (id === 'goatee') L = must ? 0.009 + hr() * 0.004 : 0.01 + hr() * 0.006 + 0.014 * chin;
    else if (id === 'stache') { L = 0.011 + hr() * 0.005; w = 0.0036; }
    flow.set(must ? Math.sign(d.x) * (id === 'stache' ? 0.9 : 0.5) : 0.08 * d.x, -1, must ? 0.3 : id === 'full' ? 0.18 : 0.3).normalize();
    const dir = r.n.clone().multiplyScalar(id === 'full' ? 0.8 : 1.1).add(flow).normalize(), pos = r.p.clone().addScaledVector(r.n, -0.001), pts = [pos.clone()], seg = L / (np - 1);
    for (let k = 1; k < np; k++) { dir.lerp(flow, id === 'full' ? 0.4 : 0.25); dir.x += (hr() - 0.5) * 0.16; dir.z += (hr() - 0.5) * 0.16; dir.normalize(); pos.addScaledVector(dir, seg); pts.push(pos.clone()); }
    const b0 = G.nv; G.ribbon(pts, hSideOf(flow, r.n), w * (0.7 + hr() * 0.6), w * 0.5, -1, 0.75 + hr() * 0.35, 1.05 + hr() * 0.45);
    for (let q = b0; q < G.nv; q++) { G.N[3 * q] = r.n.x; G.N[3 * q + 1] = r.n.y + 0.25; G.N[3 * q + 2] = r.n.z; }   // lit like the skin it grows from (a normal from the head centre would leave the chin black)
  }
  return (cache[id] = G.build());
}

/* a fighter's hair and beard from his look (called by Fighter.applyLook) */
const _hairC = new THREE.Color();
function hairApply(F, L) {
  const st = hairStyleOf(L), bs = beardStyleOf(L), U = F.u;
  if (!F.hairMatA) { F.hairMatA = hairMat2(); F.hairMatC = F.baseMesh.material; F.hxs = {}; }
  if (F.hstyle !== st) {
    if (F.hx) F.hx.mesh.visible = false;
    const geo = st.id === 'classic' ? T.baseGeo : st.rigid ? hairRigid(st.id) : null;
    F.baseMesh.geometry = geo || T.baseGeo; F.baseMesh.material = st.id === 'classic' ? F.hairMatC : F.hairMatA; F.hasRigid = !!geo;
    F.hx = st.sim ? F.hxs[st.id] || (F.hxs[st.id] = hairSim(F, st.id)) : null;
    F.hstyle = st; F.simReset = true;
  }
  F.bald = st.id === 'bald';
  F.hairCol.set(hairColOf(L.hair));
  for (const m of [F.hair.mesh.material, F.hairMatC, F.hairMatA]) m.color.copy(F.hairCol);
  F.hairMatA.roughness = st.rough || 0.62; F.hairMatA.specularIntensity = st.id === 'slick' ? 0.9 : 0.6;
  U.uHair.value.copy(F.hairCol).multiplyScalar(0.8); U.uHairAmt.value = 1;
  U.uHS.value.set(st.amt[0], st.amt[1], st.strip || 9, st.fade === undefined ? -9 : st.fade); U.uRows.value.set(st.rows ? 1 : 0, ROW_DPHI); U.uGloss.value = st.gloss || 0;
  // beard: its own colour or the hair's
  _hairC.set(hairColOf(L.beardCol && L.beardCol !== 'hair' ? L.beardCol : L.hair));
  const bg = bs.geo ? beardGeo(bs.id) : null;
  F.beardMesh.geometry = bg || T.beardGeo; F.beardMesh.visible = !!bg; F.beardMesh.material.color.copy(_hairC).multiplyScalar(1.2);
  U.uBeard.value.set(bs.k, bs.u[0], bs.u[1]); U.uBeardC.value.copy(_hairC).multiplyScalar(0.8);
}
// what of the hair shows: long / tall hair is tucked under a hat or the headgear, the short layer shows through
function hairVis(F) {
  const st = F.hstyle || HAIR_STYLES[3], hid = !!F.gear.spar || wearTuck(F);
  F.hair.mesh.visible = st.id === 'classic' && !hid;
  F.baseMesh.visible = (st.id === 'classic' || !!F.hasRigid) && !(st.big && hid);
  if (F.hx) F.hx.mesh.visible = !hid;
  const was = F.hsim; F.hsim = hid ? null : st.id === 'classic' ? F.hair : F.hx || null;
  if (F.hsim !== was) F.simReset = true;
}
// a cut for a random man: every cut is possible, the likelier ones depend on the hair type that goes with the skin tone
function randomCut(skin, rnd) {
  const coily = skin === 'deep' || skin === 'dark' || skin === 'brown', fav = coily ? ['bald', 'buzz', 'coils', 'afro', 'twists', 'dreads', 'rows', 'curly'] : ['bald', 'buzz', 'crew', 'classic', 'classic', 'slick', 'curly', 'bun', 'pony', 'mohawk', 'mullet'];
  const list = rnd() < 0.85 ? fav : HAIR_STYLES.map(s => s.id);
  return list[(rnd() * list.length) | 0];
}
