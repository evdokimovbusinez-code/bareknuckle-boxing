#!/bin/bash
# Rebuild index.html from src/ and syntax-check the game module. Run from the repo root.
set -e
python3 src/assemble.py >/dev/null
python3 - <<'PY'
s = open('index.html').read()
a = s.index('<script type="module">') + len('<script type="module">'); b = s.rindex('</script>')
open('/tmp/_game_module.mjs', 'w').write(s[a:b])
PY
node --check /tmp/_game_module.mjs && echo "OK: index.html rebuilt, module syntax valid"
