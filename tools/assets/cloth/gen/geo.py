"""Clothes generator: geometry helpers (convex slices, smoothing, winding) and the painters that work in the frame of a piece."""
import math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from common import clear, FONT5


def hull(pts):
    """2D convex hull of [(x, y)]: cloth bridges the hollows of a body slice."""
    P = sorted(set((round(float(x), 5), round(float(y), 5)) for x, y in pts))
    if len(P) < 3: return P
    def half(P):
        H = []
        for p in P:
            while len(H) >= 2 and (H[-1][0] - H[-2][0]) * (p[1] - H[-2][1]) - (H[-1][1] - H[-2][1]) * (p[0] - H[-2][0]) <= 0: H.pop()
            H.append(p)
        return H
    return half(P)[:-1] + half(P[::-1])[:-1]


def ray_r(H, ctr, dx, dy):
    """Distance from ctr along (dx, dy) to the hull polygon H (0 when it misses)."""
    best = 0.0; n = len(H)
    for k in range(n):
        ax, ay = H[k][0] - ctr[0], H[k][1] - ctr[1]; ex, ey = H[(k + 1) % n][0] - H[k][0], H[(k + 1) % n][1] - H[k][1]; den = dx * ey - dy * ex
        if abs(den) < 1e-12: continue
        t = (ax * ey - ay * ex) / den; u = (ax * dy - ay * dx) / den
        if t > 0 and -1e-9 <= u <= 1 + 1e-9: best = max(best, t)
    return best


def quad_ring(pts, per):
    """A dense closed ring (len % 4 == 0, index 0 = front centre) -> 4 * per points: the quadrant corners kept (centre front, side, centre
       back, side = the seams), even arc length inside a quadrant."""
    n = len(pts); out = []
    for q in range(4):
        seg = [pts[(q * n // 4 + i) % n] for i in range(n // 4 + 1)]; L = [0.0]
        for i in range(1, len(seg)): L.append(L[-1] + math.hypot(seg[i][0] - seg[i - 1][0], seg[i][1] - seg[i - 1][1]))
        for k in range(per):
            s = L[-1] * k / per; i = 0
            while i < len(seg) - 2 and L[i + 1] <= s: i += 1
            t = (s - L[i]) / ((L[i + 1] - L[i]) or 1); out.append((seg[i][0] + (seg[i + 1][0] - seg[i][0]) * t, seg[i][1] + (seg[i + 1][1] - seg[i][1]) * t))
    return out


def relax(b, vs, bvh, it=2, lam=0.5):
    """Laplacian smoothing of the shell verts vs (borders stay), each pass followed by clear(): the cloth stays outside the skin."""
    vs = set(vs); nb = {}; cnt = {}
    for f in b.F:
        for k in range(len(f)):
            a, c = f[k], f[(k + 1) % len(f)]; key = (min(a, c), max(a, c)); cnt[key] = cnt.get(key, 0) + 1
    border = set()
    for (a, c), n in cnt.items():
        nb.setdefault(a, set()).add(c); nb.setdefault(c, set()).add(a)
        if n == 1: border.update((a, c))
    mv = [v for v in vs if v not in border and v in nb]; bl = [v for v in vs if v in border]
    for i in range(it + 1):
        if i < it:
            new = {v: b.V[v].lerp(sum((b.V[j] for j in nb[v]), Vector()) / len(nb[v]), lam) for v in mv}
            for v, p in new.items(): b.V[v] = p
        for grp in (mv, bl):
            P = [b.V[v] for v in grp]; clear(P, bvh, [b.ease[v] for v in grp], 2)
            for v, p in zip(grp, P): b.V[v] = p


def orient(b, bvh):
    """Wind every island so that its normals point away from the body (b.out[island] = an explicit direction; boxes / discs are built right)."""
    groups = {}
    for i, k in enumerate(b.isl): groups.setdefault(k, []).append(i)
    for k, fs in groups.items():
        if k in b.fixed: continue
        s = 0.0
        for i in fs:
            p = [b.V[v] for v in b.F[i]]; n = sum(((p[j] - p[0]).cross(p[j + 1] - p[0]) for j in range(1, len(p) - 1)), Vector()); c = sum(p, Vector()) / len(p)
            ref = b.out.get(k)
            if ref is None:
                loc, nr, fi, d = bvh.find_nearest(c); ref = (c - loc).normalized() if d > 1e-4 and (c - loc).dot(nr) > 0 else nr
            s += n.dot(ref)
        if s < 0:
            for i in fs: b.F[i] = b.F[i][::-1]


def shell_bvh(b): return BVHTree.FromPolygons([tuple(v) for v in b.V], b.F)


def faces_of(b, *prefix): return [i for i, k in enumerate(b.isl) if k.startswith(prefix)]


class Local:
    """A painter in the frame of a patch: o = uv of its corner (0, 0), eu / ev = uv vectors to (1, 0) and (0, 1)."""
    def __init__(s, P, o, eu, ev):
        s.P = P; s.o = np.array(o, np.float64); s.eu = np.array(eu, np.float64); s.ev = np.array(ev, np.float64)
        det = s.eu[0] * s.ev[1] - s.eu[1] * s.ev[0]; s.inv = np.array([[s.ev[1], -s.ev[0]], [-s.eu[1], s.eu[0]]]) / det

    def rect(s, a0, b0, a1, b1, col=None, h=None, mask=None):
        P = s.P; cs = [s.o + s.eu * a + s.ev * b for a in (a0, a1) for b in (b0, b1)]
        x0, y0, x1, y1 = P.px(min(c[0] for c in cs), min(c[1] for c in cs), max(c[0] for c in cs), max(c[1] for c in cs))
        if x1 <= x0 or y1 <= y0: return
        du = P.u[y0:y1, x0:x1] - s.o[0]; dv = P.v[y0:y1, x0:x1] - s.o[1]; la = s.inv[0, 0] * du + s.inv[0, 1] * dv; lb = s.inv[1, 0] * du + s.inv[1, 1] * dv
        m = (la >= min(a0, a1)) & (la <= max(a0, a1)) & (lb >= min(b0, b1)) & (lb <= max(b0, b1))
        if col is not None: P.c[y0:y1, x0:x1][m] = np.array(col, np.float32)
        if h is not None: P.h[y0:y1, x0:x1][m] = h
        if mask is not None: P.m[y0:y1, x0:x1][m] = mask

    def text(s, a0, b0, a1, b1, txt, col, h=None, mask=0.0):
        n = len(txt); cw = (a1 - a0) / (n * 6 - 1); ch = (b1 - b0) / 7
        for i, g in enumerate(txt):
            for r, row in enumerate(FONT5.get(g, [0] * 7)):
                for c in range(5):
                    if row >> (4 - c) & 1: s.rect(a0 + (i * 6 + c) * cw, b1 - (r + 1) * ch, a0 + (i * 6 + c + 1) * cw, b1 - r * ch, col, h, mask)


def vert_uv(ob):
    """{vertex: uv} (the last corner wins: for verts that sit in one island)."""
    me = ob.data; uv = me.uv_layers.active.data; return {l.vertex_index: uv[l.index].uv.copy() for l in me.loops}


def stitch_borders(P, ob, b, inset, skip=(), **k):
    """Top-stitching along every island border (= every real seam and hem), `inset` uv units inside the piece."""
    me = ob.data; uv = me.uv_layers.active.data; cnt = {}
    for p in me.polygons:
        L = list(p.loop_indices)
        for i in range(len(L)):
            a = uv[L[i]].uv; c = uv[L[(i + 1) % len(L)]].uv; key = tuple(sorted(((round(a.x, 5), round(a.y, 5)), (round(c.x, 5), round(c.y, 5)))))
            cnt.setdefault(key, []).append((p.index, a.copy(), c.copy()))
    for lst in cnt.values():
        if len(lst) != 1: continue
        fi, a, c = lst[0]
        if b.isl[fi] in b.fixed or (skip and b.isl[fi].startswith(tuple(skip))): continue
        L = list(me.polygons[fi].loop_indices); cen = sum((uv[l].uv for l in L), Vector((0, 0))) / len(L); d = c - a
        if d.length < 1e-6: continue
        nr = Vector((-d.y, d.x)).normalized()
        if (cen - a).dot(nr) < 0: nr = -nr
        P.stitch(a + nr * inset, c + nr * inset, **k)


def seam_line(P, ob, edges, w, col, h=None, mask=0.0):
    """A band of half width w (uv) along the mesh edges {(v0, v1)}, on both pieces that meet there (piping)."""
    me = ob.data; uv = me.uv_layers.active.data
    for p in me.polygons:
        L = list(p.loop_indices); V = list(p.vertices)
        for i in range(len(L)):
            if (min(V[i], V[(i + 1) % len(V)]), max(V[i], V[(i + 1) % len(V)])) not in edges: continue
            a = uv[L[i]].uv.copy(); c = uv[L[(i + 1) % len(L)]].uv.copy(); d = c - a
            if d.length < 1e-6: continue
            nr = Vector((-d.y, d.x)).normalized() * w
            P.tri(a - nr, c - nr, c + nr, col, h, mask, 0.4); P.tri(a - nr, c + nr, a + nr, col, h, mask, 0.4)
