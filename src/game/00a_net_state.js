/* ───────── issue 49: shared P2P state, declared in one ES module scope ─────────
   This lives in an early NN_ file on purpose: 12_ui.js calls setMove() → idle() at module-evaluation time, and that
   reads NET.guest. A const declared in 18_net.js (the last file) would still be in its temporal dead zone there.
   All the behaviour (hoisted functions) stays in 18_net.js. */
const NET = {
  role: null, host: false, guest: false, started: false, closing: false,
  peer: null, conn: null, loading: null, code: '', link: '', nm: '',
  saved: null, over: null,
  cfg: { loc: 'gym', rounds: 3, len: 120, spar: false, mode: 'std', weap: false },   // the host's match settings (room screen), sent in hello; weap = knuckle dusters allowed
  rate: 1 / 30, buf: 0.10, acc: 0, pingAcc: 0, ping: 0, silent: 0, silenceMax: 1.5,
  snaps: [], evs: [], pops: [], playT: 0, first: true,
  mv: { x: 0, y: 0, b: false }, blk: false, q: [], iq: [], evI: 0, pop: [],
  dropT: 0, retryT: null, roomShown: false,
  stat: { snaps: 0, recv: 0, bytes: 0, max: 0, ins: 0, closes: 0 },
  tmp: null,
};
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
