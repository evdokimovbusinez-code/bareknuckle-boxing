import asyncio, sys, json
from playwright.async_api import async_playwright
# usage: gp.py W H step...   step = "js::<code>" | "wait::<ms>" | "shot::<name>" | "key::<k>"
async def main():
    W, H = int(sys.argv[1]), int(sys.argv[2])
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'])
        import os; pg = await b.new_page(viewport={'width':W,'height':H}, device_scale_factor=float(os.environ.get('DSF','1')))
        logs=[]
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto('http://localhost:8766/gtest.html')
        try:
            await pg.wait_for_function("document.getElementById('loading').hidden || document.querySelector('.err')", timeout=150000)
        except Exception as e:
            logs.append('LOAD TIMEOUT')
        for st in sys.argv[3:]:
            k, _, v = st.partition('::')
            try:
                if k == 'js':
                    r = await pg.evaluate(v)
                    if r is not None: print('R', r if isinstance(r, str) else json.dumps(r))
                elif k == 'wait': await pg.wait_for_timeout(int(v))
                elif k == 'shot': await pg.screenshot(path=f'{v}.png', timeout=180000)
                elif k == 'key': await pg.keyboard.press(v)
                elif k == 'until': await pg.wait_for_function(v, timeout=120000)
            except Exception as e:
                print('STEP FAIL', st[:60], str(e)[:300])
        seen=set()
        for l in logs:
            if 'GL Driver' in l or 'FBXLoader' in l or 'Failed to load resource' in l or l in seen: continue
            seen.add(l); print(l[:500])
        await b.close()
asyncio.run(main())
