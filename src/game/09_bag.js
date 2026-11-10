/* ───────── training: the heavy bag. A 40 kg leather bag on a chain: punches swing it (pendulum about the hook, ~0.45 Hz) and
   twist it (hooks); a 45-second drill — every landed shot scores its damage, punches thrown in quick succession build a combo ───────── */
const BAG = { on: false, th: new V3(), om: new V3(), yaw: 0, yawV: 0, sq: 0, score: 0, hits: 0, combo: 0, best: 0, lastT: -9, L: 1.45, mass: 40 };
{
  const g = BAG.g = new THREE.Group(), leather = new THREE.MeshPhysicalMaterial({ color: '#4a1714', roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: new THREE.Color('#ff9a8a') });
  const strap = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.6, metalness: 0.2 }), chainM = new THREE.MeshStandardMaterial({ color: '#8a8f99', roughness: 0.35, metalness: 0.9 });
  const body = BAG.body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.18, 1.1, 28, 6), leather); body.position.y = -1.45; body.castShadow = true; g.add(body);
  for (const y of [-0.92, -1.98]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.05, 28), strap); b.position.y = y; g.add(b); }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.19, 0.06, 28), strap); cap.position.y = -0.87; g.add(cap);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, c = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.45, 6), chainM); c.position.set(Math.cos(a) * 0.06, -0.66, Math.sin(a) * 0.06); c.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); g.add(c); }
  const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 6), chainM); ch.position.y = -0.22; g.add(ch);
  g.visible = false; scene.add(g);
}
function showP2(v) { if (!P2) return; P2.group.visible = v; for (const o of P2.sceneObjs || []) o.visible = v;
  if (v) P2.handGear(); else { const g = P2.gear; if (g.gloves) { for (const gl of g.gloves) gl.g.visible = false; g.hg.visible = false; } if (g.mma) { g.mma.visible = false; for (const pd of g.mmaPads) pd.m.visible = false; } } }   // (his gear decides what of the wraps / hair shows)
function startBag() {
  G.mode = 'bag'; if (G.diff !== G.userDiff && G.userDiff) G.diff = G.userDiff;
  startFight(true); BAG.on = true; showP2(false); BAG.g.visible = true;
  BAG.x = null; Object.assign(BAG, { score: 0, hits: 0, combo: 0, best: 0, lastT: -9, yaw: 0, yawV: 0, sq: 0 }); BAG.th.set(0, 0, 0); BAG.om.set(0, 0, 0);
  G.roundT = 45; $('n2').textContent = 'Груша'; const sl = $('st2'); if (sl) sl.textContent = 'рекорд ' + G.bagBest;
}
function bagHit(att, name, contact) {
  const P = PUNCH[name]; let dmg = P.dmg * (att.dmgMul || 1) * (1 + 0.06 * SK(att, 'pow')) * (att.sig && sigOf(name) === att.sig ? 1.12 : 1) * (att.punchK ?? 1) * (att.counterUntil > G.t ? 1.5 : 1); att.counterUntil = 0;
  const fwd = Math.sign(P2.group.position.x - att.group.position.x) || 1, dir = new V3(fwd, 0, 0);
  if (P.type === 'hook') dir.copy(_v1.set(P.arm === 'L' ? -1 : 1, 0, 0.35).transformDirection(att.group.matrixWorld)).setY(0).normalize();
  { const kn = att.knuckle(_v4); if (att.kOld) { _v3.copy(kn).sub(att.kOld).setY(0); if (_v3.lengthSq() > 1e-6) dir.lerp(_v3.normalize(), 0.5).normalize(); } }
  const power = clamp(dmg / 18, 0.2, 1.6), J = 14 + 22 * power;   // N·s into a 40 kg bag
  BAG.om.x += dir.x * J / BAG.mass / BAG.L; BAG.om.z += dir.z * J / BAG.mass / BAG.L;
  if (P.type === 'hook') BAG.yawV += (P.arm === 'L' ? 1 : -1) * fwd * 1.6 * power; BAG.sq = Math.min(1, BAG.sq + 0.6 * power);
  const pos = contact || att.knuckle(new V3());
  BAG.combo = G.t - BAG.lastT < 0.95 ? BAG.combo + 1 : 1; BAG.lastT = G.t; BAG.best = Math.max(BAG.best, BAG.combo);
  const pts = Math.round(dmg * (1 + 0.15 * (BAG.combo - 1))); BAG.score += pts; BAG.hits++;
  att.lastLand = G.t; att.whiff = false;
  G.hitstop = 0.01 + 0.018 * power; G.shake = Math.max(G.shake, 0.008 + 0.02 * power); sfx.thud(power * 0.9, true);
  popup(pos, BAG.combo > 1 ? `${pts} ×${BAG.combo}` : String(pts), BAG.combo >= 4 ? 'crit' : 'hit');
  if (BAG.combo === 4 || BAG.combo === 7) msg('Серия ×' + BAG.combo);
  const sl = $('st2'); if (sl) sl.textContent = 'очки ' + BAG.score;
}
function bagStep(dt) {
  if (!BAG.on || dt <= 0) return;
  const w2 = 9.81 / BAG.L;   // pendulum: θ'' = −(g/L)θ − cθ'
  for (const k of ['x', 'z']) { BAG.om[k] += (-w2 * BAG.th[k] - 0.5 * BAG.om[k]) * dt; BAG.th[k] += BAG.om[k] * dt; }
  BAG.yawV += (-6 * BAG.yaw - 1.2 * BAG.yawV) * dt; BAG.yaw += BAG.yawV * dt; BAG.sq *= Math.exp(-dt * 14);
  const g = BAG.g; if (BAG.x == null) BAG.x = P2.headNow.x + 0.13 * (Math.sign(P2.group.position.x - P1.group.position.x) || 1); g.position.set(BAG.x, 2.72, 0);
  g.rotation.set(BAG.th.z, BAG.yaw, -BAG.th.x, 'XYZ'); BAG.body.scale.set(1 + 0.06 * BAG.sq, 1 - 0.03 * BAG.sq, 1 + 0.06 * BAG.sq);
}
function bagEnd() {
  G.state = 'result'; G.winner = P1; G.loser = P2; BAG.on = true; sfx.bell(3); $('pad').hidden = true; Q.length = 0;
  const rec = BAG.score > G.bagBest; if (rec) G.bagBest = BAG.score; const bp = (BAG.score >= 400 ? 1 : 0) + (BAG.score >= 800 ? 1 : 0); PROF.pts += bp; save();
  $('r-stats').innerHTML = '';
  $('r-title').textContent = rec ? 'Рекорд!' : 'Время'; $('r-title').className = 'rt win';
  $('r-sub').textContent = `очки ${BAG.score} · попаданий ${BAG.hits} · лучшая серия ×${BAG.best} · рекорд ${G.bagBest}`;
  $('r-car').textContent = (BAG.score >= 900 ? 'Готов к титулу' : BAG.score >= 600 ? 'Боевая форма' : BAG.score >= 350 ? 'Неплохо — добавь серий' : 'Разминка') + (bp ? ` · +${bp} ${bp === 1 ? 'очко' : 'очка'} бойцу` : ' · 400+ очков дают очко бойцу');
  $('r-again').textContent = 'Ещё раз'; $('r-replay').hidden = true; $('result').hidden = false;
}
function updateMenu() {
  renderStats();
  const el = $('ladder'); if (el) el.innerHTML = LADDER.map((L, i) => `<i class="${i < G.career ? 'done' : i === G.career ? 'next' : ''}">${L.nm}${L.champ ? ' ★' : ''}</i>`).join('');
  const c = $('car-lbl'); if (c) c.textContent = G.career >= LADDER.length ? 'ты чемпион — пройти заново' : `бой ${G.career + 1}/${LADDER.length} · ${LADDER[G.career].nm} · ${LOCS[careerLoc()].label.toLowerCase()}`;
  const f = $('fighter-lbl'); f.textContent = PROF.pts > 0 ? `свободных очков: ${PROF.pts}` : 'внешность · стиль'; f.classList.toggle('pt', PROF.pts > 0);
  $('who').innerHTML = `${esc(PROF.name || 'Боец')}${PROF.nick ? ` «${esc(PROF.nick)}»` : ''}<small>побед ${G.wins} · поражений ${G.losses}${PROF.champ ? ' · чемпион ×' + PROF.champ : ''}</small>`;
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
  let s = 9173 + G.career * 31; const r = () => (s = (s * 16807) % 2147483647) / 2147483647, pick = a => a[(r() * a.length) | 0];
  P2.applyLook({ shorts: pick(SHORTS_LOOKS.filter(x => x.id !== LOOK.shorts)).id, hair: pick(HAIR_LOOKS).id, skin: pick(SKIN_LOOKS).id, beard: r() < 0.6, wraps: L.champ ? 'gold' : r() < 0.6 ? 'white' : pick(WRAPS_LOOKS.slice(0, 4)).id, guard: pick(GUARDS).id, hands: r() < 0.3 ? 'mma' : 'wraps' });
  AI.style = STYLES[L.st]; $('n2').textContent = L.nm + (L.champ ? ' ★' : ''); const sl = $('st2'); if (sl) sl.textContent = STYLES[L.st].label;
  G.diff = L.diff; startFight(true);
}
function startSpar() { if (G.mode === 'career') { G.diff = G.userDiff; rollOpponent(); } G.mode = 'spar'; startFight(true); }
function startQuick() { if (G.mode === 'career') { G.diff = G.userDiff; rollOpponent(); } G.mode = 'quick'; startFight(true); }
function startFight(fromMode) {
  if (fromMode !== true) { if (G.mode === 'career') return startCareer(); if (G.mode === 'bag') return startBag(); if (G.mode === 'spar') return startSpar(); }
  for (const F of [P1, P2]) F.sparGear(G.mode === 'spar');
  setLocation(G.mode === 'spar' || G.mode === 'bag' ? 'gym' : G.mode === 'career' ? careerLoc() : G.loc);   // sparring and the heavy bag are always in the gym; a career fight is where the ladder says
  G.paused = false; UI.from = null; uiShow(null);
  BAG.on = false; showP2(true); BAG.g.visible = false; { const r = $('r-replay'); if (r) r.hidden = false; const c = $('r-car'); if (c) c.textContent = ''; }
  sfx.unlock();
  P1.stat = PROF.stats; P1.sig = PROF.sig; P2.stat = lvlStats(G.mode === 'career' ? Math.min(5, Math.floor(G.career * 0.7)) : ({ easy: 0, normal: 1, hard: 2 })[G.diff] || 0); P2.sig = SIGS[(rr() * SIGS.length) | 0].id;
  $('n1').textContent = myName();
  P1.resetState(); P2.resetState(); P2.speed = DIFFS[G.diff].speed * (1 + 0.035 * SK(P2, 'spd')); P1.speed = 1.5 * (1 + 0.035 * SK(P1, 'spd'));
  FX.clearAir(); REC.frames.length = 0; REC.events.length = 0; Q.length = 0; AI.blockUntil = 0; AI.t = 1.0 + rr(); AI.combo = 0; AI.dodgeAt = 0;
  G.state = 'intro'; G.introT = 0; G.slow = 1; G.slowT = 0; G.hitstop = 0; ARENA.position.set(0, 0, 0); ARENA.rotation.y = 0; AI.lat = 0; AI.latT = 0;
  // BKFC: five two-minute rounds; between rounds the corner works on him (stamina, the cuts, ice on the eye); no knockout → the judges
  G.round = 1; G.roundT = ROUND_LEN; G.cards = []; G.rs0 = null; G.rd = [0, 0]; G.rkd = [0, 0]; G.cutWarn = false;
  show('result', false); show('rec', false); show('bar-t', false); show('bar-b', false); show('hud', true); show('pad', false);
  $('diffl').textContent = DIFFS[G.diff].label.toUpperCase(); $('w1').textContent = 'побед ' + G.wins; $('w2').textContent = 'побед ' + G.losses;
  msg('Готовься');
}
function endRound() {
  if (BAG.on) return bagEnd();
  // judges: 10-9 to whoever did more, a point off for each knockdown suffered
  const a = G.rd[0], b = G.rd[1], c = [10, 10]; if (Math.abs(a - b) > 4) c[a > b ? 1 : 0] = 9; c[0] -= G.rkd[0]; c[1] -= G.rkd[1]; G.cards.push(c); G.rd = [0, 0]; G.rkd = [0, 0];
  sfx.bell(2);
  if (G.round >= ROUNDS) return decision();
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
    if (w.sev > 0.97) { const A = F.other; F.ko = true; G.state = 'result'; G.winner = A; G.loser = F; fightOver(A === P1); $('pad').hidden = true;
      $('r-title').textContent = A === P1 ? 'Победа' : 'Поражение'; $('r-title').className = 'rt ' + (A === P1 ? 'win' : 'lose');
      $('r-sub').textContent = `остановлено врачом: рассечение · счёт ${G.wins} : ${G.losses}`; $('result').hidden = false; msg('Стоп! Рассечение', 'ko'); return; }
  }
}
function stateTick(dtReal) {
  if (G.state === 'intro') { G.introT += dtReal; if (G.introT > 1.25) { G.state = 'fight'; msg('Раунд ' + G.round); sfx.bell(1); show('pad', true); } }
  else if (G.state === 'fight') {
    G.roundT -= dtReal * G.slow; if (G.roundT <= 0) return endRound();
    if ((G.cutT = (G.cutT || 0) + dtReal) > 0.5) { G.cutT = 0; cutCheck(); }
  }
  else if (G.state === 'break') {
    G.breakT -= dtReal; if (!G.doc) for (const F of [P1, P2]) corner(F, dtReal / BREAK_LEN);
    if (G.breakT <= 0) { if (!G.doc) { G.round++; G.roundT = ROUND_LEN; for (const F of [P1, P2]) if (F.mark) { F.adv = 0; F.advV = 0; } } G.doc = false;
      G.state = 'fight'; msg(G.round > 1 && G.roundT === ROUND_LEN ? 'Раунд ' + G.round : 'Бой!'); sfx.bell(1); show('pad', true); }
  }
  else if (G.state === 'ko') {
    if (!G.fallSnd && G.loser.headNow.y < 0.3) { G.fallSnd = true; sfx.fall(); G.shake = Math.max(G.shake, 0.03); }
    if (G.t > G.koT + 2.3) startReplay();
  }
}

