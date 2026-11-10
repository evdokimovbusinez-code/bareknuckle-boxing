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
| `05_fighter.js` | `class Fighter` — animation, IK, footwork (`plantFeet`), arm clearing (`armClear`), stamina, `dress`, `sparGear` |
| `06_fx_sound.js` | blood mist, blood/sweat/floor stains (`FX`, `MIST`), synthesised sound |
| `07_state_replay_hits.js` | `G` state, `DIFFS`, `LADDER`, career/profile, replay buffer (`REC`), `resolveHit`, `knockdown`, `knockout` (`DMG_K`) |
| `08_ai_flow.js` | `STYLES`, `ai(dt)`, `playerInput`, `toMenu`, `rollOpponent` |
| `09_bag.js` | heavy bag training, `startFight` / modes |
| `10_camera_layout.js` | fight / replay camera, HUD, `layout()`, resolution (`QUAL`, `applyRes`, `resTick`) |
| `11_arena_loop.js` | ring lights, rope visuals, **main loop `frame()`** (update order) |
| `12_ui.js` | menu build (`swatches`, `buildMenu`), keyboard/mouse (`MV_KEYS`, `ACT_KEYS`), touch stick, boot |

## Conventions
- Units: metres, seconds. Fighters stay on the world x-line; the ring (`ARENA`) rotates/slides around them.
- Physics and timing are tuned by measurement; when changing a constant, say in the PR what it was and why.
- Keep changes small and focused, one task per PR. Don't reformat unrelated code.
- Comments in English, UI strings in Russian.
- In the PR description: what changed, which functions, and how to see it in the game.
