#!/usr/bin/env node
/**
 * Aggiunge agli `INDICE.md` dell'Archivio Pubblico la sezione
 * `## Garanzie e rischi trattati` — quella che da oggi le skill di
 * ingestion scrivono da sole (ISTRUZIONI §4), qui per i set che sono
 * entrati prima.
 *
 * Perché serve: gli indici sanno i sinonimi dei NOMI COMMERCIALI, non
 * quelli dei rischi. «Quali prodotti in archivio coprono i cristalli?» non
 * ha risposta senza aprire tutto, perché l'indice dice che prodotto è, non
 * quali rischi tratta.
 *
 * Come lavora, e perché costa poco: non manda al modello i documenti
 * interi. Di ogni `.md` estrae lo **scheletro** — titoli, sezioni,
 * articoli, ognuno con l'ancora `[pag. N]` più vicina — e chiede solo di
 * riordinarlo in garanzie con la loro pagina. Poche migliaia di token per
 * edizione, e i numeri non li inventa nessuno: le pagine vengono dalle
 * ancore, non dal modello.
 *
 *   node tools/arricchisci-indici.mjs --elenco
 *   node tools/arricchisci-indici.mjs --secco            # prova, scrive in .velia-worker/indici/
 *   node tools/arricchisci-indici.mjs --solo nobis
 *   node tools/arricchisci-indici.mjs                    # tutte le edizioni che non ce l'hanno
 *   node tools/arricchisci-indici.mjs --rifai --solo nobis/auto/filo-diretto-car
 *
 * Idempotente: un'edizione che ha già la sezione si salta, salvo `--rifai`.
 * Prima di sovrascrivere deposita `INDICE.md.originale` accanto all'indice
 * (una volta sola, la prima): lo Storage non tiene versioni e un indice
 * scritto a mano nell'ingestion non si rifà. Il motore non lo vede.
 * Gli indici in cache nelle workspace scadono da soli in un'ora.
 *
 * Niente `process.exit` dopo una fetch: su Windows libuv protesta in
 * chiusura (stessa ragione di applica-migrazione.mjs).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const QUI = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(QUI, '..', '.env'));
} catch {
  /* variabili già nell'ambiente */
}

const BUCKET = 'archivio';
const TITOLO_SEZIONE = '## Garanzie e rischi trattati';
const CATALOGO = join(QUI, '..', 'dati', 'catalogo-archivio.json');

const argomenti = process.argv.slice(2);
const opzioni = {
  elenco: argomenti.includes('--elenco'),
  secco: argomenti.includes('--secco'),
  rifai: argomenti.includes('--rifai'),
  solo: valore('--solo'),
  modello: valore('--modello') ?? process.env.MODELLO_INDICI ?? 'claude-sonnet-5',
};

function valore(nome) {
  const i = argomenti.indexOf(nome);
  return i >= 0 && argomenti[i + 1] && !argomenti[i + 1].startsWith('--') ? argomenti[i + 1] : undefined;
}

const ISTRUZIONI = `Sei l'archivista di Velia, piattaforma per intermediari assicurativi italiani. Ricevi lo SCHELETRO di un set informativo: i titoli, le sezioni e gli articoli dei documenti, ognuno con la pagina del PDF in cui si trova.

Devi elencare le garanzie e i rischi che il set tratta, perché un motore di ricerca possa capire, senza aprire i documenti, se questo prodotto è pertinente a una domanda come «quali prodotti coprono i cristalli?».

Elenca le garanzie vere e proprie e le prestazioni assicurate, nell'ordine in cui compaiono. NON elencare gli articoli amministrativi (pagamento del premio, durata, recesso, oneri fiscali, comunicazioni, denuncia del sinistro, nomina dei periti, glossario, privacy): non sono rischi coperti. Le garanzie opzionali si elencano come le altre.

Meglio dieci voci giuste che venti gonfiate: questo elenco serve a decidere dove guardare, e una voce inventata manda il motore su un documento sbagliato.`;

const STRUMENTO = {
  name: 'elenca_garanzie',
  description: 'Deposita le garanzie e i rischi che il set informativo tratta.',
  input_schema: {
    type: 'object',
    properties: {
      garanzie: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nome: {
              type: 'string',
              description:
                'Il nome della garanzia COME LO SCRIVE IL DOCUMENTO, non il nome giusto in generale: se la compagnia la chiama «Eventi sociopolitici», scrivi «Eventi sociopolitici», non «Atti vandalici». Scrivilo in forma leggibile («Garanzia rottura cristalli»), non in maiuscolo, e senza la numerazione dell’articolo.',
            },
            pagina: {
              type: 'integer',
              description:
                'Il numero di pagina che compare nello scheletro accanto a quella voce. Non calcolarlo e non stimarlo: se non c’è, ometti la garanzia.',
            },
            rischi: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Da 2 a 6 rischi concreti che quella garanzia nomina, con le parole del documento («grandine», «trombe d’aria», «furto totale», «traino»). Lista vuota se lo scheletro non li dice: non inventarli.',
            },
          },
          required: ['nome', 'pagina', 'rischi'],
        },
      },
    },
    required: ['garanzie'],
  },
};

/** Le righe che contano di un `.md`: titoli, sezioni, articoli, con la pagina. */
function scheletro(markdown, massimo = 300) {
  const righe = [];
  let pagina = null;
  for (const riga of markdown.split('\n')) {
    const ancora = riga.match(/\[pag\. (\d+)\]/);
    if (ancora) pagina = Number(ancora[1]);
    const pulita = riga.replace(/\[pag\. \d+\]/g, '').trim();
    if (!pulita) continue;
    const interessante =
      /^#{1,6}\s/.test(pulita) ||
      /^\*{0,2}(SEZIONE|CAPITOLO|TITOLO|PARTE)\b/i.test(pulita) ||
      /^\*{0,2}Art(\.|icolo)\s*\d/i.test(pulita) ||
      /^\*{0,2}\d+(\.\d+)+\s+\S/.test(pulita) ||
      (pulita === pulita.toUpperCase() && pulita.length > 12 && pulita.length < 120 && /[A-ZÀ-Ü]{4}/.test(pulita));
    if (!interessante) continue;
    /* L'indice interno delle Condizioni ripete ogni titolo con la sua
       numerazione interna e una fila di puntini: è rumore, e la pagina che
       porta non è quella del PDF. */
    const daIndice = /\.{6,}\s*\d+\s*$/.test(pulita);
    const testo = pulita.replace(/\.{4,}\s*\d*\s*$/, '').replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').trim();
    if (!testo || daIndice) continue;
    righe.push(`${pagina === null ? '[?]' : `[pag. ${pagina}]`} ${testo}`);
    if (righe.length >= massimo) break;
  }
  return righe;
}

function rendi(garanzie) {
  const voci = garanzie
    .filter((g) => g && g.nome && Number.isInteger(g.pagina))
    .map((g) => {
      const rischi = Array.isArray(g.rischi) && g.rischi.length ? ` (${g.rischi.join(', ')})` : '';
      return `- ${g.nome} [pag. ${g.pagina}]${rischi}`;
    });
  if (!voci.length) return null;
  return `${TITOLO_SEZIONE}\n\nCon quali parole questo set nomina i rischi che tratta. Serve a trovare il documento giusto: la copertura, i limiti e le esclusioni li dicono le Condizioni.\n\n${voci.join('\n')}\n`;
}

/** La sezione entra prima della mappa delle sezioni, o in coda. */
function innesta(indice, sezione) {
  const senzaVecchia = indice.replace(
    new RegExp(`\\n?${TITOLO_SEZIONE}[\\s\\S]*?(?=\\n## |$)`, 'u'),
    '\n',
  );
  const mappa = senzaVecchia.indexOf('\n## Mappa delle sezioni');
  const unito =
    mappa >= 0
      ? `${senzaVecchia.slice(0, mappa)}\n\n${sezione}\n${senzaVecchia.slice(mappa + 1)}`
      : `${senzaVecchia.replace(/\s*$/, '')}\n\n${sezione}`;
  return unito.replace(/\n{3,}/g, '\n\n');
}

async function principale() {
  if (!existsSync(CATALOGO)) {
    console.error(`Manca ${CATALOGO}: genera prima il manifesto con carica-archivio.mjs.`);
    return;
  }
  const catalogo = JSON.parse(readFileSync(CATALOGO, 'utf8'));

  // Un'edizione = una cartella dello Storage con dentro i .md e l'INDICE.
  const edizioni = new Map();
  for (const doc of catalogo) {
    if (!doc.pathMd) continue;
    const cartella = doc.pathMd.split('/').slice(0, -1).join('/');
    if (opzioni.solo && !cartella.includes(opzioni.solo)) continue;
    const voce = edizioni.get(cartella) ?? { cartella, documenti: [], titolo: '' };
    voce.documenti.push(doc);
    voce.titolo = `${doc.compagniaId?.replace('cmp-', '') ?? '?'} ${doc.prodotto ?? ''} ${doc.edizione?.etichetta ?? ''}`.trim();
    edizioni.set(cartella, voce);
  }

  if (!edizioni.size) {
    console.error(opzioni.solo ? `Nessuna edizione contiene «${opzioni.solo}».` : 'Catalogo vuoto.');
    return;
  }
  if (opzioni.elenco) {
    for (const e of edizioni.values()) console.log(`${e.cartella}  (${e.documenti.length} doc)  ${e.titolo}`);
    console.log(`\n${edizioni.size} edizioni.`);
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Servono SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in be-node/.env');
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

  const scarica = async (percorso) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(percorso);
    if (error) throw new Error(`${percorso}: ${error.message}`);
    return await data.text();
  };

  let fatte = 0;
  let saltate = 0;
  const falliti = [];

  for (const edizione of edizioni.values()) {
    const percorsoIndice = `${edizione.cartella}/INDICE.md`;
    try {
      const indice = await scarica(percorsoIndice);
      if (indice.includes(TITOLO_SEZIONE) && !opzioni.rifai) {
        saltate += 1;
        console.log(`· ${edizione.cartella} — ce l'ha già`);
        continue;
      }

      const parti = [];
      for (const doc of edizione.documenti) {
        const testo = await scarica(doc.pathMd);
        /* I DIP sono corti e sono l'unico posto dove i rischi stanno
           scritti per esteso («grandine, trombe d'aria, alluvione»): quelli
           si mandano interi, delle Condizioni basta lo scheletro. */
        const corpo = /^dip/.test(doc.tipologia ?? '')
          ? testo.replace(/\n{2,}/g, '\n').slice(0, 12000)
          : scheletro(testo).join('\n');
        if (corpo.trim()) parti.push(`### ${doc.titolo}\n${corpo}`);
      }
      if (!parti.length) {
        falliti.push(`${edizione.cartella}: nessuno scheletro estratto`);
        continue;
      }

      /* La forma la impone lo strumento, non una preghiera nel prompt: il
         modello non ha modo di premettere una frase di cortesia al JSON. */
      const risposta = await anthropic.messages.create({
        model: opzioni.modello,
        max_tokens: 8000,
        system: ISTRUZIONI,
        tools: [STRUMENTO],
        tool_choice: { type: 'tool', name: STRUMENTO.name },
        messages: [{ role: 'user', content: `Set: ${edizione.titolo}\n\n${parti.join('\n\n')}` }],
      });
      if (risposta.stop_reason === 'max_tokens') throw new Error('risposta troncata dal modello');
      const uso = risposta.content.find((b) => b.type === 'tool_use');
      if (!uso) throw new Error('il modello non ha compilato l’elenco');
      const sezione = rendi(uso.input.garanzie ?? []);
      if (!sezione) {
        falliti.push(`${edizione.cartella}: il modello non ha trovato garanzie`);
        continue;
      }
      const nuovo = innesta(indice, sezione);

      if (opzioni.secco) {
        /* Sotto `.velia-worker/`, che è già fuori dal repo per costruzione. */
        const fuori = join(QUI, '..', '.velia-worker', 'indici', edizione.cartella);
        mkdirSync(fuori, { recursive: true });
        writeFileSync(join(fuori, 'INDICE.md'), nuovo, 'utf8');
      } else {
        /* La copia dell'originale, una volta sola: lo Storage non tiene
           versioni, e un indice scritto a mano nell'ingestion non si
           rifà. `upsert: false` fa fallire il secondo giro, ed è quello
           che vogliamo — la copia buona è la prima. Il motore non la vede:
           la workspace si porta dietro solo i file chiamati INDICE.md. */
        await supabase.storage
          .from(BUCKET)
          .upload(`${percorsoIndice}.originale`, Buffer.from(indice, 'utf8'), {
            contentType: 'text/markdown',
            upsert: false,
          });
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(percorsoIndice, Buffer.from(nuovo, 'utf8'), { contentType: 'text/markdown', upsert: true });
        if (error) throw new Error(error.message);
      }
      fatte += 1;
      const quante = sezione.split('\n').filter((r) => r.startsWith('- ')).length;
      console.log(`✓ ${edizione.cartella} — ${quante} garanzie${opzioni.secco ? ' (secco)' : ''}`);
    } catch (errore) {
      falliti.push(`${edizione.cartella}: ${errore.message}`);
      console.error(`✗ ${edizione.cartella}: ${errore.message}`);
    }
  }

  console.log(`\n${fatte} indici aggiornati, ${saltate} già a posto, ${falliti.length} falliti.`);
  if (falliti.length) console.log(falliti.map((f) => `  - ${f}`).join('\n'));
  if (!opzioni.secco && fatte) {
    console.log('Le workspace tengono gli INDICE in cache per un’ora: il motore li vede da lì in poi.');
  }
}

await principale();
