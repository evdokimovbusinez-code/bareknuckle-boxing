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
  let ac = null, noise = null, master = null;   // master: everything goes through one gain — the volume of the settings screen (OPT.vol)
  const ctx = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } master = ac.createGain(); master.gain.value = OPT.vol; master.connect(ac.destination); const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; noise = b; } if (ac.state === 'suspended') ac.resume(); return ac; };
  const env = (g, t, a, d, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  return {
    unlock() { ctx(); },
    vol(v) { if (master) master.gain.value = v; },
    thud(p, body) { const a = ac; if (!a) return; const t = a.currentTime;
      { const n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = noise; f.type = 'bandpass'; f.Q.value = 0.9; f.frequency.value = body ? 1700 : 2600; env(g, t, 0.002, 0.035, 0.22 + 0.2 * p); n.connect(f).connect(g).connect(master); n.start(t, rr() * 0.5); n.stop(t + 0.06); }   // skin slap
      const n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = noise; f.type = 'lowpass'; f.frequency.setValueAtTime(1400 + 900 * p, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.12); env(g, t, 0.004, 0.13, 0.5 + 0.4 * p); n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + 0.2);
      const o = a.createOscillator(), g2 = a.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16); env(g2, t, 0.004, 0.18, 0.5 + 0.4 * p); o.connect(g2).connect(master); o.start(t); o.stop(t + 0.25); },
    whoosh() { const a = ac; if (!a) return; const t = a.currentTime, n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); n.buffer = noise; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.14); env(g, t, 0.03, 0.14, 0.16); n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + 0.25); },
    bell(count) { const a = ac; if (!a) return; for (let k = 0; k < count; k++) { const t = a.currentTime + k * 0.3; for (const [fq, pk] of [[640, 0.22], [1287, 0.12], [1932, 0.07], [2580, 0.04]]) { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = fq; env(g, t, 0.003, 1.3, pk); o.connect(g).connect(master); o.start(t); o.stop(t + 1.5); } } },
    count(n) { const a = ac; if (!a) return; const t = a.currentTime; for (const [fq, pk, d] of [[180, 0.5, 0.09], [1200, 0.08, 0.03]]) { const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(fq, t); o.frequency.exponentialRampToValueAtTime(fq * 0.6, t + d); env(g, t, 0.002, d, pk); o.connect(g).connect(master); o.start(t); o.stop(t + d + 0.05); } },
    fall() { const a = ac; if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.3); env(g, t, 0.005, 0.35, 0.7); o.connect(g).connect(master); o.start(t); o.stop(t + 0.4); },
  };
})();

