/* ───────── focus mitts (лапы): the trainer's punch targets ─────────
   A procedural mitt (≈ 17 × 15.5 cm pad, ≈ 6 cm thick) worn by P2 on the
   hand bones (CC_Base_{L,R}_Hand), exactly like a boxing glove (04b_gloves_headgear.js):
   hand frame +x = thumb side, +y = fingers, +z = palm, the padded hitting face
   is the back of the hand (−Z). Each mitt is a damped spring — a hit shoves it
   back, it returns and buzzes (leather rattle) while a slap plays.
   Three feed poses (jab / cross / hook) offset the pad from the hand and the pad
   is aimed at the player's head so it always presents a target. P1's knuckle
   landing on the pad is detected automatically and fires the response.

   window.__mitts = { start(), stop(), hold(kind), hit(side, power) }
   kind ∈ 'jab' | 'cross' | 'hook', side ∈ 'L' | 'R', power ∈ 0 … 1
*/

const MITT = { on: false };                       // drill state (toggled via __mitts.start/stop)
const MITT_R = 0.09;                              // m: pad hitting-face radius — a knuckle inside is a hit
const MITT_FEED = {                               // hand-local pad offset per feed (x mirrored for the right hand)
  jab:    new V3( 0.00, 0.00, -0.10),
  cross:  new V3( 0.07, 0.00, -0.14),
  hook:   new V3(-0.10, -0.05, -0.06),
};
const MITT_PAD = new V3(0, 0.13, 0.02);           // pad centre in mitt-local space (toward the knuckles, on the hitting face)
const MITT_AIM_BLEND = 0.15;                      // how fast the pad turns to face the player (per second, dt-scaled)

let GEAR_MITT;                                    // cached mitt geometry
let Mitts = null;                                 // { L, R } mitt instances
const _kPrev = new V3(), _kCur = new V3();        // P1 knuckle position → speed (for automatic hit detection)

function mittGeo() {   // the padded hitting face, a back plate and a wrist cuff (mitt-local metres)
  if (GEAR_MITT) return GEAR_MITT;
  const TAU = Math.PI * 2, parts = [];
  // the padded hitting face: slightly convex rounded rect, normal −Z (toward the puncher)
  const face = (u, v, o) => {
    const x = (u - 0.5) * 0.168, y = 0.052 + v * 0.156;   // 16.8 × 15.6 cm, starting 5.2 cm above the wrist
    const cx = Math.max(0, Math.abs(x) - 0.062) / 0.022, cy = Math.max(0, Math.abs(y - 0.13) - 0.06) / 0.022;
    const corner = Math.min(1, Math.hypot(cx, cy));
    const z = 0.020 + 0.010 * (1 - corner) * (1 - 4 * (u - 0.5) ** 2) * (1 - 4 * (v - 0.5) ** 2);
    o.set(x, y, z);
  };
  parts.push(gridGeo(face, 30, 22, { c: new V3(0, 0.13, 0.12) }));   // o.c behind the face → normals point −Z (out)
  // back plate (palm side), set back by the pad thickness; normal +Z (toward the trainer)
  const back = (u, v, o) => { face(u, v, o); o.z = 0.078; };
  parts.push(gridGeo(back, 30, 22, { c: new V3(0, 0.13, -0.04), inv: true }));
  // cuff: a strap round the wrist at the bottom of the pad
  const cuff = (u, v, o) => { const a = u * TAU, y = 0.050 + v * 0.022;
    const r = 0.072 + 0.012 * Math.sin(3 * a); o.set(r * Math.cos(a), y, 0.050 + 0.030 * Math.sin(a)); };
  parts.push(gridGeo(cuff, 40, 6, { c: new V3(0, 0.06, 0.05) }));
  const body = mergeGeos(parts);
  // the target: a red ring on the hitting face, just in front of the leather
  const tgeo = new THREE.TorusGeometry(0.042, 0.005, 16, 32);
  tgeo.rotateX(Math.PI); tgeo.translate(0, 0.13, 0.015);
  return GEAR_MITT = { body, torus: tgeo };
}

function mittBuild(F, S) {   // rig one mitt on hand bone CC_Base_{S}_Hand (bind-time rel matrix, like gloveMesh)
  const B = F.bones, h = B[`CC_Base_${S}_Hand`];
  const hp = new V3().setFromMatrixPosition(h.matrixWorld);
  const wp = (n) => new V3().setFromMatrixPosition(B[n].matrixWorld);
  const Y = wp(`CC_Base_${S}_Mid1`).sub(hp).normalize();
  const X = wp(`CC_Base_${S}_Index1`).sub(wp(`CC_Base_${S}_Pinky1`)); X.addScaledVector(Y, -X.dot(Y)).normalize();
  const Z = new V3().crossVectors(X, Y).multiplyScalar(S === 'R' ? 1 : -1);
  const rel = new M4().makeBasis(X, Y, Z).setPosition(hp).premultiply(h.matrixWorld.clone().invert());
  const { body, torus } = mittGeo();
  const g = new THREE.Group(); g.matrixAutoUpdate = false;
  const bm = new THREE.Mesh(body, leatherMat('#6b4a3a'));   // worn brown leather
  bm.castShadow = bm.receiveShadow = true;
  const tm = new THREE.Mesh(torus, new THREE.MeshPhysicalMaterial({   // the red target
    color: '#c0392b', emissive: '#c0392b', emissiveIntensity: 0.45, roughness: 0.25 }));
  tm.castShadow = tm.receiveShadow = true;
  g.add(bm); g.add(tm); scene.add(g);
  return { g, h, rel, q: new Quat(), side: S,
    spr: [new Spring(45, 8), new Spring(45, 8), new Spring(45, 8)], // damped recoil spring, one axis each
    off: new V3(), vib: 0, aim: new V3(0, 0, -1), hitT: -9 };
}

function mittsStart() { MITT.on = true; if (Mitts) return; if (!P2 || !P2.bones) return;
  if (P2.gear.gloves) for (const gl of P2.gear.gloves) gl.g.visible = false;   // the mitts replace the gloves for the drill
  Mitts = { L: mittBuild(P2, 'L'), R: mittBuild(P2, 'R') }; MITT.feed = 'jab'; }
function mittsStop() { MITT.on = false; if (!Mitts) return; for (const m of Object.values(Mitts)) m.g.visible = false; Mitts = null;
  if (P2 && P2.gear.gloves) for (const gl of P2.gear.gloves) gl.g.visible = true; }
function mittsHold(kind) { if (Mitts) MITT.feed = kind || 'jab'; }
function mittsHit(side, power, dir) {   // programmatic hit: shove the mitt, rattle the leather, slap
  const m = Mitts && Mitts[side]; if (!m) return;
  const p = clamp(power, 0, 1);
  const shove = dir || new V3().copy(m.aim).negate();   // away from the puncher (aim points at them)
  for (let i = 0; i < 3; i++) m.spr[i].v += shove.getComponent(i) * -p * 5;   // shove along −aim
  m.vib = p; m.hitT = G.t;
  sfx.thud(clamp(p * 0.8, 0.2, 1), false);   // the leather slap (goes through the place's echo)
}

const _mp1 = new V3(), _ms1 = new V3(), _mp2 = new V3();
function mittsTick(dt) {
  if (!MITT.on || !Mitts || !P1 || !P2 || dt <= 0) return;
  const feed = MITT.feed || 'jab';
  const p1h = new V3().setFromMatrixPosition(P1.head.matrixWorld);   // aim the pads at the player's head
  // P1 knuckle speed (automatic hit detection: a punch landing on a pad)
  _kCur.copy(P1.knuckle(new V3()));
  const kvel = _kCur.clone().sub(_kPrev).divideScalar(dt); _kPrev.copy(_kCur);
  const kspeed = kvel.length();
  const faceDir0 = new V3(0, 0, -1);
  for (const S of ['L', 'R']) {
    const m = Mitts[S], B = P2.bones, h = B[`CC_Base_${S}_Hand`];
    const hp = new V3().setFromMatrixPosition(h.matrixWorld);
    const wp = (n) => new V3().setFromMatrixPosition(B[n].matrixWorld);
    const Y = wp(`CC_Base_${S}_Mid1`).sub(hp).normalize();
    const X = wp(`CC_Base_${S}_Index1`).sub(wp(`CC_Base_${S}_Pinky1`)); X.addScaledVector(Y, -X.dot(Y)).normalize();
    const Z = new V3().crossVectors(X, Y).multiplyScalar(S === 'R' ? 1 : -1);
    // feed offset: hand-local, x mirrored for the right hand
    const fo = MITT_FEED[feed] || MITT_FEED.jab;
    const offW = new V3().addScaledVector(X, fo.x * (S === 'R' ? -1 : 1)).addScaledVector(Y, fo.y).addScaledVector(Z, fo.z);
    const pt = hp.clone().add(offW);                                  // where the pad centre should be
    // aim the hitting face (−Z) at the player's head
    const dir = p1h.clone().sub(pt); let dl = dir.length();
    if (dl < 1e-6) dir.set(0, 0, -1); else dir.divideScalar(dl);
    // base pose: mitt on the hand, offset for the feed (decompose → add offset → recompose)
    m.g.matrix.multiplyMatrices(h.matrixWorld, m.rel);
    m.g.matrix.decompose(_mp1, m.q, _ms1);
    _mp1.add(offW);
    const curDir = faceDir0.clone().applyQuaternion(m.q);
    const qrot = new Quat().setFromUnitVectors(curDir, dir);
    m.q.slerp(qrot, clamp(dt * MITT_AIM_BLEND, 0, 1));
    // spring recoil (world) + leather rattle vibration
    m.off.set(m.spr[0].x, m.spr[1].x, m.spr[2].x);
    for (const s of m.spr) s.step(dt);
    m.vib *= Math.exp(-dt * 14);
    _mp1.add(m.off);
    if (m.vib > 0.02) { _mp2.set(Math.sin(G.t * 70), Math.cos(G.t * 90), 0); _mp1.addScaledVector(_mp2, m.vib * 0.004); }
    m.g.matrix.compose(_mp1, m.q, _ms1);
    m.g.matrixWorldNeedsUpdate = true;
    // automatic hit detection: P1's knuckle on the pad, moving into it
    const padC = _mp1.clone().add(new V3().copy(MITT_PAD).applyQuaternion(m.q));   // pad centre in world
    const faceDir = new V3(0, 0, -1).applyQuaternion(m.q); // hitting-face normal → puncher
    m.aim.copy(faceDir);   // remember where the pad points so a hit shoves it back the right way
    const toKnuckle = _kCur.clone().sub(padC);
    const approaching = kvel.dot(faceDir) < -0.5 && toKnuckle.dot(faceDir) > 0;
    if (approaching && toKnuckle.length() < MITT_R && kspeed > 0.9 && G.t - m.hitT > 0.15) {
      mittsHit(S, clamp(kspeed * 0.45 + 0.15, 0.2, 1.2));
    }
  }
}

window.__mitts = {
  start() { mittsStart(); },
  stop() { mittsStop(); },
  hold(kind) { mittsHold(kind); },
  hit(side, power) { mittsHit(side, power); },
};
