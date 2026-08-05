/**
 * Impostazioni e personalizzazione: la parte del mock che governa (Modulo D).
 *
 * Quattro domini sotto un modulo solo, perché condividono due cose:
 *
 * 1. **Lo storico** (RF-D-07): ogni mutazione — regola, documento di
 *    riferimento, modello, template — lascia una voce «chi, cosa, quando».
 * 2. **Il permesso**: le scritture sono dell'amministratore. Il mock lo
 *    applica davvero leggendo `X-Assieme-Ruolo`, così il pannello di
 *    sviluppo mostra l'interfaccia com'è per un operatore — e il 403 del
 *    server resta l'ultima linea anche se l'interfaccia sbagliasse.
 *
 * ## I documenti di riferimento hanno due origini, un elenco solo
 *
 * Caricati qui, o promossi dall'Archivio Privato (RF-B-09). L'elenco li
 * fonde: i promossi si idratano dal modulo dell'archivio a ogni lettura
 * (titolo, peso e pagine restano quelli veri), e il governo — ambito,
 * attivazione — vive qui. Eliminare un promosso significa togliergli il
 * ruolo: il documento resta nel suo archivio, intatto (RF-D-14).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  documentiPromossi,
  leggiMultipart,
  rimuoviRuoloRiferimento,
} from './archivio-privato.mjs';
import { generaPdfDaTesto } from './pdf.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const leggi = (nome) => JSON.parse(readFileSync(join(QUI, 'data', nome), 'utf8'));

const MODELLI = leggi('modelli.json');
const REGOLE = leggi('istruzioni.json');
const RIFERIMENTI = leggi('riferimenti.json');
const TEMPLATE = leggi('template.json');
const UTENTI = leggi('utenti.json');
const STORICO = leggi('storico-impostazioni.json');

let modelloAttivoId = 'mod-001';

const IDENTITA = {
  colorePrimario: '#2f4b7c',
  recapiti: 'Assicurazioni Meridiana S.r.l. · Corso Vinzaglio 12, Torino · 011 561 8420 · info@assicurazionimeridiana.it',
  firma: 'Assicurazioni Meridiana S.r.l.',
};

/** Il logo caricato (RF-D-12): byte e tipo, in memoria come tutto il resto. */
let logo;

/* I contatori partono alti per non collidere con gli id delle fixture. */
let prossimaRegola = 100;
let prossimoRiferimento = 100;
let prossimoTemplate = 100;
let prossimoUtente = 100;
let prossimaVoceStorico = 100;

/**
 * L'elenco dei template è condiviso: chat (RF-C-10) e tabelle (RF-C-14)
 * esportano sugli stessi template che questa sezione governa.
 */
export function trovaTemplate(id) {
  return TEMPLATE.find((t) => t.id === id);
}

export function elencoTemplate() {
  return TEMPLATE;
}

// ---------------------------------------------------------------------------
// Sessione e storico
// ---------------------------------------------------------------------------

const utenteCorrente = (req) =>
  req.headers['x-assieme-ruolo'] === 'amministratore'
    ? { id: 'utn-001', nome: 'Marta Ferrero' }
    : { id: 'utn-004', nome: 'Davide Lo Bianco' };

const amministratore = (req) => req.headers['x-assieme-ruolo'] === 'amministratore';

function vietato(res, inviaJson) {
  inviaJson(res, 403, {
    codice: 'PERMESSO_NEGATO',
    messaggio: 'Questa operazione è riservata all’amministratore del tenant.',
  });
  return true;
}

/** RF-D-07: ogni mutazione lascia una voce. La più recente in cima. */
function registra(req, azione, oggetto, descrizione) {
  const utente = utenteCorrente(req);
  STORICO.unshift({
    id: `sto-${prossimaVoceStorico++}`,
    istante: new Date().toISOString(),
    utenteId: utente.id,
    utenteNome: utente.nome,
    azione,
    oggetto,
    descrizione,
  });
  if (STORICO.length > 100) STORICO.length = 100;
}

// ---------------------------------------------------------------------------
// Documenti di riferimento: fusione delle due origini
// ---------------------------------------------------------------------------

/**
 * Governo (ambito, attivazione) dei promossi, per `documentoPrivatoId`.
 * Una promozione nuova dall'archivio compare qui con i valori di partenza:
 * ambito generale, attiva — chi promuove vuole che il documento conti.
 */
function voceGoverno(documentoPrivatoId) {
  let voce = RIFERIMENTI.find((r) => r.documentoPrivatoId === documentoPrivatoId);
  if (!voce) {
    voce = {
      id: `rif-${documentoPrivatoId}`,
      documentoPrivatoId,
      ambito: { tipo: 'generale' },
      attivo: true,
      caricatoDa: 'utn-001',
      aggiornatoIl: new Date().toISOString(),
    };
    RIFERIMENTI.push(voce);
  }
  return voce;
}

/** L'elenco unico, nella forma del contratto (`DocumentoRiferimento`). */
function elencoRiferimenti() {
  const promossi = documentiPromossi().map((documento) => {
    const governo = voceGoverno(documento.id);
    return {
      id: governo.id,
      titolo: documento.titolo,
      documentoPrivatoId: documento.id,
      ambito: governo.ambito,
      attivo: governo.attivo,
      numeroPagine: documento.numeroPagine,
      dimensioneByte: documento.dimensioneByte,
      caricatoDa: governo.caricatoDa,
      aggiornatoIl: governo.aggiornatoIl,
    };
  });
  const promossiIds = new Set(promossi.map((r) => r.documentoPrivatoId));
  const caricati = RIFERIMENTI.filter(
    (r) => !r.documentoPrivatoId || !promossiIds.has(r.documentoPrivatoId),
  ).filter((r) => !r.documentoPrivatoId);
  return [...caricati, ...promossi].sort((a, b) =>
    b.aggiornatoIl.localeCompare(a.aggiornatoIl),
  );
}

// ---------------------------------------------------------------------------
// Instradamento
// ---------------------------------------------------------------------------

/**
 * Gestisce le rotte del Modulo D.
 * Restituisce `true` se ha risposto, `false` se la rotta non è sua.
 */
export async function gestisci(req, res, url, { inviaJson, leggiCorpo }) {
  const percorso = url.pathname;
  const corpoJson = async () => JSON.parse((await leggiCorpo(req)).toString('utf8') || '{}');

  // --- Modello AI (RF-D-02/03) --------------------------------------------

  if (percorso === '/api/modelli' && req.method === 'GET') {
    inviaJson(res, 200, MODELLI);
    return true;
  }

  if (percorso === '/api/modelli/attivo') {
    if (req.method === 'GET') {
      inviaJson(res, 200, MODELLI.find((m) => m.id === modelloAttivoId));
      return true;
    }
    if (req.method === 'PUT') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      const { modelloId } = await corpoJson();
      const modello = MODELLI.find((m) => m.id === modelloId);
      if (!modello) {
        inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Modello inesistente.' });
        return true;
      }
      if (!modello.disponibile) {
        inviaJson(res, 409, {
          codice: 'NON_DISPONIBILE',
          messaggio: `${modello.nome} non è ancora disponibile sulla piattaforma.`,
        });
        return true;
      }
      modelloAttivoId = modello.id;
      registra(req, 'modifica', 'modello', `Scelto il modello ${modello.nome} (${modello.provider})`);
      inviaJson(res, 200, modello);
      return true;
    }
    return false;
  }

  // --- Storico (RF-D-07) --------------------------------------------------

  if (percorso === '/api/impostazioni/storico' && req.method === 'GET') {
    const oggetti = (url.searchParams.get('oggetti') ?? '').split(',').filter(Boolean);
    const voci = oggetti.length ? STORICO.filter((v) => oggetti.includes(v.oggetto)) : STORICO;
    inviaJson(res, 200, voci.slice(0, 50));
    return true;
  }

  // --- Identità visiva (RF-D-12) ------------------------------------------

  if (percorso === '/api/identita-visiva') {
    if (req.method === 'GET') {
      inviaJson(res, 200, { ...IDENTITA, ...(logo ? { logoUrl: '/api/identita-visiva/logo' } : {}) });
      return true;
    }
    if (req.method === 'PUT') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      const corpo = await corpoJson();
      for (const campo of ['colorePrimario', 'recapiti', 'firma']) {
        if (typeof corpo[campo] === 'string') IDENTITA[campo] = corpo[campo];
      }
      registra(req, 'modifica', 'template', 'Aggiornata l’identità visiva dell’agenzia');
      inviaJson(res, 200, { ...IDENTITA, ...(logo ? { logoUrl: '/api/identita-visiva/logo' } : {}) });
      return true;
    }
    return false;
  }

  if (percorso === '/api/identita-visiva/logo') {
    if (req.method === 'GET') {
      if (!logo) {
        inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Nessun logo caricato.' });
        return true;
      }
      res.writeHead(200, {
        'Content-Type': logo.tipo,
        'Content-Length': logo.byte.length,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(logo.byte);
      return true;
    }
    if (req.method === 'PUT') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      /* Il logo è l'unico caso in cui i byte servono davvero: vanno riserviti. */
      const byte = await leggiCorpo(req);
      logo = { byte, tipo: req.headers['content-type'] ?? 'image/png' };
      registra(req, 'modifica', 'template', 'Caricato il logo dell’agenzia');
      inviaJson(res, 200, { logoUrl: '/api/identita-visiva/logo' });
      return true;
    }
    return false;
  }

  // --- Regole (RF-D-04/06) ------------------------------------------------

  if (percorso === '/api/istruzioni/regole') {
    if (req.method === 'GET') {
      inviaJson(res, 200, [...REGOLE].sort((a, b) => b.aggiornataIl.localeCompare(a.aggiornataIl)));
      return true;
    }
    if (req.method === 'POST') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      const corpo = await corpoJson();
      if (!corpo.titolo?.trim() || !corpo.testo?.trim()) {
        inviaJson(res, 400, {
          codice: 'REGOLA_VUOTA',
          messaggio: 'A una regola servono un titolo e un testo.',
        });
        return true;
      }
      const regola = {
        id: `ist-${prossimaRegola++}`,
        titolo: corpo.titolo.trim(),
        testo: corpo.testo.trim(),
        ambito: corpo.ambito ?? { tipo: 'generale' },
        attiva: true,
        creataDa: utenteCorrente(req).id,
        aggiornataIl: new Date().toISOString(),
      };
      REGOLE.push(regola);
      registra(req, 'creazione', 'regola', `Creata la regola «${regola.titolo}»`);
      inviaJson(res, 201, regola);
      return true;
    }
    return false;
  }

  const rottaRegola = percorso.match(/^\/api\/istruzioni\/regole\/([^/]+)$/);
  if (rottaRegola) {
    const regola = REGOLE.find((r) => r.id === rottaRegola[1]);
    if (!regola) {
      inviaJson(res, 404, { codice: 'NON_TROVATA', messaggio: 'Regola inesistente.' });
      return true;
    }
    if (req.method === 'PATCH') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      const modifiche = await corpoJson();
      if (typeof modifiche.attiva === 'boolean' && modifiche.attiva !== regola.attiva) {
        registra(
          req,
          modifiche.attiva ? 'attivazione' : 'disattivazione',
          'regola',
          `${modifiche.attiva ? 'Attivata' : 'Sospesa'} la regola «${regola.titolo}»`,
        );
      } else {
        registra(req, 'modifica', 'regola', `Modificata la regola «${regola.titolo}»`);
      }
      for (const campo of ['titolo', 'testo', 'ambito', 'attiva']) {
        if (campo in modifiche) regola[campo] = modifiche[campo];
      }
      regola.aggiornataIl = new Date().toISOString();
      inviaJson(res, 200, regola);
      return true;
    }
    if (req.method === 'DELETE') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      REGOLE.splice(REGOLE.indexOf(regola), 1);
      registra(req, 'eliminazione', 'regola', `Eliminata la regola «${regola.titolo}»`);
      res.writeHead(204).end();
      return true;
    }
    return false;
  }

  // --- Documenti di riferimento (RF-D-14/15/16) ---------------------------

  if (percorso === '/api/istruzioni/riferimenti') {
    if (req.method === 'GET') {
      inviaJson(res, 200, elencoRiferimenti());
      return true;
    }
    if (req.method === 'POST') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      const corpo = await leggiCorpo(req);
      const file = leggiMultipart(corpo, req.headers['content-type']);
      if (!file.length) {
        inviaJson(res, 400, { codice: 'NESSUN_FILE', messaggio: 'La richiesta non contiene file.' });
        return true;
      }
      const creati = file.map((f) => {
        const riferimento = {
          id: `rif-${prossimoRiferimento++}`,
          titolo: f.nome.replace(/\.[^.]+$/, ''),
          ambito: { tipo: 'generale' },
          attivo: true,
          numeroPagine: 1 + Math.floor(f.dimensione / 70000),
          dimensioneByte: f.dimensione,
          caricatoDa: utenteCorrente(req).id,
          aggiornatoIl: new Date().toISOString(),
        };
        RIFERIMENTI.push(riferimento);
        registra(req, 'creazione', 'documento-riferimento', `Caricato «${riferimento.titolo}»`);
        return riferimento;
      });
      inviaJson(res, 201, { creati });
      return true;
    }
    return false;
  }

  const rottaRiferimento = percorso.match(/^\/api\/istruzioni\/riferimenti\/([^/]+)$/);
  if (rottaRiferimento) {
    const elenco = elencoRiferimenti();
    const composto = elenco.find((r) => r.id === rottaRiferimento[1]);
    const governo = RIFERIMENTI.find((r) => r.id === rottaRiferimento[1]);
    if (!composto || !governo) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Documento di riferimento inesistente.' });
      return true;
    }
    if (req.method === 'PATCH') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      const modifiche = await corpoJson();
      if (typeof modifiche.attivo === 'boolean' && modifiche.attivo !== governo.attivo) {
        registra(
          req,
          modifiche.attivo ? 'attivazione' : 'disattivazione',
          'documento-riferimento',
          `${modifiche.attivo ? 'Attivato' : 'Sospeso'} «${composto.titolo}»`,
        );
      } else {
        registra(req, 'modifica', 'documento-riferimento', `Modificato «${composto.titolo}»`);
      }
      if ('ambito' in modifiche) governo.ambito = modifiche.ambito;
      if (typeof modifiche.attivo === 'boolean') governo.attivo = modifiche.attivo;
      governo.aggiornatoIl = new Date().toISOString();
      const aggiornato = elencoRiferimenti().find((r) => r.id === governo.id);
      inviaJson(res, 200, aggiornato);
      return true;
    }
    if (req.method === 'DELETE') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      if (governo.documentoPrivatoId) rimuoviRuoloRiferimento(governo.documentoPrivatoId);
      RIFERIMENTI.splice(RIFERIMENTI.indexOf(governo), 1);
      registra(
        req,
        'eliminazione',
        'documento-riferimento',
        governo.documentoPrivatoId
          ? `Tolto il ruolo di riferimento a «${composto.titolo}» (resta nell’Archivio Privato)`
          : `Eliminato «${composto.titolo}»`,
      );
      res.writeHead(204).end();
      return true;
    }
    return false;
  }

  // --- Template (RF-D-10…D-13) --------------------------------------------

  if (percorso === '/api/template') {
    if (req.method === 'GET') {
      inviaJson(res, 200, TEMPLATE);
      return true;
    }
    // RF-D-12: template propri del tenant
    if (req.method === 'POST') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      const corpo = await leggiCorpo(req);
      const file = leggiMultipart(corpo, req.headers['content-type']);
      if (!file.length) {
        inviaJson(res, 400, { codice: 'NESSUN_FILE', messaggio: 'La richiesta non contiene file.' });
        return true;
      }
      const creati = [];
      for (const f of file) {
        const formato = f.nome.match(/\.(pdf|docx|xlsx|pptx)$/i)?.[1]?.toLowerCase();
        if (!formato) {
          inviaJson(res, 400, {
            codice: 'FORMATO_NON_AMMESSO',
            messaggio: `«${f.nome}»: i template accettano PDF, DOCX, XLSX o PPTX.`,
          });
          return true;
        }
        const template = {
          id: `tpl-${prossimoTemplate++}`,
          nome: f.nome.replace(/\.[^.]+$/, ''),
          formato,
          descrizione: 'Template caricato dall’agenzia, conforme allo schema dei segnaposto.',
          personalizzato: true,
        };
        TEMPLATE.push(template);
        registra(req, 'creazione', 'template', `Caricato il template «${template.nome}»`);
        creati.push(template);
      }
      inviaJson(res, 201, { creati });
      return true;
    }
    return false;
  }

  const rottaTemplate = percorso.match(/^\/api\/template\/([^/]+)(\/anteprima)?$/);
  if (rottaTemplate) {
    const template = TEMPLATE.find((t) => t.id === rottaTemplate[1]);
    if (!template) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Template inesistente.' });
      return true;
    }

    /* RF-D-11: l'anteprima mostra struttura e segnaposto. Sempre PDF: è
       un'immagine dell'impaginazione, non il file di generazione. */
    if (rottaTemplate[2] === '/anteprima' && req.method === 'GET') {
      const testo = [
        template.descrizione,
        '',
        'Struttura del template:',
        '',
        '{{titolo}} — titolo del documento',
        '{{destinatario}} — cliente o pratica',
        '{{data}} — data di generazione',
        '{{corpo}} — contenuto generato da ASSIEME',
        '{{tabella}} — tabelle comparative, dove previste',
        '',
        `Intestazione e piè di pagina applicano l’identità visiva dell’agenzia:`,
        `colore ${IDENTITA.colorePrimario}, recapiti e firma configurati nelle Impostazioni.`,
      ].join('\n');
      const pdf = generaPdfDaTesto(`Anteprima — ${template.nome}`, testo);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': pdf.length,
        'Content-Disposition': 'inline',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(pdf);
      return true;
    }

    // RF-D-13: template predefinito per tipologia, unico per tipologia
    if (!rottaTemplate[2] && req.method === 'PATCH') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      const { tipologiaPredefinita } = await corpoJson();
      if (tipologiaPredefinita) {
        for (const altro of TEMPLATE) {
          if (altro.tipologiaPredefinita === tipologiaPredefinita) {
            delete altro.tipologiaPredefinita;
          }
        }
        template.tipologiaPredefinita = tipologiaPredefinita;
        registra(req, 'modifica', 'template', `«${template.nome}» è il predefinito per ${tipologiaPredefinita}`);
      } else {
        delete template.tipologiaPredefinita;
        registra(req, 'modifica', 'template', `«${template.nome}» non è più un predefinito`);
      }
      inviaJson(res, 200, TEMPLATE);
      return true;
    }

    if (!rottaTemplate[2] && req.method === 'DELETE') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      if (!template.personalizzato) {
        inviaJson(res, 409, {
          codice: 'PRECARICATO',
          messaggio: 'I template precaricati sono della piattaforma e non si eliminano.',
        });
        return true;
      }
      TEMPLATE.splice(TEMPLATE.indexOf(template), 1);
      registra(req, 'eliminazione', 'template', `Eliminato il template «${template.nome}»`);
      res.writeHead(204).end();
      return true;
    }
    return false;
  }

  // --- Utenti (RF-D-01) ---------------------------------------------------

  if (percorso === '/api/utenti') {
    if (req.method === 'GET') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      inviaJson(res, 200, UTENTI);
      return true;
    }
    if (req.method === 'POST') {
      if (!amministratore(req)) return vietato(res, inviaJson);
      const corpo = await corpoJson();
      if (!corpo.email?.trim() || !corpo.nome?.trim() || !corpo.cognome?.trim()) {
        inviaJson(res, 400, {
          codice: 'DATI_MANCANTI',
          messaggio: 'Servono nome, cognome ed email.',
        });
        return true;
      }
      if (UTENTI.some((u) => u.email.toLowerCase() === corpo.email.trim().toLowerCase())) {
        inviaJson(res, 409, {
          codice: 'EMAIL_ESISTENTE',
          messaggio: 'Un utente con questa email esiste già nel tenant.',
        });
        return true;
      }
      const utente = {
        id: `utn-${prossimoUtente++}`,
        nome: corpo.nome.trim(),
        cognome: corpo.cognome.trim(),
        email: corpo.email.trim(),
        ruolo: corpo.ruolo === 'amministratore' ? 'amministratore' : 'operatore',
        tenantId: 'tnt-001',
        stato: 'invitato',
      };
      UTENTI.push(utente);
      inviaJson(res, 201, utente);
      return true;
    }
    return false;
  }

  const rottaUtente = percorso.match(/^\/api\/utenti\/([^/]+)$/);
  if (rottaUtente && req.method === 'PATCH') {
    if (!amministratore(req)) return vietato(res, inviaJson);
    const utente = UTENTI.find((u) => u.id === rottaUtente[1]);
    if (!utente) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Utente inesistente.' });
      return true;
    }
    /* Su sé stessi né ruolo né sospensione: un amministratore che si
       declassa o si sospende chiude la porta e butta la chiave. */
    if (utente.id === utenteCorrente(req).id) {
      inviaJson(res, 409, {
        codice: 'SE_STESSO',
        messaggio: 'Non puoi modificare il tuo ruolo o il tuo stato: chiedi a un altro amministratore.',
      });
      return true;
    }
    const modifiche = await corpoJson();
    if (modifiche.ruolo === 'operatore' || modifiche.ruolo === 'amministratore') {
      utente.ruolo = modifiche.ruolo;
    }
    if (modifiche.stato === 'attivo' || modifiche.stato === 'sospeso') {
      utente.stato = modifiche.stato;
    }
    inviaJson(res, 200, utente);
    return true;
  }

  return false;
}
