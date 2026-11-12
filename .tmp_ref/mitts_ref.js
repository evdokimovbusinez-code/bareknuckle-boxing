/* ───────── trainer's focus mitts (pad work) ─────────
   A pair of procedural leather focus mitts worn on the trainer's (P2) hands. Geometry is built in the hand/mitt frame
   (cm, +y = fingers, +z = the striking face, +x = thumb side) and carried by a rigid group: every frame the trainer's
   forearms are posed with the game's two-bone IK and the mitts are seated on the wrist bones. A landed punch (P1.knuckle
   vs. the pad) kicks a damped spring that recoils pad + forearm, ripples the leather in the vertex shader and smacks.
   Judge API: window.__mitts = { start(), stop(), hold(kind), hit(side, power) }.

   Everything here is confined to MITTS.on: with it off the ordinary game is untouched (only two guarded hooks in
   11_arena_loop.js and one sfx.mitt() helper in 06_fx_sound.js). */
const MITTS = { on: false, feed: 'jab', active: 'L', pending: null, parts: null, tex: null, t: 0 };

/* the pad, centimetres. A 20.4 × 25.2 × ~8 cm curved cushion, centred a little above the wrist (cy) */
const MITT = { a: 10.2, b: 12.6, cy: 5.0, zRim: 2.0, zFront: 7.2, zBackRim: -0.6, zBack: -1.4 };
const MTAU = Math.PI * 2, _mto = new V3(), _mtd = new V3();
/* private scratch: mittsTick runs after all the fighter code, but keep our own vectors so nothing downstream is touched */
const _mtA = new V3(), _mtB = new V3(), _mtN = new V3(), _mtW = new V3(), _mtKn = new V3(), _mtC = new V3();
const _mtBack = new V3(), _mtTgt = new V3(), _mtAim = new V3(), _mtY = new V3(0, 1, 0), _mtX = new V3(1, 0, 0), _mtZ = new V3(0, 0, 1);
const _mtQ = new Quat(), _mtQ2 = new Quat(), _mtQ3 = new Quat(), _mtS = new V3(0.01, 0.01, 0.01);

/* rounded-rectangle outline of the pad in the x/y plane (superellipse) */
function mittOutline(u, out) {
  const t = u * MTAU, cs = Math.cos(t), sn = Math.sin(t), p = 0.58;
  return out.set(MITT.a * Math.sign(cs) * Math.pow(Math.abs(cs), p), MITT.b * Math.sign(sn) * Math.pow(Math.abs(sn), p), 0);
}
/* a real focus mitt is cupped: the whole cushion bends back toward the corners (a rigid bend, thickness preserved) */
const mittCup = (x, y) => 0.012 * x * x + 0.009 * (y - MITT.cy) * (y - MITT.cy);
/* front (striking) surface: v = 0 at the bullseye → 1 at the rim */
function mittFront(u, v, out) {
  const o = mittOutline(u, _mto), x = o.x * v, y = MITT.cy + o.y * v, k = Math.pow(Math.max(0, 1 - v * v), 0.72);
  return out.set(x, y, MITT.zRim + (MITT.zFront - MITT.zRim) * k - mittCup(x, y));
}
/* concave back, where the hand goes in */
function mittBack(u, v, out) {
  const o = mittOutline(u, _mto), x = o.x * v, y = MITT.cy + o.y * v, k = Math.pow(Math.max(0, 1 - v * v), 0.7);
  return out.set(x, y, MITT.zBackRim - (MITT.zBackRim - MITT.zBack) * k - mittCup(x, y));
}
/* thick edge wall joining the front rim to the back rim */
function mittWall(u, v, out) {
  const o = mittOutline(u, _mto), x = o.x, y = MITT.cy + o.y;
  return out.set(x, y, lerp(MITT.zRim, MITT.zBackRim, v) - mittCup(x, y));
}

/* ── canvas textures: colour (a bullseye on the striking face / plain leather), pebbled normal, roughness. No files. ── */
function mittTextures() {
  if (MITTS.tex) return MITTS.tex;
  let sd = 20261111; const R = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const tex = (c, srgb, rep) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep, rep); return t; };

  /* striking face. Draw the leather in pixels, then the target in centimetres with the pad centre at the origin */
  const S = 512, fc = mk(S, S), g = fc.getContext('2d');
  g.fillStyle = '#8a4a2e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 11000; i++) { const x = R() * S, y = R() * S, r = 1 + R() * 2.8; g.fillStyle = R() < 0.5 ? `rgba(255,224,188,${0.03 + R() * 0.09})` : `rgba(30,12,6,${0.04 + R() * 0.13})`; g.beginPath(); g.ellipse(x, y, r, r * (0.6 + R() * 0.6), 0, 0, 7); g.fill(); }
  const vg = g.createRadialGradient(S / 2, S / 2, S * 0.20, S / 2, S / 2, S * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(24,10,4,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, S, S);
  g.save(); g.translate(S / 2, S / 2); g.scale(S / (2 * MITT.a), S / (2 * MITT.b));
  /* seam line just inside the welt (the 3D stitch dashes sit on top of it) */
  g.beginPath();
  for (let i = 0; i <= 160; i++) { const o = mittOutline(i / 160, _mto), x = o.x * 0.865, y = o.y * 0.865; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.lineWidth = 0.14; g.strokeStyle = 'rgba(239,222,190,0.75)'; g.stroke();
  /* concentric bullseye — the classic focus-mitt target */
  for (const [r, col] of [[8.5, '#2b160e'], [7.6, '#efe1c6'], [5.7, '#b52c2f'], [4.0, '#efe1c6'], [2.4, '#b52c2f']]) {
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  }
  g.globalAlpha = 0.22; g.strokeStyle = '#2b160e'; g.lineWidth = 0.10;
  for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(-8.5, -8 + i * 2); g.lineTo(8.5, -6 + i * 2); g.stroke(); }   // faint scuffs
  g.restore();

  /* plain leather for the wall, back and glove pocket */
  const PS = 256, pc = mk(PS, PS), p = pc.getContext('2d');
  p.fillStyle = '#57321f'; p.fillRect(0, 0, PS, PS);
  for (let i = 0; i < 7000; i++) { const x = R() * PS, y = R() * PS, r = 1 + R() * 2.4; p.fillStyle = R() < 0.5 ? `rgba(230,190,150,${0.03 + R() * 0.08})` : `rgba(14,6,3,${0.05 + R() * 0.14})`; p.beginPath(); p.ellipse(x, y, r, r, 0, 0, 7); p.fill(); }

  /* pebbled height field → tangent-space normal map (tiles) */
  const NS = 256, hc = mk(NS, NS), h = hc.getContext('2d');
  h.fillStyle = '#7f7f7f'; h.fillRect(0, 0, NS, NS);
  for (let i = 0; i < 2600; i++) { const x = R() * NS, y = R() * NS, r = 2 + R() * 3.2; h.fillStyle = `rgba(255,255,255,${0.25 + R() * 0.35})`;
    for (let ox = -NS; ox <= NS; ox += NS) for (let oy = -NS; oy <= NS; oy += NS) { h.beginPath(); h.ellipse(x + ox, y + oy, r, r * (0.6 + R() * 0.5), R() * 3, 0, 7); h.fill(); } }
  const src = h.getImageData(0, 0, NS, NS).data, nc = mk(NS, NS), n = nc.getContext('2d'), im = n.createImageData(NS, NS);
  const H = (x, y) => src[((((y + NS) % NS) * NS) + ((x + NS) % NS)) * 4] / 255;
  for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * 1.7, dy = (H(x, y - 1) - H(x, y + 1)) * 1.7, l = 1 / Math.hypot(dx, dy, 1), k = (y * NS + x) * 4;
    im.data[k] = (dx * l * 0.5 + 0.5) * 255; im.data[k + 1] = (dy * l * 0.5 + 0.5) * 255; im.data[k + 2] = (l * 0.5 + 0.5) * 255; im.data[k + 3] = 255;
  }
  n.putImageData(im, 0, 0);

  /* roughness: slightly uneven, matte leather */
  const rc = mk(NS, NS), r = rc.getContext('2d');
  r.fillStyle = '#c6c6c6'; r.fillRect(0, 0, NS, NS);
  for (let i = 0; i < 8000; i++) { const v = 165 + ((R() * 80) | 0); r.fillStyle = `rgb(${v},${v},${v})`; r.fillRect(R() * NS, R() * NS, 1 + R() * 2, 1 + R() * 2); }

  return MITTS.tex = { face: tex(fc, true), plain: tex(pc, true, 2), nrm: tex(nc, false, 2), rgh: tex(rc, false, 2) };
}

/* a leather material whose vertices ripple for a few tenths of a second after a punch (uMVib decays in mittsTick) */
function mittMat(U, opts) {
  const T = MITTS.tex;
  const m = new THREE.MeshPhysicalMaterial(Object.assign({
    normalMap: T.nrm, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: T.rgh, roughness: 0.95,
    metalness: 0.0, clearcoat: 0.16, clearcoatRoughness: 0.55, sheen: 0.2,
    sheenColor: new THREE.Color('#c98b60'), sheenRoughness: 0.7, envMapIntensity: 0.55, side: THREE.DoubleSide
  }, opts));
  m.onBeforeCompile = sh => {
    sh.uniforms.uMVib = U.vib; sh.uniforms.uMT = U.t;
    sh.vertexShader = 'uniform float uMVib; uniform float uMT;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n transformed += normal * (uMVib * 0.15 * sin(uMT * 74.0 + position.y * 52.0 + position.x * 31.0));');
  };
  m.customProgramCacheKey = () => 'mittVib';   // each material still runs its own onBeforeCompile → its own uniforms
  return m;
}

/* ── build one mitt (both share the geometry; the vibration uniforms are per side) ── */
function mittBuild(side) {
  const T = mittTextures(), U = { vib: { value: 0 }, t: { value: 0 } };
  const matFace = mittMat(U, { map: T.face }), matLeather = mittMat(U, { map: T.plain });
  const matTrim = mittMat(U, { color: 0x2a1810, roughness: 0.8 });
  const matStitch = new THREE.MeshStandardMaterial({ color: 0xefe1c6, roughness: 0.9, side: THREE.DoubleSide });
  const matBuckle = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, metalness: 0.75, roughness: 0.35 });

  const c = new V3(0, MITT.cy, 1);
  const front = gridGeo(mittFront, 96, 30, { c, ku: 1, kv: 1 });
  /* planar UV so the painted bullseye lands in the middle of the pad (gridGeo's radial UV is otherwise polar) */
  { const uv = front.attributes.uv, pos = front.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * MITT.a), 0.5 + (pos.getY(i) - MITT.cy) / (2 * MITT.b)); }
  const wall = gridGeo(mittWall, 96, 4, { c, ku: 5, kv: 1 });
  const back = gridGeo(mittBack, 96, 14, { c, ku: 4, kv: 3 });
  /* glove/pocket on the back: a squashed leather dome the trainer's hand disappears into */
  const pocket = gridGeo((u, v, o) => { const d = sphDir(u, v, _mtd); return o.set(d.x * 8.0, MITT.cy - 2 + d.y * 10.5, -2.2 + d.z * 3.0); },
    40, 24, { c: new V3(0, MITT.cy - 2, -2.2), ku: 3, kv: 2 });
  /* hook-and-loop strap round the wrist + a little metal buckle on the back */
  const strap = gridGeo((u, v, o) => { const t = u * MTAU; return o.set(5.1 * Math.cos(t), -7.0 + 4.4 * v, -1.6 + 4.5 * Math.sin(t)); },
    40, 3, { c: new V3(0, -4.8, -1.6), ku: 4, kv: 1 });
  const buckle = new THREE.BoxGeometry(2.7, 2.3, 0.55).translate(0, -4.8, -6.35);
  /* thick welt (piping) running round the rim */
  const loop = [];
  for (let i = 0; i < 96; i++) { const o = mittOutline(i / 96, _mto), x = o.x, y = MITT.cy + o.y; loop.push(new V3(x, y, 0.7 - mittCup(x, y))); }
  const welt = pipeGeo(loop, 1.0, true);

  const g = new THREE.Group(); g.matrixAutoUpdate = false; g.frustumCulled = false;
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; g.add(m); return m; };
  add(front, matFace); add(wall, matLeather); add(back, matLeather); add(pocket, matLeather);
  add(strap, matTrim); add(buckle, matBuckle); add(welt, matTrim);
  /* the stitching: short cream dashes just inside the welt, on the striking face */
  const N = 56, dashGeo = new THREE.CylinderGeometry(0.13, 0.13, 1, 5, 1);
  const stitches = new THREE.InstancedMesh(dashGeo, matStitch, N);
  stitches.frustumCulled = false; stitches.matrixAutoUpdate = false;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    const a = mittFront(u, 0.90, _mtA), b = mittFront(u + 0.004, 0.90, _mtB);
    const dir = _mtB.sub(a).normalize(), pos = a.add(_mtN.set(0, 0, 0.25));
    const q = new Quat().setFromUnitVectors(_mtY, dir);
    stitches.setMatrixAt(i, new M4().compose(pos, q, new V3(1, 0.62, 1)));
  }
  stitches.instanceMatrix.needsUpdate = true; g.add(stitches);
  P2.group.add(g);   // carried in the trainer's own (mirrored) frame: the reflection is handled by three.js

  const B = P2.bones, s = side;
  return {
    side: s, g, U,
    upper: B[`CC_Base_${s}_Upperarm`], fore: B[`CC_Base_${s}_Forearm`], hand: B[`CC_Base_${s}_Hand`],
    cur: new V3(), tgt: new V3(), q: new Quat(), yaw: 0, tgtYaw: 0, roll: 0, tgtRoll: 0,
    x: 0, v: 0, vib: 0
  };
}

/* ── feeds. Wrist targets are given in world metres (x toward P1 is negative) and converted to the trainer's model frame ── */
const MITT_FEEDS = {
  // Wrist targets in world metres (P2 stands at x = +0.575; −x is toward P1). yL/yR are the pads' yaw in the trainer's
  // frame: a modest inward tilt keeps the target readable from the default (+z) camera, ≈ −1 rad is the sideways hook pad.
  // The pad that is not fed sits lower and further back, like a real holder's second mitt.
  jab:   { active: 'L', L: [0.40, 1.58, -0.12], R: [0.56, 1.28, 0.22], yL: -0.42, yR: -0.22 },
  cross: { active: 'R', L: [0.56, 1.28, -0.22], R: [0.40, 1.58, 0.12], yL: -0.22, yR: -0.42 },
  hook:  { active: 'L', both: true, L: [0.42, 1.50, -0.24], R: [0.56, 1.28, 0.22], yL: -0.95, yR: -0.22 }
};
function mittsHold(kind) {
  if (!MITTS.parts) return;
  const F = MITT_FEEDS[kind] || MITT_FEEDS.jab; kind = MITT_FEEDS[kind] ? kind : 'jab';
  MITTS.feed = kind; MITTS.active = F.active;
  P2.group.updateMatrixWorld(true);
  for (const s of ['L', 'R']) {
    const P = MITTS.parts[s], w = new V3(F[s][0], F[s][1], F[s][2]);
    P.tgt.copy(P2.group.worldToLocal(w));
    P.tgtYaw = F['y' + s] || 0;
  }
}

/* world position of the middle of a mitt's striking face (the bullseye) */
function mittsStrike(side, out) {
  return out.set(0, MITT.cy, MITT.zFront).applyMatrix4(MITTS.parts[side].g.matrixWorld);
}
/* where P1's fist is aimed during a pending punch: the bullseye, or wide of it on a miss */
function mittsAim() {
  if (!MITTS.on || !MITTS.pending || MITTS.pending.done || !P1.cur) return null;
  const pk = MITTS.pending, p = mittsStrike(pk.side, _mtAim);
  if (!pk.armed) { p.z += pk.side === 'L' ? -0.34 : 0.34; p.y += 0.07; }   // a punch past the pad: no response
  return p;
}

/* ── the per-frame update: pose the trainer, seat the mitts on his wrists, run the recoil springs, test the contact ── */
function mittsTick(dt) {
  if (!MITTS.on || !MITTS.parts) return;
  MITTS.t += dt; P2.group.updateMatrixWorld(true);
  const smooth = 1 - Math.exp(-dt * 9), k = 320, damp = 15;
  for (const s of ['L', 'R']) {
    const P = MITTS.parts[s];
    P.cur.lerp(P.tgt, smooth); P.yaw += (P.tgtYaw - P.yaw) * smooth;
    /* damped spring: a landed punch adds a velocity kick (see below), the arm gives and rings back */
    P.v += (-k * P.x - damp * P.v) * dt; P.x += P.v * dt;
    if (Math.abs(P.x) < 1e-5 && Math.abs(P.v) < 1e-4) { P.x = 0; P.v = 0; }
    P.vib *= Math.exp(-dt * 10);
    P.q.setFromAxisAngle(_mtY, P.yaw).multiply(_mtQ2.setFromAxisAngle(_mtX, -clamp(P.x * 2.2, 0, 0.28)));
    _mtBack.set(0, 0, -1).applyQuaternion(P.q);           // "back" = away from P1, in the trainer's model frame
    _mtTgt.copy(P.cur).addScaledVector(_mtBack, P.x);      // the spring moves the whole forearm, not just the pad
    P2.ik(P.upper, P.fore, P.hand, _mtTgt);
    P2.cc.updateMatrixWorld(true);
    const wrist = P2.mpos(P.hand, _mtW);                    // actual wrist (IK may clamp the reach)
    P.g.matrix.compose(wrist, P.q, _mtS);
    P.g.matrixWorldNeedsUpdate = true; P.g.updateMatrixWorld(true);
    P.U.vib.value = P.vib; P.U.t.value = MITTS.t;
  }
  /* ── did P1's knuckles reach the pad? ── */
  const pk = MITTS.pending;
  if (pk) {
    if (!pk.done && P1.cur && pk.armed) {
      const kn = P1.knuckle(_mtKn), c = mittsStrike(pk.side, _mtC);
      if (kn.distanceTo(c) < 0.16) {
        pk.done = true;
        const P = MITTS.parts[pk.side];
        P.v += 0.45 + 1.45 * pk.power;   // m/s: harder punch → deeper give (~2–7 cm) and a sharper ring-back
        P.vib = 0.55 + 0.45 * pk.power;
        sfx.mitt(pk.power);
      }
    }
    if (!P1.cur) { pk.done = true; MITTS.pending = null; }   // the swing is over: a genuine miss, no response
  }
}

/* ── judge API ── */
function mittsStart() {
  if (!P1 || !P2) return;
  if (!MITTS.parts) MITTS.parts = { L: mittBuild('L'), R: mittBuild('R') };
  MITTS.on = true; MITTS.pending = null; MITTS.t = 0;
  G.state = 'mitts'; G.paused = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; G.shake = 0;
  G.round = 0; G.stareOn = false; G.stare = 0; G.rend = null; RP.hl = false;
  BAG.on = false; if (BAG.g) BAG.g.visible = false;
  setLocation('boxgym');
  uiShow(null);
  for (const id of ['hud', 'pad', 'vs', 'result', 'rec', 'bar-t', 'bar-b', 'hl']) show(id, false);
  P1.resetState(); P2.resetState();
  P1.place(-D_SEP / 2, Math.PI / 2, false); P2.place(D_SEP / 2, -Math.PI / 2, true);
  for (const F of [P1, P2]) { F.mark = F.group.position.clone(); F.adv = 0; F.advV = 0; F.latV = 0; F.group.updateMatrixWorld(true); }
  /* the trainer is bare-handed: showP2 re-applies his normal outfit, then the wraps / gloves / gum shield / hand skin come off */
  showP2(true);
  const G2 = P2.gear;
  P2.wrapMesh.visible = false; for (const t of P2.tails) t.mesh.visible = false;
  G2.guard.visible = false;
  if (G2.gloves) { for (const gl of G2.gloves) gl.g.visible = false; G2.hg.visible = false; }
  if (G2.mma) { G2.mma.visible = false; for (const pd of G2.mmaPads) pd.m.visible = false; }
  P2.flesh.u.uGlv.value = 1;   // the hand inside a mitt is not drawn (the skin shader's glove mode)
  for (const s of ['L', 'R']) { const P = MITTS.parts[s]; P.g.visible = true; P.x = 0; P.v = 0; P.vib = 0; P.U.vib.value = 0; }
  mittsHold('jab');
  for (const s of ['L', 'R']) { const P = MITTS.parts[s]; P.cur.copy(P.tgt); P.yaw = P.tgtYaw; }
  mittsTick(0);   // seat the pads immediately, so the very first frame already shows the trainer in position
  sfx.unlock(); camCut = true;
}
function mittsStop() {
  if (!MITTS.on) return;
  MITTS.on = false; MITTS.pending = null;
  if (MITTS.parts) for (const s of ['L', 'R']) MITTS.parts[s].g.visible = false;
  P2.flesh.u.uGlv.value = 0;
  toMenu();   // showP2(true) inside re-applies the trainer's normal hand gear, then the menu hides him again
}
function mittsHit(side, power) {
  if (!MITTS.on) return;
  side = side === 'R' ? 'R' : 'L';
  const p = clamp(power == null ? 0.7 : power, 0, 1);
  const F = MITT_FEEDS[MITTS.feed] || MITT_FEEDS.jab;
  // a hook feed presents both pads; otherwise swinging at the pad that is held out of the way is a genuine miss
  const armed = side === F.active || !!F.both;
  const punch = side === 'R' ? (MITTS.feed === 'hook' ? 'hookR' : 'cross') : (MITTS.feed === 'hook' ? 'hookL' : 'jab');
  P1.startPunch(punch);
  P1.resolved = true;    // the trainer is not an opponent: no damage / knockdown / whiff resolution from this swing
  P1.wide = 0; if (P1.aimJit) P1.aimJit.set(0, 0, 0);
  MITTS.pending = { side, power: p, armed, done: false };
}
window.__mitts = {
  start: mittsStart, stop: mittsStop, hold: mittsHold, hit: mittsHit,
  /* extra readouts for tuning: the fist, the two bullseyes and the spring states, in world metres */
  debug: () => ({ feed: MITTS.feed, active: MITTS.active, on: MITTS.on,
    knuckle: P1.knuckle(new V3()).toArray(), L: mittsStrike('L', new V3()).toArray(), R: mittsStrike('R', new V3()).toArray(),
    spring: { L: MITTS.parts && [MITTS.parts.L.x, MITTS.parts.L.v], R: MITTS.parts && [MITTS.parts.R.x, MITTS.parts.R.v] } })
};
