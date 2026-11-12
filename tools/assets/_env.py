try:
    import bpy
    print("bpy OK", bpy.app.version_string)
except Exception as e:
    print("bpy FAIL", repr(e))
import sys
print("python", sys.version)
