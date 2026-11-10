/* ───────── UI wiring ───────── */
/* a row of choices: colour dots (items with .c) or text chips (txt). A look choice is put on P1 at once; noLook = not part of the look */
function swatches(id, list, get, set, txt, noLook) {
  const box = $(id); box.textContent = '';
  for (const it of list) {
    const b = document.createElement('button'); b.type = 'button';
    if (txt || !it.c) { b.className = 'txt'; b.textContent = it.label; } else { b.style.setProperty('--c', it.sw || it.c); b.setAttribute('aria-label', it.label || it.id); }
    b.setAttribute('aria-pressed', String(get() === it.id));
    b.addEventListener('click', () => { set(it.id); for (const o of box.children) o.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-pressed', 'true');
      if (!noLook) { P1.applyLook(LOOK); if (P1.gear.spar !== UI.spar) P1.sparGear(UI.spar); } save(); });
    box.appendChild(b);
  }
}
/* (the menu screens themselves — buildMenu, creator, settings, pause — are in 14_screens.js) */
let bodyMod = false;
const press = (type, name, el, shift) => { if (G.paused) return; if (G.state === 'kd' && G.kd && G.kd.def === P1 && type === 'punch') { G.kd.mash = Math.min(G.kd.mash + 0.3, 6); if (el) { el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 110); } return; } if (G.state !== 'fight' && !(type === 'punch' && followOK(P1))) return; if (type === 'dodge') Q.length = 0; if (Q.length < 3) Q.push({ type, name, at: G.real, body: !!shift || bodyMod, pow: powMod }); if (type === 'punch' && bodyMod) { bodyMod = false; const b = $('body-btn'); b && b.classList.remove('lit'); } if (type === 'punch' && powMod) setPow(false); if (el) { el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 110); } };
document.querySelectorAll('[data-punch]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); press('punch', b.dataset.punch, b); }));
const setBlock = v => { if (P1) P1.blocking = v && G.state === 'fight'; const b = $('block-btn'); b && b.classList.toggle('on', !!v); };
// block: hold the button (or space)
{ const bb = $('block-btn'); bb.addEventListener('pointerdown', e => { e.preventDefault(); try { bb.setPointerCapture(e.pointerId); } catch (_) {} setBlock(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) bb.addEventListener(ev, () => setBlock(false)); }
$('body-btn').addEventListener('pointerdown', e => { e.preventDefault(); bodyMod = !bodyMod; $('body-btn').classList.toggle('lit', bodyMod); });
let powMod = false; const setPow = v => { powMod = v; const b = $('pow-btn'); b && b.classList.toggle('lit', v); const k = $('kb-pow'); k && k.classList.toggle('lit', v); };
$('pow-btn').addEventListener('pointerdown', e => { e.preventDefault(); setPow(!powMod); });
document.querySelectorAll('[data-dodge]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); press('dodge', b.dataset.dodge, b); }));
/* movement: the left stick (or arrows / Q E) walks — x along the fight line, y circles him; a quick flick of the stick and
   release is a dodge: back = lean away, down = duck, up = slip (to the side his punch isn't coming from) */
const MV = { kx: 0, ky: 0, sx: 0, sy: 0 };
const setMove = () => { if (!P1) return; const x = MV.kx || MV.sx, y = MV.ky || MV.sy; P1.moveDir = Math.abs(x) > 0.25 ? Math.sign(x) * Math.min(1, Math.abs(x) * 1.25) : 0; P1.moveLat = Math.abs(y) > 0.25 ? Math.sign(y) * Math.min(1, Math.abs(y) * 1.25) : 0; };
{
  const el = $('stick'), knob = el.querySelector('.knob'); let st = null;
  const upd = e => { const r = el.getBoundingClientRect(), R = r.width / 2; let dx = (e.clientX - st.cx) / R, dy = (e.clientY - st.cy) / R;
    if (stage.classList.contains('rot')) { const t = dx; dx = dy; dy = -t; }
    const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; } st.dx = dx; st.dy = dy; st.peak = Math.max(st.peak, Math.hypot(dx, dy));
    knob.style.transform = `translate(${(dx * 60).toFixed(0)}%,${(dy * 60).toFixed(0)}%)`; MV.sx = dx; MV.sy = -dy; setMove(); };
  el.addEventListener('pointerdown', e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} const r = el.getBoundingClientRect(); st = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, t: G.real, peak: 0, dx: 0, dy: 0 }; el.classList.add('on'); upd(e); });
  el.addEventListener('pointermove', e => { if (st) upd(e); });
  for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, () => {
    if (st && G.real - st.t < 0.22 && st.peak > 0.6) {   // a flick
      const ax = st.dx, ay = st.dy; let d = null;
      if (Math.abs(ax) > Math.abs(ay)) d = ax < 0 ? 'lean' : null; else d = ay > 0 ? 'duck' : (P2 && P2.cur && PUNCH[P2.cur].arm === 'L' ? 'slipR' : 'slipL');
      if (d) press('dodge', d);
    }
    st = null; el.classList.remove('on'); knob.style.transform = ''; MV.sx = MV.sy = 0; setMove(); });
}
/* desktop: WASD / arrows walk (A/D back-forward, W/S circle), right hand on J K U I M , O for punches, mouse LMB jab / RMB cross /
   middle overhand, Q E slips, C duck, X lean back, Space block, Shift = to the body, F = power. Physical keys (e.code): any layout works */
const MV_KEYS = { ArrowLeft: ['kx', -1], ArrowRight: ['kx', 1], KeyA: ['kx', -1], KeyD: ['kx', 1], ArrowUp: ['ky', 1], ArrowDown: ['ky', -1], KeyW: ['ky', 1], KeyS: ['ky', -1] };
const ACT_KEYS = { KeyJ: ['punch', 'jab'], KeyK: ['punch', 'cross'], KeyU: ['punch', 'hookL'], KeyI: ['punch', 'hookR'], KeyM: ['punch', 'upperL'], Comma: ['punch', 'upperR'], KeyO: ['punch', 'over'],
  KeyQ: ['dodge', 'slipL'], KeyE: ['dodge', 'slipR'], KeyC: ['dodge', 'duck'], KeyX: ['dodge', 'lean'] };
const HELD = new Set();
const mvKeys = () => { let x = 0, y = 0; for (const c of HELD) { const m = MV_KEYS[c]; if (m) { if (m[0] === 'kx') x += m[1]; else y += m[1]; } } MV.kx = Math.sign(x); MV.ky = Math.sign(y); setMove(); };
const kbLit = (id, v) => { const el = $(id); el && el.classList.toggle('lit', !!v); };
window.addEventListener('keyup', e => {
  HELD.delete(e.code);
  if (e.code === 'Space') { setBlock(false); kbLit('kb-blk', false); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') kbLit('kb-body', false);
  if (MV_KEYS[e.code]) mvKeys();
});
window.addEventListener('blur', () => { HELD.clear(); mvKeys(); setBlock(false); kbLit('kb-blk', false); kbLit('kb-body', false); });
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (uiKey(e)) return;   // menu screens / pause: arrows, Enter, Esc
  const live = G.state === 'fight' || G.state === 'ko' || G.state === 'kd';
  if (e.code === 'Space' && G.state === 'fight') { e.preventDefault(); if (!e.repeat) { setBlock(true); kbLit('kb-blk', true); } return; }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { if (live) kbLit('kb-body', true); return; }
  if (MV_KEYS[e.code]) { if (live || e.code.startsWith('Key')) e.preventDefault(); if (!e.repeat) { HELD.add(e.code); mvKeys(); } return; }
  if (e.code === 'KeyF') { e.preventDefault(); if (!e.repeat) setPow(!powMod); return; }
  if (e.repeat) return; const k = ACT_KEYS[e.code];
  if (k) { e.preventDefault(); press(k[0], k[1], document.querySelector(`[data-${k[0]}="${k[1]}"]`), e.shiftKey); }
  else if ((e.key === 'Enter' || e.key === ' ') && G.state === 'result' && document.activeElement === document.body) startFight();
});
// mouse punches anywhere on the ring (not on menus / buttons)
stage.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || G.paused || !(G.state === 'fight' || G.state === 'ko' || G.state === 'kd')) return;
  if (e.target.closest && e.target.closest('button,input,.ui,.result,.rec')) return;
  const n = e.button === 0 ? 'jab' : e.button === 2 ? 'cross' : e.button === 1 ? 'over' : null; if (!n) return;
  e.preventDefault(); press('punch', n, document.querySelector(`[data-punch="${n}"]`), e.shiftKey);
});
stage.addEventListener('contextmenu', e => { if (G.state !== 'menu') e.preventDefault(); });
$('r-again').addEventListener('click', startFight);
$('r-menu').addEventListener('click', toMenu);
$('r-replay').addEventListener('click', startReplay);
$('skip').addEventListener('click', endReplay);
document.addEventListener('contextmenu', e => e.preventDefault());

buildTemplates().then(() => {
  P1 = new Fighter(true); const nSc = scene.children.length; P2 = new Fighter(false); P2.sceneObjs = scene.children.slice(nSc).filter(o => o !== P2.group); P1.other = P2; P2.other = P1;
  REC.N = P1.allBones.length * 4 + 5;
  P1.place(-D_SEP / 2, Math.PI / 2, false); P2.place(D_SEP / 2, -Math.PI / 2, true);
  P1.applyLook(LOOK); buildMenu(); toMenu();
  /*DBG*/
  $('loading').hidden = true;
  requestAnimationFrame(t => { last = t; frame(t); });
}).catch(e => { console.error(e); ldText.textContent = 'Не удалось загрузить бойцов. Обнови страницу.'; ldText.className = 'err'; });
