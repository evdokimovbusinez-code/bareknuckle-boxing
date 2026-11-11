/* ───────── skin tones, tattoos ─────────
   Tones: the shader part is SKIN_TONE_F in g_pre.js. `c` = plain tint of the light CC textures (the three old tones); `tone` = the
   rebuilt colour (target albedo, sRGB), k = [luminance contrast, chroma kept, palms / soles lightening], palm = their colour.
   Tattoos: designs are drawn once on small canvases, then laid into the man's atlas (one 2048 × 1024 canvas texture: a tile for the
   body, the arm and a part of the head texture — TAT_TILE) triangle by triangle through the mesh's own uv — so a band really goes round the arm
   whatever the uv layout is. Projections are made in the rest pose (skinTemplate). */
const SKIN_TONES = {
  light: { sw: '#e2b79f' }, tan: { sw: '#b98563' },
  olive: { sw: '#a67c52', tone: '#a2744b', k: [1.0, 0.9, 0.3], palm: '#c79f80', sss: [0.72, 0.24, 0.13], rough: 1, cc: 0.08, sheen: 0.15, sheenC: '#ff9b80' },
  brown: { sw: '#7d5234', tone: '#875a3c', k: [1.05, 0.62, 0.55], palm: '#b68765', sss: [0.8, 0.26, 0.13], rough: 0.96, cc: 0.1, sheen: 0.14, sheenC: '#e08a66' },
  dark: { sw: '#5d3a26', tone: '#6a4129', k: [1.08, 0.5, 0.7], palm: '#a87a5c', sss: [0.88, 0.28, 0.14], rough: 0.92, cc: 0.12, sheen: 0.16, sheenC: '#cf8c6c' },
  deep: { sw: '#3c2519', tone: '#4b2e20', k: [1.12, 0.42, 0.85], palm: '#99694f', sss: [0.95, 0.3, 0.15], rough: 0.86, cc: 0.16, sheen: 0.2, sheenC: '#b9907a' },
};
function skinUniforms() {
  return { uTone: { value: new THREE.Vector4(1, 1, 1, 0) }, uToneK: { value: new THREE.Vector4(1, 1, 0, 0) }, uPalmC: { value: new THREE.Color(1, 1, 1) }, uSSS: { value: new V3(0.75, 0.22, 0.13) }, uTat: { value: tatBlank() } };
}
const _skC = new THREE.Color();
function skinApply(F, L) {
  const S = SKIN_LOOKS.find(x => x.id === L.skin) || SKIN_LOOKS[0], K = SKIN_TONES[S.id] || {}, U = F.flesh.u;
  for (const m of F.skinMats) {
    m.color.set(K.tone ? '#ffffff' : S.c);
    m.roughness = m.userData.rough0 * (K.rough || 1); m.clearcoat = K.cc || 0.08; m.sheen = K.sheen || 0.15; m.sheenColor.set(K.sheenC || '#ff9b80');
  }
  if (K.tone) { _skC.set(K.tone); U.uTone.value.set(_skC.r, _skC.g, _skC.b, 1); U.uToneK.value.set(K.k[0], K.k[1], K.k[2], 0); U.uPalmC.value.set(K.palm); U.uSSS.value.fromArray(K.sss); }
  else { U.uTone.value.w = 0; U.uSSS.value.set(0.75, 0.22, 0.13); }
}

/* rest-pose data of the skin mesh: positions / normals in metres, palms + soles mask (attribute aPalm) */
function skinTemplate(body) {
  const g = body.geometry, p = g.attributes.position, nA = g.attributes.normal, bm = body.bindMatrix, nm = new THREE.Matrix3().getNormalMatrix(bm), n = p.count;
  const W = new Float32Array(n * 3), N = new Float32Array(n * 3), v = new V3(), palm = new Float32Array(n);
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i).applyMatrix4(bm).multiplyScalar(0.01); v.toArray(W, 3 * i); v.fromBufferAttribute(nA, i).applyMatrix3(nm).normalize(); v.toArray(N, 3 * i); }
  const bp = name => bpos(name, new V3()), PN = {};
  for (const S of ['L', 'R']) { const fw = bp(`CC_Base_${S}_Mid1`).sub(bp(`CC_Base_${S}_Hand`)), lat = bp(`CC_Base_${S}_Index1`).sub(bp(`CC_Base_${S}_Pinky1`)), pn = fw.cross(lat).normalize(); if (pn.y > 0) pn.negate(); PN[S] = pn; }   // rest pose: palms look down
  const names = body.skeleton.bones.map(b => b.name), kind = names.map(nm2 => /_(Hand|Thumb\d|Index\d|Mid\d|Ring\d|Pinky\d)$/.test(nm2) ? (nm2.includes('_L_') ? 1 : 2) : /(Foot|Toe)/.test(nm2) ? 3 : 0);
  const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  for (let i = 0; i < n; i++) {
    let hl = 0, hR = 0, ft = 0;
    for (let k = 0; k < 4; k++) { const kd = kind[si.getComponent(i, k)], w = sw.getComponent(i, k); if (kd === 1) hl += w; else if (kd === 2) hR += w; else if (kd === 3) ft += w; }
    const pn = hl > hR ? PN.L : PN.R, hw = Math.max(hl, hR);
    palm[i] = Math.max(sstep(0.3, 0.8, hw) * sstep(-0.05, 0.5, N[3 * i] * pn.x + N[3 * i + 1] * pn.y + N[3 * i + 2] * pn.z), sstep(0.5, 0.9, ft) * sstep(-0.3, -0.75, N[3 * i + 1]) * (W[3 * i + 1] < 0.06 ? 1 : 0));
  }
  g.setAttribute('aPalm', new THREE.BufferAttribute(palm, 1));
  const keys = T.matNames.map(nm2 => ({ Std_Skin_Head: 'head', Std_Skin_Body: 'body', Std_Skin_Arm: 'arm' }[nm2] || null));
  T.skinGeo = { W, N, uv: g.attributes.uv.array, ix: g.index.array, groups: g.groups.map(x => ({ ...x })), keys, PN, bp };
}

/* —— tattoo designs (all original) —— */
const INK = '#26343f', INK_RED = '#6e2622';
const TATS = [{ id: 'sleeve', label: 'рукав' }, { id: 'band', label: 'браслет' }, { id: 'chest', label: 'грудь' }, { id: 'back', label: 'спина' }, { id: 'neck', label: 'шея' }, { id: 'ribs', label: 'рёбра' }, { id: 'knuckles', label: 'костяшки' }, { id: 'face', label: 'слеза' }];
function tatCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = g.strokeStyle = INK; g.lineJoin = g.lineCap = 'round'; return [c, g]; }
const TAT_DRAW = {
  // tribal band: eight hooked blades chasing each other round the arm, a line above and below
  band() {
    const [c, g] = tatCanvas(512, 80);
    for (let x = 0; x < 512; x += 64) {
      g.beginPath(); g.moveTo(x, 40); g.bezierCurveTo(x + 14, 8, x + 42, 6, x + 63, 30); g.bezierCurveTo(x + 46, 22, x + 30, 25, x + 20, 42);
      g.bezierCurveTo(x + 32, 36, x + 46, 42, x + 54, 60); g.bezierCurveTo(x + 36, 76, x + 10, 68, x, 40); g.fill();
      g.beginPath(); g.moveTo(x + 34, 14); g.lineTo(x + 40, 3); g.lineTo(x + 46, 15); g.fill(); g.beginPath(); g.moveTo(x + 22, 68); g.lineTo(x + 30, 79); g.lineTo(x + 38, 69); g.fill();
    }
    return c;
  },
  // forearm sleeve: solid cuffs cut by a zigzag, a row of diamonds, then scale-like waves down to the wrist
  sleeve() {
    const [c, g] = tatCanvas(512, 448);
    for (const y of [0, 420]) { g.fillRect(0, y, 512, 28); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 4; g.beginPath(); for (let x = 0; x <= 512; x += 16) g[x ? 'lineTo' : 'moveTo'](x, y + (x / 16 & 1 ? 8 : 20)); g.stroke(); g.globalCompositeOperation = 'source-over'; }
    g.fillRect(0, 36, 512, 5); g.fillRect(0, 407, 512, 5);
    for (let x = 0, k = 0; x < 512; x += 64, k++) {
      g.beginPath(); g.moveTo(x + 32, 50); g.lineTo(x + 62, 96); g.lineTo(x + 32, 142); g.lineTo(x + 2, 96); g.closePath();
      if (k & 1) g.fill(); else { g.lineWidth = 5; g.stroke(); g.beginPath(); g.moveTo(x + 32, 70); g.lineTo(x + 48, 96); g.lineTo(x + 32, 122); g.lineTo(x + 16, 96); g.closePath(); g.fill(); }
      for (let d = 0; d < 3; d++) { g.beginPath(); g.arc(x + (k & 1 ? 0 : 64), 60 + d * 36, 3.2, 0, 6.283); g.fill(); }
    }
    g.fillRect(0, 152, 512, 5);
    for (let row = 0; row < 11; row++) for (let i = -1; i <= 8; i++) {
      const x = i * 64 + (row & 1 ? 32 : 0), y = 196 + row * 21;
      g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(x, y, 33, Math.PI, 0); g.fill(); g.globalCompositeOperation = 'source-over';
      g.lineWidth = 4; for (const r of [31, 21, 11]) { g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.stroke(); }
    }
    g.clearRect(0, 412, 512, 8);
    return c;
  },
  // chest: a pair of wings from the breastbone, a shield with a star between them
  chest() {
    const [c, g] = tatCanvas(720, 400);
    const feather = (bx, by, a, len, w, fill) => { g.save(); g.translate(bx, by); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.55, -w, len, 0); g.quadraticCurveTo(len * 0.55, w, 0, 0);
      if (fill) g.fill(); else { g.lineWidth = 4.5; g.stroke(); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.55, w, len, 0); g.lineTo(0, 0); g.fill(); g.lineWidth = 2.5; for (let q = 0.25; q < 0.9; q += 0.16) { g.beginPath(); g.moveTo(len * q, 0); g.lineTo(len * (q + 0.1), -w * 0.42); g.stroke(); } } g.restore(); };
    for (const sx of [1, -1]) {
      g.save(); g.translate(360, 0); g.scale(sx, 1);
      for (let i = 0; i < 9; i++) feather(34 + i * 3, 150 + i * 9, -0.3 + i * 0.17, 318 - i * 23, 20 - i * 0.6, false);
      for (let i = 0; i < 7; i++) feather(30, 138 + i * 7, -0.42 + i * 0.2, 150 - i * 6, 15, true);
      g.lineWidth = 7; g.beginPath(); g.moveTo(26, 132); g.quadraticCurveTo(150, 60, 330, 70); g.stroke();
      g.restore();
    }
    g.beginPath(); g.moveTo(360, 96); g.lineTo(404, 124); g.lineTo(396, 214); g.lineTo(360, 262); g.lineTo(324, 214); g.lineTo(316, 124); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i & 1 ? 12 : 30; g[i ? 'lineTo' : 'moveTo'](360 + Math.cos(a) * r, 170 + Math.sin(a) * r); } g.fill();
    g.lineWidth = 4; g.beginPath(); g.moveTo(360, 110); g.lineTo(392, 131); g.lineTo(386, 208); g.lineTo(360, 243); g.lineTo(334, 208); g.lineTo(328, 131); g.closePath(); g.stroke(); g.globalCompositeOperation = 'source-over';
    for (const dx of [-26, 0, 26]) { g.beginPath(); g.moveTo(360 + dx - 11, 88); g.lineTo(360 + dx, dx ? 62 : 48); g.lineTo(360 + dx + 11, 88); g.fill(); }
    g.fillStyle = INK_RED; g.beginPath(); g.moveTo(360, 276); g.lineTo(372, 300); g.lineTo(360, 340); g.lineTo(348, 300); g.closePath(); g.fill();
    return c;
  },
  // back: a sun wheel between the shoulder blades, diamonds down the spine, two blades sweeping off it
  back() {
    const [c, g] = tatCanvas(640, 720), cx = 320, cy = 232, ray = (a, r0, r1, w, fill) => { g.beginPath(); g.moveTo(cx + Math.cos(a - w) * r0, cy + Math.sin(a - w) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0); if (fill) g.fill(); else { g.closePath(); g.lineWidth = 4; g.stroke(); } };
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.save(); g.translate(cx, cy); g.rotate(a); g.beginPath(); g.moveTo(50, 0); g.quadraticCurveTo(82, -24, 114, 0); g.quadraticCurveTo(82, 24, 50, 0); if (i & 1) g.fill(); else { g.lineWidth = 4.5; g.stroke(); } g.restore(); }
    g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 122, 0, 6.283); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 44, 0, 6.283); g.stroke();
    for (let i = 0; i < 24; i++) ray(i * Math.PI / 12, 128, i & 1 ? 168 : 196, 0.1, true);
    for (let i = 0; i < 12; i++) ray((i + 0.5) * Math.PI / 6, 150, 226, 0.2, false);
    for (let i = 0; i < 48; i++) { const a = i * Math.PI / 24; g.beginPath(); g.arc(cx + Math.cos(a) * 212, cy + Math.sin(a) * 212, i & 1 ? 2.6 : 4.2, 0, 6.283); g.fill(); }
    g.beginPath(); g.arc(cx, cy, 34, 0, 6.283); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i & 1 ? 9 : 26; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.fill(); g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) { const y = 490 + i * 40, s = 22 - i * 2.6; g.beginPath(); g.moveTo(cx, y - s * 1.1); g.lineTo(cx + s, y); g.lineTo(cx, y + s * 1.1); g.lineTo(cx - s, y); g.closePath(); if (i & 1) { g.lineWidth = 4; g.stroke(); } else g.fill(); }
    for (const sx of [1, -1]) { g.save(); g.translate(cx, 0); g.scale(sx, 1);
      g.beginPath(); g.moveTo(30, 470); g.bezierCurveTo(120, 470, 210, 520, 250, 640); g.bezierCurveTo(200, 560, 130, 520, 60, 520); g.bezierCurveTo(110, 540, 150, 580, 160, 650); g.bezierCurveTo(120, 580, 80, 545, 30, 540); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(40, 560); g.bezierCurveTo(70, 580, 96, 620, 96, 690); g.bezierCurveTo(74, 640, 58, 610, 34, 596); g.closePath(); g.fill(); g.restore(); }
    return c;
  },
  neck() {
    const [c, g] = tatCanvas(256, 128); g.font = '700 80px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ВОЛЯ', 128, 58, 236);
    g.lineWidth = 5; g.beginPath(); g.moveTo(18, 108); g.quadraticCurveTo(128, 124, 238, 104); g.stroke(); g.beginPath(); g.arc(128, 116, 5, 0, 6.283); g.fill();
    return c;
  },
  ribs() {
    const [c, g] = tatCanvas(512, 256); g.font = 'italic 700 74px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Упал — встань.', 256, 72, 490); g.fillText('Боль пройдёт.', 256, 168, 470);
    g.lineWidth = 4; g.beginPath(); g.moveTo(60, 226); g.bezierCurveTo(180, 250, 330, 206, 452, 232); g.stroke();
    return c;
  },
  face() { const [c, g] = tatCanvas(48, 80); g.beginPath(); g.moveTo(24, 6); g.bezierCurveTo(30, 34, 44, 44, 40, 60); g.bezierCurveTo(36, 78, 12, 78, 8, 60); g.bezierCurveTo(4, 44, 18, 34, 24, 6); g.fill(); return c; },
  letter(ch) { const [c, g] = tatCanvas(64, 72); g.font = '900 62px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 32, 39, 56); return c; },
};
const KNUCKLE_WORDS = { L: 'СИЛА', R: 'ВОЛЯ' };

/* —— projections in the rest pose: vertex → design coordinates (0…1, canvas y down), null = not on this part —— */
function tatPlanar(c, U, Vv, su, sv, dir, minDot, depth) {
  const M = T.skinGeo, W = M.W, N = M.N;
  return i => {
    const x = W[3 * i] - c.x, y = W[3 * i + 1] - c.y, z = W[3 * i + 2] - c.z;
    if (N[3 * i] * dir.x + N[3 * i + 1] * dir.y + N[3 * i + 2] * dir.z < minDot || Math.abs(x * dir.x + y * dir.y + z * dir.z) > depth) return null;
    return [(x * U.x + y * U.y + z * U.z) / su + 0.5, 0.5 - (x * Vv.x + y * Vv.y + z * Vv.z) / sv];
  };
}
function tatCyl(A, B, t0, t1, ref) {
  const M = T.skinGeo, W = M.W, ax = B.clone().sub(A), len = ax.length(); ax.normalize();
  const e1 = ref.clone().addScaledVector(ax, -ref.dot(ax)).normalize(), e2 = new V3().crossVectors(ax, e1);
  return i => {
    const x = W[3 * i] - A.x, y = W[3 * i + 1] - A.y, z = W[3 * i + 2] - A.z, a = (x * ax.x + y * ax.y + z * ax.z) / len;
    if (a < t0 - 0.2 || a > t1 + 0.2) return null;
    const rx = x - ax.x * a * len, ry = y - ax.y * a * len, rz = z - ax.z * a * len; if (rx * rx + ry * ry + rz * rz > 0.0081) return null;
    return [Math.atan2(rx * e2.x + ry * e2.y + rz * e2.z, rx * e1.x + ry * e1.y + rz * e1.z) / 6.2832 + 0.5, (a - t0) / (t1 - t0)];
  };
}
// triangles of the given materials that the projection covers: [key, i0, i1, i2, s0, t0, s1, t1, s2, t2]
function tatCollect(keys, proj, wrap, side) {
  const M = T.skinGeo, ix = M.ix, out = [];
  for (const gr of M.groups) {
    const key = M.keys[gr.materialIndex]; if (!key || !keys.includes(key)) continue;
    for (let t = gr.start; t < gr.start + gr.count; t += 3) {
      if (side && M.W[3 * ix[t]] * side < 0) continue;
      const a = proj(ix[t]), b = a && proj(ix[t + 1]), c = b && proj(ix[t + 2]); if (!c) continue;
      if (wrap) { for (const q of [b, c]) { if (q[0] - a[0] > 0.5) q[0] -= 1; else if (q[0] - a[0] < -0.5) q[0] += 1; } }
      const s0 = Math.min(a[0], b[0], c[0]), s1 = Math.max(a[0], b[0], c[0]), t0 = Math.min(a[1], b[1], c[1]), t1 = Math.max(a[1], b[1], c[1]);
      if (t1 < 0 || t0 > 1 || (!wrap && (s1 < 0 || s0 > 1))) continue;
      out.push([key, ix[t], ix[t + 1], ix[t + 2], a[0], a[1], b[0], b[1], c[0], c[1]]);
      if (wrap && s0 < 0) out.push([key, ix[t], ix[t + 1], ix[t + 2], a[0] + 1, a[1], b[0] + 1, b[1], c[0] + 1, c[1]]);
      if (wrap && s1 > 1) out.push([key, ix[t], ix[t + 1], ix[t + 2], a[0] - 1, a[1], b[0] - 1, b[1], c[0] - 1, c[1]]);
    }
  }
  return out;
}
// a preset = parts: { img (design canvas), tris }
function tatParts(id) {
  const cache = T.tatParts || (T.tatParts = {}); if (cache[id]) return cache[id];
  const M = T.skinGeo, bp = M.bp, X = new V3(1, 0, 0), Y = new V3(0, 1, 0), Z = new V3(0, 0, 1), parts = [];
  const add = (img, tris) => parts.push({ img, tris });
  if (id === 'sleeve') add(TAT_DRAW.sleeve(), tatCollect(['arm'], tatCyl(bp('CC_Base_L_Forearm'), bp('CC_Base_L_Hand'), 0.1, 0.94, Z), true, 1));
  else if (id === 'band') add(TAT_DRAW.band(), tatCollect(['arm'], tatCyl(bp('CC_Base_R_Upperarm'), bp('CC_Base_R_Forearm'), 0.47, 0.62, Z), true, -1));
  else if (id === 'chest') add(TAT_DRAW.chest(), tatCollect(['body'], tatPlanar(new V3(0, 1.385, 0.1), X, Y, 0.37, 0.205, Z, 0.12, 0.2)));
  else if (id === 'back') add(TAT_DRAW.back(), tatCollect(['body'], tatPlanar(new V3(0, 1.3, -0.1), X.clone().negate(), Y, 0.34, 0.38, Z.clone().negate(), 0.12, 0.2)));
  else if (id === 'neck') add(TAT_DRAW.neck(), tatCollect(['head', 'body'], tatPlanar(new V3(0.05, 1.59, -0.022), Z.clone().negate(), Y, 0.07, 0.035, X, 0.3, 0.06)));
  else if (id === 'ribs') { const U = new V3(0, -0.2, -1).normalize(); add(TAT_DRAW.ribs(), tatCollect(['body'], tatPlanar(new V3(0.15, 1.235, 0.01), U, new V3().crossVectors(X, U), 0.165, 0.0825, X, 0.3, 0.1))); }
  else if (id === 'face') { const e = bp('CC_Base_L_Eye'); add(TAT_DRAW.face(), tatCollect(['head'], tatPlanar(new V3(e.x + 0.013, e.y - 0.03, e.z + 0.03), X, Y, 0.0085, 0.014, Z, 0.2, 0.05))); }
  else if (id === 'knuckles') for (const S of ['L', 'R']) {
    const dorsal = M.PN[S].clone().negate(), F = ['Index', 'Mid', 'Ring', 'Pinky'].map(f => { const a = bp(`CC_Base_${S}_${f}1`), b = bp(`CC_Base_${S}_${f}2`); return { c: a.clone().lerp(b, 0.5).addScaledVector(dorsal, 0.008), up: a.clone().sub(b).normalize() }; });
    const U0 = new V3().crossVectors(F[1].up, dorsal).normalize(); F.sort((p, q) => p.c.dot(U0) - q.c.dot(U0));
    F.forEach((f, k) => { const U = new V3().crossVectors(f.up, dorsal).normalize(); add(TAT_DRAW.letter(KNUCKLE_WORDS[S][k]), tatCollect(['arm'], tatPlanar(f.c, U, f.up, 0.017, 0.021, dorsal, 0.25, 0.014), false, S === 'L' ? 1 : -1)); });
  }
  return (cache[id] = parts);
}
// the head tile covers only the part of the head texture that tattoos can reach (twice the resolution)
function tatHeadBox() {
  if (T.tatHeadB) return T.tatHeadB;
  const uv = T.skinGeo.uv; let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
  for (const id of ['neck', 'face']) for (const p of tatParts(id)) for (const t of p.tris) if (t[0] === 'head') for (let k = 1; k <= 3; k++) { const u = uv[2 * t[k]], v = uv[2 * t[k] + 1]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  if (u1 <= u0) return (T.tatHeadB = [0, 0, 1, 1]);
  return (T.tatHeadB = [u0 - 0.02, v0 - 0.02, u1 + 0.02, v1 + 0.02]);
}
const TAT_W = 2048, TAT_H = 1024, TAT_TILE = { body: [0, 0, 896, 1024], arm: [896, 0, 768, 1024], head: [1664, 0, 384, 1024] };
// the uv rectangle a tile covers: the whole texture, in the uv tile (UDIM) where this material's coordinates lie
function tatBox(key) {
  if (key === 'head') return tatHeadBox();
  const M = T.skinGeo, B = M.box || (M.box = {}); if (B[key]) return B[key];
  const gr = M.groups.find(g => M.keys[g.materialIndex] === key), i = M.ix[gr.start + 3 * ((gr.count / 6) | 0)], u = Math.floor(M.uv[2 * i]), v = Math.floor(M.uv[2 * i + 1]);
  return (B[key] = [u, v, u + 1, v + 1]);
}
let _tatBlank = null;
function tatBlank() { if (!_tatBlank) { _tatBlank = new THREE.DataTexture(new Uint8Array(4), 1, 1); _tatBlank.needsUpdate = true; } return _tatBlank; }
// one textured triangle: the affine map design → atlas, clipped to the triangle grown by a pixel (no hairlines between neighbours)
function tatTri(g, img, sx0, sy0, sx1, sy1, sx2, sy2, dx0, dy0, dx1, dy1, dx2, dy2) {
  const den = (sx1 - sx0) * (sy2 - sy0) - (sx2 - sx0) * (sy1 - sy0); if (Math.abs(den) < 1e-9) return;
  const a = ((dx1 - dx0) * (sy2 - sy0) - (dx2 - dx0) * (sy1 - sy0)) / den, c = ((dx2 - dx0) * (sx1 - sx0) - (dx1 - dx0) * (sx2 - sx0)) / den;
  const b = ((dy1 - dy0) * (sy2 - sy0) - (dy2 - dy0) * (sy1 - sy0)) / den, d = ((dy2 - dy0) * (sx1 - sx0) - (dy1 - dy0) * (sx2 - sx0)) / den;
  const cx = (dx0 + dx1 + dx2) / 3, cy = (dy0 + dy1 + dy2) / 3, ex = (x, y) => { const l = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / l * 1.2, y + (y - cy) / l * 1.2]; };
  const p0 = ex(dx0, dy0), p1 = ex(dx1, dy1), p2 = ex(dx2, dy2);
  g.save(); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.closePath(); g.clip();
  g.transform(a, b, c, d, dx0 - a * sx0 - c * sy0, dy0 - b * sx0 - d * sy0); g.drawImage(img, 0, 0); g.restore();
}
/* the man's tattoos from his look (called by Fighter.applyLook); nothing is allocated for a man without any */
function tatApply(F, L) {
  const ids = (Array.isArray(L.tats) ? L.tats : []).filter(id => TATS.some(t => t.id === id)), key = ids.join(','), U = F.flesh.u;
  if (F.tatKey === key) return; F.tatKey = key;
  if (!ids.length) { U.uTat.value = tatBlank(); for (const m of F.skinMats) m.userData.uTatR.value.set(0, 0, 0, 0); return; }
  if (!F.tatTex) { const c = document.createElement('canvas'); c.width = TAT_W; c.height = TAT_H; F.tatTex = new THREE.CanvasTexture(c); F.tatTex.colorSpace = THREE.SRGBColorSpace; F.tatTex.anisotropy = 4; }
  const c = F.tatTex.image, g = c.getContext('2d'), uv = T.skinGeo.uv; g.clearRect(0, 0, TAT_W, TAT_H);
  for (const id of ids) for (const P of tatParts(id)) {
    const w = P.img.width, h = P.img.height;
    for (const t of P.tris) {
      const tl = TAT_TILE[t[0]], bx = tatBox(t[0]), X = k => tl[0] + (uv[2 * t[k]] - bx[0]) / (bx[2] - bx[0]) * tl[2], Y = k => tl[1] + (1 - (uv[2 * t[k] + 1] - bx[1]) / (bx[3] - bx[1])) * tl[3];
      tatTri(g, P.img, t[4] * w, t[5] * h, t[6] * w, t[7] * h, t[8] * w, t[9] * h, X(1), Y(1), X(2), Y(2), X(3), Y(3));
    }
  }
  F.tatTex.needsUpdate = true; U.uTat.value = F.tatTex;
  for (const m of F.skinMats) {
    const tl = TAT_TILE[m.userData.skinKey]; if (!tl) { m.userData.uTatR.value.set(0, 0, 0, 0); continue; }
    const bx = tatBox(m.userData.skinKey);
    m.userData.uTatR.value.set(tl[0] / TAT_W, 1 - (tl[1] + tl[3]) / TAT_H, tl[2] / TAT_W, tl[3] / TAT_H); m.userData.uTatB.value.set(bx[0], bx[1], 1 / (bx[2] - bx[0]), 1 / (bx[3] - bx[1]));
  }
}
