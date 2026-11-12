import os, base64, struct
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
raw = base64.b64decode(open(os.path.join(ROOT, 'assets', 'boxer.fbx.txt'), 'rb').read())
# just look for typical image extensions / texture-ish strings in the FBX bytes
for ext in (b'.jpg', b'.jpeg', b'.png', b'.tif', b'.tga', b'.bmp', b'Texture', b'Video'):
    print(ext.decode(), raw.count(ext))
# print short runs around 'Texture' names
import re
for m in list(re.finditer(rb'[ -~]{6,}', raw)):
    s = m.group()
    if b'.jpg' in s.lower() or b'.png' in s.lower() or b'.tif' in s.lower() or b'.tga' in s.lower():
        print('  ', s[:160])
