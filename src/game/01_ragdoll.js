/* ───────── ragdoll: rigid bodies (cannon-es) with soft joint limits and muscle tone toward the neutral body posture ─────────
   Every joint has three anatomical axes taken from the bind pose: flex (child swings forward; for the knee "+" is hyperextension),
   side (left limbs: "+" = adduction toward the midline) and twist (about the bone). Inside the limits a weak tone pulls toward the
   neutral posture; past a limit a stiff spring pushes back, so a joint can over-bend a little and springs back instead of locking. */
const D2R = Math.PI / 180;
// [bodyKey, parentKey, bone, mass, flex[lo,hi,neutral], side[lo,hi,neutral], twist[lo,hi,neutral]]   (degrees, left side; right side is mirrored)
const RAG_J = [
  // anatomical ranges (AAOS / physio-pedia normative values; thoracolumbar total split between lumbar 'waist' and thoracic 'chest').
  // flex: + = flexion (knee: + = hyperextension, so flexion is negative; foot: + = dorsiflexion). side: + = adduction / bend toward the limb's own side.
  // twist: + = internal rotation (foot: + = eversion). Bind pose is the CC A-pose: the upper arm already sits ~58° abducted.
  // masses: de Leva (1996) adult-male segment fractions for an 80 kg boxer (trunk = lower/middle/upper parts, forearm includes the hand)
  ['pelvis', null, 'Hip', 8.9],
  ['waist', 'pelvis', 'Waist', 13.1, [-20, 50, 8], [-18, 18, 0], [-15, 15, 0]],            // lumbar: flex 50, ext 20, lat 15, rot 8
  ['chest', 'waist', 'Spine02', 12.8, [-15, 60, 10], [-18, 18, 0], [-25, 25, 0]],         // thoracic: flex 40, ext 10, lat 15, rot 22
  // cervical spine split in two: C2–C7 ('neck') and the occiput–C1–C2 complex ('head'); together flex 50, ext 60, lat 45, rot 80
  ['neck', 'chest', 'NeckTwist01', 1.0, [-42, 37, 10], [-37, 37, 0], [-40, 40, 0]],
  ['head', 'neck', 'Head', 4.55, [-30, 34, 5], [-28, 28, 0], [-50, 50, 0]],
  ['uarmL', 'chest', 'L_Upperarm', 2.17, [-50, 150, 36], [-112, 88, 10], [-95, 75, 0]],  // shoulder: flex 180, ext 50, abd 170, add 30, IR 70, ER 90
  ['farmL', 'uarmL', 'L_Forearm', 1.78, [-3, 150, 90], [-5, 5, 0], [-80, 80, 0]],          // elbow: a hinge, 0–150 (pronation/supination turns the hand, not the elbow)
  ['uarmR', 'chest', 'R_Upperarm', 2.17, [-50, 150, 36], [-112, 88, 10], [-95, 75, 0]],
  ['farmR', 'uarmR', 'R_Forearm', 1.78, [-3, 150, 90], [-5, 5, 0], [-80, 80, 0]],
  ['thighL', 'pelvis', 'L_Thigh', 11.3, [-35, 120, 50], [-45, 25, -12], [-45, 45, 0]],   // hip: flex 120, ext 20, abd 40, add 20, IR/ER 45
  ['shinL', 'thighL', 'L_Calf', 3.46, [-140, 3, -50], [-8, 8, 0], [-30, 30, 0]],         // knee: flexion 135, no hyperextension; rotation only when bent (limOf)
  ['footL', 'shinL', 'L_Foot', 1.1, [-50, 25, -20], [-25, 40, 0], [-35, 15, 0]],         // ankle: plantar 50, dorsi 20, inversion 35, eversion 15
  ['thighR', 'pelvis', 'R_Thigh', 11.3, [-35, 120, 50], [-45, 25, -12], [-45, 45, 0]],
  ['shinR', 'thighR', 'R_Calf', 3.46, [-140, 3, -50], [-8, 8, 0], [-30, 30, 0]],
  ['footR', 'shinR', 'R_Foot', 1.1, [-50, 25, -20], [-25, 40, 0], [-35, 15, 0]],
];
// collision spheres per body: [bone or attach point, radius]
const RAG_S = {
  pelvis: [['Hip', 0.11], ['L_Thigh', 0.09], ['R_Thigh', 0.09]], waist: [['Waist', 0.11], ['Spine01', 0.115]], chest: [['Spine02', 0.12], ['@chest', 0.13], ['L_Upperarm', 0.07], ['R_Upperarm', 0.07]],
  neck: [['NeckTwist01', 0.055], ['NeckTwist02', 0.05]], head: [['@head', 0.1], ['Head', 0.06]], uarmL: [['L_Upperarm', 0.055], ['L_Forearm', 0.048]], farmL: [['L_Forearm', 0.045], ['L_Hand', 0.045], ['L_Mid1', 0.05]],
  uarmR: [['R_Upperarm', 0.055], ['R_Forearm', 0.048]], farmR: [['R_Forearm', 0.045], ['R_Hand', 0.045], ['R_Mid1', 0.05]],
  thighL: [['L_Thigh', 0.085], ['@mid:L_Thigh:L_Calf', 0.075], ['L_Calf', 0.06]], shinL: [['L_Calf', 0.058], ['@mid:L_Calf:L_Foot', 0.05], ['L_Foot', 0.045]], footL: [['L_Foot', 0.045], ['L_ToeBase', 0.035]],
  thighR: [['R_Thigh', 0.085], ['@mid:R_Thigh:R_Calf', 0.075], ['R_Calf', 0.06]], shinR: [['R_Calf', 0.058], ['@mid:R_Calf:R_Foot', 0.05], ['R_Foot', 0.045]], footR: [['R_Foot', 0.045], ['R_ToeBase', 0.035]],
};
const RAG_CHILD = { Hip: 'Waist', Waist: 'Spine02', Spine02: 'NeckTwist01', NeckTwist01: 'Head', Head: '@head', L_Upperarm: 'L_Forearm', L_Forearm: 'L_Hand', R_Upperarm: 'R_Forearm', R_Forearm: 'R_Hand', L_Thigh: 'L_Calf', L_Calf: 'L_Foot', L_Foot: 'L_ToeBase', R_Thigh: 'R_Calf', R_Calf: 'R_Foot', R_Foot: 'R_ToeBase' };
// which captured joint (Fighter.jp index) gives a body its launch velocity
const RAG_VEL = { pelvis: [0, 1], waist: [0, 1, 16], chest: [16], neck: [4], head: [15], uarmL: [2], farmL: [6], uarmR: [3], farmR: [8], thighL: [0], shinL: [9], footL: [10], thighR: [1], shinR: [12], footR: [13] };
const RAG_GAIN = { t0: 3.2, t1: 5, lim: 26, tz: 1.0, lz: 0.55 };
class Ragdoll {
  constructor(F) {
    this.F = F; this.on = false; this.hitOn = false; this.tone = 1;
    const B = F.bones, up = new V3(0, 1, 0), fwd = new V3(0, 0, 1);
    const pt = k => k === '@head' ? new V3(HEAD.C.x, HEAD.C.y, HEAD.C.z) : F.mpos(B['CC_Base_' + k], new V3());   // bind pose = model rest
    this.defs = RAG_J.map(([key, parent, bone, mass, fl, sd, tw]) => {
      const b = B['CC_Base_' + bone], d = { key, parent, bone: b, mass, qBind: F.mquat(b, new Quat()), right: bone.startsWith('R_'), leg: /thigh|shin|foot/.test(key), tgt: new V3(), nvec: new V3(), qa: new Quat(), str: 1, prev: new V3() };
      if (fl) {
        const a = pt(RAG_CHILD[bone]).sub(pt(bone)).normalize(), ref = bone.endsWith('Foot') ? up : fwd;
        let h = new V3().crossVectors(a, ref); if (h.lengthSq() < 1e-4) h.set(1, 0, 0); h.normalize();
        const s = new V3().crossVectors(a, h).normalize(), m = d.right ? -1 : 1;
        d.ax = [h, s, a]; d.lim = [fl, sd.map(x => x * m), tw.map(x => x * m)].map(([lo, hi, n]) => [Math.min(lo, hi) * D2R, Math.max(lo, hi) * D2R, n * D2R]);
        for (let i = 0; i < 3; i++) d.nvec.addScaledVector(d.ax[i], d.lim[i][2]);   // neutral posture as a rotation vector
      }
      return d;
    });
    this.by = Object.fromEntries(this.defs.map(d => [d.key, d]));
    for (const d of this.defs) { d.p = d.parent ? this.by[d.parent] : null; d.qPbind = d.p ? d.p.qBind : null; }
    // per-body collision bits: jointed pairs and pairs that overlap in the bind pose are excluded, the rest collide (arms vs torso, leg vs leg…)
    const bindPt = k => k === '@head' ? HEAD.C.clone() : k === '@chest' ? new V3(0, 1.43, -0.06)
      : k.startsWith('@mid:') ? (([, a, b]) => bpos('CC_Base_' + a, new V3()).add(bpos('CC_Base_' + b, new V3())).multiplyScalar(0.5))(k.split(':')) : bpos('CC_Base_' + k, new V3());
    this.fitSpheres();
    const sp = this.defs.map(d => d.fit.map(([o, r]) => [o.clone().applyQuaternion(d.qBind).add(F.mpos(d.bone, new V3())), r]));
    this.defs.forEach((d, i) => { d.bit = 1 << (i + 3); d.mask = 2 | 4; });
    for (let i = 0; i < this.defs.length; i++) for (let j = i + 1; j < this.defs.length; j++) {
      const a = this.defs[i], b = this.defs[j]; if (a.p === b || b.p === a) continue;
      let gap = 1e9; for (const [pa, ra] of sp[i]) for (const [pb, rb] of sp[j]) gap = Math.min(gap, pa.distanceTo(pb) - ra - rb);
      if (gap < 0.012) continue;
      a.mask |= b.bit; b.mask |= a.bit;
    }
    this.hitDefs = this.defs.filter(d => RAG_HIT.includes(d.key));
  }
  /* collision volumes fitted to the skin: every vertex goes to the ragdoll body that moves it; each body is sliced along its bone
     and every slice is filled with spheres sized by the slice's thinner cross-section (so a foot gets a heel, a sole and toes,
     a chest gets a row of spheres across its width). Stored in each bone's bind frame. */
  fitSpheres() {
    const F = this.F, m = F.body, geo = m.geometry, sk = m.skeleton, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, n = geo.attributes.position.count;
    const of = new Map(); for (const d of this.defs) of.set(d.bone, d);
    const boneBody = sk.bones.map(b => { for (let x = b; x; x = x.parent) if (of.has(x)) return of.get(x); return this.defs[0]; });
    const pts = new Map(this.defs.map(d => [d, []])), v = new V3(); m.updateMatrixWorld(true);
    for (let i = 0; i < n; i++) {
      let bw = -1, bi = 0; for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > bw) { bw = w; bi = si.getComponent(i, c); } }
      if (i % 2) continue; m.getVertexPosition(i, v); m.localToWorld(v); F.group.worldToLocal(v); pts.get(boneBody[bi]).push(v.clone());
    }
    const K = { pelvis: 2, waist: 2, chest: 3, neck: 1, head: 3, uarm: 3, farm: 5, thigh: 4, shin: 5, foot: 3 }, FP = (window.__tw || {}).fitP ?? 0.02;
    const pc = (a, q) => a[Math.min(a.length - 1, Math.max(0, Math.floor(q * a.length)))];
    for (const d of this.defs) {
      const P = pts.get(d), o = F.mpos(d.bone, new V3()), ck = RAG_CHILD[d.bone.name.replace('CC_Base_', '')];
      const ax = this.pt(ck || 'Waist').sub(o).normalize(), qi = d.qBind.clone().invert(), out = [];
      const ts = P.map(p => _v1.copy(p).sub(o).dot(ax)).sort((a, b) => a - b), t0 = pc(ts, 0.005), t1 = pc(ts, 0.995), nk = K[d.key.replace(/[LR]$/, '')] || 2;
      const e0 = Math.abs(ax.y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0), u = new V3().crossVectors(ax, e0).normalize(), w = new V3().crossVectors(ax, u);
      for (let k = 0; k < nk; k++) {
        const a0 = t0 + (t1 - t0) * k / nk, a1 = t0 + (t1 - t0) * (k + 1) / nk, S = P.filter(p => { const t = _v1.copy(p).sub(o).dot(ax); return t >= a0 && t <= a1; });
        if (S.length < 6) continue;
        const c = S.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / S.length);
        // principal directions of the cross-section
        let xx = 0, xy = 0, yy = 0; for (const p of S) { const q = _v1.copy(p).sub(c), x = q.dot(u), y = q.dot(w); xx += x * x; xy += x * y; yy += y * y; }
        const th = 0.5 * Math.atan2(2 * xy, xx - yy), e1 = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th)), e2 = new V3().crossVectors(ax, e1).normalize();
        const p1 = S.map(p => _v1.copy(p).sub(c).dot(e1)).sort((a, b) => a - b), p2 = S.map(p => _v1.copy(p).sub(c).dot(e2)).sort((a, b) => a - b);
        let lo1 = pc(p1, FP * 1.5), hi1 = pc(p1, 1 - FP * 1.5), lo2 = pc(p2, FP), hi2 = pc(p2, 1 - FP);
        if (hi2 - lo2 > hi1 - lo1) { [lo1, hi1, lo2, hi2] = [lo2, hi2, lo1, hi1]; e1.copy(e2); e2.crossVectors(ax, e1).normalize(); }
        const r = Math.min(d.key === 'neck' ? 0.055 : 1, Math.max(0.025, 0.5 * (hi2 - lo2))), cc = c.clone().addScaledVector(e2, 0.5 * (lo2 + hi2)).addScaledVector(ax, (a0 + a1) / 2 - _v1.copy(c).sub(o).dot(ax));
        const span = hi1 - lo1 - 2 * r, ns = span > 0.25 * r ? Math.min(4, Math.ceil(span / (1.1 * r)) + 1) : 1;
        for (let j = 0; j < ns; j++) {
          const x = ns === 1 ? 0.5 * (lo1 + hi1) : lo1 + r + span * j / (ns - 1);
          out.push([cc.clone().addScaledVector(e1, x).sub(o).applyQuaternion(qi), r]);
        }
      }
      d.fit = out.length ? out : RAG_S[d.key].map(([k, r]) => [this.pt(k).sub(o).applyQuaternion(qi), r]);
    }
  }
  pt(k) {
    const F = this.F, B = F.bones;
    if (k === '@head') { _m1.multiplyMatrices(F.head.matrixWorld, HEAD.restInvT); return F.group.worldToLocal(new V3().setFromMatrixPosition(_m1)); }
    if (k === '@chest') return F.group.worldToLocal(F.chestPt.w.clone());
    if (k.startsWith('@mid:')) { const [, a, b] = k.split(':'); return F.mpos(B['CC_Base_' + a], new V3()).add(F.mpos(B['CC_Base_' + b], new V3())).multiplyScalar(0.5); }
    return F.mpos(B['CC_Base_' + k], new V3());
  }
  /* build a world with bodies at the current bones (model space); ko = floor, ropes, opponent and self-collision */
  build(defs, ko) {
    if (ko && !(window.__tw || {}).cannon) return this.buildX(defs);
    const F = this.F, g = F.group; F.cc.updateMatrixWorld(true);
    const w = this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    w.solver.iterations = ko ? ((window.__tw || {}).it || 18) : 12; w.allowSleep = false; w.defaultContactMaterial.friction = 0.55; w.defaultContactMaterial.restitution = 0.05;
    w.defaultContactMaterial.contactEquationStiffness = 5e6; w.defaultContactMaterial.contactEquationRelaxation = 4;
    const inv = _m1.copy(g.matrixWorld).invert();
    if (ko) {
      const plane = (pw, nw) => {
        const p = pw.clone().applyMatrix4(inv), n = nw.clone().transformDirection(inv), b = new CANNON.Body({ mass: 0, collisionFilterGroup: 2, collisionFilterMask: -1 });
        b.addShape(new CANNON.Plane()); b.position.set(p.x, p.y, p.z); const q = new Quat().setFromUnitVectors(new V3(0, 0, 1), n); b.quaternion.set(q.x, q.y, q.z, q.w); w.addBody(b);
      };
      plane(new V3(0, 0, 0), new V3(0, 1, 0));
      for (const [x, z, nx, nz] of [[2.45, 0, -1, 0], [-2.45, 0, 1, 0], [0, 0.75, 0, -1], [0, -0.75, 0, 1]]) plane(new V3(x, 0, z), new V3(nx, 0, nz));
      const slick = new CANNON.Material('slick'); w.addContactMaterial(new CANNON.ContactMaterial(slick, w.defaultMaterial, { friction: 0, restitution: 0.1 }));
      this.obst = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: 4, collisionFilterMask: -1, material: slick });
      this.obstPts = [16, 15, 0]; for (const r of [0.16, 0.11, 0.14]) this.obst.addShape(new CANNON.Sphere(r), new CANNON.Vec3());
      w.addBody(this.obst); this.placeObstacle();
    } else this.obst = null;
    const idt = 1 / Math.max(F.jdt, 1 / 240);
    for (const d of defs) {
      const org = F.mpos(d.bone, new V3()), q = F.mquat(d.bone, new Quat()), qi = q.clone().invert();
      const sph = d.fit.map(([lo, r]) => [lo.clone().applyQuaternion(q).add(org), r]), com = new V3(); let wsum = 0;
      for (const [p, r] of sph) { const wt = r * r * r; com.addScaledVector(p, wt); wsum += wt; } com.multiplyScalar(1 / wsum);
      const kin = !ko && !d.p;   // standing: the pelvis follows the animation
      const b = d.body = new CANNON.Body({ mass: kin ? 0 : d.mass, type: kin ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC, collisionFilterGroup: d.bit, collisionFilterMask: ko ? d.mask : 0, linearDamping: 0.03, angularDamping: 0.08 });
      for (const [p, r] of sph) { const lp = p.clone().sub(com).applyQuaternion(qi); b.addShape(new CANNON.Sphere(r), new CANNON.Vec3(lp.x, lp.y, lp.z)); }
      d.off = org.clone().sub(com).applyQuaternion(qi);   // bone origin in body space
      b.position.set(com.x, com.y, com.z); b.quaternion.set(q.x, q.y, q.z, q.w); d.prev.copy(com);
      const vi = RAG_VEL[d.key], vv = new V3(); for (const j of vi) vv.add(_v1.copy(F.jp[j]).sub(F.jo[j]));
      vv.multiplyScalar(idt / vi.length); const vm = vv.clone().transformDirection(inv).multiplyScalar(vv.length()).clampLength(0, d.leg ? 1.2 : 3);
      b.velocity.set(vm.x, vm.y, vm.z); d.vm = vm;
      w.addBody(b);
    }
    for (const d of defs) if (d.p) {
      const piv = F.mpos(d.bone, new V3()), P = d.p.body, pa = piv.clone().sub(_v1.set(P.position.x, P.position.y, P.position.z)).applyQuaternion(_qa.set(P.quaternion.x, P.quaternion.y, P.quaternion.z, P.quaternion.w).invert());
      const c = new CANNON.PointToPointConstraint(P, new CANNON.Vec3(pa.x, pa.y, pa.z), d.body, new CANNON.Vec3(d.off.x, d.off.y, d.off.z), 1e6);
      const TW = window.__tw || {};
      c.collideConnected = false; for (const e of c.equations) e.setSpookParams(TW.jk || 1e8, TW.jr || 3, 1 / 120); w.addConstraint(c);
      // gains use the pair's reduced inertia (what the solver actually sees), so the springs stay stable at 120 Hz
      const ip = d.p.body.mass ? (d.p.body.inertia.x + d.p.body.inertia.y + d.p.body.inertia.z) / 3 : 1e9, red = c => c * ip / (c + ip), ci = d.body.inertia;
      d.Ir = new V3(red(ci.x), red(ci.y), red(ci.z)); d.pa = pa.clone();
    }
    for (const d of defs) if (d.p) d.sub = defs.filter(e => { for (let x = e; x; x = x.p) if (x === d) return true; return false; });
    this.acc = 0; this.t = 0;
  }
  /* knockout world: XPBD bodies at the current bones, floor and ropes as planes, the opponent as static spheres */
  buildX(defs) {
    const F = this.F, g = F.group; F.cc.updateMatrixWorld(true);
    const w = this.world = new XWorld(this), inv = _m1.copy(g.matrixWorld).invert(), idt = 1 / Math.max(F.jdt, 1 / 240);
    const plane = (pw, nw) => w.planes.push({ p: pw.clone().applyMatrix4(inv), n: nw.clone().transformDirection(inv) });
    plane(new V3(0, 0, 0), new V3(0, 1, 0)); w.planes[0].k = (window.__tw || {}).ck || CANVAS.k;
    // the ropes: tensioned elastic lines between the corner posts (they give, catch and throw the body back), not walls
    if (!(window.__tw || {}).noRope) w.ropes = ROPES.map(R => ({ src: R, a: R.a.clone().applyMatrix4(inv), b: R.b.clone().applyMatrix4(inv), n: 0, nPrev: 1, best: 0, s: 0.5, dv: new V3() }));
    this.obstPts = [16, 15, 0]; w.obst = [0.16, 0.11, 0.14].map(r => ({ c: new V3(), r })); this.obst = null;
    for (const d of defs) {
      const org = F.mpos(d.bone, new V3()), q = F.mquat(d.bone, new Quat());
      const sph = d.fit.map(([lo, r]) => [lo.clone().applyQuaternion(q).add(org), r]), com = new V3(); let ws = 0;
      for (const [p, r] of sph) { com.addScaledVector(p, r * r * r); ws += r * r * r; } com.multiplyScalar(1 / ws);
      const qi = q.clone().invert();
      const b = d.body = new XBody(d.mass, sph.map(([p, r]) => [p.clone().sub(com).applyQuaternion(qi), r]), com, q);
      { const wm = (window.__tw || {}).wMax; b.wMax = wm === 0 ? 0 : d.key.startsWith('foot') ? (wm || 20) : d.key.startsWith('farm') ? (wm || 20) * 1.3 : (wm || 20) * 1.5; }   // nothing in a falling body spins like a propeller
      d.off = org.clone().sub(com).applyQuaternion(qi); d.prev.copy(com);
      const vi = RAG_VEL[d.key], vv = new V3(); for (const j of vi) vv.add(_v1.copy(F.jp[j]).sub(F.jo[j]));
      vv.multiplyScalar(idt / vi.length); const vm = vv.clone().transformDirection(inv).multiplyScalar(vv.length()).clampLength(0, d.leg ? 1.2 : 3);
      b.velocity.copy(vm); d.vm = vm;
    }
    w.bodies = defs.map(d => d.body);
    for (const d of defs) if (d.p) {
      const P = d.p.body; d.pa = F.mpos(d.bone, new V3()).sub(P.position).applyQuaternion(P.quaternion.clone().invert());
      const ip = (P.inertia.x + P.inertia.y + P.inertia.z) / 3, red = c => c * ip / (c + ip), ci = d.body.inertia; d.Ir = new V3(red(ci.x), red(ci.y), red(ci.z));
    }
    for (const d of defs) if (d.p) d.sub = defs.filter(e => { for (let x = e; x; x = x.p) if (x === d) return true; return false; });
    for (let i = 0; i < defs.length; i++) for (let j = i + 1; j < defs.length; j++) if (defs[i].mask & defs[j].bit) w.pairs.push([defs[i].body, defs[j].body]);
    // start-up: lift out of the canvas (fitted soles sit a little below it) and record how far each joint already is past its stops
    let low = 0; for (const b of w.bodies) for (let i = 0; i < b.shapes.length; i++) low = Math.min(low, b.sphere(i, _v1).y - b.shapes[i].radius);
    if (low < 0) for (const b of w.bodies) b.position.y -= low - 0.001;
    for (const d of defs) if (d.p) {
      const J = jointGeo(d, d.p.body.quaternion, d.body.quaternion); d.slack = [0, 0, 0]; d.cPrev = [NaN, NaN, NaN];
      for (let i = 0; i < 3; i++) { const c = J.c[i]; if (c !== c) continue; const [lo, hi] = limOf(d, i, J.c), m = hi - lo < 0.35 ? RAG_HARD * 0.5 : RAG_HARD; d.slack[i] = c > hi + m ? c - hi - m : c < lo - m ? c - lo + m : 0; }
    }
    this.placeObstacle(); this.acc = 0; this.t = 0;
  }
  /* knockout: everything dynamic, muscle tone fades toward the neutral posture */
  start(impulseWorld, contactWorld, fall = 'back', toAttW = null, conscious = false, frozen = 0) {
    this.hitOn = false; this.mode = 'ko'; this.fall = fall;
    this.build(this.defs, true);
    const inv = _m1.copy(this.F.group.matrixWorld).invert(), imp = impulseWorld.clone().transformDirection(inv).multiplyScalar(impulseWorld.length());
    const toAtt = toAttW ? toAttW.clone().transformDirection(inv) : new V3(0, 0, 1);
    // the head still takes the punch; the trunk follows the fall type
    const trunk = fall === 'back' ? 1 : fall === 'side' ? 0.6 : fall === 'drop' ? 0.35 : 0.2;
    if (fall === 'fwd' || fall === 'side') for (const d of this.defs) {   // he was coming forward / turning in: the trunk keeps going
      const k = { chest: 1, waist: 0.6, neck: 1.1, head: 1.1, pelvis: -0.25, uarmL: 0.8, uarmR: 0.8 }[d.key]; if (!k) continue;   // the trunk pitches over the hips
      const sp = fall === 'fwd' ? 1.3 : 0.5; d.body.velocity.addScaledVector(toAtt, sp * k);
      if (fall === 'side') d.body.velocity.addScaledVector(_v1.set(imp.x, 0, imp.z).normalize(), 0.5 * k);
    }
    for (const d of this.defs) {
      // the punch carries the upper body; the feet stay planted, so the fighter topples the way he was hit
      const kick = { neck: 0.8, chest: 0.5, uarmL: 0.4, uarmR: 0.4, waist: 0.3, farmL: 0.35, farmR: 0.35, pelvis: 0.12 }[d.key] || 0;
      const bv = d.body.velocity;
      const kk = kick * (d.key === 'neck' ? Math.max(trunk, 0.6) : trunk);
      if (kk) { bv.x += imp.x * kk; bv.y += imp.y * kk; bv.z += imp.z * kk; }
      if (d.key === 'head') {   // the head takes the blow at the contact point: it is shoved and spun
        const b = d.body, c = contactWorld ? contactWorld.clone().applyMatrix4(inv) : new V3(b.position.x, b.position.y, b.position.z);
        const hk = fall === 'fwd' ? 0.25 : 1.1 * Math.max(trunk, 0.45), hi = fall === 'fwd' ? 0.5 : 0.9 * Math.max(trunk, 0.6);   // folding falls: the head spins on the neck more than it is thrown
        bv.x += imp.x * hk; bv.y += imp.y * hk; bv.z += imp.z * hk;
        b.applyImpulse(new CANNON.Vec3(imp.x * b.mass * hi, imp.y * b.mass * hi, imp.z * b.mass * hi), new CANNON.Vec3(c.x - b.position.x, c.y - b.position.y, c.z - b.position.z));
      }
      d.tgt.copy(d.nvec);
    }
    this.prof = koProfile(this); this.prof.fall = fall;
    if (conscious) Object.assign(this.prof, { conscious: true, stiff: false, fence: false, seizure: false, legDrop: 0.05 });
    if (frozen) {   // hold the pose he was in, rigidly, then let the normal knockout profile take over (usually stiff: a timber fall)
      Object.assign(this.prof, { frozen, stiff: rr() < 0.7, legDrop: frozen + 0.15 });
      for (const d of this.defs) if (d.p) { d.frz = new V3(); rotVec(_qc.copy(d.p.body.quaternion).multiply(_j1q.copy(d.qPbind).invert()).invert().multiply(d.body.quaternion).multiply(_j1q.copy(d.qBind).invert()), d.frz); }
    }
    if (fall === 'drop' || fall === 'fwd') this.prof.legDrop = Math.min(this.prof.legDrop, 0.05);
    if (fall === 'side') this.prof.sideLeg = rr() < 0.5 ? 'L' : 'R';
    this.hand0 = this.F.handBones.map(b => b.quaternion.clone());
    for (const S of this.F.shoulder) S.clBase = S.cl.quaternion.clone();
    for (const d of this.defs) d.tgt.copy(d.nvec);
    this.tone = 1; this.on = true;
  }
  /* standing hit: upper body becomes physical, muscles track the animation; strength drops in the hit zone and recovers */
  hit(impModel, pointModel, zone, power) {
    if (this.on) return;
    if (!this.hitOn) { this.mode = 'hit'; if ((window.__tw || {}).hitCannon) this.build(this.hitDefs, false); else this.buildHitX(); this.hitOn = true; this.blend = 1; }
    this.since = 0; this.blend = 1;
    // strength profile: on impact the struck part goes soft for a moment and comes back (a fighter stays tense — mostly the neck gives;
    // the arms shake loose a little; a body shot folds the trunk instead)
    const drop = zone === 'body' ? { chest: 0.55, waist: 0.55, neck: 0.8, head: 0.85, uarmL: 0.75, uarmR: 0.75, farmL: 0.8, farmR: 0.8 }
      : zone === 'block' ? { uarmL: 0.35, uarmR: 0.35, farmL: 0.4, farmR: 0.4, neck: 0.75, head: 0.8, chest: 0.95 }
      : { head: 0.3, neck: 0.4, chest: 0.85, waist: 0.93, uarmL: 0.7, uarmR: 0.7, farmL: 0.75, farmR: 0.75 };
    for (const d of this.defs) if (drop[d.key] !== undefined) d.str = Math.min(d.str ?? 1, lerp(1, drop[d.key], clamp(0.45 + power * 0.6, 0, 1)));
    const tgt = this.by[zone === 'body' ? 'chest' : zone === 'block' ? (this.blockArm || 'farmL') : 'head'].body, bp = tgt.position;
    // a real punch is not an instant velocity jump: the glove and the tissue compress for ~10–20 ms and the head is driven over
    // several tens of ms (half-sine force pulse), so the head accelerates with the fist instead of bouncing off it like a post
    const J = impModel.clone().multiplyScalar(tgt.mass), T = zone === 'body' ? 0.06 : 0.045;
    this.pulses = (this.pulses || []).filter(q => q.t < q.T);
    this.pulses.push({ b: tgt, J, r: new V3((pointModel.x - bp.x) * 0.55, (pointModel.y - bp.y) * 0.55, (pointModel.z - bp.z) * 0.55), T, t: 0 });
    if (zone === 'body') this.pulses.push({ b: this.by.waist.body, J: J.clone().multiplyScalar(0.35), r: new V3(), T, t: 0 });
    if (zone === 'block') { const hb = this.by.head.body; this.pulses.push({ b: hb, J: impModel.clone().multiplyScalar(hb.mass * 0.22), r: new V3(), T: 0.06, t: 0 }); }
  }
  /* standing reactions on the XPBD solver: the legs and pelvis ride the animation (kinematic — he keeps his feet), the trunk, neck,
     head and arms are driven toward the animated pose by compliant joint drives sized by what each joint carries (like the knockout
     ragdoll), so a shot to the chin whips the head on the neck, rocks the shoulders and shakes the arms, and everything settles back */
  buildHitX() {
    const F = this.F; F.cc.updateMatrixWorld(true);
    const w = this.world = new XWorld(this), defs = this.defs;
    for (const d of defs) {
      const org = F.mpos(d.bone, new V3()), q = F.mquat(d.bone, new Quat());
      const sph = d.fit.map(([lo, r]) => [lo.clone().applyQuaternion(q).add(org), r]), com = new V3(); let ws = 0;
      for (const [p, r] of sph) { com.addScaledVector(p, r * r * r); ws += r * r * r; } com.multiplyScalar(1 / ws);
      const qi = q.clone().invert(), b = d.body = new XBody(d.mass, sph.map(([p, r]) => [p.clone().sub(com).applyQuaternion(qi), r]), com, q);
      b.wMax = d.key.startsWith('foot') ? 20 : d.key.startsWith('farm') ? 26 : 30;
      d.off = org.clone().sub(com).applyQuaternion(qi); d.kin = !d.p || d.leg; d.inLim = 0; d.str = d.str ?? 1;
      if (d.kin) { b.invMass = 0; b.invIb.set(0, 0, 0, 0, 0, 0, 0, 0, 0); b.updateIw(); }
      d.kA = { p: com.clone(), q: q.clone() }; d.kB = { p: com.clone(), q: q.clone() };
    }
    w.bodies = defs.map(d => d.body);
    for (const d of defs) if (d.p) { const P = d.p.body; d.pa = F.mpos(d.bone, new V3()).sub(P.position).applyQuaternion(P.quaternion.clone().invert()); }
    for (const d of defs) if (d.p) d.sub = defs.filter(e => { for (let x = e; x; x = x.p) if (x === d) return true; return false; });
    this.acc = 0;
  }
  hitStepX(dt) {
    const F = this.F, defs = this.defs; this.since += dt;
    for (const d of defs) F.mquat(d.bone, d.qa);
    for (const d of defs) {
      if (d.kin) { d.kA.p.copy(d.kB.p); d.kA.q.copy(d.kB.q); d.kB.q.copy(d.qa); d.kB.p.copy(d.off).applyQuaternion(d.qa).negate().add(F.mpos(d.bone, _v4)); continue; }
      const D = _qp.copy(d.p.qa).multiply(_j1q.copy(d.qPbind).invert()), R = _qc.copy(D).invert().multiply(d.qa).multiply(_j1q.copy(d.qBind).invert());
      rotVec(R, d.tgt);
      if (this.since > 0.05) d.str = Math.min(1, d.str + dt / 0.3);
    }
    let sub = 0; const T = dt;
    this.world.step(dt, h => {
      sub += h; const f = sub / T;
      for (const d of defs) if (d.kin) {   // kinematic legs and pelvis: interpolated within the frame, with their velocities (for the damping)
        const b = d.body; b.prevQ.copy(b.quaternion); b.position.lerpVectors(d.kA.p, d.kB.p, f); b.quaternion.copy(d.kA.q).slerp(d.kB.q, f);
        b.velocity.subVectors(d.kB.p, d.kA.p).multiplyScalar(1 / T); rotVec(_xq1.copy(d.kB.q).multiply(_xq2.copy(d.kA.q).invert()), b.angularVelocity).multiplyScalar(1 / T); b.updateIw();
      }
      for (const d of defs) {
        if (d.kin) continue; const arm = d.key.startsWith('uarm') || d.key.startsWith('farm');
        d.toneW = HIT_W[d.key] * (arm && F.cur && !F.release ? Math.max(d.str, 0.95) : d.str);
        let Is = 0; const pv = _v8.copy(d.p.body.position).add(_v9.copy(d.pa).applyQuaternion(d.p.body.quaternion));
        for (const e of d.sub) Is += (e.body.inertia.x + e.body.inertia.y + e.body.inertia.z) / 3 + e.body.mass * _v9.copy(e.body.position).sub(pv).lengthSq();
        d.Ieff = Is;   // the far side is the ground-anchored body: the drive works against all of it
      }
      if (this.pulses) for (const q of this.pulses) if (q.t < q.T) {
        const a = Math.PI * q.t / q.T, b = Math.PI * Math.min(q.t + h, q.T) / q.T, k = (Math.cos(a) - Math.cos(b)) / 2 / h;
        q.b.applyForce(_v4.copy(q.J).multiplyScalar(k), q.r); q.t += h;
      }
    });
    for (const d of defs) {   // leash: never further from the animated pose than a fighter would let himself be moved
      if (d.kin) continue; const b = d.body, mx = RAG_MAXDEV[d.key] || 0.3, dot = Math.abs(b.quaternion.dot(d.qa)), ang = 2 * Math.acos(Math.min(1, dot));
      if (ang > mx) { const qb = _hq.copy(b.quaternion); b.quaternion.copy(d.qa).slerp(qb, mx / ang); b.angularVelocity.multiplyScalar(0.5); }
    }
    let rec = 1; for (const d of defs) if (!d.kin) rec = Math.min(rec, d.str);
    if (rec > 0.97 && this.since > 0.4) this.blend -= dt / 0.3;
    if (this.blend <= 0) { this.hitOn = false; this.world = null; this.mode = null; for (const d of defs) d.str = 1; return; }
    const k = sstep(0, 1, this.blend);
    for (const d of defs) { if (d.kin) continue; F.setMQuat(d.bone, _qa.copy(d.qa).slerp(d.body.quaternion, k)); }
    F.cc.updateMatrixWorld(true);
  }
  hitStep(dt) {
    if (!this.hitOn || dt <= 0) return;
    if (this.world instanceof XWorld) return this.hitStepX(dt);
    const F = this.F, defs = this.hitDefs;
    this.since += dt;
    // animated targets (the pose the fighter "wants"), in each parent's bind frame
    for (const d of defs) F.mquat(d.bone, d.qa);
    for (const d of defs) {
      if (!d.p) {   // kinematic pelvis rides the animation
        const b = d.body, q = d.qa, org = F.mpos(d.bone, _v4), com = _v5.copy(d.off).applyQuaternion(q).negate().add(org);
        b.velocity.set((com.x - d.prev.x) / dt, (com.y - d.prev.y) / dt, (com.z - d.prev.z) / dt); d.prev.copy(com);
        b.position.set(com.x, com.y, com.z); b.quaternion.set(q.x, q.y, q.z, q.w); continue;
      }
      const D = _qp.copy(d.p.qa).multiply(_j1q.copy(d.qPbind).invert()), R = _qc.copy(D).invert().multiply(d.qa).multiply(_j1q.copy(d.qBind).invert());
      rotVec(R, d.tgt);
      if (this.since > 0.05) d.str = Math.min(1, d.str + dt / 0.28);
    }
    this.acc = Math.min(this.acc + dt, 6 / 120);
    while (this.acc >= 1 / 120) {
      this.muscles();
      if (this.pulses) for (const q of this.pulses) if (q.t < q.T) {
        const h = 1 / 120, a = Math.PI * q.t / q.T, b = Math.PI * Math.min(q.t + h, q.T) / q.T, k = (Math.cos(a) - Math.cos(b)) / 2 / h;   // exact share of the half-sine over this substep
        q.b.applyForce(_cf1.set(q.J.x * k, q.J.y * k, q.J.z * k), _cf2.set(q.r.x, q.r.y, q.r.z)); q.t += h;
      }
      this.world.step(1 / 120); this.acc -= 1 / 120;
      for (const d of defs) {   // hard leash to the animated pose
        if (!d.p) continue; const b = d.body, mx = RAG_MAXDEV[d.key] || 0.3; _qb.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        const dot = Math.abs(_qb.dot(d.qa)), ang = 2 * Math.acos(Math.min(1, dot));
        if (ang > mx) { const qb = _hq.copy(_qb); _qb.copy(d.qa).slerp(qb, mx / ang); b.quaternion.set(_qb.x, _qb.y, _qb.z, _qb.w); b.angularVelocity.scale(0.5, b.angularVelocity); }
      }
    }
    let rec = 1; for (const d of defs) rec = Math.min(rec, d.str);
    if (rec > 0.97 && this.since > 0.35) this.blend -= dt / 0.3;
    if (this.blend <= 0) { this.hitOn = false; this.world = null; this.mode = null; return; }
    const k = sstep(0, 1, this.blend);
    for (const d of defs) {
      if (!d.p) continue;
      const b = d.body; _qb.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      F.setMQuat(d.bone, _qa.copy(d.qa).slerp(_qb, k));
    }
    F.cc.updateMatrixWorld(true);
  }
  placeObstacle() {
    const o = this.F.other, inv = _m1.copy(this.F.group.matrixWorld).invert();
    if (this.world instanceof XWorld) { this.obstPts.forEach((j, i) => { const p = this.world.obst[i].c.copy(o.jp[j]).applyMatrix4(inv); if (j === 0) p.add(_v2.copy(o.jp[1]).applyMatrix4(inv)).multiplyScalar(0.5); }); return; }
    this.obstPts.forEach((j, i) => { const p = _v1.copy(o.jp[j]).applyMatrix4(inv); if (j === 0) p.add(_v2.copy(o.jp[1]).applyMatrix4(inv)).multiplyScalar(0.5); this.obst.shapeOffsets[i].set(p.x, p.y, p.z); });
    this.obst.updateBoundingRadius(); this.obst.aabbNeedsUpdate = true;
  }
  muscles() {
    const G0 = this.gain || RAG_GAIN, limW = G0.lim, toneZ = G0.tz, limZ = G0.lz, ko = this.mode === 'ko';
    const qP = _qa, qC = _qb, R = _qc, r = _v1, tw = _v2, wrel = _v3;
    // once the pelvis is down on the canvas nothing holds the trunk up any more: an unconscious man cannot sit, he slumps over
    this.sit = ko ? (1 - sstep(0.26, 0.5, this.by.pelvis.body.position.y)) * sstep(0.25, 0.6, this.t) : 0;
    // lying on the canvas: an unconscious body is flaccid — no posture to return to, only tissue damping, so it settles where it fell
    this.lie = ko ? (1 - sstep(0.22, 0.4, this.by.chest.body.position.y)) * (1 - sstep(0.22, 0.4, this.by.pelvis.body.position.y)) * sstep(0.6, 1.2, this.t) : 0;
    if (this.world instanceof XWorld && this.mode === 'hit') return;
    if (this.world instanceof XWorld) {   // knockout: tone targets and stiffness only — XWorld applies them as compliant constraints
      for (const d of this.defs) {
        if (!d.p) continue; d.toneW = koTone(this, d, G0);
        let Is = 0, Ir = 0; const pv = _v8.copy(d.p.body.position).add(_v9.copy(d.pa).applyQuaternion(d.p.body.quaternion));
        for (const e of this.defs) { const b = e.body, I = (b.inertia.x + b.inertia.y + b.inertia.z) / 3 + b.mass * _v9.copy(b.position).sub(pv).lengthSq(); if (d.sub.includes(e)) Is += I; else Ir += I; }
        d.Ieff = Is * Ir / (Is + Ir); d.Isub = Is; d.Irest = Ir;
      }
      if (this.prof.getup) this.getupAssist();
      return;
    }
    for (const d of (ko ? this.defs : this.hitDefs)) {
      if (!d.p) continue; const P = d.p.body, C = d.body;
      qP.set(P.quaternion.x, P.quaternion.y, P.quaternion.z, P.quaternion.w); qC.set(C.quaternion.x, C.quaternion.y, C.quaternion.z, C.quaternion.w);
      // D = how far the parent has turned since bind; R = the child's rotation in the parent's bind frame
      const D = _qp.copy(qP).multiply(_j1q.copy(d.qPbind).invert());
      R.copy(D).invert().multiply(qC).multiply(_j1q.copy(d.qBind).invert());
      rotVec(R, r);
      // knockout: legs give way at once, the upper body fades to a residual tone. standing: track the animation at the zone's strength
      // knockout timeline: legs give way at once; spine and neck keep tension and relax over ~2 s; the arms hold the fencing response, then let go
      let toneW;
      if (!ko) toneW = RAG_HITW * (0.1 + 0.9 * d.str);
      else toneW = koTone(this, d, G0);
      // desired angular acceleration (spring toward the target + soft limits), then torque through the child's per-axis inertia
      tw.copy(d.tgt).sub(r).multiplyScalar(toneW * toneW); let limHit = 0;
      const JG = jointGeo(d, qP, qC), JA = JG.c, lim = _v7.set(0, 0, 0);
      if (ko || !d.key.startsWith('uarm') && !d.key.startsWith('farm')) for (let i = 0; i < 3; i++) {   // standing: arms follow a valid animated pose; spine and neck keep their limits
        if (JA[i] !== JA[i]) continue;
        const ax = JG.n[i], [lo, hi] = limOf(d, i, JA), c = JA[i], lw = limW * (d.key === 'waist' || d.key === 'chest' || d.key.startsWith('thigh') ? 1.7 : d.key.startsWith('shin') || d.key.startsWith('farm') || d.key.startsWith('foot') ? 2 : 1.2), L2 = lw * lw;
        if (c > hi) { lim.addScaledVector(ax, -L2 * (c - hi)); limHit = 1; } else if (c < lo) { lim.addScaledVector(ax, -L2 * (c - lo)); limHit = 1; }
      }
      tw.applyQuaternion(D).add(lim);   // bind frame → model frame (limit springs are already about model axes)
      wrel.set(C.angularVelocity.x - P.angularVelocity.x, C.angularVelocity.y - P.angularVelocity.y, C.angularVelocity.z - P.angularVelocity.z);
      tw.addScaledVector(wrel, -(2 * toneZ * toneW + (limHit ? 2 * limZ * limW * 1.4 : 0)));
      const am = tw.length(); if (am > 6000) tw.multiplyScalar(6000 / am);
      // knockout: a muscle at a joint has to move everything hanging on it — the hip swings the whole trunk, the neck the head. The gain is
      // the reduced inertia of the two sides about the pivot (articulated inertia), and the torque is applied to every body of each side as
      // one rigid rotation about the pivot (so the joint constraints don't have to fight a torque dumped on a single light body)
      let pv = null, Isub = 0, Irest = 0;
      if (ko) {
        pv = _v8.set(d.pa.x, d.pa.y, d.pa.z).applyQuaternion(qP).add(_v9.set(P.position.x, P.position.y, P.position.z));
        for (const e of this.defs) { const b = e.body, I = (b.inertia.x + b.inertia.y + b.inertia.z) / 3 + b.mass * _v9.copy(b.position).sub(pv).lengthSq(); if (d.sub.includes(e)) Isub += I; else Irest += I; }
        tw.multiplyScalar(Isub * Irest / (Isub + Irest));
      } else { _qp.copy(qC).invert(); tw.applyQuaternion(_qp); tw.x *= d.Ir.x; tw.y *= d.Ir.y; tw.z *= d.Ir.z; tw.applyQuaternion(qC); }
      // muscles hold the weight hanging on the joint (feed-forward, so it cannot oscillate): spine and neck while standing, and early in a knockout
      const hold = ko ? (d.leg || d.key.startsWith('farm') ? 0 : (d.key.startsWith('uarm') ? 0.5 : 0.75) * this.prof.hold * (1 - this.sit)) : (d.key.startsWith('farm') ? 0.9 : 0.35 + 0.6 * d.str);
      if (hold > 0) {
        const pv = _v4.set(d.pa.x, d.pa.y, d.pa.z).applyQuaternion(qP).add(_v5.set(P.position.x, P.position.y, P.position.z)); let M = 0; const cg = _v6.set(0, 0, 0);
        for (const e of d.sub) { cg.x += e.body.position.x * e.mass; cg.y += e.body.position.y * e.mass; cg.z += e.body.position.z * e.mass; M += e.mass; }
        cg.multiplyScalar(1 / M).sub(pv);   // torque = r × (M g up), in the fighter's model space (gravity is world -Y; the model's up is +Y)
        const gy = 9.81 * M * hold; tw.x += -cg.z * gy; tw.z += cg.x * gy;
      }
      if (ko) {
        // each side turns as one piece about the pivot (the reaction is spread the same way); a body resting on the canvas only takes the
        // turning part — pushing it sideways along the arc would just shove a planted foot across the floor and kick it off
        for (const e of this.defs) {
          const b = e.body, inSub = d.sub.includes(e), a = _v9.copy(tw).multiplyScalar(inSub ? 1 / Isub : -1 / Irest), r = _v10.copy(b.position).sub(pv);
          if (!inSub && b.contact) r.set(0, 0, 0);
          const Ie = (b.inertia.x + b.inertia.y + b.inertia.z) / 3; b.torque.x += a.x * Ie; b.torque.y += a.y * Ie; b.torque.z += a.z * Ie;
          b.force.x += b.mass * (a.y * r.z - a.z * r.y); b.force.y += b.mass * (a.z * r.x - a.x * r.z); b.force.z += b.mass * (a.x * r.y - a.y * r.x);
        }
      } else { C.torque.x += tw.x; C.torque.y += tw.y; C.torque.z += tw.z; if (P.mass) { P.torque.x -= tw.x; P.torque.y -= tw.y; P.torque.z -= tw.z; } }
    }
  }
  step(dt) {
    if (dt <= 0 || !this.world) return;
    this.t += dt; this.tone = Math.max(0, 1 - this.t / 1.3);
    this.placeObstacle();
    if (this.world instanceof XWorld) { const TW = window.__tw || {}; this.world.step(Math.min(dt, 1 / 20), () => { if (!TW.noMus) this.muscles(); }); return; }
    this.acc = Math.min(this.acc + dt, 8 / 120);
    while (this.acc >= 1 / 120) { this.muscles(); this.world.step(1 / 120); this.project(); this.acc -= 1 / 120; }
  }
  /* the effort of getting up, as forces: roll the chest face-down, turn toward the opponent, push chest and hips off the canvas.
     (A conscious man does this with his arms and legs against the floor; the joint targets put the hands and knees under him,
     these forces stand in for the push.) */
  getupAssist() {
    const P = this.prof, f = sstep(0, 0.5, this.t - P.getup.t0), ch = this.by.chest.body, pe = this.by.pelvis.body;
    const qc = _xq1.copy(ch.quaternion).multiply(_xq2.copy(this.by.chest.qBind).invert());
    const front = _v8.set(0, 0, 1).applyQuaternion(qc), spine = _v9.set(0, 1, 0).applyQuaternion(qc);
    this.fours = clamp(-front.y, 0, 1) * sstep(0.25, 0.42, pe.position.y) * sstep(0.2, 0.36, ch.position.y);
    const roll = _v10.crossVectors(front, _v7.set(0, -1, 0)).multiplyScalar(230 * f), yaw = _v7.set(spine.x, 0, spine.z);
    if (yaw.lengthSq() > 0.01) { yaw.normalize(); roll.y -= 120 * f * yaw.x * (yaw.z < 0 ? -1 : 1); }   // head toward the opponent (+Z)
    for (const b of [ch, pe]) { b.torque.add(_v7.copy(roll).multiplyScalar(b === ch ? 1 : 0.6)).addScaledVector(b.angularVelocity, -40 * f); }
    const prone = sstep(0.3, 0.7, -front.y); this.proneK = sstep(0.1, 0.6, -front.y);
    for (const [b, y] of [[ch, 0.46], [pe, 0.55]]) b.force.y += b.mass * prone * f * (9.81 * 0.9 + 50 * (y - b.position.y) - 13 * b.velocity.y);
  }
  project() {}   // sensor hook (called every 1/120 s of simulation)
  apply() {
    const F = this.F;
    for (const d of this.defs) {
      const b = d.body, q = _qa.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      if (!d.p) F.setHip(_v4.copy(d.off).applyQuaternion(q).add(_v5.set(b.position.x, b.position.y, b.position.z)));
      F.setMQuat(d.bone, q);
      d.bone.updateMatrixWorld(true);
    }
    if (this.mode === 'ko' && this.hand0) {   // an unconscious hand unclenches: fingers half open, wrist neutral
      const k = sstep(0.4, 1.8, this.t) * 0.85;
      F.handBones.forEach((b, i) => b.quaternion.copy(this.hand0[i]).slerp(F.bindQ.get(b), k));
      F.scapula(); F.spreadTwist();
      // the shoulder blade moved the clavicle since the bodies were built: hang the drawn arm back on the physical shoulder
      // joint, or the skin of the arm floats 5–15 cm away from its collision spheres
      for (const d of this.defs) if (d.key.startsWith('uarm')) {
        const b = d.body, par = d.bone.parent; if (!d.bone.userData.pos0) d.bone.userData.pos0 = d.bone.position.clone();
        _v4.copy(d.off).applyQuaternion(_qa.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)).add(_v5.set(b.position.x, b.position.y, b.position.z));
        par.updateMatrixWorld(true); _v4.applyMatrix4(F.group.matrixWorld).applyMatrix4(_m1.copy(par.matrixWorld).invert()); d.bone.position.copy(_v4);
        F.setMQuat(d.bone, _qa);
      }
      F.cc.updateMatrixWorld(true);
    }
  }
  stop() { for (const d of this.defs) if (d.bone.userData.pos0) { d.bone.position.copy(d.bone.userData.pos0); d.bone.userData.pos0 = null; } this.pulses = null; for (const S of this.F.shoulder) if (S.clBase) { S.cl.quaternion.copy(S.clBase); S.clBase = null; } this.on = false; this.hitOn = false; this.world = null; this.mode = null; for (const d of this.defs) d.str = 1; }
}
const _cf1 = new CANNON.Vec3(), _cf2 = new CANNON.Vec3(), _hq = new Quat(), _j1q = new Quat(), _j3q = new Quat(), _j4q = new Quat(), _v7 = new V3(), _v8 = new V3(), _v9 = new V3(), _v10 = new V3();
