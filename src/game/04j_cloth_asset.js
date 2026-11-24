/* ───────── cloth assets: garments made in Blender, as GLBs (issue 57; registry: issue 86) ─────────
   tools/assets/cloth/garment.py (Blender) writes per garment assets/cloth/<id>.glb: one mesh in the bind A-pose (metres, Y-up),
   KHR_mesh_quantization (int16 positions + the node's dequantisation transform, int8 normals / MikkTSpace tangents from Blender, uint16 uv
   with glTF's v down), JOINTS_0 = index into primitive.extras.bones (CC_Base_* names) → mapped by name onto the fighter's own skeleton; no
   textures inside: <id>_n.webp (tangent-space normal map baked from the high poly), <id>_c.webp (colour, only for a multi-colour garment)
   and <id>_lo.glb (≤ 3000 triangles, same uv) for GFX low sit beside it.
   The registry: assets/cloth/items.json (written by garment.py), spliced into CLOTH_REG by src/assemble.py at build time — so every item
   exists from the first line of the game (saves, the shop, the creator), only the files are fetched lazily: when a fighter puts the
   thing on (clothGeo / clothMeshGeo) or the shop opens (clothShop).
   · cat top: a cut TOP_CUTS[item] = { ...the procedural `base` cut, cloth: id } → handGeo / topMesh (04f_tops.js) like the procedural
     tops (the hem on the topTick spring, the skin and the trunks hidden down to its hem);
   · any other cat: model { cloth: id } → its own skinned mesh in the slot 'c_<cat>' (clothMesh, called by wearDress); a bottom hides the
     boxing trunks. Rigid things (a cap) are skinned to one bone by garment.py.
   If the files do not load: a top falls back to its procedural `base` cut (the tee first to the older JSON export, handLoad), anything
   else is simply not drawn. */
const CLOTH_REG = /*CLOTH_ITEMS*/{ v: 1, items: [] };
const CLOTH = { st: {} };   // CLOTH[id] = the parsed mesh; st[id]: { s: 'load' | 'ok' | 'fail', lo, ms, bytes, verts, tris }
const CLOTH_FILES = {}, CLOTH_JSON = { tee: 1 };   // id → its files (paths without the extension); the ids with the older JSON export behind them
for (const e of CLOTH_REG.items) {
  const id = e.item || e.id, f = e.files || {}, strip = p => p && p.replace(/\.(glb|webp)$/, '');
  CLOTH_FILES[e.id] = { glb: strip(f.glb) || 'assets/cloth/' + e.id, lo: strip(f.lo), n: f.n, c: f.c };
  let model;
  if (e.cat === 'top') { const base = TOP_CUTS[e.base] && !TOP_CUTS[e.base].cloth ? e.base : 'tee'; TOP_CUTS[id] = { ...TOP_CUTS[base], hand: base, cloth: e.id }; model = { cut: id }; }
  else model = { cloth: e.id };
  ITEMS[id] = { cat: e.cat, label: e.name || id, model, colors: e.colors && e.colors.length ? e.colors : ['white'], price: e.price ?? 100, tags: e.tags || ['street'], id, cloth: e.id };
  if (e.nat) ITEMS[id].nat = wNat(e.nat);
}
const clothOf = it => it && it.model && (it.model.cloth || (it.model.cut && TOP_CUTS[it.model.cut] && TOP_CUTS[it.model.cut].cloth)) || '';

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
// the GLB bytes + its maps → CLOTH[id]; dressed fighters are re-dressed
async function clothParse(id, buf, nmap, cmap) {
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  const d = clothFromGLTF(gltf); d.n = nmap || null; d.c = cmap || null; CLOTH[id] = d;
  for (const k in GEAR) if (k.startsWith('tgc_') || k.startsWith('cg_')) { if (GEAR[k].dispose) GEAR[k].dispose(); delete GEAR[k]; }
  clothRedress(id);
  return d;
}
/* issue 81: no baked AO — the contact shading is the screen-space AO pass's job; the folds live in the normal map.
   GFX low loads the light mesh <id>_lo.glb (same uv, so the same <id>_n.webp fits); a missing light file falls back to the full GLB.
   A level change across 'low' reloads what was loaded (GFX.onChange). */
function clothLoad(id, lo = GFX.level === 'low') {
  const f = CLOTH_FILES[id]; if (!f) return Promise.resolve();
  const t0 = performance.now(), st = CLOTH.st[id] = { s: 'load', lo }, tl = new THREE.TextureLoader();
  const tex = (file, srgb) => file ? tl.loadAsync(file).then(t => { t.flipY = false; t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }, () => null) : Promise.resolve(null);   // glTF uv: v runs down
  const glb = g => fetch(g + '.glb').then(r => { if (!r.ok) throw new Error(g + '.glb ' + r.status); return r.arrayBuffer().then(b => [b, g]); });
  const mesh = lo && f.lo ? glb(f.lo).catch(e => { console.info(`cloth ${id}: no light mesh (${e.message || e}), the full one`); return glb(f.glb); }) : glb(f.glb);
  return Promise.all([mesh, tex(f.n), tex(f.c, true)])   // (a garment without a high poly has no normal map)
    .then(([[buf, file], n, c]) => {
      if (CLOTH.st[id] !== st) { n && n.dispose(); c && c.dispose(); return; }   // a newer load (the level changed meanwhile) wins
      return clothParse(id, buf, n, c).then(d => { Object.assign(st, { s: 'ok', file, ms: Math.round(performance.now() - t0), bytes: buf.byteLength, verts: d.verts, tris: d.tris }); console.info(`cloth ${id}: ${file}.glb, ${d.tris} tris, ${(buf.byteLength / 1024).toFixed(0)} KB, ${st.ms} ms`); });
    })
    .catch(e => { if (CLOTH.st[id] !== st) return; st.s = 'fail'; st.err = String(e); console.info('cloth ' + id + ': no GLB, the fallback', e); (CLOTH_JSON[id] ? handLoad() : Promise.resolve()).then(() => clothRedress(id)); })
    .then(() => { try { if (UI.scr === 'shop') shopRender(); } catch (e) {} });   // the shop's pictures are keyed by the load state (thCloth)
}
const clothWant = id => { if (id && !CLOTH.st[id]) clothLoad(id); return CLOTH[id]; };   // lazy: the first fighter who puts it on starts the fetch
function clothShop() { for (const id in CLOTH_FILES) clothWant(id); }   // the shop shows them all: fetch them all (called by shopEnter)
GFX.onChange.push(() => { for (const id in CLOTH_FILES) { const s = CLOTH.st[id]; if (s && s.s !== 'fail' && s.lo !== (GFX.level === 'low')) clothLoad(id); } });

function clothGeo(F, cut) {
  const id = TOP_CUTS[cut].cloth, d = clothWant(id), key = 'tgc_' + cut;
  if (!d) return CLOTH_JSON[id] ? handGeo(F, cut) : topGeo(F, TOP_CUTS[cut].hand);   // not (yet) loaded: the JSON export / the procedural base cut
  if (GEAR[key]) return GEAR[key];
  const geo = handGeo(F, cut, d, key);
  geo.userData = { ...geo.userData, cloth: id };
  return geo;
}
// plain dyed cotton (the folds are in the baked normal map beside the GLB); a baked colour map is tinted by the palette colour
function clothTex(v, id) {
  const d = CLOTH[id];
  if (d.c && d.c.image) {
    const k = 'tt_' + v.key, map = GEAR[k] || (GEAR[k] = (() => {
      const im = d.c.image, c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d');
      g.drawImage(im, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = v.c; g.fillRect(0, 0, c.width, c.height);
      const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })());
    return { map, nmap: d.n };
  }
  return { map: handTex(v, id).map, nmap: d.n };
}
// a garment of any other category: its own skinned mesh on the body's skeleton (wearDress → slot 'c_<cat>'); null until the file is here
function clothMeshGeo(F, id) {
  const d = clothWant(id), key = 'cg_' + id; if (!d) return null; if (GEAR[key]) return GEAR[key];
  const names = GEAR.names, bi = d.bones.map(nm => { const b = names.indexOf(nm); if (b < 0) throw new Error('cloth: no bone ' + nm); return b; });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3)); geo.setIndex(d.idx);
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(d.nrm, 3)); geo.setAttribute('tangent', new THREE.Float32BufferAttribute(d.tan, 4)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(d.si, i => bi[i]), 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(d.sw, 4));
  return GEAR[key] = geo;
}
function clothMesh(F, v) {
  const geo = clothMeshGeo(F, v.cloth); if (!geo) return null;
  const { map, nmap } = clothTex(v, v.cloth), mat = new THREE.MeshPhysicalMaterial({ map, normalMap: nmap, roughness: 0.9, sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(v.c).multiplyScalar(1.3), side: THREE.DoubleSide, envMapIntensity: 0.5 });
  const m = new THREE.SkinnedMesh(geo, mat); m.bind(F.body.skeleton, F.body.bindMatrix); m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
  F.body.parent.add(m); m.position.copy(F.body.position); m.quaternion.copy(F.body.quaternion); m.scale.copy(F.body.scale);
  return m;
}
const CLOTH_SLOTS = ['head', 'bottom', 'belt', 'shoes', 'hands'];
// called by wearDress: the registry garments of the categories without a cut of their own; returns the bottom's variant when one is worn
function clothDress(F, L) {
  const S = F.gear.shells; let bottom = null;
  for (const cat of CLOTH_SLOTS) {
    const v = itemVar(cat, wearGet(L, cat)), on = !!(v.cloth && v.key);
    wearSlot(F, 'c_' + cat, on && clothWant(v.cloth) ? v.key : null, () => clothMesh(F, v), ['tt_' + v.key]);
    if (S['c_' + cat] && !S['c_' + cat].m) S['c_' + cat] = null;   // (a make() that had nothing to build)
    if (on && cat === 'bottom' && S.c_bottom) bottom = v;
  }
  return bottom;
}
// an asset that arrives after the fighters were dressed: drop the slot that wears it so the next dress builds it from the new mesh
function clothRedress(id) {
  let FS = []; try { FS = [P1, P2]; } catch (e) { return; }
  for (const F of FS) {
    if (!F || !F.gear || !F.gear.look) continue; let hit = false;
    for (const cat of ['top', ...CLOTH_SLOTS]) {
      const it = ITEMS[wearGet(F.gear.look, cat).id]; if (!it || it.cat !== cat || !clothOf(it) || (id && clothOf(it) !== id)) continue;
      const s = F.gear.shells[cat === 'top' ? 'top' : 'c_' + cat]; if (s) s.key = '~'; hit = true;
    }
    if (hit) F.dress(F.gear.look);
  }
}
window.__cloth = { CLOTH, CLOTH_REG, CLOTH_FILES, clothParse, clothLoad, clothRedress, clothShop };
