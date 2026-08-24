import type pg from 'pg';

import type { Job } from '../coda.js';
import { addebitaCrediti } from '../crediti.js';
import { emettiEvento } from '../eventi.js';
import type { ArchivioFile } from './archivio-file.js';
import {
  CARATTERI_ESTRATTO,
  type Classificatore,
  type PropostaClassificazione,
  type VoceTassonomia,
} from './classificatore.js';
import { headerDocumento } from './convenzioni.js';
import type { Convertitore } from './convertitore.js';
import { blocchi, contaPagine, estraiPagine } from './pdf.js';

/**
 * Quante pagine per chiamata di conversione. Il limite duro dell'API è 100
 * (Haiku, contesto 200K); 20 tiene l'output di ogni blocco largamente
 * dentro max_tokens e rende il progresso visibile all'utente. Da tarare
 * coi primi documenti veri contro il campione dell'esperimento.
 */
const PAGINE_PER_BLOCCO = 20;

export interface DipendenzeIngestion {
  convertitore: Convertitore;
  archivio: ArchivioFile;
  /** Il passo 3 (classificazione): opzionale — senza, la proposta resta quella dell'upload. */
  classificatore?: Classificatore;
  pagineNelBlocco?: number;
}

/**
 * Un errore di ingestion che sa spiegarsi all'utente (RF-B-05/B-06): il
 * messaggio tecnico va nel job, quello leggibile sul documento.
 */
export class ErroreIngestion extends Error {
  constructor(
    messaggioTecnico: string,
    readonly messaggioUtente: string,
  ) {
    super(messaggioTecnico);
    this.name = 'ErroreIngestion';
  }
}

const MESSAGGIO_GENERICO =
  'La conversione non è riuscita per un problema tecnico. Riprova a caricare il documento; se il problema persiste, segnalalo al gestore della piattaforma.';

export const MESSAGGIO_SENZA_TESTO =
  'Il documento è una scansione senza testo riconoscibile: non può essere referenziato in chat finché non ne carichi una versione leggibile.';

interface RigaDaConvertire {
  id: string;
  archivio: 'pubblico' | 'privato' | 'conversazione';
  titolo: string;
  tipologia: string;
  prodotto: string | null;
  nome_file: string | null;
  path_pdf: string | null;
  path_md: string | null;
  edizione_valida_dal: string | null;
  compagnia_nome: string | null;
  classificazione_da_confermare: boolean;
}

/**
 * Il job di ingestion (VELIA-piano-sviluppo-be.md §4.2): il passo 2, PDF →
 * Markdown con ancore di pagina — l'unica chiamata API che contiene i byte
 * di un documento — e, per l'Archivio Privato, il passo 3: la
 * classificazione proposta dal modello, che l'utente conferma o corregge.
 * La collocazione fine (INDICE dell'archivio privato) arriva con la
 * materializzazione della workspace in Fase 3: Postgres è la verità sulla
 * navigazione, lo Storage sui contenuti.
 *
 * Idempotente per costruzione: ogni passo riscrive, non appende. Un doppio
 * arrivo del messaggio riconverte e sovrascrive lo stesso .md.
 */
export function creaGestoreIngestion(dipendenze: DipendenzeIngestion) {
  const pagineNelBlocco = dipendenze.pagineNelBlocco ?? PAGINE_PER_BLOCCO;

  return async function gestisciIngestion(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const documentoId = job.payload['documentoId'];
    if (typeof documentoId !== 'string' || !documentoId) {
      throw new Error('payload senza documentoId');
    }

    const righe = await db.query<RigaDaConvertire>(
      `select d.id, d.archivio, d.titolo, d.tipologia, d.prodotto, d.nome_file,
              d.path_pdf, d.path_md, d.edizione_valida_dal,
              d.classificazione_da_confermare, c.nome as compagnia_nome
       from velia.documenti d
       left join velia.compagnie c on c.id = d.compagnia_id
       where d.id = $1`,
      [documentoId],
    );
    const documento = righe.rows[0];
    if (!documento) throw new Error(`documento ${documentoId} inesistente`);
    if (!documento.path_pdf) throw new Error(`documento ${documentoId} senza PDF in archivio`);

    await db.query(
      `update velia.documenti set stato = 'in-elaborazione', errore_elaborazione = null where id = $1`,
      [documentoId],
    );
    await emettiEvento(db, job.id, 'ingestion-inizio', { documentoId });

    try {
      const pdf = await dipendenze.archivio.scarica(documento.path_pdf);
      let totale: number;
      try {
        totale = await contaPagine(pdf);
      } catch (errore) {
        throw new ErroreIngestion(
          `PDF non leggibile: ${errore instanceof Error ? errore.message : String(errore)}`,
          'Il file non è un PDF leggibile: potrebbe essere danneggiato o protetto. Caricane una copia apribile.',
        );
      }
      const spezzoni = blocchi(totale, pagineNelBlocco);

      const parti: string[] = [];
      for (const [indice, [da, a]] of spezzoni.entries()) {
        const pdfBlocco = await estraiPagine(pdf, da, a);
        parti.push(
          await dipendenze.convertitore.convertiBlocco(pdfBlocco, {
            paginaIniziale: da,
            pagineTotali: totale,
          }),
        );
        await emettiEvento(db, job.id, 'ingestion-avanzamento', {
          documentoId,
          blocco: indice + 1,
          di: spezzoni.length,
        });
      }

      const corpo = parti.join('\n\n');
      /* RF-B-06, prima release: un documento da cui non esce una riga di
         testo (scansione muta, pagine di sola grafica) non è referenziabile
         e l'utente deve saperlo — non un .md vuoto che la chat non trova. */
      if (!contieneTesto(corpo)) {
        throw new ErroreIngestion('conversione senza testo riconoscibile', MESSAGGIO_SENZA_TESTO);
      }

      const dataIt = documento.edizione_valida_dal
        ? documento.edizione_valida_dal.split('-').reverse().join('/')
        : 'n.d.';
      const nomePdf =
        documento.nome_file ?? documento.path_pdf.split('/').pop() ?? documento.path_pdf;
      const markdown =
        headerDocumento({
          titolo: documento.titolo,
          compagnia: documento.compagnia_nome ?? 'n.d.',
          prodotto: documento.prodotto ?? 'n.d.',
          tipologia: documento.tipologia,
          edizione: dataIt,
          daPagina: 1,
          aPagina: totale,
          pagineTotali: totale,
          filePdf: nomePdf,
        }) +
        '\n' +
        corpo;

      const pathMd = documento.path_md ?? documento.path_pdf.replace(/\.pdf$/i, '.md');
      await dipendenze.archivio.carica(pathMd, Buffer.from(markdown, 'utf8'), 'text/markdown');

      /* Passo 3 (RF-B-03): la proposta del modello, solo se l'utente non ha
         già messo mano ai metadati — la sua parola vale più della nostra. */
      if (
        documento.archivio === 'privato' &&
        documento.classificazione_da_confermare &&
        dipendenze.classificatore
      ) {
        await proponiClassificazione(db, job, documento, corpo, dipendenze.classificatore);
      }

      await db.query(
        `update velia.documenti
         set stato = 'pronto', numero_pagine = $2, path_md = $3,
             dimensione_md_byte = $4, errore_elaborazione = null
         where id = $1`,
        [documentoId, totale, pathMd, Buffer.byteLength(markdown, 'utf8')],
      );
      await emettiEvento(db, job.id, 'ingestion-fine', { documentoId, pagine: totale, pathMd });
      /* Pricing: la conversione di un documento del tenant vale 1 credito;
         i pubblici (job senza tenant) sono della piattaforma. */
      if (job.tenant_id) {
        await addebitaCrediti(db, {
          tenantId: job.tenant_id,
          jobId: job.id,
          operazione: 'conversione',
          descrizione: `Conversione di «${documento.titolo}»`,
        });
      }
    } catch (errore) {
      /* RF-B-05/B-06: l'errore è uno stato visibile col suo motivo, non un
         log — e il motivo parla all'utente, non al programmatore. Poi si
         rilancia: il retry del worker resta padrone del gioco. */
      const messaggio = errore instanceof ErroreIngestion ? errore.messaggioUtente : MESSAGGIO_GENERICO;
      await db.query(
        `update velia.documenti set stato = 'errore', errore_elaborazione = $2 where id = $1`,
        [documentoId, messaggio],
      );
      throw errore;
    }
  };
}

/** C'è almeno una riga che non sia un'ancora, un callout o vuota? */
export function contieneTesto(markdown: string): boolean {
  return markdown.split('\n').some((riga) => {
    const r = riga.trim();
    return r !== '' && !/^\[pag\. \d+\]$/.test(r) && !r.startsWith('> [!ATTENZIONE]');
  });
}

async function proponiClassificazione(
  db: pg.Pool,
  job: Job,
  documento: RigaDaConvertire,
  corpo: string,
  classificatore: Classificatore,
): Promise<void> {
  const [compagnie, rami] = await Promise.all([
    db.query<VoceTassonomia>('select id, nome from velia.compagnie order by nome'),
    db.query<VoceTassonomia>('select id, nome from velia.rami order by nome'),
  ]);

  let proposta: PropostaClassificazione;
  try {
    proposta = await classificatore.classifica({
      nomeFile: documento.nome_file ?? documento.titolo,
      estratto: corpo.slice(0, CARATTERI_ESTRATTO),
      compagnie: compagnie.rows,
      rami: rami.rows,
    });
  } catch (errore) {
    /* Una proposta mancata non è un'ingestion fallita: il documento è
       convertito e pronto, la classificazione resta quella iniziale. */
    await emettiEvento(db, job.id, 'ingestion-classificazione-saltata', {
      documentoId: documento.id,
      motivo: errore instanceof Error ? errore.message : String(errore),
    });
    return;
  }

  // Mai un id che non esiste: il modello propone, la tassonomia decide.
  const compagniaId = compagnie.rows.some((c) => c.id === proposta.compagniaId)
    ? proposta.compagniaId
    : null;
  const ramoId = rami.rows.some((r) => r.id === proposta.ramoId) ? proposta.ramoId : null;
  const riferimentoCliente = proposta.riferimentoCliente || null;

  /* `and classificazione_da_confermare`: se l'utente ha confermato mentre
     convertivamo, la proposta non scrive più nulla. */
  await db.query(
    `update velia.documenti
     set tipologia = $2, compagnia_id = $3, ramo_id = $4,
         riferimento_cliente = coalesce(riferimento_cliente, $5)
     where id = $1 and classificazione_da_confermare`,
    [documento.id, proposta.tipologia, compagniaId, ramoId, riferimentoCliente],
  );
  await emettiEvento(db, job.id, 'ingestion-classificazione', {
    documentoId: documento.id,
    tipologia: proposta.tipologia,
    compagniaId,
    ramoId,
  });
}
