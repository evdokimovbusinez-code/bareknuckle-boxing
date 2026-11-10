/* ───────── flesh: soft-tissue impact, swelling, cuts, nose bleeds (bind space of the skinned body; see FLESH_VDECL / WOUND_FDECL) ───────── */
const V4 = THREE.Vector4, _f1 = new V3(), _f2 = new V3(), _f3 = new V3();
function skinVerts(geo, mi) {   // the vertices of one material group, in bind space
  const idx = geo.index ? geo.index.array : null, pos = geo.attributes.position.array, nor = geo.attributes.normal.array, seen = new Set();
  for (const g of geo.groups) if (g.materialIndex === mi) for (let i = g.start; i < g.start + g.count; i++) seen.add(idx ? idx[i] : i);
  const P = new Float32Array(seen.size * 3), N = new Float32Array(seen.size * 3), I = new Uint32Array(seen.size); let k = 0;
  for (const v of seen) { for (let c = 0; c < 3; c++) { P[3 * k + c] = pos[3 * v + c]; N[3 * k + c] = nor[3 * v + c]; } I[k] = v; k++; }
  return { P, N, I, n: seen.size };
}
class Flesh {
  constructor(F) {
    this.F = F; const body = F.body, sk = body.skeleton;
    body.updateMatrixWorld(true); this.U = 1 / body.matrixWorld.getMaxScaleOnAxis();
    const bi = (...ns) => { for (const n of ns) { const i = sk.bones.findIndex(b => b.name === n); if (i >= 0) return i; } return 0; };
    this.hi = bi('CC_Base_Head', 'CC_Base_NeckTwist02'); this.si = bi('CC_Base_Spine02', 'CC_Base_Spine01', 'CC_Base_Waist');
    const v4 = (n, w) => Array.from({ length: n }, () => new V4(0, 0, 0, w));
    this.u = { uFT: { value: 0 }, uU: { value: this.U }, uFleshOn: { value: 0 }, uSweat: { value: 0 }, uImp: { value: v4(2, -1) }, uImpD: { value: v4(2, 0) }, uSw: { value: v4(6, 0) },
      uWP: { value: v4(8, -1e4) }, uWD: { value: v4(8, 0) }, uWN: { value: v4(8, 0) }, uWT: { value: v4(8, 0) }, uNB: { value: new V4() }, uNBD: { value: new V4() },
      uEyeL: { value: new V3() }, uEyeR: { value: new V3() }, uLidAx: { value: new V3(1, 0, 0) }, uLid: { value: new V4() },
      uEyeSw: { value: new THREE.Vector2() }, uEmo: { value: new V4() }, uEmo2: { value: new V4() }, uFUp: { value: new V3() }, uFFw: { value: new V3() }, uFMid: { value: new V3() }, uBr: { value: v4(10, 0) }, uBrT: { value: v4(10, 0) }, uSm: { value: v4(28, 0) }, uGear: { value: new V4() }, uGearT: { value: 0 }, uGlv: { value: 0 }, uSmD: { value: v4(28, 0) } };
    this.eyeSwell = [0, 0]; this.brI = 0; this.smI = 0; this.lipBleed = 0;
    this.M = new M4(); this.Mi = new M4(); this.t = 0; this.ii = 0; this.wounds = []; this.vel = new V3();
    if (!T.headV) { T.headV = skinVerts(body.geometry, T.matNames.indexOf('Std_Skin_Head')); T.bodyV = skinVerts(body.geometry, T.matNames.indexOf('Std_Skin_Body')); }
    // bind pose now (group at the origin): find the nose tip (most forward head vertex on the midline) and the nostrils under it
    this.b2w(this.hi, this.M); this.Mi.copy(this.M).invert();
    const H = T.headV; let best = -1, bz = -1e9;
    for (let i = 0; i < H.n; i++) { const p = _f1.fromArray(H.P, 3 * i).applyMatrix4(this.M); if (Math.abs(p.x) < 0.012 && p.y > HEAD.C.y - 0.1 && p.y < HEAD.C.y + 0.01 && p.z > bz) { bz = p.z; best = i; } }
    const tip = _f2.fromArray(H.P, 3 * best).applyMatrix4(this.M).clone();
    this.nose = { tip: tip.clone().applyMatrix4(this.Mi), nostrils: [-1, 1].map(sx => this.snap(H, tip.clone().add(_f3.set(0.0085 * sx, -0.016, -0.009)).applyMatrix4(this.Mi))) };
    this.up = _f1.set(0, 1, 0).transformDirection(this.Mi).clone(); this.fwdB = _f1.set(0, 0, 1).transformDirection(this.Mi).clone(); this.lat = new V3().crossVectors(this.up, this.fwdB).normalize();
    // eyelids: eyeball centres in bind space and, once for the shared geometry, how strongly each skin vertex belongs to a lid
    const fw = _f2.set(0, 0, 1).transformDirection(this.Mi).clone(), lat = new V3().crossVectors(this.up, fw).normalize();
    this.u.uLidAx.value.copy(lat);
    const eyeB = S => F.mpos(F.bones[`CC_Base_${S}_Eye`], new V3()).applyMatrix4(F.group.matrixWorld).applyMatrix4(this.Mi);
    this.u.uEyeL.value.copy(eyeB('L')); this.u.uEyeR.value.copy(eyeB('R'));
    if (!T.lidAttr) {
      const geo = body.geometry, A = new Float32Array(geo.attributes.position.count * 2), H = T.headV, eL = this.u.uEyeL.value, eR = this.u.uEyeR.value, s = this.U / 100;
      for (let k = 0; k < H.n; k++) {
        const p = _f3.fromArray(H.P, 3 * k), c = p.distanceTo(eL) < p.distanceTo(eR) ? eL : eR, v = p.clone().sub(c), r = v.length() / s, vu = v.dot(this.up) / s, vf = v.dot(fw) / s, vl = Math.abs(v.dot(lat)) / s;
        if (r > 2.9 || vf < -0.8) continue;
        const side = sstep(2.0, 1.4, vl), front = sstep(-0.8, 0.2, vf);
        A[2 * H.I[k]] = sstep(2.9, 1.5, r) * sstep(-0.05, 0.4, vu) * side * front;
        A[2 * H.I[k] + 1] = sstep(2.5, 1.5, r) * sstep(0.05, -0.4, vu) * side * front;
      }
      T.lidAttr = new THREE.BufferAttribute(A, 2); geo.setAttribute('aLid', T.lidAttr);
    }
    // expression weights: brows (whole / inner half), mouth corners (signed by side), upper and lower lip
    this.u.uFUp.value.copy(this.up); this.u.uFFw.value.copy(fw); this.u.uFMid.value.addVectors(this.u.uEyeL.value, this.u.uEyeR.value).multiplyScalar(0.5);
    this.lips = this.snap(T.headV, this.nose.tip.clone().addScaledVector(this.up, -0.024 * this.U));
    if (!T.faceAttr) {
      const geo = body.geometry, A = new Float32Array(geo.attributes.position.count * 4), H = T.headV, s = this.U / 100, mid = this.u.uFMid.value, L = this.lips.p;
      for (let k = 0; k < H.n; k++) {
        const p = _f3.fromArray(H.P, 3 * k), j = 4 * H.I[k];
        if (p.clone().sub(mid).dot(fw) / s < -2.5) continue;   // front of the face only
        for (const e of [this.u.uEyeL.value, this.u.uEyeR.value]) {
          const v = p.clone().sub(e), vu = v.dot(this.up) / s, vl = v.dot(lat) / s, inward = Math.sign(mid.clone().sub(e).dot(lat)) * vl;
          const w = sstep(3.8, 2.2, Math.abs(vl)) * sstep(0.7, 1.5, vu) * sstep(4.0, 2.6, vu) * sstep(-1.5, 0.2, v.dot(fw) / s);
          if (w > A[j]) { A[j] = w; A[j + 1] = w * sstep(-0.5, 1.2, inward); }
        }
        const m = p.clone().sub(L), mu = m.dot(this.up) / s, ml = m.dot(lat) / s, mf = m.dot(fw) / s;
        if (mf > -2.5) {
          const cw = sstep(2.2, 0.5, Math.hypot(Math.abs(ml) - 2.4, mu * 1.3)); A[j + 2] = cw * Math.sign(ml);
          const lw = sstep(2.8, 1.2, Math.abs(ml)) * (sstep(1.6, 0.4, Math.abs(mu - 0.5)) * (mu > 0 ? 1 : 0) - sstep(1.6, 0.4, Math.abs(mu + 0.9)) * (mu < 0 ? 1 : 0));
          A[j + 3] = lw;
        }
      }
      T.faceAttr = new THREE.BufferAttribute(A, 4); geo.setAttribute('aFace', T.faceAttr);
    }
    // nose blood runs over the upper lip and chin, so it is projected along the face's forward axis, not the nostril's own normal
    const fwd = _f1.set(0, 0, 1).transformDirection(this.Mi).clone(); for (const ns of this.nose.nostrils) ns.n.copy(fwd);
  }
  b2w(i, out) { const sk = this.F.body.skeleton; return out.multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]).multiply(this.F.body.bindMatrix); }
  snap(V, p) {   // nearest skin vertex (bind space)
    let bi = 0, bd = 1e18; const A = V.P;
    for (let i = 0, j = 0; i < V.n; i++, j += 3) { const dx = A[j] - p.x, dy = A[j + 1] - p.y, dz = A[j + 2] - p.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; bi = i; } }
    return { p: new V3().fromArray(A, 3 * bi), n: new V3().fromArray(V.N, 3 * bi).normalize() };
  }
  reset() {
    this.wounds.length = 0; const u = this.u; this.eyeSwell = [0, 0]; u.uEyeSw.value.set(0, 0); this.lipBleed = 0;
    for (const v of u.uBr.value) v.w = 0; for (const v of u.uSm.value) v.w = 0;
    for (const v of u.uImp.value) v.w = -1; for (const v of u.uSw.value) v.set(0, 0, 0, 0); for (const v of u.uWP.value) v.w = -1e4; u.uNB.value.w = 0;
  }
  bruise(P, a) {   // merge into a nearby bruise or start a new one
    const B = this.u.uBr.value, r2 = (0.03 * this.U) ** 2;
    for (let i = 0; i < B.length; i++) if (B[i].w > 0 && _f1.set(B[i].x, B[i].y, B[i].z).distanceToSquared(P) < r2) { B[i].w = Math.min(1.3, B[i].w + a); return; }
    const i = this.brI++ % B.length; B[i].set(P.x, P.y, P.z, a); this.u.uBrT.value[i].x = this.t;
  }
  smear(P, a, dirB, len) {   // blood on the skin (bind space), with a run of length len along dirB
    const S = this.u.uSm.value, D = this.u.uSmD.value, r2 = (0.02 * this.U) ** 2;
    for (let i = 0; i < S.length; i++) if (S[i].w > 0 && _f1.set(S[i].x, S[i].y, S[i].z).distanceToSquared(P) < r2) { S[i].w = Math.min(1.2, S[i].w + a); D[i].w = Math.max(D[i].w, len); return; }
    const i = this.smI++ % S.length; S[i].set(P.x, P.y, P.z, a); D[i].set(dirB.x, dirB.y, dirB.z, len);
  }
  // a world point on this fighter's skin → nearest skin vertex (bind space), using the bone that carries that area
  skinAt(pw, boneIdx, verts) { this.b2w(boneIdx, this.M); this.Mi.copy(this.M).invert(); return this.snap(verts, pw.clone().applyMatrix4(this.Mi)); }
  downIn(boneIdx) { this.b2w(boneIdx, this.M); this.Mi.copy(this.M).invert(); return new V3(0, -1, 0).transformDirection(this.Mi); }
  dent(P, D, w) { const k = this.ii++ % 2; this.u.uImp.value[k].set(P.x, P.y, P.z, this.t); this.u.uImpD.value[k].set(D.x, D.y, D.z, w); }
  swell(P, a) {
    const S = this.u.uSw.value, r2 = (0.026 * this.U) ** 2; let k = -1;
    for (let i = 0; i < S.length; i++) if (S[i].w > 0 && _f1.set(S[i].x, S[i].y, S[i].z).distanceToSquared(P) < r2) { k = i; break; }
    if (k < 0) { k = 0; for (let i = 1; i < S.length; i++) if (S[i].w < S[k].w) k = i; S[k].set(P.x, P.y, P.z, 0); }
    S[k].w = Math.min(1, S[k].w + a);
  }
  wound(kind, at, sev, tan, len) {
    if (this.wounds.length >= 8) return null;
    const w = { kind, p: at.p.clone(), n: at.n.clone(), d: this.down(new V3()), t0: this.t, sev, L: 0, Lmax: kind === 'nose' ? 0.035 + 0.05 * sev : 0.012 + 0.05 * sev, tan: tan || new V3(1, 0, 0), len: len || 0, drip: 0 };
    this.wounds.push(w); return w;
  }
  down(out) { this.b2w(this.hi, this.M); this.Mi.copy(this.M).invert(); return out.set(0, -1, 0).transformDirection(this.Mi); }
  world(w, out) { return out.copy(w.p).applyMatrix4(this.M); }
  /* a punch landed: dent + wave, swelling, maybe a cut or a nose bleed; returns where blood sprays from */
  onHit(cW, dirW, power, name, body, F) {
    const i = body ? this.si : this.hi; this.b2w(i, this.M); this.Mi.copy(this.M).invert();
    const at = this.snap(body ? T.bodyV : T.headV, cW.clone().applyMatrix4(this.Mi)), db = dirW.clone().transformDirection(this.Mi);
    const w = clamp(power, 0.25, 1.5); this.dent(at.p, db, w); this.bruise(at.p, 0.22 * w);
    const res = { dent: [at.p.clone(), db.clone(), w], skin: at.p.clone().applyMatrix4(this.M), spray: [] };
    if (body) return res;
    this.swell(at.p, 0.2 * w);
    // a fist landing on a bloody face drags the blood across it (bare knuckle: the face ends up painted, not dotted)
    if (this.wounds.length) { const bl = Math.min(1, this.wounds.reduce((a, x) => a + x.sev, 0)); if (bl > 0.15) this.smear(at.p, 0.25 + 0.45 * bl, db.clone().addScaledVector(this.down(_f1), 0.6).normalize(), (0.03 + 0.05 * w) * bl); }
    // periorbital haematoma: shots landing around an eye swell the lids and cheek until the eye closes
    [this.u.uEyeL.value, this.u.uEyeR.value].forEach((e, i) => { const d = at.p.distanceTo(e) / this.U; if (d < 0.05) this.eyeSwell[i] = Math.min(1, this.eyeSwell[i] + 0.16 * w * (1 - d / 0.05) * (0.7 + 0.6 * rr())); });
    this.u.uEyeSw.value.set(Math.max(this.u.uEyeSw.value.x, this.eyeSwell[0]), Math.max(this.u.uEyeSw.value.y, this.eyeSwell[1]));
    // the mouth: lips split on the teeth, the mouth fills with blood
    { const lips = this.lips || (this.lips = this.snap(T.headV, this.nose.tip.clone().addScaledVector(this.up, -0.024 * this.U)));
      const d = at.p.distanceTo(lips.p) / this.U;
      if (d < 0.045) {
        this.lipBleed = Math.min(1, this.lipBleed + 0.25 * w);
        if (!this.wounds.some(x => x.kind === 'lip') && rr() < 0.2 + 0.4 * (1 - F.hp / 100) * w) {
          const side = rr() < 0.5 ? -1 : 1;
          const c = this.snap(T.headV, lips.p.clone().addScaledVector(this.lat, side * 0.012 * this.U).addScaledVector(this.up, -0.004 * this.U)); c.n.copy(this.fwdB);
          const x = this.wound('lip', c, 0.3 + 0.35 * w, this.lat.clone(), 0.008); if (x) { res.spray.push(x); res.lip = true; }
        }
      } }
    const l = cW.clone().applyMatrix4(F.headFrameInv), P = PUNCH[name], hurt = 1 - F.hp / 100;
    // cuts open over bone: brows and cheekbones
    if (l.z > 0 && l.y > -0.035) {
      const near = this.wounds.find(x => x.kind === 'cut' && x.p.distanceTo(at.p) < 0.02 * this.U);
      if (near) { near.sev = Math.min(1, near.sev + 0.25 * w); near.L *= 0.5; res.spray.push(near); }
      else if (rr() < 0.05 + 0.25 * hurt * w + (P.type === 'hook' || P.type === 'over' ? 0.08 : 0)) {
        const tan = _f1.crossVectors(at.n, this.up).normalize().clone();
        const c = G.mode === 'spar' ? null : this.wound('cut', at, 0.35 + 0.4 * rr() * w, tan, 0.012 + 0.012 * rr()); if (c) { res.spray.push(c); res.cut = true; }   // the headgear's padding: no cuts in sparring
      }
    }
    // the nose: straights and overhands to the middle of the face
    if (l.z > 0 && l.y < 0.01 && l.y > -0.09 && Math.abs(l.x) < 0.06 && P.type !== 'upper') {
      const nose = this.wounds.filter(x => x.kind === 'nose');
      if (nose.length) { for (const x of nose) { x.sev = Math.min(1, x.sev + 0.2 * w); res.spray.push(x); } }
      else if (rr() < 0.15 + 0.6 * hurt * w) { for (const ns of this.nose.nostrils) { const x = this.wound('nose', ns, 0.25 + 0.3 * w); if (x) res.spray.push(x); } res.nose = true; }
      if (nose.length && nose[0].sev > 0.7 && w > 0.9 && this.u.uNB.value.w === 0 && rr() < 0.5) {   // the nose breaks: it sits crooked from now on
        const t = this.nose.tip, side = _f1.crossVectors(db, this.up).normalize(); this.u.uNB.value.set(t.x, t.y, t.z, 1); this.u.uNBD.value.set(side.x, side.y, side.z, 0); res.broke = true;
      }
    }
    return res;
  }
  spray(list, dirW, power, F) {   // droplets leave the wounds with the head's motion
    this.b2w(this.hi, this.M);
    for (const w of list) {
      const p = this.world(w, _f2), n = _f3.copy(w.n).transformDirection(this.M), k = (3 + 9 * w.sev * power) | 0;
      for (let i = 0; i < k; i++) FX.drop(p, _f1.copy(this.vel).multiplyScalar(0.8).addScaledVector(dirW, (0.4 + rr() * 1.6) * power).addScaledVector(n, 0.3 + rr() * 0.6), 0.5, 0.0018 + rr() * 0.0035 * (0.5 + w.sev));
    }
  }
  tick(dt) {
    this.t += dt; const u = this.u, F = this.F; u.uFT.value = this.t;
    let on = u.uNB.value.w > 0 ? 1 : 0; for (const p of u.uImp.value) if (p.w >= 0 && this.t - p.w < 1.2) on = 1; for (const s of u.uSw.value) if (s.w > 0) on = 1; u.uFleshOn.value = on;
    u.uSweat.value = clamp(this.t / 140 + (1 - F.stamina / 100) * 0.3, 0, 0.8);
    if (dt > 0) { this.vel.copy(F.jp[15]).sub(F.jo[15]).multiplyScalar(1 / Math.max(F.jdt, 1e-3)); if (this.vel.length() > 8) this.vel.setLength(8); }
    // swelling builds for a while after the blow (the haematoma keeps filling)
    if (dt > 0) for (let i = 0; i < 2; i++) if (this.eyeSwell[i] > 0) this.u.uEyeSw.value.setComponent(i, Math.min(1, this.u.uEyeSw.value.getComponent(i) + (this.eyeSwell[i] * 1.15 - this.u.uEyeSw.value.getComponent(i)) * dt * 0.25));
    if (!this.wounds.length) return;
    const down = this.down(_f1), a = 1 - Math.exp(-dt * 0.9);
    this.wounds.forEach((w, i) => {
      w.d.lerp(down, a).normalize();
      if (dt > 0) w.L = Math.min(w.Lmax, w.L + dt * (0.004 + 0.022 * w.sev) * (w.kind === 'cut' && this.t - w.t0 < 0.15 ? 0 : 1));
      // a drop gathers at the end of the rivulet and falls
      if (dt > 0 && w.L > w.Lmax * 0.92 && (w.drip -= dt) < 0) {
        w.drip = 0.5 + rr() * 2.5 / (0.3 + w.sev);
        const fl = _f2.copy(w.d).addScaledVector(w.n, -w.d.dot(w.n)); if (fl.lengthSq() > 0.04) { fl.normalize(); FX.drop(_f3.copy(w.p).addScaledVector(fl, w.L * this.U).applyMatrix4(this.M), _f2.copy(this.vel).multiplyScalar(0.5), 0.1, 0.0025 + 0.002 * w.sev); }
        // standing up, what drips off the chin lands on the chest and runs down it
        if (!F.rag.on && (w.kind === 'nose' || w.kind === 'lip' || rr() < 0.4) && rr() < 0.6) {
          const si = this.si, cw = _f3.copy(F.headNow).add(_f2.set(0, -0.25 - rr() * 0.08, 0)).addScaledVector(_f1.subVectors(F.other.headNow, F.headNow).setY(0).normalize(), 0.11);
          cw.x += (rr() - 0.5) * 0.06; cw.z += (rr() - 0.5) * 0.08;
          this.smear(this.skinAt(cw, si, T.bodyV).p, 0.25 + 0.3 * w.sev, this.downIn(si), 0.03 + 0.06 * rr());
          this.b2w(this.hi, this.M);
        }
      }
      u.uWP.value[i].set(w.p.x, w.p.y, w.p.z, w.t0); u.uWD.value[i].set(w.d.x, w.d.y, w.d.z, w.L); u.uWN.value[i].set(w.n.x, w.n.y, w.n.z, w.sev); u.uWT.value[i].set(w.tan.x, w.tan.y, w.tan.z, w.len);
    });
  }
}

const POSES = {
  fours: F => F.keyPose({ waist: [8, 0, 0], chest: [0, 0, 0], neck: [-40, 0, 0], head: [-15, 0, 0], uarmL: [78, -38, 0], uarmR: [78, -38, 0], farmL: [6, 0, 25], farmR: [6, 0, 25],
    thighL: [80, 6, 0], thighR: [80, 6, 0], shinL: [-98, 0, 0], shinR: [-98, 0, 0], footL: [-40, 0, 0], footR: [-40, 0, 0] }, 72),
  liver: F => F.keyPose({ waist: [38, 8, -6], chest: [30, 6, 0], neck: [20, 0, 0], head: [10, 0, 0], uarmL: [20, 25, -30], farmL: [110, 0, 40], uarmR: [55, 10, -20], farmR: [95, 0, 30],
    thighL: [40, 6, 0], thighR: [40, 6, 0], shinL: [-118, 0, 0], shinR: [-118, 0, 0], footL: [-45, 0, 0], footR: [-45, 0, 0] }, 18),
  kneel: F => F.keyPose({ waist: [12, 0, 0], chest: [10, 0, 0], neck: [12, 0, 0], head: [6, 0, 0], uarmL: [16, -14, 0], uarmR: [16, -14, 0], farmL: [74, 0, 22], farmR: [74, 0, 22],
    thighL: [8, 6, 0], thighR: [8, 6, 0], shinL: [-112, 0, 0], shinR: [-112, 0, 0], footL: [-45, 0, 0], footR: [-45, 0, 0] }, 12),
  step: F => F.keyPose({ waist: [10, 0, 0], chest: [8, 0, 0], neck: [11, 0, 0], head: [5, 0, 0], uarmL: [42, -13, 0], farmL: [65, 0, 25], uarmR: [32, -12, 0], farmR: [58, 0, 22],
    thighL: [90, 5, 0], shinL: [-138, 0, 0], footL: [25, 0, 0], thighR: [0, 6, 0], shinR: [-106, 0, 0], footR: [-44, 0, 0] }, 8),
  oneKnee: F => F.keyPose({ waist: [8, 0, 0], chest: [6, 0, 0], neck: [10, 0, 0], head: [4, 0, 0], uarmL: [48, -14, 0], farmL: [75, 0, 30], uarmR: [28, -12, 0], farmR: [62, 0, 25],
    thighL: [98, 4, 0], shinL: [-106, 0, 0], footL: [10, 0, 0], thighR: [-6, 6, 0], shinR: [-100, 0, 0], footR: [-42, 0, 0] }, 4),
};
/* ───────── face: gaze, blinks, lids, jaw ─────────
   • eye contact: fighters hold each other's eyes; small saccades every 0.2–1.5 s, the eyes lead the head
   • blink reflex: before a punch they can't avoid (anticipation) and on impact; spontaneous blinks every ~2–6 s
   • hit: the gaze jolts off target and swims back; the jaw is knocked open and clamps shut again
   • dazed: unfocused (the two eyes drift apart), slow heavy blinks, drooping lids
   • tired: mouth breathing — jaw opens and closes with the breath
   • knocked out: a fixed stare for a moment, then Bell's phenomenon (the eyes roll up under half-closed lids);
     the jaw hangs slack and falls with gravity                                                               */
const _fq1 = new Quat(), _fq2 = new Quat(), _fq3 = new Quat(), _fv1 = new V3(), _fv2 = new V3(), _fv3 = new V3();
class Face {
  constructor(F) {
    this.F = F; const B = F.bones;
    this.head0 = F.mquat(F.head, new Quat());
    this.eyes = ['L', 'R'].map(S => ({ b: B[`CC_Base_${S}_Eye`], q0: F.mquat(B[`CC_Base_${S}_Eye`], new Quat()), off: new V3(), cur: new V3(0, 0, 1) }));
    this.jaw = B.CC_Base_JawRoot; this.jaw0 = F.mquat(this.jaw, new Quat());
    this.reset();
  }
  reset() {
    this.t = 0; this.blinkT = 1 + rr() * 3; this.bl = -1; this.jawA = 0; this.jawV = 0; this.squint = 0; this.droop = 0;
    this.jolt = new V3(); this.sacc = new V3(); this.saccT = 0; this.drift = new V3(); this.koRoll = 0; this.koLid = 0.4 + rr() * 0.4; this.lids = [0, 0];
    this.breath = rr() * 6; this.koT = 0;
  }
  blink(now) { if (this.bl < 0 || this.bl > 0.09 || now) this.bl = 0; }
  hit(power, onJaw) {
    this.hitT = this.t; this.hitP = Math.min(1, power);
    this.blink(true); this.squint = Math.max(this.squint, 0.25 + 0.3 * power);
    this.jolt.set((rr() - 0.5) * 0.4 * power, (rr() - 0.3) * 0.25 * power, 0);
    this.jawV += (onJaw ? 9 : 4) * power;
  }
  update(dt) {
    const F = this.F; if (G.state === 'replay') return;   // replay plays back the recorded lids and bones
    this.t += dt; const ko = F.rag.on && F.rag.mode === 'ko' && !F.rag.prof.conscious, dz = F.daze || 0, tired = Math.max(clamp((40 - F.stamina) / 40, 0, 1), G.state === 'rend' ? F.pant || 0 : 0);   // (the end-of-round close-up: mouth breathing)
    if (ko) this.koT += dt; else this.koT = 0;
    // blinks
    if (!ko) { if ((this.blinkT -= dt) < 0) { this.blink(); this.blinkT = (dz > 0.2 ? 1 : 2) + rr() * 4; } }
    const o = F.other;
    if (!ko && o && o.cur && !o.resolved && o.aImpactIn != null && o.aImpactIn < 0.1 && o.aImpactIn > 0 && !this.antic) { this.antic = true; if (rr() < 0.7) { this.blink(true); this.squint = Math.max(this.squint, 0.35); } }
    if (!o || !o.cur || o.resolved) this.antic = false;
    let bl = 0; if (this.bl >= 0) { this.bl += dt * (dz > 0.3 ? 0.6 : 1); const t = this.bl; bl = t < 0.06 ? t / 0.06 : t < 0.09 ? 1 : Math.max(0, 1 - (t - 0.09) / 0.13); if (t > 0.25) this.bl = -1; }
    this.squint = Math.max(0, this.squint - dt * 0.9); this.jolt.multiplyScalar(Math.exp(-dt * 5));
    // lids
    this.droop += ((ko ? 0 : 0.18 * dz + 0.1 * tired) - this.droop) * Math.min(1, dt * 3);
    let lid = Math.max(bl, this.squint * 0.45 + this.droop + (F.cur ? 0.12 : 0));
    if (ko) { const k = sstep(0.25, 0.9, this.koT); lid = this.koLid * k; }
    const E = F.flesh.u.uEyeSw.value, sw = [sstep(0.35, 1, E.x) * 0.85, sstep(0.35, 1, E.y) * 0.85];   // swelling closes an eye
    this.lids[0] = Math.min(1, Math.max(lid, sw[0])); this.lids[1] = Math.min(1, Math.max(lid, sw[1]));
    F.flesh.u.uLid.value.set(this.lids[0], this.lids[1], this.lids[0] * 0.6, this.lids[1] * 0.6);
    // jaw: spring toward the target opening
    const D = _fq1.copy(F.mquat(F.head, _fq2)).multiply(_fq3.copy(this.head0).invert());
    let jt = F.cur ? 0 : 0.012;   // clenched when punching
    if (tired > 0 && !ko) { this.breath += dt * (5 + 3 * tired); jt = 0.035 * tired + 0.05 * tired * (0.5 + 0.5 * Math.sin(this.breath)); }
    if (dz > 0.3 && !ko) jt = Math.max(jt, 0.05 * dz);
    if (ko) { const gl = _fv1.set(0, -1, 0).applyQuaternion(_fq2.copy(D).invert()); jt = 0.07 + 0.22 * clamp(-gl.y * 0.8 - gl.z * 0.6, 0, 1); }
    this.jawV += ((jt - this.jawA) * 260 - this.jawV * 26) * dt; this.jawA = clamp(this.jawA + this.jawV * dt, -0.02, 0.4);
    F.setMQuat(this.jaw, _fq2.setFromAxisAngle(_fv1.set(1, 0, 0), this.jawA).premultiply(D).multiply(this.jaw0));
    // expression: focus by default (brows a little down), effort when throwing (brows down, lips back over clenched teeth),
    // pain on being hit (inner brows up, corners down, mouth open), dazed and tired (brows up and slack, mouth open)
    const hurt = Math.max(0, 1 - (this.t - (this.hitT || -9)) / 0.9) * (this.hitP || 0), EM = this.emo || (this.emo = [0, 0, 0, 0, 0, 0]);
    let tg = [0.35, 0, 0, 0, 0, 0];
    if (F.cur && !F.release) tg = [0.9, 0, 0.75, -0.1, 0.7, 0];
    if (F.blockW > 0.5) tg = [0.8, 0, 0.3, -0.2, 0.2, 0];
    if (hurt > 0.05) tg = tg.map((v, i) => v * (1 - hurt) + [0.1, 1, 0.8, -0.8, 0.6, 0.6][i] * hurt);
    if (dz > 0.3) tg = tg.map((v, i) => v * (1 - dz * 0.7) + [-0.3, 0.6, 0, -0.3, 0, 0.3][i] * dz * 0.7);
    if (tired > 0.3) tg[1] = Math.max(tg[1], 0.4 * tired);
    if (ko) tg = [-0.2, 0.15, 0, -0.2, 0, 0.2];
    if (G.state === 'result' && G.winner === F) tg = [0.9, 0, 0.9, 0.3, 0.9, 0.5];   // the roar
    if (G.state === 'intro' && G.stare > 0.01) tg = tg.map((v, i) => v + ((F === G.smirker ? [0.55, 0, 0.1, 0.6, 0.05, 0] : [0.85, 0, 0.3, -0.05, 0.25, 0])[i] - v) * G.stare);   // the stare-down: one man's jaw set, the other half-smiling
    if (F.gu || (F.rag.on && F.rag.prof && F.rag.prof.conscious)) tg = [0.6, 0.7, 0.8, -0.5, 0.6, 0.3];   // grimace getting up
    for (let i = 0; i < 6; i++) EM[i] += (tg[i] - EM[i]) * Math.min(1, dt * (hurt > 0.5 ? 25 : 8));
    for (let i = 0; i < 6; i++) EM[i] = clamp(EM[i], i === 2 || i === 3 ? -1 : 0, 1);   // expressions stay inside what a face can do
    F.flesh.u.uEmo.value.set(EM[0], EM[1], EM[2], EM[3]); F.flesh.u.uEmo2.value.set(EM[4], EM[5], 0, 0);
    // gaze
    const tgt = _fv2; if (o) { tgt.copy(o.headNow); tgt.y += 0.03; } else tgt.set(0, 1.6, 0);
    F.group.worldToLocal(tgt);
    if ((this.saccT -= dt) < 0) { this.saccT = 0.2 + rr() * 1.3; const a = (0.015 + 0.04 * dz) * (G.state === 'intro' && G.stare > 0.01 ? 0.25 : 1); this.sacc.set((rr() - 0.5) * a, (rr() - 0.5) * a * 0.6, 0); }
    if (dz > 0) { this.drift.x += (Math.sin(this.t * 0.7 + F.ph) * 0.12 * dz - this.drift.x) * dt * 2; this.drift.y += (Math.sin(this.t * 0.5 + 2 * F.ph) * 0.06 * dz - this.drift.y) * dt * 2; }
    else this.drift.multiplyScalar(Math.exp(-dt * 3));
    if (ko) this.koRoll += ((this.koT > 0.3 ? 0.42 : 0) - this.koRoll) * Math.min(1, dt * 4);
    this.eyes.forEach((e, i) => {
      const ep = F.mpos(e.b, _fv3), dir = _fv1.copy(tgt).sub(ep).normalize().applyQuaternion(_fq2.copy(D).invert());   // in the head's bind frame
      let yaw = Math.atan2(dir.x, dir.z), pit = Math.asin(clamp(dir.y, -1, 1));
      if (ko) { yaw = (i ? 1 : -1) * 0.06 * sstep(0.3, 1, this.koT); pit = this.koRoll; }   // eyes turn up and drift apart
      else { yaw += this.sacc.x + this.jolt.x + this.drift.x * (i ? 1 : 0.6); pit += this.sacc.y + this.jolt.y + this.drift.y; }
      yaw = clamp(yaw, -0.6, 0.6); pit = clamp(pit, -0.45, 0.5);
      e.cur.lerp(_fv1.set(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)), Math.min(1, dt * (ko ? 6 : 30))).normalize();
      F.setMQuat(e.b, _fq2.setFromUnitVectors(_fv1.set(0, 0, 1), e.cur).premultiply(D).multiply(e.q0));
    });
    this.jaw.updateMatrixWorld(true); for (const e of this.eyes) e.b.updateMatrixWorld(true);
  }
}

