/* ───────── camera ───────── */
const camP = new V3(1.2, 1.4, 3), camL = new V3(0, 1, 0), _cp = new V3(), _cl = new V3(); let camCut = true, camClock = 0;
function camUpdate(dt) {
  camClock += dt; let k = 4;
  const far = VW / VH < 1.45 ? 5.0 : 4.5;
  if (G.state === 'menu') { const x = P1.group.position.x; _cp.set(x + 1.15 + 0.12 * Math.sin(camClock * 0.5), 1.28, 2.25); _cl.set(x + 0.42, 1.0, 0); k = 3; }
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
    const mx = (P1.headNow.x + P2.headNow.x) * 0.5, sep = Math.abs(P1.headNow.x - P2.headNow.x), hurt = Math.max(P1.daze || 0, P2.daze || 0);
    const z = far + 0.2 - clamp((1.0 - sep) * 0.6, 0, 0.35) - 0.2 * hurt + Math.max(0, sep - 1.0) * 1.1, drift = 0.18 * Math.sin(camClock * 0.13);
    _cp.set(mx + drift, 1.12 + 0.04 * Math.sin(camClock * 0.21), z); _cl.set(mx + drift * 0.3, 0.93, 0); k = G.state === 'intro' ? 2.4 : 3.5; }
  if (camCut) { camP.copy(_cp); camL.copy(_cl); camCut = false; }
  else { const a = 1 - Math.exp(-dt * k); camP.lerp(_cp, a); camL.lerp(_cl, a); }
  camera.position.copy(camP); if (G.shake > 0.0005) { camera.position.x += (rr() - 0.5) * G.shake; camera.position.y += (rr() - 0.5) * G.shake; G.shake *= Math.exp(-dt * 9); }
  camera.lookAt(camL);
}
function hudUpdate(dt) {
  const set = (id, v) => { $(id).style.transform = `scaleX(${clamp(v, 0, 1).toFixed(3)})`; };
  set('h1', P1.hp / 100); set('g1', P1.hp / 100); set('h2', P2.hp / 100); set('g2', P2.hp / 100); set('s1', P1.stamina / 100); set('s2', P2.stamina / 100);
  $('cnt').hidden = !(G.state === 'fight' && P1.counterUntil > G.t);
  if (G.round) { const t = Math.max(0, Math.ceil(G.roundT)), txt = `${BAG.on ? 'ГРУША' : 'Р' + G.round} · ${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`; if (G.hudTxt !== txt) { G.hudTxt = txt; $('diffl').textContent = txt; } }
  for (const F of [P1, P2]) { const tg = clamp(1 - F.hp / 100, 0, 1); F.u.uDmg.value += (tg - F.u.uDmg.value) * Math.min(1, dt * 3); }
}

/* ───────── layout: always landscape; a portrait phone gets the stage rotated ───────── */
/* render resolution: a computer renders at a capped height (a 5K retina window would otherwise push ~11 Mpx through AO + bloom),
   'auto' starts at 1080p and steps down/up with the frame rate; phones keep the old dpr rule */
const TOUCH = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints > 0 && !(window.matchMedia && matchMedia('(hover: hover)').matches));
const QUAL = { auto: 1080, '720': 720, '1080': 1080, '1440': 1440 };
let qSet = 'auto'; try { qSet = localStorage.getItem('bx_q') || 'auto'; } catch (_) {} if (!QUAL[qSet]) qSet = 'auto';
let qH = QUAL[qSet]; const DR = { acc: 0, n: 0, good: 0 };
function applyRes() {
  const dpr = window.devicePixelRatio || 1, pr = TOUCH ? Math.min(dpr, lowEnd ? 1.5 : 1.75) : clamp(qH / VH, 0.4, Math.max(1, dpr));
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); renderer.setSize(VW, VH, false); composer.setSize(VW, VH);
}
function setQual(v) { qSet = v; qH = QUAL[v] || 1080; DR.acc = DR.n = DR.good = 0; try { localStorage.setItem('bx_q', v); } catch (_) {} applyRes(); }
function resTick(dt) {   // dynamic resolution for 'auto': hold ~55+ fps, never above 1080p
  if (TOUCH || qSet !== 'auto' || dt >= 0.049 || G.state === 'menu') return;
  DR.acc += dt; DR.n++; if (DR.acc < 2) return;
  const avg = DR.acc / DR.n; DR.acc = DR.n = 0;
  if (avg > 1 / 48 && qH > 540) { qH = Math.max(540, qH - 180); DR.good = 0; applyRes(); }
  else if (avg < 1 / 58 && qH < 1080) { if (++DR.good >= 3) { qH = Math.min(1080, qH + 180); DR.good = 0; applyRes(); } }
  else DR.good = 0;
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
window.addEventListener('resize', layout); layout();

/* body proxies for fighter-vs-fighter separation: [joint indices (averaged), radius] */
const SEP_T = [[[0, 1], 0.14], [[2], 0.09], [[3], 0.09], [[4], 0.075], [[15], 0.1], [[16], 0.1], [[9], 0.07], [[12], 0.07]];
const SEP_E = [[[5], 0.055], [[7], 0.055]];   // elbows: they may touch, never sink in
const _sa = new V3(), _sb = new V3();
function sepPt(F, ix, out) { out.set(0, 0, 0); for (const i of ix) out.add(F.jp[i]); return out.multiplyScalar(1 / ix.length); }
function armSegs(F) {   // world capsules of both arms, refreshed after posing
  const B = F.bones, S = F.armSeg || (F.armSeg = [0, 1, 2, 3].map(() => [new V3(), new V3(), 0]));
  ['L', 'R'].forEach((s, i) => { const sh = B[`CC_Base_${s}_Upperarm`], el = B[`CC_Base_${s}_Forearm`], kn = B[`CC_Base_${s}_Mid1`];
    S[i * 2][0].setFromMatrixPosition(sh.matrixWorld); S[i * 2][1].setFromMatrixPosition(el.matrixWorld); S[i * 2][2] = 0.05;
    S[i * 2 + 1][0].copy(S[i * 2][1]); S[i * 2 + 1][1].setFromMatrixPosition(kn.matrixWorld); S[i * 2 + 1][2] = 0.045; });
}
const CLR_T = [[[0, 1], 0.16], [[0], 0.11], [[1], 0.11], [[2], 0.11], [[3], 0.11], [[16], 0.12], [[4], 0.08]], _cp1 = new V3(), _cp2 = new V3();
function clearPt(o, p, r, scale, push, noArms) {   // largest displacement that takes point p (radius r) out of o's head ellipsoid and torso spheres
  const R = HEAD.R, l = _cp1.copy(p).applyMatrix4(o.headFrameInv), x = l.x / (R.x + r), y = l.y / (R.y + r), z = l.z / (R.z + r), q = x * x + y * y + z * z;
  if (q < scale * scale && q > 1e-6) { l.multiplyScalar(scale / Math.sqrt(q)).applyMatrix4(o.headFrame).sub(p); if (l.lengthSq() > push.lengthSq()) push.copy(l); }
  const mid = _cp2.set(0, 0, 0); for (const i of [4]) mid.add(o.jp[i]); mid.add(o.jp[0]).add(o.jp[1]).multiplyScalar(1 / 3);   // mid-torso
  for (const [ix, rr0] of [...CLR_T, [null, 0.17]]) {
    const c = ix ? sepPt(o, ix, _sb) : _sb.copy(mid), d = _cp1.copy(p).sub(c), L = d.length(), need = rr0 + r;
    if (L < need && L > 1e-6) { d.multiplyScalar((need - L) / L); if (d.lengthSq() > push.lengthSq()) push.copy(d); }
  }
  // his arms: forearm (elbow → knuckles) and upper arm as capsules — a punch into the guard stops on the guard
  if (o.armSeg && !noArms) for (const [A, B2, rc] of o.armSeg) {
    const ab = _cp2.subVectors(B2, A), t = clamp(_cp1.subVectors(p, A).dot(ab) / Math.max(1e-6, ab.lengthSq()), 0, 1), c = _cp1.copy(A).addScaledVector(ab, t), d = c.subVectors(p, c), L = d.length(), need = rc + r;
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

