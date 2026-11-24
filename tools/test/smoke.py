"""R-01 — the smoke set: the audit scenarios (docs/audit/scenarios/) on a desktop and a phone screen.

  python3 tools/test/smoke.py [OUT.jpg] [--only menu,fight] [--vp desk,phone]
  bash tools/shot.sh /tmp/shots/s.jpg smoke          (the same, after rebuilding gtest.html)

Runs menu.js, fight.js, modes.js, phone.js, result.js (R-09), resil.js (R-26: hidden tab → pause, lost WebGL context, error toast), patrol.js (R-18: story chapter 2) at 1280×720 (desk) and 740×360 touch (phone), each in a fresh browser context
(clean localStorage, so the first-visit offer and the default profile are what a new player gets). Fails (exit code 1) on:
  · any `pageerror` (an uncaught exception, also one thrown inside a click handler) or `console.error`;
  · the game not loading (the `.err` box) or a scenario that throws / times out;
  · a state a scenario must reach and did not (`fight`, `kd`, `ko`, `replay`, `result`, `talk` — see NEED);
  · a menu screen that did not open (menu.js logs `tag:visible screens`, the tag's own screen must be among them);
  · R-09: the result card check of result.js (overlapping texts, a font / button too small, a head under the card) logs FAIL.
Every value G.state takes is recorded through a setter put on G.state, so a state that lasts one frame inside __tick(n) counts.
Prints a table per run: time, states reached, the smallest tap target over all frames (CSS px, buttons / inputs / swatches)
and the simulation step (ms per __tick frame, no rendering). Frames: OUT-desk-fight-f4.jpg, … ; OUT itself = the last frame.
Each frame waits for the CSS transitions of the screens first (tools/shot.py `settle`).
Its own http.server is started here (like tools/test/mp_test.py), so it does not depend on tools/shot.sh's port.
"""
import asyncio, functools, http.server, os, sys, threading, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from shot import settle  # noqa: E402  (the CSS-transition wait of tools/shot.py)

SCEN = ['menu', 'fight', 'modes', 'phone', 'result', 'resil', 'patrol']
VPS = {'desk': (1280, 720, False), 'phone': (740, 360, True)}
# states each scenario must pass through (G.state); the union covers fight, kd, ko, replay, result, talk
NEED = {'menu': [], 'fight': ['fight', 'kd', 'ko', 'replay', 'result'], 'modes': ['fight', 'talk', 'result'],
        'phone': ['fight', 'ko', 'result'], 'result': ['fight', 'ko', 'replay', 'result'], 'resil': ['fight'],
        'patrol': ['talk', 'fight', 'ko', 'replay', 'result']}   # R-18: story chapter 2 «Патруль»: dialog, baton fight, KO → result, 60 s on the feet → result
# R-26: resil.js throws on purpose inside frame() to see the error toast; that one error (and only it) is not a failure
OWN_ERR = 'R-26 test'
# console lines that are not errors of the game: Chrome/SwiftShader chatter (+ the browser's own /favicon.ico 404, by URL)
IGNORE = ('GL Driver Message', 'GPU stall due to ReadPixels', 'KHR_parallel_shader_compile')
MENU_SCR = {'main': 'menu', 'main2': 'menu', 'train': 'menu'}   # menu.js tag → the element that must be visible (else id = tag)
SCEN_TIMEOUT =420   # s per scenario (software rendering; a normal run takes 20–90 s)

HOOK = r'''() => {
  const G = __g.G; let s = G.state;
  const K = window.__smk = { states: {}, seq: [s], tickMs: 0, tickN: 0, taps: [] };
  Object.defineProperty(G, 'state', { configurable: true, enumerable: true, get: () => s,
    set: v => { if (v !== s) { K.seq.push(v); K.states[v] = (K.states[v] || 0) + 1; } s = v; } });
  const tick = window.__tick;   // the simulation step without rendering (src/assemble.py, debug build)
  window.__tick = (n, dt) => { const t0 = performance.now(); try { tick(n, dt); } finally { K.tickMs += performance.now() - t0; K.tickN += n; } };
}'''
# the smallest visible tap target (same rule as docs/audit/scenarios/phone.js)
TAPS = r'''tag => { const r = [...document.querySelectorAll('button, .sw, [role=button], input, select')].filter(e => e.offsetParent !== null)
  .map(e => { const b = e.getBoundingClientRect(); return [Math.round(Math.min(b.width, b.height)), (e.id || e.textContent || e.className || '').trim().slice(0, 16)]; })
  .filter(x => x[0] > 0).sort((a, b) => a[0] - b[0]);
  if (r.length) __smk.taps.push([r[0][0], r[0][1], tag, r.filter(x => x[0] < 40).length]); }'''


def args():
    a = sys.argv[1:]; out, only, vps = '/tmp/shots/smoke.jpg', SCEN, list(VPS)
    while a:
        x = a.pop(0)
        if x == '--only': only = a.pop(0).split(',')
        elif x == '--vp': vps = a.pop(0).split(',')
        else: out = x
    return out, only, vps


async def run_one(b, url, base, ext, vp, sc, fmt):
    w, h, touch = VPS[vp]
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch)
    pg = await ctx.new_page()
    errs, shots = [], []
    pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}') if not (sc == 'resil' and OWN_ERR in str(e)) else None)
    pg.on('console', lambda m: errs.append(f'console.error: {m.text}' + (f" ({m.location.get('url', '')})" if m.location.get('url') else ''))
          if m.type == 'error' and not any(k in m.text for k in IGNORE) and not m.location.get('url', '').endswith('/favicon.ico') else None)

    async def shot(tag):
        path = f'{base}-{vp}-{sc}-{tag}{ext}'
        await settle(pg)
        await pg.evaluate('__step(1, 1/60)')
        await pg.evaluate(f'({TAPS})({tag!r})')
        await pg.screenshot(path=path, **fmt); shots.append(path)
    await pg.expose_function('__shot', shot)
    t0 = time.time(); r = {'vp': vp, 'sc': sc, 'fail': []}
    try:
        await pg.goto(url)
        # wait for the loading screen to go; an uncaught error during boot fails at once (5 s grace) instead of after 240 s
        t_err = None
        while not await pg.evaluate("document.getElementById('loading').hidden || !!document.querySelector('.err')"):
            if errs and t_err is None: t_err = time.time()
            if t_err and time.time() - t_err > 5: raise RuntimeError('the game did not load after an error')
            if time.time() - t0 > 240: raise TimeoutError('the game did not load in 240 s')
            await asyncio.sleep(0.25)
        if await pg.evaluate("!!document.querySelector('.err')"):
            r['fail'].append('load: ' + (await pg.evaluate("document.querySelector('.err').textContent"))[:200])
        else:
            await pg.evaluate(HOOK)
            code = f"return await eval(await (await fetch('docs/audit/scenarios/{sc}.js')).text())"
            r['log'] = await asyncio.wait_for(pg.evaluate(f'(async () => {{ {code}\n }})()'), SCEN_TIMEOUT)
            k = await pg.evaluate('__smk')
            r['seq'] = k['seq']; r['states'] = k['states']; r['taps'] = k['taps']
            r['sim'] = k['tickMs'] / max(1, k['tickN']); r['frames'] = k['tickN']
            miss = [s for s in NEED[sc] if s not in k['states']]
            if miss: r['fail'].append('state not reached: ' + ', '.join(miss))
            if sc == 'menu':   # menu.js logs `tag:visible screens`; each tag must show its own screen
                dead = [e for e in (r['log'] or '').split(' | ') if ':' in e
                        and MENU_SCR.get(e.split(':')[0], e.split(':')[0]) not in e.split(':', 1)[1].split(',')]
                if dead: r['fail'].append('screen did not open: ' + ', '.join(dead))
            if sc == 'result' and 'FAIL' in (r['log'] or ''):   # R-09: overlapping texts, small fonts / buttons, heads under the card
                r['fail'].append('result card: ' + r['log'].split('FAIL', 1)[1][:300])
    except Exception as e:   # a throw in the scenario itself, a timeout, a crashed page
        r['fail'].append(f'{type(e).__name__}: {str(e).splitlines()[0][:300] if str(e) else ""}')
    await asyncio.sleep(0.2)   # late console messages
    r['errs'] = list(dict.fromkeys(errs))
    if r['errs']: r['fail'].append(f"{len(r['errs'])} error(s) in the page")
    r['t'] = time.time() - t0; r['shots'] = shots
    await ctx.close()
    return r


def table(res):
    print('\n| экран | сценарий | время, с | состояния (порядок) | мин. цель нажатия | целей < 40 px | шаг симуляции, мс | итог |')
    print('|---|---|---|---|---|---|---|---|')
    for r in res:
        seq = ' → '.join(dict.fromkeys(r.get('seq', []))) or '—'
        taps = r.get('taps') or []
        m = min(taps, key=lambda x: x[0]) if taps else None
        tap = f'{m[0]} px «{m[1]}» ({m[2]})' if m else '—'
        under = max((x[3] for x in taps), default=0)
        sim = f"{r['sim']:.2f} ({r['frames']} кадров)" if r.get('frames') else '—'
        print(f"| {r['vp']} | {r['sc']} | {r['t']:.0f} | {seq} | {tap} | {under} | {sim} | {'OK' if not r['fail'] else 'FAIL'} |")


async def main():
    out, only, vps = args()
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    base, ext = os.path.splitext(out)
    fmt = {'type': 'jpeg', 'quality': 80} if ext.lower() in ('.jpg', '.jpeg') else {}
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/gtest.html'
    T0 = time.time(); res = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for vp in vps:
            for sc in only:
                print(f'── {vp} {VPS[vp][0]}x{VPS[vp][1]}{" touch" if VPS[vp][2] else ""} · {sc}.js', flush=True)
                r = await run_one(b, url, base, ext, vp, sc, fmt); res.append(r)
                print(f"   {r['t']:.0f} s, {len(r['shots'])} frames, {'OK' if not r['fail'] else 'FAIL: ' + '; '.join(r['fail'])}")
                if r.get('log'): print('   log:', str(r['log'])[:1200])
                for e in r['errs'][:8]: print('   !', e[:400])
                sys.stdout.flush()
        await b.close()
    last = [s for r in res for s in r['shots']]
    if last:
        with open(last[-1], 'rb') as f, open(out, 'wb') as g: g.write(f.read())
    table(res)
    need = sorted({s for sc in only for s in NEED[sc]})
    seen = {s for r in res for s in r.get('states', {})}
    print(f"\nсостояния, которые нужны: {', '.join(need)}; не достигнуты: {', '.join(s for s in need if s not in seen) or 'нет'}")
    bad = [r for r in res if r['fail']]
    print(f"всего {time.time() - T0:.0f} s, прогонов {len(res)}, провалов {len(bad)}, снимков {len(last)} ({base}-*{ext})")
    print('SMOKE ' + ('OK' if not bad else 'FAIL'))
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
