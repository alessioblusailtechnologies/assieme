#!/usr/bin/env node
/**
 * Apre una pagina con Chrome vero (puppeteer-core di fe-angular, Chrome di
 * sistema) ed elenca i link ai documenti: quelli che finiscono in .pdf o
 * passano da un archivio (`download?`, `get_file?`, `archiviodigitale`).
 * Serve alla skill `/procura-set` quando WebFetch non vede i link perché la
 * pagina li disegna con JavaScript, o il sito è dietro una challenge.
 *
 *   node tools/elenca-link.mjs <url>                 # link ai documenti, con testo e contesto
 *   node tools/elenca-link.mjs <url> --tutti         # tutti i link della pagina
 *   node tools/elenca-link.mjs <url> --testo         # anche il testo della pagina (per edizioni, date)
 *   node tools/elenca-link.mjs <url> --clicca "Documenti"   # prima clicca l'elemento con quel testo
 *
 * Niente `process.exit` dopo la rete: su Windows libuv protesta in chiusura.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const DOCUMENTO = /\.pdf(\?|$)|download\?|get_file\?|archiviodigitale|\/documenti\/|\/pdf\//i;

await principale();

async function principale() {
  const args = process.argv.slice(2);
  const url = args[0];
  if (!url) {
    console.error('Uso: node tools/elenca-link.mjs <url> [--tutti] [--testo] [--clicca "testo"]');
    process.exitCode = 1;
    return;
  }
  const tutti = args.includes('--tutti');
  const conTesto = args.includes('--testo');
  const iClicca = args.indexOf('--clicca');
  const daCliccare = iClicca >= 0 ? args[iClicca + 1] : undefined;

  const richiediFe = createRequire(join(QUI, '..', '..', 'fe-angular', 'package.json'));
  const puppeteer = richiediFe('puppeteer-core');
  if (!existsSync(CHROME)) {
    console.error(`Chrome non trovato in ${CHROME}`);
    process.exitCode = 2;
    return;
  }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.5' });
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => console.error(`goto: ${e.message}`));
    for (let tentativo = 0; tentativo < 5; tentativo++) {
      const titolo = await page.title().catch(() => '');
      if (!/just a moment|un momento|attention required/i.test(titolo)) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    // I banner dei cookie coprono i link: si prova a chiuderli.
    await page
      .evaluate(() => {
        const bottoni = [...document.querySelectorAll('button, a')];
        const b = bottoni.find((x) => /accetta|accept|consenti|ok\b|chiudi/i.test(x.textContent || ''));
        if (b) b.click();
      })
      .catch(() => {});
    if (daCliccare) {
      await page
        .evaluate((t) => {
          const el = [...document.querySelectorAll('a, button, [role=tab], [role=button], summary, li, span, div')].find((x) =>
            (x.textContent || '').trim().toLowerCase() === t.toLowerCase(),
          );
          if (el) el.click();
        }, daCliccare)
        .catch(() => {});
      await new Promise((r) => setTimeout(r, 2500));
    }
    console.log(`# ${await page.title()}\n# ${page.url()}\n`);
    const link = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].map((a) => ({
        testo: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        href: a.href,
        contesto: (a.closest('li, tr, article, section, div')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
    );
    const scelti = tutti ? link : link.filter((l) => DOCUMENTO.test(l.href) || /\.pdf\b/i.test(l.testo));
    const visti = new Set();
    for (const l of scelti) {
      if (visti.has(l.href)) continue;
      visti.add(l.href);
      console.log(`- ${l.testo || '(senza testo)'}\n  ${l.href}${tutti ? '' : `\n  ${l.contesto}`}`);
    }
    if (!scelti.length) console.log(`Nessun link a documenti fra ${link.length} link della pagina (prova --tutti, o --clicca "Documenti").`);
    if (conTesto) {
      const testo = await page.evaluate(() => document.body.innerText);
      console.log('\n# Testo della pagina\n' + testo.replace(/\n{3,}/g, '\n\n').slice(0, 20000));
    }
  } finally {
    await browser.close();
  }
}
