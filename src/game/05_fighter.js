/* ───────── fighter ───────── */
// scratch for the per-frame fighter code (walk, ik, pose, plantFeet, armClear): nothing there allocates
const _walkQ = [], _ik1 = new Quat(), _ik2 = new Quat(), _ik3 = new Quat(), _po1 = new V3(), _po2 = new V3(), _po3 = new V3(), _po4 = new V3(), _poq1 = new Quat(), _poq2 = new Quat();
const _pf1 = new V3(), _pf2 = new V3(), _pf3 = new V3(), _pf4 = new V3(), _pfq = new Quat();
// pinned points of a cloth / strand set follow their targets (used on the frames where the solver is skipped)
function simPin(S) { const p = S.p, t = S.t, inv = S.inv; for (let i = 0, n = inv.length; i < n; i++) if (inv[i] === 0) { const k = 3 * i; p[k] = t[k]; p[k + 1] = t[k + 1]; p[k + 2] = t[k + 2]; } }
class Fighter {
  constructor(isPlayer) {
    this.isPlayer = isPlayer;
    const g = this.group = new THREE.Group(); scene.add(g);
    this.cc = SkeletonUtils.clone(T.cc); g.add(this.cc);
    const B = this.bones = firstBones(this.cc);
    this.cc.traverse(o => { if (o.name === 'CC_Base_Body') this.body = o; });
    this.u = { uHair: { value: new THREE.Color() }, uHairAmt: { value: 1 }, uStubAmt: { value: 1 }, uDmg: { value: 0 } };
    this.skinMats = []; this.hairCol = new THREE.Color();
    this.flesh = new Flesh(this);
    this.body.material = T.matNames.map(n => {
      const key = { Std_Skin_Head: 'head', Std_Skin_Body: 'body', Std_Skin_Arm: 'arm', Std_Skin_Leg: 'leg' }[n];
      if (!key) return n === 'Std_Nails' ? nailMatFor(this.flesh.u) : T.hiddenMat;
      const m = new THREE.MeshPhysicalMaterial({ map: T.tex[key + '_d'], normalMap: T.tex[key + '_n'], roughness: key === 'head' ? 0.48 : 0.52, specularIntensity: 0.5, clearcoat: 0.08, clearcoatRoughness: 0.4, sheen: 0.15, sheenColor: new THREE.Color('#ff9b80'), sheenRoughness: 0.6, envMapIntensity: 0.6 });
      this.skinMats.push(m); return skinify(m, key === 'head' ? this.u : null, this.flesh.u);
    });
    g.updateMatrixWorld(true);
    this.hip = B.CC_Base_Hip; this.head = B.CC_Base_Head; this.boneRoot = B.CC_Base_BoneRoot;
    this.rootQ0 = this.boneRoot.parent.getWorldQuaternion(new Quat()); this.BRinv = this.boneRoot.matrixWorld.clone().invert();
    this.rb = RJ.map(n => B['CC_Base_' + n]);
    this.allBones = []; this.cc.traverse(o => { if (o.isBone) this.allBones.push(o); });
    this.bindQ = new Map(this.allBones.map(b => [b, b.quaternion.clone()]));
    // forearm twist rig: the hand's roll about the forearm is spread over the CC twist bones (no candy-wrapper wrist)
    this.twist = ['L', 'R'].map(S => { const fa = B[`CC_Base_${S}_Forearm`], h = B[`CC_Base_${S}_Hand`], ax = h.position.clone().normalize();
      // Twist02 hangs under Twist01: each gets its share of the roll, expressed in its own parent chain (0.3 + 0.35 = 0.65 at the wrist end)
      const bones = []; let acc = new Quat();
      for (const [b, f] of [[B[`CC_Base_${S}_ForearmTwist01`], 0.3], [B[`CC_Base_${S}_ForearmTwist02`], 0.35]]) {
        if (!b) continue; acc = acc.clone().multiply(b.quaternion); bones.push({ b, f, q0: b.quaternion.clone(), axL: ax.clone().applyQuaternion(acc.clone().invert()) });
      }
      return { h, ax, bones }; });
    // shoulder: the upper-arm twist bones share the humerus roll (deltoid does not candy-wrap); the clavicle carries the shoulder girdle
    this.chestBind = this.mquat(B.CC_Base_Spine02, new Quat());
    this.shoulder = ['L', 'R'].map(S => {
      const cl = B[`CC_Base_${S}_Clavicle`], ua = B[`CC_Base_${S}_Upperarm`], fa = B[`CC_Base_${S}_Forearm`], t1 = B[`CC_Base_${S}_UpperarmTwist01`], t2 = B[`CC_Base_${S}_UpperarmTwist02`];
      const ax = fa.position.clone().normalize(), o = { cl, ua, fa, ax, ua0: ua.quaternion.clone(), tw: [] };
      o.clDir = this.mpos(ua, new V3()).sub(this.mpos(cl, new V3())).normalize();   // bind: clavicle → shoulder joint (chest bind frame = model bind)
      let acc = new Quat();
      for (const [b, f] of [[t1, -0.5], [t2, 0.25]]) { if (!b) continue; acc = acc.clone().multiply(b.quaternion); o.tw.push({ b, f, q0: b.quaternion.clone(), axL: ax.clone().applyQuaternion(acc.clone().invert()) }); }
      return o;
    });
    this.handBones = this.allBones.filter(b => /_(L|R)_(Hand|Thumb|Index|Mid|Ring|Pinky)\d?$/.test(b.name));

    // wraps (skinned) + shorts (cloth)
    // bare-knuckle wraps soak up the blood they land on: knuckle centres in the wraps' bind space, tint per hand
    const wmat = this.wmat = T.wrapMat.clone(); this.wrapU = { uWB: { value: new THREE.Vector2() }, uKL: { value: new V3() }, uKR: { value: new V3() }, uWS: { value: 100 } };
    wmat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.wrapU);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWP = position;');
      sh.fragmentShader = 'varying vec3 vWP;\nuniform vec2 uWB;\nuniform vec3 uKL;\nuniform vec3 uKR;\nuniform float uWS;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
 { float dl = distance( vWP, uKL ) / uWS, dr = distance( vWP, uKR ) / uWS, n = fract( sin( dot( floor( vWP / uWS * 160.0 ), vec3( 12.99, 78.23, 37.72 ) ) ) * 43758.5 );
   float b = max( smoothstep( 0.1, 0.03, dl * ( 0.8 + 0.4 * n ) ) * uWB.x, smoothstep( 0.1, 0.03, dr * ( 0.8 + 0.4 * n ) ) * uWB.y );
   diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.32, 0.03, 0.04 ), clamp( b, 0.0, 0.9 ) ); }`);
    };
    wmat.customProgramCacheKey = () => 'wraps-blood';
    const wm = this.wrapMesh = new THREE.SkinnedMesh(T.wraps.geo, wmat); g.add(wm); wm.updateMatrixWorld(true);
    wm.bind(new THREE.Skeleton(T.wraps.names.map(n => B[n] || this.boneRoot)), T.wraps.bind.clone());
    { const bi = wm.bindMatrix.clone().invert(); this.wrapU.uWS.value = 1 / (wm.matrixWorld.getMaxScaleOnAxis() * wm.bindMatrix.getMaxScaleOnAxis());
      this.wrapU.uKL.value.setFromMatrixPosition(B.CC_Base_L_Mid1.matrixWorld).applyMatrix4(bi); this.wrapU.uKR.value.setFromMatrixPosition(B.CC_Base_R_Mid1.matrixWorld).applyMatrix4(bi); }
    wm.frustumCulled = false; wm.castShadow = wm.receiveShadow = true;
    this.shortsCanvas = document.createElement('canvas'); this.shortsCanvas.width = 256; this.shortsCanvas.height = 512;
    this.shortsTex = new THREE.CanvasTexture(this.shortsCanvas); this.shortsTex.colorSpace = THREE.SRGBColorSpace; this.shortsTex.anisotropy = 8;
    this.shortsMat = new THREE.MeshPhysicalMaterial({ map: this.shortsTex, normalMap: T.shortsNormal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.46, sheen: 0.85, sheenRoughness: 0.34, sheenColor: new THREE.Color('#d8404a'), specularIntensity: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.6 });
    // the part of the trunks under a top is not drawn (uTopV: from this v of their texture up; set in dress): the cloth of the trunks is simulated, the top is not, and lying down they would come through it
    this.shortsU = { uTopV: { value: 9 } }; this.shortsMat.onBeforeCompile = s => { s.uniforms.uTopV = this.shortsU.uTopV; s.fragmentShader = 'uniform float uTopV;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if ( vMapUv.y > uTopV ) discard;'); };
    const ssm = new THREE.SkinnedMesh(T.shortsGeo, this.shortsMat); ssm.bind(new THREE.Skeleton(this.body.skeleton.bones), new M4());

    // colliders
    this.ATT = []; this.headFrame = new M4(); this.headFrameInv = new M4();
    const C = this.COL = { thighL: capC(0.07), thighR: capC(0.07), neck: capC(0.052), chest: sphC(0.15), chestFront: capC(0.12), hipBar: capC(0.11) };
    this.chestPt = this.attach('CC_Base_Spine02', new V3(0, 1.43, -0.06));
    this.cfA = this.attach('CC_Base_Spine02', new V3(-0.09, 1.36, 0.03)); this.cfB = this.attach('CC_Base_Spine02', new V3(0.09, 1.36, 0.03));
    this.frontAtt = this.attach('CC_Base_Spine02', new V3(0, 1.33, 0.16));
    this.ribs = [this.attach('CC_Base_Spine01', new V3(0.115, 1.2, 0.075)), this.attach('CC_Base_Spine01', new V3(-0.115, 1.2, 0.075))];
    C.head = { t: 2, M: this.headFrame, I: this.headFrameInv, ax: HEAD.R.x + 0.006, ay: HEAD.R.y + 0.006, az: HEAD.R.z + 0.006 };
    this.tails = [this.makeTail('L'), this.makeTail('R')];
    gearSetup(this); this.gear = { shells: {}, guard: guardMesh(), gloves: null, hg: null, spar: false };
    this.updateColliders();
    this.shorts = new ShortsCloth(ssm, this);
    this.hair = buildHair(T.simRoots, { kind: 'hair', frame: this.headFrame, COL: C, np: 5 }); this.hair.frame = this.headFrame;
    for (let i = 0; i < this.hair.width.length; i++) this.hair.width[i] *= 1.35;
    scene.add(this.hair.mesh);
    this.baseMesh = new THREE.Mesh(T.baseGeo, hairMat('hair')); this.beardMesh = new THREE.Mesh(T.beardGeo, hairMat('beard'));
    for (const m of [this.baseMesh, this.beardMesh]) { m.matrixAutoUpdate = false; m.frustumCulled = false; m.castShadow = true; scene.add(m); }
    this.jigs = ['L', 'R'].map(s => B[`CC_Base_${s}_Breast`]).filter(Boolean).map(b => new Jig(b, 1100, 52, 0.005));   // pectorals are muscle on the ribs: a stiff, well-damped few millimetres, not a bounce

    // animation source rig + retarget pairs (all maths in model space, so the group may be mirrored)
    this.src = T.src.clone(true); this.src.updateMatrixWorld(true);
    const sb = firstBones(this.src), pw = (b, v) => v.setFromMatrixPosition(b.matrixWorld);
    this.pairs = []; this.pairBy = new Map();
    for (const [s, c] of Object.entries(MAP)) {
      const S = sb[s], Cb = B[c]; if (!S || !Cb) continue;
      const pr = { S, C: Cb, qsRestInv: S.getWorldQuaternion(new Quat()).invert(), qcRest: Cb.getWorldQuaternion(new Quat()), R0: new Quat(), tw: new Quat() };
      const cs = CHILD[s];
      if (cs && sb[cs] && B[MAP[cs]]) pr.R0.setFromUnitVectors(pw(B[MAP[cs]], new V3()).sub(pw(Cb, new V3())).normalize(), pw(sb[cs], new V3()).sub(pw(S, new V3())).normalize());
      this.pairs.push(pr); this.pairBy.set(Cb, pr);
    }
    this.srcHip = sb.mixamorigHips; this.hipRatio = pw(this.hip, new V3()).y / pw(this.srcHip, new V3()).y; this.hipModel = new V3();
    this.mixer = new THREE.AnimationMixer(this.src); this.act = {}; this.w = {};
    this.act.idle = this.mixer.clipAction(T.clips.idle); this.act.idle.play(); this.act.idle.time = isPlayer ? 0 : 0.9;
    // two players per punch: throwing the same punch again starts the second copy from the top while the first one fades out —
    // restarting a single action jumps the arm back to its first frame (the "teleport" on a double hook)
    this.inst = {}; this.wA = new Map(); T.clips2 = T.clips2 || {};
    for (const k of PN) { const cl2 = T.clips2[k] || (T.clips2[k] = T.clips[k].clone()); this.inst[k] = [T.clips[k], cl2].map(c => { const a = this.mixer.clipAction(c); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; this.wA.set(a, 0); return a; }); this.act[k] = this.inst[k][0]; this.w[k] = 0; }

    this.sp = { hp: new Spring(170, 7), hy: new Spring(150, 8), hr: new Spring(170, 7), sp: new Spring(90, 8), sr: new Spring(90, 8), hz: new Spring(120, 13) };
    this.jp = Array.from({ length: 17 }, () => new V3()); this.jo = Array.from({ length: 17 }, () => new V3()); this.jdt = 1 / 60;
    this.headNow = new V3(0, 1.6, 0); this.headNeutral = new V3(0, 1.6, 0); this.aimV = new V3(); this.aimTarget = null; this.aimW = 0; this.aimArm = 'L';
    this.rag = new Ragdoll(this); this.face = new Face(this); this.ph = rr() * 6; this.speed = 1.5; this.simReset = true; this.rootZ = 1;
    this.resetState();
  }
  resetState() {
    this.fs = { thr: 0, land: 0, pow: 0, blk: 0, dmg: 0, kd: 0, eva: 0, sig: 0 }; this.hold = null; this.ftOff = null; this.gest = null; this.shellT = 0; this.shakeT = -9; this.hitLog = []; this.heavy = false; this.powerNext = false; this.fatK = 1; this.punchK = 1;
    this.hp = 100; this.hpCap = 100; this.hitT = -9; this.stamina = 100; this.staT = 0; this.cur = null; this.release = false; this.resolved = false; this.whiff = false; this.punchId = 0;
    if (this.wrapU) this.wrapU.uWB.value.set(0, 0);
    this.gu = null; this.wobble = 0; this.kdCount = 0; this.cutLook = false; this.doomed = null; this.liver = null; this.wind = 0; this.adv = 0; this.advV = 0; this.knock = 0; this.dmgMul = 1; if (this.mark) { this.group.position.copy(this.mark); this.slide = null; }
    this.dodge = null; this.stunUntil = 0; this.counterUntil = 0; this.ko = false; this.frozen = false; this.rag.stop(); this.aimW = 0; this.bodyShot = false; this.blocking = false; this.blockW = 0; this.daze = 0; this.wantBody = false;
    for (const k of PN) { this.w[k] = 0; for (const a of this.inst[k]) { a.stop(); this.wA.set(a, 0); } this.act[k] = this.inst[k][0]; }
    for (const s of Object.values(this.sp)) s.zero();
    this.u.uDmg.value = 0; this.dmgShow = 0; if (this.flesh) this.flesh.reset(); if (this.face) this.face.reset(); this.simReset = true; for (const j of this.jigs) j.init = false;
  }
  place(x, rotY, mirror) {
    const g = this.group; g.position.set(x, 0, 0); g.rotation.y = rotY; if (mirror) g.scale.x = -1;
    g.updateMatrixWorld(true); this.simReset = true;
  }
  attach(name, worldRest) { const b = this.bones[name]; const a = { b, local: b.worldToLocal(worldRest.clone()), w: new V3() }; this.ATT.push(a); return a; }
  bpos(name, v) { return v.setFromMatrixPosition(this.bones[name].matrixWorld); }
  mpos(bone, v) { v.setFromMatrixPosition(bone.matrixWorld); return this.group.worldToLocal(v); }
  mquat(bone, q) { q.identity(); for (let b = bone; b && b !== this.group; b = b.parent) q.premultiply(b.quaternion); return q; }
  setMQuat(bone, q) { this.mquat(bone.parent, _qp).invert(); bone.quaternion.copy(_qp).multiply(q); }
  setHip(model) { this.hip.position.copy(model).applyMatrix4(this.BRinv); }

  /* ── knockdown poses and the get-up ──
     Key poses are written in the same anatomical joint angles as the ragdoll (flex, side, twist in degrees, mirrored for the right side)
     and turned into model-space rotations by forward kinematics from a pitched pelvis. The get-up blends ragdoll pose → hands-and-knees /
     kneel → one knee → the live idle animation, limb by limb with offsets (hands push first, head lags), while a ground lock keeps the
     knees and feet on the canvas. */
  keyPose(spec, pitch) {
    const R = this.rag, out = new Map(), pel = R.defs[0];
    out.set(pel, new Quat().setFromAxisAngle(_v1.set(1, 0, 0), pitch * D2R).multiply(pel.qBind));
    for (const d of R.defs) {
      if (!d.p) continue; const a = spec[d.key] || [0, 0, 0], m = d.right ? -1 : 1;
      const v = new V3().addScaledVector(d.ax[0], a[0] * D2R).addScaledVector(d.ax[1], a[1] * m * D2R).addScaledVector(d.ax[2], a[2] * m * D2R), l = v.length();
      const Rt = l > 1e-6 ? new Quat().setFromAxisAngle(v.multiplyScalar(1 / l), l) : new Quat();
      out.set(d, out.get(d.p).clone().multiply(d.qPbind.clone().invert()).multiply(Rt).multiply(d.qBind));
    }
    return out;
  }
  /* hands on the canvas: swing each whole arm about the shoulder (elbow bend kept) until the palm meets the floor, keeping the
     arm's heading — a man on hands and knees leans on his hands, they don't hover */
  plantHands(k) {
    for (const sd of ['L', 'R']) {
      const ua = this.bones[`CC_Base_${sd}_Upperarm`], S = this.mpos(ua, new V3()), H = this.mpos(this.bones[`CC_Base_${sd}_Hand`], new V3());
      const v = H.clone().sub(S), len = v.length(), drop = S.y - 0.045; if (H.y < 0.05 || drop < 0.08 || len < 0.1) continue;
      const hd = _v1.set(v.x, 0, v.z); if (hd.lengthSq() < 1e-6) hd.set(0, 0, 1); hd.normalize();
      const t = len > drop ? hd.multiplyScalar(Math.sqrt(len * len - drop * drop)).setY(-drop) : _v1.set(0, -1, 0);
      const q = _qb.setFromUnitVectors(v.normalize(), t.normalize()); _qc.identity().slerp(q, clamp(k, 0, 1));
      this.setMQuat(ua, _qc.multiply(this.mquat(ua, _qd))); ua.updateMatrixWorld(true);
    }
  }
  capturePose() { const out = new Map(); for (const d of this.rag.defs) out.set(d, this.mquat(d.bone, new Quat())); return { q: out, hip: this.mpos(this.hip, new V3()) }; }
  // write a blend of two poses (w: per-joint weight function), then let the ground lock settle the hips so the supports touch the canvas
  blendPose(A, B, hipA, hipB, w, gl, hands = 0, plant = hands, swing = null) {
    const R = this.rag, hp = _v6.lerpVectors(hipA, hipB, w(R.defs[0]));
    for (const d of R.defs) {
      if (!d.p) this.setHip(hp);
      this.setMQuat(d.bone, _qa.copy(A.get(d)).slerp(B.get(d), w(d))); d.bone.updateMatrixWorld(true);
    }
    if (gl > 0) {
      const B2 = this.bones; let lo = 9;
      for (const [n, c] of [['L_Calf', 0.055], ['R_Calf', 0.055], ['L_Foot', 0.075], ['R_Foot', 0.075], ['L_ToeBase', 0.025], ['R_ToeBase', 0.025]]) if (n[0] !== swing) lo = Math.min(lo, this.mpos(B2['CC_Base_' + n], _v5).y - c);   // a leg in mid-step carries no weight
      if (hands > 0) for (const n of ['L_Hand', 'R_Hand']) lo = Math.min(lo, this.mpos(B2['CC_Base_' + n], _v5).y - 0.035 + (1 - hands) * 0.3);
      hp.y -= lo * gl; this.setHip(hp); this.cc.updateMatrixWorld(true);
    }
    if (plant > 0) this.plantHands(plant);
    this.scapula(); this.spreadTwist(); this.cc.updateMatrixWorld(true);
    return hp;
  }
  takeKnee(kind = 'knee') {   // takes a knee: drops onto the rear knee, front foot planted, a glove on the front thigh (liver: both knees, folded over)
    const S = this.capturePose(); this.cur = null;
    this.gu = { mode: 'knee', stage: 'drop', t: 0, A: S.q, hipA: S.hip, B: kind === 'liver' ? POSES.liver(this) : POSES.oneKnee(this), hipB: S.hip.clone().setY(0.55), off: new V3(), slow: kind === 'liver' };
  }
  startGetUp(mode) {
    // from the canvas: first a powered-ragdoll phase (roll onto the front, plant hands and knees, push up), then the kinematic rise
    if (mode === 'fall' && this.rag.on) { this.rag.prof.getup = { t0: this.rag.t }; return; }
    const S = this.capturePose();
    if (this.rag.on) { for (const S2 of this.shoulder) if (S2.clBase) S2.cl.quaternion.copy(S2.clBase); this.rag.stop(); }
    const g = this.gu = { mode, t: 0, A: S.q, hipA: S.hip, off: new V3(S.hip.x - this.hipModel.x, 0, S.hip.z - this.hipModel.z) };
    if (mode === 'knee') { g.stage = 'rise'; g.B = null; g.riseFrom = S; }
    else if (mode === 'fours') { g.stage = 'up0'; g.B = POSES.fours(this); g.hipB = S.hip.clone().setY(0.5); }
    else { g.stage = 'up1'; g.B = POSES.kneel(this); g.hipB = S.hip.clone().setY(0.45); }
  }
  collapse() { this.gu = null; this.rag.start(new V3(0, -0.3, 0), null, 'drop', null); }
  /* what keyframes leave out: a hurt man breathing hard (chest heaving ~0.6 Hz), his head and trunk drifting (dizzy, low-frequency
     sway, bigger the worse the knockdown), the head going down while he pushes (effort) and coming up after; per get-up random
     tempo so no two look the same */
  lifeLayer(g, effort) {
    if (!g.ph) g.ph = [rr() * 6, rr() * 6, rr() * 6, rr() * 6];
    const t = G.t, P = g.ph, dz = clamp(0.35 + (this.daze || 0) * 0.6 + (g.sev || 0) * 0.2, 0, 1), B = this.bones;
    const br = Math.sin(t * 3.8), sw1 = Math.sin(t * 1.3 + P[0]) + 0.5 * Math.sin(t * 2.3 + P[1]), sw2 = Math.sin(t * 0.9 + P[2]) + 0.4 * Math.sin(t * 3.1 + P[3]);
    this.rot(B.CC_Base_Spine02, 0.045 * br + 0.08 * effort, 0.03 * dz * sw2, 0.05 * dz * sw1);
    this.rot(B.CC_Base_Waist, 0.02 * br + 0.06 * effort, 0, 0.03 * dz * sw1);
    this.rot(B.CC_Base_NeckTwist01, 0.25 * effort + 0.05 * br, 0.08 * dz * sw2, 0.07 * dz * sw1);
    this.rot(this.head, 0.2 * effort + 0.04 * Math.sin(t * 2.6 + P[1]) * dz, 0.12 * dz * Math.sin(t * 0.8 + P[3]), 0.1 * dz * sw2);
    for (const S of ['L', 'R']) this.rot(B[`CC_Base_${S}_Clavicle`] || B[`CC_Base_${S}_Upperarm`], 0, 0, (S === 'L' ? 1 : -1) * 0.04 * br);
    this.cc.updateMatrixWorld(true);
  }
  getUpStep(dt) {
    const g = this.gu; if (g.tempo == null) { g.tempo = 0.8 + rr() * 0.45; g.pause = rr() < 0.6 ? 0.25 + rr() * 0.5 : 0; } g.t += dt / g.tempo; const L = (d, lead) => sstep(0, 1, clamp(g.t / g.T * 1.15 - lead, 0, 1));
    const lead = d => d.key.startsWith('uarm') || d.key.startsWith('farm') ? (g.stage === 'up1' ? 0.0 : 0.12) : d.key === 'neck' || d.key === 'head' ? -0.12 : d.leg ? 0 : -0.04;
    const w = d => L(d, lead(d));
    if (g.stage === 'drop') { g.T = g.slow ? 0.8 : 0.34; this.blendPose(g.A, g.B, g.hipA, g.hipB, w, 1); if (g.t >= g.T) { g.stage = 'hold'; g.t = 0; } return; }
    if (g.stage === 'hold') {   // on one knee: breathing hard, head down then up, a little sway — listening to the count
      const P = this.capturePose(); this.blendPose(g.B, g.B, g.hipB, g.hipB, () => 1, 1);
      this.rot(this.head, 0.18 + 0.06 * Math.sin(G.t * 2.1), 0.05 * Math.sin(G.t * 0.7), 0); this.lifeLayer(g, 0.3);
      return;
    }
    if (g.stage === 'up0') {   // whatever the physics left him in → hands and knees
      g.T = 0.7; this.blendPose(g.A, g.B, g.hipA, g.hipB, w, sstep(0, 0.4, g.t / g.T), 1, sstep(0.15, 0.7, g.t / g.T)); this.lifeLayer(g, Math.sin(Math.PI * clamp(g.t / g.T, 0, 1)));
      if (g.t >= g.T) { g.stage = 'up1'; g.t = 0; g.A = g.B; g.hipA = this.mpos(this.hip, new V3()); g.B = POSES.kneel(this); g.hipB = g.hipA.clone(); g.fromFours = true; } return;
    }
    if (g.stage === 'up1') { g.T = g.fromFours ? 0.75 : 1.15; this.blendPose(g.A, g.B, g.hipA, g.hipB, w, g.fromFours ? 1 : sstep(0.1, 0.7, g.t / g.T), g.fromFours ? 1 - sstep(0.2, 0.6, g.t / g.T) : 0); this.lifeLayer(g, 0.6 * Math.sin(Math.PI * clamp(g.t / g.T, 0, 1)));
      if (g.t >= g.T && g.pause > 0 && !g.paused) { g.paused = true; g.t = g.T; g.holdT = g.pause; }
      if (g.holdT > 0) { g.holdT -= dt; g.t = g.T - 1e-4; return; }   // a breath on the knee before the last push
      if (g.t >= g.T) { g.stage = 'up2'; g.t = 0; g.A = g.B; g.hipA = this.mpos(this.hip, new V3()); g.B = POSES.oneKnee(this); g.hipB = g.hipA.clone(); } return; }
    if (g.stage === 'up2') {   // stepping the front foot up: the knee lifts and the foot clears the canvas, then it is planted
      g.T = 0.8; if (!g.M) g.M = POSES.step(this); const u = g.t / g.T;
      if (u < 0.5) { const k = sstep(0, 1, u * 2); this.blendPose(g.A, g.M, g.hipA, g.hipB, d => d.key.endsWith('L') && d.leg ? k : k * 0.5, 1, 0, 0, 'L'); }
      else { const k = sstep(0, 1, (u - 0.5) * 2); this.blendPose(g.M, g.B, g.hipA, g.hipB, d => d.key.endsWith('L') && d.leg ? k : 0.5 + 0.5 * k, 1, 0, 0, k < 0.8 ? 'L' : null); }
      this.lifeLayer(g, 0.5 * Math.sin(Math.PI * clamp(u, 0, 1))); if (g.t >= g.T) { g.stage = 'rise'; g.t = 0; } return; }
    if (g.stage === 'hold' || g.stage === 'rise') {
      if (!g.B) { g.B = POSES.oneKnee(this); }
      if (!g.riseFrom) { g.riseFrom = this.capturePose(); }
      g.T = 1.05;
      // the live idle animation is the target: the hand-off at the end is seamless
      this.animate(dt); this.retarget(); this.cc.updateMatrixWorld(true);
      const I = this.capturePose(), hipI = I.hip.clone().add(g.off);
      this.blendPose(g.riseFrom.q, I.q, g.riseFrom.hip, hipI, w, 1 - sstep(0.6, 1, g.t / g.T));
      { const u = clamp(g.t / g.T, 0, 1); this.lifeLayer(g, 0.7 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u)); }
      if (g.t >= g.T) {   // standing: move the whole fighter to where he got up, then he shuffles back to his mark
        if (!this.mark) this.mark = this.group.position.clone();
        const o = this.group.localToWorld(g.off.clone()).sub(this.group.localToWorld(new V3()));
        this.slide = { t: 0, from: this.group.position.clone().add(o) }; this.group.position.copy(this.slide.from); this.group.updateMatrixWorld(true);
        this.gu = null; this.daze = Math.max(this.daze, 0.5); this.wobble = 1.6; this.stunUntil = G.t + 0.4;
        if (G.kd) G.kd.done = G.t + 0.7;
      }
    }
  }

  makeTail(side) {
    const B = this.bones, hand = B[`CC_Base_${side}_Hand`], fore = B[`CC_Base_${side}_Forearm`];
    const Hp = this.bpos(`CC_Base_${side}_Hand`, new V3()), Ep = this.bpos(`CC_Base_${side}_Forearm`, new V3()), dir = Hp.clone().sub(Ep).normalize();
    const frame = new M4(), restInv = hand.matrixWorld.clone().invert(), rows = 5, ps = new PS(rows * 2, frame);
    const rootP = Hp.clone().addScaledVector(dir, -0.065).add(new V3(0, -0.01, -0.036));
    for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) {
      const i = r * 2 + c; ps.setL(i, rootP.x + dir.x * (c ? 0.013 : -0.013), rootP.y - 0.023 * r + dir.y * (c ? 0.013 : -0.013), rootP.z - 0.002 * r);
      if (r === 0) ps.inv[i] = 0; else ps.sm[i] = 0.01;
    }
    for (let r = 0; r < rows; r++) {
      ps.link(2 * r, 2 * r + 1, 1);
      if (r < rows - 1) { ps.link(2 * r, 2 * r + 2, 1); ps.link(2 * r + 1, 2 * r + 3, 1); ps.link(2 * r, 2 * r + 3, 0.6); ps.link(2 * r + 1, 2 * r + 2, 0.6); }
      if (r < rows - 2) { ps.link(2 * r, 2 * r + 4, 0.3); ps.link(2 * r + 1, 2 * r + 5, 0.3); }
    }
    ps.build(); ps.damp = 0.94; ps.iters = 3; ps.thick = 0.004;
    const cap = capC(0.04), sph = sphC(0.05); ps.cols = [cap, sph];
    const geo = new THREE.BufferGeometry(), idx = []; for (let r = 0; r < rows - 1; r++) idx.push(2 * r, 2 * r + 2, 2 * r + 1, 2 * r + 1, 2 * r + 2, 2 * r + 3);
    geo.setAttribute('position', new THREE.BufferAttribute(ps.p, 3).setUsage(THREE.DynamicDrawUsage)); geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, T.tailMat); mesh.frustumCulled = false; mesh.castShadow = true; scene.add(mesh);
    return { ps, frame, restInv, hand, fore, cap, sph, geo, mesh, mid: B[`CC_Base_${side}_Mid1`] };
  }
  updateColliders() {
    for (const a of this.ATT) a.w.copy(a.local).applyMatrix4(a.b.matrixWorld);
    const C = this.COL;
    setCap(C.thighL, this.bpos('CC_Base_L_Thigh', _ca), this.bpos('CC_Base_L_Calf', _cb));
    setCap(C.thighR, this.bpos('CC_Base_R_Thigh', _ca), this.bpos('CC_Base_R_Calf', _cb));
    setCap(C.hipBar, this.bpos('CC_Base_L_Thigh', _ca), this.bpos('CC_Base_R_Thigh', _cb));
    setCap(C.neck, this.bpos('CC_Base_NeckTwist01', _ca), this.bpos('CC_Base_Head', _cb));
    C.chest.x = this.chestPt.w.x; C.chest.y = this.chestPt.w.y; C.chest.z = this.chestPt.w.z;
    setCap(C.chestFront, this.cfA.w, this.cfB.w);
    this.headFrame.multiplyMatrices(this.head.matrixWorld, HEAD.restInvT); this.headFrameInv.copy(this.headFrame).invert();
    for (const t of this.tails) {
      t.frame.multiplyMatrices(t.hand.matrixWorld, t.restInv);
      setCap(t.cap, _ca.setFromMatrixPosition(t.fore.matrixWorld), _cb.setFromMatrixPosition(t.hand.matrixWorld));
      _ca.setFromMatrixPosition(t.mid.matrixWorld).add(_cb).multiplyScalar(0.5); t.sph.x = _ca.x; t.sph.y = _ca.y; t.sph.z = _ca.z;
    }
  }
  applyLook(L) {
    const bald = L.hair === 'bald'; this.bald = bald;
    this.hairCol.set((HAIR_LOOKS.find(x => x.id === L.hair) || HAIR_LOOKS[1]).c);
    this.hair.mesh.visible = this.baseMesh.visible = !bald;   // (handGear, called from dress below, tucks long hair under the headgear)
    this.hair.mesh.material.color.copy(this.hairCol); this.baseMesh.material.color.copy(this.hairCol); this.beardMesh.material.color.copy(this.hairCol).multiplyScalar(1.2);
    this.u.uHair.value.copy(this.hairCol).multiplyScalar(0.8); this.u.uHairAmt.value = bald ? 0.2 : 1;
    this.beardMesh.visible = !!L.beard; this.u.uStubAmt.value = L.beard ? 1 : 0.3;
    const sk = (SKIN_LOOKS.find(x => x.id === L.skin) || SKIN_LOOKS[0]).c; for (const m of this.skinMats) m.color.set(sk);
    if (this.wmat) this.wmat.color.set((WRAPS_LOOKS.find(x => x.id === L.wraps) || WRAPS_LOOKS[0]).c);
    this.dress(L);
  }
  dress(L) {
    const G2 = this.gear, U = this.flesh.u.uGear.value, W = wearDress(this, L), bt = W.bottom, tp = W.top, sh = W.shoes;   // 04e_wardrobe.js: the meshes of what he wears (model + colour from the registry)
    // loose trousers / long shorts are their own mesh (04d_street.js) and cover the hips completely: the boxing trunks (cloth) are hidden under them
    G2.pants = bt.cut ? G2.shells.bottom.m : null; G2.top = tp.cut ? G2.shells.top.m : null; this.shorts.mesh.visible = !bt.cut;
    if (!bt.cut) { const S0 = wearShorts(bt); paintShorts(this.shortsCanvas, S0); if (this.isPlayer) socPatch(this.shortsCanvas); this.shortsTex.needsUpdate = true; this.shortsMat.sheenColor.set(S0.sheen); }
    U.set(bt.cut ? PANT_CUTS[bt.cut].skin : 0, sh.top || 0,   /* x: the legs' skin is not drawn above this height (cm) */ G2.top ? G2.top.userData.D.skinHi : tp.tex ? GEAR.neck - 1 : 0, G2.top ? G2.top.userData.D.skinA : tp.sleeve || 0);   // z: the trunk's skin is not drawn below this height, w: the arm's up to this `a` (04f_tops.js)
    this.flesh.u.uGearT.value = G2.top ? G2.top.userData.D.skinLo : 0;
    this.shortsU.uTopV.value = G2.top ? (G2.top.userData.D.skinLo / 100 - SHORTS.hemY) / (SHORTS.waistY - SHORTS.hemY) : 9;
    G2.guard.material.color.set((GUARDS.find(x => x.id === L.guard) || GUARDS[0]).c);
    { const c = (GUARDS.find(x => x.id === L.guard) || GUARDS[0]).c; G2.guard.material.emissive.set(c); }
    G2.look = L; this.handGear();
  }
  sparGear(on) { this.gear.spar = on; this.handGear(); }   // sparring: 16 oz gloves and headgear, always
  // what is on the hands and head: sparring → boxing gloves + headgear; otherwise wraps or 4 oz MMA gloves (look.hands)
  handGear() {
    const G2 = this.gear, L = G2.look || {}, box = G2.spar, mma = !box && L.hands === 'mma', mine = LOOK.gloves || 'red';
    const gc = GLOVES.find(x => x.id === (this.isPlayer ? mine : L.gloves || (mine === 'blue' ? 'red' : 'blue'))) || GLOVES[0];   // the opponent never wears the player's colour
    if ((box || mma) && !G2.mat) { G2.mat = leatherMat(gc.c); G2.trim = new THREE.MeshPhysicalMaterial({ color: gc.trim, roughness: 0.6 }); }
    if (box && !G2.gloves) { G2.gloves = ['L', 'R'].map(S => gloveMesh(this, S, G2.mat, G2.trim)); G2.hg = headgearMesh(this, G2.mat, G2.trim); }
    if (mma && !G2.mma) { G2.mma = mmaShell(this, G2.mat); G2.mmaPads = mmaPads(this, G2.mat); }
    if (G2.mat) { G2.mat.color.set(gc.c); G2.trim.color.set(gc.trim); }
    if (G2.gloves) { for (const gl of G2.gloves) gl.g.visible = box; G2.hg.visible = box; }
    if (G2.mma) { G2.mma.visible = mma; G2.mma.material.color.set(gc.c); for (const pd of G2.mmaPads) pd.m.visible = mma; }
    this.flesh.u.uGlv.value = box ? 1 : mma ? 2 : 0;   // the hand inside a boxing glove / the skin under an MMA glove is not drawn
    this.wrapMesh.visible = !box && !mma; for (const t of this.tails) t.mesh.visible = !box && !mma;
    this.hair.mesh.visible = !this.bald && !box && !wearTuck(this); this.baseMesh.visible = !this.bald;   // long hair is tucked under the headgear, the short layer shows through the open crown
  }

  /* —— actions —— */
  canAct() { return !this.ko && !this.doomed && !(this.wind > G.t) && G.t >= this.stunUntil && !this.cur && (!this.dodge || this.dodge.t > 0.46); }
  // a combo: the next punch may start as soon as the current one has landed (switching hands is quicker)
  canChain(next) { if (!this.cur || this.ko || G.t < this.stunUntil || !this.resolved) return false; const P = PUNCH[this.cur]; return this.act[this.cur].time >= P.impact + (next && PUNCH[next] && PUNCH[next].arm === P.arm ? 0.14 : 0.04); }
  /* range: a few tens of centimetres of in-and-out on the line between the two (no walking cycle — the idle bounce carries it):
     you step in behind your punches, big shots knock you back, a pressure fighter keeps walking forward, a counter-puncher drifts off */
  footwork(dt) {
    if (!this.mark) this.mark = this.group.position.clone();
    if (this.slide || dt <= 0 || this.rag.on || this.ko || this.gu) return;
    if (BAG.on && this === P2) return;   // the bag hangs where it hangs
    const o = this.other, fight = G.state === 'fight' || (this === P1 && followOK(this) && this.moveDir), fwd = Math.sign(o.mark ? o.mark.x - this.mark.x : -this.mark.x) || 1;
    if (G.state === 'intro' && G.stareT && G.introT >= 0) {   // the stare-down (09b_cine.js): both walk in face to face, then back to their marks
      this.hold = null; this.advV = 0; this.adv += (G.stare * STARE_ADV - this.adv) * Math.min(1, dt * 7);
      this.group.position.x = this.mark.x + fwd * this.adv; this.group.updateMatrixWorld(true); return;
    }
    const dist = Math.abs(o.group.position.x - this.group.position.x), tiredK = 0.65 + 0.35 * clamp(this.stamina / 40, 0, 1);
    let a = this.adv || 0;
    if (this === P1 && fight && (this.moveDir || 0) !== 0 && !this.blocking) {
      // the player walks: ~1.5 m/s in and out (a step takes you out of his reach), slower punching or tired
      const v = this.moveDir * 1.5 * tiredK * (this.cur ? 0.45 : 1);
      this.advV += (v - this.advV) * Math.min(1, dt * 12); this.hold = null;
    } else {
      let tgt;
      if (!fight) tgt = 0;
      else if (this === P2) {   // he keeps his range: closes if you back off (a little slower than you can retreat), steps off if crowded
        const want = 1.13 - AI.style.adv - (this.cur && !this.release ? 0.08 : 0) + (this.daze > 0.5 ? 0.12 * this.daze : 0) + (AI.backT > G.t ? 0.45 : 0);
        tgt = a + (dist - want);
      } else { if (this.hold == null) this.hold = a; tgt = this.hold + (this.cur && !this.release ? 0.09 : 0); }
      if (G.state === 'kd' && G.kd && G.kd.att === this) tgt = a + (dist - 1.6);   // the referee sends him away while the other man is counted
      if (followOK(this)) tgt = a + Math.max(0, Math.abs(o.headNow.x - this.group.position.x) - 0.62);   // he goes after the falling man
      if (fight && this.daze > 0.5 && this === P1) tgt -= 0.1 * this.daze;
      const vmax = (this === P2 ? 1.15 : 1.5) * tiredK;
      this.advV += (clamp((tgt - a) * 6, -vmax, vmax) - this.advV) * Math.min(1, dt * 8);
    }
    if (this.knock) { this.advV -= this.knock * 0.9; this.knock = 0; }
    a += this.advV * dt;
    const sum = a + (o.adv || 0); if (sum > 0.1 && !(o.rag.on && o.rag.mode === 'ko')) { a -= sum - 0.1; this.advV = Math.min(this.advV, 0); }   // can't walk through him
    // bodies never share space: torso, head, knees and elbows of both men as spheres (from the posed skeleton, so the lunge
    // of a punch animation counts); the overlap along the fight line is taken out — half each, all of it if he can't move
    if (!(window.__tw || {}).noSep && !o.ko && !o.gu && o.jp[15].y > 1.2) { const pen = BAG.on ? bagBodyPen(this, fwd) : bodyOverlap(this, o, fwd); if (pen > 0) { const share = o.rag.on || o.slide ? 1 : 0.5; a -= Math.min(0.08, pen * share); this.advV = Math.min(this.advV, 0); } }
    const x = this.mark.x + fwd * a;
    if (!inRing(_v5.set(x, 0, this.group.position.z)) && a < (this.adv || 0)) { a = this.adv || 0; this.advV = 0; }   // backed onto the ropes
    this.adv = clamp(a, -2.4, 1.2);
    this.group.position.x = this.mark.x + fwd * this.adv; this.group.updateMatrixWorld(true);
    // sideways: circling around the other man (the ring frame turns about him)
    let lat = 0;
    if (fight && this === P1 && !this.blocking) lat = (this.moveLat || 0) * 1.15 * tiredK * (this.cur ? 0.4 : 1);
    if (fight && this === P2) lat = (AI.lat || 0) * tiredK;
    this.latV = (this.latV || 0) + (lat - (this.latV || 0)) * Math.min(1, dt * 10);
    if (Math.abs(this.latV) > 0.01 && !circleStep(this, this.latV * dt)) this.latV *= 0.5;
  }
  cancelPunch() { if (!this.cur) return; this.release = true; this.relN = this.cur; this.resolved = true; this.whiff = true; this.cur = null; this.aimW = 0; }
  startPunch(n) {
    this.dmgMul = 1;
    if (this.wA.get(this.act[n]) > 0.01) this.act[n] = this.inst[n][this.act[n] === this.inst[n][0] ? 1 : 0];   // same punch still on: use the other copy
    const P = PUNCH[n], a = this.act[n]; this.tired = this.stamina < P.sta; this.release = false; this.relN = null;
    // power shot: sits down on it — slower, heavier, costs more breath; and the arms get heavy as the tank empties: the more
    // you throw on empty, the slower and softer every punch gets
    this.heavy = !!this.powerNext; this.powerNext = false;
    this.fatK = 0.42 + 0.58 * sstep(0, 55, this.stamina); this.punchK = (0.45 + 0.55 * sstep(0, 45, this.stamina)) * (this.heavy ? 1.45 : 1);
    a.reset(); a.time = P.start; a.setEffectiveTimeScale(this.speed * this.fatK * (this.heavy ? 0.84 : 1) * (P.slow || 1) * (1 - 0.3 * this.daze) * (this.sig && sigOf(n) === this.sig ? 1.08 : 1)); a.play();
    if (this.fs) this.fs.thr++;
    // out of gas: the fist travels wide and lands roughly where it was meant to
    const ex = this.tired ? 1 : clamp((25 - this.stamina) / 25, 0, 1) * 0.5;
    this.aimJit = (this.aimJit || new V3()).set((rr() - 0.5) * 0.14, (rr() - 0.5) * 0.12, (rr() - 0.5) * 0.1).multiplyScalar(ex); this.wide = ex;
    this.cur = n; this.release = false; this.resolved = false; this.whiff = false; this.punchId++; this.dodge = null; this.aimArm = P.arm;
    this.bodyShot = (P.type === 'straight' || P.type === 'hook') && this.wantBody; this.wantBody = false;
    if (this.bodyShot) { const kn = this.knuckle(_v1), o = this.other.ribs; this.ribIdx = o[0].w.distanceTo(kn) < o[1].w.distanceTo(kn) ? 0 : 1; }
    this.stamina = Math.max(0, this.stamina - P.sta * (1 - 0.05 * SK(this, 'sta')) * (this.heavy ? 1.7 : 1)); this.staT = G.t + 0.55 + (this.stamina < 10 ? 0.35 : 0);
  }
  startDodge(type) { this.dodge = { type, t: 0 }; this.stamina = Math.max(0, this.stamina - 4); this.staT = G.t + 0.3; }
  knuckle(v) { return v.setFromMatrixPosition(this.bones[`CC_Base_${this.aimArm}_Mid1`].matrixWorld); }
  takeHit(dirWorld, power, name, contact, body, blocked) {
    const g = this.group, hp = contact;
    this.face.hit(body ? power * 0.4 : power, !body && (PUNCH[name].type === 'hook' || PUNCH[name].type === 'upper'), hp);
    const dm = _v1.copy(hp).add(dirWorld); g.worldToLocal(dm); dm.sub(g.worldToLocal(_v2.copy(hp)));
    // the upper body takes the real impulse at the contact point (muscles let go there and pull back)
    const cm = g.worldToLocal(contact.clone()), speed = (body ? 0.8 : 1.1) + 1.6 * Math.min(power, 1.3);
    if (blocked && !body) {   // into the guard: the forearm takes it and is driven back into the face; the head still rocks behind it
      const dl = contact.distanceTo(_v3.setFromMatrixPosition(this.bones.CC_Base_L_Hand.matrixWorld)), dr = contact.distanceTo(_v3.setFromMatrixPosition(this.bones.CC_Base_R_Hand.matrixWorld));
      this.rag.blockArm = dl < dr ? 'farmL' : 'farmR';
      this.rag.hit(dm.clone().normalize().multiplyScalar(2.2 + 2.4 * Math.min(power / 0.35, 1.3)), cm, 'block', power / 0.35);
    } else
    this.rag.hit(dm.clone().normalize().multiplyScalar(speed), cm, body ? 'body' : 'head', power);
    const k = (0.55 + power) * 0.45, s = this.sp, kt = 0.25;
    if (body) { s.sp.v += 1.0 * (0.6 + power); s.hz.v -= 0.15; }
    s.hp.v += (dm.z * 6.0 - dm.y * 5.0) * k; s.hr.v -= dm.x * 6.5 * k; s.hy.v += dm.x * 7.5 * k;
    s.sp.v += (dm.z * 2.4 - dm.y * 1.2) * k * kt; s.sr.v -= dm.x * 2.2 * k * kt; s.hz.v += dm.z * 1.5 * k * kt;
    if (this.cur && !this.resolved) this.cur = null;
    this.stunUntil = G.t + (name === 'jab' ? 0.14 : 0.27) * (1 + this.daze);
  }

  /* —— per-frame —— */
  animate(dt) {
    let sum = 0;
    for (const n of PN) { let wn = 0; for (const a of this.inst[n]) { let w = this.wA.get(a); const tgt = this.cur === n && this.act[n] === a && !(this.release && this.relN === n) ? 1 : 0;
      w = tgt > w ? Math.min(tgt, w + dt / 0.08) : Math.max(tgt, w - dt / 0.24); this.wA.set(a, w); sum += w; wn += w; } this.w[n] = wn; }
    const k = sum > 1 ? 1 / sum : 1; this.rootZ = 1;
    for (const n of PN) for (const a of this.inst[n]) { const w = this.wA.get(a) * k; a.setEffectiveWeight(w); if (w <= 0 && !(this.cur === n && this.act[n] === a) && a.isRunning()) a.stop(); this.rootZ += w * (PUNCH[n].rootZ - 1); }
    this.act.idle.setEffectiveWeight(Math.max(0.0001, 1 - Math.min(1, sum)));
    this.mixer.update(dt);
  }
  retarget() {
    this.src.updateMatrixWorld(true);
    for (const p of this.pairs) { p.S.getWorldQuaternion(p.tw); p.tw.multiply(p.qsRestInv).multiply(p.R0).multiply(p.qcRest); }
    this.walk(this.boneRoot, this.rootQ0);
    this.hipModel.setFromMatrixPosition(this.srcHip.matrixWorld).multiplyScalar(this.hipRatio); this.hipModel.z = Math.min(this.hipModel.z * this.rootZ, 0.36);
    this.setHip(this.hipModel);
  }
  walk(bone, parentQ, depth = 0) {   // one scratch quaternion per tree depth (siblings are walked one after another)
    const p = this.pairBy.get(bone), wq = _walkQ[depth] || (_walkQ[depth] = new Quat());
    if (p) { wq.copy(p.tw); bone.quaternion.copy(parentQ).invert().multiply(wq); } else wq.copy(parentQ).multiply(bone.quaternion);
    const ch = bone.children; for (let i = 0; i < ch.length; i++) if (ch[i].isBone) this.walk(ch[i], wq, depth + 1);
  }
  /* arm / leg bones by side, looked up once (the per-frame code used to build the bone names every time) */
  limbs() {
    if (this.limbB) return this.limbB; const B = this.bones, o = {};
    for (const S of ['L', 'R']) o[S] = { thigh: B[`CC_Base_${S}_Thigh`], calf: B[`CC_Base_${S}_Calf`], foot: B[`CC_Base_${S}_Foot`], upper: B[`CC_Base_${S}_Upperarm`], fore: B[`CC_Base_${S}_Forearm`], hand: B[`CC_Base_${S}_Hand`], mid1: B[`CC_Base_${S}_Mid1`] };
    return this.limbB = o;
  }
  rot(bone, pitch, yaw, roll) { _qb.setFromEuler(_e1.set(pitch, yaw, roll, 'YXZ')); this.mquat(bone, _qa); this.setMQuat(bone, _qb.multiply(_qa)); }
  ik(A, Bn, Cn, t) {   // two-bone IK in model space
    const a = this.mpos(A, _v1), b = this.mpos(Bn, _v2), c = this.mpos(Cn, _v3);
    const lab = a.distanceTo(b), lcb = b.distanceTo(c), lat = clamp(a.distanceTo(t), 0.05, lab + lcb - 0.004);
    const ac = _v4.subVectors(c, a).normalize(), ab = _v5.subVectors(b, a).normalize(), at = _v6.subVectors(t, a).normalize();
    const ac_ab_0 = acosc(ac.dot(ab)), ba_bc_0 = acosc(_j1.subVectors(a, b).normalize().dot(_j2.subVectors(c, b).normalize())), ac_at_0 = acosc(ac.dot(at));
    const ac_ab_1 = acosc((lcb * lcb - lab * lab - lat * lat) / (-2 * lab * lat)), ba_bc_1 = acosc((lat * lat - lab * lab - lcb * lcb) / (-2 * lab * lcb));
    const ax0 = _j1.crossVectors(ac, ab); if (ax0.lengthSq() < 1e-8) ax0.set(1, 0, 0); ax0.normalize();
    const r0 = _qb.setFromAxisAngle(ax0, ac_ab_1 - ac_ab_0), r1 = _qc.setFromAxisAngle(ax0, ba_bc_1 - ba_bc_0);
    const ax1 = _j2.crossVectors(ac, at), r2 = _ik1.identity(); if (ax1.lengthSq() > 1e-10) r2.setFromAxisAngle(ax1.normalize(), ac_at_0);
    const Ag = this.mquat(A, _ik2), Bg = this.mquat(Bn, _ik3);
    const base = r2.multiply(r0);            // bend in the limb's own plane, then swing the whole limb onto the target
    this.setMQuat(A, Ag.premultiply(base));
    this.setMQuat(Bn, Bg.premultiply(r1).premultiply(base));
  }
  tick(dt) {
    if (G.t > this.staT) this.stamina = Math.min(100, this.stamina + 26 * dt * (1 + 0.08 * SK(this, 'sta')));
    if (this.cur) {
      const P = PUNCH[this.cur], t = this.act[this.cur].time; this.aImpactIn = (P.impact - t) / Math.max(0.3, this.speed);
      // the punch lands when the knuckles actually touch the face (or ribs); if they never do, it is decided at the end of the window
      if (!this.resolved && t >= P.impact - 0.14) { const c = contactTest(this, this.other); if (c || t >= P.impact + 0.06) { this.resolved = true;
        // no touch by the end of the swing: a graze if the knuckles were within a few cm, otherwise it is thin air
        if (c || (BAG.on ? bagMiss(this) < 0.14 : this.other.ko || nearMiss(this, this.other) < (PUNCH[this.cur].type === 'upper' ? 0.1 : 0.06))) resolveHit(this, this.cur, c); else whiffPunch(this); } }
      if (this.cur) { if (!this.release && t >= P.impact + (this.whiff ? 0.3 : 0.15)) { this.release = true; this.relN = this.cur; } if (this.release && this.relN === this.cur && t >= P.impact + (this.whiff ? 0.52 : 0.25)) this.cur = null; }
    }
    if (this.daze > 0) { this.daze = Math.max(this.hp < 25 ? 0.5 : 0, this.daze - dt * 0.1);
    }
    let aim = 0; if (this.cur) { const P = PUNCH[this.cur], t = this.act[this.cur].time; if (t > P.impact - 0.16 && t < P.impact + 0.06) aim = 1; }
    this.aimW += (aim - this.aimW) * Math.min(1, dt * (aim ? 22 : 12));
  }
  pose(dt) {
    let duck = 0, lean = 0, slip = 0;
    if (this.dodge) { const d = this.dodge; d.t += dt; const a = sstep(0, 0.09, d.t) * (1 - sstep(0.36, 0.6, d.t)); if (d.type === 'duck') duck = a; else if (d.type === 'lean') lean = a; else slip = a * (d.type === 'slipL' ? 1 : -1); if (d.t > 0.6) this.dodge = null; }
    const shell = this.shellT > G.t; this.blockW += (((this.blocking || shell) && !this.cur ? 1 : 0) - this.blockW) * Math.min(1, dt * 16);
    // "his legs went": rubber legs — the knees dip and give, the hips swim sideways (cerebellar ataxia after a hard shot)
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt);
    const wb = sstep(0, 0.6, this.wobble), dip = wb * (0.55 + 0.45 * Math.sin(G.t * 6.3 + this.ph)) * (0.7 + 0.3 * Math.sin(G.t * 2.9));
    const dz = Math.max(this.daze, wb), tt = G.t, sw = dz * Math.sin(tt * 1.9 + this.ph) + 1.8 * wb * Math.sin(tt * 2.6 + this.ph), sw2 = dz * Math.sin(tt * 1.3 + this.ph * 2);
    duck = Math.max(duck, 0.42 * dip, this.wind > G.t ? 0.55 : 0, this.liver ? 0.4 : 0, shell ? 0.32 : 0);   // covering up: chin down, elbows in, hunched behind the gloves
    const s = this.sp; let live = duck + lean + Math.abs(slip) + this.blockW + dz;
    for (const k in s) { const q = s[k]; if (dt > 0) { const n = dt > 0.02 ? 2 : 1; for (let i = 0; i < n; i++) q.step(dt / n); } live += Math.abs(q.x) + Math.abs(q.v) * 0.01; }
    const B = this.bones;
    if (live > 1e-4) {
      const fL = B.CC_Base_L_Foot, fR = B.CC_Base_R_Foot;
      const tL = this.mpos(fL, _po1), tR = this.mpos(fR, _po2), qL = this.mquat(fL, _poq1), qR = this.mquat(fR, _poq2);
      this.setHip(_v1.copy(this.hipModel).add(_v2.set(0.09 * slip + 0.03 * sw, -0.26 * duck - 0.04 * lean - 0.05 * Math.abs(slip) - 0.06 * this.blockW - 0.07 * dz + 0.015 * sw2, -0.11 * duck - 0.13 * lean + clamp(s.hz.x, -0.12, 0.12))));
      this.rot(B.CC_Base_Waist, 0.22 * duck - 0.20 * lean + 0.06 * this.blockW + 0.4 * s.sp.x + 0.07 * sw2, 0, 0.4 * s.sr.x - 0.2 * slip - 0.12 * sw);
      this.rot(B.CC_Base_Spine01, 0.16 * duck - 0.18 * lean + 0.08 * this.blockW, 0, -0.14 * slip);
      this.rot(B.CC_Base_Spine02, 0.10 * duck - 0.14 * lean + 0.6 * s.sp.x, 0, 0.6 * s.sr.x - 0.1 * slip - 0.06 * sw);
      this.rot(B.CC_Base_NeckTwist01, -0.25 * duck + 0.2 * lean + 0.45 * s.hp.x, 0.4 * s.hy.x, 0.45 * s.hr.x);
      // shaking it off: a hard one landed, half a second later the head shakes (5–6 Hz, three swings) — "I'm fine"
      const sk = G.t - (this.shakeT ?? -9), shake = sk > 0.35 && sk < 1.0 ? 0.16 * Math.sin((sk - 0.35) * 34) * (1 - (sk - 0.35) / 0.65) : 0;
      this.rot(this.head, s.hp.x + 0.12 * dz, s.hy.x + shake, s.hr.x + 0.15 * sw);
      this.cc.updateMatrixWorld(true);
      this.ik(B.CC_Base_L_Thigh, B.CC_Base_L_Calf, fL, tL); this.setMQuat(fL, qL);
      this.ik(B.CC_Base_R_Thigh, B.CC_Base_R_Calf, fR, tR); this.setMQuat(fR, qR);
    }
    // guard: block pulls both fists to the face; a dazed fighter's hands sag
    const tiredSag = clamp((35 - this.stamina) / 35, 0, 1) * (this.cur ? 0 : 1);
    const stareDown = G.state === 'intro' ? G.stare || 0 : 0;   // the stare-down: the hands drop from the face (09b_cine.js)
    if (this.blockW > 0.02 || dz > 0.02 || tiredSag > 0.02 || stareDown > 0.02) for (const S of ['L', 'R']) {
      if (this.aimW > 0.05 && this.aimArm === S) continue;
      const H = B[`CC_Base_${S}_Hand`], hand = this.mpos(H, _po3), hc = this.group.worldToLocal(_v3.copy(this.headNeutral));
      const g = _v4.set(S === 'L' ? 0.065 : -0.065, -0.075, 0.135).add(hc);
      hand.lerp(g, this.blockW).add(_v5.set(0, (-0.2 * dz - 0.11 * tiredSag - 0.34 * stareDown) * (1 - this.blockW), 0.03 * dz - 0.03 * tiredSag - 0.06 * stareDown));   // dazed or out of breath: the hands come down
      this.ik(B[`CC_Base_${S}_Upperarm`], B[`CC_Base_${S}_Forearm`], H, hand);
    }
    if (this.aimW > 0.02 && this.aimTarget) {
      const S = this.aimArm, H = B[`CC_Base_${S}_Hand`], hand = this.mpos(H, _po3), kn = this.mpos(B[`CC_Base_${S}_Mid1`], _po4);
      const d = this.group.worldToLocal(_v1.copy(this.aimTarget)).sub(kn).clampLength(0, this.bodyShot ? 0.5 : PUNCH[this.cur] && PUNCH[this.cur].type === 'upper' ? 0.62 : 0.42).multiplyScalar(this.aimW);
      this.ik(B[`CC_Base_${S}_Upperarm`], B[`CC_Base_${S}_Forearm`], H, hand.add(d));
    }
    this.cc.updateMatrixWorld(true);
    // a gesture: the glove goes to the face — wiping the blood from the nose, pushing it out of the eye from a cut on the brow
    if (this.gest && !this.cur) {
      const g = this.gest; g.t += dt; const u = g.t / g.T; if (u >= 1) this.gest = null; else {
        const wgt = Math.pow(Math.sin(Math.PI * u), 0.6), S = g.S, H = B[`CC_Base_${S}_Hand`], hand = this.mpos(H, _po3);
        const p = _v1.copy(g.pt).add(_v2.set((S === 'L' ? 1 : -1) * 0.035 * Math.sin(u * Math.PI * 4), 0, 0)).applyMatrix4(this.headFrame);
        const fw = _v2.set(0, 0, 1).transformDirection(this.headFrame); p.addScaledVector(fw, 0.07).add(_v3.set(0, -0.05, 0));
        this.ik(B[`CC_Base_${S}_Upperarm`], B[`CC_Base_${S}_Forearm`], H, hand.lerp(this.group.worldToLocal(p), wgt));
        this.cc.updateMatrixWorld(true);
      }
    } else if (this.cur) this.gest = null;
    this.plantFeet(dt);
  }
  /* feet stay on the canvas while the body travels: the drawn foot lags the moving body until it is ~9 cm behind, then steps
     (lift ~6 cm, 0.18 s) to catch up — one foot at a time, so walking in and out is a boxer's shuffle, not a skate */
  plantFeet(dt) {
    const B = this.bones;
    if ((window.__tw || {}).noPlant || !this.ftOff || this.rag.on || this.gu || this.ko || this.slide || dt <= 0 || G.state === 'menu' || G.state === 'replay' || (BAG.on && this === P2)) { const F0 = this.ftOff; if (F0) F0.L = F0.R = F0.sL = F0.sR = null; else this.ftOff = { L: null, R: null, sL: null, sR: null }; return; }
    const F = this.ftOff, step = 0.18, reach = this === P1 && (this.moveDir || this.moveLat) ? 0.07 : 0.09, LB = this.limbs();
    for (let i = 0; i < 2; i++) {   // scratch vectors only: this runs for four feet every frame (a step itself still allocates its start point)
      const S = i ? 'R' : 'L', sK = i ? 'sR' : 'sL', L = LB[S], foot = L.foot, w = this.mpos(foot, _pf1); this.group.localToWorld(w);
      const natural = ringPt(w, _pf2);   // where the animation puts the foot, in the ring frame
      if (!F[S]) { F[S] = natural.clone(); continue; }
      const st = F[sK];
      let tgt = F[S], lift = 0;
      if (st) {   // stepping: the foot travels from where it stood to where the body wants it, lifting off the canvas on the way
        st.t += dt / step; const k = sstep(0, 1, Math.min(1, st.t)); tgt = _pf3.copy(st.from).lerp(natural, k); lift = 0.055 * Math.sin(Math.PI * Math.min(1, st.t));
        if (st.t >= 1) { F[S].copy(natural); F[sK] = null; }
      } else if (Math.hypot(natural.x - F[S].x, natural.z - F[S].z) > reach && !F[i ? 'sL' : 'sR']) { F[sK] = { t: 0, from: F[S].clone() }; }
      const pinned = _v4.copy(tgt); pinned.y = natural.y + lift; pinned.applyMatrix4(ARENA.matrixWorld);
      if (pinned.distanceToSquared(w) < 1e-6) continue;
      const q = this.mquat(foot, _pfq), t = this.group.worldToLocal(_pf4.copy(pinned));   // not a shared _v*: ik() uses those itself
      this.ik(L.thigh, L.calf, foot, t); this.setMQuat(foot, q);
    }
    this.cc.updateMatrixWorld(true);
  }
  /* fists and forearms never go through the other man: his head (the same ellipsoid the hits are tested against) and torso
     spheres push the hand out to the skin; the punching fist may sink a centimetre or two (that is the impact), no deeper */
  armClear() {
    const o = this.other; if (!o || !o.headFrameInv || o.ko || (o.rag.on && o.rag.mode === 'ko') || this.rag.on || G.state === 'menu' || (window.__tw || {}).noClear) return;
    const LB = this.limbs();
    for (let i = 0; i < 2; i++) {
      const S = i ? 'R' : 'L', L = LB[S], H = L.hand, kn = _v1.setFromMatrixPosition(L.mid1.matrixWorld), el = _v2.setFromMatrixPosition(L.fore.matrixWorld), hw = _v3.setFromMatrixPosition(H.matrixWorld);
      const punching = this.cur && this.aimArm === S, push = _v4.set(0, 0, 0);
      clearPt(o, kn, 0.035, punching ? 0.86 : 1, push, punching && !o.blocking);   // a punch that gets through the guard is not stopped by his forearms
      clearPt(o, _v5.lerpVectors(el, hw, 0.45), 0.045, 1, push); clearPt(o, _v5.lerpVectors(el, hw, 0.75), 0.045, 1, push);
      if (push.lengthSq() < 1e-6) continue;
      if (window.__acN) window.__acN.push(+push.length().toFixed(3));
      const t = this.group.worldToLocal(_pf4.copy(hw).add(push)); this.ik(L.upper, L.fore, H, t);
      this.cc.updateMatrixWorld(true);
    }
  }
  spreadTwist() {
    for (const T of this.twist) {
      const q = T.h.quaternion, d = q.x * T.ax.x + q.y * T.ax.y + q.z * T.ax.z;   // swing–twist: roll of the hand about the forearm axis
      let ang = 2 * Math.atan2(d, q.w); if (ang > Math.PI) ang -= 2 * Math.PI; if (ang < -Math.PI) ang += 2 * Math.PI;
      for (const t of T.bones) t.b.quaternion.copy(t.q0).multiply(_qb.setFromAxisAngle(t.axL, ang * t.f));
    }
    for (const S of this.shoulder) {   // humerus roll since bind, about its own axis: half of it is taken back at the shoulder, a quarter at mid-arm
      const q = _qa.copy(S.ua0).invert().multiply(S.ua.quaternion), d = q.x * S.ax.x + q.y * S.ax.y + q.z * S.ax.z;
      let ang = 2 * Math.atan2(d, q.w); if (ang > Math.PI) ang -= 2 * Math.PI; if (ang < -Math.PI) ang += 2 * Math.PI;
      for (const t of S.tw) t.b.quaternion.copy(t.q0).multiply(_qb.setFromAxisAngle(t.axL, ang * t.f));
    }
  }
  /* scapulohumeral rhythm (ragdoll only): past ~30° of elevation the shoulder girdle takes about a third of the movement,
     so a raised arm lifts and rotates the shoulder instead of tearing the deltoid out of the chest */
  scapula() {
    if (this.noScap) return;
    const D = this.mquat(this.bones.CC_Base_Spine02, _qc).multiply(_qp.copy(this.chestBind).invert()), Di = _j3q.copy(D).invert();
    for (const S of this.shoulder) {
      if (!S.clBase) continue;
      S.cl.quaternion.copy(S.clBase); S.cl.updateMatrixWorld(true);
      const u = this.mpos(S.fa, _v2).sub(this.mpos(S.ua, _v1)).normalize().applyQuaternion(Di);   // humerus direction in the chest's bind frame
      const elev = Math.acos(clamp(-u.y, -1, 1)), a = clamp((elev - 0.52) / 3, 0, 0.4);
      if (a <= 0.002) continue;
      const w = _v3.set(u.x, u.y + 1, u.z).normalize(), ax = _v4.crossVectors(S.clDir, w); if (ax.lengthSq() < 1e-6) continue; ax.normalize();
      const Qu = this.mquat(S.ua, _j4q), qm = _qb.setFromAxisAngle(ax, a).premultiply(D).multiply(Di);
      this.setMQuat(S.cl, this.mquat(S.cl, _qa).premultiply(qm)); S.cl.updateMatrixWorld(true);
      this.setMQuat(S.ua, Qu);
    }
  }
  joints(out) {
    for (let i = 0; i < 15; i++) out[i].setFromMatrixPosition(this.rb[i].matrixWorld);
    out[15].setFromMatrixPosition(_m1.multiplyMatrices(this.head.matrixWorld, HEAD.restInvT));
    out[16].copy(this.frontAtt.local).applyMatrix4(this.frontAtt.b.matrixWorld);
  }
  afterPose(dt) { if (this.cur) { if (!this.kPrev) { this.kPrev = new V3(); this.kOld = new V3(); } this.kOld.copy(this.kPrev); this.kPrev.copy(this.knuckle(_v4)); } const t = this.jo; this.jo = this.jp; this.jp = t; this.joints(this.jp); if (dt > 0) this.jdt = dt; this.headNow.copy(this.jp[15]); }
  update(dt) {
    if (this.frozen) return;
    if (this.gu) { this.getUpStep(dt); this.afterPose(dt); return; }
    // between exchanges a fighter recovers part of what he took (breath, legs, head clears) — but the damage that stays (swelling,
    // cuts, the brain's accumulated shake) lowers the ceiling he can come back to
    if (G.state === 'fight' && !this.ko && G.t - this.hitT > 1.6 && this.hp < this.hpCap) this.hp = Math.min(this.hpCap, this.hp + dt * (this.stamina > 40 ? 2 : 1));
    if (this.liver && G.t >= this.liver.t && G.state === 'fight') { const L = this.liver; this.liver = null; knockdown(L.att, this, L.dir, 0.5, L.name, L.fwd, 1.2, 'liver'); }
    if (this.liver) { this.wobble = Math.max(this.wobble, 0.6); }
    if (this.doomed && G.t >= this.doomed.t && G.state === 'fight') { const D = this.doomed; this.lastContact = this.headNow.clone(); knockout(D.att, this, D.dir, 0.4, D.name, D.fwd, true); }
    if (this.doomed && !this.ko) { this.knock = (this.knock || 0) + dt * 0.25; this.wobble = Math.max(this.wobble, 2); }   // backing up on rubber legs
    this.footwork(dt);
    if (this.slide) {   // after a knockdown he shuffles back to his mark
      this.slide.t += dt; const k = sstep(0, 1, this.slide.t / 1.1); this.group.position.lerpVectors(this.slide.from, this.mark, k); this.group.updateMatrixWorld(true);
      if (this.slide.t > 1.1) this.slide = null;
    }
    if (this.rag.on) {
      this.rag.step(dt); this.rag.apply(); this.cc.updateMatrixWorld(true); this.afterPose(dt);
      const gp = this.rag.prof && this.rag.prof.getup;
      if (gp) { const R = this.rag, t = R.t - gp.t0; if (t > 0.6 && (R.fours > 0.6 || t > 2.6)) this.startGetUp('fours'); }
      return;
    }
    this.tick(dt);
    this.animate(dt); this.retarget(); this.cc.updateMatrixWorld(true);
    this.headNeutral.setFromMatrixPosition(_m1.multiplyMatrices(this.head.matrixWorld, HEAD.restInvT));
    this.pose(dt);
    if ((G.stare > 0.001 && G.state === 'intro') || (this.pant > 0.001 && G.state === 'rend')) this.cineLayer();   // stare-down lean / heavy breathing (09b_cine.js)
    if (this.rag.hitOn) this.rag.hitStep(dt);
    this.spreadTwist(); this.cc.updateMatrixWorld(true);
    this.afterPose(dt);
  }
  simulate(dt) {
    this.group.updateMatrixWorld(true);
    this.flesh.tick(dt); this.face.update(dt);
    for (const j of this.jigs) j.update(dt);
    this.updateColliders();
    const hairOn = !this.bald;
    // the head jumped (a replay cut, a fall faster than the strands can follow): re-seat the hair instead of stretching it
    { const hp = _v1.setFromMatrixPosition(this.head.matrixWorld); if (this.lastHeadP && hp.distanceTo(this.lastHeadP) > (dt > 0 ? Math.max(0.12, 9 * dt) : 0.12)) this.simReset = true; (this.lastHeadP || (this.lastHeadP = new V3())).copy(hp); }
    this.shorts.targets(); if (hairOn) this.hair.ps.targets(); for (const t of this.tails) t.ps.targets();
    if (this.simReset) {
      this.shorts.p.set(this.shorts.t); this.shorts.o.set(this.shorts.t); this.hair.ps.reset(); for (const t of this.tails) t.ps.reset(); this.simReset = false;
    } else if (dt > 0) {
      // GFX.simSkip = 2 (low preset): shorts cloth and hair are solved every other frame (the two men on alternate frames) with one
      // step of the summed time; in between only the pinned points follow the body and the cloth is kept off the legs
      this.simAcc = (this.simAcc || 0) + dt; this.simN = (this.simN || 0) + 1;
      if (GFX.simSkip < 2 || ((this.simN + (this.isPlayer ? 0 : 1)) & 1) === 0) {
        const sd = Math.min(this.simAcc, 0.05), steps = sd > (GFX.simSkip < 2 ? 0.02 : 0.04) ? 2 : 1, h = sd / steps; this.simAcc = 0;
        for (let s = 0; s < steps; s++) { this.shorts.step(h); if (hairOn) this.hair.ps.step(h); for (const t of this.tails) t.ps.step(h); }
      } else { simPin(this.shorts); this.shorts.constrain(); if (hairOn) simPin(this.hair.ps); for (const t of this.tails) simPin(t.ps); }
    }
    this.shorts.render(); if (hairOn) renderHair(this.hair);
    for (const t of this.tails) { t.geo.attributes.position.needsUpdate = true; t.geo.computeVertexNormals(); }
    _m1.multiplyMatrices(this.head.matrixWorld, HEAD.restInv);
    this.baseMesh.matrix.copy(_m1); this.beardMesh.matrix.copy(_m1); this.baseMesh.matrixWorldNeedsUpdate = this.beardMesh.matrixWorldNeedsUpdate = true;
    { const G2 = this.gear, hf = _m1.multiplyMatrices(this.head.matrixWorld, HEAD.restInvT); G2.guard.matrix.copy(hf); G2.guard.matrixWorldNeedsUpdate = true; wearPose(this, hf);
      if (G2.spar && G2.gloves) { G2.hg.matrix.copy(hf); G2.hg.matrixWorldNeedsUpdate = true; for (const gl of G2.gloves) { gl.g.matrix.multiplyMatrices(gl.h.matrixWorld, gl.rel); gl.g.matrixWorldNeedsUpdate = true; } }
      if (G2.pants) pantsTick(this, G2.pants, 1 / 60); if (G2.top) topTick(this, G2.top, 1 / 60);
      if (G2.mma && G2.mma.visible) for (const pd of G2.mmaPads) { pd.m.matrix.multiplyMatrices(pd.b.matrixWorld, pd.rel); pd.m.matrixWorldNeedsUpdate = true; } }
  }
  capture(arr) { const b = this.allBones, n = b.length; for (let i = 0; i < n; i++) { const q = b[i].quaternion, k = 4 * i; arr[k] = q.x; arr[k + 1] = q.y; arr[k + 2] = q.z; arr[k + 3] = q.w; } const p = this.hip.position; arr[4 * n] = p.x; arr[4 * n + 1] = p.y; arr[4 * n + 2] = p.z; const L = this.flesh.u.uLid.value; arr[4 * n + 3] = L.x; arr[4 * n + 4] = L.y; arr.set(this.flesh.u.uFW.value, 4 * n + 5); }   // + the face shape weights
  restore(a, b2, t) {
    const b = this.allBones, n = b.length;
    for (let i = 0; i < n; i++) {
      const k = 4 * i; let s = a[k] * b2[k] + a[k + 1] * b2[k + 1] + a[k + 2] * b2[k + 2] + a[k + 3] * b2[k + 3]; s = s < 0 ? -1 : 1;
      b[i].quaternion.set(a[k] + (b2[k] * s - a[k]) * t, a[k + 1] + (b2[k + 1] * s - a[k + 1]) * t, a[k + 2] + (b2[k + 2] * s - a[k + 2]) * t, a[k + 3] + (b2[k + 3] * s - a[k + 3]) * t).normalize();
    }
    const k = 4 * n; { const L = this.flesh.u.uLid.value; L.x = a[k + 3] + (b2[k + 3] - a[k + 3]) * t; L.y = a[k + 4] + (b2[k + 4] - a[k + 4]) * t; L.z = L.x * 0.6; L.w = L.y * 0.6; }
    { const W = this.flesh.u.uFW.value; for (let i = 0, j = k + 5; i < W.length; i++, j++) W[i] = a[j] + (b2[j] - a[j]) * t; }
    this.hip.position.set(a[k] + (b2[k] - a[k]) * t, a[k + 1] + (b2[k + 1] - a[k + 1]) * t, a[k + 2] + (b2[k + 2] - a[k + 2]) * t);
    this.cc.updateMatrixWorld(true);
  }
}

