#!/usr/bin/env python3
"""Issue #56 helper — raster previews of the PRE-SEWED rest mesh (out/tee_presew.json), no sim.

    python3 tools/assets/ --only preview

sim.py's own previews come from the simulated mesh; this script exists for quick looks at the
sewn rest state (and for CI runs that must not wait for the cloth solver). Same four views as
sim.py: preview/sim_front|side|back|close.png — note they show the REST mesh, not the sim result.
"""
import json, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
PREVIEW = os.path.join(HERE, 'preview')
sys.path.insert(0, HERE)
import place


def main():
    cp = os.path.join(OUT, 'tee_presew.json')
    if not os.path.exists(cp):
        print('нет out/tee_presew.json — сначала sim.py'); return 1
    d = json.load(open(cp))
    bodyP, bodyT = place.load_obj(os.path.join(OUT, 'body.obj'))
    bd = dict(verts3=bodyP, tris=bodyT)
    V = [tuple(v) for v in d['V']]
    F = [tuple(f) for f in d['F']]
    p3 = {'tee': dict(verts3=V, faces=F, color=(0.78, 0.74, 0.68))}
    os.makedirs(PREVIEW, exist_ok=True)
    W = 640
    views = {'sim_front': ('front', None, None), 'sim_side': ('side', None, None),
             'sim_back': ('back', None, None), 'sim_close': ('front', (0.19, 1.43), 0.17)}
    for tag, (view, center, radius) in views.items():
        p = os.path.join(OUT, tag + '.png')
        place.raster(bd, p3, [], view, p, W, W, center=center, radius=radius)
        shutil.copyfile(p, os.path.join(PREVIEW, tag + '.png'))
        print(f'  превью (пошитый покой, {W}px) → preview/{tag}.png', flush=True)
    print('ИТОГ: превью покоящейся сшитой футболки (симуляция — в sim.py)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
