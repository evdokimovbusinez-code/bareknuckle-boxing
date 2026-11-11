/* ───────── camera ───────── */
const camP = new V3(1.2, 1.4, 3), camL = new V3(0, 1, 0), _cp = new V3(), _cl = new V3(); let camCut = true, camClock = 0;
const FLY_R = 6.3, FLY_H = 2.25;   // m: where the intro fly-round starts — behind the back row of the crowd, over its heads (under the parking's ceiling)
function camUpdate(dt) {
  camClock += dt; let k = 4;
  // debug/screenshots: window.__camHold = { p: [x, y, z], l: [x, y, z] } pins the camera (world metres)
  if (window.__camHold) { const h = window.__camHold; camera.position.set(h.p[0], h.p[1], h.p[2]); camera.lookAt(h.l[0], h.l[1], h.l[2]); camP.copy(camera.position); camL.set(h.l[0], h.l[1], h.l[2]); return; }
  const far = VW / VH < 1.45 ? 5.0 : 4.5;
  if (G.state === 'menu') { menuCam(dt, _cp, _cl); k = 1e3; }   // already eased inside menuCam (orbit about P1, 14_screens.js): taken as is
  else if (G.state === 'replay' && RP.segs[RP.seg].hlc) { k = hlCam(RP.segs[RP.seg]); if (RP.cut) { camCut = true; RP.cut = false; } }   // the highlights of a round (09b_cine.js)
  else if (G.state === 'rend') k = rendCam();   // the close-up of the faces at the end of a round
  else if (G.state === 'replay') {
    const s = RP.segs[RP.seg], h = G.loser.headNow, side = Math.sign(G.loser.group.position.x) || 1;
    const p = clamp((RP.tau - s.from) / Math.max(0.01, s.to - s.from), 0, 1), c = G.loser.jp[0], w = G.winner.headNow;
    if (s.cam === 'close') { _cp.set(h.x - side * 0.55, Math.max(0.55, h.y + 0.12), h.z + 1.45); _cl.set(h.x, Math.max(0.25, h.y - 0.05), h.z); k = 6; }
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
    const L = G.state === 'kd' ? G.kd.def : G.loser, W = G.state === 'kd' ? G.kd.att : G.winner, h = L.headNow, c = L.jp[0], w = W.headNow, mx = (c.x + h.x) * 0.5 * 0.65 + w.x * 0.35;
    _cp.set(mx, 1.4, far - 0.25); _cl.set(mx, Math.max(0.62, h.y * 0.45 + 0.42), 0); k = 2.2;
  } else {   // the fight: framed on the pair, pushed in a little when they trade up close, a slow drift so the shot never sits dead
    const mx = JUMP.on ? P1.headNow.x : (P1.headNow.x + P2.headNow.x) * 0.5, sep = JUMP.on ? 0 : Math.abs(P1.headNow.x - P2.headNow.x), hurt = Math.max(P1.daze || 0, P2.daze || 0);
    const z = far + 0.2 - clamp((1.0 - sep) * 0.6, 0, 0.35) - 0.2 * hurt + Math.max(0, sep - 1.0) * 1.1, drift = 0.18 * Math.sin(camClock * 0.13);
    _cp.set(mx + drift, 1.12 + 0.04 * Math.sin(camClock * 0.21), z); _cl.set(mx + drift * 0.3, 0.93, 0); k = G.state === 'intro' ? 2.4 : 3.5;
    /* the fly-round before a street fight (G.introT < 0, see startFight): an arc about the centre of the floor — from behind the crowd,
       above its heads, at the angle G.flyA — that comes down into the fight camera; while the opponent's card is up it only creeps */
    if (G.state === 'intro' && G.stareT && G.introT >= 0 && G.introT < G.stareT - 0.6) k = stareCam(k);   // the stare-down: profile push-in, the eyes of both
    if (G.state === 'intro' && G.introT < 0 && G.flyT) {
      const p = clamp(1 + G.introT / G.flyT, 0, 1), e = p * p * p * (p * (6 * p - 15) + 10), pre = Math.min(0, G.introT + G.flyT);
      const a = lerp(G.flyA * (1 - 0.035 * pre), Math.atan2(_cp.x, _cp.z), e), R = lerp(FLY_R, Math.hypot(_cp.x, _cp.z), e);
      _cp.set(R * Math.sin(a), lerp(FLY_H, _cp.y, e), R * Math.cos(a)); _cl.set(_cl.x * e, lerp(1.2, _cl.y, e), 0); k = 1e3;
    } }
  if (camCut) { camP.copy(_cp); camL.copy(_cl); camCut = false; }
  else { const a = 1 - Math.exp(-dt * k); camP.lerp(_cp, a); camL.lerp(_cl, a); }
  camera.position.copy(camP); if (!OPT.shake) G.shake = 0;   // settings: camera shake off
  if (G.shake > 0.0005 && dt > 0) { camera.position.x += (rr() - 0.5) * G.shake; camera.position.y += (rr() - 0.5) * G.shake; G.shake *= Math.exp(-dt * 9); }
  camera.lookAt(camL);
}
const HUD_BARS = ['h1', 'g1', 'h2', 'g2', 's1', 's2'].map(id => ({ el: $(id), v: -1 }));   // the DOM is touched only when a bar really changes
function hudBar(i, v) { const b = HUD_BARS[i]; v = Math.round(clamp(v, 0, 1) * 1000); if (b.v !== v) { b.v = v; b.el.style.transform = `scaleX(${(v / 1000).toFixed(3)})`; } }
function hudUpdate(dt) {
  hudBar(0, P1.hp / 100); hudBar(1, P1.hp / 100); hudBar(2, P2.hp / 100); hudBar(3, P2.hp / 100); hudBar(4, P1.stamina / 100); hudBar(5, P2.stamina / 100);
  $('cnt').hidden = !(G.state === 'fight' && P1.counterUntil > G.t);
  if (G.round) { const t = Math.max(0, Math.ceil(G.roundT)), txt = `${BAG.on ? 'ГРУША' : 'Р' + G.round} · ${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`; if (G.hudTxt !== txt) { G.hudTxt = txt; $('diffl').textContent = txt; } }
  const k = Math.min(1, dt * 3); P1.u.uDmg.value += (clamp(1 - P1.hp / 100, 0, 1) - P1.u.uDmg.value) * k; P2.u.uDmg.value += (clamp(1 - P2.hp / 100, 0, 1) - P2.u.uDmg.value) * k;
}

/* ───────── layout: always landscape; a portrait phone gets the stage rotated ───────── */
/* render resolution: a computer renders at the height of the graphics preset (GFX.h; a 5K retina window would otherwise push ~11 Mpx
   through AO + bloom); a phone gets a pixel-ratio cap from the preset. In 'auto' the height and then the preset step down with the frame time */
const TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints > 0 && !(window.matchMedia && matchMedia('(hover: hover)').matches));
let qH = GFX.h; const DR = { acc: 0, n: 0, good: 0, bad: 0, wait: 0, upNeed: 6, lastUp: -1e9 };
const resMax = () => TOUCH ? GFX.h : Math.min(GFX.h, VH * Math.max(1, window.devicePixelRatio || 1));   // the tallest frame this preset gives on this screen
function applyRes() {
  const dpr = window.devicePixelRatio || 1, pr = TOUCH ? Math.max(0.5, Math.min(dpr, GFX.tpr) * Math.min(1, qH / GFX.h)) : clamp(qH / VH, 0.4, Math.max(1, dpr));
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); renderer.setSize(VW, VH, false); composer.setSize(VW, VH);
}
/* auto: the average frame stays above 22 ms for 3 s → first the render height goes down (to 75 % of the preset's), then the preset itself.
   The height may come back when there is headroom (and waits twice as long after every attempt that did not hold); the preset never climbs
   back on its own, so nothing ping-pongs. The level reached is remembered for the next start (choosing «авто» in the menu again forgets it). */
function resTick(dt) {
  if (GFX.set !== 'auto' || G.state === 'menu' || dt > 0.25 || dt <= 0 || document.hidden) return;
  if (DR.wait > 0) { DR.wait -= dt; return; }   // just changed something: let the shaders compile and the frame time settle
  DR.acc += dt; DR.n++; if (DR.acc < 1) return;
  const avg = DR.acc / DR.n; DR.acc = DR.n = 0;
  if (avg > 0.022) {
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
  const touch = TOUCH; stage.classList.toggle('desk', !touch);
  const iw = window.innerWidth, ih = window.innerHeight, rot = touch && ih > iw * 1.05;
  stage.classList.toggle('rot', rot); VW = rot ? ih : iw; VH = rot ? iw : ih;
  if (!touch && VH > VW * 0.75) VH = Math.round(VW * 0.5625);
  stage.style.top = !rot && VH < ih ? ((ih - VH) / 2) + 'px' : '';
  stage.style.width = VW + 'px'; stage.style.height = VH + 'px';
  stage.classList.toggle('short', VH < 520);
  applyRes();
  camera.aspect = VW / VH; camera.fov = VW / VH < 1.45 ? 34 : 28; camera.updateProjectionMatrix();
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

