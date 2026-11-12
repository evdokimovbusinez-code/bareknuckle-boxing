/* ───────── performance measurement tool: window.__perf.report() ─────────
   Stage 2 (#47): a reproducible before/after table for the phone presets. For every location × graphics preset it measures, over a
   number of rendered frames, the triangles and draw calls the whole frame costs (scene + AO/bloom/FXAA/full-screen passes and shadow
   maps are all counted, because renderer.info.autoReset = false), the number of resident geometries/textures and the average frame
   time. Everything is measured from one pinned, representative fight camera so the numbers are comparable between presets.
   Usage (console or the js:// shot scenario):
     __perf.report()                                   → { rows, csv, table }  (all locations, low/medium/high, 120 frames)
     __perf.report({ frames: 8 })                     → a quicker pass for iteration
     __perf.report({ locs: ['parking','metro'], levels: ['low','high'] })
   The tool restores the location, preset, crowd fill and camera when it is done. */
(function () {
  const ALL_LOCS = ['gym', 'parking', 'tires', 'yard', 'warehouse', 'boxgym', 'metro'];
  const CAM = { p: [0, 1.15, 4.7], l: [0, 0.93, 0] };   // the mid-fight camera (world metres, fighters face each other along x)
  const pad = (s, n) => String(s).padStart(n);

  function perfReport(opts) {
    opts = opts || {};
    const locs = opts.locs || ALL_LOCS, levels = opts.levels || ['low', 'medium', 'high'];
    const frames = Math.max(1, opts.frames || 120), dt = 1 / 60;
    // triangles / draw calls do not depend on resolution, so by default we render the timed frames at a small pixel ratio —
    // this keeps the post-processing (AO / bloom) cheap on software renderers. Pass shrink:1 to time at the preset's real size.
    const shrink = opts.shrink === undefined ? 0.4 : (opts.shrink === false ? 1 : opts.shrink);
    // save everything we are about to touch
    const save = {
      loc: G.loc, state: G.state, level: GFX.level, set: GFX.set, fill: CROWD.fill,
      hold: window.__camHold, qH: qH, pr: renderer.getPixelRatio(),
    };
    const setMeasurePR = () => { if (shrink >= 1) return; renderer.setPixelRatio(shrink); composer.setPixelRatio(shrink); renderer.setSize(VW, VH, false); composer.setSize(VW, VH); };
    const rows = [];
    try {
      // a stable "in the fight" state: crowd active, everyone came, no cutscene camera
      G.state = 'fight'; G.paused = false; CROWD.fill = 1;
      window.__camHold = CAM; camUpdate(dt);   // pins camera.position / camP / camL via the documented debug hook
      for (const loc of locs) {
        G.loc = loc; setLocation(loc);
        for (const level of levels) {
          applyGfx(level); setMeasurePR();   // applyGfx → applyRes sets the preset's pixel ratio; override it for the timed frames
          // let the location's sync() apply particle budgets and the crowd's update() apply the density budget, and let any
          // shader recompilation (shadow filter / MSAA change) happen before the timed frames
          for (let s = 0; s < 4; s++) { camUpdate(dt); locSync(); if (LOC.crowd) LOC.crowd.update(dt); }
          for (let w = 0; w < 2; w++) renderFrame();
          let tris = 0, calls = 0, geoms = 0, textures = 0, ms = 0;
          for (let i = 0; i < frames; i++) {
            const a = performance.now();
            renderFrame();
            ms += performance.now() - a;
            const info = renderer.info;
            tris += info.render.triangles; calls += info.render.calls;
            geoms = info.memory.geometries; textures = info.memory.textures;
          }
          rows.push({ loc, level,
            tris: Math.round(tris / frames), calls: Math.round(calls / frames),
            geoms, textures, ms: +(ms / frames).toFixed(2) });
        }
      }
    } finally {
      // put the game back exactly as we found it
      G.state = save.state; CROWD.fill = save.fill; window.__camHold = save.hold;
      GFX.set = save.set; applyGfx(save.level); qH = save.qH; applyRes();
      G.loc = save.loc; setLocation(save.loc);
    }
    const head = 'локация      пресет   треугольники  вызовы  геометрии  текстуры   кадр, мс';
    const line = '───────────  ───────  ────────────  ──────  ──────────  ─────────  ─────────';
    const table = [head, line].concat(rows.map(r =>
      pad(r.loc, 11) + '  ' + pad(r.level, 7) + '  ' + pad(r.tris, 12) + '  ' + pad(r.calls, 6) + '  '
      + pad(r.geoms, 10) + '  ' + pad(r.textures, 9) + '  ' + pad(r.ms, 8))).join('\n');
    const csv = 'location,preset,triangles,calls,geometries,textures,frame_ms\n'
      + rows.map(r => [r.loc, r.level, r.tris, r.calls, r.geoms, r.textures, r.ms].join(',')).join('\n');
    return { rows, csv, table };
  }
  window.__perf = { report: perfReport, CAM };
})();
