/* ───────── wardrobe: the registry of things a fighter can wear ─────────
   ITEMS = { id: { cat, label, model, colors, price, tags, brand, reward?, noShop? } } (price 0 = free for everyone; reward n = not for sale,
   opens after n career wins; noShop = not shown in the shop; ownership and money: 07b_economy.js, the shop: 14b_shop.js). A look keeps a choice per category as { id, color }
   (LOOK.top = { id: 'tee', color: 'black' }); old saves and the opponents' looks with plain strings ('teeB') are read through
   wearGet(). Any item takes any colour of the common palette WCOL; `colors` are its native ones (shown first), `nat` holds
   item-specific shades / extras of a native colour. itemVar() = the model + the colour = what the mesh builders get.
   Hats (cap, beanie, bandana) and glasses are rigid meshes in the head frame, one draw call each; a hard punch to the head knocks
   the hat off, glasses crack and then break into pieces. What falls off is a small rigid body of its own (debStep: gravity,
   bounce, friction, lies down flat) living in the ARENA frame, so it stays on the floor while the ring turns. Every such event
   goes into REC.events ({ wear: 1 }) and is played again by the replay (wearEvent / wearSeek).
   Belts are a skinned band cut from the trousers' own waist + a metal buckle, one mesh, metalness per vertex. */
const WCOL = [{ id: 'black', c: '#1b1c20', label: 'чёрный' }, { id: 'white', c: '#ecebe6', label: 'белый' }, { id: 'grey', c: '#8a8c91', label: 'серый' }, { id: 'navy', c: '#1d2a4a', label: 'тёмно-синий' },
  { id: 'blue', c: '#2f55b5', label: 'синий' }, { id: 'red', c: '#b3202c', label: 'красный' }, { id: 'wine', c: '#5e1626', label: 'бордо' }, { id: 'olive', c: '#6a6a4c', label: 'хаки' }, { id: 'sand', c: '#c9b48a', label: 'песочный' },
  { id: 'brown', c: '#6b4a30', label: 'коричневый' }, { id: 'orange', c: '#d9641e', label: 'оранжевый' }, { id: 'yellow', c: '#e0b92e', label: 'жёлтый' }, { id: 'pink', c: '#e07a9c', label: 'розовый' }, { id: 'camo', c: '#5b5e44', pat: 'camo', label: 'камуфляж' }];
const WCATS = ['head', 'eyes', 'top', 'bottom', 'belt', 'shoes'], WCAT_LABEL = { head: 'голова', eyes: 'очки', top: 'верх', bottom: 'низ', belt: 'ремень', shoes: 'обувь', hands: 'руки', guard: 'капа' };
/* our own brands (made up): the mark is drawn in a 2 × 2 box, see brandMark */
const BRANDS = { 'STRAY DOGS': { f: '900 italic', k: 0.06 }, 'CONCRETE SAINTS': { f: '700', serif: 1, k: 0.12 }, 'COLDBLOOD': { f: '800 italic', k: 0.02 }, 'REDLINE': { f: '900 italic', k: 0.1 }, 'GUTTERWAVE': { f: '800', k: 0.04 },
  'BLACKOUT SUPPLY': { f: '900', stencil: 1, k: 0.14 }, 'IRON JAW': { f: '900', k: 0.16 }, '16OZ': { f: '900', k: 0.05 }, 'LOW BLOW': { f: '900 italic', k: 0.08 }, 'AFTERHOURS': { f: '300', k: 0.3 } };
const wNat = (o, extra) => Object.fromEntries(Object.entries(o).map(([k, c]) => [k, { id: k, c, ...(extra && extra[k]) }]));
const ITEMS = {
  // head
  cap: { cat: 'head', label: 'кепка', model: { hat: 'cap', off: [0.6, 0.75], logo: 'front' }, colors: ['black', 'white', 'red'], price: 300, tags: ['street'], brand: 'GUTTERWAVE' },
  capB: { cat: 'head', label: 'кепка назад', model: { hat: 'capB', off: [0.6, 0.75], logo: 'front' }, colors: ['black', 'navy', 'olive'], price: 300, tags: ['street'], brand: 'GUTTERWAVE' },
  beanie: { cat: 'head', label: 'бини', model: { hat: 'beanie', off: [0.8, 0.4], logo: 'cuff' }, colors: ['black', 'grey', 'wine'], price: 250, reward: 3, tags: ['street'], brand: 'CONCRETE SAINTS' },
  bandana: { cat: 'head', label: 'бандана', model: { hat: 'bandana', off: [0.95, 0.25] }, colors: ['red', 'black', 'navy'], price: 120, reward: 1, tags: ['street'] },
  // eyes
  shades: { cat: 'eyes', label: 'тёмные очки', model: { glass: 'shades', tint: [0.04, 0.04, 0.05, 0.95] }, colors: ['black', 'white', 'red'], price: 400, reward: 4, tags: ['street'], brand: 'AFTERHOURS' },
  specs: { cat: 'eyes', label: 'очки в оправе', model: { glass: 'specs', tint: [0.75, 0.85, 0.9, 0.16] }, colors: ['black', 'brown', 'grey'], price: 200, tags: [] },
  // tops: the real models (cuts with their own geometry) are in 04f_tops.js and replace these old shell models of the same ids
  tank: { cat: 'top', label: 'майка', model: { tex: 'cotton', sleeve: 0, thick: 0.42 }, colors: ['white', 'black'], price: 0, tags: ['street', 'basic'] },
  tee: { cat: 'top', label: 'футболка', model: { tex: 'cotton', sleeve: 0.55, thick: 0.45 }, colors: ['white', 'black', 'grey'], nat: wNat({ white: '#e9e6df', grey: '#9a9ca2' }), price: 150, tags: ['street', 'basic'] },
  teeSD: { cat: 'top', label: 'футболка', model: { tex: 'cotton', sleeve: 0.55, thick: 0.45, decal: { f: [0, 17, 21] } }, colors: ['black', 'white', 'wine'], price: 350, tags: ['street'], brand: 'STRAY DOGS' },
  hoodie: { cat: 'top', label: 'худи', model: { tex: 'sweat', sleeve: 1.9, thick: 1.15, hem: 11 }, colors: ['graphite', 'grey', 'black'], nat: wNat({ graphite: '#2b2e36' }, { graphite: { label: 'графит' } }), price: 400, reward: 6, tags: ['street', 'basic'] },
  hoodieCS: { cat: 'top', label: 'худи', model: { tex: 'sweat', sleeve: 1.9, thick: 1.15, hem: 11, decal: { f: [-7.5, 13, 8.5], b: [0, 17, 25] } }, colors: ['black', 'sand', 'wine'], price: 900, reward: 8, tags: ['street'], brand: 'CONCRETE SAINTS' },
  // bottoms: boxing trunks (cloth) or loose trousers / long shorts (04d_street.js)
  shorts: { cat: 'bottom', label: 'шорты', model: {}, colors: ['red', 'blue', 'black', 'white', 'green', 'purple'], nat: wNat({ red: '#8a0e1a', blue: '#12357e', black: '#17171a', white: '#ddd8cc', green: '#0f5a36', purple: '#4a1a6e' }, { green: { label: 'зелёный' }, purple: { label: 'фиолетовый' } }), price: 0, tags: ['ring', 'basic'] },
  jeans: { cat: 'bottom', label: 'джинсы', model: { cut: 'jeans', belt: 1 }, colors: ['indigo', 'black', 'worn'], nat: wNat({ indigo: '#34507a', black: '#1e1f24', worn: '#7f99b8' }, { indigo: { label: 'индиго' }, worn: { worn: 1, label: 'потёртые' } }), price: 300, tags: ['street', 'basic'] },
  sweat: { cat: 'bottom', label: 'спортивки', model: { cut: 'sweat' }, colors: ['grey', 'black'], nat: wNat({ black: '#1c1d21' }), price: 200, tags: ['street', 'basic'] },
  sweatS: { cat: 'bottom', label: 'с лампасами', model: { cut: 'sweat', stripe: '#e8e6e0', logo: 1 }, colors: ['black', 'navy', 'red'], nat: wNat({ black: '#1c1d21' }), price: 450, reward: 5, tags: ['street'], brand: 'COLDBLOOD' },
  cargo: { cat: 'bottom', label: 'карго', model: { cut: 'short', style: 'cargo', belt: 1, logo: 1 }, colors: ['olive', 'camo', 'black'], price: 400, tags: ['street'], brand: 'BLACKOUT SUPPLY' },
  bball: { cat: 'bottom', label: 'баскетбольные', model: { cut: 'short', style: 'bball', stripe: '#e8e6e0' }, colors: ['black', 'red', 'yellow'], nat: wNat({ black: '#18191d' }), price: 250, tags: ['street', 'basic'] },
  // belts (on jeans and cargo): leather + a metal buckle
  beltFrame: { cat: 'belt', label: 'рамка', model: { buckle: 'frame', metal: '#c9ccd2' }, colors: ['black', 'brown'], price: 150, reward: 2, tags: ['street', 'basic'] },
  beltPlate: { cat: 'belt', label: 'пластина', model: { buckle: 'plate', metal: '#b9bcc4' }, colors: ['black', 'brown'], price: 350, tags: ['street'], brand: 'IRON JAW' },
  beltWest: { cat: 'belt', label: 'ковбойская', model: { buckle: 'west', metal: '#c9a24a' }, colors: ['brown', 'black'], price: 500, reward: 7, tags: ['street'] },
  beltMil: { cat: 'belt', label: 'военная', model: { buckle: 'mil', metal: '#7d7f78' }, colors: ['olive', 'black', 'sand'], price: 250, tags: ['street'], brand: 'BLACKOUT SUPPLY' },
  // shoes
  sneak: { cat: 'shoes', label: 'кроссовки', model: { sole: '#f4f2ec', top: 8.5, stripe: '#9a9ca4', lace: '#ffffff', auto: 1 }, colors: ['white', 'black'], nat: wNat({ white: '#e9e9ec', black: '#17181c' }, { white: { stripe: '#9a9ca4' }, black: { sole: '#e9e6df', stripe: '#e8e6e0', lace: '#d8d8dc' } }), price: 300, tags: ['street', 'basic'] },
  runner: { cat: 'shoes', label: 'беговые', model: { sole: '#f4f2ec', top: 8.5, lace: '#ffffff', logo: 1 }, colors: ['red', 'white', 'black'], price: 700, tags: ['street'], brand: 'REDLINE' },
  boots: { cat: 'shoes', label: 'боксёрки', model: { sole: '#d9d4c8', top: 20, boot: '#f2f0ea', lace: '#f2f0ea' }, colors: ['black', 'red', 'white'], nat: wNat({ black: '#16171b' }), price: 500, tags: ['ring', 'basic'] },
  keds: { cat: 'shoes', label: 'кеды', model: { sole: '#f1eee6', top: 13, cap: '#f1eee6', band: '#b3202c', patch: '#f1eee6', canvas: 1, lace: '#f4f2ec' }, colors: ['black', 'red', 'navy'], nat: wNat({ black: '#1b1c21' }), price: 250, tags: ['street', 'basic'] },
  skate: { cat: 'shoes', label: 'скейтерские', model: { sole: '#f1eee6', top: 9.5, canvas: 1, lace: '#f4f2ec', logo: 1 }, colors: ['black', 'olive', 'sand'], price: 450, tags: ['street'], brand: 'GUTTERWAVE' },
  // hands and the gum shield: the registry knows them (brand, price); their look fields are still LOOK.hands / wraps / gloves / guard
  wraps: { cat: 'hands', label: 'бинты', model: {}, colors: ['white', 'black', 'red', 'blue', 'gold'], price: 0, tags: ['ring', 'basic'] },
  mma: { cat: 'hands', label: 'MMA 4 oz', model: {}, colors: ['red', 'black', 'blue', 'white'], price: 600, tags: ['ring'], brand: 'IRON JAW' },
  knux: { cat: 'hands', label: 'Кастет', model: { metal: 'gold' }, colors: ['gold', 'steel'], price: 800, tags: ['ring'], brand: 'IRON JAW' },
  box16: { cat: 'hands', label: 'спарринговые 16 oz', model: {}, colors: ['red', 'black', 'blue', 'white'], price: 0, noShop: 1, tags: ['ring'], brand: '16OZ' },
  guard: { cat: 'guard', label: 'капа', model: {}, colors: ['clear', 'black', 'red', 'blue', 'gold'], price: 0, noShop: 1, tags: ['ring'], brand: 'LOW BLOW' },
};
for (const k in ITEMS) ITEMS[k].id = k;
const WNONE = { head: 'без', eyes: 'без', top: 'без', belt: 'без', shoes: 'босиком' };   // categories that may be empty (id 'none')
// ids of the old fixed-colour lists → { id, color }
const WLEG = { tankB: ['tank', 'black'], teeW: ['tee', 'white'], teeB: ['tee', 'black'], teeG: ['tee', 'grey'], jeansB: ['jeans', 'black'], jeansL: ['jeans', 'worn'], sweatG: ['sweat', 'grey'], pants: ['sweat', 'black'], sneakB: ['sneak', 'black'] };
const wRng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const wLum = c => { const k = new THREE.Color(c); return 0.3 * k.r + 0.6 * k.g + 0.1 * k.b; };
const wInk = c => wLum(c) > 0.3 ? '#17181c' : '#ecebe6';
function wearGet(L, cat) {
  let x = L[cat];
  if (typeof x === 'string') x = WLEG[x] ? { id: WLEG[x][0], color: WLEG[x][1] } : { id: x };
  if (!x || !x.id) x = { id: cat === 'bottom' ? 'shorts' : 'none' };
  if (x.id === 'shorts' && !x.color) x = { id: 'shorts', color: L.shorts || 'red' };
  return x;
}
// an old save → the new format, in place
function wearMigrate(L) { for (const c of WCATS) L[c] = wearGet(L, c); delete L.shorts; return L; }
const wearItems = cat => Object.values(ITEMS).filter(i => i.cat === cat);
const wearColors = it => [...it.colors, ...WCOL.map(c => c.id).filter(id => !it.colors.includes(id))];
const wearColor = (it, id) => { const n = it.nat && it.nat[id], p = WCOL.find(c => c.id === id); return n ? { ...p, ...n } : p || wearColor(it, it.colors[0]); };
// the model + the colour: what pantsMesh / shoeMesh / shellMesh and the builders below get
function itemVar(cat, sel) {
  let it = ITEMS[sel.id]; if (!it || it.cat !== cat) { if (cat !== 'bottom') return { mid: 'none', key: null }; it = ITEMS.shorts; }
  const col = wearColor(it, sel.color || it.colors[0]), v = { ...it.model, ...col, mid: it.id, colId: col.id, brand: it.brand, item: it };
  if (it.model.auto && !(it.nat && it.nat[col.id])) v.stripe = wLum(col.c) > 0.3 ? '#55575e' : '#e8e6e0';
  v.key = v.id = it.id + '_' + col.id; return v;
}
function wearShorts(v) {
  const S = SHORTS_LOOKS.find(x => x.id === v.colId && x.main === v.c); if (S) return S;
  const c = new THREE.Color(v.c), hx = k => '#' + c.clone().multiplyScalar(k).getHexString(), lite = wLum(v.c) > 0.3;
  return { main: v.c, trim: lite ? '#17171a' : '#d6a640', band: lite ? '#17171a' : hx(0.45), sheen: '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.35).getHexString() };
}
// a random street outfit (underground fights): the hook for rollOpponent; r = a random source
function streetLook(r = rr) {
  const pick = a => a[(r() * a.length) | 0], of = (cat, pNone) => { if (r() < pNone) return { id: 'none' }; const it = pick(wearItems(cat).filter(i => i.tags.includes('street'))); return { id: it.id, color: pick(it.colors) }; };
  const L = { street: true, bottom: of('bottom', 0), top: of('top', 0.35), shoes: of('shoes', 0.15), head: of('head', 0.6), eyes: of('eyes', 0.8), belt: of('belt', 0.4) };
  return L;
}

/* —— painting: camouflage, brand marks —— */
function camoPaint(g, w, h, s = 1) {
  const R = wRng(7); g.fillStyle = '#5b5e44'; g.fillRect(0, 0, w, h);
  for (const c of ['#3c4030', '#7d7652', '#262820']) { g.fillStyle = c; for (let i = 0; i < w * h / (5200 * s * s); i++) { const x = R() * w, y = R() * h; g.beginPath(); for (let k = 0; k < 5; k++) g.ellipse(x + (R() - 0.5) * 60 * s, y + (R() - 0.5) * 40 * s, (10 + R() * 26) * s, (6 + R() * 14) * s, R() * 3, 0, 7); g.fill(); } }
}
const camoTex = () => GEAR.t_camo || (GEAR.t_camo = canvasTex(512, 512, (g, w, h) => camoPaint(g, w, h, 1.6)));
// the mark of a brand, centred on (x, y), in a box of half-size s
function brandMark(g, b, x, y, s, ink) {
  const L = (pts, close) => { g.beginPath(); pts.forEach(([a, c], i) => i ? g.lineTo(a, c) : g.moveTo(a, c)); if (close) g.closePath(); };
  g.save(); g.translate(x, y); g.scale(s, s); g.strokeStyle = g.fillStyle = ink; g.lineWidth = 0.13; g.lineJoin = g.lineCap = 'round';
  if (b === 'STRAY DOGS') {   // a snarling dog's head in one line
    L([[-0.75, 0.95], [-0.8, 0.1], [-0.62, -0.95], [-0.3, -0.42], [0.1, -0.4], [0.32, -0.18], [0.95, -0.05], [1, 0.14], [0.78, 0.2], [0.66, 0.36], [0.54, 0.2], [0.42, 0.38], [0.3, 0.22], [0.12, 0.34], [0.34, 0.5], [0.46, 0.4], [0.58, 0.56], [0.7, 0.46], [0.82, 0.62], [0.72, 0.78], [0, 0.8], [-0.3, 0.95]]); g.stroke();
    L([[0.02, -0.14], [0.3, -0.02]]); g.stroke();
  } else if (b === 'CONCRETE SAINTS') {   // a halo over a brick
    g.beginPath(); g.ellipse(0, -0.62, 0.62, 0.2, 0, 0, 7); g.stroke(); g.strokeRect(-0.8, -0.1, 1.6, 0.85); L([[-0.8, 0.32], [0.8, 0.32]]); g.stroke(); L([[0, -0.1], [0, 0.32]]); g.stroke(); L([[-0.4, 0.32], [-0.4, 0.75]]); g.stroke(); L([[0.4, 0.32], [0.4, 0.75]]); g.stroke();
  } else if (b === 'COLDBLOOD') {   // a drop with a thermometer in it
    g.beginPath(); g.moveTo(0, -1); g.bezierCurveTo(0.2, -0.4, 0.75, 0, 0.75, 0.4); g.arc(0, 0.4, 0.75, 0, Math.PI); g.bezierCurveTo(-0.75, 0, -0.2, -0.4, 0, -1); g.stroke();
    L([[0, -0.3], [0, 0.4]]); g.stroke(); g.beginPath(); g.arc(0, 0.52, 0.24, 0, 7); g.fill();
  } else if (b === 'REDLINE') {   // a rev counter: the needle past the red line
    g.beginPath(); g.arc(0, 0.25, 0.9, Math.PI * 0.95, Math.PI * 1.75); g.stroke(); g.lineWidth = 0.26; g.beginPath(); g.arc(0, 0.25, 0.9, Math.PI * 1.82, Math.PI * 2.05); g.stroke();
    L([[-0.1, 0.33], [0.72, -0.5], [0.08, 0.17]], 1); g.fill(); g.beginPath(); g.arc(0, 0.25, 0.14, 0, 7); g.fill();
  } else if (b === 'GUTTERWAVE') {   // a wave out of a manhole
    g.beginPath(); g.ellipse(0, 0.62, 0.9, 0.26, 0, 0, 7); g.stroke(); L([[-0.45, 0.62], [0.45, 0.62]]); g.stroke();
    g.beginPath(); g.moveTo(-0.6, 0.5); g.bezierCurveTo(-0.7, -0.5, 0, -1.1, 0.62, -0.62); g.bezierCurveTo(0.2, -0.7, -0.05, -0.4, 0.12, -0.1); g.bezierCurveTo(0.3, -0.3, 0.6, -0.2, 0.55, 0.5); g.stroke();
  } else if (b === 'BLACKOUT SUPPLY') {   // a square patch, half blacked out
    g.strokeRect(-0.8, -0.8, 1.6, 1.6); L([[-0.8, 0.8], [0.8, -0.8], [0.8, 0.8]], 1); g.fill(); g.fillRect(-0.52, -0.52, 0.5, 0.16); g.fillRect(-0.52, -0.24, 0.26, 0.16);
  } else if (b === 'IRON JAW') {   // a shield that is a lower jaw
    L([[-0.85, -0.8], [0.85, -0.8], [0.85, 0.1], [0, 0.95], [-0.85, 0.1]], 1); g.stroke(); L([[-0.85, -0.3], [-0.5, -0.3], [-0.5, -0.02], [-0.17, -0.02], [-0.17, -0.3], [0.17, -0.3], [0.17, -0.02], [0.5, -0.02], [0.5, -0.3], [0.85, -0.3]]); g.stroke();
  } else if (b === '16OZ') {   // the number in a circle
    g.beginPath(); g.arc(0, 0, 0.9, 0, 7); g.stroke(); g.font = '900 1px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('16', 0, 0.06);
  } else if (b === 'LOW BLOW') {   // lightning, straight down
    L([[0.3, -1], [-0.5, 0.05], [-0.02, 0.05], [-0.3, 1], [0.55, -0.2], [0.05, -0.2]], 1); g.fill();
  } else if (b === 'AFTERHOURS') {   // a half moon
    g.beginPath(); g.arc(0, 0, 0.85, Math.PI * 0.5, Math.PI * 1.5); g.closePath(); g.fill(); g.beginPath(); g.arc(0, 0, 0.85, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
  }
  g.restore();
}
// mark + wordmark, centred on (x, y); w = the width of the whole logo. mode: 'stack' (mark over the name), 'row', 'word', 'mark'
function brandLogo(g, b, x, y, w, ink, mode = 'stack') {
  const B = BRANDS[b]; if (!B) return;
  if (mode === 'mark') return brandMark(g, b, x, y, w / 2, ink);
  const fam = B.serif ? '"Old English Text MT", "UnifrakturCook", Georgia, "Times New Roman", serif' : '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';
  const word = (cx, cy, ww) => { let px = 40; g.font = `${B.f} ${px}px ${fam}`; const sp = B.k * px, m = g.measureText(b).width + sp * (b.length - 1); px *= ww / m; g.font = `${B.f} ${px}px ${fam}`; g.fillStyle = ink; g.textAlign = 'left'; g.textBaseline = 'middle';
    let cxx = cx - ww / 2; for (const ch of b) { g.fillText(ch, cxx, cy); cxx += g.measureText(ch).width + B.k * px; }
    if (B.stencil) { g.save(); g.globalCompositeOperation = 'destination-out'; for (let q = cx - ww / 2 + px * 0.33; q < cx + ww / 2; q += px * 0.74) g.fillRect(q, cy - px, px * 0.09, px * 2); g.restore(); }
    return px; };
  if (mode === 'word') word(x, y, w);
  else if (mode === 'row') { const s = w * 0.11; brandMark(g, b, x - w / 2 + s, y, s, ink); word(x + s * 1.3, y, w - s * 2.6); }
  else { const s = w * 0.24; brandMark(g, b, x, y - s * 0.55, s, ink); word(x, y + s * 0.95, w); }
}
// a small logo for the menus (data URL)
function brandIcon(b) { const K = 'bi_' + b; if (GEAR[K]) return GEAR[K]; const c = document.createElement('canvas'); c.width = c.height = 48; brandMark(c.getContext('2d'), b, 24, 24, 19, '#e9e6df'); return GEAR[K] = c.toDataURL(); }
// prints on a top: front in the left half of the texture, back in the right half
function decalTex(v) {
  const ink = wInk(v.c), K = 'dec_' + v.mid + ink;
  return GEAR[K] || (GEAR[K] = canvasTex(1024, 512, g => { for (const [k, x] of [['f', 256], ['b', 768]]) if (v.decal[k]) brandLogo(g, v.brand, x, 256, v.decal[k][2] < 12 ? 380 : 440, ink, v.decal[k][2] < 12 ? 'mark' : 'stack'); }));
}
function topTint(m, v) {
  const mat = m.material, U = mat.userData.U, tx = v.pat ? camoTex() : GEAR['t_' + v.tex];
  mat.color.set(v.pat ? '#ffffff' : v.c); mat.sheenColor.set(v.c);
  if (mat.userData.src !== tx) { mat.userData.src = tx; mat.map = tx.clone(); mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(v.pat ? 3 : 6, v.pat ? 3 : 6); mat.map.needsUpdate = true; }
  const d = v.decal, n = GEAR.neck, set = (u, q, sg) => q ? u.value.set(q[0], n - q[1], sg / q[2], 1 / q[2]) : u.value.set(0, 0, 0, 0);
  U.uDecal.value = d ? decalTex(v) : wearBlank(); set(U.uDecF, d && d.f, 1); set(U.uDecB, d && d.b, -1);
}
const wearBlank = () => GEAR.blank || (GEAR.blank = canvasTex(2, 2, () => {}));

/* —— hats: built on the head's own surface (headMap, cm, x to his left, y up, z to the face) —— */
const HATS = {
  cap: { lo: a => 4.4 - 3.0 * gsm(50, 170, a), gap: 0.75, th: (a, v) => 0.15 + 1.1 * gsm(75, 15, a) * Math.sin(Math.PI * Math.min(1, v * 1.5)) * (1 - 0.5 * v), visor: 0 },
  capB: { lo: a => 5.6 - 3.4 * gsm(30, 150, a), gap: 0.75, th: (a, v) => 0.15 + 1.1 * gsm(105, 165, a) * Math.sin(Math.PI * Math.min(1, v * 1.5)) * (1 - 0.5 * v), visor: 180 },
  beanie: { lo: a => 4.3 - 2.6 * gsm(35, 85, a) - 2.2 * gsm(110, 170, a), gap: 0.8, th: (a, v) => 0.5 + 0.5 * gsm(0.3, 0.22, v) + 1.3 * gsm(0.72, 1, v) },
  bandana: { lo: a => 3.9 - 1.5 * gsm(40, 90, a) - 2.4 * gsm(110, 170, a), gap: 0.55, th: () => 0.12, knot: 1 },
};
function hatGeo(F, kind) {
  const K = 'hat_' + kind; if (GEAR[K]) return GEAR[K];
  const hr = headMap(F), P = HATS[kind], D = Math.PI / 180, O = new V3(), up = new V3(0, 1, 0), e = new V3(), parts = [];
  const dirAY = (a, y, o) => { let r = 9.5; for (let k = 0; k < 5; k++) { const el = Math.asin(clamp(y / r, -0.98, 0.98)); o.set(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el)); r = hr.s(o); } return o; };
  const fold = a => { a = Math.abs(((a / D) % 360 + 540) % 360 - 180); return a; };   // degrees from the face, 0…180
  const rot = (P.visor || 0) * D, az = u => (u - 0.5) * 2 * Math.PI + rot;   // u = 0.5: the front of the hat
  const surf = (a, v, o) => { dirAY(a, P.lo(fold(a)), e); o.copy(e).lerp(up, v).normalize(); return o.multiplyScalar(hr.s(o) + P.gap + P.th(fold(a), v)); };
  const uvs = (g, u0, v0, ku, kv) => { const t = g.attributes.uv; for (let i = 0; i < t.count; i++) t.setXY(i, u0 + t.getX(i) * ku, v0 + t.getY(i) * kv); return g; };
  parts.push(uvs(gridGeo((u, v, o) => surf(az(u), v, o), 56, 14, { c: O }), 0, 0, 1, 0.75));
  if (P.visor !== undefined) {   // the peak: the front edge carried forward, rounded, a little bent down at the sides
    const f = new V3(Math.sin(rot), -0.2, Math.cos(rot)).normalize();
    parts.push(uvs(gridGeo((u, v, o) => { const s = 2 * u - 1; surf(rot + s * 62 * D, 0.03, o); return o.addScaledVector(f, v * 7.4 * Math.sqrt(Math.max(0, 1 - s * s * 0.86)) - 0.3).setY(o.y - v * (0.5 + 0.9 * s * s)); }, 20, 6, { c: new V3(0, -30, 0), inv: true }), 0, 0.76, 1, 0.24));
    parts.push(uvs(gridGeo((u, v, o) => o.set(Math.sin(u * 6.283) * Math.sin(v * 1.2) * 0.75, hr.s(up) + P.gap + 0.1 + Math.cos(v * 1.2) * 0.35, Math.cos(u * 6.283) * Math.sin(v * 1.2) * 0.75), 8, 3, { c: new V3(0, 5, 0) }), 0.02, 0.6, 0.01, 0.01));   // the button
  }
  if (P.knot) {   // the knot at the back and its two ends
    const c = surf(Math.PI, 0.06, new V3()).clone(); c.z -= 0.5;
    parts.push(uvs(gridGeo((u, v, o) => o.set(c.x + Math.sin(v * 3.1416) * Math.cos(u * 6.283) * 1.5, c.y + Math.cos(v * 3.1416) * 1.0, c.z + Math.sin(v * 3.1416) * Math.sin(u * 6.283) * 0.9), 10, 6, { c }), 0, 0, 0.2, 0.2));
    for (const sg of [-1, 1]) parts.push(uvs(gridGeo((u, v, o) => o.set(c.x + sg * (0.5 + v * 2.2) + (u - 0.5) * 0.4 * sg, c.y - v * 5.5 - (u - 0.5) * (1.2 + v * 1.6), c.z - 0.3 - v * 1.2 + Math.sin(v * 5) * 0.3), 3, 6, { c: new V3(c.x, c.y - 3, c.z + 4) }), 0, 0, 0.3, 0.3));
  }
  const g = mergeGeos(parts); g.scale(0.01, 0.01, 0.01); g.computeBoundingBox(); return GEAR[K] = g;
}
// the hat's texture, colour baked in: crown in the lower 3/4 (u = 0.5 is its front), the peak in the top quarter
function hatTex(v) {
  return canvasTex(512, 256, (g, W, H) => {
    const ink = wInk(v.c), kind = v.hat; g.fillStyle = v.c; g.fillRect(0, 0, W, H); if (v.pat) camoPaint(g, W, H, 0.6);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,255'},${rr() * 0.07})`; g.fillRect(rr() * W, rr() * H, 1.5, 1.5); }
    const Y = t => H - t * H * 0.75;   // crown: t = 0 the edge … 1 the top
    if (kind === 'beanie') { for (let x = 0; x < W; x += 6) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, 0, 2, H); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 3, 0, 1.5, H); } g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, Y(0.27), W, 3);
      if (v.brand) { g.fillStyle = ink; g.fillRect(W / 2 - 30, Y(0.22), 60, Y(0.05) - Y(0.22)); brandLogo(g, v.brand, W / 2, (Y(0.22) + Y(0.05)) / 2, 30, v.c, 'mark'); } }
    else if (kind === 'bandana') { g.fillStyle = ink; for (let y = 8; y < H; y += 22) for (let x = (y % 44 ? 0 : 11); x < W; x += 22) { g.globalAlpha = 0.75; g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); g.globalAlpha = 0.5; g.beginPath(); g.ellipse(x + 9, y + 9, 5, 2, 0.8, 0, 7); g.stroke(); } g.globalAlpha = 1; g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, Y(0.04), W, 3); }
    else { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let k = 0; k < 6; k++) { const x = (k + 0.5) * W / 6 + (k < 3 ? -1 : 1) * 0; g.beginPath(); g.moveTo(x, Y(0)); g.lineTo(x, Y(1)); g.stroke(); } g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, Y(0.035), W, 2.5);
      g.fillStyle = v.c; g.fillRect(W / 2 - 38, Y(0.5), 76, Y(0.08) - Y(0.5)); if (v.brand) brandLogo(g, v.brand, W / 2, Y(0.3), 70, ink, 'stack');
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, W, H * 0.24); g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1.2; for (const o of [10, 16, 22]) { g.beginPath(); g.moveTo(0, H * 0.24 - o * 2); g.lineTo(W, H * 0.24 - o * 2); g.stroke(); } }
  });
}

/* —— glasses: rims, bridge, temples (frame colour) + lenses (their own tint and alpha in the vertex colour), one mesh —— */
function glassGeo(F, v) {
  const K = 'gl_' + v.glass; if (GEAR[K]) return GEAR[K];
  const hr = headMap(F), p = new V3(), t1 = new V3(), t2 = new V3(), n1 = new V3(), n2 = new V3(), zr = new V3(0, 0, 1), yr = new V3(0, 1, 0), sp = v.glass === 'specs';
  // where the eyes are, in the head frame
  let ex = 3.15, ey = 0.9; const eb = F.bones.CC_Base_L_Eye, er = F.bones.CC_Base_R_Eye;
  if (eb && er) { p.setFromMatrixPosition(eb.matrixWorld).applyMatrix4(F.headFrameInv).multiplyScalar(100); t1.setFromMatrixPosition(er.matrixWorld).applyMatrix4(F.headFrameInv).multiplyScalar(100); ex = clamp(Math.abs(p.x - t1.x) / 2, 2.6, 3.8); ey = clamp((p.y + t1.y) / 2, -1, 3); }
  const dn = new V3(0, ey, 9).normalize(), z0 = hr(dn) * dn.z + 0.55, w = sp ? 2.45 : 2.75, h = sp ? 1.85 : 2.15, n = sp ? 2.6 : 3.2, cx = Math.max(ex, w + 0.75), cy = ey - 0.25;
  const se = (c, k) => Math.sign(c) * Math.pow(Math.abs(c), 2 / k), wrap = x => z0 - 0.022 * x * x;
  const tube = (cf, r, nu, ref, rz) => { cf(0.37, p); const c = p.clone(); return gridGeo((u, q, o) => { cf(u, o); cf(u + 0.004, t1); cf(u - 0.004, t2); t1.sub(t2).normalize(); n1.crossVectors(t1, ref).normalize(); n2.crossVectors(t1, n1); const a = q * 6.2832; return o.addScaledVector(n1, Math.cos(a) * r).addScaledVector(n2, Math.sin(a) * (rz || r)); }, nu, 6, { c }); };
  const rim = (sg, u, o) => { const a = u * 6.2832, x = sg * cx + w * se(Math.cos(a), n), y = cy + h * se(Math.sin(a), n) * (1 - 0.12 * Math.cos(a) * sg * -1 * 0); return o.set(x, y, wrap(x)); };
  const ear = new V3(0, 0, 0); { const d = new V3(1, 0.1, -0.12).normalize(); ear.copy(d).multiplyScalar(hr.s(d) + 0.3); }
  const temple = (sg, u, o) => { const a = new V3(sg * (cx + w + 0.15), cy + h * 0.45, wrap(cx + w) - 0.2), b = new V3(sg * (ear.x + 0.1), cy + h * 0.5, 1.5), c = new V3(sg * (ear.x - 0.1), cy - 1.6, ear.z - 2.6); return u < 0.8 ? o.lerpVectors(a, b, u / 0.8) : o.lerpVectors(b, c, (u - 0.8) / 0.2).setY(lerp(b.y, c.y, ((u - 0.8) / 0.2) ** 2)); };
  const P = {}, rr2 = sp ? 0.16 : 0.26;
  for (const [S, sg] of [['L', 1], ['R', -1]]) {
    P['rim' + S] = tube((u, o) => rim(sg, u, o), rr2, 40, zr, rr2 * 1.25);
    P['tmp' + S] = tube((u, o) => temple(sg, u, o), sp ? 0.13 : 0.19, 14, yr, sp ? 0.2 : 0.42);
    P['lens' + S] = gridGeo((u, q, o) => { const a = u * 6.2832, x = sg * cx + w * q * se(Math.cos(a), n); return o.set(x, cy + h * q * se(Math.sin(a), n), wrap(x)); }, 24, 3, { c: new V3(0, 0, -20) });
    const t = P['lens' + S].attributes; for (let i = 0; i < t.uv.count; i++) t.uv.setXY(i, (sg > 0 ? 0.25 : 0.75) + (t.position.getX(i) - sg * cx) / w * 0.22, 0.5 + (t.position.getY(i) - cy) / h * 0.44);
  }
  P.bridge = tube((u, o) => { const x = lerp(-(cx - w), cx - w, u); return o.set(x, cy + h * 0.35 + 0.25 * Math.sin(u * 3.1416), wrap(x) + 0.05); }, rr2 * 0.85, 8, zr);
  // a part list → geometry with RGBA vertex colours; the frame's uv points at an empty corner of the crack texture
  const build = names => { const fr = names.filter(k => !/lens/.test(k)), ln = names.filter(k => /lens/.test(k)), g = mergeGeos([...fr, ...ln].map(k => P[k])), nF = fr.reduce((s, k) => s + P[k].attributes.position.count, 0), N = g.attributes.position.count, col = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) { col.set(i < nF ? [1, 1, 1, 1] : v.tint, i * 4); if (i < nF) g.attributes.uv.setXY(i, 0.005, 0.005); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.scale(0.01, 0.01, 0.01); g.computeBoundingBox(); return g; };
  return GEAR[K] = { all: build(['rimL', 'rimR', 'bridge', 'tmpL', 'tmpR', 'lensL', 'lensR']), parts: [['rimL', 'bridge', 'lensL'], ['rimR'], ['tmpL'], ['tmpR'], ['lensR']].map(build) };
}
// cracks from a point in each lens (left half / right half of the texture); alpha = the crack
const crackTex = () => GEAR.t_crack || (GEAR.t_crack = (() => { const t = canvasTex(512, 256, (g, W, H) => {
  const R = wRng(31); g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  for (const x0 of [W * 0.25, W * 0.75]) { const cx = x0 + (R() - 0.5) * 50, cy = H / 2 + (R() - 0.5) * 60, tips = [];
    for (let k = 0; k < 11; k++) { let a = k / 11 * 6.283 + R() * 0.4, x = cx, y = cy; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 7; s++) { a += (R() - 0.5) * 0.5; x += Math.cos(a) * 20; y += Math.sin(a) * 20; g.lineTo(x, y); if (s === 2 || s === 4) tips.push([x, y, k]); } g.stroke(); }
    g.lineWidth = 1.3; for (let i = 0; i < tips.length; i++) { const a = tips[i], b = tips[(i + 2) % tips.length]; if (Math.abs(a[2] - b[2]) <= 1 || R() < 0.25) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); } }
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill(); } }); return t; })());
function glassMat(v) {
  const sp = v.glass === 'specs', U = { uCrack: { value: new THREE.Vector2() } };
  const mat = new THREE.MeshPhysicalMaterial({ color: v.c, map: crackTex(), vertexColors: true, transparent: true, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: sp ? 1.2 : 1.6, side: THREE.DoubleSide });
  mat.onBeforeCompile = s => { Object.assign(s.uniforms, U);
    s.fragmentShader = 'uniform vec2 uCrack;\n' + s.fragmentShader.replace('#include <map_fragment>', `{ float ck = texture2D( map, vMapUv ).a * ( vMapUv.x < 0.5 ? uCrack.x : uCrack.y ); diffuseColor = mix( diffuseColor, vec4( 0.82, 0.86, 0.88, 0.95 ), ck ); }`); };
  mat.customProgramCacheKey = () => 'glasses'; mat.userData.U = U; return mat;
}

/* —— belt: a band cut from the trousers' own waist (same skin weights) + a buckle carried by the front of it —— */
function beltGeo(F, cut, kind) {
  const K = 'belt_' + cut + kind; if (GEAR[K]) return GEAR[K];
  const pg = pantsGeo(F, cut), pp = pg.attributes.position, pn = pg.attributes.normal, N = 21, rings = pp.count / 2 / N; let zt = -1e9; for (let i = 0; i < pp.count; i++) zt = Math.max(zt, pp.getZ(i));
  const pos = [], nor = [], uv = [], met = [], si = [], sw = [], idx = [], a = new V3(), b = new V3(), n = new V3(), zB = zt - 4.9, zT = zt - 1.3, th = 0.42;
  const copySkin = i => { for (let k = 0; k < 4; k++) { si.push(pg.attributes.skinIndex.getComponent(i, k)); sw.push(pg.attributes.skinWeight.getComponent(i, k)); } };
  const at = (s, j, z) => { let k = 0; while (k < rings - 3 && pp.getZ((s * rings + k + 1) * N + j) < z) k++; const i0 = (s * rings + k) * N + j, i1 = i0 + N; a.fromBufferAttribute(pp, i0); b.fromBufferAttribute(pp, i1); const t = clamp((z - a.z) / Math.max(1e-4, b.z - a.z), 0, 1); a.lerp(b, t); n.fromBufferAttribute(pn, t < 0.5 ? i0 : i1); n.z = 0; n.normalize(); return t < 0.5 ? i0 : i1; };
  let front = null;
  for (let s = 0; s < 2; s++) { let len = 0; const prev = new V3();
    for (let j = 0; j < N; j++) { const base = pos.length / 3; at(s, j, (zB + zT) / 2); if (j) len += a.distanceTo(prev); prev.copy(a); const mid = Math.abs(a.x) < 0.35 && (j > 3 && j < N - 4);   // (the inner wall of a leg's tube lies on the midline: no belt there)
      if (!front || a.y < front.p.y - 0.01 * Math.abs(a.x) && Math.abs(a.x) < 0.5) { const i = at(s, j, (zB + zT) / 2); front = { p: a.clone(), n: n.clone(), i }; }
      for (const [z, o, vv] of [[zB, 0.05, 0], [zB, th, 0.12], [zT, th, 0.88], [zT, 0.05, 1]]) { const i = at(s, j, z); pos.push(a.x + n.x * o, a.y + n.y * o, a.z); nor.push(vv === 0 ? 0 : vv === 1 ? 0 : n.x, vv === 0 ? 0 : vv === 1 ? 0 : n.y, vv === 0 ? -1 : vv === 1 ? 1 : 0); uv.push(len / 14, vv * 0.5); met.push(0); copySkin(i); }
      if (j && !(mid && Math.abs(pos[(base - 4) * 3]) < 0.35)) for (let q = 0; q < 3; q++) { const A = base - 4 + q, B = base + q; if (s) idx.push(A, B, A + 1, B, B + 1, A + 1); else idx.push(A, A + 1, B, B, A + 1, B + 1); } } }
  // the buckle, cm: x across, y up, z out of the belly
  const bk = [], T = THREE, add = (g, uvf) => { g = g.index ? g.toNonIndexed() : g; bk.push([g, uvf]); }, sq = (w, h, r, tz) => { const g = new T.TorusGeometry(1.4142, r, 6, 4); g.rotateZ(Math.PI / 4); g.scale(w / 2, h / 2, tz || 1); return g; };
  const cyl = (r, l, x, y, z, rz) => { const g = new T.CylinderGeometry(r, r, l, 8); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };
  if (kind === 'frame') { add(sq(5.0, 4.3, 0.26, 1.3).translate(0, 0, 0.35)); add(cyl(0.16, 4.6, 0.2, 0, 0.62, Math.PI / 2)); add(cyl(0.22, 4.1, -2.4, 0, 0.3)); }
  else if (kind === 'plate') { const g = new T.BoxGeometry(6.8, 4.9, 0.55); g.translate(0, 0, 0.5); add(g, 1); add(sq(6.8, 4.9, 0.2, 1.2).translate(0, 0, 0.72)); }
  else if (kind === 'west') { const g = new T.SphereGeometry(1, 20, 10); g.scale(4.3, 3.2, 0.62); g.translate(0, 0, 0.4); add(g); const r = new T.TorusGeometry(1, 0.075, 5, 28); r.scale(4.0, 2.9, 2.2); r.translate(0, 0, 0.72); add(r); const s = new T.SphereGeometry(1, 10, 6); s.scale(1.5, 1.1, 0.45); s.translate(0, 0, 0.98); add(s);
    for (let k = 0; k < 4; k++) { const q = new T.SphereGeometry(0.34, 6, 4); q.translate(Math.cos(k * 1.571 + 0.785) * 2.7, Math.sin(k * 1.571 + 0.785) * 1.85, 0.78); add(q); } }
  else { add(sq(4.6, 4.5, 0.22, 1.3).translate(0.3, 0, 0.35)); add(cyl(0.42, 4.0, 2.6, 0, 0.42)); add(cyl(0.15, 4.4, -0.2, 0, 0.6, Math.PI / 2)); const g = new T.BoxGeometry(1.6, 4.5, 0.3); g.translate(-2.4, 0, 0.3); add(g); }
  const X = new V3(-front.n.y, front.n.x, 0), Zo = front.n, C = front.p.clone().addScaledVector(Zo, th); C.z = (zB + zT) / 2;
  for (const [g, uvf] of bk) { const base = pos.length / 3, P = g.attributes.position, Nn = g.attributes.normal;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = Nn.getX(i), ny = Nn.getY(i), nz = Nn.getZ(i);
      pos.push(C.x + X.x * x + Zo.x * z, C.y + X.y * x + Zo.y * z, C.z + y); nor.push(X.x * nx + Zo.x * nz, X.y * nx + Zo.y * nz, ny); met.push(1); copySkin(front.i);
      if (uvf && nz > 0.9) uv.push(0.5 + x / 6.8 * 0.92, 0.75 + y / 4.9 * 0.46); else uv.push(0.01, 0.99); idx.push(base + i); } }
  const geo = new THREE.BufferGeometry(), A = (k, arr, sz, T2 = Float32Array) => geo.setAttribute(k, new THREE.BufferAttribute(new T2(arr), sz));
  A('position', pos, 3); A('normal', nor, 3); A('uv', uv, 2); A('aMet', met, 1); A('skinIndex', si, 4, Uint16Array); A('skinWeight', sw, 4); geo.setAttribute('aHem', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2)); geo.setIndex(idx);
  return GEAR[K] = geo;
}
// strap in the lower half of the texture (stitching, holes), the plate's engraving in the upper half
function beltTex(v) {
  const K = 'bt_' + (v.buckle === 'plate' ? v.brand : ''); return GEAR[K] || (GEAR[K] = (() => { const t = canvasTex(512, 256, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${rr() * 0.12})`; g.fillRect(rr() * W, H / 2 + rr() * H / 2, 2, 2); }
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, H * 0.5, W, 6); g.fillRect(0, H - 6, W, 6); g.setLineDash([7, 5]); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2; for (const y of [H * 0.5 + 22, H - 22]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.setLineDash([]); if (v.buckle === 'plate' && v.brand) { brandLogo(g, v.brand, W / 2, H * 0.25, W * 0.4, 'rgba(20,20,24,0.75)', 'stack'); g.strokeStyle = 'rgba(20,20,24,0.5)'; g.lineWidth = 3; g.strokeRect(40, 12, W - 80, H / 2 - 24); } }); t.wrapS = THREE.RepeatWrapping; return t; })());
}
function beltMesh(F, cut, v) {
  const U = { uBk: { value: new THREE.Color(v.metal) } };
  const mat = new THREE.MeshPhysicalMaterial({ color: v.c, map: beltTex(v), roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 1.3 });
  mat.onBeforeCompile = s => { Object.assign(s.uniforms, U);
    s.vertexShader = 'attribute float aMet; varying float vMet;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vMet = aMet;');
    s.fragmentShader = 'varying float vMet; uniform vec3 uBk;\n' + s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix( diffuseColor.rgb, uBk * sampledDiffuseColor.rgb, step( 0.5, vMet ) );')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = step( 0.5, vMet );').replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix( roughnessFactor, 0.24, step( 0.5, vMet ) );'); };
  mat.customProgramCacheKey = () => 'belt'; mat.userData.U = U;
  const m = new THREE.SkinnedMesh(beltGeo(F, cut, v.buckle), mat); m.bind(F.body.skeleton, F.body.bindMatrix); m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
  F.body.parent.add(m); m.position.copy(F.body.position); m.quaternion.copy(F.body.quaternion); m.scale.copy(F.body.scale);
  return m;
}

/* —— putting it on —— */
// one mesh per slot and fighter; a colour baked into a texture is dropped when nobody wears it any more
function wearSlot(F, cat, key, make, tex) {
  const S = F.gear.shells, cur = S[cat];
  if (cur && cur.key === key) { cur.m.visible = true; return cur.m; }
  if (cur) { cur.m.removeFromParent(); const o = F.other && F.other.gear.shells[cat]; if (!o || o.key !== cur.key) { for (const k of cur.tex || []) if (GEAR[k]) { (GEAR[k].map || GEAR[k]).dispose(); delete GEAR[k]; } } cur.m.material.dispose(); S[cat] = null; }
  if (!key) return null;
  const m = make(); S[cat] = { key, m, tex }; return m;
}
function wearDress(F, L) {
  const S = F.gear.shells, W = {}; for (const c of WCATS) W[c] = itemVar(c, wearGet(L, c));
  const bt = W.bottom, tp = W.top, sh = W.shoes, bl = W.belt;
  wearSlot(F, 'bottom', bt.cut ? bt.key : null, () => pantsMesh(F, bt), ['pt_' + bt.key]);
  for (const k in S) if (k[0] === 't' && k[1] === '_') S[k].visible = false;   // tops: one shell per model, the colour is the material's
  wearSlot(F, 'top', tp.cut ? tp.key : null, () => topMesh(F, tp), ['tt_' + tp.key, 'tt_' + tp.key + '_u']);   // tops: their own geometry (04f_tops.js); the old shell below is only a fallback for a model without a cut
  if (tp.tex) { const m = S['t_' + tp.mid] || (S['t_' + tp.mid] = shellMesh(F, 'shirt', tp)); m.visible = true; topTint(m, tp); }
  wearSlot(F, 'shoes', sh.top ? sh.key : null, () => shoeMesh(F, sh), ['st_' + sh.key]);
  const bm = wearSlot(F, 'belt', bl.buckle && bt.belt ? bl.mid + bt.cut : null, () => beltMesh(F, bt.cut, bl)); if (bm) { bm.material.color.set(bl.c); bm.userData = S.bottom.m.userData; }
  // head and eyes: rigid, in the head frame
  const G2 = F.gear, Wr = G2.wear || (G2.wear = {});
  for (const [cat, v, make] of [['head', W.head, () => new THREE.Mesh(hatGeo(F, W.head.hat), new THREE.MeshPhysicalMaterial({ map: hatTex(W.head), roughness: 0.92, sheen: 0.3, sheenRoughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.5 }))],
    ['eyes', W.eyes, () => new THREE.Mesh(glassGeo(F, W.eyes).all, glassMat(W.eyes))]]) {
    const cur = Wr[cat]; if (cur && cur.key === v.key) continue;
    if (cur) { wearBack(cur); scene.remove(cur.m); if (cur.m.material.map !== GEAR.t_crack) cur.m.material.map.dispose(); cur.m.material.dispose(); Wr[cat] = null; }
    if (!v.key) continue;
    const m = make(); m.matrixAutoUpdate = false; m.frustumCulled = false; m.castShadow = true; m.matrix.copy(F.headFrame); scene.add(m);
    Wr[cat] = { key: v.key, v, m, off: false, deb: [], crack: 0, who: F.isPlayer ? 0 : 1, cat };
  }
  return W;
}
const wearTuck = F => { const h = F.gear.wear && F.gear.wear.head; return !!h && !h.off; };   // long hair is tucked under a hat
function wearPose(F, hf) { const W = F.gear.wear; if (!W) return; for (const k of ['head', 'eyes']) if (W[k] && !W[k].off) { W[k].m.matrix.copy(hf); W[k].m.matrixWorldNeedsUpdate = true; } }

/* —— what falls off: a rigid body of its own, in the ARENA frame —— */
const WEAR_G = { grp: null, list: [] };
function debMake(geo, mat) {
  if (!WEAR_G.grp) { WEAR_G.grp = new THREE.Group(); ARENA.add(WEAR_G.grp); }
  const bb = geo.boundingBox, c = bb.getCenter(new V3()), sz = bb.getSize(new V3()).multiplyScalar(0.5), ax = sz.x < sz.y && sz.x < sz.z ? new V3(1, 0, 0) : sz.y < sz.z ? new V3(0, 1, 0) : new V3(0, 0, 1);
  const g = new THREE.Group(), m = new THREE.Mesh(geo, mat); m.position.copy(c).negate(); m.castShadow = true; m.frustumCulled = false; g.add(m); WEAR_G.grp.add(g);
  const d = { g, c, ax, h: Math.max(0.004, Math.min(sz.x, sz.y, sz.z)), r: Math.max(sz.x, sz.y, sz.z), v: new V3(), w: new V3(), rest: false }; WEAR_G.list.push(d); return d;
}
// start state of a piece torn off the head: [px, py, pz, qx, qy, qz, qw, vx, vy, vz, wx, wy, wz] in the ARENA frame
function debState(F, d, dir, power, k) {
  const q = _qa.setFromRotationMatrix(F.headFrame), p = _v1.copy(d.c).applyMatrix4(F.headFrame); ARENA.updateMatrixWorld(); ARENA.worldToLocal(p);
  const qi = _qb.copy(ARENA.quaternion).invert(); q.premultiply(qi);
  const v = _v2.copy(dir).applyQuaternion(qi).multiplyScalar((1.6 + 2.6 * power) * (0.7 + rr() * 0.6)); v.x += (rr() - 0.5) * k; v.z += (rr() - 0.5) * k; v.y = 1.2 + rr() * 1.6 + power;
  return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, (rr() - 0.5) * 22, (rr() - 0.5) * 12, (rr() - 0.5) * 22];
}
function debLaunch(d, s) { d.g.position.set(s[0], s[1], s[2]); d.g.quaternion.set(s[3], s[4], s[5], s[6]); d.v.set(s[7], s[8], s[9]); d.w.set(s[10], s[11], s[12]); d.rest = false; d.g.visible = true; }
function debStep(d, dt) {
  if (d.rest || dt <= 0) return;
  const p = d.g.position, q = d.g.quaternion, v = d.v, w = d.w, wl = w.length();
  v.y -= 9.8 * dt; p.addScaledVector(v, dt);
  if (wl > 1e-4) q.premultiply(_qa.setFromAxisAngle(_v1.copy(w).multiplyScalar(1 / wl), wl * dt)).normalize();
  const up = _v2.copy(d.ax).applyQuaternion(q), c = Math.abs(up.y), hh = lerp(d.r, d.h, c * c);   // how high its centre is when it touches the floor in this attitude
  if (p.y < hh) {
    p.y = hh;
    if (v.y < -0.6) { v.y *= -0.35; w.multiplyScalar(0.6); w.x += v.z * 3; w.z -= v.x * 3; v.x *= 0.75; v.z *= 0.75; } else if (v.y < 0) v.y = 0;
    const f = Math.exp(-4.5 * dt); v.x *= f; v.z *= f; w.multiplyScalar(Math.exp(-7 * dt));
    w.addScaledVector(_v1.crossVectors(up, _v3.set(0, up.y < 0 ? -1 : 1, 0)), 60 * dt);   // it lies down flat
    if (v.lengthSq() < 0.004 && c > 0.998 && w.lengthSq() < 0.08) d.rest = true;
  }
  const B = typeof LOC !== 'undefined' && LOC && LOC.bound, lim = B ? (B.kind === 'circle' ? B.r : B.half) + 0.12 : 2.6;   // the ropes / the edge of the floor
  if (B && B.kind === 'circle') { const r = Math.hypot(p.x, p.z); if (r > lim) { const nx = p.x / r, nz = p.z / r, vn = v.x * nx + v.z * nz; p.x = nx * lim; p.z = nz * lim; if (vn > 0) { v.x -= 1.4 * vn * nx; v.z -= 1.4 * vn * nz; } } }
  else for (const k of ['x', 'z']) if (Math.abs(p[k]) > lim) { p[k] = Math.sign(p[k]) * lim; if (v[k] * p[k] > 0) v[k] *= -0.4; }
}
// put a thing back on (a new fight, a cut back in time in the replay)
function wearBack(w) { for (const d of w.deb) { WEAR_G.grp.remove(d.g); WEAR_G.list.splice(WEAR_G.list.indexOf(d), 1); } w.deb.length = 0; w.off = false; w.crack = 0; if (w.m.material.userData.U && w.m.material.userData.U.uCrack) w.m.material.userData.U.uCrack.value.set(0, 0); }
function wearReset() { for (const F of [P1, P2]) { const W = F && F.gear.wear; if (!W) continue; for (const k of ['head', 'eyes']) if (W[k]) wearBack(W[k]); wearHair(F); } }
function wearHair(F) { hairVis(F); }
// a wear event happens (live, or again in the replay); ff = seconds to run it forward at once
function wearEvent(e, ff = 0) {
  const F = e.who ? P2 : P1, w = F.gear.wear && F.gear.wear[e.cat]; if (!w || w.key !== e.key) return;
  if (e.kind === 'crack') { w.crack = 1; w.m.material.userData.U.uCrack.value.setComponent(e.side, 1); return; }
  if (w.off) wearBack(w);
  w.off = true; w.m.visible = false;
  const geos = e.cat === 'eyes' ? glassGeo(F, w.v).parts : [w.m.geometry];
  if (e.cat === 'eyes') w.m.material.userData.U.uCrack.value.set(1, 1);
  geos.forEach((g, i) => { const d = debMake(g, w.m.material); w.deb.push(d); debLaunch(d, e.st[i]); for (let t = Math.min(ff, 5); t > 0; t -= 1 / 90) debStep(d, 1 / 90); });
  if (e.cat === 'head') { wearHair(F); F.simReset = true; }
}
// a punch landed clean on the head
function wearHit(F, pos, dir, power) {
  const W = F.gear.wear; if (!W || F.gear.spar) return;
  const push = (w, kind, extra) => { const e = { t: G.t, wear: 1, who: w.who, cat: w.cat, key: w.key, kind, ...extra }; REC.events.push(e); wearEvent(e); };
  const h = W.head, g = W.eyes;
  if (h && !h.off && power > h.v.off[0] && (rr() < h.v.off[1] || power > 1.05)) { const d = { c: h.m.geometry.boundingBox.getCenter(new V3()) }; push(h, 'off', { st: [debState(F, d, dir, power, 0.8)] }); }
  if (g && !g.off && power > 0.4) {
    if (g.crack || power > 0.95) { const st = glassGeo(F, g.v).parts.map(p => debState(F, { c: p.boundingBox.getCenter(new V3()) }, dir, power * 0.7, 2.2)); push(g, 'off', { st }); }
    else push(g, 'crack', { side: _v1.copy(pos).applyMatrix4(F.headFrameInv).x > 0 ? 0 : 1 });
  }
}
// the replay cut to time tau: everything as it was then
function wearSeek(tau) { wearReset(); for (const e of REC.events) if (e.wear && e.t <= tau) wearEvent(e, tau - e.t); }
function wearTick(dt) {
  for (const F of [P1, P2]) { const W = F && F.gear.wear; if (W) for (const k of ['head', 'eyes']) if (W[k]) W[k].m.visible = F.group.visible && !W[k].off && !(k === 'head' && F.gear.spar); }
  for (const d of WEAR_G.list) for (let t = Math.min(dt, 0.05); t > 1e-5; t -= 1 / 120) debStep(d, Math.min(t, 1 / 120));
}
// debug: __wear.hit(0, 1.1) — a punch of that power on P1's (1: P2's) head as far as his hat and glasses are concerned
window.__wear = { ITEMS, WCOL, BRANDS, hit: (who, power = 1) => { const F = who ? P2 : P1; wearHit(F, F.headNow.clone(), new V3().subVectors(F.headNow, F.other.headNow).setY(0.1).normalize(), power); }, reset: wearReset, seek: wearSeek };

/* —— the creator: category → model → colours of that model —— */
function wearUI() {
  const cat = UI.wcat || (UI.wcat = 'top'), sel = () => wearGet(LOOK, cat), none = WNONE[cat];
  swatches('o-wcat', WCATS.map(c => ({ id: c, label: WCAT_LABEL[c] })), () => cat, v => { UI.wcat = v; wearUI(); if (UI.scr === 'creator') setView(v === 'head' || v === 'eyes' ? VIEW_FACE : VIEW_FULL); }, true, true);
  const items = wearItems(cat), list = [...(none ? [{ id: 'none', label: none }] : []), ...items.map(i => ({ id: i.id, label: i.label }))];
  swatches('o-wmodel', list, () => sel().id, v => { if (v !== 'none' && !itemOwned(v)) { setTimeout(() => { wearUI(); shopOpen(cat, v); }, 0); return; }   // not owned: the shop opens on it
    LOOK[cat] = v === 'none' ? { id: 'none' } : { id: v, color: ITEMS[v].colors[0] }; setTimeout(wearUI, 0); }, true);
  [...$('o-wmodel').children].forEach((b, i) => { const it = ITEMS[list[i].id]; if (it && !itemOwned(it.id)) { b.classList.add('lock'); b.title = it.reward ? 'награда: ' + it.reward + '-я победа в карьере' : 'купить в магазине'; const s = document.createElement('small'); s.className = 'pr'; s.textContent = it.reward ? '🔒 бой ' + it.reward : '🔒 ' + cash(it.price); b.append(s); }
    if (it && it.brand) { const im = document.createElement('img'); im.src = brandIcon(it.brand); im.alt = ''; b.prepend(im); const s = document.createElement('small'); s.textContent = it.brand; b.append(s); } });
  const it = ITEMS[sel().id], cols = it && it.cat === cat ? wearColors(it).map(id => { const c = wearColor(it, id); return { id, c: c.c, label: c.label || id, pat: c.pat }; }) : [];
  swatches('o-wcolor', cols, () => sel().color || (it && it.colors[0]), v => { LOOK[cat] = { id: it.id, color: v }; });
  [...$('o-wcolor').children].forEach((b, i) => { b.title = cols[i].label; if (cols[i].pat) b.style.backgroundImage = `url(${GEAR.camoUrl || (GEAR.camoUrl = (() => { const c = document.createElement('canvas'); c.width = c.height = 48; camoPaint(c.getContext('2d'), 48, 48, 0.35); return c.toDataURL(); })())})`; if (it && i === it.colors.length - 1) b.style.marginRight = '10px'; });
  $('o-wnote').textContent = !it || it.cat !== cat ? '' : (it.brand ? it.brand + ' · ' : '') + (cat === 'belt' && !itemVar('bottom', wearGet(LOOK, 'bottom')).belt ? 'ремень виден на джинсах и карго' : itemTag(it));
}
