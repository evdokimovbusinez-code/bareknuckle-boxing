"""Issue 49 — «Бой с другом»: two pages in ONE browser, real PeerJS P2P.

  python3 tools/test/mp_test.py [OUT.jpg]

Page A creates a room («Создать комнату»), page B joins by the ?room=КОД link. B sends real
KeyboardEvents (cross / hooks) through press() → netSendPress() → WebRTC → netHostAI(); the host
computes the fight and streams snapshots back. The test checks that:
  · both pages reach a started match and a live DataConnection;
  · B's punches land on the host's own fighter (P1.hp drops on A);
  · the hp/stamina shown on both pages agree (±1, the ~100 ms interpolation buffer);
  · snapshots arrive on the guest (NET.stat.snaps on A, NET.snaps on B);
  · R-25, with 150 ms of artificial delay each way (__mp.lag): the guest's own punch / dodge / guard is on screen on the
    first frame after the press (≤ 50 ms; without prediction ~400 ms), a press the host refuses rolls back in ~80 ms,
    after 60 s of fight the men stand within 5 cm on both pages, hp agrees (±1), the buffer stays in 60–160 ms,
    the trunks of host and guest differ (OUT-pred-guest.jpg / OUT-pred-host.jpg: the same instant on both pages);
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
        # the host's settings: «Двор», 1 round of 1 min, sparring gear — the guest must get them
        await A.evaluate("""(() => { for (const b of document.querySelectorAll('#net-loc button')) if (b.textContent.includes('Двор')) b.click();
            document.querySelector('#net-len button:nth-child(1)').click(); document.querySelector('#net-rules button:nth-child(2)').click(); document.querySelector('#net-mode button:nth-child(2)').click(); })()""")
        print('  настройки хоста:', await A.evaluate('__mp.cfg()'))
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

        for _ in range(30):       # intro → fight (a street place adds the camera fly-round)
            await step()
            if await A.evaluate("__g.G.state === 'fight'") and await B.evaluate("__g.G.state === 'fight'"):
                break
        await wait(A, "__g.G.state === 'fight'", 20)
        await wait(B, "__g.G.state === 'fight'", 20)
        cf = "JSON.stringify([__g.G.loc, __g.P1.gear.spar, __g.P2.gear.spar, __mp.cfg().len, __mp.cfg().rounds, __mp.cfg().mode])"
        ca, cb = await A.evaluate(cf), await B.evaluate(cf)
        print('  настройки у хоста / гостя:', ca, cb)
        if ca != cb or '"yard"' not in ca or 'true' not in ca or '"blood"' not in ca:
            print('  ✗ гость не получил настройки хоста'); bad += 1
        else:
            print('  ✓ место, время раунда и правила у гостя те же')
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
        for _ in range(3):
            await step(10, 0.3)   # let the last punches land and their snapshot reach the guest (a backed-up channel skips some)

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

        # ── R-25: 150 ms of artificial delay each way (NET.lag, on the pages' own clocks); the guest predicts his own man ──
        print('  — R-25: задержка 150 мс в каждую сторону —')
        bt = "(() => { const b = F => { const L = F.gear.look || {}, x = L.bottom; return typeof x === 'string' ? x : x && x.id ? x.id + ':' + (x.color || '') : 'shorts:' + (L.shorts || 'red'); }; return [b(__g.P1), b(__g.P2)]; })()"
        ba, bb = await A.evaluate(bt), await B.evaluate(bt)
        print('  низ бойцов [хост, гость]: у хоста', ba, 'у гостя', bb)
        if ba != bb or ba[0] == ba[1]:
            print('  ✗ трусы хоста и гостя одного цвета (или разные на двух страницах)'); bad += 1
        else:
            print('  ✓ трусы хоста и гостя разного цвета, на обеих страницах одинаково')
        await A.evaluate('__mp.lag(150)'); await B.evaluate('__mp.lag(150)')
        # the host's man only stands there: keep both alive and the round going for the minute below
        keep = "(() => { const g = __g; g.G.roundT = Math.max(g.G.roundT, 40); for (const F of [g.P1, g.P2]) F.hp = F.hpCap = 100; })()"
        KEY = "k => { for (const t of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(t, { code: k, key: k.slice(-1).toLowerCase(), bubbles: true })); }"

        async def fine(n, chunk=2):   # the two pages take turns every `chunk` frames, so the delay between them is what NET.lag says
            for _ in range(0, n, chunk):
                await A.evaluate(f'__tick({chunk}, 1/60)'); await asyncio.sleep(0.004)
                await B.evaluate(f'__tick({chunk}, 1/60)'); await asyncio.sleep(0.004)

        async def first_frame(act, expr, limit=90):   # frames (1/60 s) from the press to the first guest frame where `expr` holds
            await fine(50); await A.evaluate(keep)
            await act()
            for f in range(1, limit + 1):
                await B.evaluate('__tick(1, 1/60)'); await asyncio.sleep(0.003)
                if await B.evaluate(expr):
                    return f
                await A.evaluate('__tick(1, 1/60)'); await asyncio.sleep(0.003)
            return limit + 1

        await A.evaluate(keep); await fine(60)
        ms = lambda f: round(f * 1000 / 60)
        # before: prediction off — the punch is first seen when the host's stream gets to it
        await B.evaluate('__mp.predOff(true)')
        old = [await first_frame(lambda: B.evaluate(KEY, 'KeyI'), "(p => p.sCur === p.seq)(__mp.pred())") for _ in range(3)]
        await B.evaluate('__mp.predOff(false)')
        shown = "__mp.pred().shown > 0.02"
        new = {}
        for name, act in [('удар', lambda: B.evaluate(KEY, 'KeyI')), ('удар 2', lambda: B.evaluate(KEY, 'KeyJ')), ('удар 3', lambda: B.evaluate(KEY, 'KeyU')),
                          ('уклон', lambda: B.evaluate("__mp.dodge('duck')")), ('блок', lambda: B.evaluate('__mp.block(true)'))]:
            new[name] = await first_frame(act, shown)
            if name == 'удар':   # the host has not even got the press yet
                print('    в этот кадр у хоста:', await A.evaluate('__mp.hostAct()'), 'у гостя:', await B.evaluate("(p => ({ cur: p.cur, seq: p.seq, w: +p.w.toFixed(2) }))(__mp.pred())"))
        await B.evaluate('__mp.block(false)')
        print('  нажатие → первый кадр анимации, без предсказания (было):', [ms(f) for f in old], 'мс')
        print('  нажатие → первый кадр анимации, с предсказанием:', {k: ms(v) for k, v in new.items()}, 'мс')
        if max(new.values()) * 1000 / 60 > 50:
            print('  ✗ анимация своего действия стартует позже 50 мс'); bad += 1
        else:
            print('  ✓ своё действие видно на первом же кадре (≤ 50 мс при задержке 150 мс)')

        # a punch the host refuses (his copy of the man is stunned): the guest starts it, then rolls back to the stream in ~80 ms
        await fine(60)
        await A.evaluate('__g.P2.stunUntil = __g.G.t + 1.2')
        await B.evaluate(KEY, 'KeyI')
        tr = []
        for _ in range(70):
            await B.evaluate('__tick(1, 1/60)'); tr.append(round(await B.evaluate('__mp.pred().w'), 2)); await asyncio.sleep(0.003)
            await A.evaluate('__tick(1, 1/60)'); await asyncio.sleep(0.003)
        top = max(range(len(tr)), key=lambda i: (tr[i], i)) if tr else 0
        fall = next((i for i in range(top, len(tr)) if tr[i] == 0), len(tr)) - top
        print('  отказ хоста: вес локальной позы по кадрам', tr[:top + fall + 2], f'→ откат {ms(fall)} мс; откатов всего:', await B.evaluate('__mp.pred().back'))
        if max(tr) < 1 or fall > 6:
            print('  ✗ откат при расхождении дольше ~80 мс (или предсказание не стартовало)'); bad += 1
        else:
            print('  ✓ расхождение: плавный откат к снимкам хоста за ~80 мс')

        # 60 s of fight: walk in / out, three punches, a dodge or a block, a second of standing — then compare where the men stand
        thr0, pr0 = await A.evaluate('__g.P2.fs.thr'), await B.evaluate('__mp.pred()')
        dev, PUN, bufs = [], ['KeyI', 'KeyJ', 'KeyU'], []
        for cyc in range(20):
            await A.evaluate(keep)
            await B.evaluate(f'__mp.move({1 if cyc % 2 == 0 else -1}, 0)'); await fine(24)
            await B.evaluate('__mp.move(0, 0)')
            for j in range(3):
                await B.evaluate(KEY, PUN[(cyc + j) % 3]); await fine(22)
            if cyc % 4 == 1:
                await B.evaluate("__mp.dodge('duck')")
            if cyc % 4 == 3:
                await B.evaluate('__mp.block(true)')
            await fine(30); await B.evaluate('__mp.block(false)')
            await fine(60)
            pa, pb = await A.evaluate('__mp.pos()'), await B.evaluate('__mp.pos()')
            dev.append(round(100 * max(abs(pa[0] - pb[0]), abs(pa[1] - pb[1]), abs(pa[2] - pb[2]), abs(pa[3] - pb[3])), 1))
            bufs.append(round(1000 * await B.evaluate('__mp.pred().buf')))
        pr1, thr1 = await B.evaluate('__mp.pred()'), await A.evaluate('__g.P2.fs.thr')
        hpA, hpB = await A.evaluate('__mp.hp()'), await B.evaluate('__mp.hp()')
        print('  60 с боя: расхождение позиций по циклам, см:', dev)
        print(f'  ударов нажато 60, хост выбросил {thr1 - thr0}, гость предсказал {pr1["n"] - pr0["n"]} действий (с уклонами), откатов {pr1["back"] - pr0["back"]}, поздних стартов {pr1["late"] - pr0["late"]}')
        print('  буфер гостя, мс:', min(bufs), '…', max(bufs), ' джиттер, мс:', round(1000 * pr1['jit'], 1), ' отставание проигрывания, мс:', round(1000 * pr1['behind']))
        print('  HP хост / гость после 60 с:', [round(v, 2) for v in hpA], [round(v, 2) for v in hpB])
        if max(dev) > 5 or dev[-1] > 5:
            print('  ✗ позиции разошлись больше чем на 5 см'); bad += 1
        else:
            print(f'  ✓ после 60 с позиции совпадают (макс. {max(dev)} см, в конце {dev[-1]} см)')
        if abs(hpA[0] - hpB[0]) > 1 or abs(hpA[1] - hpB[1]) > 1:
            print('  ✗ HP расходятся больше чем на 1 (задержка 150 мс)'); bad += 1
        else:
            print('  ✓ HP совпадают (±1) при задержке 150 мс')
        if min(bufs) < 60 or max(bufs) > 160:
            print('  ✗ буфер вышел за 60–160 мс'); bad += 1
        # the picture: 7 frames (117 ms) after the press — the guest's man is already punching, the host has not got the press yet
        await A.evaluate(keep); await fine(60)
        await B.evaluate(KEY, 'KeyI')
        for _ in range(7):
            await B.evaluate('__tick(1, 1/60)'); await A.evaluate('__tick(1, 1/60)'); await asyncio.sleep(0.003)
        await B.evaluate('__step(1, 1/60)'); await B.screenshot(path=path('pred-guest'), **FMT)
        await A.evaluate('__step(1, 1/60)'); await A.screenshot(path=path('pred-host'), **FMT)
        print('  снимки:', path('pred-guest'), path('pred-host'), ' хост в этот момент:', await A.evaluate('__mp.hostAct().cur'), ' гость:', await B.evaluate('__mp.pred().cur'))
        await A.evaluate('__mp.lag(0)'); await B.evaluate('__mp.lag(0)')
        for _ in range(3):
            await step(20)

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
        lk = "JSON.stringify([__g.P1.gear.look, __g.P2.gear.look])"
        la, lb = await A.evaluate(lk), await B.evaluate(lk)
        print('  внешность после реванша: хост', la, 'гость', lb)
        if la != lb:
            print('  ✗ после реванша внешность бойцов у хоста и гостя разная'); bad += 1
        else:
            print('  ✓ после реванша внешность та же')

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
