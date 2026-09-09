/**
 * Analisi consumi: dove vanno i token e i soldi, per origine e per modello.
 *
 *   node tools/analisi-consumi.mjs [giorni]
 *
 * Legge `velia.consumi` (una riga per chiamata al modello, scritta dai
 * gestori del worker) e la incrocia con `velia.jobs` per capire quanto
 * costa un messaggio di chat completo, non la singola chiamata.
 */
import pg from 'pg';

process.loadEnvFile(new URL('../.env', import.meta.url));

const giorni = Number(process.argv[2] ?? 30);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const tabella = (righe) => {
  if (righe.length === 0) return '  (nessuna riga)';
  const colonne = Object.keys(righe[0]);
  const largh = colonne.map((c) => Math.max(c.length, ...righe.map((r) => String(r[c] ?? '').length)));
  const riga = (vals) => '  ' + vals.map((v, i) => String(v ?? '').padStart(largh[i])).join('  ');
  return [riga(colonne), riga(largh.map((l) => '-'.repeat(l))), ...righe.map((r) => riga(colonne.map((c) => r[c])))].join('\n');
};

const q = async (titolo, sql, params = []) => {
  const { rows } = await db.query(sql, params);
  console.log(`\n=== ${titolo} ===`);
  console.log(tabella(rows));
};

await q(
  `Per origine e modello (ultimi ${giorni} giorni)`,
  `select origine, modello,
          count(*) as chiamate,
          round(sum(costo_usd), 2) as costo_usd,
          round(100 * sum(costo_usd) / nullif(sum(sum(costo_usd)) over (), 0), 1) as pct,
          sum(token_input) as input,
          sum(token_cache_lettura) as cache_letta,
          sum(token_cache_scrittura) as cache_scritta,
          sum(token_output) as output,
          round(100.0 * sum(token_cache_lettura) / nullif(sum(token_input + token_cache_lettura + token_cache_scrittura), 0), 1) as pct_da_cache
     from velia.consumi
    where created_at > now() - ($1 || ' days')::interval
    group by origine, modello
    order by sum(costo_usd) desc`,
  [giorni],
);

await q(
  'Costo per messaggio di chat (job app, distribuzione)',
  `with per_job as (
     select job_id, sum(costo_usd) as costo, sum(token_output) as output,
            sum(token_input + token_cache_lettura + token_cache_scrittura) as input
       from velia.consumi
      where created_at > now() - ($1 || ' days')::interval and origine = 'app' and job_id is not null
      group by job_id)
   select count(*) as messaggi,
          round(avg(costo)::numeric, 4) as medio_usd,
          round((percentile_cont(0.5) within group (order by costo))::numeric, 4) as mediano_usd,
          round((percentile_cont(0.9) within group (order by costo))::numeric, 4) as p90_usd,
          round(max(costo), 4) as max_usd,
          round(avg(input)) as input_medio,
          round(avg(output)) as output_medio
     from per_job`,
  [giorni],
);

await q(
  'I 10 messaggi piu cari',
  `select c.job_id,
          round(sum(c.costo_usd), 3) as costo_usd,
          sum(c.token_input + c.token_cache_lettura + c.token_cache_scrittura) as input,
          sum(c.token_output) as output,
          count(*) as chiamate,
          max(c.created_at)::date as giorno
     from velia.consumi c
    where c.created_at > now() - ($1 || ' days')::interval and c.origine = 'app'
    group by c.job_id
    order by 2 desc
    limit 10`,
  [giorni],
);

await db.end();
