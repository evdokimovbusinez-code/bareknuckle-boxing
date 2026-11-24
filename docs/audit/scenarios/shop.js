/* audit scenario R-21: the pictures on the shop cards (thStep, 14b_shop.js). Run (the second half runs after a page reload):
   bash tools/shot.sh /tmp/shots/shop.jpg js "return await eval(await (await fetch('docs/audit/scenarios/shop.js')).text()) //--RELOAD-- return await eval(await (await fetch('docs/audit/scenarios/shop.js')).text())"
   First page: an empty picture cache → open the shop, time every frame (the whole __step: simulation + render + the picture of that frame)
   against the menu frames before it, step until every category is drawn, shots of 4 categories. After the reload: the shop again —
   0 pictures drawn, every card has one (from localStorage 'ko-thumbs'). */
(async () => {
  const c = id => document.getElementById(id).click(), S = __shop, TH = S.TH, log = [], wait = ms => new Promise(r => setTimeout(r, ms));
  // every step is its own task (as under requestAnimationFrame): a WebGL2 fence only changes state between tasks
  // and the GPU is caught up after it, outside the timing (a 1-pixel read = the back-pressure requestAnimationFrame gives; without it the
  // hand-stepped frames pile up in SwiftShader's queue and a fence waits behind all of them). The times are the CPU of a frame.
  const gl = __g.renderer.getContext(), px = new Uint8Array(4);
  const yieldT = () => { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return new Promise(r => setTimeout(r, 0)); };
  const timed = async n => { const a = []; for (let i = 0; i < n; i++) { const t = performance.now(); __step(1, 1 / 60); a.push(performance.now() - t); await yieldT(); } return a; };
  const st = a => { const s = [...a].sort((x, y) => x - y); return `med ${s[s.length >> 1].toFixed(0)} / max ${s[s.length - 1].toFixed(0)} ms`; };
  const cards = () => [...document.querySelectorAll('#o-sitems .th')], bare = () => cards().filter(e => !e.style.backgroundImage).length;
  const cat = async k => { const b = [...document.querySelectorAll('#o-scat button')].find(x => x.textContent === k); b.click(); __step(2, 1 / 60); };
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  const second = !!window.localStorage.getItem('shop-test-pass1');
  if (!second) {
    localStorage.removeItem('ko-thumbs'); TH.mem.clear(); TH.loaded = false;
    S.PROF.cash = 600;
    c('go-shop'); __step(2, 1 / 60); c('shop-back'); __step(2, 1 / 60);   // the first visit seeds PROF.seen
    delete S.PROF.seen.tee; delete S.PROF.seen.mesh;                       // → «новое» on two tops
    const base = await timed(20);                                                 // the menu, no shop
    let t = performance.now(); c('go-shop'); const tOpen = performance.now() - t;
    const open = await timed(40), n40 = TH.n;
    log.push(`menu frames ${st(base)} | click → shop ${tOpen.toFixed(0)} ms | first 40 shop frames ${st(open)} (${n40} pictures) | top cards without a picture after 40 frames: ${bare()}/${cards().length}`);
    t = performance.now(); let k = 0; const rest = []; while ((TH.q.length || TH.pend) && k < 800) { const t1 = performance.now(); __step(1, 1 / 60); rest.push(performance.now() - t1); k++; await yieldT(); }
    const all = open.concat(rest), slow = TH.log.filter(e => e.t.dress + e.t.draw + e.t.back > 100).map(e => `${e.cat}/${e.id} ${e.t.dress.toFixed(0)}+${e.t.draw.toFixed(0)}+${e.t.back.toFixed(0)} p${e.t.prog}`);
    log.push(`all categories: ${TH.n} pictures in ${40 + k} frames, ${((performance.now() - t) / 1000).toFixed(1)} s; shop frames ${st(all)}, > 100 ms: ${all.filter(x => x > 100).length}; picture start ${st(TH.ms)}, finish ${st(TH.log.map(e => e.t.fin || 0))}; slow (dress+draw+undress ms, new programs): ${slow.join(', ') || '—'}`);
    await wait(400); await __shot('top'); log.push(`top: ${bare()}/${cards().length} without`);
    for (const [k2, tag] of [['голова', 'head'], ['обувь', 'shoes'], ['руки', 'hands'], ['низ', 'bottom']]) { await cat(k2); await wait(300); await __shot(tag); log.push(`${tag}: ${bare()}/${cards().length} without`); }
    log.push(`stored: ${Object.keys(JSON.parse(localStorage.getItem('ko-thumbs') || '{}')).length} pictures, ${((localStorage.getItem('ko-thumbs') || '').length / 1024).toFixed(0)} KB`);
    c('shop-back'); __step(2, 1 / 60); localStorage.setItem('shop-test-pass1', '1');
  } else {
    localStorage.removeItem('shop-test-pass1');
    const n0 = TH.n; c('go-shop'); const open = await timed(30);
    let miss = 0, all = 0; for (const k2 of ['верх', 'голова', 'очки', 'низ', 'ремень', 'обувь', 'руки']) { await cat(k2); all += cards().length; miss += bare(); }
    await cat('верх'); await wait(400); await __shot('reload');
    log.push(`after reload: ${TH.n - n0} pictures drawn, ${TH.mem.size} from the cache, cards without a picture ${miss}/${all} (7 categories), shop frames ${st(open)}`);
  }
  return log.join(' | ');
})()
