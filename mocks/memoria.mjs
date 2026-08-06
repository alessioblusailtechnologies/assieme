/**
 * Memoria: la parte del mock che ricorda (Modulo G, RF-G-01…G-07).
 *
 * I ricordi stanno in memoria come tutto il resto. Due cose da sapere:
 *
 * 1. **La separazione degli ambiti la fa il server** (RF-G-02): l'elenco
 *    restituisce i ricordi di tenant più quelli personali dell'utente
 *    corrente — mai quelli personali dei colleghi. La fixture tiene
 *    `_utenteId` come campo interno, che non esce mai dal contratto.
 *
 * 2. **`registraRicordo` è esportata per la chat** (RF-G-07): lo scenario
 *    «ricordati che…» di `chat.mjs` la chiama e il ricordo compare davvero
 *    nel pannello — la conferma del salvataggio non è una finzione.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const RICORDI = JSON.parse(readFileSync(join(QUI, 'data', 'ricordi.json'), 'utf8'));

/* Il contatore parte alto per non collidere con gli id delle fixture. */
let prossimoRicordo = 100;

const utenteCorrente = (req) =>
  req?.headers['x-assieme-ruolo'] === 'amministratore' ? 'utn-001' : 'utn-004';

const AMBITI = ['tenant', 'personale'];
const CATEGORIE = ['prassi', 'cliente', 'preferenza', 'decisione', 'altro'];

/** Il ricordo nella forma del contratto: i campi interni non escono. */
function risposta(ricordo) {
  const { _utenteId, ...pulito } = ricordo;
  return pulito;
}

/**
 * La categoria di un ricordo dettato: si riconosce dalle parole, come le
 * famiglie dei criteri delle tabelle. Sbagliarla non è grave — si corregge
 * dal pannello — ma indovinarla spesso rende la demo credibile.
 */
function categoriaDaTesto(testo) {
  const t = testo.toLowerCase();
  if (t.includes('cliente') || t.includes('ditta') || t.includes('sig')) return 'cliente';
  if (t.includes('preferis') || t.includes('preferenz')) return 'preferenza';
  if (t.includes('deciso') || t.includes('decision')) return 'decisione';
  return 'prassi';
}

/**
 * Registrazione esplicita (RF-G-07), dalla chat o dal pannello.
 * Un ricordo dettato in chat nasce nella memoria di tenant: gli esempi del
 * requisito sono prassi d'agenzia, e dal pannello si può sempre spostare.
 */
export function registraRicordo(testo, req, ambito = 'tenant') {
  const adesso = new Date().toISOString();
  const ricordo = {
    id: `ric-${prossimoRicordo++}`,
    testo,
    ambito,
    categoria: categoriaDaTesto(testo),
    origine: 'esplicito',
    creatoIl: adesso,
    aggiornatoIl: adesso,
    attivo: true,
    ...(ambito === 'personale' ? { _utenteId: utenteCorrente(req) } : {}),
  };
  RICORDI.push(ricordo);
  return risposta(ricordo);
}

export function trovaRicordo(id) {
  const ricordo = RICORDI.find((r) => r.id === id);
  return ricordo ? risposta(ricordo) : undefined;
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

  // POST /api/ricordi — registrazione esplicita dal pannello (RF-G-07)
  if (percorso === '/api/ricordi' && req.method === 'POST') {
    const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    if (!corpo.testo?.trim()) {
      inviaJson(res, 400, { codice: 'RICORDO_VUOTO', messaggio: 'Al ricordo manca il testo.' });
      return true;
    }
    const ambito = AMBITI.includes(corpo.ambito) ? corpo.ambito : 'tenant';
    const nuovo = registraRicordo(corpo.testo.trim(), req, ambito);
    if (CATEGORIE.includes(corpo.categoria)) {
      const interno = RICORDI.find((r) => r.id === nuovo.id);
      interno.categoria = corpo.categoria;
      nuovo.categoria = corpo.categoria;
    }
    inviaJson(res, 201, nuovo);
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
