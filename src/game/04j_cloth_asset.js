/* ───────── cloth assets: the hand-made tee as a GLB (issue 57) ─────────
   tools/assets/cloth/tee_game.py (Blender) writes assets/cloth/tee.glb: one mesh in the bind A-pose (metres, Y-up), KHR_mesh_quantization
   (int16 positions + the node's dequantisation transform, int8 normals / MikkTSpace tangents from Blender, uint16 uv with glTF's v down),
   JOINTS_0 = index into primitive.extras.bones (CC_Base_* names) → mapped by name onto the fighter's own skeleton; no textures inside:
   tee_n.webp (tangent-space normal map, baked from the high poly) and tee_ao.webp (its ambient occlusion) sit beside it.
   The mesh is put into the body geometry frame (cm, z up: geo = 100 · (x, −z, y)) and goes through handGeo / topMesh (04f_tops.js) like
   the procedural tops: a THREE.SkinnedMesh bound to F.body's skeleton and bind matrix, the hem on the topTick spring.
   If the GLB does not load, the cut falls back silently: the older JSON export (handLoad), then the procedural `tee`. */
const CLOTH = { tee: null, st: {} };   // st[base]: 'load' | 'ok' | 'fail', plus the numbers for the report (ms, bytes, verts, tris)
const CLOTH_FILES = { tee: 'assets/cloth/tee' };
TOP_CUTS.teeCloth = { ...TOP_CUTS.tee, hand: 'tee', cloth: 'tee' };

// a parsed glTF → the handGeo record (body geometry frame)
function clothFromGLTF(gltf) {
  let mesh = null; gltf.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) throw new Error('cloth: no mesh');
  gltf.scene.updateMatrixWorld(true);
  const g = mesh.geometry, A = g.attributes, n = A.position.count, M = mesh.matrixWorld, bones = (g.userData && g.userData.bones) || mesh.userData.bones;
  if (!bones || !A.skinIndex || !A.skinWeight || !A.normal || !A.tangent || !A.uv) throw new Error('cloth: the GLB lacks bones / skin / normals / tangents / uv');
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), tan = new Float32Array(n * 4), uv = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), v = new V3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(A.position, i).applyMatrix4(M); pos[i * 3] = 100 * v.x; pos[i * 3 + 1] = -100 * v.z; pos[i * 3 + 2] = 100 * v.y;
    v.fromBufferAttribute(A.normal, i).normalize(); nrm[i * 3] = v.x; nrm[i * 3 + 1] = -v.z; nrm[i * 3 + 2] = v.y;
    v.set(A.tangent.getX(i), A.tangent.getY(i), A.tangent.getZ(i)).normalize(); tan[i * 4] = v.x; tan[i * 4 + 1] = -v.z; tan[i * 4 + 2] = v.y; tan[i * 4 + 3] = A.tangent.getW(i) < 0 ? -1 : 1;
    uv[i * 2] = A.uv.getX(i); uv[i * 2 + 1] = A.uv.getY(i);
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = A.skinIndex.getComponent(i, k); sw[i * 4 + k] = A.skinWeight.getComponent(i, k); }
  }
  for (let i = 0; i < n; i++) { const s = sw[i * 4] + sw[i * 4 + 1] + sw[i * 4 + 2] + sw[i * 4 + 3] || 1; for (let k = 0; k < 4; k++) sw[i * 4 + k] /= s; }   // (uint8 weights: exact sums)
  const ix = g.index.array, idx = new THREE.BufferAttribute(n > 65535 ? new Uint32Array(ix) : new Uint16Array(ix), 1);
  return { pos, nrm, tan, uv, idx, bones, si, sw, tris: ix.length / 3, verts: n };
}
// the GLB bytes + its two maps → CLOTH[base]; dressed fighters are re-dressed
async function clothParse(base, buf, nmap, ao) {
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  const d = clothFromGLTF(gltf); d.n = nmap; d.ao = ao; CLOTH[base] = d;
  for (const k in GEAR) if (k.startsWith('tgc_')) { GEAR[k].dispose(); delete GEAR[k]; }
  clothRedress();
  return d;
}
const CLOTH_AO = false;
function clothLoad(base) {
  const t0 = performance.now(), f = CLOTH_FILES[base], st = CLOTH.st[base] = { s: 'load' }, tl = new THREE.TextureLoader();
  const tex = file => tl.loadAsync(file).then(t => { t.flipY = false; t.anisotropy = 4; return t; });   // glTF uv: v runs down
  return Promise.all([fetch(f + '.glb').then(r => { if (!r.ok) throw new Error(f + '.glb ' + r.status); return r.arrayBuffer(); }), tex(f + '_n.webp'), CLOTH_AO ? tex(f + '_ao.webp') : null])   // the first AO bake came out blotchy (camouflage patches) — off until re-baked
    .then(([buf, n, ao]) => clothParse(base, buf, n, ao).then(d => { Object.assign(st, { s: 'ok', ms: Math.round(performance.now() - t0), bytes: buf.byteLength, verts: d.verts, tris: d.tris }); console.info(`cloth ${base}: ${d.tris} tris, ${(buf.byteLength / 1024).toFixed(0)} KB, ${st.ms} ms`); }))
    .catch(e => { st.s = 'fail'; st.err = String(e); console.info('cloth ' + base + ': no GLB, the older export / procedural cut', e); handLoad().then(clothRedress); });
}
clothLoad('tee');

function clothGeo(F, cut) {
  const base = TOP_CUTS[cut].cloth, d = CLOTH[base], key = 'tgc_' + cut;
  if (!d) return handGeo(F, cut);   // not (yet) loaded: the JSON export, else the procedural cut
  if (GEAR[key]) return GEAR[key];
  const geo = handGeo(F, cut, d, key);
  geo.userData = { ...geo.userData, cloth: base };
  return geo;
}
// plain dyed cotton (the folds are in the baked maps) + the GLB's normal and AO maps
function clothTex(v, base) {
  const d = CLOTH[base], t = handTex(v, base);
  return { map: t.map, nmap: d.n, ao: d.ao };
}
// an asset that arrives after the fighters were dressed: drop their cloth top so the next dress builds it from the new mesh
function clothRedress() {
  let FS = []; try { FS = [P1, P2]; } catch (e) { return; }
  for (const F of FS) { const s = F && F.gear && F.gear.shells.top; if (s && s.key && TOP_CUTS[(ITEMS[s.key.split('_')[0]] || {}).model?.cut]?.cloth && F.gear.look) { s.key = '~'; F.dress(F.gear.look); } }
}

Object.assign(ITEMS, {
  teeCloth: { cat: 'top', label: 'футболка (ткань)', model: { cut: 'teeCloth' }, colors: ['white', 'black', 'grey'], nat: wNat({ white: '#e9e6df', grey: '#9a9ca2' }), price: 150, tags: ['street', 'basic'] },
});
ITEMS.teeCloth.id = 'teeCloth';
window.__cloth = { CLOTH, clothParse, clothLoad, clothRedress };
