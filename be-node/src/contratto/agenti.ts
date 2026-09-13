import { z } from 'zod';

import type { Citazione, DestinatarioBozza, RiferimentoDocumento } from './conversazioni.js';

/**
 * Agenti (Modulo E, RF-E-01…E-13): lo specchio di
 * `fe-angular/core/models/agente.ts`.
 *
 * Dal 14/09/2026 (PIANO-AGENTI.md, fase 3) un agente è un nome, una
 * frequenza e una **richiesta**: lo stesso testo che si scriverebbe in chat,
 * coi riferimenti a documenti, prodotti e clienti al loro posto
 * (`@[tipo:chiave]`). Da quel testo un modello ricava il **piano**, che si
 * mostra e si conferma prima che l'agente possa partire.
 */

export type StatoPiano = 'non-letto' | 'da-confermare' | 'confermato';

export type TipoRiferimento = 'documento' | 'prodotto' | 'cliente';

/** Un riferimento della richiesta come la barra lo disegna: il chip, col titolo di oggi. */
export type RiferimentoRichiesta =
  | { tipo: 'documento'; chiave: string; titolo: string; archivio: 'pubblico' | 'privato' }
  /** Un prodotto: la chiave è quella del set, i documenti quelli della sua edizione. */
  | { tipo: 'prodotto'; chiave: string; titolo: string; documenti: RiferimentoDocumento[] }
  | { tipo: 'cliente'; chiave: string; titolo: string };

/**
 * Il piano: come il modello ha capito la richiesta, detto a chi la conferma.
 * Non è il copione dell'esecuzione (quella resta libera di cercare come la
 * chat) ma il patto: che cosa legge, che cosa produce, a chi scrive.
 */
export interface PianoAgente {
  obiettivo: string;
  passi: PassoPiano[];
  letture: LetturaPiano[];
  file: FilePiano[];
  email: EmailPiano[];
  /** Ciò che la richiesta lascia aperto: domande, non blocchi. */
  dubbi: string[];
}

export interface PassoPiano {
  tipo: 'leggi' | 'cerca' | 'confronta' | 'genera-file' | 'invia-email' | 'altro';
  titolo: string;
  dettaglio?: string;
}

export interface LetturaPiano {
  tipo: 'documento' | 'prodotto' | 'cliente' | 'archivio';
  etichetta: string;
  /** Il riferimento della richiesta a cui corrisponde; assente per le porzioni di archivio dette a parole. */
  riferimento?: { tipo: TipoRiferimento; chiave: string };
}

export interface FilePiano {
  /** L'estensione: pdf, docx, xlsx, html… */
  formato: string;
  descrizione: string;
}

/**
 * Un'email del piano. Il destinatario si risolve quando il piano si legge e
 * da lì non cambia: l'agente spedisce solo a chi è scritto qui. Uno non
 * risolto blocca la conferma, col motivo.
 */
export interface EmailPiano {
  destinatario: DestinatarioBozza | DestinatarioNonRisolto;
  oggetto?: string;
  contenuto: string;
  allegati: string[];
}

export interface DestinatarioNonRisolto {
  tipo: 'non-risolto';
  /** Come la richiesta lo nomina. */
  richiesto: string;
  motivo: string;
}

export interface Pianificazione {
  frequenza: 'giornaliera' | 'settimanale' | 'mensile';
  orario: string;
  giornoSettimana?: number;
  giornoMese?: number;
  sospesa: boolean;
}

export interface Agente {
  id: string;
  nome: string;
  /** Il testo coi riferimenti come marcatori, com'è stato scritto. */
  richiesta: string;
  /** I riferimenti risolti oggi; quelli che non esistono più mancano, e il chip lo dice. */
  riferimenti: RiferimentoRichiesta[];
  piano?: PianoAgente;
  pianoStato: StatoPiano;
  /** Perché il piano non c'è, o non è aggiornato: la lettura non è riuscita. */
  pianoErrore?: string;
  pianoConfermatoIl?: string;
  /** Perché il piano non si può confermare così com'è: un destinatario da sistemare. */
  bloccoConferma?: string;
  pianificazione?: Pianificazione;
  attivo: boolean;
  creatoDa: string;
  aggiornatoIl: string;
}

export type StatoEsecuzione = 'in-coda' | 'in-corso' | 'completata' | 'fallita';

export interface RigaLog {
  istante: string;
  livello: 'info' | 'avviso' | 'errore';
  messaggio: string;
}

export interface EsecuzioneAgente {
  id: string;
  agenteId: string;
  avviataIl: string;
  conclusaIl?: string;
  modalita: 'manuale' | 'pianificata';
  stato: StatoEsecuzione;
  tentativi: number;
  output?: string;
  citazioni: Citazione[];
  log: RigaLog[];
  errore?: string;
}

export type EsecuzioneRiepilogo = Omit<EsecuzioneAgente, 'output' | 'citazioni' | 'log'>;

export interface AgenteRiepilogo {
  id: string;
  nome: string;
  /** L'obiettivo del piano, quando c'è: la riga che dice a cosa serve. */
  obiettivo?: string;
  attivo: boolean;
  pianoStato: StatoPiano;
  pianificazione?: Pianificazione;
  ultimaEsecuzione?: EsecuzioneRiepilogo;
}

/** Un agente della libreria (RF-E-10): una richiesta da cui partire, senza riferimenti a un'agenzia. */
export interface AgentePredefinito {
  id: string;
  nome: string;
  descrizione: string;
  richiesta: string;
  pianificazioneSuggerita?: Omit<Pianificazione, 'sospesa'>;
}

export interface LimitiAgenti {
  agentiAttiviMax: number;
  agentiAttivi: number;
  esecuzioniConcorrentiMax: number;
  esecuzioniInCorso: number;
  frequenzaMinima: 'giornaliera' | 'settimanale' | 'mensile';
}

export const schemaPianificazione = z
  .object({
    frequenza: z.enum(['giornaliera', 'settimanale', 'mensile']),
    orario: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "L'orario è HH:mm."),
    giornoSettimana: z.number().int().min(1).max(7).optional(),
    giornoMese: z.number().int().min(1).max(28).optional(),
    sospesa: z.boolean().default(false),
  })
  .transform((p) => ({
    ...p,
    ...(p.frequenza === 'settimanale' && { giornoSettimana: p.giornoSettimana ?? 1 }),
    ...(p.frequenza === 'mensile' && { giornoMese: p.giornoMese ?? 1 }),
  }));

export const schemaNuovoAgente = z.object({
  nome: z.string().trim().min(1).max(120),
  richiesta: z.string().trim().min(1).max(8000),
  pianificazione: schemaPianificazione.optional(),
});

/** Ogni campo è indipendente; `null` toglie la pianificazione. */
export const schemaModificheAgente = z.object({
  nome: z.string().trim().min(1).max(120).optional(),
  richiesta: z.string().trim().min(1).max(8000).optional(),
  pianificazione: schemaPianificazione.nullable().optional(),
  attivo: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// I riferimenti nel testo (gemello di shared/ui/barra-richiesta/riferimenti-in-linea.ts)
// ---------------------------------------------------------------------------

/* La chiave arriva fino alla parentesi quadra chiusa: quella di un set
   contiene i due punti, e un'espressione più stretta la taglierebbe. */
const MARCATORE = /@\[(documento|prodotto|cliente):([^\]]+)\]/g;

/** I riferimenti citati nella richiesta, senza doppioni, nell'ordine della prima comparsa. */
export function riferimentiNellaRichiesta(testo: string): Array<{ tipo: TipoRiferimento; chiave: string }> {
  const visti = new Set<string>();
  const esito: Array<{ tipo: TipoRiferimento; chiave: string }> = [];
  for (const m of testo.matchAll(MARCATORE)) {
    const id = `${m[1]}:${m[2]}`;
    if (visti.has(id)) continue;
    visti.add(id);
    esito.push({ tipo: m[1] as TipoRiferimento, chiave: m[2]! });
  }
  return esito;
}

/**
 * La richiesta come si legge: i marcatori diventano «titolo». Con
 * `marcatori` il titolo si porta dietro il suo marcatore, per chi (il
 * modello del piano) deve poter dire a quale riferimento si riferisce.
 */
export function testoLeggibile(
  testo: string,
  riferimenti: Array<{ tipo: string; chiave: string; titolo: string }>,
  opzioni: { marcatori?: boolean } = {},
): string {
  return testo.replace(MARCATORE, (marcatore, tipo: string, chiave: string) => {
    const r = riferimenti.find((x) => x.tipo === tipo && x.chiave === chiave);
    if (!r) return '«riferimento non più disponibile»';
    return opzioni.marcatori ? `«${r.titolo}» ${marcatore}` : `«${r.titolo}»`;
  });
}

/**
 * La chiave di un set, `compagnia:prodotto:edizione`. Il nome del prodotto
 * può contenere i due punti, compagnia ed edizione no: si tagliano i capi.
 */
export function scomponiChiaveSet(chiave: string): { compagniaId: string; prodotto: string; edizioneId: string } | undefined {
  const parti = chiave.split(':');
  if (parti.length < 3) return undefined;
  const compagniaId = parti[0]!;
  const edizioneId = parti.at(-1)!;
  const prodotto = parti.slice(1, -1).join(':');
  return compagniaId && prodotto && edizioneId ? { compagniaId, prodotto, edizioneId } : undefined;
}
