import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { promptRichiesta, promptSandbox } from '../src/worker/sandbox/istruzioni.js';
import { AvviatoreDocker, AvviatoreRemoto, Sandbox, interpretaVoce, motivoDocker } from '../src/worker/sandbox/sandbox.js';

/**
 * La sandbox dell'Esportazione elaborata: il prompt (puro) e, se Docker e
 * l'immagine `velia-sandbox` ci sono, il giro vero col container — esegui,
 * scrivi, leggi, elenco, archivio, chiusura. Senza Docker si salta.
 */

const eseguiFile = promisify(execFile);

async function dockerConImmagine(): Promise<boolean> {
  try {
    const r = await eseguiFile('docker', ['image', 'inspect', 'velia-sandbox', '--format', '{{.Id}}']);
    return r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

describe('il prompt della sandbox', () => {
  it('racconta strumenti, ciclo di lavoro, identità e template', () => {
    const p = promptSandbox({
      identita: { colorePrimario: '#aa3344', recapiti: 'Via Roma 1', firma: 'Agenzia X', logoPath: '/lavoro/identita/logo.png' },
      template: { nome: 'Proposta breve', formato: 'docx', path: '/lavoro/template/proposta-breve.docx' },
      formato: 'pdf',
      documenti: [{ path: '/lavoro/workspace/a.md', titolo: 'Condizioni', archivio: 'pubblico' }],
    });
    for (const atteso of ['pdftoppm', 'Read', 'consegna', '#aa3344', 'Proposta breve', '/lavoro/workspace/a.md', 'soffice', 'chromium-headless']) {
      expect(p).toContain(atteso);
    }
    expect(promptSandbox({ identita: { colorePrimario: '#000000', recapiti: '', firma: '' }, formato: 'xlsx', documenti: [] })).toContain(
      'Nessun template scelto',
    );
    const r = promptRichiesta({ formato: 'docx', titolo: 'T', istruzioni: 'fai X', contenuto: '# ciao' });
    expect(r).toContain('DOCX');
    expect(r).toContain('fai X');
    expect(r).toContain('# ciao');
  });
});

describe.skipIf(!(await dockerConImmagine()))('la sandbox Docker vera', () => {
  let sandbox: Sandbox;

  beforeAll(async () => {
    sandbox = new Sandbox(await new AvviatoreDocker('velia-sandbox', process.env['ANTHROPIC_API_KEY'] ?? 'nessuna').avvia('test-sandbox-0001'));
  }, 60_000);

  afterAll(async () => {
    await sandbox?.chiudi();
  });

  it('esegue comandi, scambia file e archivi, e ha gli strumenti documentali', async () => {
    const chi = await sandbox.esegui('whoami && python3 -c "import docx, openpyxl; print(\'py ok\')" && node -e "require(\'docx\'); console.log(\'node ok\')"');
    expect(chi.codice).toBe(0);
    expect(chi.stdout).toContain('lavoro');
    expect(chi.stdout).toContain('py ok');
    expect(chi.stdout).toContain('node ok');

    await sandbox.scrivi('tmp/prova.txt', 'ciao sandbox');
    expect((await sandbox.leggi('tmp/prova.txt')).toString()).toBe('ciao sandbox');
    expect((await sandbox.elenca('tmp')).some((v) => v.path === 'tmp/prova.txt')).toBe(true);

    /* HTML → PDF con Chromium, poi una pagina in PNG: il ciclo «guarda il risultato». */
    await sandbox.scrivi('tmp/p.html', '<html><body><h1>Prova</h1><p>VELIA</p></body></html>');
    const pdf = await sandbox.esegui('cd tmp && chromium-headless --print-to-pdf=p.pdf --no-pdf-header-footer p.html >/dev/null 2>&1; pdftoppm -png -r 40 p.pdf pag && ls', { timeoutMs: 120_000 });
    expect(pdf.stdout).toContain('p.pdf');
    expect(pdf.stdout).toMatch(/pag-?1\.png/);
    expect((await sandbox.leggi('tmp/p.pdf')).subarray(0, 4).toString()).toBe('%PDF');

    const scaduto = await sandbox.esegui('sleep 5', { timeoutMs: 1000 });
    expect(scaduto.scaduto).toBe(true);

    const fuori = await sandbox.esegui('cat /etc/hostname');
    expect(fuori.codice).toBe(0); // dentro il container si può; è il container a essere il confine
    await expect(sandbox.leggi('../etc/passwd')).rejects.toThrow();
  }, 180_000);
});

/*
 * Il perché di un `docker run` fallito, come arriva in chat: leggibile, e
 * senza mai la riga di comando (che un tempo portava le variabili d'ambiente).
 */
describe('motivoDocker', () => {
  const comando = 'Command failed: docker run -d --rm -e SANDBOX_TOKEN -e ANTHROPIC_API_KEY velia-sandbox';

  it('daemon spento (Windows e Linux) → avvia Rancher/Docker', () => {
    const windows = Object.assign(new Error(comando), {
      stderr: 'failed to connect to the docker API at npipe:////./pipe/docker_engine; check if the path is correct and if the daemon is running',
    });
    expect(motivoDocker(windows, 'velia-sandbox')).toMatch(/Docker non è in esecuzione/);
    const linux = Object.assign(new Error(comando), { stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock' });
    expect(motivoDocker(linux, 'velia-sandbox')).toMatch(/Docker non è in esecuzione/);
  });

  it('immagine mancante → come costruirla', () => {
    const e = Object.assign(new Error(comando), { stderr: "Unable to find image 'velia-sandbox:latest' locally" });
    expect(motivoDocker(e, 'velia-sandbox')).toContain('docker build -t velia-sandbox');
  });

  it('altro → lo stderr, corto, mai la riga di comando', () => {
    const e = Object.assign(new Error(comando), { stderr: 'docker: Error response from daemon: qualcosa.\nSee docker run --help.' });
    const motivo = motivoDocker(e, 'velia-sandbox');
    expect(motivo).toContain('docker run non riuscito');
    expect(motivo).not.toContain('Command failed');
    expect(motivo).not.toContain('ANTHROPIC_API_KEY');
    expect(motivoDocker(new Error(comando), 'velia-sandbox')).not.toContain('Command failed');
  });
});

/*
 * Il riaggancio: un runner finto che numera gli eventi, tronca lo stream a
 * metà (come un proxy che chiude), e serve il diario da `?da=N`. Il worker
 * deve riprendere dal numero mancante senza perdere né ripetere niente.
 */
describe('la sessione si riaggancia quando lo stream cade', () => {
  it('riceve tutti gli eventi una volta sola, fino alla fine', async () => {
    const { createServer } = await import('node:http');
    const diario = [
      { i: 0, e: { tipo: 'attivita', strumento: 'Bash', input: { command: 'ls' } } },
      { i: 1, e: { tipo: 'testo', delta: 'ciao' } },
      { i: 2, e: { tipo: 'attivita', strumento: 'Write', input: { file_path: '/lavoro/output/a.pdf' } } },
      { i: 3, e: { tipo: 'fine', esito: { terminato: 'completato', testo: 'fatto', turni: 2, durataMs: 1, costoUsd: 0, token: { input: 0, output: 0, cacheLettura: 0, cacheScrittura: 0 }, modello: 'm' }, consegnati: [] } },
    ];
    const richieste: string[] = [];
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      richieste.push(`${req.method} ${url.pathname}${url.search}`);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (req.method === 'POST' && url.pathname === '/sessione') {
        // I primi due, un battito, poi il socket muore senza `fine`.
        res.write(`data: ${JSON.stringify(diario[0])}\n\n:\n\ndata: ${JSON.stringify(diario[1])}\n\n`);
        setTimeout(() => res.socket?.destroy(), 50);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/sessione/eventi') {
        const da = Number(url.searchParams.get('da'));
        // Il diario riparte da uno prima, come farebbe un runner prudente: il doppione va scartato.
        for (const voce of diario.slice(Math.max(0, da - 1))) res.write(`data: ${JSON.stringify(voce)}\n\n`);
        res.end();
      }
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const porta = (server.address() as { port: number }).port;
    try {
      const sandbox = new Sandbox({ url: `http://127.0.0.1:${porta}`, token: 't', chiudi: () => Promise.resolve() });
      const ricevuti: string[] = [];
      for await (const evento of sandbox.sessione({ promptSistema: 's', promptUtente: 'u', modello: 'm' })) ricevuti.push(evento.tipo);
      expect(ricevuti).toEqual(['attivita', 'testo', 'attivita', 'fine']);
      expect(richieste).toEqual(['POST /sessione', 'GET /sessione/eventi?da=2']);
    } finally {
      server.close();
    }
  });

  it('una voce del diario porta il numero; un evento nudo passa senza', () => {
    expect(interpretaVoce('{"i":4,"e":{"tipo":"testo","delta":"x"}}')).toEqual({ indice: 4, evento: { tipo: 'testo', delta: 'x' } });
    expect(interpretaVoce('{"tipo":"testo","delta":"x"}')).toEqual({ evento: { tipo: 'testo', delta: 'x' } });
  });
});

/*
 * L'avviatore del runner fisso (Render): aspetta che il runner si liberi
 * (409 finché una sessione è in corso), poi lo usa; a fine job lo svuota.
 */
describe('AvviatoreRemoto', () => {
  it('aspetta il 409, parte al 204, e chiude con un altro reset', async () => {
    const { createServer } = await import('node:http');
    const richieste: string[] = [];
    let occupato = 1;
    const server = createServer((req, res) => {
      richieste.push(`${req.method} ${req.url} ${String(req.headers['x-velia-token'] ?? '-')}`);
      if (req.url === '/salute') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"pronto":true}');
      if (req.headers['x-velia-token'] !== 'segreto-condiviso-di-prova') return res.writeHead(401).end();
      if (req.method === 'POST' && req.url === '/reset') {
        if (occupato-- > 0) return res.writeHead(409).end();
        return res.writeHead(204).end();
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const a = new AvviatoreRemoto({ url, token: 'segreto-condiviso-di-prova', attesaMs: 20_000 });
      const inizio = Date.now();
      const ist = await a.avvia();
      expect(Date.now() - inizio).toBeGreaterThanOrEqual(2500); // un giro di attesa sul 409
      expect(ist.url).toBe(url);
      expect(ist.token).toBe('segreto-condiviso-di-prova');
      await ist.chiudi();
      expect(richieste.filter((r) => r.startsWith('POST /reset'))).toHaveLength(3);
      expect(richieste.some((r) => r.startsWith('GET /salute'))).toBe(true);
    } finally {
      server.close();
    }
  }, 15_000);

  it('con un token sbagliato non aspetta: lo dice subito', async () => {
    const { createServer } = await import('node:http');
    const server = createServer((_req, res) => res.writeHead(401).end());
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      await expect(new AvviatoreRemoto({ url, token: 'x', attesaMs: 5000 }).avvia()).rejects.toThrow(/SANDBOX_TOKEN/);
    } finally {
      server.close();
    }
  });
});

describe('AvviatoreRemoto: l\'indirizzo come lo dà Render', () => {
  it('completa lo schema e toglie la barra finale', async () => {
    const { createServer } = await import('node:http');
    const visti: string[] = [];
    const server = createServer((req, res) => {
      visti.push(req.url ?? '');
      if (req.url === '/salute') return res.writeHead(200, { 'content-type': 'application/json' }).end('{"pronto":true}');
      res.writeHead(204).end();
    });
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const porta = (server.address() as { port: number }).port;
    try {
      const ist = await new AvviatoreRemoto({ url: `127.0.0.1:${porta}/`, token: 'segreto-condiviso-di-prova' }).avvia();
      expect(ist.url).toBe(`http://127.0.0.1:${porta}`);
      expect(visti).toContain('/reset');
      expect(visti.some((v) => v.includes('//'))).toBe(false);
    } finally {
      server.close();
    }
  });
});
