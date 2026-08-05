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

import { gestisci as gestisciArchivioPrivato } from './archivio-privato.mjs';

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
// Endpoint: streaming della chat (SSE)
// ---------------------------------------------------------------------------

/** Ritmo di emissione: abbastanza lento da vedere il testo comparire. */
const MS_PER_BLOCCO = 45;

/*
 * Risposta di esempio sul caso pilota indicato nell'analisi dei requisiti
 * (§5.3): confronto ramo auto fra il set informativo Generali e il
 * preventivo UnipolSai sullo stesso veicolo.
 *
 * Il testo è verosimile ma inventato. Diventerà fedele quando arriveranno i
 * PDF reali del cliente pilota.
 */
const RISPOSTA = `Ho confrontato le due proposte sulle voci che incidono di più sul premio e sulla tutela dell'assicurato.

**Massimale RC** — Le due proposte si equivalgono: 6.450.000 € per sinistro su entrambe, di cui 1.300.000 € per danni a cose. È il massimale minimo di legge, quindi nessuna delle due offre un vantaggio su questa voce.

**Franchigia furto e incendio** — Qui la differenza è netta. La proposta Generali applica una franchigia fissa di 250 €, quella UnipolSai uno scoperto del 10% con un minimo di 500 €. Su un sinistro da 8.000 € significa 250 € contro 800 €.

**Garanzia infortuni del conducente** — Presente nella proposta Generali con massimale di 100.000 €, assente in quella UnipolSai.

**Assistenza stradale** — Entrambe la prevedono, ma la proposta UnipolSai include il traino illimitato mentre quella Generali lo limita a 50 km dal luogo del fermo.

In sintesi: la proposta Generali tutela meglio sui danni al veicolo e sulla persona del conducente; quella UnipolSai è più conveniente sull'assistenza. La scelta dipende dall'uso prevalente del veicolo.`;

const CITAZIONI = [
  {
    id: 'cit-001',
    documentoId: 'doc-pub-002',
    documentoTitolo: 'DIP Aggiuntivo — Active Veicoli AUTOPIÙ con Telematica',
    archivio: 'pubblico',
    posizione: { pagina: 8, articolo: '12', sezione: 'Responsabilità civile' },
    estratto:
      'Il massimale per sinistro è pari a euro 6.450.000, di cui euro 1.300.000 per danni a cose.',
  },
  {
    id: 'cit-002',
    documentoId: 'doc-pub-003',
    documentoTitolo: 'Condizioni di Assicurazione — Active Veicoli AUTOPIÙ con Telematica',
    archivio: 'pubblico',
    posizione: { pagina: 41, articolo: '27', sezione: 'Furto e incendio' },
    estratto:
      'La garanzia è prestata con applicazione di una franchigia fissa di euro 250 per ciascun sinistro.',
  },
  {
    id: 'cit-003',
    documentoId: 'doc-priv-014',
    documentoTitolo: 'Preventivo UnipolSai — Fiat 500X targa GK492ZR',
    archivio: 'privato',
    posizione: { pagina: 3, sezione: 'Garanzie accessorie' },
    estratto: 'Furto e Incendio: scoperto 10% con il minimo di euro 500 per ciascun sinistro.',
  },
];

/*
 * RF-D-05: quando una risposta è influenzata da un'istruzione personalizzata
 * del tenant, il sistema deve renderlo esplicito. Lo stub lo emette perché
 * l'interfaccia della Fase 3 dovrà saperlo mostrare fin dal primo giorno.
 */
const PROVENIENZE = [
  {
    tipo: 'istruzione',
    origineId: 'ist-003',
    etichetta: 'valutato secondo la regola "Infortuni del conducente"',
  },
];

async function streamingChat(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    /* Senza questo, un eventuale reverse proxy bufferizza e lo streaming
       arriva tutto insieme: il difetto più insidioso da diagnosticare. */
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  /** Un evento del contratto `EventoStream` (core/models/conversazione.ts). */
  const invia = (evento) => res.write(`data: ${JSON.stringify(evento)}\n\n`);

  let interrotto = false;
  req.on('close', () => {
    interrotto = true;
  });

  invia({ tipo: 'inizio', messaggioId: `msg-${Date.now()}` });

  /* Pausa iniziale: il modello vero ci mette un attimo prima del primo
     token, e l'interfaccia deve mostrare qualcosa in quel vuoto. */
  await attendi(700);

  for (const blocco of RISPOSTA.match(/\S+\s*/g) ?? []) {
    if (interrotto) return;
    invia({ tipo: 'testo', delta: blocco });
    await attendi(MS_PER_BLOCCO);
  }

  /* Citazioni e provenienze arrivano in coda, come farebbe un backend che le
     consolida a risposta completa. Se il backend vero le emetterà via via,
     l'interfaccia deve reggere entrambi i casi: è il motivo per cui sono
     eventi separati e non campi di un unico oggetto finale. */
  for (const citazione of CITAZIONI) {
    if (interrotto) return;
    invia({ tipo: 'citazione', citazione });
    await attendi(120);
  }
  for (const provenienza of PROVENIENZE) {
    if (interrotto) return;
    invia({ tipo: 'provenienza', provenienza });
    await attendi(120);
  }

  invia({ tipo: 'fine' });
  res.end();
}

// ---------------------------------------------------------------------------
// Instradamento
// ---------------------------------------------------------------------------

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

  // Lo streaming non passa dalla simulazione: la latenza è già nel suo ritmo.
  if (percorso.startsWith('/api/stream')) {
    await streamingChat(req, res);
    return;
  }

  if (await simulazione(req, res)) return;

  /* Archivio Privato: elenco, caricamento, modifica, eliminazione, spazio ed
     etichette. Sta in un modulo a sé perché è la prima parte del mock con una
     macchina a stati e un ciclo di vita. */
  if (await gestisciArchivioPrivato(req, res, url, { inviaJson, leggiCorpo, corrispondeTesto })) {
    return;
  }

  // GET /api/documenti
  if (percorso === '/api/documenti' && req.method === 'GET') {
    inviaJson(res, 200, elencoDocumenti(url));
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
    '[api-stub] gestisce: /api/documenti, /api/documenti-privati, /api/etichette, /api/spazio, /api/stream',
  );
});
