/* ───────── the jump-rope drill (issue 50, adapted from issue #31's 09c_rope.js) ─────────
   A procedural rope + rig + chain physics for the training gym. The handles sit in the fists; the cord is a
   verlet/PBD chain of 40 links pinned to the two handle tips. Unlike the old demo (a fixed 76 BPM spin) the
   phase is now derived from TRAIN.beats: one revolution per jump, so the cord passes under the feet exactly at
   the beat time, and the tempo ramps 100 → 150 BPM. A missed beat knocks the spin off (jrCatch): the cord goes
   limp, snags a foot capsule, then spins up again. The shell (09e_train.js) owns scoring; this file owns the 3D. */
const JRP = {
  on: false, mode: 'spin',                      // 'spin' | 'catch'
  phase: 3 * Math.PI / 2, subPhase: 3 * Math.PI / 2, omega: 8.0,
  ropeLen: 2.95, N: 40, L0: 2.95 / 40,   // m: the hairpin reaches ≈1.82 at the top (over the crown) and grazes the canvas under the feet
  drive: 0.16, lag: 0.55,                       // tension toward the hand-driven backbone; the tip trails the hands
  cx: 0, cy: 0.92, cz: 0, w: 0.5, capR: 0.25, capLen: 0.79, D: 0.95, halfZ: 0.25,
  jumpH: 0.135, jumpY: 0,                      // toe-hop height (m)
  catchT: 0, needInit: true, initSpin: true, initPhase: 3 * Math.PI / 2,
  E: [new V3(), new V3()], feet: [],
  p: null, pp: null, vel: null,
  mesh: null, geo: null, cordMat: null, h: [null, null],
  twSave: null
};
const _jrA = new V3(), _jrB = new V3(), _jrX = new V3(), _jrY = new V3(), _jrZ = new V3();
const _jrYdir = [new V3(), new V3()], _jrRef = new V3(0, 0, 1);

/* ───────── model: two grips + a thin braided cord ───────── */
function jrBuild() {
  if (JRP.mesh) return;
  const cordTex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#b71c27'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,225,220,0.30)'; g.lineWidth = 6;
    for (let y = -h; y < h * 2; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.stroke(); }
    g.strokeStyle = 'rgba(90,0,8,0.35)'; g.lineWidth = 5;
    for (let y = -h; y < h * 2; y += 34) { g.beginPath(); g.moveTo(w, y); g.lineTo(0, y + w); g.stroke(); }
  });
  cordTex.wrapS = cordTex.wrapT = THREE.RepeatWrapping; cordTex.repeat.set(1, 9);
  JRP.cordMat = new THREE.MeshStandardMaterial({ map: cordTex, roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide });
  const gripTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#20232a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 6) { g.fillStyle = `rgba(255,255,255,${0.03 + 0.05 * Math.abs(Math.sin(y * 0.7))})`; g.fillRect(0, y, w, 2); }
    for (let x = 0; x < w; x += 9) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 3, h); }
    g.fillStyle = '#c02a2f'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  });
  const mGrip = new THREE.MeshStandardMaterial({ map: gripTex, roughness: 0.82, metalness: 0.06 });
  const mMetal = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.28, metalness: 0.92 });
  const mRed = new THREE.MeshStandardMaterial({ color: 0xc4202a, roughness: 0.45, metalness: 0.15 });
  const L = 0.15, parts = [], mats = [];
  const add = (geo, mat) => { parts.push(geo); mats.push(mat); };
  add(new THREE.CylinderGeometry(0.016, 0.0125, L, 16, 1).translate(0, L / 2, 0), mGrip);
  for (const y of [0.028, 0.072, 0.116]) add(new THREE.TorusGeometry(0.0152, 0.0016, 6, 16).rotateX(Math.PI / 2).translate(0, y, 0), mGrip);
  add(new THREE.CylinderGeometry(0.0165, 0.0165, 0.012, 16).translate(0, L - 0.006, 0), mRed);
  add(new THREE.CylinderGeometry(0.009, 0.013, 0.02, 14).translate(0, -0.008, 0), mMetal);
  add(new THREE.TorusGeometry(0.0075, 0.0024, 8, 16).rotateX(Math.PI / 2).translate(0, -0.02, 0), mMetal);
  const handleGeo = mergeGeometries(parts, true);
  for (let s = 0; s < 2; s++) {
    const m = new THREE.Mesh(handleGeo, mats);
    m.matrixAutoUpdate = false; m.frustumCulled = false; m.castShadow = true; m.visible = false;
    scene.add(m); JRP.h[s] = m;
  }
  // (N+1) rings × 8 verts, world-space positions rewritten every frame; the mesh stays at identity
  const RAD = 8, nPts = JRP.N + 1, count = nPts * RAD, geo = new THREE.BufferGeometry(); JRP.geo = geo;
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
  const mesh = new THREE.Mesh(geo, JRP.cordMat); mesh.frustumCulled = false; mesh.castShadow = true; mesh.visible = false;
  scene.add(mesh); JRP.mesh = mesh;
  const len = nPts * 3; JRP.p = new Float32Array(len); JRP.pp = new Float32Array(len); JRP.vel = new Float32Array(len);
}

/* ───────── the taut backbone the hands drive (a hairpin in the world x-y plane) ───────── */
function jrProfile() {
  const S = JRP, A = S.E[0], B = S.E[1];
  S.cx = (A.x + B.x) / 2; S.cy = (A.y + B.y) / 2; S.cz = (A.z + B.z) / 2;
  S.w = A.distanceTo(B); S.halfZ = (B.z - A.z) / 2;
  S.capR = S.w / 2; S.capLen = Math.PI * S.capR; S.D = (S.ropeLen - S.capLen) / 2;
}
function jrIdeal(i, ph, out) {
  const S = JRP, ell = i * S.L0, D = S.D, capR = S.capR, capLen = S.capLen;
  let rad, z;
  if (ell <= D) { rad = ell; z = S.cz - S.halfZ; }
  else if (ell <= D + capLen) { const th = (ell - D) / capR; rad = D + capR * Math.sin(th); z = S.cz - capR * Math.cos(th); }
  else { rad = D - (ell - D - capLen); z = S.cz + S.halfZ; }
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
  const r = 0.035 * (1 - 0.6 * catchK), dy = r * Math.sin(ph), dz = r * Math.cos(ph), droop = 0.05 * catchK;
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? 'L' : 'R', sx = s === 0 ? 0.26 : -0.26;
    const t = _jrA.set(sx, 0.92 - droop + dy, 0.06 + dz);
    P1.ik(B[`CC_Base_${side}_Upperarm`], B[`CC_Base_${side}_Forearm`], B[`CC_Base_${side}_Hand`], t);
    P1.cc.updateMatrixWorld(true);
  }
  const bend = 0.02 + 0.035 * (1 - S.jumpY / S.jumpH);
  P1.rot(B.CC_Base_L_Thigh, bend, 0, 0); P1.rot(B.CC_Base_R_Thigh, bend, 0, 0);
  P1.rot(B.CC_Base_L_Calf, -1.4 * bend, 0, 0); P1.rot(B.CC_Base_R_Calf, -1.4 * bend, 0, 0);
  if (catchK) P1.rot(B.CC_Base_Spine01, 0.14 * catchK, 0, 0);
  P1.spreadTwist(); P1.cc.updateMatrixWorld(true);
}
function jrJumpY() {   // one hop per revolution, peaked at the under-feet pass (φ = 3π/2)
  const S = JRP; if (S.mode === 'catch') return 0;
  return S.jumpH * Math.pow(Math.max(0, Math.cos(S.phase - 3 * Math.PI / 2)), 1.2);
}
function jrHandles() {
  const S = JRP, HB = P1.bones, ph = S.phase;
  for (let s = 0; s < 2; s++) {
    const side = s === 0 ? 'L' : 'R', sgn = s === 0 ? -1 : 1;
    const hw = _jrB.setFromMatrixPosition(HB[`CC_Base_${side}_Hand`].matrixWorld);
    const E = S.E[s].copy(hw); E.x += 0.01; E.y -= 0.025; E.z -= sgn * 0.02;
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
    f.push({ c: new V3(a.x + 0.02, a.y - 0.02, a.z), r: 0.062 });
    f.push({ c: new V3(a.x + 0.10, a.y - 0.045, a.z), r: 0.05 });
  }
}

/* ───────── chain physics ───────── */
function jrPinEnds() { const S = JRP, p = S.p, A = S.E[0], B = S.E[1], k = 3 * S.N; p[0] = A.x; p[1] = A.y; p[2] = A.z; p[k] = B.x; p[k + 1] = B.y; p[k + 2] = B.z; }
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
    if (p[k + 1] < floor) p[k + 1] = floor;
    for (const f of S.feet) {
      const dx = p[k] - f.c.x, dy = p[k + 1] - f.c.y, dz = p[k + 2] - f.c.z, d = Math.hypot(dx, dy, dz);
      if (d < f.r && d > 1e-6) { const s = f.r / d; p[k] = f.c.x + dx * s; p[k + 1] = f.c.y + dy * s; p[k + 2] = f.c.z + dz * s; }
    }
  }
}
function jrStep(h) {
  const S = JRP, N = S.N, p = S.p, pp = S.pp, vel = S.vel, catching = S.mode === 'catch';
  const damp = 1 - (catching ? 3.2 : 0.6) * h, g = 9.81 * (catching ? 1.7 : 1);
  for (let i = 1; i < N; i++) {
    const k = 3 * i;
    pp[k] = p[k]; pp[k + 1] = p[k + 1]; pp[k + 2] = p[k + 2];
    let vx = vel[k] * damp, vy = (vel[k + 1] - g * h) * damp, vz = vel[k + 2] * damp;
    const sp = Math.hypot(vx, vy, vz); if (sp > 24) { const f = 24 / sp; vx *= f; vy *= f; vz *= f; }
    p[k] += vx * h; p[k + 1] += vy * h; p[k + 2] += vz * h;
  }
  jrPinEnds();
  if (!catching) for (let i = 1; i < N; i++) {   // centrifugal tension toward the rotating backbone
    jrIdeal(i, S.subPhase, _jrA);
    const k = 3 * i, a = S.drive;
    p[k] += (_jrA.x - p[k]) * a; p[k + 1] += (_jrA.y - p[k + 1]) * a; p[k + 2] += (_jrA.z - p[k + 2]) * a;
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
    S.subPhase = S.phase - S.omega * dt + S.omega * dt * (s + 1) / SUB;
    jrStep(h);
  }
}
function jrTube() {
  const S = JRP, N = S.N, p = S.p, RAD = 8, R = 0.0042;
  const pos = S.geo.attributes.position.array, nor = S.geo.attributes.normal.array;
  for (let i = 0; i <= N; i++) {
    const k = 3 * i, ka = 3 * Math.max(0, i - 1), kb = 3 * Math.min(N, i + 1);
    const tx = p[kb] - p[ka], ty = p[kb + 1] - p[ka + 1], tz = p[kb + 2] - p[ka + 2];
    const tl = Math.hypot(tx, ty, tz) || 1; _jrA.set(tx / tl, ty / tl, tz / tl);
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
function jrCatch() { const S = JRP; if (S.mode === 'catch') return; S.mode = 'catch'; S.catchT = 0; S.vel.fill(0); }

/* ───────── the beat schedule: BPM 100 → 150, one jump per revolution ─────────
   normal hops, a «double spin» (two beats 0.15 s apart) and a short run on the spot (alternating ←/→).
   win = ±90 ms as specified; bpm / glyph are for the HUD and the rope phase. */
function ropePickMode(n, u) {
  const r = (n * 2654435761) % 100;
  if (u > 0.30 && r < 14) return 'double';
  if (u > 0.45 && r >= 14 && r < 34) return 'run';
  return 'normal';
}
function ropeReset(T) {
  const beats = T.beats, dur = T.def.dur;
  let t = 1.1, n = 0;
  while (t < dur - 0.7) {
    const u = t / dur, bpm = 100 + 50 * u, len = 60 / bpm, mode = ropePickMode(n, u), win = T.def.window;
    if (mode === 'double') {
      beats.push({ t, action: 'jump', glyph: '↑↑', win, bpm });
      beats.push({ t: t + Math.min(0.17, len * 0.45), action: 'jump', glyph: '↑', win, bpm });
      t += len * 1.15;
    } else if (mode === 'run') {
      for (let k = 0; k < 4 && t < dur - 0.7; k++) {
        beats.push({ t, action: k % 2 ? 'right' : 'left', glyph: k % 2 ? '→' : '←', win, bpm });
        t += len * 0.9;
      }
    } else {
      beats.push({ t, action: 'jump', glyph: '↑', win, bpm }); t += len;
    }
    n++;
  }
  const S = JRP; S.mode = 'spin'; S.catchT = 0; S.phase = 3 * Math.PI / 2;
  S.needInit = true; S.initSpin = true; S.initPhase = S.phase;
}
function ropeHit(b, perfect) {
  const S = JRP;
  if (S.mode === 'catch') { S.mode = 'spin'; S.needInit = true; S.initSpin = true; S.initPhase = S.phase; }
  S.jumpH = perfect ? 0.15 : 0.135;           // a perfect hop leaves the canvas a little higher
}
function ropeMiss(b, action) { jrCatch(); }

/* ───────── per-frame driver (called by trainFrame, right before Fighter.simulate) ───────── */
function ropeFrame(dt, T) {
  const S = JRP; if (!S.on || dt <= 0) return;
  if (S.mode === 'catch') {
    S.catchT += dt;
    if (S.catchT > 1.1) { S.mode = 'spin'; S.needInit = true; S.initSpin = true; S.initPhase = S.phase; }
  } else if (T.phase === 'play' && T.beats.length) {
    // 3π/2 (rope under the feet) exactly at each beat; one full revolution between neighbouring beats
    const bs = T.beats; let j = 0;
    for (let k = 0; k < bs.length; k++) { if (bs[k].t <= T.t) j = k; else break; }
    const a = bs[j];
    const span = j + 1 < bs.length ? Math.max(0.08, bs[j + 1].t - a.t) : Math.max(0.08, a.t - bs[Math.max(0, j - 1)].t);
    // frac is not clamped: after the last call the cord keeps spinning at the final tempo until the bell
    S.phase = 3 * Math.PI / 2 + 2 * Math.PI * Math.max(0, (T.t - a.t) / span);
    S.omega = 2 * Math.PI / span;
  } else { S.phase += 4.2 * dt; S.omega = 4.2; }   // idle spin on the rules / result cards

  jrPose();
  S.jumpY = jrJumpY();
  P1.group.position.y = S.jumpY;
  P1.group.updateMatrixWorld(true);
  P1.headFrame.multiplyMatrices(P1.head.matrixWorld, HEAD.restInvT);
  P1.headFrameInv.copy(P1.headFrame).invert();
  P1.headNow.y += S.jumpY;
  jrHandles(); jrFeet(); jrProfile();
  jrRope(dt); jrTube();
}

/* ───────── enter / leave ───────── */
function ropeEnter() {
  jrBuild();
  const S = JRP;
  S.twSave = { ...(window.__tw || {}) };
  window.__tw = window.__tw || {};
  window.__tw.noPlant = true; window.__tw.noClear = true; window.__tw.noSep = true;  // feet follow the legs, no arm/body separation
  BAG.on = false; showP2(false); if (BAG.g) BAG.g.visible = false;
  P1.resetState(); P1.blocking = false; P1.blockW = 0; P1.dodge = null; P1.gest = null; P1.cur = null; P1.aimW = 0;
  P1.place(0, Math.PI / 2, false);             // face +x → the rope's plane is x-y, seen from the default +z camera
  P1.mark = P1.group.position.clone(); P1.adv = 0; P1.advV = 0; P1.hold = 0;
  P1.group.position.y = 0; P1.group.updateMatrixWorld(true);
  S.on = true; S.mode = 'spin'; S.catchT = 0; S.jumpY = 0; S.phase = 3 * Math.PI / 2;
  S.needInit = true; S.initSpin = true; S.initPhase = S.phase;
  S.mesh.visible = true;
  jrPose(); jrHandles(); jrFeet(); jrProfile();   // seed the chain ends from the first posed frame
}
function ropeLeave() {
  const S = JRP; if (!S.on) return;
  S.on = false; S.mesh.visible = false; S.h[0].visible = S.h[1].visible = false;
  if (S.twSave !== null) window.__tw = S.twSave;
  P1.group.position.y = 0; P1.group.updateMatrixWorld(true);
  P1.place(-D_SEP / 2, Math.PI / 2, false); P1.mark = P1.group.position.clone();
}
window.__rope = JRP;   // debug: the rope state (mode 'spin' / 'catch', phase, the mesh)
