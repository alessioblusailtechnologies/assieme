/**
 * Il runner dentro la sandbox dell'Esportazione elaborata: Claude Code
 * (Agent SDK) che lavora in /lavoro con gli strumenti nativi e le skill
 * documentali, guidato dal worker via HTTP. Nessuna dipendenza oltre l'SDK.
 *
 *   GET  /salute                              → { pronto: true }
 *   PUT  /file?path=…       corpo binario     → 204
 *   GET  /file?path=…                         → corpo binario
 *   GET  /elenco?dir=…                        → [{ path, byte, dir }]
 *   PUT  /archivio?dir=…    corpo zip         → 204 (estratto con unzip)
 *   POST /esegui            { cmd, timeoutMs, cwd } → { stdout, stderr, codice, scaduto }
 *   POST /sessione          { promptSistema, promptUtente, modello, maxTurni, budgetUsd, effort }
 *                           → text/event-stream: attivita | testo | consegna | fine | errore
 *   DELETE /sessione                          → annulla la sessione in corso
 *
 * Ogni richiesta porta il token del job in `x-velia-token`. La chiave
 * Anthropic non è qui: sta nel processo `proxy.mjs` (utente `proxy`, nel
 * namespace principale con la rete). La CLI e i comandi del modello girano
 * come utente `lavoro` nel namespace isolato, che raggiunge solo il proxy
 * su 10.200.0.1:8787 (vedi avvio.sh e claude-lavoro). Il runner è root.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const PORTA = Number(process.env.PORTA ?? 8080);
const PORTA_PROXY = 8787;
const TOKEN = process.env.SANDBOX_TOKEN ?? '';
const CHIAVE = process.env.SANDBOX_CHIAVE === '1';
const RADICE = resolve(process.env.SANDBOX_RADICE ?? '/lavoro');
const TIMEOUT_MAX_MS = 10 * 60 * 1000;

if (!TOKEN) {
  console.error('SANDBOX_TOKEN mancante: la sandbox non parte senza un token di job.');
  process.exit(1);
}


// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------

/** Un path dentro la radice di lavoro; fuori è un 400. */
function dentro(p) {
  const testo = String(p ?? '');
  /* Un path assoluto si prende com'è (deve stare sotto la radice); uno relativo è relativo alla radice. */
  const assoluto = testo.startsWith('/') ? resolve(testo) : resolve(RADICE, testo);
  if (assoluto !== RADICE && !assoluto.startsWith(RADICE + sep)) throw new Error('path fuori dalla cartella di lavoro');
  return assoluto;
}

function corpo(req) {
  return new Promise((ok, ko) => {
    const pezzi = [];
    req.on('data', (c) => pezzi.push(c));
    req.on('end', () => ok(Buffer.concat(pezzi)));
    req.on('error', ko);
  });
}

function esegui({ cmd, timeoutMs, cwd }) {
  return new Promise((ok) => {
    const limite = Math.min(Number(timeoutMs) || 120_000, TIMEOUT_MAX_MS);
    /* Nel namespace isolato, come utente `lavoro`: niente rete, niente chiave. */
    const dove = cwd ? dentro(cwd) : RADICE;
    const figlio = spawn(
      'ip',
      ['netns', 'exec', 'lavoro', 'setpriv', '--reuid=lavoro', '--regid=lavoro', '--init-groups', 'bash', '-lc', `cd '${dove}' && ${String(cmd)}`],
      { env: { ...process.env, SANDBOX_TOKEN: '', HOME: RADICE, LANG: 'it_IT.UTF-8' } },
    );
    let stdout = '';
    let stderr = '';
    let scaduto = false;
    const LIMITE_TESTO = 200_000;
    figlio.stdout.on('data', (c) => { if (stdout.length < LIMITE_TESTO) stdout += c.toString('utf8'); });
    figlio.stderr.on('data', (c) => { if (stderr.length < LIMITE_TESTO) stderr += c.toString('utf8'); });
    const orologio = setTimeout(() => { scaduto = true; figlio.kill('SIGKILL'); }, limite);
    figlio.on('close', (codice) => { clearTimeout(orologio); ok({ stdout, stderr, codice: codice ?? -1, scaduto }); });
    figlio.on('error', (e) => { clearTimeout(orologio); ok({ stdout, stderr: `${stderr}\n${e.message}`, codice: -1, scaduto }); });
  });
}

async function elenca(dir) {
  const radice = dentro(dir);
  const esito = [];
  async function visita(cartella) {
    for (const voce of await readdir(cartella, { withFileTypes: true })) {
      const p = join(cartella, voce.name);
      const rel = p.slice(RADICE.length + 1).split(sep).join('/');
      if (voce.isDirectory()) {
        esito.push({ path: rel, byte: 0, dir: true });
        if (esito.length < 5000) await visita(p);
      } else {
        const s = await stat(p);
        esito.push({ path: rel, byte: s.size, dir: false });
      }
    }
  }
  await visita(radice);
  return esito;
}

/** Ciò che il runner (root) scrive deve essere dell'utente `lavoro`, che ci lavora sopra. */
function diLavoro(p) {
  spawnSync('chown', ['-R', 'lavoro:lavoro', p]);
  let d = dirname(p);
  while (d.startsWith(RADICE) && d !== RADICE) { spawnSync('chown', ['lavoro:lavoro', d]); d = dirname(d); }
}

function json(res, stato, dati) {
  const testo = JSON.stringify(dati);
  res.writeHead(stato, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(testo) });
  res.end(testo);
}

// ---------------------------------------------------------------------------
// La sessione di Claude Code
// ---------------------------------------------------------------------------

let sessioneInCorso; // { controllo: AbortController }

const STRUMENTI = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Skill', 'TodoWrite'];
const VIETATI = ['WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'KillShell'];

async function sessione(req, res, parametri) {
  if (sessioneInCorso) return json(res, 409, { errore: 'sessione già in corso' });
  const controllo = new AbortController();
  sessioneInCorso = { controllo };

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  const emetti = (evento) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(evento)}\n\n`); };
  const battito = setInterval(() => { if (!res.writableEnded) res.write(':\n\n'); }, 10_000);
  req.on('close', () => controllo.abort());

  const consegnati = [];
  const consegna = tool(
    'consegna',
    'Consegna il documento finale all’utente: un file PDF, DOCX o XLSX sotto /lavoro/output, col nome con cui l’utente lo vedrà. Chiamalo a lavoro finito e controllato, una volta per documento.',
    { path: z.string().min(1), nome: z.string().min(1).max(160) },
    async (a) => {
      console.log('consegna richiesta:', JSON.stringify(a));
      let p;
      try { p = dentro(a.path); } catch (e) { return { content: [{ type: 'text', text: e.message }], isError: true }; }
      const estensione = basename(p).split('.').pop()?.toLowerCase() ?? '';
      if (!['pdf', 'docx', 'xlsx'].includes(estensione)) {
        return { content: [{ type: 'text', text: `Posso consegnare solo PDF, DOCX o XLSX, non «.${estensione}».` }], isError: true };
      }
      let byte;
      try { byte = await stat(p); } catch (e) { console.log('consegna fallita:', p, e.message); return { content: [{ type: 'text', text: `File inesistente: ${p} (${e.message}). Usa il path assoluto sotto /lavoro/output.` }], isError: true }; }
      if (!byte.size) return { content: [{ type: 'text', text: 'Il file è vuoto.' }], isError: true };
      const rel = p.slice(RADICE.length + 1).split(sep).join('/');
      consegnati.push({ path: rel, nome: a.nome, formato: estensione, byte: byte.size });
      emetti({ tipo: 'consegna', path: rel, nome: a.nome, formato: estensione, byte: byte.size });
      return { content: [{ type: 'text', text: `Consegnato «${a.nome}» (${estensione.toUpperCase()}, ${Math.round(byte.size / 1024)} KB).` }] };
    },
  );

  /* I file li ha scritti root (il worker): la CLI e i comandi girano come `lavoro`. */
  spawnSync('chown', ['-R', 'lavoro:lavoro', RADICE]);
  let testo = '';
  let esito;
  try {
    const sdk = query({
      prompt: parametri.promptUtente,
      options: {
        cwd: RADICE,
        /* La CLI parte dal wrapper: utente `lavoro`, namespace di rete isolato. */
        pathToClaudeCodeExecutable: '/opt/sandbox/claude-lavoro',
        model: parametri.modello,
        ...(parametri.effort && { effort: parametri.effort }),
        systemPrompt: parametri.promptSistema,
        tools: STRUMENTI,
        allowedTools: [...STRUMENTI, 'mcp__velia__consegna'],
        disallowedTools: VIETATI,
        mcpServers: { velia: createSdkMcpServer({ name: 'velia', version: '1.0.0', tools: [consegna] }) },
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        maxTurns: parametri.maxTurni ?? 60,
        maxBudgetUsd: parametri.budgetUsd ?? 4,
        persistSession: false,
        /* Le skill documentali stanno in /lavoro/.claude/skills: settingSources=project le carica. */
        settingSources: ['project'],
        includePartialMessages: true,
        abortController: controllo,
        env: {
          ...process.env,
          ANTHROPIC_BASE_URL: `http://10.200.0.1:${PORTA_PROXY}`,
          ANTHROPIC_API_KEY: 'velia-sandbox',
          HOME: RADICE,
        },
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async (input) => {
                  if (input.hook_event_name !== 'PreToolUse') return {};
                  emetti({ tipo: 'attivita', strumento: input.tool_name, input: input.tool_input ?? {} });
                  return {};
                },
              ],
            },
          ],
        },
      },
    });

    for await (const m of sdk) {
      if (m.type === 'stream_event' && m.parent_tool_use_id === null) {
        const e = m.event;
        if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') testo += e.delta.text;
      } else if (m.type === 'result') {
        esito = {
          terminato: m.subtype === 'success' ? 'completato' : m.subtype === 'error_max_turns' || m.subtype === 'error_max_budget_usd' ? 'budget' : 'errore',
          errore: m.subtype === 'success' ? undefined : (m.errors ?? []).join('; ') || m.subtype,
          testo: m.result || testo,
          turni: m.num_turns,
          durataMs: m.duration_ms,
          costoUsd: m.total_cost_usd,
          token: {
            input: m.usage.input_tokens,
            output: m.usage.output_tokens,
            cacheLettura: m.usage.cache_read_input_tokens,
            cacheScrittura: m.usage.cache_creation_input_tokens,
          },
          modello: parametri.modello,
        };
      }
    }
    if (!esito) {
      esito = { terminato: controllo.signal.aborted ? 'annullato' : 'errore', errore: controllo.signal.aborted ? undefined : 'sessione chiusa senza risultato', testo, turni: 0, durataMs: 0, costoUsd: 0, token: { input: 0, output: 0, cacheLettura: 0, cacheScrittura: 0 }, modello: parametri.modello };
    }
    if (esito.testo) emetti({ tipo: 'testo', delta: esito.testo });
    emetti({ tipo: 'fine', esito, consegnati });
  } catch (e) {
    emetti({
      tipo: 'fine',
      esito: { terminato: controllo.signal.aborted ? 'annullato' : 'errore', errore: e instanceof Error ? e.message : String(e), testo, turni: 0, durataMs: 0, costoUsd: 0, token: { input: 0, output: 0, cacheLettura: 0, cacheScrittura: 0 }, modello: parametri.modello },
      consegnati,
    });
  } finally {
    clearInterval(battito);
    sessioneInCorso = undefined;
    res.end();
  }
}

// ---------------------------------------------------------------------------
// Il server
// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://sandbox');
    if (url.pathname === '/salute') return json(res, 200, { pronto: true, chiave: CHIAVE });
    if (req.headers['x-velia-token'] !== TOKEN) return json(res, 401, { errore: 'token' });

    if (req.method === 'POST' && url.pathname === '/esegui') {
      const richiesta = JSON.parse((await corpo(req)).toString('utf8') || '{}');
      if (!richiesta.cmd) return json(res, 400, { errore: 'cmd mancante' });
      return json(res, 200, await esegui(richiesta));
    }
    if (req.method === 'POST' && url.pathname === '/sessione') {
      const parametri = JSON.parse((await corpo(req)).toString('utf8') || '{}');
      if (!parametri.promptUtente || !parametri.promptSistema || !parametri.modello) {
        return json(res, 400, { errore: 'promptSistema, promptUtente e modello sono obbligatori' });
      }
      if (!CHIAVE) return json(res, 500, { errore: 'la sandbox non ha una chiave Anthropic' });
      return sessione(req, res, parametri);
    }
    if (req.method === 'DELETE' && url.pathname === '/sessione') {
      sessioneInCorso?.controllo.abort();
      return json(res, 200, { annullata: Boolean(sessioneInCorso) });
    }
    if (req.method === 'PUT' && url.pathname === '/file') {
      const p = dentro(url.searchParams.get('path'));
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, await corpo(req));
      diLavoro(p);
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/file') {
      const byte = await readFile(dentro(url.searchParams.get('path')));
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': byte.length });
      res.end(byte);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/elenco') {
      return json(res, 200, await elenca(url.searchParams.get('dir') ?? ''));
    }
    if (req.method === 'PUT' && url.pathname === '/archivio') {
      const dir = dentro(url.searchParams.get('dir') ?? '');
      await mkdir(dir, { recursive: true });
      const zip = join(tmpdir(), `archivio-${Date.now()}.zip`);
      await new Promise((ok, ko) => {
        const w = createWriteStream(zip);
        req.pipe(w);
        w.on('finish', ok);
        w.on('error', ko);
      });
      /* Estrae il runner (root), poi tutto passa a `lavoro`. */
      const esitoUnzip = spawnSync('unzip', ['-oq', zip, '-d', dir], { encoding: 'utf8', timeout: 120_000 });
      esitoUnzip.codice = esitoUnzip.status ?? -1;
      await unlink(zip).catch(() => undefined);
      if (esitoUnzip.codice !== 0) return json(res, 500, { errore: esitoUnzip.stderr });
      diLavoro(dir);
      res.writeHead(204).end();
      return;
    }
    json(res, 404, { errore: 'rotta sconosciuta' });
  } catch (e) {
    json(res, 400, { errore: e instanceof Error ? e.message : String(e) });
  }
});

await mkdir(RADICE, { recursive: true });
server.listen(PORTA, '0.0.0.0', () => console.log(`sandbox pronta su :${PORTA}, radice ${RADICE}, chiave ${CHIAVE ? 'nel proxy' : 'ASSENTE'}`));
