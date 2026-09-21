/**
 * Il proxy delle chiavi, processo a sé con un suo utente (`proxy`): è
 * l'UNICO che il firewall lascia uscire. La CLI di Claude Code (utente
 * `lavoro`) gli parla su 127.0.0.1:8787 senza chiave; lui aggiunge la chiave
 * vera e inoltra al fornitore. Il Bash del modello, stesso utente della CLI,
 * non ha rete e non vede le chiavi.
 *
 * I fornitori sono due dal 21/09/2026, perché la sandbox segue il livello
 * scelto dall'agenzia: Anthropic, alla radice, e DeepSeek, che parla la
 * stessa API, sotto `/deepseek` (la CLI ci arriva con
 * `ANTHROPIC_BASE_URL=http://…:8787/deepseek`). Un fornitore senza chiave
 * risponde 502, e il runner non lo propone nemmeno (SANDBOX_FORNITORI).
 */
import { createServer } from 'node:http';
import { request as richiestaHttps } from 'node:https';

const PORTA = Number(process.env.PORTA_PROXY ?? 8787);

/** Dove inoltrare, per fornitore: l'indirizzo base della sua API e la chiave. */
const FORNITORI = {
  anthropic: process.env.ANTHROPIC_API_KEY
    ? { base: new URL('https://api.anthropic.com'), chiave: process.env.ANTHROPIC_API_KEY }
    : undefined,
  deepseek: process.env.DEEPSEEK_API_KEY
    ? {
        base: new URL(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/anthropic'),
        chiave: process.env.DEEPSEEK_API_KEY,
      }
    : undefined,
};
if (!FORNITORI.anthropic && !FORNITORI.deepseek) {
  console.error('proxy: nessuna chiave (ANTHROPIC_API_KEY, DEEPSEEK_API_KEY)');
  process.exit(1);
}
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEEPSEEK_API_KEY;

/** Il fornitore e il percorso da chiamare: `/deepseek/v1/messages` va a DeepSeek, il resto ad Anthropic. */
function destinazione(url) {
  const [, primo, ...resto] = url.split('/');
  if (primo === 'deepseek') {
    const f = FORNITORI.deepseek;
    return f && { f, path: `${f.base.pathname.replace(/\/$/, '')}/${resto.join('/')}` };
  }
  const f = FORNITORI.anthropic;
  return f && { f, path: url };
}

/** Le intestazioni verso il fornitore: quelle del chiamante senza credenziali, con la chiave vera. */
function intestazioniInoltro(originali, f) {
  const pulite = {};
  for (const [nome, valore] of Object.entries(originali)) {
    if (['host', 'authorization', 'x-api-key', 'connection'].includes(nome)) continue;
    if (valore !== undefined) pulite[nome] = valore;
  }
  return { ...pulite, host: f.base.host, 'x-api-key': f.chiave };
}

createServer((req, res) => {
  const d = destinazione(req.url ?? '/');
  if (!d) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'proxy', message: `nessuna chiave per ${req.url}` } }));
    req.resume();
    return;
  }
  const inoltro = richiestaHttps(
    { host: d.f.base.hostname, port: d.f.base.port || 443, method: req.method, path: d.path, headers: intestazioniInoltro(req.headers, d.f) },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  inoltro.on('error', (e) => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'proxy', message: e.message } }));
  });
  req.pipe(inoltro);
/* Su tutte le interfacce: il namespace `lavoro` lo raggiunge su 10.200.0.1. La porta non è esposta fuori. */
}).listen(PORTA, '0.0.0.0', () =>
  console.log(`proxy su :${PORTA} per ${Object.keys(FORNITORI).filter((k) => FORNITORI[k]).join(', ')}`),
);
