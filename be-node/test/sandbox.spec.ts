import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { promptRichiesta, promptSandbox } from '../src/worker/sandbox/istruzioni.js';
import { AvviatoreDocker, Sandbox, motivoDocker } from '../src/worker/sandbox/sandbox.js';

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
