/* issue 81: the light tee for GFX low — assets/cloth/tee.glb thinned to ≤ TARGET triangles → assets/cloth/tee_lo.glb. Runs in the debug
   page on the mesh the game itself parsed (CLOTH.tee, body geometry frame), prints the GLB as base64:
     bash tools/shot.sh /tmp/shots/lo.jpg js "return await eval(await (await fetch('tools/assets/cloth/tee_lo.js')).text())" \
       | grep -o 'B64:[A-Za-z0-9+/=]*' | cut -c5- | base64 -d > assets/cloth/tee_lo.glb
   Half-edge collapses only (a vertex is merged INTO a neighbour, nothing is moved or re-interpolated): every kept vertex keeps its own
   uv, normal, tangent and skin, so the full mesh's normal map tee_n.webp fits the light one as is — no second bake. Order: quadric
   error (Garland–Heckbert, the planes of the triangles around both ends) at the kept end; a uv-seam or open-rim vertex (hem, cuffs,
   neck) only slides along its own seam / rim; no collapse may flip a triangle (> 60°) or leave a sliver. (Blender's Decimate in
   tee_game.py — the file's tshirt_low — has its own uv and would need its own bake; bpy is not available on the bot's runner.) */
(async () => {
  const TARGET = 3000, d = __cloth.CLOTH.tee;
  if (!d) return 'no CLOTH.tee (the GLB did not load)';
  if (/_lo$/.test(__cloth.CLOTH.st.tee.file || '')) return 'the page loaded the light tee (GFX low): set a higher level first — __g.setGfx("high")';
  const n = d.verts, P = i => [d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2]];
  let T = Array.from(d.idx.array); const t0 = T.length / 3;
  // position groups (copies of one point along a uv seam / a normal split)
  const gk = new Map(), grp = new Int32Array(n), members = [];
  for (let i = 0; i < n; i++) { const k = P(i).map(x => Math.round(x * 100)).join(','); let g = gk.get(k); if (g === undefined) { g = members.length; gk.set(k, g); members.push([]); } grp[i] = g; members[g].push(i); }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]);
  const triN = (a, b, c) => cross(sub(P(b), P(a)), sub(P(c), P(a)));
  for (let pass = 0; pass < 60 && T.length / 3 > TARGET; pass++) {
    const nt = T.length / 3, vt = Array.from({ length: n }, () => []), ge = new Map();   // vertex → its triangles; group edge → triangle count
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
      vt[T[t * 3 + k]].push(t);
      const a = grp[T[t * 3 + k]], b = grp[T[t * 3 + (k + 1) % 3]], key = a < b ? a + ',' + b : b + ',' + a; ge.set(key, (ge.get(key) || 0) + 1);
    }
    // seam: a vertex whose group has another live copy; rim: on a group edge used by one triangle. A special vertex keeps its line
    const live = new Uint8Array(n); for (const i of T) live[i] = 1;
    const copies = g => members[g].filter(i => live[i]).length;
    const rimE = (a, b) => ge.get(a < b ? a + ',' + b : b + ',' + a) === 1;
    const special = new Uint8Array(n); for (let i = 0; i < n; i++) if (live[i] && copies(grp[i]) > 1) special[i] = 1;
    for (const [key, c] of ge) if (c === 1) { const [a, b] = key.split(',').map(Number); for (const i of members[a]) special[i] = 1; for (const i of members[b]) special[i] = 1; }
    // quadric per vertex: Σ of the planes of its triangles (area weighted)
    const Q = new Float64Array(n * 10);
    for (let t = 0; t < nt; t++) {
      const a = T[t * 3], nn = triN(a, T[t * 3 + 1], T[t * 3 + 2]), L = len(nn); if (L < 1e-9) continue;
      const [x, y, z] = nn.map(v => v / L), w = -dot([x, y, z], P(a)), q = [x * x, x * y, x * z, x * w, y * y, y * z, y * w, z * z, z * w, w * w];
      for (let k = 0; k < 3; k++) { const v = T[t * 3 + k]; for (let j = 0; j < 10; j++) Q[v * 10 + j] += q[j] * L; }
    }
    const err = (a, b) => { const [x, y, z] = P(b), q = j => Q[a * 10 + j] + Q[b * 10 + j];
      return q(0) * x * x + 2 * q(1) * x * y + 2 * q(2) * x * z + 2 * q(3) * x + q(4) * y * y + 2 * q(5) * y * z + 2 * q(6) * y + q(7) * z * z + 2 * q(8) * z + q(9); };
    const cand = [];
    for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) {
      const a = T[t * 3 + k], b = T[t * 3 + (k + 1) % 3];
      for (const [u, v] of [[a, b], [b, a]]) {
        if (grp[u] === grp[v]) continue;
        // a special vertex only along its line: a seam copy along a seam edge (the other end special too) / a rim one along the rim
        // seam copies stay (the partner copy in the other uv chart would have to follow); a rim vertex slides along its rim only
        if (special[u] && (copies(grp[u]) > 1 || !rimE(grp[u], grp[v]))) continue;
        cand.push([err(u, v), u, v]);
      }
    }
    cand.sort((p, q) => p[0] - q[0]);
    const touched = new Uint8Array(n); let done = 0; const goal = nt - TARGET;
    for (const [, u, v] of cand) {
      if (done * 2 >= goal + 1 || touched[u] || touched[v]) continue;
      // the triangles around u with u → v: none may flip or collapse to a sliver
      let ok = true, gone = 0;
      for (const t of vt[u]) {
        const tri = [T[t * 3], T[t * 3 + 1], T[t * 3 + 2]]; if (tri.includes(v)) { gone++; continue; }
        const o = triN(...tri), nw = triN(...tri.map(x => x === u ? v : x)), lo = len(o), ln = len(nw);
        if (ln < 1e-6 || dot(o, nw) < 0.5 * lo * ln || ln < 0.08 * lo) { ok = false; break; }
        const e = tri.map((x, j) => len(sub(P(tri.map(y => y === u ? v : y)[j]), P(tri.map(y => y === u ? v : y)[(j + 1) % 3]))));
        if (ln / (Math.max(...e) ** 2) < 0.05) { ok = false; break; }   // sliver
      }
      if (!ok || !gone) continue;
      for (const t of vt[u]) for (let k = 0; k < 3; k++) { touched[T[t * 3 + k]] = 1; if (T[t * 3 + k] === u) T[t * 3 + k] = v; }
      done += gone;
    }
    T = T.filter((_, i, A) => { const t = i - i % 3; return A[t] !== A[t + 1] && A[t + 1] !== A[t + 2] && A[t] !== A[t + 2]; });
    if (!done) break;
  }
  // compact + write the GLB (glTF metres Y-up: geo frame cm z-up = 100 · (x, −z, y) → (x, y, z)_gl = (gx, gz, −gy) / 100)
  const map = new Map(), V = []; const IX = T.map(i => { if (!map.has(i)) { map.set(i, V.length); V.push(i); } return map.get(i); });
  const nv = V.length, f32 = k => new Float32Array(nv * k);
  const pos = f32(3), nrm = f32(3), tan = f32(4), uv = f32(2), jo = new Uint8Array(nv * 4), wq = new Uint8Array(nv * 4);
  V.forEach((i, j) => {
    pos.set([d.pos[i * 3] / 100, d.pos[i * 3 + 2] / 100, -d.pos[i * 3 + 1] / 100], j * 3);
    nrm.set([d.nrm[i * 3], d.nrm[i * 3 + 2], -d.nrm[i * 3 + 1]], j * 3);
    tan.set([d.tan[i * 4], d.tan[i * 4 + 2], -d.tan[i * 4 + 1], d.tan[i * 4 + 3]], j * 4);
    uv.set([d.uv[i * 2], d.uv[i * 2 + 1]], j * 2);
    const w = [0, 1, 2, 3].map(k => Math.round(d.sw[i * 4 + k] * 255)); w[0] += 255 - w.reduce((s, x) => s + x, 0);
    for (let k = 0; k < 4; k++) { jo[j * 4 + k] = d.si[i * 4 + k]; wq[j * 4 + k] = w[k]; }
  });
  const mn = [0, 1, 2].map(a => Math.min(...V.map((_, j) => pos[j * 3 + a]))), mx = [0, 1, 2].map(a => Math.max(...V.map((_, j) => pos[j * 3 + a])));
  const parts = [], views = [], accs = []; let off = 0;
  const view = (arr, target) => { const b = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target }); parts.push(b); off += b.length; const pad = (4 - off % 4) % 4; if (pad) { parts.push(new Uint8Array(pad)); off += pad; } return views.length - 1; };
  const acc = (vw, componentType, type, count, extra = {}) => { accs.push({ bufferView: vw, componentType, type, count, ...extra }); return accs.length - 1; };
  const attributes = {
    POSITION: acc(view(pos, 34962), 5126, 'VEC3', nv, { min: mn, max: mx }), NORMAL: acc(view(nrm, 34962), 5126, 'VEC3', nv),
    TANGENT: acc(view(tan, 34962), 5126, 'VEC4', nv), TEXCOORD_0: acc(view(uv, 34962), 5126, 'VEC2', nv),
    JOINTS_0: acc(view(jo, 34962), 5121, 'VEC4', nv), WEIGHTS_0: acc(view(wq, 34962), 5121, 'VEC4', nv, { normalized: true }) };
  const indices = acc(view(new Uint16Array(IX), 34963), 5123, 'SCALAR', IX.length);
  const doc = { asset: { version: '2.0', generator: 'tools/assets/cloth/tee_lo.js' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'tee_lo', mesh: 0 }],
    meshes: [{ name: 'tee_lo', primitives: [{ attributes, indices, mode: 4, extras: { bones: d.bones } }], extras: { src: 'assets/cloth/tee.glb', normalMap: 'tee_n.webp', pose: 'bind A-pose' } }],
    accessors: accs, bufferViews: views, buffers: [{ byteLength: off }] };
  let js = new TextEncoder().encode(JSON.stringify(doc)); const jp = (4 - js.length % 4) % 4;
  const jsP = new Uint8Array(js.length + jp).fill(32); jsP.set(js); js = jsP;
  const total = 12 + 8 + js.length + 8 + off, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4E4F534A, true); out.set(js, 20);
  let p = 20 + js.length; dv.setUint32(p, off, true); dv.setUint32(p + 4, 0x004E4942, true); p += 8; for (const b of parts) { out.set(b, p); p += b.length; }
  let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
  return `tee_lo: ${t0} → ${IX.length / 3} tris, ${n} → ${nv} verts, ${(total / 1024).toFixed(0)} KB B64:` + btoa(s);
})()
