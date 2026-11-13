#!/usr/bin/env python3
"""Issue #55 step 1 — parametric T-shirt pattern from the exported body.

    python3 tools/assets/cloth/pattern.py

Reads out/body.obj (+ out/body_skin.json for the bind-pose bones). Torso girths (chest / hips /
neck) come from horizontal plane slices; triangle cuts are chained into closed loops and their
perimeter is the girth. The arms are in an A-pose (~30 deg below horizontal), so their sections
are cut PERPENDICULAR to the shoulder->hand bone axis instead (arm_measure) — a horizontal cut
would land on the forearm and the cropped fist would give no closed loop. Drafts the pattern in
CENTIMETRES, y down from the nape point (y=0):

  front, back  — width (chest+ease)/2, straight sides, hem near the hip, shoulder seams,
                 curved armholes and necklines (16+ points each);
  sleeve x2    — cap endpoints sit at the armhole, the cap arc length is solved (bisection) so
                 it equals front+back armhole exactly; the tube flares to the bicep girth+ease;
  neckband     — straight strip whose seam edge equals the front+back neckline length.

Seams are pairs of edges; every pair is measured, the script checks ±2% and prints it.
Writes out/tee.json (parts, edges, seams, body anchors for step 2 place.py) and out/tee.svg,
and tries to rasterise the SVG to out/tee.png (cairosvg, then headless chromium, else warn).
"""
import json, math, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
PREVIEW = os.path.join(HERE, 'preview')     # committed report PNGs (out/ is git-ignored)

EASE_CHEST = 6.0     # cm of ease around the chest girth
EASE_ARM = 4.0       # cm around the bicep
BAND_W = 2.2         # neckband width, cm
Ncurve = 16          # points on neck/armhole/cap curves (task: 12+)


# ───────────────────────── body: obj + slices ─────────────────────────
def load_obj(path):
    P, tris = [], []
    for ln in open(path):
        if ln.startswith('v '):
            P.append(tuple(float(x) for x in ln.split()[1:4]))
        elif ln.startswith('f '):
            tris.append(tuple(int(x.split('/')[0]) - 1 for x in ln.split()[1:4]))
    return P, tris


def slice_loops(P, tris, yh):
    """chain triangle/plane segments into closed loops -> list of dict(per, area, cx, cz, pts), metres"""
    segs = []
    for a, c, d in tris:
        above = [P[a][1] - yh, P[c][1] - yh, P[d][1] - yh]
        sgn = [1 if s > 1e-7 else -1 if s < -1e-7 else 0 for s in above]
        if sum(1 for s in sgn if s) < 2:
            continue
        pts = []
        vid = (a, c, d)
        for k in range(3):
            if sgn[k] == 0:
                w = vid[k]
                pts.append((P[w][0], P[w][2]))
                continue
            i1, i2 = k, (k + 1) % 3
            if sgn[i1] and sgn[i2] and sgn[i1] != sgn[i2]:
                f = above[i1] / (above[i1] - above[i2])
                vv, ww = vid[i1], vid[i2]
                pts.append((P[vv][0] + (P[ww][0] - P[vv][0]) * f,
                            P[vv][2] + (P[ww][2] - P[vv][2]) * f))
        if len(pts) == 2:
            segs.append(pts)
    key = lambda p: (round(p[0] * 2000), round(p[1] * 2000))
    loops, pool = [], list(segs)
    while pool:
        cur = None
        s = pool.pop()
        cur = [s[0], s[1]]
        for _ in range(10000):
            k = key(cur[-1])
            got = None
            for i, q in enumerate(pool):
                if key(q[0]) == k:
                    got = pool.pop(i)[1]
                    break
                if key(q[1]) == k:
                    got = pool.pop(i)[0]
                    break
            if got is None:
                break
            cur.append(got)
            if key(cur[-1]) == key(cur[0]):
                loops.append(cur)
                break
    out = []
    for L in loops:
        if len(L) < 4:
            continue
        per = 0.0; area = 0.0; cx = 0.0; cz = 0.0
        for i in range(len(L) - 1):
            per += math.hypot(L[i+1][0] - L[i][0], L[i+1][1] - L[i][1])
            area += L[i][0] * L[i+1][1] - L[i+1][0] * L[i][1]
            cx += L[i][0]; cz += L[i][1]
        per += math.hypot(L[0][0] - L[-1][0], L[0][1] - L[-1][1])
        m = len(L) - 1
        out.append(dict(per=per, area=abs(area) / 2, cx=cx / m, cz=cz / m, pts=len(L)))
    return out


def scan(P, tris, y0, y1, step=0.01):
    """yield (y, loops) over a band; a few jittered heights per row so a flat vertex row
    can't make a slice come out empty"""
    ys = [y0 + i * step for i in range(int((y1 - y0) / step) + 1)]
    seen = set()
    for yy in ys:
        for off in (0.0051, 0.0113, 0.0, 0.0031):
            h = round(yy + off, 5)
            if h in seen:
                continue
            seen.add(h)
            ls = slice_loops(P, tris, h)
            if ls:
                yield h, ls
                break


# ─────────────────── 3D helpers + arm sections perpendicular to the bone ───────────────────
def sub3(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def dot3(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross3(a, b): return (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])
def nrm3(a):
    l = math.sqrt(dot3(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


def arm_axis_from_mesh(P, side):
    """Fallback A-pose axis when body_skin.json has no bones: shoulder / hand rings from the mesh."""
    sg = 1 if side == 'L' else -1
    def band(xlo, xhi, ylo, yhi):
        sel = [p for p in P if xlo < sg * p[0] < xhi and ylo < p[1] < yhi]
        return tuple(sum(p[k] for p in sel) / len(sel) for k in range(3)) if sel else None
    S = band(0.16, 0.24, 1.46, 1.56) or (sg * 0.193, 1.509, -0.058)
    H = band(0.62, 0.70, 1.15, 1.27) or (sg * 0.690, 1.212, -0.064)
    return S, H


def arm_measure(P, tris, S, H, fracs):
    """Girth and 3-D centre of the arm cross-sections cut PERPENDICULAR to the shoulder->hand
    bone axis (the bind pose is an A-pose: the arms hang ~30 deg below horizontal, so a
    horizontal plane would see the forearm instead of the bicep and miss the cropped fist).

    The whole body is rotated into a frame whose Y runs along that bone; slice_loops() then
    cuts a plane of constant Y = a square cross-section. Only the triangles of this arm tube
    are passed in, so an oblique plane cannot also cut the torso / the other arm / a leg.
    Returns (y, L) — L.cx / L.cz / y are the true 3-D centre of the largest-area loop found
    over `fracs` (fractions of the shoulder->hand length), L.per is its girth in metres.
    """
    d = nrm3(sub3(H, S))
    Lax = math.sqrt(dot3(sub3(H, S), sub3(H, S)))
    up = (0, 1, 0)
    if abs(dot3(d, up)) > 0.9:
        up = (0, 0, 1)
    eu = nrm3(cross3(up, d))          # two axes spanning any plane perpendicular to d
    ev = cross3(d, eu)
    Q = [(dot3(sub3(p, S), eu), dot3(sub3(p, S), d), dot3(sub3(p, S), ev)) for p in P]
    arm_tris = []
    for a, b, c in tris:
        g = ((P[a][0] + P[b][0] + P[c][0]) / 3,
             (P[a][1] + P[b][1] + P[c][1]) / 3,
             (P[a][2] + P[b][2] + P[c][2]) / 3)
        rel = sub3(g, S)
        s = dot3(rel, d)
        if not (0.12 * Lax < s < 0.85 * Lax):       # away from the shoulder join and the cropped hand
            continue
        perp = (rel[0] - s*d[0], rel[1] - s*d[1], rel[2] - s*d[2])
        if dot3(perp, perp) > 0.15 ** 2:            # inside a 15 cm tube around the bone
            continue
        arm_tris.append((a, b, c))
    best = None
    for frac in fracs:
        yh = frac * Lax
        loops = []
        for off in (0.004, 0.009, 0.0, 0.0021):    # dodge a flat vertex row
            yh = frac * Lax + off
            loops = slice_loops(Q, arm_tris, yh)
            if loops:
                break
        for lp in loops:
            if not (0.10 < lp['per'] < 0.55):        # plausible arm girth, m
                continue
            c3 = (S[0] + lp['cx']*eu[0] + yh*d[0] + lp['cz']*ev[0],
                  S[1] + lp['cx']*eu[1] + yh*d[1] + lp['cz']*ev[1],
                  S[2] + lp['cx']*eu[2] + yh*d[2] + lp['cz']*ev[2])
            if best is None or lp['area'] > best[1]['area']:
                best = (c3[1], dict(cx=c3[0], cz=c3[2], per=lp['per'], area=lp['area'], pts=lp['pts']))
    return best


def measure(P, tris, bones):
    m = {}
    best = None
    for y, ls in scan(P, tris, 1.22, 1.325):         # chest — above ~1.34 the loop already merges with traps+deltoid
        for L in ls:
            if abs(L['cx']) < 0.04 and (best is None or L['area'] > best[1]['area']):
                best = (y, L)
    m['chest'] = best
    best = None
    for y, ls in scan(P, tris, 0.86, 1.09):          # hips
        for L in ls:
            if abs(L['cx']) < 0.04 and (best is None or L['area'] > best[1]['area']):
                best = (y, L)
    m['hips'] = best
    best = None
    for y, ls in scan(P, tris, 1.55, 1.64):          # neck (smallest ring above the traps)
        for L in ls:
            if 0.24 < L['per'] < 0.70 and (best is None or L['per'] < best[1]['per']):
                best = (y, L)
    m['neck'] = best

    def bt(suffix):
        for nm, mm in bones.items():
            if nm.endswith(suffix):
                return (mm[12], mm[13], mm[14])
        return None
    m['sho_bone'] = bt('L_UpperarmTwist01') or bt('L_Upperarm') or bt('L_Arm') or bt('R_UpperarmTwist01')

    # Arms are in an A-pose, so measure square sections perpendicular to the bone axis (see
    # arm_measure) instead of horizontal ones — a horizontal cut lands on the forearm and the
    # cropped fist gives no closed loop (issue #55 discussion).
    arms = {}
    for side in ('L', 'R'):
        S = bt(side + '_UpperarmTwist01') or bt(side + '_Upperarm') or bt(side + '_Arm')
        H = bt(side + '_Hand')
        if not (S and H):
            S, H = arm_axis_from_mesh(P, side)
        arms[side] = {
            'bicep': arm_measure(P, tris, S, H, (0.24, 0.28, 0.32, 0.36, 0.40)),   # widest upper arm
            'elbow': arm_measure(P, tris, S, H, (0.60, 0.66, 0.72, 0.78)),         # forearm near the elbow
        }
    m['arms'] = arms
    return m


# ───────────────────────── pattern maths ─────────────────────────
def bez3(p0, c1, c2, p1, n=Ncurve):
    out = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        out.append((mt**3 * p0[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t**3 * p1[0],
                    mt**3 * p0[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t**3 * p1[1]))
    return out


def ilen(pts):
    return sum(math.hypot(pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1]) for i in range(len(pts) - 1))


def armhole_pts(tipx, y_tip, Xw, AD):
    """classic S: from the shoulder tip down and out to the underarm"""
    ua = (Xw / 2, y_tip + AD)
    d = (ua[0] - tipx, ua[1] - y_tip)
    return bez3((tipx, y_tip), (tipx + d[0] * 0.28 - 0.8, y_tip + d[1] * 0.50),
                (tipx + d[0] * 0.35, y_tip + d[1] * 0.86), ua)


def body_part(wn, drop, Xw, Xh, armhole, y_tip, tipx, y_hem):
    """front (deep drop) / back (shallow) piece; closed outline + named edge ranges"""
    P = []
    E = {}
    def push(lst, name):
        E[name] = (len(P), len(P) + len(lst) - 1)
        P.extend(lst)
    ua = armhole[-1]
    push([(wn, 0), (tipx, y_tip)], 'shoulderP')
    push(armhole, 'armholeP')
    push([(ua[0], ua[1]), (Xh / 2, y_hem)], 'sideP')
    push([(Xh / 2, y_hem), (-Xh / 2, y_hem)], 'hem')
    push([(-Xh / 2, y_hem), (-ua[0], ua[1])], 'sideM')
    push([(-p[0], p[1]) for p in reversed(armhole)], 'armholeM')
    push([(-tipx, y_tip), (-wn, 0)], 'shoulderM')
    push(bez3((-wn, 0), (-wn * 0.45, drop * 0.72), (wn * 0.45, drop * 0.72), (wn, 0)), 'neck')
    return P, E


def cap_pts(cw, h):
    """sleeve cap: (-cw,0) over (0,-h) to (cw,0)"""
    L = bez3((-cw, 0), (-cw * 0.62, -h * 0.78), (-cw * 0.20, -h), (0, -h), Ncurve)
    R = bez3((0, -h), (cw * 0.20, -h), (cw * 0.62, -h * 0.78), (cw, 0), Ncurve)
    return L + R[1:]


def solve_cap(cw, target):
    """height h so the cap arc length == target (monotone in h)"""
    if ilen(cap_pts(cw, 0.001)) >= target:
        return 0.0
    lo, hi = 0.001, cw * 1.6
    if ilen(cap_pts(cw, hi)) < target:
        return hi
    for _ in range(40):
        mid = (lo + hi) / 2
        if ilen(cap_pts(cw, mid)) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def sleeve_part(a, aw, Ls, cw, h):
    """one sleeve: cap between (±cw,0); seam edges run from the cap endpoints down to the hem
    corners and include them; the left edge is the exact mirror of the right (reversed control
    points), so the self-paired sleeve seam agrees by construction"""
    P = cap_pts(cw, h)
    nc = len(P)
    r = bez3((cw, 0), (a * 0.97, 3.5), (a, 6.5), (a, 7))
    r2 = bez3((a, 7), (a * 0.99, (7 + Ls) / 2), (aw, (7 + Ls) / 2 + (Ls - 7) / 4), (aw, Ls), 10)
    hemc = bez3((aw, Ls), (aw * 0.3, Ls + 1.6), (-aw * 0.3, Ls + 1.6), (-aw, Ls), 10)
    l = [(-p[0], p[1]) for p in reversed(r2)]; l2 = [(-p[0], p[1]) for p in reversed(r)]
    E = {'cap': (0, nc - 1), 'seamP': (nc - 1, nc - 1 + len(r) - 1 + len(r2) - 1)}
    P.extend(r[1:]); P.extend(r2[1:])
    s2 = nc - 1 + len(r) - 1 + len(r2) - 1
    E['hem'] = (s2, s2 + len(hemc) - 1)
    P.extend(hemc[1:])
    s3 = s2 + len(hemc) - 1
    E['seamM'] = (s3, s3 + len(l) - 1 + len(l2) - 1)
    P.extend(l[1:]); P.extend(l2[1:])
    return P, E


def neck_curve(wn, drop):
    return bez3((-wn, 0), (-wn * 0.45, drop * 0.72), (wn * 0.45, drop * 0.72), (wn, 0))


def draft(M):
    C_bust = M['chest'][1]['per'] * 100
    C_hips = M['hips'][1]['per'] * 100
    C_neck = M['neck'][1]['per'] * 100
    armL, armR = M['arms']['L'], M['arms']['R']
    C_bicep = (armL['bicep'][1]['per'] + armR['bicep'][1]['per']) / 2 * 100
    C_elbow = (armL['elbow'][1]['per'] + armR['elbow'][1]['per']) / 2 * 100

    y_nape = M['neck'][0] - 0.06                        # m, world height of pattern y=0 (nape)
    sho = M['sho_bone'] or (0.20, y_nape - 0.06, 0)
    y_tip = (y_nape - sho[1]) * 100                     # shoulder slope, cm
    tipx = sho[0] * 100 + 1.5                           # shoulder seam ends 1.5 cm past the acromion
    Xw = (C_bust + EASE_CHEST) / 2
    Xh = max((C_hips + EASE_CHEST) / 2, Xw - 4)         # hem: hip width, but a boxy tee never tapers much
    y_hem = (y_nape - M['hips'][0]) * 100 + 3           # hem ~3 cm below the hip ring
    AD = C_bust * 0.15 + 2.0                            # armhole depth
    wn = C_neck / (2 * math.pi) + 2.2                   # neck opening must pass a head: wider and deeper
    wn_f = wn_b = wn                                    #   than a bare neck ring — and one half-width for
    dr_f = C_neck / 5 + 2.5                             #   both pieces so the shoulder seams match
    dr_b = 3.2
    armhole = armhole_pts(tipx, y_tip, Xw, AD)
    front, Ef = body_part(wn_f, dr_f, Xw, Xh, armhole, y_tip, tipx, y_hem)
    back, Eb = body_part(wn_b, dr_b, Xw, Xh, armhole, y_tip, tipx, y_hem)
    L_arm = ilen(armhole)
    target = 2 * L_arm                                  # cap arc = front + back armhole
    a = (C_bicep + EASE_ARM) / 2                        # half-width at the bicep
    cw = target / 2 - 1.0                               # cap endpoints (at the armhole)
    h = solve_cap(cw, target)
    aw = (C_elbow + C_bicep) / 4 + EASE_ARM / 2
    bl, el = armL['bicep'], armL['elbow']                        # sleeve hem just past the elbow (distance ALONG the raised arm)
    Ls = math.hypot(bl[1]['cx'] - el[1]['cx'], bl[0] - el[0], bl[1]['cz'] - el[1]['cz']) * 100 * 0.85 + 6
    P, E = sleeve_part(a, aw, Ls, cw, h)
    sleeveP = (P, E)
    sleeveM = ([[-p[0], p[1]] for p in P], dict(E))
    Ln = ilen(neck_curve(wn_f, dr_f)) + ilen(neck_curve(wn_b, dr_b))
    band_pts = [[-Ln / 2, 0], [Ln / 2, 0], [Ln / 2, BAND_W], [-Ln / 2, BAND_W]]
    band_E = {'seam': (0, 1), 'endP': (1, 2), 'edge_top': (2, 3), 'endM': (3, 0)}
    parts = {
        'front': dict(pts=front, edges=Ef),
        'back': dict(pts=back, edges=Eb),
        'sleeveP': dict(pts=sleeveP[0], edges=sleeveP[1]),
        'sleeveM': dict(pts=sleeveM[0], edges=sleeveM[1]),
        'band': dict(pts=band_pts, edges=band_E),
    }
    seams = [
        dict(name='плечо +X', a=[('front', 'shoulderP')], b=[('back', 'shoulderP')]),
        dict(name='плечо -X', a=[('front', 'shoulderM')], b=[('back', 'shoulderM')]),
        dict(name='бок +X', a=[('front', 'sideP')], b=[('back', 'sideP')]),
        dict(name='бок -X', a=[('front', 'sideM')], b=[('back', 'sideM')]),
        # cap endpoints are the underarms and the middle is the crown, so the armhole run along the
        # body must start at the FRONT underarm (hence the reverse flag) and end at the back one
        dict(name='рукав к пройме +X', a=[('sleeveP', 'cap')], b=[('front', 'armholeP', True), ('back', 'armholeP')]),
        dict(name='рукав к пройме -X', a=[('sleeveM', 'cap', True)], b=[('front', 'armholeM'), ('back', 'armholeM', True)]),
        dict(name='шов рукава +X', a=[('sleeveP', 'seamP')], b=[('sleeveP', 'seamM')]),
        dict(name='шов рукава -X', a=[('sleeveM', 'seamP')], b=[('sleeveM', 'seamM')]),
        dict(name='бейка к горловине', a=[('band', 'seam')], b=[('back', 'neck'), ('front', 'neck', True)]),
        dict(name='бейка, конец к концу', a=[('band', 'endP')], b=[('band', 'endM')]),
    ]
    params = dict(C_bust=C_bust, C_hips=C_hips, C_neck=C_neck, C_bicep=C_bicep, C_elbow=C_elbow,
                  ease_chest=EASE_CHEST, ease_arm=EASE_ARM, band_w=BAND_W, AD=AD,
                  y_tip=y_tip, tipx=tipx, wn_f=wn_f, wn_b=wn_b, dr_f=dr_f, dr_b=dr_b,
                  Xw=Xw, Xh=Xh, y_hem=y_hem, cap_h=h, cap_w2=2 * cw, a=a, aw=aw, Ls=Ls,
                  band_len=Ln, armhole_len=L_arm)
    anchors = dict(
        nape_y=y_nape,
        chest=dict(y=M['chest'][0], zc=M['chest'][1]['cz'], C=C_bust),
        hips=dict(y=M['hips'][0], zc=M['hips'][1]['cz'], C=C_hips),
        neck=dict(y=M['neck'][0], zc=M['neck'][1]['cz'], C=C_neck),
        arms={s: dict(bicep_y=arm['bicep'][0], bicep_cx=arm['bicep'][1]['cx'], bicep_cz=arm['bicep'][1]['cz'],
                      elbow_y=arm['elbow'][0], elbow_cx=arm['elbow'][1]['cx'], elbow_cz=arm['elbow'][1]['cz'],
                      C_bicep=arm['bicep'][1]['per'] * 100) for s, arm in (('L', armL), ('R', armR))},
    )
    return parts, seams, params, anchors


# ───────────────────────── checks / svg / png ─────────────────────────
def edge_pts(part, ename):
    i0, i1 = part['edges'][ename]
    pts = part['pts']
    if i0 <= i1:
        return [tuple(pts[i]) for i in range(i0, i1 + 1)]
    return [tuple(pts[i]) for i in range(i0, len(pts))] + [tuple(pts[i]) for i in range(0, i1 + 1)]


def check_seams(parts, seams):
    bad = 0
    print('  швы: длина A ↔ длина B, см (уклон %):')
    for s in seams:
        la = sum(ilen(edge_pts(parts[p], e)) for p, e, *_ in s['a'])
        lb = sum(ilen(edge_pts(parts[p], e)) for p, e, *_ in s['b'])
        dev = (la - lb) / max(la, lb) * 100 if max(la, lb) else 0
        ok = '✓' if abs(dev) <= 2.0 else '✗'
        if abs(dev) > 2.0:
            bad += 1
        print(f'    {ok} {s["name"]}: {la:.1f} ↔ {lb:.1f} ({dev:+.1f}%)')
    return bad


def curve_checks(parts):
    bad = 0
    for pname, part in parts.items():
        for e in ('neck', 'armholeP', 'armholeM', 'cap'):
            if e in part['edges'] and (part['edges'][e][1] - part['edges'][e][0] + 1) < 12:
                print(f'    ✗ {pname}.{e}: только {part["edges"][e][1] - part["edges"][e][0] + 1} точек кривой')
                bad += 1
    return bad


def sheet_svg(parts, params):
    sc = 4.5                                            # px per cm
    lay = {'front': (0, 0), 'back': (340, 0), 'sleeveP': (0, 340), 'sleeveM': (300, 340), 'band': (0, 545)}
    ru = {'front': 'перед', 'back': 'спинка', 'sleeveP': 'рукав +X', 'sleeveM': 'рукав −X', 'band': 'бейка горловины'}
    W, H = 780, 730
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         f'<rect width="{W}" height="{H}" fill="#fdfbf5"/>']
    for x in range(0, W, int(10 * sc)):
        o.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{H}" stroke="#e8e3d4" stroke-width="0.7"/>')
    for y in range(0, H, int(10 * sc)):
        o.append(f'<line x1="0" y1="{y}" x2="{W}" y2="{y}" stroke="#e8e3d4" stroke-width="0.7"/>')
    for name, (ox, oy) in lay.items():
        pts = parts[name]['pts']
        X = lambda p: ox + sc * p[0] + 150      # keep the front's -X armhole inside the sheet
        Y = lambda p: oy + sc * p[1] + 130
        d = ' '.join(('M' if i == 0 else 'L') + f'{X(p):.1f},{Y(p):.1f}' for i, p in enumerate(pts)) + ' Z'
        o.append(f'<path d="{d}" fill="#ffffffcc" stroke="#20242a" stroke-width="1.6"/>')
        for e in parts[name]['edges']:
            ep = edge_pts(parts[name], e)
            dd = ' '.join(('M' if i == 0 else 'L') + f'{X(p):.1f},{Y(p):.1f}' for i, p in enumerate(ep))
            o.append(f'<path d="{dd}" fill="none" stroke="#c0392b" stroke-width="2.3"/>')
        cx = ox + sc * sum(p[0] for p in pts) / len(pts) + 150
        cy = oy + sc * sum(p[1] for p in pts) / len(pts) + 130
        ly = cy - 12 if name == 'band' else cy          # the band strip is only ~10 px tall
        o.append(f'<text x="{cx:.0f}" y="{ly:.0f}" font-family="sans-serif" font-size="16" fill="#333">{ru[name]}</text>')
    o.append(f'<text x="12" y="22" font-family="sans-serif" font-size="15" fill="#333">выкройка футболки: грудь '
             f'{params["C_bust"]:.0f}, шея {params["C_neck"]:.0f}, бицепс {params["C_bicep"]:.0f} см · 1 см = {sc} px · красным — швы</text>')
    o.append('</svg>')
    return '\n'.join(o)


def svg_to_png(svg_path, png_path):
    try:
        import cairosvg
        cairosvg.svg2png(url=svg_path, write_to=png_path)
        print('  png: cairosvg')
        return True
    except Exception:
        pass
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            b = pw.chromium.launch(executable_path='/usr/bin/google-chrome',
                                   args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            pg = b.new_page(viewport={'width': 900, 'height': 760})
            pg.goto('file://' + os.path.abspath(svg_path))
            pg.wait_for_timeout(250)
            pg.screenshot(path=png_path)
            b.close()
        print('  png: chromium')
        return True
    except Exception as e:
        print(f'  ! png не получился ({type(e).__name__}); tee.svg можно открыть в браузере')
        return False


def main():
    objp = os.path.join(OUT, 'body.obj')
    skp = os.path.join(OUT, 'body_skin.json')
    if not os.path.exists(objp):
        print('нет out/body.obj — сначала: python3 tools/assets/cloth/export_body.py'); return 1
    P, tris = load_obj(objp)
    bones = json.load(open(skp))['bones'] if os.path.exists(skp) else {}
    print(f'— тело: {len(P)} вершин, {len(tris)} треугольников')
    M = measure(P, tris, bones)
    missing = [k for k in ('chest', 'hips', 'neck') if M[k] is None] + \
              [f'рука {s}.{t}' for s in ('L', 'R') for t in ('bicep', 'elbow') if M['arms'][s][t] is None]
    if missing:
        print('✗ не найдены сечения тела: ' + ', '.join(missing))
        return 1
    print('— замеры:')
    for k in ('chest', 'hips', 'neck'):
        y, L = M[k]
        print(f'    {k:6}: y={y:.3f} C={L["per"]*100:5.1f} см (центр x{L["cx"]*100:+.1f} z{L["cz"]*100:+.1f})')
    for s in ('L', 'R'):
        for k in ('bicep', 'elbow'):
            y, L = M['arms'][s][k]
            print(f'    рука {s} {k:6}: y={y:.3f} C={L["per"]*100:5.1f} см (центр x{L["cx"]*100:+.1f})')
    parts, seams, params, anchors = draft(M)
    print(f'— выкройка: перед {params["Xw"]:.1f}×{params["y_hem"]:.1f} см, пройма {params["AD"]:.1f} '
          f'(дуга {params["armhole_len"]:.1f}), окат h={params["cap_h"]:.1f} шир={params["cap_w2"]:.1f}, '
          f'рукав до {params["Ls"]:.1f}, бейка {params["band_len"]:.1f} см')
    bad = check_seams(parts, seams) + curve_checks(parts)
    tee = dict(kind='tee-pattern-v1', unit='cm', y_axis='down from nape (y=0)',
               params={k: round(v, 2) for k, v in params.items()},
               anchors=anchors,
               parts={n: dict(pts=[[round(x, 1), round(y2, 1)] for x, y2 in p['pts']], edges=p['edges'])
                      for n, p in parts.items()},
               seams=seams)
    with open(os.path.join(OUT, 'tee.json'), 'w') as f:
        json.dump(tee, f, ensure_ascii=False)
    svg = sheet_svg(parts, params)
    svgp = os.path.join(OUT, 'tee.svg')
    open(svgp, 'w').write(svg)
    jp = os.path.join(OUT, 'tee.json')
    print(f'— {jp} ({os.path.getsize(jp) // 1024} КБ), {svgp} ({os.path.getsize(svgp) // 1024} КБ)')
    png_out = os.path.join(OUT, 'tee.png')
    if svg_to_png(svgp, png_out):
        os.makedirs(PREVIEW, exist_ok=True)
        shutil.copyfile(png_out, os.path.join(PREVIEW, 'tee.png'))
        print(f'  → {os.path.join(PREVIEW, "tee.png")} (превью ≤1024 px для отчёта)')
    print('ИТОГ: ' + ('выкройка сходится' if not bad else f'ОШИБОК: {bad}'))
    return 1 if bad else 0


sys.exit(main())
