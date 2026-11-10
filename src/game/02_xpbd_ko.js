/* ───────── XPBD rigid bodies for the knockout ragdoll (Müller et al. 2020, "Detailed Rigid Body Simulation with XPBD") ─────────
   Why not the sequential-impulse solver: a 14-joint chain with 1:10 mass ratios (foot vs thigh), hard anatomical stops and dozens of
   floor contacts does not converge in a few Gauss–Seidel sweeps — joints drift apart, stops get pushed through, feet pop off the floor.
   XPBD with many small substeps (one sweep each) solves joints, stops and contacts as position constraints: exact, stiff and stable. */
const _xq1 = new Quat(), _xq2 = new Quat(), _xq3 = new Quat(), _xa = new V3(), _xb = new V3(), _xc = new V3(), _xd = new V3(), _xe = new V3(), _xR = new THREE.Matrix3(), _xRt = new THREE.Matrix3(), _xM4 = new M4();
class XBody {
  constructor(mass, sph, pos, quat) {   // sph: [[offset from the COM in the body frame, radius]]
    this.mass = mass; this.invMass = mass ? 1 / mass : 0;
    this.position = pos.clone(); this.quaternion = quat.clone(); this.velocity = new V3(); this.angularVelocity = new V3(); this.torque = new V3(); this.force = new V3();
    this.prevX = new V3(); this.prevQ = new Quat(); this.contact = 0;
    this.shapes = sph.map(([, r]) => ({ radius: r })); this.shapeOffsets = sph.map(([o]) => o.clone());
    let ms = 0; for (const [, r] of sph) ms += r * r * r;
    const e = new Float64Array(9);
    for (const [o, r] of sph) {   // solid spheres, parallel-axis to the COM
      const m = mass * r * r * r / ms, i0 = 0.4 * m * r * r, x = o.x, y = o.y, z = o.z;
      e[0] += i0 + m * (y * y + z * z); e[4] += i0 + m * (x * x + z * z); e[8] += i0 + m * (x * x + y * y);
      e[1] -= m * x * y; e[3] -= m * x * y; e[2] -= m * x * z; e[6] -= m * x * z; e[5] -= m * y * z; e[7] -= m * y * z;
    }
    this.Ib = new THREE.Matrix3().fromArray(e); this.invIb = mass ? this.Ib.clone().invert() : new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    this.inertia = new V3(e[0], e[4], e[8]); this.invIw = new THREE.Matrix3(); this.bound = 0;
    for (const [o, r] of sph) this.bound = Math.max(this.bound, o.length() + r);
    this.updateIw();
  }
  updateIw() {
    if (!this.invMass) { this.invIw.set(0, 0, 0, 0, 0, 0, 0, 0, 0); return; }
    _xR.setFromMatrix4(_xM4.makeRotationFromQuaternion(this.quaternion)); _xRt.copy(_xR).transpose();
    this.invIw.multiplyMatrices(_xR, this.invIb).multiply(_xRt);
  }
  genW(r, n) { const k = _xe.crossVectors(r, n); const t = _xd.copy(k).applyMatrix3(this.invIw); return this.invMass + k.dot(t); }
  rot(wx, wy, wz) {   // q += ½ [w,0] q
    const q = this.quaternion, x = q.x, y = q.y, z = q.z, w = q.w;
    q.x += 0.5 * (wx * w + wy * z - wz * y); q.y += 0.5 * (wy * w + wz * x - wx * z); q.z += 0.5 * (wz * w + wx * y - wy * x); q.w += 0.5 * (-wx * x - wy * y - wz * z); q.normalize();
  }
  corr(n, l, r) {   // position-level impulse l along n at r
    if (!this.invMass) return;
    this.position.addScaledVector(n, l * this.invMass);
    const k = _xe.crossVectors(r, n).multiplyScalar(l).applyMatrix3(this.invIw); this.rot(k.x, k.y, k.z);
  }
  applyImpulse(J, r) {
    if (!this.invMass) return;
    this.velocity.x += J.x * this.invMass; this.velocity.y += J.y * this.invMass; this.velocity.z += J.z * this.invMass;
    const k = _xe.set(r.y * J.z - r.z * J.y, r.z * J.x - r.x * J.z, r.x * J.y - r.y * J.x).applyMatrix3(this.invIw); this.angularVelocity.add(k);
  }
  applyForce(F, r) { this.force.x += F.x; this.force.y += F.y; this.force.z += F.z; this.torque.x += r.y * F.z - r.z * F.y; this.torque.y += r.z * F.x - r.x * F.z; this.torque.z += r.x * F.y - r.y * F.x; }
  sphere(i, out) { return out.copy(this.shapeOffsets[i]).applyQuaternion(this.quaternion).add(this.position); }
}
// position correction between A (+) and B (−) along d, at offsets rA / rB; returns the position-level impulse
function xPos(A, B, d, rA, rB, alpha, h) {
  const c = d.length(); if (c < 1e-9) return 0; const n = _xa.copy(d).multiplyScalar(1 / c);
  const W = (A ? A.genW(rA, n) : 0) + (B ? B.genW(rB, n) : 0) + alpha / (h * h); if (W <= 1e-12) return 0;
  const l = c / W; if (A) A.corr(n, l, rA); if (B) B.corr(n, -l, rB); return l;
}
// rotate A by +a and B by −a (a = rotation vector), shared by inverse inertia
function xAng(A, B, a, alpha, h) {
  const th = a.length(); if (th < 1e-9) return 0; const n = _xb.copy(a).multiplyScalar(1 / th);
  const wA = A.invMass ? _xc.copy(n).applyMatrix3(A.invIw).dot(n) : 0, wB = B.invMass ? _xc.copy(n).applyMatrix3(B.invIw).dot(n) : 0, W = wA + wB + alpha / (h * h);
  if (W <= 1e-12) return 0; const l = th / W;
  if (A.invMass) { _xc.copy(n).multiplyScalar(l).applyMatrix3(A.invIw); A.rot(_xc.x, _xc.y, _xc.z); }
  if (B.invMass) { _xc.copy(n).multiplyScalar(-l).applyMatrix3(B.invIw); B.rot(_xc.x, _xc.y, _xc.z); }
  return l;
}
/* ring ropes: a taut line of tension T between posts L apart, pushed sideways at a fraction s of its length, resists with
   k = T / (L·s·(1−s)) — soft in the middle (a body sinks 20–30 cm into it), stiff near the posts. Past ~0.32 m the rope is at its
   stretch and the line goes hard. Contact is compliant (XPBD α = 1/k), so the rope stores the fall and throws the body back;
   rope damping and friction along the rope take the energy out over a couple of bounces. */
/* ring floor: canvas over ~2.5 cm of closed-cell foam. Each contact sphere is a stiff spring (k) with heavy foam damping, so a
   falling head or shoulder sinks ~1 cm over a few ms and the deceleration spike is spread instead of being a rigid stop */
const CANVAS = { k: 3.2e5, damp: 0.3 };
const ROPE = { T: 2600, R: 0.02, max: 0.32, mu: 0.4, damp: 9, kMax: 3e4 };
const _r1 = new V3(), _r2 = new V3(), _r3 = new V3(), _r4 = new V3(), _r5 = new V3(), _rq = new Quat();
const XP = { sub: 1 / 960, muS: 0.75, muD: 0.6, linDamp: 0.05, angDamp: 0.35, rollDamp: 5 };
class XWorld {
  constructor(R) { this.R = R; this.planes = []; this.obst = []; this.contacts = []; this.pairs = []; this.t = 0; this.k = 0; }
  step(dt, pre) {
    const n = Math.max(1, Math.ceil(dt / XP.sub - 1e-6)), h = dt / n, B = this.bodies;
    for (let s = 0; s < n; s++) {
      pre(h);
      for (const b of B) {   // integrate
        if (!b.invMass) continue;
        b.velocity.y -= 9.81 * h; b.velocity.addScaledVector(b.force, h * b.invMass);
        b.updateIw(); _xa.copy(b.torque).applyMatrix3(b.invIw); b.angularVelocity.addScaledVector(_xa, h);
        b.force.set(0, 0, 0); b.torque.set(0, 0, 0);
        b.prevX.copy(b.position); b.prevQ.copy(b.quaternion);
        b.position.addScaledVector(b.velocity, h); const w = b.angularVelocity; b.rot(w.x * h, w.y * h, w.z * h); b.updateIw();
      }
      this.solve(h);
      for (const b of B) {   // velocities from the corrected positions
        if (!b.invMass) continue;
        b.velocity.subVectors(b.position, b.prevX).multiplyScalar(1 / h);
        const q = b.quaternion, p = b.prevQ, dx = q.x * p.w - q.w * p.x - q.y * p.z + q.z * p.y, dy = q.y * p.w - q.w * p.y - q.z * p.x + q.x * p.z, dz = q.z * p.w - q.w * p.z - q.x * p.y + q.y * p.x, dw = q.w * p.w + q.x * p.x + q.y * p.y + q.z * p.z;
        const sg = dw < 0 ? -2 / h : 2 / h; b.angularVelocity.set(dx * sg, dy * sg, dz * sg);
      }
      this.solveVel(h);
      for (const d of this.R.defs) if (d.slack) for (let i = 0; i < 3; i++) d.slack[i] = Math.sign(d.slack[i]) * Math.max(0, Math.abs(d.slack[i]) - 0.6 * h);
      for (const b of B) {
        if (!b.invMass) continue;
        b.velocity.multiplyScalar(Math.max(0, 1 - XP.linDamp * h));
        b.angularVelocity.multiplyScalar(Math.max(0, 1 - (XP.angDamp + (b.contact ? XP.rollDamp : 0)) * h));
        // light end segments (feet, forearm+hand) can't physically spin faster than ~20 rad/s once the joint chain is slack —
        // anything above is a constraint kick (a foot catching the canvas edge-on), which reads as a twitch
        if (b.wMax) { const w = b.angularVelocity.length(); if (w > b.wMax) b.angularVelocity.multiplyScalar(b.wMax / w); }
      }
      this.t += h; if ((this.k += h) >= 1 / 120 - 1e-9) { this.k = 0; this.R.project(); }
    }
  }
  solve(h) {
    const R = this.R, C = this.contacts; C.length = 0;
    for (const b of this.bodies) b.contact = 0;
    // joints: the pivots coincide
    for (const d of R.defs) {
      if (!d.p) continue; const P = d.p.body, Q = d.body;
      const rA = _v1.copy(d.pa).applyQuaternion(P.quaternion), rB = _v2.copy(d.off).applyQuaternion(Q.quaternion);
      const dd = _v3.copy(Q.position).add(rB).sub(P.position).sub(rA);
      xPos(P, Q, dd, rA, rB, 0, h);
    }
    // muscle tone: a compliant drive toward the target posture. Stiffness k = I·ω² with I the articulated (reduced) inertia about the
    // joint, compliance α = 1/k — implicit, so it stays stable however stiff, and the joint constraints carry it through the whole limb
    const TW = window.__tw || {}, G0 = RAG_GAIN;
    for (const d of R.defs) {
      if (!d.p || !d.toneW) continue; const P = d.p.body, Q = d.body;
      const D = _xq1.copy(P.quaternion).multiply(_xq2.copy(d.qPbind).invert()), tl = d.tgt.length();
      const Rt = tl > 1e-9 ? _xq2.setFromAxisAngle(_v4.copy(d.tgt).multiplyScalar(1 / tl), tl) : _xq2.identity();
      const qd = _xq3.copy(D).multiply(Rt).multiply(d.qBind).multiply(_xq2.copy(Q.quaternion).invert());   // child: desired ⋅ current⁻¹
      if (qd.w < 0) { qd.x = -qd.x; qd.y = -qd.y; qd.z = -qd.z; qd.w = -qd.w; }
      rotVec(qd, _v5); const k = d.Ieff * d.toneW * d.toneW; if (k > 0) xAng(Q, P, _v5, 1 / k, h);
      if (R.mode === 'hit') continue;
      // soft limits: past the anatomical range a much stiffer spring pulls back (the hard stop below is the bone block)
      const J = jointGeo(d, P.quaternion, Q.quaternion); d.inLim = 0;
      for (let i = 0; i < 3; i++) {
        const c = J.c[i]; if (c !== c) continue; const [lo, hi] = limOf(d, i, J.c), ex = c > hi ? hi - c : c < lo ? lo - c : 0; if (!ex) continue;
        const lw = (TW.lk ?? 1.6) * G0.lim * (d.key === 'waist' || d.key === 'chest' || d.key.startsWith('thigh') ? 1.7 : d.key.startsWith('shin') || d.key.startsWith('farm') || d.key.startsWith('foot') ? 2 : 1.2);
        xAng(Q, P, _v6.copy(J.n[i]).multiplyScalar(ex), 1 / (d.Ieff * lw * lw), h); d.inLim = Math.max(d.inLim, lw);
        if (window.__viol) { const kk = d.key + 'FST'[i]; window.__viol[kk] = Math.max(window.__viol[kk] || 0, Math.abs(ex) / D2R); }
      }
    }
    // joint damping, implicit (XPBD): the relative turn made during this substep is resisted with compliance h/c, i.e. a torque c·ω_rel.
    // c = I_eff·(2ζω_tone + passive tissue damping + end-range damping) — like the stiffness it is sized by everything the joint carries,
    // and like the stiffness it reaches the whole limb through the joint constraints. Applying it to just the two bodies at velocity level
    // (as before) was undone a substep later by the limb hanging on them: under-damped trunk, neck and hips — the rubber wobble.
    { const cPass = TW.cp ?? 6, zT = TW.zt ?? 1.2, zL = TW.zl ?? 1.5;
      for (const d of R.defs) {
        if (!d.p || !d.Ieff) continue; const P = d.p.body, Q = d.body;
        // passive damping per joint, ~critical for the limb swinging as a pendulum under gravity (√(g/L)): feet and forearms are short and fast
        const pk = d.key.startsWith('foot') ? (TW.cf ?? 3) : d.key.startsWith('farm') ? (TW.ca ?? 2) : d.key === 'neck' || d.key === 'head' ? 1.6 : 1;
        const c = d.Ieff * (2 * zT * (d.toneW || 0) + cPass * pk + (d.inLim ? 2 * zL * d.inLim : 0)); if (c <= 0) continue;
        rotVec(_xq1.copy(Q.quaternion).multiply(_xq2.copy(Q.prevQ).invert()), _v5); rotVec(_xq1.copy(P.quaternion).multiply(_xq2.copy(P.prevQ).invert()), _v6);
        xAng(Q, P, _v5.sub(_v6).negate(), h / c, h);
      } }
    // anatomical hard stops (swing–twist), exact
    for (const d of R.defs) {
      if (!d.p || TW.noLimX || R.mode === 'hit') continue; const P = d.p.body, Q = d.body;
      for (let i = 0; i < 3; i++) {
        const J = jointGeo(d, P.quaternion, Q.quaternion), c = J.c[i], cp = d.cPrev[i]; d.cPrev[i] = c; if (c !== c) continue;
        if (cp === cp && Math.abs(c - cp) > 0.35) continue;   // a 20° jump within one substep is a measurement switch, not motion
        const [lo, hi] = limOf(d, i, J.c), m = hi - lo < 0.35 ? RAG_HARD * 0.5 : RAG_HARD;
        const sl = d.slack ? d.slack[i] : 0, H = hi + m + Math.max(0, sl), L = lo - m - Math.max(0, -sl);
        const tgt = c > H ? H : c < L ? L : c, del = clamp(tgt - c, -0.1, 0.1); if (!del) continue;   // a stop removes at most ~3° per substep (a bigger jump is a measurement wrap, not motion)
        const n = _v4.copy(J.n[i]).multiplyScalar(del);   // turning the child by +δ about n[i] moves this angle by +δ
        if (TW.log) { const kk = d.key + 'FST'[i]; const L = TW.log[kk] || (TW.log[kk] = { n: 0, max: 0, first: this.t.toFixed(3), seq: [] }); L.n++; L.max = Math.max(L.max, Math.abs(del) * 57.3); if (L.seq.length < 12) L.seq.push(+(del * 57.3).toFixed(2)); }
        xAng(Q, P, n, 0, h);
      }
    }
    // floor and ropes
    for (const b of this.bodies) for (let i = 0; i < b.shapes.length; i++) {
      const r = b.shapes[i].radius, c = b.sphere(i, _v5);
      for (const pl of this.planes) {
        const dist = _v6.copy(c).sub(pl.p).dot(pl.n) - r; if (dist >= 0) continue;
        const rA = _xd.copy(c).addScaledVector(pl.n, -r).sub(b.position).clone();
        const ln = xPos(b, null, _v6.copy(pl.n).multiplyScalar(-dist), rA, null, pl.k && !TW.hardFloor ? 1 / pl.k : 0, h); b.contact = 1;
        // static friction: undo the slide of the contact point during this substep while friction can hold it
        const pc = _v6.copy(b.shapeOffsets[i]).applyQuaternion(b.quaternion).add(b.position).addScaledVector(pl.n, -r);
        const pp = _xd.copy(b.shapeOffsets[i]).applyQuaternion(b.prevQ).add(b.prevX).addScaledVector(pl.n, -r);
        const dp = pc.sub(pp); dp.addScaledVector(pl.n, -dp.dot(pl.n));
        const rA2 = _v5.copy(b.shapeOffsets[i]).applyQuaternion(b.quaternion).addScaledVector(pl.n, -r);
        const dl = dp.length(); let lt = 0;
        if (dl > 1e-9) { lt = dl / b.genW(rA2, _xb.copy(dp).multiplyScalar(1 / dl)); if (lt < XP.muS * ln) xPos(b, null, dp.negate(), rA2, null, 0, h); }
        C.push({ b, r: rA2.clone(), n: pl.n, ln });
        break;
      }
    }
    // ropes (compliant)
    const RC = this.ropeC || (this.ropeC = []); RC.length = 0;
    if (this.ropes) for (const rp of this.ropes) {
      rp.nPrev = Math.max(1, rp.n); rp.n = 0; rp.best = 0;
      const AB = _r1.copy(rp.b).sub(rp.a), L2 = AB.lengthSq(), Ln = Math.sqrt(L2);
      for (const b of this.bodies) { if (!b.invMass) continue;
        const t0 = _r2.copy(b.position).sub(rp.a).dot(AB) / L2, pc = _r3.copy(rp.a).addScaledVector(AB, clamp(t0, 0, 1));
        if (pc.distanceTo(b.position) > (b.bound || 0.4) + ROPE.max + 0.05) continue;
        for (let i = 0; i < b.shapes.length; i++) {
          const c = b.sphere(i, _v5), r = b.shapes[i].radius, t = _r2.copy(c).sub(rp.a).dot(AB) / L2; if (t < 0.015 || t > 0.985) continue;
          const dv = _r3.copy(c).sub(_r2.copy(rp.a).addScaledVector(AB, t)), L = dv.length(), defl = r + ROPE.R - L; if (defl <= 0 || L < 1e-6) continue;
          dv.multiplyScalar(1 / L);
          const rA = _r4.copy(dv).multiplyScalar(-r).add(c).sub(b.position);
          let l = 0;
          if (defl > ROPE.max) { l += xPos(b, null, _r5.copy(dv).multiplyScalar(defl - ROPE.max), rA, null, 0, h); }
          const k = Math.min(ROPE.kMax, ROPE.T / (Ln * t * (1 - t))) / rp.nPrev;
          l += xPos(b, null, _r5.copy(dv).multiplyScalar(Math.min(defl, ROPE.max)), rA, null, 1 / k, h);
          rp.n++; if (defl > rp.best) { rp.best = Math.min(defl, ROPE.max + 0.02); rp.s = t; rp.dv.copy(dv); }
          RC.push({ b, r: rA.clone(), n: dv.clone(), ln: l });
        }
      }
      if (rp.best > 0) { const S = rp.src; S.hit = S.hit || new V3(); S.hit.copy(rp.dv).transformDirection(this.R.F.group.matrixWorld).multiplyScalar(-rp.best); S.s = rp.s; }
    }
    // self-collision and the opponent (frictionless)
    for (const [A, Bb] of (TW.noSelf ? [] : this.pairs)) {
      if (A.position.distanceTo(Bb.position) > A.bound + Bb.bound) continue;
      for (let i = 0; i < A.shapes.length; i++) { const ca = A.sphere(i, _v5).clone(), ra = A.shapes[i].radius;
        for (let j = 0; j < Bb.shapes.length; j++) {
          const cb = Bb.sphere(j, _v6), rb = Bb.shapes[j].radius, dv = _xd.copy(ca).sub(cb), L = dv.length(), pen = ra + rb - L;
          if (pen <= 0 || L < 1e-6) continue; dv.multiplyScalar(1 / L);
          const rA = _v1.copy(ca).addScaledVector(dv, -ra).sub(A.position), rB = _v2.copy(cb).addScaledVector(dv, rb).sub(Bb.position);
          xPos(A, Bb, dv.multiplyScalar(pen), rA, rB, 0, h); A.sphere(i, ca);
        } }
    }
    for (const o of this.obst) for (const b of this.bodies) for (let i = 0; i < b.shapes.length; i++) {
      const c = b.sphere(i, _v5), r = b.shapes[i].radius, dv = _xd.copy(c).sub(o.c), L = dv.length(), pen = r + o.r - L;
      if (pen <= 0 || L < 1e-6) continue; dv.multiplyScalar(1 / L);
      xPos(b, null, dv.multiplyScalar(pen), _v1.copy(c).sub(b.position).addScaledVector(_xa.copy(dv).normalize(), -r), null, 0, h);
    }
  }
  solveVel(h) {
    // joint damping (critical for the tone, heavier while a joint sits in its soft-limit zone): relative spin is bled off
    // dynamic friction and no bounce (skin on canvas)
    for (const k of this.contacts) {
      const b = k.b, v = _v1.copy(b.angularVelocity).cross(k.r).add(b.velocity), vn = v.dot(k.n), vt = _v2.copy(v).addScaledVector(k.n, -vn), lt = vt.length();
      const dv = _v3.set(0, 0, 0);
      if (lt > 1e-6) dv.addScaledVector(vt, -Math.min(XP.muD * k.ln / h, lt) / lt);
      if (vn < 0) dv.addScaledVector(k.n, -vn * ((window.__tw || {}).hardFloor ? 1 : CANVAS.damp)); else if (vn > 0.6) dv.addScaledVector(k.n, 0.6 - vn);   // resolving a penetration must not launch the limb
      const L = dv.length(); if (L < 1e-9) continue;
      const n = _v4.copy(dv).multiplyScalar(1 / L), w = b.genW(k.r, n);
      b.applyImpulse(n.multiplyScalar(L / w), k.r);
    }
    // rope contacts: friction along the rope, rope/tissue damping on the normal; the rope may push back (no clamp: that is the bounce)
    if (this.ropeC) for (const k of this.ropeC) {
      const b = k.b, v = _v1.copy(b.angularVelocity).cross(k.r).add(b.velocity), vn = v.dot(k.n), vt = _v2.copy(v).addScaledVector(k.n, -vn), lt = vt.length();
      const dv = _v3.set(0, 0, 0);
      if (lt > 1e-6) dv.addScaledVector(vt, -Math.min(ROPE.mu * Math.abs(k.ln) / h, lt) / lt);
      dv.addScaledVector(k.n, -vn * (1 - Math.exp(-ROPE.damp * h)));
      const L = dv.length(); if (L < 1e-9) continue;
      const n = _v4.copy(dv).multiplyScalar(1 / L), w = b.genW(k.r, n);
      b.applyImpulse(n.multiplyScalar(L / w), k.r);
    }
  }
}

/* ───────── knockout timeline, after the video-sign literature ─────────
   • two fall types: "no protective action — floppy" (ragdoll, neck hypotonia) and "— stiff" (tonic posturing: falls rigid, stays stiff)
   • fencing response in roughly half to two-thirds of KOs: one arm extends up, the other flexes; starts within ~2 s, often before the
     fighter lands, lasts a few seconds (lateral vestibular nucleus drives the extensors on one side)
   • impact seizure in a large share: rhythmic jerks of the limbs for a few seconds after the tonic phase
   • then lying motionless for seconds with a low resting tone — an unconscious body is never 0 % tone */
function koProfile(R) {
  const stiff = rr() < 0.35, ext = rr() < 0.5 ? 'L' : 'R', bent = ext === 'L' ? 'R' : 'L';
  const P = { stiff, tonicEnd: stiff ? 1.4 + rr() * 1.4 : 0, fence: rr() < 0.6 && !(window.__tw || {}).noFS, fOn: 0.1 + rr() * 0.6, seizure: rr() < 0.4 && !(window.__tw || {}).noFS, ext, bent, hold: 1, legDrop: stiff ? 0 : 0.05 + rr() * 0.25, tg: {} };
  P.fOff = P.fOn + 2 + rr() * 3.5; P.sOn = Math.max(P.tonicEnd, P.fence ? P.fOn + 0.8 : 0.6) + rr() * 0.6; P.sOff = P.sOn + 2 + rr() * 3; P.sHz = 3 + rr() * 2;
  const ang = (key, f, sd, tw) => { const d = R.by[key], m = d.right ? -1 : 1; return new V3().addScaledVector(d.ax[0], f * D2R).addScaledVector(d.ax[1], sd * m * D2R).addScaledVector(d.ax[2], tw * m * D2R); };
  P.tg['uarm' + ext] = ang('uarm' + ext, 110, -20, 0); P.tg['farm' + ext] = ang('farm' + ext, 10, 0, 0);
  P.tg['uarm' + bent] = ang('uarm' + bent, 50, -50, 20); P.tg['farm' + bent] = ang('farm' + bent, 125, 0, 0);
  // tonic (stiff) posture: legs and spine extended, arms rigid in front
  P.st = { thighL: ang('thighL', 6, -4, 0), thighR: ang('thighR', 6, -4, 0), shinL: ang('shinL', -6, 0, 0), shinR: ang('shinR', -6, 0, 0), footL: ang('footL', -30, 0, 0), footR: ang('footR', -30, 0, 0),
    waist: ang('waist', -4, 0, 0), chest: ang('chest', -6, 0, 0), neck: ang('neck', -8, 0, 0), head: ang('head', -4, 0, 0), uarmL: ang('uarmL', 70, -15, 0), uarmR: ang('uarmR', 70, -15, 0), farmL: ang('farmL', 40, 0, 0), farmR: ang('farmR', 40, 0, 0) };
  // forward collapse: only the trunk and head pitch over (the hips and knees just give way — no tuck, which would roll him like a ball)
  P.af = { waist: ang('waist', 12, 0, 0), chest: ang('chest', 5, 0, 0), neck: ang('neck', -15, 0, 0), head: ang('head', -10, 0, 0), uarmL: ang('uarmL', 80, -12, 0), uarmR: ang('uarmR', 80, -12, 0),
    farmL: ang('farmL', 8, 0, 20), farmR: ang('farmR', 8, 0, 20), thighL: ang('thighL', 88, 4, 0), thighR: ang('thighR', 88, 4, 0), shinL: ang('shinL', -100, 0, 0), shinR: ang('shinR', -100, 0, 0), footL: ang('footL', -40, 0, 0), footR: ang('footR', -40, 0, 0) };
  P.brace = { uarmL: ang('uarmL', 75, -15, 0), uarmR: ang('uarmR', 75, -15, 0), farmL: ang('farmL', 25, 0, 30), farmR: ang('farmR', 25, 0, 30) };
  P.bk = { shinL: ang('shinL', -95, 0, 0), shinR: ang('shinR', -95, 0, 0), thighL: ang('thighL', 55, 0, 0), thighR: ang('thighR', 55, 0, 0) };
  P.fw = { waist: ang('waist', 30, 0, 0), chest: ang('chest', 25, 0, 0), neck: ang('neck', 30, 0, 0), head: ang('head', 12, 0, 0) };
  for (const d of R.defs) d.ph = rr() * 6.28;
  return P;
}
function koTone(R, d, G0) {
  const P = R.prof, t = R.t, k = d.key, base = G0.t0, arm = k.startsWith('uarm') || k.startsWith('farm');
  const tonic = P.stiff ? 1 - sstep(P.tonicEnd, P.tonicEnd + 0.8, t) : 0;
  let w, tgt = d.nvec;
  if (d.leg) w = P.stiff ? base * 0.75 + 11 * tonic : t < P.legDrop ? base + 6 : base * 0.75;   // floppy: knees give way almost at once
  else if (k === 'head' || k === 'neck') w = P.stiff ? base + 9 * tonic : base * 0.55 + 2.5 * (1 - sstep(0.05, 0.4, t));   // floppy neck
  else if (arm) w = base * 0.8 + (P.stiff ? 9 * tonic : 3 * (1 - sstep(0.1, 0.6, t)));
  else w = base + (P.stiff ? 10 * tonic : 4 * (1 - sstep(0.3, 1.6, t)));   // trunk keeps some tension longest
  if (P.stiff && P.st[k] && tonic > 0) { _v6.lerpVectors(d.nvec, P.st[k], tonic); tgt = _v6; }
  if (P.frozen && t < P.frozen + 0.1) { const f = 1 - sstep(P.frozen - 0.08, P.frozen + 0.1, t); d.tgt.copy(d.frz); return Math.max(9 * f, 2); }
  if (P.getup) {   // pushing up: hands and knees under the body, head up
    // limbs go under the body only once he is turned onto his front (on his back the same targets would point the arms at the ceiling)
    const f = sstep(0, 0.45, t - P.getup.t0) * (arm || d.leg ? Math.max(R.proneK || 0, 0.15) : 1); if (P.af[k]) { _v6.lerpVectors(tgt, P.af[k], f); tgt = _v6; }
    w = (d.leg || arm ? 4 + 7 * f : k === 'neck' || k === 'head' ? 4 + 3 * f : 4 + 6 * f); d.tgt.copy(tgt); return w;
  }
  if (P.conscious) {   // flash knockdown: legs gone but awake — hands go out to break the fall, the trunk and neck keep working
    w = d.leg ? (t < 0.45 ? base * 0.35 : base * 1.1) : k === 'head' || k === 'neck' ? base * 1.6 : arm ? base * 1.4 : base * 1.3;
    // the legs go first and at once (knees and hips fold under him — no standing there for half a second before he drops)
    if (d.leg && P.bk && P.bk[k]) { const f = sstep(0.0, 0.1, t) * (1 - sstep(0.45, 0.8, t)); if (f > 0) { _v4.lerpVectors(tgt, P.bk[k], f); tgt = _v4; w = Math.max(w, 4 * f); } }
    if (arm && t < 1.1 && P.brace[k]) { const f = sstep(0.05, 0.25, t) * (1 - sstep(0.7, 1.1, t)); _v6.lerpVectors(tgt, P.brace[k], f); tgt = _v6; w = Math.max(w, 7 * f); }
    d.tgt.copy(tgt); return w * 0.8;
  }
  // forward collapse: the head drops, the trunk and hips fold — a man who loses his legs while leaning in goes down on his face
  if ((P.fall === 'fwd' || P.fall === 'drop') && P.fw[k] && !P.stiff) { const f = sstep(0.05, 0.35, t) * (1 - sstep(1.4, 2.4, t)) * (P.fall === 'fwd' ? 1 : 0.5); _v3.lerpVectors(tgt, P.fw[k], f); tgt = _v3; w = Math.max(w, base * 0.9 + (k === 'head' || k === 'neck' ? 2 : 5) * f); }
  if (P.fall === 'side' && d.leg && k.endsWith(P.sideLeg) && t < 0.6) w = base * 0.3;   // one knee goes first
  // "his legs went": with the extensors switched off, a boxer's bent stance folds at the knees and hips under the body's weight.
  // A straight knee has no gravity lever to fold it, so the fold is given as a target — without it the body topples like a plank
  // and the legs whip up when the back lands
  if (!P.stiff && P.bk[k]) { const f = sstep(0.02, 0.15, t) * (1 - sstep(0.5, 0.9, t)) * (P.fall === 'drop' || P.fall === 'fwd' ? 1 : 0.6); if (f > 0) { _v4.lerpVectors(tgt, P.bk[k], f); tgt = _v4; w = Math.max(w, 4 * f); } }
  // fencing response
  const f = P.fence && P.tg[k] ? sstep(P.fOn, P.fOn + 0.12, t) * (1 - sstep(P.fOff - 0.6, P.fOff, t)) : 0;
  if (f > 0) { _v5.lerpVectors(tgt, P.tg[k], f); tgt = _v5; w = Math.max(w, base + 14 * f); }
  // impact seizure: rhythmic flexion jerks, fading
  if (P.seizure && t > P.sOn && t < P.sOff && (arm || d.leg || k === 'head' || k === 'neck')) {
    const a = (1 - sstep(P.sOn, P.sOff, t)) * (k === 'head' || k === 'neck' ? 4 : d.leg ? 10 : 16) * D2R, ph = Math.sin((t - P.sOn) * P.sHz * 6.283 + d.ph);
    _v4.copy(tgt).addScaledVector(d.ax[0], a * (ph > 0.3 ? 1 : ph < -0.3 ? -1 : ph / 0.3)); tgt = _v4; w = Math.max(w, base + 7);
  }
  d.tgt.copy(tgt);
  if (R.sit > 0 && f < 0.1 && !(d.leg && !k.startsWith('thigh'))) w *= 1 - 0.55 * R.sit;   // sitting: trunk, neck, hips and arms let go
  if (R.lie > 0 && f < 0.1 && !P.conscious) w *= 1 - 0.8 * R.lie;
  P.hold = P.stiff ? Math.max(tonic, 1 - sstep(0.2, 1.2, t) * 0.7) * 0.9 : 1 - sstep(0.05, 0.45, t);
  // gains act on the articulated inertia (everything the joint carries), so the big proximal joints need far lower frequencies
  // for the same weak resting tone: an unconscious trunk cannot hold itself up against gravity
  return w * ((window.__tw || {}).tk || (k === 'waist' || k === 'chest' || k === 'neck' || k === 'head' || k.startsWith('thigh') ? 0.65 : 0.8));
}
const RAG_HIT = ['pelvis', 'waist', 'chest', 'neck', 'head'];   // arms stay on the animation and ride the chest
const RAG_HITW = 34;
const RAG_HARD = 6 * D2R;
// joint range that depends on the pose: the tibia can rotate only once the knee is bent (none when straight, ~±30° at 90°)
function limOf(d, i, c) { const L = d.lim[i]; if (i === 2 && d.key.startsWith('shin')) { const a = (3 + 27 * sstep(5 * D2R, 80 * D2R, -(c[0] || 0))) * D2R; return [-a, a]; } return L; }   // soft zone past a limit before the hard stop
const RAG_MAXDEV = { waist: 5 * D2R, chest: 8 * D2R, neck: 18 * D2R, head: 28 * D2R, uarmL: 22 * D2R, uarmR: 22 * D2R, farmL: 26 * D2R, farmR: 26 * D2R };
// standing drive frequencies (rad/s, on the articulated inertia): a fighter's trunk is braced, the neck less so, the arms are held up
const HIT_W = { waist: 26, chest: 26, neck: 17, head: 14, uarmL: 18, uarmR: 18, farmL: 18, farmR: 18 };   // a standing fighter never leaves his pose by more than this   // rad/s: how hard a standing fighter's muscles track the animation
/* joint angles as swing–twist: twist = roll about the bone, swing = the rotation that moves the bone, split on the flex and side axes.
   (decomposing one rotation vector on three axes is only valid for small angles; past ~60° it couples the axes and flips near 180°) */
const _st = { D: new Quat(), R: new Quat(), qs: new Quat(), qt: new Quat(), sv: new V3(), c: [0, 0, 0] };
function jointAngles(d, qP, qC) {
  const D = _st.D.copy(qP).multiply(_j1q.copy(d.qPbind).invert()), R = _st.R.copy(D).invert().multiply(qC).multiply(_j1q.copy(d.qBind).invert());
  if (R.w < 0) { R.x = -R.x; R.y = -R.y; R.z = -R.z; R.w = -R.w; }
  const a = d.ax[2], p = R.x * a.x + R.y * a.y + R.z * a.z;
  const ql = Math.hypot(p, R.w), qt = ql > 1e-9 ? _st.qt.set(a.x * p / ql, a.y * p / ql, a.z * p / ql, R.w / ql) : _st.qt.identity();
  const qs = _st.qs.copy(R).multiply(_j1q.copy(qt).invert()); rotVec(qs, _st.sv);
  _st.c[0] = _st.sv.dot(d.ax[0]); _st.c[1] = _st.sv.dot(d.ax[1]); _st.c[2] = ql > 1e-9 ? 2 * Math.atan2(p, R.w) : 0;
  return _st;
}
/* joint angles measured geometrically (as in the XPBD paper): flex / side = signed angle between the parent's and the child's bone
   direction about the parent's flex / side axis, twist = angle between their reference axes about the mean bone direction.
   Unlike a decomposed rotation vector these stay valid at any bend; an axis is undefined (NaN) only where it is singular
   (e.g. "side" of a knee bent 90° — that motion is the shin's own roll and belongs to twist). */
const _jg = { c: [0, 0, 0], n: [new V3(), new V3(), new V3()], r1: [new V3(), new V3(), new V3()], r2: [new V3(), new V3(), new V3()], D: new Quat(), Cq: new Quat() };
const _jq = new Quat(), _jA = new V3(), _jB = new V3(), _jC = new V3(), _jD = new V3(), _jE = new V3(), _jX = new V3();
function sAng(n, v1, v2, o1, o2, minL) {
  o1.copy(v1).addScaledVector(n, -v1.dot(n)); o2.copy(v2).addScaledVector(n, -v2.dot(n)); const l1 = o1.length(), l2 = o2.length();
  if (l1 < minL || l2 < minL) return NaN; o1.multiplyScalar(1 / l1); o2.multiplyScalar(1 / l2);
  return Math.atan2(_jX.crossVectors(o1, o2).dot(n), o1.dot(o2));
}
function jointGeo(d, qP, qC) {
  const G = _jg, D = G.D.copy(qP).multiply(_j1q.copy(d.qPbind).invert()), Cq = G.Cq.copy(qC).multiply(_j1q.copy(d.qBind).invert());
  const a1 = _jA.copy(d.ax[2]).applyQuaternion(D), a2 = _jB.copy(d.ax[2]).applyQuaternion(Cq);
  // flex: angle about the parent's flex axis, in the flex plane; side: elevation of the bone out of the flex plane (swing1 / swing2)
  const nf = G.n[0].copy(d.ax[0]).applyQuaternion(D); G.c[0] = sAng(nf, a1, a2, G.r1[0], G.r2[0], 0.2);
  const u = G.n[1].crossVectors(a2, nf), ul = u.length();
  if (ul < 0.15) G.c[1] = NaN; else { u.multiplyScalar(1 / ul); G.c[1] = Math.asin(clamp(a2.dot(nf), -1, 1)); }
  // twist: roll about the child's own bone, read from the flex axis (which a pure swing leaves unchanged, so it stays valid however
  // far a knee or an elbow is bent); only when the bone points along the parent's flex axis, carry the reference along the swing
  G.n[2].copy(a2); G.c[2] = sAng(a2, _jD.copy(d.ax[0]).applyQuaternion(D), _jE.copy(d.ax[0]).applyQuaternion(Cq), G.r1[2], G.r2[2], 0.35);
  if (G.c[2] !== G.c[2] && a1.dot(a2) > -0.85) { const qsw = _jq.setFromUnitVectors(a1, a2); G.c[2] = sAng(a2, _jD.copy(d.ax[0]).applyQuaternion(D).applyQuaternion(qsw), _jE.copy(d.ax[0]).applyQuaternion(Cq), G.r1[2], G.r2[2], 0.2); }
  return G;
}
function rotVec(R, out) {
  let x = R.x, y = R.y, z = R.z, w = R.w; if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.sqrt(x * x + y * y + z * z), k = s > 1e-6 ? 2 * Math.atan2(s, w) / s : 2;
  return out.set(x * k, y * k, z * k);
}

