/* #87 the fighter's motion after the player's shadow boxing (docs/ref/shadow/README.md, sheet_a.jpg / sheet_b.jpg).
   Layers over the clips, nothing here changes a punch's timing (PUNCH: impact, windows):
   · FIST — a closed fist on both hands in every state of the fight (fistPose, called at the end of Fighter.update after every other
     layer; the knockout ragdoll alone lets the hand open: Ragdoll.apply unclenches from the fist it captured);
   · FORM.lead / rear — the stance guard when no block is held (Fighter.pose: lead fist in front of the face at nose level, rear fist
     at the cheek; an arm lets go of it while its punch clip plays and comes straight back as the clip fades);
   · FORM rhythm — he never stands like a statue: a springy bounce, the weight rocking from foot to foot, a small turn of the trunk;
   · FORM.P — a punch from the legs: hips / trunk turn into it, the weight goes onto the front leg, the rear heel comes off the canvas
     (Fighter.plantFeet turns the planted rear foot about its ball by F.heelUp);
   · FORM.slip* — a slip bends the knees and the waist, not just the neck. */
const FIST = {
  on: true,
  // flexion of each finger joint, rad = the angle between a phalanx and the bone before it (the first phalanx against the metacarpal,
  // wrist → knuckle). Was: the clips' half-open hook (fingers fanned) + BLK.clench 0.78 rad on the first phalanx, in the high guard
  // only. Now: 88° / 100° / 75° everywhere — the #87 check wants ≥ 70° at every joint of every finger (`__fist.min(F)`).
  mcp: 1.54, pip: 1.75, dip: 1.31,
  // thumb over the middle phalanges of the index and middle fingers: its IP joint goes to the middle of the index's middle phalanx,
  // the tip to the middle finger's, both lifted out of the fist by tOut and shifted to the thumb side by tSide (× that phalanx's length);
  // the thumb's metacarpal takes t1 of its turn (the rest is in the phalanges)
  tOut: 0.75, tSide: 0.35, t1: 0.6,
};
const FORM = {
  on: true,
  // stance guard, the WRIST's target off the head centre, model space (x + = his left side, y up, z toward the opponent), metres.
  // Was: no layer — the idle clip's hands, both fists level at the temples and equally far out. Now (the reference): lead fist in
  // front of the face at nose level ~25 cm out, rear fist pulled back to the cheek / chin, elbows down on the ribs (BLK.pole*).
  lead: [0.03, -0.145, 0.33], rear: [-0.075, -0.15, 0.14],
  // rhythm in the stance (new): the hips dip 0…bob m at hz (a springy bounce), rock ±sway m along the fight line at hz / 2 (the
  // weight from the front foot to the rear one), the trunk turns ±yaw rad; at empty stamina only (1 − tiredK) of it is left.
  // A dazed man has his own sway (Fighter.pose: dz) — the bounce fades with it.
  hz: 1.7, bob: 0.016, sway: 0.014, yaw: 0.05, tiredK: 0.65,
  // a punch from the legs (new), per punch: [hips + trunk turn rad (+ = right shoulder forward), hips forward m, rear heel lift rad,
  // trunk pitch rad (+ = forward / down)]. Rear-hand punches turn the rear foot (heel up), the lead ones barely.
  P: { jab: [-0.05, 0.015, 0, 0], cross: [0.28, 0.05, 0.45, 0.04], hookL: [-0.26, 0.02, 0, 0], hookR: [0.30, 0.04, 0.45, 0], upperL: [-0.14, 0.02, 0, 0], upperR: [0.22, 0.04, 0.40, -0.04], over: [0.32, 0.06, 0.5, 0.14] },
  // pk: share of the turn / weight shift above that is applied (the heel lift and the pitch are not scaled). Balance bench, masher /
  // mover · normal, n = 6, bot accuracy: layers off 38 / 40 %, pk = 1 → 32 / 33 % (the fist left the clip's path to the target),
  // pk = 0.5 → 34 / 38 % (within the noise of n = 6)
  pk: 0.5,
  // a slip (startDodge 'slipL' / 'slipR'): extra knee bend (m of hip drop) and waist bend toward the slip (rad). Was: −0.05 m and
  // the trunk's roll only — it read as a neck move.
  slipDrop: 0.05, slipBend: 0.10,
};
function fistRig(F) {
  if (F.fistR) return F.fistR;
  const B = F.bones;
  // a bone's own axis (toward its child) in its local frame; the last phalanx has no child: it carries on its parent's line in the bind
  const ax = b => { const ch = b.children.find(c => c.isBone); return ch ? ch.position.clone().normalize() : b.position.clone().normalize().applyQuaternion(F.bindQ.get(b).clone().invert()); };
  const hands = ['L', 'R'].map(S => {
    const n = f => B[`CC_Base_${S}_${f}`];
    return { S, H: n('Hand'), sign: F.palmSign[S],
      fingers: ['Index', 'Mid', 'Ring', 'Pinky'].map(f => [1, 2, 3].map(i => ({ b: n(f + i), ax: ax(n(f + i)) }))),
      thumb: [1, 2, 3].map(i => ({ b: n('Thumb' + i), ax: ax(n('Thumb' + i)) })) };
  });
  return F.fistR = { hands, ok: hands.every(h => h.H && h.fingers.every(c => c.every(j => j.b && j.b.parent && (j === c[0] ? j.b.parent === h.H : true))) && h.thumb.every(j => j.b) && h.thumb[0].b.parent === h.H) };
}
const _fY = new V3(), _fT = new V3(), _fZ = new V3(), _fA = new V3(), _fM = new V3(), _fD = new V3(), _fC = new V3(), _fP = new V3(), _fJ = new V3();
const _fIp = new V3(), _fTip = new V3(), _fQi = new Quat(), _fQv = new Quat(), _fR = new Quat(), _fI = new Quat();
/* Everything in the hand bone's frame (the finger roots are its children): the palm frame from the bind offsets of the finger roots,
   each phalanx turned (shortest arc) onto its wanted direction = the metacarpal line folded about the finger's own flexion axis by the
   summed joint angles. No world matrices — the caller refreshes the hands' matrices after. */
function fistPose(F, w = 1) {
  if (!FIST.on || w <= 0) return;
  const R = fistRig(F); if (!R.ok) return;
  for (const h of R.hands) {
    const fg = h.fingers;
    _fY.copy(fg[1][0].b.position).normalize();
    _fT.subVectors(fg[0][0].b.position, fg[3][0].b.position); _fT.addScaledVector(_fY, -_fT.dot(_fY)).normalize();
    _fZ.crossVectors(_fY, _fT).multiplyScalar(h.sign);   // palm side: the fingers fold this way
    let len = 0.02;
    for (let f = 0; f < 4; f++) {
      const ch = fg[f]; _fM.copy(ch[0].b.position).normalize();
      _fA.crossVectors(_fM, _fZ).normalize();
      _fQi.identity(); _fJ.copy(ch[0].b.position);
      let ang = 0;
      for (let k = 0; k < 3; k++) {
        const b = ch[k].b; ang += k === 0 ? FIST.mcp : k === 1 ? FIST.pip : FIST.dip;
        _fD.copy(_fM).applyAxisAngle(_fA, ang);                               // wanted, hand frame
        _fC.copy(_fD).applyQuaternion(_fQv.copy(_fQi).invert());              // … in the parent's frame
        _fP.copy(ch[k].ax).applyQuaternion(b.quaternion);                     // where it points now, parent's frame
        _fR.setFromUnitVectors(_fP, _fC); if (w < 1) _fR.slerp(_fI, 1 - w);
        b.quaternion.premultiply(_fR); _fQi.multiply(b.quaternion);
        // the middle of the middle phalanx of the index (→ thumb IP joint) and the middle finger (→ thumb tip)
        if (k === 0 && f < 2) { const nx = ch[1].b.position; _fJ.add(_fP.copy(nx).applyQuaternion(_fQi)); }
        if (k === 1 && f < 2) { const nx = ch[2].b.position; len = nx.length(); const m = _fP.copy(nx).applyQuaternion(_fQi).multiplyScalar(0.5).add(_fJ);
          (f === 0 ? _fIp : _fTip).copy(m).addScaledVector(_fZ, FIST.tOut * len).addScaledVector(_fT, FIST.tSide * len); }
      }
    }
    const th = h.thumb; _fQi.identity(); _fJ.copy(th[0].b.position);
    for (let k = 0; k < 3; k++) {
      const b = th[k].b;
      _fD.subVectors(k < 2 ? _fIp : _fTip, _fJ); if (_fD.lengthSq() < 1e-12) break; _fD.normalize();
      _fC.copy(_fD).applyQuaternion(_fQv.copy(_fQi).invert());
      _fP.copy(th[k].ax).applyQuaternion(b.quaternion);
      _fR.setFromUnitVectors(_fP, _fC); { const s = (k === 0 ? FIST.t1 : 1) * w; if (s < 1) _fR.slerp(_fI, 1 - s); }
      b.quaternion.premultiply(_fR); _fQi.multiply(b.quaternion);
      if (k < 2) _fJ.add(_fP.copy(th[k + 1].b.position).applyQuaternion(_fQi));
    }
    h.H.updateMatrixWorld(true);
  }
}
/* the check: smallest flexion (deg) at any joint of any finger of F's hands, read back from the bones as they are now */
function fistMin(F) {
  const R = fistRig(F); let a = 999, where = '';
  if (!R.ok) return { a: -1, where: 'rig' };
  if (F.rag.on && F.rag.mode === 'ko') return { a, where };
  for (const h of R.hands) for (let f = 0; f < 4; f++) {
    const ch = h.fingers[f]; _fM.copy(ch[0].b.position).normalize(); _fQi.identity();
    for (let k = 0; k < 3; k++) { _fQi.multiply(ch[k].b.quaternion); _fD.copy(ch[k].ax).applyQuaternion(_fQi);
      const d = _fM.angleTo(_fD) * 57.2958; if (d < a) { a = d; where = `${h.S} ${['Index', 'Mid', 'Ring', 'Pinky'][f]}${k + 1}`; } _fM.copy(_fD); }
  }
  return { a, where };
}
/* punch envelope of each arm and the leg drive, once per pose(): w = the punch clip's weight (rises in 0.08 s, fades 0.24 s after the
   release), times how far the clip is from its start to the impact */
function formPunch(F, o) {
  o.L = 0; o.R = 0; o.yaw = 0; o.fwd = 0; o.heel = 0; o.pitch = 0; o.any = 0;
  if (!FORM.on) return o;
  for (const n of PN) { const w = F.w[n]; if (!(w > 0.001)) continue; const P = PUNCH[n], a = F.act[n]; o[P.arm] += w; o.any += w;
    const e = w * sstep(P.start, P.impact, a.time), D = FORM.P[n]; if (!D) continue;
    o.yaw += e * D[0] * FORM.pk; o.fwd += e * D[1] * FORM.pk; o.heel += e * D[2]; o.pitch += e * D[3]; }
  o.any = Math.min(1, o.any); return o;
}
/* the stance rhythm at G.t: [hip dip (≤ 0), hip shift along z, trunk yaw]; 0 in a punch, a dodge, a daze, out of the fight */
function formRhythm(F, dz, o) {
  o.y = 0; o.z = 0; o.yaw = 0;
  if (!FORM.on) return o;
  const k = (1 - FORM.tiredK * (1 - clamp(F.stamina / 100, 0, 1))) * (1 - Math.min(1, dz)) * (F.dodge ? 0 : 1) * (G.state === 'replay' ? 0 : 1);
  if (k <= 0) return o;
  const t = G.t * FORM.hz * 2 * Math.PI + (F.ph || 0) * 3;
  o.y = -FORM.bob * k * (0.5 - 0.5 * Math.cos(t)); o.z = FORM.sway * k * Math.sin(t / 2); o.yaw = FORM.yaw * k * Math.sin(t / 2 + 0.6);
  return o;
}
const _fmP = {}, _fmR = {}, _fmS = new V3(), _fmA = new V3(), _fmM = new THREE.Matrix4(), _fmQ = new Quat();
/* #87 the rear heel comes off the canvas in a punch: the planted foot turns about its ball by F.heelUp rad (Fighter.plantFeet).
   o = ankle → ball (world), turned in place; q = the foot's model quaternion, turned the same way; returns the toe's counter-turn axis */
const _fmQ2 = new Quat();
function heelLift(F, o, h) {
  if (o.x * o.x + o.z * o.z < 1e-8) return false;
  _fmA.set(o.z, 0, -o.x).normalize();                       // up × (toe direction): o turns down, the ankle comes up
  o.applyAxisAngle(_fmA, h);
  const sc = F.group.scale, mir = sc.x * sc.y * sc.z < 0;
  _fmA.transformDirection(_fmM.copy(F.group.matrixWorld).invert());   // → model axes (the group only turns about y, P2 is mirrored)
  (F.heelAx || (F.heelAx = new V3())).copy(_fmA); F.heelA = mir ? -h : h;
  return true;
}
/* the foot's model quaternion turned with the heel; after it is set, the toes turn back so they stay flat on the canvas */
function heelFoot(F, q) { return _fmQ.setFromAxisAngle(F.heelAx, F.heelA).multiply(q); }
function heelToe(F, toe) { if (toe) F.setMQuat(toe, _fmQ.setFromAxisAngle(F.heelAx, -F.heelA).multiply(F.mquat(toe, _fmQ2))); }
window.__fist = { FIST, FORM, min: fistMin, rig: fistRig };
