import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  avviaAdattatoreMistral,
  FlussoVersoAnthropic,
  motivoDiFine,
  richiestaVersoMistral,
  rispostaVersoAnthropic,
  type AdattatoreMistral,
} from '../src/worker/motore/adattatore-mistral.js';

/**
 * L'adattatore verso Mistral: l'Agent SDK parla Anthropic, Mistral parla
 * chat completion. Qui si prova la traduzione nei due versi — quella pura,
 * senza rete — e poi il server intero contro un finto Mistral.
 */

interface EventoAnthropic {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string; input?: unknown; text?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string; stop_sequence?: string | null };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}

const RIGHE = /\r?\n/;

/** Gli eventi di un pezzo di SSE, letti come li leggerebbe l'SDK. */
function eventiDi(sse: string): EventoAnthropic[] {
  return sse
    .split(RIGHE)
    .filter((r) => r.startsWith('data: '))
    .map((r) => JSON.parse(r.slice(6)) as EventoAnthropic);
}

function nomiEventi(sse: string): string[] {
  return sse
    .split(RIGHE)
    .filter((r) => r.startsWith('event: '))
    .map((r) => r.slice(7));
}

describe('dalla richiesta Anthropic a quella Mistral', () => {
  it('il sistema a blocchi diventa un messaggio, i tool diventano funzioni, la cache ha la sua chiave', () => {
    const verso = richiestaVersoMistral(
      {
        model: 'mistral-large-2512',
        max_tokens: 4096,
        system: [
          { type: 'text', text: 'Sei Velia.' },
          { type: 'text', text: 'Cita sempre le fonti.' },
        ],
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Che franchigia prevede il furto?' }] }],
        tools: [{ name: 'Read', description: 'Legge un documento', input_schema: { type: 'object', properties: {} } }],
      },
      'sessione-123',
    );
    expect(verso['messages']).toEqual([
      { role: 'system', content: 'Sei Velia.\n\nCita sempre le fonti.' },
      { role: 'user', content: 'Che franchigia prevede il furto?' },
    ]);
    expect(verso['tools']).toEqual([
      {
        type: 'function',
        function: { name: 'Read', description: 'Legge un documento', parameters: { type: 'object', properties: {} } },
      },
    ]);
    expect(verso['max_tokens']).toBe(4096);
    expect(verso['prompt_cache_key']).toBe('sessione-123');
  });

  it('un giro con i tool: la chiamata diventa `tool_calls`, il risultato un messaggio a sé, il pensiero sparisce', () => {
    const verso = richiestaVersoMistral({
      model: 'mistral-large-2512',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Leggi le condizioni.' }] },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', text: 'devo aprire il documento' },
            { type: 'text', text: 'Guardo il documento.' },
            { type: 'tool_use', id: 'ychIsV5Vi', name: 'Read', input: { file_path: 'polizza.md' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'ychIsV5Vi', content: [{ type: 'text', text: 'Franchigia 350 euro.' }] },
            { type: 'text', text: 'Allora?' },
          ],
        },
      ],
    });
    expect(verso['messages']).toEqual([
      { role: 'user', content: 'Leggi le condizioni.' },
      {
        role: 'assistant',
        content: 'Guardo il documento.',
        tool_calls: [
          { id: 'ychIsV5Vi', type: 'function', function: { name: 'Read', arguments: '{"file_path":"polizza.md"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'ychIsV5Vi', content: 'Franchigia 350 euro.' },
      { role: 'user', content: 'Allora?' },
    ]);
  });

  it('un system in mezzo alla conversazione diventa un turno dell’utente', () => {
    /* Visto dal vivo il 09/09/2026: con un turno di sistema in coda (i
       promemoria che l'SDK infila strada facendo) Mistral smette di chiamare
       i tool e si mette a scriverli come testo dentro la risposta. */
    const verso = richiestaVersoMistral({
      model: 'mistral-large-2512',
      system: 'Sei Velia.',
      messages: [
        { role: 'user', content: 'Che franchigia prevede il furto?' },
        { role: 'system', content: 'USD budget: $0/$0.5; $0.5 remaining' },
      ],
    });
    expect(verso['messages']).toEqual([
      { role: 'system', content: 'Sei Velia.' },
      { role: 'user', content: 'Che franchigia prevede il furto?' },
      { role: 'user', content: 'USD budget: $0/$0.5; $0.5 remaining' },
    ]);
  });

  it('un’immagine dell’utente diventa un data URL, e il testo le resta accanto', () => {
    const verso = richiestaVersoMistral({
      model: 'mistral-large-2512',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Che stile ha?' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          ],
        },
      ],
    });
    expect(verso['messages']).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Che stile ha?' },
          { type: 'image_url', image_url: 'data:image/png;base64,AAAA' },
        ],
      },
    ]);
  });
});

describe('dallo stream di Mistral a quello di Anthropic', () => {
  it('il testo esce a delta e gli usi arrivano in fondo, con la cache separata dall’input', () => {
    const flusso = new FlussoVersoAnthropic('mistral-large-2512', 'msg_prova');
    let sse = flusso.apri();
    sse += flusso.pezzo({ choices: [{ delta: { content: 'La franchigia ' } }] });
    sse += flusso.pezzo({
      choices: [{ delta: { content: 'è 350 euro.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1619, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 1536 } },
    });
    sse += flusso.chiudi();

    expect(nomiEventi(sse)).toEqual([
      'message_start',
      'content_block_start',
      'content_block_delta',
      'content_block_delta',
      'content_block_stop',
      'message_delta',
      'message_stop',
    ]);
    const testo = eventiDi(sse)
      .filter((d) => d.type === 'content_block_delta')
      .map((d) => d.delta?.text ?? '')
      .join('');
    expect(testo).toBe('La franchigia è 350 euro.');
    const chiusura = eventiDi(sse).find((d) => d.type === 'message_delta')!;
    expect(chiusura.delta).toEqual({ stop_reason: 'end_turn', stop_sequence: null });
    /* 1619 letti di cui 1536 dalla cache: l'input vero è la differenza. */
    expect(chiusura.usage).toEqual({
      input_tokens: 83,
      output_tokens: 12,
      cache_read_input_tokens: 1536,
      cache_creation_input_tokens: 0,
    });
  });

  it('un contenuto a pezzi diventa testo, non «[object Object]»', () => {
    /* Mistral Large 3 manda il contenuto anche come lista di pezzi, con
       dentro dei `reference` che non sono testo: passata così com'è, la
       lista finiva nella risposta stringata. */
    const flusso = new FlussoVersoAnthropic('mistral-large-2512', 'msg_prova');
    let sse = flusso.apri();
    sse += flusso.pezzo({ choices: [{ delta: { content: 'La franchigia' } }] });
    sse += flusso.pezzo({
      choices: [{ delta: { content: [{ type: 'reference', reference_ids: [] }, { type: 'text', text: ' è 350 euro.' }] } }],
    });
    sse += flusso.chiudi();
    const testo = eventiDi(sse)
      .filter((d) => d.type === 'content_block_delta')
      .map((d) => d.delta?.text ?? '')
      .join('');
    expect(testo).toBe('La franchigia è 350 euro.');
    expect(testo).not.toContain('object Object');
  });

  it('una chiamata a un tool spezzata su più pezzi apre un blocco solo e ricuce gli argomenti', () => {
    const flusso = new FlussoVersoAnthropic('mistral-large-2512', 'msg_prova');
    let sse = flusso.apri();
    sse += flusso.pezzo({ choices: [{ delta: { content: 'Cerco.' } }] });
    sse += flusso.pezzo({
      choices: [{ delta: { tool_calls: [{ index: 0, id: 'ychIsV5Vi', function: { name: 'Read', arguments: '{"file_path"' } }] } }],
    });
    sse += flusso.pezzo({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ': "polizza.md"}' } }] }, finish_reason: 'tool_calls' }],
    });
    sse += flusso.chiudi();

    const blocchi = eventiDi(sse).filter((d) => d.type === 'content_block_start');
    expect(blocchi).toHaveLength(2);
    expect(blocchi[1]!.content_block).toEqual({ type: 'tool_use', id: 'ychIsV5Vi', name: 'Read', input: {} });
    /* Il blocco di testo si chiude prima che si apra quello del tool. */
    expect(nomiEventi(sse).slice(1, 6)).toEqual([
      'content_block_start',
      'content_block_delta',
      'content_block_stop',
      'content_block_start',
      'content_block_delta',
    ]);
    const argomenti = eventiDi(sse)
      .filter((d) => d.delta?.type === 'input_json_delta')
      .map((d) => d.delta?.partial_json ?? '')
      .join('');
    expect(JSON.parse(argomenti)).toEqual({ file_path: 'polizza.md' });
    expect(eventiDi(sse).find((d) => d.type === 'message_delta')!.delta?.stop_reason).toBe('tool_use');
  });

  it('i motivi di fine parlano anthropichese', () => {
    expect(motivoDiFine('tool_calls')).toBe('tool_use');
    expect(motivoDiFine('length')).toBe('max_tokens');
    expect(motivoDiFine('stop')).toBe('end_turn');
    expect(motivoDiFine(null)).toBe('end_turn');
  });

  it('la risposta secca (senza streaming) torna un messaggio Anthropic intero', () => {
    const m = rispostaVersoAnthropic(
      {
        choices: [
          {
            message: {
              content: 'Ecco.',
              tool_calls: [{ id: 'abc123xyz', function: { name: 'Read', arguments: '{"file_path":"a.md"}' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 64 } },
      },
      'mistral-large-2512',
    );
    expect(m['content']).toEqual([
      { type: 'text', text: 'Ecco.' },
      { type: 'tool_use', id: 'abc123xyz', name: 'Read', input: { file_path: 'a.md' } },
    ]);
    expect(m['stop_reason']).toBe('tool_use');
    expect(m['usage']).toMatchObject({ input_tokens: 36, cache_read_input_tokens: 64, output_tokens: 10 });
  });
});

describe('il server dell’adattatore, contro un finto Mistral', () => {
  let finto: Server;
  let adattatore: AdattatoreMistral;
  let vistoDaMistral: Record<string, unknown> | undefined;

  beforeAll(async () => {
    finto = createServer((richiesta, risposta) => {
      void (async () => {
        const pezzi: Buffer[] = [];
        for await (const p of richiesta) pezzi.push(p as Buffer);
        vistoDaMistral = JSON.parse(Buffer.concat(pezzi).toString('utf8')) as Record<string, unknown>;
        risposta.writeHead(200, { 'content-type': 'text/event-stream' });
        const pezzo = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
        risposta.write(pezzo({ choices: [{ delta: { content: 'Ciao' } }] }));
        risposta.write(
          pezzo({
            choices: [{ delta: { content: ' mondo.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 70, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 64 } },
          }),
        );
        risposta.write('data: [DONE]\n\n');
        risposta.end();
      })();
    });
    await new Promise<void>((fatto) => finto.listen(0, '127.0.0.1', fatto));
    const porta = (finto.address() as AddressInfo).port;
    adattatore = await avviaAdattatoreMistral({ chiave: 'chiave-finta', base: `http://127.0.0.1:${porta}` });
  });

  afterAll(async () => {
    await adattatore.chiudi();
    await new Promise<void>((fatto) => finto.close(() => fatto()));
  });

  it('risponde alla sonda di raggiungibilità, senza la quale l’SDK non parte', async () => {
    const r = await fetch(`${adattatore.url}/api/hello`, { method: 'HEAD' });
    expect(r.status).toBe(200);
  });

  it('senza il token dell’adattatore non serve nessuno', async () => {
    const r = await fetch(`${adattatore.url}/v1/messages`, { method: 'POST', body: '{}' });
    expect(r.status).toBe(401);
  });

  it('traduce la sessione nei due versi e passa la chiave di cache dell’SDK', async () => {
    const r = await fetch(`${adattatore.url}/v1/messages?beta=true`, {
      method: 'POST',
      headers: {
        'x-api-key': adattatore.token,
        'content-type': 'application/json',
        'x-claude-code-session-id': 'sessione-abc',
      },
      body: JSON.stringify({
        model: 'mistral-large-2512',
        stream: true,
        system: 'Sei Velia.',
        messages: [{ role: 'user', content: 'Ciao' }],
      }),
    });
    expect(r.status).toBe(200);
    const sse = await r.text();
    expect(vistoDaMistral?.['prompt_cache_key']).toBe('sessione-abc');
    expect(vistoDaMistral?.['stream']).toBe(true);
    expect(vistoDaMistral?.['messages']).toEqual([
      { role: 'system', content: 'Sei Velia.' },
      { role: 'user', content: 'Ciao' },
    ]);
    const testo = eventiDi(sse)
      .filter((d) => d.type === 'content_block_delta')
      .map((d) => d.delta?.text ?? '')
      .join('');
    expect(testo).toBe('Ciao mondo.');
    /* Gli usi di Mistral arrivano in fondo: qui devono essere già tradotti. */
    const chiusura = eventiDi(sse).find((d) => d.type === 'message_delta')!;
    expect(chiusura.usage).toMatchObject({ input_tokens: 6, cache_read_input_tokens: 64, output_tokens: 3 });
  });
});
