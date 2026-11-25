"""A before | after contact sheet of screenshots (issue 88: docs/audit/blood.jpg). No PIL here, so in two steps:
   1. python3 tools/assets/ sheet.py "label=before.jpg=after.jpg" ...   (before / after may be '-': left empty)
      copies the pictures into node_modules/.shots/ (served by tools/shot.sh, git-ignored) + rows.json;
   2. bash tools/shot.sh docs/audit/blood.jpg js "return await eval(await (await fetch('docs/audit/scenarios/sheet.js')).text())" 1280x3134
      draws them on a page-sized canvas (docs/audit/scenarios/sheet.js) and the screenshot is the sheet."""
import json
import os
import shutil
import sys
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'node_modules', '.shots')
os.makedirs(OUT, exist_ok=True)
rows = []
for i, a in enumerate(sys.argv[1:]):
    lab, *pics = a.split('=')
    names = []
    for j, p in enumerate(pics):
        if p == '-':
            names.append(None); continue
        n = f'r{i}_{j}.jpg'; shutil.copyfile(p, os.path.join(OUT, n)); names.append(n)
    rows.append({'label': lab, 'pics': names})
json.dump(rows, open(os.path.join(OUT, 'rows.json'), 'w'), ensure_ascii=False)
print(f'{len(rows)} rows -> node_modules/.shots/rows.json; page height {30 + 388 * len(rows)}')
