"""Hand-made tee (user/tshirt_src.blend) -> game asset assets/cloth/tee.glb + tee_n.webp + tee_ao.webp (issue #57). bpy, no GUI.

    python3 tools/assets/cloth/tee_game.py                  (bpy as a module: pip install bpy==5.3.0)
    Blender -b tools/assets/cloth/user/tshirt_src.blend --python tools/assets/cloth/tee_game.py

    env: LOW=quad|decimate (game low poly; quad = QuadriFlow of tshirt_high, decimate = the file's tshirt_low)
         FACES=6000 (quads) SHARP=45 (deg, the rims kept as edge loops) CAGE=0.005 RAY=0.02 (m) RES=1024 AO_RES=512 AO_SAMPLES=32
         SMOOTH=6 (weight smoothing passes) BAKE=0 (skip the bakes: only weights / checks / GLB)

The shirt was made in the T-pose (the armature is posed); the skeleton's bind pose is the game's A-pose (arms -32 deg).
Blender is Z-up, the armature has scale 0.01 (cm bones) -> Blender world = metres. The game's body geometry frame is cm, z up
(= 100 x Blender world, checked by user_tee.py). glTF is Y-up: (x, y, z)_blender -> (x, z, -y)_gltf.

1. weights: per shirt vertex the nearest point of the POSED body (T-pose, as the shirt sits) -> barycentric blend of the body's
   vertex groups (= Data Transfer "nearest face interpolated", done by hand so the bone filter and the checks stay in one place);
   only torso / neck / clavicle / arm-twist bones (+ ThighTwist01 at the hem: without it the pelvis skin pokes through the hem in
   the stance), SMOOTH Laplacian passes, top 4, normalised.
2. inverse skinning to the bind A-pose: rest = (sum w_i S_i)^-1 * pose, S_i = arm.mw * pb.matrix * bone.matrix_local^-1 * arm.mw^-1.
   Checks: an Armature modifier on the rest mesh re-posed to the T-pose gives the source shirt (max error, must be < 1 mm);
   share of shirt vertices inside the body in the T-pose and in the A-pose (the Blender body, and out/body.obj of export_body.py
   when it is there — that one is the game's own dump).
3. low poly: Decimate (tshirt_low) vs QuadriFlow of the high one; both are put through a punch (CC_Base_L_Upperarm 80 deg forward
   from the A-pose) -> flipped triangles and edge stretch are printed; LOW picks the one that is exported (quad by default:
   README — the decimated triangles crease at the shoulder and bake worse).
4. uv: Smart UV Project (islands by angle: front, back, sleeves, rims), margin 0.01 (10 px at 1024), uv stretch printed.
5. bake in Cycles (CPU unless a GPU is found, few samples), tshirt_high -> low, in the T-pose where both coincide:
   normal map, tangent space (MikkTSpace, OpenGL Y+ like three.js), RES px, extrusion CAGE -> tee_n.webp (lossless: lossy
   blocks show as dents in the light); ambient occlusion AO_RES px of the cloth alone (the body hidden: it moves) -> tee_ao.webp.
6. GLB, written by hand (no exporter axis / armature surprises): one mesh, node = the dequantisation transform
   (KHR_mesh_quantization): POSITION int16 (metres, Y-up, bind A-pose), NORMAL / TANGENT int8 (Blender's normals and
   MikkTSpace tangents: the map was baked against exactly these), TEXCOORD_0 uint16 (glTF v down), JOINTS_0 uint8 = index into
   primitive.extras.bones (CC_Base_* names; the game maps them onto its own skeleton by name), WEIGHTS_0 uint8, uint16 indices.
   No textures inside. Target < 300 KB.
"""
import bpy, json, math, os, re, struct, subprocess, sys, time
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SRC = os.path.join(HERE, 'user', 'tshirt_src.blend'); OUT = os.path.join(ROOT, 'assets', 'cloth')
E = os.environ.get
LOW, FACES, SHARP = E('LOW', 'quad'), int(E('FACES', 6000)), float(E('SHARP', 45))
CAGE, RAY, RES, AO_RES, AO_SAMPLES = float(E('CAGE', 0.005)), float(E('RAY', 0.02)), int(E('RES', 1024)), int(E('AO_RES', 512)), int(E('AO_SAMPLES', 32))
SMOOTH, BAKE = int(E('SMOOTH', 6)), E('BAKE', '1') != '0'
KEEP = re.compile(r'CC_Base_(Pelvis|Waist|Spine0[12]|NeckTwist0[12]|[LR]_(Clavicle|Upperarm|UpperarmTwist0[12]|ElbowShareBone|Forearm|ForearmTwist0[12]|RibsTwist|Breast|ThighTwist01))$')
T0 = time.time()

if os.path.basename(bpy.data.filepath or '') != 'tshirt_src.blend': bpy.ops.wm.open_mainfile(filepath=SRC)
arm = bpy.data.objects['CC3_Base_Plus']; body = bpy.data.objects['CC_Base_Body']; hi = bpy.data.objects['tshirt_high']; dec = bpy.data.objects['tshirt_low']
for m in list(hi.modifiers):
    if m.type == 'CLOTH': hi.modifiers.remove(m)   # unbaked: a no-op at frame 0, it would only slow the bake
for o in (arm, body, hi, dec):
    o.hide_viewport = False
    try: o.hide_set(False)
    except RuntimeError: pass
arm.data.pose_position = 'POSE'; bpy.context.view_layer.update()


def say(*a): print('[tee_game %5.1fs]' % (time.time() - T0), *a, flush=True)


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


def inside(P, bvh, nrm_of=None):
    """Share of the points P lying under the surface (the nearest face's normal points away from them)."""
    n = 0
    for p in P:
        loc, nrm, fi, d = bvh.find_nearest(p)
        if loc is None: continue
        if nrm_of: nrm = nrm_of(fi)
        if (p - loc).dot(nrm) < 0: n += 1
    return n / max(len(P), 1)


# —— 1. weights from the posed body (T-pose) ——
gname = {g.index: g.name for g in body.vertex_groups}
BW = [{gname[g.group]: g.weight for g in v.groups if g.weight > 0 and KEEP.match(gname[g.group])} for v in body.data.vertices]
BV_T, BT_T, BVH_T = body_now()


def weights(P, EDGES):
    W = []
    for p in P:
        loc, nrm, fi, d = BVH_T.find_nearest(p)
        a, b, c = (BV_T[i] for i in BT_T[fi])
        v0, v1, v2 = b - a, c - a, loc - a
        d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
        den = d00 * d11 - d01 * d01 or 1e-12
        y = (d11 * d20 - d01 * d21) / den; z = (d00 * d21 - d01 * d20) / den; x = 1 - y - z
        w = {}
        for bi, f in zip(BT_T[fi], (x, y, z)):
            for g, gw in BW[bi].items(): w[g] = w.get(g, 0) + max(f, 0) * gw
        W.append(w)
    nbr = [[] for _ in P]
    for i, j in EDGES: nbr[i].append(j); nbr[j].append(i)
    for _ in range(SMOOTH):
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
    return out


# —— 2. inverse skinning to the bind A-pose ——
amw, ami = arm.matrix_world.copy(), arm.matrix_world.inverted()
S_POSE = {pb.name: amw @ pb.matrix @ pb.bone.matrix_local.inverted() @ ami for pb in arm.pose.bones}


def blend(w, S):
    M = Matrix(((0,) * 4,) * 4)
    for g, x in w: M = M + S.get(g, IDENT) * x
    return M


IDENT = Matrix.Identity(4)


def unskin(P, W):
    RP, RM = [], []
    for p, w in zip(P, W):
        Mi = blend(w, S_POSE).inverted(); RP.append(Mi @ p); RM.append(Mi.to_3x3())
    return RP, RM


# —— 3. the punch: CC_Base_L_Upperarm 80 deg forward from the A-pose; flipped triangles, edge stretch ——
def rest_point(name, tail=False):
    b = arm.data.bones[name]; return amw @ (b.tail_local if tail else b.head_local)


up = Vector((0, 0, 1)); fwd = rest_point('CC_Base_L_ToeBase') - rest_point('CC_Base_L_Foot'); fwd.z = 0; fwd.normalize()
SUB = {b.name for b in [arm.data.bones['CC_Base_L_Upperarm']] + list(arm.data.bones['CC_Base_L_Upperarm'].children_recursive)}
piv, elb = rest_point('CC_Base_L_Upperarm'), rest_point('CC_Base_L_Forearm')


def punch_R(deg):
    axis = fwd.cross(up).normalized()
    for s in (1, -1):
        R = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(deg) * s, 4, axis) @ Matrix.Translation(-piv)
        if ((R @ elb) - elb).dot(fwd) > 0: return R
    raise SystemExit('punch: no forward rotation')


S_PUNCH = {g: punch_R(80) for g in SUB}


def tri_n(P, t):
    a, b, c = (P[i] for i in t); return (b - a).cross(c - a)


def bend_check(tag, RP, TRI, EDGES, W):
    M = [blend(w, S_PUNCH) for w in W]; Q = [m @ p for m, p in zip(M, RP)]
    hit = [any(g in SUB for g, _ in w) for w in W]
    flips, n = 0, 0
    for t in TRI:
        if not any(hit[i] for i in t): continue
        n += 1; n0 = tri_n(RP, t); n1 = tri_n(Q, t)
        ex = sum((M[i].to_3x3() for i in t[1:]), M[t[0]].to_3x3()) @ n0   # where the rest normal should point after the move
        if n0.length < 1e-12 or n1.dot(ex) < 0: flips += 1
    st = [((Q[i] - Q[j]).length / max((RP[i] - RP[j]).length, 1e-9)) for i, j in EDGES if hit[i] or hit[j]]
    st.sort()
    say('%s punch (L upperarm +80 deg fwd): %d / %d arm triangles flipped; edge length ratio min %.2f p1 %.2f p99 %.2f max %.2f, >1.3: %.1f%%, <0.7: %.1f%%' % (
        tag, flips, n, st[0], st[len(st) // 100], st[-len(st) // 100 - 1], st[-1], 100 * sum(x > 1.3 for x in st) / len(st), 100 * sum(x < 0.7 for x in st) / len(st)))
    return flips


# —— the low poly candidates ——
def quad_low():
    lo = hi.copy(); lo.data = bpy.data.meshes.new_from_object(hi.evaluated_get(bpy.context.evaluated_depsgraph_get())); lo.modifiers.clear()
    lo.name = lo.data.name = 'tshirt_game'; bpy.context.collection.objects.link(lo)
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = lo; lo.select_set(True)
    if SHARP:
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(SHARP))
        bpy.ops.mesh.mark_sharp(); bpy.ops.object.mode_set(mode='OBJECT')
    r = bpy.ops.object.quadriflow_remesh(target_faces=FACES, use_preserve_sharp=bool(SHARP), use_mesh_symmetry=True, seed=0)
    if 'FINISHED' not in r or len(lo.data.polygons) > FACES * 2: raise SystemExit('QuadriFlow failed: %s, %d faces' % (r, len(lo.data.polygons)))
    return lo


def dec_low():
    lo = dec.copy(); lo.data = bpy.data.meshes.new_from_object(dec.evaluated_get(bpy.context.evaluated_depsgraph_get())); lo.modifiers.clear()
    lo.name = lo.data.name = 'tshirt_game_dec'; bpy.context.collection.objects.link(lo)
    return lo


def prep(lo):
    bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = lo; lo.select_set(True)
    bpy.ops.object.shade_smooth()
    while lo.data.uv_layers: lo.data.uv_layers.remove(lo.data.uv_layers[0])
    lo.data.uv_layers.new(name='UVMap')
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.01, area_weight=0.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    P, TRI, EDGES = evaluated(lo)
    W = weights(P, EDGES); RP, RM = unskin(P, W)
    return dict(obj=lo, P=P, TRI=TRI, EDGES=EDGES, W=W, RP=RP, RM=RM)


C = {}
for tag, mk in (('quad', quad_low), ('decimate', dec_low)):
    C[tag] = prep(mk())
    say('%s: %d tris, %d verts' % (tag, len(C[tag]['TRI']), len(C[tag]['P'])))
    bend_check(tag, C[tag]['RP'], C[tag]['TRI'], C[tag]['EDGES'], C[tag]['W'])
G = C[LOW]; lo = G['obj']
for tag, c in C.items():
    if c is not G: bpy.data.objects.remove(c['obj'])
say('exporting', LOW)

# uv stretch: per triangle (uv area / 3d area) against the mesh's mean; the share far from it
me = lo.data; me.calc_loop_triangles(); uvl = me.uv_layers.active.data; mw = lo.matrix_world
rat = []
for t in me.loop_triangles:
    a, b, c = (mw @ me.vertices[i].co for i in t.vertices); A3 = (b - a).cross(c - a).length
    u0, u1, u2 = (Vector((*uvl[l].uv, 0)) for l in t.loops); Au = (u1 - u0).cross(u2 - u0).length
    if A3 > 1e-12: rat.append(Au / A3)
mr = sum(rat) / len(rat); rat = [r / mr for r in rat]
say('uv stretch: triangles with uv/3d area off the mean by >2x: %.1f%%, by >1.5x: %.1f%%' % (
    100 * sum(r > 2 or r < 0.5 for r in rat) / len(rat), 100 * sum(r > 1.5 or r < 1 / 1.5 for r in rat) / len(rat)))

# —— the checks of step 2 ——
P, TRI, W, RP, RM = G['P'], G['TRI'], G['W'], G['RP'], G['RM']
say('inside the body, T-pose (as made): %.2f%%' % (100 * inside(P, BVH_T)))
chk = bpy.data.objects.new('tee_check', bpy.data.meshes.new('tee_check')); bpy.context.collection.objects.link(chk)
chk.data.from_pydata([tuple(p) for p in RP], [], [tuple(t) for t in TRI]); chk.data.update()
VG = {}
for i, w in enumerate(W):
    for g, x in w:
        if g not in VG: VG[g] = chk.vertex_groups.new(name=g)
        VG[g].add([i], x, 'REPLACE')
am = chk.modifiers.new('arm', 'ARMATURE'); am.object = arm; am.use_vertex_groups = True
nd = [b.name for b in arm.data.bones if not b.use_deform and b.name in VG]
if nd: say('WARNING: non-deform bones in the weights (the game skins them, the modifier does not):', nd)
bpy.context.view_layer.update(); Q, _, _ = evaluated(chk)
err = max((q - p).length for q, p in zip(Q, P))
say('armature modifier, rest mesh re-posed to the T-pose: max error %.3f mm %s' % (1000 * err, 'OK' if err < 0.001 else 'FAIL (> 1 mm)'))
arm.data.pose_position = 'REST'; bpy.context.view_layer.update()
_, _, BVH_A = body_now()
say('inside the body, bind A-pose (Blender body): %.2f%%' % (100 * inside(RP, BVH_A)))
bpy.data.objects.remove(chk)
obj_path = os.path.join(HERE, 'out', 'body.obj')
if os.path.exists(obj_path):   # the game's own dump: metres, Y-up (= glTF frame); vn per vertex
    OV, ON, OF = [], [], []
    for ln in open(obj_path):
        s = ln.split()
        if not s: continue
        if s[0] == 'v': OV.append(Vector(map(float, s[1:4])))
        elif s[0] == 'vn': ON.append(Vector(map(float, s[1:4])))
        elif s[0] == 'f': OF.append([int(x.split('/')[0]) - 1 for x in s[1:4]])
    obvh = BVHTree.FromPolygons(OV, OF)
    fn = (lambda fi: sum((ON[i] for i in OF[fi]), Vector())) if len(ON) == len(OV) else None   # the dump's own normals: the winding is not trusted
    RPg = [Vector((p.x, p.z, -p.y)) for p in RP]
    say('inside the body, bind A-pose (out/body.obj of the game): %.2f%%' % (100 * inside(RPg, obvh, fn)))
    # the frames agree? mean distance of the shirt's rest verts to that body vs to Blender's
    d1 = sum(obvh.find_nearest(p)[3] for p in RPg) / len(RPg); d2 = sum(BVH_A.find_nearest(p)[3] for p in RP) / len(RP)
    say('mean shirt-body gap: game body.obj %.1f mm, Blender body %.1f mm (must agree: same frame)' % (1000 * d1, 1000 * d2))
else:
    say('(no out/body.obj: run tools/assets/cloth/export_body.py for the check against the game\'s own body)')
arm.data.pose_position = 'POSE'; bpy.context.view_layer.update()

# —— 5. bakes (T-pose: low and high coincide) ——
os.makedirs(OUT, exist_ok=True)


def save_webp(img, path, quality):
    img.filepath_raw = path; img.file_format = 'WEBP'
    try: img.save(filepath=path, quality=quality)
    except TypeError: img.save()
    except RuntimeError as e:   # a bpy build without WebP: PNG, then ffmpeg when there is one
        say('WebP save failed (%s), PNG + ffmpeg' % e); png = path[:-5] + '.png'; img.file_format = 'PNG'; img.filepath_raw = png; img.save()
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', png] + (['-lossless', '1'] if quality >= 100 else ['-quality', str(quality)]) + [path], check=True); os.remove(png)
    say('wrote %s %d bytes' % (os.path.relpath(path, ROOT), os.path.getsize(path)))


if BAKE:
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'
    cp = bpy.context.preferences.addons['cycles'].preferences; dev = 'CPU'
    for t in ('OPTIX', 'CUDA', 'METAL', 'HIP', 'ONEAPI'):
        try: cp.compute_device_type = t
        except TypeError: continue
        cp.get_devices(); gpus = [d for d in cp.devices if d.type != 'CPU']
        if gpus:
            for d in cp.devices: d.use = d.type != 'CPU'
            sc.cycles.device = 'GPU'; dev = t; break
    bk = sc.render.bake; bk.margin = 8; bk.use_selected_to_active = True; bk.cage_extrusion = CAGE; bk.max_ray_distance = RAY; bk.normal_space = 'TANGENT'
    mat = bpy.data.materials.new('tee_game'); mat.use_nodes = True; nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); bsdf.inputs['Base Color'].default_value = (0.85, 0.84, 0.8, 1)
    lo.data.materials.clear(); lo.data.materials.append(mat)

    def bake(kind, name, res, fill, samples):
        img = bpy.data.images.new(name, res, res, alpha=False, float_buffer=False); img.colorspace_settings.name = 'Non-Color'
        img.pixels.foreach_set(list(fill) * (res * res))
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nt.nodes.active = tex
        sc.cycles.samples = samples
        bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
        t0 = time.time(); bpy.ops.object.bake(type=kind); say('bake %s %d px: %s, %.1f s' % (kind, res, dev, time.time() - t0))
        return img

    img = bake('NORMAL', 'tee_n', RES, (0.5, 0.5, 1.0, 1.0), 1)
    px = img.pixels[:]; flat = sum(1 for i in range(0, len(px), 4) if abs(px[i] - 0.5) < 0.004 and abs(px[i + 1] - 0.5) < 0.004 and px[i + 2] > 0.996)
    steep = sum(1 for i in range(2, len(px), 4) if px[i] < 0.75)
    say('normal map: texels still flat %.1f%% (unbaked or truly flat), steep %.2f%% (rays that hit the wrong side; raise CAGE / RAY if high)' % (100 * flat / RES ** 2, 100 * steep / RES ** 2))
    save_webp(img, os.path.join(OUT, 'tee_n.webp'), 100)
    # issue 81: no AO bake any more — the cloth-alone AO of the two fabric layers came out in camouflage patches, and the game's
    # screen-space AO pass shades the folds and the contact with the body anyway (src/game/04j_cloth_asset.js).
    # The light mesh for GFX low (tee_lo.glb, same uv, same tee_n.webp) is thinned from tee.glb by tools/assets/cloth/tee_lo.js.

# —— 6. GLB ——
me = lo.data; me.calc_loop_triangles(); me.calc_tangents(); r3 = lo.matrix_world.to_3x3().normalized(); uvl = me.uv_layers.active.data
bones = sorted({g for w in W for g, _ in w})
if len(bones) > 255: raise SystemExit('too many bones for uint8 joints')
gl = lambda v: (v.x, v.z, -v.y)   # Blender Z-up -> glTF Y-up
key, VP, VN, VT, VU, VJ, VW, IDX = {}, [], [], [], [], [], [], []
for t in me.loop_triangles:
    for vi, li in zip(t.vertices, t.loops):
        L = me.loops[li]; u = tuple(uvl[li].uv); n = (RM[vi] @ (r3 @ L.normal)).normalized()
        k = (vi, round(u[0], 5), round(u[1], 5), round(n.x, 2), round(n.y, 2), round(n.z, 2))
        if k not in key:
            key[k] = len(VP); VP.append(gl(RP[vi])); VN.append(gl(n))
            tg = RM[vi] @ (r3 @ L.tangent); tg = (tg - n * tg.dot(n)).normalized(); VT.append(gl(tg) + (L.bitangent_sign,))
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
    'asset': {'version': '2.0', 'generator': 'tools/assets/cloth/tee_game.py'},
    'extensionsUsed': ['KHR_mesh_quantization'], 'extensionsRequired': ['KHR_mesh_quantization'],
    'scene': 0, 'scenes': [{'nodes': [0]}],
    'nodes': [{'name': 'tee', 'mesh': 0, 'translation': ctr, 'scale': [half] * 3}],   # dequantisation: int16 / 32767 * half + ctr (metres)
    'meshes': [{'name': 'tee', 'primitives': [{'attributes': attrs, 'indices': ind, 'mode': 4,
                'extras': {'bones': bones}}],   # JOINTS_0 indexes this list (CC_Base_* names of the game skeleton)
                'extras': {'src': 'tools/assets/cloth/user/tshirt_src.blend', 'low': LOW, 'pose': 'bind A-pose', 'frame': 'metres, Y-up; game body geometry = 100 * (x, -z, y)'}}],
    'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
}
js = json.dumps(doc, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bin_
path = os.path.join(OUT, 'tee.glb'); open(path, 'wb').write(glb)
say('wrote %s: %d bytes (%s), %d verts, %d tris, %d bones' % (os.path.relpath(path, ROOT), len(glb), 'OK' if len(glb) < 300 * 1024 else 'OVER the 300 KB target: lower FACES', nv, len(IDX) // 3, len(bones)))
say('done')
