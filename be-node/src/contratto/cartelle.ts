import { z } from 'zod';

/**
 * Fase 10 — l'Archivio Privato a cartelle.
 *
 * Tre oggetti e un principio. Le **cartelle** sono un albero libero (crea,
 * rinomina, sposta, annida: nessuna forma obbligata); i **clienti** sono
 * l'entità su cui la collocazione automatica sta in piedi, perché sapere
 * che al livello 1 ci sono i clienti non dice che «ROSSI M.» è la cartella
 * «Rossi Mario»; la **convenzione** è come questo archivio è organizzato,
 * *osservata* e non configurata.
 *
 * Il principio: `documenti.cartella_id` è l'unica verità sul dove, e
 * `null` significa «Da sistemare» — una condizione normale e visibile, non
 * un errore. Un documento non collocato resta `pronto`, cercabile e
 * referenziabile come tutti gli altri: la collocazione non è mai una porta.
 */

// ---------------------------------------------------------------------------
// Cartelle
// ---------------------------------------------------------------------------

/**
 * Che cosa sono i *figli* di una cartella, per come li ha visti
 * l'osservazione. È l'unico posto in cui l'AI può creare una cartella da
 * sola: dove il livello ammette istanze nuove. Assente = cartella libera,
 * e lì l'AI non crea mai niente.
 */
export const RUOLI_FIGLI = ['clienti', 'anni', 'compagnie', 'rami', 'tipologie', 'prodotti'] as const;

export type RuoloFigli = (typeof RUOLI_FIGLI)[number];

export interface Cartella {
  id: string;
  nome: string;
  /** Il percorso leggibile dalla radice, con `/`: quello che l'utente vede e pronuncia. */
  percorso: string;
  parentId?: string;
  descrizione?: string;
  /** Scritta da un umano: il ricalcolo non la tocca più. */
  descrizioneDaUtente: boolean;
  ruoloFigli?: RuoloFigli;
  clienteId?: string;
  /** Documenti dentro questa cartella, senza contare le sottocartelle. */
  documenti: number;
  /** Documenti nel sottoalbero, questa compresa: è il numero che si mostra sull'albero. */
  documentiTotali: number;
  figli: Cartella[];
}

export interface AlberoCartelle {
  radici: Cartella[];
  /** Quanti documenti non sono ancora collocati: la voce fissa in cima. */
  daSistemare: number;
}

const nomeCartella = z.string().trim().min(1).max(120);

export const schemaNuovaCartella = z
  .object({
    nome: nomeCartella,
    parentId: z.string().uuid().nullable().optional(),
    descrizione: z.string().trim().max(500).nullable().optional(),
    /**
     * L'utente ha visto l'avviso sul quasi-doppione e sa quello che fa.
     * L'avviso è un avviso, non un divieto: «Preventivi» e «Preventivi 2026»
     * si somigliano parecchio e sono due cartelle legittime, e un sistema che
     * te lo impedisce è peggio di uno che te lo fa notare.
     */
    consentiSimile: z.boolean().optional(),
  })
  .strict();

export type NuovaCartella = z.infer<typeof schemaNuovaCartella>;

/**
 * Rinomina, sposta, descrivi. `parentId: null` riporta in radice; una
 * `descrizione` scritta da qui è dell'utente, e da quel momento
 * l'osservazione non la sovrascrive più.
 */
export const schemaModificheCartella = z
  .object({
    nome: nomeCartella.optional(),
    parentId: z.string().uuid().nullable().optional(),
    descrizione: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type ModificheCartella = z.infer<typeof schemaModificheCartella>;

/**
 * Che fine fanno i documenti quando la cartella sparisce. Non c'è un
 * default: eliminare una cartella piena senza dire cosa ne è dei documenti
 * è esattamente il modo in cui si perde roba.
 */
export const schemaEliminaCartella = z.object({
  documenti: z.enum(['da-sistemare', 'al-padre']).default('da-sistemare'),
});

// ---------------------------------------------------------------------------
// Clienti
// ---------------------------------------------------------------------------

export interface Cliente {
  id: string;
  nome: string;
  tipo: 'persona' | 'azienda';
  codiceFiscale?: string;
  partitaIva?: string;
  /** Le forme con cui compare nei documenti: «ROSSI M.», il nome dell'insegna. */
  alias: string[];
  documenti: number;
  /** La sua cartella, se ne ha una: l'aggancio è l'id, non il nome. */
  cartellaId?: string;
}

const nomeCliente = z.string().trim().min(1).max(200);

export const schemaNuovoCliente = z
  .object({
    nome: nomeCliente,
    tipo: z.enum(['persona', 'azienda']).default('persona'),
    codiceFiscale: z.string().trim().max(32).nullable().optional(),
    partitaIva: z.string().trim().max(32).nullable().optional(),
    alias: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  })
  .strict();

export type NuovoCliente = z.infer<typeof schemaNuovoCliente>;

export const schemaModificheCliente = schemaNuovoCliente.partial().strict();

export type ModificheCliente = z.infer<typeof schemaModificheCliente>;

/**
 * La fusione di due clienti serve il giorno dopo l'importazione, non un mese
 * dopo: la prima cosa che un'agenzia vede è un paio di clienti sdoppiati.
 * Il perdente cede documenti, alias e cartella, poi sparisce.
 */
export const schemaFusioneClienti = z
  .object({ assorbito: z.string().uuid() })
  .strict();

export interface PaginaClienti {
  elementi: Cliente[];
  totale: number;
  pagina: number;
  perPagina: number;
}

export const schemaFiltriClienti = z.object({
  q: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  perPagina: z.coerce.number().int().min(1).max(200).default(50),
});

// ---------------------------------------------------------------------------
// Convenzione
// ---------------------------------------------------------------------------

export interface Convenzione {
  /** Quello che il sistema ha osservato guardando l'albero. */
  testo: string;
  /** La correzione umana, se c'è: vince sempre, e il ricalcolo non la tocca. */
  testoUtente?: string;
  /** Quella che vale, ed è quella che va al modello. */
  effettiva: string;
  calcolataIl?: string;
  daRicalcolare: boolean;
}

export const schemaModificheConvenzione = z
  .object({ testoUtente: z.string().trim().max(4000).nullable() })
  .strict();
