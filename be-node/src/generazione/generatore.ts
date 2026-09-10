import { analizzaMarkdown } from './blocchi.js';
import { componiDocx } from './docx.js';
import type { FasceDocumento } from './intestazione.js';
import { componiPdf } from './pdf.js';
import { componiXlsx } from './xlsx.js';

/**
 * Il motore di generazione deterministico (RF-C-10): un ingresso solo per
 * «Esporta come» in chat, tabelle e agenti. Dall'11/09/2026 non ci sono più
 * template né identità visiva: ogni documento esce col layout di VELIA e
 * con l'intestazione e il piè di pagina dell'agenzia (`intestazione.ts`).
 * I documenti costruiti su un modello li fa la sandbox, non questo motore.
 *
 * La generazione è sincrona: un documento sta sotto qualche secondo.
 */

export type FormatoDocumento = 'pdf' | 'docx' | 'xlsx';

export interface RichiestaGenerazione {
  formato: FormatoDocumento;
  /** Il nome del file scaricato, prima dello slug e dell'estensione. */
  nome: string;
  titolo: string;
  /** Markdown leggero: il testo della risposta, com'è. */
  testo: string;
  fonti: string[];
  fasce: FasceDocumento;
}

export interface FileGenerato {
  byte: Buffer;
  contentType: string;
  nomeFile: string;
}

export const MIME: Record<FormatoDocumento, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Il nome del download, in slug. */
export const nomeFileGenerato = (nome: string, formato: string): string =>
  `${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${formato}`;

/** Il nome dei documenti che non ne hanno uno loro. */
export const NOME_DOCUMENTO = 'Documento VELIA';

export async function generaDocumento(richiesta: RichiestaGenerazione): Promise<FileGenerato> {
  const blocchi = analizzaMarkdown(richiesta.testo);
  const opzioni = { titolo: richiesta.titolo, blocchi, fonti: richiesta.fonti, fasce: richiesta.fasce };

  const byte =
    richiesta.formato === 'pdf'
      ? await componiPdf(opzioni)
      : richiesta.formato === 'docx'
        ? await componiDocx(opzioni)
        : await componiXlsx(opzioni);

  return {
    byte,
    contentType: MIME[richiesta.formato],
    nomeFile: nomeFileGenerato(richiesta.nome, richiesta.formato),
  };
}
