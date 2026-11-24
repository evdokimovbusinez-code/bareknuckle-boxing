"""R-02 — the balance bench: bot players against the AI, many quick fights, CSV + the policy × difficulty table.

  python3 tools/test/balance.py                                   # 4 policies × 3 difficulties × 30 fights
  python3 tools/test/balance.py -p masher -d normal -n 30         # one cell (the «30 fights ≤ 6 min» check)
  python3 tools/test/balance.py -p jabspam,turtle -d easy,hard -n 10 --csv /tmp/b.csv --md /tmp/b.md

Each fight is `__bot.run(policy, diff, 1, {seed, dt, loc})` in the debug build gtest.html (src/bench.js): the bot drives P1
through press() / setBlock() / P1.moveDir, the AI drives P2, frame() is stepped by __tick with nothing drawn, the cutscenes are
skipped, the fight stops at fightOver. Fights are spread over --workers browser pages (one renderer process each, so they run in
parallel); a fight's seed is --seed + its index in the cell, the same on any number of workers.
Columns of the CSV: see BOT_COLS in src/bench.js (result win/loss/draw from P1's side, how ko/tko/dec, round, dur = seconds of
the round clock, thrown / landed / blocked / damage of each man, knockdowns suffered, hp left, the judges' cards, ms of CPU).
Table: share of the bot's wins, mean duration, share of fights ended inside the distance (ko + tko, either way), the bot's and
the AI's accuracy. Needs Chrome + playwright (as tools/shot.py) and node_modules/three, cannon-es (tools/shot.sh installs them).
"""
import argparse, asyncio, csv, functools, http.server, json, math, os, subprocess, sys, threading, time
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
POL = ['masher', 'jabspam', 'turtle', 'mover']
DIF = ['easy', 'normal', 'hard']
DIF_RU = {'easy': 'лёгкий', 'normal': 'норма', 'hard': 'жёсткий'}


def args():
    a = argparse.ArgumentParser(description='R-02 balance bench (bots vs AI)')
    a.add_argument('-p', '--policies', default=','.join(POL))
    a.add_argument('-d', '--diffs', default=','.join(DIF))
    a.add_argument('-n', type=int, default=30, help='fights per policy × difficulty')
    a.add_argument('-w', '--workers', type=int, default=os.cpu_count() or 4, help='browser pages in parallel')
    a.add_argument('--dt', type=float, default=1 / 30, help='s of game time per frame (frame() clamps at 0.05)')
    a.add_argument('--seed', type=int, default=1)
    a.add_argument('--loc', default='gym')
    a.add_argument('--rounds', type=int, default=0, help='0 = the game\'s ROUNDS')
    a.add_argument('--len', type=float, default=0, help='round length, s; 0 = the game\'s ROUND_LEN')
    a.add_argument('--full', action='store_true', help='no fast mode: frame() as in the game (cloth, hair, camera, FX; ~6× slower)')
    a.add_argument('--tune', default='', help='JSON: other values of AI_MEM (08_ai_flow.js) for this run, e.g. \'{"oDodge": 0.5}\'')
    a.add_argument('--ladder', action='store_true', help='R-11: n fights vs each of the 8 LADDER men (own style, trait; -d own = his level): punch mix, pairwise χ²')
    a.add_argument('--last', action='store_true', help='R-11: n fights that start in the last round with the AI behind / level / ahead on the cards: its punches per minute')
    a.add_argument('--csv', default='/tmp/balance.csv')
    a.add_argument('--md', default='', help='write the table (markdown) here too')
    return a.parse_args()


def prepare():
    subprocess.run([sys.executable, 'src/assemble.py'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    nm = os.path.join(ROOT, 'node_modules')
    if not os.path.exists(nm) and os.path.isdir('/home/claude/cc/node_modules'): os.symlink('/home/claude/cc/node_modules', nm)
    if not os.path.isdir(os.path.join(nm, 'three')):
        subprocess.run('npm i --no-save --silent three@0.160.0 cannon-es@0.20.0', shell=True, cwd=ROOT, check=True)


def racc(a):
    """R-10: the bot's accuracy in round 1 → round 2, over the fights that got into round 2 (column p1_rnd = 'thr:land …' per round)"""
    t, n = [[0, 0], [0, 0]], 0
    for r in a:
        rd = [tuple(int(x) for x in s.split(':')) for s in str(r.get('p1_rnd') or '').split()]
        if len(rd) < 2 or rd[1][0] < 5: continue
        n += 1
        for i in (0, 1): t[i][0] += rd[i][0]; t[i][1] += rd[i][1]
    if not n: return '—'
    a1, a2 = t[0][1] / max(1, t[0][0]), t[1][1] / max(1, t[1][0])
    return f'{a1:.0%} → {a2:.0%} (×{a2 / max(1e-9, a1):.2f}, {n})'


def table(rows, pols, difs):
    """the roadmap's table: per policy × difficulty — wins, mean duration, knockouts (+ accuracy)"""
    by = {}
    for r in rows: by.setdefault((r['policy'], r['diff']), []).append(r)
    head = '| политика | ' + ' | '.join(f'{DIF_RU.get(d, d)}: победы · длит. · KO' for d in difs) + ' |'
    out = [head, '|---|' + '---|' * len(difs)]
    det = ['', '| политика × сложность | n | победы | ничьи | KO за бота | по очкам за бота | KO против | все KO/TKO | длит., с | точность бота | бот р1 → р2 (n) | точность ИИ | нокдауны бот / ИИ |',
           '|---|---|---|---|---|---|---|---|---|---|---|---|---|']
    for p in pols:
        cells = []
        for d in difs:
            a = by.get((p, d), [])
            if not a: cells.append('—'); continue
            n = len(a); m = lambda f: sum(f(r) for r in a) / n
            win, ko, dur = m(lambda r: r['result'] == 'win'), m(lambda r: r['how'] != 'dec'), m(lambda r: float(r['dur']))
            cells.append(f'{win:.0%} · {dur:.0f} с · {ko:.0%}')
            acc = lambda k: sum(int(r[k + '_land']) for r in a) / max(1, sum(int(r[k + '_thr']) for r in a))
            det.append(f'| {p} · {DIF_RU.get(d, d)} | {n} | {win:.0%} | {m(lambda r: r["result"] == "draw"):.0%} | {m(lambda r: r["result"] == "win" and r["how"] != "dec"):.0%} | '
                       f'{m(lambda r: r["result"] == "win" and r["how"] == "dec"):.0%} | '
                       f'{m(lambda r: r["result"] == "loss" and r["how"] != "dec"):.0%} | {ko:.0%} | {dur:.0f} | {acc("p1"):.0%} | {racc(a)} | {acc("p2"):.0%} | '
                       f'{m(lambda r: int(r["kd_p1"])):.2f} / {m(lambda r: int(r["kd_p2"])):.2f} |')
        out.append(f'| {p} | ' + ' | '.join(cells) + ' |')
    return '\n'.join(out + det)


LADDER_NM = ['Лом', 'Кабан', 'Грек', 'Шрам', 'Молот', 'Седой', 'Бизон', 'Кувалда']
LAST = ['behind', 'even', 'ahead']
KINDS = ['jab', 'cross', 'hookL', 'hookR', 'upperL', 'upperR', 'over', 'jab_b', 'cross_b', 'hookL_b', 'hookR_b']


def chi2_sf(x, k):
    """P(χ²_k ≥ x) — the regularized upper incomplete gamma Q(k/2, x/2) (series / continued fraction, Numerical Recipes)"""
    a, x = k / 2, x / 2
    if x <= 0: return 1.0
    gl = math.lgamma(a)
    if x < a + 1:
        s = t = 1 / a; n = a
        for _ in range(500):
            n += 1; t *= x / n; s += t
            if abs(t) < abs(s) * 1e-12: break
        return max(0.0, 1 - s * math.exp(-x + a * math.log(x) - gl))
    b = x + 1 - a; c = 1e300; d = 1 / b; h = d
    for i in range(1, 500):
        an = -i * (i - a); b += 2; d = an * d + b; d = d if abs(d) > 1e-300 else 1e-300
        c = b + an / c; c = c if abs(c) > 1e-300 else 1e-300; d = 1 / d; h *= d * c
        if abs(d * c - 1) < 1e-12: break
    return math.exp(-x + a * math.log(x) - gl) * h


def mix_of(rows):
    c = {k: 0 for k in KINDS}
    for r in rows:
        for kv in str(r.get('p2_mix') or '').split():
            k, v = kv.split(':'); c[k] = c.get(k, 0) + int(v)
    return c


def ladder_table(rows):
    """R-11: the AI's punch mix per ladder man (shares) + pairwise χ² test of homogeneity (2 × kinds, kinds with < 10 in both dropped)"""
    by = {}
    for r in rows: by.setdefault(r['opp'], []).append(r)
    men = [m for m in LADDER_NM if m in by]
    mx = {m: mix_of(by[m]) for m in men}
    out = ['| соперник · черта | боёв | ударов | ' + ' | '.join(KINDS) + ' | победы бота | планы (выборы) |', '|---|---|---|' + '---|' * len(KINDS) + '---|---|']
    for m in men:
        c, n = mx[m], sum(mx[m].values()); a = by[m]
        plans = {}
        for r in a:
            for kv in str(r.get('p2_plan') or '').split(): k, v = kv.split(':'); plans[k] = plans.get(k, 0) + int(v)
        out.append(f'| {m} · {a[0]["trait"]} | {len(a)} | {n} | ' + ' | '.join(f'{c[k] / max(1, n):.0%}' for k in KINDS) +
                   f' | {sum(r["result"] == "win" for r in a) / len(a):.0%} | ' + ' '.join(f'{k} {v}' for k, v in sorted(plans.items(), key=lambda kv: -kv[1])) + ' |')
    out += ['', '| χ², p | ' + ' | '.join(men) + ' |', '|---|' + '---|' * len(men)]
    worst = 0
    for i, m in enumerate(men):
        cells = []
        for j, q in enumerate(men):
            if j <= i: cells.append(''); continue
            ks = [k for k in KINDS if mx[m][k] + mx[q][k] >= 10]
            na, nb = sum(mx[m][k] for k in ks), sum(mx[q][k] for k in ks); x2 = 0
            for k in ks:
                tot = mx[m][k] + mx[q][k]
                for obs, nn in ((mx[m][k], na), (mx[q][k], nb)):
                    e = tot * nn / (na + nb); x2 += (obs - e) ** 2 / e if e else 0
            p = chi2_sf(x2, len(ks) - 1); worst = max(worst, p)
            cells.append(f'{p:.1e}' if p < 0.001 else f'**{p:.3f}**' if p >= 0.05 else f'{p:.3f}')
        out.append(f'| {m} | ' + ' | '.join(cells) + ' |')
    out.append(f'\nнаибольшее p = {worst:.2e} ({"все пары различаются, p < 0.05" if worst < 0.05 else "есть пары без различия"})')
    return '\n'.join(out)


def last_table(rows):
    """R-11: the last round with the AI behind / level / ahead on the cards — its punches per minute of the round clock"""
    by = {}
    for r in rows: by.setdefault((r['policy'], r['diff'], r['last']), []).append(r)
    out = ['| бот · сложность | ИИ отстаёт: ударов/мин | ровно | ИИ впереди | отстаёт / ровно | отстаёт / впереди | n |', '|---|---|---|---|---|---|---|']
    for (p, d) in dict.fromkeys((k[0], k[1]) for k in by):
        rate = {s: sum(int(r['p2_thr']) for r in by.get((p, d, s), [])) / max(1e-9, sum(float(r['dur']) for r in by.get((p, d, s), []))) * 60 for s in LAST}
        out.append(f'| {p} · {DIF_RU.get(d, d)} | {rate["behind"]:.1f} | {rate["even"]:.1f} | {rate["ahead"]:.1f} | ×{rate["behind"] / max(1e-9, rate["even"]):.2f} | '
                   f'×{rate["behind"] / max(1e-9, rate["ahead"]):.2f} | {len(by.get((p, d, "behind"), []))} |')
    return '\n'.join(out)


async def run(o):
    pols, difs = o.policies.split(','), o.diffs.split(',')
    jobs = asyncio.Queue()
    for p in pols:
        for d in difs:
            for x in (range(8) if o.ladder else LAST if o.last else [None]):
                for i in range(o.n): jobs.put_nowait((p, d, o.seed + i, x))
    total = jobs.qsize()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler); srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_address[1]}/gtest.html'
    rows, T0, errs = [], time.time(), []
    opt = {'dt': o.dt, 'loc': o.loc}
    if o.rounds: opt['rounds'] = o.rounds
    if o.len: opt['len'] = o.len
    if o.full: opt['lite'] = False
    if o.tune: opt['tune'] = json.loads(o.tune)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(executable_path='/usr/bin/google-chrome',
            args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
                  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'])

        async def worker(k):
            pg = await (await b.new_context(viewport={'width': 320, 'height': 200})).new_page()
            pg.on('pageerror', lambda e: errs.append(f'w{k}: {e}'))
            await pg.goto(url)
            await pg.wait_for_function("document.getElementById('loading').hidden || document.querySelector('.err')", timeout=300000)
            while not jobs.empty():
                p, d, s, x = jobs.get_nowait()
                ex = {'ladder': x} if o.ladder else {'last': x} if o.last else {}
                r = await pg.evaluate('([p, d, o]) => __bot.run(p, d, 1, o).rows[0]', [p, d, {**opt, **ex, 'seed': s}])
                rows.append(r)
                print(f'  [{len(rows):3}/{total}] w{k} {p:8} {d:6} {r["opp"] if o.ladder else r["last"] if o.last else "":8} seed {s:3}: {r["result"]:4} {r["how"]:3} r{r["round"]} {r["dur"]:6.1f} s  '
                      f'P1 {r["p1_land"]}/{r["p1_thr"]}  P2 {r["p2_land"]}/{r["p2_thr"]}  kd {r["kd_p1"]}:{r["kd_p2"]}  ({r["ms"] / 1000:.1f} s)', flush=True)
            await pg.close()

        await asyncio.gather(*(worker(k) for k in range(max(1, min(o.workers, total)))))
        await b.close()
    wall = time.time() - T0
    cols = list(rows[0].keys()) if rows else []
    order = {(p, d): i for i, (p, d) in enumerate((p, d) for p in pols for d in difs)}
    rows.sort(key=lambda r: (order[(r['policy'], r['diff'])], str(r.get('opp')), str(r.get('last')), r['seed']))
    with open(o.csv, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)
    md = ladder_table(rows) if o.ladder else last_table(rows) if o.last else table(rows, pols, difs)
    info = (f'{len(rows)} боёв за {wall:.0f} с ({wall / 60:.1f} мин), {o.workers} стр., dt = {o.dt:.4f} с, площадка {o.loc}, seed {o.seed}…'
            + (', полный frame()' if o.full else '') + (f', AI_MEM {o.tune}' if o.tune else ''))
    print('\n' + md + '\n\n' + info + f'\nCSV: {o.csv}')
    if o.md:
        with open(o.md, 'w') as f: f.write(md + '\n\n' + info + '\n')
    for e in dict.fromkeys(errs): print('PAGEERROR', e[:300])
    return 1 if errs or any(r['result'] == 'timeout' for r in rows) else 0


if __name__ == '__main__':
    o = args(); prepare(); sys.exit(asyncio.run(run(o)))
