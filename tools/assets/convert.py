#!/usr/bin/env python3
"""Rebuild the compressed GLB asset pack from the original .fbx.txt / .jpg sources.

    python3 tools/assets/convert.py

Blender is used as a Python module (bpy) to re-encode the 13 JPG textures as WebP.
No glTF mesh/morph-target conversion is done: the game rebuilds the boxer from the
EXACT FBX byte stream (skinTemplate, makeShorts, tattoos, aPalm, bind matrices and
bone names all depend on that byte layout).  Keeping the bytes verbatim is what makes
the GLB build "один в один" with the FBX build.

What the pack actually contains (assets/pack.glb, a valid glTF 2.0 GLB):
  * one bufferView per FBX stream, zlib-compressed (unzlibSync at runtime);
  * the boxer FBX with its 300 unused Shape geometry bodies removed (EndOffsets
    recomputed) -- 6.3 MB of morph data the game drops anyway, see boxer.html:927;
  * assets/face.bin: the 32 FACE_SHAPES control-point deltas lifted out of the FBX
    before stripping, so faceShapes() can still build the same aFM / delta texture.
  * 13 WebP textures stay as separate files (KTX2 needs a toktx/basisu encoder,
    which is not available in this build environment; WebP is the allowed fallback).

The old .fbx.txt / .jpg files are never deleted: if pack.glb is missing or broken,
the loader silently falls back to them.
"""
import os, sys, base64, struct, zlib, json, array
sys.setrecursionlimit(20000)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AS = os.path.join(ROOT, 'assets')

# FILES keys in src/boxer.html (after assemble.py renames upper/hook -> upperR/hookL/...).
FBX = {
    'assets/boxer.fbx.txt': 'boxer.fbx.txt',
    'assets/wraps.fbx.txt': 'wraps.fbx.txt',
    'assets/Idle_Boxing_Bouncing.fbx.txt': 'Idle_Boxing_Bouncing.fbx.txt',
    'assets/Punch_Lead_Jab_Head_Medium.fbx.txt': 'Punch_Lead_Jab_Head_Medium.fbx.txt',
    'assets/Punch_Rear_Cross_Head.fbx.txt': 'Punch_Rear_Cross_Head.fbx.txt',
    'assets/Punch_Rear_Uppercut_Head.fbx.txt': 'Punch_Rear_Uppercut_Head.fbx.txt',
    'assets/Punch_Lead_Hook_Head.fbx.txt': 'Punch_Lead_Hook_Head.fbx.txt',
    'assets/Punch_Rear_Hook_Head.fbx.txt': 'Punch_Rear_Hook_Head.fbx.txt',
    'assets/Punch_Lead_Uppercut_Head.fbx.txt': 'Punch_Lead_Uppercut_Head.fbx.txt',
}
TEX = ['head_d', 'head_n', 'body_d', 'arm_d', 'leg_d', 'body_n', 'arm_n', 'leg_n',
       'nails_d', 'eye_d', 'teeth_d', 'wraps_d', 'wraps_n']
# kept in g_pre.js -> FACE_SHAPES (same order!)
FACE_SHAPES = ['A01_Brow_Inner_Up', 'A02_Brow_Down_Left', 'A03_Brow_Down_Right', 'A04_Brow_Outer_Up_Left', 'A05_Brow_Outer_Up_Right',
  'A16_Eye_Squint_Left', 'A17_Eye_Squint_Right', 'A18_Eye_Wide_Left', 'A19_Eye_Wide_Right', 'A21_Cheek_Squint_Left', 'A22_Cheek_Squint_Right',
  'A23_Nose_Sneer_Left', 'A24_Nose_Sneer_Right', 'Cheek_Blow_L', 'Cheek_Blow_R', 'A29_Mouth_Funnel', 'A31_Mouth_Left', 'A32_Mouth_Right', 'A36_Mouth_Shrug_Lower',
  'A38_Mouth_Smile_Left', 'A39_Mouth_Smile_Right', 'A40_Mouth_Frown_Left', 'A41_Mouth_Frown_Right', 'A44_Mouth_Upper_Up_Left', 'A45_Mouth_Upper_Up_Right',
  'A46_Mouth_Lower_Down_Left', 'A47_Mouth_Lower_Down_Right', 'A48_Mouth_Press_Left', 'A49_Mouth_Press_Right', 'A50_Mouth_Stretch_Left', 'A51_Mouth_Stretch_Right']

# ───────────────────────── binary FBX 7200 reader (32-bit offsets) ─────────────────────────
class Fbx:
    def __init__(self, raw):
        self.raw = raw
    def u32(self, o):
        return struct.unpack_from('<I', self.raw, o)[0]
    def node(self, o):
        raw = self.raw
        end, np_, plen = struct.unpack_from('<III', raw, o)
        nl = raw[o + 12]
        p = o + 13 + nl
        return dict(o=o, end=end, np=np_, plen=plen, p=p, k=p + plen,
                    name=raw[o + 13:o + 13 + nl].decode('latin1'), hdr=13 + nl)
    def children(self, n):
        out, o = [], n['k']
        while o + 13 <= n['end']:
            c = self.node(o)
            if c['end'] == 0:
                return out, o            # NULL record at o
            out.append(c)
            o = c['end']
        return out, o
    def props(self, n):
        raw = self.raw
        out, p = [], n['p']
        for _ in range(n['np']):
            t = chr(raw[p]); p += 1
            if t == 'L':
                out.append(str(struct.unpack_from('<q', raw, p)[0])); p += 8
            elif t == 'I':
                out.append(struct.unpack_from('<i', raw, p)[0]); p += 4
            elif t == 'D':
                out.append(struct.unpack_from('<d', raw, p)[0]); p += 8
            elif t == 'F':
                out.append(struct.unpack_from('<f', raw, p)[0]); p += 4
            elif t == 'Y':
                out.append(struct.unpack_from('<h', raw, p)[0]); p += 2
            elif t == 'C':
                out.append(raw[p]); p += 1
            elif t in 'SR':
                l = self.u32(p); p += 4
                s = raw[p:p + l].decode('latin1'); p += l
                out.append(s if t == 'S' else None)
            else:                        # arrays f/d/l/i/b, raw or zlib
                l, enc, cl = struct.unpack_from('<III', raw, p); p += 12
                b = raw[p:p + cl]; p += cl
                if enc:
                    b = zlib.decompress(b)
                fmt = {'d': 'd', 'f': 'f', 'i': 'i', 'l': 'q', 'b': 'B'}[t]
                a = array.array(fmt)
                a.frombytes(b[:l * a.itemsize])
                if sys.byteorder != 'little':
                    a.byteswap()
                out.append(a)
        return out
    def top(self):
        out, o = [], 27
        while o + 13 <= len(self.raw):
            n = self.node(o)
            if n['end'] == 0:
                return out, o            # NULL record + footer start
            out.append(n); o = n['end']
        return out, o

def geom_class(f, n):
    """2nd S property of a Geometry node (name, class)."""
    raw, ss = f.raw, []
    p = n['p']
    for _ in range(n['np']):
        t = chr(raw[p]); p += 1
        if t == 'L': p += 8
        elif t == 'I': p += 4
        elif t == 'D': p += 8
        elif t == 'F': p += 4
        elif t == 'Y': p += 2
        elif t == 'C': p += 1
        elif t in 'SR':
            l = f.u32(p); p += 4
            if t == 'S': ss.append(raw[p:p + l].decode('latin1').split('\0')[0])
            p += l
        else:
            l, enc, cl = struct.unpack_from('<III', raw, p); p += 12 + cl
    return ss[1] if len(ss) > 1 else None

def strip_shapes(f, tops):
    """Rebuild the FBX, replacing every Shape Geometry's Indexes/Vertices children
    with a single NULL record.  All node IDs / Connections stay intact; the loader
    simply sees no morph geometry (genMorphGeometry's guard, FBXLoader:2230).
    EndOffsets are ABSOLUTE, so they are recomputed for every emitted node."""
    raw = f.raw
    def emit(n, at):
        kids, null_at = f.children(n)
        keep = [] if (n['name'] == 'Geometry' and geom_class(f, n) == 'Shape') else kids
        prop = raw[n['p']:n['k']]
        head = raw[n['o'] + 4:n['p']]        # np, plen, nameLen, name
        blobs, o = [], at + n['hdr'] + len(prop)
        for c in keep:
            blob, size = emit(c, o)
            blobs.append(blob); o += size
        tail = raw[null_at:n['end']]
        total = n['hdr'] + len(prop) + (o - at - n['hdr'] - len(prop)) + len(tail)
        return struct.pack('<I', at + total) + head + prop + b''.join(blobs) + tail, total
    out = bytearray(raw[:27])
    at = 27
    for n in tops:
        blob, size = emit(n, at)
        out += blob; at += size
    return bytes(out)

def face_pack(f):
    """Port of fbxShapes() (03b_face_shapes.js): control points + the 32 kept shapes
    (sparse Indexes/Vertices deltas), plus the ownership check so the eyelash/tear
    line duplicates are skipped."""
    tops, _ = f.top()
    objs = cons = None
    for n in tops:
        if n['name'] == 'Objects': objs = n
        elif n['name'] == 'Connections': cons = n
    par = {}
    for c in f.children(cons)[0]:
        pr = f.props(c)
        par.setdefault(pr[1], []).append(pr[2])
    up = lambda i: par.get(i, [])
    mesh, cand = None, []
    for n in f.children(objs)[0]:
        if n['name'] != 'Geometry': continue
        pr = f.props(n)
        id_, name, cls = pr[0], pr[1].split('\0')[0], pr[2].split('\0')[0]
        if cls == 'Mesh' and name == 'CC_Base_Body': mesh = (id_, n)
        elif cls == 'Shape' and name in FACE_SHAPES: cand.append((id_, name, n))
    assert mesh, 'CC_Base_Body not found'
    def owns(id_):
        for a in up(id_):
            for b in up(a):
                if mesh[0] in up(b): return True
        return False
    def child(n, nm):
        for c in f.children(n)[0]:
            if c['name'] == nm: return c
        return None
    shapes = {}
    for id_, name, n in cand:
        if name not in shapes and owns(id_):
            shapes[name] = (f.props(child(n, 'Indexes'))[0], f.props(child(n, 'Vertices'))[0])
    cp = f.props(child(mesh[1], 'Vertices'))[0]
    return cp, shapes

def build_face_bin(cp, shapes):
    b = bytearray(struct.pack('<4sII', b'BKFC', len(FACE_SHAPES), len(cp) // 3))
    b += struct.pack('<%df' % len(cp), *[float(x) for x in cp])       # f32: faceShapes() casts to Float32Array anyway
    for nm in FACE_SHAPES:
        s = shapes.get(nm)
        if not s:
            b += struct.pack('<I', 0); continue
        I, V = s
        b += struct.pack('<III', 1, len(I), len(V))
        b += struct.pack('<%di' % len(I), *I)
        b += struct.pack('<%dd' % len(V), *V)                          # f64: keeps big()/D bit-exact
    return bytes(b)

# ───────────────────────── textures: JPG -> WebP via bpy ─────────────────────────
def webp_textures():
    import bpy
    for n in TEX:
        src = os.path.join(AS, n + '.jpg')
        dst = os.path.join(AS, n + '.webp')
        img = bpy.data.images.load(src)
        img.pixels[0]                       # force the JPEG buffer to decode before saving
        img.file_format = 'WEBP'
        img.save(filepath=dst, quality=0)  # 0 = Blender's default (~q90), lossy WebP
        bpy.data.images.remove(img)
        print('  webp %-9s %7d -> %7d' % (n, os.path.getsize(src), os.path.getsize(dst)))

# ───────────────────────── GLB writer ─────────────────────────
def build_glb(blobs):
    bin_ = bytearray()
    views = []
    for key, data in blobs:
        off = len(bin_)
        bin_ += data
        while len(bin_) % 4: bin_.append(0)
        views.append(dict(buffer=0, byteOffset=off, byteLength=len(data)))
    gltf = {
        'asset': {'version': '2.0', 'generator': 'bareknuckle-assets'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'pack'}],
        'buffers': [{'byteLength': len(bin_)}], 'bufferViews': views,
        'extras': {'pack': {k: i for i, (k, _) in enumerate(blobs)}, 'zlib': 1},
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    total = 12 + 8 + len(js) + 8 + len(bin_)
    out = struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(js), 0x4E4F534A) + js
    out += struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    return out

def main():
    print('decode FBX base64 …')
    src = {k: base64.b64decode(open(os.path.join(AS, v), 'rb').read()) for k, v in FBX.items()}
    boxer = src['assets/boxer.fbx.txt']
    f = Fbx(boxer)
    tops, footer_at = f.top()
    print('  boxer FBX %d bytes, %d top-level nodes' % (len(boxer), len(tops)))

    print('lift FACE_SHAPES out of the FBX …')
    cp, shapes = face_pack(f)
    face_bin = build_face_bin(cp, shapes)
    print('  %d/%d shapes, %d control points, face.bin %d bytes' %
          (len(shapes), len(FACE_SHAPES), len(cp) // 3, len(face_bin)))

    print('strip unused Shape geometry bodies …')
    trimmed = strip_shapes(f, tops) + boxer[footer_at:]
    # sanity: the rebuilt tree must be walkable with in-bounds, monotonic offsets
    f2 = Fbx(trimmed)
    tops2, foot2 = f2.top()
    assert len(tops2) == len(tops) and foot2 + 13 <= len(trimmed)
    print('  trimmed boxer FBX %d -> %d bytes' % (len(boxer), len(trimmed)))

    blobs = []
    for key, data in src.items():
        payload = trimmed if key == 'assets/boxer.fbx.txt' else data
        blobs.append((key, zlib.compress(payload, 9)))
    blobs.append(('assets/face.bin', zlib.compress(face_bin, 9)))
    pack = build_glb(blobs)
    open(os.path.join(AS, 'pack.glb'), 'wb').write(pack)
    print('  pack.glb %d bytes (%d zlib streams)' % (len(pack), len(blobs)))

    print('re-encode textures …')
    webp_textures()

    # size table (first-load bytes, as served)
    before = sum(os.path.getsize(os.path.join(AS, v)) for v in FBX.values())
    before += sum(os.path.getsize(os.path.join(AS, n + '.jpg')) for n in TEX)
    after = len(pack) + sum(os.path.getsize(os.path.join(AS, n + '.webp')) for n in TEX)
    print('\n  first load: %.2f MB -> %.2f MB  (%.1f%%)' % (before / 1e6, after / 1e6, 100 * after / before))
    print('  fallback assets (.fbx.txt + .jpg) kept in place')

if __name__ == '__main__':
    main()
