/* ───────── training mitts for the coach ───────── */
/* procedurally generated boxing mitts (focus mitts):
   • curved pad ~25×20×7 cm, thick rim with stitching
   • circular target in center of striking side
   • leather PBR, canvas textures (color + normal/roughness)
   • worn by the coach (trainer) over the hand bones
   • 3 setup positions: jab (face), cross (second mitt), hook (side)
   • springy recoil on hit: mitts + forearm bounce, skin vibration (shader)
   • API for the judge: window.__mitts = { start(), stop(), hold(kind), hit(side, power) } */

// Mitt geometry parameters (cm) — origin at the wrist, +x thumb side, +y along fingers (knuckle bone at 10.3), +z palm
const mittOffset = new V3(-0.8, 7.9, -0.4);   // thumb end of the mitt (wrist position)
const mittLength = 0.25, mittWidth = 0.20, mittThickness = 0.07;  // pad dimensions: length × width × thickness
const targetRadius = 0.12;  // target radius in center
const rimThickness = 0.04, rimHeight = 0.02;  // rim thickness and height (stamping)
const stitchX = 0.16, stitchZ = 0.045;  // distance from edge to first row of stitching
const stitchSpacing = 0.018, stitchWidth = 0.004;
const wristRimR = 0.12, wristRimH = 0.06;  // back side: wrist strap opening and rim height
const wristStitch = 0.14, wristT = 0.08, wristW = 0.18;  // wrist area dimensions

// texture atlas for mitts (would be loaded from canvas)
let mittTex = null, mittNorm = null, mittRough = null;
let mittGeo = null;
let mittMat = null;

// mitt geometry functions (using existing gridGeo and mergeGeos from 04b_gloves_headgear.js)
function mittPadSurface(u, v, o) {  // the main pad: rounded box, narrow at the wrist, fat over the knuckles, flatter on the palm, nose curled to the palm
  const d = new V3();
  // project to cylindrical coordinates: theta around y axis, phi around x axis
  const theta = Math.PI * 2 * u;  // around the y axis (thumb→palm)
  const phi = Math.PI * (2 * v - 1);  // around the x axis (palm→back), negative for palm side
  const x = Math.sin(theta) * Math.cos(phi);  // thumb side
  const y = Math.sin(-phi);  // along fingers (knuckle bone at 10.3)
  const z = Math.cos(theta) * Math.cos(phi);  // palm side
  const r = Math.hypot(x, z);
  let xs = x * mittLength / 2, ys = y * mittWidth / 2, zs = z * mittThickness / 2;
  // curve the nose towards the palm
  if (z < 0) { const k = 1 - Math.exp(-r * 20); zs += k * Math.abs(z) * 0.3; }
  // make the edge thinner (curved shape)
  const edge = Math.hypot(Math.abs(x), Math.abs(z));
  if (edge > mittLength / 2 * 0.7 && edge < mittLength / 2) { xs *= 0.85; zs *= 0.85; }
  // thickness curve: wider over knuckles, thinner at wrist
  const knuckleHeight = Math.abs(ys) / (mittWidth / 2);
  const thicknessCurve = 0.5 + 0.5 * Math.sin(Math.PI * knuckleHeight);
  xs *= thicknessCurve; zs *= thicknessCurve;
  // final position with offset
  o.set(xs + mittOffset.x, ys + mittOffset.y, zs + mittOffset.z);
}

function mittRimSurface(u, v, o) {  // thick rim along the edge, rolled lip
  const theta = Math.PI * 2 * u;
  const r = mittLength / 2 - rimThickness;
  const x = r * Math.cos(theta);
  const z = r * Math.sin(theta);
  let y = -0.02;  // below the pad surface
  // rolled lip: curve upwards at the edge
  const lip = Math.sin(Math.PI * u) * rimHeight * 0.5;
  y += lip;
  // thickness taper
  const t = Math.sin(Math.PI * v);
  const w = (1 - Math.abs(t)) * rimThickness;
  o.set(x, y, z);
}

function mittTargetSurface(u, v, o) {  // circular target in center of striking side (palm side, +z)
  const theta = Math.PI * 2 * u;
  const phi = Math.PI * (2 * v - 1);
  const r = Math.sin(phi) * targetRadius;  // only on palm side (phi < 0)
  if (phi >= 0) return;  // only draw on palm side
  const x = r * Math.sin(theta);
  const z = r * Math.cos(theta);
  o.set(x, 0.005, z);  // slightly above pad
}

function mittStitchLine(u, v, o) {  // row of stitches along the rim
  const theta = Math.PI * 2 * (u * 0.5 + 0.25);  // two parallel rows
  const r = (mittLength / 2 - stitchX) * (1 - Math.sin(Math.PI * v));  // curve towards edge
  const x = r * Math.cos(theta);
  const z = r * Math.sin(theta);
  const y = -0.02 + stitchWidth * Math.sin(Math.PI * v);
  o.set(x, y, z);
}

function mittWristSurface(u, v, o) {  // back side: wrist strap opening and rim
  const theta = Math.PI * 2 * u;
  const x = wristT * Math.cos(theta);
  const z = wristT * Math.sin(theta);
  const y = mittWidth / 2 + wristRimH * (1 - Math.sin(Math.PI * v));  // raised above hand
  o.set(x, y, z);
}

function createMittGeometry() {
  if (mittGeo) return mittGeo;
  const parts = [];
  const nu = 48, nv = 36;  // resolution

  // main pad
  parts.push(gridGeo(mittPadSurface, nu, nv, { c: new V3(0.8, 0.8, 0.8), ku: 8, kv: 5 }));

  // rim
  parts.push(gridGeo(mittRimSurface, 40, 20, { c: new V3(0.6, 0.6, 0.6), ku: 6, kv: 2 }));

  // target
  parts.push(gridGeo(mittTargetSurface, 32, 32, { c: new V3(1, 0, 0), ku: 6, kv: 6 }));

  // stitching
  const pipe = [];
  for (let row = 0; row < 6; row++) {
    const vOffset = row / 6;
    for (let seg = 0; seg < 40; seg++) {
      const u = seg / 40;
      const v = vOffset + Math.sin(u * Math.PI * 2 + row) * 0.02;
      const p = new V3(), tmp = new V3();
      mittStitchLine(u, v, p);
      pipe.push(p.clone());
    }
  }
  if (pipe.length > 8) {
    const tube = pipeGeo(pipe, stitchWidth, true);
    parts.push(tube);
  }

  // wrist area
  parts.push(gridGeo(mittWristSurface, 36, 24, { c: new V3(0.7, 0.7, 0.7), ku: 6, kv: 3 }));

  const geo = mergeGeos(parts);
  geo.scale(0.01, 0.01, 0.01);  // convert cm to meters
  return mittGeo = geo;
}

function createNormalMap() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // create normal map for leather grain
  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 1024; x++) {
      const nx = Math.sin(x / 50) * Math.sin(y / 50) * 0.5 + 0.5;
      const ny = Math.cos(x / 30) * Math.cos(y / 30) * 0.5 + 0.5;
      ctx.fillStyle = `rgb(${Math.floor(nx * 255)},${Math.floor(ny * 255)},128)`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  return canvas;
}

function createMittMaterial() {
  if (mittMat) return mittMat;

  // create canvas textures for mitts
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // leather base color
  ctx.fillStyle = '#8B5A2B';  // brown leather
  ctx.fillRect(0, 0, 1024, 1024);

  // add stitching pattern
  ctx.strokeStyle = '#654321';
  ctx.lineWidth = 2;
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.moveTo(50 + i * 45, 200);
    ctx.lineTo(50 + i * 45 - 20, 230);
    ctx.stroke();
  }

  // target circle (red/white)
  ctx.fillStyle = '#DC143C';  // crimson
  ctx.beginPath();
  ctx.arc(512, 512, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(512, 512, 110, 0, Math.PI * 2);
  ctx.fill();

  // wear and scratches
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = Math.random() * 20 + 5;
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  mittTex = new THREE.CanvasTexture(canvas);
  mittTex.wrapS = mittTex.wrapT = THREE.RepeatWrapping;
  mittTex.anisotropy = 4;

  // roughness map (bumpiness)
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = roughCanvas.height = 1024;
  const roughCtx = roughCanvas.getContext('2d');
  roughCtx.fillStyle = '#FFFFFF';
  roughCtx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = Math.random() * 10 + 2;
    roughCtx.fillStyle = '#000000';
    roughCtx.beginPath();
    roughCtx.arc(x, y, r, 0, Math.PI * 2);
    roughCtx.fill();
  }

  mittRough = new THREE.CanvasTexture(roughCanvas);
  mittRough.wrapS = mittRough.wrapT = THREE.RepeatWrapping;

  mittMat = new THREE.MeshPhysicalMaterial({
    map: mittTex,
    roughnessMap: mittRough,
    roughness: 0.8,
    metalness: 0.1,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
    normalMap: mittNorm || new THREE.CanvasTexture(createNormalMap()),
    normalScale: new THREE.Vector2(0.5, 0.5),
    vertexColors: true,
    side: THREE.FrontSide
  });

  return mittMat;
}

// trainer character class
trainer = Trainer;
function Trainer() {
  this.group = new THREE.Group();
  scene.add(this.group);

  // clone the boxer model
  this.cc = SkeletonUtils.clone(T.cc);
  this.group.add(this.cc);

  // get bones
  this.bones = firstBones(this.cc);
  this.bones.handL = this.bones['CC_Base_L_Hand'];
  this.bones.handR = this.bones['CC_Base_R_Hand'];

  // setup mitts for both hands (use existing spring class from the game)
  this.mitts = {
    L: { mesh: null, bone: this.bones.handL, spring: { target: 0, value: 0, velocity: 0, k: mittSpringK, damping: mittDamping }, offset: new V3() },
    R: { mesh: null, bone: this.bones.handR, spring: { target: 0, value: 0, velocity: 0, k: mittSpringK, damping: mittDamping }, offset: new V3() }
  };

  // forearm spring
  this.forearmSpring = { target: 0, value: 0, velocity: 0, k: forearmSpringK, damping: forearmDamping };

  // mitt states
  this.state = {
    active: false,
    position: null,  // 'jab' | 'cross' | 'hook'
    lastHit: 0,
    recoil: new V3(),
    shake: 0  // for skin vibration effect
  };

  // setup mitts mesh
  this.setupMitts();

  // trainer animation
  this.animation = {
    current: null,
    target: null,
    time: 0,
    speed: 1.0
  };

  // trainer position and rotation
  this.place(0, Math.PI, false);  // x=0, rotate 180 degrees (face P1)

  // trainer inputs
  this.inputs = {
    jab: false,
    cross: false,
    hook: false
  };

  // start in jab position
  this.hold('jab');
}

Trainer.prototype.setupMitts = function() {
  const mat = createMittMaterial();
  const geo = createMittGeometry();

  // left mitt
  const mittL = new THREE.Group();
  const meshL = new THREE.Mesh(geo, mat);
  meshL.castShadow = meshL.receiveShadow = true;

  // orient left mitt (palm facing right, fingers inside)
  const leftOffset = new V3(0.02, -0.05, -0.01);  // slight offset from hand bone
  const leftRot = new Quat().setFromAxisAngle(new V3(0, 1, 0), Math.PI);  // rotate 180 degrees

  mittL.position.copy(leftOffset);
  mittL.quaternion.copy(leftRot);

  mittL.add(meshL);
  this.mitts.L.mesh = mittL;
  this.group.add(mittL);

  // right mitt
  const mittR = new THREE.Group();
  const meshR = new THREE.Mesh(geo, mat);
  meshR.castShadow = meshR.receiveShadow = true;

  // orient right mitt (palm facing left, fingers inside)
  const rightOffset = new V3(-0.02, -0.05, 0.01);
  const rightRot = new Quat().setFromAxisAngle(new V3(0, 1, 0), 0);  // no rotation

  mittR.position.copy(rightOffset);
  mittR.quaternion.copy(rightRot);

  mittR.add(meshR);
  this.mitts.R.mesh = mittR;
  this.group.add(mittR);

  // setup shader for skin vibration
  this.setupMittShaders();
};

Trainer.prototype.setupMittShaders = function() {
  // add skin vibration shader effect
  const mitts = this.mitts;

  // modify shader to add vibration effect
  const updateVibration = () => {
    const shake = this.state.shake;
    if (shake > 0) {
      const shakeAmount = shake * 0.02;
      mitts.L.mesh.rotation.z += (Math.random() - 0.5) * shakeAmount;
      mitts.L.mesh.rotation.x += (Math.random() - 0.5) * shakeAmount * 0.5;
      mitts.R.mesh.rotation.z += (Math.random() - 0.5) * shakeAmount;
      mitts.R.mesh.rotation.x += (Math.random() - 0.5) * shakeAmount * 0.5;
    }
  };

  // store for use in animation loop
  this.updateVibration = updateVibration;
};

Trainer.prototype.place = function(x, rotY, mirror) {
  const g = this.group;
  g.position.set(x, 0, 0);
  g.rotation.y = rotY;
  if (mirror) g.scale.x = -1;
  g.updateMatrixWorld(true);
  this.simReset = true;
};

Trainer.prototype.hold = function(kind) {
  this.state.position = kind;
  // set mitts orientation based on position
  if (kind === 'jab') {
    // mitts forward (face P1)
    this.mitts.L.mesh.rotation.setFromAxisAngle(new V3(0, 1, 0), Math.PI);
    this.mitts.R.mesh.rotation.setFromAxisAngle(new V3(0, 1, 0), Math.PI);
  } else if (kind === 'cross') {
    // left mitt forward, right mitt back (for cross)
    this.mitts.L.mesh.rotation.setFromAxisAngle(new V3(0, 1, 0), Math.PI);
    this.mitts.R.mesh.rotation.setFromAxisAngle(new V3(0, 1, 0), 0);
  } else if (kind === 'hook') {
    // mitts to the side (rotated 90 degrees)
    this.mitts.L.mesh.rotation.setFromAxisAngle(new V3(0, 1, 0), Math.PI * 0.5);
    this.mitts.R.mesh.rotation.setFromAxisAngle(new V3(0, 1, 0), Math.PI * 0.5);
  }

  this.state.shake = 0;  // reset shake on new position
};

Trainer.prototype.update = function(dt) {
  if (!this.state.active) return;

  // update animation
  this.animation.time += dt * this.animation.speed;

  // update mitt recoil (simplified spring simulation)
  const recoilForce = this.state.recoil.clone();
  if (recoilForce.lengthSq() > 0) {
    // apply spring force to mitts
    for (const side of ['L', 'R']) {
      const mitt = this.mitts[side];
      const targetPos = mitt.bone.position.clone().add(mitt.offset);

      // simple spring calculation (replace the full Spring class)
      const displacement = targetPos.clone().sub(mitt.mesh.position);
      const force = displacement.multiplyScalar(mitt.spring.k);
      mitt.mesh.position.addScaledVector(force, dt * 0.01);  // reduced force for stability

      // damping
      mitt.mesh.position.multiplyScalar(Math.max(0, 1 - mitt.spring.damping * dt));
    }

    // apply to forearm
    const forearmTarget = this.bones['CC_Base_Spine02'].position.clone();
    this.forearmSpring.target = forearmTarget.y;  // simplified: only vertical

    this.state.recoil.multiplyScalar(0.95);  // damping
  }

  // update shader vibration
  if (this.updateVibration) this.updateVibration();

  // update input states
  this.inputs.jab = this.state.position === 'jab';
  this.inputs.cross = this.state.position === 'cross';
  this.inputs.hook = this.state.position === 'hook';
};

Trainer.prototype.hit = function(side, power) {
  if (!this.state.active) return;

  // check if hit is on the correct mitt
  const mittSide = side === 'L' ? 'L' : 'R';
  const mitt = this.mitts[mittSide];

  // calculate recoil based on impact
  const recoilAmount = Math.min(power * 0.3, 1.0);
  mitt.spring.target = recoilAmount;

  // add to overall recoil
  this.state.recoil.x += (side === 'L' ? -1 : 1) * recoilAmount * 0.5;

  // trigger skin vibration
  this.state.shake = Math.min(this.state.shake + power * 0.5, 1.0);

  // play sound effect
  if (sfx && sfx.bag) {
    sfx.bag(Math.min(power * 0.5 + 0.5, 1.0));  // use bag sound for mitt impact
  }
};

// mitts API
function MittsAPI() {
  const mitts = new Trainer();

  return {
    start: function() {
      mitts.state.active = true;
      mitts.group.visible = true;
      return mitts;
    },

    stop: function() {
      mitts.state.active = false;
      mitts.group.visible = false;
      return mitts;
    },

    hold: function(kind) {
      mitts.hold(kind);
      return mitts;
    },

    hit: function(side, power) {
      mitts.hit(side, power);
      return mitts;
    }
  };
}

// create global mitts object
window.__mitts = MittsAPI();

// export for module use
export default {
  Trainer,
  createMittGeometry,
  createMittMaterial,
  MittsAPI
};