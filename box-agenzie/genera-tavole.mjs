// Genera le tavole di stampa della box Velia: HTML → PDF vettoriale (Chrome
// headless) + PNG di anteprima. Uso:  node genera-tavole.mjs [id ...]
// Prerequisiti: npm install (qrcode), Google Chrome installato.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import QRCode from 'qrcode';
import { TAVOLE, ESEMPIO, DATA } from './tavole.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(qui, '..', 'website', 'public', 'fonts');
const BUILD = path.join(qui, 'build');
const OUT_PDF = path.join(qui, 'out', 'pdf');
const OUT_PNG = path.join(qui, 'out', 'png');
for (const d of [BUILD, OUT_PDF, OUT_PNG]) fs.mkdirSync(d, { recursive: true });

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error('Chrome o Edge non trovati');

const b64 = (f) => fs.readFileSync(path.join(FONTS, f)).toString('base64');
const face = (fam, file, w, style = 'normal') =>
  `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${b64(file)}) format('woff2');font-weight:${w};font-style:${style}}`;
const FONTS_CSS = [
  face('TWK Ghost', 'TWKGhost-Regular.woff2', 400),
  face('TWK Ghost', 'TWKGhost-Medium.woff2', 500),
  face('TWK Ghost', 'TWKGhost-Bold.woff2', 700),
  face('TWK Ghost', 'TWKGhost-Italic.woff2', 400, 'italic'),
  face('Geist', 'GeistVF.woff2', '100 900'),
  face('Geist', 'GeistVF-Italic.woff2', '100 900', 'italic'),
].join('\n');

const CSS = fs.readFileSync(path.join(qui, 'comune.css'), 'utf8').replace('__FONTS__', FONTS_CSS);

const QR = (await QRCode.toString('https://' + ESEMPIO.url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1c1a15', light: '#0000' } }))
  .replace('<svg ', '<svg style="width:100%;height:100%;display:block" ');

const MARKS = ['tl-h', 'tl-v', 'tr-h', 'tr-v', 'bl-h', 'bl-v', 'br-h', 'br-v']
  .map((m) => `<div class="mk ${m.endsWith('-h') ? 'h' : 'v'} ${m}"></div>`)
  .join('');

const pagina = (t, p, i) => `
<div class="sheet" style="width:${t.w + 20}mm;height:${t.h + 20}mm">
  <div class="bleed">${p.html.replace('__QR__', QR)}</div>
  ${MARKS}
  <div class="lab"><b>Box Velia · ${t.titolo}</b> · ${t.w} × ${t.h} mm al rifilo, abbondanza 3 mm · pag. ${i + 1}/${t.pagine.length} · ${p.lab} · ${DATA}</div>
</div>`;

const documento = (t) => `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${t.titolo}</title>
<style>@page{size:${t.w + 20}mm ${t.h + 20}mm}${CSS}</style></head>
<body><script>if(location.search.indexOf('anteprima')>=0)document.body.className='anteprima';</script>
${t.pagine.map((p, i) => pagina(t, p, i)).join('\n')}
</body></html>`;

const chrome = (args) => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'velia-chrome-'));
  const r = spawnSync(CHROME, ['--headless', '--disable-gpu', '--no-first-run', '--hide-scrollbars', `--user-data-dir=${profile}`, ...args], { stdio: 'pipe', timeout: 120000 });
  fs.rmSync(profile, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`Chrome: ${r.status} ${String(r.stderr).slice(-400)}`);
};

const MM = 96 / 25.4;
const scelte = process.argv.slice(2);
for (const t of TAVOLE) {
  if (scelte.length && !scelte.includes(t.id)) continue;
  const html = path.join(BUILD, `${t.id}.html`);
  fs.writeFileSync(html, documento(t));
  const url = pathToFileURL(html).href;
  const pdf = path.join(OUT_PDF, `${t.id}.pdf`);
  chrome(['--no-pdf-header-footer', '--print-to-pdf-no-header', `--print-to-pdf=${pdf}`, url]);
  const w = Math.ceil((t.w + 20) * MM), h = Math.ceil((t.h + 20) * MM) * t.pagine.length;
  const dsf = Math.max(1, Math.min(2, 2200 / Math.max(w, h)));
  const png = path.join(OUT_PNG, `${t.id}.png`);
  chrome([`--window-size=${w},${h}`, `--force-device-scale-factor=${dsf.toFixed(2)}`, `--screenshot=${png}`, url + '?anteprima']);
  console.log(`${t.id.padEnd(28)} ${t.w}×${t.h} mm, ${t.pagine.length} pag. → pdf ${(fs.statSync(pdf).size / 1024).toFixed(0)} KB, png ${(fs.statSync(png).size / 1024).toFixed(0)} KB`);
}
