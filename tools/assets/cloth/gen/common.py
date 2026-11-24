"""Clothes generator, the shared part (issue 85). Blender (bpy) only; run the item scripts: python3 tools/assets/cloth/gen/police.py

   body      load_body(): tools/assets/cloth/user/tshirt_src.blend, CC_Base_Body under the armature CC3_Base_Plus put into REST
             (= the game's bind A-pose, metres, z up, the man faces -y, +x = his left), a BVH of it, bone heads, vertex groups.
   shells    Grid: a rows x columns sheet of quads (clean quads by construction), laid on the body by ray casts and pushed out to a
             wanted clearance (`clear`: no vertex nearer to the skin than its ease). Pieces of one item are joined into one mesh,
             welded where they share a seam line; details (pockets, buttons, ...) are their own islands of the same object.
   uv        seams = the borders of the panels (real seam lines: sides, shoulders, armholes, inseam, the edges of the details),
             unwrap: Minimum Stretch (SLIM) started from Angle Based, islands scaled to one texel density, packed with a margin.
             uv_metric(): per triangle the area ratio 3D : UV and the three edge-length ratios, after one global normalisation.
   weights   from the body: nearest surface point, barycentric blend of the face's vertex groups ("nearest face interpolated"),
             the 4 biggest kept and normalised; rigid details: 100 % one bone.
   textures  Paint: a float canvas (numpy) drawn in uv space -> base colour + height -> normal map, saved as WebP.
   export    write_glb(): Y-up, metres, KHR_mesh_quantization, JOINTS_0 -> primitive.extras.bones (CC_Base_* names), COLOR_0.r = the
             dye mask (1 = cloth that takes the item's colour, 0 = a detail with its own colour) — read by src/game/04j_cloth_asset.js."""
import bpy, bmesh, json, math, os, struct, subprocess, sys, time
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
SRC = os.path.join(HERE, '..', 'user', 'tshirt_src.blend'); OUT = os.path.join(ROOT, 'assets', 'cloth'); PREVIEW = os.path.join(HERE, 'preview')
T0 = time.time()


def say(*a): print('[gen %5.1fs]' % (time.time() - T0), *a, flush=True)


def smooth(t, a=0.0, b=1.0):
    t = min(1.0, max(0.0, (t - a) / (b - a))) if b != a else float(t >= a); return t * t * (3 - 2 * t)


def lerp(a, b, t): return a + (b - a) * t


# ───────────────────────── body ─────────────────────────
class Body:
    pass


def load_body():
    bpy.ops.wm.open_mainfile(filepath=SRC)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); body = bpy.data.objects['CC_Base_Body']
    arm.data.pose_position = 'REST'; bpy.context.view_layer.update()   # the bind A-pose of the game
    dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg); me = ev.to_mesh()
    B = Body(); B.arm = arm; B.obj = body; B.me = me; mw = body.matrix_world
    B.V = [mw @ v.co for v in me.vertices]; B.F = [tuple(p.vertices) for p in me.polygons]
    B.gname = {g.index: g.name for g in body.vertex_groups}
    B.W = [{B.gname[g.group]: g.weight for g in v.groups if g.weight > 1e-4 and B.gname[g.group].startswith('CC_Base_')} for v in me.vertices]
    B.bvh = BVHTree.FromPolygons(B.V, B.F)
    amw = arm.matrix_world
    B.bone = lambda n, tail=False: amw @ (arm.data.bones[n].tail_local if tail else arm.data.bones[n].head_local)
    return B


def part_bvh(B, keep):
    """BVH of the body faces whose strongest bone passes keep(name) (e.g. the trunk without the arms)."""
    top = [max(w, key=w.get) if w else '' for w in B.W]
    F = [f for f in B.F if sum(1 for i in f if keep(top[i])) * 2 > len(f)]
    return BVHTree.FromPolygons(B.V, F)


def far_hit(bvh, o, d, dist=1.0):
    """The LAST surface a ray leaves (the outer skin seen from inside), or None."""
    hit = None; p = Vector(o); left = dist
    for _ in range(12):
        loc, nrm, fi, t = bvh.ray_cast(p, d, left)
        if loc is None: break
        hit = loc; p = loc + d * 1e-4; left -= t + 1e-4
    return hit


def clear(P, bvh, ease, it=4, fixed=None):
    """Push the points P (list of Vector) out of the skin: none nearer to it than its ease (number or list), none under it."""
    n = len(P); ez = ease if isinstance(ease, (list, tuple)) else [ease] * n; moved = 0
    for _ in range(it):
        for i in range(n):
            if fixed and i in fixed: continue
            loc, nrm, fi, d = bvh.find_nearest(P[i])
            if loc is None: continue
            s = (P[i] - loc).dot(nrm)
            if s < ez[i]:
                P[i] = P[i] + nrm * (ez[i] - s) if s > -0.03 and d < 0.05 else loc + nrm * ez[i]; moved += 1
    return moved


def min_gap(P, bvh):
    """(smallest signed distance to the skin, share of points under it)."""
    g = []
    for p in P:
        loc, nrm, fi, d = bvh.find_nearest(p); g.append((p - loc).dot(nrm))
    return min(g), sum(1 for x in g if x < 0) / len(g)


# ───────────────────────── mesh building ─────────────────────────
class Build:
    """Collects the pieces of one item: verts, quads / tris, per-vertex dye mask, rigid bone, the uv island of every face."""
    def __init__(s, name):
        s.name = name; s.V = []; s.F = []; s.isl = []; s.mask = []; s.rigid = []; s.ease = []; s.key = {}; s.parts = {}; s.cuts = set(); s.fixed = set(); s.out = {}

    def vert(s, p, mask=1.0, rigid=None, ease=0.004, weld=None):
        """weld: a hashable key — the same key gives the same vertex (a seam line shared by two panels)."""
        if weld is not None and weld in s.key: return s.key[weld]
        s.V.append(Vector(p)); s.mask.append(mask); s.rigid.append(rigid); s.ease.append(ease)
        if weld is not None: s.key[weld] = len(s.V) - 1
        return len(s.V) - 1

    def grid(s, part, pts, mask=1.0, rigid=None, ease=0.004, weld=None, flip=False, closed=False, skip=None, use=None):
        """pts[r][c] -> quads; weld(r, c) -> key or None; closed: the last column joins the first (a tube; its uv seam is at column 0).
           skip(r, c) -> True drops the quad whose lower-left corner is (r, c). Returns the vertex index table."""
        R, Cn = len(pts), len(pts[0]); ez = ease if callable(ease) else (lambda r, c: ease)   # part / ease may be functions of (r, c); use: {(r, c): an existing vertex}
        ix = [[use[(r, c)] if use and (r, c) in use else s.vert(pts[r][c], mask, rigid, ez(r, c), weld(r, c) if weld else None) for c in range(Cn)] for r in range(R)]
        f0 = len(s.F); name = part if callable(part) else (lambda r, c: part)
        if closed: s.cuts.update((min(ix[r][0], ix[r + 1][0]), max(ix[r][0], ix[r + 1][0])) for r in range(R - 1))   # a tube's uv seam
        for r in range(R - 1):
            for c in range(Cn if closed else Cn - 1):
                if skip and skip(r, c): continue
                c1 = (c + 1) % Cn; q = (ix[r][c], ix[r][c1], ix[r + 1][c1], ix[r + 1][c])
                if len(set(q)) < 3: continue
                q = tuple(dict.fromkeys(q))
                s.F.append(q[::-1] if flip else q); s.isl.append(name(r, c))
        return ix

    def faces(s, part, fs):
        f0 = len(s.F)
        for f in fs: s.F.append(tuple(f)); s.isl.append(part)
        s.parts.setdefault(part, []).extend(range(f0, len(s.F)))

    def box(s, part, ctr, ax, ay, az, hx, hy, hz, mask=0.0, rigid=None, bevel=0.0, open_back=True):
        """A box (optionally with a chamfered front) at ctr with the unit axes ax, ay, az (az = out of the body); the back face is left out."""
        ctr = Vector(ctr); k = 1 - bevel
        def P(x, y, z): return ctr + ax * x * hx + ay * y * hy + az * z * hz
        ring0 = [P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1)]; ring1 = [P(-1, -1, k), P(1, -1, k), P(1, 1, k), P(-1, 1, k)]
        ring2 = [P(-k, -k, 1), P(k, -k, 1), P(k, k, 1), P(-k, k, 1)] if bevel else None
        f0 = len(s.F); a = [s.vert(p, mask, rigid, 0) for p in ring0]
        rings = [ring1] + ([ring2] if ring2 else [])
        for rg in rings:
            b = [s.vert(p, mask, rigid, 0) for p in rg]
            for i in range(4): s.F.append((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i])); s.isl.append(part + ('_s%d' % i))
            a = b
        s.fixed.update([part + '_f', part + '_b'] + [part + '_s%d' % i for i in range(4)])
        s.F.append(tuple(a)); s.isl.append(part + '_f')
        if not open_back:
            b = [s.vert(p, mask, rigid, 0) for p in ring0]; s.F.append(tuple(b[::-1])); s.isl.append(part + '_b')
        s.parts.setdefault(part, []).extend(range(f0, len(s.F)))

    def disc(s, part, ctr, ax, ay, az, r, h, n=8, mask=0.0, rigid=None):
        """A button / badge: a low cylinder with a cap, axis az."""
        ctr = Vector(ctr); f0 = len(s.F)
        a = [s.vert(ctr + (ax * math.cos(i * 2 * math.pi / n) + ay * math.sin(i * 2 * math.pi / n)) * r, mask, rigid, 0) for i in range(n)]
        b = [s.vert(ctr + (ax * math.cos(i * 2 * math.pi / n) + ay * math.sin(i * 2 * math.pi / n)) * r * 0.82 + az * h, mask, rigid, 0) for i in range(n)]
        for i in range(n): s.F.append((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])); s.isl.append(part + '_s')
        s.cuts.add((min(a[0], b[0]), max(a[0], b[0]))); s.fixed.update([part + '_s', part + '_f'])
        c = [s.vert(ctr + (ax * math.cos(i * 2 * math.pi / n) + ay * math.sin(i * 2 * math.pi / n)) * r * 0.82 + az * h, mask, rigid, 0) for i in range(n)]
        s.F.append(tuple(c)); s.isl.append(part + '_f')
        s.parts.setdefault(part, []).extend(range(f0, len(s.F)))

    def tris(s): return sum(len(f) - 2 for f in s.F)


def surf_frame(B, bvh, p, up=Vector((0, 0, 1))):
    """Nearest skin point to p and a frame on it: (point, ax = across, ay = up along the surface, az = out)."""
    loc, nrm, fi, d = bvh.find_nearest(Vector(p)); az = nrm.normalized(); ax = up.cross(az)
    if ax.length < 1e-4: ax = Vector((1, 0, 0)).cross(az)
    ax.normalize(); ay = az.cross(ax).normalized(); return loc, ax, ay, az


def to_object(b):
    me = bpy.data.meshes.new(b.name); me.from_pydata([tuple(v) for v in b.V], [], b.F); me.update()
    ob = bpy.data.objects.new(b.name, me); bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    return ob


# ───────────────────────── uv ─────────────────────────
def unwrap(ob, b, margin=0.004, slim_iter=60):
    """Seams on the island borders, Angle Based start, Minimum Stretch refinement, one texel density, pack. Returns {island: [faces]}."""
    me = ob.data; bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    isl = b.isl; fe = {}
    for p in me.polygons:
        for k in p.edge_keys: fe.setdefault(k, []).append(p.index)
    seams = 0
    for e in me.edges:
        fs = fe.get(e.key, [])
        if len(fs) == 2 and isl[fs[0]] != isl[fs[1]]: e.use_seam = True; seams += 1
        if len(fs) == 2 and isl[fs[0]] == isl[fs[1]] and (min(e.key), max(e.key)) in b.cuts: e.use_seam = True; seams += 1
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=margin)
    how = 'ANGLE_BASED'
    try:
        bpy.ops.uv.unwrap(method='MINIMUM_STRETCH', iterations=slim_iter, no_flip=True, margin=margin); how = 'MINIMUM_STRETCH (SLIM, %d iterations)' % slim_iter
    except Exception as e:
        say('Minimum Stretch not available here (%s): Angle Based + minimize_stretch' % str(e).strip()[:80])
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    try: bpy.ops.uv.pack_islands(rotate=True, rotate_method='AXIS_ALIGNED', margin_method='FRACTION', margin=margin * 2, shape_method='AABB')
    except TypeError: bpy.ops.uv.pack_islands(rotate=True, margin=margin * 2)
    bpy.ops.object.mode_set(mode='OBJECT')
    say('uv: %d seam edges, unwrap %s, islands averaged + packed' % (seams, how))


def uv_metric(ob, tag=''):
    """Per triangle: 3D area : uv area and the 3 edge lengths 3D : uv, each normalised by the mesh-wide ratio (total area / total length).
       Deviation of a triangle = max(|area ratio - 1|, |edge ratios - 1|). Prints the percentiles, returns them."""
    me = ob.data; me.calc_loop_triangles(); uv = me.uv_layers.active.data; V = me.vertices
    A3, A2, L3, L2 = [], [], [], []
    for t in me.loop_triangles:
        p = [V[i].co for i in t.vertices]; q = [uv[l].uv.copy() for l in t.loops]
        a3 = (p[1] - p[0]).cross(p[2] - p[0]).length / 2; a2 = abs((q[1] - q[0]).cross(q[2] - q[0])) / 2
        if a3 < 1e-10: continue
        A3.append(a3); A2.append(a2); L3.append([(p[(i + 1) % 3] - p[i]).length for i in range(3)]); L2.append([(q[(i + 1) % 3] - q[i]).length for i in range(3)])
    A3, A2, L3, L2 = map(np.array, (A3, A2, L3, L2))
    ka = A2.sum() / A3.sum(); kl = math.sqrt(ka)   # one scale for the whole item: the texel density
    da = np.abs(A2 / (A3 * ka) - 1); dl = np.abs(L2 / (np.maximum(L3, 1e-9) * kl) - 1).max(axis=1); d = np.maximum(da, dl)
    r = {'tris': len(d), 'area_p95': float(np.percentile(da, 95)), 'area_max': float(da.max()), 'len_p95': float(np.percentile(dl, 95)), 'len_max': float(dl.max()),
         'p50': float(np.percentile(d, 50)), 'p95': float(np.percentile(d, 95)), 'max': float(d.max()), 'texel': 1 / kl}
    ok = r['p95'] <= 0.05 and r['max'] <= 0.15
    say('UV distortion %s: %d tris | area p95 %.1f%% max %.1f%% | edge length p95 %.1f%% max %.1f%% | both: p50 %.1f%% p95 %.1f%% max %.1f%% -> %s (target p95 <= 5%%, max <= 15%%) | 1 uv unit = %.2f m'
        % (tag, r['tris'], 100 * r['area_p95'], 100 * r['area_max'], 100 * r['len_p95'], 100 * r['len_max'], 100 * r['p50'], 100 * r['p95'], 100 * r['max'], 'OK' if ok else 'OVER', r['texel']))
    r['ok'] = ok; return r


def island_boxes(ob, b):
    """uv bounding box of every island name: {name: (u0, v0, u1, v1)}, and per face-corner uv access."""
    me = ob.data; uv = me.uv_layers.active.data; bx = {}
    for p in me.polygons:
        k = b.isl[p.index]; q = bx.setdefault(k, [9, 9, -9, -9])
        for l in p.loop_indices:
            u = uv[l].uv; q[0] = min(q[0], u.x); q[1] = min(q[1], u.y); q[2] = max(q[2], u.x); q[3] = max(q[3], u.y)
    return bx


# ───────────────────────── weights ─────────────────────────
def weights(B, b, keep=None, bvh=None, smooth_it=2):
    """Per vertex [(bone, w)] <= 4, normalised: from the nearest body face (barycentric), rigid verts 100 % their bone."""
    bvh = bvh or B.bvh; W = []
    for i, p in enumerate(b.V):
        if b.rigid[i]: W.append({b.rigid[i]: 1.0}); continue
        loc, nrm, fi, d = bvh.find_nearest(p); f = B.F[fi]; acc = {}
        # barycentric weights on the polygon: inverse-distance to its corners over the nearest point (exact on triangles' corners, smooth inside)
        ds = [max((B.V[v] - loc).length, 1e-6) for v in f]; ws = [1 / x ** 2 for x in ds]; sm = sum(ws)
        for v, wv in zip(f, ws):
            for g, x in B.W[v].items():
                if keep is None or keep(g): acc[g] = acc.get(g, 0) + x * wv / sm
        W.append(acc)
    # a light Laplacian over the cloth's own edges: cloth bridges the creases of the body, its weights should not jump there
    nb = [set() for _ in b.V]
    for f in b.F:
        for k in range(len(f)): nb[f[k]].add(f[(k + 1) % len(f)]); nb[f[(k + 1) % len(f)]].add(f[k])
    for _ in range(smooth_it):
        W2 = []
        for i, w in enumerate(W):
            if b.rigid[i] or not nb[i]: W2.append(w); continue
            acc = {g: x * 0.5 for g, x in w.items()}; soft = [j for j in nb[i] if not b.rigid[j]] or [i]
            for j in soft:
                for g, x in W[j].items(): acc[g] = acc.get(g, 0) + 0.5 * x / len(soft)
            W2.append(acc)
        W = W2
    out = []
    for w in W:
        top = sorted(w.items(), key=lambda kv: -kv[1])[:4]; sm = sum(x for _, x in top) or 1.0
        out.append([(g, x / sm) for g, x in top] if top else [('CC_Base_Hip', 1.0)])
    return out


# ───────────────────────── painting (uv space, numpy) ─────────────────────────
class Paint:
    """RGB colour + height canvases, y up like uv. Colours 0..1 sRGB."""
    def __init__(s, res=1024, base=(0.8, 0.8, 0.8)):
        s.n = res; s.c = np.empty((res, res, 3), np.float32); s.c[:] = base; s.h = np.full((res, res), 0.5, np.float32); s.m = np.ones((res, res), np.float32)   # m: the dye mask (1 = takes the item's colour)
        yy, xx = np.mgrid[0:res, 0:res]; s.u = (xx + 0.5) / res; s.v = (yy + 0.5) / res

    def px(s, u0, v0, u1, v1):
        n = s.n; return max(0, int(math.floor(min(u0, u1) * n))), max(0, int(math.floor(min(v0, v1) * n))), min(n, int(math.ceil(max(u0, u1) * n))), min(n, int(math.ceil(max(v0, v1) * n)))

    def rect(s, box, col=None, h=None, a=1.0):
        x0, y0, x1, y1 = s.px(*box)
        if x1 <= x0 or y1 <= y0: return
        if col is not None: s.c[y0:y1, x0:x1] = s.c[y0:y1, x0:x1] * (1 - a) + np.array(col, np.float32) * a
        if h is not None: s.h[y0:y1, x0:x1] = h

    def tri(s, a, b, c, col=None, h=None, mask=None, grow=1.5):
        n = s.n; g = grow / n; x0, y0, x1, y1 = s.px(min(a[0], b[0], c[0]) - g, min(a[1], b[1], c[1]) - g, max(a[0], b[0], c[0]) + g, max(a[1], b[1], c[1]) + g)
        ar = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if x1 <= x0 or y1 <= y0 or abs(ar) < 1e-12: return
        U = s.u[y0:y1, x0:x1]; Vv = s.v[y0:y1, x0:x1]; sg = 1 if ar > 0 else -1; ins = np.ones(U.shape, bool)
        for p, q in ((a, b), (b, c), (c, a)):
            L = math.hypot(q[0] - p[0], q[1] - p[1]) or 1e-9; ins &= ((q[0] - p[0]) * (Vv - p[1]) - (q[1] - p[1]) * (U - p[0])) * sg / L > -g
        if col is not None: s.c[y0:y1, x0:x1][ins] = np.array(col, np.float32)
        if h is not None: s.h[y0:y1, x0:x1][ins] = h
        if mask is not None: s.m[y0:y1, x0:x1][ins] = mask

    def fill(s, ob, faces, col=None, h=None, mask=None, grow=1.5):
        """Fill the uv triangles of the given faces."""
        me = ob.data; uv = me.uv_layers.active.data
        for fi in faces:
            q = [tuple(uv[l].uv) for l in me.polygons[fi].loop_indices]
            for k in range(1, len(q) - 1): s.tri(q[0], q[k], q[k + 1], col, h, mask, grow)

    def frame(s, box, w, col=None, h=None, a=1.0):
        u0, v0, u1, v1 = box
        for q in ((u0, v0, u1, v0 + w), (u0, v1 - w, u1, v1), (u0, v0, u0 + w, v1), (u1 - w, v0, u1, v1)): s.rect(q, col, h, a)

    def stitch(s, p, q, col=None, dash=0.006, w=0.0012, h=0.62, groove=0.42):
        """A row of stitches from p to q (uv): a pressed groove with raised dashes."""
        (u0, v0), (u1, v1) = p, q; L = math.hypot(u1 - u0, v1 - v0)
        if L < 1e-6: return
        x0, y0, x1, y1 = s.px(min(u0, u1) - 3 * w, min(v0, v1) - 3 * w, max(u0, u1) + 3 * w, max(v0, v1) + 3 * w)
        U = s.u[y0:y1, x0:x1]; Vv = s.v[y0:y1, x0:x1]; tx, ty = (u1 - u0) / L, (v1 - v0) / L
        t = (U - u0) * tx + (Vv - v0) * ty; d = np.abs((U - u0) * -ty + (Vv - v0) * tx); on = (t >= 0) & (t <= L)
        g = on & (d < 2.2 * w); s.h[y0:y1, x0:x1][g] = np.minimum(s.h[y0:y1, x0:x1][g], groove)
        m = on & (d < w) & ((t / dash) % 1.0 < 0.62); s.h[y0:y1, x0:x1][m] = h
        if col is not None: s.c[y0:y1, x0:x1][m] = np.array(col, np.float32)
        else: s.c[y0:y1, x0:x1][g] *= 0.86; s.c[y0:y1, x0:x1][m] *= 1.2   # dyed thread: only shade

    def stitch_box(s, box, inset, **k):
        u0, v0, u1, v1 = box; u0 += inset; v0 += inset; u1 -= inset; v1 -= inset
        for p, q in (((u0, v0), (u1, v0)), ((u1, v0), (u1, v1)), ((u1, v1), (u0, v1)), ((u0, v1), (u0, v0))): s.stitch(p, q, **k)

    def weave(s, mask=None, scale=420.0, amp=0.03, seed=3):
        """Fabric relief: a twill-like weave + fine noise, in the height map only (and a faint shade in the colour)."""
        rs = np.random.RandomState(seed); w = (np.sin((s.u + s.v) * scale * math.pi) * 0.5 + np.sin((s.u - s.v) * scale * 0.5 * math.pi) * 0.25) * amp + (rs.rand(s.n, s.n).astype(np.float32) - 0.5) * amp
        if mask is None: mask = np.ones((s.n, s.n), bool)
        s.h[mask] += w[mask]; s.c[mask] *= (1 + w[mask] * 0.8)[:, None]

    def text(s, box, txt, col, h=None, font=None, rot=0):
        """Text fitted into the uv box, rasterised by Blender's blf into an offscreen-free bitmap: a tiny 5x7 fallback font is used
           when blf cannot draw headless."""
        glyphs = FONT5; u0, v0, u1, v1 = box; n = len(txt); cw = (u1 - u0) / (n * 6 - 1); ch = (v1 - v0) / 7
        for i, chh in enumerate(txt):
            g = glyphs.get(chh)
            if not g: continue
            for r, row in enumerate(g):
                for c2 in range(5):
                    if row >> (4 - c2) & 1:
                        q = (u0 + (i * 6 + c2) * cw, v1 - (r + 1) * ch, u0 + (i * 6 + c2 + 1) * cw, v1 - r * ch); s.rect(q, col, h)

    def normal(s, strength=6.0):
        h = s.h; dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength; dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
        n = np.dstack((-dx, -dy, np.ones_like(h))); n /= np.linalg.norm(n, axis=2, keepdims=True); return n * 0.5 + 0.5

    def save(s, path, rgb=None, quality=90):
        """rgb: (n, n, 3) 0..1, y up. WebP through Blender's image writer."""
        a = s.c if rgb is None else rgb; n = a.shape[0]; img = bpy.data.images.new(os.path.basename(path), n, n, alpha=False)
        img.colorspace_settings.name = 'Non-Color'   # bytes written as given: the arrays here already hold the wanted sRGB / data values
        buf = np.ones((n, n, 4), np.float32); buf[:, :, :3] = np.clip(a, 0, 1)
        img.pixels.foreach_set(buf.ravel()); img.filepath_raw = path; img.file_format = 'WEBP'
        try: img.save(filepath=path, quality=quality)
        except Exception as e:
            say('WebP writer failed (%s): PNG + ffmpeg' % e); png = path[:-5] + '.png'; img.file_format = 'PNG'; img.filepath_raw = png; img.save()
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', png, '-quality', str(quality), path], check=True); os.remove(png)
        bpy.data.images.remove(img)
        say('wrote %s %d bytes' % (os.path.relpath(path, ROOT), os.path.getsize(path)))


# 5x7 capitals (rows top to bottom, 5 bits) — enough for the chevrons; Cyrillic П О Л И Ц Я and Latin
FONT5 = {
    'П': [31, 17, 17, 17, 17, 17, 17], 'О': [14, 17, 17, 17, 17, 17, 14], 'Л': [7, 9, 9, 9, 9, 9, 17], 'И': [17, 17, 19, 21, 25, 17, 17],
    'Ц': [18, 18, 18, 18, 18, 31, 1], 'Я': [15, 17, 17, 15, 5, 9, 17], 'М': [17, 27, 21, 21, 17, 17, 17], 'В': [30, 17, 17, 30, 17, 17, 30], 'Д': [6, 10, 10, 10, 10, 31, 17],
    'Р': [30, 17, 17, 30, 16, 16, 16], 'С': [14, 17, 16, 16, 16, 17, 14], 'Н': [17, 17, 17, 31, 17, 17, 17], 'А': [14, 17, 17, 31, 17, 17, 17], 'Т': [31, 4, 4, 4, 4, 4, 4],
    'Е': [31, 16, 16, 30, 16, 16, 31], 'К': [17, 18, 20, 24, 20, 18, 17], 'У': [17, 17, 17, 15, 1, 17, 14], ' ': [0] * 7,
}


# ───────────────────────── export ─────────────────────────
def write_glb(ob, b, W, path, name):
    me = ob.data; me.calc_loop_triangles()
    try: me.calc_tangents()
    except Exception as e: say('calc_tangents:', e)
    uvl = me.uv_layers.active.data; bones = sorted({g for w in W for g, _ in w})
    gl = lambda v: (v.x, v.z, -v.y)   # Blender Z-up -> glTF Y-up
    key, VP, VN, VT, VU, VJ, VW, VC, IDX = {}, [], [], [], [], [], [], [], []
    for t in me.loop_triangles:
        for vi, li in zip(t.vertices, t.loops):
            L = me.loops[li]; u = tuple(uvl[li].uv); n = Vector(L.normal).normalized()
            k = (vi, round(u[0], 5), round(u[1], 5), round(n.x, 2), round(n.y, 2), round(n.z, 2))
            if k not in key:
                key[k] = len(VP); VP.append(gl(me.vertices[vi].co)); VN.append(gl(n))
                tg = Vector(L.tangent); tg = tg - n * tg.dot(n); tg = tg.normalized() if tg.length > 1e-6 else n.orthogonal().normalized(); VT.append(gl(tg) + (L.bitangent_sign,))
                VU.append((min(max(u[0], 0), 1), min(max(1 - u[1], 0), 1)))   # glTF: v runs down
                w = W[vi] + [(W[vi][0][0], 0.0)] * (4 - len(W[vi])); VJ.append([bones.index(g) for g, _ in w]); VW.append([x for _, x in w]); VC.append(b.mask[vi])
            IDX.append(key[k])
    nv = len(VP)
    if nv > 65535: raise SystemExit('%d verts: too many for uint16 indices' % nv)
    mn = [min(p[a] for p in VP) for a in range(3)]; mx = [max(p[a] for p in VP) for a in range(3)]
    ctr = [(a + c) / 2 for a, c in zip(mn, mx)]; half = max((c - a) / 2 for a, c in zip(mn, mx)) * 1.0001
    q16 = lambda x: max(-32767, min(32767, round(x * 32767))); q8 = lambda x: max(-127, min(127, round(x * 127)))
    QP = [[q16((p[a] - ctr[a]) / half) for a in range(3)] for p in VP]; bin_, views, accs = bytearray(), [], []

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
        'COLOR_0': acc(view(b''.join(struct.pack('<4B', round(c * 255), round(c * 255), round(c * 255), 255) for c in VC), AB), UBYTE, 'VEC4', nv, True),
    }
    WQ = []
    for w in VW:
        q = [round(x * 255) for x in w]; q[0] += 255 - sum(q); WQ.append(q)
    attrs['WEIGHTS_0'] = acc(view(b''.join(struct.pack('<4B', *q) for q in WQ), AB), UBYTE, 'VEC4', nv, True)
    ind = acc(view(struct.pack('<%dH' % len(IDX), *IDX), EAB), USHORT, 'SCALAR', len(IDX))
    while len(bin_) % 4: bin_.append(0)
    doc = {'asset': {'version': '2.0', 'generator': 'tools/assets/cloth/gen'}, 'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
           'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': name, 'mesh': 0, 'translation': ctr, 'scale': [half] * 3}],
           'meshes': [{'name': name, 'primitives': [{'attributes': attrs, 'indices': ind, 'mode': 4, 'extras': {'bones': bones}}],
                       'extras': {'pose': 'bind A-pose', 'frame': 'metres, Y-up; game body geometry = 100 * (x, -z, y)', 'COLOR_0': 'r = dye mask'}}],
           'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
    js = json.dumps(doc, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
    os.makedirs(os.path.dirname(path), exist_ok=True); open(path, 'wb').write(glb)
    mxb = max(len(w) for w in W)
    say('wrote %s: %d bytes (%s), %d verts, %d tris, %d bones, <= %d bones a vertex' % (os.path.relpath(path, ROOT), len(glb), 'OK' if len(glb) < 300 * 1024 else 'OVER 300 KB', nv, len(IDX) // 3, len(bones), mxb))
    return {'bytes': len(glb), 'verts': nv, 'tris': len(IDX) // 3}


# ───────────────────────── check render (checker / stripes) ─────────────────────────
def check_tex(kind, n=1024, cells=32):
    yy, xx = np.mgrid[0:n, 0:n]; a = np.empty((n, n, 4), np.float32); a[:, :, 3] = 1
    if kind == 'checker':
        m = ((xx * cells // n) + (yy * cells // n)) % 2; a[:, :, 0] = np.where(m, 0.9, 0.12); a[:, :, 1] = np.where(m, 0.9, 0.14); a[:, :, 2] = np.where(m, 0.88, 0.2)
        a[:, :, 0] += 0.25 * (xx / n) * (1 - m); a[:, :, 1] += 0.25 * (yy / n) * (1 - m)   # a tint by place: flipped / swapped islands show
    else:
        m = (yy * cells // n) % 2; a[:, :, 0] = np.where(m, 0.92, 0.1); a[:, :, 1] = np.where(m, 0.92, 0.2); a[:, :, 2] = np.where(m, 0.9, 0.45)
    img = bpy.data.images.new('chk_' + kind, n, n); img.pixels.foreach_set(a.ravel()); img.pack(); return img


def render_check(ob, B, path, views, kind='checker', res=(900, 900), body=True):
    """Workbench render of the item on the body with a test texture; views: [(name, eye, target)]. One sheet (views side by side)."""
    sc = bpy.context.scene; made = []
    try:
        sc.render.engine = 'BLENDER_WORKBENCH'; sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_cavity = False
        mat = bpy.data.materials.new('chk'); mat.use_nodes = True; nt = mat.node_tree; tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = check_tex(kind)
        nt.links.new(tex.outputs['Color'], next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color']); nt.nodes.active = tex
        ob.data.materials.clear(); ob.data.materials.append(mat)
        for o in bpy.data.objects: o.hide_render = not (o == ob or (body and o == B.obj))
        sc.render.resolution_x, sc.render.resolution_y = res; sc.render.film_transparent = False; sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88
        if sc.world is None: sc.world = bpy.data.worlds.new('w')
        tiles = []
        for name, eye, tgt in views:
            cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); made.append(cam)
            cam.location = eye; d = Vector(tgt) - Vector(eye); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 60; cam.data.clip_start = 0.02
            sc.camera = cam; p = path[:-4] + '-' + name + '.jpg'; sc.render.filepath = p; bpy.ops.render.render(write_still=True); tiles.append(p)
        say('check render (%s): %s' % (kind, ', '.join(os.path.relpath(t, ROOT) for t in tiles)))
        return tiles
    except Exception as e:
        say('check render failed headless (%s) — look at it in the game: docs/audit/scenarios/police.js' % str(e).strip()[:120]); return []
