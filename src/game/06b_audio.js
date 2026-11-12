/* ───────── recorded sound layer, issue #48 ─────────
   CC0 recordings live in one Opus sprite (assets/audio/sfx.ogg + sfx.json) and in
   three streaming music tracks.  Nothing here runs at startup: the sprite is fetched
   only on the first tap/keypress (the AudioContext cannot start earlier anyway) and
   the music is an <audio> element played through MediaElementSource, never decoded.

   Hybrid: a recorded hit is layered over a short synthesised sub-bass for weight,
   and everything goes into the existing bus / convolution reverb of 06_fx_sound.js.
   If a file is missing or fails to decode, every call falls back to the synthesis
   that was here before — the game is never silent.  */
const AUDIO = (() => {
  const URL = 'assets/audio/';
  const canOgg = (() => { try { return !!new Audio().canPlayType('audio/ogg; codecs=opus'); } catch (e) { return false; } })();
  const ext = canOgg ? '.ogg' : '.m4a';            // Safari gets the AAC twin
  let N = null, buf = null, man = null, rgn = {}, state = 'idle', lastPick = {};
  let wantAmb = 'gym', prevState = null;
  let musicEl = null, musicG = null, musicI = -1, musicStarted = false, musicWant = -1, armed = false;
  const loops = {};                                  // key -> { src, g, name }
  const AMBMAP = {                                  // real room tone under the synthesised bed
    gym: null, boxgym: null,                        // the crowd loop (sfx.crowd) is the hall
    yard: 'ambOutdoor', tires: 'ambWind', parking: 'ambIndoor',
    warehouse: 'ambWind', metro: 'ambIndoor',
  };
  const CREDITS = [
    ['Punch', 'qubodup', 'CC0', 'https://opengameart.org/content/punch'],
    ['37 hits/punches', 'Independent.nu (ljudbank)', 'CC0', 'https://opengameart.org/content/37-hitspunches'],
    ['Impact Sounds', 'Kenney', 'CC0', 'https://kenney.nl/assets/impact-sounds'],
    ['10 Impact/Shield Blocks', 'StarNinjas', 'CC0', 'https://opengameart.org/content/10-impactshield-blocks'],
    ['12 wet towel hitting/falling/punching floor sounds', 'qubodup', 'CC0', 'https://opengameart.org/content/12-wet-towel-hittingfallingpunching-floor-sounds'],
    ['Swishes Sound Pack', 'artisticdude', 'CC0', 'https://opengameart.org/content/swishes-sound-pack'],
    ['Air whoosh', 'pyranostudios', 'CC0', 'https://opengameart.org/content/air-whoosh'],
    ['Bell dings/chimes', 'PWL', 'CC0', 'https://opengameart.org/content/bell-dingschimes'],
    ['grunts of male death and pain', 'thebardofblasphemy', 'CC0', 'https://opengameart.org/content/grunts-male-death-and-pain'],
    ['Crowd Shouting/Speaking Ambience', 'StarNinjas', 'CC0', 'https://opengameart.org/content/crowd-shoutingspeaking-ambience'],
    ['OoOoOoOoOoOoOo', 'Nocturnal_Vanguard', 'CC0', 'https://opengameart.org/content/oooooooooooooo'],
    ['Applause in a large hall or church', 'eXpl0it3r', 'CC0', 'https://opengameart.org/content/applause-in-a-large-hall-or-church'],
    ['Park ambiences', 'Thimras', 'CC0', 'https://opengameart.org/content/park-ambiences'],
    ['Loopable Dungeon Ambience', 'JaggedStone', 'CC0', 'https://opengameart.org/content/loopable-dungeon-ambience'],
    ['windy ambient noise', 'Some Weirdo', 'CC0', 'https://opengameart.org/content/windy-ambient-noise'],
    ['Electric Rock', 'Pro Sensory', 'CC0', 'https://opengameart.org/content/electric-rock'],
    ['Clean Rock', 'Pro Sensory', 'CC0', 'https://opengameart.org/node/174329'],
    ['rocky musicloop', 'johndekale', 'CC0', 'https://opengameart.org/content/rocky-musicloop'],
  ];

  const decode = (ac, ab) => new Promise((ok, no) => {
    try { const p = ac.decodeAudioData(ab, ok, no); if (p && p.then) p.then(ok, no); } catch (e) { no(e); }
  });

  function load() {
    if (state !== 'idle') return;
    N = sfx._nodes(); if (!N.ac) return;
    state = 'loading';
    musicSetup();
    fetch(URL + 'sfx.json').then(r => { if (!r.ok) throw new Error('sfx.json ' + r.status); return r.json(); })
      .catch(() => ({ names: {}, music: ['rock1', 'rock2', 'rock3'] }))
      .then(j => {
        man = j; rgn = j.names || {};
        musicStart();                              // the playlist is known: streaming, not decoded
        return fetch(URL + 'sfx' + ext).then(r => { if (!r.ok) throw new Error('sprite ' + r.status); return r.arrayBuffer(); })
          .then(ab => decode(N.ac, ab));
      })
      .then(b => {
        buf = b; state = 'ready'; N = sfx._nodes();
        console.log('[audio] загружено: ' + ext + ', ' + Object.keys(rgn).length + ' звуков, ' +
                    Object.values(rgn).reduce((n, v) => n + v.length, 0) + ' вариантов, ' + b.duration.toFixed(1) + ' с');
        ambApply();                                // the location was chosen before the load finished
      })
      .catch(e => { state = 'failed'; console.warn('[audio] записи не загрузились, остаётся синтез:', e.message || e); });
  }

  /* one region of the sprite: random variation, ±5 % pitch, ±12 % level, no immediate repeat */
  function play(name, o = {}) {
    if (state !== 'ready' || !buf || !N.ac) return false;
    const list = rgn[name]; if (!list || !list.length) return false;
    let i = (Math.random() * list.length) | 0;
    if (list.length > 1 && i === lastPick[name]) i = (i + 1) % list.length;
    lastPick[name] = i;
    const r = list[i], a = N.ac, t = a.currentTime + (o.delay || 0);
    const src = a.createBufferSource(), g = a.createGain();
    src.buffer = buf;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.05;
    g.gain.value = (o.vol === undefined ? 1 : o.vol) * (0.88 + Math.random() * 0.24);
    src.connect(g).connect(o.dry ? N.master : N.bus);   // bus = the location's convolution reverb
    if (o.loop) { src.loop = true; src.loopStart = r.s; src.loopEnd = r.s + r.d; src.start(t, r.s); }
    else { src.start(t, r.s, r.d); src.stop(t + r.d + 0.02); }
    return { src, g, r };
  }

  /* a short sine drop under a recorded hit — the "weight" the small speakers lose */
  function sub(p, body) {
    if (!N || !N.ac) return;
    const t = N.ac.currentTime, o = N.ac.createOscillator(), g = N.ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(body ? 105 : 148, t);
    o.frequency.exponentialRampToValueAtTime(body ? 44 : 56, t + 0.18);
    N.env(g, t, 0.004, 0.2, 0.16 + 0.2 * clamp(p, 0, 1.5));
    o.connect(g).connect(N.bus); o.start(t); o.stop(t + 0.26);
  }

  /* a persistent looping bed: the crowd murmur or a location's room tone */
  function loopVoice(key, name, target) {
    if (state !== 'ready' || !rgn[name]) return false;
    const a = N.ac, t = a.currentTime;
    let L = loops[key];
    if (!L && target <= 0) return true;             // silence: don't even start a source
    if (L && L.name !== name) { fadeOut(L); L = null; }
    if (!L) {
      const v = play(name, { loop: true, vol: 1, dry: true });
      if (!v) return false;
      v.g.gain.value = 0;
      L = loops[key] = { src: v.src, g: v.g, name };
    }
    L.g.gain.setTargetAtTime(target, t, target <= 0 ? 0.3 : 0.7);
    return true;
  }
  function fadeOut(L) { if (!L || !N.ac) return; const t = N.ac.currentTime;
    L.g.gain.setTargetAtTime(0, t, 0.25);
    setTimeout(() => { try { L.src.stop(); } catch (e) {} try { L.g.disconnect(); } catch (e) {} }, 1400); }

  function ambApply() {
    if (state !== 'ready') return;
    const name = AMBMAP[wantAmb];
    if (!name) { if (loops.loc) { fadeOut(loops.loc); delete loops.loc; } return; }
    loopVoice('loc', name, 0.42);
  }

  /* ── streaming music: never decoded, one element reused for the whole playlist ── */
  function musicSetup() {
    if (musicEl || !N || !N.top) return;
    musicG = N.ac.createGain(); musicG.gain.value = 0; musicG.connect(N.top);
    musicEl = new Audio(); musicEl.preload = 'metadata';
    musicEl.addEventListener('ended', musicNext);
    musicEl.addEventListener('error', () => { if (musicEl) musicNext(); });
    try { N.ac.createMediaElementSource(musicEl).connect(musicG); } catch (e) { musicEl = null; return; }
  }
  function musicNext() {
    if (!musicEl || !man || !man.music || !man.music.length) return;
    musicI = (musicI + 1) % man.music.length;
    musicEl.src = URL + 'music/' + man.music[musicI] + ext;
    const p = musicEl.play(); if (p && p.catch) p.catch(() => {});
  }
  function musicStart() { musicSetup(); if (musicStarted || !musicEl || !man) return; musicStarted = true; musicNext(); }
  function musicTarget() {
    if (!musicG || !N.ac) return;
    const st = G.state; let k = 1;
    if (st === 'ko' || st === 'kd') k = 0;                       // fade out on a knockout
    else if (st === 'fight') k = OPT.musicFight ? 0.316 : 0;      // −10 dB or off during the fight
    else if (st === 'intro' || st === 'rend' || st === 'replay') k = 0.55;
    const v = OPT.musicVol * k;
    if (Math.abs(v - musicWant) < 0.002) return;      // tick() runs 60 Hz: don't pile up automation events
    musicWant = v;
    musicG.gain.setTargetAtTime(v, N.ac.currentTime, k === 0 ? 0.18 : 0.35);
  }

  function onUnlock() { load(); musicSetup(); musicStart(); musicTarget(); }
  function onPlace(id) { wantAmb = id; ambApply(); }

  /* ── wrap the synthesis: sample + sub, or the original synthesis as fallback ── */
  function hook(name, pick, keep) {
    const orig = sfx[name];
    sfx[name] = function (...a) {
      const o = pick(a); let ok = false;
      for (let k = 0; k < (o.rep || 1); k++)
        if (play(o.name, Object.assign({}, o, { delay: (o.delay || 0) + k * (o.gap || 0.3) }))) ok = true;
      if (ok && o.extra) play(o.extra, { vol: 0.6, delay: 0.07 });
      if (!ok && !keep) return orig.apply(sfx, a);
      if (keep) orig.apply(sfx, a);
      if (ok && o.sub !== undefined) sub(o.sub, o.body);
    };
  }
  hook('thud', a => ({ name: a[1] ? 'body' : (a[0] > 0.95 ? 'faceHeavy' : 'faceLight'),
                       vol: 0.75 + 0.35 * clamp(a[0], 0, 1.5), sub: a[0], body: !!a[1] }));
  hook('block', a => ({ name: 'block', vol: 0.5 + 0.25 * clamp(a[0], 0.2, 1.6) *
                        clamp(a[1] === undefined ? 1 : a[1], 1, 2), sub: a[0] * 0.55 }));
  hook('whoosh', a => ({ name: 'whoosh', vol: 0.65 * (a[0] === undefined ? 1 : a[0]), dry: true }));
  hook('fall', () => ({ name: 'fall', vol: 0.95, sub: 1.15 }));
  hook('exhale', () => ({ name: 'exhale', vol: 0.6, dry: true }));
  hook('bag', a => ({ name: 'body', vol: 0.6 + 0.28 * clamp(a[0], 0.2, 1.6), sub: a[0] }));
  hook('clink', a => ({ name: 'clink', vol: 0.5, delay: a[1] || 0 }));
  hook('bell', a => ({ name: 'bell', vol: 1.05, rep: a[0] || 1, gap: 0.3, dry: true }));
  hook('count', () => ({ name: 'count', vol: 0.85 }));
  hook('clap', () => ({ name: 'block', vol: 0.75 }));
  hook('koHit', () => ({ name: 'faceHeavy', vol: 0.85 }), true);   // its synthesised sub stays: a hybrid
  hook('ping', () => ({ name: 'count', vol: 0.35, dry: true }));
  hook('roar', a => ({ name: 'roar', vol: 0.9, extra: a[0] > 0.6 ? 'wave' : null }));

  const origCrowd = sfx.crowd;
  sfx.crowd = function (level) {
    if (loopVoice('crowd', 'crowd', 0.34 * clamp(level, 0, 1.5))) return;
    origCrowd.call(sfx, level);
  };
  sfx.applause = function (p = 1) { play('applause', { vol: 0.65 * clamp(p, 0, 1.5), dry: true }); };   // a bonus layer: no synthesis existed for applause

  const origUnlock = sfx.unlock, origPlace = sfx.place;
  sfx.unlock = function () { origUnlock.call(sfx); onUnlock(); };
  sfx.place = function (id) { origPlace.call(sfx, id); onPlace(id); };

  /* the first gesture anywhere in the game: an AudioContext may only start there */
  const arm = () => { if (armed) return; armed = true; sfx.unlock(); };
  window.addEventListener('pointerdown', arm, { once: true, passive: true });
  window.addEventListener('keydown', arm, { once: true, passive: true });

  /* ── debug: __sfx.play(name) / __sfx.play() lists every sound and its load state ── */
  sfx.play = name => {
    const keys = man ? Object.keys(man.names) : [];
    if (!name) {
      for (const k of keys) console.log('[audio]', k, (buf && rgn[k]) ? rgn[k].length + ' вариантов: загружен' : 'НЕ загружен — синтез');
      console.log('[audio] состояние:', state, ext, 'всего', keys.length, 'звуков');
      return keys;
    }
    const ok = !!play(name);
    console.log('[audio]', name, ok ? 'загружен, играет' : 'НЕ загружен — синтез');
    return ok;
  };
  sfx.audio = () => ({ state, ext, loaded: !!buf, seconds: buf ? +buf.duration.toFixed(2) : 0,
                       sounds: rgn, music: man ? man.music : [], track: musicI, credits: CREDITS });
  window.__sfx = sfx;

  return {
    get state() { return state; },
    credits: () => CREDITS,
    setVolumes() { sfx.vol(OPT.vol); sfx.sfxVol(OPT.sfxVol); musicTarget(); },
    tick() {
      musicTarget();
      if (G.state !== prevState) {
        if (prevState && (G.state === 'break' || G.state === 'result')) play('applause', { vol: 0.7, dry: true });
        prevState = G.state;
      }
    },
  };
})();
