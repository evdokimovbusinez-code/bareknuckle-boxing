/* ───────── tops: tees, long sleeves, tanks, sweatshirts, hoodies ─────────
   Their own skinned geometry with a loose fit (like the trousers of 04d_street.js), built from the body's bind-pose outline:
   · the torso is ONE grid of rings: horizontal rings from the hem to the armpits (radius = the body's outline + clearance, but never
     less than the chest's radius × `fit`: the cloth hangs from the chest and does not follow the abs), then a dome of rings over the
     shoulders up to the collar loop (rays from the chest's centre, the elevation of the loop per column is `eC`), the last two rings
     are the collar's rib and a lip turned in; a sleeveless cut gets its armholes from the field `aCut` (discarded in the shader);
   · a sleeve is a tube around the arm (shoulder → elbow → wrist; each ring is centred on the arm's own outline, not on the bone) that
     starts inside the torso, so the "shoulder seam" is just where the tube leaves the dome; the slack hangs under the arm;
   · pieces laid over the torso's surface: the hood (bag + rim + inside), its cords (tubes), the kangaroo pocket; a jacket's lapels and
     collar (its open front is cut out with `aCut`, the zip's teeth are drawn along the cut); the whole plate carrier.
   Weights are the body's own (averaged over the cone of each ray), so shoulders and elbows bend like the skin. One mesh = one draw
   call (+ one for the tee under a jacket / a carrier); the "cloth" is two damped springs (topTick): the hem and the hood with its cords. */
const TOP_CUTS = {
  // hem: cm above the soles · cl: clearance · fit: radius at the hem / at the chest · neck: [half width, front drop, back drop, power] (cm below the shoulder line)
  // rib: collar band · sl: sleeve length from the shoulder joint · ease: slack under the arm [shoulder, end] · arm: armhole ellipsoid [cx, cy, cz, ax, ay, az]
  tee: { hem: 93, cl: 1.2, fit: 0.93, neck: [8.4, 6.5, -0.5, 2], rib: 2, sl: 18, ease: [1.5, 2.2], fab: 'cotton' },
  teeOv: { hem: 86, cl: 1.8, fit: 1.02, neck: [9, 7, -0.5, 2], rib: 2.2, sl: 27, ease: [1.8, 2.4], fab: 'cotton' },
  long: { hem: 93, cl: 1.1, fit: 0.92, neck: [8.4, 6.5, -0.5, 2], rib: 1.8, sl: 56.5, ease: [1.4, 0.9], cuff: 4.5, fab: 'cotton' },
  tank: { hem: 92, cl: 0.8, fit: 0.9, neck: [9.5, 16.5, 7, 1.5], rib: 1.2, sl: 0, arm: [25, 2.5, 146, 17, 19, 15], fab: 'rib' },
  mesh: { hem: 90, cl: 1.4, fit: 0.98, neck: [9.5, 14, 5, 1.5], rib: 1.4, sl: 0, arm: [26, 2.5, 146, 16, 19, 14], fab: 'mesh' },
  crop: { hem: 121, cl: 1.2, fit: 1.0, neck: [9, 9, 1.5, 2], rib: 1.4, sl: 0, arm: [28, 3, 147, 13, 15, 12], fab: 'cotton' },
  sweatshirt: { hem: 91, cl: 1.1, fit: 0.9, band: 6, neck: [8.8, 6.5, -0.5, 2], rib: 2.4, sl: 57, ease: [1.1, 0.7], cuff: 6, fab: 'fleece' },
  hoodie: { hem: 91, cl: 1.1, fit: 0.9, band: 6, neck: [9.6, 7.5, -1, 2], rib: 2.4, sl: 57, ease: [1.1, 0.7], cuff: 6, hood: 1, fab: 'fleece' },
  // open: the front is open, half width of the gap [at the hem, at the chest] · lap: the lapels start at this height, lapW: their width · under: the cut worn under it (its own mesh)
  jacket: { hem: 96, cl: 1.6, fit: 1.0, neck: [9.4, 8.5, -1.5, 2], rib: 1.2, sl: 58, ease: [0.7, 0.5], open: [5.5, 7.5], lap: 113, lapW: 8, fab: 'leather', under: 'under' },
  under: { hem: 92, cl: 0.5, slim: 0.72, fit: 0.9, neck: [8.4, 6.5, -0.5, 2], rib: 2, sl: 0, fab: 'cotton' },   // a tee without sleeves (they would only fight the jacket's); slim: less room over the trunks, to stay inside the jacket
  // rig: no shell of its own, only the pieces laid over the surface (plate bags, cummerbund, straps); the surface is the tee's + 3 mm
  vest: { hem: 93, cl: 1.5, fit: 0.93, neck: [8.4, 6.5, -0.5, 2], rib: 2, sl: 0, rig: 1, fab: 'cordura', under: 'tee' },
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
  const Rch = dirs.map((d, j) => Math.max(...cyl.filter(r => r.h > 114 && r.h < 128.5).map(r => r.env[j])));   // the chest proper, below the armpits (with the shoulders in it the trunk was a barrel)
  for (const r of cyl) { const clh = lerp(lerp(C.cl, Math.max(C.cl, 2.8), sstep(GEAR.top + 7, GEAR.top + 1, r.h)), 4.4, sstep(GEAR.top - 3, GEAR.top - 9, r.h)) * (C.slim || 1),   /* (over the trunks: their cloth is baggy below the waistband) */ band = C.band && r.h < C.hem + C.band + 0.5;
    r.rad = sm(sm(r.env.map((e, j) => (band ? e + clh : Math.max(e + clh, (Rch[j] + C.cl) * lerp(C.fit, 1, sstep(C.hem, zC - 6, r.h))))))); }
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
  const wOp = z => z <= zC ? lerp(C.open[0], C.open[1], clamp((z - C.hem) / (zC - C.hem), 0, 1)) : lerp(C.open[1], wN * 0.72, sstep(zC, zF + 2, z));   // an open front: half the gap at a height
  const cutAt = p => { if (C.open) return p[1] < cyC ? Math.min(50, Math.abs(p[0]) - wOp(p[2])) : 50; if (!C.arm) return 50; const a = C.arm, f = Math.hypot((Math.abs(p[0]) - a[0]) / a[3], (p[1] - a[1]) / a[4], (p[2] - a[2]) / a[5]); return Math.min(50, (f - 1) * Math.min(a[3], a[5])); };
  const add = (p, u, v, w, s1, s2, cut) => { pos.push(p[0], p[1], p[2] + z0); uv.push(u, v); for (const [b, x] of w) { si.push(b); sw.push(x); } asw.push(s1, s2); acut.push(cut === undefined ? cutAt(p) : cut); return pos.length / 3 - 1; };
  const quads = (base, nr, nc, flip) => { for (let k = 0; k < nr - 1; k++) for (let j = 0; j < nc - 1; j++) { const a = base + k * nc + j, b = a + 1, c = a + nc, d = c + 1; if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); } };
  if (!C.rig) { rows.forEach(r => { let f = 0; for (let j = 0; j <= N; j++) { const q = r.pts[j % N], v = add(q.p, j / N, r.v, q.w, r.sw, 0, C.open && j > N / 2 && j < N ? 50 : undefined);   /* (an open front is cut in the front half only) */ if (!j) f = v; else if (j === N) seams.push([f, v]); } });
    quads(0, rows.length, N + 1); }
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
    /* the arm's outline per ring = its support function over a thin slab of the arm (the extent of the body ALONG each direction, which is
       what a tube of cloth wraps), and the ring is then moved from the bone's line to the middle of that outline. (Measured as "the
       farthest point in a wide cone about the bone" it was 1–3 cm too fat on every side: the bone runs along the top of the upper arm.) */
    const sA = A.map(sAt);
    const sup = (c, s, Dv, m) => { let best = 0; const hit = [];
      for (let n2 = 0; n2 < A.length; n2++) { if (Math.abs(sA[n2] - s) > 2.2) continue; const i = A[n2], x = P[i] - c[0], y = P[i + 1] - c[1], z = P[i + 2] - c[2], l = Math.hypot(x, y, z), pr = x * Dv[0] + y * Dv[1] + z * Dv[2]; if (l < 1e-3 || l > 16 || pr < 0.55 * l) continue; hit.push(i, pr); if (pr > best) best = pr; }
      for (let q = 0; q < hit.length; q += 2) if (hit[q + 1] > best - 1.5) { const v = P[hit[q] + 4]; for (let k = 0; k < 4; k++) { const w = sw0.getComponent(v, k); if (w > 0) { const b = si0.getComponent(v, k); m.set(b, (m.get(b) || 0) + w); } } }
      return best; };
    const rings = ss.map(s => { const c = s <= L1 ? S.map((x, k) => x + Ta[k] * s) : E.map((x, k) => x + Tb[k] * (s - L1)), q = sstep(L1 - 5, L1 + 5, s), T = nrm(Ta.map((x, k) => lerp(x, Tb[k], q)));
      const U = nrm([-T[2] * T[0], -T[2] * T[1], 1 - T[2] * T[2]]), V = [T[1] * U[2] - T[2] * U[1], T[2] * U[0] - T[0] * U[2], T[0] * U[1] - T[1] * U[0]], W = [], Ds = [];
      let env = []; for (let q2 = 0; q2 < NS; q2++) { const th = TAU * q2 / NS, Dv = U.map((x, k) => Math.cos(th) * x + Math.sin(th) * V[k]), m = new Map(); W.push(m); Ds.push(Dv); env.push(sup(c, s, Dv, m)); }
      const ok = env.filter(e => e > 0), mean = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : 5, off = [0, 0, 0];
      if (ok.length === NS) for (let q2 = 0; q2 < NS; q2++) for (let k = 0; k < 3; k++) off[k] += 2 * env[q2] * Ds[q2][k] / NS * sstep(0, 8, s);
      return { s, c, Ds, env: env.map(e => e || mean), off, W: W.map(m => top4(m)) }; });
    { const o0 = rings.map(r => r.off), nr = rings.length; rings.forEach((r, k) => { const a = o0[Math.max(k - 1, 0)], b = o0[Math.min(k + 1, nr - 1)]; r.off = r.off.map((x, i) => (a[i] + 2 * x + b[i]) / 4); });
      for (const r of rings) { r.c = r.c.map((x, k) => x + r.off[k]); r.env = sm(r.env.map((e, q) => Math.max(1.5, e - r.off[0] * r.Ds[q][0] - r.off[1] * r.Ds[q][1] - r.off[2] * r.Ds[q][2]))); } }
    const e0 = rings.map(r => r.env); rings.forEach((r, k) => { if (k && k < rings.length - 1) r.env = r.env.map((e, q) => (e0[k - 1][q] + 2 * e + e0[k + 1][q]) / 4); });
    for (const sd of [1, -1]) { const base = pos.length / 3;
      for (let k = 0; k <= rings.length; k++) { const lip = k === rings.length, r = rings[Math.min(k, rings.length - 1)], cuff = C.cuff && r.s > C.sl - C.cuff - 0.1, tp = lerp(0.5, 1, sstep(-5, 1, r.s)); let f = 0;
        for (let q = 0; q <= NS; q++) { const qq = q % NS, th = TAU * qq / NS, rad = (r.env[qq] + (cuff ? 0.5 : C.cl * 0.5 + 0.3 + lerp(C.ease[0], C.ease[1], clamp(r.s / C.sl, 0, 1)) * (1 - Math.cos(th))) - (lip ? 0.9 : 0)) * tp, Dv = r.Ds[qq];
          const w = sd > 0 ? r.W[qq] : r.W[qq].map(([b, x]) => [MIR[b], x]), v = add([sd * (r.c[0] + Dv[0] * rad), r.c[1] + Dv[1] * rad, r.c[2] + Dv[2] * rad], 0.6 * (r.s - D.s0) / D.sT, 0.62 + 0.36 * q / NS, w, 0, 0, 50);
          if (!q) f = v; else if (q === NS) seams.push([f, v]); } }
      quads(base, rings.length + 1, NS + 1, sd < 0); }
    D.L1 = L1;
    let sa = 0, sn = 0; for (const i of A) { const s = sAt(i); if (s > C.sl - 5 && s < C.sl - 2.5) { sa += gh[P[i + 4] * 3 + 2]; sn++; } }
    D.skinA = C.sl > 50 ? 2 : sn ? sa / sn + 0.05 : 0.5;
  }
  /* —— pieces laid over the torso's surface (a: azimuth, k: row; their weights are the surface's): the hood, its cords, the pocket,
     lapels and collar, the plate carrier. off: along the ray from the chest's centre, oh: horizontally outwards, oz: up (cm) —— */
  const TS = (a, kf) => { const jf = ((a / TAU) % 1 + 1) % 1 * N, j0 = Math.floor(jf) % N, j1 = (j0 + 1) % N, tj = jf - Math.floor(jf), k0 = clamp(Math.floor(kf), 0, rows.length - 2), tk = clamp(kf - k0, 0, 1), m = new Map();
    const cs = [[rows[k0].pts[j0], (1 - tj) * (1 - tk)], [rows[k0].pts[j1], tj * (1 - tk)], [rows[k0 + 1].pts[j0], (1 - tj) * tk], [rows[k0 + 1].pts[j1], tj * tk]], p = [0, 0, 0];
    for (const [c, f] of cs) { for (let k = 0; k < 3; k++) p[k] += c.p[k] * f; for (const [b, x] of c.w) if (x * f > 0) m.set(b, (m.get(b) || 0) + x * f); }
    return { p, w: top4(m), v: lerp(rows[k0].v, rows[k0 + 1].v, tk) }; };
  const surf = (a, k, off, oh, oz) => { const q = TS(a, k), o = [q.p[0], q.p[1] - cyC, q.p[2] - Math.min(q.p[2], zC)], l = Math.hypot(o[0], o[1], o[2]) || 1, lh = (Math.hypot(o[0], o[1]) || 1) / (oh || 0);
    return { p: [q.p[0] + o[0] / l * off + o[0] / lh, q.p[1] + o[1] / l * off + o[1] / lh, q.p[2] + o[2] / l * off + (oz || 0)], n: [o[0] / l, o[1] / l, o[2] / l], w: q.w, v: q.v }; };
  const patch = (nu, nv, fn, r) => { const base = pos.length / 3;
    for (let iv = 0; iv <= nv; iv++) for (let iu = 0; iu <= nu; iu++) { const u = iu / nu, v = iv / nv, f = fn(u * 2 - 1, v), q = surf(f.a, f.k, f.off, f.oh, f.oz);
      add(q.p, r ? lerp(r[0], r[2], u) : f.a / TAU, r ? lerp(r[1], r[3], v) : q.v, q.w, f.s1 || 0, f.s2 || 0, 50); }
    quads(base, nv + 1, nu + 1); };
  const HP = Math.PI / 2, Kc = n + 1 + KD, kOf = h => 1 + (h - C.hem) / (zC - C.hem) * n;   // Kc: the row of the collar's edge; the row at a height (below the chest's centre)
  const cr = (K, t) => { const x = clamp(t, 0, 1) * (K.length - 1), i = Math.min(Math.floor(x), K.length - 2), f = x - i, a = K[Math.max(i - 1, 0)], b = K[i], c = K[i + 1], d = K[Math.min(i + 2, K.length - 1)];
    return 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f); };   // Catmull–Rom through evenly spaced keys
  const drop = (a, k0, d) => { let k = k0, p = TS(a, k).p, acc = 0; while (acc < d && k > 0.3) { k -= 0.2; const q = TS(a, k).p, l = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); acc += l; p = q; if (acc > d && l > 1e-6) k += 0.2 * (acc - d) / l; } return k; };   // the row d cm down the surface from row k0
  const edge = (u, v, wu, wv) => sstep(0, 1, clamp(Math.min((1 - Math.abs(u)) / wu, v / wv, (1 - v) / wv), 0, 1));   // 0 on the border of a patch → 1 inside
  if (C.hood) {
    /* the hood lies on the back: a bag from the shoulder blades up to the nape (thickest at the bottom, where the crown is folded under),
       then its rim — the face opening — stands off behind the neck and turns in and down to the collar, so one looks into it from above;
       along the collar the rim runs forward over the shoulders to the eyelets */
    const kb = kOf(zC - 11), kt = Kc - 2, B = Math.PI * 1.5, kk = t => kb + (kt - kb) * t;
    const Kk = [kb, kb + 0.5, kk(0.35), kk(0.7), kt, Kc - 0.8, Kc - 0.1, Kc - 0.2, Kc - 1.1], Ko = [-0.6, 4.6, 6.4, 6.0, 5.0, 2.6, 1.0, 0.5, 0.3], Kh = [0, 0, 0, 0, 1.0, 4.6, 4.4, 1.9, 0.2], Kz = [0, 0, 0, 0, 0, 1.6, 4.2, 1.4, -0.3], Ks = [0.42, 0.62, 0.82, 0.98, 1.2, 1.95, 2.4, 2.45, 2.45];
    patch(34, 26, (u, v) => { const g = Math.pow(Math.max(0, 1 - u * u), 0.75), au = Math.abs(u), rim = sstep(0.42, 0.62, v), fr = 1 - 0.86 * Math.pow(au, 3), gg = lerp(g, fr * sstep(1, 0.93, au), rim);
      const wob = 0.4 * Math.sin(u * 5.3 + v * 7) * Math.sin(v * 11 + u * 2) * g * (1 - rim);
      return { a: B + u * cr(Ks, v), k: cr(Kk, v), off: lerp(-0.5, cr(Ko, v) + wob, gg), oh: cr(Kh, v) * fr * rim, oz: cr(Kz, v) * fr - 1.2 * g * sstep(0.5, 0.1, v) * sstep(0, 0.1, v), s2: gg * lerp(1, 0.3, sstep(0.3, 0.9, v)) }; }, [0.64, 0.64, 0.97, 0.98]);
    // the cords: thin tubes from the eyelets down the chest, with a metal tip
    for (const sg of [-1, 1]) { const a = HP + sg * 0.3, NC = 12, rad = 0.33, base = pos.length / 3;
      for (let i = 0; i <= NC; i++) { const t = i / NC, q = surf(a + sg * 0.05 * t, drop(a, Kc - 1.2, (sg > 0 ? 21 : 18.5) * t), 0.8 * sstep(0, 0.15, t) + rad), tx = [-q.n[1], q.n[0]], tl = Math.hypot(tx[0], tx[1]) || 1, r2 = rad * (t > 0.86 ? 1.3 : 1); let f = 0;
        for (let j = 0; j <= 5; j++) { const ph = TAU * j / 5, c = Math.cos(ph) * r2, sn = Math.sin(ph) * r2 / tl, vi = add([q.p[0] + q.n[0] * c + tx[0] * sn, q.p[1] + q.n[1] * c + tx[1] * sn, q.p[2] + q.n[2] * c], 0.979 + 0.016 * j / 5, lerp(0.98, 0.64, t), q.w, 0, 0.85 * Math.pow(t, 1.5), 50); if (!j) f = vi; else if (j === 5) seams.push([f, vi]); } }
      quads(base, NC + 1, 6); }
    // the kangaroo pocket: a second layer over the belly (it takes the torso's own part of the texture), tucked under at its border
    patch(18, 9, (u, v) => { const W = v < 0.476 ? 0.85 : lerp(0.85, 0.63, (v - 0.476) / 0.524), e = edge(u, v, 0.14, 0.12);
      return { a: HP + u * W, k: kOf(lerp(98, 119, v)), off: lerp(-0.3, 0.55 + 0.55 * (1 - u * u) * Math.pow(Math.sin(Math.PI * v), 0.7), e) }; });
  }
  if (C.open) {
    const aEdge = k => { let lo = 0, hi = 1.5; for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2, q = TS(HP + m, k).p; if (q[0] < wOp(q[2])) lo = m; else hi = m; } return lo; };   // the azimuth (from the front) of the edge of the gap in a row
    // lapels: the fronts folded back along the edge, widening to the collar
    const kl = kOf(C.lap), kT = Kc - 1.4;
    for (const sg of [1, -1]) patch(6, 16, (u, v) => { const k = lerp(kl, kT, v), ae = aEdge(k), q = TS(HP + sg * ae, k).p, r = Math.hypot(q[0], q[1] - cyC) || 10, x = (u + 1) / 2, wd = (0.5 + C.lapW * Math.pow(v, 0.75)) * (1 - 0.3 * sstep(0.86, 1, v));
      return { a: HP + sg * (ae + (x * wd - 0.3) / r), k, off: 0.1 + 0.75 * sstep(0, 0.25, x) - 0.15 * x + 0.5 * x * v }; }, [0.64, 0.64, 0.8, 0.98]);
    // the collar: stands a little at the neck, then folds over and lies on the shoulders; longer points at the front
    const aT = aEdge(Kc - 0.5) + 0.03;
    patch(44, 7, (u, v) => { const a = Math.PI * 1.5 - u * (Math.PI - aT), wd = lerp(5.2, 8.5, Math.pow(Math.abs(u), 2.5));
      return { a, k: cr([Kc, Kc, drop(a, Kc, wd * 0.35), drop(a, Kc, wd * 0.7), drop(a, Kc, wd)], v), off: cr([0.2, 1.1, 1.9, 1.9, 1.7], v), oz: cr([0.2, 2.0, 1.6, 1.0, 0.7], v) }; }, [0.81, 0.64, 0.97, 0.98]);
  }
  if (C.rig) {
    /* a plate carrier: front and back plate bags (the front one with three magazine pouches), a cummerbund round the sides and two
       shoulder straps over the tee; atlas: front 0.02…0.6 × 0.02…0.6 · back 0.62…0.98 × 0.02…0.45 · cummerbund v 0.64…0.8 · straps v 0.84…0.94 */
    const h0 = 113, kB = kOf(h0), bw = 0.86, kUp = (a, z) => { let k = n + 1; while (k < Kc - 1.6 && TS(a, k).p[2] < z) k += 0.2; return k; }, zTF = zF - 3, zTB = zS - 8;   // the row at a height above the chest's centre; the tops of the bags
    const box = (u, v, u0, u1, v0, v1) => sstep(0, 1, clamp(Math.min((u - u0) / 0.06, (u1 - u) / 0.06, (v - v0) / 0.035, (v1 - v) / 0.035), 0, 1));
    const bag = (B, nu, nv, th, pouches, r, zT) => patch(nu, nv, (u, v) => { const W = bw * (v > 0.78 ? lerp(1, 0.6, (v - 0.78) / 0.22) : 1), e = edge(u, v, 0.09, 0.05);
      let o = th; if (pouches) { for (const c of [-0.6, 0, 0.6]) o += 3.0 * box(u, v, c - 0.265, c + 0.265, 0.05, 0.44); o += 0.35 * box(u, v, -0.62, 0.62, 0.56, 0.76); } else o += 0.6 * box(u, v, -0.3, 0.3, 0.84, 0.93);
      return { a: B + u * W, k: v < 0.8 ? lerp(kB, n + 1, v / 0.8) : kUp(B + u * W, lerp(zC, zT, (v - 0.8) / 0.2)), off: lerp(-0.2, o, e) }; }, r);
    bag(HP, 40, 34, 2.3, 1, [0.02, 0.02, 0.6, 0.6], zTF); bag(Math.PI * 1.5, 24, 20, 2.2, 0, [0.62, 0.02, 0.98, 0.45], zTB);
    for (const sg of [1, -1]) patch(18, 5, (u, v) => ({ a: HP + sg * lerp(bw - 0.12, Math.PI - bw + 0.12, (u + 1) / 2), k: lerp(kB + 0.3, kOf(h0 + 11), v), off: lerp(-0.1, 1.0, sstep(0, 0.22, Math.min(v, 1 - v))) }), [0.02, 0.64, 0.6, 0.8]);
    // straps: ribbons over the shoulders from the front bag's top to the back one's
    for (const sg of [1, -1]) { const NT = 20, base = pos.length / 3, kF = kUp(HP + sg * 0.36, zTF - 2.5), kK = kUp(HP + sg * (Math.PI - 0.36), zTB - 2.5), at = t => [HP + sg * lerp(0.36, Math.PI - 0.36, t), lerp(lerp(kF, kK, t), Kc - 2.7, Math.pow(Math.sin(Math.PI * t), 0.6))], P3 = t => surf(...at(clamp(t, 0, 1)), 1.25);
      for (let i = 0; i <= NT; i++) { const t = i / NT, q = P3(t), a = P3(t - 0.02).p, b = P3(t + 0.02).p, T = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], X = [T[1] * q.n[2] - T[2] * q.n[1], T[2] * q.n[0] - T[0] * q.n[2], T[0] * q.n[1] - T[1] * q.n[0]], xl = Math.hypot(X[0], X[1], X[2]) || 1;
        [[-1, -0.9], [-0.82, 0], [0.82, 0], [1, -0.9]].forEach(([w, dz], j) => add([q.p[0] + X[0] / xl * w * 3 + q.n[0] * dz, q.p[1] + X[1] / xl * w * 3 + q.n[1] * dz, q.p[2] + X[2] / xl * w * 3 + q.n[2] * dz], lerp(0.02, 0.6, t), lerp(0.84, 0.94, j / 3), q.w, 0, 0, 50)); }
      quads(base, NT + 1, 4); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  { const nm = geo.attributes.normal.array; for (const [a, b] of seams) for (let c = 0; c < 3; c++) nm[a * 3 + c] = nm[b * 3 + c] = nm[a * 3 + c] + nm[b * 3 + c]; geo.normalizeNormals(); }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('aSw', new THREE.Float32BufferAttribute(asw, 2)); geo.setAttribute('aCut', new THREE.Float32BufferAttribute(acut, 1));
  geo.userData = D;
  return GEAR[key] = geo;
}
/* colour and normal map. Torso: u 0 right side · 0.25 front · 0.5 left side · 0.75 back, v 0 … 0.6 hem → collar; sleeve: u 0 … 0.6 along it,
   v 0.62 … 0.98 around (0.71 = the crook of the elbow, 0.8 = the seam under the arm); hood (bag → rim → inside): u, v 0.64 … 0.98; cords: the
   strip at u > 0.98; a jacket has its lapel (u 0.64 … 0.8) and collar (u 0.81 … 0.97) where the hood is */
function topTex(v, geo) {
  const C = TOP_CUTS[v.cut]; if (C.rig) return vestTex(v);
  const D = geo.userData, W = 1024, H = 1024, X = u => u * W, Y = t => (1 - t) * H, TV = z => 0.6 * (z <= D.zC ? z - C.hem : D.zC - C.hem + (z - D.zC) * D.fk) / D.VS, XS = s => 0.6 * (s - D.s0) / D.sT * W;
  const path = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); }, fleece = C.fab === 'fleece', leather = C.fab === 'leather', yR = Y(D.vRib), y6 = Y(0.6), ySl = Y(0.98), ySh = Y(0.62);
  const ribs = (g, x0, y0, x1, y1, a) => { g.strokeStyle = `rgba(0,0,0,${a})`; g.lineWidth = 1.5; for (let x = x0; x < x1; x += 5) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); } };
  const HX = u => X(0.64 + 0.33 * u), HY = t => Y(0.64 + 0.34 * t), Z = z => Y(TV(z));   // the hood's patch; a height on the torso
  const pk = [[0.25 - 0.1, 119], [0.25 + 0.1, 119], [0.25 + 0.135, 108], [0.25 + 0.135, 98], [0.25 - 0.135, 98], [0.25 - 0.135, 108], [0.25 - 0.1, 119]].map(([u, z]) => [X(u), Z(z)]);   // the kangaroo pocket
  const seams = leather ? [[[X(0.55), Z(D.zC - 3)], [X(0.95), Z(D.zC - 3)]], [[X(0.75), Z(D.zC - 3)], [X(0.75), H]], ...[0.1, 0.4, 0.6, 0.9].map(u => [[X(u), H], [X(u + (u < 0.5 ? (u < 0.25 ? 0.03 : -0.03) : 0)), Z(D.zC - 8)]]), [[0, Z(C.hem + 4)], [W, Z(C.hem + 4)]],
    [[XS(D.L1 - 6), ySl], [XS(D.L1 - 6), ySh]], [[XS(D.L1 + 7), ySl], [XS(D.L1 + 7), ySh]], [[XS(C.sl - 2.5), ySl], [XS(C.sl - 2.5), ySh]]] : [];
  const zips = leather ? [[[X(0.25 + 0.075), Z(129)], [X(0.25 + 0.125), Z(119)]], [[X(0.25 - 0.075), Z(129)], [X(0.25 - 0.125), Z(119)]], [[X(0.25 + 0.085), Z(109)], [X(0.25 + 0.13), Z(101)]], [[X(0.25 - 0.085), Z(109)], [X(0.25 - 0.13), Z(101)]], [[XS(C.sl - 11), Y(0.89)], [XS(C.sl), Y(0.89)]]] : [];
  const map = GEAR['tt_' + v.key] || (GEAR['tt_' + v.key] = canvasTex(W, H, g => {
    const dark = wLum(v.c) < 0.3, thr = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.3)', ink = wInk(v.c);
    const line = (pts, c, w) => { g.strokeStyle = c; g.lineWidth = w; path(g, pts); g.stroke(); }, stitch = pts => { g.setLineDash([5, 3.5]); line(pts, thr, 1.6); g.setLineDash([]); };
    g.fillStyle = v.c; g.fillRect(0, 0, W, H); if (v.pat) camoPaint(g, W, H, 1.5);
    for (let i = 0; i < 26000; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '0,0,0' : '255,255,255'},${rr() * (fleece ? 0.12 : 0.05)})`; g.fillRect(rr() * W, rr() * H, 1.6, 1.6); }
    if (leather) for (let i = 0; i < 260; i++) { const x = rr() * W, y = rr() * H, r = 14 + rr() * 60, gr = g.createRadialGradient(x, y, 0, x, y, r), c = rr() < 0.5 ? '255,255,255' : '0,0,0'; gr.addColorStop(0, `rgba(${c},${0.02 + rr() * 0.04})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }   // the hide is uneven
    if (C.fab === 'rib') ribs(g, 0, y6, W, H, 0.1);
    for (const u of [0.002, 0.5, 0.998]) line([[X(u), H], [X(u), Y(TV(D.zC - 4))]], 'rgba(0,0,0,0.22)', 2.5);   // side seams
    if (C.band) { const yb = Y(TV(C.hem + C.band)); g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, yb, W, H - yb); ribs(g, 0, yb, W, H, 0.2); line([[0, yb], [W, yb]], 'rgba(0,0,0,0.4)', 2); }
    else { stitch([[0, Y(TV(C.hem + 2))], [W, Y(TV(C.hem + 2))]]); if (C.fab !== 'rib') stitch([[0, Y(TV(C.hem + 2.6))], [W, Y(TV(C.hem + 2.6))]]); }
    if (!leather) { g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(0, y6, W, yR - y6); ribs(g, 0, y6, W, yR, 0.17); line([[0, yR], [W, yR]], 'rgba(0,0,0,0.4)', 2); }   // the collar's rib
    if (C.sl) { line([[0, Y(0.8)], [X(0.6), Y(0.8)]], 'rgba(0,0,0,0.22)', 2.5);
      if (C.cuff) { const x = XS(C.sl - C.cuff); g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x, ySl, X(0.6) - x, ySh - ySl); g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1.5; for (let y = ySl; y < ySh; y += 5) { g.beginPath(); g.moveTo(x, y); g.lineTo(X(0.6), y); g.stroke(); } line([[x, ySl], [x, ySh]], 'rgba(0,0,0,0.4)', 2); }
      else stitch([[XS(C.sl - 2), ySl], [XS(C.sl - 2), ySh]]); }
    if (C.hood) {
      g.fillStyle = 'rgba(0,0,0,0.05)'; path(g, pk); g.fill(); line(pk, 'rgba(0,0,0,0.3)', 2.5); stitch(pk.map(([x, y]) => [X(0.25) + (x - X(0.25)) * 0.95, y + 5]));
      for (const [a, b] of [[pk[1], pk[2]], [pk[5], pk[6]]]) { line([a, b], 'rgba(0,0,0,0.6)', 6); stitch([[a[0] + (a[0] < X(0.25) ? 9 : -9), a[1] + 3], [b[0] + (a[0] < X(0.25) ? 9 : -9), b[1] - 3]]); }   // the hand openings
      // the hood: a seam over its crown, the hem of the face opening (the cord's channel), and the dark inside
      line([[HX(0.5), HY(0)], [HX(0.5), HY(0.6)]], 'rgba(0,0,0,0.3)', 2.5); stitch([[HX(0.5) + 7, HY(0)], [HX(0.5) + 7, HY(0.6)]]);
      stitch([[HX(0), HY(0.685)], [HX(1), HY(0.685)]]); line([[HX(0), HY(0.75)], [HX(1), HY(0.75)]], 'rgba(0,0,0,0.25)', 3);
      const gr = g.createLinearGradient(0, HY(0.75), 0, HY(1)); gr.addColorStop(0, 'rgba(0,0,0,0.12)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)'); g.fillStyle = gr; g.fillRect(HX(0), HY(1), HX(1) - HX(0), HY(0.75) - HY(1));
      g.fillStyle = dark ? '#d9d6cf' : '#f1efe9'; g.fillRect(X(0.975), ySl - 2, W, ySh - ySl + 4); g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1.5; for (let y = ySl; y < ySh; y += 5) { g.beginPath(); g.moveTo(X(0.975), y); g.lineTo(W, y + 4); g.stroke(); }
      g.fillStyle = '#9a9ba1'; g.fillRect(X(0.975), ySh - 46, W, 48);
      for (const u of [0.25 - 0.3 / 6.283, 0.25 + 0.3 / 6.283]) { g.fillStyle = '#b9bac0'; g.beginPath(); g.arc(X(u), yR + 16, 5.5, 0, 7); g.fill(); g.fillStyle = '#17181c'; g.beginPath(); g.arc(X(u), yR + 16, 2.6, 0, 7); g.fill(); } }
    if (leather) {
      for (const sm of seams) { line(sm, 'rgba(0,0,0,0.42)', 2.5); stitch(sm.map(([x, y]) => [x + (sm[0][0] === sm[1][0] ? 6 : 0), y + (sm[0][0] === sm[1][0] ? 0 : 6)])); }
      for (const z of zips) { line(z, 'rgba(0,0,0,0.6)', 9); g.setLineDash([2.5, 2]); line(z, '#b4b7bf', 3.6); g.setLineDash([]); g.fillStyle = '#c9ccd2'; g.fillRect(z[1][0] - 3, z[1][1] - 3, 6, 11); }
      stitch([[X(0.787), Y(0.64)], [X(0.787), Y(0.98)]]); stitch([[X(0.775), Y(0.64)], [X(0.775), Y(0.98)]]);   // the lapel's free edge
      g.fillStyle = '#b9bcc4'; g.beginPath(); g.arc(X(0.755), Y(0.9), 7, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(X(0.755), Y(0.9), 3, 0, 7); g.fill();   // its snap
      for (const o of [0, 7]) stitch([[X(0.816) + o, Y(0.66)], [X(0.816) + o, Y(0.955) + o], [X(0.964) - o, Y(0.955) + o], [X(0.964) - o, Y(0.66)]]); }
    if (v.decal && v.brand) { const cmx = W / D.circ; for (const [k, u0] of [['f', 0.25], ['b', 0.75]]) { const d = v.decal[k]; if (d) brandLogo(g, v.brand, X(u0) + d[0] * cmx, Y(TV(GEAR.neck - d[1])), d[2] * cmx, ink, d[2] < 12 ? 'mark' : 'stack'); } }
    if (C.fab === 'mesh') { g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; const y0 = yR + 5, y1 = Y(TV(C.hem + 2.4)); let o = 0; for (let y = y0; y < y1; y += 8.5, o ^= 1) for (let x = o * 5; x < W; x += 10) { g.beginPath(); g.arc(x, y, 3.1, 0, 7); g.fill(); } g.globalCompositeOperation = 'source-over'; }
  }));
  const nmap = GEAR['tn_' + v.cut] || (GEAR['tn_' + v.cut] = (() => {
    const c = document.createElement('canvas'); c.width = W / 2; c.height = H / 2; const g = c.getContext('2d'); g.scale(0.5, 0.5); g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); g.lineCap = 'round'; g.lineJoin = 'round';
    const ridge = (pts, w, a, dk) => { for (const f of [1, 0.6, 0.3]) { g.strokeStyle = `rgba(${dk ? '0,0,0' : '255,255,255'},${a})`; g.lineWidth = w * f; path(g, pts); g.stroke(); } }, R = wRng(11);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * (fleece ? 0.028 : leather ? 0.04 : 0.022)})`; g.fillRect(R() * W, R() * H, 2, 2); }
    if (C.fab === 'rib') ribs(g, 0, y6, W, H, 0.25);
    const k = fleece ? 1.25 : 1, kw = leather ? 0.6 : 1, zw = Math.max(C.hem + 8, 104);   // (leather creases: fewer, sharper)
    for (const u0 of [0, 0.5, 1]) for (let i = 0; i < (leather ? 4 : 6); i++) { const z = zw + i * (leather ? 5 : 3.4) + R() * 2, sl = (R() - 0.5) * 5; ridge([[X(u0 - 0.13), Z(z + sl + 3)], [X(u0 - 0.05), Z(z + sl * 0.4)], [X(u0 + 0.05), Z(z - sl * 0.4)], [X(u0 + 0.13), Z(z - sl + 3)]], 16 * k * kw, 0.07 * k); }   // the waist gathers at the sides
    for (const [u0, sg] of [[0.07, 1], [0.43, -1], [0.57, 1], [0.93, -1]]) for (let i = 0; i < 4; i++) ridge([[X(u0 - sg * 0.02), Z(D.zC + 1 - i * 2.5)], [X(u0 + sg * 0.05), Z(D.zC - 4 - i * 3.5)], [X(u0 + sg * (0.11 + R() * 0.03)), Z(D.zC - 7 - i * 4.5)]], 18 * k * kw, 0.05);   // pulls from the armpits
    if (C.hem < 110 && !leather) for (let i = 0; i < 9; i++) { const u = (i < 5 ? 0.13 : 0.63) + R() * 0.24, z = 112 + R() * 14; ridge([[X(u), Z(z)], [X(u + (R() - 0.5) * 0.03), Z(z - 9)], [X(u + (R() - 0.5) * 0.05), Z(Math.max(C.hem + 3, z - 20))]], 30 * k, 0.04); }   // long drapes off the chest and the shoulder blades
    if (!leather) { ridge([[0, yR], [W, yR]], 6, 0.3, 1); ribs(g, 0, y6, W, yR, 0.3); }
    if (C.band) { const yb = Z(C.hem + C.band); ribs(g, 0, yb, W, H, 0.3); ridge([[0, yb], [W, yb]], 6, 0.3, 1); ridge([[0, yb - 13], [W, yb - 13]], 24, 0.07);   // the body blouses over the rib band and gathers into it in small pleats
      for (let i = 0; i < 46; i++) { const x = R() * W, l = 12 + R() * 30; ridge([[x, yb - 3], [x + (R() - 0.5) * 9, yb - 3 - l]], 9, 0.07); } }
    else ridge([[0, Z(C.hem + 2.2)], [W, Z(C.hem + 2.2)]], 5, 0.25, 1);
    if (C.sl) { const ym = Y(0.8), hh = ySh - ySl, yc = Y(0.71);
      for (let i = 0; i < 5; i++) { const x = XS(2 + i * 2.6); ridge([[x, ym - hh * 0.22], [x + 8, ym], [x, ym + hh * 0.22]], 12 * k * kw, 0.05); }   // under the arm
      if (C.sl > 40) { const xe = XS(D.L1);
        for (let i = 0; i < (leather ? 4 : 6); i++) { const x = xe + (i - 2.5) * (leather ? 15 : 10) + R() * 5, q = hh * (0.14 + R() * 0.1), b = 5 + R() * 7; ridge([[x - b, yc - q], [x + b * 0.4, yc - q * 0.4], [x + b, yc], [x + b * 0.4, yc + q * 0.5], [x - b, yc + q]], 11 * k * kw, 0.1); }   // creases in the crook of the elbow (short arcs, not rings: rings read as a quilted puffer)
        for (let i = 0; i < 4; i++) { const x = XS(D.L1 + 4 + i * 4.5 + R() * 2), y = ySl + hh * (0.1 + R() * 0.8), l = 22 + R() * 30; ridge([[x, y], [x + l, y + (R() - 0.5) * hh * 0.3]], 18 * k * kw, 0.045); }   // the forearm: long soft twists
        for (let i = 0; i < 3; i++) { const x = XS(9 + i * 6 + R() * 3), y = ySl + hh * (0.15 + R() * 0.7); ridge([[x, y], [x + 34, y + (R() - 0.5) * hh * 0.35]], 20 * k * kw, 0.04); } }
      if (C.cuff) { const x = XS(C.sl - C.cuff); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; for (let y = ySl; y < ySh; y += 5) { g.beginPath(); g.moveTo(x, y); g.lineTo(X(0.6), y); g.stroke(); } ridge([[x, ySl], [x, ySh]], 6, 0.3, 1);
        for (let i = 0; i < 16; i++) { const y = ySl + R() * hh, l = 10 + R() * 28; ridge([[x - 3, y], [x - 3 - l, y + (R() - 0.5) * 8]], 8, 0.08); } }   // pleats into the cuff
      else ridge([[XS(C.sl - 2), ySl], [XS(C.sl - 2), ySh]], 5, 0.25, 1);
      ridge([[0, ym], [X(0.6), ym]], 5, 0.2, 1); }
    if (C.hood) { ridge(pk, 6, 0.3, 1); for (const [a, b] of [[pk[1], pk[2]], [pk[5], pk[6]]]) ridge([a, b], 9, 0.4, 1);
      ridge([[HX(0.5), HY(0)], [HX(0.5), HY(0.6)]], 4, 0.2, 1); ridge([[HX(0), HY(0.685)], [HX(1), HY(0.685)]], 5, 0.25, 1);
      for (let i = 0; i < 4; i++) { const t = 0.1 + i * 0.1 + R() * 0.03, d = 0.05 + R() * 0.04; ridge([[HX(0.2 + R() * 0.08), HY(t + d)], [HX(0.5), HY(t)], [HX(0.8 - R() * 0.08), HY(t + d)]], 26, 0.06); }   // the bag sags in smiles
      for (let i = 0; i < 8; i++) { const u = 0.08 + R() * 0.84; ridge([[HX(u), HY(0.5)], [HX(u + (R() - 0.5) * 0.06), HY(0.66)]], 14, 0.06); }
      for (let y = ySl; y < ySh; y += 5) { g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(0.975), y); g.lineTo(W, y + 4); g.stroke(); } }
    if (leather) { for (const sm of seams) ridge(sm, 6, 0.3, 1); for (const z of zips) { ridge(z, 12, 0.3, 1); ridge(z, 4, 0.5); }
      ridge([[X(0.787), Y(0.64)], [X(0.787), Y(0.98)]], 4, 0.3, 1); ridge([[X(0.816), Y(0.66)], [X(0.816), Y(0.955)], [X(0.964), Y(0.955)], [X(0.964), Y(0.66)]], 4, 0.3, 1); }
    return heightToNormal(c, 6);
  })());
  return { map, nmap };
}
/* the plate carrier's atlas (see topGeo): cordura, MOLLE webbing (rows of 25 mm tape bar-tacked every 38 mm), pouch flaps, velcro + the brand */
function vestTex(v) {
  const W = 1024, H = 1024, RF = [0.02, 0.02, 0.6, 0.6], RB = [0.62, 0.02, 0.98, 0.45], RC = [0.02, 0.64, 0.6, 0.8], RS = [0.02, 0.84, 0.6, 0.94];
  const PX = (r, u) => lerp(r[0], r[2], u) * W, PY = (r, t) => (1 - lerp(r[1], r[3], t)) * H;
  const molle = (r, rowsV, nb) => { const o = []; for (const t of rowsV) o.push({ x0: PX(r, 0.05), x1: PX(r, 0.95), y0: PY(r, t + rowsV.h), y1: PY(r, t), nb }); return o; };
  const rowsOf = (a, b, h, gap) => { const o = []; for (let t = a; t + h <= b + 1e-6; t += h + gap) o.push(t); o.h = h; return o; };
  const tapes = [...molle(RF, rowsOf(0.47, 0.54, 0.055, 0.03), 7), ...molle(RF, rowsOf(0.79, 0.95, 0.055, 0.03), 5), ...molle(RB, rowsOf(0.08, 0.8, 0.075, 0.045), 7), ...molle(RC, rowsOf(0.12, 0.9, 0.2, 0.09), 8)];
  const pouches = [0.2, 0.5, 0.8].map(c => ({ x0: PX(RF, c - 0.1325), x1: PX(RF, c + 0.1325), y0: PY(RF, 0.44), y1: PY(RF, 0.05) }));
  const vel = { x0: PX(RF, 0.19), x1: PX(RF, 0.81), y0: PY(RF, 0.76), y1: PY(RF, 0.56) }, velB = { x0: PX(RB, 0.3), x1: PX(RB, 0.7), y0: PY(RB, 0.74), y1: PY(RB, 0.52) }, drag = { x0: PX(RB, 0.35), x1: PX(RB, 0.65), y0: PY(RB, 0.93), y1: PY(RB, 0.84) };
  const map = GEAR['tt_' + v.key] || (GEAR['tt_' + v.key] = canvasTex(W, H, g => {
    const dk = a => `rgba(0,0,0,${a})`, lt = a => `rgba(255,255,255,${a})`, lite = wLum(v.c) > 0.3, thr = lite ? dk(0.35) : lt(0.14);
    g.fillStyle = v.c; g.fillRect(0, 0, W, H); if (v.pat) camoPaint(g, W, H, 1.2);
    for (let i = 0; i < 30000; i++) { g.fillStyle = (rr() < 0.5 ? dk : lt)(rr() * 0.07); g.fillRect(rr() * W, rr() * H, 2, 1.2); }
    g.strokeStyle = dk(0.05); g.lineWidth = 1; for (let x = -H; x < W; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + H, H); g.stroke(); }   // the weave
    const rect = (q, c) => { g.fillStyle = c; g.fillRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0); }, frame = (q, c, w, d = 0) => { g.strokeStyle = c; g.lineWidth = w; g.strokeRect(q.x0 + d, q.y0 + d, q.x1 - q.x0 - 2 * d, q.y1 - q.y0 - 2 * d); };
    const dash = (q, d) => { g.setLineDash([4, 3]); frame(q, thr, 1.5, d); g.setLineDash([]); };
    for (const r of [RF, RB]) { const q = { x0: PX(r, 0), x1: PX(r, 1), y0: PY(r, 1), y1: PY(r, 0) }; frame(q, dk(0.3), 22); dash(q, 16); }   // binding tape round the bags
    for (const t of tapes) { rect(t, lt(lite ? 0.06 : 0.045)); rect({ x0: t.x0, x1: t.x1, y0: t.y1 - 3, y1: t.y1 + 4 }, dk(0.4)); rect({ x0: t.x0, x1: t.x1, y0: t.y0 - 1, y1: t.y0 + 2 }, lt(0.07));
      for (let i = 0; i <= t.nb; i++) { const x = lerp(t.x0, t.x1, i / t.nb); rect({ x0: x - 2.5, x1: x + 2.5, y0: t.y0, y1: t.y1 }, dk(0.45)); } }
    for (const q of pouches) { rect(q, dk(0.1)); frame(q, dk(0.45), 3); const yf = lerp(q.y0, q.y1, 0.4); rect({ x0: q.x0, x1: q.x1, y0: q.y0, y1: yf }, dk(0.1)); rect({ x0: q.x0, x1: q.x1, y0: yf, y1: yf + 5 }, dk(0.5)); dash({ x0: q.x0, x1: q.x1, y0: q.y0, y1: yf }, 6);
      const xm = (q.x0 + q.x1) / 2; rect({ x0: xm - 9, x1: xm + 9, y0: yf - 4, y1: yf + 20 }, dk(0.55)); rect({ x0: xm - 9, x1: xm + 9, y0: yf + 14, y1: yf + 16 }, lt(0.2)); }
    for (const q of [vel, velB]) { rect(q, dk(0.28)); for (let i = 0; i < 2500; i++) { g.fillStyle = (rr() < 0.5 ? dk : lt)(rr() * 0.08); g.fillRect(lerp(q.x0, q.x1, rr()), lerp(q.y0, q.y1, rr()), 1.5, 1.5); } dash(q, 4); }
    if (v.brand) { brandLogo(g, v.brand, (vel.x0 + vel.x1) / 2, (vel.y0 + vel.y1) / 2, (vel.x1 - vel.x0) * 0.78, '#cfd0cb', 'stack'); brandLogo(g, v.brand, (velB.x0 + velB.x1) / 2, (velB.y0 + velB.y1) / 2, (velB.y1 - velB.y0) * 0.8, '#cfd0cb', 'mark'); }
    rect(drag, dk(0.3)); dash(drag, 3);
    // straps: tape with stitched edges, a box-X at each end, a ladder buckle at the front
    const s0 = { x0: PX(RS, 0), x1: PX(RS, 1), y0: PY(RS, 1), y1: PY(RS, 0) }; rect(s0, dk(0.12)); dash(s0, 5);
    for (const t of [0.06, 0.9]) { const q = { x0: PX(RS, t), x1: PX(RS, t + 0.05), y0: s0.y0 + 8, y1: s0.y1 - 8 }; dash(q, 0); g.strokeStyle = thr; g.lineWidth = 1.5; g.beginPath(); g.moveTo(q.x0, q.y0); g.lineTo(q.x1, q.y1); g.moveTo(q.x1, q.y0); g.lineTo(q.x0, q.y1); g.stroke(); }
    rect({ x0: PX(RS, 0.2), x1: PX(RS, 0.235), y0: s0.y0 + 4, y1: s0.y1 - 4 }, '#141518'); rect({ x0: PX(RS, 0.212), x1: PX(RS, 0.223), y0: s0.y0 + 10, y1: s0.y1 - 10 }, lt(0.12));
    const cq = { x0: PX(RC, 0), x1: PX(RC, 1), y0: PY(RC, 1), y1: PY(RC, 0) }; dash(cq, 4);
  }));
  const nmap = GEAR.tn_vest || (GEAR.tn_vest = (() => {
    const c = document.createElement('canvas'); c.width = W / 2; c.height = H / 2; const g = c.getContext('2d'); g.scale(0.5, 0.5); g.fillStyle = '#707070'; g.fillRect(0, 0, W, H); const R = wRng(5);
    for (let i = 0; i < 12000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * 0.05})`; g.fillRect(R() * W, R() * H, 2.5, 2); }
    const rect = (q, c2, d = 0) => { g.fillStyle = c2; g.fillRect(q.x0 + d, q.y0 + d, q.x1 - q.x0 - 2 * d, q.y1 - q.y0 - 2 * d); };
    for (const t of tapes) { rect(t, '#a8a8a8'); for (let i = 0; i <= t.nb; i++) { const x = lerp(t.x0, t.x1, i / t.nb); rect({ x0: x - 3, x1: x + 3, y0: t.y0, y1: t.y1 }, '#606060'); } }
    for (const q of pouches) { rect(q, '#909090', 3); rect({ x0: q.x0, x1: q.x1, y0: q.y0, y1: lerp(q.y0, q.y1, 0.4) }, '#b4b4b4', 3); const xm = (q.x0 + q.x1) / 2, yf = lerp(q.y0, q.y1, 0.4); rect({ x0: xm - 9, x1: xm + 9, y0: yf - 4, y1: yf + 20 }, '#d0d0d0'); }
    rect(vel, '#8c8c8c'); rect(velB, '#8c8c8c'); rect(drag, '#b8b8b8');
    rect({ x0: PX(RS, 0.2), x1: PX(RS, 0.235), y0: PY(RS, 1) + 4, y1: PY(RS, 0) - 4 }, '#d8d8d8');
    return heightToNormal(c, 5);
  })());
  return { map, nmap };
}
function topMesh(F, v, host, U0) {
  const geo = topGeo(F, v.cut), { map, nmap } = topTex(v, geo), C = TOP_CUTS[v.cut], fl = C.fab === 'fleece', le = C.fab === 'leather', ns = fl ? 1.1 : le ? 1 : 0.85;
  const mat = new THREE.MeshPhysicalMaterial({ map, normalMap: nmap, normalScale: new THREE.Vector2(ns, ns), roughness: le ? 0.5 : fl ? 0.96 : 0.9, sheen: le ? 0 : fl ? 0.45 : C.rig ? 0.1 : 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(v.c).multiplyScalar(1.3),
    clearcoat: le ? 0.3 : 0, clearcoatRoughness: 0.42, side: THREE.DoubleSide, envMapIntensity: le ? 0.9 : 0.5, alphaTest: C.fab === 'mesh' ? 0.5 : 0 });   // leather: a waxed, slightly glossy hide (a clear coat over a rougher base)
  const U = U0 || { uSwA: { value: new V3() }, uSwB: { value: new V3() } }, zip = C.open ? 1 : 0;
  mat.onBeforeCompile = s => { Object.assign(s.uniforms, U);
    s.vertexShader = 'attribute vec2 aSw; attribute float aCut; varying float vCut; varying float vZc; uniform vec3 uSwA; uniform vec3 uSwB;\n' + s.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n transformed += aSw.x * uSwA + aSw.y * uSwB; vCut = aCut; vZc = position.z;');
    s.fragmentShader = 'varying float vCut; varying float vZc;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if ( vCut < 0.0 ) discard;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= 1.0 - 0.2 * smoothstep( 1.5, 1.1, vCut ); diffuseColor.a = max( diffuseColor.a, smoothstep( 1.5, 1.1, vCut ) );'   // the binding of an armhole: a darker, solid band along the cut
        + (zip ? '\n diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.66, 0.67, 0.7 ), vec3( 0.16 ), step( 0.5, fract( vZc * 1.7 ) ) ), smoothstep( 0.62, 0.5, vCut ) );' : '')); };   // an open jacket: the zip's teeth run along the edge
  mat.customProgramCacheKey = () => 'top' + zip;
  const m = new THREE.SkinnedMesh(geo, mat); m.bind(F.body.skeleton, F.body.bindMatrix); m.frustumCulled = false; m.castShadow = m.receiveShadow = true;
  if (host) host.add(m); else { F.body.parent.add(m); m.position.copy(F.body.position); m.quaternion.copy(F.body.quaternion); m.scale.copy(F.body.scale); }
  let D = geo.userData;
  if (C.under) {   // what is worn under it: a second mesh on the same springs; the body's skin is hidden by that one
    const u = topMesh(F, { cut: C.under, key: v.key + '_u', c: v.uc || (wLum(v.c) > 0.45 ? '#1b1c20' : '#e6e3dc') }, m, U), uD = u.userData.D; mat.addEventListener('dispose', () => u.material.dispose());
    D = { ...D, skinHi: uD.skinHi, skinLo: Math.min(D.skinLo, uD.skinLo), skinA: C.rig ? uD.skinA : Math.max(D.skinA, uD.skinA) }; }
  m.userData = { U, D, sway: [C.rig ? 0 : le ? 0.5 : C.fit > 1 ? 1.3 : 0.9, C.hood ? 1.5 : 0] };
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
  jacket: { cat: 'top', label: 'косуха', model: { cut: 'jacket' }, colors: ['black', 'brown', 'wine'], nat: wNat({ black: '#151517', brown: '#4b2e1c', wine: '#4a1220' }, { black: { uc: '#e6e3dc' }, brown: { uc: '#e6e3dc' }, wine: { uc: '#1b1c20' } }), price: 1800, tags: ['street'], brand: 'AFTERHOURS' },   // uc: the tee under it
  vest: { cat: 'top', label: 'бронежилет', model: { cut: 'vest', uc: '#1b1c20' }, colors: ['black', 'olive', 'sand', 'camo'], nat: wNat({ black: '#1e1f22', olive: '#4c4e38' }, { black: { uc: '#6c6e73' } }), price: 1200, tags: ['street'], brand: 'BLACKOUT SUPPLY' },
});
for (const k in ITEMS) ITEMS[k].id = k;   // (the items above replace objects that already had their id)
