import type { FastifyInstance } from 'fastify';
import PizZip from 'pizzip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { creaApp } from '../src/api/app.js';
import { configurazione, type Configurazione } from '../src/config.js';
import { assicuraCartella } from '../src/archivio/albero.js';
import { creaCliente, fondiClienti, risolviCliente } from '../src/archivio/clienti.js';
import { collocaDocumento } from '../src/archivio/collocazione.js';
import { convenzioneEffettiva, ricalcolaConvenzione } from '../src/archivio/convenzione.js';
import type { AlberoCartelle, Cartella, Cliente, Convenzione } from '../src/contratto/cartelle.js';
import type {
  DocumentoPrivato,
  EsitoCaricamento,
  PaginaDocumentiPrivati,
} from '../src/contratto/documenti-privati.js';
import type { CorpoErroreApi } from '../src/contratto/errori.js';
import type { EsitoAccesso } from '../src/contratto/sessione.js';
import { chiudiPool, poolDb } from '../src/db/pool.js';
import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';

/**
 * La Fase 10 contro il progetto vero: l'albero delle cartelle, l'anagrafica
 * clienti con la risoluzione, la convenzione osservata, e l'importazione che
 * conserva i percorsi.
 *
 * Nessuna chiamata AI: la risoluzione dei clienti che si prova qui è quella
 * deterministica (nome, alias, somiglianza), che è anche quella che in
 * un'agenzia vera copre la stragrande maggioranza dei casi.
 *
 * Come le altre suite d'integrazione: **worker di sviluppo fermo**, o si
 * contende i job della coda.
 */
let config: Configurazione | undefined;
try {
  config = configurazione();
} catch {
  config = undefined;
}

const pronto = Boolean(
  config?.SUPABASE_JWT_SECRET &&
    config.DATABASE_URL &&
    !config.DATABASE_URL.includes('PASSWORD_MANCANTE'),
);

const PASSWORD_DEMO = 'velia-demo-2026!';
const TENANT_COLLAUDO = '22222222-2222-4222-8222-222222222222';
const TENANT_ALTROVE = '33333333-3333-4333-8333-333333333333';
const EMAIL_ADMIN = 't.uno@collaudo.sonovelia.it';

async function pdfDiProva(testo = 'Polizza'): Promise<Buffer> {
  const documento = await PDFDocument.create();
  const font = await documento.embedFont(StandardFonts.Helvetica);
  const pagina = documento.addPage([300, 400]);
  pagina.drawText(testo, { x: 20, y: 360, size: 12, font });
  return Buffer.from(await documento.save());
}

/**
 * Il multipart dell'importazione: ogni file può essere preceduto dal campo
 * `percorso` che dice da dove viene. L'ordine è il contratto.
 */
function multipart(
  file: Array<{ nome: string; contenuto: Buffer; tipo?: string; percorso?: string }>,
): { corpo: Buffer; contentType: string } {
  const confine = `----velia-${Math.random().toString(16).slice(2)}`;
  const pezzi: Buffer[] = [];
  for (const f of file) {
    if (f.percorso) {
      pezzi.push(
        Buffer.from(
          `--${confine}\r\nContent-Disposition: form-data; name="percorso"\r\n\r\n${f.percorso}\r\n`,
        ),
      );
    }
    pezzi.push(
      Buffer.from(
        `--${confine}\r\nContent-Disposition: form-data; name="file"; filename="${f.nome}"\r\n` +
          `Content-Type: ${f.tipo ?? 'application/pdf'}\r\n\r\n`,
      ),
      f.contenuto,
      Buffer.from('\r\n'),
    );
  }
  pezzi.push(Buffer.from(`--${confine}--\r\n`));
  return { corpo: Buffer.concat(pezzi), contentType: `multipart/form-data; boundary=${confine}` };
}

class ArchivioFinto implements ArchivioFile {
  readonly file = new Map<string, Buffer>();
  scarica(percorso: string): Promise<Buffer> {
    const b = this.file.get(percorso);
    return b ? Promise.resolve(b) : Promise.reject(new Error(`assente: ${percorso}`));
  }
  carica(percorso: string, contenuto: Buffer): Promise<void> {
    this.file.set(percorso, contenuto);
    return Promise.resolve();
  }
  elimina(percorsi: string[]): Promise<void> {
    for (const p of percorsi) this.file.delete(p);
    return Promise.resolve();
  }
}

describe.skipIf(!pronto)('cartelle, clienti e convenzione col progetto Supabase', () => {
  const pool = () => poolDb();
  const archivio = new ArchivioFinto();
  let app: FastifyInstance;
  let token: string;

  const richiedi = (
    metodo: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: Record<string, unknown>,
  ) =>
    app.inject({
      method: metodo,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload && { payload }),
    });

  /** Il tenant di collaudo torna vuoto: queste suite spazzano dati. */
  async function pulisci(): Promise<void> {
    await pool().query(
      `delete from velia.documenti where archivio = 'privato' and tenant_id = any($1)`,
      [[TENANT_COLLAUDO, TENANT_ALTROVE]],
    );
    await pool().query(`delete from velia.cartelle where tenant_id = any($1)`, [
      [TENANT_COLLAUDO, TENANT_ALTROVE],
    ]);
    await pool().query(`delete from velia.clienti where tenant_id = any($1)`, [
      [TENANT_COLLAUDO, TENANT_ALTROVE],
    ]);
    await pool().query(`delete from velia.convenzione_archivio where tenant_id = any($1)`, [
      [TENANT_COLLAUDO, TENANT_ALTROVE],
    ]);
  }

  beforeAll(async () => {
    app = creaApp({ logger: false, archivioPrivato: { archivio } });
    await app.ready();
    const accesso = await app.inject({
      method: 'POST',
      url: '/api/sessione/accesso',
      payload: { email: EMAIL_ADMIN, password: PASSWORD_DEMO },
    });
    token = accesso.json<EsitoAccesso>().tokenAccesso;
    await pulisci();
  }, 60_000);

  afterAll(async () => {
    await pulisci();
    await app.close();
    await chiudiPool();
  });

  // -------------------------------------------------------------------------

  it('la normalizzazione dei nomi fonde le scritture, non i clienti diversi', async () => {
    const normalizza = async (nome: string): Promise<string> =>
      (await pool().query<{ n: string }>(`select velia.normalizza_nome($1) as n`, [nome])).rows[0]!
        .n;

    // Stesso cliente scritto in modi diversi: stessa chiave.
    expect(await normalizza('Rossi Mario')).toBe(await normalizza('ROSSI  MARIO'));
    expect(await normalizza('Rossi Mario')).toBe(await normalizza('Mario Rossi'));
    expect(await normalizza('Bar da Mario S.r.l.')).toBe(await normalizza('Bar da Mario srl'));

    /* «Rossi M.» NON deve collassare su «Rossi»: i punti si cancellano, ma
       l'iniziale resta un token, altrimenti Rossi Mario e Rossi Marco
       diventerebbero lo stesso cliente. */
    expect(await normalizza('Rossi M.')).not.toBe(await normalizza('Rossi'));
    expect(await normalizza('Rossi Mario')).not.toBe(await normalizza('Rossi Marco'));
  });

  it('risolve il cliente per nome, per alias e per somiglianza, e si ferma quando è ambiguo', async () => {
    const cliente = await creaCliente(pool(), TENANT_COLLAUDO, 'Rossi Mario');

    const perNome = await risolviCliente(pool(), TENANT_COLLAUDO, { contraente: 'ROSSI MARIO' });
    expect(perNome).toMatchObject({ id: cliente.id, via: 'nome' });

    await pool().query(`update velia.clienti set alias = array['Bar da Mario'] where id = $1`, [
      cliente.id,
    ]);
    const perAlias = await risolviCliente(pool(), TENANT_COLLAUDO, {
      contraente: 'bar da mario',
    });
    expect(perAlias).toMatchObject({ id: cliente.id, via: 'alias' });

    /* «Rossi Mario Giuseppe» somiglia a «Rossi Mario» (0,57) ma non abbastanza
       da essere una certezza: senza qualcuno che decida, il documento va in
       «Da sistemare» invece di finire nella pratica di un omonimo. */
    const ambiguo = await risolviCliente(pool(), TENANT_COLLAUDO, {
      contraente: 'Rossi Mario Giuseppe',
    });
    expect(ambiguo).toBeNull();

    /* Con qualcuno che decide (nella vita è il modello, qui una risposta
       fissa) si risolve, e la forma nuova diventa un alias: la seconda volta
       la domanda non si pone più, e la risoluzione migliora usandola. */
    const sceglitore = {
      scegli: (d: { candidati: Array<{ id: string }> }) =>
        Promise.resolve({ id: d.candidati[0]!.id }),
    };
    const conAiuto = await risolviCliente(
      pool(),
      TENANT_COLLAUDO,
      { contraente: 'Rossi Mario Giuseppe' },
      sceglitore,
    );
    expect(conAiuto).toMatchObject({ id: cliente.id, via: 'modello' });
    const dopo = await risolviCliente(pool(), TENANT_COLLAUDO, {
      contraente: 'Rossi Mario Giuseppe',
    });
    expect(dopo).toMatchObject({ id: cliente.id, via: 'alias' });

    // Fiducia bassa: non nasce nessun cliente, il documento andrà in «Da sistemare».
    const incerto = await risolviCliente(pool(), TENANT_COLLAUDO, {
      contraente: 'Qualcuno Di Ignoto',
      fiducia: 'bassa',
    });
    expect(incerto).toBeNull();
  });

  it('fonde due clienti sdoppiati portandosi dietro documenti e alias', async () => {
    const vince = await creaCliente(pool(), TENANT_COLLAUDO, 'Bianchi Anna');
    const perde = await creaCliente(pool(), TENANT_COLLAUDO, 'Bianchi Anna Maria');
    await pool().query(
      `insert into velia.documenti (id, archivio, tenant_id, titolo, tipologia, stato,
         caricato_il, dimensione_byte, cliente_id)
       values ('doc-priv-fusione', 'privato', $1, 'Polizza', 'polizza', 'pronto', now(), 10, $2)`,
      [TENANT_COLLAUDO, perde.id],
    );

    await fondiClienti(pool(), TENANT_COLLAUDO, vince.id, perde.id);

    const documenti = await pool().query<{ cliente_id: string }>(
      `select cliente_id from velia.documenti where id = 'doc-priv-fusione'`,
    );
    expect(documenti.rows[0]!.cliente_id).toBe(vince.id);
    const rimasti = await pool().query(`select 1 from velia.clienti where id = $1`, [perde.id]);
    expect(rimasti.rowCount).toBe(0);
    const alias = await pool().query<{ alias: string[] }>(
      `select alias from velia.clienti where id = $1`,
      [vince.id],
    );
    expect(alias.rows[0]!.alias).toContain('Bianchi Anna Maria');
  });

  it('osserva la convenzione dall’albero, senza che nessuno l’abbia configurata', async () => {
    const clienti = await assicuraCartella(pool(), TENANT_COLLAUDO, {
      parentId: null,
      nome: 'Clienti',
    });
    const nomi = ['Rossi Mario', 'Bianchi Anna', 'Verdi Luca', 'Neri Sara', 'Gialli Spa'];
    const perCliente: string[] = [];
    for (const nome of nomi) {
      const id = await assicuraCartella(pool(), TENANT_COLLAUDO, { parentId: clienti, nome });
      perCliente.push(id);
      for (const anno of ['2025', '2026']) {
        await assicuraCartella(pool(), TENANT_COLLAUDO, { parentId: id, nome: anno });
      }
    }

    const esito = await ricalcolaConvenzione(pool(), TENANT_COLLAUDO);
    expect(esito.testo).toContain('**clienti**');
    expect(esito.testo).toContain('dentro ogni cliente → **anni**');
    // Il vincolo che tiene: la forma sì, le istanze mai.
    expect(esito.testo).not.toContain('Rossi Mario');

    const ruoli = await pool().query<{ ruolo_figli: string | null }>(
      `select ruolo_figli from velia.cartelle where id = $1`,
      [clienti],
    );
    expect(ruoli.rows[0]!.ruolo_figli).toBe('clienti');
  });

  it('colloca sotto la cartella del cliente, e crea solo dove il livello ammette istanze', async () => {
    const cliente = await creaCliente(pool(), TENANT_COLLAUDO, 'Colombo Ivan');
    const esito = await collocaDocumento(pool(), TENANT_COLLAUDO, {
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      tipologia: 'polizza',
      decorrenza: '2026-03-01',
      titolo: 'Polizza RC Auto',
    });
    // Il livello dei clienti ammette un cliente nuovo; sotto, gli anni.
    expect(esito?.percorso).toBe('Clienti/Colombo Ivan/2026');

    const legata = await pool().query<{ cliente_id: string | null }>(
      `select cliente_id from velia.cartelle where tenant_id = $1 and nome = 'Colombo Ivan'`,
      [TENANT_COLLAUDO],
    );
    expect(legata.rows[0]!.cliente_id).toBe(cliente.id);

    /* Rinominare la cartella non rompe l'aggancio: la collocazione lavora
       sugli id, l'utente sui nomi. */
    await pool().query(
      `update velia.cartelle set nome = 'Colombo Ivan (officina)', slug = 'colombo-ivan-officina'
       where tenant_id = $1 and cliente_id = $2`,
      [TENANT_COLLAUDO, cliente.id],
    );
    const dopo = await collocaDocumento(pool(), TENANT_COLLAUDO, {
      clienteId: cliente.id,
      clienteNome: cliente.nome,
      tipologia: 'preventivo',
      decorrenza: '2026-03-01',
      titolo: 'Preventivo',
    });
    expect(dopo?.percorso).toBe('Clienti/Colombo Ivan (officina)/2026');
  });

  it('senza cliente e senza sceglicartella non inventa niente: «Da sistemare»', async () => {
    const esito = await collocaDocumento(pool(), TENANT_COLLAUDO, {
      tipologia: 'nota-tecnica',
      titolo: 'Circolare senza padrone',
    });
    expect(esito).toBeNull();
  });

  // -------------------------------------------------------------------------

  it('l’albero arriva col conteggio del sottoalbero e la voce «Da sistemare»', async () => {
    const r = await richiedi('GET', '/api/cartelle');
    expect(r.statusCode).toBe(200);
    const albero = r.json<AlberoCartelle>();
    const clienti = albero.radici.find((c) => c.nome === 'Clienti');
    expect(clienti).toBeDefined();
    expect(clienti!.ruoloFigli).toBe('clienti');
    expect(typeof albero.daSistemare).toBe('number');
  });

  it('avvisa prima di creare un quasi-doppione fra sorelle, e si lascia scavalcare', async () => {
    const r = await richiedi('POST', '/api/cartelle', { nome: 'Clientii' });
    expect(r.statusCode).toBe(409);
    expect(r.json<CorpoErroreApi>().codice).toBe('CARTELLA_SIMILE');

    /* È un avviso, non un divieto: chi sa quello che fa passa. Senza questa
       via d'uscita, «Preventivi 2026» accanto a «Preventivi» sarebbe
       impossibile da creare. */
    const forzata = await richiedi('POST', '/api/cartelle', {
      nome: 'Clientii',
      consentiSimile: true,
    });
    expect(forzata.statusCode).toBe(201);
    await richiedi('DELETE', `/api/cartelle/${forzata.json<Cartella>().id}`);
  });

  it('rifiuta di spostare una cartella dentro sé stessa', async () => {
    const albero = (await richiedi('GET', '/api/cartelle')).json<AlberoCartelle>();
    const clienti = albero.radici.find((c) => c.nome === 'Clienti')!;
    const figlio = clienti.figli[0]!;
    const r = await richiedi('PATCH', `/api/cartelle/${clienti.id}`, { parentId: figlio.id });
    expect(r.statusCode).toBe(409);
    expect(r.json<CorpoErroreApi>().codice).toBe('DESTINAZIONE_INTERNA');
  });

  it('una descrizione scritta a mano diventa dell’utente e non si tocca più', async () => {
    const creata = await richiedi('POST', '/api/cartelle', {
      nome: 'Utils',
      descrizione: 'moduli in bianco, listini e tabelle di conversione',
    });
    expect(creata.statusCode).toBe(201);
    const cartella = creata.json<Cartella>();
    expect(cartella.descrizioneDaUtente).toBe(true);

    // Il ricalcolo passa e la lascia dov'è.
    await ricalcolaConvenzione(pool(), TENANT_COLLAUDO);
    const dopo = await pool().query<{ descrizione: string }>(
      `select descrizione from velia.cartelle where id = $1`,
      [cartella.id],
    );
    expect(dopo.rows[0]!.descrizione).toContain('moduli in bianco');
  });

  it('l’importazione conserva i percorsi: i file diventano albero', async () => {
    const pdf = await pdfDiProva();
    const { corpo, contentType } = multipart([
      { nome: 'polizza.pdf', contenuto: pdf, percorso: 'Clienti/Ferrari Luigi/2026/polizza.pdf' },
      { nome: 'sciolto.pdf', contenuto: pdf },
    ]);
    const r = await app.inject({
      method: 'POST',
      url: '/api/documenti-privati',
      headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
      payload: corpo,
    });
    expect(r.statusCode).toBe(201);
    const { creati } = r.json<EsitoCaricamento>();
    const conPercorso = creati.find((d) => d.titolo === 'polizza')!;
    const senza = creati.find((d) => d.titolo === 'sciolto')!;

    expect(conPercorso.percorso).toBe('Clienti/Ferrari Luigi/2026');
    // Chi non porta un percorso resta da collocare: lo farà l'ingestion.
    expect(senza.cartellaId).toBeUndefined();

    // E il cambio di struttura ha marcato la convenzione da rifare.
    const convenzione = await pool().query<{ da_ricalcolare: boolean }>(
      `select da_ricalcolare from velia.convenzione_archivio where tenant_id = $1`,
      [TENANT_COLLAUDO],
    );
    expect(convenzione.rows[0]!.da_ricalcolare).toBe(true);
  });

  it('uno zip entra coi suoi percorsi e salta ciò che non sa leggere', async () => {
    const pdf = await pdfDiProva('Preventivo');
    const zip = new PizZip();
    zip.file('Clienti/Esposito Rita/preventivo.pdf', pdf);
    zip.file('Clienti/Esposito Rita/vecchio.doc', Buffer.from('roba del 2009'));
    zip.file('__MACOSX/._preventivo.pdf', Buffer.from('x'));
    const contenuto = zip.generate({ type: 'nodebuffer' });

    const { corpo, contentType } = multipart([
      { nome: 'archivio.zip', contenuto, tipo: 'application/zip' },
    ]);
    const r = await app.inject({
      method: 'POST',
      url: '/api/documenti-privati',
      headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
      payload: corpo,
    });
    expect(r.statusCode).toBe(201);
    const esito = r.json<EsitoCaricamento>();
    expect(esito.creati).toHaveLength(1);
    expect(esito.creati[0]!.percorso).toBe('Clienti/Esposito Rita');
    expect(esito.ignorati).toEqual(['Clienti/Esposito Rita/vecchio.doc']);
  });

  it('filtra per cartella col sottoalbero, per la sola cartella, e per «Da sistemare»', async () => {
    const albero = (await richiedi('GET', '/api/cartelle')).json<AlberoCartelle>();
    const clienti = albero.radici.find((c) => c.nome === 'Clienti')!;

    const sottoalbero = (
      await richiedi('GET', `/api/documenti-privati?cartellaId=${clienti.id}`)
    ).json<PaginaDocumentiPrivati>();
    expect(sottoalbero.totale).toBeGreaterThanOrEqual(2);

    const soloQui = (
      await richiedi('GET', `/api/documenti-privati?cartellaId=${clienti.id}&soloQui=true`)
    ).json<PaginaDocumentiPrivati>();
    expect(soloQui.totale).toBe(0);

    const daSistemare = (
      await richiedi('GET', '/api/documenti-privati?daSistemare=true')
    ).json<PaginaDocumentiPrivati>();
    expect(daSistemare.elementi.every((d) => !d.cartellaId)).toBe(true);
  });

  it('spostare a mano è definitivo: spegne la collocazione da confermare', async () => {
    const albero = (await richiedi('GET', '/api/cartelle')).json<AlberoCartelle>();
    const utils = albero.radici.find((c) => c.nome === 'Utils')!;
    const daSistemare = (
      await richiedi('GET', '/api/documenti-privati?daSistemare=true')
    ).json<PaginaDocumentiPrivati>();
    const documento = daSistemare.elementi[0]!;

    // Prima si finge una proposta del sistema, come farebbe l'ingestion.
    await pool().query(
      `update velia.documenti set collocazione_da_confermare = true where id = $1`,
      [documento.id],
    );
    const r = await richiedi('PATCH', `/api/documenti-privati/${documento.id}`, {
      cartellaId: utils.id,
    });
    expect(r.statusCode).toBe(200);
    const dopo = r.json<DocumentoPrivato>();
    expect(dopo.cartellaId).toBe(utils.id);
    expect(dopo.percorso).toBe('Utils');
    expect(dopo.collocazioneDaConfermare).toBeUndefined();
  });

  it('eliminare una cartella dice sempre che fine fanno i documenti', async () => {
    const creata = (
      await richiedi('POST', '/api/cartelle', { nome: 'Da buttare' })
    ).json<Cartella>();
    const dentro = await richiedi('GET', '/api/documenti-privati?daSistemare=true');
    const documento = dentro.json<PaginaDocumentiPrivati>().elementi[0];
    if (documento) {
      await richiedi('PATCH', `/api/documenti-privati/${documento.id}`, {
        cartellaId: creata.id,
      });
    }

    const r = await richiedi('DELETE', `/api/cartelle/${creata.id}?documenti=da-sistemare`);
    expect(r.statusCode).toBe(204);
    if (documento) {
      const scheda = await richiedi('GET', `/api/documenti-privati/${documento.id}`);
      expect(scheda.json<DocumentoPrivato>().cartellaId).toBeUndefined();
    }
  });

  it('i clienti si cercano sul normalizzato e non si sdoppiano dalla rotta', async () => {
    const elenco = (await richiedi('GET', '/api/clienti?q=rossi mario')).json<{
      elementi: Cliente[];
    }>();
    expect(elenco.elementi.some((c) => c.nome === 'Rossi Mario')).toBe(true);

    const doppione = await richiedi('POST', '/api/clienti', { nome: 'ROSSI  MARIO' });
    expect(doppione.statusCode).toBe(409);
    expect(doppione.json<CorpoErroreApi>().codice).toBe('CLIENTE_SIMILE');
  });

  it('la correzione umana della convenzione vince su quella osservata', async () => {
    await ricalcolaConvenzione(pool(), TENANT_COLLAUDO);
    const prima = (await richiedi('GET', '/api/convenzione')).json<Convenzione>();
    expect(prima.testo).toContain('Archivio Privato');
    expect(prima.effettiva).toBe(prima.testo);

    const corretta = await richiedi('PATCH', '/api/convenzione', {
      testoUtente: 'I documenti stanno per cliente, poi per anno.',
    });
    expect(corretta.statusCode).toBe(200);
    expect(corretta.json<Convenzione>().effettiva).toBe(
      'I documenti stanno per cliente, poi per anno.',
    );
    expect(await convenzioneEffettiva(pool(), TENANT_COLLAUDO)).toBe(
      'I documenti stanno per cliente, poi per anno.',
    );

    // Svuotarla restituisce la parola all'osservazione.
    await richiedi('PATCH', '/api/convenzione', { testoUtente: null });
    const dopo = (await richiedi('GET', '/api/convenzione')).json<Convenzione>();
    expect(dopo.effettiva).toBe(dopo.testo);
  });

  it('l’isolamento fra tenant vale anche per cartelle e clienti', async () => {
    /* Un tenant vero e temporaneo: senza una riga in `velia.tenant` non si
       può nemmeno creare una cartella (la chiave esterna lo impedisce), e
       senza una cartella altrui non si dimostra niente sulla RLS. */
    await pool().query(
      `insert into velia.tenant (id, nome) values ($1, 'Agenzia Estranea')
       on conflict (id) do nothing`,
      [TENANT_ALTROVE],
    );
    try {
      const altrove = await assicuraCartella(pool(), TENANT_ALTROVE, {
        parentId: null,
        nome: 'Roba di un altro',
      });

      const albero = (await richiedi('GET', '/api/cartelle')).json<AlberoCartelle>();
      expect(albero.radici.some((c) => c.id === altrove)).toBe(false);

      // Nemmeno per id: la PATCH non deve poter agganciare la cartella altrui.
      const documenti = (
        await richiedi('GET', '/api/documenti-privati')
      ).json<PaginaDocumentiPrivati>();
      if (documenti.elementi[0]) {
        const r = await richiedi('PATCH', `/api/documenti-privati/${documenti.elementi[0].id}`, {
          cartellaId: altrove,
        });
        expect(r.statusCode).toBe(400);
      }
    } finally {
      await pool().query('delete from velia.tenant where id = $1', [TENANT_ALTROVE]);
    }
  });
});
