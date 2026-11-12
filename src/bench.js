// KO bench: N knockouts, ragdoll only, sensors every 120 Hz substep. Usage: __bench(N, {seed0, secs, punches})
window.__bench = (N, o = {}) => {
  const g = window.__g, { P1, P2, G, PUNCH, THREE } = g, V3 = THREE.Vector3, Q = THREE.Quaternion;
  const names = o.punches || Object.keys(PUNCH), secs = o.secs || 6, out = [], T0 = performance.now();
  const sph = new V3(), tmp = new V3(), qq = new Q();
  for (let n = 0; n < N; n++) {
    let s = (o.seed0 || 1000) + n * 7919; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    g.startFight(); G.state = 'fight'; G.introT = 9; g.AI.t = 99; P2.startDodge = () => {};
    window.__tick(5 + (Math.random() * 40 | 0), 1 / 60); g.AI.t = 99;
    const name = names[n % names.length], P = PUNCH[name], att = P1, def = P2, fwd = Math.sign(def.group.position.x - att.group.position.x);
    const dir = new V3(fwd, 0.15, 0);
    if (P.type === 'hook') dir.copy(tmp.set(P.arm === 'L' ? -1 : 1, 0.1, 0.35).transformDirection(att.group.matrixWorld));
    else if (P.type === 'upper') dir.set(fwd * 0.4, 1, 0); else if (P.type === 'over') dir.set(fwd, -0.45, 0);
    dir.normalize();
    def.lastContact = def.headNow.clone().add(new V3(-fwd * 0.09, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.08));
    const power = o.power != null ? o.power : 0.5 + Math.random() * 1.0; def.hp = 0;
    g.knockout(att, def, dir, power, name, fwd);
    const R = def.rag, D = R.defs, nb = D.length, grp = def.group;
    const st = { name, power: +power.toFixed(2), prof: R.prof.fall + ':' + (R.prof.stiff ? 'stiff' : 'floppy') + (R.prof.fence ? '+fence' : '') + (R.prof.seizure ? '+seiz' : ''),
      pen: {}, penT: {}, sep: {}, viol0: {}, osc: {}, over: {}, overT: 0, spine: 0, decay: null, pops: [], jumps: {}, vmax: {}, headHit: null, pelvisDown: null, rest: 0, nan: false, ke: [], minY: {} };
    const oscS = [], vPrev = new Float32Array(nb), pre = D.map(() => new V3());
    const p0 = grp.localToWorld(new V3().copy(D[0].body.position));
    let k = 0;
    const origProject = R.project;
    R.project = function () {
      for (let i = 0; i < nb; i++) { const b = D[i].body.position; pre[i].set(b.x, b.y, b.z); }
      if (!o.noProj) origProject.call(R);
      for (let i = 1; i < nb; i++) { const d = D[i]; if (!d.p) continue; const P = d.p.body, C = d.body;
        const a = tmp.set(d.pa.x, d.pa.y, d.pa.z).applyQuaternion(qq.set(P.quaternion.x, P.quaternion.y, P.quaternion.z, P.quaternion.w)).add(sph.set(P.position.x, P.position.y, P.position.z)).clone();
        const b = tmp.set(d.off.x, d.off.y, d.off.z).applyQuaternion(qq.set(C.quaternion.x, C.quaternion.y, C.quaternion.z, C.quaternion.w)); b.x += C.position.x; b.y += C.position.y; b.z += C.position.z;
        const sep = a.distanceTo(b); if (sep > (st.sep[d.key] || 0)) st.sep[d.key] = +sep.toFixed(3); }
      const t = k / 120; k++;
      if (k === 1 || k === 60) { for (const lc of (R.world.constraints || [])) if (lc.d && lc.equations) { lc.update(); lc.equations.forEach((e, ax) => { if (e.enabled && e.g < -0.02) { const kk = lc.d.key + 'FST'[ax] + (k === 1 ? '@0' : '@.5'); st.viol0[kk] = Math.max(st.viol0[kk] || 0, +(-e.g * 57.3).toFixed(0)); } }); } }
      let KE = 0;
      for (let i = 0; i < nb; i++) {
        const d = D[i], b = d.body, bp = b.position;
        if (!isFinite(bp.x + bp.y + bp.z)) st.nan = true;
        const jump = tmp.set(bp.x, bp.y, bp.z).distanceTo(pre[i]); if (jump > 0.01) st.jumps[d.key] = Math.max(st.jumps[d.key] || 0, +jump.toFixed(3));
        let bot = 1e9;
        for (let j = 0; j < b.shapes.length; j++) {
          const off = b.shapeOffsets[j]; sph.set(off.x, off.y, off.z).applyQuaternion(qq.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)); sph.x += bp.x; sph.y += bp.y; sph.z += bp.z;
          bot = Math.min(bot, sph.y - b.shapes[j].radius);
        }
        st.minY[d.key] = Math.min(st.minY[d.key] ?? 9, bot);
        if (-bot > (st.pen[d.key] || 0)) { st.pen[d.key] = +(-bot).toFixed(4); st.penT[d.key] = +t.toFixed(2); }
        const v = b.velocity, sp = Math.hypot(v.x, v.y, v.z);
        if (t > 0.25 && sp - vPrev[i] > 0.9) st.pops.push([d.key, +t.toFixed(3), +(sp - vPrev[i]).toFixed(2), +sp.toFixed(2), +bot.toFixed(3)]);
        if (t > 0.25) st.vmax[d.key] = Math.max(st.vmax[d.key] || 0, +sp.toFixed(2));
        if (d.key === 'head' && !st.headHit && bot < 0.004) st.headHit = { t: +t.toFixed(2), vy: +(v.y).toFixed(2), sp: +vPrev[i].toFixed(2) };
        if (d.key === 'pelvis' && !st.pelvisDown && bp.y < 0.25) st.pelvisDown = +t.toFixed(2);
        if (o.trace && d.key === o.trace2 && t > (o.t0 || 0.2) && t < (o.t1 || 0.7)) { const c = window.__jointGeo(d, d.p.body.quaternion, d.body.quaternion); (st.ang = st.ang || []).push([+t.toFixed(3), ...c.map(x => +(x * 57.3).toFixed(1))]); }
        if (o.trace && (d.key === o.trace || d.key === o.trace2) && t > (o.t0 || 0.2) && t < (o.t1 || 0.7)) (st.trace = st.trace || []).push([d.key, +t.toFixed(3), +bot.toFixed(3), +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), +Math.hypot(b.angularVelocity.x, b.angularVelocity.y, b.angularVelocity.z).toFixed(1), b.contact | 0]);
        vPrev[i] = sp; const w = b.angularVelocity, I = b.inertia;
        KE += 0.5 * b.mass * sp * sp + 0.5 * (I.x * w.x * w.x + I.y * w.y * w.y + I.z * w.z * w.z);
      }
      if (KE > 0.6) st.rest = +t.toFixed(2);
      if (st.pelvisDown && st.decay == null && t > st.pelvisDown && KE < 3) st.decay = +(t - st.pelvisDown).toFixed(2);
      // rubber sensors: joint oscillation (flex-rate sign flips with real amplitude), overshoot past the soft range, spine bend
      if (t > 0.25) for (let i = 1; i < nb; i++) {
        const d = D[i]; if (!d.p) continue; const P = d.p.body, C = d.body;
        const qd = qq.set(P.quaternion.x, P.quaternion.y, P.quaternion.z, P.quaternion.w).multiply(new Q().copy(d.qPbind).invert());
        const n = tmp.copy(d.ax[0]).applyQuaternion(qd), w = (C.angularVelocity.x - P.angularVelocity.x) * n.x + (C.angularVelocity.y - P.angularVelocity.y) * n.y + (C.angularVelocity.z - P.angularVelocity.z) * n.z;
        const o = oscS[i] || (oscS[i] = { s: 0, pk: 0 });
        if (Math.abs(w) > o.pk) o.pk = Math.abs(w);
        const sg = w > 0.4 ? 1 : w < -0.4 ? -1 : 0;
        if (sg && o.s && sg !== o.s) { if (o.pk > 1.5) st.osc[d.key] = (st.osc[d.key] || 0) + 1; o.pk = 0; }
        if (sg) o.s = sg;
        const c = window.__jointGeo(d, P.quaternion, C.quaternion);
        for (let a = 0; a < 3; a++) { if (c[a] !== c[a]) continue; const L = d.lim[a], ex = Math.max(c[a] - L[1], L[0] - c[a]); if (ex > 0) { const kk = d.key + 'FST'[a]; st.over[kk] = Math.max(st.over[kk] || 0, +(ex * 57.3).toFixed(0)); st.overT += 1 / 120; } }
        if (d.key === 'chest') { const cw = window.__jointGeo(R.by.waist, R.by.pelvis.body.quaternion, R.by.waist.body.quaternion); st.spine = Math.max(st.spine, Math.abs((c[0] + cw[0]) * 57.3)); }
      }
      if (k % 12 === 0) st.ke.push(+KE.toFixed(1));
    };
    if (o.iters) R.world.solver.iterations = o.iters;
    if (o.hz) { const h = 1 / o.hz; R.step = function (dt) { this.t += dt; this.placeObstacle(); this.acc = (this.acc || 0) + dt; while (this.acc >= h) { this.muscles(); this.world.step(h); this.project(); this.acc -= h; } }; }
    for (let f = 0; f < secs * 60; f++) { R.step(1 / 60); }
    delete R.step;
    delete R.project;
    R.apply(); def.cc.updateMatrixWorld(true);
    // final pose
    const pel = grp.localToWorld(new V3().copy(D[0].body.position)), dp = pel.clone().sub(p0);
    const ch = R.by.chest, qc = new Q(ch.body.quaternion.x, ch.body.quaternion.y, ch.body.quaternion.z, ch.body.quaternion.w).multiply(ch.qBind.clone().invert());
    const fz = new V3(0, 0, 1).applyQuaternion(qc).transformDirection(grp.matrixWorld);
    st.fall = { along: +(dp.x * fwd).toFixed(2), side: +dp.z.toFixed(2), face: fz.y > 0.5 ? 'up' : fz.y < -0.5 ? 'down' : 'side', chestY: +R.by.chest.body.position.y.toFixed(2), headY: +R.by.head.body.position.y.toFixed(2) };
    // the visible mesh: lowest skinned vertices (sampled)
    const m = def.body, pa = m.geometry.attributes.position, vv = new V3(); let my = 9, mi = -1;
    for (let i = 0; i < pa.count; i += 5) { m.getVertexPosition(i, vv); m.localToWorld(vv); if (vv.y < my) { my = vv.y; mi = i; } }
    st.meshMinY = +my.toFixed(3);
    { const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight; let bw = -1, bi = 0; for (let c = 0; c < 4; c++) if (sw.getComponent(mi, c) > bw) { bw = sw.getComponent(mi, c); bi = si.getComponent(mi, c); } st.meshMinBone = m.skeleton.bones[bi].name.replace('CC_Base_', ''); }
    for (const kk in st.minY) st.minY[kk] = +st.minY[kk].toFixed(3);
    delete st.ke; out.push(st);
  }
  window.__benchOut = out; return 'ms/KO=' + ((performance.now() - T0) / N).toFixed(0);
};
// summary of window.__benchOut
window.__benchSum = () => {
  const O = window.__benchOut, agg = {}, pops = {}, jumps = {}, sepm = {}, vio = {}, osc = {}, over = {};
  for (const st of O) {
    for (const [k, v] of Object.entries(st.pen)) (agg[k] = agg[k] || []).push(v);
    for (const p of st.pops) pops[p[0]] = (pops[p[0]] || 0) + 1;
    for (const [k, v] of Object.entries(st.jumps)) jumps[k] = Math.max(jumps[k] || 0, v);
    for (const [k, v] of Object.entries(st.sep)) sepm[k] = Math.max(sepm[k] || 0, v);
    for (const [k, v] of Object.entries(st.viol0)) { vio[k] = Math.max(vio[k] || 0, v); }
    for (const [k, v] of Object.entries(st.osc)) osc[k] = (osc[k] || 0) + v;
    for (const [k, v] of Object.entries(st.over)) over[k] = Math.max(over[k] || 0, v);
  }
  const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
  const pen = Object.fromEntries(Object.entries(agg).map(([k, a]) => [k, `p50 ${(pct(a, 0.5) * 100).toFixed(1)} p95 ${(pct(a, 0.95) * 100).toFixed(1)} max ${(Math.max(...a) * 100).toFixed(1)}cm`]));
  const hh = O.filter(s => s.headHit).map(s => -s.headHit.vy), rest = O.map(s => s.rest), pd = O.map(s => s.pelvisDown || 9);
  const face = {}; for (const s of O) face[s.fall.face] = (face[s.fall.face] || 0) + 1;
  const along = O.map(s => s.fall.along), side = O.map(s => s.fall.side), mesh = O.map(s => s.meshMinY);
  return JSON.stringify({ n: O.length, nan: O.filter(s => s.nan).length, pen, popsByBody: pops, popKOs: O.filter(s => s.pops.length).length, oscTotalPerKO: +(Object.values(osc).reduce((a, b) => a + b, 0) / O.length).toFixed(1), osc, overMaxDeg: over, overTimePerKO: +(O.reduce((a, s) => a + s.overT, 0) / O.length).toFixed(2), spineMax: `p50 ${pct(O.map(s => s.spine), 0.5).toFixed(0)} p95 ${pct(O.map(s => s.spine), 0.95).toFixed(0)}`, decayAfterLanding: `p50 ${pct(O.map(s => s.decay ?? 9), 0.5)} p95 ${pct(O.map(s => s.decay ?? 9), 0.95)}`, projJumpMax: jumps, jointSepMax: sepm, hardViolDeg: vio,
    headImpactVy: hh.length ? `n${hh.length} p50 ${pct(hh, 0.5)} p95 ${pct(hh, 0.95)}` : 'none', pelvisDownT: `p50 ${pct(pd, 0.5)} p95 ${pct(pd, 0.95)}`, restT: `p50 ${pct(rest, 0.5)} p95 ${pct(rest, 0.95)} max ${Math.max(...rest)}`,
    face, along: `p5 ${pct(along, 0.05)} p50 ${pct(along, 0.5)} p95 ${pct(along, 0.95)}`, side: `p5 ${pct(side, 0.05)} p50 ${pct(side, 0.5)} p95 ${pct(side, 0.95)}`,
    sitting: O.filter(s => s.fall.chestY > 0.3).length, meshMinY: `p5 ${pct(mesh, 0.05)} p50 ${pct(mesh, 0.5)}` }, null, 0);
};
// debug visualisation: collision spheres (wire) + trails of head, hands, feet, pelvis
window.__viz = (F, noSph) => {
  const g = window.__g, T = g.THREE, R = F.rag, scene = g.scene, V = window.__vz = { F, sph: [], trails: {} };
  const sm = new T.MeshBasicMaterial({ color: 0x00ffaa, wireframe: true, transparent: true, opacity: 0.35, depthTest: false });
  if (!noSph) for (const d of R.defs) for (let i = 0; i < d.body.shapes.length; i++) { const m = new T.Mesh(new T.SphereGeometry(1, 10, 6), sm); m.renderOrder = 9; scene.add(m); V.sph.push([d, i, m]); }
  const cols = { head: 0xff3344, farmL: 0xffcc00, farmR: 0xff8800, footL: 0x33aaff, footR: 0x3366ff, pelvis: 0xffffff };
  for (const k in cols) { const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(3 * 600), 3)); geo.setDrawRange(0, 0);
    const l = new T.Line(geo, new T.LineBasicMaterial({ color: cols[k], depthTest: false })); l.renderOrder = 10; l.frustumCulled = false; scene.add(l); V.trails[k] = { l, n: 0 }; }
};
window.__vizUpdate = () => {
  const V = window.__vz; if (!V) return; const g = V.F.group, R = V.F.rag, T = window.__g.THREE, v = new T.Vector3();
  for (const [d, i, m] of V.sph) { const b = d.body; if (!b || !b.sphere) { m.visible = false; continue; } m.visible = true; b.sphere(i, v); g.localToWorld(v); m.position.copy(v); m.scale.setScalar(b.shapes[i].radius); }
  for (const k in V.trails) { const tr = V.trails[k], b = R.by[k].body; if (!b || !b.position) continue; v.copy(b.position); g.localToWorld(v); const a = tr.l.geometry.attributes.position; if (tr.n < 600) { a.setXYZ(tr.n++, v.x, v.y, v.z); a.needsUpdate = true; tr.l.geometry.setDrawRange(0, tr.n); } }
};
// knock P2 out with a given punch and keep the sim in real time
window.__koSetup = (name, seed, power) => {
  const g = window.__g, T = g.THREE; let s = seed; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  g.startFight(); g.G.state = 'fight'; g.G.introT = 9; g.AI.t = 99; g.P2.startDodge = () => {}; window.__tick(20, 1 / 60); g.AI.t = 99;
  if (window.__shift) { for (const F of [g.P1, g.P2]) { F.mark.x += window.__shift; F.group.position.x += window.__shift; F.group.updateMatrixWorld(true); } window.__tick(6, 1 / 60); g.AI.t = 99; }
  const P = g.PUNCH[name], att = g.P1, def = g.P2, fwd = Math.sign(def.group.position.x - att.group.position.x), dir = new T.Vector3(fwd, 0.15, 0);
  if (P.type === 'hook') dir.set(P.arm === 'L' ? -1 : 1, 0.1, 0.35).transformDirection(att.group.matrixWorld); else if (P.type === 'upper') dir.set(fwd * 0.4, 1, 0); else if (P.type === 'over') dir.set(fwd, -0.45, 0);
  dir.normalize(); def.lastContact = def.headNow.clone().add(new T.Vector3(-fwd * 0.09, 0, 0)); def.hp = 0;
  g.knockout(att, def, dir, power, name, fwd); g.G.slow = 1; g.G.slowT = 0; g.G.hitstop = 0; g.G.koT = 1e9;
  return def.rag.prof ? (def.rag.prof.stiff ? 'stiff' : 'floppy') : (def.doomed ? 'doomed' : 'none');
};
window.__frame30 = (cam) => {
  const g = window.__g; window.__tick(2, 1 / 60); window.__vizUpdate(); g.G.koT = 1e9;
  const c = g.P2.rag.by.pelvis.body, gp = g.P2.group.localToWorld(new g.THREE.Vector3(c.position.x, 0.5, c.position.z));
  g.camera.position.set(gp.x + cam[0], cam[1], gp.z + cam[2]); g.camera.lookAt(gp.x, 0.45, gp.z); g.camera.updateMatrixWorld(); g.composer.render();
};
window.__kdSetup = (type, name, seed, up) => {
  const g = window.__g, T = g.THREE; let s = seed; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  g.startFight(); g.G.state = 'fight'; g.G.introT = 9; g.AI.t = 99; g.P2.startDodge = () => {}; window.__tick(20, 1 / 60); g.AI.t = 99;
  const att = g.P1, def = g.P2, fwd = Math.sign(def.group.position.x - att.group.position.x), dir = new T.Vector3(fwd, 0.15, 0).normalize();
  def.lastContact = def.headNow.clone().add(new T.Vector3(-fwd * 0.09, 0, 0)); window.__kdType = type;
  g.knockdown(att, def, dir, 1.0, name, fwd, 1.4); g.G.kd.up = up; g.G.slow = 1; g.G.slowT = 0; g.G.hitstop = 0;
  return type;
};
window.__frameKD = (cam) => {
  const g = window.__g; window.__tick(2, 1 / 60); window.__vizUpdate && window.__vizUpdate();
  const F = g.P2, c = F.jp[0], gp = c.clone(); gp.y = 0.5;
  g.camera.position.set(gp.x + cam[0], cam[1], gp.z + cam[2]); g.camera.lookAt(gp.x, 0.55, gp.z); g.camera.updateMatrixWorld(); g.composer.render();
  return g.G.state + ' ' + (g.G.kd ? g.G.kd.n : '-') + ' ' + (F.gu ? F.gu.stage : '');
};
// one punch into a standing P2, frames around the impact
window.__hitSetup = (name, seed, block) => {
  const g = window.__g; let s = seed; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  window.__noKD = true; g.startFight(); g.G.state = 'fight'; g.G.introT = 9; g.AI.t = 99; g.P2.startDodge = () => {}; window.__tick(30, 1 / 60);
  if (block) g.AI.blockUntil = 1e9; window.__tick(30, 1 / 60);
  for (let i = 0; i < 200; i++) { g.P2.hp = 90; g.AI.t = 99; if (!block) { g.P2.blocking = false; g.P2.blockW = 0; } if (g.P1.canAct() && !g.P1.cur) g.press('punch', name); const p = g.P1.cur && g.PUNCH[g.P1.cur]; window.__tick(1, 1 / 60); if (g.P1.cur && g.P1.act[g.P1.cur].time > g.PUNCH[g.P1.cur].impact - 0.12) break; }
  g.G.hitstop = 0; return g.P1.cur;
};
window.__frameHit = (cam) => {
  const g = window.__g; g.P2.hp = 90; g.AI.t = 99; if (window.__blk) g.AI.blockUntil = 1e9; window.__tick(1, 1 / 60); g.G.hitstop = 0; g.G.slow = 1;
  const h = g.P2.headNow.clone().lerp(g.P1.headNow, 0.35); g.camera.position.set(h.x + cam[0], h.y + cam[1], h.z + cam[2]); g.camera.lookAt(h.x, h.y - 0.15, h.z); g.camera.updateMatrixWorld(); g.composer.render();
  return (g.P2.rag.world ? g.P2.rag.world.constructor.name : '-') + ' ' + (g.P2.rag.blend || 0).toFixed(2);
};
// replay bench KO #n in real time (same random stream as __bench) for rendering
window.__benchKO = (n, o = {}) => {
  const g = window.__g, { P1, P2, G, PUNCH, THREE } = g, V3 = THREE.Vector3, tmp = new V3();
  const names = o.punches || Object.keys(PUNCH);
  let s = (o.seed0 || 1000) + n * 7919; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  g.startFight(); G.state = 'fight'; G.introT = 9; g.AI.t = 99; P2.startDodge = () => {};
  window.__tick(5 + (Math.random() * 40 | 0), 1 / 60); g.AI.t = 99;
  const name = names[n % names.length], P = PUNCH[name], att = P1, def = P2, fwd = Math.sign(def.group.position.x - att.group.position.x);
  const dir = new V3(fwd, 0.15, 0);
  if (P.type === 'hook') dir.copy(tmp.set(P.arm === 'L' ? -1 : 1, 0.1, 0.35).transformDirection(att.group.matrixWorld));
  else if (P.type === 'upper') dir.set(fwd * 0.4, 1, 0); else if (P.type === 'over') dir.set(fwd, -0.45, 0);
  dir.normalize();
  def.lastContact = def.headNow.clone().add(new V3(-fwd * 0.09, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.08));
  const power = o.power != null ? o.power : 0.5 + Math.random() * 1.0; def.hp = 0;
  g.knockout(att, def, dir, power, name, fwd); G.slow = 1; G.slowT = 0; G.hitstop = 0; G.koT = 1e9;
  return name + ' ' + def.rag.prof.fall + (def.rag.prof.stiff ? ':stiff' : ':floppy');
};
window.__frameRT = (cam, n = 4) => {   // real-time 30 fps: two 1/60 ticks... n ticks of 1/120 to match bench sampling
  const g = window.__g; for (let i = 0; i < n; i++) window.__tick(1, 1 / 120); g.G.slow = 1; g.G.slowT = 0; g.G.koT = 1e9; window.__vizUpdate && window.__vizUpdate();
  const F = g.P2, c = F.jp[0], gp = c.clone(); gp.y = 0.5;
  g.camera.position.set(gp.x + cam[0], cam[1], gp.z + cam[2]); g.camera.lookAt(gp.x, 0.45, gp.z); g.camera.updateMatrixWorld(); g.composer.render();
  const fb = F.rag.by.footR.body; return (F.rag.world ? F.rag.world.t.toFixed(3) : '-') + ' footR v=' + fb.velocity.length().toFixed(2);
};
// collider fit: for every skin vertex, how far it sticks out of the nearest ragdoll sphere (cm), per body
window.__colFit = (F, step = 3) => {
  const g = window.__g, T = g.THREE, R = F.rag, m = F.body, v = new T.Vector3(), c = new T.Vector3(); m.updateMatrixWorld(true);
  const geo = m.geometry, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, n = geo.attributes.position.count, sk = m.skeleton;
  const of = new Map(); for (const d of R.defs) of.set(d.bone, d);
  const bb = sk.bones.map(b => { for (let x = b; x; x = x.parent) if (of.has(x)) return of.get(x); return R.defs[0]; });
  const sph = []; for (const d of R.defs) { const b = d.body; for (let i = 0; i < b.shapes.length; i++) { b.sphere(i, c); sph.push([c.clone(), b.shapes[i].radius, d.key]); } }
  const out = {}, all = [];
  for (let i = 0; i < n; i += step) {
    let bw = -1, bi = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
    m.getVertexPosition(i, v); m.localToWorld(v); F.group.worldToLocal(v);
    let best = 9; for (const [p, r] of sph) best = Math.min(best, v.distanceTo(p) - r);
    const key = bb[bi].key; (out[key] || (out[key] = [])).push(best); all.push(best);
  }
  const q = (a, p) => { a.sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
  const res = {}; for (const k in out) { const a = out[k]; res[k] = 'out p50 ' + (q(a, 0.5) * 100).toFixed(1) + ' p95 ' + (q(a, 0.95) * 100).toFixed(1) + ' max ' + (q(a, 1) * 100).toFixed(1) + ' >2cm ' + (a.filter(x => x > 0.02).length / a.length * 100).toFixed(0) + '%'; }
  res.ALL = '>1cm ' + (all.filter(x => x > 0.01).length / all.length * 100).toFixed(1) + '% >2cm ' + (all.filter(x => x > 0.02).length / all.length * 100).toFixed(1) + '% >4cm ' + (all.filter(x => x > 0.04).length / all.length * 100).toFixed(1) + '%';
  return res;
};

/* ── issue 42: somersault-on-a-punch reproducer ──────────────────────────────────────────────
   window.__flip.run(n): sets up n fights, gives P1 a strong finishing punch (uppercuts, power hooks,
   counter crosses, low-HP knockouts), steps the sim with __tick and measures, at every 120 Hz
   ragdoll substep, how far P2's pelvis/chest leaned from the upright rest pose and their angular
   speed. Tilt is the angle of the body's OWN up-axis from its upright direction — i.e. pitch/roll,
   exactly the issue's «по тангажу или крену»: 0° upright, 90° horizontal, 180° upside-down. A twist
   about the body's own axis does not count (that is not a somersault).
   A "flip" (сальто) = tilt > 120° while genuinely airborne (pelvis & chest > 0.4 m AND pelvis |vy| > 0.8,
   i.e. falling/launched, not a settled fold), or body spin > 12 rad/s.
   Reports a per-punch table plus the flip count and the peak tilts / angular speeds. Debug: o.wMax
   overrides every body's wMax (to replay the old uncapped physics): run(40, { wMax: 30 }). */
window.__flip = {
  out: [],
  SC: [   // the reported offenders first; power is what resolveHit hands to knockout() (clamped 0.2…1.6)
    { name: 'upperR', power: 1.5, note: 'апперкот' },
    { name: 'upperL', power: 1.5, note: 'апперкот' },
    { name: 'hookR', power: 1.5, note: 'силовой хук' },
    { name: 'hookL', power: 1.5, note: 'силовой хук' },
    { name: 'cross', power: 1.6, note: 'кросс в контратаке ×1.5' },
    { name: 'over', power: 1.45, note: 'силовой оверхенд' },
    { name: 'cross', power: 1.35, note: 'малое HP → нокаут' },
    { name: 'jab', power: 1.25, note: 'малое HP → нокаут' },
  ],
  run(n = 40, o = {}) {
    const g = window.__g, { P1, P2, G, PUNCH, THREE } = g, V3 = THREE.Vector3;
    const D2R = Math.PI / 180, secs = o.secs || 3, frames = Math.round(secs * 60), out = [];
    const origRand = Math.random, u1 = new V3(), u2 = new V3();
    const tw = window.__tw || (window.__tw = {}), oldWM = tw.wMax;
    if (o.wMax !== undefined) tw.wMax = o.wMax;
    delete window.__fall; delete window.__koVar;   // clear debug overrides left by other tools
    for (let i = 0; i < n; i++) {
      const sc = this.SC[i % this.SC.length];
      let s = (o.seed0 || 4242) + i * 7919;
      Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };  // deterministic where the game reads Math.random directly
      g.startFight(); G.state = 'fight'; G.introT = 9; G.stareT = 0; g.AI.t = 99; P2.startDodge = () => {};
      window.__tick(5 + (Math.random() * 30 | 0), 1 / 60); g.AI.t = 99;
      const P = PUNCH[sc.name], att = P1, def = P2, fwd = Math.sign(def.group.position.x - att.group.position.x);
      const dir = new V3(fwd, 0.15, 0);
      if (P.type === 'hook') dir.set(P.arm === 'L' ? -1 : 1, 0.1, 0.35).transformDirection(att.group.matrixWorld);
      else if (P.type === 'upper') dir.set(fwd * 0.4, 1, 0);
      else if (P.type === 'over') dir.set(fwd, -0.45, 0);
      dir.normalize();
      def.lastContact = def.headNow.clone().add(new V3(-fwd * 0.09, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.08));
      def.hp = 0;
      const power = clamp(sc.power + (Math.random() - 0.5) * 0.2, 0.3, 1.6);
      g.knockout(att, def, dir, power, sc.name, fwd);
      // clean KO sim: full speed, no freeze, no replay cut (koT pushed far away), no follow-up shots
      G.slow = 1; G.slowT = 0; G.hitstop = 0; G.koT = 1e9;
      const R = def.rag, by = R.by, qb = { pelvis: by.pelvis.qBind, chest: by.chest.qBind };
      const pr = R.prof || {}, st = { n: i, kind: sc.name, note: sc.note, power: +power.toFixed(2), ko: true,
        rag: (R.world ? R.world.constructor.name : '-') + '/' + R.mode,
        fall: R.fall, prof: [pr.stiff && 'stiff', pr.frozen && 'frozen', pr.seizure && 'seiz', pr.fence && 'fence'].filter(Boolean).join('+') || '-',
        maxTilt: 0, maxTiltAir: 0, maxW: 0, flip: false, nan: false };
      const origProject = R.project;
      const sample = () => {
        for (const key of ['pelvis', 'chest']) {
          const b = by[key].body, q = b.quaternion, r = qb[key];
          // lean of the body's up-axis from its upright bind direction: pitch / roll only (twist ignored)
          u1.set(0, 1, 0).applyQuaternion(r);
          u2.set(0, 1, 0).applyQuaternion(q);
          const tilt = Math.acos(Math.max(-1, Math.min(1, u1.dot(u2)))) / D2R;
          const w = Math.hypot(b.angularVelocity.x, b.angularVelocity.y, b.angularVelocity.z);
          if (!isFinite(tilt) || !isFinite(w)) { st.nan = true; continue; }
          if (tilt > st.maxTilt) st.maxTilt = tilt;
          if (w > st.maxW) st.maxW = w;
          // "in the air" = both segments elevated AND the pelvis actually in free fall / launched (|vy| > 0.8).
          // Height alone is not enough: a man crumpled face-down with his hips up is on the canvas (vy≈0) yet his
          // up-axis can read >120° — that is a fold, not a somersault. Only a real airborne tumble has speed here.
          const air = by.pelvis.body.position.y > 0.4 && by.chest.body.position.y > 0.4 && Math.abs(by.pelvis.body.velocity.y) > 0.8;
          if (air && tilt > st.maxTiltAir) st.maxTiltAir = tilt;
        }
      };
      R.project = function () { sample(); if (origProject) origProject.call(this); };
      for (let f = 0; f < frames; f++) window.__tick(1, 1 / 60);
      delete R.project;
      st.maxTilt = +st.maxTilt.toFixed(1); st.maxTiltAir = +st.maxTiltAir.toFixed(1); st.maxW = +st.maxW.toFixed(2);
      st.flip = st.nan || st.maxTiltAir > 120 || st.maxW > 12;
      out.push(st);
    }
    Math.random = origRand;
    if (o.wMax !== undefined) tw.wMax = oldWM;
    window.__flip.out = out;
    const flips = out.filter(r => r.flip), mx = k => Math.max(...out.map(r => r[k]));
    const L = [`FLIP run(${n}): сальто ${flips.length}/${n} | maxTilt ${mx('maxTilt').toFixed(1)}°  maxTiltAir ${mx('maxTiltAir').toFixed(1)}°  maxW ${mx('maxW').toFixed(2)} rad/s  NaN ${out.filter(r => r.nan).length}`,
      'kind      note                      pow   rag          maxTilt  air     maxW    flip'];
    for (const r of out) L.push(r.kind.padEnd(9) + r.note.padEnd(25) + String(r.power).padEnd(6) + r.rag.padEnd(13) +
      String(r.maxTilt).padEnd(9) + String(r.maxTiltAir).padEnd(8) + String(r.maxW).padEnd(8) + (r.flip ? 'FLIP' : '-'));
    return L.join('\n');
  },
};
