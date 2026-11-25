/* issue 90: a contact sheet of single frames (docs/audit/critic/sheet.jpg). The frames come from `python3 tools/assets/ sheet.py
   "label=pic.jpg" …` (node_modules/.shots/rows.json, one picture a row entry); drawn 4 in a row, each fitted whole into its cell.
   bash tools/shot.sh docs/audit/critic/sheet.jpg js "return await eval(await (await fetch('docs/audit/scenarios/critic_sheet.js')).text())" 1200x1380 */
(async () => {
  const rows = await (await fetch('node_modules/.shots/rows.json')).json(), N = 4, W = Math.floor(innerWidth / N), H = Math.round(W * 0.66), L = 22;
  const c = document.createElement('canvas'); c.width = N * W; c.height = Math.ceil(rows.length / N) * (H + L);
  Object.assign(c.style, { position: 'fixed', left: 0, top: 0, zIndex: 99999, width: c.width + 'px', height: c.height + 'px' });
  const x = c.getContext('2d'); x.fillStyle = '#121212'; x.fillRect(0, 0, c.width, innerHeight + c.height); x.font = 'bold 14px sans-serif';
  const load = s => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'node_modules/.shots/' + s; });
  for (let r = 0; r < rows.length; r++) {
    const x0 = (r % N) * W, y0 = Math.floor(r / N) * (H + L), im = await load(rows[r].pics[0]), k = Math.min(W / im.width, H / im.height);
    x.drawImage(im, x0 + (W - im.width * k) / 2, y0 + L + (H - im.height * k) / 2, im.width * k, im.height * k);
    x.fillStyle = '#ffd278'; x.fillText(rows[r].label, x0 + 6, y0 + 16);
  }
  document.body.appendChild(c);
  return rows.length + ' frames, ' + c.width + 'x' + c.height;
})()
