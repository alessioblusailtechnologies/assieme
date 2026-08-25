import { z } from 'zod';

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

export interface RiferimentoDocumento {
  id: string;
  titolo: string;
  archivio: ArchivioRiferimento;
}

export interface Conversazione {
  id: string;
  titolo: string;
  creataIl: string;
  aggiornataIl: string;
  documentiInContesto: RiferimentoDocumento[];
  condivisa: boolean;
  autoreId: string;
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
}

/**
 * Un documento generato dal motore su un template, su richiesta dell'utente
 * in chat: il file sta nello Storage, `url` è la rotta che lo serve.
 */
export interface DocumentoGenerato {
  id: string;
  nome: string;
  formato: 'pdf' | 'docx' | 'xlsx';
  /** Il template usato, per raccontarlo; assente col layout di piattaforma. */
  template?: string;
  url: string;
}

/** Gli eventi del flusso SSE, uno per frame `data: <json>\n\n`. */
export type EventoStream =
  | { tipo: 'inizio'; messaggioId: string; messaggioUtenteId: string }
  | { tipo: 'attivita'; etichetta: string }
  | { tipo: 'testo'; delta: string }
  | { tipo: 'citazione'; citazione: Citazione }
  | { tipo: 'provenienza'; provenienza: Provenienza }
  | { tipo: 'non-supportato' }
  /** RF-G-01: ciò che la memoria ha imparato da questo scambio (solo se ha imparato qualcosa). */
  | { tipo: 'memoria'; ricordi: RicordoAppreso[] }
  /** Un documento generato su template durante la risposta: il FE lo mostra da scaricare. */
  | { tipo: 'documento'; documento: DocumentoGenerato }
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
  })
  .passthrough();

/**
 * La richiesta di Esportazione elaborata (25/08/2026): il messaggio chiede
 * un documento, non una risposta. Il job apre la sandbox documentale sul
 * template scelto (o sul predefinito del formato) e consegna il file come
 * `documento` della risposta. `messaggioId` è la risposta di partenza da
 * impaginare, se si esporta una risposta esistente.
 */
export const schemaEsportazioneElaborata = z.object({
  formato: z.enum(['pdf', 'docx', 'xlsx']),
  templateId: z.string().min(1).optional(),
  messaggioId: z.string().min(1).optional(),
  istruzioni: z.string().max(4000).optional(),
});

export type EsportazioneElaborata = z.infer<typeof schemaEsportazioneElaborata>;

export const schemaNuovoMessaggio = z.object({
  testo: z.string(),
  documentiReferenziati: z.array(z.string().min(1)).max(100).default([]),
  esportazione: schemaEsportazioneElaborata.optional(),
});

export type NuovoMessaggio = z.infer<typeof schemaNuovoMessaggio>;

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
