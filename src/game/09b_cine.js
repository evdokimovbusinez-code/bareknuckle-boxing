/* ───────── ring cinematics ─────────
   1. the stare-down before the first round (G.stareT, state 'intro' while 0 ≤ G.introT < G.stareT): both men walk in until their heads are
      ~0.35 m apart, lean in, hold each other's eyes (Face), one half-smiles / nods; the camera pushes in on the pair in profile, then the
      eyes of one, then of the other; the crowd rumbles louder; then they walk back and the usual «Готовься» follows. Any key / tap skips.
   2. the end of every round (state 'rend', then 'replay' with RP.hl): 2 s on the faces (the worse one first — cuts, swelling, blood, heavy
      breathing), then a cut of the round's best moments (HL: up to 3 clips by hit power / knockdown / a series of 3+), each seen from two
      angles with slow motion at the impact and the plate «ЛУЧШЕЕ В РАУНДЕ». Afterwards the corner / the judges exactly as before.
   OPT.cine switches both off. Debug: __g.HL, __g.endRound() */
const STARE_LEN = 4.2, STARE_ADV = 0.2;   // s the stare-down lasts, m each man walks toward the other
const FACE_LEN = 2.0, HL_PRE = 0.7, HL_MAX = 3, HL_CAMS = [['orbit', 'low'], ['behind', 'top'], ['over', 'wide']];   // s of face close-up; s of the clip before the impact; clips shown; camera pairs (angle 1, angle 2) of clip 1, 2, 3

/* ── the stare-down ── */
function stareTick(st) {
  const t = G.introT, on = st > 0 && t >= 0 && t < st;
  if (on && !G.stareOn) {
    G.stareOn = true; G.stareCamPh = -1; show('hud', false); show('bar-t', true); show('bar-b', true);
    G.smirker = rr() < 0.5 ? P1 : P2; G.nodder = rr() < 0.7 ? G.smirker : null; G.nodT = 1.6 + rr() * 0.8; sfx.roar(0.45);
  }
  if (!on && G.stareOn) { G.stareOn = false; show('bar-t', false); show('bar-b', false); show('hud', true); }
  G.stare = on ? sstep(0, 1, t / 0.9) * (1 - sstep(0, 1, (t - (st - 0.9)) / 0.8)) : 0;   // 0 → 1 as they close in, back to 0 as they part
  if (on) CROWD.heat = Math.max(CROWD.heat, 0.34 * Math.min(1, t / 0.8));   // the hall hums louder
}
// camera: [0, 1.7) a slow push-in on the pair in profile, [1.7, 2.8) the eyes of the player, [2.8, 3.6) the eyes of the other, then the fight camera
function stareCam(k) {
  const t = G.introT, ha = P1.headNow, hb = P2.headNow, mx = (ha.x + hb.x) / 2, hy = (ha.y + hb.y) / 2, ph = t < 1.7 ? 0 : t < 2.8 ? 1 : 2;
  if (ph !== G.stareCamPh) { G.stareCamPh = ph; if (ph > 0) camCut = true; }
  if (ph === 0) { const e = sstep(0, 1, t / 1.7); _cp.set(mx, hy - 0.06, lerp(2.6, 1.15, e)); _cl.set(mx, hy - 0.1, 0); return 2.6; }
  const F = ph === 1 ? P1 : P2, h = F.headNow, f = Math.sign(F.other.headNow.x - h.x) || 1, q = clamp(ph === 1 ? (t - 1.7) / 1.1 : (t - 2.8) / 0.8, 0, 1);
  _cp.set(h.x + f * 0.16, h.y - 0.05, 0.55 - 0.07 * q); _cl.set(h.x + f * 0.1, h.y - 0.08, 0); return 8;   // near profile (the other head is 0.35 m ahead, a 3/4 from the front would shoot through it)
}
/* what the stare-down / the panting adds to a pose (called from Fighter.update after pose()): lean in with the chest, weight sway, the nod;
   after the bell the chest heaves, the head hangs a little, the shoulders rise and fall */
Fighter.prototype.cineLayer = function () {
  const B = this.bones, t = G.t, P = this.ph || 0;
  if (G.state === 'ko' || G.state === 'result') {
    if (celOf(this)) celLayer(this);   // R-13: the winner backs off and celebrates (below)
    this.cc.updateMatrixWorld(true);
    return;
  }
  if (G.state === 'intro') {
    const k = G.stare, sw = Math.sin(t * 1.1 + P);
    this.rot(B.CC_Base_Waist, 0.14 * k, 0, 0.02 * k * sw); this.rot(B.CC_Base_Spine02, 0.1 * k, 0, 0.025 * k * sw);
    const u = (G.introT - (G.nodT || 0)) / 0.9, nod = G.nodder === this && u > 0 && u < 1 ? Math.sin(Math.PI * u) ** 2 : 0;
    this.rot(this.head, -0.06 * k + 0.3 * nod, 0.03 * k * Math.sin(t * 0.7 + P), 0);
  } else {
    const p = this.pant, br = Math.sin(t * 5.4 + P);
    this.rot(B.CC_Base_Waist, 0.07 * p, 0, 0); this.rot(B.CC_Base_Spine02, 0.06 * p + 0.045 * p * br, 0, 0.012 * p * Math.sin(t * 1.7 + P));
    this.rot(this.head, 0.08 * p + 0.03 * p * br, 0, 0);
    for (const S of ['L', 'R']) this.rot(B[`CC_Base_${S}_Clavicle`] || B[`CC_Base_${S}_Upperarm`], 0, 0, (S === 'L' ? 1 : -1) * 0.06 * p * br);
  }
  this.cc.updateMatrixWorld(true);
};

/* ── the winner (R-13) ──
   G.cel = { W: the winner, pose, face, arm, t0, walkAt, poseT, w, gap, walking }, set by celStart on every result with a winner
   (knockout, count-out, the doctor's stoppage, the judges; not a draw, not the bag). After the follow-up window of a knockout the
   winner backs off the man on the floor (footwork → celWalk: 2–3 long steps, like the referee sends him away at a knockdown) until
   his front foot is CEL.pelvis from the downed man's pelvis and CEL.clear from every joint of his; then one of three poses blends in:
   'up' both arms up, 'fist' one fist up and the other hand on the belt, 'hips' both hands on the belt with heavy breathing (his
   stamina was under 30 % at the end). Face: Face.x roar / smirk (03_flesh_face.js via celOf). The crowd cheers when the pose lands
   and again when the result screen shows. Only the live man is posed — the replay (REC) plays back the frames as they were.
   Debug: window.__celPose = 'up' | 'fist' | 'hips' forces the pose of the next result. */
// s after the knockout the walk starts (while followOK still holds, the follow-up wins in footwork); m front foot ↔ his pelvis; m front foot ↔ his
// nearest joint; m/s back (0.8 left a 1.5 m walk — a man who fell toward him — unfinished on the result screen); m a foot lags before it
// steps (0.09 in the fight shuffle), s a step (0.18); s the walk may take at most; m still to go when the pose may start; s the pose blends in
const CEL = { walkAt: 0.9, pelvis: 1.1, clear: 0.28, v: 1.1, reach: 0.24, step: 0.26, wait: 2.0, early: 0.12, blend: 0.55 };
const _celA = new V3(), _celB = new V3(), _celT = new V3(), _celP = new V3(), _celH = new V3(), _celQ = [new Quat(), new Quat(), new Quat(), new Quat()];
function celStart(W, walkAt = CEL.walkAt) {
  if (!W || BAG.on) { G.cel = null; return; }
  const want = window.__celPose, pose = want || (W.stamina < 30 ? 'hips' : rr() < 0.5 ? 'up' : 'fist');
  G.cel = { W, pose, face: pose === 'up' ? 'roar' : pose === 'hips' ? 'smirk' : rr() < 0.5 ? 'roar' : 'smirk', arm: rr() < 0.7 ? 'R' : 'L',
    t0: G.t, walkAt, poseT: null, w: 0, gap: 0, walking: false, res: false };
}
const celOf = F => { const C = G.cel; return C && C.W === F && (G.state === 'ko' || G.state === 'result') && !BAG.on ? C : null; };
/* how far (m, < 0 = too close) the winner's front foot is from where it may stand: off the downed man's pelvis by CEL.pelvis and
   off all his joints by CEL.clear. fwd = the winner's facing on the fight line; C.dir = +1 when the man lies in front of him (the winner
   backs off), −1 when a forward fall put him behind (the winner steps forward, away from him) */
function celGap(F, fwd) {
  const L = F.other, x0 = F.group.position.x, z0 = F.group.position.z;
  _celA.setFromMatrixPosition(L.hip.matrixWorld); const d = (_celA.x - x0) * fwd >= 0 ? 1 : -1; fwd *= d; G.cel.dir = d;
  const sp = (_celA.x - x0) * fwd;
  let front = 0; for (const i of [10, 11, 13, 14]) front = Math.max(front, (F.jp[i].x - x0) * fwd);   // the feet and toes nearest to him
  // a point off the line by dz needs only √(R² − dz²) along it (a man thrown sideways is already out of the way)
  const need = (s, dz, R) => s - front - Math.sqrt(Math.max(0, R * R - dz * dz));
  let gap = need(sp, _celA.z - z0, CEL.pelvis);
  for (let i = 0; i <= 15; i++) { _celA.setFromMatrixPosition((i < 15 ? L.rb[i] : L.head).matrixWorld); const s = (_celA.x - x0) * fwd; if (s > -0.25) gap = Math.min(gap, need(s, _celA.z - z0, CEL.clear)); }
  return gap;
}
// the target of footwork (adv) while he backs off, or null when the walk is not on
function celWalk(F, a, fwd) {
  const C = celOf(F); if (!C || G.t - C.t0 < C.walkAt || F.rag.on || F.gu) { if (C) C.walking = false; return null; }
  C.gap = celGap(F, fwd);
  if (C.movT == null || Math.abs(a - C.adv0) > 1e-3) C.movT = G.t; C.adv0 = a;   // stuck: the ropes behind him (footwork stops him there)
  C.walking = (C.gap < -0.02 && G.t - C.movT < 0.3) || Math.abs(F.advV || 0) > 0.12;
  return a + C.dir * Math.min(0, C.gap);
}
function celLayer(F) {
  const C = G.cel, B = F.bones, a = G.t - C.t0, t = G.t, P = F.ph || 0;
  if (C.poseT == null && a > C.walkAt + 0.15 && !followOK(F) && (!C.walking || C.gap > -CEL.early || a > C.walkAt + CEL.wait)) {
    C.poseT = G.t; sfx.roar(0.7); CROWD.heat = Math.max(CROWD.heat, 0.45);
    if (LOC.crowd) LOC.crowd.cheer(0.9, F.headNow, 2.5, 0);
  }
  if (G.state === 'result' && !C.res) { C.res = true; if (LOC.crowd) LOC.crowd.cheer(0.8, F.headNow, 2, 0); sfx.roar(0.5); }
  const w = C.w = C.poseT == null ? 0 : sstep(0, CEL.blend, G.t - C.poseT), hips = C.pose === 'hips';
  // (issue 46) the first moment, while the camera holds the downed man: chest opens, chin up, both arms lift a little; the pose takes over
  const u = sstep(0.25, 1.0, a) * (1 - w);
  if (u > 0.001) { F.rot(B.CC_Base_Spine02, -0.09 * u, 0, 0); F.rot(F.head, -0.14 * u, 0, 0); for (const S of ['L', 'R']) F.rot(B[`CC_Base_${S}_Upperarm`], -0.08 * u, 0, (S === 'L' ? 1 : -1) * 0.55 * u); }
  if (w <= 0.001) return;
  // the trunk: proud and tall (arms up / fist), or bent a little over the hands on the belt with the chest heaving
  const br = Math.sin(t * 4.6 + P);
  if (hips) {
    F.rot(B.CC_Base_Waist, 0.09 * w, 0, 0); F.rot(B.CC_Base_Spine02, (0.05 + 0.05 * br) * w, 0, 0); F.rot(F.head, (0.12 + 0.04 * br) * w, 0.05 * w * Math.sin(t * 0.6 + P), 0);
    for (const S of ['L', 'R']) F.rot(B[`CC_Base_${S}_Clavicle`] || B[`CC_Base_${S}_Upperarm`], 0, 0, (S === 'L' ? 1 : -1) * 0.07 * w * br);
  } else {
    F.rot(B.CC_Base_Spine02, -0.12 * w, 0, 0); F.rot(F.head, (C.pose === 'up' ? -0.24 : -0.12) * w, 0.06 * w * Math.sin(t * 0.5 + P), 0);
  }
  F.cc.updateMatrixWorld(true);
  const hc = F.group.worldToLocal(F.head.getWorldPosition(_celH)), pump = Math.max(0, Math.sin((G.t - C.poseT) * 7)) * (1 - sstep(1.2, 1.9, G.t - C.poseT));   // the fist pumps two or three times as it goes up
  for (const S of ['L', 'R']) {
    const side = S === 'L' ? 1 : -1, up = C.pose === 'up' || (C.pose === 'fist' && C.arm === S);
    const A = B[`CC_Base_${S}_Upperarm`], Fn = B[`CC_Base_${S}_Forearm`], H = B[`CC_Base_${S}_Hand`];
    const q0a = F.mquat(A, _celQ[0]), q0f = F.mquat(Fn, _celQ[1]), sh = F.mpos(A, _celA);
    if (up && C.pose === 'up') { _celT.set(side * 0.17, 0.44 + 0.02 * Math.sin(t * 3 + P + side), 0.07).add(sh); _celP.set(side * 0.42, 0.1, -0.12).add(sh); }
    else if (up) { _celT.set(side * 0.06, 0.46 - 0.1 * pump, 0.11).add(sh); _celP.set(side * 0.38, 0.05, 0).add(sh); }
    else {   // the hand on the belt: wrist at the side of the waist, elbow out to the side and back
      const hp = F.mpos(F.hip, _celB);
      _celT.set(hp.x + side * 0.2, hp.y + 0.1 + (hips ? 0.012 * br : 0), hp.z - 0.02); _celP.set(side * 0.5, -0.24, -0.2).add(sh);
    }
    F.ikPole(A, Fn, H, _celT, _celP); F.cc.updateMatrixWorld(true);
    const q1a = F.mquat(A, _celQ[2]), q1f = F.mquat(Fn, _celQ[3]);
    F.setMQuat(A, q0a.slerp(q1a, w)); F.cc.updateMatrixWorld(true); F.setMQuat(Fn, q0f.slerp(q1f, w)); F.cc.updateMatrixWorld(true);
    if (up) { F.guardHand(S, H, Fn, hc, w); F.cc.updateMatrixWorld(true); }   // a fist on the line of the forearm, knuckles out
  }
}

/* ── end of a round: the faces ── */
function roundCine(after) {
  if (!OPT.cine || P1.ko || P2.ko || REC.frames.length < 4) return false;
  hlFinalize();
  const dmg = F => { const E = F.flesh.u.uEyeSw.value; return F.flesh.wounds.reduce((s, w) => s + w.sev, 0) + E.x + E.y + (1 - F.hp / 100) * 1.5; };
  G.rend = { t: 0, t0: G.real, order: dmg(P2) > dmg(P1) ? [P2, P1] : [P1, P2], cut1: 1.2, shot: -1, after, sv: null };   // the more damaged face first
  G.state = 'rend'; $('pad').hidden = true; Q.length = 0; show('hud', false); show('bar-t', true); show('bar-b', true); camCut = true; return true;
}
function rendTick(dt) {
  const R = G.rend; R.t += dt;
  for (const F of [P1, P2]) F.pant = clamp(0.55 + 0.45 * (1 - F.stamina / 100), 0, 1);
  if (R.t >= FACE_LEN) startHighlights();
}
function rendCam() {
  const R = G.rend; if (!R) return 3;
  const idx = R.t < R.cut1 ? 0 : 1, F = R.order[idx], h = F.headNow, f = Math.sign(F.other.headNow.x - h.x) || 1, q = idx ? (R.t - R.cut1) / (FACE_LEN - R.cut1) : R.t / R.cut1;
  if (R.shot !== idx) { R.shot = idx; camCut = true; }
  _cp.set(h.x + f * 0.5, h.y + 0.03, 0.5 - 0.1 * clamp(q, 0, 1)); _cl.set(h.x + f * 0.03, h.y - 0.02, 0); return 4;
}
// any key / tap: the whole cutscene is skipped (not in the first moments: the player may still be hammering the punch keys)
function cineSkip() {
  const R = G.rend; if (!R || G.real - R.t0 < 0.8) return true;
  if (G.state === 'replay') endHighlights(); else cineEnd(); return true;
}
function cineEnd() {
  const R = G.rend; G.rend = null; show('bar-t', false); show('bar-b', false); show('hud', true); P1.pant = P2.pant = 0; camCut = true;
  if (R && R.after) R.after();   // the corner (toBreak) or the judges (decision)
}

/* ── the round's best moments ──
   HL.recs: a record per strong hit (power ≥ 0.35, not blocked) or knockdown: { te: when, who: who was hit (0 = P1), power, kd, post: s kept after the impact,
   frames: a deep copy of the replay frames [te − HL_PRE, te + post] once that time has passed }. Records within 1 s of each other (same man hit) merge.
   The replay buffer REC holds only ~10 s, so a clip is copied out when it is complete; the buffer of the whole round would be ~30 MB. */
const HL = { recs: [], hits: [] };
function hlReset() { HL.recs.length = 0; HL.hits.length = 0; }
function hlWant(te, who, power, kd) {
  const r = HL.recs.find(x => x.who === who && Math.abs(x.te - te) < 1.0);
  if (r && (!r.frames || kd || power > r.power)) { r.kd = r.kd || kd; if (kd) r.post = 1.5; if (power > r.power) { r.power = power; r.te = te; } r.frames = null; return; }   // (re-cut a finished clip around the stronger moment)
  if (r) return;
  HL.recs.push({ te, who, power, kd, post: kd ? 1.5 : 0.8, frames: null, t0: 0, t1: 0 });
  if (HL.recs.length > 10) { const w = HL.recs.filter(x => !x.kd).sort((a, b) => a.power - b.power)[0]; if (w) HL.recs.splice(HL.recs.indexOf(w), 1); }
}
EVT.on((type, e) => {
  if (e.replay) return;
  if (type === 'round') hlReset();
  else if (type === 'hit') {
    const ev = REC.events[REC.events.length - 1]; if (!ev || ev.t !== G.t) return;
    HL.hits.push({ t: G.t, who: ev.who, power: e.power, blocked: !!e.blocked });
    if (!e.blocked && e.power >= 0.35) hlWant(G.t, ev.who, e.power, false);
  } else if (type === 'kd' && G.kd) hlWant(G.t, G.kd.def === P1 ? 0 : 1, 1.5, true);
});
function hlCopy(r, t1) {
  const a = r.te - HL_PRE, F = REC.frames.filter(f => f.t >= a && f.t <= t1);
  r.frames = F.map(f => ({ t: f.t, d: [f.d[0].slice(), f.d[1].slice()], ar: f.ar && f.ar.slice(), r: f.r && f.r.slice(), gx: f.gx && f.gx.slice() }));
  r.t0 = r.frames.length ? r.frames[0].t : 0; r.t1 = r.frames.length ? r.frames[r.frames.length - 1].t : 0;
}
function hlTick() { for (const r of HL.recs) if (!r.frames && G.t >= r.te + r.post) hlCopy(r, r.te + r.post); }
function hlFinalize() { for (const r of HL.recs) if (!r.frames) hlCopy(r, G.t); }   // the round ended with the clip still open: what there is
function hlPick() {
  const cs = HL.recs.filter(r => r.frames && r.frames.length >= 8 && r.te - r.t0 > 0.15);
  for (const c of cs) {
    const near = HL.hits.filter(h => h.who === c.who && !h.blocked && Math.abs(h.t - c.te) < 1.4), series = near.length;
    c.series = series; c.score = c.power + 0.3 * (near.reduce((s, h) => s + h.power, 0) - c.power) + (series >= 3 ? 0.5 + 0.12 * (series - 3) : 0) + (c.kd ? 2.5 : 0);
  }
  const picks = []; for (const c of cs.sort((a, b) => b.score - a.score)) if (picks.length < HL_MAX && picks.every(p => Math.abs(p.te - c.te) > 1.8)) picks.push(c);
  return picks.sort((a, b) => a.te - b.te);
}
function startHighlights() {
  const picks = hlPick(), R = G.rend; if (!picks.length) return cineEnd();
  R.sv = { p: ARENA.position.clone(), ry: ARENA.rotation.y, gx: [P1.group.position.x, P2.group.position.x] };
  RP.hl = true; RP.segs = [];
  picks.forEach((c, i) => {
    const cams = HL_CAMS[i % HL_CAMS.length], rf = tau => (0.28 + 0.72 * Math.min(1, Math.abs(tau - c.te) / 0.16));   // slow motion at the impact
    const seg = (cam, a, b, base, enter) => ({ from: Math.max(c.t0, c.te + a), to: Math.min(c.t1, c.te + b), rf: tau => base * rf(tau), rate: base, cam, hlc: true, F: c.frames, who: c.who, te: c.te, enter });
    const tag = c.kd ? 'Нокдаун' : c.series >= 3 ? `Серия: ${c.series} ${c.series < 5 ? 'удара' : 'ударов'}` : c.power >= 0.9 ? 'Мощный удар' : 'Точный удар';
    RP.segs.push(seg(cams[0], -0.5, 0.12, 0.9, () => hlPlate(`${i + 1}/${picks.length} · ${tag} · ${c.who ? 'твой удар' : 'удар соперника'}`)), seg(cams[1], -0.28, c.kd ? 1.0 : 0.45, 0.7));
  });
  G.state = 'replay'; RP.seg = -1; nextSeg();
  $('rec').hidden = false; $('rp-cap').textContent = ''; $('hud').hidden = true; $('pad').hidden = true; $('result').hidden = true;
}
function hlPlate(text) { const el = $('hl'); $('hl-s').textContent = text; el.hidden = false; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
function endHighlights() {
  const R = G.rend; RP.hl = false;
  if (R && R.sv) { ARENA.position.copy(R.sv.p); ARENA.rotation.y = R.sv.ry; ARENA.updateMatrixWorld(true); P1.group.position.x = R.sv.gx[0]; P2.group.position.x = R.sv.gx[1]; P1.group.updateMatrixWorld(true); P2.group.updateMatrixWorld(true); }
  $('rec').hidden = true; $('hl').hidden = true; P1.simReset = P2.simReset = true; FX.clearAir(); G.shake = 0;
  cineEnd();
}
// cameras of the highlights: D = the man who is hit, A = the one who hits; each clip cuts between two of these.
// Kept back (2.7–4.8 m) so both men and the punch are in frame, and from angles the fight camera never takes.
function hlCam(s) {
  const D = s.who ? P2 : P1, A = D.other, h = D.headNow, a = A.headNow, f = Math.sign(a.x - h.x) || 1, mx = (h.x + a.x) / 2, p = clamp((RP.tau - s.from) / Math.max(0.01, s.to - s.from), 0, 1);
  if (s.cam === 'orbit') { const ang = -0.55 * f + p * 0.9 * f, r = 3.4; _cp.set(mx + Math.sin(ang) * r, 1.25, Math.cos(ang) * r); _cl.set(mx, h.y - 0.2, 0); return 9; }   // a slow arc round the exchange
  if (s.cam === 'low') { _cp.set(mx + f * 1.1, 0.34, 2.7 - 0.25 * p); _cl.set(mx, h.y - 0.05, 0); return 6; }                     // from the floor, looking up at the shot
  if (s.cam === 'top') { _cp.set(mx + 0.3, 4.3 - 0.35 * p, 1.1); _cl.set(mx, 0.9, 0); return 5; }                               // straight down from the lights
  if (s.cam === 'behind') { _cp.set(h.x - f * 2.3, 1.7, -1.7 + 0.3 * p); _cl.set(a.x, a.y - 0.15, 0); return 6; }            // over the hit man's back: the punch comes at the lens
  if (s.cam === 'over') { _cp.set(a.x - f * 2.2, a.y + 0.4, 1.5); _cl.set(h.x, h.y - 0.08, 0); return 6; }                      // behind the puncher, high
  if (s.cam === 'side') { _cp.set(mx, h.y - 0.1, 3.4 - 0.3 * p); _cl.set(mx, h.y - 0.15, 0); return 5; }                        // profile of the exchange
  _cp.set(mx - f * 0.8, 1.6, 4.8); _cl.set(mx, 1.1, 0); return 4;                                                              // wide
}
