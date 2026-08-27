import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { fontiTabella, testoCella, testoTabella } from '../src/api/tabelle/rotte.js';
import type { TabellaAnalisi } from '../src/contratto/tabelle.js';
import { schemaNuovaColonna, schemaNuovaTabella } from '../src/contratto/tabelle.js';
import {
  MOTIVO_SENZA_ESITO,
  MOTIVO_SENZA_FONTE,
  promptRigaEstrazione,
  separaBloccoCelle,
  valutaCelle,
} from '../src/worker/tabelle/estrazione.js';
import type { DocumentoWorkspace } from '../src/worker/motore/workspace.js';

/**
 * Il contratto delle tabelle senza database: gli schemi Zod, le risposte
 * che le rotte danno prima di toccare il db, e le parti pure - la lettura
 * del blocco `velia-celle` e la regola dura di RF-C-12: un valore senza una
 * fonte verificabile non diventa mai una cella che afferma.
 */

const verificaFinta: NonNullable<OpzioniApp['verificaToken']> = () =>
  Promise.resolve({
    sub: '00000000-0000-4000-8000-00000000000a',
    app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'operatore' },
  });

const autenticato = { authorization: 'Bearer token-di-prova' };

const DOC: DocumentoWorkspace = {
  id: 'doc-priv-x',
  titolo: 'Polizza Rossi',
  archivio: 'privato',
  tipologia: 'polizza',
  numeroPagine: 3,
  paginaMassima: 3,
  compagnia: null,
  ramo: null,
  compagniaId: null,
  ramoId: null,
  prodotto: null,
  edizione: null,
  riferimentoCliente: null,
  etichette: [],
  documentoDiRiferimento: false,
};

const PER_PATH = new Map([['tenant/documenti/polizza/polizza-rossi--doc-priv-x.md', DOC]]);

describe('schemi del contratto', () => {
  it('una tabella nasce con almeno un documento e una colonna', () => {
    expect(schemaNuovaTabella.safeParse({ documentiIds: [], colonne: [] }).success).toBe(false);
    expect(schemaNuovaTabella.safeParse({ documentiIds: ['doc-1'], colonne: [] }).success).toBe(false);
    expect(
      schemaNuovaTabella.safeParse({
        documentiIds: ['doc-1'],
        colonne: [{ intestazione: 'Massimali', origine: 'predefinita' }],
      }).success,
    ).toBe(true);
  });

  it('la colonna pretende intestazione e origine', () => {
    expect(schemaNuovaColonna.safeParse({ intestazione: '  ', origine: 'personalizzata' }).success).toBe(false);
    expect(schemaNuovaColonna.safeParse({ intestazione: 'Cristalli', origine: 'boh' }).success).toBe(false);
  });
});

describe('il blocco velia-celle e la sua valutazione', () => {
  const colonne = [{ id: 'col-a' }, { id: 'col-b' }];

  it('si estrae dal testo della sessione, e un blocco rotto si dichiara', () => {
    const testo = 'rumore\n```velia-celle\n{"celle":[{"colonna":"col-a","esito":"non-presente"}]}\n```';
    expect(separaBloccoCelle(testo).blocco?.celle).toHaveLength(1);
    expect(separaBloccoCelle('nessun blocco').problemi[0]).toContain('mancante');
    expect(separaBloccoCelle('```velia-celle\nnon json\n```').problemi[0]).toContain('non valido');
  });

  it('un valore presente con citazione verificabile diventa cella, con la citazione completa', () => {
    const { celle } = valutaCelle(
      {
        celle: [
          {
            colonna: 'col-a',
            esito: 'presente',
            valore: 'Franchigia 250 €',
            citazioni: [
              {
                file: 'tenant/documenti/polizza/polizza-rossi--doc-priv-x.md',
                pagina: 2,
                estratto: 'franchigia fissa di euro 250',
                articolo: '27',
              },
            ],
          },
          { colonna: 'col-b', esito: 'non-presente', nota: 'Il documento non tratta questo aspetto.', citazioni: [] },
        ],
      },
      colonne,
      PER_PATH,
    );
    expect(celle.get('col-a')).toMatchObject({
      stato: 'pronta',
      esito: 'presente',
      valore: 'Franchigia 250 €',
      citazioni: [
        {
          documentoId: 'doc-priv-x',
          documentoTitolo: 'Polizza Rossi',
          archivio: 'privato',
          posizione: { pagina: 2, articolo: '27' },
        },
      ],
    });
    expect(celle.get('col-b')).toEqual({
      stato: 'pronta',
      esito: 'non-presente',
      nota: 'Il documento non tratta questo aspetto.',
    });
  });

  it('senza fonte che regge - file inesistente, pagina oltre, INDICE - il valore si scarta (RF-C-12)', () => {
    const casi = [
      { file: 'tenant/documenti/polizza/inventato.md', pagina: 1 },
      { file: 'tenant/documenti/polizza/polizza-rossi--doc-priv-x.md', pagina: 99 },
      { file: 'tenant/documenti/INDICE.md', pagina: 1 },
    ];
    for (const c of casi) {
      const { celle, avvisi } = valutaCelle(
        {
          celle: [
            { colonna: 'col-a', esito: 'presente', valore: 'X', citazioni: [{ ...c, estratto: 'x' }] },
            { colonna: 'col-b', esito: 'non-determinabile', motivo: 'Ambiguo.', citazioni: [] },
          ],
        },
        colonne,
        PER_PATH,
      );
      expect(celle.get('col-a'), c.file).toEqual({
        stato: 'pronta',
        esito: 'non-determinabile',
        motivo: MOTIVO_SENZA_FONTE,
      });
      expect(avvisi.length).toBeGreaterThan(0);
      expect(celle.get('col-b')).toMatchObject({ esito: 'non-determinabile', motivo: 'Ambiguo.' });
    }
  });

  it('una colonna che il modello ha saltato non resta in attesa: è non determinabile', () => {
    const { celle } = valutaCelle({ celle: [] }, colonne, PER_PATH);
    expect(celle.get('col-a')).toEqual({
      stato: 'pronta',
      esito: 'non-determinabile',
      motivo: MOTIVO_SENZA_ESITO,
    });
  });

  it('il prompt della riga porta gli id esatti delle colonne e la guida del criterio', () => {
    const prompt = promptRigaEstrazione({
      path: 'tenant/documenti/polizza/polizza-rossi--doc-priv-x.md',
      titolo: 'Polizza Rossi',
      colonne: [
        { id: 'col-a', intestazione: 'Massimale RC', origine: 'predefinita', criterio: null, descrizione: 'Massimale per sinistro.' },
        { id: 'col-b', intestazione: 'Cristalli', origine: 'personalizzata', criterio: 'massimale cristalli' },
      ],
    });
    expect(prompt).toContain('[id: col-a] **Massimale RC** — Massimale per sinistro.');
    expect(prompt).toContain('[id: col-b] **Cristalli** — massimale cristalli');
  });
});

describe("l'esportazione: la tabella come Markdown", () => {
  const tabella: TabellaAnalisi = {
    id: 't1',
    titolo: 'Confronto',
    creataIl: '',
    aggiornataIl: '',
    autoreId: 'u1',
    condivisa: false,
    stato: 'in-generazione',
    colonne: [
      { id: 'c1', intestazione: 'Massimale', origine: 'predefinita' },
      { id: 'c2', intestazione: 'Franchigia', origine: 'predefinita' },
    ],
    righe: [
      {
        documentoId: 'd1',
        archivio: 'pubblico',
        etichetta: 'Generali - AUTOPIÙ',
        tipologia: 'dip',
        celle: {
          c1: {
            stato: 'pronta',
            esito: 'presente',
            valore: '6.450.000 € | per sinistro',
            citazioni: [
              {
                id: 'x',
                documentoId: 'd1',
                documentoTitolo: 'Condizioni AUTOPIÙ',
                archivio: 'pubblico',
                posizione: { pagina: 14, articolo: '12' },
                estratto: '…',
              },
            ],
          },
          c2: { stato: 'pronta', esito: 'non-presente' },
        },
      },
      {
        documentoId: 'd2',
        archivio: 'privato',
        etichetta: 'Preventivo Rossi',
        tipologia: 'preventivo',
        celle: {},
      },
    ],
  };

  it('celle su colonne vere, «-» per le celle in attesa, il | delle celle non rompe la tabella', () => {
    const testo = testoTabella(tabella);
    expect(testo).toContain('| Documento | Massimale | Franchigia |');
    expect(testo).toContain('| Generali - AUTOPIÙ | 6.450.000 € / per sinistro | Non presente |');
    expect(testo).toContain('| Preventivo Rossi | - | - |');
    expect(testoCella({ stato: 'pronta', esito: 'non-determinabile', motivo: 'x' })).toBe('Non determinabile');
  });

  it('le fonti in coda, nella forma del mock', () => {
    expect(fontiTabella(tabella)).toEqual([
      'Generali - AUTOPIÙ · Massimale: Condizioni AUTOPIÙ - art. 12, p. 14',
    ]);
  });
});

describe('le rotte prima del database', () => {
  const app = creaApp({ logger: false, verificaToken: verificaFinta });

  it('POST vuoto → 400 TABELLA_VUOTA; colonna senza criterio → 400 COLONNA_VUOTA; esporta senza template → 400', async () => {
    const vuota = await app.inject({ method: 'POST', url: '/api/tabelle', headers: autenticato, payload: {} });
    expect(vuota.statusCode).toBe(400);
    expect(vuota.json()).toMatchObject({ codice: 'TABELLA_VUOTA' });

    const colonna = await app.inject({
      method: 'POST',
      url: '/api/tabelle/00000000-0000-4000-8000-000000000001/colonne',
      headers: autenticato,
      payload: { intestazione: '  ' },
    });
    expect(colonna.statusCode).toBe(400);
    expect(colonna.json()).toMatchObject({ codice: 'COLONNA_VUOTA' });

    const esporta = await app.inject({
      method: 'POST',
      url: '/api/tabelle/00000000-0000-4000-8000-000000000001/esporta',
      headers: autenticato,
      payload: {},
    });
    expect(esporta.statusCode).toBe(400);
  });

  it('senza token → 401 su ogni rotta del dominio', async () => {
    for (const url of ['/api/tabelle', '/api/tabelle/criteri', '/api/tabelle/x']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(401);
    }
  });
});
