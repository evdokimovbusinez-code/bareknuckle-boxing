/* ───────── clothes & gear ─────────
   Clothes are shells grown out of the body mesh itself: the same skinned triangles (same skeleton, same weights), pushed out along
   the normal by the fabric's thickness and clipped to a band of the body (ankle → waist for trousers, …). The skin under them is
   discarded, so nothing pokes through. Gear for sparring (gloves, headgear) and the gum shield ride on bones. */
// bottoms with a `cut` are loose trousers / long shorts with their own geometry, shoes are lofted meshes (04d_street.js); tops are shells of the torso
// (the items themselves — tops, bottoms, shoes, hats, glasses, belts — are the registry ITEMS in 04e_wardrobe.js)
const GUARDS = [{ id: 'clear', c: '#d8e4ea', label: 'прозрачная' }, { id: 'black', c: '#141416', label: 'чёрная' }, { id: 'red', c: '#b3202c', label: 'красная' }, { id: 'blue', c: '#2f55b5', label: 'синяя' }, { id: 'gold', c: '#d8b25a', label: 'золотая' }];
const GLOVES = [{ id: 'red', c: '#b3202c', trim: '#efeae0', label: 'красные' }, { id: 'black', c: '#17181c', trim: '#a9a9b2', label: 'чёрные' }, { id: 'blue', c: '#1f3f9a', trim: '#efeae0', label: 'синие' }, { id: 'white', c: '#e6e2d8', trim: '#1b1c20', label: 'белые' }];
const HANDS = [{ id: 'wraps', label: 'бинты' }, { id: 'mma', label: 'MMA 4 oz' }, { id: 'knux', label: 'Кастет' }];
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
  // hands, for gloves: a frame per hand from the bind pose of its bones → per vertex: cm along the hand from the wrist, how much the skin
  // faces the back of the hand, finger segment (0 hand/forearm, 1 first phalanx, 2 the rest of a finger, 3 thumb), cm across the hand
  const bi = body.bindMatrix.clone().invert(), bpos = nm => new V3().applyMatrix4(new M4().copy(sk.boneInverses[names.indexOf('CC_Base_' + nm)]).invert()).applyMatrix4(bi);
  const HF = GEAR.HF = {}, gv = new Float32Array(n * 4), nr = geo.attributes.normal;
  for (const S of ['L', 'R']) { const Hp = bpos(S + '_Hand'), Y = bpos(S + '_Mid1').sub(Hp), u = Y.length() / 10.3; Y.normalize(); const X = bpos(S + '_Index1').sub(bpos(S + '_Pinky1')); X.addScaledVector(Y, -X.dot(Y)).normalize();
    HF[S] = { H: Hp, Y, X, Z: new V3().crossVectors(X, Y).multiplyScalar(S === 'R' ? 1 : -1), u }; }
  GEAR.bpos = bpos; GEAR.dom = dom; GEAR.names = names;
  for (let i = 0; i < n; i++) {
    const nm = names[dom[i]]; p.fromBufferAttribute(pos, i); const h = H(p);
    let R = 0, a = 0;
    if (/Thigh|Calf|Knee|Foot|Toe|Hip|Pelvis/.test(nm)) R = 1;
    else if (/Upperarm|Shoulder|Clavicle/.test(nm) && !/Clavicle/.test(nm)) { R = 3; const S = /_L_/.test(nm) ? 'L' : 'R', ab = _v2.copy(el[S]).sub(sh[S]); a = clamp(0.25 + _v3.copy(p).sub(sh[S]).dot(ab) / ab.lengthSq() * 0.5, 0, 1); }
    else if (/Forearm|Hand|Finger|Thumb|Index|Mid|Ring|Pinky|Elbow/.test(nm)) { R = 4;
      const f = HF[/_L_/.test(nm) ? 'L' : 'R'], q = _v2.copy(p).sub(f.H), ya = q.dot(f.Y) / f.u;
      const nb = -_v3.fromBufferAttribute(nr, i).dot(f.Z), seg = /Thumb/.test(nm) ? 3 : /(Index|Mid|Ring|Pinky)1/.test(nm) ? 1 : /(Index|Mid|Ring|Pinky)[23]/.test(nm) ? 2 : 0;
      // forearm: 1 (elbow) … 1.99 (wrist); hand: 2 where an MMA glove covers it (the back of the hand, the heel of the palm, the first phalanges, the base of the thumb) … 3 where it is bare
      a = /Forearm|Elbow/.test(nm) ? 1 + 0.99 * clamp(1 + ya / 24, 0, 1) : 3 - (seg === 1 || /Thumb1/.test(nm) ? 1 : seg ? 0 : Math.max(gsm(-0.45, -0.05, nb), 1 - gsm(2.0, 2.8, ya)));
      gv[i * 4] = ya; gv[i * 4 + 1] = nb; gv[i * 4 + 2] = seg; gv[i * 4 + 3] = q.dot(f.X) / f.u; }
    else if (/Head|Jaw|Eye|Teeth|Tongue|Facial|NeckTwist02/.test(nm)) R = 5;
    else R = 2;
    gh[i * 3] = h; gh[i * 3 + 1] = R; gh[i * 3 + 2] = a;
  }
  geo.setAttribute('aGH', new THREE.BufferAttribute(gh, 3)); GEAR.gh = gh;
  geo.setAttribute('aGlv', new THREE.BufferAttribute(gv, 4)); GEAR.gv = gv;
  const sm = T.matNames.map(nm => !/Nail|Eye|Teeth|Tongue|Cornea|Tearline|Occlusion|Lash/i.test(nm)); GEAR.tris = [];   // every skin-ish group (the trunks area and the neck front are in other groups)
  for (const gr of geo.groups) if (sm[gr.materialIndex]) for (let t = gr.start; t < gr.start + gr.count; t += 3) GEAR.tris.push(geo.index.getX(t), geo.index.getX(t + 1), geo.index.getX(t + 2));
}
// a piece of clothing: which vertices it covers (same rule in JS and in the shaders)
const GEAR_RULE = {
  pants: (h, R) => (R === 1 || R === 2) && h > 5.5 && h < GEAR.top,
  shoes: (h, R, a, top) => R === 1 && h < top,
  shirt: (h, R, a, top, sl, hem) => ((R === 1 || R === 2) && h > GEAR.top - hem && h < GEAR.neck) || ((R === 3 || R === 4) && a < sl),   // untucked: the hem hangs over the waistband; a hoodie's sleeve (sl > 1) runs down the forearm
};
function shellMesh(F, kind, opt) {
  const gh = GEAR.gh, rule = GEAR_RULE[kind], idx = [], tr = GEAR.tris;
  const ok = v => rule(gh[v * 3], gh[v * 3 + 1], gh[v * 3 + 2], opt.top || 0, opt.sleeve || 0, opt.hem || 9);
  for (let t = 0; t < tr.length; t += 3) if (ok(tr[t]) || ok(tr[t + 1]) || ok(tr[t + 2])) idx.push(tr[t], tr[t + 1], tr[t + 2]);
  const src = F.body.geometry, geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'aGH']) geo.setAttribute(k, src.attributes[k]);
  geo.setIndex(idx);
  const mat = new THREE.MeshPhysicalMaterial({ color: opt.c, map: opt.tex ? (GEAR['t_' + opt.tex] || (GEAR['t_' + opt.tex] = fabricTex(opt.tex))) : null, roughness: kind === 'shoes' ? 0.45 : 0.9, sheen: kind === 'shoes' ? 0 : 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(opt.c), clearcoat: kind === 'shoes' ? 0.4 : 0 });
  if (mat.map) { mat.map = mat.map.clone(); mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(6, 6); mat.map.needsUpdate = true; }
  const U = { uThick: { value: opt.thick }, uTop: { value: opt.top || 0 }, uSl: { value: opt.sleeve || 0 }, uGTop: { value: GEAR.top }, uGNeck: { value: GEAR.neck }, uSole: { value: new THREE.Color(opt.sole || opt.c) }, uHemD: { value: opt.hem || 9 }, uDecal: { value: wearBlank() }, uDecF: { value: new V4() }, uDecB: { value: new V4() } };   // uDecal: prints (front | back halves), uDecF / uDecB: centre x, height, 1/width (signed), 1/height — see topTint
  const cond = { pants: '(R < 2.5 && h > 5.5 && h < uGTop)', shoes: '(R < 1.5 && h < uTop)', shirt: '((R > 0.5 && R < 2.5 && h > uGTop - uHemD && h < uGNeck) || (R > 2.5 && R < 4.5 && a < uSl && h < uGNeck + 3.0))' }[kind];   // (the height test keeps the sleeve rule off the neck: R is interpolated 2 → 5 across the trunk/head seam and used to draw a dark ring there)
  mat.onBeforeCompile = s => {
    Object.assign(s.uniforms, U);
    s.vertexShader = 'attribute vec3 aGH; varying vec3 vGH; varying vec2 vBP; uniform float uThick;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vGH = aGH; vBP = vec2( position.x, -normal.y ); float bag = ${kind === 'pants' ? '0.7 + 0.9 * smoothstep( 60.0, 8.0, aGH.x ) + 0.4 * smoothstep( 80.0, 100.0, aGH.x )' : kind === 'shirt' ? '1.0 + 0.6 * smoothstep( 0.2, 0.5, aGH.z )' : '1.0 + smoothstep( 4.0, 0.0, aGH.x ) * 0.4'};
      transformed += objectNormal * uThick * bag;`);
    s.fragmentShader = 'varying vec3 vGH; varying vec2 vBP; uniform sampler2D uDecal; uniform vec4 uDecF; uniform vec4 uDecB; uniform float uHemD; uniform float uTop; uniform float uSl; uniform float uGTop; uniform float uGNeck; uniform vec3 uSole;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      { float h = vGH.x, R = vGH.y, a = vGH.z; if ( !${cond} ) discard; }`)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + (kind === 'shoes' ? ' diffuseColor.rgb = mix( diffuseColor.rgb, uSole, smoothstep( 2.4, 1.8, vGH.x ) ); diffuseColor.rgb *= 1.0 - 0.25 * smoothstep( uTop - 1.5, uTop - 0.5, vGH.x );' : ' diffuseColor.rgb *= 1.0 - 0.18 * smoothstep( 1.0, 0.0, abs( vGH.x - uGTop + 1.5 ) );'
        + (kind === 'shirt' ? ' if ( vGH.y > 1.5 && vGH.y < 2.5 ) { vec4 dq = vBP.y > 0.0 ? uDecF : uDecB; vec2 du = ( vec2( vBP.x, vGH.x ) - dq.xy ) * dq.zw + 0.5; if ( abs( vBP.y ) > 0.25 && dq.w > 0.0 && du.x > 0.0 && du.x < 1.0 && du.y > 0.0 && du.y < 1.0 ) { vec4 dc = texture2D( uDecal, vec2( du.x * 0.5 + ( vBP.y > 0.0 ? 0.0 : 0.5 ), du.y ) ); diffuseColor.rgb = mix( diffuseColor.rgb, dc.rgb, dc.a * 0.92 ); } }' : '')));
  };
  mat.customProgramCacheKey = () => 'shell-' + kind; mat.userData.U = U;
  const m = new THREE.SkinnedMesh(geo, mat); m.bind(F.body.skeleton, F.body.bindMatrix); m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
  F.body.parent.add(m); m.position.copy(F.body.position); m.quaternion.copy(F.body.quaternion); m.scale.copy(F.body.scale);
  return m;
}
// gloves, headgear and the gum shield: 04b_gloves_headgear.js

