import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { descriviRichiestaPiano, ripulisciPiano, schemaPianoGrezzo } from '../src/api/agenti/interprete.js';
import { bloccoConferma } from '../src/api/agenti/piano.js';
import {
  riferimentiNellaRichiesta,
  schemaModificheAgente,
  schemaNuovoAgente,
  schemaPianificazione,
  scomponiChiaveSet,
  testoLeggibile,
  type AgentePredefinito,
  type PianoAgente,
} from '../src/contratto/agenti.js';
import { leggiDatoDiPiattaforma } from '../src/dati.js';
import { destinatariDelPiano, messaggioDellEsecuzione } from '../src/worker/agenti/gestore.js';

/**
 * Il contratto degli agenti senza database (14/09/2026): la richiesta coi
 * riferimenti al loro posto, il piano che si conferma solo coi destinatari
 * risolti, il prompt dell'esecuzione e le risposte delle rotte prima del db.
 */

const verificaFinta: NonNullable<OpzioniApp['verificaToken']> = () =>
  Promise.resolve({
    sub: '00000000-0000-4000-8000-00000000000a',
    app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'operatore' },
  });

const autenticato = { authorization: 'Bearer token-di-prova' };

const PIANO: PianoAgente = {
  obiettivo: 'Sapere chi ha una polizza in scadenza',
  passi: [{ tipo: 'cerca', titolo: 'Cerca le polizze del cliente' }],
  letture: [],
  file: [],
  email: [],
  dubbi: [],
};

describe('schemi del contratto', () => {
  it('un agente pretende un nome e la richiesta; i campi di prima si scartano', () => {
    expect(schemaNuovoAgente.safeParse({ nome: 'X', richiesta: '   ' }).success).toBe(false);
    const ok = schemaNuovoAgente.parse({
      nome: 'Verifica',
      richiesta: 'Confronta @[documento:d1] con @[prodotto:cmp:Km:ed-7].',
      istruzioni: 'vecchie',
      fonti: [],
    });
    expect(ok).toEqual({ nome: 'Verifica', richiesta: 'Confronta @[documento:d1] con @[prodotto:cmp:Km:ed-7].' });
  });

  it('la pianificazione valida l’orario e completa il giorno mancante', () => {
    expect(schemaPianificazione.safeParse({ frequenza: 'giornaliera', orario: '25:00' }).success).toBe(false);
    expect(schemaPianificazione.parse({ frequenza: 'settimanale', orario: '08:00' }).giornoSettimana).toBe(1);
    expect(schemaPianificazione.parse({ frequenza: 'mensile', orario: '07:30', giornoMese: 15 }).giornoMese).toBe(15);
  });

  it('il PATCH ammette null per togliere la pianificazione; il formato non c’è più e si scarta', () => {
    const m = schemaModificheAgente.parse({ pianificazione: null, formatoOutput: 'tabella', attivo: false });
    expect(m).toEqual({ pianificazione: null, attivo: false });
  });
});

describe('i riferimenti nella richiesta', () => {
  const testo =
    'Confronta @[documento:d1] con @[prodotto:cmp-unipol:Km&Servizi:ed-7] e scrivi a @[cliente:c1]; poi rileggi @[documento:d1].';

  it('si leggono in ordine, senza doppioni, con la chiave del set intera', () => {
    expect(riferimentiNellaRichiesta(testo)).toEqual([
      { tipo: 'documento', chiave: 'd1' },
      { tipo: 'prodotto', chiave: 'cmp-unipol:Km&Servizi:ed-7' },
      { tipo: 'cliente', chiave: 'c1' },
    ]);
  });

  it('si rendono leggibili, col marcatore quando serve al modello, e dicono quando mancano', () => {
    const riferimenti = [
      { tipo: 'documento', chiave: 'd1', titolo: 'Polizza Rossi' },
      { tipo: 'cliente', chiave: 'c1', titolo: 'Rossi Mario' },
    ];
    expect(testoLeggibile(testo, riferimenti)).toBe(
      'Confronta «Polizza Rossi» con «riferimento non più disponibile» e scrivi a «Rossi Mario»; poi rileggi «Polizza Rossi».',
    );
    expect(testoLeggibile('Scrivi a @[cliente:c1].', riferimenti, { marcatori: true })).toBe(
      'Scrivi a «Rossi Mario» @[cliente:c1].',
    );
  });

  it('la chiave di un set si scompone anche se il prodotto ha i due punti', () => {
    expect(scomponiChiaveSet('cmp-a:Casa: la tua polizza:ed-3')).toEqual({
      compagniaId: 'cmp-a',
      prodotto: 'Casa: la tua polizza',
      edizioneId: 'ed-3',
    });
    expect(scomponiChiaveSet('senza-parti')).toBeUndefined();
  });
});

describe('il piano', () => {
  it('si conferma solo se ogni destinatario è risolto, e dice quale manca', () => {
    expect(bloccoConferma(PIANO)).toBeUndefined();
    expect(
      bloccoConferma({
        ...PIANO,
        email: [
          { destinatario: { tipo: 'utente', id: 'u1', nome: 'Marta Ferrero', a: 'm@esempio.it' }, contenuto: 'c', allegati: [] },
        ],
      }),
    ).toBeUndefined();
    const bloccato = bloccoConferma({
      ...PIANO,
      email: [
        {
          destinatario: { tipo: 'non-risolto', richiesto: 'Bianchi', motivo: '«Bianchi» non è in anagrafica.' },
          contenuto: 'c',
          allegati: [],
        },
      ],
    });
    expect(bloccato).toContain('«Bianchi»');
    expect(bloccato).toContain('non è in anagrafica');
  });

  it('lo schema del modello accetta il minimo e riempie le liste; i trattini lunghi se ne vanno', () => {
    const grezzo = schemaPianoGrezzo.parse({
      obiettivo: 'Sapere le scadenze — ogni lunedì',
      passi: [{ tipo: 'cerca', titolo: 'Cerca i clienti' }],
    });
    expect(grezzo.email).toEqual([]);
    expect(ripulisciPiano(grezzo).obiettivo).toBe('Sapere le scadenze - ogni lunedì');
    expect(schemaPianoGrezzo.safeParse({ obiettivo: 'x', passi: [] }).success).toBe(false);
  });

  it('il messaggio per il modello porta la richiesta, quando corre e la legenda dei riferimenti', () => {
    const messaggio = descriviRichiestaPiano({
      agenzia: 'Meridiana',
      nome: 'Scadenze',
      richiesta: 'Scrivi a «Rossi Mario» @[cliente:c1].',
      riferimenti: [{ tipo: 'cliente', chiave: 'c1', titolo: 'Rossi Mario' }],
      quando: 'ogni lunedì alle 08:00',
    });
    expect(messaggio).toContain('Quando corre: ogni lunedì alle 08:00');
    expect(messaggio).toContain('- @[cliente:c1] cliente «Rossi Mario»');
    expect(descriviRichiestaPiano({ agenzia: 'A', nome: 'B', richiesta: 'C', riferimenti: [] })).toContain(
      'solo quando qualcuno lo avvia',
    );
  });
});

describe('il messaggio dell’esecuzione', () => {
  const MARTA = { tipo: 'utente' as const, id: 'u1', nome: 'Marta Ferrero', a: 'm@esempio.it' };

  it('porta la richiesta, il piano confermato, i file e le email coi destinatari per numero', () => {
    const testo = messaggioDellEsecuzione({
      nome: 'Scadenze',
      modalita: 'pianificata',
      avviataIl: new Date('2026-09-14T07:00:00Z'),
      richiesta: 'Controlla le scadenze di «Rossi Mario».',
      piano: {
        ...PIANO,
        file: [{ formato: 'xlsx', descrizione: 'La tabella' }],
        email: [{ destinatario: MARTA, contenuto: 'La tabella.', allegati: ['La tabella'] }],
      },
      destinatari: [MARTA],
    });
    expect(testo.startsWith('Controlla le scadenze di «Rossi Mario».')).toBe(true);
    expect(testo).toContain('Esecuzione pianificata dell’agente «Scadenze»');
    expect(testo).toContain('14/09/2026');
    expect(testo).toContain('09:00');
    expect(testo).toContain('1. Cerca le polizze del cliente');
    expect(testo).toContain('- XLSX: La tabella');
    expect(testo).toContain('1. Marta Ferrero <m@esempio.it>: La tabella. Allegati: La tabella.');
  });

  it('i destinatari si numerano una volta sola, e quelli non risolti non ci sono', () => {
    expect(
      destinatariDelPiano({
        ...PIANO,
        email: [
          { destinatario: MARTA, contenuto: 'a', allegati: [] },
          { destinatario: { ...MARTA, a: 'M@ESEMPIO.IT' }, contenuto: 'b', allegati: [] },
          { destinatario: { tipo: 'non-risolto', richiesto: 'Bianchi', motivo: 'x' }, contenuto: 'c', allegati: [] },
        ],
      }),
    ).toEqual([MARTA]);
    expect(destinatariDelPiano(null)).toEqual([]);
  });
});

describe('le rotte prima del database', () => {
  const app = creaApp({ logger: false, verificaToken: verificaFinta });

  it('POST incompleto → 400 AGENTE_INCOMPLETO; PATCH rotto → 400', async () => {
    const vuoto = await app.inject({ method: 'POST', url: '/api/agenti', headers: autenticato, payload: {} });
    expect(vuoto.statusCode).toBe(400);
    expect(vuoto.json()).toMatchObject({ codice: 'AGENTE_INCOMPLETO' });

    const patch = await app.inject({
      method: 'PATCH',
      url: '/api/agenti/00000000-0000-4000-8000-000000000001',
      headers: autenticato,
      payload: { attivo: 'boh' },
    });
    expect(patch.statusCode).toBe(400);
  });

  it('piano e conferma con un id malformato → 404, mai un errore SQL', async () => {
    for (const url of ['/api/agenti/agt-1/piano', '/api/agenti/agt-1/conferma']) {
      const r = await app.inject({ method: 'POST', url, headers: autenticato, payload: {} });
      expect(r.statusCode, url).toBe(404);
    }
  });

  it('la libreria dei predefiniti risponde senza database, con richieste che non citano nessuna agenzia', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/agenti/predefiniti', headers: autenticato });
    expect(r.statusCode).toBe(200);
    const libreria = r.json<AgentePredefinito[]>();
    expect(libreria.length).toBeGreaterThanOrEqual(3);
    for (const predefinito of libreria) {
      expect(predefinito.richiesta.trim()).toBeTruthy();
      expect(predefinito.richiesta).not.toContain('@[');
    }
  });

  /* La prova gira sempre da `src`, l'immagine sempre da `dist/src`: se il
     percorso del dato di piattaforma vale per un solo livello, la rotta passa
     qui e risponde 500 in produzione. È successo con i predefiniti. */
  it('il dato di piattaforma si trova sia da src sia dal compilato in dist', () => {
    for (const base of ['../src/dati.ts', '../dist/src/dati.js']) {
      const contenuto = leggiDatoDiPiattaforma('agenti-predefiniti.json', new URL(base, import.meta.url));
      expect((JSON.parse(contenuto) as unknown[]).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('senza token → 401 su ogni rotta del dominio', async () => {
    for (const url of ['/api/agenti', '/api/agenti/predefiniti', '/api/agenti/limiti']) {
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(401);
    }
  });
});
