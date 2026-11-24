/* ───────── issue 49: shared P2P state, declared in one ES module scope ─────────
   This lives in an early NN_ file on purpose: 12_ui.js calls setMove() → idle() at module-evaluation time, and that
   reads NET.guest. A const declared in 18_net.js (the last file) would still be in its temporal dead zone there.
   All the behaviour (hoisted functions) stays in 18_net.js. */
const NET = {
  role: null, host: false, guest: false, started: false, closing: false,
  peer: null, conn: null, loading: null, code: '', link: '', nm: '',
  saved: null, over: null,
  cfg: { loc: 'gym', rounds: 3, len: 120, spar: false, mode: 'std', weap: false },   // the host's match settings (room screen), sent in hello; weap = «Оружие» (issue 52)
  rate: 1 / 30, buf: 0.10, acc: 0, pingAcc: 0, ping: 0, silent: 0, silenceMax: 1.5,
  snaps: [], evs: [], pops: [], playT: 0, first: true,
  mv: { x: 0, y: 0, b: false }, blk: false, q: [], iq: [], evI: 0, pop: [],
  dropT: 0, retryT: null, roomShown: false,
  oAway: false, awayI: 0,   // R-26: the opponent's tab is hidden (banner #net-away); our keep-alive timer while ours is
  stat: { snaps: 0, recv: 0, bytes: 0, max: 0, ins: 0, closes: 0 },
  tmp: null,
  // R-25: the guest predicts his own man. seq = number of the last press / block change sent; on the host ack = the last one it
  // consumed, hs = the last one it started (both go back in every snapshot, `k`); now = this page's clock (sum of frame dt),
  // off / jit = the host's clock against ours and how much the arrivals wander (→ the adaptive buffer `buf`);
  // lag / lagQ = debug: every inbound message is held for `lag` seconds (__mp.lag(ms))
  seq: 0, ack: 0, hs: 0, bAck: 0, now: 0, off: 0, jit: 0, lag: 0, lagQ: [],
  pr: { q: [], ok: [], on: false, conf: false, w: 0, curS: 0, maxS: 0, maxAt: -9, last: null, run: false, L: null, S: null, off: false,
    stat: { n: 0, back: 0, late: 0 } },
};
const NET_PR = { up: 0.05, down: 0.08, hold: 0.65, lost: 1.5, bufMin: 0.06, bufMax: 0.16 };   // R-25: blend in / roll back (s), a press waits this long for its turn, an unanswered one is forgotten; buffer limits (s)
const NET_PEER_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const NET_ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
] };   // public STUN only; a TURN relay would need a server (known limitation)
const NET_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no O/0/I/1: a code read aloud over the phone
const NET_ERR = {
  'peer-unavailable': 'Комната не найдена. Проверь код и попроси друга открыть комнату.',
  'unavailable-id': 'Этот код уже занят. Создай комнату заново.',
  'network': 'Нет связи с сервером PeerJS.', 'server-error': 'Сервер PeerJS недоступен.',
  'socket-error': 'Соединение с сервером прервано.', 'webrtc': 'Не удалось пробить P2P-соединение (строгий NAT).',
};

/* P2P-only match modes (the host picks one in the room, 18_net.js); every check goes through these two */
const NET_MODES = [
  { id: 'std', label: 'Обычный', tip: 'Как в быстром бою' },
  { id: 'blood', label: 'Кровавая бойня', tip: 'Рассечения на каждом шагу, всё в крови, врач бой не останавливает, урон ×1.25' },
  { id: 'kd1', label: 'Первый нокдаун', tip: 'Кто первым упал — тот проиграл' },
  { id: 'glass', label: 'Стеклянные челюсти', tip: 'Урон ×2.2: пара чистых — и спать' },
  { id: 'iron', label: 'Железные лёгкие', tip: 'Выносливость не кончается: рубка без остановки' },
  { id: 'ko', label: 'До нокаута', tip: 'Раунды без конца, судей нет — только нокаут' },
];
function pvp(m) { return G.mode === 'net' && NET.cfg.mode === m; }
function sparOn() { return G.mode === 'spar' || (G.mode === 'net' && NET.cfg.spar); }   // 16 oz gloves + headgear: less damage, no cuts
// issue 52: weapons (brass knuckles) are allowed everywhere except a P2P bout whose host forbade them
function weaponOn() { return !(G.mode === 'net' && !NET.cfg.weap); }
