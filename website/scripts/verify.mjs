/**
 * Controlli sul sito compilato: link interni, ancore, unicità dei metadati e
 * struttura dei titoli. Da eseguire dopo `npm run build`:
 *
 *     node scripts/verify.mjs
 *
 * Esce con codice 1 se trova un problema, così è utilizzabile in CI.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\//, '');
const problems = [];
const notes = [];

/* --- Raccolta delle pagine --- */

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));

/** `dist/legale/privacy.html` → `/legale/privacy` */
const routeOf = (file) =>
  '/' +
  relative(DIST, file)
    .split(sep)
    .join('/')
    .replace(/\.html$/, '')
    .replace(/(^|\/)index$/, '');

const routes = new Set(htmlFiles.map((f) => routeOf(f) || '/'));
const assets = new Set(
  files.map((f) => '/' + relative(DIST, f).split(sep).join('/')),
);

/* --- Analisi di ogni pagina --- */

const titles = new Map();
const descriptions = new Map();
const anchorsByRoute = new Map();

const pages = htmlFiles.map((file) => {
  const html = readFileSync(file, 'utf8');
  const route = routeOf(file) || '/';

  const ids = new Set(
    [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
  );
  anchorsByRoute.set(route, ids);

  return { route, file, html };
});

for (const { route, html } of pages) {
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim();
  const desc = html.match(
    /<meta name="description" content="([^"]*)"/,
  )?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const h1s = [...html.matchAll(/<h1[\s>]/g)].length;
  const lang = html.match(/<html lang="([^"]*)"/)?.[1];

  if (!title) problems.push(`${route}: manca <title>`);
  if (!desc) problems.push(`${route}: manca la meta description`);
  if (!canonical) problems.push(`${route}: manca il canonical`);
  if (lang !== 'it') problems.push(`${route}: lang="${lang}" invece di "it"`);

  if (h1s !== 1) problems.push(`${route}: ${h1s} elementi <h1> (atteso 1)`);

  if (desc && (desc.length < 70 || desc.length > 165)) {
    notes.push(`${route}: description di ${desc.length} caratteri (ideale 70–165)`);
  }
  if (title && title.length > 65) {
    notes.push(`${route}: title di ${title.length} caratteri (ideale ≤ 65)`);
  }

  if (title) {
    if (titles.has(title)) {
      problems.push(`title duplicato fra ${titles.get(title)} e ${route}`);
    }
    titles.set(title, route);
  }
  if (desc) {
    if (descriptions.has(desc)) {
      problems.push(`description duplicata fra ${descriptions.get(desc)} e ${route}`);
    }
    descriptions.set(desc, route);
  }

  // Dati strutturati: devono essere JSON valido.
  for (const [, block] of html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      JSON.parse(block);
    } catch (err) {
      problems.push(`${route}: JSON-LD non valido — ${err.message}`);
    }
  }
}

/* --- Link interni --- */

let checked = 0;

for (const { route, html } of pages) {
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

  for (const href of hrefs) {
    if (/^(https?:|mailto:|tel:|#|data:)/.test(href)) continue;
    checked++;

    const [path, hash] = href.split('#');
    const target = path === '' ? route : path.replace(/\/$/, '') || '/';

    const known =
      routes.has(target) ||
      assets.has(target) ||
      assets.has(href) ||
      target === '/sitemap-index.xml';

    if (!known) {
      problems.push(`${route}: link interno rotto → ${href}`);
      continue;
    }

    if (hash) {
      const ids = anchorsByRoute.get(target);
      if (ids && !ids.has(hash)) {
        problems.push(`${route}: ancora inesistente → ${href}`);
      }
    }
  }
}

/* --- Sitemap e robots --- */

const sitemapIndex = files.find((f) => f.endsWith('sitemap-index.xml'));
if (!sitemapIndex) problems.push('sitemap-index.xml non generata');

const robots = files.find((f) => f.endsWith('robots.txt'));
if (!robots) problems.push('robots.txt non generato');

const sitemapUrls = files
  .filter((f) => /sitemap-\d+\.xml$/.test(f))
  .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)])
  .map((m) => new URL(m[1]).pathname.replace(/\/$/, '') || '/');

if (sitemapUrls.includes('/404')) {
  problems.push('la 404 non deve comparire nella sitemap');
}

for (const route of routes) {
  if (route !== '/404' && !sitemapUrls.includes(route)) {
    problems.push(`${route}: assente dalla sitemap`);
  }
}

/* --- Esito --- */

console.log(`Pagine analizzate:   ${pages.length}`);
console.log(`Link interni:        ${checked}`);
console.log(`URL nella sitemap:   ${sitemapUrls.length}`);

if (notes.length) {
  console.log(`\nAvvisi (${notes.length}):`);
  for (const n of notes) console.log(`  · ${n}`);
}

if (problems.length) {
  console.log(`\nErrori (${problems.length}):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  process.exit(1);
}

console.log('\n✓ Nessun errore.');
