/* ───────── R-09: the result screen ─────────
   One card (#r-card, g_head.html) on the right: the title, the lines under it, three big numbers that count up (₽ of the purse,
   followers, fighter points), the tables under them (folded behind «Подробнее» on a short / touch stage — .cmp), three buttons.
   resultOpen() is the one way the card comes up: it hides whatever could sit over it (#msg «Нокаут» / «Стоп!», the get-up bar,
   the HUD, the round highlight plate, the touch pad) and starts the count. The numbers come from G.res, filled by fightOver
   (07_state_replay_hits.js), bagEnd (09_bag.js) or nobody (P2P: G.res = null, no numbers).
   The camera (camUpdate → resView, camClear → ccFit) frames the men in the part of the screen left of the card: resWin() gives
   the NDC window [-CC_FX, card's left edge − RES.gap], the projection is skewed so that window's centre is the frame's centre. */
const RES = { dur: 1.1, lag: 0.18, gap: 0.04, minH: 0.22, s: 0, raf: 0, tm: 0 };
const resSign = n => (n < 0 ? '−' : '+');
// what the big numbers say: [{ cls, v, f(v) → text, label }]
function resItems(r) {
  if (!r) return [];
  if (r.bag) return [{ cls: 'cash', v: r.score, f: v => numF(v), label: 'очки' }, { cls: 'fans', v: r.best, f: v => '×' + Math.round(v), label: 'лучшая серия' },
    { cls: 'pts', v: r.pts, f: v => '+' + Math.round(v), label: 'очки бойца' }];
  const out = [];
  if (r.cash != null) out.push({ cls: 'cash', v: r.cash, f: v => '+' + cash(v), label: 'выплата' });
  if (r.fans != null) out.push({ cls: 'fans', v: r.fans, f: v => resSign(v) + numF(Math.abs(v)), label: 'подписчики' });
  out.push({ cls: 'pts', v: r.pts || 0, f: v => '+' + Math.round(v), label: 'очки бойца' });
  return out;
}
function resCount(items) {
  cancelAnimationFrame(RES.raf); clearTimeout(RES.tm);
  const els = [...$('r-big').querySelectorAll('.rn b')], t0 = performance.now();
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const put = done => {
    const t = (performance.now() - t0) / 1000;
    items.forEach((it, i) => { const p = done || reduce ? 1 : clamp((t - i * RES.lag) / RES.dur, 0, 1), e = 1 - Math.pow(1 - p, 3);
      els[i].textContent = it.f(Math.round(it.v * e)); });
    return t >= RES.dur + RES.lag * (items.length - 1);
  };
  const step = () => { if (!put(false)) RES.raf = requestAnimationFrame(step); };
  put(false); RES.raf = requestAnimationFrame(step);
  RES.tm = setTimeout(() => { cancelAnimationFrame(RES.raf); put(true); }, (RES.dur + RES.lag * items.length) * 1000 + 150);   // a hidden tab gets no frames: land on the totals anyway
}
// short or touch stage: the narrow card, tables behind «Подробнее»
function resCompact() { const c = $('r-card'); if (c) c.classList.toggle('cmp', TOUCH || VH < 520); }
function resMore(on) {
  const c = $('r-card'), b = $('r-more'); c.classList.toggle('more', on); b.setAttribute('aria-expanded', on ? 'true' : 'false');
  b.textContent = on ? 'Свернуть' : 'Подробнее';
}
function resultOpen() {
  const R = $('result');
  elMsg.className = 'msg'; elMsg.textContent = '';   // «Нокаут» / «Стоп! Рассечение» would sit over the card
  show('kdbar', false); show('hud', false); show('hl', false); show('pad', false); show('rec', false);
  resCompact(); resMore(false);
  const items = resItems(G.res), big = $('r-big');
  big.innerHTML = items.map(it => `<div class="rn ${it.cls}${it.v < 0 ? ' neg' : !it.v ? ' zero' : ''}"><b>${it.f(0)}</b><small>${it.label}</small></div>`).join('');
  const tabs = $('r-tabs'), any = !!tabs.querySelector('tr');
  tabs.classList.toggle('none', !any); $('r-more').classList.toggle('none', !any);
  R.hidden = false; resCount(items);
}
$('r-more').addEventListener('click', () => resMore(!$('r-card').classList.contains('more')));
/* the window the men are framed in while the card is up: { s, h } = shift of the frame centre (NDC) and the half width */
function resWin() {
  if (G.state !== 'result' || $('result').hidden || window.__camHold) return null;
  const c = $('r-card'); if (!c || !c.offsetWidth) return null;
  const a = -CC_FX, b = 2 * c.offsetLeft / VW - 1 - RES.gap, h = (b - a) / 2;
  return h < RES.minH ? null : { s: -(a + b) / 2, h };
}
// skews the projection so the centre of resWin() is the centre of the camera's frame (eased in, dropped at once when the card goes)
function resView(dt, cut) {
  const w = resWin(), t = w ? w.s : 0;
  RES.s = !w ? 0 : cut ? t : RES.s + (t - RES.s) * (1 - Math.exp(-dt * 4));
  if (Math.abs(RES.s) > 1e-3) camera.setViewOffset(VW, VH, RES.s * VW / 2, 0, VW, VH);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  return w;
}
// debug: __res.decision([[9, 10], [9, 10]]) = a loss on the cards now (test docs/audit/scenarios/result.js)
window.__res = { RES, resWin, resItems, open: resultOpen, more: resMore, decision: cards => { G.cards = cards; decision(); } };
