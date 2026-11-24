"""Prints what the generator needs to know about the source body: objects, bones of the rest (bind A) pose, slices of the body.
   python3 tools/assets/cloth/gen/probe.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C

B = C.load_body()
print('objects:', [(o.name, o.type) for o in C.bpy.data.objects])
print('body verts', len(B.V), 'faces', len(B.me.polygons), 'bbox', [round(min(v[a] for v in B.V), 3) for a in range(3)], [round(max(v[a] for v in B.V), 3) for a in range(3)])
for n in ('Hip', 'Pelvis', 'Waist', 'Spine01', 'Spine02', 'NeckTwist01', 'NeckTwist02', 'Head', 'L_Clavicle', 'L_Upperarm', 'L_Forearm', 'L_Hand', 'L_Thigh', 'L_Calf', 'L_Foot', 'L_ToeBase', 'R_Upperarm', 'R_Thigh'):
    print('%-12s head %s tail %s' % (n, [round(x, 3) for x in B.bone('CC_Base_' + n)], [round(x, 3) for x in B.bone('CC_Base_' + n, True)]))
print('groups:', len(B.gname), sorted(set(B.gname.values()))[:200])
for z in (0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6, 1.7, 1.75):
    pts = [v for v in B.V if abs(v.z - z) < 0.01]
    if pts: print('z %.2f: x %.3f..%.3f  y %.3f..%.3f  n %d' % (z, min(p.x for p in pts), max(p.x for p in pts), min(p.y for p in pts), max(p.y for p in pts), len(pts)))
