/* ───────── AI ───────── */
/* opponent styles, after how bare-knuckle bouts actually go: short range, lots of hooks and overhands, fighters who stand and trade,
   counter-punchers who make you miss and make you pay, and pressure fighters who walk you to the ropes with combinations and body shots */
const ROUND_LEN = 120, ROUNDS = 5, BREAK_LEN = 7;
const STYLES = {
  brawler: { label: 'рубака', gap: 0.72, w: { jab: 2, cross: 3, hookL: 3.5, hookR: 3.2, upperL: 1, upperR: 1.4, over: 2.4 }, dodge: 0.55, block: 0.5, combo: 0.55, trade: 0.55, feint: 0.03, body: 0.15, adv: 0.05, counter: 0.15 },
  counter: { label: 'контрпанчер', gap: 1.35, w: { jab: 4, cross: 3.5, hookL: 2.5, hookR: 1.2, upperL: 1.4, upperR: 1.8, over: 0.6 }, dodge: 1.35, block: 0.9, combo: 0.3, trade: 0.12, feint: 0.16, body: 0.12, adv: -0.06, counter: 0.6 },
  pressure: { label: 'прессинг', gap: 0.9, w: { jab: 3.5, cross: 3, hookL: 2.6, hookR: 2, upperL: 1.2, upperR: 1.2, over: 1 }, dodge: 0.8, block: 0.8, combo: 0.8, trade: 0.35, feint: 0.1, body: 0.35, adv: 0.06, counter: 0.25 },
};
const AI = { lat: 0, latT: 0, backT: 0, t: 1.2, combo: 0, seen: -1, dodgeAt: 0, dodgeType: 'duck', blockUntil: 0, feintAt: 0, style: STYLES.brawler };
function ai(dt) {
  if (BAG.on) { AI.t = 9; return; }
  const me = P2, pl = P1, D = DIFFS[G.diff], S = AI.style;
  if (me.doomed || me.liver || me.wind > G.t) return;
  me.blocking = G.t < AI.blockUntil;
  // a feint: the shoulder twitches, the punch never comes
  if (AI.feintAt && G.t >= AI.feintAt) { AI.feintAt = 0; if (me.cur && !me.resolved) me.cancelPunch(); }
  if (pl.cur && AI.seen !== pl.punchId) {
    AI.seen = pl.punchId;
    const n = pl.cur, P = PUNCH[n], react = Math.max(0, (P.impact - P.start) / pl.speed - 0.17 - rr() * 0.08);
    if (rr() < D.dodge * S.dodge * (me.cur ? 0.25 : 1) * (1 - 0.6 * me.daze)) {
      const good = rr() < D.read, ok = pl.bodyShot ? ['lean'] : EV[n], all = ['slipL', 'slipR', 'duck', 'lean'];
      AI.dodgeType = good ? ok[(rr() * ok.length) | 0] : all[(rr() * 4) | 0]; AI.dodgeAt = G.t + react;
    } else if (rr() < S.trade * (1 - 0.4 * me.daze) && me.canAct() && me.stamina > 12) {
      // he doesn't get out of the way — he fires back: the exchange
      const pick = rr() < 0.5 ? (rr() < 0.5 ? 'hookL' : 'hookR') : rr() < 0.6 ? 'cross' : 'over'; me.wantBody = false; me.startPunch(pick); AI.t = 0.25;
    } else if (rr() < D.dodge * 0.6 * S.block) AI.blockUntil = G.t + react + 0.45;
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
    const counter = me.counterUntil > G.t;
    if ((AI.t <= 0 || (counter && rr() < S.counter * 0.4)) && me.stamina > 16) {
      const w = Object.assign({}, S.w), pd = pl.dodge && pl.dodge.type;
      if (pd === 'duck') { w.upperL += 3; w.upperR += 3; } if (pd === 'slipL' || pd === 'slipR') { w.hookL += 2; w.over += 2; } if (pd === 'lean') { w.cross += 3; w.over += 2; }
      if (counter) { w.hookL += 2; w.upperR += 1; } if (pl.daze > 0.4) { w.over += 1.5; w.hookR += 1.5; }
      let tot = 0; for (const k of PN) tot += w[k]; let r = rr() * tot, pick = 'jab'; for (const k of PN) { r -= w[k]; if (r <= 0) { pick = k; break; } }
      me.wantBody = (PUNCH[pick].type === 'straight' || PUNCH[pick].type === 'hook') && rr() < S.body;
      me.powerNext = rr() < (S === STYLES.brawler ? 0.3 : 0.15) * (pl.daze > 0.4 ? 2 : 1); me.startPunch(pick);
      if (!AI.combo && rr() < S.feint) { AI.feintAt = G.t + 0.07 + rr() * 0.05; AI.t = 0.35 + rr() * 0.3; return; }
      if (AI.combo > 0) { AI.combo--; AI.t = 0; } else { AI.combo = rr() < S.combo ? (rr() < 0.45 ? 2 : 1) : 0; AI.t = AI.combo ? 0 : D.gap * S.gap * (0.55 + rr() * 0.95) * (pl.daze > 0.5 ? 0.6 : 1); }
    }
  }
}
function aiFollow() {   // he doesn't let a falling man go: one or two more on the way down
  if (!followOK(P2) || !P2.canAct() || (AI.fol = (AI.fol || 0)) >= 2 || G.t < (AI.folT || 0)) return;
  AI.fol++; AI.folT = G.t + 0.25 + rr() * 0.2; P2.wantBody = false; P2.powerNext = true; P2.startPunch(rr() < 0.5 ? 'hookL' : rr() < 0.6 ? 'cross' : 'over');
}
const Q = [];
function playerInput() {
  while (Q.length && G.real - Q[0].at > 0.7) Q.shift();
  if (!Q.length) return; const q = Q[0];
  if (!(P1.canAct() || P1.canChain(q.type === 'punch' ? q.name : null))) return;
  Q.shift();
  if (q.type === 'punch') { P1.wantBody = q.body; P1.powerNext = q.pow; P1.startPunch(q.name); } else P1.startDodge(q.name);
}

/* ───────── flow ───────── */
function show(id, on) { $(id).hidden = !on; }
function toMenu() {
  if (G.mode === 'career') G.diff = G.userDiff; BAG.on = false; showP2(true); BAG.g.visible = false; updateMenu(); for (const F of [P1, P2]) F.sparGear(false);
  G.state = 'menu'; FX.clearAir(); FX.clearFloor(); REC.frames.length = 0; REC.events.length = 0;
  P1.resetState(); P2.resetState(); rollOpponent();
  show('menu', true); show('hud', false); show('pad', false); show('result', false); show('rec', false); show('bar-t', false); show('bar-b', false);
  camCut = true; ARENA.position.set(0, 0, 0); ARENA.rotation.y = 0; setLocation(G.loc);
}
const NAMES = ['Грек', 'Молот', 'Кабан', 'Шрам', 'Лом', 'Бизон', 'Кувалда', 'Седой'];
function rollOpponent() {
  const sh = SHORTS_LOOKS.filter(s => s.id !== LOOK.shorts), hl = HAIR_LOOKS, pick = a => a[(rr() * a.length) | 0];
  P2.applyLook({ shorts: pick(sh).id, hair: pick(hl).id, skin: pick(SKIN_LOOKS).id, beard: rr() < 0.6, wraps: rr() < 0.6 ? 'white' : pick(WRAPS_LOOKS).id, guard: pick(GUARDS).id });
  const nm = pick(NAMES), st = { 'Грек': 'counter', 'Молот': 'brawler', 'Кабан': 'brawler', 'Шрам': 'pressure', 'Лом': 'brawler', 'Бизон': 'pressure', 'Кувалда': 'brawler', 'Седой': 'counter' }[nm];
  AI.style = STYLES[st]; $('n2').textContent = nm; const sl = $('st2'); if (sl) sl.textContent = STYLES[st].label;
}
