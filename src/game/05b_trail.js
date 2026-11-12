/* ───────── punch smear: a short fading ribbon behind the knuckles while a punch is on its way ─────────
   A cheap stand-in for motion blur (a full-screen velocity blur costs too much on phones): one camera-facing strip per
   hand, N samples of the knuckle path, drawn additive, tapering and fading towards the tail. It is on only from the start
   of the punch to just after the impact, so a snappy punch reads as a streak and the guard never leaves a trace. */
const TRAIL_N = 9, TRAIL_W = 0.055;
// aSide = +1 / −1 at the two rims: vS fades across the strip so the centre is bright and the edges dissolve (no hard white "cross" up close)
const TRAIL_VS = `attribute float aA; attribute float aSide; varying float vA; varying float vS; void main() { vA = aA; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TRAIL_FS = `uniform vec3 uC; varying float vA; varying float vS; void main() { float A = vA * (1.0 - abs(vS)); gl_FragColor = vec4(uC * A, A); }`;
const TRAILS = [];
function trailMake(F, side) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(TRAIL_N * 2 * 3), al = new Float32Array(TRAIL_N * 2), sd = new Float32Array(TRAIL_N * 2), idx = [];
  for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  for (let i = 0; i < TRAIL_N; i++) { sd[2 * i] = 1; sd[2 * i + 1] = -1; }
  g.setIndex(idx); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aA', new THREE.BufferAttribute(al, 1)); g.setAttribute('aSide', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({ vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, uniforms: { uC: { value: new THREE.Color(1.0, 0.93, 0.82).multiplyScalar(0.6) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
  return { F, side, mesh, g, pos, al, pts: [], life: 0 };
}
const _tr1 = new V3(), _tr2 = new V3(), _tr3 = new V3();
function trailTick(dt) {
  if (!TRAILS.length) { if (!P1 || !P2) return; for (const F of [P1, P2]) for (const s of ['L', 'R']) TRAILS.push(trailMake(F, s)); }
  const cam = camera.position, on = GFX.level !== 'low';
  for (const T of TRAILS) {
    const F = T.F, cur = F.cur && PUNCH[F.cur], act = cur && cur.arm === T.side && F.act[F.cur] && F.act[F.cur].time < cur.impact + 0.05;
    if (on && act && F.group.visible !== false) {
      T.pts.unshift(F.bpos(`CC_Base_${T.side}_Mid1`, new V3())); if (T.pts.length > TRAIL_N) T.pts.length = TRAIL_N; T.life = 1;
    } else { T.life = Math.max(0, T.life - dt * 9); if (T.life === 0) T.pts.length = 0; }
    const n = T.pts.length; T.mesh.visible = n > 2 && T.life > 0; if (!T.mesh.visible) continue;
    for (let i = 0; i < TRAIL_N; i++) {
      const p = T.pts[Math.min(i, n - 1)], q = i < n - 1 ? T.pts[i + 1] : T.pts[n - 2];
      _tr1.subVectors(q, p); _tr2.subVectors(cam, p); _tr3.crossVectors(_tr1, _tr2).normalize();   // across the path, facing the camera
      const k = i / (TRAIL_N - 1), w = TRAIL_W * (1 - k) * (i < n ? 1 : 0), a0 = (1 - k) * (1 - k) * 0.42 * T.life * (i < n ? 1 : 0);
      const a = a0 * clamp((_tr2.length() - 0.6) / 0.25, 0, 1);   // a streak right on the lens reads as shards: none within 0.6 m, fade in over 0.6→0.85 m
      T.pos.set([p.x + _tr3.x * w, p.y + _tr3.y * w, p.z + _tr3.z * w, p.x - _tr3.x * w, p.y - _tr3.y * w, p.z - _tr3.z * w], i * 6);
      T.al[i * 2] = T.al[i * 2 + 1] = a;
    }
    T.g.attributes.position.needsUpdate = true; T.g.attributes.aA.needsUpdate = true;
  }
}
