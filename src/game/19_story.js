/* ───────── story: «История» instead of the career ladder (issue #51, part 1: the frame + chapter «Бар») ─────────
   The rise from the bottom, Punch-Club style. STORY.chapters is a flat list; a chapter is one flow:
     intro dialog  →  one fight (no rounds, to the knockout)  →  outro dialog  →  the purse (payOut/purse) and the followers (socFight).
   CHAPTER FORMAT (parts 2–3 only add data here and a fight rule where needed):
     { id, title, sub,                       // sub: one line in the «История» list
       todo: true,                           // a chapter not implemented yet: the list shows «скоро», it is not playable
       intro: [line, …], outro: [line, …], outroLose: [line, …],
       fight: { loc, nm, st, diff, lvl, speed, drunk, look },   // place, the name on the HUD, STYLES key, level, P2 stat level (0-5),
                                                                 // P2 speed ×, the drunk sway, his fixed look (04d_street clothes, like LADDER)
       reward: { win, ko } }                 // ₽ lines of the purse (07b_economy.js); a win also gives pts fighter points
   LINE FORMAT: { who: 'p' | 'o' | 'n' | 'a name', text, card, opt: [{ t, r, a }] }
     who — who speaks: 'p' the hero (camera closes on his face), 'o' the opponent (camera on his), 'n' or a name — off screen (wide shot);
     card — a title plate instead of the dialog box («Три года спустя»): any tap / Enter moves on;
     opt — 1–2 answers; only the text and PROF.story.pick change (attitude `a` for later parts).
   State: dialogs run while G.state === 'talk' (camUpdate → talkCam); the fighters just stand, the crowd murmurs.
   Progress: PROF.story = { done: cleared chapters, mig, pick: { chapterId: choice } } — it lives in the 'ko-ring' save.
   Entry: the menu item «ИСТОРИЯ» (14_screens.js) → the screen #story (buildStory) → «Играть». The old ladder stays under «Лестница».
   Debug: __story.play(0) · __story.skip() · __story.next() · __story.ko(true) · __story.end() */
const STORY = { chapters: [
  { id: 'bar', title: 'Бар', sub: 'Ночь. Ты задержался на один бокал после смены.',
    intro: [
      { card: 'Бар' },
      { who: 'p', text: 'Последняя смена на неделе. Задержался на один бокал — и, как назло, в баре уже кто-то был.' },
      { who: 'o', text: 'Э, малой. Ты мне подножку поставил, когда заходил. Или как это у вас называется?' },
      { who: 'p', text: 'На ногах ты держишься плохо. Извинись — или держись за стойку.', opt: [
        { t: 'Извини. Садись, допивай и остывай.', r: 'Пёс молча кивает и тянет табурет. Кажется, он именно этого и ждал. Но за его спиной уже собрались завсегдатаи — им скучно.', a: 1 },
        { t: 'Иди домой, дед. Тут не твоё время.', r: 'Пёс усмехается и ставит стакан на стойку. Домой он сегодня точно не пойдёт.', a: -1 } ] },
      { who: 'n', text: 'Бармен не вмешался. Он просто вытер стакан и стал ждать, когда начнётся.' },
      { who: 'o', text: 'Давай, чемпион. Развлеки старика. Кто упал — тот и прав.' } ],
    fight: { loc: 'bar', nm: 'Пёс', st: 'drunk', diff: 'easy', lvl: 0, speed: 0.88, drunk: true,
      look: { skin: 'tan', hair: 'bald', beard: 'stubble', top: 'tank', bottom: 'sweatG', shoes: 'sneakB', wraps: 'white', hands: 'wraps', guard: 'clear', shorts: 'black', tats: [] } },
    outro: [
      { who: 'n', text: 'В зале стало тише обычного. Даже холодильник за стойкой будто перестал гудеть.' },
      { who: 'o', text: 'Не по голове… Вставай. Садись. С тебя следующий, но без фанатизма.' },
      { who: 'n', text: 'Уже на улице догнала сирена. Мутный вечер: в баре дрались, а запись в журнал ляжет на тебя.' } ],
    outroLose: [
      { who: 'n', text: 'Очнулся ты у стойки. Перед тобой стоит полный бокал — кто-то умеет ухаживать за проигравшими.' },
      { who: 'o', text: 'Лежи, чемпион. Лежать тебе пока полезнее, чем драться.' } ],
    reward: { win: 700, ko: 300 }, pts: 2 },
  { id: 'patrol', title: 'Патруль', sub: 'На шум приезжает полиция. Дубинка бьёт далеко и сильно.', todo: true },
  { id: 'prison', title: 'Тюрьма', sub: 'Три года. Двор, этап, сокскамерники, смотрящий.', todo: true },
  { id: 'under', title: 'Подполье', sub: 'На выходе — организатор подпольных боёв и первые деньги.', todo: true },
  { id: 'circle', title: 'Железный круг', sub: 'Своя лига. Путь к поясу.', todo: true },
] };

/* the drunk: heavy loops and overhands from far, almost no defence, long pauses between swings — «размашистый, медленный» */
STYLES.drunk = { label: 'пьяный', gap: 1.65, w: { jab: 1, cross: 1.3, hookL: 3.4, hookR: 3.1, upperL: 0.5, upperR: 0.8, over: 4.2 }, dodge: 0.16, block: 0.25, combo: 0.3, trade: 0.6, feint: 0, body: 0.12, adv: 0.02, counter: 0.08 };
/* the bar joins the quick-fight list only after chapter 1 (15_social.js checks LOC_LOCK in locOpen) */
LOC_LOCK.bar = () => storyDone() >= 1;
/* old saves: whoever climbed the ladder has walked this road already — chapter 1 counts as cleared, plus a gift */
if (!PROF.story) PROF.story = { done: 0, mig: 0, pick: {} };
else { PROF.story.done = PROF.story.done | 0; PROF.story.pick = PROF.story.pick || {}; }
if (!PROF.story.mig) { PROF.story.mig = 1; if (G.career > 0 || PROF.champ > 0) { PROF.story.done = Math.max(PROF.story.done, 1); PROF.cash += 1000; save(); } }

const storyCh = (i = G.story) => STORY.chapters[i];
const storyDone = () => Math.max(0, PROF.story.done | 0);
const storyPlayable = i => !!STORY.chapters[i] && !STORY.chapters[i].todo && i <= storyDone();
const STORY_TIME = 3600;   // s: a story bout has no rounds — the clock is only there so endRound() can never catch it
function storyClear(i = G.story) { PROF.story.done = Math.max(storyDone(), i + 1); save(); }
function storyPick(lineId, k) { PROF.story.pick[storyCh().id + (lineId ? '#' + lineId : '')] = k; save(); }
function storyMenuLbl() {
  const d = storyDone(), ch = STORY.chapters[d];
  if (!ch) return `пройдено глав: ${d}`;
  if (d === 0) return `глава 1 · ${ch.title}`;
  return ch.todo ? `дальше: «${ch.title}» — скоро` : `дальше: глава ${d + 1} · ${ch.title}`;
}

/* ── the dialog: one plate over the scene, G.state 'talk' ── */
const DLG = { lines: [], i: 0, after: null, active: false, reply: false, kicker: '', who: 'n', camWho: null };
function storyTalk(lines, after) {
  DLG.lines = lines || []; DLG.i = 0; DLG.after = after || null; DLG.reply = false;
  if (!DLG.lines.length) { const A = DLG.after; DLG.after = null; A && A(); return; }
  G.state = 'talk'; DLG.active = true; DLG.camWho = null;
  show('hud', false); show('pad', false); show('vs', false); show('result', false); show('rec', false);
  $('dlg').hidden = true; $('dlg-card').hidden = true;
  dlgDraw();
}
function dlgCur() { return DLG.lines[DLG.i] || null; }
function dlgName(L) {
  if (L.who === 'p') return myName();
  if (L.who === 'o') { const ch = storyCh(); return ch ? ch.fight.nm : 'Соперник'; }
  if (L.who && L.who !== 'n') return L.who;   // a named off-screen voice: its own name
  return '';
}
function dlgDraw() {
  const L = dlgCur(); if (!L) return dlgDone();
  DLG.reply = false; DLG.who = L.who || 'n';
  const cut = DLG.camWho !== DLG.who || !!L.card; DLG.camWho = L.card ? 'card' : DLG.who; if (cut) camCut = true;
  const card = !!L.card, box = $('dlg'), pl = $('dlg-card');
  box.hidden = card; pl.hidden = !card;
  if (card) { $('dlg-card-t').textContent = L.card; return; }
  $('dlg-k').textContent = DLG.kicker;
  const nm = dlgName(L), ne = $('dlg-n'); ne.hidden = !nm; ne.textContent = nm;
  $('dlg-t').textContent = L.text || '';
  const op = $('dlg-opts'); op.textContent = '';
  for (const o of L.opt || []) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = o.t;
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dlgChoose(o); });
    b.addEventListener('click', e => { e.stopPropagation(); if (!DLG.reply) dlgChoose(o); });
    op.appendChild(b); }
  $('dlg-hint').textContent = (L.opt && !DLG.reply) ? 'выбери ответ' : 'далее — тап или Enter';
}
function dlgChoose(o) {
  if (DLG.reply) return;
  DLG.reply = true; storyPick(DLG.i, (dlgCur().opt || []).indexOf(o));
  $('dlg-t').textContent = o.r || ''; $('dlg-opts').textContent = ''; $('dlg-hint').textContent = 'далее — тап или Enter';
}
function dlgNext() {
  if (!DLG.active) return;
  const L = dlgCur(); if (L && L.opt && !DLG.reply) return;   // an answer must be picked first
  DLG.i++; if (DLG.i >= DLG.lines.length) return dlgDone();
  dlgDraw();
}
function dlgDone() {
  DLG.active = false; DLG.lines = []; DLG.i = 0; $('dlg').hidden = true; $('dlg-card').hidden = true;
  const A = DLG.after; DLG.after = null; A && A();
}
/* Enter / Space / a tap — the next card; Esc — skip the whole dialog (12_ui.js routes it here first) */
function storyTalkKey(e) {
  if (!DLG.active) return false;
  if (e.key === 'Escape') { dlgDone(); return true; }
  if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') { dlgNext(); return true; }
  return false;
}
/* the camera of a dialog line: close on the speaker's face (stareCam-style), a wide shot for off-screen voices */
function talkCam() {
  if (DLG.who === 'p' || DLG.who === 'o') {
    const F = DLG.who === 'p' ? P1 : P2, h = F.headNow, f = Math.sign(F.other.headNow.x - h.x) || 1;
    _cp.set(h.x + f * 0.16, h.y - 0.05, 0.52); _cl.set(h.x + f * 0.1, h.y - 0.08, 0); return 7;
  }
  const mx = (P1.headNow.x + P2.headNow.x) * 0.5;
  _cp.set(mx, 1.16, 3.1); _cl.set(mx, 0.94, 0); return 2.6;
}
{ const box = $('dlg'), card = $('dlg-card');
  for (const el of [box, card]) el.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('button') && !e.target.closest('.dlg-skip')) return; e.preventDefault(); dlgNext(); });
  $('dlg-skip').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); dlgDone(); }); }

/* ── the chapter flow ── */
function storyPlay(i) {
  const ch = STORY.chapters[i];
  if (!ch || !storyPlayable(i)) return false;
  G.mode = 'story'; G.story = i; G.storyOut = false;
  if (!G.storyHome || G.state === 'menu') G.storyHome = G.loc;   // the place the menu was showing; toMenu puts it back (a rematch from the result keeps it)
  G.prev = { diff: G.userDiff, loc: G.storyHome };       // toMenu → socLeave() restores the level and the place
  G.loc = ch.fight.loc; G.diff = ch.fight.diff || 'easy';
  UI.from = null; uiShow(null); show('result', false); show('rec', false);
  DLG.kicker = `глава ${i + 1} · ${ch.title}`;
  const go = () => {
    setLocation(ch.fight.loc);
    showP2(true); P2.applyLook({ ...ch.fight.look, street: true });
    AI.style = STYLES[ch.fight.st] || STYLES.brawler; $('n2').textContent = ch.fight.nm;
    const sl = $('st2'); if (sl) sl.textContent = AI.style.label;
    P1.resetState(); P2.resetState(); sfx.unlock();
    storyTalk(ch.intro, storyFightGo);
  };
  const cold = !LOCS[ch.fight.loc] || !LOCS[ch.fight.loc].group;
  if (cold) { locBusy(true); setTimeout(() => { try { go(); } finally { locBusy(false); } }, 0); } else go();
  return true;
}
function storyFightGo() {
  startFight(true);
  if (LOC.noFly) msg(LOC.label, 'place');   // the bar gets no fly-round — the dialogue already showed the place
}
/* the end of the bout: the story intercepts endReplay() with its outro; the result screen comes after the dialog */
function storyOut(win) {
  if (G.mode !== 'story') return false;
  const ch = storyCh(); if (!ch) return false;
  if (G.storyOut) return false;
  G.storyOut = true;
  const lines = win ? ch.outro : ch.outroLose;
  storyTalk(lines, () => { G.state = 'result'; camCut = true; show('result', true); });
  return true;
}
/* «Реванш / Дальше» on the result screen (r-again routes here through startFight's dispatch) */
function storyAgain() {
  const i = G.story;
  if (storyDone() > i) {                       // the chapter is cleared: on to the next, or back to the «История» screen
    if (storyPlayable(i + 1)) return storyPlay(i + 1);
    toMenu(); return uiShow('story', 'st-back');
  }
  storyPlay(i);                                // a loss: the same chapter again, from its dialog
}
/* the drunk: he never fully stops swaying, and now and then one leg gives out (Fighter's wobble drives the pose) */
function storyTick(dt) {
  const ch = storyCh(); if (!ch || !ch.fight.drunk) return;
  const F = P2; if (!F || F.ko || (F.rag && F.rag.on) || F.gu) return;
  if (G.state !== 'fight' && G.state !== 'talk' && G.state !== 'intro' && G.state !== 'break') return;
  F.drunkT = (F.drunkT || 0) + dt;
  F.wobble = Math.max(F.wobble, 0.3 + 0.16 * Math.sin(F.drunkT * 1.6 + (F.ph || 0)));
  if (F.drunkT > (F.drunkNext || 4)) { F.drunkNext = F.drunkT + 3 + rr() * 4.5; if (G.state === 'fight') F.wobble = Math.max(F.wobble, 0.9 + rr() * 0.5); }
}

/* ── the «История» screen: a vertical timeline of the chapters ── */
function buildStory() {
  const box = $('st-list'); if (!box) return;
  box.textContent = '';
  STORY.chapters.forEach((ch, i) => {
    const done = i < storyDone(), cur = storyPlayable(i) && !done, lock = !done && !cur;
    const row = document.createElement('div'); row.className = 'stc ' + (done ? 'done' : cur ? 'cur' : 'lock');
    row.innerHTML = `<i class="dot"></i><div class="stc-b"><b>${i + 1}. ${esc(ch.title)}</b><small>${esc(ch.sub || '')}</small></div>`;
    if (done || cur) { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm' + (cur ? ' pri' : ''); b.textContent = done ? 'Ещё раз' : 'Играть';
      if (cur) b.id = 'st-play'; b.onclick = () => storyPlay(i); row.appendChild(b); }
    else { const s = document.createElement('span'); s.className = 'stc-lock'; s.textContent = ch.todo ? 'скоро' : '🔒'; row.appendChild(s); }
    box.appendChild(row);
  });
}
/* debug / screenshot hook: play a chapter, drive the dialog, finish the bout without the long cinematic */
window.__story = {
  STORY, DLG,
  get done() { return storyDone(); },
  play(i = storyDone()) { return storyPlay(i) ? G.state : 'locked'; },
  next(n = 1) { for (let k = 0; k < n && DLG.active; k++) { const L = dlgCur(); if (L && L.opt && !DLG.reply) dlgChoose(L.opt[0]); dlgNext(); } return DLG.active ? DLG.i + '/' + DLG.lines.length : 'done'; },
  skip() { if (DLG.active) dlgDone(); return G.state + ':' + G.mode; },
  begin(i) { if (storyPlay(i ?? storyDone())) { while (DLG.active && G.state === 'talk') { const L = dlgCur(); if (L.opt && !DLG.reply) dlgChoose(L.opt[0]); dlgNext(); } } return G.state; },
  ko(win = true) {
    if (G.state === 'talk' || G.state === 'intro') return 'not fighting yet: ' + G.state;
    if (G.state !== 'fight') return 'not fighting: ' + G.state;
    const att = win ? P1 : P2, def = win ? P2 : P1;
    def.lastContact = def.headNow.clone(); window.__fall = 'back';
    knockout(att, def, new V3(1, 0.2, 0).normalize(), 1.3, 'cross', 1, true, false);
    delete window.__fall;
    if (window.__tick) __tick(95, 1 / 60);   // let the fall itself get into the replay buffer, then cut it short
    this.end(); return G.state;
  },
  end() {   // skip the rest of the KO cinematic: replay only the very last frames, then endReplay → outro/result
    if (G.state === 'ko') { G.koTitle = true; startReplay(); }
    if (G.state === 'replay' && REC.frames.length > 3) { const t1 = REC.frames[REC.frames.length - 1].t;
      RP.segs = [{ from: Math.max(REC.frames[0].t, t1 - 0.06), to: t1, rate: 14, cam: 'wide' }]; RP.seg = -1; nextSeg(); }
    return G.state;
  },
};
