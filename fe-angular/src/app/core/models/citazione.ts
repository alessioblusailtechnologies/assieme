import { Archivio } from './documento';
import { Id } from './comune';

/**
 * Citazione.
 *
 * **Il tipo che tiene in piedi il prodotto.** RF-C-04 impone che ogni
 * risposta fondata su documenti riporti da dove viene l'informazione, e
 * RF-C-05 che da lì si possa aprire il documento sul passaggio rilevante.
 * RNF-01 spiega perché: nel dominio assicurativo un dato sbagliato su una
 * garanzia ha impatto diretto sul lavoro dell'intermediario, e la
 * verificabilità è ciò che distingue uno strumento professionale da un
 * generatore di testo plausibile.
 *
 * Attraversa quattro moduli — chat, tabelle di analisi, esecuzioni degli
 * agenti, documenti esportati — quindi cambia forma con difficoltà. Vale la
 * pena averla precisa da subito.
 */
export interface Citazione {
  id: Id;
  documentoId: Id;
  documentoTitolo: string;
  /** Anche gli allegati di conversazione sono citabili: il motore li legge come gli altri. */
  archivio: Archivio | 'conversazione';
  posizione: PosizioneDocumento;
  /** Il passaggio testuale da cui il dato è tratto, per l'anteprima. */
  estratto: string;
  /**
   * I numeri con cui il testo richiama questa fonte (`[1]`, `[2]`…): il
   * rimando si rende come chip nel punto esatto della risposta. Assente
   * nei messaggi precedenti al 29/08/2026, che tengono l'elenco in coda.
   */
  rimandi?: number[];
}

/**
 * Dove si trova il passaggio.
 *
 * `pagina` serve al visualizzatore per aprire il PDF nel punto giusto;
 * `articolo` e `sezione` servono all'utente, che nel proprio lavoro cita
 * "l'articolo 12", non "pagina 8". Servono entrambi e non sono
 * intercambiabili.
 *
 * `evidenzia` è il riquadro da sovrapporre alla pagina, in coordinate
 * normalizzate 0–1 sulla dimensione della pagina: indipendenti dallo zoom e
 * dalla risoluzione con cui il PDF viene reso.
 */
export interface PosizioneDocumento {
  pagina: number;
  articolo?: string;
  sezione?: string;
  evidenzia?: { x: number; y: number; larghezza: number; altezza: number };
}

/**
 * Etichetta compatta e leggibile di una citazione, es.
 * `DIP Aggiuntivo - art. 12, p. 8`.
 *
 * Sta qui e non in una pipe perché la stessa stringa serve anche dove non
 * c'è un template: nomi di file esportati, testo copiato negli appunti,
 * contenuti generati sui template di output.
 */
export function etichettaCitazione(c: Citazione): string {
  const parti = [c.documentoTitolo];
  if (c.posizione.articolo) parti.push(`art. ${c.posizione.articolo}`);
  else if (c.posizione.sezione) parti.push(c.posizione.sezione);
  parti.push(`p. ${c.posizione.pagina}`);
  return parti.join(' - ');
}
