import os, bpy
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = os.path.join(ROOT, 'assets', 'head_d.jpg')
img = bpy.data.images.load(src)
_ = img.pixels[0]
img.file_format = 'WEBP'
print('save doc:', (img.save.__doc__ or '')[:400])
for q in (0, 50, 80, 95, 100):
    p = '/tmp/_wqq%d.webp' % q
    try:
        img.save(filepath=p, quality=q)
        print('quality', q, os.path.getsize(p))
    except Exception as e:
        print('quality', q, 'FAIL', repr(e))
