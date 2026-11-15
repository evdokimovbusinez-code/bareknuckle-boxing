#!/bin/bash
# Issue #55/#56 — rebuild the whole tee pipeline from zero, in order.
#   bash tools/assets/cloth/run_all.sh
# 1) export_body.py  — Playwright reads P1.body in bind pose -> out/body.obj + out/body_skin.json
# 2) pattern.py      — measures the body, drafts the tee -> out/tee.json + out/tee.svg
# 3) place.py        — bends the pieces around the body (bpy) -> out/tee_placed.blend/.json
# 4) sim.py          — pre-sew + Blender cloth sim (bpy) -> out/tee_high.obj/.blend  (issue #56)
# Each script also drops its report PNG into preview/ (committed); everything else stays in
# out/ (git-ignored). Run from anywhere: paths are absolute, taken from this script's location.
# On this CI box the same sequence also runs as: python3 tools/assets/  (see ../__main__.py).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "== 1/4 тело бойца в позе привязки (Playwright) =="
python3 "$HERE/export_body.py"
echo "== 2/4 выкройка футболки =="
python3 "$HERE/pattern.py"
echo "== 3/4 раскладка деталей вокруг тела =="
python3 "$HERE/place.py"
echo "== 4/4 пошив и симуляция футболки =="
python3 "$HERE/sim.py"
echo "== брюки: выкройка + раскладка =="
python3 "$HERE/pants.py"
echo "== готово: данные в out/, превью в preview/ =="
