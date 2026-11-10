/* ───────── the shop («Магазин», menu screen 'shop') ─────────
   Category → cards of the items (price / «есть» / «награда · бой N») → colours. A click on a card puts the thing on the man
   (try-on: LOOK is changed and P1.applyLook'ed); «Купить» pays it (PROF.cash → PROF.own, 07b_economy.js) and the thing stays on.
   Leaving the shop takes off everything that was only tried (shopLeave). A locked item of the creator opens the shop on itself
   (shopOpen). Free things (price 0) are in the list as «базовое», career rewards are shown locked with the fight they come from. */
const SHOP = { cat: 'top', pick: null, sel: null, snap: null };
const SHOP_CATS = [...WCATS, 'hands'];
const SHOP_HANDS = { yaw: 0.85, zoom: 0.82 };   // the gloves with the man still in his cap: not as close as the creator's VIEW_HANDS
const shopCur = cat => cat === 'hands' ? (LOOK.hands || 'wraps') : wearGet(LOOK, cat).id;
const shopList = cat => [...(WNONE[cat] ? [{ id: 'none', label: WNONE[cat], free: 1 }] : []), ...wearItems(cat).filter(i => !i.noShop)];
function shopTry(cat, id) {   // put it on (nothing is paid)
  if (cat === 'hands') LOOK.hands = id;
  else if (id === 'none') LOOK[cat] = { id: 'none' };
  else { const it = ITEMS[id], old = wearGet(LOOK, cat); LOOK[cat] = { id, color: old.color && (old.id === id || wearColors(it).includes(old.color)) ? old.color : it.colors[0] }; }   // the colour stays while trying things on
  P1.applyLook(LOOK);
}
function shopEnter() {
  SHOP.snap = JSON.parse(JSON.stringify(LOOK));
  if (SHOP.pick) { shopTry(SHOP.cat, SHOP.pick); SHOP.pick = null; }
  setView(SHOP.cat === 'head' || SHOP.cat === 'eyes' ? VIEW_FACE : SHOP.cat === 'hands' ? SHOP_HANDS : VIEW_FULL);
  shopRender();
}
function shopLeave() {   // what is worn but not owned goes back to what was worn before
  const S = SHOP.snap; if (!S) return;
  for (const c of WCATS) { const w = wearGet(LOOK, c); if (w.id !== 'none' && !itemOwned(w.id)) LOOK[c] = S[c]; }
  if (!itemOwned(LOOK.hands || 'wraps')) LOOK.hands = S.hands || 'wraps';
  SHOP.snap = null; P1.applyLook(LOOK); save();
}
function shopOpen(cat, id) { SHOP.cat = cat; SHOP.pick = id || null; uiShow('shop', 'sh-buy'); }
function shopRender() {
  const cat = SHOP.cat, cur = shopCur(cat);
  $('sh-cash').textContent = cash(PROF.cash); $('shop-lbl') && ($('shop-lbl').textContent = cash(PROF.cash));
  swatches('o-scat', SHOP_CATS.map(c => ({ id: c, label: WCAT_LABEL[c] })), () => cat, v => { SHOP.cat = v; shopRender(); setView(v === 'head' || v === 'eyes' ? VIEW_FACE : v === 'hands' ? SHOP_HANDS : VIEW_FULL); }, true, true);
  const box = $('o-sitems'); box.textContent = ''; SHOP.sel = cur;
  shopList(cat).forEach((it, i) => {
    const own = it.free || itemOwned(it.id), b = document.createElement('button'); b.type = 'button'; b.className = 'shc' + (own ? ' own' : it.reward ? ' lock' : '');
    b.setAttribute('aria-pressed', String(it.id === cur));
    if (it.brand) { const im = document.createElement('img'); im.src = brandIcon(it.brand); im.alt = ''; b.append(im); }
    const t = document.createElement('b'); t.textContent = it.label; b.append(t);
    if (it.brand) { const s = document.createElement('small'); s.textContent = it.brand; b.append(s); }
    const p = document.createElement('span'); p.className = 'pr'; p.textContent = it.free ? 'базовое' : own ? (it.price ? '✓ есть' : 'базовое') : it.reward ? '🔒 награда · бой ' + it.reward : cash(it.price); b.append(p);
    b.onclick = () => { shopTry(cat, it.id); shopRender(); const n = $('o-sitems').children[i]; n && n.focus({ preventScroll: true }); };
    box.appendChild(b);
  });
  const it = ITEMS[cur], cols = cat !== 'hands' && it && it.cat === cat ? wearColors(it).map(id => { const c = wearColor(it, id); return { id, c: c.c, label: c.label || id, pat: c.pat }; }) : [];
  swatches('o-scolor', cols, () => wearGet(LOOK, cat).color || (it && it.colors[0]), v => { LOOK[cat] = { id: it.id, color: v }; });
  [...$('o-scolor').children].forEach((b, i) => { b.title = cols[i].label; if (cols[i].pat) b.style.backgroundImage = `url(${GEAR.camoUrl || (GEAR.camoUrl = (() => { const c = document.createElement('canvas'); c.width = c.height = 48; camoPaint(c.getContext('2d'), 48, 48, 0.35); return c.toDataURL(); })())})`; if (i === it.colors.length - 1) b.style.marginRight = '10px'; });
  $('o-scolor').parentElement.hidden = !cols.length;
  // the buy button: what it says depends on the item
  const buy = $('sh-buy'), own = !it || itemOwned(cur), left = it && !own && !it.reward ? it.price - PROF.cash : 0;
  buy.disabled = own || !!(it && it.reward) || left > 0;
  buy.textContent = !it ? 'Без вещи' : own ? (it.price ? 'Уже есть' : 'Базовое') : it.reward ? 'Награда за карьеру' : left > 0 ? 'Не хватает ' + cash(left) : 'Купить · ' + cash(it.price);
  $('o-snote').textContent = !it ? 'снять вещь — бесплатно' : it.reward && !own ? `откроется после ${it.reward}-й победы в карьере (сейчас ${careerWins()})` : own ? 'надето на бойце — выйди из магазина, чтобы оставить' : 'примерка: купи, чтобы оставить';
}
function shopBuy() {
  const cat = SHOP.cat, id = shopCur(cat), it = ITEMS[id]; if (!it || itemOwned(id) || it.reward || PROF.cash < it.price) return;
  PROF.cash -= it.price; PROF.own[id] = 1; SHOP.snap[cat === 'hands' ? 'hands' : cat] = cat === 'hands' ? id : { ...wearGet(LOOK, cat) };
  save(); sfx.thud(0.4, true); shopRender(); updateMenu(); msg('Куплено: ' + it.label, 'tip');
  const n = $('sh-buy'); !n.disabled ? n.focus() : $('shop-back').focus();
}
function buildShop() { shopRender(); }
// debug: __shop.PROF.cash = 5000; __shop.open('top', 'hoodie'); __shop.fightOver(true, false, 'ko')
window.__shop = { PROF, LOOK, ITEMS, SHOP, cash, itemOwned, purse, open: shopOpen, buy: shopBuy, tryOn: shopTry, save, fightOver, careerWins, LADDER };
