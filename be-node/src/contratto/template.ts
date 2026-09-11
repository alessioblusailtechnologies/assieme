import { z } from 'zod';

/**
 * I modelli di riferimento e le esportazioni (11/09/2026, fase 3 di
 * `PIANO-INTESTAZIONE-MODELLI.md`) - lo specchio di
 * `fe-angular/core/models/impostazioni.ts`.
 *
 * Un modello è un documento dell'agenzia, di qualsiasi formato, che si
 * richiama in chat con «Genera da modello»: la sandbox lo apre, ne copia
 * struttura e stile e ci mette il contenuto nuovo. Ha un nome, una riga
 * «quando usarlo» che il motore della chat legge per scegliere, e la
 * scelta dell'intestazione: quella dell'agenzia (di norma) o la sua.
 *
 * Le esportazioni deterministiche («Esporta come», tabelle, agenti) non
 * usano i modelli: layout di VELIA con l'intestazione dell'agenzia, e si
 * sceglie solo il formato.
 */

/** I formati che il motore deterministico sa generare. */
export const FORMATI_GENERAZIONE = ['pdf', 'docx', 'xlsx'] as const;

export type FormatoGenerazione = (typeof FORMATI_GENERAZIONE)[number];

/** I formati di un modello, e di ciò che la sandbox consegna. */
export const FORMATI_MODELLO = ['pdf', 'docx', 'xlsx', 'pptx'] as const;

export type FormatoModello = (typeof FORMATI_MODELLO)[number];

/** A che punto è l'anteprima in PDF di un modello. Un PDF è `pronta` da subito. */
export type StatoAnteprima = 'assente' | 'in-corso' | 'pronta' | 'errore';

export interface ModelloRiferimento {
  id: string;
  nome: string;
  formato: FormatoModello;
  /** «Quando usarlo»: facoltativa, ma è ciò che il motore legge per scegliere. */
  descrizione: string;
  /** Vero: l'intestazione dell'agenzia al posto di quella del modello. */
  intestazioneAgenzia: boolean;
  anteprima: StatoAnteprima;
  caricatoIl: string;
}

/** Corpo di `PATCH /api/template/:id`. */
export const schemaPatchModello = z
  .object({
    nome: z.string().trim().min(1).max(120).optional(),
    descrizione: z.string().trim().max(300).optional(),
    intestazioneAgenzia: z.boolean().optional(),
  })
  .strict()
  .refine((m) => m.nome !== undefined || m.descrizione !== undefined || m.intestazioneAgenzia !== undefined, {
    message: 'Indica che cosa cambiare.',
  });

/** Corpo delle esportazioni delle tabelle (RF-C-14): il formato. */
export const schemaEsporta = z.object({ formato: z.enum(FORMATI_GENERAZIONE) });

export type RichiestaEsporta = z.infer<typeof schemaEsporta>;

/** L'«Esporta come» di una risposta in chat: i formati generabili più il testo semplice. */
export const FORMATI_ESPORTA_RISPOSTA = [...FORMATI_GENERAZIONE, 'txt'] as const;

export type FormatoEsportaRisposta = (typeof FORMATI_ESPORTA_RISPOSTA)[number];

export const schemaEsportaRisposta = z.object({ formato: z.enum(FORMATI_ESPORTA_RISPOSTA) });

export type RichiestaEsportaRisposta = z.infer<typeof schemaEsportaRisposta>;
