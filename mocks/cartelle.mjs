/**
 * Cartelle, clienti e convenzione dell'Archivio Privato (Fase 10) nel mock.
 *
 * Serve alla demo self-contained, che non conosce il backend: senza queste
 * rotte l'albero sarebbe vuoto e la schermata racconterebbe una bugia sul
 * prodotto. Lo stato vive in memoria come il resto dell'archivio privato.
 *
 * Il mock non simula l'osservazione (quella guarda i documenti veri e fa una
 * chiamata al modello): la convenzione qui è scritta a mano, ed è la stessa
 * frase che il sistema produrrebbe su questo albero. È una finzione
 * dichiarata, non un'approssimazione nascosta.
 */

/** L'albero della demo: un'agenzia che archivia per cliente, poi per ramo. */
const CARTELLE = [
  { id: 'car-001', parentId: null, nome: 'Clienti', ruoloFigli: 'clienti', descrizione: null },
  { id: 'car-002', parentId: 'car-001', nome: 'Rossi Mario', ruoloFigli: 'rami', clienteId: 'cli-001' },
  { id: 'car-003', parentId: 'car-002', nome: 'Auto', ruoloFigli: 'tipologie' },
  { id: 'car-004', parentId: 'car-003', nome: 'Preventivi' },
  { id: 'car-005', parentId: 'car-003', nome: 'Polizze' },
  { id: 'car-006', parentId: 'car-001', nome: 'Bianchi Anna', ruoloFigli: 'rami', clienteId: 'cli-002' },
  {
    id: 'car-010',
    parentId: null,
    nome: 'Utils',
    descrizione: 'moduli in bianco, listini e tabelle di conversione',
    descrizioneDaUtente: true,
  },
  { id: 'car-011', parentId: null, nome: 'Circolari', descrizione: 'comunicazioni delle compagnie e aggiornamenti normativi' },
];

const CLIENTI = [
  { id: 'cli-001', nome: 'Rossi Mario', tipo: 'persona', alias: ['ROSSI M.'] },
  { id: 'cli-002', nome: 'Bianchi Anna', tipo: 'persona', alias: [] },
  { id: 'cli-003', nome: 'Bar da Mario S.r.l.', tipo: 'azienda', alias: ['Bar da Mario'] },
];

const CONVENZIONE = {
  testo:
    "# Come è organizzato l'Archivio Privato\n\n" +
    "Questo è l'albero dell'agenzia, con il significato dei livelli. I nomi delle singole cartelle di un livello etichettato **non sono elencati**: per trovarli usa `Glob`.\n\n" +
    '- `Clienti/`\n' +
    '  - i figli sono **clienti** (2 cartelle, non elencate qui)\n' +
    '    - dentro ogni cliente → **rami**\n' +
    '      - dentro ogni ramo → **tipologie**\n' +
    '- `Utils/` — moduli in bianco, listini e tabelle di conversione\n' +
    '- `Circolari/` — comunicazioni delle compagnie e aggiornamenti normativi\n\n' +
    'I documenti che non è stato possibile collocare stanno in `Da sistemare/`: ci sono, si leggono e si citano come tutti gli altri.\n',
  testoUtente: null,
  calcolataIl: '2026-09-01T18:00:00+02:00',
  daRicalcolare: false,
};

let progressivo = 100;

function percorsoDi(id) {
  const parti = [];
  let corrente = id;
  const visti = new Set();
  while (corrente && !visti.has(corrente)) {
    visti.add(corrente);
    const c = CARTELLE.find((x) => x.id === corrente);
    if (!c) break;
    parti.unshift(c.nome);
    corrente = c.parentId;
  }
  return parti.join('/');
}

function figliDi(id) {
  return CARTELLE.filter((c) => (c.parentId ?? null) === id);
}

/** Il documento sta in questa cartella o in una sua discendente? */
function dentro(cartellaId, radice) {
  let corrente = cartellaId;
  const visti = new Set();
  while (corrente && !visti.has(corrente)) {
    if (corrente === radice) return true;
    visti.add(corrente);
    corrente = CARTELLE.find((c) => c.id === corrente)?.parentId ?? null;
  }
  return false;
}

function componi(c, documenti) {
  const figli = figliDi(c.id).map((f) => componi(f, documenti));
  const propri = documenti.filter((d) => d.cartellaId === c.id).length;
  return {
    id: c.id,
    nome: c.nome,
    percorso: percorsoDi(c.id),
    ...(c.parentId && { parentId: c.parentId }),
    ...(c.descrizione && { descrizione: c.descrizione }),
    descrizioneDaUtente: c.descrizioneDaUtente ?? false,
    ...(c.ruoloFigli && { ruoloFigli: c.ruoloFigli }),
    ...(c.clienteId && { clienteId: c.clienteId }),
    documenti: propri,
    documentiTotali: propri + figli.reduce((s, f) => s + f.documentiTotali, 0),
    figli,
  };
}

/** Il percorso leggibile di un documento, per l'elenco e per la scheda. */
export function percorsoDelDocumento(cartellaId) {
  return cartellaId ? percorsoDi(cartellaId) : undefined;
}

export function clientePerId(id) {
  const c = CLIENTI.find((x) => x.id === id);
  return c ? { id: c.id, nome: c.nome } : undefined;
}

export function esisteCartella(id) {
  return CARTELLE.some((c) => c.id === id);
}

/** Filtra i documenti come fa il backend: sottoalbero, sola cartella, non collocati. */
export function filtraPerCartella(documenti, url) {
  const cartellaId = url.searchParams.get('cartellaId');
  const soloQui = url.searchParams.get('soloQui') === 'true';
  const daSistemare = url.searchParams.get('daSistemare') === 'true';
  const clienteId = url.searchParams.get('clienteId');

  let esito = documenti;
  if (clienteId) esito = esito.filter((d) => d.clienteId === clienteId);
  if (daSistemare) return esito.filter((d) => !d.cartellaId);
  if (cartellaId) {
    return esito.filter((d) =>
      soloQui ? d.cartellaId === cartellaId : dentro(d.cartellaId, cartellaId),
    );
  }
  return esito;
}

export function gestisci(req, res, url, { inviaJson, leggiCorpo }, documenti) {
  const percorso = url.pathname;
  if (
    !percorso.startsWith('/api/cartelle') &&
    !percorso.startsWith('/api/clienti') &&
    percorso !== '/api/convenzione'
  ) {
    return false;
  }

  // --- L'albero ------------------------------------------------------------

  if (percorso === '/api/cartelle' && req.method === 'GET') {
    inviaJson(res, 200, {
      radici: figliDi(null).map((c) => componi(c, documenti)),
      daSistemare: documenti.filter((d) => !d.cartellaId).length,
    });
    return true;
  }

  if (percorso === '/api/cartelle' && req.method === 'POST') {
    return leggiCorpo(req).then((corpo) => {
      const dati = JSON.parse(corpo || '{}');
      const nome = (dati.nome ?? '').trim();
      if (!nome) {
        inviaJson(res, 400, { codice: 'DATI_NON_VALIDI', messaggio: 'Serve un nome.' });
        return true;
      }
      /* L'avviso sul quasi-doppione, come nel backend: è un avviso e si può
         scavalcare, altrimenti «Preventivi 2026» accanto a «Preventivi»
         sarebbe impossibile. */
      const gemella = figliDi(dati.parentId ?? null).find(
        (c) => chiave(c.nome) === chiave(nome) || chiave(c.nome).startsWith(chiave(nome)),
      );
      if (gemella && !dati.consentiSimile) {
        inviaJson(res, 409, {
          codice: 'CARTELLA_SIMILE',
          messaggio: `Qui accanto c'è già «${gemella.nome}»: se è la stessa cosa usa quella, altrimenti dai un nome che le distingua.`,
        });
        return true;
      }
      const nuova = {
        id: `car-${++progressivo}`,
        parentId: dati.parentId ?? null,
        nome,
        descrizione: dati.descrizione ?? null,
        descrizioneDaUtente: Boolean(dati.descrizione),
      };
      CARTELLE.push(nuova);
      inviaJson(res, 201, componi(nuova, documenti));
      return true;
    });
  }

  const idCartella = percorso.match(/^\/api\/cartelle\/([^/]+)$/)?.[1];
  if (idCartella) {
    const cartella = CARTELLE.find((c) => c.id === idCartella);
    if (!cartella) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Cartella inesistente.' });
      return true;
    }

    if (req.method === 'PATCH') {
      return leggiCorpo(req).then((corpo) => {
        const m = JSON.parse(corpo || '{}');
        if (m.nome !== undefined) cartella.nome = m.nome.trim();
        if (m.parentId !== undefined) {
          if (m.parentId && dentro(m.parentId, cartella.id)) {
            inviaJson(res, 409, {
              codice: 'DESTINAZIONE_INTERNA',
              messaggio:
                'Non si può spostare una cartella dentro sé stessa o dentro una sua sottocartella.',
            });
            return true;
          }
          cartella.parentId = m.parentId;
        }
        if (m.descrizione !== undefined) {
          cartella.descrizione = m.descrizione || null;
          cartella.descrizioneDaUtente = Boolean(m.descrizione);
        }
        inviaJson(res, 200, componi(cartella, documenti));
        return true;
      });
    }

    if (req.method === 'DELETE') {
      const destinazione =
        url.searchParams.get('documenti') === 'al-padre' ? (cartella.parentId ?? null) : null;
      const dentroTutti = CARTELLE.filter((c) => dentro(c.id, cartella.id)).map((c) => c.id);
      for (const d of documenti) {
        if (dentroTutti.includes(d.cartellaId)) {
          d.cartellaId = destinazione;
          d.collocazioneDaConfermare = false;
        }
      }
      for (const id of dentroTutti) {
        const i = CARTELLE.findIndex((c) => c.id === id);
        if (i >= 0) CARTELLE.splice(i, 1);
      }
      res.writeHead(204).end();
      return true;
    }
  }

  // --- I clienti -----------------------------------------------------------

  if (percorso === '/api/clienti' && req.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const elementi = CLIENTI.filter((c) => !q || c.nome.toLowerCase().includes(q)).map((c) => ({
      ...c,
      documenti: documenti.filter((d) => d.clienteId === c.id).length,
      ...(CARTELLE.find((x) => x.clienteId === c.id) && {
        cartellaId: CARTELLE.find((x) => x.clienteId === c.id).id,
      }),
    }));
    inviaJson(res, 200, { elementi, totale: elementi.length, pagina: 1, perPagina: 50 });
    return true;
  }

  if (percorso === '/api/clienti' && req.method === 'POST') {
    return leggiCorpo(req).then((corpo) => {
      const dati = JSON.parse(corpo || '{}');
      const nome = (dati.nome ?? '').trim();
      if (!nome) {
        inviaJson(res, 400, { codice: 'DATI_NON_VALIDI', messaggio: 'Serve un nome.' });
        return true;
      }
      const gemello = CLIENTI.find((c) => chiave(c.nome) === chiave(nome));
      if (gemello) {
        inviaJson(res, 409, {
          codice: 'CLIENTE_SIMILE',
          messaggio: `C'è già «${gemello.nome}»: se è lo stesso cliente usa quello, altrimenti aggiungi qualcosa che li distingua.`,
        });
        return true;
      }
      const nuovo = { id: `cli-${++progressivo}`, nome, tipo: dati.tipo ?? 'persona', alias: [] };
      CLIENTI.push(nuovo);
      inviaJson(res, 201, { ...nuovo, documenti: 0 });
      return true;
    });
  }

  // --- La convenzione ------------------------------------------------------

  if (percorso === '/api/convenzione' && req.method === 'GET') {
    inviaJson(res, 200, {
      testo: CONVENZIONE.testo,
      ...(CONVENZIONE.testoUtente && { testoUtente: CONVENZIONE.testoUtente }),
      effettiva: CONVENZIONE.testoUtente || CONVENZIONE.testo,
      calcolataIl: CONVENZIONE.calcolataIl,
      daRicalcolare: CONVENZIONE.daRicalcolare,
    });
    return true;
  }

  if (percorso === '/api/convenzione' && req.method === 'PATCH') {
    return leggiCorpo(req).then((corpo) => {
      const dati = JSON.parse(corpo || '{}');
      CONVENZIONE.testoUtente = (dati.testoUtente ?? '').trim() || null;
      inviaJson(res, 200, {
        testo: CONVENZIONE.testo,
        ...(CONVENZIONE.testoUtente && { testoUtente: CONVENZIONE.testoUtente }),
        effettiva: CONVENZIONE.testoUtente || CONVENZIONE.testo,
        calcolataIl: CONVENZIONE.calcolataIl,
        daRicalcolare: CONVENZIONE.daRicalcolare,
      });
      return true;
    });
  }

  return false;
}

/** Normalizzazione minima, quanto basta a riconoscere un doppione evidente. */
function chiave(testo) {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}
