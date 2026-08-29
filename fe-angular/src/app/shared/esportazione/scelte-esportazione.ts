import { FormatoEsportaRisposta, FormatoGenerazione, TemplateOutput } from '@core/models';

/**
 * Il corpo delle esportazioni (chat RF-C-10, tabelle RF-C-14): un template
 * preciso, oppure solo il formato — allora il server usa il predefinito del
 * formato e, senza predefinito, il layout di piattaforma. Il `txt` è solo
 * della chat: il testo piatto con le fonti, senza template.
 */
export type SceltaEsporta = { templateId: string } | { formato: FormatoEsportaRisposta };

/** Una voce del menù di esportazione, già pronta per `ui-menu-azioni`. */
export interface SceltaEsportazione {
  etichetta: string;
  dettaglio: string;
  formato: FormatoEsportaRisposta;
  scelta: SceltaEsporta;
}

export const FORMATI_GENERAZIONE: FormatoGenerazione[] = ['pdf', 'docx', 'xlsx'];

/** Il nome con cui il server chiama il layout di piattaforma. */
export const NOME_LAYOUT_PIATTAFORMA = 'Documento VELIA';

/**
 * L'«Esporta come» di una risposta in chat (29/08/2026): tre formati e
 * basta, senza scegliere il template - il server impagina sul predefinito
 * del formato o sul layout di VELIA; il testo semplice non passa da nessun
 * template. Per un documento su un template preciso c'è «Genera documento
 * da template».
 */
export const SCELTE_ESPORTA_COME: SceltaEsportazione[] = [
  { etichetta: 'Word', dettaglio: 'docx', formato: 'docx', scelta: { formato: 'docx' } },
  { etichetta: 'PDF', dettaglio: 'pdf', formato: 'pdf', scelta: { formato: 'pdf' } },
  { etichetta: 'Testo semplice', dettaglio: 'txt', formato: 'txt', scelta: { formato: 'txt' } },
];

/**
 * Le voci del menù delle tabelle: per ogni formato i template dell'agenzia
 * (il predefinito segnalato), e il layout di piattaforma per i formati
 * senza template. PPTX non si genera ancora: un template PPTX non compare.
 */
export function scelteEsportazione(template: TemplateOutput[]): SceltaEsportazione[] {
  const voci: SceltaEsportazione[] = [];
  for (const formato of FORMATI_GENERAZIONE) {
    const propri = template.filter((t) => t.formato === formato);
    if (!propri.length) {
      voci.push({
        etichetta: NOME_LAYOUT_PIATTAFORMA,
        dettaglio: formato,
        formato,
        scelta: { formato },
      });
      continue;
    }
    for (const t of propri) {
      voci.push({
        etichetta: t.nome,
        dettaglio: t.predefinito ? `${formato} · predefinito` : formato,
        formato,
        scelta: { templateId: t.id },
      });
    }
  }
  return voci;
}

/** Il nome del download, con la regola del server: slug del nome, estensione del formato. */
export function nomeFileEsportazione(nome: string, formato: FormatoEsportaRisposta): string {
  return `${nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'risposta'}.${formato}`;
}
