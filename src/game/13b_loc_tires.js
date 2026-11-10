/* ───────── location «Шины и огонь»: a night yard in an industrial zone ─────────
   A 6 m circle of tyre stacks on trampled dirt with puddles, four burning oil drums behind the tyres, a car with its headlights on
   the circle, the crowd with phones, a chain-link fence, garages, a workshop and a site cabin in the haze, the glow of a city.
   Layout (ARENA frame, circle centre = origin, the default camera looks from +z): tyre stacks on r = 3.08 (inner face 2.75), drums on
   r = 4.05, crowd rows from r = 3.85, the car 8.6 m out at the back left with a lane in the crowd for its beams, loose props beyond
   9.5 m (the fight camera never gets that far out), fence at ±14.5 m, buildings behind it.
   Everything that burns is stateless shader animation (no CPU particles): flames / glows / lens flares / smoke are instanced cards
   whose base quad is degenerate (all four `position`s are 0, the corner is in `uv`) so the AO normal pass, which redraws the scene
   with its own material, draws nothing for them; sparks are Points (that pass skips points). Counts follow GFX.particles, the
   number of fire lights follows GFX.level. */
const TIRE_N = 29, TIRE_R = 3.08, TIRE_W = 0.225, TIRE_RO = 0.33;   // 29 stacks of 0.66 m tyres close the circle
const TIRE_TIERS = (() => { const R = locRng(412); return Array.from({ length: TIRE_N }, () => R() < 0.3 ? 2 : 3); })();
const TIRE_FOG = '#15110f';

/* a height drawing (white = high) → tangent-space normal map, tiling */
function tireHeightToNormal(w, h, draw, k) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const d = x.getImageData(0, 0, w, h).data, o = x.createImageData(w, h), q = o.data, H = (i, j) => d[(((j + h) % h) * w + (i + w) % w) * 4];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (H(i - 1, j) - H(i + 1, j)) * k / 255, dy = (H(i, j - 1) - H(i, j + 1)) * k / 255, l = Math.hypot(dx, dy, 1), p = (j * w + i) * 4;
    q[p] = (dx / l * 0.5 + 0.5) * 255; q[p + 1] = (-dy / l * 0.5 + 0.5) * 255; q[p + 2] = (1 / l * 0.5 + 0.5) * 255; q[p + 3] = 255;
  }
  x.putImageData(o, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

const TIRE_FX_VS = /* glsl */`
attribute vec4 iA, iB; attribute vec3 iC;
uniform float uT, uCarOn; uniform vec4 uOn, uFl; uniform vec3 uCar;
varying vec2 vUv; varying vec4 vK; varying vec3 vC;
void main() {
  // iA = (base x, y, z, seed) · iB = (width, height, type, source) · type: 0 flame, 1 soft glow, 2 lens flare, 3 smoke puff
  vUv = uv; float type = iB.z, seed = iA.w, w = iB.x, h = iB.y, age = 0.0; int bi = int(iB.w + 0.5);
  float k = bi < 4 ? uOn[bi] : 1.0, fl = bi < 4 ? uFl[bi] : 1.0; vec3 base = iA.xyz;
  if (type > 2.5) {   // smoke: rises, leans with the wind, swells, thins out
    float life = 5.0 + 3.0 * fract(seed * 7.13); age = fract(uT / life + seed);
    base += vec3(0.22 * sin(age * 5.0 + seed * 40.0) + 1.1 * age * age, 3.6 * age, 0.22 * cos(age * 4.0 + seed * 23.0) + 0.5 * age * age);
    w = h = iB.x * (0.55 + 2.4 * age); k *= smoothstep(0.0, 0.14, age) * pow(1.0 - age, 1.4);
  }
  vec4 c = modelMatrix * vec4(base, 1.0), mv; vec3 toC = cameraPosition - c.xyz;
  if (type > 1.5) {   // turned to the lens, centred
    mv = viewMatrix * c; mv.xy += (uv - 0.5) * vec2(w, h);
    if (type < 2.5) k = uCarOn * pow(max(dot(normalize(toC), normalize((modelMatrix * vec4(uCar, 0.0)).xyz)), 0.0), 3.0);   // a flare shows only to whom the lamp looks at
  } else {   // an upright card turned about y: a flame stands on its base, a glow is centred
    vec3 r = normalize(vec3(toC.z, 0.0, -toC.x));
    mv = viewMatrix * vec4(c.xyz + r * (uv.x - 0.5) * w + vec3(0.0, (uv.y - (type > 0.5 ? 0.5 : 0.0)) * h, 0.0), 1.0);
    k *= type > 0.5 ? fl : 0.8 + 0.2 * fl;
  }
  vK = vec4(type, seed, k, age); vC = iC; gl_Position = projectionMatrix * mv;
}`;
const TIRE_FX_FS = /* glsl */`
uniform float uT; varying vec2 vUv; varying vec4 vK; varying vec3 vC;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { return 0.5 * vn(p) + 0.3 * vn(p * 2.03 + 7.1) + 0.2 * vn(p * 4.1 + 3.3); }
void main() {
  float type = vK.x, seed = vK.y, k = vK.z, a = 1.0; vec2 q = vUv; vec3 col;
  if (k < 0.003) discard;
  if (type < 0.5) {   // flame: a noisy tongue that narrows to the tip, hot core → orange → red edge
    float x = (q.x - 0.5) * 2.0, y = q.y, t = uT * (1.3 + 0.5 * fract(seed * 3.7)) + seed * 20.0;
    x += (fbm(vec2(x * 1.3 + seed * 9.0, y * 1.8 - t * 1.5)) - 0.5) * 0.9 * y;
    float n = fbm(vec2(x * 3.0 + seed * 5.0, y * 3.2 - t * 2.6));
    float wd = 0.7 * pow(1.0 - y, 0.8) * (0.6 + 0.4 * smoothstep(0.0, 0.2, y));
    float f = smoothstep(-0.12, 0.3, wd - abs(x) + (n - 0.5) * (0.35 + 0.7 * y)) * smoothstep(0.0, 0.07, y);
    f *= mix(1.0, n * 1.35, smoothstep(0.25, 1.0, y));
    float heat = f * (1.15 - 0.8 * y);
    col = mix(vec3(0.9, 0.1, 0.01), vec3(1.0, 0.42, 0.05), smoothstep(0.12, 0.5, heat)); col = mix(col, vec3(1.0, 0.82, 0.42), smoothstep(0.55, 1.0, heat));
    col *= heat * 2.1 * k;
  } else if (type < 1.5) {   // soft glow in the haze
    col = vC * pow(max(1.0 - length(q - 0.5) * 2.0, 0.0), 2.2) * k;
  } else if (type < 2.5) {   // headlight in the lens: core, halo, a horizontal streak
    vec2 d = (q - 0.5) * 2.0; float r = length(d);
    col = vC * (exp(-r * r * 110.0) * 7.0 + pow(max(1.0 - r, 0.0), 3.0) * 0.45 + exp(-(d.x * d.x * 5.0 + d.y * d.y * 1100.0)) * 1.1) * k;
  } else {   // smoke: lit orange right over the fire, grey above
    float r = length(q - 0.5) * 2.0, n = fbm(q * 3.0 + seed * 31.0 + vec2(0.0, -uT * 0.15));
    a = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.8) * k * 0.3;
    col = mix(vec3(0.6, 0.24, 0.07), vec3(0.085, 0.078, 0.08), smoothstep(0.0, 0.3, vK.w)) * (0.7 + 0.6 * n);
  }
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const TIRE_SPARK_VS = /* glsl */`
attribute vec4 aS; uniform float uT, uPx; uniform vec4 uOn; varying float vA;
void main() {
  // aS = (seed, life, rise, drum). Every cycle a spark gets a new random h: where it starts, how it weaves, whether it flies at all
  float seed = aS.x, s = uT / aS.y + seed, age = fract(s), h = fract(sin((floor(s) + seed) * 91.7) * 4375.5);
  vec3 p = position + vec3((h - 0.5) * 0.3, 0.0, (fract(h * 7.7) - 0.5) * 0.3);
  p.y += age * aS.z * (0.6 + 0.8 * h);
  p.x += sin(age * 7.0 + h * 40.0) * 0.2 * age + 0.8 * age * age; p.z += cos(age * 6.0 + h * 23.0) * 0.2 * age + 0.35 * age * age;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.04, age) * uOn[int(aS.w + 0.5)] * step(0.3, h);
  gl_PointSize = max(1.6, uPx * 0.02 * (0.6 + h) / -mv.z); gl_Position = projectionMatrix * mv;
}`;
const TIRE_SPARK_FS = /* glsl */`
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0 || vA < 0.01) discard;
  gl_FragColor = vec4(mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.75, 0.3), vA) * vA * 3.5 * (1.0 - r * r), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/* the ground: a mask texture laid over the middle 28 × 28 m (r = puddles, g = trampled floor of the circle, b = soot round the drums).
   A puddle is dark, flat and smooth, and mirrors the flames and the headlights analytically: the view ray is reflected off the
   water and tested against a soft upright capsule over each drum / a blob at each lamp (Schlick: stronger at grazing angles). */
const TIRE_GROUND_FS = /* glsl */`
if (tPud > 0.01) {
  vec3 tV = normalize(vLp - uCamL), tR = vec3(tV.x, -tV.y, tV.z); vec3 tAcc = vec3(0.03, 0.034, 0.05);   // the night sky
  float tF = 0.03 + 0.97 * pow(1.0 - clamp(-tV.y, 0.0, 1.0), 5.0), tH = max(dot(tR.xz, tR.xz), 1e-5);
  for (int i = 0; i < 4; i++) {
    float t = dot(uBar[i].xz - vLp.xz, tR.xz) / tH; if (t <= 0.0) continue;
    vec3 p = vLp + tR * t; p.x += 0.05 * sin(p.y * 9.0 - uT * 6.0 + float(i) * 2.0) * (p.y - 0.8);
    float dh = length(p.xz - uBar[i].xz);
    tAcc += vec3(1.0, 0.4, 0.07) * exp(-dh * dh / 0.045) * smoothstep(0.8, 1.0, p.y) * (1.0 - smoothstep(1.2, 2.2, p.y)) * uFl[i] * 7.0;
  }
  for (int i = 0; i < 2; i++) {
    vec3 d = uHead[i] - vLp; float t = dot(d.xz, tR.xz) / tH; if (t <= 0.0) continue;
    vec3 p = vLp + tR * t - uHead[i]; tAcc += vec3(0.85, 0.92, 1.0) * exp(-dot(p, p) / 0.012) * max(dot(normalize(-d), uCar), 0.0) * 3.0;
  }
  totalEmissiveRadiance += tAcc * tF * tPud;
}`;

LOCS.tires = {
  id: 'tires', label: 'Шины и огонь', desc: 'Ночной пустырь, круг из покрышек, огонь в бочках', bound: { kind: 'circle', r: 2.55 }, ring: false,
  // soft wall for the knockout ragdoll (see LOCS.parking.wall and XWorld.solve): rubber is as stiff as the hay but hardly damped
  // (damp 6 against 25), so a body springs back off the stack; it grips more (mu) and gives a little less before going hard
  wall: { r: 2.72, k: 2.6e4, mu: 0.8, h: 3 * TIRE_W, d: 2 * TIRE_RO, give: 0.2, damp: 6, back: 3.6,   // back: the crowd's front row (r 3.85) minus half a chest
    top(x, z) { const i = ((Math.round(Math.atan2(z, x) / (2 * Math.PI / TIRE_N)) % TIRE_N) + TIRE_N) % TIRE_N; return TIRE_TIERS[i] * TIRE_W; } },
  // the shared lights: `key` (it casts the fighters' shadows) is a cold lamp high above, `rim` / `rim2` are the glow of the fires
  // behind the fighters (they flicker with them, see sync); the real fire and headlight lamps live in the set
  light: { bg: '#07080c', fog: [TIRE_FOG, 9, 36], exposure: 1.0, hemi: ['#46527a', '#2a1a10', 0.3], key: ['#c9d6ff', 22], rim: ['#ff8a3c', 1.5], rim2: ['#ff7a2a', 1.7], fill: ['#ffb27a', 0.3] },
  build() {
    const R = locRng(901), g = new THREE.Group(), PI = Math.PI, m4 = new M4(), q1 = new Quat(), q2 = new Quat(), v1 = new V3(), one = new V3(1, 1, 1), UP = new V3(0, 1, 0);
    const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const lin = t => { t.colorSpace = THREE.NoColorSpace; return t; };
    const speck = (c, w, h, n, a, s = 2) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * a})`; c.fillRect(R() * w, R() * h, 1 + R() * s, 1 + R() * s); } };
    const polar = (deg, r) => new V3(Math.cos(deg * PI / 180) * r, 0, Math.sin(deg * PI / 180) * r);
    const BAR = this.bar = [polar(-58, 4.05), polar(140, 4.05), polar(-128, 4.05), polar(48, 4.05)];   // the first two stay lit on «low»
    const CAR = polar(-112, 8.6), carDir = new V3(-CAR.x, 0, -CAR.z).normalize(), carRy = Math.atan2(carDir.x, carDir.z);
    const U = this.U = { uT: { value: 0 }, uOn: { value: new THREE.Vector4(1, 1, 1, 1) }, uFl: { value: new THREE.Vector4(1, 1, 1, 1) }, uCar: { value: carDir }, uCarOn: { value: 1 },
      uPx: { value: 800 }, uCamL: { value: new V3(0, 1.2, 5) }, uBar: { value: BAR.map(b => new V3(b.x, 0.88, b.z)) }, uHead: { value: [new V3(), new V3()] }, uPud: { value: null } };

    /* ── sky: a dome and a skyline strip that travel with the camera (the far plane is 40 m), a searchlight sweeping the haze ── */
    const sky = this.sky = new THREE.Group(); g.add(sky);
    const skyTex = canvasTex(1024, 512, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h / 2); gr.addColorStop(0, '#03040a'); gr.addColorStop(0.5, '#080a14'); gr.addColorStop(0.82, '#17131d'); gr.addColorStop(0.95, '#33221b'); gr.addColorStop(1, '#4a2f1c');
      c.fillStyle = gr; c.fillRect(0, 0, w, h / 2); c.fillStyle = TIRE_FOG; c.fillRect(0, h / 2, w, h / 2);
      for (let i = 0; i < 420; i++) { c.fillStyle = `rgba(210,220,255,${0.15 + R() * 0.6})`; c.fillRect(R() * w, R() * R() * h * 0.4, 1, 1); }
      for (const [u, s, col] of [[0.75, 190, '255,150,70'], [0.2, 130, '255,170,90'], [0.48, 110, '120,150,255']]) for (const o of [0, -w, w]) {   // the city's glow, uneven round the horizon
        const x = u * w + o, r = c.createRadialGradient(x, h / 2, 0, x, h / 2, s); r.addColorStop(0, `rgba(${col},.2)`); r.addColorStop(1, `rgba(${col},0)`); c.fillStyle = r; c.fillRect(x - s, h / 2 - s * 0.45, 2 * s, s * 0.45); }
      for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '90,62,52' : '30,30,44'},${0.04 + R() * 0.07})`; c.beginPath(); c.ellipse(R() * w, h * (0.3 + R() * 0.19), 40 + R() * 130, 3 + R() * 9, 0, 0, 7); c.fill(); }   // thin smoke lit from below
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(31, 24, 12), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })); dome.renderOrder = -10; dome.frustumCulled = false; sky.add(dome);
    const cityTex = canvasTex(2048, 128, (c, w, h) => {
      for (let x = 6; x < w - 60;) { const bw = 16 + R() * 54, bh = 14 + R() * R() * 96; c.fillStyle = '#0b090b'; c.fillRect(x, h - bh, bw, bh);
        if (R() < 0.5) for (let wy = h - bh + 4; wy < h - 12; wy += 5) for (let wx = x + 3; wx < x + bw - 3; wx += 4) if (R() < 0.16) { c.fillStyle = R() < 0.7 ? `rgba(255,${190 + R() * 40},${110 + R() * 60},${0.4 + R() * 0.6})` : `rgba(190,215,255,${0.4 + R() * 0.5})`; c.fillRect(wx, wy, 2, 2); }
        if (bh > 70) { c.fillStyle = '#ff3020'; c.fillRect(x + bw / 2, h - bh - 2, 2, 2); }
        x += bw + (R() < 0.3 ? R() * 40 : 1); }
      c.globalCompositeOperation = 'source-atop'; const gr = c.createLinearGradient(0, h * 0.55, 0, h); gr.addColorStop(0, 'rgba(21,17,15,0)'); gr.addColorStop(0.8, 'rgba(21,17,15,1)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    }); cityTex.wrapS = THREE.RepeatWrapping;
    const city = new THREE.Mesh(geoUvMul(new THREE.CylinderGeometry(29.5, 29.5, 4.4, 48, 1, true).translate(0, 1.6, 0), 2, 1), new THREE.MeshBasicMaterial({ map: cityTex, color: new THREE.Color(1.5, 1.5, 1.5), transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    city.renderOrder = -9; city.frustumCulled = false; sky.add(city);
    const beamTex = canvasTex(64, 128, (c, w, h) => {   // across: a soft bell; along (v, up the canvas): bright at the lamp, gone at the far end
      const im = c.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = (x + 0.5) / w * 2 - 1, v = 1 - (y + 0.5) / h, k = Math.pow(Math.max(0, 1 - u * u), 2) * Math.pow(1 - v, 1.6) * Math.min(1, v * 14) * 255, p = (y * w + x) * 4; im.data[p] = im.data[p + 1] = im.data[p + 2] = k; im.data[p + 3] = 255; }
      c.putImageData(im, 0, 0);
    });
    const sheet = (len, w0, w1, up) => { const s = new THREE.PlaneGeometry(1, 1, 1, 8), p = s.attributes.position; for (let i = 0; i < p.count; i++) { const v = p.getY(i) + 0.5, x = p.getX(i) * (w0 + (w1 - w0) * v); p.setXYZ(i, up ? 0 : x, up ? x : 0, v * len); } return s; };   // a widening strip along +z
    const beamMat = o => new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, ...o });
    const search = this.search = new THREE.Mesh(sheet(26, 0.3, 2.6, false).rotateX(-PI / 2), beamMat({ color: '#8ea4d8', opacity: 0.16 })); search.position.set(9, 0.4, -28.5); search.renderOrder = -8; search.frustumCulled = false; sky.add(search);

    /* ── ground: gravelly dirt (4 m tile, 2 m normal tile), puddles / trampled floor / soot through the mask ── */
    const dirtTex = rep(canvasTex(1024, 1024, (c, w, h) => {
      c.fillStyle = '#4b4239'; c.fillRect(0, 0, w, h);
      const blob = (x, y, rx, ry, a, col) => { c.fillStyle = col; for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h]]) { c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); c.fill(); } };
      for (let i = 0; i < 150; i++) blob(R() * w, R() * h, 30 + R() * 150, 20 + R() * 90, R() * 3, `rgba(${R() < 0.55 ? '22,18,14' : R() < 0.5 ? '150,132,108' : '96,92,88'},${0.03 + R() * 0.06})`);
      speck(c, w, h, 90000, 0.16);
      for (let i = 0; i < 2600; i++) { const x = R() * w, y = R() * h, r = 1.2 + R() * R() * 5, l = 70 + R() * 90; c.fillStyle = `rgb(${l},${l - 4},${l - 10})`; c.beginPath(); c.ellipse(x, y, r, r * (0.6 + R() * 0.4), R() * 3, 0, 7); c.fill();   // gravel: a stone, its shaded side
        c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x + r * 0.3, y + r * 0.35, r, r * 0.5, 0, 0, 7); c.fill(); c.fillStyle = `rgb(${l + 14},${l + 10},${l})`; c.beginPath(); c.ellipse(x, y, r * 0.8, r * 0.5, R() * 3, 0, 7); c.fill(); }
    }));
    const dirtN = tireHeightToNormal(512, 512, (c, w, h) => { c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + R() * 0.08})`; c.beginPath(); c.ellipse(R() * w, R() * h, 20 + R() * 70, 12 + R() * 40, R() * 3, 0, 7); c.fill(); }
      for (let i = 0; i < 2600; i++) { const l = 120 + R() * 135; c.fillStyle = `rgb(${l},${l},${l})`; c.beginPath(); c.arc(R() * w, R() * h, 1 + R() * R() * 5, 0, 7); c.fill(); } speck(c, w, h, 16000, 0.2); }, 2.2);
    dirtN.repeat.set(2, 2);
    const MS = 28, maskTex = lin(canvasTex(512, 512, (c, w, h) => {   // MS metres across; canvas x = +x, canvas y = −z
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
      const px = (x, z) => [(0.5 + x / MS) * w, (0.5 - z / MS) * h], dot = (x, z, r, col, a) => { const [cx, cy] = px(x, z), rp = r / MS * w, gr = c.createRadialGradient(cx, cy, 0, cx, cy, rp); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.5, `rgba(${col},${a * 0.6})`); gr.addColorStop(1, `rgba(${col},0)`); c.fillStyle = gr; c.fillRect(cx - rp, cy - rp, 2 * rp, 2 * rp); };
      const puddle = (x, z, r) => { for (let k = 0; k < 4; k++) dot(x + (R() - 0.5) * r * 1.5, z + (R() - 0.5) * r * 1.1, r * (0.75 + R() * 0.7), '255,0,0', 0.75); };
      for (const [x, z, r] of [[0.3, 1.55, 0.55], [-1.7, 0.75, 0.4], [1.85, 0.5, 0.36], [-0.7, -1.8, 0.5], [1.3, -1.5, 0.42], [-1.5, 2.1, 0.5], [0.9, -0.2, 0.3]]) puddle(x, z, r);
      for (let i = 0; i < 46; i++) { const a = R() * 2 * PI, r = 3.6 + R() * 9.5; puddle(Math.cos(a) * r, Math.sin(a) * r, 0.4 + R() * 0.9); }
      dot(0, 0, 3.6, '0,255,0', 1); for (const b of BAR) dot(b.x, b.z, 1.1, '0,0,255', 1);
    }));
    U.uPud.value = maskTex;
    const groundMat = new THREE.MeshStandardMaterial({ map: dirtTex, normalMap: dirtN, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.94, envMapIntensity: 0.35 });
    groundMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vLp;\nvoid main() {').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLp = position;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D uPud; uniform vec3 uCamL, uCar, uBar[4], uHead[2]; uniform vec4 uFl; uniform float uT; varying vec3 vLp;\nvoid main() {')
        .replace('#include <map_fragment>', `#include <map_fragment>\n  vec2 tUv = vLp.xz * vec2(${(1 / MS).toFixed(5)}, ${(-1 / MS).toFixed(5)}) + 0.5; vec3 tM = texture2D(uPud, tUv).rgb * step(abs(tUv.x - 0.5), 0.5) * step(abs(tUv.y - 0.5), 0.5);\n  float tPud = smoothstep(0.46, 0.54, tM.r), tWet = smoothstep(0.2, 0.5, tM.r);\n  diffuseColor.rgb *= mix(1.0, 0.62, tWet) * mix(1.0, 0.55, tPud) * mix(1.0, 0.86, tM.g) * mix(1.0, 0.4, tM.b);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(mix(roughnessFactor, 0.6, tWet * 0.5), 0.26, tPud);   // not a mirror: the headlight spot would burn a white hole into it')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = normalize(mix(normal, nonPerturbedNormal, max(tPud, tM.g * 0.45)));')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + TIRE_GROUND_FS)
        // the lamps' own highlight is taken out of the water (seen against the headlights it burned a white hole); the reflections above replace it
        .replace('#include <aomap_fragment>', 'reflectedLight.directSpecular *= mix(1.0, 0.08, tPud);\n#include <aomap_fragment>');
    };
    const ground = staticMesh(geoUvMul(new THREE.PlaneGeometry(76, 76).rotateX(-PI / 2), 19, 19), groundMat); ground.receiveShadow = true; g.add(ground);

    /* ── the circle: tyres (a lathed section, tread and sidewall lettering from a height drawing) as ONE InstancedMesh; a stack that
       gets between the camera and the fighters is collapsed to zero scale (sync), as the car park does with its columns ── */
    const tireDraw = col => (c, w, h) => {
      const P = col ? { base: '#1a1a1b', tread: '#202021', groove: 'rgba(104,88,68,.75)', block: '#1d1d1e', ring: 'rgba(70,70,72,.8)', text: '#3a3a3c' } : { base: '#6a6a6a', tread: '#c4c4c4', groove: '#2e2e2e', block: '#a4a4a4', ring: '#909090', text: '#a8a8a8' };
      c.fillStyle = P.base; c.fillRect(0, 0, w, h); c.fillStyle = P.block; c.fillRect(0, h * 0.27, w, h * 0.46); c.fillStyle = P.tread; c.fillRect(0, h * 0.34, w, h * 0.32);
      c.fillStyle = P.groove; for (const v of [0.42, 0.5, 0.58]) c.fillRect(0, h * v - 2.5, w, 5);
      for (let i = 0; i < 32; i++) { c.fillRect(i * w / 32, h * 0.27, 5, h * 0.07); c.fillRect(i * w / 32 + 8, h * 0.66, 5, h * 0.07); }
      c.strokeStyle = P.groove; c.lineWidth = 4; c.beginPath();
      for (let i = 0; i < 16; i++) { const x = i * w / 16 + 4; c.moveTo(x, h * 0.34); c.lineTo(x + 10, h * 0.42); c.moveTo(x + 16, h * 0.42); c.lineTo(x + 6, h * 0.5); c.moveTo(x + 6, h * 0.5); c.lineTo(x + 16, h * 0.58); c.moveTo(x + 10, h * 0.58); c.lineTo(x, h * 0.66); }
      c.stroke();
      c.font = 'bold 21px Arial, sans-serif'; c.textBaseline = 'middle';
      for (const v of [0.155, 0.845]) { c.fillStyle = P.ring; c.fillRect(0, h * (v - 0.07), w, 2); c.fillRect(0, h * (v + 0.07), w, 2); c.fillStyle = P.text; c.fillText('175/70 R13', 24, h * v); c.fillText('КАМА-205', 300, h * v); }
      if (col) { speck(c, w, h, 9000, 0.07); for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${R() < 0.6 ? '128,108,84' : '150,146,138'},${0.04 + R() * 0.1})`; c.beginPath(); c.ellipse(R() * w, R() * h, 12 + R() * 60, 5 + R() * 22, R() * 0.6, 0, 7); c.fill(); } }
    };
    const tireCol = rep(canvasTex(512, 256, tireDraw(true))), tireN = tireHeightToNormal(512, 256, tireDraw(false), 2.6);
    const hw = TIRE_W / 2, prof = [[0.2, -0.085], [0.235, -0.105], [0.29, -hw], [0.318, -0.1], [TIRE_RO, -0.075], [TIRE_RO, 0.075], [0.318, 0.1], [0.29, hw], [0.235, 0.105], [0.2, 0.085], [0.2, -0.085]];
    const profV = [0.02, 0.08, 0.22, 0.29, 0.34, 0.66, 0.71, 0.78, 0.92, 0.98, 1];
    const tireG = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 20);
    { const u = tireG.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * 3, profV[Math.round(u.getY(i) * (prof.length - 1))]); }
    const tires = [], stacks = this.stacks = [];
    const tire = (x, y, z, q, s, tint) => { tires.push({ m: new M4().compose(v1.set(x, y, z), q, one), s, tint }); };
    for (let i = 0; i < TIRE_N; i++) {
      const a = i * 2 * PI / TIRE_N, ca = Math.cos(a), sa = Math.sin(a), n = TIRE_TIERS[i], tan = new V3(-sa, 0, ca), dust = 0.8 + R() * 0.5;
      for (let t = 0; t < n; t++) {
        const slump = t === n - 1 && t > 0 && R() < 0.3, lean = slump ? -(0.13 + R() * 0.12) : (R() - 0.5) * 0.04, r = TIRE_R + (R() - 0.5) * 0.035 * (t + 1) + (slump ? 0.06 : 0), tj = (R() - 0.5) * 0.04 * (t + 1);
        q1.setFromAxisAngle(tan, lean).multiply(q2.setFromAxisAngle(UP, R() * 6.28));
        tire(r * ca - tj * sa, hw + t * TIRE_W + (slump ? TIRE_RO * Math.sin(-lean) * 0.55 : 0), r * sa + tj * ca, q1, i, dust * (0.9 + R() * 0.25));
      }
      stacks.push({ p: new V3(TIRE_R * ca, 0.35, TIRE_R * sa), o: new V3(ca, 0, sa), vis: true, ids: [] });
    }
    // a heap of spare tyres by the fence, two leaning on the concrete blocks
    for (let i = 0; i < 9; i++) { const lv = i > 5 ? 1 : 0; q1.setFromAxisAngle(v1.set(R() - 0.5, 0, R() - 0.5).normalize(), lv ? 0.2 * R() : 0).multiply(q2.setFromAxisAngle(UP, R() * 6)); tire(-11.2 + (i % 3) * 0.7 + R() * 0.2, hw + lv * TIRE_W, 6.2 + ((i / 3) | 0) % 2 * 0.72 + R() * 0.2 - lv * 0.3, q1, -1, 0.8 + R() * 0.4); }
    for (const [x, z, ry] of [[10.15, -5.4, 0.5], [-9.6, 2.55, 2.0]]) { q1.setFromAxisAngle(UP, ry).multiply(q2.setFromAxisAngle(v1.set(1, 0, 0), PI / 2 - 0.3)); tire(x, TIRE_RO - 0.015, z, q1, -1, 1); }
    const tireM = this.tireMesh = new THREE.InstancedMesh(tireG, new THREE.MeshStandardMaterial({ map: tireCol, normalMap: tireN, normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.8, envMapIntensity: 0.3 }), tires.length), tc = new THREE.Color();
    tires.forEach((t, i) => { tireM.setMatrixAt(i, t.m); tireM.setColorAt(i, tc.setRGB(t.tint * 1.05, t.tint, t.tint * 0.93)); if (t.s >= 0) stacks[t.s].ids.push(i); });
    this.tires = tires; this.zero = new M4().makeScale(0, 0, 0); tireM.matrixAutoUpdate = false; tireM.frustumCulled = false; tireM.receiveShadow = true; g.add(tireM);

    /* ── oil drums: rusty, soot at the mouth, embers inside, punched air holes glowing near the bottom ── */
    const drumProf = [[0, 0], [0.285, 0], [0.285, 0.28], [0.298, 0.295], [0.285, 0.31], [0.285, 0.57], [0.298, 0.585], [0.285, 0.6], [0.285, 0.86], [0.296, 0.88], [0.272, 0.88], [0.268, 0.52], [0, 0.52]], dn = drumProf.length - 1;
    const drumG = new THREE.LatheGeometry(drumProf.map(([r, y]) => new THREE.Vector2(r, y)), 18), holes = Array.from({ length: 7 }, () => [R(), 0.16 + R() * 0.12, 3 + R() * 3]);
    const drumDraw = em => (c, w, h) => {   // v = profile point / 12: 1..9 the outer wall, 10..11 the inner wall, 11..12 the embers
      const y = v => h * (1 - v);
      if (!em) { c.fillStyle = '#5b3622'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${R() < 0.4 ? '38,22,14' : R() < 0.6 ? '150,72,28' : R() < 0.5 ? '44,74,98' : '96,58,36'},${0.1 + R() * 0.3})`; c.beginPath(); c.ellipse(R() * w, R() * h, 4 + R() * 26, 3 + R() * 14, R() * 3, 0, 7); c.fill(); }
        speck(c, w, h, 9000, 0.18); const s = c.createLinearGradient(0, y(0.75), 0, y(0.45)); s.addColorStop(0, 'rgba(8,7,7,.95)'); s.addColorStop(1, 'rgba(8,7,7,0)'); c.fillStyle = s; c.fillRect(0, y(0.75), w, y(0.45) - y(0.75));
        c.fillStyle = '#090808'; c.fillRect(0, 0, w, y(0.75)); }
      else { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); const s = c.createLinearGradient(0, y(10 / dn), 0, y(11 / dn)); s.addColorStop(0, 'rgba(255,90,10,.25)'); s.addColorStop(1, 'rgba(255,150,40,1)'); c.fillStyle = s; c.fillRect(0, y(11 / dn), w, y(10 / dn) - y(11 / dn));
        c.fillStyle = '#ff9a30'; c.fillRect(0, 0, w, y(11 / dn)); for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '40,8,0' : '255,220,120'},${R() * 0.6})`; c.fillRect(R() * w, R() * y(11 / dn), 2 + R() * 6, 2 + R() * 3); }
        const s2 = c.createLinearGradient(0, y(0.75), 0, y(0.6)); s2.addColorStop(0, 'rgba(255,70,10,.3)'); s2.addColorStop(1, 'rgba(255,70,10,0)'); c.fillStyle = s2; c.fillRect(0, y(0.75), w, y(0.6) - y(0.75)); }
      for (const [u, v, r] of holes) { c.fillStyle = em ? '#ffb040' : '#120a06'; c.beginPath(); c.arc(u * w, y(v), em ? r : r + 1.5, 0, 7); c.fill(); }
    };
    const drumMat = this.drumMat = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, drumDraw(false)), emissiveMap: canvasTex(256, 256, drumDraw(true)), emissive: '#ffffff', emissiveIntensity: 2, roughness: 0.78, metalness: 0.45, envMapIntensity: 0.4 });
    const drumM = this.drumMesh = new THREE.InstancedMesh(drumG, drumMat, 4);
    this.drums = BAR.map((b, i) => { const m = new M4().makeRotationY(R() * 6).setPosition(b.x, 0, b.z); drumM.setMatrixAt(i, m); return { p: new V3(b.x, 0.7, b.z), m, h: false, on: 1 }; });
    drumM.matrixAutoUpdate = false; drumM.frustumCulled = false; g.add(drumM);

    /* ── static props: one merged mesh, vertex colours over a grit texture; lit windows and lamps in a second, unlit one ── */
    const grit = rep(canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#d6d6d6'; c.fillRect(0, 0, w, h); speck(c, w, h, 5000, 0.2, 3); for (let i = 0; i < 12; i++) { c.fillStyle = `rgba(0,0,0,${0.04 + R() * 0.1})`; c.fillRect(R() * w, 0, 2 + R() * 9, h); } }));
    const props = [], glow = [], P = (geo, col) => props.push(geoTint(geo, col)), Gl = (geo, col) => glow.push(geoTint(geo, col)), WARM = new THREE.Color(2.4, 1.5, 0.6), COLD = new THREE.Color(1.6, 2.0, 2.6);
    // workshop behind the fence: a long shed with a pitched roof, a row of high windows (a few lit), a chimney with a red lamp, a floodlight
    P(geoBox(30, 7.2, 9, 2, 3.6, -22.5), '#2a2826'); P(new THREE.CylinderGeometry(6.4, 6.4, 30, 3, 1).rotateZ(PI / 2).rotateX(PI).scale(1, 0.34, 0.74).translate(2, 8.25, -22.5), '#211f1e');
    P(new THREE.CylinderGeometry(0.55, 0.75, 15, 10).translate(-9, 7.5, -24), '#33302e'); Gl(new THREE.SphereGeometry(0.14, 6, 4).translate(-9, 15.1, -24), new THREE.Color(4, 0.3, 0.2));
    for (let i = 0; i < 12; i++) { const lit = [2, 3, 7, 10].includes(i); (lit ? Gl : P)(geoBox(1.5, 1.3, 0.06, -11.2 + i * 2.4, 5.1, -17.97), lit ? new THREE.Color(0.9, 0.62, 0.3).multiplyScalar(0.04 + R() * 0.07) : '#0c0d10'); if (lit) { P(geoBox(0.07, 1.3, 0.1, -11.2 + i * 2.4, 5.1, -17.95), '#141414'); P(geoBox(1.5, 0.07, 0.1, -11.2 + i * 2.4, 5.1, -17.95), '#141414'); } }
    P(geoBox(3.4, 3.6, 0.1, 6.5, 1.8, -17.96), '#1b1a19'); Gl(geoBox(0.3, 0.2, 0.2, 12.5, 7.0, -17.9), COLD);
    // garages: rows of steel boxes beyond the fence, left and behind the camera
    const garage = (x, z, ry, col) => { const h = 2.3 + R() * 0.4, gs = [geoBox(3.3, h, 5.6, 0, h / 2, 0), geoBox(3.5, 0.12, 5.9, 0, h + 0.06, 0), geoBox(2.6, h - 0.35, 0.08, 0, (h - 0.35) / 2, 2.83)]; gs.forEach((b, i) => P(b.rotateY(ry).translate(x, 0, z), i === 2 ? '#2d2a26' : col)); };
    ['#3c3a37', '#4a3327', '#2f3d38', '#44423e', '#3a2d29', '#33373c', '#4d3b2a'].forEach((col, i) => { garage(-18.6, -9.4 + i * 3.45, PI / 2, col); garage(-10 + i * 3.45, 18.8, PI, col); });
    // site cabin on blocks with a lit window, a lamp post next to it (sodium light)
    { const cab = [[geoBox(6, 2.4, 2.5, 0, 1.55, 0), '#3d5666'], [geoBox(6.15, 0.1, 2.65, 0, 2.8, 0), '#262a2d'], [geoBox(0.9, 1.9, 0.06, -1.9, 1.4, 1.26), '#27353e'], [geoBox(0.5, 0.35, 0.4, -2.4, 0.175, 0.8), '#6a6862'], [geoBox(0.5, 0.35, 0.4, 2.4, 0.175, 0.8), '#6a6862'], [geoBox(1.0, 0.25, 0.7, -1.9, 0.125, 1.6), '#5b4a36']];
      const tf = b => b.rotateY(-0.5).translate(9.6, 0, -11.6); for (const [b, col] of cab) P(tf(b), col); Gl(tf(geoBox(1.2, 0.8, 0.05, 0.9, 1.75, 1.262)), new THREE.Color(1.5, 1.0, 0.45)); }
    const LAMP = new V3(6.3, 6.3, -12.6);
    P(new THREE.CylinderGeometry(0.06, 0.09, 6.4, 8).translate(6.3, 3.2, -13.6), '#4a4c4d'); P(geoBox(0.07, 0.07, 1.1, 6.3, 6.4, -13.1), '#4a4c4d'); P(geoBox(0.22, 0.1, 0.5, 6.3, 6.38, -12.6), '#3a3c3d'); Gl(geoBox(0.16, 0.04, 0.38, LAMP.x, 6.31, LAMP.z), new THREE.Color(4, 2.3, 0.8));
    // concrete foundation blocks, pallets, planks
    for (const [x, y, z, ry] of [[10.6, 0.3, -6.3, 0.5], [11.4, 0.3, -3.8, 0.35], [10.9, 0.9, -5.2, 0.42], [-10.1, 0.3, 3.2, 2.0], [-10.6, 0.3, 0.4, 1.7], [4.6, 0.3, 11.6, 0.1], [7.3, 0.3, 11.1, -0.2], [5.9, 0.9, 11.4, 0], [-4.5, 0.3, -12.3, 0.05]]) P(geoBox(2.4, 0.6, 0.6, 0, 0, 0, ry).translate(x, y, z), R() < 0.5 ? '#77756f' : '#6a6964');
    const pallet = (x, y, z, ry, tilt = 0) => { const gs = []; for (const dz of [-0.36, 0, 0.36]) gs.push(geoBox(1.2, 0.1, 0.09, 0, 0.05, dz)); for (let k = 0; k < 5; k++) gs.push(geoBox(0.14, 0.022, 0.8, -0.53 + k * 0.265, 0.111, 0));
      for (const b of gs) P(b.rotateX(tilt).rotateY(ry).translate(x, y, z), R() < 0.5 ? '#6f5738' : '#5d482e'); };
    for (let k = 0; k < 5; k++) pallet(-9.9 + (R() - 0.5) * 0.08, k * 0.125, -7.6 + (R() - 0.5) * 0.08, 0.3 + (R() - 0.5) * 0.15);
    for (let k = 0; k < 3; k++) pallet(11.6, k * 0.125, 2.6, 1.2 + (R() - 0.5) * 0.2); pallet(-8.8, 0.42, -6.3, 0.3 + PI / 2, 1.15); pallet(8.2, 0, 10.2, 0.7);
    for (let i = 0; i < 12; i++) { const a = R() * 2 * PI, r = 9.6 + R() * 3.6; P(geoBox(1.6 + R() * 1.6, 0.03, 0.12, 0, 0.016 + (i % 3) * 0.03, 0, R() * 3).translate(Math.cos(a) * r, 0, Math.sin(a) * r), R() < 0.5 ? '#74603f' : '#57452d'); }
    // fence posts and top rail (the mesh itself is below); a gap at the back left where the car drove in
    const F = 14.5, gate = (x, z) => z < -F + 0.1 && x > -9.5 && x < -5.2, runs = [[-F, -F, F, -F], [F, -F, F, F], [F, F, -F, F], [-F, F, -F, -F]], net = [];
    for (const [x0, z0, x1, z1] of runs) for (let k = 0; k < 10; k++) { const ax = x0 + (x1 - x0) * k / 10, az = z0 + (z1 - z0) * k / 10, bx = x0 + (x1 - x0) * (k + 1) / 10, bz = z0 + (z1 - z0) * (k + 1) / 10, mx = (ax + bx) / 2, mz = (az + bz) / 2, ry = Math.atan2(-(bz - az), bx - ax);
      P(new THREE.CylinderGeometry(0.03, 0.03, 2.35, 6).translate(ax, 1.17, az), '#4b443c'); if (gate(mx, mz)) continue;
      const sag = (R() - 0.5) * 0.08; P(geoBox(2.9, 0.035, 0.035, 0, 0, 0, ry).translate(mx, 2.2 + sag, mz), '#51463a'); net.push(geoUvMul(new THREE.PlaneGeometry(2.9, 2.15), 5.8, 4.3).rotateY(ry).translate(mx, 1.1 + sag, mz)); }
    g.add(staticMesh(geoMerge(props), new THREE.MeshStandardMaterial({ map: grit, vertexColors: true, roughness: 0.88, metalness: 0.05, envMapIntensity: 0.35 })));
    g.add(staticMesh(geoMerge(glow), new THREE.MeshBasicMaterial({ vertexColors: true })));
    const netTex = rep(canvasTex(128, 128, (c, w, h) => { c.strokeStyle = 'rgba(122,104,86,.95)'; c.lineWidth = 1.6; c.beginPath(); for (let i = -4; i <= 8; i++) { c.moveTo(i * 32, 0); c.lineTo(i * 32 + 128, 128); c.moveTo(i * 32, 0); c.lineTo(i * 32 - 128, 128); } c.stroke(); }));
    const netM = staticMesh(geoMerge(net), new THREE.MeshStandardMaterial({ map: netTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.5 })); netM.renderOrder = -5; g.add(netM);
    // bottles: standing and lying about beyond the crowd, a few on the blocks
    const bot = new THREE.InstancedMesh(new THREE.LatheGeometry([[0, 0], [0.033, 0], [0.035, 0.02], [0.035, 0.15], [0.014, 0.21], [0.014, 0.26], [0, 0.26]].map(([r, y]) => new THREE.Vector2(r, y)), 8), new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.1, envMapIntensity: 1.2 }), 44);
    for (let i = 0; i < 44; i++) { const a = R() * 2 * PI, r = 5.7 + R() * 7, lie = R() < 0.55, on = i < 4 ? [[10.6, 0.6, -6.3], [11.4, 0.6, -3.8], [-10.1, 0.6, 3.2], [4.6, 0.6, 11.6]][i] : null;
      q1.setFromAxisAngle(UP, R() * 6); if (lie && !on) q1.multiply(q2.setFromAxisAngle(v1.set(1, 0, 0), PI / 2));
      bot.setMatrixAt(i, m4.compose(on ? v1.set(on[0] + (R() - 0.5) * 0.6, on[1], on[2] + (R() - 0.5) * 0.2) : v1.set(Math.cos(a) * r, lie ? 0.035 : 0, Math.sin(a) * r), q1, one)); bot.setColorAt(i, tc.set(['#1d4a25', '#4a2a10', '#6f7c78', '#16361c'][(R() * 4) | 0])); }
    bot.matrixAutoUpdate = false; bot.frustumCulled = false; g.add(bot);

    /* ── the car (a boxy little off-roader): profile extruded across the width as in the car park; lamps, beams and flares apart
       from the body so that they can be hidden together when the car gets between the camera and the fighters ── */
    const carG = this.carG = new THREE.Group(); g.add(carG);
    { const pts = [[-1.85, 0.42], [-1.85, 0.88], [-1.78, 0.98], [-0.8, 1.03], [-0.45, 1.6], [1.45, 1.62], [1.78, 1.1], [1.85, 0.8], [1.85, 0.42]], W = 1.66, col = '#6f6c64', gs = [];
      const shapeOf = ps => { const s = new THREE.Shape(); ps.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); return s; };
      gs.push(geoTint(new THREE.ExtrudeGeometry(shapeOf(pts), { depth: W - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelOffset: -0.05, bevelSegments: 2 }).translate(0, 0, -(W - 0.1) / 2).rotateY(PI / 2), col));
      gs.push(geoTint(new THREE.ExtrudeGeometry(shapeOf([[-0.78, 1.1], [-0.5, 1.54], [1.42, 1.56], [1.68, 1.14]]), { depth: W + 0.02, bevelEnabled: false }).translate(0, 0, -(W + 0.02) / 2).rotateY(PI / 2), '#07090c'));
      for (const sx of [-1, 1]) { gs.push(geoTint(geoBox(0.03, 0.5, 0.1, sx * (W / 2 + 0.006), 1.33, -0.35), col));
        for (const sz of [-1, 1]) { gs.push(geoTint(new THREE.CylinderGeometry(0.35, 0.35, 0.22, 16).rotateZ(PI / 2).translate(sx * (W / 2 - 0.09), 0.35, sz * 1.15), '#0c0c0d')); gs.push(geoTint(new THREE.CylinderGeometry(0.19, 0.19, 0.234, 12).rotateZ(PI / 2).translate(sx * (W / 2 - 0.09), 0.35, sz * 1.15), '#77797a')); }
        gs.push(geoTint(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).rotateX(PI / 2).translate(sx * 0.55, 0.82, 1.84), '#1c1d1f')); }
      gs.push(geoTint(geoBox(0.8, 0.2, 0.04, 0, 0.82, 1.85), '#151617')); gs.push(geoTint(geoBox(W, 0.14, 0.12, 0, 0.5, 1.86), '#1b1c1e')); gs.push(geoTint(geoBox(W, 0.14, 0.12, 0, 0.5, -1.86), '#1b1c1e'));
      const tf = b => b.rotateY(carRy).translate(CAR.x, 0, CAR.z);
      carG.add(staticMesh(tf(geoMerge(gs)), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.4 })));
      const lamps = [], beams = []; this.head = [];
      for (const sx of [-1, 1]) { lamps.push(new THREE.CircleGeometry(0.085, 12).translate(sx * 0.55, 0.82, 1.868)); beams.push(sheet(8.5, 0.16, 2.3, false).translate(sx * 0.55, 0.82, 1.9), sheet(8.5, 0.16, 1.5, true).translate(sx * 0.55, 0.82, 1.9));
        const p = new V3(sx * 0.55, 0.82, 1.87).applyAxisAngle(UP, carRy).add(CAR); this.head.push(p); U.uHead.value[(sx + 1) / 2].copy(p); }
      const lm = staticMesh(tf(geoMerge(lamps)), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.4, 6), fog: false })); carG.add(lm);
      const bm = staticMesh(tf(geoMerge(beams)), beamMat({ color: '#cfdcff', opacity: 0.13 })); bm.renderOrder = 1; carG.add(bm);
      this.carP = new V3(CAR.x, 0.8, CAR.z); }

    /* ── fire, glows, flares (additive) and smoke (blended): instanced cards, see the shaders above ── */
    const cards = list => { const n = list.length, geo = new THREE.InstancedBufferGeometry(), A = new Float32Array(n * 4), B = new Float32Array(n * 4), C = new Float32Array(n * 3);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); geo.setIndex([0, 1, 2, 0, 2, 3]);
      list.forEach((o, i) => { A.set([o.p.x, o.p.y, o.p.z, o.seed ?? R()], i * 4); B.set([o.w, o.h ?? o.w, o.type, o.src ?? 4], i * 4); C.set(o.col || [1, 1, 1], i * 3); });
      geo.setAttribute('iA', new THREE.InstancedBufferAttribute(A, 4)); geo.setAttribute('iB', new THREE.InstancedBufferAttribute(B, 4)); geo.setAttribute('iC', new THREE.InstancedBufferAttribute(C, 3)); geo.instanceCount = n; return geo; };
    const fxMat = o => new THREE.ShaderMaterial({ uniforms: U, vertexShader: TIRE_FX_VS, fragmentShader: TIRE_FX_FS, transparent: true, depthWrite: false, ...o });
    const at = (b, y) => new V3(b.x, y, b.z), fires = [];
    BAR.forEach((b, i) => fires.push({ p: at(b, 1.35), w: 3.4, type: 1, src: i, col: [0.5, 0.2, 0.05] }));
    fires.push({ p: LAMP.clone().setY(6.25), w: 3.2, type: 1, col: [0.55, 0.3, 0.1] }, { p: new V3(12.5, 7.0, -17.8), w: 2.6, type: 1, col: [0.35, 0.45, 0.6] });
    for (const p of this.head) fires.push({ p, w: 1.9, type: 2, col: [0.8, 0.88, 1] });
    this.fireBase = fires.length;
    for (const [w, h, y] of [[0.74, 1.3, 0.8], [0.5, 0.95, 0.78], [0.62, 1.65, 0.82]]) BAR.forEach((b, i) => fires.push({ p: at(b, y), w, h, type: 0, src: i }));   // layer-major: «low» draws two layers on every drum
    const fire = this.fire = new THREE.Mesh(cards(fires), fxMat({ blending: THREE.AdditiveBlending })); fire.frustumCulled = false; fire.renderOrder = 3; g.add(fire);
    const puffs = []; for (let k = 0; k < 9; k++) BAR.forEach((b, i) => puffs.push({ p: at(b, 1.5), w: 0.62 + R() * 0.3, type: 3, src: i, seed: (k + R() * 0.7) / 9 }));
    const smoke = this.smoke = new THREE.Mesh(cards(puffs), fxMat({})); smoke.frustumCulled = false; smoke.renderOrder = 2; g.add(smoke);
    const NS = 136, sp = new Float32Array(NS * 3), sa = new Float32Array(NS * 4);
    for (let i = 0; i < NS; i++) { const b = BAR[i % 4]; sp.set([b.x, 1.0, b.z], i * 3); sa.set([R(), 1.3 + R() * 1.5, 1.6 + R() * 2.2, i % 4], i * 4); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aS', new THREE.BufferAttribute(sa, 4));
    const sparks = this.sparks = new THREE.Points(sg, new THREE.ShaderMaterial({ uniforms: U, vertexShader: TIRE_SPARK_VS, fragmentShader: TIRE_SPARK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sparks.frustumCulled = false; sparks.renderOrder = 4; g.add(sparks);

    /* ── lamps: a flickering point light over every drum (shadowless; two of them on «low»), the headlights as one spot ── */
    this.lights = BAR.map(b => { const p = new THREE.PointLight('#ff8a3a', 10, 11, 1.5); p.position.set(b.x * 0.97, 1.3, b.z * 0.97); g.add(p); return p; });
    const hl = new THREE.SpotLight('#dfe8ff', 34, 22, 0.4, 0.75, 1.3); hl.position.copy(CAR).addScaledVector(carDir, 1.9).setY(0.82); hl.target.position.set(0, 0.95, 0); g.add(hl, hl.target);

    /* ── the crowd: three rows behind the tyres, nobody at the drums or in the lane of the headlights; more phones than usual ── */
    CROWD_LOOK.yard = CROWD_LOOK.yard || { ...CROWD_LOOK.street, phone: 0.42 };
    this.crowd = makeCrowd({ shape: 'circle', r: 3.85, rows: 3, look: 'yard', seed: 57,
      keep: (x, z) => !BAR.some(b => Math.hypot(x - b.x, z - b.z) < 0.78) && !(-(x * carDir.x + z * carDir.z) > 0 && Math.abs(x * carDir.z - z * carDir.x) < 0.8) });
    g.add(this.crowd.group);
    return g;
  },
  // per frame, after the camera: animate the fires, move the sky with the camera, hide what stands between the camera and the fighters
  sync() {
    const M = ARENA.matrixWorld, cam = camera.position, U = this.U, t = G.real, dt = clamp(t - (this.t0 ?? t), 0, 0.1), PI = Math.PI; this.t0 = t;
    U.uT.value = t; U.uPx.value = sceneRT.height / (2 * Math.tan(camera.fov * PI / 360));
    _lc.copy(cam); ARENA.worldToLocal(_lc); U.uCamL.value.copy(_lc); this.sky.position.set(_lc.x, 0, _lc.z);
    this.search.rotation.z = 0.25 + 0.45 * Math.sin(t * 0.21);
    // tyre stacks: gone once the camera is outside (or nearly at) their side of the circle
    let ch = false;
    for (const s of this.stacks) { _lp.copy(s.p).applyMatrix4(M); _lt.copy(s.o).transformDirection(M); const v = _lc.subVectors(cam, _lp).dot(_lt) < -0.3;
      if (v !== s.vis) { s.vis = v; ch = true; for (const i of s.ids) this.tireMesh.setMatrixAt(i, v ? this.tires[i].m : this.zero); } }
    if (ch) this.tireMesh.instanceMatrix.needsUpdate = true;
    // drums and the car: hidden while inside the view wedge in front of what the camera looks at (the lights stay on)
    const dx = camL.x - cam.x, dz = camL.z - cam.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, tH = Math.tan(camera.fov * PI / 360) * camera.aspect * 1.1;
    const hid = (p, r) => { _lp.copy(p).applyMatrix4(M); const px = _lp.x - cam.x, pz = _lp.z - cam.z, s = px * ux + pz * uz; return s > -r && s < len - 0.5 && Math.abs(px * uz - pz * ux) - r < Math.max(s, 0) * tH + 0.3; };
    const low = GFX.level === 'low', kf = 1 - Math.exp(-dt * 10), on = U.uOn.value, fl = U.uFl.value; let avg = 0; ch = false;
    this.drums.forEach((d, i) => {
      const h = hid(d.p, 0.9); if (h !== d.h) { d.h = h; this.drumMesh.setMatrixAt(i, h ? this.zero : d.m); ch = true; }
      d.on += ((h ? 0 : 1) - d.on) * (dt > 0 ? kf : 1); on.setComponent(i, d.on);
      // flicker: two beating sines and a fast shiver, each drum on its own phase
      const f = 0.8 + 0.16 * Math.sin(t * 9.1 + i * 1.7) * Math.sin(t * 5.3 + i * 2.9) + 0.07 * Math.sin(t * 23 + i * 4.1) + 0.05 * Math.sin(t * 2.1 + i);
      fl.setComponent(i, f); avg += f / 4;
      const L = this.lights[i]; L.visible = !low || i < 2; L.intensity = (low ? 15 : 10) * f;
    });
    if (ch) this.drumMesh.instanceMatrix.needsUpdate = true;
    this.drumMat.emissiveIntensity = 1.3 + avg;
    rim.intensity = this.light.rim[1] * fl.x; rim2.intensity = this.light.rim2[1] * fl.z;   // the shared back lights breathe with the two rear fires
    const ch2 = hid(this.carP, 2.4); this.carG.visible = !ch2; U.uCarOn.value = ch2 ? 0 : 1;
    this.fire.geometry.instanceCount = this.fireBase + 4 * (low ? 2 : 3);
    this.smoke.geometry.instanceCount = Math.max(4, Math.round(36 * GFX.particles / 4) * 4);
    this.sparks.geometry.setDrawRange(0, Math.round(136 * GFX.particles));
  },
};
