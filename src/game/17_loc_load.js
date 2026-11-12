/* ───────── Stage 2 (#47), discussion: fast, hitch-free location switching ─────────
   The complaint was that entering a fight / picking a new place froze for a moment. A location set is expensive to make
   (procedural geometry + many canvas textures) and used to be built on the very frame the player pressed «Бой». Here:
     1. the built set was already cached (13_locations.js); on low it is now capped at 2 resident sets (locTrim, LRU,
        eviction frees only the resources that the set owns — crowd geometry/materials/attributes are shared and kept);
     2. after the menu settles we prebuild in the background, one location per idle macrotask, the place of the NEXT
        fight (careerLoc() for a career, G.loc for a quick fight, the gym for sparring / the bag) and warm its shaders
        with renderer.compileAsync; hovering a place in the quick-fight list prebuilds that one on demand;
     3. a cold build that still has to happen shows «Готовим площадку…» instead of a silent frozen frame.
   Debug: window.__loc = { prefetch, kick, next, dispose, warm, busy, cold, report }; __perf.locReport() prints the table. */
const LOC_IDS = ['gym', 'parking', 'tires', 'yard', 'warehouse', 'boxgym', 'metro'];

/* instrument canvasTex once (a hoisted function declaration in boxer.html, → a mutable module binding). LOCPROF.active
   is true only while a set is being built, so outside a build this costs one boolean check. The numbers go into
   LOCPROF.last, which both setLocation() and __perf.locReport() expose. */
const _canvasTex0 = canvasTex;
canvasTex = function (w, h, draw) {
  if (!LOCPROF.active) return _canvasTex0(w, h, draw);
  const t = performance.now(), r = _canvasTex0(w, h, draw);
  LOCPROF.tex += performance.now() - t; LOCPROF.texN++; return r;
};

function locBusy(on) {
  const el = $('loc-busy'); if (!el) return;
  el.hidden = !on || !$('loading').hidden;   // never cover the boot loading screen
}
let locBusyT = 0;
function locBusyFlash() {   // one shared timer, so several cold builds in a row do not fight over the toast (13_locations.js)
  locBusy(true); clearTimeout(locBusyT); locBusyT = setTimeout(() => locBusy(false), 500);
}

/* GPU objects shared by EVERY location: the crowd figure (CROWD.geo + its attributes), the reduced index, the two
   crowd materials and their blob texture. Freeing any of them on an eviction would blank the other locations. */
function locShared() {
  const s = new Set([CROWD.mat, CROWD.blobMat, CROWD.geo, CROWD.lowIdx]);
  if (CROWD.geo) { if (CROWD.geo.index) s.add(CROWD.geo.index); for (const k in CROWD.geo.attributes) s.add(CROWD.geo.attributes[k]); }
  if (CROWD.blobMat && CROWD.blobMat.map) s.add(CROWD.blobMat.map);
  return s;
}
/* Free ONE built set: detach its group, remove its scene-level lights / puffs, and dispose what it owns. three's
   geometry.dispose() removes the GL buffer of EACH attribute — a crowd geometry borrows its attributes from
   CROWD.geo, so any geometry that references a shared attribute is deliberately left alone (small CPU leak, no
   broken crowds). Owned canvas textures are found on the owned materials and in their ShaderMaterial uniforms. */
function locDispose(L) {
  const g = L.group; if (!g) return;
  const shared = locShared(), own = new Set(), dead = new Set();
  const collect = o => {
    dead.add(o);
    const mats = !o.material ? [] : (Array.isArray(o.material) ? o.material : [o.material]);
    const geo = o.geometry;
    if (geo && !shared.has(geo) && !shared.has(geo.index) && !Object.values(geo.attributes).some(a => shared.has(a))) own.add(geo);
    for (const m of mats) {
      if (!m || shared.has(m)) continue;
      own.add(m);
      for (const v of Object.values(m)) {
        if (v && v.isCanvasTexture && !shared.has(v)) own.add(v);
        else if (v && typeof v === 'object' && !Array.isArray(v))   // ShaderMaterial.uniforms → { value: tex }
          for (const u of Object.values(v)) if (u && u.value && u.value.isCanvasTexture && !shared.has(u.value)) own.add(u.value);
      }
    }
  };
  try {
    ARENA.remove(g);
    g.traverse(collect);
    for (const w of L.world || []) { dead.add(w); w.traverse && w.traverse(collect); scene.remove(w); }
    for (const r of own) { try { r.dispose(); } catch (_) {} }
    CROWD.blobs = CROWD.blobs.filter(b => !dead.has(b));   // floor halos / breath puffs of this location
  } catch (e) { /* an eviction must never break the scene it is freeing */ }
  L.group = null;
}
/* low: keep the current set + one spare (≤ 2). Never evict the set the player is looking at. */
function locTrim() {
  if (GFX.level !== 'low' || LOCPROF.noTrim) return;
  const spare = Object.values(LOCS).filter(o => o.group && o !== LOC).sort((a, b) => (a.stamp || 0) - (b.stamp || 0));
  while (spare.length > 1) locDispose(spare.shift());
}

/* build a set in the background (without switching LOC): hide the group and its scene-level lights. */
function locBuildIdle(L) {
  if (L.group) return;
  const b0 = performance.now(); LOCPROF.tex = 0; LOCPROF.texN = 0; LOCPROF.active = true;
  let g; try { g = L.build(); } catch (e) { console.error('locPrefetch', L.id, e); return; } finally { LOCPROF.active = false; }
  L.group = g; ARENA.add(g); g.visible = false;
  for (const w of L.world || []) w.visible = false;
  LOCPROF.last = { id: L.id, build: +(performance.now() - b0).toFixed(1), tex: +LOCPROF.tex.toFixed(1), texN: LOCPROF.texN };
  locTrim();
}
/* warm the shader programs for a set's own light rig. compile() gathers lights from scene.traverseVisible but prepares
   materials from scene.traverse, so temporarily show only this location's lights (three r160). */
function locWarm(L) {
  if (!renderer.compileAsync) return;
  const saved = [];
  try {
    if (L) for (const o of Object.values(LOCS)) {
      if (o.group) { saved.push([o.group, o.group.visible]); o.group.visible = (o === L); }
      for (const w of o.world || []) { saved.push([w, w.visible]); w.visible = (o === L); }
    }
    const p = renderer.compileAsync(scene, camera);
    if (p && p.catch) p.catch(() => {});   // fire and forget (KHR_parallel_shader_compile keeps it off the frame where supported)
  } catch (_) {} finally { for (const [o, v] of saved) o.visible = v; }
}

/* ── idle scheduler: one job per macrotask, so a heavy build never shares a frame with menu input ── */
const LOCQ = []; let locIdleOn = false;
/* only start a job in an ≥ 8 ms idle window (a build() is atomic and cannot be paused mid-way, so the chunk is one
   location per idle macrotask); the timeout guarantees didTimeout so a busy menu never starves the queue. */
function locYield(fn) {
  if (!window.requestIdleCallback) { setTimeout(fn, 16); return; }
  requestIdleCallback(d => { if (d.timeRemaining() < 8 && !d.didTimeout) locYield(fn); else fn(); }, { timeout: 1200 });
}
function locPump() {
  locIdleOn = false;
  if (!LOCQ.length) return;
  const job = LOCQ.shift(); try { job(); } catch (e) { console.error('locJob', e); }
  if (LOCQ.length) { locIdleOn = true; locYield(locPump); }
}
function locQueue(job) { LOCQ.push(job); if (!locIdleOn) { locIdleOn = true; locYield(locPump); } }
function locNext() {
  try {
    if (G.mode === 'career') return careerLoc();
    if (G.mode === 'spar' || G.mode === 'bag') return 'boxgym';
    return G.loc || 'gym';                             // quick fight: the place picked / hovered in the list
  } catch (_) { return G.loc || 'gym'; }
}
function locPrefetchOne(id) { const L = LOCS[id]; if (L && !L.group) locQueue(() => locBuildIdle(L)); }
function locPrefetch() {
  LOCQ.length = 0;                                   // a re-entry into the menu supersedes the old queue
  const want = [], add = id => { if (LOCS[id] && !LOCS[id].group && !want.includes(id)) want.push(id); };
  let car = null; try { car = careerLoc(); } catch (_) {}
  add(car); add(locNext()); add(G.loc); add('boxgym');   // the career place, the last mode's place, the picked place, the gym
  const order = want.slice(0, GFX.level === 'low' ? 1 : 2);   // low holds current + one spare
  for (const id of order) locPrefetchOne(id);
  locQueue(() => locWarm(null));                    // the menu's own first frame
  locQueue(() => locWarm(LOCS[order[0] || locNext()]));   // the intro's first frame, with the next fight's lights
}
let locKickT = 0;
function locPrefetchKick() { clearTimeout(locKickT); locKickT = setTimeout(locPrefetch, 900); }   // after the menu settles

/* ── measurement: cold (build + first frame) vs warm (cached) entry, per location ── */
function locPrograms() { return renderer.info && renderer.info.programs ? renderer.info.programs.length : 0; }
function locReport(opts) {
  opts = opts || {};
  const ids = opts.locs || LOC_IDS, save = { loc: G.loc, state: G.state, hold: window.__camHold, place: sfx.place };
  sfx.place = () => {};                            // ambience / convolver is not part of the set's build cost
  LOCPROF.noTrim = true; G.state = 'fight'; window.__camHold = { p: [0, 1.15, 4.7], l: [0, 0.93, 0] };
  camUpdate(1 / 60);
  const p0 = locPrograms(), rows = [], warm = {};
  try {
    for (const id of ids) {
      const L = LOCS[id]; if (!L) continue;
      if (L.group) locDispose(L);                 // force a cold build even for an already cached / prefetched set
      const t0 = performance.now(); setLocation(id); const cold = performance.now() - t0;
      const f0 = performance.now(); renderFrame(); const first = performance.now() - f0;
      const b = LOCPROF.last || {};
      rows.push({ id, cold: +cold.toFixed(1), build: b.build || 0, tex: b.tex || 0, texN: b.texN || 0,
        first: +first.toFixed(1), progs: locPrograms() });
    }
    for (const id of ids) { const t = performance.now(); setLocation(id); warm[id] = +(performance.now() - t).toFixed(2); }
  } finally {
    sfx.place = save.place; LOCPROF.noTrim = false;
    G.state = save.state; window.__camHold = save.hold; setLocation(save.loc || 'gym'); locTrim();
  }
  for (const r of rows) r.warm = warm[r.id];
  const pad = (s, n) => String(s).padStart(n);
  const head = 'локация      вход(хол), мс  build, мс  canvas, мс (N)  1-й кадр, мс  повтор, мс  программ';
  const line = '───────────  ────────────  ─────────  ─────────────  ───────────  ─────────  ─────────';
  const table = [`шейдерных программ в начале: ${p0}`, head, line].concat(rows.map(r =>
    pad(r.id, 11) + '  ' + pad(r.cold, 12) + '  ' + pad(r.build, 9) + '  ' + pad(`${r.tex} (${r.texN})`, 14) + '  '
    + pad(r.first, 12) + '  ' + pad(r.warm, 10) + '  ' + pad(r.progs, 9))).join('\n');
  const csv = 'location,cold_ms,build_ms,canvas_tex_ms,canvas_tex_n,first_frame_ms,warm_entry_ms,programs\n'
    + rows.map(r => [r.id, r.cold, r.build, r.tex, r.texN, r.first, r.warm, r.progs].join(',')).join('\n');
  return { p0, rows, csv, table };
}
if (window.__perf) window.__perf.locReport = locReport;
Object.assign(window.__loc || (window.__loc = {}), { prefetch: locPrefetch, kick: locPrefetchKick, next: locNext,
  dispose: locDispose, warm: locWarm, busy: locBusy, report: locReport,
  cold: id => { const L = LOCS[id]; if (L && L.group) locDispose(L); setLocation(id); } });   // keep __loc.set/get/LOCS of dbg_extra.js
