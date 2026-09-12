import { describe, expect, it } from 'vitest';

import { schemaEsportazioneElaborata, type Citazione } from '../src/contratto/conversazioni.js';
import { trascriviConversazione } from '../src/generazione/filo.js';

/**
 * La conversazione intera come un documento solo (12/09/2026): quello che
 * copia, email, «Esporta come» e «Genera da modello» ricevono quando li si
 * chiede dalla barra sopra il composer invece che da sotto una risposta.
 */

const citazione = (documentoTitolo: string, pagina: number, articolo?: string): Citazione => ({
  id: `c-${documentoTitolo}-${pagina}`,
  documentoId: 'doc-1',
  documentoTitolo,
  archivio: 'pubblico',
  estratto: 'un passaggio',
  posizione: { pagina, ...(articolo && { articolo }) },
});

describe('la trascrizione del filo', () => {
  it('mette domande e risposte in fila, separate', () => {
    const { testo } = trascriviConversazione([
      { autore: 'utente', testo: 'Che massimale ha la AUTOPIÙ?' },
      { autore: 'assistente', testo: '6.450.000 € per sinistro.' },
      { autore: 'utente', testo: 'E la franchigia?' },
      { autore: 'assistente', testo: '250 €.' },
    ]);

    expect(testo).toBe(
      [
        '## Domanda\n\nChe massimale ha la AUTOPIÙ?',
        '## Risposta\n\n6.450.000 € per sinistro.',
        '## Domanda\n\nE la franchigia?',
        '## Risposta\n\n250 €.',
      ].join('\n\n---\n\n'),
    );
  });

  it('unisce le fonti di tutte le risposte, senza doppioni', () => {
    const { fonti } = trascriviConversazione([
      { autore: 'utente', testo: 'Prima domanda' },
      { autore: 'assistente', testo: 'Prima risposta', citazioni: [citazione('AUTOPIÙ', 12, '7')] },
      { autore: 'utente', testo: 'Seconda domanda' },
      {
        autore: 'assistente',
        testo: 'Seconda risposta',
        /* La stessa pagina citata due volte resta una riga sola. */
        citazioni: [citazione('AUTOPIÙ', 12, '7'), citazione('Km&Servizi', 3)],
      },
    ]);

    expect(fonti).toEqual(['AUTOPIÙ - art. 7, p. 12', 'Km&Servizi - p. 3']);
  });

  it('salta i messaggi vuoti e le citazioni assenti', () => {
    const { testo, fonti } = trascriviConversazione([
      { autore: 'utente', testo: '   ' },
      { autore: 'assistente', testo: 'Una risposta', citazioni: null },
    ]);

    expect(testo).toBe('## Risposta\n\nUna risposta');
    expect(fonti).toEqual([]);
  });

  it('su una conversazione senza niente da dire torna vuota', () => {
    expect(trascriviConversazione([]).testo).toBe('');
  });
});

describe('l’ambito di «Genera da modello»', () => {
  it('accetta il filo intero, senza un messaggio da cui partire', () => {
    expect(
      schemaEsportazioneElaborata.parse({ modelloId: 'tpl-1', ambito: 'conversazione' }),
    ).toMatchObject({ ambito: 'conversazione' });
  });

  it('resta facoltativo: senza, si lavora sulla risposta come sempre', () => {
    expect(schemaEsportazioneElaborata.parse({ modelloId: 'tpl-1', messaggioId: 'm-1' }).ambito).toBe(
      undefined,
    );
  });

  it('non accetta un ambito inventato', () => {
    expect(
      schemaEsportazioneElaborata.safeParse({ modelloId: 'tpl-1', ambito: 'tutto' }).success,
    ).toBe(false);
  });
});
