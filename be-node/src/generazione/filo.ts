import type { Citazione } from '../contratto/conversazioni.js';

import { fontiDaCitazioni } from './catalogo.js';

/** Un messaggio della conversazione, nella forma minima che serve qui. */
export interface MessaggioDaTrascrivere {
  autore: 'utente' | 'assistente';
  testo: string;
  citazioni?: Citazione[] | null;
}

/** La conversazione messa in fila: il Markdown e le fonti, senza doppioni. */
export interface Trascrizione {
  testo: string;
  fonti: string[];
}

/**
 * Tutta la conversazione come un documento solo (12/09/2026).
 *
 * Le azioni sotto una risposta - copia, email, esportazione, «Genera da
 * modello» - valgono anche per il filo intero, dalla barra sopra il
 * composer: una consulenza vera è fatta di più giri, e consegnarne uno solo
 * vuol dire far ricomporre a mano il resto.
 *
 * La forma è quella del Markdown che la chat già scarica («## Domanda»,
 * «## Risposta», i giri separati da una riga): stessa cosa letta due volte,
 * stesso aspetto. Le fonti si raccolgono da tutte le risposte e si
 * uniscono: la stessa polizza citata in tre giri è una riga, non tre.
 */
export function trascriviConversazione(messaggi: MessaggioDaTrascrivere[]): Trascrizione {
  const parti: string[] = [];
  const fonti: string[] = [];
  const viste = new Set<string>();

  for (const m of messaggi) {
    const testo = m.testo?.trim();
    if (!testo) continue;
    parti.push(`## ${m.autore === 'utente' ? 'Domanda' : 'Risposta'}\n\n${testo}`);
    for (const fonte of fontiDaCitazioni(m.citazioni ?? [])) {
      if (viste.has(fonte)) continue;
      viste.add(fonte);
      fonti.push(fonte);
    }
  }

  return { testo: parti.join('\n\n---\n\n'), fonti };
}
