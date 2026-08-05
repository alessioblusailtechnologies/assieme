/**
 * Archivio Privato: la parte del mock che ha uno stato.
 *
 * A differenza dell'Archivio Pubblico, qui si scrive. Le modifiche restano in
 * memoria finché vive il processo — è voluto: una demo in cui ogni azione
 * viene dimenticata al ricaricamento non sembra un'applicazione.
 *
 * Sta in un modulo a sé perché è la prima parte del mock con una macchina a
 * stati e un ciclo di vita, non solo dati che vanno e vengono.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generaPdf } from './pdf.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));

/** RF-B-08: limite di spazio del piano, per progettare lo stato «quota superata». */
export const LIMITE_SPAZIO_BYTE = 5 * 1024 * 1024 * 1024; // 5 GB

/** RF-B-02: oltre questa misura il singolo file viene rifiutato. */
const LIMITE_FILE_BYTE = 20 * 1024 * 1024; // 20 MB

/*
 * Tempi della macchina a stati.
 *
 * Volutamente lenti: RF-B-05 chiede che lo stato di elaborazione sia
 * visibile, e con transizioni istantanee non si progetterebbe mai
 * l'attesa — si scoprirebbe al primo documento vero da cento pagine.
 */
const MS_IN_CODA = 1500;
const MS_ELABORAZIONE = 4000;

const COMPAGNIE = JSON.parse(readFileSync(join(QUI, 'data', 'compagnie.json'), 'utf8'));
const RAMI = JSON.parse(readFileSync(join(QUI, 'data', 'rami.json'), 'utf8'));

const DOCUMENTI = JSON.parse(readFileSync(join(QUI, 'data', 'documenti-privati.json'), 'utf8'));

/**
 * Forma con cui il documento esce dall'API.
 *
 * Compagnia e ramo escono come oggetti completi, non come identificativi:
 * è la stessa forma dei documenti pubblici, e un contratto in cui la stessa
 * entità cambia struttura a seconda dell'archivio costringerebbe il
 * front-end a due strade per mostrare la stessa cosa.
 *
 * Le fixture invece li tengono per riferimento: scriverli per esteso su ogni
 * riga significherebbe ripetere la ragione sociale dieci volte e doverla
 * correggere in dieci punti.
 */
function componi(d) {
  const { compagniaId, ramoId, ...resto } = d;
  return {
    ...resto,
    archivio: 'privato',
    fileUrl: `/api/documenti-privati/${d.id}/file`,
    compagnia: COMPAGNIE.find((c) => c.id === compagniaId),
    ramo: RAMI.find((r) => r.id === ramoId),
  };
}

/** Il documento in elaborazione delle fixture si assesta poco dopo l'avvio. */
for (const d of DOCUMENTI) {
  if (d.stato === 'in-elaborazione') programma(d, MS_ELABORAZIONE);
}

// ---------------------------------------------------------------------------
// Macchina a stati
// ---------------------------------------------------------------------------

/**
 * Fa avanzare un documento nella lavorazione.
 *
 * Gli errori sono **deterministici e ricavati dal nome del file**, non
 * casuali: una demo in cui il fallimento capita a caso non si può mostrare a
 * nessuno, mentre così basta chiamare un file "scansione qualcosa" per far
 * comparire lo stato d'errore quando serve.
 */
function programma(documento, ritardo) {
  setTimeout(() => {
    if (documento.stato === 'in-coda') {
      documento.stato = 'in-elaborazione';
      programma(documento, MS_ELABORAZIONE);
      return;
    }

    const nome = documento.titolo.toLowerCase();

    if (nome.includes('scansione') || nome.includes('scan')) {
      documento.stato = 'errore';
      documento.erroreElaborazione =
        'Il documento è una scansione senza testo riconoscibile: non può essere referenziato in chat finché non ne carichi una versione leggibile.';
      return;
    }

    documento.stato = 'pronto';
    documento.numeroPagine = documento.numeroPagine ?? 1 + Math.floor(documento.dimensioneByte / 70000);
  }, ritardo);
}

// ---------------------------------------------------------------------------
// Classificazione assistita (RF-B-03)
// ---------------------------------------------------------------------------

const INDIZI_TIPOLOGIA = [
  ['preventiv', 'preventivo'],
  ['polizza', 'polizza'],
  ['appendice', 'appendice'],
  ['convenzion', 'convenzione'],
  ['nota tecnica', 'nota-tecnica'],
  ['casistica', 'nota-tecnica'],
];

const INDIZI_COMPAGNIA = [
  ['generali', 'cmp-generali'],
  ['cattolica', 'cmp-cattolica'],
  ['unipol', 'cmp-unipolsai'],
  ['allianz', 'cmp-allianz'],
  ['axa', 'cmp-axa'],
  ['zurich', 'cmp-zurich'],
  ['reale', 'cmp-realemutua'],
  ['groupama', 'cmp-groupama'],
  ['vittoria', 'cmp-vittoria'],
  ['itas', 'cmp-itas'],
];

const INDIZI_RAMO = [
  ['auto', 'ram-auto'],
  ['veicol', 'ram-auto'],
  ['infortun', 'ram-infortuni'],
  ['casa', 'ram-casa'],
  ['abitazion', 'ram-casa'],
  ['salute', 'ram-salute'],
  ['vita', 'ram-vita'],
  ['professional', 'ram-rc-prof'],
  ['tutela', 'ram-tutela'],
  ['viagg', 'ram-viaggi'],
];

const primoIndizio = (testo, indizi) => indizi.find(([ago]) => testo.includes(ago))?.[1];

/**
 * Propone una classificazione leggendo il nome del file.
 *
 * Grossolana di proposito: è un mock, e il punto non è indovinare bene ma
 * costringere l'interfaccia a **mostrare le proposte come provvisorie**. In
 * ambito assicurativo una compagnia sbagliata su un documento è un problema
 * vero, e un campo precompilato che sembra confermato è peggio di un campo
 * vuoto.
 */
function classifica(nomeFile) {
  const t = nomeFile.toLowerCase();
  return {
    tipologia: primoIndizio(t, INDIZI_TIPOLOGIA) ?? 'altro',
    compagniaId: primoIndizio(t, INDIZI_COMPAGNIA),
    ramoId: primoIndizio(t, INDIZI_RAMO),
  };
}

// ---------------------------------------------------------------------------
// Multipart
// ---------------------------------------------------------------------------

/**
 * Estrae nome e dimensione dei file da un corpo multipart/form-data.
 *
 * Il contenuto viene **scartato**: al mock serve sapere che è arrivato un
 * file di un certo nome e peso, non conservarne i byte. Scriverlo su disco
 * significherebbe riempire la macchina di chi prova la demo.
 *
 * Parser minimo, non una libreria: riconosce le sole parti con `filename`,
 * che è tutto ciò che il front-end invia.
 */
function leggiMultipart(corpo, contentType) {
  const confine = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? '');
  if (!confine) return [];

  const separatore = Buffer.from(`--${confine[1] ?? confine[2]}`);
  const file = [];
  let da = corpo.indexOf(separatore);

  while (da !== -1) {
    const inizioParte = da + separatore.length;
    const prossimo = corpo.indexOf(separatore, inizioParte);
    if (prossimo === -1) break;

    const parte = corpo.subarray(inizioParte, prossimo);
    const fineIntestazioni = parte.indexOf('\r\n\r\n');
    if (fineIntestazioni !== -1) {
      const intestazioni = parte.subarray(0, fineIntestazioni).toString('latin1');
      const nome = /filename="([^"]*)"/i.exec(intestazioni);
      if (nome && nome[1]) {
        /* Il contenuto va da dopo le intestazioni fino al \r\n che precede
           il separatore successivo. */
        const lunghezza = parte.length - (fineIntestazioni + 4) - 2;
        file.push({ nome: nome[1], dimensione: Math.max(0, lunghezza) });
      }
    }

    da = prossimo;
  }

  return file;
}

// ---------------------------------------------------------------------------
// Interrogazione
// ---------------------------------------------------------------------------

const spazioUsato = () => DOCUMENTI.reduce((somma, d) => somma + (d.dimensioneByte ?? 0), 0);

function elenco(url, corrispondeTesto) {
  const p = url.searchParams;
  const vero = (n) => p.get(n) === 'true';

  let risultati = DOCUMENTI.filter((d) => {
    if (p.get('tipologia') && d.tipologia !== p.get('tipologia')) return false;
    if (p.get('stato') && d.stato !== p.get('stato')) return false;
    if (p.get('etichetta') && !d.etichette.includes(p.get('etichetta'))) return false;
    if (vero('soloRiferimenti') && !d.documentoDiRiferimento) return false;
    if (p.get('q')) {
      const testo = [d.titolo, d.riferimentoCliente ?? '', ...d.etichette].join(' ');
      if (!corrispondeTesto(testo, p.get('q'))) return false;
    }
    return true;
  });

  /* Il più recente in cima: in un archivio di lavoro si cerca quasi sempre
     ciò che si è caricato da poco. */
  risultati = [...risultati].sort((a, b) => b.caricatoIl.localeCompare(a.caricatoIl));

  const perPagina = Math.min(Math.max(Number(p.get('perPagina')) || 20, 1), 100);
  const pagina = Math.max(Number(p.get('pagina')) || 1, 1);
  const da = (pagina - 1) * perPagina;

  return {
    elementi: risultati.slice(da, da + perPagina).map(componi),
    totale: risultati.length,
    pagina,
    perPagina,
  };
}

/**
 * Ricerca puntuale per la chat: il contesto documentale di una conversazione
 * referenzia anche documenti privati, e la chat deve poterli risolvere e
 * verificarne lo stato di elaborazione senza conoscere questo modulo.
 */
export function trovaDocumento(id) {
  const documento = DOCUMENTI.find((d) => d.id === id);
  return documento ? componi(documento) : undefined;
}

// ---------------------------------------------------------------------------
// Instradamento
// ---------------------------------------------------------------------------

/**
 * Gestisce le rotte dell'Archivio Privato.
 * Restituisce `true` se ha risposto, `false` se la rotta non è sua.
 */
export async function gestisci(req, res, url, { inviaJson, leggiCorpo, corrispondeTesto }) {
  const percorso = url.pathname;
  const base = '/api/documenti-privati';

  if (!percorso.startsWith(base) && percorso !== '/api/etichette' && percorso !== '/api/spazio') {
    return false;
  }

  // RF-B-08: spazio del piano
  if (percorso === '/api/spazio' && req.method === 'GET') {
    inviaJson(res, 200, {
      usatoByte: spazioUsato(),
      limiteByte: LIMITE_SPAZIO_BYTE,
      limiteFileByte: LIMITE_FILE_BYTE,
      numeroDocumenti: DOCUMENTI.length,
    });
    return true;
  }

  // RF-B-04: le etichette esistenti, per il completamento
  if (percorso === '/api/etichette' && req.method === 'GET') {
    const conteggio = new Map();
    for (const d of DOCUMENTI) {
      for (const e of d.etichette) conteggio.set(e, (conteggio.get(e) ?? 0) + 1);
    }
    inviaJson(
      res,
      200,
      [...conteggio.entries()]
        .map(([nome, documenti]) => ({ nome, documenti }))
        .sort((a, b) => b.documenti - a.documenti || a.nome.localeCompare(b.nome, 'it')),
    );
    return true;
  }

  if (percorso === base && req.method === 'GET') {
    inviaJson(res, 200, elenco(url, corrispondeTesto));
    return true;
  }

  // RF-B-02: caricamento singolo e multiplo
  if (percorso === base && req.method === 'POST') {
    const corpo = await leggiCorpo(req);
    const file = leggiMultipart(corpo, req.headers['content-type']);

    if (!file.length) {
      inviaJson(res, 400, {
        codice: 'NESSUN_FILE',
        messaggio: 'La richiesta non contiene file.',
      });
      return true;
    }

    const troppoGrande = file.find((f) => f.dimensione > LIMITE_FILE_BYTE);
    if (troppoGrande) {
      inviaJson(res, 413, {
        codice: 'FILE_TROPPO_GRANDE',
        messaggio: `«${troppoGrande.nome}» supera il limite di ${Math.round(LIMITE_FILE_BYTE / 1024 / 1024)} MB per file.`,
      });
      return true;
    }

    if (spazioUsato() + file.reduce((s, f) => s + f.dimensione, 0) > LIMITE_SPAZIO_BYTE) {
      inviaJson(res, 507, {
        codice: 'SPAZIO_ESAURITO',
        messaggio: 'Lo spazio del piano non basta per questi documenti.',
      });
      return true;
    }

    const creati = file.map((f, i) => {
      const documento = {
        id: `doc-priv-${String(Date.now()).slice(-6)}-${i}`,
        /* Il nome del file senza estensione diventa il titolo: è quasi
           sempre quello che l'utente si aspetta di leggere in elenco. */
        titolo: f.nome.replace(/\.[^.]+$/, ''),
        stato: 'in-coda',
        dimensioneByte: f.dimensione,
        caricatoDa: 'utn-001',
        caricatoIl: new Date().toISOString(),
        etichette: [],
        documentoDiRiferimento: false,
        visibilita: 'tenant',
        /* RF-B-03: finché è vero, l'interfaccia mostra la classificazione
           come proposta da controllare invece che come dato acquisito. */
        classificazioneDaConfermare: true,
        ...classifica(f.nome),
      };
      DOCUMENTI.unshift(documento);
      programma(documento, MS_IN_CODA);
      return documento;
    });

    inviaJson(res, 201, { creati: creati.map(componi) });
    return true;
  }

  const conId = percorso.match(/^\/api\/documenti-privati\/([^/]+)(\/riferimento|\/file)?$/);
  if (!conId) return false;

  const documento = DOCUMENTI.find((d) => d.id === conId[1]);
  if (!documento) {
    inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Documento inesistente.' });
    return true;
  }

  /* Il file del documento, come nell'Archivio Pubblico: un PDF generato con
     le pagine dichiarate. I documenti non ancora elaborati un'anteprima non
     ce l'hanno, ed è giusto che il visualizzatore lo scopra. */
  if (conId[2] === '/file') {
    if (req.method !== 'GET') return false;
    if (documento.stato !== 'pronto') {
      inviaJson(res, 409, {
        codice: 'NON_PRONTO',
        messaggio: "L'anteprima è disponibile solo a elaborazione conclusa.",
      });
      return true;
    }
    const pdf = generaPdf(documento.titolo, documento.numeroPagine);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': pdf.length,
      'Content-Disposition': 'inline',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(pdf);
    return true;
  }

  // RF-B-09: promozione a documento di riferimento, senza ricaricare
  if (conId[2]) {
    if (req.method === 'PUT' || req.method === 'DELETE') {
      if (req.method === 'PUT' && documento.stato !== 'pronto') {
        inviaJson(res, 409, {
          codice: 'NON_PRONTO',
          messaggio:
            "Il documento non è ancora elaborato: non può diventare contesto permanente finché l'AI non riesce a leggerlo.",
        });
        return true;
      }
      documento.documentoDiRiferimento = req.method === 'PUT';
      inviaJson(res, 200, componi(documento));
      return true;
    }
    return false;
  }

  if (req.method === 'GET') {
    inviaJson(res, 200, componi(documento));
    return true;
  }

  // RF-B-03, RF-B-04: rinomina, metadati, etichette
  if (req.method === 'PATCH') {
    const modifiche = JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');
    for (const campo of [
      'titolo',
      'tipologia',
      'compagniaId',
      'ramoId',
      'riferimentoCliente',
      'etichette',
    ]) {
      if (campo in modifiche) documento[campo] = modifiche[campo];
    }
    /* Toccare i metadati vale come conferma: se l'utente li ha guardati e
       corretti, la proposta ha smesso di essere tale. */
    documento.classificazioneDaConfermare = false;
    inviaJson(res, 200, componi(documento));
    return true;
  }

  if (req.method === 'DELETE') {
    DOCUMENTI.splice(DOCUMENTI.indexOf(documento), 1);
    res.writeHead(204).end();
    return true;
  }

  return false;
}
