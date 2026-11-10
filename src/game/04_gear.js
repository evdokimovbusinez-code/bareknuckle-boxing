/* ───────── clothes & gear ─────────
   Clothes are shells grown out of the body mesh itself: the same skinned triangles (same skeleton, same weights), pushed out along
   the normal by the fabric's thickness and clipped to a band of the body (ankle → waist for trousers, …). The skin under them is
   discarded, so nothing pokes through. Gear for sparring (gloves, headgear) and the gum shield ride on bones. */
const BOTTOMS = [{ id: 'shorts', label: 'шорты' }, { id: 'pants', label: 'штаны', tex: 'sweat', c: '#202228' }, { id: 'jeans', label: 'джинсы', tex: 'denim', c: '#3d5a80' }];
const TOPS = [{ id: 'none', label: 'без' }, { id: 'teeW', label: 'футболка', tex: 'cotton', c: '#e9e6df', sleeve: 0.55 }, { id: 'teeB', label: 'чёрная', tex: 'cotton', c: '#1b1c20', sleeve: 0.55 }, { id: 'tank', label: 'майка', tex: 'cotton', c: '#b3202c', sleeve: 0 }];
const SHOES = [{ id: 'none', label: 'босиком' }, { id: 'sneak', label: 'кроссовки', c: '#e8e8ea', sole: '#d9d4c8', top: 7 }, { id: 'boots', label: 'боксёрки', c: '#16171b', sole: '#f2f0ea', top: 19 }];
const GUARDS = [{ id: 'clear', c: '#d8e4ea', label: 'прозрачная' }, { id: 'black', c: '#141416', label: 'чёрная' }, { id: 'red', c: '#b3202c', label: 'красная' }, { id: 'blue', c: '#2f55b5', label: 'синяя' }, { id: 'gold', c: '#d8b25a', label: 'золотая' }];
const GEAR = { ready: false };
function fabricTex(kind) {
  return canvasTex(512, 512, (g, w, h) => {
    const base = kind === 'denim' ? [62, 90, 128] : kind === 'sweat' ? [128, 128, 128] : [235, 235, 235];
    g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
    if (kind === 'denim') { for (let y = -h; y < h; y += 3) { g.strokeStyle = `rgba(${rr() < 0.5 ? '255,255,255' : '0,0,0'},${0.06 + rr() * 0.08})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.stroke(); }
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${0.03 + rr() * 0.05})`; g.beginPath(); g.ellipse(rr() * w, rr() * h, 20 + rr() * 80, 6 + rr() * 20, rr() * 3, 0, 7); g.fill(); } }
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,255'},${rr() * (kind === 'sweat' ? 0.12 : 0.05)})`; g.fillRect(rr() * w, rr() * h, 1.5, 1.5); }
  });
}
// height (cm above the soles), region (1 legs/hips/feet, 2 trunk/neck, 3 upper arm, 4 forearm/hand, 5 head) and fraction along the upper arm
function gearSetup(F) {
  if (GEAR.ready) return; GEAR.ready = true;
  const body = F.body, geo = body.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, n = pos.count, sk = body.skeleton;
  // everything from the vertices themselves (the joint matrices of this export live in a different unit/frame)
  const names = sk.bones.map(b => b.name), dom = new Int32Array(n), p = new V3(), mean = {}, cnt = {};
  for (let i = 0; i < n; i++) { let bw = -1, bi = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } dom[i] = bi;
    const nm = names[bi]; p.fromBufferAttribute(pos, i); (mean[nm] || (mean[nm] = new V3())).add(p); cnt[nm] = (cnt[nm] || 0) + 1; }
  for (const k in mean) mean[k].multiplyScalar(1 / cnt[k]);
  const M = k => mean['CC_Base_' + k] || new V3();
  const footC = M('L_Foot').clone().add(M('R_Foot')).multiplyScalar(0.5), up = M('Head').clone().sub(footC).normalize();
  let sole = 1e9; for (let i = 0; i < n; i++) { p.fromBufferAttribute(pos, i); sole = Math.min(sole, p.dot(up)); }
  const H = q => q.dot(up) - sole;
  GEAR.top = H(M('Waist')) - 1.5; GEAR.neck = H(M('NeckTwist01')) - 3.5;
  const sh = { L: M('L_UpperarmTwist01'), R: M('R_UpperarmTwist01') }, el = { L: M('L_ElbowShareBone'), R: M('R_ElbowShareBone') };
  const gh = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const nm = names[dom[i]]; p.fromBufferAttribute(pos, i); const h = H(p);
    let R = 0, a = 0;
    if (/Thigh|Calf|Knee|Foot|Toe|Hip|Pelvis/.test(nm)) R = 1;
    else if (/Upperarm|Shoulder|Clavicle/.test(nm) && !/Clavicle/.test(nm)) { R = 3; const S = /_L_/.test(nm) ? 'L' : 'R', ab = _v2.copy(el[S]).sub(sh[S]); a = clamp(0.25 + _v3.copy(p).sub(sh[S]).dot(ab) / ab.lengthSq() * 0.5, 0, 1); }
    else if (/Forearm|Hand|Finger|Thumb|Index|Mid|Ring|Pinky|Elbow/.test(nm)) R = 4;
    else if (/Head|Jaw|Eye|Teeth|Tongue|Facial|NeckTwist02/.test(nm)) R = 5;
    else R = 2;
    gh[i * 3] = h; gh[i * 3 + 1] = R; gh[i * 3 + 2] = a;
  }
  geo.setAttribute('aGH', new THREE.BufferAttribute(gh, 3)); GEAR.gh = gh;
  const sm = T.matNames.map(nm => !/Nail|Eye|Teeth|Tongue|Cornea|Tearline|Occlusion|Lash/i.test(nm)); GEAR.tris = [];   // every skin-ish group (the trunks area and the neck front are in other groups)
  for (const gr of geo.groups) if (sm[gr.materialIndex]) for (let t = gr.start; t < gr.start + gr.count; t += 3) GEAR.tris.push(geo.index.getX(t), geo.index.getX(t + 1), geo.index.getX(t + 2));
}
// a piece of clothing: which vertices it covers (same rule in JS and in the shaders)
const GEAR_RULE = {
  pants: (h, R) => (R === 1 || R === 2) && h > 5.5 && h < GEAR.top,
  shoes: (h, R, a, top) => R === 1 && h < top,
  shirt: (h, R, a, top, sl) => (R === 2 && h > GEAR.top - 8 && h < GEAR.neck) || (R === 3 && a < sl),
};
function shellMesh(F, kind, opt) {
  const gh = GEAR.gh, rule = GEAR_RULE[kind], idx = [], tr = GEAR.tris;
  const ok = v => rule(gh[v * 3], gh[v * 3 + 1], gh[v * 3 + 2], opt.top || 0, opt.sleeve || 0);
  for (let t = 0; t < tr.length; t += 3) if (ok(tr[t]) || ok(tr[t + 1]) || ok(tr[t + 2])) idx.push(tr[t], tr[t + 1], tr[t + 2]);
  const src = F.body.geometry, geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'aGH']) geo.setAttribute(k, src.attributes[k]);
  geo.setIndex(idx);
  const mat = new THREE.MeshPhysicalMaterial({ color: opt.c, map: opt.tex ? (GEAR['t_' + opt.tex] || (GEAR['t_' + opt.tex] = fabricTex(opt.tex))) : null, roughness: kind === 'shoes' ? 0.45 : 0.9, sheen: kind === 'shoes' ? 0 : 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(opt.c), clearcoat: kind === 'shoes' ? 0.4 : 0 });
  if (mat.map) { mat.map = mat.map.clone(); mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(6, 6); mat.map.needsUpdate = true; }
  const U = { uThick: { value: opt.thick }, uTop: { value: opt.top || 0 }, uSl: { value: opt.sleeve || 0 }, uGTop: { value: GEAR.top }, uGNeck: { value: GEAR.neck }, uSole: { value: new THREE.Color(opt.sole || opt.c) } };
  const cond = { pants: '(R < 2.5 && h > 5.5 && h < uGTop)', shoes: '(R < 1.5 && h < uTop)', shirt: '((R > 1.5 && R < 2.5 && h > uGTop - 8.0 && h < uGNeck) || (R > 2.5 && R < 3.5 && a < uSl))' }[kind];
  mat.onBeforeCompile = s => {
    Object.assign(s.uniforms, U);
    s.vertexShader = 'attribute vec3 aGH; varying vec3 vGH; uniform float uThick;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vGH = aGH; float bag = ${kind === 'pants' ? '0.7 + 0.9 * smoothstep( 60.0, 8.0, aGH.x ) + 0.4 * smoothstep( 80.0, 100.0, aGH.x )' : kind === 'shirt' ? '1.0 + 0.6 * smoothstep( 0.2, 0.5, aGH.z )' : '1.0 + smoothstep( 4.0, 0.0, aGH.x ) * 0.4'};
      transformed += objectNormal * uThick * bag;`);
    s.fragmentShader = 'varying vec3 vGH; uniform float uTop; uniform float uSl; uniform float uGTop; uniform float uGNeck; uniform vec3 uSole;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      { float h = vGH.x, R = vGH.y, a = vGH.z; if ( !${cond} ) discard; }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + (kind === 'shoes' ? ' diffuseColor.rgb = mix( diffuseColor.rgb, uSole, smoothstep( 2.4, 1.8, vGH.x ) ); diffuseColor.rgb *= 1.0 - 0.25 * smoothstep( uTop - 1.5, uTop - 0.5, vGH.x );' : ' diffuseColor.rgb *= 1.0 - 0.18 * smoothstep( 1.0, 0.0, abs( vGH.x - uGTop + 1.5 ) );'));
  };
  mat.customProgramCacheKey = () => 'shell-' + kind;
  const m = new THREE.SkinnedMesh(geo, mat); m.bind(F.body.skeleton, F.body.bindMatrix); m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
  F.body.parent.add(m); m.position.copy(F.body.position); m.quaternion.copy(F.body.quaternion); m.scale.copy(F.body.scale);
  return m;
}
// gloves (12 oz sparring): padded mitt over the fist, a thumb, a cuff — in the hand's rest frame, carried by the hand bone
function gloveMesh(F, S, col) {
  const B = F.bones, h = B[`CC_Base_${S}_Hand`], hp = new V3().setFromMatrixPosition(h.matrixWorld), mp = new V3().setFromMatrixPosition(B[`CC_Base_${S}_Mid1`].matrixWorld);
  const th = B[`CC_Base_${S}_Thumb1`] ? new V3().setFromMatrixPosition(B[`CC_Base_${S}_Thumb1`].matrixWorld) : null;
  const ax = mp.clone().sub(hp).normalize(), q = new Quat().setFromUnitVectors(new V3(0, 1, 0), ax);
  const mat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.3 });
  const g = new THREE.Group();
  const mitt = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), mat); mitt.scale.set(0.062, 0.115, 0.06); mitt.position.copy(hp).addScaledVector(ax, 0.085); mitt.quaternion.copy(q); g.add(mitt);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.044, 0.1, 20), new THREE.MeshPhysicalMaterial({ color: '#f2f0ea', roughness: 0.6 })); cuff.position.copy(hp).addScaledVector(ax, -0.035); cuff.quaternion.copy(q); g.add(cuff);
  if (th) { const t = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat); t.scale.set(0.026, 0.05, 0.026); t.position.copy(th).lerp(mp, 0.35).addScaledVector(th.clone().sub(hp).normalize(), 0.015); t.quaternion.copy(q); g.add(t); }
  const restInv = h.matrixWorld.clone().invert(); g.matrixAutoUpdate = false; for (const c of g.children) { c.castShadow = true; c.updateMatrix(); }
  scene.add(g); return { g, h, restInv };
}
// headgear: an open-face leather shell over the skull, cheek pads, in the head-ellipsoid frame
function headgearMesh(col) {
  const R = HEAD.R, geo = new THREE.SphereGeometry(1, 32, 24), p = geo.attributes.position, keep = [], v = new V3();
  const idx = geo.index; for (let t = 0; t < idx.count; t += 3) { let face = 0; for (let k = 0; k < 3; k++) { v.fromBufferAttribute(p, idx.getX(t + k)); if (v.z > 0.1 && Math.abs(v.x) < 0.7 && v.y < 0.38 && v.y > -0.95) face++; if (v.y < -0.62 && v.z > -0.3) face += 3; if (v.y < -0.85) face += 3; } if (!face) keep.push(idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)); }
  geo.setIndex(keep); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); p.setXYZ(i, v.x * (R.x + 0.014), v.y * (R.y + 0.012) + 0.006, v.z * (R.z + 0.012)); } geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.42, clearcoat: 0.5, side: THREE.DoubleSide }));
  m.matrixAutoUpdate = false; m.castShadow = true; m.frustumCulled = false; scene.add(m); return m;
}
function guardMesh() {   // gum shield: an arch over the upper teeth, in the head-ellipsoid frame (mouth ≈ 6.5 cm below and 8 cm in front of its centre)
  const geo = new THREE.TorusGeometry(0.024, 0.0062, 8, 20, Math.PI * 1.05); geo.rotateX(Math.PI / 2); geo.rotateY(-Math.PI * 0.025); geo.scale(1.05, 1.5, 1.3); geo.translate(0, -0.063, 0.057);   // arch over the upper incisors (teeth bone ≈ 4 cm below and 5 cm in front of the head centre)
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: '#d8e4ea', roughness: 0.15, transmission: 0, clearcoat: 1 }));
  m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m); return m;
}

