import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  query,
  type HookCallback,
  type McpSdkServerConfigWithInstance,
  type Options,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

import { FlussoTesto } from './flusso-testo.js';
import { ambienteModello, costoATariffa, type ChiaviFornitori } from './fornitori.js';

/**
 * La sessione del motore (doc motore §2, piano §4.3): l'Agent SDK — lo
 * stesso motore della CLI di Claude in forma programmatica — con la
 * workspace come directory di lavoro e i soli tool di lettura.
 *
 * Tre cinte di mura, dall'interno:
 *  1. `tools: [Read, Grep, Glob]` — nient'altro esiste per il modello;
 *  2. l'hook PreToolUse nega ogni path fuori dalla workspace (il Read
 *     accetta path assoluti: questa è la seconda cinta) e osserva il flag
 *     di annullamento fra un passo e l'altro;
 *  3. la workspace contiene solo ciò che il tenant può leggere (§5).
 *
 * È un'interfaccia perché il gestore del job non deve sapere chi risponde:
 * nei test è un motore finto che emette passi a comando.
 */

export type PassoSessione =
  | { tipo: 'attivita'; etichetta: string; strumento?: string; dettaglio?: Record<string, unknown> }
  | { tipo: 'testo'; delta: string };

export interface RichiestaMotore {
  directory: string;
  promptSistema: string;
  promptUtente: string;
  /**
   * RF-D-02: il modello scelto dal tenant, quando c'è — vince sul default
   * di piattaforma con cui il motore è stato costruito.
   */
  modello?: string;
  /**
   * Il titolo del documento per un path relativo della workspace: le
   * attività parlano all'utente coi titoli che conosce, mai coi nomi dei
   * file — che sono architettura, non contenuto.
   */
  titoloPer?: (pathRelativo: string) => string | undefined;
  /**
   * Strumenti oltre alla lettura (la chat: `genera_documento`), come server
   * MCP in-process dell'SDK. Senza, il modello ha i soli tool di lettura.
   */
  strumenti?: { server: McpSdkServerConfigWithInstance; nomi: string[] };
}

export interface OsservatoreSessione {
  passo(p: PassoSessione): Promise<void>;
  /** Il worker chiede se il job è stato annullato: si risponde con la verità del DB. */
  annullato(): Promise<boolean>;
}

export interface EsitoSessione {
  /** Tutto il testo dell'assistente, nell'ordine in cui l'utente l'ha visto (blocco finale compreso). */
  testo: string;
  terminato: 'completato' | 'annullato' | 'budget' | 'errore';
  errore?: string;
  modello: string;
  turni: number;
  durataMs: number;
  costoUsd: number;
  token: { input: number; output: number; cacheLettura: number; cacheScrittura: number };
  /** I path (relativi alla workspace) che il modello ha letto con Read. */
  documentiLetti: string[];
  /** Vero se l'input in `token` è stimato dal contesto (gateway che non lo riporta). */
  tokenStimati?: boolean;
}

export interface Motore {
  interroga(richiesta: RichiestaMotore, osservatore: OsservatoreSessione): Promise<EsitoSessione>;
}

export interface OpzioniMotoreSdk {
  modello: string;
  maxTurni: number;
  budgetUsd: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Ogni quanto si controlla l'annullamento fra un messaggio e l'altro. */
  intervalloAnnullamentoMs?: number;
  /** Le chiavi dei fornitori terzi (RF-D-03): senza, solo Anthropic. */
  fornitori?: ChiaviFornitori;
  /**
   * Silenzio massimo del modello (nessun evento di stream) prima di chiudere
   * con errore: una chiamata appesa su un gateway terzo non deve tenere il
   * job «in esecuzione» per sempre. Default 3 minuti.
   */
  silenzioMs?: number;
}

export class MotoreAgentSdk implements Motore {
  constructor(private readonly opzioni: OpzioniMotoreSdk) {}

  async interroga(richiesta: RichiestaMotore, osservatore: OsservatoreSessione): Promise<EsitoSessione> {
    const inizio = Date.now();
    const modello = richiesta.modello ?? this.opzioni.modello;
    const fornitore = ambienteModello(modello, this.opzioni.fornitori ?? {});
    const radice = resolve(richiesta.directory);
    const controllo = new AbortController();
    const documentiLetti: string[] = [];
    let annullato = false;

    /* Il testo, turno per turno: cosa vede l'utente e cosa legge il
       validatore lo decide `FlussoTesto` (pura, provata a parte). */
    const flusso = new FlussoTesto((p) => osservatore.passo(p));

    const hookPreTool: HookCallback = async (input) => {
      if (input.hook_event_name !== 'PreToolUse') return {};
      if (await osservatore.annullato()) {
        annullato = true;
        controllo.abort();
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: 'Richiesta annullata dall’utente.',
          },
        };
      }
      const argomenti = (input.tool_input ?? {}) as Record<string, unknown>;
      const percorso = percorsoRichiesto(input.tool_name, argomenti);
      if (percorso !== undefined && !dentro(radice, percorso)) {
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              'Percorso fuori dalla directory di lavoro: esistono solo i documenti della workspace.',
          },
        };
      }
      if (input.tool_name === 'Read' && percorso !== undefined) {
        const rel = relativoPosix(radice, percorso);
        if (!documentiLetti.includes(rel)) documentiLetti.push(rel);
      }
      await osservatore.passo({
        tipo: 'attivita',
        etichetta: etichettaAttivita(input.tool_name, argomenti, radice, richiesta.titoloPer),
        strumento: input.tool_name,
        dettaglio: argomenti,
      });
      return {};
    };

    /* `tools` è il set dei tool integrati; quelli MCP (il server `velia`)
       entrano da `allowedTools`, così non chiedono mai un permesso. */
    const opzioni: Options = {
      cwd: radice,
      model: modello,
      ...(fornitore.env && { env: fornitore.env }),
      ...(this.opzioni.effort && !fornitore.terzo && { effort: this.opzioni.effort }),
      systemPrompt: richiesta.promptSistema,
      tools: ['Read', 'Grep', 'Glob'],
      allowedTools: ['Read', 'Grep', 'Glob', ...(richiesta.strumenti?.nomi ?? [])],
      ...(richiesta.strumenti && { mcpServers: { velia: richiesta.strumenti.server } }),
      disallowedTools: ['Bash', 'Write', 'Edit', 'NotebookEdit', 'WebFetch', 'WebSearch', 'Task', 'Skill'],
      permissionMode: 'default',
      maxTurns: this.opzioni.maxTurni,
      maxBudgetUsd: this.opzioni.budgetUsd,
      persistSession: false,
      settingSources: [],
      includePartialMessages: true,
      abortController: controllo,
      hooks: { PreToolUse: [{ hooks: [hookPreTool] }] },
    };

    const sessione = query({ prompt: richiesta.promptUtente, options: opzioni });

    /* La sentinella fa due cose fra un evento e l'altro: onora l'annullamento
       (es. mentre il modello scrive la risposta) e misura il silenzio — un
       gateway che non risponde più si vede solo da qui. */
    const silenzioMs = this.opzioni.silenzioMs ?? 180_000;
    let ultimoSegnale = Date.now();
    let silenzio = false;
    const sentinella = setInterval(() => {
      if (!silenzio && Date.now() - ultimoSegnale > silenzioMs) {
        silenzio = true;
        controllo.abort();
        return;
      }
      void osservatore.annullato().then((si) => {
        if (si) {
          annullato = true;
          controllo.abort();
        }
      });
    }, this.opzioni.intervalloAnnullamentoMs ?? 3000);

    const contati = { input: 0, output: 0, cacheLettura: 0, cacheScrittura: 0 };
    let outputTurno = 0;
    /* Per i gateway che non riportano l'input (HostYourAI manda 0 ovunque)
       l'input di ogni turno si stima dal contesto che il modello ha
       ricevuto fin lì: prompt, risposte precedenti, risultati dei tool.
       ~3,6 caratteri per token sull'italiano; l'addebito lo dichiara. */
    let caratteriContesto = richiesta.promptSistema.length + richiesta.promptUtente.length;
    let inputStimato = false;

    let esito: EsitoSessione | undefined;
    try {
      for await (const messaggio of sessione) {
        ultimoSegnale = Date.now();
        if (messaggio.type === 'stream_event' && messaggio.parent_tool_use_id === null) {
          const evento = messaggio.event;
          /* I token si contano qui, turno per turno, dagli eventi grezzi: il
             totale dell'SDK a fine sessione è affidabile con Anthropic, ma un
             gateway terzo lo lascia a zero sull'input. `message_start` porta
             l'input (e la cache), `message_delta` l'output cumulato del turno. */
          if (evento.type === 'message_start') {
            const u = evento.message.usage;
            const inputRiportato = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
            if (inputRiportato > 0) {
              contati.input += u.input_tokens ?? 0;
              contati.cacheLettura += u.cache_read_input_tokens ?? 0;
              contati.cacheScrittura += u.cache_creation_input_tokens ?? 0;
            } else {
              contati.input += Math.round(caratteriContesto / 3.6);
              inputStimato = true;
            }
            outputTurno = u.output_tokens ?? 0;
            flusso.inizioTurno();
          } else if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
            await flusso.delta(evento.delta.text);
          } else if (evento.type === 'message_delta') {
            outputTurno = Math.max(outputTurno, evento.usage.output_tokens ?? 0);
            contati.output += outputTurno;
            outputTurno = 0;
            await flusso.fineTurno(evento.delta.stop_reason);
          }
        } else if (messaggio.type === 'assistant' || messaggio.type === 'user') {
          /* Ciò che entra nel contesto dei turni successivi: le risposte del
             modello (testo e chiamate ai tool) e i risultati dei tool. */
          if (messaggio.parent_tool_use_id === null) {
            caratteriContesto += JSON.stringify(messaggio.message.content ?? '').length;
          }
        } else if (messaggio.type === 'result') {
          esito = this.esitoDa(
            messaggio,
            flusso.testoCompleto,
            documentiLetti,
            inizio,
            annullato,
            modello,
            fornitore.tariffaUsdPerMilione,
            contati,
            inputStimato,
          );
        }
      }
    } catch (errore) {
      if (annullato) {
        esito = {
          testo: flusso.testoCompleto,
          terminato: 'annullato',
          modello,
          turni: 0,
          durataMs: Date.now() - inizio,
          costoUsd: 0,
          token: { input: 0, output: 0, cacheLettura: 0, cacheScrittura: 0 },
          documentiLetti,
        };
      } else if (!silenzio) {
        throw errore;
      }
    } finally {
      clearInterval(sentinella);
    }

    if (!esito) {
      esito = {
        testo: flusso.testoCompleto,
        terminato: annullato ? 'annullato' : 'errore',
        ...(!annullato && {
          errore: silenzio
            ? `nessun segnale dal modello ${modello} per ${Math.round(silenzioMs / 1000)} s: sessione chiusa`
            : 'la sessione si è chiusa senza un risultato',
        }),
        modello,
        turni: 0,
        durataMs: Date.now() - inizio,
        costoUsd: 0,
        token: { input: 0, output: 0, cacheLettura: 0, cacheScrittura: 0 },
        documentiLetti,
      };
    }
    return esito;
  }

  private esitoDa(
    m: Extract<SDKMessage, { type: 'result' }>,
    testoCompleto: string,
    documentiLetti: string[],
    inizio: number,
    annullato: boolean,
    modello: string,
    tariffa?: number,
    contati?: { input: number; output: number; cacheLettura: number; cacheScrittura: number },
    inputStimato = false,
  ): EsitoSessione {
    const dallSdk = {
      input: m.usage.input_tokens,
      output: m.usage.output_tokens,
      cacheLettura: m.usage.cache_read_input_tokens,
      cacheScrittura: m.usage.cache_creation_input_tokens,
    };
    /* Il conteggio dallo stream vince quando ha visto più dell'SDK (i
       gateway terzi non riportano l'input nel totale); altrimenti l'SDK, che
       aggrega anche i sottoprocessi che lo stream non mostra. */
    const somma = (t: typeof dallSdk) => t.input + t.output + t.cacheLettura + t.cacheScrittura;
    const daStream = Boolean(contati && somma(contati) > somma(dallSdk));
    const token = daStream && contati ? contati : dallSdk;
    const tokenStimati = daStream && inputStimato;
    const base = {
      modello,
      turni: m.num_turns,
      durataMs: Date.now() - inizio,
      /* Un fornitore terzo non è nel listino dell'SDK: il costo si calcola alla tariffa del catalogo. */
      costoUsd: tariffa !== undefined ? costoATariffa(token, tariffa) : m.total_cost_usd,
      token,
      documentiLetti,
      ...(tokenStimati && { tokenStimati: true }),
    };
    if (annullato) return { ...base, testo: testoCompleto, terminato: 'annullato' };
    if (m.subtype === 'success') {
      // Se nulla è passato in streaming (risposta breve), il risultato è il testo.
      return { ...base, testo: testoCompleto || m.result, terminato: 'completato' };
    }
    if (m.subtype === 'error_max_turns' || m.subtype === 'error_max_budget_usd') {
      return {
        ...base,
        testo: testoCompleto,
        terminato: 'budget',
        errore: m.subtype === 'error_max_turns' ? 'tetto di turni raggiunto' : 'tetto di spesa raggiunto',
      };
    }
    return {
      ...base,
      testo: testoCompleto,
      terminato: 'errore',
      errore: m.errors.join('; ') || m.subtype,
    };
  }
}

/** Il path su cui opera un tool di lettura, se ne ha uno. */
function percorsoRichiesto(tool: string, input: Record<string, unknown>): string | undefined {
  const grezzo = tool === 'Read' ? input['file_path'] : input['path'];
  return typeof grezzo === 'string' && grezzo ? grezzo : undefined;
}

/**
 * Il path assoluto di ciò che il tool chiede. Su Windows `\prova.md` è
 * "assoluto senza disco" (radice della cwd): il Read dell'SDK a volte scrive
 * così, e va letto come relativo alla workspace, non come `C:\prova.md`.
 */
function assolutoIn(radice: string, percorso: string): string {
  const radiceNuda = /^[\\/](?![\\/])/.test(percorso) && !/^[a-zA-Z]:/.test(percorso);
  if (isAbsolute(percorso) && !(process.platform === 'win32' && radiceNuda)) return resolve(percorso);
  return resolve(radice, percorso.replace(/^[\\/]+/, ''));
}

/** `percorso` (assoluto o relativo a `radice`) sta dentro `radice`? */
export function dentro(radice: string, percorso: string): boolean {
  const rel = relative(resolve(radice), assolutoIn(radice, percorso));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function relativoPosix(radice: string, percorso: string): string {
  return relative(resolve(radice), assolutoIn(radice, percorso)).split(sep).join('/');
}

/**
 * Le etichette che l'utente legge mentre il motore lavora: parlano di
 * documenti e ricerche, mai di file, indici o sintassi — quelli sono
 * architettura, e l'utente non deve vederla.
 */
export function etichettaAttivita(
  tool: string,
  input: Record<string, unknown>,
  radice: string,
  titoloPer?: (pathRelativo: string) => string | undefined,
): string {
  const documento = (p: unknown): { indice: boolean; titolo?: string } => {
    if (typeof p !== 'string' || !p) return { indice: false };
    const rel = relativoPosix(radice, p);
    if (/(^|\/)INDICE\.md$/i.test(rel)) return { indice: true };
    const titolo = titoloPer?.(rel);
    return { indice: false, ...(titolo && { titolo: accorcia(titolo, 70) }) };
  };
  switch (tool) {
    case 'Grep': {
      const dove = documento(input['path']);
      const termini = semplificaPattern(input['pattern']);
      const oggetto = termini ? `«${termini}»` : 'nel testo';
      if (dove.indice) return `Consulto l’indice dell’archivio`;
      return dove.titolo ? `Cerco ${oggetto} in «${dove.titolo}»` : `Cerco ${oggetto} negli archivi`;
    }
    case 'Glob':
      return 'Guardo quali documenti ci sono in archivio';
    case 'Read': {
      const cosa = documento(input['file_path']);
      if (cosa.indice) return 'Consulto l’indice dell’archivio';
      const oltre = typeof input['offset'] === 'number' && input['offset'] > 1;
      if (!cosa.titolo) return oltre ? 'Continuo a leggere' : 'Leggo un documento';
      return `${oltre ? 'Continuo a leggere' : 'Leggo'} «${cosa.titolo}»`;
    }
    case 'mcp__velia__genera_documento': {
      const titolo = typeof input['titolo'] === 'string' ? accorcia(input['titolo'], 70) : '';
      return titolo ? `Preparo il documento «${titolo}»` : 'Preparo il documento';
    }
    default:
      return 'Sto lavorando alla risposta';
  }
}

/**
 * Da un pattern di ricerca ai termini che l'utente riconosce: le classi
 * `[Ff]urto` tornano parole, gli `|` diventano virgole, gli ancoraggi
 * spariscono. Se resta sintassi che non si sa tradurre, meglio niente che
 * un'espressione regolare in faccia all'utente.
 */
export function semplificaPattern(pattern: unknown): string | undefined {
  if (typeof pattern !== 'string' || !pattern.trim()) return undefined;
  const termini = pattern
    .replace(/\[([A-Za-zÀ-ÿ])([A-Za-zÀ-ÿ])\]/g, (tutto, a: string, b: string) =>
      a.toLowerCase() === b.toLowerCase() ? a.toLowerCase() : tutto,
    )
    .replace(/\\([.\-()€])/g, '$1')
    .replace(/\\[bBdsSwW]/g, ' ')
    .replace(/[\^$]/g, '')
    .replace(/\.[*+?]/g, ' ')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!termini || /[\\[\]{}()*+?^$]/.test(termini)) return undefined;
  return accorcia(termini, 60);
}

function accorcia(testo: string, n: number): string {
  const pulito = testo.replace(/\s+/g, ' ').trim();
  return pulito.length <= n ? pulito : `${pulito.slice(0, n - 1).trimEnd()}…`;
}
