/* ───────── brass knuckles (issue 52) ─────────
   One rigid metal frame per hand: four finger rings (index…pinky), the bridge joining them over the
   knuckles, and the crossbar the fist grips. It rides on the Hand bone like mmaPads (04c_mma_pads.js):
   world = bone.matrixWorld × local geometry, so the metal follows the fist in the stance, on a punch,
   in the block and through the KO ragdoll. The whole piece is built in the Hand bone's LOCAL frame
   from the LIVE finger bones (measured off the man's own hand skin, which the clips keep curled into
   a fist) — a real knuckle duster is rigid and the fingers curl inside the holes, so nothing floats
   in the air or sinks into the palm. The wraps stay visible underneath. The damage / cut / guard
   constants KNUX live in 07_state_replay_hits.js (one ES module scope with all NN_ files). */
function knuxMat() {   // polished brass: high metalness, a tight highlight, a warm lift in dark places
  return new THREE.MeshStandardMaterial({ color: '#c9a24c', metalness: 0.9, roughness: 0.28, envMapIntensity: 1.2, emissive: '#3a2408', emissiveIntensity: 0.3 });
}
/* a closed parametric surface (u, v wrap around): smooth finite-difference normals, no seam. The
   winding is fixed from the signed volume, so a torus / rounded bar never renders inside out. */
function knuxSurface(fn, nu, nv) {
  const N = (nu + 1) * (nv + 1), pos = new Float32Array(N * 3), nor = new Float32Array(N * 3), uv = new Float32Array(N * 2), col = new Float32Array(N * 3).fill(1), idx = [];
  const p = new V3(), a = new V3(), b = new V3(), c = new V3(), e = 2e-3;
  for (let j = 0, k = 0; j <= nv; j++) for (let i = 0; i <= nu; i++, k++) {
    const s = i / nu, v = j / nv, vc = clamp(v, 0.006, 0.994);
    fn(s, v, p); pos.set([p.x, p.y, p.z], k * 3);
    fn(s + e, vc, a); fn(s - e, vc, b); c.copy(a).sub(b);
    fn(s, vc + e, a); fn(s, vc - e, b); c.cross(a.sub(b)).normalize();
    nor.set([c.x, c.y, c.z], k * 3); uv.set([s, v], k * 2);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = j * (nu + 1) + i, k2 = k + nu + 1; idx.push(k, k + 1, k2, k + 1, k2 + 1, k2); }
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t] * 3, i1 = idx[t + 1] * 3, i2 = idx[t + 2] * 3;
    vol += pos[i0] * (pos[i1 + 1] * pos[i2 + 2] - pos[i1 + 2] * pos[i2 + 1])
         + pos[i0 + 1] * (pos[i1 + 2] * pos[i2] - pos[i1] * pos[i2 + 2])
         + pos[i0 + 2] * (pos[i1] * pos[i2 + 1] - pos[i1 + 1] * pos[i2]);
  }
  if (vol < 0) { for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; } for (let i = 0; i < nor.length; i++) nor[i] = -nor[i]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx); return g;
}
const _knuxD = new V3();
/* a rounded bar / plate: C = centre, A/B/D = its axes, u = world units per cm, h = half-sizes in cm */
function knuxBlob(C, A, B, D, u, h) {
  return knuxSurface((s, v, o) => {
    sphDir(s, v, _knuxD); const k = sqK(_knuxD, 3) * u;
    return o.copy(C).addScaledVector(A, _knuxD.x * k * h[0]).addScaledVector(B, _knuxD.y * k * h[1]).addScaledVector(D, _knuxD.z * k * h[2]);
  }, 18, 12);
}
function knuxGeo(F, S) {
  GEAR.knux = GEAR.knux || {}; if (GEAR.knux[S]) return GEAR.knux[S];
  F.cc.updateMatrixWorld(true);
  const sk = F.body.skeleton, B = F.bones, f = GEAR.HF[S], u = f.u, dom = GEAR.dom, names = GEAR.names;
  const pos = F.body.geometry.attributes.position, n = pos.count, q = new V3(), parts = [], kn = [];
  const invH = B['CC_Base_' + S + '_Hand'].matrixWorld.clone().invert();
  const rel = nm => new M4().multiplyMatrices(sk.boneInverses[sk.bones.indexOf(B['CC_Base_' + S + '_' + nm])], F.body.bindMatrix);
  const W = nm => new V3().setFromMatrixPosition(B['CC_Base_' + S + '_' + nm].matrixWorld).applyMatrix4(invH);   // live bone origin, Hand-local
  const M = nm => new M4().multiplyMatrices(invH, B['CC_Base_' + S + '_' + nm].matrixWorld).multiply(rel(nm));   // bind space → Hand-local, as skinned on that bone
  // the palm / back axes belong to the HAND, not to the curled finger: the finger bone has turned ~90° in the fist,
  // so transforming the bind palm normal by it would leave the bridge pointing out of the side of the hand
  const palmH = f.Z.clone().transformDirection(rel('Hand')).normalize();
  for (const fn of ['Index', 'Mid', 'Ring', 'Pinky']) {
    const p1 = W(fn + '1'), p2 = W(fn + '2'), Ax = p2.clone().sub(p1), L = Ax.length() / u; Ax.normalize();
    const Mf = M(fn + '1'), Bk = palmH.clone().negate(); Bk.addScaledVector(Ax, -Bk.dot(Ax)).normalize();
    const Sd = new V3().crossVectors(Ax, Bk), bi = names.indexOf('CC_Base_' + S + '_' + fn + '1');
    let hb = 0, hp = 0, w = 0, c = 0;
    for (let i = 0; i < n; i++) { if (dom[i] !== bi) continue; q.fromBufferAttribute(pos, i).applyMatrix4(Mf).sub(p1);
      const al = q.dot(Ax) / u; if (al < 0.3 * L || al > 0.8 * L) continue;
      const d = q.dot(Bk) / u; hb = Math.max(hb, d); hp = Math.max(hp, -d); w = Math.max(w, Math.abs(q.dot(Sd)) / u); c++; }
    if (!c) { hb = hp = 0.9; w = 0.9; }
    // flat metal bands (wide along the finger, thin through it), a hole wide enough for the wrapped finger
    const Rx = w + 0.55, Rz = (hb + hp) / 2 + 0.55, tR = 0.30, tA = 0.72;
    const C = p1.clone().addScaledVector(Ax, 0.30 * L * u).addScaledVector(Bk, (hb - hp) / 2 * u);
    parts.push(knuxSurface((s, v, o) => {
      const th = s * 2 * Math.PI, ph = v * 2 * Math.PI, ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
      return o.copy(C).addScaledVector(Sd, (Rx + tR * cp) * ct * u).addScaledVector(Bk, (Rz + tR * cp) * st * u).addScaledVector(Ax, tA * sp * u);
    }, 24, 10));
    kn.push({ p1, Ax, hb });
  }
  // the frame: one bridge across the knuckles, four rounded impact bumps, the palm crossbar and two side rails
  const mid = kn.reduce((s, k) => s.add(k.p1), new V3()).multiplyScalar(1 / 4);
  const Xl = kn[0].p1.clone().sub(kn[3].p1).normalize(), Yl = kn.reduce((s, k) => s.add(k.Ax), new V3()).normalize();
  const Zl = new V3().crossVectors(Xl, Yl).normalize(); if (Zl.dot(palmH) < 0) Zl.negate();   // +z = palm side
  const P = (x, y, z) => mid.clone().addScaledVector(Xl, x * u).addScaledVector(Yl, y * u).addScaledVector(Zl, z * u);
  const xs = kn.map(k => k.p1.clone().sub(mid).dot(Xl) / u), x0 = Math.min(...xs) - 1.0, x1 = Math.max(...xs) + 1.0, xm = (x0 + x1) / 2;
  const zK = kn.reduce((s, k) => s - k.hb, 0) / 4;
  parts.push(knuxBlob(P(xm, 0.9, zK - 0.3), Xl, Yl, Zl, u, [(x1 - x0) / 2, 0.95, 0.62]));
  for (let i = 0; i < 4; i++) parts.push(knuxBlob(P(xs[i], 0.9, zK - 0.65), Xl, Yl, Zl, u, [0.86, 1.05, 0.66]));
  const zP = zK + 2.2;
  parts.push(knuxBlob(P(xm, 0.9, zP), Xl, Yl, Zl, u, [(x1 - x0) / 2 - 0.4, 0.5, 0.42]));   // the bar the curled fingers grip
  for (const x of [x0 + 0.4, x1 - 0.4]) parts.push(knuxBlob(P(x, 0.9, (zK - 0.3 + zP) / 2), Xl, Yl, Zl, u, [0.34, 0.72, (zP - zK + 0.3) / 2 + 0.12]));
  return GEAR.knux[S] = mergeGeos(parts);
}
function knuxPads(F, mat) {   // rigid: world = Hand.matrixWorld × local geometry (one mesh per hand)
  const list = [];
  for (const S of ['L', 'R']) { const b = F.bones['CC_Base_' + S + '_Hand'], m = new THREE.Mesh(knuxGeo(F, S), mat);
    m.matrixAutoUpdate = false; m.castShadow = m.receiveShadow = true; scene.add(m); list.push({ m, b, rel: new M4() }); }
  return list;
}
