import { AmbitoIstruzione, Compagnia, Ramo } from '@core/models';

/**
 * L'ambito di un'istruzione (RF-D-06) in un `ui-select` piatto.
 *
 * L'ambito è un'unione discriminata, il select vuole stringhe: qui stanno
 * la codifica (`ramo:ram-auto`), la decodifica e le etichette. Sta in un
 * modulo puro perché regole e documenti di riferimento usano lo stesso
 * ambito, e due traduzioni della stessa unione divergono sempre.
 */

export interface OpzioneAmbito {
  valore: string;
  etichetta: string;
}

export function codificaAmbito(ambito: AmbitoIstruzione): string {
  switch (ambito.tipo) {
    case 'generale':
      return 'generale';
    case 'ramo':
      return `ramo:${ambito.ramoId}`;
    case 'compagnia':
      return `compagnia:${ambito.compagniaId}`;
  }
}

export function decodificaAmbito(codice: string): AmbitoIstruzione {
  if (codice.startsWith('ramo:')) return { tipo: 'ramo', ramoId: codice.slice('ramo:'.length) };
  if (codice.startsWith('compagnia:')) {
    return { tipo: 'compagnia', compagniaId: codice.slice('compagnia:'.length) };
  }
  return { tipo: 'generale' };
}

/**
 * L'etichetta da mostrare su tag ed elenchi. Se il ramo o la compagnia non
 * si trovano — tassonomia cambiata, fixture vecchia — si dice il tipo, non
 * si inventa un nome.
 */
export function etichettaAmbito(
  ambito: AmbitoIstruzione,
  rami: Ramo[],
  compagnie: Compagnia[],
): string {
  switch (ambito.tipo) {
    case 'generale':
      return 'Generale';
    case 'ramo':
      return rami.find((r) => r.id === ambito.ramoId)?.nome ?? 'Ramo';
    case 'compagnia':
      return compagnie.find((c) => c.id === ambito.compagniaId)?.nome ?? 'Compagnia';
  }
}

/** Le opzioni del select: Generale in testa, poi i rami, poi le compagnie. */
export function opzioniAmbito(rami: Ramo[], compagnie: Compagnia[]): OpzioneAmbito[] {
  return [
    { valore: 'generale', etichetta: 'Generale — vale sempre' },
    ...rami.map((r) => ({ valore: `ramo:${r.id}`, etichetta: `Ramo · ${r.nome}` })),
    ...compagnie.map((c) => ({ valore: `compagnia:${c.id}`, etichetta: `Compagnia · ${c.nome}` })),
  ];
}
