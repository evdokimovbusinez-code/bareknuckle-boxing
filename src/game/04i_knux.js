/* ───────── knuckle duster (brass knuckles) — issue 54 ─────────
   One piece of metal on each hand: four rings around the first phalanges (index…pinky), a bridge between every pair of rings,
   and a transverse bar the palm presses on (you grip it in the fist). All geometry is built from the hand itself in the body's
   bind space (cm × HF.u, the same frames as the MMA pads in 04c_mma_pads.js), and every part rides rigidly on one bone
   (ring + its bridge halves on the finger's first phalanx, the grip bar on the hand bone) — so the duster follows the fingers
   in the stance, on a punch, in the block and in the knockout ragdoll exactly like the pads do.
   Underneath the rings the hand wraps stay on (look.hands = 'knux' keeps the wrap mesh). */
const KNUX = { dmg: 1.4, cut: 2.5, brk: 15 };   // × damage, × cut chance, + stamina points on the guard-break threshold
// weapons are only allowed in a friendly match if the host switched the rule on (NET.cfg.weap, «Оружие» in the room)
function knuxAllowed() { return G.mode !== 'net' || !!NET.cfg.weap; }
function knuxOn(F) { const L = F && F.gear && F.gear.look; return !!L && L.hands === 'knux' && knuxAllowed(); }
const knuxMat = () => GEAR.knuxMat || (GEAR.knuxMat = new THREE.MeshStandardMaterial({ color: '#b8913f', roughness: 0.3, metalness: 1, envMapIntensity: 1.1 }));
// rings of one hand, in the bind space: [{ bn, geo }] — measured from the hand's own skin, like mmaPadGeo does
function knuxGeo(F, S) {
  GEAR.knux = GEAR.knux || {}; if (GEAR.knux[S]) return GEAR.knux[S];
  const f = GEAR.HF[S], u = f.u, gh = GEAR.gh, gv = GEAR.gv, dom = GEAR.dom, names = GEAR.names, pos = F.body.geometry.attributes.position, n = pos.count;
  const hx = p => q.copy(p).sub(f.H).dot(f.X) / u, hy = p => q.copy(p).sub(f.H).dot(f.Y) / u, bp = nm => GEAR.bpos(S + '_' + nm);
  const q = new V3(), nr = new V3(), TAU = Math.PI * 2, out = [];
  // one ring per finger: an elliptical hoop around the middle of the first phalanx, sized from that bone's own skin
  const RING = ['Index', 'Mid', 'Ring', 'Pinky'], rings = [];
  for (const fn of RING) {
    const P1 = bp(fn + '1'), Ax = bp(fn + '2').sub(P1), L = Ax.length() / u; Ax.normalize();
    const Bk = f.Z.clone().negate(); Bk.addScaledVector(Ax, -Bk.dot(Ax)).normalize(); const Sd = new V3().crossVectors(Ax, Bk);
    let hb = 0, w = 0, c = 0; const bi = names.indexOf('CC_Base_' + S + '_' + fn + '1');
    for (let i = 0; i < n; i++) { if (dom[i] !== bi) continue; q.fromBufferAttribute(pos, i).sub(P1); const al = q.dot(Ax) / u; if (al < 0.3 * L || al > 0.8 * L) continue; hb = Math.max(hb, q.dot(Bk) / u); w = Math.max(w, Math.abs(q.dot(Sd)) / u); c++; }
    if (!c) { hb = 0.9; w = 0.9; }
    const rx = w + 0.34, ry = hb + 0.34, t = 0.38, C = P1.clone().addScaledVector(Ax, 0.5 * L * u);   // the hoop sits mid-phalanx, its bar sunk into the wraps
    out.push({ bn: fn + '1', geo: gridGeo((s, v, p) => { const a = s * TAU, b = v * TAU;   // around the finger (a) and around the bar (b)
      nr.set(Sd.x * Math.cos(a) / rx + Bk.x * Math.sin(a) / ry, Sd.y * Math.cos(a) / rx + Bk.y * Math.sin(a) / ry, Sd.z * Math.cos(a) / rx + Bk.z * Math.sin(a) / ry).normalize();
      return p.copy(C).addScaledVector(Sd, rx * Math.cos(a) * u).addScaledVector(Bk, ry * Math.sin(a) * u).addScaledVector(nr, t * Math.cos(b) * u).addScaledVector(Ax, t * Math.sin(b) * u); }, 24, 12, { c: C }) });
    rings.push({ fn, C, Bk, rx, ry, t, Sd, Ax });
  }
  // the bridge: a half-bar from each ring towards its neighbour, each half riding on its own finger (the two halves meet over the gap)
  for (let i = 0; i < 3; i++) for (const [A, B] of [[rings[i], rings[i + 1]], [rings[i + 1], rings[i]]]) {
    const pts = [new V3().copy(A.C).addScaledVector(A.Bk, (A.ry - A.t) * u),   // anchored inside the ring's own tube
      new V3().lerpVectors(A.C, B.C, 0.5).addScaledVector(A.Bk, (Math.min(A.ry, B.ry) - 0.12) * u)];   // low between the knuckles, not floating
    out.push({ bn: A.fn + '1', geo: pipeGeo(pts, 0.32 * u) });
  }
  // the grip bar: a transverse capsule across the palm below the knuckles, on the hand bone (the fist closes around it)
  const x0 = Math.min(...rings.map(r => hx(r.C))) - 0.35, x1 = Math.max(...rings.map(r => hx(r.C))) + 0.35;
  const yBar = Math.min(...rings.map(r => hy(r.C))) - 2.1;
  let zP = -9; const hiB = names.indexOf('CC_Base_' + S + '_Hand');
  for (let i = 0; i < n; i++) { if (dom[i] !== hiB || gh[i * 3 + 1] !== 4 || gv[i * 4 + 2] !== 0) continue;   // hand-bone skin only
    const x = gv[i * 4 + 3], y = gv[i * 4]; if (y < yBar - 1.1 || y > yBar + 1.1 || x < x0 - 0.5 || x > x1 + 0.5 || gv[i * 4 + 1] > -0.6) continue;
    zP = Math.max(zP, q.fromBufferAttribute(pos, i).sub(f.H).dot(f.Z) / u); }
  if (zP < -8) zP = 1.6;
  const R = 0.52, zBar = zP + R - 0.08, C = f.H.clone().addScaledVector(f.X, (x0 + x1) / 2 * u).addScaledVector(f.Y, yBar * u).addScaledVector(f.Z, zBar * u);
  out.push({ bn: 'Hand', geo: gridGeo((s, v, p) => { const a = s * TAU, k = Math.abs(2 * v - 1) < 0.72 ? 1 : Math.sqrt(Math.max(0, 1 - ((Math.abs(2 * v - 1) - 0.72) / 0.28) ** 2));   // rounded ends
    return p.copy(C).addScaledVector(f.X, ((x1 - x0) / 2) * (2 * v - 1) * u).addScaledVector(f.Y, R * k * Math.cos(a) * u).addScaledVector(f.Z, R * k * Math.sin(a) * u); }, 16, 12, { c: C }) });
  return GEAR.knux[S] = out;
}
function knuxMesh(F, mat) {   // rigid on the bones, exactly like mmaPads: world = bone.matrixWorld × (bone inverse × bind matrix)
  const sk = F.body.skeleton, list = [];
  for (const S of ['L', 'R']) for (const pd of knuxGeo(F, S)) { const b = F.bones['CC_Base_' + S + '_' + pd.bn], m = new THREE.Mesh(pd.geo, mat);
    m.matrixAutoUpdate = false; m.castShadow = m.receiveShadow = true; scene.add(m); list.push({ m, b, rel: new M4().multiplyMatrices(sk.boneInverses[sk.bones.indexOf(b)], F.body.bindMatrix) }); }
  return list;
}
