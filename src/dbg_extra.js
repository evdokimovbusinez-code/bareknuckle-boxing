window.__rom = (axis, which, F) => { F = F || P1; F.frozen = true; const R = F.rag; for (const d of R.defs) { if (!d.p) continue; const Dp = F.mquat(d.p.bone, new Quat()).multiply(d.p.qBind.clone().invert()); const v = which === 2 ? d.nvec.clone() : d.ax[axis].clone().multiplyScalar(d.lim[axis][which]); const L = v.length(); const q = L > 1e-9 ? new Quat().setFromAxisAngle(v.clone().multiplyScalar(1 / L), L) : new Quat(); F.setMQuat(d.bone, Dp.multiply(q).multiply(d.qBind)); } F.cc.updateMatrixWorld(true); F.afterPose(0); };
window.__dirs = () => { const R = P1.rag, lab = v => { const o = []; if (Math.abs(v.z) > 0.4) o.push(v.z > 0 ? 'fwd' : 'back'); if (Math.abs(v.y) > 0.4) o.push(v.y > 0 ? 'up' : 'down'); if (Math.abs(v.x) > 0.4) o.push(v.x > 0 ? '+x' : '-x'); return o.join('/'); }; return R.defs.filter(d => d.ax).map(d => d.key + ' F+:' + lab(new V3().crossVectors(d.ax[0], d.ax[2])) + ' S+:' + lab(new V3().crossVectors(d.ax[1], d.ax[2]))).join(' | '); };
window.__cam=(F,bone,dx,dy,dz)=>{const g=window.__g; g.G.state='menu'; const b=F.bones[bone]; const p=new g.camera.position.constructor().setFromMatrixPosition(b.matrixWorld); g.camera.position.set(p.x+dx,p.y+dy,p.z+dz); g.camera.lookAt(p); g.composer.render();};
window.__camH=(F,dx,dy,dz,ly)=>{const g=window.__g; g.G.state='menu'; const p=F.headNow.clone(); p.y+=(ly||0); g.camera.position.set(p.x+dx,p.y+dy,p.z+dz); g.camera.lookAt(p); g.composer.render();};
window.__camE=(F,dist,side,up)=>{const g=window.__g; g.G.state='menu'; const e=new g.THREE.Vector3().setFromMatrixPosition(F.bones.CC_Base_L_Eye.matrixWorld).add(new g.THREE.Vector3().setFromMatrixPosition(F.bones.CC_Base_R_Eye.matrixWorld)).multiplyScalar(0.5); const f=F.other.headNow.clone().sub(F.headNow); f.y=0; f.normalize(); g.camera.position.copy(e).addScaledVector(f,dist); g.camera.position.z+=side||0; g.camera.position.y+=up||0; g.camera.lookAt(e); g.composer.render();};
window.__camFace=(F,dist)=>{const g=window.__g, T=g.THREE; g.G.state='menu'; const e=new T.Vector3().setFromMatrixPosition(F.bones.CC_Base_L_Eye.matrixWorld).add(new T.Vector3().setFromMatrixPosition(F.bones.CC_Base_R_Eye.matrixWorld)).multiplyScalar(0.5); const q=new T.Quaternion(); F.head.getWorldQuaternion(q); const fq=F.face.head0.clone().invert(); const D=q.clone().multiply(new T.Quaternion().copy(F.group.quaternion).multiply(F.face.head0).invert()); const fw=new T.Vector3(0,0,1).applyQuaternion(F.face.head0).applyQuaternion(fq); const f=new T.Vector3(0,0,1); F.group.localToWorld(f.add(F.group.worldToLocal(new T.Vector3()))); const hw=new T.Vector3(0,0,1).applyQuaternion(F.mquat(F.head,new T.Quaternion()).multiply(F.face.head0.clone().invert())).transformDirection(F.group.matrixWorld); g.camera.position.copy(e).addScaledVector(hw,dist); g.camera.up.set(0,1,0); g.camera.lookAt(e); g.composer.render();};
window.__cwNames = CW_POSES.map(p => p[0]);
window.__crowd = { get: () => LOC.crowd, C: CROWD, cheer: (p, hold) => LOC.crowd && LOC.crowd.cheer(p, null, hold), EVT };
Object.assign(window.__loc || (window.__loc = {}), { set: id => { G.loc = id; setLocation(id); }, get: () => LOC, LOCS, bodies: F => F.rag.world && F.rag.world.bodies ? F.rag.world.bodies.map(b => { const p = F.group.localToWorld(b.position.clone()); ARENA.worldToLocal(p); return [+Math.hypot(p.x, p.z).toFixed(2), +p.y.toFixed(2)]; }) : null });   // #47: keep the load/prefetch hooks added by 17_loc_load.js
window.__camB=(F,bone,dist,dy)=>{const g=window.__g, T=g.THREE; g.G.state='menu'; const p=new T.Vector3().setFromMatrixPosition(F.bones[bone].matrixWorld); const f=F.other.headNow.clone().sub(F.headNow); f.y=0; f.normalize(); g.camera.position.copy(p).addScaledVector(f,dist); g.camera.position.y+=(dy||0); g.camera.position.z+=0.05; g.camera.lookAt(p); g.composer.render();};
window.__sfx = sfx;
// issue 57: a GLB in exactly the layout tools/assets/cloth/tee_game.py writes, made from the older JSON export (assets/tee_hand.json) — to try the
// GLB path of 04j_cloth_asset.js before the Blender run: `await __clothTestGLB()` → CLOTH.tee from the GLB, the PNG map as its normal map, no AO
window.__clothTestGLB = async () => {
  await handLoad(); const d = HAND_TOP.tee; if (!d) throw new Error('no tee_hand.json');
  const n = d.pos.length / 3, P = [], N = [], T = [], U = [];
  for (let i = 0; i < n; i++) {   // geo (cm, z up) → glTF metres, Y-up: (x, z, −y) / 100; uv v down
    P.push([d.pos[i * 3] / 100, d.pos[i * 3 + 2] / 100, -d.pos[i * 3 + 1] / 100]); N.push([d.nrm[i * 3], d.nrm[i * 3 + 2], -d.nrm[i * 3 + 1]]);
    T.push([d.tan[i * 4], d.tan[i * 4 + 2], -d.tan[i * 4 + 1], d.tan[i * 4 + 3]]); U.push([d.uv[i * 2], 1 - d.uv[i * 2 + 1]]); }
  const mn = [0, 1, 2].map(a => Math.min(...P.map(p => p[a]))), mx = [0, 1, 2].map(a => Math.max(...P.map(p => p[a]))), ctr = mn.map((a, k) => (a + mx[k]) / 2), half = Math.max(...mn.map((a, k) => (mx[k] - a) / 2)) * 1.0001;
  const cl = (x, a) => Math.max(-a, Math.min(a, Math.round(x * a))), QP = P.map(p => p.map((x, a) => cl((x - ctr[a]) / half, 32767)));
  const parts = [], views = [], accs = []; let off = 0;
  const view = (u8, target, stride) => { const pad = (4 - off % 4) % 4; if (pad) { parts.push(new Uint8Array(pad)); off += pad; } const v = { buffer: 0, byteOffset: off, byteLength: u8.byteLength, target }; if (stride) v.byteStride = stride; parts.push(u8); off += u8.byteLength; views.push(v); return views.length - 1; };
  const acc = (vw, componentType, type, count, normalized, min, max) => { const a = { bufferView: vw, componentType, type, count }; if (normalized) a.normalized = true; if (min) { a.min = min; a.max = max; } accs.push(a); return accs.length - 1; };
  const pack = (Ctor, per, rows) => { const a = new Ctor(n * per); rows.forEach((r, i) => r.forEach((x, k) => { a[i * per + k] = x; })); return new Uint8Array(a.buffer); };
  const W = []; for (let i = 0; i < n; i++) { const q = [0, 1, 2, 3].map(k => Math.round(d.sw[i * 4 + k] * 255)); q[0] += 255 - q.reduce((s, x) => s + x, 0); W.push(q); }
  const attributes = {
    POSITION: acc(view(pack(Int16Array, 4, QP), 34962, 8), 5122, 'VEC3', n, true, [0, 1, 2].map(a => Math.min(...QP.map(q => q[a]))), [0, 1, 2].map(a => Math.max(...QP.map(q => q[a])))),
    NORMAL: acc(view(pack(Int8Array, 4, N.map(v => v.map(x => cl(x, 127)))), 34962, 4), 5120, 'VEC3', n, true),
    TANGENT: acc(view(pack(Int8Array, 4, T.map(t => [cl(t[0], 127), cl(t[1], 127), cl(t[2], 127), t[3] < 0 ? -127 : 127])), 34962), 5120, 'VEC4', n, true),
    TEXCOORD_0: acc(view(pack(Uint16Array, 2, U.map(u => u.map(x => Math.round(Math.min(Math.max(x, 0), 1) * 65535)))), 34962), 5123, 'VEC2', n, true),
    JOINTS_0: acc(view(pack(Uint8Array, 4, Array.from({ length: n }, (_, i) => [0, 1, 2, 3].map(k => d.si[i * 4 + k]))), 34962), 5121, 'VEC4', n),
    WEIGHTS_0: acc(view(pack(Uint8Array, 4, W), 34962), 5121, 'VEC4', n, true) };
  const indices = acc(view(new Uint8Array(new Uint16Array(d.idx).buffer), 34963), 5123, 'SCALAR', d.idx.length);
  const pad = (4 - off % 4) % 4; if (pad) { parts.push(new Uint8Array(pad)); off += pad; }
  const doc = { asset: { version: '2.0', generator: '__clothTestGLB' }, extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'], scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'tee', mesh: 0, translation: ctr, scale: [half, half, half] }], meshes: [{ name: 'tee', primitives: [{ attributes, indices, mode: 4, extras: { bones: d.bones } }] }],
    accessors: accs, bufferViews: views, buffers: [{ byteLength: off }] };
  let js = new TextEncoder().encode(JSON.stringify(doc)); const jl = Math.ceil(js.length / 4) * 4, jp = new Uint8Array(jl).fill(32); jp.set(js); js = jp;
  const glb = new Uint8Array(12 + 8 + jl + 8 + off), dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true); dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); glb.set(js, 20);
  dv.setUint32(20 + jl, off, true); dv.setUint32(24 + jl, 0x004E4942, true); let o = 28 + jl; for (const p of parts) { glb.set(p, o); o += p.byteLength; }
  const nmap = await new THREE.TextureLoader().loadAsync('assets/tee_hand_n.png'); nmap.flipY = false; nmap.anisotropy = 4;
  const t0 = performance.now(), r = await __cloth.clothParse('tee', glb.buffer, nmap, null);
  // the round trip: positions back in the geo frame against the JSON's (cm)
  let e = 0; for (let i = 0; i < n * 3; i++) e = Math.max(e, Math.abs(r.pos[i] - d.pos[i]));
  return { bytes: glb.length, verts: r.verts, tris: r.tris, ms: Math.round(performance.now() - t0), maxPosErrCm: +e.toFixed(4), bones: d.bones.length };
};
