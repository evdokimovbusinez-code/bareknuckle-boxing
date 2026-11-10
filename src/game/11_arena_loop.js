/* (the ring's own light rig — top spot, canvas bounce, far hall lamps — lives in LOCS.gym, src/game/13_locations.js) */

/* ───────── rope visuals: while a body is in the rope the drawn line follows the contact (a V from post to post through the
   deepest point); once it is free it rings out as a damped string (~2.5 Hz, a few visible swings) */
/* the ring frame: keep the ropes' world ends current, hide the side(s) between the camera and the fighters */
function arenaSync() {
  ARENA.updateMatrixWorld(true); const cam = camera.position;
  for (const R of ROPES) {
    R.a.copy(R.aL).applyMatrix4(ARENA.matrixWorld); R.b.copy(R.bL).applyMatrix4(ARENA.matrixWorld);
    const nW = _v1.copy(R.n).transformDirection(ARENA.matrixWorld), mid = _v2.addVectors(R.a, R.b).multiplyScalar(0.5);
    R.m.visible = _v3.subVectors(cam, mid).dot(nW) > -0.35;   // n points into the ring: camera outside this side → hide it
  }
}
// where a world point is in the ring (ring frame, metres)
const ringPt = (p, out = new V3()) => out.copy(p).applyMatrix4(_m4a.copy(ARENA.matrixWorld).invert());
const _m4a = new M4();
// how far a ring-frame point is inside the boundary of the current location (metres; < 0 = outside): the ropes of the square ring or the bale circle
const edgeDist = l => { const b = LOC.bound; return b.kind === 'circle' ? b.r - Math.hypot(l.x, l.z) : b.half - Math.max(Math.abs(l.x), Math.abs(l.z)); };
const inRing = (p, m = 0) => edgeDist(ringPt(p, _v6)) > m;
/* circling: F moves sideways by s metres (s > 0 = away from the camera) around the other man — done by turning the ring frame
   about him the opposite way, so both stay on the world x line facing each other */
function circleStep(F, s) {
  const O = F.other.group.position, rx = F.group.position.x - O.x; if (Math.abs(rx) < 0.3) return false;
  const saveP = ARENA.position.clone(), saveY = ARENA.rotation.y;
  const ph = (-s) / rx;   // world turn about O that carries F by −s in z
  const d = _v4.copy(ARENA.position).sub(O), c = Math.cos(ph), sn = Math.sin(ph);
  ARENA.position.set(O.x + d.x * c + d.z * sn, 0, O.z - d.x * sn + d.z * c); ARENA.rotation.y += ph; ARENA.updateMatrixWorld(true);
  if (!inRing(F.group.position, 0) || !inRing(F.other.group.position, 0)) { ARENA.position.copy(saveP); ARENA.rotation.y = saveY; ARENA.updateMatrixWorld(true); return false; }
  return true;
}
function ropeTick(dt) {
  arenaSync();
  if (dt <= 0) return;
  const w = 2 * Math.PI * 2.4, z = 0.09;
  for (const R of ROPES) {
    if (R.hit) { const nv = R.hit; R.vel.copy(nv).sub(R.cur).multiplyScalar(1 / dt).clampLength(0, 4); R.cur.copy(nv); R.hit = null; R.live = 1; }
    else if (R.live) {
      R.vel.addScaledVector(R.cur, -w * w * dt).multiplyScalar(Math.exp(-2 * z * w * dt)); R.cur.addScaledVector(R.vel, dt);
      if (R.cur.lengthSq() < 1e-7 && R.vel.lengthSq() < 1e-5) { R.cur.set(0, 0, 0); R.vel.set(0, 0, 0); R.live = 0; }
    } else continue;
    if (!R.m) continue;
    const pos = R.m.geometry.attributes.position, A = pos.array, B = R.base, d = _v1.copy(R.cur).applyQuaternion(R.m.getWorldQuaternion(_rq).invert());
    const len = R.a.distanceTo(R.b), sc = clamp(R.s, 0.05, 0.95);
    for (let i = 0; i < A.length; i += 3) { const s = B[i + 1] / len + 0.5, f = s < sc ? s / sc : (1 - s) / (1 - sc); A[i] = B[i] + d.x * f; A[i + 1] = B[i + 1] + d.y * f; A[i + 2] = B[i + 2] + d.z * f; }
    pos.needsUpdate = true; R.m.geometry.computeBoundingSphere();
  }
}

/* ───────── main loop ───────── */
let last = performance.now();
function frame(now) {
  const dtReal = Math.min(0.05, (now - last) / 1000); last = now; G.real += dtReal;
  let simDt = 0;
  if (G.state === 'replay') simDt = stepReplay(dtReal);
  if (G.state !== 'replay') {
    if (G.slowT > 0) { G.slowT -= dtReal; if (G.slowT <= 0) G.slow = 1; }
    let dt = dtReal * G.slow; if (G.hitstop > 0) { G.hitstop -= dtReal; dt = 0; }
    G.t += dt; simDt = dt;
    if (G.state === 'fight') { playerInput(); ai(dt); }
    else if (G.state === 'ko' || G.state === 'kd') { if (followOK(P1)) playerInput(); aiFollow(); }
    P1.aimTarget = aimFor(P1, P2); P2.aimTarget = aimFor(P2, P1);
    P1.update(dt); P2.update(dt);
    // both men are posed: now keep each one's arms out of the other's head and torso (against this frame's head, not last frame's)
    for (const F of [P1, P2]) { F.head.updateMatrixWorld(true); F.headFrame.multiplyMatrices(F.head.matrixWorld, HEAD.restInvT); F.headFrameInv.copy(F.headFrame).invert(); armSegs(F); }
    P1.armClear(); P2.armClear(); P1.armClear(); P2.armClear();   // twice: the second pass catches what the first IK left
    if (G.state === 'kd') kdTick(dt);
    if ((G.state === 'fight' || G.state === 'ko' || G.state === 'kd') && dt > 0) recFrame();
    stateTick(dtReal);
  }
  P1.simulate(simDt); P2.simulate(simDt);
  ropeTick(simDt); bagStep(simDt);
  FX.update(simDt); MIST.update(simDt);
  camUpdate(dtReal); locSync(); hudUpdate(dtReal); resTick(dtReal);   // locSync: the location hides what stands between the camera and the fighters
  composer.render();
  requestAnimationFrame(frame);
}

