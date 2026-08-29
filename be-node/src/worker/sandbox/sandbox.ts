import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * La sandbox dell'Esportazione elaborata vista dal worker: un container
 * effimero per job (Docker in locale, Machine su Fly.io) con dentro Claude
 * Code (Agent SDK), gli strumenti documentali e il runner HTTP di
 * `sandbox/server.mjs`. Il worker ci manda i file e il compito, ascolta lo
 * stream della sessione, ritira i documenti consegnati e la distrugge.
 *
 * Nel container entrano solo il token del job e la chiave Anthropic della
 * sandbox (dedicata, con tetto di spesa): il runner la tiene dietro un
 * proxy locale, il modello non la vede. Niente database, niente Storage.
 */

const eseguiFile = promisify(execFile);

export interface EsitoComando {
  stdout: string;
  stderr: string;
  codice: number;
  scaduto: boolean;
}

export interface VoceSandbox {
  path: string;
  byte: number;
  dir: boolean;
}

export interface ParametriSessione {
  promptSistema: string;
  promptUtente: string;
  modello: string;
  maxTurni?: number;
  budgetUsd?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface EsitoSessioneSandbox {
  terminato: 'completato' | 'annullato' | 'budget' | 'errore';
  errore?: string;
  testo: string;
  turni: number;
  durataMs: number;
  costoUsd: number;
  token: { input: number; output: number; cacheLettura: number; cacheScrittura: number };
  modello: string;
}

export interface Consegnato {
  path: string;
  nome: string;
  formato: string;
  byte: number;
}

/** Gli eventi dello stream della sessione, come li manda il runner. */
export type EventoSandbox =
  | { tipo: 'attivita'; strumento: string; input: Record<string, unknown> }
  | { tipo: 'testo'; delta: string }
  | { tipo: 'consegna'; path: string; nome: string; formato: string; byte: number }
  | { tipo: 'fine'; esito: EsitoSessioneSandbox; consegnati: Consegnato[] };

export interface SandboxAvviata {
  /** L'indirizzo base del runner. */
  url: string;
  token: string;
  /** Intestazioni in più per raggiungere proprio questa istanza (Fly). */
  intestazioni?: Record<string, string>;
  chiudi(): Promise<void>;
}

export interface AvviatoreSandbox {
  readonly nome: string;
  avvia(jobId: string): Promise<SandboxAvviata>;
}

/** Il client del runner: una richiesta per ogni cosa che si fa lì dentro. */
export class Sandbox {
  constructor(private readonly istanza: SandboxAvviata) {}

  private intestazioni(tipo?: string): Record<string, string> {
    return {
      'x-velia-token': this.istanza.token,
      ...(tipo && { 'content-type': tipo }),
      ...this.istanza.intestazioni,
    };
  }

  private async richiesta(metodo: string, percorso: string, corpo?: Buffer | string, tipo = 'application/octet-stream'): Promise<Response> {
    const r = await fetch(`${this.istanza.url}${percorso}`, {
      method: metodo,
      headers: this.intestazioni(corpo !== undefined ? tipo : undefined),
      ...(corpo !== undefined && { body: corpo }),
    });
    if (!r.ok && r.status !== 204) {
      const testo = await r.text().catch(() => '');
      throw new Error(`sandbox ${metodo} ${percorso}: ${r.status} ${testo.slice(0, 300)}`);
    }
    return r;
  }

  async esegui(cmd: string, opzioni: { timeoutMs?: number; cwd?: string } = {}): Promise<EsitoComando> {
    const r = await this.richiesta('POST', '/esegui', JSON.stringify({ cmd, ...opzioni }), 'application/json');
    return (await r.json()) as EsitoComando;
  }

  async scrivi(percorso: string, contenuto: Buffer | string): Promise<void> {
    await this.richiesta('PUT', `/file?path=${encodeURIComponent(percorso)}`, Buffer.from(contenuto));
  }

  async leggi(percorso: string): Promise<Buffer> {
    const r = await this.richiesta('GET', `/file?path=${encodeURIComponent(percorso)}`);
    return Buffer.from(await r.arrayBuffer());
  }

  async elenca(dir = ''): Promise<VoceSandbox[]> {
    const r = await this.richiesta('GET', `/elenco?dir=${encodeURIComponent(dir)}`);
    return (await r.json()) as VoceSandbox[];
  }

  /** Un archivio zip estratto sotto `dir`: il modo per portare dentro una workspace intera. */
  async caricaArchivio(dir: string, zip: Buffer): Promise<void> {
    await this.richiesta('PUT', `/archivio?dir=${encodeURIComponent(dir)}`, zip, 'application/zip');
  }

  /**
   * La sessione di Claude Code nella sandbox: gli eventi arrivano man mano
   * (attività, testo, consegne), l'ultimo è `fine` con l'esito. Il runner li
   * numera e li tiene in un diario: se il socket cade (il 29/08/2026 il
   * worker su Render lo perdeva verso la Machine dopo 5 minuti esatti, a
   * lavoro quasi finito) ci si riaggancia con `GET /sessione/eventi?da=N`
   * e si riprende dal numero mancante, senza perdere né ripetere niente. Il
   * segnale di annullamento ferma tutto: la DELETE la manda chi annulla.
   */
  async *sessione(parametri: ParametriSessione, segnale?: AbortSignal): AsyncGenerator<EventoSandbox> {
    let risposta = await fetch(`${this.istanza.url}/sessione`, {
      method: 'POST',
      headers: this.intestazioni('application/json'),
      body: JSON.stringify(parametri),
      ...(segnale && { signal: segnale }),
    });
    if (!risposta.ok || !risposta.body) {
      throw new Error(`sandbox POST /sessione: ${risposta.status} ${(await risposta.text().catch(() => '')).slice(0, 300)}`);
    }

    let prossimo = 0;
    let cadute = 0;
    for (;;) {
      const corpo = risposta.body;
      try {
        if (!corpo) throw new Error('stream senza corpo');
        for await (const dati of blocchiSse(corpo)) {
          const { indice, evento } = interpretaVoce(dati);
          if (indice !== undefined) {
            if (indice < prossimo) continue; // già visto: il diario riparte da prima
            prossimo = indice + 1;
          }
          cadute = 0;
          yield evento;
          if (evento.tipo === 'fine') return;
        }
      } catch (errore) {
        if (segnale?.aborted) throw errore;
      }
      /* Lo stream si è chiuso senza `fine`: non è la sessione, è il canale. */
      if (segnale?.aborted) return;
      if (++cadute > 30) throw new Error('la sandbox ha chiuso lo stream e non risponde più');
      await new Promise((ok) => setTimeout(ok, 1500));
      const r = await fetch(`${this.istanza.url}/sessione/eventi?da=${prossimo}`, {
        headers: this.intestazioni(),
        ...(segnale && { signal: segnale }),
      }).catch(() => undefined);
      if (r?.status === 404) throw new Error('la sandbox ha perso la sessione');
      if (!r?.ok || !r.body) continue;
      risposta = r;
    }
  }

  async annulla(): Promise<void> {
    await this.richiesta('DELETE', '/sessione').catch(() => undefined);
  }

  chiudi(): Promise<void> {
    return this.istanza.chiudi();
  }
}

const nuovoToken = (): string => randomBytes(24).toString('hex');

/** I blocchi `data:` di uno stream SSE, uno per volta; i commenti (il battito) si saltano. */
async function* blocchiSse(corpo: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const lettore = corpo.getReader();
  const decodifica = new TextDecoder();
  let resto = '';
  for (;;) {
    const lettura = (await lettore.read()) as { done: boolean; value?: Uint8Array };
    if (lettura.done) return;
    if (lettura.value) resto += decodifica.decode(lettura.value, { stream: true });
    let confine: number;
    while ((confine = resto.indexOf('\n\n')) >= 0) {
      const blocco = resto.slice(0, confine);
      resto = resto.slice(confine + 2);
      const dati = blocco
        .split('\n')
        .filter((riga) => riga.startsWith('data: '))
        .map((riga) => riga.slice(6))
        .join('\n');
      if (dati) yield dati;
    }
  }
}

/** Una voce del diario `{ i, e }`; un evento nudo (runner vecchio) passa senza numero. */
export function interpretaVoce(dati: string): { indice?: number; evento: EventoSandbox } {
  const voce = JSON.parse(dati) as { i?: unknown; e?: unknown; tipo?: unknown };
  if (typeof voce.i === 'number' && voce.e && typeof voce.e === 'object') {
    return { indice: voce.i, evento: voce.e as EventoSandbox };
  }
  return { evento: voce as unknown as EventoSandbox };
}

/** Aspetta che il runner risponda a /salute: la Machine su Fly parte in pochi secondi, Docker subito. */
async function aspettaPronta(url: string, intestazioni: Record<string, string> | undefined, attesaMs: number): Promise<void> {
  const scadenza = Date.now() + attesaMs;
  let ultimo = '';
  while (Date.now() < scadenza) {
    try {
      const r = await fetch(`${url}/salute`, { headers: { ...intestazioni }, signal: AbortSignal.timeout(5000) });
      if (r.ok) return;
      ultimo = `${r.status}`;
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
    }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  throw new Error(`la sandbox non ha risposto entro ${Math.round(attesaMs / 1000)} s (${ultimo})`);
}

// ---------------------------------------------------------------------------
// Docker (sviluppo e collaudo in locale)
// ---------------------------------------------------------------------------

export class AvviatoreDocker implements AvviatoreSandbox {
  readonly nome = 'docker';
  constructor(
    private readonly immagine: string,
    private readonly chiaveApi: string,
  ) {}

  async avvia(jobId: string): Promise<SandboxAvviata> {
    const token = nuovoToken();
    const nome = `velia-sandbox-${jobId.slice(0, 8)}-${Date.now().toString(36)}`;
    /* I segreti NON stanno sulla riga di comando: `-e NOME` senza valore fa
       leggere a Docker l'ambiente del processo `docker`. Così non finiscono
       né in `ps`, né nel messaggio «Command failed: docker run …» che
       execFile compone con gli argomenti e che risale fino all'utente. */
    try {
      await eseguiFile(
        'docker',
        [
          'run', '-d', '--rm', '--name', nome,
          '--cap-add', 'NET_ADMIN', '--cap-add', 'SYS_ADMIN',
          '--memory', '3g', '--cpus', '2',
          '-e', 'SANDBOX_TOKEN',
          '-e', 'ANTHROPIC_API_KEY',
          '-p', '127.0.0.1:0:8080',
          this.immagine,
        ],
        { env: { ...process.env, SANDBOX_TOKEN: token, ANTHROPIC_API_KEY: this.chiaveApi } },
      );
    } catch (errore) {
      throw new Error(motivoDocker(errore, this.immagine), { cause: errore });
    }
    const porta = await eseguiFile('docker', ['port', nome, '8080/tcp']);
    const numero = /:(\d+)\s*$/m.exec(porta.stdout)?.[1];
    if (!numero) {
      await eseguiFile('docker', ['rm', '-f', nome]).catch(() => undefined);
      throw new Error(`porta della sandbox non trovata: ${porta.stdout}`);
    }
    const url = `http://127.0.0.1:${numero}`;
    try {
      await aspettaPronta(url, undefined, 30_000);
    } catch (e) {
      await eseguiFile('docker', ['rm', '-f', nome]).catch(() => undefined);
      throw e;
    }
    return {
      url,
      token,
      chiudi: async () => {
        await eseguiFile('docker', ['rm', '-f', nome]).catch(() => undefined);
      },
    };
  }
}

/**
 * Il perché di un `docker run` fallito, detto a chi legge la chat: il daemon
 * spento (in locale: Rancher Desktop non avviato) e l'immagine mancante sono
 * i due casi veri; il resto porta lo stderr, corto, mai la riga di comando.
 */
export function motivoDocker(errore: unknown, immagine: string): string {
  const stderr = (errore as { stderr?: unknown })?.stderr;
  const dettaglio = (typeof stderr === 'string' ? stderr : errore instanceof Error ? errore.message : String(errore)).trim();
  if (/docker_engine|docker\.sock|Cannot connect to the Docker daemon|daemon running|error during connect/i.test(dettaglio)) {
    return 'Docker non è in esecuzione: avvia Rancher Desktop (o Docker Desktop) e riprova.';
  }
  if (/Unable to find image|No such image|pull access denied|not found: manifest/i.test(dettaglio)) {
    return `l'immagine della sandbox «${immagine}» non c'è: va costruita con «docker build -t ${immagine} -f sandbox/Dockerfile sandbox».`;
  }
  const riga = dettaglio.split('\n').filter((r) => r.trim() && !r.startsWith('Command failed')).at(-1) ?? 'motivo sconosciuto';
  return `docker run non riuscito: ${riga.slice(0, 300)}`;
}

// ---------------------------------------------------------------------------
// Runner remoto sempre acceso (Render, Private Service): un servizio, un job
// per volta, /lavoro svuotato fra l'uno e l'altro
// ---------------------------------------------------------------------------

export interface OpzioniRemoto {
  /** L'indirizzo del servizio sulla rete privata, es. `http://velia-sandbox:10000`. */
  url: string;
  /** Il segreto condiviso con cui il runner è stato avviato (`SANDBOX_TOKEN`). */
  token: string;
  /** Quanto aspettare che il runner si liberi da un altro job. */
  attesaMs?: number;
}

/**
 * Il runner della sandbox come servizio fisso (29/08/2026): dopo che le
 * Machine su Fly morivano a 5 minuti esatti, il runner gira su Render
 * accanto al worker, sulla rete privata, senza proxy pubblici in mezzo e
 * senza boot. Un solo job per volta: `POST /reset` risponde 409 finché una
 * sessione è in corso e il worker aspetta il suo turno. Sul runner non ci
 * sono database né Storage: solo la workspace del job, cancellata dopo.
 */
export class AvviatoreRemoto implements AvviatoreSandbox {
  readonly nome = 'render';
  constructor(private readonly o: OpzioniRemoto) {}

  private async reset(): Promise<number> {
    const r = await fetch(`${this.o.url}/reset`, {
      method: 'POST',
      headers: { 'x-velia-token': this.o.token },
      signal: AbortSignal.timeout(30_000),
    }).catch(() => undefined);
    return r?.status ?? 0;
  }

  async avvia(): Promise<SandboxAvviata> {
    const scadenza = Date.now() + (this.o.attesaMs ?? 10 * 60_000);
    for (;;) {
      const stato = await this.reset();
      if (stato === 204) break;
      if (stato === 401) throw new Error('il motore documentale rifiuta il token: SANDBOX_TOKEN diverso fra worker e runner');
      if (Date.now() > scadenza) {
        throw new Error(
          stato === 409
            ? 'il motore documentale è occupato da un altro lavoro: riprova fra qualche minuto'
            : 'il motore documentale non risponde',
        );
      }
      await new Promise((ok) => setTimeout(ok, 3000));
    }
    await aspettaPronta(this.o.url, undefined, 30_000);
    return {
      url: this.o.url,
      token: this.o.token,
      chiudi: async () => {
        /* A fine job si svuota subito: i documenti del tenant non restano lì in attesa del prossimo. */
        await this.reset();
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Fly.io Machines (produzione): una micro-VM per job, distrutta alla fine
// ---------------------------------------------------------------------------

export interface OpzioniFly {
  token: string;
  app: string;
  immagine: string;
  regione: string;
  chiaveApi: string;
  cpu?: number;
  memoriaMb?: number;
}

export class AvviatoreFly implements AvviatoreSandbox {
  readonly nome = 'fly';
  constructor(private readonly o: OpzioniFly) {}

  private async api<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
    const r = await fetch(`https://api.machines.dev/v1/apps/${this.o.app}${percorso}`, {
      method: metodo,
      headers: { authorization: `Bearer ${this.o.token}`, 'content-type': 'application/json' },
      ...(corpo !== undefined && { body: JSON.stringify(corpo) }),
    });
    const testo = await r.text();
    if (!r.ok) throw new Error(`Fly ${metodo} ${percorso}: ${r.status} ${testo.slice(0, 300)}`);
    return (testo ? JSON.parse(testo) : {}) as T;
  }

  async avvia(jobId: string): Promise<SandboxAvviata> {
    const token = nuovoToken();
    const macchina = await this.api<{ id: string }>('POST', '/machines', {
      name: `sandbox-${jobId.slice(0, 8)}-${Date.now().toString(36)}`,
      region: this.o.regione,
      config: {
        image: this.o.immagine,
        env: { SANDBOX_TOKEN: token, ANTHROPIC_API_KEY: this.o.chiaveApi },
        guest: { cpu_kind: 'shared', cpus: this.o.cpu ?? 2, memory_mb: this.o.memoriaMb ?? 3072 },
        auto_destroy: true,
        restart: { policy: 'no' },
        services: [
          { protocol: 'tcp', internal_port: 8080, autostop: 'off', ports: [{ port: 443, handlers: ['tls', 'http'] }] },
        ],
        stop_config: { timeout: '5s' },
      },
    });
    const url = `https://${this.o.app}.fly.dev`;
    const intestazioni = { 'fly-force-instance-id': macchina.id };
    const chiudi = async () => {
      await this.api('DELETE', `/machines/${macchina.id}?force=true`).catch(() => undefined);
    };
    try {
      await this.api('GET', `/machines/${macchina.id}/wait?state=started&timeout=60`);
      await aspettaPronta(url, intestazioni, 90_000);
    } catch (e) {
      await chiudi();
      throw e;
    }
    return { url, token, intestazioni, chiudi };
  }
}
