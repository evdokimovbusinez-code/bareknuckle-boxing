"""Police uniform (issue 85), built on the body of tools/assets/cloth/user/tshirt_src.blend in its rest (bind A) pose.
   Run:  python3 tools/assets/ --gen police     (the CI allow-list form; the same as python3 tools/assets/cloth/gen/police.py)
   Writes assets/cloth/police_top.glb + police_top_c.webp (colour, the cloth left light: it is dyed by the item's colour),
   police_top_m.webp (dye mask: white = dyed cloth, black = a detail with its own colour) and police_top_n.webp (normal map);
   prints triangles, bytes, the clearance over the skin and the UV distortion metric.

   The shirt: front (two halves, the placket seam), back, yoke — sheets of quads from the tucked hem to the shoulder seam, cut by the
   side seams and the armholes; sleeves = tubes sewn to the armhole loops (seam under the arm); collar, placket, chest pockets with
   flaps and shoulder straps are islands of their own in the same mesh."""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import common as C, geo as G
from common import Vector, say, lerp, smooth

Z = Vector((0, 0, 1)); PI = math.pi
B = C.load_body(); VN = np.array([tuple(v) for v in B.V]); TOPB = [max(w, key=w.get) if w else '' for w in B.W]
ARM = ('Upperarm', 'Forearm', 'Elbow', 'Hand', 'Thumb', 'Index', 'Mid', 'Ring', 'Pinky')
is_arm = lambda g: any(k in g for k in ARM) and 'Toe' not in g


def edges_of(keep):
    """Edges of the body faces whose strongest bone passes keep()."""
    E = set()
    for f in B.F:
        if sum(1 for i in f if keep(TOPB[i])) * 2 > len(f):
            for k in range(len(f)): E.add((min(f[k], f[k - 1]), max(f[k], f[k - 1])))
    return np.array(sorted(E))


def slice_pts(E, p0, n):
    """Where the edges E cross the plane (p0, n)."""
    d = (VN - np.array(p0)) @ np.array(n); a, c = E[:, 0], E[:, 1]; m = (d[a] > 0) != (d[c] > 0); a, c = a[m], c[m]
    t = (d[a] / (d[a] - d[c]))[:, None]; return VN[a] * (1 - t) + VN[c] * t


def hring(E, z, ease, per, n=144):
    """The convex outline of the body slice at height z, `ease` outside it: 4 * per points, index 0 = centre front, then his left side."""
    P = slice_pts(E, (0, 0, z), (0, 0, 1)); H = G.hull([(p[0], p[1]) for p in P]); cy = (min(h[1] for h in H) + max(h[1] for h in H)) / 2; out = []
    for i in range(n):
        th = 2 * PI * i / n; r = G.ray_r(H, (0, cy), math.sin(th), -math.cos(th)) + ease; out.append((r * math.sin(th), cy - r * math.cos(th)))
    return G.quad_ring(out, per)


def shirt():
    b = C.Build('police_top'); Et = edges_of(lambda g: not is_arm(g))
    S = B.bone('CC_Base_L_Upperarm'); xa = S.x - 0.012   # the armhole: a vertical plane just inside the shoulder joint
    while True:   # the armpit under it
        h = B.bvh.ray_cast(Vector((xa, S.y, S.z - 0.01)), -Z, 0.5)
        if h[0] is not None and h[0].z > S.z - 0.2: break
        xa += 0.005
    z_ap = h[0].z - 0.03; z_hem = 0.985; Nf, Rl, Ru, xn, xnc, df, db, e_sh = 24, 11, 10, 0.085, 0.072, 0.07, 0.022, 0.008
    ease_t = lambda z: 0.006 + 0.016 * smooth(z, 1.06, 1.13) * (1 - 0.45 * smooth(z, 1.22, 1.34))   # tucked in at the belt, bloused over it
    zs = [lerp(z_hem, z_ap, r / Rl) for r in range(Rl + 1)]; rings = [hring(Et, z, ease_t(z), Nf // 2) for z in zs]

    def ridge(x):   # the top of the shoulder at x
        best = None
        for i in range(-10, 18):
            p = Vector((x, i * 0.01, 1.64))
            for _ in range(4):
                loc, nr, fi, d = B.bvh.ray_cast(p, -Z, 0.4)
                if loc is None: break
                if nr.z > 0.3 and (best is None or loc.z > best.z): best = loc.copy()
                p = loc - Z * 1e-4
        return best
    rd = [ridge(max(abs(lerp(-xa, xa, c / Nf)), xn)) for c in range(Nf + 1)]; ry = [p.y for p in rd]
    for _ in range(2): ry = [ry[0]] + [(ry[c - 1] + 2 * ry[c] + ry[c + 1]) / 4 for c in range(1, Nf)] + [ry[-1]]
    zr0 = ridge(xn).z + e_sh

    def ycast(x, z, sg):
        h = B.bvh.ray_cast(Vector((x, sg * 0.6, z)), Vector((0, -sg, 0)), 1.2); return None if h[0] is None else h[0].y + sg * 0.012

    def panel(sg):   # sg -1: the front (columns from his right side to his left), +1: the back (left to right)
        pts = []
        for r in range(Rl + Ru + 1):
            row = []
            for c in range(Nf + 1):
                k = (36 + c) % 48 if sg < 0 else 12 + c; cc = c if sg < 0 else Nf - c   # cc: the column counted from his right
                if r <= Rl: x, y = rings[r][k % 48]; row.append(Vector((x, y, zs[r]))); continue
                s = (r - Rl) / Ru; x0, y0 = rings[Rl][k % 48]; xt = lerp(-xa, xa, cc / Nf); zr = rd[cc].z + e_sh; yr = ry[cc]
                x = lerp(x0, xt, smooth(s, 0, 0.6)); z = lerp(z_ap, zr, s); y = ycast(x, min(z, zr - 0.006), sg)
                y = yr if y is None else y; y = lerp(y0, y, smooth(s, 0, 0.35)); y = lerp(y, yr, smooth(s, 0.8, 1.0)); row.append(Vector((x, y, z)))
            pts.append(row)
        return pts

    def weld(sg):
        def f(r, c):
            cc = c if sg < 0 else Nf - c
            if r == Rl + Ru: return ('ridge', cc)   # the shoulder seam
            if r <= Rl and cc in (0, Nf): return ('side', cc, r)   # the side seams
        return f

    def neck(pts, sg):
        d = df if sg < 0 else db
        def f(r, c):
            p = (pts[r][c] + pts[r][c + 1] + pts[r + 1][c + 1] + pts[r + 1][c]) / 4
            return abs(p.x) < xnc and p.z > zr0 - d * math.sqrt(1 - (p.x / xnc) ** 2) - 0.004
        return f
    fp, bp = panel(-1), panel(1); ez = lambda pts: (lambda r, c: ease_t(pts[r][c].z) if r <= Rl else 0.008)
    fi = b.grid(lambda r, c: 'frontR' if c < Nf // 2 else 'frontL', fp, weld=weld(-1), skip=neck(fp, -1), ease=ez(fp))
    bi = b.grid(lambda r, c: 'yoke' if r >= Rl + 6 else 'back', bp, weld=weld(1), skip=neck(bp, 1), ease=ez(bp))
    for sx, nm in ((1, 'L'), (-1, 'R')):   # sleeves: from the armhole loop to 60 % of the upper arm, flaring
        fc, bc = (Nf, 0) if sx > 0 else (0, Nf)
        loop = [fi[Rl + i][fc] for i in range(Ru + 1)] + [bi[Rl + i][bc] for i in range(Ru - 1, 0, -1)]
        S = B.bone('CC_Base_%s_Upperarm' % nm); E = B.bone('CC_Base_%s_Forearm' % nm); a = (E - S).normalized(); L = (E - S).length
        e1 = (Z - a * a.dot(Z)).normalized(); e2 = a.cross(e1); Ea = edges_of(lambda g: (nm + '_') in g and is_arm(g)); Ms = 6; rows = [[b.V[v] for v in loop]]; info = []
        for v in loop: w = b.V[v] - S; t = w.dot(a); wp = w - a * t; info.append((t, math.atan2(wp.dot(e2), wp.dot(e1)), wp.length))
        for j in range(1, Ms + 1):
            f = j / Ms; row = []
            for t0, ph, r0 in info:
                t = lerp(t0, 0.6 * L, f); p0 = S + a * t; P = slice_pts(Ea, tuple(p0), tuple(a)); r = r0
                if len(P) >= 3:
                    Q = P - np.array(tuple(p0)); H = G.hull(list(zip(Q @ np.array(tuple(e1)), Q @ np.array(tuple(e2)))))
                    if len(H) >= 3: r = G.ray_r(H, (0, 0), math.cos(ph), math.sin(ph)) or r0
                r = lerp(r0, r + lerp(0.012, 0.024, f), smooth(f, 0, 0.5)); row.append(p0 + (e1 * math.cos(ph) + e2 * math.sin(ph)) * r)
            rows.append(row)
        b.grid('sleeve' + nm, rows, closed=True, use={(0, k): loop[k] for k in range(len(loop))}, ease=0.01)
    b.shell = list(range(len(b.V))); G.relax(b, b.shell, B.bvh, it=3)
    # collar: stand + fall on the neckline, open at the front
    Kc = 20; a0 = 0.16; up = Vector((0, -0.18, 1)).normalized(); base = []; ang = [a0 + (2 * PI - 2 * a0) * k / Kc for k in range(Kc + 1)]
    for an in ang:
        cz = math.cos(an); base.append(Vector((xnc * math.sin(an), 0.022 - 0.07 * cz, zr0 - (df * max(0, cz) ** 1.3 + db * max(0, -cz) ** 1.3))))
    C.clear(base, B.bvh, 0.005, 4); top = [p + up * 0.03 for p in base]; C.clear(top, B.bvh, 0.004, 4)
    o = [Vector((math.sin(an), -math.cos(an), 0)) for an in ang]
    b.grid('collar', [[base[k] + o[k] * 0.016 - Z * (0.012 + 0.022 * max(0, math.cos(ang[k])) ** 6) for k in range(Kc + 1)], [top[k] + o[k] * 0.004 for k in range(Kc + 1)], base], ease=0)
    # details laid on the finished shell
    sh = G.shell_bvh(b)
    def fproj(x, z, lift):
        h = sh.ray_cast(Vector((x, -0.6, z)), Vector((0, 1, 0)), 1.2); return Vector((x, h[0].y - lift, z))
    def tproj(x, y, c):
        h = sh.ray_cast(Vector((x, y, 1.75)), -Z, 0.5); return (h[0] if h[0] is not None else Vector((x, y, rd[c].z + e_sh))) + Z * 0.004
    b.grid('placket', [[fproj(x, lerp(1.0, zr0 - df - 0.012, i / 14), 0.003) for x in (-0.017, 0, 0.017)] for i in range(15)], ease=0)
    b.ep = {}
    for sx, nm in ((1, 'L'), (-1, 'R')):
        cx = sx * 0.098
        b.grid('pocket' + nm, [[fproj(cx + (i / 4 - 0.5) * 0.105, lerp(1.315, 1.43, j / 4), 0.003) for i in range(5)] for j in range(5)], ease=0)
        b.grid('flap' + nm, [[fproj(cx + (i / 4 - 0.5) * 0.11, lerp(1.395, 1.44, j), 0.006) for i in range(5)] for j in range(2)], ease=0)
        row = lambda j: [tproj(sx * x, ry[c] + (j - 1) * 0.023, c) for x in (0.10, 0.124, 0.148, 0.172) for c in [round((sx * x + xa) / (2 * xa) * Nf)]]
        b.ep[nm] = b.grid('ep' + nm, [row(j) for j in range(3)], mask=0, ease=0); b.out['ep' + nm] = Z
    b.bi = bi; b.Rl = Rl
    return b


def paint_shirt(P, ob, b, k):
    vu = G.vert_uv(ob); P.weave()
    for nm in ('pocket', 'flap', 'placket', 'collar'): P.fill(ob, G.faces_of(b, nm), None, 0.6 if nm == 'flap' else 0.56)
    for nm in 'LR':   # shoulder straps: dark, a red edge, the sergeant's three stripes
        P.fill(ob, G.faces_of(b, 'ep' + nm), (0.07, 0.08, 0.13), 0.62, 0.0); ix = b.ep[nm]; o = vu[ix[0][0]]; L = G.Local(P, o, vu[ix[0][3]] - o, vu[ix[2][0]] - o)
        for t in (0.0, 0.94): L.rect(0, t, 1, t + 0.06, (0.62, 0.1, 0.1), 0.66, 0.0)
        for t in (0.5, 0.64, 0.78): L.rect(t, 0.1, t + 0.07, 0.9, (0.85, 0.68, 0.2), 0.7, 0.0)
    G.stitch_borders(P, ob, b, 0.005 * k, skip=('ep',), dash=0.007 * k, w=0.0011)
    r0, r1 = b.Rl - 4, b.Rl - 2; bi = b.bi; o = vu[bi[r0][5]]   # the word across the back: its own colour, cut out of the dye mask
    G.Local(P, o, vu[bi[r0][19]] - o, vu[bi[r1][5]] - o).text(0, 0, 1, 1, 'ПОЛИЦИЯ', (0.93, 0.93, 0.9), 0.58, 0.0)


def finish(b, paint, views, res=1024):
    G.orient(b, B.bvh); gap, under = C.min_gap([b.V[i] for i in b.shell], B.bvh)
    say('%s: %d verts, %d faces, %d tris; shell over the skin: min %.1f mm, %.2f%% of the verts under it' % (b.name, len(b.V), len(b.F), b.tris(), 1000 * gap, 100 * under))
    for o in C.bpy.data.objects: o.select_set(False)
    ob = C.to_object(b); C.unwrap(ob, b); m = C.uv_metric(ob, b.name)
    W = C.weights(B, b, keep=lambda g: not any(k in g for k in ('Hand', 'Thumb', 'Index', 'Mid', 'Ring', 'Pinky', 'Head', 'Jaw', 'Toe')))
    P = C.Paint(res, (0.9, 0.9, 0.9)); paint(P, ob, b, 1 / m['texel']); out = os.path.join(C.OUT, b.name)
    P.save(out + '_c.webp', quality=88); P.save(out + '_n.webp', P.normal(5.0), quality=85); P.save(out + '_m.webp', np.dstack([P.m] * 3), quality=80)
    C.write_glb(ob, b, W, out + '.glb', b.name)
    if not os.environ.get('GEN_RENDER'): return   # the CI box has no libEGL: Workbench kills the process there. With a GPU / EGL: GEN_RENDER=1
    os.makedirs(C.PREVIEW, exist_ok=True)
    for kind in ('checker', 'stripes'): C.render_check(ob, B, os.path.join(C.PREVIEW, '%s_%s.jpg' % (b.name, kind)), views, kind)


finish(shirt(), paint_shirt, [('front', (0.25, -1.5, 1.45), (0, 0, 1.3)), ('back', (-0.45, 1.45, 1.5), (0, 0, 1.3))])
say('done')
