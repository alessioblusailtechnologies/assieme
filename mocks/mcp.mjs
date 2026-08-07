/**
 * Accesso MCP: la parte del mock che apre agli altri (Modulo F, RF-F-02/04).
 *
 * La superficie è volutamente piccola — il valore del modulo sta tutto nel
 * backend — ma i comportamenti che l'interfaccia deve reggere ci sono tutti:
 *
 * - **Il token esce in chiaro una volta sola**, alla generazione. Il mock non
 *   lo conserva: esattamente come farà il backend, che ne salva solo l'hash.
 * - **La revoca è definitiva** e chiude le connessioni della credenziale.
 * - **Tutte le rotte pretendono l'amministratore** (permesso
 *   `mcp.credenziali`): il pannello di sviluppo mostra il 403 vero.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const CREDENZIALI = JSON.parse(readFileSync(join(QUI, 'data', 'credenziali-mcp.json'), 'utf8'));

/** Le connessioni attive (RF-F-04): vivono e muoiono con le credenziali. */
const CONNESSIONI = [
  {
    id: 'con-001',
    client: 'Claude Desktop',
    credenzialeId: 'mcp-001',
    connessaDal: '2026-08-06T08:12:00+02:00',
    ultimaAttivita: '2026-08-06T08:41:00+02:00',
  },
];

/* Il contatore parte alto per non collidere con gli id delle fixture. */
let prossimaCredenziale = 100;

const amministratore = (req) => req.headers['x-velia-ruolo'] === 'amministratore';

// ---------------------------------------------------------------------------
// Instradamento
// ---------------------------------------------------------------------------

/**
 * Gestisce le rotte MCP.
 * Restituisce `true` se ha risposto, `false` se la rotta non è sua.
 */
export async function gestisci(req, res, url, deps) {
  const { inviaJson, leggiCorpo } = deps;
  const percorso = url.pathname;

  if (!percorso.startsWith('/api/mcp')) return false;

  if (!amministratore(req)) {
    inviaJson(res, 403, {
      codice: 'PERMESSO_NEGATO',
      messaggio: 'Le credenziali MCP sono riservate all’amministratore del tenant.',
    });
    return true;
  }

  // GET /api/mcp/credenziali — le attive prima, poi le revocate
  if (percorso === '/api/mcp/credenziali' && req.method === 'GET') {
    const ordinate = [...CREDENZIALI].sort(
      (a, b) => Number(a.revocata) - Number(b.revocata) || b.creataIl.localeCompare(a.creataIl),
    );
    inviaJson(res, 200, ordinate);
    return true;
  }

  // POST /api/mcp/credenziali — generazione (RF-F-02)
  if (percorso === '/api/mcp/credenziali' && req.method === 'POST') {
    const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    if (!corpo.nome?.trim()) {
      inviaJson(res, 400, {
        codice: 'CREDENZIALE_SENZA_NOME',
        messaggio: 'Dai un nome alla credenziale: fra sei mesi dovrai capire a cosa serve.',
      });
      return true;
    }
    const token = `asm_mcp_${randomBytes(24).toString('hex')}`;
    const credenziale = {
      id: `mcp-${prossimaCredenziale++}`,
      nome: corpo.nome.trim(),
      tokenMascherato: `asm_mcp_…${token.slice(-4)}`,
      creataIl: new Date().toISOString(),
      revocata: false,
    };
    CREDENZIALI.push(credenziale);
    /* Il token in chiaro esiste solo in questa risposta. */
    inviaJson(res, 201, { ...credenziale, token });
    return true;
  }

  // POST /api/mcp/credenziali/:id/revoca — definitiva (RF-F-02)
  const revoca = percorso.match(/^\/api\/mcp\/credenziali\/([^/]+)\/revoca$/);
  if (revoca && req.method === 'POST') {
    const credenziale = CREDENZIALI.find((c) => c.id === revoca[1]);
    if (!credenziale) {
      inviaJson(res, 404, { codice: 'NON_TROVATA', messaggio: 'Credenziale inesistente.' });
      return true;
    }
    credenziale.revocata = true;
    for (let i = CONNESSIONI.length - 1; i >= 0; i--) {
      if (CONNESSIONI[i].credenzialeId === credenziale.id) CONNESSIONI.splice(i, 1);
    }
    inviaJson(res, 200, credenziale);
    return true;
  }

  // GET /api/mcp/connessioni — lo stato delle connessioni attive (RF-F-04)
  if (percorso === '/api/mcp/connessioni' && req.method === 'GET') {
    inviaJson(res, 200, CONNESSIONI);
    return true;
  }

  return false;
}
