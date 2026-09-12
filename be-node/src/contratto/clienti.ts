import { z } from 'zod';

/**
 * Il cliente (`PIANO-CLIENTI.md`, 12/09/2026): l'entità su cui ruota tutto
 * l'Archivio Privato, e non più una cartella dentro un albero.
 *
 * Nato in Fase 10 per un compito solo — sapere che «ROSSI M.» è «Rossi
 * Mario», perché una collocazione automatica non sta in piedi sul testo
 * libero — qui diventa quello che un'agenzia si aspetta: una scheda con i
 * suoi recapiti, le sue note, le sue etichette e i suoi documenti.
 *
 * Il principio che prima valeva per la cartella ora vale per lui:
 * `documenti.cliente_id` è l'unico aggancio, e `null` significa «Senza
 * cliente» — una condizione normale, non un errore. Circolari, modulistica
 * e note tecniche un cliente non ce l'hanno per natura, e restano `pronto`,
 * cercabili e citabili come tutti gli altri.
 *
 * Specchio di `fe-angular/src/app/core/models/cliente.ts`.
 */

export const STATI_CLIENTE = ['attivo', 'archiviato'] as const;
export type StatoCliente = (typeof STATI_CLIENTE)[number];

export interface Cliente {
  id: string;
  nome: string;
  tipo: 'persona' | 'azienda';
  codiceFiscale?: string;
  partitaIva?: string;
  /** Le forme con cui compare nei documenti: «ROSSI M.», il nome dell'insegna. */
  alias: string[];
  email?: string;
  telefono?: string;
  indirizzo?: string;
  natoIl?: string;
  note?: string;
  /** Segmentazione, non collocazione: «in rinnovo», «da richiamare». */
  etichette: string[];
  stato: StatoCliente;
  documenti: number;
  creatoIl: string;
}

/**
 * La scheda: il cliente con ciò che gli sta intorno.
 *
 * Non è il cliente più i suoi documenti — quelli si chiedono all'archivio
 * con `?clienteId=`, che ha già faccette e paginazione — ma il cliente più
 * ciò che di lui non si vede da nessun'altra parte: di che cosa si è
 * parlato, quali canali sono aperti, che cosa sta per scadere.
 */
export interface SchedaCliente extends Cliente {
  /** Le conversazioni in cui si è parlato di lui, le più recenti prima. */
  conversazioni: Array<{ id: string; titolo: string; aggiornataIl: string }>;
  /** Le chat aperte col cliente: quante, e quante ancora attive. */
  chat: { totale: number; attive: number };
  /** Le scadenze dei suoi documenti, dalla più vicina. */
  scadenze: Array<{ documentoId: string; titolo: string; numeroPolizza?: string; scadenza: string }>;
}

const nomeCliente = z.string().trim().min(1).max(200);
const etichettaCliente = z.string().trim().min(1).max(60);

export const schemaNuovoCliente = z
  .object({
    nome: nomeCliente,
    tipo: z.enum(['persona', 'azienda']).default('persona'),
    codiceFiscale: z.string().trim().max(32).nullable().optional(),
    partitaIva: z.string().trim().max(32).nullable().optional(),
    alias: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    email: z.string().trim().max(200).nullable().optional(),
    telefono: z.string().trim().max(50).nullable().optional(),
    indirizzo: z.string().trim().max(300).nullable().optional(),
    /* Data sola, senza ora: «1978-04-23». Un `datetime()` qui vorrebbe un
       fuso orario che nessuno conosce e che sposterebbe il compleanno. */
    natoIl: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    note: z.string().trim().max(5000).nullable().optional(),
    etichette: z.array(etichettaCliente).max(30).optional(),
    stato: z.enum(STATI_CLIENTE).optional(),
  })
  .strict();

export type NuovoCliente = z.infer<typeof schemaNuovoCliente>;

export const schemaModificheCliente = schemaNuovoCliente.partial().strict();

export type ModificheCliente = z.infer<typeof schemaModificheCliente>;

/**
 * La fusione di due clienti serve il giorno dopo l'importazione, non un mese
 * dopo: la prima cosa che un'agenzia vede è un paio di clienti sdoppiati.
 * Il perdente cede documenti, alias, conversazioni e chat, poi sparisce.
 */
export const schemaFusioneClienti = z.object({ assorbito: z.string().uuid() }).strict();

/**
 * Che fine fanno i suoi documenti quando il cliente sparisce. Non c'è un
 * default: eliminare un cliente pieno senza dire cosa ne è dei documenti è
 * esattamente il modo in cui si perde roba.
 */
export const schemaEliminaCliente = z.object({
  documenti: z.enum(['senza-cliente', 'elimina']).default('senza-cliente'),
});

export interface PaginaClienti {
  elementi: Cliente[];
  totale: number;
  pagina: number;
  perPagina: number;
}

/**
 * L'assegnazione in blocco: il gesto del giorno dopo l'importazione.
 *
 * `clienteId` assente = non toccare il cliente; `null` = toglierlo. Le
 * etichette si aggiungono e si tolgono, non si sostituiscono: chi ne mette
 * una su trenta documenti non sta dicendo di cancellare le altre.
 */
export const schemaAssegnazione = z
  .object({
    documenti: z.array(z.string().min(1).max(200)).min(1).max(500),
    clienteId: z.string().uuid().nullable().optional(),
    aggiungiEtichette: z.array(etichettaCliente).max(30).optional(),
    togliEtichette: z.array(etichettaCliente).max(30).optional(),
    /**
     * «Sì, quelli proposti vanno bene»: spegne `cliente_da_confermare` senza
     * dire a chi, perché il cliente è già quello giusto. È il gesto con cui
     * si svuota la coda delle proposte dopo un'importazione, e senza di
     * questo si dovrebbe riassegnare uno per uno ciò che era già giusto.
     */
    confermaCliente: z.boolean().optional(),
  })
  .strict();

export type Assegnazione = z.infer<typeof schemaAssegnazione>;

/** Quanti documenti ha toccato davvero: il FE lo dice, e non è un dettaglio. */
export interface EsitoAssegnazione {
  toccati: number;
}

/**
 * Rinominare un'etichetta, o fonderla in una che esiste già (che è la
 * stessa operazione: il nome nuovo è quello di un'altra etichetta).
 */
export const schemaRinominaEtichetta = z
  .object({ nome: etichettaCliente })
  .strict();

export const schemaFiltriClienti = z.object({
  q: z.string().optional(),
  etichetta: z.string().optional(),
  tipo: z.enum(['persona', 'azienda']).optional(),
  stato: z.enum(STATI_CLIENTE).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  perPagina: z.coerce.number().int().min(1).max(200).default(50),
});

export type FiltriClienti = z.infer<typeof schemaFiltriClienti>;
