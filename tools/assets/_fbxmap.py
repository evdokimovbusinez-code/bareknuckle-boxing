import base64, os, struct
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
raw = base64.b64decode(open(os.path.join(root, "assets", "boxer.fbx.txt"), "rb").read())
u8 = raw
ver = struct.unpack_from("<I", raw, 23)[0]
big = ver >= 7500
w = 8 if big else 4
NULL = 25 if big else 13
def num(o): return struct.unpack_from("<Q" if big else "<I", raw, o)[0]

def node(o):
    end = num(o); np = num(o + w); plen = num(o + 2*w)
    nl = u8[o + 3*w]
    name = raw[o+3*w+1:o+3*w+1+nl].decode("latin1")
    p = o + 3*w + 1 + nl
    k = p + plen
    return {"o": o, "end": end, "np": np, "plen": plen, "name": name, "p": p, "k": k}

def children(n):
    out = []; o = n["k"]
    while o < n["end"] - NULL:
        nn = node(o)
        if nn["end"] == 0: break
        out.append(nn); o = nn["end"]
    return out

# top-level: starts at header end (27 for 32-bit? magic is 23 bytes + 4 version... actually nodes start at 27)
# FBX: 23-byte magic "Kaydara FBX Binary  \x00" + 4 version = 27; then top-level nodes
def props(n):
    out = []; p = n["p"]; end = p + n["plen"]
    for _ in range(n["np"]):
        t = chr(u8[p]); p += 1
        if t in "L": out.append(("L", p)); p += 8
        elif t == "I": p += 4
        elif t == "D": p += 8
        elif t == "F": p += 4
        elif t == "Y": p += 2
        elif t == "C": p += 1
        elif t in "SR":
            l = struct.unpack_from("<I", raw, p)[0]; s = raw[p+4:p+4+l]; p += 4+l
            if t == "S": out.append(("S", s.decode("latin1").split("\0")[0]))
        else:
            l, enc, cl = struct.unpack_from("<III", raw, p); p += 12 + cl
    return out

top = []
o = 27
while o < len(raw) - NULL:
    n = node(o)
    if n["end"] == 0: break
    top.append(n); o = n["end"]
print("FBX version", ver, "big", big, "top nodes", [n["name"] for n in top])
for n in top:
    print(f"  {n['name']:16s} bytes={n['end']-n['o']:>10d}")

objs = next(n for n in top if n["name"] == "Objects")
geos = [c for c in children(objs) if c["name"] == "Geometry"]
print("Geometry nodes:", len(geos))
tot_shape = 0; shape_names = []
for g in geos:
    pr = props(g)
    cls = next((v for t, v in pr if t == "S" and "Mesh" not in v and "Shape" not in v), None)
    # second S is name, third is class
    ss = [v for t, v in pr if t == "S"]
    nm = ss[0] if ss else "?"
    c = ss[1] if len(ss) > 1 else "?"
    sz = g["end"] - g["o"]
    if c == "Shape":
        tot_shape += sz; shape_names.append(nm)
    elif c == "Mesh":
        print(f"  MESH  {nm:24s} bytes={sz:>10d}")
print(f"TOTAL Shape geometry bytes = {tot_shape} ({tot_shape/1e6:.2f} MB), {len(shape_names)} shapes")
print("sample shape names:", shape_names[:8])
print(f"NON-shape bytes in Objects ~ {objs['end']-objs['o']-tot_shape}")
