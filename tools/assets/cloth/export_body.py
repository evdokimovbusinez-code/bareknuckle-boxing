#!/usr/bin/env python3
"""Issue #55 step 0 — dump the game's fighter body (P1.body, a SkinnedMesh) in its BIND POSE.

    python3 tools/assets/cloth/export_body.py [--no-crop] [--keep-hands]

Playwright opens gtest.html (like tools/test/mp_test.py: own http.server, Chrome + SwiftShader),
reads CC_Base_Body BEFORE any frame is ticked. Vertices use the game's own formula (boxer.html
makeShorts): world = position.applyMatrix4(bindMatrix) * 0.01 -> METRES, Y up. The bind pose of
the FBX is a raised-arm stance (about 29 deg below horizontal); that is the frame step 4 skims
against, so it is kept as-is. The toe test prints which side the body faces; if it were -Z the
whole dump is rotated 180 deg about Y so the body faces +Z (it already does in this build).

Bone bind transforms come from skeleton.boneInverses (captured by the FBX loader at bind time —
bone.matrixWorld is already animated by the time we look at it).

Writes
  out/body.obj          positions + normals + triangles (head and hands cropped by default)
  out/body_skin.json    bone names, bind-pose matrices (metres, same frame as the obj, parent
                        index, rotation with the cm scale removed), per-vertex skin weights

Prints the checks: height 1.75–1.95 m, shoulders 0.40–0.50 m, vertex count.
"""
import asyncio, functools, http.server, json, math, os, subprocess, sys, threading

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))   # repo root
OUT = os.path.join(HERE, 'out')
HEAD_Y = 1.605      # crop skull/jaw above this (neck rings measured to y≈1.59)
HAND_X = 0.705      # crop the fist beyond this |x| (bind arms are raised, wrist at |x|≈0.70)

# ── JS: the extraction runs inside the page (bind frame = same formula the game uses) ──
EXTRACT = r"""
(() => {
  const b = __g.P1.body, g = b.geometry, T = __g.THREE;
  const bm = b.bindMatrix, nmat = new T.Matrix3().getNormalMatrix(bm);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const n = pos.count;
  const P = new Array(n * 3), N = new Array(n * 3);
  const v = new T.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(bm).multiplyScalar(0.01);
    P[3*i] = v.x; P[3*i+1] = v.y; P[3*i+2] = v.z;
    v.fromBufferAttribute(nrm, i).applyMatrix3(nmat).normalize();
    N[3*i] = v.x; N[3*i+1] = v.y; N[3*i+2] = v.z;
  }
  const idx = Array.from(g.index.array);
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const SI = new Array(n * 4), SW = new Array(n * 4);
  for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) {
    SI[4*i+j] = si.getComponent(i, j); SW[4*i+j] = +sw.getComponent(i, j).toFixed(5);
  }
  // bind pose of each bone = inverse(boneInverses[i]); cm world frame (translation cm, cf. hips ≈ 100.9)
  const bones = b.skeleton.bones.map((bn, i) => {
    const m = new T.Matrix4().copy(b.skeleton.boneInverses[i]).invert().elements.slice();
    let pi = -1;
    if (bn.parent) pi = bones.indexOf(bn.parent);   // bones[] not yet defined inside its own map — see below
    return { name: bn.name, m, parent: bn.parent ? bn.parent.name : null };
  });
  // toe test: toes stick forward; count foot vertices far +Z vs far -Z at ankle height
  let toeF = 0, toeB = 0;
  for (let i = 0; i < n; i++) {
    if (P[3*i+1] < 0.05 && Math.abs(P[3*i]) < 0.2) { if (P[3*i+2] > 0.12) toeF++; if (P[3*i+2] < -0.12) toeB++; }
  }
  return { P, N, idx, SI, SW, bones, toeF, toeB };
})()
"""
# fix the parent lookup (bones is built with map, so do it in a second pass on the page side)
EXTRACT = EXTRACT.replace(
    "    let pi = -1;\n    if (bn.parent) pi = bones.indexOf(bn.parent);   // bones[] not yet defined inside its own map — see below\n", "")


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/gtest.html'


def ensure_build():
    if not os.path.exists(os.path.join(ROOT, 'gtest.html')):
        subprocess.run(['bash', 'tools/check.sh'], cwd=ROOT, check=True)
    nm = os.path.join(ROOT, 'node_modules')
    if not os.path.exists(os.path.join(nm, 'three')):
        if not os.path.exists(nm) and os.path.isdir('/home/claude/cc/node_modules'):
            os.symlink('/home/claude/cc/node_modules', nm)
        else:
            subprocess.run(['npm', 'i', '--no-save', '--silent', 'three@0.160.0', 'cannon-es@0.20.0'],
                           cwd=ROOT, check=True)


async def grab():
    from playwright.async_api import async_playwright
    srv, url = serve()
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
                      '--ignore-gpu-blocklist'])
            pg = await b.new_page(viewport={'width': 640, 'height': 480})
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(url)
            await pg.wait_for_function("document.getElementById('loading').hidden || document.querySelector('.err')",
                                        timeout=240000)
            if await pg.evaluate("!!document.querySelector('.err')"):
                raise RuntimeError('page failed to boot')
            d = await pg.evaluate(EXTRACT)     # NO ticks: boneInverses are the bind pose
            await b.close()
    finally:
        srv.shutdown()
    if errs:
        raise RuntimeError('pageerror: ' + errs[0][:300])
    return d


def rotY180(m):
    """world rotation diag(-1,1,-1) applied to a column-major matrix: negate rows 0 and 2."""
    for c in (0, 4, 8, 12):
        m[c] = -m[c]
    for c in (2, 6, 10, 14):
        m[c] = -m[c]
    return m


def main():
    crop = '--no-crop' not in sys.argv
    crop_hands = '--keep-hands' not in sys.argv
    os.makedirs(OUT, exist_ok=True)
    ensure_build()
    print('— открываю gtest.html (Playwright)…')
    d = asyncio.run(grab())
    P, N, idx, SI, SW, bones = d['P'], d['N'], d['idx'], d['SI'], d['SW'], d['bones']
    n = len(P) // 3

    xs = [P[3*i] for i in range(n)]; ys = [P[3*i+1] for i in range(n)]; zs = [P[3*i+2] for i in range(n)]
    h_raw = max(ys) - min(ys)
    print(f'  вершин: {n}, треугольников: {len(idx)//3}, костей: {len(bones)}')
    print(f'  raw bbox: x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]')
    print(f'  носка: toeF={d["toeF"]} toeB={d["toeB"]} → лицо к {"+Z" if d["toeF"] >= d["toeB"] else "-Z"}')

    # bind bone matrices: the loader captured them in the cm world frame — translation → metres,
    # and the 3x3 part is normalised to pure rotation (bone lengths are in the translation)
    for bo in bones:
        m = bo['m']
        for c in range(3):
            ln = math.sqrt(m[c]**2 + m[4 + c]**2 + m[8 + c]**2) or 1.0
            m[c] /= ln; m[4 + c] /= ln; m[8 + c] /= ln
        m[12] *= 0.01; m[13] *= 0.01; m[14] *= 0.01
    if d['toeB'] > d['toeF']:      # face would point -Z: flip everything
        for i in range(n):
            P[3*i] = -P[3*i]; P[3*i+2] = -P[3*i+2]
            N[3*i] = -N[3*i]; N[3*i+2] = -N[3*i+2]
        for bo in bones:
            rotY180(bo['m'])
        print('  перевёрнуто на 180° вокруг Y (лицом к +Z)')

    # crop whole triangles
    keep = [True] * n
    if crop:
        for i in range(n):
            if ys[i] > HEAD_Y and abs(xs[i]) < 0.13:
                keep[i] = False
    if crop_hands:
        for i in range(n):
            if abs(xs[i]) > HAND_X and ys[i] > 0.8:
                keep[i] = False
    tri = []
    for t in range(0, len(idx), 3):
        a, b, c = idx[t], idx[t+1], idx[t+2]
        if keep[a] and keep[b] and keep[c]:
            tri.append((a, b, c))
    used = sorted({i for tf in tri for i in tf})
    remap = {old: new for new, old in enumerate(used)}
    xp = [P[3*i+k] for i in used for k in range(3)]
    np_ = [N[3*i+k] for i in used for k in range(3)]
    SIk = [SI[4*i+j] for i in used for j in range(4)]
    SWk = [SW[4*i+j] for i in used for j in range(4)]
    xsc = [xp[3*i] for i in range(len(used))]
    ysc = [xp[3*i+1] for i in range(len(used))]
    zsc = [xp[3*i+2] for i in range(len(used))]

    # shoulder span: biacromial — from the two upper-arm bones (shoulder joints), bind frame
    import re
    ux = [+abs(bo['m'][12]) for bo in bones if re.search(r'_(L|R)_UpperarmTwist01$', bo['name'])]
    if ux:
        span = sum(ux) / len(ux) * 2 + 0.03    # joint-to-joint + ~1.5 cm acromion on each side
    else:                                    # fallback: widest |x| in the deltoid band
        band = [i for i in range(len(used)) if 1.30 < ysc[i] < 1.47]
        span = (max(xsc[i] for i in band) - min(xsc[i] for i in band)) if band else float('nan')
    for want in ('Pelvis', 'Spine02', 'NeckTwist01', 'Head', 'L_UpperarmTwist01', 'R_UpperarmTwist01',
                 'L_ElbowShareBone', 'R_ElbowShareBone', 'L_Hand', 'R_Hand', 'L_ThighTwist01', 'L_Foot'):
        for bo in bones:
            if bo['name'].endswith(want):
                m = bo['m']
                print(f'    bind-кость {bo["name"]}: x={m[12]:+.3f} y={m[13]:.3f} z={m[14]:+.3f}')
                break

    objp = os.path.join(OUT, 'body.obj')
    with open(objp, 'w') as f:
        f.write('# P1.body (CC_Base_Body) bind pose — metres, Y up, face +Z (issue #55, export_body.py)\n')
        for i in range(len(used)):
            f.write(f'v {xsc[i]:.5f} {ysc[i]:.5f} {zsc[i]:.5f}\n')
        for i in range(len(used)):
            f.write(f'vn {np_[3*i]:.4f} {np_[3*i+1]:.4f} {np_[3*i+2]:.4f}\n')
        f.write('s off\n')
        for a, b, c in tri:
            f.write(f'f {remap[a]+1} {remap[b]+1} {remap[c]+1}\n')

    bone_names = [bo['name'] for bo in bones]
    name_ix = {nm2: i for i, nm2 in enumerate(bone_names)}
    json.dump({
        'unit': 'm', 'frame': 'bind pose, Y up, face +Z, same frame as body.obj',
        'note': 'bind pose has the arms raised ~29 deg below horizontal (FBX stance); bones are in the same frame',
        'vertices': len(used), 'triangles': len(tri),
        'boneNames': bone_names,
        'boneParent': [name_ix.get(bo['parent'], -1) for bo in bones],
        'bones': {bo['name']: bo['m'] for bo in bones},
        'skinIndex': SIk, 'skinWeight': SWk,
        'bbox': {'min': [min(xsc), min(ysc), min(zsc)], 'max': [max(xsc), max(ysc), max(zsc)]},
        'height_raw': h_raw, 'shoulder_span': span,
        'crop': {'head_y': HEAD_Y if crop else None, 'hand_x': HAND_X if crop_hands else None},
    }, open(os.path.join(OUT, 'body_skin.json'), 'w'))

    ok = lambda c: '✓' if c else '✗'
    print(f'  после обрезки: вершин {len(used)}, треугольников {len(tri)} (кроп: голова y>{HEAD_Y}, кисти |x|>{HAND_X})' if crop or crop_hands
          else f'  без обрезки: вершин {len(used)}, треугольников {len(tri)}')
    print(f'  рост (raw, вся голова) = {h_raw:.3f} м, плечи (биакромиальное по костям плеча) = {span:.3f} м')
    print(f'  {ok(1.75 <= h_raw <= 1.95)} рост ≈ 1.75–1.95')
    print(f'  {ok(0.40 <= span <= 0.50)} плечи ≈ 0.40–0.50')
    print(f'  вершин: {n} raw → {len(used)} после кропа')
    print(f'  → {objp}')
    print(f'  → {os.path.join(OUT, "body_skin.json")}')
    return 0 if (1.75 <= h_raw <= 1.95 and 0.40 <= span <= 0.50) else 1


sys.exit(main())
