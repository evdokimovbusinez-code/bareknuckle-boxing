/* ───────── the police baton (R-18, story chapter 2 «Патруль») ─────────
   A straight rubber baton (ПР-73 style: knob, a flange past the little finger, a long shaft) gripped in one fist. Like the brass
   knuckles (04i_knux.js) it is one rigid mesh on the Hand bone: world = Hand.matrixWorld × local geometry, built once in the
   Hand-local frame from the live finger bones (the clips keep the hand curled into a fist), so it follows the stance, the
   punch, the guard and the KO ragdoll, and the replay for free.
   What it does in the fight (only in a story bout whose opponent's look has `weapon: 'baton'` — Fighter.handGear sets gear.baton):
   · reach: Fighter.knuckle() of the baton arm returns a point on the shaft BATON.reach m beyond the middle knuckle, so the contact
     test, the graze check and the aim all work off the shaft; aimFor (07) pulls the IK target of the hand back by the same offset —
     the shaft lands on the face where the knuckles would have;
   · damage ×BATON.dmg (resolveHit / followHit, 07); the wind-up runs at ×BATON.slow (startPunch, 05) — the swing is easier to read.
   It sits in the LEAD hand (L): the camera sees that side of the opponent, and the lead hand is the one that keeps a man on the
   end of the stick (STYLES.cop in 19_story.js stands off and pokes with it). */
const BATON = { arm: 'L', reach: 0.25, dmg: 1.3, slow: 0.78, tilt: 0.6, r: 1.6, butt: 13, tip: 3 };   // m, ×, ×, rad toward the punch line, cm
function batonMat() { return new THREE.MeshStandardMaterial({ color: '#2b2d31', roughness: 0.32, metalness: 0.08, envMapIntensity: 1.4 }); }   // black rubber with a sheen: a plain #16 black vanished against dark clothes in the wide shot
function batonGeo(F) {
  if (GEAR.baton) return GEAR.baton;
  F.cc.updateMatrixWorld(true);
  const S = BATON.arm, B = F.bones, u = GEAR.HF[S].u, invH = B['CC_Base_' + S + '_Hand'].matrixWorld.clone().invert();
  const W = nm => new V3().setFromMatrixPosition(B['CC_Base_' + S + '_' + nm].matrixWorld).applyMatrix4(invH);   // live bone origin, Hand-local
  const FN = ['Index', 'Mid', 'Ring', 'Pinky'];
  // the grip: the centre of the tube the curled fingers make (knuckle, middle and end joints of each finger, averaged)
  const C = new V3(); for (const f of FN) for (const k of [1, 2, 3]) C.add(W(f + k)); C.multiplyScalar(1 / 12);
  const Xl = W('Index1').sub(W('Pinky1')).normalize();                     // little finger → index: out of the thumb side of the fist
  const kn = W('Mid1'), fwd = FN.reduce((s, f) => s.add(W(f + '1')), new V3()).multiplyScalar(0.25).normalize();   // wrist → knuckles
  fwd.addScaledVector(Xl, -fwd.dot(Xl)).normalize();
  const A = Xl.clone().multiplyScalar(Math.cos(BATON.tilt)).addScaledVector(fwd, Math.sin(BATON.tilt)).normalize();   // the shaft: thumb side, tipped toward the punch
  // the striking point: on the shaft, BATON.reach from the middle knuckle (|C + A·s − kn| = R, the far root); the tip a little past it
  const d = C.clone().sub(kn), R = BATON.reach * 100 * u, ad = A.dot(d), s = -ad + Math.sqrt(Math.max(0, ad * ad - d.lengthSq() + R * R));
  const tip = s / u + BATON.tip, r = BATON.r, b = -BATON.butt;
  // one lathe profile along +y in cm: knob, grip, the flange past the little finger, the shaft, a rounded tip
  const prof = [[0, b - 0.6], [1.3, b - 0.6], [2.1, b - 0.1], [2.2, b + 0.7], [1.8, b + 1.5], [r, b + 2.1], [r, -6.6], [2.8, -6.3], [2.8, -5.6], [r, -5.3],
    [r, tip - 1.3], [r * 0.85, tip - 0.45], [r * 0.5, tip - 0.05], [0, tip]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(prof, 14);
  const P = new V3(1, 0, 0); if (Math.abs(P.dot(A)) > 0.9) P.set(0, 0, 1); P.addScaledVector(A, -P.dot(A)).normalize();
  const Q = new V3().crossVectors(P, A);
  g.applyMatrix4(new M4().makeBasis(P, A, Q).scale(new V3(u, u, u)).setPosition(C));
  GEAR.batonHit = C.clone().addScaledVector(A, s);   // Hand-local: Fighter.knuckle() of the baton arm
  return GEAR.baton = g;
}
function batonMesh(F) {   // rigid: world = Hand.matrixWorld × local geometry
  const m = new THREE.Mesh(batonGeo(F), GEAR.batonMat || (GEAR.batonMat = batonMat()));
  m.matrixAutoUpdate = false; m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
  return { m, b: F.bones['CC_Base_' + BATON.arm + '_Hand'] };
}
/* where the shaft is minus where the middle knuckle is (world): aimFor pulls the hand's IK target back by this */
function batonOff(F, out) {
  F.knuckle(out); return out.sub(_batonK.setFromMatrixPosition(F.bones['CC_Base_' + BATON.arm + '_Mid1'].matrixWorld));
}
const _batonK = new V3();
const batonArm = (F, n) => !!(F.gear && F.gear.baton) && PUNCH[n] && PUNCH[n].arm === BATON.arm;
