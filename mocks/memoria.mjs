/**
 * Memoria: la parte del mock che ricorda (Modulo G, RF-G-01…G-06).
 *
 * I ricordi stanno in memoria come tutto il resto. Due cose da sapere:
 *
 * 1. **La separazione degli ambiti la fa il server** (RF-G-02): l'elenco
 *    restituisce i ricordi di tenant più quelli personali dell'utente
 *    corrente — mai quelli personali dei colleghi. La fixture tiene
 *    `_utenteId` come campo interno, che non esce mai dal contratto.
 *
 * 2. **Non esiste una POST**: la memoria si alimenta solo imparando
 *    (RF-G-01) — la registrazione esplicita di RF-G-07 è stata rimossa su
 *    indicazione del committente. Il mock rappresenta l'apprendimento con le
 *    fixture; l'utente governa: corregge, sospende, elimina.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const RICORDI = JSON.parse(readFileSync(join(QUI, 'data', 'ricordi.json'), 'utf8'));

const utenteCorrente = (req) =>
  req?.headers['x-velia-ruolo'] === 'amministratore' ? 'utn-001' : 'utn-004';

const AMBITI = ['tenant', 'personale'];
const CATEGORIE = ['prassi', 'cliente', 'preferenza', 'decisione', 'altro'];

/** Il ricordo nella forma del contratto: i campi interni non escono. */
function risposta(ricordo) {
  const { _utenteId, ...pulito } = ricordo;
  return pulito;
}

// ---------------------------------------------------------------------------
// Instradamento
// ---------------------------------------------------------------------------

/**
 * Gestisce le rotte della memoria.
 * Restituisce `true` se ha risposto, `false` se la rotta non è sua.
 */
export async function gestisci(req, res, url, deps) {
  const { inviaJson, leggiCorpo } = deps;
  const percorso = url.pathname;

  if (!percorso.startsWith('/api/ricordi')) return false;

  /* I ricordi visibili all'utente corrente: quelli del tenant più i suoi. */
  const visibili = () =>
    RICORDI.filter((r) => r.ambito === 'tenant' || r._utenteId === utenteCorrente(req));

  // GET /api/ricordi — il più recente in cima
  if (percorso === '/api/ricordi' && req.method === 'GET') {
    const ordinati = [...visibili()].sort((a, b) => b.aggiornatoIl.localeCompare(a.aggiornatoIl));
    inviaJson(res, 200, ordinati.map(risposta));
    return true;
  }

  const rotta = percorso.match(/^\/api\/ricordi\/([^/]+)$/);
  if (!rotta) return false;

  const ricordo = RICORDI.find(
    (r) =>
      r.id === rotta[1] && (r.ambito === 'tenant' || r._utenteId === utenteCorrente(req)),
  );
  if (!ricordo) {
    inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Ricordo inesistente.' });
    return true;
  }

  // PATCH /api/ricordi/:id — modifica e sospensione (RF-G-03)
  if (req.method === 'PATCH') {
    const modifiche = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    if (typeof modifiche.testo === 'string' && modifiche.testo.trim()) {
      ricordo.testo = modifiche.testo.trim();
    }
    if (AMBITI.includes(modifiche.ambito)) {
      /* Da personale a tenant il ricordo si condivide; al contrario diventa
         dell'utente che lo sta spostando. */
      if (modifiche.ambito === 'personale') ricordo._utenteId = utenteCorrente(req);
      else delete ricordo._utenteId;
      ricordo.ambito = modifiche.ambito;
    }
    if (CATEGORIE.includes(modifiche.categoria)) ricordo.categoria = modifiche.categoria;
    if (typeof modifiche.attivo === 'boolean') ricordo.attivo = modifiche.attivo;
    ricordo.aggiornatoIl = new Date().toISOString();
    inviaJson(res, 200, risposta(ricordo));
    return true;
  }

  // DELETE /api/ricordi/:id — cancellazione effettiva (RF-G-05)
  if (req.method === 'DELETE') {
    RICORDI.splice(RICORDI.indexOf(ricordo), 1);
    res.writeHead(204).end();
    return true;
  }

  return false;
}
