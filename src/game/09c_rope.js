/* ───────── training: the skipping rope — the model, the cord's physics and the drill's pose ─────────
   P1 skips on the gym mat (`boxgym`); the cord is turned by his wrists, not by an animation of the rope.
   Model   — two handles (0.157 m, slightly conical, a leather grip, a steel bearing end the cord leaves) and a 2.7 m cord:
             a 5 mm tube rebuilt from the simulation's points every frame. All procedural, PBR maps from canvas, no files.
   Rig     — the handles are rigid gear bound to CC_Base_L_Hand / CC_Base_R_Hand with the same bind-matrix trick the gloves
             use (world = bone.matrixWorld × rel), so they sit in the fists whatever the pose does. On top of the live idle
             animation the arms are posed with the game's own two-bone IK (`ik`): upper arms down at the sides, elbows tucked
             back, the hands carried round a small circle in front of the hips — that circle, through the handle, turns the cord.
             The fingers are curled round the handle in the fist's own frame (knuckle line forward, palm toward the body).
   Physics — the cord is a verlet chain of 40 links pinned to the two handles: gravity, air drag, length constraints
             (Gauss–Seidel, the ends weighted 0) and a floor collision at the mat. A missed hop is a real collision: the links
             hit the capsules of the ankles and shins, the cord snags, loses its swing and lies on the mat until the wrists
             pick it up again.
   Why the hop has to be timed: the cord hangs from the fists at ~0.83 m and its loop has a radius of L/2π ≈ 0.43 m, so the
             bottom of the loop sits right on the mat — the feet have to be off it exactly when the middle link passes under
             them. The hop is driven by the cord's *measured* angle (not by the wrist phase), so a lagging cord is still jumped
             correctly, and a late hop means the ankles get hit. */

const SKIPC = {
  N: 40,                       // links of the cord
  LEN: 2.70,                   // m, handle to handle (the usual length for a 1.8 m man)
  R: 0.0025,                   // cord radius: a 5 mm tube
  FLOOR: 0,                    // the mat's top: on the drill spot the gym is shifted so the fighters stand at world y = 0
  OMEGA: 2 * Math.PI * 2.0,    // rad/s of the wrists — two turns, and so two hops, a second
  SPIN: 2 * Math.PI * 2.0,     // rad/s the cord is already turning at when he starts (a rope does not start from rest)
  AIR: 0.215,                  // s in the air
  HOP: 0.095,                  // m, apex of the hop
  TAKE: 1.30,                  // rad: the middle link is this far before the bottom when he leaves the mat
  DRAG: 0.085,                 // quadratic air drag on the cord, 1/m
  ASSIST: 3.4,                 // 1/s: how hard the stirred air drags the cord along (see ropeStep)
  VMAX: 6.5,                   // m/s: the cord's own speed is never driven past this — the top of the loop is pulled in, not flung out
  ITER: 14, SUB: 4,            // length-constraint sweeps per substep, substeps per frame
};
const SKIP = {
  on: false, g: null, rig: null, built: false,
  st: 'idle',                  // idle (hanging / on the mat) · spin · tangle (just snagged)
  t: 0, th: 0, drive: 0, ang: 0, pang: null, omega: 0, angOK: false,
  air: false, jt: 1, dip: 0, dipV: 0, jumps: 0, streak: 0, best: 0, misses: 0, noJump: 0, watch: 0,
  P: null, O: null, Q: null, A: [new V3(), new V3()], bodies: [],   // positions, previous positions, the frame's start, anchors, capsules
};
const RTAU = Math.PI * 2;
const _ra = new V3(), _rc = new V3(), _re1 = new V3(), _re2 = new V3(), _rb1 = new V3(), _rb2 = new V3();
const _rp1 = new V3(), _rp2 = new V3(), _rp3 = new V3(), _rp4 = new V3(), _rp5 = new V3(), _rp6 = new V3();
const _rpX = new V3(1, 0, 0), _rpU = new V3(0, 1, 0), _rpF = new V3(0, 0, 1);
const _rpq1 = new Quat(), _rpq2 = new Quat(), _rm1 = new M4();

/* ── the model ── */
function ropeTex() {                 // the grip: leather grain, a spiral wrap seam and the scuffs of a well-used handle
  const W = 512, H = 256, cc = document.createElement('canvas'), rc = document.createElement('canvas');
  cc.width = rc.width = W; cc.height = rc.height = H;
  const c = cc.getContext('2d'), o = rc.getContext('2d');
  let s = 20260111; const R = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  c.fillStyle = '#2b2119'; c.fillRect(0, 0, W, H);
  o.fillStyle = 'rgb(0,170,0)'; o.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {   // pebbled grain (the roughness map rides along: the lighter spots are rougher)
    const x = R() * W, y = R() * H, r = 1 + R() * 2.6, k = R() < 0.5;
    c.fillStyle = `rgba(${k ? '94,74,54' : '12,9,7'},${0.05 + R() * 0.16})`; c.beginPath(); c.ellipse(x, y, r, r * 0.7, R() * 3, 0, 7); c.fill();
    o.fillStyle = `rgba(0,${k ? 235 : 95},0,${0.04 + R() * 0.1})`; o.beginPath(); o.ellipse(x, y, r, r * 0.7, R() * 3, 0, 7); o.fill();
  }
  for (let k = 0; k < 9; k++) {      // the spiral wrap: a dark seam with a lit lip
    const y0 = (k + 0.5) * H / 9, t = x => y0 + Math.sin(x / W * RTAU * 2 + k) * 5;
    c.strokeStyle = 'rgba(0,0,0,.42)'; c.lineWidth = 3.2; c.beginPath(); for (let x = 0; x <= W; x += 8) c.lineTo(x, t(x)); c.stroke();
    c.strokeStyle = 'rgba(148,122,90,.3)'; c.lineWidth = 1.2; c.beginPath(); for (let x = 0; x <= W; x += 8) c.lineTo(x, t(x) - 2.4); c.stroke();
    o.strokeStyle = 'rgba(0,225,0,.35)'; o.lineWidth = 3.2; o.beginPath(); for (let x = 0; x <= W; x += 8) o.lineTo(x, t(x)); o.stroke();
  }
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const rough = new THREE.CanvasTexture(rc); rough.anisotropy = 4; rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  return { map, rough };
}
/* the handle: mesh +Y is the butt end (up, at the wrist); the bearing end the cord leaves is at −Y */
function ropeHandleGeo() {
  const V = a => a.map(([r, y]) => new THREE.Vector2(r, y));
  const grip = new THREE.LatheGeometry(V([[0.0146, -0.0622], [0.0158, -0.0570], [0.0170, -0.0320], [0.0181, -0.0020],
    [0.0183, 0.0190], [0.0178, 0.0400], [0.0170, 0.0530], [0.0188, 0.0620], [0.0180, 0.0690], [0.0152, 0.0750],
    [0.0092, 0.0778], [0.0000, 0.0784]]), 24);
  const steel = new THREE.LatheGeometry(V([[0.0000, -0.0790], [0.0076, -0.0785], [0.0106, -0.0758], [0.0120, -0.0712],
    [0.0124, -0.0670], [0.0140, -0.0640], [0.0146, -0.0622]]), 24);
  const collar = new THREE.CylinderGeometry(0.0150, 0.0150, 0.0055, 24).translate(0, -0.0605, 0);
  return { grip, steel, collar };
}
/* the cord's tube: (N+1) rings of RSIDE sides; positions and normals are rewritten from the simulation every frame */
const RSIDE = 6;
function ropeTubeGeo() {
  const N = SKIPC.N, vc = (N + 1) * RSIDE, idx = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < RSIDE; j++) {
    const a = i * RSIDE + j, b = i * RSIDE + (j + 1) % RSIDE, c = (i + 1) * RSIDE + (j + 1) % RSIDE, d = (i + 1) * RSIDE + j;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vc * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vc * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(vc * 2);
  for (let i = 0; i <= N; i++) for (let j = 0; j < RSIDE; j++) { const k = i * RSIDE + j; uv[k * 2] = (j + 0.5) / RSIDE; uv[k * 2 + 1] = i / N * 30; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function ropeCordTex() {             // a woven braid: two opposing helices over a dark core
  return canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = '#232529'; c.fillRect(0, 0, w, h);
    for (const [dir, col] of [[1, 'rgba(152,158,170,.5)'], [-1, 'rgba(98,104,116,.5)']]) {
      c.strokeStyle = col; c.lineWidth = 3;
      for (let k = -8; k < 16; k++) { c.beginPath(); for (let y = 0; y <= h; y += 4) c.lineTo(((dir * y + k * 8) % w + w) % w, y); c.stroke(); }
    }
  });
}
/* the meshes, built once on the first start: two handle groups (driven from the hand bones) and the cord tube */
function ropeBuild() {
  if (SKIP.built) return; SKIP.built = true;
  const g = SKIP.g = new THREE.Group(); g.visible = false; scene.add(g);
  const T = ropeTex(), HG = ropeHandleGeo();
  const gripMat = new THREE.MeshPhysicalMaterial({ map: T.map, roughnessMap: T.rough, roughness: 0.78, metalness: 0, clearcoat: 0.16, clearcoatRoughness: 0.5, envMapIntensity: 0.5 });
  const steelMat = new THREE.MeshStandardMaterial({ color: '#b3b7bd', roughness: 0.28, metalness: 0.95, envMapIntensity: 0.9 });
  SKIP.handles = [0, 1].map(() => {
    const hg = new THREE.Group(); hg.matrixAutoUpdate = false;
    for (const [geo, mat] of [[HG.grip, gripMat], [HG.steel, steelMat], [HG.collar, steelMat]]) {
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; hg.add(m);
    }
    g.add(hg); return hg;
  });
  const cord = SKIP.cord = new THREE.Mesh(ropeTubeGeo(), new THREE.MeshStandardMaterial({ map: ropeCordTex(), color: '#949aa4', roughness: 0.6, metalness: 0.05, envMapIntensity: 0.6 }));
  cord.matrixAutoUpdate = false; cord.frustumCulled = false; g.add(cord);
  SKIP.P = new Float32Array((SKIPC.N + 1) * 3); SKIP.O = new Float32Array((SKIPC.N + 1) * 3); SKIP.Q = new Float32Array((SKIPC.N + 1) * 3);
}
/* The bind frames of the two hands: the anatomical basis of the T-pose (X = knuckles → index, Y = fingers, Z = palm) plus the
   rotation that takes the bone's own frame into it. The desired hand poses and the handle mounts are written in that basis. */
function ropeBindRig(F) {
  const save = F.allBones.map(b => b.quaternion.clone());
  for (const b of F.allBones) { const q = F.bindQ.get(b); if (q) b.quaternion.copy(q); }
  F.cc.updateMatrixWorld(true);
  const B = F.bones, out = { F, hand: {}, foot: {} };
  const world = n => new V3().setFromMatrixPosition(B[n].matrixWorld);
  for (const S of ['L', 'R']) {
    const h = B[`CC_Base_${S}_Hand`], hp = world(`CC_Base_${S}_Hand`);
    const X = world(`CC_Base_${S}_Index1`).sub(world(`CC_Base_${S}_Pinky1`)).normalize();
    const Y = world(`CC_Base_${S}_Mid1`).sub(hp).normalize();
    X.addScaledVector(Y, -X.dot(Y)).normalize();
    const Z = new V3().crossVectors(X, Y).multiplyScalar(S === 'R' ? 1 : -1);
    const q0 = F.mquat(h, new Quat());
    const H = out.hand[S] = { X, Y, Z, hp, bone: h, q0, Qrel: new Quat().setFromRotationMatrix(_rm1.makeBasis(X, Y, Z)).invert().multiply(q0) };
    for (const f of ['Thumb', 'Index', 'Mid', 'Ring', 'Pinky']) H[f] = [1, 2, 3].map(i => B[`CC_Base_${S}_${f}${i}`]).filter(Boolean);
    /* the handle rides the fist: it lies along the fingers (butt up at the wrist, the bearing end below the little finger) */
    const Yh = Y.clone().negate(), Xh = Z.clone(), Zh = new V3().crossVectors(Xh, Yh);
    const at = hp.clone().addScaledVector(Y, 0.065);
    H.rel = new M4().makeBasis(Xh, Yh, Zh).setPosition(at).premultiply(h.matrixWorld.clone().invert());
    H.anchor = new V3(0, -0.0810, 0);   // where the cord leaves the handle
  }
  for (const S of ['L', 'R']) { out.foot[S] = {}; for (const n of ['Thigh', 'Calf', 'Foot', 'ToeBase']) out.foot[S][n] = B[`CC_Base_${S}_${n}`]; }
  for (let i = 0; i < save.length; i++) F.allBones[i].quaternion.copy(save[i]);
  F.cc.updateMatrixWorld(true);
  return out;
}
/* The swing frame: the line through the two handles is the axis the cord turns about. `ax` is that line, `e1` is up across it
   and `e2 = ax × e1`; `C` (in _rc) is the centre of the loop — one radius below the fists, which is what puts the bottom of a
   2.7 m cord on the mat when the hands are at hip height. */
function ropeFrame() {
  const ax = _ra.subVectors(SKIP.A[0], SKIP.A[1]);
  if (ax.lengthSq() < 1e-8) ax.set(1, 0, 0); else ax.normalize();
  _rc.addVectors(SKIP.A[0], SKIP.A[1]).multiplyScalar(0.5); _rc.y -= SKIPC.LEN / RTAU;
  const e1 = _re1.copy(_rpU).addScaledVector(ax, -_rpU.dot(ax));
  if (e1.lengthSq() < 1e-6) e1.set(0, 0, 1); else e1.normalize();
  _re2.crossVectors(ax, e1);
}
/* Lay the cord out as the loop it already is when it is going round — a circle of radius L/2π about C, joined to the two
   handle ends — and set it turning. Starting from a spinning loop instead of a slack sag is what keeps the chain stable:
   a motor driving a rope up from rest whips it out of shape instead of bringing it up to speed. */
function ropeSeed(spin) {
  const P = SKIP.P, O = SKIP.O, N = SKIPC.N, R = SKIPC.LEN / RTAU;
  ropeFrame();
  const ax = _ra, C = _rc, e1 = _re1, e2 = _re2;
  for (let i = 0; i <= N; i++) {
    const k = 3 * i, th = i / N * RTAU, c = Math.cos(th) * R, s2 = Math.sin(th) * R, e = clamp(Math.min(i, N - i) / 6, 0, 1);
    const tx = C.x + e1.x * c + e2.x * s2, ty = C.y + e1.y * c + e2.y * s2, tz = C.z + e1.z * c + e2.z * s2;
    const A = i < N / 2 ? SKIP.A[0] : SKIP.A[1];
    P[k] = A.x + (tx - A.x) * e; P[k + 1] = A.y + (ty - A.y) * e; P[k + 2] = A.z + (tz - A.z) * e;
    if (spin) {   // already turning: the velocity of a point of the loop about the axis
      const wx = spin * (ax.y * (P[k + 2] - C.z) - ax.z * (P[k + 1] - C.y)) / 60,
        wy = spin * (ax.z * (P[k] - C.x) - ax.x * (P[k + 2] - C.z)) / 60,
        wz = spin * (ax.x * (P[k + 1] - C.y) - ax.y * (P[k] - C.x)) / 60;
      O[k] = P[k] - wx; O[k + 1] = P[k + 1] - wy; O[k + 2] = P[k + 2] - wz;
    }
  }
  if (!spin) O.set(P);
  SKIP.Q.set(P);
  ropeConstrain(30);
  SKIP.omega = spin || 0; SKIP.pang = null; SKIP.angOK = false;
}
function ropeReset() {
  Object.assign(SKIP, { st: 'idle', t: 0, th: 0, drive: 0, omega: 0, pang: null, angOK: false, air: false, jt: 1, dip: 0, dipV: 0, noJump: 0, watch: 0 });
}

/* ── physics ── */
/* Gauss–Seidel on the link lengths; the two ends are pinned to the handles (weight 0) */
function ropeConstrain(iters) {
  const P = SKIP.P, N = SKIPC.N, pitch = SKIPC.LEN / N, a = SKIP.A[0], b = SKIP.A[1];
  for (let it = 0; it < iters; it++) {
    P[0] = a.x; P[1] = a.y; P[2] = a.z; P[N * 3] = b.x; P[N * 3 + 1] = b.y; P[N * 3 + 2] = b.z;
    for (let i = 0; i < N; i++) {
      const j = 3 * i, dx = P[j + 3] - P[j], dy = P[j + 4] - P[j + 1], dz = P[j + 5] - P[j + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, e = (L - pitch) / L * 0.5;
      P[j] += dx * e; P[j + 1] += dy * e; P[j + 2] += dz * e; P[j + 3] -= dx * e; P[j + 4] -= dy * e; P[j + 5] -= dz * e;
    }
  }
  P[0] = a.x; P[1] = a.y; P[2] = a.z; P[N * 3] = b.x; P[N * 3 + 1] = b.y; P[N * 3 + 2] = b.z;
}
/* the capsules the cord must not go through: the ankles and shins of the skipping man, and his trunk (world space).
   The feet stand close together, so the two ankle capsules meet on the middle line — that is what a late hop hits. */
function ropeBodies(F) {
  const o = SKIP.bodies, B = F.bones; let n = 0;
  const at = (bone, v) => v.setFromMatrixPosition(bone.matrixWorld);
  const put = (a, b, r) => { const c = o[n] || (o[n] = { a: new V3(), b: new V3(), r: 0 }); c.a.copy(a); c.b.copy(b); c.r = r; n++; };
  for (const S of ['L', 'R']) { const L = SKIP.rig.foot[S];
    put(at(L.Calf, _rb1), at(L.Foot, _rb2), 0.070);
    put(at(L.Foot, _rb1), at(L.ToeBase, _rb2), 0.075);
    put(at(L.Thigh, _rb1), at(L.Calf, _rb2), 0.082);
  }
  put(at(F.hip, _rb1), at(B.CC_Base_Spine02, _rb2), 0.165);
  return n;
}
function ropeStep(dt) {
  if (!SKIP.on || !SKIP.rig) return;
  const F = SKIP.rig.F, N = SKIPC.N, P = SKIP.P, O = SKIP.O, R = SKIP.rig.hand;
  for (const [i, S] of [[0, 'L'], [1, 'R']]) {
    const hl = SKIP.handles[i], H = R[S];
    hl.matrix.multiplyMatrices(H.bone.matrixWorld, H.rel);
    SKIP.A[i].copy(H.anchor).applyMatrix4(hl.matrix);
  }
  if (dt <= 0) { ropeTube(); return; }
  dt = Math.min(dt, 1 / 30);
  const h = dt / SKIPC.SUB;
  SKIP.Q.set(P);                   // the frame's start, so the cord's own rate can be read off the whole chain
  ropeFrame();
  const ax = _ra, C = _rc, e1 = _re1, e2 = _re2;
  const bodies = SKIP.bodies, nb = ropeBodies(F);
  const wa = SKIPC.ASSIST * SKIP.drive * h, w = SKIPC.OMEGA * SKIP.drive, vmax = SKIPC.VMAX;
  let hitI = -1, hitV = 0;
  for (let sub = 0; sub < SKIPC.SUB; sub++) {
    const d2 = Math.exp(-h * 0.35);
    for (let i = 1; i < N; i++) {
      const j = 3 * i;
      let vx = (P[j] - O[j]) * d2, vy = (P[j + 1] - O[j + 1]) * d2, vz = (P[j + 2] - O[j + 2]) * d2;
      const kd = SKIPC.DRAG * Math.sqrt(vx * vx + vy * vy + vz * vz) * h;      // quadratic air drag
      if (kd > 0.4) { const s = 0.4 / kd; vx *= s; vy *= s; vz *= s; }
      else { vx *= 1 - kd; vy *= 1 - kd; vz *= 1 - kd; }
      O[j] = P[j]; O[j + 1] = P[j + 1]; O[j + 2] = P[j + 2];
      P[j] += vx; P[j + 1] += vy + 9.81 * h * h; P[j + 2] += vz;
      /* The wrists stir the air round the swing axis and the cord is dragged along by it: the torque the wrists pump into the
         cord, written as turbulent drag against air moving at w·r. Two things keep this honest — the drive falls to nothing
         over the last few links, so the fists are never yanked, and the target speed is capped, so the chain cannot be pumped
         past what the links can hold. (The pin motion alone, a ~6 cm circle at 2 rev/s, would take half a minute to spin a
         2.7 m cord up from rest: the wrists mostly *keep* it going, they do not start it.) */
      if (wa > 0 && SKIP.st !== 'tangle') {
        const dx = P[j] - C.x, dy = P[j + 1] - C.y, dz = P[j + 2] - C.z;
        const k = dx * ax.x + dy * ax.y + dz * ax.z;                            // along the axis there is no swirl
        const px = dx - ax.x * k, py = dy - ax.y * k, pz = dz - ax.z * k;
        const pl = Math.sqrt(px * px + py * py + pz * pz) || 1e-6;
        const g = clamp(Math.min(i, N - i) / 5, 0, 1);                          // the fist holds its end: the speed dies away there
        const sp = Math.min(w * pl, vmax) / pl * g;
        P[j] += ((ax.y * pz - ax.z * py) * sp - vx) * wa;
        P[j + 1] += ((ax.z * px - ax.x * pz) * sp - vy) * wa;
        P[j + 2] += ((ax.x * py - ax.y * px) * sp - vz) * wa;
      }
    }
    ropeConstrain(SKIPC.ITER);
    /* the mat: no sinking through it, and the cord slips along instead of bouncing */
    for (let i = 1; i < N; i++) {
      const j = 3 * i;
      if (P[j + 1] < SKIPC.FLOOR) {
        P[j + 1] = SKIPC.FLOOR; O[j + 1] = P[j + 1];
        O[j] += (P[j] - O[j]) * 0.12; O[j + 2] += (P[j + 2] - O[j + 2]) * 0.12;
      }
    }
    /* the ankles, the shins and the trunk: a link arriving at speed is what snags the cord */
    for (let i = 1; i < N; i++) {
      const j = 3 * i; if (P[j + 1] > 0.85) continue;
      for (let c = 0; c < nb; c++) {
        const B = bodies[c], abx = B.b.x - B.a.x, aby = B.b.y - B.a.y, abz = B.b.z - B.a.z, abl = abx * abx + aby * aby + abz * abz || 1e-6;
        let t = ((P[j] - B.a.x) * abx + (P[j + 1] - B.a.y) * aby + (P[j + 2] - B.a.z) * abz) / abl; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = B.a.x + abx * t, qy = B.a.y + aby * t, qz = B.a.z + abz * t;
        let nx = P[j] - qx, ny = P[j + 1] - qy, nz = P[j + 2] - qz;
        const d = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
        if (d >= B.r) continue;
        nx /= d; ny /= d; nz /= d;
        const vx2 = P[j] - O[j], vy2 = P[j + 1] - O[j + 1], vz2 = P[j + 2] - O[j + 2], vn = vx2 * nx + vy2 * ny + vz2 * nz;
        P[j] = qx + nx * B.r; P[j + 1] = qy + ny * B.r; P[j + 2] = qz + nz * B.r;
        if (vn < 0) { O[j] -= nx * vn; O[j + 1] -= ny * vn; O[j + 2] -= nz * vn; }   // stopped dead against the leg, sliding along it
        const sp = Math.sqrt(vx2 * vx2 + vy2 * vy2 + vz2 * vz2);
        if (sp > hitV) { hitV = sp; hitI = i; }
      }
    }
  }
  ropeConstrain(SKIPC.ITER);
  /* The middle link is the far side of the loop: at 0 it hangs straight below the hands, that is, under the feet. That angle
     is what the hop is timed on — but one link's Δangle is no way to measure a rate (near the axis it is all noise), so the
     cord's own angular speed comes from the angular momentum of the whole chain about the swing axis. */
  const Q = SKIP.Q;
  { const j = (N >> 1) * 3, dx = P[j] - C.x, dy = P[j + 1] - C.y, dz = P[j + 2] - C.z;
    const f = dx * e2.x + dy * e2.y + dz * e2.z, u = dx * e1.x + dy * e1.y + dz * e1.z;
    SKIP.ang = Math.atan2(f, -u); SKIP.angOK = SKIP.angOK || Math.hypot(f, u) > 0.2; }
  { let L = 0, I = 0;
    for (let i = 1; i < N; i++) {
      const j = 3 * i, dx = P[j] - C.x, dy = P[j + 1] - C.y, dz = P[j + 2] - C.z;
      const k = dx * ax.x + dy * ax.y + dz * ax.z;
      const px = dx - ax.x * k, py = dy - ax.y * k, pz = dz - ax.z * k;
      const vx = (P[j] - Q[j]) / dt, vy = (P[j + 1] - Q[j + 1]) / dt, vz = (P[j + 2] - Q[j + 2]) / dt;
      L += (py * vz - pz * vy) * ax.x + (pz * vx - px * vz) * ax.y + (px * vy - py * vx) * ax.z;
      I += px * px + py * py + pz * pz;
    }
    SKIP.omega += ((I > 0.05 ? L / I : 0) - SKIP.omega) * 0.15;
  }
  SKIP.pang = SKIP.ang;
  if (SKIP.st !== 'tangle') SKIP.st = Math.abs(SKIP.omega) > 4.2 ? 'spin' : 'idle';
  if (hitI >= 0 && hitV > 1.5 && SKIP.st === 'spin') ropeSnag(hitI);
  ropeTube();
}
/* one missed hop: the cord hits an ankle, wraps a little and loses its swing — the wrists have to pick it up again */
function ropeSnag(i) {
  const P = SKIP.P, N = SKIPC.N;
  SKIP.st = 'tangle'; SKIP.t = 0; SKIP.drive = 0; SKIP.omega = 0; SKIP.air = false; SKIP.jt = 1; SKIP.watch = 0;
  SKIP.misses++; SKIP.streak = 0;
  msg(SKIP.misses === 1 ? 'Зацеп! Подними верёвку' : 'Зацеп! Пропущено ' + SKIP.misses);
  sfx.thud(0.18, 0.4);
  for (let k = -3; k <= 3; k++) {          // the wrap: the links beside the hit are thrown round the ankle
    const o = i + k; if (o <= 0 || o >= N) continue;
    const j = 3 * o, f = 1 + 0.45 * (1 - Math.abs(k) / 4);
    for (let c = 0; c < 3; c++) SKIP.O[j + c] = P[j + c] + (P[j + c] - SKIP.O[j + c]) * f;
  }
  for (let n = 1; n < N; n++) { const j = 3 * n; for (let c = 0; c < 3; c++) SKIP.O[j + c] += (P[j + c] - SKIP.O[j + c]) * 0.5; }
}
/* the tube follows the links, parallel-transported so the cord does not twist as it bends */
function ropeTube() {
  const P = SKIP.P, N = SKIPC.N, pos = SKIP.cord.geometry.attributes.position, nrm = SKIP.cord.geometry.attributes.normal;
  const pa = pos.array, na = nrm.array;
  let pnx = 0, pny = 1, pnz = 0;
  for (let i = 0; i <= N; i++) {
    const j = 3 * i, k0 = i ? j - 3 : j, k1 = i < N ? j + 3 : j;
    let tx = P[k1] - P[k0], ty = P[k1 + 1] - P[k0 + 1], tz = P[k1 + 2] - P[k0 + 2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1e-6; tx /= tl; ty /= tl; tz /= tl;
    const d = pnx * tx + pny * ty + pnz * tz;
    let nx = pnx - tx * d, ny = pny - ty * d, nz = pnz - tz * d, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-4) { nx = tz; ny = 0; nz = -tx; nl = Math.sqrt(nx * nx + nz * nz) || 1; }
    nx /= nl; ny /= nl; nz /= nl; pnx = nx; pny = ny; pnz = nz;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    for (let s = 0; s < RSIDE; s++) {
      const A = s / RSIDE * RTAU, ca = Math.cos(A) * SKIPC.R, sa = Math.sin(A) * SKIPC.R;
      const k = (i * RSIDE + s) * 3, dx = nx * ca + bx * sa, dy = ny * ca + by * sa, dz = nz * ca + bz * sa;
      pa[k] = P[j] + dx; pa[k + 1] = P[j + 1] + dy; pa[k + 2] = P[j + 2] + dz;
      na[k] = dx / SKIPC.R; na[k + 1] = dy / SKIPC.R; na[k + 2] = dz / SKIPC.R;
    }
  }
  pos.needsUpdate = true; nrm.needsUpdate = true;
}

/* ── the drill: the hop clock, and the pose laid over the idle animation ── */
function ropeState(dt) {
  if (!SKIP.on) return;
  SKIP.t += dt;
  SKIP.drive = SKIP.st === 'tangle' ? Math.max(0, SKIP.drive - dt * 3) : Math.min(1, SKIP.t / 0.7);
  if (SKIP.st === 'tangle' && SKIP.t > 1.0) { SKIP.st = 'idle'; SKIP.t = 0; }
  SKIP.th = (SKIP.th + SKIPC.OMEGA * (0.22 + 0.78 * SKIP.drive) * dt) % RTAU;
  /* the hop is timed on the cord: he leaves the mat while the middle link is still well in front of his feet */
  if (SKIP.pang !== null && SKIP.st === 'spin' && !SKIP.air && SKIP.jt > 0.12) {
    const p = SKIP.pang, a = SKIP.ang;                 // the cord can come round either way
    let d = a - p; while (d > Math.PI) d -= RTAU; while (d < -Math.PI) d += RTAU;   // (a jump past ±π is the cord at the top, not a hop)
    if (Math.abs(d) < 0.6 && ((d < 0 && p > SKIPC.TAKE && a <= SKIPC.TAKE) || (d > 0 && p < -SKIPC.TAKE && a >= -SKIPC.TAKE))) {
      if (SKIP.noJump > 0) { SKIP.noJump--; SKIP.watch = 0.6; SKIP.jt = -0.5; }   // a deliberately late hop: the ankles get hit
      else { SKIP.air = true; SKIP.jt = 0; SKIP.jumps++; SKIP.streak++; SKIP.best = Math.max(SKIP.best, SKIP.streak); }
    }
    if (!SKIP.air && a < -0.6 && a > -SKIPC.TAKE) SKIP.dipV += 5.0 * dt;          // the knees load as the cord comes round
  }
  if (SKIP.air) { SKIP.jt += dt; if (SKIP.jt >= SKIPC.AIR) { SKIP.air = false; SKIP.dipV += 0.8; } }
  else SKIP.jt += dt;
  if (SKIP.watch > 0) { SKIP.watch -= dt; if (SKIP.watch <= 0 && SKIP.st === 'spin') ropeSnag(SKIPC.N >> 1); }
  SKIP.dipV += (-210 * SKIP.dip - 19 * SKIP.dipV) * dt;
  const dip = clamp(SKIP.dip + SKIP.dipV * dt, -0.03, 0.07); if (dip !== SKIP.dip) SKIP.dipV *= 0.4; SKIP.dip = dip;
}
/* the hop itself: a ballistic arc — the body leaves the mat, the legs gather under him, the ankles point down */
function ropeHop() {
  if (!SKIP.air) return 0;
  const t = clamp(SKIP.jt / SKIPC.AIR, 0, 1);
  return SKIPC.HOP * 4 * t * (1 - t);
}
function ropePose(F, dt) {
  const R = SKIP.rig; if (!SKIP.on || !R || R.F !== F || G.state !== 'rope') return;
  const B = F.bones, hip = F.hipModel, hip0 = R.hip0, hop = ropeHop(), dip = SKIP.dip;
  const air = SKIP.air ? clamp(SKIP.jt / SKIPC.AIR, 0, 1) : 0;
  F.adv = F.advV = 0; F.group.position.y = hop;
  F.setHip(_rp1.set(hip.x, hip.y - dip, hip.z + 0.015));    // a touch of weight forward, the hips bobbing with the knees
  const sw = 0.03 * Math.sin(SKIP.th);
  F.rot(B.CC_Base_Spine01, 0.055, 0, sw * 0.6);
  F.rot(B.CC_Base_Spine02, 0.045, -sw, sw);
  F.cc.updateMatrixWorld(true);
  /* the feet: planted under him between hops (the dip bends the knees), carried up and tucked while he is off the mat */
  const tuck = 0.010 + 0.050 * Math.sin(Math.PI * air);
  const toe = SKIP.air ? 0.12 + 0.42 * Math.sin(Math.PI * air) : 0.10 + 2.4 * Math.max(0, -dip);
  for (const S of ['L', 'R']) {
    const L = R.foot[S];
    F.ik(L.Thigh, L.Calf, L.Foot, _rp2.set(hip0.x + (S === 'L' ? 0.062 : -0.062), 0.082 + tuck, hip0.z));
    F.setMQuat(L.Foot, _rpq1.setFromAxisAngle(_rpX, toe).multiply(F.mquat(L.Foot, _rpq2)));
    F.setMQuat(L.ToeBase, _rpq1.setFromAxisAngle(_rpX, -toe * 0.45).multiply(F.mquat(L.ToeBase, _rpq2)));
  }
  F.cc.updateMatrixWorld(true);
  /* the arms: upper arms down at the sides (this sets the bend plane the IK keeps), elbows tucked back, and the fist carried
     round a small circle in front of the hip — the handle rides the fist, so that circle is what turns the cord. */
  const cy = 0.055 * Math.cos(SKIP.th), cz = 0.055 * Math.sin(SKIP.th);
  for (const S of ['L', 'R']) {
    const sgn = S === 'L' ? 1 : -1, H = R.hand[S];
    const ua = B[`CC_Base_${S}_Upperarm`], fa = B[`CC_Base_${S}_Forearm`], hb = H.bone;
    const sh = F.mpos(ua, _rp1), el0 = F.mpos(fa, _rp2);
    _rp3.set(sgn * 0.17, -1, -0.07).normalize().multiplyScalar(sh.distanceTo(el0)).add(sh);
    _rp4.subVectors(el0, sh).normalize(); _rp5.subVectors(_rp3, sh).normalize();
    F.setMQuat(ua, _rpq1.setFromUnitVectors(_rp4, _rp5).multiply(F.mquat(ua, _rpq2)));
    F.cc.updateMatrixWorld(true);
    const hand = _rp6.set(hip.x + sgn * 0.185, hip.y + 0.120 + cy, hip.z + 0.105 + cz);
    const el1 = F.mpos(fa, _rp2), wr1 = F.mpos(hb, _rp3);
    _rp4.subVectors(wr1, el1).normalize(); _rp5.subVectors(hand, el1).normalize();
    F.setMQuat(fa, _rpq1.setFromUnitVectors(_rp4, _rp5).multiply(F.mquat(fa, _rpq2)));
    F.cc.updateMatrixWorld(true);
    F.ik(ua, fa, hb, hand);
    F.cc.updateMatrixWorld(true);
    /* the fist's frame: the fingers run on down the forearm, the knuckle line points forward, the palm faces the body */
    const el2 = F.mpos(fa, _rp2), wr2 = F.mpos(hb, _rp3);
    const Yd = _rp4.subVectors(wr2, el2).normalize();
    const Xd = _rp5.copy(_rpF).addScaledVector(Yd, -Yd.z).normalize();
    const Zd = _rp6.crossVectors(Xd, Yd).multiplyScalar(S === 'R' ? 1 : -1);
    F.setMQuat(hb, _rpq1.setFromRotationMatrix(_rm1.makeBasis(Xd, Yd, Zd)).multiply(H.Qrel));
    /* a fist round the handle: the fingers curl about the knuckle line, the thumb comes over the top */
    for (const [f, a0] of [['Index', 1.10], ['Mid', 1.16], ['Ring', 1.12], ['Pinky', 1.02]]) {
      const bn = H[f]; if (!bn) continue; const k = [0.9, 1.0, 0.8];
      for (let i = 0; i < bn.length; i++) F.setMQuat(bn[i], _rpq1.setFromAxisAngle(_rpX, -a0 * k[i] * (i ? 1 : 0.8)).multiply(F.mquat(bn[i], _rpq2)));
    }
    for (let i = 0; i < (H.Thumb || []).length; i++)
      F.setMQuat(H.Thumb[i], _rpq1.setFromAxisAngle(_rp3.set(-sgn * 0.5, 0.35, 0.8).normalize(), 0.5 * (i ? 0.7 : 0.45)).multiply(F.mquat(H.Thumb[i], _rpq2)));
    F.cc.updateMatrixWorld(true);
  }
  F.spreadTwist();
  F.cc.updateMatrixWorld(true);
}

/* ── start / stop / the judge's API ── */
function ropeStart() {
  ropeBuild();
  if (!SKIP.on) {
    SKIP.on = true; SKIP.g.visible = true;
    G.mode = 'rope'; startFight(true);                    // the gym, the gear, the marks, the crowd (09_bag.js)
    G.stareT = 0; G.introT = 9; G.state = 'rope'; G.roundT = 0;
    P1.place(-0.34, Math.PI / 2, false); P1.mark.set(-0.34, 0, 0);   // on the mat beside the ring, facing +x as usual
    P2.mark.set(1.30, 0, 0); P2.group.position.copy(P2.mark); P2.group.rotation.y = -Math.PI / 2;   // his partner watches from the side
    SKIP.rig = ropeBindRig(P1);
    SKIP.rig.hip0 = P1.hipModel.clone();
    SKIP.jumps = SKIP.misses = SKIP.streak = SKIP.best = 0;
    msg('Скакалка: ' + (TOUCH ? 'коснись — пропустить прыжок' : 'пробел — пропустить прыжок'), 'place');
  }
  SKIP.air = false; P1.group.position.y = 0;
  for (const [i, S] of [[0, 'L'], [1, 'R']]) {
    const H = SKIP.rig.hand[S];
    SKIP.handles[i].matrix.multiplyMatrices(H.bone.matrixWorld, H.rel);
    SKIP.A[i].copy(H.anchor).applyMatrix4(SKIP.handles[i].matrix);
  }
  ropeReset(); ropeSeed(SKIPC.SPIN);   // the cord is already going round when he starts: a rope does not start from rest
}
function ropeStop() {
  if (!SKIP.on) return;
  SKIP.on = false; SKIP.g.visible = false; SKIP.rig = null; P1.group.position.y = 0;
  P1.place(-D_SEP / 2, Math.PI / 2, false); P2.place(D_SEP / 2, -Math.PI / 2, true);
  P1.mark = null; P2.mark = null;
  toMenu();
}
window.__rope = {
  start: ropeStart, stop: ropeStop,
  miss: () => { SKIP.noJump = 1; },          // the next hop is deliberately late: the cord goes into the ankles
  get on() { return SKIP.on; },
  get info() { return { state: SKIP.st, jumps: SKIP.jumps, misses: SKIP.misses, best: SKIP.best, omega: +SKIP.omega.toFixed(2), ang: +SKIP.ang.toFixed(2), drive: +SKIP.drive.toFixed(2), air: SKIP.air }; },
  knot: SKIP,
};
/* the drill's own input: space (or Enter) skips a hop on purpose */
function ropeInput(e) {
  if (!SKIP.on) return false;
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (!e.repeat) { SKIP.noJump = 1; msg('Прыжок пропущен'); }
    e.preventDefault(); return true;
  }
  return false;
}
/* the drill's camera: a low three-quarter shot that keeps the whole loop in frame (the cord turns across the shot) */
function ropeCam(cp, cl) {
  const h = P1.headNow, t = G.real, a = 0.45 + 0.05 * Math.sin(t * 0.11);
  cp.set(h.x + 3.1 * Math.sin(a), 1.28 + 0.09 * Math.sin(t * 0.17), 3.1 * Math.cos(a));
  cl.set(h.x + 0.04, 0.95 + 0.05 * Math.sin(t * 0.13), 0);
  return 2.6;
}
