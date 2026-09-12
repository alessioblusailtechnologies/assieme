/**
 * I clienti dell'Archivio Privato nel mock (`PIANO-CLIENTI.md`, 12/09/2026).
 *
 * Prende il posto di `cartelle.mjs`: l'albero e la convenzione non esistono
 * più, e il cliente è l'asse dell'archivio. Serve alla demo
 * self-contained, che non conosce il backend: senza queste rotte l'anagrafica
 * sarebbe vuota e la schermata racconterebbe una bugia sul prodotto. Lo stato
 * vive in memoria come il resto dell'archivio privato.
 */

const CLIENTI = [
  {
    id: 'cli-001',
    nome: 'Rossi Mario',
    tipo: 'persona',
    alias: ['ROSSI M.'],
    telefono: '340 1122334',
    etichette: ['in rinnovo'],
    stato: 'attivo',
    creatoIl: '2026-03-12T09:00:00+02:00',
  },
  {
    id: 'cli-002',
    nome: 'Bianchi Anna',
    tipo: 'persona',
    alias: [],
    etichette: [],
    stato: 'attivo',
    creatoIl: '2026-04-02T11:30:00+02:00',
  },
  {
    id: 'cli-003',
    nome: 'Bar da Mario S.r.l.',
    tipo: 'azienda',
    alias: ['Bar da Mario'],
    partitaIva: '01234567890',
    etichette: [],
    stato: 'attivo',
    creatoIl: '2026-05-20T15:45:00+02:00',
  },
];

let progressivo = 100;

export function clientePerId(id) {
  const c = CLIENTI.find((x) => x.id === id);
  return c ? { id: c.id, nome: c.nome } : undefined;
}

/** Filtra i documenti come fa il backend: per cliente, o quelli di nessuno. */
export function filtraPerCliente(documenti, url) {
  const clienteId = url.searchParams.get('clienteId');
  const senzaCliente = url.searchParams.get('senzaCliente') === 'true';
  const daConfermare = url.searchParams.get('daConfermare') === 'true';

  let esito = documenti;
  if (daConfermare) esito = esito.filter((d) => d.clienteDaConfermare);
  if (senzaCliente) return esito.filter((d) => !d.clienteId);
  if (clienteId) return esito.filter((d) => d.clienteId === clienteId);
  return esito;
}

function completo(c, documenti) {
  return { ...c, documenti: documenti.filter((d) => d.clienteId === c.id).length };
}

export function gestisci(req, res, url, { inviaJson, leggiCorpo }, documenti) {
  const percorso = url.pathname;
  if (!percorso.startsWith('/api/clienti')) return false;

  if (percorso === '/api/clienti' && req.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const etichetta = url.searchParams.get('etichetta');
    const elementi = CLIENTI.filter(
      (c) =>
        (!q || c.nome.toLowerCase().includes(q) || c.alias.some((a) => a.toLowerCase().includes(q))) &&
        (!etichetta || (c.etichette ?? []).includes(etichetta)),
    ).map((c) => completo(c, documenti));
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
      /* Il quasi-doppione si dice prima: «Rossi M.» accanto a «Rossi Mario»
         è il modo in cui un'anagrafica si sbriciola. */
      const gemello = CLIENTI.find((c) => chiave(c.nome) === chiave(nome));
      if (gemello) {
        inviaJson(res, 409, {
          codice: 'CLIENTE_SIMILE',
          messaggio: `C'è già «${gemello.nome}»: se è lo stesso cliente usa quello, altrimenti aggiungi qualcosa che li distingua.`,
        });
        return true;
      }
      const nuovo = {
        id: `cli-${++progressivo}`,
        nome,
        tipo: dati.tipo ?? 'persona',
        alias: [],
        etichette: dati.etichette ?? [],
        stato: 'attivo',
        creatoIl: new Date().toISOString(),
      };
      CLIENTI.push(nuovo);
      inviaJson(res, 201, { ...nuovo, documenti: 0 });
      return true;
    });
  }

  const id = percorso.match(/^\/api\/clienti\/([^/]+)$/)?.[1];
  if (id) {
    const cliente = CLIENTI.find((c) => c.id === id);
    if (!cliente) {
      inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Cliente inesistente.' });
      return true;
    }
    if (req.method === 'GET') {
      inviaJson(res, 200, completo(cliente, documenti));
      return true;
    }
    if (req.method === 'PATCH') {
      return leggiCorpo(req).then((corpo) => {
        Object.assign(cliente, JSON.parse(corpo || '{}'));
        inviaJson(res, 200, completo(cliente, documenti));
        return true;
      });
    }
  }

  /* La fusione: il perdente cede i documenti e sparisce. */
  const daFondere = percorso.match(/^\/api\/clienti\/([^/]+)\/fondi$/)?.[1];
  if (daFondere && req.method === 'POST') {
    return leggiCorpo(req).then((corpo) => {
      const { assorbito } = JSON.parse(corpo || '{}');
      const vincitore = CLIENTI.find((c) => c.id === daFondere);
      const indice = CLIENTI.findIndex((c) => c.id === assorbito);
      if (!vincitore || indice < 0) {
        inviaJson(res, 404, { codice: 'NON_TROVATO', messaggio: 'Cliente inesistente.' });
        return true;
      }
      const perso = CLIENTI[indice];
      vincitore.alias = [...new Set([...vincitore.alias, ...perso.alias, perso.nome])];
      for (const d of documenti) if (d.clienteId === perso.id) d.clienteId = vincitore.id;
      CLIENTI.splice(indice, 1);
      inviaJson(res, 200, completo(vincitore, documenti));
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
