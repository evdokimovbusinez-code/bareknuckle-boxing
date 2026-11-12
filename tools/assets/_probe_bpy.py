import base64, os, tempfile, sys
import bpy

print("BLENDER", bpy.app.version_string)
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root
assets = os.path.join(root, "assets")

# ops available?
print("import_scene.fbx:", hasattr(bpy.ops.import_scene, "fbx"))
print("export_scene.gltf:", hasattr(bpy.ops.export_scene, "gltf"))
try:
    print("wm.fbx_import:", hasattr(bpy.ops.wm, "fbx_import"))
except Exception as e:
    print("wm check", e)

# decode raw FBX bytes to a temp file
raw = base64.b64decode(open(os.path.join(assets, "boxer.fbx.txt"), "rb").read())
tmp = tempfile.mkdtemp(prefix="bkf_")
fp = os.path.join(tmp, "boxer.fbx")
open(fp, "wb").write(raw)
print("fbx bytes", len(raw), "->", fp)

# clear default scene
bpy.ops.wm.read_factory_settings(use_empty=True)

ok = False
try:
    bpy.ops.import_scene.fbx(filepath=fp)
    ok = True
    print("import OK")
except Exception as e:
    print("import via import_scene.fbx FAILED:", repr(e))
    try:
        bpy.ops.wm.fbx_import(filepath=fp)
        ok = True
        print("import via wm.fbx_import OK")
    except Exception as e2:
        print("wm.fbx_import FAILED:", repr(e2))

if ok:
    objs = list(bpy.data.objects)
    print("objects", len(objs))
    meshes = [o for o in objs if o.type == 'MESH']
    arms = [o for o in objs if o.type == 'ARMATURE']
    print("meshes", len(meshes), "armatures", len(arms))
    for o in meshes[:12]:
        sk = o.data.shape_keys
        print("  mesh", repr(o.name), "verts", len(o.data.vertices), "polys", len(o.data.polygons),
              "shapekeys", (len(sk.key_blocks) if sk else 0), "vgroups", len(o.vertex_groups))
    for a in arms:
        print("  armature", repr(a.name), "bones", len(a.data.bones))
        print("  first bones:", [b.name for b in list(a.data.bones)[:8]])
        cc = [b.name for b in a.data.bones if b.name.startswith("CC_Base_")]
        print("  CC_Base_* bones:", len(cc), "sample:", cc[:6])
    if meshes and meshes[0].data.shape_keys:
        print("  first shape keys:", [k.name for k in list(meshes[0].data.shape_keys.key_blocks)[:12]])
