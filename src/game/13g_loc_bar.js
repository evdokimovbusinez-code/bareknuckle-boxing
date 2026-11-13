/* ───────── location «Бар» (story, issue #51 ch. 1): a tight bar hall at night ─────────
   A long low room: a wooden floor sticky with spilled beer, a counter with a bar-back of bottles and a mirror along the −z wall,
   a pink neon «ХМЕЛЬ» over it, four stools, round tables with chairs against the side walls, a dartboard, a fridge by the exit
   door with a glowing «ВЫХОД» above it, two warm pendant lamps over the fighting floor. The regulars form a rectangle around the
   circle; the soft wall (invisible, `wall`) keeps a knocked-out man short of the stools.
   Layout (ARENA frame, floor centre = origin, the default camera looks from +z): room |x| ≤ BAR_HX, |z| ≤ BAR_HZ, height BAR_HH;
   the fighting bound is a circle r 2.5, the wall faces are at ±BAR_W — everything (counter at −4.1…−4.6, stools at −3.5, side
   tables at |x| ≈ 4.5) stands behind that line. Whatever gets between the camera and the fighters is hidden in sync(): the whole
   bar side as one group (like the parking hides its cars), the side props per mesh.
   No intro fly-round (`noFly`): from outside the room would read as a dollhouse — the story dialogue and the stare-down take its
   place (19_story.js). */
const BAR_HX = 6, BAR_HZ = 5, BAR_HH = 3.4, BAR_W = 3.1;   // half-sides of the room; BAR_W — the inner face of the soft wall
LOCS.bar = {
  id: 'bar', label: 'Бар', desc: 'Тесный бар: стойка, табуреты, тёплый свет', lockLbl: '🔒 откроется в главе «Бар»', bound: { kind: 'circle', r: 2.5 }, ring: false, noFly: true,
  // the ragdoll stops at the invisible line in front of the stools: a hard-ish spring of a counter edge, little give
  wall: { kind: 'rect', hx: BAR_W, hz: BAR_W, k: 2.0e4, mu: 0.7, h: 1.85, d: 0.3, give: 0.1, damp: 20, top() { return this.h; } },
  // warm: the pendants are the key, neon pink rim from the bar, a cold sliver by the exit
  light: { bg: '#0a0705', fog: ['#0a0705', 4.5, 15], exposure: 1.02, hemi: ['#6b5236', '#170f08', 0.5], key: ['#ffc084', 40], rim: ['#ff9058', 1.4], rim2: ['#82a0ff', 0.8], fill: ['#ffdcb0', 0.28] },
  build() {
    const R = locRng(2051), g = new THREE.Group(), PI = Math.PI, lite = lowEnd || GFX.level === 'low';
    const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const speck = (c, w, h, n, a) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * a})`; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } };
    const font = px => `900 ${px}px "Big Shoulders Display", Impact, "Arial Black", sans-serif`;
    const tb = (col, w, h, d, x, y, z, ry = 0) => geoTint(geoBox(w, h, d, x, y, z, ry), col);
    const tcyl = (col, r0, r1, hgt, x, y, z, seg = 8) => geoTint(new THREE.CylinderGeometry(r1, r0, hgt, seg).translate(x, y + hgt / 2, z), col);
    const flat = (w, d, x, z, y, ry = 0) => new THREE.PlaneGeometry(w, d).rotateX(-PI / 2).rotateY(ry).translate(x, y, z);
    const noAO = o => { CROWD.blobs.push(o); return o; };
    const near = this.near = [];
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.12, envMapIntensity: 0.4 });
    const glowTex = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.6)'); gr.addColorStop(0.4, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    const glow = (p, s, col) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); sp.position.copy(p); sp.scale.set(s, s, 1); g.add(noAO(sp)); };

    /* floor: a 1.5 m plank tile of dark varnished wood, scuffed; over the middle — non-repeating spills, beer rings and footpaths */
    const woodTex = rep(canvasTex(lite ? 512 : 1024, lite ? 512 : 1024, (c, w, h) => {
      const pw = w / 4;
      for (let i = 0; i < 4; i++) { c.fillStyle = `hsl(${22 + R() * 12},${30 + R() * 16}%,${16 + R() * 9}%)`; c.fillRect(i * pw, 0, pw, h);
        c.strokeStyle = 'rgba(8,6,4,.6)'; c.lineWidth = 2; c.strokeRect(i * pw, 0, pw, h);
        for (let k = 0; k < 40; k++) { c.strokeStyle = `rgba(${R() < 0.5 ? '20,14,10' : '90,66,42'},${0.06 + R() * 0.12})`; c.lineWidth = 1 + R() * 2; c.beginPath(); let x = i * pw + 4, y = R() * h; c.moveTo(x, y); for (let m = 0; m < 8; m++) { x += pw / 8; y += (R() - 0.5) * 14; c.lineTo(x, y); } c.stroke(); }
        for (let k = 0; k < 900; k++) { c.fillStyle = `rgba(${R() < 0.6 ? '10,8,6' : '130,105,75'},${R() * 0.1})`; c.fillRect(i * pw + R() * pw, R() * h, 1 + R() * 2, 1); } }
      c.fillStyle = 'rgba(200,190,170,.05)'; c.fillRect(0, 0, w, h);   // a film of varnish
    }));
    const floor = staticMesh(geoUvMul(new THREE.PlaneGeometry(2 * BAR_HX, 2 * BAR_HZ).rotateX(-PI / 2), BAR_HX / 0.75, BAR_HZ / 0.75), new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55, envMapIntensity: 0.5 }));
    floor.receiveShadow = true; g.add(floor);
    const spillTex = canvasTex(lite ? 512 : 1024, lite ? 512 : 1024, (c, w, h) => {
      const s = w / 11; c.setTransform(s, 0, 0, s, w / 2, h / 2);   // metres, x right, z down
      for (let i = 0; i < 9; i++) { const x = (R() * 2 - 1) * 3.1, y = (R() * 2 - 1) * 2.5, r = 0.12 + R() * 0.3;   // rings left by glasses
        c.strokeStyle = `rgba(60,40,20,${0.25 + R() * 0.3})`; c.lineWidth = 0.02 + R() * 0.015; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
        c.fillStyle = `rgba(50,34,18,${0.05 + R() * 0.08})`; c.beginPath(); c.arc(x, y, r * 0.9, 0, 7); c.fill(); }
      for (let i = 0; i < 5; i++) { const x = (R() * 2 - 1) * 3.4, y = (R() * 2 - 1) * 2.8, r = 0.3 + R() * 0.6, gr = c.createRadialGradient(x, y, 0, x, y, r);   // spilled pools
        gr.addColorStop(0, `rgba(40,26,12,${0.2 + R() * 0.15})`); gr.addColorStop(1, 'rgba(40,26,12,0)'); c.fillStyle = gr; c.beginPath(); c.ellipse(x, y, r, r * (0.6 + R() * 0.4), R() * 3, 0, 7); c.fill(); }
      let fx = 4.6, fy = -4.4, fa = Math.atan2(0 - fy, 0 - fx);   // the path from the door: smeared prints
      c.fillStyle = 'rgba(30,20,10,.22)';
      for (let k = 0; k < 14; k++) { fx += Math.cos(fa) * 0.55; fy += Math.sin(fa) * 0.55; fa += (R() - 0.5) * 0.4;
        c.save(); c.translate(fx + (k % 2 ? 0.12 : -0.12), fy); c.rotate(fa + PI / 2); c.beginPath(); c.ellipse(0, 0, 0.06, 0.14, 0, 0, 7); c.fill(); c.restore(); }
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';   // worn through in places
      for (let i = 0; i < w * 3; i++) { c.fillStyle = `rgba(0,0,0,${0.2 + R() * 0.5})`; c.fillRect(R() * w, R() * h, 1 + R() * 4, 1 + R() * 2); }
    });
    const spill = staticMesh(flat(11, 11, 0, 0, 0.0013), new THREE.MeshStandardMaterial({ map: spillTex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    spill.receiveShadow = true; spill.renderOrder = -3; g.add(spill);

    /* walls: painted plaster above, a dark wood wainscot below; one tiled texture; single-sided like the parking */
    const wallTex = rep(canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#37402f'; c.fillRect(0, 0, w, h * 0.7); c.fillStyle = '#241a12'; c.fillRect(0, h * 0.7, w, h * 0.3);
      c.fillStyle = '#1a120c'; c.fillRect(0, h * 0.685, w, h * 0.02);
      for (let k = 0; k < 6; k++) { c.strokeStyle = 'rgba(10,8,6,.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(k * w / 6 + 8, h * 0.71); c.lineTo(k * w / 6 + 8, h * 0.97); c.stroke(); }
      speck(c, w, h, 16000, 0.1);
      for (let i = 0; i < 20; i++) { const x = R() * w, y = R() * h * 0.66, l = 30 + R() * 150, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, `rgba(12,10,8,${0.05 + R() * 0.1})`); gr.addColorStop(1, 'rgba(12,10,8,0)'); c.fillStyle = gr; c.fillRect(x, y, 2 + R() * 10, l); }
      const gr = c.createLinearGradient(0, h * 0.5, 0, h * 0.72); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.4)'); c.fillStyle = gr; c.fillRect(0, h * 0.5, w, h * 0.24);   // smoke-darkened above the wainscot
    }));
    const wallG = (len, ry, x, z) => geoUvMul(new THREE.PlaneGeometry(len, BAR_HH), len / 5, 1).rotateY(ry).translate(x, BAR_HH / 2, z);
    g.add(staticMesh(geoMerge([wallG(2 * BAR_HX, 0, 0, -BAR_HZ), wallG(2 * BAR_HX, PI, 0, BAR_HZ), wallG(2 * BAR_HZ, PI / 2, -BAR_HX, 0), wallG(2 * BAR_HZ, -PI / 2, BAR_HX, 0)]),
      new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, envMapIntensity: 0.2 })));

    /* the bar side: counter, bar-back with shelves, bottles, mirror, neon, stools — one group, hidden as a whole when in the way */
    const bar = this.bar = new THREE.Group(); g.add(bar); near.push({ m: bar, p: new V3(0, 1, -BAR_HZ + 0.8), r: 3.4 });
    { const gs = [];
      gs.push(tb('#2a1d13', 6.6, 1.02, 0.52, 0, 0.53, -4.15));                       // counter body
      gs.push(tb('#4a3320', 6.8, 0.06, 0.62, 0, 1.07, -4.13));                       // the top, a hair overhanging
      gs.push(tb('#20150e', 6.4, 0.14, 0.06, 0, 0.07, -3.92));                       // kick recess
      gs.push(tcyl('#b9963f', 0.026, 0.026, 0.3, -2.6, 0.15, -3.86, 6), tcyl('#b9963f', 0.026, 0.026, 0.3, 2.6, 0.15, -3.86, 6));
      gs.push(geoTint(new THREE.CylinderGeometry(0.022, 0.022, 5.2, 6).rotateZ(PI / 2).translate(0, 0.3, -3.86), '#c8a44c'));   // brass foot rail
      for (const sx of [-3.3, 3.3]) gs.push(tb('#241812', 0.14, 1.12, 0.6, sx, 0.56, -4.15));   // end caps
      // bar-back: two shelves and a mirror between them
      gs.push(tb('#1c120c', 2.9, 0.05, 0.3, -2.15, 1.55, -4.62), tb('#1c120c', 2.9, 0.05, 0.3, 2.15, 1.55, -4.62));
      gs.push(tb('#1c120c', 2.9, 0.05, 0.3, -2.15, 2.06, -4.62), tb('#1c120c', 2.9, 0.05, 0.3, 2.15, 2.06, -4.62));
      gs.push(tb('#160f0a', 6.4, 1.5, 0.12, 0, 1.6, -4.86));                         // the back panel
      gs.push(geoTint(new THREE.BoxGeometry(2.5, 1.4, 0.04).translate(0, 1.75, -4.78), '#38332e'));   // mirror frame
      bar.add(staticMesh(geoMerge(gs), propMat));
      const mir = staticMesh(new THREE.PlaneGeometry(2.42, 1.32).translate(0, 1.75, -4.74), new THREE.MeshStandardMaterial({ color: '#14110d', roughness: 0.06, metalness: 0.9, envMapIntensity: 1.4 }));
      bar.add(mir);
      // bottles on the shelves: one InstancedMesh, every bottle its own colour and height
      const B = [], pal = ['#7a3f12', '#2e4d24', '#514020', '#141618', '#61685e', '#42252b'];
      for (const [x0, x1] of [[-3.5, -0.9], [0.9, 3.5]]) for (const y of [1.58, 2.09]) for (let x = x0; x < x1; x += 0.13 + R() * 0.06) { if (R() < 0.12) continue; B.push([x + (R() - 0.5) * 0.02, y, 0.15 + R() * 0.12, pal[(R() * pal.length) | 0]]); }
      const bm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.027, 0.031, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.25, envMapIntensity: 1 }), B.length), m4 = new M4(), col = new THREE.Color();
      B.forEach(([x, y, hh, c], i) => { m4.makeScale(1, hh, 1); m4.setPosition(x, y, -4.62); bm.setMatrixAt(i, m4); bm.setColorAt(i, col.set(c)); });
      bm.matrixAutoUpdate = false; bar.add(bm);
      // stools, on the far side of the soft wall line
      const st = [];
      for (const x of [-2.1, -0.7, 0.7, 2.1]) {
        st.push(tcyl('#b9963f', 0.032, 0.032, 0.68, x, 0.04, -3.5, 6), geoTint(new THREE.CylinderGeometry(0.19, 0.185, 0.075, 12).translate(x, 0.74, -3.5), '#5a2b26'),
          geoTint(new THREE.TorusGeometry(0.15, 0.012, 5, 14).rotateX(PI / 2).translate(x, 0.22, -3.5), '#8a7248')); }
      bar.add(staticMesh(geoMerge(st), propMat));
      // what stands on the counter: two glasses, a bottle, an ashtray, a spill
      const cp = [];
      cp.push(tcyl('#8a8f94', 0.034, 0.03, 0.13, -1.25, 1.1, -4.05, 8), tcyl('#8a8f94', 0.034, 0.03, 0.11, -1.12, 1.1, -4.12, 8));
      cp.push(tcyl('#31401f', 0.028, 0.028, 0.24, -1.7, 1.1, -4.2, 6), tcyl('#0e0d0c', 0.06, 0.055, 0.03, 0.9, 1.1, -4.1, 10));
      bar.add(staticMesh(geoMerge(cp), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.1, envMapIntensity: 0.9, transparent: true, opacity: 0.85 })));
      // the neon over the mirror
      const neonTex = canvasTex(512, 160, (c, w, h) => { c.clearRect(0, 0, w, h); c.font = font(120); c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = '#ff2f62'; c.shadowBlur = 42; c.fillStyle = '#ff86a2'; for (let k = 0; k < 3; k++) c.fillText('ХМЕЛЬ', w / 2, h / 2 + 4); c.shadowBlur = 0; c.fillStyle = '#ffd9e2'; c.fillText('ХМЕЛЬ', w / 2, h / 2 + 4); });
      bar.add(staticMesh(new THREE.PlaneGeometry(1.5, 0.47).translate(0, 2.72, -4.72), new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.6) })));
      const nl = new THREE.PointLight('#ff3b6e', 5, 5.5, 1.8); nl.position.set(0, 2.5, -4.2); bar.add(nl);
      const bl = new THREE.PointLight('#ffd9a0', 7, 6.5, 1.8); bl.position.set(0, 2.25, -3.5); bar.add(bl);
    }

    /* side props: two tables with chairs on the +x wall, a dartboard and a fridge on the −x wall, the exit door with «ВЫХОД» */
    const table = (x, z, ry) => { const gs = [geoTint(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 14).rotateY(ry).translate(x, 0.75, z), '#38251a'), tcyl('#1f1e1d', 0.05, 0.07, 0.74, x, 0, z, 8), geoTint(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 12).translate(x, 0.015, z), '#242220')];
      for (const [lx, lz, a] of [[0.62, 0.2, 0.4], [0.55, -0.5, -0.7]]) { const cx = x + Math.cos(ry + a) * lx + 0.1, cz = z + Math.sin(ry + a) * lx;
        gs.push(tb('#4a3a26', 0.34, 0.045, 0.34, cx, 0.45, cz, a), tb('#4a3a26', 0.34, 0.42, 0.045, cx - Math.sin(a) * 0.16, 0.66, cz + Math.cos(a) * 0.16, a));
        for (const [sx, sz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) gs.push(tb('#282622', 0.035, 0.44, 0.035, cx + sx, 0.22, cz + sz)); }
      const m = staticMesh(geoMerge(gs), propMat); m.receiveShadow = true; g.add(m); near.push({ m, p: new V3(x, 0.9, z), r: 1.05 }); };
    table(4.6, -1.3, 0.2); table(4.55, 1.7, -0.35);
    { const gs = [];
      // a fridge by the −x wall, and the door of the place with a glowing exit sign on the −z wall
      gs.push(tb('#c9c6bb', 0.66, 1.66, 0.62, -5.35, 0.83, 2.7), tb('#1c120c', 0.02, 1.3, 0.5, -5.0, 0.95, 2.86), tcyl('#8b8880', 0.014, 0.014, 0.2, -5.0, 1.15, 2.66, 5));
      gs.push(tb('#2a2018', 0.9, 0.5, 0.5, -5.4, 0.25, -2.9));                                   // a keg out of service
      // dartboard on the −x wall
      const dTex = canvasTex(128, 128, (c, w, h) => { c.fillStyle = '#1b1410'; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 7); c.fill();
        for (const [r, col] of [[0.9, '#0e0b08'], [0.7, '#5a1a14'], [0.52, '#0e0b08'], [0.34, '#5a1a14'], [0.16, '#2f5d2a'], [0.08, '#8a1010']]) { c.fillStyle = col; c.beginPath(); c.arc(w / 2, h / 2, w / 2 * r, 0, 7); c.fill(); }
        c.strokeStyle = '#8a7248'; c.lineWidth = 1.5; for (let k = 0; k < 20; k++) { const a = k * PI / 10; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a) * w * 0.45, h / 2 + Math.sin(a) * w * 0.45); c.stroke(); } });
      gs.push(geoTint(new THREE.CircleGeometry(0.23, 18).rotateY(PI / 2).translate(-5.94, 1.7, 0.6), '#1b1410'));
      g.add(staticMesh(geoMerge(gs), propMat));
      g.add(staticMesh(new THREE.PlaneGeometry(0.44, 0.44).rotateY(PI / 2).translate(-5.93, 1.7, 0.6), new THREE.MeshStandardMaterial({ map: dTex, roughness: 0.85 })));
      const doorGs = [tb('#232622', 1.05, 2.18, 0.1, 4.8, 1.09, -4.9), tb('#31352f', 0.9, 2.04, 0.06, 4.8, 1.06, -4.83), tcyl('#9aa0a5', 0.02, 0.02, 0.16, 4.42, 1.15, -4.76, 5)];
      g.add(staticMesh(geoMerge(doorGs), propMat));
      const exitTex = canvasTex(256, 96, (c, w, h) => { c.fillStyle = '#0b9a50'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e9fff2'; c.lineWidth = 4; c.strokeRect(5, 5, w - 10, h - 10); c.fillStyle = '#f2fff7'; c.font = 'bold 54px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ВЫХОД', w / 2, h / 2 + 3); });
      g.add(staticMesh(new THREE.PlaneGeometry(0.6, 0.22).rotateY(PI).translate(4.8, 2.42, -4.96), new THREE.MeshBasicMaterial({ map: exitTex, color: new THREE.Color(1.4, 1.4, 1.4) })));
      const ex = new THREE.PointLight('#28d878', 2.4, 3.5, 2); ex.position.set(4.8, 2.3, -4.6); g.add(ex);
      // two posters: the beer of the place, and a card of somebody's fight night
      const poster = lines => canvasTex(256, 344, (c, w, h) => { c.fillStyle = lines.bg; c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 60; i++) c.fillRect(R() * w, R() * h, 2 + R() * 24, 2 + R() * 10);
        c.fillStyle = lines.ink; c.font = font(lines.big); c.textAlign = 'center'; lines.t.forEach((s, i) => { if (i === 0) c.fillText(s, w / 2, 110); else { c.font = `700 ${lines.sm}px "Oswald", Arial, sans-serif`; c.fillText(s, w / 2, 150 + i * 46); } }); });
      const pTex = [poster({ bg: '#6d1c1f', ink: '#f1e3c2', big: 64, sm: 26, t: ['ЖИТО', 'живое светлое', '0,5 — 120 ₽', 'на разлив'] }),
        poster({ bg: '#141822', ink: '#ffd98a', big: 54, sm: 24, t: ['БОЙ', 'пятница · 21:00', 'задний зал', 'вход свободный'] })];
      for (const [t, ry, x, z] of [[pTex[0], -PI / 2, BAR_HX - 0.02, -2.4], [pTex[1], PI, 3.35, -BAR_HZ + 0.02]])
        g.add(staticMesh(new THREE.PlaneGeometry(0.62, 0.84).rotateY(ry).translate(x, 1.75, z), new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.05 })));
    }

    /* ceiling, beams, and two pendant lamps over the floor — the ceiling and the rig go away for the top-down replay shot */
    const ceil = this.ceil = new THREE.Group(); g.add(ceil);
    { const gs = [];
      for (const z of [-2.6, 0.6]) gs.push(tb('#181008', 2 * BAR_HX, 0.14, 0.16, 0, BAR_HH - 0.12, z));
      ceil.add(staticMesh(geoMerge(gs), propMat));
      const shades = [], bulbs = [];
      for (const [x, z, y] of [[-1.15, -0.5, 2.55], [1.2, 0.75, 2.62]]) {
        shades.push(geoTint(new THREE.CylinderGeometry(0.055, 0.24, 0.19, 16, 1, true).translate(x, y + 0.1, z), '#27322c'), geoTint(new THREE.CylinderGeometry(0.006, 0.006, BAR_HH - y - 0.22, 4).translate(x, (BAR_HH + y + 0.2) / 2, z), '#0c0c0d'));
        bulbs.push(new THREE.SphereGeometry(0.05, 8, 6).translate(x, y - 0.02, z), new THREE.CircleGeometry(0.22, 14).rotateX(PI / 2).translate(x, y + 0.02, z));
        const sp = new THREE.SpotLight('#ffbe7e', 22, 7.5, 1.0, 0.9, 1.5); sp.position.set(x, y, z); sp.target.position.set(x, 0, z); ceil.add(sp, sp.target);
        glow(new V3(x, y - 0.02, z), 1.1, new THREE.Color(2.2, 1.3, 0.5)); }
      ceil.add(staticMesh(geoMerge(shades), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide })));
      ceil.add(staticMesh(geoMerge(bulbs), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.2, 1.3), fog: false })));
      ceil.add(staticMesh(new THREE.PlaneGeometry(2 * BAR_HX, 2 * BAR_HZ).rotateX(PI / 2).translate(0, BAR_HH, 0), new THREE.MeshStandardMaterial({ color: '#0c0806', roughness: 1, envMapIntensity: 0.05 })));
    }

    /* the regulars: three rows against the invisible line, the front ones half on their haunches (some on the stools' side) */
    this.crowd = makeCrowd({ shape: 'rect', w: 2 * BAR_W, h: 2 * BAR_W, r: 0.55, rows: 3, look: 'street', seed: 73, max: 104, squat: 0.2 });
    g.add(this.crowd.group);
    return g;
  },
  // per frame, after the camera: hide the bar side and the tables once they get between the lens and the fighters
  sync() {
    const M = ARENA.matrixWorld, cam = camera.position;
    const dx = camL.x - cam.x, dz = camL.z - cam.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, tH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect * 1.1;
    for (const o of this.near) { _lp.copy(o.p).applyMatrix4(M); const px = _lp.x - cam.x, pz = _lp.z - cam.z, s = px * ux + pz * uz; o.m.visible = !(s > -o.r && s < len - 0.5 && Math.abs(px * uz - pz * ux) - o.r < Math.max(s, 0) * tH + 0.3); }
    this.ceil.visible = cam.y < 2.4;
  },
};
