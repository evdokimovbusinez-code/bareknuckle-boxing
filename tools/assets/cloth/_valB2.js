// validation run B2: facing (toes), neck/waist/elbow loops, shoulder
const b = __g.P1.body, g = b.geometry, T = __g.THREE;
const bm = b.bindMatrix;
const pos = g.attributes.position;
const n = pos.count;
const P = new Float32Array(n * 3);
const v = new T.Vector3();
for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(bm).multiplyScalar(0.01); P[3*i] = v.x; P[3*i+1] = v.y; P[3*i+2] = v.z; }
const idx = Array.from(g.index.array);
let zt = -9, zh = 9, ct = 0, ch = 0;
for (let i = 0; i < n; i++) {
  const x = P[3*i], y = P[3*i+1], z = P[3*i+2];
  if (y < 0.03 && Math.abs(x) < 0.2) { if (z > 0.10) { ct++; if (z > zt) zt = z; } if (z < -0.10) { ch++; if (z < zh) zh = z; } }
}
function slice(yh) {
  const segs = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], c = idx[t+1], d = idx[t+2];
    const ys = [P[3*a+1], P[3*c+1], P[3*d+1]];
    const above = ys.map(q => q - yh);
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
      const k2 = key(cur[cur.length-1]);
      const ii = pool.findIndex(q => key(q[0]) === k2);
      if (ii < 0) { const jj = pool.findIndex(q => key(q[1]) === k2); if (jj < 0) break; const q = pool.splice(jj,1)[0]; cur.push(q[0]); }
      else { const q = pool.splice(ii,1)[0]; cur.push(q[1]); }
      if (key(cur[cur.length-1]) === key(cur[0])) { loops.push(cur); break; }
    }
  }
  return loops.map(L => {
    let per = 0, area = 0, cx = 0, cz = 0;
    for (let i = 0; i+1 < L.length; i++) { per += Math.hypot(L[i+1][0]-L[i][0], L[i+1][1]-L[i][1]); area += L[i][0]*L[i+1][1] - L[i+1][0]*L[i][1]; cx += L[i][0]; cz += L[i][1]; }
    per += Math.hypot(L[0][0]-L[L.length-1][0], L[0][1]-L[L.length-1][1]);
    const m = L.length - 1;
    return { pts: L.length, per: +(per*100).toFixed(1), ar: +(Math.abs(area/2)*1e4).toFixed(0), cx: +(cx/m*100).toFixed(1), cz: +(cz/m*100).toFixed(1) };
  });
}
const out = { toes: { zToe: +zt.toFixed(3), nToe: ct, zHeel: +zh.toFixed(3), nHeel: ch }, scan: {} };
for (const yh of [0.93, 0.97, 1.01, 1.05, 1.09]) out.scan["a" + yh] = slice(yh + 0.0113);
for (const yh of [1.55, 1.57, 1.59, 1.61]) out.scan["n" + yh] = slice(yh + 0.0051);
for (const yh of [1.21, 1.24, 1.27]) out.scan["e" + yh] = slice(yh + 0.0087);
out.sho = slice(1.4691);
return JSON.stringify(out);
