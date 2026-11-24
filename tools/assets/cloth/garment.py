"""Any garment modelled in Blender -> game asset (issue #86). bpy, no GUI. Generalises tee_game.py (#57).

    python3 tools/assets/cloth/garment.py tools/assets/cloth/user/<file>.blend [--id ID] [--meta JSON] [options]
    Blender -b --python tools/assets/cloth/garment.py -- tools/assets/cloth/user/<file>.blend [--id ID] ...

What it looks for in the file:
  · mesh objects <id>_high and <id>_low (several pairs in one file = several garments, each on its own; --id picks one; a file with one
    pair and an --id that names no pair writes that pair under the given id). A garment without _high gets no normal bake; without _low
    its low poly is a QuadriFlow remesh of the high one;
  · the body CC_Base_Body and the skeleton CC3_Base_Plus (the game's own: bind pose = the game's A-pose, arms -32 deg). The garment may
    be modelled in any pose (T, A, own): the armature's current pose is what it is fitted to; it is unskinned back to the bind A-pose.
  · metadata = custom properties of the _low object (Object Properties -> Custom Properties): cat (top | bottom | head | shoes | belt |
    hands), name (Russian label), price (rubles), colors ("white,black,grey" — ids of WCOL in src/game/04e_wardrobe.js), rigid (bone name:
    the whole thing rides that one bone, e.g. CC_Base_Head for a cap), item (the game's ITEMS id, default = id), base (procedural cut
    a top falls back to while / if the file does not load, default tee), tags ("street,basic"), nat (JSON {colour id: "#hex"}).
    Priority: --meta JSON > custom properties > the entry already in assets/cloth/items.json > defaults (printed as WARNINGs).

Steps (each prints its numbers; WARN lines are the ones to read):
  1. weights from the posed body (= Data Transfer "nearest face interpolated", by hand: the bone filter per category and the checks stay
     here), SMOOTH Laplacian passes, top 4 bones, normalised. rigid -> one bone, weight 1.
  2. inverse skinning to the bind A-pose: rest = (sum w_i S_i)^-1 * pose; check: the Armature modifier re-poses the rest mesh onto the
     source (max error < 1 mm).
  3. penetration: share of garment vertices under the body surface, as made and in the A-pose.
  4. bend: shoulder (upper arm 80 deg forward) for tops / hands, knee (90 deg) and hip (60 deg) for bottoms / shoes / belts ->
     flipped triangles and edge stretch. --low auto (default) takes the file's _low unless its bend is clearly worse than a QuadriFlow
     remesh of the high one (FACES quads); --low file | quad forces one.
  5. UV: the low poly's own uv is measured (3D vs UV after normalising the total area: per-triangle area and per-edge length error,
     p50 / p95 / max). p95 > UV_MAX (5%) or no uv -> re-unwrap: seams = the marked ones if the mesh has any, else the islands of a
     Smart UV Project + sharp edges (+ the boundaries, always); Angle Based and Minimum Stretch are both tried, Average Islands Scale,
     Pack (margin); measured again, the better one is kept. preview/<id>_uv.png = the layout over a checker, triangles coloured by
     their area error (green 0 -> red >= 20%).
  6. bake in Cycles, high -> low as made (where both coincide): tangent-space normal map RES px -> <id>_n.webp (lossless); a multi-colour
     high poly (image texture or several materials of different colour) also gets its colour baked -> <id>_c.webp (the game multiplies
     it by the chosen palette colour: 'white' = as baked); a one-colour garment is dyed by the palette alone.
  7. GLB written by hand (layout of tee_game.py: KHR_mesh_quantization, Blender's normals / MikkTSpace tangents, JOINTS_0 = index into
     primitive.extras.bones) -> assets/cloth/<id>.glb, and <id>_lo.glb (<= LO_TRIS triangles, Decimate collapse of the rest mesh with
     uv seams delimited: the same <id>_n.webp fits) for GFX low.
  8. assets/cloth/items.json: the entry of this garment (id, item, cat, name, price, colors, files, triangles, uv / penetration numbers).
     src/assemble.py builds the registry of src/game/04j_cloth_asset.js from it (run bash tools/check.sh afterwards).
  9. tools/assets/cloth/render.py checker <id>: three.js renders of the GLB with a checker texture by uv (+ the normal map) on the body
     -> preview/<id>_checker_front/side/back/close.png.

Options: --low auto|file|quad  --faces 6000 (quads for QuadriFlow)  --res 1024  --lo-tris 3000  --uv-max 0.05  --sharp 45 (deg)
         --cage 0.005 --ray 0.02 (m, bake)  --smooth 6  --no-bake  --no-render  --info (list what the file holds and stop)
"""
import bpy, json, math, os, re, struct, subprocess, sys, time, argparse
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'cloth'); PREVIEW = os.path.join(HERE, 'preview'); WORK = os.path.join(HERE, 'out')
REG = os.path.join(OUT, 'items.json')
T0 = time.time()
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser(description='Blender garment -> game asset')
ap.add_argument('blend', nargs='?'); ap.add_argument('--id'); ap.add_argument('--meta', default='{}')
ap.add_argument('--low', default='auto', choices=['auto', 'file', 'quad']); ap.add_argument('--faces', type=int, default=6000)
ap.add_argument('--res', type=int, default=1024); ap.add_argument('--lo-tris', type=int, default=3000); ap.add_argument('--uv-max', type=float, default=0.05)
ap.add_argument('--sharp', type=float, default=45); ap.add_argument('--seam-sharp', type=float, default=80); ap.add_argument('--island', type=float, default=0.015);ap.add_argument('--cage', type=float, default=0.005); ap.add_argument('--ray', type=float, default=0.02)
ap.add_argument('--smooth', type=int, default=6); ap.add_argument('--no-bake', action='store_true'); ap.add_argument('--no-render', action='store_true')
ap.add_argument('--info', action='store_true')
A = ap.parse_args(argv)
CATS = ('top', 'bottom', 'head', 'shoes', 'belt', 'hands')
# bones a category may take weights from (CC3 names); a vertex left with none falls back to every deforming bone
BONES = {
    'top': r'CC_Base_(Pelvis|Waist|Spine0[12]|NeckTwist0[12]|[LR]_(Clavicle|Upperarm|UpperarmTwist0[12]|ElbowShareBone|Forearm|ForearmTwist0[12]|RibsTwist|Breast|ThighTwist01))$',
    'bottom': r'CC_Base_(Hip|Pelvis|Waist|[LR]_(Thigh|ThighTwist0[12]|KneeShareBone|Calf|CalfTwist0[12]|Foot))$',
    'belt': r'CC_Base_(Hip|Pelvis|Waist|[LR]_(Thigh|ThighTwist01))$',
    'shoes': r'CC_Base_[LR]_(Calf|CalfTwist0[12]|Foot|ToeBase\w*|\w*Toe\w*)$',
    'head': r'CC_Base_(Head|NeckTwist0[12]|JawRoot)$',
    'hands': r'CC_Base_[LR]_(Hand|Forearm|ForearmTwist0[12]|\w*(Thumb|Index|Mid|Ring|Pinky)\w*)$',
}
DEFAULT = {'cat': 'top', 'price': 100, 'colors': ['white', 'black', 'grey'], 'base': 'tee', 'tags': ['street']}


def say(*a): print('[garment %6.1fs]' % (time.time() - T0), *a, flush=True)


def warn(*a): say('WARN', *a)


if A.blend and os.path.abspath(bpy.data.filepath or '') != os.path.abspath(A.blend): bpy.ops.wm.open_mainfile(filepath=os.path.abspath(A.blend))
if not bpy.data.filepath: raise SystemExit('give the .blend: python3 tools/assets/cloth/garment.py tools/assets/cloth/user/<file>.blend')
SRC = os.path.relpath(bpy.data.filepath, ROOT)
OBJ = bpy.data.objects
arm = OBJ.get('CC3_Base_Plus') or next((o for o in OBJ if o.type == 'ARMATURE'), None)
body = OBJ.get('CC_Base_Body')
pairs = {}
for o in OBJ:
    m = re.match(r'(.+)_(high|low)$', o.name)
    if o.type == 'MESH' and m: pairs.setdefault(m.group(1), {})[m.group(2)] = o
say('file %s: armature %s, body %s, garments %s' % (SRC, arm and arm.name, body and body.name,
    ', '.join('%s (%s)' % (k, '+'.join(sorted(v))) for k, v in pairs.items()) or 'none'))
if A.info:
    for k, v in pairs.items():
        for kind, o in v.items():
            print('  %s: %d verts, %d faces, uv %s, seams %d, custom props %s, modifiers %s' % (o.name, len(o.data.vertices), len(o.data.polygons),
                  [u.name for u in o.data.uv_layers], sum(e.use_seam for e in o.data.edges), {p: o[p] for p in o.keys() if not p.startswith('_')}, [x.type for x in o.modifiers]))
    raise SystemExit(0)
if not arm or not body: raise SystemExit('the file needs the skeleton CC3_Base_Plus and the body CC_Base_Body')
if not pairs: raise SystemExit('no <id>_high / <id>_low objects in the file')
if A.id and A.id in pairs: JOBS = [(A.id, A.id)]
elif A.id and len(pairs) == 1: JOBS = [(next(iter(pairs)), A.id)]
elif A.id: raise SystemExit('no %s_high / %s_low; the file holds: %s' % (A.id, A.id, ', '.join(pairs)))
else: JOBS = [(k, k) for k in pairs]

for o in [arm, body] + [o for v in pairs.values() for o in v.values()]:
    o.hide_viewport = False
    try: o.hide_set(False)
    except RuntimeError: pass
arm.data.pose_position = 'POSE'; bpy.context.view_layer.update()
amw, ami = arm.matrix_world.copy(), arm.matrix_world.inverted()
IDENT = Matrix.Identity(4)
gl = lambda v: (v.x, v.z, -v.y)   # Blender Z-up -> glTF Y-up


def evaluated(obj):
    """World-space verts, loop triangles, edges of an object with its modifiers (current armature pose)."""
    dg = bpy.context.evaluated_depsgraph_get(); e = obj.evaluated_get(dg); m = e.to_mesh(); mw = obj.matrix_world
    V = [mw @ v.co for v in m.vertices]; m.calc_loop_triangles()
    T = [tuple(t.vertices) for t in m.loop_triangles]; ED = [tuple(x.vertices) for x in m.edges]
    e.to_mesh_clear()
    return V, T, ED


def body_now():
    V, T, _ = evaluated(body)
    return V, T, BVHTree.FromPolygons(V, T)


def inside(P, bvh):
    """Share of the points P lying under the surface (the nearest face's normal points away from them)."""
    n = 0
    for p in P:
        loc, nrm, fi, d = bvh.find_nearest(p)
        if loc is not None and (p - loc).dot(nrm) < 0: n += 1
    return n / max(len(P), 1)


def select_only(o):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT': bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = o; o.select_set(True)


def mesh_copy(src, name):
    o = src.copy(); o.data = bpy.data.meshes.new_from_object(src.evaluated_get(bpy.context.evaluated_depsgraph_get())); o.modifiers.clear()
    o.name = o.data.name = name; bpy.context.collection.objects.link(o)
    for c in o.constraints: o.constraints.remove(c)
    return o


gname = {g.index: g.name for g in body.vertex_groups}
deform = {b.name for b in arm.data.bones if b.use_deform}
BV_T, BT_T, BVH_T = body_now()   # the body as the garment was made on it
S_POSE = {pb.name: amw @ pb.matrix @ pb.bone.matrix_local.inverted() @ ami for pb in arm.pose.bones}


def weights(P, EDGES, cat, rigid):
    if rigid:
        if rigid not in arm.data.bones: raise SystemExit('rigid: no bone %s' % rigid)
        return [[(rigid, 1.0)] for _ in P], 0
    keep = re.compile(BONES[cat])
    BWk = [{gname[g.group]: g.weight for g in v.groups if g.weight > 0 and keep.match(gname[g.group])} for v in body.data.vertices]
    BWa = [{gname[g.group]: g.weight for g in v.groups if g.weight > 0 and gname[g.group] in deform} for v in body.data.vertices]
    W, loose = [], 0
    for p in P:
        loc, nrm, fi, d = BVH_T.find_nearest(p)
        a, b, c = (BV_T[i] for i in BT_T[fi])
        v0, v1, v2 = b - a, c - a, loc - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01 or 1e-12
        y = (d11 * d20 - d01 * d21) / den; z = (d00 * d21 - d01 * d20) / den; x = 1 - y - z
        for BW in (BWk, BWa):
            w = {}
            for bi, f in zip(BT_T[fi], (x, y, z)):
                for g, gw in BW[bi].items(): w[g] = w.get(g, 0) + max(f, 0) * gw
            if sum(w.values()) > 1e-6: break
            loose += 1
        W.append(w)
    nbr = [[] for _ in P]
    for i, j in EDGES: nbr[i].append(j); nbr[j].append(i)
    for _ in range(A.smooth):
        W2 = []
        for i, w in enumerate(W):
            a = dict((g, 0.5 * x) for g, x in w.items()); k = 0.5 / max(len(nbr[i]), 1)
            for j in nbr[i]:
                for g, x in W[j].items(): a[g] = a.get(g, 0) + k * x
            W2.append(a)
        W = W2
    out = []
    for i, w in enumerate(W):
        top = [e for e in sorted(w.items(), key=lambda e: -e[1])[:4] if e[1] > 1e-4]; s = sum(x for _, x in top)
        if not top or s <= 0: raise SystemExit('vertex %d got no weights' % i)
        out.append([(g, x / s) for g, x in top])
    return out, loose


def blend(w, S):
    M = Matrix(((0,) * 4,) * 4)
    for g, x in w: M = M + S.get(g, IDENT) * x
    return M


def unskin(P, W):
    RP, RM = [], []
    for p, w in zip(P, W):
        Mi = blend(w, S_POSE).inverted(); RP.append(Mi @ p); RM.append(Mi.to_3x3())
    return RP, RM


# —— bends from the bind A-pose: a bone (+ its subtree) turned about its head so that a point moves forward / back ——
def rest_point(name): return amw @ arm.data.bones[name].head_local


up = Vector((0, 0, 1)); fwd = rest_point('CC_Base_L_ToeBase') - rest_point('CC_Base_L_Foot'); fwd.z = 0; fwd.normalize()


def bend_R(bone, probe, deg, sign):
    piv, q = rest_point(bone), rest_point(probe); axis = fwd.cross(up).normalized()
    for s in (1, -1):
        R = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(deg) * s, 4, axis) @ Matrix.Translation(-piv)
        if ((R @ q) - q).dot(fwd) * sign > 0: return R
    raise SystemExit('bend: no rotation for %s' % bone)


BENDS = {'shoulder': ('CC_Base_L_Upperarm', 'CC_Base_L_Forearm', 80, 1), 'knee': ('CC_Base_L_Calf', 'CC_Base_L_Foot', 90, -1),
         'hip': ('CC_Base_L_Thigh', 'CC_Base_L_Calf', 60, 1)}
CAT_BENDS = {'top': ['shoulder'], 'hands': ['shoulder'], 'bottom': ['knee', 'hip'], 'shoes': ['knee'], 'belt': ['hip'], 'head': []}


def tri_n(P, t):
    a, b, c = (P[i] for i in t); return (b - a).cross(c - a)


def bend_check(tag, kind, RP, TRI, EDGES, W):
    bone, probe, deg, sign = BENDS[kind]; R = bend_R(bone, probe, deg, sign)
    SUB = {b.name for b in [arm.data.bones[bone]] + list(arm.data.bones[bone].children_recursive)}; S = {g: R for g in SUB}
    M = [blend(w, S) for w in W]; Q = [m @ p for m, p in zip(M, RP)]
    hit = [any(g in SUB for g, _ in w) for w in W]
    flips, n = 0, 0
    for t in TRI:
        if not any(hit[i] for i in t): continue
        n += 1; n0 = tri_n(RP, t); n1 = tri_n(Q, t)
        ex = sum((M[i].to_3x3() for i in t[1:]), M[t[0]].to_3x3()) @ n0
        if n0.length < 1e-12 or n1.dot(ex) < 0: flips += 1
    st = sorted(((Q[i] - Q[j]).length / max((RP[i] - RP[j]).length, 1e-9)) for i, j in EDGES if hit[i] or hit[j])
    if not st:
        say('%s bend %s: no vertex rides %s' % (tag, kind, bone)); return {'flips': 0, 'tris': 0}
    r = {'flips': flips, 'tris': n, 'p1': round(st[len(st) // 100], 3), 'p99': round(st[-len(st) // 100 - 1], 3),
         'over13': round(100 * sum(x > 1.3 for x in st) / len(st), 2), 'under07': round(100 * sum(x < 0.7 for x in st) / len(st), 2)}
    say('%s bend %s (%s %+d deg): %d / %d triangles flipped; edge length ratio p1 %.2f p99 %.2f, >1.3: %.1f%%, <0.7: %.1f%%' % (
        tag, kind, bone[8:], deg, flips, n, r['p1'], r['p99'], r['over13'], r['under07']))
    return r


# —— UV: measure, unwrap ——
def tris_np(o):
    me = o.data; me.calc_loop_triangles(); nt = len(me.loop_triangles)
    tv = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('vertices', tv)
    tl = np.empty(nt * 3, np.int32); me.loop_triangles.foreach_get('loops', tl)
    co = np.empty(len(me.vertices) * 3, np.float64); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    M = np.array(o.matrix_world); co = co @ M[:3, :3].T + M[:3, 3]
    return me, tv.reshape(-1, 3), tl.reshape(-1, 3), co


def uv_of(me):
    uv = np.empty(len(me.loops) * 2, np.float64); me.uv_layers.active.data.foreach_get('uv', uv); return uv.reshape(-1, 2)


def uv_metrics(o):
    """3D vs UV after scaling the UV to the same total area: |area ratio - 1| per triangle, |length ratio - 1| per triangle side."""
    me, tv, tl, co = tris_np(o)
    if not me.uv_layers: return None
    uv = uv_of(me); P = co[tv]; U = uv[tl]
    A3 = 0.5 * np.linalg.norm(np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]), axis=1)
    e2 = (U[:, 1] - U[:, 0]), (U[:, 2] - U[:, 0]); cz = e2[0][:, 0] * e2[1][:, 1] - e2[0][:, 1] * e2[1][:, 0]; Au = 0.5 * np.abs(cz)
    ok = A3 > 1e-12; k2 = Au[ok].sum() / A3[ok].sum()
    if k2 <= 0: return {'p50': 9, 'p95': 9, 'max': 9, 'side95': 9, 'flip': 0, 'area': np.full(len(tv), 9.0)}
    area = np.where(ok, np.abs(Au / np.maximum(A3, 1e-12) / k2 - 1), 0)
    L3 = np.stack([np.linalg.norm(P[:, (i + 1) % 3] - P[:, i], axis=1) for i in range(3)], 1)
    Lu = np.stack([np.linalg.norm(U[:, (i + 1) % 3] - U[:, i], axis=1) for i in range(3)], 1) / math.sqrt(k2)
    side = np.abs(Lu / np.maximum(L3, 1e-9) - 1)[L3 > 1e-6]
    sgn = np.sign(cz[ok]); flip = int(min((sgn > 0).sum(), (sgn < 0).sum()))   # the minority winding: mirrored islands are legal, a few odd ones are folds
    # islands: triangles joined through shared (vertex, uv) corners
    kid = {}; cid = np.array([kid.setdefault((int(v), round(float(a), 5), round(float(b), 5)), len(kid)) for v, (a, b) in zip(tv.ravel(), uv[tl.ravel()])]).reshape(-1, 3)
    par = list(range(len(kid)))
    def root(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for a, b, c in cid: ra = root(a); par[root(b)] = ra; par[root(c)] = ra
    isl = len({root(a) for a, _, _ in cid})
    return {'islands': isl,'p50': float(np.percentile(area[ok], 50)), 'p95': float(np.percentile(area[ok], 95)), 'max': float(area[ok].max()),
            'side50': float(np.percentile(side, 50)), 'side95': float(np.percentile(side, 95)), 'sidemax': float(side.max()), 'flip': flip,
            'area': area, 'tris': int(ok.sum())}


def uv_line(tag, m):
    if not m: return say('%s uv: none' % tag)
    say('%s uv distortion (3D vs UV, normalised): area p50 %.1f%% p95 %.1f%% max %.0f%% | sides p50 %.1f%% p95 %.1f%% max %.0f%% | %d islands, odd-winding triangles %d' % (
        tag, 100 * m['p50'], 100 * m['p95'], 100 * m['max'], 100 * m['side50'], 100 * m['side95'], 100 * m['sidemax'], m['islands'], m['flip']))


def uv_score(m): return max(m['p95'], m['side95'])
def uv_rank(m): return uv_score(m) + 0.0005 * m['islands']   # among layouts over the limit: every island is a seam in the normal map, 20 islands ~ 1% stretch


def merge_islands(o, frac):
    """Smart UV leaves crumbs along the borders of its clusters: an island under frac of the faces loses the seam it shares with the
    neighbour island it touches most (edit mode, seams). Returns the island count."""
    import bmesh
    bm = bmesh.from_edit_mesh(o.data); bm.faces.ensure_lookup_table(); F = bm.faces; thr = max(12, int(frac * len(F)))
    for _ in range(60):
        lab = [-1] * len(F); n = 0
        for f0 in F:
            if lab[f0.index] >= 0: continue
            st = [f0]; lab[f0.index] = n
            while st:
                f = st.pop()
                for e in f.edges:
                    if e.seam: continue
                    for g in e.link_faces:
                        if lab[g.index] < 0: lab[g.index] = n; st.append(g)
            n += 1
        size = [0] * n
        for x in lab: size[x] += 1
        small = sorted((i for i in range(n) if size[i] < thr), key=lambda i: size[i])
        if not small: break
        done = set()
        for i in small:
            if i in done: continue
            share = {}
            for f in F:
                if lab[f.index] != i: continue
                for e in f.edges:
                    if not e.seam: continue
                    for g in e.link_faces:
                        j = lab[g.index]
                        if j != i: share.setdefault(j, []).append(e)
            if not share: continue
            j = max(share, key=lambda j: (len(share[j]), size[j]))
            for e in share[j]: e.seam = False
            done.update((i, j))
    bmesh.update_edit_mesh(o.data)
    return n


def unwrap(o):
    me = o.data; seams = sum(e.use_seam for e in me.edges)
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    select_only(o); ts = bpy.context.scene.tool_settings; ts.use_uv_select_sync = True
    best = None
    for ang in ((None,) if seams else (89, 75, 66)):   # finer islands only while the coarser ones stay over --uv-max (every island is a seam)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE'); bpy.ops.mesh.select_all(action='SELECT')
        if ang:   # islands of a Smart UV Project (planar-ish chunks) + the sharp rims; a boundary is always a cut
            bpy.ops.mesh.mark_seam(clear=True)
            bpy.ops.uv.smart_project(angle_limit=math.radians(ang), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
            bpy.ops.uv.seams_from_islands(mark_seams=True)
            bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(A.seam_sharp)); bpy.ops.mesh.mark_seam(clear=False)
            k = merge_islands(o, A.island)
            bpy.ops.mesh.select_all(action='SELECT')
        say('unwrap: seams %s' % ('marked in the file (%d edges)' % seams if not ang else 'from Smart UV islands (%d deg) + sharp edges > %g deg, islands under %.1f%% of the faces merged -> %d' % (ang, A.seam_sharp, 100 * A.island, k)))
        for method in ('ANGLE_BASED', 'MINIMUM_STRETCH'):
            try: bpy.ops.uv.unwrap(method=method, margin=0.0)
            except TypeError: continue   # (a Blender before 4.3 has no Minimum Stretch)
            bpy.ops.uv.average_islands_scale()
            bpy.ops.uv.pack_islands(margin=0.01, rotate=True)
            bpy.ops.object.mode_set(mode='OBJECT')
            m = uv_metrics(o); tag = method.lower().replace('_', ' ') + (' / %d deg' % ang if ang else ''); uv_line('  ' + tag, m)
            if best is None or uv_rank(m) < uv_rank(best[1]): best = (tag, m, uv_of(o.data))
            bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.object.mode_set(mode='OBJECT')
        if uv_score(best[1]) <= A.uv_max: break
    o.data.uv_layers.active.data.foreach_set('uv', best[2].ravel())
    return best[0], best[1]


def uv_png(o, m, path, res=1024):
    """The uv layout over a checker; triangles tinted by their area error (green 0 -> red >= 20%), edges dark."""
    me, tv, tl, co = tris_np(o); U = uv_of(me)[tl] * res
    yy, xx = np.mgrid[0:res, 0:res]; img = np.ones((res, res, 4), np.float32)
    img[..., :3] = np.where((((xx // 32) + (yy // 32)) % 2)[..., None] == 0, 0.92, 0.82)
    err = np.clip(m['area'] / 0.2, 0, 1)
    for t in range(len(U)):
        a, b, c = U[t]; x0, x1 = int(max(min(a[0], b[0], c[0]), 0)), int(min(max(a[0], b[0], c[0]) + 1, res)); y0, y1 = int(max(min(a[1], b[1], c[1]), 0)), int(min(max(a[1], b[1], c[1]) + 1, res))
        if x1 <= x0 or y1 <= y0: continue
        px, py = xx[y0:y1, x0:x1] + 0.5, yy[y0:y1, x0:x1] + 0.5
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9: continue
        l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d; l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d
        ins = (l1 >= 0) & (l2 >= 0) & (l1 + l2 <= 1)
        e = err[t]; col = np.array([0.35 + 0.6 * e, 0.8 - 0.55 * e, 0.35], np.float32)
        sub = img[y0:y1, x0:x1, :3]; sub[ins] = sub[ins] * 0.45 + col * 0.55
    for t in range(len(U)):
        for i in range(3):
            p, q = U[t][i], U[t][(i + 1) % 3]; n = int(max(abs(q[0] - p[0]), abs(q[1] - p[1]))) + 2
            s = np.linspace(0, 1, n); x = np.clip((p[0] + (q[0] - p[0]) * s).astype(int), 0, res - 1); y = np.clip((p[1] + (q[1] - p[1]) * s).astype(int), 0, res - 1)
            img[y, x, :3] = 0.15
    im = bpy.data.images.new('uvpng', res, res, alpha=True); im.pixels.foreach_set(img.ravel())   # (Blender images: row 0 = bottom = v 0)
    im.filepath_raw = path; im.file_format = 'PNG'; im.save(); bpy.data.images.remove(im)
    say('wrote %s (uv layout, area error green 0 -> red >= 20%%)' % os.path.relpath(path, ROOT))


def save_webp(img, path, quality):
    img.filepath_raw = path; img.file_format = 'WEBP'
    try: img.save(filepath=path, quality=quality)
    except TypeError: img.save()
    except RuntimeError as e:   # a bpy build without WebP: PNG, then ffmpeg when there is one
        say('WebP save failed (%s), PNG + ffmpeg' % e); png = path[:-5] + '.png'; img.file_format = 'PNG'; img.filepath_raw = png; img.save()
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', png] + (['-lossless', '1'] if quality >= 100 else ['-quality', str(quality)]) + [path], check=True); os.remove(png)
    say('wrote %s %d bytes' % (os.path.relpath(path, ROOT), os.path.getsize(path)))


def multicolour(o):
    """Image textures feeding the material, or several materials of clearly different colour."""
    cols = []
    for s in o.material_slots:
        m = s.material
        if not m: continue
        if m.use_nodes:
            if any(n.type == 'TEX_IMAGE' and n.image for n in m.node_tree.nodes): return True
            b = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            cols.append(tuple(b.inputs['Base Color'].default_value)[:3] if b else tuple(m.diffuse_color)[:3])
        else: cols.append(tuple(m.diffuse_color)[:3])
    return any(max(abs(a - b) for a, b in zip(c, cols[0])) > 0.08 for c in cols[1:])


def write_glb(path, gid, lo, RP, W, RM, extras):
    """lo: the low object (its loop normals / tangents / uv, in the pose RP was unskinned from; RM = per-vertex rest rotation, None = I)."""
    me = lo.data; me.calc_loop_triangles(); me.calc_tangents(); r3 = lo.matrix_world.to_3x3().normalized(); uvl = me.uv_layers.active.data
    bones = sorted({g for w in W for g, _ in w})
    if len(bones) > 255: raise SystemExit('too many bones for uint8 joints')
    key, VP, VN, VT, VU, VJ, VW, IDX = {}, [], [], [], [], [], [], []
    for t in me.loop_triangles:
        for vi, li in zip(t.vertices, t.loops):
            L = me.loops[li]; u = tuple(uvl[li].uv); R = RM[vi] if RM else Matrix.Identity(3); n = (R @ (r3 @ L.normal)).normalized()
            k = (vi, round(u[0], 5), round(u[1], 5), round(n.x, 2), round(n.y, 2), round(n.z, 2))
            if k not in key:
                key[k] = len(VP); VP.append(gl(RP[vi])); VN.append(gl(n))
                tg = R @ (r3 @ L.tangent); tg = (tg - n * tg.dot(n)).normalized(); VT.append(gl(tg) + (L.bitangent_sign,))
                VU.append((min(max(u[0], 0), 1), min(max(1 - u[1], 0), 1)))   # glTF: v runs down
                w = W[vi] + [(W[vi][0][0], 0.0)] * (4 - len(W[vi])); VJ.append([bones.index(g) for g, _ in w]); VW.append([x for _, x in w])
            IDX.append(key[k])
    nv = len(VP)
    if nv > 65535: raise SystemExit('%d verts: too many for uint16 indices' % nv)
    mn = [min(p[a] for p in VP) for a in range(3)]; mx = [max(p[a] for p in VP) for a in range(3)]
    ctr = [(a + b) / 2 for a, b in zip(mn, mx)]; half = max((b - a) / 2 for a, b in zip(mn, mx)) * 1.0001
    q16 = lambda x: max(-32767, min(32767, round(x * 32767))); q8 = lambda x: max(-127, min(127, round(x * 127)))
    QP = [[q16((p[a] - ctr[a]) / half) for a in range(3)] for p in VP]
    bin_, views, accs = bytearray(), [], []

    def view(data, target, stride=None):
        while len(bin_) % 4: bin_.append(0)
        v = {'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data), 'target': target}
        if stride: v['byteStride'] = stride
        bin_.extend(data); views.append(v); return len(views) - 1

    def acc(vw, ctype, typ, count, norm=False, mn=None, mx=None):
        a = {'bufferView': vw, 'componentType': ctype, 'type': typ, 'count': count}
        if norm: a['normalized'] = True
        if mn is not None: a['min'], a['max'] = mn, mx
        accs.append(a); return len(accs) - 1

    BYTE, UBYTE, SHORT, USHORT, AB, EAB = 5120, 5121, 5122, 5123, 34962, 34963
    attrs = {
        'POSITION': acc(view(b''.join(struct.pack('<3hxx', *q) for q in QP), AB, 8), SHORT, 'VEC3', nv, True, [min(q[a] for q in QP) for a in range(3)], [max(q[a] for q in QP) for a in range(3)]),
        'NORMAL': acc(view(b''.join(struct.pack('<3bx', *map(q8, n)) for n in VN), AB, 4), BYTE, 'VEC3', nv, True),
        'TANGENT': acc(view(b''.join(struct.pack('<4b', *map(q8, t[:3]), 127 if t[3] >= 0 else -127) for t in VT), AB), BYTE, 'VEC4', nv, True),
        'TEXCOORD_0': acc(view(b''.join(struct.pack('<2H', round(u * 65535), round(v * 65535)) for u, v in VU), AB), USHORT, 'VEC2', nv, True),
        'JOINTS_0': acc(view(b''.join(struct.pack('<4B', *j) for j in VJ), AB), UBYTE, 'VEC4', nv),
    }
    WQ = []
    for w in VW:   # uint8 weights summing to exactly 255
        q = [round(x * 255) for x in w]; q[0] += 255 - sum(q); WQ.append(q)
    attrs['WEIGHTS_0'] = acc(view(b''.join(struct.pack('<4B', *q) for q in WQ), AB), UBYTE, 'VEC4', nv, True)
    ind = acc(view(struct.pack('<%dH' % len(IDX), *IDX), EAB), USHORT, 'SCALAR', len(IDX))
    while len(bin_) % 4: bin_.append(0)
    doc = {
        'asset': {'version': '2.0', 'generator': 'tools/assets/cloth/garment.py'},
        'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'name': gid, 'mesh': 0, 'translation': ctr, 'scale': [half] * 3}],   # dequantisation: int16 / 32767 * half + ctr (metres)
        'meshes': [{'name': gid, 'primitives': [{'attributes': attrs, 'indices': ind, 'mode': 4, 'extras': {'bones': bones}}],   # JOINTS_0 indexes this list
                    'extras': dict(extras, src=SRC, pose='bind A-pose', frame='metres, Y-up; game body geometry = 100 * (x, -z, y)')}],
        'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
    }
    js = json.dumps(doc, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
    open(path, 'wb').write(glb)
    say('wrote %s: %d bytes, %d verts, %d tris, %d bones' % (os.path.relpath(path, ROOT), len(glb), nv, len(IDX) // 3, len(bones)))
    return len(IDX) // 3, len(glb)


def light_mesh(gid, lo, RP, W, target):
    """The rest-pose mesh thinned by Decimate (collapse, uv seams delimited: the same normal map fits) -> its RP, W."""
    me = lo.data; uvl = me.uv_layers.active.data
    o = bpy.data.objects.new(gid + '_lomesh', bpy.data.meshes.new(gid + '_lomesh')); bpy.context.collection.objects.link(o)
    polys = [list(p.vertices) for p in me.polygons]; o.data.from_pydata([tuple(p) for p in RP], [], polys); o.data.update()
    uvn = o.data.uv_layers.new(name='UVMap')
    li = 0
    for p in me.polygons:
        for l in p.loop_indices: uvn.data[li].uv = uvl[l].uv; li += 1
    VG = {}
    for i, w in enumerate(W):
        for g, x in w:
            if g not in VG: VG[g] = o.vertex_groups.new(name=g)
            VG[g].add([i], x, 'REPLACE')
    select_only(o); bpy.ops.object.shade_smooth()
    ntri = sum(len(p) - 2 for p in polys); ratio = min(1.0, target / max(ntri, 1) * 0.98)
    for _ in range(6):
        dm = o.modifiers.new('dec', 'DECIMATE'); dm.decimate_type = 'COLLAPSE'; dm.ratio = ratio; dm.use_collapse_triangulate = True; dm.delimit = {'SEAM', 'UV'}
        dg = bpy.context.evaluated_depsgraph_get(); e = o.evaluated_get(dg); m = e.to_mesh(); m.calc_loop_triangles(); n = len(m.loop_triangles); e.to_mesh_clear()
        if n <= target: break
        o.modifiers.remove(dm); ratio *= target / n * 0.97
    lo2 = mesh_copy(o, gid + '_lo'); names = [g.name for g in o.vertex_groups]
    for g in names: lo2.vertex_groups.new(name=g)
    RP2 = [v.co.copy() for v in lo2.data.vertices]; W2 = []
    for v in lo2.data.vertices:
        top = sorted(((names[g.group], g.weight) for g in v.groups if g.weight > 1e-4), key=lambda e: -e[1])[:4]; s = sum(x for _, x in top)
        W2.append([(g, x / s) for g, x in top] if s > 0 else W[0][:1])
    bpy.data.objects.remove(o)
    return lo2, RP2, W2


# —— the registry ——
def reg_load():
    try: return json.load(open(REG))
    except (OSError, ValueError): return {'v': 1, 'items': []}


def meta_of(gid, low, old):
    cli = json.loads(A.meta or '{}'); m = {}
    for k in ('cat', 'name', 'price', 'colors', 'rigid', 'item', 'base', 'tags', 'nat'):
        src = 'default'
        if k in cli: v, src = cli[k], '--meta'
        elif low is not None and k in low.keys(): v, src = low[k], 'custom property'
        elif k in old: v, src = old[k], 'items.json'
        elif k == 'name': v = gid
        elif k in DEFAULT: v = DEFAULT[k]
        else: continue
        if hasattr(v, 'to_dict'): v = v.to_dict()
        elif hasattr(v, 'to_list'): v = v.to_list()
        if k in ('colors', 'tags') and isinstance(v, str): v = [s.strip() for s in v.split(',') if s.strip()]
        if k == 'nat' and isinstance(v, str): v = json.loads(v)
        if k == 'price': v = int(v)
        m[k] = v
        if src == 'default' and k in ('cat', 'name', 'price', 'colors'): warn('%s: no "%s" (custom property of %s_low) -> %r' % (gid, k, gid, v))
    if m['cat'] not in CATS: raise SystemExit('%s: cat %r is not one of %s' % (gid, m['cat'], ', '.join(CATS)))
    if m['cat'] == 'head' and 'rigid' not in m: m['rigid'] = 'CC_Base_Head'; say('%s: head item -> rigid on CC_Base_Head' % gid)
    m.setdefault('item', gid)
    return m


def quad_low(hi, gid):
    lo = mesh_copy(hi, gid + '_quad'); select_only(lo)
    if A.sharp:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(A.sharp))
        bpy.ops.mesh.mark_sharp(); bpy.ops.object.mode_set(mode='OBJECT')
    try: r = bpy.ops.object.quadriflow_remesh(target_faces=A.faces, use_preserve_sharp=bool(A.sharp), use_mesh_symmetry=True, seed=0)
    except RuntimeError as e: r = {str(e)}
    if 'FINISHED' not in r or not len(lo.data.polygons) or len(lo.data.polygons) > A.faces * 2:
        warn('QuadriFlow failed: %s' % r); bpy.data.objects.remove(lo); return None
    while lo.data.uv_layers: lo.data.uv_layers.remove(lo.data.uv_layers[0])
    return lo


def prep(lo, m):
    select_only(lo); bpy.ops.object.shade_smooth()
    P, TRI, EDGES = evaluated(lo)
    W, loose = weights(P, EDGES, m['cat'], m.get('rigid'))
    if loose: warn('%d vertices found no %s bone under them -> weights from every bone' % (loose, m['cat']))
    RP, RM = unskin(P, W)
    return dict(obj=lo, P=P, TRI=TRI, EDGES=EDGES, W=W, RP=RP, RM=RM)


def bends(tag, c, cat):
    r = {k: bend_check(tag, k, c['RP'], c['TRI'], c['EDGES'], c['W']) for k in CAT_BENDS[cat]}
    return r, sum(x['flips'] for x in r.values())


def run(name, gid):
    say('—— %s -> %s ——' % (name, gid))
    hi, flo = pairs[name].get('high'), pairs[name].get('low')
    for o in (hi, flo):
        if o:
            for md in list(o.modifiers):
                if md.type == 'CLOTH': o.modifiers.remove(md)   # an unbaked cloth sim: a no-op at frame 0, it would only slow the bake
    reg = reg_load(); old = next((x for x in reg['items'] if x.get('id') == gid), {})
    m = meta_of(gid, flo, old); say('meta: %s' % json.dumps(m, ensure_ascii=False))
    # —— low poly: the file's, or a QuadriFlow remesh of the high one ——
    C = {}
    if flo and A.low in ('auto', 'file'): C['file'] = prep(mesh_copy(flo, gid + '_game'), m)
    if hi and (A.low == 'quad' or (A.low == 'auto' and not m.get('rigid')) or not flo):
        q = quad_low(hi, gid)
        if q: C['quad'] = prep(q, m)
    if not C: raise SystemExit('%s: no low poly (no _low, QuadriFlow failed)' % gid)
    B = {}
    for tag, c in C.items():
        say('%s: %d tris, %d verts' % (tag, len(c['TRI']), len(c['P']))); B[tag] = bends(tag, c, m['cat'])
    pick = 'file' if 'file' in C else 'quad'
    share = lambda t: B[t][1] / max(1, sum(x['tris'] for x in B[t][0].values()))   # flipped share of the triangles that bend
    lazy = flo and hi and (flo.data == hi.data or any(md.type == 'DECIMATE' for md in flo.modifiers))   # the high one thinned by a modifier: no retopo
    if A.low == 'quad' and 'quad' in C: pick = 'quad'
    elif A.low == 'auto' and 'quad' in C and 'file' in C:
        if lazy: pick = 'quad'; say('auto: %s_low is %s_high under a Decimate modifier (no retopo; its triangles crease and bake worse) -> QuadriFlow' % (name, name))
        elif B['file'][1] > 2 and share('file') > 1.5 * share('quad'):
            pick = 'quad'; say('auto: the file\'s low bends worse (%.1f%% flipped vs %.1f%%) -> QuadriFlow' % (100 * share('file'), 100 * share('quad')))
    G = C[pick]; lo = G['obj']; bend = B[pick][0]
    for tag, c in C.items():
        if c is not G: bpy.data.objects.remove(c['obj'])
    say('low poly: %s (%d tris)' % (pick, len(G['TRI'])))
    # —— UV ——
    m0 = uv_metrics(lo) if pick == 'file' else None
    uv_line('own', m0); how = 'own'
    if not m0 or uv_score(m0) > A.uv_max:
        if m0: say('own uv p95 %.1f%% > %.0f%%: re-unwrap' % (100 * uv_score(m0), 100 * A.uv_max)); own = uv_of(lo.data)
        how, m1 = unwrap(lo)
        if m0 and uv_score(m0) <= uv_score(m1):
            say('the own uv is still better: kept'); lo.data.uv_layers.active.data.foreach_set('uv', own.ravel()); how, m1 = 'own', m0
        uv_line('final (%s)' % how.lower(), m1)
    else: m1 = m0
    uv = {k: round(m1[k], 4) for k in ('p50', 'p95', 'max', 'side50', 'side95', 'sidemax')}; uv['how'] = how.lower(); uv['flip'] = m1['flip']
    if m0: uv['own'] = {k: round(m0[k], 4) for k in ('p50', 'p95', 'max', 'side95')}
    os.makedirs(PREVIEW, exist_ok=True); uv_png(lo, m1, os.path.join(PREVIEW, gid + '_uv.png'))
    # —— checks: penetration, the armature round trip ——
    P, TRI, W, RP, RM = G['P'], G['TRI'], G['W'], G['RP'], G['RM']
    ins = {'made': round(100 * inside(P, BVH_T), 2)}
    chk = bpy.data.objects.new('chk', bpy.data.meshes.new('chk')); bpy.context.collection.objects.link(chk)
    chk.data.from_pydata([tuple(p) for p in RP], [], [tuple(t) for t in TRI]); chk.data.update()
    VG = {}
    for i, w in enumerate(W):
        for g, x in w:
            if g not in VG: VG[g] = chk.vertex_groups.new(name=g)
            VG[g].add([i], x, 'REPLACE')
    am = chk.modifiers.new('arm', 'ARMATURE'); am.object = arm
    nd = [g for g in VG if g not in deform]
    if nd: warn('non-deform bones in the weights (the game skins them, the modifier does not):', nd)
    bpy.context.view_layer.update(); Q, _, _ = evaluated(chk); err = max((q - p).length for q, p in zip(Q, P))
    say('armature round trip (rest mesh re-posed onto the source): max error %.3f mm %s' % (1000 * err, 'OK' if err < 0.001 else 'FAIL (> 1 mm)'))
    arm.data.pose_position = 'REST'; bpy.context.view_layer.update(); BVA, BTA, BVH_A = body_now()
    ins['apose'] = round(100 * inside(RP, BVH_A), 2)
    bpy.data.objects.remove(chk); arm.data.pose_position = 'POSE'; bpy.context.view_layer.update()
    say('penetration: garment vertices inside the body — as made %.2f%%, bind A-pose %.2f%% %s' % (ins['made'], ins['apose'], 'OK' if max(ins.values()) < 1 else 'WARN (> 1%: the skin shows through)'))
    os.makedirs(WORK, exist_ok=True)
    with open(os.path.join(WORK, 'body_a.obj'), 'w') as f:   # the body in the bind A-pose, glTF frame (render.py checker)
        for v in BVA: f.write('v %.5f %.5f %.5f\n' % gl(v))
        for t in BTA: f.write('f %d %d %d\n' % (t[0] + 1, t[1] + 1, t[2] + 1))
    # —— bakes (as made: low and high coincide) ——
    files = {'glb': 'assets/cloth/%s.glb' % gid}; os.makedirs(OUT, exist_ok=True)
    mat = bpy.data.materials.new(gid + '_game'); mat.use_nodes = True; nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); bsdf.inputs['Base Color'].default_value = (0.85, 0.84, 0.8, 1)
    lo.data.materials.clear(); lo.data.materials.append(mat)
    if hi and not A.no_bake:
        sc = bpy.context.scene; sc.render.engine = 'CYCLES'; dev = 'CPU'
        try:
            cp = bpy.context.preferences.addons['cycles'].preferences
            for t in ('OPTIX', 'CUDA', 'METAL', 'HIP', 'ONEAPI'):
                try: cp.compute_device_type = t
                except TypeError: continue
                cp.get_devices(); gpus = [d for d in cp.devices if d.type != 'CPU']
                if gpus:
                    for d in cp.devices: d.use = d.type != 'CPU'
                    sc.cycles.device = 'GPU'; dev = t; break
        except Exception as e: say('(no GPU setup: %s)' % e)
        bk = sc.render.bake; bk.margin = 8; bk.use_selected_to_active = True; bk.cage_extrusion = A.cage; bk.max_ray_distance = A.ray; bk.normal_space = 'TANGENT'

        def bake(kind, nm, fill, samples, **kw):
            img = bpy.data.images.new(nm, A.res, A.res, alpha=False, float_buffer=False); img.colorspace_settings.name = 'Non-Color' if kind == 'NORMAL' else 'sRGB'
            img.pixels.foreach_set(list(fill) * (A.res * A.res))
            tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
            sc.cycles.samples = samples
            bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
            t0 = time.time(); bpy.ops.object.bake(type=kind, **kw); say('bake %s %d px: %s, %.1f s' % (kind, A.res, dev, time.time() - t0))
            nt.nodes.remove(tex); return img

        img = bake('NORMAL', gid + '_n', (0.5, 0.5, 1.0, 1.0), 1)
        px = np.empty(A.res * A.res * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(-1, 4)
        flat = np.mean((np.abs(px[:, 0] - 0.5) < 0.004) & (np.abs(px[:, 1] - 0.5) < 0.004) & (px[:, 2] > 0.996)); steep = np.mean(px[:, 2] < 0.75)
        say('normal map: texels flat %.1f%% (unbaked or truly flat), steep %.2f%% (rays that hit the wrong side; raise --cage / --ray if high)' % (100 * flat, 100 * steep))
        # the steep ones sit on the rims (hem, collar, cuffs: the ray from the fold of the low poly hits the other layer of the high one) and
        # light up blue-black in the game; a real fold of cloth never tilts > 41 deg off the surface -> flat
        bad = px[:, 2] < 0.75; px[bad] = (0.5, 0.5, 1.0, 1.0); img.pixels.foreach_set(px.ravel())
        say('normal map: %d steep texels set flat' % int(bad.sum()))
        save_webp(img, os.path.join(OUT, gid + '_n.webp'), 100); files['n'] = 'assets/cloth/%s_n.webp' % gid
        if multicolour(hi):
            img = bake('DIFFUSE', gid + '_c', (1, 1, 1, 1), 4, pass_filter={'COLOR'})
            save_webp(img, os.path.join(OUT, gid + '_c.webp'), 92); files['c'] = 'assets/cloth/%s_c.webp' % gid
            if 'colors' not in json.loads(A.meta or '{}') and not (flo and 'colors' in flo.keys()): m['colors'] = ['white']
            say('multi-colour high poly: colour baked; the palette tints it (white = as baked)')
        else: say('one-colour garment: dyed by the palette (no colour map)')
    elif not hi: warn('no %s_high: no normal map (the low poly is drawn flat)' % name)
    elif old.get('files', {}).get('n'): files['n'] = old['files']['n']
    # —— GLBs ——
    ext = {'low': pick, 'cat': m['cat']}
    tris, size = write_glb(os.path.join(OUT, gid + '.glb'), gid, lo, RP, W, RM, ext)
    if tris > A.lo_tris:
        lo2, RP2, W2 = light_mesh(gid, lo, RP, W, A.lo_tris)
        tl, sl = write_glb(os.path.join(OUT, gid + '_lo.glb'), gid, lo2, RP2, W2, None, dict(ext, light=True)); bpy.data.objects.remove(lo2)
        files['lo'] = 'assets/cloth/%s_lo.glb' % gid
    else: tl, sl = tris, size
    # —— registry ——
    e = dict(old); e.update(m); e.update({'id': gid, 'src': SRC, 'files': files, 'tris': tris, 'tris_lo': tl, 'kb': round(size / 1024), 'kb_lo': round(sl / 1024),
                                         'low': pick, 'uv': uv, 'inside': ins, 'bend': {k: v['flips'] for k, v in bend.items()}})
    reg = reg_load(); reg['items'] = [x for x in reg['items'] if x.get('id') != gid] + [e]; reg['items'].sort(key=lambda x: x['id'])
    with open(REG, 'w') as f: json.dump(reg, f, ensure_ascii=False, indent=1); f.write('\n')
    say('items.json: %s' % json.dumps({k: e[k] for k in ('id', 'item', 'cat', 'name', 'price', 'colors', 'tris', 'tris_lo')}, ensure_ascii=False))
    bpy.data.objects.remove(lo)
    return e


done =[run(n, g) for n, g in JOBS]
say('== report ==')
for e in done:
    u = e['uv']
    print('  %-10s %-6s %-22s tris %5d / lo %4d  %4d KB  uv(%s) area p95 %.1f%% sides p95 %.1f%%%s  inside %.2f%% / %.2f%%  flips %s' % (
        e['id'], e['cat'], e['name'], e['tris'], e['tris_lo'], e['kb'], u['how'], 100 * u['p95'], 100 * u['side95'],
        ' (own: %.1f%%)' % (100 * u['own']['p95']) if 'own' in u else '', e['inside']['made'], e['inside']['apose'], e['bend']))
if not A.no_render:
    for e in done:
        r = subprocess.run([sys.executable if os.path.basename(sys.executable).startswith('python') else 'python3', os.path.join(HERE, 'render.py'), 'checker', e['id']])
        if r.returncode: warn('render.py checker %s failed (playwright / chrome missing?)' % e['id'])
say('done; now: bash tools/check.sh (rebuilds index.html with the registry)')
