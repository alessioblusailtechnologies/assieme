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
   * (attività, testo, consegne), l'ultimo è `fine` con l'esito. Il segnale
   * di annullamento chiude la connessione e il runner interrompe la CLI.
   */
  async *sessione(parametri: ParametriSessione, segnale?: AbortSignal): AsyncGenerator<EventoSandbox> {
    const r = await fetch(`${this.istanza.url}/sessione`, {
      method: 'POST',
      headers: this.intestazioni('application/json'),
      body: JSON.stringify(parametri),
      ...(segnale && { signal: segnale }),
    });
    if (!r.ok || !r.body) {
      throw new Error(`sandbox POST /sessione: ${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`);
    }
    const lettore = r.body.getReader();
    const decodifica = new TextDecoder();
    let resto = '';
    for (;;) {
      const lettura = (await lettore.read()) as { done: boolean; value?: Uint8Array };
      if (lettura.done) break;
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
        if (!dati) continue;
        yield JSON.parse(dati) as EventoSandbox;
      }
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
    await eseguiFile('docker', [
      'run', '-d', '--rm', '--name', nome,
      '--cap-add', 'NET_ADMIN', '--cap-add', 'SYS_ADMIN',
      '--memory', '3g', '--cpus', '2',
      '-e', `SANDBOX_TOKEN=${token}`,
      '-e', `ANTHROPIC_API_KEY=${this.chiaveApi}`,
      '-p', '127.0.0.1:0:8080',
      this.immagine,
    ]);
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
