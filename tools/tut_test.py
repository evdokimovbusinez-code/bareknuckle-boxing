"""Issue 45 — drive every tutorial step through the real input pipeline, twice:
  · desktop 1280x720: physical KeyboardEvents (WASD, U I J K N M, Space, Q)
  · touch 740x360: PointerEvents on #pzone (swipes / taps), the stick, БЛОК and stick-flick dodges
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
