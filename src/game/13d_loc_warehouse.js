/* ───────── location: the warehouse (after the King of the Streets fights) ─────────
   An abandoned warehouse; the fight is inside a 6 × 6 m cage of orange temporary-fence panels (tube frame + welded mesh, concrete
   feet). Concrete floor with old blood and puddles, two hanging dish lamps over the cage (hard warm top light), a cold work light on
   a tripod at one corner, moonlight through broken windows under the roof, dust in the beams. The crowd (masks, balaclavas, hoods)
   stands right against the mesh.
   Layout (ARENA frame, cage centre = origin): the fence line is at |x| = |z| = WH_HALF, the hall is 34 × 24 m (walls at x = ±17,
   z = ±12), 7 m high, roof trusses every 6 m. Loose props stand 5.5–9 m out and are hidden while between the camera and the
   fighters (sync), as are the fence sides the camera looks through.
   The fence gives: every frame the fighters' joints (WH_DENT: joint index, radius) that reach past the fence line push a dent into
   the panels (vertex shader, `uDent`), so a man backed onto the fence and a knocked-out body lying against it both bulge the mesh.
   The knockout ragdoll is held by the rectangular soft wall (`wall.kind = 'rect'`, XWorld.solve). */
const WH_HALF = 3.0, WH_DENT = [[0, 0.2], [1, 0.2], [2, 0.15], [3, 0.15], [4, 0.16], [15, 0.13], [5, 0.08], [7, 0.08]], WH_DENT_K = 1.5;   // the mesh is drawn 1.5× deeper than the joint spheres reach: the body is wider than its joints
const _whI = new M4();
LOCS.warehouse = {
  id: 'warehouse', label: 'Склад', desc: 'Заброшенный склад, клетка из оранжевого забора', bound: { kind: 'square', half: 2.95 }, ring: false,
  // soft wall for the knockout ragdoll: the inner face of the fence (half sides), spring k (N/m, shared by the contacts), friction,
  // height of a panel, its depth, how far a body pushes the mesh out before the frame stops it, normal damping (1/s; steel mesh rattles, it does not swallow)
  wall: { kind: 'rect', hx: WH_HALF - 0.03, hz: WH_HALF - 0.03, k: 1.2e4, mu: 0.5, h: 2.0, d: 0.1, give: 0.24, damp: 12, top() { return this.h; } },
  light: { bg: '#06070a', fog: ['#06070a', 8, 30], exposure: 0.92, hemi: ['#6f86ac', '#14110e', 0.2], key: ['#ffd9a6', 22], rim: ['#8fb4ff', 1.9], rim2: ['#b8ceff', 0.7], fill: ['#dfe8ff', 0.1] },
  build() {
    const R = locRng(1313), g = new THREE.Group(), PI = Math.PI, HX = 17, HZ = 12, HH = 7, H = WH_HALF;
    const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const speck = (c, w, h, n, a) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${R() < 0.55 ? '0,0,0' : '255,255,255'},${R() * a})`; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } };
    const font = px => `900 ${px}px "Big Shoulders Display", Impact, "Arial Black", sans-serif`;
    const noAO = o => { CROWD.blobs.push(o); return o; };   // see-through things stay out of the AO normal pass (the list the crowd keeps for its floor blobs)
    const strut = (ax, ay, az, bx, by, bz, t, t2 = t) => { const d = new V3(bx - ax, by - ay, bz - az), L = d.length(), b = new THREE.BoxGeometry(t, t2, L); b.applyQuaternion(new Quat().setFromUnitVectors(new V3(0, 0, 1), d.normalize())); return b.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); };
    const decalMat = (map, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ map, transparent: true, roughness: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, o));

    /* floor: a 4 m tile of dirty concrete (blotches, grit, cracks, slab joints) over the hall */
    const concTex = rep(canvasTex(1024, 1024, (c, w, h) => {
      c.fillStyle = '#4c4d4c'; c.fillRect(0, 0, w, h);
      const blob = (x, y, rx, ry, a, col) => { c.fillStyle = col; for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h]]) { c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); c.fill(); } };
      for (let i = 0; i < 130; i++) blob(R() * w, R() * h, 30 + R() * 160, 20 + R() * 90, R() * 3, `rgba(${R() < 0.68 ? '14,15,16' : '205,204,196'},${0.025 + R() * 0.05})`);
      speck(c, w, h, 56000, 0.11);
      c.strokeStyle = 'rgba(14,14,14,.45)'; c.lineWidth = 1;
      for (let i = 0; i < 10; i++) { let x = R() * w, y = R() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 14; k++) { x += (R() - 0.5) * 70; y += (R() - 0.3) * 55; c.lineTo(x, y); } c.stroke(); }
      c.fillStyle = 'rgba(8,8,8,.6)'; c.fillRect(0, 0, w, 3); c.fillRect(0, 0, 3, h);
    }));
    const floor = staticMesh(geoUvMul(new THREE.PlaneGeometry(2 * HX, 2 * HZ).rotateX(-PI / 2), HX / 2, HZ / 2), new THREE.MeshStandardMaterial({ map: concTex, roughness: 0.84, envMapIntensity: 0.35 }));
    floor.receiveShadow = true; g.add(floor);
    /* old blood (most of it inside the cage: dried brown-red blotches with their spatter, a few drag smears, bloody shoe prints
       walking out) and grime, one 10 × 10 m decal over the cage */
    const bloodTex = canvasTex(1024, 1024, (c, w, h) => {
      const m = w / 10, at = v => w / 2 + v * m;
      for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h, r = 40 + R() * 120, gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(12,12,13,${0.1 + R() * 0.2})`); gr.addColorStop(1, 'rgba(12,12,13,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
      const stain = (x, y, s) => { const col = `${(44 + R() * 34) | 0},${(4 + R() * 5) | 0},${(4 + R() * 4) | 0}`;
        for (let i = 0; i < 7; i++) { c.fillStyle = `rgba(${col},${0.3 + R() * 0.45})`; c.beginPath(); c.ellipse(x + (R() - 0.5) * s, y + (R() - 0.5) * s, s * (0.2 + R() * 0.5), s * (0.15 + R() * 0.4), R() * 3, 0, 7); c.fill(); }
        for (let i = 0; i < 28; i++) { const a = R() * 7, d = s * (0.6 + R() * 2.4); c.fillStyle = `rgba(${col},${0.3 + R() * 0.5})`; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6 + R() * 2.2, 0, 7); c.fill(); } };
      for (let i = 0; i < 64; i++) { const inC = i < 46, k = inC ? 2.8 : 4.7; stain(at((R() * 2 - 1) * k), at((R() * 2 - 1) * k), inC ? 7 + R() * 26 : 5 + R() * 14); }
      c.lineCap = 'round';
      for (let i = 0; i < 5; i++) { let x = at((R() * 2 - 1) * 2.2), y = at((R() * 2 - 1) * 2.2); const a = R() * 7; c.strokeStyle = `rgba(62,9,8,${0.14 + R() * 0.16})`; c.lineWidth = 10 + R() * 16; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += Math.cos(a + (R() - 0.5)) * 26; y += Math.sin(a + (R() - 0.5)) * 26; c.lineTo(x, y); } c.stroke(); }
      for (let t = 0; t < 4; t++) { let x = at((R() * 2 - 1) * 1.5), y = at((R() * 2 - 1) * 1.5); const a = R() * 7, ca = Math.cos(a), sa = Math.sin(a);
        for (let k = 0; k < 9; k++) { const s = k % 2 ? 1 : -1; c.save(); c.translate(x - sa * s * 9, y + ca * s * 9); c.rotate(a + (R() - 0.5) * 0.3); c.fillStyle = `rgba(66,9,8,${0.5 * (1 - k / 9)})`; c.fillRect(-13, -5, 17, 10); c.fillRect(7, -4, 7, 8); c.restore(); x += ca * 34; y += sa * 34; } }
    });
    const blood = staticMesh(new THREE.PlaneGeometry(10, 10).rotateX(-PI / 2).translate(0, 0.001, 0), decalMat(bloodTex, { roughness: 0.6 }));
    blood.receiveShadow = true; blood.renderOrder = -3; g.add(blood);
    /* puddles: dark, smooth water — they show as the highlights of the lamps */
    const pudTex = canvasTex(256, 256, (c, w, h) => { c.filter = 'blur(5px)'; c.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse(w * (0.34 + R() * 0.32), h * (0.34 + R() * 0.32), w * (0.1 + R() * 0.16), h * (0.07 + R() * 0.13), R() * 3, 0, 7); c.fill(); } });
    const pud = staticMesh(geoMerge([[1.9, 2.1, 1.3], [-2.2, -1.7, 1.0], [-1.0, 4.6, 2.2], [5.4, 1.2, 2.6], [-6.2, -2.4, 3.0], [3.6, -6.4, 2.4], [-4.4, 6.6, 2.0], [8.5, -3.5, 3.2], [-9.5, 3.0, 2.8]].map(([x, z, s]) => new THREE.PlaneGeometry(s, s * 0.8).rotateX(-PI / 2).rotateY(R() * 6).translate(x, 0.0016, z))),
      new THREE.MeshStandardMaterial({ color: '#050607', alphaMap: pudTex, transparent: true, opacity: 0.8, roughness: 0.05, envMapIntensity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    pud.receiveShadow = true; pud.renderOrder = -2; g.add(pud);

    /* walls (single-sided): brick up to 3 m, stained concrete above; one 7 × 7 m tile */
    const wallTex = rep(canvasTex(1024, 1024, (c, w, h) => {
      const m = h / HH, yb = h - 3 * m;
      c.fillStyle = '#5d5f5c'; c.fillRect(0, 0, w, h); c.fillStyle = '#4a4744'; c.fillRect(0, yb, w, h - yb);
      const bw = w / 28, bh = (h - yb) / 40;
      for (let r = 0; r < 40; r++) for (let k = -1; k < 28; k++) { c.fillStyle = `hsl(${8 + R() * 14},${24 + R() * 22}%,${15 + R() * 13}%)`; c.fillRect((k + (r % 2) * 0.5) * bw + 1, yb + r * bh + 1, bw - 2, bh - 2); }
      c.fillStyle = '#3c3e3d'; c.fillRect(0, yb - 10, w, 12);
      speck(c, w, h, 30000, 0.1);
      for (let i = 0; i < 34; i++) { const x = R() * w, y = R() * h * 0.5, l = 80 + R() * 380, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, `rgba(14,14,12,${0.1 + R() * 0.18})`); gr.addColorStop(1, 'rgba(14,14,12,0)'); c.fillStyle = gr; c.fillRect(x, y, 4 + R() * 22, l); }
      for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(190,188,180,${0.04 + R() * 0.08})`; c.beginPath(); c.ellipse(R() * w, yb + R() * (h - yb), 20 + R() * 70, 10 + R() * 40, R() * 3, 0, 7); c.fill(); }
      const gr = c.createLinearGradient(0, h - 90, 0, h); gr.addColorStop(0, 'rgba(8,8,8,0)'); gr.addColorStop(1, 'rgba(8,8,8,.55)'); c.fillStyle = gr; c.fillRect(0, h - 90, w, 90);
    }));
    const wallG = (len, ry, x, z) => geoUvMul(new THREE.PlaneGeometry(len, HH), len / 7, 1).rotateY(ry).translate(x, HH / 2, z);
    g.add(staticMesh(geoMerge([wallG(2 * HX, 0, 0, -HZ), wallG(2 * HX, PI, 0, HZ), wallG(2 * HZ, PI / 2, -HX, 0), wallG(2 * HZ, -PI / 2, HX, 0)]), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92, envMapIntensity: 0.3 })));
    /* graffiti: four pieces on one atlas (made-up tags, no real names), worn; planes a hair off the walls */
    const grafTex = canvasTex(2048, 1024, (c, W, Hh) => {
      c.lineCap = c.lineJoin = 'round';
      const scrawl = (ox, oy, col, lw, n, sx, sy) => { let x = ox, y = oy; c.strokeStyle = col; c.lineWidth = lw; c.shadowColor = col; c.shadowBlur = lw; c.beginPath(); c.moveTo(x, y); for (let i = 0; i < n; i++) { const nx = x + (0.3 + R() * 0.7) * sx, ny = oy + (R() - 0.5) * sy; c.quadraticCurveTo(x + (R() - 0.3) * sx, y + (R() - 0.5) * sy * 2, nx, ny); x = nx; y = ny; } c.stroke(); c.shadowBlur = 0; };
      const piece = (ox, oy, word, c1, c2, out) => {
        c.save(); c.translate(ox + 512, oy + 250); c.rotate((R() - 0.5) * 0.1); c.transform(1, 0, -0.2, 1, 0, 0); c.font = font(310); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.strokeStyle = out; c.lineWidth = 50; c.strokeText(word, 0, 0); c.strokeStyle = '#09090b'; c.lineWidth = 24; c.strokeText(word, 0, 0);
        const gr = c.createLinearGradient(0, -150, 0, 150); gr.addColorStop(0, c1); gr.addColorStop(1, c2); c.fillStyle = gr; c.fillText(word, 0, 0);
        c.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 8; i++) { c.beginPath(); c.ellipse((R() - 0.5) * 720, -95 + R() * 40, 12 + R() * 22, 5, -0.5, 0, 7); c.fill(); }
        c.restore();
        for (let i = 0; i < 14; i++) { c.fillStyle = R() < 0.5 ? c2 : out; c.fillRect(ox + 130 + R() * 760, oy + 345 + R() * 40, 4 + R() * 6, 20 + R() * 110); }
        scrawl(ox + 90, oy + 452, out, 9, 7, 120, 50);
      };
      piece(0, 0, 'ГРОМ', '#39d6ff', '#1746c8', '#e9eef2'); piece(1024, 0, 'ЯД·13', '#d8ff3a', '#2f9c1e', '#7a2bd0'); piece(0, 512, 'ВОЛК', '#ffb02e', '#c81e1e', '#f0ece4');
      // the fourth: a skull under a crown, scrawled tags, arrows
      { const ox = 1024, oy = 512, cx = ox + 512, cy = oy + 250; c.fillStyle = '#e9e6dc'; c.strokeStyle = '#09090b'; c.lineWidth = 16;
        c.beginPath(); c.ellipse(cx, cy - 20, 130, 120, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.rect(cx - 72, cy + 60, 144, 76); c.fill(); c.stroke();
        c.fillStyle = '#09090b'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 52, cy - 22, 34, 40, s * 0.3, 0, 7); c.fill(); } c.beginPath(); c.moveTo(cx, cy + 16); c.lineTo(cx - 16, cy + 50); c.lineTo(cx + 16, cy + 50); c.fill();
        for (let i = -2; i <= 2; i++) c.fillRect(cx + i * 28 - 3, cy + 66, 6, 64);
        c.fillStyle = '#ffc61e'; c.beginPath(); c.moveTo(cx - 120, cy - 130); for (const [x, y] of [[-150, -230], [-75, -175], [0, -250], [75, -175], [150, -230], [120, -130]]) c.lineTo(cx + x, cy + y); c.fill(); c.stroke();
        scrawl(ox + 60, oy + 150, '#e02626', 12, 5, 70, 150); scrawl(ox + 700, oy + 170, '#f0ece4', 10, 5, 62, 170); scrawl(ox + 120, oy + 440, '#1f1f24', 14, 8, 110, 46); }
      c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.55})`; c.fillRect(R() * W, R() * Hh, 1 + R() * 7, 1 + R() * 3); }
      for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(0,0,0,${0.1 + R() * 0.3})`; c.beginPath(); c.ellipse(R() * W, R() * Hh, 10 + R() * 60, 6 + R() * 30, R() * 3, 0, 7); c.fill(); }
    });
    const graf = (q, w, ry, x, y, z) => { const p = new THREE.PlaneGeometry(w, w / 2), u = p.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, ((q & 1) + u.getX(i)) / 2, (1 - (q >> 1) + u.getY(i)) / 2); return p.rotateY(ry).translate(x, y, z); };
    g.add(staticMesh(geoMerge([graf(0, 5.6, 0, -6.6, 1.75, -HZ + 0.02), graf(1, 5.0, 0, 5.6, 1.6, -HZ + 0.02), graf(2, 5.4, -PI / 2, HX - 0.02, 1.7, -2.5), graf(3, 5.0, PI / 2, -HX + 0.02, 1.65, 2.5), graf(2, 5.2, PI, -4.5, 1.7, HZ - 0.02), graf(3, 4.6, PI, 7, 1.6, HZ - 0.02), graf(3, 4.4, 0, -13.4, 1.55, -HZ + 0.02)]), decalMat(grafTex, { roughness: 0.9, envMapIntensity: 0.3 })));

    /* windows under the roof on the long walls: small panes, dirty, some knocked out; they glow with the moonlight / a street lamp */
    const winTex = canvasTex(256, 192, (c, w, h) => {
      c.fillStyle = '#0e1013'; c.fillRect(0, 0, w, h); const pw = w / 6, ph = h / 4;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const x = i * pw + 3, y = j * ph + 3, a = pw - 6, b = ph - 6;
        if (R() < 0.24) { c.fillStyle = '#030406'; c.fillRect(x, y, a, b); c.fillStyle = `hsl(214,30%,${40 + R() * 20}%)`; c.beginPath(); c.moveTo(x, y + b); c.lineTo(x + a * R() * 0.6, y + b); c.lineTo(x, y + b * (0.3 + R() * 0.5)); c.fill(); if (R() < 0.5) { c.beginPath(); c.moveTo(x + a, y); c.lineTo(x + a, y + b * R() * 0.7); c.lineTo(x + a * (0.4 + R() * 0.4), y); c.fill(); } continue; }
        const gr = c.createLinearGradient(0, y, 0, y + b), l = 38 + R() * 34; gr.addColorStop(0, `hsl(${208 + R() * 12},${26 + R() * 16}%,${l}%)`); gr.addColorStop(1, `hsl(214,22%,${l * 0.62}%)`); c.fillStyle = gr; c.fillRect(x, y, a, b); }
      speck(c, w, h, 2600, 0.22);
    });
    const winX = [-14, -10, -6, -2, 2, 6, 10, 14], WY = 4.45, wins = [];
    for (const x of winX) wins.push(new THREE.PlaneGeometry(2.4, 1.7).translate(x, WY, -HZ + 0.03), new THREE.PlaneGeometry(2.4, 1.7).rotateY(PI).translate(x, WY, HZ - 0.03));
    g.add(staticMesh(geoMerge(wins), new THREE.MeshBasicMaterial({ map: winTex, color: new THREE.Color(1.35, 1.45, 1.7) })));

    /* steel: roof trusses with purlins, wall columns, pallet racks along the short walls and in the far corners (never between the
       camera and the fighters: one mesh) */
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.2, envMapIntensity: 0.4 });
    const far = [], RUST = ['#3a2c25', '#43302a', '#33292a'], woodC = () => `hsl(${28 + R() * 10},${22 + R() * 14}%,${24 + R() * 14}%)`;
    for (let x = -12; x <= 12; x += 6) { const col = RUST[(x / 6 + 2) % 3], yT = z => 6.25 + 0.65 * (1 - Math.abs(z) / HZ), n = 8, dz = 2 * HZ / n;
      far.push(geoTint(geoBox(0.14, 0.16, 2 * HZ, x, 5.9, 0), col), geoTint(strut(x, yT(-HZ), -HZ, x, yT(0), 0, 0.14, 0.16), col), geoTint(strut(x, yT(0), 0, x, yT(HZ), HZ, 0.14, 0.16), col));
      for (let k = 0; k <= n; k++) { const z = -HZ + k * dz; far.push(geoTint(strut(x, 5.9, z, x, yT(z), z, 0.07), col)); if (k < n) { const up = k < n / 2; far.push(geoTint(strut(x, up ? 5.9 : yT(z), z, x, up ? yT(z + dz) : 5.9, z + dz, 0.06), col)); } }
      for (const z of [-HZ + 0.16, HZ - 0.16]) far.push(geoTint(geoBox(0.3, 5.9, 0.28, x, 2.95, z), '#352b27')); }
    for (let k = 0; k <= 8; k++) { const z = -HZ + 0.4 + k * (2 * HZ - 0.8) / 8; far.push(geoTint(geoBox(2 * HX, 0.1, 0.07, 0, 6.33 + 0.65 * (1 - Math.abs(z) / HZ), z), '#2c2523')); }
    const pallet = (gs, x, y, z, ry) => { const col = woodC(), b = [];
      for (let i = 0; i < 5; i++) b.push(geoBox(1.2, 0.022, 0.12, 0, 0.133, -0.34 + i * 0.17)); for (const sx of [-0.55, 0, 0.55]) b.push(geoBox(0.1, 0.1, 0.8, sx, 0.072, 0)); for (const sz of [-0.35, 0, 0.35]) b.push(geoBox(1.2, 0.022, 0.1, 0, 0.011, sz));
      gs.push(geoTint(geoMerge(b).rotateY(ry).translate(x, y, z), col)); };
    const load = (gs, x, y, z, ry) => { pallet(gs, x, y, z, ry); const k = R(); if (k < 0.2) return;   // a pallet with cartons, a wrapped bale, or a crate on it
      if (k < 0.55) { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { if (R() < 0.2) continue; const hh = 0.3 + R() * 0.25, v = new V3((i - 0.5) * 0.56, 0, (j - 0.5) * 0.38).applyAxisAngle(_cwUp, ry); gs.push(geoTint(geoBox(0.52, hh, 0.36, x + v.x, y + 0.144 + hh / 2, z + v.z, ry + (R() - 0.5) * 0.1), `hsl(${28 + R() * 8},${22 + R() * 12}%,${26 + R() * 12}%)`)); } }
      else { const hh = 0.5 + R() * 0.5; gs.push(geoTint(geoBox(1.1, hh, 0.74, x, y + 0.144 + hh / 2, z, ry), k < 0.8 ? '#2f3a42' : '#3b3023')); } };
    const rack = (gs, x, z, ry, bays) => { const W = 2.7, D = 1.0, RH = 3.3, c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
      for (let b = 0; b <= bays; b++) for (const lz of [-D / 2, D / 2]) { const [px, pz] = at((b - bays / 2) * W, lz); gs.push(geoTint(geoBox(0.09, RH, 0.09, px, RH / 2, pz, ry), R() < 0.3 ? '#4a2c1e' : '#263a52')); }
      for (let b = 0; b < bays; b++) { const lx = (b + 0.5 - bays / 2) * W;
        for (const y of [1.25, 2.4]) { for (const lz of [-D / 2, D / 2]) { const [px, pz] = at(lx, lz); gs.push(geoTint(geoBox(W, 0.11, 0.05, px, y, pz, ry), R() < 0.4 ? '#6a371a' : '#9a4e1c')); } }
        for (const y of [0, 1.31, 2.46]) for (const o of [-0.66, 0.66]) { if (R() < (y ? 0.5 : 0.3)) continue; const [px, pz] = at(lx + o, 0); load(gs, px, y, pz, ry + PI / 2 + (R() - 0.5) * 0.08); } } };
    rack(far, -HX + 0.75, -5, PI / 2, 4); rack(far, -HX + 0.75, 7.6, PI / 2, 2); rack(far, HX - 0.75, 4.5, PI / 2, 4); rack(far, HX - 0.75, -8.2, PI / 2, 2); rack(far, -11.5, -HZ + 0.8, 0, 3); rack(far, 12.2, HZ - 0.8, 0, 3);
    far.push(geoTint(geoBox(4.2, 3.6, 0.1, HX - 6.5, 1.8, -HZ + 0.06), '#262a2e'), geoTint(geoBox(4.5, 0.3, 0.3, HX - 6.5, 3.75, -HZ + 0.16), '#3a2c25'));   // a roller door
    g.add(staticMesh(geoMerge(far), propMat));
    g.add(staticMesh(new THREE.PlaneGeometry(2 * HX, 2 * HZ).rotateX(PI / 2).translate(0, HH, 0), new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 1, envMapIntensity: 0.1 })));
    /* loose props 5.5–9.5 m out: stacks of pallets, drums, a wrapped load — a mesh each, hidden while in the camera's way */
    this.props = [];
    const prop = (x, z, r, fn) => { const gs = []; fn(gs); const m = staticMesh(geoMerge(gs), propMat); g.add(m); this.props.push({ m, p: new V3(x, 0.8, z), r }); };
    const drum = (gs, x, z, col, lie) => { const b = [new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14)]; for (const y of [-0.15, 0.15]) b.push(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 14).translate(0, y, 0)); let d = geoMerge(b); if (lie) d = d.rotateZ(PI / 2).rotateY(R() * 3).translate(x, 0.29, z); else d.translate(x, 0.44, z); gs.push(geoTint(d, col)); };
    const stack = (gs, x, z, n) => { const ry = R() * 3; for (let i = 0; i < n; i++) pallet(gs, x + (R() - 0.5) * 0.06, i * 0.144, z + (R() - 0.5) * 0.06, ry + (R() - 0.5) * 0.14); };
    prop(-6.3, -5.6, 1.5, gs => { stack(gs, -6.6, -5.9, 8); stack(gs, -5.5, -5.2, 3); drum(gs, -7.3, -4.7, '#5a2019'); });
    prop(6.4, -6.2, 1.5, gs => { load(gs, 6.2, 0, -6.6, 0.4); drum(gs, 7.3, -5.6, '#1f3a56'); drum(gs, 7.9, -5.9, '#3c3f3f'); drum(gs, 6.9, -4.9, '#5a2019', true); });
    prop(-7.4, 3.2, 1.5, gs => { stack(gs, -7.5, 3.0, 6); load(gs, -7.9, 0, 4.5, 1.3); });
    prop(7.2, 4.6, 1.5, gs => { stack(gs, 7.6, 5.2, 10); stack(gs, 6.6, 4.1, 2); drum(gs, 8.4, 3.9, '#3c3f3f'); });
    prop(0.8, -8.4, 1.4, gs => { load(gs, 0.2, 0, -8.6, 0.1); load(gs, 1.7, 0, -8.3, -0.2); });
    prop(-1.5, 8.2, 1.4, gs => { stack(gs, -1.8, 8.4, 5); drum(gs, -0.6, 7.9, '#1f3a56'); });

    /* the cage: per side three 2 m panels (tube frame, a mid rail, welded mesh), concrete feet under the joints, clamps. Built in
       the ARENA frame so the dent shader can work in it; a side = a mesh of tubes and feet + a mesh of the net */
    const netTex = rep(canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; for (let k = 0; k < 8; k++) c.fillRect(14 + 32 * k, 0, 4, h); for (let k = 0; k < 4; k++) c.fillRect(0, 30 + 64 * k, w, 4); }));
    const dentU = this.dentU = { value: Array.from({ length: 16 }, () => new THREE.Vector4()) };
    const dentPatch = sh => { sh.uniforms.uDent = dentU;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform vec4 uDent[16];\nvoid main() {').replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        { vec3 fo = abs(position.x) > abs(position.z) ? vec3(sign(position.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(position.z)); float fd = 0.0;
          for (int i = 0; i < 16; i++) { vec3 q = position - uDent[i].xyz; fd = max(fd, uDent[i].w * exp(-dot(q, q) * 2.6)); }
          transformed += fo * fd * smoothstep(0.14, 0.75, position.y); }`); };
    const tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35, envMapIntensity: 0.5 }); tubeMat.onBeforeCompile = dentPatch;
    const netMat = new THREE.MeshStandardMaterial({ color: '#f26a1b', alphaMap: netTex, transparent: true, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3, envMapIntensity: 0.6, emissive: '#3a1403', depthWrite: false }); netMat.onBeforeCompile = dentPatch;
    this.sides = [];
    for (let s = 0; s < 4; s++) {
      const a = s * PI / 2, tubes = [], nets = [], OR = ['#e8621a', '#d9591a', '#ee6a1e'];
      for (let k = 0; k < 3; k++) { const cx = -2 + 2 * k, col = OR[(s + k) % 3];
        for (const sx of [-0.96, 0.96]) tubes.push(geoTint(new THREE.CylinderGeometry(0.021, 0.021, 1.92, 6, 8).translate(cx + sx, 1.06, H), col));
        for (const [y, r] of [[0.16, 0.019], [2.0, 0.021], [1.08, 0.012]]) tubes.push(geoTint(new THREE.CylinderGeometry(r, r, 1.92, 6, 10).rotateZ(PI / 2).translate(cx, y, H), col));
        nets.push(geoUvMul(new THREE.PlaneGeometry(1.9, 1.84, 12, 8), 3.8, 3.68).translate(cx, 1.08, H));
        tubes.push(geoTint(geoBox(0.62, 0.13, 0.22, cx - 1, 0.065, H), k % 2 ? '#77787a' : '#6c6d6e'));   // the foot under the joint to the left of this panel
        if (k) for (const y of [0.55, 1.6]) tubes.push(geoTint(geoBox(0.1, 0.05, 0.06, cx - 1, y, H), '#2a2b2e'));
      }
      const tm = staticMesh(geoMerge(tubes).rotateY(a), tubeMat), nm = noAO(staticMesh(geoMerge(nets).rotateY(a), netMat)); tm.frustumCulled = nm.frustumCulled = false; nm.renderOrder = 2;
      g.add(tm, nm); this.sides.push({ tm, nm, ox: Math.sin(a), oz: Math.cos(a) });
    }

    /* light. Two enamel dish lamps on cables over the cage: hard warm pools straight down (the shared `key` only adds the fighters'
       shadows); a cold LED work light on a tripod outside one corner; moonlight from the window walls for the depth of the hall */
    const rig = this.rig = new THREE.Group(); g.add(rig);
    const beamTex = rep(canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 150; i++) { const x = R() * w, y = R() * h, r = 8 + R() * 44, a = 0.05 + R() * 0.16; for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h], [w, 0], [0, h]]) { const gr = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); } } }));
    beamTex.colorSpace = THREE.NoColorSpace;
    /* dust in the light, faked: a cone (lamps: brighter where the surface faces the eye, so it has no rim) or a slab with soft
       edges (window shafts), additive, two layers of drifting noise; fades out near the lens. v = 1 at the lamp */
    const uT = this.uT = { value: 0 };
    const beamMat = (col, k, edge) => new THREE.ShaderMaterial({ uniforms: { uN: { value: beamTex }, uT, uCol: { value: new THREE.Color(col) }, uK: { value: k }, uEdge: { value: edge } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vUv; varying vec3 vN, vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform sampler2D uN; uniform float uT, uK, uEdge; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN, vV;
        void main() { float n = texture2D(uN, vUv * vec2(1.3, 0.6) + vec2(uT * 0.013, -uT * 0.021)).r * texture2D(uN, vUv * vec2(2.9, 1.1) + vec2(-uT * 0.009, uT * 0.006)).r;
          float f = abs(dot(normalize(vN), normalize(vV))), e = sin(vUv.x * 3.14159);
          float a = mix(f * f, e * e, uEdge) * mix(0.16, 1.0, vUv.y * vUv.y) * smoothstep(0.0, 0.06, vUv.y) * smoothstep(0.4, 1.8, length(vV));
          gl_FragColor = vec4(uCol * (a * uK * (0.3 + 5.0 * n)), 1.0); }` });
    const lampGs = [], bulbs = [], cones = [], LAMPS = this.lamps = [[-1.25, 3.25, 0.5], [1.35, 3.3, -0.6]];
    const dustG = new THREE.Group(); rig.add(dustG); this.dust = [];
    for (const [x, y, z] of LAMPS) {
      lampGs.push(geoTint(new THREE.CylinderGeometry(0.06, 0.31, 0.17, 20, 1, true).translate(x, y + 0.085, z), '#27322c'), geoTint(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 10).translate(x, y + 0.22, z), '#1a1b1d'), geoTint(new THREE.CylinderGeometry(0.007, 0.007, 5.9 - y - 0.25, 5).translate(x, (5.9 + y + 0.25) / 2, z), '#0c0c0d'));
      bulbs.push(new THREE.CircleGeometry(0.285, 20).rotateX(PI / 2).translate(x, y + 0.03, z), new THREE.SphereGeometry(0.05, 10, 8).translate(x, y + 0.02, z));
      cones.push(new THREE.CylinderGeometry(0.26, 2.5, y, 28, 1, true).translate(x, y / 2, z));
      const sp = new THREE.SpotLight('#ffc98a', 30, 9, 0.92, 0.55, 1.5); sp.position.set(x, y, z); sp.target.position.set(x, 0, z); g.add(sp, sp.target);
      // motes drifting in this lamp's cone (the cloud turns slowly about the lamp's axis, so they stay in the light)
      const N = 170, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const py = 0.15 + R() * (y - 0.4), a = R() * 2 * PI, r = Math.sqrt(R()) * (0.2 + (1 - py / y) * 2.1); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = py; pos[i * 3 + 2] = Math.sin(a) * r; }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = noAO(new THREE.Points(pg, new THREE.PointsMaterial({ color: '#ffd7a0', size: 0.016, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
      pts.position.set(x, 0, z); pts.frustumCulled = false; dustG.add(pts); this.dust.push({ pts, N });
    }
    const dishMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
    rig.add(staticMesh(geoMerge(lampGs), dishMat), staticMesh(geoMerge(bulbs), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.5, 1.5), fog: false })));
    const cone = noAO(staticMesh(geoMerge(cones), beamMat('#ffcf96', 0.05, 0))); cone.renderOrder = 4; rig.add(cone);
    // the work light: tripod, mast, head turned to the cage
    { const fx = 5.3, fz = -5.1, fy = 2.35, gs = [], dir = new V3(-fx, 1.1 - fy, -fz).normalize(), q = new Quat().setFromUnitVectors(new V3(0, 0, 1), dir);
      for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3 + 0.4; gs.push(geoTint(strut(fx, 0.95, fz, fx + Math.cos(a) * 0.6, 0, fz + Math.sin(a) * 0.6, 0.025), '#18191b')); }
      gs.push(geoTint(geoBox(0.035, fy - 0.6, 0.035, fx, (fy + 0.6) / 2, fz), '#18191b'), geoTint(new THREE.BoxGeometry(0.4, 0.28, 0.09).applyQuaternion(q).translate(fx, fy, fz), '#d8a81a'));
      const face = new THREE.PlaneGeometry(0.34, 0.22).applyQuaternion(q).translate(fx + dir.x * 0.05, fy + dir.y * 0.05, fz + dir.z * 0.05);
      const m = new THREE.Group(); m.add(staticMesh(geoMerge(gs), propMat), staticMesh(face, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 3.0, 3.6), fog: false })));
      const fb = noAO(staticMesh(new THREE.CylinderGeometry(0.14, 1.5, 6.4, 20, 1, true).translate(0, -3.2, 0).applyQuaternion(new Quat().setFromUnitVectors(new V3(0, -1, 0), dir)).translate(fx, fy, fz), beamMat('#bcd6ff', 0.035, 0))); fb.renderOrder = 4; m.add(fb);
      g.add(m); this.props.push({ m, p: new V3(fx, 1.2, fz), r: 0.9 });
      const sp = new THREE.SpotLight('#cfe0ff', 75, 14, 0.5, 0.6, 1.5); sp.position.set(fx, fy, fz); sp.target.position.set(0, 1.0, 0); g.add(sp, sp.target); }
    for (const z of [-9.6, 9.6]) { const p = new THREE.PointLight('#7f9ed8', 26, 17, 1.5); p.position.set(z > 0 ? -3 : 3, 4.2, z); g.add(p); }
    /* moonlight shafts from the windows (four soft slabs each, slanting into the hall) and their pale pools on the floor */
    const shafts = [], pools = [], SL = 6.3;
    for (const sz of [-1, 1]) for (const x of winX) { if (R() < 0.25) continue; const d = new V3(0.2 * sz, -0.7, -0.68 * sz).normalize().multiplyScalar(SL), z0 = sz * (HZ - 0.06);
      const slab = (a, b) => { const q = new THREE.BufferGeometry(), e = [a[0] + d.x, a[1] + d.y, a[2] + d.z], f = [b[0] + d.x, b[1] + d.y, b[2] + d.z];
        q.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...f, ...a, ...f, ...e], 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2)); q.computeVertexNormals(); return q; };
      const x0 = x - 1.15, x1 = x + 1.15, y0 = WY - 0.8, y1 = WY + 0.8;
      shafts.push(slab([x0, y1, z0], [x1, y1, z0]), slab([x0, y0, z0], [x1, y0, z0]), slab([x0, y0, z0], [x0, y1, z0]), slab([x1, y0, z0], [x1, y1, z0]));
      const t = WY / -d.y; pools.push(new THREE.PlaneGeometry(2.8, 3.4).rotateX(-PI / 2).translate(x + d.x * t, 0.004, z0 + d.z * t)); }
    const shaft = this.shaft = new THREE.Group(); g.add(shaft);
    const sm = noAO(staticMesh(geoMerge(shafts), beamMat('#9fb8e8', 0.05, 1))); sm.renderOrder = 3; shaft.add(sm);
    const poolTex = canvasTex(64, 64, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(150,180,235,.5)'); gr.addColorStop(0.6, 'rgba(120,150,210,.2)'); gr.addColorStop(1, 'rgba(100,130,200,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    shaft.add(noAO(staticMesh(geoMerge(pools), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }))));

    /* the crowd: three rows right against the mesh on all four sides, the back rows on crates */
    this.crowd = makeCrowd({ shape: 'rect', w: 2 * H, h: 2 * H, r: 0.42, rows: 3, look: 'masked', seed: 41, max: 120 });
    g.add(this.crowd.group);
    return g;
  },
  // per frame, after the camera
  sync() {
    const M = ARENA.matrixWorld, cam = camera.position, inv = _whI.copy(M).invert(), t = this.uT.value = CROWD.u.uT.value;
    // fence sides the camera is outside of (or almost at) are hidden, as the near ropes of the ring are
    _lc.copy(cam).applyMatrix4(inv);
    for (const s of this.sides) s.tm.visible = s.nm.visible = _lc.x * s.ox + _lc.z * s.oz < WH_HALF - 0.3;
    this.rig.visible = cam.y < 2.9;   // the top-down replay shot looks from above the lamps
    // loose props and the work light: hidden while inside the view wedge in front of what the camera looks at
    const dx = camL.x - cam.x, dz = camL.z - cam.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, tH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect * 1.1;
    for (const c of this.props) { _lp.copy(c.p).applyMatrix4(M); const px = _lp.x - cam.x, pz = _lp.z - cam.z, s = px * ux + pz * uz; c.m.visible = !(s > -c.r && s < len - 0.5 && Math.abs(px * uz - pz * ux) - c.r < Math.max(s, 0) * tH + 0.3); }
    // dust: shafts off on the lowest level, motes by GFX.particles
    this.shaft.visible = GFX.level !== 'low';
    this.dust.forEach((d, i) => { d.pts.geometry.setDrawRange(0, (d.N * GFX.particles) | 0); d.pts.rotation.y = t * (i ? -0.035 : 0.028); d.pts.position.y = 0.05 * Math.sin(t * 0.17 + i * 2); });
    // the mesh gives under whoever leans on it: each joint past the fence line makes a dent that follows it and eases back when he comes off
    if (!P1 || !P2 || !P1.jp || !P2.jp) return;
    let k = 0;
    for (const F of [P1, P2]) for (const [j, r] of WH_DENT) {
      const u = this.dentU.value[k++]; _lp.copy(F.jp[j]).applyMatrix4(inv);
      const ex = Math.abs(_lp.x) + r - WH_HALF, ez = Math.abs(_lp.z) + r - WH_HALF; let tg = 0;
      if (_lp.y < 2.1 && Math.max(Math.abs(_lp.x), Math.abs(_lp.z)) < WH_HALF + 0.5) { if (ex > ez) { if (ex > 0) { tg = ex; _lp.x = Math.sign(_lp.x) * WH_HALF; } } else if (ez > 0) { tg = ez; _lp.z = Math.sign(_lp.z) * WH_HALF; } }
      tg = Math.min(tg * WH_DENT_K, 0.4); const w = u.w + (tg - u.w) * (tg > u.w ? 0.6 : 0.14);
      if (tg > 0) u.set(_lp.x, _lp.y, _lp.z, w); else u.w = w < 1e-4 ? 0 : w;
    }
  },
};
