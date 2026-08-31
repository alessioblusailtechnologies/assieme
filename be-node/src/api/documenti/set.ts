import type {
  DocumentoPubblico,
  FiltriSet,
  SetInformativo,
} from '../../contratto/documenti.js';

/**
 * Dal piatto al raggruppato: le righe di `documenti` (già ordinate per
 * compagnia, prodotto, edizione e tipologia) diventano set informativi.
 * Funzioni pure: la rotta legge, qui si assembla, il test non ha bisogno
 * del database.
 *
 * Ricerca e «solo preferiti» si applicano DOPO il raggruppamento, mai in
 * SQL: un filtro per riga lascerebbe set mutilati — la ricerca «condizioni
 * nuova 4r» troverebbe il set ma gli strapperebbe via il DIP.
 */

export function raggruppaInSet(documenti: DocumentoPubblico[]): SetInformativo[] {
  const set = new Map<string, SetInformativo>();
  for (const d of documenti) {
    const chiave = `${d.compagnia.id}:${d.prodotto}:${d.edizione.id}`;
    let corrente = set.get(chiave);
    if (!corrente) {
      corrente = {
        chiave,
        prodotto: d.prodotto,
        compagnia: d.compagnia,
        ramo: d.ramo,
        edizione: d.edizione,
        documenti: [],
        preferito: false,
      };
      set.set(chiave, corrente);
    }
    corrente.documenti.push({
      id: d.id,
      titolo: d.titolo,
      tipologia: d.tipologia,
      ...(d.numeroPagine !== undefined && { numeroPagine: d.numeroPagine }),
      preferito: d.preferito,
    });
    if (d.preferito) corrente.preferito = true;
  }
  return [...set.values()];
}

/** Senza accenti e minuscolo: «AUTOPIU» trova «AUTOPIÙ», come nell'elenco. */
function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Tutte le parole, in qualsiasi ordine, su tutto ciò che il set dice di sé. */
function corrisponde(set: SetInformativo, termine: string): boolean {
  const testo = normalizza(
    [
      set.prodotto,
      set.compagnia.nome,
      set.ramo.nome,
      set.edizione.etichetta,
      ...set.documenti.map((d) => d.titolo),
    ].join(' '),
  );
  return termine
    .split(/\s+/)
    .filter(Boolean)
    .every((parola) => testo.includes(normalizza(parola)));
}

export function filtraSet(
  set: SetInformativo[],
  filtri: Pick<FiltriSet, 'q' | 'soloPreferiti'>,
): SetInformativo[] {
  return set.filter((s) => {
    if (filtri.soloPreferiti && !s.preferito) return false;
    if (filtri.q && !corrisponde(s, filtri.q)) return false;
    return true;
  });
}
