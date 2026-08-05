import { CellaTabella, TabellaAnalisi } from '@core/models';
import { avanzamentoTabella } from './avanzamento';

const pronta: CellaTabella = { stato: 'pronta', esito: 'non-presente' };
const inAttesa: CellaTabella = { stato: 'in-attesa' };

function tabella(celle: Record<string, CellaTabella>[]): TabellaAnalisi {
  return {
    id: 'tab-x',
    titolo: 'Prova',
    creataIl: '2026-08-05T10:00:00+02:00',
    aggiornataIl: '2026-08-05T10:00:00+02:00',
    autoreId: 'utn-004',
    condivisa: false,
    stato: 'in-generazione',
    colonne: [
      { id: 'c1', intestazione: 'Massimale RC', origine: 'predefinita' },
      { id: 'c2', intestazione: 'Franchigie', origine: 'predefinita' },
    ],
    righe: celle.map((c, i) => ({
      documentoId: `doc-${i}`,
      archivio: 'pubblico',
      etichetta: `Documento ${i}`,
      celle: c,
    })),
  };
}

describe('avanzamentoTabella', () => {
  it('conta le celle pronte sul totale righe × colonne', () => {
    const avanzamento = avanzamentoTabella(
      tabella([
        { c1: pronta, c2: pronta },
        { c1: pronta, c2: inAttesa },
      ]),
    );

    expect(avanzamento).toEqual({ pronte: 3, totali: 4, percentuale: 75 });
  });

  it('pesa anche le celle che il server non ha ancora scritto', () => {
    /* Una colonna appena aggiunta può non avere ancora la cella nella mappa:
       deve contare comunque come attesa, o l'avanzamento mentirebbe. */
    const avanzamento = avanzamentoTabella(tabella([{ c1: pronta }]));

    expect(avanzamento).toEqual({ pronte: 1, totali: 2, percentuale: 50 });
  });

  it('non produce un avanzamento senza tabella o senza celle attese', () => {
    expect(avanzamentoTabella(undefined)).toBeUndefined();
    expect(avanzamentoTabella(tabella([]))).toBeUndefined();
  });
});
