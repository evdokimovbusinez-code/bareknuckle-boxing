/* ───────── the heavy bag itself: model, chains, physics (the drill's rules are in 09_bag.js) ─────────
   A 40 kg leather bag, 1.2 m × 0.35 m: four stitched panels, a brand band, a domed top with four straps and D-rings, a bridle of
   four chains up to a swivel, one main chain up to the shackle on the beam (2.72 m).
   Frame of the bag mesh: origin = the swivel, −y down the bag's axis (top of the leather at −HB, bottom at −HB − LEN).
   Physics (bagStep): a double pendulum per horizontal axis — the main chain (massless link L1, angle `a`) and the rigid bag with
   its bridle (centre of mass D below the swivel, radius of gyration² RHO2, angle `b`), linearised:
       b'' = −(g·D/RHO2)(b − a) − …            (the chain's pull acts at the swivel, D above the centre of mass)
       a'' = (−g·a − D·b'') / L1 − …           (the centre of mass, L1·a + D·b, is pulled back by the chain's lean)
   slow mode ≈ 2.5 s (a 1.55 m pendulum), the fast one is the bag rocking under the swivel. Plus twist about the axis (`yaw`) and a
   hop (`lift`: an uppercut unloads the chains, they go slack and clink when the bag drops back).
   A punch (bagImpact) is an impulse at the contact point: above the centre of mass it rocks the bag, off the axis it twists it.
   Chains: every link is an instance of one InstancedMesh; each chain is a verlet rope (gravity, damping, length constraints) pinned
   to its two ends — straight while the bag hangs on it, loose when it hops.
   The leather: dents (4 slots, uniform uDent), a bending wobble and a ripple along the bag are done in the vertex shader.
   Draw calls: the bag with its hardware (1) + all links (1) + the dust puff while it is in the air (1). */
const BAGR = { R: 0.176, L1: 0.5, HB: 0.36, LEN: 1.2, RING: 0.145, HOOK: 2.72, RHO2: 0.176 * 0.176 / 4 + 1.2 * 1.2 / 12, KAP: 0.5 };
BAGR.D = BAGR.HB + BAGR.LEN / 2;
/* skins: the bag of the drill changes with every session (startBag) */
const BAG_SKINS = [
  { id: 'oxblood', leather: '#5b1b17', dark: '#2c0d0b', band: '#e6dfcc', ink: '#1a1412', thread: '#d8c79c' },
  { id: 'black', leather: '#1d1c1f', dark: '#0e0e10', band: '#d9a316', ink: '#15120e', thread: '#c9c9c9', tape: true, big: true },
];
const _hb1 = new V3(), _hb2 = new V3(), _hb3 = new V3(), _hb4 = new V3(), _hb5 = new V3(), _hbQ = new Quat(), _hbQ2 = new Quat(), _hbM = new M4(), _hbS = new V3(1, 1, 1), _hbX = new V3(1, 0, 0), _hbY = new V3(0, 1, 0), _hbDn = new V3(0, -1, 0);

/* textures. Layout (canvas, v down): the body takes the top 86 % — dome (4 %), side (78 %), bottom (4 %); the strip under it is the
   hardware: steel on the left half, webbing on the right. u = 0.5 faces the fighter, u = 0.75 the fight camera. */
function bagTextures(skin) {
  const W = 1024, H = 1024, sy = t => H * (0.04 + 0.78 * t), AS = 1.39;   // AS: a canvas pixel is 1.08 mm round the bag and 1.5 mm along it
  let seed = 7; const R = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const SEAMS = [0.125, 0.375, 0.625, 0.875], HS = [0.065, 0.905], B0 = 0.17, B1 = 0.30;
  // features shared by the three maps
  const scuffs = [], scratches = [], creases = [];
  for (let i = 0; i < 46; i++) { const front = R() < 0.7; scuffs.push({ x: W * (front ? 0.5 + (R() - 0.5) * 0.42 : R()), y: sy(front ? 0.1 + R() * 0.6 : 0.05 + R() * 0.9), rx: 18 + R() * 60, ry: 10 + R() * 34, a: R() * 3, k: R() }); }
  for (let i = 0; i < 260; i++) { const x = R() * W, y = sy(R()), l = 8 + R() * R() * 90, a = (R() - 0.5) * 1.2 + (R() < 0.3 ? 1.5 : 0); scratches.push({ x, y, x2: x + Math.cos(a) * l, y2: y + Math.sin(a) * l * 0.7, k: R() }); }
  for (let i = 0; i < 70; i++) { const y = sy(0.1 + R() * 0.8), x = R() * W, l = 60 + R() * 200; creases.push({ x, y, l, b1: (R() - 0.5) * 14, b2: (R() - 0.5) * 14, k: R() }); }
  const wrapX = (g, fn) => { for (const ox of [-W, 0, W]) { g.save(); g.translate(ox, 0); fn(); g.restore(); } };
  const stitch = (g, x0, y0, x1, y1, col, lw = 1.6, dash = [5, 4]) => { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); };
  const tapeY = sy(0.47), tapeH = 34;

  /* colour */
  const cc = mk(), c = cc.getContext('2d'), bodyH = H * 0.86;
  c.fillStyle = skin.leather; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 520; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,235,215' : '0,0,0'},${0.015 + R() * 0.045})`; c.beginPath(); c.ellipse(R() * W, R() * bodyH, 20 + R() * 90, 12 + R() * 60, R() * 3, 0, 7); c.fill(); }
  // sweat and grime: darker towards the bottom and round the seams, a paler rubbed zone where the fists land
  { const gr = c.createLinearGradient(0, sy(0.55), 0, sy(1)); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.32)'); c.fillStyle = gr; c.fillRect(0, sy(0.55), W, sy(1) - sy(0.55)); }
  { const gr = c.createRadialGradient(W * 0.5, sy(0.3), 20, W * 0.5, sy(0.3), 330); gr.addColorStop(0, 'rgba(255,225,200,.12)'); gr.addColorStop(1, 'rgba(255,225,200,0)'); c.save(); c.scale(1, 1.25); c.fillStyle = gr; c.fillRect(0, 0, W, bodyH); c.restore(); }
  for (const s of creases) { c.strokeStyle = `rgba(0,0,0,${0.06 + s.k * 0.12})`; c.lineWidth = 1 + s.k * 1.4; wrapX(c, () => { c.beginPath(); c.moveTo(s.x, s.y); c.bezierCurveTo(s.x + s.l / 3, s.y + s.b1, s.x + 2 * s.l / 3, s.y + s.b2, s.x + s.l, s.y + (s.b1 + s.b2) * 0.2); c.stroke(); });
    c.strokeStyle = `rgba(255,230,210,${0.04 + s.k * 0.05})`; c.lineWidth = 1; c.beginPath(); c.moveTo(s.x, s.y - 2); c.bezierCurveTo(s.x + s.l / 3, s.y + s.b1 - 2, s.x + 2 * s.l / 3, s.y + s.b2 - 2, s.x + s.l, s.y + (s.b1 + s.b2) * 0.2 - 2); c.stroke(); }
  // the brand band: a strip of pale leather sewn round the bag, the logo printed on both sides
  c.fillStyle = skin.band; c.fillRect(0, sy(B0), W, sy(B1) - sy(B0));
  for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(60,40,20,${0.02 + R() * 0.05})`; c.beginPath(); c.ellipse(R() * W, sy(B0 + R() * (B1 - B0)), 10 + R() * 50, 4 + R() * 14, R() * 3, 0, 7); c.fill(); }
  for (const u of [0.25, 0.75]) { c.save(); c.translate(W * u, sy((B0 + B1) / 2)); c.scale(1, 1 / AS); brandLogo(c, 'IRON JAW', 0, 0, 236, skin.ink, 'row'); c.restore(); }
  for (const u of [0, 0.5, 1]) { c.save(); c.translate(W * u, sy((B0 + B1) / 2)); c.scale(1, 1 / AS); c.globalAlpha = 0.85; brandMark(c, 'IRON JAW', 0, 0, 36, skin.ink); c.restore(); }
  c.fillStyle = skin.ink; c.fillRect(0, sy(B0) + 7, W, 3); c.fillRect(0, sy(B1) - 10, W, 3);
  if (skin.big) for (const u of [0.25, 0.75]) { c.save(); c.translate(W * u, sy(0.735)); c.rotate(-Math.PI / 2); c.scale(1 / AS, 1); c.globalAlpha = 0.9; brandLogo(c, 'IRON JAW', 0, 0, 250, '#e9e6df', 'word'); c.restore(); }
  else for (const u of [0.25, 0.75]) { c.save(); c.translate(W * u, sy(0.4)); c.scale(1, 1 / AS); c.globalAlpha = 0.5; c.fillStyle = skin.band; c.font = '700 22px "Arial Narrow", Arial, sans-serif'; c.textAlign = 'center'; c.fillText('PRO SERIES · 40 KG · ГОСТ', 0, 0); c.restore(); }
  // panel seams: a dark groove, the thread on both lips
  for (const u of SEAMS) { const x = W * u; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x - 2, 0, 4, bodyH); c.fillStyle = 'rgba(0,0,0,.16)'; c.fillRect(x - 11, 0, 22, bodyH); stitch(c, x - 7, sy(0), x - 7, sy(1), skin.thread); stitch(c, x + 7, sy(0), x + 7, sy(1), skin.thread); }
  for (const t of HS) { const y = sy(t); c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, y - 1.5, W, 3); c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(0, y - 9, W, 18); stitch(c, 0, y - 6, W, y - 6, skin.thread, 1.4, [6, 5]); stitch(c, 0, y + 6, W, y + 6, skin.thread, 1.4, [6, 5]); }
  stitch(c, 0, sy(B0) + 3, W, sy(B0) + 3, skin.ink, 1.3, [6, 5]); stitch(c, 0, sy(B1) - 3, W, sy(B1) - 3, skin.ink, 1.3, [6, 5]);
  // the collar above the top seam and the bottom cup: darker hide
  c.fillStyle = skin.dark; c.globalAlpha = 0.6; c.fillRect(0, 0, W, sy(HS[0]) - 9); c.fillRect(0, sy(HS[1]) + 9, W, bodyH - sy(HS[1]) - 9); c.globalAlpha = 1;
  // wear: rubbed-through patches (the dye is gone, the hide shows), scratches
  for (const s of scuffs) wrapX(c, () => { c.save(); c.translate(s.x, s.y); c.rotate(s.a); const gr = c.createRadialGradient(0, 0, 0, 0, 0, s.rx); gr.addColorStop(0, `rgba(196,160,128,${0.1 + s.k * 0.2})`); gr.addColorStop(0.6, `rgba(170,130,104,${0.05 + s.k * 0.08})`); gr.addColorStop(1, 'rgba(170,130,104,0)'); c.scale(1, s.ry / s.rx); c.fillStyle = gr; c.beginPath(); c.arc(0, 0, s.rx, 0, 7); c.fill(); c.restore(); });
  for (const s of scratches) { c.strokeStyle = s.k < 0.6 ? `rgba(225,200,175,${0.08 + s.k * 0.22})` : `rgba(0,0,0,${0.1 + s.k * 0.15})`; c.lineWidth = 0.6 + s.k * 1.1; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x2, s.y2); c.stroke(); }
  if (skin.tape) {   // an old bag: duct tape round the split middle, a second turn a little askew
    for (const [dy, a] of [[0, 0.93], [tapeH - 7, 0.88]]) { c.fillStyle = `rgba(168,171,176,${a})`; c.fillRect(0, tapeY + dy, W, tapeH); c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(0, tapeY + dy + 2, W, 2); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, tapeY + dy + tapeH - 1, W, 2);
      for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(0,0,0,${0.04 + R() * 0.08})`; c.fillRect(R() * W, tapeY + dy, 1 + R() * 2, tapeH); } }
  }
  // hardware strip
  c.fillStyle = '#8d9197'; c.fillRect(0, H * 0.87, W / 2, H * 0.13); c.fillStyle = '#18181a'; c.fillRect(W / 2, H * 0.87, W / 2, H * 0.13);
  for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '40,30,20'},${0.04 + R() * 0.1})`; c.fillRect(R() * W / 2, H * 0.87 + R() * H * 0.13, 2 + R() * 24, 1 + R() * 2); }
  for (let y = H * 0.87; y < H; y += 4) { c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(W / 2, y, W / 2, 1.5); }
  for (let x = W / 2; x < W; x += 5) { c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x, H * 0.87, 1.2, H * 0.13); }
  { const im = c.getImageData(0, 0, W, H), d = im.data; for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; } c.putImageData(im, 0, 0); }   // grain
  const map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.wrapS = THREE.RepeatWrapping;
  if (BAGR.nrm) return { map, normalMap: BAGR.nrm, orm: BAGR.orm };

  /* roughness (G) / metalness (B): worn leather — polished where it is hit, dry and rough where it is scuffed */
  const oc = mk(), o = oc.getContext('2d'), rg = (r, m = 0) => `rgb(0,${Math.round(r * 255)},${Math.round(m * 255)})`;
  o.fillStyle = rg(0.56); o.fillRect(0, 0, W, H);
  for (let i = 0; i < 300; i++) { o.fillStyle = `rgba(0,${R() < 0.5 ? 255 : 60},0,${0.03 + R() * 0.06})`; o.beginPath(); o.ellipse(R() * W, R() * bodyH, 20 + R() * 80, 12 + R() * 50, R() * 3, 0, 7); o.fill(); }
  { const gr = o.createRadialGradient(W * 0.5, sy(0.3), 20, W * 0.5, sy(0.3), 300); gr.addColorStop(0, 'rgba(0,70,0,.5)'); gr.addColorStop(1, 'rgba(0,70,0,0)'); o.save(); o.scale(1, 1.25); o.fillStyle = gr; o.fillRect(0, 0, W, bodyH); o.restore(); }
  o.fillStyle = 'rgba(0,105,0,.6)'; o.fillRect(0, sy(B0), W, sy(B1) - sy(B0));
  for (const s of scuffs) wrapX(o, () => { o.save(); o.translate(s.x, s.y); o.rotate(s.a); o.scale(1, s.ry / s.rx); const gr = o.createRadialGradient(0, 0, 0, 0, 0, s.rx); gr.addColorStop(0, `rgba(0,225,0,${0.3 + s.k * 0.4})`); gr.addColorStop(1, 'rgba(0,225,0,0)'); o.fillStyle = gr; o.beginPath(); o.arc(0, 0, s.rx, 0, 7); o.fill(); o.restore(); });
  for (const s of scratches) { o.strokeStyle = 'rgba(0,235,0,.5)'; o.lineWidth = 1 + s.k; o.beginPath(); o.moveTo(s.x, s.y); o.lineTo(s.x2, s.y2); o.stroke(); }
  for (const u of SEAMS) { o.fillStyle = rg(0.8); o.fillRect(W * u - 9, 0, 18, bodyH); }
  for (const t of HS) { o.fillStyle = rg(0.8); o.fillRect(0, sy(t) - 8, W, 16); }
  o.fillStyle = rg(0.34, 1); o.fillRect(0, H * 0.87, W / 2, H * 0.13); o.fillStyle = rg(0.92); o.fillRect(W / 2, H * 0.87, W / 2, H * 0.13);
  for (let i = 0; i < 200; i++) { o.fillStyle = `rgba(0,${R() < 0.5 ? 200 : 40},255,${0.1 + R() * 0.2})`; o.fillRect(R() * W / 2, H * 0.87 + R() * H * 0.13, 2 + R() * 30, 1 + R() * 2); }
  const orm = BAGR.orm = new THREE.CanvasTexture(oc); orm.anisotropy = 4; orm.wrapS = THREE.RepeatWrapping;

  /* height → normal map: pebbled grain, creases, the seams (groove between two raised lips, stitches), the band's edge */
  const hc = mk(), h = hc.getContext('2d'); h.fillStyle = '#808080'; h.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) { const x = R() * W, y = R() * bodyH, r = 1.2 + R() * 2.2; h.fillStyle = `rgba(255,255,255,${0.04 + R() * 0.07})`; h.beginPath(); h.ellipse(x, y, r, r * 0.72, R() * 3, 0, 7); h.fill(); }
  for (const s of creases) { for (const [lw, a] of [[7, 0.05], [3.5, 0.1], [1.5, 0.18]]) { h.strokeStyle = `rgba(0,0,0,${a * (0.5 + s.k)})`; h.lineWidth = lw; wrapX(h, () => { h.beginPath(); h.moveTo(s.x, s.y); h.bezierCurveTo(s.x + s.l / 3, s.y + s.b1, s.x + 2 * s.l / 3, s.y + s.b2, s.x + s.l, s.y + (s.b1 + s.b2) * 0.2); h.stroke(); }); } }
  for (const s of scratches) { h.strokeStyle = `rgba(0,0,0,${0.15 + s.k * 0.25})`; h.lineWidth = 0.8 + s.k; h.beginPath(); h.moveTo(s.x, s.y); h.lineTo(s.x2, s.y2); h.stroke(); }
  for (const s of scuffs) wrapX(h, () => { h.save(); h.translate(s.x, s.y); h.rotate(s.a); h.scale(1, s.ry / s.rx); const gr = h.createRadialGradient(0, 0, 0, 0, 0, s.rx); gr.addColorStop(0, `rgba(128,128,128,${0.25 + s.k * 0.4})`); gr.addColorStop(1, 'rgba(128,128,128,0)'); h.fillStyle = gr; h.beginPath(); h.arc(0, 0, s.rx, 0, 7); h.fill(); h.restore(); });   // rubbed smooth
  h.fillStyle = 'rgba(255,255,255,.2)'; h.fillRect(0, sy(B0), W, sy(B1) - sy(B0)); h.fillStyle = 'rgba(255,255,255,.3)'; h.fillRect(0, sy(B0), W, 7); h.fillRect(0, sy(B1) - 7, W, 7);
  const lip = (x, y, w, hh, vert) => { for (const [k, a] of [[1, 0.16], [0.7, 0.2], [0.4, 0.22]]) { h.fillStyle = `rgba(255,255,255,${a})`; if (vert) h.fillRect(x - w * k, y, 2 * w * k, hh); else h.fillRect(x, y - w * k, hh, 2 * w * k); } h.fillStyle = 'rgba(0,0,0,.85)'; if (vert) h.fillRect(x - 2, y, 4, hh); else h.fillRect(x, y - 1.5, hh, 3); };
  for (const u of SEAMS) { const x = W * u; lip(x, 0, 13, bodyH, true); stitch(h, x - 7, sy(0), x - 7, sy(1), 'rgba(255,255,255,.7)', 2.2); stitch(h, x + 7, sy(0), x + 7, sy(1), 'rgba(255,255,255,.7)', 2.2); }
  for (const t of HS) { const y = sy(t); lip(0, y, 11, W, false); stitch(h, 0, y - 6, W, y - 6, 'rgba(255,255,255,.7)', 2, [6, 5]); stitch(h, 0, y + 6, W, y + 6, 'rgba(255,255,255,.7)', 2, [6, 5]); }
  stitch(h, 0, sy(B0) + 3, W, sy(B0) + 3, 'rgba(255,255,255,.6)', 2, [6, 5]); stitch(h, 0, sy(B1) - 3, W, sy(B1) - 3, 'rgba(255,255,255,.6)', 2, [6, 5]);
  h.fillStyle = '#808080'; h.fillRect(0, H * 0.87, W, H * 0.13);
  for (let y = H * 0.87; y < H; y += 4) { h.fillStyle = 'rgba(255,255,255,.3)'; h.fillRect(W / 2, y, W / 2, 2); } for (let x = W / 2; x < W; x += 5) { h.fillStyle = 'rgba(0,0,0,.3)'; h.fillRect(x, H * 0.87, 1.5, H * 0.13); }
  const src = h.getImageData(0, 0, W, H).data, im = h.createImageData(W, H), hv = (x, y) => src[((y < 0 ? 0 : y >= H ? H - 1 : y) * W + (x + W) % W) * 4] / 255, d = im.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (hv(x - 1, y) - hv(x + 1, y)) * 2.6, dy = (hv(x, y + 1) - hv(x, y - 1)) * 2.6 / AS, l = 1 / Math.hypot(dx, dy, 1), k = (y * W + x) * 4;
    d[k] = (dx * l * 0.5 + 0.5) * 255; d[k + 1] = (dy * l * 0.5 + 0.5) * 255; d[k + 2] = (l * 0.5 + 0.5) * 255; d[k + 3] = 255; }
  h.putImageData(im, 0, 0);
  const nrm = BAGR.nrm = new THREE.CanvasTexture(hc); nrm.anisotropy = 8; nrm.wrapS = THREE.RepeatWrapping;
  return { map, normalMap: nrm, orm };
}

/* geometry: the leather body (a lathe with enough rows for the dents), piping, straps, D-rings, the swivel — one mesh */
function bagGeometry() {
  const { R, HB, LEN, RING } = BAGR, yT = -HB, yB = -HB - LEN, parts = [];
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const sideR = t => R * (1 + 0.03 * Math.sin(Math.PI * Math.pow(t, 1.6))) * (1 - 0.045 * (1 - sm(0, 0.05, t))) * (t > 0.92 ? Math.sqrt(1 - 0.5 * ((t - 0.92) / 0.08) ** 2) : 1);
  const lathe = (rows, cols) => {   // rows: [r, y, v]; u runs clockwise seen from above, so the print reads left to right from outside
    const n = rows.length, pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i < n; i++) { const a = rows[Math.max(0, i - 1)], b = rows[Math.min(n - 1, i + 1)], dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1, nr = -dy / l, ny = dr / l;
      for (let j = 0; j <= cols; j++) { const u = j / cols, cs = Math.cos(2 * Math.PI * u), sn = -Math.sin(2 * Math.PI * u); pos.push(rows[i][0] * cs, rows[i][1], rows[i][0] * sn); nor.push(nr * cs, ny, nr * sn); uv.push(u, rows[i][2]); } }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  };
  const r0 = sideR(0), dome = [], side = [];
  for (let i = 0; i <= 5; i++) { const f = i / 5; dome.push([r0 * f, yT + 0.016 * (1 - f * f), 1 - 0.04 * f]); }
  for (let j = 0; j <= 46; j++) { const t = j / 46; side.push([sideR(t), yT - t * LEN, 0.96 - 0.78 * t]); }
  const rb = sideR(1); for (let k = 1; k <= 5; k++) { const f = k / 5; side.push([rb * (1 - f), yB - 0.02 * f * (2 - f), 0.18 - 0.04 * f]); }
  parts.push(lathe(dome, 56), lathe(side, 56));
  // hardware: built from three.js primitives, their UVs squeezed into the steel / webbing patch of the texture
  const ST = [0.03, 0.02, 0.44, 0.08], WB = [0.53, 0.02, 0.44, 0.08];
  const put = (g, rect, m) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + (uv.getX(i) % 1) * rect[2], rect[1] + uv.getY(i) * rect[3]); if (m) g.applyMatrix4(m); if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); parts.push(g); };
  const basis = (x, y, z, p) => new M4().makeBasis(x, y, z).setPosition(p);
  put(new THREE.TorusGeometry(r0 + 0.001, 0.0065, 6, 48).rotateX(Math.PI / 2).translate(0, yT - 0.004, 0), WB);   // piping round the top rim
  put(new THREE.TorusGeometry(sideR(0.925) + 0.001, 0.005, 6, 48).rotateX(Math.PI / 2).translate(0, yT - 0.925 * LEN, 0), WB);   // and round the bottom cup
  // the swivel: barrel, the eye the main chain hangs in, the ring the bridle hangs on
  put(new THREE.CylinderGeometry(0.011, 0.013, 0.03, 10), ST); put(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 10).translate(0, 0.003, 0), ST);
  put(new THREE.TorusGeometry(0.013, 0.0042, 6, 14).translate(0, 0.026, 0), ST); put(new THREE.TorusGeometry(0.021, 0.005, 6, 16).rotateY(Math.PI / 4).translate(0, -0.034, 0), ST);
  BAGR.eye = new V3(0, 0.03, 0); BAGR.ringY = -0.052; BAGR.dring = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, cs = Math.cos(a), sn = Math.sin(a), rad = new V3(cs, 0, sn), tan = new V3(-sn, 0, cs);
    const bar = new V3(cs * RING, yT + 0.03, sn * RING), up = new V3(0, BAGR.ringY, 0).sub(bar).normalize(), out = new V3().crossVectors(tan, up).normalize();
    // the D-ring: a bar the strap is folded over, an arc the chain hangs in
    put(new THREE.TorusGeometry(0.02, 0.0042, 6, 12, Math.PI), ST, basis(tan, up, out, bar)); put(new THREE.CylinderGeometry(0.0042, 0.0042, 0.048, 6).rotateZ(Math.PI / 2), ST, basis(tan, up, out, bar));
    BAGR.dring.push(bar.clone().addScaledVector(up, 0.017));
    // the strap: sewn down the side of the bag, over the rim, round the bar and back
    const s0 = new V3(cs * (sideR(0.14) + 0.004), yT - 0.17, sn * (sideR(0.14) + 0.004)), s1 = new V3(cs * (sideR(0.03) + 0.004), yT - 0.03, sn * (sideR(0.03) + 0.004)), s2 = bar.clone().addScaledVector(rad, 0.004);
    for (const [p, q, th] of [[s0, s1, 0.006], [s1, s2, 0.008]]) { const ax = q.clone().sub(p), len = ax.length(); ax.normalize(); const nn = new V3().crossVectors(tan, ax).normalize();
      put(new THREE.BoxGeometry(0.036, len + 0.008, th), WB, basis(tan, ax, nn, p.clone().add(q).multiplyScalar(0.5))); }
    put(new THREE.CylinderGeometry(0.008, 0.008, 0.037, 8).rotateZ(Math.PI / 2), WB, basis(tan, up, out, bar));   // the fold round the bar
  }
  // the loop under the bag (for a floor anchor)
  put(new THREE.BoxGeometry(0.03, 0.03, 0.006).translate(0, yB - 0.03, 0), WB); put(new THREE.TorusGeometry(0.017, 0.0038, 6, 12).translate(0, yB - 0.058, 0), ST);
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  return mergeGeometries(parts);
}
/* one chain link: an oval of round wire, long axis x, lying in the xy plane; inner length = the pitch of the chain */
const BAG_PITCH = 0.0336;
function linkGeometry() {
  const s = 0.0105, r = 0.0105, pts = [];
  for (let i = 0; i < 16; i++) { const a = i / 16 * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a); pts.push(new V3((c > 0 ? s : -s) * Math.min(1, Math.abs(c) * 3) + r * c, r * sn, 0)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5), 18, 0.0042, 5, true);
}

{
  const g = BAG.g = new THREE.Group(); g.visible = false; scene.add(g);
  const u = BAG.u = { uDent: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -1, 0, 0)) }, uWob: { value: new THREE.Vector4(1, 0, 0, 0) }, uRip: { value: new THREE.Vector4(-1, 0, 0, 0) } };
  const mat = BAG.mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1, envMapIntensity: 0.75, normalScale: new THREE.Vector2(1, 1) });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'uniform vec4 uDent[4]; uniform vec4 uWob; uniform vec4 uRip;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 bagP = position;
        {
          float bt = ( ${(-BAGR.HB).toFixed(3)} - position.y ) / ${BAGR.LEN.toFixed(3)};   // 0 at the top seam … 1 at the bottom
          float bw = smoothstep( 0.0, 0.08, bt ) * smoothstep( 1.0, 0.92, bt );
          vec2 rd = normalize( position.xz + vec2( 1e-5 ) ); vec3 rad = vec3( rd.x, 0.0, rd.y ), grad = vec3( 0.0 );
          // ripple: a ring of bulge running up and down from the height of the hit
          float ry = position.y - uRip.x, re = uRip.y * exp( - abs( ry ) * 2.4 ) * bw, rph = abs( ry ) * 17.0 - uRip.z;
          bagP += rad * re * cos( rph ); grad.y -= re * 17.0 * sign( ry ) * sin( rph );
          // wobble: the filling bends like a soft column
          bagP.xz += uWob.xy * ( uWob.z * sin( bt * 5.2 - uWob.w ) * bw );
          // dents: the leather goes in under the fist and bulges a little around it
          for ( int i = 0; i < 4; i ++ ) {
            vec3 dv = position - uDent[ i ].xyz; float d2 = dot( dv, dv ), g1 = exp( - d2 / 0.0072 ), g2 = 0.24 * exp( - d2 / 0.0288 ), A = uDent[ i ].w * step( position.y, ${(-BAGR.HB + 0.02).toFixed(3)} );
            bagP -= rad * A * ( g1 - g2 ); grad += dv * A * ( g1 / 0.0036 - g2 / 0.0144 );
          }
          objectNormal = normalize( objectNormal - ( grad - objectNormal * dot( grad, objectNormal ) ) );
        }`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = bagP;');
  };
  const body = BAG.body = new THREE.Mesh(bagGeometry(), mat); body.castShadow = true; body.frustumCulled = false; g.add(body);
  BAG.setSkin = i => { const S = BAG_SKINS[i % BAG_SKINS.length], T = S.tex || (S.tex = bagTextures(S)); mat.map = T.map; mat.normalMap = T.normalMap; mat.roughnessMap = mat.metalnessMap = T.orm; mat.needsUpdate = true; BAG.skin = i % BAG_SKINS.length; };
  /* chains: [0] the main chain, hook → the swivel's eye; [1…4] the bridle, the swivel's ring → the D-rings */
  const N0 = 12, N1 = 9, chains = BAG.chains = [], mk = n => ({ n, p: new Float32Array((n + 1) * 3), o: new Float32Array((n + 1) * 3), a: new V3(), b: new V3(), pitch: BAG_PITCH, slack: 0, roll: 0 });
  chains.push(mk(N0)); for (let k = 0; k < 4; k++) { const c = mk(N1); c.roll = k * Math.PI / 2 + Math.PI / 4; chains.push(c); }
  chains[0].pitch = (BAGR.L1 - 0.065 - BAGR.eye.y) / N0; for (let k = 0; k < 4; k++) chains[k + 1].pitch = _hb1.set(0, BAGR.ringY, 0).distanceTo(BAGR.dring[k]) / N1;
  const NL = N0 + 4 * N1 + 1, links = BAG.links = new THREE.InstancedMesh(linkGeometry(), new THREE.MeshStandardMaterial({ color: '#8d9197', roughness: 0.42, metalness: 0.95, envMapIntensity: 0.8 }), NL);
  links.instanceMatrix.setUsage(THREE.DynamicDrawUsage); links.frustumCulled = false; links.matrixAutoUpdate = false; g.add(links);
  /* dust: knocked out of the seams and off the top by a heavy shot */
  const ND = 160, dp = new Float32Array(ND * 3), dv = new Float32Array(ND * 3), dl = new Float32Array(ND), ds = new Float32Array(ND), da = new Float32Array(ND), dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3).setUsage(THREE.DynamicDrawUsage)); dgeo.setAttribute('aS', new THREE.BufferAttribute(ds, 1).setUsage(THREE.DynamicDrawUsage)); dgeo.setAttribute('aA', new THREE.BufferAttribute(da, 1).setUsage(THREE.DynamicDrawUsage));
  const dust = new THREE.Points(dgeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uScale: { value: 900 } },
    vertexShader: 'attribute float aS; attribute float aA; varying float vA; uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min( aS * uScale / -mv.z, 120.0 ); vA = aA; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard; float a = vA * smoothstep(0.25, 0.0, d) * smoothstep(0.25, 0.0, d); gl_FragColor = vec4(0.78, 0.72, 0.62, a); }' }));
  dust.frustumCulled = false; dust.matrixAutoUpdate = false; dust.visible = false; g.add(dust); let dh = 0;
  BAG.dust = (p, n, power) => {   // p: contact (world), n: outward normal of the leather there
    const cnt = Math.round((30 + 40 * power) * GFX.particles); if (cnt > 0) dust.visible = true;
    for (let k = 0; k < cnt; k++) { const i = dh++ % ND, j = 3 * i, top = k % 3 === 2, sp = 0.25 + rr() * 0.9;
      if (top) { const a = rr() * 6.283, r = BAGR.R * (0.5 + 0.5 * rr()); _hb1.set(Math.cos(a) * r, -BAGR.HB + 0.01, Math.sin(a) * r).applyMatrix4(BAG.body.matrixWorld); dp[j] = _hb1.x; dp[j + 1] = _hb1.y; dp[j + 2] = _hb1.z; dv[j] = Math.cos(a) * 0.25; dv[j + 1] = 0.25 + rr() * 0.4; dv[j + 2] = Math.sin(a) * 0.25; }
      else { dp[j] = p.x + (rr() - 0.5) * 0.1; dp[j + 1] = p.y + (rr() - 0.5) * 0.12; dp[j + 2] = p.z + (rr() - 0.5) * 0.1; dv[j] = n.x * sp + (rr() - 0.5) * 0.9; dv[j + 1] = (rr() - 0.3) * 0.7; dv[j + 2] = n.z * sp + (rr() - 0.5) * 0.9; }
      dl[i] = 0.6 + rr() * 1.0; ds[i] = 0.03 + rr() * 0.05; da[i] = (0.018 + 0.022 * rr()) * (0.6 + 0.4 * power); }
  };
  BAG.dustStep = dt => {
    if (!dust.visible) return; let any = false; const dr = Math.exp(-dt * 3.2);
    for (let i = 0; i < ND; i++) { if (dl[i] <= 0) { da[i] = 0; continue; } any = true; const j = 3 * i; dv[j] *= dr; dv[j + 1] = dv[j + 1] * dr - 0.25 * dt; dv[j + 2] *= dr;
      dp[j] += dv[j] * dt; dp[j + 1] += dv[j + 1] * dt; dp[j + 2] += dv[j + 2] * dt; dl[i] -= dt; da[i] = Math.min(da[i], dl[i] * 0.08); ds[i] *= 1 + dt * 1.8; }
    dgeo.attributes.position.needsUpdate = dgeo.attributes.aS.needsUpdate = dgeo.attributes.aA.needsUpdate = true; dust.visible = any;
  };
  BAG.dustClear = () => { dl.fill(0); da.fill(0); dust.visible = false; };
  Object.assign(BAG, { a: new V3(), av: new V3(), b: new V3(), bv: new V3(), yaw: 0, yawV: 0, lift: 0, liftV: 0, top: new V3(0, 1.86, 0), bot: new V3(0, 0.66, 0), topV: new V3(), botV: new V3(), hook: new V3(), pen: 0, penDir: 1, rattle: 0, dentI: 0, wobA: 0, ripA: 0, clinkT: 0, swingS: 0, skin: -1 });
}
/* put the bag back at rest (startBag) */
function bagReset() {
  BAG.a.set(0, 0, 0); BAG.av.set(0, 0, 0); BAG.b.set(0, 0, 0); BAG.bv.set(0, 0, 0); BAG.topV.set(0, 0, 0); BAG.botV.set(0, 0, 0);
  Object.assign(BAG, { yaw: 0, yawV: 0, lift: 0, liftV: 0, pen: 0, rattle: 0, wobA: 0, ripA: 0, clinkT: 0, swingS: 0, fresh: true });
  for (const d of BAG.u.uDent.value) d.w = 0; BAG.u.uWob.value.z = 0; BAG.u.uRip.value.y = 0; BAG.dustClear();
}
/* world pose of the bag from its state; the ends of the chains */
function bagPose(dt) {
  const { L1, HB, LEN } = BAGR, H = BAG.hook.set(BAG.x, BAGR.HOOK, 0), body = BAG.body;
  _hb1.set(BAG.a.x, -1, BAG.a.z).normalize(); body.position.copy(H).addScaledVector(_hb1, L1); body.position.y += BAG.lift;
  _hb2.set(BAG.b.x, -1, BAG.b.z).normalize(); body.quaternion.setFromUnitVectors(_hbDn, _hb2).multiply(_hbQ.setFromAxisAngle(_hbY, BAG.yaw));
  body.updateMatrixWorld(true);
  _hb3.copy(BAG.top); _hb4.copy(BAG.bot);
  BAG.top.set(0, -HB, 0).applyMatrix4(body.matrixWorld); BAG.bot.set(0, -HB - LEN, 0).applyMatrix4(body.matrixWorld);
  if (dt > 0 && !BAG.fresh) { BAG.topV.copy(BAG.top).sub(_hb3).multiplyScalar(1 / dt); BAG.botV.copy(BAG.bot).sub(_hb4).multiplyScalar(1 / dt); } else { BAG.topV.set(0, 0, 0); BAG.botV.set(0, 0, 0); }
  const C = BAG.chains; C[0].a.set(H.x, H.y - 0.065, H.z); C[0].b.copy(BAGR.eye).applyMatrix4(body.matrixWorld);
  for (let k = 0; k < 4; k++) { const a = C[k + 1].roll; C[k + 1].a.set(Math.cos(a) * 0.012, BAGR.ringY, Math.sin(a) * 0.012).applyMatrix4(body.matrixWorld); C[k + 1].b.copy(BAGR.dring[k]).applyMatrix4(body.matrixWorld); }
}
/* verlet ropes: gravity, damping, then the links are pulled back to their pitch; the ends are pinned */
function bagChains(dt) {
  const C = BAG.chains, fresh = BAG.fresh, damp = Math.exp(-dt * 5), g = 9.81 * dt * dt, jit = BAG.rattle * 0.0025;
  for (let ci = 0; ci < C.length; ci++) {
    const c = C[ci], n = c.n, p = c.p, o = c.o, A = c.a, B = c.b, pitch = c.pitch * (1 + 0.004 * Math.min(1, BAG.rattle));
    if (fresh) { for (let i = 0; i <= n; i++) { const f = i / n; p[3 * i] = o[3 * i] = A.x + (B.x - A.x) * f; p[3 * i + 1] = o[3 * i + 1] = A.y + (B.y - A.y) * f; p[3 * i + 2] = o[3 * i + 2] = A.z + (B.z - A.z) * f; } continue; }
    for (let i = 1; i < n; i++) { const j = 3 * i; for (let k = 0; k < 3; k++) { const v = (p[j + k] - o[j + k]) * damp; o[j + k] = p[j + k]; p[j + k] += v + (k === 1 ? -g : (rr() - 0.5) * jit); } }
    for (let it = 0; it < 14; it++) {
      p[0] = A.x; p[1] = A.y; p[2] = A.z; p[3 * n] = B.x; p[3 * n + 1] = B.y; p[3 * n + 2] = B.z;
      for (let i = 0; i < n; i++) { const j = 3 * i, dx = p[j + 3] - p[j], dy = p[j + 4] - p[j + 1], dz = p[j + 5] - p[j + 2], L = Math.hypot(dx, dy, dz) || 1e-6, wa = i === 0 ? 0 : 1, wb = i === n - 1 ? 0 : 1, e = (L - pitch) / L / (wa + wb || 1);
        p[j] += dx * e * wa; p[j + 1] += dy * e * wa; p[j + 2] += dz * e * wa; p[j + 3] -= dx * e * wb; p[j + 4] -= dy * e * wb; p[j + 5] -= dz * e * wb; }
    }
    p[0] = A.x; p[1] = A.y; p[2] = A.z; p[3 * n] = B.x; p[3 * n + 1] = B.y; p[3 * n + 2] = B.z;
  }
  // every link: centred on its segment, long axis along it, each next one turned a quarter; the main chain also takes up the bag's twist
  const M = BAG.links; let k = 0;
  _hbM.compose(_hb1.set(BAG.hook.x, BAG.hook.y - 0.028, BAG.hook.z), _hbQ.setFromUnitVectors(_hbX, _hbDn), _hb2.set(1.75, 1.75, 1.75)); M.setMatrixAt(k++, _hbM);   // the shackle on the beam
  for (let ci = 0; ci < C.length; ci++) {
    const c = C[ci], n = c.n, p = c.p;
    for (let i = 0; i < n; i++) { const j = 3 * i; _hb1.set(p[j + 3] - p[j], p[j + 4] - p[j + 1], p[j + 5] - p[j + 2]); const L = _hb1.length() || 1e-6; _hb1.multiplyScalar(1 / L);
      _hbQ.setFromUnitVectors(_hbX, _hb1).multiply(_hbQ2.setFromAxisAngle(_hbX, c.roll + (i & 1 ? Math.PI / 2 : 0) + (ci ? BAG.yaw : BAG.yaw * (i + 1) / n)));
      _hbM.compose(_hb2.set((p[j] + p[j + 3]) / 2, (p[j + 1] + p[j + 4]) / 2, (p[j + 2] + p[j + 5]) / 2), _hbQ, _hbS); M.setMatrixAt(k++, _hbM); }
  }
  M.instanceMatrix.needsUpdate = true;
}
function bagStep(dt) {
  if (!BAG.on) return;
  if (BAG.x == null) { BAG.x = P2.headNow.x + 0.13 * (Math.sign(P2.group.position.x - P1.group.position.x) || 1); BAG.fresh = true; }
  if (dt <= 0 && !BAG.fresh) return;
  dt = Math.min(dt, 1 / 30);
  const { L1, D, RHO2 } = BAGR, g = 9.81, K = g * D / RHO2, n = 4, h = dt / n, pf = BAG.pen > 0 ? Math.min(BAG.pen, 0.1) * 900 / BAG.mass * BAG.penDir : 0;   // a man the bag swings into holds it off (m/s²)
  for (let s = 0; s < n && dt > 0; s++) {
    for (let q = 0; q < 2; q++) { const k = q ? 'z' : 'x';
      const bdd = -K * (BAG.b[k] - BAG.a[k]) - 10 * (BAG.bv[k] - BAG.av[k]) - 0.3 * BAG.bv[k], add = (-g * BAG.a[k] + (k === 'x' ? pf : 0) - D * bdd) / L1 - 2.2 * BAG.av[k];
      BAG.av[k] += add * h; BAG.bv[k] += bdd * h; BAG.a[k] += BAG.av[k] * h; BAG.b[k] += BAG.bv[k] * h;
    }
    BAG.yawV += (-9 * BAG.yaw - 1.5 * BAG.yawV) * h; BAG.yaw += BAG.yawV * h;   // the bridle and the chain wind up and bring it back (the swivel lets most of it go)
    if (BAG.lift > 0 || BAG.liftV > 0) { BAG.liftV -= g * h; BAG.lift += BAG.liftV * h;
      if (BAG.lift <= 0) { const v = -BAG.liftV; BAG.lift = 0; BAG.liftV = v > 0.5 ? v * 0.22 : 0; if (v > 0.25) { sfx.clink(clamp(v * 0.9, 0.15, 1)); BAG.rattle = Math.max(BAG.rattle, clamp(v, 0, 1)); } } }
  }
  BAG.pen = 0;
  // the chains ring at the end of a big swing, when the links settle the other way
  { const s = Math.sign(BAG.av.x * BAG.a.x + BAG.av.z * BAG.a.z), amp = Math.hypot(BAG.a.x, BAG.a.z); if (s < 0 && BAG.swingS > 0 && amp > 0.07 && G.t > BAG.clinkT) { sfx.clink(clamp(amp * 2.2, 0.12, 0.7)); BAG.clinkT = G.t + 0.5; BAG.rattle = Math.max(BAG.rattle, amp * 2); } BAG.swingS = s; }
  BAG.rattle *= Math.exp(-dt * 5);
  // the leather: dents spring back (fast at first, the last of it slowly), the wobble and the ripple run and die out
  for (const d of BAG.u.uDent.value) d.w = d.w > 1e-4 ? d.w * Math.exp(-dt * (d.w > 0.012 ? 9 : 4)) : 0;
  const wb = BAG.u.uWob.value, rp = BAG.u.uRip.value; BAG.wobA *= Math.exp(-dt * 4.5); wb.z = BAG.wobA; wb.w += dt * 34; BAG.ripA *= Math.exp(-dt * 6); rp.y = BAG.ripA; rp.z += dt * 42;
  bagPose(dt); bagChains(dt); BAG.dustStep(dt); BAG.fresh = false;
}
/* closest point of the bag's axis to p (world) → out; returns the distance from the axis */
function bagNear(p, out) {
  const ab = _hb5.subVectors(BAG.bot, BAG.top), t = clamp(out.subVectors(p, BAG.top).dot(ab) / ab.lengthSq(), 0, 1);
  return out.copy(BAG.top).addScaledVector(ab, t).distanceTo(p);
}
// where a punch is thrown: a point just under the leather at head (or rib) height, on the side the fist comes from
function bagAim(att) {
  const P = PUNCH[att.cur], kn = att.knuckle(_v5), y = att.bodyShot ? P2.ribs[att.ribIdx].w.y : P2.headNow.y - (P.type === 'upper' ? 0.1 : 0);
  const t = clamp((BAG.top.y - y) / (BAG.top.y - BAG.bot.y), 0.04, 0.96), c = _v6.lerpVectors(BAG.top, BAG.bot, t), dir = _v4.subVectors(kn, c).setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(-1, 0, 0); dir.normalize();
  att.aimV.copy(c).addScaledVector(dir, BAGR.R - 0.035 + (att.gear.spar ? 0.06 : 0));
  if (P.type === 'over') att.aimV.y += 0.26 * (1 - clamp((att.act[att.cur].time - P.impact + 0.16) / 0.16, 0, 1));
  return att.aimV;
}
function bagMiss(att) { return Math.max(0, bagNear(att.knuckle(_v5), _v6) - BAGR.R - 0.03); }   // how far the knuckles are from the leather
function bagContact(att) {   // the knuckles are on the leather: the point of contact (a new vector) or null
  const kn = att.knuckle(_v5), d = bagNear(kn, _v6); if (d > BAGR.R + 0.03 + (att.gear.spar ? 0.06 : 0) || d < 1e-4) return null;
  return kn.clone().sub(_v6).setLength(BAGR.R).add(_v6);
}
// arms don't go through the bag (see clearPt): the largest push that takes point p (radius r) out of it; `deep`: how far a punching fist may sink in
function bagClearPt(p, r, deep, push) {
  const L = bagNear(p, _hb1), need = BAGR.R + r - deep; if (L >= need || L < 1e-5) return;
  _hb1.subVectors(p, _hb1).multiplyScalar((need - L) / L); if (_hb1.lengthSq() > push.lengthSq()) push.copy(_hb1);
}
// the body and the bag don't share space (see Fighter.footwork): how far F's torso / head / knees are inside the bag along the line
function bagBodyPen(F, fwd) {
  let pen = 0;
  for (let k = 0; k < SEP_T.length; k++) { const p = sepPt(F, SEP_T[k][0], _sa); bagNear(p, _hb1); const r = SEP_T[k][1] + BAGR.R, dz = _hb1.z - p.z, q = r * r - dz * dz; if (q <= 0) continue; const e = Math.sqrt(q) - (_hb1.x - p.x) * fwd; if (e > pen) pen = e; }
  BAG.pen = pen; BAG.penDir = fwd; return pen;
}
/* a punch lands: impulse J (N·s) along `dir` at `pos` (world). Above the centre of mass it rocks the bag under the swivel, off the
   axis it twists it, an upward part unloads the chains. Then the leather: a dent, wobble, ripple, dust; and the sound */
function bagImpact(pos, dir, J, power, twist) {
  const { L1, D, RHO2, KAP, R, HB, LEN } = BAGR, m = BAG.mass, body = BAG.body;
  const c = _hb2; bagNear(pos, c); const ax = _hb5.subVectors(BAG.top, BAG.bot).normalize();
  const hc = clamp(_hb1.subVectors(pos, BAG.top).dot(ax) + LEN / 2, -0.5, 0.5);   // height of the hit above the centre of mass
  for (let q = 0; q < 2; q++) { const k = q ? 'z' : 'x'; const dv = J * dir[k] / m, db = -dv * hc / RHO2 * KAP; BAG.bv[k] += db; BAG.av[k] += (dv - D * db) / L1; }
  // twist: the moment of the blow about the axis (the fist slides, little of it bites) + the drag of a hook across the leather
  const rh = _hb1.subVectors(pos, c), tq = _hb3.crossVectors(rh, dir).dot(ax) * J;
  BAG.yawV += clamp(tq * 0.06 / (0.5 * m * R * R) + (twist || 0), -1.4, 1.4);
  if (dir.y > 0.05) BAG.liftV += dir.y * J / m * 1.6;
  // the leather
  const l = _hb3.copy(pos).applyMatrix4(_hbM.copy(body.matrixWorld).invert()), rr2 = Math.hypot(l.x, l.z) || 1; l.x *= R / rr2; l.z *= R / rr2; l.y = clamp(l.y, -HB - LEN + 0.06, -HB - 0.06);
  const dents = BAG.u.uDent.value; let di = 0; for (let i = 1; i < 4; i++) if (dents[i].w < dents[di].w) di = i;
  for (let i = 0; i < 4; i++) if (dents[i].w > 0.002 && _hb4.set(dents[i].x, dents[i].y, dents[i].z).distanceTo(l) < 0.07) di = i;   // the same place again: the dent deepens
  dents[di].set(l.x, l.y, l.z, Math.min(0.06, Math.max(dents[di].w, 0.014 + 0.03 * power)));
  const cy = Math.cos(BAG.yaw), sy = Math.sin(BAG.yaw), hx = dir.x, hz = dir.z, hl = Math.hypot(hx, hz) || 1, wb = BAG.u.uWob.value;
  wb.x = (hx * cy - hz * sy) / hl; wb.y = (hx * sy + hz * cy) / hl; wb.w = 0; BAG.wobA = Math.min(0.03, BAG.wobA + 0.004 + 0.011 * power);
  const rp = BAG.u.uRip.value; rp.x = l.y; rp.z = 0; BAG.ripA = Math.min(0.012, 0.002 + 0.006 * power);
  BAG.rattle = Math.max(BAG.rattle, power);
  if (power > 0.8) BAG.dust(pos, _hb4.copy(rh).setY(0).normalize(), Math.min(1.4, power));
  sfx.bag(power); if (power > 0.55) sfx.clink(0.1 + 0.25 * power, 0.03);
}
BAG.impact = bagImpact;   // debug: __g.BAG.impact(pos, dir, J, power, twist)
