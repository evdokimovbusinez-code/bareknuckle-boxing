#!/usr/bin/env python3
"""Smooth-shaded previews of a simulated garment, rendered by three.js in headless Chromium (like the game).

    python3 tools/assets/cloth/render.py [tee|pants]

Reads out/body.obj + out/<garment>_high.obj, writes preview/<garment>_r_front/side/back/close.png (1024 px).
The pure-Python raster in place.py draws flat triangles — fine for checks, but it makes a 1 cm mesh read as broken
glass; this one uses vertex normals and a key + fill light, so folds look like folds.
"""
import http.server, os, sys, threading, json, functools

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT, PREVIEW = os.path.join(HERE, 'out'), os.path.join(HERE, 'preview')

PAGE = """<!doctype html><html><body style="margin:0;background:#eeedea">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
const W = 1024, H = 1024;
const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); R.setSize(W, H); document.body.appendChild(R.domElement);
R.toneMapping = THREE.ACESFilmicToneMapping; R.outputColorSpace = THREE.SRGBColorSpace;
const S = new THREE.Scene(); S.background = new THREE.Color(0xeeedea);
S.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-1.2, 2.5, 2.2); S.add(key);
const rim = new THREE.DirectionalLight(0xaabbff, 0.8); rim.position.set(2, 1.5, -2); S.add(rim);
const L = new OBJLoader();
function mesh(txt, mat) {
  const g0 = L.parse(txt).children[0].geometry; g0.deleteAttribute('uv'); g0.deleteAttribute('normal');
  const g = mergeVertices(g0, 1e-5); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); S.add(m); return m;
}
window.go = async (body, cloth) => {
  mesh(body, new THREE.MeshStandardMaterial({ color: 0x6d625a, roughness: 0.75 }));
  const c = mesh(cloth, new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.92, side: THREE.DoubleSide }));
  c.geometry.computeBoundingBox(); const bb = c.geometry.boundingBox, ctr = bb.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
  const views = { front: [0, 0, 1], side: [1, 0, 0.12], back: [0, 0, -1] }, shots = {};
  const size = bb.getSize(new THREE.Vector3()), dist = Math.max(size.x, size.y) * 2.6;
  for (const [k, d] of Object.entries(views)) {
    cam.position.set(ctr.x + d[0] * dist, ctr.y + 0.05, ctr.z + d[2] * dist); cam.lookAt(ctr); R.render(S, cam);
    shots[k] = R.domElement.toDataURL('image/png');
  }
  cam.position.set(ctr.x + 0.55, bb.max.y + 0.05, ctr.z + 0.75); cam.lookAt(ctr.x + 0.17, bb.max.y - 0.12, ctr.z); R.render(S, cam);
  shots.close = R.domElement.toDataURL('image/png');
  return shots;
};
window.ready = true;
</script></body></html>"""


def main():
    garment = sys.argv[1] if len(sys.argv) > 1 else 'tee'
    body = open(os.path.join(OUT, 'body.obj')).read()
    cloth = open(os.path.join(OUT, f'{garment}_high.obj')).read()
    page = os.path.join(ROOT, '_cloth_render.html'); open(page, 'w').write(PAGE)
    H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    H.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    from playwright.sync_api import sync_playwright
    import base64
    try:
        with sync_playwright() as pw:
            exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
            b = pw.chromium.launch(executable_path=exe, args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
            pg = b.new_page(viewport={'width': 1024, 'height': 1024})
            pg.on('pageerror', lambda e: print('PAGEERROR', e))
            pg.goto(f'http://127.0.0.1:{port}/_cloth_render.html'); pg.wait_for_function('window.ready === true', timeout=60000)
            shots = pg.evaluate('([a, b]) => window.go(a, b)', [body, cloth])
            os.makedirs(PREVIEW, exist_ok=True)
            for k, url in shots.items():
                open(os.path.join(PREVIEW, f'{garment}_r_{k}.png'), 'wb').write(base64.b64decode(url.split(',', 1)[1]))
            b.close()
        print(f'  превью → preview/{garment}_r_front/side/back/close.png')
    finally:
        srv.shutdown(); os.remove(page)


if __name__ == '__main__':
    main()
