#!/bin/bash
# Rebuild, serve the debug build and take a screenshot.  Examples:
#   bash tools/shot.sh /tmp/shots/menu.jpg menu
#   bash tools/shot.sh /tmp/shots/fight.jpg fight 6
#   bash tools/shot.sh /tmp/shots/x.jpg js "document.getElementById('go').click(); __tick(400, 1/60);"
# then look at the JPG with the Read tool.  Takes 1-4 minutes (software rendering).
set -e
cd "$(dirname "$0")/.."
mkdir -p "$(dirname "$1")"
python3 src/assemble.py >/dev/null
[ -d node_modules/three ] || npm i --no-save --silent three@0.160.0 cannon-es@0.20.0 >/dev/null
curl -s -o /dev/null http://localhost:8766/gtest.html || { (python3 -m http.server 8766 >/dev/null 2>&1 &); sleep 1; }
timeout 600 python3 tools/shot.py "$@"
