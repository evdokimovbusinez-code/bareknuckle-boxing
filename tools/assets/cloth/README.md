# Одежда: конвейер и состояние

## Как добавить свою вещь (#86)
1. **Файл.** Моделишь в Blender на теле игры (`CC_Base_Body` + скелет `CC3_Base_Plus` — возьми их из `user/tshirt_src.blend`),
   в любой позе (T, A, своя: скелет должен стоять в той позе, в которой сшита вещь). Две модели:
   `<id>_high` (детальная, для запекания складок) и `<id>_low` (игровая). Пример: `police_shirt_high`, `police_shirt_low`.
   В одном файле может быть несколько вещей — каждая пара обработается отдельно. Файл клади в `tools/assets/cloth/user/`.
2. **Свойства** (на `<id>_low`: Object Properties → Custom Properties). Без них будут умолчания и предупреждение в отчёте.
   | свойство | пример | что |
   |---|---|---|
   | `cat` | `top` | категория: `top` / `bottom` / `head` / `shoes` / `belt` / `hands` |
   | `name` | `рубашка ППС` | название в магазине |
   | `price` | `400` | цена, ₽ |
   | `colors` | `navy,black,grey` | цвета из палитры игры (`WCOL` в `src/game/04e_wardrobe.js`); первый — по умолчанию |
   | `rigid` | `CC_Base_Head` | вещь целиком на одной кости (кепка, каска). Для `head` — по умолчанию |
   | `base` | `long` | (верх) процедурный крой, который виден, пока файл грузится или если не загрузился |
3. **Запуск.** Локально (нужен `pip install bpy==5.3.0`, Python 3.13) одной командой:
   `python3 tools/assets/cloth/garment.py tools/assets/cloth/user/police.blend` (или `--id police_shirt` — одна вещь),
   потом `bash tools/check.sh` (вещь попадает в `index.html`). Через бота — issue с заголовком `[assets] Вещь: police.blend`
   и `@claude` в тексте (бот запускает то же как `python3 tools/assets/ cloth/garment.py tools/assets/cloth/user/police.blend`).
4. **Что выходит:** `assets/cloth/<id>.glb`, `<id>_n.webp` (складки), `<id>_lo.glb` (≤ 3000 треугольников, для графики «низкая»),
   `<id>_c.webp` (если вещь разноцветная), запись в `assets/cloth/items.json`; проверочные картинки `preview/<id>_uv.png`
   (раскладка UV, треугольники от зелёного = без искажений до красного ≥ 20%) и `preview/<id>_checker_*.png` (шахматка на вещи).
5. **Что смотреть в отчёте** (строки `WARN` — главное):
   - `uv distortion`: area / sides **p95 ≤ 5%** — хорошо. Если своя UV хуже — конвейер перераспакует сам (по твоим швам, если они
     помечены, иначе по островам Smart UV), напишет до/после и сколько островов. На шахматке клетки должны быть квадратными и одного размера.
   - `penetration`: доля вершин вещи внутри тела — **< 1%**, иначе кожа будет пробивать ткань. Отодвинь ткань от тела в этих местах.
   - `armature round trip`: **OK** (< 1 мм) — перевод в A-позу точен.
   - `bend shoulder / knee / hip`: вывернутые треугольники при ударе / сгибе колена. Десятки на тысячи — норма; сотни — плохая сетка на сгибе.
   - `low poly`: какая сетка ушла в игру. Если `_low` — это `_high` под модификатором Decimate, берётся ретопология QuadriFlow
     (`--low file` — заставить взять свою).

Пример (футболка):
```
python3 tools/assets/cloth/garment.py tools/assets/cloth/user/tshirt_src.blend --id tee
  auto: tshirt_low is tshirt_high under a Decimate modifier (no retopo …) -> QuadriFlow
  own uv: none
  final (angle based / 66 deg) uv distortion: area p50 2.7% p95 10.7% max 61% | sides p50 1.4% p95 5.3% max 87% | 15 islands
  armature round trip (rest mesh re-posed onto the source): max error 0.001 mm OK
  penetration: garment vertices inside the body — as made 0.00%, bind A-pose 0.00% OK
  quad bend shoulder (L_Upperarm +80 deg): 17 / 2643 triangles flipped
  tee  top  футболка (ткань)  tris 11430 / lo 2940  261 KB …
```
Свойства можно задать и без Blender: `--meta '{"cat":"top","name":"футболка (ткань)","price":150,"colors":"white,black,grey"}'`
(так футболке заданы `item: teeCloth` — id в игре, чтобы старые сохранения её узнали).

## Что лежит здесь
| Файл | Что |
|---|---|
| `export_body.py` | тело бойца из игры (bind A-pose, метры, Y-up) → `out/body.obj`, `out/body_skin.json` |
| `pattern.py` | выкройка футболки по меркам тела → `out/tee.json` |
| `pants.py` | выкройка + раскладка брюк → `out/pants.json`, `out/pants_placed.json` |
| `place.py` | раскладка деталей футболки вокруг тела |
| `sim.py` | симуляция в Blender (bpy): режим `shell` по умолчанию — детали сшиты при раскладке, одна усадка с гравитацией; `SIM_MODE=sew` — старый пошив пружинами |
| `render.py` | превью через three.js (как в игре): `python3 render.py tee` → `preview/tee_r_*.png` |
| `run_all.sh` | всё по порядку |
| `bake_tee.py` | ручная футболка: лоуполи `tshirt_game` (QuadriFlow 6k квадов, кромки как острые петли, Smart UV) + normal с high (Cycles, 1024 px, ~4 с) → `assets/tee_hand_n.png`, `out/tshirt_baked.blend` (открыть и крутить — Material Preview) |
| `user_tee.py` | ручная футболка → игра: веса с тела, обратный скиннинг T-поза → bind A-поза, экспорт `assets/tee_hand.json` (запуск — в шапке файла) |
| `tee_game.py` | **#57, всё в одном:** веса, обратный скиннинг + проверки (Armature-модификатор, ткань в теле, удар плечом 80° для Decimate и QuadriFlow), Smart UV, запекание normal 1024 → `assets/cloth/tee.glb`, `tee_n.webp` (запуск — в шапке файла). AO с #81 не печётся: пятна от двух слоёв ткани, а складки и контакт с телом и так затеняет экранный AO игры |
| `tee_lo.js` | **#81:** лёгкая футболка для графики «низкая»: `tee.glb` прорежена до ≤ 3000 треугольников схлопыванием рёбер в вершину (uv не меняются → та же `tee_n.webp`) → `assets/cloth/tee_lo.glb`. Запускается в отладочной странице (команда — в шапке файла): `bpy` у бота нет |
| `garment.py` | **#86, любая вещь:** `.blend` → `assets/cloth/<id>.glb`, `_n.webp`, `_lo.glb`, `items.json` + отчёт и картинки проверки (см. «Как добавить свою вещь»). Заменяет `tee_game.py` и `tee_lo.js` для новых вещей; футболка тоже собирается им (`--id tee`) |
| `render.py checker <id>` | шахматка по UV (+ карта нормалей) на GLB вещи → `preview/<id>_checker_front/side/back/close.png` |
| `user/tshirt_src.blend` | **футболка, сделанная вручную в Blender** (лучшая на сейчас): `tshirt_high` (21,6k тр.), `tshirt_low` (1,9k, Decimate), тело CC3 + скелет `CC3_Base_Plus` |

`out/` в .gitignore — пересоздаётся скриптами.

## Состояние (15.11.2026)
- Автоматическая симуляция (`sim.py`) даёт цельную футболку, 0,4% ткани в теле, но плечи бугристые и окат мнётся.
  Ручная футболка из `user/tshirt_src.blend` чище — дальше идём с ней.
- Ручная футболка сделана в **T-позе** (скелет повёрнут в позу), а исходная (bind) поза скелета — **A-поза, руки −32°**,
  как в игре. Тело и кости — те же, что в игре (CC3_Base_Plus, рост 1,842 м).

## Ручная футболка в игре (15.11.2026, ветка `cloth/hand-tee-skin`)
- `user_tee.py` (Blender, ~5 с): веса — ближайшая точка позированного тела, барицентрика по группам, только кости торса / ключиц /
  рук (twist) + `ThighTwist01` у подола (без них кожа таза пробивала подол в стойке), 6 проходов сглаживания, топ-4.
  Обратный скиннинг: `rest = (Σ wᵢ·Sᵢ)⁻¹ · pose`. Кадр игры = 100 × мир Blender (cm, z вверх) — сверено по вершине тела №0.
- Проверки скрипта: вершин футболки внутри тела — 0% в T-позе и 0% в A-позе (оракул: тело −1 см → 86%, +1 см → 8%); зазор 2–3,7 см.
- Игра: предмет `teeHand` «футболка (ручная)» (`04f_tops.js`: `HAND_TOP`, `handGeo`, `handTex`); пока JSON не пришёл — процедурная `tee`.
  (С #57 предмет — `teeCloth`, JSON остался запасным вариантом, см. ниже.)
  Кожа живота под топом теперь прячется до его подола (`uGearT`, `g_pre.js`), а не только выше `GEAR_TOP − 7`.
- Сетка в игре: `tshirt_game` — 11,3k тр., `tee_hand.json` 944 КБ (260 КБ gzip; в нём нормали и MikkTSpace-касательные из Blender —
  с теми, что выводит three.js, карта даёт вмятины на каждом шве UV) + `tee_hand_n.png` 506 КБ (без потерь). Порядок сборки:
  ```
  Blender -b tools/assets/cloth/user/tshirt_src.blend --python tools/assets/cloth/bake_tee.py
  Blender -b tools/assets/cloth/out/tshirt_baked.blend --python tools/assets/cloth/user_tee.py -- game
  ```
- Как подбиралось запекание (оракул: Cycles-рендер high против low + карта с 3 сторон, средняя разница пикселей 0–255):
  без карты 5,71 · первая версия (2,4k квадов, WebP с потерями) 3,98 · то же без потерь 3,72 · 16 сэмплов — 3,72 (не влияет) ·
  2048 px — без изменений · 4k квадов 2,59 · **6k квадов + острые кромки 1,97** (взято). Ошибка сидит на кромках толщины
  (ворот, подол, манжеты): их решает только плотность лоуполи.
- В игре (кадр против той же сцены с high без карты): low с картой 1,00, без карты 1,94, с перевёрнутым Y карты 2,49 → знак Y верный.
- Запекание детерминированное.

## GLB в игре (#57)
- `python3 tools/assets/cloth/tee_game.py` (bpy 5.3 модулем) или `Blender -b tools/assets/cloth/user/tshirt_src.blend --python tools/assets/cloth/tee_game.py`.
  Переменные: `LOW=quad|decimate`, `FACES=6000`, `CAGE=0.005`, `RAY=0.02`, `RES=1024`, `AO_RES=512`, `BAKE=0` (без запекания). Печатает все проверки.
- GLB пишется вручную (без экспортёра glTF: без сюрпризов с осями и арматурой): один меш, `KHR_mesh_quantization` — позиции int16 + перенос/масштаб узла,
  нормали и MikkTSpace-касательные из Blender int8, UV uint16 (v вниз, как в glTF), `JOINTS_0` = индекс в `primitive.extras.bones` (имена CC_Base_*),
  `WEIGHTS_0` uint8. Метры, Y-up, bind A-поза. Тот же меш (11,3k тр.) в этой раскладке — 271 КБ (против 944 КБ JSON).
- Игра: `src/game/04j_cloth_asset.js` (`clothLoad`, `clothFromGLTF`, `clothGeo`, `clothTex`), предмет `teeCloth` «футболка (ткань)», 150 ₽;
  старый id `teeHand` в сохранениях → `teeCloth` (`WALIAS`). Нет GLB → JSON (`handLoad`, грузится только тогда) → процедурная `tee`.
  Проверка пути GLB без Blender: в отладочной сборке `await __clothTestGLB()` собирает GLB той же раскладки из `tee_hand.json`.

## Следующие шаги
- Размер: JSON → бинарь (Float16 / Int16), карта → WebP без потерь (нужен энкодер, Blender WebP 90 даёт блоки).
- Metal в фоновом Blender не нашёлся — печёт CPU (1 с, не мешает).
- UV под принты, текстура ткани (сейчас — ровный цвет + мелкое зерно), выбор цвета/принта как у процедурных.
- Пружина подола (`aSw`) подобрана на глаз; проверить нокаут и лёжа.

## Прежний план (1, 2, 6 — сделаны иначе, см. выше; 3–5 — в «Следующих шагах»)
1. Веса: Data Transfer с `CC_Base_Body` на `tshirt_low` / `tshirt_high` (vertex groups, nearest face interpolated),
   оставить кости торса, ключиц, плеч, предплечий; сгладить.
2. Обратный скиннинг из T-позы в bind A-позу: для каждой вершины `rest = (Σ wᵢ·Sᵢ)⁻¹ · pose`,
   где `Sᵢ = arm.matrix_world · pb.matrix · bone.matrix_local⁻¹ · arm.matrix_world⁻¹` (или: Armature-модификатор + «Apply as shape» в обратную сторону).
3. Лоуполи: проверить сгиб плеча в ударе; если Decimate-треугольники ломаются — ретопо квадами (QuadriFlow / Remesh).
4. UV: сейчас 2 острова (проекция с плоскости) — для принтов разрезать на перед / спинку / рукава.
5. Запечь normal (+AO) с high на low, 1024 px, Cycles (на GPU — секунды).
6. Экспорт GLB (Y-up, метры, имена костей CC_Base_*), в игре — SkinnedMesh на скелете тела (`src/game/04f_tops.js` — образец, как сейчас надевается процедурная футболка), процедурная — запасной вариант.
7. Проверка: `tools/shot.sh` — стойка, удар, блок, нокаут рядом с нынешней футболкой.
