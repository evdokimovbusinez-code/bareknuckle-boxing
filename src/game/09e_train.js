/* ───────── training mini-games: the shared shell (issue 50) ─────────
   One loop for the jump rope and the focus mitts: a one-line rules splash → 3-2-1 → a 30…45 s drill →
   the result card (score, grade C/B/A/S, «+N к характеристике», the best result) → «Ещё раз» / «В меню».
   Both games describe their drill as a sorted array of beats { t, action, glyph, win, ... }; this file owns the
   clock, the ±window resolution, the HUD, the grade and the reward. The games own the 3D, the poses and the
   reaction to a hit / a miss (09f_rope.js, 09g_mitts.js). The heavy bag (09_bag.js) shares only the reward.

   Reward: PROF.xp = { pow, spd, chin, sta }; every 100 XP raises the matching PROF.stats by 1 (same cap of 5
   as renderStats). One full reward per drill per real day; a repeat the same day pays 25% (anti-farming).
   PROF is serialised whole by save() in 07, so xp / train survive a reload without any new save code. */
if (!PROF.xp || typeof PROF.xp !== 'object') PROF.xp = {};
for (const k of ['pow', 'spd', 'chin', 'sta']) PROF.xp[k] = Math.max(0, (PROF.xp[k] | 0) || 0);
if (!PROF.train || typeof PROF.train !== 'object') PROF.train = {};
if (!PROF.train.done || typeof PROF.train.done !== 'object') PROF.train.done = {};
if (!PROF.train.best || typeof PROF.train.best !== 'object') PROF.train.best = {};
if (typeof PROF.train.day !== 'string') PROF.train.day = '';

const TRAIN_XP_MAX = 100, TRAIN_STAT_CAP = 5;
const TRAIN_STAT = { pow: 'силе', spd: 'скорости', chin: 'челюсти', sta: 'дыхалке' };
const TRAIN_XP_BASE = { S: 60, A: 45, B: 30, C: 18 };
const TRAIN_DEF = {
  rope: {
    id: 'rope', title: 'Скакалка', dur: 35, stats: ['sta', 'spd'], window: 0.09, lead: 0.55,
    rules: 'Прыгай в момент, когда скакалка проходит под ногами. Темп растёт с 100 до 150 ударов в минуту.',
    keys: 'Пробел или тап по экрану — прыжок · ← → или левая/правая половина — бег на месте · двойной проворот — два быстрых тапа.',
    hud: 'пробел / тап — прыжок · ← → — бег · два тапа — двойной проворот',
    reset: ropeReset, hit: ropeHit, miss: ropeMiss, frame: ropeFrame, enter: ropeEnter, leave: ropeLeave, aim: null
  },
  mitts: {
    id: 'mitts', title: 'Лапы', dur: 40, stats: ['spd', 'pow'], window: 0.12, lead: 0.5,
    rules: 'Тренер называет комбинацию и подставляет лапы. Повтори удары в нужном порядке и вовремя.',
    keys: 'U I J K N M — джеб, кросс, хуки, апперкоты · на телефоне — свайп по экрану, как в бою.',
    hud: 'U I J K N M — удары · свайп на телефоне · бей по лапе в ритм',
    reset: tmMittsReset, hit: tmMittsHit, miss: tmMittsMiss, frame: tmMittsFrame, enter: tmMittsEnter, leave: tmMittsLeave, aim: tmMittsAim
  }
};
const TRAIN = {
  on: false, game: null, def: null, phase: 'idle',   // 'rules' | 'count' | 'play' | 'result'
  t: 0, i: 0, beats: [], window: 0.09, lead: 0.55, count: 3,
  hits: 0, misses: 0, score: 0, combo: 0, bestCombo: 0,
  fb: '', fbT: 0, res: null
};

/* local calendar day, so «one reward a day» does not depend on the browser locale */
function trainDay() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function trainDayRoll() { if (PROF.train.day !== trainDay()) { PROF.train.day = trainDay(); PROF.train.done = {}; } }
function trainRepeatHint(id) { trainDayRoll(); return !!PROF.train.done[id]; }
function trainGrade(acc) { return acc >= 0.94 ? 'S' : acc >= 0.80 ? 'A' : acc >= 0.60 ? 'B' : 'C'; }
function trainBagGrade(score) { return score >= 900 ? 'S' : score >= 600 ? 'A' : score >= 350 ? 'B' : 'C'; }

/* pay out the drill: add XP to each of its stats, turn every 100 XP into +1 (capped at 5), record the best
   score and persist. Also used by bagEnd() in 09_bag.js (the bag has no beats, only a score). */
function trainAward(id, grade, score) {
  trainDayRoll();
  const repeat = !!PROF.train.done[id];
  const gain = Math.max(1, Math.round((TRAIN_XP_BASE[grade] || 18) * (repeat ? 0.25 : 1)));
  PROF.train.done[id] = true;
  const def = TRAIN_DEF[id] || { stats: ['pow'] }, ups = [];
  for (const s of def.stats) {
    let x = (PROF.xp[s] || 0) + gain;
    while (x >= TRAIN_XP_MAX && (PROF.stats[s] || 0) < TRAIN_STAT_CAP) { x -= TRAIN_XP_MAX; PROF.stats[s] = (PROF.stats[s] || 0) + 1; ups.push(s); }
    if ((PROF.stats[s] || 0) >= TRAIN_STAT_CAP) x = Math.min(x, TRAIN_XP_MAX - 1);   // nothing left to buy
    PROF.xp[s] = x;
  }
  const rec = score > (PROF.train.best[id] || 0);
  if (rec) PROF.train.best[id] = score;
  save();
  return { id, grade, gain, repeat, ups, score, best: PROF.train.best[id] || 0, rec };
}
function trainRewardLine(aw) {
  const def = TRAIN_DEF[aw.id] || { stats: ['pow'] };
  let t = '+' + aw.gain + ' к ' + def.stats.map(s => TRAIN_STAT[s]).join(' и ');
  if (aw.ups.length) t += ' · ' + aw.ups.map(s => '+1 ' + (STATS.find(S => S.id === s) || { label: s }).label).join(', ');
  if (aw.repeat) t += ' · повтор (25%)';
  return t;
}

/* ── shell: entering, leaving, the three phases ── */
function trainStart(id) {
  const d = TRAIN_DEF[id]; if (!d || !P1 || !P2) return;
  if (TRAIN.on) trainLeave();                     // «Ещё раз» from a previous drill: clean up first
  const T = TRAIN;
  T.on = true; T.game = id; T.def = d; T.phase = 'rules';
  T.t = 0; T.i = 0; T.beats = []; T.window = d.window; T.lead = d.lead;
  T.hits = T.misses = T.score = T.combo = T.bestCombo = 0; T.fb = ''; T.fbT = 0; T.res = null;
  G.mode = 'train'; G.state = 'train'; G.paused = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; G.shake = 0;
  G.stareOn = false; G.stare = 0; G.rend = null; RP.hl = false;
  BAG.on = false; if (BAG.g) BAG.g.visible = false;
  setLocation('boxgym'); uiShow(null);
  for (const s of ['hud', 'pad', 'vs', 'result', 'rec', 'bar-t', 'bar-b', 'hl']) show(s, false);
  P1.stat = PROF.stats;
  sfx.unlock(); camCut = true;
  d.enter();
  trainUI();
}
function trainLeave() {
  const T = TRAIN; if (!T.on) return;
  if (T.def && T.def.leave) T.def.leave();
  T.on = false; T.phase = 'idle';
  const root = $('train'); if (root) root.hidden = true;
}
function trainQuit() { if (!TRAIN.on) return; trainLeave(); toMenu(); }
function trainCountdown() {
  const T = TRAIN; if (!T.on || T.phase !== 'rules') return;
  T.phase = 'count'; T.t = 0; T.count = 3; sfx.unlock(); sfx.ping(); trainUI(); trainHud();
}
function trainBeginPlay() {
  const T = TRAIN, d = T.def;
  T.phase = 'play'; T.t = 0; T.i = 0; T.beats = [];
  T.hits = T.misses = T.score = T.combo = T.bestCombo = 0;
  T.fb = ''; T.fbT = 0; T.res = null;
  d.reset(T);                                   // the game fills T.beats, already sorted by t
  trainUI();
}
function trainAgain() { const id = TRAIN.game; trainStart(id); trainCountdown(); }

function trainTick(dt) {
  const T = TRAIN; if (!T.on || dt <= 0) return;
  if (T.phase === 'count') {
    T.t += dt;
    const n = 3 - Math.floor(T.t);
    if (n !== T.count && n > 0) { T.count = n; sfx.ping(); }
    trainHud();
    if (T.t >= 3) { trainBeginPlay(); sfx.clap(); }
    return;
  }
  if (T.phase !== 'play') return;              // rules / result are click-driven only
  T.t += dt;
  if (T.fbT > 0 && (T.fbT -= dt) <= 0) T.fb = '';
  const w = (b) => b.win || T.window;
  while (T.i < T.beats.length && T.t > T.beats[T.i].t + w(T.beats[T.i])) trainMiss(T.beats[T.i], null);
  if (T.t >= T.def.dur) { trainFinish(); return; }
  trainHud();
}
/* the single input funnel: real keys, pointer taps / swipes and the emulation all arrive here */
function trainInput(action) {
  const T = TRAIN; if (!T.on) return false;
  if (T.phase === 'rules') { if (action === 'start' || action === 'ok' || action === 'jump') trainCountdown(); return true; }
  if (T.phase === 'result') { if (action === 'again' || action === 'ok' || action === 'jump') trainAgain(); return true; }
  if (T.phase !== 'play') return true;         // the countdown swallows input
  const b = T.beats[T.i]; if (!b) return true;
  const w = b.win || T.window, off = Math.abs(T.t - b.t);
  if (off <= w && action === b.action) trainHit(b, off, w);
  else trainMiss(b, action);                   // wrong punch / too early / too late: the combo resets
  return true;
}
function trainHit(b, off, w) {
  const T = TRAIN; T.i++; T.hits++; T.combo++; T.bestCombo = Math.max(T.bestCombo, T.combo);
  const perfect = off <= w * 0.42;
  T.score += (perfect ? 100 : 60) + Math.min(T.combo, 20) * 5;
  T.fb = perfect ? 'Отлично!' : 'Хорошо'; T.fbT = 0.5;
  if (T.def.hit) T.def.hit(b, perfect);
  if (perfect) sfx.ping(); else sfx.clap();
}
function trainMiss(b, action) {
  const T = TRAIN; T.i++; T.misses++; T.combo = 0;
  T.fb = 'Мимо'; T.fbT = 0.5;
  if (T.def.miss) T.def.miss(b, action);
  sfx.whoosh(0.45);
}
function trainFinish() {
  const T = TRAIN, total = T.hits + T.misses;
  const acc = total ? T.hits / total : 0, grade = trainGrade(acc);
  T.res = trainAward(T.game, grade, T.score);
  T.res.acc = acc; T.res.hits = T.hits; T.res.misses = T.misses; T.res.bestCombo = T.bestCombo;
  T.phase = 'result'; sfx.bell(2); trainUI();
}

/* ── the HUD: three readouts, a shrinking rhythm ring, the called combo, feedback, the countdown ── */
function trainUI() {
  const T = TRAIN, root = $('train'); if (!root) return;
  root.hidden = false;
  const p = T.phase, rules = p === 'rules', count = p === 'count', play = p === 'play', res = p === 'result';
  $('tr-rules').hidden = !rules; $('tr-res').hidden = !res;
  $('tr-top').hidden = !play; $('tr-mid').hidden = !play;
  $('tr-bot').hidden = !play && !count; $('tr-count').hidden = !count;
  $('tr-combo-hint').hidden = !(play && T.game === 'mitts');
  if (rules) {
    const d = T.def;
    $('tr-r-title').textContent = d.title;
    $('tr-r-h').textContent = d.rules;
    $('tr-r-keys').textContent = d.keys;
    $('tr-r-reward').textContent = 'Награда: ' + d.stats.map(s => (STATS.find(S => S.id === s) || { label: s }).label).join(' + ') +
      ' · +1 за каждые 100 опыта' + (trainRepeatHint(d.id) ? ' · сегодня повтор: 25%' : '');
  }
  if (res && T.res) {
    const r = T.res;
    $('tr-res-title').textContent = T.def.title;
    $('tr-grade').textContent = r.grade; $('tr-grade').className = 'tr-grade ' + r.grade.toLowerCase();
    $('tr-res-score').innerHTML = `очки <b>${T.score}</b> · точность <b>${Math.round(r.acc * 100)}%</b> · попаданий <b>${T.hits}</b> · промахов <b>${T.misses}</b> · серия <b>×${T.bestCombo}</b>`;
    $('tr-res-gain').textContent = trainRewardLine(r);
    $('tr-res-best').textContent = (r.rec ? 'новый рекорд: ' : 'лучший результат: ') + r.best + ' очков';
  }
  trainHud();
}
function trainHud() {
  const T = TRAIN; if (!T.on) return;
  if (T.phase === 'count') { $('tr-count').textContent = String(Math.max(1, 3 - Math.floor(T.t))); return; }
  if (T.phase !== 'play') return;
  $('tr-score').textContent = String(T.score);
  $('tr-combo').textContent = '×' + T.combo;
  $('tr-time').textContent = String(Math.max(0, Math.ceil(T.def.dur - T.t)));
  $('tr-hint').textContent = T.def.hud || '';
  const b = T.beats[T.i], ring = $('tr-ring');
  if (!b) ring.classList.remove('on');
  else {
    const until = b.t - T.t, k = clamp(until / T.lead, 0, 1);
    $('tr-ring-i').style.transform = 'scale(' + (0.3 + 0.7 * k).toFixed(3) + ')';
    ring.classList.toggle('hot', Math.abs(until) <= (b.win || T.window));
    ring.classList.add('on');
    $('tr-glyph').textContent = b.glyph || '⤴';
  }
  const ch = $('tr-combo-hint');
  if (T.game === 'mitts' && b && b.combo) {
    ch.innerHTML = b.combo.map((c, j) => `<i class="${j < b.seq ? 'on' : ''}">${c.label}</i>`).join('');
    ch.hidden = false;
  } else ch.hidden = true;
  const fb = $('tr-fb'); fb.textContent = T.fb; fb.classList.toggle('on', !!T.fb);
}

/* ── the two hooks in frame() (11_arena_loop.js) ── */
function trainAim() { return TRAIN.on && TRAIN.def && TRAIN.def.aim ? TRAIN.def.aim() : null; }
function trainFrame(dt) { if (TRAIN.on && TRAIN.def && TRAIN.def.frame) TRAIN.def.frame(dt, TRAIN); }

/* ── keyboard + pointer. trainKey is called from 12_ui.js before uiKey, so a training screen owns every key ── */
function trainKey(e) {
  const T = TRAIN; if (!T.on) return false;
  if (e.repeat) return true;
  e.preventDefault();
  if (e.key === 'Escape') { trainQuit(); return true; }
  if (T.phase === 'rules') { if (e.key === 'Enter' || e.key === ' ') trainCountdown(); return true; }
  if (T.phase === 'result') { if (e.key === 'Enter' || e.key === ' ') trainAgain(); return true; }
  if (T.phase !== 'play') return true;
  if (T.game === 'rope') {
    if (e.code === 'Space' || e.key === ' ') trainInput('jump');
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') trainInput('left');
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') trainInput('right');
  } else if (T.game === 'mitts') {
    const k = ACT_KEYS[e.code]; if (k && k[0] === 'punch') trainInput(k[1]);
  }
  return true;
}
function trainPointerRope(e) {
  const T = TRAIN, b = T.beats[T.i];
  const run = b && (b.action === 'left' || b.action === 'right');
  if (!run) { trainInput('jump'); return; }
  if (stage.classList.contains('rot')) trainInput(e.clientY < window.innerHeight / 2 ? 'left' : 'right');
  else trainInput(e.clientX < window.innerWidth / 2 ? 'left' : 'right');
}
function trainBoot() {
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  on('go-rope', () => trainStart('rope')); on('go-mitts', () => trainStart('mitts'));
  on('tr-start', trainCountdown); on('tr-again', trainAgain);
  on('tr-r-menu', trainQuit); on('tr-res-menu', trainQuit); on('tr-quit', trainQuit);
  let g = null;
  stage.addEventListener('pointerdown', e => {
    const T = TRAIN; if (!T.on) return;
    if (e.target.closest && e.target.closest('button, .tr-card')) return;
    if (T.phase === 'rules') { trainCountdown(); return; }
    if (T.phase === 'result') { trainAgain(); return; }
    if (T.phase !== 'play') return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
    if (T.game === 'rope') { trainPointerRope(e); g.fired = true; }
  });
  stage.addEventListener('pointermove', e => {
    const T = TRAIN; if (!T.on || !g || e.pointerId !== g.id || g.fired || T.phase !== 'play' || T.game !== 'mitts') return;
    let dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (stage.classList.contains('rot')) { const q = dx; dx = dy; dy = -q; }
    if (Math.hypot(dx, dy) > 24) { const n = punchFromSwipe(dx, dy); if (n) trainInput(n); g.fired = true; }
  });
  stage.addEventListener('pointerup', e => {
    const T = TRAIN;
    if (T.on && g && e.pointerId === g.id && !g.fired && T.phase === 'play' && T.game === 'mitts') trainInput('jab');
    g = null;
  });
}
trainBoot();

/* ── debug / emulation API ──
   play(id, 'perfect'|'miss') runs a whole drill through trainTick + trainInput (the same funnels the keys use),
   without waiting for the wall clock — used by tools/train_test.py and by the screenshot scenarios. */
function trainPlay(id, mode) {
  trainStart(id); trainBeginPlay();
  const T = TRAIN, dt = 1 / 60; let guard = 0;
  while (T.phase === 'play' && guard++ < 20000) {
    const b = T.beats[T.i];
    if (mode === 'perfect' && b && T.t + dt >= b.t) { T.t = b.t; trainInput(b.action); }
    trainTick(dt);
  }
  return { grade: T.res && T.res.grade, hits: T.hits, misses: T.misses, score: T.score,
    gain: T.res && T.res.gain, xp: { ...PROF.xp }, stats: { ...PROF.stats } };
}
window.__train = {
  start: trainStart, countdown: trainCountdown, quit: trainQuit, again: trainAgain,
  press: a => trainInput(a), play: trainPlay, boot: trainBoot,
  state: () => ({ on: TRAIN.on, phase: TRAIN.phase, game: TRAIN.game, t: TRAIN.t, i: TRAIN.i,
    beats: TRAIN.beats.length, hits: TRAIN.hits, misses: TRAIN.misses, score: TRAIN.score,
    combo: TRAIN.combo, grade: TRAIN.res && TRAIN.res.grade, res: TRAIN.res,
    next: TRAIN.beats[TRAIN.i] && { t: TRAIN.beats[TRAIN.i].t, action: TRAIN.beats[TRAIN.i].action } }),
  prof: () => ({ xp: { ...PROF.xp }, stats: { ...PROF.stats }, train: JSON.parse(JSON.stringify(PROF.train)) }),
  defs: TRAIN_DEF, award: trainAward, rewardLine: trainRewardLine
};
