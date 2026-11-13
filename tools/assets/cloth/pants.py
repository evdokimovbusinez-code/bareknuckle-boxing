#!/usr/bin/env python3
"""Cloth pipeline, step 1 for trousers — pattern + placement around the body (same formats as the tee).

    python3 tools/assets/cloth/pants.py        (needs out/body.obj + out/body_skin.json from export_body.py)

Pattern (CENTIMETRES, v up from the hem, x across the leg): per leg a front and a back panel, the classic trouser draft
simplified — hip quarter ± 1 cm, crotch extension H/16 (front) and H/10 (back), a crease line the knee and the hem are
centred on, a slanted and raised centre-back seam. Loose street cut: ease on the hip, a wide knee and a straight hem.
Seams: outseams, inseams, front rise (left ↔ right centre front), back rise. No waistband yet (raw waist edge).

Placement: each panel is a grid (place.build_grid) bent around its leg — below the crotch the panel wraps half a turn
around the leg's own axis (outer side → front / back → inner side), above it blends into a quarter turn around the
pelvis (side → centre front / centre back). Vertices closer than 2 cm to the skin are pushed out along the skin normal.

Writes out/pants.json (parts, edges, seams), out/pants_placed.json (as tee_placed.json), out/pants_placed.blend when bpy
is there, preview/pants.png (the pattern sheet) and preview/pants_front/side/back.png.
"""
import json, math, os, sys, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import place as PL
import pattern as PT

OUT, PREVIEW = PL.OUT, PL.PREVIEW
EASE_HIP, KNEE_C, HEM_C = 8.0, 50.0, 46.0     # cm: loose street trousers
CROTCH_EASE = 2.5                             # the crotch line sits this much below the body's crotch, cm
GAP = 0.028                                   # metres off the skin before the push-out
COL = {'frontL': (0.82, 0.28, 0.28), 'backL': (0.24, 0.42, 0.80), 'frontR': (0.90, 0.62, 0.22), 'backR': (0.20, 0.62, 0.40)}


# ───────────────────────── measures ─────────────────────────
def bone_t(sk, name):
    m = sk['bones'][name]; return (m[12], m[13], m[14])


def torso_loops(P, tris, y):
    return [L for L in PT.slice_loops(P, tris, y) if abs(L['cx']) < 0.3 and L['per'] > 0.12]


def measure(P, tris, sk):
    pel = bone_t(sk, 'CC_Base_Pelvis'); knee = bone_t(sk, 'CC_Base_L_KneeShareBone'); foot = bone_t(sk, 'CC_Base_L_Foot')
    # crotch: the highest height where the torso slice splits into two leg loops
    crotch = None
    for i in range(60):
        y = pel[1] - 0.02 - i * 0.004
        ls = torso_loops(P, tris, y + 0.0013)
        if len(ls) >= 2 and all(L['per'] < 0.75 for L in ls):
            crotch = y; break
    assert crotch, 'no crotch found'
    hip, hip_y = 0, None
    for i in range(30):
        y = crotch + 0.02 + i * 0.005
        if y > pel[1] + 0.06: break
        ls = torso_loops(P, tris, y + 0.0011)
        if len(ls) == 1 and ls[0]['per'] > hip: hip, hip_y, hip_zc = ls[0]['per'], y, ls[0]['cz']
    waist_y = pel[1] + 0.035                  # a low waist: the trousers sit on the hips
    wl = torso_loops(P, tris, waist_y + 0.0012); waist = max(L['per'] for L in wl)
    hem_y = foot[1] + 0.015
    legs = {}                                  # per side: [(y, cx, cz, r)] every 2 cm from the hem to the crotch
    for s in (1, -1):
        rows = []
        y = hem_y
        while y < crotch:
            ls = [L for L in PT.slice_loops(P, tris, y + 0.0007) if L['cx'] * s > 0.02 and abs(L['cx']) < 0.3]
            if ls:
                L = max(ls, key=lambda q: q['per']); rows.append((y, L['cx'], L['cz'], L['per'] / (2 * math.pi)))
            y += 0.02
        legs[s] = rows
    kl = [L for L in PT.slice_loops(P, tris, knee[1] + 0.0009) if L['cx'] > 0.02 and abs(L['cx']) < 0.3]
    M = dict(pelvis=pel, crotch_y=crotch, hip=hip * 100, hip_y=hip_y, hip_zc=hip_zc, waist=waist * 100, waist_y=waist_y,
             knee_y=knee[1], knee=max(L['per'] for L in kl) * 100, hem_y=hem_y, legs=legs)
    print(f'  талия {M["waist"]:.1f} см (y={waist_y:.3f}), бёдра {M["hip"]:.1f} см (y={hip_y:.3f}), колено {M["knee"]:.1f} см, '
          f'шаг (crotch) y={crotch:.3f}, низ y={hem_y:.3f}')
    return M


# ───────────────────────── draft ─────────────────────────
def panel(M, back):
    H = M['hip'] + EASE_HIP
    hipw = H / 4 + (1 if back else -1)
    ext = H / 10 if back else H / 16
    kneew = max(KNEE_C, M['knee'] + 12) / 2 + (2 if back else -2)
    hemw = HEM_C / 2 + (1.5 if back else -1.5)
    cv = (M['crotch_y'] - M['hem_y']) * 100 - CROTCH_EASE
    kv = (M['knee_y'] - M['hem_y']) * 100
    hv = (M['hip_y'] - M['hem_y']) * 100
    wv = (M['waist_y'] - M['hem_y']) * 100
    D = wv - cv
    xc = (hipw + ext) / 2                                   # the crease
    rise_top = (hipw - (3.0 if back else 1.0), wv + (2.5 if back else 0))
    curve = PT.bez3((hipw + ext, cv), (hipw + ext * 0.25, cv + 0.5), (hipw, cv + 0.15 * D), (hipw, cv + 0.4 * D), n=12)
    side = PT.bez3((0.8, wv), (0, hv + 0.3 * (wv - hv)), (0, hv - 0.4 * (hv - kv)), (xc - kneew / 2, kv), n=12)
    pts = [(xc - hemw / 2, 0.0), (xc + hemw / 2, 0.0), (xc + kneew / 2, kv)]
    i_cr = len(pts); pts += curve                            # inseam ends at the crotch point = curve[0]
    i_rl = len(pts) - 1; pts.append(rise_top)                 # straight rise from the curve's end up to the waist
    i_rt = len(pts) - 1; pts += side                          # waist (rise_top → side[0]) then the side seam down
    i_sw = i_rt + 1; i_sk = len(pts) - 1
    edges = {'hem': [0, 1], 'inseam': [1, i_cr], 'rise': [i_cr, i_rt], 'waist': [i_rt, i_sw], 'side': [i_sw, 0]}
    return [list(p) for p in pts], edges


def draft(M):
    parts = {}
    for s, tag in ((1, 'L'), (-1, 'R')):
        for back in (False, True):
            pts, e = panel(M, back)
            parts[('back' if back else 'front') + tag] = dict(pts=pts, edges=e)
    seams = []
    for tag in 'LR':
        seams.append(dict(name=f'outseam {tag}', a=[['front' + tag, 'side']], b=[['back' + tag, 'side']]))
        seams.append(dict(name=f'inseam {tag}', a=[['front' + tag, 'inseam']], b=[['back' + tag, 'inseam']]))
    seams.append(dict(name='front rise', a=[['frontL', 'rise']], b=[['frontR', 'rise']]))
    seams.append(dict(name='back rise', a=[['backL', 'rise']], b=[['backR', 'rise']]))
    return parts, seams


def check(parts, seams):
    bad = 0
    for s in seams:
        la = PT.ilen(PL.edge_pts(parts[s['a'][0][0]], s['a'][0][1])); lb = PT.ilen(PL.edge_pts(parts[s['b'][0][0]], s['b'][0][1]))
        d = abs(la - lb) / max(la, lb) * 100; ok = d <= 2.0 or s['name'].startswith(('front rise', 'back rise'))
        bad += not ok
        print(f'    {s["name"]:12}: {la:6.1f} / {lb:6.1f} см  Δ {d:4.1f}%  {"✓" if ok else "✗ (сим. посадит)"}')
    return bad


# ───────────────────────── placement ─────────────────────────
def leg_at(rows, y):
    if y <= rows[0][0]: return rows[0][1:]
    for a, b in zip(rows, rows[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0]); return tuple(a[k] + (b[k] - a[k]) * t for k in (1, 2, 3))
    return rows[-1][1:]


def bender(M, name, poly):
    s = 1 if name.endswith('L') else -1
    back = name.startswith('back')
    zs = -1 if back else 1
    rows = M['legs'][s]
    cv = (M['crotch_y'] - M['hem_y']) * 100 - CROTCH_EASE
    Rp = (M['hip'] + EASE_HIP) / 100 / (2 * math.pi) + 0.01
    def span(v):                                             # the panel's own [xmin, xmax] at this height
        xs = []
        n = len(poly)
        for i in range(n):
            (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
            if (y1 <= v <= y2) or (y2 <= v <= y1):
                xs.append(x1 if y1 == y2 else x1 + (x2 - x1) * (v - y1) / (y2 - y1))
        return (min(xs), max(xs)) if xs else (0, 1)
    def f(u, v):
        y = M['hem_y'] + v / 100
        x0, x1 = span(v); fr = (u - x0) / max(1e-6, x1 - x0)
        # around the leg: outer side (θ = 90° s) → front / back (0°) → inner side
        cx, cz, r = leg_at(rows, min(y, M['crotch_y'] - 0.01))
        # half the panel width wraps half a turn, but the inner side may not cross the body's mid-plane (the two legs' panels
        # would interpenetrate between the thighs) — the panel is then compressed around the leg, the simulation relaxes it
        R = min(max(r * 1.08 + GAP, (x1 - x0) / 100 / math.pi), max(r * 1.08 + 0.012, abs(cx) - 0.004))
        th = math.radians(90 - 180 * fr) * s
        pl = (cx + R * math.sin(th), y, cz + zs * R * math.cos(th))
        # around the pelvis: side (θ = 90° s) → centre front / back (0°)
        thp = math.radians(90 - 90 * min(1, fr)) * s
        pp = (Rp * math.sin(thp), y, M['hip_zc'] + zs * Rp * math.cos(thp))
        t = min(1, max(0, (v - cv) / 12)); t = t * t * (3 - 2 * t)
        return tuple(pl[k] + (pp[k] - pl[k]) * t for k in range(3))
    return f


def main():
    P, tris = PL.load_obj(os.path.join(OUT, 'body.obj'))
    sk = json.load(open(os.path.join(OUT, 'body_skin.json')))
    print('— мерки:'); M = measure(P, tris, sk)
    parts, seams = draft(M)
    print('— швы (длины краёв):'); bad = check(parts, seams)
    json.dump(dict(unit='cm', parts=parts, seams=seams, params=dict(ease_hip=EASE_HIP, knee=KNEE_C, hem=HEM_C),
                   anchors={k: v for k, v in M.items() if k != 'legs'}), open(os.path.join(OUT, 'pants.json'), 'w'), ensure_ascii=False)
    skin = PL.Body(P, tris)
    parts3 = {}
    print('— раскладка:')
    for name, part in parts.items():
        poly = [tuple(p) for p in part['pts']]
        V, F, idxmap, cols, nrows = PL.build_grid(poly)
        f = bender(M, name, poly)
        V3 = [f(u, v) for u, v in V]
        for _ in range(30):
            worst = 0
            for i, p in enumerate(V3):
                d2, cp = skin.nearest(p)
                if d2 < PL.MIN_CLEAR ** 2 and cp is not None:
                    o = PL.sub(p, cp); ol = math.sqrt(PL.dot(o, o)) or 1e-6; push = PL.PUSH_TO - math.sqrt(d2)
                    V3[i] = tuple(p[k] + o[k] / ol * push for k in range(3)); worst = max(worst, push)
            if not worst: break
        ds = sorted(math.sqrt(skin.nearest2(p)) for p in V3)
        ok = ds[0] >= PL.MIN_CLEAR - 1e-6; bad += not ok
        print(f'    {name:7}: {len(V3)} вершин, {len(F)} граней, до кожи min {ds[0]*100:.1f} / мед. {ds[len(ds)//2]*100:.1f} см {"✓" if ok else "✗"}')
        parts3[name] = dict(verts3=V3, V2=V, faces=F, color=COL[name])
    seam_pairs = []
    print('— швы (пары вершин для sewing springs):')
    def edge3(pname, ename):
        out, last = [], -1
        for sp in PL.sample_polyline([(x, y, 0) for x, y in PL.edge_pts(parts[pname], ename)], every=1.2):
            best, bi = 1e18, None
            for i, (vu, vv) in enumerate(parts3[pname]['V2']):
                if i == last: continue
                d2 = (vu - sp[0]) ** 2 + (vv - sp[1]) ** 2
                if d2 < best: best, bi = d2, i
            if bi is not None and best < 3.6 ** 2: out.append(parts3[pname]['verts3'][bi]); last = bi
        return out
    for s in seams:
        a, b = edge3(*s['a'][0]), edge3(*s['b'][0]); n = min(len(a), len(b))
        pr = [(a[i], b[i]) for i in range(n)]
        print(f'    {s["name"]:12}: {n} пар, среднее расстояние {sum(math.dist(*q) for q in pr) / max(1, n) * 100:.1f} см')
        seam_pairs.append((s['name'], pr))
    json.dump(dict(unit='m', parts={k: dict(verts=[[round(c, 4) for c in v] for v in pt['verts3']], faces=[list(f) for f in pt['faces']],
                                            uv=[[round(c, 2) for c in uv] for uv in pt['V2']]) for k, pt in parts3.items()},
                   seams=[dict(name=nm, pairs=[[[round(c, 4) for c in p1], [round(c, 4) for c in p2]] for p1, p2 in pr]) for nm, pr in seam_pairs]),
              open(os.path.join(OUT, 'pants_placed.json'), 'w'), ensure_ascii=False)
    try:
        import bpy
        bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene
        for nm, V, Fc in [('body', P, tris)] + [(k, pt['verts3'], pt['faces']) for k, pt in parts3.items()]:
            me = bpy.data.meshes.new(nm); me.from_pydata([list(v) for v in V], [], [list(f) for f in Fc]); me.update()
            sc.collection.objects.link(bpy.data.objects.new(nm, me))
        sv, se = [], []
        for _, pr in seam_pairs:
            for p1, p2 in pr: sv += [list(p1), list(p2)]; se.append((len(sv) - 2, len(sv) - 1))
        me = bpy.data.meshes.new('seamEdges'); me.from_pydata(sv, se, []); me.update(); sc.collection.objects.link(bpy.data.objects.new('seamEdges', me))
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'pants_placed.blend')); print('  pants_placed.blend ✓')
    except Exception as e:
        print(f'  (.blend пропущен: {type(e).__name__})')
    os.makedirs(PREVIEW, exist_ok=True)
    bd = dict(verts3=P, tris=tris)
    for view in ('front', 'side', 'back'):
        PL.raster(bd, parts3, [pr for _, pr in seam_pairs], view, os.path.join(PREVIEW, f'pants_{view}.png'))
    sheet(parts, seams)
    print('  превью → preview/pants.png, pants_front/side/back.png')
    print('ИТОГ: ' + ('выкройка и раскладка без ошибок' if not bad else f'ПРОБЛЕМ: {bad}'))
    return 1 if bad else 0


def sheet(parts, seams, W=1000, H=760):
    """the pattern on a sheet: outlines (seams coloured per seam), 1 cm = k px"""
    img = bytearray(b'\xfa\xf7\xf0' * (W * H))
    def line(a, b, c):
        n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1]))) + 1
        for i in range(n + 1):
            x = int(a[0] + (b[0] - a[0]) * i / n); y = int(a[1] + (b[1] - a[1]) * i / n)
            for dx in (0, 1):
                if 0 <= x + dx < W and 0 <= y < H: o = (y * W + x + dx) * 3; img[o:o + 3] = bytes(c)
    order = ['frontL', 'backL', 'frontR', 'backR']
    hmax = max(max(p[1] for p in parts[k]['pts']) for k in order)
    wsum = sum(max(p[0] for p in parts[k]['pts']) - min(p[0] for p in parts[k]['pts']) for k in order) + 4 * 8
    k = min((W - 40) / wsum, (H - 40) / hmax)
    x0 = 20
    scol = {}
    pal = [(200, 40, 40), (40, 90, 200), (30, 150, 80), (220, 140, 30), (140, 60, 170), (20, 150, 160)]
    for i, s in enumerate(seams):
        for spec in s['a'] + s['b']: scol[(spec[0], spec[1])] = pal[i % len(pal)]
    for nm in order:
        pts = parts[nm]['pts']; mn = min(p[0] for p in pts)
        T = lambda p: (x0 + (p[0] - mn) * k, H - 20 - p[1] * k)
        for en, (i0, i1) in parts[nm]['edges'].items():
            ep = PL.edge_pts(parts[nm], en)
            for a, b in zip(ep, ep[1:]): line(T(a), T(b), scol.get((nm, en), (60, 60, 60)))
        x0 += (max(p[0] for p in pts) - mn) * k + 8 * k
    PL.write_png(os.path.join(PREVIEW, 'pants.png'), W, H, img)


if __name__ == '__main__':
    sys.exit(main())
