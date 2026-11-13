#!/bin/bash
# Rebuild, serve the debug build and take a screenshot.  Examples:
#   bash tools/shot.sh /tmp/shots/menu.jpg menu
#   bash tools/shot.sh /tmp/shots/fight.jpg fight 6
#   bash tools/shot.sh /tmp/shots/x.jpg js "document.getElementById('go').click(); __tick(400, 1/60);"
#   bash tools/shot.sh /tmp/shots/t.jpg tut   # issue 45: run tools/tut_test.py (all steps, desktop keys + touch PointerEvents)
#   bash tools/shot.sh /tmp/shots/mp.jpg mp   # issue 49: run tools/test/mp_test.py (two pages, real PeerJS P2P)
# then look at the JPG with the Read tool.  Takes 1-4 minutes (software rendering).
set -e
cd "$(dirname "$0")/.."
mkdir -p "$(dirname "$1")"
python3 src/assemble.py >/dev/null
# issue 45: the tutorial check — all steps on desktop keys and touch PointerEvents (tools/tut_test.py)
if [ "${2:-}" = "tut" ]; then exec python3 tools/tut_test.py; fi
# issue 50: the training mini-games check — grades, XP, the day rule, reload persistence, regressions (tools/train_test.py)
if [ "${2:-}" = "train" ]; then exec python3 tools/train_test.py; fi
[ -e node_modules ] || { [ -d /home/claude/cc/node_modules ] && ln -s /home/claude/cc/node_modules node_modules; }
[ -d node_modules/three ] || npm i --no-save --silent three@0.160.0 cannon-es@0.20.0 >/dev/null
# one server per checkout (worktrees run side by side): the port comes from this directory's path
PORT=${SHOT_PORT:-$((8700 + $(pwd | cksum | cut -d' ' -f1) % 200))}
curl -sf -o /dev/null http://localhost:$PORT/gtest.html || { (python3 -m http.server $PORT >/dev/null 2>&1 &); sleep 1; }
# issue 49: two pages in one browser, real PeerJS — tools/test/mp_test.py starts its own http.server
if [ "${2:-}" = "mp" ]; then exec python3 tools/test/mp_test.py "$1"; fi
SHOT_PORT=$PORT timeout 600 python3 tools/shot.py "$@"
