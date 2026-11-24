"""Issue 45 — drive every tutorial step through the real input pipeline, twice:
  · desktop 1280x720: physical KeyboardEvents (WASD, U I J K N M, Space, Q)
  · touch 740x360: PointerEvents on #pzone (swipes / taps), the stick, БЛОК and stick-flick dodges
R-16, on both: both heads under the lesson's panel (HEADS_JS), ≥ 3 different contextual hints in the first 60 s of
bout 1 and none in bout 4 (HINTS_JS); on the desktop page also the README's control table vs MV_KEYS / ACT_KEYS.
Prints one line per step. Needs gtest.html (tools/check.sh); starts its own http.server + Chrome/SwiftShader.

    python3 tools/tut_test.py
"""
import asyncio, functools, http.server, os, sys, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# One page function for both platforms. All recognition goes through press()/ctlLog() — the same
# place window.__ctl.last is written — so this really exercises the game's input, not a test hook.
JS = r"""(touch) => {
  const T = window.__tut, out = [];
  const st = () => T.state();
  const tick = (n = 1) => __tick(n, 1 / 60);
  // step transitions happen in tutTick on G.real (a 0.7 s beat), so tick frame by frame
  const advance = () => { const b = st().step; for (let i = 0; i < 1200 && st().step === b; i++) tick(); };
  const ok = (i, key) => { const s = st(); out.push((s.step > i ? '✓' : '✗') +
    ' шаг ' + (i + 1) + '/11 [' + key + '] → ' + (s.step >= 10 ? 'финал' : 'шаг ' + (s.step + 1))); };

  const kd = c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c.replace('Key', '').toLowerCase(), bubbles: true }));
  const ku = c => window.dispatchEvent(new KeyboardEvent('keyup',   { code: c, key: c.replace('Key', '').toLowerCase(), bubbles: true }));
  const tapKey = c => { kd(c); ku(c); };
  const punchK = c => { tapKey(c); tick(8); };

  const pz = document.getElementById('pzone');
  const pe = (type, x, y, id) => pz.dispatchEvent(new PointerEvent(type,
    { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
  const gesture = (dx, dy) => { const x = 620, y = 250, id = 7;
    pe('pointerdown', x, y, id); pe('pointermove', x + dx, y + dy, id); pe('pointerup', x + dx, y + dy, id); };
  const tap = () => { pe('pointerdown', 620, 250, 7); pe('pointerup', 620, 250, 7); };
  const punchT = (dx, dy) => { gesture(dx, dy); tick(8); };

  T.resetSeen(); T.start();
  if (!T.on()) return ['✗ обучение не запустилось'];

  // 1 — approach: D / → held, or the stick walking toward the partner
  if (touch) T.walk(1); else kd('KeyD');
  advance(); ok(0, 'подойти');
  if (touch) T.walk(0); else ku('KeyD');

  // 2 — jab ×3: U / tap-or-↖
  if (touch) for (let i = 0; i < 3; i++) punchT(0, 0); else for (let i = 0; i < 3; i++) punchK('KeyU');
  advance(); ok(1, 'джеб ×3');

  // 3 — cross ×3: I / ↗
  if (touch) for (let i = 0; i < 3; i++) punchT(40, -40); else for (let i = 0; i < 3; i++) punchK('KeyI');
  advance(); ok(2, 'кросс ×3');

  // 4 — hooks: J + K / ← + →
  if (touch) { punchT(-40, 0); punchT(40, 0); } else { punchK('KeyJ'); punchK('KeyK'); }
  advance(); ok(3, 'хуки');

  // 5 — uppercuts: N + M / ↙ + ↘
  if (touch) { punchT(-40, 40); punchT(40, 40); } else { punchK('KeyN'); punchK('KeyM'); }
  advance(); ok(4, 'апперкоты');

  // 6 — body ×2: hold S + punch / stick down + punch
  if (touch) T.stick(-1); else kd('KeyS');
  if (touch) { punchT(0, 0); punchT(0, 0); } else { punchK('KeyU'); punchK('KeyU'); }
  if (touch) T.stick(0); else ku('KeyS');
  advance(); ok(5, 'удар в корпус ×2');

  // 7 — power ×2: hold W + punch / stick up + punch
  if (touch) T.stick(1); else kd('KeyW');
  if (touch) { punchT(0, 0); punchT(0, 0); } else { punchK('KeyU'); punchK('KeyU'); }
  if (touch) T.stick(0); else ku('KeyW');
  advance(); ok(6, 'силовой ×2');

  // 8 — combo 1-2-3: U I J within 1.5 s / jab → cross → hook
  if (touch) { punchT(0, 0); punchT(40, -40); punchT(-40, 0); }
  else { punchK('KeyU'); punchK('KeyI'); punchK('KeyJ'); }
  advance(); ok(7, 'комбинация 1-2-3');

  // 9 — block: hold Space / БЛОК while the partner throws 3 slow punches
  if (touch) T.block(true); else kd('Space');
  advance(); ok(8, 'блок ×3');
  if (touch) T.block(false); else ku('Space');

  // 10 — dodge ×2: Q / stick flick
  if (touch) { T.dodge('slipL'); tick(8); T.dodge('slipR'); }
  else { tapKey('KeyQ'); tick(8); tapKey('KeyE'); }
  advance(); ok(9, 'уклон ×2');

  const fin = st();
  const card = !document.getElementById('tut-end').hidden;
  out.push((fin.step >= 10 && fin.key === 'final' && card ? '✓' : '✗') + ' финальный экран «Готово!»');
  return out;
}"""

# R-16: both heads whole under the lesson's hint panel. The head bone is projected with the real camera: its top
# (bone + 0.16 m, over the headgear) must be below the panel's bottom edge, its chin above the bottom of the frame.
# Checked as the lesson starts and again after walking in (the camera re-frames as the pair closes up).
HEADS_JS = r"""() => {
  const g = __g, T = window.__tut, out = [], V = g.THREE.Vector3, cam = g.camera;
  const look = tag => {
    cam.updateMatrixWorld(); const cv = g.renderer.domElement.getBoundingClientRect(), tut = document.getElementById('tut');
    const pb = tut.getBoundingClientRect().bottom - cv.top;
    const py = (p, dy) => (1 - new V(p.x, p.y + dy, p.z).project(cam).y) / 2 * cv.height;
    const r = [g.P1, g.P2].map(F => [py(F.headNow, 0.16), py(F.headNow, -0.13)]);
    const ok = !tut.hidden && r.every(([top, chin]) => top > pb && chin < cv.height);
    out.push((ok ? '✓' : '✗') + ` головы под панелью (${tag}): низ панели ${pb.toFixed(0)} px, макушки ${r.map(a => a[0].toFixed(0)).join(' / ')} px, подбородки ${r.map(a => a[1].toFixed(0)).join(' / ')} px из ${cv.height.toFixed(0)}`);
  };
  if (T.on()) T.end();
  T.start(); __tick(150, 1 / 60); look('старт');
  T.walk(1); __tick(70, 1 / 60); T.walk(0); __tick(90, 1 / 60); look('после сближения');
  T.end();
  return out;
}"""

# R-16: contextual hints. Bout 1 (a fresh bout counter): a simple player — walks in, throws a punch every ~1.2 s — for
# 60 s of the fight; at least 3 different hints, the 12-key bar never up. Then the counter is set to 3 (three bouts
# seen): bout 4, the same 60 s, not one hint.
HINTS_JS = r"""() => {
  const g = __g, G = g.G, P1 = g.P1, P2 = g.P2, out = [];
  if (window.__tut.on()) window.__tut.end();
  const skip = () => { try { g.introSkip(); g.cineSkip(); } catch (e) {} };
  const bout = () => {
    G.mode = 'quick'; g.startFight(true);
    let n = 0; while (G.state !== 'fight' && n++ < 300) { skip(); __tick(10, 1 / 60); }
    const t0 = G.real, from = __ctxh.log.length; let next = 0, kbar = false, i = 0;
    while (G.real - t0 < 60) {
      if (G.state === 'fight') {
        P1.moveDir = Math.abs(P1.group.position.x - P2.group.position.x) > 1.15 ? 1 : 0;
        if (G.real >= next) { g.press('punch', ['jab', 'jab', 'cross', 'hookL'][i++ % 4]); next = G.real + 1.2; }
      } else { P1.moveDir = 0; skip(); }
      if (document.getElementById('kbar').classList.contains('show')) kbar = true;
      __tick(1, 1 / 60);
    }
    P1.moveDir = 0;
    const L = __ctxh.log.slice(from).filter(e => e.at - t0 <= 60);
    return { L, ids: [...new Set(L.map(e => e.id))], kbar, n: +localStorage.getItem('bx_fights') };
  };
  localStorage.removeItem('bx_fights');
  const a = bout();
  out.push((a.ids.length >= 3 && !a.kbar ? '✓' : '✗') + ` бой ${a.n}: за 60 с ${a.L.length} подсказок, разных ${a.ids.length} (${a.L.map(e => e.id + '@' + Math.round(e.t)).join(', ')}), полоса клавиш ${a.kbar ? 'показана' : 'скрыта'}`);
  localStorage.setItem('bx_fights', '3');
  const b = bout();
  out.push((b.L.length === 0 ? '✓' : '✗') + ` бой ${b.n}: за 60 с подсказок ${b.L.length}`);
  return out;
}"""

# R-16: the README's control table must say what MV_KEYS / ACT_KEYS (12_ui.js) do. Every key of the code is found in a row
# whose action names it, and every Latin key named in the table exists in the code (or is Esc / F3).
ACT_WORD = {'jab': 'джеб', 'cross': 'кросс', 'hookL': 'хук', 'hookR': 'хук', 'upperL': 'аппер', 'upperR': 'аппер',
            'slipL': 'уклон', 'slipR': 'уклон', 'duck': 'нырок'}
MV_WORD = {('kx', 1): 'вперёд', ('kx', -1): 'назад', ('ky', 1): 'кружить', ('ky', -1): 'кружить'}
ARROW = {'ArrowLeft': '←', 'ArrowRight': '→', 'ArrowUp': '↑', 'ArrowDown': '↓'}


def readme_check(keys):
    import re
    txt = open(os.path.join(ROOT, 'README.md'), encoding='utf-8').read()
    sec = txt.split('## Управление', 1)[1].split('\n## ', 1)[0]
    rows = [[c.strip() for c in ln.strip().strip('|').split('|')] for ln in sec.splitlines() if ln.startswith('|') and '---' not in ln]
    rows = [(set(re.findall(r'[A-Za-z0-9]+|[←→↑↓]|ЛКМ|ПКМ|Пробел', k)), a.lower()) for k, a in rows[1:] if a]
    out, bad = [], []
    name = lambda code: ARROW.get(code) or code.replace('Key', '')
    for code, (typ, n) in keys['ACT_KEYS'].items():
        if not any(name(code) in ks and ACT_WORD[n] in a for ks, a in rows): bad.append(f'{name(code)} → {n}')
    for code, (ax, v) in keys['MV_KEYS'].items():
        if not any(name(code) in ks and MV_WORD[(ax, v)] in a for ks, a in rows): bad.append(f'{name(code)} → {MV_WORD[(ax, v)]}')
    for mod, word in (('S', 'корпус'), ('W', 'сильн')):   # punchMod(): S / W held at the moment of the punch
        if not any(mod in ks and word in a for ks, a in rows): bad.append(f'{mod} + удар → {word}')
    known = {name(c) for c in keys['ACT_KEYS']} | {name(c) for c in keys['MV_KEYS']} | {'Esc', 'F3'}
    extra = sorted({k for ks, a in rows for k in ks if re.fullmatch(r'[A-Za-z0-9]+', k) and k not in known})
    if extra: bad.append('в README лишние клавиши: ' + ', '.join(extra))
    out.append(('✓' if not bad else '✗') + ' README «Управление» совпадает с MV_KEYS / ACT_KEYS' + ('' if not bad else ': ' + '; '.join(bad)))
    return out


async def run():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    bad = 0
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, w, h, touch in [('ПК 1280x720', 1280, 720, False), ('тач 740x360', 740, 360, True)]:
            pg = await b.new_page(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch)
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(f'http://127.0.0.1:{port}/gtest.html')
            await pg.wait_for_function("document.getElementById('loading').hidden || document.querySelector('.err')", timeout=240000)
            lines = await pg.evaluate(JS, touch)
            lines += await pg.evaluate(HEADS_JS)
            lines += await pg.evaluate(HINTS_JS)
            if not touch:
                lines += readme_check(await pg.evaluate('window.__tut.keys()'))
            print(f'── {name} ' + '─' * 40)
            for ln in lines:
                print('  ' + ln)
                if ln.startswith('✗'):
                    bad += 1
            for e in dict.fromkeys(errs):
                print('  PAGEERROR: ' + e[:300]); bad += 1
            await pg.close()
        await b.close()
    srv.shutdown()
    print('ИТОГ: ' + ('все шаги засчитаны' if not bad else f'ошибок: {bad}'))
    return 1 if bad else 0

sys.exit(asyncio.run(run()))
