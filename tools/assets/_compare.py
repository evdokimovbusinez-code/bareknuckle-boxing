"""Capture identical-angle shots with the GLB pack and with the FBX fallback.

    python3 tools/assets/ tools/assets/_compare.py            # both
    python3 tools/assets/ tools/assets/_compare.py packed     # pack only

The fallback run simply hides assets/pack.glb (mkdir-safe rename), which makes the
loader take its .fbx.txt + .jpg path -- exactly what main does today.
"""
import os, sys, subprocess
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AS = os.path.join(ROOT, 'assets')
GLB = os.path.join(AS, 'pack.glb')
OFF = GLB + '.off'

CODE = r"""
const P1=__g.P1, P2=__g.P2, G=__g.G;
let s=777777; Math.random=()=>{s=(s*16807)%2147483647; return (s-1)/2147483646;};
document.getElementById('go').click();
__tick(300,1/60);
P2.group.visible=false;
const X=P1.face.x, clr=()=>{for(const k in X)X[k]=0;};
window.__camHold={p:[0.30,1.74,0.42],l:[-0.55,1.66,0]};
clr(); X.focus=1; await __shot('face_focus');
clr(); X.pain=1; X.side=0.6; await __shot('face_pain');
clr(); X.roar=1; await __shot('face_roar');
window.__camHold={p:[-0.15,1.35,2.5],l:[-0.55,1.0,0]};
for (const k of ['jab','cross','hookL','upperL']) { clr(); P1.startPunch(k); __step(10,1/60); await __shot('p_'+k); }
P2.group.visible=true;
window.__camHold={p:[0,1.5,3.2],l:[-0.2,0.9,0]};
__g.knockout(P1,P2,new __g.THREE.Vector3(1,0,0),1,'cross',1,true);
__step(30,1/60); await __shot('ko');
return 'shots done';
"""

def run(tag, out):
    print('\n===== %s =====' % tag, flush=True)
    r = subprocess.run(['bash', 'tools/shot.sh', out, 'js', CODE], cwd=ROOT,
                       text=True, capture_output=True, timeout=900)
    print(r.stdout[-3000:], flush=True)
    if r.stderr:
        print('STDERR:', r.stderr[-1500:], flush=True)
    print(tag, 'exit', r.returncode, flush=True)

only = sys.argv[1] if len(sys.argv) > 1 else ''
run('PACKED', '/tmp/shots/after_angles.jpg')
if only != 'packed':
    os.rename(GLB, OFF)
    try:
        run('FBX FALLBACK (as on main)', '/tmp/shots/before_angles.jpg')
    finally:
        os.rename(OFF, GLB)
print('\npack.glb present again:', os.path.exists(GLB))
