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
/* one circular punch zone: a short swipe from the touch point picks the punch, the way a right stick does in Undisputed.
   window.__ctl is the control log for the issue-40 check: the last ten punches as the queue saw them ({ name, body, pow }). */
window.__ctl = { last: [] };
const ctlLog = (name, body, pow) => { const L = window.__ctl.last; L.push({ name, body, pow }); if (L.length > 10) L.shift(); tutAct('punch', name, body, pow); };   // (issue 45) the tutorial reads punches here, the same place the control log is written
/* hints: the first three bouts are "learning" — the zone captions are bright and the desktop bar is always up; after that
   the captions dim and the bar only comes back after 8 s of no input. The settings switch turns every hint off. The
   bout count lives in its own localStorage key (not the save), read through try/catch so a blocked storage can't break input. */
const HINT_KEY = 'bx_fights';
function fightsSeen() { try { return +localStorage.getItem(HINT_KEY) || 0; } catch (_) { return 0; } }
function bumpFights() { try { localStorage.setItem(HINT_KEY, String(fightsSeen() + 1)); } catch (_) {} hintTick(); }
let lastAct = -1e9;
function noteAct() { lastAct = G.real; }
function hintFightStart() { noteAct(); if (G.mode !== 'bag') bumpFights(); }
function hintTick() {
  const on = OPT.keys, first3 = fightsSeen() < 3;
  const kb = $('kbar'), desk = stage.classList.contains('desk');
  const live = G.state === 'fight' || G.state === 'ko' || G.state === 'kd';
  kb && kb.classList.toggle('show', !!(on && desk && live && (first3 || G.real - lastAct > 8)));
  const pz = $('pzone');
  if (pz) { pz.classList.toggle('bright', !!(on && first3)); pz.classList.toggle('nohint', !on); }
}
setInterval(hintTick, 400);   // the desktop bar fades in after 8 s without input
for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'keydown', 'keyup', 'wheel']) document.addEventListener(ev, () => noteAct(), { passive: true });
/* body / power are a direction held at the very moment of the punch: S / ↓ (or the stick pushed down) = to the body,
   W / ↑ (or the stick pushed up) = power. W / S still walk him round the ring; the stick's flick-and-release still dodges. */
const punchMod = () => {
  let up = HELD.has('KeyW') || HELD.has('ArrowUp'), down = HELD.has('KeyS') || HELD.has('ArrowDown');
  if (Math.abs(MV.sy) > 0.5 && Math.abs(MV.sy) > Math.abs(MV.sx)) { if (MV.sy > 0) up = true; else down = true; }
  return { body: down, pow: up };
};
const blip = (el, ms = 110) => { if (!el) return; el.classList.add('on'); setTimeout(() => el.classList.remove('on'), ms); };
const press = (type, n, el) => {
  if (G.paused) return;
  noteAct();
  if (G.state === 'kd' && G.kd && G.kd.def === P1 && type === 'punch') { G.kd.mash = Math.min(G.kd.mash + 0.3, 6); blip(el); return; }
  if (G.state !== 'fight' && !(type === 'punch' && followOK(P1))) return;
  let body = false, pow = false;
  if (type === 'punch') { const m = punchMod(); body = m.body; pow = m.pow; ctlLog(n, body, pow); }
  if (type === 'dodge') { Q.length = 0; tutAct('dodge', n); }   // (issue 45) the tutorial reads dodges here too
  if (NET.guest) { netSendPress(type, n, body, pow); blip(el); return; }   // issue 49: the guest's press goes to the host, not into Q
  if (Q.length < 2) Q.push({ type, name: n, at: G.real, body, pow });
  blip(el);
};
/* the punch zone: six 60° sectors, a narrow ±15° band about straight up = cross, about straight down = nothing,
   a still tap = jab. The hand is never guessed — the direction of the swipe is the punch. */
const PZ_LABEL = { jab: 'ДЖЕБ', cross: 'КРОСС', hookL: 'ХУК', hookR: 'ХУК', upperL: 'АППЕР', upperR: 'АППЕР' };
const punchFromSwipe = (dx, dy) => {
  let a = Math.atan2(-dy, dx) * 180 / Math.PI; if (a < 0) a += 360;   // 0 = right, 90 = up, in the frame the player sees
  if (a >= 75 && a <= 105) return 'cross';    // straight up
  if (a >= 255 && a <= 285) return null;      // straight down: no punch
  const sec = Math.floor(((a + 30) % 360) / 60);   // centres 0/60/120/180/240/300 → six sectors
  return ['hookR', 'cross', 'jab', 'hookL', 'upperL', 'upperR'][sec];
};
{ const pzone = $('pzone');
  if (pzone) {
    const cap = pzone.querySelector('.pz-fl');
    const flash = name => {
      const set = el => { if (!el) return; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 320); };
      if (cap) { cap.textContent = PZ_LABEL[name] || ''; set(cap); }
      set(pzone.querySelector(`.pl[data-p="${name}"]`));
    };
    const fire = name => { press('punch', name); flash(name); };
    let g = null;
    // the same rotation transform the stick uses: afterwards dx/dy are in the frame the player actually sees
    const dir = e => { let dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (stage.classList.contains('rot')) { const t = dx; dx = dy; dy = -t; }
      return { dx, dy }; };
    pzone.addEventListener('pointerdown', e => { e.preventDefault(); try { pzone.setPointerCapture(e.pointerId); } catch (_) {}
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, armed: true, swiped: false }; });
    pzone.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const { dx, dy } = dir(e), d = Math.hypot(dx, dy);
      if (g.armed && d > 24) {         // a swipe fires at once, without waiting for the release
        g.armed = false; g.swiped = true;
        const name = punchFromSwipe(dx, dy);
        if (name) fire(name);
      } else if (!g.armed && d < 18) {   // back at the centre: arm the next swipe, the touch point is the new centre
        g.x = e.clientX; g.y = e.clientY; g.armed = true;
      }
    });
    for (const ev of ['pointerup', 'pointercancel']) pzone.addEventListener(ev, e => {
      if (!g || e.pointerId !== g.id) return;
      if (!g.swiped) fire('jab');       // a still tap = a jab, so it can be tapped quickly
      g = null;
    });
  }
}
const setBlock = v => { if (NET.guest) netBlock(v); if (P1) P1.blocking = v && G.state === 'fight'; const b = $('block-btn'); b && b.classList.toggle('on', !!v); };
// block: hold the button (or space)
{ const bb = $('block-btn'); bb.addEventListener('pointerdown', e => { e.preventDefault(); try { bb.setPointerCapture(e.pointerId); } catch (_) {} setBlock(true); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) bb.addEventListener(ev, () => setBlock(false)); }
/* movement: the floating left stick (or arrows / Q E) walks — x along the fight line, y circles him; a quick flick and
   release is a dodge: back = lean away, down = duck, up = slip (to the side his punch isn't coming from) */
const MV = { kx: 0, ky: 0, sx: 0, sy: 0 };
const setMove = () => { if (NET.guest) netMove(); if (!P1) return; const x = MV.kx || MV.sx, y = MV.ky || MV.sy; P1.moveDir = Math.abs(x) > 0.25 ? Math.sign(x) * Math.min(1, Math.abs(x) * 1.25) : 0; P1.moveLat = Math.abs(y) > 0.25 ? Math.sign(y) * Math.min(1, Math.abs(y) * 1.25) : 0; };
/* the stick has no fixed home: it appears where the left thumb lands (left half, below the HUD) and fades back to a
   faint hint at rest. Its radius matches the CSS size; on a rotated portrait stage the touch is mapped into the
   local frame exactly as camera layout rotates it. pointer-events:none on the stick lets the document see the touch. */
{
  const el = $('stick'), knob = el.querySelector('.knob');
  const stickR = () => Math.min(290, Math.max(180, 0.52 * Math.min(window.innerWidth, window.innerHeight))) / 2;
  const toLocal = (vx, vy) => stage.classList.contains('rot') ? { x: vy, y: VH - vx } : (() => { const r = stage.getBoundingClientRect(); return { x: vx - r.left, y: vy - r.top }; })();
  const place = (x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
  const idle = () => { const r = stickR() + 16; place(r, VH - r); el.classList.remove('on'); knob.style.transform = ''; MV.sx = MV.sy = 0; setMove(); };
  let id = null, st = null;
  const upd = e => {
    if (!st) return; const R = stickR();
    let dx = (e.clientX - st.cx) / R, dy = (e.clientY - st.cy) / R;
    if (stage.classList.contains('rot')) { const t = dx; dx = dy; dy = -t; }
    const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
    st.dx = dx; st.dy = dy; st.peak = Math.max(st.peak, Math.hypot(dx, dy));
    knob.style.transform = `translate(${(dx * 60).toFixed(0)}%,${(dy * 60).toFixed(0)}%)`; MV.sx = dx; MV.sy = -dy; setMove();
  };
  const begin = e => {
    if (!TOUCH || e.pointerType === 'mouse' || $('pad').hidden || st) return;
    if (e.target.closest && e.target.closest('button,input,.ui,.result,.rec')) return;
    const p = toLocal(e.clientX, e.clientY);
    if (p.x > VW * 0.5 || p.y < ($('hud').offsetHeight || 64)) return;   // not the right hand's half, not the top HUD strip
    id = e.pointerId; place(p.x, p.y); el.classList.add('on');
    st = { cx: e.clientX, cy: e.clientY, t: G.real, peak: 0, dx: 0, dy: 0 }; upd(e); e.preventDefault();
  };
  document.addEventListener('pointerdown', begin);
  document.addEventListener('pointermove', e => { if (e.pointerId === id) upd(e); });
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, e => {
    if (e.pointerId !== id) return;
    if (st && G.real - st.t < 0.22 && st.peak > 0.6) {   // a flick
      const ax = st.dx, ay = st.dy; let d = null;
      if (Math.abs(ax) > Math.abs(ay)) d = ax < 0 ? 'lean' : null; else d = ay > 0 ? 'duck' : (P2 && P2.cur && PUNCH[P2.cur].arm === 'L' ? 'slipR' : 'slipL');
      if (d) press('dodge', d);
    }
    id = null; st = null; idle();
  });
  window.addEventListener('resize', () => { if (id === null) idle(); });
  idle();
}
/* no page sliding while fighting on a touch screen: the scene and the pad swallow every gesture. Menu screens
   (shop / creator / settings) keep their scrolling — the pad is hidden there, and they are siblings of it. */
for (const ev of ['touchmove', 'gesturestart']) document.addEventListener(ev, e => { if (TOUCH && !$('pad').hidden) e.preventDefault(); }, { passive: false });
/* a small fullscreen button in the HUD on touch; iPhones have no Fullscreen API → it stays hidden */
{ const root = document.documentElement, btn = $('fs-btn');
  const req = root.requestFullscreen || root.webkitRequestFullscreen, exit = document.exitFullscreen || document.webkitExitFullscreen;
  const inFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  if (btn) { btn.hidden = !(TOUCH && req);
    btn.addEventListener('click', e => { e.preventDefault();
      try { const p = !inFs() && req ? req.call(root) : inFs() && exit ? exit.call(document) : null; p && p.catch && p.catch(() => {}); } catch (_) {} }); }
  // a bout started by a tap goes full screen and locks landscape by itself (Android; startFight runs inside the tap)
  window.goFull = () => { if (!TOUCH || !req || inFs()) return;
    try { const p = req.call(root); p && p.then && p.then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (_) {} }).catch(() => {}); } catch (_) {} };
  // iPhone / iPad Safari has no full screen for pages: once, in the menu, tell how to put it on the Home Screen
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  let seen = false; try { seen = localStorage.getItem('bx_a2hs') === '1'; } catch (_) {}
  if (ios && !standalone && !seen) {
    const b = document.createElement('div'); b.className = 'a2hs';
    b.innerHTML = 'На весь экран: <b>Поделиться</b> → <b>На экран «Домой»</b>, и открывай игру оттуда <button type="button" aria-label="Закрыть">✕</button>';
    b.querySelector('button').addEventListener('click', () => { b.remove(); try { localStorage.setItem('bx_a2hs', '1'); } catch (_) {} });
    stage.appendChild(b);
  }
}
/* desktop: WASD / arrows walk, U I straights (top row: jab / cross), J K hooks (middle row), N M uppercuts (bottom row) —
   the same geometry as the swipes. Mouse LMB jab / RMB cross, Q E slips, C duck, Space block; W / S held at the punch
   make it a power / body shot. Physical keys (e.code): any layout works */
const MV_KEYS = { ArrowLeft: ['kx', -1], ArrowRight: ['kx', 1], KeyA: ['kx', -1], KeyD: ['kx', 1], ArrowUp: ['ky', 1], ArrowDown: ['ky', -1], KeyW: ['ky', 1], KeyS: ['ky', -1] };
const ACT_KEYS = { KeyU: ['punch', 'jab'], KeyI: ['punch', 'cross'], KeyJ: ['punch', 'hookL'], KeyK: ['punch', 'hookR'], KeyN: ['punch', 'upperL'], KeyM: ['punch', 'upperR'],
  KeyQ: ['dodge', 'slipL'], KeyE: ['dodge', 'slipR'], KeyC: ['dodge', 'duck'] };
const HELD = new Set();
const mvKeys = () => { let x = 0, y = 0; for (const c of HELD) { const m = MV_KEYS[c]; if (m) { if (m[0] === 'kx') x += m[1]; else y += m[1]; } } MV.kx = Math.sign(x); MV.ky = Math.sign(y); setMove();
  kbLit('kb-body', HELD.has('KeyS') || HELD.has('ArrowDown')); kbLit('kb-pow', HELD.has('KeyW') || HELD.has('ArrowUp')); };
const kbLit = (id, v) => { const el = $(id); el && el.classList.toggle('lit', !!v); };
window.addEventListener('keyup', e => {
  HELD.delete(e.code);
  if (e.code === 'Space') { setBlock(false); kbLit('kb-blk', false); }
  if (MV_KEYS[e.code]) mvKeys();
});
window.addEventListener('blur', () => { HELD.clear(); mvKeys(); setBlock(false); kbLit('kb-blk', false); });
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!e.repeat && introSkip()) { e.preventDefault(); return; }   // the card before a fight / the fly-round: any key skips
  if (!e.repeat && storyTalkKey(e)) { e.preventDefault(); return; }   // issue 51: a story dialog — Enter / Space is «далее», Esc skips it
  if (uiKey(e)) return;   // menu screens / pause: arrows, Enter, Esc
  const live = G.state === 'fight' || G.state === 'ko' || G.state === 'kd';
  if (e.code === 'Space' && G.state === 'fight') { e.preventDefault(); if (!e.repeat) { setBlock(true); kbLit('kb-blk', true); } return; }
  if (MV_KEYS[e.code]) { if (live || e.code.startsWith('Key')) e.preventDefault(); if (!e.repeat) { HELD.add(e.code); mvKeys(); } return; }
  if (e.repeat) return; const k = ACT_KEYS[e.code];
  if (k) { e.preventDefault(); press(k[0], k[1]); }
  else if ((e.key === 'Enter' || e.key === ' ') && G.state === 'result' && document.activeElement === document.body) (NET.role ? netRematch() : startFight());
});
stage.addEventListener('pointerdown', e => { if (!(e.target.closest && e.target.closest('button')) && introSkip()) e.preventDefault(); });   // a tap skips the card / the fly-round
// mouse punches anywhere on the ring (not on menus / buttons)
stage.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || G.paused || !(G.state === 'fight' || G.state === 'ko' || G.state === 'kd')) return;
  if (e.target.closest && e.target.closest('button,input,.ui,.result,.rec')) return;
  const n = e.button === 0 ? 'jab' : e.button === 2 ? 'cross' : null; if (!n) return;
  e.preventDefault(); press('punch', n);
});
stage.addEventListener('contextmenu', e => { if (G.state !== 'menu') e.preventDefault(); });
$('r-again').addEventListener('click', () => NET.role ? netRematch() : startFight());
$('r-menu').addEventListener('click', toMenu);
$('r-replay').addEventListener('click', startReplay);
$('skip').addEventListener('click', endReplay);
document.addEventListener('contextmenu', e => e.preventDefault());

buildTemplates().then(() => {
  P1 = new Fighter(true); const nSc = scene.children.length; P2 = new Fighter(false); P2.sceneObjs = scene.children.slice(nSc).filter(o => o !== P2.group); P1.other = P2; P2.other = P1;
  REC.N = P1.allBones.length * 4 + 5 + FACE_SHAPES.length;   // bones, hip, lids, face shape weights
  P1.place(-D_SEP / 2, Math.PI / 2, false); P2.place(D_SEP / 2, -Math.PI / 2, true);
  P1.applyLook(LOOK); buildMenu(); toMenu();
  /*DBG*/
  $('loading').hidden = true;
  tutBoot();   // (issue 45) the first-visit offer; wired after the debug block so window.__manual is set in the debug build
  netBoot();   // issue 49: the «Бой с другом» screen and the ?room= link
  requestAnimationFrame(t => { last = t; frame(t); });
}).catch(e => { console.error(e); ldText.textContent = 'Не удалось загрузить бойцов. Обнови страницу.'; ldText.className = 'err'; });
