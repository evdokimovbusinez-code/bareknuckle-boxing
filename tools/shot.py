"""Headless screenshots of the game for checking visual work (Chrome + SwiftShader, so slow but deterministic).
usage: python3 tools/shot.py OUT.png SCENARIO [JS|SEC] [WxH] [touch]     (e.g. ... js "CODE" 740x360 touch — a phone in landscape)
  menu            main menu as it opens
  fight [SEC]     quick fight, simulated SEC seconds (default 4) of fighting, then the shot
  js "CODE"       runs CODE in the page (window.__g has G,P1,P2,camera,scene,...; __tick(n,dt) steps the sim), then the shot.
                  Inside CODE `await __shot('tag')` saves an extra frame as OUT-tag.jpg (several screens in one run).
                  A line `//--RELOAD--` in CODE reloads the page there (localStorage stays); the code after it runs in the fresh page
  ... WxH [touch] settle   `settle` (or SHOT_SETTLE=1): before every shot wait until the CSS transitions / animations of the
                  menu screens have finished (max 3 s), so a shot does not catch a screen half-way through its slide-in
Environment: SHOT_VP=844x390 sets the viewport (default 1280x720), SHOT_TOUCH=1 emulates a phone (coarse pointer, the TOUCH layout).
Needs the debug build gtest.html (made by tools/check.sh) served on :8766 (tools/shot.sh does all of that)."""
import asyncio, os, sys
from playwright.async_api import async_playwright

# the screens that slide / fade in (src/g_head.html); HUD popups, hp bars and looping animations are not waited for
SETTLE_SEL = '#vs,#dlg,#result,#menu,#quick,#net,#creator,#shop,#social,#story,#settings,#credits,#pause,#tut-ask,#tut'
SETTLE_JS = '''async () => { const t0 = performance.now();
  for (;;) { const a = document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.target
      && a.effect.target.closest && a.effect.target.closest('%s') && a.effect.getComputedTiming().iterations !== Infinity);
    if (!a.length) return Math.round(performance.now() - t0);
    if (performance.now() - t0 > 3000) return -a.length;
    await new Promise(r => setTimeout(r, 40)); } }''' % SETTLE_SEL


async def settle(pg):
    """Wait for the CSS transitions of the menu screens (they run in real time even while the game is stepped by hand).
    Returns the ms waited, or -N when N animations were still running after 3 s."""
    return await pg.evaluate(SETTLE_JS)


async def main():
    out, sc = sys.argv[1], sys.argv[2]; arg = sys.argv[3] if len(sys.argv) > 3 else ''
    vp = sys.argv[4] if len(sys.argv) > 4 else os.environ.get('SHOT_VP', '1280x720'); touch = 'touch' in sys.argv[5:] or bool(os.environ.get('SHOT_TOUCH'))
    settled = 'settle' in sys.argv[4:] or bool(os.environ.get('SHOT_SETTLE'))
    if vp == 'settle': vp = os.environ.get('SHOT_VP', '1280x720')
    w, h = (int(v) for v in vp.split('x'))
    fmt = {'type': 'jpeg', 'quality': 80} if out.lower().endswith(('.jpg', '.jpeg')) else {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
                                                                                    '--enable-precise-memory-info', '--js-flags=--expose-gc'])   # R-23: performance.memory in real bytes + window.gc() for docs/audit/scenarios/simprof.js
        pg = await b.new_page(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch)
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        async def extra(tag):
            base, ext = os.path.splitext(out); path = f'{base}-{tag}{ext}'
            if settled: await settle(pg)
            await pg.evaluate("__step(1, 1/60)"); await pg.screenshot(path=path, **fmt); print('saved', path)
        await pg.expose_function('__shot', extra)
        await pg.goto(f"http://localhost:{os.environ.get('SHOT_PORT', '8766')}/gtest.html")
        await pg.wait_for_function("document.getElementById('loading').hidden || document.querySelector('.err')", timeout=240000)
        if sc == 'menu': await pg.evaluate("__step(2, 1/60)")
        elif sc == 'fight':
            sec = float(arg or 4)
            await pg.evaluate("document.getElementById('go').click()")
            await pg.evaluate(f"(() => {{ __tick(300, 1/60); const n = Math.round({sec} * 60); for (let i = 0; i < n; i += 30) __tick(30, 1/60); __step(1, 1/60); }})()")
        elif sc == 'js':
            first, _, after = arg.partition('//--RELOAD--')   # a line `//--RELOAD--` in CODE: the page is reloaded there (localStorage stays) and the rest runs in the fresh page — to check that a save survives
            r = await pg.evaluate(f"(async () => {{ {first}\n }})()")
            if r is not None: print('JS RESULT:', r)
            await pg.evaluate("__step(1, 1/60)")
            if after.strip():
                await pg.reload(); await pg.wait_for_function("document.getElementById('loading').hidden || document.querySelector('.err')", timeout=240000)
                r = await pg.evaluate(f"(async () => {{ {after}\n }})()")
                if r is not None: print('AFTER RELOAD:', r)
                await pg.evaluate("__step(1, 1/60)")
        # JPEG keeps a shot ~150 KB (a 1280x720 PNG is >1 MB, too big for the bot to read back)
        if settled: await settle(pg); await pg.evaluate("__step(1, 1/60)")
        await pg.screenshot(path=out, **fmt)
        print('saved', out)
        for l in dict.fromkeys(logs):
            if not any(k in l for k in ('GL Driver', 'Failed to load resource', 'FBXLoader')): print(l[:400])
        await b.close()
if __name__ == '__main__': asyncio.run(main())
