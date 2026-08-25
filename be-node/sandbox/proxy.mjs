/**
 * Il proxy della chiave Anthropic, processo a sé con un suo utente (`proxy`):
 * è l'UNICO che il firewall lascia uscire. La CLI di Claude Code (utente
 * `lavoro`) gli parla su 127.0.0.1:8787 senza chiave; lui aggiunge la chiave
 * vera e inoltra ad api.anthropic.com. Il Bash del modello, stesso utente
 * della CLI, non ha rete e non vede la chiave.
 */
import { createServer } from 'node:http';
import { request as richiestaHttps } from 'node:https';

const PORTA = Number(process.env.PORTA_PROXY ?? 8787);
const CHIAVE = process.env.ANTHROPIC_API_KEY ?? '';
if (!CHIAVE) {
  console.error('proxy: ANTHROPIC_API_KEY mancante');
  process.exit(1);
}
delete process.env.ANTHROPIC_API_KEY;

/** Le intestazioni verso Anthropic: quelle del chiamante senza credenziali, con la chiave vera. */
function intestazioniInoltro(originali) {
  const pulite = {};
  for (const [nome, valore] of Object.entries(originali)) {
    if (['host', 'authorization', 'x-api-key', 'connection'].includes(nome)) continue;
    if (valore !== undefined) pulite[nome] = valore;
  }
  return { ...pulite, host: 'api.anthropic.com', 'x-api-key': CHIAVE };
}

createServer((req, res) => {
  const inoltro = richiestaHttps(
    { host: 'api.anthropic.com', method: req.method, path: req.url, headers: intestazioniInoltro(req.headers) },
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
}).listen(PORTA, '0.0.0.0', () => console.log(`proxy Anthropic su :${PORTA}`));
