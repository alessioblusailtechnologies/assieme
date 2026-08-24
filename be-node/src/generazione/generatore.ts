import { analizzaMarkdown, testoPiano } from './blocchi.js';
import { componiDocx, riempiDocx, type CampiTemplate } from './docx.js';
import { componiPdf } from './pdf.js';
import { componiXlsx, riempiXlsx } from './xlsx.js';

/**
 * Il motore di generazione su template (RF-D-10, RF-C-10): un ingresso solo
 * per chat, tabelle (Fase 5) e agenti (Fase 7). Sceglie il compositore dal
 * formato e la strada dalla natura del template: precaricato = layout nel
 * codice con l'identità visiva; del tenant = il suo file, riempito (DOCX e
 * XLSX sui segnaposto, PDF come carta intestata di sfondo).
 *
 * La generazione è sincrona: per un documento sta sotto qualche secondo.
 * Quando le tabelle di analisi porteranno cartelle grandi, il passaggio in
 * coda userà lo stesso pattern di polling già noto al FE.
 */

export interface IdentitaGenerazione {
  colorePrimario: string;
  recapiti: string;
  firma: string;
  logo?: { byte: Buffer; tipo: string };
}

export interface RichiestaGenerazione {
  template: { nome: string; formato: 'pdf' | 'docx' | 'xlsx'; personalizzato: boolean };
  /** Il file del template del tenant, dallo Storage (solo personalizzati). */
  fileTemplate?: Buffer;
  titolo: string;
  /** Markdown leggero: il testo della risposta, com'è. */
  testo: string;
  fonti: string[];
  destinatario?: string;
  identita: IdentitaGenerazione;
}

export interface FileGenerato {
  byte: Buffer;
  contentType: string;
  nomeFile: string;
}

export const MIME: Record<'pdf' | 'docx' | 'xlsx', string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Il nome del download, con la regola del mock (nome del template, in slug). */
export const nomeFileGenerato = (nome: string, formato: string): string =>
  `${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${formato}`;

export async function generaDocumento(richiesta: RichiestaGenerazione): Promise<FileGenerato> {
  const { template, identita } = richiesta;
  const blocchi = analizzaMarkdown(richiesta.testo);
  const personalizzato = template.personalizzato && richiesta.fileTemplate;

  const campi: CampiTemplate = {
    titolo: richiesta.titolo,
    data: new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
    destinatario: richiesta.destinatario ?? '',
    contenuto: testoPiano(blocchi).join('\n'),
    fonti: richiesta.fonti.join('\n'),
  };

  let byte: Buffer;
  switch (template.formato) {
    case 'pdf':
      byte = await componiPdf({
        titolo: richiesta.titolo,
        blocchi,
        fonti: richiesta.fonti,
        identita,
        ...(identita.logo && { logo: identita.logo }),
        ...(personalizzato && { sfondo: richiesta.fileTemplate }),
      });
      break;
    case 'docx':
      byte = personalizzato
        ? riempiDocx(richiesta.fileTemplate!, campi)
        : await componiDocx({
            titolo: richiesta.titolo,
            blocchi,
            fonti: richiesta.fonti,
            identita,
            ...(identita.logo && { logo: identita.logo }),
          });
      break;
    case 'xlsx':
      byte = personalizzato
        ? await riempiXlsx(richiesta.fileTemplate!, campi)
        : await componiXlsx({ titolo: richiesta.titolo, blocchi, fonti: richiesta.fonti, identita });
      break;
  }

  return {
    byte,
    contentType: MIME[template.formato],
    nomeFile: nomeFileGenerato(template.nome, template.formato),
  };
}
