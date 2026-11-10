/* ───────── graphics presets (GFX), auto level, performance overlay (F3) ─────────
   applyGfx(level) switches on the fly: AO, shadows, MSAA / FXAA, bloom, render height and the budgets of the secondary simulations.
   Hooks for other systems (locations: crowd, fire, smoke): GFX.particles (0..1, multiply particle counts by it), GFX.crowd (0..1, crowd
   density), GFX.simSkip (2 = secondary simulations may run every other frame); GFX.onChange.push(fn) is called after every level change. */
const GFX_ORDER = ['low', 'medium', 'high', 'ultra'];
const GFX_LABEL = { auto: 'авто', low: 'низкая', medium: 'средняя', high: 'высокая', ultra: 'ультра' };
const GFX_PRESET = {
  // h: render height · ao: GTAO samples (0 = off) at aoScale of the frame · msaa: samples of the scene target (0 = FXAA pass instead)
  // shadow: key light map size, soft = PCFSoft · tpr: pixel-ratio cap on touch devices · simSkip: hair / shorts cloth every Nth frame
  low:    { h: 720,  ao: 0,  aoScale: 0.5, msaa: 0, bloom: false, shadow: 1024, soft: false, tpr: 1,    simSkip: 2, particles: 0.5, crowd: 0.3 },
  medium: { h: 900,  ao: 8,  aoScale: 0.5, msaa: 2, bloom: true,  shadow: 1024, soft: true,  tpr: 1.5,  simSkip: 1, particles: 0.8, crowd: 0.6 },
  high:   { h: 1080, ao: 12, aoScale: 1,   msaa: 4, bloom: true,  shadow: 2048, soft: true,  tpr: 1.75, simSkip: 1, particles: 1,   crowd: 1 },
  ultra:  { h: 1440, ao: 16, aoScale: 1,   msaa: 4, bloom: true,  shadow: 2048, soft: true,  tpr: 2,    simSkip: 1, particles: 1,   crowd: 1 },
};
const GFX = { level: 'high', set: 'auto', detect: 'high', gpu: '', h: 1080, tpr: 1.75, aoScale: 1, simSkip: 1, particles: 1, crowd: 1, onChange: [], ready: false };

/* the scene is drawn into its own multisampled target; the composer's ping-pong buffers are plain — before, every full-screen pass
   (NaN scrub, AO blend, bloom) was rasterised into a 4× MSAA half-float buffer and resolved again */
const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: rt.samples });
const fxaa = new ShaderPass(FXAAShader); fxaa.enabled = false; composer.addPass(fxaa);   // after OutputPass; only when MSAA is off
{
  const rp = composer.passes[0], scrub = composer.passes[1], rpRender = rp.render.bind(rp), scrubRender = scrub.render.bind(scrub);
  rp.render = (r, wb, rb, dt, mask) => rpRender(r, wb, sceneRT, dt, mask);
  rp.setSize = (w, h) => sceneRT.setSize(w, h);
  scrub.render = (r, wb, rb, dt, mask) => scrubRender(r, wb, sceneRT, dt, mask);
  for (const t of [composer.renderTarget1, composer.renderTarget2]) { t.samples = 0; t.depthBuffer = false; t.dispose(); }
  fxaa.setSize = (w, h) => fxaa.material.uniforms.resolution.value.set(1 / w, 1 / h);
  if (gtao) { const aoSize = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => aoSize(Math.max(1, Math.round(w * GFX.aoScale)), Math.max(1, Math.round(h * GFX.aoScale))); }
  renderer.info.autoReset = false;   // counted per frame over all passes (renderFrame resets it)
  // ring props never move inside the ring frame: no per-frame matrix recompose
  RINGSET.traverse(o => { if (o !== RINGSET) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
}

function applyGfx(level) {
  if (!GFX_PRESET[level]) level = 'high';
  const P = GFX_PRESET[level]; GFX.level = level;
  GFX.h = P.h; GFX.tpr = P.tpr; GFX.simSkip = P.simSkip; GFX.particles = P.particles; GFX.crowd = P.crowd; GFX.aoScale = P.aoScale;
  if (gtao) { gtao.enabled = P.ao > 0; if (P.ao > 0) { gtao.updateGtaoMaterial({ samples: P.ao }); gtao.updatePdMaterial({ samples: P.ao }); } }
  bloom.enabled = P.bloom;
  const msaa = lowEnd ? Math.min(P.msaa, 2) : P.msaa;
  if (sceneRT.samples !== msaa) { sceneRT.samples = msaa; sceneRT.dispose(); }
  fxaa.enabled = msaa === 0;
  const type = P.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  if (renderer.shadowMap.type !== type) {   // the filter is compiled into every lit material
    renderer.shadowMap.type = type;
    scene.traverse(o => { const m = o.material; if (!m) return; if (Array.isArray(m)) for (const x of m) x.needsUpdate = true; else m.needsUpdate = true; });
  }
  if (key.shadow.mapSize.x !== P.shadow) { key.shadow.mapSize.set(P.shadow, P.shadow); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
  if (GFX.ready) { qH = GFX.h; applyRes(); }
  for (const f of GFX.onChange) f(GFX);
}
/* menu choice: 'auto' or a fixed level (saved) */
function setGfx(v) {
  if (v !== 'auto' && !GFX_PRESET[v]) v = 'auto';
  GFX.set = v; try { localStorage.setItem('bx_gfx', v); if (v === 'auto') localStorage.removeItem('bx_gfx_auto'); } catch (_) {}
  DR.acc = DR.n = DR.good = DR.bad = 0; DR.wait = 1; DR.upNeed = 6;
  applyGfx(v === 'auto' ? GFX.detect : v);
}
{
  // auto starts from 'medium' on integrated / weak / mobile GPUs, otherwise from 'high'; a level the auto mode stepped down to is remembered
  let name = '';
  try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); name = String((e && gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || ''); } catch (_) {}
  GFX.gpu = name;
  const weak = lowEnd || /intel(?!.*\barc\b)|swiftshader|llvmpipe|software|basic render|mali|adreno|powervr|videocore|radeon(\(tm\))? (r[2-7]|hd|vega [3-8]\b)|geforce (mx|gt |[0-9]{3}m)/i.test(name);
  GFX.detect = weak ? 'medium' : 'high';
  let set = 'auto', start = GFX.detect;
  try {
    const old = localStorage.getItem('bx_q'); set = localStorage.getItem('bx_gfx') || (old === '720' ? 'low' : old === '1440' ? 'ultra' : 'auto');
    const was = localStorage.getItem('bx_gfx_auto'); if (GFX_PRESET[was] && GFX_ORDER.indexOf(was) < GFX_ORDER.indexOf(start)) start = was;
  } catch (_) {}
  if (set !== 'auto' && !GFX_PRESET[set]) set = 'auto';
  GFX.set = set; applyGfx(set === 'auto' ? start : set);
}

/* ───────── performance overlay: F3 on a keyboard, a three-finger tap on a phone ───────── */
const PERF = { on: false, el: null, m: { anim: 0, phys: 0, fx: 0, misc: 0, render: 0 }, rag: 0, frames: 0, dt: 0, max: 0, calls: 0, tris: 0, t0: 0, last: null };
function perfToggle(v) {
  PERF.on = v === undefined ? !PERF.on : !!v;
  if (!PERF.el) {
    const el = PERF.el = document.createElement('pre'); el.id = 'perf';
    el.style.cssText = 'position:absolute;left:8px;top:76px;margin:0;z-index:60;padding:7px 10px;border-radius:6px;background:rgba(6,8,12,.72);color:#cfe9c4;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre;pointer-events:none;text-align:left';
    stage.appendChild(el);
  }
  PERF.el.hidden = !PERF.on; PERF.t0 = 0;
}
/* called once per frame by frame(): rawDt = the real time between frames; the CPU parts are summed into PERF.m by frame() / renderFrame()
   (render = CPU time of submitting the frame; what the GPU needs on top shows as the gap between «кадр» and «CPU») */
function perfTick(rawDt) {
  const P = PERF, m = P.m; P.frames++; P.dt += rawDt; if (rawDt > P.max) P.max = rawDt;
  P.calls += renderer.info.render.calls; P.tris += renderer.info.render.triangles;
  const now = performance.now(); if (now - P.t0 < 500 && P.t0) return;
  const n = P.frames, f = v => (v / n).toFixed(1);
  P.last = { fps: n / Math.max(1e-6, P.dt), ms: P.dt / n * 1000, max: P.max * 1000, anim: m.anim / n, phys: m.phys / n, fx: m.fx / n, misc: m.misc / n, render: m.render / n, calls: Math.round(P.calls / n), tris: Math.round(P.tris / n) };
  if (P.on && P.el) {
    const cpu = m.anim + m.phys + m.fx + m.misc + m.render;
    P.el.textContent = `${P.last.fps.toFixed(0)} FPS · кадр ${P.last.ms.toFixed(1)} мс (макс ${P.last.max.toFixed(1)})\n`
      + `CPU ${f(cpu)} мс: анимация ${f(m.anim)} · физика ${f(m.phys)} · FX ${f(m.fx)} · рендер ${f(m.render)} · прочее ${f(m.misc)}\n`
      + `draw calls ${P.last.calls} · треугольники ${(P.last.tris / 1000).toFixed(0)} тыс.\n`
      + `${canvas.width}×${canvas.height} · графика: ${GFX.set === 'auto' ? 'авто → ' : ''}${GFX_LABEL[GFX.level]}\n`
      + `GPU: ${GFX.gpu.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 64) || '—'}`;
  }
  m.anim = m.phys = m.fx = m.misc = m.render = 0; P.frames = 0; P.dt = 0; P.max = 0; P.calls = 0; P.tris = 0; P.t0 = now;
}
function renderFrame() { const t = performance.now(); renderer.info.reset(); composer.render(); PERF.m.render += performance.now() - t; }
window.addEventListener('keydown', e => { if (e.code === 'F3') { e.preventDefault(); if (!e.repeat) perfToggle(); } });
window.addEventListener('touchstart', e => { if (e.touches.length === 3) perfToggle(); }, { passive: true });
