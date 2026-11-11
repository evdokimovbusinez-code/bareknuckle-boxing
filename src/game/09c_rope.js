/* ───────── training: the jump rope (issue #24) ─────────
   One strand of verlet chain pinned to the two handle tips; the HANDS drive the turn (the rope is never animated by hand):
   the wrist circles pump the ends, centrifugal stiffening keeps the loop out, gravity and the floor shape the rest.
   The loop is an open strand (not a closed ring): pinned at both tips it bulges out to d ≈ 1 m from the hand line —
   over the head on the way up, grazing the floor and the feet on the way down. A late jump = the strand catches the
   shins/feet (real collision with the leg bones) → snag → the rope falls, the man gathers himself and winds it up again.
   States: spin → snag → fall → wind → spin. P1 poses over his base animation (jrPose after Fighter.update).
   Location: boxgym, on the drill mat (the BAG.on placement trick; the bag itself is hidden). Debug: __rope / __g.JR */
const JR = {
  on: false, st: 'off', t: 0, stT: 0,
  N: 36, LEN: 2.7, RR: 0.0035, seg: 0,
  p: null, o: null,                       // verlet points / previous positions (Float32Array, world)
  grp: null, geo: null, hnd: [], brace: [],   // scene root, tube geometry, handle groups, loop-shape memory
  tan: null, nor: null,                   // per-ring frame scratch for the tube render
  ph: 0, om: 9.2, R: 0.012,               // crank phase (runs backwards), turn rate, hand-circle radius
  omM: 0, thPrev: 0, bulbI: -1,           // measured rope rate and bulge angle
  fL: null, fR: null, qF: null, hipB: null, handB: null, cap: false,
  hopT: -9, hopD: 0.32, rise: 0.17, wantMiss: false, armed: true, blend: 0, bulbPrev: 1.57,
  snagY: 0, floorY: 0.004,
};
const _jv1 = new V3(), _jv2 = new V3(), _jv3 = new V3(), _jv4 = new V3(), _jq1 = new Quat(), _jq2 = new Quat(), _jq3 = new Quat(), _jM = new M4();

/* ── procedural textures ── */
function jrHandleTex() {   // knurled rubber grip, wrapped leather look
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#26221f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(255,235,210,${0.02 + rr() * 0.05})`; g.fillRect(rr() * w, rr() * h, 1.5, 1.5); }
    for (let y = 6; y < h; y += 9) { g.strokeStyle = `rgba(0,0,0,${0.25 + rr() * 0.2})`; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 2); g.stroke(); }   // grip rings
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.08 + rr() * 0.1})`; g.beginPath(); g.ellipse(rr() * w, rr() * h, 2 + rr() * 5, 1 + rr() * 2, rr() * 3, 0, 7); g.fill(); }
  });
}
function jrRopeTex() {   // braided polymer cord: diagonal strand pairs, steel-blue
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#3c4756'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${rr() * 0.05})`; g.fillRect(rr() * w, rr() * h, 2, 2); }
    for (let s = -h; s < w + h; s += 10) {
      g.strokeStyle = 'rgba(215,225,235,0.75)'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(s, 0); g.lineTo(s + h, h); g.stroke();
      g.strokeStyle = 'rgba(20,28,40,0.5)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(s + 4, 0); g.lineTo(s + 4 + h, h); g.stroke();
    }
  });
}

/* ── meshes: two handles (conic grip + bearing cap the rope leaves) and the cable tube ── */
function jrBuild() {
  const g = JR.grp = new THREE.Group(); g.visible = false; g.frustumCulled = false; scene.add(g);
  const hTex = jrHandleTex(), rTex = jrRopeTex(); rTex.wrapS = rTex.wrapT = THREE.RepeatWrapping;
  const hMat = new THREE.MeshStandardMaterial({ map: hTex, roughness: 0.72, metalness: 0.05 });
  const cMat = new THREE.MeshStandardMaterial({ color: '#b7bcc4', roughness: 0.35, metalness: 0.85 });
  for (let i = 0; i < 2; i++) {
    const hg = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0135, 0.15, 10), hMat);   // slight cone: thicker at the far end
    grip.castShadow = true; hg.add(grip);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.02, 8), cMat); cap.position.y = 0.083; hg.add(cap);   // bearing cap, rope exit
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), cMat); end.position.y = -0.078; end.scale.y = 0.6; hg.add(end);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.003, 6, 14), cMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.072; hg.add(ring);
    hg.visible = false; g.add(hg); JR.hnd.push({ g: hg, len: 0.125, dir: new V3(1, 0, 0) });
  }
  const S = 8, rings = JR.N + 1, pos = new Float32Array(rings * S * 3), nor = new Float32Array(rings * S * 3), uv = new Float32Array(rings * S * 2), idx = [];
  for (let i = 0; i < rings; i++) for (let s = 0; s < S; s++) { const k = i * S + s; uv[k * 2] = (i / JR.N) * 30; uv[k * 2 + 1] = s / S; }
  for (let i = 0; i < JR.N; i++) for (let s = 0; s < S; s++) { const a = i * S + s, b = i * S + (s + 1) % S, c = a + S, d = b + S; idx.push(a, c, b, b, c, d); }
  const geo = JR.geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const tube = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: rTex, roughness: 0.55, metalness: 0.1 }));
  tube.castShadow = true; tube.frustumCulled = false; g.add(tube);
  JR.tan = new Float32Array(rings * 3); JR.nor = new Float32Array(rings * 3);
  JR.seg = JR.LEN / JR.N;
  JR.p = new Float32Array((JR.N + 1) * 3); JR.o = new Float32Array((JR.N + 1) * 3);
}

/* ── capture: the pose the overlay starts from (planted feet, hip, hand bone axes for the handle) ── */
function jrCapture() {
  const F = P1, LB = F.limbs();
  JR.cap = true;
  JR.fL = F.mpos(F.bones.CC_Base_L_Foot, new V3()); JR.fR = F.mpos(F.bones.CC_Base_R_Foot, new V3());   // group-local
  JR.qF = [F.mquat(LB.L.foot, new Quat()), F.mquat(LB.R.foot, new Quat())];
  JR.hipB = F.mpos(F.hip, new V3());
  JR.handB = [F.bpos('CC_Base_L_Hand', new V3()), F.bpos('CC_Base_R_Hand', new V3())];
  // skipping stance: feet side by side under the body (the boxer's staggered stance would let the rope pass
  // between them), toes just ahead of the rope's sweep plane; blended in by jrPose. Group-local: forward = +z.
  JR.sL = new V3(JR.hipB.x + 0.13, JR.fL.y, JR.hipB.z + 0.02);
  JR.sR = new V3(JR.hipB.x - 0.13, JR.fR.y, JR.hipB.z + 0.02);
}

/* ── P1 pose overlay: hip bounce, pinned feet, hands cranking at the hips ── */
const JR_HY = 1.0, JR_HZ = 0.3, JR_HX = 0.02;   // hand line: height, half spread, forward offset (group-local, P1 faces +x)
function jrHopY() {
  const u = (JR.t - JR.hopT) / JR.hopD;
  if (JR.st !== 'spin' || u < 0 || u > 1) return JR.st === 'snag' ? -0.05 * Math.sin(Math.min(1, JR.stT / 0.35) * Math.PI) : 0;
  return JR.rise * Math.pow(Math.sin(Math.PI * u), 0.85);
}
function jrPose(dt) {
  const F = P1, B = F.bones, LB = F.limbs();
  if (!JR.cap) jrCapture();
  JR.blend = Math.min(1, JR.blend + dt * 6);
  const bl = sstep(0, 1, JR.blend), hop = jrHopY();
  F.setHip(_jv1.copy(JR.hipB).add(_jv2.set(0, hop, 0)));
  // stand up straighter than the boxer's idle stance: undo the clip's forward hunch
  F.rot(B.CC_Base_Waist, -0.16, 0, 0); F.rot(B.CC_Base_Spine01, -0.12, 0, 0);
  F.rot(B.CC_Base_Spine02, -0.1, 0, 0); F.rot(B.CC_Base_NeckTwist01, 0.1, 0, 0);
  F.cc.updateMatrixWorld(true);
  // feet: into the skipping stance (blended), pinned to the mat while grounded, lifted with the hop
  for (let i = 0; i < 2; i++) {
    const L = i ? LB.R : LB.L, fp = i ? JR.fR : JR.fL, foot = L.foot;
    _jv3.copy(fp).lerp(i ? JR.sR : JR.sL, bl); _jv3.y += Math.max(0, hop) * 0.95;   // already group-local
    const q = F.mquat(foot, _jq1);
    F.ik(L.thigh, L.calf, foot, _jv3); F.setMQuat(foot, _jq2.copy(q));
  }
  // hands: crank circles in the sagittal plane, blended in from wherever the base pose had them.
  // The fighter faces group-local +z (the group is turned +90° about y): hands spread along local x,
  // the crank circles in local y-z (forward = +z), P1's left hand at +x.
  for (let i = 0; i < 2; i++) {
    const S = i ? 'R' : 'L', H = B[`CC_Base_${S}_Hand`], s = i ? -1 : 1;
    _jv4.set(s * JR_HZ, JR_HY + Math.sin(JR.ph) * JR.R * 0.85, JR_HX + Math.cos(JR.ph) * JR.R);   // the hands always hold the crank (a stumble only stops the turn, it doesn't change the grip)
    if (bl < 1) _jv4.lerp(F.mpos(H, _jv3), 1 - bl);
    F.ik(B[`CC_Base_${S}_Upperarm`], B[`CC_Base_${S}_Forearm`], H, _jv4);
  }
  F.spreadTwist(); F.cc.updateMatrixWorld(true); F.afterPose(dt);
}

/* ── the strand: verlet chain, 2 substeps, distance + weak bending constraints, floor, body ── */
function jrColliders() {   // capsules [ax,ay,az,bx,by,bz,r] from P1's bones; 'leg' zones snag the rope
  const F = P1, C = JR.col || (JR.col = []);
  const put = (i, a, b, r, leg) => { const c = C[i] || (C[i] = { a: new V3(), b: new V3(), r: 0, leg: false }); F.bpos(a, c.a); F.bpos(b, c.b); c.r = r; c.leg = leg; };
  put(0, 'CC_Base_Head', 'CC_Base_Head', 0.13, false);
  put(1, 'CC_Base_Pelvis', 'CC_Base_Spine02', 0.155, false);
  put(2, 'CC_Base_L_Thigh', 'CC_Base_L_Calf', 0.085, true); put(3, 'CC_Base_R_Thigh', 'CC_Base_R_Calf', 0.085, true);
  put(4, 'CC_Base_L_Calf', 'CC_Base_L_Foot', 0.058, true); put(5, 'CC_Base_R_Calf', 'CC_Base_R_Foot', 0.058, true);
  put(6, 'CC_Base_L_Foot', 'CC_Base_L_ToeBase', 0.06, true); put(7, 'CC_Base_R_Foot', 'CC_Base_R_ToeBase', 0.06, true);
  return C;
}
function jrInitRope() {   // start already turning: the strand as a circular arc in a plane through the tip axis —
  const tips = jrTips();   // arc length = LEN exactly, bulge up; every point gets the exact rigid CW velocity of that turn
  const A = tips[0], B = tips[1], N = JR.N;
  const cl = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) || 0.62;
  let rho = 0.5;   // ρ·β = LEN and 2ρ·sin(β/2) = chord — Newton on ρ (β/2 > π/2: the centre sits on the bulge side)
  for (let it = 0; it < 6; it++) {
    const u = Math.min(JR.LEN / (2 * rho), 3.1), f = 2 * rho * Math.sin(u) - cl;
    rho = clamp(rho - f / (2 * Math.sin(u) - Math.cos(u) * JR.LEN / rho || 1), 0.25, 1.5);
  }
  const half = Math.min(JR.LEN / (2 * rho), 3.1), bH = rho * Math.abs(Math.cos(half));
  const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2 + bH, cz = (A.z + B.z) / 2;   // bulge direction: straight up
  const w = JR.om, h = 1 / 120;
  for (let i = 0; i <= N; i++) {
    const al = -half + (i / N) * 2 * half, k = i * 3;
    const rad = rho * (Math.cos(al) + Math.abs(Math.cos(half)));   // distance from the tip axis (0 at the pins, max at the bulge)
    JR.p[k] = cx; JR.p[k + 1] = cy + rad; JR.p[k + 2] = cz + Math.sin(al) * rho;
    const vx = w * rad, vy = 0;   // rigid CW turn: v = ω·(ry, −rx), here ry = rad, rx = 0
    JR.o[k] = JR.p[k] - vx * h; JR.o[k + 1] = JR.p[k + 1] - vy * h; JR.o[k + 2] = JR.p[k + 2];
  }
  // shape memory: chords of the ideal arc between points 4 / 8 / 18 apart — a spun rope is stiff; these keep the
  // loop's silhouette (and give the wind-up something to gather back into). Released while the rope snags or falls.
  const br = JR.brace, q = JR.p; br.length = 0;
  for (const skip of [4, 8, 18]) for (let i = 0; i + skip <= N; i++) {
    const k = i * 3, m = (i + skip) * 3;
    br.push(i, i + skip, Math.hypot(q[m] - q[k], q[m + 1] - q[k + 1], q[m + 2] - q[k + 2]));
  }
}
function jrTips(out) {   // rope exit points: hand bone + handle length along the handle axis; the wrist cranks the
  const F = P1, o = out || (JR.tip = JR.tip || [new V3(), new V3()]);   // handle's tilt with the turn — this is what anchors the loop's phase
  const tau = 0.35 * Math.cos(JR.ph);   // the handle pitches ±20° in the sweep plane, in phase with the crank
  for (let i = 0; i < 2; i++) {
    const s = i ? 'R' : 'L', H = F.bones[`CC_Base_${s}_Hand`], sd = i ? -1 : 1;
    _jv1.setFromMatrixPosition(H.matrixWorld);
    _jv2.set(sd * 0.1, Math.sin(tau), Math.cos(tau)).normalize().transformDirection(F.group.matrixWorld);   // forward, a little outward, tilting with the crank
    o[i].copy(_jv1).addScaledVector(_jv2, JR.hnd[i].len);
  }
  return o;
}
function jrStep(dt, tips) {
  const A = tips[0], B = tips[1];
  const axx = B.x - A.x, axy = B.y - A.y, al = Math.hypot(axx, axy) || 1, ux = axx / al, uy = axy / al;   // tip axis in the sweep plane
  JR.hitLeg = 0;
  const sub = 2, h = dt / sub, seg = JR.seg, N = JR.N, p = JR.p, o = JR.o, g = 9.8;
  const fric = JR.st === 'spin' ? 0.12 : 0.35;   // tangential floor friction: the slap slides (a sticky floor kills the turn)
  const col = jrColliders(), br = JR.brace, brOn = JR.st === 'spin' || JR.st === 'wind';
  for (let ss = 0; ss < sub; ss++) {
    // integrate (the loop's outward bulge is not forced: the drag field makes each point need ω²r of pull,
    // and the rope's own tension supplies it — the shape comes out of the dynamics)
    for (let i = 1; i < N; i++) { const k = i * 3;
      const vx = (p[k] - o[k]) * 0.995, vy = (p[k + 1] - o[k + 1]) * 0.995, vz = (p[k + 2] - o[k + 2]) * 0.995;
      o[k] = p[k]; o[k + 1] = p[k + 1]; o[k + 2] = p[k + 2];
      p[k] += vx; p[k + 1] += vy - g * h * h; p[k + 2] += vz;
    }
    // co-rotation drag: the crank can't spin a slack strand up on its own — relax each point's sweep velocity
    // toward the rigid turn field (10/s; winds the rope up after a fall, keeps the turn steady, damps the flail).
    // o is a POSITION offset (v = Δp/h), so a λ/s velocity relaxation is an o-nudge of λ·h²·error — not λ·h!
    const wD = JR.om * (JR.st === 'spin' ? 1 : JR.st === 'wind' ? sstep(0, 1, JR.stT / 1.1) : 0);
    const dg = 10 * h * h;
    if (wD > 0.01) for (let i = 1; i < N; i++) { const k = i * 3;
      const rx = p[k] - A.x, ry = p[k + 1] - A.y, vx = (p[k] - o[k]) / h, vy = (p[k + 1] - o[k + 1]) / h;
      o[k] -= clamp(wD * ry - vx, -8, 8) * dg; o[k + 1] -= clamp(-wD * rx - vy, -8, 8) * dg;
    }
    // constraints
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < N; i++) { const k = i * 3, m = k + 3;
        let dx = p[m] - p[k], dy = p[m + 1] - p[k + 1], dz = p[m + 2] - p[k + 2];
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, f = (l - seg) / l;
        const w0 = i === 0 ? 0 : 1, w1 = i === N - 1 ? 0 : 1, W = w0 + w1 || 1;
        p[k] += dx * f * 0.5 * w0 / W * 2; p[k + 1] += dy * f * 0.5 * w0 / W * 2; p[k + 2] += dz * f * 0.5 * w0 / W * 2;
        p[m] -= dx * f * 0.5 * w1 / W * 2; p[m + 1] -= dy * f * 0.5 * w1 / W * 2; p[m + 2] -= dz * f * 0.5 * w1 / W * 2;
      }
      if (brOn) for (let b = 0; b < br.length; b += 3) {   // shape memory: chords of the ideal loop (skip 4/8/18) hold the arc
        const i = br[b], j = br[b + 1], k = i * 3, m = j * 3;
        let dx = p[m] - p[k], dy = p[m + 1] - p[k + 1], dz = p[m + 2] - p[k + 2];
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, f = (l - br[b + 2]) / l * 0.35;
        const w0 = i === 0 ? 0 : 1, w1 = j === N ? 0 : 1, W = w0 + w1 || 1;
        p[k] += dx * f * 0.5 * w0 / W * 2; p[k + 1] += dy * f * 0.5 * w0 / W * 2; p[k + 2] += dz * f * 0.5 * w0 / W * 2;
        p[m] -= dx * f * 0.5 * w1 / W * 2; p[m + 1] -= dy * f * 0.5 * w1 / W * 2; p[m + 2] -= dz * f * 0.5 * w1 / W * 2;
      }
      for (let i = 0; i < N - 1; i++) {   // weak bending: 2nd neighbours pulled toward straight
        const k = i * 3, m = k + 6;
        let dx = p[m] - p[k], dy = p[m + 1] - p[k + 1], dz = p[m + 2] - p[k + 2];
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, f = (l - 2 * seg) / l * 0.06;
        if (i > 0) { p[k] += dx * f * 0.5; p[k + 1] += dy * f * 0.5; p[k + 2] += dz * f * 0.5; }
        if (i < N - 2) { p[m] -= dx * f * 0.5; p[m + 1] -= dy * f * 0.5; p[m + 2] -= dz * f * 0.5; }
      }
      p[0] = A.x; p[1] = A.y; p[2] = A.z; p[N * 3] = B.x; p[N * 3 + 1] = B.y; p[N * 3 + 2] = B.z;   // pins
    }
    // floor + body
    for (let i = 1; i < N; i++) { const k = i * 3;
      if (p[k + 1] < JR.floorY + JR.RR) {
        p[k + 1] = JR.floorY + JR.RR;
        o[k] = p[k] - (p[k] - o[k]) * fric; o[k + 2] = p[k + 2] - (p[k + 2] - o[k + 2]) * fric;   // tangential friction, the slap slides
      }
      for (let c = 0; c < col.length; c++) {
        const C = col[c], abx = C.b.x - C.a.x, aby = C.b.y - C.a.y, abz = C.b.z - C.a.z;
        const ap = abx * abx + aby * aby + abz * abz || 1e-6;
        const t = clamp(((p[k] - C.a.x) * abx + (p[k + 1] - C.a.y) * aby + (p[k + 2] - C.a.z) * abz) / ap, 0, 1);
        const cx = C.a.x + abx * t, cy = C.a.y + aby * t, cz = C.a.z + abz * t;
        let dx = p[k] - cx, dy = p[k + 1] - cy, dz = p[k + 2] - cz;
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz), need = C.r + JR.RR;
        if (l < need && l > 1e-6) {
          const push = (need - l) / l; p[k] += dx * push; p[k + 1] += dy * push; p[k + 2] += dz * push;
          o[k] = p[k] - (p[k] - o[k]) * 0.35; o[k + 1] = p[k + 1] - (p[k + 1] - o[k + 1]) * 0.35; o[k + 2] = p[k + 2] - (p[k + 2] - o[k + 2]) * 0.35;
          if (C.leg && JR.st === 'spin' && JR.t > JR.noSnagUntil && push * l > 0.018) {
            JR.hitLeg = 1; JR.hitC = c; JR.hitPt = _jv3.set(p[k], p[k + 1], p[k + 2]); JR.hitCap = _jv4.set(cx, cy, cz); JR.hitPush = push * l;   // a deep hit on a leg at speed = the catch
          }
        }
      }
    }
  }
  // measured turn rate: the angle of the strand's mid point (the bulge when taut), unwrapped, low-passed
  const bk = (N >> 1) * 3, th = Math.atan2(p[bk + 1] - A.y, p[bk] - A.x);
  if (JR.t > 0.05) { let d = th - JR.thPrev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    JR.omM += ((dt > 0 ? -d / dt : 0) - JR.omM) * 0.25; }
  JR.thPrev = th;
  return tips;
}

/* ── the brain: state machine, hop trigger ── */
function jrBrain(dt, tips) {
  JR.stT += dt;
  const N = JR.N, p = JR.p, o = JR.o, fx = (JR.fL.x + JR.fR.x) / 2;
  // lowest strand point away from the handles; the bulge (farthest from the tip axis) and its angle about it
  let lo = 1e9, li = 0, maxD = 0, thB = JR.bulbPrev;
  const A = tips[0], B = tips[1], axx = B.x - A.x, axy = B.y - A.y, al = Math.hypot(axx, axy) || 1, ux = axx / al, uy = axy / al;
  for (let i = 4; i <= N - 4; i++) { const k = i * 3; if (p[k + 1] < lo) { lo = p[k + 1]; li = i; }
    const rx = p[k] - A.x, ry = p[k + 1] - A.y, dpar = rx * ux + ry * uy, dx = rx - dpar * ux, dy = ry - dpar * uy;
    const d2 = dx * dx + dy * dy; if (d2 > maxD) { maxD = d2; thB = Math.atan2(ry, rx); } }
  maxD = Math.sqrt(maxD);
  if (JR.st === 'spin') {
    JR.ph -= JR.om * dt;   // the crank runs backwards: at the bottom of the circle the tip moves −x, front → under the feet
    if (JR.hitLeg) { JR.st = 'snag'; JR.stT = 0; JR.wantMiss = false; JR.armed = true; JR.snagY = lo; return; }
    // hop trigger: the measured bulge descending toward the toes — the jump starts ~0.16 s before the sweep reaches them
    const TRIG = -Math.PI / 2 + 1.5;
    const cross = JR.bulbPrev > TRIG && thB <= TRIG && JR.bulbPrev - thB < 1.2;
    if (JR.armed && JR.t - JR.hopT > 0.45 && cross && maxD > 0.72 && Math.abs(JR.omM) > 4) {
      if (JR.wantMiss) { JR.wantMiss = false; JR.armed = false; }   // one skipped jump: the feet stay planted, the rope catches them
      else JR.hopT = JR.t;
    }
    JR.bulbPrev = thB;
    if (!JR.armed && thB > 1.0) JR.armed = true;   // the rope is back over the head: ready to skip or to miss again
  } else if (JR.st === 'snag') {
    JR.ph -= JR.om * dt * Math.max(0, 1 - JR.stT / 0.25);   // the crank dies
    if (JR.stT > 0.55) { JR.st = 'fall'; JR.stT = 0; }
  } else if (JR.st === 'fall') {
    if (JR.stT > 0.85) { JR.st = 'wind'; JR.stT = 0; }
  } else if (JR.st === 'wind') {
    const k = sstep(0, 1, JR.stT / 1.1); JR.ph -= JR.om * k * k * dt;
    // hand the turn over to 'spin' once the loop really rotates; a short no-snag grace lets the first down-sweep become a jump
    if ((JR.stT > 1.25 && JR.omM > 0.6 * JR.om) || JR.stT > 3.5) { JR.st = 'spin'; JR.stT = 0; JR.armed = true; JR.bulbPrev = thB; JR.noSnagUntil = JR.t + 0.35; }
  }
}

/* ── render: handles on the fists, the cable tube along the strand ── */
function jrRender(tips) {
  const F = P1, p = JR.p, N = JR.N, S = 8, pos = JR.geo.attributes.position.array, nor = JR.geo.attributes.normal.array;
  // handles
  for (let i = 0; i < 2; i++) {
    const s = i ? 'R' : 'L', H = F.bones[`CC_Base_${s}_Hand`], h = JR.hnd[i];
    h.g.position.setFromMatrixPosition(H.matrixWorld);
    _jv1.set(i ? -0.1 : 0.1, 0, 1).normalize().transformDirection(F.group.matrixWorld);   // handle axis: forward (group +z), a little outward
    _jq1.setFromUnitVectors(_jv2.set(0, 1, 0), _jv1); h.g.quaternion.copy(_jq1); h.g.visible = true;
  }
  // tube rings: parallel-transport frames along the strand
  for (let i = 0; i <= N; i++) { const k = i * 3, a = Math.max(0, i - 1) * 3, b = Math.min(N, i + 1) * 3;
    let tx = p[b] - p[a], ty = p[b + 1] - p[a + 1], tz = p[b + 2] - p[a + 2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1; JR.tan[i * 3] = tx / tl; JR.tan[i * 3 + 1] = ty / tl; JR.tan[i * 3 + 2] = tz / tl; }
  let nx = 0, ny = 0, nz = 1, dot = JR.tan[2];   // first normal ⊥ first tangent (fallback axis z)
  if (Math.abs(dot) > 0.9) { nx = 1; ny = 0; nz = 0; }
  { const d = nx * JR.tan[0] + ny * JR.tan[1] + nz * JR.tan[2]; nx -= d * JR.tan[0]; ny -= d * JR.tan[1]; nz -= d * JR.tan[2];
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= l; ny /= l; nz /= l; }
  const q = _jq3, tv = _jv1, from = _jv2, to = _jv3;
  for (let i = 0; i <= N; i++) {
    if (i > 0) { from.set(JR.tan[(i - 1) * 3], JR.tan[(i - 1) * 3 + 1], JR.tan[(i - 1) * 3 + 2]); to.set(JR.tan[i * 3], JR.tan[i * 3 + 1], JR.tan[i * 3 + 2]);
      q.setFromUnitVectors(from, to); _jv4.set(nx, ny, nz).applyQuaternion(q); nx = _jv4.x; ny = _jv4.y; nz = _jv4.z; }
    const bx = JR.tan[i * 3], by = JR.tan[i * 3 + 1], bz = JR.tan[i * 3 + 2], sx = ny * bz - nz * by, sy = nz * bx - nx * bz, sz = nx * by - ny * bx;
    const k0 = i * S * 3;
    for (let s = 0; s < S; s++) { const a = s / S * Math.PI * 2, ca = Math.cos(a) * JR.RR, sa = Math.sin(a) * JR.RR, k = k0 + s * 3;
      pos[k] = p[i * 3] + nx * ca + sx * sa; pos[k + 1] = p[i * 3 + 1] + ny * ca + sy * sa; pos[k + 2] = p[i * 3 + 2] + nz * ca + sz * sa;
      nor[k] = nx * Math.cos(a) + sx * Math.sin(a); nor[k + 1] = ny * Math.cos(a) + sy * Math.sin(a); nor[k + 2] = nz * Math.cos(a) + sz * Math.sin(a); }
  }
  JR.geo.attributes.position.needsUpdate = true; JR.geo.attributes.normal.needsUpdate = true; JR.geo.computeBoundingSphere();
}

/* ── API ── */
function jrStart() {
  if (!JR.grp) jrBuild();
  G.mode = 'bag'; G.round = 0; G.paused = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; G.shake = 0;
  setLocation('boxgym');            // BAG.on is still false here: the ring first, then the mat
  BAG.on = true; LOC.place(true); LOC.bagRig.visible = false; BAG.g.visible = false;
  showP2(false); uiShow(null); show('hud', false); show('pad', false); show('vs', false); show('result', false); show('rec', false);
  P1.resetState(); P2.resetState(); P1.slide = null;
  JR.on = true; JR.st = 'spin'; JR.t = 0; JR.stT = 0; JR.hopT = -9; JR.wantMiss = false; JR.armed = true; JR.blend = 0; JR.ph = 0; JR.omM = JR.om; JR.cap = false; JR.needInit = true; JR.noSnagUntil = 0.8; JR.bulbPrev = Math.PI / 2;
  jrCapture();
  JR.grp.visible = true; camCut = true; msg('Скакалка'); sfx.clap();
}
function jrStop() { JR.on = false; JR.st = 'off'; if (JR.grp) JR.grp.visible = false; toMenu(); }
function jrMiss() { if (JR.on && JR.st === 'spin') JR.wantMiss = true; }
window.__rope = { start: jrStart, stop: jrStop, miss: jrMiss, get: () => JR };

/* ── per frame (called from frame() after the fighters simulate) ── */
function jumpRopeTick(dt) {
  if (!JR.on) return;
  BAG.g.visible = false; if (LOC.bagRig) LOC.bagRig.visible = false;   // the drill mat, no bag
  jrPose(dt);
  if (JR.needInit && JR.blend > 0.9) { jrInitRope(); JR.needInit = false; }   // init the strand once the hands are down at the hips
  const tips = jrTips();
  if (dt > 0) { JR.t += dt; jrStep(dt, tips); if (!JR.needInit) jrBrain(dt, tips); }
  jrRender(tips);
}
