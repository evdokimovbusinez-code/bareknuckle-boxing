/* ───────── tops: tees, long sleeves, tanks, sweatshirts, hoodies ─────────
   Their own skinned geometry with a loose fit (like the trousers of 04d_street.js), built from the body's bind-pose outline:
   · the torso is ONE grid of rings: horizontal rings from the hem to the armpits (radius = the body's outline + clearance, but never
     less than the chest's radius × `fit`: the cloth hangs from the chest and does not follow the abs), then a dome of rings over the
     shoulders up to the collar loop (rays from the chest's centre, the elevation of the loop per column is `eC`), the last two rings
     are the collar's rib and a lip turned in; a sleeveless cut gets its armholes from the field `aCut` (discarded in the shader);
   · a sleeve is a tube around the arm's axis (shoulder → elbow → wrist) that starts inside the torso, so the "shoulder seam" is just
     where the tube leaves the dome; the slack hangs under the arm; · a hood, its cords: patches offset from the torso's surface.
   Weights are the body's own (averaged over the cone of each ray), so shoulders and elbows bend like the skin. One mesh = one draw
   call; the "cloth" is two damped springs (topTick): the hem and the hood with its cords. */
const TOP_CUTS = {
  // hem: cm above the soles · cl: clearance · fit: radius at the hem / at the chest · neck: [half width, front drop, back drop, power] (cm below the shoulder line)
  // rib: collar band · sl: sleeve length from the shoulder joint · ease: slack under the arm [shoulder, end] · arm: armhole ellipsoid [cx, cy, cz, ax, ay, az]
  tee: { hem: 93, cl: 1.2, fit: 0.93, neck: [8.4, 6.5, -0.5, 2], rib: 2, sl: 18, ease: [1.5, 2.2], fab: 'cotton' },
  teeOv: { hem: 86, cl: 1.8, fit: 1.02, neck: [9, 7, -0.5, 2], rib: 2.2, sl: 27, ease: [3, 3.8], fab: 'cotton' },
  long: { hem: 93, cl: 1.1, fit: 0.92, neck: [8.4, 6.5, -0.5, 2], rib: 1.8, sl: 56.5, ease: [1.4, 0.9], cuff: 4.5, fab: 'cotton' },
  tank: { hem: 92, cl: 0.8, fit: 0.9, neck: [9.5, 16.5, 7, 1.5], rib: 1.2, sl: 0, arm: [25, 2.5, 146, 17, 19, 15], fab: 'rib' },
  mesh: { hem: 90, cl: 1.4, fit: 0.98, neck: [9.5, 14, 5, 1.5], rib: 1.4, sl: 0, arm: [26, 2.5, 146, 16, 19, 14], fab: 'mesh' },
  crop: { hem: 121, cl: 1.2, fit: 1.0, neck: [9, 9, 1.5, 2], rib: 1.4, sl: 0, arm: [28, 3, 147, 13, 15, 12], fab: 'cotton' },
  sweatshirt: { hem: 91, cl: 1.4, fit: 0.98, band: 6, neck: [8.8, 6.5, -0.5, 2], rib: 2.4, sl: 57, ease: [1.7, 1.2], cuff: 6, fab: 'fleece' },
  hoodie: { hem: 91, cl: 1.5, fit: 0.98, band: 6, neck: [9.6, 7.5, -1, 2], rib: 2.4, sl: 57, ease: [1.8, 1.3], cuff: 6, hood: 1, fab: 'fleece' },
};
// the whole body but the head and the hands, in the bind pose: [x, y, z, region, vertex] (cm, z up from the soles, front = -y, +x = his left)
function topEnv(F) {
  if (GEAR.tenv) return GEAR.tenv;
  const pos = F.body.geometry.attributes.position, gh = GEAR.gh, P = [], n = pos.count; let z0 = 1e9;
  for (let i = 0; i < n; i++) z0 = Math.min(z0, pos.getZ(i));
  for (let i = 0; i < n; i++) { const R = gh[i * 3 + 1]; if (R === 5 || (R === 4 && gh[i * 3 + 2] >= 2)) continue; P.push(pos.getX(i), pos.getY(i), pos.getZ(i) - z0, R, i); }
  return GEAR.tenv = { P, z0 };
}
function topGeo(F, cut) {
  const key = 'tg_' + cut; if (GEAR[key]) return GEAR[key];
  const C = TOP_CUTS[cut], { P, z0 } = topEnv(F), TAU = Math.PI * 2, N = 28, KD = 9, zC = 138, LD = 16, names = GEAR.names, gh = GEAR.gh;
  const si0 = F.body.geometry.attributes.skinIndex, sw0 = F.body.geometry.attributes.skinWeight;
  const MIR = names.map((nm, b) => { const i = names.indexOf(/_L_/.test(nm) ? nm.replace('_L_', '_R_') : nm.replace('_R_', '_L_')); return i < 0 ? b : i; });
  // the farthest body point of the set S inside a cone (origin o, axis d); wOut collects the skin weights of the outer points
  const cone = (S, ox, oy, oz, dx, dy, dz, cw, wOut) => {
    let m = 0; const hit = [];
    for (const i of S) { const x = P[i] - ox, y = P[i + 1] - oy, z = P[i + 2] - oz, l = Math.hypot(x, y, z); if (l < 1e-3 || x * dx + y * dy + z * dz < cw * l) continue; hit.push(i, l); if (l > m) m = l; }
    if (wOut) for (let q = 0; q < hit.length; q += 2) if (hit[q + 1] > m - 3.5) { const v = P[hit[q] + 4]; for (let k = 0; k < 4; k++) { const w = sw0.getComponent(v, k); if (w > 0) { const b = si0.getComponent(v, k); wOut.set(b, (wOut.get(b) || 0) + w); } } }
    return m;
  };
  let lastW = [[0, 1], [0, 0], [0, 0], [0, 0]];
  const top4 = (m, mir) => { if (!m.size) return lastW; const r = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), s = r.reduce((t, e) => t + e[1], 0) || 1, o = r.map(([b, w]) => [mir ? MIR[b] : b, w / s]); while (o.length < 4) o.push([o[0][0], 0]); return lastW = o; };
  const sm = r => r.map((x, j) => (r[(j + r.length - 1) % r.length] + 2 * x + r[(j + 1) % r.length]) / 4);
  const xS = 21, T0 = [], A = [];
  for (let i = 0; i < P.length; i += 5) { const R = P[i + 3]; if (P[i + 2] > 70 && (R < 2.5 || (R === 3 && Math.abs(P[i]) < xS))) T0.push(i); if (P[i] > 0 && R > 2.5) A.push(i); }
  const ext = f => { let a = 1e9, b = -1e9; for (const i of T0) if (f(i)) { a = Math.min(a, P[i + 1]); b = Math.max(b, P[i + 1]); } return a > b ? [0, 0] : [a, b]; };
  const cyAt = h => { const [a, b] = ext(i => Math.abs(P[i + 2] - h) < 2.5 && P[i + 3] < 2.5); return (a + b) / 2; }, cyC = cyAt(zC);
  // the collar loop: an ellipse about the neck, lowest at the front; as the elevation over the chest's centre per azimuth
  const [wN, dF, dB, pw] = C.neck, yN = cyC + 1.5; let zS = 0;
  for (const i of T0) { const ax = Math.abs(P[i]); if (P[i + 3] === 2 && ax > wN + 0.5 && ax < wN + 2.5 && Math.abs(P[i + 1] - yN) < 3.5) zS = Math.max(zS, P[i + 2]); }
  const midY = (z, fr) => ext(i => Math.abs(P[i]) < 2.5 && Math.abs(P[i + 2] - z) < 1.5 && P[i + 3] === 2)[fr ? 0 : 1];
  const zF = Math.max(zS - dF, zC + 2), yF = midY(zF, 1), yB = midY(zS - dB, 0);
  const ecTab = new Float32Array(256).fill(-9), azOf = (x, y) => { const a = Math.atan2(-(y - cyC), -x); return a < 0 ? a + TAU : a; };
  for (let q = 0; q < 4096; q++) { const a = TAU * q / 4096, f = Math.sin(a), x = -wN * Math.cos(a), y = yN - f * (f > 0 ? yN - yF : yB - yN), z = zS - (f > 0 ? (zS - zF) * Math.pow(f, pw) : dB * Math.pow(-f, pw));
    ecTab[(azOf(x, y) / TAU * 256) & 255] = Math.max(0.08, Math.atan2(z - zC, Math.hypot(x, y - cyC))); }
  for (let q = 1; q < 512; q++) if (ecTab[q & 255] < -8) ecTab[q & 255] = ecTab[(q - 1) & 255];
  const eC = a => { const f = a / TAU * 256, i = Math.floor(f); return lerp(ecTab[i & 255], ecTab[(i + 1) & 255], f - i); };
  const T1 = T0.filter(i => { const z = P[i + 2] - zC; return z < 0 || Math.atan2(z, Math.hypot(P[i], P[i + 1] - cyC)) < eC(azOf(P[i], P[i + 1])) + 0.03; });   // (nothing above the collar: the neck stays out of the outline)
  // —— torso rows: [{ p, w } × N], v, hem sway ——
  const dirs = []; for (let j = 0; j < N; j++) { const a = TAU * j / N; dirs.push([-Math.cos(a), -Math.sin(a), a]); }   // column 0 = his right side, N/4 = front, N/2 = left, 3N/4 = back
  const n = Math.ceil((zC - C.hem) / 3), VS = zC - C.hem + LD, rows = [], cw1 = Math.cos(0.16), cw2 = Math.cos(0.12);
  const cyl = []; for (let k = 0; k <= n; k++) { const h = C.hem + (zC - C.hem) * k / n, cy = lerp(cyAt(h), cyC, sstep(zC - 14, zC, h)), W = [], env = dirs.map(d => { const m = new Map(); W.push(m); return cone(T1, 0, cy, h, d[0], d[1], 0, cw1, m); }); cyl.push({ h, cy, env, W }); }
  const Rch = dirs.map((d, j) => Math.max(...cyl.filter(r => r.h > 125).map(r => r.env[j])));
  for (const r of cyl) { const clh = lerp(C.cl, Math.max(C.cl, 2.8), sstep(GEAR.top + 7, GEAR.top + 1, r.h)), band = C.band && r.h < C.hem + C.band + 0.5;
    r.rad = sm(sm(r.env.map((e, j) => (band ? e + clh : Math.max(e + clh, (Rch[j] + C.cl) * lerp(C.fit, 1, sstep(C.hem, zC - 6, r.h))))
      + (C.hood ? 1.1 * sstep(0.9, 0.6, Math.abs(dirs[j][2] - Math.PI / 2)) * sstep(96, 100, r.h) * sstep(120, 115, r.h) : 0)))); }   // (a hoodie: the kangaroo pocket stands out a little)
  cyl.forEach((r, k) => { const mk = dr => dirs.map((d, j) => ({ p: [d[0] * (r.rad[j] - dr), r.cy + d[1] * (r.rad[j] - dr), r.h + dr * 0.7], w: top4(r.W[j]) })), sw = Math.pow(sstep(C.hem + 18, C.hem, r.h), 1.5) * (C.band ? 0.5 : 1);
    if (!k) rows.push({ pts: mk(1), v: 0, sw }); rows.push({ pts: mk(0), v: 0.6 * (r.h - C.hem) / VS, sw }); });
  const topR = cyl[n], ecj = dirs.map(d => eC(d[2])), ray = (d, e) => [d[0] * Math.cos(e), d[1] * Math.cos(e), Math.sin(e)];
  const rcj = dirs.map((d, j) => { const D = ray(d, ecj[j]); return cone(T1, 0, cyC, zC, D[0], D[1], D[2], cw2) || 20; });
  for (let i = 1; i <= KD + 1; i++) { const W = [], es = [], lip = i > KD, ii = Math.min(i, KD);
    const rad = sm(dirs.map((d, j) => { const dl = clamp(C.rib / rcj[j] / ecj[j], 0.04, 0.5), t = ii < KD ? ii / (KD - 1) * (1 - dl) : 1, e = ecj[j] * t, D = ray(d, e), m = new Map(); W.push(m); es.push(e);
      return Math.max((cone(T1, 0, cyC, zC, D[0], D[1], D[2], cw2, m) || rcj[j]) + C.cl + (ii >= KD - 1 ? 0.25 : 0), topR.rad[j] * (1 - sstep(0, 0.5, t))) - (lip ? 0.9 : 0); }));
    rows.push({ pts: dirs.map((d, j) => { const D = ray(d, es[j]); return { p: [D[0] * rad[j], cyC + D[1] * rad[j], zC + D[2] * rad[j]], w: top4(W[j]) }; }), v: 0.6 * (zC - C.hem + LD * ii / KD) / VS, sw: 0 }); }
  // —— buffers ——
  const pos = [], uv = [], si = [], sw = [], asw = [], acut = [], idx = [], seams = [];
  const cutAt = p => { if (!C.arm) return 50; const a = C.arm, f = Math.hypot((Math.abs(p[0]) - a[0]) / a[3], (p[1] - a[1]) / a[4], (p[2] - a[2]) / a[5]); return Math.min(50, (f - 1) * Math.min(a[3], a[5])); };
  const add = (p, u, v, w, s1, s2, cut) => { pos.push(p[0], p[1], p[2] + z0); uv.push(u, v); for (const [b, x] of w) { si.push(b); sw.push(x); } asw.push(s1, s2); acut.push(cut === undefined ? cutAt(p) : cut); return pos.length / 3 - 1; };
  const quads = (base, nr, nc, flip) => { for (let k = 0; k < nr - 1; k++) for (let j = 0; j < nc - 1; j++) { const a = base + k * nc + j, b = a + 1, c = a + nc, d = c + 1; if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); } };
  rows.forEach(r => { let f = 0; for (let j = 0; j <= N; j++) { const q = r.pts[j % N], v = add(q.p, j / N, r.v, q.w, r.sw, 0); if (!j) f = v; else if (j === N) seams.push([f, v]); } });
  quads(0, rows.length, N + 1);
  const D = { hem: C.hem, zC, VS, LD, KD, vRib: 0.6 * (zC - C.hem + LD * (KD - 1) / KD) / VS, fk: LD / (zF - zC), skinA: 0, skinLo: C.hem + 2, s0: -5, sT: 63, circ: 0,
    skinHi: C.fab === 'mesh' ? 0 : Math.min(zF, zS - dB, C.arm ? C.arm[2] - C.arm[5] : 1e9) - 1.8 };
  for (let j = 0; j < N; j++) { const a = rows[n + 1].pts[j].p, b = rows[n + 1].pts[(j + 1) % N].p; D.circ += Math.hypot(a[0] - b[0], a[1] - b[1]); }
  // —— sleeves ——
  if (C.sl) {
    const bp = k => { const q = GEAR.bpos(k); return [q.x, q.y, q.z - z0]; }, S = bp('L_UpperarmTwist01'), E = bp('L_ElbowShareBone'), Wr = bp('L_Hand'), NS = 14;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const L1 = Math.hypot(...sub(E, S)), Ta = nrm(sub(E, S)), Tb = nrm(sub(Wr, E)), ss = [];
    for (let s = D.s0; s < C.sl - 1.2;) { ss.push(s); s += s < 6 ? 2.2 : Math.abs(s - L1) < 9 ? 2.4 : 3.6; } ss.push(C.sl);
    const sAt = i => { const q = [P[i], P[i + 1], P[i + 2]], d = sub(q, S), a = d[0] * Ta[0] + d[1] * Ta[1] + d[2] * Ta[2]; if (a <= L1) return a; const e = sub(q, E); return L1 + e[0] * Tb[0] + e[1] * Tb[1] + e[2] * Tb[2]; };
    const rings = ss.map(s => { const c = s <= L1 ? S.map((x, k) => x + Ta[k] * s) : E.map((x, k) => x + Tb[k] * (s - L1)), q = sstep(L1 - 5, L1 + 5, s), T = nrm(Ta.map((x, k) => lerp(x, Tb[k], q)));
      const U = nrm([-T[2] * T[0], -T[2] * T[1], 1 - T[2] * T[2]]), V = [T[1] * U[2] - T[2] * U[1], T[2] * U[0] - T[0] * U[2], T[0] * U[1] - T[1] * U[0]], W = [], Ds = [];
      let env = []; for (let q2 = 0; q2 < NS; q2++) { const th = TAU * q2 / NS, Dv = U.map((x, k) => Math.cos(th) * x + Math.sin(th) * V[k]), m = new Map(); W.push(m); Ds.push(Dv); env.push(cone(A, c[0], c[1], c[2], Dv[0], Dv[1], Dv[2], Math.cos(0.5), m)); }
      const ok = env.filter(e => e > 0), mean = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 5; env = sm(sm(env.map(e => e || mean)));
      return { s, c, Ds, env, W: W.map(m => top4(m)) }; });
    const e0 = rings.map(r => r.env); rings.forEach((r, k) => { if (k && k < rings.length - 1) r.env = r.env.map((e, q) => (e0[k - 1][q] + 2 * e + e0[k + 1][q]) / 4); });
    for (const sd of [1, -1]) { const base = pos.length / 3;
      for (let k = 0; k <= rings.length; k++) { const lip = k === rings.length, r = rings[Math.min(k, rings.length - 1)], cuff = C.cuff && r.s > C.sl - C.cuff - 0.1, tp = lerp(0.5, 1, sstep(-5, 1, r.s)); let f = 0;
        for (let q = 0; q <= NS; q++) { const qq = q % NS, th = TAU * qq / NS, rad = (r.env[qq] + (cuff ? 0.8 : C.cl + 0.3 + lerp(C.ease[0], C.ease[1], clamp(r.s / C.sl, 0, 1)) * (1 - Math.cos(th))) - (lip ? 0.9 : 0)) * tp, Dv = r.Ds[qq];
          const w = sd > 0 ? r.W[qq] : r.W[qq].map(([b, x]) => [MIR[b], x]), v = add([sd * (r.c[0] + Dv[0] * rad), r.c[1] + Dv[1] * rad, r.c[2] + Dv[2] * rad], 0.6 * (r.s - D.s0) / D.sT, 0.62 + 0.36 * q / NS, w, 0, 0, 50);
          if (!q) f = v; else if (q === NS) seams.push([f, v]); } }
      quads(base, rings.length + 1, NS + 1, sd < 0); }
    let sa = 0, sn = 0; for (const i of A) { const s = sAt(i); if (s > C.sl - 5 && s < C.sl - 2.5) { sa += gh[P[i + 4] * 3 + 2]; sn++; } }
    D.skinA = C.sl > 50 ? 2 : sn ? sa / sn + 0.05 : 0.5;
  }
  // —— patches offset from the torso's surface: the hood on the back, its cords ——
  const TS = (a, kf) => { const jf = ((a / TAU) % 1 + 1) % 1 * N, j0 = Math.floor(jf) % N, j1 = (j0 + 1) % N, tj = jf - Math.floor(jf), k0 = clamp(Math.floor(kf), 0, rows.length - 2), tk = clamp(kf - k0, 0, 1), m = new Map();
    const cs = [[rows[k0].pts[j0], (1 - tj) * (1 - tk)], [rows[k0].pts[j1], tj * (1 - tk)], [rows[k0 + 1].pts[j0], (1 - tj) * tk], [rows[k0 + 1].pts[j1], tj * tk]], p = [0, 0, 0];
    for (const [c, f] of cs) { for (let k = 0; k < 3; k++) p[k] += c.p[k] * f; for (const [b, x] of c.w) if (x * f > 0) m.set(b, (m.get(b) || 0) + x * f); }
    return { p, w: top4(m) }; };
  const patch = (a0, a1, k0, k1, nu, nv, fn, r) => { const base = pos.length / 3;
    for (let iv = 0; iv <= nv; iv++) for (let iu = 0; iu <= nu; iu++) { const u = iu / nu, v = iv / nv, q = TS(lerp(a0, a1, u), lerp(k0, k1, v)), [off, s2] = fn(u * 2 - 1, v), o = [q.p[0], q.p[1] - cyC, q.p[2] - Math.min(q.p[2], zC)], l = Math.hypot(o[0], o[1], o[2]) || 1;
      add([q.p[0] + o[0] / l * off, q.p[1] + o[1] / l * off, q.p[2] + o[2] / l * off], lerp(r[0], r[2], u), lerp(r[1], r[3], v), q.w, 0, s2, 50); }
    quads(base, nv + 1, nu + 1); };
  if (C.hood) { const Kc = n + 1 + KD;
    patch(Math.PI * 1.5 - 1.25, Math.PI * 1.5 + 1.25, n - 1, Kc, 28, 18, (u, v) => { const w = 1 - v, Wn = lerp(1, 0.3, sstep(0.25, 1, w)), m = 1 - (u / Wn) * (u / Wn), g = sstep(0, 0.1, w) * (0.8 + 0.2 * Math.sin(Math.PI * clamp(w * 1.25, 0, 1))) * (1 - 0.5 * w * w * w);
      return m > 0 ? [0.15 + 7.5 * Math.pow(m, 0.7) * g, Math.sqrt(m) * sstep(0.05, 0.7, w)] : [Math.max(-0.8, m * 2.5), 0]; }, [0.64, 0.64, 0.97, 0.98]);
    for (const a of [-0.3, 0.3]) patch(Math.PI / 2 + a - 0.028, Math.PI / 2 + a + 0.028, Kc - 7.5, Kc - 0.8, 1, 9, (u, v) => [0.55, 0.7 * Math.pow(1 - v, 1.5)], [0.98, 0.64, 0.995, 0.98]); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  { const nm = geo.attributes.normal.array; for (const [a, b] of seams) for (let c = 0; c < 3; c++) nm[a * 3 + c] = nm[b * 3 + c] = nm[a * 3 + c] + nm[b * 3 + c]; geo.normalizeNormals(); }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('aSw', new THREE.Float32BufferAttribute(asw, 2)); geo.setAttribute('aCut', new THREE.Float32BufferAttribute(acut, 1));
  geo.userData = D;
  return GEAR[key] = geo;
}
/* colour and normal map. Torso: u 0 right side · 0.25 front · 0.5 left side · 0.75 back, v 0 … 0.6 hem → collar; sleeve: u 0 … 0.6 along it,
   v 0.62 … 0.98 around (0.8 = the seam under the arm); hood: u, v 0.64 … 0.98; cords: the strip at u > 0.98 */
function topTex(v, geo) {
  const C = TOP_CUTS[v.cut], D = geo.userData, W = 1024, H = 1024, X = u => u * W, Y = t => (1 - t) * H, TV = z => 0.6 * (z <= D.zC ? z - C.hem : D.zC - C.hem + (z - D.zC) * D.fk) / D.VS, XS = s => 0.6 * (s - D.s0) / D.sT * W;
  const path = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); }, fleece = C.fab === 'fleece', yR = Y(D.vRib), y6 = Y(0.6), ySl = Y(0.98), ySh = Y(0.62);
  const ribs = (g, x0, y0, x1, y1, a) => { g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = 1.5; for (let x = x0; x < x1; x += 5) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); } };
  const map = GEAR['tt_' + v.key] || (GEAR['tt_' + v.key] = canvasTex(W, H, g => {
    const dark = wLum(v.c) < 0.3, thr = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.3)', ink = wInk(v.c);
    const line = (pts, c, w) => { g.strokeStyle = c; g.lineWidth = w; path(g, pts); g.stroke(); }, stitch = pts => { g.setLineDash([5, 3.5]); line(pts, thr, 1.6); g.setLineDash([]); };
    g.fillStyle = v.c; g.fillRect(0, 0, W, H); if (v.pat) camoPaint(g, W, H, 1.5);
    for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,255'},${rr() * (fleece ? 0.12 : 0.05)})`; g.fillRect(rr() * W, rr() * H, 1.6, 1.6); }
    if (C.fab === 'rib') ribs(g, 0, y6, W, H, 0.1);
    for (const u of [0.002, 0.5, 0.998]) line([[X(u), H], [X(u), Y(TV(D.zC - 4))]], 'rgba(0,0,0,0.22)', 2.5);   // side seams
    if (C.band) { const yb = Y(TV(C.hem + C.band)); g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, yb, W, H - yb); ribs(g, 0, yb, W, H, 0.2); line([[0, yb], [W, yb]], 'rgba(0,0,0,0.4)', 2); }
    else { stitch([[0, Y(TV(C.hem + 2))], [W, Y(TV(C.hem + 2))]]); if (C.fab !== 'rib') stitch([[0, Y(TV(C.hem + 2.6))], [W, Y(TV(C.hem + 2.6))]]); }
    g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, y6, W, yR - y6); ribs(g, 0, y6, W, yR, 0.17); line([[0, yR], [W, yR]], 'rgba(0,0,0,0.4)', 2);   // the collar's rib
    if (C.sl) { line([[0, Y(0.8)], [X(0.6), Y(0.8)]], 'rgba(0,0,0,0.22)', 2.5);
      if (C.cuff) { const x = XS(C.sl - C.cuff); g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x, ySl, X(0.6) - x, ySh - ySl); g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1.5; for (let y = ySl; y < ySh; y += 5) { g.beginPath(); g.moveTo(x, y); g.lineTo(X(0.6), y); g.stroke(); } line([[x, ySl], [x, ySh]], 'rgba(0,0,0,0.4)', 2); }
      else stitch([[XS(C.sl - 2), ySl], [XS(C.sl - 2), ySh]]); }
    if (C.hood) { const pk = [[0.25 - 0.1, 119], [0.25 + 0.1, 119], [0.25 + 0.135, 108], [0.25 + 0.135, 98], [0.25 - 0.135, 98], [0.25 - 0.135, 108], [0.25 - 0.1, 119]].map(([u, z]) => [X(u), Y(TV(z))]);
      g.fillStyle = 'rgba(0,0,0,0.07)'; path(g, pk); g.fill(); line(pk, 'rgba(0,0,0,0.38)', 2.5); stitch(pk.map(([x, y]) => [X(0.25) + (x - X(0.25)) * 0.95, y + 5]));
      line([[X(0.805), Y(0.64)], [X(0.805), Y(0.98)]], 'rgba(0,0,0,0.3)', 2.5); stitch([[X(0.815), Y(0.64)], [X(0.815), Y(0.98)]]);
      g.fillStyle = dark ? '#d9d6cf' : '#f1efe9'; g.fillRect(X(0.975), ySl - 2, W, ySh - ySl + 4); g.fillStyle = '#8f9096'; g.fillRect(X(0.975), ySh - 34, W, 36);
      for (const u of [0.25 - 0.3 / 6.283, 0.25 + 0.3 / 6.283]) { g.fillStyle = '#b9bac0'; g.beginPath(); g.arc(X(u), yR + 16, 5, 0, 7); g.fill(); g.fillStyle = '#17181c'; g.beginPath(); g.arc(X(u), yR + 16, 2.2, 0, 7); g.fill(); } }
    if (v.decal && v.brand) { const cmx = W / D.circ; for (const [k, u0] of [['f', 0.25], ['b', 0.75]]) { const d = v.decal[k]; if (d) brandLogo(g, v.brand, X(u0) + d[0] * cmx, Y(TV(GEAR.neck - d[1])), d[2] * cmx, ink, d[2] < 12 ? 'mark' : 'stack'); } }
    if (C.fab === 'mesh') { g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; const y0 = yR + 5, y1 = Y(TV(C.hem + 2.4)); let o = 0; for (let y = y0; y < y1; y += 8.5, o ^= 1) for (let x = o * 5; x < W; x += 10) { g.beginPath(); g.arc(x, y, 3.1, 0, 7); g.fill(); } g.globalCompositeOperation = 'source-over'; }
  }));
  const nmap = GEAR['tn_' + v.cut] || (GEAR['tn_' + v.cut] = (() => {
    const c = document.createElement('canvas'); c.width = W / 2; c.height = H / 2; const g = c.getContext('2d'); g.scale(0.5, 0.5); g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); g.lineCap = 'round'; g.lineJoin = 'round';
    const ridge = (pts, w, a, dk) => { for (const f of [1, 0.6, 0.3]) { g.strokeStyle = `rgba(${dk ? '0,0,0' : '255,255,255'},${a})`; g.lineWidth = w * f; path(g, pts); g.stroke(); } }, R = wRng(11), Z = z => Y(TV(z));
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * (fleece ? 0.045 : 0.022)})`; g.fillRect(R() * W, R() * H, 3, 3); }
    if (C.fab === 'rib') ribs(g, 0, y6, W, H, 0.25);
    const k = fleece ? 1.3 : 1, zw = Math.max(C.hem + 8, 104);
    for (const u0 of [0, 0.5, 1]) for (let i = 0; i < 6; i++) { const z = zw + i * 3.4 + R() * 2, sl = (R() - 0.5) * 5; ridge([[X(u0 - 0.13), Z(z + sl + 3)], [X(u0 - 0.05), Z(z + sl * 0.4)], [X(u0 + 0.05), Z(z - sl * 0.4)], [X(u0 + 0.13), Z(z - sl + 3)]], 16 * k, 0.07 * k); }   // the waist gathers at the sides
    for (const [u0, sg] of [[0.07, 1], [0.43, -1], [0.57, 1], [0.93, -1]]) for (let i = 0; i < 4; i++) ridge([[X(u0 - sg * 0.02), Z(D.zC + 1 - i * 2.5)], [X(u0 + sg * 0.05), Z(D.zC - 4 - i * 3.5)], [X(u0 + sg * (0.11 + R() * 0.03)), Z(D.zC - 7 - i * 4.5)]], 18 * k, 0.05);   // pulls from the armpits
    if (C.hem < 110) for (let i = 0; i < 9; i++) { const u = (i < 5 ? 0.13 : 0.63) + R() * 0.24, z = 112 + R() * 14; ridge([[X(u), Z(z)], [X(u + (R() - 0.5) * 0.03), Z(z - 9)], [X(u + (R() - 0.5) * 0.05), Z(Math.max(C.hem + 3, z - 20))]], 30 * k, 0.04); }   // long drapes off the chest and the shoulder blades
    ridge([[0, yR], [W, yR]], 6, 0.3, 1); ribs(g, 0, y6, W, yR, 0.3);
    if (C.band) { const yb = Z(C.hem + C.band); ribs(g, 0, yb, W, H, 0.3); ridge([[0, yb], [W, yb]], 6, 0.3, 1); for (let i = 0; i < 3; i++) ridge([[0, yb - 14 - i * 16], [W, yb - 14 - i * 16 + (R() - 0.5) * 8]], 20, 0.06); }
    else ridge([[0, Z(C.hem + 2.2)], [W, Z(C.hem + 2.2)]], 5, 0.25, 1);
    if (C.sl) { const ym = Y(0.8), hh = ySh - ySl;
      for (let i = 0; i < 5; i++) { const x = XS(2 + i * 2.6); ridge([[x, ym - hh * 0.3], [x + 8, ym], [x, ym + hh * 0.3]], 12 * k, 0.08); }   // under the arm
      if (C.sl > 40) for (let i = 0; i < 8; i++) { const x = XS(25 + i * 2.4 + R()), o = (R() - 0.5) * 14; ridge([[x + o, ySl + 6], [x, ySl + hh * 0.3], [x - o, ym], [x, ySh - hh * 0.3], [x + o, ySh - 6]], 13 * k, 0.085); }   // the elbow
      if (C.cuff) { const x = XS(C.sl - C.cuff); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; for (let y = ySl; y < ySh; y += 5) { g.beginPath(); g.moveTo(x, y); g.lineTo(X(0.6), y); g.stroke(); } ridge([[x, ySl], [x, ySh]], 6, 0.3, 1); for (let i = 0; i < 3; i++) ridge([[x - 12 - i * 15, ySl], [x - 12 - i * 15 + (R() - 0.5) * 10, ySh]], 16, 0.07); }
      else ridge([[XS(C.sl - 2), ySl], [XS(C.sl - 2), ySh]], 5, 0.25, 1);
      ridge([[0, ym], [X(0.6), ym]], 5, 0.2, 1); }
    if (C.hood) { ridge([[X(0.25 - 0.1), Z(119)], [X(0.25 + 0.1), Z(119)], [X(0.25 + 0.135), Z(108)], [X(0.25 + 0.135), Z(98)], [X(0.25 - 0.135), Z(98)], [X(0.25 - 0.135), Z(108)], [X(0.25 - 0.1), Z(119)]], 6, 0.3, 1);
      for (let i = 0; i < 4; i++) { const y = Y(0.7 + i * 0.07); ridge([[X(0.66), y - 14], [X(0.74), y + 8], [X(0.805), y + 18], [X(0.87), y + 8], [X(0.95), y - 14]], 30, 0.05); } ridge([[X(0.805), Y(0.64)], [X(0.805), Y(0.98)]], 6, 0.3, 1); }
    return heightToNormal(c, 6);
  })());
  return { map, nmap };
}
function topMesh(F, v) {
  const geo = topGeo(F, v.cut), { map, nmap } = topTex(v, geo), C = TOP_CUTS[v.cut], fl = C.fab === 'fleece';
  const mat = new THREE.MeshPhysicalMaterial({ map, normalMap: nmap, normalScale: new THREE.Vector2(fl ? 1.1 : 0.85, fl ? 1.1 : 0.85), roughness: fl ? 0.96 : 0.9, sheen: fl ? 0.45 : 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(v.c).multiplyScalar(1.3), side: THREE.DoubleSide, envMapIntensity: 0.5, alphaTest: C.fab === 'mesh' ? 0.5 : 0 });
  const U = { uSwA: { value: new V3() }, uSwB: { value: new V3() } };
  mat.onBeforeCompile = s => { Object.assign(s.uniforms, U);
    s.vertexShader = 'attribute vec2 aSw; attribute float aCut; varying float vCut; uniform vec3 uSwA; uniform vec3 uSwB;\n' + s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += aSw.x * uSwA + aSw.y * uSwB; vCut = aCut;');
    s.fragmentShader = 'varying float vCut;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if ( vCut < 0.0 ) discard;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= 1.0 - 0.2 * smoothstep( 1.5, 1.1, vCut ); diffuseColor.a = max( diffuseColor.a, smoothstep( 1.5, 1.1, vCut ) );'); };   // the binding of an armhole: a darker, solid band along the cut
  mat.customProgramCacheKey = () => 'top';
  const m = new THREE.SkinnedMesh(geo, mat); m.bind(F.body.skeleton, F.body.bindMatrix); m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
  F.body.parent.add(m); m.position.copy(F.body.position); m.quaternion.copy(F.body.quaternion); m.scale.copy(F.body.scale);
  m.userData = { U, D: geo.userData, sway: [C.fit > 1 ? 1.3 : 0.9, C.hood ? 1.5 : 0] };
  return m;
}
// the hem lags behind the pelvis, the hood and its cords behind the neck (damped springs, like pantsTick)
function topTick(F, m, dt) {
  const st = F.gear.tsw || (F.gear.tsw = [new V3(), new V3(), new V3(), new V3()]), inv = _m1.copy(m.matrixWorld).invert(), h = Math.min(dt || 0, 1 / 30), ud = m.userData;
  for (let s = 0; s < 2; s++) {
    const tgt = F.bpos(s ? 'CC_Base_NeckTwist01' : 'CC_Base_Pelvis', _v1), p = st[s * 2], v = st[s * 2 + 1];
    if (p.distanceToSquared(tgt) > 0.04 || !(p.lengthSq() > 0)) { p.copy(tgt); v.set(0, 0, 0); }
    else if (h > 0) { v.addScaledVector(_v2.copy(tgt).sub(p), (s ? 150 : 220) * h).multiplyScalar(Math.exp(-(s ? 5 : 8) * h)); p.addScaledVector(v, h); }
    const d = _v2.copy(p).sub(tgt); d.y *= s ? 0.6 : 0.3; d.multiplyScalar(ud.sway[s] * 0.04 / Math.hypot(0.04, d.length()));
    const a = _v3.copy(tgt).applyMatrix4(inv); (s ? ud.U.uSwB : ud.U.uSwA).value.copy(d.add(tgt).applyMatrix4(inv).sub(a));
  }
}
// the items (they replace the old shell models of the same ids in ITEMS, so old saves keep their tops)
Object.assign(ITEMS, {
  tank: { cat: 'top', label: 'майка-алкоголичка', model: { cut: 'tank' }, colors: ['white', 'black', 'grey'], price: 0, tags: ['street', 'basic'] },
  tee: { cat: 'top', label: 'футболка', model: { cut: 'tee' }, colors: ['white', 'black', 'grey'], nat: wNat({ white: '#e9e6df', grey: '#9a9ca2' }), price: 150, tags: ['street', 'basic'] },
  teeSD: { cat: 'top', label: 'футболка', model: { cut: 'tee', decal: { f: [0, 17, 21] } }, colors: ['black', 'white', 'wine'], price: 350, tags: ['street'], brand: 'STRAY DOGS' },
  teeOv: { cat: 'top', label: 'футболка oversize', model: { cut: 'teeOv', decal: { b: [0, 20, 26] } }, colors: ['black', 'sand', 'olive'], price: 400, tags: ['street'], brand: 'GUTTERWAVE' },
  long: { cat: 'top', label: 'лонгслив', model: { cut: 'long' }, colors: ['black', 'white', 'navy'], price: 300, tags: ['street', 'basic'] },
  longCB: { cat: 'top', label: 'лонгслив', model: { cut: 'long', decal: { f: [0, 16, 19] } }, colors: ['white', 'black', 'red'], price: 550, tags: ['street'], brand: 'COLDBLOOD' },
  meshTank: { cat: 'top', label: 'майка-сетка', model: { cut: 'mesh' }, colors: ['black', 'white', 'red'], price: 200, tags: ['street'] },
  crop: { cat: 'top', label: 'топик', model: { cut: 'crop' }, colors: ['black', 'white', 'pink'], price: 180, tags: ['street'] },
  sweatshirt: { cat: 'top', label: 'свитшот', model: { cut: 'sweatshirt' }, colors: ['grey', 'navy', 'black'], price: 450, reward: 4, tags: ['street', 'basic'] },
  sweatRL: { cat: 'top', label: 'свитшот', model: { cut: 'sweatshirt', decal: { f: [0, 17, 22] } }, colors: ['red', 'black', 'white'], price: 700, tags: ['street'], brand: 'REDLINE' },
  hoodie: { cat: 'top', label: 'худи', model: { cut: 'hoodie' }, colors: ['graphite', 'grey', 'black'], nat: wNat({ graphite: '#2b2e36' }, { graphite: { label: 'графит' } }), price: 400, reward: 6, tags: ['street', 'basic'] },
  hoodieCS: { cat: 'top', label: 'худи', model: { cut: 'hoodie', decal: { f: [-7.5, 13, 8.5], b: [0, 32, 24] } }, colors: ['black', 'sand', 'wine'], price: 900, reward: 8, tags: ['street'], brand: 'CONCRETE SAINTS' },
});
