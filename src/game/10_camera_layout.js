/* ───────── camera ───────── */
const camP = new V3(1.2, 1.4, 3), camL = new V3(0, 1, 0), _cp = new V3(), _cl = new V3(); let camCut = true, camClock = 0;
const FLY_R = 6.3, FLY_H = 2.25;   // m: where the intro fly-round starts — behind the back row of the crowd, over its heads (under the parking's ceiling)

/* ───────── R-03: the corner posts and the winner must not cover the fight ─────────
   camClear(dt): the 4 corner posts of the ring (RINGSET, ring frame) against the sight lines camera → target (the middle of the pair,
   each man's head, chest and pelvis — so in kd / ko / result the downed man's head and pelvis too). A post whose axis comes within
   CC_R of a sight line, between the camera and the target, blocks it. The wanted camera is then swung on an arc about the look point
   (yaw up to ±CC_YAW, eased — no jump). In kd / ko / result the arc may go to ±CC_KO and also weighs the standing man covering the
   downed one (ccWinCover: nearer the camera and within CC_NDC on screen; the downed man's side is preferred), and ccFit keeps both
   men whole in the shot. camFade(dt) is the fallback on the real camera: a post (and its turnbuckle pad) whose screen box still
   crosses a head, torso or gloves box in front of it fades to CC_OP. Debug: window.__camOff = true → the camera as it was before. */
const CC_R = 0.35, CC_YAW = 25 * Math.PI / 180, CC_KO = 40 * Math.PI / 180, CC_NDC = 0.2, CC_OP = 0.15, CC_TOP = 1.45, CC_PAD = 0.09;
const CC = { yaw: 0, want: 0, st: '', posts: null, tg: Array.from({ length: 7 }, () => new V3()) };
const _ccO = new V3(), _ccA = new V3(), _ccB = new V3(), _ccC = new V3(), _ccD = new V3(), _ccF = new V3(), _ccR = new V3(), _ccU = new V3();
function ccPosts() {   // the 4 posts + their pads, found once in RINGSET by their geometry; own materials so one can fade alone
  if (CC.posts) return CC.posts;
  const by = new Map();
  for (const o of RINGSET.children) {
    const g = o.geometry; if (!g || g.type !== 'CylinderGeometry' || !o.isMesh) continue;
    const r = g.parameters.radiusTop; if (Math.abs(r - 0.05) > 1e-3 && Math.abs(r - 0.09) > 1e-3) continue;   // post 0.05, pad 0.09 (ropes are 0.02)
    const key = Math.round(o.position.x * 10) + ',' + Math.round(o.position.z * 10);
    if (!by.has(key)) by.set(key, { x: o.position.x, z: o.position.z, m: [], op: 1, w: new V3() });
    o.material = o.material.clone(); by.get(key).m.push(o);
  }
  return (CC.posts = [...by.values()]);
}
function ccPostsWorld() {   // world position of each post foot (RINGSET may be slid inside ARENA, see 13e_loc_boxgym.js)
  const P = ccPosts(); RINGSET.updateWorldMatrix(true, false);
  for (const p of P) p.w.set(p.x, 0, p.z).applyMatrix4(RINGSET.matrixWorld);
  return P;
}
// how close the post axis (foot x, z; 0 … CC_TOP high) comes to the sight line cp → t; Infinity unless it stands between them
function ccGap(p, cp, t) {
  const dx = t.x - cp.x, dz = t.z - cp.z, L2 = dx * dx + dz * dz; if (L2 < 1e-6) return Infinity;
  const s = ((p.x - cp.x) * dx + (p.z - cp.z) * dz) / L2; if (s <= 0 || s >= 1) return Infinity;
  const y = cp.y + (t.y - cp.y) * s;
  return Math.hypot(cp.x + dx * s - p.x, cp.z + dz * s - p.z, Math.max(0, y - CC_TOP));
}
function ccTargets() {   // the middle of the pair, then per man: head, chest (between the shoulders), pelvis (between the thighs)
  const T = CC.tg; let i = 1;
  for (const F of [P1, P2]) { const j = F.jp; T[i++].copy(F.headNow); T[i++].addVectors(j[2], j[3]).multiplyScalar(0.5); T[i++].addVectors(j[0], j[1]).multiplyScalar(0.5); }
  T[0].addVectors(T[2], T[5]).multiplyScalar(0.5);
  return T;
}
// NDC of P seen from cp looking at cl (the real projection: camera.fov / aspect); z = depth along the view, ≤ 0 behind
function ccNdc(P, cp, cl, out) {
  const f = _ccF.subVectors(cl, cp).normalize(), r = _ccR.crossVectors(f, _ccU.set(0, 1, 0)).normalize(), u = _ccU.crossVectors(r, f);
  const d = _ccD.subVectors(P, cp), z = d.dot(f), ty = Math.tan(camera.fov * Math.PI / 360);
  return out.set(d.dot(r) / (Math.max(0.05, z) * ty * camera.aspect), d.dot(u) / (Math.max(0.05, z) * ty), z);
}
// a > 0 carries the camera (it sits at +z) towards +x
const ccOrbit = (cp, cl, a, out) => { const dx = cp.x - cl.x, dz = cp.z - cl.z, c = Math.cos(a), s = Math.sin(a); return out.set(cl.x + dx * c + dz * s, cp.y, cl.z - dx * s + dz * c); };
// a point of a fighter: −1 pelvis (between the thighs), −2 chest (between the shoulders), −3 head, else a joint jp[i]
function ccPt(F, i, out) { const j = F.jp; return i === -1 ? out.addVectors(j[0], j[1]).multiplyScalar(0.5) : i === -2 ? out.addVectors(j[2], j[3]).multiplyScalar(0.5) : i === -3 ? out.copy(F.headNow) : out.copy(j[i]); }
/* the down man covered by the standing man, seen from cp? 0 … 1 (1 = dead on). The task's test is the standing man's pelvis within
   CC_NDC of the down man's head and nearer the camera — but from a camera 1.1–1.5 m up the pelvis projects ~0.9 NDC above a head lying
   on the canvas, so what really hides him are the legs: pelvis, chest, knees and feet of the standing man against the down man's
   head (full weight), chest and pelvis (0.6) */
const CC_WJ = [-1, -2, 9, 12, 10, 13], CC_LJ = [[-3, 1], [-2, 0.6], [-1, 0.6]], _ccW = CC_WJ.map(() => new V3());
function ccWinCover(cp, cl, W, L) {
  CC_WJ.forEach((i, n) => ccNdc(ccPt(W, i, _ccC), cp, cl, _ccW[n])); let cov = 0;
  for (const [i, w] of CC_LJ) {
    const h = ccNdc(ccPt(L, i, _ccC), cp, cl, _ccB);
    for (const q of _ccW) if (q.z < h.z) cov = Math.max(cov, w * (1 - Math.hypot(q.x - h.x, q.y - h.y) / CC_NDC));
  }
  return cov;
}
/* keep whole men in the shot (kd / ko / result): every joint and the crown of each man in Fs inside the NDC frame ±CC_FX ×
   [CC_FB, CC_FT] (the top keeps clear of the HUD bars). A body past an edge first slides the shot (camera and look point together) by
   the overshoot, then the camera backs off along its view until all fit — both continuous, so the eased camera never jumps */
const CC_FX = 0.86, CC_FT = 0.72, CC_FB = -0.86, _ccE = new V3(), _ccS = new V3();
function ccFit(cp, cl, Fs, FX = CC_FX) {   // FX: the half width of the frame (R-09: narrower beside the result card, resWin)
  const tx = Math.tan(camera.fov * Math.PI / 360) * camera.aspect, ty = tx / camera.aspect;
  for (let it = 0, N = FX < CC_FX ? 3 : 2; it < N; it++) {   // a narrow window (the result card) takes a third pass to settle
    const f = _ccF.subVectors(cl, cp).normalize(), r = _ccR.crossVectors(f, _ccU.set(0, 1, 0)).normalize(), u = _ccU.crossVectors(r, f);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zs = 0, n = 0;
    const each = fn => { for (const F of Fs) { for (const p of F.jp) fn(p); _ccE.copy(F.headNow); _ccE.y += 0.14; fn(_ccE); } };   // joints + the crown
    each(p => { const d = _ccD.subVectors(p, cp), z = Math.max(0.3, d.dot(f)), nx = d.dot(r) / (z * tx), ny = d.dot(u) / (z * ty);
      x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny); zs += z; n++; });
    if (x0 >= -FX && x1 <= FX && y0 >= CC_FB && y1 <= CC_FT) return;
    const zm = zs / n, cy = (CC_FT + CC_FB) / 2;
    const sx = x0 < -FX && x1 > FX ? (x0 + x1) / 2 : x0 < -FX ? x0 + FX : x1 > FX ? x1 - FX : 0;
    const sy = y0 < CC_FB && y1 > CC_FT ? (y0 + y1) / 2 - cy : y0 < CC_FB ? y0 - CC_FB : y1 > CC_FT ? y1 - CC_FT : 0;
    _ccS.copy(r).multiplyScalar(sx * zm * tx).addScaledVector(u, sy * zm * ty); cp.add(_ccS); cl.add(_ccS);
    let back = 0;
    each(p => { const d = _ccD.subVectors(p, cp), z = d.dot(f), yr = d.dot(u);
      back = Math.max(back, Math.max(Math.abs(d.dot(r)) / (FX * tx), yr > 0 ? yr / (CC_FT * ty) : -yr / (-CC_FB * ty)) - z); });
    cp.addScaledVector(f, -Math.min(back, 3)); cp.y = Math.max(0.4, cp.y);
  }
}
/* swing the wanted camera _cp about _cl (k ≥ 1e3 = a scripted move: left alone). down = [winner, loser] in kd / ko / result */
function camClear(dt, down, fit, FX) {
  if (fit) ccFit(_cp, _cl, fit, FX);
  const vis = RINGSET.visible;
  if (!vis && !down) CC.want = 0; else {
    const P = vis ? ccPostsWorld() : [], T = ccTargets(), lim = down ? CC_KO : CC_YAW;
    // the down man's side (+1 = towards +x): the task sends the camera there; the other way is allowed too, at a small price
    const side = down ? Math.sign(ccPt(down[1], -1, _ccD).x - ccPt(down[0], -1, _ccC).x) || 1 : 0;
    let best = 0, bc = Infinity;
    for (let i = -16; i <= 16; i++) {
      const a = i / 16 * lim, cp = ccOrbit(_cp, _cl, a, _ccO);
      let blk = 0; for (const p of P) for (const t of T) { const g = ccGap(p.w, cp, t); if (g < CC_R) blk += 1 - g / CC_R; }
      const cov = down ? ccWinCover(cp, _cl, down[0], down[1]) : 0;
      // the standing man weighs more than a post (a post can still fade in camFade, he can't); then: small swings, and stay put
      const c = 10 * blk + 15 * cov + 0.6 * Math.abs(a) / CC_YAW + 0.5 * Math.abs(a - CC.yaw) / CC_YAW + (down && a * side < 0 ? 0.3 : 0);
      if (c < bc) { bc = c; best = a; }
    }
    CC.want = best;
  }
  CC.yaw = camCut ? CC.want : CC.yaw + (CC.want - CC.yaw) * (1 - Math.exp(-dt * 2.5));
  if (Math.abs(CC.yaw) > 1e-4) ccOrbit(_cp, _cl, CC.yaw, _cp);
  if (fit) ccFit(_cp, _cl, fit);   // the swing turned the view: fit again
}
/* the fallback on the real camera: a post whose screen box crosses a head / torso box in front of it fades (fast, not a pop) */
function ccBox(pts, r, cp, cl, out) {   // screen box of points padded by r metres
  out[0] = out[1] = Infinity; out[2] = out[3] = -Infinity; let z = Infinity;
  for (const p of pts) { const n = ccNdc(p, cp, cl, _ccA), ty = Math.tan(camera.fov * Math.PI / 360), ez = r / (Math.max(0.05, n.z) * ty);
    out[0] = Math.min(out[0], n.x - ez / camera.aspect); out[2] = Math.max(out[2], n.x + ez / camera.aspect); out[1] = Math.min(out[1], n.y - ez); out[3] = Math.max(out[3], n.y + ez); z = Math.min(z, n.z); }
  out[4] = z; return out;
}
const CC_BOX = Array.from({ length: 6 }, () => []), _ccPts = [new V3(), new V3()];
function camFade(dt) {
  if (!RINGSET.visible) return;
  const P = ccPostsWorld(), cp = camera.position, cl = camL, boxes = CC_BOX; let n = 0;
  // head, torso and the gloves (a post standing between the two men hides the exchange itself); the boxes are a few cm wider than
  // the body parts and the pad: the fade starts before the post actually slides over someone
  for (const F of [P1, P2]) { const j = F.jp; ccBox([F.headNow], 0.2, cp, cl, boxes[n++]); ccBox([j[0], j[1], j[2], j[3], j[4]], 0.16, cp, cl, boxes[n++]); ccBox([j[6], j[8]], 0.12, cp, cl, boxes[n++]); }
  const pb = [];
  for (const p of P) {
    _ccPts[0].set(p.w.x, 0, p.w.z); _ccPts[1].set(p.w.x, CC_TOP, p.w.z); ccBox(_ccPts, CC_PAD + 0.06, cp, cl, pb);
    let hit = false;
    if (pb[4] > 0.05) for (let i = 0; i < n; i++) { const b = boxes[i]; if (pb[4] < b[4] && pb[0] < b[2] && pb[2] > b[0] && pb[1] < b[3] && pb[3] > b[1]) { hit = true; break; } }
    // fades out in ~0.05 s — at once within 1.2 m of the lens (such a post is a blur sweeping across the screen) — and comes back in ~0.4 s
    const want = hit ? CC_OP : 1; p.op = camCut ? want : p.op + (want - p.op) * (1 - Math.exp(-dt * (hit ? (pb[4] < 1.2 ? 400 : 60) : 6))); if (Math.abs(p.op - want) < 0.01) p.op = want;
    for (const m of p.m) { const M = m.material, tr = p.op < 0.999; if (M.transparent !== tr) { M.transparent = tr; M.depthWrite = !tr; M.needsUpdate = true; } M.opacity = p.op; }
  }
}
window.__camClear = { CC, ccGap, ccTargets, ccWinCover, ccPostsWorld, endReplay: () => endReplay() };   // debug (docs/audit/scenarios/camera.js)
/* R-04: the camera's answer to a hit. G.shake = amplitude (m), decays ×e^(−9 t) as before; it used to push the camera at random on
   x and y every frame — now it swings along the punch (SHK.d, its part across the view: a damped 15 Hz swing that starts at full
   push), with a quarter of the old random jitter left on top (all of it when the punch runs along the line of sight).
   SHK.fovT: a big clean hit narrows the lens by HITK.fov = 2° for HITK.fovT = 80 ms (full for 50 ms, eased back over the last 30).
   OPT.shake off: neither. Called by camUpdate and netGuestCam; fed by shakeHit (resolveHit, followHit, the replay, the guest). */
const SHK = { d: new V3(1, 0, 0), ph: 0, hz: 15, fov0: 28, fovT: 0, fovA: 0 }, _sk1 = new V3(), _sk2 = new V3();
function shakeHit(amp, dir, fov) {
  if (!OPT.shake) return;
  if (dir && amp >= G.shake * 0.7) { SHK.d.copy(dir).normalize(); SHK.ph = 0; }   // a weaker hit inside a stronger one's shake keeps its direction
  G.shake = Math.max(G.shake, amp); if (fov) SHK.fovT = HITK.fovT;
}
function camKick(dt) {
  if (!OPT.shake) { G.shake = 0; SHK.fovT = 0; }
  if (G.shake > 0.0005 && dt > 0) {
    const v = _sk1.copy(camL).sub(camera.position).normalize(), d = _sk2.copy(SHK.d).addScaledVector(v, -SHK.d.dot(v)), across = Math.min(1, d.length() * 1.5);
    if (across > 0.01) d.normalize(); const sw = Math.cos(SHK.ph) * 0.6 * G.shake * across, jit = G.shake * (0.25 + 0.75 * (1 - across));
    camera.position.addScaledVector(d, sw); camera.position.x += (rr() - 0.5) * jit; camera.position.y += (rr() - 0.5) * jit;
    SHK.ph += dt * SHK.hz * 6.283; G.shake *= Math.exp(-dt * 9);
  }
  const fa = SHK.fovT > 0 ? HITK.fov * sstep(0, 0.03, SHK.fovT) : 0; if (SHK.fovT > 0 && dt > 0) SHK.fovT -= dt;
  if (Math.abs(fa - SHK.fovA) > 1e-4) { SHK.fovA = fa; camera.fov = SHK.fov0 - fa; camera.updateProjectionMatrix(); }
}
window.__hitFeel = { HITK, SHK, HS_LOG, hitStop };   // debug (R-04): the constants, the shake state, the recent freezes
function camUpdate(dt) {
  camClock += dt; let k = 4;
  const rw = resView(dt, camCut || CC.st !== G.state);   // R-09: the result card covers the right — the frame is skewed and narrowed to the space left of it (07c_result.js)
  // debug/screenshots: window.__camHold = { p: [x, y, z], l: [x, y, z] } pins the camera (world metres)
  if (window.__camHold) { const h = window.__camHold; camera.position.set(h.p[0], h.p[1], h.p[2]); camera.lookAt(h.l[0], h.l[1], h.l[2]); camP.copy(camera.position); camL.set(h.l[0], h.l[1], h.l[2]); return; }
  if (NET.guest && NET.started) return netGuestCam(dt, _cp, _cl);   // issue 49: the guest sees the fight from behind his own man
  const far = VW / VH < 1.45 ? 5.0 : 4.5;
  if (G.state === 'menu') { menuCam(dt, _cp, _cl); k = 1e3; }   // already eased inside menuCam (orbit about P1, 14_screens.js): taken as is
  else if (G.state === 'replay' && RP.segs[RP.seg].hlc) { k = hlCam(RP.segs[RP.seg]); if (RP.cut) { camCut = true; RP.cut = false; } }   // the highlights of a round (09b_cine.js)
  else if (G.state === 'rend') k = rendCam();   // the close-up of the faces at the end of a round
  else if (G.state === 'talk') k = talkCam();   // a story dialog: the face of whoever speaks (19_story.js, issue 51)
  else if (G.state === 'replay') {
    const s = RP.segs[RP.seg], h = G.loser.headNow, side = Math.sign(G.loser.group.position.x) || 1;
    const p = clamp((RP.tau - s.from) / Math.max(0.01, s.to - s.from), 0, 1), c = G.loser.jp[0], w = G.winner.headNow;
    if (s.cam === 'impact' && s.ic) {   // R-15: the knockout punch from the camera rpImpactCam picked at the contact (07_state_replay_hits.js)
      // a slow push in up to the contact; after it the look point follows his head down and the lens backs off, so the fall stays in
      // the shot. A scripted move (k = 1e3): camClear's swing would turn the face away again (the posts were weighed in the pick)
      const I = s.ic, pre = sstep(s.from, s.hit, RP.tau), post = sstep(s.hit, s.to, RP.tau);
      _cl.copy(I.l).lerp(_ccE.set(h.x, Math.max(0.3, h.y - 0.05), h.z), 0.7 * post);
      _cp.copy(I.p).addScaledVector(I.back, 0.18 * (1 - pre) + 0.9 * post); _cp.y += 0.25 * post; k = 1e3;
    }
    else if (s.cam === 'close') { _cp.set(h.x - side * 0.55, Math.max(0.55, h.y + 0.12), h.z + 1.45); _cl.set(h.x, Math.max(0.25, h.y - 0.05), h.z); k = 6; }
    else if (s.cam === 'low') {   // from the canvas, looking up past the falling man — slow push in
      const a = 0.9 + 0.35 * p; _cp.set(c.x + side * 0.9 * Math.cos(a), 0.18, c.z + 1.6 * Math.sin(a) + 0.3); _cl.set((c.x + h.x) / 2, Math.max(0.35, h.y * 0.6 + 0.15), c.z); k = 5;
    } else if (s.cam === 'top') {   // straight down from the rig, slowly turning
      const a = p * 0.6; _cp.set(c.x + 0.25 * Math.cos(a), 3.6 - 0.4 * p, c.z + 0.25 * Math.sin(a) + 0.05); _cl.set(c.x, 0, c.z); k = 4;
    } else if (s.cam === 'shoulder') {   // over the winner's shoulder at the man going down
      const dx = Math.sign(w.x - h.x) || 1; _cp.set(w.x + dx * 0.55, w.y + 0.12, w.z + 0.45 + 0.15 * p); _cl.set(h.x, Math.max(0.3, h.y - 0.15), h.z); k = 6;
    }
    else { const c = G.loser.jp[0]; _cp.set(c.x - side * 1.7, 1.6, 3.5); _cl.set(c.x * 0.7, Math.max(0.55, h.y * 0.55 + 0.3), 0); k = 4; }
    if (RP.cut) { camCut = true; RP.cut = false; }
  } else if (G.state === 'ko' || G.state === 'result' || G.state === 'kd') {
    const kd = G.state === 'kd', L = kd ? G.kd.def : G.loser, W = kd ? G.kd.att : G.winner;
    const h = L.headNow, c = L.jp[0], w = W.headNow, mx = (c.x + h.x) * 0.5 * 0.65 + w.x * 0.35;
    _cp.set(mx, 1.4, far - 0.25); _cl.set(mx, Math.max(0.62, h.y * 0.45 + 0.42), 0); k = 2.2;
    if (kd || G.state === 'ko') {
      // (issue 46) wide at the drop, then a slow push in that follows him down to the canvas and holds on the head.
      // The clock is sim time, so the 0.1 s freeze and the 0.35× slow motion carry into the camera move.
      const age = Math.max(0, G.t - (kd ? G.kd.t0 : G.koCine));
      const push = sstep(0, kd ? 0.55 : KO_CINE.push, age) * (kd ? 0.6 : 1);
      const drop = clamp(h.y / 1.65, 0, 1), fx = (c.x + h.x) * 0.5;   // centre on the body, not the head: he is ~1.7 m long on the canvas
      _cp.set(lerp(mx, fx, push), lerp(1.4, 1.12 - 0.1 * (1 - drop), push), lerp(far - 0.25, kd ? 3.5 : 3.2, push));
      _cl.set(lerp(mx, fx, push), lerp(Math.max(0.62, h.y * 0.45 + 0.42), Math.max(0.46, h.y * 0.4 + 0.42), push), 0);
      k = lerp(2.2, kd ? 3 : 3.6, push);
      if (!kd) {
        // (issue 46) after ~1.5 s alone on the downed man, ease back to a two-shot: the winner's short
        // gesture — arms lifting, chin up (cineLayer, 09b_cine.js) — is in frame when «Нокаут!» lands.
        // Higher + farther than the push-in: a standing man is ~1.8 m tall, a close low camera cuts his head off.
        const reveal = sstep(1.45, 2.25, age), two = (fx + w.x) * 0.5;
        _cp.x = lerp(_cp.x, two, reveal); _cp.y = lerp(_cp.y, 1.5, reveal); _cp.z = lerp(_cp.z, 4.3, reveal);
        _cl.x = lerp(_cl.x, two, reveal); _cl.y = lerp(_cl.y, 0.95, reveal);
        k = lerp(k, 3.2, reveal);
      }
    }
  } else {   // the fight: framed on the pair, pushed in a little when they trade up close, a slow drift so the shot never sits dead
    const mx = (P1.headNow.x + P2.headNow.x) * 0.5, sep = Math.abs(P1.headNow.x - P2.headNow.x), hurt = Math.max(P1.daze || 0, P2.daze || 0);
    const z = far + 0.2 - clamp((1.0 - sep) * 0.6, 0, 0.35) - 0.2 * hurt + Math.max(0, sep - 1.0) * 1.1, drift = 0.18 * Math.sin(camClock * 0.13);
    _cp.set(mx + drift, 1.12 + 0.04 * Math.sin(camClock * 0.21), z); _cl.set(mx + drift * 0.3, 0.93, 0); k = G.state === 'intro' ? 2.4 : 3.5;
    if (window.__tutOn) tutCam(_cp, _cl);   // R-16: the lesson frames both heads under its hint panel (09c_tutorial.js)
    /* the fly-round before a street fight (G.introT < 0, see startFight): an arc about the centre of the floor — from behind the crowd,
       above its heads, at the angle G.flyA — that comes down into the fight camera; while the opponent's card is up it only creeps */
    if (G.state === 'intro' && G.stareT && G.introT >= 0 && G.introT < G.stareT - 0.6) k = stareCam(k);   // the stare-down: profile push-in, the eyes of both
    if (G.state === 'intro' && G.introT < 0 && G.flyT) {
      const p = clamp(1 + G.introT / G.flyT, 0, 1), e = p * p * p * (p * (6 * p - 15) + 10), pre = Math.min(0, G.introT + G.flyT);
      const a = lerp(G.flyA * (1 - 0.035 * pre), Math.atan2(_cp.x, _cp.z), e), R = lerp(FLY_R, Math.hypot(_cp.x, _cp.z), e);
      _cp.set(R * Math.sin(a), lerp(FLY_H, _cp.y, e), R * Math.cos(a)); _cl.set(_cl.x * e, lerp(1.2, _cl.y, e), 0); k = 1e3;
    } }
  // R-03: swing the wanted camera off the corner posts (and, with a man down, off the standing man); scripted moves are left alone
  const st = G.state;
  if (CC.st === 'replay' && st === 'result') camCut = true;   // the replay is over: cut straight to the framed result shot, no slow glide out of the replay
  CC.st = st;
  const down = st === 'kd' && G.kd ? [G.kd.att, G.kd.def] : (st === 'ko' || st === 'result') && G.loser && G.winner ? [G.winner, G.loser] : null;
  // whole men in the shot: the standing man joins once the push-in on the fall is over (kd: after 1 s; ko: from the two-shot reveal)
  const fit = !down ? null : st === 'result' || (st === 'kd' ? G.t - G.kd.t0 > 1 : G.t - G.koCine > 1.45) ? down : [down[1]];
  if (k < 1e3 && !window.__camOff && st !== 'menu' && st !== 'rend' && st !== 'talk' && !(st === 'intro' && G.stareT && G.introT >= 0 && G.introT < G.stareT - 0.6)) camClear(dt, down, fit, rw ? rw.h : CC_FX);
  else CC.yaw = CC.want = 0;
  if (camCut) { camP.copy(_cp); camL.copy(_cl); camCut = false; }
  else { const a = 1 - Math.exp(-dt * k); camP.lerp(_cp, a); camL.lerp(_cl, a); }
  camera.position.copy(camP); camKick(dt);   // R-04: the kick along the punch + the lens push (both off with OPT.shake)
  camera.lookAt(camL);
  if (!window.__camOff) camFade(dt);   // R-03 fallback (debug: window.__camOff = true — the old camera, for before / after): a post still in front of a head / torso goes see-through
}
const HUD_BARS = ['h1', 'g1', 'h2', 'g2', 's1', 's2'].map(id => ({ el: $(id), v: -1 }));   // the DOM is touched only when a bar really changes
function hudBar(i, v) { const b = HUD_BARS[i]; v = Math.round(clamp(v, 0, 1) * 1000); if (b.v !== v) { b.v = v; b.el.style.transform = `scaleX(${(v / 1000).toFixed(3)})`; } }
function hudUpdate(dt) {
  // issue 49: the guest's own man is P2 (left on his mirrored camera), so the bars are swapped, not the fighters
  const ME = NET.guest && NET.started ? P2 : P1, OP = ME === P1 ? P2 : P1;
  hudBar(0, ME.hp / 100); hudBar(1, ME.hp / 100); hudBar(2, OP.hp / 100); hudBar(3, OP.hp / 100); hudBar(4, ME.stamina / 100); hudBar(5, OP.stamina / 100);
  $('cnt').hidden = !(G.state === 'fight' && ME.counterUntil > G.t);
  if (G.round) { const t = Math.max(0, Math.ceil(G.roundT)), mmss = s => `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`;
    // R-06: the clock is 20 px on its own plate (#tmr), the round beside it (#rnd). Issue 51: a story bout has no rounds — «ДО НОКАУТА»;
    // R-17: plus the time of the bout so far, counting up. The heavy bag (BAG.on): no bars / «VS» — score, combo and time, large (#bagp)
    const rnd = G.mode === 'story' ? 'ДО НОКАУТА' : 'Р' + G.round, tm = G.mode === 'story' ? mmss(Math.max(0, Math.floor(STORY_TIME - G.roundT))) : mmss(t);
    const live = G.t - BAG.lastT < 0.95 && BAG.combo > 1, txt = BAG.on ? `b${BAG.score}|${live ? BAG.combo : 0}|${BAG.best}|${tm}|${G.bagBest}` : rnd + '|' + tm;
    if (G.hudTxt !== txt) { G.hudTxt = txt; elHud.classList.toggle('bag', BAG.on);
      if (BAG.on) { $('bag-sc').textContent = BAG.score; $('bag-rec').textContent = G.bagBest ? 'рекорд ' + G.bagBest : '';
        const cb = $('bag-cb'); cb.textContent = live ? '×' + BAG.combo : '—'; cb.classList.toggle('hot', live && BAG.combo >= 4);
        $('bag-best').textContent = BAG.best > 1 ? 'лучшая ×' + BAG.best : ''; $('bag-t').textContent = tm; }
      else { $('rnd').textContent = rnd; $('tmr').textContent = tm; } } }
  const k = Math.min(1, dt * 3); P1.u.uDmg.value += (clamp(1 - P1.hp / 100, 0, 1) - P1.u.uDmg.value) * k; P2.u.uDmg.value += (clamp(1 - P2.hp / 100, 0, 1) - P2.u.uDmg.value) * k;
  // (issue 46) the get-up bar during the referee's count: how close the man is to beating it (mashing punches adds)
  const kb = $('kdbar');
  if (G.state === 'kd' && G.kd) {
    const K = G.kd; kb.hidden = false;
    $('kdfill').style.transform = `scaleX(${kdProgress(K).toFixed(3)})`;
    $('kdn').textContent = K.n ? K.n + ' / 10' : '';
    $('kdtxt').textContent = K.def === P1 ? 'ВСТАВАЙ · ЖМИ УДАРЫ' : 'ОТСЧЁТ РЕФЕРИ';
  } else kb.hidden = true;
}

/* ───────── layout: always landscape; a portrait phone gets the stage rotated ───────── */
/* render resolution: a computer renders at the height of the graphics preset (GFX.h; a 5K retina window would otherwise push ~11 Mpx
   through AO + bloom); a phone gets a pixel-ratio cap from the preset. In 'auto' the height and then the preset step down with the frame time */
const TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints > 0 && !(window.matchMedia && matchMedia('(hover: hover)').matches));
let qH = GFX.h; const DR = { acc: 0, n: 0, good: 0, bad: 0, wait: 0, upNeed: 6, lastUp: -1e9, slow: 0, lastDown: -1e9 };
const resMax = () => TOUCH ? GFX.h : Math.min(GFX.h, VH * Math.max(1, window.devicePixelRatio || 1));   // the tallest frame this preset gives on this screen
function applyRes() {
  const dpr = window.devicePixelRatio || 1, pr = TOUCH ? Math.max(0.5, Math.min(dpr, GFX.tpr) * Math.min(1, qH / GFX.h)) : clamp(qH / VH, 0.4, Math.max(1, dpr));
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); renderer.setSize(VW, VH, false); composer.setSize(VW, VH);
}
/* auto: the average frame stays above 20 ms (50 fps) for 3 s → first the render height goes down (to 75 % of the preset's), then the preset itself.
   The height may come back when there is headroom (and waits twice as long after every attempt that did not hold); the preset never climbs
   back on its own, so nothing ping-pongs. The level reached is remembered for the next start (choosing «авто» in the menu again forgets it). */
function resTick(dt) {
  if (GFX.set !== 'auto' || G.state === 'menu' || dt > 0.25 || dt <= 0 || document.hidden) return;
  /* Stage 2 (#47): 5 s in a row below 40 fps → step the whole preset down once (a cooldown stops it cascading in one stall).
     A preset the user picked in settings is never touched — this whole function is skipped above when GFX.set !== 'auto'. */
  if (dt > 1 / 40) DR.slow += dt; else DR.slow = 0;
  if (DR.slow >= 5 && G.real - DR.lastDown > 8) {
    DR.slow = 0; DR.lastDown = G.real;
    const li = GFX_ORDER.indexOf(GFX.level);
    if (li > 0) { applyGfx(GFX_ORDER[li - 1]); DR.wait = 2; try { localStorage.setItem('bx_gfx_auto', GFX.level); } catch (_) {} }
  }
  if (DR.wait > 0) { DR.wait -= dt; return; }   // just changed something: let the shaders compile and the frame time settle
  DR.acc += dt; DR.n++; if (DR.acc < 1) return;
  const avg = DR.acc / DR.n; DR.acc = DR.n = 0;
  if (avg > 1 / 50) {   // hold ≥ 50 fps: 20 ms per frame
    DR.good = 0; if (++DR.bad < 3) return; DR.bad = 0;
    const cur = Math.min(qH, resMax()), floor = Math.max(540, GFX.h * 0.75), li = GFX_ORDER.indexOf(GFX.level);
    if (G.real - DR.lastUp < 15) DR.upNeed = Math.min(DR.upNeed * 2, 48);   // the last step up did not hold
    if (cur > floor + 1 && (avg < 0.04 || li === 0)) { qH = Math.max(floor, Math.round(cur * 0.87)); applyRes(); DR.wait = 0.5; }   // under 25 fps: straight to the preset
    else if (li > 0) { applyGfx(GFX_ORDER[li - 1]); DR.wait = 2; try { localStorage.setItem('bx_gfx_auto', GFX.level); } catch (_) {} }
  } else if (avg < 1 / 58) {
    DR.bad = 0; if (++DR.good < DR.upNeed) return; DR.good = 0;
    const top = resMax(); if (qH < top - 1) { qH = Math.min(top, Math.round(qH / 0.87) + 1); DR.lastUp = G.real; applyRes(); DR.wait = 0.5; }
  } else { DR.bad = 0; DR.good = 0; }
}
function layout() {
  // a phone held upright gets the stage turned on its side; a computer never does — a tall window gets a 16:9 band instead
  const touch = TOUCH; stage.classList.toggle('desk', !touch); stage.classList.toggle('touch', touch);   // R-07: .touch = 44 px tap targets (g_head.html)
  const iw = window.innerWidth, ih = window.innerHeight, rot = touch && ih > iw * 1.05;
  stage.classList.toggle('rot', rot); VW = rot ? ih : iw; VH = rot ? iw : ih;
  if (!touch && VH > VW * 0.75) VH = Math.round(VW * 0.5625);
  stage.style.top = !rot && VH < ih ? ((ih - VH) / 2) + 'px' : '';
  stage.style.width = VW + 'px'; stage.style.height = VH + 'px';
  stage.classList.toggle('short', VH < 520);
  applyRes();
  camera.aspect = VW / VH; camera.fov = SHK.fov0 = VW / VH < 1.45 ? 34 : 28; SHK.fovA = 0; camera.updateProjectionMatrix();
}
window.addEventListener('resize', layout); layout(); GFX.ready = true;

/* body proxies for fighter-vs-fighter separation: [joint indices (averaged), radius] */
const SEP_T = [[[0, 1], 0.14], [[2], 0.09], [[3], 0.09], [[4], 0.075], [[15], 0.1], [[16], 0.1], [[9], 0.07], [[12], 0.07]];
const SEP_E = [[[5], 0.055], [[7], 0.055]];   // elbows: they may touch, never sink in
const _sa = new V3(), _sb = new V3();
function sepPt(F, ix, out) { out.set(0, 0, 0); const n = ix.length; for (let k = 0; k < n; k++) out.add(F.jp[ix[k]]); return out.multiplyScalar(1 / n); }
function armSegs(F) {   // world capsules of both arms, refreshed after posing
  const S = F.armSeg || (F.armSeg = [0, 1, 2, 3].map(() => [new V3(), new V3(), 0])), LB = F.limbs();
  for (let i = 0; i < 2; i++) { const L = i ? LB.R : LB.L;
    S[i * 2][0].setFromMatrixPosition(L.upper.matrixWorld); S[i * 2][1].setFromMatrixPosition(L.fore.matrixWorld); S[i * 2][2] = 0.05;
    S[i * 2 + 1][0].copy(S[i * 2][1]); S[i * 2 + 1][1].setFromMatrixPosition(L.mid1.matrixWorld); S[i * 2 + 1][2] = 0.045; }
}
const CLR_T = [[[0, 1], 0.16], [[0], 0.11], [[1], 0.11], [[2], 0.11], [[3], 0.11], [[16], 0.12], [[4], 0.08], [null, 0.17]], _cp1 = new V3(), _cp2 = new V3(), _cp3 = new V3();   // null = mid-torso
function clearPt(o, p, r, scale, push, noArms) {   // largest displacement that takes point p (radius r) out of o's head ellipsoid and torso spheres
  if (BAG.on) { if (o === P2) bagClearPt(p, r, scale < 1 ? 0.03 : 0, push); return; }   // the heavy bag stands in for him
  const R = HEAD.R, l = _cp1.copy(p).applyMatrix4(o.headFrameInv), x = l.x / (R.x + r), y = l.y / (R.y + r), z = l.z / (R.z + r), q = x * x + y * y + z * z;
  if (q < scale * scale && q > 1e-6) { l.multiplyScalar(scale / Math.sqrt(q)).applyMatrix4(o.headFrame).sub(p); if (l.lengthSq() > push.lengthSq()) push.copy(l); }
  const mid = _cp3.copy(o.jp[4]).add(o.jp[0]).add(o.jp[1]).multiplyScalar(1 / 3);   // mid-torso
  for (let k = 0; k < CLR_T.length; k++) {
    const ix = CLR_T[k][0], c = ix ? sepPt(o, ix, _sb) : mid, d = _cp1.copy(p).sub(c), L = d.length(), need = CLR_T[k][1] + r;
    if (L < need && L > 1e-6) { d.multiplyScalar((need - L) / L); if (d.lengthSq() > push.lengthSq()) push.copy(d); }
  }
  // his arms: forearm (elbow → knuckles) and upper arm as capsules — a punch into the guard stops on the guard
  if (o.armSeg && !noArms) for (let k = 0; k < o.armSeg.length; k++) {
    const A = o.armSeg[k][0], rc = o.armSeg[k][2], ab = _cp2.subVectors(o.armSeg[k][1], A), t = clamp(_cp1.subVectors(p, A).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1), c = _cp1.copy(A).addScaledVector(ab, t), d = c.subVectors(p, c), L = d.length(), need = rc + r;
    if (L < need && L > 1e-6) { d.multiplyScalar((need - L) / L); if (d.lengthSq() > push.lengthSq()) push.copy(d); }
  }
}
function bodyOverlap(A, B, fwd) {
  let pen = 0;
  const test = (P, Q, sgn) => { for (const [ia, ra] of P) { sepPt(A, ia, _sa); for (const [ib, rb] of Q) { sepPt(B, ib, _sb);
    const r = ra + rb, dy = _sb.y - _sa.y, dz = _sb.z - _sa.z, q = r * r - dy * dy - dz * dz; if (q <= 0) continue;
    const need = Math.sqrt(q), dx = (_sb.x - _sa.x) * fwd; if (dx < -0.04) continue;   // already past each other (an arm around the head): not a push
    if (need - dx > pen) { pen = need - dx; bodyOverlap.w = [ia, ib, +dx.toFixed(3)]; } } } };
  test(SEP_T, SEP_T); test(SEP_E, SEP_T); test(SEP_T, SEP_E);
  return pen;
}

