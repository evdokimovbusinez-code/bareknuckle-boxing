/* ───────── training gear: boxing gloves, MMA gloves, headgear, gum shield ─────────
   All procedural, no brands. Boxing gloves and the headgear are rigid meshes carried by the hand / head bones (the hand's skin under a
   boxing glove is not drawn: uGlv in the skin shader). MMA gloves are a shell grown out of the hand's own skin, like the clothes. */
const gsm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// a surface from a function of (u, v) → point. Normals come from finite differences of the function itself, so seams and poles stay smooth.
// o.c: a point inside (the surface is turned to face away from it), o.inv: face the other way, o.col(u, v): grey vertex colour
function gridGeo(fn, nu, nv, o = {}) {
  const N = (nu + 1) * (nv + 1), pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2), col = new Float32Array(N * 3).fill(1), idx = [];
  const p = new V3(), a = new V3(), b = new V3(), c = new V3(), e = 2e-3;
  fn(0.37, 0.5, p); fn(0.37 + e, 0.5, a); fn(0.37, 0.5 + e, b); a.sub(p).cross(b.sub(p));
  const sgn = (a.dot(p.sub(o.c || c.set(0, 0, 0))) < 0 ? -1 : 1) * (o.inv ? -1 : 1);
  for (let j = 0, k = 0; j <= nv; j++) for (let i = 0; i <= nu; i++, k++) {
    const u = i / nu, v = j / nv, vc = clamp(v, 0.006, 0.994);
    fn(u, v, p); pos.set([p.x, p.y, p.z], k * 3);
    fn(u + e, vc, a); fn(u - e, vc, b); c.copy(a).sub(b); fn(u, vc + e, a); fn(u, vc - e, b); c.cross(a.sub(b)).normalize().multiplyScalar(sgn);
    nor.set([c.x, c.y, c.z], k * 3); uv.set([u * (o.ku || 1), v * (o.kv || 1)], k * 2);
    if (o.col) { const g = o.col(u, v); col.set([g, g, g], k * 3); }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = j * (nu + 1) + i, k2 = k + nu + 1; if (sgn > 0) idx.push(k, k + 1, k2, k + 1, k2 + 1, k2); else idx.push(k, k2, k + 1, k + 1, k2, k2 + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx); return g;
}
function mergeGeos(list) {
  const out = new THREE.BufferGeometry(), idx = []; let off = 0;
  for (const nm of ['position', 'normal', 'uv', 'color']) { if (!list[0].attributes[nm]) continue; const sz = list[0].attributes[nm].itemSize, arr = new Float32Array(list.reduce((s, g) => s + g.attributes[nm].count, 0) * sz); let k = 0; for (const g of list) { arr.set(g.attributes[nm].array, k); k += g.attributes[nm].array.length; } out.setAttribute(nm, new THREE.BufferAttribute(arr, sz)); }
  for (const g of list) { for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); off += g.attributes.position.count; }
  out.setIndex(idx); return out;
}
const pipeGeo = (pts, r, closed) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.5), pts.length * 3, r, 6, closed);
// leather grain: pebbled height field → tangent-space normal map (tiles)
function leatherNormal() {
  if (GEAR.leatherN) return GEAR.leatherN;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2400; i++) { const x = rr() * S, y = rr() * S, r = 2.2 + rr() * 3.2; g.fillStyle = `rgba(255,255,255,${0.25 + rr() * 0.3})`;
    for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) { g.beginPath(); g.ellipse(x + ox, y + oy, r, r * (0.6 + rr() * 0.4), rr() * 3, 0, 7); g.fill(); } }
  const src = g.getImageData(0, 0, S, S).data, im = g.createImageData(S, S), h = (x, y) => src[(((y + S) % S) * S + (x + S) % S) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = (h(x - 1, y) - h(x + 1, y)) * 1.6, dy = (h(x, y - 1) - h(x, y + 1)) * 1.6, l = 1 / Math.hypot(dx, dy, 1), k = (y * S + x) * 4;
    im.data[k] = (dx * l * 0.5 + 0.5) * 255; im.data[k + 1] = (dy * l * 0.5 + 0.5) * 255; im.data[k + 2] = (l * 0.5 + 0.5) * 255; im.data[k + 3] = 255; }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return GEAR.leatherN = t;
}
const leatherMat = c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4, normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.4, 0.4), vertexColors: true });

/* —— boxing glove, 14–16 oz. Hand frame, cm: origin at the wrist (hand bone), +x thumb side, +y along the fingers (knuckle bone at 10.3),
   +z palm. About 27 long with the cuff, 13 wide with the thumb, 10.5 thick; the padding over the knuckles is ≈ 5–6 cm. —— */
const sphDir = (u, v, o) => { const s = Math.sin(Math.PI * v), a = 2 * Math.PI * u; return o.set(s * Math.cos(a), -Math.cos(Math.PI * v), s * Math.sin(a)); };
const sqK = (d, n) => Math.pow(Math.abs(d.x) ** n + Math.abs(d.y) ** n + Math.abs(d.z) ** n, -1 / n);
const MITT_C = new V3(-0.8, 7.9, -0.4);
function mittPt(d, o) {   // the padded body: a rounded box, narrow at the wrist, fat over the knuckles, flatter on the palm, nose curled to the palm
  const k = sqK(d, 2.5); let x = d.x * k * 6.0, y = d.y * k * 9.4, z = d.z * k * 5.5; const t = (y / 9.4 + 1) / 2, tp = gsm(0, 0.6, t);
  x *= lerp(0.74, 1, tp); z *= lerp(0.66, 1, tp) * (z > 0 ? 0.82 : 1); z += 1.3 * gsm(0.55, 1, t) ** 2;
  if (d.z > 0) z -= 0.6 * Math.exp(-(((y - 2.8) / 1.3) ** 2)) * gsm(0.15, 0.6, d.z);   // the crease where the fingers fold over the grip bar
  return o.set(x + MITT_C.x, y + MITT_C.y, z + MITT_C.z);
}
const TH_C = new V3(5.0, 8.0, 2.2), TH_A = new V3(0.1, 0.96, 0.23).normalize(), TH_X = new V3(1, 0, 0).addScaledVector(TH_A, -TH_A.x).normalize(), TH_Z = new V3().crossVectors(TH_X, TH_A);
function thumbPt(d, o) {   // attached thumb: its own pad, lying along the body, tip bent in
  const k = sqK(d, 2.3); let x = d.x * k * 1.95, y = d.y * k * 5.0, z = d.z * k * 2.15; const t = (y / 5 + 1) / 2, s = lerp(1.08, 0.78, t);
  x = x * s - 0.7 * t * t; z *= s; return o.copy(TH_C).addScaledVector(TH_X, x).addScaledVector(TH_A, y).addScaledVector(TH_Z, z);
}
function cuffPt(ang, y, lift, o) {   // cuff surface: oval, waisted at the wrist, flared to the rim and leaning with the forearm (which is hidden up to the rim)
  const rx = 4.0 + (y < -3 ? 0.95 : 0.5) * ((y + 3) / 6) ** 2 + lift, k = (2.2 - y) / 11.4, e = gsm(-4, -9, y);
  return o.set(-0.6 + 0.9 * k + 0.8 * e + rx * Math.cos(ang), y, -0.2 + 0.5 * k - 0.5 * e + (rx - lift) * 0.85 * Math.sin(ang) + lift * Math.sin(ang));
}
function gloveGeo() {
  if (GEAR.glove) return GEAR.glove;
  const d = new V3(), q = new V3(), t = new V3(), TAU = Math.PI * 2, parts = [], pipes = [];
  parts.push(gridGeo((u, v, o) => mittPt(sphDir(u, v, d), o), 48, 36, { c: MITT_C, ku: 8, kv: 5 }));
  parts.push(gridGeo((u, v, o) => thumbPt(sphDir(u, v, d), o), 28, 24, { c: TH_C, ku: 3, kv: 3 }));
  // cuff: a shoulder inside the body, the wall, a rolled lip
  const cuff = (u, v, o) => { const a = u * TAU; if (v < 0.08) { const k = v / 0.08; cuffPt(a, 2.9 - 0.7 * k, 0, o); const s = 0.6 + 0.4 * Math.sin(k * Math.PI / 2); o.x = -0.6 + (o.x + 0.6) * s; o.z = -0.2 + (o.z + 0.2) * s; return o; }
    if (v < 0.86) return cuffPt(a, 2.2 - 11.4 * (v - 0.08) / 0.78, 0, o);
    const b = (v - 0.86) / 0.14 * Math.PI * 1.2; return cuffPt(a, -9.2 - 0.4 * Math.sin(b), -0.4 * (1 - Math.cos(b)), o); };
  parts.push(gridGeo(cuff, 40, 26, { c: new V3(0, -4, 0), ku: 6, kv: 3 }));
  parts.push(gridGeo((u, v, o) => { cuffPt(u * TAU, -8.4, 0, o); o.x = 0.2 + (o.x - 0.2) * v; o.z = 0.2 + (o.z - 0.2) * v; return o; }, 24, 2, { c: new V3(0, 5, 0), col: () => 0.04 }));   // dark lining inside the opening
  // hook-and-loop strap around the cuff, chamfered edges, the tab end on the back of the wrist
  parts.push(gridGeo((u, v, o) => cuffPt((-40 - 275 * u) / 360 * TAU, -2.7 - 4.2 * v, 0.34 * clamp(Math.min(v / 0.12, (1 - v) / 0.12, u / 0.03, (1 - u) / 0.03), 0, 1), o), 56, 8, { c: new V3(0, -4, 0), ku: 5, kv: 1, col: () => 0.72 }));
  // piping: the cuff seam, the cuff rim, around the palm panel, along the thumb seam
  const ring = (f, n) => { const a = []; for (let i = 0; i < n; i++) a.push(f(i / n, new V3())); return a; };
  pipes.push(pipeGeo(ring((u, o) => cuffPt(u * TAU, 2.15, 0.1, o), 28), 0.17, true), pipeGeo(ring((u, o) => cuffPt(u * TAU, -8.75, 0.08, o), 28), 0.17, true));
  pipes.push(pipeGeo(ring((u, o) => { const a = u * TAU; mittPt(d.set(Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0.57).normalize(), o); return o.addScaledVector(d, 0.08); }, 40), 0.15, true));
  { const inside = p => { const L = q.copy(p).sub(MITT_C).length(); return L < mittPt(q.normalize(), t).distanceTo(MITT_C); }, A = [], B = [];
    for (let j = 2; j <= 22; j++) { let was = inside(thumbPt(sphDir(0, j / 24, d), new V3()));
      for (let i = 1; i <= 96; i++) { const p = thumbPt(sphDir(i / 96, j / 24, d), new V3()), now = inside(p); if (now !== was) (p.z < TH_C.z + (p.y - TH_C.y) * 0.24 ? A : B).push(p.addScaledVector(d, 0.05)); was = now; } }
    const loop = A.concat(B.reverse()); if (loop.length > 8) pipes.push(pipeGeo(loop, 0.15, true)); }
  const body = mergeGeos(parts), pipe = mergeGeos(pipes); body.scale(0.01, 0.01, 0.01); pipe.scale(0.01, 0.01, 0.01);
  return GEAR.glove = { body, pipe };
}
function gloveMesh(F, S, mat, trim) {
  const B = F.bones, h = B[`CC_Base_${S}_Hand`], P = n => new V3().setFromMatrixPosition(B[`CC_Base_${S}_${n}`].matrixWorld), hp = P('Hand');
  const Y = P('Mid1').sub(hp), s = Y.length() / 0.103; Y.normalize(); const X = P('Index1').sub(P('Pinky1')); X.addScaledVector(Y, -X.dot(Y)).normalize();
  const Z = new V3().crossVectors(X, Y).multiplyScalar(S === 'R' ? 1 : -1), geo = gloveGeo();   // the left hand's frame is mirrored (three flips the winding for det < 0)
  const rel = new M4().makeBasis(X.multiplyScalar(s), Y.multiplyScalar(s), Z.multiplyScalar(s)).setPosition(hp).premultiply(h.matrixWorld.clone().invert());
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo.body, mat), new THREE.Mesh(geo.pipe, trim)); g.matrixAutoUpdate = false; for (const c of g.children) c.castShadow = c.receiveShadow = true;
  scene.add(g); return { g, h, rel };
}

/* —— MMA gloves, 4 oz. Two layers:
   • a thin leather shell grown out of the hand's own skin (like the clothes): the back of the hand, the heel of the palm, loops around the
     first phalanges, a strap around the wrist; open palm, open fingers and thumb. The skin under it is not drawn (uGlv = 2, aGH.z).
   • rigid pads on top, carried by the bones (04c_mma_pads.js): one over the back of the hand, a ≈ 2.5 cm roll over each first phalanx. —— */
function mmaShell(F, mat) {
  const gh = GEAR.gh, tr = GEAR.tris, idx = [], src = F.body.geometry, geo = new THREE.BufferGeometry();
  const ok = v => { const a = gh[v * 3 + 2]; return gh[v * 3 + 1] === 4 && a > 1.78 && a < 2.6; };
  for (let t = 0; t < tr.length; t += 3) if (ok(tr[t]) || ok(tr[t + 1]) || ok(tr[t + 2])) idx.push(tr[t], tr[t + 1], tr[t + 2]);
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'aGH', 'aGlv']) geo.setAttribute(k, src.attributes[k]);
  geo.setIndex(idx); mat = mat.clone(); mat.vertexColors = false; mat.normalMap = mat.normalMap.clone(); mat.normalMap.repeat.set(30, 30); mat.normalMap.needsUpdate = true;
  const U = { uThick: { value: GEAR.HF.R.u } };
  mat.onBeforeCompile = s => {
    Object.assign(s.uniforms, U);
    s.vertexShader = 'attribute vec3 aGH; attribute vec4 aGlv; varying vec3 vGH; varying float vStrap; uniform float uThick;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vGH = aGH; vStrap = aGlv.x;
      transformed += objectNormal * uThick * ( 0.16 + 0.3 * smoothstep( -4.4, -4.1, aGlv.x ) * ( 1.0 - smoothstep( -0.9, -0.6, aGlv.x ) ) );`);
    s.fragmentShader = 'varying vec3 vGH; varying float vStrap;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      if ( vGH.y < 3.5 || vGH.z < 1.8 || vGH.z > 2.56 ) discard;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      { float st = smoothstep( -4.3, -4.2, vStrap ) * ( 1.0 - smoothstep( -0.8, -0.7, vStrap ) ), seam = 1.0 - 0.6 * ( exp( -pow( ( vStrap + 4.25 ) / 0.07, 2.0 ) ) + exp( -pow( ( vStrap + 0.75 ) / 0.07, 2.0 ) ) );
        diffuseColor.rgb *= mix( 0.42, 1.0, st ) * seam; }   // the strap in the glove's colour, the rest a darker shade of it`);
  };
  mat.customProgramCacheKey = () => 'mma-glove';
  const m = new THREE.SkinnedMesh(geo, mat); m.bind(F.body.skeleton, F.body.bindMatrix); m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
  F.body.parent.add(m); m.position.copy(F.body.position); m.quaternion.copy(F.body.quaternion); m.scale.copy(F.body.scale);
  return m;
}

/* —— headgear. Built on the head itself: a map of the skin's distance from the head centre by direction (cm, head-ellipsoid frame:
   x to his left… y up, z to the face), pads are pillows laid on that surface with a small gap. —— */
function headMap(F) {
  if (GEAR.hmap) return GEAR.hmap;
  const NA = 72, NE = 36, raw = new Float32Array(NA * NE), gh = GEAR.gh, n = gh.length / 3, p = new V3(), body = F.body, PI = Math.PI;
  for (let i = 0; i < n; i++) { if (gh[i * 3 + 1] !== 5) continue; body.getVertexPosition(i, p); p.applyMatrix4(body.matrixWorld).applyMatrix4(F.headFrameInv).multiplyScalar(100);
    const r = p.length(), ei = clamp(Math.floor((Math.asin(p.y / r) / PI + 0.5) * NE), 0, NE - 1), a = Math.atan2(p.x, p.z) / (2 * PI);
    for (const s of [a, -a]) { const k = ei * NA + (Math.floor((s + 1) * NA) % NA); raw[k] = Math.max(raw[k], r); } }   // (kept left-right symmetric)
  let m = raw.slice(); const at = (A, e, a) => A[clamp(e, 0, NE - 1) * NA + (a + NA) % NA];
  for (let it = 0; it < 24; it++) { const o = m.slice(); for (let e = 0; e < NE; e++) for (let a = 0; a < NA; a++) if (!m[e * NA + a]) { let s = 0, c = 0; for (const [de, da] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const v = at(m, e + de, a + da); if (v) { s += v; c++; } } if (c) o[e * NA + a] = s / c; } m = o; }
  for (let it = 0; it < 2; it++) { const o = m.slice(); for (let e = 0; e < NE; e++) for (let a = 0; a < NA; a++) { let s = 0; for (let de = -1; de <= 1; de++) for (let da = -1; da <= 1; da++) s += at(m, e + de, a + da); o[e * NA + a] = Math.max(s / 9, raw[e * NA + a] - 0.25); } m = o; }
  // a second, smooth map that bridges over the ear (max over ±10°, then blurred): the ear pad lies on it, not on the ear's folds
  let m2 = m.slice(); for (let e = 0; e < NE; e++) for (let a = 0; a < NA; a++) { let v = 0; for (let de = -2; de <= 2; de++) for (let da = -2; da <= 2; da++) v = Math.max(v, at(m, e + de, a + da)); m2[e * NA + a] = v; }
  for (let it = 0; it < 3; it++) { const o = m2.slice(); for (let e = 0; e < NE; e++) for (let a = 0; a < NA; a++) { let s = 0; for (let de = -1; de <= 1; de++) for (let da = -1; da <= 1; da++) s += at(m2, e + de, a + da); o[e * NA + a] = s / 9; } m2 = o; }
  const samp = A => d => { const fe = clamp((Math.asin(clamp(d.y, -1, 1)) / PI + 0.5) * NE - 0.5, 0, NE - 1), fa = (Math.atan2(d.x, d.z) / (2 * PI) + 1) * NA - 0.5, e0 = Math.floor(fe), a0 = Math.floor(fa), te = fe - e0, ta = fa - a0;
    return lerp(lerp(at(A, e0, a0), at(A, e0, a0 + 1), ta), lerp(at(A, e0 + 1, a0), at(A, e0 + 1, a0 + 1), ta), te); };
  GEAR.hmap = samp(m); GEAR.hmap.s = samp(m2); return GEAR.hmap;
}
function headgearGeo(F) {
  if (GEAR.hg) return GEAR.hg;
  const hr = headMap(F), D = Math.PI / 180, O = new V3(), d = new V3(), t1 = new V3(), t2 = new V3(), gap = 0.35, parts = [];
  const dirAY = (a, y, o, R = hr) => { let r = 9.5; for (let k = 0; k < 5; k++) { const el = Math.asin(clamp(y / r, -0.98, 0.98)); o.set(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)); r = R(o); } return o; };   // direction to the skin at azimuth a (0 = face), height y
  const pe = t => Math.sqrt(Math.max(0, 1 - Math.abs(2 * t - 1) ** 3));   // pillow edge
  const pad = (dir, th, nu, nv, ku, kv, col, rf = hr) => {   // a pillow: outer sheet at the padding's thickness, inner sheet on the head (rf: the surface it lies on)
    parts.push(gridGeo((u, v, o) => { dir(u, v, o); return o.multiplyScalar(rf(o, u, v) + gap + th(u, v)); }, nu, nv, { c: O, ku, kv, col }));
    parts.push(gridGeo((u, v, o) => { dir(u, v, o); return o.multiplyScalar(rf(o, u, v) + gap - 0.12); }, nu, nv, { c: O, inv: true, ku, kv, col: () => 0.25 }));
  };
  // brow band all the way round: ~4.5 cm over the forehead (face open from the brows down), drops over the temples, deep at the back
  const az = u => { let a = ((u * 360) % 360 + 360) % 360; return a > 180 ? 360 - a : a; };
  const bLo = a => 3.1 - 2.9 * gsm(40, 80, a) - 4.6 * gsm(120, 165, a), bHi = a => 7.6 + 1.0 * gsm(30, 90, a) + 0.4 * gsm(120, 180, a);
  const bT = (a, v) => (2.3 - 0.5 * gsm(40, 90, a)) * pe(v) * (1 - 0.1 * Math.exp(-(((v - 0.5) / 0.06) ** 2))) * (1 - 0.5 * Math.exp(-(((a - 180) / 3.5) ** 2)));
  pad((u, v, o) => dirAY(u * 360 * D, lerp(bLo(az(u)), bHi(az(u)), v), o), (u, v) => bT(az(u), v), 120, 10, 14, 1.5);
  for (const sg of [-1, 1]) {
    // cheek protector: forward from the ear along the cheekbone, ends beside the nose under the eye
    pad((u, v, o) => dirAY(sg * lerp(88, 19, u) * D, lerp(lerp(-7.0, -5.8, u), lerp(0.8, -1.9, u), v), o), (u, v) => (2.0 + 0.7 * u) * pe(v) * Math.sqrt(Math.max(0, 1 - Math.max(0, 2 * u - 1) ** 3)), 22, 8, 4, 1.5);
    // ear pad with a hearing hole
    const eq = (u, v) => Math.hypot((lerp(68, 134, u) - 101) * 0.166, lerp(-7.2, 3.8, v) + 1.7);
    // (lies on the smooth map that bridges the ear; its rim comes back down to the head)
    pad((u, v, o) => dirAY(sg * lerp(68, 134, u) * D, lerp(-7.2, 3.8, v), o, hr.s), (u, v) => 1.3 * pe(u) * pe(v) * (0.12 + 0.88 * gsm(0.7, 1.7, eq(u, v))), 26, 24, 3, 3, (u, v) => eq(u, v) < 0.95 ? 0.05 : 1,
      (o, u, v) => lerp(hr(o), hr.s(o), gsm(0, 0.22, Math.min(u, 1 - u, v, 1 - v))));
  }
  // open crown: one padded strip front to back, one ear to ear
  pad((u, v, o) => { const b = lerp(38, 150, u) * D; return o.set((v - 0.5) * 4.8, Math.sin(b) * 10, Math.cos(b) * 10).normalize(); }, (u, v) => 1.2 * pe(v), 30, 6, 6, 1);
  pad((u, v, o) => { const b = lerp(24, 156, u) * D; return o.set(Math.cos(b) * 10, Math.sin(b) * 10, -1.2 + (v - 0.5) * 4).normalize(); }, (u, v) => 1.1 * pe(v), 30, 6, 6, 1);
  // chin strap: from under one ear pad, under the chin, to the other
  const e1 = sg => new V3(sg * 9.3, -6.4, -0.3).normalize(), cL = e1(-1), cR = e1(1), cC = new V3(0, -11.2, 5.4).normalize();
  const chin = (u, o) => o.set(0, 0, 0).addScaledVector(cL, (1 - u) ** 2).addScaledVector(cC, 3 * u * (1 - u)).addScaledVector(cR, u * u).normalize();
  pad((u, v, o) => { chin(u + 0.01, t1); chin(u - 0.01, t2); t1.sub(t2); chin(u, o); t1.cross(o).normalize(); return o.multiplyScalar(10).addScaledVector(t1, (v - 0.5) * 2.6).normalize(); }, (u, v) => 0.5 * pe(v), 44, 4, 10, 1);
  // lacing over the split at the back
  const lace = [];
  for (const sg of [-1, 1]) { const pts = []; for (let k = 0; k < 8; k++) { const a = 180 + sg * (k % 2 ? 5 : -5), y = -3 + k * 1.5; dirAY(a * D, y, d); pts.push(d.clone().multiplyScalar(hr(d) + gap + bT(az(a / 360), (y - bLo(180)) / (bHi(180) - bLo(180))) + 0.12)); }
    lace.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.08), 56, 0.13, 5)); }
  const body = mergeGeos(parts), lc = mergeGeos(lace); body.scale(0.01, 0.01, 0.01); lc.scale(0.01, 0.01, 0.01);
  return GEAR.hg = { body, lace: lc };
}
function headgearMesh(F, mat, trim) {
  const geo = headgearGeo(F), g = new THREE.Group(); g.add(new THREE.Mesh(geo.body, mat), new THREE.Mesh(geo.lace, trim));
  g.matrixAutoUpdate = false; for (const c of g.children) { c.castShadow = c.receiveShadow = true; c.frustumCulled = false; } scene.add(g); return g;
}
// gum shield: an arch over the upper teeth, in the head-ellipsoid frame (teeth bone ≈ 4 cm below and 5 cm in front of the head centre).
// Light, slightly translucent, and it glows a little of its own colour: inside the mouth there is almost no light to show it.
function guardMesh() {
  const geo = new THREE.TorusGeometry(0.024, 0.0062, 8, 20, Math.PI * 1.05); geo.rotateX(Math.PI / 2); geo.rotateY(-Math.PI * 0.025); geo.scale(1.05, 1.5, 1.3); geo.translate(0, -0.063, 0.057);
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#d8e4ea', emissive: '#d8e4ea', emissiveIntensity: 0.3, roughness: 0.3, clearcoat: 0.6, transparent: true, opacity: 0.9, envMapIntensity: 1.4 }));
  m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m); return m;
}
// nails follow the hand's skin under a boxing glove (toenails stay)
function nailMatFor(fu) {
  const m = T.nailMat.clone();
  m.onBeforeCompile = s => { s.uniforms.uGlv = fu.uGlv;
    s.vertexShader = 'attribute vec3 aGH; varying vec3 vGH;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGH = aGH;');
    s.fragmentShader = 'varying vec3 vGH; uniform float uGlv;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if ( uGlv > 0.5 && uGlv < 1.5 && vGH.y > 3.5 ) discard;'); };
  m.customProgramCacheKey = () => 'nails-glove'; return m;
}
