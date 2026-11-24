/* R-14 audit: close quarters. The AI with the `pressure` style (normal) against the `turtle` bot of R-02 until 120 s of the
   round clock are collected (a fight that ends early is followed by the next seed); every frame (dt 1/60) of state `fight` with
   both men up: the depth of the deepest overlap of the two bodies — __g.bodyOverlap.pen() (10b_close.js: limbs and body volumes
   of one man inside the head / spine / shoulders / hips of the other). Also: the distance between the chests, the breaks of a
   clinch that happened, the cost of a simulation step. Needs the debug build (src/bench.js: __bot). Run:
   bash tools/shot.sh /tmp/shots/cl.jpg js "return await eval(await (await fetch('docs/audit/scenarios/close.js')).text())"
   window.__clSecs = 30 shortens it, window.__clLoc = 'bar' moves it, window.__clPol = 'masher' changes the bot.
   R-14 acceptance: overlap > 3 cm in < 2 % of the frames. */
(async () => {
  const g = __g, G = g.G, pen = g.bodyOverlap.pen, log = [];
  if (!document.getElementById('tut-ask').hidden) document.getElementById('tut-no').click();
  const pc = (a, q) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  const f3 = x => (+x).toFixed(3), up = F => !F.ko && !F.gu && !F.slide && !(F.rag.on && F.rag.mode === 'ko');
  const secs = window.__clSecs || 120, S = { d: [], root: [], chest: [], head: [], why: {}, breaks: 0, brk: false, ms: 0, n: 0, kd: 0 };
  const tk = window.__tick;
  const sample = () => {
    if (G.state !== 'fight' || !up(g.P1) || !up(g.P2)) return;
    const r = pen(g.P1, g.P2); S.d.push(r.d); S.n++;
    if (r.d > 0.03) { const X = r.who ? g.P2 : g.P1, Y = X.other, arm = /L$/.test(r.a) ? 'L' : 'R', dg = window.__clDiag;   // __clDiag: what the two were doing
      const k = (r.who ? 'P2 ' : 'P1 ') + r.a + '>' + r.b + (dg ? (X.cur ? ' ' + X.cur + (X.aimArm === arm ? '*' : '') + (X.resolved ? '+' : '-') : '') + (X.rag.on ? ' rag' : '') + (Y.rag.on ? ' hisRag' : '') + (Y.cur ? ' hisPunch' : '') + (Y.dodge ? ' hisDodge' : '') + (G.hitstop > 0 ? ' stop' : '') : '') + (G.brk && G.brk.on ? ' BREAK' : ''); S.why[k] = (S.why[k] || 0) + 1; }
    S.root.push(Math.abs(g.P1.group.position.x - g.P2.group.position.x));
    const c1 = g.P1.caps, c2 = g.P2.caps, mx = c => (c[2][0].x + c[2][1].x) / 2;   // the capsules pen() has just read: [2] = shoulder bar, [0] = head
    S.chest.push(Math.abs(mx(c1) - mx(c2))); S.head.push(Math.abs(c1[0][0].x - c2[0][0].x));
    const b = !!(G.brk && G.brk.on); if (b && !S.brk) S.breaks++; S.brk = b;
  };
  window.__tick = (n, dt) => { for (let i = 0; i < n; i++) { const t = performance.now(); tk(1, dt); S.ms += performance.now() - t; sample(); } };
  let left = secs, seed = 3, fights = [];
  try {
    while (left > 1 && seed < 12) {
      const r = __bot.run(window.__clPol || 'turtle', 'normal', 1, { loc: window.__clLoc || 'gym', dt: 1 / 60, stopAt: left, seed: seed++, style: 'pressure' }).rows[0];
      left -= r.dur; fights.push(r.result + ' ' + r.dur + 's ' + r.p1_land + '/' + r.p1_thr + ' vs ' + r.p2_land + '/' + r.p2_thr);
    }
  } finally { window.__tick = tk; }
  const over = S.d.filter(x => x > 0.03).length;
  log.push(`fights: ${fights.join(' | ')}`);
  log.push(`frames ${S.n} (${(S.n / 60).toFixed(0)} s) | overlap p50 ${f3(pc(S.d, 0.5))} p95 ${f3(pc(S.d, 0.95))} p99 ${f3(pc(S.d, 0.99))} max ${f3(Math.max(...S.d))} m | > 3 cm: ${over} frames = ${(100 * over / Math.max(1, S.n)).toFixed(2)} %`);
  log.push(`> 3 cm by part: ${JSON.stringify(Object.fromEntries(Object.entries(S.why).sort((a, b) => b[1] - a[1]).slice(0, window.__clDiag ? 30 : 10)))}`);
  log.push(`roots apart p1 ${f3(pc(S.root, 0.01))} p50 ${f3(pc(S.root, 0.5))} m` + ` | chests apart (x) min ${f3(Math.min(...S.chest))} p1 ${f3(pc(S.chest, 0.01))} p5 ${f3(pc(S.chest, 0.05))} p50 ${f3(pc(S.chest, 0.5))} m | heads apart (x, the break's distance) min ${f3(Math.min(...S.head))} p5 ${f3(pc(S.head, 0.05))} p50 ${f3(pc(S.head, 0.5))} m, < 0.55 m: ${(100 * S.head.filter(x => x < 0.55).length / Math.max(1, S.n)).toFixed(1)} %` + ` | breaks ${S.breaks}`);
  log.push(`step ${(S.ms / Math.max(1, S.n)).toFixed(3)} ms (frame() of the bench, nothing drawn)`);
  return '\n' + log.join('\n');
})()
