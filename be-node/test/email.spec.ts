import { describe, expect, it } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { schemaEmailRisposta } from '../src/contratto/conversazioni.js';
import { inviaEmail } from '../src/email/invio.js';
import { componiEmailRisposta, testoSemplice } from '../src/generazione/email.js';

/**
 * «Invia email» ed «Esporta come TXT» senza database né provider: la
 * composizione del messaggio dai blocchi della risposta, l'invio simulato
 * fuori produzione, e le risposte della rotta prima di toccare il db.
 */

const verifica: NonNullable<OpzioniApp['verificaToken']> = () =>
  Promise.resolve({
    sub: '00000000-0000-4000-8000-00000000000a',
    app_metadata: { tenant_id: '00000000-0000-0000-0000-000000000001', ruolo: 'operatore' },
  });

const autenticato = { authorization: 'Bearer token-di-prova' };

const RISPOSTA = [
  '## Massimale RC',
  'Le due proposte **si equivalgono**: 6.450.000 € per sinistro.',
  '',
  '- Danni a cose: 1.300.000 €',
  '- Danni a persone: il resto',
  '',
  '| Voce | AUTOPIÙ | UnipolSai |',
  '|---|---|---|',
  '| Franchigia | 250 € | non presente |',
  '',
  'Attenzione a <script> e a "virgolette".',
].join('\n');

describe('il contratto', () => {
  it('«me» o un indirizzo valido, niente altro', () => {
    expect(schemaEmailRisposta.safeParse({ a: 'me' }).success).toBe(true);
    expect(schemaEmailRisposta.parse({ a: '  M.Rossi@Agenzia.it ' })).toEqual({ a: 'M.Rossi@Agenzia.it' });
    expect(schemaEmailRisposta.safeParse({ a: 'non-una-email' }).success).toBe(false);
    expect(schemaEmailRisposta.safeParse({}).success).toBe(false);
  });
});

describe('la composizione', () => {
  const email = componiEmailRisposta({
    titolo: 'Confronto AUTOPIÙ e UnipolSai',
    testo: RISPOSTA,
    fonti: ['DIP Danni - p. 2', 'Condizioni di Assicurazione - art. 4, p. 41'],
    daParteDi: { nome: 'Marta Ferrero', agenzia: 'Assicurazioni Meridiana S.r.l.' },
    identita: { colorePrimario: '#2f4b7c', firma: 'Marta Ferrero\nAgente', recapiti: 'Via Roma 1, Torino' },
  });

  it("l'oggetto è il titolo della conversazione, e senza titolo un default", () => {
    expect(email.oggetto).toBe('Confronto AUTOPIÙ e UnipolSai');
    expect(componiEmailRisposta({ titolo: '  ', testo: 'x', fonti: [], daParteDi: { nome: 'A', agenzia: 'B' }, identita: { colorePrimario: '#000', firma: '', recapiti: '' } }).oggetto).toBe('Risposta di Velia');
  });

  it("l'HTML tiene titoli, grassetti, elenchi e tabelle, e scappa ciò che non è suo", () => {
    expect(email.html).toContain('<h3 ');
    expect(email.html).toContain('<strong>si equivalgono</strong>');
    expect(email.html).toContain('<ul style=');
    expect(email.html).toContain('<th ');
    expect(email.html).toContain('<td style=');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('&quot;virgolette&quot;');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('#2f4b7c');
    expect(email.html).toContain('Assicurazioni Meridiana S.r.l.');
    expect(email.html).toContain('Inviata da Marta Ferrero con Velia');
  });

  it('le fonti stanno in coda, in HTML e nel testo', () => {
    expect(email.html).toContain('Condizioni di Assicurazione - art. 4, p. 41');
    expect(email.testo).toContain('Fonti\n- DIP Danni - p. 2\n- Condizioni di Assicurazione - art. 4, p. 41');
    expect(email.testo).toContain('MASSIMALE RC');
    expect(email.testo).toContain('• Danni a cose: 1.300.000 €');
  });

  it("l'export TXT è il testo piatto con le fonti, senza Markdown", () => {
    const txt = testoSemplice(RISPOSTA, ['DIP Danni - p. 2']);
    expect(txt).toContain('MASSIMALE RC\nLe due proposte si equivalgono');
    expect(txt).toContain('Franchigia | 250 € | non presente');
    expect(txt).toContain('\nFonti\n- DIP Danni - p. 2\n');
    expect(txt).not.toContain('**');
    expect(testoSemplice('Solo testo.', [])).toBe('Solo testo.\n');
  });
});

describe("l'invio", () => {
  const registro: object[] = [];
  const log = { info: (o: object) => void registro.push(o), warn: () => undefined };
  const email = { a: 'm.ferrero@agenzia.it', oggetto: 'Prova', testo: 'x', html: '<p>x</p>' };

  it('senza chiave, fuori produzione, è simulato e finisce nel log', async () => {
    await expect(inviaEmail(email, { mittente: 'Velia <noreply@sonovelia.it>', produzione: false, log })).resolves.toEqual({
      simulata: true,
    });
    expect(registro.at(-1)).toMatchObject({ a: 'm.ferrero@agenzia.it', oggetto: 'Prova' });
  });

  it('senza chiave, in produzione, è un 503 chiaro', async () => {
    await expect(inviaEmail(email, { mittente: 'Velia <noreply@sonovelia.it>', produzione: true, log })).rejects.toMatchObject({
      codice: 'EMAIL_NON_CONFIGURATA',
    });
  });
});

describe('la rotta prima del database', () => {
  const app = creaApp({ logger: false, verificaToken: verifica });

  it('corpo senza destinatario → 400, id malformati → 404 (mai un errore SQL)', async () => {
    const senza = await app.inject({
      method: 'POST',
      url: '/api/conversazioni/non-uuid/messaggi/pure-no/email',
      headers: autenticato,
      payload: {},
    });
    expect(senza.statusCode).toBe(400);

    const malformati = await app.inject({
      method: 'POST',
      url: '/api/conversazioni/non-uuid/messaggi/pure-no/email',
      headers: autenticato,
      payload: { a: 'me' },
    });
    expect(malformati.statusCode).toBe(404);
    expect(malformati.json()).toMatchObject({ codice: 'NON_TROVATO' });
  });

  it('senza token → 401', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/conversazioni/00000000-0000-4000-8000-000000000001/messaggi/00000000-0000-4000-8000-000000000002/email',
      payload: { a: 'me' },
    });
    expect(r.statusCode).toBe(401);
  });
});
