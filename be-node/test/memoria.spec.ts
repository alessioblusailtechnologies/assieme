import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import { improntaRicordo, schemaModificheRicordo } from '../src/contratto/memoria.js';
import { interpretaCandidati, promptEstrazione } from '../src/worker/memoria/estrattore.js';
import { ambitoEffettivo, valutaPerimetro } from '../src/worker/memoria/perimetro.js';

/**
 * La memoria senza database: il perimetro GDPR applicato dal validatore
 * (RF-G-05), l'interprete dei candidati, l'impronta per i doppioni, e le
 * risposte delle rotte prima di toccare il db.
 */

const ok = (testo: string) => valutaPerimetro({ testo, categoria: 'prassi', ambito: 'tenant' });
/** Il motivo dello scarto, o '' se il candidato passa. */
const motivo = (testo: string): string => {
  const e = ok(testo);
  return e.esito === 'scartato' ? e.motivo : '';
};

describe('il perimetro della memoria (RF-G-05)', () => {
  it('lascia passare prassi, clienti e preferenze ordinarie', () => {
    expect(ok('Per i clienti con più veicoli l’agenzia privilegia le franchigie fisse rispetto agli scoperti.')).toEqual({ esito: 'ok' });
    expect(ok('La ditta Bianchi & Figli rinnova sempre a dicembre e chiede il riepilogo entro fine novembre.')).toEqual({ esito: 'ok' });
    expect(ok('Nei riepiloghi preferisce tabelle brevi e un paragrafo di sintesi in testa.')).toEqual({ esito: 'ok' });
  });

  it('i nomi di prodotto non sono dati sanitari: polizza salute e malattia passano', () => {
    expect(ok('L’agenzia propone la polizza salute e la garanzia malattia ai clienti con famiglia.')).toEqual({ esito: 'ok' });
    expect(ok('Sulle polizze infortuni l’agenzia chiede sempre la tabella di invalidità permanente.')).toEqual({ esito: 'ok' });
  });

  it('scarta le categorie particolari dell’art. 9', () => {
    expect(motivo('Il cliente Rossi è malato di cuore e non può guidare la sera.')).toContain('salute');
    expect(motivo('Il titolare della ditta Verdi è iscritto al sindacato e vota a sinistra.')).toContain('art. 9');
    expect(motivo('La famiglia Neri è di religione musulmana e non assicura il cane.')).toContain('religiose');
    expect(motivo('Il cliente Bianchi ha precedenti penali per guida in stato di ebbrezza.')).toContain('art. 10');
  });

  it('scarta i dati eccedenti: codice fiscale, IBAN, email, telefono, nascita, targa', () => {
    expect(motivo('Il cliente Mario Rossi ha codice fiscale RSSMRA80A01H501U e va chiamato di mattina.')).toContain('codice fiscale');
    expect(motivo('Gli addebiti della ditta Verdi vanno sull’IBAN IT60X0542811101000000123456.')).toContain('IBAN');
    expect(motivo('Il referente della ditta Verdi si contatta a mario.verdi@esempio.it per i rinnovi.')).toContain('email');
    expect(motivo('Il cliente Rossi preferisce essere chiamato al 333 1234567 dopo le 18.')).toContain('telefono');
    expect(motivo('La signora Bianchi, nata il 3 marzo 1961, rinnova a dicembre.')).toContain('nascita');
    expect(motivo('Il furgone della ditta Verdi ha targa FX123AB e va assicurato in flotta.')).toContain('targa');
  });

  it('gli importi e le durate non sono telefoni né età', () => {
    expect(ok('Per i sinistri sopra 1.500.000 euro l’agenzia coinvolge sempre la direzione.')).toEqual({ esito: 'ok' });
    expect(ok('Le polizze di 5 anni si rinegoziano al terzo anno, è la prassi dell’agenzia.')).toEqual({ esito: 'ok' });
  });

  it('scarta ciò che è troppo breve o troppo lungo', () => {
    expect(motivo('Troppo corto.')).toContain('breve');
    expect(motivo('x'.repeat(401))).toContain('400');
  });

  it('l’ambito lo decide il server: una preferenza è sempre personale', () => {
    expect(ambitoEffettivo({ testo: 'x', categoria: 'preferenza', ambito: 'tenant' })).toBe('personale');
    expect(ambitoEffettivo({ testo: 'x', categoria: 'prassi', ambito: 'tenant' })).toBe('tenant');
    expect(ambitoEffettivo({ testo: 'x', categoria: 'cliente', ambito: 'personale' })).toBe('personale');
  });
});

describe('l’estrazione dei candidati', () => {
  it('interpreta l’array anche dentro una recinzione, con categorie sconosciute ricondotte ad «altro»', () => {
    const c = interpretaCandidati('Ecco:\n```json\n[{"testo":"A","categoria":"prassi","ambito":"tenant"},{"testo":"B","categoria":"boh","ambito":"x"}]\n```');
    expect(c).toEqual([
      { testo: 'A', categoria: 'prassi', ambito: 'tenant' },
      { testo: 'B', categoria: 'altro', ambito: 'tenant' },
    ]);
    expect(interpretaCandidati('[]')).toEqual([]);
    expect(() => interpretaCandidati('nessun array')).toThrow();
  });

  it('il prompt porta i ricordi già noti e gli scambi con l’autore', () => {
    const p = promptEstrazione(
      [{ autore: 'utente', testo: 'Domanda' }, { autore: 'assistente', testo: 'Risposta' }],
      ['Già noto'],
    );
    expect(p).toContain('- Già noto');
    expect(p).toContain('[Utente]\nDomanda');
    expect(p).toContain('[Assistente]\nRisposta');
  });

  it('l’impronta ignora maiuscole e spazi', () => {
    expect(improntaRicordo('  Franchigie   FISSE\nper le flotte ')).toBe('franchigie fisse per le flotte');
  });
});

describe('il contratto del PATCH', () => {
  it('ogni campo è indipendente e i valori sono quelli del FE', () => {
    expect(schemaModificheRicordo.parse({ attivo: false })).toEqual({ attivo: false });
    expect(schemaModificheRicordo.safeParse({ categoria: 'fatto' }).success).toBe(false);
    expect(schemaModificheRicordo.safeParse({ testo: '   ' }).success).toBe(false);
  });
});

describe('le rotte prima del database', () => {
  const verificaFinta: NonNullable<OpzioniApp['verificaToken']> = () =>
    Promise.resolve({
      sub: '00000000-0000-4000-8000-00000000000a',
      app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'operatore' },
    });
  const app = creaApp({ logger: false, verificaToken: verificaFinta });
  const autenticato = { authorization: 'Bearer token-di-prova' };

  it('senza token è 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/ricordi' });
    expect(r.statusCode).toBe(401);
  });

  it('un PATCH con valori fuori contratto è 400 leggibile', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: '/api/ricordi/00000000-0000-4000-8000-000000000001',
      headers: autenticato,
      payload: { ambito: 'globale' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json<CorpoErroreApi>().codice).toBe('DATI_NON_VALIDI');
  });

  it('non esiste una POST: la memoria si alimenta solo imparando', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/ricordi', headers: autenticato, payload: { testo: 'x' } });
    expect(r.statusCode).toBe(404);
  });
});
