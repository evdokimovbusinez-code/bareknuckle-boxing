/* ───────── menu screens: main menu, quick-fight setup (place + opponent), fighter creator, settings, pause ─────────
   UI.scr is the screen on top: 'main' | 'train' | 'quick' | 'creator' | 'settings' | 'pause' | null (the fight / result).
   All of them except the pause (and the settings opened from it) live in G.state === 'menu'; the pause sets G.paused, frame() then
   runs with dt = 0. The menu camera (menuCam) orbits P1: the creator turns it by dragging, the other screens just frame him. */
const UI = { scr: null, from: null, cat: 'name', spar: false, mouth: false, drag: 0, orb: { yaw: 0.85, zoom: 1 } };   // mouth: the gum-shield close-up of the creator (he bares his teeth: Face.update)
const UI_IDS = { main: 'menu', train: 'menu', quick: 'quick', creator: 'creator', shop: 'shop', social: 'social', settings: 'settings', pause: 'pause' };
const VIEW_MOUTH = { yaw: 1.38, zoom: 0 }, _mouthP = new V3(), VIEW_FACE = { yaw: 1.25, zoom: 0 }, VIEW_FULL = { yaw: 0.85, zoom: 1 }, VIEW_HANDS = { yaw: 0.95, zoom: 0.22 };
const VIEW_BACK = { yaw: -2.3, zoom: 0.55 };   // his back (the back tattoo)
const myName = () => PROF.nick || PROF.name || 'Ты';
function uiItems() { const root = UI.scr && $(UI_IDS[UI.scr]); return root ? [...root.querySelectorAll('button:not([disabled]),input')].filter(b => b.offsetParent !== null) : []; }
function uiShow(scr, focusId) {
  if (UI.scr === 'shop' && scr !== 'shop') shopLeave();   // a try-on that was not bought comes off (14b_shop.js)
  UI.scr = scr; const on = scr ? UI_IDS[scr] : null;
  for (const id of ['menu', 'quick', 'creator', 'shop', 'social', 'settings', 'pause']) $(id).hidden = id !== on;
  if (on === 'menu') { $('nav-main').hidden = scr !== 'main'; $('nav-train').hidden = scr !== 'train'; }
  if (scr === 'settings') { const p = UI.from === 'pause'; $('settings').classList.toggle('dim', p); $('reset-row').hidden = p; buildSettings(); setTab('opt'); }
  if (scr === 'pause') $('p-quit-l').textContent = BAG.on ? 'Выйти' : 'Сдаться';
  if (scr === 'shop') shopEnter();
  if (scr === 'social') socEnter();
  if (scr !== 'creator') UI.mouth = false;
  if (scr !== 'creator' && UI.spar) { UI.spar = false; if (G.state === 'menu') P1.sparGear(false); }   // the glove preview of the creator
  const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur();
  if (!TOUCH && scr && scr !== 'creator') { const b = (focusId && $(focusId)) || (scr === 'main' || scr === 'train' || scr === 'pause' ? uiItems()[0] : null); b && b.focus({ preventScroll: true }); }
}
function uiBack() {
  if (UI.scr === 'settings' && UI.from === 'pause') return uiShow('pause', 'p-set');
  if (UI.scr === 'main' || G.state !== 'menu') return;
  const back = { train: 'go-train', quick: 'go-quick', creator: 'go-fighter', shop: 'go-shop', social: 'go-social', settings: 'go-set' }[UI.scr];
  updateMenu(); uiShow('main', back);
}
/* keys of the screens; true = the key is taken (12_ui.js then leaves it alone). Esc: back / pause / skip the replay / leave the result */
function uiKey(e) {
  const t = e.target, txt = t && t.tagName === 'INPUT' && t.type !== 'range';
  if (txt) { if (e.key === 'Escape' || e.key === 'Enter') t.blur(); return true; }
  if (e.key === 'Escape') {
    e.preventDefault(); if (e.repeat) return true;
    if (G.paused) { if (UI.scr === 'settings') uiBack(); else resumeGame(); }
    else if (G.state === 'menu') uiBack();
    else if (canPause()) pauseGame();
    else if (G.state === 'replay') endReplay();
    else if (G.state === 'result') toMenu();
    return true;
  }
  if (!UI.scr) return false;
  const rng = t && t.type === 'range', k = e.key, step = k === 'ArrowDown' || (!rng && k === 'ArrowRight') ? 1 : k === 'ArrowUp' || (!rng && k === 'ArrowLeft') ? -1 : 0;
  if (step) { e.preventDefault(); const L = uiItems(), i = L.indexOf(document.activeElement), n = L[i < 0 ? (step > 0 ? 0 : L.length - 1) : (i + step + L.length) % L.length]; n && n.focus(); }
  return true;   // Enter / Space act on the focused button by themselves
}
/* pause */
const canPause = () => !G.paused && ['intro', 'fight', 'break', 'kd', 'ko', 'rend'].includes(G.state);
function pauseGame() { if (!canPause()) return; G.paused = true; HELD.clear(); mvKeys(); setBlock(false); Q.length = 0; UI.from = 'pause'; uiShow('pause'); }
function resumeGame() { G.paused = false; UI.from = null; uiShow(null); last = performance.now(); }
function surrender() { if (!BAG.on && G.state !== 'ko') { G.losses++; save(); } toMenu(); }   // giving up a live fight is a loss (after the knockout the result is already counted)

/* the menu camera: an orbit about P1 (yaw 0 = the fight camera's side, +z; π/2 = straight in front of him), eased here, so camUpdate
   takes it as is. sh shifts him off the screen centre (fraction of the half-width) to clear the panel on the left */
const MCAM = { yaw: 0.5, d: 4, tx: 0, ty: 1, tz: 0, sh: 0.36, h: 0.1, init: false };
function menuCam(dt, cp, cl) {
  const x = P1.group.position.x, th = Math.tan(camera.fov * Math.PI / 360), asp = VW / VH, dFull = 1.13 / th, hd = P1.headNow, T = { tx: x, tz: 0 };
  if (UI.scr === 'creator' || UI.scr === 'shop') { const z = UI.orb.zoom; T.yaw = UI.orb.yaw; T.d = lerp(0.37 / th, dFull, z); T.ty = lerp(hd.y - 0.05, 0.95, z); T.tx = lerp(hd.x, x, z); T.tz = lerp(hd.z, 0, z); T.sh = 0.5; T.h = 0.1;
    if (UI.mouth && UI.scr === 'creator') { const m = _mouthP.set(0, -0.08, 0.075).applyMatrix4(P1.gear.guard.matrix); T.d = 0.13 / th; T.tx = m.x; T.ty = m.y; T.tz = m.z; T.h = 0.012; } }   // the gum shield, close
  else if (UI.scr === 'quick') { T.yaw = 0.2; T.d = dFull * 1.18; T.ty = 1.02; T.sh = 0.4; T.h = 0.32; }
  else { T.yaw = 0.52 + 0.05 * Math.sin(camClock * 0.4); T.d = dFull * 0.84; T.ty = 1.05; T.sh = UI.scr === 'settings' || UI.scr === 'social' ? 0.5 : 0.38; T.h = 0.12; }
  const M = MCAM, a = camCut || !M.init ? 1 : 1 - Math.exp(-dt * (UI.drag ? 16 : 4.2)); M.init = true;
  for (const k in T) M[k] += (T[k] - M[k]) * a;
  const s = M.sh * M.d * th * asp, c = Math.cos(M.yaw), sn = Math.sin(M.yaw);
  cl.set(M.tx - c * s, M.ty, M.tz + sn * s); cp.set(cl.x + sn * M.d, M.ty + M.h, cl.z + c * M.d);
}
function setView(v) { const o = UI.orb, tau = 2 * Math.PI; o.yaw = v.yaw + tau * Math.round((o.yaw - v.yaw) / tau); o.zoom = v.zoom; }   // the short way round

/* fighter creator */
function mouthOff() { if (UI.mouth) { UI.mouth = false; setView(VIEW_HANDS); } }   // back from the gum-shield close-up to the hands
function setCat(c) {
  UI.cat = c; UI.mouth = false;
  for (const b of $('cats').children) b.setAttribute('aria-pressed', String(b.dataset.cat === c));
  for (const p of document.querySelectorAll('.cpane')) p.hidden = p.dataset.cat !== c;
  if (UI.scr === 'creator') setView(c === 'face' || (c === 'wear' && (UI.wcat === 'head' || UI.wcat === 'eyes')) ? VIEW_FACE : c === 'hands' ? VIEW_HANDS : VIEW_FULL);
  if (c !== 'hands' && UI.spar) { UI.spar = false; P1.sparGear(false); }
}
function buildCreator() {
  const col = (list, f) => list.map(f), spar = v => () => { UI.spar = v; };
  swatches('o-skin', col(SKIN_LOOKS, s => ({ id: s.id, c: s.c, sw: SKIN_TONES[s.id].sw, label: s.label })), () => LOOK.skin, v => { LOOK.skin = v; });
  // tattoos: any set of them (LOOK.tats)
  { const box = $('o-tats'); box.textContent = '';
    for (const t of TATS) { const b = document.createElement('button'); b.type = 'button'; b.className = 'txt'; b.textContent = t.label; const on = () => (LOOK.tats || []).includes(t.id); b.setAttribute('aria-pressed', String(on()));
      b.addEventListener('click', () => { LOOK.tats = on() ? LOOK.tats.filter(x => x !== t.id) : [...(LOOK.tats || []), t.id]; b.setAttribute('aria-pressed', String(on())); P1.applyLook(LOOK); if (P1.gear.spar !== UI.spar) P1.sparGear(UI.spar);
        setView(t.id === 'back' ? VIEW_BACK : t.id === 'face' || t.id === 'neck' ? VIEW_FACE : VIEW_FULL); save(); });
      box.appendChild(b); } }
  swatches('o-cut', HAIR_STYLES, () => hairStyleOf(LOOK).id, v => { LOOK.hairStyle = v; if (LOOK.hair === 'bald') LOOK.hair = 'black'; }, true);
  swatches('o-hair', col(HAIR_LOOKS, h => ({ id: h.id, c: h.c, label: h.label })), () => LOOK.hair === 'bald' ? 'black' : LOOK.hair, v => { LOOK.hair = v; });
  swatches('o-beard', BEARD_STYLES, () => beardStyleOf(LOOK).id, v => { LOOK.beard = v; }, true);
  swatches('o-beardc', [{ id: 'hair', label: 'как волосы' }, ...col(HAIR_LOOKS, h => ({ id: h.id, c: h.c, label: h.label }))], () => LOOK.beardCol || 'hair', v => { LOOK.beardCol = v; });
  wearUI();   // clothes: category → model → the colours of that model (04e_wardrobe.js)
  swatches('o-wraps', col(WRAPS_LOOKS, w => ({ id: w.id, c: w.c, label: w.label })), () => LOOK.wraps || 'white', v => { LOOK.wraps = v; spar(false)(); mouthOff(); });
  swatches('o-hands', HANDS, () => LOOK.hands || 'wraps', v => { if (!itemOwned(v)) { setTimeout(() => { buildCreator(); shopOpen('hands', v); }, 0); return; } LOOK.hands = v; spar(false)(); mouthOff(); }, true);   // street fights: wraps or 4 oz MMA gloves (bought)
  [...$('o-hands').children].forEach((b, i) => { const it = ITEMS[HANDS[i].id]; if (it && !itemOwned(it.id)) { b.classList.add('lock'); b.title = 'купить в магазине'; const s = document.createElement('small'); s.className = 'pr'; s.textContent = '🔒 ' + cash(it.price); b.append(s); } });
  swatches('o-gloves', GLOVES, () => LOOK.gloves || 'red', v => { LOOK.gloves = v; spar(true)(); mouthOff(); });   // sparring (and MMA) gloves + headgear: shown on him while choosing
  swatches('o-guard', col(GUARDS, b => ({ id: b.id, c: b.c, label: b.label })), () => LOOK.guard || 'clear', v => { LOOK.guard = v; spar(false)(); UI.mouth = true; setView(VIEW_MOUTH); });   // choosing a gum shield: he shows it, the camera goes to his mouth
  swatches('o-sig', [{ id: 'none', label: 'нет' }, ...SIGS], () => PROF.sig || 'none', v => { PROF.sig = v === 'none' ? null : v; }, true, true);
  for (const [id, key, n] of [['o-name', 'name', 16], ['o-nick', 'nick', 14]]) { const el = $(id); el.value = PROF[key] || ''; el.oninput = () => { PROF[key] = el.value.replace(/[<>]/g, '').slice(0, n); save(); }; }
  renderStats();
}
function randomLook() {
  const pick = a => a[(Math.random() * a.length) | 0], cw = careerWins();
  const of = (cat, pNone) => { if (Math.random() < pNone) return { id: 'none' }; const it = pick(wearItems(cat).filter(i => itemOwned(i.id))); return { id: it.id, color: pick(Math.random() < 0.7 ? it.colors : wearColors(it)) }; };   // only what he owns
  const skin = pick(SKIN_LOOKS).id;
  Object.assign(LOOK, { hair: pick(HAIR_LOOKS).id, hairStyle: randomCut(skin, Math.random), skin, beard: Math.random() < 0.5 ? pick(BEARD_STYLES).id : 'none', beardCol: 'hair', tats: Math.random() < 0.4 ? TATS.filter(() => Math.random() < 0.3).map(t => t.id) : [], bottom: of('bottom', 0), top: of('top', 0.3), shoes: of('shoes', 0.25), head: of('head', 0.6), eyes: of('eyes', 0.7), belt: of('belt', 0.4),
    guard: pick(GUARDS).id, wraps: pick(WRAPS_LOOKS.filter(w => cw >= w.need)).id, hands: pick(HANDS.filter(h => itemOwned(h.id))).id, gloves: pick(GLOVES).id });
  P1.applyLook(LOOK); if (P1.gear.spar !== UI.spar) P1.sparGear(UI.spar); save(); buildCreator();
}
function renderStats() {
  const box = $('o-stats');
  box.innerHTML = `<div class="rec-line">свободных очков: <b>${PROF.pts}</b></div>` + STATS.map(S => `<div class="stt"><b>${S.label}<small>${S.d}</small></b><div class="pips">${[0, 1, 2, 3, 4].map(i => `<i class="${i < PROF.stats[S.id] ? 'on' : ''}"></i>`).join('')}</div><button data-st="${S.id}" aria-label="${S.label} +1" ${PROF.pts > 0 && PROF.stats[S.id] < 5 ? '' : 'disabled'}>+</button></div>`).join('');
  for (const b of box.querySelectorAll('[data-st]')) b.onclick = () => { const id = b.dataset.st; if (PROF.pts <= 0 || PROF.stats[id] >= 5) return; PROF.pts--; PROF.stats[id]++; save(); renderStats(); sfx.thud(0.3, true); const n = box.querySelector(`[data-st="${id}"]:not([disabled])`); n && n.focus(); };
  const rec = `побед <b>${G.wins}</b> · поражений <b>${G.losses}</b> · карьера <b>${Math.min(G.career, LADDER.length)}/${LADDER.length}</b>${PROF.champ ? ` · пояс ×<b>${PROF.champ}</b>` : ''} · груша <b>${G.bagBest}</b>`;
  $('rec-line').innerHTML = rec; $('rec-line2').innerHTML = rec;
  $('pts-dot').classList.toggle('on', PROF.pts > 0);
  // wraps colours are unlocked by career wins
  for (const b of $('o-wraps').children) { const w = WRAPS_LOOKS.find(x => x.label === b.getAttribute('aria-label')), lock = !!w && careerWins() < w.need; b.classList.toggle('lock', lock); b.disabled = lock; b.title = lock ? `откроется после ${w.need} побед в карьере` : ''; }
}

/* settings */
const ONOFF = [{ id: 'on', label: 'вкл' }, { id: 'off', label: 'выкл' }];
function applyOpt() { stage.classList.toggle('nokeys', !OPT.keys); sfx.vol(OPT.vol); }
function setTab(t) { for (const b of $('set-tabs').children) b.setAttribute('aria-pressed', String(b.dataset.t === t)); for (const p of document.querySelectorAll('#settings .pbody')) p.hidden = p.dataset.t !== t; }
function gfxNote() { $('gfx-note').textContent = `сейчас: ${GFX_LABEL[GFX.level]}, ${GFX.h}p${GFX.set === 'auto' ? ' — авто подстраивает уровень под частоту кадров' : ''}`; }
function buildSettings() {
  swatches('o-gfx', ['auto', ...GFX_ORDER].map(id => ({ id, label: GFX_LABEL[id] })), () => GFX.set, v => { setGfx(v); gfxNote(); }, true, true); gfxNote();
  swatches('o-shake', ONOFF, () => OPT.shake ? 'on' : 'off', v => { OPT.shake = v === 'on'; }, true, true);
  swatches('o-cine', ONOFF, () => OPT.cine ? 'on' : 'off', v => { OPT.cine = v === 'on'; }, true, true);
  swatches('o-keys', ONOFF, () => OPT.keys ? 'on' : 'off', v => { OPT.keys = v === 'on'; applyOpt(); }, true, true);
  swatches('o-fps', ONOFF, () => PERF.on ? 'on' : 'off', v => perfToggle(v === 'on'), true, true);
  const vol = $('o-vol'), vv = $('vol-v'); vol.value = Math.round(OPT.vol * 100); vv.textContent = vol.value + '%';
  vol.oninput = () => { OPT.vol = clamp(vol.value / 100, 0, 1); vv.textContent = vol.value + '%'; applyOpt(); save(); };
  vol.onchange = () => { sfx.unlock(); sfx.vol(OPT.vol); sfx.thud(0.5, false); };   // a punch at the new level
  resetAsk(false);
}
function resetAsk(sure) {   // wiping the progress takes a second, explicit press
  const box = $('o-reset'); box.textContent = '';
  const btn = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'txt ' + cls; b.textContent = label; b.onclick = fn; box.appendChild(b); return b; };
  if (!sure) return btn('сбросить…', '', () => resetAsk(true).focus());
  const no = btn('отмена', '', () => resetAsk(false).focus()); btn('да, стереть всё', 'warn', () => { resetProgress(); resetAsk(false).focus(); }); return no;
}
function resetProgress() {   // record, career, belt, points and stats; the name and the look stay (minus wraps that are locked again)
  G.wins = G.losses = G.career = G.bagBest = 0; Object.assign(PROF, { sig: null, pts: 1, champ: 0, cash: 0, own: {} }); socReset(); for (const k in PROF.stats) PROF.stats[k] = 0;
  wearSanitize(); const w = WRAPS_LOOKS.find(x => x.id === (LOOK.wraps || 'white')); if (w && w.need > 0) LOOK.wraps = 'white'; P1.applyLook(LOOK);   // bought and career clothes go away with the money
  save(); buildCreator(); updateMenu(); msg('Прогресс сброшен', 'tip');
}

/* quick-fight setup: the place (cards) and the opponent's level; a career fight takes its place from the ladder */
function buildQuick() {
  swatches('o-diff', Object.entries(DIFFS).map(([id, d]) => ({ id, label: d.label })), () => G.diff, v => { G.diff = v; G.userDiff = v; }, true, true);
  const box = $('o-loc'); box.textContent = '';
  if (!locOpen(G.loc)) G.loc = 'gym';
  for (const L of Object.values(LOCS)) { if (L.train) continue;   // the training gym is not a place for fights; a place can wait for followers (LOC_FANS, 15_social.js)
    const open = locOpen(L.id), b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<b>${L.label}</b><small>${open ? L.desc || '' : '🔒 от ' + numF(LOC_FANS[L.id]) + ' подписчиков'}</small>`; b.setAttribute('aria-pressed', String(G.loc === L.id)); b.disabled = !open;
    b.onclick = () => { G.loc = L.id; setLocation(L.id); save(); for (const o of box.children) o.setAttribute('aria-pressed', String(o === b)); };
    box.appendChild(b);
  }
}

function buildMenu() {
  buildCreator(); buildSettings(); buildQuick(); applyOpt(); setCat(UI.cat);
  const on = (id, fn) => $(id).addEventListener('click', fn);
  on('go-car', () => { if (G.career >= LADDER.length) G.career = 0; startCareer(); });
  on('go-quick', () => { buildQuick(); uiShow('quick', 'go'); });
  on('go', startQuick); on('quick-back', uiBack);
  on('go-train', () => uiShow('train')); on('train-back', uiBack); on('go-bag', startBag); on('go-spar', startSpar);
  on('go-fighter', () => { buildCreator(); uiShow('creator'); setCat(UI.cat); });
  buildShop(); on('go-shop', () => uiShow('shop', 'sh-buy')); on('shop-back', uiBack); on('sh-face', () => setView(VIEW_FACE)); on('sh-full', () => setView(VIEW_FULL));
  on('sh-buy', shopBuy);
  on('go-social', () => uiShow('social', 'so-back')); on('so-back', uiBack);
  on('cr-done', uiBack); on('cr-rand', randomLook); on('v-face', () => setView(VIEW_FACE)); on('v-full', () => setView(VIEW_FULL));
  for (const b of $('cats').children) b.addEventListener('click', () => setCat(b.dataset.cat));
  on('go-set', () => { UI.from = 'menu'; uiShow('settings'); }); on('set-back', uiBack);
  for (const b of $('set-tabs').children) b.addEventListener('click', () => setTab(b.dataset.t));
  on('p-resume', resumeGame); on('p-set', () => uiShow('settings')); on('p-quit', surrender); on('pause-btn', pauseGame);
  if (TOUCH) $('cr-hint').textContent = 'тяни — вращать · щипок — зум';
  // the creator: drag turns him (the camera orbits), wheel / pinch zooms between the face and the full figure
  for (const el of [$('cr-drag'), $('sh-drag')]) dragView(el);
}
function dragView(el) {
  const pts = new Map(); let pinch = 0;
  el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; UI.drag = pts.size; });
  el.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId), o = UI.orb; if (!p) return;
    if (pts.size === 1) o.yaw -= (stage.classList.contains('rot') ? e.clientY - p[1] : e.clientX - p[0]) * 0.009;
    p[0] = e.clientX; p[1] = e.clientY;
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { o.zoom = clamp(o.zoom - (d - pinch) / 240, 0, 1); UI.mouth = false; } pinch = d; }
  });
  for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, e => { pts.delete(e.pointerId); pinch = 0; UI.drag = pts.size; });
  el.addEventListener('wheel', e => { e.preventDefault(); UI.mouth = false; UI.orb.zoom = clamp(UI.orb.zoom + Math.sign(e.deltaY) * 0.14, 0, 1); }, { passive: false });
}
