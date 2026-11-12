#!/usr/bin/env python3
"""Stage 3 audio, step 1: fetch the source recordings.

Every asset used by the game comes from a page whose license field says CC0
(OpenGameArt) or that states "Creative Commons CC0" (Kenney).  This script
*checks the license text on the source page before downloading anything* —
if a page does not advertise CC0 / CC-BY the file is refused (issue #48:
"если на странице не написано — файл не берём").

It then unpacks the archives, picks the short clips we actually need and
writes the compact intermediate sources into assets/audio/src/ as mono 48 kHz
WAV (the effects) plus Opus files (the music).  Everything is reproducible:
    python3 tools/audio/fetch.py       # needs internet; rewrites src/, SOURCES.json, CREDITS.md
    python3 tools/audio/build.py       # offline; ffmpeg -> sfx.ogg/.m4a, sfx.json, music/

assets/audio/src/ is git-ignored (13 MB of intermediates): a fresh checkout has
to run this fetch.py before build.py.  The game loads only the committed outputs.

The raw downloads live in /tmp/bkb-audio-raw (never in the repo), one fresh
empty directory per pack: downloaded archives are untrusted data.
"""
import json, os, re, shutil, subprocess, sys, urllib.request, urllib.parse, http.cookiejar

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
AUD = os.path.join(ROOT, 'assets', 'audio')
SRC = os.path.join(AUD, 'src')
RAW = '/tmp/bkb-audio-raw'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

# ── sources.  `licenses` is what the page's License(s) field must contain;
#    `page` is the human-readable source URL that goes into CREDITS.md. ──
SOURCES = [
    dict(id='punches', title='Punch', author='qubodup', licenses=['CC0'],
         page='https://opengameart.org/content/punch',
         files=[('https://opengameart.org/sites/default/files/qubodupPunch.7z', 'pack.7z')]),
    dict(id='hits', title='37 hits/punches', author='Independent.nu (ljudbank)', licenses=['CC0'],
         page='https://opengameart.org/content/37-hitspunches',
         files=[('https://opengameart.org/sites/default/files/independent_nu_ljudbank-hits_and_punches.7z', 'pack.7z')]),
    dict(id='kenney', title='Impact Sounds', author='Kenney', licenses=['CC0'],
         page='https://kenney.nl/assets/impact-sounds', kenney='6173736574732f696d706163742d736f756e6473',
         files=[]),
    dict(id='blocks', title='10 Impact/Shield Blocks', author='StarNinjas', licenses=['CC0'],
         page='https://opengameart.org/content/10-impactshield-blocks',
         files=[('https://opengameart.org/sites/default/files/impact_-_starninjas.zip', 'blocks.zip')]),
    dict(id='falls', title='12 wet towel hitting/falling/punching floor sounds', author='qubodup', licenses=['CC0'],
         page='https://opengameart.org/content/12-wet-towel-hittingfallingpunching-floor-sounds',
         files=[('https://opengameart.org/sites/default/files/wet_towel_on_floor.7z', 'falls.7z')]),
    dict(id='swishes', title='Swishes Sound Pack', author='artisticdude', licenses=['CC0'],
         page='https://opengameart.org/content/swishes-sound-pack',
         files=[('https://opengameart.org/sites/default/files/swishes.zip', 'swishes.zip')]),
    dict(id='whoosh', title='Air whoosh', author='pyranostudios', licenses=['CC0'],
         page='https://opengameart.org/content/air-whoosh',
         files=[('https://opengameart.org/sites/default/files/whoosh2_0.wav', 'whoosh.wav')]),
    dict(id='bells', title='Bell dings/chimes', author='PWL', licenses=['CC0'],
         page='https://opengameart.org/content/bell-dingschimes',
         files=[('https://opengameart.org/sites/default/files/bell_ding%d.wav' % i, 'bell_ding%d.wav' % i) for i in range(1, 5)]),
    dict(id='grunts', title='grunts of male death and pain', author='thebardofblasphemy', licenses=['CC0'],
         page='https://opengameart.org/content/grunts-male-death-and-pain',
         files=[('https://opengameart.org/sites/default/files/death%20pain%20grunts.wav', 'grunts.wav')]),
    dict(id='crowd', title='Crowd Shouting/Speaking Ambience', author='StarNinjas', licenses=['CC0'],
         page='https://opengameart.org/content/crowd-shoutingspeaking-ambience',
         files=[('https://opengameart.org/sites/default/files/crowd_shouting_0.ogg', 'crowd.ogg')]),
    dict(id='ooo', title='OoOoOoOoOoOoOo', author='Nocturnal_Vanguard', licenses=['CC0'],
         page='https://opengameart.org/content/oooooooooooooo',
         files=[('https://opengameart.org/sites/default/files/oooooooooo.ogg', 'ooo.ogg')]),
    dict(id='applause', title='Applause in a large hall or church', author='eXpl0it3r', licenses=['CC0'],
         page='https://opengameart.org/content/applause-in-a-large-hall-or-church',
         files=[('https://opengameart.org/sites/default/files/applause-clapping-church-crowd-immersive.wav', 'applause.wav')]),
    dict(id='park', title='Park ambiences', author='Thimras', licenses=['CC0'],
         page='https://opengameart.org/content/park-ambiences',
         files=[('https://opengameart.org/sites/default/files/park_ambience_birds.wav', 'park_birds.wav')]),
    dict(id='dungeon', title='Loopable Dungeon Ambience', author='JaggedStone', licenses=['CC0'],
         page='https://opengameart.org/content/loopable-dungeon-ambience',
         files=[('https://opengameart.org/sites/default/files/dungeon_ambient_1_0.ogg', 'dungeon.ogg')]),
    dict(id='windamb', title='windy ambient noise', author='Some Weirdo', licenses=['CC0'],
         page='https://opengameart.org/content/windy-ambient-noise',
         files=[('https://opengameart.org/sites/default/files/windy_ambiance_0.ogg', 'windamb.ogg')]),
    dict(id='electricrock', title='Electric Rock', author='Pro Sensory', licenses=['CC0'],
         page='https://opengameart.org/content/electric-rock',
         files=[('https://opengameart.org/sites/default/files/rock4_0.mp3', 'electric_rock.mp3')]),
    dict(id='cleanrock', title='Clean Rock', author='Pro Sensory', licenses=['CC0'],
         page='https://opengameart.org/node/174329',
         files=[('https://opengameart.org/sites/default/files/clean_rock_0.mp3', 'clean_rock.mp3')]),
    dict(id='rockloop', title='rocky musicloop', author='johndekale', licenses=['CC0'],
         page='https://opengameart.org/content/rocky-musicloop',
         files=[('https://opengameart.org/sites/default/files/loop.7z', 'loop.7z')]),
]

# ── what we take.  (category, [(source id, path inside the unpacked pack, mode), ...])
#    mode None        = one clip from the whole recording (leading/trailing silence trimmed)
#    ('chunks', n)    = split the recording into n equal parts -> n variations
#    ('segments', n)  = the n longest non-silent passages -> n variations (a grunt reel)
#    ('loop', sec)    = a loopable ambience bed, at most sec seconds
CLIPS = [
    ('faceLight', [
        ('punches', 'qubodupPunch/qubodupPunch01.ogg', None),
        ('punches', 'qubodupPunch/qubodupPunch02.ogg', None),
        ('punches', 'qubodupPunch/qubodupPunch03.ogg', None),
        ('punches', 'qubodupPunch/qubodupPunch04.ogg', None),
        ('punches', 'qubodupPunch/qubodupPunch05.ogg', None),
        ('kenney', 'Audio/impactPunch_medium_000.ogg', None)]),
    ('faceHeavy', [
        ('kenney', 'Audio/impactPunch_heavy_000.ogg', None),
        ('kenney', 'Audio/impactPunch_heavy_001.ogg', None),
        ('kenney', 'Audio/impactPunch_heavy_002.ogg', None),
        ('kenney', 'Audio/impactPunch_heavy_003.ogg', None),
        ('kenney', 'Audio/impactPunch_heavy_004.ogg', None),
        ('hits', 'hits/hit01.mp3.flac', None)]),
    ('body', [
        ('kenney', 'Audio/impactSoft_heavy_000.ogg', None),
        ('kenney', 'Audio/impactSoft_heavy_001.ogg', None),
        ('kenney', 'Audio/impactSoft_heavy_002.ogg', None),
        ('kenney', 'Audio/impactSoft_heavy_003.ogg', None),
        ('kenney', 'Audio/impactSoft_heavy_004.ogg', None),
        ('hits', 'hits/hit02.mp3.flac', None)]),
    ('block', [('blocks', 'impact.%d.ogg' % i, None) for i in range(1, 7)]),
    ('whoosh', [
        ('swishes', 'swishes/swish-1.wav', None),
        ('swishes', 'swishes/swish-2.wav', None),
        ('swishes', 'swishes/swish-4.wav', None),
        ('swishes', 'swishes/swish-7.wav', None),
        ('swishes', 'swishes/swish-9.wav', None),
        ('whoosh', 'whoosh.wav', None)]),
    ('fall', [('falls', 'wet_towel_on_floor/wet_towel_on_floor-%02d.flac' % i, None) for i in range(1, 7)]),
    ('bell', [('bells', 'bell_ding%d.wav' % i, None) for i in range(1, 5)] + [
        ('kenney', 'Audio/impactBell_heavy_000.ogg', None),
        ('kenney', 'Audio/impactBell_heavy_001.ogg', None)]),
    ('count', [
        ('kenney', 'Audio/impactWood_light_000.ogg', None),
        ('kenney', 'Audio/impactWood_light_001.ogg', None),
        ('kenney', 'Audio/impactWood_light_002.ogg', None),
        ('kenney', 'Audio/impactWood_light_003.ogg', None),
        ('kenney', 'Audio/impactGeneric_light_000.ogg', None),
        ('kenney', 'Audio/impactGeneric_light_001.ogg', None)]),
    ('clink', [
        ('kenney', 'Audio/impactMetal_light_000.ogg', None),
        ('kenney', 'Audio/impactMetal_light_001.ogg', None),
        ('kenney', 'Audio/impactMetal_light_002.ogg', None),
        ('kenney', 'Audio/impactMetal_light_003.ogg', None),
        ('kenney', 'Audio/impactMetal_light_004.ogg', None),
        ('kenney', 'Audio/impactTin_medium_000.ogg', None)]),
    ('exhale', [('grunts', 'grunts.wav', ('segments', 6))]),
    ('wave', [('ooo', 'ooo.ogg', ('chunks', 3))]),
    ('applause', [('applause', 'applause.wav', ('chunks', 3))]),
    ('roar', [('crowd', 'crowd.ogg', ('chunks', 3))]),
    ('crowd', [('crowd', 'crowd.ogg', ('loop', 6))]),
    ('ambGym', [('crowd', 'crowd.ogg', ('loop', 6))]),
    ('ambOutdoor', [('park', 'park_birds.wav', ('loop', 6))]),
    ('ambWind', [('windamb', 'windamb.ogg', ('loop', 6))]),
    ('ambIndoor', [('dungeon', 'dungeon.ogg', ('loop', 6))]),
]

MUSIC = [
    ('rock1', 'electricrock', 'electric_rock.mp3'),
    ('rock2', 'cleanrock', 'clean_rock.mp3'),
    ('rock3', 'rockloop', 'loop/loop.ogg'),
]


def opener():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def fetch(url, ref=None):
    h = {'User-Agent': UA}
    if ref:
        h['Referer'] = ref
    return opener().open(urllib.request.Request(url, headers=h), timeout=90).read()


def ffprobe(path, key='format=duration'):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', key, '-of', 'csv=p=0', path],
                         capture_output=True, text=True, timeout=60)
    return out.stdout.strip()


def ffmpeg(*args):
    r = subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', *args],
                       capture_output=True, text=True, timeout=180)
    if r.returncode:
        raise RuntimeError('ffmpeg: ' + r.stderr[-400:])


def non_silent(path):
    """[(start, end)] of the sounding parts, via ffmpeg silencedetect + ffprobe."""
    dur = float(ffprobe(path).split(',')[0] or '0')
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path,
                        '-af', 'silencedetect=noise=-42dB:d=0.06', '-f', 'null', '-'],
                       capture_output=True, text=True, timeout=180)
    starts = [float(x) for x in re.findall(r'silence_start:\s*([\d.]+)', r.stderr)]
    ends = [float(x) for x in re.findall(r'silence_end:\s*([\d.]+)', r.stderr)]
    bounds = sorted([0.0] + ends + starts + [dur])
    # walk the timeline: a silent gap runs from a silence_start to the next silence_end
    silent = []
    for s in starts:
        e = next((x for x in ends if x > s + 1e-4), dur)
        silent.append((s, e))
    if not silent:
        return dur, [(0.0, dur)]
    parts, at = [], 0.0
    for s, e in sorted(silent):
        if s > at + 0.01:
            parts.append((at, min(s, dur)))
        at = max(at, e)
    if at < dur - 0.01:
        parts.append((at, dur))
    return dur, parts or [(0.0, dur)]


def check_license(src):
    """Refuse the file unless the page itself says CC0 (or CC-BY, with attribution)."""
    page = src['page']
    html = fetch(page).decode('utf-8', 'replace')
    m = re.search(r'(?is)field-name-field-art-licenses(.{0,1600}?)</div></div></div>', html)
    names = re.findall(r"<div class='license-name'>(.*?)</div>", m.group(1), re.S) if m else []
    names = [re.sub(r'<[^>]+>', '', x).strip() for x in names]
    if not names:  # Kenney states the license in prose, not in an OGA field
        names = ['CC0'] if re.search(r'(?i)creative commons cc0|CC0', html) else []
    ok = [n for n in names if re.match(r'(?i)^CC0|^CC-BY', n)]
    if not ok:
        raise RuntimeError('license not on the page %s: %s' % (page, names))
    return names


def unpack(pack_dir, arc):
    subprocess.run(['7z', 'x', '-y', '-o' + pack_dir, arc], capture_output=True, text=True, timeout=180)


def clip_specs(path, mode):
    dur, parts = non_silent(path)
    if mode and mode[0] == 'loop':
        sec = min(mode[1], dur)
        return [(0.0, sec)]
    if mode and mode[0] == 'segments':
        n = mode[1]
        best = sorted(parts, key=lambda ab: ab[1] - ab[0], reverse=True)[:n]
        best = sorted(best)
        return [(max(0.0, a - 0.02), min(dur, b + 0.06)) for a, b in best]
    if mode and mode[0] == 'chunks':
        n = mode[1]
        a, b = parts[0][0], parts[-1][1]
        step = (b - a) / n
        return [(a + i * step, min(dur, a + (i + 1) * step)) for i in range(n)]
    a, b = parts[0][0], parts[-1][1]
    return [(max(0.0, a - 0.01), min(dur, b + 0.05))]


def extract(path, spec, out, cap=1.4, loop=False):
    ss, end = spec
    dur = min(cap, end - ss)
    if dur < 0.03:
        raise RuntimeError('clip too short: ' + path)
    fades = 'afade=t=in:st=0:d=0.004'
    if not loop:
        fades += ',afade=t=out:st=%.4f:d=0.025' % max(0.0, dur - 0.028)
    else:
        fades += ',afade=t=in:st=0:d=0.08,afade=t=out:st=%.4f:d=0.12' % max(0.0, dur - 0.13)
    ffmpeg('-ss', '%.4f' % ss, '-t', '%.4f' % dur, '-i', path,
           '-af', fades + ',aformat=sample_rates=48000:channel_layouts=mono',
           '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', out)


def main():
    shutil.rmtree(RAW, ignore_errors=True)
    os.makedirs(RAW)
    os.makedirs(SRC, exist_ok=True)
    for sub in ('clips', 'amb', 'music'):
        d = os.path.join(SRC, sub)
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)

    print('=== license check + download ===')
    dirs, credits = {}, []
    for s in SOURCES:
        names = check_license(s)
        d = os.path.join(RAW, s['id'])
        os.makedirs(d)                      # a fresh empty dir per (untrusted) download
        dirs[s['id']] = d
        if s.get('kenney'):
            kid = s['kenney']
            op = opener()
            op.open(urllib.request.Request(s['page'], headers={'User-Agent': UA}), timeout=30).read()
            j = json.loads(op.open(urllib.request.Request(
                'https://kenney.nl/download-link/' + kid,
                headers={'User-Agent': UA, 'Referer': s['page'], 'Accept': 'application/json'}),
                timeout=30).read().decode())
            data = fetch(j['url'], s['page'])
            arc = os.path.join(d, 'kenney.zip')
            open(arc, 'wb').write(data)
            unpack(d, arc)
        for url, fn in s['files']:
            data = fetch(url, s['page'])
            open(os.path.join(d, fn), 'wb').write(data)
            if fn.endswith(('.7z', '.zip')):
                unpack(d, os.path.join(d, fn))
        credits.append(dict(id=s['id'], title=s['title'], author=s['author'],
                            license=', '.join(names), page=s['page'],
                            files=[urllib.parse.unquote(u.rsplit('/', 1)[-1]) for u, _ in s['files']]
                                  or ['Impact Sounds (Kenney CC0 pack)']))
        print('  %-14s %-22s %s' % (s['id'], ', '.join(names), len(s['files']) or 1))

    print('=== selecting clips ===')
    manifest = {}
    for cat, picks in CLIPS:
        entries = []
        for srcid, rel, mode in picks:
            path = os.path.join(dirs[srcid], rel)
            if not os.path.exists(path):
                raise RuntimeError('missing source file: ' + path)
            loop = bool(mode and mode[0] == 'loop')
            for i, spec in enumerate(clip_specs(path, mode)):
                name = '%s_%02d.wav' % (cat, len(entries))
                out = os.path.join(SRC, 'amb' if loop else 'clips', name)
                extract(path, spec, out, cap=9.5 if loop else 1.4, loop=loop)
                entries.append(dict(file=os.path.join('amb' if loop else 'clips', name).replace('\\', '/'),
                                    src=srcid, original=rel, ss=round(spec[0], 4),
                                    dur=round(float(ffprobe(out)), 4), loop=loop))
        manifest[cat] = entries
        print('  %-12s %d clips' % (cat, len(entries)))

    print('=== music (source tracks, 150 s cap) ===')
    for track, srcid, rel in MUSIC:
        path = os.path.join(dirs[srcid], rel)
        if not os.path.exists(path):
            raise RuntimeError('missing music source: ' + path)
        out = os.path.join(SRC, 'music', track + '.ogg')
        ffmpeg('-i', path, '-t', '150', '-af', 'afade=t=in:st=0:d=0.15,afade=t=out:st=149.7:d=0.3',
               '-ac', '2', '-ar', '48000', '-c:a', 'libopus', '-b:a', '96k', out)
        print('  ', track, os.path.getsize(out), 'bytes')

    json.dump(dict(sources=credits, clips=manifest, music=[m[0] for m in MUSIC]),
              open(os.path.join(AUD, 'SOURCES.json'), 'w'), ensure_ascii=False, indent=1)

    # CREDITS.md — the exact files the game loads, then one line per original source
    used = {}
    for cat, entries in manifest.items():
        for e in entries:
            used.setdefault(e['src'], set()).add(cat)
    for t, sid, _ in MUSIC:
        used.setdefault(sid, set()).add('музыка: ' + t)
    byid = {c['id']: c for c in credits}
    total_clips = sum(len(v) for v in manifest.values())
    lines = ['# Титры: звук и музыка', '',
             'Все записи — **CC0 / public domain**. Лицензия взята со страницы источника:',
             '`tools/audio/fetch.py` проверяет её текст перед скачиванием; если на странице не написано',
             'CC0 / CC-BY, файл не берётся. CC-BY-авторов в этом наборе нет.', '',
             '## Файлы в игре', '',
             '| файл в игре | откуда |', '|---|---|',
             '| `sfx.ogg` + `sfx.json` — спрайт эффектов (%d звуков, %d вариантов); `sfx.m4a` — тот же спрайт в AAC для Safari | `src/clips/*.wav`, `src/amb/*.wav` из всех записей ниже, кроме музыки |' %
             (len(manifest), total_clips)]
    for t, sid, _ in MUSIC:
        c = byid[sid]
        lines.append('| `music/%s.ogg`, `music/%s.m4a` | %s — %s, %s, <%s> |' %
                     (t, t, c['title'], c['author'], c['license'], c['page']))
    lines += ['| `credits.json` | эта таблица в машинном виде (экран «Титры» в настройках) |', '',
              'Обработка (обрезка тишины, LUFS, моно, Opus/AAC): `tools/audio/build.py`;',
              'итог и размеры: `SIZES.md`.', '',
              '## Источники', '',
              '| звук в игре | исходный файл | страница-источник | автор | лицензия |',
              '|---|---|---|---|---|']
    for c in credits:
        cats = ', '.join(sorted(used.get(c['id'], [])))
        files = ', '.join('`%s`' % f for f in c['files'])
        lines.append('| %s → %s | %s | <%s> | %s | %s |' %
                     (c['title'], cats or '—', files, c['page'], c['author'], c['license']))
    lines.append('')
    open(os.path.join(AUD, 'CREDITS.md'), 'w').write('\n'.join(lines))

    total = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(SRC) for f in fs)
    print('=== src/ total %.2f MB ===' % (total / 1048576))
    print('wrote SOURCES.json + CREDITS.md')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print('FETCH FAILED:', type(e).__name__, e, file=sys.stderr)
        raise
