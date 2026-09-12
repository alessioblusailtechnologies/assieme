import { z } from 'zod';

/**
 * Le chat destinate ai clienti dell'agenzia (07/09/2026 —
 * `VELIA-piano-chat-clienti.md`).
 *
 * L'agenzia crea una chat **per un suo cliente**, e il cono di lettura è il
 * cliente stesso: i suoi documenti, calcolati ogni volta, così una polizza
 * caricata domani entra da sola. A mano si scelgono solo gli scostamenti —
 * i prodotti pubblici che lo riguardano, un documento in più, uno da
 * escludere — e le istruzioni con cui l'assistente deve rispondergli. Ne
 * esce un link.
 *
 * Specchio di `fe-angular/src/app/core/models/chat-cliente.ts`.
 */

export type StatoChatCliente = 'attiva' | 'sospesa' | 'scaduta';

export interface ChatCliente {
  id: string;
  titolo: string;
  /** L'anagrafica: obbligatoria dal 12/09/2026, perché è lei a fare il cono. */
  clienteId: string;
  clienteNome: string;
  /** Chi entra dal link: nome e cognome che l'agenzia gli ha dato. */
  ospite: { id: string; nome: string; cognome: string };
  stato: StatoChatCliente;
  scadeIl?: string;
  tettoDomande?: number;
  domandeFatte: number;
  istruzioni?: string;
  /* Gli scostamenti dal cono, che è il cliente: quello che si vede in più
     e quello che non si deve vedere. I documenti del cliente non si
     elencano qui, perché cambiano da soli. */
  aggiunti: Array<{ id: string; titolo: string }>;
  esclusi: Array<{ id: string; titolo: string }>;
  creataIl: string;
  /**
   * Il link da mandare al cliente, pronto da copiare.
   *
   * Assente sulle chat create prima del 07/09/2026, quando del token si
   * conservava solo l'impronta: di quelle si può soltanto rigenerarlo, e
   * l'interfaccia lo dice invece di far finta di averlo.
   */
  url?: string;
  /**
   * Quanto è costata finora, in euro: con un link in mano a qualcun altro
   * è la prima cosa che l'agenzia vuole sapere.
   */
  costoUsd: number;
}

/**
 * Il link, appena creato o rigenerato.
 *
 * Si rilegge anche dall'elenco (`ChatCliente.url`). Conservarne la sola
 * impronta proteggeva poco — il token dà accesso a un pugno di documenti
 * che chi legge questa tabella può già leggere tutti — e costava il gesto
 * più naturale: ridare al cliente il link che ha perso, senza rompere
 * quello che gli era già stato mandato.
 */
export interface LinkChatCliente {
  chatId: string;
  /** L'indirizzo completo da mandare al cliente. */
  url: string;
}

const testoBreve = z.string().trim().min(1).max(200);

export const schemaNuovaChatCliente = z.object({
  titolo: testoBreve,
  /* Il nome dell'ospite: è quello che il cliente vedrà come proprio, e
     quello con cui l'agenzia lo riconosce nell'elenco. */
  nome: testoBreve,
  cognome: testoBreve,
  /* Obbligatorio: senza cliente il cono sarebbe vuoto, cioè una chat che
     non sa rispondere a niente. Un prospect si crea come cliente, costa un
     nome. */
  clienteId: z.string().uuid(),
  istruzioni: z.string().max(20_000).optional(),
  scadeIl: z.string().datetime().optional(),
  tettoDomande: z.number().int().positive().max(10_000).optional(),
  /* Gli scostamenti dal cono del cliente, entrambi facoltativi: di norma
     non se ne tocca nessuno. */
  aggiunti: z.array(z.string().min(1).max(200)).max(500).default([]),
  esclusi: z.array(z.string().min(1).max(200)).max(500).default([]),
});

export const schemaModificaChatCliente = z.object({
  titolo: testoBreve.optional(),
  istruzioni: z.string().max(20_000).nullable().optional(),
  scadeIl: z.string().datetime().nullable().optional(),
  tettoDomande: z.number().int().positive().max(10_000).nullable().optional(),
  stato: z.enum(['attiva', 'sospesa']).optional(),
  aggiunti: z.array(z.string().min(1).max(200)).max(500).optional(),
  esclusi: z.array(z.string().min(1).max(200)).max(500).optional(),
});

export type NuovaChatCliente = z.infer<typeof schemaNuovaChatCliente>;
export type ModificaChatCliente = z.infer<typeof schemaModificaChatCliente>;
