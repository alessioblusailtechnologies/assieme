import { z } from 'zod';

import { consegnabile } from './formati.js';

/**
 * Specchio di `fe-angular/src/app/core/models/{conversazione,citazione,comune}.ts`
 * e di `core/api/conversazioni-api.ts`, col comportamento fissato da
 * `mocks/chat.mjs`: il contratto della chat (Fase 3). Il FE lo dichiara
 * «specifica che il backend dovrà implementare»: qui si onora.
 *
 * Una sola aggiunta, concordata come additiva (il FE ignora i tipi di evento
 * che non conosce): l'evento `attivita`, i passi di lavoro del motore —
 * «l'utente vede il lavoro, non uno spinner» (piano §4.3).
 */

export type ArchivioRiferimento = 'pubblico' | 'privato' | 'conversazione';

/**
 * Come si carica un allegato dal composer (RF-C-02, scelta del 01/09/2026).
 *
 * `archivio` — il documento entra nell'Archivio Privato e lo si legge con la
 * lettura visiva: pagina per pagina, coi testimoni e il secondo sguardo.
 * Lento e caro, ma il documento resta e le citazioni sono verificate.
 *
 * `rapido` — resta attaccato alla conversazione, se ne va con lei, e la
 * lettura è una passata sola con un modello economico. Serve a chi ha una
 * domanda al volo su un file che non gli interessa conservare.
 *
 * Chi carica sceglie: è l'unico che sa se quel PDF è materiale d'agenzia o
 * un allegato di passaggio.
 */
export type ModoAllegato = 'archivio' | 'rapido';

/** Lo stato dell'ingestion di un documento, per il chip del composer. */
export type StatoDocumento = 'in-coda' | 'in-elaborazione' | 'pronto' | 'errore';

/** Lo stato dell'ingestion di un allegato, per il chip del composer. */
export interface StatoAllegato {
  stato: StatoDocumento;
  erroreElaborazione?: string;
}

/**
 * Il set informativo di cui un documento pubblico fa parte: il prodotto in
 * una sua edizione (12/09/2026).
 *
 * Viaggia col riferimento perché l'interfaccia parla di **prodotti** mentre
 * il contesto resta fatto di documenti: nel composer e nel pannello i
 * quattro documenti di un set sono un chip solo, e dopo un ricaricamento
 * della pagina devono tornare a esserlo senza reinterrogare l'archivio.
 */
export interface SetDiRiferimento {
  /** La stessa chiave dell'elenco per set: compagnia + prodotto + edizione. */
  chiave: string;
  prodotto: string;
  compagnia: string;
  /** Es. «ed. 04/2026». */
  edizione: string;
  /** Falso su un'edizione superata: il chip lo dice (RF-A-04). */
  corrente: boolean;
}

export interface RiferimentoDocumento {
  id: string;
  titolo: string;
  archivio: ArchivioRiferimento;
  /** Il set di cui fa parte, sui documenti dell'Archivio Pubblico. */
  set?: SetDiRiferimento;
  /**
   * Dov'è arrivata la lettura del documento (01/09/2026). Viaggia col
   * contesto della conversazione perché il chip sappia dire «in lavorazione»
   * anche a chi ricarica la pagina: il caricamento continua sul server, e
   * l'interfaccia deve poterlo ritrovare invece di ripartire da zero.
   * Assente sui riferimenti scritti prima.
   */
  stato?: StatoDocumento;
}

export interface Conversazione {
  id: string;
  titolo: string;
  creataIl: string;
  aggiornataIl: string;
  documentiInContesto: RiferimentoDocumento[];
  /**
   * Il cliente di cui si sta parlando (12/09/2026), quando qualcuno l'ha
   * menzionato con `@`.
   *
   * Non è un filtro — l'agenzia continua a leggere tutto il suo archivio —
   * ma un punto di partenza: la scheda del cliente finisce nella workspace,
   * e la conversazione compare nella sua pagina. Menzionare un cliente non
   * restringe, orienta.
   */
  cliente?: { id: string; nome: string };
  condivisa: boolean;
  autoreId: string;
  /**
   * C'è una risposta in volo per questa conversazione (01/09/2026): il job
   * è in coda o in esecuzione. Lo storico ci accende il suo indicatore e la
   * chat sa di doversi riagganciare al flusso invece di mostrare il silenzio.
   */
  rispostaInCorso?: boolean;
}

export interface PaginaConversazioni {
  elementi: Conversazione[];
  totale: number;
  pagina: number;
  perPagina: number;
}

export interface PosizioneDocumento {
  pagina: number;
  articolo?: string;
  sezione?: string;
  evidenzia?: { x: number; y: number; larghezza: number; altezza: number };
}

export interface Citazione {
  id: string;
  documentoId: string;
  documentoTitolo: string;
  /** Il FE ammetteva solo pubblico/privato: 'conversazione' è l'estensione per gli allegati (Fase 3). */
  archivio: ArchivioRiferimento;
  posizione: PosizioneDocumento;
  estratto: string;
  /**
   * I numeri con cui il testo richiama questa fonte (`[1]`, `[2]`…): la
   * posizione nell'elenco del blocco finale, più eventuali doppioni
   * accorpati. Il FE rende ogni rimando come chip nel punto esatto.
   * Assente nei messaggi precedenti al 29/08/2026.
   */
  rimandi?: number[];
}

export interface Provenienza {
  tipo: 'regola' | 'documento-riferimento' | 'memoria';
  origineId: string;
  etichetta: string;
}

export type AutoreMessaggio = 'utente' | 'assistente';

export interface Messaggio {
  id: string;
  conversazioneId: string;
  autore: AutoreMessaggio;
  testo: string;
  inviatoIl: string;
  documentiReferenziati: string[];
  citazioni: Citazione[];
  provenienze: Provenienza[];
  nonSupportato?: boolean;
  /** I documenti generati su template durante la risposta (aggiunta additiva, 25/08/2026). */
  documenti?: DocumentoGenerato[];
  /** Il riordino dell'archivio proposto durante la risposta (04/09/2026). */
  proposta?: PropostaArchivio;
  /** Come ci è arrivato: i passi del motore in ordine (07/09/2026). Vuoto sui messaggi dell'utente. */
  passi?: Passo[];
}

/**
 * Un passo di lavoro del motore, nell'ordine in cui è avvenuto.
 *
 * È lo stesso che scorre dal vivo sul flusso SSE, tenuto anche dopo: le
 * citazioni dicono da dove viene ogni frase, i passi dicono dove il motore
 * ha guardato prima di sceglierle — comprese le strade che non hanno
 * portato a niente, che sono quelle che spiegano una risposta storta.
 */
export interface Passo {
  /** La frase in italiano già mostrata nello stream: «Leggo «Nuova 4R»». */
  etichetta: string;
  /**
   * Chi l'ha prodotta: `Read`, `Grep`, `Glob`, `mcp__velia__…`. Serve al
   * front-end per l'icona. Assente sui passi che il motore racconta a
   * parole sue, che non nascono da uno strumento.
   */
  strumento?: string;
  /** Quando è cominciato, ISO 8601. */
  istante: string;
  /**
   * Quanto è durato. Lo chiude il passo successivo, o la fine della
   * risposta; manca solo se la risposta si è interrotta prima.
   */
  durataMs?: number;
}

/**
 * Un intervento sull'archivio che l'assistente **propone**, e che nessuno
 * applica finché l'utente non lo approva: intestare documenti a un cliente,
 * aggiungere o togliere etichette.
 *
 * È la scelta di fondo, e non cambia: il motore lavora su una copia in sola
 * lettura e non ha strumenti per scrivere. Qui non ne guadagna uno, guadagna
 * la possibilità di *chiedere*. La proposta viaggia col messaggio e
 * sopravvive a un ricaricamento; la scrittura vera la fa l'API con
 * l'identità di chi approva, sotto la sua RLS.
 */
export interface PropostaArchivio {
  id: string;
  operazioni: OperazioneArchivio[];
  stato: 'proposta' | 'applicata' | 'annullata';
  /** Perché, in una riga: quello che il modello dichiara di voler fare. */
  motivo?: string;
}

export type OperazioneArchivio =
  | {
      azione: 'intesta-documento';
      documentoId: string;
      titolo: string;
      /** Risolto al momento della proposta: qui non nascono clienti nuovi. */
      clienteId: string;
      cliente: string;
    }
  | {
      azione: 'etichetta-documento';
      documentoId: string;
      titolo: string;
      /* Si aggiunge e si toglie, non si sostituisce: la proposta parla di
         due parole, e il documento ne può avere altre che nessuno ha
         chiesto di toccare. */
      aggiungi: string[];
      togli: string[];
    };

/**
 * La decisione su una proposta: `PATCH
 * /api/conversazioni/:id/proposte/:pid`. Non c'è un terzo stato: o si applica
 * o si lascia perdere, e in entrambi i casi la proposta smette di chiedere.
 */
export const schemaDecisioneProposta = z.object({
  decisione: z.enum(['approva', 'annulla']),
});

export type DecisioneProposta = z.infer<typeof schemaDecisioneProposta>;

/**
 * L'esito dell'approvazione. `mancate` non è un errore: è l'elenco di quello
 * che nel frattempo non si poteva più fare (un cliente fuso da un collega,
 * un documento eliminato). Il resto è stato applicato.
 */
export interface EsitoProposta {
  proposta: PropostaArchivio;
  fatte: number;
  mancate: string[];
}

/**
 * Un documento generato in chat su richiesta dell'utente: col layout di
 * VELIA («Esporta come») o dalla sandbox su un modello di riferimento. Il
 * file sta nello Storage, `url` è la rotta che lo serve.
 */
export interface DocumentoGenerato {
  id: string;
  nome: string;
  /**
   * L'estensione del file. «Esporta come» fa PDF, Word ed Excel; la sandbox
   * dall'11/09/2026 qualsiasi formato tranne gli eseguibili (pagine web,
   * immagini, PowerPoint, CSV, ZIP…).
   */
  formato: string;
  /** Il modello usato, per raccontarlo; assente col layout di VELIA. */
  modello?: string;
  url: string;
}

/** Gli eventi del flusso SSE, uno per frame `data: <json>\n\n`. */
export type EventoStream =
  | { tipo: 'inizio'; messaggioId: string; messaggioUtenteId: string }
  /**
   * Un passo di lavoro del motore. `strumento` e `istante` sono additivi
   * (07/09/2026): servono al front-end per l'icona e per il cronometro, e
   * portano dal vivo gli stessi valori che poi restano in `Messaggio.passi`,
   * così la cronologia in streaming e quella ricaricata coincidono.
   */
  | { tipo: 'attivita'; etichetta: string; strumento?: string; istante?: string }
  | { tipo: 'testo'; delta: string }
  | { tipo: 'citazione'; citazione: Citazione }
  | { tipo: 'provenienza'; provenienza: Provenienza }
  | { tipo: 'non-supportato' }
  /** RF-G-01: ciò che la memoria ha imparato da questo scambio (solo se ha imparato qualcosa). */
  | { tipo: 'memoria'; ricordi: RicordoAppreso[] }
  /** Un documento generato su template durante la risposta: il FE lo mostra da scaricare. */
  | { tipo: 'documento'; documento: DocumentoGenerato }
  /** Un riordino proposto: il FE lo mostra sotto la risposta con Approva e Annulla. */
  | { tipo: 'proposta'; proposta: PropostaArchivio }
  | { tipo: 'fine' }
  | { tipo: 'errore'; messaggio: string };

export const percorsoDocumentoGenerato = (tenantId: string, id: string, formato: string): string =>
  `tenant/${tenantId}/generati/${id}.${formato}`;

export const urlDocumentoGenerato = (conversazioneId: string, id: string): string =>
  `/api/conversazioni/${conversazioneId}/documenti/${id}`;

/** Un ricordo appena appreso, nella forma minima che la bolla mostra e collega al pannello. */
export interface RicordoAppreso {
  id: string;
  testo: string;
  categoria: 'prassi' | 'cliente' | 'preferenza' | 'decisione' | 'altro';
  ambito: 'tenant' | 'personale';
}

export const TITOLO_NUOVA = 'Nuova conversazione';

/**
 * Il titolo dal primo messaggio, come nel mock: tutto su una riga, al massimo
 * 60 caratteri, troncato al confine di parola con i puntini di sospensione.
 */
export function titoloDaMessaggio(testo: string): string {
  const pulito = testo.replace(/\s+/g, ' ').trim();
  if (pulito.length <= 60) return pulito;
  const tronco = pulito.slice(0, 60);
  return `${tronco.slice(0, tronco.lastIndexOf(' '))}…`;
}

export const schemaNuovaConversazione = z.object({
  titolo: z.string().trim().min(1).max(200).optional(),
  documentiInContesto: z.array(z.string().min(1)).max(100).optional(),
});

export const schemaModificheConversazione = z
  .object({
    titolo: z.string().optional(),
    condivisa: z.boolean().optional(),
    /** `null` stacca il cliente: la conversazione torna a non essere di nessuno. */
    clienteId: z.string().uuid().nullable().optional(),
  })
  .passthrough();

/**
 * «Genera da modello» (11/09/2026): il messaggio chiede un documento, non
 * una risposta. Il job apre la sandbox documentale sul modello scelto e
 * consegna il file come `documento` della risposta, nel formato del modello
 * salvo `formato`. `messaggioId` è la risposta di partenza da impaginare,
 * se si parte da una risposta esistente.
 */
export const schemaEsportazioneElaborata = z
  .object({
    modelloId: z.string().min(1).optional(),
    /** L'estensione: qualsiasi formato tranne gli eseguibili (`generazione/formati.ts`). */
    formato: z
      .string()
      .transform((f) => f.trim().toLowerCase().replace(/^\./, ''))
      .refine(consegnabile, 'Formato non ammesso.')
      .optional(),
    messaggioId: z.string().min(1).optional(),
    /**
     * Su che cosa lavora il motore documentale (12/09/2026): la risposta di
     * `messaggioId`, oppure tutto il filo, domande e risposte in fila. La
     * stessa azione con due perimetri, come «Esporta come» e «Invia email».
     * Assente = la risposta, che è il comportamento di sempre.
     */
    ambito: z.enum(['messaggio', 'conversazione']).optional(),
    istruzioni: z.string().max(4000).optional(),
  })
  .refine((e) => e.modelloId !== undefined || e.formato !== undefined, {
    message: 'Indica il modello o il formato.',
  });

export type EsportazioneElaborata = z.infer<typeof schemaEsportazioneElaborata>;

export const schemaNuovoMessaggio = z.object({
  testo: z.string(),
  documentiReferenziati: z.array(z.string().min(1)).max(100).default([]),
  esportazione: schemaEsportazioneElaborata.optional(),
  /**
   * Il livello scelto nel composer (10/09/2026): vale per questo messaggio e
   * basta, la scelta dell'agenzia resta com'è. Assente = quello dell'agenzia.
   */
  livello: z.string().min(1).optional(),
});

export type NuovoMessaggio = z.infer<typeof schemaNuovoMessaggio>;

/**
 * Corpo di `POST /api/conversazioni/:id/messaggi/:mid/email` («Invia email»
 * sotto una risposta, 29/08/2026): `me` per l'indirizzo dell'utente
 * registrato, oppure un indirizzo scritto a mano.
 */
export const schemaEmailRisposta = z.object({
  a: z.union([z.literal('me'), z.string().trim().email()]),
});

export type EmailRisposta = z.infer<typeof schemaEmailRisposta>;

/** L'esito: a chi è partita; `simulata` quando l'ambiente non ha un provider (mai in produzione). */
export interface EsitoEmailRisposta {
  a: string;
  simulata: boolean;
}

/**
 * Corpo di `POST /api/conversazioni/prompt` («Scrivi il prompt» nel
 * composer, 29/08/2026): l'abbozzo dell'utente e gli id dei documenti nel
 * contesto o referenziati, per nominarli. Nessuna conversazione richiesta:
 * vale anche sulla schermata iniziale.
 */
export const schemaRichiestaPrompt = z.object({
  testo: z.string().trim().min(1).max(4000),
  documenti: z.array(z.string().min(1)).max(50).default([]),
});

export type RichiestaPromptApi = z.infer<typeof schemaRichiestaPrompt>;

export interface RispostaPrompt {
  prompt: string;
}

/** `POST /api/conversazioni/trascrizioni` (multipart, campo `audio`): la dettatura trascritta. */
export interface RispostaTrascrizione {
  testo: string;
}

/* Le forme che il worker valida prima di persistere: il modello produce,
   il worker verifica (doc motore §2.5), e solo ciò che passa diventa
   messaggio. */

export const schemaPosizione = z.object({
  pagina: z.number().int().min(1),
  articolo: z.string().trim().min(1).max(120).optional(),
  sezione: z.string().trim().min(1).max(200).optional(),
});

export const schemaCitazione = z.object({
  id: z.string().min(1),
  documentoId: z.string().min(1),
  documentoTitolo: z.string().min(1),
  archivio: z.enum(['pubblico', 'privato', 'conversazione']),
  posizione: schemaPosizione,
  estratto: z.string().trim().min(1).max(1000),
});

export const schemaProvenienza = z.object({
  tipo: z.enum(['regola', 'documento-riferimento', 'memoria']),
  origineId: z.string().min(1),
  etichetta: z.string().min(1),
});
