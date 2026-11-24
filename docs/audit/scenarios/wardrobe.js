// issue 84: 24 fighters in different looks (new cuts, patterns), one 6 × 4 sheet (docs/audit/wardrobe.jpg); + triangle counts of the new cuts
(async () => {
  const g = window.__g, P1 = g.P1, L0 = JSON.parse(JSON.stringify(__shop.LOOK)), I = __shop.ITEMS;
  const w = (id, color, pat) => id === 'none' ? { id: 'none' } : { id, color: color || I[id].colors[0], ...(pat ? { pat } : {}) };
  const LOOKS = [
    [w('polo', 'navy'), w('bermuda', 'sand'), w('kedsLo', 'white'), w('capF', 'black'), 'beltFrame'],
    [w('flannel', 'red'), w('jeansR', 'worn'), w('combat', 'black'), w('none'), 'beltWest'],
    [w('trackJ', 'navy'), w('trackP', 'black'), w('hiTop', 'red'), w('headband', 'white')],
    [w('bomber', 'olive'), w('cargoL', 'olive'), w('combat', 'sand'), w('balaclava', 'black'), 'beltMil'],
    [w('wind', 'blue'), w('sweat', 'grey'), w('runner', 'red'), w('panama', 'sand')],
    [w('puffer', 'red'), w('jeans', 'indigo'), w('hiTop', 'black'), w('none'), 'beltFrame'],
    [w('meshTee', 'black'), w('bike', 'black'), w('slides', 'black'), w('headband', 'red')],
    [w('hoodPO', 'grey'), w('sweatTie', 'pink'), w('slides', 'red'), w('bandB', 'black')],
    [w('jersey', 'red'), w('bermudaC', 'navy'), w('kedsLo', 'red'), w('none'), 'beltPlate'],
    [w('jersey7', 'white'), w('trico', 'red'), w('bootsHi', 'red'), w('none')],
    [w('teeStripe', 'white'), w('cargoL', 'sand'), w('combat', 'black'), w('balaclava', 'olive'), 'beltMil'],
    [w('teeTie', 'pink'), w('jeansR', 'indigo'), w('hiTop', 'blue'), w('capB', 'navy'), 'beltFrame'],
    [w('teeLogo', 'black'), w('trackP', 'navy'), w('sneak', 'white'), w('capF', 'red')],
    [w('raglan', 'sand'), w('bermuda', 'olive'), w('kedsLo', 'black'), w('panama', 'olive'), 'beltFrame'],
    [w('poloRL', 'black'), w('jeans', 'black'), w('hiTop', 'blue'), w('none'), 'beltPlate'],
    [w('flannelB', 'yellow'), w('cargoL', 'black'), w('combat', 'brown'), w('beanie', 'grey'), 'beltFrame'],
    [w('trackJR', 'wine'), w('trackP', 'red'), w('bootsHi', 'black'), w('none')],
    [w('hoodie', 'grey', 'camo'), w('sweat', 'black', 'stripe'), w('sneak', 'black'), w('none')],
    [w('long', 'navy', 'logo'), w('bike', 'navy'), w('slides', 'navy'), w('bandB', 'navy')],
    [w('sweatshirt', 'red', 'stripe'), w('bermuda', 'blue', 'tiedye'), w('kedsLo', 'white'), w('panama', 'red', 'check'), 'beltFrame'],
    [w('none'), w('trico', 'blue'), w('bootsHi', 'blue'), w('headband', 'black')],
    [w('meshTee', 'red'), w('bike', 'red'), w('hiTop', 'red'), w('balaclava', 'red')],
    [w('tank', 'white', 'stripe'), w('cargoL', 'camo'), w('combat', 'black'), w('capF', 'olive'), 'beltMil'],
    [w('puffer', 'sand'), w('jeansR', 'black'), w('kedsLo', 'white'), w('panama', 'black', 'logo'), 'beltFrame'],
  ];
  const CW = 200, CH = 300, cv = document.createElement('canvas'); cv.width = CW * 6; cv.height = CH * 4; const x = cv.getContext('2d'); x.fillStyle = '#15171c'; x.fillRect(0, 0, cv.width, cv.height);
  g.P2.group.visible = false; const log = [], tri = q => q.index ? q.index.count / 3 : q.attributes.position.count / 3;
  log.push('ref: tee ' + (() => { P1.applyLook({ ...L0, top: w('tee'), bottom: w('jeans') }); return tri(P1.gear.shells.top.m.geometry) + ' / jeans ' + tri(P1.gear.shells.bottom.m.geometry); })(), 'hoodie ' + (() => { P1.applyLook({ ...L0, top: w('hoodie') }); return tri(P1.gear.shells.top.m.geometry); })(), 'jacket ' + (() => { P1.applyLook({ ...L0, top: w('jacket') }); return tri(P1.gear.shells.top.m.geometry); })());
  for (let i = 0; i < LOOKS.length; i++) {
    const [top, bottom, shoes, head, belt] = LOOKS[i], L = { ...L0, top, bottom, shoes, head, eyes: { id: i % 7 === 3 ? 'shades' : 'none' }, belt: belt ? { id: belt } : { id: 'none' } };
    P1.applyLook(L); g.P2.group.visible = false;
    const hb = P1.bones.CC_Base_Hip, h = hb.getWorldPosition(hb.position.clone());
    const sT = P1.gear.shells.top, sB = P1.gear.shells.bottom; log.push(top.id + ' ' + (sT ? tri(sT.m.geometry) : 0) + ' / ' + bottom.id + ' ' + (sB ? tri(sB.m.geometry) : 0));
    window.__camHold = { p: [h.x + 1.9, 1.45, h.z + 3.6], l: [h.x, 0.82, h.z] };
    __step(3, 1 / 60);
    const c = g.renderer.domElement, sh = c.height * 0.98, sw = sh * CW / CH; x.drawImage(c, (c.width - sw) / 2, c.height * 0.01, sw, sh, (i % 6) * CW, Math.floor(i / 6) * CH, CW, CH);
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect((i % 6) * CW, Math.floor(i / 6) * CH + CH - 18, CW, 18); x.fillStyle = '#e9e6df'; x.font = '11px Arial'; x.fillText([top, bottom, shoes, head].map(q => q.id === 'none' ? '' : I[q.id].label + (q.pat ? '·' + q.pat : '')).filter(Boolean).join(' / ').slice(0, 44), (i % 6) * CW + 4, Math.floor(i / 6) * CH + CH - 5);
  }
  delete window.__camHold; P1.applyLook(L0);
  const im = document.createElement('img'); im.src = cv.toDataURL('image/jpeg', 0.9); im.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:' + cv.width + 'px;height:' + cv.height + 'px';
  document.body.append(im); await new Promise(r => im.onload = r);
  return log.join(', ');   // triangles of each top / bottom worn (same generators as the old cuts)
})()
