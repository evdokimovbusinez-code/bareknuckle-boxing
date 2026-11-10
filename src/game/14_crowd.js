/* ───────── crowd: the people around the fighting floor (any location can use it) ─────────
   makeCrowd({ shape: 'circle' | 'rect', r | w, h, rows, density, look }) → { group, update(dt), cheer(power, pos, hold), wall, count }.
   One low-poly figure (~750 triangles with every accessory) drawn as ONE InstancedMesh, plus one InstancedMesh of soft blobs on the floor
   (no real shadows): 2 draw calls, 3 with the AO normal pass. There are no bones: the vertex shader poses the figure from a per-vertex
   segment id (legs / torso / head / upper arms / forearms) and per-instance values — sway, shifting weight, the head turned to the
   action, arms up when cheering, a phone held up (screen glows, the LED flashes now and then), flinching back from a falling body.
   Accessories (hair, cap, hood, balaclava, skull mask, phone, crate under the feet) are all in the one geometry; an instance bit mask
   collapses the ones a person does not wear. Colours (skin, top, trousers, hat) are instance attributes.
   The CPU only keeps a few numbers per person (excitement, head yaw, recoil, fade) and packs the visible ones: the crowd is split into
   sectors that are frustum-culled, and whoever stands between the camera and the fighters is dissolved (dither).
   Density follows GFX.crowd (low ≈ 0.3 of the people, high = all). Reactions come from EVT (07_state_replay_hits.js). */
const CROWD = { u: { uT: { value: 0 }, uMood: { value: 0.15 } }, geo: null, mat: null, blobMat: null, blobs: [], mood: 0.15, heat: 0, fill: 1 };   // fill: the share of the crowd that came (a career fight sets it, startFight)
// accessory bits of the instance mask
const CW_HAIR = 2, CW_CAP = 4, CW_HOOD = 8, CW_BALA = 16, CW_SKULL = 32, CW_PHONE = 64, CW_CRATE = 128;
const CROWD_LOOK = {
  street: { head: [[CW_HAIR, 0.36], [0, 0.05], [CW_CAP, 0.2], [CW_HOOD, 0.24], [CW_HOOD | CW_CAP, 0.06], [CW_BALA, 0.06], [CW_HOOD | CW_BALA, 0.03]], phone: 0.24, tee: 0.12,
    top: ['#15171b', '#1d2230', '#23262b', '#2e3138', '#3a3327', '#2b3524', '#4a1c1f', '#5b5e63', '#7a7d80', '#1f3557', '#8a1b1b', '#c9c7c0', '#b08a2e', '#3d4a3a', '#6a2f18'] },
  // the warehouse: balaclavas and skull masks, dark clothes
  masked: { head: [[CW_BALA, 0.3], [CW_HOOD | CW_BALA, 0.2], [CW_BALA | CW_SKULL, 0.2], [CW_HOOD | CW_BALA | CW_SKULL, 0.15], [CW_HOOD, 0.08], [CW_CAP, 0.07]], phone: 0.12, tee: 0.04,
    top: ['#0e0f11', '#15171b', '#1b1d22', '#23262b', '#2a1416', '#1a2030', '#2b2d31'] },
};
const CW_BOT = ['#1b2230', '#27364f', '#34496b', '#15161a', '#2a2b2e', '#3a3d42', '#4a4433'], CW_SKIN = ['#e0b596', '#d2a17f', '#c08a66', '#9c6b4a', '#6e4a33', '#e8c4a8'];
const CW_HAIRC = ['#16120f', '#2a1d14', '#4a3320', '#6b5236', '#77777a', '#101010'], CW_CAPC = ['#111214', '#e6e4de', '#8a1b1b', '#1f3557', '#2d2f33'];

/* the figure in its rest pose: 1.75 m, feet at y = 0, facing +z, left arm at +x, arms hanging. Each piece is tagged in `aP`:
   x = segment (0 legs, 1 torso, 2 head, 3/4 left upper arm / forearm, 5/6 right), y = accessory bit number (0 = always shown),
   z = colour slot (0 skin, 1 top, 2 trousers, 3 hat/hair, 4 the vertex colour, 5 sleeve, 6 phone screen, 7 phone LED), w = belly weight */
function crowdGeo() {
  const PI = Math.PI, parts = [];
  const add = (g, seg, acc, slot, col = '#000', belly = false) => {
    g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
    const p = g.attributes.position, n = p.count, a = new Float32Array(n * 4), c = new Float32Array(n * 3), k = new THREE.Color(col);
    for (let i = 0; i < n; i++) { a[i * 4] = seg; a[i * 4 + 1] = acc; a[i * 4 + 2] = slot; a[i * 4 + 3] = belly ? Math.exp(-(((p.getY(i) - 1.04) / 0.17) ** 2)) * (p.getZ(i) > 0 ? 1 : 0.35) : 0; c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
    g.setAttribute('aP', new THREE.BufferAttribute(a, 4)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g);
  };
  // a tube through elliptical rings [y, rx, rz, cx, cz] with n sides, smooth normals, optional end caps
  const tube = (rings, n, capB, capT) => {
    const pos = [], idx = [], m = rings.length;
    for (const [y, rx, rz, cx = 0, cz = 0] of rings) for (let j = 0; j < n; j++) { const a = j / n * 2 * PI; pos.push(cx + Math.sin(a) * rx, y, cz + Math.cos(a) * rz); }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n; idx.push(a, b, b + n, a, b + n, a + n); }
    for (const [on, i, top] of [[capB, 0, 0], [capT, m - 1, 1]]) if (on) { const c = pos.length / 3, R = rings[i]; pos.push(R[3] || 0, R[0] + (top ? 0.012 : -0.012), R[4] || 0); for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n; top ? idx.push(c, a, b) : idx.push(c, b, a); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  // an ellipsoid (optionally only the part of its faces that passes `keep(x, y, z)` of the face centre)
  const ball = (rx, ry, rz, x, y, z, ws, hs, keep, th = PI, tilt = 0) => {
    let g = new THREE.SphereGeometry(1, ws, hs, 0, 2 * PI, 0, th); if (tilt) g.rotateX(tilt); g.scale(rx, ry, rz).translate(x, y, z); g.computeVertexNormals(); g = g.toNonIndexed(); g.deleteAttribute('uv');
    if (!keep) return g;
    const p = g.attributes.position.array, nm = g.attributes.normal.array, P = [], Nn = [];
    for (let i = 0; i < p.length; i += 9) { if (!keep((p[i] + p[i + 3] + p[i + 6]) / 3, (p[i + 1] + p[i + 4] + p[i + 7]) / 3, (p[i + 2] + p[i + 5] + p[i + 8]) / 3)) continue; for (let k = 0; k < 9; k++) { P.push(p[i + k]); Nn.push(nm[i + k]); } }
    const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); return o;
  };
  // legs, shoes
  for (const s of [-1, 1]) {
    add(tube([[0.05, 0.05, 0.06, s * 0.092], [0.48, 0.062, 0.066, s * 0.092, 0.01], [0.9, 0.086, 0.092, s * 0.086]], 6, false, false), 0, 0, 2);
    add(ball(0.054, 0.066, 0.13, s * 0.094, 0, 0.04, 6, 3, null, PI / 2), 0, 0, 4, '#1c1c20');   // a shoe: a low dome, not a box (boxes read as black crates under the front row)
  }
  // trunk (jacket / hoodie down to the hips), neck, head, nose
  add(tube([[0.82, 0.172, 0.122], [0.98, 0.156, 0.106], [1.2, 0.186, 0.118, 0, 0.005], [1.36, 0.2, 0.106], [1.45, 0.11, 0.078]], 8, true, true), 1, 0, 1, '#000', true);
  add(tube([[1.42, 0.052, 0.055], [1.56, 0.048, 0.052]], 6, false, false), 1, 0, 0);
  add(ball(0.088, 0.115, 0.1, 0, 1.64, 0.005, 8, 6), 2, 0, 0);
  add(geoBox(0.022, 0.036, 0.03, 0, 1.628, 0.104), 2, 0, 0);
  for (const s of [-1, 1]) add(geoBox(0.024, 0.012, 0.01, s * 0.034, 1.658, 0.0945), 2, 0, 4, '#1c1512');   // eyes: two dark dashes are enough at this distance
  add(geoBox(0.04, 0.007, 0.008, 0, 1.588, 0.094), 2, 0, 4, '#4a2a24');   // mouth
  // hair (a tilted cap of the skull: high at the forehead, low at the back), baseball cap, hood (up) with its drape on the shoulders
  add(ball(0.094, 0.121, 0.107, 0, 1.652, -0.006, 8, 3, null, PI / 2, -0.4), 2, 1, 3);
  add(ball(0.098, 0.119, 0.111, 0, 1.655, -0.002, 8, 3, null, PI / 2, -0.2), 2, 2, 3);
  add(geoBox(0.15, 0.012, 0.11, 0, 1.678, 0.15), 2, 2, 3);
  add(ball(0.118, 0.136, 0.13, 0, 1.645, -0.02, 8, 5, (x, y, z) => !(z > 0.055 && Math.abs(y - 1.635) < 0.09 && Math.abs(x) < 0.09)), 2, 3, 1);
  add(tube([[1.4, 0.135, 0.105, 0, -0.012], [1.57, 0.1, 0.112, 0, -0.022]], 8, false, false), 1, 3, 1);
  // balaclava: a shell over the head with the eye band cut out, over the nose and the neck too
  add(ball(0.093, 0.12, 0.105, 0, 1.64, 0.005, 8, 6, (x, y, z) => !(z > 0.06 && y > 1.635 && y < 1.69)), 2, 4, 3);
  add(geoBox(0.03, 0.045, 0.035, 0, 1.626, 0.106), 2, 4, 3);
  add(tube([[1.42, 0.058, 0.061], [1.56, 0.054, 0.058]], 6, false, false), 1, 4, 3);
  // skull mask: a bone-white face plate, black sockets and teeth line
  add(ball(0.097, 0.124, 0.111, 0, 1.64, 0.005, 8, 6, (x, y, z) => z > 0.045), 2, 5, 4, '#d9d6cc');
  for (const s of [-1, 1]) add(new THREE.CircleGeometry(0.025, 6).rotateY(s * 0.35).translate(s * 0.037, 1.662, 0.113), 2, 5, 4, '#040404');
  add(geoBox(0.072, 0.02, 0.008, 0, 1.578, 0.104), 2, 5, 4, '#040404');
  // arms: shoulder, upper arm, forearm (sleeve or bare), hand; the phone lies along the right hand (screen to +z)
  for (const s of [-1, 1]) {
    const up = s > 0 ? 3 : 5, lo = up + 1;
    add(ball(0.068, 0.068, 0.068, s * 0.2, 1.385, 0, 5, 3), up, 0, 1);
    add(tube([[1.12, 0.045, 0.047, s * 0.235], [1.39, 0.058, 0.06, s * 0.205]], 6, true, false), up, 0, 1);
    add(tube([[0.86, 0.034, 0.036, s * 0.245], [1.13, 0.046, 0.048, s * 0.235]], 6, true, true), lo, 0, 5);
    add(ball(0.03, 0.055, 0.04, s * 0.247, 0.81, 0.005, 5, 3), lo, 0, 0);
  }
  add(geoBox(0.07, 0.145, 0.011, -0.247, 0.735, 0.036), 6, 6, 4, '#0a0a0c');
  add(new THREE.PlaneGeometry(0.06, 0.13).translate(-0.247, 0.735, 0.0422), 6, 6, 6);
  add(new THREE.PlaneGeometry(0.022, 0.022).rotateY(PI).translate(-0.229, 0.683, 0.03), 6, 6, 7);
  // a crate under the feet of the back rows (the instance stands at the height of its top)
  add(geoBox(0.54, 0.6, 0.54, 0, -0.3, 0), 0, 7, 4, '#4f3d28');
  return mergeGeometries(parts);
}

const CROWD_VP = /* glsl */`
#ifdef USE_INSTANCING
attribute vec4 aP, iVar, iDyn; attribute vec3 iTop, iBot, iSkin, iHat;
uniform float uT, uMood;
vec3 cwRx(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c + p.z * s, p.z * c - p.y * s); }   // a > 0: a hanging arm swings forward, an upright trunk leans back
vec3 cwRy(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, p.z * c - p.x * s); }
vec3 cwRz(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
#endif
varying vec3 vEm; varying float vFade;
`;
/* iVar = (3 + phase, accessory mask, idle arm style 0 hang / 1 hands in front / 2 crossed / 3 hands in the pockets / 4 hands on the hips (+8 = short sleeves), belly);
   iDyn = (excitement, yaw to the action, recoil, fade). A mesh that is not a crowd reads iVar.x = 0 or 1 and is left alone (the AO pass). */
const CROWD_VS = /* glsl */`
vec3 cwP = position, cwN = normal; vEm = vec3(0.0); vFade = 1.0;
#ifdef USE_INSTANCING
if (iVar.x > 2.5) {
  float ph = iVar.x - 3.0, seg = aP.x, sl = aP.z, ch = smoothstep(0.0, 1.0, iDyn.x), rec = iDyn.z, t = uT;
  float h1 = fract(ph * 7.31), h2 = fract(ph * 13.77), h3 = fract(ph * 29.3);
  float ss = step(7.5, iVar.z), style = iVar.z - 8.0 * ss, phone = mod(floor(iVar.y / 64.0), 2.0);
  float show = aP.y < 0.5 ? 1.0 : mod(floor(iVar.y / exp2(aP.y)), 2.0), side = seg > 4.5 ? -1.0 : 1.0;
  cwP.z += aP.w * iVar.w * 0.1; cwP.x *= 1.0 + aP.w * iVar.w * 0.2;
  if (seg > 2.5) {   // arms: elbow, then twist / raise / spread at the shoulder
    vec3 S = vec3(side * 0.205, 1.39, 0.0), E = vec3(side * 0.235, 1.125, 0.0);
    float f = 0.06 + 0.1 * h1 + 0.03 * sin(t * 1.3 + ph * 20.0), e = 0.2 + 0.25 * h2, tw = 0.3, ab = 0.09;
    if (style > 3.5) { f = -0.3; e = 1.25; tw = 1.5; ab = 0.72; }   // hands on the hips
    else if (style > 2.5) { f = -0.12 + 0.03 * sin(t * 0.8 + ph * 33.0); e = 0.5; tw = 0.6; ab = 0.1; }   // hands in the pockets
    else if (style > 1.5) { f = 0.45; e = 1.6 + 0.12 * side; tw = 1.2; ab = 0.05; } else if (style > 0.5) { f = 0.1; e = 0.9; tw = 1.1; ab = 0.03; }
    float up = ch * (side > 0.0 || h3 > 0.35 ? 1.0 : 0.25);   // some pump one fist only
    if (phone > 0.5 && side < 0.0) { f = 1.05 + 0.5 * h1 + 0.3 * ch; e = 1.75 - 0.35 * h1; tw = 0.25; ab = -0.12; up = 0.0; }   // filming
    float w = t * (6.0 + 3.0 * h2) + ph * 40.0 + side, fl = rec * (1.0 - up) * 0.8;
    f = mix(f, 2.7 + 0.28 * sin(w), up); e = mix(e, 0.45 + 0.35 * sin(w + 1.3), up); tw = mix(tw, 0.0, up); ab = mix(ab, 0.22 + 0.25 * h3, up);
    f = mix(f, 1.0, fl); e = mix(e, 1.3, fl);   // hands come up in front of a man who flinches
    if (mod(seg, 2.0) < 0.5) { cwP = E + cwRx(cwP - E, e); cwN = cwRx(cwN, e); }
    cwP = S + cwRz(cwRx(cwRy(cwP - S, -side * tw), f), side * ab); cwN = cwRz(cwRx(cwRy(cwN, -side * tw), f), side * ab);
  } else if (seg > 1.5) {   // head: to the action, glances, thrown back in a shout
    vec3 N = vec3(0.0, 1.5, 0.0); float yaw = iDyn.y * 0.65 + 0.22 * sin(t * (0.3 + 0.3 * h1) + ph * 50.0) * (1.0 - ch), pit = 0.05 * sin(t * 0.7 + h2 * 6.0) + 0.2 * ch;
    cwP = N + cwRy(cwRx(cwP - N, pit), yaw); cwN = cwRy(cwRx(cwN, pit), yaw);
  }
  float lift = smoothstep(0.03, 0.9, position.y);
  if (seg > 0.5) {   // everything above the hips: sway, lean, turn after the head
    vec3 H = vec3(0.0, 0.92, 0.0); float roll = (0.03 + 0.03 * uMood) * sin(t * (0.8 + 0.6 * h1) + ph * 30.0) + 0.05 * ch * sin(t * 5.0 + ph * 9.0), pit = -0.03 - 0.06 * h2 * (1.0 - ch) + 0.28 * rec, twist = iDyn.y * 0.35;
    cwP = H + cwRy(cwRz(cwRx(cwP - H, pit), roll), twist); cwN = cwRy(cwRz(cwRx(cwN, pit), roll), twist); lift = 1.0;
  }
  float crate = step(6.5, aP.y); lift *= 1.0 - crate;
  // weight from foot to foot, a hop when cheering, a step back from a falling body
  cwP += vec3(0.035 * sin(t * (0.5 + 0.5 * h2) + ph * 20.0) * lift, ch * (0.02 + 0.07 * h2) * max(0.0, sin(t * (7.0 + 2.0 * h1) + ph * 17.0)) * (1.0 - crate), -0.24 * rec * lift);
  #ifdef USE_COLOR
  vec3 cc = sl < 0.5 ? iSkin : sl < 1.5 ? iTop : sl < 2.5 ? iBot : sl < 3.5 ? iHat : sl < 4.5 ? color : sl < 5.5 ? mix(iTop, iSkin, ss) : vec3(0.01);
  vColor = cc * mix(0.55, 1.0, smoothstep(0.0, 1.4, position.y));
  #endif
  if (sl > 6.5) vEm = vec3(16.0) * step(0.995 - 0.03 * ch, fract(sin(floor(t * 12.0) * 12.9898 + ph * 78.233) * 43758.5453));
  else if (sl > 5.5) vEm = vec3(0.35, 0.5, 0.8) * (0.9 + 0.3 * sin(t * 3.0 + ph * 77.0));
  vFade = iDyn.w;
  if (show < 0.5 || iDyn.w < 0.004) cwP = vec3(0.0);
}
#endif
vec3 objectNormal = cwN;
`;
function crowdPatch(sh, main) {
  Object.assign(sh.uniforms, CROWD.u);
  sh.vertexShader = sh.vertexShader.replace('void main() {', CROWD_VP + 'void main() {').replace('#include <beginnormal_vertex>', CROWD_VS).replace('#include <begin_vertex>', 'vec3 transformed = cwP;');
  sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec3 vEm; varying float vFade;\nvoid main() {\n  if (vFade < 0.996 && vFade < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;');
  if (main) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vEm;');
}
/* the AO pass redraws the scene with one MeshNormalMaterial: give it the same vertex animation (instanced meshes only), or the AO
   would be computed from the rest pose with every accessory on. The floor blobs are left out of that pass. */
if (gtao) {
  gtao.normalMaterial.onBeforeCompile = sh => crowdPatch(sh, false); gtao.normalMaterial.needsUpdate = true;
  const aoRender = gtao.render.bind(gtao);
  gtao.render = (...a) => { const B = CROWD.blobs, v = B.map(b => b.visible); for (const b of B) b.visible = false; aoRender(...a); B.forEach((b, i) => { b.visible = v[i]; }); };
}

const _cwFr = new THREE.Frustum(), _cwM = new M4(), _cwI = new M4(), _cwS = new THREE.Sphere(), _cwV = new V3(), _cwQ = new Quat(), _cwSc = new V3(), _cwUp = new V3(0, 1, 0);
function makeCrowd(o = {}) {
  const { shape = 'circle', w = 6, h = 6, rows = 3, density = 1, look = 'street', step = 0.56, gap = 0.58, rise = [0, 0.2, 0.42], keep = null, max = 120, seed = 11 } = o;
  const r0 = o.r ?? (shape === 'rect' ? 0.6 : 3.7);   // circle: radius of the front row; rect: how far the front row stands from the w × h rectangle
  const R = locRng(seed), PI = Math.PI, L = CROWD_LOOK[look] || CROWD_LOOK.street, pick = a => a[(R() * a.length) | 0];
  // the line row k stands on: s (metres along it) → [x, z, outward normal x, z]
  const edge = k => {
    const d = r0 + k * step;
    if (shape !== 'rect') return { len: 2 * PI * d, at(s) { const a = s / d; return [d * Math.cos(a), d * Math.sin(a), Math.cos(a), Math.sin(a)]; } };
    const hw = w / 2, hh = h / 2, c = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]], q = PI / 2 * d, len = 2 * (w + h) + 4 * q;
    return { len, at(s) {
      s = ((s % len) + len) % len;
      for (let i = 0; i < 4; i++) {
        const a = i * PI / 2, tx = Math.round(Math.cos(a)), tz = Math.round(Math.sin(a)), nx = tz, nz = -tx, sl = i % 2 ? h : w;
        if (s < sl) return [c[i][0] + tx * s + nx * d, c[i][1] + tz * s + nz * d, nx, nz]; s -= sl;
        if (s < q) { const f = s / d, mx = nx * Math.cos(f) + tx * Math.sin(f), mz = nz * Math.cos(f) + tz * Math.sin(f), cc = c[(i + 1) % 4]; return [cc[0] + mx * d, cc[1] + mz * d, mx, mz]; } s -= q;
      }
      return [c[0][0], c[0][1] - d, 0, -1];
    } };
  };
  let ppl = [];
  for (let k = 0; k < rows; k++) {
    const E = edge(k), n = Math.floor(E.len / gap * density), s0 = R() * gap;
    for (let i = 0; i < n; i++) {
      const u = (s0 + (i + (R() - 0.5) * 0.35) * E.len / n) / E.len, [x0, z0, nx, nz] = E.at(u * E.len), jr = (R() - 0.5) * 0.16, x = x0 + nx * jr, z = z0 + nz * jr, rank = R() * 0.72 + k * 0.14;
      if (keep && !keep(x, z)) continue;
      ppl.push({ x, z, nx, nz, row: k, u: ((u % 1) + 1) % 1, rank });
    }
  }
  ppl.sort((a, b) => a.rank - b.rank); if (ppl.length > max) ppl.length = max;   // GFX.crowd shows the first part of this list: the front row thins last
  const N = ppl.length, NG = Math.max(1, Math.min(12, Math.round(N / 10)));
  const sMat = new Float32Array(N * 16), sCol = new Float32Array(N * 12), sVar = new Float32Array(N * 4), m4 = new M4(), col = new THREE.Color();
  const groups = Array.from({ length: NG }, () => ({ c: new V3(), n: 0, rad: 0, sphere: new THREE.Sphere(), vis: true }));
  ppl.forEach((p, i) => {
    const cl = Math.hypot(p.x, p.z) || 1; let fx = -p.nx * 0.5 - p.x / cl * 0.5, fz = -p.nz * 0.5 - p.z / cl * 0.5;   // facing: inward, at the middle of the floor
    p.yaw = Math.atan2(fx, fz) + (R() - 0.5) * 0.5; const sy = 0.93 + R() * 0.14, sx = sy * (0.9 + R() * 0.22), up = rise[Math.min(p.row, rise.length - 1)] || 0;
    p.y = up ? up * (0.85 + R() * 0.3) : 0;
    m4.compose(_cwV.set(p.x, p.y, p.z), _cwQ.setFromAxisAngle(_cwUp, p.yaw), _cwSc.set(sx, sy, sx)).toArray(sMat, i * 16);
    let hk = R(), mask = L.head[0][0]; for (const [bits, wgt] of L.head) { if (hk < wgt) { mask = bits; break; } hk -= wgt; }
    if (R() < L.phone) mask |= CW_PHONE; if (up) mask |= CW_CRATE;
    const tee = !(mask & CW_HOOD) && R() < L.tee, hat = mask & CW_BALA ? pick(['#0c0c0e', '#17181b', '#101216']) : mask & CW_CAP ? pick(CW_CAPC) : pick(CW_HAIRC), u = R();
    [pick(L.top), pick(CW_BOT), pick(CW_SKIN), hat].forEach((c, k) => col.set(c).toArray(sCol, i * 12 + k * 3));
    p.ph = R(); sVar.set([3 + p.ph * 0.999, mask, (u < 0.25 ? 0 : u < 0.4 ? 1 : u < 0.55 ? 2 : u < 0.8 ? 3 : 4) + (tee ? 8 : 0), R() < 0.25 ? 0.5 + R() * 0.8 : R() * 0.3], i * 4);
    p.exc = 0.6 + R() * 0.6; p.lag = R() * 0.2; p.f1 = 0.25 + R() * 0.2; p.blob = (up ? 0.62 : 0.95) * sx; p.ex = 0; p.hy = 0; p.rec = 0; p.fade = 1; p.seen = false;
    p.g = Math.min(NG - 1, (p.u * NG) | 0); const G = groups[p.g]; G.c.add(_cwV.set(p.x, 1, p.z)); G.n++;
  });
  for (const G of groups) if (G.n) G.c.multiplyScalar(1 / G.n);
  for (const p of ppl) { const G = groups[p.g]; G.rad = Math.max(G.rad, Math.hypot(p.x - G.c.x, p.z - G.c.z)); }
  for (const G of groups) G.sphere.set(G.c, G.rad + 1.5);

  const base = CROWD.geo || (CROWD.geo = crowdGeo()), geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aP']) geo.setAttribute(k, base.attributes[k]);
  const ia = (name, sz) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(N * sz), sz); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const aCol = ['iTop', 'iBot', 'iSkin', 'iHat'].map(n => ia(n, 3)), aVar = ia('iVar', 4), aDyn = ia('iDyn', 4);
  if (!CROWD.mat) {
    CROWD.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, envMapIntensity: 0.45 }); CROWD.mat.onBeforeCompile = sh => crowdPatch(sh, true);
    const tex = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.62)'); g.addColorStop(0.55, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    CROWD.blobMat = new THREE.MeshBasicMaterial({ map: tex, color: '#000000', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const mesh = new THREE.InstancedMesh(geo, CROWD.mat, Math.max(1, N)); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;   // culled here, by sector
  const blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), CROWD.blobMat, Math.max(1, N)); blob.frustumCulled = false; blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage); blob.count = 0; blob.renderOrder = -1;
  CROWD.blobs.push(blob);
  const g = new THREE.Group(); g.add(mesh, blob);
  const pulses = [], idx = new Int32Array(Math.max(1, N)), hot = [0, 0, 0, 0, 0, 0, 0, 0]; let t = 0, lastN = -1, lastHash = 0;

  return {
    group: g, mesh, people: ppl, count: N, shown: 0,
    // for a location where the people themselves are the boundary: put this into LOC.wall (a soft wall for the knockout ragdoll, round or rectangular as the crowd)
    wall: Object.assign(shape === 'rect' ? { kind: 'rect', hx: w / 2 + r0 - 0.3, hz: h / 2 + r0 - 0.3 } : { r: r0 - 0.3 }, { k: 1.8e4, mu: 0.7, h: 1.5, d: 0.6, give: 0.3, damp: 18, top() { return this.h; } }),
    /* a wave of cheering: power 0..1, from a world point (people nearer react sooner and harder), held `hold` seconds at the top */
    cheer(power, pos, hold = 0.3) {
      let x = 0, z = 0; if (pos) { g.updateWorldMatrix(true, false); _cwV.copy(pos).applyMatrix4(_cwI.copy(g.matrixWorld).invert()); x = _cwV.x; z = _cwV.z; }
      pulses.push({ t, p: power, x, z, hold }); if (pulses.length > 8) pulses.shift();
    },
    update(dt) {
      t += dt; g.updateWorldMatrix(true, false); camera.updateMatrixWorld();
      const M = g.matrixWorld, e = M.elements, cam = camera.position; _cwI.copy(M).invert();
      _cwFr.setFromProjectionMatrix(_cwM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const G of groups) G.vis = G.n > 0 && _cwFr.intersectsSphere(_cwS.copy(G.sphere).applyMatrix4(M));
      while (pulses.length && t - pulses[0].t > pulses[0].hold + 6) pulses.shift();
      // where the action is (crowd frame): the man who is down, otherwise between the two heads; and the points people flinch from
      let ax = 0, az = 0, nh = 0;
      if (P1 && P2) {
        const s = G.state, dn = s === 'kd' && G.kd ? G.kd.def : (s === 'ko' || s === 'result' || s === 'replay') && G.loser ? G.loser : null;
        if (dn) _cwV.copy(dn.headNow); else _cwV.addVectors(P1.headNow, P2.headNow).multiplyScalar(0.5);
        _cwV.applyMatrix4(_cwI); ax = _cwV.x; az = _cwV.z;
        if (s !== 'menu') for (const F of [P1, P2]) for (const v of [F.headNow, F.jp[0]]) { _cwV.copy(v).applyMatrix4(_cwI); hot[nh++] = _cwV.x; hot[nh++] = _cwV.z; }
      }
      // the view wedge in front of the fighters (world): people inside it are dissolved, as the location does with bales and cars
      const dx = camL.x - cam.x, dz = camL.z - cam.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, tH = Math.tan(camera.fov * PI / 360) * camera.aspect * 1.1;
      const nAct = Math.min(N, Math.round(N * clamp(GFX.crowd, 0, 1) * CROWD.fill)), kE = 1 - Math.exp(-dt * 9), kF = 1 - Math.exp(-dt * 7), kY = 1 - Math.exp(-dt * 3), kUp = 1 - Math.exp(-dt * 10), kDn = 1 - Math.exp(-dt * 1.3);
      const D = aDyn.array, B = blob.instanceMatrix.array; let n = 0, hash = 0;
      for (let i = 0; i < nAct; i++) {
        const p = ppl[i]; if (!groups[p.g].vis) { p.seen = false; continue; }
        const px = e[0] * p.x + e[8] * p.z + e[12] - cam.x, pz = e[2] * p.x + e[10] * p.z + e[14] - cam.z, s = px * ux + pz * uz;
        const ft = s > -0.6 && s < len - 0.6 ? clamp((Math.abs(px * uz - pz * ux) - 0.7 - Math.max(s, 0) * tH) / 0.4, 0, 1) : 1;
        // anyone within reach of the lens is gone at once: a half-dissolved body right in front of the camera dithers the whole screen
        const near = s > -1.2 && s < 1.6 && Math.abs(px * uz - pz * ux) < 1.3;
        p.fade = near ? 0 : p.seen ? p.fade + (ft - p.fade) * kF : ft; p.seen = true;
        let ex = 0;
        for (const c of pulses) { const dist = Math.hypot(p.x - c.x, p.z - c.z), tau = t - c.t - dist / 6 - p.lag; if (tau <= 0) continue;
          ex = Math.max(ex, c.p * p.exc * (0.5 + 0.5 * Math.exp(-dist / 3.5)) * (tau < 0.18 ? tau / 0.18 : tau < 0.18 + c.hold ? 1 : Math.exp(-(tau - 0.18 - c.hold) / 0.8))); }
        const sp = Math.sin(t * p.f1 + p.ph * 40) * Math.sin(t * 0.23 + p.ph * 17) - (1.12 - CROWD.mood * 0.5); if (sp > 0) ex = Math.max(ex, Math.min(1, sp * 6) * 0.8);   // now and then somebody shouts on his own
        p.ex += (Math.min(1, ex) - p.ex) * kE;
        let yw = Math.atan2(ax - p.x, az - p.z) - p.yaw; yw -= Math.round(yw / (2 * PI)) * 2 * PI; p.hy += (clamp(yw, -1.2, 1.2) - p.hy) * kY;
        let rc = 0; for (let k = 0; k < nh; k += 2) rc = Math.max(rc, clamp((1.15 - Math.hypot(p.x - hot[k], p.z - hot[k + 1])) / 0.45, 0, 1));
        p.rec += (rc - p.rec) * (rc > p.rec ? kUp : kDn);
        if (p.fade < 0.004) continue;
        const j = n * 4, b = n * 16, bs = p.blob * p.fade; D[j] = p.ex; D[j + 1] = p.hy; D[j + 2] = p.rec; D[j + 3] = p.fade;
        B[b] = bs; B[b + 1] = B[b + 2] = B[b + 3] = B[b + 4] = 0; B[b + 5] = 1; B[b + 6] = B[b + 7] = B[b + 8] = B[b + 9] = 0; B[b + 10] = bs; B[b + 11] = 0; B[b + 12] = p.x; B[b + 13] = p.y + 0.004; B[b + 14] = p.z; B[b + 15] = 1;
        idx[n++] = i; hash = (hash * 31 + i + 1) | 0;
      }
      if (n !== lastN || hash !== lastHash) {   // the set of drawn people changed: repack what never changes per person
        lastN = n; lastHash = hash; const IM = mesh.instanceMatrix.array, V = aVar.array;
        for (let k = 0; k < n; k++) { const i = idx[k]; for (let q = 0; q < 16; q++) IM[k * 16 + q] = sMat[i * 16 + q]; for (let q = 0; q < 4; q++) V[k * 4 + q] = sVar[i * 4 + q]; for (let c = 0; c < 4; c++) for (let q = 0; q < 3; q++) aCol[c].array[k * 3 + q] = sCol[i * 12 + c * 3 + q]; }
        mesh.instanceMatrix.needsUpdate = true; aVar.needsUpdate = true; for (const a of aCol) a.needsUpdate = true;
      }
      aDyn.needsUpdate = true; blob.instanceMatrix.needsUpdate = true;
      mesh.count = blob.count = n; mesh.visible = blob.visible = n > 0; this.shown = n;
    },
  };
}

/* per frame (frame(), after the camera): the mood of the crowd from the state of the fight — a lull between rounds — its animation
   and the level of its murmur */
function crowdTick(dt) {
  const c = LOC.crowd && LOC.group && LOC.group.visible ? LOC.crowd : null, s = G.state;
  const tgt = !c ? 0 : s === 'fight' ? 0.42 : s === 'kd' ? 0.7 : s === 'ko' ? 0.85 : s === 'break' ? 0.06 : s === 'replay' ? 0.45 : s === 'intro' || s === 'result' ? 0.3 : 0.14;
  CROWD.heat = Math.max(0, CROWD.heat - dt * 0.25);
  CROWD.mood += (Math.min(1, tgt + CROWD.heat) - CROWD.mood) * (1 - Math.exp(-dt * 1.4));
  CROWD.u.uT.value += dt; CROWD.u.uMood.value = CROWD.mood;
  if (c) c.update(dt);
  sfx.crowd(c && s !== 'menu' ? (0.25 + 0.75 * CROWD.mood) * (0.55 + 0.45 * CROWD.fill) : 0);
}
/* reactions: a clean hard shot, a knockdown, a knockout → a wave of cheering from the place it happened, and a roar as loud */
EVT.on((type, e) => {
  const c = LOC.crowd; if (!c) return; const p = e.power || 0;
  if (type === 'hit') { if (e.blocked) return; CROWD.heat = Math.min(0.4, CROWD.heat + 0.04 + 0.08 * p); if (p > 0.6) { const k = clamp((p - 0.45) * 1.1, 0.2, 0.8); c.cheer(k, e.pos, 0.1); sfx.roar(k * 0.6); } }
  else if (type === 'kd') { c.cheer(0.9, e.pos, 1.4); sfx.roar(0.8); CROWD.heat = 0.4; }
  else if (type === 'ko') { c.cheer(1, e.pos, 4); sfx.roar(1); CROWD.heat = 0.5; }
  else if (type === 'up') { c.cheer(0.5, e.pos, 0.4); sfx.roar(0.35); }
  else if (type === 'round') { c.cheer(0.4, null, 0.5); sfx.roar(0.3); }
});
