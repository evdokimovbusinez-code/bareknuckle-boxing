/* ───────── game state ───────── */
/* damage per landed punch is scaled so a fight lasts: ~25–35 clean head shots to empty a full bar, so cuts and swelling
   have time to show (BKFC bouts that end inside the distance mostly end in rounds 1–3, not in the first ten seconds) */
const DMG_K = 0.18;
const DIFFS = { easy: { label: 'Лёгкий', dodge: 0.18, read: 0.5, gap: 1.9, speed: 1.0, toAI: 1.25, toMe: 0.75 }, normal: { label: 'Норм', dodge: 0.4, read: 0.7, gap: 1.35, speed: 1.15, toAI: 1, toMe: 1 }, hard: { label: 'Жёсткий', dodge: 0.6, read: 0.86, gap: 0.95, speed: 1.3, toAI: 0.9, toMe: 1.15 } };
const G = { state: 'load', t: 0, real: 0, hitstop: 0, slow: 1, slowT: 0, shake: 0, koT: 0, introT: 0, winner: null, loser: null, wins: 0, losses: 0, diff: 'normal', fallSnd: false };
let P1, P2, VW = 1, VH = 1, inp = null;
/* game events other systems listen to (the crowd): EVT.on((type, e) => …); types: 'hit' { pos, power, blocked, replay }, 'kd', 'ko', 'up' { pos }, 'round' */
const EVT = { subs: [], on(f) { this.subs.push(f); }, emit(type, e) { for (const f of this.subs) f(type, e || {}); } };
const LOOK = { hair: 'brown', skin: 'light', beard: false, bottom: { id: 'shorts', color: 'red' }, guard: 'clear' };   // clothes: { id, color } per category of the registry (04e_wardrobe.js)
try { const s = JSON.parse(localStorage.getItem('ko-ring') || 'null'); if (s) { Object.assign(LOOK, s.look || {}); G.diff = DIFFS[s.diff] ? s.diff : 'normal'; G.wins = s.wins | 0; G.losses = s.losses | 0; } } catch (e) {}
G.mode = 'quick'; G.career = 0; G.bagBest = 0; G.userDiff = G.diff; G.loc = 'gym';
const OPT = { vol: 1, shake: true, keys: true, cine: true };   // settings screen: master volume 0..1, camera shake, the key hint bar in a fight, cutscenes (stare-down, end-of-round close-up + highlights)
const PROF = { name: '', nick: '', sig: null, stats: { pow: 0, spd: 0, chin: 0, sta: 0 }, pts: 1, champ: 0, cash: 0, own: {}, eco: 0, soc: null };   // cash, own (bought items), eco (the money system has seen this save): 07b_economy.js
try { const s = JSON.parse(localStorage.getItem('ko-ring') || 'null'); if (s) { G.career = s.career | 0; G.bagBest = s.bagBest | 0; if (typeof s.loc === 'string') G.loc = s.loc; if (s.opt) { OPT.vol = clamp(+s.opt.vol || 0, 0, 1); OPT.shake = s.opt.shake !== false; OPT.keys = s.opt.keys !== false; OPT.cine = s.opt.cine !== false; } if (s.prof) Object.assign(PROF, s.prof, { stats: Object.assign(PROF.stats, s.prof.stats || {}) }); } } catch (e) {}
wearMigrate(LOOK);   // old saves kept plain ids (top: 'teeB', shorts: 'red')
const save = () => { try { localStorage.setItem('ko-ring', JSON.stringify({ look: LOOK, diff: G.mode === 'career' || G.prev ? G.userDiff : G.diff, wins: G.wins, losses: G.losses, career: G.career, bagBest: G.bagBest, prof: PROF, loc: G.prev ? G.prev.loc : G.loc, opt: OPT })); } catch (e) {} };
const careerWins = () => G.career + PROF.champ * LADDER.length;   // wraps unlock by career wins ever
/* career: a ladder of eight men, each tougher than the last — beat one to get the next; the last one holds the belt.
   The road of a street fighter: the yard (1–2) → tyres and fire (3–4) → the underground parking (5–6) → the warehouse cage (7),
   and the title fight (8) in the same cage with the whole crowd in (crowd = the share of the place's crowd that came, CROWD.fill).
   name / nm: his name and the nickname he fights under; legend: one line for the card before the fight (fightCard, 09_bag.js);
   look: what he always wears — a street outfit of 04d_street.js fixed per man (startCareer), not a random one */
const LADDER = [
  { nm: 'Лом', name: 'Гена Рыжов', st: 'brawler', diff: 'easy', loc: 'yard', legend: 'Гроза своего подъезда. Бьёт размашисто и ждёт, что ты испугаешься раньше, чем он устанет.',
    look: { skin: 'light', hair: 'bald', beard: false, bottom: 'sweatS', top: 'tank', shoes: 'sneak', wraps: 'white', hands: 'wraps', guard: 'clear', shorts: 'black' } },
  { nm: 'Кабан', name: 'Толя Брагин', st: 'brawler', diff: 'easy', loc: 'yard', legend: 'Грузчик с овощной базы. Сто десять кило идут вперёд и не знают, как это — назад.',
    look: { skin: 'tan', hair: 'brown', beard: true, bottom: 'cargo', top: 'teeG', shoes: 'boots', wraps: 'white', hands: 'wraps', guard: 'black', shorts: 'green' } },
  { nm: 'Грек', name: 'Костя Маврин', st: 'counter', diff: 'normal', loc: 'tires', legend: 'Недоучился на хирурга. Знает, где у человека печень, и спокойно ждёт твоей ошибки.',
    look: { skin: 'tan', hair: 'black', beard: true, bottom: 'jeansB', top: 'none', shoes: 'keds', wraps: 'black', hands: 'wraps', guard: 'clear', shorts: 'blue' } },
  { nm: 'Шрам', name: 'Вадим Чернов', st: 'pressure', diff: 'normal', loc: 'tires', legend: 'Шрам через бровь — память о первом бое у бочек. С тех пор огонь видел только его победы.',
    look: { skin: 'light', hair: 'blond', beard: false, bottom: 'jeansL', top: 'tankB', shoes: 'sneakB', wraps: 'red', hands: 'wraps', guard: 'red', shorts: 'red' } },
  { nm: 'Молот', name: 'Руслан Гатин', st: 'brawler', diff: 'normal', loc: 'parking', legend: 'Днём правит кузова кувалдой, ночью — челюсти правой. На минус втором этаже его ставка всегда первая.',
    look: { skin: 'dark', hair: 'black', beard: false, bottom: 'jeans', top: 'teeB', shoes: 'sneakB', wraps: 'white', hands: 'mma', guard: 'black', shorts: 'black' } },
  { nm: 'Седой', name: 'Аркадий Вершин', st: 'counter', diff: 'hard', loc: 'parking', legend: 'Двадцать лет в подвалах и гаражах. Быстрых он не боится — он их пересиживает.',
    look: { skin: 'light', hair: 'grey', beard: true, bottom: 'pants', top: 'teeW', shoes: 'keds', wraps: 'white', hands: 'wraps', guard: 'clear', shorts: 'white' } },
  { nm: 'Бизон', name: 'Тимур Салаев', st: 'pressure', diff: 'hard', loc: 'warehouse', crowd: 0.55, legend: 'Вернулся с северной вахты злым. В клетке вжимает в сетку и не даёт вдохнуть.',
    look: { skin: 'dark', hair: 'bald', beard: true, bottom: 'sweatG', top: 'none', shoes: 'boots', wraps: 'black', hands: 'mma', guard: 'blue', shorts: 'purple' } },
  { nm: 'Кувалда', name: 'Захар Громов', st: 'brawler', diff: 'hard', loc: 'warehouse', crowd: 1, champ: true, legend: 'Хозяин склада и пояса. Из тех, кто вышел против него, своими ногами не ушёл никто.',
    look: { skin: 'tan', hair: 'bald', beard: true, bottom: 'jeansB', top: 'none', shoes: 'boots', wraps: 'gold', hands: 'wraps', guard: 'gold', shorts: 'black' } }];
const careerLoc = () => { const id = LADDER[Math.min(G.career, LADDER.length - 1)].loc; return LOCS[id] ? id : G.loc; };
// «Склад · аншлаг»: the place of career fight i as the menu, the card and the result screen name it
const careerPlace = (i = G.career) => { const L = LADDER[Math.min(i, LADDER.length - 1)]; return (LOCS[L.loc] ? LOCS[L.loc].label : LOC.label) + (L.champ ? ' · аншлаг' : ''); };
function fightOver(win, draw, how = 'dec') {   // how: 'dec' (judges) | 'ko' | 'tko' (the doctor stops it) — the purse depends on it
  fightTable();
  const stage = Math.min(G.career, LADDER.length - 1), before = careerWins();
  if (draw) { const p = payOut(false, true, how, stage, before); p.soc = socFight(false, true, how, stage); payShow(p); save(); return; }
  if (win) G.wins++; else G.losses++;
  let t = '', pts = 0;
  if (G.mode === 'career') {
    if (win) { G.career = Math.min(LADDER.length, G.career + 1); pts = 2; if (G.career >= LADDER.length) { PROF.champ++; pts += 3; t = 'ЧЕМПИОН! Пояс твой'; } else t = `карьера ${G.career}/${LADDER.length} · следующий: ${LADDER[G.career].nm} — ${careerPlace()}`; }
    else t = `карьера ${G.career}/${LADDER.length} · ${LADDER[G.career].nm} ещё стоит на пути — ${careerPlace()}`;
  } else if (win) pts = 1;
  if (pts) { PROF.pts += pts; t += (t ? ' · ' : '') + `+${pts} ${pts === 1 ? 'очко' : 'очка'} бойцу`; }
  { const p = payOut(win, false, how, stage, before); p.soc = socFight(win, false, how, stage); payShow(p); }   // the purse (07b_economy.js) and the followers (15_social.js) onto the result screen
  save(); const c = $('r-car'); if (c) c.textContent = t;
  const a = $('r-again'); if (a) a.textContent = G.mode === 'career' && win && G.career < LADDER.length ? 'Следующий бой' : G.mode === 'career' && !win ? 'Ещё раз' : 'Реванш';
}
const D_SEP = 1.15;

const elMsg = $('msg'), elPops = $('pops');
function msg(text, cls = '') { elMsg.className = 'msg ' + cls; elMsg.textContent = text; void elMsg.offsetWidth; elMsg.classList.add('show'); }
function popup(pos, text, cls) {
  const v = _v6.copy(pos).project(camera), el = document.createElement('div');
  el.className = 'popn ' + cls; el.textContent = text; el.style.left = ((v.x * 0.5 + 0.5) * VW).toFixed(0) + 'px'; el.style.top = ((1 - (v.y * 0.5 + 0.5)) * VH - 26).toFixed(0) + 'px';
  elPops.appendChild(el); setTimeout(() => el.remove(), 820);
}
const flashEl = $('flash');
function flash() { flashEl.classList.remove('on'); void flashEl.offsetWidth; flashEl.classList.add('on'); }

/* ───────── replay buffer ───────── */
const REC = { frames: [], pool: [], events: [], N: 0 };
function recFrame() {
  const f = REC.pool.pop() || { t: 0, d: [new Float32Array(REC.N), new Float32Array(REC.N)] };
  f.t = G.t; P1.capture(f.d[0]); P2.capture(f.d[1]); (f.gx || (f.gx = [0, 0]))[0] = P1.group.position.x; f.gx[1] = P2.group.position.x; f.ar =[ARENA.position.x, ARENA.position.z, ARENA.rotation.y];
  const r = f.r || (f.r = new Float32Array(ROPES.length * 4)); ROPES.forEach((R, i) => { r[i * 4] = R.cur.x; r[i * 4 + 1] = R.cur.y; r[i * 4 + 2] = R.cur.z; r[i * 4 + 3] = R.s; });
  REC.frames.push(f); if (REC.frames.length > 640) REC.pool.push(REC.frames.shift());
}
const RP = { seg: 0, tau: 0, i: 0, segs: [], cut: false, hl: false };   // hl: the segments are the end-of-round highlights (09b_cine.js), not the knockout
function startReplay() {
  if (REC.frames.length < 4) return endReplay();
  G.state = 'replay'; RP.hl = false; const F = REC.frames, t0 = F[0].t, t1 = F[F.length - 1].t;
  // the knockout from several cameras, like a broadcast: tight on the face, from the canvas looking up, straight down from
  // the lighting rig, over the winner's shoulder, then a wide dolly — each a little longer, so the fall is seen to the end
  const S = (a, b, rate, cam) => ({ from: Math.max(t0, G.koT + a), to: Math.min(t1, G.koT + b), rate, cam });
  const mid = [S(-0.35, 1.3, 0.4, 'low'), S(-0.2, 1.9, 0.55, 'top'), S(-0.5, 1.5, 0.38, 'shoulder')].sort(() => rr() - 0.5);
  RP.segs = [S(-0.7, 1.0, 0.27, 'close'), ...mid.slice(0, 2), S(-0.45, 2.4, 0.6, 'wide')];
  RP.seg = -1; nextSeg();
  $('rec').hidden = false; $('bar-t').hidden = $('bar-b').hidden = false; $('hud').hidden = true; $('pad').hidden = true; $('result').hidden = true;
}
function nextSeg() {
  RP.seg++; if (RP.seg >= RP.segs.length) return endReplay();
  if (RP.segs[RP.seg].enter) RP.segs[RP.seg].enter();   // a segment may announce itself (the highlights' plate)
  P1.simReset = P2.simReset = true;   // a cut back in time: hair and shorts start from the pose, not from where they were
  RP.tau = RP.segs[RP.seg].from; RP.i = 0; FX.clearAir(); wearSeek(RP.tau); P1.simReset = P2.simReset = true; RP.cut = true;
  stepReplay(0);   // pose the fighters before the camera cuts to them
}
function stepReplay(dtReal) {
  const s = RP.segs[RP.seg], F = s.F || REC.frames, prev = RP.tau; RP.tau = Math.min(s.to, RP.tau + dtReal * (s.rf ? s.rf(RP.tau) : s.rate));   // s.F: a clip of its own (highlights); s.rf: a rate that follows the replay time (slow motion at the impact)
  while (RP.i < F.length - 2 && F[RP.i + 1].t <= RP.tau) RP.i++;
  const a = F[RP.i], b = F[RP.i + 1], k = clamp((RP.tau - a.t) / Math.max(1e-5, b.t - a.t), 0, 1), sdt = RP.tau - prev;
  if (a.gx && b.gx) { P1.group.position.x = a.gx[0] + (b.gx[0] - a.gx[0]) * k; P2.group.position.x = a.gx[1] + (b.gx[1] - a.gx[1]) * k; P1.group.updateMatrixWorld(true); P2.group.updateMatrixWorld(true); }   // a highlight is from earlier in the round: they stood somewhere else then
  P1.restore(a.d[0], b.d[0], k); P2.restore(a.d[1], b.d[1], k); P1.afterPose(sdt); P2.afterPose(sdt);
  if (a.ar && b.ar) { ARENA.position.set(a.ar[0] + (b.ar[0] - a.ar[0]) * k, 0, a.ar[1] + (b.ar[1] - a.ar[1]) * k); ARENA.rotation.y = a.ar[2] + (b.ar[2] - a.ar[2]) * k; }
  if (a.r && b.r) ROPES.forEach((R, i) => { const j = i * 4; R.hit = (R.hit || new V3()).set(a.r[j] + (b.r[j] - a.r[j]) * k, a.r[j + 1] + (b.r[j + 1] - a.r[j + 1]) * k, a.r[j + 2] + (b.r[j + 2] - a.r[j + 2]) * k); R.s = a.r[j + 3] + (b.r[j + 3] - a.r[j + 3]) * k; });
  for (const e of REC.events) if (e.t > prev && e.t <= RP.tau) {
    if (e.wear) { wearEvent(e); continue; }   // a hat flies off / glasses break again (04e_wardrobe.js)
    const F = e.who ? P2 : P1; FX.spawn(e.pos, e.dir, e.power); if (e.dent) F.flesh.dent(...e.dent); if (e.mist) FX.mist(e.pos, e.dir, e.power, e.mist);
    if (e.spray) F.flesh.spray(e.spray.map(i => F.flesh.wounds[i]).filter(Boolean), e.dir, e.power, F);
    sfx.thud(e.power * 0.7); G.shake = Math.max(G.shake, 0.01 + 0.02 * e.power); EVT.emit('hit', { pos: e.pos, power: e.power, replay: true }); }
  if (RP.tau >= s.to) nextSeg();
  return sdt;
}
function endReplay() {
  if (RP.hl) return endHighlights();
  const F = REC.frames; if (F.length) { const l = F[F.length - 1]; P1.restore(l.d[0], l.d[0], 0); P2.restore(l.d[1], l.d[1], 0); if (l.gx) { P1.group.position.x = l.gx[0]; P2.group.position.x = l.gx[1]; P1.group.updateMatrixWorld(true); P2.group.updateMatrixWorld(true); } }
  G.loser.frozen = true; G.loser.rag.on = false; G.winner.simReset = true; G.loser.simReset = true;
  G.state = 'result'; $('rec').hidden = true; $('bar-t').hidden = $('bar-b').hidden = true;
  const win = G.winner === P1; $('r-title').textContent = win ? 'Победа' : 'Нокаут'; $('r-title').className = 'rt ' + (win ? 'win' : 'lose');
  $('r-sub').textContent = `${win ? 'соперник на полу' : 'ты на полу'} · счёт ${G.wins} : ${G.losses}`;
  $('result').hidden = false;
}

/* ───────── hits ───────── */
const evades = (att, n, d) => !!d && (att.bodyShot ? d.type === 'lean' : EV[n].includes(d.type));
function aimFor(att, def) {
  if (!att.cur) return null; const n = att.cur, d = def.dodge;
  if (BAG.on) return def === P2 ? bagAim(att) : null;   // the heavy bag: the leather, wherever it has swung to
  if (att.bodyShot) return att.aimV.copy(def.ribs[att.ribIdx].w);
  const ev = d && d.t > 0.03 && evades(att, n, d), c = ev ? def.headNeutral : def.headNow, kn = att.knuckle(_v5);
  // a point 2 cm inside the face on the side the fist comes from (uppercut: under the chin)
  const dir = _v6.copy(kn).sub(c); dir.y *= 0.35; dir.normalize();
  const P = PUNCH[n], gp = att.gear.spar ? 0.06 : 0;   // boxing gloves: the padding is in front of the knuckles, so the hand stops that much earlier (bare fists: 0)
  if (P.type === 'upper') return att.aimV.copy(c).addScaledVector(dir, 0.04 + gp).add(_v4.set(0, -0.1, 0));
  if (P.type === 'over') { const k = clamp((att.act[n].time - P.impact + 0.16) / 0.16, 0, 1); return att.aimV.copy(c).addScaledVector(dir, 0.07 + gp).add(_v4.set(0, 0.26 * (1 - k), 0)); }   // loops over the top
  att.aimV.copy(c).addScaledVector(dir, 0.07 + gp);
  if (att.wide > 0) {   // tired: loops out wide early, then misses by a few centimetres
    const k = clamp((att.act[n].time - P.impact + 0.16) / 0.16, 0, 1), side = _v4.set(0, 0, 1).transformDirection(att.group.matrixWorld).multiplyScalar(P.arm === 'L' ? 1 : -1);
    att.aimV.addScaledVector(side, 0.18 * att.wide * (1 - k)).add(att.aimJit);
  }
  return att.aimV;
}
const JAW = { c: new V3(0, -0.115, 0.035), r: 0.06 };   // jaw/chin in the head frame (m)
function nearMiss(att, def) {   // how far (m) the knuckles are from his skin (head or the target rib)
  const kn = att.knuckle(_v5);
  if (att.bodyShot) return Math.max(0, kn.distanceTo(def.ribs[att.ribIdx].w) - 0.1);
  const l = _v6.copy(kn).applyMatrix4(def.headFrameInv), R = HEAD.R, q = Math.sqrt((l.x / R.x) ** 2 + (l.y / R.y) ** 2 + (l.z / R.z) ** 2);
  return Math.max(0, Math.min((q - 1) * R.z, l.distanceTo(JAW.c) - JAW.r - 0.03));
}
function whiffPunch(att) {
  att.whiff = true; att.fs && 0; sfx.whoosh(); att.stamina = Math.max(0, att.stamina - 3);   // a missed punch costs more than a landed one
  if (att === P1) popup(att.knuckle(new V3()), 'мимо', 'dodge');
}
function contactTest(att, def) {
  if (BAG.on) return bagContact(att);
  const kn = att.knuckle(_v5);
  if (att.bodyShot) { const r = def.ribs[att.ribIdx].w; return kn.distanceTo(r) < 0.1 ? r.clone() : null; }
  const l = _v6.copy(kn).applyMatrix4(def.headFrameInv), R = HEAD.R, gm = att.gear.spar ? 0.07 : 0,   /* boxing glove: ≈ 4 cm of padding in front of the knuckles + his headgear */ x = l.x / (R.x + 0.032 + gm), y = l.y / (R.y + 0.028 + gm), z = l.z / (R.z + 0.032 + gm), q = x * x + y * y + z * z;   // the knuckle bone sits ~3 cm inside the fist's skin
  if (q >= 1) {   // the jaw hangs below the skull ellipsoid: a hook or uppercut finds it there
    const dj = l.distanceTo(JAW.c); if (dj > JAW.r + 0.032) return null;
    return l.sub(JAW.c).setLength(JAW.r).add(JAW.c).applyMatrix4(def.headFrame);
  }
  l.multiplyScalar(0.92 / Math.sqrt(q)); return l.applyMatrix4(def.headFrame);   // contact on the skin under the knuckles
}
/* follow-up shots: while he is going down (the first second of a knockdown or knockout, head still above the waist of a standing
   man) the punches you already had loaded can still land — the ragdoll takes the impulse, the face takes the damage */
function followOK(att) {
  const def = att.other, ko = G.state === 'ko' && G.winner === att, kd = G.state === 'kd' && G.kd && G.kd.att === att && !G.kd.down;
  if (!(ko || kd) || BAG.on || !def.rag.on || !def.rag.world) return false;
  return G.t - (ko ? G.koT : G.kd.t0) < 1.3 && def.headNow.y > 0.6;
}
function followHit(att, name, contact) {
  const def = att.other, P = PUNCH[name];
  if (!contact && nearMiss(att, def) > 0.08) return whiffPunch(att);
  const pos = contact ? contact.clone() : def.headNow.clone(), power = clamp(P.dmg / 18, 0.3, 1.2) * Math.min(1.3, att.punchK ?? 1);
  const dir = _v1.copy(def.headNow).sub(att.headNow).setY(P.type === 'upper' ? 0.5 : P.type === 'over' ? -0.3 : 0.05).normalize().clone();
  // impulse into the ragdoll's head and neck (the ragdoll lives in his group's frame)
  const R = def.rag, qi = _qa.copy(def.group.quaternion).invert(), pl = def.group.worldToLocal(pos.clone());
  for (const [k, J] of [['head', 9 + 9 * power], ['neck', 3 * power], ['chest', 2 * power]]) { const d = R.by[k]; if (!d || !d.body || !d.body.invMass) continue;
    const b = d.body, Jl = _v2.copy(dir).applyQuaternion(qi).multiplyScalar(J), r = _v3.set(pl.x - b.position.x, pl.y - b.position.y, pl.z - b.position.z).multiplyScalar(k === 'head' ? 1 : 0); b.applyImpulse(Jl, r); }
  const fr = def.flesh.onHit(pos, dir, power, name, false, def), ev = { t: G.t, pos: fr.skin, dir, power, who: def === P1 ? 0 : 1, dent: fr.dent };
  const sp = def.flesh.wounds.filter(w => w.p.distanceTo(fr.dent[0]) < 0.06 * def.flesh.U); if (sp.length || fr.spray.length) { const s2 = fr.spray.length ? fr.spray : sp; def.flesh.spray(s2, dir, power, def); ev.spray = s2.map(w => def.flesh.wounds.indexOf(w)); }
  def.face.hit && def.face.hit(power, true); FX.spawn(fr.skin, dir, power); { const bl = Math.min(1, def.flesh.wounds.reduce((a, x) => a + x.sev, 0) * 0.8); if (bl > 0.12) { FX.mist(fr.skin, dir, power, bl); ev.mist = bl; } } REC.events.push(ev);
  if (att.fs) { att.fs.land++; att.fs.dmg += P.dmg * DMG_K; } if (G.state === 'kd') { def.hp = Math.max(0, def.hp - P.dmg * DMG_K); G.kd.up += 0.8; }
  att.lastLand = G.t; sfx.thud(power, false); EVT.emit('hit', { pos, power }); G.shake = Math.max(G.shake, 0.02 + 0.03 * power); G.hitstop = 0.02 + 0.02 * power;
  popup(fr.skin.clone().add(_v4.set(0, 0.15, 0)), 'добил', 'crit');
}
function resolveHit(att, name, contact) {
  const def = att.other; if (def.ko || G.state !== 'fight') { if (followOK(att)) followHit(att, name, contact); return; }
  if (BAG.on) { if (att === P1) bagHit(att, name, contact); return; }
  const P = PUNCH[name], d = def.dodge, evading = !!d && d.t > 0.05 && d.t < 0.44, body = att.bodyShot;
  const evaded = evading && evades(att, name, d);
  let pos = contact || (body ? def.ribs[att.ribIdx].w.clone() : def.headNow.clone().add(_v3.copy(att.knuckle(_v4)).sub(def.headNow).setLength(0.1)));
  if (evaded) {
    att.whiff = true; def.counterUntil = G.t + 1.0; popup(pos, 'уклон', 'dodge'); sfx.whoosh(); if (def.fs) def.fs.eva++;
    if (def === P1) { G.slow = 0.4; G.slowT = 0.3; }
    return;
  }
  let dmg = P.dmg * (att.dmgMul || 1) * (1 + 0.06 * SK(att, 'pow')) * (att.sig && sigOf(name) === att.sig ? 1.12 : 1) * (1 - 0.05 * SK(def, 'chin')); const counter = att.counterUntil > G.t; if (counter) { dmg *= 1.5; att.counterUntil = 0; }
  // walking onto a punch: the target's own momentum adds to the impact (a man hit while throwing is hit hardest)
  const caught = def.cur && !def.resolved && !(def.blockW > 0.55); if (caught) dmg *= 1.25;
  if (att.adv > 0.04) dmg *= 1.08;   // stepping in behind it
  dmg *= att.punchK ?? 1; if (evading) dmg *= 1.35; if (body) dmg *= 0.8;
  const blocked = def.blockW > 0.55 && (!def.cur || def.dodge);
  if (blocked) { dmg *= body ? 0.6 : P.type === 'upper' ? 0.55 : 0.18; def.stamina = Math.max(0, def.stamina - 7); }
  dmg *= (att === P1 ? DIFFS[G.diff].toAI : DIFFS[G.diff].toMe) * ((window.__tw || {}).dmgK ?? DMG_K) * (G.mode === 'spar' ? 0.6 : 1);   // 16 oz and a helmet
  if (window.__dmgLog) window.__dmgLog.push([def === P1 ? 1 : 2, +dmg.toFixed(1), name, counter ? 'C' : '', caught ? 'K' : '', blocked ? 'B' : '', evading ? 'E' : '', +G.t.toFixed(1)]);
  if (att.fs) { if (blocked) att.fs.blk++; else { att.fs.land++; if (P.type !== 'straight' || name === 'cross') att.fs.pow++; if (att.sig && sigOf(name) === att.sig) att.fs.sig++; } att.fs.dmg += dmg; }
  def.hp = Math.max(0, def.hp - dmg); def.hpCap = Math.max(def.hp, def.hpCap - dmg * (blocked ? 0.15 : 0.4)); def.hitT = G.t; if (G.rd) G.rd[att === P1 ? 0 : 1] += blocked ? dmg * 0.3 : dmg;
  const fwd = Math.sign(def.group.position.x - att.group.position.x), dir = new V3(fwd, 0.15, 0);
  if (P.type === 'hook') { dir.copy(_v1.set(P.arm === 'L' ? -1 : 1, 0.1, 0.35).transformDirection(att.group.matrixWorld)); }
  else if (P.type === 'upper') dir.set(fwd * 0.4, 1, 0);
  else if (P.type === 'over') dir.set(fwd, -0.45, 0);
  dir.normalize();
  const power = clamp(dmg / (18 * ((window.__tw || {}).dmgK ?? DMG_K)), 0.2, 1.6), blood = !blocked && (def.hp < 62 || dmg >= 14);
  if (!blocked) { const was = def.daze; def.daze = Math.min(1, def.daze + power * 0.13 + (def.hp < 30 ? 0.1 : 0)); if (was < 0.55 && def.daze >= 0.55) popup(_v4.copy(def.headNow).add(_v5.set(0, 0.25, 0)), 'поплыл', 'crit'); }
  if (blocked) popup(pos, 'блок', 'dodge');
  // direction: how the knuckles were travelling at contact
  { const kn = att.knuckle(_v4); if (att.kOld) { _v3.copy(kn).sub(att.kOld); if (_v3.lengthSq() > 1e-6) dir.lerp(_v3.normalize(), 0.6).normalize(); } }
  if (body) { def.stamina = Math.max(0, def.stamina - 18); popup(pos, 'по корпусу', 'dodge'); }
  def.lastContact = pos.clone();
  if (caught) {   // his own punch: knocked off line if it was early, landing weakened if it was nearly there
    const dp = PUNCH[def.cur], td = def.act[def.cur].time;
    if (td < dp.impact - 0.1 || power > 1.0) { def.cancelPunch(); popup(_v4.copy(def.headNow).add(_v5.set(0, 0.2, 0)), 'сбил', 'dodge'); }
    else def.dmgMul = 0.55;
  }
  if (G.t - (att.lastLand || -9) < 0.2 || G.t - (def.lastLand || -9) < 0.2) { if (!G.tradeT || G.t - G.tradeT > 1) { G.tradeT = G.t; popup(_v4.lerpVectors(att.headNow, def.headNow, 0.5).add(_v5.set(0, 0.3, 0)), 'размен!', 'crit'); G.slow = 0.3; G.slowT = 0.35; } }
  att.lastLand = G.t; def.knock = (def.knock || 0) + (blocked ? 0.25 : 1) * power * (body ? 0.6 : 1);
  def.takeHit(dir, blocked ? power * 0.35 : power, name, pos, body, blocked);
  // how a man reacts depends on what hit him: a single hard one → a step back and a head shake; three landing inside ~1.5 s →
  // he stops punching, covers up and gets out of the corner of it (sideways, back)
  if (!blocked) {
    def.hitLog = (def.hitLog || []).filter(t => G.t - t < 1.6); def.hitLog.push(G.t);
    if (power > 0.85 && !body && rr() < 0.7) def.shakeT = G.t;
    if (def === P2) {
      if (def.hitLog.length >= 3 && rr() < 0.75) { const T = 0.8 + rr() * 0.7; def.shellT = G.t + T; AI.blockUntil = Math.max(AI.blockUntil, G.t + T); AI.backT = G.t + T + 0.3; AI.lat = (rr() < 0.5 ? -1 : 1) * 0.9; AI.latT = T; AI.t = Math.max(AI.t, T); }
      else if (power > 0.9) AI.backT = G.t + 0.5 + rr() * 0.4;
    } else if (def.hitLog.length >= 3) def.shellT = G.t + 0.45;
  }
  const ev = { t: G.t, pos, dir, power, who: def === P1 ? 0 : 1 };
  if (!blocked && !body) wearHit(def, pos, dir, power);   // hats fly off, glasses crack (04e_wardrobe.js)
  if (!blocked) {
    const fr = def.flesh.onHit(pos, dir, power, name, body, def); ev.dent = fr.dent; ev.pos = pos = fr.skin;
    // blood comes out of the wounds (an old cut reopens, the nose runs) — never out of thin air
    const sp = blood || fr.cut || fr.nose ? fr.spray.length ? fr.spray : def.flesh.wounds.filter(w => w.p.distanceTo(fr.dent[0]) < 0.05 * def.flesh.U) : [];
    if (sp.length) { def.flesh.spray(sp, dir, power, def); ev.spray = sp.map(w => def.flesh.wounds.indexOf(w)); }
    { const bl = body ? 0 : Math.min(1, def.flesh.wounds.reduce((a, x) => a + x.sev, 0) * 0.8); if (bl > 0.12 && power > 0.35) { FX.mist(fr.skin, dir, power, bl); ev.mist = bl; } }
    // his blood on your hand: a punch that lands on a bleeding face comes back red (bare knuckle)
    const bleeding = def.flesh.wounds.some(w => w.p.distanceTo(fr.dent[0]) < 0.06 * def.flesh.U) || sp.length;
    if (bleeding && !body) {
      const A = P.arm, Fl = att.flesh, hb = att.bones[`CC_Base_${A}_Mid1`], hw = _v4.setFromMatrixPosition(hb.matrixWorld);
      const hi = att.body.skeleton.bones.findIndex(b => b.name === `CC_Base_${A}_Hand`); if (hi >= 0) Fl.smear(Fl.skinAt(hw, hi, T.bodyV).p, 0.35, Fl.downIn(hi), 0.012);
      att.wrapU.uWB.value[A === 'L' ? 'x' : 'y'] = Math.min(1, att.wrapU.uWB.value[A === 'L' ? 'x' : 'y'] + 0.22);
    }
    if (fr.cut) popup(_v4.copy(pos).add(_v5.set(0, 0.12, 0)), 'рассечение', 'crit');
    if (fr.broke) popup(_v4.copy(pos).add(_v5.set(0, 0.12, 0)), 'сломан нос', 'crit');
  }
  FX.spawn(pos, dir, blocked ? power * 0.4 : power); REC.events.push(ev);
  // contact is soft: a very short freeze, then a moment of slow motion while the head travels with the fist
  G.hitstop = 0.012 + 0.022 * power; if (G.slowT <= 0.02) { G.slow = 0.4; G.slowT = 0.05 + 0.06 * power; }
  G.shake = Math.max(G.shake, 0.012 + 0.03 * power); sfx.thud(power, body); EVT.emit('hit', { pos, power, blocked });
  popup(pos, String(Math.round(dmg)), counter ? 'crit' : 'hit');
  // feel it: the screen edge flushes red when you are hit, the phone kicks on what you land and harder on what you take
  if (def === P1 && !blocked) { const h = $('hurt'); if (h) { h.style.setProperty('--k', power); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); } }
  try { if (navigator.vibrate) navigator.vibrate(blocked ? 8 : def === P1 ? 25 + 40 * power : 10 + 18 * power); } catch (e) {}
  const hb = $(def === P1 ? 'hpb1' : 'hpb2'); hb.classList.remove('hit'); void hb.offsetWidth; hb.classList.add('hit');
  if (def.hp <= 0) return knockout(att, def, dir, power, name, fwd);
  // to the body: a hook into the liver (right side, i.e. his left hook) shuts him down a beat later — vagal reflex, legs go, he folds
  // and can't get his breath; a straight shot into the solar plexus knocks the wind out of him (bent over a second or two)
  if (body && !blocked && G.state === 'fight' && !window.__noKD) {
    const liverSide = name === 'hookL' || (name === 'jab' && rr() < 0.3);
    if (liverSide && rr() < clamp((power - 0.55) * 0.6 + (1 - def.hp / 100) * 0.25 + (counter ? 0.15 : 0), 0, 0.45)) { def.liver = { t: G.t + 0.5 + rr() * 0.7, att, dir: dir.clone(), name, fwd }; def.cancelPunch(); popup(_v4.copy(def.headNow).add(_v5.set(0, 0.25, 0)), 'печень', 'crit'); }
    else if (P.type === 'straight' && rr() < 0.3 * power) { def.wind = G.t + 1.0 + rr() * 1.2; def.cancelPunch(); }
  }
  // knockdowns and "his legs went": a clean shot to an already shaken, tiring man can put him down without putting him out
  if (!blocked && !body && G.state === 'fight' && !window.__noKD) {
    // a fresh man is very rarely dropped by one shot: knockdowns come from accumulated damage (or a clean counter)
    const sev = power * 0.85 + def.daze * 0.55 + (counter ? 0.3 : 0) + (1 - def.hp / 100) * 0.45 + (evading ? 0.2 : 0) - 0.6 * (def.hp / 100) ** 2 - 0.05 * SK(def, 'chin');
    if (rr() < clamp((sev - 1.2) * 0.65, 0, 0.5)) return knockdown(att, def, dir, power, name, fwd, sev);
    if (sev > 0.85 && rr() < 0.55) { def.wobble = Math.max(def.wobble, 0.9 + 0.9 * rr()); popup(_v4.copy(def.headNow).add(_v5.set(0, 0.25, 0)), 'повело', 'crit'); }
  }
}
/* knockdown: down but conscious — a knee taken, or a flash fall. The referee counts (BKFC: 10 s to stand; the other man to a neutral spot) */
function knockdown(att, def, dir, power, name, fwd, sev, kind) {
  if (att.fs) att.fs.kd++;
  G.state = 'kd'; def.kdCount = (def.kdCount || 0) + 1; if (G.rkd) G.rkd[def === P1 ? 0 : 1]++;
  const type = kind || window.__kdType || (sev > 1.8 || rr() < 0.4 ? 'fall' : 'knee');
  // how long he stays down: the harder the shot and the more knockdowns already, the longer; past 9 he won't beat the count
  let up = 2 + (sev - 1) * 3 + (def.kdCount - 1) * 1.5 + (1 - def.hp / 100) * 3.2 + rr() * 1.5;
  if (type === 'knee') up = Math.min(up, 7.5);
  if (type === 'liver') up = 5 + (1 - def.hp / 100) * 4 + rr() * 3.5;   // a liver shot often keeps a man down past ten
  AI.fol = 0; G.kd = { def, att, t0: G.t, type, n: 0, nT: 0, down: false, up: clamp(up, 2, 11.5), mash: 0, done: false };
  def.cur = null; def.dodge = null; def.blocking = false; Q.length = 0; def.daze = Math.max(def.daze, 0.8);
  if (type === 'fall') {
    const T = PUNCH[name].type, imp = dir.clone().multiplyScalar(0.9 + 0.5 * power); imp.y = Math.min(imp.y, 0.2);
    const u = rr(), fall = T === 'hook' ? (u < 0.5 ? 'side' : 'drop') : T === 'over' ? (u < 0.6 ? 'fwd' : 'drop') : (u < 0.55 ? 'back' : 'drop');
    def.rag.start(imp, def.lastContact, fall, new V3(-fwd, 0, 0), true);
  } else def.takeKnee(type === 'liver' ? 'liver' : 'knee');
  G.slow = 0.5; G.slowT = 0.35; G.shake = 0.04;
  msg('Нокдаун', 'ko'); sfx.fall(); EVT.emit('kd', { pos: def.headNow });
  if (def === P1) setTimeout(() => { if (G.state === 'kd' && G.kd.def === P1 && !P1.gu) msg('Жми удары — вставай!', 'count'); }, 900);
}
function kdTick(dt) {
  const K = G.kd, D = K.def;
  if (!K.down) { if (G.t - K.t0 > (K.type === 'knee' ? 0.55 : 0.9)) { K.down = true; K.nT = G.t + 0.4; } return; }
  const rising = (D.gu && D.gu.stage !== 'hold' && D.gu.stage !== 'drop') || (D.rag.on && D.rag.prof && D.rag.prof.getup);
  if (K.done) { if (!D.gu && G.t > K.done) { G.state = 'fight'; G.kd = null; msg('Бой!'); EVT.emit('up', { pos: D.headNow }); } return; }
  if (rising) return;
  if (G.t >= K.nT) {
    K.n++; K.nT = G.t + 1.0; msg(String(K.n), 'count'); sfx.count(K.n);
    if (K.n >= 10) return countOut(K);
  }
  if (K.n + (G.t - (K.nT - 1)) >= K.up - K.mash) D.startGetUp(K.type === 'fall' ? 'fall' : 'knee');
}
function countOut(K) {
  const D = K.def, A = K.att; D.ko = true; G.state = 'ko'; G.koT = K.t0; G.winner = A; G.loser = D; G.fallSnd = true; G.kd = null;
  if (D.rag.on) D.rag.prof.conscious = false;   // he stops trying
  else D.collapse();
  fightOver(A === P1, false, 'ko');
  msg('Нокаут', 'ko'); setTimeout(() => sfx.bell(3), 300); EVT.emit('ko', { pos: D.headNow }); $('pad').hidden = true; Q.length = 0;
}
function knockout(att, def, dir, power, name, fwd, forced) {
  // the delayed knockout (rare, but it happens — Barboza–Burgos): still on his feet, he backs up on rubber legs for a second or three and
  // then goes. Another clean shot meanwhile finishes it at once.
  if (!forced && !def.doomed && PUNCH[name].type !== 'upper' && power < 1.15 && rr() < (window.__koVar === 'stagger' ? 1 : window.__koVar ? 0 : 0.14)) {
    def.doomed = { t: G.t + 1.1 + rr() * 1.8, att, dir: dir.clone(), name, fwd }; def.wobble = 4; def.daze = 1; def.cancelPunch(); def.dodge = null; def.blocking = false;
    popup(_v4.copy(def.headNow).add(_v5.set(0, 0.25, 0)), 'поплыл', 'crit'); return;
  }
  def.doomed = null;
  def.ko = true; G.state = 'ko'; G.koT = G.t; AI.fol = 0; G.winner = att; G.loser = def; G.fallSnd = false;
  // keep the fall in the side-on plane: mostly away from the attacker, a little toward/away from camera
  // momentum check: a punch (~5–9 kg effective mass at 8–10 m/s) can give the 5 kg head several m/s, but the whole 80 kg body well under 1 m/s.
  // The fall itself comes from the legs giving way under the body's own lean; the punch only tips it and whips the head.
  const T = PUNCH[name].type, imp = dir.clone().multiplyScalar(1.5 + 0.9 * power); imp.y = T === 'upper' ? 0.9 : Math.max(-0.6, Math.min(imp.y, 0.3));
  const along = imp.x * fwd, minAlong = T === 'hook' ? 0.3 + 0.4 * power : T === 'over' ? 0 : 0.9 + 0.6 * power; if (along < minAlong) imp.x += fwd * (minAlong - along);
  // how the body goes down (from KO footage): straight shots to an upright fighter tip him back; hooks and overhands, landing on a man
  // who is coming forward, usually fold him forward or onto his side; any of them can simply drop him where he stands
  const u = rr(), fall = T === 'over' ? (u < 0.6 ? 'fwd' : u < 0.85 ? 'drop' : 'back') : T === 'hook' ? (u < 0.4 ? 'side' : u < 0.7 ? 'fwd' : u < 0.85 ? 'drop' : 'back')
    : T === 'upper' ? (u < 0.65 ? 'back' : u < 0.85 ? 'drop' : 'fwd') : (u < 0.5 ? 'back' : u < 0.75 ? 'drop' : u < 0.9 ? 'fwd' : 'side');
  // frozen knockout: out on his feet — locked in place for a few tenths of a second (tonic), then he goes over like a tree
  const frozen = !forced && (window.__koVar === 'frozen' || (!window.__koVar && rr() < 0.15));
  def.rag.start(forced ? imp.multiplyScalar(0.3) : imp, def.lastContact, window.__fall || (forced ? (rr() < 0.5 ? 'fwd' : 'drop') : frozen ? (rr() < 0.65 ? 'back' : 'fwd') : fall), new V3(-fwd, 0, 0), false, frozen ? 0.35 + rr() * 0.5 : 0);
  G.slow = 0.3; G.slowT = 0.75; G.hitstop = 0.09; G.shake = 0.06; flash();
  if (def.flesh.wounds.length) def.flesh.spray(def.flesh.wounds, dir, 1.4, def);
  fightOver(att === P1, false, 'ko');
  msg('Нокаут', 'ko'); setTimeout(() => sfx.bell(3), 500); EVT.emit('ko', { pos: def.headNow });
  $('pad').hidden = true; Q.length = 0;
}

