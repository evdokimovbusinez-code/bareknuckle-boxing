/* ───────── locations: where the fight takes place ─────────
   A location = the boundary of the fighting floor (`bound`), whether the boxing ring (RINGSET + ropes) is shown (`ring`), a soft
   wall for the knockout ragdoll where there are no ropes (`wall`, see XWorld.solve), its own set (`build()` → a Group put into
   ARENA, built lazily once) and its light (`light`: background, fog, exposure, colours of the shared lights; own lamps live in the set).
   Everything is procedural: canvas textures, merged static geometry, instancing; only the fighters cast shadows. */
const _lc = new V3(), _lt = new V3(), _lp = new V3();
const locRng = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // seeded: a set always looks the same
const geoMerge = gs => mergeGeometries(gs.map(g => g.index ? g.toNonIndexed() : g));
const geoTint = (g, c) => { const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const geoBox = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
const geoUvMul = (g, su, sv) => { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * su, u.getY(i) * sv); return g; };
const geoUvXZ = (g, f) => { const p = g.attributes.position, u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, p.getX(i) * f, p.getZ(i) * f); return g; };
const staticMesh = (g, m) => { const o = new THREE.Mesh(g, m); o.matrixAutoUpdate = false; o.updateMatrix(); return o; };
const BALE_N = 21, BALE_R = 3.0, BALE_LOW = [0, 5, 11, 15, 16];   // 21 bales of 0.9 m close a 6 m circle; these stacks have one tier only

const LOCS = {
  /* the boxing ring in a dark hall: a big soft top light on a rig straight above the ring, the canvas throws a little cool light
     back up under the chin and the brows, a few far lamps give the background depth */
  gym: {
    id: 'gym', label: 'Зал', desc: 'Боксёрский ринг в тёмном зале', bound: { kind: 'square', half: 2.2 }, ring: true, wall: null,
    light: { bg: '#0a0c11', fog: ['#0a0c11', 7, 15], exposure: 0.92, hemi: ['#8ea3cc', '#1b1510', 0.42], key: ['#fff0dc', 52], rim: ['#86b6ff', 2.6], rim2: ['#ffb27a', 1.8], fill: ['#ffffff', 0.5] },
    build() {
      const g = new THREE.Group();
      const top = new THREE.SpotLight('#fff6ea', 26, 11, 0.95, 0.9, 1.6); top.position.set(0, 6.2, 0.4); top.target.position.set(0, 0.6, 0); g.add(top, top.target);
      const bounce = new THREE.DirectionalLight('#6f86c2', 0.32); bounce.position.set(0.2, -1, 0.8); scene.add(bounce); this.world = [bounce];
      const lampG = new THREE.SphereGeometry(0.035, 6, 4), N = 46, lamps = new THREE.InstancedMesh(lampG, new THREE.MeshBasicMaterial({ color: '#ffe2b0', fog: false }), N), m4 = new M4();
      for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + rr() * 0.1, r = 10 + rr() * 5, y = 1.7 + rr() * 2.9;
        m4.makeScale(1, 1, 1).setPosition(Math.cos(a) * r, y, Math.sin(a) * r - 2); lamps.setMatrixAt(i, m4); lamps.setColorAt(i, new THREE.Color().setHSL(0.09 + rr() * 0.05, 0.6, 0.35 + rr() * 0.4)); }
      g.add(lamps);
      return g;
    },
  },
  /* underground car park, after the first Top Dog night (27.12.2019, the car park under Moscow City): a 6 m circle of hay bales in
     the driving aisle, cold fluorescent light, concrete, columns, parked cars in the bays, dark corners.
     Layout (ARENA frame, circle centre = origin): the aisle runs along x (|z| < 4.05), bays on both sides (4.35 < |z| < 9.3),
     walls at z = ±9.6, columns 0.6 m on a 7.5 m pitch along the bay fronts, ceiling at 3.0 m. Nothing but the bales stands
     within 5 m of the centre; whatever gets between the camera and the fighters is hidden (sync). */
  parking: {
    id: 'parking', label: 'Парковка', desc: 'Подземная парковка, круг из тюков сена', bound: { kind: 'circle', r: 2.55 }, ring: false,
    // soft wall for the knockout ragdoll: inner face of the bales (r), spring k (N/m, shared by the contacts), friction, height of
    // two tiers, depth of a bale, how far a body sinks in before the wall goes hard, normal damping (1/s; hay swallows the bounce)
    wall: { r: 2.72, k: 2.5e4, mu: 0.6, h: 0.9, d: 0.5, give: 0.25, damp: 25, back: 3.45,   // back: the crowd's front row (r 3.7) minus half a chest — see XWorld.solve

      top(x, z) { const i = ((Math.round(Math.atan2(z, x) / (2 * Math.PI / BALE_N)) % BALE_N) + BALE_N) % BALE_N; return BALE_LOW.includes(i) ? this.h / 2 : this.h; } },   // top of the bales at a point of the circle (ARENA frame)
    light: { bg: '#0b0e11', fog: ['#0b0e11', 9, 38], exposure: 0.95, hemi: ['#b4c6d6', '#26282a', 0.34], key: ['#d8f0ff', 48], rim: ['#9cc4ff', 1.9], rim2: ['#cfe4ff', 1.1], fill: ['#eaf4ff', 0.45] },
    build() {
      const R = locRng(77), g = new THREE.Group(), PI = Math.PI;
      const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
      const speck = (c, w, h, n, a) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * a})`; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } };
      const font = px => `900 ${px}px "Big Shoulders Display", Impact, "Arial Black", sans-serif`;
      /* floor: one 4 m concrete tile (noise, blotches, oil drips, hairline cracks, slab joints) repeated over the level */
      const concTex = rep(canvasTex(1024, 1024, (c, w, h) => {
        c.fillStyle = '#6b6d6c'; c.fillRect(0, 0, w, h);
        const blob = (x, y, rx, ry, a, col) => { c.fillStyle = col; for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h]]) { c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); c.fill(); } };
        for (let i = 0; i < 110; i++) blob(R() * w, R() * h, 30 + R() * 150, 20 + R() * 90, R() * 3, `rgba(${R() < 0.6 ? '20,22,24' : '215,216,212'},${0.02 + R() * 0.045})`);
        speck(c, w, h, 60000, 0.1);
        for (let i = 0; i < 16; i++) { const x = R() * w, y = R() * h, r = 6 + R() * 24, gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(18,16,14,.5)'); gr.addColorStop(1, 'rgba(18,16,14,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
        c.strokeStyle = 'rgba(20,20,20,.4)'; c.lineWidth = 1;
        for (let i = 0; i < 7; i++) { let x = R() * w, y = R() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 12; k++) { x += (R() - 0.5) * 60; y += (R() - 0.3) * 50; c.lineTo(x, y); } c.stroke(); }
        c.fillStyle = 'rgba(12,12,12,.6)'; c.fillRect(0, 0, w, 3); c.fillRect(0, 0, 3, h);
      }));
      const floor = staticMesh(geoUvMul(new THREE.PlaneGeometry(64, 26).rotateX(-PI / 2), 16, 6.5), new THREE.MeshStandardMaterial({ map: concTex, roughness: 0.78, envMapIntensity: 0.5 }));
      floor.receiveShadow = true; g.add(floor);
      /* painted markings as geometry (crisp at any distance): faded yellow bay lines and aisle arrows, worn through by a tiled alpha */
      const wearTex = rep(canvasTex(256, 256, (c, w, h) => {
        c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(0,0,0,${0.2 + R() * 0.7})`; c.fillRect(R() * w, R() * h, 1 + R() * 6, 1 + R() * 3); }
        for (let i = 0; i < 26; i++) { c.fillStyle = `rgba(0,0,0,${0.15 + R() * 0.3})`; c.beginPath(); c.ellipse(R() * w, R() * h, 6 + R() * 26, 4 + R() * 14, R() * 3, 0, 7); c.fill(); }
      }));
      const marks = [], YEL = '#d8ad2e';
      for (const sz of [-1, 1]) for (let k = 0; k < 24; k++) marks.push(new THREE.PlaneGeometry(0.12, 4.95).rotateX(-PI / 2).translate(-28.75 + 2.5 * k, 0, sz * 6.825));
      { const s = new THREE.Shape(); for (const [i, [x, y]] of [[-1.3, -0.09], [0.45, -0.09], [0.45, -0.34], [1.3, 0], [0.45, 0.34], [0.45, 0.09], [-1.3, 0.09]].entries()) i ? s.lineTo(x, y) : s.moveTo(x, y);
        for (const [x, z, ry] of [[0.1, 0, 0], [10, 0.3, 0], [-10, -0.3, 0], [19, 0, 0], [-19, 0, 0]]) marks.push(new THREE.ShapeGeometry(s).rotateX(-PI / 2).rotateY(ry).translate(x, 0, z)); }
      const markM = staticMesh(geoTint(geoUvXZ(geoMerge(marks), 0.9), YEL).translate(0, 0.0012, 0), new THREE.MeshStandardMaterial({ map: wearTex, vertexColors: true, transparent: true, opacity: 0.82, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      markM.receiveShadow = true; markM.renderOrder = -2; g.add(markM);
      /* oil stains under the cars and in the aisle, drain grates */
      const oilTex = canvasTex(256, 256, (c, w, h) => { for (let i = 0; i < 9; i++) { const x = w * (0.3 + R() * 0.4), y = h * (0.3 + R() * 0.4), r = w * (0.12 + R() * 0.2), gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(14,13,12,.55)'); gr.addColorStop(0.7, 'rgba(14,13,12,.3)'); gr.addColorStop(1, 'rgba(14,13,12,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); } });
      const oil = staticMesh(geoMerge([[-2.4, -5.7, 1.5], [2.3, -5.5, 1.2], [7.4, -5.9, 1.4], [2.6, 5.8, 1.3], [-5.2, 5.6, 1.6], [1.25, -0.95, 0.8], [-5.6, 1.6, 1.5], [12, -1.2, 1.8]].map(([x, z, s]) => new THREE.PlaneGeometry(s, s * 0.8).rotateX(-PI / 2).rotateY(R() * 6).translate(x, 0.0008, z))),
        new THREE.MeshStandardMaterial({ map: oilTex, transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      oil.receiveShadow = true; oil.renderOrder = -3; g.add(oil);
      const grateTex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#3a3d40'; c.fillRect(0, 0, w, h); c.fillStyle = '#0b0c0d'; for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) c.fillRect(12 + j * 54, 12 + i * 18, 48, 10); c.strokeStyle = '#5b5f63'; c.lineWidth = 5; c.strokeRect(3, 3, w - 6, h - 6); });
      const grate = staticMesh(geoMerge([[-1.3, 1.15], [6.2, -1.4], [-9, 1.2]].map(([x, z]) => new THREE.PlaneGeometry(0.5, 0.5).rotateX(-PI / 2).translate(x, 0.0016, z))), new THREE.MeshStandardMaterial({ map: grateTex, roughness: 0.5, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      grate.receiveShadow = true; g.add(grate);
      /* walls (single-sided, so a camera that backs through one sees the scene): bare concrete above, a painted dado below */
      const wallTex = rep(canvasTex(512, 512, (c, w, h) => {
        c.fillStyle = '#727574'; c.fillRect(0, 0, w, h); c.fillStyle = '#3d4549'; c.fillRect(0, h * 0.6, w, h * 0.4); c.fillStyle = '#b98f22'; c.fillRect(0, h * 0.6 - 9, w, 9);
        speck(c, w, h, 22000, 0.1);
        for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h * 0.5, l = 60 + R() * 260, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, `rgba(20,20,18,${0.08 + R() * 0.14})`); gr.addColorStop(1, 'rgba(20,20,18,0)'); c.fillStyle = gr; c.fillRect(x, y, 3 + R() * 14, l); }
        c.fillStyle = 'rgba(10,10,10,.45)'; c.fillRect(0, 0, 2, h);
      }));
      const wallG = (len, ry, x, z) => geoUvMul(new THREE.PlaneGeometry(len, 3), len / 4, 1).rotateY(ry).translate(x, 1.5, z);
      g.add(staticMesh(geoMerge([wallG(64, 0, 0, -9.6), wallG(64, PI, 0, 9.6), wallG(19.2, PI / 2, -32, 0), wallG(19.2, -PI / 2, 32, 0)]), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, envMapIntensity: 0.4 })));
      /* ceiling with beams (hidden when the camera goes above it — the top-down replay shot), pipes, a duct, the lamps */
      const ceil = this.ceil = new THREE.Group(); g.add(ceil);
      const colX = [-26.25, -18.75, -11.25, -3.75, 3.75, 11.25, 18.75, 26.25], colZ = [-4.05, 4.05];
      const shell = [geoUvMul(new THREE.PlaneGeometry(64, 19.2).rotateX(PI / 2).translate(0, 3, 0), 16, 4.8)];
      for (const x of colX) shell.push(geoBox(0.5, 0.4, 19.2, x, 2.8, 0)); for (const z of colZ) shell.push(geoBox(64, 0.46, 0.62, 0, 2.77, z));
      ceil.add(staticMesh(geoMerge(shell), new THREE.MeshStandardMaterial({ map: concTex, color: '#8f9192', roughness: 0.95, envMapIntensity: 0.3 })));
      const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
      ceil.add(staticMesh(geoMerge([geoTint(new THREE.CylinderGeometry(0.045, 0.045, 64, 8).rotateZ(PI / 2).translate(0, 2.45, -9.42), '#8a1f1a'), geoTint(new THREE.CylinderGeometry(0.03, 0.03, 64, 8).rotateZ(PI / 2).translate(0, 2.52, -3.42), '#7d8286'),
        geoTint(geoBox(64, 0.3, 0.5, 0, 2.42, 3.1), '#868d92'), geoTint(new THREE.CylinderGeometry(0.045, 0.045, 64, 8).rotateZ(PI / 2).translate(0, 2.5, 8.9), '#9a1f1a')]), propMat));
      // fluorescent tubes: dashed lines along the aisle, sparser rows over the bays; a few are dead
      const tubes = [], tubeCol = new THREE.Color();
      for (const z of [-1.9, 1.9]) for (let k = -8; k < 8; k++) tubes.push([1.875 + 3.75 * k, z]); for (const z of [-6.9, 6.9]) for (let k = -4; k <= 4; k++) tubes.push([7.5 * k, z]);
      const tubeM = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.05, 0.1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), tubes.length), m4 = new M4();
      tubes.forEach(([x, z], i) => { tubeM.setMatrixAt(i, m4.makeTranslation(x, 2.95, z)); const dead = Math.abs(x) > 6 && R() < 0.16; tubeM.setColorAt(i, dead ? tubeCol.setRGB(0.1, 0.11, 0.12) : tubeCol.setRGB(2.1, 2.6, 2.9)); });
      tubeM.matrixAutoUpdate = false; tubeM.frustumCulled = false; ceil.add(tubeM);
      /* columns: concrete, a yellow-black band at the bottom, the level badge at eye height (one texture on all four faces) */
      const colTex = canvasTex(256, 1024, (c, w, h) => {
        const py = m => h - m * h / 3;   // metres above the floor → pixel row
        c.fillStyle = '#8e908f'; c.fillRect(0, 0, w, h); speck(c, w, h, 16000, 0.1);
        c.save(); c.beginPath(); c.rect(0, py(1.0), w, h); c.clip(); c.fillStyle = '#d6a916'; c.fillRect(0, py(1.0), w, h);
        c.fillStyle = '#15161a'; for (let i = -6; i < 12; i++) { c.beginPath(); c.moveTo(i * 90, h); c.lineTo(i * 90 + 45, h); c.lineTo(i * 90 + 45 + 380, py(1.0)); c.lineTo(i * 90 + 380, py(1.0)); c.fill(); }
        c.restore();
        c.fillStyle = '#1d4e96'; c.fillRect(28, py(2.3), w - 56, py(1.7) - py(2.3)); c.fillStyle = '#eef1f4'; c.font = font(170); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('-2', w / 2, (py(2.3) + py(1.7)) / 2 + 8);
        c.globalCompositeOperation = 'source-atop'; for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(120,122,120,${0.3 + R() * 0.6})`; c.fillRect(R() * w, py(2.35) + R() * (h - py(2.35)), 1 + R() * 7, 1 + R() * 4); }
        for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(20,20,20,${0.1 + R() * 0.25})`; c.fillRect(R() * w, h - R() * 70, 4 + R() * 40, 3 + R() * 10); }
      });
      this.cols = []; for (const x of colX) for (const z of colZ) this.cols.push({ p: new V3(x, 1.5, z), mat: new M4().makeTranslation(x, 1.5, z), h: false });
      const colM = this.colMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 3, 0.6), new THREE.MeshStandardMaterial({ map: colTex, roughness: 0.9, envMapIntensity: 0.4 }), this.cols.length);
      this.cols.forEach((c, i) => colM.setMatrixAt(i, c.mat)); colM.matrixAutoUpdate = false; colM.frustumCulled = false; this.zero = new M4().makeScale(0, 0, 0); g.add(colM);
      /* signs on the back wall: the level number painted big, a fire door with a glowing green «ВЫХОД» over it; wheel stops in the bays */
      const lvlTex = canvasTex(512, 384, (c, w, h) => { c.fillStyle = 'rgba(226,190,60,.9)'; c.font = font(330); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('-2', w / 2, h / 2 + 14);
        c.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(0,0,0,${0.2 + R() * 0.6})`; c.fillRect(R() * w, R() * h, 1 + R() * 8, 1 + R() * 3); } });
      const lvlMat = new THREE.MeshStandardMaterial({ map: lvlTex, transparent: true, roughness: 0.85, depthWrite: false });
      g.add(staticMesh(geoMerge([new THREE.PlaneGeometry(2.1, 1.58).translate(-1.6, 1.95, -9.585), new THREE.PlaneGeometry(2.1, 1.58).rotateY(PI).translate(1.6, 1.95, 9.585)]), lvlMat));
      const exitTex = canvasTex(256, 96, (c, w, h) => { c.fillStyle = '#0b9a50'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e9fff2'; c.lineWidth = 4; c.strokeRect(5, 5, w - 10, h - 10); c.fillStyle = '#f2fff7'; c.font = 'bold 54px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ВЫХОД', w / 2, h / 2 + 3); });
      g.add(staticMesh(new THREE.PlaneGeometry(0.72, 0.27).translate(2.0, 2.33, -9.52), new THREE.MeshBasicMaterial({ map: exitTex, color: new THREE.Color(1.7, 1.7, 1.7) })));
      const glowTex = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(40,255,140,.8)'); gr.addColorStop(0.35, 'rgba(30,220,110,.3)'); gr.addColorStop(1, 'rgba(20,200,90,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
      g.add(staticMesh(new THREE.PlaneGeometry(3.0, 2.2).translate(2.0, 2.2, -9.58), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 })));
      const props = [geoTint(geoBox(0.95, 2.05, 0.06, 2.0, 1.025, -9.58), '#39424a'), geoTint(geoBox(1.11, 2.13, 0.04, 2.0, 1.065, -9.59), '#23282d'), geoTint(geoBox(0.04, 0.16, 0.05, 2.36, 1.02, -9.53), '#9aa0a5'), geoTint(geoBox(0.56, 0.2, 0.06, 2.0, 2.33, -9.56), '#101412')];
      for (const sz of [-1, 1]) for (let k = -5; k <= 5; k++) props.push(geoTint(geoBox(1.7, 0.1, 0.15, 2.5 * k, 0.05, sz * 8.9), k % 2 ? '#c29d24' : '#1c1d20'));
      g.add(staticMesh(geoMerge(props), propMat));
      /* parked cars: a side profile extruded across the width (bevelled), a glass band a hair outside the cabin, wheels, lights */
      const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.45 });
      const KIND = {
        sedan: { W: 1.74, wx: 1.38, wr: 0.32, pts: [[-2.25, 0.3], [-2.25, 0.62], [-2.08, 0.74], [-0.95, 0.88], [-0.3, 1.38], [0.9, 1.4], [1.55, 0.98], [2.15, 0.95], [2.25, 0.72], [2.25, 0.3]] },
        suv: { W: 1.86, wx: 1.42, wr: 0.37, pts: [[-2.3, 0.38], [-2.3, 0.82], [-2.1, 0.98], [-1.0, 1.06], [-0.5, 1.66], [1.7, 1.7], [2.2, 1.12], [2.3, 0.82], [2.3, 0.38]] },
        hatch: { W: 1.7, wx: 1.22, wr: 0.3, pts: [[-1.95, 0.3], [-1.95, 0.62], [-1.8, 0.74], [-0.85, 0.86], [-0.3, 1.4], [1.2, 1.42], [1.82, 0.96], [1.95, 0.7], [1.95, 0.3]] },
      };
      const shapeOf = pts => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); return s; };
      const lx = (a, b, y) => a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
      this.cars = [];
      const car = (kind, col, x, z, ry) => {
        const K = KIND[kind], P = K.pts, W = K.W, L = -P[0][0], n = P.length, y0 = P[3][1] + 0.05, y1 = P[4][1] - 0.05, gs = [];
        gs.push(geoTint(new THREE.ExtrudeGeometry(shapeOf(P), { depth: W - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelOffset: -0.05, bevelSegments: 2 }).translate(0, 0, -(W - 0.1) / 2).rotateY(PI / 2), col));
        gs.push(geoTint(new THREE.ExtrudeGeometry(shapeOf([[lx(P[3], P[4], y0) - 0.02, y0], [lx(P[3], P[4], y1) - 0.02, y1], [lx(P[5], P[6], y1) + 0.02, y1], [lx(P[5], P[6], y0) + 0.02, y0]]), { depth: W + 0.02, bevelEnabled: false }).translate(0, 0, -(W + 0.02) / 2).rotateY(PI / 2), '#0a0f14'));
        for (const sx of [-1, 1]) {
          gs.push(geoTint(geoBox(0.03, y1 - y0 + 0.06, 0.09, sx * (W / 2 + 0.006), (y0 + y1) / 2, -(P[4][0] + P[5][0]) / 2 - 0.1), col));   // B-pillar
          for (const sz of [-1, 1]) { gs.push(geoTint(new THREE.CylinderGeometry(K.wr, K.wr, 0.2, 18).rotateZ(PI / 2).translate(sx * (W / 2 - 0.08), K.wr, sz * K.wx), '#0d0d0f')); gs.push(geoTint(new THREE.CylinderGeometry(K.wr * 0.56, K.wr * 0.56, 0.214, 14).rotateZ(PI / 2).translate(sx * (W / 2 - 0.08), K.wr, sz * K.wx), '#8d9296')); }
          gs.push(geoTint(geoBox(0.38, 0.1, 0.06, sx * (W / 2 - 0.3), P[1][1] - 0.04, L - 0.012), '#e8eef2')); gs.push(geoTint(geoBox(0.34, 0.1, 0.06, sx * (W / 2 - 0.28), P[n - 2][1] - 0.02, -(P[n - 1][0] - 0.012)), '#8a0f14'));
        }
        gs.push(geoTint(geoBox(0.5, 0.11, 0.03, 0, 0.44, L + 0.002), '#dfe2e4')); gs.push(geoTint(geoBox(W - 0.2, 0.16, 0.05, 0, 0.36, L - 0.005), '#16181b'));
        const m = staticMesh(geoMerge(gs).rotateY(ry).translate(x, 0, z), carMat); g.add(m); this.cars.push({ m, p: new V3(x, 0.7, z) });
      };
      car('sedan', '#d9dcde', -2.5, -6.95, 0); car('suv', '#101114', 2.5, -6.95, 0); car('hatch', '#8e1418', 7.5, -6.7, 0);
      car('hatch', '#1f4f9c', 2.5, 6.7, PI); car('sedan', '#8f959b', -5.0, 6.95, PI);
      /* the circle: 21 hay bales (0.9 × 0.45 × 0.45) on a 3 m radius, slightly askew, a second tier on most; one mesh per stack so
         the stacks between the camera and the fighters can be hidden; loose straw around them */
      const strawTex = canvasTex(256, 128, (c, w, h) => {
        c.fillStyle = '#a98a3a'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 3200; i++) { const x = R() * w, y = R() * h, l = 8 + R() * 34, a = (R() - 0.5) * 0.6; c.strokeStyle = `hsla(${38 + R() * 14},${40 + R() * 35}%,${32 + R() * 44}%,${0.35 + R() * 0.5})`; c.lineWidth = 0.6 + R() * 1.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
        for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '60,40,10' : '235,210,130'},${0.05 + R() * 0.1})`; c.beginPath(); c.ellipse(R() * w, R() * h, 10 + R() * 40, 4 + R() * 12, (R() - 0.5) * 0.4, 0, 7); c.fill(); }
        for (let i = 0; i < 260; i++) { const x = R() * w, y = R() * h, l = 30 + R() * 70, a = (R() - 0.5) * 0.35; c.strokeStyle = `hsla(${40 + R() * 10},${50 + R() * 30}%,${R() < 0.4 ? 22 + R() * 14 : 62 + R() * 22}%,${0.5 + R() * 0.4})`; c.lineWidth = 1.2 + R() * 1.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
        c.fillStyle = 'rgba(190,96,30,.8)'; c.fillRect(0, h * 0.3, w, 2); c.fillRect(0, h * 0.7, w, 2);   // twine
      });
      const baleMat = new THREE.MeshStandardMaterial({ map: strawTex, roughness: 1, envMapIntensity: 0.25 });
      this.stacks = [];
      for (let i = 0; i < BALE_N; i++) {
        const a = i * 2 * PI / BALE_N, ca = Math.cos(a), sa = Math.sin(a), gs = [];
        for (let t = 0; t < (BALE_LOW.includes(i) ? 1 : 2); t++) { const rj = BALE_R + (R() - 0.5) * (t ? 0.09 : 0.04), tj = (R() - 0.5) * (t ? 0.12 : 0.03); gs.push(geoBox(0.9, 0.45, 0.45, rj * ca - tj * sa, 0.225 + 0.45 * t, rj * sa + tj * ca, PI / 2 - a + (R() - 0.5) * (t ? 0.2 : 0.07))); }
        const m = staticMesh(geoMerge(gs), baleMat); m.receiveShadow = true; g.add(m); this.stacks.push({ m, p: new V3(BALE_R * ca, 0.45, BALE_R * sa), o: new V3(ca, 0, sa) });
      }
      const looseTex = canvasTex(1024, 1024, (c, w, h) => {   // 8 × 8 m: straw trampled around the bales, a little inside the circle
        for (let i = 0; i < 4200; i++) { const a = R() * 2 * PI, u = R(), r = (u < 0.86 ? 2.5 + R() * 1.1 + (R() - 0.5) * 0.5 : R() * 2.6) * w / 8, x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r, l = 4 + R() * 13, b = R() * 2 * PI;
          c.strokeStyle = `hsla(${38 + R() * 14},${45 + R() * 30}%,${26 + R() * 30}%,${0.35 + R() * 0.5})`; c.lineWidth = 0.7 + R() * 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); c.stroke(); }
      });
      const loose = staticMesh(new THREE.PlaneGeometry(8, 8).rotateX(-PI / 2).translate(0, 0.002, 0), new THREE.MeshStandardMaterial({ map: looseTex, transparent: true, roughness: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      loose.receiveShadow = true; loose.renderOrder = -1; g.add(loose);
      /* light: a cold pool over the circle from the lamps above it (the shared `key` gives the fighters' shadows), three shadowless
         point lights where the tubes are so the cars, the wall and the far aisle read; everything else falls off into the dark fog */
      const top = new THREE.SpotLight('#d8f0ff', 24, 10, 1.15, 0.9, 1.4); top.position.set(0, 2.92, 0); top.target.position.set(0, 0, 0); g.add(top, top.target);
      for (const [x, z, k] of [[0, -6.9, 15], [-9.4, 0, 12], [9.4, 0, 12]]) { const p = new THREE.PointLight('#d6ecff', k, 15, 1.6); p.position.set(x, 2.6, z); g.add(p); }
      /* the crowd behind the bales: three rows (the back ones on crates), nobody inside the cars or the columns */
      const carsAt = [[-2.5, -1], [2.5, -1], [7.5, -1], [2.5, 1], [-5, 1]];
      this.crowd = makeCrowd({ shape: 'circle', r: 3.7, rows: 3, look: 'street', seed: 23,
        keep: (x, z) => !(Math.abs(Math.abs(x) - 3.75) < 0.6 && Math.abs(Math.abs(z) - 4.05) < 0.6) && !carsAt.some(([cx, s]) => z * s > 4.4 && Math.abs(x - cx) < 1.15) });
      g.add(this.crowd.group);
      return g;
    },
    // per frame, after the camera: hide what stands between the camera and the fighters (as arenaSync does with the near ropes)
    sync() {
      const M = ARENA.matrixWorld, cam = camera.position;
      // bale stacks: hidden once the camera is outside (or nearly at) their side of the circle
      for (const s of this.stacks) { _lp.copy(s.p).applyMatrix4(M); _lt.copy(s.o).transformDirection(M); s.m.visible = _lc.subVectors(cam, _lp).dot(_lt) < -0.3; }
      this.ceil.visible = cam.y < 2.55;
      // cars and columns: hidden while inside the view wedge in front of what the camera looks at
      const dx = camL.x - cam.x, dz = camL.z - cam.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, tH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect * 1.1;
      const hid = (p, r) => { _lp.copy(p).applyMatrix4(M); const px = _lp.x - cam.x, pz = _lp.z - cam.z, s = px * ux + pz * uz; return s > -r && s < len - 0.5 && Math.abs(px * uz - pz * ux) - r < Math.max(s, 0) * tH + 0.3; };
      for (const c of this.cars) c.m.visible = !hid(c.p, 2.45);
      let ch = false; this.cols.forEach((c, i) => { const h = hid(c.p, 0.45); if (h !== c.h) { c.h = h; this.colMesh.setMatrixAt(i, h ? this.zero : c.mat); ch = true; } });
      if (ch) this.colMesh.instanceMatrix.needsUpdate = true;
    },
  },
};
let LOC = LOCS.gym;
/* switch the location: build its set on first use, show it (and the ring props if it has a ring), retune the shared lights */
function setLocation(id) {
  const L = LOCS[id] || LOCS.gym, was = LOC; LOC = L;
  if (!L.group) { L.group = L.build(); ARENA.add(L.group); }
  for (const o of Object.values(LOCS)) { if (o.group) o.group.visible = o === L; for (const w of o.world || []) w.visible = o === L; }
  RINGSET.visible = L.ring;
  const li = L.light; scene.background.set(li.bg); scene.fog.color.set(li.fog[0]); scene.fog.near = li.fog[1]; scene.fog.far = li.fog[2]; renderer.toneMappingExposure = li.exposure;
  hemi.color.set(li.hemi[0]); hemi.groundColor.set(li.hemi[1]); hemi.intensity = li.hemi[2];
  for (const [l, v] of [[key, li.key], [rim, li.rim], [rim2, li.rim2], [fill, li.fill]]) { l.color.set(v[0]); l.intensity = v[1]; }
  if (was !== L) FX.clearFloor();   // floor stains belong to the floor they fell on
  ARENA.updateMatrixWorld(true);
}
function locSync() { if (LOC.sync && LOC.group) LOC.sync(); }
