/* ───────── AI ───────── */
/* opponent styles, after how bare-knuckle bouts actually go: short range, lots of hooks and overhands, fighters who stand and trade,
   counter-punchers who make you miss and make you pay, and pressure fighters who walk you to the ropes with combinations and body shots */
let ROUND_LEN = 120; const BREAK_LEN = 7; let ROUNDS = 5;   // ROUND_LEN: a P2P host may set 60 / 120 / 180 s (18_net.js); ROUNDS: 3 in a P2P match by default (issue 49)
const STYLES = {
  brawler: { label: 'рубака', gap: 0.72, w: { jab: 2, cross: 3, hookL: 3.5, hookR: 3.2, upperL: 1, upperR: 1.4, over: 2.4 }, dodge: 0.55, block: 0.5, combo: 0.55, trade: 0.55, feint: 0.03, body: 0.15, adv: 0.05, counter: 0.15 },
  counter: { label: 'контрпанчер', gap: 1.35, w: { jab: 4, cross: 3.5, hookL: 2.5, hookR: 1.2, upperL: 1.4, upperR: 1.8, over: 0.6 }, dodge: 1.35, block: 0.9, combo: 0.3, trade: 0.12, feint: 0.16, body: 0.12, adv: -0.06, counter: 0.6 },
  pressure: { label: 'прессинг', gap: 0.9, w: { jab: 3.5, cross: 3, hookL: 2.6, hookR: 2, upperL: 1.2, upperR: 1.2, over: 1 }, dodge: 0.8, block: 0.8, combo: 0.8, trade: 0.35, feint: 0.1, body: 0.35, adv: 0.06, counter: 0.25 },
};
const AI = { lat: 0, latT: 0, backT: 0, t: 1.2, combo: 0, seen: -1, dodgeAt: 0, dodgeType: 'duck', blockUntil: 0, feintAt: 0, style: STYLES.brawler, mem: null };
/* ── R-10: the AI remembers the player's habits ──
   AI.mem.a — a sliding window of his last AI_MEM.win actions: { k: 'p' a punch (n, body) | 'd' a slip / duck / lean (ty, aft = within
   AI_MEM.aft s of his own punch) | 'b' the guard goes up, t }. Over the fight it learns from them:
   · fam[n] — how well it knows a punch he keeps repeating (≥ repN of his last rep): + learn per repeat, + corner between rounds;
     a known punch is slipped (the right way) or blocked more often — aiRead() · fam[n] of the way from his base odds to the top ones;
   · guard — the share of the time his guard is up (EMA over guardT s): a man who lives behind it gets body shots, hooks and
     power shots (the guard breaks under BLK.breakSta stamina — resolveHit; a body shot costs him 18 stamina, blocked or not);
   · blkRow — the AI's punches in a row that hit his guard: after AI_MEM.blkRow it stops feeding the guard and waits for his
     counter (holds its punches ctrWait s, stays alert ctrT s) — slips it and fires back (counterUntil ×1.5 damage);
   · open — he neither blocks nor slips (the masher): no point shelling up under his volume — the AI fires back into his punches
     (a man hit while throwing takes ×1.25, resolveHit `caught`), throws more often, counters off its slips, stays in his face.
     The o* constants are the odds / amounts it moves toward as open → 1: oDodge / oBlock / oTrade — answer to his punch
     (slip / guard / fire back), oGap — the pause between its punches shrinks ×(1 − oGap), oCtr — counter at once after a slip,
     oShell — share of the «three clean ones → cover up» reactions replaced by firing back, oSta — the stamina it still punches
     with (16 otherwise), oIn — m closer it stands (Fighter.footwork), oPow — power-shot odds added while he is gassed.
     Tuned on the R-02 bench (masher: was 100 / 100 / 100 % bot wins on easy / normal / hard);
   · aft — he slips after his own punches: the AI's next punch is the one that beats his usual slip.
   The strength of all of it is aiRead() = DIFFS[diff].read mapped 0.5 / 0.7 / 0.86 → 0.22 / 0.65 / 1 (easy / normal / hard).
   Reset per fight in startFight (aiMemReset); aiMemHit is called by resolveHit for every punch of the AI that reaches him. */
const AI_MEM = { win: 20, rep: 6, repN: 3, learn: 0.002, corner: 0.7, aft: 0.8, guardT: 4, blkRow: 3, ctrT: 2.5, ctrWait: 1.0,
  oDodge: 0.2, oTrade: 0.9, oBlock: 0, oGap: 0.4, oCtr: 0.5, oShell: 1, oSta: 12, oIn: 0.1, oPow: 0.5 };
const aiRead = () => clamp((DIFFS[G.diff].read - 0.4) / 0.46, 0, 1);
function aiMemReset() { AI.open = 0; AI.mem = { a: [], fam: {}, guard: 0, blkRow: 0, ctrT: 0, pid: -1, dObj: null, blk: false, lastP: -9, round: 1, ctrN: 0 }; }
function aiMemPush(e) { const a = AI.mem.a; a.push(e); if (a.length > AI_MEM.win) a.shift(); }
function aiRep(n) { const a = AI.mem.a; let c = 0, k = 0; for (let i = a.length - 1; i >= 0 && k < AI_MEM.rep; i--) if (a[i].k === 'p') { k++; if (a[i].n === n) c++; } return c; }
/* 1 = he never defends (no guard, no slips in the window), 0 = he does it all the time */
function aiOpen() {
  const M = AI.mem, a = M.a; if (a.length < 8) return 0; let d = 0; for (const e of a) if (e.k !== 'p') d++;
  return clamp(1 - 4 * d / a.length, 0, 1) * (1 - sstep(0.1, 0.35, M.guard));
}
/* his usual slip after his own punch (≥ half of his last slips came right after a punch), or null */
function aiAfter() {
  const ds = AI.mem.a.filter(e => e.k === 'd'); if (ds.length < 3) return null;
  const af = ds.filter(e => e.aft); if (af.length * 2 < ds.length) return null;
  const c = {}; for (const e of af) c[e.ty] = (c[e.ty] || 0) + 1; return Object.keys(c).sort((x, y) => c[y] - c[x])[0];
}
function aiMemTick(dt, pl) {
  const M = AI.mem || (aiMemReset(), AI.mem);
  if (M.round !== G.round) {   // the corner: what he kept doing gets talked over between rounds
    M.round = G.round; M.blkRow = 0; M.ctrT = 0;
    for (const n in M.fam) if (M.fam[n] > 0.02) M.fam[n] = Math.min(1, M.fam[n] + AI_MEM.corner);
  }
  M.guard += ((pl.blocking ? 1 : 0) - M.guard) * Math.min(1, dt / AI_MEM.guardT);
  if (pl.blocking && !M.blk) aiMemPush({ k: 'b', t: G.t }); M.blk = !!pl.blocking;
  if (pl.dodge && pl.dodge !== M.dObj) { M.dObj = pl.dodge; aiMemPush({ k: 'd', ty: pl.dodge.type, t: G.t, aft: G.t - M.lastP < AI_MEM.aft }); }
  if (pl.cur && M.pid !== pl.punchId) {
    M.pid = pl.punchId; M.lastP = G.t; aiMemPush({ k: 'p', n: pl.cur, body: !!pl.bodyShot, t: G.t });
    if (aiRep(pl.cur) >= AI_MEM.repN) M.fam[pl.cur] = Math.min(1, (M.fam[pl.cur] || 0) + AI_MEM.learn);
  }
}
/* one punch of the AI reached him: on his guard or clean (from resolveHit) */
function aiMemHit(blocked) {
  const M = AI.mem; if (!M) return;
  if (!blocked) { M.blkRow = 0; return; }
  if (++M.blkRow >= AI_MEM.blkRow) { M.blkRow = 0; M.ctrT = G.t + AI_MEM.ctrT; M.ctrN++; AI.combo = 0; }   // stop feeding the guard: wait for his counter
}
function ai(dt) {
  if (window.__tutOn) return;   // (issue 45) the sparring partner stands and waits (his slow block-step punches come from tutTick)
  if (NET.host) return netHostAI(dt);   // issue 49: P2 is the guest's man, not the AI
  if (BAG.on) { AI.t = 9; return; }
  const me = P2, pl = P1, D = DIFFS[G.diff], S = AI.style;
  aiMemTick(dt, pl);
  if (me.doomed || me.liver || me.wind > G.t) return;
  me.blocking = G.t < AI.blockUntil;
  const M = AI.mem, A = aiRead(), open = AI.open = aiOpen() * A;
  // a feint: the shoulder twitches, the punch never comes
  if (AI.feintAt && G.t >= AI.feintAt) { AI.feintAt = 0; if (me.cur && !me.resolved) me.cancelPunch(); }
  if (pl.cur && AI.seen !== pl.punchId) {
    AI.seen = pl.punchId;
    const n = pl.cur, P = PUNCH[n], react = Math.max(0, (P.impact - P.start) / pl.speed - 0.17 - rr() * 0.08);
    // R-10: a punch he keeps repeating is seen coming (fam), and so is his counter after three of ours on his guard (ctrT)
    const known = Math.max(aiRep(n) >= AI_MEM.repN ? A * (M.fam[n] || 0) : 0, M.ctrT > G.t ? 0.85 * A : 0);
    const see = 1 - INJ.eyeSee * injEye(me, pl, n);   // issue 88: a punch coming round on his closing eye is seen late
    const kd = Math.max(known, open) * see, pD = D.dodge * S.dodge * see, pB = D.dodge * 0.6 * S.block * see, busy = (me.cur ? 0.25 : 1) * (1 - 0.6 * me.daze);
    if (rr() < (pD + Math.max(0, (open > known ? AI_MEM.oDodge : 0.8) - pD) * kd) * busy) {
      const good = rr() < D.read + (1 - D.read) * known, ok = pl.bodyShot ? ['lean'] : EV[n], all = ['slipL', 'slipR', 'duck', 'lean'];
      AI.dodgeType = good ? ok[(rr() * ok.length) | 0] : all[(rr() * 4) | 0]; AI.dodgeAt = G.t + react;
    } else if (rr() < (S.trade + (AI_MEM.oTrade - S.trade) * open) * (1 - 0.4 * me.daze) && me.canAct() && me.stamina > lerp(12, AI_MEM.oSta, open)) {
      // he doesn't get out of the way — he fires back: the exchange
      const pick = rr() < 0.5 ? (rr() < 0.5 ? 'hookL' : 'hookR') : rr() < 0.6 ? 'cross' : 'over'; me.wantBody = false; me.startPunch(pick); AI.t = 0.25;
    } else if (rr() < pB + Math.max(0, 0.9 - pB) * known + Math.max(0, AI_MEM.oBlock - pB) * open) AI.blockUntil = G.t + react + 0.45;
  }
  if (AI.dodgeAt && G.t >= AI.dodgeAt) { AI.dodgeAt = 0; if (me.canAct() || me.canChain()) me.startDodge(AI.dodgeType); }
  AI.t -= dt;
  if (!me.cur && !me.gest && G.t > (AI.gestT || 5) && !me.blocking && pl.cur == null) {
    AI.gestT = G.t + 4 + rr() * 6; const W = me.flesh.wounds;
    if (W.some(w => w.kind === 'nose') && rr() < 0.6) me.gest = { S: 'R', pt: new V3(0, -0.035, 0.11), t: 0, T: 0.55 };
    else if (W.some(w => w.kind === 'cut') && rr() < 0.5) me.gest = { S: rr() < 0.5 ? 'L' : 'R', pt: new V3((rr() < 0.5 ? -1 : 1) * 0.035, 0.035, 0.1), t: 0, T: 0.6 };
    else if (me.stamina < 30 && rr() < 0.3) me.gest = { S: 'L', pt: new V3(0, -0.07, 0.1), t: 0, T: 0.5 };   // the back of the glove across the mouth
  }
  if (me.gest) return;
  // feet: he circles now and then (counter-punchers more), off the ropes toward the centre, and gives ground after a hard shot
  if ((AI.latT -= dt) <= 0) {
    const rl = ringPt(me.group.position, _v1), dz = _v2.set(0, 0, -1).transformDirection(_m4a.copy(ARENA.matrixWorld).invert()), out = edgeDist(rl) < 0.9;
    const sgn = out ? -Math.sign(rl.dot(dz)) || 1 : rr() < 0.5 ? -1 : 1;
    AI.lat = out || rr() < (S === STYLES.counter ? 0.55 : 0.3) ? sgn * (0.5 + 0.5 * rr()) : 0; AI.latT = 0.5 + rr() * 1.2;
  }
  const dist = Math.abs(pl.group.position.x - me.group.position.x), inReach = dist < 1.13 - S.adv + 0.07;
  const free = (me.canAct() || (AI.combo && me.canChain())) && inReach;
  if (free && !AI.dodgeAt && !me.blocking) {
    const counter = me.counterUntil > G.t, waits = M.ctrT - AI_MEM.ctrT + AI_MEM.ctrWait > G.t && !counter;   // R-10: after three on his guard he waits for the man's counter
    if ((AI.t <= 0 || (counter && rr() < S.counter * 0.4 + AI_MEM.oCtr * Math.max(open, M.ctrT > G.t ? A : 0))) && me.stamina > lerp(16, AI_MEM.oSta, open) && !waits) {   // R-10: he is as empty as I am — punch anyway
      if (counter) M.ctrT = 0;
      const w = Object.assign({}, S.w), pd = (pl.dodge && pl.dodge.type) || (pl.cur && pl.resolved && aiAfter());   // R-10: his usual slip after his punch
      if (pd === 'duck') { w.upperL += 3; w.upperR += 3; } if (pd === 'slipL' || pd === 'slipR') { w.hookL += 2; w.over += 2; } if (pd === 'lean') { w.cross += 3; w.over += 2; }
      if (counter) { w.hookL += 2; w.upperR += 1; } if (pl.daze > 0.4) { w.over += 1.5; w.hookR += 1.5; }
      const shell = A * sstep(0.45, 0.8, M.guard);   // R-10: he lives behind his guard → around it (hooks), under it (body), through it (power)
      if (shell) { w.hookL += 3 * shell; w.hookR += 3 * shell; w.jab *= 1 - 0.6 * shell; }
      { const eL = injArm(pl, me, 'L'), eR = injArm(pl, me, 'R');   // issue 88: he goes round to the side the man's eye is closing on
        // (towards the worse eye: by the difference, so two swollen eyes don't just mean more hooks overall)
        if (eL !== eR) for (const k of PN) if (PUNCH[k].type !== 'straight') w[k] *= Math.max(0.3, 1 + INJ.eyeAim * (PUNCH[k].arm === 'L' ? eL - eR : eR - eL)); }
      let tot = 0; for (const k of PN) tot += w[k]; let r = rr() * tot, pick = 'jab'; for (const k of PN) { r -= w[k]; if (r <= 0) { pick = k; break; } }
      me.wantBody = (PUNCH[pick].type === 'straight' || PUNCH[pick].type === 'hook') && rr() < S.body + (0.55 - S.body) * shell;
      me.powerNext = rr() < (S === STYLES.brawler ? 0.3 : 0.15) * (pl.daze > 0.4 ? 2 : 1) + 0.4 * shell + AI_MEM.oPow * open * (1 - sstep(10, 25, pl.stamina)); me.startPunch(pick);   // R-10: sit down on it vs a gassed, open man
      if (!AI.combo && rr() < S.feint) { AI.feintAt = G.t + 0.07 + rr() * 0.05; AI.t = 0.35 + rr() * 0.3; return; }
      if (AI.combo > 0) { AI.combo--; AI.t = 0; } else { AI.combo = rr() < S.combo ? (rr() < 0.45 ? 2 : 1) : 0; AI.t = AI.combo ? 0 : D.gap * S.gap * (0.55 + rr() * 0.95) * (pl.daze > 0.5 ? 0.6 : 1) * (1 - AI_MEM.oGap * open); }
    }
  }
}
function aiFollow() {   // he doesn't let a falling man go: one or two more on the way down
  if (NET.host) return;   // issue 49: the guest drives P2 himself
  if (!followOK(P2) || !P2.canAct() || (AI.fol = (AI.fol || 0)) >= 2 || G.t < (AI.folT || 0)) return;
  AI.fol++; AI.folT = G.t + 0.25 + rr() * 0.2; P2.wantBody = false; P2.powerNext = true; P2.startPunch(rr() < 0.5 ? 'hookL' : rr() < 0.6 ? 'cross' : 'over');
}
const Q = [];
function playerInput() {
  while (Q.length && G.real - Q[0].at > 0.35) Q.shift();   // a press older than this is not what he means any more
  if (!Q.length) return; const q = Q[0];
  if (!(P1.canAct() || P1.canChain(q.type === 'punch' ? q.name : null))) return;
  Q.shift();
  if (q.type === 'punch') { P1.wantBody = q.body; P1.powerNext = q.pow; P1.startPunch(q.name); } else P1.startDodge(q.name);
}

/* ───────── flow ───────── */
function show(id, on) { $(id).hidden = !on; }
function toMenu() {
  if (NET.role) netClose();   // issue 49: leaving the match tears the P2P connection down
  if (window.__tutOn) tutEnd();   // (issue 45) leaving through the pause «Сдаться / Выйти» also closes the lesson
  storyUndress();   // R-17: the story chapter's clothes come off, LOOK goes back on (19_story.js)
  socFlush(); socLeave();   // the frame of the last post; a challenge's place and level go back (15_social.js)
  if (G.mode === 'career') G.diff = G.userDiff; BAG.on = false; showP2(true); BAG.g.visible = false; updateMenu(); for (const F of [P1, P2]) F.sparGear(false);
  G.state = 'menu'; G.paused = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; G.shake = 0; FX.clearAir(); FX.clearFloor(); REC.frames.length = 0; REC.events.length = 0; wearReset();
  P1.resetState(); P2.resetState(); rollOpponent();
  G.stareOn = false; G.stare = 0; G.rend = null; RP.hl = false; show('hl', false); P1.pant = P2.pant = 0;
  CROWD.fill = 1; UI.from = null; uiShow('main'); show('vs', false); show('hud', false); show('pad', false); show('result', false); show('rec', false); show('bar-t', false); show('bar-b', false);
  camCut = true; ARENA.position.set(0, 0, 0); ARENA.rotation.y = 0; setLocation(G.loc);
  locPrefetchKick();   // #47: in idle, prebuild the place of the next fight (17_loc_load.js)
  showP2(false);   // the menu shows the player's man alone (startFight brings the opponent back)
}
const NAMES = ['Грек', 'Молот', 'Кабан', 'Шрам', 'Лом', 'Бизон', 'Кувалда', 'Седой'];
function rollOpponent() {
  const sh = SHORTS_LOOKS.filter(s => s.id !== wearGet(LOOK, 'bottom').color), hl = HAIR_LOOKS, pick = a => a[(rr() * a.length) | 0];
  const skin = pick(SKIN_LOOKS).id, tats = rr() < 0.45 ? TATS.filter(() => rr() < 0.3).map(t => t.id) : [];
  P2.applyLook({ shorts: pick(sh).id, hair: pick(hl).id, hairStyle: randomCut(skin, rr), skin, beard: rr() < 0.6 ? pick(BEARD_STYLES).id : 'none', tats, wraps: rr() < 0.6 ? 'white' : pick(WRAPS_LOOKS).id, guard: pick(GUARDS).id, hands: rr() < 0.3 ? 'mma' : 'wraps', ...(isStreet() ? streetLook() : {}) });   // street locations: a random street outfit (04d_street.js)
  const nm = pick(NAMES), st = { 'Грек': 'counter', 'Молот': 'brawler', 'Кабан': 'brawler', 'Шрам': 'pressure', 'Лом': 'brawler', 'Бизон': 'pressure', 'Кувалда': 'brawler', 'Седой': 'counter' }[nm];
  AI.style = STYLES[st]; $('n2').textContent = nm; const sl = $('st2'); if (sl) sl.textContent = STYLES[st].label;
}
