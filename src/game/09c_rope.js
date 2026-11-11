/* ───────── the skipping rope: a drill on the mat in the gym ─────────
   A procedural skipping rope for the duel: two rubber handles (a grip of ~15 cm, slightly conical, with a steel bearing at the rope's
   end) and a cord of ~2.7 m (a tube of 5 mm over the simulation's points). The cord is not animated: it is a verlet chain of 41 links
   whose two ends are tied to the handles, and the handles are turned by the wrists — so the cord swings because the hands swing it,
   and it slides over the mat. The boxer's own animation is layered over his pose: the arms down at the hips, the elbows tucked, the
   wrists circling, the feet bouncing on the toes and leaving the mat just as the cord passes under them. If the jump is late the
   cord catches on the feet, the rhythm breaks, and the rotation starts over.
   The drill runs on the mat beside the ring in the gym (13e_loc_boxgym.js): __rope.start() / __rope.stop() / __rope.miss(). ───────── */
const JUMP = {
  on: false, built: false, phase: 0, rphase: 0, rOff: 0, rInit: false, jump: -1, air: 0.24, height: 0.052,
  period: 0.56, snag: 0, free: 0, skip: false, count: 0, grips: [],
};
const JUMP_N = 41, JUMP_LEN = 2.7, JUMP_LINK = JUMP_LEN / (JUMP_N - 1), JUMP_R = 0.0026;
const JR = { ps: null, mesh: null, geo: null, pos: null, nrm: null, ex: [new V3(), new V3()], floor: 0, lastPh: 0, prevZ: 0, bz: 0, bv: 0, bvPrev: 0 };
const _jr = { hip: new V3(), fa: new V3(), z0: new V3(), z: new V3(), x0: new V3(), y0: new V3(), xx: new V3(), yy: new V3(), zz: new V3(), tgt: new V3(), ank: new V3(), ball: new V3(), v1: new V3(), v2: new V3(), q1: new Quat(), q2: new Quat(), m: new M4(), ax: new V3(1, 0, 0) };

/* the cord: a chain of 41 points, the ends pinned to the handles, the rest pulled by gravity and the length constraint */
function jumpBuild() {
  if (JUMP.built) return; JUMP.built = true;
  /* the grip: rubber with a knurl, a steel bearing at the rope's end (the geometry runs from the rope's end up to the butt) */
  const tex = canvasTex(128, 256, (c, w, h) => {
    c.fillStyle = '#191b1e'; c.fillRect(0, 0, w, h);
    for (let i = -h; i < w; i += 7) { c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke(); }
    for (let i = -h; i < w; i += 7) { c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(i + 3.5, 0); c.lineTo(i + 3.5 + h, h); c.stroke(); }
    c.fillStyle = '#c8a12a'; c.fillRect(0, 0, w, 16); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, 16, w, 3);
    for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(255,255,255,${rr() * 0.05})`; c.fillRect(rr() * w, rr() * h, 2, 2); }
  });
  const prof = [[0.0045, 0], [0.0076, 0.004], [0.0076, 0.014], [0.0125, 0.018], [0.0138, 0.032], [0.0154, 0.08], [0.0166, 0.128], [0.0166, 0.138], [0.015, 0.148], [0.0102, 0.154], [0, 0.157]];
  const hgeo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 22);
  const hmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.04 });
  const steel = new THREE.MeshStandardMaterial({ color: '#c6cad0', roughness: 0.25, metalness: 0.95 });
  for (const S of ['L', 'R']) {
    const bone = P1.bones[`CC_Base_${S}_Hand`];
    const g = new THREE.Group();
    const m = new THREE.Mesh(hgeo, hmat); m.castShadow = true; g.add(m);
    const bear = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.013, 14), steel); bear.position.y = 0.0075; bear.castShadow = true; g.add(bear);
    /* the grip in the hand's own frame: the grip axis is the hand's across axis (its local Z — up for the left hand, down for the
       right one), so the rope leaves the fist at the bottom and the butt of the handle sticks out above it */
    const left = S === 'L';
    bone.updateMatrixWorld(true);
    const k = 1 / bone.getWorldScale(_jr.v1).x;    // the bones are scaled down (the model's own units): undo it for the handle
    g.position.set(0, 0.05 * k, (left ? -0.055 : 0.055) * k);
    g.scale.setScalar(k);
    g.rotation.set(left ? Math.PI / 2 : -Math.PI / 2, 0, 0);
    bone.add(g); g.visible = false;
    JUMP.grips.push({ g, bone, side: S, exit: left ? -0.055 : 0.055 });
  }
  /* the cord: a tube of 6 sides over the chain's points */
  const per = 7, uv = new Float32Array(JUMP_N * per * 2), idx = [];
  for (let i = 0; i < JUMP_N; i++) for (let j = 0; j < per; j++) { uv[(i * per + j) * 2] = j / 6; uv[(i * per + j) * 2 + 1] = i / (JUMP_N - 1) * JUMP_LEN / 0.06; }
  for (let i = 0; i < JUMP_N - 1; i++) for (let j = 0; j < 6; j++) {
    const a = i * per + j, b = i * per + (j + 1) % per, c = (i + 1) * per + j, d = (i + 1) * per + (j + 1) % per;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(JUMP_N * per * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(JUMP_N * per * 3), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const ropeTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#b7bbc0'; c.fillRect(0, 0, w, h);
    for (let i = -h; i < w; i += 8) { c.strokeStyle = 'rgba(28,32,38,.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke(); }
    for (let i = -h; i < w; i += 8) { c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 2; c.beginPath(); c.moveTo(i + 3, 0); c.lineTo(i + 3 + h, h); c.stroke(); }
    c.strokeStyle = 'rgba(168,42,32,.45)'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, h * 0.5); c.lineTo(w, h * 0.5); c.stroke();
  });
  ropeTex.wrapS = ropeTex.wrapT = THREE.RepeatWrapping;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ropeTex, roughness: 0.42, metalness: 0.03 }));
  mesh.frustCulled = false; mesh.castShadow = true; mesh.visible = false; scene.add(mesh);
  /* the chain */
  const ps = new PS(JUMP_N, new M4());
  for (let i = 0; i < JUMP_N; i++) ps.setL(i, 0, 0.9, 0);
  for (let i = 0; i < JUMP_N - 1; i++) ps.link(i, i + 1, 1);
  ps.damp = 0.9985; ps.iters = 12; ps.thick = JUMP_R; ps.fric = 0.3;
  ps.inv[0] = 0; ps.inv[JUMP_N - 1] = 0;
  JR.ps = ps; JR.mesh = mesh; JR.geo = geo; JR.pos = geo.attributes.position.array; JR.nrm = geo.attributes.normal.array;
}
/* the cord's shape when it hangs: from the left fist down to the mat in front, under the feet, up behind and to the right fist */
function jumpPath(exL, exR) {
  const pts = exL ? [[exL.x, exL.y, exL.z], [0.24, 0.55, -0.16], [0.4, 0.05, -0.1], [0.34, 0.02, 0.08], [0.08, 0.02, 0.1], [-0.2, 0.02, 0.06], [-0.32, 0.08, -0.04], [-0.2, 0.45, -0.12], [-0.04, 0.8, 0.04], [exR.x, exR.y, exR.z]]
    : [[0.08, 0.92, -0.2], [0.22, 0.55, -0.18], [0.38, 0.05, -0.12], [0.34, 0.02, 0.06], [0.1, 0.02, 0.1], [-0.18, 0.02, 0.08], [-0.3, 0.06, -0.02], [-0.22, 0.45, -0.12], [-0.05, 0.8, 0.02], [0.08, 0.92, 0.2]];
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); seg.push(d); total += d; }
  const out = [];
  for (let i = 0; i < JUMP_N; i++) {
    let s = total * i / (JUMP_N - 1), k = 0;
    while (k < seg.length - 1 && s > seg[k]) { s -= seg[k]; k++; }
    const t = seg[k] ? s / seg[k] : 0;
    out.push(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t, pts[k][2] + (pts[k + 1][2] - pts[k][2]) * t);
  }
  return out;
}
/* where the cord leaves the handles: the rope's end of the grip, in the world */
function jumpExits() {
  for (let i = 0; i < 2; i++) {
    const g = JUMP.grips[i].g; g.updateMatrixWorld(true);
    JR.ex[i].setFromMatrixPosition(g.matrixWorld);
  }
  return JR.ex;
}
/* the pose: the arms down at the hips with the wrists circling, the feet on the toes and off the mat while the cord passes */
function jumpPose(dt) {
  const F = P1, LB = F.limbs(), B = F.bones;
  const snag = JUMP.snag > 0;
  /* the height of the jump: a parabola between the take-off and the landing */
  let h = 0;
  if (JUMP.jump >= 0) {
    JUMP.jump += dt;
    const u = JUMP.jump / JUMP.air;
    if (u >= 1) JUMP.jump = -1; else h = JUMP.height * 4 * u * (1 - u);
  }
  if (JUMP.free > 0) { JUMP.free -= dt; h += 0.045 * Math.sin(Math.min(1, JUMP.free / 0.25) * Math.PI); }   // a hop that shakes the cord off the feet
  if (snag) h -= 0.015;
  F.group.position.y = h;
  F.group.updateMatrixWorld(true);
  F.mpos(F.hip, _jr.hip);
  /* the arms: the fists beside the hips; the hands circle in front of them and the wrists turn — that is what drives the cord */
  for (let i = 0; i < 2; i++) {
    const S = i ? 'R' : 'L', L = LB[S], H = L.hand, sgn = i ? -1 : 1;
    const a = JUMP.phase + (i ? 0.55 : 0);                        // the two wrists are a little out of step
    _jr.tgt.set(_jr.hip.x + sgn * (0.2 + 0.018 * Math.cos(a)),
      _jr.hip.y + (snag ? -0.05 : 0.03) + 0.042 * Math.cos(a),
      _jr.hip.z + (snag ? 0.02 : 0.095) + 0.075 * Math.sin(a));
    F.ik(L.upper, L.fore, H, _jr.tgt);
    F.mpos(H, _jr.v1); F.mpos(L.fore, _jr.v2);
    _jr.fa.subVectors(_jr.v1, _jr.v2).normalize();               // the forearm's axis (elbow → wrist)
    /* the hand's own frame: the fingers point forward, the grip lies across the fist (the hand's local Z — up on the left hand,
       down on the right one, so that the palm faces the body) and the wrist turns about the forearm */
    _jr.y0.set(0, -0.12, 1).normalize();
    _jr.z0.set(0, i ? -1 : 1, 0);
    _jr.x0.crossVectors(_jr.y0, _jr.z0).normalize();              // the palm's normal
    _jr.q1.setFromAxisAngle(_jr.fa, 1.05 * Math.sin(a));
    _jr.xx.copy(_jr.x0).applyQuaternion(_jr.q1);
    _jr.yy.copy(_jr.y0).applyQuaternion(_jr.q1);
    _jr.zz.copy(_jr.z0).applyQuaternion(_jr.q1);
    _jr.m.makeBasis(_jr.xx, _jr.yy, _jr.zz);
    _jr.q2.setFromRotationMatrix(_jr.m);
    F.setMQuat(H, _jr.q2);
  }
  /* (the drill sets the fists itself, so the forearm's twist bones are left as the animation has them) */
  /* the legs: on the toes, and off the mat while the cord is passing under */
  for (let i = 0; i < 2; i++) {
    const S = i ? 'R' : 'L', L = LB[S], f = L.foot, tb = B[`CC_Base_${S}_ToeBase`];
    F.mpos(f, _jr.ank); F.mpos(tb, _jr.ball);
    const dy = _jr.ball.y - _jr.ank.y, dz = _jr.ball.z - _jr.ank.z;
    const pitch = 0.2 + (h > 0.005 ? 0.1 : 0);
    const dy2 = dy * Math.cos(pitch) - dz * Math.sin(pitch);     // the ball's drop if the ankle stays put
    const tuck = h > 0.005 ? 0.022 : 0;
    _jr.tgt.set(_jr.ank.x, _jr.ball.y - dy2 + tuck, _jr.ank.z);
    F.mquat(f, _jr.q2);
    F.ik(L.thigh, L.calf, f, _jr.tgt);
    F.setMQuat(f, _jr.q1.setFromAxisAngle(_jr.ax, pitch).multiply(_jr.q2));
  }
  F.cc.updateMatrixWorld(true);
}
/* the cord: the floor, the feet, the swing */
function jumpCord(dt) {
  const ps = JR.ps; if (!ps) return;
  const ex = jumpExits();
  ps.setL(0, ex[0].x, ex[0].y, ex[0].z);
  ps.setL(JUMP_N - 1, ex[1].x, ex[1].y, ex[1].z);
  ps.targets();
  const sub = dt > 0 ? 3 : 0, h = sub ? dt / sub : 0;
  for (let s = 0; s < sub; s++) { ps.step(h); jumpCollide(h); }
  jumpTube();
  if (dt <= 0) return;
  /* the part of the cord that lies on the mat: where it is (fore and aft of him) and where it is going */
  const p = ps.p, o = ps.o, G = P1.group;
  _jr.v1.set(0, 0, 1).applyQuaternion(G.quaternion);           // the direction he faces
  const fx = _jr.v1.x, fz = _jr.v1.z;
  let sz = 0, sv = 0, n = 0;
  for (let i = 1; i < JUMP_N - 1; i++) {
    const q = 3 * i;
    if (p[q + 1] > JR.floor + 0.04) continue;
    sz += (p[q] - G.position.x) * fx + (p[q + 2] - G.position.z) * fz;
    sv += (p[q] - o[q]) * fx + (p[q + 2] - o[q + 2]) * fz;
    n++;
  }
  if (!n) {                                                   // nothing on the mat: take the lowest point of the cord
    let bi = 0;
    for (let i = 1; i < JUMP_N; i++) if (p[3 * i + 1] < p[3 * bi + 1]) bi = i;
    const q = 3 * bi;
    sz = (p[q] - G.position.x) * fx + (p[q + 2] - G.position.z) * fz;
    sv = (p[q] - o[q]) * fx + (p[q + 2] - o[q + 2]) * fz;
    n = 1;
  }
  const bz = sz / n, bvel = sv / n / h;
  /* the bottom of the cord, smoothed: where it is (in front of him or behind) and where it is going */
  JR.bz += (bz - JR.bz) * 0.3; JR.bv += (bvel - JR.bv) * 0.3;
  /* the phase of the cord's swing (the bottom going forward and back) — the hands follow it */
  const ph = Math.atan2(JR.bz, JR.bv);
  let d = ph - JR.lastPh; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
  JUMP.rphase += d; JR.lastPh = ph;
  if (!JUMP.rInit) { JUMP.rOff = JUMP.rphase - JUMP.phase; JUMP.rInit = true; }
  else JUMP.rOff += (JUMP.rphase - JUMP.phase - JUMP.rOff) * Math.min(1, dt * 2);
  /* the take-off: the cord's bottom has swung to the front of the feet and turns back — he leaves the mat just before it passes */
  const back = JR.bvPrev > 0 && JR.bv <= 0 && JR.bz > 0.01;
  JR.bvPrev = JR.bv;
  if (back && JUMP.jump < 0 && JUMP.snag <= 0 && JUMP.free <= 0) {
    if (JUMP.skip) JUMP.skip = false; else { JUMP.jump = 0; JUMP.count++; }
  }
  JR.prevZ = bz;
}
/* the cord against the mat and against the feet (it catches if he does not jump) */
function jumpCollide(h) {
  const ps = JR.ps, p = ps.p, o = ps.o, floor = JR.floor;
  for (let i = 0; i < JUMP_N; i++) {
    if (ps.inv[i] === 0) continue;
    const k = 3 * i;
    if (p[k + 1] < floor + JUMP_R) {
      p[k + 1] = floor + JUMP_R; o[k + 1] = p[k + 1];            // it does not sink into the mat
      o[k] += (p[k] - o[k]) * 0.05; o[k + 2] += (p[k + 2] - o[k + 2]) * 0.05;   // and it slides along it
    }
  }
  if (P1.group.position.y > 0.02) return;                        // the feet are in the air: the cord passes under them
  const LB = P1.limbs();
  for (let i = 0; i < 2; i++) {
    const S = i ? 'R' : 'L', L = LB[S];
    P1.mpos(L.foot, _jr.ank); P1.mpos(P1.bones[`CC_Base_${S}_ToeBase`], _jr.ball);
    P1.group.localToWorld(_jr.ank); P1.group.localToWorld(_jr.ball);
    const hx = _jr.ank.x + (_jr.ank.x - _jr.ball.x) * 0.6, hz = _jr.ank.z + (_jr.ank.z - _jr.ball.z) * 0.6;   // the heel
    const ay = floor + 0.006, R = 0.022;
    const abx = _jr.ball.x - hx, aby = ay - ay, abz = _jr.ball.z - hz, ab2 = abx * abx + abz * abz;
    for (let j = 0; j < JUMP_N; j++) {
      if (ps.inv[j] === 0) continue;
      const q = 3 * j;
      let s = ((p[q] - hx) * abx + (p[q + 2] - hz) * abz) / (ab2 || 1e-6); s = s < 0 ? 0 : s > 1 ? 1 : s;
      const cx = hx + abx * s, cz = hz + abz * s, dx = p[q] - cx, dz = p[q + 2] - cz, dy = p[q + 1] - ay;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < R * R) {
        const m = R / (Math.sqrt(d2) || 1e-6);
        p[q] = cx + dx * m; p[q + 1] = ay + dy * m; p[q + 2] = cz + dz * m;
        o[q] += (p[q] - o[q]) * 0.5; o[q + 1] += (p[q + 1] - o[q + 1]) * 0.5; o[q + 2] += (p[q + 2] - o[q + 2]) * 0.5;
        if (JUMP.snag <= 0) JUMP.snag = 1.3;                       // it caught on his foot: the rhythm is broken
      }
    }
  }
}
/* the tube over the chain */
function jumpTube() {
  const p = JR.ps.p, P = JR.pos, N = JR.nrm, per = 7;
  for (let i = 0; i < JUMP_N; i++) {
    const a = 3 * (i > 0 ? i - 1 : i), b = 3 * (i < JUMP_N - 1 ? i + 1 : i), q = 3 * i;
    let tx = p[b] - p[a], ty = p[b + 1] - p[a + 1], tz = p[b + 2] - p[a + 2];
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    let ux = 0, uy = 1, uz = 0; if (Math.abs(ty) > 0.9) { ux = 1; uy = 0; }
    let sx = uy * tz - uz * ty, sy = uz * tx - ux * tz, sz = ux * ty - uy * tx;
    const sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
    const nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz = tx * sy - ty * sx;
    for (let j = 0; j < per; j++) {
      const an = j / 6 * 6.2832, c = Math.cos(an), s = Math.sin(an), v = 3 * (i * per + j);
      const vx = nx * c + sx * s, vy = ny * c + sy * s, vz = nz * c + sz * s;
      P[v] = p[q] + vx * JUMP_R; P[v + 1] = p[q + 1] + vy * JUMP_R; P[v + 2] = p[q + 2] + vz * JUMP_R;
      N[v] = vx; N[v + 1] = vy; N[v + 2] = vz;
    }
  }
  JR.geo.attributes.position.needsUpdate = true; JR.geo.attributes.normal.needsUpdate = true;
  JR.geo.computeBoundingSphere();
}
/* the drill itself */
function jumpTick(dt) {
  if (!JUMP.on) return;
  if (JUMP.snag > 0) { JUMP.snag -= dt; if (JUMP.snag <= 0) { JUMP.free = 0.28; JUMP.snag = 0; } }
  if (dt > 0 && JUMP.snag <= 0 && JUMP.free <= 0) {
    const w = 6.2832 / JUMP.period;
    const err = JUMP.rphase - JUMP.rOff - JUMP.phase;             // the cord keeps its own time: the hands follow it
    JUMP.phase += w * dt + clamp(err, -1.6, 1.6) * dt * 1.3;
  }
  jumpPose(dt);
  jumpCord(dt);
}
function jumpStart() {
  if (JUMP.on) return;
  jumpBuild();
  LOCS.boxgym.ropeOn = true;
  setLocation('boxgym');
  LOC.place(false);
  BAG.on = false; BAG.g.visible = false; showP2(false);
  G.state = 'jump'; G.paused = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; G.shake = 0; G.round = 0;
  show('hud', false); show('pad', false); show('vs', false); show('result', false); show('rec', false);
  UI.from = null; uiShow(null);
  P1.place(0, Math.PI / 2, false); P2.place(2.6, -Math.PI / 2, true);   // he faces along the line: the camera sees him from the side
  P1.mark = P1.group.position.clone(); P2.mark = P2.group.position.clone();
  window.__tw = Object.assign(window.__tw || {}, { noPlant: true, noClear: true });
  P1.resetState(); P2.resetState();
  for (const gr of JUMP.grips) gr.g.visible = true;
  JR.mesh.visible = true;
  JUMP.on = true; JUMP.phase = 0; JUMP.rphase = 0; JUMP.rInit = false; JUMP.jump = -1; JUMP.snag = 0; JUMP.free = 0; JUMP.skip = false; JUMP.count = 0;
  JR.floor = 0;                                                   // the top of the mat is the floor of the drill
  jumpPose(0); jumpCord(0);
  const ex = jumpExits(), path = jumpPath(ex[0], ex[1]);
  for (let i = 0; i < JUMP_N; i++) JR.ps.setL(i, path[3 * i], path[3 * i + 1], path[3 * i + 2]);
  JR.ps.build(); JR.ps.reset();
  JR.prevZ = 0; JR.bz = 0; JR.bv = 0; JR.bvPrev = 0;
}
function jumpStop() {
  if (!JUMP.on) return;
  JUMP.on = false;
  for (const gr of JUMP.grips) gr.g.visible = false;
  JR.mesh.visible = false;
  LOCS.boxgym.ropeOn = false;
  const tw = window.__tw || {}; delete tw.noPlant; delete tw.noClear;
  toMenu();
}
function jumpMiss() { if (JUMP.on) JUMP.skip = true; }   // he does not jump: the cord catches on his feet
window.__rope = { start: jumpStart, stop: jumpStop, miss: jumpMiss };
