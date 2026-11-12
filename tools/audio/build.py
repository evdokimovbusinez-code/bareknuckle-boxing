#!/usr/bin/env python3
"""Stage 3 audio, step 2: turn assets/audio/src/ into the files the game loads.

    python3 tools/audio/build.py     # offline, needs ffmpeg with libopus + aac

Processing (per issue #48): silence already trimmed by fetch.py, LUFS
normalisation per clip, mono 48 kHz for the effects, one Ogg Opus sprite sheet
(56 kbit/s) + an AAC/.m4a twin for Safari, a JSON offset table, and streaming
music tracks.  Budgets: all effects <= 1.5 MB, every music track <= 3 MB.
"""
import hashlib, json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
AUD = os.path.join(ROOT, 'assets', 'audio')
SRC = os.path.join(AUD, 'src')
TMP = '/tmp/bkb-audio-build'
MUS = os.path.join(AUD, 'music')

# Perceptual trim after LUFS normalisation (dB).  A bell is louder than a swish;
# the ambience beds are way below the punches.
TRIM = dict(faceLight=-1, faceHeavy=0, body=-2, block=-3, whoosh=-7, fall=-2,
            bell=-3, count=-6, clink=-5, exhale=-5, wave=-6, applause=-4,
            roar=-1, crowd=-13, ambGym=-13, ambOutdoor=-13, ambWind=-13, ambIndoor=-13)
LUFS = -19          # target integrated loudness of a single hit
LOOP_LUFS = -24     # ambience beds are quieter
GAP = 0.04          # silence between clips in the sprite (also absorbs codec drift)


def run(*args):
    r = subprocess.run(list(args), capture_output=True, text=True, timeout=900)
    if r.returncode:
        raise RuntimeError('%s: %s' % (args[0], r.stderr[-600:]))
    return r.stdout


def ff(*args):
    return run('ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', *args)


def probe(path):
    out = run('ffprobe', '-v', 'error', '-show_entries', 'format=duration',
              '-of', 'csv=p=0', path).strip().split(',')[0]
    return float(out or '0')


def size(p):
    return os.path.getsize(p) if os.path.exists(p) else 0


def main():
    man = json.load(open(os.path.join(AUD, 'SOURCES.json')))
    shutil.rmtree(TMP, ignore_errors=True)
    os.makedirs(TMP)
    os.makedirs(MUS, exist_ok=True)

    # ── one LUFS-normalised WAV per clip ──
    print('=== LUFS normalise, mono 48 kHz ===')
    gapwav = os.path.join(TMP, 'gap.wav')
    ff('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', '%.3f' % GAP,
       '-c:a', 'pcm_s16le', gapwav)

    parts, names, seen, cursor = [], {}, {}, 0.0
    for cat, entries in man['clips'].items():
        names[cat] = []
        for e in entries:
            path = os.path.join(SRC, e['file'])
            digest = hashlib.sha1(open(path, 'rb').read()).hexdigest()
            if digest in seen:                       # e.g. ambGym == crowd
                names[cat].append(dict(seen[digest]))
                continue
            wav = os.path.join(TMP, 'n_%03d.wav' % len(parts))
            target = LOOP_LUFS if e['loop'] else LUFS
            af = ('loudnorm=I=%d:TP=-2:LRA=7,volume=%.2fdB' %
                  (target, TRIM.get(cat, -3)))
            cut = ['-t', '6'] if e['loop'] else []   # keep the sprite small: 6 s beds
            ff('-i', path, *cut, '-af', af + ',aformat=sample_rates=48000:channel_layouts=mono',
               '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', wav)
            d = probe(wav)
            parts += [wav, gapwav]
            reg = dict(s=round(cursor + 0.005, 4), d=round(max(0.03, d - 0.012), 4))
            names[cat].append(dict(reg))
            seen[digest] = reg
            cursor += d + GAP
    print('   %d unique clips, %.2f s of audio' % (len(seen), cursor))

    lst = os.path.join(TMP, 'concat.txt')
    with open(lst, 'w') as f:
        for p in parts[:-1]:                          # no trailing gap
            f.write("file '%s'\n" % p.replace("'", "'\\''"))
    sprite = os.path.join(TMP, 'sprite.wav')
    ff('-f', 'concat', '-safe', '0', '-i', lst, '-c:a', 'pcm_s16le', sprite)
    print('   sprite %.2f s' % probe(sprite))

    # ── the two effect containers ──
    print('=== encode effects: Ogg Opus + AAC/m4a ===')
    ff('-i', sprite, '-c:a', 'libopus', '-b:a', '56k', '-ac', '1', '-ar', '48000',
       '-application', 'audio', os.path.join(AUD, 'sfx.ogg'))
    ff('-i', sprite, '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-ar', '48000',
       '-movflags', '+faststart', os.path.join(AUD, 'sfx.m4a'))

    json.dump(dict(v=1, rate=48000, duration=round(max(0, cursor - GAP), 3),
                   names=names, music=man['music'], gap=GAP),
              open(os.path.join(AUD, 'sfx.json'), 'w'), indent=1)

    # ── streaming music, both containers ──
    print('=== encode music (streaming, <3 MB per track) ===')
    for track in man['music']:
        inp = os.path.join(SRC, 'music', track + '.ogg')
        ogg = os.path.join(MUS, track + '.ogg')
        m4a = os.path.join(MUS, track + '.m4a')
        ff('-i', inp, '-c:a', 'libopus', '-b:a', '96k', '-ac', '2', '-ar', '48000', ogg)
        ff('-i', inp, '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '48000',
           '-movflags', '+faststart', m4a)

    json.dump(man['sources'], open(os.path.join(AUD, 'credits.json'), 'w'),
              ensure_ascii=False, indent=1)

    # ── size table / budget ──
    fx = ['sfx.ogg', 'sfx.m4a', 'sfx.json']
    rows = [('эффекты', f, size(os.path.join(AUD, f))) for f in fx]
    for t in man['music']:
        for ext in ('.ogg', '.m4a'):
            rows.append(('музыка ' + t, t + ext, size(os.path.join(MUS, t + ext))))
    lines = ['# Размеры звука (после `python3 tools/audio/build.py`)', '',
             '| что | файл | байт |', '|---|---|---|']
    for a, b, n in rows:
        lines.append('| %s | `%s` | %s |' % (a, b, format(n, ',')))
    fx_total = sum(n for a, _, n in rows if a == 'эффекты')
    music_max = max((size(os.path.join(MUS, t + e)) for t in man['music'] for e in ('.ogg', '.m4a')),
                    default=0)
    lines += ['', '**Итого эффекты: %.2f МБ** (лимит 1.5 МБ, `sfx.m4a` — запасной для Safari).' %
              (fx_total / 1048576),
              '**Самый большой музыкальный файл: %.2f МБ** (лимит 3 МБ).' % (music_max / 1048576),
              'Исходники: `assets/audio/src/`, титры: `CREDITS.md` / `credits.json`.', '']
    open(os.path.join(AUD, 'SIZES.md'), 'w').write('\n'.join(lines))
    print('\n'.join(lines[2:]))

    if fx_total > 1572864 or music_max > 3145728:
        print('BUILD FAILED: budget exceeded', file=sys.stderr)
        return 1
    print('BUDGET OK')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:
        print('BUILD FAILED:', type(e).__name__, e, file=sys.stderr)
        raise
