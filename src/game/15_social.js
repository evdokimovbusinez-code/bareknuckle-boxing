/* ───────── fame: followers, hype, posts, challenges in the direct, sponsors («Соцсети», menu screen 'social') ─────────
   PROF.soc = { fans, hype, hist, n, dm, deal }: fans = followers, hype 0..100 (decays ×0.7 when the next fight starts, so it is the glow
   of the last fights only), hist = followers after each fight (the chart), n = fights posted, dm = challenges in the direct
   [{ id, i (LADDER man), loc }], deal = the sponsor contract { id, left } or null. The feed (posts with a frame from the fight) is kept in
   its own key `ko-feed` — the frames are JPEG data URLs and would bloat the main save.
   After every career / quick fight fightOver() calls socFight(): the growth is built line by line like the purse (socGain), a post is made
   (a frame of the best moment: socWant on hits / knockdown / knockout → socSnap, called by renderFrame right after the scene is drawn),
   a new challenge may come, the sponsor pays (socSponsorLine, added to the purse). Fame opens places (LOC_FANS) and sponsors (SPONSORS).
   Everything is made up: nobody real, no real brands. Debug: __soc */
const SOC = { feed: [], tab: 'feed', cand: null, want: null, pend: null, cv: null, sp: {} };
const SOC_KEY = 'ko-feed', SOC_FEED_MAX = 14, SOC_HIST = 24, SOC_W = 480, SOC_DM_MAX = 3;
const LOC_FANS = { parking: 500, warehouse: 1500 };   // followers needed for a place in the quick fight (the career opens its places by itself)
const numF = n => String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ' ');
const SPONSORS = [
  { id: 'fox', name: 'ЛИСИЙ ХВОСТ', what: 'энергетик', need: 300, pay: 60, fights: 5, c: '#e8742a', ink: '#1b120a', mark: 'tri' },
  { id: 'ladle', name: 'КОВШ', what: 'пункт приёма металла', need: 800, pay: 130, fights: 5, c: '#c9ccd2', ink: '#1a1c20', mark: 'sq' },
  { id: 'north', name: 'СЕВЕР-МОТОРС', what: 'автосервис', need: 2000, pay: 240, fights: 6, c: '#2f7fd0', ink: '#f2f6fb', mark: 'bolt' },
  { id: 'brick', name: 'ГРАНИТ-ДОМ', what: 'стройматериалы', need: 4500, pay: 400, fights: 6, c: '#b8352f', ink: '#f6eee4', mark: 'ring' }];
const spById = id => SPONSORS.find(s => s.id === id);
const socOn = () => (G.mode === 'career' || G.mode === 'quick') && !BAG.on;
const locOpen = id => PROF.soc.fans >= (LOC_FANS[id] || 0);
const hypeTier = h => h < 15 ? 'тишина' : h < 40 ? 'теплеет' : h < 70 ? 'горячо' : 'вирусный';

function socInit() {   // a fresh save, or the first start with the feature: the fame of the wins already won
  if (!PROF.soc) PROF.soc = { fans: 100 + Math.min(G.wins, 40) * 55 + Math.min(careerWins(), 40) * 40, hype: 0, hist: [], n: 0, dm: [], deal: null };
  const S = PROF.soc; if (!S.hist.length) S.hist.push(Math.round(S.fans));
  if (!locOpen(G.loc) && LOCS[G.loc]) G.loc = 'gym';   // a place that the followers have not opened yet
  if (S.deal && !spById(S.deal.id)) S.deal = null;
}
function socLoad() { try { const f = JSON.parse(localStorage.getItem(SOC_KEY) || '[]'); SOC.feed = Array.isArray(f) ? f.slice(0, SOC_FEED_MAX) : []; } catch (e) { SOC.feed = []; } }
function socSaveFeed() {
  for (let k = SOC.feed.length; k > 0; k--) { try { localStorage.setItem(SOC_KEY, JSON.stringify(SOC.feed.slice(0, k))); return; } catch (e) { SOC.feed.forEach((p, i) => { if (i >= 4) p.img = null; }); } }   // no room: the old frames go first
}
function socReset() { PROF.soc = null; SOC.feed = []; SOC.cand = SOC.want = SOC.pend = null; try { localStorage.removeItem(SOC_KEY); } catch (e) {} socInit(); }
socLoad(); socInit();

/* ── the frame of a post: the canvas is copied right after the scene is drawn (renderFrame calls socSnap) ── */
function socWant(sc, delay) { if (socOn() && (!SOC.want || sc > SOC.want.sc)) SOC.want = { sc, at: G.t + delay }; }
EVT.on((type, e) => {
  if (e.replay || !socOn()) return;
  if (type === 'hit' && !e.blocked) socWant(Math.min(2.4, e.power * 1.5), 0.05);   // the head is at the end of the punch
  else if (type === 'kd') socWant(3.5, 0.4);                                         // going down
  else if (type === 'ko') socWant(6, 0.35);
});
function socShoot(sc) {
  const cv = SOC.cv || (SOC.cv = document.createElement('canvas')), cw = canvas.width, ch = canvas.height, ar = 16 / 9;
  let sw = cw, sh = ch; if (cw / ch > ar) sw = ch * ar; else sh = cw / ar;   // a 16:9 window out of the middle
  cv.width = SOC_W; cv.height = Math.round(SOC_W / ar); cv.getContext('2d').drawImage(canvas, (cw - sw) / 2, (ch - sh) / 2, sw, sh, 0, 0, cv.width, cv.height);
  SOC.cand = { sc };
}
function socFinish() {
  const p = SOC.pend; SOC.pend = null; if (!p) return;
  try { if (SOC.cand) p.img = SOC.cv.toDataURL('image/jpeg', 0.7); } catch (e) {}
  SOC.cand = null; socSaveFeed();
}
function socSnap() {   // after composer.render()
  const w = SOC.want; if (w && G.t >= w.at) { SOC.want = null; if (!SOC.cand || w.sc > SOC.cand.sc) socShoot(w.sc); }
  if (SOC.pend && !SOC.want) { if (!SOC.cand) socShoot(0); socFinish(); }   // a fight that ended without a big moment: the last frame
}

/* ── the text: captions and comments are templates, the names of the commenters are made of words ── */
const pickOf = a => a[(rr() * a.length) | 0];
const CAP = {
  kd: ['{opp} вставал — я добивал. {r}-й раунд: нокдаун, и дальше тишина.', 'Сначала он упал и встал. Потом упал и остался. {opp}, без обид.', 'Нокдаун, добивание, нокаут. Так выглядит {r}-й раунд {place}.'],
  ko: ['{opp} лёг в {r}-м раунде. Спасибо всем, кто пришёл.', 'Один точный — и вопросов нет. {place}, {r}-й раунд.', 'Нокаут. {opp} ещё считает звёзды. Увидимся на следующем.'],
  tko: ['Врач остановил бой: рассечение у {opp} — моя работа.', '{opp} уже не видел из-под бровей. Бой остановлен.'],
  dec: ['Все раунды, кровь и пот. По очкам — мой. {opp}, уважение.', 'Дистанцию вытянули до конца. Судьи на моей стороне.', 'Долго, грязно, честно. {place}, победа по очкам.'],
  draw: ['Ничья с {opp}. Судьи смотрели какой-то свой бой.'],
  lko: ['Прилетело — не увидел. Голова гудит, гордость тоже. Реванш будет.', '{opp} был быстрее. Один раз зазевался — и вот. Работаем.'],
  lose: ['Не мой вечер. {opp} был лучше. Разберу ошибки и вернусь.', 'Проиграл по очкам. Спасибо за поддержку — это не конец.'],
  chal: ['Принял вызов от {opp}. Подписчики просили — получили.', 'Вызов принят. {opp} сам написал в директ — пришёл и получил.']
};
const TAGS = ['#подвал', '#голыекулаки', '#ринг', '#бой', '#наконец', '#двор'];
const CMT_UP = ['Огонь! 🔥', 'Вот это был вечер', 'Лови подписку', 'Красиво закрыл', 'Когда следующий?', 'Такого давно не видели', 'Зал стоял на ушах', 'Слушай, это было сильно', '{opp} теперь будет сниться'];
const CMT_DOWN = ['Держись, чемпион', 'Бывает, главное — вставать', 'Реванш обязательно!', 'Судьи, конечно…', 'Голову береги', 'Вышел и дрался — уважение', 'Мы с тобой'];
const HW1 = ['хук', 'подвал', 'бетон', 'ринг', 'тень', 'гвоздь', 'север', 'лом', 'двор', 'ангар', 'кулак', 'рингсайд'], HW2 = ['фан', 'боец', 'дядя', 'номер', 'профи', 'ночной', 'левша', 'сосед'];
const handle = () => pickOf(HW1) + '_' + pickOf(HW2) + (rr() < 0.7 ? ((rr() * 90 + 7) | 0) : '');
const tpl = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k]);

/* ── the growth of followers: lines [label, n] like the purse; hype at the start of the fight scales them ── */
function socGain(win, draw, how, stage) {
  const S = PROF.soc, a = P1.fs, b = P2.fs, car = G.mode === 'career', ch = G.chal, L = [], lost = !win && !draw, ko = how === 'ko';
  const add = (l, n) => { if (n) L.push([l, n]); };
  const rounds = how === 'dec' ? ROUNDS : G.round, bl = [P1, P2].reduce((s, F) => s + F.flesh.wounds.reduce((q, w) => q + w.sev, 0), 0), fotn = a.land + b.land + 15 * (a.kd + b.kd) >= FOTN_MIN, eva = a.eva | 0, sig = a.sig | 0;
  add(win ? 'Победа' : draw ? 'Ничья' : 'Бой', win ? 80 : draw ? 30 : 20);
  if (win && ko) add('Нокаут', 110); else if (win && how === 'tko') add('Бой остановлен', 60);
  if (win && ko && a.kd > 0) add('Нокдаун и добивание', 80); else if (a.kd > 0) add('Нокдауны ×' + a.kd, 40 * a.kd);
  add('Длина боя · ' + rounds + ' р.', 12 * rounds);
  if (bl >= 0.3) add('Кровь', Math.min(70, bl * 28));
  if (fotn) add('Бой вечера', 90);
  if (eva >= 3) add('Уклоны ×' + eva, Math.min(50, 5 * eva));
  if (PROF.sig && sig >= 1) add('Коронный удар ×' + sig, Math.min(48, 12 * sig));
  if (ch) add('Принятый вызов', win ? 120 : 40);
  const lv = car ? 1 + 0.25 * stage : PAY_DIFF[G.diff] || 1, k = lv * (lost ? 0.55 : 1) * (1 + S.hype / 200);
  const lines = L.map(l => [l[0], Math.max(5, Math.round(l[1] * k / 5) * 5)]);
  if (lost && ko) lines.push(['Нокаут от соперника', -50]);
  let total = lines.reduce((s, l) => s + l[1], 0); total = Math.max(total, -Math.round(S.fans * 0.05));
  let dh = win ? 12 : draw ? 5 : 3; if (win && ko) dh += 20; else if (win && how === 'tko') dh += 10; if (lost && ko) dh = -12;
  dh += 8 * a.kd + (fotn ? 15 : 0) + (bl >= 0.6 ? 5 : 0) + (ch && win ? 20 : 0);
  return { lines, total, dh, k, kd: a.kd, ko, rounds, ch };
}
/* the sponsor's line of the purse (07b_economy.js: purse): a fixed sum per fight, half as much again for a win */
function socSponsorLine(win) { const S = PROF.soc, sp = S.deal && spById(S.deal.id); return sp ? ['Спонсор «' + sp.name + '»', Math.round(sp.pay * (win ? 1.5 : 1))] : null; }
function socFight(win, draw, how, stage) {   // fightOver calls it once per fight; returns what the result screen shows
  if (!socOn() || !P1.fs || !P2.fs) return null;
  const S = PROF.soc, before = { fans: S.fans, locs: Object.keys(LOC_FANS).filter(locOpen), sp: SPONSORS.filter(s => S.fans >= s.need).length };
  const g = socGain(win, draw, how, stage), opp = $('n2').textContent.replace(' ★', ''), place = LOC.label, ch = G.chal; G.chal = null;
  S.fans = Math.max(50, S.fans + g.total); S.hype = clamp(S.hype + g.dh, 0, 100); S.hist.push(Math.round(S.fans)); if (S.hist.length > SOC_HIST) S.hist.shift(); S.n++;
  const lost = !win && !draw, kind = ch && win ? 'chal' : win ? (how === 'ko' ? (g.kd ? 'kd' : 'ko') : how === 'tko' ? 'tko' : 'dec') : draw ? 'draw' : how === 'ko' ? 'lko' : 'lose';
  const cap = tpl(pickOf(CAP[kind]), { opp, place, r: g.rounds }) + ' ' + pickOf(TAGS), up = !lost, likes = Math.round(S.fans * (0.05 + S.hype / 900) + Math.max(0, g.total) * 0.9 + rr() * 30), nc = Math.max(2, Math.round(likes / (up ? 16 : 24)));
  const post = { n: S.n, win, draw, how, kind, opp, place, cap, img: null, likes, nc, d: g.total, fans: S.fans, hype: Math.round(S.hype), cm: [0, 1, 2].map(() => [handle(), tpl(pickOf(up ? CMT_UP : CMT_DOWN), { opp })]) };
  SOC.feed.unshift(post); if (SOC.feed.length > SOC_FEED_MAX) SOC.feed.length = SOC_FEED_MAX; SOC.pend = post;
  const sum = { total: g.total, lines: g.lines, k: g.k, fans: S.fans, hype: Math.round(S.hype), notes: [] };
  if (S.deal) { S.deal.left--; if (S.deal.left <= 0) { sum.notes.push('контракт «' + spById(S.deal.id).name + '» закончился'); S.deal = null; P1.applyLook(LOOK); } }
  for (const id of Object.keys(LOC_FANS)) if (locOpen(id) && !before.locs.includes(id)) sum.notes.push('открыто место: ' + LOCS[id].label);
  const ns = SPONSORS.filter(s => S.fans >= s.need).length; if (ns > before.sp) sum.notes.push('новый спонсор: ' + SPONSORS[ns - 1].name);
  S.dm = S.dm.filter(d => ++d.age < 5); if (S.dm.length < SOC_DM_MAX && rr() < (S.dm.length ? 0.5 : 0.9)) socDM();   // (rivals are the men of the ladder up to the next one)
  if (S.dm.length) sum.notes.push('в директе: вызов' + (S.dm.length > 1 ? 'ы ×' + S.dm.length : ''));
  return sum;
}
function socShow(s) {
  const el = $('r-soc'); if (!el) return;
  if (!s) { el.innerHTML = ''; return; }
  el.innerHTML = '<tr><td colspan="2" class="h">подписчики</td></tr>' + s.lines.map(l => `<tr><td class="l">${l[0]}</td><td class="${l[1] < 0 ? 'neg' : ''}">${l[1] < 0 ? '−' : '+'}${numF(Math.abs(l[1]))}</td></tr>`).join('') +
    `<tr class="tot"><td class="l">Итого</td><td>${s.total < 0 ? '−' : '+'}${numF(Math.abs(s.total))}</td></tr><tr><td class="l">Всего</td><td>${numF(s.fans)}</td></tr><tr><td class="l">Хайп</td><td>${s.hype} · ${hypeTier(s.hype)}</td></tr>` +
    s.notes.map(n => `<tr><td colspan="2" class="new">${esc(n)}</td></tr>`).join('');
}
// the next fight starts: the hype of the old ones cools down; an accepted challenge adds to it
function socStart() {
  if (!socOn()) return; const S = PROF.soc; S.hype = Math.round(S.hype * 0.7); if (G.chal) S.hype = Math.min(100, S.hype + 20);
  SOC.cand = SOC.want = null; SOC.pend = null; socShow(null);
}
function socFlush() { if (SOC.pend) socFinish(); }   // left to the menu before the frame was taken

/* ── the direct: rivals challenge you ── */
const DM_TXT = {
  brawler: ['Видел твой последний бой — сыровато. Приходи в {place}, покажу, как это делается.', 'Слышал, ты себя уже чемпионом считаешь. {place}, один раунд хватит.'],
  counter: ['Ты много машешь. Я не буду — просто подожду. {place}, когда скажешь.', 'Любопытно, как ты бьёшь, когда не попадаешь. Проверим в {place}?'],
  pressure: ['Без разговоров. {place}. Зажму тебя в угол, а там — как повезёт.', 'Подписчики хотят увидеть нас вместе. Я готов хоть сегодня — {place}.']
};
function socDM() {
  const S = PROF.soc, top = Math.min(G.career + 1, LADDER.length - 1), free = [...Array(top + 1).keys()].filter(i => !S.dm.some(d => d.i === i));
  if (!free.length) return null;
  const i = pickOf(free), L = LADDER[i], loc = locOpen(L.loc) && LOCS[L.loc] ? L.loc : 'yard', d = { id: Date.now() % 1e9 + S.n, i, loc, age: 0, t: ((rr() * 3) | 0) };
  S.dm.push(d); return d;
}
function socAccept(id) {
  const S = PROF.soc, d = S.dm.find(x => x.id === id); if (!d || G.state !== 'menu') return;
  S.dm = S.dm.filter(x => x !== d); const L = LADDER[d.i];
  if (G.mode === 'career') { G.diff = G.userDiff; }
  G.prev = { diff: G.userDiff, loc: G.loc }; G.mode = 'quick'; G.diff = L.diff; G.loc = d.loc; setLocation(d.loc);   // the fight is on his ground; the quick-fight settings come back at the menu (socLeave)
  P2.applyLook({ ...L.look, street: true }); AI.style = STYLES[L.st]; $('n2').textContent = L.nm; const sl = $('st2'); if (sl) sl.textContent = STYLES[L.st].label;
  G.chal = { id, i: d.i, nm: L.nm }; save(); startFight(true);
}
function socLeave() { if (G.prev) { G.diff = G.userDiff; G.loc = G.prev.loc; G.prev = null; } G.chal = null; }

/* ── sponsors: a contract of N fights, a patch on the shorts ── */
function sponsorPatch(g, sp, cx, cy, w, h) {   // a placeholder logo: a plate with a sign and the name
  g.save(); g.translate(cx, cy); g.fillStyle = sp.c; g.fillRect(-w / 2, -h / 2, w, h); g.strokeStyle = sp.ink; g.lineWidth = h * 0.05; g.strokeRect(-w / 2 + h * 0.07, -h / 2 + h * 0.07, w - h * 0.14, h - h * 0.14);
  const s = h * 0.3, mx = -w / 2 + h * 0.5; g.fillStyle = g.strokeStyle = sp.ink; g.lineWidth = h * 0.07; g.lineJoin = 'round'; g.beginPath();
  if (sp.mark === 'tri') { g.moveTo(mx, -s); g.lineTo(mx + s, s); g.lineTo(mx - s, s); g.closePath(); g.fill(); }
  else if (sp.mark === 'sq') { g.fillRect(mx - s * 0.8, -s * 0.8, s * 1.6, s * 1.6); }
  else if (sp.mark === 'bolt') { g.moveTo(mx + s * 0.3, -s); g.lineTo(mx - s * 0.6, s * 0.1); g.lineTo(mx - s * 0.05, s * 0.1); g.lineTo(mx - s * 0.3, s); g.lineTo(mx + s * 0.6, -s * 0.2); g.lineTo(mx + s * 0.05, -s * 0.2); g.closePath(); g.fill(); }
  else { g.arc(mx, 0, s * 0.85, 0, 7); g.stroke(); g.beginPath(); g.arc(mx, 0, s * 0.3, 0, 7); g.fill(); }
  let px = h * 0.34; g.font = `900 ${px}px "Arial Narrow", Arial, sans-serif`; const room = w - h * 1.15, tw = g.measureText(sp.name).width; if (tw > room) { px *= room / tw; g.font = `900 ${px}px "Arial Narrow", Arial, sans-serif`; }
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(sp.name, -w / 2 + h * 0.95, h * 0.02); g.restore();
}
function sponsorIcon(sp) { const c = document.createElement('canvas'); c.width = 240; c.height = 72; sponsorPatch(c.getContext('2d'), sp, 120, 36, 236, 68); return c.toDataURL(); }
// painted on the player's trunks, on the outside of both thighs (called by Fighter.dress after paintShorts). The trunks' texture is wrapped round
// the waist (u: one leg in 0..0.5, the other in 0.5..1) and a pixel is ~5× longer across than along (≈4 mm × 0.8 mm), so the patch is squeezed in x
function socPatch(c) {
  const S = PROF.soc, sp = S && S.deal && spById(S.deal.id); if (!sp) return;
  const g = c.getContext('2d'), W = c.width, H = c.height;
  for (const x of [0.31, 0.81]) { g.save(); g.translate(W * x, H * 0.46); g.scale(0.19, 1); sponsorPatch(g, sp, 0, 0, 250, 74); g.restore(); }
}
function socSign(id) {
  const S = PROF.soc, sp = spById(id); if (!sp || S.deal || S.fans < sp.need) return;
  S.deal = { id, left: sp.fights }; P1.applyLook(LOOK); save(); sfx.thud(0.4, true); msg('Контракт: ' + sp.name, 'tip'); socRender(); updateMenu();
}
function socCancel() { const S = PROF.soc; if (!S.deal) return; S.deal = null; P1.applyLook(LOOK); save(); socRender(); }

/* ── the screen ── */
function socChart() {
  const h = PROF.soc.hist.slice(), W = 300, H = 64, p = 6; if (h.length < 2) h.unshift(h[0] * 0.8);
  const lo = Math.min(...h), hi = Math.max(...h), y = v => H - p - (hi > lo ? (v - lo) / (hi - lo) : 0.5) * (H - 2 * p), x = i => p + i * (W - 2 * p) / (h.length - 1), pts = h.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polygon points="${p},${H - p} ${pts} ${x(h.length - 1).toFixed(1)},${H - p}" fill="rgba(255,59,78,.14)"/><polyline points="${pts}" fill="none" stroke="#ff3b4e" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg><span class="lo">${numF(lo)}</span><span class="hi">${numF(hi)}</span>`;
}
function socRender() {
  const S = PROF.soc; if (!$('social')) return;
  $('so-fans').textContent = numF(S.fans) + ' подп.';
  $('so-chart').innerHTML = socChart();
  $('so-hype').innerHTML = `<span>хайп · ${hypeTier(S.hype)}</span><i><b style="width:${Math.round(S.hype)}%"></b></i>`;
  const open = SPONSORS.filter(s => S.fans >= s.need).length, tabs = [{ id: 'feed', label: 'Лента' }, { id: 'dm', label: 'Директ' + (S.dm.length ? ' · ' + S.dm.length : '') }, { id: 'spons', label: 'Спонсоры' + (!S.deal && open ? ' ●' : '') }];
  swatches('so-tabs', tabs, () => SOC.tab, v => { SOC.tab = v; socList(); }, true, true);
  socList();
}
function socList() {
  const S = PROF.soc, box = $('so-list'), me = esc(myName());
  if (SOC.tab === 'feed') {
    box.innerHTML = SOC.feed.length ? SOC.feed.map(p => `<div class="so-post"><div class="so-h"><b>${me}</b><small>бой ${p.n} · ${esc(p.place)}</small></div>` +
      `<div class="so-img">${p.img ? `<img alt="" src="${p.img}">` : ''}<span class="so-tag ${p.win ? 'w' : p.draw ? '' : 'l'}">${{ kd: 'нокдаун и нокаут', ko: 'нокаут', tko: 'бой остановлен', dec: 'победа по очкам', draw: 'ничья', lko: 'нокаут от соперника', lose: 'поражение', chal: 'вызов принят' }[p.kind]}</span></div>` +
      `<div class="so-cap">${esc(p.cap)}</div><div class="so-m"><span>♥ ${numF(p.likes)}</span><span>💬 ${numF(p.nc)}</span><span class="d ${p.d < 0 ? 'neg' : ''}">${p.d < 0 ? '−' : '+'}${numF(Math.abs(p.d))} подп.</span></div>` +
      p.cm.slice(0, 2).map(c => `<div class="so-c"><b>${esc(c[0])}</b> ${esc(c[1])}</div>`).join('') + '</div>').join('') : '<div class="so-empty">Пока пусто. После каждого боя здесь появится пост — с кадром из боя.</div>';
  } else if (SOC.tab === 'dm') {
    box.innerHTML = S.dm.length ? S.dm.map(d => { const L = LADDER[d.i], tx = tpl(DM_TXT[L.st][d.t % DM_TXT[L.st].length], { place: LOCS[d.loc].label });
      return `<div class="so-post so-dm"><div class="so-h"><b>${esc(L.name)} «${esc(L.nm)}»</b><small>${STYLES[L.st].label} · ${DIFFS[L.diff].label.toLowerCase()} · ${esc(LOCS[d.loc].label)}</small></div><div class="so-cap">${esc(tx)}</div>` +
        `<div class="so-acts"><button class="btn pri sm" data-acc="${d.id}">Принять вызов</button><button class="btn sm" data-dec="${d.id}">Отклонить</button></div><small class="so-n">принять — быстрый бой на его месте, хайп +20; победа даст больше подписчиков</small></div>`; }).join('')
      : '<div class="so-empty">В директе тихо. Выигрывай бои — соперники сами напишут и позовут на бой.</div>';
    for (const b of box.querySelectorAll('[data-acc]')) b.onclick = () => socAccept(+b.dataset.acc);
    for (const b of box.querySelectorAll('[data-dec]')) b.onclick = () => { S.dm = S.dm.filter(d => d.id !== +b.dataset.dec); save(); socRender(); };
  } else {
    box.innerHTML = SPONSORS.map(sp => { const lock = S.fans < sp.need, mine = S.deal && S.deal.id === sp.id, other = S.deal && !mine;
      SOC.sp[sp.id] = SOC.sp[sp.id] || sponsorIcon(sp);
      return `<div class="so-post so-sp${lock ? ' lock' : ''}"><img class="so-logo" alt="" src="${SOC.sp[sp.id]}"><div class="so-h"><b>${sp.name}</b><small>${sp.what}</small></div>` +
        `<div class="so-cap">${cash(sp.pay)} за бой, за победу ×1,5 · контракт на ${sp.fights} боёв · нашивка на трусах</div>` +
        `<div class="so-acts">${lock ? `<span class="so-lock">🔒 от ${numF(sp.need)} подписчиков</span>` : mine ? `<span class="so-lock on">контракт: осталось ${S.deal.left} ${S.deal.left === 1 ? 'бой' : 'боёв'}</span><button class="btn sm" data-cx="1">Расторгнуть</button>` : `<button class="btn pri sm" data-sg="${sp.id}"${other ? ' disabled' : ''}>${other ? 'Уже есть спонсор' : 'Подписать'}</button>`}</div></div>`; }).join('');
    for (const b of box.querySelectorAll('[data-sg]')) b.onclick = () => socSign(b.dataset.sg);
    for (const b of box.querySelectorAll('[data-cx]')) b.onclick = socCancel;
  }
}
function socEnter() { if (!PROF.soc.dm.length && G.wins + G.losses > 0 && rr() < 0.5) socDM(); socRender(); }
function socMenu() { const l = $('soc-lbl'), S = PROF.soc; if (l) l.textContent = numF(S.fans) + ' подп.' + (S.dm.length ? ' · вызов ×' + S.dm.length : ''); }
// debug: __soc.sim(true, 'ko') plays the books of a fight without fighting; __soc.fans(2000) sets the followers; __soc.dm() adds a challenge
window.__soc = { get S() { return PROF.soc; }, SOC, SPONSORS, LOC_FANS, socGain, socDM, socSign, socAccept, socRender,
  sim(win, how = 'dec', kd = 0) { P1.fs.land = 40; P1.fs.thr = 90; P1.fs.eva = 6; P1.fs.kd = kd; P2.fs.land = 30; P2.fs.thr = 80; if (G.mode !== 'career') G.mode = 'quick'; if (how !== 'dec') G.round = 2; fightOver(win, false, how); },
  fans(n) { PROF.soc.fans = n; PROF.soc.hist.push(n); save(); socMenu(); }, dm: socDM };
