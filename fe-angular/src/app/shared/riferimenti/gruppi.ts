import { RiferimentoDocumento } from '@core/models';

/**
 * Come i riferimenti del contesto si mostrano a chi li guarda (12/09/2026).
 *
 * Il contesto di una conversazione è fatto di documenti, e a database resta
 * così: il motore vuole i path dei quattro file di un set informativo, non
 * il nome commerciale del prodotto. Ma un intermediario non referenzia il
 * DIP, referenzia «Km&Servizi»: dal selettore `@` si sceglie il prodotto, e
 * da lì in poi quei quattro documenti sono **una cosa sola** - un chip nel
 * composer, una riga nel pannello, un gesto per toglierli.
 *
 * Sta in `shared/` perché il composer e il pannello del contesto devono
 * raggruppare allo stesso modo: due schermate che mostrano lo stesso
 * contesto in due forme diverse sono un difetto che nessuno segnala.
 */
export interface GruppoRiferimenti {
  /** L'id del documento, o la chiave del set: identifica il gruppo ovunque. */
  chiave: string;
  /** Il titolo del documento, o il prodotto con la sua edizione. */
  titolo: string;
  archivio: RiferimentoDocumento['archivio'];
  /** I documenti del gruppo: uno, o tutti quelli del set. */
  riferimenti: RiferimentoDocumento[];
}

/** La chiave con cui un riferimento si raggruppa: il suo set, o se stesso. */
export function chiaveGruppo(riferimento: RiferimentoDocumento): string {
  return riferimento.set?.chiave ?? riferimento.id;
}

/**
 * Il titolo di un gruppo. Di un set si scrive il prodotto con l'edizione
 * («Km&Servizi, ed. 04/2026»): senza l'edizione due chip identici starebbero
 * uno accanto all'altro, e sono documenti diversi.
 */
function titoloGruppo(riferimento: RiferimentoDocumento): string {
  const set = riferimento.set;
  if (!set) return riferimento.titolo;
  return set.edizione ? `${set.prodotto}, ${set.edizione}` : set.prodotto;
}

/**
 * I riferimenti raggruppati, nell'ordine in cui compaiono: i documenti dello
 * stesso set finiscono in un gruppo solo, gli altri restano da soli.
 */
export function raggruppaRiferimenti(riferimenti: RiferimentoDocumento[]): GruppoRiferimenti[] {
  const gruppi = new Map<string, GruppoRiferimenti>();
  for (const r of riferimenti) {
    const chiave = chiaveGruppo(r);
    const gruppo = gruppi.get(chiave);
    if (gruppo) gruppo.riferimenti.push(r);
    else
      gruppi.set(chiave, {
        chiave,
        titolo: titoloGruppo(r),
        archivio: r.archivio,
        riferimenti: [r],
      });
  }
  return [...gruppi.values()];
}
