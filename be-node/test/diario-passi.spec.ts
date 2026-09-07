import { describe, expect, it } from 'vitest';

import { DiarioPassi } from '../src/worker/motore/diario-passi.js';

/** Un orologio che si muove quando glielo si dice: i test non aspettano. */
function orologio(partenza = Date.parse('2026-09-07T10:00:00.000Z')) {
  let adesso = partenza;
  return { ora: () => adesso, avanza: (ms: number) => (adesso += ms) };
}

describe('DiarioPassi', () => {
  it('tiene i passi nell’ordine in cui sono avvenuti', () => {
    const t = orologio();
    const diario = new DiarioPassi(t.ora);

    diario.apri('Consulto l’indice dell’archivio', 'Read');
    t.avanza(2500);
    diario.apri('Cerco «grandine» negli archivi', 'Grep');
    t.avanza(1000);
    diario.chiudi();

    expect(diario.elenco().map((p) => p.etichetta)).toEqual([
      'Consulto l’indice dell’archivio',
      'Cerco «grandine» negli archivi',
    ]);
    expect(diario.elenco().map((p) => p.strumento)).toEqual(['Read', 'Grep']);
  });

  it('la durata di un passo la scrive il passo successivo', () => {
    const t = orologio();
    const diario = new DiarioPassi(t.ora);

    diario.apri('Leggo «Nuova 4R»', 'Read');
    t.avanza(4200);

    /* Finché nessuno gli succede, il passo è in corso e la durata non c'è:
       una stima sarebbe peggio del campo vuoto. */
    expect(diario.elenco()[0]!.durataMs).toBeUndefined();

    diario.apri('Raccolgo le fonti della risposta');
    expect(diario.elenco()[0]!.durataMs).toBe(4200);
    expect(diario.elenco()[1]!.durataMs).toBeUndefined();
  });

  it('l’ultimo passo lo chiude la fine della risposta', () => {
    const t = orologio();
    const diario = new DiarioPassi(t.ora);

    diario.apri('Raccolgo le fonti della risposta');
    t.avanza(600);
    diario.chiudi();

    expect(diario.elenco()[0]!.durataMs).toBe(600);
  });

  it('chiudere due volte non allunga il passo già chiuso', () => {
    const t = orologio();
    const diario = new DiarioPassi(t.ora);

    diario.apri('Guardo quali documenti ci sono in archivio', 'Glob');
    t.avanza(300);
    diario.chiudi();
    t.avanza(10_000);
    diario.chiudi();

    expect(diario.elenco()[0]!.durataMs).toBe(300);
  });

  it('un passo senza strumento non porta il campo', () => {
    const diario = new DiarioPassi(orologio().ora);
    diario.apri('Cerco qualcosa da ricordare');

    /* Il front-end distingue «nessuno strumento» (il motore che racconta a
       parole sue) da uno strumento sconosciuto: la chiave non deve esserci. */
    expect(Object.keys(diario.elenco()[0]!)).toEqual(['etichetta', 'istante']);
  });

  it('non produce durate negative se l’orologio torna indietro', () => {
    const t = orologio();
    const diario = new DiarioPassi(t.ora);

    diario.apri('Leggo un documento', 'Read');
    t.avanza(-5000);
    diario.chiudi();

    expect(diario.elenco()[0]!.durataMs).toBe(0);
  });

  it('su una risposta senza passi resta vuoto', () => {
    const diario = new DiarioPassi();
    diario.chiudi();

    expect(diario.elenco()).toEqual([]);
  });
});
