/* R-15 acceptance: the knockout replay sees the punch. 16 forced knockouts by real punches — 4 punches (straight: jab / cross,
   hook, uppercut, hook to the body) × 2 hands × 2 sides of the ring (P1 knocks out P2 on the right, P2 knocks out P1 on the left).
   For each: the replay is stepped to its stop on the contact frame (__rp.contact) and measured from the real camera:
   f = the loser's head forward · direction head → camera (must be > 0.2), NDC of his head and of the fist (inside ±0.8 = 10 %
   margins). Also: the stop lasts RPK.freeze, then the rate eases 0.2× → 1×. Frames of 4 replays: rp-<name>-<who>.jpg (contact) and
   rp-<name>-<who>-after.jpg (0.6 s later), rp-<name>-<who>-fall.jpg (the fall, ~1.3 s later). Run:
   bash tools/shot.sh /tmp/shots/rp.jpg js "return await eval(await (await fetch('docs/audit/scenarios/replay.js')).text())" */
(async () => {
  const g = __g, G = g.G, RP = g.RP, c = id => document.getElementById(id).click();
  if (!document.getElementById('tut-ask').hidden) c('tut-no');
  const KINDS = window.__rpKinds || ['jab', 'cross', 'hookL', 'hookR', 'upperL', 'upperR', 'bodyL', 'bodyR'];
  const SHOTS = window.__rpShots || ['cross/1', 'hookL/2', 'upperR/1', 'bodyL/2'];
  const rows = [], bad = [];
  for (const who of [1, 2]) for (const kind of KINDS) {
    const k = __rp.ko(kind, who);
    if (!k || k.state !== 'ko') { bad.push(`${kind}/${who}: no KO ${JSON.stringify(k)}`); continue; }
    const m = __rp.contact();
    if (!m || m.f == null) { bad.push(`${kind}/${who}: no impact shot`); continue; }
    rows.push({ kind, ...m });
    if (!m.ok) bad.push(`${kind}/${who}: f=${m.f} head=${m.head} fist=${m.fist}`);
    if (SHOTS.includes(`${kind}/${who}`)) {
      await __shot(`rp-${kind}-${who}`);
      // the stop holds (no replay time passes), then the ease-in: 0.5 s real ≈ 0.25 s of the hold + 0.25 s at 0.2× …
      const tau0 = RP.tau; __tick(6, 1 / 60); const held = Math.abs(RP.tau - tau0) < 1e-6;
      __tick(24, 1 / 60); const r1 = RP.tau; __tick(6, 1 / 60); const rate = (RP.tau - r1) / 0.1;
      rows[rows.length - 1].held = held; rows[rows.length - 1].rate = +rate.toFixed(2);
      await __shot(`rp-${kind}-${who}-after`);
      __tick(45, 1 / 60); if (G.state === 'replay' && RP.seg === 0) await __shot(`rp-${kind}-${who}-fall`);   // ~1.3 s after the contact: the fall
    }
  }
  const fs = rows.map(r => r.f), ok = rows.filter(r => r.ok).length;
  const tab = rows.map(r => `${r.kind}/${r.who} f=${r.f} head=[${r.head}] fist=[${r.fist}] gap=${r.gap} cost=${r.cost}${r.held != null ? ` held=${r.held} rate@0.5s=${r.rate}` : ''}${r.ok ? '' : ' FAIL'}`);
  return `R-15 replay: ${ok}/${rows.length} ok (of 16), f min ${Math.min(...fs).toFixed(2)} mean ${(fs.reduce((a, b) => a + b, 0) / fs.length).toFixed(2)}\n` + tab.join('\n') + (bad.length ? '\nBAD: ' + bad.join(' | ') : '');
})()
