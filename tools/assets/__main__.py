#!/usr/bin/env python3
"""Entry point so the whole asset pipeline can be run as `python3 tools/assets/ [args]`
(the CI allow-list matches this command form; direct `python3 tools/assets/<file>.py` does not
resolve — the permission rule needs a space after the directory).

    python3 tools/assets/            — every step of the tee pipeline, in order (#55 + #56)
    python3 tools/assets/ --from sim — start at sim.py (out/ already has tee_placed.blend)
    python3 tools/assets/ --only sim — run only sim.py

Steps live in cloth/ and run in their own module namespace (runpy), each honouring its exit code.
"""
import os
import runpy
import sys

try:      # CI reads our stdout live — keep every print flushed line by line
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
CLOTH = os.path.join(HERE, 'cloth')
STEPS = ['export_body.py', 'pattern.py', 'place.py', 'sim.py']
EXTRA = ['preview.py']          # helper views, not part of the default pipeline (it would
                                # overwrite sim.py's previews with the rest-mesh ones)


def main(argv):
    all_steps = STEPS + EXTRA
    steps = STEPS
    if argv and argv[0] == '--only':
        steps = [s for s in all_steps if s.startswith(argv[1].lstrip('--') + '.')]
    elif argv and argv[0] == '--from':
        k = [s for s in STEPS if s.startswith(argv[1].lstrip('--') + '.')]
        steps = STEPS[STEPS.index(k[0]):] if k else STEPS
    steps = [s for s in steps if os.path.exists(os.path.join(CLOTH, s))]
    print(f'=== tools/assets: {", ".join(steps)} ===', flush=True)
    for s in steps:
        print(f'--- {s} ---', flush=True)
        try:
            runpy.run_path(os.path.join(CLOTH, s), run_name='__main__')
        except SystemExit as e:
            code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
            if code:
                print(f'=== {s} exited {code} — stop ===', flush=True)
                return code
    print('=== all steps ok ===', flush=True)
    return 0


sys.exit(main(sys.argv[1:]))
