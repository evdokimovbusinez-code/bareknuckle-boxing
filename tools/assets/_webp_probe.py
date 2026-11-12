import os, bpy
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = os.path.join(ROOT, 'assets', 'head_d.jpg')
img = bpy.data.images.load(src)
print('loaded', img.size[:], img.file_format, img.source)
try:
    p = img.pixels[0]
    print('pixels[0] OK', p)
except Exception as e:
    print('pixels FAIL', e)
img.file_format = 'WEBP'
img.filepath_raw = '/tmp/_wp2.webp'
try:
    img.save()
    print('save OK', os.path.getsize('/tmp/_wp2.webp'))
except Exception as e:
    print('save FAIL', repr(e))
try:
    img.save_render('/tmp/_wp3.webp')
    print('save_render OK', os.path.getsize('/tmp/_wp3.webp'))
except Exception as e:
    print('save_render FAIL', repr(e))
