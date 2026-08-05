/**
 * Tabelle di analisi: la parte del mock che estrae (RF-C-11…C-15).
 *
 * Come l'Archivio Privato ha la macchina a stati dell'elaborazione, qui c'è
 * la **generazione progressiva**: una tabella nasce con tutte le celle in
 * attesa e un timer le riempie una alla volta, nell'ordine di lettura. Il
 * front-end la interroga a intervalli finché `stato === 'in-generazione'` —
 * lo stesso schema del polling dell'elaborazione documenti.
 *
 * ## Le celle sono deterministiche, non casuali
 *
 * Come gli scenari della chat: una demo in cui i valori cambiano a ogni
 * generazione non si può mostrare a nessuno. Due fonti, in quest'ordine:
 *
 * 1. **Il caso pilota** (§5.3 dell'analisi): per i documenti del confronto
 *    Generali AUTOPIÙ / preventivo UnipolSai i valori sono quelli veri dello
 *    scenario, con le stesse citazioni della chat.
 * 2. **Tutto il resto**: valori plausibili scelti con un hash stabile di
 *    documento + colonna, così la stessa cella esce sempre uguale. Il "non
 *    presente" e il "non determinabile" compaiono con regole fisse — un DIP
 *    sintetico non elenca le esclusioni, un criterio personalizzato può non
 *    trovare riscontro — perché l'interfaccia deve mostrarli davvero.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generaDocx, generaXlsx } from './ufficio.mjs';
import { generaPdfDaTesto } from './pdf.mjs';
import { trovaTemplate } from './impostazioni.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const leggi = (nome) => JSON.parse(readFileSync(join(QUI, 'data', nome), 'utf8'));

const TABELLE = leggi('tabelle.json');
const CRITERI = leggi('criteri-tabella.json');
const RAMI = leggi('rami.json');

/**
 * Ritmo di generazione. Volutamente lento: la tabella deve popolarsi sotto
 * gli occhi, perché è così che si comporterà il backend vero — l'estrazione
 * di una cella è un'interrogazione al modello, non una lettura da database.
 */
const MS_PER_CELLA = 900;

/* I contatori partono alti per non collidere con gli id delle fixture. */
let prossimaTabella = 100;
let prossimaColonna = 1000;
let prossimaCitazione = 500;

/**
 * L'utente corrente, dallo stesso header con cui il pannello di sviluppo
 * sceglie il ruolo: serve per l'`autoreId` — una tabella condivisa da un
 * collega si apre in sola lettura, e la distinzione parte da qui (RF-C-15).
 */
const utenteCorrente = (req) =>
  req.headers['x-assieme-ruolo'] === 'amministratore' ? 'utn-001' : 'utn-004';

// ---------------------------------------------------------------------------
// Generazione progressiva
// ---------------------------------------------------------------------------

/** Hash stabile: la stessa cella produce sempre lo stesso contenuto. */
function hash(testo) {
  let h = 0;
  for (const c of testo) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * La famiglia di un criterio: guida sia i valori plausibili sia le citazioni
 * del caso pilota. Si riconosce dalle parole, perché le colonne
 * personalizzate arrivano in linguaggio naturale (RF-C-11).
 */
function famigliaCriterio(colonna) {
  const t = (colonna.criterio ?? colonna.intestazione).toLowerCase();
  if (t.includes('massimale rc') || (t.includes('massimal') && t.includes('responsabilit'))) return 'massimale-rc';
  if (t.includes('furto') && (t.includes('franchig') || t.includes('incendio'))) return 'franchigia-furto';
  if (t.includes('infortun') && t.includes('conducente')) return 'infortuni-conducente';
  if (t.includes('assistenza')) return 'assistenza';
  if (t.includes('cristall')) return 'cristalli';
  if (t.includes('grandine') || t.includes('event')) return 'eventi';
  if (t.includes('esclusion')) return 'esclusioni';
  if (t.includes('scopert')) return 'scoperti';
  if (t.includes('franchig')) return 'franchigie';
  if (t.includes('massimal')) return 'massimali';
  if (t.includes('garanz')) return 'garanzie';
  return 'generico';
}

/**
 * Il caso pilota, con gli stessi numeri e le stesse posizioni degli scenari
 * della chat (`chat.mjs`): se la tabella e la conversazione dicono cose
 * diverse sugli stessi documenti, la demo perde credibilità in dieci secondi.
 */
const CASO_PILOTA = {
  'doc-pub-003': {
    'massimale-rc': {
      valore: '6.450.000 € per sinistro, di cui 1.300.000 € per danni a cose',
      posizione: { pagina: 14, articolo: '12', sezione: 'Responsabilità civile' },
      estratto: 'Il massimale per sinistro è pari a euro 6.450.000, di cui euro 1.300.000 per danni a cose.',
    },
    'franchigia-furto': {
      valore: 'Franchigia fissa di 250 € per sinistro',
      posizione: { pagina: 41, articolo: '27', sezione: 'Furto e incendio' },
      estratto: 'La garanzia è prestata con applicazione di una franchigia fissa di euro 250 per ciascun sinistro.',
    },
    'infortuni-conducente': {
      valore: 'Inclusa — massimale 100.000 €',
      posizione: { pagina: 52, articolo: '35', sezione: 'Infortuni del conducente' },
      estratto: 'La garanzia infortuni del conducente è prestata con un massimale di euro 100.000 per persona.',
    },
    assistenza: {
      valore: 'Traino fino a 50 km dal luogo del fermo',
      posizione: { pagina: 78, sezione: 'Assistenza stradale' },
      estratto: 'Il traino del veicolo è garantito fino a 50 km dal luogo del fermo.',
    },
    eventi: {
      nonPresente: 'Nei documenti referenziati non compare una garanzia per gli eventi atmosferici.',
    },
  },
  'doc-priv-001': {
    'massimale-rc': {
      valore: '6.450.000 € per sinistro, di cui 1.300.000 € per danni a cose',
      posizione: { pagina: 2, sezione: 'Responsabilità civile' },
      estratto: 'Massimale unico per sinistro euro 6.450.000, di cui euro 1.300.000 per danni a cose.',
    },
    'franchigia-furto': {
      valore: 'Scoperto 10% con minimo di 500 € per sinistro',
      posizione: { pagina: 3, sezione: 'Garanzie accessorie' },
      estratto: 'Furto e Incendio: scoperto 10% con il minimo di euro 500 per ciascun sinistro.',
    },
    'infortuni-conducente': {
      nonPresente: 'La garanzia non compare nel preventivo né nelle condizioni da esso richiamate.',
    },
    assistenza: {
      valore: 'Traino illimitato, veicolo sostitutivo fino a 7 giorni',
      posizione: { pagina: 3, sezione: 'Assistenza stradale' },
      estratto: 'Assistenza stradale con traino senza limiti di distanza e veicolo sostitutivo fino a 7 giorni.',
    },
  },
};

/** Valori plausibili per famiglia; l'hash sceglie, e sceglie sempre uguale. */
const VALORI = {
  'massimale-rc': ['6.450.000 € per sinistro', '7.500.000 € per sinistro', '10.000.000 € per sinistro'],
  'franchigia-furto': ['Franchigia fissa di 250 €', 'Scoperto 10% con minimo di 500 €', 'Franchigia fissa di 400 €'],
  'infortuni-conducente': ['Inclusa — massimale 100.000 €', 'Inclusa — massimale 150.000 €', 'Opzionale, con sovrappremio'],
  assistenza: ['Traino fino a 50 km', 'Traino illimitato', 'Traino fino a 100 km e veicolo sostitutivo'],
  cristalli: ['Massimale 1.000 €, franchigia 100 €', 'Massimale 1.500 €, senza franchigia', 'Massimale 800 €, franchigia 150 €'],
  eventi: ['Inclusa, scoperto 10%', 'Inclusa, franchigia 500 €', 'Opzionale, con sovrappremio'],
  esclusioni: ['Dolo, guida in stato di ebbrezza, uso improprio del veicolo', 'Atti dolosi, terremoto, usura', 'Dolo e colpa grave del contraente'],
  scoperti: ['10% con minimo di 500 €', '15% con minimo di 300 €', 'Nessuno scoperto sulle garanzie base'],
  franchigie: ['250 € per sinistro', '400 € per sinistro', 'Nessuna franchigia sulle garanzie base'],
  massimali: ['500.000 € per sinistro', '1.000.000 € per sinistro', '1.500.000 € per sinistro'],
  garanzie: ['Base più furto, incendio e assistenza', 'Formulazione base con eventi naturali', 'Tutti i rischi con esclusioni nominate'],
  generico: ['Previsto, nei limiti delle condizioni', 'Previsto con limitazioni', 'Regolato dalle condizioni generali'],
};

const SEZIONI = {
  'massimale-rc': 'Responsabilità civile',
  'franchigia-furto': 'Furto e incendio',
  'infortuni-conducente': 'Infortuni del conducente',
  assistenza: 'Assistenza',
  cristalli: 'Cristalli',
  eventi: 'Eventi naturali',
  esclusioni: 'Esclusioni',
  scoperti: 'Franchigie e scoperti',
  franchigie: 'Franchigie e scoperti',
  massimali: 'Somme assicurate',
  garanzie: 'Oggetto dell’assicurazione',
  generico: 'Condizioni generali',
};

function citazione(documento, posizione, estratto) {
  return {
    id: `cit-${prossimaCitazione++}`,
    documentoId: documento.id,
    documentoTitolo: documento.titolo,
    archivio: documento.archivio,
    posizione,
    estratto,
  };
}

/**
 * Il contenuto di una cella per un documento e una colonna.
 * Restituisce sempre `{ stato: 'pronta', … }` nel contratto `CellaTabella`.
 */
function generaCella(documento, colonna) {
  if (!documento) {
    return {
      stato: 'pronta',
      esito: 'non-determinabile',
      motivo: 'Il documento non è più disponibile negli archivi.',
    };
  }

  const famiglia = famigliaCriterio(colonna);
  const pilota = CASO_PILOTA[documento.id]?.[famiglia];
  if (pilota) {
    if (pilota.nonPresente) {
      return { stato: 'pronta', esito: 'non-presente', nota: pilota.nonPresente };
    }
    return {
      stato: 'pronta',
      esito: 'presente',
      valore: pilota.valore,
      citazioni: [citazione(documento, { ...pilota.posizione }, pilota.estratto)],
    };
  }

  const h = hash(`${documento.id}·${colonna.criterio ?? colonna.intestazione}`);

  /* Un DIP è un documento sintetico: le esclusioni stanno nelle Condizioni.
     È la regola fissa con cui il "non presente" entra in scena (RF-C-12). */
  if (famiglia === 'esclusioni' && documento.tipologia === 'dip') {
    return {
      stato: 'pronta',
      esito: 'non-presente',
      nota: 'Il DIP sintetico non elenca le esclusioni: sono nelle Condizioni di Assicurazione.',
    };
  }
  if (colonna.origine === 'personalizzata' && h % 9 === 0) {
    return {
      stato: 'pronta',
      esito: 'non-determinabile',
      motivo: 'Il criterio non trova un riscontro univoco nel documento: riformularlo in termini più specifici può aiutare.',
    };
  }
  if (h % 8 === 0) {
    return {
      stato: 'pronta',
      esito: 'non-presente',
      nota: 'Il documento non tratta questo aspetto.',
    };
  }

  const valori = VALORI[famiglia];
  const valore = valori[h % valori.length];
  const pagine = documento.numeroPagine ?? 8;
  const posizione = {
    pagina: Math.min(pagine, 2 + (h % Math.max(1, pagine - 2))),
    sezione: SEZIONI[famiglia],
    evidenzia: { x: 0.09, y: 0.18 + (h % 5) * 0.13, larghezza: 0.82, altezza: 0.07 },
  };
  return {
    stato: 'pronta',
    esito: 'presente',
    valore,
    citazioni: [citazione(documento, posizione, `${SEZIONI[famiglia]}: ${valore.toLowerCase()}.`)],
  };
}

/** Le tabelle con un timer di generazione già acceso. */
const inGenerazione = new Set();

/**
 * Accende (o lascia acceso) il timer che riempie le celle in attesa, una
 * alla volta e in ordine di lettura. Righe e colonne possono cambiare a
 * generazione in corso — il timer rilegge la tabella a ogni battito, quindi
 * una colonna aggiunta entra in coda e una riga tolta smette di esistere.
 */
function avviaGenerazione(tabella, trovaDocumento) {
  if (inGenerazione.has(tabella.id)) return;

  tabella.stato = 'in-generazione';
  inGenerazione.add(tabella.id);

  const timer = setInterval(() => {
    const posto = (() => {
      for (const riga of tabella.righe) {
        for (const colonna of tabella.colonne) {
          if (riga.celle[colonna.id]?.stato === 'in-attesa') return { riga, colonna };
        }
      }
      return undefined;
    })();

    if (!posto) {
      clearInterval(timer);
      inGenerazione.delete(tabella.id);
      tabella.stato = 'completa';
      tabella.aggiornataIl = new Date().toISOString();
      return;
    }

    posto.riga.celle[posto.colonna.id] = generaCella(
      trovaDocumento(posto.riga.documentoId),
      posto.colonna,
    );
    tabella.aggiornataIl = new Date().toISOString();
  }, MS_PER_CELLA);
}

// ---------------------------------------------------------------------------
// Costruzione
// ---------------------------------------------------------------------------

const riepilogo = (t) => ({
  id: t.id,
  titolo: t.titolo,
  creataIl: t.creataIl,
  aggiornataIl: t.aggiornataIl,
  autoreId: t.autoreId,
  condivisa: t.condivisa,
  stato: t.stato,
  numeroDocumenti: t.righe.length,
  numeroColonne: t.colonne.length,
});

/** Etichetta di riga già pronta, come la vuole il contratto (`RigaTabella`). */
function etichettaRiga(documento) {
  if (documento.archivio === 'pubblico') {
    const base = `${documento.compagnia.nome} — ${documento.prodotto}`;
    return documento.edizione.corrente ? base : `${base} (${documento.edizione.etichetta})`;
  }
  return documento.titolo;
}

/**
 * Risolve i documenti richiesti e risponde con l'errore giusto se qualcosa
 * non va. Restituisce `undefined` dopo aver già risposto.
 */
function risolviDocumenti(documentiIds, { trovaDocumento, inviaJson }, res) {
  const documenti = [];
  for (const id of documentiIds) {
    const documento = trovaDocumento(id);
    if (!documento) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: `Documento «${id}» inesistente.` });
      return undefined;
    }
    if (documento.archivio === 'privato' && documento.stato !== 'pronto') {
      inviaJson(res, 409, {
        codice: 'NON_PRONTO',
        messaggio: `«${documento.titolo}» non è ancora elaborato: non può entrare in una tabella finché non è pronto.`,
      });
      return undefined;
    }
    documenti.push(documento);
  }
  return documenti;
}

function nuovaRiga(documento, colonne) {
  const celle = {};
  for (const colonna of colonne) celle[colonna.id] = { stato: 'in-attesa' };
  return {
    documentoId: documento.id,
    archivio: documento.archivio,
    etichetta: etichettaRiga(documento),
    celle,
  };
}

/** Titolo predefinito: dal ramo se è uno solo, altrimenti dalla data. */
function titoloPredefinito(documenti) {
  const ramiIds = new Set(documenti.map((d) => d.ramo?.id).filter(Boolean));
  if (ramiIds.size === 1) {
    const ramo = RAMI.find((r) => r.id === [...ramiIds][0]);
    if (ramo) return `Confronto ${ramo.nome}`;
  }
  const data = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  return `Tabella di analisi del ${data}`;
}

// ---------------------------------------------------------------------------
// Esportazione (RF-C-14)
// ---------------------------------------------------------------------------

function testoCella(cella) {
  if (!cella || cella.stato === 'in-attesa') return '—';
  switch (cella.esito) {
    case 'presente':
      return cella.valore;
    case 'non-presente':
      return 'Non presente';
    default:
      return 'Non determinabile';
  }
}

function fontiTabella(tabella) {
  const fonti = [];
  for (const riga of tabella.righe) {
    for (const colonna of tabella.colonne) {
      const cella = riga.celle[colonna.id];
      if (cella?.stato !== 'pronta' || cella.esito !== 'presente') continue;
      for (const c of cella.citazioni) {
        const posizione = [
          c.posizione.articolo ? `art. ${c.posizione.articolo}` : c.posizione.sezione,
          `p. ${c.posizione.pagina}`,
        ]
          .filter(Boolean)
          .join(', ');
        fonti.push(`${riga.etichetta} · ${colonna.intestazione}: ${c.documentoTitolo} — ${posizione}`);
      }
    }
  }
  return fonti;
}

function esportaTabella(res, tabella, template) {
  const intestazioni = ['Documento', ...tabella.colonne.map((c) => c.intestazione)];
  const righe = tabella.righe.map((riga) => [
    riga.etichetta,
    ...tabella.colonne.map((colonna) => testoCella(riga.celle[colonna.id])),
  ]);
  const fonti = fontiTabella(tabella);

  let file;
  let mime;
  switch (template.formato) {
    case 'xlsx':
      file = generaXlsx([intestazioni, ...righe, [''], ['Fonti'], ...fonti.map((f) => [f])]);
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      break;
    case 'docx': {
      const corpo = righe
        .map((r) => r.map((v, i) => `${intestazioni[i]}: ${v}`).join('\n'))
        .join('\n\n');
      file = generaDocx(tabella.titolo, corpo, fonti);
      mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      break;
    }
    default: {
      const corpo = righe
        .map((r) => r.map((v, i) => `${intestazioni[i]}: ${v}`).join('\n'))
        .join('\n\n');
      file = generaPdfDaTesto(tabella.titolo, `${corpo}\n\nFonti:\n\n${fonti.join('\n\n')}`);
      mime = 'application/pdf';
    }
  }

  const nomeFile = `${tabella.titolo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${template.formato}`;
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': file.length,
    'Content-Disposition': `attachment; filename="${nomeFile}"`,
    'Access-Control-Allow-Origin': '*',
  });
  res.end(file);
}

// ---------------------------------------------------------------------------
// Instradamento
// ---------------------------------------------------------------------------

/**
 * Gestisce le rotte delle tabelle di analisi.
 * Restituisce `true` se ha risposto, `false` se la rotta non è sua.
 */
export async function gestisci(req, res, url, deps) {
  const { inviaJson, leggiCorpo, trovaDocumento } = deps;
  const percorso = url.pathname;

  if (!percorso.startsWith('/api/tabelle')) return false;

  // GET /api/tabelle — la più recente in cima, come lo storico della chat
  if (percorso === '/api/tabelle' && req.method === 'GET') {
    const ordinate = [...TABELLE].sort((a, b) => b.aggiornataIl.localeCompare(a.aggiornataIl));
    inviaJson(res, 200, {
      elementi: ordinate.map(riepilogo),
      totale: ordinate.length,
      pagina: 1,
      perPagina: ordinate.length,
    });
    return true;
  }

  /* RF-C-11: i criteri predefiniti pertinenti ai documenti scelti. Va
     riconosciuta prima di `/:id`, o «criteri» verrebbe letto come id. */
  if (percorso === '/api/tabelle/criteri' && req.method === 'GET') {
    const documentiIds = (url.searchParams.get('documenti') ?? '').split(',').filter(Boolean);
    const rami = new Set(
      documentiIds.map((id) => trovaDocumento(id)?.ramo?.id).filter(Boolean),
    );
    inviaJson(
      res,
      200,
      CRITERI.filter((c) => !c.ramoId || rami.has(c.ramoId)),
    );
    return true;
  }

  // POST /api/tabelle — la tabella nasce con le celle in attesa (RF-C-11)
  if (percorso === '/api/tabelle' && req.method === 'POST') {
    const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    const documentiIds = [...new Set(corpo.documentiIds ?? [])];
    if (!documentiIds.length || !corpo.colonne?.length) {
      inviaJson(res, 400, {
        codice: 'TABELLA_VUOTA',
        messaggio: 'Servono almeno un documento e una colonna.',
      });
      return true;
    }
    const documenti = risolviDocumenti(documentiIds, deps, res);
    if (!documenti) return true;

    const adesso = new Date().toISOString();
    const colonne = corpo.colonne.map((c) => ({
      id: `col-${prossimaColonna++}`,
      intestazione: c.intestazione,
      origine: c.origine,
      ...(c.criterio ? { criterio: c.criterio } : {}),
    }));
    const tabella = {
      id: `tab-${prossimaTabella++}`,
      titolo: corpo.titolo?.trim() || titoloPredefinito(documenti),
      creataIl: adesso,
      aggiornataIl: adesso,
      autoreId: utenteCorrente(req),
      condivisa: false,
      stato: 'in-generazione',
      colonne,
      righe: documenti.map((d) => nuovaRiga(d, colonne)),
    };
    TABELLE.push(tabella);
    avviaGenerazione(tabella, trovaDocumento);
    inviaJson(res, 201, tabella);
    return true;
  }

  const rotta = percorso.match(
    /^\/api\/tabelle\/([^/]+)(?:\/(duplica|documenti|colonne|esporta)(?:\/([^/]+))?)?$/,
  );
  if (!rotta) return false;

  const tabella = TABELLE.find((t) => t.id === rotta[1]);
  if (!tabella) {
    inviaJson(res, 404, { codice: 'NON_TROVATA', messaggio: 'Tabella inesistente.' });
    return true;
  }

  // /api/tabelle/:id
  if (!rotta[2]) {
    if (req.method === 'GET') {
      inviaJson(res, 200, tabella);
      return true;
    }
    // RF-C-14 (rinomina) e RF-C-15 (condivisione)
    if (req.method === 'PATCH') {
      const modifiche = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
      if (typeof modifiche.titolo === 'string' && modifiche.titolo.trim()) {
        tabella.titolo = modifiche.titolo.trim();
      }
      if (typeof modifiche.condivisa === 'boolean') tabella.condivisa = modifiche.condivisa;
      tabella.aggiornataIl = new Date().toISOString();
      inviaJson(res, 200, tabella);
      return true;
    }
    if (req.method === 'DELETE') {
      TABELLE.splice(TABELLE.indexOf(tabella), 1);
      res.writeHead(204).end();
      return true;
    }
    return false;
  }

  // RF-C-15: la copia con cui si prosegue in autonomia una tabella condivisa
  if (rotta[2] === 'duplica' && req.method === 'POST') {
    const adesso = new Date().toISOString();
    const copia = {
      ...structuredClone(tabella),
      id: `tab-${prossimaTabella++}`,
      titolo: `Copia di ${tabella.titolo}`,
      creataIl: adesso,
      aggiornataIl: adesso,
      autoreId: utenteCorrente(req),
      condivisa: false,
    };
    TABELLE.push(copia);
    /* Se l'originale era ancora in generazione, la copia riparte da dove era. */
    if (copia.stato === 'in-generazione') avviaGenerazione(copia, trovaDocumento);
    inviaJson(res, 201, copia);
    return true;
  }

  // RF-C-14: aggiunta e rimozione di documenti (righe)
  if (rotta[2] === 'documenti') {
    if (req.method === 'POST' && !rotta[3]) {
      const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
      const esistenti = new Set(tabella.righe.map((r) => r.documentoId));
      const nuovi = [...new Set(corpo.documentiIds ?? [])].filter((id) => !esistenti.has(id));
      const documenti = risolviDocumenti(nuovi, deps, res);
      if (!documenti) return true;

      for (const documento of documenti) {
        tabella.righe.push(nuovaRiga(documento, tabella.colonne));
      }
      if (documenti.length) {
        tabella.aggiornataIl = new Date().toISOString();
        avviaGenerazione(tabella, trovaDocumento);
      }
      inviaJson(res, 200, tabella);
      return true;
    }
    if (req.method === 'DELETE' && rotta[3]) {
      const indice = tabella.righe.findIndex((r) => r.documentoId === rotta[3]);
      if (indice !== -1) tabella.righe.splice(indice, 1);
      tabella.aggiornataIl = new Date().toISOString();
      inviaJson(res, 200, tabella);
      return true;
    }
    return false;
  }

  // RF-C-14: aggiunta e rimozione di colonne (criteri)
  if (rotta[2] === 'colonne') {
    if (req.method === 'POST' && !rotta[3]) {
      const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
      if (!corpo.intestazione?.trim()) {
        inviaJson(res, 400, { codice: 'COLONNA_VUOTA', messaggio: 'Alla colonna manca il criterio.' });
        return true;
      }
      const colonna = {
        id: `col-${prossimaColonna++}`,
        intestazione: corpo.intestazione.trim(),
        origine: corpo.origine === 'predefinita' ? 'predefinita' : 'personalizzata',
        ...(corpo.criterio?.trim() ? { criterio: corpo.criterio.trim() } : {}),
      };
      tabella.colonne.push(colonna);
      for (const riga of tabella.righe) riga.celle[colonna.id] = { stato: 'in-attesa' };
      tabella.aggiornataIl = new Date().toISOString();
      if (tabella.righe.length) avviaGenerazione(tabella, trovaDocumento);
      inviaJson(res, 200, tabella);
      return true;
    }
    if (req.method === 'DELETE' && rotta[3]) {
      const indice = tabella.colonne.findIndex((c) => c.id === rotta[3]);
      if (indice !== -1) {
        tabella.colonne.splice(indice, 1);
        for (const riga of tabella.righe) delete riga.celle[rotta[3]];
      }
      tabella.aggiornataIl = new Date().toISOString();
      inviaJson(res, 200, tabella);
      return true;
    }
    return false;
  }

  // RF-C-14: esportazione su template di output, XLSX in particolare
  if (rotta[2] === 'esporta' && req.method === 'POST') {
    const corpo = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    const template = trovaTemplate(corpo.templateId);
    if (!template) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Template inesistente.' });
      return true;
    }
    esportaTabella(res, tabella, template);
    return true;
  }

  return false;
}
