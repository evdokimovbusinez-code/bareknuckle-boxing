import base64, os, struct, zlib
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
raw = base64.b64decode(open(os.path.join(root, "assets", "boxer.fbx.txt"), "rb").read())
def num(o): return struct.unpack_from("<I", raw, o)[0]
def node(o):
    end=num(o); nl=raw[o+12]; return {"o":o,"end":end,"name":raw[o+13:o+13+nl].decode("latin1")}
# walk top-level
o=27; last=None
while o < len(raw)-13:
    n=node(o)
    if n["end"]==0: break
    last=n; o=n["end"]
print("last top node:", last["name"], "end offset", last["end"], "file len", len(raw))
tail = raw[last["end"]:]
print("bytes after last node:", len(tail))
print("tail hex first 64:", tail[:64].hex())
print("tail as latin1:", repr(tail[:120]))

# gzip of shape-stripped (rough estimate): build a copy with shape-geometry byte ranges zeroed
# just to see compressibility when shape data becomes zeros
import copy
b = bytearray(raw)
def children(n):
    out=[]; c=n["k"]
    while c < n["end"]-13:
        nn=node_off(c)
        if nn["end"]==0: break
        out.append(nn); c=nn["end"]
    return out
def node_off(o):
    end=num(o); np_=num(o+4); plen=num(o+8); nl=raw[o+12]
    p=o+13+nl; k=p+plen
    return {"o":o,"end":end,"name":raw[o+13:o+13+nl].decode("latin1"),"p":p,"k":k,"np":np_,"plen":plen}
objs=None; o=27
while o<len(raw)-13:
    n=node_off(o)
    if n["end"]==0: break
    if n["name"]=="Objects": objs=n
    o=n["end"]
tot=0
for g in children(objs):
    if g["name"]!="Geometry": continue
    # class = 3rd S property
    p=g["p"]; ss=[]
    for _ in range(g["np"]):
        t=chr(raw[p]); p+=1
        if t=="L": p+=8
        elif t=="I": p+=4
        elif t=="D": p+=8
        elif t=="F": p+=4
        elif t=="Y": p+=2
        elif t=="C": p+=1
        elif t in "SR":
            l=struct.unpack_from("<I",raw,p)[0]; val=raw[p+4:p+4+l]; p+=4+l
            if t=="S": ss.append(val.decode("latin1").split("\0")[0])
        else:
            l,enc,cl=struct.unpack_from("<III",raw,p); p+=12+cl
    cls=ss[1] if len(ss)>1 else "?"
    if cls=="Shape":
        # zero the whole node body (keep header so offsets still valid)
        for i in range(g["k"], g["end"]): b[i]=0
        tot += g["end"]-g["k"]
print("zeroed shape bodies bytes:", tot/1e6, "MB")
gzed = zlib.compress(bytes(b), 9)
print("gzip of zeroed-shape FBX:", len(gzed)/1e6, "MB (zlib level 9)")

# Blender WebP support
try:
    import bpy
    img = bpy.data.images.load(os.path.join(root,"assets","head_d.jpg"))
    print("image", img.size[:], "file_format", img.file_format)
    img.file_format = 'WEBP'
    out = "/tmp/_webp_test.webp"
    img.save_render(out) if hasattr(img,'save_render') else None
    img.filepath_raw = out
    img.save()
    print("webp saved", os.path.getsize(out), "bytes")
except Exception as e:
    print("bpy webp FAIL:", repr(e))
