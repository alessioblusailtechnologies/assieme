import type pg from 'pg';

import type { Job } from '../coda.js';
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
import { eTestuale, markdownDaOriginale } from './estrattori.js';
import { impagina, pdfDaImmagine } from './impagina.js';
import { leggiDocumento } from './lettura-visiva.js';
import { contaPagine } from './pdf.js';
import type { FormatoDocumento } from '../../contratto/documenti-privati.js';
import type { TipologiaDocumento } from '../../contratto/documenti.js';
import { segnaDaRicalcolare } from '../../archivio/albero.js';
import { risolviCliente, type Sceglitore } from '../../archivio/clienti.js';
import { collocaDocumento, type Sceglicartella } from '../../archivio/collocazione.js';
import {
  assicuraConvenzioneAggiornata,
  convenzioneEffettiva,
  type Descrittore,
} from '../../archivio/convenzione.js';
import type { SecondoSguardo } from './secondo-sguardo.js';

/**
 * Quante pagine per chiamata di conversione.
 *
 * Dieci, non venti: è la misura della skill `/ingest-visivo`, e la ragione
 * è quella scritta lì — chi trascrive a lungo comincia a riassumere senza
 * accorgersene. Ogni blocco è una chiamata a sé, quindi un contesto fresco:
 * il modello arriva alla decima pagina con la stessa attenzione della prima.
 * Costa qualche chiamata in più e tiene l'output largamente dentro
 * `max_tokens`.
 */
const PAGINE_PER_BLOCCO = 10;

/**
 * La lettura rapida lavora a blocchi doppi: meno chiamate, meno attesa, e la
 * precisione che si perde è dichiarata a chi ha scelto questo modo.
 */
const PAGINE_PER_BLOCCO_RAPIDO = 20;

export interface DipendenzeIngestion {
  convertitore: Convertitore;
  archivio: ArchivioFile;
  /** Il passo 3 (classificazione): opzionale — senza, la proposta resta quella dell'upload. */
  classificatore?: Classificatore;
  /** Il secondo sguardo (§4b): opzionale — senza, si trascrive e non si ricontrolla. */
  secondoSguardo?: SecondoSguardo;
  /**
   * Il convertitore della lettura rapida: un modello economico per gli
   * allegati di passaggio. Senza, la rapida usa lo stesso dell'altra e resta
   * rapida solo per i blocchi più grossi e i controlli spenti.
   */
  convertitoreRapido?: Convertitore;
  pagineNelBlocco?: number;
  pagineNelBloccoRapido?: number;
  /* Fase 10 — il passo 3b. Tutti opzionali, e ognuno che manca toglie una
     capacità senza rompere niente: senza `sceglitore` un contraente ambiguo
     non diventa un cliente, senza `sceglicartella` un documento senza cliente
     non viene collocato, senza `descrittore` le cartelle libere restano senza
     riga. In tutti i casi il documento è pronto e sta in «Da sistemare». */
  sceglitore?: Sceglitore;
  sceglicartella?: Sceglicartella;
  descrittore?: Descrittore;
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
  formato: FormatoDocumento | null;
  path_originale: string | null;
  path_pdf: string | null;
  path_md: string | null;
  edizione_valida_dal: string | null;
  compagnia_nome: string | null;
  classificazione_da_confermare: boolean;
  /* Fase 10: il materiale della collocazione. `cartella_id` valorizzato
     significa che il documento è arrivato con un percorso suo, e allora la
     collocazione automatica non ha niente da dire. */
  ramo_nome: string | null;
  cartella_id: string | null;
  cliente_id: string | null;
  caricato_il: Date | null;
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
  const pagineNelBloccoRapido = dipendenze.pagineNelBloccoRapido ?? PAGINE_PER_BLOCCO_RAPIDO;

  return async function gestisciIngestion(job: Job, strumenti: { db: pg.Pool }): Promise<void> {
    const { db } = strumenti;
    const documentoId = job.payload['documentoId'];
    if (typeof documentoId !== 'string' || !documentoId) {
      throw new Error('payload senza documentoId');
    }
    /* Il modo lo decide chi carica (RF-C-02): «rapido» è una passata sola con
       un modello economico, senza testimoni né secondo sguardo. I job vecchi
       non ce l'hanno e valgono come letture complete. */
    const rapido = job.payload['modo'] === 'rapido';

    const righe = await db.query<RigaDaConvertire>(
      `select d.id, d.archivio, d.titolo, d.tipologia, d.prodotto, d.nome_file,
              d.formato, d.path_originale, d.path_pdf, d.path_md, d.edizione_valida_dal,
              d.classificazione_da_confermare, c.nome as compagnia_nome,
              r.nome as ramo_nome, d.cartella_id, d.cliente_id, d.caricato_il
       from velia.documenti d
       left join velia.compagnie c on c.id = d.compagnia_id
       left join velia.rami r on r.id = d.ramo_id
       where d.id = $1`,
      [documentoId],
    );
    const documento = righe.rows[0];
    if (!documento) throw new Error(`documento ${documentoId} inesistente`);
    /* `path_originale` è il file com'è stato caricato; sui documenti di
       prima del 01/09/2026 non c'è, ed erano tutti PDF. */
    const originale = documento.path_originale ?? documento.path_pdf;
    if (!originale) throw new Error(`documento ${documentoId} senza file in archivio`);
    const formato: FormatoDocumento = documento.formato ?? 'pdf';
    /* Il PDF da mostrare sta accanto all'originale, con la sua estensione:
       per un PDF sono lo stesso file. */
    const pathPdf = documento.path_pdf ?? originale.replace(/\.[^.]+$/, '.pdf');

    await db.query(
      `update velia.documenti set stato = 'in-elaborazione', errore_elaborazione = null where id = $1`,
      [documentoId],
    );
    await emettiEvento(db, job.id, 'ingestion-inizio', { documentoId });

    try {
      const byte = await dipendenze.archivio.scarica(originale);
      let totale: number;
      let pagine: string[];

      if (eTestuale(formato)) {
        /* Word, Excel, testo, Markdown, CSV: il testo c'è già, ed è più
           fedele di qualunque trascrizione. Si estrae, si impagina in un
           PDF — quello che il visualizzatore aprirà e che le citazioni
           conteranno a pagine — e si finisce lì: nessuna chiamata al
           modello, nessun testimone da interrogare. */
        await emettiEvento(db, job.id, 'ingestion-avanzamento', {
          documentoId,
          fase: 'estrazione',
          fatte: 0,
          di: 1,
        });
        const markdown = await markdownDaOriginale(formato, byte);
        if (!contieneTesto(markdown)) {
          throw new ErroreIngestion('estrazione senza testo riconoscibile', MESSAGGIO_SENZA_TESTO);
        }
        const impaginato = await impagina(documento.titolo, markdown);
        await dipendenze.archivio.carica(pathPdf, impaginato.pdf, 'application/pdf');
        pagine = impaginato.pagine;
        totale = pagine.length;
        await emettiEvento(db, job.id, 'ingestion-avanzamento', {
          documentoId,
          fase: 'estrazione',
          fatte: 1,
          di: 1,
        });
      } else {
        /* PDF e immagini: qui il testo può non esserci affatto, e l'unico
           modo di saperlo è guardare la pagina. Un'immagine diventa prima
           un PDF di una pagina, poi è la stessa strada. */
        const pdf = formato === 'immagine' ? await pdfDaImmagine(byte) : byte;
        if (formato === 'immagine') {
          await dipendenze.archivio.carica(pathPdf, pdf, 'application/pdf');
        }
        try {
          totale = await contaPagine(pdf);
        } catch (errore) {
          throw new ErroreIngestion(
            `PDF non leggibile: ${errore instanceof Error ? errore.message : String(errore)}`,
            'Il file non è un PDF leggibile: potrebbe essere danneggiato o protetto. Caricane una copia apribile.',
          );
        }
        /* La lettura visiva (`lettura-visiva.ts`): il modello guarda ogni
           pagina a blocchi di dieci, i due testimoni meccanici dicono dove
           trascrizione e pagina non coincidono, il secondo sguardo torna solo
           su quelle. È il motore della skill `/ingest-visivo`. */
        const lettura = await leggiDocumento(pdf, totale, {
          convertitore: (rapido ? dipendenze.convertitoreRapido : undefined) ?? dipendenze.convertitore,
          ...(!rapido && dipendenze.secondoSguardo && { secondoSguardo: dipendenze.secondoSguardo }),
          senzaTestimoni: rapido,
          pagineNelBlocco: rapido ? pagineNelBloccoRapido : pagineNelBlocco,
          avanzamento: async (a) => {
            await emettiEvento(db, job.id, 'ingestion-avanzamento', {
              documentoId,
              fase: a.fase,
              fatte: a.fatte,
              di: a.totali,
            });
          },
        });
        pagine = lettura.pagine;

        /* Il verdetto dei testimoni resta nel job: è l'unico posto dove si
           legge, dopo, perché una pagina è stata guardata due volte. */
        const dubbie = lettura.giudizi.filter((g) => g.esito !== 'ok');
        await emettiEvento(db, job.id, 'ingestion-verifica', {
          documentoId,
          pagine: totale,
          senzaOcr: lettura.senzaOcr,
          daGuardare: dubbie.map((g) => `pag. ${g.pagina} (${g.esito}): ${g.note.join('; ')}`),
          correzioni: lettura.correzioni,
        });
      }

      let corpo = pagine
        .map((testo, i) => `[pag. ${i + 1}]\n\n${testo}`.trimEnd())
        .join('\n\n');
      /* RF-B-06, prima release: un documento da cui non esce una riga di
         testo (scansione muta, pagine di sola grafica) non è referenziabile
         e l'utente deve saperlo — non un .md vuoto che la chat non trova.
         *
         * Un'IMMAGINE però fa eccezione (04/09/2026): uno sfondo, un logo,
         * una foto non hanno testo per definizione, e chiamarlo «errore»
         * era classificare male un caso normale. Il file originale finisce
         * nella workspace accanto al Markdown e il motore lo apre con Read:
         * di un'immagine il contenuto è l'immagine, non la sua
         * trascrizione. Il .md resta, perché è lui la fonte citabile. */
      if (!contieneTesto(corpo)) {
        if (formato !== 'immagine') {
          throw new ErroreIngestion('conversione senza testo riconoscibile', MESSAGGIO_SENZA_TESTO);
        }
        corpo = `[pag. 1]\n\nImmagine senza testo. Il file originale è nella workspace accanto a questo Markdown, con lo stesso nome e l'estensione dell'immagine: aprilo con Read per guardarla.`;
      }

      const dataIt = documento.edizione_valida_dal
        ? documento.edizione_valida_dal.split('-').reverse().join('/')
        : 'n.d.';
      const nomePdf = documento.nome_file ?? originale.split('/').pop() ?? originale;
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

      const pathMd = documento.path_md ?? pathPdf.replace(/\.pdf$/i, '.md');
      await dipendenze.archivio.carica(pathMd, Buffer.from(markdown, 'utf8'), 'text/markdown');

      /* Passo 3 (RF-B-03): la proposta del modello, solo se l'utente non ha
         già messo mano ai metadati — la sua parola vale più della nostra. */
      let proposta: PropostaClassificazione | undefined;
      if (
        documento.archivio === 'privato' &&
        documento.classificazione_da_confermare &&
        dipendenze.classificatore
      ) {
        proposta = await proponiClassificazione(db, job, documento, corpo, dipendenze.classificatore);
      }

      /* Passo 3b (Fase 10): dove va. Distinto dal passo 4, che è il posto
         nello Storage. Non blocca mai: un documento che nessuno sa collocare
         resta `pronto` e finisce in «Da sistemare», cercabile e citabile
         come tutti gli altri. */
      if (documento.archivio === 'privato' && job.tenant_id) {
        await colloca(db, job, documento, job.tenant_id, proposta, dipendenze);
      }

      /* `path_pdf` si scrive anche qui: per chi non è arrivato in PDF è
         adesso che esiste il documento da aprire. */
      await db.query(
        `update velia.documenti
         set stato = 'pronto', numero_pagine = $2, path_md = $3, path_pdf = $5,
             dimensione_md_byte = $4, errore_elaborazione = null
         where id = $1`,
        [documentoId, totale, pathMd, Buffer.byteLength(markdown, 'utf8'), pathPdf],
      );
      await emettiEvento(db, job.id, 'ingestion-fine', { documentoId, pagine: totale, pathMd });
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
): Promise<PropostaClassificazione | undefined> {
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
         riferimento_cliente = coalesce(riferimento_cliente, $5),
         numero_polizza = coalesce(numero_polizza, $6),
         decorrenza = coalesce(decorrenza, $7::date),
         scadenza = coalesce(scadenza, $8::date),
         descrizione = coalesce(descrizione, $9)
     where id = $1 and classificazione_da_confermare`,
    [
      documento.id,
      proposta.tipologia,
      compagniaId,
      ramoId,
      riferimentoCliente,
      proposta.numeroPolizza || null,
      proposta.decorrenza || null,
      proposta.scadenza || null,
      proposta.descrizione || null,
    ],
  );
  await emettiEvento(db, job.id, 'ingestion-classificazione', {
    documentoId: documento.id,
    tipologia: proposta.tipologia,
    compagniaId,
    ramoId,
  });

  /* Il chiamante ne ha bisogno per la collocazione: la tassonomia l'ha già
     ripulita, quindi si restituisce la proposta *corretta*, non quella
     grezza del modello. */
  return {
    ...proposta,
    compagniaId,
    ramoId,
    ...(compagniaId && {
      compagniaNome: compagnie.rows.find((c) => c.id === compagniaId)?.nome,
    }),
  };
}

/**
 * Il passo 3b: dove va questo documento.
 *
 * Tre cose in fila, e ognuna può fermarsi senza conseguenze. Prima si tiene
 * aggiornata la convenzione (solo se l'albero è cambiato di forma), poi si
 * risolve il contraente in un cliente vero, poi si sceglie la cartella. Se
 * una qualsiasi non riesce, il documento resta in «Da sistemare»: è una
 * condizione visibile che si rimedia in due secondi, mentre un documento
 * nella cartella sbagliata si scopre fra sei mesi.
 *
 * Non tocca mai lo stato del documento: la collocazione non è una porta.
 */
async function colloca(
  db: pg.Pool,
  job: Job,
  documento: RigaDaConvertire,
  tenantId: string,
  proposta: (PropostaClassificazione & { compagniaNome?: string }) | undefined,
  dipendenze: DipendenzeIngestion,
): Promise<void> {
  /* Il documento è arrivato con un percorso suo (importazione, o upload di
     una cartella): quella è la collocazione dell'utente e non si discute.
     Si dice comunque, perché un passo che a volte non lascia traccia è un
     passo che non si riesce a diagnosticare quando qualcosa non torna. */
  if (documento.cartella_id) {
    await emettiEvento(db, job.id, 'ingestion-collocazione-saltata', {
      documentoId: documento.id,
      motivo: 'il documento è arrivato con una cartella sua',
    });
    return;
  }

  try {
    await assicuraConvenzioneAggiornata(db, tenantId, dipendenze.descrittore);

    let clienteId = documento.cliente_id;
    let clienteNome: string | null = null;
    if (!clienteId) {
      const risolto = await risolviCliente(
        db,
        tenantId,
        {
          /* Solo `contraente`: `riferimentoCliente` è il riferimento della
             pratica in testo libero («Fattura n. 36 del 31.08.2026 - WISELYST
             S.R.L.») e usarlo come nome di persona faceva nascere clienti che
             clienti non sono — visto succedere, il 04/09. */
          contraente: proposta?.contraente ?? null,
          codiceFiscale: proposta?.codiceFiscale ?? null,
          partitaIva: proposta?.partitaIva ?? null,
          ...(proposta?.fiducia && { fiducia: proposta.fiducia }),
        },
        dipendenze.sceglitore,
      );
      if (risolto) {
        clienteId = risolto.id;
        clienteNome = risolto.nome;
        await db.query(`update velia.documenti set cliente_id = $2 where id = $1`, [
          documento.id,
          risolto.id,
        ]);
        await emettiEvento(db, job.id, 'ingestion-cliente', {
          documentoId: documento.id,
          clienteId: risolto.id,
          nome: risolto.nome,
          creato: risolto.creato,
          via: risolto.via,
        });
      }
    } else {
      const r = await db.query<{ nome: string }>(`select nome from velia.clienti where id = $1`, [
        clienteId,
      ]);
      clienteNome = r.rows[0]?.nome ?? null;
    }

    const esito = await collocaDocumento(
      db,
      tenantId,
      {
        clienteId,
        clienteNome,
        compagniaNome: proposta?.compagniaNome ?? documento.compagnia_nome,
        ramoNome: documento.ramo_nome,
        prodotto: documento.prodotto,
        tipologia: (proposta?.tipologia ?? documento.tipologia) as TipologiaDocumento,
        decorrenza: proposta?.decorrenza ?? null,
        caricatoIl: documento.caricato_il,
        titolo: documento.titolo,
      },
      {
        ...(dipendenze.sceglicartella && { sceglicartella: dipendenze.sceglicartella }),
        convenzione: await convenzioneEffettiva(db, tenantId),
      },
    );

    if (!esito) {
      await emettiEvento(db, job.id, 'ingestion-collocazione-saltata', {
        documentoId: documento.id,
        motivo: 'nessuna cartella individuata con sicurezza',
      });
      return;
    }

    /* `collocazione_da_confermare` a vero: è una proposta, e resta tale
       finché l'utente non sposta a mano. `collocazione_proposta` conserva
       il percorso proposto — il delta con quello finale è l'unica misura
       onesta della qualità del classificatore. */
    await db.query(
      `update velia.documenti
       set cartella_id = $2, collocazione_proposta = $3, collocazione_da_confermare = true
       where id = $1 and cartella_id is null`,
      [documento.id, esito.cartellaId, esito.percorso],
    );
    // Cartelle nate adesso = albero cambiato di forma: la convenzione va rifatta.
    if (esito.create) await segnaDaRicalcolare(db, tenantId);
    await emettiEvento(db, job.id, 'ingestion-collocazione', {
      documentoId: documento.id,
      cartellaId: esito.cartellaId,
      percorso: esito.percorso,
      cartelleCreate: esito.create,
    });
  } catch (errore) {
    /* Come per la classificazione: una collocazione mancata non è
       un'ingestion fallita. Il documento è convertito, pronto e citabile. */
    await emettiEvento(db, job.id, 'ingestion-collocazione-saltata', {
      documentoId: documento.id,
      motivo: errore instanceof Error ? errore.message : String(errore),
    });
  }
}
