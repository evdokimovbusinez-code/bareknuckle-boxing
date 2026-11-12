/* ───────── jump rope (issue #31): a procedural rope + rig + chain physics for the training gym ─────────
   Self-contained demo, switched on by window.__rope.start(): P1 stands alone on the gym canvas, hidden P2, and jumps rope.
   The handles sit in the fists; the wrists describe small circles. The cord is a verlet/PBD chain of 40 links: its ends
   are pinned to the two handle tips, gravity + air drag + length constraints + floor and foot-capsule collisions shape it.
   The couple the two hands put into the grip is a soft centrifugal tension toward the rotating backbone (the hands' phase
   drives the bow, the tip trails a little); a toe-jump each revolution lifts the feet as the cord sweeps the floor.
   A missed jump lets the cord snag a foot
   capsule, the spin is knocked off, then it starts again. Everything is defined here; the only outside hook is jrTick()
   called from frame() in 11_arena_loop.js, right before P1.simulate(). */

const JRP = {
  on: false, needInit: true, mode: 'spin',        // 'spin' | 'catch'
  phase: Math.PI / 2, subPhase: Math.PI / 2, omega: 8.0,   // hand/wrist cadence: ~1.27 rev/s (tuned by measurement)
  ropeLen: 2.7, N: 40, L0: 2.7 / 40,             // 40 links, 6.75 cm each
  drive: 0.16, lag: 0.55,                         // tension toward the hand-driven backbone; the tip trails the hands (no slack: the cord stays taut)
  cx: 0, cy: 0.92, cz: 0, w: 0.5,                 // axle centre + handle separation, refreshed each frame
  capR: 0.25, capLen: 0.79, D: 0.95, halfZ: 0.25, // hairpin profile of the taut cord (recomputed by jrProfile)
  jumpH: 0.135, jumpY: 0,                         // toe-hop height (m; was 0.115 — too subtle against the idle bounce)
  catchT: 0, initSpin: true, initPhase: 0,
  E: [new V3(), new V3()],                        // world points where the cord leaves each handle (chain ends)
  feet: [],                                       // foot capsules, rebuilt each frame from the leg bones
  p: null, pp: null, vel: null,                   // chain positions / previous / velocities (Float32Array)
  mesh: null, geo: null, cordMat: null, h: [null, null],
  twSave: null, savedX: -0.575,
};
const _jrA = new V3(), _jrB = new V3(), _jrX = new V3(), _jrY = new V3(), _jrZ = new V3();
const _jrYdir = [new V3(), new V3()];            // handle axis, per side (rebuilt each frame with the wrist circle)
const _jrRef = new V3(0, 0, 1);

/* ───────── model: two grips + a thin braided cord ───────── */
function jrBuild() {
  if (JRP.mesh) return;
  // braided cord: diagonal light strands over a red PVC core, repeated along the tube
  const cordTex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#b71c27'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,225,220,0.30)'; g.lineWidth = 6;
    for (let y = -h; y < h * 2; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.stroke(); }
    g.strokeStyle = 'rgba(90,0,8,0.35)'; g.lineWidth = 5;
    for (let y = -h; y < h * 2; y += 34) { g.beginPath(); g.moveTo(w, y); g.lineTo(0, y + w); g.stroke(); }
  });
  cordTex.wrapS = cordTex.wrapT = THREE.RepeatWrapping; cordTex.repeat.set(1, 9);
  JRP.cordMat = new THREE.MeshStandardMaterial({ map: cordTex, roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide });
  // rubber/leather grip texture: fine knurl + a stitched seam
  const gripTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#20232a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) { g.fillStyle = `rgba(255,255,255,${0.03 + 0.05 * Math.abs(Math.sin(y * 0.7))})`; g.fillRect(0, y, w, 2); }
    for (let x = 0; x < w; x += 9) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 3, h); }
    g.fillStyle = '#c02a2f'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  });
  const mGrip = new THREE.MeshStandardMaterial({ map: gripTex, roughness: 0.82, metalness: 0.06 });
  const mMetal = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.28, metalness: 0.92 });
  const mRed = new THREE.MeshStandardMaterial({ color: 0xc4202a, roughness: 0.45, metalness: 0.15 });

  // One handle = slightly conical grip (local +Y from the cord-exit at y=0 down to the cap at y=L), knurl rings,
  // a chrome swivel/bearing at the cord-exit end and a red accent. Merged into one mesh with 3 materials.
  const L = 0.15, parts = [], mats = [];
  const add = (geo, mat) => { parts.push(geo); mats.push(mat); };
  add(new THREE.CylinderGeometry(0.016, 0.0125, L, 16, 1).translate(0, L / 2, 0), mGrip);
  for (const y of [0.028, 0.072, 0.116]) add(new THREE.TorusGeometry(0.0152, 0.0016, 6, 16).rotateX(Math.PI / 2).translate(0, y, 0), mGrip);
  add(new THREE.CylinderGeometry(0.0165, 0.0165, 0.012, 16).translate(0, L - 0.006, 0), mRed);      // cap ring
  add(new THREE.CylinderGeometry(0.009, 0.013, 0.02, 14).translate(0, -0.008, 0), mMetal);           // swivel cone
  add(new THREE.TorusGeometry(0.0075, 0.0024, 8, 16).rotateX(Math.PI / 2).translate(0, -0.02, 0), mMetal); // cord eyelet
  const handleGeo = mergeGeometries(parts, true);
  for (let s = 0; s < 2; s++) {
    const m = new THREE.Mesh(handleGeo, mats);
    m.matrixAutoUpdate = false; m.frustumCulled = false; m.castShadow = true; m.visible = false;
    scene.add(m); JRP.h[s] = m;
  }

  // Cord: (N+1) rings × RAD verts, world-space positions rewritten every frame; the mesh stays at identity.
  const RAD = 8, nPts = JRP.N + 1, count = nPts * RAD;
  const geo = new THREE.BufferGeometry();
  JRP.geo = geo;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < nPts; i++) for (let j = 0; j < RAD; j++) { const k = (i * RAD + j) * 2; uv[k] = j / RAD; uv[k + 1] = i / JRP.N; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = [];
  for (let i = 0; i < JRP.N; i++) for (let j = 0; j < RAD; j++) {
    const a = i * RAD + j, b = i * RAD + (j + 1) % RAD, c = (i + 1) * RAD + j, d = (i + 1) * RAD + (j + 1) % RAD;
    idx.push(a, c, b, b, c, d);
  }
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, JRP.cordMat);
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.visible = false;
  scene.add(mesh); JRP.mesh = mesh;

  const len = nPts * 3;
  JRP.p = new Float32Array(len); JRP.pp = new Float32Array(len); JRP.vel = new Float32Array(len);
}

/* ───────── the taut backbone the hands drive ─────────
   The cord is a hairpin (two strands + a rounded far end) in the world x-y plane; the axle between the fists is ≈ world z,
   so from the default +z camera the arc is seen face-on. jrProfile() fixes its shape from the two cord-exit points;
   jrIdeal() returns the position of chain point i when the bow points at phase φ. The far end trails the hands by
   a fraction of a radian (the whip), so the two strands bow slightly instead of staying dead straight. */
function jrProfile() {
  const S = JRP, A = S.E[0], B = S.E[1];
  S.cx = (A.x + B.x) / 2; S.cy = (A.y + B.y) / 2; S.cz = (A.z + B.z) / 2;
  S.w = A.distanceTo(B); S.halfZ = (B.z - A.z) / 2;
  S.capR = S.w / 2; S.capLen = Math.PI * S.capR; S.D = (S.ropeLen - S.capLen) / 2;
}
function jrIdeal(i, ph, out) {
  const S = JRP, ell = i * S.L0, D = S.D, capR = S.capR, capLen = S.capLen;
  let rad, z;
  if (ell <= D) { rad = ell; z = S.cz - S.halfZ; }                                // strand L, out along b
  else if (ell <= D + capLen) { const th = (ell - D) / capR; rad = D + capR * Math.sin(th); z = S.cz - capR * Math.cos(th); }
  else { rad = D - (ell - D - capLen); z = S.cz + S.halfZ; }                      // strand R, back to the fist
  const a = ph - S.lag * rad / (D + capR);
  return out.set(S.cx + Math.cos(a) * rad, S.cy + Math.sin(a) * rad, z);
}
function jrInitRope(phase, spin) {
  const S = JRP, N = S.N, p = S.p, vel = S.vel, pp = S.pp, om = spin ? S.omega : 0;
  for (let i = 0; i <= N; i++) {
    jrIdeal(i, phase, _jrA);
    const k = 3 * i, x = _jrA.x, y = _jrA.y;
    p[k] = x; p[k + 1] = y; p[k + 2] = _jrA.z; pp[k] = x; pp[k + 1] = y; pp[k + 2] = _jrA.z;
    vel[k] = -om * (y - S.cy); vel[k + 1] = om * (x - S.cx); vel[k + 2] = 0;
  }
}

/* ───────── rig: hands to the hips, small wrist circles, a toe-hop, a stumble on a catch ───────── */
function jrPose() {
  const S = JRP, B = P1.bones, ph = S.phase, catchK = S.mode === 'catch' ? 1 : 0;
  const r = 0.035 * (1 - 0.6 * catchK);
  const dy = r * Math.sin(ph), dz = r * Math.cos(ph);          // local (y,z) circle → world (y,x) circle = the bow
  const droop = 0.05 * catchK;
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? 'L' : 'R', sx = s === 0 ? 0.26 : -0.26;
    const t = _jrA.set(sx, 0.92 - droop + dy, 0.06 + dz);       // group-local target (L/R at ±x, hips ~0.92 m)
    P1.ik(B[`CC_Base_${side}_Upperarm`], B[`CC_Base_${side}_Forearm`], B[`CC_Base_${side}_Hand`], t);
    P1.cc.updateMatrixWorld(true);
  }
  // knees/ankles spring: a shallow crouch on the ground, extension at the top of the hop (torso stays almost still)
  const bend = 0.02 + 0.035 * (1 - S.jumpY / S.jumpH);
  P1.rot(B.CC_Base_L_Thigh, bend, 0, 0); P1.rot(B.CC_Base_R_Thigh, bend, 0, 0);
  P1.rot(B.CC_Base_L_Calf, -1.4 * bend, 0, 0); P1.rot(B.CC_Base_R_Calf, -1.4 * bend, 0, 0);
  // a caught jump makes him hunch a touch
  if (catchK) P1.rot(B.CC_Base_Spine01, 0.14 * catchK, 0, 0);
  P1.spreadTwist();
  P1.cc.updateMatrixWorld(true);
}
function jrJumpY() {                                            // one hop per revolution, peaked at the under-feet pass (φ = 3π/2)
  const S = JRP; if (S.mode === 'catch') return 0;
  const c = Math.cos(S.phase - 3 * Math.PI / 2);
  return S.jumpH * Math.pow(Math.max(0, c), 1.2);
}

/* ───────── handles & chain ends: cord-exit point from the hand bone, fixed grip axis ───────── */
function jrHandles() {
  const S = JRP, HB = P1.bones, ph = S.phase;
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? 'L' : 'R', sgn = s === 0 ? -1 : 1;  // L fist at world -z, R at +z
    const hw = _jrB.setFromMatrixPosition(HB[`CC_Base_${side}_Hand`].matrixWorld);
    const E = S.E[s].copy(hw); E.x += 0.01; E.y -= 0.025; E.z -= sgn * 0.02;  // cord leaves the lower inner edge of the fist
    // the grip hangs down-forward out of the palm; a small wrist circle follows the rope (it does NOT spin a full turn)
    const Y = _jrYdir[s].set(0.5 + 0.16 * Math.cos(ph), -0.8, sgn * 0.1 + 0.16 * Math.sin(ph)).normalize();
    _jrX.crossVectors(_jrRef, Y).normalize(); _jrZ.crossVectors(_jrX, Y).normalize();
    const m = S.h[s]; m.matrix.makeBasis(_jrX, Y, _jrZ); m.matrix.setPosition(E);
    m.matrixWorldNeedsUpdate = true; m.visible = true;
  }
}
function jrFeet() {
  const S = JRP, f = S.feet; f.length = 0;
  for (const side of ['L', 'R']) {
    const a = _jrB.setFromMatrixPosition(P1.bones[`CC_Base_${side}_Foot`].matrixWorld);
    f.push({ c: new V3(a.x + 0.02, a.y - 0.02, a.z), r: 0.062 });          // ankle
    f.push({ c: new V3(a.x + 0.10, a.y - 0.045, a.z), r: 0.05 });          // toe (forward = world +x)
  }
}

/* ───────── chain physics ───────── */
function jrPinEnds() {
  const S = JRP, p = S.p, A = S.E[0], B = S.E[1], k = 3 * S.N;
  p[0] = A.x; p[1] = A.y; p[2] = A.z; p[k] = B.x; p[k + 1] = B.y; p[k + 2] = B.z;
}
function jrLink(i) {
  const S = JRP, p = S.p, a = 3 * i, b = a + 3;
  const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
  const d = Math.hypot(dx, dy, dz); if (d < 1e-9) return;
  const wa = i === 0 ? 0 : 0.5, wb = i + 1 === S.N ? 0 : 0.5, w = wa + wb; if (w === 0) return;
  const c = (d - S.L0) / d / w;
  p[a] += dx * wa * c; p[a + 1] += dy * wa * c; p[a + 2] += dz * wa * c;
  p[b] -= dx * wb * c; p[b + 1] -= dy * wb * c; p[b + 2] -= dz * wb * c;
}
function jrCollide() {
  const S = JRP, p = S.p, N = S.N, floor = 0.004;
  for (let i = 1; i < N; i++) {
    const k = 3 * i;
    if (p[k + 1] < floor) p[k + 1] = floor;                    // no sinking; the vertical velocity is killed by the PBD pass
    for (const f of S.feet) {
      const dx = p[k] - f.c.x, dy = p[k + 1] - f.c.y, dz = p[k + 2] - f.c.z, d = Math.hypot(dx, dy, dz);
      if (d < f.r && d > 1e-6) { const s = f.r / d; p[k] = f.c.x + dx * s; p[k + 1] = f.c.y + dy * s; p[k + 2] = f.c.z + dz * s; }
    }
  }
}
function jrStep(h) {
  const S = JRP, N = S.N, p = S.p, pp = S.pp, vel = S.vel, catching = S.mode === 'catch';
  const damp = 1 - (catching ? 3.2 : 0.6) * h, g = 9.81 * (catching ? 1.7 : 1);
  // verlet with gravity + air drag; the ends stay pinned to the handles
  for (let i = 1; i < N; i++) {
    const k = 3 * i;
    pp[k] = p[k]; pp[k + 1] = p[k + 1]; pp[k + 2] = p[k + 2];
    let vx = vel[k] * damp, vy = (vel[k + 1] - g * h) * damp, vz = vel[k + 2] * damp;
    const sp = Math.hypot(vx, vy, vz); if (sp > 24) { const f = 24 / sp; vx *= f; vy *= f; vz *= f; }
    p[k] += vx * h; p[k + 1] += vy * h; p[k + 2] += vz * h;
  }
  jrPinEnds();
  // The hands keep the cord taut: centrifugal tension is a soft pull toward the rotating backbone, not a keyframed
  // shape. Gravity, the length constraints and the floor/foot contacts still deform it (a slap on the canvas, a snag
  // round a foot). After a catch the pull stops and the chain goes limp under real gravity.
  if (!catching) {
    for (let i = 1; i < N; i++) {
      jrIdeal(i, S.subPhase, _jrA);
      const k = 3 * i, a = S.drive;
      p[k] += (_jrA.x - p[k]) * a; p[k + 1] += (_jrA.y - p[k + 1]) * a; p[k + 2] += (_jrA.z - p[k + 2]) * a;
    }
  }
  for (let it = 0; it < 6; it++) { if (it & 1) { for (let i = N - 1; i >= 0; i--) jrLink(i); } else { for (let i = 0; i < N; i++) jrLink(i); } jrPinEnds(); }
  jrCollide(); jrPinEnds();
  const inv = 1 / h;
  for (let i = 1; i < N; i++) { const k = 3 * i; vel[k] = (p[k] - pp[k]) * inv; vel[k + 1] = (p[k + 1] - pp[k + 1]) * inv; vel[k + 2] = (p[k + 2] - pp[k + 2]) * inv; }
}
function jrRope(dt) {
  const S = JRP;
  if (S.needInit) { jrInitRope(S.initPhase, S.initSpin); S.needInit = false; }
  const SUB = 6, h = dt / SUB;
  for (let s = 0; s < SUB; s++) {
    S.subPhase = S.phase - S.omega * dt + S.omega * dt * (s + 1) / SUB;   // interpolate the bow across the substeps
    jrStep(h);
  }
}

/* ───────── tube from the chain points ───────── */
function jrTube() {
  const S = JRP, N = S.N, p = S.p, RAD = 8, R = 0.0042;
  const pos = S.geo.attributes.position.array, nor = S.geo.attributes.normal.array;
  for (let i = 0; i <= N; i++) {
    const k = 3 * i, ka = 3 * Math.max(0, i - 1), kb = 3 * Math.min(N, i + 1);
    const tx = p[kb] - p[ka], ty = p[kb + 1] - p[ka + 1], tz = p[kb + 2] - p[ka + 2];
    const tl = Math.hypot(tx, ty, tz) || 1; _jrA.set(tx / tl, ty / tl, tz / tl);   // tangent
    _jrX.crossVectors(_jrA, _jrRef); if (_jrX.lengthSq() < 1e-6) _jrX.crossVectors(_jrA, new V3(1, 0, 0)); _jrX.normalize();
    _jrY.crossVectors(_jrX, _jrA).normalize();
    for (let j = 0; j < RAD; j++) {
      const a = 2 * Math.PI * j / RAD, c = Math.cos(a), s = Math.sin(a);
      const nx = _jrX.x * c + _jrY.x * s, ny = _jrX.y * c + _jrY.y * s, nz = _jrX.z * c + _jrY.z * s, o = (i * RAD + j) * 3;
      pos[o] = p[k] + nx * R; pos[o + 1] = p[k + 1] + ny * R; pos[o + 2] = p[k + 2] + nz * R;
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
    }
  }
  S.geo.attributes.position.needsUpdate = true; S.geo.attributes.normal.needsUpdate = true;
}

/* ───────── the catch: the cord is knocked off, then the spin starts again ───────── */
function jrCatch() { const S = JRP; if (S.mode === 'catch') return; S.mode = 'catch'; S.catchT = 0; S.vel.fill(0); }

/* ───────── per-frame driver (the single hook from frame()) ───────── */
function jrTick(dt) {
  const S = JRP; if (!S.on || dt <= 0) return;
  if (S.mode === 'catch') {
    S.catchT += dt;
    if (S.catchT > 1.4) { S.mode = 'spin'; S.needInit = true; S.initSpin = true; S.initPhase = S.phase; }
  } else S.phase += S.omega * dt;

  jrPose();
  S.jumpY = jrJumpY();
  P1.group.position.y = S.jumpY;                              // the whole body hops: the feet leave the canvas
  P1.group.updateMatrixWorld(true);
  // simulate() runs after this hook: refresh the head frame so hair / cloth follow the hop
  P1.headFrame.multiplyMatrices(P1.head.matrixWorld, HEAD.restInvT);
  P1.headFrameInv.copy(P1.headFrame).invert();
  P1.headNow.y += S.jumpY;

  jrHandles(); jrFeet(); jrProfile();
  jrRope(dt);
  jrTube();
}

/* ───────── public API (the judge calls start(); miss()/stop() are optional) ───────── */
function jrStart() {
  jrBuild();
  const S = JRP;
  if (!S.on) {
    S.twSave = { ...(window.__tw || {}) };
    window.__tw = window.__tw || {};
    window.__tw.noPlant = true; window.__tw.noClear = true; window.__tw.noSep = true;   // feet follow the legs, no arm/body separation
    S.savedX = P1.group.position.x;
  }
  // gym, alone: the ring spot (BAG.on stays false so no heavy-bag logic runs)
  BAG.on = false; setLocation('boxgym'); showP2(false); BAG.g.visible = false;
  uiShow(null); show('hud', false); show('pad', false); show('result', false); show('vs', false);
  G.state = 'rope'; G.paused = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; G.shake = 0; camCut = true;
  P1.resetState(); P1.blocking = false; P1.blockW = 0; P1.dodge = null; P1.gest = null; P1.cur = null; P1.aimW = 0;
  P1.place(0, Math.PI / 2, false);                            // face +x → the rope's plane is x-y, seen from +z
  P1.mark = P1.group.position.clone(); P1.adv = 0; P1.advV = 0; P1.hold = 0;
  P1.group.position.y = 0; P1.group.updateMatrixWorld(true);
  S.on = true; S.mode = 'spin'; S.catchT = 0; S.jumpY = 0; S.phase = Math.PI / 2;
  S.needInit = true; S.initSpin = true; S.initPhase = S.phase;
  S.mesh.visible = true;
  // seed the chain ends from the first posed frame
  jrPose(); jrHandles(); jrFeet(); jrProfile();
}
function jrStop() {
  const S = JRP; if (!S.on) return;
  S.on = false; S.mesh.visible = false; S.h[0].visible = S.h[1].visible = false;
  if (S.twSave !== null) window.__tw = S.twSave;
  P1.group.position.y = 0; P1.group.updateMatrixWorld(true);
  toMenu();                                                  // full clean reset: location, screens, P2, fighters
  P1.place(-0.575, Math.PI / 2, false); P1.mark = P1.group.position.clone();
}
function jrMiss() { if (JRP.on) jrCatch(); }               // one missed jump = the cord snags and is knocked off
window.__rope = { start: jrStart, stop: jrStop, miss: jrMiss, dbg: () => ({ on: JRP.on, phase: JRP.phase, mode: JRP.mode, jumpY: JRP.jumpY, w: JRP.w }) };
