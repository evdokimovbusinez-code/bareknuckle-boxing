/* Draws the before | after sheet prepared by `python3 tools/assets/ sheet.py …` (node_modules/.shots/rows.json) over the page;
   the final screenshot of tools/shot.sh is the sheet (viewport 1280 × (30 + 388 · rows)). */
(async () => {
  const rows = await (await fetch('node_modules/.shots/rows.json')).json(), W = 640, H = 360;
  const c = document.createElement('canvas'); c.width = 2 * W; c.height = 30 + rows.length * (H + 28);
  Object.assign(c.style, { position: 'fixed', left: 0, top: 0, zIndex: 99999, width: c.width + 'px', height: c.height + 'px' });
  const x = c.getContext('2d'); x.fillStyle = '#121212'; x.fillRect(0, 0, c.width, c.height);
  x.font = 'bold 18px sans-serif'; x.fillStyle = '#e6e6e6'; x.fillText('ДО (main)', 10, 21); x.fillText('ПОСЛЕ (#88)', W + 10, 21);
  const load = s => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'node_modules/.shots/' + s; });
  for (let r = 0; r < rows.length; r++) {
    const y = 30 + r * (H + 28); x.fillStyle = '#ffd278'; x.fillText(rows[r].label, 10, y + 20);
    for (let j = 0; j < 2; j++) { const s = rows[r].pics[j]; if (!s) continue; const im = await load(s); x.drawImage(im, 0, 0, im.width, im.width * H / W, j * W, y + 26, W, H); }
  }
  document.body.appendChild(c);
  return rows.length + ' rows';
})()
