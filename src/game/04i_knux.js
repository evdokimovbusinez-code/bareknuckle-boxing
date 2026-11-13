/* ───────── brass knuckles (кастет): a hand item (added to ITEMS in 04e_wardrobe.js as 'knux') ─────────
   Four rings over the fingers (Index..Pinky), a crossbar over the knuckles and a palm bar gripped in the
   fist. Built in bind space, attached rigidly to the bones exactly like mmaPads (04c_mma_pads.js): each
   ring and the knuckle crossbar follow their finger bone, the palm bar follows the Hand bone — so they
   track the hand in the stance, the punch, the block and the KO ragdoll, and never float off the fist.
   Material: metal (brass by default), high metalness. The wraps stay under it (handGear keeps them drawn). */
function knuxRingGeo(C, a, R, r) {   // a torus around unit axis a, centred at C (bind space, cm)
  let e1 = new V3(1, 0, 0); if (Math.abs(e1.dot(a)) > 0.9) e1.set(0, 1, 0);
  e1.addScaledVector(a, -e1.dot(a)).normalize(); const e2 = new V3().crossVectors(a, e1).normalize();
  return gridGeo((u, v, o) => { const ct = Math.cos(u * 6.2832), st = Math.sin(u * 6.2832), cs = Math.cos(v * 6.2832), sn = Math.sin(v * 6.2832), rr = R + r * cs;
    return o.copy(C).addScaledVector(e1, rr * ct).addScaledVector(e2, rr * st).addScaledVector(a, r * sn); }, 22, 9, { c: C });
}
function knuxGeo(F, S) {
  GEAR.knux = GEAR.knux || {}; if (GEAR.knux[S]) return GEAR.knux[S];
  const f = GEAR.HF[S], u = f.u, dom = GEAR.dom, names = GEAR.names, pos = F.body.geometry.attributes.position, n = pos.count, q = new V3(), out = [];
  const bp = nm => GEAR.bpos(S + '_' + nm);
  const fns = ['Index', 'Mid', 'Ring', 'Pinky'], cen = [];
  for (const fn of fns) {
    const P1 = bp(fn + '1'), Ax = bp(fn + '2').sub(P1), L = Ax.length() / u; Ax.normalize();
    const Bk = f.Z.clone().negate(); Bk.addScaledVector(Ax, -Bk.dot(Ax)).normalize(); const Sd = new V3().crossVectors(Ax, Bk);
    let hb = 0, w = 0, c = 0; const bi = names.indexOf('CC_Base_' + S + '_' + fn + '1');
    for (let i = 0; i < n; i++) { if (dom[i] !== bi) continue; q.fromBufferAttribute(pos, i).sub(P1); const al = q.dot(Ax) / u; if (al < 0.1 * L || al > 0.9 * L) continue; hb = Math.max(hb, q.dot(Bk) / u); w = Math.max(w, Math.abs(q.dot(Sd)) / u); c++; }
    if (!c) { hb = 0.9; w = 0.9; }
    const rad = Math.max(w, hb, 0.7), off = 0.6;   // the finger passes through the hole just past the knuckle
    const C = P1.clone().addScaledVector(Ax, off * u);
    cen.push({ C, Bk, Ax, rad, id: fn + '1' });
    out.push({ bn: fn + '1', geo: knuxRingGeo(C, Ax, rad + 0.26, 0.30) });   // the finger ring
    const d0 = C.clone().addScaledVector(Bk, rad), d1 = C.clone().addScaledVector(Bk, rad + 0.9);   // a dorsal knuckle cap (the striking point)
    out.push({ bn: fn + '1', geo: pipeGeo([d0, d1], 0.5) });
  }
  const dorsal = c => c.C.clone().addScaledVector(c.Bk, c.rad + 0.55);
  for (let i = 0; i < 3; i++) out.push({ bn: fns[i] + '1', geo: pipeGeo([dorsal(cen[i]), dorsal(cen[i + 1])], 0.34) });   // the crossbar, per finger bone
  const palm = cen.map(c => c.C.clone().addScaledVector(c.Bk, -(c.rad + 0.45)).addScaledVector(f.Y, -1.1 * u));   // the grip under the palm
  out.push({ bn: 'Hand', geo: pipeGeo(palm, 0.4) });
  return GEAR.knux[S] = out;
}
const KNUX_METAL = { gold: '#c9a24a', steel: '#a9acb2' };
function knuxMat(c) { return new THREE.MeshStandardMaterial({ color: KNUX_METAL[c] || c || KNUX_METAL.gold, metalness: 0.96, roughness: 0.3, envMapIntensity: 1.5 }); }
function knuxMesh(F, mat) {
  const sk = F.body.skeleton, list = [];
  for (const S of ['L', 'R']) for (const pd of knuxGeo(F, S)) {
    const b = F.bones['CC_Base_' + S + '_' + pd.bn], m = new THREE.Mesh(pd.geo, mat);
    m.matrixAutoUpdate = false; m.castShadow = m.receiveShadow = true; scene.add(m);
    list.push({ m, b, rel: new M4().multiplyMatrices(sk.boneInverses[sk.bones.indexOf(b)], F.body.bindMatrix) });
  }
  return list;
}
// debug: __g.P1.gear.knux
