// validation run B: pose anatomy, boneInverses consistency, slice loops
const b = __g.P1.body, g = b.geometry, T = __g.THREE;
const bm = b.bindMatrix;
const pos = g.attributes.position;
const n = pos.count;
const P = new Float32Array(n * 3);
const v = new T.Vector3();
for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(bm).multiplyScalar(0.01); P[3*i] = v.x; P[3*i+1] = v.y; P[3*i+2] = v.z; }
const idx = Array.from(g.index.array);
// x-band y-ranges (where are the far-x verts?)
const bands = {};
for (let i = 0; i < n; i++) {
  const x = P[3*i], y = P[3*i+1], z = P[3*i+2];
  const k = Math.floor(Math.abs(x) * 20) / 20;
  const a = bands[k] || (bands[k] = [99, -99, 0, 0, 0]);
  a[0] = Math.min(a[0], y); a[1] = Math.max(a[1], y); a[2]++; a[3] = Math.min(a[3], z); a[4] = Math.max(a[4], z);
}
function bandtbl(o) { return Object.keys(o).sort((p,q)=>p-q).map(k => k + ":y" + o[k][0].toFixed(2) + ".." + o[k][1].toFixed(2) + ",n" + o[k][2] + ",z" + o[k][3].toFixed(2) + ".." + o[k][4].toFixed(2)).join(" "); }
// head asymmetry: y in [1.60,1.80] |x|<0.05 -> z histogram
const hz = {};
for (let i = 0; i < n; i++) {
  const x = P[3*i], y = P[3*i+1], z = P[3*i+2];
  if (y > 1.60 && y < 1.80 && Math.abs(x) < 0.05) { const k = Math.round(z*50)/50; hz[k] = (hz[k]||0)+1; }
}
// slice loops at several y: plane x-triangle intersections, chained
function slice(yh) {
  const segs = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], c = idx[t+1], d = idx[t+2];
    const ys = [P[3*a+1], P[3*c+1], P[3*d+1]];
    const above = ys.map(y => y - yh);
    const sgn = above.map(s => s > 1e-7 ? 1 : s < -1e-7 ? -1 : 0);
    const nz = sgn.filter(s => s !== 0).length;
    if (nz < 2) continue;
    const pts = [];
    for (let k = 0; k < 3; k++) {
      if (sgn[k] === 0) { const vv2 = [a,c,d][k]; pts.push([P[3*vv2], P[3*vv2+2]]); continue; }
      const i1 = k, i2 = (k+1)%3;
      if (sgn[i1] !== 0 && sgn[i2] !== 0 && sgn[i1] !== sgn[i2]) {
        const t1 = above[i1]/(above[i1]-above[i2]);
        const vv = [a,c,d][i1], ww = [a,c,d][i2];
        pts.push([P[3*vv] + (P[3*ww]-P[3*vv])*t1, P[3*vv+2] + (P[3*ww+2]-P[3*vv+2])*t1]);
      }
    }
    if (pts.length === 2) segs.push(pts);
  }
  const key = p => Math.round(p[0]*2000) + "," + Math.round(p[1]*2000);
  const loops = [];
  let pool = segs.slice();
  while (pool.length) {
    const s = pool.pop(); const cur = [s[0], s[1]];
    let guard = 0;
    while (guard++ < 10000) {
      const k = key(cur[cur.length-1]);
      const ii = pool.findIndex(q => key(q[0]) === k);
      if (ii < 0) { const jj = pool.findIndex(q => key(q[1]) === k); if (jj < 0) break; const q = pool.splice(jj,1)[0]; cur.push(q[0]); }
      else { const q = pool.splice(ii,1)[0]; cur.push(q[1]); }
      if (key(cur[cur.length-1]) === key(cur[0])) { loops.push(cur); break; }
    }
  }
  return loops.map(L => {
    let per = 0, area = 0, cx = 0, cz = 0;
    for (let i = 0; i+1 < L.length; i++) { per += Math.hypot(L[i+1][0]-L[i][0], L[i+1][1]-L[i][1]); area += L[i][0]*L[i+1][1] - L[i+1][0]*L[i][1]; cx += L[i][0]; cz += L[i][1]; }
    per += Math.hypot(L[0][0]-L[L.length-1][0], L[0][1]-L[L.length-1][1]);
    const m = L.length - 1;
    return { pts: L.length, per: +(per*100).toFixed(1), area: +(Math.abs(area/2)*1e4).toFixed(0), cx: +(cx/m*100).toFixed(1), cz: +(cz/m*100).toFixed(1) };
  });
}
const slices = {};
for (const y of [1.02, 1.18, 1.30, 1.38, 1.46, 1.52]) slices["y" + y] = slice(y);
// bone bind frames: inverse(boneInverses) vs matrixWorld for a few
const bones = b.skeleton.bones;
function bnd(name) {
  for (let i = 0; i < bones.length; i++) if (bones[i].name === name) {
    const inv = new T.Matrix4().copy(b.skeleton.boneInverses[i]).invert();
    const mw = bones[i].matrixWorld;
    return name + " invBI:" + inv.elements[12].toFixed(3) + "," + inv.elements[13].toFixed(3) + "," + inv.elements[14].toFixed(3) +
           " mw:" + mw.elements[12].toFixed(3) + "," + mw.elements[13].toFixed(3) + "," + mw.elements[14].toFixed(3);
  }
  return name + ": none";
}
const btest = ["CC_Base_Hips","CC_Base_Pelvis","CC_Base_L_UpperArm","CC_Base_L_Hand","CC_Base_L_Forearm","CC_Base_NeckTwist01","CC_Base_Head","CC_Base_L_Clavicle"].map(bnd);
return JSON.stringify({ bands: bandtbl(bands), headZ: hz, slices: slices, boneTest: btest }, null, 0);
