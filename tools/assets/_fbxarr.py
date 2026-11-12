import base64, os, struct, collections
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
raw = base64.b64decode(open(os.path.join(root, "assets", "boxer.fbx.txt"), "rb").read())
ver = struct.unpack_from("<I", raw, 23)[0]
w = 4
NULL = 13
def num(o): return struct.unpack_from("<I", raw, o)[0]
def node(o):
    end = num(o); np = num(o+w); plen = num(o+2*w); nl = raw[o+3*w]
    name = raw[o+3*w+1:o+3*w+1+nl].decode("latin1")
    p = o+3*w+1+nl; return {"o":o,"end":end,"np":np,"plen":plen,"name":name,"p":p,"k":p+plen}
def children(n):
    out=[]; o=n["k"]
    while o < n["end"]-NULL:
        nn=node(o)
        if nn["end"]==0: break
        out.append(nn); o=nn["end"]
    return out
def props(n):
    # returns list of (type, array_len, enc, clen, data_start, data_len)
    out=[]; p=n["p"]
    for _ in range(n["np"]):
        t=chr(raw[p]); p+=1
        if t=="L": p+=8
        elif t=="I": p+=4
        elif t=="D": p+=8
        elif t=="F": p+=4
        elif t=="Y": p+=2
        elif t=="C": p+=1
        elif t in "SR":
            l=struct.unpack_from("<I",raw,p)[0]; p+=4+l
        else:
            l,enc,cl=struct.unpack_from("<III",raw,p); p+=12
            out.append((t,l,enc,cl,p,cl)); p+=cl
    return out

top=[]; o=27
while o < len(raw)-NULL:
    n=node(o)
    if n["end"]==0: break
    top.append(n); o=n["end"]
objs=next(n for n in top if n["name"]=="Objects")
enc_count=collections.Counter(); tot_data=0; comp_data=0; uncomp_data=0
arr_vertices_uncompressed=0; arr_vertices_compressed=0
nshape=0
for g in children(objs):
    if g["name"]!="Geometry": continue
    ss=[]
    pr=props(g)
    # detect shape: has 'Vertices' and 'Indexes' child nodes, and class Shape
    # simpler: read the 3 S properties
    p=g["p"]; ssizes=[]
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
    cls = ss[1] if len(ss)>1 else "?"
    if cls!="Shape": continue
    nshape+=1
    for c in children(g):
        if c["name"] not in ("Vertices","Indexes"): continue
        for (t,l,enc,cl,ds,dl) in props(c):
            enc_count[(c["name"],enc)]+=1
            tot_data+=cl
            if enc: comp_data+=cl
            else: uncomp_data+=cl
            if c["name"]=="Vertices":
                if enc: arr_vertices_compressed+=cl
                else: arr_vertices_uncompressed+=cl
print("shapes:",nshape)
print("array enc counts:",dict(enc_count))
print(f"total array data bytes: {tot_data/1e6:.2f} MB  compressed(zlib)={comp_data/1e6:.2f}  uncompressed={uncomp_data/1e6:.2f}")
print(f"Vertices data: uncompressed={arr_vertices_uncompressed/1e6:.2f} MB  compressed={arr_vertices_compressed/1e6:.2f} MB")

# check Pillow / WebP
try:
    from PIL import Image, features
    print("Pillow:", Image.__version__, "webp:", features.check("webp"))
except Exception as e:
    print("Pillow: NO", repr(e))
