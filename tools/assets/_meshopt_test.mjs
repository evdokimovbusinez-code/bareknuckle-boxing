import { Document, NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import * as fs from 'node:fs';

let MeshoptEncoder, MeshoptDecoder;
try { ({ MeshoptEncoder, MeshoptDecoder } = await import('meshoptimizer')); console.log('meshoptimizer OK'); }
catch (e) { console.log('meshoptimizer MISSING', e.message); }
try { const m = await import('@gltf-transform/extensions'); console.log('extensions keys sample', Object.keys(m).slice(0,5)); } catch(e){ console.log('ext', e.message); }

// build a doc with one accessor holding ~1MB of semi-compressible bytes
const doc = new Document();
const buf = doc.createBuffer();
const data = new Uint8Array(1_000_000);
for (let i = 0; i < data.length; i++) data[i] = (i * 31 + (i >> 7) * 7) & 255;
const acc = doc.createAccessor('payload').setType('SCALAR').setArray(data);
doc.createScene().addChild(doc.createNode()); // a scene so it's a valid glTF
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
let glb;
if (MeshoptEncoder) {
  try { await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 2 })); console.log('meshopt transform OK'); }
  catch (e) { console.log('meshopt transform FAILED', e.message); }
}
glb = await io.writeBinary(doc);
fs.writeFileSync('/tmp/_mo.glb', Buffer.from(glb));
console.log('wrote glb bytes', glb.byteLength, 'orig accessor', data.length);

// inspect whether EXT_meshopt_compression present
const txt = fs.readFileSync('/tmp/_mo.glb').toString('latin1');
console.log('has EXT_meshopt_compression:', txt.includes('EXT_meshopt_compression'));

// read back with gltf-transform
const doc2 = await io.readBinary(new Uint8Array(glb));
const a2 = doc2.getRoot().listAccessors()[0];
const arr = a2.getArray();
let same = arr.length === data.length;
if (same) for (let i=0;i<data.length;i++) if (arr[i]!==data[i]) { same=false; console.log('diff at', i, arr[i], data[i]); break; }
console.log('roundtrip via gltf-transform:', same, 'len', arr.length);
