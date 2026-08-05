import { DocumentoRiferimento } from '@core/models';
import { dimensioneLeggibile } from '@shared/testi/misura';

/** Il conto del contesto permanente, per il riepilogo in testa alla scheda. */
export interface PesoContesto {
  attivi: number;
  totale: number;
  byteAttivi: number;
  /** Già pronto per l'interfaccia, es. `3 di 4 attivi · 2,9 MB a ogni interrogazione`. */
  testo: string;
}

/**
 * RF-D-16: quanti documenti di riferimento sono attivi e quanto pesano.
 *
 * Contano solo gli **attivi**: è il loro peso che si paga a ogni
 * interrogazione, ed è questo il numero che deve scoraggiare l'accumulo.
 * I sospesi si vedono nel totale, che è il promemoria di quanta roba c'è
 * da tenere in ordine.
 */
export function pesoContesto(riferimenti: DocumentoRiferimento[]): PesoContesto {
  const attivi = riferimenti.filter((r) => r.attivo);
  const byteAttivi = attivi.reduce((somma, r) => somma + r.dimensioneByte, 0);
  return {
    attivi: attivi.length,
    totale: riferimenti.length,
    byteAttivi,
    testo: `${attivi.length} di ${riferimenti.length} attivi · ${dimensioneLeggibile(byteAttivi)} di contesto a ogni interrogazione`,
  };
}
