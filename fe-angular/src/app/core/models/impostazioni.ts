import { Id, IsoDateTime } from './comune';

/**
 * Impostazioni e personalizzazione (Modulo D).
 */

/**
 * Modello selezionabile.
 *
 * RF-D-02 impone che l'architettura astragga il provider, così da poter
 * aggiungere o sostituire modelli senza toccare i moduli funzionali — è il
 * presidio contro la dipendenza da fornitori terzi (Vincolo §5.4). Per il
 * front-end significa una cosa sola: **nessun nome di provider compare mai
 * nel codice**, arrivano tutti da qui.
 */
export interface ModelloAI {
  id: Id;
  provider: string;
  nome: string;
  /** RF-D-03: informazioni sintetiche utili alla scelta. */
  descrizione: string;
  adeguatezzaDocumentale: 'alta' | 'media' | 'bassa';
  notaCosti?: string;
  disponibile: boolean;
}

/**
 * Istruzione personalizzata (RF-D-04).
 *
 * L'esempio dell'analisi vale più di una definizione: "non segnalare come
 * carenza l'assenza della garanzia infortuni del conducente, l'agenzia la
 * copre con polizza dedicata". Un'analisi a criteri fissi la segnalerebbe
 * come mancanza grave; è esattamente il limite di Navisio che ASSIEME supera.
 *
 * RF-D-08 pone il confine: le istruzioni orientano il giudizio, **non
 * alterano i fatti documentali**. L'obbligo di citazione e la dichiarazione
 * di non-copertura restano attivi comunque.
 */
export interface IstruzionePersonalizzata {
  id: Id;
  titolo: string;
  testo: string;
  /** RF-D-06: organizzabili per ambito e attivabili singolarmente. */
  ambito: AmbitoIstruzione;
  attiva: boolean;
  creataDa: Id;
  aggiornataIl: IsoDateTime;
}

export type AmbitoIstruzione =
  | { tipo: 'generale' }
  | { tipo: 'ramo'; ramoId: Id }
  | { tipo: 'compagnia'; compagniaId: Id };

/** RF-D-07: storico delle modifiche, per audit e diagnosi di risposte inattese. */
export interface VoceStoricoImpostazioni {
  id: Id;
  istante: IsoDateTime;
  utenteId: Id;
  utenteNome: string;
  azione: 'creazione' | 'modifica' | 'attivazione' | 'disattivazione' | 'eliminazione';
  oggetto: 'istruzione' | 'modello' | 'template' | 'knowledge-base';
  descrizione: string;
}

/**
 * Template di output (RF-D-10/11).
 *
 * L'analisi (punto aperto §6.11) segnala che la generazione fedele ha
 * complessità molto diversa per formato: PDF e DOCX più lineari, XLSX e PPTX
 * più onerosi. Per il front-end il formato è soprattutto una scelta da
 * presentare bene; il peso vero sta a valle.
 */
export interface TemplateOutput {
  id: Id;
  nome: string;
  formato: 'pdf' | 'docx' | 'xlsx' | 'pptx';
  descrizione: string;
  anteprimaUrl?: string;
  /** RF-D-12: caricato dal tenant invece che precaricato dalla piattaforma. */
  personalizzato: boolean;
  /** RF-D-13: template predefinito per una tipologia di output. */
  tipologiaPredefinita?: 'confronto' | 'riepilogo-garanzie' | 'proposta-rinnovo' | 'report-interno';
}

/** RF-F-02: credenziali per l'accesso via MCP, generabili e revocabili. */
export interface CredenzialeMcp {
  id: Id;
  nome: string;
  /** Mostrato per esteso una sola volta, alla creazione. */
  tokenMascherato: string;
  creataIl: IsoDateTime;
  ultimoUtilizzo?: IsoDateTime;
  revocata: boolean;
}
