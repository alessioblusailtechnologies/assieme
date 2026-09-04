/**
 * Rilavora un documento rimasto in errore, **col codice di questo checkout
 * e senza passare dalla coda**.
 *
 * Serve per una ragione precisa, che in locale si ripresenta: la coda pgmq
 * è una sola e condivisa col worker dell'ambiente dev su Render. Se quello
 * gira su un commit vecchio, vince la gara sui job nuovi e li lavora con
 * codice che non sa fare quello che hai appena scritto — l'errore che vedi
 * in chat è suo, non tuo. Rimettere il job in coda non aiuta: lo riprende
 * lui. Qui il gestore viene invocato in-process, quindi il documento lo
 * lavora la macchina su cui stai sviluppando.
 *
 *   npx tsx tools/rilavora-ingestion.ts --elenco
 *   npx tsx tools/rilavora-ingestion.ts all-1923a64d69e9
 *   npx tsx tools/rilavora-ingestion.ts --tutti           # tutti quelli in errore
 *
 * Non tocca la coda e non crea job: riusa l'id del job esistente perché gli
 * eventi abbiano dove attaccarsi. Se il documento va a buon fine torna
 * `pronto` e la chat se ne accorge da sola al battito successivo.
 *
 * La cura vera resta rideployare (o sospendere) il worker dev: `curl
 * https://api-dev.sonovelia.it/api/salute` dice su che commit sta.
 */
import { chiudiPool, poolDb } from '../src/db/pool.js';
import type { Job } from '../src/contratto/agenti.js';
import { gestori } from '../src/worker/gestori.js';

interface RigaErrore {
  id: string;
  titolo: string;
  archivio: string;
  formato: string | null;
  errore_elaborazione: string | null;
}

const argomenti = process.argv.slice(2);
const tutti = argomenti.includes('--tutti');
const soloElenco = argomenti.includes('--elenco');
const richiesti = argomenti.filter((a) => !a.startsWith('--'));

const db = poolDb();
try {
  if (!tutti && !soloElenco && !richiesti.length) {
    console.error('Uso: npx tsx tools/rilavora-ingestion.ts <documentoId> | --tutti | --elenco');
  } else {
    const inErrore = await db.query<RigaErrore>(
      `select id, titolo, archivio, formato, errore_elaborazione from velia.documenti
       where stato = 'errore' and ($1::text[] = '{}' or id = any($1))
       order by caricato_il desc nulls last`,
      [richiesti],
    );

    if (!inErrore.rows.length) {
      console.log(richiesti.length ? 'Nessuno di quegli id è in errore.' : 'Nessun documento in errore.');
    } else if (soloElenco) {
      for (const d of inErrore.rows) {
        console.log(`${d.id}  ${(d.formato ?? '?').padEnd(9)} ${d.titolo}\n   ${d.errore_elaborazione ?? ''}`);
      }
      console.log(`\n${inErrore.rows.length} documenti in errore.`);
    } else {
      const daFare = tutti ? inErrore.rows : inErrore.rows.filter((d) => richiesti.includes(d.id));
      for (const documento of daFare) {
        /* Il job esistente dà l'id a cui appendere gli eventi: senza, la
           scrittura degli eventi cade sulla foreign key. */
        const job = await db.query<{ id: string; tenant_id: string; utente_id: string | null; payload: Record<string, unknown> }>(
          `select id, tenant_id, utente_id, payload from velia.jobs
           where tipo = 'ingestion' and payload->>'documentoId' = $1
           order by created_at desc limit 1`,
          [documento.id],
        );
        const riga = job.rows[0];
        if (!riga) {
          console.error(`✗ ${documento.id}: nessun job di ingestion da cui ripartire`);
          continue;
        }
        await db.query(
          `update velia.documenti set stato = 'in-coda', errore_elaborazione = null where id = $1`,
          [documento.id],
        );
        console.log(`· ${documento.id} — ${documento.titolo}`);
        try {
          await gestori.ingestion!(
            {
              id: riga.id,
              tipo: 'ingestion',
              stato: 'in-esecuzione',
              payload: riga.payload,
              tenantId: riga.tenant_id,
              utenteId: riga.utente_id,
            } as unknown as Job,
            { db },
          );
          const dopo = await db.query<{ stato: string; numero_pagine: number | null }>(
            `select stato, numero_pagine from velia.documenti where id = $1`,
            [documento.id],
          );
          console.log(`  ✓ ${dopo.rows[0]?.stato} (${dopo.rows[0]?.numero_pagine ?? '?'} pagine)`);
        } catch (errore) {
          console.error(`  ✗ ${errore instanceof Error ? errore.message : String(errore)}`);
        }
      }
    }
  }
} finally {
  await chiudiPool();
}
