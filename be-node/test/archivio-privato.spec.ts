import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import {
  schemaFiltriDocumentiPrivati,
  schemaModificheDocumento,
} from '../src/contratto/documenti-privati.js';
import { interpretaProposta } from '../src/worker/ingestion/classificatore.js';
import { contieneTesto } from '../src/worker/ingestion/gestore.js';

/**
 * Il contratto dell'Archivio Privato senza database: gli schemi Zod, le
 * risposte che le rotte danno prima di toccare il db, e le due funzioni
 * pure della pipeline (lettura della proposta, riconoscimento di una
 * conversione senza testo).
 */
const verificaFinta: NonNullable<OpzioniApp['verificaToken']> = () =>
  Promise.resolve({
    sub: 'utn-prova',
    app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'operatore' },
  });

const autenticato = { authorization: 'Bearer token-di-prova' };

describe('filtri di GET /api/documenti-privati', () => {
  it('i booleani di querystring: "false" è falso, non Boolean("false")', () => {
    expect(schemaFiltriDocumentiPrivati.parse({ soloRiferimenti: 'false' }).soloRiferimenti).toBe(false);
    expect(schemaFiltriDocumentiPrivati.parse({ soloRiferimenti: 'true' }).soloRiferimenti).toBe(true);
    expect(schemaFiltriDocumentiPrivati.parse({}).soloRiferimenti).toBeUndefined();
  });

  it('paginazione coi default e i limiti dello stub', () => {
    expect(schemaFiltriDocumentiPrivati.parse({})).toMatchObject({ pagina: 1, perPagina: 20 });
    expect(schemaFiltriDocumentiPrivati.safeParse({ perPagina: '500' }).success).toBe(false);
    expect(schemaFiltriDocumentiPrivati.safeParse({ stato: 'sospeso' }).success).toBe(false);
  });
});

describe('corpo di PATCH /api/documenti-privati/:id', () => {
  it('accetta le sei chiavi del contratto, con null per svuotare', () => {
    const m = schemaModificheDocumento.parse({
      titolo: '  Preventivo  ',
      tipologia: 'preventivo',
      compagniaId: null,
      ramoId: 'ram-auto',
      riferimentoCliente: null,
      etichette: [' RC Auto '],
    });
    expect(m).toEqual({
      titolo: 'Preventivo',
      tipologia: 'preventivo',
      compagniaId: null,
      ramoId: 'ram-auto',
      riferimentoCliente: null,
      etichette: ['RC Auto'],
    });
  });

  it('rifiuta chiavi estranee, titoli vuoti, etichette vuote', () => {
    expect(schemaModificheDocumento.safeParse({ stato: 'pronto' }).success).toBe(false);
    expect(schemaModificheDocumento.safeParse({ titolo: '   ' }).success).toBe(false);
    expect(schemaModificheDocumento.safeParse({ etichette: [''] }).success).toBe(false);
    expect(schemaModificheDocumento.safeParse({}).success).toBe(true);
  });
});

describe('le rotte prima del database', () => {
  const app = creaApp({ logger: false, verificaToken: verificaFinta });

  it('POST senza multipart → 400; PATCH con corpo non valido → 400; filtri non validi → 400', async () => {
    const senzaFile = await app.inject({
      method: 'POST',
      url: '/api/documenti-privati',
      headers: autenticato,
      payload: { file: 'no' },
    });
    expect(senzaFile.statusCode).toBe(400);

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/documenti-privati/doc-priv-x',
      headers: autenticato,
      payload: { tipologia: 'fattura' },
    });
    expect(patch.statusCode).toBe(400);
    expect(patch.json()).toMatchObject({ codice: 'DATI_NON_VALIDI' });

    const filtri = await app.inject({
      method: 'GET',
      url: '/api/documenti-privati?stato=boh',
      headers: autenticato,
    });
    expect(filtri.statusCode).toBe(400);
  });

  it('senza token → 401 su ogni rotta del dominio', async () => {
    for (const url of ['/api/documenti-privati', '/api/etichette', '/api/spazio']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(401);
    }
  });
});

describe('la pipeline, le parti pure', () => {
  it('interpretaProposta legge il JSON anche con testo attorno e valida la tipologia', () => {
    expect(
      interpretaProposta('Ecco:\n```json\n{"tipologia":"polizza","compagniaId":"cmp-axa","ramoId":null}\n```'),
    ).toEqual({ tipologia: 'polizza', compagniaId: 'cmp-axa', ramoId: null });
    expect(() => interpretaProposta('{"tipologia":"fattura"}')).toThrow();
    expect(() => interpretaProposta('nessun oggetto')).toThrow();
  });

  it('contieneTesto: ancore e callout da soli non sono testo', () => {
    expect(contieneTesto('[pag. 1]\n\n[pag. 2]\n> [!ATTENZIONE] Porzione non leggibile a pag. 2\n')).toBe(false);
    expect(contieneTesto('[pag. 1]\n\nArt. 1 — Oggetto')).toBe(true);
  });
});
