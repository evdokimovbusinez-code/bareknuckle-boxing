"""Hand-made tee: game low poly (QuadriFlow quads, the rims kept as sharp loops, + Smart UV) and its normal map baked from tshirt_high (Cycles, GPU when there is one).

    /Applications/Blender.app/Contents/MacOS/Blender -b tools/assets/cloth/user/tshirt_src.blend \
        --python tools/assets/cloth/bake_tee.py [-- FACES]      (env: FACES=6000 SHARP=45 CAGE=0.02 RES=1024)

Writes  out/tshirt_baked.blend  (+ object `tshirt_game`; open it and orbit, the normal map is on its material)
        assets/tee_hand_n.png   (tangent space, MikkTSpace, OpenGL / Y+ like three.js, 1024 px, lossless)
Then:   Blender -b tools/assets/cloth/out/tshirt_baked.blend --python tools/assets/cloth/user_tee.py -- game
Prints the bake device and time, the low poly's size, and the share of the map's texels left unbaked (the margin is not counted).
"""
import bpy, math, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
FACES = int(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else int(os.environ.get('FACES', 6000))
RES, CAGE, SAMPLES = int(os.environ.get('RES', 1024)), float(os.environ.get('CAGE', 0.02)), int(os.environ.get('SAMPLES', 1))   # px; m, how far out of the low poly the bake rays start

hi = bpy.data.objects['tshirt_high']
for m in list(hi.modifiers): hi.modifiers.remove(m)   # the unbaked Cloth modifier would only slow the bake
# 1. low poly: a quad remesh of the high one
lo = hi.copy(); lo.data = hi.data.copy(); lo.name = lo.data.name = 'tshirt_game'; bpy.context.collection.objects.link(lo)
bpy.ops.object.select_all(action='DESELECT'); bpy.context.view_layer.objects.active = lo; lo.select_set(True)
SHARP = float(os.environ.get('SHARP', 45))   # deg; > 0: the rims of the cloth's thickness (edges sharper than this) are kept as edge loops
if SHARP:
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.mesh.edges_select_sharp(sharpness=math.radians(SHARP))
    bpy.ops.mesh.mark_sharp(); bpy.ops.object.mode_set(mode='OBJECT')
r = bpy.ops.object.quadriflow_remesh(target_faces=FACES, use_preserve_sharp=bool(SHARP), use_mesh_symmetry=True, seed=0)
if 'FINISHED' not in r or len(lo.data.polygons) > FACES * 2: raise SystemExit('QuadriFlow failed: %s, %d faces' % (r, len(lo.data.polygons)))
print('low poly: %d quads, %d verts' % (len(lo.data.polygons), len(lo.data.vertices)))
bpy.ops.object.shade_smooth()
# 2. uv: islands by angle, packed with a margin for the bake's padding
while lo.data.uv_layers: lo.data.uv_layers.remove(lo.data.uv_layers[0])
lo.data.uv_layers.new(name='UVMap')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.01, area_weight=0.0, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')
# 3. bake target
img = bpy.data.images.new('tee_hand_n', RES, RES, alpha=False, float_buffer=False); img.colorspace_settings.name = 'Non-Color'
img.pixels.foreach_set([0.5, 0.5, 1.0, 1.0] * (RES * RES))   # flat normal where the bake does not reach
mat = bpy.data.materials.new('tee_game'); mat.use_nodes = True; nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'); bsdf.inputs['Base Color'].default_value = (0.85, 0.84, 0.8, 1)
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; nm = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(tex.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
nt.nodes.active = tex   # the bake writes into the active image node
lo.data.materials.clear(); lo.data.materials.append(mat)
# 4. bake on the GPU when Blender has one
sc = bpy.context.scene
try: sc.render.engine = 'CYCLES'
except TypeError as e: raise SystemExit(e)
cp = bpy.context.preferences.addons['cycles'].preferences; dev = 'CPU'
for t in ('OPTIX', 'CUDA', 'METAL', 'HIP', 'ONEAPI'):
    try: cp.compute_device_type = t
    except TypeError: continue
    cp.get_devices()
    gpus = [d for d in cp.devices if d.type != 'CPU']
    if gpus:
        for d in cp.devices: d.use = d.type != 'CPU'
        sc.cycles.device = 'GPU'; dev = t + ': ' + ', '.join(d.name for d in gpus); break
sc.cycles.samples = SAMPLES; sc.render.bake.margin = 8; sc.render.bake.use_selected_to_active = True
sc.render.bake.cage_extrusion = CAGE; sc.render.bake.max_ray_distance = 2 * CAGE; sc.render.bake.normal_space = 'TANGENT'
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
t0 = time.time(); bpy.ops.object.bake(type='NORMAL')
print('bake: %s, %.1f s' % (dev, time.time() - t0))
px = img.pixels[:]; flat = sum(1 for i in range(0, len(px), 4) if abs(px[i] - 0.5) < 0.004 and abs(px[i + 1] - 0.5) < 0.004 and px[i + 2] > 0.996)
steep = sum(1 for i in range(2, len(px), 4) if px[i] < 0.75)   # tilted > ~60 deg: a ray that hit the wrong side of the cloth
print('texels still flat (unbaked or truly flat): %.1f%%, steep (artefacts): %.2f%%' % (100 * flat / (RES * RES), 100 * steep / (RES * RES)))
# 5. save
out = os.path.join(ROOT, 'assets', 'tee_hand_n.png')
img.filepath_raw = out; img.file_format = os.environ.get('FMT', 'PNG'); img.save()   # lossless: lossy blocks show as dents in the light
img.pack()
for o in bpy.data.objects:   # the file opens on the result: only the game shirt and the body, in material preview
    if o.name.startswith('tshirt_') and o is not lo: o.hide_set(True); o.hide_render = True
for scr in bpy.data.screens:
    for ar in scr.areas:
        for sp in ar.spaces:
            if sp.type == 'VIEW_3D': sp.shading.type = 'MATERIAL'
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'out', 'tshirt_baked.blend'), compress=True)
print('wrote', out, os.path.getsize(out), 'bytes')
