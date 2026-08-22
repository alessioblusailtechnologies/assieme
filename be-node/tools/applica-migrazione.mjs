#!/usr/bin/env node
/**
 * Applica una migrazione al progetto Supabase online e la registra nel
 * ledger — la prassi del progetto da quando `supabase db push` è rotto
 * (ruolo `cli_login_postgres` non alterabile, guasto lato piattaforma).
 *
 *   node tools/applica-migrazione.mjs --elenco
 *   node tools/applica-migrazione.mjs supabase/migrations/20260822100000_archivio_privato.sql
 *
 * Usa SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF da be-node/.env. La
 * migrazione gira come un'unica query (la Management API la esegue in una
 * transazione): o passa tutta o non passa. Il ledger si aggiorna solo dopo.
 *
 * Niente `process.exit` dopo una fetch: su Windows libuv protesta in
 * chiusura. Le uscite anticipate sono `return` da `principale()`.
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  /* in CI le variabili arrivano dall'ambiente */
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error('Servono SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF in be-node/.env');
  process.exit(1);
}

async function query(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const corpo = await r.text();
  if (!r.ok) throw new Error(`Management API ${r.status}: ${corpo}`);
  return corpo ? JSON.parse(corpo) : [];
}

async function principale(argomento) {
  if (!argomento || argomento === '--elenco') {
    const righe = await query(
      'select version, name from supabase_migrations.schema_migrations order by version',
    );
    for (const r of righe) console.log(`${r.version}  ${r.name ?? ''}`);
    return;
  }

  const percorso = resolve(argomento);
  const nomeFile = basename(percorso);
  const corrispondenza = /^(\d{14})_(.+)\.sql$/.exec(nomeFile);
  if (!corrispondenza) {
    throw new Error(`Nome non conforme (atteso YYYYMMDDHHMMSS_nome.sql): ${nomeFile}`);
  }
  const [, versione, nome] = corrispondenza;

  const giaApplicate = await query(
    `select 1 from supabase_migrations.schema_migrations where version = '${versione}'`,
  );
  if (giaApplicate.length) {
    console.log(`Migrazione ${versione} già registrata: niente da fare.`);
    return;
  }

  const sql = readFileSync(percorso, 'utf8');
  console.log(`Applico ${nomeFile} al progetto ${ref}…`);
  await query(sql);

  // La Management API non accetta parametri: si cita a mano, in dollar quoting.
  const cita = (s) => `$velia$${s}$velia$`;
  await query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values (${cita(versione)}, ${cita(nome)}, array[${cita(sql)}])`,
  );
  console.log(`Fatto: ${versione} (${nome}) applicata e registrata.`);
}

await principale(process.argv[2]);
