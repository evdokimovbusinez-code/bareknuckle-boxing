/* issue 90 (critic): WHY a bench cell fails — not the win rate, but what the AI does to the bot. Nothing in the game is changed:
   the bot's own window.__tick is wrapped and window.__dmgLog (resolveHit) is read. Run (cells / fights / tune are optional globals):
   bash tools/shot.sh /tmp/shots/ai.jpg js "window.__critCells = [['mover', 'hard'], ['jabspam', 'normal']]; window.__critN = 3; window.__critTune = {}; return await eval(await (await fetch('docs/audit/scenarios/critic_ai.js')).text())"
   Per cell it prints: result of every fight; the bot's punches (thrown → clean / on the guard / slipped by the AI / thin air), by round;
   AI.mem.fam at the end of every round; the AI's punches (how many started while the bot was punching = «trade», as a counter after
   a slip, as a power shot); the damage the bot took split by the flags of resolveHit (C counter ×1.5, K caught ×1.25, B blocked);
   every knockdown of the bot: the punch, its flags, his hp / stamina / daze just before. */
(async () => {
  const g = __g, { G, P1, P2, AI } = g, out = [];
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  const cells = window.__critCells || [['mover', 'hard'], ['jabspam', 'normal']], N = window.__critN || 3, tune = window.__critTune || {};
  const tick0 = window.__tick, pc = (a, b) => (b ? Math.round(100 * a / b) : 0) + '%';
  for (const [pol, diff] of cells) {
    const T = { res: [], thr: 0, land: 0, blk: 0, eva: 0, rT: [], rL: [], rE: [], fam: [], p2: 0, p2trade: 0, p2ctr: 0, p2pow: 0, p2land: 0, dmg: { C: 0, K: 0, CK: 0, B: 0, plain: 0 }, cnt: { C: 0, K: 0, CK: 0, B: 0, plain: 0 }, by: {}, kd: [], fr: 0, dg: 0, bk: 0, sta1: 0, sta2: 0, open: 0, hp: [] };
    for (let i = 0; i < N; i++) {
      let pid1 = -1, pid2 = -1, st = '', rnd = 1, eva0 = 0, pre = null; const L = window.__dmgLog = []; let li = 0;
      window.__tick = (n, dt) => {
        if (G.state === 'fight') pre = [Math.round(P1.hp), Math.round(P1.stamina), +P1.daze.toFixed(2), +Math.abs(P1.group.position.x - P2.group.position.x).toFixed(2)];
        const r = tick0(n, dt);
        if (G.round !== rnd) { T.fam.push('r' + rnd + ' ' + JSON.stringify(AI.mem.fam)); rnd = G.round; }
        if (G.state === 'fight') {
          T.fr++; T.sta1 += P1.stamina; T.sta2 += P2.stamina; T.open += AI.open || 0; if (P2.blocking) T.bk++; if (P2.dodge && P2.dodge !== T.dgO) T.dg++; T.dgO = P2.dodge;
          if (P1.cur && P1.punchId !== pid1) { pid1 = P1.punchId; T.rT[rnd] = (T.rT[rnd] || 0) + 1; }
          if (P2.cur && P2.punchId !== pid2) { pid2 = P2.punchId; T.p2++; if (P1.cur && !P1.resolved) T.p2trade++; if (P2.counterUntil > G.t) T.p2ctr++; if (P2.heavy) T.p2pow++; }
          if (P2.fs && P2.fs.eva !== eva0) { T.rE[rnd] = (T.rE[rnd] || 0) + P2.fs.eva - eva0; eva0 = P2.fs.eva; }
        }
        for (; li < L.length; li++) { const e = L[li];
          if (e[0] === 2) { if (!e[5]) T.rL[rnd] = (T.rL[rnd] || 0) + 1; continue; }
          const k = e[5] ? 'B' : e[3] && e[4] ? 'CK' : e[3] ? 'C' : e[4] ? 'K' : 'plain'; T.dmg[k] += e[1]; T.cnt[k]++; if (!e[5]) { T.p2land++; T.by[e[2]] = (T.by[e[2]] || 0) + e[1]; } }
        if (G.state !== st) { if (G.state === 'kd' && G.kd && G.kd.def === P1) { const e = L.filter(x => x[0] === 1).pop() || []; T.kd.push(`r${rnd} ${e[2]} ${e[1]} [${e[3]}${e[4]}${e[6]}] hp/sta/daze/dist ${pre}`); } st = G.state; }
        return r;
      };
      const R = __bot.run(pol, diff, 1, { seed: 1 + i, tune }).rows[0]; window.__tick = tick0;
      T.res.push(`${R.result}/${R.how} r${R.round} ${R.dur}s kd ${R.kd_p1}:${R.kd_p2}`); T.thr += R.p1_thr; T.land += R.p1_land; T.blk += R.p1_blk; T.eva += P2.fs.eva; T.hp.push(R.hp1 + ':' + R.hp2);
      T.fam.push('end ' + JSON.stringify(AI.mem.fam) + ' |');
    }
    const rr = [1, 2, 3, 4, 5].filter(r => T.rT[r]).map(r => `r${r} ${T.rT[r]} → ${pc(T.rL[r] || 0, T.rT[r])} clean, ${pc(T.rE[r] || 0, T.rT[r])} slipped`).join('; ');
    out.push(`== ${pol} · ${diff} × ${N}  tune ${JSON.stringify(tune)}`, 'fights: ' + T.res.join(' | ') + '   hp ' + T.hp.join(' '),
      `bot: ${T.thr} thrown → clean ${pc(T.land, T.thr)}, guard ${pc(T.blk, T.thr)}, slipped by the AI ${pc(T.eva, T.thr)}, air ${pc(T.thr - T.land - T.blk - T.eva, T.thr)}`, 'bot by round: ' + rr,
      'AI.mem.fam: ' + T.fam.join(' '),
      `AI: slips started ${T.dg} (${pc(T.dg, T.thr)} of the bot's punches; its head leaves the line, so they show as «air»), guard up ${pc(T.bk, T.fr)} of the time; ${T.p2} thrown, clean ${pc(T.p2land, T.p2)}; started into the bot's punch ${pc(T.p2trade, T.p2)}, as a counter ${pc(T.p2ctr, T.p2)}, power ${pc(T.p2pow, T.p2)}; mean AI.open ${(T.open / T.fr).toFixed(2)}, stamina bot / AI ${(T.sta1 / T.fr).toFixed(0)} / ${(T.sta2 / T.fr).toFixed(0)}`,
      'damage to the bot by flag (sum · hits): ' + Object.keys(T.dmg).map(k => `${k} ${T.dmg[k].toFixed(0)} · ${T.cnt[k]}`).join(', ') + '   by punch: ' + JSON.stringify(Object.fromEntries(Object.entries(T.by).map(([k, v]) => [k, Math.round(v)]))),
      'knockdowns of the bot:\n  ' + T.kd.join('\n  '));
  }
  window.__dmgLog = null;
  return '\n' + out.join('\n');
})()
