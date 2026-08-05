import { CriterioPredefinito, NuovaColonna } from '@core/models';

/**
 * Oltre questa misura un'intestazione smette di essere un'intestazione:
 * il criterio per esteso resta nel campo `criterio`, e il suggerimento
 * sulla colonna lo mostra intero.
 */
const MAX_INTESTAZIONE = 48;

/**
 * L'intestazione di una colonna personalizzata, ricavata dal criterio in
 * linguaggio naturale (RF-C-11): iniziale maiuscola, spazi normalizzati,
 * troncatura al confine di parola — la stessa regola con cui la chat ricava
 * il titolo di una conversazione dal primo messaggio.
 */
export function intestazioneDaCriterio(criterio: string): string {
  const pulito = criterio.replace(/\s+/g, ' ').trim();
  const conMaiuscola = pulito.charAt(0).toUpperCase() + pulito.slice(1);
  if (conMaiuscola.length <= MAX_INTESTAZIONE) return conMaiuscola;
  const tronco = conMaiuscola.slice(0, MAX_INTESTAZIONE);
  const confine = tronco.lastIndexOf(' ');
  return `${tronco.slice(0, confine > 0 ? confine : MAX_INTESTAZIONE)}…`;
}

/**
 * Le colonne della richiesta di creazione: prima i criteri predefiniti
 * nell'ordine in cui il server li propone, poi le personalizzate nell'ordine
 * in cui l'utente le ha scritte.
 */
export function componiColonne(
  predefiniti: CriterioPredefinito[],
  personalizzate: string[],
): NuovaColonna[] {
  return [
    ...predefiniti.map((c) => ({
      intestazione: c.intestazione,
      origine: 'predefinita' as const,
    })),
    ...personalizzate.map((criterio) => ({
      intestazione: intestazioneDaCriterio(criterio),
      origine: 'personalizzata' as const,
      criterio,
    })),
  ];
}
