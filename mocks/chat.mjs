/**
 * Chat conversazionale: la parte del mock che parla (Modulo C).
 *
 * Due nature convivono qui, ed è il motivo per cui il modulo esiste:
 *
 * 1. **Stato.** Conversazioni e messaggi persistono in memoria come
 *    nell'Archivio Privato: una conversazione creata resta, una rinomina si
 *    vede, il contesto documentale sopravvive alla navigazione (RF-C-03).
 *
 * 2. **Streaming.** La risposta dell'assistente esce come Server-Sent Events
 *    sul contratto `EventoStream` (core/models/conversazione.ts). Mockoon non
 *    li supporta (issue #990), e costruire la chat su un trasporto diverso da
 *    quello del backend vero significherebbe riscrivere dopo la parte più
 *    delicata dell'applicazione.
 *
 * ## Le risposte sono scenari deterministici, non casuali
 *
 * Come gli errori di elaborazione dell'Archivio Privato, la risposta dipende
 * dal testo della domanda — una demo in cui il comportamento capita a caso
 * non si può mostrare a nessuno:
 *
 * - nessun documento in contesto        → invito a referenziare con `@`
 * - domanda su «grandine» o «cristalli» → non-copertura dichiarata (RF-C-08)
 * - domanda su franchigie o scoperti    → risposta breve con due citazioni
 * - tutto il resto                      → confronto del caso pilota (§5.3)
 *
 * I testi sono verosimili ma inventati: diventeranno fedeli quando
 * arriveranno i PDF reali del cliente pilota.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generaDocx, generaXlsx } from './ufficio.mjs';
import { generaPdf, generaPdfDaTesto } from './pdf.mjs';
import { leggiMultipart } from './archivio-privato.mjs';
import { risolviTemplate } from './impostazioni.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const leggi = (nome) => JSON.parse(readFileSync(join(QUI, 'data', nome), 'utf8'));

const CONVERSAZIONI = leggi('conversazioni.json');
const MESSAGGI = leggi('messaggi.json');

/** Ritmo di emissione: abbastanza lento da vedere il testo comparire. */
const MS_PER_BLOCCO = 45;

/** Titolo con cui nasce una conversazione, finché il primo messaggio non lo sostituisce. */
const TITOLO_NUOVA = 'Nuova conversazione';

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

/* I contatori partono alti per non collidere con gli id delle fixture. */
let prossimoMessaggio = 100;
let prossimaConversazione = 100;
let prossimaCitazione = 100;
let prossimoAllegato = 100;

/**
 * Allegati di conversazione (RF-C-02): file allegati dal composer, che non
 * entrano negli archivi. Vivono qui, in memoria, con un PDF generato per il
 * visualizzatore — come tutto il resto del mock.
 */
const ALLEGATI = [];

const trovaAllegato = (id) => ALLEGATI.find((a) => a.id === id);

// ---------------------------------------------------------------------------
// Scenari di risposta
// ---------------------------------------------------------------------------

const citazione = (dati) => ({ id: `cit-${prossimaCitazione++}`, ...dati });

const CITAZIONE_FRANCHIGIA_GENERALI = {
  documentoId: 'doc-pub-003',
  documentoTitolo: 'Condizioni di Assicurazione — Active Veicoli AUTOPIÙ con Telematica',
  archivio: 'pubblico',
  posizione: {
    pagina: 41,
    articolo: '27',
    sezione: 'Furto e incendio',
    evidenzia: { x: 0.09, y: 0.45, larghezza: 0.82, altezza: 0.08 },
  },
  estratto:
    'La garanzia è prestata con applicazione di una franchigia fissa di euro 250 per ciascun sinistro.',
};

const CITAZIONE_SCOPERTO_UNIPOL = {
  documentoId: 'doc-priv-001',
  documentoTitolo: 'Preventivo UnipolSai — Fiat 500X targa GK492ZR',
  archivio: 'privato',
  posizione: {
    pagina: 3,
    sezione: 'Garanzie accessorie',
    evidenzia: { x: 0.09, y: 0.6, larghezza: 0.82, altezza: 0.06 },
  },
  estratto: 'Furto e Incendio: scoperto 10% con il minimo di euro 500 per ciascun sinistro.',
};

const CITAZIONE_MASSIMALE_GENERALI = {
  documentoId: 'doc-pub-002',
  documentoTitolo: 'DIP Aggiuntivo — Active Veicoli AUTOPIÙ con Telematica',
  archivio: 'pubblico',
  posizione: {
    pagina: 8,
    articolo: '12',
    sezione: 'Responsabilità civile',
    evidenzia: { x: 0.09, y: 0.28, larghezza: 0.82, altezza: 0.08 },
  },
  estratto:
    'Il massimale per sinistro è pari a euro 6.450.000, di cui euro 1.300.000 per danni a cose.',
};

function scenarioSenzaDocumenti() {
  return {
    testo: `Non ho documenti su cui fondare una risposta verificabile: in questa conversazione non è referenziato alcun documento.

Referenzia con \`@\` i set informativi dell'Archivio Pubblico o i documenti del tuo archivio di cui vuoi parlare: la risposta arriverà con le citazioni ai passaggi da cui è tratta.`,
    citazioni: [],
    provenienze: [],
    nonSupportato: true,
  };
}

function scenarioNonCoperto() {
  return {
    testo: `Nei documenti referenziati non ho trovato una garanzia che copra quanto chiedi, né un richiamo agli eventi atmosferici nelle garanzie accessorie. Non posso quindi dare una risposta fondata sui documenti disponibili.

Se il prodotto prevede questa copertura, potrebbe stare in un'appendice o in un'edizione diversa del set informativo: referenziala e ripeti la domanda.`,
    citazioni: [],
    provenienze: [],
    nonSupportato: true,
  };
}

function scenarioFranchigie() {
  return {
    testo: `Sulle franchigie le due proposte seguono logiche diverse.

**Generali AUTOPIÙ** applica sulla garanzia furto e incendio una franchigia fissa di 250 € per sinistro: l'importo a carico del cliente è lo stesso qualunque sia l'entità del danno.

**Il preventivo UnipolSai** prevede invece uno scoperto del 10% con un minimo di 500 €: su un danno da 8.000 € restano a carico del cliente 800 €, e il minimo scatta anche sui danni piccoli.

Per un cliente che teme soprattutto il danno parziale, la franchigia fissa è quasi sempre la formula più prevedibile — ed è la prassi che la tua agenzia segue per i clienti con più veicoli.`,
    citazioni: [citazione(CITAZIONE_FRANCHIGIA_GENERALI), citazione(CITAZIONE_SCOPERTO_UNIPOL)],
    /* RF-G-03: quando la risposta si fonda su un ricordo il sistema lo rende
       riconoscibile. Il ricordo esiste davvero nelle fixture della memoria. */
    provenienze: [
      {
        tipo: 'memoria',
        origineId: 'ric-003',
        etichetta: 'tiene conto del ricordo "franchigie fisse per i clienti con più veicoli"',
      },
    ],
    /* RF-G-01: la memoria impara durante la conversazione — a risposta data
       il sistema dice cosa ha memorizzato, e la bolla lo collega al pannello. */
    ricordiAppresi: [
      {
        id: 'ric-007',
        testo: 'Per i clienti che temono il danno parziale l’agenzia presenta la franchigia fissa come formula più prevedibile.',
        categoria: 'prassi',
        ambito: 'tenant',
      },
    ],
  };
}

/** Il caso pilota dell'analisi (§5.3): Generali AUTOPIÙ contro preventivo UnipolSai. */
function scenarioConfronto() {
  return {
    testo: `Ho confrontato le due proposte sulle voci che incidono di più sul premio e sulla tutela dell'assicurato.

**Massimale RC** — Le due proposte si equivalgono: 6.450.000 € per sinistro su entrambe, di cui 1.300.000 € per danni a cose. È il massimale minimo di legge, quindi nessuna delle due offre un vantaggio su questa voce.

**Franchigia furto e incendio** — Qui la differenza è netta. La proposta Generali applica una franchigia fissa di 250 €, quella UnipolSai uno scoperto del 10% con un minimo di 500 €. Su un sinistro da 8.000 € significa 250 € contro 800 €.

**Garanzia infortuni del conducente** — Presente nella proposta Generali con massimale di 100.000 €, assente in quella UnipolSai.

**Assistenza stradale** — Entrambe la prevedono, ma la proposta UnipolSai include il traino illimitato mentre quella Generali lo limita a 50 km dal luogo del fermo.

In sintesi: la proposta Generali tutela meglio sui danni al veicolo e sulla persona del conducente; quella UnipolSai è più conveniente sull'assistenza. La scelta dipende dall'uso prevalente del veicolo.`,
    citazioni: [
      citazione(CITAZIONE_MASSIMALE_GENERALI),
      citazione(CITAZIONE_FRANCHIGIA_GENERALI),
      citazione(CITAZIONE_SCOPERTO_UNIPOL),
    ],
    /* RF-D-05: quando una risposta è influenzata da un'istruzione del tenant
       il sistema deve renderlo esplicito, e l'interfaccia deve saperlo
       mostrare fin dal primo giorno. */
    provenienze: [
      {
        tipo: 'regola',
        origineId: 'ist-003',
        etichetta: 'valutato secondo la regola "Infortuni del conducente"',
      },
    ],
  };
}

function scegliScenario(testo, documentiInContesto) {
  const t = testo.toLowerCase();
  if (!documentiInContesto.length) return scenarioSenzaDocumenti();
  if (t.includes('grandine') || t.includes('cristalli')) return scenarioNonCoperto();
  if (t.includes('franchig') || t.includes('scopert')) return scenarioFranchigie();
  return scenarioConfronto();
}

// ---------------------------------------------------------------------------
// Conversazioni
// ---------------------------------------------------------------------------

const trovaConversazione = (id) => CONVERSAZIONI.find((c) => c.id === id);

/**
 * Forma con cui la conversazione esce dall'API: il contesto documentale è
 * idratato in riferimenti compatti (`RiferimentoDocumento`) — id, titolo e
 * archivio. La barra del contesto deve poter dire *cosa* c'è dentro senza
 * una chiamata per documento; le fixture invece tengono i soli id.
 */
function componi(conversazione, trovaDocumento) {
  return {
    ...conversazione,
    documentiInContesto: conversazione.documentiInContesto
      .map((id) => {
        const allegato = trovaAllegato(id);
        if (allegato) return { id: allegato.id, titolo: allegato.titolo, archivio: 'conversazione' };
        const documento = trovaDocumento(id);
        return documento
          ? { id: documento.id, titolo: documento.titolo, archivio: documento.archivio }
          : undefined;
      })
      .filter(Boolean),
  };
}

const messaggiDi = (conversazioneId) =>
  MESSAGGI.filter((m) => m.conversazioneId === conversazioneId).sort((a, b) =>
    a.inviatoIl.localeCompare(b.inviatoIl),
  );

/**
 * Il titolo nasce dal primo messaggio, troncato al confine di parola: è ciò
 * che l'utente si aspetta di ritrovare nello storico, e "Nuova conversazione"
 * ripetuto dieci volte rende lo storico inservibile (RF-C-01).
 */
function titoloDaMessaggio(testo) {
  const pulito = testo.replace(/\s+/g, ' ').trim();
  if (pulito.length <= 60) return pulito;
  const tronco = pulito.slice(0, 60);
  return `${tronco.slice(0, tronco.lastIndexOf(' '))}…`;
}

/**
 * Aggiunge un documento al contesto della conversazione (RF-C-03).
 * Risponde con un errore se il documento non è utilizzabile e restituisce
 * `false`; il chiamante deve fermarsi.
 */
function aggiungiAlContesto(conversazione, documentoId, { inviaJson, trovaDocumento }, res) {
  /* Un allegato è sempre utilizzabile: nasce con la conversazione. */
  if (trovaAllegato(documentoId)) {
    if (!conversazione.documentiInContesto.includes(documentoId)) {
      conversazione.documentiInContesto.push(documentoId);
    }
    return true;
  }
  const documento = trovaDocumento(documentoId);
  if (!documento) {
    inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Documento inesistente.' });
    return false;
  }
  /* Un documento non ancora elaborato non è referenziabile: l'AI non riesce
     a leggerlo (RF-B-05). Il selettore non dovrebbe proporlo, ma il server
     resta l'ultima linea. */
  if (documento.archivio === 'privato' && documento.stato !== 'pronto') {
    inviaJson(res, 409, {
      codice: 'NON_PRONTO',
      messaggio: `«${documento.titolo}» non è ancora elaborato: non può essere referenziato finché non è pronto.`,
    });
    return false;
  }
  if (!conversazione.documentiInContesto.includes(documentoId)) {
    conversazione.documentiInContesto.push(documentoId);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

async function streamingRisposta(req, res, conversazione, nuovoMessaggio) {
  const adesso = new Date().toISOString();

  const messaggioUtente = {
    id: `msg-${prossimoMessaggio++}`,
    conversazioneId: conversazione.id,
    autore: 'utente',
    testo: nuovoMessaggio.testo,
    inviatoIl: adesso,
    documentiReferenziati: nuovoMessaggio.documentiReferenziati ?? [],
    citazioni: [],
    provenienze: [],
  };
  MESSAGGI.push(messaggioUtente);
  conversazione.aggiornataIl = adesso;
  if (conversazione.titolo === TITOLO_NUOVA) {
    conversazione.titolo = titoloDaMessaggio(nuovoMessaggio.testo);
  }

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

  const scenario = scegliScenario(nuovoMessaggio.testo, conversazione.documentiInContesto);
  const messaggioId = `msg-${prossimoMessaggio++}`;

  invia({ tipo: 'inizio', messaggioId, messaggioUtenteId: messaggioUtente.id });

  /* Pausa iniziale: il modello vero ci mette un attimo prima del primo
     token, e l'interfaccia deve mostrare qualcosa in quel vuoto. */
  await attendi(700);

  /* Il pannello di sviluppo può chiedere un errore a metà risposta: è il
     caso che l'interfaccia deve reggere meglio — testo già mostrato, stream
     morto, possibilità di riprovare. */
  const erroreAMeta = req.headers['x-mock-errore'] === '500';

  const blocchi = scenario.testo.match(/\S+\s*/g) ?? [];
  let emessi = 0;
  for (const blocco of blocchi) {
    if (interrotto) return;
    if (erroreAMeta && emessi === 20) {
      invia({ tipo: 'errore', messaggio: 'Il servizio si è interrotto durante la risposta.' });
      res.end();
      return;
    }
    invia({ tipo: 'testo', delta: blocco });
    emessi += 1;
    await attendi(MS_PER_BLOCCO);
  }

  if (scenario.nonSupportato) {
    invia({ tipo: 'non-supportato' });
  }

  /* Citazioni e provenienze arrivano in coda, come farebbe un backend che le
     consolida a risposta completa. Se il backend vero le emetterà via via,
     l'interfaccia deve reggere entrambi i casi: è il motivo per cui sono
     eventi separati e non campi di un unico oggetto finale. */
  for (const c of scenario.citazioni) {
    if (interrotto) return;
    invia({ tipo: 'citazione', citazione: c });
    await attendi(120);
  }
  for (const p of scenario.provenienze) {
    if (interrotto) return;
    invia({ tipo: 'provenienza', provenienza: p });
    await attendi(120);
  }

  /* RF-G-01: la memoria impara in linea, prima del `fine`: il passo si
     vede, l'esito arriva solo se qualcosa è stato imparato. */
  if (scenario.ricordiAppresi?.length) {
    if (interrotto) return;
    invia({ tipo: 'attivita', etichetta: 'Cerco qualcosa da ricordare' });
    await attendi(900);
    if (interrotto) return;
    invia({ tipo: 'memoria', ricordi: scenario.ricordiAppresi });
    await attendi(120);
  }

  /* Il messaggio si persiste solo a risposta completa: uno stream interrotto
     non lascia mezzi messaggi nello storico, e ricaricando si ritrova la
     conversazione com'era prima dell'invio. */
  const fine = new Date().toISOString();
  MESSAGGI.push({
    id: messaggioId,
    conversazioneId: conversazione.id,
    autore: 'assistente',
    testo: scenario.testo,
    inviatoIl: fine,
    documentiReferenziati: [],
    citazioni: scenario.citazioni,
    provenienze: scenario.provenienze,
    ...(scenario.nonSupportato ? { nonSupportato: true } : {}),
  });
  conversazione.aggiornataIl = fine;

  invia({ tipo: 'fine' });
  res.end();
}

// ---------------------------------------------------------------------------
// Instradamento
// ---------------------------------------------------------------------------

/**
 * Gestisce le rotte della chat. I template di output stanno nel modulo
 * impostazioni (Fase 5), che ne è il pannello di governo: qui si usano
 * soltanto, per l'esportazione (RF-C-10).
 * Restituisce `true` se ha risposto, `false` se la rotta non è sua.
 */
export async function gestisci(req, res, url, deps) {
  const { inviaJson, leggiCorpo, simulazione, trovaDocumento } = deps;
  const percorso = url.pathname;
  const esporta = (conversazione) => componi(conversazione, trovaDocumento);

  if (!percorso.startsWith('/api/conversazioni')) {
    return false;
  }

  const streaming = req.method === 'POST' && /^\/api\/conversazioni\/[^/]+\/messaggi$/.test(percorso);

  /* Lo streaming non passa dalla simulazione — la latenza è già nel suo
     ritmo, e l'errore a metà risposta è gestito dentro lo stream. */
  if (!streaming && (await simulazione(req, res))) return true;

  /* RF-C-02 — allegati di conversazione. Le rotte fisse vanno riconosciute
     prima di `/:id`, o «allegati» verrebbe letto come id. */
  if (percorso === '/api/conversazioni/allegati' && req.method === 'POST') {
    const corpo = await leggiCorpo(req);
    const file = leggiMultipart(corpo, req.headers['content-type']);
    if (!file.length) {
      inviaJson(res, 400, { codice: 'FILE_MANCANTE', messaggio: 'Nessun file nel caricamento.' });
      return true;
    }
    const allegato = {
      id: `all-${prossimoAllegato++}`,
      titolo: file[0].nome,
      numeroPagine: 4,
    };
    ALLEGATI.push(allegato);
    inviaJson(res, 201, { id: allegato.id, titolo: allegato.titolo, archivio: 'conversazione' });
    return true;
  }

  const rottaFileAllegato = percorso.match(/^\/api\/conversazioni\/allegati\/([^/]+)\/file$/);
  if (rottaFileAllegato && req.method === 'GET') {
    const allegato = trovaAllegato(rottaFileAllegato[1]);
    if (!allegato) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Allegato inesistente.' });
      return true;
    }
    const pdf = generaPdf(allegato.titolo, allegato.numeroPagine);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': 'inline',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(pdf);
    return true;
  }

  // RF-C-01: lo storico, la più recente in cima
  if (percorso === '/api/conversazioni' && req.method === 'GET') {
    const ordinate = [...CONVERSAZIONI].sort((a, b) =>
      b.aggiornataIl.localeCompare(a.aggiornataIl),
    );
    inviaJson(res, 200, {
      elementi: ordinate.map(esporta),
      totale: ordinate.length,
      pagina: 1,
      perPagina: ordinate.length,
    });
    return true;
  }

  if (percorso === '/api/conversazioni' && req.method === 'POST') {
    const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    const adesso = new Date().toISOString();
    const conversazione = {
      id: `cnv-${prossimaConversazione++}`,
      titolo: corpo.titolo || TITOLO_NUOVA,
      creataIl: adesso,
      aggiornataIl: adesso,
      documentiInContesto: [],
      condivisa: false,
      autoreId: 'utn-004',
    };
    for (const documentoId of corpo.documentiInContesto ?? []) {
      if (!aggiungiAlContesto(conversazione, documentoId, deps, res)) return true;
    }
    CONVERSAZIONI.push(conversazione);
    inviaJson(res, 201, esporta(conversazione));
    return true;
  }

  /*
   * RF-C-10: esportazione della risposta su un template di output. Il file è
   * generato qui, con il testo vero del messaggio e le fonti in coda; il
   * template grafico dell'agenzia lo applicherà il backend (RF-D-10).
   */
  const rottaEsporta = percorso.match(/^\/api\/conversazioni\/([^/]+)\/messaggi\/([^/]+)\/esporta$/);
  if (rottaEsporta && req.method === 'POST') {
    const messaggio = MESSAGGI.find(
      (m) => m.conversazioneId === rottaEsporta[1] && m.id === rottaEsporta[2],
    );
    if (!messaggio) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Messaggio inesistente.' });
      return true;
    }
    const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    const template = risolviTemplate(corpo);
    if (template === null) {
      inviaJson(res, 400, { codice: 'DATI_NON_VALIDI', messaggio: 'Indica il template o il formato su cui esportare.' });
      return true;
    }
    if (!template) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Template inesistente.' });
      return true;
    }

    const fonti = messaggio.citazioni.map((c) => {
      const posizione = [
        c.posizione.articolo ? `art. ${c.posizione.articolo}` : c.posizione.sezione,
        `p. ${c.posizione.pagina}`,
      ]
        .filter(Boolean)
        .join(', ');
      return `${c.documentoTitolo} — ${posizione}`;
    });

    let file;
    let mime;
    switch (template.formato) {
      case 'docx':
        file = generaDocx(template.nome, messaggio.testo, fonti);
        mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xlsx':
        file = generaXlsx([
          ['Contenuto'],
          ...messaggio.testo
            .replaceAll('**', '')
            .split(/\n{2,}/)
            .map((p) => [p.replace(/\s+/g, ' ').trim()]),
          [''],
          ['Fonti'],
          ...fonti.map((f) => [f]),
        ]);
        mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      default:
        file = generaPdfDaTesto(
          template.nome,
          `${messaggio.testo}\n\nFonti:\n\n${fonti.join('\n\n')}`,
        );
        mime = 'application/pdf';
    }

    const nomeFile = `${template.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${template.formato}`;
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': file.length,
      'Content-Disposition': `attachment; filename="${nomeFile}"`,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(file);
    return true;
  }

  const rotta = percorso.match(
    /^\/api\/conversazioni\/([^/]+)(?:\/(messaggi|contesto)(?:\/([^/]+))?)?$/,
  );
  if (!rotta) return false;

  const conversazione = trovaConversazione(rotta[1]);
  if (!conversazione) {
    inviaJson(res, 404, { codice: 'NON_TROVATA', messaggio: 'Conversazione inesistente.' });
    return true;
  }

  // /api/conversazioni/:id
  if (!rotta[2]) {
    if (req.method === 'GET') {
      inviaJson(res, 200, esporta(conversazione));
      return true;
    }
    // RF-C-01: rinomina (e condivisione, RF-C-15)
    if (req.method === 'PATCH') {
      const modifiche = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
      if (typeof modifiche.titolo === 'string' && modifiche.titolo.trim()) {
        conversazione.titolo = modifiche.titolo.trim();
      }
      if (typeof modifiche.condivisa === 'boolean') {
        conversazione.condivisa = modifiche.condivisa;
      }
      conversazione.aggiornataIl = new Date().toISOString();
      inviaJson(res, 200, esporta(conversazione));
      return true;
    }
    if (req.method === 'DELETE') {
      CONVERSAZIONI.splice(CONVERSAZIONI.indexOf(conversazione), 1);
      for (let i = MESSAGGI.length - 1; i >= 0; i--) {
        if (MESSAGGI[i].conversazioneId === conversazione.id) MESSAGGI.splice(i, 1);
      }
      res.writeHead(204).end();
      return true;
    }
    return false;
  }

  // /api/conversazioni/:id/messaggi
  if (rotta[2] === 'messaggi' && !rotta[3]) {
    if (req.method === 'GET') {
      /* Il filo intero, senza paginazione: una conversazione si rilegge
         dall'inizio, e lo scorrimento è dell'interfaccia, non dell'API. */
      inviaJson(res, 200, messaggiDi(conversazione.id));
      return true;
    }
    if (req.method === 'POST') {
      const nuovo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
      if (!nuovo.testo?.trim()) {
        inviaJson(res, 400, { codice: 'MESSAGGIO_VUOTO', messaggio: 'Il messaggio è vuoto.' });
        return true;
      }
      /* RF-C-03: i documenti referenziati nel messaggio entrano nel contesto
         della conversazione, prima che la risposta parta. */
      for (const documentoId of nuovo.documentiReferenziati ?? []) {
        if (!aggiungiAlContesto(conversazione, documentoId, deps, res)) return true;
      }
      await streamingRisposta(req, res, conversazione, nuovo);
      return true;
    }
    return false;
  }

  // /api/conversazioni/:id/contesto/:documentoId — RF-C-03: rimovibile finché l'utente non decide altrimenti
  if (rotta[2] === 'contesto' && rotta[3]) {
    if (req.method === 'PUT') {
      if (!aggiungiAlContesto(conversazione, rotta[3], deps, res)) return true;
      conversazione.aggiornataIl = new Date().toISOString();
      inviaJson(res, 200, esporta(conversazione));
      return true;
    }
    if (req.method === 'DELETE') {
      const indice = conversazione.documentiInContesto.indexOf(rotta[3]);
      if (indice !== -1) conversazione.documentiInContesto.splice(indice, 1);
      conversazione.aggiornataIl = new Date().toISOString();
      inviaJson(res, 200, esporta(conversazione));
      return true;
    }
    return false;
  }

  return false;
}
