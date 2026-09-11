import { RiferimentoDocumento, SetDiRiferimento } from '@core/models';
import { chiaveGruppo, raggruppaRiferimenti } from './gruppi';

const setKm: SetDiRiferimento = {
  chiave: 'cmp-zurich:Km&Servizi:ed-2026-04',
  prodotto: 'Km&Servizi',
  compagnia: 'Zurich',
  edizione: 'ed. 04/2026',
  corrente: true,
};

const documentoDelSet = (id: string, titolo: string): RiferimentoDocumento => ({
  id,
  titolo,
  archivio: 'pubblico',
  set: setKm,
});

describe('raggruppaRiferimenti', () => {
  it('mette i documenti dello stesso set in un gruppo solo', () => {
    const gruppi = raggruppaRiferimenti([
      documentoDelSet('d1', 'DIP'),
      documentoDelSet('d2', 'DIP Aggiuntivo'),
      documentoDelSet('d3', 'Condizioni di Assicurazione'),
    ]);

    expect(gruppi.length).toBe(1);
    expect(gruppi[0]!.titolo).toBe('Km&Servizi, ed. 04/2026');
    expect(gruppi[0]!.riferimenti.map((r) => r.id)).toEqual(['d1', 'd2', 'd3']);
  });

  it('lascia da soli i documenti senza set', () => {
    const gruppi = raggruppaRiferimenti([
      { id: 'p1', titolo: 'Polizza Rossi', archivio: 'privato' },
      { id: 'p2', titolo: 'Preventivo Bianchi', archivio: 'privato' },
    ]);

    expect(gruppi.map((g) => g.chiave)).toEqual(['p1', 'p2']);
    expect(gruppi.every((g) => g.riferimenti.length === 1)).toBe(true);
  });

  it('tiene l’ordine in cui i riferimenti compaiono', () => {
    const gruppi = raggruppaRiferimenti([
      { id: 'p1', titolo: 'Polizza Rossi', archivio: 'privato' },
      documentoDelSet('d1', 'DIP'),
      { id: 'a1', titolo: 'Foto del sinistro', archivio: 'conversazione' },
      documentoDelSet('d2', 'DIP Aggiuntivo'),
    ]);

    expect(gruppi.map((g) => g.chiave)).toEqual(['p1', setKm.chiave, 'a1']);
    expect(gruppi[1]!.riferimenti.length).toBe(2);
  });

  it('due edizioni dello stesso prodotto restano due gruppi', () => {
    const vecchia: SetDiRiferimento = {
      ...setKm,
      chiave: 'cmp-zurich:Km&Servizi:ed-2025-04',
      edizione: 'ed. 04/2025',
      corrente: false,
    };
    const gruppi = raggruppaRiferimenti([
      documentoDelSet('d1', 'DIP'),
      { id: 'd9', titolo: 'DIP', archivio: 'pubblico', set: vecchia },
    ]);

    expect(gruppi.length).toBe(2);
    expect(gruppi.map((g) => g.titolo)).toEqual([
      'Km&Servizi, ed. 04/2026',
      'Km&Servizi, ed. 04/2025',
    ]);
  });

  it('la chiave di un documento senza set è il suo id', () => {
    expect(chiaveGruppo({ id: 'p1', titolo: 'Polizza', archivio: 'privato' })).toBe('p1');
    expect(chiaveGruppo(documentoDelSet('d1', 'DIP'))).toBe(setKm.chiave);
  });
});
