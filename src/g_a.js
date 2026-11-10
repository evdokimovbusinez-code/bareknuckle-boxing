import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { mergeVertices, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { unzlibSync } from 'three/addons/libs/fflate.module.js';   // FBX arrays (face blend shapes, 03b_face_shapes.js)
import * as CANNON from 'cannon-es';
window.__boot = true;   // the boot watchdog in the page head checks this

const V3 = THREE.Vector3, Quat = THREE.Quaternion, M4 = THREE.Matrix4;
const $ = id => document.getElementById(id);
let seed = 4242; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const rr = Math.random;

/* ───────── renderer / scene ───────── */
const stage = $('stage'), canvas = $('c');
const lowEnd = Math.min(window.innerWidth, window.innerHeight) < 600 || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0c11');
scene.fog = new THREE.Fog('#0a0c11', 7, 15);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 40);

const hemi = new THREE.HemisphereLight('#8ea3cc', '#1b1510', 0.42); scene.add(hemi);
const key = new THREE.SpotLight('#fff0dc', 52, 14, 0.55, 0.6, 1.7);
key.position.set(0.6, 4.6, 3.0); key.target.position.set(0, 0.9, 0);
key.castShadow = true; key.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.camera.near = 1.5; key.shadow.camera.far = 9;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight('#86b6ff', 2.6); rim.position.set(-2.6, 2.6, -2.8); scene.add(rim);
const rim2 = new THREE.DirectionalLight('#ffb27a', 1.8); rim2.position.set(2.8, 1.8, -2.4); scene.add(rim2);
const fill = new THREE.DirectionalLight('#ffffff', 0.5); fill.position.set(-1, 1.4, 3); scene.add(fill);
