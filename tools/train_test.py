"""Issue 50 — the training mini-games: run the jump rope and the mitts through the REAL input funnels
  (trainTick/trainInput/trainKey/pointer events), check the grades, the XP payout, the once-a-day rule,
  the stat cap and that the reward survives a reload. Then a regression pass: after leaving a drill a
  quick fight and the heavy bag still work, Esc/pause behave, the console stays clean.

    python3 tools/train_test.py
Needs gtest.html (bash tools/check.sh). Prints ✓/✗ lines and exits 1 on any failure.
"""
import asyncio, functools, http.server, json, os, sys, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

JS = r"""(touch) => {
  const out = [], G = window.__g.G;
  const ok = (c, m) => { out.push((c ? '✓ ' : '✗ ') + m); };
  const T = window.__train;
  const reset = (o) => T.set(Object.assign({ xp: { pow: 0, spd: 0, chin: 0, sta: 0 }, stats: { pow: 0, spd: 0, chin: 0, sta: 0 }, done: {} }, o || {}));

  // ── 1. скакалка: ideal presses (trainInput at the exact beat) → S, first run of the day pays in full ──
  reset();
  const rp = T.play('rope', 'perfect');
  ok(rp.grade === 'S', 'скакалка: идеальные прыжки → оценка ' + rp.grade + ' (нужна S), попаданий ' + rp.hits);
  ok(rp.gain === 60 && rp.xp.sta === 60 && rp.xp.spd === 60, 'скакалка: полная награда +' + rp.gain + ' опыта → дыхалке и скорости (xp sta=' + rp.xp.sta + ' spd=' + rp.xp.spd + ')');

  // ── 2. the same drill again the same day pays 25 % ──
  const rp2 = T.play('rope', 'miss');
  ok(rp2.grade === 'C', 'скакалка: одни промахи → оценка ' + rp2.grade + ' (нужна C), промахов ' + rp2.misses);
  ok(rp2.gain === 5, 'скакалка: повтор в тот же день → +' + rp2.gain + ' опыта (25 % от C=18, округление)');

  // ── 3. every 100 XP buys +1 to the stat; the cap of renderStats (5) holds ──
  reset({ xp: { sta: 95 }, stats: { sta: 0 } });
  const rp3 = T.play('rope', 'perfect');
  ok(rp3.stats.sta === 1 && rp3.xp.sta === 55, 'скакалка: 100 опыта → +1 «Дыхалке» (sta=' + rp3.stats.sta + ', xp=' + rp3.xp.sta + ')');
  reset({ xp: { sta: 90 }, stats: { sta: 5 } });
  const rp4 = T.play('rope', 'perfect');
  ok(rp4.stats.sta === 5 && rp4.xp.sta <= 99, 'предел характеристик: sta=' + rp4.stats.sta + ', xp=' + rp4.xp.sta + ' (не выше 5 пипсов)');

  // ── 4. лапы: wrong/late punches reset the combo → C; the called combo hit on time → S ──
  reset();
  const mp = T.play('mitts', 'miss');
  ok(mp.grade === 'C', 'лапы: сбитые комбо → оценка ' + mp.grade + ' (нужна C)');
  ok(mp.gain === 18 && mp.xp.spd >= 18 && mp.xp.pow >= 18, 'лапы: полная награда +18 → скорости и силе (spd=' + mp.xp.spd + ', pow=' + mp.xp.pow + ')');
  reset();
  const m2 = T.play('mitts', 'perfect');
  ok(m2.grade === 'S', 'лапы: идеальные комбо → оценка ' + m2.grade + ' (нужна S), попаданий ' + m2.hits);

  // ── 5. the real input path ──
  const kd = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
  const ku = (code, key) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true, cancelable: true }));
  const stage = document.getElementById('stage');
  const pe = (type, x, y) => stage.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
  // run the countdown in real frames and press at the beat through the game's own handlers
  const toBeat = () => {                     // start is already in 'rules'; get into 'play', then stand one frame before the beat
    const st = T.state();
    if (st.phase !== 'count') T.countdown();
    let n = 0; while (T.state().phase === 'count' && n++ < 400) __tick(1, 1 / 60);
    const s = T.state(); if (!s.next) return 0;
    __tick(Math.max(0, Math.round((s.next.t - s.t - 1 / 60) * 60)), 1 / 60);
    return T.state().next ? T.state().next.action : null;
  };
  if (!touch) {
    // скакалка: Space exactly at the beat (trainKey → ACT/rhythm funnel), Esc exits
    reset();
    T.start('rope'); T.countdown();
    const a1 = toBeat();
    ok(a1 === 'jump' || a1 === 'left' || a1 === 'right', 'скакалка: ритм пошёл, подача ' + a1);
    let h0 = T.state().hits;
    kd('Space', ' '); ku('Space', ' ');
    ok(T.state().hits === h0 + 1, 'клавиатура: Space в такт → прыжок засчитан (hits ' + T.state().hits + ')');
    // a wrong key does not hit (the rope only takes Space / ← →)
    h0 = T.state().hits;
    kd('KeyU', 'u'); ku('KeyU', 'u');
    ok(T.state().hits === h0, 'клавиатура: лишняя клавиша во время скакалки не помогает');
    kd('Escape', 'Escape');
    ok(!T.state().on && G.state === 'menu', 'Esc: из тренировки — сразу в меню (состояние ' + G.state + ')');
    ok(!window.__rope.on && !window.__rope.mesh.visible, 'скакалка убрана со сцены');

    // лапы: U I on the beats = 1-2; a wrong J resets the combo
    reset();
    T.start('mitts'); T.countdown();
    const w0 = toBeat();
    kd('KeyU', 'u'); ku('KeyU', 'u');
    ok(T.state().hits === 1, 'клавиатура: U на подачу «1» → попадание (' + w0 + ')');
    toBeat(); kd('KeyI', 'i'); ku('KeyI', 'i');
    ok(T.state().hits === 2 && T.state().combo === 2, 'клавиатура: I на «2» → серия ×2');
    toBeat(); kd('KeyM', 'n'); ku('KeyM', 'n');   // an uppercut where a hook was called
    ok(T.state().misses >= 1 && T.state().combo === 0, 'клавиатура: неверный удар сбрасывает комбо');
    kd('Escape', 'Escape');
  } else {
    // скакалка на телефоне: any tap jumps
    reset();
    T.start('rope');
    ok(T.state().phase === 'rules', 'тач: карточка правил показана');
    pe('pointerdown', 370, 200); pe('pointerup', 370, 200);
    ok(T.state().phase === 'count', 'тач: тап по экрану запускает отсчёт');
    const a1 = toBeat();
    const h0 = T.state().hits;
    pe('pointerdown', 370, 200); pe('pointerup', 370, 200);
    ok(T.state().hits === h0 + 1, 'тач: тап в такт → прыжок засчитан');
    pe('pointerdown', 370, 50); pe('pointerup', 370, 50);   // tap again too early: a miss, not a second hit
    // лапы на телефоне: a tap = a jab, a swipe up = a cross (punchFromSwipe)
    reset();
    T.start('mitts'); pe('pointerdown', 370, 200); pe('pointerup', 370, 200);
    toBeat();
    pe('pointerdown', 370, 200); pe('pointerup', 370, 200);
    ok(T.state().hits === 1, 'тач: тап по лапе = джеб');
    toBeat();
    pe('pointerdown', 370, 200); pe('pointermove', 370, 150); pe('pointerup', 370, 150);
    ok(T.state().hits === 2, 'тач: свайп вверх = кросс в лапу');
    kd('Escape', 'Escape');
  }

  // ── 6. регресс: быстрый бой и груша после тренировок работают как раньше ──
  reset();
  document.getElementById('go-quick').click();
  document.getElementById('go').click();
  __tick(420, 1 / 60);   // the intro: the stare-down (4.2 s) + «Готовься» (1.25 s)
  ok(G.state === 'fight', 'быстрый бой после тренировок идёт (state=' + G.state + ')');
  kd('Escape', 'Escape');
  ok(G.paused === true, 'Esc в бою — пауза');
  kd('Escape', 'Escape');
  ok(G.paused === false, 'Esc ещё раз — продолжил');
  document.getElementById('p-quit').click();          // «Сдаться» → toMenu
  ok(G.state === 'menu', 'из боя — в меню');

  const pow0 = T.prof().xp.pow;
  document.getElementById('go-bag').click();
  __tick(120, 1 / 60);                                // the intro ends, the round runs
  ok(G.state === 'fight' && window.__g.BAG.on, 'груша запускается как раньше');
  G.roundT = 0.01; __tick(6, 1 / 60);                 // the bell: bagEnd → the result sheet + the XP line
  ok(T.prof().xp.pow > pow0, 'груша: опыт «Силе» капает (pow ' + pow0 + ' → ' + T.prof().xp.pow + ')');
  ok(T.prof().train.done.bag === true, 'груша: суточная отметка повторa');
  ok(document.getElementById('r-car').textContent.includes('силе'), 'груша: итоговая строка с наградой: «' + document.getElementById('r-car').textContent + '»');
  document.getElementById('r-menu').click();
  ok(G.state === 'menu', 'из груши — в меню');

  return { lines: out, prof: T.prof(), day: G.state };
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
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await pg.goto(f'http://127.0.0.1:{port}/gtest.html')
            await pg.wait_for_function("document.getElementById('loading').hidden || document.querySelector('.err')", timeout=240000)
            res = await pg.evaluate(JS, touch)
            print(f'── {name} ' + '─' * 40)
            for ln in res['lines']:
                print('  ' + ln)
                if ln.startswith('✗'):
                    bad += 1
            # the reward survives a reload (localStorage 'ko-ring')
            await pg.reload()
            await pg.wait_for_function("document.getElementById('loading').hidden || document.querySelector('.err')", timeout=240000)
            kept = await pg.evaluate('window.__train.prof()')
            same = kept['xp'] == res['prof']['xp'] and kept['train']['done'] == res['prof']['train']['done']
            print(('  ✓ ' if same else '  ✗ ') + f'пережило перезагрузку: xp={json.dumps(kept["xp"], ensure_ascii=False)} best={json.dumps(kept["train"]["best"], ensure_ascii=False)}')
            if not same:
                bad += 1
            for e in dict.fromkeys(errs):
                if 'Failed to load resource' in e or 'GL Driver' in e: continue
                print('  PAGEERROR/CONSOLE: ' + e[:300]); bad += 1
            await pg.close()
        await b.close()
    srv.shutdown()
    print('ИТОГ: ' + ('все проверки пройдены' if not bad else f'ошибок: {bad}'))
    return 1 if bad else 0

sys.exit(asyncio.run(run()))
