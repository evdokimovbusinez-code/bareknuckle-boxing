"""Issue 49 — «Бой с другом»: two pages in ONE browser, real PeerJS P2P.

  python3 tools/test/mp_test.py [OUT.jpg]

Page A creates a room («Создать комнату»), page B joins by the ?room=КОД link. B sends real
KeyboardEvents (cross / hooks) through press() → netSendPress() → WebRTC → netHostAI(); the host
computes the fight and streams snapshots back. The test checks that:
  · both pages reach a started match and a live DataConnection;
  · B's punches land on the host's own fighter (P1.hp drops on A);
  · the hp/stamina shown on both pages agree (±1, the ~100 ms interpolation buffer);
  · snapshots arrive on the guest (NET.stat.snaps on A, NET.snaps on B);
  · a closed connection shows «Соперник отключился» with the 10 s countdown.
Screenshots: OUT-room.jpg (the code), OUT-host.jpg, OUT-guest.jpg, OUT-drop.jpg, OUT.jpg (drop).
Needs internet (unpkg.com/peerjs@1.5.4 + PeerJS Cloud signalling) and gtest.html (tools/check.sh).
Its own http.server is started here, so it does not depend on tools/shot.sh's port.
"""
import asyncio, functools, http.server, os, sys, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots/mp.jpg'
BASE, EXT = os.path.splitext(OUT)
FMT = {'type': 'jpeg', 'quality': 80} if EXT.lower() in ('.jpg', '.jpeg') else {}


def path(tag):
    return f'{BASE}-{tag}{EXT}'


async def wait(pg, expr, sec=60):
    await pg.wait_for_function(expr, timeout=sec * 1000)


async def run():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/gtest.html'
    bad = 0
    logsA, logsB = [], []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        A = await b.new_page(viewport={'width': 1280, 'height': 720})
        B = await b.new_page(viewport={'width': 1280, 'height': 720})
        A.on('pageerror', lambda e: logsA.append(str(e)))
        B.on('pageerror', lambda e: logsB.append(str(e)))

        # ── A: open the «Бой с другом» screen and create a room through the real buttons ──
        await A.goto(url)
        await wait(A, "document.getElementById('loading').hidden || document.querySelector('.err')", 240)
        await A.evaluate("document.getElementById('go-net').click()")
        await A.evaluate("document.getElementById('net-create').click()")
        await wait(A, "window.__mp && __mp.stat().ready && __mp.code().length === 6", 60)
        code = await A.evaluate('__mp.code()')
        print(f'  комната: {code}  ссылка: {await A.evaluate("__mp.link()")}')
        await A.evaluate('__step(1, 1/60)')
        await A.screenshot(path=path('room'), **FMT)
        print('  снимок:', path('room'))

        # ── step both sims; the host ticks, the guest plays the snapshots back ──
        # gtest.html is a MANUAL debug build: window.__manual disables requestAnimationFrame, so
        # frame() (and with it the host's netTick → 30 Hz snapshots) only runs while we tick it.
        # WebRTC data lands on the browser's own event loop, hence the small real-time sleeps.
        async def step(n=30, pause=0.10):
            await A.evaluate(f'__tick({n}, 1/60)')
            await asyncio.sleep(pause)
            await B.evaluate(f'__step({n}, 1/60)')
            await asyncio.sleep(0.04)

        # ── B: the shared link auto-joins by code ──
        await B.goto(url + '?room=' + code)
        await wait(B, "document.getElementById('loading').hidden || document.querySelector('.err')", 240)
        await wait(A, "__mp.stat().started && __mp.stat().conn", 60)
        # pump the host so it actually emits snapshots; the guest receives them on its event loop
        for _ in range(12):
            await step()
            if await B.evaluate("__mp.stat().started && __mp.stat().conn && __mp.stat().recv >= 2"):
                break
        await wait(A, "__mp.stat().started && __mp.stat().conn", 60)
        await wait(B, "__mp.stat().started && __mp.stat().conn && __mp.stat().recv >= 2", 60)
        print('  оба подключены:', await A.evaluate('__mp.stat()'), await B.evaluate('__mp.stat()'))

        for _ in range(3):
            await step()          # intro → fight
        await wait(A, "__g.G.state === 'fight'", 20)
        await wait(B, "__g.G.state === 'fight'", 20)
        print('  раунд начался:', await A.evaluate('__mp.state()'), await B.evaluate('__mp.state()'))

        # B walks in and throws crosses / hooks through the real key pipeline (12_ui.js → press())
        await B.evaluate('__mp.move(1, 0)')
        for i in range(14):
            for key in ('KeyI', 'KeyJ', 'KeyU'):
                await B.evaluate("""k => {
                    window.dispatchEvent(new KeyboardEvent('keydown', { code: k, key: k.slice(-1).toLowerCase(), bubbles: true }));
                    window.dispatchEvent(new KeyboardEvent('keyup',   { code: k, key: k.slice(-1).toLowerCase(), bubbles: true }));
                }""", key)
            await step(30)
        await B.evaluate('__mp.move(0, 0)')

        hpA = await A.evaluate('__mp.hp()')
        hpB = await B.evaluate('__mp.hp()')
        stA, stB = await A.evaluate('__mp.stat()'), await B.evaluate('__mp.stat()')
        print('  HP хост / гость:', hpA, hpB)
        print('  снимки хост:', stA['snaps'], 'байт:', stA['bytes'], 'макс. снимок:', stA['max'], 'пинг:', stA['ping'], 'мс')
        print('  снимков принято гостем:', stB['recv'], 'в буфере:', stB['buf'], 'playT:', round(stB['playT'], 3), 'пинг:', stB['ping'], 'мс')
        if abs(hpA[0] - hpB[0]) > 1 or abs(hpA[1] - hpB[1]) > 1:
            print('  ✗ HP расходятся больше чем на 1'); bad += 1
        else:
            print('  ✓ HP совпадают (±1)')
        if hpA[0] >= 100:
            print('  ✗ удары гостя не дошли до бойца хоста'); bad += 1
        else:
            print('  ✓ удары гостя попали по P1 хоста, hp =', round(hpA[0], 1))
        if stA['snaps'] < 20 or stB['recv'] < 2:
            print('  ✗ снимки не ходят'); bad += 1
        else:
            print('  ✓ снимки идут в обе стороны')
        if stA['ping'] <= 0 or stB['ping'] <= 0:
            print('  ! пинг ещё не измерен (некритично)')

        # ── the guest's man keeps the distance he walked to (he used to drift back to the AI's 1.13 m) ──
        dist = "Math.abs(__g.P1.group.position.x - __g.P2.group.position.x)"
        await B.evaluate('__mp.move(1, 0)')
        for _ in range(4):
            await step(30)
        d0 = await A.evaluate(dist)
        await B.evaluate('__mp.move(0, 0)')
        for _ in range(4):
            await step(30)
        d1 = await A.evaluate(dist)
        print(f'  дистанция: подошёл {d0:.2f} м → отпустил стик {d1:.2f} м')
        if d1 > d0 + 0.1:
            print('  ✗ боец гостя отходит назад сам'); bad += 1
        else:
            print('  ✓ боец гостя стоит, где его оставили')

        # ── a KO: the host plays the replay, the guest sees it too («ПОВТОР»), then both get the result ──
        await A.evaluate("(() => { const g = __g; g.P1.hp = 1; g.knockout(g.P2, g.P1, new g.THREE.Vector3(1, 0, 0), 1.4, 'cross', 1, true); })()")
        seen = {'A': set(), 'B': set()}; recB = False
        for _ in range(60):
            await step(30)
            seen['A'].add(await A.evaluate('__g.G.state')); stB = await B.evaluate('__g.G.state'); seen['B'].add(stB)
            if stB == 'replay' and not await B.evaluate("document.getElementById('rec').hidden"):
                recB = True
            if await B.evaluate('__mp.stat().over') and await A.evaluate('__mp.stat().over'):
                break
        print('  состояния после нокаута: хост', sorted(seen['A']), 'гость', sorted(seen['B']))
        if 'replay' not in seen['A'] or not recB:
            print('  ✗ повтор нокаута не показан (хост / гость)'); bad += 1
        else:
            print('  ✓ повтор нокаута у обоих, у гостя плашка «ПОВТОР»')
        if not (await A.evaluate('__mp.stat().over') and await B.evaluate('__mp.stat().over')):
            print('  ✗ после повтора нет экрана результата'); bad += 1
        else:
            print('  ✓ после повтора — результат у обоих')

        # rematch, so the drop check below runs on a live bout
        await A.evaluate("document.getElementById('r-again').click()")
        for _ in range(3):
            await step()
        print('  реванш:', await A.evaluate('__mp.state()'), await B.evaluate('__mp.stat().over'))

        await A.evaluate('__step(1, 1/60)')
        await A.screenshot(path=path('host'), **FMT)
        await B.evaluate('__step(1, 1/60)')
        await B.screenshot(path=path('guest'), **FMT)
        print('  снимки:', path('host'), path('guest'))

        # ── the guest drops: the host shows the banner and the 10 s countdown ──
        # the debug build is manual, so tick the host ~2 s of sim: the silence watchdog then
        # notices that no input/snapshots arrive (WebRTC's remote 'close' is not guaranteed)
        await B.evaluate('__mp.drop()')
        await asyncio.sleep(0.5)
        await A.evaluate('__step(120, 1/60)')
        drop = await A.evaluate("({ hidden: document.getElementById('net-drop').hidden, t: document.getElementById('net-drop-t').textContent, dropT: __mp.stat().dropT, closes: __mp.stat().closes })")
        print('  отключение:', drop)
        if drop['hidden'] or 'Соперник отключился' not in await A.evaluate("document.getElementById('net-drop').textContent"):
            print('  ✗ баннер «Соперник отключился» не показан'); bad += 1
        else:
            print('  ✓ баннер «Соперник отключился» + обратный отсчёт')
        await A.screenshot(path=OUT, **FMT)
        await A.screenshot(path=path('drop'), **FMT)
        print('  снимки:', OUT, path('drop'))

        for name, logs in [('A', logsA), ('B', logsB)]:
            for e in dict.fromkeys(logs):
                print(f'  PAGEERROR {name}: {e[:300]}'); bad += 1
        await b.close()
    srv.shutdown()
    print('ИТОГ: ' + ('всё работает' if not bad else f'ошибок: {bad}'))
    return 1 if bad else 0


sys.exit(asyncio.run(run()))
