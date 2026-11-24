/* ───────── R-08: the hall around the boxing ring (LOCS.gym — the main menu and the first fight) ─────────
   Layout (ARENA frame, ring centre = origin, ropes at ±2.65): everything follows a rounded square that runs d metres outside the
   2·GYM.H square (`gymEdge`). d = bar: a crowd barrier with sponsor boards facing the ring (the banners round the perimeter);
   d = row + k·step: three rows of real people (makeCrowd, look `gym`; rows 1–2 stand on risers, aisles in the corners), then `far`
   more rows of flat busts — camera-facing cards, 2 triangles a person, dark with a painted rim of back light, some hold a lit phone —
   on a ramp; a haze wall and a ring of back lamps behind them. Over the ring: a box truss with 12 cans, the four corner cans
   throw cones of haze onto the canvas (the dust-beam trick of the warehouse; the two on the camera's side are dimmed so that
   they do not wash the fighters out). Camera flashes pop in the stands on hard clean hits, knockdowns and knockouts (EVT).
   Budget: the whole set stays out of the AO normal pass (dark and far: nothing to gain, and it would be drawn twice);
   low = no cones, the 3D crowd at GFX.crowd (0.4), the cards stay. The side of the barrier / risers the camera stands behind is
   hidden (sync). CROWD.fill (a career fight) thins the people, the cards and the flashes alike.
   Debug: `__loc.get().flash(30, 1)`, `GYM`. */
const GYM = { H: 2.8, bar: 0.8, barH: 0.98, row: 1.35, step: 0.6, rise: 0.3, rows: 3, far: 4, trussY: 4.7, truss: 2.35, wallR: 11.5, lampR: 9.9, lampY: 4.25, dim: 0.36 };
// the rounded square d metres outside the 2H square: s (metres along it) → [x, z, outward normal x, z] (as the `rect` edge of makeCrowd)
const gymEdge = d => { const H = GYM.H, q = Math.PI / 2 * d, seg = 2 * H + q, len = 4 * seg;
  return { len, at(s) { s = ((s % len) + len) % len; const i = Math.min(3, Math.floor(s / seg)), a = i * Math.PI / 2, nx = Math.round(Math.cos(a)), nz = Math.round(Math.sin(a)), tx = -nz, tz = nx, u = s - i * seg;
    if (u < 2 * H) return [nx * (H + d) + tx * (u - H), nz * (H + d) + tz * (u - H), nx, nz];
    const f = (u - 2 * H) / d, mx = nx * Math.cos(f) + tx * Math.sin(f), mz = nz * Math.cos(f) + tz * Math.sin(f); return [nx * H + tx * H + mx * d, nz * H + tz * H + mz * d, mx, mz]; } }; };
const GYM_BEAM_VS = /* glsl */`attribute float aK; uniform vec4 uF; varying vec2 vUv; varying vec3 vN, vV; varying float vF;
  void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz;
    vF = aK < 0.5 ? uF.x : aK < 1.5 ? uF.y : aK < 2.5 ? uF.z : uF.w; gl_Position = projectionMatrix * mv; }`;
const GYM_BEAM_FS = /* glsl */`uniform sampler2D uN; uniform float uT, uK; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN, vV; varying float vF;
  void main() { float n = texture2D(uN, vUv * vec2(1.3, 0.6) + vec2(uT * 0.013, -uT * 0.021)).r * texture2D(uN, vUv * vec2(2.9, 1.1) + vec2(-uT * 0.009, uT * 0.006)).r;
    float f = abs(dot(normalize(vN), normalize(vV)));
    float a = f * f * mix(0.25, 1.0, vUv.y * vUv.y) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(0.4, 1.8, length(vV)) * vF;
    gl_FragColor = vec4(uCol * (a * uK * (0.3 + 5.0 * n)), 1.0); }`;
// the far rows: one quad a person, turned to the camera about the vertical; iP = x, feet y, z, atlas tile (+8: mirrored); iV = phase, shade
const GYM_FAR_VS = /* glsl */`attribute vec4 iP; attribute vec2 iV; uniform float uT, uMood, uD; varying vec2 vUv; varying float vSh;
  #include <fog_pars_vertex>
  void main() { float tile = mod(iP.w, 8.0); vec2 q = uv; if (iP.w >= 8.0) q.x = 1.0 - q.x;
    vUv = (vec2(mod(tile, 4.0), floor(tile / 4.0)) + q) * vec2(0.25, 0.5); vSh = iV.y;
    float bob = sin(uT * (2.2 + 3.0 * iV.x) + iV.x * 40.0) * (0.004 + 0.04 * uMood * uMood);
    vec4 mvPosition = modelViewMatrix * vec4(iP.x, iP.y + bob, iP.z, 1.0);
    vec3 up = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    mvPosition.xyz += vec3(position.x * 0.72, 0.0, 0.0) + up * (position.y * 0.72);
    gl_Position = -mvPosition.z < uD ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mvPosition;   // nobody nearer than the fighters: the camera may stand among the far rows
    #include <fog_vertex>
  }`;
const GYM_FAR_FS = /* glsl */`uniform sampler2D uMap; varying vec2 vUv; varying float vSh;
  #include <fog_pars_fragment>
  void main() { vec4 c = texture2D(uMap, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb * mix(vSh, 1.0, step(0.4, c.b)), 1.0);   // a lit phone screen is not shaded
    #include <fog_fragment>
  }`;
// lamps and camera flashes: additive quads that face the camera; iF = x, y, z, start time (< 0: a lamp, always on); iC = colour, size
const GYM_GLINT_VS = /* glsl */`attribute vec4 iF, iC; uniform float uT; varying vec2 vUv; varying vec3 vC;
  void main() { float e, k = 1.0;
    if (iF.w >= 0.0) { float a = uT - iF.w; e = a < 0.0 || a > 0.1 ? 0.0 : a < 0.035 ? 1.0 : 1.0 - (a - 0.035) / 0.065; k = 0.55 + 0.45 * e; }   // two frames at full, then gone
    else e = 0.86 + 0.14 * sin(uT * 1.7 + iF.x * 3.1);
    vec4 mv = modelViewMatrix * vec4(iF.xyz, 1.0); mv.xy += position.xy * iC.w * k;
    vUv = uv; vC = iC.rgb * e; gl_Position = e > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0); }`;
const GYM_GLINT_FS = /* glsl */`varying vec2 vUv; varying vec3 vC;
  void main() { vec2 p = vUv * 2.0 - 1.0; float d = length(p), g = pow(max(0.0, 1.0 - d), 3.0) + 0.5 * exp(-abs(p.y) * 30.0) * pow(max(0.0, 1.0 - abs(p.x)), 2.0);
    gl_FragColor = vec4(vC * g, 1.0); }`;

Object.assign(LOCS.gym, {
  steps: 6,   // R-24: build() is a generator, one loading step per chunk (17_loc_load.js)
  *build() {
    const R = locRng(808), g = new THREE.Group(), PI = Math.PI, { H, bar, barH, row, step, rise } = GYM;
    const font = px => `900 ${px}px "Big Shoulders Display", Impact, "Arial Black", sans-serif`;
    const strut = (ax, ay, az, bx, by, bz, t) => { const d = new V3(bx - ax, by - ay, bz - az), L = d.length(), b = new THREE.BoxGeometry(t, t, L); b.applyQuaternion(new Quat().setFromUnitVectors(new V3(0, 0, 1), d.normalize())); return b.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); };
    const rgb = (geo, r, gg, b) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };   // linear, may be > 1 (lenses)
    /* light: the big soft top light straight above the ring, the canvas throwing a little cool light back up */
    const top = new THREE.SpotLight('#fff6ea', 26, 11, 0.95, 0.9, 1.6); top.position.set(0, 6.2, 0.4); top.target.position.set(0, 0.6, 0); g.add(top, top.target);
    const bounce = new THREE.DirectionalLight('#6f86c2', 0.32); bounce.position.set(0.2, -1, 0.8); scene.add(bounce); this.world = [bounce];
    yield 'light';

    /* the barrier with the sponsor boards + the risers, one mesh a side (a profile swept along the side and its two half corners) */
    const boards = [['#6d121a', '#efe6d2', 'НОКАУТ · РИНГ'], ['#0e0f12', SPONSORS[0].c, SPONSORS[0].name], ['#12233d', '#e9eef6', SPONSORS[2].name], ['#0e0f12', '#c8ccd3', 'ГОЛЫЕ КУЛАКИ'], ['#4d1a16', '#f0e2cc', SPONSORS[3].name], ['#1b1d21', SPONSORS[1].c, SPONSORS[1].name]];
    const boardTex = canvasTex(2048, 320, (c, w, h) => {
      const bh = h * 0.9, pw = w / boards.length;
      boards.forEach(([bg, ink, txt], i) => { const x = i * pw;
        c.fillStyle = bg; c.fillRect(x, 0, pw, bh); c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x, 0, 5, bh); c.fillRect(x + pw - 5, 0, 5, bh); c.fillRect(x, bh - 26, pw, 26);
        c.fillStyle = ink; c.globalAlpha = 0.5; c.fillRect(x + 22, 30, pw - 44, 5); c.fillRect(x + 22, bh - 62, pw - 44, 5); c.globalAlpha = 0.92;
        c.font = font(150); c.textAlign = 'center'; c.textBaseline = 'middle'; const tw = c.measureText(txt).width, k = Math.min(1, (pw - 60) / tw);
        c.save(); c.translate(x + pw / 2, bh * 0.47); c.scale(k, Math.min(1.25, 1 / Math.max(k, 0.6))); c.fillText(txt, 0, 0); c.restore(); c.globalAlpha = 1; });
      for (let i = 0; i < 5000; i++) { c.fillStyle = `rgba(0,0,0,${R() * 0.22})`; c.fillRect(R() * w, R() * bh, 1 + R() * 3, 1 + R() * 2); }
      c.fillStyle = '#040506'; c.fillRect(0, bh, w, h - bh);
    });
    boardTex.wrapS = THREE.RepeatWrapping;
    const e1 = row + step * 0.5, e2 = e1 + step, e3 = e2 + step, eN = e3 + GYM.far * step;   // front edges of the risers (rows 1, 2), of the ramp of the far rows, its back edge
    const prof = [[[bar, 0], [bar, barH], 1], [[bar, barH], [bar + 0.1, barH]], [[bar + 0.1, barH], [bar + 0.1, 0]],
      [[e1, 0], [e1, rise]], [[e1, rise], [e2, rise]], [[e2, rise], [e2, 2 * rise]], [[e2, 2 * rise], [e3, 2 * rise]], [[e3, 2 * rise], [e3, 3 * rise]],
      [[e3, 3 * rise], [eN, (3 + GYM.far) * rise]], [[eN, (3 + GYM.far) * rise], [eN, (3 + GYM.far) * rise + 1.1]]];
    const standMat = new THREE.MeshStandardMaterial({ map: boardTex, color: '#c4c4c4', roughness: 0.82, metalness: 0 });   // the boards are dimmed: the fighters stay the brightest thing in the frame
    this.sides = [];
    for (let i = 0; i < 4; i++) {
      const a = i * PI / 2, nx = Math.round(Math.cos(a)), nz = Math.round(Math.sin(a)), tx = -nz, tz = nx, S = [], pos = [], uv = [];
      for (let k = 0; k <= 3; k++) { const f = -PI / 4 + k * PI / 12; S.push([nx * H - tx * H, nz * H - tz * H, nx * Math.cos(f) + tx * Math.sin(f), nz * Math.cos(f) + tz * Math.sin(f)]); }
      for (let k = 0; k <= 3; k++) { const f = k * PI / 12; S.push([nx * H + tx * H, nz * H + tz * H, nx * Math.cos(f) + tx * Math.sin(f), nz * Math.cos(f) + tz * Math.sin(f)]); }
      const at = (s, d, y) => [s[0] + s[2] * d, y, s[1] + s[3] * d], LT = 2 * H + PI / 2 * bar; let run = 0;
      for (let k = 0; k < S.length - 1; k++) {
        const A = S[k], B = S[k + 1], pa = at(A, bar, 0), pb = at(B, bar, 0), u0 = i * 0.25 + run / LT; run += Math.hypot(pb[0] - pa[0], pb[2] - pa[2]); const u1 = i * 0.25 + run / LT;
        for (const [p, q, board] of prof) {
          const v = [at(A, p[0], p[1]), at(B, p[0], p[1]), at(B, q[0], q[1]), at(A, q[0], q[1])], t = board ? [[u0, 0.1], [u1, 0.1], [u1, 1], [u0, 1]] : [[0.5, 0.04], [0.5, 0.04], [0.5, 0.04], [0.5, 0.04]];
          for (const j of [0, 1, 2, 0, 2, 3]) { pos.push(...v[j]); uv.push(...t[j]); }
        }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
      const m = staticMesh(geo, standMat); g.add(m); this.sides.push(m);
    }
    yield 'stands';

    /* three rows of real people right behind the barrier; an aisle in every corner */
    this.crowd = makeCrowd({ shape: 'rect', w: 2 * H, h: 2 * H, r: row, rows: GYM.rows, step, gap: 0.56, rise: [0, rise, 2 * rise], crate: false, look: 'gym', seed: 808, max: 170, sectors: 28, pad: 1.3,
      keep: (x, z) => !(Math.min(Math.abs(x), Math.abs(z)) > H && Math.abs(Math.abs(x) - Math.abs(z)) < 0.7) });
    g.add(this.crowd.group);
    yield 'crowd';

    /* the far rows: an atlas of 8 busts (dark cloth, a rim of back light along the top edges, two of them hold a lit phone) */
    const farTex = canvasTex(512, 256, (c, w, h) => {
      for (let t = 0; t < 8; t++) {
        const ox = (t % 4) * 128, oy = (1 - (t >> 2)) * 128, hx = 64 + (R() - 0.5) * 8, sw = 44 + R() * 6, hood = t === 3, cap = t === 5, armL = t === 1 || t === 6, armR = t === 2 || t === 6, phone = t === 7;
        const body = dy => { c.beginPath();
          c.moveTo(hx - sw, 128); c.lineTo(hx - sw, 74 + dy); c.quadraticCurveTo(hx - sw + 2, 58 + dy, hx - 16, 54 + dy); c.lineTo(hx + 16, 54 + dy); c.quadraticCurveTo(hx + sw - 2, 58 + dy, hx + sw, 74 + dy); c.lineTo(hx + sw, 128); c.closePath(); c.fill();
          c.beginPath(); c.ellipse(hx, 36 + dy, hood ? 19 : 15, hood ? 23 : 19, 0, 0, 7); c.fill(); c.fillRect(hx - 8, 46 + dy, 16, 12);
          if (cap) c.fillRect(hx - 2, 22 + dy, 24, 6);
          c.lineWidth = 13; c.lineCap = 'round';
          if (armL) { c.beginPath(); c.moveTo(hx - sw + 8, 70 + dy); c.lineTo(hx - sw - 2, 44 + dy); c.lineTo(hx - sw + 6, 16 + dy); c.stroke(); }
          if (armR) { c.beginPath(); c.moveTo(hx + sw - 8, 70 + dy); c.lineTo(hx + sw + 2, 46 + dy); c.lineTo(hx + sw - 8, 20 + dy); c.stroke(); }
          if (phone) { c.beginPath(); c.moveTo(hx + sw - 10, 72 + dy); c.lineTo(hx + sw - 2, 50 + dy); c.lineTo(hx + 20, 34 + dy); c.stroke(); } };
        c.save(); c.beginPath(); c.rect(ox, oy, 128, 128); c.clip(); c.translate(ox, oy);
        const rim = ['#4f6286', '#5a6a88', '#6b6258', '#465a80'][t % 4], cloth = ['#0d0f14', '#11131a', '#14110f', '#0f1218'][(t * 3) % 4];
        c.fillStyle = c.strokeStyle = rim; body(0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = c.strokeStyle = cloth; body(3.5);
        if (phone) { c.globalCompositeOperation = 'source-over'; c.fillStyle = '#0a0b0e'; c.fillRect(hx + 12, 20, 16, 11); c.fillStyle = '#8197bc'; c.fillRect(hx + 14, 22, 12, 7); }
        c.restore();
      }
    });
    const cards = [], yUp = 1.47;   // centre of a card above the feet: it shows a person from the chest up
    for (let j = 0; j < GYM.far; j++) { const E = gymEdge(row + step * (GYM.rows + j)), n = Math.floor(E.len / 0.56), s0 = R() * 0.5;
      for (let i = 0; i < n; i++) { const [x, z] = E.at(s0 + (i + (R() - 0.5) * 0.4) * E.len / n); cards.push({ x, z, y: rise * (GYM.rows + j) + yUp + (R() - 0.5) * 0.12, rank: R() * 0.75 + j * 0.1, row: j }); } }
    cards.sort((a, b) => a.rank - b.rank);   // CROWD.fill shows the first part of the list: the top rows empty first
    const FN = this.farN = cards.length, iP = new Float32Array(FN * 4), iV = new Float32Array(FN * 2);
    cards.forEach((p, i) => { iP.set([p.x, p.y, p.z, ((R() * 8) | 0) + (R() < 0.5 ? 8 : 0)], i * 4); iV.set([R(), (0.6 + R() * 0.5) * (1 - 0.1 * p.row)], i * 2); });
    const quad = () => { const q = new THREE.InstancedBufferGeometry(), p = new THREE.PlaneGeometry(1, 1); q.setIndex(p.index); q.setAttribute('position', p.attributes.position); q.setAttribute('uv', p.attributes.uv); return q; };
    const fg = quad(); fg.setAttribute('iP', new THREE.InstancedBufferAttribute(iP, 4)); fg.setAttribute('iV', new THREE.InstancedBufferAttribute(iV, 2)); fg.instanceCount = FN;
    const farMat = new THREE.ShaderMaterial({ uniforms: Object.assign(THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), { uMap: { value: farTex }, uT: CROWD.u.uT, uMood: CROWD.u.uMood, uD: (this.uD = { value: 0 }) }), vertexShader: GYM_FAR_VS, fragmentShader: GYM_FAR_FS, fog: true });
    this.far = new THREE.Mesh(fg, farMat); this.far.frustumCulled = false; g.add(this.far); this.cards = cards;
    /* the wall of haze behind the last row: a faint cold glow at the height of the back lamps, black above */
    const hazeTex = canvasTex(256, 256, (c, w, h) => {
      const gr = c.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#0a0c11'); gr.addColorStop(0.28, '#0d1119'); gr.addColorStop(0.42, '#182236'); gr.addColorStop(0.6, '#0f1420'); gr.addColorStop(1, '#0a0c11'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) { const x = (i + 0.5) * w / 9 + (R() - 0.5) * 8, y = h * 0.58, r = 26 + R() * 14, q = c.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, 'rgba(70,96,150,.34)'); q.addColorStop(1, 'rgba(70,96,150,0)'); c.fillStyle = q; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
    });
    hazeTex.wrapS = THREE.RepeatWrapping; hazeTex.repeat.set(2, 1);
    g.add(staticMesh(new THREE.CylinderGeometry(GYM.wallR, GYM.wallR, 10, 32, 1, true).translate(0, 5, 0), new THREE.MeshBasicMaterial({ map: hazeTex, side: THREE.BackSide, fog: false })));
    yield 'far rows';

    /* the truss over the ring: four box-truss sides (chords + lacing), 12 cans aimed at the canvas, cables up into the dark */
    const TY = GYM.trussY, TH = GYM.truss, gs = [], lens = [], cans = [], metal = [0.016, 0.018, 0.024];
    for (let i = 0; i < 4; i++) { const a = i * PI / 2, nx = Math.round(Math.cos(a)), nz = Math.round(Math.sin(a)), tx = -nz, tz = nx, P = (u, o, y) => [nx * (TH + o) + tx * u, TY + y, nz * (TH + o) + tz * u];
      for (const o of [-0.14, 0.14]) for (const y of [0, 0.28]) gs.push(strut(...P(-TH - 0.14, o, y), ...P(TH + 0.14, o, y), 0.045));
      const nd = 10; for (let k = 0; k < nd; k++) { const u0 = -TH + 2 * TH * k / nd, u1 = u0 + 2 * TH / nd, f = k % 2; gs.push(strut(...P(u0, 0.14, f ? 0.28 : 0), ...P(u1, 0.14, f ? 0 : 0.28), 0.022), strut(...P(u0, f ? 0.14 : -0.14, 0), ...P(u1, f ? -0.14 : 0.14, 0), 0.022)); }
      gs.push(strut(...P(TH, 0, 0.28), ...P(TH, 0, 5), 0.012));
      for (const u of [-1.5, 0, 1.5, TH]) cans.push([nx * (u === TH ? TH : TH - 0.02) + tx * u, nz * (u === TH ? TH : TH - 0.02) + tz * u, u === TH]); }
    this.cones = []; const coneG = [];
    for (const [x, z, corner] of cans) {
      const from = new V3(x, TY - 0.3, z), aim = corner ? new V3(Math.sign(x) * 0.75, 0, Math.sign(z) * 0.75) : new V3(x * 0.25, 0, z * 0.25), dir = aim.clone().sub(from).normalize(), q = new Quat().setFromUnitVectors(new V3(0, -1, 0), dir);
      gs.push(new THREE.CylinderGeometry(0.1, 0.13, 0.3, 10, 1, true).applyQuaternion(q).translate(from.x, from.y, from.z), strut(x, TY - 0.2, z, x, TY, z, 0.03));
      lens.push(new THREE.CircleGeometry(0.115, 10).rotateX(PI / 2).translate(0, -0.13, 0).applyQuaternion(q).translate(from.x, from.y, from.z));
      if (corner) { const L = from.distanceTo(aim) + 0.3, cg = new THREE.CylinderGeometry(0.13, 1.55, L, 24, 1, true).translate(0, -L / 2, 0).applyQuaternion(q).translate(from.x, from.y, from.z);
        cg.setAttribute('aK', new THREE.BufferAttribute(new Float32Array(cg.attributes.position.count).fill(this.cones.length), 1)); coneG.push(cg); this.cones.push([Math.sign(x), Math.sign(z)]); }
    }
    const rigGeo = geoMerge([...gs.map(q => rgb(q, ...metal)), ...lens.map(q => rgb(q, 5.5, 4.8, 3.6))]);
    g.add(staticMesh(rigGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })));
    const noise = locTex('gymBeamNoise', 256, 256, (c, w, h) => { const N = locRng(5); c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 150; i++) { const x = N() * w, y = N() * h, r = 8 + N() * 44, a = 0.05 + N() * 0.16; for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h], [w, 0], [0, h]]) { const gr = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); } } });
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.colorSpace = THREE.NoColorSpace;
    this.uF = { value: new THREE.Vector4(1, 1, 1, 1) };
    this.cone = staticMesh(geoMerge(coneG), new THREE.ShaderMaterial({ uniforms: { uN: { value: noise }, uT: CROWD.u.uT, uCol: { value: new THREE.Color('#ffe6c4') }, uK: { value: 0.18 }, uF: this.uF },   // uK by eye: 0.11 is not seen behind the fighters, 0.32 veils the whole frame
      vertexShader: GYM_BEAM_VS, fragmentShader: GYM_BEAM_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.cone.renderOrder = 4; g.add(this.cone);
    yield 'rig';

    /* the back lamps behind the last row (always on) and the pool of camera flashes, one additive mesh */
    const NL = 16, NF = this.flashN = 48, iF = new Float32Array((NL + NF) * 4), iC = new Float32Array((NL + NF) * 4);
    for (let i = 0; i < NL; i++) { const a = (i + 0.5) / NL * 2 * PI + (R() - 0.5) * 0.12, warm = i % 4 === 1;
      iF.set([Math.cos(a) * GYM.lampR, GYM.lampY + R() * 0.5, Math.sin(a) * GYM.lampR, -1], i * 4); iC.set(warm ? [1.8, 1.3, 0.8, 0.9] : [1.0, 1.4, 2.1, 1.0], i * 4); }
    for (let i = 0; i < NF; i++) { iF.set([0, 0, 0, 1e9], (NL + i) * 4); iC.set([7, 8, 10, 0.6], (NL + i) * 4); }
    const gg = quad(); this.aF = new THREE.InstancedBufferAttribute(iF, 4); this.aF.setUsage(THREE.DynamicDrawUsage); gg.setAttribute('iF', this.aF); gg.setAttribute('iC', new THREE.InstancedBufferAttribute(iC, 4)); gg.instanceCount = NL + NF;
    const glint = new THREE.Mesh(gg, new THREE.ShaderMaterial({ uniforms: { uT: CROWD.u.uT }, vertexShader: GYM_GLINT_VS, fragmentShader: GYM_GLINT_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glint.frustumCulled = false; glint.renderOrder = 5; g.add(glint); this.lampN = NL; this.flashI = 0;
    // nothing of the hall goes into the AO normal pass (the list the crowd keeps for its floor blobs is hidden there)
    g.traverse(o => { if (o.isMesh && !CROWD.blobs.includes(o)) CROWD.blobs.push(o); });
    return g;
  },
  /* n camera flashes somewhere in the stands within `spread` seconds: among the people who are shown (the first rows) and the far rows */
  flash(n, spread = 0.4) {
    if (!this.aF || !this.crowd) return;
    const A = this.aF.array, t = CROWD.u.uT.value, ppl = this.crowd.people, nP = Math.max(1, Math.min(ppl.length, Math.round(ppl.length * clamp(GFX.crowd, 0, 1) * CROWD.fill))), nC = Math.max(1, Math.round(this.farN * clamp(CROWD.fill, 0, 1)));
    for (let k = 0; k < n; k++) {
      const j = (this.lampN + this.flashI) * 4; this.flashI = (this.flashI + 1) % this.flashN;
      if (Math.random() < 0.45) { const p = ppl[(Math.random() * nP) | 0]; A[j] = p.x - p.nx * 0.2; A[j + 1] = p.y + 1.5 + Math.random() * 0.25; A[j + 2] = p.z - p.nz * 0.2; }
      else { const p = this.cards[(Math.random() * nC) | 0]; A[j] = p.x * 0.985; A[j + 1] = p.y + 0.1 + Math.random() * 0.2; A[j + 2] = p.z * 0.985; }
      A[j + 3] = t + 0.02 + Math.random() * spread;
    }
    this.aF.needsUpdate = true;
  },
  // the people of the hall are dark figures against the back light, the fighters stay the brightest thing in the frame: the shared
  // crowd material is dimmed while this place is on (locApply calls enter / leave); phone screens are emissive and stay lit
  enter() { if (CROWD.mat) CROWD.mat.color.setScalar(GYM.dim); },
  leave() { if (CROWD.mat) CROWD.mat.color.setScalar(1); },
  // per frame, after the camera
  sync() {
    const cam = _lp.copy(camera.position); ARENA.worldToLocal(cam);
    // the barrier / risers of the side the camera stands behind (the people there are dissolved by the crowd itself)
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; this.sides[i].visible = cam.x * Math.round(Math.cos(a)) + cam.z * Math.round(Math.sin(a)) < GYM.H + GYM.bar - 0.25; }
    // cones: none on low; the ones between the camera and the fighters are dimmed
    this.cone.visible = GFX.level !== 'low';
    const cl = (Math.hypot(cam.x, cam.z) || 1) * Math.SQRT2;
    this.cones.forEach(([sx, sz], k) => { const d = clamp(((cam.x * sx + cam.z * sz) / cl + 0.2) / 0.8, 0, 1); this.uF.value.setComponent(k, 1 - 0.9 * d * d * (3 - 2 * d)); });
    this.far.geometry.instanceCount = Math.round(this.farN * clamp(CROWD.fill, 0, 1));
    this.uD.value = camera.position.distanceTo(camL) - 0.3;
  },
});
// camera flashes in the stands: hard clean hits (also the ones played back in a replay), a knockdown, a knockout
EVT.on((type, e) => {
  const L = LOCS.gym; if (LOC_ON !== L || !L.group) return; const p = e.power || 0;
  if (type === 'hit') { if (!e.blocked && p > 0.6) L.flash(Math.round(2 + 10 * clamp(p - 0.55, 0, 1)), 0.35); }
  else if (type === 'kd') L.flash(20, 1.4);
  else if (type === 'ko') L.flash(40, 3);
});
