import { describe, expect, it } from 'vitest';

import { etichetteDaAggiungere, etichetteProposte } from '../src/archivio/etichette.js';

/**
 * Le etichette che l'ingestion propone da sé (`PIANO-CLIENTI.md`, Fase 3).
 *
 * Qui si prova la cosa che le rende utili: che il vocabolario resti
 * **piccolo e prevedibile**. Un'etichetta serve a filtrare, e si filtra solo
 * su parole che ritornano identiche — quindi contano più le cose che NON
 * diventano etichetta (i contenitori, il nome del cliente, le numerazioni di
 * cartelle) di quelle che lo diventano.
 */
describe('etichette proposte dall’ingestion', () => {
  it('prende compagnia, ramo e l’annualità della decorrenza', () => {
    expect(
      etichetteProposte({
        compagnia: 'Allianz',
        ramo: 'RC Auto',
        decorrenza: '2026-03-01',
      }),
    ).toEqual(['Allianz', 'RC Auto', '2026']);
  });

  it('l’anno è quello della decorrenza, non c’è se la decorrenza non c’è', () => {
    /* In agenzia «2026» è l'annualità: l'anno in cui abbiamo caricato il PDF
       è un fatto su di noi, non sul documento. */
    expect(etichetteProposte({ compagnia: 'Generali' })).toEqual(['Generali']);
    expect(etichetteProposte({ decorrenza: 'chissà' })).toEqual([]);
  });

  it('il percorso di origine diventa etichette, il nome del file no', () => {
    expect(
      etichetteProposte({
        percorsoOrigine: 'Clienti/Rossi Mario/Sinistri/perizia.pdf',
        clienteNome: 'Rossi Mario',
      }),
    ).toEqual(['Sinistri']);
  });

  it('scarta i contenitori, il cliente e le numerazioni di cartelle', () => {
    /* «Clienti» vale per tutti i documenti dell'archivio: come faccetta non
       distingue niente. «Rossi Mario» è già un'entità sua, e ripeterlo
       sarebbe la stessa informazione due volte. */
    expect(
      etichetteProposte({
        percorsoOrigine: 'CLIENTI/rossi mario/001/Polizze/doc.pdf',
        clienteNome: 'Rossi Mario',
      }),
    ).toEqual([]);
  });

  it('un anno nel percorso resta, una numerazione no', () => {
    expect(etichetteProposte({ percorsoOrigine: 'Archivio/2025/x.pdf' })).toEqual(['2025']);
    expect(etichetteProposte({ percorsoOrigine: 'Archivio/12/x.pdf' })).toEqual([]);
  });

  it('non ripete la stessa etichetta con un altro accento o un’altra maiuscola', () => {
    expect(
      etichetteProposte({
        compagnia: 'Unipol',
        percorsoOrigine: 'UNIPOL/Società/polizza.pdf',
      }),
    ).toEqual(['Unipol', 'Società']);
  });

  it('si ferma a sei: oltre è rumore, non classificazione', () => {
    const tante = etichetteProposte({
      compagnia: 'Allianz',
      ramo: 'RC Auto',
      decorrenza: '2026-01-01',
      percorsoOrigine: 'Uno/Due/Tre/Quattro/Cinque/doc.pdf',
    });
    expect(tante).toHaveLength(6);
  });

  it('aggiunge solo ciò che manca, e non toglie mai niente', () => {
    /* Quello che l'utente ha scritto non si tocca: toglierlo vorrebbe dire
       che il sistema sa meglio di lui come si chiama il suo lavoro. */
    expect(etichetteDaAggiungere(['allianz', 'da rinnovare'], ['Allianz', '2026'])).toEqual(['2026']);
    expect(etichetteDaAggiungere(['Allianz'], ['Allianz'])).toEqual([]);
  });
});
