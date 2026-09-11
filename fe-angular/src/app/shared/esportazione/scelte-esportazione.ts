import { FormatoEsportaRisposta } from '@core/models';

/**
 * Il corpo delle esportazioni (chat RF-C-10, tabelle RF-C-14): il formato,
 * e basta (11/09/2026). Ogni documento esce col layout di VELIA e
 * l'intestazione dell'agenzia; un documento su un modello dell'agenzia è
 * un'altra cosa, «Genera da modello». Il `txt` è solo della chat: il testo
 * piatto con le fonti.
 */
export interface SceltaEsporta {
  formato: FormatoEsportaRisposta;
}

/** Una voce del menù di esportazione, già pronta per `ui-menu-azioni`. */
export interface SceltaEsportazione {
  etichetta: string;
  dettaglio: string;
  formato: FormatoEsportaRisposta;
  scelta: SceltaEsporta;
}

/** L'«Esporta come» di una risposta in chat (29/08/2026). */
export const SCELTE_ESPORTA_COME: SceltaEsportazione[] = [
  { etichetta: 'Word', dettaglio: 'docx', formato: 'docx', scelta: { formato: 'docx' } },
  { etichetta: 'PDF', dettaglio: 'pdf', formato: 'pdf', scelta: { formato: 'pdf' } },
  { etichetta: 'Testo semplice', dettaglio: 'txt', formato: 'txt', scelta: { formato: 'txt' } },
];

/** L'esportazione di una tabella: Excel per rielaborarla, Word e PDF per consegnarla. */
export const SCELTE_ESPORTA_TABELLA: SceltaEsportazione[] = [
  { etichetta: 'Excel', dettaglio: 'xlsx', formato: 'xlsx', scelta: { formato: 'xlsx' } },
  { etichetta: 'Word', dettaglio: 'docx', formato: 'docx', scelta: { formato: 'docx' } },
  { etichetta: 'PDF', dettaglio: 'pdf', formato: 'pdf', scelta: { formato: 'pdf' } },
];

/** Il nome del download, con la regola del server: slug del nome, estensione del formato (qualsiasi, da «Genera da modello»). */
export function nomeFileEsportazione(nome: string, formato: string): string {
  return `${
    nome
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'risposta'
  }.${formato}`;
}
