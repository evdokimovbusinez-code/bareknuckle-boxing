// validation run A: mirror of export_body.py extraction + numbers to pick crop thresholds
const b = __g.P1.body, g = b.geometry, T = __g.THREE;
const bm = b.bindMatrix, nmat = new T.Matrix3().getNormalMatrix(bm);
const pos = g.attributes.position, nrm = g.attributes.normal;
const n = pos.count;
const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
const v = new T.Vector3();
for (let i = 0; i < n; i++) {
  v.fromBufferAttribute(pos, i).applyMatrix4(bm).multiplyScalar(0.01);
  P[3*i] = v.x; P[3*i+1] = v.y; P[3*i+2] = v.z;
  v.fromBufferAttribute(nrm, i).applyMatrix3(nmat).normalize();
  N[3*i] = v.x; N[3*i+1] = v.y; N[3*i+2] = v.z;
}
const idx = Array.from(g.index.array);
let lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9];
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[3*i+k]); hi[k] = Math.max(hi[k], P[3*i+k]); }
const bones = b.skeleton.bones, byN = {};
for (const bn of bones) byN[bn.name] = bn;
function mpos(x) { const m = byN[x].matrixWorld.elements; return [m[12], m[13], m[14]]; }
let face = null;
if (byN["CC_Base_L_Eye"] && byN["CC_Base_R_Eye"] && byN["CC_Base_Head"]) {
  const e = mpos("CC_Base_L_Eye"), e2 = mpos("CC_Base_R_Eye"), h = mpos("CC_Base_Head");
  face = [(e[0]+e2[0])/2 - h[0], (e[1]+e2[1])/2 - h[1], (e[2]+e2[2])/2 - h[2]].map(x => +x.toFixed(4));
}
const wanted = [];
for (const bn of bones) {
  if (/Head|Neck|Hand|Finger|Shoulder|Clavicle|Foot|Arm|Leg|Thigh|Calf|Spine|Pelvis|Hips|Toe/.test(bn.name)) {
    const m = bn.matrixWorld.elements;
    wanted.push(bn.name + ":" + m[12].toFixed(3) + "," + m[13].toFixed(3) + "," + m[14].toFixed(3));
  }
}
const neckB = {}, armB = {};
for (let i = 0; i < n; i++) {
  const x = P[3*i], y = P[3*i+1], z = P[3*i+2];
  if (Math.abs(x) < 0.12 && y > 1.38 && y < 1.82) { const k = Math.round(y*100); const a = neckB[k] || (neckB[k] = [0,-9]); a[0]++; a[1] = Math.max(a[1], Math.abs(z)); }
  if (Math.abs(x) > 0.13 && y > 0.55 && y < 1.05) { const k = Math.round(y*100); const a = armB[k] || (armB[k] = [0,-9]); a[0]++; a[1] = Math.max(a[1], Math.abs(x)); }
}
function tbl(o) { return Object.keys(o).sort((a2,c2)=>a2-c2).map(k => k + "=" + o[k].join("/")).join(" "); }
let sMin = 9, sMax = -9, sCount = 0;
for (let i = 0; i < n; i++) { const x = P[3*i], y = P[3*i+1]; if (y > 1.33 && y < 1.47) { sMin = Math.min(sMin, x); sMax = Math.max(sMax, x); sCount++; } }
const res = {
  verts: n, tris: idx.length/3, bones: bones.length,
  bbox: lo.map(x => +x.toFixed(4)).join(" ") + " .. " + hi.map(x => +x.toFixed(4)).join(" "),
  height: +(hi[1]-lo[1]).toFixed(4), face: face,
  shoulderSpan: +(sMax-sMin).toFixed(4), deltoidVerts: sCount,
  neck: tbl(neckB), arm: tbl(armB),
  keyBones: wanted
};
return JSON.stringify(res);
