/**
 * Screenshot da scrivania delle schermate, per guardarle invece di
 * immaginarsele. Gemello di `screenshot-mobile.mjs`: stesso accesso, stesso
 * Chrome vero, viste larghe.
 *
 *   node tools/screenshot-desktop.mjs                       # le rotte di default
 *   node tools/screenshot-desktop.mjs archivio/privato      # una sola
 *   node tools/screenshot-desktop.mjs archivio/privato 1440 # a una larghezza
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4200';
const OUT = new URL('../.screenshot/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const rotte = (process.argv[2] ?? 'archivio/privato').split(',');
const larghezze = process.argv[3] ? [Number(process.argv[3])] : [1440, 1200];

const login = await fetch(`${BASE}/api/sessione/accesso`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'm.ferrero@assicurazionimeridiana.it',
    password: 'velia-demo-2026!',
  }),
});
const sessione = await login.json();
if (!sessione.tokenAccesso) throw new Error('login fallito: ' + JSON.stringify(sessione));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  for (const larghezza of larghezze) {
    const page = await browser.newPage();
    await page.setViewport({ width: larghezza, height: 900, deviceScaleFactor: 2 });
    /* Chrome headless dichiara `prefers-reduced-motion: reduce` e le
       animazioni non partono: si emula il contrario, o si fotografano stati
       intermedi che nella realtà non esistono. */
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.goto(`${BASE}/accesso`, { waitUntil: 'networkidle2' });
    await page.evaluate(
      (t) =>
        localStorage.setItem(
          'velia.token',
          JSON.stringify({ accesso: t.tokenAccesso, aggiornamento: t.tokenAggiornamento }),
        ),
      sessione,
    );
    for (const rotta of rotte) {
      await page.goto(`${BASE}/${rotta}`, { waitUntil: 'networkidle2' });
      await new Promise((res) => setTimeout(res, 1500));
      const nome = `scrivania-${larghezza}--${rotta.replace(/[/#]/g, '_')}.png`;
      await page.screenshot({ path: `${OUT}${nome}`, fullPage: false });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      console.log(`${nome}  overflow-x=${overflow}px`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
