import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { DettaglioTabellaStore } from './dettaglio-tabella-store';
import { Sessione, TabellaAnalisi } from '@core/models';

function tabella(
  stato: TabellaAnalisi['stato'],
  autoreId = 'utn-004',
): TabellaAnalisi {
  return {
    id: 'tab-001',
    titolo: 'Confronto RC Auto',
    creataIl: '2026-08-05T10:00:00+02:00',
    aggiornataIl: '2026-08-05T10:00:00+02:00',
    autoreId,
    condivisa: autoreId !== 'utn-004',
    stato,
    colonne: [{ id: 'c1', intestazione: 'Massimale RC', origine: 'predefinita' }],
    righe: [
      {
        documentoId: 'doc-pub-003',
        archivio: 'pubblico',
        etichetta: 'Generali — AUTOPIÙ',
        celle: { c1: stato === 'completa' ? { stato: 'pronta', esito: 'non-presente' } : { stato: 'in-attesa' } },
      },
    ],
  };
}

const sessione: Sessione = {
  utente: {
    id: 'utn-004',
    nome: 'Davide',
    cognome: 'Lo Bianco',
    email: 'd.lobianco@example.it',
    ruolo: 'operatore',
    tenantId: 'tnt-001',
  },
  tenant: { id: 'tnt-001', nome: 'Meridiana', piano: 'agenzia' },
  permessi: [],
};

describe('DettaglioTabellaStore', () => {
  let store: DettaglioTabellaStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DettaglioTabellaStore,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    store = TestBed.inject(DettaglioTabellaStore);
    http = TestBed.inject(HttpTestingController);
  });

  /* Si prova la logica, non la contabilità delle chiamate: le richieste
     aperte (template, sessione, polling) si svuotano senza pretese. */
  afterEach(() => {
    http
      .match(() => true)
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush(null));
  });

  /** Apre la tabella e soddisfa le risorse partite da sole. */
  async function apri(t: TabellaAnalisi, conSessione = true) {
    store.apri(t.id);
    await new Promise((r) => setTimeout(r, 0));
    http.expectOne(`/api/tabelle/${t.id}`).flush(t);
    if (conSessione) http.match('/api/sessione').forEach((r) => r.flush(sessione));
    await new Promise((r) => setTimeout(r, 0));
  }

  it('riconosce quando la generazione è conclusa e il polling non serve', async () => {
    await apri(tabella('completa'));

    expect(store.inGenerazione()).toBe(false);
    expect(store.avanzamento()).toEqual({ pronte: 1, totali: 1, percentuale: 100 });
  });

  it('segnala la generazione in corso: è il segnale che accende il polling', async () => {
    await apri(tabella('in-generazione'));

    expect(store.inGenerazione()).toBe(true);
    expect(store.avanzamento()).toEqual({ pronte: 0, totali: 1, percentuale: 0 });
  });

  it('apre in sola lettura la tabella condivisa da un collega (RF-C-15)', async () => {
    await apri(tabella('completa', 'utn-001'));

    expect(store.soloLettura()).toBe(true);
  });

  it('lascia modificare la propria tabella', async () => {
    await apri(tabella('completa', 'utn-004'));

    expect(store.soloLettura()).toBe(false);
  });

  it('resta prudente finché la sessione non è nota', async () => {
    await apri(tabella('completa', 'utn-004'), false);

    /* Meglio un pulsante che compare un attimo dopo che uno da ritirare. */
    expect(store.soloLettura()).toBe(true);
  });

  it('applica la tabella restituita da una mutazione senza ricaricare', async () => {
    await apri(tabella('completa'));

    store.rinomina('Nuovo titolo');
    const richiesta = http.expectOne(
      (r) => r.method === 'PATCH' && r.url === '/api/tabelle/tab-001',
    );
    expect(richiesta.request.body).toEqual({ titolo: 'Nuovo titolo' });
    richiesta.flush({ ...tabella('completa'), titolo: 'Nuovo titolo' });

    expect(store.tabella()?.titolo).toBe('Nuovo titolo');
  });
});
