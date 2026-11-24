/* ───────── the shop («Магазин», menu screen 'shop') ─────────
   Category → cards of the items (price / «есть» / «награда · бой N») → colours. A click on a card puts the thing on the man
   (try-on: LOOK is changed and P1.applyLook'ed); «Купить» pays it (PROF.cash → PROF.own, 07b_economy.js) and the thing stays on.
   Leaving the shop takes off everything that was only tried (shopLeave). A locked item of the creator opens the shop on itself
   (shopOpen). Free things (price 0) are in the list as «базовое», career rewards are shown locked with the fight they come from.
   R-21: every card has a 128×128 picture of the thing on the man (thStep, below) and the marks «новое» (available, not yet seen in the
   shop: PROF.seen) and «хватает» (not owned, the cash covers the price). */
const SHOP = { cat: 'top', pick: null, sel: null, snap: null };
const SHOP_CATS = [...WCATS, 'hands'];
const SHOP_HANDS = { yaw: 0.85, zoom: 0.82 };   // the gloves with the man still in his cap: not as close as the creator's VIEW_HANDS
const shopCur = cat => cat === 'hands' ? (LOOK.hands || 'wraps') : wearGet(LOOK, cat).id;
const shopList = cat => [...(WNONE[cat] ? [{ id: 'none', label: WNONE[cat], free: 1 }] : []), ...wearItems(cat).filter(i => !i.noShop)];
function shopTry(cat, id) {   // put it on (nothing is paid)
  if (cat === 'hands') LOOK.hands = id;
  else if (id === 'none') LOOK[cat] = { id: 'none' };
  else { const it = ITEMS[id], old = wearGet(LOOK, cat); LOOK[cat] = { id, color: old.color && (old.id === id || wearColors(it).includes(old.color)) ? old.color : it.colors[0] }; }   // the colour stays while trying things on
  P1.applyLook(LOOK);
}
function shopEnter() {
  SHOP.snap = JSON.parse(JSON.stringify(LOOK)); shopSeenStart(); thOpen(); clothShop();   // (issue 86: the Blender garments are fetched for their pictures)
  if (SHOP.pick) { shopTry(SHOP.cat, SHOP.pick); SHOP.pick = null; }
  setView(SHOP.cat === 'head' || SHOP.cat === 'eyes' ? VIEW_FACE : SHOP.cat === 'hands' ? SHOP_HANDS : VIEW_FULL);
  shopRender();
}
function shopLeave() {   // what is worn but not owned goes back to what was worn before
  const S = SHOP.snap; if (!S) return;
  for (const c of WCATS) { const w = wearGet(LOOK, c); if (w.id !== 'none' && !itemOwned(w.id)) LOOK[c] = S[c]; }
  if (!itemOwned(LOOK.hands || 'wraps')) LOOK.hands = S.hands || 'wraps';
  SHOP.snap = null; P1.applyLook(LOOK); shopSeenEnd(); save(); thSave();
}
function shopOpen(cat, id) { SHOP.cat = cat; SHOP.pick = id || null; uiShow('shop', 'sh-buy'); }
function shopRender() {
  const cat = SHOP.cat, cur = shopCur(cat);
  $('sh-cash').textContent = cash(PROF.cash); $('shop-lbl') && ($('shop-lbl').textContent = cash(PROF.cash));
  swatches('o-scat', SHOP_CATS.map(c => ({ id: c, label: WCAT_LABEL[c] })), () => cat, v => { SHOP.cat = v; shopRender(); setView(v === 'head' || v === 'eyes' ? VIEW_FACE : v === 'hands' ? SHOP_HANDS : VIEW_FULL); }, true, true);
  if (SHOP.shown) { SHOP.shown.add(cat); shopCatMarks(); }
  swatches('o-ssort', WSORT, () => SHOP.sort || 'all', v => { SHOP.sort = v; setTimeout(shopRender, 0); }, true, true);   // order of the cards (04l_wardrobe3.js)
  const box = $('o-sitems'); box.textContent = ''; SHOP.sel = cur; if (UI.scr === 'shop' || SHOP.snap) thQueue(cat);
  const all = shopList(cat), none = all.filter(i => i.id === 'none');
  [...none, ...wearSort(all.filter(i => i.id !== 'none'), SHOP.sort, SHOP.fresh)].forEach((it, i) => {
    const own = it.free || itemOwned(it.id), b = document.createElement('button'); b.type = 'button'; b.className = 'shc' + (own ? ' own' : it.reward ? ' lock' : '');
    b.setAttribute('aria-pressed', String(it.id === cur));
    const th = document.createElement('i'), k = thKey(cat, it.id), u = TH.mem.get(k); th.className = 'th'; th.dataset.k = k; if (u) th.style.backgroundImage = `url(${u})`; b.append(th);   // R-21: the picture (thStep fills it in)
    if (SHOP.fresh && SHOP.fresh.has(it.id)) { const n = document.createElement('em'); n.className = 'nw'; n.textContent = 'новое'; b.append(n); }
    if (it.brand) { const im = document.createElement('img'); im.src = brandIcon(it.brand); im.alt = ''; b.append(im); }
    const t = document.createElement('b'); t.textContent = it.label; b.append(t);
    if (it.brand) { const s = document.createElement('small'); s.textContent = it.brand; b.append(s); }
    const p = document.createElement('span'), buy = !own && !it.reward, ok = buy && PROF.cash >= it.price; p.className = 'pr' + (buy ? ok ? ' ok' : ' no' : '');
    p.textContent = it.free ? 'базовое' : own ? (it.price ? '✓ есть' : 'базовое') : it.reward ? '🔒 награда · бой ' + it.reward : cash(it.price);
    if (ok) { const s = document.createElement('small'); s.textContent = 'хватает'; p.append(s); }   // R-21: «хватает денег»
    b.append(p);
    b.onclick = () => { shopTry(cat, it.id); shopRender(); const n = $('o-sitems').children[i]; n && n.focus({ preventScroll: true }); };
    box.appendChild(b);
  });
  const it = ITEMS[cur], cols = cat !== 'hands' && it && it.cat === cat ? wearColors(it).map(id => { const c = wearColor(it, id); return { id, c: c.c, label: c.label || id, pat: c.pat }; }) : [];
  swatches('o-scolor', cols, () => wearGet(LOOK, cat).color || (it && it.colors[0]), v => { LOOK[cat] = { ...wearGet(LOOK, cat), id: it.id, color: v }; });
  wearPatRow('o-spat', cat !== 'hands' && it && it.cat === cat ? it : null, () => wearGet(LOOK, cat), v => { LOOK[cat] = { ...wearGet(LOOK, cat), pat: v }; });
  [...$('o-scolor').children].forEach((b, i) => { b.title = cols[i].label; if (cols[i].pat) b.style.backgroundImage = `url(${GEAR.camoUrl || (GEAR.camoUrl = (() => { const c = document.createElement('canvas'); c.width = c.height = 48; camoPaint(c.getContext('2d'), 48, 48, 0.35); return c.toDataURL(); })())})`; if (i === it.colors.length - 1) b.style.marginRight = '10px'; });
  $('o-scolor').parentElement.hidden = !cols.length;
  // the buy button: what it says depends on the item
  const buy = $('sh-buy'), own = !it || itemOwned(cur), left = it && !own && !it.reward ? it.price - PROF.cash : 0;
  buy.disabled = own || !!(it && it.reward) || left > 0;
  buy.textContent = !it ? 'Без вещи' : own ? (it.price ? 'Уже есть' : 'Базовое') : it.reward ? 'Награда за карьеру' : left > 0 ? 'Не хватает ' + cash(left) : 'Купить · ' + cash(it.price);
  $('o-snote').textContent = !it ? 'снять вещь — бесплатно' : it.reward && !own ? `откроется после ${it.reward}-й победы в карьере (сейчас ${careerWins()})` : own ? 'надето на бойце — выйди из магазина, чтобы оставить' : 'примерка: купи, чтобы оставить';
}
function shopBuy() {
  const cat = SHOP.cat, id = shopCur(cat), it = ITEMS[id]; if (!it || itemOwned(id) || it.reward || PROF.cash < it.price) return;
  PROF.cash -= it.price; PROF.own[id] = 1; SHOP.snap[cat === 'hands' ? 'hands' : cat] = cat === 'hands' ? id : { ...wearGet(LOOK, cat) };
  save(); sfx.thud(0.4, true); shopRender(); updateMenu(); msg('Куплено: ' + it.label, 'tip');
  const n = $('sh-buy'); !n.disabled ? n.focus() : $('shop-back').focus();
}
/* ── R-21 «новое»: what is available (not locked) and was never on screen in the shop. The first visit of a save sees everything
   available as known (so «новое» means: a reward that opened since, or a thing added by an update). Seen = its category was shown. */
const shopAvail = it => !it.free && (!it.reward || itemOwned(it.id));
function shopSeenStart() {
  const all = SHOP_CATS.flatMap(c => shopList(c)).filter(shopAvail);
  if (!PROF.seen) { PROF.seen = {}; for (const it of all) PROF.seen[it.id] = 1; }
  SHOP.fresh = new Set(all.filter(it => !PROF.seen[it.id]).map(it => it.id)); SHOP.shown = new Set();
}
function shopSeenEnd() { if (PROF.seen) for (const c of SHOP.shown || []) for (const it of shopList(c)) if (shopAvail(it)) PROF.seen[it.id] = 1; SHOP.shown = null; }
function shopCatMarks() {   // a dot on a category that holds something «новое» the player has not opened yet
  [...$('o-scat').children].forEach((b, i) => { const c = SHOP_CATS[i]; b.classList.toggle('nw', !!SHOP.fresh && !SHOP.shown.has(c) && shopList(c).some(it => SHOP.fresh.has(it.id))); });
}

/* ── R-21: the pictures on the cards ──
   One thing per idle frame while the shop is open (thStep, called by frame() right after the frame is drawn): P1 is dressed in it
   (Fighter.dress with a copy of LOOK — shopTry's change without applyLook's hair / skin / tattoo work), drawn by the main renderer from a
   camera on its category (TH_CAM: head / eyes / torso / legs / belt / foot / hand) into its own half-float target, with near / far planes
   tight around him — the ring, the crowd and the location fall outside and leave the backdrop colour; an OutputPass tone-maps it into an
   8-bit target (the same ACES + sRGB as the screen), it is read back, and P1 is dressed back in LOOK in the same task (the man on screen
   never shows it). JPEG data URL → TH.mem + the localStorage neighbour 'ko-thumbs'. The key = TH_V · category · item · its colour · a hash
   of the item's record · the cloth asset state · the man's skin (+ hair / beard for head things): a changed item (issue #57: TH_V or the
   record) or another man draws again; a cloth GLB still loading ('~') is drawn but not stored. Debug: __shop.th (n = pictures drawn). */
const TH_KEY = 'ko-thumbs', TH_V = 1, TH_PX = 128, TH_FOV = 30;
const TH_BG = new THREE.Color(0x0b0d12);   // linear clear colour → ≈ #262a33 after the tone mapping
const TH = { mem: new Map(), q: [], n: 0, ms: [], log: [], pend: null, pbo: null, loaded: false, dirty: 0, wait: 0, hash: new Map(), rt: null, ldr: null, out: null, cam: null, cv: null, buf: null };
const TH_CAM = {   // b: bones to frame (their mean; 'foot' / 'hand' = the one nearer the lens), up: m above them, h: height of the frame (m),
  // yaw: as menuCam (0 = from +z, π/2 = from his front), pitch: from above
  head:   { b: ['CC_Base_Head'], up: 0.07, h: 0.42, yaw: 1.05, pitch: 0.10 },
  eyes:   { b: ['CC_Base_Head'], up: 0.07, h: 0.27, yaw: 1.25, pitch: 0.02 },
  top:    { b: ['CC_Base_Spine02'], up: -0.04, h: 0.80, yaw: 0.95, pitch: 0.05 },
  bottom: { b: ['CC_Base_L_Thigh', 'CC_Base_R_Thigh', 'CC_Base_L_Calf', 'CC_Base_R_Calf'], up: -0.05, h: 1.0, yaw: 0.9, pitch: 0.05 },
  belt:   { b: ['CC_Base_Hip'], up: 0.02, h: 0.40, yaw: 1.1, pitch: 0.12 },
  shoes:  { b: 'Foot', up: -0.05, h: 0.34, yaw: 0.85, pitch: 0.28 },
  hands:  { b: 'Hand', up: 0, h: 0.30, yaw: 0.9, pitch: 0.1 },
};
const thStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
function thItemHash(id) {
  let h = TH.hash.get(id); if (h !== undefined) return h;
  try { h = thStr(JSON.stringify(ITEMS[id] || id, (k, v) => typeof v === 'function' ? String(v) : v)); } catch (e) { h = '0'; }
  TH.hash.set(id, h); return h;
}
function thCloth(it) {   // the Blender garment behind an item (04j_cloth_asset.js): '' = none, '~' = not settled yet
  const cl = clothOf(it); if (!cl) return '';
  const s = CLOTH.st[cl] && CLOTH.st[cl].s; return s === 'ok' || s === 'fail' ? s : '~';
}
function thKey(cat, id) {
  const it = ITEMS[id], L = LOOK, body = cat === 'head' || cat === 'eyes' ? [L.skin, L.hairStyle, L.hair, L.beard, L.beardCol] : [L.skin];
  return [TH_V, cat, id, it && cat !== 'hands' ? it.colors[0] : '', id === 'none' ? '' : thItemHash(id), thCloth(it), thStr(JSON.stringify(body))].join('|');
}
function thLoad() {
  if (TH.loaded) return; TH.loaded = true;
  try { const o = JSON.parse(localStorage.getItem(TH_KEY) || '{}'); for (const k in o) if (typeof o[k] === 'string' && o[k].startsWith('data:image/')) TH.mem.set(k, o[k]); } catch (e) {}
}
function thSave() {   // only the keys of today's items and man: old pictures go
  if (!TH.dirty) return; TH.dirty = 0;
  const live = new Set(); for (const c of SHOP_CATS) for (const it of shopList(c)) live.add(thKey(c, it.id));
  const o = {}; for (const [k, u] of TH.mem) if (live.has(k) && !k.includes('|~|')) o[k] = u;
  try { localStorage.setItem(TH_KEY, JSON.stringify(o)); } catch (e) { try { localStorage.removeItem(TH_KEY); } catch (e2) {} }   // no room: the pictures are only a cache
}
function thOpen() { thLoad(); TH.q = []; TH.wait = 1; }   // the frame that builds the screen draws no picture
function thQueue(cat) {   // the shown category first, then the others (they are ready by the time the player gets there)
  const q = [], had = new Set();
  for (const c of [cat, ...SHOP_CATS.filter(c => c !== cat)]) for (const it of shopList(c)) { const k = thKey(c, it.id); if (!TH.mem.has(k) && !had.has(k)) { had.add(k); q.push({ cat: c, id: it.id, k }); } }
  TH.q = q;
}
const _thT = new V3(), _thD = new V3(), _thB = new V3(), _thC = new THREE.Color();
function thCamera(cat) {
  const C = TH_CAM[cat], cam = TH.cam || (TH.cam = new THREE.PerspectiveCamera(TH_FOV, 1, 0.05, 10)), cp = Math.cos(C.pitch);
  const dir = _thD.set(Math.sin(C.yaw) * cp, Math.sin(C.pitch), Math.cos(C.yaw) * cp), tg = _thT.set(0, 0, 0);
  if (typeof C.b === 'string') {   // the foot / hand nearer the camera
    let best = -1e9; for (const s of ['L', 'R']) { const b = P1.bones[`CC_Base_${s}_${C.b}`]; if (!b) continue; b.getWorldPosition(_thB); const d = _thB.dot(dir); if (d > best) { best = d; tg.copy(_thB); } }
  } else { let n = 0; for (const nm of C.b) { const b = P1.bones[nm]; if (b) { tg.add(b.getWorldPosition(_thB)); n++; } } tg.multiplyScalar(1 / Math.max(1, n)); }
  tg.y += C.up;
  const d = C.h / 2 / Math.tan(TH_FOV * Math.PI / 360);
  cam.position.copy(tg).addScaledVector(dir, d); cam.lookAt(tg);
  cam.near = Math.max(0.05, d - 0.75); cam.far = d + 0.55; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  return cam;
}
// draw: dress P1 in it, render, tone-map, start the read-back; P1 is dressed back before returning (the same task)
function thDraw(e) {
  const L = JSON.parse(JSON.stringify(LOOK)), it = ITEMS[e.id], cat = e.cat;
  if (cat === 'hands') L.hands = e.id; else L[cat] = e.id === 'none' || !it ? { id: 'none' } : { id: e.id, color: it.colors[0] };
  const R = renderer, gl = R.getContext(), inf = R.info.render, calls = inf.calls, tris = inf.triangles, bg = scene.background, sm = R.shadowMap.autoUpdate, ca = R.getClearAlpha(), prev = R.getRenderTarget();
  R.getClearColor(_thC);
  const rt = TH.rt || (TH.rt = new THREE.WebGLRenderTarget(TH_PX, TH_PX, { type: THREE.HalfFloatType, samples: 4 }));
  const ldr = TH.ldr || (TH.ldr = new THREE.WebGLRenderTarget(TH_PX, TH_PX)), out = TH.out || (TH.out = new OutputPass()), buf = TH.buf || (TH.buf = new Uint8Array(TH_PX * TH_PX * 4));
  const t0 = performance.now(), np = R.info.programs.length; let t1 = t0, t2 = t0;
  try {
    P1.dress(L); P1.group.updateMatrixWorld(true); wearPose(P1, P1.headFrame); t1 = performance.now();
    const cam = thCamera(cat);
    scene.background = null; R.shadowMap.autoUpdate = false; R.setClearColor(TH_BG, 1);
    R.setRenderTarget(rt); R.clear(); R.render(scene, cam);
    out.render(R, ldr, rt);
    // the read-back: WebGL2 = into a pixel buffer behind a fence, picked up by thStep a frame or more later (a plain readPixels waits
    // here for everything the GPU still has queued — the whole frame); WebGL1 = the plain one
    if (R.capabilities.isWebGL2) {
      R.setRenderTarget(ldr); const pbo = TH.pbo || (TH.pbo = gl.createBuffer());
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, buf.byteLength, gl.STREAM_READ);
      gl.readPixels(0, 0, TH_PX, TH_PX, gl.RGBA, gl.UNSIGNED_BYTE, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      e.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
    } else R.readRenderTargetPixels(ldr, 0, 0, TH_PX, TH_PX, buf);
    t2 = performance.now();
  } finally {
    scene.background = bg; R.shadowMap.autoUpdate = sm; R.setClearColor(_thC, ca); R.setRenderTarget(prev); inf.calls = calls; inf.triangles = tris;
    P1.dress(LOOK);
  }
  e.t = { dress: t1 - t0, draw: t2 - t1, back: performance.now() - t2, prog: R.info.programs.length - np };
}
// the pixels are there: rows flipped, a vignette, JPEG → TH.mem and the cards
function thFinish(e) {
  const gl = renderer.getContext(), buf = TH.buf;
  if (e.sync) { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, TH.pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buf); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.deleteSync(e.sync); e.sync = null; }
  const cv = TH.cv || (TH.cv = document.createElement('canvas')); cv.width = cv.height = TH_PX;
  const x = cv.getContext('2d'), im = x.createImageData(TH_PX, TH_PX), row = TH_PX * 4;
  for (let y = 0; y < TH_PX; y++) im.data.set(buf.subarray((TH_PX - 1 - y) * row, (TH_PX - y) * row), y * row);   // GL rows are bottom-up
  x.putImageData(im, 0, 0);
  const g = x.createRadialGradient(TH_PX / 2, TH_PX * 0.45, TH_PX * 0.2, TH_PX / 2, TH_PX / 2, TH_PX * 0.75);   // a soft vignette
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); x.fillStyle = g; x.fillRect(0, 0, TH_PX, TH_PX);
  const url = cv.toDataURL('image/jpeg', 0.82);
  TH.mem.set(e.k, url); TH.n++; if (!e.k.includes('|~|')) TH.dirty++;
  for (const el of $('o-sitems').querySelectorAll('.th')) if (el.dataset.k === e.k) el.style.backgroundImage = `url(${url})`;
  TH.log.push(e); if (TH.log.length > 200) TH.log.shift();
  if (TH.dirty >= 12 || !TH.q.length) thSave();
}
function thStep() {   // from renderFrame(), after the frame is drawn: one draw or one finish per frame
  if (GLX.lost) { TH.pend = null; return; }   // (the fence went with the context; the queue starts it again)
  const t = performance.now(), p = TH.pend;
  if (p) {
    const gl = renderer.getContext();
    if (gl.clientWaitSync(p.sync, 0, 0) === gl.TIMEOUT_EXPIRED && ++p.polls < 120) return;   // (after ≈ 2 s it is read anyway)
    TH.pend = null; thFinish(p); p.t.fin = performance.now() - t; return;
  }
  if (UI.scr !== 'shop' || !TH.q.length || UI.drag || !P1) return;
  if (TH.wait > 0) { TH.wait--; return; }
  let e; do e = TH.q.shift(); while (e && TH.mem.has(e.k));
  if (!e) return;
  e.polls = 0; thDraw(e); if (e.sync) TH.pend = e; else thFinish(e);
  const ms = performance.now() - t; TH.ms.push(ms); if (TH.ms.length > 200) TH.ms.shift();   // (counted in PERF.m.render by renderFrame)
  if (ms > 40) TH.wait = 1;   // a heavy one (a cut built, a shader compiled): the next frame starts none
}
function buildShop() { shopRender(); }
// debug: __shop.PROF.cash = 5000; __shop.open('top', 'hoodie'); __shop.fightOver(true, false, 'ko')
window.__shop = { PROF, LOOK, ITEMS, SHOP, TH, thKey, thSave, cash, itemOwned, purse, open: shopOpen, buy: shopBuy, tryOn: shopTry, save, fightOver, careerWins, LADDER };
