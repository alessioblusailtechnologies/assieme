import { describe, expect, it } from 'vitest';

import type { DocumentoPubblico } from '../src/contratto/documenti.js';
import { filtraSet, raggruppaInSet } from '../src/api/documenti/set.js';

/**
 * Il raggruppatore dei set informativi è puro: qui le regole — la chiave
 * compagnia+prodotto+edizione, l'ordine conservato, il preferito di set,
 * ricerca e «solo preferiti» valutati sul set intero. La rotta è provata
 * in `integrazione-set-informativi.spec.ts`.
 */

const documento = (parziale: Partial<DocumentoPubblico>): DocumentoPubblico => ({
  id: 'doc-1',
  archivio: 'pubblico',
  titolo: 'DIP — Nuova 4R',
  tipologia: 'dip',
  fileUrl: '/api/documenti/doc-1/file',
  compagnia: { id: 'cmp-allianz', nome: 'Allianz Italia' },
  ramo: { id: 'ram-auto', nome: 'RC Auto e veicoli', codice: 'rc-auto' },
  prodotto: 'Nuova 4R',
  edizione: { id: 'edz-1', etichetta: 'ed. 04/2026', validaDal: '2026-04-01', corrente: true },
  preferito: false,
  ...parziale,
});

describe('raggruppaInSet', () => {
  it('la chiave è compagnia+prodotto+edizione: stessa edizione un set, edizioni diverse set diversi', () => {
    const edStorica = { id: 'edz-0', etichetta: 'ed. 01/2025', validaDal: '2025-01-01', corrente: false };
    const set = raggruppaInSet([
      documento({ id: 'a-dip', tipologia: 'dip' }),
      documento({ id: 'a-cond', tipologia: 'condizioni-assicurazione', titolo: 'CdA — Nuova 4R', numeroPagine: 64 }),
      documento({ id: 'a-dip-storico', edizione: edStorica }),
      documento({ id: 'b-dip', prodotto: 'Bonus Malus', edizione: { ...edStorica, id: 'edz-9' } }),
    ]);

    expect(set.map((s) => s.chiave)).toEqual([
      'cmp-allianz:Nuova 4R:edz-1',
      'cmp-allianz:Nuova 4R:edz-0',
      'cmp-allianz:Bonus Malus:edz-9',
    ]);
    expect(set[0]!.documenti.map((d) => d.id)).toEqual(['a-dip', 'a-cond']);
    expect(set[0]!.documenti[1]).toMatchObject({ tipologia: 'condizioni-assicurazione', numeroPagine: 64 });
  });

  it('l’ordine d’arrivo si conserva: le righe sono già ordinate dalla query', () => {
    const set = raggruppaInSet([
      documento({ id: 'z', prodotto: 'Zeta' }),
      documento({ id: 'a', prodotto: 'Alfa' }),
    ]);
    expect(set.map((s) => s.prodotto)).toEqual(['Zeta', 'Alfa']);
  });

  it('il preferito di set: basta un documento marcato', () => {
    const set = raggruppaInSet([
      documento({ id: 'a-dip' }),
      documento({ id: 'a-cond', tipologia: 'condizioni-assicurazione', preferito: true }),
    ]);
    expect(set[0]!.preferito).toBe(true);
    expect(set[0]!.documenti.map((d) => d.preferito)).toEqual([false, true]);
  });
});

describe('filtraSet', () => {
  const insiemi = raggruppaInSet([
    documento({ id: 'a-dip' }),
    documento({ id: 'a-cond', tipologia: 'condizioni-assicurazione', titolo: 'Condizioni di Assicurazione — Nuova 4R' }),
    documento({
      id: 'b-dip',
      prodotto: 'AUTOPIÙ con Telematica',
      titolo: 'DIP — AUTOPIÙ',
      compagnia: { id: 'cmp-generali', nome: 'Generali Italia' },
      edizione: { id: 'edz-2', etichetta: 'ed. 01/2026', validaDal: '2026-01-01', corrente: true },
      preferito: true,
    }),
  ]);

  it('la ricerca guarda il set intero: trovare le Condizioni non strappa via il DIP', () => {
    const esito = filtraSet(insiemi, { q: 'condizioni nuova 4r' });
    expect(esito).toHaveLength(1);
    expect(esito[0]!.documenti.map((d) => d.id)).toEqual(['a-dip', 'a-cond']);
  });

  it('senza accenti e in qualsiasi ordine: «autopiu generali» trova AUTOPIÙ', () => {
    const esito = filtraSet(insiemi, { q: 'autopiu generali' });
    expect(esito.map((s) => s.prodotto)).toEqual(['AUTOPIÙ con Telematica']);
  });

  it('«solo preferiti» tiene i set con almeno un documento marcato', () => {
    const esito = filtraSet(insiemi, { soloPreferiti: true });
    expect(esito.map((s) => s.prodotto)).toEqual(['AUTOPIÙ con Telematica']);
  });
});
