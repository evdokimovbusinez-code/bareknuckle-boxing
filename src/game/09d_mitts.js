/* ───────── the coach's focus mitts (лапы) — the trainer dummy for combo work ─────────
   P2 is the coach in drill mode: bare-knuckled, no gloves, holding a pair of padded focus mitts. `__mitts.start()`
   moves both men into the gym (location `boxgym`, the ring), switches P2's AI off and puts the mitts on his wrists;
   `hit('L'|'R', 0..1)` throws a real punch from P1's arsenal (jab / cross / hook by the current `hold` call).

   Model (fully procedural, no external files): a superellipse outline extruded through profile rings — a domed
   striking face ~7 cm thick, plain leather back, a welt cord round the rim with tan stitching, a target circle
   printed on the face, and a leather cocoon + wrist strap on the back (the fingers live in it, invisible).
   PBR from canvas maps: colour, Sobel height → normal, roughness/metalness ("ORM").

   Rig: the mitts are world-space objects mounted on P2's wrist points. P2's arms are re-IK'd to the fed mitt's
   wrist every frame after he is posed (so the coach's stance and idle sway carry the mitts), his wraps / gloves /
   headgear / MMA pads are hidden for the drill. Feeds: `jab` (left pad straight in front of the face), `cross`
   (right pad, same line), `hook` (left pad edge-on, face toward the camera side); the other hand holds a low guard.

   Reaction: on a landed punch the wrist springs away along the strike direction (damped harmonic oscillator,
   force ∝ punch power — the arm and the pad give together), the face of the pad yaws off-centre and tips back,
   and the leather ripples (vertex-shader displacement, fast decay). `sfx.smack` is the slap. A whiff gets nothing.
   No damage is dealt — resolveHit branches on `MITTS.on` straight to `mittHit`. ───────── */
const MITT_A = 0.126, MITT_B = 0.104, MITT_N = 3.1;   // outline half-axes (25 × 21 cm) and the superellipse exponent
const MITT_FLOW = 9.0;                                // 1/s — how fast the mitts glide to a new feed pose
// profile rings [scale of the outline, z] from the rim (equator) to the pole — the striking face
const MIT_FRONT = [ [1.000, 0.004], [0.975, 0.0145], [0.915, 0.024], [0.795, 0.0325], [0.610, 0.039], [0.345, 0.043], [0.018, 0.045] ];
const MIT_BACK  = [ [1.000, 0.004], [0.985, -0.008], [0.925, -0.0165], [0.800, -0.024], [0.610, -0.0295], [0.345, -0.0335], [0.018, -0.0355] ];
const MIT_SCOOP = [ [1.000, -0.035], [0.990, -0.050], [0.925, -0.0635], [0.790, -0.0745], [0.585, -0.0825], [0.330, -0.0875], [0.018, -0.0905] ];
/* spring tuning: the pad + the give of the coach's arm. d along the strike direction, tilt about the pad's local x,
   yaw about its local y. Underdamped so one hit rings for ~0.6 s */
const MIT_KD = 190, MIT_CD = 10.5, MIT_KT = 150, MIT_CT = 9.0, MIT_KY = 130, MIT_CY = 8.5;

const MITTS = { on: false, hold: 'jab', mitts: null, combo: 0, best: 0, lastT: -9, save: null };
const _mt1 = new V3(), _mt2 = new V3(), _mt3 = new V3(), _mt4 = new V3(), _mt5 = new V3(), _mt6 = new V3(), _mt7 = new V3(), _mtQ = new Quat(), _mtQ2 = new Quat(), _mtX4 = new THREE.Matrix4(), _mtONE = new V3(1, 1, 1);

/* ── canvas helpers ─────────────────────────────────────────── */
function mittSeedRand(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mittCnv = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
function mittGrain(g, W, n, R, bodyH) {   // pebbled leather: two tones of cells + fine noise
  for (let i = 0; i < n; i++) { const a = 0.02 + R() * 0.055; g.fillStyle = `rgba(${R() < 0.5 ? '255,230,205' : '20,8,4'},${a})`; g.beginPath(); g.ellipse(R() * W, R() * (bodyH || W), 9 + R() * 42, 6 + R() * 26, R() * 3, 0, 7); g.fill(); }
  const im = g.getImageData(0, 0, W, W), d = im.data; for (let i = 0; i < d.length; i += 4) { const v = (R() - 0.5) * 15; d[i] += v; d[i + 1] += v; d[i + 2] += v; } g.putImageData(im, 0, 0);
}
function mittStitch(g, x0, y0, x1, y1, col, lw = 2, dash = [7, 5]) { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]); }
function mittNormalFromHeight(hc, strength) {   // Sobel → tangent-space normal map
  const W = hc.width, H = hc.height, hctx = hc.getContext('2d'), src = hctx.getImageData(0, 0, W, H).data, im = hctx.createImageData(W, H), d = im.data, hv = (x, y) => src[((y < 0 ? 0 : y >= H ? H - 1 : y) * W + (x + W) % W) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (hv(x - 1, y) - hv(x + 1, y)) * strength, dy = (hv(x, y + 1) - hv(x, y - 1)) * strength, l = 1 / Math.hypot(dx, dy, 1), k = (y * W + x) * 4; d[k] = (dx * l * 0.5 + 0.5) * 255; d[k + 1] = (dy * l * 0.5 + 0.5) * 255; d[k + 2] = (l * 0.5 + 0.5) * 255; d[k + 3] = 255; }
  const out = mittCnv(W); out.getContext('2d').putImageData(im, 0, 0); return out;
}

/* the leather: dark oxblood hide, cream target with a red centre on the face; the back is plain hide with a
   built-in seam pair. One seed per canvas so the two mitts match in tone but not in mottling */
const MIT_SKIN = { base: '#39271f', dark: '#231712', light: '#57403427', cream: '#e3d4b1', red: '#8a2b1d', thread: '#cbb489' };
function mittMakeTextures() {
  const W = 512, mk = () => mittCnv(W);
  const R1 = mittSeedRand(41);
  /* face — colour */
  const fc = mk(), f = fc.getContext('2d');
  f.fillStyle = MIT_SKIN.base; f.fillRect(0, 0, W, W);
  { const gr = f.createRadialGradient(W * 0.42, W * 0.4, 30, W * 0.5, W * 0.5, W * 0.75); gr.addColorStop(0, 'rgba(255,225,195,.10)'); gr.addColorStop(0.55, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.42)'); f.fillStyle = gr; f.fillRect(0, 0, W, W); }
  mittGrain(f, W, 210, R1);
  // scuffs and age
  for (let i = 0; i < 60; i++) { f.fillStyle = `rgba(${R1() < 0.6 ? '210,180,150' : '0,0,0'},${0.05 + R1() * 0.12})`; f.beginPath(); f.ellipse(R1() * W, R1() * W, 8 + R1() * 42, 5 + R1() * 26, R1() * 3, 0, 7); f.fill(); }
  for (let i = 0; i < 90; i++) { f.strokeStyle = R1() < 0.6 ? `rgba(225,200,175,${0.07 + R1() * 0.16})` : `rgba(0,0,0,${0.09 + R1() * 0.16})`; f.lineWidth = 0.6 + R1() * 1.3; const x = R1() * W, y = R1() * W, l = 6 + R1() * 60, a = R1() * 6.3; f.beginPath(); f.moveTo(x, y); f.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); f.stroke(); }
  const cx = W / 2, cy = W / 2;
  // the target: cream ring, red disc, small cream dot; a groove between print and hide
  f.strokeStyle = 'rgba(0,0,0,.72)'; f.lineWidth = 7; f.beginPath(); f.arc(cx, cy, 172, 0, 7); f.stroke();
  f.strokeStyle = MIT_SKIN.cream; f.lineWidth = 46; f.beginPath(); f.arc(cx, cy, 148, 0, 7); f.stroke();
  f.fillStyle = MIT_SKIN.red; f.beginPath(); f.arc(cx, cy, 122, 0, 7); f.fill();
  f.strokeStyle = 'rgba(0,0,0,.35)'; f.lineWidth = 4; f.beginPath(); f.arc(cx, cy, 122, 0, 7); f.stroke(); f.beginPath(); f.arc(cx, cy, 148, 0, 7); f.stroke();
  f.fillStyle = MIT_SKIN.cream; f.beginPath(); f.arc(cx, cy, 15, 0, 7); f.fill();
  // print: the brand under the target, faded like a gym-worn pad
  f.globalAlpha = 0.82; f.fillStyle = MIT_SKIN.cream; f.font = '700 30px "Arial Narrow", Arial, sans-serif'; f.textAlign = 'center';
  try { f.letterSpacing = '9px'; } catch (e) {}
  f.fillText('IRON JAW', cx, W * 0.865); f.globalAlpha = 1; try { f.letterSpacing = '0px'; } catch (e) {}
  const map = new THREE.CanvasTexture(fc); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;

  /* face — height (pebbled grain, engraved ring grooves, raised print) */
  const fh = mittCnv(W), h = fh.getContext('2d'); h.fillStyle = '#808080'; h.fillRect(0, 0, W, W);
  { const gr = h.createRadialGradient(cx, cy, 20, cx, cy, 220); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(0.6, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.12)'); h.fillStyle = gr; h.fillRect(0, 0, W, W); }
  for (let i = 0; i < 7000; i++) { const x = R1() * W, y = R1() * W, r = 1.1 + R1() * 2.3; h.fillStyle = `rgba(255,255,255,${0.05 + R1() * 0.09})`; h.beginPath(); h.ellipse(x, y, r, r * 0.72, R1() * 3, 0, 7); h.fill(); }
  h.strokeStyle = 'rgba(0,0,0,.85)'; h.lineWidth = 9; h.beginPath(); h.arc(cx, cy, 172, 0, 7); h.stroke();          // rim groove
  h.strokeStyle = 'rgba(0,0,0,.6)'; h.lineWidth = 6; h.beginPath(); h.arc(cx, cy, 148, 0, 7); h.stroke(); h.beginPath(); h.arc(cx, cy, 122, 0, 7); h.stroke();   // print edges
  h.fillStyle = 'rgba(255,255,255,.28)'; h.beginPath(); h.arc(cx, cy, 112, 0, 7); h.fill();                        // raised centre
  h.fillStyle = 'rgba(255,255,255,.2)'; h.beginPath(); h.arc(cx, cy, 15, 0, 7); h.fill();
  const normalMap = new THREE.CanvasTexture(mittNormalFromHeight(fh, 2.4)); normalMap.anisotropy = 8;

  /* face — ORM (R free · G roughness · B metalness) */
  const fo = mk(), o = fo.getContext('2d');
  o.fillStyle = 'rgb(0,158,0)'; o.fillRect(0, 0, W, W);   // hide: fairly rough
  for (let i = 0; i < 220; i++) { o.fillStyle = `rgba(0,${R1() < 0.55 ? 120 : 205},0,${0.05 + R1() * 0.1})`; o.beginPath(); o.ellipse(R1() * W, R1() * W, 12 + R1() * 50, 8 + R1() * 34, R1() * 3, 0, 7); o.fill(); }
  o.strokeStyle = 'rgb(0,120,0)'; o.lineWidth = 46; o.beginPath(); o.arc(cx, cy, 148, 0, 7); o.stroke();            // cream print, smoother
  o.fillStyle = 'rgb(0,105,0)'; o.beginPath(); o.arc(cx, cy, 122, 0, 7); o.fill();                                 // red centre, polished by fists
  o.fillStyle = 'rgb(0,128,0)'; o.beginPath(); o.arc(cx, cy, 15, 0, 7); o.fill();
  const orm = new THREE.CanvasTexture(fo); orm.anisotropy = 4;

  /* body — plain hide, one seam pair where the leather was folded over the foam, colour + normal + roughness */
  const R2 = mittSeedRand(97);
  const bc = mk(), b = bc.getContext('2d');
  b.fillStyle = MIT_SKIN.base; b.fillRect(0, 0, W, W);
  { const gr = b.createLinearGradient(0, 0, 0, W); gr.addColorStop(0, 'rgba(0,0,0,.38)'); gr.addColorStop(0.35, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(255,225,195,.07)'); b.fillStyle = gr; b.fillRect(0, 0, W, W); }
  mittGrain(b, W, 240, R2);
  for (let i = 0; i < 55; i++) { b.fillStyle = `rgba(${R2() < 0.6 ? '205,172,140' : '0,0,0'},${0.05 + R2() * 0.12})`; b.beginPath(); b.ellipse(R2() * W, R2() * W, 8 + R2() * 46, 5 + R2() * 28, R2() * 3, 0, 7); b.fill(); }
  for (const u of [0.25, 0.75]) { const x = W * u; b.fillStyle = 'rgba(0,0,0,.55)'; b.fillRect(x - 3, 0, 6, W); b.fillStyle = 'rgba(0,0,0,.16)'; b.fillRect(x - 15, 0, 30, W); mittStitch(b, x - 9, 0, x - 9, W, MIT_SKIN.thread, 2.2); mittStitch(b, x + 9, 0, x + 9, W, MIT_SKIN.thread, 2.2); }
  const bmap = new THREE.CanvasTexture(bc); bmap.colorSpace = THREE.SRGBColorSpace; bmap.wrapS = THREE.RepeatWrapping; bmap.anisotropy = 8;

  const bh = mittCnv(W), hg = bh.getContext('2d'); hg.fillStyle = '#808080'; hg.fillRect(0, 0, W, W);
  for (let i = 0; i < 7000; i++) { const x = R2() * W, y = R2() * W, r = 1.1 + R2() * 2.3; hg.fillStyle = `rgba(255,255,255,${0.05 + R2() * 0.09})`; hg.beginPath(); hg.ellipse(x, y, r, r * 0.72, R2() * 3, 0, 7); hg.fill(); }
  for (const u of [0.25, 0.75]) { const x = W * u; for (const [k, a] of [[1, 0.16], [0.7, 0.2], [0.4, 0.22]]) { hg.fillStyle = `rgba(255,255,255,${a})`; hg.fillRect(x - 13 * k, 0, 26 * k, W); } hg.fillStyle = 'rgba(0,0,0,.85)'; hg.fillRect(x - 3, 0, 6, W); mittStitch(hg, x - 9, 0, x - 9, W, 'rgba(255,255,255,.7)', 2.4); mittStitch(hg, x + 9, 0, x + 9, W, 'rgba(255,255,255,.7)', 2.4); }
  const bnormal = new THREE.CanvasTexture(mittNormalFromHeight(bh, 2.4)); bnormal.wrapS = THREE.RepeatWrapping; bnormal.anisotropy = 8;

  const bo = mk(), ob = bo.getContext('2d'); ob.fillStyle = 'rgb(0,162,0)'; ob.fillRect(0, 0, W, W);
  for (let i = 0; i < 200; i++) { ob.fillStyle = `rgba(0,${R2() < 0.5 ? 120 : 205},0,${0.05 + R2() * 0.09})`; ob.beginPath(); ob.ellipse(R2() * W, R2() * W, 12 + R2() * 48, 8 + R2() * 30, R2() * 3, 0, 7); ob.fill(); }
  const borm = new THREE.CanvasTexture(bo); borm.wrapS = THREE.RepeatWrapping; borm.anisotropy = 4;

  /* welt cord — tan diagonal stitching on dark hide, repeated round the rim */
  const wc = document.createElement('canvas'); wc.width = 256; wc.height = 64; const w = wc.getContext('2d');
  w.fillStyle = '#241814'; w.fillRect(0, 0, 256, 64);
  const wg = w.createLinearGradient(0, 0, 0, 64); wg.addColorStop(0, 'rgba(255,255,255,.16)'); wg.addColorStop(0.35, 'rgba(255,255,255,0)'); wg.addColorStop(0.75, 'rgba(0,0,0,0)'); wg.addColorStop(1, 'rgba(0,0,0,.42)'); w.fillStyle = wg; w.fillRect(0, 0, 256, 64);
  w.strokeStyle = MIT_SKIN.thread; w.lineWidth = 7.5; w.lineCap = 'round';
  for (let x = 6; x < 256; x += 32) { w.save(); w.translate(x, 32); w.rotate(-0.55); w.beginPath(); w.moveTo(-9, 0); w.lineTo(9, 0); w.stroke(); w.restore(); }
  const wcol = new THREE.CanvasTexture(wc); wcol.colorSpace = THREE.SRGBColorSpace; wcol.wrapS = THREE.RepeatWrapping; wcol.wrapT = THREE.ClampToEdgeWrapping; wcol.anisotropy = 8;
  return { map, normalMap, orm, bmap, bnormal, borm, wcol };
}

/* ── geometry: profile-ring grids closed to the poles, superellipse outline ── */
function mittSuperellipse(t, a, b, n) { const c = Math.cos(t), s = Math.sin(t), e = 2 / n; return [a * Math.sign(c) * Math.pow(Math.abs(c), e), b * Math.sign(s) * Math.pow(Math.abs(s), e)]; }
function mittRingGrid(rings, nu, uvMode, zSign) {   // zSign: +1 domes toward +z, −1 toward −z; pole ring scales ~0 → grid pinches shut
  const pos = [], uv = [], idx = [], nr = rings.length;
  for (let r = 0; r < nr; r++) {
    const sc = rings[r][0], z = rings[r][1];
    for (let i = 0; i <= nu; i++) {
      const t = (i / nu) * Math.PI * 2, p = mittSuperellipse(t, MITT_A * sc, MITT_B * sc, MITT_N), x = p[0], y = p[1];
      pos.push(x, y, z);
      if (uvMode === 'planar') uv.push(x / (2 * MITT_A) + 0.5, y / (2 * MITT_B) + 0.5);
      else uv.push((i / nu) * 2, r / (nr - 1));   // wraps the plain hide twice round
    }
  }
  for (let r = 0; r < nr - 1; r++) for (let i = 0; i < nu; i++) { const a = r * (nu + 1) + i, b = a + nu + 1; if (zSign > 0) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function mittGeometries() {
  return {
    front: mittRingGrid(MIT_FRONT, 72, 'planar', 1),
    back: mittRingGrid(MIT_BACK, 72, 'angular', -1),
    scoop: mittRingGrid(MIT_SCOOP, 56, 'angular', -1),
    welt: (() => {   // the cord sewn round the rim, following the superellipse
      const pts = []; for (let i = 0; i < 64; i++) { const p = mittSuperellipse((i / 64) * Math.PI * 2, MITT_A * 1.005, MITT_B * 1.005, MITT_N); pts.push(new V3(p[0], p[1], 0.003)); }
      const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
      const g = new THREE.TubeGeometry(curve, 128, 0.0105, 10, true);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 16, uv.getY(i));
      return g;
    })(),
  };
}

/* ── materials: one face material per mitt (its own vibration uniforms), shared hide/welt/strap ── */
function mittMaterials(T, uVibL, uVibR) {
  const face = (uVib, uPh) => {
    const m = new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normalMap, roughnessMap: T.orm, metalnessMap: T.orm, metalness: 1, roughness: 1, envMapIntensity: 0.65, normalScale: new THREE.Vector2(1.1, 1.1) });
    m.onBeforeCompile = sh => {
      sh.uniforms.uVib = uVib; sh.uniforms.uPh = uPh;
      sh.vertexShader = 'uniform float uVib; uniform float uPh;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          // the leather is taut on the foam: a ripple decaying across the face after the punch
          vec3 mittN0 = objectNormal;
          float mittW = smoothstep( -0.02, 0.03, position.z );`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed += mittN0 * uVib * mittW * sin( uPh + position.x * 215.0 + position.y * 265.0 );`);
    };
    m.customProgramCacheKey = () => 'mitt-face';
    return m;
  };
  const back = new THREE.MeshStandardMaterial({ map: T.bmap, normalMap: T.bnormal, roughnessMap: T.borm, metalnessMap: T.borm, metalness: 1, roughness: 1, envMapIntensity: 0.6, normalScale: new THREE.Vector2(1.15, 1.15), side: THREE.DoubleSide });
  const scoop = new THREE.MeshStandardMaterial({ map: T.bmap, normalMap: T.bnormal, roughnessMap: T.borm, metalnessMap: T.borm, metalness: 1, roughness: 1, envMapIntensity: 0.5, side: THREE.DoubleSide, color: new THREE.Color('#b9a595') });
  const welt = new THREE.MeshStandardMaterial({ map: T.wcol, roughness: 0.74, metalness: 0, envMapIntensity: 0.45 });
  const strap = new THREE.MeshStandardMaterial({ color: '#1d1410', roughness: 0.68, metalness: 0.02, envMapIntensity: 0.4 });
  const buckle = new THREE.MeshStandardMaterial({ color: '#b9bdc4', roughness: 0.32, metalness: 0.95, envMapIntensity: 0.9 });
  return { face: [face(uVibL.u, uVibL.p), face(uVibR.u, uVibR.p)], back, scoop, welt, strap, buckle };
}

/* ── build: both mitts, lazily, after the fighters exist ── */
let mittGeo = null, mittTex = null, mittMats = null;
function mittBuild() {
  if (MITTS.mitts) return;
  mittTex = mittTex || mittMakeTextures();
  mittGeo = mittGeo || mittGeometries();
  const vib = { L: { u: { value: 0 }, p: { value: 0 } }, R: { u: { value: 0 }, p: { value: 0 } } };
  mittMats = mittMats || mittMaterials(mittTex, vib.L, vib.R);
  MITTS.mitts = {};
  for (const S of ['L', 'R']) {
    const g = new THREE.Group(); g.visible = false; g.matrixAutoUpdate = false;
    const face = new THREE.Mesh(mittGeo.front, mittMats.face[S === 'L' ? 0 : 1]); face.castShadow = true; face.frustumCulled = false;
    const back = new THREE.Mesh(mittGeo.back, mittMats.back); back.castShadow = true; back.frustumCulled = false;
    const scoop = new THREE.Mesh(mittGeo.scoop, mittMats.scoop); scoop.frustumCulled = false;
    const welt = new THREE.Mesh(mittGeo.welt, mittMats.welt); welt.castShadow = true; welt.frustumCulled = false;
    // the wrist strap: a half-torus round the wrist, a tab and a buckle on the back centre
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.0475, 0.0078, 7, 26, 3.8), mittMats.strap);
    strap.scale.set(1, 0.86, 1); strap.rotation.z = -Math.PI / 2 - 1.9; strap.position.z = -0.060; strap.frustumCulled = false; strap.castShadow = true;
    const tab = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.026, 0.006), mittMats.strap); tab.position.set(0, -0.0365, -0.066); tab.rotation.x = 0.16; tab.frustumCulled = false;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.011, 0.004), mittMats.buckle); buckle.position.set(0, -0.0435, -0.0695); buckle.rotation.x = 0.16; buckle.frustumCulled = false;
    g.add(face, back, scoop, welt, strap, tab, buckle);
    scene.add(g);
    MITTS.mitts[S] = { side: S, g, pos: new V3(), nW: new V3(-1, 0, 0), xW: new V3(0, 0, 1), yW: new V3(0, 1, 0),
      base: new V3(), baseS: new V3(), qS: new THREE.Quaternion(), init: false,
      spring: { d: 0, vd: 0, tilt: 0, vt: 0, yaw: 0, vy: 0 }, vib: vib[S].u, vibPh: vib[S].p, strike: new V3(-1, 0, 0) };
  }
}
function mittShow(v) { if (!MITTS.mitts) return; for (const S of ['L', 'R']) MITTS.mitts[S].g.visible = v; }
function mittReset() {
  MITTS.combo = 0; MITTS.best = 0; MITTS.lastT = -9;
  if (!MITTS.mitts) return;
  for (const S of ['L', 'R']) { const m = MITTS.mitts[S]; m.spring.d = m.spring.vd = m.spring.tilt = m.spring.vt = m.spring.yaw = m.spring.vy = 0; m.vib.value = 0; m.init = false; }
}
/* hide the coach's gloves / headgear / wraps while he holds the mitts; `false` restores whatever his look says */
function mittGear(hide) {
  if (!P2) return;
  const G2 = P2.gear;
  if (hide) {
    P2.wrapMesh.visible = false; for (const t of P2.tails) t.mesh.visible = false;
    if (G2.gloves) { for (const gl of G2.gloves) gl.g.visible = false; G2.hg.visible = false; }
    if (G2.mma) { G2.mma.visible = false; for (const pd of G2.mmaPads) pd.m.visible = false; }
  } else P2.handGear();
}

/* ── the coach's stance: which feed each hand holds ───────────
   side = cross(up, fwd(P2→P1)) points to P2's LEFT (world +z, the default camera's side). P2 faces −x (mirrored).
   Feeds: jab → the LEFT pad straight in front of the face; cross → the RIGHT pad; hook → the LEFT pad, edge-on,
   face turned toward the camera side to take the hook arc. The other hand holds a low guard at chin height.     */
function mittRole(S) { const fs = MITTS.hold === 'cross' ? 'R' : 'L'; return fs === S ? 'feed' : 'guard'; }
const MIT_FEED = {
  jab:   { z: 0.400, y: -0.030, x: 0.100 },   // in front of the face, nose/chin height
  cross: { z: 0.400, y: +0.045, x: 0.100 },   // the second mitt, same line, shoulder height
  hook:  { z: 0.205, y: +0.085, x: 0.245 },   // close in, to the side, turned edge-on
};
function mittsFeed(S, time, out) {
  const B = P2.bones;
  const headW = _mt1.setFromMatrixPosition(B.CC_Base_Head.matrixWorld);
  const fwd = _mt2.set(P1.group.position.x - P2.group.position.x, 0, P1.group.position.z - P2.group.position.z).normalize();   // P2 → P1, level
  const up = _mt3.set(0, 1, 0);
  const side = _mt4.crossVectors(up, fwd).normalize();                    // to P2's left (world +z)
  const bob = Math.sin(time * 2.15 + (S === 'L' ? 0 : 1.9)) * 0.0085;     // the coach breathes with the pads
  const sway = Math.sin(time * 1.4 + (S === 'L' ? 1.1 : 0.3)) * 0.006;
  const role = mittRole(S), sgn = S === 'L' ? 1 : -1;
  let x, y, z, nx, ny, nz;
  if (role === 'feed') {
    if (MITTS.hold === 'hook') { x = sgn * MIT_FEED.hook.x + sway; y = MIT_FEED.hook.y + bob; z = MIT_FEED.hook.z; nx = side.x * 0.82 + fwd.x * 0.57; nz = side.z * 0.82 + fwd.z * 0.57; ny = 0.04; }
    else { const F = MITTS.hold === 'cross' ? MIT_FEED.cross : MIT_FEED.jab; x = sgn * F.x + sway; y = F.y + bob; z = F.z; nx = fwd.x; ny = 0.075; nz = fwd.z; }
  } else { x = sgn * 0.225 + sway; y = -0.190 + bob; z = 0.150; nx = fwd.x + side.x * sgn * 0.16; ny = 0.46; nz = fwd.z + side.z * sgn * 0.16; }
  const cx = headW.x + fwd.x * z + side.x * x, cy = headW.y + y, cz = headW.z + fwd.z * z + side.z * x;
  out.pos.set(cx, cy, cz);
  out.n.set(nx, ny, nz).normalize();
  out.fwd.copy(fwd);
  return out;
}
const _feedOut = { pos: new V3(), n: new V3(), fwd: new V3() };

/* one mitt, placed: base pose (smoothed) + the spring push along the strike direction; the coach's wrist is IK'd to it */
function mittPoseMitt(S, dt) {
  const m = MITTS.mitts[S], B = P2.bones, feed = mittsFeed(S, G.t, _feedOut);
  m.strike.copy(feed.fwd);
  const n = feed.n;
  // basis from the pad normal: x across the pad, y along it
  const xW = _mt5.crossVectors(_mt3.set(0, 1, 0), n).normalize();
  const yW = _mt6.crossVectors(n, xW).normalize();
  const qT = _mtQ.setFromRotationMatrix(_mtX4.makeBasis(xW, yW, n));
  if (!m.init) { m.baseS.copy(feed.pos); m.qS.copy(qT); m.init = true; }
  else if (dt > 0) { const k = 1 - Math.exp(-MITT_FLOW * dt); m.baseS.lerp(feed.pos, k); m.qS.slerp(qT, k); }
  // springs: translation away from the striker, tip back (local x), yaw (local y), all underdamped
  const s = m.spring;
  if (dt > 0) {
    s.vd += (-MIT_KD * s.d - MIT_CD * s.vd) * dt; s.d += s.vd * dt;
    if (s.d < 0) { s.d = 0; if (s.vd < 0) s.vd = 0; } else if (s.d > 0.32) { s.d = 0.32; if (s.vd > 0) s.vd = 0; }
    s.vt += (-MIT_KT * s.tilt - MIT_CT * s.vt) * dt; s.tilt += s.vt * dt;
    s.vy += (-MIT_KY * s.yaw - MIT_CY * s.vy) * dt; s.yaw += s.vy * dt;
    m.vib.value *= Math.exp(-5.5 * dt);
  }
  const pos = _mt7.copy(m.baseS).addScaledVector(m.strike, -s.d);
  _mtQ2.setFromAxisAngle(_mt3.set(0, 1, 0), s.yaw);
  const q = m.qS.clone().multiply(_mtQ2);
  _mtQ2.setFromAxisAngle(_mt3.set(1, 0, 0), -s.tilt);
  q.multiply(_mtQ2);
  m.g.matrix.compose(pos, q, _mtONE); m.g.matrixWorldNeedsUpdate = true;
  m.pos.copy(pos);
  m.nW.set(0, 0, 1).applyQuaternion(q); m.xW.set(1, 0, 0).applyQuaternion(q); m.yW.set(0, 1, 0).applyQuaternion(q);
  // the wrist rides inside the cocoon — IK the arm to it (two bones: upperarm → forearm → hand)
  _mt1.copy(pos).addScaledVector(m.nW, -0.058);
  P2.ik(B[`CC_Base_${S}_Upperarm`], B[`CC_Base_${S}_Forearm`], B[`CC_Base_${S}_Hand`], P2.group.worldToLocal(_mt1));
}
/* every frame: both mitts + the coach's arms; safe to call with dt = 0 (pause) — composes matrices, no stepping */
function mittsTick(dt) {
  if (!MITTS.on) { if (MITTS.mitts) mittShow(false); return; }
  for (const S of ['L', 'R']) mittPoseMitt(S, dt);
  P2.cc.updateMatrixWorld(true);
  P2.afterPose(0);
}

/* aim / contact / hit — the hooks aimFor / contactTest / resolveHit (07_state_replay_hits.js) call in mitt mode */
function mittAim(att) { const m = MITTS.mitts[PUNCH[att.cur].arm]; return att.aimV.copy(m.pos).addScaledVector(m.nW, 0.02); }
function mittContact(att) {
  const kn = att.knuckle(_mt1);
  let hit = null, bestQ = Infinity;
  for (const S of ['L', 'R']) {
    const m = MITTS.mitts[S]; if (!m.g.visible) continue;
    const p = _mt2.copy(kn).applyMatrix4(_mtX4.copy(m.g.matrixWorld).invert());
    const q = (p.x / 0.138) * (p.x / 0.138) + (p.y / 0.118) * (p.y / 0.118) + (p.z / 0.075) * (p.z / 0.075);
    if (q < 1 && q < bestQ) { bestQ = q; hit = { m, p: p.clone(), q }; }
  }
  if (!hit) return null;
  const surf = hit.p.multiplyScalar(1 / Math.max(1e-3, Math.sqrt(hit.q))).applyMatrix4(hit.m.g.matrixWorld);
  MITTS.lastSide = hit.m.side;
  return surf;
}
function mittHit(att, name, contact) {
  const P = PUNCH[name], m = MITTS.mitts[P.arm]; if (!m) return;
  const power = clamp(((att._mittPower != null ? att._mittPower : 1)) * (att.punchK ?? 1), 0.25, 1.6);
  const dir = _mt1.set(P2.group.position.x - P1.group.position.x, 0, P2.group.position.z - P1.group.position.z).normalize();
  if (P.type === 'hook') dir.addScaledVector(_mt2.copy(m.xW), P.arm === 'L' ? -0.45 : 0.45).normalize();
  else if (P.type === 'upper') dir.set(dir.x * 0.4, 0.55, dir.z * 0.4).normalize();
  // spring: the pad flies back along the strike, tips back, yaws off-centre if the punch landed wide of the middle
  const off = contact ? _mt3.copy(contact).sub(m.pos).dot(m.xW) / 0.126 : 0;
  const s = m.spring;
  s.vd += 1.15 + 2.4 * power; s.vt += 1.55 + 2.1 * power; s.vy += off * (2.4 + 3.2 * power);
  m.vib.value = Math.min(0.0055, 0.002 + 0.0042 * power); m.vibPh.value = rr() * 6.283;
  const pos = contact ? contact.clone() : m.pos.clone().addScaledVector(m.nW, 0.05);
  att.lastLand = G.t; att.whiff = false;
  if (att.fs) { att.fs.land++; if (P.type !== 'straight' || name === 'cross') att.fs.pow++; }
  G.hitstop = 0.011 + 0.02 * power; G.shake = Math.max(G.shake, 0.006 + 0.015 * power);
  sfx.smack(power); EVT.emit('hit', { pos: pos.clone(), power });
  MITTS.combo = G.t - MITTS.lastT < 1.0 ? MITTS.combo + 1 : 1; MITTS.lastT = G.t; MITTS.best = Math.max(MITTS.best, MITTS.combo);
  _mt4.copy(pos); _mt4.y += 0.15;
  popup(_mt4, MITTS.combo > 1 ? `В цель ×${MITTS.combo}` : 'В цель', MITTS.combo >= 4 ? 'crit' : 'hit');
  if (MITTS.combo === 4 || MITTS.combo === 7) msg('Комбинация ×' + MITTS.combo);
}

/* ── the drill lifecycle ── */
function mittStart() {
  if (!P1 || !P2) return false;
  if (MITTS.on) return true;
  MITTS.save = { mode: G.mode, loc: G.loc, diff: G.diff };
  setLocation('boxgym');
  G.mode = 'mitts'; G.loc = 'boxgym';
  startFight(true);                 // resets both men, puts the gym up, hides the result screens
  // straight into work — no card, no fly-round, no stare-down, no «Готовься»
  G.flyT = 0; G.cardT = 0; G.stareT = 0; G.stare = 0; G.stareOn = false; G.rend = null;
  G.introT = 0; G.introMsg = true; G.state = 'fight'; G.roundT = 600; G.hitstop = 0;
  show('vs', false); show('result', false); show('pad', false); show('hud', true);
  $('n2').textContent = 'Тренер'; const st = $('st2'); if (st) st.textContent = 'лапы';
  MITTS.on = true; mittBuild(); mittGear(true); mittReset(); mittShow(true); mittsTick(0);
  msg('Лапы — работай!');
  return true;
}
function mittStop() {
  if (!MITTS.on) return false;
  MITTS.on = false; mittShow(false); mittGear(false);
  const save = MITTS.save;
  G.mode = 'spar'; G.loc = save ? save.loc : G.loc;
  toMenu();
  return true;
}
function mittHold(kind) { if (kind !== 'jab' && kind !== 'cross' && kind !== 'hook') return false; MITTS.hold = kind; return true; }
function mittHitKey(side, power) {
  if (!MITTS.on || !P1) return false;
  if (side !== 'L' && side !== 'R') return false;
  power = clamp(power == null ? 1 : power, 0, 1);
  const hook = MITTS.hold === 'hook';
  const name = side === 'L' ? (hook ? 'hookL' : 'jab') : (hook ? 'hookR' : 'cross');
  if (!P1.canAct() && !P1.canChain(name)) return false;
  P1._mittPower = power; P1.powerNext = power >= 0.72;
  P1.startPunch(name);
  return true;
}
window.__mitts = { start: mittStart, stop: mittStop, hold: mittHold, hit: mittHitKey };
