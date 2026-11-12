/* ───────── blood mist (soft points) ───────── */
const _xm = new V3(), _xm2 = new V3();
const MIST = (() => {
  const N = 900, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), lf = new Float32Array(N), sz = new Float32Array(N), al = new Float32Array(N); let head = 0;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aS', new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('aA', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uScale: { value: 900 } },
    vertexShader: 'attribute float aS; attribute float aA; varying float vA; uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min( aS * uScale / -mv.z, 14.0 ); vA = aA; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard; float a = vA * smoothstep(0.25, 0.05, d); gl_FragColor = vec4(0.36, 0.015, 0.02, a); }' });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.matrixAutoUpdate = false; pts.visible = false; scene.add(pts);   // drawn only while droplets are in the air
  for (let i = 0; i < N; i++) al[i] = 0;
  return {
    burst(p, dir, power, amt) {
      const n = (amt * (60 + 140 * power) * GFX.particles) | 0; if (n > 0) pts.visible = true;
      for (let k = 0; k < n; k++) { const i = head++ % N, j = 3 * i, sp = (1.2 + rr() * 4.5) * (0.6 + 0.6 * power), side = 1.4 * rr();
        pos[j] = p.x + (rr() - 0.5) * 0.03; pos[j + 1] = p.y + (rr() - 0.5) * 0.03; pos[j + 2] = p.z + (rr() - 0.5) * 0.03;
        vel[j] = dir.x * sp + (rr() - 0.5) * side * sp; vel[j + 1] = dir.y * sp + (rr() - 0.35) * side * sp; vel[j + 2] = dir.z * sp + (rr() - 0.5) * side * sp;
        lf[i] = 0.35 + rr() * 0.6; sz[i] = 0.004 + rr() * rr() * 0.022; al[i] = 0.3 + 0.35 * rr(); }
    },
    update(dt) {
      if (dt <= 0) return; let any = false;
      for (let i = 0; i < N; i++) { if (lf[i] <= 0) { if (al[i] > 0) { al[i] = 0; any = true; } continue; } any = true; const j = 3 * i;
        const dr = Math.exp(-dt * 7);   // fine droplets: air drag wins fast, gravity takes over
        vel[j] *= dr; vel[j + 2] *= dr; vel[j + 1] = vel[j + 1] * dr - 9.81 * dt * 0.6;
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt; lf[i] -= dt; al[i] = Math.min(al[i], lf[i] * 1.6); sz[i] *= 1 + dt * 0.8;
        if (pos[j + 1] < 0.01) lf[i] = 0; }
      if (any) { geo.attributes.position.needsUpdate = true; geo.attributes.aS.needsUpdate = true; geo.attributes.aA.needsUpdate = true; }
      pts.visible = any;
    },
    clear() { for (let i = 0; i < N; i++) { lf[i] = 0; al[i] = 0; } geo.attributes.aA.needsUpdate = true; pts.visible = false; },
  };
})();

/* ───────── blood, sweat, floor stains ───────── */
const FX = (() => {
  const N = 380, mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshStandardMaterial({ roughness: 0.18 }), N);
  mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.visible = false; scene.add(mesh);   // hidden while no drop is alive (it was a draw call of 380 empty instances in every pass)
  const P = new Float32Array(N * 3), Vl = new Float32Array(N * 3), life = new Float32Array(N), size = new Float32Array(N), kind = new Uint8Array(N); let head = 0;
  const cB = new THREE.Color('#7d0710'), cS = new THREE.Color('#7f8a99'), m = new M4(), zero = new M4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) { mesh.setMatrixAt(i, zero); mesh.setColorAt(i, cB); }
  const DN = 240, dgeo = new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2);
  const dmesh = new THREE.InstancedMesh(dgeo, new THREE.MeshStandardMaterial({ color: '#4d0408', roughness: 0.42, envMapIntensity: 0.4, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), DN);
  dmesh.frustumCulled = false; dmesh.receiveShadow = true; dmesh.matrixAutoUpdate = false; dmesh.visible = false; ARENA.add(dmesh); let dh = 0, live = 0;
  for (let i = 0; i < DN; i++) dmesh.setMatrixAt(i, zero);
  const q = new Quat(), s3 = new V3(), p3 = new V3(), up = new V3(0, 1, 0);
  function decal(x, z, r) {
    p3.set(x, 0, z); ARENA.worldToLocal(p3); if (LOC.bound.kind === 'circle' ? Math.hypot(p3.x, p3.z) > LOC.wall.r - 0.05 : Math.abs(p3.x) > 2.75 || Math.abs(p3.z) > 2.75) return;   // only on the fighting floor
    q.setFromAxisAngle(up, rr() * 6.28); s3.set(r * (2.2 + rr() * 3), 1, r * (1.6 + rr() * 2.4)); p3.y = 0.003 + (dh % DN) * 2e-5;
    dmesh.setMatrixAt(dh % DN, m.compose(p3, q, s3)); dh++; dmesh.instanceMatrix.needsUpdate = true; dmesh.visible = true;
  }
  function emit(pos, dir, sp, spread, k, sz, jit = 0.05) {
    const i = head++ % N, j = 3 * i;
    P[j] = pos.x + (rr() - 0.5) * jit; P[j + 1] = pos.y + (rr() - 0.5) * jit; P[j + 2] = pos.z + (rr() - 0.5) * jit;
    Vl[j] = dir.x * sp + (rr() - 0.5) * spread; Vl[j + 1] = dir.y * sp + (rr() - 0.2) * spread; Vl[j + 2] = dir.z * sp + (rr() - 0.5) * spread;
    life[i] = 1.2 + rr(); size[i] = sz; kind[i] = k; mesh.setColorAt(i, k ? cB : cS); mesh.instanceColor.needsUpdate = true; live = 1;
  }
  return {
    // sweat flicked off the skin at the point of contact
    spawn(pos, dir, power) { const ns = ((6 + power * 12) * GFX.particles) | 0; for (let i = 0; i < ns; i++) emit(pos, dir, 0.8 + rr() * 2.6 * (0.5 + power), 1.4, 0, 0.0012 + rr() * 0.0018, 0.012); },
    // blood mist: a punch on a bleeding face atomises the blood film — a cloud of fine droplets thrown along the punch and
    // sideways off the skin (the red haze in fight photos), plus a few heavy drops
    mist(pos, dir, power, amt) { MIST.burst(pos, dir, power, amt); const nd = (amt * (4 + power * 10) * GFX.particles) | 0; for (let i = 0; i < nd; i++) emit(pos, _xm.copy(dir).add(_xm2.set(rr() - 0.5, rr() * 0.6, rr() - 0.5)).normalize(), 1.5 + rr() * 3.5 * power, 1.2, 1, 0.002 + rr() * 0.004, 0.02); },
    // one drop of blood leaving a wound
    drop(pos, vel, spread, sz) {
      const i = head++ % N, j = 3 * i; P[j] = pos.x; P[j + 1] = pos.y; P[j + 2] = pos.z;
      Vl[j] = vel.x + (rr() - 0.5) * spread; Vl[j + 1] = vel.y + (rr() - 0.3) * spread; Vl[j + 2] = vel.z + (rr() - 0.5) * spread;
      life[i] = 2.5; size[i] = sz; kind[i] = 1; mesh.setColorAt(i, cB); mesh.instanceColor.needsUpdate = true; live = 1;
    },
    update(dt) {
      if (!live) return; live = 0;   // nothing in the air: no loop, no buffer upload, no draw call
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue; const j = 3 * i;
        if (dt > 0) { Vl[j + 1] -= 9.81 * dt; const d = 1 - 0.8 * dt; Vl[j] *= d; Vl[j + 2] *= d; P[j] += Vl[j] * dt; P[j + 1] += Vl[j + 1] * dt; P[j + 2] += Vl[j + 2] * dt; life[i] -= dt; }
        if (P[j + 1] < 0.006 || life[i] <= 0) { if (kind[i] && P[j + 1] < 0.02) decal(P[j], P[j + 2], size[i]); life[i] = 0; mesh.setMatrixAt(i, zero); continue; }
        // drops are drawn stretched along their motion (what the eye sees of a fast droplet), round once they slow down
        const s = size[i] * 0.5, vx = Vl[j], vy = Vl[j + 1], vz = Vl[j + 2], sp = Math.hypot(vx, vy, vz), k = Math.min(1 + sp * 0.006 / s, 7);
        if (sp > 1e-3) q.setFromUnitVectors(up, s3.set(vx / sp, vy / sp, vz / sp)); else q.identity();
        mesh.setMatrixAt(i, m.compose(p3.set(P[j], P[j + 1], P[j + 2]), q, s3.set(s, s * k, s))); live = 1;
      }
      mesh.instanceMatrix.needsUpdate = true; mesh.visible = !!live;
    },
    clearAir() { for (let i = 0; i < N; i++) { life[i] = 0; mesh.setMatrixAt(i, zero); } mesh.instanceMatrix.needsUpdate = true; mesh.visible = false; live = 0; MIST.clear(); },
    clearFloor() { for (let i = 0; i < DN; i++) dmesh.setMatrixAt(i, zero); dmesh.instanceMatrix.needsUpdate = true; dmesh.visible = false; dh = 0; },
  };
})();

/* ───────── sound (synthesised) ───────── */
const sfx = (() => {
  let ac = null, noise = null, master = null, crowdG = null;   // master: everything goes through one gain — the volume of the settings screen (OPT.vol)
  let bus = null, conv = null, wet = null, amb = null, ambId = null, wantId = null; const IR = {}, BUF = {};   // bus: the punches, sent on to master and through the echo of the place (conv → wet)
  const ctx = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } master = ac.createGain(); master.gain.value = OPT.vol; master.connect(ac.destination);
    bus = ac.createGain(); conv = ac.createConvolver(); conv.normalize = false; wet = ac.createGain(); wet.gain.value = 0; bus.connect(master); bus.connect(conv).connect(wet).connect(master); const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = b; } if (ac.state === 'suspended') ac.resume(); return ac; };
  const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  /* ── the place: the echo of its walls and its ambience ──
     SPACE[id]: the reverb the punches (thud, fall, the referee's clap) are sent through — a convolution with a synthesised impulse:
     noise through a one-pole low-pass (lp, Hz) that dies out in len seconds (−60 dB), plus a few early echoes (taps: [s, gain]),
     scaled to unit energy; wet = its level, amb = how much of the ambience rings in it too. The parking and the warehouse boom,
     the yard and the tyre yard are dry (open air: a faint slap off the houses), the gym is a padded hall.
     AMB[id](out, L): the looped ambience of a place, built into the gain `out`; its sources go into L (place() starts and stops them).
     Levels measured at master (offline render): ambience 0.02–0.035 RMS, a full punch ≈ 0.15–0.2 RMS over its 0.2 s (peak > 1) — the
     ambience sits 15–20 dB under it; the tail 0.4–1.2 s after a punch: parking ≈ 0.04, warehouse ≈ 0.03, yard ≈ 0.01, tyres < 0.01. */
  const SPACE = {
    gym: { len: 0.6, lp: 3500, wet: 0.12 },
    yard: { len: 0.3, lp: 2600, wet: 0.05, taps: [[0.12, 0.5], [0.19, 0.25]] },
    tires: { len: 0.2, lp: 2400, wet: 0.03 },
    parking: { len: 2.2, lp: 1700, wet: 0.6, amb: 0.3, taps: [[0.04, 0.5], [0.075, 0.4], [0.13, 0.3]] },
    warehouse: { len: 2.8, lp: 3200, wet: 0.55, amb: 0.5, taps: [[0.055, 0.5], [0.12, 0.4], [0.2, 0.3], [0.31, 0.2]] },
    metro: { len: 2.6, lp: 2900, wet: 0.5, amb: 0.4, taps: [[0.035, 0.5], [0.07, 0.4], [0.16, 0.3], [0.26, 0.2]] } };   // a long stone hall: the slap comes back off the track walls, then from the ends
  const AMB_LVL = 1;
  const impulse = S => { const sr = ac.sampleRate, n = (sr * S.len) | 0, b = ac.createBuffer(2, n, sr), k = 1 - Math.exp(-2 * Math.PI * S.lp / sr);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let y = 0, e = 0;
      for (let i = 0; i < n; i++) { const t = i / sr; y += k * (Math.random() * 2 - 1 - y); d[i] = y * Math.exp(-6.9 * t / S.len) * Math.min(1, t / 0.006); }
      const pk = Math.sqrt(k / (2 - k) / 3);   // the level the tail starts at: the early echoes are given relative to it
      for (const [tt, g] of S.taps || []) { const i = (tt * (c ? 1.09 : 1) * sr) | 0; if (i < n) d[i] += g * pk * 0.5 * Math.sqrt(n / 13.8); }   // (each carries ≈ g² / 4 of the tail's energy)
      for (let i = 0; i < n; i++) e += d[i] * d[i]; e = 1 / Math.sqrt(e || 1); for (let i = 0; i < n; i++) d[i] *= e; }
    return b; };
  const loop = (buf, rate = 1) => { const n = ac.createBufferSource(); n.buffer = buf; n.loop = true; n.playbackRate.value = rate; return n; };
  const filt = (type, fq, q = 0.7) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = fq; f.Q.value = q; return f; };
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  // a slowly wandering control signal (gusts, flutter): the noise buffer read very slowly, smoothed, scaled to about ±depth / 2, added to an AudioParam
  const wander = (L, param, depth, rate = 0.0004, cut = 4) => { const n = loop(noise, rate), f = filt('lowpass', cut), g = gain(depth); n.connect(f).connect(g).connect(param); L.push(n); };
  // a band of noise: noise → filter → gain → out; returns [filter, gain] to hang wander() on
  const band = (L, out, type, fq, q, lvl) => { const n = loop(noise), f = filt(type, fq, q), g = gain(lvl); n.connect(f).connect(g).connect(out); L.push(n); return [f, g]; };
  // a loop of sparse one-shots (crackles, drips) rendered once into a buffer of len seconds
  const render = (len, fn) => { const sr = ac.sampleRate, b = ac.createBuffer(1, (sr * len) | 0, sr); fn(b.getChannelData(0), sr); return b; };
  const AMB = {
    // the yard at dusk: the far city (a low rumble that swells as traffic passes), wind between the houses, leaves
    yard(out, L) {
      const [, c] = band(L, out, 'lowpass', 150, 0.6, 0.55); wander(L, c.gain, 0.3, 0.00025, 1.5);
      const [w, wg] = band(L, out, 'bandpass', 480, 0.9, 0.05); wander(L, wg.gain, 0.07, 0.0005, 2); wander(L, w.frequency, 260, 0.0003, 2);
      const [, h] = band(L, out, 'highpass', 3500, 0.5, 0.006); wander(L, h.gain, 0.008, 0.0005, 2);
    },
    // tyres and fire: the drums roar and flutter, the wood crackles (clicks of 1–3 ms) and pops (dull thumps of 20–50 ms)
    tires(out, L) {
      const [, r] = band(L, out, 'lowpass', 380, 0.7, 0.22); wander(L, r.gain, 0.2, 0.003, 14);
      const b = BUF.fire || (BUF.fire = render(6, (d, sr) => {
        for (let k = 0; k < 150; k++) { const pop = k < 9, i0 = (Math.random() * d.length) | 0, n = (sr * (pop ? 0.02 + 0.03 * Math.random() : 0.0006 + 0.002 * Math.random())) | 0, a = pop ? 0.5 + 0.5 * Math.random() : 0.08 + 0.9 * Math.random() ** 3; let y = 0;
          for (let i = 0; i < n && i0 + i < d.length; i++) { y += (pop ? 0.12 : 1) * (Math.random() * 2 - 1 - y); d[i0 + i] += a * y * (pop ? 2.2 : 1) * Math.exp(-5 * i / n); } } }));
      for (const [rate, lvl] of [[1, 0.2], [0.81, 0.13]]) { const n = loop(b, rate), g = gain(lvl); n.connect(g).connect(out); L.push(n); }
    },
    // the underground parking: the ventilation — mains hum, air in the ducts beaten by a fan's blades, the hiss of the grilles
    parking(out, L) {
      for (const [fq, lvl, type] of [[50, 0.03, 'sine'], [100, 0.02, 'sine'], [149.6, 0.01, 'triangle']]) { const o = ac.createOscillator(), g = gain(lvl); o.type = type; o.frequency.value = fq; o.connect(g).connect(out); L.push(o); }
      const [, d] = band(L, out, 'bandpass', 240, 0.7, 0.1), bl = ac.createOscillator(), bg = gain(0.025); bl.frequency.value = 11.3; bl.connect(bg).connect(d.gain); L.push(bl);
      const [, lo] = band(L, out, 'lowpass', 95, 0.7, 0.3); wander(L, lo.gain, 0.1, 0.0003, 1);
      band(L, out, 'bandpass', 1900, 1.2, 0.006);
    },
    // the abandoned warehouse: wind whistling in the cracks of the gate and the roof, water dripping from it
    warehouse(out, L) {
      const [, lo] = band(L, out, 'lowpass', 190, 0.7, 0.3); wander(L, lo.gain, 0.25, 0.0004, 1.5);
      for (const [fq, q, lvl, dev] of [[820, 14, 0.05, 240], [1460, 20, 0.02, 380]]) { const [f, g] = band(L, out, 'bandpass', fq, q, lvl); wander(L, f.frequency, dev, 0.00035, 1.5); wander(L, g.gain, lvl * 1.6, 0.0005, 1.5); }
      const b = BUF.drip || (BUF.drip = render(9, (d, sr) => {
        let t = 0.3; while (t < 8.6) { const f0 = 750 + 900 * Math.random(), a = 0.35 + 0.65 * Math.random(), i0 = (t * sr) | 0, n = (0.09 * sr) | 0;
          for (let i = 0; i < n && i0 + i < d.length; i++) { const x = i / sr; d[i0 + i] += a * Math.sin(2 * Math.PI * (f0 * x + 9000 * x * x)) * Math.exp(-x / 0.014) * Math.min(1, x / 0.001); }   // a plink: the pitch runs up
          t += Math.random() < 0.25 ? 0.13 + 0.1 * Math.random() : 0.5 + 1.6 * Math.random(); } }));
      const n = loop(b), g = gain(0.1); n.connect(g).connect(out); L.push(n);
    },
    // the metro station at night: the ventilation shafts breathe, the escalators grind far away, a transformer hums
    metro(out, L) {
      const [, lo] = band(L, out, 'lowpass', 110, 0.7, 0.32); wander(L, lo.gain, 0.2, 0.0002, 1);
      const [, es] = band(L, out, 'bandpass', 310, 2.2, 0.035), cl = ac.createOscillator(), cg = gain(0.02); cl.frequency.value = 6.4; cl.connect(cg).connect(es.gain); L.push(cl);
      for (const [fq, lvl] of [[100, 0.012], [200, 0.006]]) { const o = ac.createOscillator(), g = gain(lvl); o.frequency.value = fq; o.connect(g).connect(out); L.push(o); }
      const [w, wg] = band(L, out, 'bandpass', 620, 1.4, 0.02); wander(L, wg.gain, 0.03, 0.0004, 1.5); wander(L, w.frequency, 300, 0.0003, 1.5);
    },
  };
  let trn = null;   // the metro train (13f_loc_metro.js): its looped rumble, built on first use
  return {
    /* the train in the station: lv 0..1 = how loud (how much of it is here × how fast), v = its speed (m/s): a low roar, the clatter
       of the wheels on the joints (the roar beaten at a rate that follows the speed), the whine of the motors rising with it */
    train(lv, v) { const a = ac; if (!a || (!trn && lv <= 0)) return; const t = a.currentTime;
      if (!trn) { const g = gain(0), lo = loop(noise), f1 = filt('lowpass', 140, 0.8), g1 = gain(1.5), hi = loop(noise, 0.7), f2 = filt('bandpass', 1300, 0.7), g2 = gain(0.16), wh = a.createOscillator(), f3 = filt('lowpass', 900), g3 = gain(0.03), bt = a.createOscillator(), bg = gain(0.5), am = gain(0.6);
        wh.type = 'sawtooth'; bt.type = 'square'; lo.connect(f1).connect(g1).connect(am); hi.connect(f2).connect(g2).connect(am); bt.connect(bg).connect(am.gain); am.connect(g); wh.connect(f3).connect(g3).connect(g); g.connect(master); g.connect(gain(0.5)).connect(conv);
        for (const n of [lo, hi, wh, bt]) n.start(t); trn = { g, wh, bt, f2 }; }
      trn.g.gain.setTargetAtTime(0.5 * clamp(lv, 0, 1), t, 0.25); trn.wh.frequency.setTargetAtTime(70 + 26 * v, t, 0.2); trn.bt.frequency.setTargetAtTime(0.4 + 0.5 * v, t, 0.2); trn.f2.frequency.setTargetAtTime(700 + 90 * v, t, 0.2); },
    // air let out of the brakes
    trainHiss(p = 1) { const a = ac; if (!a) return; const t = a.currentTime, n = a.createBufferSource(), f = filt('highpass', 2600), g = a.createGain(); n.buffer = noise; n.loop = true; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.11 * p, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5); n.connect(f).connect(g).connect(bus); n.start(t, rr() * 0.5); n.stop(t + 1.6); },
    // the doors: a hiss of the pneumatics and the leaves hitting their stops (closing: harder, with the warning tone before it)
    trainDoors(open) { const a = ac; if (!a) return; const t = a.currentTime; this.trainHiss(0.5);
      if (!open) for (const [d, fq] of [[0, 660], [0.22, 520]]) { const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = fq; env(g, t + d, 0.01, 0.2, 0.05); o.connect(g).connect(bus); o.start(t + d); o.stop(t + d + 0.3); }
      for (const d of [1.2, 1.26]) { const n = a.createBufferSource(), f = filt('lowpass', open ? 500 : 800), g = a.createGain(); n.buffer = noise; env(g, t + d, 0.003, 0.09, open ? 0.25 : 0.45); n.connect(f).connect(g).connect(bus); n.start(t + d, rr() * 0.5); n.stop(t + d + 0.15); } },
    // the horn out of the tunnel before the train shows
    trainHorn() { const a = ac; if (!a) return; const t = a.currentTime + 0.3; for (const fq of [311, 370]) { const o = a.createOscillator(), f = filt('lowpass', 1100), g = a.createGain(); o.type = 'sawtooth'; o.frequency.value = fq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.06); g.gain.setValueAtTime(0.035, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); o.connect(f).connect(g).connect(conv); o.start(t); o.stop(t + 1); } },
    unlock() { ctx(); if (ac && wantId) this.place(wantId); },
    vol(v) { if (master) master.gain.value = v; },
    /* the location changed (setLocation): its echo for the punches and its ambience (cross-faded). Before the first sound of the
       game there is no audio context yet — the place is remembered and set by unlock() */
    place(id) { wantId = id; const a = ac; if (!a || id === ambId) return; ambId = id; const t = a.currentTime, S = SPACE[id] || SPACE.gym;
      conv.buffer = IR[id] || (IR[id] = impulse(S)); wet.gain.setTargetAtTime(S.wet, t, 0.05);
      if (amb) { const o = amb; amb = null; o.g.gain.setTargetAtTime(0, t, 0.25); setTimeout(() => { for (const n of o.L) try { n.stop(); } catch (e) {} o.g.disconnect(); }, 1500); }
      if (!AMB[id]) return;
      const g = gain(0), L = []; AMB[id](g, L); g.connect(master); if (S.amb) g.connect(gain(S.amb)).connect(conv);   // the drips and the hum ring in the hall too
      for (const n of L) { if (n.buffer) n.start(t, Math.random() * n.buffer.duration); else n.start(t); }
      g.gain.setTargetAtTime(AMB_LVL, t, 0.7); amb = { g, L }; },
    // the referee claps his hands — the start of a round in a street fight: two palms never land together (a flam of two short bursts)
    clap() { const a = ac; if (!a) return; for (const [d, pk] of [[0, 1.1], [0.011, 0.8]]) { const t = a.currentTime + d, n = a.createBufferSource(), f = filt('bandpass', 1400 + 500 * rr(), 1.1), g = a.createGain(); n.buffer = noise; env(g, t, 0.001, 0.09, pk); n.connect(f).connect(g).connect(bus); n.start(t, rr() * 0.5); n.stop(t + 0.12); } },
    thud(p, body) { const a = ac; if (!a) return; const t = a.currentTime, master = bus;   // (shadows master: a punch goes through the echo of the place)
      { const n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = noise; f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.value = body ? 1700 : 2600; env(g, t, 0.002, 0.035, 0.22 + 0.2 * p); n.connect(f).connect(g).connect(master); n.start(t, rr() * 0.5); n.stop(t + 0.06); }   // skin slap
      const n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = noise; f.type = 'lowpass'; f.frequency.setValueAtTime(1400 + 900 * p, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.12); env(g, t, 0.004, 0.13, 0.5 + 0.4 * p); n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + 0.2);
      const o = a.createOscillator(), g2 = a.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16); env(g2, t, 0.004, 0.18, 0.5 + 0.4 * p); o.connect(g2).connect(master); o.start(t); o.stop(t + 0.25); },
    /* A fist landing on gloves / forearms (issue 41): a dry, dull leather "pock" — darker and much shorter than thud
       (no bright 2.6 kHz skin slap, no body ring), two low-passed bursts and a short low knock. p = raw force 0.2…1.6,
       loud > 1 on a broken guard. */
    block(p, loud = 1) { const a = ac; if (!a) return; const t = a.currentTime, out = bus, k = clamp(p, 0.2, 1.6), L = clamp(loud, 1, 2);
      { const n = a.createBufferSource(), f = filt('lowpass', 780 + 420 * k, 0.9), g = a.createGain(); n.buffer = noise; env(g, t, 0.001, 0.018 + 0.012 * k, (0.22 + 0.26 * k) * L); n.connect(f).connect(g).connect(out); n.start(t, rr() * 0.5); n.stop(t + 0.06); }   // muffled slap of leather on leather
      { const n = a.createBufferSource(), f = filt('lowpass', 380, 0.8), g = a.createGain(); n.buffer = noise; env(g, t, 0.002, 0.03 + 0.02 * k, (0.16 + 0.2 * k) * L); n.connect(f).connect(g).connect(out); n.start(t, rr() * 0.5); n.stop(t + 0.09); }   // the dull knock behind it
      const o = a.createOscillator(), g2 = a.createGain(); o.frequency.setValueAtTime(112 + 26 * k, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.07); env(g2, t, 0.002, 0.06, (0.2 + 0.18 * k) * L); o.connect(g2).connect(out); o.start(t); o.stop(t + 0.09); },
    /* A clean body shot forces the air out of him (issue 44): a short breath — noise through a bandpass falling
       900 → 320 Hz, straight to master (no room echo: close to the mic), plus a faint chest thump. p = effective power. */
    exhale(p) { const a = ac; if (!a) return; const t = a.currentTime, k = clamp(p, 0.2, 1.6);
      const n = a.createBufferSource(), f = filt('bandpass', 900, 0.7), g = a.createGain(); n.buffer = noise;
      f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(320, t + 0.2);
      env(g, t, 0.012, 0.22, 0.13 + 0.12 * k); n.connect(f).connect(g).connect(master); n.start(t, rr() * 0.5); n.stop(t + 0.3);
      const o = a.createOscillator(), g2 = a.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
      env(g2, t, 0.01, 0.18, 0.06 + 0.05 * k); o.connect(g2).connect(master); o.start(t); o.stop(t + 0.25); },
    /* the heavy bag: a deep thump of 40 kg of filling (sine dropping from ~95 Hz + a low-passed burst), the slap of knuckles on
       leather on top; p = power 0.2 … 1.6 */
    bag(p) { const a = ac; if (!a) return; const t = a.currentTime, master = bus, k = clamp(p, 0.2, 1.6);
      { const n = a.createBufferSource(), f = filt('bandpass', 1500 + 500 * rr(), 0.8), g = a.createGain(); n.buffer = noise; env(g, t, 0.002, 0.03 + 0.012 * k, 0.12 + 0.2 * k); n.connect(f).connect(g).connect(master); n.start(t, rr() * 0.5); n.stop(t + 0.08); }
      { const n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = noise; f.type = 'lowpass'; f.frequency.setValueAtTime(700 + 600 * k, t); f.frequency.exponentialRampToValueAtTime(110, t + 0.16); env(g, t, 0.004, 0.14 + 0.06 * k, 0.4 + 0.5 * k); n.connect(f).connect(g).connect(master); n.start(t, rr() * 0.5); n.stop(t + 0.3); }
      const o = a.createOscillator(), g2 = a.createGain(); o.frequency.setValueAtTime(92 + 22 * k, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.24); env(g2, t, 0.005, 0.2 + 0.12 * k, 0.45 + 0.5 * k); o.connect(g2).connect(master); o.start(t); o.stop(t + 0.45); },
    // its chains: a few links knocking together — short inharmonic pings, quiet; p = 0 … 1, d = delay (s)
    clink(p, d = 0) { const a = ac; if (!a) return; const n = 2 + ((p * 4) | 0);
      for (let i = 0; i < n; i++) { const t = a.currentTime + d + i * (0.018 + rr() * 0.04), f0 = 2300 + rr() * 2600;
        for (const [m, pk, len] of [[1, 0.035, 0.07], [2.76, 0.018, 0.045], [5.4, 0.008, 0.03]]) { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = Math.min(15000, f0 * m); env(g, t, 0.001, len * (0.7 + rr() * 0.6), pk * (0.35 + p)); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.12); } } },
    whoosh(v = 1) { const a = ac; if (!a) return; const t = a.currentTime, n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = noise; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.14); env(g, t, 0.03, 0.14, 0.16 * v); n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + 0.25); },
    bell(count) { const a = ac; if (!a) return; for (let k = 0; k < count; k++) { const t = a.currentTime + k * 0.3; for (const [fq, pk] of [[640, 0.22], [1287, 0.12], [1932, 0.07], [2580, 0.04]]) { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = fq; env(g, t, 0.003, 1.3, pk); o.connect(g).connect(master); o.start(t); o.stop(t + 1.5); } } },
    /* (issue 45) the short «step counted» chime of the tutorial: two quiet sine notes, well under a bell */
    ping() { const a = ac; if (!a) return; const t = a.currentTime; for (const [fq, d, pk] of [[880, 0, 0.14], [1320, 0.07, 0.11]]) { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = fq; env(g, t + d, 0.002, 0.13, pk); o.connect(g).connect(master); o.start(t + d); o.stop(t + d + 0.2); } },
    /* (issue 46) the referee's count: a small gong (inharmonic partials through the room echo) plus a spoken-ish
       vowel — a sawtooth through two parallel band-pass formants — a step higher as the count rises. */
    count(n) { const a = ac; if (!a) return; const t = a.currentTime, k = 0.8 + 0.2 * clamp(n, 1, 10);
      for (const [m, pk, len] of [[1, 0.16, 0.5], [1.49, 0.09, 0.38], [2.23, 0.05, 0.3], [3.12, 0.025, 0.22]]) {
        const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = 196 * m;
        env(g, t, 0.003, len, pk * k); o.connect(g).connect(bus); o.start(t); o.stop(t + len + 0.1); }
      { const o = a.createOscillator(), g = a.createGain(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(110 + n * 3, t); o.frequency.linearRampToValueAtTime(96 + n * 3, t + 0.22);
        env(g, t, 0.02, 0.2, 0.05);
        for (const [fq, q, lv] of [[620, 5, 1], [1150, 7, 0.7]]) { const f = filt('bandpass', fq, q), fg = gain(lv); o.connect(f).connect(fg).connect(g); }
        g.connect(bus); o.start(t); o.stop(t + 0.3); } },
    /* (issue 46) the moment the lights go out: a deep, dull impact under the punch's crack — a low sine dropping
       125 → 34 Hz and a short low-passed noise thump, both into the room echo. p ≈ 1.2 for a KO, 0.7 for a knockdown. */
    koHit(p = 1) { const a = ac; if (!a) return; const t = a.currentTime, k = clamp(p, 0.4, 1.4);
      const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(125, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.28);
      env(g, t, 0.006, 0.34, 0.55 * k); o.connect(g).connect(bus); o.start(t); o.stop(t + 0.4);
      const n = a.createBufferSource(), f = filt('lowpass', 420), ng = a.createGain(); n.buffer = noise;
      env(ng, t, 0.002, 0.12, 0.3 * k); n.connect(f).connect(ng).connect(bus); n.start(t, rr() * 0.4); n.stop(t + 0.16); },
    /* the crowd. crowd(level): a looped murmur (noise through three voice-band filters, its loudness wandering like many people
       talking) whose level follows the reaction, 0 = nobody there. roar(p): the shout on a big shot — a swell of noise and a few voices */
    crowd(level) { const a = ac; if (!a) return;
      if (!crowdG) { if (level <= 0) return;
        const src = a.createBufferSource(), am = a.createGain(), lf = a.createBufferSource(), lp = a.createBiquadFilter(), dep = a.createGain(); crowdG = a.createGain(); crowdG.gain.value = 0;
        src.buffer = noise; src.loop = true;
        for (const [fq, q, k] of [[330, 0.7, 1], [760, 1.1, 0.75], [1500, 1.4, 0.3]]) { const f = a.createBiquadFilter(), g = a.createGain(); f.type = 'bandpass'; f.frequency.value = fq; f.Q.value = q; g.gain.value = k; src.connect(f).connect(g).connect(crowdG); }
        lf.buffer = noise; lf.loop = true; lf.playbackRate.value = 0.0004; lp.type = 'lowpass'; lp.frequency.value = 5; dep.gain.value = 0.45; am.gain.value = 0.7;
        lf.connect(lp).connect(dep).connect(am.gain); crowdG.connect(am).connect(master); src.start(); lf.start(); }
      crowdG.gain.setTargetAtTime(0.2 * level, a.currentTime, 0.35); },
    roar(p) { const a = ac; if (!a) return; const t = a.currentTime, d = 0.7 + 1.8 * p;
      const n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = noise; n.loop = true; f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(1100 + 500 * p, t + 0.25); f.frequency.linearRampToValueAtTime(800, t + d);
      env(g, t, 0.15, d, 0.12 + 0.3 * p); n.connect(f).connect(g).connect(master); n.start(t, rr() * 0.5); n.stop(t + d + 0.3);
      for (let i = 0, nv = 2 + (p * 5 | 0); i < nv; i++) { const o = a.createOscillator(), bf = a.createBiquadFilter(), og = a.createGain(), t0 = t + rr() * 0.35, f0 = 190 + rr() * 260, len = 0.25 + rr() * 0.5;
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f0 * (1.25 + rr() * 0.4), t0 + len * 0.35); o.frequency.linearRampToValueAtTime(f0 * 0.85, t0 + len);
        bf.type = 'bandpass'; bf.frequency.value = 700 + rr() * 700; bf.Q.value = 2; env(og, t0, 0.05, len, 0.02 + 0.03 * p); o.connect(bf).connect(og).connect(master); o.start(t0); o.stop(t0 + len + 0.1); } },
    fall() { const a = ac; if (!a) return; const t = a.currentTime, master = bus, o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.3); env(g, t, 0.005, 0.35, 0.7); o.connect(g).connect(master); o.start(t); o.stop(t + 0.4); },
  };
})();

