"""Headless screenshots of the game for checking visual work (Chrome + SwiftShader, so slow but deterministic).
usage: python3 tools/shot.py OUT.png SCENARIO [JS]
  menu            main menu as it opens
  fight [SEC]     quick fight, simulated SEC seconds (default 4) of fighting, then the shot
  js "CODE"       runs CODE in the page (window.__g has G,P1,P2,camera,scene,...; __tick(n,dt) steps the sim), then the shot
Needs the debug build gtest.html (made by tools/check.sh) served on :8766 (tools/shot.sh does all of that)."""
import asyncio, sys
from playwright.async_api import async_playwright

async def main():
    out, sc = sys.argv[1], sys.argv[2]; arg = sys.argv[3] if len(sys.argv) > 3 else ''
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto('http://localhost:8766/gtest.html')
        await pg.wait_for_function("document.getElementById('loading').hidden || document.querySelector('.err')", timeout=240000)
        if sc == 'menu': await pg.evaluate("__step(2, 1/60)")
        elif sc == 'fight':
            sec = float(arg or 4)
            await pg.evaluate("document.getElementById('go').click()")
            await pg.evaluate(f"(() => {{ __tick(300, 1/60); const n = Math.round({sec} * 60); for (let i = 0; i < n; i += 30) __tick(30, 1/60); __step(1, 1/60); }})()")
        elif sc == 'js':
            r = await pg.evaluate(f"(async () => {{ {arg}\n }})()")
            if r is not None: print('JS RESULT:', r)
            await pg.evaluate("__step(1, 1/60)")
        await pg.screenshot(path=out)
        print('saved', out)
        for l in dict.fromkeys(logs):
            if not any(k in l for k in ('GL Driver', 'Failed to load resource', 'FBXLoader')): print(l[:400])
        await b.close()
asyncio.run(main())
