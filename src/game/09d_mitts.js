/* ───────── training: the coach's mitts (focus pads) ─────────
   The coach stands in the gym and holds two focus mitts; the boxer punches them. The pad: a curved cushion ~20 × 25 × 7 cm with a
   thick welt (кант) around the edge and stitching (прострочка) along it, a round target (круг-мишень) in the middle of the striking
   face and, on the back, the leather pocket with the strap for the hand. The mitt hangs on the coach's hand (the skin of the hand is
   not drawn: uGlv = 3 in the skin shader) and springs back elastically when the fist lands on it.
   Local frame of a mitt: the origin is the wrist, +z is the face's normal (out of the striking face), +y is the direction of the
   fingers (the pad's height), the cushion's centre 6 cm above the wrist and 7 cm in front of it. */
const MITTS = { on: false, hold: 'jab', holdS: 'L', hits: 0, power: 0.6, aim: new V3() };
const MITT_W = 0.100, MITT_H = 0.125, MITT_T = 0.035;   // the pad's half-sizes: 20 × 25 × 7 cm
const MITT_CY = 0.060, MITT_CZ = 0.070;                 // the pad's centre above the wrist and in front of it
const MITT_FZ = MITT_CZ + MITT_T;                       // the face's plane from the wrist
const MITT_R = 0.115;                                  // the face's radius (how far off the fist may land)
const MITT_X = 0.36;                                   // where the coach stands
const sgnPow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

/* the cushion: a rounded box, a little bulged on the striking side */
function mittPad(d, o) {
  const p = 2 / 3.4, q = 2 / 2.8;
  const x = sgnPow(d.x, p) * MITT_W, y = sgnPow(d.y, p) * MITT_H;
  let z = sgnPow(d.z, q) * MITT_T;
  if (z > 0) { const r = Math.max(0, 1 - (x / MITT_W) ** 2 - (y / MITT_H) ** 2); z += 0.006 * r * r; }
  return o.set(x, y + MITT_CY, z + MITT_CZ);
}
/* the pad's outline — the welt runs along it */
function mittEdge(t, o) {
  const p = 2 / 3.4, a = t * Math.PI * 2;
  return o.set(sgnPow(Math.cos(a), p) * MITT_W * 1.015, sgnPow(Math.sin(a), p) * MITT_H * 1.015 + MITT_CY, MITT_CZ + MITT_T - 0.007);
}
/* the pocket on the back: the leather the hand goes into */
function mittPocket(d, o) {
  const p = 2 / 3.0, q = 2 / 2.4;
  return o.set(sgnPow(d.x, p) * 0.052, sgnPow(d.y, p) * 0.072 + 0.045, sgnPow(d.z, q) * 0.030 + 0.008);
}
/* the strap across the back of the pocket (with its buckle) */
function mittStrap(d, o) {
  const p = 2 / 4.0;
  return o.set(sgnPow(d.x, p) * 0.050, sgnPow(d.y, p) * 0.016 - 0.004, sgnPow(d.z, p) * 0.005 - 0.027);
}
function mittBuckle(d, o) {
  const p = 2 / 4.0;
  return o.set(sgnPow(d.x, p) * 0.013 + 0.026, sgnPow(d.y, p) * 0.020 - 0.004, sgnPow(d.z, p) * 0.006 - 0.032);
}
/* the stitching along the welt: a dashed line on a strip of leather */
function mittStitchTex() {
  if (GEAR.mstitch) return GEAR.mstitch;
  const c = document.createElement('canvas'); c.width = 128; c.height = 32; const g = c.getContext('2d');
  g.fillStyle = '#48120f'; g.fillRect(0, 0, 128, 32);
  g.strokeStyle = '#d8c39c'; g.lineWidth = 3.5; g.setLineDash([10, 10]);
  g.beginPath(); g.moveTo(6, 16); g.lineTo(122, 16); g.stroke();
  g.setLineDash([]);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 1); t.anisotropy = 4;
  return GEAR.mstitch = t;
}

/* the mitt's geometry: the cushion, the welt with its stitching, the target, the pocket with the strap */
let MITT_GEO = null;
function mittGeo() {
  if (MITT_GEO) return MITT_GEO;
  const d = new V3(), ring = [], pad = [], welt = [], back = [], tgt = [];
  pad.push(gridGeo((u, v, o) => mittPad(sphDir(u, v, d), o), 56, 44, { c: new V3(0, MITT_CY, MITT_CZ), ku: 3, kv: 3 }));
  for (let i = 0; i < 80; i++) ring.push(mittEdge(i / 80, new V3()));
  welt.push(pipeGeo(ring, 0.011, true));                       // the thick edge (кант)
  { const r2 = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; r2.push(new V3(Math.cos(a) * 0.046, Math.sin(a) * 0.046 + MITT_CY, MITT_FZ + 0.004)); } welt.push(pipeGeo(r2, 0.0035, true)); }   // the ring around the target
  back.push(gridGeo((u, v, o) => mittPocket(sphDir(u, v, d), o), 36, 28, { c: new V3(0, 0.045, 0.008), col: () => 1 }));
  back.push(gridGeo((u, v, o) => mittStrap(sphDir(u, v, d), o), 28, 10, { c: new V3(0, -0.004, -0.027), col: () => 0.45 }));
  back.push(gridGeo((u, v, o) => mittBuckle(sphDir(u, v, d), o), 16, 12, { c: new V3(0.026, -0.004, -0.032), col: () => 0.22 }));
  tgt.push(gridGeo((u, v, o) => { const a = u * Math.PI * 2, r = v * 0.043; return o.set(Math.cos(a) * r, Math.sin(a) * r + MITT_CY, MITT_FZ + 0.0085); }, 44, 6, { c: new V3(0, MITT_CY, MITT_FZ), col: () => 1 }));
  MITT_GEO = { pad: mergeGeos(pad), welt: mergeGeos(welt), back: mergeGeos(back), tgt: mergeGeos(tgt) };
  return MITT_GEO;
}

/* the materials: dark red leather, a darker welt with the stitching, a brown pocket. The cushion wobbles a little after a hit
   (uWob: the leather's vibration). Each mitt gets its own materials, so the two wobble on their own. */
function mittMats() {
  const nm = leatherNormal().clone(); nm.needsUpdate = true; nm.repeat.set(3, 3);
  const pad = new THREE.MeshPhysicalMaterial({ color: '#7d221d', roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.45, normalMap: nm, normalScale: new THREE.Vector2(0.5, 0.5), vertexColors: true, side: THREE.DoubleSide });
  const U = { uWob: { value: 0 }, uWt: { value: 0 } };
  pad.onBeforeCompile = s => {
    Object.assign(s.uniforms, U);
    s.vertexShader = 'uniform float uWob;\nuniform float uWt;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed += objectNormal * uWob * sin( uWt * 44.0 + position.y * 60.0 + position.x * 25.0 );`);
  };
  pad.customProgramCacheKey = () => 'mitt-pad';
  const welt = new THREE.MeshPhysicalMaterial({ color: '#5a1512', roughness: 0.55, map: mittStitchTex(), normalMap: nm, normalScale: new THREE.Vector2(0.4, 0.4), vertexColors: true, side: THREE.DoubleSide });
  const back = new THREE.MeshPhysicalMaterial({ color: '#4a2b1c', roughness: 0.62, normalMap: nm, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, side: THREE.DoubleSide });
  const tgt = new THREE.MeshPhysicalMaterial({ color: '#39100e', roughness: 0.72, normalMap: nm, normalScale: new THREE.Vector2(0.5, 0.5), vertexColors: true, side: THREE.DoubleSide });
  return { pad, welt, back, tgt, U };
}

/* ───────── the rig: the mitts on the coach's hands ───────── */
const PADS = { L: null, R: null };
const MITT_AX = {};                       // the hand's own axes in the hand bone's local frame
const _mm1 = new V3(), _mm2 = new V3(), _mm3 = new V3(), _mm4 = new V3(), _mm5 = new V3(), _mm6 = new V3(), _mm7 = new V3(), _mm8 = new V3();
const _mA = new V3(), _mB = new V3(), _mC = new V3(), _mD = new V3();

/* the three feeds (world metres; the coach faces −x, the boxer stands at x = −0.575):
   the jab — the left mitt straight in front of the coach's face; the cross — the right mitt, a little lower; the hook — a mitt
   turned sideways, its face across the line of the hook. The mitt that is not fed waits at the chest. */
const MITT_HOLD = {
  jab: { L: { face: [-0.06, 1.53, 0.00], n: [-1, 0, 0], f: [0, 1, 0] } },
  cross: { R: { face: [0.00, 1.38, -0.03], n: [-0.96, 0, -0.28], f: [0, 1, 0] } },
  hook: {
    L: { face: [0.02, 1.56, -0.03], n: [-0.42, 0, 0.91], f: [0, 1, 0] },
    R: { face: [0.02, 1.56, 0.03], n: [-0.42, 0, -0.91], f: [0, 1, 0] },
  },
};
const MITT_NAME = { jab: 'джеб', cross: 'кросс', hook: 'хук' };

function mittBuild() {
  if (PADS.L) return;
  const G = mittGeo();
  for (const S of ['L', 'R']) {
    const mats = mittMats(), grp = new THREE.Group();
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; grp.add(m); };
    add(G.pad, mats.pad); add(G.welt, mats.welt); add(G.back, mats.back); add(G.tgt, mats.tgt);
    grp.matrixAutoUpdate = false; grp.visible = false; scene.add(grp);
    PADS[S] = { S, grp, mats, U: mats.U, sp: new Spring(900, 26), x: 0, init: false, tgt: new V3(),
      nrm: new V3(-1, 0, 0), up: new V3(0, 1, 0), latX: new V3(0, 0, 1), face: new V3() };
  }
}
/* the hand's own axes: the fingers (f) and the palm's normal (n), in the hand bone's local frame */
function mittAxes(S) {
  if (MITT_AX[S]) return MITT_AX[S];
  const B = P2.bones, h = B[`CC_Base_${S}_Hand`], pw = b => new V3().setFromMatrixPosition(b.matrixWorld);
  const lin = new M4().copy(h.matrixWorld); lin.setPosition(0, 0, 0); lin.invert();
  const f = pw(B[`CC_Base_${S}_Mid1`]).sub(pw(h)).transformDirection(lin).normalize();
  const x = pw(B[`CC_Base_${S}_Index1`]).sub(pw(B[`CC_Base_${S}_Pinky1`])).transformDirection(lin).normalize();
  const n = new V3().crossVectors(x, f).multiplyScalar(S === 'L' ? 1 : -1);
  return MITT_AX[S] = { f, n };
}
/* the arm: the wrist to the grip, the hand turned so that the fingers follow the pad and the palm is against it */
function mittArm(S, F, N, W) {
  const B = P2.bones, ax = mittAxes(S), Gi = _mA.copy(P2.group.matrixWorld).invert();
  const Fm = _mB.copy(F).transformDirection(Gi), Nm = _mC.copy(N).transformDirection(Gi);
  const qT = new Quat().setFromRotationMatrix(new M4().makeBasis(new V3().crossVectors(Fm, Nm), Fm, Nm));
  const qL = new Quat().setFromRotationMatrix(new M4().makeBasis(new V3().crossVectors(ax.f, ax.n), ax.f, ax.n));
  // the arm first: the hand's angle is set in the arm's final frame
  P2.ik(B[`CC_Base_${S}_Upperarm`], B[`CC_Base_${S}_Forearm`], B[`CC_Base_${S}_Hand`], P2.group.worldToLocal(_mD.copy(W)));
  P2.cc.updateMatrixWorld(true);
  P2.setMQuat(B[`CC_Base_${S}_Hand`], qT.multiply(qL.invert()));
  P2.cc.updateMatrixWorld(true);
}

/* ───────── the response: the mitt gives way and springs back ───────── */
/* the fist on the face of the fed mitt? */
function mittContact(att) {
  const m = PADS[MITTS.holdS]; if (!m) return null;
  const kn = att.knuckle(new V3()), d = kn.clone().sub(m.face);
  const along = d.dot(m.nrm);            // in front of the face is positive
  if (along > 0.16 || along < -0.04) return null;
  const lat = d.addScaledVector(m.nrm, -along), px = lat.dot(m.latX) / 0.105, py = lat.dot(m.up) / 0.13;
  if (Math.abs(px) ** 3.4 + Math.abs(py) ** 3.4 > 1) return null;   // the face is a rounded rectangle
  return kn.clone();
}
function mittHit(att, name, contact) {
  if (!contact) { whiffPunch(att); return; }
  const m = PADS[MITTS.holdS]; if (!m) { whiffPunch(att); return; }
  const P = PUNCH[name], pw = clamp(MITTS.power, 0.05, 1);
  const power = clamp(P.dmg / 16, 0.3, 1.3) * (0.55 + 0.75 * pw);
  m.sp.v += 0.3 + 1.15 * power;           // the leather takes the blow and springs back
  m.U.uWob.value = Math.min(0.022, m.U.uWob.value + 0.004 + 0.013 * power);
  m.U.uWt.value = 0;
  MITTS.hits++;
  sfx.mitt(power);
  G.shake = Math.max(G.shake, 0.004 + 0.012 * power);
  G.hitstop = Math.max(G.hitstop, 0.012);
  att.lastLand = G.t;
  att.fs && att.fs.land++;
}

/* ───────── per frame ───────── */
function mittTick(dt) {
  if (!MITTS.on) return;
  if (!PADS.L) mittBuild();
  const H = MITT_HOLD[MITTS.hold] || MITT_HOLD.jab;
  const fwd = _mA.set(0, 0, 1).transformDirection(P2.group.matrixWorld);   // the coach's facing
  for (const S of ['L', 'R']) {
    const m = PADS[S], h = H[S];
    const F = _mm1, N = _mm2, W = _mm3;
    if (h) { F.set(h.f[0], h.f[1], h.f[2]); N.set(h.n[0], h.n[1], h.n[2]); W.set(h.face[0], h.face[1], h.face[2]); }
    else {   // the mitt that is not fed waits at the chest
      const sh = P2.bpos(`CC_Base_${S}_Upperarm`, _mm4);
      F.set(0, 1, 0); N.copy(fwd); W.copy(sh).addScaledVector(fwd, 0.12).add(_mm5.set(0, -0.14, 0));
    }
    N.addScaledVector(F, -N.dot(F)).normalize();
    W.addScaledVector(F, -MITT_CY).addScaledVector(N, -MITT_FZ);    // the wrist: the face is MITT_FZ in front of it
    // the pad gives way and springs back
    m.sp.step(dt);
    if (m.sp.x < 0) { m.sp.x = 0; if (m.sp.v < 0) m.sp.v = 0; }
    const dep = _mm6.copy(P1.knuckle(_mm7)).sub(m.face).dot(m.nrm);
    if (dep > 0 && m.sp.x < dep) m.sp.x = dep;      // the fist may not sink into the leather
    m.U.uWt.value += dt;
    m.U.uWob.value = Math.max(0, m.U.uWob.value - dt * 0.05);
    // the wrist's target: smoothed, so a new feed moves the mitt smoothly
    if (!m.init) { m.tgt.copy(W); m.init = true; } else m.tgt.lerp(W, Math.min(1, dt * 12));
    mittArm(S, F, N, _mm4.copy(m.tgt).addScaledVector(N, -m.sp.x));
    // the mitt itself, carried by the wrist
    const wrist = P2.bpos(`CC_Base_${S}_Hand`, _mm5), X = _mm6.crossVectors(F, N), Y = _mm7.copy(F), Z = _mm8.copy(N);
    const wob = m.U.uWob.value * Math.sin(m.U.uWt.value * 26);
    if (wob) { const q = new Quat().setFromAxisAngle(X, wob); Y.applyQuaternion(q); Z.applyQuaternion(q); }
    m.grp.matrix.makeBasis(X, Y, Z).setPosition(wrist);
    m.grp.matrixWorldNeedsUpdate = true;
    m.nrm.copy(N); m.up.copy(F); m.latX.copy(X);
    m.face.copy(wrist).addScaledVector(F, MITT_CY).addScaledVector(N, MITT_FZ);
  }
  const tm = PADS[MITTS.holdS];
  if (tm) MITTS.aim.copy(tm.face);     // the boxer aims his punch at the fed mitt
}

/* ───────── the mode ───────── */
function mittStart() {
  if (MITTS.on) return;
  MITTS.on = true; MITTS.hold = 'jab'; MITTS.holdS = 'L'; MITTS.hits = 0; MITTS.power = 0.6;
  BAG.on = false; BAG.g.visible = false;
  setLocation('boxgym');
  mittBuild();
  P1.place(-D_SEP / 2, Math.PI / 2, false);
  P2.place(MITT_X, -Math.PI / 2, true);
  P1.mark = P1.group.position.clone(); P2.mark = P2.group.position.clone();
  P1.resetState(); P2.resetState();
  // the coach: a tank top, no gloves — his hands are inside the mitts
  P2.applyLook({ ...(P2.gear.look || {}), top: { id: 'tank', color: 'black' }, bottom: { id: 'shorts', color: 'black' }, hands: 'wraps' });
  P2.wrapMesh.visible = false;
  P2.flesh.u.uGlv.value = 3;
  for (const S of ['L', 'R']) { PADS[S].sp.zero(); PADS[S].init = false; PADS[S].grp.visible = true; }
  G.state = 'fight'; G.paused = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; G.shake = 0;
  G.round = 1; G.roundT = 3600; G.cutT = 0;
  $('n2').textContent = 'Тренер'; const sl = $('st2'); if (sl) sl.textContent = MITT_NAME[MITTS.hold];
  show('hud', true); show('pad', true);
  sfx.unlock && sfx.unlock();
  for (let i = 0; i < 6; i++) mittTick(1 / 60);   // the arms go up at once
}
function mittStop() {
  if (!MITTS.on) return;
  MITTS.on = false;
  for (const S of ['L', 'R']) if (PADS[S]) PADS[S].grp.visible = false;
  P2.flesh.u.uGlv.value = 0; P2.wrapMesh.visible = true;
}
function mittHold(kind) {
  if (!MITTS.on) mittStart();
  if (!MITT_HOLD[kind]) return;
  MITTS.hold = kind; MITTS.holdS = kind === 'jab' ? 'L' : 'R';
  const sl = $('st2'); if (sl) sl.textContent = MITT_NAME[kind];
}
/* the judge throws a real punch at the fed mitt */
function mittCmdHit(side, power) {
  if (!MITTS.on) mittStart();
  side = side === 'R' ? 'R' : 'L';
  MITTS.power = clamp(power === undefined || power === null ? 0.6 : power, 0.05, 1);
  if (MITTS.hold === 'hook') MITTS.holdS = side;             // the hook can be fed with either mitt
  else if (side !== MITTS.holdS) { MITTS.hold = side === 'L' ? 'jab' : 'cross'; MITTS.holdS = side; }
  const name = MITTS.hold === 'hook' ? (side === 'L' ? 'hookR' : 'hookL') : (side === 'R' ? 'cross' : 'jab');
  if (P1.cur && !P1.resolved) P1.cancelPunch();
  P1.wantBody = false; P1.powerNext = MITTS.power > 0.62;
  if (!P1.canAct()) return;
  P1.startPunch(name);
}

/* the judge's API */
window.__mitts = {
  start() { mittStart(); },
  stop() { mittStop(); toMenu(); },
  hold(kind) { mittHold(kind); },
  hit(side, power) { mittCmdHit(side, power); },
  get state() { return { on: MITTS.on, hold: MITTS.hold, side: MITTS.holdS, hits: MITTS.hits, L: PADS.L && PADS.L.face.toArray(), R: PADS.R && PADS.R.face.toArray() }; },
};
