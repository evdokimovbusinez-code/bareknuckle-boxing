import base64, os, gzip, shutil, glob
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
assets = os.path.join(root, "assets")

print("=== encoder tools ===")
for t in ["toktx", "basisu", "ktx", "ktxsc", "convert", "cwebp", "magick"]:
    print("  ", t, "->", shutil.which(t))

print("=== FBX: base64 text -> raw -> gzip ===")
tot_txt = tot_raw = tot_gz = 0
for f in sorted(glob.glob(os.path.join(assets, "*.fbx.txt"))):
    txt = open(f, "rb").read()
    raw = base64.b64decode(txt)
    gz = gzip.compress(raw, 9)
    n = os.path.basename(f)
    print(f"  {n:42s} txt={len(txt)/1e6:6.2f}M  raw={len(raw)/1e6:6.2f}M  gz={len(gz)/1e6:6.2f}M")
    tot_txt += len(txt); tot_raw += len(raw); tot_gz += len(gz)
print(f"  {'TOTAL FBX':42s} txt={tot_txt/1e6:6.2f}M  raw={tot_raw/1e6:6.2f}M  gz={tot_gz/1e6:6.2f}M")

print("=== JPEG textures ===")
tot_jpg = 0
for f in sorted(glob.glob(os.path.join(assets, "*.jpg"))):
    s = os.path.getsize(f); tot_jpg += s
    print(f"  {os.path.basename(f):24s} {s/1e3:8.1f}K")
print(f"  {'TOTAL JPG':24s} {tot_jpg/1e6:6.2f}M")
print(f"  CURRENT LOAD (txt + jpg) ~= {(tot_txt+tot_jpg)/1e6:.2f}M")
