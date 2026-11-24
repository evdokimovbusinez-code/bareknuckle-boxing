/* ───────── Stage 2 (#47) + R-24: hitch-free location switching ─────────
   A location set is expensive to make (procedural geometry, canvas textures, shader programs). #47 cached the built sets,
   prebuilt the next fight's place in idle and showed a pill; but a build was still one atomic call (the tyres: 9 s on the
   audit runner) and the first frame after it compiled every new shader program at once. R-24:
     1. a job prepares a set in STEPS: `build()` may be a generator (`*build() { …; yield 'label'; … return g; }`) — each
        chunk is a step; then one step per texture upload (renderer.initTexture) and one per material (compile + link right
        there, against the scene render target and the location's own lights, so the first frame compiles nothing);
     2. frame() pumps the job for LOC_BUDGET ms per frame (a step is atomic: a frame runs at least one). A fight that needs
        a cold place waits under «Готовим площадку…» with a bar (LOC_WAIT, setLocation(id, 'wait')); in the menu the old set
        stays on screen and a small pill shows instead; idle menu frames prebuild the next fight's place (LOCBG);
     3. location canvases are drawn on the CPU (willReadFrequently): an accelerated 2D canvas defers its raster to the
        upload / getImageData, which then blocked for seconds under software GL and could not be split; on low they are
        drawn at half size; small sprites that repeat between places are cached (locTex) and never evicted;
     4. on low at most 2 sets stay resident (locTrim, LRU; eviction frees only what the set owns).
   Debug: window.__loc = { prefetch, kick, next, dispose, warm, busy, cold, report, pump }; __perf.locReport() prints the table. */
const LOC_IDS = ['gym', 'parking', 'tires', 'yard', 'warehouse', 'boxgym', 'metro', 'bar'];
const LOC_BUDGET = 8, LOC_BG_BUDGET = 4;   // ms of loading work per frame: waiting for the set / prebuilding in the menu

/* instrument canvasTex once (a hoisted function declaration in boxer.html, → a mutable module binding). Outside a location
   build it is the original. Inside one (LOCPROF.active): a CPU canvas, half size on low for anything ≥ 128 × 128 (the draw
   still gets the full w, h — the context is scaled, so every hand-placed pixel coordinate keeps working); the time and count
   go into LOCPROF for __perf.locReport(). */
const _canvasTex0 = canvasTex;
canvasTex = function (w, h, draw) {
  if (!LOCPROF.active) return _canvasTex0(w, h, draw);
  const t = performance.now(), k = locTexK(w, h), c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const x = c.getContext('2d', { willReadFrequently: true }); if (k !== 1) x.scale(k, k); draw(x, w, h);
  const r = new THREE.CanvasTexture(c); r.colorSpace = THREE.SRGBColorSpace; r.anisotropy = 8;
  LOCPROF.tex += performance.now() - t; LOCPROF.texN++; return r;
};
function locTexK(w, h) { return GFX.level === 'low' && w * h >= 128 * 128 ? 0.5 : 1; }
/* a canvas that several places draw the same way (soft glow sprites): made once, shared, never disposed by an eviction */
const LOCTEX = new Map();
function locTex(key, w, h, draw) {
  let t = LOCTEX.get(key);
  if (!t) { t = canvasTex(w, h, draw); t.userData.locShared = true; LOCTEX.set(key, t); }
  return t;
}
function glowSprite(stops, size = 128) {   // a white radial falloff: stops = [[offset, alpha], …]
  return locTex('glow:' + size + ':' + stops.join(';'), size, size, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  });
}

function locBusy(on) {
  const el = $('loc-busy'); if (!el) return;
  el.hidden = !on || !$('loading').hidden;   // never cover the boot loading screen
}
/* the loading screen (a fight waits for its place) or the pill (the menu keeps the old set on screen) */
function locLoadUI() {
  const J = LOC_WANT && LOC_WANT.job, scr = $('loc-load'), on = !!(J && LOC_WAIT) && $('loading').hidden;
  if (scr) {
    if (scr.hidden === on) scr.hidden = !on;
    if (on) { const n = $('ll-n'); if (n.textContent !== LOC_WANT.label) n.textContent = LOC_WANT.label; $('ll-bar').style.width = (locProgress(J) * 100).toFixed(1) + '%'; }
  }
  locBusy(!!J && !LOC_WAIT);
}

/* GPU objects shared by EVERY location: the crowd figure (CROWD.geo + its attributes), the reduced index, the two
   crowd materials and their blob texture, the cached sprites (locTex). Freeing any of them on an eviction would blank the
   other locations. */
function locShared() {
  const s = new Set([CROWD.mat, CROWD.blobMat, CROWD.geo, CROWD.lowIdx, ...LOCTEX.values()]);
  if (CROWD.geo) { if (CROWD.geo.index) s.add(CROWD.geo.index); for (const k in CROWD.geo.attributes) s.add(CROWD.geo.attributes[k]); }
  if (CROWD.blobMat && CROWD.blobMat.map) s.add(CROWD.blobMat.map);
  return s;
}
/* textures a material uses, its own fields and ShaderMaterial uniforms → { value: tex } */
function matTextures(m, out) {
  for (const v of Object.values(m)) {
    if (v && v.isTexture) out.add(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && !v.isColor && !v.isVector2 && !v.isVector3)
      for (const u of Object.values(v)) if (u && u.value && u.value.isTexture) out.add(u.value);
  }
  return out;
}
/* Free ONE built set: detach its group, remove its scene-level lights / puffs, and dispose what it owns. three's
   geometry.dispose() removes the GL buffer of EACH attribute — a crowd geometry borrows its attributes from
   CROWD.geo, so any geometry that references a shared attribute is deliberately left alone (small CPU leak, no
   broken crowds). Owned canvas textures are found on the owned materials and in their ShaderMaterial uniforms.
   A half-built set (a parked job) is dropped with it. */
function locDispose(L) {
  const g = L.group; L.job = null; LOCBG.splice(0, LOCBG.length, ...LOCBG.filter(o => o !== L));
  if (!g) return;
  const shared = locShared(), own = new Set(), dead = new Set();
  const collect = o => {
    dead.add(o);
    const mats = !o.material ? [] : (Array.isArray(o.material) ? o.material : [o.material]);
    const geo = o.geometry;
    if (geo && !shared.has(geo) && !shared.has(geo.index) && !Object.values(geo.attributes).some(a => shared.has(a))) own.add(geo);
    for (const m of mats) {
      if (!m || shared.has(m)) continue;
      own.add(m);
      for (const t of matTextures(m, new Set())) if (t.isCanvasTexture && !shared.has(t)) own.add(t);
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
/* low: keep the current set + one spare (≤ 2). Never evict the set the player is looking at or the one being waited for. */
function locTrim() {
  if (GFX.level !== 'low' || LOCPROF.noTrim) return;
  const spare = Object.values(LOCS).filter(o => o.group && o !== LOC_ON && o !== LOC_WANT).sort((a, b) => (a.stamp || 0) - (b.stamp || 0));
  while (spare.length > 1) locDispose(spare.shift());
}

/* ── the job: build chunks → texture uploads → shader programs ── */
function locReady(L) { return !!(L && L.group && !L.job); }
function locJob(L) {
  if (L.job || locReady(L)) return L.job;
  return (L.job = { L, phase: 'build', it: null, k: 0, list: null, i: 0, seen: null, p0: locPrograms(),
    st: { build: 0, tex: 0, texN: 0, up: 0, gl: 0, n: 0, max: 0, maxL: '', top: [] } });
}
/* 0..1 for the bar: the build chunks (L.steps is the count of a generator build, measured) weigh 75 %, uploads 10 %, programs 15 % */
function locProgress(J) {
  if (J.phase === 'build') return 0.75 * Math.min(1, J.k / (J.L.steps || 1));
  const f = J.list && J.list.length ? J.i / J.list.length : 1;
  return J.phase === 'tex' ? 0.75 + 0.1 * f : 0.85 + 0.15 * f;
}
/* show only this location's lights (and the ring if it has one) while fn runs: compile() takes the light rig from what is
   visible (three r160 gathers lights with traverseVisible) */
function locLightsAs(L, fn) {
  if (LOC_ON === L) return fn();
  const saved = [[RINGSET, RINGSET.visible]];
  for (const o of Object.values(LOCS)) {
    if (o.group) { saved.push([o.group, o.group.visible]); o.group.visible = o === L; }
    for (const w of o.world || []) { saved.push([w, w.visible]); w.visible = o === L; }
  }
  RINGSET.visible = L.ring;
  try { return fn(); } finally { for (const [o, v] of saved) o.visible = v; }
}
/* the programs one object needs: compiled against sceneRT (a render target → linear output, no tone mapping — what the
   RenderPass draws with; compiled for the canvas they would be compiled again in the first frame), then linked at once
   (getUniforms is the first synchronous query) so that the wait falls into this step */
function locCompile(o) {
  const ps = renderer.info.programs, p0 = ps.length, prev = renderer.getRenderTarget(), one = { traverse: cb => cb(o), traverseVisible() {} };
  renderer.setRenderTarget(sceneRT);
  try {
    renderer.compile(one, camera, scene);
    // the AO pass redraws the scene with its MeshNormalMaterial (scene.overrideMaterial): that program also depends on the
    // object kind and the light rig — compile it for this object too
    if (gtao && gtao.enabled && !o.isPoints && !o.isLine) { const m = o.material; o.material = gtao.normalMaterial; try { renderer.compile(one, camera, scene); } finally { o.material = m; } }
  } finally { renderer.setRenderTarget(prev); }
  for (let i = p0; i < ps.length; i++) { ps[i].getUniforms(); ps[i].getAttributes(); }
}
/* the last step: one real render of the scene into a 4 × 4 target with this location's lights — whatever the per-material
   compile could not reach (the shadow pass's depth materials of the fighters) is compiled here, not in the first frame */
let locWarmRT = null;
function locWarmRender(L) {
  if (!locWarmRT) locWarmRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  locLightsAs(L, () => {
    const prev = renderer.getRenderTarget(), ps = renderer.info.programs, p0 = ps.length;
    L.group.visible = true;   // (locLightsAs restores it)
    renderer.setRenderTarget(locWarmRT);
    try { renderer.render(scene, camera); } finally { renderer.setRenderTarget(prev); }
    for (let i = p0; i < ps.length; i++) { ps[i].getUniforms(); ps[i].getAttributes(); }
  });
}
/* what the gl phase walks: the set's own meshes (hidden ones too — they show up later) and the visible shared ones (fighters,
   ring props) whose programs depend on the light rig; one entry per material × object kind */
function locGLList(L) {
  const out = [], seen = new Set(), groups = new Set(Object.values(LOCS).map(o => o.group).filter(Boolean));
  const add = o => {
    if (!o.material || (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite)) return;
    const k = [].concat(o.material).map(m => m.id).join(',') + '|' + (o.isInstancedMesh ? 1 : 0) + (o.isSkinnedMesh ? 2 : 0) + (o.instanceColor ? 4 : 0) + (o.morphTargetInfluences ? 8 : 0) + (o.isPoints ? 16 : 0) + (o.geometry && o.geometry.attributes.color ? 32 : 0);
    if (!seen.has(k)) { seen.add(k); out.push(o); }
  };
  L.group.traverse(add);
  for (const w of L.world || []) w.traverse && w.traverse(add);
  locLightsAs(L, () => { const walk = o => { if (!o.visible || groups.has(o)) return; add(o); for (const c of o.children) walk(c); }; walk(scene); });
  return out;
}
/* ONE atomic step of a job. Returns true when the set is ready. */
function locStep(J) {
  const L = J.L, st = J.st, t0 = performance.now(); let label = J.phase, slot = 'gl';
  if (J.phase === 'build') {
    slot = 'build'; const c0 = LOCPROF.tex; LOCPROF.active = true;
    try {
      if (!J.it) { const r = L.build(); if (r && typeof r.next === 'function') J.it = r; else J.g = r; }
      if (J.it) { const s = J.it.next(); if (s.done) J.g = s.value; else label = 'build:' + (s.value || J.k); }
      J.k++;
    } catch (e) { console.error('locBuild', L.id, e); J.g = J.g || new THREE.Group(); }
    finally { LOCPROF.active = false; st.tex += LOCPROF.tex - c0; st.texN = LOCPROF.texN; }
    if (J.g) {   // built: park it hidden in ARENA, list its textures
      if (J.it) { label = 'build:end'; L.steps = J.k; }
      const g = J.g; ARENA.add(g); g.visible = false; for (const w of L.world || []) w.visible = false;
      L.group = g; J.phase = 'tex'; J.i = 0;
      const ts = new Set(); g.traverse(o => { if (o.material) for (const m of [].concat(o.material)) matTextures(m, ts); });
      J.list = [...ts].filter(t => !(t.userData.locShared && renderer.properties.get(t).__webglTexture));
    }
  } else if (J.phase === 'tex') {
    slot = 'up';
    if (J.i < J.list.length) { const t = J.list[J.i++]; label = 'tex ' + (t.image ? t.image.width + '×' + t.image.height : ''); renderer.initTexture(t); }
    if (J.i >= J.list.length) { J.phase = 'gl'; J.list = null; J.i = 0; }
  } else if (J.phase === 'gl') {
    if (!J.list) { J.list = locGLList(L); label = 'gl list'; }
    else if (J.i < J.list.length) { const o = J.list[J.i++]; label = 'gl ' + ([].concat(o.material)[0].type || '').replace('Material', ''); locLightsAs(L, () => locCompile(o)); }
    if (J.list && J.i >= J.list.length) J.phase = 'warm';
  } else if (J.phase === 'warm') { label = 'gl warm render'; locWarmRender(L); J.phase = 'done'; }
  const ms = performance.now() - t0; st[slot] += ms; st.n++; if (ms > st.max) { st.max = ms; st.maxL = label; }
  st.top.push([ms, label]); st.top.sort((a, b) => b[0] - a[0]); st.top.length = Math.min(st.top.length, 3);
  if (J.phase !== 'done') return false;
  L.job = null;
  const r1 = v => +v.toFixed(1);
  LOCPROF.last = { id: L.id, build: r1(st.build), tex: r1(st.tex), texN: st.texN, up: r1(st.up), gl: r1(st.gl), steps: st.n,
    maxStep: r1(st.max), maxLabel: st.maxL, progs: locPrograms() - J.p0, top: st.top.map(([m, l]) => `${l} ${m.toFixed(0)}`).join(', ') };
  if (LOC_WANT === L) { LOC_WANT = null; LOC_WAIT = false; LOC = L; locApply(L); locLoadUI(); }
  else locTrim();
  return true;
}
/* run a job to the end right now (setLocation(id, 'now'): debug, reports, the first set at boot) */
function locFinish(L) { const J = locJob(L); if (J) while (!locStep(J)) {} }
/* called first thing in frame(): spend the frame budget on the wanted set (or, in an idle menu, on the prefetch list).
   true = the game waits for its place — frame() skips the simulation and the render; the loading screen is up. */
const LOCBG = [];
function locPumpFrame() {
  const t0 = performance.now(), W = LOC_WANT;
  if (W && W.job) { const J = W.job; while (!locStep(J) && performance.now() - t0 < LOC_BUDGET) {} }
  else if (LOCBG.length && G.state === 'menu' && !G.paused) {
    while (LOCBG.length && performance.now() - t0 < LOC_BG_BUDGET) {
      const L = LOCBG[0]; if (locReady(L) || !locJob(L)) { LOCBG.shift(); continue; }
      if (locStep(L.job)) LOCBG.shift();
    }
  }
  if (W) locLoadUI();
  return LOC_WAIT;
}

/* ── what to prebuild while the player is in the menu ── */
function locNext() {
  try {
    if (G.mode === 'career') return careerLoc();
    if (G.mode === 'spar' || G.mode === 'bag') return 'boxgym';
    return G.loc || 'gym';                             // quick fight: the place picked / hovered in the list
  } catch (_) { return G.loc || 'gym'; }
}
function locPrefetchOne(id) { const L = LOCS[id]; if (L && !locReady(L) && !LOCBG.includes(L)) LOCBG.push(L); }
function locPrefetch() {
  LOCBG.length = 0;                                  // a re-entry into the menu supersedes the old list
  const want = [], add = id => { if (LOCS[id] && !locReady(LOCS[id]) && !want.includes(id)) want.push(id); };
  let car = null; try { car = careerLoc(); } catch (_) {}
  add(car); add(locNext()); add(G.loc); add('boxgym');   // the career place, the last mode's place, the picked place, the gym
  for (const id of want.slice(0, GFX.level === 'low' ? 1 : 2)) locPrefetchOne(id);   // low holds current + one spare
}
let locKickT = 0;
function locPrefetchKick() { clearTimeout(locKickT); locKickT = setTimeout(locPrefetch, 900); }   // after the menu settles
/* compile everything in the scene for one location's light rig (debug; the gl phase of a job does this per material) */
function locWarm(L) {
  const run = () => { const prev = renderer.getRenderTarget(); renderer.setRenderTarget(sceneRT); try { renderer.compile(scene, camera); } finally { renderer.setRenderTarget(prev); } };
  try { L ? locLightsAs(L, run) : run(); } catch (_) {}
}

/* ── measurement: a cold entry per location, pumped exactly as the game does it (frames of LOC_BUDGET ms) ── */
function locPrograms() { return renderer.info && renderer.info.programs ? renderer.info.programs.length : 0; }
/* a headless run renders frames back to back, so the GPU can be seconds behind: wait for it before timing the next set
   (in the game the loading screen draws no 3D frames, the queue drains during the first chunks) */
function locDrain() { const t = performance.now(); try { const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } catch (_) {} return performance.now() - t; }
function locReport(opts) {
  opts = opts || {};
  const ids = opts.locs || LOC_IDS, save = { loc: LOC_ON ? LOC_ON.id : G.loc, state: G.state, hold: window.__camHold, place: sfx.place };
  sfx.place = () => {};                            // ambience / convolver is not part of the set's build cost
  LOCPROF.noTrim = true; G.state = 'fight'; window.__camHold = { p: [0, 1.15, 4.7], l: [0, 0.93, 0] };
  camUpdate(1 / 60); renderFrame(); locDrain();   // a level just switched (applyGfx) recompiles the fighters: not a location's cost
  const p0 = locPrograms(), rows = [], warm = {};
  try {
    for (const id of ids) {
      const L = LOCS[id]; if (!L) continue;
      if (L.group || L.job) locDispose(L);        // force a cold build even for an already cached / prefetched set
      const drain = locDrain();
      LOC_WANT = L; LOC_WAIT = true; LOC = L; locJob(L);
      const fr = [], t0 = performance.now();
      while (L.job) { const f = performance.now(); locPumpFrame(); fr.push(performance.now() - f); }
      const load = performance.now() - t0, pf = locPrograms();
      const f0 = performance.now(); camUpdate(1 / 60); locSync(); renderFrame(); const first = performance.now() - f0;
      const b = LOCPROF.last || {};
      rows.push({ id, load: +load.toFixed(0), frames: fr.length, maxFrame: +Math.max(...fr).toFixed(0), maxStep: b.maxStep, maxLabel: b.maxLabel, top: b.top,
        build: b.build, tex: b.tex, texN: b.texN, up: b.up, gl: b.gl, progs: b.progs, late: locPrograms() - pf,
        first: +first.toFixed(0), total: +(load + first).toFixed(0), drain: +drain.toFixed(0) });
    }
    for (const id of ids) { const t = performance.now(); setLocation(id, 'now'); warm[id] = +(performance.now() - t).toFixed(2); }
  } finally {
    sfx.place = save.place; LOCPROF.noTrim = false;
    G.state = save.state; window.__camHold = save.hold; setLocation(save.loc || 'gym', 'now'); locTrim();
  }
  for (const r of rows) r.warm = warm[r.id];
  const pad = (s, n) => String(s).padStart(n);
  const head = 'локация      всего, мс  кадров  макс. кадр  build (canvas, N)    текстуры  шейдеры (прогр.)  1-й кадр (+прогр.)  повтор  самые тяжёлые шаги, мс';
  const line = '───────────  ─────────  ──────  ──────────  ───────────────────  ────────  ────────────────  ──────────────────  ──────  ──────────────────────';
  const table = [`уровень графики: ${GFX.level}; бюджет кадра загрузки ${LOC_BUDGET} мс; шейдерных программ в начале: ${p0}`, head, line].concat(rows.map(r =>
    pad(r.id, 11) + '  ' + pad(r.total, 9) + '  ' + pad(r.frames, 6) + '  ' + pad(r.maxFrame, 10) + '  ' + pad(`${r.build} (${r.tex}, ${r.texN})`, 19) + '  '
    + pad(r.up, 8) + '  ' + pad(`${r.gl} (${r.progs})`, 16) + '  ' + pad(`${r.first} (+${r.late})`, 18) + '  ' + pad(r.warm, 6) + '  ' + r.top)).join('\n')
    + '\nвсего = шаги загрузки + первый кадр после неё; GPU прошлых кадров перед каждой площадкой дожидались отдельно: '
    + rows.map(r => r.id + ' ' + r.drain).join(', ') + ' мс';
  const csv = 'location,total_ms,frames,max_frame_ms,build_ms,canvas_tex_ms,canvas_tex_n,upload_ms,gl_ms,programs,first_frame_ms,late_programs,warm_entry_ms,max_step_ms,max_step\n'
    + rows.map(r => [r.id, r.total, r.frames, r.maxFrame, r.build, r.tex, r.texN, r.up, r.gl, r.progs, r.first, r.late, r.warm, r.maxStep, r.maxLabel].join(',')).join('\n');
  return { p0, rows, csv, table };
}
if (window.__perf) window.__perf.locReport = locReport;
Object.assign(window.__loc || (window.__loc = {}), { prefetch: locPrefetch, kick: locPrefetchKick, next: locNext,
  dispose: locDispose, warm: locWarm, busy: locBusy, report: locReport, pump: locPumpFrame,
  cold: id => { const L = LOCS[id]; if (L && (L.group || L.job)) locDispose(L); setLocation(id, 'now'); } });   // keep __loc.set/get/LOCS of dbg_extra.js
