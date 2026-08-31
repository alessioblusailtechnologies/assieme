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
const carica = (nome) => JSON.parse(readFileSync(join(QUI, 'data', nome), 'utf8'));

const RICORDI = carica('ricordi.json');
const CONVERSAZIONI = carica('conversazioni.json');
const MESSAGGI = carica('messaggi.json');
const COMPAGNIE = carica('compagnie.json');
const RAMI = carica('rami.json');
const DOCUMENTI = [...carica('documenti-pubblici.json'), ...carica('documenti-privati.json')];

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
// Il globo (GET /api/ricordi/grafo) — specchio di `be-node/src/api/ricordi/grafo.ts`
// ---------------------------------------------------------------------------

/** Un testo lungo si accorcia a parola intera: è un'etichetta, non una scheda. */
function accorcia(testo, massimo = 64) {
  const pulito = testo.trim().replace(/\s+/g, ' ');
  if (pulito.length <= massimo) return pulito;
  const taglio = pulito.slice(0, massimo);
  const spazio = taglio.lastIndexOf(' ');
  return `${taglio.slice(0, spazio > massimo / 2 ? spazio : massimo)}…`;
}

function etichettaPunto(c) {
  const articolo = c.posizione.articolo?.trim();
  if (articolo) {
    /* Mai «art. Articolo 4»: il prefisso solo quando manca. */
    return /^art/i.test(articolo) ? accorcia(articolo, 36) : `art. ${accorcia(articolo, 30)}`;
  }
  if (c.posizione.sezione) return accorcia(c.posizione.sezione, 32);
  return `pag. ${c.posizione.pagina}`;
}

/**
 * Le stesse regole della rotta vera: un ricordo è sempre un nodo, la
 * conversazione entra solo se ha citazioni o ha originato ricordi (e solo se
 * visibile: propria o condivisa — la RLS del mock), il punto è
 * documento+pagina, il documento porta la compagnia se la riga d'archivio è
 * visibile.
 */
function costruisciGrafo(req) {
  const utente = utenteCorrente(req);
  const ricordi = RICORDI.filter((r) => r.ambito === 'tenant' || r._utenteId === utente);
  const conversazioni = new Map(
    CONVERSAZIONI.filter((c) => c.autoreId === utente || c.condivisa).map((c) => [c.id, c]),
  );
  const documenti = new Map(
    DOCUMENTI.filter(
      (d) => !d.visibilita || d.visibilita === 'tenant' || d.caricatoDa === utente,
    ).map((d) => [d.id, d]),
  );
  /* La trama del globo: le edizioni correnti del catalogo pubblico. */
  const catalogo = new Map(
    DOCUMENTI.filter((d) => !d.visibilita && d.edizione?.corrente && d.prodotto).map((d) => [
      d.id,
      d,
    ]),
  );

  const nodi = new Map();
  const legami = new Map();

  const nodo = (n) => {
    if (!nodi.has(n.chiave)) nodi.set(n.chiave, n);
    return nodi.get(n.chiave);
  };
  const lega = (da, a) => {
    const chiave = `${da}|${a}`;
    const esistente = legami.get(chiave);
    if (esistente) esistente.peso += 1;
    else legami.set(chiave, { da, a, peso: 1 });
  };
  /* Legame strutturale: esiste una volta sola, non accumula peso. */
  const legaStruttura = (da, a) => {
    const chiave = `${da}|${a}`;
    if (legami.has(chiave)) return false;
    legami.set(chiave, { da, a, peso: 1 });
    return true;
  };

  // --- L'archivio: rami → compagnie → prodotti → documenti ---
  for (const riga of catalogo.values()) {
    const compagnia = COMPAGNIE.find((c) => c.id === riga.compagniaId);
    const ramo = RAMI.find((r) => r.id === riga.ramoId);
    if (!compagnia || !ramo) continue;

    const nodoRamo = nodo({
      chiave: `ramo:${ramo.id}`,
      tipo: 'ramo',
      etichetta: ramo.nome,
      peso: 0,
      id: ramo.id,
    });
    const nodoCompagnia = nodo({
      chiave: `compagnia:${compagnia.id}`,
      tipo: 'compagnia',
      etichetta: compagnia.nome,
      peso: 0,
      id: compagnia.id,
    });
    const chiaveProdotto = `prodotto:${compagnia.id}:${riga.prodotto}`;
    const nodoProdotto = nodo({
      chiave: chiaveProdotto,
      tipo: 'prodotto',
      etichetta: accorcia(riga.prodotto, 40),
      peso: 0,
    });
    nodo({
      chiave: `documento:${riga.id}`,
      tipo: 'documento',
      etichetta: accorcia(riga.titolo, 56),
      peso: 1,
      id: riga.id,
      archivio: 'pubblico',
    });

    legaStruttura(`documento:${riga.id}`, chiaveProdotto);
    nodoProdotto.peso += 1;
    if (legaStruttura(chiaveProdotto, nodoCompagnia.chiave)) nodoCompagnia.peso += 1;
    if (legaStruttura(chiaveProdotto, nodoRamo.chiave)) nodoRamo.peso += 1;
  }
  const nodoConversazione = (id) => {
    const conversazione = conversazioni.get(id);
    if (!conversazione) return undefined;
    return nodo({
      chiave: `conversazione:${id}`,
      tipo: 'conversazione',
      etichetta: accorcia(conversazione.titolo, 48),
      peso: 0,
      id,
    });
  };

  for (const r of ricordi) {
    nodo({
      chiave: `ricordo:${r.id}`,
      tipo: 'ricordo',
      etichetta: accorcia(r.testo),
      peso: 1,
      id: r.id,
      categoria: r.categoria,
      ambito: r.ambito,
      attivo: r.attivo,
      testo: r.testo,
    });
    if (!r.origineConversazioneId) continue;
    const conversazione = nodoConversazione(r.origineConversazioneId);
    if (!conversazione) continue;
    conversazione.peso += 1;
    lega(`ricordo:${r.id}`, conversazione.chiave);
  }

  for (const messaggio of MESSAGGI) {
    if (!messaggio.citazioni?.length || !conversazioni.has(messaggio.conversazioneId)) continue;
    const conversazione = nodoConversazione(messaggio.conversazioneId);

    for (const citazione of messaggio.citazioni) {
      conversazione.peso += 1;

      const chiavePunto = `punto:${citazione.documentoId}@${citazione.posizione.pagina}`;
      const punto = nodo({
        chiave: chiavePunto,
        tipo: 'punto',
        etichetta: etichettaPunto(citazione),
        peso: 0,
        citazione,
      });
      punto.peso += 1;
      if (!punto.citazione.posizione.articolo && citazione.posizione.articolo) {
        punto.citazione = citazione;
        punto.etichetta = etichettaPunto(citazione);
      }

      const rigaArchivio = documenti.get(citazione.documentoId);
      const documento = nodo({
        chiave: `documento:${citazione.documentoId}`,
        tipo: 'documento',
        etichetta: accorcia(rigaArchivio?.titolo ?? citazione.documentoTitolo, 56),
        peso: 0,
        id: citazione.documentoId,
        archivio: citazione.archivio,
      });
      documento.peso += 1;

      lega(conversazione.chiave, chiavePunto);
      lega(chiavePunto, documento.chiave);

      /* Il documento del catalogo è già agganciato al suo prodotto; quello
         fuori catalogo (storico, privato) si appende alla compagnia. */
      const compagniaId = rigaArchivio?.compagniaId;
      const compagnia = compagniaId && COMPAGNIE.find((c) => c.id === compagniaId);
      if (compagnia && !catalogo.has(citazione.documentoId)) {
        const nodoCompagnia = nodo({
          chiave: `compagnia:${compagnia.id}`,
          tipo: 'compagnia',
          etichetta: compagnia.nome,
          peso: 0,
          id: compagnia.id,
        });
        if (legaStruttura(documento.chiave, nodoCompagnia.chiave)) nodoCompagnia.peso += 1;
      }
    }
  }

  const ordinati = [...nodi.values()].sort(
    (a, b) => b.peso - a.peso || a.chiave.localeCompare(b.chiave),
  );
  return { nodi: ordinati, legami: [...legami.values()] };
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

  // GET /api/ricordi/grafo — il globo della memoria (prima della rotta /:id)
  if (percorso === '/api/ricordi/grafo' && req.method === 'GET') {
    inviaJson(res, 200, costruisciGrafo(req));
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
