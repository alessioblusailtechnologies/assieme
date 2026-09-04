import { describe, expect, it } from 'vitest';

import {
  costruisciAlbero,
  eDiscendente,
  indicizza,
  percorsoDi,
  percorsoSlug,
  slugCartella,
  type RigaCartella,
} from '../src/archivio/albero.js';
import { ETICHETTA_TIPOLOGIA } from '../src/archivio/collocazione.js';
import { deduciRuolo, improntaAlbero, rendiTesto } from '../src/archivio/convenzione.js';
import {
  cartelleDelPercorso,
  eZip,
  espandiZip,
  normalizzaPercorso,
} from '../src/api/archivio-privato/zip.js';
import { percorsoNellaWorkspace } from '../src/worker/motore/workspace.js';

/**
 * Fase 10 senza database: l'albero, la convenzione osservata e i percorsi
 * dell'importazione. Sono le parti dove un errore non si vede subito —
 * un albero che si taglia un ramo, una convenzione che elenca tremila
 * clienti — e dove i test valgono più che altrove.
 */

function cartella(
  id: string,
  nome: string,
  parent: string | null = null,
  extra: Partial<RigaCartella> = {},
): RigaCartella {
  return {
    id,
    parent_id: parent,
    nome,
    slug: slugCartella(nome),
    descrizione: null,
    descrizione_da_utente: false,
    ruolo_figli: null,
    cliente_id: null,
    ...extra,
  };
}

const VOCABOLARI = {
  compagnie: new Set(['unipolsai', 'allianz', 'generali']),
  rami: new Set(['auto', 'casa', 'infortuni']),
};

describe('slug delle cartelle', () => {
  it('rende uguali le scritture che un utente considera uguali', () => {
    expect(slugCartella('Rossi Mario')).toBe('rossi-mario');
    expect(slugCartella('rossi  mario')).toBe('rossi-mario');
    expect(slugCartella('Società Città S.r.l.')).toBe('societa-citta-s-r-l');
  });

  it('non produce mai una chiave vuota', () => {
    expect(slugCartella('...')).toBe('cartella');
  });
});

describe('albero', () => {
  const righe = [
    cartella('c1', 'Clienti', null, { ruolo_figli: 'clienti' }),
    cartella('c2', 'Rossi Mario', 'c1'),
    cartella('c3', 'Auto', 'c2'),
    cartella('u1', 'Utils', null, { descrizione: 'moduli in bianco e listini' }),
  ];

  it('scrive il percorso leggibile e quello a slug', () => {
    const per = indicizza(righe);
    expect(percorsoDi('c3', per)).toBe('Clienti/Rossi Mario/Auto');
    expect(percorsoSlug('c3', per)).toBe('clienti/rossi-mario/auto');
  });

  it('somma i conteggi verso l’alto: il numero sull’albero è quello del sottoalbero', () => {
    const albero = costruisciAlbero(righe, new Map([['c3', 4]]));
    const clienti = albero.find((c) => c.id === 'c1')!;
    expect(clienti.documenti).toBe(0);
    expect(clienti.documentiTotali).toBe(4);
    expect(clienti.figli[0]!.figli[0]!.percorso).toBe('Clienti/Rossi Mario/Auto');
  });

  it('riconosce la discendenza, che è ciò che impedisce di perdere un ramo', () => {
    const per = indicizza(righe);
    expect(eDiscendente('c3', 'c1', per)).toBe(true);
    expect(eDiscendente('c1', 'c3', per)).toBe(false);
    // Una cartella è discendente di sé stessa: spostarla in sé va rifiutato.
    expect(eDiscendente('c2', 'c2', per)).toBe(true);
    expect(eDiscendente('u1', 'c1', per)).toBe(false);
  });
});

describe('deduzione della forma', () => {
  it('vede gli anni', () => {
    expect(deduciRuolo(['2024', '2025', '2026'], VOCABOLARI)).toEqual({ ruolo: 'anni', quota: 1 });
  });

  it('vede compagnie e rami dalla tassonomia', () => {
    expect(deduciRuolo(['UnipolSai', 'Allianz', 'Generali'], VOCABOLARI)?.ruolo).toBe('compagnie');
    expect(deduciRuolo(['Auto', 'Casa', 'Infortuni'], VOCABOLARI)?.ruolo).toBe('rami');
  });

  it('vede le tipologie coi nomi che si usano in agenzia', () => {
    expect(deduciRuolo(['Preventivi', 'Polizze', 'Sinistri'], VOCABOLARI)?.ruolo).toBe('tipologie');
  });

  it('chiama clienti un livello largo di nomi propri, e solo se è largo', () => {
    const clienti = ['Rossi Mario', 'Bianchi Anna', 'Verdi Srl', 'Neri Luca', 'Gialli Spa'];
    expect(deduciRuolo(clienti, VOCABOLARI)?.ruolo).toBe('clienti');
    // Tre nomi non sono una convenzione, sono tre nomi.
    expect(deduciRuolo(clienti.slice(0, 3), VOCABOLARI)).toBeNull();
  });

  it('crede al nome del padre, e gli basta un figlio solo', () => {
    /* Il caso vero del 04/09: un'agenzia con `Clienti/` e dentro una sola
       cartella. Guardando i figli non c'erano prove — e finché non ce
       n'erano cinque non veniva collocato niente, per sempre. Ma il padre si
       chiama «Clienti»: lo sta dichiarando. */
    expect(deduciRuolo(['De Vincentis Alessio'], VOCABOLARI, 'Clienti')?.ruolo).toBe('clienti');
    expect(deduciRuolo(['De Vincentis Alessio', 'IN'], VOCABOLARI, 'Clienti')?.ruolo).toBe('clienti');
    expect(deduciRuolo(['UnipolSai'], VOCABOLARI, 'Compagnie')?.ruolo).toBe('compagnie');
    expect(deduciRuolo(['2026'], VOCABOLARI, 'Annualità')?.ruolo).toBe('anni');

    // Un nome che non dichiara niente non aggiunge niente.
    expect(deduciRuolo(['De Vincentis Alessio'], VOCABOLARI, 'Utils')).toBeNull();
    // E una cartella senza figli non si etichetta comunque.
    expect(deduciRuolo([], VOCABOLARI, 'Clienti')).toBeNull();
  });

  it('a un segnale forte bastano due prove, a uno debole non bastano mai', () => {
    // Due cartelle 2025 e 2026 sono anni, non c'è altra lettura possibile.
    expect(deduciRuolo(['2025', '2026'], VOCABOLARI)?.ruolo).toBe('anni');
    // Un figlio solo non è una convenzione, è un figlio solo.
    expect(deduciRuolo(['2026'], VOCABOLARI)).toBeNull();
  });
});

describe('testo della convenzione', () => {
  const righe = [
    cartella('c1', 'Clienti', null, { ruolo_figli: 'clienti' }),
    cartella('c2', 'Rossi Mario', 'c1', { ruolo_figli: 'anni' }),
    cartella('c3', 'Bianchi Anna', 'c1', { ruolo_figli: 'anni' }),
    cartella('c4', '2026', 'c2'),
    cartella('u1', 'Utils', null, { descrizione: 'moduli in bianco e listini' }),
  ];
  const figliDi = new Map<string | null, RigaCartella[]>();
  for (const r of righe) {
    const elenco = figliDi.get(r.parent_id);
    if (elenco) elenco.push(r);
    else figliDi.set(r.parent_id, [r]);
  }
  const testo = rendiTesto(righe, figliDi);

  it('descrive la forma dei livelli', () => {
    expect(testo).toContain('`Clienti/`');
    expect(testo).toContain('**clienti**');
    expect(testo).toContain('dentro ogni cliente → **anni**');
  });

  it('NON elenca le istanze: è il vincolo che la tiene corta', () => {
    expect(testo).not.toContain('Rossi Mario');
    expect(testo).not.toContain('Bianchi Anna');
  });

  it('porta la descrizione delle cartelle libere, che è ciò che le rende scegliibili', () => {
    expect(testo).toContain('`Utils/` — moduli in bianco e listini');
  });

  it('dice che l’archivio è vuoto invece di fingere una struttura', () => {
    expect(rendiTesto([], new Map())).toContain('non ha ancora cartelle');
  });
});

describe('impronta dell’albero', () => {
  it('non cambia se cambia solo l’ordine delle righe', () => {
    const a = [cartella('c1', 'Clienti'), cartella('c2', 'Utils')];
    expect(improntaAlbero(a)).toBe(improntaAlbero([...a].reverse()));
  });

  it('cambia se cambia la forma', () => {
    const a = [cartella('c1', 'Clienti')];
    const b = [cartella('c1', 'Clienti', null, { ruolo_figli: 'clienti' })];
    expect(improntaAlbero(a)).not.toBe(improntaAlbero(b));
  });
});

describe('percorsi dell’importazione', () => {
  it('ripulisce i percorsi altrui: niente risalite, niente cartelle di servizio', () => {
    expect(normalizzaPercorso('Clienti/Rossi Mario/polizza.pdf')).toBe(
      'Clienti/Rossi Mario/polizza.pdf',
    );
    expect(normalizzaPercorso('/../../etc/passwd')).toBe('etc/passwd');
    expect(normalizzaPercorso('Clienti\\Rossi\\p.pdf')).toBe('Clienti/Rossi/p.pdf');
    expect(normalizzaPercorso('__MACOSX/._x.pdf')).toBeNull();
    expect(normalizzaPercorso('   ')).toBeNull();
  });

  it('separa le cartelle dal nome del file', () => {
    expect(cartelleDelPercorso('Clienti/Rossi Mario/polizza.pdf')).toEqual([
      'Clienti',
      'Rossi Mario',
    ]);
    expect(cartelleDelPercorso('polizza.pdf')).toEqual([]);
    expect(cartelleDelPercorso(undefined)).toEqual([]);
  });

  it('non scambia un docx per uno zip: la firma da sola non basta', () => {
    const pk = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
    expect(eZip({ nome: 'archivio.zip', mimetype: '', contenuto: pk, troncato: false })).toBe(true);
    expect(eZip({ nome: 'lettera.docx', mimetype: '', contenuto: pk, troncato: false })).toBe(false);
  });

  it('uno zip illeggibile non fa esplodere niente: torna vuoto', () => {
    expect(
      espandiZip({
        nome: 'rotto.zip',
        mimetype: '',
        contenuto: Buffer.from('non sono uno zip'),
        troncato: false,
      }),
    ).toEqual([]);
  });
});

describe('percorso nella workspace', () => {
  const cartelle = indicizza([
    cartella('c1', 'Clienti', null, { ruolo_figli: 'clienti' }),
    cartella('c2', 'Rossi Mario', 'c1'),
  ]);
  const documento = {
    id: 'doc-priv-1',
    archivio: 'privato' as const,
    titolo: 'Polizza RC Auto',
    tipologia: 'polizza',
    path_md: 'tenant/t/documenti/doc-priv-1.md',
  };

  it('segue l’albero vero dell’agenzia', () => {
    expect(percorsoNellaWorkspace({ ...documento, cartella_id: 'c2' }, cartelle)).toBe(
      'tenant/documenti/clienti/rossi-mario/polizza-rc-auto--doc-priv-1.md',
    );
  });

  it('usa la stessa parola dell’interfaccia per il non collocato', () => {
    expect(percorsoNellaWorkspace({ ...documento, cartella_id: null }, cartelle)).toBe(
      'tenant/documenti/da-sistemare/polizza-rc-auto--doc-priv-1.md',
    );
  });

  it('ripiega sulla tipologia finché il tenant non ha cartelle', () => {
    expect(percorsoNellaWorkspace(documento)).toBe(
      'tenant/documenti/polizza/polizza-rc-auto--doc-priv-1.md',
    );
  });
});

describe('etichette delle tipologie', () => {
  it('sono i nomi che una cartella ha davvero in agenzia', () => {
    expect(ETICHETTA_TIPOLOGIA.preventivo).toBe('Preventivi');
    expect(ETICHETTA_TIPOLOGIA.polizza).toBe('Polizze');
    expect(ETICHETTA_TIPOLOGIA.altro).toBe('Varie');
  });
});
