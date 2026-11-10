# Bare-Knuckle Boxing — instructions for Claude

Browser boxing game on three.js 0.160 (+ cannon-es), single page. UI text is in Russian; keep it Russian.

## Build rule (important)
- **Never edit `index.html` by hand.** It is generated. Edit files in `src/`, then run `bash tools/check.sh`
  (rebuilds `index.html` via `python3 src/assemble.py` and syntax-checks the module). Commit both `src/` and the rebuilt `index.html`.
- `src/assemble.py` splices line ranges of `src/boxer.html` (ring, cloth, hair, shorts blocks) with `src/g_a.js` (renderer),
  `src/g_pre.js` (skin/blood/sweat shader chunks), `src/g_b.js` (the game) and `src/g_head.html` (markup + CSS).
  Do not change line numbers in `src/boxer.html` (assemble.py depends on them).
- `src/bench.js` / `src/dbg_extra.js` only go into the debug build `gtest.html` (git-ignored).

## Map of `src/g_b.js`
| Section (search the header comment) | What |
|---|---|
| `looks` | shorts/hair/skin/wraps presets |
| `punches` — `const PUNCH` | punch table: clip, arm, damage, reach |
| `class Ragdoll` | standing hit reactions (cannon-es), muscle tone |
| `XPBD rigid bodies` — `XBody`, `XWorld` | knockout ragdoll, ropes, canvas |
| `knockout timeline` | KO / knockdown phases, get-up poses (`POSES`) |
| `class Flesh` | swelling, cuts, nose bleeds |
| `class Face` | gaze, blinks, jaw |
| `clothes & gear` | trousers/tops/shoes shells, gloves, headgear, mouthguard |
| `class Fighter` | animation mixing, IK, footwork (`plantFeet`), arm clearing (`armClear`), stamina |
| `blood mist`, `blood, sweat, floor stains` | FX |
| `game state` — `DIFFS`, `LADDER` | difficulty, career ladder |
| `hits` — `resolveHit`, `knockdown`, `knockout` | damage model, balance (`DMG_K`) |
| `AI` — `STYLES`, `ai(dt)` | opponent behaviour |
| `training` | heavy bag mode |
| `camera`, `layout` | camera + resolution (`QUAL`, `applyRes`) |
| `main loop` — `frame()` | update order |
| `UI wiring` | menu, keyboard/mouse (`MV_KEYS`, `ACT_KEYS`), touch stick |

## Conventions
- Units: metres, seconds. Fighters stay on the world x-line; the ring (`ARENA`) rotates/slides around them.
- Physics and timing are tuned by measurement; when changing a constant, say in the PR what it was and why.
- Keep changes small and focused, one task per PR. Don't reformat unrelated code.
- Comments in English, UI strings in Russian.
- In the PR description: what changed, which functions, and how to see it in the game.
