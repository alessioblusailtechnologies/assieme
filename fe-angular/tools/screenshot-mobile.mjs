import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4200';
const OUT = new URL('../.screenshot/', import.meta.url).pathname.replace(/^/([A-Za-z]:)/, '$1');
mkdirSync(OUT, { recursive: true });

const rotte = (process.argv[2] ?? 'chat,tabelle,archivio/pubblico,archivio/privato,agenti,memoria,impostazioni').split(',');
const viste = [
  { nome: 'telefono', width: 390, height: 844, mobile: true },
  { nome: 'tablet', width: 820, height: 1180, mobile: true },
];

const login = await fetch(`${BASE}/api/sessione/accesso`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'm.ferrero@assicurazionimeridiana.it', password: 'velia-demo-2026!' }),
});
const sessione = await login.json();
if (!sessione.tokenAccesso) throw new Error('login fallito: ' + JSON.stringify(sessione));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
});
try {
  for (const vista of viste) {
    const page = await browser.newPage();
    await page.setViewport({ width: vista.width, height: vista.height, isMobile: vista.mobile, hasTouch: vista.mobile, deviceScaleFactor: 2 });
    await page.goto(`${BASE}/accesso`, { waitUntil: 'networkidle2' });
    await page.evaluate((t) => localStorage.setItem('velia.token', JSON.stringify({ accesso: t.tokenAccesso, aggiornamento: t.tokenAggiornamento })), sessione);
    for (const rotta of rotte) {
      const apri = rotta.includes('#menu');
      const r = rotta.replace('#menu', '');
      await page.goto(`${BASE}/${r}`, { waitUntil: 'networkidle2' });
      await new Promise((res) => setTimeout(res, 1200));
      if (apri) {
        await page.click('button.menu').catch(() => undefined);
        await new Promise((res) => setTimeout(res, 500));
      }
      const nome = `${vista.nome}--${rotta.replace(/[\/#]/g, '_')}.png`;
      await page.screenshot({ path: `${OUT}${nome}`, fullPage: false });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${nome}  overflow-x=${overflow}px`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
