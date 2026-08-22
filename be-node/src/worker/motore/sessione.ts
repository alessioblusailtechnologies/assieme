import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  query,
  type HookCallback,
  type Options,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

import { margineMarcatore } from './validazione.js';

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
}

/** Sotto questa lunghezza un testo fra due tool è narrazione, non risposta. */
const SOGLIA_TESTO_FINALE = 300;

export class MotoreAgentSdk implements Motore {
  constructor(private readonly opzioni: OpzioniMotoreSdk) {}

  async interroga(richiesta: RichiestaMotore, osservatore: OsservatoreSessione): Promise<EsitoSessione> {
    const inizio = Date.now();
    const radice = resolve(richiesta.directory);
    const controllo = new AbortController();
    const documentiLetti: string[] = [];
    let annullato = false;

    /* La verità sul testo: quello che abbiamo inoltrato all'utente. Il testo
       dei turni intermedi (fra due tool) è narrazione e diventa un'attività,
       a meno che non sia lungo abbastanza da essere già la risposta. */
    let testoEmesso = '';
    let bufferTurno = '';
    let inviatoDelTurno = 0;
    let turnoInStreaming = false;

    const inoltra = async (finoA: number): Promise<void> => {
      if (finoA <= inviatoDelTurno) return;
      const delta = bufferTurno.slice(inviatoDelTurno, finoA);
      inviatoDelTurno = finoA;
      testoEmesso += delta;
      await osservatore.passo({ tipo: 'testo', delta });
    };

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
        etichetta: etichettaAttivita(input.tool_name, argomenti, radice),
        strumento: input.tool_name,
        dettaglio: argomenti,
      });
      return {};
    };

    const opzioni: Options = {
      cwd: radice,
      model: this.opzioni.modello,
      ...(this.opzioni.effort && { effort: this.opzioni.effort }),
      systemPrompt: richiesta.promptSistema,
      tools: ['Read', 'Grep', 'Glob'],
      allowedTools: ['Read', 'Grep', 'Glob'],
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

    // L'annullamento fra un passo e l'altro senza tool (es. mentre scrive la risposta).
    const sentinella = setInterval(() => {
      void osservatore.annullato().then((si) => {
        if (si) {
          annullato = true;
          controllo.abort();
        }
      });
    }, this.opzioni.intervalloAnnullamentoMs ?? 3000);

    let esito: EsitoSessione | undefined;
    try {
      for await (const messaggio of sessione) {
        if (messaggio.type === 'stream_event' && messaggio.parent_tool_use_id === null) {
          const evento = messaggio.event;
          if (evento.type === 'message_start') {
            bufferTurno = '';
            inviatoDelTurno = 0;
            turnoInStreaming = false;
          } else if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
            bufferTurno += evento.delta.text;
            /* Oltre la soglia è la risposta: la si inoltra man mano, trattenendo
               la coda che potrebbe essere l'inizio del blocco finale. */
            if (turnoInStreaming || bufferTurno.length >= SOGLIA_TESTO_FINALE) {
              turnoInStreaming = true;
              await inoltra(bufferTurno.length - margineMarcatore(bufferTurno));
            }
          } else if (evento.type === 'message_delta') {
            if (evento.delta.stop_reason === 'tool_use') {
              /* Turno intermedio: ciò che non è ancora partito è narrazione. */
              const narrazione = bufferTurno.slice(inviatoDelTurno).trim();
              if (narrazione && !turnoInStreaming) {
                await osservatore.passo({ tipo: 'attivita', etichetta: accorcia(narrazione, 140) });
              } else if (narrazione) {
                await inoltra(bufferTurno.length);
                testoEmesso += '\n\n';
              }
            } else {
              await inoltra(bufferTurno.length);
            }
          }
        } else if (messaggio.type === 'result') {
          esito = this.esitoDa(messaggio, testoEmesso, documentiLetti, inizio, annullato);
        }
      }
    } catch (errore) {
      if (annullato) {
        esito = {
          testo: testoEmesso,
          terminato: 'annullato',
          modello: this.opzioni.modello,
          turni: 0,
          durataMs: Date.now() - inizio,
          costoUsd: 0,
          token: { input: 0, output: 0, cacheLettura: 0, cacheScrittura: 0 },
          documentiLetti,
        };
      } else {
        throw errore;
      }
    } finally {
      clearInterval(sentinella);
    }

    if (!esito) {
      esito = {
        testo: testoEmesso,
        terminato: annullato ? 'annullato' : 'errore',
        ...(!annullato && { errore: 'la sessione si è chiusa senza un risultato' }),
        modello: this.opzioni.modello,
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
    testoEmesso: string,
    documentiLetti: string[],
    inizio: number,
    annullato: boolean,
  ): EsitoSessione {
    const token = {
      input: m.usage.input_tokens,
      output: m.usage.output_tokens,
      cacheLettura: m.usage.cache_read_input_tokens,
      cacheScrittura: m.usage.cache_creation_input_tokens,
    };
    const base = {
      modello: this.opzioni.modello,
      turni: m.num_turns,
      durataMs: Date.now() - inizio,
      costoUsd: m.total_cost_usd,
      token,
      documentiLetti,
    };
    if (annullato) return { ...base, testo: testoEmesso, terminato: 'annullato' };
    if (m.subtype === 'success') {
      // Se nulla è passato in streaming (risposta breve), il risultato è il testo.
      return { ...base, testo: testoEmesso || m.result, terminato: 'completato' };
    }
    if (m.subtype === 'error_max_turns' || m.subtype === 'error_max_budget_usd') {
      return {
        ...base,
        testo: testoEmesso,
        terminato: 'budget',
        errore: m.subtype === 'error_max_turns' ? 'tetto di turni raggiunto' : 'tetto di spesa raggiunto',
      };
    }
    return {
      ...base,
      testo: testoEmesso,
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

/** Le etichette che l'utente legge mentre il motore lavora. */
export function etichettaAttivita(tool: string, input: Record<string, unknown>, radice: string): string {
  const nome = (p: unknown): string => {
    if (typeof p !== 'string' || !p) return '';
    const rel = relativoPosix(radice, p);
    return rel.split('/').pop() ?? rel;
  };
  const testo = (v: unknown): string => (typeof v === 'string' ? v : '');
  switch (tool) {
    case 'Grep': {
      const dove = nome(input['path']);
      return `Cerco «${testo(input['pattern'])}»${dove ? ` in ${dove}` : ' nei documenti'}`;
    }
    case 'Glob':
      return `Cerco i documenti ${testo(input['pattern'])}`;
    case 'Read': {
      const file = nome(input['file_path']);
      const offset = input['offset'];
      return `Leggo ${file}${typeof offset === 'number' && offset > 1 ? ` dalla riga ${offset}` : ''}`;
    }
    default:
      return `Uso ${tool}`;
  }
}

function accorcia(testo: string, n: number): string {
  const pulito = testo.replace(/\s+/g, ' ').trim();
  return pulito.length <= n ? pulito : `${pulito.slice(0, n - 1).trimEnd()}…`;
}
