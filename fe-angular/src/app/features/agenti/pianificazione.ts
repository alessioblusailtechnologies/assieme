import { FrequenzaPianificazione, Pianificazione } from '@core/models';

/**
 * Come si racconta una pianificazione (RF-E-04).
 *
 * La stessa frase serve all'elenco, al dettaglio e all'editor: «ogni giorno
 * alle 07:30», «ogni lunedì alle 08:00», «il giorno 1 del mese alle 09:00».
 * La sospensione non entra nella frase — è uno stato, e lo dice un badge.
 */

const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

export function etichettaGiornoSettimana(giorno: number): string {
  return GIORNI[giorno - 1] ?? GIORNI[0];
}

export function etichettaPianificazione(p: Pianificazione): string {
  switch (p.frequenza) {
    case 'giornaliera':
      return `ogni giorno alle ${p.orario}`;
    case 'settimanale':
      return `ogni ${etichettaGiornoSettimana(p.giornoSettimana ?? 1)} alle ${p.orario}`;
    case 'mensile':
      return `il giorno ${p.giornoMese ?? 1} del mese alle ${p.orario}`;
  }
}

/** Per le tendine dell'editor. */
export const GIORNI_SETTIMANA = GIORNI.map((etichetta, indice) => ({
  valore: indice + 1,
  etichetta,
}));

/**
 * Le frequenze ammesse dal piano (RF-E-09): `frequenzaMinima` è la più fitta
 * consentita — con minima «settimanale» la giornaliera non si può scegliere.
 */
const ORDINE_FREQUENZE: FrequenzaPianificazione[] = ['giornaliera', 'settimanale', 'mensile'];

const ETICHETTE_FREQUENZA: Record<FrequenzaPianificazione, string> = {
  giornaliera: 'Ogni giorno',
  settimanale: 'Ogni settimana',
  mensile: 'Ogni mese',
};

export function frequenzeAmmesse(
  minima: FrequenzaPianificazione,
): { valore: FrequenzaPianificazione; etichetta: string }[] {
  const daIndice = ORDINE_FREQUENZE.indexOf(minima);
  return ORDINE_FREQUENZE.slice(Math.max(daIndice, 0)).map((valore) => ({
    valore,
    etichetta: ETICHETTE_FREQUENZA[valore],
  }));
}
