// validation run C — mirror of pattern.py + place.py numbers, live in the game page
// (same formulas; this run prints the checks and saves the render PNGs via __shot)
const bM = __g.P1.body, g0 = bM.geometry, T = __g.THREE;
const bm = bM.bindMatrix, posA = g0.attributes.position;
const nV = posA.count;
const P = new Float32Array(nV * 3);
const v0 = new T.Vector3();
for (let i = 0; i < nV; i++) { v0.fromBufferAttribute(posA, i).applyMatrix4(bm).multiplyScalar(0.01); P[3*i] = v0.x; P[3*i+1] = v0.y; P[3*i+2] = v0.z; }
const TR = Array.from(g0.index.array);
const tris = [];
for (let t = 0; t < TR.length; t += 3) tris.push([TR[t], TR[t+1], TR[t+2]]);
// crop like export_body.py does: skull above HEAD_Y (near the neck) and fists beyond HAND_X
const HEAD_Y = 1.605, HAND_X = 0.705;
const trisC = tris.filter(tr => tr.every(i => {
  const x = P[3*i], y = P[3*i+1];
  return !(y > HEAD_Y && Math.abs(x) < 0.13) && !(Math.abs(x) > HAND_X && y > 0.8);
}));

// ── slices (mirror of pattern.py slice_loops) ──
function sliceLoops(yh) {
  const segs = [];
  for (const tr of tris) {
    const [a, c, d] = tr;
    const above = [P[3*a+1]-yh, P[3*c+1]-yh, P[3*d+1]-yh];
    const sgn = above.map(s => s > 1e-7 ? 1 : s < -1e-7 ? -1 : 0);
    if (sgn.filter(s => s).length < 2) continue;
    const pts = [];
    for (let k = 0; k < 3; k++) {
      if (sgn[k] === 0) { const w = tr[k]; pts.push([P[3*w], P[3*w+2]]); continue; }
      const i1 = k, i2 = (k+1)%3;
      if (sgn[i1] && sgn[i2] && sgn[i1] !== sgn[i2]) {
        const f = above[i1]/(above[i1]-above[i2]);
        const vv = tr[i1], ww = tr[i2];
        pts.push([P[3*vv]+(P[3*ww]-P[3*vv])*f, P[3*vv+2]+(P[3*ww+2]-P[3*vv+2])*f]);
      }
    }
    if (pts.length === 2) segs.push(pts);
  }
  const key = p => Math.round(p[0]*2000) + "," + Math.round(p[1]*2000);
  const loops = [];
  let pool = segs.slice();
  while (pool.length) {
    const s = pool.pop(); const cur = [s[0], s[1]];
    for (let guard = 0; guard < 10000; guard++) {
      const k = key(cur[cur.length-1]);
      let got = null;
      for (let i = 0; i < pool.length; i++) {
        if (key(pool[i][0]) === k) { got = pool.splice(i,1)[0][1]; break; }
        if (key(pool[i][1]) === k) { got = pool.splice(i,1)[0][0]; break; }
      }
      if (got === null) break;
      cur.push(got);
      if (key(cur[cur.length-1]) === key(cur[0])) { loops.push(cur); break; }
    }
  }
  const out = [];
  for (const L of loops) {
    if (L.length < 4) continue;
    let per = 0, area = 0, cx = 0, cz = 0;
    for (let i = 0; i + 1 < L.length; i++) { per += Math.hypot(L[i+1][0]-L[i][0], L[i+1][1]-L[i][1]); area += L[i][0]*L[i+1][1]-L[i+1][0]*L[i][1]; cx += L[i][0]; cz += L[i][1]; }
    per += Math.hypot(L[0][0]-L[L.length-1][0], L[0][1]-L[L.length-1][1]);
    const m = L.length - 1;
    out.push({ per, area: Math.abs(area/2), cx: cx/m, cz: cz/m, pts: L.length });
  }
  return out;
}
function scan(y0v, y1v, cb) {
  const seen = new Set();
  const steps = Math.round((y1v - y0v) / 0.01);
  for (let i = 0; i <= steps; i++) {
    for (const off of [0.0051, 0.0113, 0.0, 0.0031]) {
      const h = +(y0v + i*0.01 + off).toFixed(5);
      if (seen.has(h)) continue;
      seen.add(h);
      const ls = sliceLoops(h);
      if (ls.length) { cb(h, ls); break; }
    }
  }
}
const M = {};
let best = null;
scan(1.22, 1.325, (y, ls) => { for (const L of ls) if (Math.abs(L.cx) < 0.04 && (!best || L.area > best[1].area)) best = [y, L]; });
M.chest = best;
best = null;
scan(0.86, 1.09, (y, ls) => { for (const L of ls) if (Math.abs(L.cx) < 0.04 && (!best || L.area > best[1].area)) best = [y, L]; });
M.hips = best;
best = null;
scan(1.55, 1.64, (y, ls) => { for (const L of ls) if (L.per > 0.24 && L.per < 0.70 && (!best || L.per < best[1].per)) best = [y, L]; });
M.neck = best;
M.arms = { L: {}, R: {} };
for (const [band, tag] of [[1.28, "bicep"], [1.20, "elbow"]]) {
  scan(band, band + 0.025, (y, ls) => {
    for (const L of ls) if (Math.abs(L.cx) > 0.40) {
      const side = L.cx > 0 ? "L" : "R";
      const cur = M.arms[side][tag];
      if (!cur || L.area > cur[1].area) M.arms[side][tag] = [y, L];
    }
  });
}
// bones (bind, metres)
let shoBone = null;
for (let bi = 0; bi < bM.skeleton.bones.length; bi++) {
  const bn = bM.skeleton.bones[bi];
  if (/^CC_Base_L_UpperarmTwist01$/.test(bn.name)) {
    const inv = new T.Matrix4().copy(bM.skeleton.boneInverses[bi]).invert();
    shoBone = [inv.elements[12]*0.01, inv.elements[13]*0.01, inv.elements[14]*0.01];
  }
}

// ── draft (mirror of pattern.py draft) ──
const EASE_CHEST = 6.0, EASE_ARM = 4.0, BAND_W = 2.2, Ncurve = 16;
const bez3 = (p0, c1, c2, p1, n = Ncurve) => {
  const o = [];
  for (let i = 0; i <= n; i++) {
    const t = i/n, mt = 1-t;
    o.push([mt*mt*mt*p0[0] + 3*mt*mt*t*c1[0] + 3*mt*t*t*c2[0] + t*t*t*p1[0],
            mt*mt*mt*p0[1] + 3*mt*mt*t*c1[1] + 3*mt*t*t*c2[1] + t*t*t*p1[1]]);
  }
  return o;
};
const ilen = pts => { let s = 0; for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]); return s; };
const C_bust = M.chest[1].per*100, C_hips = M.hips[1].per*100, C_neck = M.neck[1].per*100;
const C_bicep = (M.arms.L.bicep[1].per + M.arms.R.bicep[1].per)/2*100;
const C_elbow = (M.arms.L.elbow[1].per + M.arms.R.elbow[1].per)/2*100;
const y_nape = M.neck[0] - 0.06;
const y_tip = (y_nape - shoBone[1])*100;
const tipx = shoBone[0]*100 + 1.5;
const Xw = (C_bust + EASE_CHEST)/2, Xh = Math.max((C_hips + EASE_CHEST)/2, Xw - 4);
const y_hem = (y_nape - M.hips[0])*100 + 3;
const AD = C_bust*0.15 + 2.0;
const wn = C_neck/(2*Math.PI) + 2.2, dr_f = C_neck/5 + 2.5, dr_b = 3.2;
function armholePts() {
  const ua = [Xw/2, y_tip + AD], d = [ua[0]-tipx, ua[1]-y_tip];
  return bez3([tipx, y_tip], [tipx + d[0]*0.28 - 0.8, y_tip + d[1]*0.50], [tipx + d[0]*0.35, y_tip + d[1]*0.86], ua);
}
const armhole = armholePts();
function bodyPart(wnv, drop) {
  const Pp = [], E = {};
  const push = (lst, name) => { E[name] = [Pp.length, Pp.length + lst.length - 1]; Pp.push(...lst); };
  const ua = armhole[armhole.length-1];
  push([[wnv, 0], [tipx, y_tip]], "shoulderP");
  push(armhole, "armholeP");
  push([[ua[0], ua[1]], [Xh/2, y_hem]], "sideP");
  push([[Xh/2, y_hem], [-Xh/2, y_hem]], "hem");
  push([[-Xh/2, y_hem], [-ua[0], ua[1]]], "sideM");
  push(armhole.slice().reverse().map(p => [-p[0], p[1]]), "armholeM");
  push([[-tipx, y_tip], [-wnv, 0]], "shoulderM");
  push(bez3([-wnv, 0], [-wnv*0.45, drop*0.72], [wnv*0.45, drop*0.72], [wnv, 0]), "neck");
  return { pts: Pp, edges: E };
}
const front = bodyPart(wn, dr_f), back = bodyPart(wn, dr_b);
const L_arm = ilen(armhole), target = 2*L_arm;
const a = (C_bicep + EASE_ARM)/2, cw = target/2 - 1.0;
const capPts = (cwv, h) => bez3([-cwv, 0], [-cwv*0.62, -h*0.78], [-cwv*0.20, -h], [0, -h]).concat(
  bez3([0, -h], [cwv*0.20, -h], [cwv*0.62, -h*0.78], [cwv, 0]).slice(1));
function solveCap(cwv, tg) {
  if (ilen(capPts(cwv, 0.001)) >= tg) return 0;
  let lo = 0.001, hi = cwv*1.6;
  if (ilen(capPts(cwv, hi)) < tg) return hi;
  for (let i = 0; i < 40; i++) { const m = (lo+hi)/2; if (ilen(capPts(cwv, m)) < tg) lo = m; else hi = m; }
  return (lo+hi)/2;
}
const h = solveCap(cw, target);
const aw = (C_elbow + C_bicep)/4 + EASE_ARM/2;
const Ls = Math.hypot(M.arms.L.bicep[1].cx - M.arms.L.elbow[1].cx, M.arms.L.bicep[0] - M.arms.L.elbow[0],
                      M.arms.L.bicep[1].cz - M.arms.L.elbow[1].cz) * 100 * 0.85 + 6;
function sleevePart() {
  const Pp = capPts(cw, h), nc = Pp.length;
  const r = bez3([cw, 0], [a*0.97, 3.5], [a, 6.5], [a, 7]);
  const r2 = bez3([a, 7], [a*0.99, (7+Ls)/2], [aw, (7+Ls)/2 + (Ls-7)/4], [aw, Ls], 10);
  const hemc = bez3([aw, Ls], [aw*0.3, Ls+1.6], [-aw*0.3, Ls+1.6], [-aw, Ls], 10);
  const l = r2.slice().reverse().map(p => [-p[0], p[1]]), l2 = r.slice().reverse().map(p => [-p[0], p[1]]);
  const E = { cap: [0, nc-1], seamP: [nc-1, nc-1 + r.length-1 + r2.length-1] };
  Pp.push(...r.slice(1), ...r2.slice(1));
  const s2 = nc-1 + r.length-1 + r2.length-1;
  E.hem = [s2, s2 + hemc.length-1]; Pp.push(...hemc.slice(1));
  const s3 = s2 + hemc.length-1;
  E.seamM = [s3, s3 + l.length-1 + l2.length-1]; Pp.push(...l.slice(1), ...l2.slice(1));
  return { pts: Pp, edges: E };
}
const sleeveP = sleevePart();
const sleeveM = { pts: sleeveP.pts.map(p => [-p[0], p[1]]), edges: sleeveP.edges };
const Ln = ilen(bez3([-wn, 0], [-wn*0.45, dr_f*0.72], [wn*0.45, dr_f*0.72], [wn, 0])) +
           ilen(bez3([-wn, 0], [-wn*0.45, dr_b*0.72], [wn*0.45, dr_b*0.72], [wn, 0]));
const band = { pts: [[-Ln/2, 0], [Ln/2, 0], [Ln/2, BAND_W], [-Ln/2, BAND_W]],
               edges: { seam: [0, 1], endP: [1, 2], edge_top: [2, 3], endM: [3, 0] } };
const parts = { front, back, sleeveP, sleeveM, band };
const edgePts = (part, en) => {
  let [i0, i1] = part.edges[en];
  if (i0 <= i1) return part.pts.slice(i0, i1+1);
  return part.pts.slice(i0).concat(part.pts.slice(0, i1+1));
};
const seams = [
  { name: "плечо +X", a: [["front", "shoulderP"]], b: [["back", "shoulderP"]] },
  { name: "плечо -X", a: [["front", "shoulderM"]], b: [["back", "shoulderM"]] },
  { name: "бок +X", a: [["front", "sideP"]], b: [["back", "sideP"]] },
  { name: "бок -X", a: [["front", "sideM"]], b: [["back", "sideM"]] },
  { name: "рукав к пройме +X", a: [["sleeveP", "cap"]], b: [["front", "armholeP", 1], ["back", "armholeP"]] },
  { name: "рукав к пройме -X", a: [["sleeveM", "cap", 1]], b: [["front", "armholeM"], ["back", "armholeM", 1]] },
  { name: "шов рукава +X", a: [["sleeveP", "seamP"]], b: [["sleeveP", "seamM"]] },
  { name: "шов рукава -X", a: [["sleeveM", "seamP"]], b: [["sleeveM", "seamM"]] },
  { name: "бейка к горловине", a: [["band", "seam"]], b: [["back", "neck"], ["front", "neck", 1]] },
  { name: "бейка, конец к концу", a: [["band", "endP"]], b: [["band", "endM"]] }
];
const seamChecks = seams.map(s => {
  const la = s.a.reduce((t, [pn, en]) => t + ilen(edgePts(parts[pn], en)), 0);
  const lb = s.b.reduce((t, [pn, en]) => t + ilen(edgePts(parts[pn], en)), 0);
  return { n: s.name, la: +la.toFixed(1), lb: +lb.toFixed(1), dev: +((la-lb)/Math.max(la, lb)*100).toFixed(2) };
});

// ── placement (mirror of place.py) ──
const GAP = { body: 0.030, sleeve: 0.025, band: 0.015 };
const STEP = 1.0, MIN_CLEAR = 0.012;
const anchors = {
  nape_y: y_nape,
  chest: { y: M.chest[0], zc: M.chest[1].cz, C: C_bust },
  neck: { y: M.neck[0], zc: M.neck[1].cz, C: C_neck },
  arms: { L: { bicep_y: M.arms.L.bicep[0], bicep_cx: M.arms.L.bicep[1].cx, bicep_cz: M.arms.L.bicep[1].cz,
               elbow_y: M.arms.L.elbow[0], elbow_cx: M.arms.L.elbow[1].cx, elbow_cz: M.arms.L.elbow[1].cz, C_bicep: M.arms.L.bicep[1].per*100 },
          R: { bicep_y: M.arms.R.bicep[0], bicep_cx: M.arms.R.bicep[1].cx, bicep_cz: M.arms.R.bicep[1].cz,
               elbow_y: M.arms.R.elbow[0], elbow_cx: M.arms.R.elbow[1].cx, elbow_cz: M.arms.R.elbow[1].cz, C_bicep: M.arms.R.bicep[1].per*100 } },
  cap_h: h, band_y: M.neck[0] - 0.02,
  sleeve_tip: { pos: [tipx/100, y_nape - y_tip/100, M.arms.L.bicep[1].cz], neg: [-tipx/100, y_nape - y_tip/100, M.arms.R.bicep[1].cz] }
};
function polyCols(poly) {
  const xs = poly.map(p => p[0]);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const out = [];
  let u = lo + STEP*0.35;
  const n = poly.length;
  while (u <= hi + 1e-6) {
    const vv = [];
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i+1)%n];
      if ((x1 < u && u <= x2) || (x2 < u && u <= x1)) { const t = (u-x1)/(x2-x1); vv.push(y1 + (y2-y1)*t); }
    }
    if (vv.length >= 2) out.push([u, Math.min(...vv), Math.max(...vv)]);
    else if (vv.length === 1) out.push([u, vv[0], vv[0]]);
    u += STEP;
  }
  return out;
}
function buildGrid(poly) {
  const cols = polyCols(poly);
  const hmax = Math.max(...cols.map(c => c[2]-c[1]));
  const nrows = Math.max(3, Math.round(hmax/STEP));
  const V = [], idxmap = [];
  for (const [u, v1, v2] of cols) {
    const row = [];
    for (let j = 0; j <= nrows; j++) { const v = v1 + (v2-v1)*j/nrows; row.push(V.length); V.push([u, v]); }
    idxmap.push(row);
  }
  const F = [];
  for (let ci = 0; ci < idxmap.length-1; ci++) {
    if (cols[ci][2]-cols[ci][1] < 1e-6 || cols[ci+1][2]-cols[ci+1][1] < 1e-6) continue;
    for (let j = 0; j < nrows; j++) {
      const [a1, b1] = [idxmap[ci][j], idxmap[ci+1][j]], [c1, d1] = [idxmap[ci][j+1], idxmap[ci+1][j+1]];
      F.push([a1, b1, c1]); F.push([b1, d1, c1]);
    }
  }
  return { V, F, cols, nrows };
}
const sub = (x, y) => [x[0]-y[0], x[1]-y[1], x[2]-y[2]];
const dot = (x, y) => x[0]*y[0] + x[1]*y[1] + x[2]*y[2];
const crs = (x, y) => [x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0]];
const unit = x => { const l = Math.hypot(...x) || 1; return x.map(q => q/l); };
function bender(name) {
  if (name === "front" || name === "back") {
    const Rc = anchors.chest.C/100/(2*Math.PI) + GAP.body, zc = anchors.chest.zc, yn = anchors.nape_y;
    return (u, v) => { const th = (u/100)/Rc; return [Rc*Math.sin(th), yn - v/100, name === "front" ? zc + Rc*Math.cos(th) : zc - Rc*Math.cos(th)]; };
  }
  if (name === "sleeveP" || name === "sleeveM") {
    const s = name === "sleeveP" ? 1 : -1;
    const ar = s > 0 ? anchors.arms.L : anchors.arms.R;
    const d = unit(sub([ar.elbow_cx, ar.elbow_y, ar.elbow_cz], [ar.bicep_cx, ar.bicep_y, ar.bicep_cz]));
    const R = ar.C_bicep/100/(2*Math.PI) + GAP.sleeve;
    const tip = s > 0 ? anchors.sleeve_tip.pos : anchors.sleeve_tip.neg;
    const e_top = unit([0 - dot([0,1,0], d)*d[0], 1 - dot([0,1,0], d)*d[1], 0 - dot([0,1,0], d)*d[2]]);
    const e_side = unit(crs(d, e_top));
    return (u, v) => {
      const th = (u/100)/R, s_al = (v + anchors.cap_h)/100;
      const rad = [e_top[0]*Math.cos(th) + e_side[0]*Math.sin(th), e_top[1]*Math.cos(th) + e_side[1]*Math.sin(th), e_top[2]*Math.cos(th) + e_side[2]*Math.sin(th)];
      return [tip[0] + d[0]*s_al + R*rad[0], tip[1] + d[1]*s_al + R*rad[1], tip[2] + d[2]*s_al + R*rad[2]];
    };
  }
  const Rn = anchors.neck.C/100/(2*Math.PI) + GAP.band;
  return (u, v) => { const th = (u/100)/Rn; return [Rn*Math.sin(th), anchors.band_y - v/100, anchors.neck.zc + Rn*Math.cos(th)]; };
}
// band: laid along the neckline seam (back neck left→right, then front neck right→left),
// offset GAP.band outward from the body cylinders, strip width going up — like a sewn collar
function bandBender() {
  const neckF = edgePts(parts.front, "neck"), neckB = edgePts(parts.back, "neck");
  const Lf = ilen(neckF), Lb = ilen(neckB), LnB = Lf + Lb;
  const ptOn = (poly, s) => {
    let acc = 0;
    for (let i = 0; i + 1 < poly.length; i++) {
      const L = Math.hypot(poly[i+1][0]-poly[i][0], poly[i+1][1]-poly[i][1]);
      if (acc + L >= s - 1e-9) { const t = L ? (s-acc)/L : 0; return [poly[i][0]+(poly[i+1][0]-poly[i][0])*t, poly[i][1]+(poly[i+1][1]-poly[i][1])*t]; }
      acc += L;
    }
    return poly[poly.length-1];
  };
  const fF = bender("front"), fB = bender("back");
  const zc = anchors.chest.zc;
  return (u, v) => {
    const s = u + LnB/2;
    let base;
    if (s <= Lb) { const p2 = ptOn(neckB, s); base = fB(p2[0], p2[1]); }
    else { const p2 = ptOn(neckF, Lf - (s - Lb)); base = fF(p2[0], p2[1]); }
    const rx = base[0], rz = base[2] - zc, rl = Math.hypot(rx, rz) || 1;
    return [base[0] + GAP.band*rx/rl, base[1] + v/100, base[2] + GAP.band*rz/rl];
  };
}
// body proximity
const CELL = 0.05, hashT = new Map();
for (let ti = 0; ti < trisC.length; ti++) {
  const [a1, c1, d1] = trisC[ti];
  const xs = [P[3*a1], P[3*c1], P[3*d1]], ys = [P[3*a1+1], P[3*c1+1], P[3*d1+1]], zs = [P[3*a1+2], P[3*c1+2], P[3*d1+2]];
  for (let gx = Math.floor(Math.min(...xs)/CELL); gx <= Math.floor(Math.max(...xs)/CELL); gx++)
    for (let gy = Math.floor(Math.min(...ys)/CELL); gy <= Math.floor(Math.max(...ys)/CELL); gy++)
      for (let gz = Math.floor(Math.min(...zs)/CELL); gz <= Math.floor(Math.max(...zs)/CELL); gz++) {
        const k = gx + "," + gy + "," + gz;
        if (!hashT.has(k)) hashT.set(k, []);
        hashT.get(k).push(ti);
      }
}
function d2tri(p, ti) {
  const [ai, bi, ci] = trisC[ti];
  const A = [P[3*ai], P[3*ai+1], P[3*ai+2]], B = [P[3*bi], P[3*bi+1], P[3*bi+2]], C = [P[3*ci], P[3*ci+1], P[3*ci+2]];
  const ab = sub(B, A), ac = sub(C, A), d = sub(p, A);
  const v00 = dot(ab, ab), v01 = dot(ab, ac), v11 = dot(ac, ac), v0 = dot(ab, d), v1 = dot(ac, d);
  const det = v00*v11 - v01*v01;
  let u = 0, w = 0;
  if (Math.abs(det) > 1e-14) { u = (v11*v0 - v01*v1)/det; w = (v00*v1 - v01*v0)/det; }
  u = Math.max(0, Math.min(1, u)); w = Math.max(0, Math.min(1, w));
  if (u + w > 1) { u = Math.min(u, w); w = 1 - u; }
  const cp = [A[0]+ab[0]*u+ac[0]*w, A[1]+ab[1]*u+ac[1]*w, A[2]+ab[2]*u+ac[2]*w];
  return (p[0]-cp[0])**2 + (p[1]-cp[1])**2 + (p[2]-cp[2])**2;
}
function nearest2(p) {
  const gx = Math.floor(p[0]/CELL), gy = Math.floor(p[1]/CELL), gz = Math.floor(p[2]/CELL);
  let bestD = 1e18;
  for (let r = 1; r <= 3; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
      const arr = hashT.get((gx+dx) + "," + (gy+dy) + "," + (gz+dz));
      if (!arr) continue;
      for (const ti of arr) { const d = d2tri(p, ti); if (d < bestD) bestD = d; }
    }
    if (bestD < (r*CELL)**2) break;
  }
  return bestD;
}
const kindOf = nm => nm.startsWith("sleeve") ? "sleeve" : (nm === "band" ? "band" : "body");
const parts3 = {};
const placeReport = {};
for (const [name, part] of Object.entries(parts)) {
  const { V, F } = buildGrid(part.pts.map(p => [p[0], p[1]]));
  const f = name === "band" ? bandBender() : bender(name);
  const V3 = V.map(([u, v]) => f(u, v));
  const kind = kindOf(name);
  let AX, D;
  if (kind === "sleeve") {
    const ar = name === "sleeveP" ? anchors.arms.L : anchors.arms.R;
    AX = [ar.bicep_cx, ar.bicep_y, ar.bicep_cz];
    D = unit(sub([ar.elbow_cx, ar.elbow_y, ar.elbow_cz], AX));
  } else if (kind === "band") { D = [0, 1, 0]; AX = [0, 0, anchors.neck.zc]; }
  else { D = [0, 1, 0]; AX = [0, 0, anchors.chest.zc]; }
  for (let it = 0; it < 6; it++) {
    let moved = false;
    for (let i = 0; i < V3.length; i++) {
      const p = V3[i], d2 = nearest2(p);
      if (d2 < MIN_CLEAR*MIN_CLEAR) {
        const r = sub(p, AX);
        const perp = [r[0]-dot(r, D)*D[0], r[1]-dot(r, D)*D[1], r[2]-dot(r, D)*D[2]];
        const pl = Math.hypot(...perp);
        if (pl < 1e-6) continue;
        const push = 2 * MIN_CLEAR - Math.sqrt(d2);
        V3[i] = [p[0]+perp[0]/pl*push, p[1]+perp[1]/pl*push, p[2]+perp[2]/pl*push];
        moved = true;
      }
    }
    if (!moved) break;
  }
  let mins = 1e9, worst = null;
  for (const p of V3) { const dd = Math.sqrt(nearest2(p)); if (dd < mins) { mins = dd; worst = p; } }
  parts3[name] = { V3, F, V, kind };
  placeReport[name] = { verts: V3.length, tris: F.length, minSkinCm: +(mins*100).toFixed(2) };
  if (name === "band" && worst) {
    let bd = 1e18, bt = 0;
    for (let ti = 0; ti < trisC.length; ti++) { const dd = d2tri(worst, ti); if (dd < bd) { bd = dd; bt = ti; } }
    const tr = trisC[bt];
    placeReport.bandWorst = worst.map(x => +x.toFixed(3));
    placeReport.bandSkinTri = [tr[0], tr[1], tr[2]].map(i => [+P[3*i].toFixed(3), +P[3*i+1].toFixed(3), +P[3*i+2].toFixed(3)]);
  }
}
// seam vertex pairs (3D, after push)
function samplePolyline3d(pts, every) {
  if (pts.length < 2) return pts;
  const segl = [];
  let tot = 0;
  for (let i = 0; i + 1 < pts.length; i++) { const L = Math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]); segl.push(L); tot += L; }
  const out = [];
  for (let d = 0; d <= tot + 1e-9; d += every) {
    let acc = 0;
    for (let i = 0; i < segl.length; i++) {
      if (acc + segl[i] >= d - 1e-9) { const t = segl[i] ? (d-acc)/segl[i] : 0; out.push([pts[i][0]+(pts[i+1][0]-pts[i][0])*t, pts[i][1]+(pts[i+1][1]-pts[i][1])*t]); break; }
      acc += segl[i];
    }
  }
  return out;
}
function edgeVerts3d(pname, en) {
  const poly = edgePts(parts[pname], en);
  const samples = samplePolyline3d(poly, 1.2);
  const pt = parts3[pname];
  const out = [];
  let last = -1;
  for (const [u, v] of samples) {
    let bd = 1e18, bi = null;
    for (let i = 0; i < pt.V.length; i++) {
      if (i === last) continue;
      const d2 = (pt.V[i][0]-u)**2 + (pt.V[i][1]-v)**2;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    if (bi !== null && bd < (1.2*3)**2) { out.push(pt.V3[bi]); last = bi; }
  }
  return out;
}
const sideVerts = side => { const out = []; for (const pe of side) { const ev = edgeVerts3d(pe[0], pe[1]); if (pe[2]) ev.reverse(); out.push(...ev); } return out; };
const seamPairs = [];
for (const s of seams) {
  const aSide = sideVerts(s.a), bSide = sideVerts(s.b);
  const np = Math.min(aSide.length, bSide.length);
  let sum = 0;
  for (let i = 0; i < np; i++) sum += Math.hypot(...sub(aSide[i], bSide[i]));
  seamPairs.push({ name: s.name, pairs: np, avgCm: +(sum/(np||1)*100).toFixed(1) });
}

// ── renders: overlay canvas + three.js ──
const holder = document.createElement("div");
holder.style.cssText = "position:fixed;inset:0;z-index:99999;background:#dfe3e8";
const cv = document.createElement("canvas");
holder.appendChild(cv);
document.body.appendChild(holder);
const W = window.innerWidth, H = window.innerHeight;
cv.width = W; cv.height = H;
const rend = new T.WebGLRenderer({ canvas: cv, antialias: true });
rend.setSize(W, H, false);
const sc = new T.Scene();
sc.background = new T.Color("#dfe3e8");
sc.add(new T.HemisphereLight(0xffffff, 0x404050, 1.15));
const dl = new T.DirectionalLight(0xffffff, 1.4); dl.position.set(-0.5, 0.8, 1); sc.add(dl);
const bodyGeo = new T.BufferGeometry();
bodyGeo.setAttribute("position", new T.BufferAttribute(P.slice(), 3));
const TRc = [];
for (const tr of trisC) TRc.push(tr[0], tr[1], tr[2]);
bodyGeo.setIndex(TRc); bodyGeo.computeVertexNormals();
sc.add(new T.Mesh(bodyGeo, new T.MeshLambertMaterial({ color: 0x6a6a70 })));
const COLORS = { front: 0xd24848, back: 0x3d6dcc, sleeveP: 0x33996a, sleeveM: 0xe6a23c, band: 0x8e44ad };
for (const [nm, pt] of Object.entries(parts3)) {
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pt.V3.flat(), 3));
  geo.setIndex(pt.F.flat());
  geo.computeVertexNormals();
  const m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: COLORS[nm], side: T.DoubleSide }));
  sc.add(m);
}
const seamPts = [];
for (const s of seams) {
  const aSide = sideVerts(s.a), bSide = sideVerts(s.b);
  const np = Math.min(aSide.length, bSide.length);
  for (let i = 0; i < np; i++) seamPts.push(...aSide[i], ...bSide[i]);
}
const lineGeo = new T.BufferGeometry();
lineGeo.setAttribute("position", new T.Float32BufferAttribute(seamPts, 3));
sc.add(new T.LineSegments(lineGeo, new T.LineBasicMaterial({ color: 0x1c1840 })));
const cams = { front: [0, 1.25, 6], side: [6, 1.25, 0], back: [0, 1.25, -6] };
const ortho = new T.OrthographicCamera(-1.15, 1.15, 1.15*H/W, -1.15*H/W, 0.1, 20);
function shoot(view, tag) {
  const p = cams[view];
  ortho.position.set(p[0], p[1], p[2]);
  ortho.up.set(0, 1, 0);
  ortho.lookAt(0, 1.2, 0);
  rend.render(sc, ortho);
  return __shot(tag);
}
// sheet (pattern) drawn to a 2D canvas, same layout as pattern.py sheet_svg (780x700, 4.5 px/cm)
async function shootSheet() {
  rend.dispose();
  const c2 = document.createElement("canvas");
  c2.width = W; c2.height = H;
  c2.style.cssText = "position:fixed;inset:0;z-index:99999";
  holder.appendChild(c2);
  const x = c2.getContext("2d");
  const k = Math.min(W/780, H/700);
  x.scale(k, k);
  x.fillStyle = "#fdfbf5"; x.fillRect(0, 0, 780, 700);
  x.strokeStyle = "#e8e3d4"; x.lineWidth = 0.7;
  for (let gx2 = 0; gx2 <= 780; gx2 += 45) { x.beginPath(); x.moveTo(gx2, 0); x.lineTo(gx2, 700); x.stroke(); }
  for (let gy2 = 0; gy2 <= 700; gy2 += 45) { x.beginPath(); x.moveTo(0, gy2); x.lineTo(780, gy2); x.stroke(); }
  const lay = { front: [0, 0], back: [340, 0], sleeveP: [0, 340], sleeveM: [300, 340], band: [0, 560] };
  const ru = { front: "перед", back: "спинка", sleeveP: "рукав +X", sleeveM: "рукав −X", band: "бейка горловины" };
  for (const nm of Object.keys(parts)) {
    const pt = parts[nm];
    const Xp = p => lay[nm][0] + p[0]*4.5 + 130, Yp = p => lay[nm][1] + p[1]*4.5 + 120;
    x.beginPath();
    pt.pts.forEach((p, i) => i ? x.lineTo(Xp(p), Yp(p)) : x.moveTo(Xp(p), Yp(p)));
    x.closePath();
    x.fillStyle = "rgba(255,255,255,0.8)"; x.fill();
    x.lineWidth = 1.6; x.strokeStyle = "#20242a"; x.stroke();
    x.strokeStyle = "#c0392b"; x.lineWidth = 2.3;
    for (const en of Object.keys(pt.edges)) {
      const ep = edgePts(pt, en);
      x.beginPath();
      ep.forEach((p, i) => i ? x.lineTo(Xp(p), Yp(p)) : x.moveTo(Xp(p), Yp(p)));
      x.stroke();
    }
    const mid = pt.pts[Math.floor(pt.pts.length/2)];
    x.fillStyle = "#333"; x.font = "16px sans-serif";
    x.fillText(ru[nm], Xp(mid), Yp(mid));
  }
  x.fillStyle = "#333"; x.font = "15px sans-serif";
  x.fillText("выкройка футболки: грудь " + C_bust.toFixed(0) + ", шея " + C_neck.toFixed(0) + ", бицепс " + C_bicep.toFixed(0) + " см · 1 см = 4.5 px · красным — швы", 12, 22);
  return __shot("sheet");
}
await shoot("front", "front");
await shoot("side", "side");
await shoot("back", "back");
await shootSheet();
// tee.json + tee.svg exactly like pattern.py writes them
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
const tee = {
  kind: "tee-pattern-v1", unit: "cm", y_axis: "down from nape (y=0)",
  params: { C_bust: r2(C_bust), C_hips: r2(C_hips), C_neck: r2(C_neck), C_bicep: r2(C_bicep), C_elbow: r2(C_elbow),
            ease_chest: EASE_CHEST, ease_arm: EASE_ARM, band_w: BAND_W, AD: r2(AD), y_tip: r2(y_tip), tipx: r2(tipx),
            wn_f: r2(wn), wn_b: r2(wn), dr_f: r2(dr_f), dr_b: r2(dr_b), Xw: r2(Xw), Xh: r2(Xh), y_hem: r2(y_hem),
            cap_h: r2(h), cap_w2: r2(2*cw), a: r2(a), aw: r2(aw), Ls: r2(Ls), band_len: r2(Ln), armhole_len: r2(L_arm) },
  anchors: { nape_y: y_nape,
    chest: { y: M.chest[0], zc: M.chest[1].cz, C: C_bust },
    hips: { y: M.hips[0], zc: M.hips[1].cz, C: C_hips },
    neck: { y: M.neck[0], zc: M.neck[1].cz, C: C_neck },
    arms: { L: { bicep_y: M.arms.L.bicep[0], bicep_cx: M.arms.L.bicep[1].cx, bicep_cz: M.arms.L.bicep[1].cz,
                 elbow_y: M.arms.L.elbow[0], elbow_cx: M.arms.L.elbow[1].cx, elbow_cz: M.arms.L.elbow[1].cz, C_bicep: M.arms.L.bicep[1].per*100 },
            R: { bicep_y: M.arms.R.bicep[0], bicep_cx: M.arms.R.bicep[1].cx, bicep_cz: M.arms.R.bicep[1].cz,
                 elbow_y: M.arms.R.elbow[0], elbow_cx: M.arms.R.elbow[1].cx, elbow_cz: M.arms.R.elbow[1].cz, C_bicep: M.arms.R.bicep[1].per*100 } } },
  parts: {},
  seams: seams
};
for (const nm of Object.keys(parts)) {
  tee.parts[nm] = { pts: parts[nm].pts.map(p => [r1(p[0]), r1(p[1])]), edges: parts[nm].edges };
}
const teeJson = JSON.stringify(tee);
// svg sheet
const layS = { front: [0, 0], back: [340, 0], sleeveP: [0, 340], sleeveM: [300, 340], band: [0, 560] };
const ruS = { front: "перед", back: "спинка", sleeveP: "рукав +X", sleeveM: "рукав −X", band: "бейка горловины" };
let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"780\" height=\"700\" viewBox=\"0 0 780 700\">\n<rect width=\"780\" height=\"700\" fill=\"#fdfbf5\"/>\n";
for (let gx2 = 0; gx2 <= 780; gx2 += 45) svg += "<line x1=\"" + gx2 + "\" y1=\"0\" x2=\"" + gx2 + "\" y2=\"700\" stroke=\"#e8e3d4\" stroke-width=\"0.7\"/>\n";
for (let gy2 = 0; gy2 <= 700; gy2 += 45) svg += "<line x1=\"0\" y1=\"" + gy2 + "\" x2=\"780\" y2=\"" + gy2 + "\" stroke=\"#e8e3d4\" stroke-width=\"0.7\"/>\n";
for (const nm of Object.keys(parts)) {
  const pt = parts[nm];
  const Xp = p => (layS[nm][0] + p[0]*4.5 + 130).toFixed(1), Yp = p => (layS[nm][1] + p[1]*4.5 + 120).toFixed(1);
  svg += "<path d=\"" + pt.pts.map((p, i) => (i ? "L" : "M") + Xp(p) + "," + Yp(p)).join(" ") + " Z\" fill=\"#ffffffcc\" stroke=\"#20242a\" stroke-width=\"1.6\"/>\n";
  for (const en of Object.keys(pt.edges)) {
    const ep = edgePts(pt, en);
    svg += "<path d=\"" + ep.map((p, i) => (i ? "L" : "M") + Xp(p) + "," + Yp(p)).join(" ") + "\" fill=\"none\" stroke=\"#c0392b\" stroke-width=\"2.3\"/>\n";
  }
  const mid = pt.pts[Math.floor(pt.pts.length/2)];
  svg += "<text x=\"" + Xp(mid) + "\" y=\"" + Yp(mid) + "\" font-family=\"sans-serif\" font-size=\"16\" fill=\"#333\">" + ruS[nm] + "</text>\n";
}
svg += "<text x=\"12\" y=\"22\" font-family=\"sans-serif\" font-size=\"15\" fill=\"#333\">выкройка футболки: грудь " + C_bust.toFixed(0) + ", шея " + C_neck.toFixed(0) + ", бицепс " + C_bicep.toFixed(0) + " см · 1 см = 4.5 px · красным — швы</text>\n</svg>";
const checks = {
  measure: { chest_y: M.chest[0], C_chest: +C_bust.toFixed(1), hips_y: M.hips[0], C_hips: +C_hips.toFixed(1),
             neck_y: M.neck[0], C_neck: +C_neck.toFixed(1), bicepC: +C_bicep.toFixed(1), elbowC: +C_elbow.toFixed(1),
             tipx: +tipx.toFixed(1), y_tip: +y_tip.toFixed(1), Xw: +Xw.toFixed(1), Xh: +Xh.toFixed(1),
             y_hem: +y_hem.toFixed(1), AD: +AD.toFixed(1), armhole_len: +L_arm.toFixed(1),
             cap_h: +h.toFixed(1), cap_w2: +(2*cw).toFixed(1), Ls: +Ls.toFixed(1), band_len: +Ln.toFixed(1),
             chest_zc: +anchors.chest.zc.toFixed(4), neck_zc: +anchors.neck.zc.toFixed(4) },
  seams: seamChecks,
  place: placeReport,
  seamPairs: seamPairs
};
return "@@CHECKS@@\n" + JSON.stringify(checks) + "\n@@TEE@@\n" + teeJson + "\n@@SVG@@\n" + svg;
