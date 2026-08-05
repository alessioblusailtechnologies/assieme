import { TabellaAnalisi } from '@core/models';

/** Lo stato di popolamento della griglia, per l'indicatore in testata. */
export interface Avanzamento {
  pronte: number;
  totali: number;
  percentuale: number;
}

/**
 * Quante celle sono pronte sul totale atteso (righe × colonne).
 *
 * Il totale si calcola sulla struttura e non sulle celle presenti nella
 * mappa: una colonna appena aggiunta deve pesare anche se il server non ha
 * ancora scritto le sue celle in attesa.
 */
export function avanzamentoTabella(tabella: TabellaAnalisi | undefined): Avanzamento | undefined {
  if (!tabella) return undefined;
  const totali = tabella.righe.length * tabella.colonne.length;
  if (!totali) return undefined;

  let pronte = 0;
  for (const riga of tabella.righe) {
    for (const colonna of tabella.colonne) {
      if (riga.celle[colonna.id]?.stato === 'pronta') pronte += 1;
    }
  }
  return { pronte, totali, percentuale: Math.round((pronte / totali) * 100) };
}
