/* ───────── training: the heavy bag. A 40 kg leather bag on a chain: punches swing it, rock it and twist it (09a_bag_rig.js:
   bagImpact, bagStep); a 45-second drill — every landed shot scores its damage, punches thrown in quick succession build a combo ───────── */
const BAG = { on: false, score: 0, hits: 0, combo: 0, best: 0, lastT: -9, mass: 40, x: null };   // the bag itself — model, chains, physics — is in 09a_bag_rig.js
function showP2(v) { if (!P2) return; P2.group.visible = v; for (const o of P2.sceneObjs || []) o.visible = v;
  if (v) { P2.handGear(); if (P2.gear.look) P2.dress(P2.gear.look); P2.sparGear(!!P2.gear.spar); }   // re-apply what the outfit hides (trunks under trousers, hair under the headgear)
  else { const g = P2.gear; if (g.gloves) { for (const gl of g.gloves) gl.g.visible = false; g.hg.visible = false; } if (g.mma) { g.mma.visible = false; for (const pd of g.mmaPads) pd.m.visible = false; } } }   // (his gear decides what of the wraps / hair shows)
function startBag() {
  G.mode = 'bag'; if (G.diff !== G.userDiff && G.userDiff) G.diff = G.userDiff;
  startFight(true); BAG.on = true; showP2(false); BAG.g.visible = true;
  BAG.x = null; Object.assign(BAG, { score: 0, hits: 0, combo: 0, best: 0, lastT: -9 }); bagReset(); BAG.setSkin(BAG.skin + 1);   // the other bag every time
  G.roundT = 45; $('n2').textContent = 'Груша'; const sl = $('st2'); if (sl) sl.textContent = 'рекорд ' + G.bagBest;
}
function bagHit(att, name, contact) {
  const P = PUNCH[name]; let dmg = P.dmg * (att.dmgMul || 1) * (1 + 0.06 * SK(att, 'pow')) * (att.sig && sigOf(name) === att.sig ? 1.12 : 1) * (att.punchK ?? 1) * (att.counterUntil > G.t ? 1.5 : 1); att.counterUntil = 0;
  const fwd = Math.sign(P2.group.position.x - att.group.position.x) || 1, dir = new V3(fwd, 0, 0);
  if (P.type === 'hook') dir.copy(_v1.set(P.arm === 'L' ? -1 : 1, 0, 0.35).transformDirection(att.group.matrixWorld)).setY(0).normalize();
  { const kn = att.knuckle(_v4); if (att.kOld) { _v3.copy(kn).sub(att.kOld).setY(0); if (_v3.lengthSq() > 1e-6) dir.lerp(_v3.normalize(), 0.5).normalize(); } }
  if (P.type === 'upper') dir.setY(0.55).normalize();   // an uppercut lifts the bag: the chains go slack for a moment
  const pos = contact || bagContact(att) || att.knuckle(new V3());
  // the bag coming onto the punch is hit harder, one going away softer (the leather's speed at the point of contact, along the punch)
  const vt = _v3.lerpVectors(BAG.topV, BAG.botV, clamp((BAG.top.y - pos.y) / (BAG.top.y - BAG.bot.y), 0, 1)).dot(dir);
  const power = clamp(dmg / 18, 0.2, 1.6), J = (14 + 22 * power) * clamp(1 - 0.3 * vt, 0.75, 1.35);   // N·s into a 40 kg bag
  bagImpact(pos, dir, J, power, P.type === 'hook' ? (P.arm === 'L' ? 1 : -1) * fwd * 0.8 * power : 0);   // (was: 1.6·power of twist for a hook, now part of it comes from where the fist lands)
  BAG.combo = G.t - BAG.lastT < 0.95 ? BAG.combo + 1 : 1; BAG.lastT = G.t; BAG.best = Math.max(BAG.best, BAG.combo);
  const pts = Math.round(dmg * (1 + 0.15 * (BAG.combo - 1))); BAG.score += pts; BAG.hits++;
  att.lastLand = G.t; att.whiff = false;
  G.hitstop = 0.01 + 0.018 * power; G.shake = Math.max(G.shake, 0.008 + 0.02 * power);
  popup(pos, BAG.combo > 1 ? `${pts} ×${BAG.combo}` : String(pts), BAG.combo >= 4 ? 'crit' : 'hit');
  if (BAG.combo === 4 || BAG.combo === 7) msg('Серия ×' + BAG.combo);
  const sl = $('st2'); if (sl) sl.textContent = 'очки ' + BAG.score;
}
function bagEnd() {
  G.state = 'result'; G.winner = P1; G.loser = P2; BAG.on = true; sfx.bell(3); $('pad').hidden = true; Q.length = 0;
  const rec = BAG.score > G.bagBest; if (rec) G.bagBest = BAG.score; const bp = (BAG.score >= 400 ? 1 : 0) + (BAG.score >= 800 ? 1 : 0); PROF.pts += bp; save();
  $('r-stats').innerHTML = ''; payShow(null);
  $('r-title').textContent = rec ? 'Рекорд!' : 'Время'; $('r-title').className = 'rt win';
  $('r-sub').textContent = `очки ${BAG.score} · попаданий ${BAG.hits} · лучшая серия ×${BAG.best} · рекорд ${G.bagBest}`;
  $('r-car').textContent = (BAG.score >= 900 ? 'Готов к титулу' : BAG.score >= 600 ? 'Боевая форма' : BAG.score >= 350 ? 'Неплохо — добавь серий' : 'Разминка') + (bp ? ` · +${bp} ${bp === 1 ? 'очко' : 'очка'} бойцу` : ' · 400+ очков дают очко бойцу');
  $('r-again').textContent = 'Ещё раз'; $('r-replay').hidden = true; $('result').hidden = false;
}
function updateMenu() {
  renderStats();
  const el = $('ladder'); if (el) el.innerHTML = LADDER.map((L, i) => `<i class="${i < G.career ? 'done' : i === G.career ? 'next' : ''}">${L.nm}${L.champ ? ' ★' : ''}</i>`).join('');
  const c = $('car-lbl'); if (c) c.textContent = G.career >= LADDER.length ? 'ты чемпион — пройти заново' : `бой ${G.career + 1}/${LADDER.length} · ${LADDER[G.career].nm} · ${careerPlace()}`;
  const f = $('fighter-lbl'); f.textContent = PROF.pts > 0 ? `свободных очков: ${PROF.pts}` : 'внешность · стиль'; f.classList.toggle('pt', PROF.pts > 0);
  $('who').innerHTML = `${esc(PROF.name || 'Боец')}${PROF.nick ? ` «${esc(PROF.nick)}»` : ''}<small>побед ${G.wins} · поражений ${G.losses}${PROF.champ ? ' · чемпион ×' + PROF.champ : ''} · ${cash(PROF.cash)}</small>`;
  const sh = $('shop-lbl'); if (sh) sh.textContent = cash(PROF.cash);
  socMenu();
  const b = $('bag-lbl'); if (b) b.textContent = G.bagBest ? 'рекорд ' + G.bagBest : '45 секунд';
}
/* the post-fight sheet (CompuBox style): punches thrown / landed, accuracy, power shots, knockdowns, damage */
function fightTable() {
  const a = P1.fs, b = P2.fs; if (!a || !b) return;
  const acc = f => f.thr ? Math.round(100 * f.land / f.thr) + '%' : '—', row = (x, l, y, hi) => `<tr><td class="${hi && x > y ? 'w' : ''}">${x}</td><td>${l}</td><td class="${hi && y > x ? 'w' : ''}">${y}</td></tr>`;
  $('r-stats').innerHTML = `<tr><td>${esc(myName())}</td><td></td><td>${esc($('n2').textContent)}</td></tr>` + row(a.land + '/' + a.thr, 'попал / выбросил', b.land + '/' + b.thr) + row(acc(a), 'точность', acc(b)) +
    row(a.pow, 'силовых', b.pow, 1) + row(a.kd, 'нокдаунов', b.kd, 1) + row(Math.round(a.dmg / DMG_K), 'урон', Math.round(b.dmg / DMG_K), 1);
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function startCareer() {
  G.mode = 'career'; G.userDiff = G.diff; const L = LADDER[Math.min(G.career, LADDER.length - 1)];
  P2.applyLook({ ...L.look, street: true });   // every man of the ladder has his own outfit, the same every time (LADDER[].look)
  AI.style = STYLES[L.st]; $('n2').textContent = L.nm + (L.champ ? ' ★' : ''); const sl = $('st2'); if (sl) sl.textContent = STYLES[L.st].label;
  G.diff = L.diff; startFight(true);
}
function startSpar() { if (G.mode === 'career') { G.diff = G.userDiff; rollOpponent(); } G.mode = 'spar'; startFight(true); }
function startQuick() { if (G.mode === 'career') { G.diff = G.userDiff; rollOpponent(); } G.mode = 'quick'; startFight(true); }
function startFight(fromMode) {
  if (fromMode !== true) { if (G.mode === 'career') return startCareer(); if (G.mode === 'bag') return startBag(); if (G.mode === 'spar') return startSpar(); }
  hintFightStart();   // control hints: the first three bouts are the learning ones (12_ui.js)
  for (const F of [P1, P2]) F.sparGear(G.mode === 'spar');
  // the opponent dresses for the place: a random street outfit outside the gym, trunks in it
  if (G.mode !== 'career') { const st = isStreet(), L = P2.gear.look || {}; if (!!L.street !== st) P2.applyLook({ ...L, ...(st ? streetLook() : { street: false, bottom: 'shorts', top: 'none', shoes: 'none', head: 'none', eyes: 'none', belt: 'none' }) }); }
  CROWD.fill = G.mode === 'career' ? LADDER[Math.min(G.career, LADDER.length - 1)].crowd ?? 1 : 1;   // the semi-final in the warehouse: a half-empty hall; the title fight: everybody came
  setLocation(G.mode === 'spar' || G.mode === 'bag' ? 'boxgym' : G.mode === 'career' ? careerLoc() : G.loc);   // sparring and the heavy bag are always in the training gym (13e_loc_boxgym.js); a career fight is where the ladder says
  G.paused = false; UI.from = null; uiShow(null);
  BAG.on = false; showP2(true); BAG.g.visible = false; { const r = $('r-replay'); if (r) r.hidden = false; const c = $('r-car'); if (c) c.textContent = ''; payShow(null); }
  sfx.unlock(); socStart();   // the hype cools down (15_social.js)
  P1.stat = PROF.stats; P1.sig = PROF.sig; P2.stat = lvlStats(G.mode === 'career' ? Math.min(5, Math.floor(G.career * 0.7)) : ({ easy: 0, normal: 1, hard: 2 })[G.diff] || 0); P2.sig = SIGS[(rr() * SIGS.length) | 0].id;
  $('n1').textContent = myName();
  P1.resetState(); P2.resetState(); P2.speed = DIFFS[G.diff].speed * (1 + 0.035 * SK(P2, 'spd')); P1.speed = 1.5 * (1 + 0.035 * SK(P1, 'spd'));
  FX.clearAir(); REC.frames.length = 0; REC.events.length = 0; wearReset(); Q.length = 0; AI.blockUntil = 0; AI.t = 1.0 + rr(); AI.combo = 0; AI.dodgeAt = 0;
  /* the intro runs on G.introT: [−card − fly, −fly) the opponent's card (career), [−fly, 0) the camera flies round the place and
     its crowd (street locations), [0, 1.25) «Готовься», then the referee's clap (the bell in the gym) starts the round */
  { const street = !LOC.ring && G.mode !== 'bag' && G.mode !== 'spar';
    G.flyT = street ? INTRO_FLY : 0; G.cardT = G.mode === 'career' ? INTRO_CARD : 0; G.flyA = INTRO_ARC[LOC.id] ?? -2.1; }
  G.stareT = G.mode !== 'bag' && OPT.cine ? STARE_LEN : 0; G.stare = 0; G.stareOn = false; G.rend = null; RP.hl = false; P1.pant = P2.pant = 0; hlReset(); show('hl', false);   // the stare-down (09b_cine.js): after the card / the fly-round, before «Готовься»
  G.state = 'intro'; G.introT = -(G.flyT + G.cardT); G.introMsg = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; ARENA.position.set(0, 0, 0); ARENA.rotation.y = 0; AI.lat = 0; AI.latT = 0;
  // BKFC: five two-minute rounds; between rounds the corner works on him (stamina, the cuts, ice on the eye); no knockout → the judges
  G.round = 1; G.roundT = ROUND_LEN; G.cards = []; G.rs0 = null; G.rd = [0, 0]; G.rkd = [0, 0]; G.cutWarn = false;
  show('result', false); show('rec', false); show('bar-t', false); show('bar-b', false); show('hud', !G.cardT); show('pad', false);
  $('diffl').textContent = DIFFS[G.diff].label.toUpperCase(); $('w1').textContent = 'побед ' + G.wins; $('w2').textContent = 'побед ' + G.losses;
  if (G.cardT) fightCard(); else show('vs', false);
  if (G.flyT) { camCut = true; if (!G.cardT) msg(LOC.label, 'place'); }
  introTick(0);
}
/* ── before the fight ── */
const INTRO_CARD = 2.8, INTRO_FLY = 2.8;   // s: the card stays up, the camera flies round
const INTRO_ARC = { yard: -2.1, tires: 2.0, parking: -1.9, warehouse: 2.2 };   // rad about the centre from the fight camera's side (+z): where the fly-round starts
/* the card of a career opponent: name and nickname, style, place, his legend; any key / tap skips it (introSkip) */
function fightCard() {
  const i = Math.min(G.career, LADDER.length - 1), L = LADDER[i];
  $('vs-k').textContent = L.champ ? `титульный бой · ${i + 1}/${LADDER.length}` : `карьера · бой ${i + 1}/${LADDER.length}`;
  $('vs-n').innerHTML = `${esc(L.name)} <b>«${esc(L.nm)}»</b>${L.champ ? ' <i>★</i>' : ''}`;
  $('vs-m').innerHTML = `<span>${STYLES[L.st].label}</span><span>${esc(careerPlace(i))}</span><span>${DIFFS[L.diff].label.toLowerCase()}</span>`;
  $('vs-l').textContent = L.legend; $('vs-h').textContent = TOUCH ? 'коснись — пропустить' : 'любая клавиша — пропустить';
  const el = $('vs'); el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
}
/* any key / tap during the card or the fly-round goes straight to the next part; true = the input was used up */
function introSkip() {
  if (G.paused) return false;
  if (G.state === 'rend' || (G.state === 'replay' && RP.hl)) return cineSkip();   // the end-of-round close-up / highlights: any key skips them
  if (G.state !== 'intro' || G.introT >= (G.stareT || 0)) return false;
  if (G.introT + G.flyT + G.cardT < 0.3) return true;   // the press that started the fight is not a skip
  G.introT = G.introT >= 0 ? G.stareT : G.cardT && G.introT < -G.flyT ? -G.flyT : 0; introTick(0); return true;   // (a skipped stare-down: the men walk back on their own)
}
function introTick(dt) {
  G.introT += dt;
  if (G.cardT && G.introT >= -G.flyT && !$('vs').hidden) { show('vs', false); show('hud', true); if (G.flyT && G.introT < 0) msg(LOC.label, 'place'); }
  const st = G.stareT || 0; stareTick(st);
  if (G.introT >= st && !G.introMsg) { G.introMsg = true; msg('Готовься'); }
  if (G.introT > st + 1.25) { G.state = 'fight'; msg('Раунд ' + G.round); roundSnd(); show('pad', true); EVT.emit('round'); }
}
// the start of a round: the referee claps his hands in a street fight, the bell rings in the gym
function roundSnd() { if (LOC.ring) sfx.bell(1); else sfx.clap(); }
function endRound() {
  if (BAG.on) return bagEnd();
  // judges: 10-9 to whoever did more, a point off for each knockdown suffered
  const a = G.rd[0], b = G.rd[1], c = [10, 10]; if (Math.abs(a - b) > 4) c[a > b ? 1 : 0] = 9; c[0] -= G.rkd[0]; c[1] -= G.rkd[1]; G.cards.push(c); G.rd = [0, 0]; G.rkd = [0, 0];
  sfx.bell(2);
  for (const F of [P1, P2]) { F.cancelPunch(); F.dodge = null; F.blocking = false; }
  const after = G.round >= ROUNDS ? decision : () => toBreak(c);
  if (!roundCine(after)) after();   // the cutscene (09b_cine.js): close-up of the faces, the round's best moments; then the corner / the judges as before
}
function toBreak(c) {
  G.state = 'break'; G.breakT = BREAK_LEN; const tot = G.cards.reduce((s, x) => [s[0] + x[0], s[1] + x[1]], [0, 0]);
  msg(`Раунд ${G.round}: ${c[0]}–${c[1]}`); $('pad').hidden = true; Q.length = 0;
  // the corner talks between rounds: one line, from what actually happened in this round
  const f = P1.fs, o = P2.fs, r0 = G.rs0 || { thr: 0, land: 0 }, thr = f.thr - r0.thr, land = f.land - r0.land; G.rs0 = { thr: f.thr, land: f.land };
  const cut = P2.flesh.wounds.some(w => w.kind === 'cut'), myCut = P1.flesh.wounds.some(w => w.kind === 'cut');
  const tip = P1.hp < 35 ? 'Угол: продержись, клинч и уходи — не размениваться' : myCut ? 'Угол: рассечение держим, не подставляй ту сторону' : cut ? 'Угол: у него рассечение — бей туда, доктор рядом'
    : thr > 8 && land / thr < 0.3 ? 'Угол: не маши впустую — уклон, потом удар' : P1.stamina < 35 ? 'Угол: дыши, бей сериями по 2–3' : P2.hp < 45 ? 'Угол: он поплыл — дави, апперкот и корпус' : c[0] < c[1] ? 'Угол: раунд за ним — больше работы, джеб в лицо' : 'Угол: так держать, руки выше';
  setTimeout(() => { if (G.state === 'break') msg(tip, 'tip'); }, 1800);
  setTimeout(() => { if (G.state === 'break') msg(`Счёт ${tot[0]}–${tot[1]}`); }, 4200);
  for (const F of [P1, P2]) { F.cancelPunch(); F.dodge = null; F.blocking = false; }
}
function corner(F, k) {   // the minute in the corner, compressed: breath back, the cutman on the cuts, ice on the eye
  F.stamina = Math.min(100, F.stamina + 55 * k); F.hp = Math.min(F.hpCap ?? 100, F.hp + 10 * k); F.daze = Math.max(0, F.daze - 0.6 * k); F.wobble = 0;
  for (const w of F.flesh.wounds) { w.sev *= 1 - 0.45 * k; w.L *= 1 - 0.7 * k; }
  const E = F.flesh.u.uEyeSw.value; E.multiplyScalar(1 - 0.15 * k); F.flesh.eyeSwell = F.flesh.eyeSwell.map(v => v * (1 - 0.15 * k));
}
function decision() {
  const t = G.cards.reduce((s, c) => [s[0] + c[0], s[1] + c[1]], [0, 0]);
  G.state = 'result'; $('pad').hidden = true;
  const win = t[0] > t[1], draw = t[0] === t[1];
  G.winner = win || draw ? P1 : P2; G.loser = G.winner.other;
  fightOver(win, draw);
  $('r-title').textContent = draw ? 'Ничья' : win ? 'Победа' : 'Поражение'; $('r-title').className = 'rt ' + (draw ? '' : win ? 'win' : 'lose');
  $('r-sub').textContent = `решение судей ${t[0]}–${t[1]} · счёт ${G.wins} : ${G.losses}`; $('result').hidden = false;
}
// a cut over the eye that keeps running into it: the referee calls time for the doctor; if it can't be controlled, the fight is stopped
function cutCheck() {
  for (const F of [P1, P2]) for (const w of F.flesh.wounds) {
    if (w.kind !== 'cut' || w.sev < 0.85) continue;
    const near = Math.min(w.p.distanceTo(F.flesh.u.uEyeL.value), w.p.distanceTo(F.flesh.u.uEyeR.value)) / F.flesh.U; if (near > 0.045) continue;
    if (!F.cutLook) { F.cutLook = true; msg('Врач смотрит рассечение'); G.state = 'break'; G.breakT = 3.5; G.doc = true; corner(F, 0.35); return; }
    if (w.sev > 0.97) { const A = F.other; F.ko = true; G.state = 'result'; G.winner = A; G.loser = F; fightOver(A === P1, false, 'tko'); $('pad').hidden = true;
      $('r-title').textContent = A === P1 ? 'Победа' : 'Поражение'; $('r-title').className = 'rt ' + (A === P1 ? 'win' : 'lose');
      $('r-sub').textContent = `остановлено врачом: рассечение · счёт ${G.wins} : ${G.losses}`; $('result').hidden = false; msg('Стоп! Рассечение', 'ko'); return; }
  }
}
function stateTick(dtReal) {
  hlTick();
  if (G.state === 'intro') introTick(dtReal);
  else if (G.state === 'rend') rendTick(dtReal);
  else if (G.state === 'fight') {
    G.roundT -= dtReal * G.slow; if (G.roundT <= 0) return endRound();
    if ((G.cutT = (G.cutT || 0) + dtReal) > 0.5) { G.cutT = 0; cutCheck(); }
  }
  else if (G.state === 'break') {
    G.breakT -= dtReal; if (!G.doc) for (const F of [P1, P2]) corner(F, dtReal / BREAK_LEN);
    if (G.breakT <= 0) { if (!G.doc) { G.round++; G.roundT = ROUND_LEN; for (const F of [P1, P2]) if (F.mark) { F.adv = 0; F.advV = 0; } } G.doc = false;
      G.state = 'fight'; msg(G.round > 1 && G.roundT === ROUND_LEN ? 'Раунд ' + G.round : 'Бой!'); roundSnd(); show('pad', true); EVT.emit('round'); }
  }
  else if (G.state === 'ko') {
    if (!G.fallSnd && G.loser.headNow.y < 0.3) { G.fallSnd = true; sfx.fall(); G.shake = Math.max(G.shake, 0.03); }
    if (G.t > G.koT + 2.3) startReplay();
  }
}

