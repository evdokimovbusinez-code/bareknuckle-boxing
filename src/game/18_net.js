/* ───────── issue 49: «Бой с другом» — PeerJS P2P, host-authoritative 1v1 ─────────
   One ES module scope with all the other game files, so everything here is a hoisted function. The host keeps running the
   fight exactly as it does against the AI; netHostAI() only replaces ai() as the source of P2's decisions (08_ai_flow.js).
   The guest simulates nothing: it gets ~30 Hz snapshots of Fighter.capture() poses and plays them back with a ~100 ms
   buffer, the same way stepReplay() plays REC.frames. Its own Q / MV / block never reach the local fighters — they are
   sent to the host from press()/setMove()/setBlock() in 12_ui.js.

   Wire format (all plain JSON-safe values; PeerJS connection uses serialization:'json'):
     hello  {c:'hello', look, nm}               once, on open — each side gets the other's fighter look
     in     {c:'in', x, y, b, q:[{t,n,body,pow}]}  guest → host, 30 Hz + immediately on every press
     s      {c:'s', t, st, d:[[..],[..]], gx:[x,x], ar:[x,z,ry], r:[..], h:[hp,hp], e:[sta,sta], rd, rt, ev:[..], p:[..]}
                                              host → guest, 30 Hz (1/30 s), ~3–5 KB each
     ping   {c:'ping', t} / {c:'pong', t}       both ways, 1 Hz; RTT in ms, yellow above 200
     over   {c:'over', w:0|1, d:0|1}           host → guest at the result (w = host's P1 won)
     again  {c:'again'}                        either side → the other, one-button rematch
   ev items: {t, w, b, p, s:[x,y,z], d:[x,y,z], m?} (hit / block / knockdown); p items: {t, p:[x,y,z], s, c} (captions).
   No TURN server: symmetric NAT / strict firewalls cannot connect — see .claude-summary.md. */

/* NET and the ICE/code tables are declared in 00a_net_state.js (an early file: see the note there). */
const r3 = v => Math.round(v * 1000) / 1000;
function netCode() {
  const a = new Uint8Array(6);
  try { crypto.getRandomValues(a); } catch (e) { for (let i = 0; i < 6; i++) a[i] = (Math.random() * 256) | 0; }
  return [...a].map(n => NET_ALPHA[n % NET_ALPHA.length]).join('');
}
function netSend(m) {
  const c = NET.conn;
  if (!c || !c.open) return;
  try {
    if (m.c === 's') { const n = JSON.stringify(m).length; NET.stat.snaps++; NET.stat.bytes += n; NET.stat.max = Math.max(NET.stat.max, n); }
    if (m.c === 'in') NET.stat.ins++;
    c.send(m);
  } catch (e) { /* a message lost in a closing connection is not worth a crash */ }
}

/* ── the menu screen ── */
function netBoot() {
  $('go-net').addEventListener('click', () => { uiShow('net'); netHome(); });
  $('net-back').addEventListener('click', uiBack);
  $('net-create').addEventListener('click', netCreate);
  $('net-join').addEventListener('click', () => netJoin($('net-code-in').value));
  $('net-code-in').addEventListener('keydown', e => { if (e.key === 'Enter') netJoin($('net-code-in').value); });
  $('net-copy').addEventListener('click', netCopy);
  $('net-share').addEventListener('click', netShare);
  // ?room=КОД — the shared link joins on its own
  const room = new URLSearchParams(location.search).get('room');
  if (room !== null) {
    uiShow('net'); netHome();
    const c = room.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
    if (c.length === 6) setTimeout(() => netJoin(c), 60);
    else netSt('Неверный код в ссылке', true);
  }
  window.__mp = {
    host: netCreate, join: netJoin, code: () => NET.code, link: () => NET.link, close: netClose,
    stat: () => ({ role: NET.role, started: NET.started, over: NET.over, buf: NET.snaps.length, playT: NET.playT,
      ping: NET.ping, dropT: NET.dropT, ready: !!(NET.peer && NET.peer.open), conn: !!(NET.conn && NET.conn.open), ...NET.stat }),
    hp: () => [P1.hp, P2.hp], state: () => [G.state, G.round, G.roundT, G.t],
    punch: (n, body, pow) => netSendPress('punch', n || 'jab', !!body, !!pow),
    dodge: n => netSendPress('dodge', n || 'duck', false, false),
    move: (x, y) => { MV.kx = x || 0; MV.ky = y || 0; netMove(); },
    drop: () => { NET.closing = true; if (NET.conn) NET.conn.close(); },   // a hard drop: no auto-reconnect, so the host's banner stays
    net: () => NET,
    room: c => netRoomUI(c || 'ABC234'),   // debug: the room panel (with the host's settings when NET.host)
    cfg: () => NET.cfg,
  };
}
function netHome() {
  netStanceUI();
  show('net-room', false); show('net-home', true); NET.roomShown = false;
  $('net-code-in').value = '';
  $('net-st').textContent = 'Бой 1 на 1 по ссылке. Хост считает бой, гость видит его со своей стороны. Без регистрации и своих серверов.';
  $('net-st').style.color = '';
}
function netSt(text, bad) {
  const el = $('net-st'); el.textContent = text; el.style.color = bad ? 'var(--neon)' : '';
}   // the room's «Ждём соперника…» line stays put — only the status above it changes
function netRoomUI(code) {
  show('net-home', false); show('net-room', true); NET.roomShown = true;
  NET.link = location.href.split('?')[0].split('#')[0] + '?room=' + code;
  $('net-code').textContent = code;
  $('net-link').textContent = NET.link;
  $('net-wait').textContent = NET.host ? 'Ждём соперника…' : 'Подключаемся…';
  show('net-cfg', NET.host); if (NET.host) netCfgUI();
}
/* the host's match settings: place, rounds, round length, rules (bare knuckle / sparring gloves + headgear), weapons (issue 52); the guest gets them in hello */
function netRounds(C) { return C.mode === 'ko' ? 99 : C.rounds; }   // «До нокаута»: no judges, the rounds just keep coming
/* your own stance (kept in LOOK, so it goes over in hello and stays for the creator / quick fights) */
function netStanceUI() {
  swatches('net-stance', [{ id: 'orth', label: 'Правша' }, { id: 'south', label: 'Левша' }], () => LOOK.stance === 'south' ? 'south' : 'orth', v => { LOOK.stance = v; try { save(); } catch (e) {} P1.applyLook(LOOK); }, true, true);
}
function netCfgUI() {
  const C = NET.cfg, box = $('net-loc'); box.textContent = '';
  if (!LOCS[C.loc] || !locOpen(C.loc)) C.loc = 'gym';
  for (const L of Object.values(LOCS)) { if (L.train || !locOpen(L.id)) continue;
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<b>${L.label}</b><small>${L.desc || ''}</small>`;
    b.setAttribute('aria-pressed', String(C.loc === L.id));
    b.onclick = () => { C.loc = L.id; for (const o of box.children) o.setAttribute('aria-pressed', String(o === b)); locPrefetchOne(L.id); };
    box.appendChild(b);
  }
  swatches('net-rounds', [1, 3, 5].map(n => ({ id: n, label: String(n) })), () => C.rounds, v => { C.rounds = v; }, true, true);
  swatches('net-len', [[60, '1 мин'], [120, '2 мин'], [180, '3 мин']].map(([id, label]) => ({ id, label })), () => C.len, v => { C.len = v; }, true, true);
  swatches('net-rules', [{ id: false, label: 'Голые кулаки' }, { id: true, label: 'Спарринг: перчатки и шлем' }], () => C.spar, v => { C.spar = v; }, true, true);
  swatches('net-weap', [{ id: false, label: 'Без оружия' }, { id: true, label: 'Кастеты разрешены' }], () => C.weap, v => { C.weap = v; }, true, true);   // issue 52
  const tip = () => { const M = NET_MODES.find(x => x.id === C.mode) || NET_MODES[0]; $('net-mode-tip').textContent = M.tip; $('net-rounds').parentElement.style.opacity = C.mode === 'ko' ? 0.4 : ''; };
  swatches('net-mode', NET_MODES.map(M => ({ id: M.id, label: M.label })), () => C.mode, v => { C.mode = v; tip(); }, true, true); tip();
}
function netCfgApply(C) {   // both sides, before the bout is set up
  if (!C) return;
  NET.cfg = { loc: LOCS[C.loc] ? C.loc : 'gym', rounds: clamp(C.rounds | 0 || 3, 1, 12), len: clamp(+C.len || 120, 30, 300), spar: !!C.spar, mode: NET_MODES.some(M => M.id === C.mode) ? C.mode : 'std', weap: !!C.weap };   // issue 52: the host's weapon rule
  ROUNDS = netRounds(NET.cfg); ROUND_LEN = NET.cfg.len;
  if (G.loc !== NET.cfg.loc) { G.loc = NET.cfg.loc; try { setLocation(G.loc); } catch (e) { console.error(e); } }
  for (const F of [P1, P2]) F.sparGear(NET.cfg.spar);
}
async function netCopy() {
  const b = $('net-copy');
  try { await navigator.clipboard.writeText(NET.link); b.textContent = 'Скопировано'; }
  catch (e) {
    const rg = document.createRange(); rg.selectNodeContents($('net-link'));
    const s = getSelection(); s.removeAllRanges(); s.addRange(rg); b.textContent = 'Выдели ссылку';
  }
  setTimeout(() => { b.textContent = 'Копировать'; }, 1600);
}
async function netShare() {
  if (navigator.share) { try { await navigator.share({ title: 'Бой с другом', text: 'Бой 1 на 1', url: NET.link }); } catch (e) {} }
  else netCopy();
}

/* ── PeerJS is loaded only when the player opens «Бой с другом» ── */
function netLoadPeer() {
  if (window.Peer) return Promise.resolve();
  if (NET.loading) return NET.loading;
  NET.loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = NET_PEER_URL;
    s.onload = () => window.Peer ? res() : rej(new Error('PeerJS'));
    s.onerror = () => rej(new Error('PeerJS'));
    document.head.appendChild(s);
  });
  return NET.loading;
}
async function netCreate() {
  if (NET.role) return;
  netSt('Загружаем PeerJS…');
  try { await netLoadPeer(); } catch (e) { NET.loading = null; return netSt('Не удалось загрузить PeerJS. Нужен интернет.', true); }
  NET.role = 'host'; NET.host = true; NET.guest = false;
  NET.code = netCode(); NET.saved = null;
  uiShow('net'); netRoomUI(NET.code); netSt('Создаём комнату…');
  const peer = new Peer('bk-' + NET.code, { config: NET_ICE, debug: 0 });
  NET.peer = peer;
  peer.on('open', () => netSt('Комната открыта. Ждём соперника…'));
  peer.on('connection', c => netHostConn(c));
  peer.on('error', e => netErr(e));
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) {} });
}
async function netJoin(code) {
  if (NET.role) return;
  code = String(code || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
  uiShow('net');
  if (code.length !== 6) return netSt('Нужен код из 6 символов', true);
  netSt('Загружаем PeerJS…');
  try { await netLoadPeer(); } catch (e) { NET.loading = null; return netSt('Не удалось загрузить PeerJS. Нужен интернет.', true); }
  NET.role = 'guest'; NET.host = false; NET.guest = true; NET.code = code;
  netRoomUI(code); netSt('Подключаемся к комнате ' + code + '…');
  const peer = new Peer({ config: NET_ICE, debug: 0 });
  NET.peer = peer;
  peer.on('open', () => netBind(peer.connect('bk-' + code, { serialization: 'json' })));
  peer.on('error', e => netErr(e));
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) {} });
}
function netHostConn(c) {
  if (NET.conn && NET.conn.open && NET.conn !== c) { try { c.close(); } catch (_) {} return; }
  netBind(c);
}
function netBind(c) {
  c.on('data', m => netMsg(m));
  c.on('open', () => netOpen(c));
  c.on('close', () => netLost(c));
  c.on('error', e => netErr(e));
  if (c.open) netOpen(c);   // an incoming connection may already be open when peer.on('connection') fires
}
function netOpen(c) {
  if (NET.conn && NET.conn !== c && NET.conn.open) { try { c.close(); } catch (_) {} return; }
  NET.conn = c; NET.closing = false; NET.dropT = 0; NET.silent = 0; clearTimeout(NET.retryT);
  show('net-drop', false);
  if (!NET.started) netBeginMatch(); else netSt('Соперник вернулся');
  netSend(NET.host ? { c: 'hello', look: LOOK, nm: myName(), cfg: NET.cfg } : { c: 'hello', look: LOOK, nm: myName() });
}
function netErr(e) {
  const t = (e && (e.type || e.message)) || '';
  const txt = NET_ERR[t] || ('Ошибка связи: ' + (t || 'неизвестно'));
  if (t === 'unavailable-id' || t === 'peer-unavailable') { netClose(); netSt(txt, true); return; }
  netSt(txt, true);
  if (NET.started) msg(txt, 'tip');
}

/* ── starting a match ── */
function netBeginMatch() {
  if (NET.started) return;
  NET.started = true;
  NET.saved = { loc: G.loc, cine: OPT.cine, rounds: ROUNDS, len: ROUND_LEN, diff: G.diff, mode: G.mode };
  G.mode = 'net'; G.diff = 'normal'; OPT.cine = false;
  const C = NET.host ? NET.cfg : { loc: 'gym', rounds: 3, len: 120, spar: false };   // the guest's real settings come with the host's hello
  ROUNDS = netRounds(C); ROUND_LEN = C.len; G.loc = C.loc;
  try { setLocation(G.loc); } catch (e) {}
  uiShow(null); show('net-drop', false); $('net-ping').hidden = false; $('net-ping').textContent = '… мс';
  camCut = true;
  if (NET.host) netHostStart(); else netGuestSetup();
}
function netHostStart() {
  showP2(true);
  rollOpponent();   // a stand-in until the guest's hello arrives with his own look
  if (NET.oLook) try { P2.applyLook(NET.oLook); } catch (e) {}   // a rematch: rollOpponent just re-dressed the guest's man as a random one
  for (const F of [P1, P2]) F.sparGear(NET.cfg.spar);
  startFight(true);
  NET.evI = REC.events.length; NET.pop.length = 0; NET.q.length = 0; NET.acc = 0; NET.pingAcc = 0; NET.first = true;
  netLabels();
}
function netGuestSetup() {
  showP2(true);
  // issue 49: here the local player's man is P2 (left on the mirrored camera); hello sends LOOK,
  // so dress him in that same look instead of the random opponent left over from the menu boot
  P2.applyLook(LOOK);
  if (NET.oLook) try { P1.applyLook(NET.oLook); } catch (e) {}
  for (const F of [P1, P2]) F.sparGear(NET.cfg.spar);
  P1.stat = PROF.stats; P2.stat = lvlStats(1); P1.speed = 1.5; P2.speed = DIFFS.normal.speed;
  P1.resetState(); P2.resetState();
  P1.place(-D_SEP / 2, Math.PI / 2, false); P2.place(D_SEP / 2, -Math.PI / 2, true);
  FX.clearAir(); FX.clearFloor(); REC.frames.length = 0; REC.events.length = 0; wearReset();
  Q.length = 0; HELD.clear(); MV.kx = MV.ky = MV.sx = MV.sy = 0;
  ARENA.position.set(0, 0, 0); ARENA.rotation.y = 0;
  G.paused = false; G.slow = 1; G.slowT = 0; G.hitstop = 0; G.shake = 0; G.t = 0;
  G.state = 'intro'; G.introT = 0; G.stareT = 0; G.stare = 0; G.rend = null; RP.hl = false;
  G.round = 1; G.roundT = ROUND_LEN; G.hudTxt = '';
  NET.snaps.length = 0; NET.evs.length = 0; NET.pops.length = 0; NET.first = true; NET.playT = 0;
  NET.mv = { x: 0, y: 0, b: false }; NET.blk = false; NET.q.length = 0; NET.iq.length = 0;
  NET.acc = 0; NET.pingAcc = 0;
  uiShow(null);
  show('hud', true); show('pad', TOUCH); show('vs', false); show('result', false); show('rec', false);
  show('bar-t', false); show('bar-b', false); show('net-drop', false); show('loading', false);
  $('net-ping').hidden = false;
  camCut = true; msg('Готовься');
  netLabels();
}
function netLabels() {
  $('n1').textContent = 'ТЫ'; $('n2').textContent = 'СОПЕРНИК';
  $('w1').textContent = NET.host ? 'хост' : 'гость';
  $('w2').textContent = NET.host ? 'гость' : 'хост';
  $('st2').textContent = '';
  $('r-again').textContent = 'Реванш';
  $('r-replay').hidden = true;
}

/* ── guest input → host ── */
function netMove() { NET.mv = { x: MV.kx || MV.sx, y: MV.ky || MV.sy, b: !!NET.blk }; }
function netBlock(v) {
  NET.blk = !!v; netMove();
  netSend({ c: 'in', x: NET.mv.x, y: NET.mv.y, b: NET.blk, q: [] });
}
function netSendPress(t, n, body, pow) {
  NET.iq.push({ t, n, body: !!body, pow: !!pow });
  netMove();
  netSend({ c: 'in', x: NET.mv.x, y: NET.mv.y, b: NET.blk, q: NET.iq.splice(0) });
}
function netFlushInput() {
  netMove();
  netSend({ c: 'in', x: NET.mv.x, y: NET.mv.y, b: NET.blk, q: NET.iq.splice(0) });
}
function netInput(m) {
  if (!NET.host) return;
  if (m.x !== undefined) NET.mv = { x: clamp(m.x, -1, 1), y: clamp(m.y, -1, 1), b: !!m.b };
  if (m.q) for (const p of m.q) if (NET.q.length < 6) NET.q.push({ t: p.t, n: p.n, body: !!p.body, pow: !!p.pow, at: G.real });
}
function netHostAI(dt) {   // called from ai(dt) instead of the AI (08_ai_flow.js)
  if (pvp('iron')) { P1.stamina = Math.max(P1.stamina, 100); P2.stamina = Math.max(P2.stamina, 100); }   // «Железные лёгкие»
  const me = P2, m = NET.mv;
  me.moveDir = m.x; me.moveLat = -m.y;   // mirrored camera: the guest's right is toward the opponent, up circles the other way
  me.blocking = !!m.b && G.state === 'fight';
  AI.lat = 0;   // the AI's own circling must not fight the guest's stick
  while (NET.q.length) {
    const q = NET.q[0];
    if (G.real - q.at > 0.4) { NET.q.shift(); continue; }
    if (!(me.canAct() || me.canChain(q.t === 'punch' ? q.n : null))) break;
    NET.q.shift();
    if (q.t === 'punch') { me.wantBody = q.body; me.powerNext = q.pow; me.startPunch(q.n); }
    else me.startDodge(q.n);
  }
}

/* ── host snapshots ── */
function netEv(e) {
  if (e.wear) return null;   // knocked-off hats / cracked glasses stay host-side in this version
  const o = { t: r3(e.t), w: e.who | 0, b: e.blocked ? 1 : 0, p: r3(e.power || 0) };
  if (e.pos) o.s = [r3(e.pos.x), r3(e.pos.y), r3(e.pos.z)]; else o.s = [0, 0, 0];
  if (e.dir) o.d = [r3(e.dir.x), r3(e.dir.y), r3(e.dir.z)]; else o.d = [0, 0, 1];
  if (e.mist) o.m = r3(e.mist);
  if (e.knux) o.k = 1;   // issue 52: the guest plays the metallic ring too
  return o;
}
function netCapturePopup(pos, text, cls) {
  if (!NET.started) return;
  NET.pop.push({ t: r3(G.t), p: [r3(pos.x), r3(pos.y), r3(pos.z)], s: String(text), c: cls });
  if (NET.pop.length > 32) NET.pop.shift();
}
// bone quaternions go as Int16 (×32767) in base64 — ~2.5× smaller than r3 JSON numbers; the tail (hip position, lids, face weights) stays r3
function netPack(a, n4) {
  const q = NET.q16 || (NET.q16 = new Int16Array(n4));
  for (let i = 0; i < n4; i++) q[i] = Math.round(clamp(a[i], -1, 1) * 32767);
  const u = new Uint8Array(q.buffer, 0, n4 * 2); let s = '';
  for (let i = 0; i < u.length; i += 4096) s += String.fromCharCode.apply(null, u.subarray(i, i + 4096));
  return [btoa(s), Array.from(a.subarray(n4), r3)];
}
function netUnpack(p) {
  if (!Array.isArray(p) || typeof p[0] !== 'string') return Float32Array.from(p);   // old peer: plain numbers
  const b = atob(p[0]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  const q = new Int16Array(u.buffer), out = new Float32Array(q.length + p[1].length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] / 32767;
  out.set(p[1], q.length); return out;
}
function netSnapshot() {
  // don't queue snapshots behind a congested link (that is what made the ping climb to hundreds of ms): skip this one,
  // the guest interpolates over the gap; events / popups stay pending and ride the next snapshot
  const dc = NET.conn && NET.conn.dataChannel;
  if (dc && dc.bufferedAmount > 12000) { NET.stat.skip = (NET.stat.skip || 0) + 1; return; }
  const f = NET.tmp || (NET.tmp = { d: [new Float32Array(REC.N), new Float32Array(REC.N)] });
  P1.capture(f.d[0]); P2.capture(f.d[1]);
  const m = {
    c: 's', t: r3(NET.clk), gt: r3(G.t), st: G.state,   // own clock: G.t stands still in a replay, the guest's playback must not
    d: [netPack(f.d[0], 4 * P1.allBones.length), netPack(f.d[1], 4 * P2.allBones.length)],
    gx: [r3(P1.group.position.x), r3(P2.group.position.x)],
    ar: [r3(ARENA.position.x), r3(ARENA.position.z), r3(ARENA.rotation.y)],
    r: ROPES.map(R => [r3(R.cur.x), r3(R.cur.y), r3(R.cur.z), r3(R.s)]).flat(),
    h: [r3(P1.hp), r3(P2.hp)], e: [r3(P1.stamina), r3(P2.stamina)],
    rd: G.round, rt: r3(G.roundT), ev: [], p: NET.pop.map(p => Object.assign({}, p, { t: r3(NET.clk) })),
  };
  NET.pop.length = 0;
  for (let i = NET.evI; i < REC.events.length; i++) { const e = netEv(REC.events[i]); if (e) { e.t = r3(NET.clk); m.ev.push(e); } }
  NET.evI = REC.events.length;
  netSend(m);
}
function netOnSnapshot(m) {
  NET.stat.recv++;
  m.d[0] = netUnpack(m.d[0]); m.d[1] = netUnpack(m.d[1]);
  NET.snaps.push(m); if (NET.snaps.length > 90) NET.snaps.shift();
  for (const e of m.ev) NET.evs.push(e);
  for (const p of m.p) NET.pops.push(p);
  if (NET.first) { NET.first = false; NET.playT = m.t - NET.buf; }
  netApplyState(m);
}
function netApplyState(m) {
  const prev = G.state;
  G.t = m.gt != null ? m.gt : m.t; G.round = m.rd; G.roundT = m.rt;
  P1.hp = m.h[0]; P2.hp = m.h[1]; P1.stamina = m.e[0]; P2.stamina = m.e[1];
  if (m.st !== 'result' || NET.over) G.state = m.st;
  // captions / bells / crowd follow the host's state, exactly like the events in a replay
  if (m.st !== prev) {
    if (m.st === 'intro') msg('Готовься');
    else if (m.st === 'fight') { msg('Раунд ' + G.round); roundSnd(); show('pad', true); EVT.emit('round'); }
    else if (m.st === 'break') msg('Перерыв');
    else if (m.st === 'ko') msg('Нокаут', 'ko');
    if (m.st === 'replay') { $('rec').hidden = false; $('skip').hidden = true; $('bar-t').hidden = $('bar-b').hidden = false; }   // the host's replay, streamed
    else if (prev === 'replay') { $('rec').hidden = true; $('skip').hidden = false; $('bar-t').hidden = $('bar-b').hidden = true; }
  }
}

/* ── guest playback (a thin replay client) ── */
function netGuestStep(dtReal) {
  if (NET.over || !NET.started) return 0;
  const S = NET.snaps;
  if (S.length < 2) return 0;
  const last = S[S.length - 1], prev = NET.playT;
  NET.playT += dtReal * (NET.playT < last.t - 0.24 ? 1.12 : NET.playT > last.t - 0.06 ? 0.88 : 1);
  NET.playT = clamp(NET.playT, S[0].t, Math.max(S[0].t, last.t - 0.06));
  let i = 0; while (i < S.length - 2 && S[i + 1].t <= NET.playT) i++;
  const a = S[i], b = S[i + 1] || a;
  const k = clamp((NET.playT - a.t) / Math.max(1e-5, b.t - a.t), 0, 1), sdt = Math.max(0, NET.playT - prev);
  if (a.gx && b.gx) {
    P1.group.position.x = lerp(a.gx[0], b.gx[0], k); P2.group.position.x = lerp(a.gx[1], b.gx[1], k);
    P1.group.updateMatrixWorld(true); P2.group.updateMatrixWorld(true);
  }
  P1.restore(a.d[0], b.d[0], k); P2.restore(a.d[1], b.d[1], k);
  P1.afterPose(sdt); P2.afterPose(sdt);
  if (a.ar && b.ar) { ARENA.position.set(lerp(a.ar[0], b.ar[0], k), 0, lerp(a.ar[1], b.ar[1], k)); ARENA.rotation.y = lerp(a.ar[2], b.ar[2], k); }
  if (a.r && b.r) ROPES.forEach((R, j) => { const o = j * 4; R.hit = (R.hit || new V3()).set(lerp(a.r[o], b.r[o], k), lerp(a.r[o + 1], b.r[o + 1], k), lerp(a.r[o + 2], b.r[o + 2], k)); R.s = lerp(a.r[o + 3], b.r[o + 3], k); });
  while (NET.evs.length && NET.evs[0].t <= NET.playT) netPlayEvent(NET.evs.shift());
  while (NET.pops.length && NET.pops[0].t <= NET.playT) { const p = NET.pops.shift(); popup(new V3(p.p[0], p.p[1], p.p[2]), p.s, p.c); }
  if (i > 1) S.splice(0, i - 1);
  return sdt;
}
function netPlayEvent(e) {
  const pos = new V3(e.s[0], e.s[1], e.s[2]), dir = new V3(e.d[0], e.d[1], e.d[2]);
  FX.spawn(pos, dir, e.b ? e.p * 0.4 : e.p);
  if (e.m) FX.mist(pos, dir, e.p, e.m);
  if (e.b) sfx.block(clamp(e.p * 2, 0.3, 1.4)); else sfx.thud(e.p * 0.7);
  if (e.k) sfx.knux(e.p * 0.7, !!e.b);
  G.shake = Math.max(G.shake, 0.01 + 0.02 * e.p);
  EVT.emit('hit', { pos, power: e.p, blocked: !!e.b });
  const hb = $(e.w ? 'hpb2' : 'hpb1'); if (hb) { hb.classList.remove('hit'); void hb.offsetWidth; hb.classList.add('hit'); }
}
/* the guest's camera sits at −z: screen-right is world −x, so P2 (the guest's own man) is on the left */
function netGuestCam(dt, cp, cl) {
  const far = VW / VH < 1.45 ? 5.0 : 4.5;
  const mx = (P1.headNow.x + P2.headNow.x) * 0.5, sep = Math.abs(P1.headNow.x - P2.headNow.x), hurt = Math.max(P1.daze || 0, P2.daze || 0);
  const z = far + 0.2 - clamp((1.0 - sep) * 0.6, 0, 0.35) - 0.2 * hurt + Math.max(0, sep - 1.0) * 1.1, drift = 0.18 * Math.sin(camClock * 0.13);
  cp.set(mx + drift, 1.12 + 0.04 * Math.sin(camClock * 0.21), -z); cl.set(mx + drift * 0.3, 0.93, 0);
  if (camCut) { camP.copy(cp); camL.copy(cl); camCut = false; }
  else { const a = 1 - Math.exp(-dt * 3.5); camP.lerp(cp, a); camL.lerp(cl, a); }
  camera.position.copy(camP); if (!OPT.shake) G.shake = 0;
  if (G.shake > 0.0005 && dt > 0) { camera.position.x += (rr() - 0.5) * G.shake; camera.position.y += (rr() - 0.5) * G.shake; G.shake *= Math.exp(-dt * 9); }
  camera.lookAt(camL);
}

/* ── messages, ping, result, rematch ── */
function netMsg(m) {
  if (!m || !m.c) return;
  NET.silent = 0;   // any inbound traffic proves the link is alive (issue 49 watchdog)
  if (m.c === 'hello') {
    NET.oLook = m.look;   // kept for rematches
    if (NET.guest && m.cfg) netCfgApply(m.cfg);
    try { if (NET.host) P2.applyLook(m.look); else P1.applyLook(m.look); } catch (e) {}
    NET.nm = m.nm || '';
  } else if (m.c === 'in') netInput(m);
  else if (m.c === 's') { if (NET.guest) netOnSnapshot(m); }
  else if (m.c === 'ping') netSend({ c: 'pong', t: m.t });
  else if (m.c === 'pong') netPing(performance.now() - m.t);
  else if (m.c === 'over') { if (NET.guest) netGuestOver(m); }
  else if (m.c === 'again') netRestart();
}
function netPing(rtt) {
  NET.ping = Math.round(NET.ping ? NET.ping * 0.6 + rtt * 0.4 : rtt);   // smoothed: one late pong doesn't flash a spike
  const el = $('net-ping'); el.hidden = false; el.textContent = 'пинг ' + NET.ping + ' мс';
  el.classList.toggle('bad', NET.ping > 200);
}
function netShowResult(win, draw) {
  show('rec', false); show('bar-t', false); show('bar-b', false); show('hud', false); show('pad', false);
  show('result', true); show('net-drop', false);
  $('r-car').textContent = ''; $('r-stats').innerHTML = '';
  try { payShow(null); } catch (e) {}
  $('r-replay').hidden = true; $('r-again').textContent = 'Реванш';
  $('r-title').textContent = draw ? 'Ничья' : win ? 'Победа' : 'Нокаут';
  $('r-title').className = 'rt ' + (draw ? '' : win ? 'win' : 'lose');
  $('r-sub').textContent = draw ? 'решение судей' : win ? 'соперник на полу' : 'ты на полу';
}
function netResult() {   // host: startReplay() is diverted here (07_state_replay_hits.js)
  if (NET.over && NET.over.sent) return;
  const o = NET.over || { win: G.winner === P1, draw: false, how: 'dec' };
  o.sent = true; NET.over = o; G.state = 'result'; G.paused = false;
  netShowResult(!!o.win, !!o.draw);
  netSend({ c: 'over', w: o.win ? 1 : 0, d: o.draw ? 1 : 0 });
}
function netGuestOver(m) {
  NET.over = { win: !m.w, draw: !!m.d, how: 'dec' };   // the guest's man is P2: invert the host's result
  G.state = 'result'; G.paused = false;
  netShowResult(!m.w, !!m.d);
}
function netRematch() {
  if (!NET.role || !NET.over) return;
  netSend({ c: 'again' }); netRestart();
}
function netRestart() {
  NET.over = null; show('result', false);
  NET.snaps.length = 0; NET.evs.length = 0; NET.pops.length = 0; NET.pop.length = 0;
  NET.first = true; NET.playT = 0; NET.q.length = 0; NET.iq.length = 0; NET.acc = 0; NET.evI = 0;
  NET.mv = { x: 0, y: 0, b: false }; NET.blk = false;
  if (NET.host) netHostStart(); else netGuestSetup();
  $('net-ping').hidden = false;
}

/* ── disconnect: ten seconds to recover, then a win to the man left standing ── */
function netTick(dt) {
  if (NET.dropT > 0) {
    NET.dropT -= dt;
    $('net-drop-t').textContent = 'Ждём восстановления… ' + Math.max(0, Math.ceil(NET.dropT)) + ' с';
    if (NET.dropT <= 0) return netWinByDrop();
  }
  if (!NET.conn || !NET.conn.open || !NET.started) return;
  NET.silent += Math.min(dt, 0.25);   // cap one stalled frame so a slow render cannot look like a dropout
  NET.pingAcc += dt;
  if (NET.pingAcc >= 1) { NET.pingAcc = 0; netSend({ c: 'ping', t: performance.now() }); }
  if (NET.over && (NET.guest || NET.over.sent)) return;   // the host's NET.over is set at the KO (fightOver): keep streaming through the replay until netResult
  // a lost link does not always raise PeerJS's remote 'close' (crashed tab, dead NAT mapping):
  // if nothing has arrived for silenceMax seconds, open the 10 s recovery window on our own
  if (NET.dropT === 0 && NET.silent > NET.silenceMax) return netLost(NET.conn);
  NET.acc += dt; NET.clk = (NET.clk || 0) + dt;
  if (NET.acc >= NET.rate) { NET.acc = 0; if (NET.host) netSnapshot(); else netFlushInput(); }
}
function netLost(c) {
  NET.stat.closes++;
  if (NET.closing || NET.over) return;
  if (NET.conn && NET.conn !== c && NET.conn.open) return;
  if (NET.conn === c) NET.conn = null;
  if (!NET.role) return;
  $('net-drop-t').textContent = 'Ждём восстановления… 10 с'; show('net-drop', true);
  NET.dropT = 10;
  if (NET.guest) netRetry();   // a new DataConnection to the same room id; the host keeps listening
}
function netRetry() {
  clearTimeout(NET.retryT);
  if (!NET.guest || !NET.peer || NET.peer.destroyed || NET.dropT <= 0 || NET.over || NET.closing || (NET.conn && NET.conn.open)) return;
  try { netBind(NET.peer.connect('bk-' + NET.code, { serialization: 'json' })); } catch (e) {}
  NET.retryT = setTimeout(netRetry, 1500);
}
function netWinByDrop() {
  NET.dropT = 0; show('net-drop', false); clearTimeout(NET.retryT);
  const started = NET.started;
  if (started) { G.wins++; try { save(); } catch (e) {} }
  netClose(); toMenu();
  msg(started ? 'Победа — соперник отключился' : 'Соперник отключился', 'tip');
}
function netClose() {
  const had = !!NET.role;
  clearTimeout(NET.retryT);
  NET.role = null; NET.host = false; NET.guest = false; NET.started = false; NET.oLook = null; NET.over = null;
  NET.conn = null; NET.dropT = 0; NET.closing = true; NET.roomShown = false;
  show('net-drop', false); $('net-ping').hidden = true; $('net-ping').textContent = '';
  if (NET.saved) {
    G.loc = NET.saved.loc; OPT.cine = NET.saved.cine; ROUNDS = NET.saved.rounds; ROUND_LEN = NET.saved.len || 120; NET.cfg.spar = false; NET.cfg.weap = false; G.diff = NET.saved.diff; G.mode = NET.saved.mode;
    NET.saved = null; try { setLocation(G.loc); } catch (e) {}
  }
  try { if (NET.peer && !NET.peer.destroyed) NET.peer.destroy(); } catch (e) {}
  NET.peer = null; NET.loading = null;
  NET.snaps.length = 0; NET.evs.length = 0; NET.pops.length = 0; NET.pop.length = 0; NET.q.length = 0; NET.iq.length = 0;
  NET.first = true; NET.evI = 0; NET.acc = 0; NET.pingAcc = 0;
  $('n1').textContent = myName(); $('st2').textContent = '';
  if (had) netHome();
  setTimeout(() => { NET.closing = false; }, 0);
}
