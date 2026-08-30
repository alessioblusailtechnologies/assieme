#!/usr/bin/env node
/**
 * Scarica un PDF verificando che sia un PDF vero (firma `%PDF-`), con due
 * vie: fetch diretto (basta quasi sempre) e Chrome vero via puppeteer-core
 * per i siti dietro Cloudflare con challenge JavaScript (allianz.it: curl
 * prende 403, il browser passa). Serve alla skill `/procura-set`.
 *
 *   node tools/scarica-pdf.mjs <url> <destinazione.pdf>
 *   node tools/scarica-pdf.mjs <url> <destinazione.pdf> --chrome [--pagina <url-indice>]
 *
 * Con `--chrome` apre prima la pagina indice (se data, altrimenti l'origine
 * dell'URL) per superare la challenge, poi prende il PDF con una fetch dal
 * contesto della pagina; se il sito non lo consente, naviga al PDF e ne
 * prende la risposta. Chrome è quello di sistema; puppeteer-core è quello
 * di fe-angular. Stampa il numero di pagine a fine scaricamento.
 *
 * Niente `process.exit` dopo una fetch: su Windows libuv protesta in
 * chiusura. Le uscite sono `return` da `principale()` con `exitCode`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

await principale();

async function principale() {
  const args = process.argv.slice(2);
  const [url, destinazione] = args;
  if (!url || !destinazione) {
    console.error('Uso: node tools/scarica-pdf.mjs <url> <destinazione.pdf> [--chrome] [--pagina <url-indice>]');
    process.exitCode = 1;
    return;
  }
  const conChrome = args.includes('--chrome');
  const iPagina = args.indexOf('--pagina');
  const paginaIndice = iPagina >= 0 ? args[iPagina + 1] : undefined;

  mkdirSync(dirname(destinazione), { recursive: true });
  let byte;
  try {
    byte = conChrome ? await scaricaConChrome(url, paginaIndice) : await scaricaDiretto(url);
  } catch (e) {
    console.error(String(e.message ?? e));
    if (!conChrome) console.error('Riprova con --chrome (e --pagina <url della pagina che elenca i PDF>).');
    process.exitCode = 2;
    return;
  }

  if (!byte || byte.length < 5 || Buffer.from(byte.subarray(0, 5)).toString('latin1') !== '%PDF-') {
    const inizio = byte ? Buffer.from(byte.subarray(0, 200)).toString('latin1').replace(/\s+/g, ' ') : '(niente)';
    console.error(`Non è un PDF: ${inizio.slice(0, 120)}`);
    if (!conChrome && /cloudflare|challenge|<html|<!doctype/i.test(inizio)) console.error('Sembra una pagina web o una challenge: riprova con --chrome.');
    process.exitCode = 2;
    return;
  }
  writeFileSync(destinazione, byte);
  let pagine = '?';
  try {
    pagine = (await getDocument({ data: new Uint8Array(byte), useSystemFonts: true, verbosity: 0 }).promise).numPages;
  } catch {
    /* si legge lo stesso, ma è sospetto */
  }
  console.log(`${destinazione}: ${(byte.length / 1024).toFixed(0)} kB, ${pagine} pagine`);
}

async function scaricaDiretto(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*;q=0.8', 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.5', Referer: new URL(url).origin + '/' },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}${r.status === 403 ? ' (probabile protezione anti-bot)' : ''}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function scaricaConChrome(url, paginaIndice) {
  const richiediFe = createRequire(join(QUI, '..', '..', 'fe-angular', 'package.json'));
  const puppeteer = richiediFe('puppeteer-core');
  if (!existsSync(CHROME)) throw new Error(`Chrome non trovato in ${CHROME}`);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.5' });
    const primaPagina = paginaIndice ?? new URL(url).origin;
    await page.goto(primaPagina, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    // La challenge, se c'è, si risolve da sola in qualche secondo.
    for (let tentativo = 0; tentativo < 5; tentativo++) {
      const titolo = await page.title().catch(() => '');
      if (!/just a moment|un momento|attention required/i.test(titolo)) break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    // Prima via: fetch dal contesto della pagina (cookie della challenge inclusi).
    try {
      const base64 = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: 'include' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = new Uint8Array(await r.arrayBuffer());
        let s = '';
        for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        return btoa(s);
      }, url);
      return new Uint8Array(Buffer.from(base64, 'base64'));
    } catch (e) {
      console.error(`fetch dalla pagina: ${e.message}; provo a navigare al PDF`);
    }
    // Seconda via: navigare al PDF e prendere la risposta.
    const risposta = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    if (!risposta || !risposta.ok()) throw new Error(`HTTP ${risposta?.status() ?? '?'} navigando al PDF`);
    return new Uint8Array(await risposta.buffer());
  } finally {
    await browser.close();
  }
}
