/* ───────── issue 45: the beginner's tutorial — a short sparring lesson in the gym ─────────
   One module-scope state (TUT), ten counted steps + a final «Готово!» card (step 11).
   The hooks in the rest of the game are deliberately tiny:
     · ctlLog / press (12_ui.js) call tutAct — the exact place window.__ctl.last is written, so punches
       and dodges are recognised from the real input pipeline, with no duplicated input logic here;
     · resolveHit (07) returns early → no damage, cuts or KO while teaching;
     · ai() (08) returns early → the partner stands and waits, except the three slow block-step punches;
     · stateTick (09_bag.js) calls tutTick → per-step checks, fresh stamina, the round never ends;
     · toMenu() (08), buildMenu / uiKey (14) and boot (12) start / leave / gate the lesson.
   Everything is timed on G.real (not setTimeout): __tick() advances it, wall-clock timers would not. */
const TUT_KEY = 'bx_tutorial';
const TUT = {
  step: 0, count: 0, doneAt: -1, move: 0, got: {}, combo: [],
  blockAt: -1, blockI: 0, p2speed: 1.5, prevMode: 'quick',
};
/* h = the big hint, k = PC keys, g = the touch gesture, need = how many times the action must be done.
   punch = one name; alt = one of each; mod = 'body' / 'pow' as read by punchMod(); combo = a sequence
   thrown within `within` seconds; block / dodge / approach are checked in tutTick / tutAct. */
const TUT_STEPS = [
  { key: 'approach', h: 'Подойди к партнёру', k: 'Клавиши: <b>D</b> / <b>→</b> вперёд', g: 'Тач: стик <b>→</b> к партнёру', need: 1 },
  { key: 'jab',    h: 'Джеб ×3',   k: 'Клавиши: <b>U</b> или ЛКМ',          g: 'Тач: свайп <b>↖</b> или тап',   need: 3, punch: 'jab' },
  { key: 'cross',  h: 'Кросс ×3',  k: 'Клавиши: <b>I</b> или ПКМ',          g: 'Тач: свайп <b>↗</b>',           need: 3, punch: 'cross' },
  { key: 'hooks',  h: 'Хуки: левый и правый',      k: 'Клавиши: <b>J</b> и <b>K</b>', g: 'Тач: свайп <b>←</b> и <b>→</b>', need: 2, alt: ['hookL', 'hookR'] },
  { key: 'uppers', h: 'Апперкоты: левый и правый', k: 'Клавиши: <b>N</b> и <b>M</b>', g: 'Тач: свайп <b>↙</b> и <b>↘</b>', need: 2, alt: ['upperL', 'upperR'] },
  { key: 'body',   h: 'Удар в корпус ×2', k: 'Клавиши: зажать <b>S</b> + удар', g: 'Тач: стик <b>вниз</b> + удар',  need: 2, mod: 'body' },
  { key: 'power',  h: 'Силовой удар ×2', k: 'Клавиши: зажать <b>W</b> + удар', g: 'Тач: стик <b>вверх</b> + удар', need: 2, mod: 'pow' },
  { key: 'combo',  h: 'Комбинация 1–2–3', k: 'Клавиши: <b>U → I → J</b>', g: 'Тач: джеб → кросс → хук', need: 1, combo: ['jab', 'cross', 'hook'], within: 1.5 },
  { key: 'block',  h: 'Блок: 3 медленных удара', k: 'Клавиши: держать <b>ПРОБЕЛ</b>', g: 'Тач: держать <b>БЛОК</b>', need: 3, block: true },
  { key: 'dodge',  h: 'Уклон ×2', k: 'Клавиши: <b>Q</b> / <b>E</b> / <b>C</b>', g: 'Тач: рывок стика', need: 2, dodge: true },
];
function tutSeen() { try { return localStorage.getItem(TUT_KEY) === '1'; } catch (_) { return false; } }
function tutSeenSet() { try { localStorage.setItem(TUT_KEY, '1'); } catch (_) {} }

/* first-entry offer: a flag in localStorage (try/catch). The debug build never shows it automatically
   (a fresh Playwright context has empty storage), so shot.sh scenarios stay clean — call __tut.offer(). */
function tutOffer() { window.__tutAsk = true; $('tut-ask').hidden = false; if (!TOUCH) { const b = $('tut-yes'); b && b.focus({ preventScroll: true }); } }
function tutAccept() { window.__tutAsk = false; $('tut-ask').hidden = true; tutStart(); }
function tutDecline() { tutSeenSet(); window.__tutAsk = false; $('tut-ask').hidden = true; msg('Обучение — в «Тренировке»', 'tip'); }

/* ─── start / stop: a live sparring state in the gym, but with the AI and damage switched off ─── */
function tutStart() {
  if (window.__tutOn) return;
  tutSeenSet();
  window.__tutAsk = false; $('tut-ask').hidden = true;
  TUT.prevMode = G.mode; TUT.p2speed = P2.speed;
  G.mode = 'spar';
  uiShow(null);
  P1.sparGear(true); P2.sparGear(true); showP2(true); BAG.on = false; BAG.g.visible = false;
  CROWD.fill = 1;
  setLocation('boxgym'); sfx.unlock();
  P1.stat = PROF.stats; P2.stat = lvlStats(0); P1.sig = PROF.sig; P2.sig = null;
  $('n1').textContent = myName(); $('n2').textContent = 'Партнёр'; const sl = $('st2'); if (sl) sl.textContent = 'стоит и ждёт';
  P1.resetState(); P2.resetState(); P1.speed = 1.5; P2.speed = 1;
  Q.length = 0; HELD.clear(); MV.kx = MV.ky = MV.sx = MV.sy = 0; setMove(); setBlock(false);
  Object.assign(AI, { blockUntil: 0, t: 9, combo: 0, dodgeAt: 0, backT: 0, lat: 0, latT: 0, seen: -1, feintAt: 0, gestT: 5 });
  AI.style = STYLES.brawler;
  ARENA.position.set(0, 0, 0); ARENA.rotation.y = 0;
  G.state = 'fight'; G.paused = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; G.shake = 0;
  G.round = 1; G.roundT = ROUND_LEN; G.cards = []; G.rs0 = null; G.rd = [0, 0]; G.rkd = [0, 0];
  G.stareT = 0; G.flyT = 0; G.introT = 0; G.stareOn = false; G.stare = 0; G.rend = null; RP.hl = false;
  show('result', false); show('vs', false); show('rec', false); show('bar-t', false); show('bar-b', false);
  show('hud', false); show('pad', true); show('hl', false);   // no health bars / bell while teaching, but the touch pad stays up
  REC.frames.length = 0; REC.events.length = 0; wearReset(); FX.clearAir();
  $('tut').hidden = false; $('tut-end').hidden = true; $('tut').classList.remove('done');
  window.__tutOn = true;
  TUT.step = 0; TUT.count = 0; TUT.doneAt = -1;
  tutStepEnter();
}
function tutEnd() {
  if (!window.__tutOn) return;
  window.__tutOn = false; window.__tutAsk = false;
  $('tut').hidden = true; $('tut-end').hidden = true; $('tut-ask').hidden = true;
  $('tut').classList.remove('done');
  setBlock(false);
  for (const F of [P1, P2]) F.cancelPunch();
  P2.speed = TUT.p2speed; G.mode = TUT.prevMode;
  P1.moveDir = P1.moveLat = 0; MV.kx = MV.ky = MV.sx = MV.sy = 0; setMove();
  HELD.clear(); Q.length = 0;
}

/* ─── the hint bar ─── */
function tutStepEnter() {
  const S = TUT_STEPS[TUT.step]; if (!S) return;
  TUT.count = 0; TUT.doneAt = -1; TUT.move = 0; TUT.got = {}; TUT.combo = []; TUT.blockI = 0;
  $('tut').classList.remove('done');
  if (S.block) { TUT.blockAt = G.real + 1.0; P2.speed = 0.55; } else P2.speed = 1;   // slow partner punches on the block step
  $('tut').hidden = false; $('tut-end').hidden = true;
  tutRender();
}
function tutRender() {
  const S = TUT_STEPS[TUT.step]; if (!S) return;
  $('tut-n').textContent = `Шаг ${TUT.step + 1} / ${TUT_STEPS.length + 1}`;   // step 11 is the «Готово!» card
  $('tut-h').textContent = S.h;
  $('tut-k').innerHTML = S.k; $('tut-g').innerHTML = S.g;
  $('tut-k').className = 'tut-chip' + (TOUCH ? '' : ' prim');   // both are always shown; the platform's own one is bright
  $('tut-g').className = 'tut-chip' + (TOUCH ? ' prim' : '');
  tutRenderProgress();
}
function tutRenderProgress() {
  const S = TUT_STEPS[TUT.step]; if (!S) return;
  $('tut-p').innerHTML = `сделано <b>${TUT.count} / ${S.need}</b>${TUT.count ? ' ✓' : ''}`;
}
function tutFlash() { const e = $('tut-ok'); e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); }
function tutCount() {
  const S = TUT_STEPS[TUT.step]; if (!S || TUT.doneAt >= 0) return;
  TUT.count++; sfx.ping(); tutRenderProgress();
  if (TUT.count >= S.need) tutComplete();
}
function tutComplete() {   // the checkmark + a short sound, then a 0.7 s beat before the next step
  TUT.doneAt = G.real; sfx.ping(); tutFlash();
  $('tut').classList.add('done'); $('tut-p').textContent = '✓ Готово!';
}
function tutSkip() {
  if (!window.__tutOn || TUT.doneAt >= 0) return;
  const S = TUT_STEPS[TUT.step]; if (!S) return;
  TUT.count = S.need; sfx.ping(); tutComplete();
}
function tutNext() {
  TUT.step++;
  if (TUT.step >= TUT_STEPS.length) { tutFinal(); return; }
  tutStepEnter();
}
function tutFinal() { $('tut').hidden = true; $('tut-end').hidden = false; TUT.step = TUT_STEPS.length; sfx.bell(1); }

/* ─── recognition: called from ctlLog (punches) and press (dodges) in 12_ui.js ─── */
function tutAct(type, name, body, pow) {
  if (!window.__tutOn || TUT.doneAt >= 0) return;
  const S = TUT_STEPS[TUT.step]; if (!S) return;
  if (type === 'dodge') { if (S.dodge) tutCount(); return; }
  if (S.alt) { if (S.alt.includes(name) && !TUT.got[name]) { TUT.got[name] = 1; tutCount(); } return; }
  if (S.mod) { if (S.mod === 'body' ? body : pow) tutCount(); return; }
  if (S.combo) {
    const now = G.real, w = S.within || 1.5;
    TUT.combo.push({ name, t: now });
    while (TUT.combo.length && now - TUT.combo[0].t > w) TUT.combo.shift();
    const seq = S.combo;
    if (TUT.combo.length >= seq.length) {
      const tail = TUT.combo.slice(-seq.length);
      if (seq.every((v, i) => v === 'hook' ? (tail[i].name === 'hookL' || tail[i].name === 'hookR') : tail[i].name === v)) { tutCount(); TUT.combo = []; }
    }
    return;
  }
  if (S.punch && name === S.punch) tutCount();
}

/* ─── per-frame: fresh breath, the bell never rings, the partner's slow block-step punches ─── */
function tutTick(dt) {
  if (!window.__tutOn) return;
  P1.stamina = 100; P2.stamina = 100;                 // the lesson costs no stamina
  if (G.roundT < 60) G.roundT = ROUND_LEN;             // a lesson never ends on the bell
  if (TUT.doneAt >= 0) { if (G.real - TUT.doneAt >= 0.7) tutNext(); return; }
  const S = TUT_STEPS[TUT.step]; if (!S) return;
  if (S.key === 'approach') {
    const fwd = Math.sign(P2.group.position.x - P1.group.position.x) || 1;
    if ((P1.moveDir || 0) * fwd > 0.25) { TUT.move += dt; if (TUT.move >= 0.45) tutCount(); }
  } else if (S.block && TUT.blockI < S.need && G.real >= TUT.blockAt) {
    // one slow punch at a time; holding the guard when it is thrown counts it
    P2.cancelPunch(); P2.wantBody = false; P2.powerNext = false;
    P2.startPunch(TUT.blockI % 2 ? 'cross' : 'jab'); sfx.whoosh(0.6);
    const ok = !!P1.blocking;
    if (ok) { TUT.blockI++; tutCount(); }
    TUT.blockAt = G.real + (ok ? 1.2 : 0.55);         // not blocking → re-prompt sooner, don't stall
  }
}

/* boot: wire the offer / hint / final buttons, then offer the lesson on the very first visit */
function tutBoot() {
  const on = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
  on('tut-yes', tutAccept); on('tut-no', tutDecline);
  on('tut-skip', tutSkip);
  on('tut-exit', () => { tutEnd(); toMenu(); });
  on('tut-go', () => { tutEnd(); startQuick(); });
  on('tut-menu', () => { tutEnd(); toMenu(); });
  if (!window.__manual && !tutSeen()) tutOffer();
}

/* debug / tests: state + the exact variables the real keys, stick and buttons write (tools/tut_test.py) */
window.__tut = {
  start: tutStart, end: tutEnd, offer: tutOffer, accept: tutAccept, decline: tutDecline, skip: tutSkip, next: tutNext,
  on: () => !!window.__tutOn,
  seen: tutSeen, resetSeen: () => { try { localStorage.removeItem(TUT_KEY); } catch (_) {} },
  state: () => { const S = TUT_STEPS[TUT.step]; return { step: TUT.step, count: TUT.count, done: TUT.doneAt >= 0, need: S ? S.need : 0, key: S ? S.key : 'final', h: S ? S.h : 'Готово!' }; },
  walk: v => { if (P1) P1.moveDir = v; },
  stick: y => { MV.sy = y; MV.sx = 0; },
  block: v => setBlock(v),
  dodge: n => press('dodge', n),
};
