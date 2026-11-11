
/* ───────── looks ───────── */
const SHORTS_LOOKS = [
  { id: 'red', main: '#8a0e1a', trim: '#d6a640', band: '#121012', sheen: '#d8404a' },
  { id: 'blue', main: '#12357e', trim: '#e8e8ee', band: '#0c1020', sheen: '#5a86e0' },
  { id: 'black', main: '#17171a', trim: '#d6a640', band: '#2c2c31', sheen: '#77777f' },
  { id: 'white', main: '#ddd8cc', trim: '#17171a', band: '#17171a', sheen: '#ffffff' },
  { id: 'green', main: '#0f5a36', trim: '#d6a640', band: '#0a1a12', sheen: '#4fc48a' },
  { id: 'purple', main: '#4a1a6e', trim: '#cfd3da', band: '#140a1e', sheen: '#a66de0' },
];
// hair colours (the cut itself: HAIR_STYLES in 04g_hair.js; an old save may still say hair: 'bald' — read as the bald style)
const HAIR_LOOKS = [{ id: 'black', c: '#1b1511', label: 'чёрные' }, { id: 'dbrown', c: '#2f1d11', label: 'тёмно-каштановые' }, { id: 'brown', c: '#3a2616', label: 'каштановые' }, { id: 'blond', c: '#b08e58', label: 'русые' },
  { id: 'red', c: '#84361a', label: 'рыжие' }, { id: 'grey', c: '#9a9692', label: 'седые' }, { id: 'bleach', c: '#d9c89a', label: 'обесцвеченные' }];
const WRAPS_LOOKS = [{ id: 'white', c: '#ffffff', need: 0, label: 'белые' }, { id: 'black', c: '#2a2a2c', need: 2, label: 'чёрные' }, { id: 'red', c: '#b3202c', need: 4, label: 'красные' },
  { id: 'blue', c: '#2f55b5', need: 6, label: 'синие' }, { id: 'gold', c: '#d8b25a', need: 8, label: 'золотые' }];
const SIGS = [{ id: 'jab', label: 'джеб' }, { id: 'cross', label: 'кросс' }, { id: 'hook', label: 'хук' }, { id: 'upper', label: 'апперкот' }, { id: 'over', label: 'оверхенд' }];
const sigOf = n => n === 'hookL' || n === 'hookR' ? 'hook' : n === 'upperL' || n === 'upperR' ? 'upper' : n;
/* fighter attributes, 0–5 each: power (+6 % damage per level), hand speed (+3.5 % punch speed), chin (−5 % damage taken, harder
   to drop), engine (+8 % stamina recovery, −5 % cost per punch) */
const STATS = [{ id: 'pow', label: 'Сила', d: 'урон' }, { id: 'spd', label: 'Скорость', d: 'скорость ударов' }, { id: 'chin', label: 'Челюсть', d: 'держит удар' }, { id: 'sta', label: 'Дыхалка', d: 'выносливость' }];
const SK = (F, k) => (F && F.stat ? F.stat[k] || 0 : 0);
const lvlStats = l => ({ pow: l, spd: l, chin: l, sta: l });
// skin tones, light → very dark; `c` tints the CC textures, the tones listed in SKIN_TONES (04h_skin_tattoo.js) are rebuilt in the shader instead
const SKIN_LOOKS = [{ id: 'light', c: '#e6cfc2', label: 'светлая' }, { id: 'tan', c: '#c8a288', label: 'загар' }, { id: 'olive', c: '#ffffff', label: 'оливковая' }, { id: 'brown', c: '#ffffff', label: 'смуглая' },
  { id: 'dark', c: '#ffffff', label: 'тёмная' }, { id: 'deep', c: '#ffffff', label: 'очень тёмная' }];
function paintShorts(c, S) {
  const W = c.width, H = c.height, g = c.getContext('2d'), cream = '#f1e7d2';
  g.fillStyle = S.main; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(0,0,0,.14)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.05})`; g.fillRect(rnd() * W, rnd() * H, 1, 2 + rnd() * 6); }
  const yWB = H * 0.16, yHem = H * 0.94;
  g.fillStyle = S.trim; g.fillRect(0, 0, W * 0.05, H);
  g.fillStyle = cream; g.fillRect(W * 0.05, 0, W * 0.012, H);
  g.fillStyle = S.band; g.fillRect(0, 0, W, yWB);
  g.fillStyle = S.trim; g.fillRect(0, yWB * 0.18, W, yWB * 0.16); g.fillRect(0, yWB * 0.66, W, yWB * 0.16);
  g.fillStyle = cream; g.fillRect(0, yWB * 0.44, W, yWB * 0.1);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, yWB - 3, W, 3);
  g.fillStyle = cream; g.fillRect(0, yHem - 6, W, 4);
  g.fillStyle = S.trim; g.fillRect(0, yHem - 2, W, H - yHem + 2);
}

/* ───────── templates: parse once, share geometry between both fighters ───────── */
function firstBones(obj) { const by = {}; obj.traverse(o => { if (o.isBone && !by[o.name]) by[o.name] = o; }); return by; }
async function buildTemplates() {
  const bufs = {};
  await Promise.all(Object.entries(FILES).map(async ([k, u]) => { bufs[k] = await fetchBuf(u); }));
  const tex = {};
  await Promise.all(TEX.map(async n => { tex[n] = await loadTex(n, n.endsWith('_d')); }));
  ldText.textContent = 'Собираю бойцов…';
  await new Promise(r => setTimeout(r, 30));
  T.tex = tex;

  const cc = fbx.parse(bufs.boxer, 'assets/');
  cc.scale.setScalar(0.01);
  for (const ch of [...cc.children]) if (/^(Shadow_Catcher|Light_Sets|Camera)/.test(ch.name)) cc.remove(ch);
  ccBones = firstBones(cc);
  let body; const drop = [];
  cc.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
    if (o.isSkinnedMesh) o.normalizeSkinWeights();
    if (o.name === 'CC_Base_Body') body = o;
    else if (o.name === 'CC_Game_Eye') o.material = new THREE.MeshPhysicalMaterial({ map: tex.eye_d, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
    else if (o.name === 'CC_Game_Teeth') o.material = new THREE.MeshStandardMaterial({ map: tex.teeth_d, roughness: 0.35 });
    else drop.push(o);
  });
  drop.forEach(o => o.removeFromParent());
  cc.updateMatrixWorld(true);
  T.matNames = (Array.isArray(body.material) ? body.material : [body.material]).map(m => m.name);
  T.nailMat = new THREE.MeshPhysicalMaterial({ map: tex.nails_d, roughness: 0.3, clearcoat: 0.6 });
  T.hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
/*BODYBLOCK*/
  skinTemplate(body);   // rest-pose data for tattoos, palms / soles mask (04h_skin_tattoo.js)
  // face blend shapes, read from the FBX itself (the loader's morphs are broken and were dropped above): 03b_face_shapes.js
  try { T.fm = faceShapes(bufs.boxer, body.geometry); } catch (e) { console.warn('face shapes:', e); T.fm = null; }
  T.cc = cc;
  T.shortsGeo = makeShorts(body);
  T.shortsNormal = shortsNormal();
  { const o = fbx.parse(bufs.wraps, 'assets/'); o.updateMatrixWorld(true); let sm; o.traverse(x => { if (x.isSkinnedMesh) sm = x; });
    T.wraps = { geo: sm.geometry, bind: sm.bindMatrix.clone(), names: sm.skeleton.bones.map(b => b.name) };
    T.wrapMat = new THREE.MeshStandardMaterial({ map: tex.wraps_d, normalMap: tex.wraps_n, roughness: 0.88 });
    T.tailMat = new THREE.MeshStandardMaterial({ color: '#e6e0d4', roughness: 0.92, side: THREE.DoubleSide }); }
  HEAD.restInv.copy(ccBones.CC_Base_Head.matrixWorld).invert();
  HEAD.restInvT.copy(HEAD.restInv).multiply(new M4().makeTranslation(HEAD.C.x, HEAD.C.y, HEAD.C.z));
  // under-layer of hair and the stubble are rigid on the head: build once, share
  const restFrame = new M4().makeTranslation(HEAD.C.x, HEAD.C.y, HEAD.C.z);
  for (const [k, roots] of [['base', HEAD.hairRoots], ['beard', HEAD.beardRoots]]) {
    const h = buildHair(roots, { kind: k, frame: restFrame, COL: {} }); h.frame = restFrame; renderHair(h); T[k + 'Geo'] = h.geo;
  }
  T.simRoots = HEAD.hairRoots.filter(() => rnd() < 0.3);
  T.src = fbx.parse(bufs.idle, 'assets/'); T.src.scale.setScalar(0.01);
  const clip = o => { const c = o.animations[0]; c.tracks = c.tracks.filter(t => !/\.scale$/.test(t.name)); return c; };
  T.clips = { idle: clip(T.src) };
  for (const k of ['jab', 'cross', 'hookL', 'hookR', 'upperL', 'upperR']) T.clips[k] = clip(fbx.parse(bufs[k], 'assets/'));
  T.clips.over = T.clips.cross.clone(); T.clips.over.name = 'over';
}

/* ───────── small maths scratch ───────── */
const _m1 = new M4(), _qp = new Quat(), _qa = new Quat(), _qb = new Quat(), _qc = new Quat(), _qd = new Quat(), _e1 = new THREE.Euler();
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _v5 = new V3(), _v6 = new V3(), _j1 = new V3(), _j2 = new V3();
const _ca = new V3(), _cb = new V3();
const acosc = x => Math.acos(clamp(x, -1, 1));

class Jig {   // soft-tissue bone: lags behind its parent on a spring
  constructor(bone, k, c, max) { this.b = bone; this.rest = bone.position.clone(); this.k = k; this.c = c; this.max = max; this.p = new V3(); this.v = new V3(); this.init = false; }
  update(dt) {
    const par = this.b.parent, tgt = _j1.copy(this.rest).applyMatrix4(par.matrixWorld);
    if (!this.init) { this.p.copy(tgt); this.v.set(0, 0, 0); this.init = true; }
    if (dt > 0) { const n = dt > 0.02 ? 2 : 1, h = dt / n; for (let i = 0; i < n; i++) { _j2.copy(tgt).sub(this.p).multiplyScalar(this.k).addScaledVector(this.v, -this.c); this.v.addScaledVector(_j2, h); this.p.addScaledVector(this.v, h); } }
    _j2.copy(this.p).sub(tgt); const l = _j2.length(); if (l > this.max) { _j2.multiplyScalar(this.max / l); this.p.copy(tgt).add(_j2); this.v.multiplyScalar(0.7); }
    _j2.add(tgt); this.b.position.copy(par.worldToLocal(_j2)); this.b.updateMatrixWorld(true);
  }
}
class Spring { constructor(k, c) { this.k = k; this.c = c; this.x = 0; this.v = 0; } step(dt) { this.v += (-this.k * this.x - this.c * this.v) * dt; this.x += this.v * dt; } zero() { this.x = this.v = 0; } }

/* ───────── punches ───────── */
const PN = ['jab', 'cross', 'hookL', 'hookR', 'upperL', 'upperR', 'over'];
const PUNCH = {
  jab: { arm: 'L', type: 'straight', start: 0.10, impact: 0.40, dmg: 6, sta: 6, rootZ: 0.6, label: 'Джеб' },
  cross: { arm: 'R', type: 'straight', start: 0.18, impact: 0.67, dmg: 12, sta: 12, rootZ: 0.95, label: 'Кросс' },
  hookL: { arm: 'L', type: 'hook', start: 0.12, impact: 0.50, dmg: 14, sta: 14, rootZ: 0.75, label: 'Хук левой' },
  hookR: { arm: 'R', type: 'hook', start: 0.22, impact: 0.70, dmg: 16, sta: 16, rootZ: 0.8, label: 'Хук правой' },
  upperL: { arm: 'L', type: 'upper', start: 0.24, impact: 0.72, dmg: 14, sta: 15, rootZ: 0.9, label: 'Апперкот левой' },
  upperR: { arm: 'R', type: 'upper', start: 0.20, impact: 0.70, dmg: 18, sta: 18, rootZ: 1.05, label: 'Апперкот правой' },
  over: { arm: 'R', type: 'over', start: 0.16, impact: 0.67, dmg: 21, sta: 24, rootZ: 1.05, slow: 0.82, label: 'Оверхенд' },
};
// seconds from the press to the impact (the wind-up of the clip is played faster to hit these; the follow-through keeps its pace).
// Was the clip's own pace: jab 0.30, cross 0.49, hooks 0.38/0.48, uppers 0.48/0.50 — it read as lag between the key and the punch.
const PUNCH_T = { jab: 0.17, cross: 0.24, hookL: 0.26, hookR: 0.30, upperL: 0.29, upperR: 0.30, over: 0.36 };
const AI_SNAP = 0.85;    // the AI gets 85 % of that speed-up, so its punches stay readable for the player
const FOLLOW_K = 1.3;    // the follow-through and the way back, a bit quicker than the clip
// which defence beats which punch (body shots are only beaten by pulling back)
const EV = { jab: ['slipL', 'slipR', 'duck', 'lean'], cross: ['slipL', 'slipR', 'duck'], hookL: ['duck', 'lean'], hookR: ['duck', 'lean'], upperL: ['slipL', 'slipR', 'lean'], upperR: ['slipL', 'slipR', 'lean'], over: ['lean'] };
const RJ = ['L_Thigh', 'R_Thigh', 'L_Upperarm', 'R_Upperarm', 'NeckTwist01', 'L_Forearm', 'L_Hand', 'R_Forearm', 'R_Hand', 'L_Calf', 'L_Foot', 'L_ToeBase', 'R_Calf', 'R_Foot', 'R_ToeBase'];

