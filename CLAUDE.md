# Bare-Knuckle Boxing — instructions for Claude

Browser boxing game on three.js 0.160 (+ cannon-es), single page. UI text is in Russian; keep it Russian.

## Build rule (important)
- **Never edit `index.html` by hand.** It is generated. Edit files in `src/`, then run `bash tools/check.sh`
  (rebuilds `index.html` via `python3 src/assemble.py` and syntax-checks the module). Commit both `src/` and the rebuilt `index.html`.
- `src/assemble.py` builds ONE ES module from: `src/g_a.js` (imports, renderer, lights) + blocks spliced by line range from
  `src/boxer.html` (ring/arena, post-processing, asset list, cloth, hair, shorts) + `src/g_pre.js` (skin/blood/sweat shader chunks)
  + all `src/game/NN_*.js` concatenated **in name order** (they share one scope — no imports between them) + markup/CSS `src/g_head.html`.
  Do not change line numbers in `src/boxer.html` (assemble.py depends on them). New game code goes into a new `src/game/NN_name.js`
  placed in the right order (things it uses must be defined earlier or be hoisted functions).
- `src/bench.js` / `src/dbg_extra.js` only go into the debug build `gtest.html` (git-ignored).

## Looking at the game (do this for every visual change)
- `bash tools/shot.sh /tmp/shots/a.jpg fight 4` — quick fight, 4 s in. `... menu` — the menu. `... js "CODE"` — run CODE first
  (`window.__g` exposes `G, P1, P2, camera, scene, ARENA, ...`; `__tick(n, dt)` steps the sim, e.g. `__tick(300, 1/60)`).
  Close-ups: pin the camera with `window.__camHold = { p: [x, y, z], l: [x, y, z] }` (world metres; fighters face each other along x,
  P1 at x≈-0.55, heads at y≈1.65; the default camera looks from +z). `delete window.__camHold` releases it.
  Several screens in one run: inside CODE `await __shot('tag')` saves `a-tag.jpg`. Menu screens are opened by clicking their buttons
  (`go-fighter`, `go-set`, `go-quick`, …; `go` starts the quick fight). Small / touch screen: append `WxH [touch]`, e.g.
  `bash tools/shot.sh /tmp/shots/s.jpg js "CODE" 740x360 touch` (`390x800 touch` = portrait phone, rotated stage).
  Then open the JPG with the Read tool. Software rendering: ~30 s – 3 min per shot. Compare before/after.

## Map of `src/game/`
| File | What |
|---|---|
| `00_gfx.js` | graphics presets (`GFX`, `GFX_PRESET`, `applyGfx`, `setGfx`), scene render target / FXAA, F3 performance overlay (`PERF`, `perfTick`, `renderFrame`) |
| `00_looks_templates_punches.js` | look presets (shorts/hair/skin/wraps), FBX template build, small maths (`Jig`, `Spring`), `PUNCH` table |
| `01_ragdoll.js` | `class Ragdoll` — standing hit reactions (cannon-es), muscle tone |
| `02_xpbd_ko.js` | `XBody`, `XWorld` — knockout ragdoll, rope + canvas contacts; knockout timeline, get-up poses (`POSES`) |
| `03_flesh_face.js` | `class Flesh` (swelling, cuts, nose bleeds), `class Face` (gaze, blinks, jaw) |
| `04_gear.js` | clothes shells (`BOTTOMS`, `TOPS`, `SHOES`, `shellMesh`), `gloveMesh`, `headgearMesh`, `guardMesh`, `gearSetup` |
| `04b_gloves_headgear.js` | boxing gloves (`gloveMesh`, cuff, thumb, piping), MMA glove shell (`mmaShell`), training headgear (`headgearGeo`, `headMap`), gum shield; `HANDS`, `GLOVES` options |
| `04c_mma_pads.js` | rigid MMA-glove pads on the hand bones (`mmaPadGeo`, `mmaPads`) |
| `04d_street.js` | street clothes with their own skinned geometry: loose trousers / long shorts (`PANT_CUTS`, `pantsGeo`, `pantsTex`, `pantsMesh`, hem spring `pantsTick`), shoes (`shoeGeo`, `shoeTex`, `shoeMesh`), `streetLook()`, `isStreet()` |
| `05_fighter.js` | `class Fighter` — animation, IK, footwork (`plantFeet`), arm clearing (`armClear`), stamina, `dress`, `sparGear` |
| `06_fx_sound.js` | blood mist, blood/sweat/floor stains (`FX`, `MIST`), synthesised sound |
| `07_state_replay_hits.js` | `G` state, `DIFFS`, `LADDER`, career/profile, replay buffer (`REC`), `resolveHit`, `knockdown`, `knockout` (`DMG_K`) |
| `08_ai_flow.js` | `STYLES`, `ai(dt)`, `playerInput`, `toMenu`, `rollOpponent` |
| `09_bag.js` | heavy bag training, `startFight` / modes |
| `10_camera_layout.js` | fight / replay camera, HUD, `layout()`, resolution (`QUAL`, `applyRes`, `resTick`) |
| `11_arena_loop.js` | ring lights, rope visuals, **main loop `frame()`** (update order) |
| `12_ui.js` | option rows (`swatches`), fight input: keyboard/mouse (`MV_KEYS`, `ACT_KEYS`), touch stick, boot |
| `13_locations.js` | locations: `LOCS` (`gym`, `parking`), current `LOC`, `setLocation(id)`, `locSync()`; per location: `bound`, `ring`, `wall` (soft wall for the KO ragdoll), `build()` set, `light`. Debug: `__loc.set('parking')` |
| `13b_loc_tires.js` | location `LOCS.tires` «Шины и огонь»: night yard, tyre circle (one InstancedMesh, `TIRE_TIERS`), ground with puddles (mask + analytic fire reflections, `TIRE_GROUND_FS`), burning drums (instanced shader cards `TIRE_FX_VS/FS`: flames, glows, flares, smoke; `TIRE_SPARK_*` points), car with headlights, sky dome; animated in its `sync()`. Debug: `__loc.set('tires')` |
| `13d_loc_warehouse.js` | location `LOCS.warehouse` («Склад»): 6 × 6 m cage of orange fence panels (`WH_HALF`; the mesh dents under the fighters' joints — `WH_DENT`, uniform `uDent`, in `sync()`), hall set, dish lamps + work light, dust beams (`beamMat`), `masked` crowd; rectangular soft wall `wall.kind = 'rect'` (`hx`, `hz` — see `XWorld.solve`) |
| `14_crowd.js` | crowd around the fighting floor: `makeCrowd({ shape, r \| w,h, rows, density, look })` → `{ group, update, cheer, wall }` (one InstancedMesh, posed in the vertex shader: `crowdGeo`, `CROWD_VS`), `crowdTick(dt)`, reactions via `EVT` (defined in `07`), a location puts its crowd into `LOC.crowd`. Debug: `__crowd.cheer(1, 3)` |
| `14_screens.js` | menu screens over the scene: `UI` state, `uiShow(scr)` (`main` / `train` / `quick` / `creator` / `settings` / `pause`), `uiKey` (arrows, Enter, Esc), `buildMenu`, fighter creator (`buildCreator`, `setCat`, `randomLook`, `renderStats`), settings (`buildSettings`, `OPT`, `resetProgress`), pause (`pauseGame`, `resumeGame`, `surrender`; `G.paused` → `frame()` runs with dt = 0), menu camera `menuCam` (orbit about P1). Markup + CSS of the screens: `src/g_head.html` |

## Conventions
- Units: metres, seconds. Fighters stay on the world x-line; the ring (`ARENA`) rotates/slides around them.
- Physics and timing are tuned by measurement; when changing a constant, say in the PR what it was and why.
- Keep changes small and focused, one task per PR. Don't reformat unrelated code.
- Comments in English, UI strings in Russian.
- In the PR description: what changed, which functions, and how to see it in the game.
