#!/usr/bin/env python3
"""Issue #56 — sew the pattern pieces into a T-shirt with Blender cloth (headless), Marvelous/CLO style.

    bash tools/assets/cloth/run_all.sh      # full pipeline (tee sim, then pants placement + pants sim)
    python3 tools/assets/ --only sim [--garment pants]

Reads out/body.obj (+ body_skin.json) and the step-1 pattern (out/tee.json / out/pants.json).
The pieces are re-laid at the sim resolution with the SAME benders as place.py / pants.py; they
are NOT pre-sewn: the seam gaps (shoulders up to ~30 cm) are left exactly as the placement gives
them, like separate panels in a real sewing room.

Method (two physics phases; no Laplacian relax, no weld before the sim — issue #56 discussion):

  1. JOIN: pieces become ONE mesh with separate islands. Each seam is a set of LOOSE EDGES
     connecting a pair of boundary vertices (an edge with no face). Blender Cloth turns those
     into "Sewing springs" (use_sewing_springs + sewing_force_max).
  2. SEW phase (~50 frames): gravity 0, shrink_min ~0.08, self-collision OFF, body collision ON.
     The sewing springs pull the seams together by themselves; fabric settles on the shoulders /
     chest against the collider.
  3. WELD: once seam gaps are < 3 mm, merge the seam pairs (union-find over seam vertices only)
     into one manifold shell; drop the loose sewing edges. Pattern UVs are kept PER FACE CORNER
     (a welded vertex belongs to two UV islands, so a per-vertex UV would tear the atlas).
  4. SETTLE phase (~60 frames): gravity ON, shrink_min 0, self-collision ON (3 mm), knit-cotton
     settings. The welded shell drapes and forms folds.
  5. OUTPUT: out/{tee|pants}_high.obj (triangles + per-corner pattern UV normalised 0..1 over the
     sheet, needed for baking) and out/{tee|pants}_high.blend. Previews come from place.py's
     z-buffer raster (bpy.ops.render.render aborts headless CI): front/side/back + a close-up.

Prints the checks: triangles (20–120k), mean seam gap (<0.3 cm), share of vertices inside the body
(<0.5%), max edge stretch (<3x the rest length), simulation time. A tiny self-test at startup
verifies the sewing-spring mechanism and dumps this build's cloth RNA.

The task asks quality >= 8; measured on this CPU-only CI box that is ~37 s/frame. The reviewer
explicitly allows a coarser/cheaper run when CPU-bound (net step 1–1.2 cm, quality 5) — clean
form matters more than density. SIM_QUALITY / SIM_STEP / SIM_SEW / SIM_SETTLE override the defaults.
"""
import json, math, os, shutil, sys, time
from collections import defaultdict
import bpy                                              # Blender as a module (headless CI)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
PREVIEW = os.path.join(HERE, 'preview')
sys.path.insert(0, HERE)
import place
from place import sub, dot, cross, nrm, build_grid, bender, band_bender, Body, \
    edge_pts, sample_polyline, COLORS

# ── tunables (metres, seconds; the reviewer's Marvelous/CLO recipe) ────────────────────────────
STEP_SIM = float(os.environ.get('SIM_STEP', '1.2'))     # cm, warp grid of the high-poly cloth
MIN_CLEAR, PUSH_TO = 0.020, 0.032                       # push-out band, same as place.py
FPS = 24
FRAMES_SEW = int(os.environ.get('SIM_SEW', '55'))       # phase 1: seams close by sewing springs
FRAMES_SETTLE = int(os.environ.get('SIM_SETTLE', '50')) # phase 2: gravity + self-collision settle
QUALITY = int(os.environ.get('SIM_QUALITY', '6'))       # CPU-bound default; SIM_QUALITY=8 on [gpu]
FABRIC = dict(area_mass=0.15, tension=15.0, compression=15.0, shear=5.0, bending=0.5,
              self_dist=0.003, coll_thick=0.009, friction=5.0,
              sew_force=float(os.environ.get('SIM_SEW_FORCE', '25')))   # reviewer: 10–30
SHRINK_SEW = float(os.environ.get('SIM_SHRINK', '0.02'))  # reviewer: 0.05–0.1
SLEEVE_SLIDE = float(os.environ.get('SIM_SLIDE', '0.85'))   # share of the cap→armhole distance closed by placement
FUNNEL_CM = 14.0                                          # the funnel fades out this far down the sleeve (pattern cm)
PIN_DROP = float(os.environ.get('SIM_PIN_DROP', '0.05'))   # m below the nape: the pinned yoke
PIN_STIFF = float(os.environ.get('SIM_PIN_STIFF', '0.25'))
SHELL = os.environ.get('SIM_MODE', 'shell') == 'shell'   # sewn at placement (default) / 'sew' = springs
WELD_GAP = 0.003                                          # weld seam pairs closer than 3 mm
REST_VER = 'shell4'   # bump when the placement changes
COTTON = (0.78, 0.74, 0.68)


# ───────────────────────── 1. re-lay the pieces at sim resolution ─────────────────────────
def pushclear(V3, skin, iters=12):
    """move vertices to at least MIN_CLEAR from the skin, along the surface normal (as place.py)"""
    for _ in range(iters):
        worst = 0.0
        for i, p in enumerate(V3):
            d2, cp = skin.nearest(p)
            if d2 < MIN_CLEAR * MIN_CLEAR and cp is not None:
                d = math.sqrt(d2)
                out = sub(p, cp)
                ol = math.sqrt(dot(out, out))
                if ol < 1e-6:
                    out = (p[0], 0.0, p[2])         # radial fallback from the world Y axis
                    ol = math.sqrt(dot(out, out)) or 1.0
                push = PUSH_TO - d
                V3[i] = tuple(p[k] + out[k] / ol * push for k in range(3))
                worst = max(worst, push)
        if worst == 0:
            break


def nearest_ti(skin, p):
    """Body.nearest + the triangle index (for its normal)"""
    gx = int(p[0] / skin.cell); gy = int(p[1] / skin.cell); gz = int(p[2] / skin.cell)
    best, bcp, bti = 1e18, None, -1
    for r in range(1, 4):
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                for dz in range(-r, r + 1):
                    if max(abs(dx), abs(dy), abs(dz)) != r: continue
                    for ti in skin.grid.get((gx + dx, gy + dy, gz + dz), ()):
                        d2, cp = skin.d2tri(p, ti)
                        if d2 < best: best, bcp, bti = d2, cp, ti
        if best < (r * skin.cell) ** 2: break
    return best, bcp, bti


def smooth_push(V, F, skin, rounds=5, smooth=8, clear=0.012, push_to=0.018):
    """clear the cloth off the skin WITHOUT shredding it: (1) the push direction is the nearest skin triangle's
    outward normal, so a vertex that is already INSIDE goes out (pushing along p - closest drove it deeper);
    (2) the push is a displacement FIELD smoothed over the cloth mesh before it is applied, so the surface bulges
    smoothly over a shoulder instead of single vertices jumping out as spikes."""
    P, T = skin.P, skin.tris
    TN = []
    for a, b, c in T:
        n = cross(sub(P[b], P[a]), sub(P[c], P[a])); l = math.sqrt(dot(n, n)) or 1e-12
        TN.append((n[0] / l, n[1] / l, n[2] / l))
    # orientation: most normals must point away from the body's own vertical axis
    cx = sum(p[0] for p in P) / len(P); cz = sum(p[2] for p in P) / len(P)
    vote = sum(dot(TN[i], (P[t[0]][0] - cx, 0, P[t[0]][2] - cz)) for i, t in enumerate(T[::7]) for i in [i * 7])
    flip = -1.0 if vote < 0 else 1.0
    nb = [set() for _ in V]
    for a, b, c in F:
        nb[a].update((b, c)); nb[b].update((a, c)); nb[c].update((a, b))
    V = [list(p) for p in V]
    for _ in range(rounds):
        need = {}
        for i, p in enumerate(V):
            d2, cp, ti = nearest_ti(skin, p)
            if cp is None or d2 > (clear * 1.6) ** 2: continue
            n = tuple(flip * c for c in TN[ti]); sd = dot(sub(p, cp), n)
            if sd < clear:
                need[i] = tuple(n[k] * (push_to - sd) for k in range(3))
        if not need: break
        D = {i: list(d) for i, d in need.items()}
        for _ in range(smooth):                               # spread the field into the neighbourhood
            N = {}
            for i in set(D) | {j for i in D for j in nb[i]}:
                acc = [0.0, 0.0, 0.0]; cnt = 0
                for j in nb[i]:
                    if j in D: acc = [acc[k] + D[j][k] for k in range(3)]; cnt += 1
                if not cnt: continue
                avg = [acc[k] / (len(nb[i]) or 1) for k in range(3)]
                own = D.get(i, [0.0, 0.0, 0.0])
                if i in need:                                 # a colliding vertex keeps at least its own push
                    own = list(need[i])
                    if dot(avg, avg) > dot(own, own): own = avg
                    N[i] = own
                else:
                    N[i] = [(own[k] + avg[k]) * 0.5 for k in range(3)]
            D = N
        for i, d in D.items():
            V[i] = [V[i][k] + d[k] for k in range(3)]
        print(f'    отжим от кожи: {len(need)} вершин, поле на {len(D)}')
    return [tuple(p) for p in V]


def rollover(f, poly, sgn, z_mid, neck_w):
    """the torso cylinder leaves the front / back shoulder edges hanging in front of / behind the shoulders, and the
    seams then cut straight through the shoulder. Roll the top of each panel over the shoulder: along every pattern
    column the cloth below the top edge follows an arc from the panel's own plane toward the shoulder mid-plane z_mid,
    arc length kept. Shoulder columns (|u| >= neck_w) roll a full quarter turn so front and back shoulder edges meet on
    top of the shoulder; toward the centre the roll fades to none, so the neckline stays in front of / behind the neck."""
    n = len(poly)
    def top(u):
        ys = []
        for i in range(n):
            (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
            if (x1 <= u <= x2 or x2 <= u <= x1) and x1 != x2:
                ys.append(y1 + (y2 - y1) * (u - x1) / (x2 - x1))
        return min(ys) if ys else 0.0
    cache = {}
    def g(u, v):
        x, y, z = f(u, v)
        if u not in cache:
            t = top(u); r = abs(f(u, t)[2] - z_mid)
            k = min(1.0, abs(u) / neck_w); rho = k * k * (3 - 2 * k)
            cache[u] = (t, r, rho, f(u, t)[1])
        t, r, rho, y_edge = cache[u]
        if r < 0.01 or rho < 1e-3:
            return (x, y, z)
        L = rho * math.pi / 2 * r
        yc = y_edge - r * math.sin(rho * math.pi / 2)
        d = (v - t) / 100
        if d < L:
            ph = (L - d) / r
            return (x, yc + r * math.sin(ph), z_mid + sgn * r * math.cos(ph))
        return (x, yc - (d - L), z)
    return g


def torso_bender(name, poly, A):
    """front / back around a cylinder whose half turn is EXACTLY the panel width (the step-1 cylinder used the chest
    girth + a gap, so the side seams started ~8 cm apart): the side edges of front and back land on the same line"""
    xs = [p[0] for p in poly]; cx = (min(xs) + max(xs)) / 2; R = (max(xs) - min(xs)) / 100 / math.pi
    zc, yn = A['chest']['zc'], A['nape_y']; sg = 1 if name == 'front' else -1
    def f(u, v):
        th = (u - cx) / 100 / R
        return (R * math.sin(th), yn - v / 100, zc + sg * R * math.cos(th))
    return f


def sleeve_bender(name, part, A):
    """the sleeve as a closed tube around the arm: below the underarm every row wraps a full turn (its width between
    the two underarm-seam edges = the circumference), so the underarm seam closes by construction; the cap rows keep
    the underarm row's radius and are pulled to the armhole by the funnel"""
    s = 1 if name == 'sleeveP' else -1
    ar = A['arms']['L' if s > 0 else 'R']
    b0 = (ar['bicep_cx'], ar['bicep_y'], ar['bicep_cz']); e = (ar['elbow_cx'], ar['elbow_y'], ar['elbow_cz'])
    d = nrm(sub(e, b0))
    tip = A['sleeve_tip'][s]; Y = (0, 1, 0)
    e_top = nrm(tuple(Y[k] - dot(Y, d) * d[k] for k in range(3))); e_side = nrm(cross(d, e_top))
    sP, sM = edge_pts(part, 'seamP'), edge_pts(part, 'seamM')
    v_ua = max(min(p[1] for p in sP), min(p[1] for p in sM))
    def xat(line, v):
        for (x1, y1), (x2, y2) in zip(line, line[1:]):
            if (y1 <= v <= y2) or (y2 <= v <= y1):
                return x1 if y1 == y2 else x1 + (x2 - x1) * (v - y1) / (y2 - y1)
        return line[0][0] if abs(line[0][1] - v) < abs(line[-1][1] - v) else line[-1][0]
    hcap = A['cap_h']
    def f(u, v):
        vv = max(v, v_ua)
        a_, b_ = xat(sP, vv), xat(sM, vv); lo, hi = min(a_, b_), max(a_, b_); w = hi - lo
        R = w / 100 / (2 * math.pi) + 0.004
        th = math.pi * (u - (lo + hi) / 2) / (w / 2) if v >= v_ua else (u - (lo + hi) / 2) / 100 / R
        s_al = (v + hcap) / 100
        radial = tuple(e_top[k] * math.cos(th) + e_side[k] * math.sin(th) for k in range(3))
        return tuple(tip[k] + d[k] * s_al + R * radial[k] for k in range(3))
    return f


def zip_presew(V, seamG, part_of, V2g, fall_cm=7.0):
    """close every seam geometrically before any physics: each pair moves to its midpoint, and the move spreads into
    its own panel with a smooth falloff over fall_cm in PATTERN space (no Laplacian: it left slivers). Then the pairs
    coincide and are welded — the cloth starts as one closed shell whose rest shape is the panels' own shape."""
    D = {}
    for _, pr in seamG:
        for a, b in pr:
            m = tuple((V[a][k] + V[b][k]) / 2 for k in range(3))
            for i in (a, b):
                d = sub(m, V[i])
                if i in D: D[i] = tuple((D[i][k] + d[k]) / 2 for k in range(3))
                else: D[i] = d
    by_part = defaultdict(list)
    for i in D: by_part[part_of[i]].append(i)
    out = [list(p) for p in V]
    for i in range(len(V)):
        src = by_part.get(part_of[i])
        if not src: continue
        if i in D:
            out[i] = [V[i][k] + D[i][k] for k in range(3)]; continue
        wsum, acc, dmin = 0.0, [0.0, 0.0, 0.0], 1e9
        u, v = V2g[i]
        for j in src:
            dd = math.hypot(V2g[j][0] - u, V2g[j][1] - v)
            if dd > fall_cm: continue
            dmin = min(dmin, dd); w = 1.0 / (dd * dd + 0.25)
            wsum += w
            for k in range(3): acc[k] += w * D[j][k]
        if not wsum: continue
        t = 1 - dmin / fall_cm; t = t * t * (3 - 2 * t)
        out[i] = [V[i][k] + acc[k] / wsum * t for k in range(3)]
    return out


def build_parts(garment, pat, skin, bodyP, bodyT):
    """returns {name: {verts3, V2 (pattern cm), faces}}. Uses the SAME benders as step 1."""
    if garment == 'tee':
        A = dict(pat['anchors']); prm = pat['params']
        A['cap_h'] = prm['cap_h']
        A['band_y'] = A['neck']['y'] - 0.02
        ytip = A['nape_y'] - prm['y_tip'] / 100
        A['sleeve_tip'] = {1: (prm['tipx'] / 100, ytip, A['arms']['L']['bicep_cz']),
                           -1: (-prm['tipx'] / 100, ytip, A['arms']['R']['bicep_cz'])}
        benders = {}
        # shoulder mid-plane: the mean z of the skin on top of the shoulders
        zs = [p[2] for p in bodyP if A['nape_y'] - 0.09 < p[1] < A['nape_y'] - 0.01 and 0.07 < abs(p[0]) < 0.17]
        z_mid = sum(zs) / len(zs)
        for name in pat['parts']:
            poly = [tuple(p) for p in pat['parts'][name]['pts']]
            if name in ('front', 'back'):
                nk = edge_pts(pat['parts'][name], 'neck'); neck_w = max(abs(q[0]) for q in nk)
                f = rollover(torso_bender(name, poly, A), poly, 1 if name == 'front' else -1, z_mid, neck_w)
            elif name in ('sleeveP', 'sleeveM'):
                f = sleeve_bender(name, pat['parts'][name], A)
            else:
                f = bender(name, A) or band_bender(A, pat, bender('front', A), bender('back', A))
            benders[name] = f
        # funnel each sleeve toward its armhole: the cap ring sat ~15 cm from the armhole loop, and the sewing springs then
        # dragged the shoulders apart and crumpled the caps. Every sleeve vertex moves by the cap→armhole offset of its
        # nearest cap point (pairs at the same arc fraction, exactly as the seam spec pairs them), fading out 14 cm down
        # the sleeve in the pattern, so the cap starts a few cm from the armhole and the tube keeps its shape below.
        def chain(specs):
            out = []
            for sp in specs:
                pts = edge_pts(pat['parts'][sp[0]], sp[1])
                if len(sp) > 2 and sp[2]: pts = pts[::-1]
                out += [(sp[0], q) for q in pts]
            return out
        def resample(ch, n):
            L = [0.0]
            for a_, b_ in zip(ch, ch[1:]): L.append(L[-1] + math.dist(a_[1], b_[1]) if a_[0] == b_[0] else L[-1])
            out = []
            for k in range(n):
                t = L[-1] * k / (n - 1); i_ = max(0, min(len(L) - 2, next((m for m in range(len(L) - 1) if L[m + 1] >= t), len(L) - 2)))
                a_, b_ = ch[i_], ch[i_ + 1]; w = 0 if L[i_ + 1] == L[i_] else (t - L[i_]) / (L[i_ + 1] - L[i_])
                pn = a_[0] if w < 0.5 else b_[0]
                out.append((pn, (a_[1][0] + (b_[1][0] - a_[1][0]) * w, a_[1][1] + (b_[1][1] - a_[1][1]) * w)))
            return out
        for sm in pat['seams']:
            if not sm['a'][0][1] == 'cap': continue
            sl = sm['a'][0][0]
            cap = resample(chain(sm['a']), 48); hole = resample(chain(sm['b']), 48)
            caps2 = [q for _, q in cap]
            D = [sub(benders[hn](*hq), benders[sl](*cq)) for (_, cq), (hn, hq) in zip(cap, hole)]
            f0 = benders[sl]
            def funnel(u, v, f0=f0, caps2=caps2, D=D):
                # closest point on the cap polyline (continuous), the cap→armhole offset interpolated along it:
                # the nearest-sample version moved the cloth in steps and creased the rest shape at the armhole
                best = (1e18, 0, 0.0)
                for m in range(len(caps2) - 1):
                    (x1, y1), (x2, y2) = caps2[m], caps2[m + 1]
                    dx, dy = x2 - x1, y2 - y1; L2 = dx * dx + dy * dy or 1e-9
                    t = max(0.0, min(1.0, ((u - x1) * dx + (v - y1) * dy) / L2))
                    d2 = (x1 + dx * t - u) ** 2 + (y1 + dy * t - v) ** 2
                    if d2 < best[0]: best = (d2, m, t)
                d2, m, t = best
                w = max(0.0, 1 - math.sqrt(d2) / FUNNEL_CM) ** 2 * SLEEVE_SLIDE
                w = w * w * (3 - 2 * w) if w < 1 else w
                Dk = tuple(D[m][i] + (D[m + 1][i] - D[m][i]) * t for i in range(3))
                p0 = f0(u, v)
                return tuple(p0[i] + Dk[i] * w for i in range(3))
            benders[sl] = funnel
            print(f'    {sl}: окат подтянут к пройме (средний зазор был {sum(math.sqrt(dot(d, d)) for d in D) / len(D) * 100:.1f} см)')
    else:                                                    # pants: step-1 bender needs its measures
        import pants as PN
        sk = json.load(open(os.path.join(OUT, 'body_skin.json')))
        M = PN.measure(bodyP, bodyT, sk)
        benders = {name: PN.bender(M, name, [tuple(p) for p in part['pts']])
                   for name, part in pat['parts'].items()}
    parts = {}
    print(f'— раскладка деталей без пошива (сетка {STEP_SIM} см):')
    for name, part in pat['parts'].items():
        poly = [tuple(p) for p in part['pts']]
        V, F, idxmap, cols, nrows = build_grid(poly, STEP_SIM)
        f = benders[name]
        V3 = [f(u, v) for u, v in V]
        if not SHELL: pushclear(V3, skin, 30 if garment == 'pants' else 12)   # the shell is cleared after zipping (smooth_push)
        parts[name] = dict(verts3=V3, V2=V, faces=F)
        print(f'    {name:9}: {len(V3)} вершин, {len(F)} граней')
    return parts


# ───────────────────────── 2. seams as vertex-index pairs (→ loose edges) ─────────────────────────
def edge_idx_list(part, pt, ename):
    """grid vertices along a pattern edge, ordered along it (same sampling as place.py)"""
    poly = edge_pts(part, ename)
    out, last = [], -1
    for sp in sample_polyline([(x, y, 0) for x, y in poly], every=STEP_SIM * 1.2):
        u, v = sp[0], sp[1]
        best, bi = 1e18, None
        for i, (vu, vv) in enumerate(pt['V2']):
            if i == last:
                continue
            d2 = (vu - u) ** 2 + (vv - v) ** 2
            if d2 < best:
                best, bi = d2, i
        if bi is not None and best < (3.6) ** 2:
            out.append(bi); last = bi
    return out


def seam_pairs(pat, parts):
    """[(name, [(partA_index, partB_index), ...])] in PATTERN-LOCAL vertex indices"""
    seams = []
    for s in pat['seams']:
        def side(spec):
            pname, ename = spec[0], spec[1]
            idx = edge_idx_list(pat['parts'][pname], parts[pname], ename)
            return list(reversed(idx)) if len(spec) > 2 and spec[2] else idx
        a, b = [], []
        for spec in s['a']:
            a += [(spec[0], i) for i in side(spec)]
        for spec in s['b']:
            b += [(spec[0], i) for i in side(spec)]
        seams.append((s['name'], list(zip(a, b))))
    return seams


# ───────────────────────── 3. pattern UV (non-overlapping atlas, 0..1) ─────────────────────────
def sheet_uv(parts):
    """each vertex gets its 2D coordinate on its pattern piece (cm), normalised to 0..1 over a
    sheet of tiled pieces (parts must not overlap in UV space — needed for the baking step)"""
    boxes, order = {}, list(parts)
    for name in order:
        us = [p[0] for p in parts[name]['V2']]; vs = [p[1] for p in parts[name]['V2']]
        boxes[name] = (min(us), min(vs), max(us), max(vs))
    cw = max(b[2] - b[0] for b in boxes.values()) * 1.12 + 1.0
    ch = max(b[3] - b[1] for b in boxes.values()) * 1.12 + 1.0
    ncol = math.ceil(math.sqrt(len(order)))
    nrow = math.ceil(len(order) / ncol)
    W, H = cw * ncol, ch * nrow
    uv = {}
    for k, name in enumerate(order):
        u0, v0 = boxes[name][0], boxes[name][1]
        ox, oy = (k % ncol) * cw, (k // ncol) * ch
        uv[name] = [((ox + (u - u0) + 0.5) / W, 1.0 - (oy + (v - v0) + 0.5) / H)
                    for u, v in parts[name]['V2']]
    return uv


def join(parts, seams, uv):
    """ONE mesh, separate islands. Seam pairs become LOOSE edges (Blender sewing springs)."""
    V, F, UV, off = [], [], [], {}
    for name, pt in parts.items():
        off[name] = len(V)
        base = len(V)
        V += pt['verts3']
        F += [[a + base, b + base, c + base] for a, b, c in pt['faces']]
        UV += uv[name]
    seamG, E = [], []
    for nm, pr in seams:
        pairs = [(off[pa] + ia, off[pb] + ib) for (pa, ia), (pb, ib) in pr]
        seamG.append((nm, pairs))
        E += pairs
    # de-duplicate loose edges (a corner vertex can be shared by two seams)
    E = sorted({(min(a, b), max(a, b)) for a, b in E if a != b})
    return V, F, UV, seamG, E, off


def mesh_area(V, F):
    s = 0.0
    for a, b, c in F:
        e1, e2 = sub(V[b], V[a]), sub(V[c], V[a])
        n = cross(e1, e2)
        s += math.sqrt(dot(n, n)) / 2
    return s


# ───────────────────────── 4. Blender RNA helpers ─────────────────────────
def setp(ob, name, val, log, miss):
    try:
        setattr(ob, name, val); log.append(f'{name}={val}'); return True
    except (AttributeError, TypeError, ValueError):
        miss.append(name); return False


def try_names(ob, candidates, val, log, miss):
    for nm in candidates:
        if hasattr(ob, nm):
            return setp(ob, nm, val, log, miss)
    miss.extend(candidates); return False


def fix_degenerate(V, F, minlen=0.0015):
    """rest edges shorter than 1.5 mm give zero-length springs → nudge them apart"""
    seen, fixed = set(), 0
    for a, b, c in F:
        for u, v in ((a, b), (b, c), (a, c)):
            e = (u, v) if u < v else (v, u)
            if e in seen:
                continue
            seen.add(e)
            pu, pv = V[e[0]], V[e[1]]
            d = math.dist(pu, pv)
            if d < minlen:
                fixed += 1
                dirv = tuple((pv[k] - pu[k]) / d for k in range(3)) if d > 1e-9 else (0.0, 0.0, 1.0)
                V[e[1]] = [pu[k] + dirv[k] * (minlen + 0.0005) for k in range(3)]
    if fixed:
        print(f'— исправлено коротких рёбер: {fixed} (<{minlen*1000:.0f} мм)')
    return fixed


# ───────────────────────── 5. cloth settings (both phases) ─────────────────────────
def cfg(st, cs, mass, sewing, shrink, self_coll, quality):
    log, miss = [], []
    def S(ob, names, val):
        try_names(ob, names, val, log, miss)
    S(st, ['quality'], quality)
    S(st, ['mass'], mass)
    S(st, ['tension_stiffness'], FABRIC['tension'])
    S(st, ['compression_stiffness'], FABRIC['compression'])
    S(st, ['shear_stiffness'], FABRIC['shear'])
    S(st, ['bending_stiffness'], FABRIC['bending'])
    S(st, ['shrink_min'], shrink)                       # sewing phase contracts the knit a little
    S(st, ['shrink_max'], shrink)
    S(st, ['use_sewing_springs'], bool(sewing))
    if sewing:
        S(st, ['sewing_force_max', 'sewing_spring_max', 'max_sewing_force'], FABRIC['sew_force'])
    S(st, ['max_velocity'], 5.0)                        # m/s — 50 clamped nothing
    S(cs, ['collision_quality'], 4)
    S(cs, ['use_collision'], True)
    S(cs, ['distance_min'], FABRIC['self_dist'])
    S(cs, ['use_self_collision'], bool(self_coll))
    if self_coll:
        S(cs, ['self_distance_min', 'self_distance'], FABRIC['self_dist'])
    S(cs, ['friction', 'object_friction'], FABRIC['friction'])
    return log, miss


def make_body_collider(sc, bodyP, bodyT):
    me = bpy.data.meshes.new('body')
    me.from_pydata([list(p) for p in bodyP], [], [list(t) for t in bodyT])
    me.validate(); me.update()
    import bmesh                                          # close the cut neck / pelvis rings and the UV-seam splits
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    if os.environ.get('SIM_FILL', '0') == '1':
        bmesh.ops.holes_fill(bm, edges=bm.edges, sides=0)
    bm.to_mesh(me); bm.free(); me.update()
    ob = bpy.data.objects.new('body', me)
    sc.collection.objects.link(ob)
    cm = ob.modifiers.new('Collision', 'COLLISION')
    cset = getattr(cm, 'settings', cm)
    log, miss = [], []
    try_names(cset, ['thickness_outer'], FABRIC['coll_thick'], log, miss)
    try_names(cset, ['thickness_inner'], 0.001, log, miss)
    try_names(cset, ['cloth_friction', 'friction'], FABRIC['friction'], log, miss)
    return ob, log, miss


def run_phase(tag, V, F, E_sew, bodyP, bodyT, mass, frames, gravity, sewing, shrink,
              self_coll, quality, blend=None, pin=None):
    """one cloth bake in a fresh scene. blend=(path, WV, WF, loop_uv) saves the final .blend."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.gravity = gravity
    sc.frame_start, sc.frame_end = 1, frames
    make_body_collider(sc, bodyP, bodyT)
    cme = bpy.data.meshes.new('cloth')
    cme.from_pydata([list(p) for p in V], [list(e) for e in E_sew], [list(f) for f in F])
    cme.update()          # NOTE: do NOT validate() — it drops the loose sewing edges
    nloose = sum(1 for e in cme.edges if e.is_loose) if hasattr(cme.edges[0], 'is_loose') else \
        (len(cme.edges) - len({tuple(sorted(e.vertices)) for p in cme.polygons for e in p.edge_keys}))
    cob = bpy.data.objects.new('cloth', cme)
    sc.collection.objects.link(cob)
    md = cob.modifiers.new('Cloth', 'CLOTH')
    st, cs = md.settings, md.collision_settings
    log, miss = cfg(st, cs, mass, sewing, shrink, self_coll, quality)
    if pin:                                   # {vertex: weight} — the yoke rides on the shoulders (a hanger, as in CLO)
        vg = cob.vertex_groups.new(name='pin')
        for i, w in pin.items(): vg.add([i], w, 'REPLACE')
        st.vertex_group_mass = 'pin'; st.pin_stiffness = PIN_STIFF
    print(f'  [{tag}] гравитация {gravity}, кадров {frames}, quality {quality}, '
          f'рёбер-швов {len(E_sew)} (loose={nloose}), вершин {len(V)}')
    print(f'  [{tag}] ткань: ' + ', '.join(log) + (f'  (нет RNA: {sorted(set(miss))})' if miss else ''))
    t0 = time.time()
    for fr in range(1, frames + 1):
        sc.frame_set(fr)
        if fr == 5 or fr % 15 == 0 or fr == frames:
            el = time.time() - t0
            print(f'    кадр {fr}/{frames}: {el:.0f} с (~{el/fr:.2f} с/кадр)')
    t_sim = time.time() - t0
    dep = bpy.context.evaluated_depsgraph_get()
    ev = cob.evaluated_get(dep)
    m2 = ev.to_mesh()
    Vs = [tuple(v.co) for v in m2.vertices]
    ev.to_mesh_clear()
    if blend:
        path, WV, WF, loop_uv = blend
        fin = bpy.data.meshes.new('high')
        fin.from_pydata([list(p) for p in WV], [], [list(f) for f in WF])
        fin.update()
        uvl = fin.uv_layers.new(name='UVMap')
        for pi, poly in enumerate(fin.polygons):
            for k, li in enumerate(poly.loop_indices):
                uvl.data[li].uv = loop_uv[pi][k]
        fin.update()
        cob.modifiers.remove(md)
        cob.data = fin
        cob.name = 'high'
        bpy.ops.wm.save_as_mainfile(filepath=path)
        print(f'  → {os.path.basename(path)} (модификатор применён на кадре {frames})')
    return Vs, t_sim


def probe():
    """cheap self-test: two quads 30 cm apart joined by ONE loose edge. If sewing springs work,
    that edge collapses to ~0. Also dumps this build's cloth RNA. No input files needed."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.gravity = (0, 0, 0)
    V = [(-.1, -.1, 0), (.1, -.1, 0), (.1, .1, 0), (-.1, .1, 0),
         (-.1, -.1, .3), (.1, -.1, .3), (.1, .1, .3), (-.1, .1, .3)]
    F = [(0, 1, 2), (0, 2, 3), (4, 6, 5), (4, 7, 6)]
    E = [(0, 4)]
    me = bpy.data.meshes.new('probe')
    me.from_pydata([list(p) for p in V], [list(e) for e in E], [list(f) for f in F])
    me.update()
    ob = bpy.data.objects.new('probe', me); sc.collection.objects.link(ob)
    md = ob.modifiers.new('Cloth', 'CLOTH')
    st, cs = md.settings, md.collision_settings
    print('  [probe] cloth RNA:', ', '.join(p.identifier for p in st.bl_rna.properties if not p.is_readonly))
    print('  [probe] coll  RNA:', ', '.join(p.identifier for p in cs.bl_rna.properties if not p.is_readonly))
    log, miss = [], []
    try_names(st, ['quality'], 5, log, miss)
    try_names(st, ['use_sewing_springs'], True, log, miss)
    try_names(st, ['sewing_force_max', 'sewing_spring_max', 'max_sewing_force'], 25, log, miss)
    try_names(cs, ['use_self_collision'], False, log, miss)
    print('  [probe] set:', ', '.join(log), (' miss=' + str(sorted(set(miss))) if miss else ''))
    print(f'  [probe] меш: {len(me.vertices)} вершин, {len(me.edges)} рёбер, {len(me.polygons)} граней')
    for fr in range(1, 31):
        sc.frame_set(fr)
    dep = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dep); m2 = ev.to_mesh()
    d = math.dist(m2.vertices[0].co, m2.vertices[4].co)
    ev.to_mesh_clear()
    ok = d < 0.05
    print(f'  [probe] зазор шва 30 см → {d*100:.2f} см за 30 кадров: '
          f'{"OK — швы стягиваются сами" if ok else "ВНИМАНИЕ — механизм sewing springs не сработал"}')
    return ok


# ───────────────────────── 6. weld AFTER sewing ─────────────────────────
def weld(Vs, V0, F0, UV0, seamG):
    """merge converged seam pairs into one vertex (a single manifold shell). Returns
    WV (positions), faces_w=[(welded_tri, orig_tri)], remap (orig→welded)."""
    par = list(range(len(V0)))
    def find(i):
        while par[i] != i:
            par[i] = par[par[i]]; i = par[i]
        return i
    nclose = nfar = 0
    for _, pr in seamG:
        for a, b in pr:
            g = math.dist(Vs[a], Vs[b])
            if g >= WELD_GAP:
                nfar += 1; continue          # an open pair stays open: averaging points 10-40 cm apart made the huge shards
            nclose += 1
            ra, rb = find(a), find(b)
            if ra != rb:
                par[rb] = ra
    groups = defaultdict(list)
    for i in range(len(V0)):
        groups[find(i)].append(i)
    remap, WV = {}, []
    for r, members in groups.items():
        remap[r] = len(WV)
        WV.append(tuple(sum(Vs[m][k] for m in members) / len(members) for k in range(3)))
        for m in members:
            remap[m] = remap[r]                        # flat lookup for every original vertex
    faces_w, dropped = [], 0
    for f0 in F0:
        wf = tuple(remap[i] for i in f0)
        if len(set(wf)) < 3:
            dropped += 1
            continue
        faces_w.append((wf, f0))
    print(f'— сварка после пошива: пар сошлось {nclose} / не дошли {nfar}, '
          f'слито {len(V0)-len(WV)} вершин, граней-вырожек {dropped}, '
          f'осталось {len(WV)} вершин / {len(faces_w)} треугольников')
    return WV, faces_w, remap


def loop_uv(faces_w, UV0):
    return [[UV0[f0[k]] for k in range(3)] for wf, f0 in faces_w]


# ───────────────────────── 7. checks ─────────────────────────
def check_seams(Vs, seamG):
    print('— проверки:')
    bad, allg = 0, []
    for nm, pr in seamG:
        if not pr:
            print(f'    ✗ шов {nm:22}: нет пар вершин'); bad += 1; continue
        g = [math.dist(Vs[a], Vs[b]) for a, b in pr]
        allg += g
        m = sum(g) / len(g)
        ok = m < 0.003
        bad += 0 if ok else 1
        print(f'    {"✓" if ok else "✗"} шов {nm:22}: {len(pr)} пар, зазор сред. {m*100:.2f} / '
              f'макс {max(g)*100:.1f} см (цель <0.3)')
    mean = sum(allg) / len(allg) if allg else 9.9
    print(f'    средний зазор по всем швам: {mean*100:.2f} см')
    return bad, mean


def check_penetration(V, bodyP, bodyT):
    skin = Body(bodyP, bodyT)
    vol = sum(dot(bodyP[a], cross(bodyP[b], bodyP[c])) for a, b, c in bodyT) / 6.0
    sgn = 1.0 if vol > 0 else -1.0
    tn = [tuple(sgn * k for k in nrm(cross(sub(bodyP[b], bodyP[a]), sub(bodyP[c], bodyP[a]))))
          for a, b, c in bodyT]
    inside = 0
    for p in V:
        d2, cp = skin.nearest(p)
        if d2 > 0.02 ** 2 or cp is None:
            continue
        gx, gy, gz = int(p[0]/skin.cell), int(p[1]/skin.cell), int(p[2]/skin.cell)
        found = False
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for ti in skin.grid.get((gx+dx, gy+dy, gz+dz), ()):
                        dt2, cpt = skin.d2tri(p, ti)
                        if dt2 < 0.02 ** 2 and dot(sub(p, cpt), tn[ti]) < 0:
                            found = True
        if found:
            inside += 1
    frac = inside / len(V)
    ok = frac < 0.005
    print(f'    {"✓" if ok else "✗"} сквозь тело: {inside} вершин внутри ({frac*100:.2f}%, цель <0.5%)')
    return 0 if ok else 1


def check_stretch(V0, V1, F0):
    edges = set()
    for a, b, c in F0:
        edges.add((min(a, b), max(a, b)))
        edges.add((min(b, c), max(b, c)))
        edges.add((min(a, c), max(a, c)))
    worst = 0.0
    for a, b in edges:
        r0 = max(math.dist(V0[a], V0[b]), 1e-6)
        worst = max(worst, math.dist(V1[a], V1[b]) / r0)
    ok = worst < 3.0
    print(f'    {"✓" if ok else "✗"} растяжение: макс ребро {worst:.2f}× от исходной (цель <3×), '
          f'рёбер {len(edges)}')
    return 0 if ok else 1


# ───────────────────────── 8. outputs ─────────────────────────
def write_obj(path, V, faces_w, UV0):
    """per-corner pattern UV: a welded vertex sits on two UV islands, so vt is indexed by the
    ORIGINAL vertex of each face corner while v/vn use the welded vertex."""
    nrmv = [[0.0]*3 for _ in V]
    for wf, f0 in faces_w:
        n = cross(sub(V[wf[1]], V[wf[0]]), sub(V[wf[2]], V[wf[0]]))
        for vi in wf:
            for k in range(3):
                nrmv[vi][k] += n[k]
    with open(path, 'w') as f:
        f.write(f'# {os.path.basename(path)} — issue #56: sewn + simulated, metres, Y up, face +Z\n')
        f.write('o high\n')
        for p in V:
            f.write(f'v {p[0]:.5f} {p[1]:.5f} {p[2]:.5f}\n')
        for u, v in UV0:
            f.write(f'vt {u:.5f} {v:.5f}\n')
        for n in nrmv:
            ln = math.sqrt(dot(n, n)) or 1.0
            f.write(f'vn {n[0]/ln:.4f} {n[1]/ln:.4f} {n[2]/ln:.4f}\n')
        for wf, f0 in faces_w:
            f.write('f ' + ' '.join(f'{wf[k]+1}/{f0[k]+1}/{wf[k]+1}' for k in range(3)) + '\n')


def previews(Vs, WF, bodyP, bodyT, garment):
    bd = dict(verts3=bodyP, tris=bodyT)
    p3 = {'g': dict(verts3=Vs, faces=WF, color=COTTON)}
    if garment == 'tee':
        tag, views = 'sim', {'front': ('front', None, None), 'side': ('side', None, None),
                            'back': ('back', None, None), 'close': ('front', (0.19, 1.43), 0.17)}
    else:
        tag, views = 'pants_sim', {'front': ('front', None, None), 'side': ('side', None, None),
                                  'back': ('back', None, None), 'close': ('front', (0.0, 0.97), 0.22)}
    os.makedirs(PREVIEW, exist_ok=True)
    for name, (view, center, radius) in views.items():
        p = os.path.join(OUT, f'{tag}_{name}.png')
        place.raster(bd, p3, [], view, p, 800, 800, center=center, radius=radius)
        shutil.copyfile(p, os.path.join(PREVIEW, f'{tag}_{name}.png'))
        print(f'    превью → preview/{tag}_{name}.png')


# ───────────────────────── 9. cached rest mesh ─────────────────────────
def rest_path(garment):
    return os.path.join(OUT, f'{garment}_rest.json')


def load_rest(garment):
    if os.environ.get('SIM_FRESH'):
        return None
    p = rest_path(garment)
    if not os.path.exists(p):
        return None
    d = json.load(open(p))
    if abs(d.get('step', -1) - STEP_SIM) > 1e-9 or d.get('ver') != REST_VER:
        print('— кеш покоя устарел — пересобираю'); return None
    V = [tuple(v) for v in d['V']]; F = [tuple(f) for f in d['F']]
    UV = [tuple(u) for u in d['UV']]
    seamG = [(nm, [tuple(x) for x in pr]) for nm, pr in d['seams']]
    E = [tuple(e) for e in d['E']]
    print(f'— кеш покоя: {p} ({len(V)} вершин; SIM_FRESH=1 пересобрать)')
    return V, F, UV, seamG, E


def save_rest(garment, V, F, UV, seamG, E):
    json.dump(dict(step=STEP_SIM, ver=REST_VER,
                   V=[[round(c, 5) for c in p] for p in V], F=[list(f) for f in F],
                   UV=[[round(c, 5) for c in u] for u in UV],
                   seams=[[nm, [list(x) for x in pr]] for nm, pr in seamG], E=[list(e) for e in E]),
              open(rest_path(garment), 'w'))


# ───────────────────────── main ─────────────────────────
def main():
    args = sys.argv[1:]
    garment = args[args.index('--garment') + 1] if '--garment' in args and \
        args.index('--garment') + 1 < len(args) else 'tee'
    if garment not in ('tee', 'pants'):
        print(f'неизвестный --garment {garment}'); return 1
    pat_name = 'tee.json' if garment == 'tee' else 'pants.json'
    objp, patp = os.path.join(OUT, 'body.obj'), os.path.join(OUT, pat_name)
    print(f'=== issue #56: пошив и симуляция — {garment} ===')
    sew_ok = probe()                                     # verifies sewing springs, no inputs needed
    if not (os.path.exists(objp) and os.path.exists(patp)):
        print(f'нет out/body.obj / out/{pat_name} — сначала run_all.sh (шаги 1–3)')
        return 0 if sew_ok else 1
    bodyP, bodyT = place.load_obj(objp)
    pat = json.load(open(patp))
    if SHELL and garment == 'tee':        # the neckband strip is a separate ring that never sat on the neckline — later
        pat['parts'] = {k: v for k, v in pat['parts'].items() if k != 'band'}
        pat['seams'] = [sm for sm in pat['seams'] if all(sp[0] != 'band' for sp in sm['a'] + sm['b'])]
    cached = load_rest(garment)
    if cached:
        V0, F0, UV0, seamG, E = cached
    else:
        skin = Body(bodyP, bodyT)
        parts = build_parts(garment, pat, skin, bodyP, bodyT)
        seams = seam_pairs(pat, parts)
        V0, F0, UV0, seamG, E, off = join(parts, seams, sheet_uv(parts))
        if SHELL:
            part_of, V2g = [], []
            for name, pt in parts.items():
                part_of += [name] * len(pt['verts3']); V2g += pt['V2']
            V0 = zip_presew(V0, seamG, part_of, V2g)
            V0 = smooth_push(V0, F0, skin)
        save_rest(garment, V0, F0, UV0, seamG, E)
    if os.environ.get('SIM_REST_ONLY'):
        print('— только покой (SIM_REST_ONLY)'); return 0
    print('— швы до пошива (рёбра-пружины, зазоры как из раскладки):')
    for nm, pr in seamG:
        g = [math.dist(V0[a], V0[b]) for a, b in pr]
        print(f'    {nm:22}: {len(pr)} пар, зазор сред. {sum(g)/max(1,len(g))*100:.1f} / '
              f'макс {max(g)*100:.1f} см')
    V0 = [list(p) for p in V0]
    F0 = [tuple(f) for f in F0]
    fix_degenerate(V0, F0)
    area = mesh_area(V0, F0)
    mass = FABRIC['area_mass'] * area
    print(f'— меш: {len(V0)} вершин, {len(F0)} треугольников (цель 20–120k), площадь {area:.2f} м², '
          f'масса {mass:.3f} кг')
    bad = 0 if 20000 <= len(F0) <= 120000 else 1
    print(f'    {"✓" if not bad else "✗"} число треугольников')

    blendp = os.path.join(OUT, f'{garment}_high.blend')
    if SHELL:
        # ── the shell is already sewn: weld the (now coincident) pairs, then ONE settle with gravity ──
        WV, faces_w, remap = weld(V0, V0, F0, UV0, seamG)
        WF = [wf for wf, f0 in faces_w]
        luv = loop_uv(faces_w, UV0)
        t1 = 0.0
        pin = None
        if garment == 'tee':                  # pin the yoke: everything above the shoulder line minus PIN_DROP, ramped
            y0 = pat['anchors']['nape_y'] - PIN_DROP
            pin = {i: min(1.0, (p[1] - y0) / 0.03) for i, p in enumerate(WV) if p[1] > y0}
            print(f'    пин кокетки: {len(pin)} вершин выше y={y0:.3f}')
        Vs_B, t2 = run_phase('усадка', WV, WF, [], bodyP, bodyT, mass, FRAMES_SETTLE,
                             gravity=(0, -9.81, 0), sewing=False, shrink=0.0,
                             self_coll=True, quality=QUALITY, blend=(blendp, WV, WF, luv), pin=pin)
        seam_bad = 0
    else:
        # ── PHASE 1: sew (gravity 0, no self-collision, slight shrink) ──
        Vs_A, t1 = run_phase('пошив', V0, F0, E, bodyP, bodyT, mass, FRAMES_SEW,
                             gravity=(0, 0, 0), sewing=True, shrink=SHRINK_SEW,
                             self_coll=False, quality=QUALITY)
        seam_bad, mean_gap = check_seams(Vs_A, seamG)
        WV, faces_w, remap = weld(Vs_A, V0, F0, UV0, seamG)
        WF = [wf for wf, f0 in faces_w]
        luv = loop_uv(faces_w, UV0)
        # ── PHASE 2: settle (gravity on, self-collision on) ──
        Vs_B, t2 = run_phase('усадка', WV, WF, [], bodyP, bodyT, mass, FRAMES_SETTLE,
                             gravity=(0, -9.81, 0), sewing=False, shrink=0.0,
                             self_coll=True, quality=QUALITY,
                             blend=(blendp, WV, WF, luv))

    # ── checks on the FINAL (settle) result ──
    Vs_final_orig = [Vs_B[remap[i]] for i in range(len(V0))]   # un-weld for the edge check
    bad += check_penetration(Vs_B, bodyP, bodyT)
    bad += check_stretch(V0, Vs_final_orig, F0)
    bad += seam_bad
    print(f'    время симуляции: пошив {t1:.0f} с + усадка {t2:.0f} с = {t1+t2:.0f} с '
          f'({(t1+t2)/FPS:.1f} с экранного времени)')
    objp2 = os.path.join(OUT, f'{garment}_high.obj')
    write_obj(objp2, Vs_B, faces_w, UV0)
    print(f'  → {objp2}')
    previews(Vs_B, WF, bodyP, bodyT, garment)
    print('ИТОГ: ' + ('пошив и симуляция сошлись' if not bad else f'ПРОБЛЕМ: {bad}'))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
