import { afterEach, describe, expect, it, vi } from 'vitest';

import { creaApp, type OpzioniApp } from '../src/api/app.js';
import { schemaEmailRisposta, schemaModificheBozzaEmail } from '../src/contratto/conversazioni.js';
import { inviaEmail, LIMITE_ALLEGATI_BYTE, nomeAllegato } from '../src/email/invio.js';
import { componiEmailLibera, componiEmailRisposta, testoSemplice } from '../src/generazione/email.js';

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

  it('le correzioni a una bozza: almeno un campo, e un indirizzo vero', () => {
    expect(schemaModificheBozzaEmail.safeParse({}).success).toBe(false);
    expect(schemaModificheBozzaEmail.safeParse({ a: 'non-una-email' }).success).toBe(false);
    expect(schemaModificheBozzaEmail.parse({ oggetto: '  Il rinnovo  ' })).toEqual({ oggetto: 'Il rinnovo' });
    /* Togliere tutti gli allegati è una correzione, non un corpo vuoto. */
    expect(schemaModificheBozzaEmail.safeParse({ allegati: [] }).success).toBe(true);
  });
});

describe("l'email scritta per chi la riceve", () => {
  const email = componiEmailLibera({
    oggetto: 'Il rinnovo della sua RC Auto',
    corpo: 'Gentile signor Rossi,\n\nle **confermo** il rinnovo.\n\n- Premio: 480 €\n\nAttenzione a <script>.',
    daParteDi: { nome: 'Marta Ferrero', agenzia: 'Assicurazioni Meridiana S.r.l.' },
  });

  it("l'oggetto è il suo, e in testa c'è l'agenzia, non il titolo di una conversazione", () => {
    expect(email.oggetto).toBe('Il rinnovo della sua RC Auto');
    expect(email.html).not.toContain('<h1');
    expect(email.html).toContain('Assicurazioni Meridiana S.r.l.');
  });

  it('firma chi la manda, e non parla di Velia', () => {
    expect(email.html).toContain('Marta Ferrero<br>Assicurazioni Meridiana S.r.l.');
    expect(email.testo.trimEnd().endsWith('Marta Ferrero\nAssicurazioni Meridiana S.r.l.')).toBe(true);
    expect(email.html).not.toContain('Velia');
  });

  it('il corpo tiene grassetti ed elenchi, e scappa ciò che non è suo', () => {
    expect(email.html).toContain('<strong>confermo</strong>');
    expect(email.html).toContain('<ul style=');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
  });

  it('gli allegati arrivano col loro titolo, senza i caratteri che un file non accetta', () => {
    expect(nomeAllegato('Proposta: rinnovo RC "Rossi"', 'pdf')).toBe('Proposta rinnovo RC Rossi.pdf');
    expect(nomeAllegato('Polizza più sicura', 'docx')).toBe('Polizza più sicura.docx');
    expect(nomeAllegato(' / ', 'xlsx')).toBe('documento.xlsx');
  });
});

describe('la composizione', () => {
  const email = componiEmailRisposta({
    titolo: 'Confronto AUTOPIÙ e UnipolSai',
    testo: RISPOSTA,
    fonti: ['DIP Danni - p. 2', 'Condizioni di Assicurazione - art. 4, p. 41'],
    daParteDi: { nome: 'Marta Ferrero', agenzia: 'Assicurazioni Meridiana S.r.l.' },
  });

  it("l'oggetto è il titolo della conversazione, e senza titolo un default", () => {
    expect(email.oggetto).toBe('Confronto AUTOPIÙ e UnipolSai');
    expect(componiEmailRisposta({ titolo: '  ', testo: 'x', fonti: [], daParteDi: { nome: 'A', agenzia: 'B' } }).oggetto).toBe('Risposta di Velia');
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('con la chiave ma EMAIL_INVIO=simulato, fuori produzione, non chiama nessuno', async () => {
    const fetchFinto = vi.fn();
    vi.stubGlobal('fetch', fetchFinto);
    await expect(
      inviaEmail(email, { apiKey: 'chiave-di-prova', simula: true, mittente: 'Velia <noreply@sonovelia.it>', produzione: false, log }),
    ).resolves.toEqual({ simulata: true });
    expect(fetchFinto).not.toHaveBeenCalled();
  });

  it('in produzione la simulazione non vale, e gli allegati partono in base64', async () => {
    const fetchFinto = vi.fn().mockResolvedValue(new Response('{"id":"e-1"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFinto);
    const pdf = Buffer.from('%PDF-1.7 prova');
    await expect(
      inviaEmail(
        { ...email, allegati: [{ nome: 'Proposta.pdf', contenuto: pdf }] },
        { apiKey: 'chiave-di-prova', simula: true, mittente: 'Velia <noreply@sonovelia.it>', produzione: true, log },
      ),
    ).resolves.toEqual({ simulata: false });
    const [, init] = fetchFinto.mock.calls[0] as [string, RequestInit];
    const corpo = JSON.parse(init.body as string) as { attachments: unknown };
    expect(corpo.attachments).toEqual([{ filename: 'Proposta.pdf', content: pdf.toString('base64') }]);
  });

  it('allegati oltre il limite: un 413, prima di chiamare chiunque', async () => {
    const fetchFinto = vi.fn();
    vi.stubGlobal('fetch', fetchFinto);
    await expect(
      inviaEmail(
        { ...email, allegati: [{ nome: 'grande.zip', contenuto: Buffer.alloc(LIMITE_ALLEGATI_BYTE + 1) }] },
        { apiKey: 'chiave-di-prova', mittente: 'Velia <noreply@sonovelia.it>', produzione: true, log },
      ),
    ).rejects.toMatchObject({ codice: 'ALLEGATI_TROPPO_GRANDI' });
    expect(fetchFinto).not.toHaveBeenCalled();
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

  /* «Invia email» su tutto il filo (12/09/2026): stesse difese della rotta
     della singola risposta, un segmento in meno nell'indirizzo. */
  it('sulla conversazione intera: corpo senza destinatario → 400, id malformato → 404, senza token → 401', async () => {
    const senza = await app.inject({
      method: 'POST',
      url: '/api/conversazioni/non-uuid/email',
      headers: autenticato,
      payload: {},
    });
    expect(senza.statusCode).toBe(400);

    const malformato = await app.inject({
      method: 'POST',
      url: '/api/conversazioni/non-uuid/email',
      headers: autenticato,
      payload: { a: 'me' },
    });
    expect(malformato.statusCode).toBe(404);
    expect(malformato.json()).toMatchObject({ codice: 'NON_TROVATO' });

    const anonimo = await app.inject({
      method: 'POST',
      url: '/api/conversazioni/00000000-0000-4000-8000-000000000001/email',
      payload: { a: 'me' },
    });
    expect(anonimo.statusCode).toBe(401);
  });

  /* Le bozze preparate dall'assistente (14/09/2026): stesse difese, prima del database. */
  it('sulle bozze: correzione vuota → 400, id malformati → 404, senza token → 401', async () => {
    const vuota = await app.inject({
      method: 'PATCH',
      url: '/api/conversazioni/non-uuid/email/pure-no',
      headers: autenticato,
      payload: {},
    });
    expect(vuota.statusCode).toBe(400);

    const malformate = [
      { method: 'PATCH' as const, url: '/api/conversazioni/non-uuid/email/pure-no', payload: { oggetto: 'Nuovo' } },
      { method: 'POST' as const, url: '/api/conversazioni/non-uuid/email/pure-no/invio', payload: {} },
      { method: 'POST' as const, url: '/api/conversazioni/non-uuid/email/pure-no/annulla', payload: {} },
    ];
    for (const { method, url, payload } of malformate) {
      const r = await app.inject({ method, url, headers: autenticato, payload });
      expect(r.statusCode, url).toBe(404);
    }

    const anonimo = await app.inject({
      method: 'POST',
      url: '/api/conversazioni/00000000-0000-4000-8000-000000000001/email/00000000-0000-4000-8000-000000000002/invio',
      payload: {},
    });
    expect(anonimo.statusCode).toBe(401);
  });
});
