#!/usr/bin/env python3
"""Issue #55 step 2 — place the tee pieces around the body (Blender as a module).

    python3 tools/assets/cloth/place.py

Reads out/body.obj + out/tee.json. Each pattern piece becomes a flat grid mesh (1 cm step,
scanline columns so the seam-boundary vertices are exact), bent around a cylinder of its body
part: front in front of the chest, back behind the shoulder blades, sleeves around the arms
(the bind-pose arm axis, ~29° below horizontal — the export note), neckband as a ring at the
neck root; all 2–4 cm off the skin. Every vertex is then checked against the body triangles
and pushed radially outward until it is at least ~2 cm from the skin.

Seams become vertex pairs (same fraction along each edge) — step 3 turns them into sewing
springs. Stored in out/tee_placed.json and in out/tee_placed.blend (objects + a "seamEdges"
mesh + a JSON text block).

Renders front/side/back (1024 px) to out/place_front.png / place_side.png / place_back.png:
body grey, pieces coloured, seams as thin dark lines. The PNGs come from a built-in pure-Python
z-buffer rasteriser (headless-safe: calling Workbench's bpy.ops.render.render() aborts the
process in CI with no EGL/Vulkan context). bpy is still used to save tee_placed.blend with the
objects + sewing edges; no GL render is invoked.
"""
import json, math, os, shutil, sys, zlib, struct

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
PREVIEW = os.path.join(HERE, 'preview')     # committed report PNGs (out/ is git-ignored)
GAP = {'body': 0.030, 'sleeve': 0.025, 'band': 0.015}   # metres off the skin per piece kind
MIN_CLEAR = 0.020                                       # no cloth vertex may sit closer than 2 cm to the skin
PUSH_TO = 0.032                                         # such vertices are pushed out to ~3.2 cm (2–4 cm band)
STEP = 1.0                                              # cm grid

COLORS = {'body': (0.42, 0.42, 0.44), 'front': (0.82, 0.28, 0.28), 'back': (0.24, 0.42, 0.80),
          'sleeveP': (0.20, 0.62, 0.40), 'sleeveM': (0.90, 0.62, 0.22), 'band': (0.55, 0.27, 0.66),
          'seam': (0.10, 0.08, 0.25)}


# ───────────────────────── inputs ─────────────────────────
def load_obj(path):
    P, tris = [], []
    for ln in open(path):
        if ln.startswith('v '):
            P.append(tuple(float(x) for x in ln.split()[1:4]))
        elif ln.startswith('f '):
            tris.append(tuple(int(x.split('/')[0]) - 1 for x in ln.split()[1:4]))
    return P, tris


def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def nrm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


# ───────────────────────── grid (warp columns) ─────────────────────────
def poly_cols(poly, step_cm=STEP):
    """column-cut scanlines: for a v-simple outline return [(u, vbot, vtop), ...]"""
    xs = [p[0] for p in poly]
    lo, hi = min(xs), max(xs)
    out = []
    u = lo + step_cm * 0.35
    n = len(poly)
    while u <= hi + 1e-6:
        vv = []
        for i in range(n):
            x1, y1 = poly[i]
            x2, y2 = poly[(i + 1) % n]
            if (x1 < u <= x2) or (x2 < u <= x1):
                t = (u - x1) / (x2 - x1)
                vv.append(y1 + (y2 - y1) * t)
        if len(vv) >= 2:
            out.append((u, min(vv), max(vv)))
        elif len(vv) == 1:
            out.append((u, vv[0], vv[0]))
        u += step_cm
    return out


def build_grid(poly, step_cm=STEP):
    """warp grid: columns of equal vertex count; boundary vertices lie exactly on the outline"""
    cols = poly_cols(poly, step_cm)
    hmax = max(v2 - v1 for _, v1, v2 in cols)
    nrows = max(3, round(hmax / step_cm))
    verts, idxmap = [], []
    for ci, (u, v1, v2) in enumerate(cols):
        row = []
        for j in range(nrows + 1):
            t = j / nrows
            v = v1 + (v2 - v1) * t
            row.append(len(verts))
            verts.append((u, v))
        idxmap.append(row)
    faces = []
    for ci in range(len(idxmap) - 1):
        for j in range(nrows):
            a, b = idxmap[ci][j], idxmap[ci + 1][j]
            c, d = idxmap[ci][j + 1], idxmap[ci + 1][j + 1]
            if cols[ci][2] - cols[ci][1] < 1e-6 or cols[ci + 1][2] - cols[ci + 1][1] < 1e-6:
                continue
            faces.append((a, b, c))
            faces.append((b, d, c))
    return verts, faces, idxmap, cols, nrows


# ───────────────────────── bending ─────────────────────────
def bender(name, A):
    """returns f(u_cm, v_cm) -> (x, y, z) in metres"""
    if name in ('front', 'back'):
        Rc = A['chest']['C'] / 100 / (2 * math.pi) + GAP['body']
        zc = A['chest']['zc']
        yn = A['nape_y']
        sgn = 1 if name == 'front' else -1
        def f(u, v):
            th = (u / 100) / Rc
            if name == 'front':
                return (Rc * math.sin(th), yn - v / 100, zc + Rc * math.cos(th))
            return (Rc * math.sin(th), yn - v / 100, zc - Rc * math.cos(th))
        return f
    if name in ('sleeveP', 'sleeveM'):
        s = 1 if name == 'sleeveP' else -1
        ar = A['arms']['L' if s > 0 else 'R']
        b = (ar['bicep_cx'], ar['bicep_y'], ar['bicep_cz'])
        e = (ar['elbow_cx'], ar['elbow_y'], ar['elbow_cz'])
        d = nrm(sub(e, b))
        R = ar['C_bicep'] / 100 / (2 * math.pi) + GAP['sleeve']
        tip = A['sleeve_tip'][s]
        Y = (0, 1, 0)
        e_top = nrm(tuple(Y[k] - dot(Y, d) * d[k] for k in range(3)))   # perp to the arm, points up
        e_side = nrm(cross(d, e_top))
        hcap = A['cap_h']
        def f(u, v):
            th = (u / 100) / R
            s_al = (v + hcap) / 100
            radial = tuple(e_top[k] * math.cos(th) + e_side[k] * math.sin(th) for k in range(3))
            return tuple(tip[k] + d[k] * s_al + R * radial[k] for k in range(3))
        return f
    if name == 'band':
        return None            # the band is placed along the neckline seam — see band_bender
    raise KeyError(name)


def band_bender(A, tee, fF, fB):
    """the neckband does not fit a horizontal ring around this neck (the trapezius and the ears
    sit exactly at its radius) — it is laid along the neckline seam instead: the seam edge of the
    strip follows the front/back neck curves bent onto the body cylinders, offset GAP['band']
    outward, and the strip width goes UP toward the chin. u=0 of the strip is the back neck's
    left end; the strip runs back-neck (left→right) then front-neck (right→left), one full
    continuous turn of the neckline, matching the seam pair order."""
    neckF = edge_pts(tee['parts']['front'], 'neck')
    neckB = edge_pts(tee['parts']['back'], 'neck')
    def ilen2(poly):
        return sum(math.hypot(poly[i+1][0] - poly[i][0], poly[i+1][1] - poly[i][1]) for i in range(len(poly) - 1))
    Lf, Lb = ilen2(neckF), ilen2(neckB)
    Ln = Lf + Lb
    def pt_on(poly, s):
        acc = 0.0
        for i in range(len(poly) - 1):
            L = math.hypot(poly[i+1][0] - poly[i][0], poly[i+1][1] - poly[i][1])
            if acc + L >= s - 1e-9:
                t = (s - acc) / (L or 1)
                return (poly[i][0] + (poly[i+1][0] - poly[i][0]) * t, poly[i][1] + (poly[i+1][1] - poly[i][1]) * t)
            acc += L
        return poly[-1]
    zc = A['chest']['zc']
    def f(u, v):
        s = u + Ln / 2
        if s <= Lb:
            p2 = pt_on(neckB, s)
            base = fB(p2[0], p2[1])
        else:
            p2 = pt_on(neckF, Lf - (s - Lb))
            base = fF(p2[0], p2[1])
        rx, rz = base[0], base[2] - zc
        rl = math.hypot(rx, rz) or 1.0
        return (base[0] + GAP['band'] * rx / rl, base[1] + v / 100, base[2] + GAP['band'] * rz / rl)
    f.Ln = Ln
    return f


# ───────────────────────── body proximity ─────────────────────────
class Body:
    def __init__(self, P, tris):
        self.P, self.tris = P, tris
        self.cell = 0.05
        self.grid = {}
        for ti, (a, b, c) in enumerate(tris):
            xs = [P[a][0], P[b][0], P[c][0]]; ys = [P[a][1], P[b][1], P[c][1]]; zs = [P[a][2], P[b][2], P[c][2]]
            for gx in range(int(min(xs) / self.cell), int(max(xs) / self.cell) + 1):
                for gy in range(int(min(ys) / self.cell), int(max(ys) / self.cell) + 1):
                    for gz in range(int(min(zs) / self.cell), int(max(zs) / self.cell) + 1):
                        self.grid.setdefault((gx, gy, gz), []).append(ti)

    def d2tri(self, p, ti):
        """(squared distance, closest point) from point p to triangle ti"""
        a, b, c = self.tris[ti]
        A, B, C = self.P[a], self.P[b], self.P[c]
        ab, ac = sub(B, A), sub(C, A)
        d = sub(p, A)
        v00, v01, v11 = dot(ab, ab), dot(ab, ac), dot(ac, ac)
        v0, v1 = dot(ab, d), dot(ac, d)
        det = v00 * v11 - v01 * v01
        if abs(det) < 1e-14:
            u, w = 0.0, 0.0
        else:
            u = (v11 * v0 - v01 * v1) / det
            w = (v00 * v1 - v01 * v0) / det
        u = max(0.0, min(1.0, u)); w = max(0.0, min(1.0, w))
        if u + w > 1.0:
            u = min(u, w); w = 1.0 - u
        cp = (A[0] + ab[0] * u + ac[0] * w, A[1] + ab[1] * u + ac[1] * w, A[2] + ab[2] * u + ac[2] * w)
        return (p[0] - cp[0])**2 + (p[1] - cp[1])**2 + (p[2] - cp[2])**2, cp

    def nearest(self, p):
        """(squared distance to the skin, that closest point) — the point lets a vertex be
        pushed straight out along the surface normal instead of a possibly-tangential radius."""
        gx = int(p[0] / self.cell); gy = int(p[1] / self.cell); gz = int(p[2] / self.cell)
        best, bestcp = 1e18, None
        for r in range(1, 4):
            if best < (r - 1) * self.cell * (r - 1) * self.cell:
                break
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    for dz in range(-r, r + 1):
                        if max(abs(dx), abs(dy), abs(dz)) != r:
                            continue
                        for ti in self.grid.get((gx + dx, gy + dy, gz + dz), ()):
                            d2, cp = self.d2tri(p, ti)
                            if d2 < best:
                                best, bestcp = d2, cp
            if best < (r * self.cell) ** 2:
                break
        return best, bestcp

    def nearest2(self, p):
        return self.nearest(p)[0]


# ───────────────────────── seams ─────────────────────────
def edge_pts(part, ename):
    i0, i1 = part['edges'][ename]
    pts = part['pts']
    if i0 <= i1:
        return [tuple(pts[i]) for i in range(i0, i1 + 1)]
    return [tuple(pts[i]) for i in range(i0, len(pts))] + [tuple(pts[i]) for i in range(0, i1 + 1)]


def sample_polyline(pts, every=0.012):
    """3D sample points every `every` metres along the polyline"""
    if len(pts) < 2:
        return pts
    segl = [math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    tot = sum(segl)
    out = []
    d = 0.0
    while d <= tot + 1e-9:
        acc = 0.0
        for i, L in enumerate(segl):
            if acc + L >= d - 1e-9:
                t = (d - acc) / (L or 1)
                out.append(tuple(pts[i][k] + (pts[i + 1][k] - pts[i][k]) * t for k in range(3)))
                break
            acc += L
        d += every
    return out


# ───────────────────────── output: json / blend / png ─────────────────────────
def write_png(path, W, H, buf):
    """buf: bytearray RGB top-down"""
    raw = b''.join(b'\x00' + bytes(buf[y * W * 3:(y + 1) * W * 3]) for y in range(H))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) + \
          chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)


def raster(body, parts3, seams3, view, path, W=1024, H=1024, center=None, radius=None):
    """pure-Python z-buffer raster (no GL needed); view = 'front' | 'side' | 'back'.
    depth(p) grows toward the camera: front cam at +Z, side cam at +X, back cam at -Z.
    center/radius (in the view plane, metres) crop a close-up instead of framing the whole scene."""
    import array
    if view == 'front':
        ax = lambda p: (p[0], p[1]); dep = lambda p: p[2]
    elif view == 'back':
        ax = lambda p: (-p[0], p[1]); dep = lambda p: -p[2]
    else:
        ax = lambda p: (-p[2], p[1]); dep = lambda p: p[0]
    if center is not None and radius:
        cx, cy = center
        span = 2 * radius
        S = (W - 24) / span
    else:
        lo = [1e9, 1e9]; hi = [-1e9, -1e9]
        for p in body['verts3'] + [v for pt in parts3.values() for v in pt['verts3']]:
            a = ax(p)
            lo[0] = min(lo[0], a[0]); lo[1] = min(lo[1], a[1]); hi[0] = max(hi[0], a[0]); hi[1] = max(hi[1], a[1])
        pad = 0.06
        span = max(hi[0] - lo[0], hi[1] - lo[1]) + pad
        cx = (lo[0] + hi[0]) / 2; cy = (lo[1] + hi[1]) / 2
        S = (W - 24) / span
    def proj(p):
        a = ax(p)
        return ((a[0] - cx) * S + W / 2, H / 2 - (a[1] - cy) * S)
    zb = array.array('f', [-1e18] * (W * H))
    img = bytearray(b'\xf2\xf2\xf0' * (W * H))
    L = nrm((-0.35, 0.65, 0.68))
    def draw_face(v3, idx, color, zc):
        pa, pb, pc = [proj(v3[i]) for i in idx]
        x0 = max(0, int(min(pa[0], pb[0], pc[0]))); x1 = min(W - 1, int(max(pa[0], pb[0], pc[0])) + 1)
        y0 = max(0, int(min(pa[1], pb[1], pc[1]))); y1 = min(H - 1, int(max(pa[1], pb[1], pc[1])) + 1)
        area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1])
        if abs(area) < 1e-9:
            return
        nn = nrm(cross(sub(v3[idx[1]], v3[idx[0]]), sub(v3[idx[2]], v3[idx[0]])))
        sh = 0.45 + 0.55 * max(0.0, abs(nn[0] * L[0] + nn[1] * L[1] + nn[2] * L[2]))
        col = [min(255, int(c * 255 * sh)) for c in color]
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                px, py = x + 0.5, y + 0.5
                w0 = ((pb[0] - px) * (pc[1] - py) - (pc[0] - px) * (pb[1] - py)) / area
                w1 = ((pc[0] - px) * (pa[1] - py) - (pa[0] - px) * (pc[1] - py)) / area
                w2 = 1 - w0 - w1
                if w0 < -1e-6 or w1 < -1e-6 or w2 < -1e-6:
                    continue
                off = y * W + x
                if zb[off] >= zc:
                    continue
                zb[off] = zc
                o = off * 3
                img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]
    draw = []
    v3b = body['verts3']
    for tri in body['tris']:
        draw.append(((dep(v3b[tri[0]]) + dep(v3b[tri[1]]) + dep(v3b[tri[2]])) / 3, tri, COLORS['body'], v3b))
    for pt in parts3.values():
        for tri in pt['faces']:
            v = pt['verts3']
            draw.append(((dep(v[tri[0]]) + dep(v[tri[1]]) + dep(v[tri[2]])) / 3, tri, pt['color'], v))
    draw.sort(key=lambda z: z[0])
    for zc, tri, col, v in draw:
        draw_face(v, tri, col, zc)
    # seams: dark lines on top
    for pairs in seams3:
        for p1, p2 in pairs:
            a = proj(p1); b = proj(p2)
            steps = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
            for s in range(steps + 1):
                x = int(a[0] + (b[0] - a[0]) * s / steps); y = int(a[1] + (b[1] - a[1]) * s / steps)
                if 0 <= x < W and 0 <= y < H:           # thin 1 px lines keep the side view readable
                    o = (y * W + x) * 3
                    img[o] = 45; img[o + 1] = 35; img[o + 2] = 95
    write_png(path, W, H, img)


def try_blender(body, parts3, seams3, png_paths):
    """Build tee_placed.blend (objects + seamEdges + a JSON text block) with bpy.
    The report PNGs are deliberately NOT rendered here: headless Workbench has no EGL/Vulkan
    context and bpy.ops.render.render() aborts the whole process (seen on bpy 5.3 in CI);
    they are produced by the built-in z-buffer raster in main() instead."""
    try:
        import bpy
    except Exception as e:
        print(f'  bpy недоступен ({e.__class__.__name__}) — только встроенный растер')
        return False
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc = bpy.context.scene
        mat = {}
        for k, c in COLORS.items():
            m = bpy.data.materials.new(k)
            m.diffuse_color = (*c, 1)
            mat[k] = m

        def mesh_obj(name, V, F, key):
            me = bpy.data.meshes.new(name)
            me.from_pydata([list(v) for v in V], [], [list(f) for f in F])
            me.update()
            ob = bpy.data.objects.new(name, me)
            sc.collection.objects.link(ob)
            ob.data.materials.append(mat[key])
            return ob
        mesh_obj('body', body['verts3'], body['tris'], 'body')
        for nm, pt in parts3.items():
            mesh_obj(nm, pt['verts3'], pt['faces'], nm)
        # seam edge pairs: an edges-only mesh
        sv, se = [], []
        for pairs in seams3:
            for p1, p2 in pairs:
                sv.append(list(p1)); sv.append(list(p2)); se.append((len(sv) - 2, len(sv) - 1))
        if sv:
            me = bpy.data.meshes.new('seamEdges')
            me.from_pydata(sv, se, [])
            me.update()
            ob = bpy.data.objects.new('seamEdges', me)
            sc.collection.objects.link(ob)
            ob.data.materials.append(mat['seam'])
        txt = bpy.data.texts.new('tee_placed.json')
        txt.from_string(json.dumps({'parts': {k: {'n': len(v['verts3'])} for k, v in parts3.items()},
                                    'seams': len(seams3)}, ensure_ascii=False))
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'tee_placed.blend'))
        print('  tee_placed.blend: объекты + seamEdges + JSON (Blender, без GL-рендера)')
        return True
    except Exception as e:
        print(f'  ! .blend не сохранился ({type(e).__name__}: {str(e)[:120]})')
        return False


# ───────────────────────── main ─────────────────────────
def main():
    objp = os.path.join(OUT, 'body.obj')
    teep = os.path.join(OUT, 'tee.json')
    if not os.path.exists(objp) or not os.path.exists(teep):
        print('нет out/body.obj / out/tee.json — сначала export_body.py и pattern.py'); return 1
    P, tris = load_obj(objp)
    tee = json.load(open(teep))
    A = dict(tee['anchors'])
    prm = tee['params']
    A['cap_h'] = prm['cap_h']
    # the collar ring sits at the neck ring height (above the trapezius slope, below the cropped jaw):
    # a circle around the neck at the nape line would cut through the traps, which rise beside the neck
    A['band_y'] = A['neck']['y'] - 0.02
    ytip = A['nape_y'] - prm['y_tip'] / 100
    A['sleeve_tip'] = {1: (prm['tipx'] / 100, ytip, A['arms']['L']['bicep_cz']),
                       -1: (-prm['tipx'] / 100, ytip, A['arms']['R']['bicep_cz'])}
    skin = Body(P, tris)
    bd = dict(verts3=P, tris=tris)
    parts3 = {}
    print('— раскладка:')
    bad = 0
    for name, part in tee['parts'].items():
        poly = [tuple(p) for p in part['pts']]
        V, F, idxmap, cols, nrows = build_grid(poly)
        f = bender(name, A)
        if f is None:                                    # band: along the neckline seam
            f = band_bender(A, tee, bender('front', A), bender('back', A))
        V3 = [f(u, v) for u, v in V]
        # radial axis for push-out
        kind = 'sleeve' if name.startswith('sleeve') else ('band' if name == 'band' else 'body')
        ar = None
        if kind == 'sleeve':
            s = 1 if name == 'sleeveP' else -1
            ar = A['arms']['L' if s > 0 else 'R']
            axp0 = (ar['bicep_cx'], ar['bicep_y'], ar['bicep_cz'])
            axp1 = (ar['elbow_cx'], ar['elbow_y'], ar['elbow_cz'])
            D = nrm(sub(axp1, axp0)); AX = axp0
        elif kind == 'band':
            D = (0, 1, 0); AX = (0, 0, A['neck']['zc'])
        else:
            D = (0, 1, 0); AX = (0, 0, A['chest']['zc'])
        for _ in range(10):
            worst = 0
            for i, p in enumerate(V3):
                d2, cp = skin.nearest(p)
                if d2 < MIN_CLEAR * MIN_CLEAR and cp is not None:
                    d = math.sqrt(d2)
                    out = sub(p, cp)                    # straight out along the skin normal
                    ol = math.sqrt(dot(out, out))
                    if ol < 1e-6:                      # degenerate: radial fallback
                        r = sub(p, AX)
                        out = (r[0] - dot(r, D)*D[0], r[1] - dot(r, D)*D[1], r[2] - dot(r, D)*D[2])
                        ol = math.sqrt(dot(out, out)) or 1.0
                    push = PUSH_TO - d
                    V3[i] = tuple(p[k] + out[k] / ol * push for k in range(3))
                    worst = max(worst, push)
            if worst == 0:
                break
        dists = sorted(math.sqrt(skin.nearest2(p)) for p in V3)
        mins, med = dists[0], dists[len(dists) // 2]
        gapmin = GAP[kind]
        ok = mins >= MIN_CLEAR - 1e-6                  # ≥2 cm clearance => no intersection with the body
        mark = '✓' if ok else '✗'
        if not ok:
            bad += 1
        print(f'    {name:8}: {len(V3)} вершин, {len(F)} граней, до кожи min {mins*100:4.1f} / мед. {med*100:.1f} см '
              f'(цель {gapmin*100:.1f}, без пересечений ≥{MIN_CLEAR*100:.0f}) {mark}')
        parts3[name] = dict(verts3=V3, V2=V, faces=F, color=COLORS[name], grid=(idxmap, cols, nrows))
    # seams -> vertex pairs: sample each edge polyline in pattern space, snap to the nearest
    # (post-push-out) grid vertex, pair the two sides index by index
    seam_pairs = []
    print('— швы (пары вершин для sewing springs):')
    def edge_verts3d(pname, ename):
        part, pt = tee['parts'][pname], parts3[pname]
        poly = edge_pts(part, ename)
        out, last = [], -1
        for sp in sample_polyline([(x, y, 0) for x, y in poly], every=1.2):
            u, v = sp[0], sp[1]
            best, bi = 1e18, None
            for i, (vu, vv) in enumerate(pt['V2']):
                if i == last:
                    continue
                d2 = (vu - u) ** 2 + (vv - v) ** 2
                if d2 < best:
                    best, bi = d2, i
            if bi is not None and best < (3.6) ** 2:
                out.append(pt['verts3'][bi]); last = bi
        return out
    for s in tee['seams']:
        def side_pts(side):
            out = []
            for spec in side:
                pname, ename = spec[0], spec[1]
                pts = edge_verts3d(pname, ename)
                out.extend(reversed(pts) if len(spec) > 2 and spec[2] else pts)
            return out
        a = side_pts(s['a'])
        b = side_pts(s['b'])
        npair = min(len(a), len(b))
        pairs = [(a[i], b[i]) for i in range(npair)]
        avg = sum(math.dist(p[0], p[1]) for p in pairs) / (npair or 1)
        print(f'    {s["name"]}: {npair} пар, среднее расстояние {avg*100:.1f} см')
        seam_pairs.append((s['name'], pairs))
    # tee_placed.json
    jout = dict(unit='m', parts={k: dict(verts=[list(map(lambda x: round(x, 4), v)) for v in pt['verts3']],
                                         faces=[list(f) for f in pt['faces']]) for k, pt in parts3.items()},
                seams=[dict(name=nm, pairs=[[[round(c, 4) for c in p1], [round(c, 4) for c in p2]] for p1, p2 in pr])
                       for nm, pr in seam_pairs])
    open(os.path.join(OUT, 'tee_placed.json'), 'w').write(json.dumps(jout, ensure_ascii=False))
    png_paths = {v: os.path.join(OUT, f'place_{v}.png') for v in ('front', 'side', 'back')}
    try_blender(bd, parts3, [pr for _, pr in seam_pairs], png_paths)   # .blend for step 3
    print('  растер: собственный z-buffer рендер (1024 px) — отчётные PNG…')
    for view, path in png_paths.items():
        raster(bd, parts3, [pr for _, pr in seam_pairs], view, path)
        print(f'    → {path}')
    os.makedirs(PREVIEW, exist_ok=True)
    for view, path in png_paths.items():
        shutil.copyfile(path, os.path.join(PREVIEW, f'place_{view}.png'))
    print(f'  превью → {PREVIEW} (place_front/side/back.png, ≤1024 px)')
    print('ИТОГ: ' + ('раскладка без пересечений' if not bad else f'ПРОБЛЕМ: {bad}'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
