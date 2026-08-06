/**
 * Agenti: la parte del mock che lavora da sola (Modulo E, RF-E-01…E-13).
 *
 * Dopo la macchina a stati dell'elaborazione documenti e la generazione
 * progressiva delle tabelle, qui c'è il **ciclo di vita di un'esecuzione**:
 * un'esecuzione avviata nasce `in-coda`, passa `in-corso` mentre il log si
 * allunga un passo alla volta, e si assesta `completata` o `fallita`. Il
 * front-end la segue con il polling dello storico — lo stesso schema di
 * RF-B-05, nessuna forma di risposta nuova.
 *
 * ## Deterministico, come chat e tabelle
 *
 * Gli esiti sono scenari fissi per agente, non testo casuale: la verifica del
 * preventivo del caso pilota produce gli stessi numeri e le stesse citazioni
 * degli scenari della chat e delle celle della tabella. Il fallimento
 * persistente (RF-E-11) è a sua volta uno scenario: l'agente marcato
 * `_scenario: 'fallimento'` nelle fixture fallisce sempre, dopo tre tentativi
 * loggati — così l'interfaccia del caso peggiore si può mostrare a comando.
 *
 * ## I limiti si applicano davvero (RF-E-09)
 *
 * Attivare un agente oltre la soglia del piano risponde 409; avviare
 * un'esecuzione con troppe già in corso risponde 429 con `ritentaTraSecondi`.
 * `GET /api/agenti/limiti` espone soglie e consumi, perché il front-end deve
 * poterli dire prima che l'errore arrivi.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generaDocx, generaXlsx } from './ufficio.mjs';
import { generaPdfDaTesto } from './pdf.mjs';
import { trovaTemplate } from './impostazioni.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const leggi = (nome) => JSON.parse(readFileSync(join(QUI, 'data', nome), 'utf8'));

const AGENTI = leggi('agenti.json');
const ESECUZIONI = leggi('esecuzioni.json');
const PREDEFINITI = leggi('agenti-predefiniti.json');
const COMPAGNIE = leggi('compagnie.json');
const RAMI = leggi('rami.json');

/**
 * I limiti del piano (RF-E-09). Nel prodotto verranno dal piano commerciale
 * del tenant; qui sono bassi apposta, perché in demo si devono incontrare.
 */
const LIMITI = {
  agentiAttiviMax: 5,
  esecuzioniConcorrentiMax: 2,
  frequenzaMinima: 'giornaliera',
};

/** Ritmo della simulazione: un passo di log al secondo, come una vera coda. */
const MS_PER_PASSO = 1100;

/* I contatori partono alti per non collidere con gli id delle fixture. */
let prossimoAgente = 100;
let prossimaEsecuzione = 100;
let prossimaCitazione = 950;

const utenteCorrente = (req) =>
  req.headers['x-assieme-ruolo'] === 'amministratore'
    ? { id: 'utn-001', nome: 'Marta Ferrero' }
    : { id: 'utn-004', nome: 'Davide Lo Bianco' };

// ---------------------------------------------------------------------------
// Forme di risposta
// ---------------------------------------------------------------------------

/**
 * Le fonti escono **idratate** con l'etichetta pronta, come il contesto della
 * chat: la schermata non deve comporre nomi di compagnie e rami da sola.
 */
function etichettaFonte(fonte, trovaDocumento) {
  if (fonte.tipo === 'documenti-riferimento') return 'Documenti di riferimento dell’agenzia';
  if (fonte.tipo === 'documento') {
    return trovaDocumento(fonte.documentoId)?.titolo ?? `Documento ${fonte.documentoId} (non più disponibile)`;
  }
  const parti = [fonte.archivio === 'pubblico' ? 'Archivio Pubblico' : 'Archivio Privato'];
  const dettagli = [
    COMPAGNIE.find((c) => c.id === fonte.compagniaId)?.nome,
    RAMI.find((r) => r.id === fonte.ramoId)?.nome,
    fonte.soloPreferiti ? 'solo preferiti' : undefined,
  ].filter(Boolean);
  return dettagli.length ? `${parti[0]} — ${dettagli.join(', ')}` : `${parti[0]} — tutto`;
}

/** L'agente nella forma del contratto: fonti idratate, campi interni fuori. */
function rispostaAgente(agente, trovaDocumento) {
  const { _scenario, ...pulito } = agente;
  return {
    ...pulito,
    fonti: agente.fonti.map((f) => ({ ...f, etichetta: etichettaFonte(f, trovaDocumento) })),
  };
}

function riepilogoEsecuzione(e) {
  return {
    id: e.id,
    agenteId: e.agenteId,
    avviataIl: e.avviataIl,
    ...(e.conclusaIl ? { conclusaIl: e.conclusaIl } : {}),
    modalita: e.modalita,
    stato: e.stato,
    tentativi: e.tentativi,
    ...(e.documentoGeneratoUrl ? { documentoGeneratoUrl: e.documentoGeneratoUrl } : {}),
    ...(e.errore ? { errore: e.errore } : {}),
  };
}

function ultimaEsecuzione(agenteId) {
  const sue = ESECUZIONI.filter((e) => e.agenteId === agenteId);
  if (!sue.length) return undefined;
  return riepilogoEsecuzione([...sue].sort((a, b) => b.avviataIl.localeCompare(a.avviataIl))[0]);
}

function riepilogoAgente(agente) {
  return {
    id: agente.id,
    nome: agente.nome,
    descrizione: agente.descrizione,
    attivo: agente.attivo,
    formatoOutput: agente.formatoOutput,
    ...(agente.pianificazione ? { pianificazione: agente.pianificazione } : {}),
    numeroFonti: agente.fonti.length,
    ...(ultimaEsecuzione(agente.id) ? { ultimaEsecuzione: ultimaEsecuzione(agente.id) } : {}),
  };
}

const agentiAttivi = () => AGENTI.filter((a) => a.attivo).length;
const esecuzioniInCorso = () =>
  ESECUZIONI.filter((e) => e.stato === 'in-coda' || e.stato === 'in-corso').length;

// ---------------------------------------------------------------------------
// Esiti deterministici
// ---------------------------------------------------------------------------

function citazione(documentoId, documentoTitolo, archivio, posizione, estratto) {
  return { id: `cit-${prossimaCitazione++}`, documentoId, documentoTitolo, archivio, posizione, estratto };
}

/** Il confronto del caso pilota: gli stessi numeri di chat e tabelle. */
function esitoVerificaPreventivo(parametri, trovaDocumento) {
  const preventivo = trovaDocumento(parametri?.preventivo);
  if (preventivo?.id === 'doc-priv-001') {
    return {
      output:
        'Confronto fra il preventivo UnipolSai per la Fiat 500X targa GK492ZR e le Condizioni AUTOPIÙ in essere.\n\n' +
        '**Massimale RC**: identico nelle due offerte — 6.450.000 € per sinistro, di cui 1.300.000 € per danni a cose.\n\n' +
        '**Furto e incendio**: AUTOPIÙ applica una franchigia fissa di 250 € per sinistro, il preventivo UnipolSai uno scoperto del 10% con minimo di 500 €. Su un furto parziale da 3.000 € la differenza è di 50 € a favore di AUTOPIÙ; su danni maggiori lo scoperto cresce senza tetto.\n\n' +
        '**Infortuni del conducente**: la garanzia non compare nel preventivo UnipolSai né nelle condizioni da esso richiamate. Secondo i criteri dell’agenzia questa assenza non va segnalata come carenza: la copertura è gestita con polizza dedicata.\n\n' +
        '**Assistenza stradale**: il preventivo prevede traino illimitato e veicolo sostitutivo fino a 7 giorni, contro il traino a 50 km di AUTOPIÙ.',
      citazioni: [
        citazione('doc-pub-003', 'Condizioni di Assicurazione — Active Veicoli AUTOPIÙ con Telematica', 'pubblico',
          { pagina: 41, articolo: '27', sezione: 'Furto e incendio' },
          'La garanzia è prestata con applicazione di una franchigia fissa di euro 250 per ciascun sinistro.'),
        citazione('doc-priv-001', 'Preventivo UnipolSai — Fiat 500X targa GK492ZR', 'privato',
          { pagina: 3, sezione: 'Garanzie accessorie' },
          'Furto e Incendio: scoperto 10% con il minimo di euro 500 per ciascun sinistro.'),
        citazione('doc-pub-003', 'Condizioni di Assicurazione — Active Veicoli AUTOPIÙ con Telematica', 'pubblico',
          { pagina: 52, articolo: '35', sezione: 'Infortuni del conducente' },
          'La garanzia infortuni del conducente è prestata con un massimale di euro 100.000 per persona.'),
      ],
    };
  }
  const titolo = preventivo?.titolo ?? 'il documento indicato';
  return {
    output:
      `Confronto fra **${titolo}** e le Condizioni AUTOPIÙ in essere.\n\n` +
      '**Massimale RC**: le Condizioni AUTOPIÙ prevedono 6.450.000 € per sinistro, di cui 1.300.000 € per danni a cose.\n\n' +
      `Nei documenti forniti non è presente un quadro di garanzie confrontabile voce per voce: per ${titolo} il confronto puntuale su franchigie e scoperti non è determinabile con le fonti disponibili, e viene dichiarato invece che dedotto.`,
    citazioni: [
      citazione('doc-pub-003', 'Condizioni di Assicurazione — Active Veicoli AUTOPIÙ con Telematica', 'pubblico',
        { pagina: 14, articolo: '12', sezione: 'Responsabilità civile' },
        'Il massimale per sinistro è pari a euro 6.450.000, di cui euro 1.300.000 per danni a cose.'),
    ],
  };
}

/** L'esito di un'esecuzione avviata adesso, per agente. Sempre lo stesso. */
function componiEsito(agente, parametri, trovaDocumento) {
  switch (agente.id) {
    case 'agt-001':
      return {
        output:
          'Nessuna novità nelle edizioni dei prodotti auto preferiti.\n\n' +
          'Controllati i set informativi di **Active Veicoli AUTOPIÙ con Telematica** (Generali Italia) e **KM Sicuri Auto** (UnipolSai): le edizioni correnti coincidono con quelle già note all’archivio.',
        citazioni: [],
      };
    case 'agt-002':
      return {
        output:
          'Negli ultimi sette giorni sono entrati nell’Archivio Privato **2 documenti**.\n\n' +
          '**Preventivi**: Preventivo Reale Mutua — Protezione Casa via Dante 14 (Davide Lo Bianco, ancora in elaborazione).\n\n' +
          '**Da sistemare**: la scansione del questionario sanitario di Verdi Anna resta in errore di elaborazione — il file va ricaricato in qualità migliore.\n\n' +
          'Spazio occupato: 84 MB su 2 GB del piano.',
        citazioni: [],
      };
    case 'agt-003':
      return esitoVerificaPreventivo(parametri, trovaDocumento);
    case 'agt-004':
      return {
        output:
          '**Una scadenza nei prossimi sessanta giorni.**\n\n' +
          'La Convenzione Generali — Agenzia Meridiana 2026 scade il **30 settembre 2026**: il rinnovo va concordato con la direzione commerciale entro fine agosto per non perdere le condizioni riservate.',
        citazioni: [
          citazione('doc-priv-003', 'Convenzione Generali — Agenzia Meridiana 2026', 'privato',
            { pagina: 6, articolo: '14', sezione: 'Durata e rinnovo' },
            'La presente convenzione ha validità fino al 30 settembre 2026 e si intende rinnovata solo previo accordo scritto fra le parti.'),
        ],
      };
    default: {
      /* Agenti creati dall'utente: un esito prudente, con citazione se fra le
         fonti c'è un documento puntuale — e la dichiarazione esplicita del
         limite in caso contrario (RF-E-08). */
      const fonteDocumento = agente.fonti.find((f) => f.tipo === 'documento');
      const documento = fonteDocumento ? trovaDocumento(fonteDocumento.documentoId) : undefined;
      if (documento) {
        return {
          output:
            `Esecuzione completata sulle fonti configurate.\n\n**${documento.titolo}** è stato esaminato secondo le istruzioni dell’agente; il passaggio più rilevante è riportato in citazione.`,
          citazioni: [
            citazione(documento.id, documento.titolo, documento.archivio,
              { pagina: Math.min(documento.numeroPagine ?? 3, 3), sezione: 'Condizioni generali' },
              'Le condizioni indicate nel presente documento si applicano nei limiti e con le esclusioni ivi previste.'),
          ],
        };
      }
      return {
        output:
          'Esecuzione completata sulle fonti configurate.\n\nLe fonti selezionate non contengono passaggi puntuali da citare per le istruzioni date: l’esito è una sintesi di insieme, senza affermazioni attribuite a documenti specifici.',
        citazioni: [],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// La macchina a stati dell'esecuzione
// ---------------------------------------------------------------------------

const adesso = () => new Date().toISOString();

function aggiungiLog(esecuzione, livello, messaggio) {
  esecuzione.log.push({ istante: adesso(), livello, messaggio });
}

/**
 * Fa avanzare un'esecuzione appena creata, un passo alla volta. I passi sono
 * una sceneggiatura: si costruiscono all'avvio e un timer li recita. Il
 * fallimento persistente (RF-E-11) recita i suoi tre tentativi, con gli
 * avvisi di retry nel log.
 */
function avviaSimulazione(agente, esecuzione, utente, trovaDocumento) {
  const passi = [];

  passi.push(() => {
    esecuzione.stato = 'in-corso';
    esecuzione.tentativi = 1;
    aggiungiLog(esecuzione, 'info', `Esecuzione manuale avviata da ${utente.nome}.`);
  });

  for (const parametro of agente.parametri ?? []) {
    const valore = esecuzione.parametri?.[parametro.chiave];
    if (!valore) continue;
    const testo =
      parametro.tipo === 'documento'
        ? `«${trovaDocumento(valore)?.titolo ?? valore}»`
        : `«${valore}»`;
    passi.push(() => aggiungiLog(esecuzione, 'info', `Parametro ${parametro.chiave} = ${testo}.`));
  }

  passi.push(() =>
    aggiungiLog(
      esecuzione,
      'info',
      `Raccolte le fonti: ${agente.fonti.length === 1 ? '1 fonte configurata' : `${agente.fonti.length} fonti configurate`}.`,
    ),
  );

  if (agente._scenario === 'fallimento') {
    for (let tentativo = 1; tentativo <= 3; tentativo++) {
      passi.push(() => {
        esecuzione.tentativi = tentativo;
        aggiungiLog(esecuzione, 'errore', 'Il provider AI non ha risposto entro il tempo previsto.');
      });
      if (tentativo < 3) {
        passi.push(() => aggiungiLog(esecuzione, 'avviso', `Nuovo tentativo (${tentativo + 1} di 3).`));
      }
    }
    passi.push(() => {
      esecuzione.stato = 'fallita';
      esecuzione.conclusaIl = adesso();
      esecuzione.errore = 'Il provider AI non ha risposto entro il tempo previsto, per tre tentativi consecutivi.';
      aggiungiLog(esecuzione, 'errore', 'Terzo tentativo fallito: esecuzione interrotta.');
    });
  } else {
    passi.push(() => aggiungiLog(esecuzione, 'info', 'Interrogazione del modello e composizione dell’esito.'));
    passi.push(() => {
      const esito = componiEsito(agente, esecuzione.parametri, trovaDocumento);
      esecuzione.output = esito.output;
      esecuzione.citazioni = esito.citazioni;
      if (agente.templateOutputId && trovaTemplate(agente.templateOutputId)) {
        esecuzione.documentoGeneratoUrl = `/api/agenti/${agente.id}/esecuzioni/${esecuzione.id}/documento`;
        aggiungiLog(esecuzione, 'info', `Documento generato sul template «${trovaTemplate(agente.templateOutputId).nome}».`);
      }
      esecuzione.stato = 'completata';
      esecuzione.conclusaIl = adesso();
      aggiungiLog(esecuzione, 'info', `Esito composto: ${esecuzione.citazioni.length === 1 ? '1 citazione' : `${esecuzione.citazioni.length} citazioni`}.`);
    });
  }

  const timer = setInterval(() => {
    const passo = passi.shift();
    if (!passo) {
      clearInterval(timer);
      return;
    }
    passo();
  }, MS_PER_PASSO);
}

// ---------------------------------------------------------------------------
// Documento generato (RF-E-13)
// ---------------------------------------------------------------------------

/** Dal markdown minimo dell'output al testo piano del documento. */
const testoPiano = (markdown) => markdown.replaceAll('**', '');

function etichettaCitazione(c) {
  const dove = [c.posizione.articolo ? `art. ${c.posizione.articolo}` : c.posizione.sezione, `p. ${c.posizione.pagina}`]
    .filter(Boolean)
    .join(', ');
  return `${c.documentoTitolo} — ${dove}`;
}

function scaricaDocumento(res, agente, esecuzione) {
  const template = trovaTemplate(agente.templateOutputId);
  const titolo = `${agente.nome} — esito`;
  const corpo = testoPiano(esecuzione.output ?? '');
  const fonti = esecuzione.citazioni.map(etichettaCitazione);

  let file;
  let mime;
  switch (template?.formato) {
    case 'xlsx':
      file = generaXlsx([
        ['Esito'],
        ...corpo.split(/\n{2,}/).map((p) => [p.replaceAll('\n', ' ')]),
        [''],
        ['Fonti'],
        ...fonti.map((f) => [f]),
      ]);
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      break;
    case 'docx':
      file = generaDocx(titolo, corpo, fonti);
      mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      break;
    default:
      file = generaPdfDaTesto(titolo, fonti.length ? `${corpo}\n\nFonti:\n\n${fonti.join('\n\n')}` : corpo);
      mime = 'application/pdf';
  }

  const nomeFile = `${agente.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${esecuzione.id}.${template?.formato ?? 'pdf'}`;
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': file.length,
    'Content-Disposition': `attachment; filename="${nomeFile}"`,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(file);
}

// ---------------------------------------------------------------------------
// Validazione
// ---------------------------------------------------------------------------

/** Le fonti come arrivano dal client (`NuovaFonteAgente`), ripulite. */
function normalizzaFonti(fonti) {
  if (!Array.isArray(fonti)) return undefined;
  const pulite = [];
  for (const fonte of fonti) {
    if (fonte?.tipo === 'documento' && fonte.documentoId) {
      pulite.push({ tipo: 'documento', documentoId: fonte.documentoId, archivio: fonte.archivio === 'privato' ? 'privato' : 'pubblico' });
    } else if (fonte?.tipo === 'selezione' && (fonte.archivio === 'pubblico' || fonte.archivio === 'privato')) {
      pulite.push({
        tipo: 'selezione',
        archivio: fonte.archivio,
        ...(fonte.ramoId ? { ramoId: fonte.ramoId } : {}),
        ...(fonte.compagniaId ? { compagniaId: fonte.compagniaId } : {}),
        ...(fonte.soloPreferiti ? { soloPreferiti: true } : {}),
      });
    } else if (fonte?.tipo === 'documenti-riferimento') {
      pulite.push({ tipo: 'documenti-riferimento' });
    }
  }
  return pulite;
}

function normalizzaParametri(parametri) {
  if (!Array.isArray(parametri)) return undefined;
  return parametri
    .filter((p) => p?.chiave && p?.etichetta)
    .map((p) => ({
      chiave: String(p.chiave),
      etichetta: String(p.etichetta),
      tipo: p.tipo === 'documento' ? 'documento' : 'testo',
      obbligatorio: Boolean(p.obbligatorio),
      ...(p.suggerimento ? { suggerimento: String(p.suggerimento) } : {}),
    }));
}

function normalizzaPianificazione(p) {
  if (!p || !['giornaliera', 'settimanale', 'mensile'].includes(p.frequenza)) return undefined;
  return {
    frequenza: p.frequenza,
    orario: /^\d{2}:\d{2}$/.test(p.orario ?? '') ? p.orario : '08:00',
    ...(p.frequenza === 'settimanale' ? { giornoSettimana: Math.min(Math.max(Number(p.giornoSettimana) || 1, 1), 7) } : {}),
    ...(p.frequenza === 'mensile' ? { giornoMese: Math.min(Math.max(Number(p.giornoMese) || 1, 1), 28) } : {}),
    sospesa: Boolean(p.sospesa),
  };
}

// ---------------------------------------------------------------------------
// Instradamento
// ---------------------------------------------------------------------------

/**
 * Gestisce le rotte degli agenti.
 * Restituisce `true` se ha risposto, `false` se la rotta non è sua.
 */
export async function gestisci(req, res, url, deps) {
  const { inviaJson, leggiCorpo, trovaDocumento } = deps;
  const percorso = url.pathname;

  if (!percorso.startsWith('/api/agenti')) return false;

  // GET /api/agenti — attivi prima, poi per nome: l'elenco è la plancia
  if (percorso === '/api/agenti' && req.method === 'GET') {
    const ordinati = [...AGENTI].sort(
      (a, b) => Number(b.attivo) - Number(a.attivo) || a.nome.localeCompare(b.nome, 'it'),
    );
    inviaJson(res, 200, {
      elementi: ordinati.map(riepilogoAgente),
      totale: ordinati.length,
      pagina: 1,
      perPagina: ordinati.length,
    });
    return true;
  }

  /* La libreria (RF-E-10) e i limiti (RF-E-09): rotte fisse, da riconoscere
     prima di `/:id` — o «predefiniti» verrebbe letto come id. */
  if (percorso === '/api/agenti/predefiniti' && req.method === 'GET') {
    inviaJson(res, 200, PREDEFINITI);
    return true;
  }
  if (percorso === '/api/agenti/limiti' && req.method === 'GET') {
    inviaJson(res, 200, {
      agentiAttiviMax: LIMITI.agentiAttiviMax,
      agentiAttivi: agentiAttivi(),
      esecuzioniConcorrentiMax: LIMITI.esecuzioniConcorrentiMax,
      esecuzioniInCorso: esecuzioniInCorso(),
      frequenzaMinima: LIMITI.frequenzaMinima,
    });
    return true;
  }

  // POST /api/agenti — creazione (RF-E-01/02)
  if (percorso === '/api/agenti' && req.method === 'POST') {
    const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    const fonti = normalizzaFonti(corpo.fonti) ?? [];
    if (!corpo.nome?.trim() || !corpo.istruzioni?.trim() || !fonti.length) {
      inviaJson(res, 400, {
        codice: 'AGENTE_INCOMPLETO',
        messaggio: 'Servono almeno un nome, le istruzioni del task e una fonte documentale.',
      });
      return true;
    }
    if (agentiAttivi() >= LIMITI.agentiAttiviMax) {
      inviaJson(res, 409, {
        codice: 'LIMITE_AGENTI',
        messaggio: `Il piano consente ${LIMITI.agentiAttiviMax} agenti attivi: disattivane uno per attivarne un altro.`,
      });
      return true;
    }
    const agente = {
      id: `agt-${prossimoAgente++}`,
      nome: corpo.nome.trim(),
      descrizione: corpo.descrizione?.trim() ?? '',
      istruzioni: corpo.istruzioni.trim(),
      fonti,
      formatoOutput: ['testo', 'tabella', 'documento'].includes(corpo.formatoOutput) ? corpo.formatoOutput : 'testo',
      ...(corpo.templateOutputId && trovaTemplate(corpo.templateOutputId) ? { templateOutputId: corpo.templateOutputId } : {}),
      parametri: normalizzaParametri(corpo.parametri) ?? [],
      ...(normalizzaPianificazione(corpo.pianificazione) ? { pianificazione: normalizzaPianificazione(corpo.pianificazione) } : {}),
      attivo: true,
      creatoDa: utenteCorrente(req).id,
      aggiornatoIl: adesso(),
    };
    AGENTI.push(agente);
    inviaJson(res, 201, rispostaAgente(agente, trovaDocumento));
    return true;
  }

  const rotta = percorso.match(
    /^\/api\/agenti\/([^/]+)(?:\/(duplica|esecuzioni)(?:\/([^/]+)(?:\/(documento))?)?)?$/,
  );
  if (!rotta) return false;

  const agente = AGENTI.find((a) => a.id === rotta[1]);
  if (!agente) {
    inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Agente inesistente.' });
    return true;
  }

  // /api/agenti/:id
  if (!rotta[2]) {
    if (req.method === 'GET') {
      inviaJson(res, 200, rispostaAgente(agente, trovaDocumento));
      return true;
    }
    // RF-E-01 (modifica, attiva/disattiva) e RF-E-04 (sospensione)
    if (req.method === 'PATCH') {
      const modifiche = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
      if (modifiche.attivo === true && !agente.attivo && agentiAttivi() >= LIMITI.agentiAttiviMax) {
        inviaJson(res, 409, {
          codice: 'LIMITE_AGENTI',
          messaggio: `Il piano consente ${LIMITI.agentiAttiviMax} agenti attivi: disattivane uno per attivarne un altro.`,
        });
        return true;
      }
      if (typeof modifiche.nome === 'string' && modifiche.nome.trim()) agente.nome = modifiche.nome.trim();
      if (typeof modifiche.descrizione === 'string') agente.descrizione = modifiche.descrizione.trim();
      if (typeof modifiche.istruzioni === 'string' && modifiche.istruzioni.trim()) agente.istruzioni = modifiche.istruzioni.trim();
      const fonti = normalizzaFonti(modifiche.fonti);
      if (fonti?.length) agente.fonti = fonti;
      if (['testo', 'tabella', 'documento'].includes(modifiche.formatoOutput)) agente.formatoOutput = modifiche.formatoOutput;
      if (modifiche.templateOutputId === null) delete agente.templateOutputId;
      else if (modifiche.templateOutputId && trovaTemplate(modifiche.templateOutputId)) agente.templateOutputId = modifiche.templateOutputId;
      const parametri = normalizzaParametri(modifiche.parametri);
      if (parametri) agente.parametri = parametri;
      if (modifiche.pianificazione === null) delete agente.pianificazione;
      else if (normalizzaPianificazione(modifiche.pianificazione)) agente.pianificazione = normalizzaPianificazione(modifiche.pianificazione);
      if (typeof modifiche.attivo === 'boolean') agente.attivo = modifiche.attivo;
      agente.aggiornatoIl = adesso();
      inviaJson(res, 200, rispostaAgente(agente, trovaDocumento));
      return true;
    }
    if (req.method === 'DELETE') {
      AGENTI.splice(AGENTI.indexOf(agente), 1);
      for (let i = ESECUZIONI.length - 1; i >= 0; i--) {
        if (ESECUZIONI[i].agenteId === agente.id) ESECUZIONI.splice(i, 1);
      }
      res.writeHead(204).end();
      return true;
    }
    return false;
  }

  // RF-E-01: la copia nasce disattiva e con la pianificazione sospesa —
  // duplicare non deve mai raddoppiare le esecuzioni pianificate di nascosto.
  if (rotta[2] === 'duplica' && req.method === 'POST') {
    const copia = {
      ...structuredClone(agente),
      id: `agt-${prossimoAgente++}`,
      nome: `Copia di ${agente.nome}`,
      ...(agente.pianificazione ? { pianificazione: { ...agente.pianificazione, sospesa: true } } : {}),
      attivo: false,
      creatoDa: utenteCorrente(req).id,
      aggiornatoIl: adesso(),
    };
    AGENTI.push(copia);
    inviaJson(res, 201, rispostaAgente(copia, trovaDocumento));
    return true;
  }

  if (rotta[2] !== 'esecuzioni') return false;

  // GET /api/agenti/:id/esecuzioni — lo storico (RF-E-06), la più recente in cima
  if (!rotta[3] && req.method === 'GET') {
    const sue = ESECUZIONI.filter((e) => e.agenteId === agente.id).sort((a, b) =>
      b.avviataIl.localeCompare(a.avviataIl),
    );
    inviaJson(res, 200, {
      elementi: sue.map(riepilogoEsecuzione),
      totale: sue.length,
      pagina: 1,
      perPagina: sue.length,
    });
    return true;
  }

  // POST /api/agenti/:id/esecuzioni — esecuzione manuale (RF-E-03/05)
  if (!rotta[3] && req.method === 'POST') {
    if (!agente.attivo) {
      inviaJson(res, 409, {
        codice: 'AGENTE_DISATTIVO',
        messaggio: 'L’agente è disattivato: riattivalo per poterlo eseguire.',
      });
      return true;
    }
    if (esecuzioniInCorso() >= LIMITI.esecuzioniConcorrentiMax) {
      inviaJson(
        res,
        429,
        {
          codice: 'LIMITE_ESECUZIONI',
          messaggio: `Il piano consente ${LIMITI.esecuzioniConcorrentiMax} esecuzioni contemporanee: attendi che una si concluda.`,
          ritentaTraSecondi: 20,
        },
        { 'Retry-After': '20' },
      );
      return true;
    }
    const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    const parametri = {};
    for (const parametro of agente.parametri ?? []) {
      const valore = corpo.parametri?.[parametro.chiave];
      if (valore) {
        if (parametro.tipo === 'documento' && !trovaDocumento(valore)) {
          inviaJson(res, 400, {
            codice: 'PARAMETRO_NON_VALIDO',
            messaggio: `Il documento indicato per «${parametro.etichetta}» non esiste negli archivi.`,
          });
          return true;
        }
        parametri[parametro.chiave] = String(valore);
      } else if (parametro.obbligatorio) {
        inviaJson(res, 400, {
          codice: 'PARAMETRI_MANCANTI',
          messaggio: `Manca il parametro obbligatorio «${parametro.etichetta}».`,
        });
        return true;
      }
    }

    const esecuzione = {
      id: `ese-${prossimaEsecuzione++}`,
      agenteId: agente.id,
      avviataIl: adesso(),
      modalita: 'manuale',
      stato: 'in-coda',
      tentativi: 0,
      ...(Object.keys(parametri).length ? { parametri } : {}),
      citazioni: [],
      log: [{ istante: adesso(), livello: 'info', messaggio: 'Esecuzione accodata.' }],
    };
    ESECUZIONI.push(esecuzione);
    avviaSimulazione(agente, esecuzione, utenteCorrente(req), trovaDocumento);
    inviaJson(res, 201, esecuzione);
    return true;
  }

  const esecuzione = ESECUZIONI.find((e) => e.agenteId === agente.id && e.id === rotta[3]);
  if (!esecuzione) {
    inviaJson(res, 404, { codice: 'NON_TROVATA', messaggio: 'Esecuzione inesistente.' });
    return true;
  }

  // GET /api/agenti/:id/esecuzioni/:eid — l'esito pieno (RF-E-06/07)
  if (!rotta[4] && req.method === 'GET') {
    inviaJson(res, 200, esecuzione);
    return true;
  }

  // GET …/documento — il file generato sul template (RF-E-13)
  if (rotta[4] === 'documento' && req.method === 'GET') {
    if (!esecuzione.documentoGeneratoUrl || !agente.templateOutputId) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Questa esecuzione non ha prodotto un documento.' });
      return true;
    }
    scaricaDocumento(res, agente, esecuzione);
    return true;
  }

  return false;
}
