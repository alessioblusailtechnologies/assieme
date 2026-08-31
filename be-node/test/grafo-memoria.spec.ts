import { describe, expect, it } from 'vitest';

import type { Citazione } from '../src/contratto/conversazioni.js';
import type { Ricordo } from '../src/contratto/memoria.js';
import { accorcia, costruisciGrafoMemoria } from '../src/api/ricordi/grafo.js';

/**
 * Il costruttore del globo è una funzione pura: qui si fissano le regole di
 * composizione — chi entra, chi lega, come si accumulano i pesi — senza
 * database. La rotta è provata in `integrazione-memoria.spec.ts`.
 */

const ricordo = (parziale: Partial<Ricordo>): Ricordo => ({
  id: 'ric-1',
  testo: 'Un ricordo qualsiasi.',
  ambito: 'tenant',
  categoria: 'prassi',
  creatoIl: '2026-08-01T10:00:00Z',
  aggiornatoIl: '2026-08-01T10:00:00Z',
  attivo: true,
  ...parziale,
});

const citazione = (parziale: Partial<Citazione>): Citazione => ({
  id: 'cit-1',
  documentoId: 'doc-1',
  documentoTitolo: 'DIP Aggiuntivo — Prodotto',
  archivio: 'pubblico',
  posizione: { pagina: 8 },
  estratto: 'Il massimale per sinistro è pari a euro 6.450.000.',
  ...parziale,
});

describe('costruisciGrafoMemoria', () => {
  it('un ricordo è sempre un nodo; il legame esiste solo verso conversazioni visibili', () => {
    const grafo = costruisciGrafoMemoria(
      [
        ricordo({ id: 'ric-1', origineConversazioneId: 'cnv-visibile' }),
        ricordo({ id: 'ric-2', origineConversazioneId: 'cnv-di-un-collega' }),
        ricordo({ id: 'ric-3' }),
      ],
      [{ id: 'cnv-visibile', titolo: 'Confronto flotte' }],
      [],
      [],
    );

    expect(grafo.nodi.filter((n) => n.tipo === 'ricordo')).toHaveLength(3);
    expect(grafo.nodi.filter((n) => n.tipo === 'conversazione').map((n) => n.id)).toEqual([
      'cnv-visibile',
    ]);
    expect(grafo.legami).toEqual([{ da: 'ricordo:ric-1', a: 'conversazione:cnv-visibile', peso: 1 }]);
  });

  it('una conversazione senza citazioni né ricordi non ingombra il globo', () => {
    const grafo = costruisciGrafoMemoria(
      [],
      [{ id: 'cnv-muta', titolo: 'Chiacchiere' }],
      [],
      [],
    );
    expect(grafo.nodi).toHaveLength(0);
    expect(grafo.legami).toHaveLength(0);
  });

  it('il punto è documento+pagina: le citazioni sulla stessa pagina si accumulano e vince quella con l’articolo', () => {
    const grafo = costruisciGrafoMemoria(
      [],
      [{ id: 'cnv-1', titolo: 'Franchigie' }],
      [
        {
          conversazioneId: 'cnv-1',
          citazioni: [
            citazione({ id: 'cit-1', posizione: { pagina: 8, sezione: 'Responsabilità civile' } }),
            citazione({ id: 'cit-2', posizione: { pagina: 8, articolo: '12' } }),
            citazione({ id: 'cit-3', posizione: { pagina: 41 } }),
          ],
        },
      ],
      [],
    );

    const punti = grafo.nodi.filter((n) => n.tipo === 'punto');
    expect(punti).toHaveLength(2);

    const pagina8 = punti.find((n) => n.chiave === 'punto:doc-1@8')!;
    expect(pagina8.peso).toBe(2);
    expect(pagina8.etichetta).toBe('art. 12');
    expect(pagina8.citazione?.id).toBe('cit-2');
    expect(punti.find((n) => n.chiave === 'punto:doc-1@41')?.etichetta).toBe('pag. 41');

    // I set reali portano «Articolo 4 — …» già nel campo: mai «art. Articolo 4».
    const conPrefisso = costruisciGrafoMemoria(
      [],
      [{ id: 'cnv-1', titolo: 'Franchigie' }],
      [
        {
          conversazioneId: 'cnv-1',
          citazioni: [
            citazione({ posizione: { pagina: 41, articolo: 'Articolo 4 – Franchigia contrattuale' } }),
          ],
        },
      ],
      [],
    );
    expect(conPrefisso.nodi.find((n) => n.tipo === 'punto')?.etichetta).toBe(
      'Articolo 4 – Franchigia contrattuale',
    );

    // Il documento pesa quanto le citazioni che lo toccano; la conversazione anche.
    expect(grafo.nodi.find((n) => n.chiave === 'documento:doc-1')?.peso).toBe(3);
    expect(grafo.nodi.find((n) => n.chiave === 'conversazione:cnv-1')?.peso).toBe(3);
    expect(grafo.legami).toContainEqual({ da: 'conversazione:cnv-1', a: 'punto:doc-1@8', peso: 2 });
    expect(grafo.legami).toContainEqual({ da: 'punto:doc-1@8', a: 'documento:doc-1', peso: 2 });
  });

  it('la riga d’archivio porta titolo aggiornato e compagnia; senza riga il documento vive di citazione', () => {
    const grafo = costruisciGrafoMemoria(
      [],
      [{ id: 'cnv-1', titolo: 'Confronto' }],
      [
        {
          conversazioneId: 'cnv-1',
          citazioni: [
            citazione({ id: 'cit-1', documentoId: 'doc-in-archivio' }),
            citazione({
              id: 'cit-2',
              documentoId: 'doc-sparito',
              documentoTitolo: 'Preventivo di un cliente',
              archivio: 'privato',
              posizione: { pagina: 2 },
            }),
          ],
        },
      ],
      [
        {
          id: 'doc-in-archivio',
          titolo: 'DIP Aggiuntivo — Titolo d’archivio',
          compagniaId: 'cmp-generali',
          compagniaNome: 'Generali Italia',
        },
      ],
    );

    const inArchivio = grafo.nodi.find((n) => n.chiave === 'documento:doc-in-archivio')!;
    expect(inArchivio.etichetta).toBe('DIP Aggiuntivo — Titolo d’archivio');
    const sparito = grafo.nodi.find((n) => n.chiave === 'documento:doc-sparito')!;
    expect(sparito.etichetta).toBe('Preventivo di un cliente');
    expect(sparito.archivio).toBe('privato');

    const compagnie = grafo.nodi.filter((n) => n.tipo === 'compagnia');
    expect(compagnie).toHaveLength(1);
    expect(compagnie[0]).toMatchObject({ etichetta: 'Generali Italia', peso: 1 });
    expect(grafo.legami).toContainEqual({
      da: 'documento:doc-in-archivio',
      a: 'compagnia:cmp-generali',
      peso: 1,
    });
    // Il documento senza compagnia non genera legami appesi.
    expect(grafo.legami.some((l) => l.da === 'documento:doc-sparito')).toBe(false);
  });

  it('la compagnia pesa i documenti distinti, non le citazioni', () => {
    const grafo = costruisciGrafoMemoria(
      [],
      [{ id: 'cnv-1', titolo: 'Confronto' }],
      [
        {
          conversazioneId: 'cnv-1',
          citazioni: [
            citazione({ id: 'cit-1', documentoId: 'doc-a' }),
            citazione({ id: 'cit-2', documentoId: 'doc-a', posizione: { pagina: 9 } }),
            citazione({ id: 'cit-3', documentoId: 'doc-b' }),
          ],
        },
      ],
      [
        { id: 'doc-a', titolo: 'DIP', compagniaId: 'cmp-1', compagniaNome: 'Compagnia Uno' },
        { id: 'doc-b', titolo: 'Condizioni', compagniaId: 'cmp-1', compagniaNome: 'Compagnia Uno' },
      ],
    );
    expect(grafo.nodi.find((n) => n.tipo === 'compagnia')?.peso).toBe(2);
  });

  it('il catalogo tesse la trama: ramo → compagnia → prodotto → documento, coi pesi da conteggio', () => {
    const catalogo = [
      { id: 'doc-a-dip', titolo: 'DIP — Alfa', prodotto: 'Alfa', compagniaId: 'cmp-1', compagniaNome: 'Compagnia Uno', ramoId: 'ram-auto', ramoNome: 'RC Auto' },
      { id: 'doc-a-cond', titolo: 'Condizioni — Alfa', prodotto: 'Alfa', compagniaId: 'cmp-1', compagniaNome: 'Compagnia Uno', ramoId: 'ram-auto', ramoNome: 'RC Auto' },
      { id: 'doc-b-dip', titolo: 'DIP — Beta', prodotto: 'Beta', compagniaId: 'cmp-2', compagniaNome: 'Compagnia Due', ramoId: 'ram-auto', ramoNome: 'RC Auto' },
    ];
    const grafo = costruisciGrafoMemoria([], [], [], [], catalogo);

    // 1 ramo + 2 compagnie + 2 prodotti + 3 documenti.
    expect(grafo.nodi).toHaveLength(8);
    expect(grafo.nodi.find((n) => n.tipo === 'ramo')).toMatchObject({ etichetta: 'RC Auto', peso: 2 });
    expect(grafo.nodi.find((n) => n.chiave === 'prodotto:cmp-1:Alfa')?.peso).toBe(2);
    expect(grafo.legami).toContainEqual({ da: 'documento:doc-a-dip', a: 'prodotto:cmp-1:Alfa', peso: 1 });
    expect(grafo.legami).toContainEqual({ da: 'prodotto:cmp-1:Alfa', a: 'compagnia:cmp-1', peso: 1 });
    expect(grafo.legami).toContainEqual({ da: 'prodotto:cmp-1:Alfa', a: 'ramo:ram-auto', peso: 1 });
  });

  it('un documento del catalogo citato accumula peso, ma resta agganciato solo al suo prodotto', () => {
    const catalogo = [
      { id: 'doc-a', titolo: 'DIP — Alfa', prodotto: 'Alfa', compagniaId: 'cmp-1', compagniaNome: 'Compagnia Uno', ramoId: 'ram-auto', ramoNome: 'RC Auto' },
    ];
    const grafo = costruisciGrafoMemoria(
      [],
      [{ id: 'cnv-1', titolo: 'Confronto' }],
      [{ conversazioneId: 'cnv-1', citazioni: [citazione({ documentoId: 'doc-a' })] }],
      [{ id: 'doc-a', titolo: 'DIP — Alfa', compagniaId: 'cmp-1', compagniaNome: 'Compagnia Uno' }],
      catalogo,
    );

    expect(grafo.nodi.find((n) => n.chiave === 'documento:doc-a')?.peso).toBe(2); // catalogo + citazione
    // Niente legame diretto documento→compagnia: la strada passa dal prodotto.
    expect(grafo.legami.some((l) => l.da === 'documento:doc-a' && l.a === 'compagnia:cmp-1')).toBe(false);
  });

  it('i nodi escono dal più pesante, con ordine stabile a parità di peso', () => {
    const grafo = costruisciGrafoMemoria(
      [ricordo({ id: 'ric-1', origineConversazioneId: 'cnv-1' })],
      [{ id: 'cnv-1', titolo: 'Origine' }],
      [
        {
          conversazioneId: 'cnv-1',
          citazioni: [citazione({ id: 'cit-1' }), citazione({ id: 'cit-2', posizione: { pagina: 9 } })],
        },
      ],
      [],
    );
    expect(grafo.nodi[0]?.tipo).toBe('conversazione'); // 1 ricordo + 2 citazioni = 3
    const pesi = grafo.nodi.map((n) => n.peso);
    expect(pesi).toEqual([...pesi].sort((a, b) => b - a));
  });
});

describe('accorcia', () => {
  it('taglia a parola intera e segnala il taglio', () => {
    const lungo =
      'Per i clienti con più veicoli l’agenzia privilegia le franchigie fisse rispetto agli scoperti percentuali.';
    const corto = accorcia(lungo);
    expect(corto.length).toBeLessThanOrEqual(65);
    expect(corto.endsWith('…')).toBe(true);
    expect(corto).not.toMatch(/\s…$/);
  });

  it('un testo breve resta intatto', () => {
    expect(accorcia('Franchigie fisse')).toBe('Franchigie fisse');
  });
});
