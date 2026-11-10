/* ───────── crowd: the people around the fighting floor (any location can use it) ─────────
   makeCrowd({ shape: 'circle' | 'rect', r | w, h, rows, density, look, squat }) → { group, update(dt), cheer(power, pos, hold, kind), wall, count }.
   One figure (≈1200 triangles with every accessory, welded to ≈1000 vertices) drawn as ONE InstancedMesh, plus one InstancedMesh of soft blobs on the
   floor (no real shadows): 2 draw calls, 3 with the AO normal pass. There are no bones: the vertex shader poses the figure from a
   per-vertex chain id (trunk / head / arms / legs) with joint weights (spine, neck, shoulder, elbow, knee, ankle: the limbs are single
   tubes that bend), a table of poses (`CW_POSES` → uniform `uPose`) and per-instance values. A person has a base pose and a gesture he
   drifts into on his own rhythm (shouting, clapping, pumping a fist), a reaction of his own when the crowd cheers (arms up, jumping,
   clapping overhead…), hands on the head after a knockdown, a wince / turn away on a brutal hit, a flinch back from a falling body.
   Accessories (hair, afro, bun, cap, beanie, hood up / down, skull sockets, phone, crate under the feet) are all in the one geometry;
   an instance bit mask collapses the ones a person does not wear. Balaclava, skull plate, buzz cut, stubble, open jacket, T-shirt
   sleeves are painted per face (tags). Colours are packed per instance (sRGB bytes in a float), build / belly / height vary too.
   The CPU only keeps a few numbers per person (excitement, head yaw, recoil, fade, wince, awe) and packs the visible ones: the crowd
   is split into sectors that are frustum-culled, and whoever stands between the camera and the fighters is dissolved (dither).
   Density follows GFX.crowd (low ≈ 0.3 of the people, high = all). Reactions come from EVT (07_state_replay_hits.js). */
const CROWD = { u: { uT: { value: 0 }, uMood: { value: 0.15 }, uPose: { value: null } }, geo: null, mat: null, blobMat: null, blobs: [], mood: 0.15, heat: 0, fill: 1 };   // fill: the share of the crowd that came (a career fight sets it, startFight)
// bits of the instance mask (bit n ↔ accessory number n in the geometry; BUZZ, OPEN and BALA only repaint faces)
const CW_HAIR = 2, CW_CAP = 4, CW_HOOD = 8, CW_BALA = 16, CW_SKULL = 32, CW_PHONE = 64, CW_CRATE = 128, CW_BUZZ = 256, CW_AFRO = 512, CW_BUN = 1024, CW_BEANIE = 2048, CW_HOODDN = 4096, CW_OPEN = 8192;
const CROWD_LOOK = {
  street: { head: [[CW_HAIR, 0.2], [CW_BUZZ, 0.14], [0, 0.04], [CW_AFRO, 0.06], [CW_HAIR | CW_BUN, 0.05], [CW_CAP | CW_HAIR, 0.08], [CW_CAP | CW_BUZZ, 0.07], [CW_BEANIE | CW_HAIR, 0.1], [CW_BEANIE, 0.04], [CW_HOOD, 0.12], [CW_HOOD | CW_CAP, 0.05], [CW_BALA, 0.03], [CW_HOOD | CW_BALA, 0.02]], phone: 0.22, tee: 0.12,
    top: ['#15171b', '#1d2230', '#23262b', '#2e3138', '#3a3327', '#2b3524', '#4a1c1f', '#5b5e63', '#7a7d80', '#1f3557', '#8a1b1b', '#c9c7c0', '#b08a2e', '#3d4a3a', '#6a2f18', '#24404a', '#d8d2c4'] },
  // the warehouse: balaclavas and skull masks, dark clothes
  masked: { head: [[CW_BALA, 0.28], [CW_HOOD | CW_BALA, 0.2], [CW_BALA | CW_SKULL, 0.18], [CW_HOOD | CW_BALA | CW_SKULL, 0.14], [CW_HOOD, 0.08], [CW_CAP | CW_BUZZ, 0.05], [CW_BEANIE | CW_BALA, 0.07]], phone: 0.12, tee: 0.04,
    top: ['#0e0f11', '#15171b', '#1b1d22', '#23262b', '#2a1416', '#1a2030', '#2b2d31', '#1c2a1e'] },
};
const CW_BOT = ['#1b2230', '#27364f', '#34496b', '#15161a', '#2a2b2e', '#3a3d42', '#4a4433', '#566b8a', '#20241c'];
const CW_SKIN = ['#e6bfa3', '#dcae8e', '#d0a07e', '#c48d69', '#a9754f', '#8b5b3c', '#6e4630', '#5a3825', '#4a301f', '#3c2619'];   // from pale to very dark
const CW_HAIRC = ['#16120f', '#2a1d14', '#4a3320', '#6b5236', '#8a8a8c', '#101010', '#a8763a', '#0c0a09'], CW_CAPC = ['#111214', '#e6e4de', '#8a1b1b', '#1f3557', '#2d2f33', '#3d4a3a', '#c9a227'];
const CW_INNER = ['#e8e6e0', '#d0d0d0', '#101114', '#8a8d92', '#7a1a1a', '#28407a', '#c9b98a'], CW_SHOE = ['#e9e7e2', '#111113', '#1c1c20', '#55585d', '#7a1c1c', '#2a3a5a', '#d8d4c8', '#3a2c20'];

/* poses: [name, left arm, right arm (null = as the left), body]. An arm is (raise forward, elbow, twist inward, spread sideways) in
   radians from the hanging arm; the body is (crouch: thigh angle, trunk pitch (+ back), trunk roll, animation: 1 clap, 2 shout,
   3 pump (right arm), 4 filming, 5 wave, 7 wave + jump). The five from 'c-wave' on are reactions: a person owns one of them. */
const CW_POSES = [
  ['hang', [0.08, 0.25, 0.3, 0.09], null, [0, 0, 0, 0]],
  ['pockets', [-0.3, 0.95, 0.7, 0.25], null, [0, 0, 0, 0]],
  ['crossed', [0.5, 1.72, 1.25, 0.05], [0.42, 1.5, 1.2, 0.05], [0, 0.03, 0, 0]],
  ['hips', [-0.3, 1.25, 1.5, 0.72], null, [0, 0, 0, 0]],
  ['clasp', [0.2, 0.25, 1.2, -0.2], null, [0, 0, 0, 0]],
  ['pouch', [-0.3, 1.5, 0.6, 0.05], null, [0, -0.03, 0, 0]],
  ['chin', [0.1, 1.55, 1.2, -0.15], [0.65, 2.35, 1.0, -0.3], [0, 0, 0, 0]],
  ['film1', [-0.3, 0.95, 0.7, 0.25], [0.9, 1.75, 0, 0.15], [0, 0, 0, 4]],
  ['film2', [0.8, 1.7, 0.5, 0], null, [0, 0, 0, 4]],
  ['shout', [1.25, 2.15, -0.7, 1.4], null, [0, -0.08, 0, 2]],
  ['clap', [0.4, 1.75, 0.7, 0.1], null, [0, 0, 0, 1]],
  ['pump', [0.1, 0.5, 0.4, 0.1], [2.5, 0.9, 0, -0.15], [0, 0, 0, 3]],
  ['buddy', [-0.3, 0.75, 0.15, 1.42], [-0.3, 0.95, 0.7, 0.25], [0, 0, 0.03, 0]],
  ['squat', [0.7, 0.2, 0.5, -0.1], null, [1.5, -0.5, 0, 0]],
  ['lean', [-0.3, 0.95, 0.7, 0.25], [0.08, 0.25, 0.3, 0.09], [0, 0, 0.09, 0]],
  ['back', [-0.35, 0.8, 1.5, 0.1], null, [0, 0.02, 0, 0]],
  ['c-wave', [2.7, 0.45, 0, -0.25], null, [0, 0.05, 0, 5]],
  ['c-pump', [0.3, 0.9, 0.6, 0.1], [2.6, 0.8, 0, -0.15], [0, 0, 0, 3]],
  ['c-clap', [1.4, 1.45, -0.7, 1.55], null, [0, 0.04, 0, 1]],
  ['c-jump', [2.9, 0.3, 0, -0.3], null, [0, 0.06, 0, 7]],
  ['c-wide', [2.6, 0.3, 0, -0.7], null, [0, 0.1, 0, 5]],
  ['awe', [2.6, 1.65, 1.0, -0.3], null, [0, 0.08, 0, 0]],
  ['wince', [0.05, 2.15, 0.5, 0.05], [1.7, 1.65, 0, 0.85], [0, 0.12, 0, 0]],
];
const CW_ID = {}; CW_POSES.forEach((p, i) => { CW_ID[p[0]] = i; });
CROWD.u.uPose.value = new Float32Array(CW_POSES.flatMap(p => [...p[1], ...(p[2] || p[1]), ...p[3]]));

/* the figure in its rest pose: 1.76 m, feet at y = 0, facing +z, left arm at +x, arms hanging. Vertex attributes:
   aP = (chain: 0 static, 1 trunk, 2 head, 3 / 4 left / right arm, 5 / 6 left / right leg; accessory number (0 = always shown, −n = hidden
         when bit n is set); colour slot: 0 skin, 1 top, 2 trousers, 3 hat, 4 the vertex colour, 5 sleeve, 6 phone screen, 7 phone LED,
         8 front of an open jacket, 9 hair, 10 shoe, 11 lips, 12 brows; belly weight)
   aQ = (joint weight: spine / neck / elbow / knee; root weight: shoulder / ankle; baked occlusion; paint tag: 1 scalp, 2 jaw (stubble),
         3 eye band, 4 face, 6 ears, 7 neck, 9 hands)
   The pivots are repeated in CROWD_VS: shoulder (±0.2, 1.40), elbow y 1.12, hip (±0.09, 0.92), knee y 0.5, ankle y 0.08, neck y 1.5. */
function crowdGeo() {
  const PI = Math.PI, parts = [];
  const add = (g, chain, acc, slot, o = {}) => {
    g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
    const p = g.attributes.position, nm = g.attributes.normal, n = p.count, a = new Float32Array(n * 4), q = new Float32Array(n * 4), c = new Float32Array(n * 3), k = new THREE.Color(o.col || '#000');
    const fn = v => typeof v === 'function' ? v : () => v, W = fn(o.w || [0, 0]), AO = fn(o.ao ?? 1), TAG = fn(o.tag || 0), SL = fn(slot);
    for (let f = 0; f < n; f += 3) {
      const cx = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3, cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, cz = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3, s = SL(cx, cy, cz), tg = TAG(cx, cy, cz);
      for (let i = f; i < f + 3; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), w = W(x, y, z);
        a[i * 4] = chain; a[i * 4 + 1] = acc; a[i * 4 + 2] = s; a[i * 4 + 3] = o.belly ? Math.exp(-(((y - 1.07) / 0.17) ** 2)) * (z > 0 ? 1 : 0.3) : 0;
        q[i * 4] = w[0]; q[i * 4 + 1] = w[1]; q[i * 4 + 2] = AO(x, y, z, nm.getX(i), nm.getY(i), nm.getZ(i)); q[i * 4 + 3] = tg;
        c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
      }
    }
    g.setAttribute('aP', new THREE.BufferAttribute(a, 4)); g.setAttribute('aQ', new THREE.BufferAttribute(q, 4)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g);
  };
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // a tube through rings [y, rx, rz front, rz back, cz, cx] at the given angles (0 = front) or n even sides; smooth normals, optional caps
  const lathe = (rings, ang, capB, capT, bulge = 0.012) => {
    if (typeof ang === 'number') ang = Array.from({ length: ang }, (_, j) => j / ang * 2 * PI);
    const pos = [], idx = [], m = rings.length, n = ang.length;
    for (const [y, rx, rf, rb = rf, cz = 0, cx = 0] of rings) for (const a of ang) { const c = Math.cos(a); pos.push(cx + Math.sin(a) * rx, y, cz + c * (c >= 0 ? rf : rb)); }
    for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n; idx.push(a, b, b + n, a, b + n, a + n); }
    for (const [on, i, top] of [[capB, 0, 0], [capT, m - 1, 1]]) if (on) { const c = pos.length / 3, R = rings[i]; pos.push(R[5] || 0, R[0] + (top ? bulge : -bulge), R[4] || 0); for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n; top ? idx.push(c, a, b) : idx.push(c, b, a); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  // keep only the quads whose centre passes `keep(x, y, z)`
  const cut = (g, keep) => {
    g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position.array, nm = g.attributes.normal.array, P = [], Nn = [], m = (i, k) => { let s = 0; for (let q = 0; q < 18; q += 3) s += p[i + q + k]; return s / 6; };
    for (let i = 0; i + 17 < p.length; i += 18) { if (!keep(m(i, 0), m(i, 1), m(i, 2))) continue; for (let k = 0; k < 18; k++) { P.push(p[i + k]); Nn.push(nm[i + k]); } }   // by pairs of triangles (the quads of a lathe): no saw-tooth edge
    const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); return o;
  };
  const ball = (rx, ry, rz, x, y, z, ws, hs) => { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz).translate(x, y, z); g.computeVertexNormals(); return g; };
  const sym = d => [...d, ...d.filter(v => v > 0 && v < 180).reverse().map(v => 360 - v)].map(v => v * PI / 180);   // angles of one side → all round
  const A10 = sym([0, 16, 50, 90, 132, 180]), AH = sym([0, 25, 55, 90, 135, 180]);

  // legs (trousers), shoes with a pale sole
  for (const s of [-1, 1]) {
    const ch = s > 0 ? 5 : 6, x = s * 0.09, inner = (px, y, z, nx) => 1 - 0.3 * Math.max(0, -s * nx) * sst(0.2, 0.7, y);
    add(lathe([[0.1, 0.05, 0.056, 0.052, 0, x], [0.32, 0.055, 0.056, 0.066, -0.006, x], [0.45, 0.054, 0.062, 0.056, 0, x], [0.56, 0.06, 0.068, 0.06, 0.002, x], [0.76, 0.074, 0.082, 0.085, 0, x], [0.94, 0.05, 0.07, 0.08, 0, x * 0.85]], 6, false, false),
      ch, 0, 2, { w: (px, y) => [sst(0.57, 0.43, y), sst(0.16, 0.06, y)], ao: inner });
    const sh = lathe([[-0.075, 0.026, 0.02, 0.02], [-0.05, 0.041, 0.036, 0.05], [0.03, 0.046, 0.036, 0.044], [0.1, 0.047, 0.034, 0.024], [0.15, 0.038, 0.027, 0.016]], 5, true, true, 0.014).rotateX(PI / 2).translate(x, 0.037, 0.02);
    const sp = sh.attributes.position; for (let i = 0; i < sp.count; i++) if (sp.getY(i) < 0.004) sp.setY(i, 0.004);
    add(sh, ch, 0, (cx, cy) => cy < 0.02 ? 4 : 10, { col: '#b9b6ae', w: [1, 1], ao: 0.9 });
  }
  // trunk: jacket / hoodie / T-shirt from the hips to the base of the neck; the strip down the front is the T-shirt under an open jacket
  add(lathe([[0.84, 0.17, 0.124, 0.126], [1.06, 0.152, 0.112, 0.108, 0.002], [1.2, 0.162, 0.118, 0.11, 0.004], [1.32, 0.174, 0.128, 0.118, 0.004], [1.4, 0.166, 0.112, 0.114, 0], [1.46, 0.118, 0.086, 0.094, -0.004], [1.495, 0.062, 0.06, 0.066, -0.008]], A10, false, true, 0.004),
    1, 0, (cx, cy, cz) => cz > 0.08 && Math.abs(cx) < 0.04 && cy < 1.46 ? 8 : 1, { belly: true, w: (x, y) => [sst(0.92, 1.25, y), 0], ao: (x, y, z, nx) => 1 - 0.22 * sst(0.6, 1, Math.abs(nx)) * sst(1.4, 1.25, y) });
  // neck, head (chin → crown), nose, ears, eyes, brows, mouth
  const neckW = (x, y) => [sst(1.45, 1.57, y) * 0.75, 0], HW = [1, 0];
  add(lathe([[1.44, 0.052, 0.05, 0.056, -0.006], [1.56, 0.047, 0.048, 0.054, 0.002]], 5, false, false), 2, 0, 0, { w: neckW, ao: 0.72, tag: 7 });
  const headRings = [[1.518, 0.022, 0.026, 0.02, 0.04], [1.536, 0.048, 0.05, 0.03, 0.03], [1.565, 0.066, 0.066, 0.056, 0.018], [1.6, 0.075, 0.074, 0.078, 0.008], [1.632, 0.08, 0.076, 0.09, 0.004], [1.668, 0.082, 0.081, 0.094, 0.002], [1.703, 0.079, 0.075, 0.09, 0], [1.73, 0.063, 0.057, 0.071, -0.004], [1.746, 0.034, 0.032, 0.038, -0.008]];
  add(lathe(headRings, AH, true, true, 0.006), 2, 0, 0, { w: HW, ao: (x, y) => 0.8 + 0.2 * sst(1.52, 1.6, y),
    tag: (x, y, z) => y > 1.705 || (z < 0 && y > 1.6) ? 1 : y < 1.6 ? (z < -0.02 ? 0 : 2) : y > 1.632 && y < 1.668 && z > 0.03 ? 3 : z > 0 ? 4 : 0 });
  { const P = [[0, 1.662, 0.082], [0, 1.61, 0.107], [0.018, 1.603, 0.079], [-0.018, 1.603, 0.079], [0, 1.596, 0.083]], F = [0, 2, 1, 0, 1, 3, 2, 4, 1, 1, 4, 3];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(F.flatMap(i => P[i]), 3)); g.computeVertexNormals(); add(g, 2, 0, 0, { w: HW, tag: 4, ao: (x, y, z, nx, ny) => ny < -0.3 ? 0.62 : 1 }); }
  for (const s of [-1, 1]) {
    add(ball(0.011, 0.027, 0.017, s * 0.078, 1.632, -0.006, 4, 2), 2, 0, 0, { w: HW, tag: 6, ao: 0.9 });
    add(new THREE.PlaneGeometry(0.025, 0.0115).rotateY(s * 0.4).translate(s * 0.031, 1.648, 0.0795), 2, 0, 4, { col: '#8f887e', w: HW });   // the white of the eye (in the shadow of the brow), the iris
    add(new THREE.PlaneGeometry(0.0115, 0.0115).rotateY(s * 0.4).translate(s * 0.0305, 1.6485, 0.0806), 2, 0, 4, { col: '#0d0908', w: HW });
    add(new THREE.PlaneGeometry(0.032, 0.0075).rotateZ(-s * 0.1).rotateY(s * 0.42).translate(s * 0.032, 1.6645, 0.0825), 2, -4, 12, { w: HW });
  }
  add(new THREE.PlaneGeometry(0.042, 0.0075).translate(0, 1.5745, 0.0862), 2, -4, 11, { w: HW });
  // hair: short (skull cap + the back and sides), afro, a bun at the back; baseball cap, beanie
  const grow = (d, d0 = d) => headRings.map(([y, rx, rf, rb, cz]) => { const k = d0 + (d - d0) * sst(1.6, 1.735, y); return [y, rx + k, rf + k, rb + k, cz]; });   // d0: at the lower edge (the hair lies close there)
  add(cut(lathe([...grow(0.017, 0.004).slice(3, 8), [1.768, 0.038, 0.036, 0.042, -0.008]], 8, false, true, 0.005), (x, y, z) => y > 1.71 || (z < 0.035 && y > 1.635) || (z < -0.03 && y > 1.6)), 2, 1, 9, { w: HW, ao: (x, y) => 0.8 + 0.2 * sst(1.64, 1.76, y) });
  { const g = cut(ball(0.118, 0.11, 0.122, 0, 1.69, -0.012, 8, 4), (x, y, z) => y > 1.66 || z < -0.01), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i) - 1.69, z = p.getZ(i) + 0.012, k = 1 + 0.07 * Math.sin(x * 97 + y * 131 + z * 71); p.setXYZ(i, x * k, 1.69 + y * k, z * k - 0.012); }
    add(g, 2, 9, 9, { w: HW, ao: (x, y) => 0.75 + 0.25 * sst(1.62, 1.76, y) }); }
  add(ball(0.034, 0.034, 0.034, 0, 1.7, -0.108, 4, 3), 2, 10, 9, { w: HW });
  const tiltHat = g => g.translate(0, -1.66, 0).rotateX(-0.14).translate(0, 1.66, 0);
  add(tiltHat(lathe([[1.682, 0.086, 0.09, 0.103, 0.002], [1.728, 0.077, 0.078, 0.092, 0], [1.762, 0.045, 0.045, 0.055, -0.004]], 8, false, true, 0.008)), 2, 2, 3, { w: HW });
  add(tiltHat(geoBox(0.15, 0.01, 0.1, 0, 1.688, 0.135)), 2, 2, 3, { w: HW, ao: 0.85 });
  add(tiltHat(lathe([[1.664, 0.09, 0.094, 0.107, 0.002], [1.69, 0.091, 0.094, 0.108, 0.002], [1.73, 0.08, 0.08, 0.096, -0.002], [1.775, 0.05, 0.05, 0.062, -0.01]], 7, false, true, 0.016)), 2, 11, 3, { w: HW });
  // hood up (face opening cut out) with its drape on the shoulders; hood down: a roll behind the neck
  add(cut(lathe([[1.5, 0.1, 0.092, 0.108, -0.008], [1.575, 0.106, 0.104, 0.124, -0.004], [1.655, 0.108, 0.108, 0.13, -0.004], [1.725, 0.098, 0.1, 0.124, -0.006], [1.772, 0.06, 0.062, 0.08, -0.014]], 8, false, true, 0.012), (x, y, z) => !(z > 0.05 && y > 1.54 && y < 1.71 && Math.abs(x) < 0.075)), 2, 3, 1, { w: HW, ao: (x, y, z) => z > 0.05 ? 0.75 : 1 });
  add(lathe([[1.415, 0.152, 0.104, 0.112, -0.006], [1.5, 0.1, 0.092, 0.108, -0.008]], 6, false, false), 1, 3, 1, { w: [1, 0] });
  add(ball(0.105, 0.05, 0.058, 0, 1.455, -0.082, 5, 3), 1, 12, 1, { w: [1, 0], ao: 0.9 });
  // skull mask (the plate itself is painted on the face): black sockets, nose hole, teeth line
  for (const s of [-1, 1]) add(new THREE.CircleGeometry(0.027, 6).scale(1, 0.85, 1).rotateZ(-s * 0.25).rotateY(s * 0.4).translate(s * 0.035, 1.65, 0.0845), 2, 5, 4, { col: '#040404', w: HW });
  add(new THREE.CircleGeometry(0.013, 3).rotateZ(PI / 2).rotateX(-0.45).translate(0, 1.61, 0.101), 2, 5, 4, { col: '#040404', w: HW });

  add(new THREE.PlaneGeometry(0.07, 0.016).translate(0, 1.566, 0.0885), 2, 5, 4, { col: '#040404', w: HW });
  // arms: one tube from the shoulder cap to the wrist, a mitten hand with a thumb; the phone lies in the right hand (screen to +z)
  for (const s of [-1, 1]) {
    const ch = s > 0 ? 3 : 4, x = s * 0.2, aw = (px, y) => [sst(1.18, 1.06, y), sst(1.44, 1.37, y) * 0.65 + 0.35];
    add(lathe([[0.87, 0.031, 0.034, 0.034, 0, x], [0.98, 0.04, 0.043, 0.043, 0, x], [1.085, 0.042, 0.045, 0.045, 0, x], [1.155, 0.045, 0.048, 0.048, 0, x], [1.27, 0.05, 0.054, 0.054, 0, x], [1.375, 0.058, 0.06, 0.06, 0, x], [1.418, 0.046, 0.05, 0.05, 0, x - s * 0.008], [1.436, 0.022, 0.026, 0.026, 0, x - s * 0.018]], 6, false, true, 0.006),
      ch, 0, (cx, cy) => cy < 1.27 ? 5 : 1, { w: aw, ao: (px, y, z, nx) => 1 - 0.3 * Math.max(0, -s * nx) });
    add(ball(0.018, 0.04, 0.034, x, 0.832, 0.004, 5, 3), ch, 0, 0, { w: [1, 1], tag: 9 });   // palm, half-curled fingers, thumb
    add(ball(0.016, 0.034, 0.03, x - s * 0.008, 0.778, 0.01, 4, 3), ch, 0, 0, { w: [1, 1], tag: 9, ao: 0.9 });
    add(ball(0.011, 0.028, 0.013, x - s * 0.008, 0.822, 0.04, 3, 2), ch, 0, 0, { w: [1, 1], tag: 9 });
  }
  add(geoBox(0.07, 0.145, 0.011, -0.2, 0.755, 0.036), 4, 6, 4, { col: '#0a0a0c', w: [1, 1] });
  add(new THREE.PlaneGeometry(0.06, 0.13).translate(-0.2, 0.755, 0.0422), 4, 6, 6, { w: [1, 1] });
  add(new THREE.PlaneGeometry(0.02, 0.02).rotateY(PI).translate(-0.183, 0.703, 0.03), 4, 6, 7, { w: [1, 1] });
  // a crate under the feet of the back rows (the instance stands at the height of its top)
  add(geoBox(0.54, 0.6, 0.54, 0, -0.3, 0), 0, 7, 4, { col: '#4f3d28' });
  // weld: vertices that agree in every attribute are shared (normals are smooth inside a part, paint stays per face)
  const m = mergeGeometries(parts), names = ['position', 'normal', 'color', 'aP', 'aQ'], src = names.map(k => m.attributes[k]), out = names.map(() => []), map = new Map(), idx = [];
  for (let i = 0; i < src[0].count; i++) {
    let key = ''; for (const a of src) for (let k = 0; k < a.itemSize; k++) key += Math.round(a.array[i * a.itemSize + k] * 2e4) + ',';
    let j = map.get(key); if (j === undefined) { j = map.size; map.set(key, j); src.forEach((a, q) => { for (let k = 0; k < a.itemSize; k++) out[q].push(a.array[i * a.itemSize + k]); }); }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry(); names.forEach((k, q) => g.setAttribute(k, new THREE.Float32BufferAttribute(out[q], src[q].itemSize))); g.setIndex(idx);
  return g;
}

const CROWD_VP = /* glsl */`
#ifdef USE_INSTANCING
attribute vec4 aP, aQ, iVar, iVar2, iDyn, iCol, iCol2; attribute vec2 iDyn2;
uniform float uT, uMood; uniform vec4 uPose[${CW_POSES.length * 3}];
vec3 cwRx(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c + p.z * s, p.z * c - p.y * s); }   // a > 0: a hanging arm swings forward, an upright trunk leans back
vec3 cwRy(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, p.z * c - p.x * s); }
vec3 cwRz(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }
vec3 cwCol(float v) { return pow(vec3(floor(v / 65536.0), mod(floor(v / 256.0), 256.0), mod(v, 256.0)) / 255.0, vec3(2.2)); }
float cwBit(float m, float n) { return mod(floor(m / exp2(n)), 2.0); }
#endif
varying vec3 vEm, vObj; varying float vFade, vCl;
`;
/* iVar = (3 + phase, accessory mask, base pose (+32 = short sleeves), belly); iVar2 = (build −1 slim … +1 heavy, stubble, gesture pose,
   mirrored); iCol = (top, trousers, skin, hat), iCol2 = (T-shirt under the jacket, hair, shoes, −) as packed sRGB bytes;
   iDyn = (excitement, yaw to the action, recoil, fade), iDyn2 = (wince, awe).
   A mesh that is not a crowd reads iVar.x = 0 or 1 and is left alone (the AO pass). */
const CROWD_VS = /* glsl */`
vec3 cwP = position, cwN = normal; vEm = vec3(0.0); vFade = 1.0; vObj = position; vCl = 0.0;
#ifdef USE_INSTANCING
if (iVar.x > 2.5) {
  float ph = iVar.x - 3.0, ch = aP.x, sl = aP.z, t = uT, ex = smoothstep(0.0, 1.0, iDyn.x), rec = iDyn.z, wn = iDyn2.x, aw = iDyn2.y;
  float h1 = fract(ph * 7.31), h2 = fract(ph * 13.77), h3 = fract(ph * 29.3), h4 = fract(ph * 53.9);
  float tee = step(31.5, iVar.z), pose = iVar.z - 32.0 * tee, mir = step(0.5, iVar2.w), wdir = 1.0 - 2.0 * mir;
  float accN = abs(aP.y), bit = accN < 0.5 ? 1.0 : cwBit(iVar.y, accN), show = aP.y < -0.5 ? 1.0 - bit : bit;
  // the pose: base ↔ own gesture on a personal rhythm (more often when the crowd is hot), the cheer reaction, awe, wince
  float g = smoothstep(0.5, 0.75, 0.5 + 0.5 * sin(t * (0.22 + 0.3 * h2) + ph * 60.0) + (uMood - 0.4) * 0.4);
  int i0 = int(pose + 0.5) * 3, i1 = int(iVar2.z + 0.5) * 3, i2 = (${CW_ID['c-wave']} + int(h3 * 4.999)) * 3;
  float wc = smoothstep(0.0, 0.4, iDyn.x);   // a man who cheers at all goes into his reaction pose all the way; how hard he shakes follows the excitement
  vec3 wk = vec3((1.0 - wc) * (1.0 - g), (1.0 - wc) * g, wc), kind = vec3(uPose[i0 + 2].w, uPose[i1 + 2].w, uPose[i2 + 2].w); float calm = (1.0 - aw) * (1.0 - wn);
  vec4 PL = uPose[i0] * wk.x + uPose[i1] * wk.y + uPose[i2] * wk.z, PR = uPose[i0 + 1] * wk.x + uPose[i1 + 1] * wk.y + uPose[i2 + 1] * wk.z, PB = uPose[i0 + 2] * wk.x + uPose[i1 + 2] * wk.y + uPose[i2 + 2] * wk.z;
  PL = mix(mix(PL, uPose[${CW_ID.awe * 3}], aw), uPose[${CW_ID.wince * 3}], wn); PR = mix(mix(PR, uPose[${CW_ID.awe * 3 + 1}], aw), uPose[${CW_ID.wince * 3 + 1}], wn); PB = mix(mix(PB, uPose[${CW_ID.awe * 3 + 2}], aw), uPose[${CW_ID.wince * 3 + 2}], wn);
  if (mir > 0.5) { vec4 sw = PL; PL = PR; PR = sw; PB.z = -PB.z; }
  #define CWK(n) (dot(wk, step(abs(kind - n), vec3(0.5))) * calm)
  float aClap = CWK(1.0), aShout = CWK(2.0), aPump = CWK(3.0), aFilm = CWK(4.0), aJump = CWK(7.0), aWave = CWK(5.0) + aJump, live = 0.55 + 0.45 * mix(uMood, 1.0, ex);
  float w = t * (6.0 + 3.0 * h2) + ph * 40.0, hop = sin(t * (7.0 + 2.0 * h1) + ph * 17.0), slow = sin(t * (0.25 + 0.2 * h4) + ph * 20.0);
  float bx = 1.0 + 0.08 * iVar2.x, cr = PB.x + aJump * 0.22 * max(0.0, -hop), crB = 0.6 * cr;
  float jump = (ex * (0.012 + 0.03 * h2) + aJump * (0.1 + 0.08 * h2)) * max(0.0, hop) * calm;
  // build: thicker / thinner clothes, belly, shoulders
  if (ch > 0.5 && (sl > 0.5 && sl < 2.5 || sl > 4.5 && sl < 5.5 || sl > 7.5 && sl < 8.5)) cwP += normal * iVar2.x * 0.009;
  cwP.z += aP.w * iVar.w * 0.1; cwP.x *= 1.0 + aP.w * iVar.w * 0.2;
  if (ch > 0.5 && ch < 4.5 && abs(ch - 2.0) > 0.5) cwP.x *= bx;
  if (ch > 4.5) {   // legs: thigh forward, shin back, the foot flat on the ground; the relaxed leg bends a little
    float side = ch < 5.5 ? 1.0 : -1.0, a = cr + 0.14 * max(0.0, side * slow) * (1.0 - smoothstep(0.2, 0.6, cr)) * (1.0 - ex), b = 0.6 * a;
    vec3 Hp = vec3(side * 0.09, 0.92, 0.0), K = vec3(side * 0.09, 0.5, 0.0), An = vec3(side * 0.09, 0.08, 0.0);
    float yo = side * (0.05 + 0.12 * h1 + 0.45 * smoothstep(0.3, 1.2, cr)), sp = side * (0.025 + 0.06 * h4);
    cwP = An + cwRx(cwP - An, b * aQ.y); cwP = K + cwRx(cwP - K, -(a + b) * aQ.x); cwP = Hp + cwRz(cwRy(cwRx(cwP - Hp, a), yo), sp);
    cwN = cwRz(cwRy(cwRx(cwRx(cwRx(cwN, b * aQ.y), -(a + b) * aQ.x), a), yo), sp);
  } else if (ch > 2.5) {   // arms: elbow, then twist / raise / spread at the shoulder
    float side = ch < 3.5 ? 1.0 : -1.0, act = step(0.0, -side * wdir); vec4 A = side > 0.0 ? PL : PR;
    vec3 S = vec3(side * 0.2 * bx, 1.4, 0.0), E = vec3(side * 0.2 * bx, 1.12, 0.0);
    A.x += 0.03 * sin(t * 1.3 + ph * 20.0 + side) * (1.0 - ex) + live * (aWave * 0.25 * sin(w + side) + aPump * act * 0.4 * sin(w)) + aFilm * 0.04 * sin(t * 0.9 + ph * 9.0) + aShout * 0.05 * sin(t * 2.3 + ph * 5.0);
    A.y += live * (aWave * 0.3 * sin(w + 1.3 + side) - aPump * act * 0.45 * sin(w));
    A.z += aClap * 0.2 * sin(w * 1.5);
    float fl = rec * 0.8 * (1.0 - ex); A.x = mix(A.x, 1.0, fl); A.y = mix(A.y, 1.3, fl);
    if (accN > 5.5 && accN < 6.5 && abs(pose - ${CW_ID.film2}.0) < 0.5) { vec3 C = vec3(-0.2 * bx, 0.755, 0.036); cwP = C + cwRz(cwP - C, 1.5708) + vec3(0.05, 0.04, 0.0); cwN = cwRz(cwN, 1.5708); }   // filming with both hands: the phone lies across
    float e = A.y * aQ.x, sw = aQ.y;
    cwP = E + cwRx(cwP - E, e); cwN = cwRx(cwN, e);
    cwP = S + cwRz(cwRx(cwRy(cwP - S, -side * A.z * sw), A.x * sw), side * A.w * sw); cwN = cwRz(cwRx(cwRy(cwN, -side * A.z * sw), A.x * sw), side * A.w * sw);
  } else if (ch > 1.5) {   // head: to the action, glances, thrown back in a shout, turned away in a wince
    vec3 N = vec3(0.0, 1.5, -0.01); float yaw = iDyn.y * 0.65 + 0.22 * sin(t * (0.3 + 0.3 * h1) + ph * 50.0) * (1.0 - ex) + wn * wdir * 0.6;
    float pit = 0.05 * sin(t * 0.7 + h2 * 6.0) + 0.2 * ex * calm + aShout * (0.16 + 0.05 * sin(t * 3.1 + ph * 11.0)) - PB.y * 0.75 - wn * 0.3 + aw * 0.1;
    cwP = N + cwRy(cwRx(cwP - N, pit * aQ.x), yaw * aQ.x) * (1.0 + 0.07 * aQ.x); cwN = cwRy(cwRx(cwN, pit * aQ.x), yaw * aQ.x);
  }
  float up = ch < 0.5 ? 0.0 : ch < 1.5 ? aQ.x : ch < 4.5 ? 1.0 : 0.0, body = step(0.5, ch), lift = ch > 4.5 ? smoothstep(0.03, 0.9, position.y) : body;
  if (up > 0.0) {   // everything above the hips: sway, lean, turn after the head
    vec3 H = vec3(0.0, 0.95, 0.0);
    float pit = (PB.y - 0.02 - 0.05 * h2 * (1.0 - ex) + 0.28 * rec + 0.02 * sin(t * (1.1 + h3) + ph * 13.0)) * up, roll = (PB.z - 0.03 * slow + (0.025 + 0.03 * uMood) * sin(t * (0.8 + 0.6 * h1) + ph * 30.0) + 0.05 * ex * sin(t * 5.0 + ph * 9.0)) * up, twist = (iDyn.y * 0.35 + wn * wdir * 0.45) * up;
    cwP = H + cwRy(cwRz(cwRx(cwP - H, pit), roll), twist); cwN = cwRy(cwRz(cwRx(cwN, pit), roll), twist);
  }
  // the pelvis: weight from foot to foot, down in a crouch (the feet stay), a hop when cheering, a step back from a falling body
  cwP += vec3(0.03 * slow * lift, (jump - 0.42 * (2.0 - cos(cr) - cos(crB))) * body, 0.42 * (sin(crB) - sin(cr)) * body - 0.24 * rec * lift);
  #ifdef USE_COLOR
  vec3 skin = cwCol(iCol.z), top = cwCol(iCol.x), hair = cwCol(iCol2.y), cc; float tag = aQ.w, cloth = 0.0;
  if (sl < 0.5) {
    cc = skin;
    if (tag > 0.5 && tag < 1.5) cc = mix(skin, hair * 0.8 + skin * 0.12, max(0.8 * cwBit(iVar.y, 8.0), cwBit(iVar.y, 1.0)));
    else if (tag > 1.5 && tag < 2.5) cc = mix(skin, hair * 0.7 + skin * 0.1, iVar2.y * smoothstep(1.615, 1.57, position.y));
    else if (tag > 2.5 && tag < 3.5) cc = skin * 0.9;
    if (tag < 8.5 && (tag < 2.5 || tag > 3.5) && cwBit(iVar.y, 4.0) > 0.5) { cc = cwCol(iCol.w); cloth = 0.6; }
    if (tag > 1.5 && tag < 4.5 && cwBit(iVar.y, 5.0) > 0.5) { cc = vec3(0.56, 0.53, 0.45) * mix(0.45, 1.0, smoothstep(1.535, 1.63, position.y)) * (0.85 + 0.3 * h1); cloth = 0.0; }   // skull plate: dirty bone, darker at the jaw
  }
  else if (sl < 1.5) { cc = top; cloth = 1.0; }
  else if (sl < 2.5) { cc = cwCol(iCol.y); cloth = 1.0; }
  else if (sl < 3.5) { cc = cwCol(iCol.w); cloth = 0.7; }
  else if (sl < 4.5) cc = color;
  else if (sl < 5.5) { cc = mix(top, skin, tee); cloth = 1.0 - tee; }
  else if (sl < 7.5) cc = vec3(0.01);
  else if (sl < 8.5) { cc = mix(top, cwCol(iCol2.x), cwBit(iVar.y, 13.0)); cloth = 1.0; }
  else if (sl < 9.5) { cc = hair; cloth = 0.5; }
  else if (sl < 10.5) cc = cwCol(iCol2.z);
  else if (sl < 11.5) cc = skin * vec3(0.66, 0.44, 0.42);
  else cc = mix(hair, skin, 0.2) * 0.75;
  vColor = cc * mix(0.6, 1.0, smoothstep(0.0, 1.4, position.y)) * aQ.z; vCl = cloth; vObj = position + ph * 7.0;
  #endif
  if (sl > 6.5 && sl < 7.5) vEm = vec3(16.0) * step(0.995 - 0.03 * ex, fract(sin(floor(t * 12.0) * 12.9898 + ph * 78.233) * 43758.5453));
  else if (sl > 5.5 && sl < 6.5) vEm = vec3(0.35, 0.5, 0.8) * (0.9 + 0.3 * sin(t * 3.0 + ph * 77.0));
  vFade = iDyn.w;
  if (show < 0.5 || iDyn.w < 0.004) cwP = vec3(0.0);
}
#endif
vec3 objectNormal = cwN;
`;
/* fragment (the lit pass only): folds of the cloth as a bump from the rest-pose position, a little mottling, skin less rough */
const CROWD_FOLD = /* glsl */`
#include <normal_fragment_begin>
if (vCl > 0.01) {
  vec3 cq = vObj; float hf = (0.6 * sin(cq.y * 44.0 + 4.0 * sin(cq.x * 17.0 + cq.z * 13.0)) + sin(cq.x * 57.0 - cq.z * 49.0 + 3.0 * sin(cq.y * 21.0))) * 0.0013 * vCl;
  vec3 sgx = dFdx(-vViewPosition), sgy = dFdy(-vViewPosition), r1 = cross(sgy, normal), r2 = cross(normal, sgx); float det = dot(sgx, r1);
  normal = normalize(abs(det) * normal - sign(det) * (dFdx(hf) * r1 + dFdy(hf) * r2));
}
`;
function crowdPatch(sh, main) {
  Object.assign(sh.uniforms, CROWD.u);
  sh.vertexShader = sh.vertexShader.replace('void main() {', CROWD_VP + 'void main() {').replace('#include <beginnormal_vertex>', CROWD_VS).replace('#include <begin_vertex>', 'vec3 transformed = cwP;');
  sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec3 vEm, vObj; varying float vFade, vCl;\nvoid main() {\n  if (vFade < 0.996 && vFade < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;');
  if (main) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vEm;')
    .replace('#include <normal_fragment_begin>', CROWD_FOLD)
    .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= 1.0 + 0.05 * vCl * sin(vObj.y * 31.0 + 3.0 * sin(vObj.x * 23.0 + vObj.z * 19.0));')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.6, roughnessFactor, vCl);');
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
  const { shape = 'circle', w = 6, h = 6, rows = 3, density = 1, look = 'street', step = 0.56, gap = 0.58, rise = [0, 0.2, 0.42], keep = null, max = 120, seed = 11, squat = 0 } = o;   // squat: the share of the front row that sits on its haunches
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
  const sMat = new Float32Array(N * 16), sCol = new Float32Array(N * 8), sVar = new Float32Array(N * 8), m4 = new M4(), col = new THREE.Color();
  const groups = Array.from({ length: NG }, () => ({ c: new V3(), n: 0, rad: 0, sphere: new THREE.Sphere(), vis: true }));
  // a palette colour with a little variation of its own, as packed sRGB bytes
  const tint = (hex, dl = 0.05, ds = 0.1) => { col.set(hex); col.offsetHSL((R() - 0.5) * 0.03, (R() - 0.5) * ds, (R() - 0.5) * dl); return col.getHex(); };
  ppl.forEach((p, i) => {
    const cl = Math.hypot(p.x, p.z) || 1; let fx = -p.nx * 0.5 - p.x / cl * 0.5, fz = -p.nz * 0.5 - p.z / cl * 0.5;   // facing: inward, at the middle of the floor
    p.yaw = Math.atan2(fx, fz) + (R() - 0.5) * 0.5; const sy = 0.92 + R() * 0.15, sx = sy * (0.94 + R() * 0.14), up = rise[Math.min(p.row, rise.length - 1)] || 0;
    p.y = up ? up * (0.85 + R() * 0.3) : 0; p.sy = sy;
    m4.compose(_cwV.set(p.x, p.y, p.z), _cwQ.setFromAxisAngle(_cwUp, p.yaw), _cwSc.set(sx, sy, sx)).toArray(sMat, i * 16);
    let hk = R(), mask = L.head[0][0]; for (const [bits, wgt] of L.head) { if (hk < wgt) { mask = bits; break; } hk -= wgt; }
    const skinI = Math.min(CW_SKIN.length - 1, (R() ** 2.2 * CW_SKIN.length) | 0);
    if ((mask & CW_AFRO) && skinI < 3) mask = mask & ~CW_AFRO | CW_HAIR;
    // the top: T-shirt, hoodie (hood up or lying on the back), open jacket over a T-shirt, or a closed jacket
    const kd = R(), tee = !(mask & CW_HOOD) && kd < L.tee;
    if (!tee && !(mask & CW_HOOD)) { if (kd < L.tee + 0.34) mask |= CW_HOODDN; else if (kd < L.tee + 0.64) mask |= CW_OPEN; }
    const hoodie = mask & (CW_HOOD | CW_HOODDN), u = R(), v = R();
    let pose, alt, mir = 0;
    if (p.row === 0 && !up && R() < squat) pose = alt = 'squat';
    else if (R() < L.phone) { mask |= CW_PHONE; pose = alt = R() < 0.55 ? 'film1' : 'film2'; }
    else {
      pose = u < 0.1 ? 'hang' : u < 0.3 ? (hoodie ? 'pouch' : 'pockets') : u < 0.42 ? 'pockets' : u < 0.54 ? 'crossed' : u < 0.63 ? 'hips' : u < 0.7 ? 'clasp' : u < 0.77 ? 'chin' : u < 0.86 ? 'lean' : u < 0.93 ? 'back' : 'hang';
      alt = v < 0.3 ? pose : v < 0.52 ? 'shout' : v < 0.74 ? 'clap' : v < 0.9 ? 'pump' : v < 0.95 ? 'hips' : 'crossed';
      mir = R() < 0.5 ? 1 : 0;
    }
    if (up) mask |= CW_CRATE;
    const dark = skinI >= 5, hair = R() < 0.08 ? CW_HAIRC[4] : dark ? pick(['#16120f', '#101010', '#0c0a09']) : pick(CW_HAIRC);
    const hat = mask & CW_BALA ? pick(['#0c0c0e', '#17181b', '#101216']) : mask & CW_CAP ? pick(CW_CAPC) : R() < 0.5 ? pick(CW_CAPC) : pick(L.top);
    const build = R() + R() - 1, belly = R() < 0.2 + 0.2 * build ? 0.5 + R() * 0.8 : R() * 0.3;
    sCol.set([tint(pick(L.top)), tint(pick(CW_BOT)), tint(CW_SKIN[skinI], 0.03, 0.06), tint(hat, 0.03), tint(pick(CW_INNER), 0.04), tint(hair, 0.02), tint(pick(CW_SHOE), 0.03), 0], i * 8);
    p.ph = R(); p.mask = mask; p.pose = pose; p.alt = alt; p.mir = mir; p.tee = tee;
    sVar.set([3 + p.ph * 0.999, mask, 0, belly, build, R() < 0.35 ? 0.12 + R() * 0.25 : R() < 0.2 ? 0.7 + R() * 0.25 : R() * 0.08, 0, 0], i * 8);
    p.exc = (0.6 + R() * 0.6) * (mask & CW_PHONE ? 0.35 : 1); p.lag = R() * 0.2; p.f1 = 0.25 + R() * 0.2; p.blob = (up ? 0.62 : pose === 'squat' ? 1.05 : 0.95) * sx;
    p.wq = R(); p.aq = R(); p.ex = 0; p.hy = 0; p.rec = 0; p.wn = 0; p.aw = 0; p.fade = 1; p.seen = false;
    p.g = Math.min(NG - 1, (p.u * NG) | 0); const G = groups[p.g]; G.c.add(_cwV.set(p.x, 1, p.z)); G.n++;
  });
  // an arm round the shoulders of the man who stands right beside (same row, same height)
  const idle = { hang: 1, pockets: 1, pouch: 1, clasp: 1, lean: 1, back: 1 };
  for (const p of ppl) {
    if (!idle[p.pose] || R() > 0.6) continue;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    for (const q of ppl) {
      if (q === p) break;   // only somebody earlier in the list: he is drawn whenever this man is (GFX.crowd shows the first part)
      if (q.row !== p.row || q.pose === 'squat' || q.pose === 'buddy' || Math.abs(q.y - p.y) > 0.06 || Math.abs(q.sy - p.sy) > 0.07) continue;
      const dx = q.x - p.x, dz = q.z - p.z, lat = dx * c - dz * s, fwd = dx * s + dz * c;
      if (Math.abs(fwd) < 0.16 && Math.abs(lat) > 0.42 && Math.abs(lat) < 0.62) { p.pose = p.alt = 'buddy'; p.mir = lat < 0 ? 1 : 0; break; }
    }
  }
  ppl.forEach((p, i) => { sVar[i * 8 + 2] = CW_ID[p.pose] + (p.tee ? 32 : 0); sVar[i * 8 + 6] = CW_ID[p.alt]; sVar[i * 8 + 7] = p.mir; });
  for (const G of groups) if (G.n) G.c.multiplyScalar(1 / G.n);
  for (const p of ppl) { const G = groups[p.g]; G.rad = Math.max(G.rad, Math.hypot(p.x - G.c.x, p.z - G.c.z)); }
  for (const G of groups) G.sphere.set(G.c, G.rad + 1.5);

  const base = CROWD.geo || (CROWD.geo = crowdGeo()), geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color', 'aP', 'aQ']) geo.setAttribute(k, base.attributes[k]);
  geo.setIndex(base.index);
  const ia = (name, sz) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(N * sz), sz); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const aCol = [ia('iCol', 4), ia('iCol2', 4)], aVar = [ia('iVar', 4), ia('iVar2', 4)], aDyn = ia('iDyn', 4), aDyn2 = ia('iDyn2', 2);
  if (!CROWD.mat) {
    CROWD.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.45 }); CROWD.mat.onBeforeCompile = sh => crowdPatch(sh, true);
    const tex = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.62)'); g.addColorStop(0.55, 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    CROWD.blobMat = new THREE.MeshBasicMaterial({ map: tex, color: '#000000', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  const mesh = new THREE.InstancedMesh(geo, CROWD.mat, Math.max(1, N)); mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;   // culled here, by sector
  const blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), CROWD.blobMat, Math.max(1, N)); blob.frustumCulled = false; blob.instanceMatrix.setUsage(THREE.DynamicDrawUsage); blob.count = 0; blob.renderOrder = -1;
  CROWD.blobs.push(blob);
  const g = new THREE.Group(); g.add(mesh, blob);
  const pulses = [], idx = new Int32Array(Math.max(1, N)), hot = [0, 0, 0, 0, 0, 0, 0, 0]; let t = 0, lastN = -1, lastHash = 0;

  return {
    group: g, mesh, people: ppl, count: N, shown: 0, sVar, repack() { lastN = -1; }, force: null,   // debug: sVar = 8 numbers per person (iVar, iVar2), change them, then repack(); force = [excitement, wince, awe] for everybody
    // for a location where the people themselves are the boundary: put this into LOC.wall (a soft wall for the knockout ragdoll, round or rectangular as the crowd)
    wall: Object.assign(shape === 'rect' ? { kind: 'rect', hx: w / 2 + r0 - 0.3, hz: h / 2 + r0 - 0.3 } : { r: r0 - 0.3 }, { k: 1.8e4, mu: 0.7, h: 1.5, d: 0.6, give: 0.3, damp: 18, top() { return this.h; } }),
    /* a wave through the crowd: power 0..1, from a world point (people nearer react sooner and harder), held `hold` seconds at the top.
       kind 0: cheering; 1: a knockdown / knockout (some put their hands on their heads instead); 2: a brutal hit (some wince and turn away) */
    cheer(power, pos, hold = 0.3, kind = 0) {
      let x = 0, z = 0; if (pos) { g.updateWorldMatrix(true, false); _cwV.copy(pos).applyMatrix4(_cwI.copy(g.matrixWorld).invert()); x = _cwV.x; z = _cwV.z; }
      pulses.push({ t, p: power, x, z, hold, kind }); if (pulses.length > 8) pulses.shift();
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
      const nAct = Math.min(N, Math.round(N * clamp(GFX.crowd, 0, 1) * CROWD.fill)), kE = 1 - Math.exp(-dt * 9), kF = 1 - Math.exp(-dt * 7), kY = 1 - Math.exp(-dt * 3), kUp = 1 - Math.exp(-dt * 10), kDn = 1 - Math.exp(-dt * 1.3), kW = 1 - Math.exp(-dt * 14);
      const D = aDyn.array, D2 = aDyn2.array, B = blob.instanceMatrix.array; let n = 0, hash = 0;
      for (let i = 0; i < nAct; i++) {
        const p = ppl[i]; if (!groups[p.g].vis) { p.seen = false; continue; }
        const px = e[0] * p.x + e[8] * p.z + e[12] - cam.x, pz = e[2] * p.x + e[10] * p.z + e[14] - cam.z, s = px * ux + pz * uz;
        const ft = s > -0.6 && s < len - 0.6 ? clamp((Math.abs(px * uz - pz * ux) - 0.7 - Math.max(s, 0) * tH) / 0.4, 0, 1) : 1;
        // anyone within reach of the lens is gone at once: a half-dissolved body right in front of the camera dithers the whole screen
        const near = s > -1.2 && s < 1.6 && Math.abs(px * uz - pz * ux) < 1.3;
        p.fade = near ? 0 : p.seen ? p.fade + (ft - p.fade) * kF : ft; p.seen = true;
        let ex = 0, wn = 0, aw = 0;
        for (const c of pulses) { const dist = Math.hypot(p.x - c.x, p.z - c.z), tau = t - c.t - dist / 6 - p.lag; if (tau <= 0) continue;
          const env = c.p * (0.5 + 0.5 * Math.exp(-dist / 3.5)) * (tau < 0.18 ? tau / 0.18 : tau < 0.18 + c.hold ? 1 : Math.exp(-(tau - 0.18 - c.hold) / 0.8));
          if (c.kind === 2) { if (p.wq < 0.5) wn = Math.max(wn, env * 1.4); }
          else if (c.kind === 1 && p.aq < 0.3) aw = Math.max(aw, env * 1.2);
          else ex = Math.max(ex, env * p.exc); }
        const sp = Math.sin(t * p.f1 + p.ph * 40) * Math.sin(t * 0.23 + p.ph * 17) - (1.12 - CROWD.mood * 0.5); if (sp > 0) ex = Math.max(ex, Math.min(1, sp * 6) * 0.8);   // now and then somebody shouts on his own
        if (this.force) { ex = this.force[0]; wn = this.force[1]; aw = this.force[2]; }
        p.ex += (Math.min(1, ex) - p.ex) * kE; p.wn += (Math.min(1, wn) - p.wn) * (wn > p.wn ? kW : kE * 0.4); p.aw += (Math.min(1, aw) - p.aw) * kE * 0.6;
        let yw = Math.atan2(ax - p.x, az - p.z) - p.yaw; yw -= Math.round(yw / (2 * PI)) * 2 * PI; p.hy += (clamp(yw, -1.2, 1.2) - p.hy) * kY;
        let rc = 0; for (let k = 0; k < nh; k += 2) rc = Math.max(rc, clamp((1.15 - Math.hypot(p.x - hot[k], p.z - hot[k + 1])) / 0.45, 0, 1));
        p.rec += (rc - p.rec) * (rc > p.rec ? kUp : kDn);
        if (p.fade < 0.004) continue;
        const j = n * 4, b = n * 16, bs = p.blob * p.fade; D[j] = p.ex; D[j + 1] = p.hy; D[j + 2] = p.rec; D[j + 3] = p.fade; D2[n * 2] = p.wn; D2[n * 2 + 1] = p.aw;
        B[b] = bs; B[b + 1] = B[b + 2] = B[b + 3] = B[b + 4] = 0; B[b + 5] = 1; B[b + 6] = B[b + 7] = B[b + 8] = B[b + 9] = 0; B[b + 10] = bs; B[b + 11] = 0; B[b + 12] = p.x; B[b + 13] = p.y + 0.004; B[b + 14] = p.z; B[b + 15] = 1;
        idx[n++] = i; hash = (hash * 31 + i + 1) | 0;
      }
      if (n !== lastN || hash !== lastHash) {   // the set of drawn people changed: repack what never changes per person
        lastN = n; lastHash = hash; const IM = mesh.instanceMatrix.array;
        for (let k = 0; k < n; k++) { const i = idx[k]; for (let q = 0; q < 16; q++) IM[k * 16 + q] = sMat[i * 16 + q]; for (let c = 0; c < 2; c++) for (let q = 0; q < 4; q++) { aVar[c].array[k * 4 + q] = sVar[i * 8 + c * 4 + q]; aCol[c].array[k * 4 + q] = sCol[i * 8 + c * 4 + q]; } }
        mesh.instanceMatrix.needsUpdate = true; for (const a of aVar) a.needsUpdate = true; for (const a of aCol) a.needsUpdate = true;
      }
      aDyn.needsUpdate = true; aDyn2.needsUpdate = true; blob.instanceMatrix.needsUpdate = true;
      mesh.count = blob.count = n; mesh.visible = blob.visible = n > 0; this.shown = n;
    },
  };
}

/* per frame (frame(), after the camera): the mood of the crowd from the state of the fight — a lull between rounds — its animation
   and the level of its murmur */
function crowdTick(dt) {
  const c = LOC.crowd && LOC.group && LOC.group.visible ? LOC.crowd : null, s = G.state;
  const tgt = !c ? 0 : s === 'fight' ? 0.42 : s === 'kd' ? 0.7 : s === 'ko' ? 0.85 : s === 'break' ? 0.06 : s === 'replay' ? 0.45 : s === 'rend' ? 0.55 : s === 'intro' || s === 'result' ? 0.3 : 0.14;
  CROWD.heat = Math.max(0, CROWD.heat - dt * 0.25);
  CROWD.mood += (Math.min(1, tgt + CROWD.heat) - CROWD.mood) * (1 - Math.exp(-dt * 1.4));
  CROWD.u.uT.value += dt; CROWD.u.uMood.value = CROWD.mood;
  if (c) c.update(dt);
  sfx.crowd(c && s !== 'menu' ? (0.25 + 0.75 * CROWD.mood) * (0.55 + 0.45 * CROWD.fill) : 0);
}
/* reactions: a clean hard shot (a brutal one makes some people wince), a knockdown, a knockout → a wave through the crowd from the
   place it happened, and a roar as loud */
EVT.on((type, e) => {
  const c = LOC.crowd; if (!c) return; const p = e.power || 0;
  if (type === 'hit') { if (e.blocked) return; CROWD.heat = Math.min(0.4, CROWD.heat + 0.04 + 0.08 * p); if (p > 0.6) { const k = clamp((p - 0.45) * 1.1, 0.2, 0.8); c.cheer(k, e.pos, 0.1); sfx.roar(k * 0.6); } if (p > 0.78) c.cheer(clamp(p, 0, 1), e.pos, 0.3, 2); }
  else if (type === 'kd') { c.cheer(0.9, e.pos, 1.4, 1); sfx.roar(0.8); CROWD.heat = 0.4; }
  else if (type === 'ko') { c.cheer(1, e.pos, 4, 1); sfx.roar(1); CROWD.heat = 0.5; }
  else if (type === 'up') { c.cheer(0.5, e.pos, 0.4); sfx.roar(0.35); }
  else if (type === 'round') { c.cheer(0.4, null, 0.5); sfx.roar(0.3); }
});
