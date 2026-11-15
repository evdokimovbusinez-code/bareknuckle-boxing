"""Hand-made tee (user/tshirt_src.blend) -> game asset: skin weights from the body, T-pose -> bind A-pose, export.

    /Applications/Blender.app/Contents/MacOS/Blender -b tools/assets/cloth/user/tshirt_src.blend \
        --python tools/assets/cloth/user_tee.py [-- high|low]

1. Weights: per shirt vertex, the nearest point on the POSED body (T-pose, as the shirt was made) -> barycentric blend of the
   body's vertex groups; only torso / clavicle / arm-twist bones are kept (no legs, hands, head), Laplacian-smoothed, top 4.
2. Inverse skinning: rest = (sum w_i S_i)^-1 * pose, S_i = arm.mw * pb.matrix * bone.matrix_local^-1 * arm.mw^-1.
3. Export in the game's body GEOMETRY frame (cm, z up; = 100 x Blender world here — the body's parent inverse and the
   armature's 0.01 scale cancel the FBX axes): assets/tee_hand.json {pos, uv, idx, bones, si, sw}.
Prints the checks: share of shirt vertices inside the body before / after, and the body's v0 in the game frame.
"""
import bpy, json, os, re, sys
from mathutils import Matrix
from mathutils.bvhtree import BVHTree

WHICH = (sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'high')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
KEEP = re.compile(r'CC_Base_(Pelvis|Waist|Spine0[12]|NeckTwist0[12]|[LR]_(Clavicle|UpperarmTwist0[12]|ElbowShareBone|ForearmTwist0[12]|RibsTwist|Breast|ThighTwist01))$')
SMOOTH = 6

arm = bpy.data.objects['CC3_Base_Plus']; body = bpy.data.objects['CC_Base_Body']
src = bpy.data.objects['tshirt_' + WHICH]


def body_mesh():
    """Evaluated body (current armature pose) in world space: verts, triangles, BVH."""
    dg = bpy.context.evaluated_depsgraph_get(); e = body.evaluated_get(dg); m = e.to_mesh()
    mw = body.matrix_world
    V = [mw @ v.co for v in m.vertices]; m.calc_loop_triangles()
    T = [tuple(t.vertices) for t in m.loop_triangles]
    e.to_mesh_clear()
    return V, T, BVHTree.FromPolygons(V, T)


def inside(P, V, T, bvh):
    """Share of the points P lying under the body's surface (nearest face normal points away)."""
    n = 0
    for p in P:
        loc, nrm, fi, d = bvh.find_nearest(p)
        if loc is not None and (p - loc).dot(nrm) < 0: n += 1
    return n / len(P)


# shirt mesh with its modifiers (Decimate on low; the unbaked Cloth on high is a no-op at frame 0)
dg = bpy.context.evaluated_depsgraph_get(); se = src.evaluated_get(dg); sm = se.to_mesh()
smw = src.matrix_world
SP = [smw @ v.co for v in sm.vertices]
sm.calc_loop_triangles()
TRI = [tuple(t.vertices) for t in sm.loop_triangles]
uvl = sm.uv_layers.active.data
UVL = {}  # per (vertex) uv; the seams are split below
for t in sm.loop_triangles:
    for li, vi in zip(t.loops, t.vertices): UVL[(vi, li)] = tuple(uvl[li].uv)
LOOPS = [(tuple(t.vertices), tuple(t.loops)) for t in sm.loop_triangles]
# the normal map was baked against Blender's own normals and MikkTSpace tangents: ship them, three.js derives others
sm.calc_tangents(); r3 = smw.to_3x3().normalized()
LN = [(r3 @ l.normal).normalized() for l in sm.loops]; LT = [((r3 @ l.tangent).normalized(), l.bitangent_sign) for l in sm.loops]
EDGES = [tuple(e.vertices) for e in sm.edges]
se.to_mesh_clear()

# 1. weights from the posed body
gname = {g.index: g.name for g in body.vertex_groups}
BW = [{gname[g.group]: g.weight for g in v.groups if g.weight > 0 and KEEP.match(gname[g.group])} for v in body.data.vertices]
V, T, bvh = body_mesh()
print('inside the body (T-pose, as made): %.2f%%' % (100 * inside(SP, V, T, bvh)))
W = []
for p in SP:
    loc, nrm, fi, d = bvh.find_nearest(p)
    a, b, c = (V[i] for i in T[fi])
    # barycentric of loc in (a, b, c)
    v0, v1, v2 = b - a, c - a, loc - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01 or 1e-12
    y = (d11 * d20 - d01 * d21) / den; z = (d00 * d21 - d01 * d20) / den; x = 1 - y - z
    w = {}
    for bi, f in zip(T[fi], (x, y, z)):
        for g, gw in BW[bi].items(): w[g] = w.get(g, 0) + max(f, 0) * gw
    W.append(w)
nbr = [[] for _ in SP]
for i, j in EDGES: nbr[i].append(j); nbr[j].append(i)
for _ in range(SMOOTH):
    W2 = []
    for i, w in enumerate(W):
        a = dict((g, 0.5 * x) for g, x in w.items()); k = 0.5 / max(len(nbr[i]), 1)
        for j in nbr[i]:
            for g, x in W[j].items(): a[g] = a.get(g, 0) + k * x
        W2.append(a)
    W = W2
for i, w in enumerate(W):
    top = sorted(w.items(), key=lambda e: -e[1])[:4]; s = sum(x for _, x in top) or 1
    W[i] = [(g, x / s) for g, x in top]
    if not top: raise SystemExit('vertex %d got no weights' % i)

# 2. inverse skinning to the rest pose
amw, ami = arm.matrix_world, arm.matrix_world.inverted()
S = {pb.name: amw @ pb.matrix @ pb.bone.matrix_local.inverted() @ ami for pb in arm.pose.bones}
RP, RM = [], []
for p, w in zip(SP, W):
    M = Matrix(((0,) * 4,) * 4)
    for g, x in w: M = M + S[g] * x
    Mi = M.inverted(); RP.append(Mi @ p); RM.append(Mi.to_3x3())
arm.data.pose_position = 'REST'; bpy.context.view_layer.update()
V, T, bvh = body_mesh()
print('inside the body (bind A-pose):   %.2f%%' % (100 * inside(RP, V, T, bvh)))
v0 = body.matrix_world @ body.data.vertices[0].co
print('body v0 in the game frame (cm):', [round(100 * c, 2) for c in v0], '(FBX: 15.90, -5.99, 90.97)')

# 3. export: split vertices on uv seams
key, pos, uv, si, sw, idx, nrm, tan = {}, [], [], [], [], [], [], []
bones = sorted({g for w in W for g, _ in w})
for vs, ls in LOOPS:
    for vi, li in zip(vs, ls):
        u = UVL[(vi, li)]; n = (RM[vi] @ LN[li]).normalized(); k = (vi, round(u[0], 5), round(u[1], 5), *(round(c, 2) for c in n))
        if k not in key:
            key[k] = len(key); pos += [round(100 * c, 2) for c in RP[vi]]; uv += [round(u[0], 4), round(u[1], 4)]
            w = W[vi] + [(W[vi][0][0], 0)] * (4 - len(W[vi]))
            si += [bones.index(g) for g, _ in w]; sw += [round(x, 3) for _, x in w]
            t = (RM[vi] @ LT[li][0]); t = (t - n * t.dot(n)).normalized()
            nrm += [round(c, 3) for c in n]; tan += [round(c, 3) for c in t] + [LT[li][1]]
        idx.append(key[k])
out = os.environ.get('TEE_OUT') or os.path.join(ROOT, 'assets', 'tee_hand.json')
json.dump({'src': 'tools/assets/cloth/user/tshirt_src.blend:tshirt_' + WHICH, 'pos': pos, 'uv': uv, 'idx': idx,
           'bones': bones, 'si': si, 'sw': sw, 'nrm': nrm, 'tan': tan}, open(out, 'w'), separators=(',', ':'))
print('wrote', out, len(pos) // 3, 'verts', len(idx) // 3, 'tris', len(bones), 'bones', os.path.getsize(out), 'bytes')
