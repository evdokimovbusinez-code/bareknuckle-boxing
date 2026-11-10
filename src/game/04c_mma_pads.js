/* ───────── MMA gloves: the rigid pads over the thin shell (mmaShell in 04b_gloves_headgear.js) ───────── */
const pillowE = t => Math.sqrt(Math.max(0, 1 - Math.abs(2 * t - 1) ** 3));   // pillow edge profile, 0 at the rims
// pads of one hand, in the body's bind space (cm × HF.u): [{ bn: bone name, geo }]. Sized from the hand itself: the back of the hand is
// fitted with z = c0 + c1·x + c2·y + c3·x² (hand frame: x thumb side, y along the fingers, z palm), each phalanx is measured around its bone.
function mmaPadGeo(F, S) {
  GEAR.mmaPad = GEAR.mmaPad || {}; if (GEAR.mmaPad[S]) return GEAR.mmaPad[S];
  const f = GEAR.HF[S], u = f.u, gh = GEAR.gh, gv = GEAR.gv, dom = GEAR.dom, names = GEAR.names, pos = F.body.geometry.attributes.position, n = pos.count, q = new V3(), d = new V3(), out = [];
  const hx = p => q.copy(p).sub(f.H).dot(f.X) / u, hy = p => q.copy(p).sub(f.H).dot(f.Y) / u, bp = nm => GEAR.bpos(S + '_' + nm);
  // back of the hand: least squares over its skin
  const A = [0, 1, 2, 3].map(() => [0, 0, 0, 0]), b = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) { if (gh[i * 3 + 1] !== 4 || gh[i * 3 + 2] < 2 || names[dom[i]].indexOf('_' + S + '_') < 0 || gv[i * 4 + 2] !== 0 || gv[i * 4 + 1] < 0.6 || gv[i * 4] < 1.5 || gv[i * 4] > 10.5) continue;
    const x = gv[i * 4 + 3], y = gv[i * 4], z = q.fromBufferAttribute(pos, i).sub(f.H).dot(f.Z) / u, r = [1, x, y, x * x];
    for (let j = 0; j < 4; j++) { b[j] += r[j] * z; for (let k = 0; k < 4; k++) A[j][k] += r[j] * r[k]; } }
  for (let i = 0; i < 4; i++) { A[i][i] += 1e-6; let p = i; for (let r = i + 1; r < 4; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < 4; r++) { const k = A[r][i] / A[i][i]; for (let c = i; c < 4; c++) A[r][c] -= k * A[i][c]; b[r] -= k * b[i]; } }
  for (let i = 3; i >= 0; i--) { for (let c = i + 1; c < 4; c++) b[i] -= A[i][c] * b[c]; b[i] /= A[i][i]; }
  const pI = bp('Index1'), pP = bp('Pinky1'), xi = hx(pI), yi = hy(pI), xp = hx(pP), yp = hy(pP), x0 = xp - 0.75, x1 = xi + 0.75;
  out.push({ bn: 'Hand', geo: gridGeo((s, v, o) => { const x = lerp(x0, x1, s), t = (x - xp) / (xi - xp), y = lerp(2.3, lerp(yp, yi, t) + 0.9 * (1 - (2 * t - 1) ** 2) - 0.5, v);   // from above the wrist to the knuckle line
    const z = b[0] + b[1] * x + b[2] * y + b[3] * x * x - 0.3 - 1.25 * pillowE(s) * pillowE(v) * (1 - 0.22 * Math.exp(-(((v - 0.52) / 0.05) ** 2)));   // (a stitched line across the middle)
    return o.copy(f.H).addScaledVector(f.X, x * u).addScaledVector(f.Y, y * u).addScaledVector(f.Z, z * u); }, 20, 20, { c: f.H.clone().addScaledVector(f.Y, 6 * u).addScaledVector(f.Z, 4 * u), ku: 3, kv: 3 }) });
  // a roll over each first phalanx, reaching back over the knuckle
  for (const fn of ['Index', 'Mid', 'Ring', 'Pinky']) {
    const P1 = bp(fn + '1'), Ax = bp(fn + '2').sub(P1), L = Ax.length() / u; Ax.normalize();
    const Bk = f.Z.clone().negate(); Bk.addScaledVector(Ax, -Bk.dot(Ax)).normalize(); const Sd = new V3().crossVectors(Ax, Bk), bi = names.indexOf('CC_Base_' + S + '_' + fn + '1');
    let hb = 0, w = 0, c = 0;
    for (let i = 0; i < n; i++) { if (dom[i] !== bi) continue; q.fromBufferAttribute(pos, i).sub(P1); const al = q.dot(Ax) / u; if (al < 0.3 * L || al > 0.8 * L) continue; hb = Math.max(hb, q.dot(Bk) / u); w = Math.max(w, Math.abs(q.dot(Sd)) / u); c++; }
    if (!c) { hb = 0.9; w = 0.9; }
    const sx = w + 0.2, sy = (0.95 * L + 0.7) / 2, sz = 1.6, C = P1.clone().addScaledVector(Ax, (0.95 * L - 0.7) / 2 * u).addScaledVector(Bk, (hb + 0.7) * u);   // top 2.3 cm above the finger's skin
    out.push({ bn: fn + '1', geo: gridGeo((s, v, o) => { sphDir(s, v, d); const k = sqK(d, 3) * u; return o.copy(C).addScaledVector(Sd, d.x * k * sx).addScaledVector(Ax, d.y * k * sy).addScaledVector(Bk, d.z * k * sz); }, 16, 12, { c: C, ku: 2, kv: 1.5 }) });
  }
  return GEAR.mmaPad[S] = out;
}
function mmaPads(F, mat) {   // rigid: world matrix = bone.matrixWorld × (bone inverse × bind matrix), exactly what skinning does with weight 1
  const sk = F.body.skeleton, list = [];
  for (const S of ['L', 'R']) for (const pd of mmaPadGeo(F, S)) { const b = F.bones['CC_Base_' + S + '_' + pd.bn], m = new THREE.Mesh(pd.geo, mat);
    m.matrixAutoUpdate = false; m.castShadow = m.receiveShadow = true; scene.add(m); list.push({ m, b, rel: new M4().multiplyMatrices(sk.boneInverses[sk.bones.indexOf(b)], F.body.bindMatrix) }); }
  return list;
}
