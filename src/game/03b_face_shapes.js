/* ───────── face blend shapes ─────────
   The CC export carries ~120 shapes on CC_Base_Body (ARKit A01…A52, CC expressions, visemes). three r160's FBXLoader bakes them wrong:
   genMorphGeometry triangulates every quad by earcut on the shape's *deltas* (mostly zero → degenerate), so each morph buffer comes out
   shorter than the mesh and out of step with its corners — read against the welded mesh that gives garbage and NaN deltas, and every
   triangle with a NaN vertex vanishes on the GPU as soon as an influence is set (torso, half the head). So buildTemplates drops the loader's
   morphs and the shapes the expressions use (FACE_SHAPES, g_pre.js) are read here straight from the FBX: sparse per control point
   (Indexes + Vertices), matched to the welded vertices by position (the base mesh is the control points as they are). Deltas under
   0.1 mm are dropped; only the control points some kept shape moves get a slot. Position and normal deltas of the slots go into one small
   half-float texture, applied in the skin vertex shader (FACE_MORPH_V) with per-fighter weights (Flesh.u.uFW) — no three.js morph
   targets, so the depth / shadow / AO passes and the clothing shells that share the body's attributes are untouched. */
// a minimal reader of the binary FBX: the mesh's control points and its shapes, by name
function fbxShapes(buf, meshName, want) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), big = dv.getUint32(23, true) >= 7500, w = big ? 8 : 4;
  const num = o => big ? Number(dv.getBigUint64(o, true)) : dv.getUint32(o, true);
  const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[o + i]); return s; };
  const node = o => { const nl = u8[o + 3 * w], p = o + 3 * w + 1 + nl; return { end: num(o), np: num(o + w), p, k: p + num(o + 2 * w), name: str(o + 3 * w + 1, nl) }; };
  const each = (o, end, f) => { while (o < end) { const c = node(o); if (!c.end) break; f(c); o = c.end; } };
  const child = (n, nm) => { let r = null; each(n.k, n.end, c => { if (!r && c.name === nm) r = c; }); return r; };
  const props = n => {
    const out = []; let p = n.p;
    for (let i = 0; i < n.np; i++) {
      const t = String.fromCharCode(u8[p++]);
      if (t === 'L') { out.push(dv.getBigInt64(p, true).toString()); p += 8; }
      else if (t === 'I') { out.push(dv.getInt32(p, true)); p += 4; }
      else if (t === 'D') { out.push(dv.getFloat64(p, true)); p += 8; }
      else if (t === 'F') { out.push(dv.getFloat32(p, true)); p += 4; }
      else if (t === 'Y') { out.push(dv.getInt16(p, true)); p += 2; }
      else if (t === 'C') { out.push(u8[p]); p += 1; }
      else if (t === 'S' || t === 'R') { const l = dv.getUint32(p, true); out.push(t === 'S' ? str(p + 4, l) : null); p += 4 + l; }
      else {   // arrays: f d l i b, raw or zlib
        const len = dv.getUint32(p, true), enc = dv.getUint32(p + 4, true), cl = dv.getUint32(p + 8, true), sz = t === 'd' || t === 'l' ? 8 : t === 'b' ? 1 : 4; p += 12;
        const raw = u8.subarray(p, p + cl), b = new Uint8Array(len * sz); b.set((enc ? unzlibSync(raw) : raw).subarray(0, len * sz)); p += cl;
        out.push(t === 'd' ? new Float64Array(b.buffer) : t === 'f' ? new Float32Array(b.buffer) : t === 'i' ? new Int32Array(b.buffer) : b);
      }
    }
    return out;
  };
  let objs = null, cons = null; each(27, u8.length, n => { if (n.name === 'Objects') objs = n; else if (n.name === 'Connections') cons = n; });
  const par = new Map(); each(cons.k, cons.end, c => { const [, a, b] = props(c); if (!par.has(a)) par.set(a, []); par.get(a).push(b); });
  let mesh = null; const cand = [];
  each(objs.k, objs.end, n => {
    if (n.name !== 'Geometry') return;
    const [id, nm, cls] = props(n), name = nm.split('\0')[0];
    if (cls === 'Mesh' && name === meshName) mesh = { id, n }; else if (cls === 'Shape' && want.includes(name)) cand.push({ id, name, n });
  });
  // a shape belongs to the mesh through shape → blend-shape channel → blend shape → geometry (the eyelashes, tear lines… carry the same names)
  const up = id => par.get(id) || [], owns = id => up(id).some(a => up(a).some(b => up(b).includes(mesh.id)));
  const shapes = {};
  for (const s of cand) if (!shapes[s.name] && owns(s.id)) shapes[s.name] = { I: props(child(s.n, 'Indexes'))[0], V: props(child(s.n, 'Vertices'))[0] };
  return { cp: props(child(mesh.n, 'Vertices'))[0], shapes };
}
// the face rig of the welded body geometry: aFM (slot per vertex) + the delta texture; null when the file has none of the shapes
function faceShapes(buf, geo) {
  return faceShapesFrom(fbxShapes(buf, 'CC_Base_Body', FACE_SHAPES), geo);
}
// issue #43: the packed build strips the FBX Shape bodies and carries the same sparse
// deltas in assets/face.bin (BKFC: f32 control points, then i32 Indexes + f64 Vertices
// per shape).  Both paths feed the identical faceShapesFrom(), so aFM / the delta
// texture come out bit-for-bit the same.
function faceShapesPacked(buf, geo) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x43464b42) throw new Error('face.bin: bad magic');   // 'BKFC'
  const NS = dv.getUint32(4, true), ncp = dv.getUint32(8, true);
  let o = 12;
  const cp = new Float32Array(buf.slice(o, o + ncp * 12)); o += ncp * 12;
  const shapes = {};
  for (let si = 0; si < NS; si++) {
    if (!dv.getUint32(o, true)) { o += 4; continue; }
    o += 4;
    const nI = dv.getUint32(o, true), nV = dv.getUint32(o + 4, true); o += 8;
    const I = new Int32Array(buf.slice(o, o + nI * 4)); o += nI * 4;
    const V = new Float64Array(buf.slice(o, o + nV * 8)); o += nV * 8;
    shapes[FACE_SHAPES[si]] = { I, V };
  }
  return faceShapesFrom({ cp, shapes }, geo);
}
function faceShapesFrom(S, geo) {
  const t0 = performance.now(), NS = FACE_SHAPES.length, cp = new Float32Array(S.cp), ncp = cp.length / 3, MIN = 0.01;   // cm
  const slot = new Int32Array(ncp).fill(-1); let n = 0;
  const big = (V, j) => Math.hypot(V[3 * j], V[3 * j + 1], V[3 * j + 2]) >= MIN;
  for (const nm of FACE_SHAPES) { const s = S.shapes[nm]; if (s) for (let j = 0; j < s.I.length; j++) if (slot[s.I[j]] < 0 && big(s.V, j)) slot[s.I[j]] = n++; }
  if (!n) return null;
  const D = new Float32Array(NS * n * 3);
  FACE_SHAPES.forEach((nm, si) => { const s = S.shapes[nm]; if (s) for (let j = 0; j < s.I.length; j++) { const k = slot[s.I[j]]; if (k >= 0 && big(s.V, j)) for (let c = 0; c < 3; c++) D[(si * n + k) * 3 + c] = s.V[3 * j + c]; } });
  // welded vertex → slot, by position (several welded vertices share a control point along the UV seams: they share its slot)
  const key = (a, i) => Math.round(a[3 * i] * 1000) + ',' + Math.round(a[3 * i + 1] * 1000) + ',' + Math.round(a[3 * i + 2] * 1000);
  const at = new Map(); for (let i = 0; i < ncp; i++) if (slot[i] >= 0) at.set(key(cp, i), slot[i]);
  const P = geo.attributes.position.array, nv = P.length / 3, fm = new Float32Array(nv).fill(-1); let hit = 0;
  for (let j = 0; j < nv; j++) { const k = at.get(key(P, j)); if (k !== undefined) { fm[j] = k; hit++; } }
  // normal deltas: area-weighted normals per slot (smooth across the seams), shape at full weight minus base
  const ix = geo.index.array, tris = []; for (let t = 0; t < ix.length; t += 3) if (fm[ix[t]] >= 0 || fm[ix[t + 1]] >= 0 || fm[ix[t + 2]] >= 0) tris.push(t);
  const q = new Float32Array(9), acc = (si, out) => {
    out.fill(0);
    for (const t of tris) {
      for (let c = 0; c < 3; c++) { const v = ix[t + c], k = fm[v]; for (let e = 0; e < 3; e++) q[3 * c + e] = P[3 * v + e] + (si >= 0 && k >= 0 ? D[(si * n + k) * 3 + e] : 0); }
      const ax = q[3] - q[0], ay = q[4] - q[1], az = q[5] - q[2], bx = q[6] - q[0], by = q[7] - q[1], bz = q[8] - q[2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      for (let c = 0; c < 3; c++) { const k = fm[ix[t + c]]; if (k >= 0) { out[3 * k] += nx; out[3 * k + 1] += ny; out[3 * k + 2] += nz; } }
    }
    for (let k = 0; k < n; k++) { const l = Math.hypot(out[3 * k], out[3 * k + 1], out[3 * k + 2]) || 1; out[3 * k] /= l; out[3 * k + 1] /= l; out[3 * k + 2] /= l; }
  };
  const N0 = new Float32Array(n * 3), N1 = new Float32Array(n * 3); acc(-1, N0);
  const W = 2048, H = Math.ceil(NS * 2 * n / W), data = new Uint16Array(W * H * 4), h = THREE.DataUtils.toHalfFloat;
  for (let si = 0; si < NS; si++) {
    if (!S.shapes[FACE_SHAPES[si]]) continue;
    acc(si, N1);
    for (let k = 0; k < n; k++) {
      const a = 4 * (2 * si * n + k), b = a + 4 * n, d = 3 * (si * n + k);
      for (let c = 0; c < 3; c++) { data[a + c] = h(D[d + c]); const dn = N1[3 * k + c] - N0[3 * k + c]; data[b + c] = h(Math.abs(dn) < 1e-3 ? 0 : dn); }
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType); tex.needsUpdate = true;
  geo.setAttribute('aFM', new THREE.BufferAttribute(fm, 1));
  return { tex, n, verts: hit, missing: FACE_SHAPES.filter(x => !S.shapes[x]), ms: Math.round(performance.now() - t0) };
}

/* ───────── expressions → shape weights ─────────
   Face.update keeps a few smoothed moods (X) and this turns them into the weights of FACE_SHAPES. Moods add up (pain on top of effort…);
   each weight is clamped to what the shape can do. L/R = the character's own left / right; `s` > 0 leans a mood onto his left side. */
const [F_BI, F_BDL, F_BDR, F_BOL, F_BOR, F_SQL, F_SQR, F_WL, F_WR, F_CSL, F_CSR, F_NSL, F_NSR, F_CBL, F_CBR, F_FUN, F_ML, F_MR, F_SHL,
  F_SML, F_SMR, F_FRL, F_FRR, F_UUL, F_UUR, F_LDL, F_LDR, F_PRL, F_PRR, F_STL, F_STR] = FACE_SHAPES.map((_, i) => i);   // (in FACE_SHAPES order)
function faceWeights(W, X, f) {
  W.fill(0);
  const LR = (l, r, v, s = 0) => { if (v > 0) { W[l] += v * clamp(1 + s, 0, 2); W[r] += v * clamp(1 - s, 0, 2); } };
  const a = f.asym, e = X.effort, p = X.pain, ps = X.side;
  // focus: brows a little down, eyes narrowed, lips set
  LR(F_BDL, F_BDR, 0.35 * X.focus, a); LR(F_SQL, F_SQR, 0.18 * X.focus, -a); LR(F_PRL, F_PRR, 0.25 * X.focus * (1 - e) * (1 - p));
  // effort (throwing): breath hissed out through clenched teeth — brows down, squint, nose up, lips pulled back; the punching side harder
  LR(F_BDL, F_BDR, 0.6 * e, X.arm); LR(F_SQL, F_SQR, 0.45 * e, X.arm); LR(F_CSL, F_CSR, 0.35 * e, X.arm); LR(F_NSL, F_NSR, 0.4 * e, X.arm);
  LR(F_UUL, F_UUR, 0.4 * e, X.arm); LR(F_LDL, F_LDR, 0.3 * e, X.arm); LR(F_STL, F_STR, 0.6 * e, X.arm);
  // pain: the brows knot (inner up, pulled down), the face screws up toward the side that was hit, the mouth is dragged that way
  W[F_BI] += 0.75 * p; LR(F_BDL, F_BDR, 0.5 * p, 0.6 * ps); LR(F_SQL, F_SQR, 0.85 * p, 0.6 * ps); LR(F_CSL, F_CSR, 0.7 * p, 0.6 * ps); LR(F_NSL, F_NSR, 0.55 * p, 0.6 * ps);
  LR(F_UUL, F_UUR, 0.45 * p, 0.6 * ps); LR(F_LDL, F_LDR, 0.4 * p, 0.4 * ps); LR(F_STL, F_STR, 0.7 * p, 0.5 * ps); LR(F_FRL, F_FRR, 0.3 * p);
  W[F_ML] += 0.35 * p * Math.max(0, ps); W[F_MR] += 0.35 * p * Math.max(0, -ps);
  // dazed: brows up (lopsided), lips slack and parted, the mouth drifts
  const d = X.daze, dr = Math.sin(f.t * 0.6 + f.F.ph);
  W[F_BI] += 0.45 * d; LR(F_BOL, F_BOR, 0.4 * d, 0.5 + a); LR(F_LDL, F_LDR, 0.3 * d, a); LR(F_FRL, F_FRR, 0.25 * d, -a); W[F_ML] += 0.18 * d * Math.max(0, dr); W[F_MR] += 0.18 * d * Math.max(0, -dr);
  // tired: inner brows up; breathing in through the open mouth, blowing out through pursed lips with the cheeks puffed
  const k = X.tired, b = Math.sin(f.breath), inh = Math.max(0, b), exh = Math.max(0, -b);
  W[F_BI] += 0.35 * k; LR(F_LDL, F_LDR, 0.35 * k * inh); LR(F_STL, F_STR, 0.15 * k * inh); LR(F_CBL, F_CBR, 1.1 * k * exh, 2 * a); W[F_FUN] += 0.4 * k * exh; LR(F_PRL, F_PRR, 0.3 * k * exh);
  // smirk (stare-down): one corner up, that cheek bunched, the mouth pulled over, the other brow down, chin up a touch
  const m = X.smirk, sL = f.smSide > 0;
  W[sL ? F_SML : F_SMR] += 0.8 * m; W[sL ? F_CSL : F_CSR] += 0.4 * m; W[sL ? F_ML : F_MR] += 0.25 * m; W[sL ? F_BDR : F_BDL] += 0.35 * m; W[sL ? F_BOL : F_BOR] += 0.2 * m;
  LR(F_SQL, F_SQR, 0.25 * m); W[F_SHL] += 0.2 * m;
  // the other man's stare: jaw set, lips pressed, brows down
  const mm = X.mean; LR(F_BDL, F_BDR, 0.75 * mm, a); LR(F_SQL, F_SQR, 0.35 * mm); LR(F_PRL, F_PRR, 0.5 * mm); LR(F_NSL, F_NSR, 0.2 * mm); LR(F_FRL, F_FRR, 0.15 * mm); W[F_SHL] += 0.3 * mm;
  // the winner's roar: teeth bared, nose wrinkled, eyes screwed up (the jaw opens wide in Face.update)
  const r = X.roar; LR(F_BDL, F_BDR, 0.85 * r); LR(F_SQL, F_SQR, 0.5 * r); LR(F_CSL, F_CSR, 0.6 * r); LR(F_NSL, F_NSR, 0.75 * r); LR(F_UUL, F_UUR, 0.9 * r); LR(F_LDL, F_LDR, 0.85 * r); LR(F_STL, F_STR, 0.55 * r);
  // the loser on his feet: inner brows up, corners down, chin pushed up
  const sd = X.sad; W[F_BI] += 0.6 * sd; LR(F_FRL, F_FRR, 0.45 * sd, a); W[F_SHL] += 0.45 * sd; LR(F_PRL, F_PRR, 0.2 * sd);
  // knocked out: everything lets go; the lower lip hangs, the mouth sags to one side
  const sl = X.slack; LR(F_LDL, F_LDR, 0.25 * sl, 2 * a); LR(F_FRL, F_FRR, 0.15 * sl); W[a > 0 ? F_ML : F_MR] += 0.15 * sl;
  // the creator's gum-shield view: a wide grimace that shows the teeth (and the guard on them)
  const g = X.show; LR(F_SML, F_SMR, 0.35 * g); LR(F_UUL, F_UUR, 0.95 * g); LR(F_LDL, F_LDR, 0.85 * g); LR(F_STL, F_STR, 0.6 * g); LR(F_CSL, F_CSR, 0.3 * g); LR(F_BOL, F_BOR, 0.2 * g);
  for (let i = 0; i < W.length; i++) W[i] = clamp(W[i], 0, 1);
}
