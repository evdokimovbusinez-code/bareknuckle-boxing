/* ───────── money: purses for fights, what is owned, career rewards ─────────
   Currency: roubles (₽), PROF.cash. PROF.own = { itemId: 1 } is what was bought in the shop (14b_shop.js): an item is bought with all
   its colours. Free (price 0) things are always owned; an item with `reward: n` (04e_wardrobe.js) is not for sale — it opens by
   itself after n career wins (careerWins(), so it also covers old saves and the title runs). The purse of a fight is built line by
   line by purse() (fightOver calls it) and drawn on the result screen (#r-pay). Heavy bag and sparring pay nothing. */
const PAY = { career: { part: 100, win: 250, ko: 150, tko: 100, fotn: 150, title: 1500, step: 0.2 }, quick: { part: 50, win: 120, ko: 80, tko: 60, fotn: 70 } };
const PAY_DIFF = { easy: 0.7, normal: 1, hard: 1.4 };   // a quick fight pays by the opponent's level
const FOTN_MIN = 100;   // «бой вечера»: punches landed by both + 15 per knockdown (a 5-round fight: ~60–120 landed)
const cash = n => '₽ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ' ');
const itemOwned = id => { const it = ITEMS[id]; return !it || !it.price || !!PROF.own[id] || !!(it.reward && careerWins() >= it.reward); };
const itemForSale = it => !it.reward && !it.noShop;
// the line under an item in the shop / the creator: what it takes to get it
const itemTag = it => itemOwned(it.id) ? (it.price ? 'есть' : 'базовое') : it.reward ? 'награда · бой ' + it.reward : cash(it.price);
// whatever is worn but not owned (after a reset, or a try-on that was left) goes back to the defaults
function wearSanitize(L = LOOK) {
  for (const c of WCATS) { const s = wearGet(L, c); if (s.id !== 'none' && !itemOwned(s.id)) L[c] = c === 'bottom' ? { id: 'shorts', color: 'red' } : { id: 'none' }; }
  if ((L.hands === 'mma' || L.hands === 'knux') && !itemOwned(L.hands)) L.hands = 'wraps';
}
// an older save: everything chosen so far stays available, and the wins already won are paid back a little
if (!PROF.eco) {
  for (const c of WCATS) { const s = wearGet(LOOK, c); if (ITEMS[s.id]) PROF.own[s.id] = 1; }
  if (LOOK.hands === 'mma') PROF.own.mma = 1;
  PROF.cash = Math.min(G.wins, 20) * 150; PROF.eco = 1;
}
wearSanitize();
/* the purse: lines [label, roubles]; `how` = 'dec' | 'ko' | 'tko'; stage = the career step of this fight (before the win is counted) */
function purse(win, draw, how, stage) {
  if (G.mode === 'spar') return { lines: [], total: 0, note: 'Спарринг — без оплаты' };
  if (G.mode !== 'career' && G.mode !== 'quick') return { lines: [], total: 0 };
  const car = G.mode === 'career', T = car ? PAY.career : PAY.quick, k = car ? 1 + T.step * stage : PAY_DIFF[G.diff] || 1, r10 = v => Math.round(v * k / 10) * 10, lines = [];
  lines.push(['Участие', r10(T.part)]);
  if (win) lines.push(['Победа', r10(T.win)]);
  if (win && how === 'ko') lines.push(['Нокаут', r10(T.ko)]); else if (win && how === 'tko') lines.push(['Остановка боя', r10(T.tko)]);
  const a = P1.fs, b = P2.fs;
  if (a && b && a.land + b.land + 15 * (a.kd + b.kd) >= FOTN_MIN) lines.push(['Бой вечера', r10(T.fotn)]);
  if (car && win && stage === LADDER.length - 1) lines.push(['Титул — пояс', T.title]);
  const sp = socSponsorLine(win); if (sp) lines.push(sp);   // the sponsor's contract (15_social.js)
  return { lines, total: lines.reduce((s, l) => s + l[1], 0) };
}
// pays it out and returns what to draw: the purse + the items that a career step has just opened
function payOut(win, draw, how, stage, before) {
  const p = purse(win, draw, how, stage); PROF.cash += p.total;
  const opened = G.mode === 'career' && win ? Object.values(ITEMS).filter(i => i.reward && i.reward > before && i.reward <= careerWins()) : [];
  p.opened = opened.map(i => i.label + (i.brand ? ' · ' + i.brand : '')); return p;
}
function payShow(p) {
  socShow(p && p.soc);
  const el = $('r-pay'); if (!el) return;
  if (!p || (!p.lines.length && !p.note)) { el.innerHTML = ''; return; }
  el.innerHTML = '<tr><td colspan="2" class="h">выплата</td></tr>' + (p.note ? `<tr><td colspan="2">${p.note}</td></tr>` : p.lines.map(l => `<tr><td class="l">${l[0]}</td><td>+${cash(l[1])}</td></tr>`).join('') +
    `<tr class="tot"><td class="l">Итого</td><td>${cash(p.total)}</td></tr><tr><td class="l">В кошельке</td><td>${cash(PROF.cash)}</td></tr>` +
    (p.opened && p.opened.length ? `<tr><td colspan="2" class="new">открыто: ${p.opened.map(esc).join(', ')}</td></tr>` : ''));
}
