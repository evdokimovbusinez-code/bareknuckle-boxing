/* ───────── the coach's focus mitts (лапы тренера): a drill for the future combo mini-game ─────────
   P2 becomes the coach: bare hands, a focus mitt on each hand, holding them for P1. Three presentations
   (hold 'jab' — a pad straight in front of the face, 'cross' — the second pad, 'hook' — pads turned sideways);
   a landed punch snaps the pad and the coach's forearm back on a damped spring and slaps (sfx.mitt), a missed
   punch gets no response. The judge drives it through window.__mitts = { start, stop, hold, hit }.
   Hooks in other files: 07_state_replay_hits.js (aimFor / contactTest / resolveHit), 05_fighter.js (the
   near-miss test in tick), 08_ai_flow.js (ai: the coach is no opponent), 11_arena_loop.js (mittsTick after
   armClear), 06_fx_sound.js (sfx.mitt). */
const MITTS = {
  on: false, hold: 'jab', powMul: 1, m: null, look0: null, style0: null,
  score: 0, hits: 0, combo: 0, lastT: -9, uRip: { value: 0 }, uRipT: { value: 0 },
};
const MITT_A = 0.105, MITT_B = 0.12;   // the striking face: half-width / half-height (m)
/* scratch of the mitts module (never _v1…_v6: ik() owns those) */
const _mA = new V3(), _mB = new V3(), _mC = new V3(), _mT = new V3(), _mM = new M4(), _mM2 = new M4(), _mQ = new Quat(), _mQ2 = new Quat();
const MITT_ONE = new V3(1, 1, 1), MITT_X = new V3(1, 0, 0);

/* ── the model: one pad geometry shared by both hands, built in the pad's own frame: origin at the centre of the
   striking face, +z = its normal (toward the puncher), +y = up along the pad. ≈ 25 × 22 × 9 cm, a domed face with a
   painted target, a rolled stitched rim, a curved shell back to the wrist hole, a cuff and a grip ridge ── */
const mittEdge = (t, s, o) => {   // the superellipse rim of the face at radius factor t (angle s·2π) → o.x, o.y
  const c = Math.cos(s * 2 * Math.PI), sn = Math.sin(s * 2 * Math.PI), p = 2 / 3;
  o.set(Math.sign(c) * Math.pow(Math.abs(c), p) * MITT_A * t, Math.sign(sn) * Math.pow(Math.abs(sn), p) * MITT_B * t, 0);
  return o;
};
const mittFaceZ = rx => 0.022 * (1 - Math.pow(clamp(rx, 0, 1), 1.7));   // the face domes a little toward the puncher
function mittFaceGeo() {
  const e = new V3();
  const g = gridGeo((u, v, o) => { mittEdge(v, u, e); o.set(e.x, e.y, mittFaceZ(v)); }, 44, 12, { c: new V3(0, 0, -0.4) });
  const p = g.attributes.position, uv = g.attributes.uv;   // cartesian uv: the target ring is painted in place
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / (MITT_A * 2) + 0.5, p.getY(i) / (MITT_B * 2) + 0.5);
  return g;
}
function mittBackGeo() {
  const e = new V3(), w = new V3();
  const shell = gridGeo((u, v, o) => {   // the face rim curves back and closes onto the wrist hole
    const k = sstep(0, 1, v), bulge = 1 + 0.15 * Math.sin(Math.PI * k);
    mittEdge(1, u, e); mittEdge(0.52, u, w);
    o.set(lerp(e.x, w.x, k) * bulge, lerp(e.y, w.y, k) * bulge, -0.004 - k * 0.07 - 0.014 * Math.sin(Math.PI * k));
  }, 44, 10, { c: new V3(0, 0, -0.05) });
  const rim = pipeGeo([0, 0.06, 0.13, 0.19, 0.25, 0.31, 0.38, 0.44, 0.5, 0.56, 0.63, 0.69, 0.75, 0.81, 0.88, 0.94, 1].map(s => mittEdge(1, s, new V3()).setZ(-0.004)), 0.017, true);
  const cuff = pipeGeo([0, 0.08, 0.17, 0.25, 0.33, 0.42, 0.5, 0.58, 0.67, 0.75, 0.83, 0.92, 1].map(s => mittEdge(0.55, s, new V3()).setZ(-0.088)), 0.011, true);
  const ridge = pipeGeo([new V3(0, 0.05, -0.08), new V3(0, 0.1, -0.066), new V3(0, 0.122, -0.002)], 0.011, false);   // grip ridge over the top (outside the shell)
  const strap = pipeGeo([new V3(0, -0.08, -0.074), new V3(0, -0.04, -0.095), new V3(0, 0.012, -0.098)], 0.01, false);   // strap across the wrist hole
  const withCol = g => { const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  return mergeGeos([shell, withCol(rim), withCol(cuff), withCol(ridge), withCol(strap)]);
}
function mittFaceTex() {
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#a12019'; c.fillRect(0, 0, w, h);   // worn red leather
    for (let i = 0; i < 550; i++) { const x = rr() * w, y = rr() * h, r = 3 + rr() * 10, g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rr() < 0.5 ? 'rgba(58,10,8,0.12)' : 'rgba(224,96,74,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); }
    const cx = w / 2, cy = h / 2, R = w * 0.155;   // the target ring, scuffed by years of knuckles
    c.strokeStyle = 'rgba(238,232,220,0.92)'; c.lineWidth = w * 0.035; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
    c.fillStyle = 'rgba(238,232,220,0.92)'; c.beginPath(); c.arc(cx, cy, w * 0.028, 0, 7); c.fill();
    for (let i = 0; i < 140; i++) { const a = rr() * 7, d = R * (0.1 + rr() * 1.2); c.fillStyle = `rgba(30,8,6,${0.05 + rr() * 0.16})`;
      c.beginPath(); c.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + rr() * 9, 2 + rr() * 6, rr() * 3, 0, 7); c.fill(); }
    const vg = c.createRadialGradient(cx, cy, w * 0.28, cx, cy, w * 0.52);   // darkened toward the rim
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(18,4,3,0.5)'); c.fillStyle = vg; c.fillRect(0, 0, w, h);
  });
}
function mittBuild() {
  if (MITTS.m) return;
  const face = mittFaceGeo(), back = mittBackGeo();
  const matF = new THREE.MeshPhysicalMaterial({ map: mittFaceTex(), normalMap: leatherNormal(), normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.52, clearcoat: 0.3, clearcoatRoughness: 0.5, vertexColors: true });
  matF.onBeforeCompile = s => {   // the face shivers for a moment after a slap (uRip → a radial ripple along the normal)
    s.uniforms.uRip = MITTS.uRip; s.uniforms.uRipT = MITTS.uRipT;
    s.vertexShader = 'uniform float uRip;\nuniform float uRipT;\n' + s.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n float mR = 1.0 - smoothstep(0.035, 0.13, length(position.xy));\n transformed += normal * uRip * mR * sin(30.0 * length(position.xy) - uRipT);');
  };
  const matB = leatherMat('#1a1b20');
  MITTS.m = [0, 1].map(() => {
    const f = new THREE.Mesh(face, matF), b = new THREE.Mesh(back, matB);
    for (const o of [f, b]) { o.matrixAutoUpdate = false; o.frustumCulled = false; o.visible = false; scene.add(o); }
    return { f, b, pos: new V3(0, 1.6, 0.5), quat: new Quat(), tp: new V3(0, 1.6, 0.5), tq: new Quat(), sx: { x: 0, v: 0 }, sa: { x: 0, v: 0 }, rip: 0, wm: new M4(), wr: new M4(), wc: new V3(), wn: new V3(0, 0, 1) };
  });
}
/* ── the holds: pad poses in the coach's model space (+z forward = toward P1, +y up). 'jab': the left pad straight in
   front of the face, the right one tucked; 'cross': the reverse; 'hook': both pads out to the sides and turned along
   the arc a hook comes in on (P1's left is on the coach's right) ── */
const MITT_QF = new Quat();   // the straight presentation
const mittHookQ = s => new Quat().setFromAxisAngle(new V3(0, 1, 0), 0.55 * s).multiply(new Quat().setFromAxisAngle(new V3(0, 0, 1), 0.26 * s));
const MITT_HOLD = {
  jab: { p: [[0, 1.6, 0.48], [0.06, 1.35, 0.29]] },
  cross: { p: [[-0.05, 1.35, 0.29], [0, 1.57, 0.47]] },
  hook: { p: [[-0.15, 1.4, 0.42], [0.15, 1.4, 0.42]], hook: 1 },
};
function mittHold(kind) {
  if (!MITTS.on || !MITTS.m || !MITT_HOLD[kind]) return;
  MITTS.hold = kind;
  const H = MITT_HOLD[kind];
  for (let i = 0; i < 2; i++) {
    const m = MITTS.m[i];
    m.tp.set(H.p[i][0], H.p[i][1], H.p[i][2]);
    m.tq.copy(H.hook ? mittHookQ(i ? 1 : -1) : MITT_QF);
  }
}
const mittFor = name => {   // the pad a punch is thrown at: the presented one; hooks go to the pad on their own side
  if (!MITTS.m) return null;
  if (MITTS.hold === 'hook') { const P = PUNCH[name]; return MITTS.m[P && P.arm === 'L' ? 1 : 0]; }
  return MITTS.m[MITTS.hold === 'cross' ? 1 : 0];
};
/* ── the punch is thrown at the pad ── */
function mittAim(att) {
  const m = mittFor(att.cur); if (!m) return null;
  const P = PUNCH[att.cur];
  att.aimV.copy(m.wc).addScaledVector(m.wn, 0.018 + (att.gear.spar ? 0.06 : 0));   // a knuckle's depth into the pad
  if (P.type === 'over') att.aimV.y += 0.24 * (1 - clamp((att.act[att.cur].time - P.impact + 0.16) / 0.16, 0, 1));   // loops over the top onto it
  if (P.type === 'upper') att.aimV.y -= 0.05;
  return att.aimV;
}
function mittContact(att) {   // the knuckles are on a pad: the point of contact (a new vector) or null
  const kn = att.knuckle(_mA); let best = null, bd = 1;
  for (const m of MITTS.m) {
    const l = _mB.copy(kn).applyMatrix4(m.wr), rx = l.x / (MITT_A * 1.06), ry = l.y / (MITT_B * 1.06);
    if (rx * rx + ry * ry > 1 || l.z < -0.05 || l.z > 0.07) continue;
    const d = Math.abs(l.z - 0.01); if (d < bd) { bd = d;
      best = _mC.set(l.x, l.y, mittFaceZ(Math.hypot(l.x / MITT_A, l.y / MITT_B))).applyMatrix4(m.wm).clone(); }
  }
  return best;
}
function mittMiss(att) {   // how far the knuckles still are in front of the presented pad's face (m)
  const m = mittFor(att.cur); if (!m) return 9;
  const l = _mA.copy(att.knuckle(_mB)).applyMatrix4(m.wr), rx = l.x / (MITT_A * 1.4), ry = l.y / (MITT_B * 1.4);
  return rx * rx + ry * ry > 1 ? 9 : Math.max(0, l.z - 0.05);
}
/* ── the response: the pad and the coach's forearm give on a damped spring, the face of the pad shivers, a dry slap ── */
const mittSpr = (s, dt, k, c) => { s.v += (-k * s.x - c * s.v) * dt; s.x += s.v * dt; };
function mittHit(att, name, contact) {
  const P = PUNCH[name], m = contact ? null : mittFor(name);
  let pad = m, bd = 1;
  if (contact) for (const x of MITTS.m) { const d = x.wc.distanceTo(contact); if (d < bd) { bd = d; pad = x; } }
  if (!pad) return;
  const dmg = P.dmg * (att.dmgMul || 1) * (1 + 0.06 * SK(att, 'pow')) * (att.sig && sigOf(name) === att.sig ? 1.12 : 1) * (att.punchK ?? 1) * (att.counterUntil > G.t ? 1.5 : 1); att.counterUntil = 0;
  const power = clamp(dmg / 18, 0.2, 1.6);
  pad.sx.v += 1.3 + 2.4 * power;   // the pad is driven back toward the coach (m/s into the spring)
  pad.sa.v += P.type === 'hook' ? (P.arm === 'L' ? 1 : -1) * (0.8 + 1.0 * power) : P.type === 'upper' ? -(0.5 + 0.6 * power) : 0.2 + 0.3 * power;
  pad.rip = Math.min(0.006, 0.0016 + 0.0035 * power);
  sfx.mitt(power);
  MITTS.combo = G.t - MITTS.lastT < 0.95 ? MITTS.combo + 1 : 1; MITTS.lastT = G.t;
  const pts = Math.round(10 * power * (1 + 0.15 * (MITTS.combo - 1))); MITTS.score += pts; MITTS.hits++;
  att.lastLand = G.t; att.whiff = false; if (att.fs) att.fs.land++;
  G.hitstop = 0.008 + 0.014 * power; G.shake = Math.max(G.shake, 0.005 + 0.012 * power);
  const pos = contact || pad.wc.clone();
  popup(pos, MITTS.combo > 1 ? `${pts} ×${MITTS.combo}` : String(pts), MITTS.combo >= 4 ? 'crit' : 'hit');
  if (MITTS.combo === 4 || MITTS.combo === 7) msg('Серия ×' + MITTS.combo);
  const sl = $('st2'); if (sl) sl.textContent = 'очки ' + MITTS.score;
}
/* ── per frame: the coach keeps his arms under the pads (IK over the cleared arms), the pads ride their springs ── */
function mittsTick(dt) {
  if (!MITTS.on || !P2 || !MITTS.m || (G.state !== 'fight' && G.state !== 'intro')) return;
  if (G.state === 'fight') G.roundT = Math.max(G.roundT, 90);   // the drill has no bell
  /* the coach: bare hands in the pads — uGlv 2 hides only the palm band (as under an MMA glove), so the forearm
     runs visibly into the cuff and the fist stays inside the cup; wraps and gloves are off */
  P2.flesh.u.uGlv.value = 2; P2.wrapMesh.visible = false;
  for (const t of P2.tails) t.mesh.visible = false;
  const g = P2.gear;
  if (g.gloves) for (const x of g.gloves) x.g.visible = false;
  if (g.hg) g.hg.visible = false;
  if (g.mma) { g.mma.visible = false; for (const p of g.mmaPads || []) p.m.visible = false; }
  /* hold blending + springs */
  const k = 1 - Math.exp(-Math.max(dt, 1 / 120) * 7);
  for (const m of MITTS.m) { m.pos.lerp(m.tp, k); m.quat.slerp(m.tq, k); if (dt > 0) { mittSpr(m.sx, dt, 360, 17); mittSpr(m.sa, dt, 240, 13); m.rip *= Math.exp(-dt * 13); } }
  MITTS.uRip.value = Math.max(MITTS.m[0].rip, MITTS.m[1].rip);
  if (MITTS.uRip.value > 1e-4) MITTS.uRipT.value += dt * 30;
  /* the wrist sits deep in the cup behind the face; the recoil pushes the wrist half as far as the pad (the padding gives) */
  for (let i = 0; i < 2; i++) {
    const m = MITTS.m[i], n = _mA.set(0, 0, 1).applyQuaternion(m.quat), up = _mB.set(0, 1, 0).applyQuaternion(m.quat);
    _mT.copy(m.pos).addScaledVector(n, -(0.11 + 0.5 * m.sx.x)).addScaledVector(up, -0.02);
    P2.ik(MITTS.lb[i ? 'R' : 'L'].upper, MITTS.lb[i ? 'R' : 'L'].fore, MITTS.lb[i ? 'R' : 'L'].hand, _mT);
  }
  /* model pose → world: the pads carry the springs (the group matrix is fresh from P2.update) */
  for (const m of MITTS.m) {
    const n = _mA.set(0, 0, 1).applyQuaternion(m.quat);
    _mQ.copy(m.quat).multiply(_mQ2.setFromAxisAngle(MITT_X, m.sa.x));
    _mC.copy(m.pos).addScaledVector(n, -m.sx.x);
    m.wm.compose(_mC, _mQ, MITT_ONE).premultiply(P2.group.matrixWorld);
    m.wr.copy(m.wm).invert();
    m.f.matrix.copy(m.wm); m.f.matrixWorldNeedsUpdate = true;
    m.b.matrix.copy(m.wm); m.b.matrixWorldNeedsUpdate = true;
    m.wc.set(0, 0, 0).applyMatrix4(m.wm);
    m.wn.copy(n).transformDirection(P2.group.matrixWorld);
  }
}
/* ── the drill itself ── */
const MITTS_LOOK = { top: { id: 'tank', color: 'white' }, bottom: { id: 'shorts', color: 'black' }, shoes: { id: 'none' }, head: { id: 'none' }, eyes: { id: 'none' }, belt: { id: 'none' }, hands: { id: 'wraps', color: 'black' }, street: false };
function mittsStart() {
  if (!P2 || MITTS.on) return;
  MITTS.mode0 = G.mode; G.mode = 'mitts'; if (G.diff !== G.userDiff && G.userDiff) G.diff = G.userDiff;
  const c0 = OPT.cine; OPT.cine = false; startFight(true); OPT.cine = c0;   // no stare-down for a drill
  MITTS.on = true;
  MITTS.look0 = P2.gear.look; P2.applyLook(MITTS_LOOK);   // the coach: a tank top and trunks, bare feet on the canvas
  MITTS.style0 = AI.style; AI.style = Object.assign({}, AI.style, { adv: -0.29 });   // he holds the pads just inside P1's reach (footwork keeps ≈ 1.42 m)
  MITTS.lb = P2.limbs();
  mittBuild();
  for (const m of MITTS.m) m.f.visible = m.b.visible = true;
  mittHold(MITTS.hold || 'jab');
  for (const m of MITTS.m) { m.pos.copy(m.tp); m.quat.copy(m.tq); }   // no blend-in from wherever the idle arms were
  Object.assign(MITTS, { score: 0, hits: 0, combo: 0, lastT: -9 });
  $('n2').textContent = 'Тренер'; const sl = $('st2'); if (sl) sl.textContent = 'лапы';
  $('diffl').textContent = 'ТРЕНИРОВКА'; G.roundT = 90;
  G.stareT = 0; G.stare = 0; G.stareOn = false; G.introT = 5;   // straight to the pads
}
function mittsStop() {
  if (!MITTS.on) return; MITTS.on = false;
  if (MITTS.m) for (const m of MITTS.m) m.f.visible = m.b.visible = false;
  if (MITTS.style0) AI.style = MITTS.style0;
  toMenu();
  if (MITTS.mode0 != null) { G.mode = MITTS.mode0; MITTS.mode0 = null; }
  if (MITTS.look0) { P2.applyLook(MITTS.look0); MITTS.look0 = null; }
  P2.flesh.u.uGlv.value = 0;
}
function mittsHit(side, power = 1) {   // a real game punch at the presented pad
  if (!MITTS.on) return;
  if (G.state !== 'fight') { G.stareT = 0; G.introT = 5; }   // still in «Готовься»: skip it
  if (Q.length > 2) return;
  MITTS.powMul = clamp(+power || 1, 0.15, 1.6);
  const name = PUNCH[side] ? side : side === 'L' ? 'jab' : 'cross';
  Q.push({ type: 'punch', name, at: G.real, body: false, pow: MITTS.powMul > 0.8 });
}
window.__mitts = {
  start: mittsStart, stop: mittsStop, hold: mittHold, hit: mittsHit,
  dbg: () => MITTS.m && MITTS.m.map(m => ({ p: m.wc.toArray().map(v => +v.toFixed(3)), n: m.wn.toArray().map(v => +v.toFixed(3)) })),
  s: () => ({ score: MITTS.score, hits: MITTS.hits, combo: MITTS.combo }),   // the drill score
};
