/* ───────── location: the boxing gym («Спортзал») — where the sparring and the heavy bag drill take place ─────────
   An old-school gym in a brick hall: the ring (RINGSET, its ropes and their physics as in LOCS.gym) on a 0.4 m platform, heavy bags
   on a beam along the back wall (they sway a little), speed bag platforms, a double-end bag, mirrors, a dumbbell rack, kettlebells,
   skipping ropes on hooks, benches, lockers, a round timer that follows the round, posters, a chalkboard, rubber mats; warm dish
   lamps under the trusses and daylight from the high windows of the back wall (shafts, dust). One man works a bag, one sits on a bench.
   Layout: everything is built in FLOOR coordinates (y = 0 is the gym floor, the ring centre is x = z = 0, the canvas is at y = FL).
   Walls at x = X0 / X1, z = Z0 (back, the windows) / Z1; nothing taller than the platform stands within 7 m of the ring centre.
   Two spots: sparring is in the ring (group at y = −FL); the heavy bag drill is on the mat beside the ring (SX, SZ) — there the
   group and RINGSET are slid so that this point of the floor is the ARENA origin (`place`), the bag hangs from a beam on drop rods
   that follows its hook (`bagRig`), and the boundary is a small square (`bound` is a getter).
   Mirrors (left wall): no second render — behind the openings stands a mirrored copy of the static set (`mir`, scale.x = −1) drawn
   with unlit dimmed materials; the fighters are not in it. Off on the lowest graphics level and while the camera is outside the hall.
   Cost: static geometry is merged by material, repeats are InstancedMesh (bags, dumbbells, kettlebells), no shadow casters,
   one spot + four point lights without shadows. */
const BG = { FL: 0.4, X0: -9, X1: 11, Z0: -8.5, Z1: 8, H: 5.2, SX: 6.4, SZ: 0.5, HOOK: 2.72, MAT: 0.03 };
const _bgI = new M4(), _bgM = new M4(), _bgQ = new Quat(), _bgE = new THREE.Euler(), _bgS = new V3(), _bgC = new V3(), _bgZero = new M4().makeScale(0, 0, 0);
LOCS.boxgym = {
  id: 'boxgym', label: 'Спортзал', desc: 'Старый боксёрский зал: ринг, мешки, зеркала', train: true, ring: true, wall: null,   // train: not offered for fights (buildQuick)
  ringBound: { kind: 'square', half: 2.2 }, bagBound: { kind: 'square', half: 1.5 },
  get bound() { return BAG.on ? this.bagBound : this.ringBound; },
  light: { bg: '#120f0c', fog: ['#33291f', 7, 46], exposure: 0.94, hemi: ['#c3cfe2', '#3b2f24', 0.28], key: ['#ffe8cc', 48], rim: ['#c4d8ff', 2.5], rim2: ['#ffc48c', 1.7], fill: ['#fff3e2', 0.5] },
  build() {
    const R = locRng(4107), g = new THREE.Group(), PI = Math.PI, { FL, X0, X1, Z0, Z1, H, SX, SZ } = BG;
    const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const speck = (c, w, h, n, a) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${R() < 0.55 ? '0,0,0' : '255,255,255'},${R() * a})`; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } };
    const font = px => `900 ${px}px "Big Shoulders Display", Impact, "Arial Black", sans-serif`;
    const noAO = o => { CROWD.blobs.push(o); return o; };   // see-through things stay out of the AO normal pass
    const limb = (a, b, r0, r1 = r0, seg = 8) => { const d = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(), c = new THREE.CylinderGeometry(r1, r0, L, seg); c.applyQuaternion(new Quat().setFromUnitVectors(new V3(0, 1, 0), d.normalize())); return c.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); };
    const ball = (x, y, z, rx, ry = rx, rz = rx, seg = 10) => new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2)).scale(rx, ry, rz).translate(x, y, z);
    const onWall = (geo, wall, s, y, off = 0.012) => wall === 'B' ? geo.translate(s, y, Z0 + off) : wall === 'F' ? geo.rotateY(PI).translate(s, y, Z1 - off) : wall === 'R' ? geo.rotateY(-PI / 2).translate(X1 - off, y, s) : geo.rotateY(PI / 2).translate(X0 + off, y, s);
    const uvRect = (geo, u0, v0, u1, v1) => { const u = geo.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u0 + (u1 - u0) * u.getX(i), v0 + (v1 - v0) * u.getY(i)); return geo; };
    const decalMat = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, envMapIntensity: 0.3 }, o));
    const fitText = (c, txt, x, y, px, maxW, fnt = font) => { c.font = fnt(px); const w = c.measureText(txt).width; if (w > maxW) c.font = fnt(px * maxW / w); c.fillText(txt, x, y); };

    /* the mirrored copy for the wall mirrors: every static thing put with `put` gets a twin in `mir` that shares its geometry and
       is drawn with an unlit, dimmed material (emissive things keep theirs) */
    const mir = this.mir = new THREE.Group(); mir.scale.x = -1; mir.position.x = 2 * X0; g.add(mir);
    const dimOf = new Map(), MIRK = new THREE.Color(0.56, 0.58, 0.61);
    const dim = m => { if (!m.isMeshStandardMaterial) return m; let d = dimOf.get(m);
      if (!d) { d = new THREE.MeshBasicMaterial({ map: m.map, vertexColors: m.vertexColors, color: m.color.clone().multiply(MIRK), transparent: m.transparent, opacity: m.opacity, alphaMap: m.alphaMap, depthWrite: m.depthWrite, side: m.side, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits }); dimOf.set(m, d); }
      return d; };
    const put = (o, refl = true, parent = g) => { parent.add(o);
      if (refl) { const inst = o.isInstancedMesh, t = inst ? new THREE.InstancedMesh(o.geometry, dim(o.material), o.count) : new THREE.Mesh(o.geometry, dim(o.material));
        if (inst) { t.instanceMatrix = o.instanceMatrix; t.instanceColor = o.instanceColor; }
        t.frustumCulled = false; t.matrixAutoUpdate = false; t.renderOrder = o.renderOrder; mir.add(t); }
      return o; };

    /* ── floor: rubber mats, 1 m tiles with coloured flecks, worn grey where people stand, scuffs; one 4 × 4 m texture ── */
    const floorTex = rep(canvasTex(1024, 1024, (c, w, h) => {
      const n = 4, s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = i * s, y = j * s, l = 30 + R() * 12; c.fillStyle = `rgb(${l | 0},${(l + 1) | 0},${(l + 3) | 0})`; c.fillRect(x, y, s, s);
        for (let k = 0; k < 5; k++) { const gx = x + s * (0.2 + R() * 0.6), gy = y + s * (0.2 + R() * 0.6), r = s * (0.2 + R() * 0.35), gr = c.createRadialGradient(gx, gy, 0, gx, gy, r); gr.addColorStop(0, `rgba(128,122,112,${0.05 + R() * 0.12})`); gr.addColorStop(1, 'rgba(128,122,112,0)'); c.fillStyle = gr; c.fillRect(x, y, s, s); } }
      for (let i = 0; i < 30000; i++) { const k = R(); c.fillStyle = k < 0.5 ? `rgba(150,160,175,${0.2 + R() * 0.45})` : k < 0.72 ? `rgba(70,110,170,${0.3 + R() * 0.5})` : `rgba(0,0,0,${0.2 + R() * 0.4})`; c.fillRect(R() * w, R() * h, 1 + R() * 1.5, 1 + R() * 1.5); }
      c.lineCap = 'round';
      for (let i = 0; i < 80; i++) { c.strokeStyle = `rgba(${R() < 0.6 ? '196,190,178' : '6,6,6'},${0.04 + R() * 0.1})`; c.lineWidth = 1 + R() * 4; const x = R() * w, y = R() * h, a = R() * 7, l = 20 + R() * 90; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (R() - 0.5) * 30, y + Math.sin(a) * l * 0.5 + (R() - 0.5) * 30, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
      for (let i = 0; i < 14; i++) { const x = R() * w, y = R() * h, r = 20 + R() * 60, gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(215,212,204,${0.05 + R() * 0.08})`); gr.addColorStop(1, 'rgba(215,212,204,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r); }   // chalk dust
      for (let i = 0; i <= n; i++) { c.fillStyle = 'rgba(3,3,4,.9)'; c.fillRect(i * s - 1.5, 0, 3, h); c.fillRect(0, i * s - 1.5, w, 3); c.fillStyle = 'rgba(130,130,136,.13)'; c.fillRect(i * s + 2, 0, 1.5, h); c.fillRect(0, i * s + 2, w, 1.5); }
    }));
    const floor = staticMesh(geoUvXZ(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(-PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2), 0.25), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, envMapIntensity: 0.4 }));
    floor.receiveShadow = true; put(floor);
    /* zone mats laid over it (30 mm vinyl, 2 × 1 m panels): navy under the bags, faded red where the bag drill is, grey by the weights */
    const vinylTex = rep(canvasTex(512, 512, (c, w, h) => {   // 2 × 2 m
      c.fillStyle = '#d9d6cf'; c.fillRect(0, 0, w, h); speck(c, w, h, 9000, 0.08);
      for (let i = 0; i < 46; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,252,240' : '30,28,26'},${0.03 + R() * 0.08})`; c.beginPath(); c.ellipse(R() * w, R() * h, 20 + R() * 90, 10 + R() * 50, R() * 3, 0, 7); c.fill(); }
      c.lineCap = 'round'; for (let i = 0; i < 60; i++) { c.strokeStyle = `rgba(${R() < 0.5 ? '250,248,240' : '20,18,16'},${0.05 + R() * 0.14})`; c.lineWidth = 1 + R() * 3; const x = R() * w, y = R() * h, a = R() * 7, l = 10 + R() * 70; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, 0, w, 3); c.fillRect(0, h / 2, w, 3); c.fillRect(0, 0, 3, h);
    }));
    const mats = [[-8.7, -8.35, -0.3, -6.0, '#22324f'], [SX - 2.3, SZ - 2.3, SX + 2.3, SZ + 2.3, '#3d1715'], [-8.85, -5.9, -7.0, 2.4, '#34363a'], [8.0, -7.0, 10.8, -3.0, '#22324f']];
    const matM = staticMesh(geoMerge(mats.map(([x0, z0, x1, z1, col]) => geoTint(geoUvXZ(geoBox(x1 - x0, 0.03, z1 - z0, (x0 + x1) / 2, 0.015, (z0 + z1) / 2), 0.5), col))), new THREE.MeshStandardMaterial({ map: vinylTex, vertexColors: true, roughness: 0.85, envMapIntensity: 0.15 }));
    matM.receiveShadow = true; put(matM);

    /* ── walls (single-sided, so a camera that backs through one still sees the hall): bare brick over a painted block dado ── */
    const wallTex = rep(canvasTex(1024, 1024, (c, w, h) => {   // H × H metres
      const m = h / H, yd = h - 1.45 * m, rows = 52, bh = yd / rows, cols = 21, bw = w / cols;
      c.fillStyle = '#5b5248'; c.fillRect(0, 0, w, h);
      for (let r = 0; r < rows; r++) for (let k = -1; k < cols; k++) { const u = R(); c.fillStyle = u < 0.07 ? `hsl(${14 + R() * 10},${12 + R() * 12}%,${13 + R() * 8}%)` : u < 0.14 ? `hsl(${20 + R() * 10},${30 + R() * 16}%,${40 + R() * 10}%)` : `hsl(${8 + R() * 12},${36 + R() * 20}%,${23 + R() * 12}%)`;
        c.fillRect((k + (r % 2) * 0.5) * bw + 1, r * bh + 1, bw - 2, bh - 2); }
      for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(226,220,206,${0.03 + R() * 0.07})`; c.beginPath(); c.ellipse(R() * w, R() * yd, 20 + R() * 110, 10 + R() * 50, R() * 3, 0, 7); c.fill(); }   // efflorescence
      for (let i = 0; i < 30; i++) { const x = R() * w, y = R() * yd * 0.4, l = 80 + R() * 420, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, `rgba(16,13,10,${0.1 + R() * 0.2})`); gr.addColorStop(1, 'rgba(16,13,10,0)'); c.fillStyle = gr; c.fillRect(x, y, 5 + R() * 26, l); }
      // the dado: concrete blocks under thick green gloss paint, chipped; a cream line on top
      c.fillStyle = '#254a3f'; c.fillRect(0, yd, w, h - yd);
      for (let r = 0; r < 8; r++) { c.fillStyle = 'rgba(8,20,16,.5)'; c.fillRect(0, yd + r * (h - yd) / 7, w, 2); for (let k = 0; k < 13; k++) c.fillRect((k + (r % 2) * 0.5) * w / 13, yd + r * (h - yd) / 7, 2, (h - yd) / 7); }
      for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '120,170,150' : '8,22,18'},${0.03 + R() * 0.07})`; c.beginPath(); c.ellipse(R() * w, yd + R() * (h - yd), 20 + R() * 80, 8 + R() * 30, 0, 0, 7); c.fill(); }
      for (let i = 0; i < 46; i++) { c.fillStyle = `rgba(${R() < 0.6 ? '120,122,112' : '150,146,130'},${0.3 + R() * 0.35})`; const x = R() * w, y = yd + 20 + Math.pow(R(), 0.6) * (h - yd - 20); c.beginPath(); c.ellipse(x, y, 2 + R() * 6, 1 + R() * 3, R() * 3, 0, 7); c.fill(); }
      c.fillStyle = '#d2c7a6'; c.fillRect(0, yd - 6, w, 12); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, yd + 6, w, 3);
      speck(c, w, h, 26000, 0.1);
      const gr = c.createLinearGradient(0, h - 110, 0, h); gr.addColorStop(0, 'rgba(10,9,8,0)'); gr.addColorStop(1, 'rgba(10,9,8,.6)'); c.fillStyle = gr; c.fillRect(0, h - 110, w, 110);
      const g2 = c.createLinearGradient(0, 0, 0, 260); g2.addColorStop(0, 'rgba(10,8,6,.5)'); g2.addColorStop(1, 'rgba(10,8,6,0)'); c.fillStyle = g2; c.fillRect(0, 0, w, 260);
    }));
    const wq = (ax, az, bx, bz, y0, y1, u0 = 0) => { const q = new THREE.BufferGeometry(), len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len, u1 = u0 + len / H;
      q.setAttribute('position', new THREE.Float32BufferAttribute([ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az], 3));
      q.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
      q.setAttribute('uv', new THREE.Float32BufferAttribute([u0, y0 / H, u1, y0 / H, u1, y1 / H, u0, y0 / H, u1, y1 / H, u0, y1 / H], 2)); return q; };
    const MZ0 = -5.4, MZ1 = 2.0, MY0 = 0.42, MY1 = 2.5;   // the mirror opening in the left wall
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: '#b9b1a8', roughness: 0.9, envMapIntensity: 0.3 });
    put(staticMesh(geoMerge([wq(X0, Z0, X1, Z0, 0, H), wq(X1, Z0, X1, Z1, 0, H, 0.3), wq(X1, Z1, X0, Z1, 0, H, 0.6)]), wallMat));
    put(staticMesh(geoMerge([wq(X0, Z1, X0, MZ1, 0, H), wq(X0, MZ1, X0, MZ0, 0, MY0, (Z1 - MZ1) / H), wq(X0, MZ1, X0, MZ0, MY1, H, (Z1 - MZ1) / H), wq(X0, MZ0, X0, Z0, 0, H, (Z1 - MZ0) / H)]), wallMat), false);

    /* ── static steel and timber of the hall (two merged meshes): roof trusses, purlins, pipes, the bag beam and its brackets,
       window frames, lockers, the door ── */
    const steel = [], matt = [];
    const steelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.55, envMapIntensity: 0.6 });
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05, envMapIntensity: 0.4 });
    const TRX = [-7, -3, 1, 5, 9], WINX = [-5, -1, 3, 7], WY = 3.98, WW = 2.7, WH = 1.3;
    for (const x of TRX) { const col = '#2b2f2d', n = 10, dz = (Z1 - Z0) / n;
      steel.push(geoTint(geoBox(0.12, 0.12, Z1 - Z0, x, 4.42, (Z0 + Z1) / 2), col), geoTint(geoBox(0.12, 0.12, Z1 - Z0, x, 5.08, (Z0 + Z1) / 2), col));
      for (let k = 0; k <= n; k++) { const z = Z0 + k * dz; steel.push(geoTint(limb([x, 4.42, z], [x, 5.08, z], 0.03, 0.03, 4), col)); if (k < n) steel.push(geoTint(limb([x, k % 2 ? 5.08 : 4.42, z], [x, k % 2 ? 4.42 : 5.08, z + dz], 0.026, 0.026, 4), col)); } }
    for (let k = 0; k < 7; k++) steel.push(geoTint(geoBox(X1 - X0, 0.08, 0.06, (X0 + X1) / 2, 5.16, Z0 + 0.5 + k * (Z1 - Z0 - 1) / 6), '#242624'));
    steel.push(geoTint(limb([X0, 3.2, Z0 + 0.09], [X1, 3.2, Z0 + 0.09], 0.035, 0.035, 8), '#7a2f24'), geoTint(limb([X1 - 0.09, 3.05, Z0], [X1 - 0.09, 3.05, Z1], 0.03, 0.03, 8), '#6f7377'));   // pipes along the walls
    steel.push(geoTint(limb([-8.6, 0, Z0 + 0.1], [-8.6, 3.2, Z0 + 0.1], 0.035, 0.035, 8), '#7a2f24'));
    // the heavy-bag beam: a channel 1.3 m off the back wall on brackets with braces
    const BEAM_Y = 3.05, BEAM_Z = Z0 + 1.3, BAGX = [-7.3, -5.45, -3.6, -1.75];
    steel.push(geoTint(geoBox(7.6, 0.14, 0.1, -4.5, BEAM_Y + 0.07, BEAM_Z), '#32363a'));
    for (const x of [-8.25, -6.4, -4.5, -2.65, -0.75]) steel.push(geoTint(geoBox(0.06, 0.08, 1.3, x, BEAM_Y + 0.18, Z0 + 0.65), '#32363a'), geoTint(limb([x, BEAM_Y - 0.75, Z0 + 0.03], [x, BEAM_Y + 0.14, BEAM_Z - 0.1], 0.022, 0.022, 4), '#32363a'), geoTint(geoBox(0.14, 1.05, 0.02, x, BEAM_Y - 0.28, Z0 + 0.02), '#2a2d30'));
    // windows of the back wall: steel frames, sills
    for (const x of WINX) { matt.push(geoTint(geoBox(WW + 0.3, 0.07, 0.22, x, WY - WH / 2 - 0.04, Z0 + 0.1), '#8d8779'));
      steel.push(geoTint(geoBox(WW + 0.12, 0.06, 0.07, x, WY + WH / 2 + 0.03, Z0 + 0.035), '#1c1e1f')); for (const s of [-1, 1]) steel.push(geoTint(geoBox(0.06, WH, 0.07, x + s * (WW / 2 + 0.03), WY, Z0 + 0.035), '#1c1e1f')); }
    // lockers on the front wall, a double door with an exit sign, a radiator
    for (let k = 0; k < 9; k++) { const x = -8.3 + k * 0.4, col = ['#4e5c58', '#566660', '#48554f'][k % 3];
      steel.push(geoTint(geoBox(0.385, 1.85, 0.45, x, 0.925 + 0.08, Z1 - 0.24), col), geoTint(geoBox(0.2, 0.012, 0.012, x, 1.72, Z1 - 0.47), '#1a1f1d'), geoTint(geoBox(0.2, 0.012, 0.012, x, 1.68, Z1 - 0.47), '#1a1f1d'), geoTint(geoBox(0.2, 0.012, 0.012, x, 1.64, Z1 - 0.47), '#1a1f1d'), geoTint(geoBox(0.03, 0.09, 0.03, x + 0.13, 1.05, Z1 - 0.475), '#c2c5c6')); }
    matt.push(geoTint(geoBox(1.9, 2.15, 0.08, 2.9, 1.075, Z1 - 0.04), '#3a2c22'), geoTint(geoBox(2.1, 2.25, 0.05, 2.9, 1.125, Z1 - 0.02), '#241b15'), geoTint(geoBox(0.02, 2.1, 0.09, 2.9, 1.05, Z1 - 0.045), '#120e0b'));
    for (const s of [-1, 1]) { steel.push(geoTint(geoBox(0.04, 0.3, 0.05, 2.9 + s * 0.12, 1.05, Z1 - 0.1), '#b9b4a6')); matt.push(geoTint(geoBox(0.5, 0.7, 0.02, 2.9 + s * 0.48, 1.55, Z1 - 0.085), '#161b20')); }
    for (let k = 0; k < 12; k++) steel.push(geoTint(geoBox(0.06, 0.55, 0.1, 5.2 + k * 0.085, 0.45, Z1 - 0.1), '#b8b2a2'));

    /* ── the ring platform: canvas-covered top around the fighting floor, a vinyl skirt with lettering, two sets of steps; and
       a plain copy of the ring itself for the mirrors (the real one is RINGSET) ── */
    const plat = this.plat = new THREE.Group(); g.add(plat);
    { const PO = 3.1, PI_ = 2.79, sh = new THREE.Shape(); sh.moveTo(-PO, -PO); sh.lineTo(PO, -PO); sh.lineTo(PO, PO); sh.lineTo(-PO, PO); sh.lineTo(-PO, -PO);
      const ho = new THREE.Path(); ho.moveTo(-PI_, -PI_); ho.lineTo(-PI_, PI_); ho.lineTo(PI_, PI_); ho.lineTo(PI_, -PI_); ho.lineTo(-PI_, -PI_); sh.holes.push(ho);
      const top = staticMesh(geoTint(new THREE.ShapeGeometry(sh).rotateX(-PI / 2).translate(0, FL - 0.001, 0), '#232b3b'), propMat); top.receiveShadow = true; put(top, false, plat);
      const skirtTex = canvasTex(2048, 128, (c, w, h) => {
        c.fillStyle = '#18233c'; c.fillRect(0, 0, w, h); c.fillStyle = '#8f1824'; c.fillRect(0, 0, w, 16); c.fillStyle = '#e9e2d2'; c.fillRect(0, 16, w, 4);
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#e9e2d2'; c.font = font(84); c.fillText('IRON JAW', w * 0.25, 76); c.fillText('IRON JAW', w * 0.75, 76);
        c.fillStyle = '#c9a03a'; c.font = font(46); c.fillText('★  БОКСЁРСКИЙ КЛУБ  ★', w * 0.5, 78); c.font = font(40); c.fillText('16OZ', w * 0.04, 78); c.fillText('16OZ', w * 0.96, 78);
        speck(c, w, h, 5000, 0.12); for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(200,196,186,${0.04 + R() * 0.1})`; c.fillRect(R() * w, h - R() * 40, 4 + R() * 40, 1 + R() * 3); }
        const gr = c.createLinearGradient(0, h - 30, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.5)'); c.fillStyle = gr; c.fillRect(0, h - 30, w, 30);
      });
      const sk = []; for (let s = 0; s < 4; s++) sk.push(new THREE.PlaneGeometry(2 * PO, FL).translate(0, FL / 2, PO).rotateY(s * PI / 2));
      put(staticMesh(geoMerge(sk), new THREE.MeshStandardMaterial({ map: skirtTex, roughness: 0.55, envMapIntensity: 0.5 })), false, plat);
      const st = []; for (const [x, z] of [[PO + 0.18, 2.0], [-PO - 0.18, -2.0]]) st.push(geoTint(geoBox(0.36, FL / 2, 0.9, x, FL / 4, z), '#5d472f'), geoTint(geoBox(0.38, 0.02, 0.92, x, FL / 2, z), '#17181a'));
      put(staticMesh(geoMerge(st), propMat), false, plat);
      // the ring as the mirrors show it
      const rc = [geoTint(new THREE.PlaneGeometry(2 * PO, 2 * PO).rotateX(-PI / 2).translate(0, FL, 0), '#273042')], RH = 2.65;
      for (const [x, z] of [[-RH, -RH], [RH, -RH], [RH, RH], [-RH, RH]]) rc.push(geoTint(new THREE.CylinderGeometry(0.09, 0.09, 0.95, 8).translate(x, FL + 0.92, z), '#8f1824'), geoTint(new THREE.CylinderGeometry(0.05, 0.05, 1.45, 6).translate(x, FL + 0.72, z), '#1a1c22'));
      for (let s = 0; s < 4; s++) for (let r = 0; r < 3; r++) rc.push(geoTint(new THREE.CylinderGeometry(0.02, 0.02, 2 * RH, 5).rotateZ(PI / 2).translate(0, FL + 0.55 + r * 0.38, RH).rotateY(s * PI / 2), r === 1 ? '#ece6da' : '#a51b29'));
      for (let s = 0; s < 4; s++) rc.push(geoTint(new THREE.PlaneGeometry(2 * PO, FL).translate(0, FL / 2, PO).rotateY(s * PI / 2), '#18233c'));
      const rm = new THREE.Mesh(geoMerge(rc), new THREE.MeshBasicMaterial({ vertexColors: true, color: MIRK })); rm.matrixAutoUpdate = false; rm.frustumCulled = false; mir.add(rm);
    }

    /* ── windows (emissive panes), their glow; the ceiling ── */
    const winTex = canvasTex(512, 256, (c, w, h) => {
      c.fillStyle = '#14171a'; c.fillRect(0, 0, w, h); const nx = 8, ny = 3, pw = w / nx, ph = h / ny;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const x = i * pw + 3, y = j * ph + 3, a = pw - 6, b = ph - 6, u = R();
        if (u < 0.07) { c.fillStyle = `hsl(32,${14 + R() * 10}%,${22 + R() * 10}%)`; c.fillRect(x, y, a, b); continue; }   // a pane replaced by plywood
        const l = u < 0.25 ? 52 + R() * 14 : 78 + R() * 16, gr = c.createLinearGradient(0, y, 0, y + b); gr.addColorStop(0, `hsl(${205 + R() * 14},${30 + R() * 20}%,${l}%)`); gr.addColorStop(1, `hsl(40,${24 + R() * 16}%,${l * 0.92}%)`); c.fillStyle = gr; c.fillRect(x, y, a, b);
        for (let k = 0; k < 3; k++) { c.fillStyle = `rgba(60,54,44,${0.05 + R() * 0.12})`; c.beginPath(); c.ellipse(x + R() * a, y + b * (0.5 + R() * 0.5), a * (0.2 + R() * 0.4), b * (0.1 + R() * 0.25), 0, 0, 7); c.fill(); } }
      speck(c, w, h, 3000, 0.16);
    });
    put(staticMesh(geoMerge(WINX.map(x => new THREE.PlaneGeometry(WW, WH).translate(x, WY, Z0 + 0.03))), new THREE.MeshBasicMaterial({ map: winTex, color: new THREE.Color(1.7, 1.68, 1.6), fog: false })));
    const softTex = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    const glow = noAO(staticMesh(geoMerge(WINX.map(x => new THREE.PlaneGeometry(WW * 1.9, WH * 2.8).translate(x, WY, Z0 + 0.08))), new THREE.MeshBasicMaterial({ map: softTex, color: '#cfdcf2', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))); glow.renderOrder = 2; g.add(glow);
    const deckTex = rep(canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#211f1c'; c.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { c.fillStyle = '#12110f'; c.fillRect(i * 16, 0, 5, h); c.fillStyle = '#2c2925'; c.fillRect(i * 16 + 8, 0, 3, h); } }));
    put(staticMesh(geoUvXZ(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(PI / 2).translate((X0 + X1) / 2, H, (Z0 + Z1) / 2), 1.2), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 1, envMapIntensity: 0.1 })));

    /* ── wall art: posters (one atlas of eight, invented fighters and shows), the club's name painted on the brick, a banner,
       the chalkboard with today's work ── */
    const sil = (c, x, y, s, flip, col) => { c.save(); c.translate(x, y); c.scale(flip ? -s : s, s); c.strokeStyle = c.fillStyle = col; c.lineCap = c.lineJoin = 'round';
      const ln = (pts, lw) => { c.lineWidth = lw; c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke(); };
      ln([[0, -112], [-12, -6]], 62); ln([[-22, 0], [-50, 62], [-44, 128]], 30); ln([[0, 0], [30, 60], [44, 128]], 30); ln([[6, -112], [52, -84], [98, -116]], 22); ln([[-18, -108], [16, -62], [40, -118]], 22);
      for (const [gx, gy, gr] of [[2, -164, 27], [108, -122, 25], [44, -134, 23]]) { c.beginPath(); c.arc(gx, gy, gr, 0, 7); c.fill(); } c.restore(); };
    const PW = 512, PH = 724;
    const posterTex = canvasTex(2048, 1448, (c) => {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const cell = (i, fn) => { c.save(); c.translate((i % 4) * PW, (i >> 2) * PH); c.beginPath(); c.rect(0, 0, PW, PH); c.clip(); fn();
        for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,250,235'},${R() * 0.08})`; c.fillRect(R() * PW, R() * PH, 1 + R() * 3, 1 + R() * 3); }
        c.fillStyle = 'rgba(0,0,0,.1)'; c.fillRect(0, PH / 2 - 1, PW, 2); c.fillRect(PW / 2 - 1, 0, 2, PH);   // fold lines
        const gr = c.createLinearGradient(0, 0, PW, PH); gr.addColorStop(0, 'rgba(255,240,200,.07)'); gr.addColorStop(1, 'rgba(40,20,0,.16)'); c.fillStyle = gr; c.fillRect(0, 0, PW, PH);
        c.fillStyle = 'rgba(222,214,190,.8)'; for (const [tx, ty] of [[18, 14], [PW - 62, 14], [18, PH - 30], [PW - 62, PH - 30]]) c.fillRect(tx, ty, 44, 16);   // tape
        c.restore(); };
      cell(0, () => { c.fillStyle = '#101013'; c.fillRect(0, 0, PW, PH); c.fillStyle = '#b3161d'; c.fillRect(0, 0, PW, 120); c.fillStyle = '#f2ead6'; fitText(c, 'ВЕЧЕР БОКСА', PW / 2, 64, 96, PW - 50);
        const gr = c.createRadialGradient(PW / 2, 330, 20, PW / 2, 330, 300); gr.addColorStop(0, 'rgba(210,60,40,.55)'); gr.addColorStop(1, 'rgba(210,60,40,0)'); c.fillStyle = gr; c.fillRect(0, 120, PW, 420);
        sil(c, 150, 400, 1.05, false, '#e9e2d2'); sil(c, 362, 400, 1.05, true, '#c9a03a');
        c.fillStyle = '#f2ead6'; fitText(c, 'ГРОМОВ', 140, 566, 62, 210); fitText(c, 'САЛАХОВ', 372, 566, 62, 210); c.fillStyle = '#b3161d'; c.font = font(44); c.fillText('VS', PW / 2, 566);
        c.fillStyle = '#c9a03a'; fitText(c, '12 РАУНДОВ · 14 МАРТА · 19:00', PW / 2, 632, 40, PW - 50); c.fillStyle = '#9a968a'; fitText(c, 'ДК «МЕТАЛЛУРГ» · БИЛЕТЫ В КАССЕ', PW / 2, 682, 28, PW - 60); });
      cell(1, () => { c.fillStyle = '#e4dcc4'; c.fillRect(0, 0, PW, PH); c.fillStyle = '#16171b'; c.fillRect(24, 24, PW - 48, PH - 48); c.fillStyle = '#e4dcc4'; c.fillRect(34, 34, PW - 68, PH - 68);
        c.fillStyle = '#a3161c'; fitText(c, 'IRON JAW', PW / 2, 120, 150, PW - 90); c.fillStyle = '#16171b'; fitText(c, 'FIGHT NIGHT VII', PW / 2, 214, 60, PW - 100);
        c.fillStyle = '#a3161c'; c.beginPath(); c.arc(PW / 2, 430, 150, 0, 7); c.fill(); sil(c, PW / 2 - 30, 470, 1.15, false, '#16171b');
        c.fillStyle = '#16171b'; fitText(c, '★ ★ ★ ★ ★', PW / 2, 620, 40, 300); fitText(c, 'ШЕСТЬ БОЁВ · ОДИН ВЕЧЕР', PW / 2, 664, 34, PW - 100); });
      cell(2, () => { c.fillStyle = '#13213c'; c.fillRect(0, 0, PW, PH); c.strokeStyle = '#e9e2d2'; c.lineWidth = 7; c.font = font(250); c.strokeText('16OZ', PW / 2, 190); c.fillStyle = '#c9342c';
        c.beginPath(); c.ellipse(PW / 2, 440, 118, 136, -0.2, 0, 7); c.fill(); c.beginPath(); c.ellipse(PW / 2 + 106, 462, 44, 66, 0.5, 0, 7); c.fill(); c.fillStyle = '#e9e2d2'; c.fillRect(PW / 2 - 96, 556, 176, 54); c.fillStyle = '#13213c'; c.font = font(38); c.fillText('16OZ', PW / 2 - 8, 585);
        c.fillStyle = '#e9e2d2'; fitText(c, 'СДЕЛАНО ДЛЯ РАУНДОВ', PW / 2, 668, 44, PW - 70); });
      cell(3, () => { c.fillStyle = '#d6c59a'; c.fillRect(0, 0, PW, PH); c.fillStyle = '#8c1c1a'; c.fillRect(0, 150, PW, 300); sil(c, 160, 420, 0.95, false, '#1b1a18'); sil(c, 356, 420, 0.95, true, '#1b1a18');
        c.fillStyle = '#1b1a18'; fitText(c, 'ПЕРВЕНСТВО ГОРОДА', PW / 2, 60, 70, PW - 60); fitText(c, 'ПО БОКСУ', PW / 2, 116, 54, PW - 60); c.fillStyle = '#8c1c1a'; c.font = font(150); c.fillText('1987', PW / 2, 540);
        c.fillStyle = '#1b1a18'; fitText(c, 'СПОРТЗАЛ «ТРУД» · 21–24 НОЯБРЯ', PW / 2, 640, 34, PW - 70); fitText(c, 'НАЧАЛО В 17 ЧАСОВ', PW / 2, 682, 28, PW - 70); });
      cell(4, () => { c.fillStyle = '#b3201f'; c.fillRect(0, 0, PW, PH); c.fillStyle = '#f2ead6'; fitText(c, 'ОТКРЫТЫЙ', PW / 2, 130, 140, PW - 60); fitText(c, 'РИНГ', PW / 2, 280, 220, PW - 60);
        c.fillStyle = '#16171b'; c.fillRect(40, 390, PW - 80, 130); c.fillStyle = '#f2c230'; fitText(c, 'КАЖДУЮ СУББОТУ · 18:00', PW / 2, 456, 56, PW - 120);
        c.fillStyle = '#f2ead6'; fitText(c, 'ВОЛЬНЫЕ БОИ · 3 РАУНДА', PW / 2, 580, 42, PW - 80); fitText(c, 'шлем и капа обязательны', PW / 2, 640, 30, PW - 80, px => `600 ${px}px Barlow, Arial, sans-serif`); });
      cell(5, () => { c.fillStyle = '#0f0f11'; c.fillRect(0, 0, PW, PH); c.fillStyle = '#f2ead6'; fitText(c, 'НЕ УСТАЛ —', PW / 2, 210, 130, PW - 70); c.fillStyle = '#c9a03a'; fitText(c, 'НЕ РАБОТАЛ', PW / 2, 350, 130, PW - 70);
        c.fillStyle = '#f2ead6'; c.fillRect(70, 440, PW - 140, 5); c.fillStyle = '#8f8a7c'; fitText(c, 'IRON JAW · БОКСЁРСКИЙ КЛУБ', PW / 2, 500, 34, PW - 100); });
      cell(6, () => { c.fillStyle = '#e8e4d6'; c.fillRect(0, 0, PW, PH); c.fillStyle = '#1b1a18'; fitText(c, 'ПРАВИЛА ЗАЛА', PW / 2, 76, 84, PW - 70); c.fillRect(50, 126, PW - 100, 5); c.textAlign = 'left';
        ['1. Тренер всегда прав', '2. Бинты — до перчаток', '3. В ринг — только в капе', '4. Снаряд убрал на место', '5. Не опаздывай', '6. Слабых не бьём', '7. Устал — работай дальше'].forEach((t, k) => { c.font = '600 34px Barlow, Arial, sans-serif'; c.fillText(t, 56, 190 + k * 68); });
        c.textAlign = 'center'; c.fillStyle = '#a3161c'; fitText(c, 'АДМИНИСТРАЦИЯ', PW / 2, 676, 30, 300); });
      cell(7, () => { c.fillStyle = '#16382c'; c.fillRect(0, 0, PW, PH); c.strokeStyle = '#c9a03a'; c.lineWidth = 5; c.strokeRect(30, 30, PW - 60, PH - 60); c.fillStyle = '#c9a03a'; c.font = font(170); c.fillText('XII', PW / 2, 150);
        c.fillStyle = '#efe7d0'; fitText(c, 'ТУРНИР ПАМЯТИ', PW / 2, 290, 74, PW - 100); fitText(c, 'ТРЕНЕРА', PW / 2, 366, 74, PW - 100); c.fillStyle = '#c9a03a'; fitText(c, 'В. И. КРАЙНОВА', PW / 2, 452, 78, PW - 100);
        sil(c, PW / 2 - 20, 640, 0.6, false, '#efe7d0'); c.fillStyle = '#efe7d0'; fitText(c, 'ЮНОШИ · ЮНИОРЫ', PW / 2 + 130, 610, 26, 190); });
    });
    const posterG = [], posterAt = (i, wall, s, y, sc = 1) => { const w = 0.62 * sc, h = w * PH / PW, p = uvRect(new THREE.PlaneGeometry(w, h).rotateZ((R() - 0.5) * 0.05), (i % 4) / 4, 1 - ((i >> 2) + 1) / 2, (i % 4 + 1) / 4, 1 - (i >> 2) / 2); posterG.push(onWall(p, wall, s, y, 0.014)); };
    [[0, 2.75, 2.55, 1.25], [1, 3.6, 2.62], [4, 4.3, 2.58], [3, 5.0, 2.66], [7, 5.72, 2.6], [5, 2.7, 1.72], [2, 6.5, 2.58, 1.2], [6, 7.9, 2.2, 1.15], [0, 8.85, 2.3]].forEach(([i, x, y, sc]) => posterAt(i, 'B', x, y, sc));
    [[2, -4.4, 2.7, 1.3], [1, -3.4, 2.7, 1.3], [4, -6.6, 2.4], [5, 4.9, 2.5, 1.2], [3, 5.8, 2.45], [7, 6.55, 2.5]].forEach(([i, x, y, sc]) => posterAt(i, 'F', x, y, sc));
    [[0, 3.6, 2.5, 1.3], [4, 4.6, 2.45, 1.15], [6, 5.6, 2.3], [3, -7.2, 2.5, 1.2], [7, 6.5, 2.5]].forEach(([i, z, y, sc]) => posterAt(i, 'R', z, y, sc));
    [[5, 3.4, 2.4, 1.3], [1, 4.5, 2.45, 1.2], [2, 5.6, 2.4, 1.2], [7, -6.9, 2.5, 1.2]].forEach(([i, z, y, sc]) => posterAt(i, 'L', z, y, sc));
    put(staticMesh(geoMerge(posterG), new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.8, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
    const muralTex = canvasTex(2048, 512, (c, w, h) => {
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font(380); c.fillStyle = '#7d1418'; c.fillText('IRON JAW', w / 2 + 12, 210 + 12); c.fillStyle = '#e6dcc0'; c.fillText('IRON JAW', w / 2, 210);
      c.fillStyle = '#e6dcc0'; c.fillRect(160, 400, 380, 8); c.fillRect(w - 540, 400, 380, 8); c.font = font(92); c.fillText('БОКСЁРСКИЙ КЛУБ · С 1974', w / 2, 448);
      c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 16000; i++) { c.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.6})`; c.fillRect(R() * w, R() * h, 1 + R() * 9, 1 + R() * 3); }
      for (let r = 0; r < 26; r++) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, r * h / 26, w, 2); }   // the mortar joints show through the paint
      for (let i = 0; i < 80; i++) { c.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.35})`; c.beginPath(); c.ellipse(R() * w, R() * h, 10 + R() * 70, 6 + R() * 30, R() * 3, 0, 7); c.fill(); }
    });
    put(staticMesh(geoMerge([onWall(new THREE.PlaneGeometry(6.6, 1.65), 'B', -4.6, 2.5, 0.01), onWall(new THREE.PlaneGeometry(5.4, 1.35), 'R', -0.6, 3.75, 0.01)]), decalMat(muralTex)));
    const bannerTex = canvasTex(1024, 256, (c, w, h) => { c.fillStyle = '#a3161c'; c.fillRect(0, 0, w, h); c.fillStyle = '#16171b'; c.fillRect(0, 0, 250, h); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#efe7d0'; c.font = font(150); c.fillText('16OZ', 125, 136);
      fitText(c, 'ТЯЖЕЛО В ЗАЛЕ —', 636, 84, 92, 720); c.fillStyle = '#f2c230'; fitText(c, 'ЛЕГКО В РИНГЕ', 636, 180, 92, 720);
      for (let i = 0; i < 9; i++) { const x = 60 + i * 115 + R() * 20, gr = c.createLinearGradient(x, 0, x + 50, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(x, 0, 50, h); } speck(c, w, h, 5000, 0.1); });
    put(staticMesh(geoMerge([onWall(new THREE.PlaneGeometry(4.4, 1.1), 'F', -1.6, 3.55, 0.03), onWall(new THREE.PlaneGeometry(3.6, 0.9), 'L', 5.0, 3.8, 0.03)]), new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.9, envMapIntensity: 0.2 })));
    const CBX = 0.75, CBY = 1.62, CBW = 1.75, CBH = 1.18;
    const chalkTex = canvasTex(768, 512, (c, w, h) => {
      c.fillStyle = '#20302a'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(214,220,212,${0.015 + R() * 0.04})`; c.beginPath(); c.ellipse(R() * w, R() * h, 40 + R() * 160, 10 + R() * 40, (R() - 0.5) * 0.5, 0, 7); c.fill(); }   // wiped chalk
      const hand = px => `600 ${px}px "Segoe Print", "Comic Sans MS", "Bradley Hand", Barlow, Arial, sans-serif`;
      const wr = (t, x, y, px, col = 'rgba(236,236,226,.9)') => { c.save(); c.translate(x, y); c.rotate((R() - 0.5) * 0.035); c.font = hand(px); c.fillStyle = col; c.fillText(t, 0, 0); c.restore(); };
      c.textBaseline = 'middle'; wr('ПЛАН НА СЕГОДНЯ', 150, 52, 50, 'rgba(250,236,150,.92)'); c.fillStyle = 'rgba(250,236,150,.8)'; c.fillRect(148, 84, 470, 4);
      ['1. Скакалка — 3 × 3 мин', '2. Бой с тенью — 4 раунда', '3. Мешок — 6 × 2 мин', '4. Лапы — 4 раунда', '5. Спарринг — 3 раунда', '6. Пресс 100 · шея'].forEach((t, k) => wr(t, 46, 136 + k * 51, 37));
      wr('ЗАВТРА КРОСС 8 КМ — 7:00!', 110, 462, 40, 'rgba(240,150,140,.92)');
      c.strokeStyle = 'rgba(240,150,140,.85)'; c.lineWidth = 4; c.beginPath(); c.ellipse(590, 286, 120, 46, -0.08, 0, 7); c.stroke(); wr('без пропусков', 500, 288, 28);
      c.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.5})`; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); }
      c.globalCompositeOperation = 'destination-over'; c.fillStyle = '#20302a'; c.fillRect(0, 0, w, h);
    });
    put(staticMesh(onWall(new THREE.PlaneGeometry(CBW, CBH), 'B', CBX, CBY, 0.03), new THREE.MeshStandardMaterial({ map: chalkTex, roughness: 0.95, envMapIntensity: 0.15 })));
    for (const s of [-1, 1]) matt.push(geoTint(geoBox(0.06, CBH + 0.12, 0.045, CBX + s * (CBW / 2 + 0.03), CBY, Z0 + 0.03), '#6a4c2c'), geoTint(geoBox(CBW + 0.12, 0.06, 0.045, CBX, CBY + s * (CBH / 2 + 0.03), Z0 + 0.03), '#6a4c2c'));
    matt.push(geoTint(geoBox(CBW, 0.03, 0.09, CBX, CBY - CBH / 2 - 0.07, Z0 + 0.06), '#5b4126'), geoTint(geoBox(0.1, 0.035, 0.05, CBX + 0.5, CBY - CBH / 2 - 0.04, Z0 + 0.06), '#d8d4c8'), geoTint(geoBox(0.07, 0.02, 0.02, CBX - 0.3, CBY - CBH / 2 - 0.045, Z0 + 0.06), '#f0eee6'));

    /* ── the round timer on the back wall over the chalkboard: a steel box, three lamps (green = work, yellow = last 10 s,
       red = rest) and the clock; its face is a small canvas redrawn when the second or the lamp changes (sync) ── */
    const TMX = 0.75, TMY = 2.78;
    matt.push(geoTint(geoBox(0.4, 0.62, 0.12, TMX, TMY, Z0 + 0.06), '#1d1f22'), geoTint(geoBox(0.44, 0.03, 0.14, TMX, TMY + 0.32, Z0 + 0.07), '#2b2e31'));
    steel.push(geoTint(limb([TMX + 0.12, TMY - 0.31, Z0 + 0.03], [TMX + 0.12, CBY + CBH / 2 + 0.3, Z0 + 0.03], 0.01, 0.01, 5), '#15171a'));
    { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 192; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const tm = this.timer = { c: cv.getContext('2d'), tex, key: -1, glow: [] };
      g.add(staticMesh(new THREE.PlaneGeometry(0.36, 0.54).translate(TMX, TMY - 0.02, Z0 + 0.123), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5), fog: false })));
      ['#3cff78', '#ffd23c', '#ff3a2c'].forEach((col, k) => { const m = noAO(staticMesh(new THREE.PlaneGeometry(0.62, 0.62).translate(TMX, TMY + 0.165 - k * 0.118, Z0 + 0.14), new THREE.MeshBasicMaterial({ map: softTex, color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }))); m.renderOrder = 3; m.visible = false; g.add(m); tm.glow.push(m); }); }

    /* ── props. Far ones go into the two merged meshes; the ones a camera can get behind are clusters (a mesh each, hidden while
       between the camera and the fighters) ── */
    const blobs = [], blob = (x, z, w, d, ry = 0) => blobs.push(new THREE.PlaneGeometry(w, d).rotateX(-PI / 2).rotateY(ry).translate(x, 0.034, z));
    this.props = [];
    const cluster = (x, z, r, fn) => { const gs = []; fn(gs); const m = staticMesh(geoMerge(gs), propMat); put(m); this.props.push({ m, p: new V3(x, 1.2, z), r }); return m; };
    const bench = (gs, x, z, ry, L = 1.8) => { const b = [];
      for (const dz of [-0.11, 0, 0.11]) b.push(geoTint(geoBox(L, 0.035, 0.095, 0, 0.45, dz), `hsl(${28 + R() * 6},${34 + R() * 10}%,${26 + R() * 8}%)`));
      for (const sx of [-L / 2 + 0.2, L / 2 - 0.2]) b.push(geoTint(geoBox(0.04, 0.43, 0.04, sx, 0.215, -0.13), '#1b1c1e'), geoTint(geoBox(0.04, 0.43, 0.04, sx, 0.215, 0.13), '#1b1c1e'), geoTint(geoBox(0.04, 0.04, 0.3, sx, 0.41, 0), '#1b1c1e'));
      const m = geoMerge(b).rotateY(ry).translate(x, 0, z); gs.push(m); blob(x, z, L + 0.3, 0.7, ry); };
    /* a static man from capsules: joints → tapered limbs; clothes are colours. Built facing +z, then turned and placed */
    const man = (gs, P, C, x, z, ry) => { const b = [], J = P, seg = (a, c, r0, r1, col) => { b.push(geoTint(limb(J[a], J[c], r0, r1), col), geoTint(ball(...J[c], r1 * 1.02), col)); };
      for (const s of ['L', 'R']) { seg('hip' + s, 'knee' + s, 0.1, 0.075, C.legs); seg('knee' + s, 'ank' + s, 0.07, 0.055, C.legs); b.push(geoTint(ball(...J['hip' + s], 0.09), C.shorts));
        const f = J['ank' + s], ft = J['toe' + s]; b.push(geoTint(limb([f[0], 0.045, f[2]], [ft[0], 0.04, ft[2]], 0.05, 0.045, 6), C.shoes), geoTint(ball(ft[0], 0.04, ft[2], 0.046), C.shoes));
        seg('sh' + s, 'el' + s, 0.07, 0.058, C.top); seg('el' + s, 'hand' + s, 0.056, 0.046, C.top); b.push(geoTint(ball(...J['sh' + s], 0.072), C.top), geoTint(ball(...J['hand' + s], 0.075, 0.085, 0.09), C.glove)); }
      const hp = J.pel, ch = J.chest, hd = J.head;
      b.push(geoTint(limb(hp, ch, 0.17, 0.2, 10).scale(1, 1, 0.72).translate(0, 0, (hp[2] + ch[2]) * 0.14), C.top), geoTint(ball(ch[0], ch[1], ch[2], 0.24, 0.17, 0.15), C.top), geoTint(ball(hp[0], hp[1] - 0.04, hp[2], 0.2, 0.17, 0.15), C.shorts));
      b.push(geoTint(limb(ch, hd, 0.055, 0.05, 8), C.skin), geoTint(ball(hd[0], hd[1], hd[2], 0.1, 0.118, 0.11, 12), C.skin));
      if (C.hood) b.push(geoTint(ball(hd[0], hd[1] + 0.012, hd[2] - 0.022, 0.118, 0.13, 0.122, 12), C.hood), geoTint(ball(ch[0], ch[1] + 0.13, ch[2] - 0.07, 0.12, 0.07, 0.07), C.hood));
      gs.push(geoMerge(b).rotateY(ry).translate(x, 0, z)); blob(x, z, 0.95, 0.8); };

    // the back wall, right of the chalkboard: two benches, a man resting with a towel over his head, a kit bag, a water cooler
    cluster(5.2, Z0 + 0.5, 2.6, gs => { bench(gs, 4.0, Z0 + 0.45, 0); bench(gs, 6.3, Z0 + 0.45, 0);
      man(gs, { pel: [0, 0.52, 0], chest: [0, 0.98, 0.2], head: [0, 1.16, 0.36], hipL: [-0.11, 0.53, 0.02], hipR: [0.11, 0.53, 0.02], kneeL: [-0.2, 0.52, 0.44], kneeR: [0.2, 0.52, 0.44], ankL: [-0.22, 0.09, 0.5], ankR: [0.22, 0.09, 0.5], toeL: [-0.24, 0, 0.66], toeR: [0.24, 0, 0.66],
        shL: [-0.2, 1.04, 0.2], shR: [0.2, 1.04, 0.2], elL: [-0.24, 0.72, 0.36], elR: [0.24, 0.72, 0.36], handL: [-0.1, 0.6, 0.56], handR: [0.1, 0.6, 0.56] },
        { legs: '#20232b', shorts: '#20232b', shoes: '#d7d3c8', top: '#8b2a26', glove: '#b5846a', skin: '#b5846a', hood: '#e6e3da' }, 4.2, Z0 + 0.5, 0);
      gs.push(geoTint(ball(6.5, 0.2, Z0 + 1.0, 0.36, 0.19, 0.19), '#1d2a4a'), geoTint(geoBox(0.3, 0.02, 0.03, 6.5, 0.4, Z0 + 1.0), '#11131a'));
      gs.push(geoTint(geoBox(0.34, 1.0, 0.34, 8.0, 0.5, Z0 + 0.22), '#d8d6cf'), geoTint(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 12).translate(8.0, 1.2, Z0 + 0.22), '#7fb2d6'), geoTint(geoBox(0.2, 0.1, 0.02, 8.0, 0.74, Z0 + 0.4), '#2a2d31')); blob(8.0, Z0 + 0.3, 0.7, 0.7); blob(6.5, Z0 + 1.0, 0.9, 0.55); });
    // the man working a bag (the third bag of the row), seen from the back: hood up, a jab out
    this.boxer = cluster(BAGX[2], BEAM_Z + 0.82, 0.7, gs => man(gs, { pel: [0, 0.95, 0], chest: [0.01, 1.38, 0.06], head: [0.02, 1.62, 0.13], hipL: [-0.1, 0.93, 0], hipR: [0.1, 0.93, 0], kneeL: [-0.15, 0.5, 0.2], kneeR: [0.17, 0.5, -0.16], ankL: [-0.16, 0.09, 0.14], ankR: [0.22, 0.1, -0.34], toeL: [-0.12, 0, 0.3], toeR: [0.3, 0, -0.2],
        shL: [-0.19, 1.43, 0.12], shR: [0.2, 1.42, 0], elL: [-0.18, 1.4, 0.4], elR: [0.27, 1.16, 0.12], handL: [-0.1, 1.5, 0.66], handR: [0.14, 1.46, 0.26] },
        { legs: '#74777c', shorts: '#74777c', shoes: '#16171a', top: '#1c2740', glove: '#a31c1c', skin: '#b98a6c', hood: '#1c2740' }, BAGX[2] + 0.03, BEAM_Z + 0.86, PI));
    // right wall: two speed-bag platforms, the double-end bag, the board of skipping ropes, a bench
    const lathe = (pts, seg = 12) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    cluster(X1 - 0.5, -5.0, 1.5, gs => { for (const z of [-5.8, -4.2]) { const y = 1.98 + (z > -5 ? -0.1 : 0);
      gs.push(geoTint(new THREE.CylinderGeometry(0.38, 0.38, 0.045, 24).translate(X1 - 0.55, y, z), '#7c5c36'), geoTint(new THREE.CylinderGeometry(0.39, 0.39, 0.02, 24).translate(X1 - 0.55, y + 0.03, z), '#2a2c2f'));
      for (const s of [-1, 1]) gs.push(geoTint(geoBox(0.6, 0.04, 0.04, X1 - 0.3, y + 0.05, z + s * 0.26), '#2a2c2f'), geoTint(geoBox(0.04, 0.9, 0.04, X1 - 0.02, y + 0.25, z + s * 0.26), '#2a2c2f'), geoTint(limb([X1 - 0.02, y + 0.66, z + s * 0.26], [X1 - 0.62, y + 0.07, z + s * 0.26], 0.014, 0.014, 4), '#2a2c2f'));
      gs.push(geoTint(new THREE.CylinderGeometry(0.02, 0.03, 0.06, 8).translate(X1 - 0.55, y - 0.05, z), '#b9bcc0'), geoTint(lathe([[0, 0], [0.03, -0.01], [0.055, -0.07], [0.105, -0.2], [0.115, -0.26], [0.09, -0.32], [0.04, -0.345], [0, -0.35]]).translate(X1 - 0.55, y - 0.075, z), z > -5 ? '#7a2018' : '#2b2422')); } });
    cluster(9.4, -1.9, 0.5, gs => { const x = 9.4, z = -1.9;
      gs.push(geoTint(ball(x, 1.5, z, 0.11, 0.125, 0.11, 14), '#8a2a1e'), geoTint(limb([x, 0.03, z], [x, 1.38, z], 0.006, 0.006, 5), '#111'), geoTint(limb([x, 1.62, z], [x, 3.0, z], 0.006, 0.006, 5), '#111'),
        geoTint(geoBox(X1 - x, 0.05, 0.05, (X1 + x) / 2, 3.02, z), '#2a2c2f'), geoTint(limb([X1 - 0.02, 3.6, z], [x + 0.3, 3.04, z], 0.014, 0.014, 4), '#2a2c2f'), geoTint(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 14).translate(x, 0.05, z), '#3a3d40')); blob(x, z, 0.6, 0.6); });
    cluster(X1 - 0.2, 1.5, 1.4, gs => { gs.push(geoTint(geoBox(0.035, 0.14, 2.1, X1 - 0.02, 2.0, 1.5), '#6a4c2c'));
      [['#101113', '#b3201f'], ['#b3201f', '#15161a'], ['#d8d4c8', '#1d3a72'], ['#101113', '#d8a81a'], ['#3b6d3a', '#15161a'], ['#101113', '#101113']].forEach(([rc, hc], k) => { const z = 0.62 + k * 0.35, x = X1 - 0.1;
        gs.push(geoTint(limb([X1 - 0.04, 2.0, z], [x - 0.02, 2.02, z], 0.008, 0.008, 5), '#b9bcc0'));
        for (const s of [-1, 1]) { const L = 1.02 + R() * 0.16, c = new THREE.CatmullRomCurve3([new V3(x, 2.02, z), new V3(x - 0.012, 1.9, z + s * 0.022), new V3(x - 0.02, 1.4, z + s * (0.03 + R() * 0.03)), new V3(x - 0.02, 2.02 - L, z + s * (0.035 + R() * 0.04))]);
          gs.push(geoTint(new THREE.TubeGeometry(c, 10, 0.0045, 4), rc), geoTint(new THREE.CylinderGeometry(0.014, 0.012, 0.15, 6).translate(x - 0.02, 2.02 - L - 0.07, c.points[3].z), hc)); } });
      bench(gs, X1 - 0.35, 3.6, PI / 2, 1.6); gs.push(geoTint(ball(X1 - 0.4, 0.2, 5.0, 0.2), '#3a2a1c'), geoTint(ball(X1 - 0.42, 0.17, 5.5, 0.17), '#1d2a4a')); blob(X1 - 0.4, 5.2, 0.9, 1.1); });
    // front wall: benches by the lockers, a tyre for the sledgehammer, a stack of mats
    cluster(-6.4, Z1 - 1.0, 2.3, gs => { bench(gs, -7.3, Z1 - 0.95, 0, 1.7); bench(gs, -5.4, Z1 - 0.95, 0, 1.7); gs.push(geoTint(geoBox(0.42, 0.26, 0.3, -7.0, 0.6, Z1 - 0.95), '#7a1f1c')); });
    cluster(6.0, Z1 - 0.8, 1.6, gs => { gs.push(geoTint(new THREE.TorusGeometry(0.42, 0.17, 10, 20).rotateX(PI / 2).translate(6.4, 0.17, Z1 - 0.9), '#131314'), geoTint(limb([5.6, 0.04, Z1 - 0.3], [5.75, 0.95, Z1 - 0.06], 0.018, 0.018, 6), '#6a4c2c'), geoTint(geoBox(0.2, 0.09, 0.09, 5.6, 0.06, Z1 - 0.3, 0.3), '#3a3d40'));
      for (let k = 0; k < 5; k++) gs.push(geoTint(geoBox(1.0, 0.05, 2.0, 8.6 + (R() - 0.5) * 0.05, 0.03 + k * 0.052, Z1 - 1.2 + (R() - 0.5) * 0.05, PI / 2), k % 2 ? '#22324f' : '#63221f')); blob(6.4, Z1 - 0.9, 1.5, 1.5); blob(8.6, Z1 - 1.2, 2.3, 1.3); });
    // left wall under the mirrors: the dumbbell rack (three sloped shelves), medicine balls, a flat bench
    const RKZ0 = -5.1, RKZ1 = -2.5, RKX = X0 + 0.42, shelves = [[0.28, 0.2], [0.62, 0.09], [0.96, -0.02]];
    for (const z of [RKZ0, (RKZ0 + RKZ1) / 2, RKZ1]) steel.push(geoTint(limb([RKX + 0.3, 0, z], [RKX - 0.12, 1.12, z], 0.022, 0.022, 4), '#191a1c'), geoTint(limb([RKX - 0.2, 0, z], [RKX - 0.12, 1.12, z], 0.022, 0.022, 4), '#191a1c'), geoTint(geoBox(0.6, 0.03, 0.05, RKX + 0.05, 0.015, z), '#191a1c'));
    for (const [y, dx] of shelves) steel.push(geoTint(new THREE.BoxGeometry(0.3, 0.018, RKZ1 - RKZ0).rotateZ(-0.3).translate(RKX + dx, y, (RKZ0 + RKZ1) / 2), '#232527'), geoTint(new THREE.BoxGeometry(0.02, 0.05, RKZ1 - RKZ0).rotateZ(-0.3).translate(RKX + dx + 0.15, y - 0.03, (RKZ0 + RKZ1) / 2), '#232527'));
    blob(RKX + 0.05, (RKZ0 + RKZ1) / 2, 1.0, RKZ1 - RKZ0 + 0.4);
    for (const [x, z, r, col] of [[X0 + 0.4, 0.2, 0.17, '#7a1f1c'], [X0 + 0.42, 0.62, 0.15, '#1d2a4a'], [X0 + 0.75, 0.4, 0.13, '#2d2a26'], [X0 + 0.4, 1.0, 0.19, '#3a2a1c']]) { matt.push(geoTint(ball(x, r, z, r, r, r, 14), col)); blob(x, z, r * 3, r * 3); }
    { const gs = []; bench(gs, X0 + 1.5, -0.9, PI / 2, 1.3); matt.push(...gs); }

    put(staticMesh(geoMerge(steel), steelMat)); put(staticMesh(geoMerge(matt), propMat));

    /* dumbbells on the rack and kettlebells on the floor: one InstancedMesh each */
    { const hex = new THREE.CylinderGeometry(0.068, 0.068, 0.085, 6).rotateZ(PI / 2), dg = geoMerge([hex.clone().translate(-0.105, 0, 0), hex.clone().translate(0.105, 0, 0), new THREE.CylinderGeometry(0.015, 0.015, 0.16, 6).rotateZ(PI / 2)]);
      const list = []; shelves.forEach(([y, dx], t) => { let z = RKZ0 + 0.16; while (z < RKZ1 - 0.12) { const s = 0.72 + (1 - t / 2) * 0.3 + R() * 0.16; if (R() > 0.1) list.push([RKX + dx, y + 0.068 * s + 0.012, z, s]); z += 0.068 * s * 2 + 0.035; } });
      const dm = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ color: '#17181a', roughness: 0.55, metalness: 0.5, envMapIntensity: 0.7 }), list.length), q = new Quat(), col = new THREE.Color();
      list.forEach(([x, y, z, s], i) => { dm.setMatrixAt(i, _bgM.compose(_bgS.set(x, y, z), q.setFromEuler(_bgE.set(R() * 6, (R() - 0.5) * 0.16, -0.3, 'ZYX')), new V3(s, s, s))); dm.setColorAt(i, col.setScalar(0.7 + R() * 0.6)); });
      dm.matrixAutoUpdate = false; dm.frustumCulled = false; put(dm);
      const kg = geoMerge([new THREE.SphereGeometry(0.105, 14, 10).scale(1, 0.94, 1).translate(0, 0.1, 0), new THREE.TorusGeometry(0.062, 0.016, 6, 14, PI * 1.25).rotateZ(-PI * 0.125).translate(0, 0.19, 0), new THREE.CylinderGeometry(0.075, 0.085, 0.03, 12).translate(0, 0.015, 0)]);
      const kl = [[X0 + 0.38, -1.9, 1.15, '#17181a'], [X0 + 0.4, -1.55, 1.0, '#17181a'], [X0 + 0.38, -2.2, 1.3, '#17181a'], [X0 + 0.72, -1.7, 0.85, '#1d3a72'], [X0 + 0.42, 1.55, 1.0, '#9a7a16'], [X0 + 0.45, 1.86, 0.85, '#1d3a72'], [9.2, Z0 + 0.45, 1.1, '#17181a'], [9.55, Z0 + 0.42, 0.95, '#7a1f1c'], [9.9, Z0 + 0.5, 0.85, '#9a7a16'], [-0.5, Z1 - 0.5, 1.0, '#17181a'], [-0.1, Z1 - 0.45, 1.2, '#17181a']];
      const km = new THREE.InstancedMesh(kg, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4, envMapIntensity: 0.6 }), kl.length);
      kl.forEach(([x, z, s, c], i) => { km.setMatrixAt(i, _bgM.compose(_bgS.set(x, 0.03 * (x < X0 + 2 && z < 2.4 ? 1 : 0), z), q.setFromEuler(_bgE.set(0, R() * 6, 0)), new V3(s, s, s))); km.setColorAt(i, col.set(c)); blob(x, z, 0.4 * s, 0.4 * s); });
      km.matrixAutoUpdate = false; km.frustumCulled = false; put(km); }

    /* ── the heavy bags of the back wall: body (a canvas of leather, tape and print, tinted per bag) + chains and straps; both
       InstancedMeshes share one matrix buffer, rewritten each frame as the bags sway about their hooks (sync) ── */
    { const bagTex = canvasTex(512, 512, (c, w, h) => {
        c.fillStyle = '#d2d0cc'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + R() * 0.07})`; c.beginPath(); c.ellipse(R() * w, R() * h, 20 + R() * 80, 8 + R() * 40, R() * 3, 0, 7); c.fill(); }
        for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(0,0,0,${0.05 + R() * 0.1})`; c.lineWidth = 1 + R() * 2; const x = R() * w, y = R() * h; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 30, y + (R() - 0.5) * 20, x + 60, y + (R() - 0.5) * 20, x + 60 + R() * 60, y + (R() - 0.5) * 30); c.stroke(); }   // creases
        c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, 0, 4, h); c.fillRect(w / 2, 0, 3, h);   // seams
        c.fillStyle = 'rgba(255,255,255,.8)'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.save(); c.translate(w * 0.25, h * 0.4); c.rotate(-PI / 2); c.font = font(70); c.fillText('IRON JAW', 0, 0); c.restore();
        c.save(); c.translate(w * 0.75, h * 0.42); c.rotate(-PI / 2); c.font = font(84); c.fillText('16OZ', 0, 0); c.restore();
        c.fillStyle = 'rgba(190,192,196,.92)'; c.fillRect(0, h * 0.63, w, 26); c.fillRect(0, h * 0.67, w, 22); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, h * 0.63 + 25, w, 2);   // duct tape round the worn middle
        for (let i = 0; i < 26; i++) { const gr = c.createRadialGradient(w * R(), h * (0.35 + R() * 0.3), 0, w * R(), h * 0.5, 90); gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }
        speck(c, w, h, 12000, 0.1);
      });
      const TOP = -0.84, LEN = 1.16, body = lathe([[0, TOP], [0.1, TOP - 0.005], [0.165, TOP - 0.035], [0.18, TOP - 0.12], [0.182, TOP - LEN + 0.16], [0.172, TOP - LEN + 0.05], [0.12, TOP - LEN + 0.005], [0, TOP - LEN]], 20);
      const hw = [geoTint(limb([0, 0, 0], [0, -0.36, 0], 0.008, 0.008, 5), '#9a9da2'), geoTint(new THREE.TorusGeometry(0.026, 0.006, 5, 10).translate(0, -0.37, 0), '#9a9da2'), geoTint(new THREE.CylinderGeometry(0.186, 0.186, 0.05, 20, 1, true).translate(0, TOP - 0.1, 0), '#15161a'), geoTint(new THREE.CylinderGeometry(0.188, 0.188, 0.05, 20, 1, true).translate(0, TOP - LEN + 0.14, 0), '#15161a')];
      for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; hw.push(geoTint(limb([0, -0.39, 0], [Math.cos(a) * 0.15, TOP - 0.02, Math.sin(a) * 0.15], 0.006, 0.006, 4), '#9a9da2')); }
      const list = this.bags = BAGX.map((x, i) => ({ x, z: BEAM_Z, y: BEAM_Y, s: [1.0, 0.9, 1.06, 0.95][i], a: i === 2 ? 0.05 : 0.012 + R() * 0.012, ph: R() * 6, w: 2.4 + R() * 0.3, yaw: R() * 6 }));
      list.push({ x: 9.4, z: -5.4, y: 3.02, s: 1.02, a: 0.014, ph: 1, w: 2.5, yaw: 2 });   // one more by the right wall, on its own arm
      const bm = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ map: bagTex, roughness: 0.5, envMapIntensity: 0.6 }), list.length), col = new THREE.Color();
      ['#6b1f1a', '#1b1c1f', '#7a5632', '#22345c', '#1b1c1f'].forEach((c, i) => bm.setColorAt(i, col.set(c)));
      const hm = new THREE.InstancedMesh(geoMerge(hw), steelMat, list.length); hm.instanceMatrix = bm.instanceMatrix;
      for (const m of [bm, hm]) { m.frustumCulled = false; m.matrixAutoUpdate = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); put(m); }
      this.bagMesh = bm;
      put(staticMesh(geoMerge([geoTint(geoBox(X1 - 9.4 + 0.1, 0.07, 0.07, (X1 + 9.4) / 2 - 0.05, 3.055, -5.4), '#32363a'), geoTint(limb([X1 - 0.02, 3.9, -5.4], [9.7, 3.09, -5.4], 0.02, 0.02, 4), '#32363a')]), steelMat));
      for (const b of list) blob(b.x, b.z, 0.75, 0.75);
    }

    /* the bag of the drill hangs from a short beam on two drop rods; the whole thing follows the bag's hook (sync) */
    { const rig = this.bagRig = staticMesh(geoMerge([geoTint(geoBox(0.1, 0.14, 3.0, 0, 0.1, 0), '#32363a'), geoTint(geoBox(0.16, 0.012, 3.0, 0, 0.03, 0), '#32363a'), geoTint(geoBox(0.16, 0.012, 3.0, 0, 0.17, 0), '#32363a'),
        geoTint(limb([0, 0.17, -1.3], [0, H - BG.HOOK - BG.MAT, -1.3], 0.016, 0.016, 5), '#2a2d30'), geoTint(limb([0, 0.17, 1.3], [0, H - BG.HOOK - BG.MAT, 1.3], 0.016, 0.016, 5), '#2a2d30'), geoTint(new THREE.CylinderGeometry(0.03, 0.02, 0.05, 8).translate(0, 0.005, 0), '#9a9da2')]), steelMat);
      rig.matrixAutoUpdate = true; rig.visible = false; g.add(rig); }

    /* ── mirrors: three panels in the opening of the left wall — frames, a faint dirty glass over the mirrored copy, and a flat
       grey fallback when the copy is off ── */
    { const fr = [], zc = (MZ0 + MZ1) / 2, yc = (MY0 + MY1) / 2, W = MZ1 - MZ0, Hh = MY1 - MY0;
      for (let k = 0; k <= 3; k++) fr.push(geoTint(geoBox(0.03, Hh + 0.06, 0.05, X0 + 0.012, yc, MZ0 + k * W / 3), '#8f9396'));
      for (const y of [MY0, MY1]) fr.push(geoTint(geoBox(0.03, 0.05, W + 0.05, X0 + 0.012, y, zc), '#8f9396'));
      put(staticMesh(geoMerge(fr), steelMat), false);
      const glassTex = canvasTex(1024, 256, (c, w, h) => {
        c.fillStyle = 'rgba(150,170,190,.08)'; c.fillRect(0, 0, w, h);
        for (let k = 0; k < 3; k++) { const x0 = k * w / 3; for (let i = 0; i < 4; i++) { const x = x0 + R() * w / 3, gr = c.createLinearGradient(x, 0, x + 120, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(235,240,250,${0.04 + R() * 0.05})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(x0, 0, w / 3, h); }
          for (let i = 0; i < 60; i++) { const e = R() < 0.5, x = x0 + (e ? (R() < 0.5 ? R() * 14 : w / 3 - R() * 14) : R() * w / 3), y = e ? R() * h : (R() < 0.5 ? R() * 10 : h - R() * 14); c.fillStyle = `rgba(20,18,14,${0.2 + R() * 0.5})`; c.beginPath(); c.ellipse(x, y, 1 + R() * 3, 1 + R() * 3, 0, 0, 7); c.fill(); } }   // the silver gone at the edges
        for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(230,232,236,${0.02 + R() * 0.05})`; c.beginPath(); c.ellipse(R() * w, h * (0.3 + R() * 0.4), 4 + R() * 12, 3 + R() * 8, R() * 3, 0, 7); c.fill(); }   // hand smudges
      });
      const glass = noAO(staticMesh(new THREE.PlaneGeometry(W, Hh).rotateY(PI / 2).translate(X0 + 0.006, yc, zc), new THREE.MeshBasicMaterial({ map: glassTex, transparent: true, opacity: 0.4, depthWrite: false }))); glass.renderOrder = 5; g.add(glass);
      const flatTex = canvasTex(64, 64, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#59544b'); gr.addColorStop(0.55, '#3c3731'); gr.addColorStop(1, '#17171a'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
      this.flat = staticMesh(new THREE.PlaneGeometry(W, Hh).rotateY(PI / 2).translate(X0 - 0.01, yc, zc), new THREE.MeshBasicMaterial({ map: flatTex })); g.add(this.flat); }

    /* ── light. Enamel dish lamps on rods under the trusses (warm): four over the ring (`rig`: the ring's own light, hidden when
       the top-down replay camera rises to them), nine about the hall; their pools on the floor are additive decals, the real
       lights are one spot over the ring and four shadowless points. Daylight: shafts from the back windows, dust in them ── */
    const rigG = this.rig = new THREE.Group(); g.add(rigG);
    const dishMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }), bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.7, 1.7), fog: false });
    const beamTex = rep(canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 150; i++) { const x = R() * w, y = R() * h, r = 8 + R() * 44, a = 0.05 + R() * 0.16; for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h], [w, 0], [0, h]]) { const gr = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); } } }));
    beamTex.colorSpace = THREE.NoColorSpace;
    const uT = this.uT = { value: 0 };
    // dust in the light, faked (as in the warehouse): a cone that is brighter where it faces the eye, or a slab with soft edges
    const beamMat = (col, k, edge) => new THREE.ShaderMaterial({ uniforms: { uN: { value: beamTex }, uT, uCol: { value: new THREE.Color(col) }, uK: { value: k }, uEdge: { value: edge } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform sampler2D uN; uniform float uT, uK, uEdge; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN, vV;
        void main() { float n = texture2D(uN, vUv * vec2(1.3, 0.6) + vec2(uT * 0.013, -uT * 0.021)).r * texture2D(uN, vUv * vec2(2.9, 1.1) + vec2(-uT * 0.009, uT * 0.006)).r;
          float f = abs(dot(normalize(vN), normalize(vV))), e = sin(vUv.x * 3.14159);
          float a = mix(f * f, e * e, uEdge) * mix(0.16, 1.0, vUv.y * vUv.y) * smoothstep(0.0, 0.06, vUv.y) * smoothstep(0.4, 1.8, length(vV));
          gl_FragColor = vec4(uCol * (a * uK * (0.3 + 5.0 * n)), 1.0); }` });
    const LY = 3.85, ringL = [[-1.45, -1.45], [1.45, -1.45], [1.45, 1.45], [-1.45, 1.45]], hallL = [[-6, -5.6], [-6, -0.4], [-6, 4.8], [0.4, -6.3], [0.4, 6.3], [6.6, -5.6], [7.9, -1.3], [6.6, 4.8], [9.6, 1.9]];
    const lampSet = (L, parent, refl) => { const sh = [], bu = [];
      for (const [x, z] of L) { sh.push(geoTint(new THREE.CylinderGeometry(0.07, 0.34, 0.2, 20, 1, true).translate(x, LY + 0.1, z), '#22352c'), geoTint(new THREE.CylinderGeometry(0.04, 0.055, 0.1, 8).translate(x, LY + 0.25, z), '#17181a'), geoTint(new THREE.CylinderGeometry(0.008, 0.008, H - LY - 0.3, 4).translate(x, (H + LY + 0.3) / 2, z), '#0d0d0e'));
        bu.push(new THREE.CircleGeometry(0.31, 20).rotateX(PI / 2).translate(x, LY + 0.04, z), new THREE.SphereGeometry(0.055, 10, 8).translate(x, LY + 0.02, z)); }
      put(staticMesh(geoMerge(sh), dishMat), refl, parent); put(staticMesh(geoMerge(bu), bulbMat), refl, parent); };
    lampSet(ringL, rigG, false); lampSet(hallL, g, true);
    const cone = this.cone = noAO(staticMesh(geoMerge(hallL.map(([x, z]) => new THREE.CylinderGeometry(0.3, 2.3, LY, 24, 1, true).translate(x, LY / 2, z))), beamMat('#ffd09a', 0.022, 0))); cone.renderOrder = 4; g.add(cone);
    const rcone = noAO(staticMesh(geoMerge(ringL.map(([x, z]) => new THREE.CylinderGeometry(0.3, 1.9, LY - FL, 24, 1, true).translate(x, (LY + FL) / 2, z))), beamMat('#ffd09a', 0.02, 0))); rcone.renderOrder = 4; rigG.add(rcone);
    const pools = noAO(staticMesh(geoMerge(hallL.map(([x, z]) => new THREE.PlaneGeometry(5.6, 5.6).rotateX(-PI / 2).translate(x, 0.036, z))), new THREE.MeshBasicMaterial({ map: softTex, color: '#ffb469', transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }))); pools.renderOrder = -1; put(pools);
    const top = new THREE.SpotLight('#ffe6c2', 34, 12, 1.0, 0.85, 1.5); top.position.set(0, FL + 4.6, 0.3); top.target.position.set(0, FL + 0.5, 0); g.add(top, top.target);
    for (const [x, y, z, k] of [[-5.6, 3.6, -4.6, 26], [5.4, 3.6, -5.0, 26], [-5.4, 3.7, 4.4, 20], [7.2, 3.5, 1.4, 26]]) { const p = new THREE.PointLight('#ffcf9c', k, 15, 1.5); p.position.set(x, y, z); g.add(p); }
    /* daylight shafts: four soft slabs from each back window slanting into the hall, pale pools where they land */
    const shafts = [], dpools = [], d = new V3(0.16, -0.66, 0.73).normalize().multiplyScalar(6.2);
    for (const x of WINX) { const z0 = Z0 + 0.07, slab = (a, b) => { const q = new THREE.BufferGeometry(), e = [a[0] + d.x, a[1] + d.y, a[2] + d.z], f = [b[0] + d.x, b[1] + d.y, b[2] + d.z];
        q.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...f, ...a, ...f, ...e], 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2)); q.computeVertexNormals(); return q; };
      const x0 = x - WW / 2 + 0.1, x1 = x + WW / 2 - 0.1, y0 = WY - WH / 2 + 0.05, y1 = WY + WH / 2 - 0.05;
      shafts.push(slab([x0, y1, z0], [x1, y1, z0]), slab([x0, y0, z0], [x1, y0, z0]), slab([x0, y0, z0], [x0, y1, z0]), slab([x1, y0, z0], [x1, y1, z0]), slab([x0, WY, z0], [x1, WY, z0]));
      const t = WY / -d.y; dpools.push(new THREE.PlaneGeometry(3.2, 2.8).rotateX(-PI / 2).translate(x + d.x * t, 0.038, z0 + d.z * t)); }
    const shaft = this.shaft = new THREE.Group(); g.add(shaft);
    const sm = noAO(staticMesh(geoMerge(shafts), beamMat('#fff0d2', 0.05, 1))); sm.renderOrder = 3; shaft.add(sm);
    shaft.add(noAO(staticMesh(geoMerge(dpools), new THREE.MeshBasicMaterial({ map: softTex, color: '#fff2da', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))));
    /* dust motes in the shafts and under the lamps: one Points cloud, drifting in the vertex shader */
    { const N = 520, pos = new Float32Array(N * 3), ph = new Float32Array(N);
      for (let i = 0; i < N; i++) { pos[i * 3] = X0 + 1 + R() * (X1 - X0 - 2); pos[i * 3 + 1] = 0.4 + R() * 3.8; pos[i * 3 + 2] = i < N * 0.6 ? Z0 + 0.5 + R() * 5.5 : Z0 + 1 + R() * (Z1 - Z0 - 2); ph[i] = R() * 6.283; }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
      const pts = this.dust = noAO(new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: { uT, uH: { value: 900 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        vertexShader: 'attribute float aPh; uniform float uT, uH; varying float vA; void main() { vec3 p = position + vec3(sin(uT * 0.11 + aPh) * 0.35, sin(uT * 0.07 + aPh * 1.7) * 0.25 - mod(uT * 0.012 + aPh, 0.6), cos(uT * 0.09 + aPh * 2.3) * 0.35); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(uH * 0.011 / -mv.z, 1.0, 5.0); vA = (0.35 + 0.65 * abs(sin(uT * 0.6 + aPh * 5.0))) * smoothstep(0.5, 2.0, -mv.z); }',
        fragmentShader: 'varying float vA; void main() { vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)); gl_FragColor = vec4(vec3(1.0, 0.88, 0.68) * a * vA * 0.5, 1.0); }' })));
      pts.frustumCulled = false; pts.userData.N = N; g.add(pts); }
    /* soft dark blobs under the props (they cast no shadows) */
    const blobTex = canvasTex(64, 64, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    blobTex.colorSpace = THREE.NoColorSpace;
    const bl = noAO(staticMesh(geoMerge(blobs), new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: blobTex, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))); bl.renderOrder = -2; put(bl);

    this.apron = RINGSET.children.find(o => o.geometry && o.geometry.type === 'CircleGeometry');   // the dark floor disc of the arena ring: not here
    return g;
  },
  // sparring: the ring is the middle of the ARENA frame; the bag drill: the mat beside the ring is
  place(bag) {
    const { FL, SX, SZ, MAT } = BG; this.bagOn = bag;   // the drill is on a 30 mm mat: its top is the fighters' floor
    this.group.position.set(bag ? -SX : 0, bag ? -MAT : -FL, bag ? -SZ : 0); RINGSET.position.set(bag ? -SX : 0, bag ? FL - MAT : 0, bag ? -SZ : 0);
    this.bagRig.visible = bag; ARENA.updateMatrixWorld(true);
  },
  enter() { if (this.apron) this.apron.visible = false; this.place(BAG.on); },
  leave() { if (this.apron) this.apron.visible = true; RINGSET.position.set(0, 0, 0); RINGSET.visible = true; },
  // per frame, after the camera
  sync() {
    const bag = BAG.on, g = this.group, { X0, X1, Z0, Z1, H } = BG, cam = camera.position, t = this.uT.value = CROWD.u.uT.value;
    if (bag !== this.bagOn) this.place(bag);
    g.updateWorldMatrix(true, false); const M = g.matrixWorld, cl = _bgC.copy(cam).applyMatrix4(_bgI.copy(M).invert());   // the camera in floor coordinates
    const inside = cl.x > X0 + 0.15 && cl.x < X1 && cl.z > Z0 && cl.z < Z1 && cl.y < H;
    this.mir.visible = inside && GFX.level !== 'low'; this.flat.visible = !this.mir.visible;
    // the ring's lamps: out of the way of the top-down replay shot; in the drill the whole ring goes when the camera is over it
    const over = bag && cl.x < 3.7 && Math.abs(cl.z) < 4.2;
    RINGSET.visible = !over; this.plat.visible = !over; this.rig.visible = !over && cl.y < 3.5;
    if (bag) for (const r of ROPES) r.m.visible = true;   // arenaSync hides the sides of a ring the fighters are in; here they are beside it
    // props (and the bags of the row): hidden while inside the view wedge in front of what the camera looks at
    const dx = camL.x - cam.x, dz = camL.z - cam.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, tH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect * 1.1;
    const hid = (p, r) => { _lp.copy(p).applyMatrix4(M); const px = _lp.x - cam.x, pz = _lp.z - cam.z, s = px * ux + pz * uz; return s > -r && s < len - 0.5 && Math.abs(px * uz - pz * ux) - r < Math.max(s, 0) * tH + 0.3; };
    for (const c of this.props) c.m.visible = !hid(c.p, c.r);
    const bm = this.bagMesh;
    this.bags.forEach((b, i) => {
      if (hid(_lt.set(b.x, 1.6, b.z), 0.45)) { bm.setMatrixAt(i, _bgZero); return; }
      const k = i === 2 ? 0.55 + 0.45 * Math.sin(t * 0.9) : 1;   // the bag that is being worked swings in bursts
      _bgQ.setFromEuler(_bgE.set(b.a * k * Math.sin(t * b.w + b.ph), b.yaw + 0.08 * Math.sin(t * 0.31 + b.ph), b.a * 0.6 * k * Math.sin(t * b.w * 0.93 + b.ph * 1.7)));
      bm.setMatrixAt(i, _bgM.compose(_lt.set(b.x, b.y, b.z), _bgQ, _bgS.set(b.s, 1, b.s)));
    });
    bm.instanceMatrix.needsUpdate = true;
    // the drill bag's beam follows its hook
    if (bag) { const bx = BAG.x ?? (P2.headNow.x + 0.13 * (Math.sign(P2.group.position.x - P1.group.position.x) || 1)); this.bagRig.position.set(bx, BG.HOOK, 0).applyMatrix4(_bgI); }
    // dust and haze by the graphics level
    const lo = GFX.level === 'low'; this.shaft.visible = !lo; this.cone.visible = !lo;
    this.dust.geometry.setDrawRange(0, (this.dust.userData.N * GFX.particles) | 0); this.dust.material.uniforms.uH.value = renderer.domElement.height;
    // the round timer: green while the round runs, yellow in its last 10 s, red otherwise; the clock shows what is left
    const tm = this.timer, st = G.state, live = st === 'fight', lamp = live ? (G.roundT <= 10 ? 1 : 0) : 2, sec = Math.max(0, Math.ceil(st === 'break' ? G.breakT || 0 : live || st === 'kd' || st === 'intro' ? G.roundT || 0 : 0)), key = lamp * 1000 + sec;
    if (key !== tm.key) { tm.key = key; const c = tm.c, w = 128, h = 192;
      c.fillStyle = '#0c0d0f'; c.fillRect(0, 0, w, h);
      [['#2dff6e', '#0f3a1c'], ['#ffd02a', '#3d3208'], ['#ff2f22', '#3d0d0a']].forEach(([on, off], k) => { c.fillStyle = k === lamp ? on : off; c.beginPath(); c.arc(w / 2, 24 + k * 42, 17, 0, 7); c.fill(); c.strokeStyle = '#2c2f33'; c.lineWidth = 3; c.stroke(); });
      c.fillStyle = '#060607'; c.fillRect(10, 138, w - 20, 44); c.fillStyle = lamp === 2 ? '#ff3a2c' : lamp ? '#ffd23c' : '#3cff78'; c.font = '700 38px "IBM Plex Mono", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(`${(sec / 60) | 0}:${String(sec % 60).padStart(2, '0')}`, w / 2, 162); tm.tex.needsUpdate = true;
      tm.glow.forEach((m, k) => { m.visible = k === lamp; }); }
  },
};
