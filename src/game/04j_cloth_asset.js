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
async function clothParse(base, buf, nmap) {
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  const d = clothFromGLTF(gltf); d.n = nmap; CLOTH[base] = d;
  for (const k in GEAR) if (k.startsWith('tgc_')) { GEAR[k].dispose(); delete GEAR[k]; }
  clothRedress();
  return d;
}
/* issue 81: no baked AO any more — the cloth-alone bake of a two-layer shirt came out in camouflage patches, and the contact shading is
   the screen-space AO pass's job (GFX ao) anyway; the folds live in the normal map.
   GFX low loads the light mesh <base>_lo.glb (≤ 3000 triangles: the full mesh thinned by half-edge collapses, every kept vertex with
   its own uv, so the same <base>_n.webp fits — tools/assets/cloth/tee_lo.js); a missing light file falls back to the full GLB. A level change across 'low' reloads (GFX.onChange). */
const CLOTH_LO = '_lo';
function clothLoad(base, lo = GFX.level === 'low') {
  const t0 = performance.now(), f = CLOTH_FILES[base], st = CLOTH.st[base] = { s: 'load', lo }, tl = new THREE.TextureLoader();
  const tex = file => tl.loadAsync(file).then(t => { t.flipY = false; t.anisotropy = 4; return t; });   // glTF uv: v runs down
  // the light mesh keeps the full one's uv (tools/assets/cloth/tee_lo.js): one normal map for both
  const get = g => Promise.all([fetch(g + '.glb').then(r => { if (!r.ok) throw new Error(g + '.glb ' + r.status); return r.arrayBuffer(); }), tex(f + '_n.webp')]);
  return (lo ? get(f + CLOTH_LO).then(x => [...x, f + CLOTH_LO], e => { console.info(`cloth ${base}: no light mesh (${e.message || e}), the full one`); return get(f).then(x => [...x, f]); }) : get(f).then(x => [...x, f]))
    .then(([buf, n, file]) => {
      if (CLOTH.st[base] !== st) { n.dispose(); return; }   // a newer load (the level changed meanwhile) wins
      return clothParse(base, buf, n).then(d => { Object.assign(st, { s: 'ok', file, ms: Math.round(performance.now() - t0), bytes: buf.byteLength, verts: d.verts, tris: d.tris }); console.info(`cloth ${base}: ${file}.glb, ${d.tris} tris, ${(buf.byteLength / 1024).toFixed(0)} KB, ${st.ms} ms`); });
    })
    .catch(e => { if (CLOTH.st[base] !== st) return; st.s = 'fail'; st.err = String(e); console.info('cloth ' + base + ': no GLB, the older export / procedural cut', e); handLoad().then(clothRedress); });
}
clothLoad('tee');
GFX.onChange.push(() => { for (const b in CLOTH_FILES) { const s = CLOTH.st[b]; if (s && s.s !== 'fail' && s.lo !== (GFX.level === 'low')) clothLoad(b); } });

function clothGeo(F, cut) {
  const base = TOP_CUTS[cut].cloth, d = CLOTH[base], key = 'tgc_' + cut;
  if (!d) return handGeo(F, cut);   // not (yet) loaded: the JSON export, else the procedural cut
  if (GEAR[key]) return GEAR[key];
  const geo = handGeo(F, cut, d, key);
  geo.userData = { ...geo.userData, cloth: base };
  return geo;
}
// plain dyed cotton (the folds are in the baked normal map beside the GLB)
function clothTex(v, base) {
  const d = CLOTH[base], t = handTex(v, base);
  return { map: t.map, nmap: d.n };
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
