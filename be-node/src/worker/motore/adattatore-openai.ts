import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * L'adattatore verso i fornitori in dialetto OpenAI (RF-D-03): l'Agent SDK
 * parla l'API Messages di Anthropic, mentre Mistral e Gemini parlano il
 * formato a chat completion. Qui in mezzo c'è un server HTTP che traduce,
 * così il motore resta uno solo — la sessione, le mura, i tool e la ripresa
 * non sanno di chi stanno parlando.
 *
 * Quel che cambia da un fornitore all'altro sta tutto in un profilo, non in
 * un file per ciascuno: dove si punta, con che chiave, e le due differenze
 * viste dal vivo — la chiave di cache di Mistral (un campo ignoto altrove
 * può valere un 400) e `stream_options`, senza il quale Gemini non manda
 * gli usi e, insieme ai tool, risponde addirittura 403.
 *
 * Gira **in-process sul localhost del worker**, su una porta effimera: non è
 * un servizio da distribuire, la chiave Mistral non esce dal processo e il
 * deploy non cambia. `fornitori.ts` gli punta `ANTHROPIC_BASE_URL` addosso,
 * esattamente come fa con HostYourAI.
 *
 * La superficie da coprire non è indovinata: è quella osservata mettendosi
 * in mezzo a una sessione vera (09/09/2026) —
 *  - `HEAD /api/hello`, la sonda di raggiungibilità: senza risposta l'SDK
 *    non parte nemmeno;
 *  - `POST /v1/messages` in streaming, con `system` che arriva sia come
 *    stringa sia come blocchi con `cache_control`, e messaggi che portano
 *    `text`, `tool_use`, `tool_result` e `thinking`.
 *
 * Due cose girano a nostro favore: gli id delle chiamate ai tool li conia
 * Mistral (9 caratteri, come vuole lui) e li ripassiamo tali e quali, quindi
 * non serve nessuna tabella di traduzione; e l'SDK manda
 * `x-claude-code-session-id` a ogni richiesta, che è la chiave stabile con
 * cui accendere la cache dei prompt di Mistral (input ripetuto al 10%).
 */

export interface BloccoAnthropic {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | BloccoAnthropic[];
  source?: { type?: string; media_type?: string; data?: string; url?: string };
}

export interface CorpoAnthropic {
  model: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
  system?: string | BloccoAnthropic[];
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string | BloccoAnthropic[] }>;
  tools?: Array<{ name: string; description?: string; input_schema?: unknown }>;
}

type ParteOpenAI = { type: 'text'; text: string } | { type: 'image_url'; image_url: string };

/** Quel che Mistral rimanda come contenuto: una stringa, o dei pezzi. */
type ContenutoOpenAI = string | Array<{ type?: string; text?: string; [altro: string]: unknown }> | null;

/**
 * Il testo di un contenuto di Mistral. Non è sempre una stringa: sui modelli
 * grandi arriva anche come lista di pezzi (`text`, `reference`, …), e
 * passata così com'è finisce nella risposta come «[object Object]» — visto
 * il 09/09/2026 su Mistral Large 3.
 */
function testoDelContenuto(contenuto: ContenutoOpenAI | undefined): string {
  if (typeof contenuto === 'string') return contenuto;
  if (!Array.isArray(contenuto)) return '';
  return contenuto.map((pezzo) => (pezzo.type === 'text' ? (pezzo.text ?? '') : '')).join('');
}

/** Un pezzo di stream di Mistral (formato a chat completion). */
export interface PezzoOpenAI {
  choices?: Array<{
    delta?: {
      content?: ContenutoOpenAI;
      tool_calls?: Array<{
        id?: string;
        index?: number;
        function?: { name?: string; arguments?: string };
        extra_content?: { google?: { thought_signature?: string } };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null;
}

/**
 * Dalla richiesta Anthropic a quella Mistral. I blocchi `thinking` restano
 * fuori: nel formato di Mistral non hanno un posto, e il ragionamento del
 * turno prima non deve tornare indietro.
 */
export function richiestaVersoOpenAI(
  corpo: CorpoAnthropic,
  chiaveCache?: string,
  firme?: Firme,
): Record<string, unknown> {
  const messaggi: Array<Record<string, unknown>> = [];
  const sistema = testoDi(corpo.system);
  if (sistema) messaggi.push({ role: 'system', content: sistema });

  for (const m of corpo.messages ?? []) {
    /* Un `system` in mezzo alla conversazione — i promemoria che l'SDK
       infila strada facendo — per Mistral è un guaio: il suo template vuole
       il sistema in testa, e con un turno di sistema in coda il modello
       smette di chiamare i tool e si mette a scriverli come testo (visto il
       09/09/2026: «Glob{"pattern": …}» dentro la risposta). Diventa un turno
       dell'utente, che è poi quello che è. */
    const ruolo = m.role === 'system' ? 'user' : m.role;
    if (typeof m.content === 'string') {
      if (m.content) messaggi.push({ role: ruolo, content: m.content });
      continue;
    }
    const blocchi = m.content ?? [];
    if (ruolo === 'assistant') {
      const testo = blocchi
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
      const chiamate = blocchi
        .filter((b) => b.type === 'tool_use')
        .map((b) => {
          const firma = firme?.di(b.id);
          return {
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
            ...(firma && { extra_content: { google: { thought_signature: firma } } }),
          };
        });
      if (testo || chiamate.length > 0) {
        messaggi.push({ role: 'assistant', content: testo, ...(chiamate.length > 0 && { tool_calls: chiamate }) });
      }
      continue;
    }
    /* Il risultato di un tool è un messaggio a sé (`role: 'tool'`) e viene
       PRIMA di quel che l'utente aggiunge, come vuole il formato a funzioni. */
    for (const b of blocchi) {
      if (b.type !== 'tool_result') continue;
      messaggi.push({ role: 'tool', tool_call_id: b.tool_use_id, content: testoDi(b.content) || '(nessun risultato)' });
    }
    const parti = partiUtente(blocchi.filter((b) => b.type !== 'tool_result'));
    if (parti.length === 0) continue;
    const primaParte = parti[0]!;
    messaggi.push({ role: 'user', content: parti.length === 1 && primaParte.type === 'text' ? primaParte.text : parti });
  }

  return {
    model: corpo.model,
    messages: messaggi,
    ...(corpo.max_tokens !== undefined && { max_tokens: corpo.max_tokens }),
    ...(corpo.temperature !== undefined && { temperature: corpo.temperature }),
    ...(corpo.top_p !== undefined && { top_p: corpo.top_p }),
    ...(corpo.stop_sequences?.length && { stop: corpo.stop_sequences }),
    ...(corpo.tools?.length && {
      tools: corpo.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description ?? '',
          parameters: t.input_schema ?? { type: 'object', properties: {} },
        },
      })),
    }),
    /* La cache dei prompt di Mistral è esplicita: stessa chiave e stesso
       prefisso, e l'input ripetuto costa un decimo. La chiave ce la porta
       l'SDK a ogni richiesta. */
    ...(chiaveCache && { prompt_cache_key: chiaveCache }),
  };
}

/**
 * Le firme di ragionamento di Gemini, per id di chiamata. Gemini le manda
 * in `extra_content` e **pretende di riaverle indietro** al turno dopo: senza,
 * risponde 400 «Function call is missing a thought_signature». Nel formato
 * di Anthropic non hanno un posto, quindi si tengono qui di lato e si
 * riattaccano quando la conversazione torna indietro. Con un tetto, perché
 * il worker vive a lungo e questa mappa non deve crescere per sempre.
 */
export class Firme {
  private readonly per = new Map<string, string>();

  constructor(private readonly tetto = 2000) {}

  ricorda(id: string | undefined, firma: string | undefined): void {
    if (!id || !firma) return;
    this.per.set(id, firma);
    /* Mappa in ordine d'inserimento: le più vecchie escono per prime. */
    while (this.per.size > this.tetto) {
      const primo = this.per.keys().next();
      if (primo.done) break;
      this.per.delete(primo.value);
    }
  }

  di(id: string | undefined): string | undefined {
    return id ? this.per.get(id) : undefined;
  }
}

/** Il testo di un campo che può essere stringa, blocchi, o niente. */
function testoDi(x: string | BloccoAnthropic[] | undefined): string {
  if (typeof x === 'string') return x;
  if (!Array.isArray(x)) return '';
  return x
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n\n');
}

function partiUtente(blocchi: BloccoAnthropic[]): ParteOpenAI[] {
  const parti: ParteOpenAI[] = [];
  for (const b of blocchi) {
    if (b.type === 'text' && b.text) parti.push({ type: 'text', text: b.text });
    else if (b.type === 'image' && b.source?.data) {
      parti.push({ type: 'image_url', image_url: `data:${b.source.media_type ?? 'image/png'};base64,${b.source.data}` });
    } else if (b.type === 'image' && b.source?.url) parti.push({ type: 'image_url', image_url: b.source.url });
  }
  return parti;
}

/**
 * Dallo stream di Mistral a quello di Anthropic, pezzo per pezzo. Emette i
 * sette eventi che l'SDK si aspetta; gli argomenti dei tool arrivano a
 * spezzoni e ripartono come `input_json_delta`.
 */
export class FlussoVersoAnthropic {
  private prossimoIndice = 0;
  private indiceTesto: number | undefined;
  private readonly toolAperti = new Map<number, number>();
  private fine: string | null = null;
  private uso = { input: 0, output: 0, cache: 0 };

  /** Gli id delle chiamate viste per indice: la firma può arrivare dopo. */
  private readonly idPerIndice = new Map<number, string>();

  constructor(
    private readonly modello: string,
    private readonly id = `msg_${randomUUID().replace(/-/g, '')}`,
    private readonly firme?: Firme,
  ) {}

  apri(): string {
    /* Gli usi qui non si sanno ancora: Mistral li manda in fondo, e in fondo
       li rimandiamo — `message_delta` li porta tutti, cache compresa. */
    return evento('message_start', {
      type: 'message_start',
      message: {
        id: this.id,
        type: 'message',
        role: 'assistant',
        model: this.modello,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    });
  }

  pezzo(p: PezzoOpenAI): string {
    let fuori = '';
    if (p.usage) {
      const inCache = p.usage.prompt_tokens_details?.cached_tokens ?? 0;
      this.uso = {
        input: Math.max(0, (p.usage.prompt_tokens ?? 0) - inCache),
        output: p.usage.completion_tokens ?? 0,
        cache: inCache,
      };
    }
    const scelta = p.choices?.[0];
    const delta = scelta?.delta;
    const testo = testoDelContenuto(delta?.content);
    if (testo) {
      if (this.indiceTesto === undefined) {
        this.indiceTesto = this.prossimoIndice++;
        fuori += evento('content_block_start', {
          type: 'content_block_start',
          index: this.indiceTesto,
          content_block: { type: 'text', text: '' },
        });
      }
      fuori += evento('content_block_delta', {
        type: 'content_block_delta',
        index: this.indiceTesto,
        delta: { type: 'text_delta', text: testo },
      });
    }
    for (const chiamata of delta?.tool_calls ?? []) {
      const chiave = chiamata.index ?? 0;
      if (chiamata.id) this.idPerIndice.set(chiave, chiamata.id);
      this.firme?.ricorda(chiamata.id ?? this.idPerIndice.get(chiave), chiamata.extra_content?.google?.thought_signature);
      let indice = this.toolAperti.get(chiave);
      if (indice === undefined) {
        fuori += this.chiudiTesto();
        indice = this.prossimoIndice++;
        this.toolAperti.set(chiave, indice);
        fuori += evento('content_block_start', {
          type: 'content_block_start',
          index: indice,
          content_block: {
            type: 'tool_use',
            id: chiamata.id ?? `chiamata${chiave}`,
            name: chiamata.function?.name ?? '',
            input: {},
          },
        });
      }
      if (chiamata.function?.arguments) {
        fuori += evento('content_block_delta', {
          type: 'content_block_delta',
          index: indice,
          delta: { type: 'input_json_delta', partial_json: chiamata.function.arguments },
        });
      }
    }
    if (scelta?.finish_reason) this.fine = scelta.finish_reason;
    return fuori;
  }

  chiudi(): string {
    let fuori = this.chiudiTesto();
    for (const indice of this.toolAperti.values()) {
      fuori += evento('content_block_stop', { type: 'content_block_stop', index: indice });
    }
    this.toolAperti.clear();
    fuori += evento('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: motivoDiFine(this.fine), stop_sequence: null },
      usage: {
        input_tokens: this.uso.input,
        output_tokens: this.uso.output,
        cache_read_input_tokens: this.uso.cache,
        cache_creation_input_tokens: 0,
      },
    });
    return fuori + evento('message_stop', { type: 'message_stop' });
  }

  private chiudiTesto(): string {
    if (this.indiceTesto === undefined) return '';
    const chiusura = evento('content_block_stop', { type: 'content_block_stop', index: this.indiceTesto });
    this.indiceTesto = undefined;
    return chiusura;
  }
}

/** La risposta intera di Mistral, quando la richiesta non chiede lo stream. */
export interface RispostaOpenAI {
  choices?: Array<{
    message?: {
      content?: ContenutoOpenAI;
      tool_calls?: Array<{
      id?: string;
      function?: { name?: string; arguments?: string };
      extra_content?: { google?: { thought_signature?: string } };
    }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  } | null;
}

/** La risposta intera (senza streaming), per le chiamate che non lo chiedono. */
export function rispostaVersoAnthropic(risposta: RispostaOpenAI, modello: string, firme?: Firme): Record<string, unknown> {
  const scelta = risposta.choices?.[0];
  const messaggio = scelta?.message;
  const contenuto: Array<Record<string, unknown>> = [];
  const testo = testoDelContenuto(messaggio?.content);
  if (testo) contenuto.push({ type: 'text', text: testo });
  for (const c of messaggio?.tool_calls ?? []) {
    firme?.ricorda(c.id, c.extra_content?.google?.thought_signature);
    contenuto.push({ type: 'tool_use', id: c.id, name: c.function?.name, input: interpretaJson(c.function?.arguments) });
  }
  const inCache = risposta.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    id: `msg_${randomUUID().replace(/-/g, '')}`,
    type: 'message',
    role: 'assistant',
    model: modello,
    content: contenuto,
    stop_reason: motivoDiFine(scelta?.finish_reason ?? null),
    stop_sequence: null,
    usage: {
      input_tokens: Math.max(0, (risposta.usage?.prompt_tokens ?? 0) - inCache),
      output_tokens: risposta.usage?.completion_tokens ?? 0,
      cache_read_input_tokens: inCache,
      cache_creation_input_tokens: 0,
    },
  };
}

function interpretaJson(testo: unknown): unknown {
  if (typeof testo !== 'string') return testo ?? {};
  try {
    return JSON.parse(testo);
  } catch {
    return {};
  }
}

/** I motivi di fine di Mistral, detti come li dice Anthropic. */
export function motivoDiFine(fine: string | null): string {
  switch (fine) {
    case 'tool_calls':
      return 'tool_use';
    case 'length':
    case 'model_length':
      return 'max_tokens';
    default:
      return 'end_turn';
  }
}

function evento(nome: string, dati: unknown): string {
  return `event: ${nome}\ndata: ${JSON.stringify(dati)}\n\n`;
}

/** Come si parla a un fornitore: le differenze stanno qui, non in un file per ciascuno. */
export interface ProfiloFornitore {
  /** La radice dell'API, senza `/chat/completions`. */
  base: string;
  chiave: string;
  /** Manda `prompt_cache_key` (Mistral). Altrove un campo ignoto può valere un 400. */
  chiaveCache?: boolean;
  /** Chiede gli usi in streaming con `stream_options` (Gemini: senza, non li manda). */
  usiInStreaming?: boolean;
}

export interface AdattatoreOpenAI {
  /** Da dare all'SDK come `ANTHROPIC_BASE_URL`. */
  url: string;
  /** Da dare all'SDK come `ANTHROPIC_API_KEY`: l'adattatore non serve nessun altro. */
  token: string;
  chiudi(): Promise<void>;
}

export async function avviaAdattatoreOpenAI(profilo: ProfiloFornitore): Promise<AdattatoreOpenAI> {
  const token = randomUUID();
  const firme = new Firme();
  const server = createServer((richiesta, risposta) => {
    void servi(richiesta, risposta, { ...profilo, token }, firme).catch((errore: unknown) => {
      if (!risposta.headersSent) {
        rispondi(risposta, 502, { type: 'error', error: { type: 'api_error', message: messaggio(errore) } });
      } else risposta.end();
    });
  });
  await new Promise<void>((fatto) => server.listen(0, '127.0.0.1', fatto));
  /* Che non tenga in piedi il processo: gli strumenti di collaudo finiscono
     e devono poter uscire. */
  server.unref();
  const porta = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${porta}`,
    token,
    chiudi: () => new Promise<void>((fatto) => server.close(() => fatto())),
  };
}

async function servi(
  richiesta: IncomingMessage,
  risposta: ServerResponse,
  opzioni: ProfiloFornitore & { token: string },
  firme: Firme,
): Promise<void> {
  const percorso = (richiesta.url ?? '').split('?')[0];
  /* La sonda di raggiungibilità dell'SDK, prima di ogni sessione. */
  if (percorso === '/api/hello') return rispondi(risposta, 200, { ok: true });
  if (richiesta.method !== 'POST' || percorso !== '/v1/messages') {
    return rispondi(risposta, 404, {
      type: 'error',
      error: { type: 'not_found_error', message: `L’adattatore non serve ${richiesta.method} ${percorso}.` },
    });
  }
  if (richiesta.headers['x-api-key'] !== opzioni.token) {
    return rispondi(risposta, 401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'Token dell’adattatore non valido.' },
    });
  }

  const pezzi: Buffer[] = [];
  for await (const p of richiesta) pezzi.push(p as Buffer);
  const corpo = JSON.parse(Buffer.concat(pezzi).toString('utf8')) as CorpoAnthropic;
  const sessione = richiesta.headers['x-claude-code-session-id'];
  const verso = richiestaVersoOpenAI(
    corpo,
    opzioni.chiaveCache && typeof sessione === 'string' ? sessione : undefined,
    firme,
  );

  if (corpo.stream === false) {
    const secca = await fetch(`${opzioni.base}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opzioni.chiave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(verso),
    });
    if (!secca.ok) return rispondi(risposta, secca.status, erroreDaFornitore(await secca.text()));
    return rispondi(risposta, 200, rispostaVersoAnthropic((await secca.json()) as RispostaOpenAI, corpo.model, firme));
  }

  const monte = await fetch(`${opzioni.base}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opzioni.chiave}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      ...verso,
      stream: true,
      ...(opzioni.usiInStreaming && { stream_options: { include_usage: true } }),
    }),
  });
  if (!monte.ok || !monte.body) return rispondi(risposta, monte.status, erroreDaFornitore(await monte.text()));

  risposta.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const flusso = new FlussoVersoAnthropic(corpo.model, undefined, firme);
  risposta.write(flusso.apri());
  let resto = '';
  for await (const pezzo of monte.body) {
    resto += Buffer.from(pezzo as Uint8Array).toString('utf8');
    const righe = resto.split('\n');
    resto = righe.pop() ?? '';
    for (const riga of righe) {
      if (!riga.startsWith('data:')) continue;
      const dato = riga.slice(5).trim();
      if (!dato || dato === '[DONE]') continue;
      try {
        risposta.write(flusso.pezzo(JSON.parse(dato) as PezzoOpenAI));
      } catch {
        /* un pezzo che non si legge non deve buttare giù la sessione */
      }
    }
  }
  risposta.write(flusso.chiudi());
  risposta.end();
}

/** L'errore di Mistral nella forma che l'SDK sa leggere (e su cui riprova). */
function erroreDaFornitore(testo: string): Record<string, unknown> {
  return { type: 'error', error: { type: 'api_error', message: testo.slice(0, 500) } };
}

function rispondi(risposta: ServerResponse, stato: number, corpo: unknown): void {
  const testo = JSON.stringify(corpo);
  risposta.writeHead(stato, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(testo) });
  risposta.end(testo);
}

function messaggio(errore: unknown): string {
  return errore instanceof Error ? errore.message : String(errore);
}
