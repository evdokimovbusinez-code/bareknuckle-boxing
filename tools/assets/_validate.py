"""Walk the rebuilt (shape-stripped) FBX the way FBXLoader.parseNode does."""
import os, base64, struct, sys
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('conv', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'convert.py'))
conv = importlib.util.module_from_spec(spec); spec.loader.exec_module(conv)

raw = base64.b64decode(open(os.path.join(ROOT, 'assets', 'boxer.fbx.txt'), 'rb').read())
f = conv.Fbx(raw)
tops, footer_at = f.top()
trimmed = conv.strip_shapes(f, tops) + raw[footer_at:]
g = conv.Fbx(trimmed)

count = [0, 0]
def walk(n, path):
    count[0] += 1
    assert n['o'] < n['end'] <= len(trimmed), ('bad end', path, n['o'], n['end'], len(trimmed))
    kids, null_at = g.children(n)
    for c in kids:
        walk(c, path + '/' + c['name'])
    gap = n['end'] - null_at
    assert gap in (0, 13), ('bad NULL gap', path, gap)
    if gap == 13:
        assert trimmed[null_at:n['end']] == b'\0' * 13, ('NULL not zero', path)
    if n['name'] == 'Geometry' and conv.geom_class(g, n) == 'Shape':
        count[1] += 1
        assert not kids, ('shape still has children', path)

tops2, foot2 = g.top()
for n in tops2:
    walk(n, n['name'])
print('OK:', count[0], 'nodes,', count[1], 'shape geometries (empty), footer at', foot2, 'file', len(trimmed))
print('header version', struct.unpack_from('<I', trimmed, 23)[0])
