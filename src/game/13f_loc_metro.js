/* ───────── location «Метро»: the island platform of a Soviet-style station («Ударная», invented) late at night, a ring of people ─────────
   Layout (ARENA frame, circle centre = origin, the default camera looks from +z; the station runs along x):
     platform  |x| < MT.L (27 m), |z| < MT.EZ (8 m), its top is y = 0; polished granite, a yellow tactile strip along both edges;
     columns   two rows at z = ±MT.CZ (5.6 m), every 5.5 m (x = ±2.75, ±8.25 …): stone cladding, a granite plinth, two double sconces each;
     vault     over the middle nave (springs at 4.3 m from the beams on the columns, 6.3 m at the crown), coffered, light coves along
               both springs, five chandeliers under the crown; flat ceilings with dome lamps over the two side naves;
     tracks    in pits 1.1 m deep beyond both edges (centre lines z = ±9.45), track walls at z = ±11.6 with the station name in bronze
               letters, posters in light boxes, cables; tunnels beyond x = ±27 (signal lights, lamps going away into the dark);
     −z track  the train (MT_TRAIN): pulls in from −x, brakes, stands with its doors open, leaves to +x — about once in 70 s;
     +x end    three escalators going up behind an arch, the attendant's booth;  −x end: a mosaic wall;
     hanging over the middle nave at x = ±8.25: «ВЫХОД В ГОРОД» light boxes with a clock.
   Nothing but the crowd stands within 6.2 m of the centre; the columns (ONE InstancedMesh with their sconces) are hidden one by one
   when they get between the camera and the fighters (`sync`).
   The polished floor: the static set, the lamps and the train have twins in `mir` (scale.y = −1, the same geometry and instance
   matrices) drawn under the floor, the floor itself is blended over them with a Fresnel alpha (`uRefl`). A twin's fragment is kept
   only if the ray from the camera to it crosses the platform top (`mirMat`) — nothing mirrored shows in the track pits. The fighters
   and the crowd have no reflection. GFX low: no twins, an opaque floor, fewer lamps, smaller textures.
   Extra lights: a warm spot over the circle, two warm points along the hall (one on low), one cold point that rides with the train. */
const MT = { L: 27, EZ: 8, CZ: 5.6, CW: 0.95, WZ: 11.6, PIT: 1.1, SPRING: 4.3, RISE: 2.0, BAY: 5.5, TZ: 9.45 };
// the train: wagons, their length and pitch (m), where its nose stops (x), speed at the far end of the run-in (m/s), run-in / stop / run-out / empty track (s)
const MT_TRAIN = { n: 5, len: 19.2, pitch: 19.7, stop: 24.5, tIn: 12, run: 84, tDwell: 14, acc: 1.0, tOut: 15.5, tIdle: 30, doors: [-7.2, -2.4, 2.4, 7.2] };

LOCS.metro = {
  id: 'metro', label: 'Метро', desc: 'Ночная станция «Ударная», круг из людей на платформе', bound: { kind: 'circle', r: 2.5 }, ring: false,
  // the people are the wall, as in the yard (see 13c_loc_yard.js): the chests of the front row, a soft spring, little damping
  wall: { r: 2.85, k: 1.0e4, mu: 0.75, h: 2.1, d: 1.2, give: 0.45, damp: 9, top() { return this.h; } },
  // warm chandeliers from above (the shared shadow light), a cold rim from the tunnels
  light: { bg: '#15110e', fog: ['#15110e', 12, 42], exposure: 0.84, hemi: ['#c4b6a6', '#2a2320', 0.24], key: ['#ffdfb2', 44], rim: ['#9cc4f5', 1.3], rim2: ['#ffb070', 1.5], fill: ['#ffe9d2', 0.42] },
  /* where the train is at time t of its cycle: x of its nose, speed (m/s), how far the doors are open (0..1), the phase */
  trainAt(t) {
    const T = MT_TRAIN, cyc = T.tIn + T.tDwell + T.tOut + T.tIdle, sm = u => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
    t = ((t % cyc) + cyc) % cyc;
    if (t < T.tIn) { const u = 1 - t / T.tIn; return { x: T.stop - T.run * u * u, v: 2 * T.run / T.tIn * u, door: 0, ph: 1 }; }
    t -= T.tIn; if (t < T.tDwell) return { x: T.stop, v: 0, door: sm((t - 1.2) / 1.3) * (1 - sm((t - T.tDwell + 3.2) / 1.3)), ph: 2 };
    t -= T.tDwell; if (t < T.tOut) return { x: T.stop + 0.5 * T.acc * t * t, v: T.acc * t, door: 0, ph: 3 };
    return { x: 1e3, v: 0, door: 0, ph: 0 };
  },
  build() {
    const R = locRng(4711), g = new THREE.Group(), PI = Math.PI, lite = lowEnd || GFX.level === 'low', TS = lite ? 0.5 : 1;
    const { L, EZ, CZ, CW, WZ, PIT, SPRING, RISE, BAY, TZ } = MT, VA = CZ - CW / 2;   // VA: half-width of the vault
    const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const speck = (c, w, h, n, a) => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * a})`; c.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2); } };
    const tb = (col, w, h, d, x, y, z, ry) => geoTint(geoBox(w, h, d, x, y, z, ry), col);
    const uvRect = (q, u0, v0, u1, v1) => { const u = q.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u0 + u.getX(i) * (u1 - u0), v0 + u.getY(i) * (v1 - v0)); return q; };
    const serif = px => `bold ${px}px "PT Serif", Georgia, "Times New Roman", "DejaVu Serif", serif`, sans = px => `bold ${px}px "PT Sans", Arial, "DejaVu Sans", sans-serif`;
    // stone: clouds, veins (random walks), grain
    const marble = (c, w, h, base, vein, n, x0 = 0, y0 = 0) => {
      c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip(); c.fillStyle = base; c.fillRect(x0, y0, w, h);
      for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '255,244,226' : '70,50,40'},${0.03 + R() * 0.06})`; c.beginPath(); c.ellipse(x0 + R() * w, y0 + R() * h, (0.1 + R() * 0.35) * w, (0.05 + R() * 0.2) * h, R() * 3, 0, 7); c.fill(); }
      c.strokeStyle = vein; c.lineCap = 'round';
      for (let i = 0; i < n; i++) { let x = x0 + R() * w, y = y0 + R() * h, a = R() * 6.3; const st = Math.max(w, h) * 0.035;
        c.globalAlpha = 0.1 + R() * 0.3; c.lineWidth = 0.5 + R() * 1.8; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 16; k++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * st; y += Math.sin(a) * st; c.lineTo(x, y); } c.stroke(); }
      c.globalAlpha = 1; c.restore();
    };
    /* a surface swept along x: profile [[z, y] …] from x0 to x1; u = x / ul, v = 0..1 along the profile; the normal is to the right
       of the direction of travel in the (z, y) plane seen from +x (a profile from −z over the top to +z faces down: a vault) */
    const sweep = (pts, x0, x1, ul) => {
      const n = pts.length, P = [], N = [], U = [], len = [0], nr = [];
      for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy) || 1; nr.push([dy / l, -dz / l]); }
      const v = (i, x) => { P.push(x, pts[i][1], pts[i][0]); N.push(0, nr[i][1], nr[i][0]); U.push(x / ul, len[i] / len[n - 1]); };
      for (let i = 0; i < n - 1; i++) {
        const dz = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], front = (-dy * nr[i][0] + dz * nr[i][1]) > 0;   // (edge along x) × (edge along the profile) = (0, −dz, dy)… against the normal
        if (front) { v(i, x0); v(i + 1, x0); v(i + 1, x1); v(i, x0); v(i + 1, x1); v(i, x1); } else { v(i, x0); v(i + 1, x1); v(i + 1, x0); v(i, x0); v(i, x1); v(i + 1, x1); }
      }
      const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); q.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); return q;
    };
    // a wall plane: from (x0, z0) to (x1, z1), y0 … y1, facing to the left of its direction seen from above (uv in metres / um)
    const wallP = (x0, z0, x1, z1, y0, y1, um = 1) => { const len = Math.hypot(x1 - x0, z1 - z0); return geoUvMul(new THREE.PlaneGeometry(len, y1 - y0), len / um, (y1 - y0) / um).rotateY(Math.atan2(-(z1 - z0), x1 - x0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); };
    const flatP = (w, d, x, y, z, up = true) => new THREE.PlaneGeometry(w, d).rotateX(up ? -PI / 2 : PI / 2).translate(x, y, z);

    /* ── the mirrored twins for the floor ── */
    const mirU = this.mirU = { uMirI: { value: new M4() }, uMirC: { value: new V3(0, 1, 0) } };
    const mir = this.mir = new THREE.Group(); mir.scale.y = -1; g.add(mir);
    const mirMat = m => { const c = m.clone(); c.onBeforeCompile = sh => { sh.uniforms.uMirI = mirU.uMirI; sh.uniforms.uMirC = mirU.uMirC;
      sh.vertexShader = 'uniform mat4 uMirI; varying vec3 vMirP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vec4 mirW = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n  mirW = instanceMatrix * mirW;\n#endif\n  vMirP = (uMirI * (modelMatrix * mirW)).xyz;');
      sh.fragmentShader = 'uniform vec3 uMirC; varying vec3 vMirP;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n  { float mt = uMirC.y / max(1e-4, uMirC.y - vMirP.y); vec2 mq = uMirC.xz + (vMirP.xz - uMirC.xz) * mt; if (vMirP.y > -0.002 || abs(mq.x) > ${L.toFixed(2)} || abs(mq.y) > ${EZ.toFixed(2)}) discard; }`).replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.rgb *= exp(vMirP.y * 0.22);'); };
      c.customProgramCacheKey = () => 'mtmir'; return c; };
    const twin = (o, to = mir) => { if (lite) return o; const t = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, mirMat(o.material), o.count) : new THREE.Mesh(o.geometry, mirMat(o.material));
      if (o.isInstancedMesh) { t.instanceMatrix = o.instanceMatrix; if (o.instanceColor) t.instanceColor = o.instanceColor; }
      t.frustumCulled = false; t.matrixAutoUpdate = false; t.matrix.copy(o.matrix); to.add(t); return o; };
    const add = (o, refl) => { g.add(o); if (refl) twin(o); return o; };

    /* ── floor: 4 m of the pattern along the platform × its whole width. Middle nave: a chequer of two grey granites; a red band and a
       black one under the columns; grey slabs in the side naves; the tactile strip, the pale edge stone with a white line ── */
    const floorTex = rep(canvasTex(512 * TS, 2048 * TS, (c, w, h) => {
      const s = w / 4, zp = z => (z + EZ) * s;
      const slab = (x, z0, z1, col) => { c.fillStyle = col; c.fillRect(x * s, zp(z0), s, (z1 - z0) * s); const k = R() * 0.08; c.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${k})`; c.fillRect(x * s, zp(z0), s, (z1 - z0) * s); };
      for (let x = 0; x < 4; x++) {
        for (let z = -5; z < 5; z++) slab(x, z, z + 1, (x + z) & 1 ? '#57534e' : '#3d3a36');
        for (const sg of [-1, 1]) { const a = (u, v2) => sg > 0 ? [u, v2] : [-v2, -u];
          slab(x, ...a(4.4, 4.9), '#6b2c25'); slab(x, ...a(4.9, 6.3), '#1c1d20'); slab(x, ...a(6.3, 7.1), x & 1 ? '#56524d' : '#4d4a45'); slab(x, ...a(7.1, 7.5), '#c99a12'); slab(x, ...a(7.5, 8), '#857f75'); }
      }
      speck(c, w, h, w * h / 9, 0.13);
      for (let i = 0; i < w * h / 40; i++) { c.fillStyle = `rgba(${R() < 0.4 ? '230,210,190' : '20,16,14'},${0.1 + R() * 0.25})`; c.fillRect(R() * w, R() * h, 1 + R() * 2.5, 1 + R() * 2.5); }   // the crystals of the granite
      for (const sg of [-1, 1]) {   // the bumps of the tactile strip, the white line
        for (let x = 0.05; x < 4; x += 0.1) for (let z = 7.15; z < 7.5; z += 0.1) { const px = x * s, pz = zp(sg * z); c.fillStyle = 'rgba(255,236,150,.5)'; c.beginPath(); c.arc(px, pz - 0.006 * s, 0.03 * s, 0, 7); c.fill(); c.fillStyle = 'rgba(70,45,0,.45)'; c.beginPath(); c.arc(px, pz + 0.008 * s, 0.028 * s, 0, 7); c.fill(); c.fillStyle = '#d9a918'; c.beginPath(); c.arc(px, pz, 0.024 * s, 0, 7); c.fill(); }
        c.fillStyle = 'rgba(236,232,220,.85)'; c.fillRect(0, zp(sg * 7.62) - 0.04 * s, w, 0.08 * s);
      }
      c.fillStyle = 'rgba(8,7,6,.7)';   // joints
      for (let x = 0; x < 4; x++) c.fillRect(x * s, 0, 1, h); for (let z = -8; z <= 8; z++) if (Math.abs(z) <= 4 || Math.abs(z) === 7) c.fillRect(0, zp(z), w, 1);
      for (const z of [4.4, 4.9, 6.3, 7.1, 7.5]) for (const sg of [-1, 1]) c.fillRect(0, zp(sg * z), w, 1);
      for (let i = 0; i < 60; i++) { const x = R() * w, y = R() * h, r = (20 + R() * 90) * TS, gr = c.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(12,10,9,${0.05 + R() * 0.1})`); gr.addColorStop(1, 'rgba(12,10,9,0)'); c.fillStyle = gr; c.fillRect(x - r, y - r, 2 * r, 2 * r); }   // what thousands of feet leave
    }));
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, metalness: 0.0, envMapIntensity: 0.3, transparent: !lite });
    const uRefl = this.uRefl = { value: lite ? 0 : 1 };
    if (!lite) { floorMat.onBeforeCompile = sh => { sh.uniforms.uRefl = uRefl;   // the more grazing the look, the more of the mirrored set shows through
      sh.fragmentShader = 'uniform float uRefl;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a = 1.0 - uRefl * mix(0.03, 0.5, pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0));'); }; }
    const floor = staticMesh(geoUvMul(new THREE.PlaneGeometry(2 * L, 2 * EZ).rotateX(-PI / 2), 2 * L / 4, 1), floorMat); floor.receiveShadow = true; floor.renderOrder = -30; g.add(floor);

    /* ── materials shared by the set ── */
    const stoneTex = rep(canvasTex(512 * TS, 512 * TS, (c, w, h) => { marble(c, w, h, '#d8cdb9', '#7b6452', 26); speck(c, w, h, 9000 * TS, 0.06); c.fillStyle = 'rgba(40,30,24,.55)'; c.fillRect(0, 0, w, 2); c.fillRect(0, 0, 2, h); c.fillRect(w / 2, 0, 1, h); }));
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, vertexColors: true, roughness: 0.5, envMapIntensity: 0.3, emissive: '#fff1dc', emissiveMap: stoneTex, emissiveIntensity: 0.05 });
    const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, envMapIntensity: 0.3 });
    const brassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.85, envMapIntensity: 1.1, emissive: '#3a2408', emissiveIntensity: 0.5 });
    const litMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), lit = (q, r, gg, b) => { const n = q.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; } q.setAttribute('color', new THREE.BufferAttribute(a, 3)); return q; };   // linear, above 1 = it blooms
    const WARM = [3.0, 2.25, 1.3], COLD = [1.5, 2.1, 2.9];
    const stone = [], props = [], brass = [], lamps = [];

    /* ── columns: one textured box set per column (plinth, shaft of three slabs, stepped capital) with a double sconce on the faces
       towards the hall and the platform edge; the globes glow through the emissive map, which also carries their pool of light on the stone ── */
    const colDraw = em => (c, w, h) => {
      const py = v => h * (1 - v), box = (col, v0, v1, u0 = 0, u1 = 1) => { c.fillStyle = col; c.fillRect(u0 * w, py(v1), (u1 - u0) * w, py(v0) - py(v1)); };
      c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
      if (!em) {
        marble(c, w, py(0.07) - py(0.86), '#dccdb6', '#8a6a55', 22, 0, py(0.86)); for (const v of [0.335, 0.6]) box('rgba(50,36,28,.6)', v, v + 0.0025); box('rgba(40,28,20,.35)', 0.07, 0.86, 0, 0.012); box('rgba(40,28,20,.35)', 0.07, 0.86, 0.988, 1);
        marble(c, w, py(0) - py(0.065), '#5a2a25', '#1c0f0d', 10, 0, py(0.065)); speck(c, w, h, 14000 * TS, 0.07);
        box('#cdbfa8', 0.87, 0.93); box('#a67a2c', 0.895, 0.905); box('#8f6a25', 0.94, 1, 0, 0.5); box('#fff3dc', 0.94, 1, 0.5, 1);
      } else {
        const y = py(0.07 + 0.79 * (2.55 - 0.3) / 3.3), gr = c.createRadialGradient(w / 2, y, 0, w / 2, y, w * 1.5); gr.addColorStop(0, 'rgba(255,196,120,.34)'); gr.addColorStop(0.35, 'rgba(255,180,100,.13)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
        c.save(); c.beginPath(); c.rect(0, py(0.86), w, py(0.07) - py(0.86)); c.clip(); c.fillStyle = '#16110c'; c.fillRect(0, 0, w, h); c.fillStyle = gr; c.fillRect(0, y - w * 1.5, w, w * 3); c.restore();
        box('#ffe9c4', 0.94, 1, 0.5, 1);
      }
    };
    const colTex = canvasTex(256 * TS, 1024 * TS, colDraw(false)), colEm = canvasTex(128, 512, colDraw(true));
    const colMat = new THREE.MeshStandardMaterial({ map: colTex, emissiveMap: colEm, emissive: new THREE.Color(2.6, 2.6, 2.6), roughness: 0.42, envMapIntensity: 0.35 });
    const colGs = [uvRect(geoBox(CW + 0.12, 0.3, CW + 0.12, 0, 0.15, 0), 0, 0.005, 1, 0.06), uvRect(geoBox(CW, 3.3, CW, 0, 1.95, 0), 0, 0.07, 1, 0.86), uvRect(geoBox(CW + 0.08, 0.12, CW + 0.08, 0, 3.66, 0), 0, 0.875, 1, 0.925), uvRect(geoBox(CW + 0.16, 0.18, CW + 0.16, 0, 3.81, 0), 0, 0.875, 1, 0.925)];
    const BR = [0.05, 0.95, 0.45, 0.99], GL = [0.55, 0.95, 0.95, 0.99];
    for (const sz of [-1, 1]) { const z0 = sz * CW / 2;
      colGs.push(uvRect(geoBox(0.46, 0.1, 0.03, 0, 2.42, z0 + sz * 0.015), ...BR), uvRect(geoBox(0.06, 0.34, 0.035, 0, 2.5, z0 + sz * 0.02), ...BR));
      for (const sx of [-1, 1]) colGs.push(uvRect(new THREE.CylinderGeometry(0.075, 0.03, 0.09, 8).translate(sx * 0.17, 2.47, z0 + sz * 0.12), ...BR), uvRect(geoBox(0.03, 0.03, 0.12, sx * 0.17, 2.43, z0 + sz * 0.06), ...BR),
        uvRect(new THREE.SphereGeometry(0.1, 10, 7).scale(1, 1.2, 1).translate(sx * 0.17, 2.61, z0 + sz * 0.12), ...GL)); }
    this.cols = []; for (const sz of [-1, 1]) for (let x = -L + BAY * 0.409; x < L; x += BAY) this.cols.push({ p: new V3(x, 1.5, sz * CZ), mat: new M4().makeRotationY(sz > 0 ? 0 : PI).setPosition(x, 0, sz * CZ), h: false });
    const colM = this.colMesh = new THREE.InstancedMesh(geoMerge(colGs), colMat, this.cols.length);
    this.cols.forEach((c, i) => colM.setMatrixAt(i, c.mat)); colM.matrixAutoUpdate = false; colM.frustumCulled = false; colM.receiveShadow = true; this.zero = new M4().makeScale(0, 0, 0); add(colM, true);
    const colX = this.cols.filter(c => c.p.z > 0).map(c => c.p.x);

    /* ── the beams on the columns, the vault with its coves, the ceilings of the side naves (all hidden when the camera rises above them) ── */
    const ceil = this.ceil = new THREE.Group(); g.add(ceil); const ceilM = this.ceilM = new THREE.Group(); mir.add(ceilM);
    const addC = (o, refl) => { ceil.add(o); if (refl) twin(o, ceilM); return o; };
    const CREAM = '#e6dcc8', topGs = [];
    for (const sz of [-1, 1]) { topGs.push(geoTint(geoUvMul(geoBox(2 * L, 0.4, CW + 0.16, 0, 4.1, sz * CZ), 9, 0.2), '#cbbfa8'));
      topGs.push(geoTint(geoUvMul(flatP(2 * L, WZ - CZ, 0, SPRING, sz * (WZ + CZ) / 2, false), 9, 1), '#a79c8b'));
      for (const x of colX) topGs.push(geoTint(geoBox(0.5, 0.3, WZ - CZ, x, SPRING - 0.15, sz * (WZ + CZ) / 2), '#bdb19c'));
      brass.push(tb('#b98a34', 2 * L, 0.04, CW + 0.19, 0, 3.94, sz * CZ)); }
    addC(staticMesh(geoMerge(topGs), stoneMat), true);
    const vaultDraw = em => (c, w, h) => {
      c.fillStyle = '#d9cdb6'; c.fillRect(0, 0, w, h); const nu = 5, nv = 10, cu = w / nu, cv = h * 0.86 / nv, y0 = h * 0.07;
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const x = i * cu + cu * 0.13, y = y0 + j * cv + cv * 0.13, ww = cu * 0.74, hh = cv * 0.74;
        c.fillStyle = '#a3957e'; c.fillRect(x, y, ww, hh); c.fillStyle = '#c4b79f'; c.fillRect(x + ww * 0.12, y + hh * 0.12, ww * 0.76, hh * 0.76); c.fillStyle = 'rgba(40,28,18,.4)'; c.fillRect(x, y, ww, hh * 0.1); c.fillRect(x, y, ww * 0.07, hh);
        c.fillStyle = 'rgba(255,246,226,.5)'; c.fillRect(x, y + hh * 0.93, ww, hh * 0.07); c.fillStyle = '#b08a3e'; c.beginPath(); c.arc(x + ww / 2, y + hh / 2, ww * 0.1, 0, 7); c.fill(); }
      for (const y of [0, h * 0.94]) { c.fillStyle = '#b9ab92'; c.fillRect(0, y, w, h * 0.06); c.fillStyle = '#a27c34'; for (let i = 0; i < 20; i++) c.fillRect((i + 0.2) * w / 20, y + h * 0.018, w / 20 * 0.6, h * 0.024); }
      speck(c, w, h, 5000, 0.05);
      if (em) { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.2, 'rgba(0,0,0,.45)'); gr.addColorStop(0.5, 'rgba(0,0,0,.66)'); gr.addColorStop(0.8, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }   // the coves light the haunches, the crown stays dimmer
    };
    const vaultTex = rep(canvasTex(512 * TS, 1024 * TS, vaultDraw(false))), vaultEm = rep(canvasTex(256, 512, vaultDraw(true)));
    const arc = []; for (let i = 0; i <= 18; i++) { const a = PI * i / 18; arc.push([-VA * Math.cos(a), SPRING + RISE * Math.sin(a)]); }
    addC(staticMesh(sweep(arc, -L, L + 0.01, BAY), new THREE.MeshStandardMaterial({ map: vaultTex, emissiveMap: vaultEm, emissive: '#ffc98c', emissiveIntensity: 0.42, roughness: 0.85, envMapIntensity: 0.2 })), true);
    const ceilLit = [];
    for (const sz of [-1, 1]) { ceilLit.push(lit(geoBox(2 * L, 0.05, 0.22, 0, SPRING + 0.06, sz * (VA - 0.2)), 1.7, 1.2, 0.62));
      for (let x = -L + BAY * 0.909; x < L; x += lite ? 2 * BAY : BAY) ceilLit.push(lit(new THREE.SphereGeometry(0.2, 10, 5, 0, 2 * PI, PI / 2, PI / 2).translate(x, SPRING, sz * 7.0), 1.7, 2.1, 2.5)); }   // (the side naves are lit colder)
    addC(staticMesh(geoMerge(ceilLit), litMat), true);
    /* chandeliers: a rod from the crown, two bronze rings, twelve globes */
    const CHX = [-22, -11, 0, 11, 22], chB = [new THREE.CylinderGeometry(0.025, 0.025, 1.25, 6).translate(0, 5.68, 0), new THREE.TorusGeometry(0.9, 0.035, 6, 28).rotateX(PI / 2).translate(0, 4.95, 0), new THREE.TorusGeometry(0.48, 0.03, 6, 20).rotateX(PI / 2).translate(0, 4.68, 0), new THREE.SphereGeometry(0.09, 8, 6).translate(0, 5.06, 0), new THREE.CylinderGeometry(0.02, 0.02, 0.4, 5).translate(0, 4.86, 0)], chG = [];
    for (let k = 0; k < 4; k++) chB.push(new THREE.CylinderGeometry(0.012, 0.012, 0.92, 4).rotateZ(PI / 2 - 0.12).rotateY(k * PI / 2 + PI / 4).translate(Math.cos(k * PI / 2 + PI / 4) * -0.45, 5.0, Math.sin(k * PI / 2 + PI / 4) * 0.45));
    for (let k = 0; k < 8; k++) { const a = k * PI / 4; chG.push(new THREE.SphereGeometry(0.13, 8, 6).translate(Math.cos(a) * 0.9, 5.1, Math.sin(a) * 0.9)); chB.push(new THREE.CylinderGeometry(0.07, 0.03, 0.07, 6).translate(Math.cos(a) * 0.9, 4.99, Math.sin(a) * 0.9)); }
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; chG.push(new THREE.SphereGeometry(0.11, 8, 6).translate(Math.cos(a) * 0.48, 4.82, Math.sin(a) * 0.48)); }
    const m4 = new M4(), chBm = new THREE.InstancedMesh(geoTint(geoMerge(chB), '#b98a34'), brassMat, CHX.length), chGm = new THREE.InstancedMesh(lit(geoMerge(chG), ...WARM), litMat, CHX.length);
    CHX.forEach((x, i) => { m4.makeTranslation(x, 0, 0); chBm.setMatrixAt(i, m4); chGm.setMatrixAt(i, m4); });
    for (const o of [chBm, chGm]) { o.matrixAutoUpdate = false; o.frustumCulled = false; } addC(chBm); addC(chGm, true);

    /* ── track walls: below the platform bare concrete, a black dado, cream tiles, a red frieze; one bay of 5.5 m per repeat ── */
    const WH = SPRING + PIT, wallDraw = em => (c, w, h) => {
      const py = y => h * (1 - (y + PIT) / WH), band = (col, y0, y1) => { c.fillStyle = col; c.fillRect(0, py(y1), w, py(y0) - py(y1)); };
      marble(c, w, h, '#d5c9b2', '#8d7862', 30); c.fillStyle = 'rgba(60,46,36,.5)';
      for (let y = 0.9; y < 3.7; y += 0.45) c.fillRect(0, py(y), w, 1); for (let i = 0; i < 12; i++) for (let j = 0; j < 7; j++) c.fillRect((i + (j & 1) * 0.5) * w / 12, py(0.9 + (j + 1) * 0.45), 1, py(0) - py(0.45));
      marble(c, w, py(0) - py(0.9), '#1d1b1c', '#55504c', 8, 0, py(0.9)); band('#a67a2c', 0.9, 0.94); marble(c, w, py(3.7) - py(4.0), '#6b2c25', '#2b1512', 6, 0, py(4.0)); band('#bfb39c', 4.0, 4.3); band('#3a3835', -PIT, 0);
      speck(c, w, h, 16000 * TS, 0.07);
      for (let i = 0; i < 16; i++) { const x = R() * w, y = py(R() * 3.6), l = 30 + R() * 120, gr = c.createLinearGradient(0, y, 0, y + l); gr.addColorStop(0, `rgba(30,22,16,${0.05 + R() * 0.1})`); gr.addColorStop(1, 'rgba(30,22,16,0)'); c.fillStyle = gr; c.fillRect(x, y, 3 + R() * 10, l); }
      if (em) { const gr = c.createLinearGradient(0, py(4.3), 0, py(-PIT)); gr.addColorStop(0, 'rgba(0,0,0,.25)'); gr.addColorStop(0.45, 'rgba(0,0,0,.5)'); gr.addColorStop(0.8, 'rgba(0,0,0,.93)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }   // lit by the dome lamps above, dark down in the pit
    };
    const wallTex = rep(canvasTex(1024 * TS, 1024 * TS, wallDraw(false))), wallEm = rep(canvasTex(256, 256, wallDraw(true)));
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, emissiveMap: wallEm, emissive: '#cdd8e6', emissiveIntensity: 0.15, roughness: 0.4, envMapIntensity: 0.3 });
    const wallGs = []; for (const sz of [-1, 1]) wallGs.push(geoUvMul(new THREE.PlaneGeometry(2 * L, WH), 2 * L / BAY, 1).rotateY(sz > 0 ? PI : 0).translate(0, WH / 2 - PIT, sz * WZ));
    add(staticMesh(geoMerge(wallGs), wallMat), true);
    /* the station name: bronze letters standing off the wall, three times on each side */
    const nameTex = canvasTex(1024, 160, (c, w, h) => { c.font = serif(118); c.textAlign = 'center'; c.textBaseline = 'middle'; try { c.letterSpacing = '14px'; } catch (e) {}
      c.fillStyle = '#2a1a08'; c.fillText('УДАРНАЯ', w / 2 + 5, h / 2 + 9); const gr = c.createLinearGradient(0, 20, 0, h - 20); gr.addColorStop(0, '#f1cd7c'); gr.addColorStop(0.45, '#c2913a'); gr.addColorStop(0.55, '#8f6522'); gr.addColorStop(1, '#c79a45'); c.fillStyle = gr; c.fillText('УДАРНАЯ', w / 2, h / 2 + 4);
      c.strokeStyle = 'rgba(255,236,180,.7)'; c.lineWidth = 1.5; c.strokeText('УДАРНАЯ', w / 2 - 1, h / 2 + 3); });
    const nameGs = []; for (const sz of [-1, 1]) for (const x of [-16.5, 0, 16.5]) nameGs.push(new THREE.PlaneGeometry(5.4, 0.84).rotateY(sz > 0 ? PI : 0).translate(x, 3.05, sz * (WZ - 0.03)));
    add(staticMesh(geoMerge(nameGs), new THREE.MeshStandardMaterial({ map: nameTex, alphaTest: 0.5, roughness: 0.38, metalness: 0.6, envMapIntensity: 1.2, emissive: '#ffffff', emissiveMap: nameTex, emissiveIntensity: 0.32 })), true);

    /* ── light boxes: one atlas — the exit sign, the clocks, four posters (all invented) ── */
    const AT = 1024, atlas = canvasTex(AT, AT, (c, w) => {
      const tx = (s, x, y, f, col, al = 'center') => { c.font = f; c.fillStyle = col; c.textAlign = al; c.textBaseline = 'middle'; c.fillText(s, x, y); };
      c.fillStyle = '#000'; c.fillRect(0, 0, w, w);
      // exit sign 640 × 128
      c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, 640, 128); c.fillStyle = '#16181c'; c.fillRect(0, 0, 640, 8); c.fillRect(0, 120, 640, 8); tx('ВЫХОД В ГОРОД', 280, 66, sans(60), '#15171a');
      c.fillStyle = '#b3261e'; c.beginPath(); c.moveTo(560, 34); c.lineTo(618, 64); c.lineTo(560, 94); c.lineTo(560, 76); c.lineTo(520, 76); c.lineTo(520, 52); c.lineTo(560, 52); c.fill();
      // the clock over a tunnel 384 × 128: the time, the interval since the last train
      c.fillStyle = '#0a0806'; c.fillRect(640, 0, 384, 128); tx('01:47', 800, 68, 'bold 76px "DejaVu Sans Mono", "Courier New", monospace', '#ff8a1e'); tx('2:35', 965, 72, 'bold 40px "DejaVu Sans Mono", "Courier New", monospace', '#ff5a16');
      // a round clock 256 × 256 at (0, 128)
      { const x = 128, y = 256; c.fillStyle = '#16130f'; c.fillRect(0, 128, 256, 256); c.fillStyle = '#f6f0de'; c.beginPath(); c.arc(x, y, 118, 0, 7); c.fill(); c.strokeStyle = '#1a1714'; c.lineCap = 'butt';
        for (let k = 0; k < 12; k++) { const a = k * PI / 6; c.lineWidth = k % 3 ? 5 : 10; c.beginPath(); c.moveTo(x + Math.sin(a) * 96, y - Math.cos(a) * 96); c.lineTo(x + Math.sin(a) * 112, y - Math.cos(a) * 112); c.stroke(); }
        const hand = (a, l, lw) => { c.lineWidth = lw; c.beginPath(); c.moveTo(x - Math.sin(a) * 14, y + Math.cos(a) * 14); c.lineTo(x + Math.sin(a) * l, y - Math.cos(a) * l); c.stroke(); }; hand((1 + 47 / 60) * PI / 6, 62, 12); hand(47 * PI / 30, 96, 7); c.fillStyle = '#b3261e'; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); }
      // a way-out plate for the track wall 512 × 96 at (256, 128)
      c.fillStyle = '#efeadb'; c.fillRect(256, 128, 512, 96); tx('← ВЫХОД В ГОРОД · К ПОЕЗДАМ →', 512, 178, sans(27), '#1b1d21');
      // posters 256 × 384 at y = 400
      const P = (i, bg, draw) => { const x0 = i * 256, y0 = 400; c.save(); c.beginPath(); c.rect(x0, y0, 256, 384); c.clip(); c.fillStyle = bg; c.fillRect(x0, y0, 256, 384); c.translate(x0, y0); draw(); c.restore(); c.strokeStyle = '#e9e2cf'; c.lineWidth = 6; c.strokeRect(x0 + 3, y0 + 3, 250, 378); };
      P(0, '#a3201a', () => { c.fillStyle = '#f0d9a0'; for (let k = 0; k < 14; k++) { c.beginPath(); c.moveTo(128, 210); c.arc(128, 210, 300, k * PI / 7, k * PI / 7 + 0.2); c.fill(); } c.fillStyle = '#a3201a'; c.beginPath(); c.arc(128, 210, 86, 0, 7); c.fill();
        c.fillStyle = '#f6ead0'; c.beginPath(); c.arc(128, 196, 44, 0, 7); c.fill(); c.fillRect(100, 226, 56, 30); c.fillStyle = '#a3201a'; c.fillRect(104, 238, 48, 3);   // a fist
        tx('БОИ', 128, 52, sans(64), '#fff3d6'); tx('БЕЗ ПЕРЧАТОК', 128, 312, sans(30), '#fff3d6'); tx('СУББОТА · 23:00', 128, 350, sans(22), '#f0d9a0'); });
      P(1, '#e9e0c8', () => { c.fillStyle = '#2f6b8a'; c.fillRect(0, 0, 256, 120); tx('КВАС', 128, 62, serif(68), '#f4ecd6'); c.fillStyle = '#7a3d14'; c.beginPath(); c.moveTo(84, 150); c.lineTo(172, 150); c.lineTo(160, 300); c.lineTo(96, 300); c.fill(); c.fillStyle = '#f3ead2'; c.beginPath(); c.ellipse(128, 150, 46, 16, 0, 0, 7); c.fill(); c.fillStyle = 'rgba(255,230,170,.35)'; c.fillRect(100, 170, 12, 110);
        tx('«ХЛЕБНЫЙ»', 128, 338, serif(30), '#7a3d14'); tx('из бочки — как раньше', 128, 366, sans(15), '#3a2a1c'); });
      P(2, '#16263f', () => { for (let k = 0; k < 60; k++) { c.fillStyle = `rgba(255,240,200,${0.3 + R() * 0.7})`; c.fillRect(R() * 256, R() * 200, 2, 2); } c.fillStyle = '#e8b53a'; c.beginPath(); c.arc(190, 70, 30, 0, 7); c.fill(); c.fillStyle = '#16263f'; c.beginPath(); c.arc(178, 62, 28, 0, 7); c.fill();
        c.fillStyle = '#0b1424'; for (let k = 0; k < 9; k++) { const hh = 40 + R() * 90; c.fillRect(k * 30, 250 - hh, 26, hh); } tx('КИНОТЕАТР «ЗАРЯ»', 128, 286, sans(22), '#e8b53a'); tx('ПОСЛЕДНИЙ', 128, 322, serif(32), '#f2ecdc'); tx('РАУНД', 128, 356, serif(34), '#f2ecdc'); });
      P(3, '#e3dccb', () => { c.fillStyle = '#1d6a4c'; c.fillRect(0, 0, 256, 96); tx('ГОРСПРАВКА', 128, 50, sans(32), '#f1ecda'); c.strokeStyle = '#1d6a4c'; c.lineWidth = 5; for (const [x0, y0, x1, y1] of [[40, 150, 216, 150], [128, 110, 128, 290], [40, 250, 216, 190], [60, 120, 190, 280]]) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
        c.fillStyle = '#b3261e'; for (const [x, y] of [[128, 150], [84, 230], [170, 205], [128, 250]]) { c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); } tx('схема линий', 128, 318, sans(20), '#2a2a2a'); tx('телефон 0-00', 128, 350, sans(26), '#1d6a4c'); });
    });
    const atq = (q, x, y, w, h) => uvRect(q, x / AT, 1 - (y + h) / AT, (x + w) / AT, 1 - y / AT);
    const signs = [], faceX = (w, h, x, y, z, sx) => new THREE.PlaneGeometry(w, h).rotateY(sx * PI / 2).translate(x, y, z), faceZ = (w, h, x, y, z, sz) => new THREE.PlaneGeometry(w, h).rotateY(sz > 0 ? PI : 0).translate(x, y, z);   // faceZ: on the wall at +z / −z, looking at the hall
    for (const sz of [-1, 1]) {
      [-22, -11, -5.5, 5.5, 11, 22].forEach((x, i) => { signs.push(atq(faceZ(1.2, 1.8, x, 1.95, sz * (WZ - 0.07), sz), ((i + (sz > 0 ? 2 : 0)) % 4) * 256, 400, 256, 384)); props.push(tb('#2a2420', 1.32, 1.92, 0.06, x, 1.95, sz * (WZ - 0.035))); });
      for (const x of [-16.5, 0, 16.5]) signs.push(atq(faceZ(2.4, 0.3, x, 2.32, sz * (WZ - 0.02), sz), 256, 128, 512, 96));
      for (const sx of [-1, 1]) { signs.push(atq(faceX(1.5, 0.5, sx * (L - 0.06), 3.8, sz * 9.8, -sx), 640, 0, 384, 128)); props.push(tb('#17130f', 0.08, 0.6, 1.6, sx * (L - 0.03), 3.8, sz * 9.8)); }
    }
    for (const x of [-8.25, 8.25]) {   // hanging over the middle nave: a light box with the way out on both faces, a clock under it
      for (const sx of [-1, 1]) signs.push(atq(faceX(2.5, 0.5, x + sx * 0.09, 3.55, 0, sx), 0, 0, 640, 128), atq(faceX(0.62, 0.62, x + sx * 0.07, 2.9, 0, sx), 0, 128, 256, 256));
      props.push(tb('#1b1714', 0.16, 0.56, 2.56, x, 3.55, 0), geoTint(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 20).rotateZ(PI / 2).translate(x, 2.9, 0), '#1b1714'));
      for (const z of [-1.0, 1.0]) brass.push(tb('#b98a34', 0.03, 2.25, 0.03, x, 4.95, z)); brass.push(tb('#b98a34', 0.04, 0.1, 0.04, x, 3.24, 0));
    }

    /* ── platform sides, pits, rails, tunnels ── */
    const bedTex = rep(canvasTex(64, 256, (c, w, h) => { c.fillStyle = '#211e1b'; c.fillRect(0, 0, w, h); speck(c, w, h, 2600, 0.2); c.fillStyle = '#3a342d'; c.fillRect(w * 0.3, h * 0.12, w * 0.42, h * 0.76); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(w * 0.3, h * 0.12, w * 0.42, 3); }));
    const bedGs = []; for (const sz of [-1, 1]) bedGs.push(geoUvMul(flatP(84, WZ - EZ, 0, -PIT, sz * (WZ + EZ) / 2), 140, 1));
    g.add(staticMesh(geoMerge(bedGs), new THREE.MeshStandardMaterial({ map: bedTex, roughness: 0.95, envMapIntensity: 0.15 })));
    const DARK = '#1a1816';
    for (const sz of [-1, 1]) {
      props.push(tb('#34312d', 2 * L, PIT - 0.06, 0.1, 0, -PIT / 2 - 0.03, sz * (EZ - 0.05)), tb('#8d877c', 2 * L, 0.06, 0.16, 0, -0.03, sz * (EZ - 0.06)));   // the face of the platform, its lip
      for (const o of [-0.76, 0.76]) props.push(tb('#5e6064', 84, 0.14, 0.07, 0, -PIT + 0.1, sz * (TZ + o)));   // rails
      props.push(tb('#8a7a4a', 84, 0.08, 0.16, 0, -PIT + 0.4, sz * (EZ + 0.28)), tb('#2a2826', 84, 0.3, 0.05, 0, -PIT + 0.2, sz * (EZ + 0.28)));   // the contact rail under its cover
      for (const y of [1.3, 1.42, 3.5]) props.push(tb('#16140f', 84, 0.045, 0.045, 0, y - 1.1 + 0.2, sz * (WZ - 0.06)));   // cables along the wall (below the dado line and under the frieze)
      for (const sx of [-1, 1]) {   // the end wall of a side nave with the tunnel mouth, the tunnel itself
        const x0 = sx * L, x1 = sx * 42, a = sx * sz;
        stone.push(geoTint(a > 0 ? wallP(x0, sz * VA, x0, sz * EZ, 0, SPRING, 2) : wallP(x0, sz * EZ, x0, sz * VA, 0, SPRING, 2), CREAM), geoTint(a > 0 ? wallP(x0, sz * EZ, x0, sz * WZ, 3.4, SPRING, 2) : wallP(x0, sz * WZ, x0, sz * EZ, 3.4, SPRING, 2), CREAM));
        props.push(geoTint(a > 0 ? wallP(x1, sz * EZ, x0, sz * EZ, -PIT, 3.4) : wallP(x0, sz * EZ, x1, sz * EZ, -PIT, 3.4), DARK), geoTint(a > 0 ? wallP(x0, sz * WZ, x1, sz * WZ, -PIT, 3.4) : wallP(x1, sz * WZ, x0, sz * WZ, -PIT, 3.4), DARK),
          geoTint(flatP(15, WZ - EZ, sx * (L + 7.5), 3.4, sz * (WZ + EZ) / 2, false), DARK));
        for (let k = 0; k < 4; k++) lamps.push(lit(geoBox(0.12, 0.08, 0.05, sx * (L + 2.5 + k * 3.6), 2.5, sz * (WZ - 0.04)), ...COLD.map(v => v * (0.9 - k * 0.15))));
        const red = (sx > 0) === (sz < 0);   // the −z track runs to +x: red behind the train's way out, green where it comes from
        lamps.push(lit(new THREE.SphereGeometry(0.07, 8, 6).translate(sx * (L + 0.5), 2.0, sz * (EZ + 0.16)), ...(red ? [4, 0.25, 0.15] : [0.2, 3.4, 0.9])), lit(new THREE.SphereGeometry(0.05, 8, 6).translate(sx * (L + 0.5), 1.75, sz * (EZ + 0.16)), 0.5, 1.2, 3.6));
        props.push(tb('#0d0d0d', 0.12, 0.62, 0.14, sx * (L + 0.56), 1.9, sz * (EZ + 0.1)));
      }
    }

    /* ── the −x end: a mosaic wall (sunburst, two boxers, a ribbon); the +x end: an arch, three escalators going up, the booth ── */
    const outline = hole => { const s = new THREE.Shape(); s.moveTo(-VA, 0); s.lineTo(VA, 0); s.lineTo(VA, SPRING); for (let i = 1; i <= 18; i++) { const a = PI * i / 18; s.lineTo(VA * Math.cos(a), SPRING + RISE * Math.sin(a)); } s.lineTo(-VA, 0);
      if (hole) { const p = new THREE.Path(); p.moveTo(-3.7, 0); p.lineTo(-3.7, 2.6); for (let i = 1; i <= 12; i++) { const a = PI - PI * i / 12; p.lineTo(3.7 * Math.cos(a), 2.6 + 1.5 * Math.sin(a)); } p.lineTo(3.7, 0); p.lineTo(-3.7, 0); s.holes.push(p); } return s; };
    const mosTex = canvasTex(1024 * TS, 640 * TS, (c, w, h) => {
      const k = w / 1024; c.scale(k, k); c.fillStyle = '#c9a046'; c.fillRect(0, 0, 1024, 640);
      for (let i = 0; i < 24; i++) { c.fillStyle = i & 1 ? '#d9b65a' : '#b9862e'; c.beginPath(); c.moveTo(512, 400); c.arc(512, 400, 900, PI + i * PI / 24, PI + (i + 1) * PI / 24); c.fill(); }
      c.fillStyle = '#b3371f'; c.beginPath(); c.arc(512, 400, 150, 0, 7); c.fill(); c.fillStyle = '#d5562a'; c.beginPath(); c.arc(512, 400, 112, 0, 7); c.fill();
      const man = (x, d, col) => { c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
        c.beginPath(); c.arc(x + d * 18, 250, 30, 0, 7); c.fill(); c.beginPath(); c.moveTo(x - d * 46, 290); c.lineTo(x + d * 40, 284); c.lineTo(x + d * 22, 440); c.lineTo(x - d * 34, 440); c.fill();
        c.lineWidth = 30; c.beginPath(); c.moveTo(x + d * 30, 300); c.lineTo(x + d * 84, 330); c.lineTo(x + d * 128, 272); c.stroke(); c.beginPath(); c.moveTo(x - d * 30, 304); c.lineTo(x + d * 30, 356); c.lineTo(x + d * 78, 296); c.stroke();
        c.beginPath(); c.arc(x + d * 132, 262, 26, 0, 7); c.fill(); c.beginPath(); c.arc(x + d * 82, 288, 26, 0, 7); c.fill();
        c.lineWidth = 38; c.beginPath(); c.moveTo(x + d * 6, 440); c.lineTo(x + d * 46, 520); c.lineTo(x + d * 30, 610); c.stroke(); c.beginPath(); c.moveTo(x - d * 16, 440); c.lineTo(x - d * 56, 530); c.lineTo(x - d * 80, 610); c.stroke(); };
      man(330, 1, '#22355c'); man(694, -1, '#7a1f1a');
      c.fillStyle = '#efe6cc'; c.fillRect(212, 70, 600, 70); c.font = sans(42); c.fillStyle = '#7a1f1a'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('СИЛА · ВОЛЯ · ЧЕСТЬ', 512, 107);
      c.setTransform(1, 0, 0, 1, 0, 0); c.strokeStyle = 'rgba(40,26,12,.35)'; c.lineWidth = 1;   // the tesserae
      for (let y = 0; y < h; y += 7 * k + 1) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + (R() - 0.5) * 3); c.stroke(); } for (let x = 0; x < w; x += 7 * k + 1) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (R() - 0.5) * 3, h); c.stroke(); }
      speck(c, w, h, 20000 * TS, 0.1);
    });
    { const q = new THREE.ShapeGeometry(outline(false), 1), u = q.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, (u.getX(i) + VA) / (2 * VA), u.getY(i) / (SPRING + RISE));
      add(staticMesh(q.rotateY(PI / 2).translate(-L, 0, 0), new THREE.MeshStandardMaterial({ map: mosTex, roughness: 0.45, envMapIntensity: 0.4, emissive: '#ffffff', emissiveMap: mosTex, emissiveIntensity: 0.22 })), true); }
    stone.push(geoTint(geoUvMul(new THREE.ShapeGeometry(outline(true), 1), 0.5, 0.5).rotateY(-PI / 2).translate(L, 0, 0), CREAM));
    { const E = [], EL = [], EB = [], A = PI / 6, put = q => q.rotateZ(A).translate(L + 1.6, 0, 0);   // the incline: built along x, tilted 30°
      for (const z of [-2.25, 0, 2.25]) E.push(tb('#2b2a29', 18, 0.1, 1.05, 9, -0.05, z)), E.push(...Array.from({ length: 30 }, (_, i) => tb('#77736b', 0.06, 0.02, 1.0, 0.4 + i * 0.6, 0.012, z)));
      for (const z of [-3.375, -1.125, 1.125, 3.375]) { E.push(tb('#3a2b20', 18, 0.9, 0.75, 9, 0.4, z)); EB.push(tb('#b98a34', 18, 0.03, 0.8, 9, 0.865, z));
        for (let x = 1.2; x < 18; x += 2.4) { EB.push(geoTint(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6).rotateZ(-A).translate(x - 0.12, 1.1, z), '#b98a34')); EL.push(lit(new THREE.SphereGeometry(0.15, 8, 6).translate(x - 0.27, 1.42, z), ...WARM)); } }
      E.push(geoTint(wallP(0, -3.75, 18, -3.75, 0, 3.4), '#a89c88'), geoTint(wallP(18, 3.75, 0, 3.75, 0, 3.4), '#a89c88'), geoTint(flatP(18, 7.5, 9, 3.4, 0, false), '#b7ab95'));
      props.push(...E.map(put), tb('#2b2a29', 1.7, 0.04, 7.5, L + 0.8, 0.0, 0)); brass.push(...EB.map(put)); lamps.push(...EL.map(put), lit(new THREE.PlaneGeometry(7.5, 3.4).rotateY(-PI / 2).translate(18, 1.7, 0), 1.6, 1.25, 0.8).rotateZ(A).translate(L + 1.6, 0, 0));
      // the attendant's booth at the foot of the escalators
      props.push(tb('#3a3531', 1.3, 1.0, 1.3, L - 1.5, 0.5, -3.0), tb('#3a3531', 1.4, 0.1, 1.4, L - 1.5, 2.25, -3.0)); for (const [dx, dz] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) props.push(tb('#3a3531', 0.06, 1.2, 0.06, L - 1.5 + dx, 1.6, -3.0 + dz));
      lamps.push(lit(geoBox(0.9, 0.04, 0.9, L - 1.5, 2.18, -3.0), 1.5, 1.7, 1.9));
      signs.push(atq(faceX(2.5, 0.5, L - 0.05, 4.55, 0, -1), 0, 0, 640, 128)); }

    /* ── benches (stone ends, oak slats), urns ── */
    for (const sz of [-1, 1]) for (const x of [-22, -16.5, -11, 11, 16.5, 22]) { const z = sz * 4.55;
      for (let k = 0; k < 4; k++) props.push(tb('#6a4a2c', 2.1, 0.04, 0.1, x, 0.46, z - sz * (k * 0.125 - 0.19)));
      for (let k = 0; k < 3; k++) props.push(tb('#6a4a2c', 2.1, 0.1, 0.035, x, 0.62 + k * 0.14, z + sz * (0.27 + k * 0.012)));
      for (const sx of [-1, 1]) stone.push(geoTint(geoBox(0.14, 0.95, 0.62, x + sx * 1.12, 0.475, z + sz * 0.02), '#cdbfa8'));
      props.push(geoTint(new THREE.CylinderGeometry(0.17, 0.13, 0.55, 10).translate(x + 1.6, 0.275, z + sz * 0.1), '#2a2826')); }

    add(staticMesh(geoMerge(stone), stoneMat), true);
    const propM = add(staticMesh(geoMerge(props), propMat)); propM.receiveShadow = true;
    add(staticMesh(geoMerge(brass), brassMat)); add(staticMesh(geoMerge(lamps), litMat), true);
    addC(staticMesh(geoMerge(signs), new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(1.25, 1.2, 1.1) })), true);

    /* ── the train: five wagons = instances of one body (panels around the door and window openings, roof, underframe) and one lit
       interior seen through them; 40 door leaves (one InstancedMesh, moved only while the doors work); lights at both ends ── */
    const T = MT_TRAIN, train = this.train = new THREE.Group(), trainM = this.trainM = new THREE.Group(); train.position.set(1e3, 0, -TZ); g.add(train); mir.add(trainM);
    {
      const BL = '#1f4468', BL2 = '#2c5c88', HW = 1.38, hl = T.len / 2, B = [], I = [], seg = [[-hl, -7.85], [-6.55, -3.05], [-1.75, 1.75], [3.05, 6.55], [7.85, hl]];
      for (const [a, b] of seg) { const w = b - a, cx = (a + b) / 2;
        B.push(tb(BL, w, 1.1, 0.05, cx, 0.4, HW - 0.025), tb('#d9d2bd', w, 0.07, 0.056, cx, 0.9, HW - 0.025), tb(BL2, w, 0.3, 0.05, cx, 1.95, HW - 0.025));
        const n = w > 2 ? 3 : 1; for (let k = 0; k <= n; k++) B.push(tb(BL2, 0.12, 0.85, 0.05, a + 0.06 + k * (w - 0.12) / n, 1.375, HW - 0.025)); }
      for (const d of T.doors) B.push(tb(BL2, 1.3, 0.1, 0.05, d, 2.05, HW - 0.025), tb('#8f8a80', 1.3, 0.03, 0.12, d, 0.0, HW - 0.03));
      B.push(geoTint(sweep([[HW, 2.1], [1.33, 2.4], [1.08, 2.62], [0.55, 2.73], [0, 2.76], [-0.55, 2.73], [-1.08, 2.62], [-1.33, 2.4], [-HW, 2.1]], -hl, hl, 1), '#5a6066'));
      for (const sx of [-1, 1]) B.push(geoTint(new THREE.PlaneGeometry(2 * HW, 2.8).rotateY(sx * PI / 2).translate(sx * hl, 1.25, 0), BL), tb('#0d0d0d', 2.6, 0.75, 2.3, sx * (hl - 3), -0.6, 0));
      B.push(tb('#131313', T.len - 0.6, 0.5, 2.6, 0, -0.4, 0), geoTint(new THREE.PlaneGeometry(T.len, 1.0).translate(0, -0.35, HW - 0.05), '#16181b'));
      const body = new THREE.InstancedMesh(geoMerge(B), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35, envMapIntensity: 0.7 }), T.n);
      /* interior: the far wall (windows black with the tunnel behind them, seats, a few passengers), floor, ceiling with its lamp line */
      const inTex = rep(canvasTex(512, 256, (c, w, h) => {
        c.fillStyle = '#e9dfc4'; c.fillRect(0, 0, w, h * 0.75); c.fillStyle = '#11151a'; c.fillRect(w * 0.14, h * 0.2, w * 0.72, h * 0.3); c.fillStyle = '#cfc5aa'; for (const u of [0.38, 0.62]) c.fillRect(w * u - 4, h * 0.2, 8, h * 0.3);
        c.fillStyle = '#c9c0a6'; c.fillRect(0, h * 0.1, w * 0.135, h * 0.65); c.fillStyle = '#12161b'; c.fillRect(w * 0.03, h * 0.2, w * 0.075, h * 0.3); c.fillRect(w * 0.895, h * 0.2, w * 0.075, h * 0.3); c.fillStyle = '#bdb399'; c.fillRect(w * 0.865, h * 0.1, w * 0.135, h * 0.65);   // the far doors
        c.fillStyle = '#6a3a22'; c.fillRect(w * 0.14, h * 0.5, w * 0.72, h * 0.25); c.fillStyle = '#51301c'; c.fillRect(w * 0.14, h * 0.62, w * 0.72, 3);
        for (const [u, col] of [[0.24, '#2a2d33'], [0.47, '#4a3a30'], [0.55, '#1f2a3a'], [0.78, '#3a3038']]) { c.fillStyle = col; c.beginPath(); c.arc(w * u, h * 0.4, w * 0.026, 0, 7); c.fill(); c.fillRect(w * (u - 0.04), h * 0.46, w * 0.08, h * 0.22); }
        c.fillStyle = '#d9d9d2'; c.fillRect(0, h * 0.09, w, 3);   // the hand rail
        c.fillStyle = '#f6f2e6'; c.fillRect(0, h * 0.76, w, h * 0.12); c.fillStyle = '#ffffff'; c.fillRect(0, h * 0.8, w, h * 0.04); c.fillStyle = '#6b5a48'; c.fillRect(0, h * 0.88, w, h * 0.12);
      }));
      I.push(geoUvMul(new THREE.PlaneGeometry(T.len - 0.1, 2.1).translate(0, 1.05, -1.3), 4, 1), flatP(T.len - 0.1, 2.66, 0, 0.02, 0), flatP(T.len - 0.1, 2.66, 0, 2.1, 0, false));
      uvRect(I[0], 0, 0.25, 1, 1); uvRect(I[1], 0, 0.01, 1, 0.11); uvRect(I[2], 0, 0.14, 1, 0.23); { const u = I[2].attributes.uv; for (let i = 0; i < u.count; i++) u.setX(i, 0.5); }
      for (const sx of [-1, 1]) I.push(uvRect(new THREE.PlaneGeometry(2.66, 2.1).rotateY(-sx * PI / 2).translate(sx * (hl - 0.06), 1.05, 0), 0.01, 0.9, 0.02, 0.95));
      const inner = new THREE.InstancedMesh(geoMerge(I), new THREE.MeshBasicMaterial({ map: inTex, color: new THREE.Color(1.5, 1.38, 1.12), fog: false }), T.n);
      for (let i = 0; i < T.n; i++) { m4.makeTranslation(-hl - i * T.pitch, 0, 0); body.setMatrixAt(i, m4); inner.setMatrixAt(i, m4); }
      const leaf = geoMerge([tb(BL, 0.65, 0.93, 0.04, 0, -0.515, 0), tb(BL, 0.65, 0.2, 0.04, 0, 0.9, 0), tb(BL, 0.09, 0.85, 0.04, -0.28, 0.375, 0), tb(BL, 0.09, 0.85, 0.04, 0.28, 0.375, 0), tb('#0c0c0c', 0.03, 1.98, 0.045, 0.31, 0, 0)]);
      const doors = this.doors = new THREE.InstancedMesh(leaf, body.material, T.n * T.doors.length * 2); this.doorK = -1;
      const ends = [], tail = -T.n * T.pitch + (T.pitch - T.len);
      for (const z of [-0.85, 0.85]) ends.push(lit(new THREE.CircleGeometry(0.12, 12).rotateY(PI / 2).translate(0.02, 0.45, z), 5, 5.4, 6), lit(new THREE.CircleGeometry(0.08, 10).rotateY(-PI / 2).translate(tail - 0.02, 0.5, z), 4, 0.2, 0.15));
      ends.push(lit(new THREE.PlaneGeometry(0.9, 0.16).rotateY(PI / 2).translate(0.02, 2.3, 0), 2.6, 2.3, 1.6), lit(new THREE.PlaneGeometry(1.9, 0.8).rotateY(PI / 2).translate(0.015, 1.5, 0), 0.02, 0.03, 0.04));
      const endM = new THREE.Mesh(geoMerge(ends), litMat);
      for (const o of [body, inner, doors, endM]) { o.frustumCulled = false; o.matrixAutoUpdate = false; train.add(o); if (o !== endM) twin(o, trainM); }
      this.tail = tail;
    }
    // the glare of the headlights (out of the AO pass with the crowd's blobs), the cold light that rides with the train
    const glowTex = canvasTex(128, 128, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,.6)'); gr.addColorStop(0.4, 'rgba(255,255,255,.13)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    const glare = this.glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.6, 1.8, 2.2), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glare.position.set(0.3, 0.5, 0); glare.scale.set(5, 5, 1); train.add(glare); CROWD.blobs.push(glare, mir);
    const tl = this.tLight = new THREE.PointLight('#d6e4f8', 0, 14, 1.5); tl.position.set(0, 1.9, -(EZ - 2.2)); g.add(tl);

    /* ── light: a warm pool over the circle under the middle chandelier, warm points along the hall ── */
    const top = new THREE.SpotLight('#ffd9a6', 27, 12, 1.05, 0.9, 1.4); top.position.set(0, 4.55, 0); top.target.position.set(0, 0, 0); g.add(top, top.target);
    for (const x of lite ? [0] : [-11, 11]) { const p = new THREE.PointLight('#ffc888', lite ? 18 : 15, 24, 1.6); p.position.set(x, 4.3, 0); g.add(p); }

    /* ── dust that the train drives along the platform edge ── */
    const DN = Math.round(90 * GFX.particles), dg = new THREE.BufferGeometry(), dPos = new THREE.BufferAttribute(new Float32Array(DN * 3), 3), dSA = new THREE.BufferAttribute(new Float32Array(DN * 2), 2);
    for (let i = 0; i < DN; i++) { dPos.setXYZ(i, (R() - 0.5) * 30, 0.05 + R() * 2.4, -EZ + R() * 3.4); dSA.setXY(i, 0.015 + R() * 0.03, 0); }
    dPos.setUsage(THREE.DynamicDrawUsage); dSA.setUsage(THREE.DynamicDrawUsage); dg.setAttribute('position', dPos); dg.setAttribute('aSA', dSA);
    const dMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uS: { value: 1000 }, uC: { value: new THREE.Color('#e6d6bd') } },
      vertexShader: 'attribute vec2 aSA; uniform float uS; varying float vA; void main() { vA = aSA.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, aSA.x * uS / max(0.1, -mv.z)); }',
      fragmentShader: 'uniform vec3 uC; varying float vA; void main() { float a = vA * smoothstep(1.0, 0.2, length(gl_PointCoord - 0.5) * 2.0); if (a < 0.003) discard; gl_FragColor = vec4(uC, a); }' });
    const dust = new THREE.Points(dg, dMat); dust.frustumCulled = false; g.add(dust); CROWD.blobs.push(dust);
    this.dust = { n: DN, pos: dPos, sa: dSA, vx: new Float32Array(DN), ph: Float32Array.from({ length: DN }, () => R() * 6.3), mat: dMat, wind: 0 };

    /* ── the circle: three tight rows of late passengers, some on their haunches in front, many filming ── */
    CROWD_LOOK.metro ??= { head: [[CW_HAIR, 0.22], [CW_BUZZ, 0.1], [CW_BEANIE | CW_HAIR, 0.14], [CW_BEANIE, 0.06], [CW_CAP | CW_HAIR, 0.1], [CW_CAP | CW_BUZZ, 0.05], [CW_HOOD, 0.1], [CW_HOODDN | CW_HAIR, 0.1], [CW_HAIR | CW_BUN, 0.07], [CW_AFRO, 0.03], [0, 0.03]], phone: 0.3, tee: 0.03,
      top: ['#15171b', '#1d2230', '#23262b', '#2e3138', '#3a3327', '#4a1c1f', '#5b5e63', '#7a7d80', '#1f3557', '#6e1a1a', '#b9b5aa', '#8a6a2e', '#3d4a3a', '#24404a', '#4a3a2c', '#2a2f45'] };
    this.crowd = makeCrowd({ shape: 'circle', r: 3.15, rows: 3, gap: 0.5, rise: [0, 0, 0], look: 'metro', seed: 59, max: 140, squat: 0.22 });
    g.add(this.crowd.group);
    this.tt = T.tIn + T.tDwell + T.tOut + T.tIdle - 5; this.t0 = CROWD.u.uT.value; this.ph = 0; this.st = null;   // the first train comes 5 s after the place is first seen
    return g;
  },
  leave() { sfx.train(0, 0); this.ph = 0; },
  // per frame, after the camera
  sync() {
    const M = ARENA.matrixWorld, cam = camera.position, T = MT_TRAIN;
    /* columns: hidden while inside the view wedge in front of what the camera looks at (their twins under the floor go with them) */
    const dx = camL.x - cam.x, dz = camL.z - cam.z, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, tH = Math.tan(camera.fov * Math.PI / 360) * camera.aspect * 1.1;
    let ch = false; this.cols.forEach((c, i) => { _lp.copy(c.p).applyMatrix4(M); const px = _lp.x - cam.x, pz = _lp.z - cam.z, s = px * ux + pz * uz, h = s > -0.75 && s < len - 0.5 && Math.abs(px * uz - pz * ux) - 0.75 < Math.max(s, 0) * tH + 0.3;
      if (h !== c.h) { c.h = h; this.colMesh.setMatrixAt(i, h ? this.zero : c.mat); ch = true; } });
    if (ch) this.colMesh.instanceMatrix.needsUpdate = true;
    this.ceil.visible = this.ceilM.visible = cam.y < 4.0;
    this.mir.visible = GFX.level !== 'low'; this.uRefl.value = this.mir.visible ? 1 : 0;
    this.mirU.uMirI.value.copy(M).invert(); this.mirU.uMirC.value.copy(cam).applyMatrix4(this.mirU.uMirI.value);

    /* the train: its clock is the crowd's (stops with the pause) */
    const now = CROWD.u.uT.value, dt = clamp(now - this.t0, 0, 0.1); this.t0 = now; this.tt += dt;
    const S = this.trainAt(this.tt), on = S.ph > 0, tailX = S.x + this.tail;
    this.train.visible = this.trainM.visible = on && S.x > -44 && tailX < 44;
    if (on) { this.train.position.x = S.x; this.train.updateMatrixWorld(true); this.trainM.position.copy(this.train.position); this.trainM.updateMatrixWorld(true); }
    if (S.door !== this.doorK) { this.doorK = S.door; const D = this.doors, hl = T.len / 2; let k = 0;
      for (let i = 0; i < T.n; i++) for (const d of T.doors) for (const sx of [-1, 1]) { _mtM.makeScale(sx, 1, 1).setPosition(-hl - i * T.pitch + d + sx * (0.325 + 0.6 * S.door), 1.01, 1.335); D.setMatrixAt(k++, _mtM); }
      D.instanceMatrix.needsUpdate = true; }
    // the light: the headlights sweep the platform as the nose comes, then the glow of the windows stays by the circle until the tail has gone
    const near = on && S.x > -34 && tailX < 30, lx = clamp(Math.min(S.x + 1, 0), -30, 30), head = S.x < 0, L = this.tLight;
    L.position.x = on && tailX > 0 ? tailX : lx; L.intensity = near ? (head ? 13 : 7) * (S.v > 0.3 ? 0.8 + 0.2 * Math.sin(S.x * 5.9) : 1) * clamp((30 - tailX) / 12, 0, 1) : 0;
    this.glare.visible = on; this.glare.material.opacity = clamp(1.2 - Math.abs(S.x) / 60, 0.25, 1);
    // sound: the rumble follows the speed and how much of the train is in the station; the brakes, the doors, the pull-away
    const inSt = on ? clamp((S.x + 40) / 25, 0, 1) * clamp((45 - tailX) / 25, 0, 1) : 0;
    sfx.train(inSt * (0.25 + 0.75 * clamp(S.v / 12, 0, 1)) * (S.v > 0.05 ? 1 : 0.12), S.v);
    if (S.ph !== this.ph) { if (S.ph === 2) sfx.trainHiss(0.9); if (S.ph === 1) sfx.trainHorn(); this.ph = S.ph; }
    const dk = S.door > 0.02 && S.door < 0.98 ? (S.door > (this.dPrev ?? 0) ? 1 : -1) : 0; if (dk !== (this.dDir ?? 0)) { if (dk) sfx.trainDoors(dk > 0); this.dDir = dk; } this.dPrev = S.door;
    // dust: still air shows nothing; the train drags the air along the edge
    const B = this.dust; if (!B.n || dt <= 0) return;
    const wind = on && S.x > -40 && tailX < 34 ? S.v * 0.3 : 0; B.wind += (wind - B.wind) * (1 - Math.exp(-dt * 0.9));
    if (B.wind < 0.02 && B.idle) return; B.idle = B.wind < 0.02;
    const P = B.pos.array, A = B.sa.array, a = clamp(B.wind / 2.5, 0, 1) * 0.5;
    for (let i = 0; i < B.n; i++) { const k = i * 3; B.ph[i] += dt * 3; P[k] += B.wind * (0.6 + 0.4 * Math.sin(B.ph[i] * 0.37 + i)) * dt; P[k + 1] += Math.sin(B.ph[i]) * 0.12 * B.wind * dt; if (P[k] > 15) P[k] -= 30; if (P[k + 1] > 2.5) P[k + 1] = 0.1; if (P[k + 1] < 0.03) P[k + 1] = 0.03; A[i * 2 + 1] = a * (0.4 + 0.6 * Math.abs(Math.sin(B.ph[i] * 0.5 + i))); }
    B.pos.needsUpdate = true; B.sa.needsUpdate = true; B.mat.uniforms.uS.value = sceneRT.height / (2 * Math.tan(camera.fov * Math.PI / 360));
  },
};
const _mtM = new M4();
