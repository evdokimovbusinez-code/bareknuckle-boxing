/* ── R-14: close quarters — the two bodies never share space, and a clinch is broken ──
   closePen(A, B) is the metric (debug: __g.bodyOverlap.pen()): every man is a set of capsules read from this frame's bones —
   body volumes (head, spine, shoulder bar, hip bar) and limbs (upper arms, forearms, fists, thighs, shins, feet). The depth is
   the deepest overlap of a limb or body volume of one man with a BODY volume of the other (limb against limb is a guard doing
   its work, not a fault). The radii are a little under the real flesh, so 3 cm of depth is a limb plainly inside the mesh. */
const CLOSE = { head: 0.085, spine: 0.105, sho: 0.07, hip: 0.09, arm: 0.04, fore: 0.035, fist: 0.035, thigh: 0.06, shin: 0.045, foot: 0.035 };
const CAP_N = ['head', 'spine', 'shoulders', 'hips', 'armL', 'armR', 'foreL', 'foreR', 'fistL', 'fistR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'], CAP_BODY = 4;
const _cd1 = new V3(), _cd2 = new V3(), _cdr = new V3(), _cq1 = new V3(), _cq2 = new V3();
function segDist(a0, a1, b0, b1) {   // distance between two segments; the closest points stay in _cq1 (on a) and _cq2 (on b)
  const d1 = _cd1.subVectors(a1, a0), d2 = _cd2.subVectors(b1, b0), r = _cdr.subVectors(a0, b0), a = d1.lengthSq(), e = d2.lengthSq(), f = d2.dot(r);
  let s = 0, t = 0;
  if (a > 1e-9 || e > 1e-9) {
    if (a <= 1e-9) t = clamp(f / e, 0, 1);
    else { const c = d1.dot(r);
      if (e <= 1e-9) s = clamp(-c / a, 0, 1);
      else { const b = d1.dot(d2), den = a * e - b * b; s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0; t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); } } }
  }
  _cq1.copy(a0).addScaledVector(d1, s); _cq2.copy(b0).addScaledVector(d2, t); return _cq1.distanceTo(_cq2);
}
function closeCaps(F) {   // the capsules of F from the bones as they are now (after IK and armClear): [from, to, radius]
  const C = F.caps || (F.caps = CAP_N.map(() => [new V3(), new V3(), 0])), J = F.capJ || (F.capJ = Array.from({ length: 15 }, () => new V3())), LB = F.limbs();
  for (let i = 0; i < 15; i++) J[i].setFromMatrixPosition(F.rb[i].matrixWorld);
  const set = (k, a, b, r) => { C[k][0].copy(a); C[k][1].copy(b); C[k][2] = r; };
  C[0][0].setFromMatrixPosition(_m1.multiplyMatrices(F.head.matrixWorld, HEAD.restInvT)); C[0][1].copy(C[0][0]); C[0][2] = CLOSE.head;
  C[1][0].copy(J[0]).add(J[1]).multiplyScalar(0.5); C[1][0].y += 0.06; C[1][1].copy(J[2]).add(J[3]).multiplyScalar(0.5).lerp(C[1][0], 0.2); C[1][2] = CLOSE.spine;
  set(2, J[2], J[3], CLOSE.sho); set(3, J[0], J[1], CLOSE.hip);
  set(4, J[2], J[5], CLOSE.arm); set(5, J[3], J[7], CLOSE.arm); set(6, J[5], J[6], CLOSE.fore); set(7, J[7], J[8], CLOSE.fore);
  set(8, J[6], _cdr.setFromMatrixPosition(LB.L.mid1.matrixWorld), CLOSE.fist); set(9, J[8], _cdr.setFromMatrixPosition(LB.R.mid1.matrixWorld), CLOSE.fist);
  set(10, J[0], J[9], CLOSE.thigh); set(11, J[1], J[12], CLOSE.thigh); set(12, J[9], J[10], CLOSE.shin); set(13, J[12], J[13], CLOSE.shin);
  set(14, J[10], J[11], CLOSE.foot); set(15, J[13], J[14], CLOSE.foot);
  return C;
}
const closeRes = { d: 0, a: '', b: '', who: 0 };
function closePen(A = P1, B = P2) {   // → { d: deepest overlap in m (0 = none), a: the part that is inside, b: the body volume it is in, who: 0 = A's part in B }
  const CA = closeCaps(A), CB = closeCaps(B), R = closeRes; R.d = 0; R.a = R.b = ''; R.who = 0;
  for (let w = 0; w < 2; w++) { const X = w ? CB : CA, Y = w ? CA : CB;
    for (let i = w ? CAP_BODY : 0; i < X.length; i++) for (let j = 0; j < CAP_BODY; j++) {   // body against body is counted once
      const d = X[i][2] + Y[j][2] - segDist(X[i][0], X[i][1], Y[j][0], Y[j][1]);
      if (d > R.d) { R.d = d; R.a = CAP_N[i]; R.b = CAP_N[j]; R.who = w; }
    } }
  return R;
}
bodyOverlap.pen = closePen;
/* the body volumes the arms are kept out of (armClear → clearSeg): the metric's capsules, 1.5 cm fatter — the spheres of clearPt
   leave the sides of the chest and the upper back open, and a fist was tested as one point (the knuckles) */
const CLR_C = [0.12, 0.085, 0.1];   // spine, shoulder bar, hip bar
function bodyCaps(F) {   // from this frame's joints (F.jp of afterPose; they do not depend on the arms)
  const C = F.bcap || (F.bcap = CLR_C.map(r => [new V3(), new V3(), r])), J = F.jp;
  C[0][0].copy(J[0]).add(J[1]).multiplyScalar(0.5); C[0][0].y += 0.06; C[0][1].copy(J[2]).add(J[3]).multiplyScalar(0.5).lerp(C[0][0], 0.2);
  C[1][0].copy(J[2]); C[1][1].copy(J[3]); C[2][0].copy(J[0]); C[2][1].copy(J[1]);
}
function clearSeg(o, a0, a1, r, sink, push) {   // the largest push that takes the capsule a0–a1 (radius r) out of o's body; `sink`: m a punching fist may go in
  const C = o.bcap; if (!C || BAG.on) return;
  for (let k = 0; k < C.length; k++) { const need = C[k][2] + r - sink, d = segDist(a0, a1, C[k][0], C[k][1]);
    if (d < need && d > 1e-5) { const at = _cq1.distanceTo(a0); _cq1.sub(_cq2).multiplyScalar((need - d) / d); if (_cq1.lengthSq() > push.lengthSq()) { push.copy(_cq1); clearSeg.at = at; } } }
}
function clearHead(o, a0, a1, r, sink, push) {   // the same for his head as a sphere (clearPt's ellipsoid sees the knuckles and the wrist, not the fist between them)
  const hd = _xs2.copy(o.jp[15]), d = segDist(a0, a1, hd, hd), need = CLOSE.head + 0.01 + r - sink;
  if (d < need && d > 1e-5 && !BAG.on) { _cq1.sub(_cq2).multiplyScalar((need - d) / d); if (_cq1.lengthSq() > push.lengthSq()) push.copy(_cq1); }
}
// the upper arm inside his shoulders / head (two punches crossing): the hand is what the IK moves, so the whole arm swings about
// the shoulder — the hand goes `arm length / distance of the contact from the shoulder` times further than the contact point (≤ ×3)
const _xs1 = new V3(), _xs2 = new V3();
function clearUpper(o, sh, el, hw, push) {
  const up = _xs1.set(0, 0, 0); clearSeg(o, sh, el, CLOSE.arm, 0, up);
  const hd = _xs2.copy(o.jp[15]), d = segDist(sh, el, hd, hd), need = CLOSE.head + 0.015 + CLOSE.arm;   // his head as a sphere
  if (d < need && d > 1e-5) { const at = _cq1.distanceTo(sh); _cq1.sub(_cq2).multiplyScalar((need - d) / d); if (_cq1.lengthSq() > up.lengthSq()) { up.copy(_cq1); clearSeg.at = at; } }
  if (up.lengthSq() < 1e-6) return;
  up.multiplyScalar(clamp(sh.distanceTo(hw) / Math.max(0.08, clearSeg.at), 1, 3)); if (up.lengthSq() > push.lengthSq()) push.copy(up);
}
/* the pose of this frame (the lunge of a punch, a duck) has put head / torso / hips into the other man: footwork() takes an
   overlap out a frame late, and a hit-stop then holds that frame for 60–110 ms. So right after both are posed the roots are
   moved apart along the fight line — half each, ≤ SEP_NOW m a frame (the rest is left to footwork), a man on the ropes stays. */
const SEP_NOW = 0.03;
function closeShift(F, dx, d) {
  if (!inRing(_xs1.set(F.group.position.x + dx, 0, F.group.position.z))) return;
  F.adv = Math.max(-2.4, (F.adv || 0) - d); F.advV = Math.min(F.advV || 0, 0); F.group.position.x += dx; F.group.updateMatrixWorld(true);
  for (let i = 0; i < F.jp.length; i++) F.jp[i].x += dx;
  F.headNow.x += dx; F.headNeutral.x += dx;
}
function closeSep(dt) {
  if (dt <= 0 || G.state !== 'fight' || BAG.on || (window.__tw || {}).noSep || !P1.mark || !P2.mark) return;
  const st = F => !F.ko && !F.gu && !F.slide && !F.rag.on && !F.frozen && F.jp[15].y > 1.2;
  if (!st(P1) || !st(P2)) return;
  const fwd = Math.sign(P2.mark.x - P1.mark.x) || 1, pen = bodyOverlap(P1, P2, fwd); if (pen < 0.01) return;
  const d = Math.min(SEP_NOW, pen * 0.5); closeShift(P1, -fwd * d, d); closeShift(P2, fwd * d, d);
}
/* ── the break of a clinch ──
   The distance is the one between the heads along the fight line (closeGap): the roots never come closer than ~1 m, the men
   lean in over their front legs (measured, AI vs turtle: roots p50 1.08 m, heads p50 0.66 m, chests 0.83 m — a 0.55 m limit on
   the roots or the chests would never fire). Heads closer than BRK.near for BRK.hold s and nobody punching or slipping →
   both push off with the forearms (BRK.len s: breakLayer puts the hands on the other man's chest and the arms straighten as the
   gap opens) and footwork() takes them apart until the heads are BRK.apart m from each other. No punch starts meanwhile
   (Fighter.canAct). It runs in the simulation only, so in a P2P bout the host decides and the guest gets the poses. */
const BRK = { near: 0.55, hold: 0.8, len: 0.4, apart: 0.9, tail: 0.05, reach: 0.8, again: 5, lull: 0.1 };
const breakOn = () => !!(G.brk && G.brk.on) && G.state === 'fight';
function closeGap(A, B) { return Math.abs(A.jp[15].x - B.jp[15].x); }
function closeTick(dt) {
  const K = G.brk || (G.brk = { on: false, t: 0, near: 0, gap: 9, n: 0, w: 0 });
  const st = F => !F.ko && !F.gu && !F.slide && !F.rag.on && !F.doomed && !F.liver && !F.frozen;
  if (BAG.on || !st(P1) || !st(P2)) { K.on = false; K.near = 0; K.w = 0; return; }
  K.gap = closeGap(P1, P2);
  if (K.on) {
    K.t += dt; K.w = sstep(0, 0.1, K.t) * (1 - sstep(BRK.len - 0.12, BRK.len + BRK.tail, K.t));
    if (K.t >= BRK.len + BRK.tail) { K.on = false; K.near = 0; K.w = 0; P1.hold = P2.hold = null; }
    return;
  }
  // the clock counts the time spent head to head (it runs back, not to zero, when they part for a moment); the break itself waits
  // for a lull — nobody punching or slipping — with the men still within arm's reach, and not sooner than BRK.again s after the last
  const quiet = !P1.cur && !P2.cur && !P1.dodge && !P2.dodge;
  K.near = K.gap < BRK.near ? Math.min(BRK.hold + 0.4, K.near + dt) : Math.max(0, K.near - dt); K.q = quiet ? (K.q || 0) + dt : 0;
  if (((K.near >= BRK.hold && K.q >= BRK.lull && K.gap < BRK.reach && G.t - (K.last ?? -9) > BRK.again) || K.force) && quiet && !(window.__tw || {}).noBreak) {
    K.on = true; K.t = 0; K.n++; K.force = false; K.last = G.t; AI.t = Math.max(AI.t, 0.45); AI.combo = 0;   // the AI takes a breath before it comes back in
  }
}
// footwork's target while the break is on: back until the chests are BRK.apart apart (both move, so each takes a little over half)
// (the first 0.08 s the hands come up onto his chest, then the push)
function breakAdv(F, a) { return G.brk.t < 0.08 ? a : a - Math.max(0, BRK.apart + 0.02 - G.brk.gap) * 0.6; }
const _bk1 = new V3(), _bk2 = new V3(), _bk3 = new V3();
function breakLayer(F) {
  const K = G.brk, w = K.w, o = F.other, LB = F.limbs(), B = F.bones, fwd = Math.sign(o.group.position.x - F.group.position.x) || 1;
  if (w <= 0.001) return;
  F.rot(B.CC_Base_Spine02, -0.07 * w * sstep(0.1, 0.3, K.t), 0, 0); F.cc.updateMatrixWorld(true);
  // forearm against forearm: each hand goes to the middle between its own shoulder and his shoulder on the same side (a little
  // toward the centre line, at chest height), so the two men's hands meet there — elbows bent while they are close, the arms
  // straighten as the gap opens (the IK reaches as far as the arm goes); armClear keeps the hands out of his body
  const oc = _bk3.copy(o.jp[2]).add(o.jp[3]).multiplyScalar(0.5);
  for (const S of ['L', 'R']) {
    const L = LB[S], tg = _bk1.setFromMatrixPosition(L.upper.matrixWorld), hw = _bk2.setFromMatrixPosition(L.hand.matrixWorld), hs = o.jp[S === 'L' ? 3 : 2];
    tg.add(hs).multiplyScalar(0.5); tg.z = lerp(tg.z, oc.z, 0.3); tg.x -= fwd * 0.05; tg.y -= 0.2;   // under the chins: the heads are what is close
    F.ik(L.upper, L.fore, L.hand, F.group.worldToLocal(hw.lerp(tg, w)));
  }
  F.cc.updateMatrixWorld(true);
}
bodyOverlap.gap = closeGap; bodyOverlap.BRK = BRK; bodyOverlap.breakNow = () => { if (G.brk) G.brk.force = true; };   // debug: __g.bodyOverlap.breakNow()
