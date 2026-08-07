/**
 * Back-office minimo dell'Archivio Pubblico (RF-A-06, prima forma).
 *
 * Percorre un albero preparato nel layout del motore
 * (`archivio-pubblico/<compagnia>/<ramo>/<prodotto>/ed-…`), e per ogni
 * edizione:
 *
 *  1. carica su Storage (bucket `archivio`) il PDF originale e i `.md`
 *     con le ancore di pagina, INDICE compreso;
 *  2. scrive le righe di catalogo in Postgres, coi metadati letti dagli
 *     header dei Markdown (titolo, tipologia, edizione, pagine);
 *  3. aggiorna `dati/catalogo-archivio.json` — il manifesto (soli metadati,
 *     mai contenuti) da cui il seed rigenera il catalogo in CI.
 *
 * Idempotente: ricaricare lo stesso albero aggiorna, non duplica.
 *
 *   node tools/carica-archivio.mjs ../esperimento-motore/workspace/archivio-pubblico
 *   node tools/carica-archivio.mjs <albero> --pulisci-fixture   # via anche i doc-pub-* finti
 */
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const QUI = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(QUI, '..', '.env'));
} catch {
  /* variabili già nell'ambiente */
}

const radice = process.argv[2];
if (!radice || !existsSync(radice)) {
  console.error('Uso: node tools/carica-archivio.mjs <albero archivio-pubblico> [--pulisci-fixture]');
  process.exit(1);
}
const pulisciFixture = process.argv.includes('--pulisci-fixture');

const BUCKET = 'archivio';

const TIPOLOGIA_PER_FILE = {
  'dip.md': 'dip',
  'dip-aggiuntivo.md': 'dip-aggiuntivo',
  'condizioni-di-assicurazione.md': 'condizioni-assicurazione',
  'glossario.md': 'glossario',
  'informativa-privacy.md': 'altro',
  'riferimenti-utili.md': 'altro',
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? undefined : { rejectUnauthorized: false },
  max: 4,
});

/* ------------------------------------------------------------------ lettura */

/** `> **Compagnia**: X · **Prodotto**: Y · … · **Edizione**: 01/11/2022 · **Pagine nel PDF**: 1–6 di 212 (file `Z.pdf`)` */
function metadatiDaHeader(md) {
  const campo = (nome) => md.match(new RegExp(`\\*\\*${nome}\\*\\*:\\s*([^·\\n]+)`))?.[1].trim();
  const pagine = md.match(/Pagine nel PDF\*{0,2}:\s*\*{0,2}\s*(\d+)\s*[–-]\s*(\d+)/);
  const file = md.match(/file\s+`([^`]+)`/);
  const dataIt = campo('Edizione')?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return {
    titolo: md.match(/^#\s+(.+)$/m)?.[1].trim(),
    prodotto: campo('Prodotto'),
    validaDal: dataIt ? `${dataIt[3]}-${dataIt[2]}-${dataIt[1]}` : undefined,
    pagine: pagine ? Number(pagine[2]) - Number(pagine[1]) + 1 : undefined,
    paginaInizio: pagine ? Number(pagine[1]) : undefined,
    filePdf: file?.[1],
  };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ------------------------------------------------------------------- scan */

const catalogo = [];
const caricamenti = []; // [pathLocale, pathStorage, contentType]

for (const compagniaDir of readdirSync(radice)) {
  const percorsoCompagnia = join(radice, compagniaDir);
  if (!statSync(percorsoCompagnia).isDirectory()) {
    if (compagniaDir.endsWith('.md'))
      caricamenti.push([percorsoCompagnia, `archivio-pubblico/${compagniaDir}`, 'text/markdown']);
    continue;
  }
  for (const ramoDir of readdirSync(percorsoCompagnia)) {
    const percorsoRamo = join(percorsoCompagnia, ramoDir);
    if (!statSync(percorsoRamo).isDirectory()) continue;
    for (const prodottoDir of readdirSync(percorsoRamo)) {
      const percorsoProdotto = join(percorsoRamo, prodottoDir);
      if (!statSync(percorsoProdotto).isDirectory()) continue;

      const edizioni = readdirSync(percorsoProdotto)
        .filter((n) => n.startsWith('ed-') && statSync(join(percorsoProdotto, n)).isDirectory())
        .sort(); // ed-YYYY-MM: l'ordine alfabetico è l'ordine temporale

      edizioni.forEach((edDir, indice) => {
        const percorsoEd = join(percorsoProdotto, edDir);
        const base = `archivio-pubblico/${compagniaDir}/${ramoDir}/${prodottoDir}/${edDir}`;
        const corrente = indice === edizioni.length - 1;

        // La validità dell'edizione storica termina dove inizia la successiva.
        const successiva = edizioni[indice + 1];

        let pdfEdizione;
        for (const file of readdirSync(percorsoEd)) {
          if (!file.endsWith('.md')) continue;
          const contenuto = readFileSync(join(percorsoEd, file), 'utf8');
          caricamenti.push([join(percorsoEd, file), `${base}/${file}`, 'text/markdown']);
          if (file === 'INDICE.md') continue;

          const meta = metadatiDaHeader(contenuto);
          pdfEdizione ??= meta.filePdf;

          const tipologia = TIPOLOGIA_PER_FILE[file] ?? 'altro';
          catalogo.push({
            id: `doc-${slug(compagniaDir)}-${slug(prodottoDir)}-${edDir}-${slug(basename(file, '.md'))}`,
            compagniaId: `cmp-${slug(compagniaDir)}`,
            ramoId: `ram-${slug(ramoDir)}`,
            prodotto: meta.prodotto ?? prodottoDir,
            titolo: meta.titolo ?? basename(file, '.md'),
            tipologia,
            numeroPagine: meta.pagine,
            paginaInizio: meta.paginaInizio,
            edizione: {
              id: `edz-${slug(prodottoDir)}-${edDir.slice(3)}`,
              etichetta: `ed. ${meta.validaDal?.slice(5, 7)}/${meta.validaDal?.slice(0, 4)}`,
              validaDal: meta.validaDal,
              corrente,
              _dirEdizione: edDir,
              _dirSuccessiva: successiva,
            },
            pathMd: `${base}/${file}`,
            pathPdf: `${base}/originale.pdf`,
          });
        }

        // Il PDF originale dell'edizione, cercato accanto all'albero (originali/).
        if (pdfEdizione) {
          const candidati = [
            join(radice, '..', '..', 'originali', pdfEdizione),
            join(radice, '..', 'originali', pdfEdizione),
          ];
          const trovato = candidati.find((c) => existsSync(c));
          if (!trovato) {
            console.warn(`⚠ PDF originale non trovato per ${edDir}: ${pdfEdizione}`);
          } else {
            caricamenti.push([trovato, `${base}/originale.pdf`, 'application/pdf']);
          }
        }
      });
    }
  }
}

// validaAl delle storiche = giorno prima della validaDal della successiva.
for (const doc of catalogo) {
  const succ = doc.edizione._dirSuccessiva;
  if (!succ) continue;
  const sorella = catalogo.find((d) => d.edizione._dirEdizione === succ && d.prodotto === doc.prodotto);
  if (sorella?.edizione.validaDal) {
    const giorno = new Date(sorella.edizione.validaDal);
    giorno.setDate(giorno.getDate() - 1);
    doc.edizione.validaAl = giorno.toISOString().slice(0, 10);
  }
}
for (const doc of catalogo) {
  delete doc.edizione._dirEdizione;
  delete doc.edizione._dirSuccessiva;
}

console.log(`catalogo: ${catalogo.length} documenti · file da caricare: ${caricamenti.length}`);

/* ----------------------------------------------------------------- carica */

const { error: erroreBucket } = await supabase.storage.createBucket(BUCKET, { public: false });
if (erroreBucket && !/already exists/i.test(erroreBucket.message)) throw erroreBucket;

for (const [locale, remoto, contentType] of caricamenti) {
  const contenuto = readFileSync(locale);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(remoto, contenuto, { contentType, upsert: true });
  if (error) throw new Error(`${remoto}: ${error.message}`);
  console.log(`↑ ${remoto} (${(contenuto.length / 1024).toFixed(0)} kB)`);
}

/* ---------------------------------------------------------------- cataloga */

if (pulisciFixture) {
  const via = await db.query(`delete from assieme.documenti where id like 'doc-pub-%'`);
  console.log(`fixture rimosse dal catalogo: ${via.rowCount}`);
}

for (const d of catalogo) {
  await db.query(
    `insert into assieme.documenti
       (id, archivio, titolo, tipologia, numero_pagine, pagina_inizio, compagnia_id, ramo_id, prodotto,
        edizione_id, edizione_etichetta, edizione_valida_dal, edizione_valida_al,
        edizione_corrente, path_pdf, path_md)
     values ($1,'pubblico',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (id) do update set
       titolo = excluded.titolo, tipologia = excluded.tipologia,
       numero_pagine = excluded.numero_pagine, pagina_inizio = excluded.pagina_inizio, compagnia_id = excluded.compagnia_id,
       ramo_id = excluded.ramo_id, prodotto = excluded.prodotto,
       edizione_id = excluded.edizione_id, edizione_etichetta = excluded.edizione_etichetta,
       edizione_valida_dal = excluded.edizione_valida_dal,
       edizione_valida_al = excluded.edizione_valida_al,
       edizione_corrente = excluded.edizione_corrente,
       path_pdf = excluded.path_pdf, path_md = excluded.path_md`,
    [
      d.id, d.titolo, d.tipologia, d.numeroPagine ?? null, d.paginaInizio ?? null, d.compagniaId, d.ramoId, d.prodotto,
      d.edizione.id, d.edizione.etichetta, d.edizione.validaDal ?? null,
      d.edizione.validaAl ?? null, d.edizione.corrente, d.pathPdf, d.pathMd,
    ],
  );
}
console.log(`catalogo aggiornato: ${catalogo.length} righe`);

/* --------------------------------------------------------------- manifesto */

const percorsoManifesto = join(QUI, '..', 'dati', 'catalogo-archivio.json');
writeFileSync(percorsoManifesto, JSON.stringify(catalogo, null, 1) + '\n', 'utf8');
console.log(`manifesto scritto: ${percorsoManifesto}`);

await db.end();
