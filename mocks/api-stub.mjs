/**
 * Server mock complementare a Mockoon.
 *
 * ## Perché esiste
 *
 * Mockoon copre benissimo ciò che è dato più regole: sessione, tassonomie,
 * simulazione degli errori. Due cose però non le sa fare, e sono entrambe
 * necessarie:
 *
 * 1. **Server-Sent Events.** Non supportati (issue #990, bassa priorità). Se
 *    il backend userà SSE — lo standard di fatto per lo streaming dei modelli
 *    — costruire la chat su WebSocket significherebbe riscrivere dopo la
 *    parte più delicata dell'applicazione.
 *
 * 2. **Interrogazioni vere.** L'helper `filter` di Mockoon fa solo uguaglianza
 *    esatta: niente ricerca per sottostringa, niente filtri opzionali che si
 *    ignorano se il parametro manca, niente paginazione. Si potrebbe forzare
 *    con `jmesPath` costruendo l'espressione in Handlebars dentro una stringa
 *    JSON, ma il risultato sarebbe illeggibile e indebuggabile. Sessanta
 *    righe di JavaScript qui valgono più di venti di template criptico là.
 *
 * ## La regola per decidere dove sta un endpoint
 *
 * - **Mockoon** — la risposta è un dato fisso, o dipende solo da regole su
 *   header e parametri.
 * - **Qui** — la risposta richiede logica: filtrare, cercare, ordinare,
 *   paginare, o mantenere stato fra chiamate.
 *
 * In entrambi i casi il front-end vede lo stesso `/api/...`: è il proxy del
 * dev server a smistare. Il codice applicativo non sa e non deve sapere chi
 * risponde.
 *
 * Avvio: `npm run mock:api` (o `npm run dev`, che avvia tutto).
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  gestisci as gestisciArchivioPrivato,
  trovaDocumento as trovaDocumentoPrivato,
} from './archivio-privato.mjs';
import { gestisci as gestisciChat } from './chat.mjs';
import { gestisci as gestisciImpostazioni } from './impostazioni.mjs';
import { gestisci as gestisciTabelle } from './tabelle.mjs';
import { generaPdf } from './pdf.mjs';

const PORTA = 3001;
const QUI = dirname(fileURLToPath(import.meta.url));

/** Latenza di base, allineata a quella dell'ambiente Mockoon. */
const LATENZA_BASE = 400;

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const leggi = (nome) => JSON.parse(readFileSync(join(QUI, 'data', nome), 'utf8'));

const COMPAGNIE = leggi('compagnie.json');
const RAMI = leggi('rami.json');

/**
 * I documenti sono scritti con `compagniaId` e `ramoId`; qui vengono
 * idratati con gli oggetti completi, che è la forma prevista dal contratto
 * (`DocumentoPubblico`). Le fixture restano compatte e senza ripetizioni: un
 * cambio di ragione sociale si fa in un punto solo.
 */
const DOCUMENTI = leggi('documenti-pubblici.json').map((d) => {
  const compagnia = COMPAGNIE.find((c) => c.id === d.compagniaId);
  const ramo = RAMI.find((r) => r.id === d.ramoId);
  if (!compagnia) throw new Error(`Documento ${d.id}: compagnia ${d.compagniaId} inesistente`);
  if (!ramo) throw new Error(`Documento ${d.id}: ramo ${d.ramoId} inesistente`);

  const { compagniaId, ramoId, ...resto } = d;
  return {
    ...resto,
    archivio: 'pubblico',
    compagnia,
    ramo,
    fileUrl: `/api/documenti/${d.id}/file`,
  };
});

// ---------------------------------------------------------------------------
// Ordinamento
// ---------------------------------------------------------------------------

/**
 * Ordine di lettura di un set informativo, non alfabetico: prima il DIP, poi
 * l'Aggiuntivo, poi le Condizioni, infine il Glossario. È l'ordine in cui un
 * intermediario apre i documenti, e vederli mescolati alfabeticamente in
 * elenco è disorientante.
 */
const ORDINE_TIPOLOGIA = [
  'dip',
  'dip-aggiuntivo',
  'condizioni-assicurazione',
  'glossario',
  'preventivo',
  'polizza',
  'appendice',
  'convenzione',
  'nota-tecnica',
  'altro',
];

const confrontaDocumenti = (a, b) =>
  a.compagnia.nome.localeCompare(b.compagnia.nome, 'it') ||
  a.prodotto.localeCompare(b.prodotto, 'it') ||
  // L'edizione corrente prima delle storiche, a parità di prodotto.
  Number(b.edizione.corrente) - Number(a.edizione.corrente) ||
  ORDINE_TIPOLOGIA.indexOf(a.tipologia) - ORDINE_TIPOLOGIA.indexOf(b.tipologia);

// ---------------------------------------------------------------------------
// Ricerca
// ---------------------------------------------------------------------------

/**
 * RF-A-03: ricerca per parola chiave su titolo e metadati.
 *
 * Normalizza gli accenti perché "AUTOPIU" deve trovare "AUTOPIÙ": chi cerca
 * di fretta non alza il dito per l'accento, e un archivio che non lo perdona
 * sembra rotto.
 */
const SEGNI_DIACRITICI = /[̀-ͯ]/g;

const normalizza = (s) => s.toLowerCase().normalize('NFD').replace(SEGNI_DIACRITICI, '');

/**
 * Tutte le parole devono comparire, in qualsiasi ordine: "generali auto"
 * trova le voci auto di Generali, non l'unione dei due insiemi.
 */
function corrispondeTesto(testo, termine) {
  const normalizzato = normalizza(testo);
  return normalizza(termine)
    .split(/\s+/)
    .filter(Boolean)
    .every((parola) => normalizzato.includes(parola));
}

function corrisponde(documento, termine) {
  return corrispondeTesto(
    [
      documento.titolo,
      documento.prodotto,
      documento.compagnia.nome,
      documento.ramo.nome,
      documento.edizione.etichetta,
    ].join(' '),
    termine,
  );
}

// ---------------------------------------------------------------------------
// Utilità HTTP
// ---------------------------------------------------------------------------

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

/** Raccoglie il corpo della richiesta. Serve al caricamento dei documenti. */
const leggiCorpo = (req) =>
  new Promise((risolvi, rifiuta) => {
    const pezzi = [];
    req.on('data', (p) => pezzi.push(p));
    req.on('end', () => risolvi(Buffer.concat(pezzi)));
    req.on('error', rifiuta);
  });

function inviaJson(res, stato, corpo, headerExtra = {}) {
  const testo = JSON.stringify(corpo);
  res.writeHead(stato, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Content-Length': Buffer.byteLength(testo),
    ...headerExtra,
  });
  res.end(testo);
}

/**
 * Simulazione di errori e latenza, con gli stessi header che interpreta
 * Mockoon: il pannello di sviluppo deve comportarsi allo stesso modo su
 * tutte le rotte, altrimenti diventa uno strumento di cui non ci si fida.
 *
 * Restituisce `true` se ha già risposto e il chiamante deve fermarsi.
 */
async function simulazione(req, res) {
  const latenza = Number(req.headers['x-mock-latenza']) || LATENZA_BASE;
  const errore = req.headers['x-mock-errore'];

  if (errore === 'timeout') {
    await attendi(8000);
    inviaJson(res, 504, {
      codice: 'TIMEOUT',
      messaggio: 'Il servizio non ha risposto entro il tempo previsto.',
    });
    return true;
  }

  await attendi(latenza);

  if (errore === '500') {
    inviaJson(res, 500, {
      codice: 'ERRORE_INTERNO',
      messaggio: 'Il servizio non è momentaneamente disponibile.',
    });
    return true;
  }
  if (errore === '403') {
    inviaJson(res, 403, {
      codice: 'PERMESSO_NEGATO',
      messaggio: "L'utente non dispone dei permessi necessari per questa operazione.",
    });
    return true;
  }
  if (errore === '429') {
    inviaJson(
      res,
      429,
      {
        codice: 'QUOTA_SUPERATA',
        messaggio: 'Limite di richieste del piano raggiunto.',
        ritentaTraSecondi: 45,
      },
      { 'Retry-After': '45' },
    );
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Endpoint: elenco documenti
// ---------------------------------------------------------------------------

function elencoDocumenti(url) {
  const p = url.searchParams;
  const vero = (nome) => p.get(nome) === 'true';

  let risultati = DOCUMENTI.filter((d) => {
    if (p.get('compagniaId') && d.compagnia.id !== p.get('compagniaId')) return false;
    if (p.get('ramoId') && d.ramo.id !== p.get('ramoId')) return false;
    if (p.get('tipologia') && d.tipologia !== p.get('tipologia')) return false;
    /* RF-A-04: le edizioni storiche restano consultabili, ma non ingombrano
       l'elenco di chi sta lavorando su un contratto di oggi. */
    if (vero('soloCorrenti') && !d.edizione.corrente) return false;
    if (vero('soloPreferiti') && !d.preferito) return false;
    if (p.get('q') && !corrisponde(d, p.get('q'))) return false;
    return true;
  });

  risultati = [...risultati].sort(confrontaDocumenti);

  const perPagina = Math.min(Math.max(Number(p.get('perPagina')) || 20, 1), 100);
  const pagina = Math.max(Number(p.get('pagina')) || 1, 1);
  const da = (pagina - 1) * perPagina;

  return {
    elementi: risultati.slice(da, da + perPagina),
    totale: risultati.length,
    pagina,
    perPagina,
  };
}

// ---------------------------------------------------------------------------
// Instradamento
// ---------------------------------------------------------------------------

/**
 * Ricerca puntuale su entrambi gli archivi: il contesto documentale della
 * chat referenzia documenti pubblici e privati senza distinguere (RF-C-02).
 */
const trovaDocumento = (id) => DOCUMENTI.find((d) => d.id === id) ?? trovaDocumentoPrivato(id);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORTA}`);
  const percorso = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  /* Chat e template: il modulo applica da sé la simulazione, perché lo
     streaming non deve passarci — la latenza è già nel suo ritmo. */
  if (
    await gestisciChat(req, res, url, { inviaJson, leggiCorpo, simulazione, trovaDocumento })
  ) {
    return;
  }

  if (await simulazione(req, res)) return;

  /* Archivio Privato: elenco, caricamento, modifica, eliminazione, spazio ed
     etichette. Sta in un modulo a sé perché è la prima parte del mock con una
     macchina a stati e un ciclo di vita. */
  if (await gestisciArchivioPrivato(req, res, url, { inviaJson, leggiCorpo, corrispondeTesto })) {
    return;
  }

  /* Tabelle di analisi: costruzione, generazione progressiva cella per
     cella, esportazione. Altra macchina a stati, altro modulo. */
  if (await gestisciTabelle(req, res, url, { inviaJson, leggiCorpo, trovaDocumento })) {
    return;
  }

  /* Modulo D: modello AI, istruzioni (regole e documenti di riferimento),
     template, utenti, storico. Le scritture pretendono l'amministratore. */
  if (await gestisciImpostazioni(req, res, url, { inviaJson, leggiCorpo })) {
    return;
  }

  // GET /api/documenti
  if (percorso === '/api/documenti' && req.method === 'GET') {
    inviaJson(res, 200, elencoDocumenti(url));
    return;
  }

  /* Il file del documento: un PDF generato, col numero di pagine dichiarato
     nei metadati — il visualizzatore deve poter aprire «pagina 41» davvero. */
  const file = percorso.match(/^\/api\/documenti\/([^/]+)\/file$/);
  if (file && req.method === 'GET') {
    const documento = DOCUMENTI.find((d) => d.id === file[1]);
    if (!documento) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Documento inesistente.' });
      return;
    }
    const pdf = generaPdf(documento.titolo, documento.numeroPagine);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': 'inline',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(pdf);
    return;
  }

  const dettaglio = percorso.match(/^\/api\/documenti\/([^/]+)$/);
  if (dettaglio && req.method === 'GET') {
    const documento = DOCUMENTI.find((d) => d.id === dettaglio[1]);
    if (!documento) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Documento inesistente.' });
      return;
    }
    /* RF-A-04: le altre edizioni dello stesso prodotto, così che dalla scheda
       si possa passare da un'edizione all'altra senza tornare all'elenco. */
    const edizioni = DOCUMENTI.filter(
      (d) =>
        d.prodotto === documento.prodotto &&
        d.compagnia.id === documento.compagnia.id &&
        d.tipologia === documento.tipologia,
    )
      .map((d) => ({ documentoId: d.id, ...d.edizione }))
      .sort((a, b) => b.validaDal.localeCompare(a.validaDal));

    inviaJson(res, 200, { ...documento, edizioni });
    return;
  }

  /*
   * RF-A-09 — preferiti. La modifica resta in memoria: il documento marcato
   * resta tale finché il server vive. È voluto: una demo in cui ogni azione
   * viene dimenticata al ricaricamento non sembra un'applicazione.
   */
  const preferito = percorso.match(/^\/api\/documenti\/([^/]+)\/preferito$/);
  if (preferito && (req.method === 'PUT' || req.method === 'DELETE')) {
    const documento = DOCUMENTI.find((d) => d.id === preferito[1]);
    if (!documento) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Documento inesistente.' });
      return;
    }
    documento.preferito = req.method === 'PUT';
    inviaJson(res, 200, documento);
    return;
  }

  inviaJson(res, 404, {
    codice: 'NON_TROVATO',
    messaggio: `Rotta non gestita da questo stub: ${req.method} ${percorso}`,
  });
});

server.listen(PORTA, () => {
  console.log(`[api-stub] in ascolto su http://localhost:${PORTA}`);
  console.log(`[api-stub] ${DOCUMENTI.length} documenti pubblici caricati`);
  console.log(
    '[api-stub] gestisce: /api/documenti, /api/documenti-privati, /api/etichette, /api/spazio, /api/conversazioni, /api/template, /api/tabelle, /api/modelli, /api/istruzioni, /api/utenti, /api/identita-visiva, /api/impostazioni/storico',
  );
});
