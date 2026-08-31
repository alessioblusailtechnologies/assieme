import { Ricordo } from '@core/models';

/**
 * Come si chiamano le categorie nell'interfaccia. In un file proprio perché
 * servono a due viste della stessa feature — l'elenco e il globo — e un
 * import fra le due creerebbe un ciclo.
 */
export const CATEGORIE_RICORDO: { valore: Ricordo['categoria']; etichetta: string }[] = [
  { valore: 'prassi', etichetta: 'Prassi operativa' },
  { valore: 'cliente', etichetta: 'Cliente' },
  { valore: 'preferenza', etichetta: 'Preferenza' },
  { valore: 'decisione', etichetta: 'Decisione' },
  { valore: 'altro', etichetta: 'Altro' },
];

export function etichettaCategoria(categoria: Ricordo['categoria']): string {
  return CATEGORIE_RICORDO.find((c) => c.valore === categoria)?.etichetta ?? categoria;
}
