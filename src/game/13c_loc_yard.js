/* ───────── location «Двор»: a yard between nine-storey panel blocks at dusk, a ring of people instead of ropes ─────────
   Layout (ARENA frame, circle centre = origin, the default camera looks from +z):
     house A — façade z = −15, x −26.8 … 2 (entrances with a canopy and a lamp at x = −18.8 and −6), its front garden and a row of parked cars;
     house B — façade x = 14, z −27 … −1.4;  house C — façade z = 19, x −14.4 … 14.4;  between A and B the yard opens to the sunset;
     the −x side: playground (sandbox with a «mushroom», swings, slide, carpet rack), a row of shell garages at x = −20.5;
     street lamps: L0 by the circle (the sodium key of the set, a real spot light), L1 / L3 (point lights), L2 over the playground (glow only).
   Nothing but the crowd stands within 5.9 m of the centre; what stands within 10 m is its own mesh and is hidden when it gets between the
   camera and the fighters (`near`, as the parking does with its cars). Everything farther is merged: façades = one mesh (windows are a
   texture + an emissive map), blank end walls = one mesh, all props = one mesh, all far cars = one mesh.
   The camera's far plane is 40 m, so the sky (a vertex-coloured dome) and the skyline (a painted strip) are drawn first without depth
   and follow the camera (`far`): they are «infinitely far» and nothing real stands farther than ~34 m from the centre.
   Texture sizes, far lamps and the breath follow GFX.level / GFX.particles; the crowd follows GFX.crowd (14_crowd.js). */
const YARD_BAYS = 'wbswbwsb', YARD_H = 27.4;   // the façade texture: 8 bays of 3.2 m (window / balcony / staircase), plinth 1 m + 9 floors of 2.8 m + parapet

LOCS.yard = {
  id: 'yard', label: 'Двор', desc: 'Двор панельных домов, сумерки, круг из людей', bound: { kind: 'circle', r: 2.5 }, ring: false,
  /* the people are the wall (XWorld.solve): r = the chests of the front row (they stand at 3.15 m), a soft spring — 2.5 times softer than
     the hay bales of the parking (k 1.0e4 against 2.5e4 N/m) — that lets a body sink 0.45 m into the row before it goes hard, and little
     damping (9 1/s, as the ropes; the hay has 25), so the row gives, catches the man and pushes him back. h is above any head: nobody is
     folded over the top of a standing crowd, the body slides down the people to the asphalt. */
  wall: { r: 2.85, k: 1.0e4, mu: 0.75, h: 2.1, d: 1.2, give: 0.45, damp: 9, top() { return this.h; } },
  // dusk: the sodium lamp is the key (the shared shadow light) and the warm rim, the sky fills cold
  light: { bg: '#232338', fog: ['#2c2a42', 16, 64], exposure: 1.0, hemi: ['#6f86cc', '#33261c', 0.62], key: ['#ffae62', 44], rim: ['#ff9a48', 1.5], rim2: ['#7f9dff', 2.0], fill: ['#93a9ee', 0.5] },
  build() {
    const R = locRng(1313), g = new THREE.Group(), PI = Math.PI, lite = lowEnd || GFX.level === 'low';
    const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const pick = a => a[(R() * a.length) | 0];
    const speck = (c, w, h, n, a) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * a})`; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } };
    const flat = (w, d, x, z, y, ry = 0) => new THREE.PlaneGeometry(w, d).rotateX(-PI / 2).rotateY(ry).translate(x, y, z);
    const tb = (col, w, h, d, x, y, z, ry) => geoTint(geoBox(w, h, d, x, y, z, ry), col);   // tinted box, centre at x y z
    const tcyl = (col, r0, r1, hgt, x, y, z, seg = 8) => geoTint(new THREE.CylinderGeometry(r1, r0, hgt, seg).translate(x, y + hgt / 2, z), col);   // tinted post standing on y
    const put = (gs, x, z, ry = 0) => gs.map(q => q.rotateY(ry).translate(x, 0, z));   // a prop built around its own origin (front = +z) → its place
    const at = (x, z, ry, lz, y) => new V3(x + lz * Math.sin(ry), y, z + lz * Math.cos(ry));   // where the prop's local point (0, y, lz) ends up
    const shapeOf = pts => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); return s; };
    const props = [], lampGs = [], near = this.near = [];

    /* ── sky: a dome of vertex colours (no texture, no banding): dark blue above, orange at the horizon on the sunset side (between
       houses A and B), violet-blue on the far side; and the skyline: distant blocks with lit windows, bare trees, far lamps ── */
    const far = this.far = new THREE.Group(); g.add(far);
    {
      const ST = [[-12, '#1b1a26', '#17171f'], [-1, '#40282a', '#20202e'], [0, '#ff8c38', '#4c4768'], [1.5, '#ff7a34', '#46456f'], [3.5, '#ea603a', '#3b4070'], [6, '#b44b5a', '#2e3667'],
        [9, '#72457a', '#242d5d'], [13, '#403c7a', '#1b2551'], [20, '#252e64', '#151d45'], [32, '#151d49', '#0f1637'], [55, '#0b1230', '#0a1029'], [90, '#080d24', '#080d24']];
      const NS = 64, RAD = 33, gx = 0.35 / Math.hypot(0.35, 0.94), gz = -0.94 / Math.hypot(0.35, 0.94), pos = [], col = [], idx = [], ca = new THREE.Color(), cb = new THREE.Color();
      ST.forEach(([el, glow, dark]) => {
        const e = el * PI / 180;
        for (let j = 0; j <= NS; j++) {
          const a = j / NS * 2 * PI, x = Math.cos(a), z = Math.sin(a), w = Math.pow(0.5 + 0.5 * (x * gx + z * gz), 1.6);
          ca.set(dark).lerp(cb.set(glow), w).multiplyScalar(1 + (el >= 0 ? 1.1 * w * Math.exp(-el / 5) : 0));
          pos.push(RAD * Math.cos(e) * x, 1.1 + RAD * Math.sin(e), RAD * Math.cos(e) * z); col.push(ca.r, ca.g, ca.b);
        }
      });
      for (let i = 0; i < ST.length - 1; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j, b = a + NS + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); sg.setIndex(idx);
      const sky = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false, depthTest: false, depthWrite: false }));
      sky.renderOrder = -60; sky.frustumCulled = false; far.add(sky);
      // the strip: 120° of horizon per repeat, elevation −2° … 9.5° (eye height 1.1 m, radius 32.5 m)
      const lineTex = canvasTex(lite ? 2048 : 4096, 256, (c, w, h) => {
        const deg = w / 120, ey = el => h * (1 - (1.1 + 32.5 * Math.tan(el * PI / 180)) / 6.6), fl = ey(0) - ey(0.8), LIT = ['#ffc878', '#ffb458', '#ffe2b4', '#b4d0ff', '#ffa050'];
        for (let x = 0; x < w - 8 * deg;) { const wd = (2 + R() * 5) * deg, el = 1.2 + R() * 2.4; c.fillStyle = '#39334f'; c.fillRect(x, ey(el), wd, h);   // far row, in the haze
          for (let yy = ey(el) + 3; yy < ey(0.3); yy += fl * 0.5) for (let xx = x + 2; xx < x + wd - 3; xx += deg * 0.42) if (R() < 0.2) { c.fillStyle = pick(LIT); c.globalAlpha = 0.55; c.fillRect(xx, yy, deg * 0.16, fl * 0.2); c.globalAlpha = 1; }
          x += wd + R() * 2.5 * deg; }
        for (let x = R() * 3 * deg; x < w - 12 * deg;) { const wd = (4 + R() * 6) * deg, el = 3.8 + R() * 4.2; c.fillStyle = '#1e1f2e'; c.fillRect(x, ey(el), wd, h); c.fillRect(x + wd * 0.3, ey(el) - 4, wd * 0.12, 5);   // near row: 9–16 storeys
          for (let yy = ey(el) + fl * 0.5; yy < ey(0.5); yy += fl) for (let xx = x + deg * 0.3; xx < x + wd - deg * 0.5; xx += deg * 0.9) if (R() < 0.3) { c.fillStyle = pick(LIT); c.fillRect(xx, yy, deg * 0.42, fl * 0.45); }
          x += wd + (2 + R() * 13) * deg; }
        c.strokeStyle = '#181722'; c.lineCap = 'round';
        for (let i = 0; i < 70; i++) { const x = R() * w, top = 1 + R() * 2.2; c.lineWidth = 2; c.beginPath(); c.moveTo(x, ey(0)); c.lineTo(x, ey(top * 0.45)); c.stroke(); c.lineWidth = 1;   // bare trees
          for (let k = 0; k < 14; k++) { const y0 = top * (0.3 + R() * 0.3), a = (R() - 0.5) * 1.6; c.beginPath(); c.moveTo(x + (R() - 0.5) * 3, ey(y0)); c.lineTo(x + Math.sin(a) * deg * top * 0.5, ey(y0 + Math.cos(a) * top * (0.3 + R() * 0.35))); c.stroke(); } }
        c.fillStyle = '#191a26'; c.fillRect(0, ey(0.3), w, h);
        for (let i = 0; i < 46; i++) { const x = R() * w, y = ey(0.5 + R() * 0.9), gr = c.createRadialGradient(x, y, 0, x, y, 5); gr.addColorStop(0, 'rgba(255,190,110,1)'); gr.addColorStop(0.4, 'rgba(255,150,70,.5)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); c.fillStyle = gr; c.fillRect(x - 5, y - 5, 10, 10); }
      });
      lineTex.wrapS = THREE.RepeatWrapping;
      const line = new THREE.Mesh(geoUvMul(new THREE.CylinderGeometry(32.5, 32.5, 6.6, 96, 1, true).translate(0, 3.3, 0), 3, 1),
        new THREE.MeshBasicMaterial({ map: lineTex, color: new THREE.Color(1.5, 1.5, 1.5), alphaTest: 0.5, side: THREE.BackSide, fog: false, depthTest: false, depthWrite: false }));
      line.renderOrder = -55; line.frustumCulled = false; far.add(line);
    }

    /* ── ground: one 5 m asphalt tile (aggregate, blotches, cracks, a patch) over the whole yard; over the middle a layer of things that
       do not repeat (repairs, long cracks, a manhole, chalk hopscotch, stains, leaves); puddles; dead lawns behind kerbs ── */
    const asTex = rep(canvasTex(lite ? 512 : 1024, lite ? 512 : 1024, (c, w, h) => {
      c.fillStyle = '#3a3b40'; c.fillRect(0, 0, w, h);
      const blob = (x, y, rx, ry, a, col) => { c.fillStyle = col; for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h]]) { c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, a, 0, 7); c.fill(); } };
      for (let i = 0; i < 90; i++) blob(R() * w, R() * h, (30 + R() * 150) * w / 1024, (20 + R() * 90) * w / 1024, R() * 3, `rgba(${R() < 0.6 ? '12,12,16' : '170,170,172'},${0.03 + R() * 0.05})`);
      speck(c, w, h, w * 70, 0.16);
      for (let i = 0; i < w * 3; i++) { c.fillStyle = `rgba(${150 + R() * 70 | 0},${150 + R() * 60 | 0},${145 + R() * 60 | 0},${0.12 + R() * 0.25})`; c.fillRect(R() * w, R() * h, 1 + R() * 1.6, 1 + R() * 1.6); }   // stones in the mix
      c.fillStyle = 'rgba(18,18,20,.3)'; c.fillRect(w * 0.55, h * 0.12, w * 0.3, h * 0.22); c.strokeStyle = 'rgba(6,6,8,.5)'; c.lineWidth = 2; c.strokeRect(w * 0.55, h * 0.12, w * 0.3, h * 0.22);
      c.strokeStyle = 'rgba(6,6,8,.6)';
      for (let i = 0; i < 9; i++) { let x = R() * w, y = R() * h, a = R() * 6.3; c.lineWidth = 1 + R() * 1.4; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 14; k++) { a += (R() - 0.5) * 1.2; x += Math.cos(a) * w * 0.03; y += Math.sin(a) * w * 0.03; c.lineTo(x, y); } c.stroke(); }
    }));
    const floor = staticMesh(geoUvMul(new THREE.PlaneGeometry(84, 84).rotateX(-PI / 2), 16.8, 16.8), new THREE.MeshStandardMaterial({ map: asTex, roughness: 0.8, envMapIntensity: 0.35 }));
    floor.receiveShadow = true; g.add(floor);
    const markTex = canvasTex(lite ? 512 : 1024, lite ? 512 : 1024, (c, w, h) => {
      const s = w / 14; c.setTransform(s, 0, 0, s, w / 2, h / 2);   // metres: a top-down map of the middle 14 × 14 m, x to the right, z down
      for (const [x, z, ww, hh, a] of [[-3.4, -1.3, 2.6, 1.7, 0.2], [1.7, 1.9, 3.2, 1.3, -0.1], [3.3, -4.4, 1.8, 2.4, 0.5], [-4.6, 4.6, 2.2, 2.0, -0.3]]) {
        c.save(); c.translate(x, z); c.rotate(a); c.fillStyle = 'rgba(12,12,14,.42)'; c.fillRect(-ww / 2, -hh / 2, ww, hh); c.strokeStyle = 'rgba(4,4,5,.6)'; c.lineWidth = 0.035; c.strokeRect(-ww / 2, -hh / 2, ww, hh); c.restore(); }
      c.strokeStyle = 'rgba(5,5,7,.75)';
      for (let i = 0; i < 8; i++) { let x = (R() - 0.5) * 12, z = (R() - 0.5) * 12, a = R() * 6.3; c.lineWidth = 0.012 + R() * 0.02; c.beginPath(); c.moveTo(x, z); for (let k = 0; k < 18; k++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * 0.3; z += Math.sin(a) * 0.3; c.lineTo(x, z); } c.stroke(); }
      { const x = 1.3, z = -1.55; c.fillStyle = '#131416'; c.beginPath(); c.arc(x, z, 0.37, 0, 7); c.fill(); c.strokeStyle = '#46484b'; c.lineWidth = 0.03;   // manhole cover
        for (const r of [0.31, 0.2, 0.08]) { c.beginPath(); c.arc(x, z, r, 0, 7); c.stroke(); }
        for (let k = 0; k < 12; k++) { const a = k * PI / 6; c.beginPath(); c.moveTo(x + Math.cos(a) * 0.1, z + Math.sin(a) * 0.1); c.lineTo(x + Math.cos(a) * 0.29, z + Math.sin(a) * 0.29); c.stroke(); } }
      c.save(); c.translate(-1.2, 1.05); c.rotate(-0.55); c.scale(0.01, 0.01); c.strokeStyle = c.fillStyle = 'rgba(232,230,216,.55)'; c.lineWidth = 3.2; c.font = '26px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';   // «классики» in chalk
      [[0, 0], [0, 1], [-0.5, 2], [0.5, 2], [0, 3], [-0.5, 4], [0.5, 4], [0, 5]].forEach(([cx, cy], i) => { c.strokeRect(cx * 44 - 22, cy * 44 - 22, 44, 44); c.fillText(String(i + 1), cx * 44, cy * 44 + 2); });
      c.restore();
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out';   // everything painted here is worn
      for (let i = 0; i < w * 5; i++) { c.fillStyle = `rgba(0,0,0,${0.2 + R() * 0.6})`; c.fillRect(R() * w, R() * h, 1 + R() * 4, 1 + R() * 2); }
      c.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h, r = (8 + R() * 34) * w / 1024, gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,9,9,.45)'); gr.addColorStop(1, 'rgba(10,9,9,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
      for (let i = 0; i < 420; i++) { c.fillStyle = `hsla(${24 + R() * 22},${45 + R() * 30}%,${18 + R() * 20}%,.85)`; c.beginPath(); c.ellipse(R() * w, R() * h, (2 + R() * 2.5) * w / 1024, (1 + R() * 1.2) * w / 1024, R() * 3, 0, 7); c.fill(); }   // last leaves
    });
    const marks = staticMesh(flat(14, 14, 0, 0, 0.0012), new THREE.MeshStandardMaterial({ map: markTex, transparent: true, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    marks.receiveShadow = true; marks.renderOrder = -3; g.add(marks);
    const pudTex = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#07080c'; for (let i = 0; i < 9; i++) { c.beginPath(); c.ellipse(w * (0.35 + R() * 0.3), h * (0.35 + R() * 0.3), w * (0.1 + R() * 0.16), h * (0.07 + R() * 0.12), R() * 3, 0, 7); c.fill(); } });
    const pud = staticMesh(geoMerge([[2.2, 0.7, 1.5], [-0.9, -2.2, 1.1], [5.6, 2.4, 2.3], [-6.6, -3.4, 2.6], [3.4, -7.2, 2.2], [-2.4, 6.6, 2.5], [9.2, -4.2, 3.2], [-11, -7.5, 3], [1.5, 11, 3.4], [8, 9, 2.6]].map(([x, z, s]) => flat(s, s * 0.75, x, z, 0.002, R() * 6))),
      new THREE.MeshStandardMaterial({ map: pudTex, transparent: true, opacity: 0.8, roughness: 0.07, envMapIntensity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    pud.receiveShadow = true; pud.renderOrder = -2; g.add(pud);
    const dirtTex = rep(canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#2a251e'; c.fillRect(0, 0, w, h); speck(c, w, h, 26000, 0.14);
      for (let i = 0; i < 2600; i++) { const x = R() * w, y = R() * h, a = R() * 6.3, l = 3 + R() * 9; c.strokeStyle = `hsla(${52 + R() * 26},${18 + R() * 22}%,${16 + R() * 16}%,.7)`; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
      for (let i = 0; i < 520; i++) { c.fillStyle = `hsla(${22 + R() * 24},${45 + R() * 30}%,${18 + R() * 22}%,.9)`; c.beginPath(); c.ellipse(R() * w, R() * h, 2.5 + R() * 3, 1.3 + R() * 1.5, R() * 3, 0, 7); c.fill(); }
    }));
    // lawns [x0, x1, z0, z1]: the front gardens of A and C (cut by the paths to the doors), the playground, the pit of the near tree
    const LAWN = [[-26.8, -20.2, -14.9, -10.8], [-17.4, -7.4, -14.9, -10.8], [-4.6, 2, -14.9, -10.8], [-17.6, -8.7, -6.2, 7.6], [-14.4, -4.7, 15.4, 18.9], [-1.7, 8.1, 15.4, 18.9], [11.1, 14.4, 15.4, 18.9], [5.5, 7.3, -6.2, -4.4]];
    const lawnGs = [];
    for (const [x0, x1, z0, z1] of LAWN) {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, K = '#716f69';
      lawnGs.push(geoUvXZ(flat(w, d, cx, cz, 0.07), 0.25));
      props.push(tb(K, w + 0.3, 0.13, 0.15, cx, 0.065, z0 - 0.075), tb(K, w + 0.3, 0.13, 0.15, cx, 0.065, z1 + 0.075), tb(K, 0.15, 0.13, d, x0 - 0.075, 0.065, cz), tb(K, 0.15, 0.13, d, x1 + 0.075, 0.065, cz));
    }
    const lawn = staticMesh(geoMerge(lawnGs), new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1, envMapIntensity: 0.2 })); lawn.receiveShadow = true; g.add(lawn);

    /* ── the houses. Every cell (bay × floor) of the façade gets its own random look once (`spec`), then the same picture is drawn
       twice: the colour map and the emissive map (lit windows only: warm lamps, cold TVs, the odd violet grow lamp) ── */
    const LIT = ['#ffc66e', '#ffb04e', '#ffd9a0', '#ffe9c4', '#a9c8ff', '#e6efff', '#ff9a52'], FRAME = ['#d9d8d0', '#d9d8d0', '#6a4a34', '#8f9499', '#c7c2b0'], PARA = ['#5f7f96', '#7b8f7a', '#9a8f78', '#8c5a48', '#7a7f86', '#b3ab98', '#4f6a80'];
    const spec = []; for (let i = 0; i < 72; i++) spec.push({ lit: R() < (YARD_BAYS[(i / 9) | 0] === 's' ? 0.6 : 0.4) ? (R() < 0.04 ? '#d46bff' : pick(LIT)) : null, k: 0.6 + R() * 0.4, cur: R(), frame: pick(FRAME), par: pick(PARA), glazed: R() < 0.72, tone: R(), a: R(), b: R() });
    const facade = em => (c, w, h) => {
      c.fillStyle = em ? '#000' : '#8b8983'; c.fillRect(0, 0, w, h);
      c.setTransform(w / 25.6, 0, 0, -h / YARD_H, 0, h);   // metres, y up
      const box = (col, x, y, ww, hh) => { c.fillStyle = col; c.fillRect(x, y, ww, hh); };
      // a pane: lit (the lamp colour, curtains or a blind over it) or dark glass with the last of the sky in it
      const glass = (x, y, ww, hh, S, k = 1) => {
        if (S.lit) {
          if (em) { c.shadowColor = S.lit; c.shadowBlur = w / 90; }
          c.globalAlpha = (em ? S.k : 0.8) * k; box(S.lit, x, y, ww, hh); c.globalAlpha = 1; c.shadowBlur = 0;
          if (S.cur < 0.45) { box('rgba(40,22,10,.55)', x, y, ww * 0.22, hh); box('rgba(40,22,10,.55)', x + ww * 0.8, y, ww * 0.2, hh); }
          else if (S.cur < 0.7) box('rgba(30,18,10,.32)', x, y, ww, hh);
          else if (S.cur < 0.8) box('rgba(0,0,0,.7)', x, y + hh * 0.45, ww, hh * 0.55);
        } else if (!em) { const gr = c.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, '#10141d'); gr.addColorStop(1, '#2c2f47'); c.fillStyle = gr; c.fillRect(x, y, ww, hh); }
      };
      if (!em) {   // panels (each a little different), the tarred seams between them, plinth and parapet
        for (let b = 0; b < 8; b++) for (let f = 0; f < 9; f++) box(YARD_BAYS[b] === 's' ? `hsl(208,9%,${40 + spec[b * 9 + f].tone * 6}%)` : `hsl(42,6%,${50 + spec[b * 9 + f].tone * 9}%)`, b * 3.2, 1 + f * 2.8, 3.2, 2.8);
        box('#807e78', 0, 26.2, 25.6, 1.2); box('#2b2b2d', 0, 27.25, 25.6, 0.15); box('#3f4144', 0, 0, 25.6, 1);
        for (let f = 0; f <= 9; f++) { box('rgba(10,10,12,.85)', 0, 1 + f * 2.8 - 0.03, 25.6, 0.06); for (let i = 0; i < 9; i++) box('rgba(10,10,12,.5)', R() * 25.6, 1 + f * 2.8 - 0.07, 0.4 + R() * 1.6, 0.14); }
        for (let b = 0; b <= 8; b++) { box('rgba(10,10,12,.85)', b * 3.2 - 0.03, 1, 0.06, 25.2); for (let i = 0; i < 7; i++) box('rgba(10,10,12,.5)', b * 3.2 - 0.07, 1 + R() * 25, 0.14, 0.4 + R() * 1.8); }
        for (let i = 0; i < 12; i++) box('#17181a', 0.6 + i * 2.13, 0.35, 0.5, 0.3);   // basement vents
      }
      for (let b = 0; b < 8; b++) for (let f = 0; f < 9; f++) {
        const S = spec[b * 9 + f], x0 = b * 3.2, y0 = 1 + f * 2.8, kind = YARD_BAYS[b], fr = em ? '#000' : S.frame;
        if (kind === 'w') {   // a three-part window
          const wx = x0 + 0.7, wy = y0 + 0.85;
          if (!em) { box(S.frame, wx - 0.06, wy - 0.06, 1.92, 1.62); box('#4f4d49', wx - 0.12, wy - 0.15, 2.04, 0.09); }
          glass(wx, wy, 1.8, 1.5, S); box(fr, wx + 0.57, wy, 0.06, 1.5); box(fr, wx + 1.17, wy, 0.06, 1.5); box(fr, wx + 0.63, wy + 1.05, 0.54, 0.05);
          if (!em && S.a < 0.1) { box('#b9bbb8', wx + 1.1, wy - 0.75, 0.75, 0.5); box('#77797a', wx + 1.16, wy - 0.69, 0.63, 0.38); }   // an air conditioner
        } else if (kind === 'b') {   // a loggia: the room window deep inside, a parapet, glazing of whatever the owner could afford — or none
          const bx = x0 + 0.2, by = y0 + 0.06, bw = 2.8;
          if (!em) box('#14151a', bx, by, bw, 2.62);
          if (S.lit) glass(x0 + 0.65, y0 + 1.2, 1.8, 1.3, S, 0.6);
          if (em) box('#000', bx, by, bw, 1.1);
          else { box(S.par, bx, by, bw, 1.05); for (let i = 1; i < 4; i++) box('rgba(0,0,0,.2)', bx + i * 0.7, by, 0.03, 1.05); box('rgba(20,14,10,.25)', bx, by, bw, 0.2 + S.b * 0.3); box('#35363a', bx, by + 1.05, bw, 0.05); }
          if (S.glazed) { if (!em) box('rgba(70,86,115,.26)', bx, by + 1.1, bw, 1.5); for (let i = 0; i <= 5; i++) box(fr, bx + i * 0.548, by + 1.1, 0.06, 1.5); box(fr, bx, by + 1.1, bw, 0.06); box(fr, bx, by + 2.54, bw, 0.07); }
          else if (!em && S.a < 0.55) for (let i = 0; i < 4; i++) box(['#b9b4a8', '#7c2f2c', '#39507a', '#c8c6c0', '#5d6b4a'][(S.b * 37 + i * 3) % 5 | 0], bx + 0.3 + i * 0.6, by + 1.45 + ((i * 7 + S.a * 9) % 3) * 0.08, 0.42, 0.62);   // washing on the line
        } else if (f === 0) {   // the staircase: the steel door at the ground, windows of the half-landings above (a dim bulb in most)
          if (!em) { box('#2e3033', x0 + 0.72, 0.2, 1.76, 2.38); box('#4a362c', x0 + 0.85, 0.2, 1.5, 2.2); box('#2a1f1a', x0 + 1.58, 0.2, 0.03, 2.2); box('#9a9c9e', x0 + 1.66, 1.2, 0.05, 0.22); box('#c9c4b4', x0 + 2.62, 1.35, 0.42, 0.56); box('#3d6aa0', x0 + 0.2, 2.1, 0.4, 0.25); }
        } else {
          const wy = y0 - 0.55;
          if (!em) box('#4d4c49', x0 + 0.94, wy - 0.06, 1.32, 1.12);
          glass(x0 + 1, wy, 1.2, 1, { lit: S.lit ? (S.a < 0.5 ? '#dfe8c8' : '#ffd998') : null, k: 0.5, cur: 1 }); box(em ? '#000' : '#4d4c49', x0 + 1.57, wy, 0.06, 1);
        }
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
      if (!em) {   // grime: grain, runs under the sills and the seams, a dirty foot
        speck(c, w, h, w * 30, 0.1);
        for (let i = 0; i < 220; i++) { const x = R() * w, y = R() * h, l = (30 + R() * 160) * h / 2048, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, `rgba(18,16,14,${0.06 + R() * 0.12})`); gr.addColorStop(1, 'rgba(18,16,14,0)'); c.fillStyle = gr; c.fillRect(x, y, (3 + R() * 16) * w / 2048, l); }
        const gr = c.createLinearGradient(0, h * 0.86, 0, h); gr.addColorStop(0, 'rgba(14,12,10,0)'); gr.addColorStop(1, 'rgba(14,12,10,.35)'); c.fillStyle = gr; c.fillRect(0, h * 0.86, w, h * 0.14);
      }
    };
    const facTex = rep(canvasTex(lite ? 1024 : 2048, lite ? 1024 : 2048, facade(false))), emTex = rep(canvasTex(lite ? 512 : 1024, lite ? 512 : 1024, facade(true)));
    const panelTex = rep(canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#85837d'; c.fillRect(0, 0, w, h); speck(c, w, h, 9000, 0.1);
      for (let i = 0; i < 9; i++) { const x = R() * w, y = R() * h * 0.5, l = 40 + R() * 120, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, 'rgba(18,16,14,.14)'); gr.addColorStop(1, 'rgba(18,16,14,0)'); c.fillStyle = gr; c.fillRect(x, y, 3 + R() * 10, l); }
      c.fillStyle = 'rgba(10,10,12,.85)'; c.fillRect(0, 0, w, 5); c.fillRect(0, 0, 5, h); }));
    const F = { p: [], n: [], u: [] }, Bk = { p: [], n: [], u: [] }, porches = [];
    // a wall from a to b ([x, z], left → right as seen from outside), y0 … y1
    const quad = (o, a, b, y0, y1, u0, u1, v0, v1) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      o.p.push(a[0], y0, a[1], b[0], y0, b[1], b[0], y1, b[1], a[0], y0, a[1], b[0], y1, b[1], a[0], y1, a[1]); for (let i = 0; i < 6; i++) o.n.push(-dz / l, 0, dx / l); o.u.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1); };
    // a house: its yard façade from a to b, `dep` deep, the façade texture shifted by `sh` bays; a porch at every staircase bay
    const house = (a, b, dep, sh) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, a2 = [a[0] + uz * dep, a[1] - ux * dep], b2 = [b[0] + uz * dep, b[1] - ux * dep], nb = Math.round(len / 3.2);
      quad(F, a, b, 0, YARD_H, sh / 8, (sh + nb) / 8, 0, 1); quad(F, b2, a2, 0, YARD_H, (sh + 3) / 8, (sh + 3 + nb) / 8, 0, 1);
      quad(Bk, b, b2, 0, YARD_H, 0, dep / 3.2, 0, YARD_H / 2.8); quad(Bk, a2, a, 0, YARD_H, 0, dep / 3.2, 0, YARD_H / 2.8);
      Bk.p.push(a[0], YARD_H, a[1], b[0], YARD_H, b[1], b2[0], YARD_H, b2[1], a[0], YARD_H, a[1], b2[0], YARD_H, b2[1], a2[0], YARD_H, a2[1]); for (let i = 0; i < 6; i++) { Bk.n.push(0, 1, 0); Bk.u.push(0, 0); }
      for (let i = 0; i < nb; i++) if (YARD_BAYS[(i + sh) % 8] === 's') porches.push([a[0] + ux * (i + 0.5) * 3.2, a[1] + uz * (i + 0.5) * 3.2, Math.atan2(-uz, ux)]);
    };
    house([-26.8, -15], [2, -15], 12, 0); house([14, -27], [14, -1.4], 11, 3); house([14.4, 19], [-14.4, 19], 11, 5);
    const wallGeo = o => { const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3)); q.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2)); return q; };
    g.add(staticMesh(wallGeo(F), new THREE.MeshStandardMaterial({ map: facTex, emissiveMap: emTex, emissive: '#ffffff', emissiveIntensity: 1.5, roughness: 0.92, envMapIntensity: 0.25 })));
    g.add(staticMesh(wallGeo(Bk), new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.95, envMapIntensity: 0.2 })));

    /* ── props (each built around its own origin, front = +z, then put in place) ── */
    const bench = col => [...[-0.13, 0, 0.13].map(z => tb(col, 1.8, 0.04, 0.11, 0, 0.45, z)), tb(col, 1.8, 0.11, 0.035, 0, 0.66, -0.23), tb(col, 1.8, 0.11, 0.035, 0, 0.82, -0.25),
      ...[-0.72, 0.72].flatMap(x => [tb('#6f6d68', 0.09, 0.43, 0.42, x, 0.215, 0), tb('#6f6d68', 0.09, 0.5, 0.07, x, 0.65, -0.27)])];
    const urn = x => [tcyl('#2a2c2f', 0.15, 0.19, 0.5, x, 0.08, 0, 8), tcyl('#2a2c2f', 0.03, 0.03, 0.1, x, 0, 0, 5)];
    // the door of a staircase: a concrete canopy on a side wall and a pipe, the step, a lamp under the canopy, a bench beside
    const porch = () => [tb('#6b6a66', 2.9, 0.14, 1.8, 0, 2.62, 0.9), tb('#77746d', 0.2, 2.55, 1.5, -1.3, 1.275, 0.75), tcyl('#2c2d30', 0.035, 0.035, 2.55, 1.3, 0, 1.6, 6), tb('#5d5c58', 2.6, 0.22, 1.5, 0, 0.11, 0.75), tb('#5d5c58', 3, 0.11, 0.45, 0, 0.055, 1.7),
      tb('#2a2b2e', 0.26, 0.07, 0.14, 0, 2.52, 0.3), ...bench(pick(['#566b84', '#5a6f52', '#6d5138'])).map(q => q.translate(3.1, 0, 0.55)), ...urn(1.75).map(q => q.translate(0, 0, 0.3))];
    // a street lamp: a pole, an arm towards +z, the head; returns where the light is
    const lamp = hgt => [tcyl('#3b3d40', 0.085, 0.06, hgt, 0, 0, 0, 8), geoTint(new THREE.CylinderGeometry(0.035, 0.04, 1.5, 6).rotateX(1.25).translate(0, hgt + 0.2, 0.68), '#3b3d40'), tb('#2b2c2f', 0.24, 0.12, 0.6, 0, hgt + 0.42, 1.55)];
    const lampLit = hgt => tb('#ffb25a', 0.18, 0.03, 0.46, 0, hgt + 0.345, 1.57);
    // a bare tree: every limb a tapered tube, forking five times
    const _tq = new Quat(), _tup = new V3(0, 1, 0);
    const tree = (hgt, sd) => {
      const r = locRng(sd), gs = [];
      const limb = (p, d, len, rad, lv) => {
        rad = Math.max(rad, 0.014);
        gs.push(geoTint(new THREE.CylinderGeometry(rad * 0.68, rad, len, lv < 2 ? 6 : lv < 4 ? 4 : 3, 1, true).translate(0, len / 2, 0).applyQuaternion(_tq.setFromUnitVectors(_tup, d)).translate(p.x, p.y, p.z), '#1c1714'));
        if (lv >= 5) return;
        const n = lv === 0 || r() < 0.35 ? 3 : 2, q = p.clone().addScaledVector(d, len);
        for (let i = 0; i < n; i++) { const nd = new V3(r() - 0.5, 0, r() - 0.5).normalize().multiplyScalar(lv === 0 ? 0.7 : 0.9).add(d).add(_tup.clone().multiplyScalar(0.22)).normalize();
          limb(lv > 0 && i === 0 ? p.clone().addScaledVector(d, len * (0.5 + r() * 0.3)) : q, nd, len * (0.62 + r() * 0.2), rad * 0.6, lv + 1); }
      };
      limb(new V3(), new V3((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize(), hgt * 0.32, hgt * 0.022, 0);
      return gs;
    };
    // a shell garage («ракушка»): a tin box with a hinged sloping front
    const garage = col => [geoTint(new THREE.ExtrudeGeometry(shapeOf([[-2.3, 0], [-2.3, 1.5], [-2, 1.78], [0.9, 1.9], [1.5, 1.76], [2.3, 0.95], [2.3, 0]]), { depth: 2.4, bevelEnabled: false }).translate(0, 0, -1.2).rotateY(-PI / 2), col),
      tb('#2a2b2d', 2.46, 0.05, 0.06, 0, 1.92, 0.9), tb('#2a2b2d', 2.46, 0.05, 0.06, 0, 1.86, -0.6), tb('#2a2b2d', 2.46, 0.05, 0.06, 0, 1.79, -1.95), tb('#2a2b2d', 2.46, 0.06, 0.05, 0, 0.95, 2.31), tb('#1d1e20', 0.1, 0.14, 0.04, 0, 0.7, 2.33)];
    // rubbish bins behind a tin screen
    const bins = () => [tb('#55595c', 4.7, 1.7, 0.05, 0, 0.85, -0.8), tb('#55595c', 0.05, 1.7, 1.5, -2.35, 0.85, -0.05), tb('#55595c', 0.05, 1.7, 1.5, 2.35, 0.85, -0.05), tb('#5a5955', 4.8, 0.08, 1.9, 0, 0.04, 0),
      ...[-1.4, 0, 1.4].flatMap((x, i) => [tb(['#2f5a3a', '#2c4d6b', '#2f5a3a'][i], 1.15, 0.92, 0.8, x, 0.6, -0.1), geoTint(new THREE.BoxGeometry(1.19, 0.05, 0.86).rotateX(i === 1 ? -0.5 : 0.08).translate(x, i === 1 ? 1.27 : 1.09, i === 1 ? -0.3 : -0.1), '#23272a')]),
      geoTint(new THREE.SphereGeometry(0.3, 7, 5).scale(1, 0.75, 1).translate(2.0, 0.22, 0.6), '#15161a'), geoTint(new THREE.SphereGeometry(0.26, 7, 5).scale(1, 0.8, 1).translate(1.55, 0.2, 0.85), '#1a1b20')];
    // playground: swings, a slide (the chute runs down to +z), a sandbox under a «mushroom», a carpet rack
    const swing = () => { const C = '#7a2f28', gs = [geoTint(new THREE.CylinderGeometry(0.035, 0.035, 3.1, 6).rotateZ(PI / 2).translate(0, 2.15, 0), C)];
      for (const sx of [-1.5, 1.5]) for (const sz of [-1, 1]) gs.push(geoTint(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6).rotateX(-sz * 0.36).translate(sx, 1.08, sz * 0.4), C));
      for (const sx of [-0.7, 0.7]) gs.push(tb('#3a2c20', 0.42, 0.03, 0.16, sx, 0.5, 0), tb('#2b2c2e', 0.014, 1.65, 0.014, sx - 0.19, 1.325, 0), tb('#2b2c2e', 0.014, 1.65, 0.014, sx + 0.19, 1.325, 0));
      return gs; };
    const slide = () => { const C = '#2f5f86', M = '#8a8f93', gs = [tb(C, 0.8, 0.05, 0.8, 0, 1.45, -0.4), geoTint(new THREE.BoxGeometry(0.5, 0.03, 2.5).rotateX(0.5).translate(0, 0.85, 1.1), M)];
      for (const sx of [-1, 1]) { gs.push(geoTint(new THREE.BoxGeometry(0.03, 0.14, 2.5).rotateX(0.5).translate(sx * 0.25, 0.91, 1.1), C), tb(C, 0.05, 2.15, 0.05, sx * 0.38, 1.075, -0.02), tb(C, 0.05, 2.15, 0.05, sx * 0.38, 1.075, -0.78),
        tb(C, 0.04, 0.04, 0.76, sx * 0.38, 2.1, -0.4), geoTint(new THREE.BoxGeometry(0.04, 1.6, 0.04).rotateX(-0.3).translate(sx * 0.3, 0.72, -1.03), C)); }
      for (let i = 0; i < 4; i++) gs.push(tb(M, 0.6, 0.03, 0.05, 0, 0.3 + i * 0.3, -0.8 - (1.15 - i * 0.3) * 0.31));
      return gs; };
    const sandbox = () => [tb('#6a5a40', 2.3, 0.24, 0.07, 0, 0.12, -1.1), tb('#6a5a40', 2.3, 0.24, 0.07, 0, 0.12, 1.1), tb('#6a5a40', 0.07, 0.24, 2.2, -1.1, 0.12, 0), tb('#6a5a40', 0.07, 0.24, 2.2, 1.1, 0.12, 0), tb('#756649', 2.1, 0.1, 2.1, 0, 0.05, 0),
      tcyl('#8b8d90', 0.05, 0.05, 1.75, 0.6, 0, 0.5, 6), geoTint(new THREE.ConeGeometry(0.9, 0.45, 10).translate(0.6, 1.95, 0.5), '#8a2a22')];
    const rack = () => [tcyl('#34363a', 0.04, 0.04, 1.9, -1.1, 0, 0, 6), tcyl('#34363a', 0.04, 0.04, 1.9, 1.1, 0, 0, 6), geoTint(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6).rotateZ(PI / 2).translate(0, 1.9, 0), '#34363a')];
    // cars: a side profile (front at +x) extruded across the width, a glass band a hair wider than the cabin, wheels, lights, bumpers
    const CARS = {
      sedan: { W: 1.62, ax: 1.22, wr: 0.3, body: [[-2.06, 0.3], [-2.06, 0.74], [-1.96, 0.88], [-1.08, 0.92], [-0.72, 1.37], [0.5, 1.39], [0.98, 0.93], [1.98, 0.85], [2.06, 0.72], [2.06, 0.3]], glass: [[-1, 0.95], [-0.7, 1.32], [0.48, 1.34], [0.9, 0.95]] },
      hatch: { W: 1.6, ax: 1.16, wr: 0.29, body: [[-1.85, 0.3], [-1.85, 0.8], [-1.7, 1], [-1.45, 1.38], [0.35, 1.4], [0.85, 0.95], [1.75, 0.86], [1.85, 0.7], [1.85, 0.3]], glass: [[-1.6, 1], [-1.4, 1.33], [0.33, 1.35], [0.78, 0.98]] },
      van: { W: 1.9, ax: 1.2, wr: 0.36, body: [[-2.15, 0.42], [-2.15, 1.92], [-1.95, 2.04], [1.5, 2.04], [1.95, 1.5], [2.15, 1.1], [2.15, 0.42]], glass: [[-1.7, 1.3], [-1.7, 1.8], [1.55, 1.8], [1.9, 1.3]] },
    };
    const car = (kind, col) => {
      const K = CARS[kind], W = K.W, L = K.body[K.body.length - 1][0];
      const gs = [geoTint(new THREE.ExtrudeGeometry(shapeOf(K.body), { depth: W - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelOffset: -0.05, bevelSegments: 2 }).translate(0, 0, -(W - 0.1) / 2), col),
        geoTint(new THREE.ExtrudeGeometry(shapeOf(K.glass), { depth: W + 0.02, bevelEnabled: false }).translate(0, 0, -(W + 0.02) / 2), '#0b0f15'), tb('#17191c', 0.06, 0.16, W - 0.15, L - 0.005, 0.38, 0), tb('#17191c', 0.06, 0.16, W - 0.15, -L + 0.005, 0.38, 0)];
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) gs.push(geoTint(new THREE.CylinderGeometry(K.wr, K.wr, 0.2, 14).rotateX(PI / 2).translate(sx * K.ax, K.wr, sz * (W / 2 - 0.08)), '#0c0c0e'), geoTint(new THREE.CylinderGeometry(K.wr * 0.55, K.wr * 0.55, 0.214, 10).rotateX(PI / 2).translate(sx * K.ax, K.wr, sz * (W / 2 - 0.08)), '#868a8e'));
        gs.push(tb('#dfe6ea', 0.05, 0.11, 0.3, L - 0.012, 0.66, sz * (W / 2 - 0.27)), tb('#7c0e12', 0.05, 0.11, 0.3, -L + 0.012, 0.7, sz * (W / 2 - 0.27)));
      }
      return gs;
    };

    /* ── placing ── */
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.1, envMapIntensity: 0.3 }), carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.45, envMapIntensity: 0.6 });
    const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3.2, 3.2, 3.2), fog: false });
    const glowTex = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,255,255,.7)'); gr.addColorStop(0.35, 'rgba(255,255,255,.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    // a halo around a lamp. Sprites must stay out of the AO normal pass (they would be drawn there as solid quads): the crowd keeps
    // such a list for its floor blobs (CROWD.blobs, hidden for the time of that pass) — the halos join it
    const glow = (p, s, col) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.position.copy(p); sp.scale.set(s, s, 1); g.add(sp); CROWD.blobs.push(sp); };
    const nearMesh = (gs, mat, x, z, r) => { const m = staticMesh(geoMerge(gs), mat); m.receiveShadow = mat === propMat; g.add(m); near.push({ m, p: new V3(x, 1, z), r }); };
    const SODIUM = new THREE.Color(2.4, 1.25, 0.42), heads = [];
    for (const [i, [x, z, ry, hgt]] of [[-4.9, -5.9, 0.693, 6.6], [10.8, -20.5, -0.4, 6], [-16.5, 8.5, 2.21, 6], [11.2, 12.4, -2.24, 6]].entries()) {
      const gs = put(lamp(hgt), x, z, ry); if (i) props.push(...gs); else nearMesh(gs, propMat, x, z, 0.5);
      lampGs.push(...put([lampLit(hgt)], x, z, ry)); const p = at(x, z, ry, 1.57, hgt + 0.33); heads.push(p); glow(p, 2.6, SODIUM);
    }
    for (const [i, [x, z, ry]] of porches.entries()) {
      props.push(...put(porch(), x, z, ry)); lampGs.push(...put([tb('#ffe2b0', 0.2, 0.03, 0.1, 0, 2.47, 0.3)], x, z, ry));
      if (i < 3) glow(at(x, z, ry, 0.3, 2.43), 1.1, new THREE.Color(1.6, 1.25, 0.8));
    }
    for (const [x, z, hgt] of [[6.2, -13.2, 9.5], [11.3, -12.2, 8], [-12, -12.7, 10], [-23, -12.6, 8.5], [0.2, -12.7, 7.5], [-15.2, 5.6, 9], [-10.2, -4.6, 7], [-7.5, 16.9, 9], [4, 17.1, 8.5], [-19, 13, 10], [16.5, 14, 8], [7.5, -24, 9], [-24, 2, 9]]) props.push(...put(tree(hgt, (x * 31 + z * 17) | 0), x, z, R() * 6));
    nearMesh(put(tree(8.5, 77), 6.4, -5.3, 1.3), propMat, 6.4, -5.3, 1.6);
    nearMesh(put([...bench('#5a6f52'), ...urn(1.25)], -5.6, 3.6, 2.14), propMat, -5.6, 3.6, 1.3);
    for (let i = 0; i < 7; i++) props.push(...put(garage(['#6f7772', '#586a5a', '#7a6a58', '#84888c', '#4d5a6a', '#6d5444', '#70747a'][i]), -20.5 + (R() - 0.5) * 0.2, -8.4 + i * 2.75, PI / 2 + (R() - 0.5) * 0.05));
    props.push(...put(bins(), 7.8, -18, 0), ...put(sandbox(), -11.6, -2.6, 0.2), ...put(swing(), -13.6, 2.4, PI / 2 - 0.15), ...put(slide(), -11.2, 5.4, 2.3), ...put(rack(), -15.6, -3.6, 0.5), ...put(bench('#6d5138'), -9.6, 1.2, PI / 2));
    g.add(staticMesh(geoMerge(lampGs), lampMat));
    const propM = staticMesh(geoMerge(props), propMat); propM.receiveShadow = true; g.add(propM);
    const carGs = [];
    for (const [kind, col, x, z, ry] of [['sedan', '#7d2a22', -21, -9.8, 0], ['van', '#59684c', -15.6, -9.85, PI], ['hatch', '#c9ccce', -10.6, -9.8, 0], ['sedan', '#2a3140', 2.6, -9.8, PI],
      ['hatch', '#8e1418', 11.7, -8.2, 0], ['sedan', '#9a9da0', 11.6, -11, 0], ['van', '#d3d0c6', 11.5, -19.6, 0], ['sedan', '#1b3a2a', 11.6, -22.6, PI], ['sedan', '#c7c2b4', -9.2, 14.3, PI], ['hatch', '#22344f', -1.2, 14.3, 0], ['sedan', '#101114', 6.6, 14.3, 0]]) carGs.push(...put(car(kind, col), x, z, ry));
    g.add(staticMesh(geoMerge(carGs), carMat));
    nearMesh(put(car('sedan', '#1f2c4d'), 8.6, 3.2, 1.9), carMat, 8.6, 3.2, 2.4);

    /* ── light: the lamp by the circle throws an orange pool over it from behind-left (the shared `key` gives the shadows), the bulb
       under the canopy of the nearest door, two far lamps so that the cars, the bins and house B / C read ── */
    const spot = new THREE.SpotLight('#ff9a3d', 46, 26, 0.85, 0.9, 1.5); spot.position.copy(heads[0]); spot.target.position.set(0, 0.3, 0); g.add(spot, spot.target);
    const door = new THREE.PointLight('#ffdcae', 5, 9, 1.8); door.position.set(-6, 2.3, -14.1); g.add(door);
    if (!lite) for (const i of [1, 3]) { const p = new THREE.PointLight('#ff9a3d', 60, 22, 1.5); p.position.copy(heads[i]).y -= 0.3; g.add(p); }

    /* ── the circle: three tight rows of people on the asphalt (nobody on crates here), they are the boundary (`wall` above) ── */
    this.crowd = makeCrowd({ shape: 'circle', r: 3.15, rows: 3, gap: 0.5, rise: [0, 0, 0], look: 'street', seed: 31, max: 140 });
    g.add(this.crowd.group);

    /* ── breath in the cold air: soft points at the fighters' mouths (world frame), GFX.particles scales the rate ── */
    const BN = 48, bg = new THREE.BufferGeometry(), bPos = new THREE.BufferAttribute(new Float32Array(BN * 3), 3), bSA = new THREE.BufferAttribute(new Float32Array(BN * 2), 2);
    bPos.setUsage(THREE.DynamicDrawUsage); bSA.setUsage(THREE.DynamicDrawUsage); bg.setAttribute('position', bPos); bg.setAttribute('aSA', bSA);
    const bMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uS: { value: 1000 }, uC: { value: new THREE.Color('#d8c3ae') } },
      vertexShader: 'attribute vec2 aSA; uniform float uS; varying float vA; void main() { vA = aSA.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSA.x * uS / max(0.1, -mv.z); }',
      fragmentShader: 'uniform vec3 uC; varying float vA; void main() { float a = vA * smoothstep(1.0, 0.15, length(gl_PointCoord - 0.5) * 2.0); if (a < 0.003) discard; gl_FragColor = vec4(uC, a); }' });
    const puffs = new THREE.Points(bg, bMat); puffs.frustumCulled = false; scene.add(puffs); CROWD.blobs.push(puffs); this.world = [puffs];
    this.breath = { n: BN, pos: bPos, sa: bSA, vel: new Float32Array(BN * 3), age: new Float32Array(BN).fill(-1), mat: bMat, t: CROWD.u.uT.value, ph: [0, 0.5], acc: [0, 0], next: 0 };
    return g;
  },
  // per frame, after the camera
  sync() {
    const M = ARENA.matrixWorld, cam = camera.position;
    // the sky and the skyline stay around the camera (they turn with the yard but never come closer)
    ARENA.worldToLocal(_lp.copy(cam)); this.far.position.set(_lp.x, 0, _lp.z);
    // lamp post, tree, bench, car by the circle: hidden while inside the view wedge in front of what the camera looks at
    const dx = camL.x - cam.x, dz = camL.z - cam.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, tH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect * 1.1;
    for (const o of this.near) { _lp.copy(o.p).applyMatrix4(M); const px = _lp.x - cam.x, pz = _lp.z - cam.z, s = px * ux + pz * uz; o.m.visible = !(s > -o.r && s < len - 0.5 && Math.abs(px * uz - pz * ux) - o.r < Math.max(s, 0) * tH + 0.3); }
    // breath: each man breathes out for a third of his cycle (faster when he is tired); a puff drifts forward and up, swells and thins out
    const B = this.breath, t = CROWD.u.uT.value, dt = clamp(t - B.t, 0, 0.05); B.t = t;
    if (dt <= 0) return;
    const P = B.pos.array, S = B.sa.array, V = B.vel, A = B.age;
    [P1, P2].forEach((F, i) => {
      if (!F || !F.group.visible) return;
      B.ph[i] = (B.ph[i] + dt / (2.6 - 1.4 * clamp(1 - F.stamina / 100, 0, 1))) % 1; if (B.ph[i] > 0.32) return;
      for (B.acc[i] += dt * 22 * GFX.particles; B.acc[i] >= 1; B.acc[i]--) {
        const k = B.next = (B.next + 1) % B.n, dir = Math.sign(F.other.headNow.x - F.headNow.x) || 1, h = F.headNow;
        P[k * 3] = h.x + dir * 0.1; P[k * 3 + 1] = h.y - 0.075; P[k * 3 + 2] = h.z; V[k * 3] = dir * (0.3 + rr() * 0.25); V[k * 3 + 1] = 0.03 + rr() * 0.08; V[k * 3 + 2] = (rr() - 0.5) * 0.12; A[k] = 0;
      }
    });
    const drag = Math.exp(-dt * 2);
    for (let k = 0; k < B.n; k++) {
      if (A[k] < 0) continue; A[k] += dt; const u = A[k] / 1.5; if (u >= 1) { A[k] = -1; S[k * 2 + 1] = 0; continue; }
      V[k * 3] *= drag; V[k * 3 + 1] = V[k * 3 + 1] * drag + 0.1 * dt; V[k * 3 + 2] *= drag; P[k * 3] += V[k * 3] * dt; P[k * 3 + 1] += V[k * 3 + 1] * dt; P[k * 3 + 2] += V[k * 3 + 2] * dt;
      S[k * 2] = 0.06 + 0.3 * Math.pow(u, 0.6); S[k * 2 + 1] = 0.17 * Math.min(1, A[k] / 0.1) * Math.pow(1 - u, 1.4);
    }
    B.pos.needsUpdate = true; B.sa.needsUpdate = true; B.mat.uniforms.uS.value = sceneRT.height / (2 * Math.tan(camera.fov * Math.PI / 360));
  },
};
