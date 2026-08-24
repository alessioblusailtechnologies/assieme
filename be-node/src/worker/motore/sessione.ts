import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  query,
  type HookCallback,
  type Options,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';

import { FlussoTesto } from './flusso-testo.js';

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
   * Il titolo del documento per un path relativo della workspace: le
   * attività parlano all'utente coi titoli che conosce, mai coi nomi dei
   * file — che sono architettura, non contenuto.
   */
  titoloPer?: (pathRelativo: string) => string | undefined;
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

export class MotoreAgentSdk implements Motore {
  constructor(private readonly opzioni: OpzioniMotoreSdk) {}

  async interroga(richiesta: RichiestaMotore, osservatore: OsservatoreSessione): Promise<EsitoSessione> {
    const inizio = Date.now();
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
          if (evento.type === 'message_start') flusso.inizioTurno();
          else if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
            await flusso.delta(evento.delta.text);
          } else if (evento.type === 'message_delta') {
            await flusso.fineTurno(evento.delta.stop_reason);
          }
        } else if (messaggio.type === 'result') {
          esito = this.esitoDa(messaggio, flusso.testoCompleto, documentiLetti, inizio, annullato);
        }
      }
    } catch (errore) {
      if (annullato) {
        esito = {
          testo: flusso.testoCompleto,
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
        testo: flusso.testoCompleto,
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
    testoCompleto: string,
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
