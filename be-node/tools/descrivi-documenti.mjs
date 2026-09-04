#!/usr/bin/env node
/**
 * Scrive la `descrizione` dei documenti dell'Archivio Privato che sono
 * entrati prima che il classificatore la producesse (migrazione
 * 20260904160000).
 *
 * È la riga «Cosa contiene» degli `INDICE.md` della workspace: senza, il
 * motore vede il titolo di un file e deve aprirlo per sapere se gli serve.
 * Da oggi la scrive l'ingestion nella stessa chiamata della
 * classificazione; qui si recupera l'arretrato, un documento alla volta,
 * sull'inizio del Markdown già convertito (nessuna riconversione).
 *
 *   node tools/descrivi-documenti.mjs --elenco
 *   node tools/descrivi-documenti.mjs --secco            # stampa e non scrive
 *   node tools/descrivi-documenti.mjs --tenant <uuid> --limite 20
 *   node tools/descrivi-documenti.mjs --rifai            # anche quelli che ce l'hanno
 *
 * Tocca SOLO la colonna `descrizione`: classificazione, cartella e cliente
 * restano quelli che sono.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const QUI = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(QUI, '..', '.env'));
} catch {
  /* variabili già nell'ambiente */
}

const BUCKET = 'archivio';
const CARATTERI = 12000;

const argomenti = process.argv.slice(2);
const valore = (nome) => {
  const i = argomenti.indexOf(nome);
  return i >= 0 && argomenti[i + 1] && !argomenti[i + 1].startsWith('--') ? argomenti[i + 1] : undefined;
};
const opzioni = {
  elenco: argomenti.includes('--elenco'),
  secco: argomenti.includes('--secco'),
  rifai: argomenti.includes('--rifai'),
  tenant: valore('--tenant'),
  limite: Number(valore('--limite') ?? 200),
  modello: valore('--modello') ?? process.env.MODELLO_INDICI ?? 'claude-sonnet-5',
};

const ISTRUZIONI = `Sei l'archivista di Velia, piattaforma per intermediari assicurativi italiani. Ricevi l'inizio di un documento dell'archivio privato di un'agenzia e ne scrivi UNA riga: che cosa c'è dentro.

La legge chi deve decidere se aprirlo mentre cerca in archivio, quindi usa le parole con cui lo si cercherebbe: garanzie, oggetto assicurato, veicolo o bene, importi che lo identificano. «RC Auto, furto e incendio su Fiat Panda targa AB123CD, massimale 6.450.000 €, franchigia 300 €» è utile; «documento assicurativo del cliente» non serve a niente.

Massimo 300 caratteri. Nessuna frase di cortesia, niente «questo documento», niente maiuscole di enfasi. Non ripetere il titolo se non aggiunge nulla. Se dall'estratto non si capisce che cosa contenga, rispondi con la stringa vuota: una riga inventata è peggio di una riga assente.`;

const STRUMENTO = {
  name: 'descrivi',
  description: 'Deposita la descrizione del documento.',
  input_schema: {
    type: 'object',
    properties: {
      descrizione: {
        type: 'string',
        description: 'Che cosa contiene il documento, in una riga di massimo 300 caratteri. Stringa vuota se non si capisce.',
      },
    },
    required: ['descrizione'],
  },
};

async function principale() {
  if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Servono DATABASE_URL, SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in be-node/.env');
    return;
  }
  const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const righe = await db.query(
      `select d.id, d.titolo, d.tipologia, d.path_md, d.tenant_id::text as tenant
       from velia.documenti d
       where d.archivio = 'privato' and d.stato = 'pronto' and d.path_md is not null
         and ($1::uuid is null or d.tenant_id = $1::uuid)
         and ($2 or d.descrizione is null)
       order by d.caricato_il desc nulls last
       limit $3`,
      [opzioni.tenant ?? null, opzioni.rifai, opzioni.limite],
    );

    if (!righe.rows.length) {
      console.log('Niente da descrivere: tutti i documenti privati hanno già la loro riga.');
      return;
    }
    if (opzioni.elenco) {
      for (const r of righe.rows) console.log(`${r.id}  ${r.tipologia.padEnd(12)} ${r.titolo}`);
      console.log(`\n${righe.rows.length} documenti senza descrizione.`);
      return;
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Serve ANTHROPIC_API_KEY in be-node/.env');
      return;
    }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    let fatti = 0;
    let vuoti = 0;
    for (const doc of righe.rows) {
      try {
        const { data, error } = await supabase.storage.from(BUCKET).download(doc.path_md);
        if (error) throw new Error(error.message);
        const estratto = (await data.text()).slice(0, CARATTERI);

        const risposta = await anthropic.messages.create({
          model: opzioni.modello,
          max_tokens: 1000,
          system: ISTRUZIONI,
          tools: [STRUMENTO],
          tool_choice: { type: 'tool', name: STRUMENTO.name },
          messages: [
            { role: 'user', content: `Titolo: ${doc.titolo}\nTipologia: ${doc.tipologia}\n\n${estratto}` },
          ],
        });
        const uso = risposta.content.find((b) => b.type === 'tool_use');
        const descrizione = (uso?.input?.descrizione ?? '').trim().slice(0, 300);
        if (!descrizione) {
          vuoti += 1;
          console.log(`· ${doc.titolo} — il modello non se l’è sentita`);
          continue;
        }
        if (!opzioni.secco) {
          await db.query('update velia.documenti set descrizione = $2 where id = $1', [doc.id, descrizione]);
        }
        fatti += 1;
        console.log(`✓ ${doc.titolo}\n   ${descrizione}`);
      } catch (errore) {
        console.error(`✗ ${doc.titolo}: ${errore.message}`);
      }
    }
    console.log(`\n${fatti} descrizioni${opzioni.secco ? ' (secco, niente scritto)' : ' scritte'}, ${vuoti} saltate.`);
  } finally {
    await db.end();
  }
}

await principale();
