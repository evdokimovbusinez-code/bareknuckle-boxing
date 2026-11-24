/* issue 81: the story dialog camera on both chapters (Бар, Патруль) — the speaker's head and shoulders whole, ≥ 0.9 m from the lens,
   the dialog box under the chin. Per line: distance lens ↔ head, NDC of crown / chin, the box top. Run:
   bash tools/shot.sh /tmp/shots/talk.jpg js "return await eval(await (await fetch('docs/audit/scenarios/talk.js')).text())" [740x360 touch] */
(async () => {
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, cam = g.camera, log = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  __story.unlock(1);
  const ndc = p => p.clone().project(cam).y;
  const box = () => { const st = document.getElementById('stage'), d = document.getElementById('dlg'), b = d.querySelector('.dlg-box');
    return d.hidden ? null : 1 - 2 * (d.offsetTop + b.offsetTop) / st.offsetHeight; };
  let bad = 0;
  for (const ch of [0, 1]) {
    log.push('ch' + ch + ' ' + __story.play(ch));
    let n = 0; while (G.state !== 'talk' && n++ < 120) { __tick(10, 1 / 60); await wait(50); }
    __tick(120, 1 / 60); await wait(600);
    for (let k = 0; k < 3 && __story.DLG.active; k++) {
      __tick(90, 1 / 60); await wait(400); __tick(30, 1 / 60);
      const who = __story.DLG.who, F = who === 'p' ? P1 : who === 'o' ? P2 : null;
      if (F) {
        const h = F.headNow, d = cam.position.distanceTo(h), top = ndc(h.clone().setY(h.y + 0.14)), chin = ndc(h.clone().setY(h.y - 0.13)), b = box();
        const ok = d >= 0.9 && top < 1 && b !== null && chin > b; if (!ok) bad++;
        log.push(`ch${ch} line${__story.DLG.i} ${who}: d=${d.toFixed(2)} crown=${top.toFixed(2)} chin=${chin.toFixed(2)} box=${b === null ? '-' : b.toFixed(2)} ${ok ? 'ok' : 'BAD'}`);
      }
      await __shot(`ch${ch}-l${__story.DLG.i}`);
      __story.next(1);
    }
    __story.skip(); n = 0; while (G.state !== 'fight' && n++ < 40) { try { g.introSkip(); g.cineSkip(); } catch (e) {} __tick(30, 1 / 60); }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); __tick(2, 1 / 60);
    document.getElementById('p-quit').click(); __tick(10, 1 / 60); log.push('back: ' + G.state);
  }
  log.push('bad lines: ' + bad);
  return log.join(' | ');
})()
