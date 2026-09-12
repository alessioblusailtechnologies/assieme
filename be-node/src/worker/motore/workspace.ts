import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, copyFile, link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';

import type pg from 'pg';

import type { ArchivioFile } from '../ingestion/archivio-file.js';
import { GLOSSARIO_RISCHI, NOME_GLOSSARIO } from '../../archivio/glossario.js';

/**
 * La workspace di un job (piano §4.3, doc motore §3 e §5): una directory
 * temporanea con dentro SOLTANTO l'Archivio Pubblico e l'archivio del
 * tenant, nell'albero che il motore sa navigare. L'isolamento è fisico:
 * ciò che non c'è non si può leggere.
 *
 * Postgres dice cosa esiste e come si chiama (è la verità sulla
 * navigazione), lo Storage conserva i contenuti (è la verità sul testo), il
 * disco del worker è cache pura: ricostruibile sempre, invalidata dalla
 * versione della riga di catalogo. Lo Storage del privato è piatto per id
 * (Fase 2): l'albero che l'SDK vede si costruisce qui dai metadati.
 */

export interface DocumentoWorkspace {
  id: string;
  titolo: string;
  /**
   * Che cosa contiene, in una riga: la scrive il classificatore in
   * ingestion e finisce negli `INDICE.md`, dove il titolo da solo non basta
   * a decidere se vale la pena aprire il documento. Null per i pubblici
   * (hanno indici scritti a mano) e per tutto ciò che è entrato prima.
   */
  descrizione: string | null;
  archivio: 'pubblico' | 'privato' | 'conversazione';
  tipologia: string;
  numeroPagine: number | null;
  /**
   * L'ultima pagina citabile. Per i privati è `numeroPagine`; per i pubblici è
   * l'ultima pagina del PDF condiviso dell'edizione: le ancore `[pag. N]`
   * riferiscono il PDF complessivo, non la porzione logica (Fase 1).
   */
  paginaMassima: number | null;
  compagnia: string | null;
  ramo: string | null;
  compagniaId: string | null;
  ramoId: string | null;
  prodotto: string | null;
  edizione: string | null;
  riferimentoCliente: string | null;
  /**
   * Il cliente a cui il documento è intestato (12/09/2026).
   *
   * Il **nome** è quello che l'utente pronuncia e quello che si trova con
   * Grep; l'**id** serve solo a comporre la cartella, che deve restare
   * stabile anche se due clienti si chiamano quasi uguali.
   */
  cliente: string | null;
  clienteId: string | null;
  /* Le due cose che di una polizza si chiedono per prime, e che la scheda
     del cliente mette in fila come scadenzario. */
  numeroPolizza: string | null;
  scadenza: string | null;
  etichette: string[];
  documentoDiRiferimento: boolean;
  /**
   * Il file dell'immagine accanto al suo `.md`, quando il documento è
   * un'immagine del contesto (04/09/2026).
   *
   * Di un'immagine il contenuto è l'immagine: la trascrizione dice quello
   * che c'è scritto, e di uno sfondo o di un mockup non c'è niente scritto.
   * L'originale sta nella workspace e il modello lo apre con Read, che le
   * immagini le guarda davvero. Il `.md` resta la fonte da citare.
   */
  immagine: string | null;
  /**
   * Vero quando il file nella workspace È l'originale caricato, senza un
   * Markdown: l'allegato «Solo per questa chat» (11/09/2026), un PDF o
   * un'immagine che il motore apre con Read così com'è. Niente ancore
   * `[pag. N]`: la pagina di una citazione è quella del PDF.
   */
  originale?: boolean;
}

export interface Workspace {
  /** La directory radice (assoluta) che diventa la cwd della sessione. */
  directory: string;
  /** path relativo (posix) → documento; è la chiave per leggere le citazioni. */
  perPath: Map<string, DocumentoWorkspace>;
  /** id documento → path relativo (posix). */
  perId: Map<string, string>;
  /** Documenti del contesto che non si è riusciti a materializzare, col motivo. */
  mancanti: Array<{ id: string; titolo: string; motivo: string }>;
  rimuovi(): Promise<void>;
}

interface RigaDocumento {
  id: string;
  archivio: 'pubblico' | 'privato' | 'conversazione';
  titolo: string;
  descrizione: string | null;
  tipologia: string;
  numero_pagine: number | null;
  pagina_inizio: number | null;
  path_pdf: string | null;
  path_md: string | null;
  formato: string | null;
  path_originale: string | null;
  stato: string;
  updated_at: Date;
  compagnia_id: string | null;
  compagnia_nome: string | null;
  ramo_id: string | null;
  ramo_nome: string | null;
  ramo_codice: string | null;
  prodotto: string | null;
  edizione_etichetta: string | null;
  riferimento_cliente: string | null;
  etichette: string[] | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  numero_polizza: string | null;
  scadenza: string | null;
  documento_di_riferimento: boolean | null;
  caricato_il: Date | null;
}

export interface OpzioniWorkspace {
  db: pg.Pool;
  archivio: ArchivioFile;
  tenantId: string;
  /** Radice delle workspace e della cache sul disco del worker. */
  radice: string;
  jobId: string;
  /**
   * Il nome della cartella sotto `workspace/`: di default il job. La chat
   * passa la conversazione, perché la ripresa di sessione dell'SDK richiede
   * la stessa directory di lavoro da un messaggio all'altro.
   */
  cartella?: string;
  /** Gli id del contesto della conversazione (allegati compresi). */
  contestoIds: string[];
  /**
   * Il cliente agganciato alla conversazione, se ce n'è uno.
   *
   * Non cambia che cosa si può leggere — l'agenzia legge tutto il suo
   * archivio — ma dice **di chi si sta parlando**: la sua scheda viene
   * scritta su disco, e il prompt lo nomina. Menzionare un cliente non è un
   * filtro, è dire al motore da dove partire.
   */
  clienteId?: string;
  /**
   * La chat cliente da cui nasce la conversazione, se è una chat cliente.
   *
   * Quando c'è, la workspace **non** contiene l'archivio dell'agenzia ma il
   * solo cono di quella chat: i documenti del suo cliente, più gli extra
   * scelti a mano, meno gli esclusi. È il presidio che conta — il worker
   * parla al database con la connessione di sistema e non passa dalla RLS,
   * quindi qui non c'è una seconda rete sotto. Ciò che finisce in questa
   * directory è esattamente ciò che il cliente può leggere, perché il
   * motore ha Read/Grep/Glob confinati e non esiste altro che questa
   * directory.
   */
  chatClienteId?: string;
}

/** Quanto a lungo ci si fida di un INDICE.md in cache (non ha una riga di catalogo). */
const TTL_INDICI_MS = 60 * 60 * 1000;

/**
 * Che cosa entra nella directory che il motore può leggere: **il confine**.
 *
 * Per l'agenzia è tutto l'Archivio Pubblico, tutto il proprio privato e gli
 * allegati della conversazione. Per una **chat cliente** è il solo cono:
 * i documenti del suo cliente, più quelli scelti a mano (i prodotti
 * pubblici che lo riguardano, un documento privato di un altro fascicolo),
 * meno quelli esclusi a mano.
 *
 * La definizione del cono è la stessa delle funzioni SQL usate dalle policy
 * (`velia.documenti_nel_cono`), riscritta qui di proposito: il worker parla
 * al database con la connessione di sistema e **non passa dalla RLS**,
 * quindi sotto questa query non c'è una seconda rete. Ciò che non torna di
 * qui non viene scritto su disco, e ciò che non è su disco il motore non lo
 * trova: ha Read, Grep e Glob confinati alla directory.
 *
 * Sta da sola, esportata, per una ragione sola: un confine si prova.
 */
export async function documentiPerWorkspace(
  db: pg.Pool,
  cono: { tenantId: string; contestoIds: string[]; chatClienteId?: string | null },
): Promise<pg.QueryResult<RigaDocumento>> {
  return db.query<RigaDocumento>(
    `with chat as (
       select k.id, k.cliente_id
       from velia.chat_clienti k
       where $3::uuid is not null and k.id = $3::uuid and k.tenant_id = $1
         and k.stato = 'attiva' and (k.scade_il is null or k.scade_il > now())
     ),
     scelti as (
       select cd.documento_id as id, cd.escluso
       from velia.chat_clienti_documenti cd
       join chat on chat.id = cd.chat_id
     )
     select d.id, d.archivio, d.titolo, d.descrizione, d.tipologia, d.numero_pagine, d.pagina_inizio,
            d.path_pdf, d.path_md, d.formato, d.path_originale, d.stato,
            d.updated_at, d.compagnia_id, c.nome as compagnia_nome,
            d.ramo_id, r.nome as ramo_nome, r.codice as ramo_codice,
            d.prodotto, d.edizione_etichetta, d.riferimento_cliente, d.etichette,
            d.cliente_id, cl.nome as cliente_nome,
            d.numero_polizza, to_char(d.scadenza, 'YYYY-MM-DD') as scadenza,
            d.documento_di_riferimento, d.caricato_il
     from velia.documenti d
     left join velia.compagnie c on c.id = d.compagnia_id
     left join velia.rami r on r.id = d.ramo_id
     left join velia.clienti cl on cl.id = d.cliente_id
     where (d.path_md is not null or (d.archivio = 'conversazione' and d.path_originale is not null))
       and (
         case when $3::uuid is null then
           d.archivio = 'pubblico'
           or (d.archivio = 'privato' and d.tenant_id = $1 and d.stato = 'pronto')
           or (d.archivio = 'conversazione' and d.tenant_id = $1 and d.stato = 'pronto' and d.id = any($2))
         else
           d.id in (select id from scelti where not escluso)
           or (d.archivio = 'privato' and d.tenant_id = $1 and d.stato = 'pronto'
               and d.cliente_id = (select cliente_id from chat)
               and d.id not in (select id from scelti where escluso))
         end
       )
     order by d.archivio, d.compagnia_id, d.prodotto, d.edizione_valida_dal, d.tipologia, d.caricato_il`,
    [cono.tenantId, cono.contestoIds, cono.chatClienteId ?? null],
  );
}

export async function materializzaWorkspace(opzioni: OpzioniWorkspace): Promise<Workspace> {
  const { db, archivio, tenantId, radice, jobId, contestoIds } = opzioni;
  const directory = join(radice, 'workspace', opzioni.cartella ?? jobId);
  const cache = new Cache(join(radice, 'cache'), archivio);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  /*
   * Che cosa entra nella directory che il motore può leggere.
   *
   * Per l'agenzia: tutto il pubblico, tutto il proprio privato, gli
   * allegati di questa conversazione.
   *
   * Per una chat cliente: **solo il cono**. I documenti del suo cliente,
   * più quelli scelti a mano e meno quelli esclusi — la stessa definizione
   * della funzione SQL usata dalle policy, scritta qui una seconda volta
   * perché qui non c'è RLS a fare da rete. Gli allegati restano fuori: in
   * una chat cliente non si carica niente.
   */
  const righe = await documentiPerWorkspace(db, {
    tenantId,
    contestoIds,
    chatClienteId: opzioni.chatClienteId ?? null,
  });

  const perPath = new Map<string, DocumentoWorkspace>();
  const perId = new Map<string, string>();
  const mancanti: Workspace['mancanti'] = [];
  const cartellePubbliche = new Set<string>();

  // L'ultima pagina del PDF condiviso di ogni edizione pubblica (un'edizione = un PDF).
  const ultimaPaginaPdf = new Map<string, number>();
  for (const r of righe.rows) {
    if (r.archivio !== 'pubblico' || !r.path_pdf || r.numero_pagine === null) continue;
    const fine = (r.pagina_inizio ?? 1) + r.numero_pagine - 1;
    ultimaPaginaPdf.set(r.path_pdf, Math.max(ultimaPaginaPdf.get(r.path_pdf) ?? 0, fine));
  }

  for (const riga of righe.rows) {
    /* L'allegato veloce non ha Markdown: nella workspace va il file com'è,
       col nome che avrebbe avuto il suo .md e la sua estensione vera. */
    const originale = !riga.path_md && riga.path_originale ? riga.path_originale : null;
    const relativo = originale
      ? percorsoNellaWorkspace(riga).replace(/\.md$/i, originale.slice(originale.lastIndexOf('.')).toLowerCase())
      : percorsoNellaWorkspace(riga);
    try {
      const origine = await cache.file(originale ?? riga.path_md!, riga.updated_at.toISOString());
      await collega(origine, join(directory, ...relativo.split('/')));
    } catch (errore) {
      mancanti.push({
        id: riga.id,
        titolo: riga.titolo,
        motivo: errore instanceof Error ? errore.message : String(errore),
      });
      continue;
    }
    /* L'immagine vera accanto al suo Markdown, per i documenti del contesto:
       è il solo modo di far vedere al modello quello che l'utente gli sta
       mostrando. Fuori dal contesto non si materializza — un archivio pieno
       di foto costerebbe un download a ogni job per immagini che nessuno ha
       chiesto. Se non si riesce a scaricarla, pazienza: resta il Markdown, e
       il documento non diventa «mancante» per questo. */
    let immagine: string | null = null;
    if (!originale && riga.formato === 'immagine' && riga.path_originale && contestoIds.includes(riga.id)) {
      const estensione = riga.path_originale.slice(riga.path_originale.lastIndexOf('.'));
      const percorsoImmagine = relativo.replace(/\.md$/i, estensione);
      try {
        const origine = await cache.file(riga.path_originale, riga.updated_at.toISOString());
        await collega(origine, join(directory, ...percorsoImmagine.split('/')));
        immagine = percorsoImmagine;
      } catch {
        immagine = null;
      }
    }

    /* La scheda di un file che VELIA non legge (11/09/2026, fase 3 di
       PIANO-LINK-E-FORMATI.md): per i documenti del contesto l'originale
       sta accanto, col suo nome e la sua estensione, così il motore
       documentale lo trova e lo usa nei file che genera. Il motore della
       chat non lo apre: gli basta la scheda, che dice che cos'è. */
    if (!originale && riga.formato === 'altro' && riga.path_originale && contestoIds.includes(riga.id)) {
      const estensione = riga.path_originale.slice(riga.path_originale.lastIndexOf('.'));
      if (estensione.toLowerCase() !== '.md') {
        try {
          const origine = await cache.file(riga.path_originale, riga.updated_at.toISOString());
          await collega(origine, join(directory, ...relativo.replace(/\.md$/i, estensione).split('/')));
        } catch {
          /* senza l'originale resta la scheda */
        }
      }
    }

    const doc = versoDocumento(
      riga,
      riga.archivio === 'pubblico' && riga.path_pdf ? (ultimaPaginaPdf.get(riga.path_pdf) ?? null) : riga.numero_pagine,
      immagine,
    );
    if (originale) doc.originale = true;
    perPath.set(relativo, doc);
    perId.set(riga.id, relativo);
    if (riga.archivio === 'pubblico') {
      // Gli INDICE.md del pubblico stanno nello Storage accanto ai documenti:
      // si portano dentro quelli della cartella e di tutte le sue antenate.
      let cartella = posix.dirname(riga.path_md!);
      while (cartella && cartella !== '.' && cartella !== '/') {
        cartellePubbliche.add(cartella);
        const sopra = posix.dirname(cartella);
        if (sopra === cartella) break;
        cartella = sopra;
      }
    }
  }

  for (const cartella of cartellePubbliche) {
    const percorso = `${cartella}/INDICE.md`;
    const origine = await cache.fileConTtl(percorso, TTL_INDICI_MS);
    if (origine) await collega(origine, join(directory, ...percorso.split('/')));
  }

  /* Il glossario dei rischi viene dal codice, non dallo Storage: è sapere
     sul mestiere, non sull'archivio, e non cambia quando entra una
     compagnia nuova. Gli INDICE danno i sinonimi dei nomi commerciali;
     questo dà quelli dei rischi, che nessun indice può conoscere. */
  if (cartellePubbliche.size) {
    await writeFile(join(directory, 'archivio-pubblico', NOME_GLOSSARIO), GLOSSARIO_RISCHI, 'utf8');
  }

  // Gli allegati del contesto che non sono (ancora) pronti: il motore deve saperlo.
  const presenti = new Set(perId.keys());
  if (contestoIds.length) {
    const altri = await db.query<{ id: string; titolo: string; archivio: string; stato: string }>(
      `select id, titolo, archivio, stato from velia.documenti
       where id = any($1) and (tenant_id = $2 or archivio = 'pubblico')`,
      [contestoIds, tenantId],
    );
    for (const a of altri.rows) {
      if (presenti.has(a.id)) continue;
      mancanti.push({
        id: a.id,
        titolo: a.titolo,
        motivo:
          a.stato === 'errore'
            ? 'elaborazione fallita: il documento non è leggibile'
            : a.stato !== 'pronto'
              ? 'elaborazione non ancora conclusa'
              : 'Markdown non disponibile',
      });
    }
  }

  /*
   * I clienti: il ruolino li elenca tutti (è un file da grepare), le schede
   * si scrivono solo per quelli **in gioco** — quello agganciato alla
   * conversazione e quelli dei documenti nel contesto. Scriverne tremila a
   * ogni messaggio sarebbe I/O buttato, e per gli altri c'è lo strumento.
   *
   * In una chat cliente non se ne scrive nessuno: là dentro non esistono
   * «gli altri clienti», e il ruolino direbbe al cliente che l'agenzia ne
   * ha altri duemila.
   */
  const clienti = opzioni.chatClienteId ? [] : await clientiDelTenant(db, tenantId);
  const inGioco = new Set<string>();
  if (!opzioni.chatClienteId) {
    if (opzioni.clienteId) inGioco.add(opzioni.clienteId);
    for (const riga of righe.rows) {
      if (riga.cliente_id && contestoIds.includes(riga.id)) inGioco.add(riga.cliente_id);
    }
  }

  await scriviIndiciTenant(directory, perPath, clienti, inGioco);

  return {
    directory,
    perPath,
    perId,
    mancanti,
    rimuovi: () => rm(directory, { recursive: true, force: true }),
  };
}

/**
 * Il path relativo (posix) di un documento nella workspace.
 *
 * Il privato si raggruppa **per cliente** (Fase 7 del `PIANO-CLIENTI.md`):
 * è l'asse su cui gira l'archivio, ed è la domanda che l'utente fa davvero
 * («cosa ha Rossi»). Una cartella per cliente tiene ogni directory piccola
 * anche con quattromila documenti, e la si trova con un Glob sul nome.
 *
 * La cartella porta **nome e id**: due «Rossi Mario» non si mescolano, e
 * rinominare un cliente non fa migrare niente — il path cambia al job
 * dopo, e i path non sono mai stati la verità (le citazioni si ancorano
 * agli id).
 *
 * Chi un cliente non ce l'ha resta per tipologia: circolari, modulistica e
 * note tecniche non sono di nessuno, e la tipologia è un insieme chiuso.
 */
export function percorsoNellaWorkspace(riga: {
  id: string;
  archivio: 'pubblico' | 'privato' | 'conversazione';
  titolo: string;
  tipologia: string;
  path_md: string | null;
  cliente_nome?: string | null;
  cliente_id?: string | null;
}): string {
  if (riga.archivio === 'pubblico') return riga.path_md!.replace(/^\/+/, '');
  const nome = `${slug(riga.titolo)}--${riga.id}.md`;
  if (riga.archivio !== 'privato') return `tenant/allegati/${nome}`;
  if (riga.cliente_id && riga.cliente_nome) {
    return `tenant/clienti/${cartellaCliente(riga.cliente_nome, riga.cliente_id)}/${nome}`;
  }
  return `tenant/documenti/${riga.tipologia}/${nome}`;
}

/** La cartella di un cliente: il nome per leggerlo, l'id per non confonderlo. */
export function cartellaCliente(nome: string, id: string): string {
  return `${slug(nome)}--${id}`;
}

export function slug(testo: string): string {
  return (
    testo
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'documento'
  );
}

function versoDocumento(
  r: RigaDocumento,
  paginaMassima: number | null,
  immagine: string | null = null,
): DocumentoWorkspace {
  return {
    id: r.id,
    titolo: r.titolo,
    immagine,
    descrizione: r.descrizione,
    archivio: r.archivio,
    tipologia: r.tipologia,
    numeroPagine: r.numero_pagine,
    paginaMassima,
    compagnia: r.compagnia_nome,
    ramo: r.ramo_nome,
    compagniaId: r.compagnia_id,
    ramoId: r.ramo_id,
    prodotto: r.prodotto,
    edizione: r.edizione_etichetta,
    riferimentoCliente: r.riferimento_cliente,
    cliente: r.cliente_nome,
    clienteId: r.cliente_id,
    numeroPolizza: r.numero_polizza,
    scadenza: r.scadenza,
    etichette: r.etichette ?? [],
    documentoDiRiferimento: r.documento_di_riferimento ?? false,
  };
}

/**
 * Gli INDICE.md del tenant si generano qui, dai metadati: nello Storage il
 * privato è piatto per id, e cliente, etichette e tipologia cambiano nel
 * tempo.
 *
 * La forma è quella dell'archivio: **una cartella per cliente**, più una
 * per tipologia per ciò che un cliente non ce l'ha. Tre regole la tengono
 * in piedi su un'agenzia vera:
 *
 * 1. il **ruolino** (`tenant/clienti/INDICE.md`) è un file da *grepare*,
 *    non da leggere: tremila righe sono duecento kilobyte, e il modello ci
 *    cerca dentro un nome per ottenere una cartella;
 * 2. ogni cartella ha il suo indice, così scendere costa una lettura sola;
 * 3. la **scheda** di un cliente si scrive solo per quelli in gioco —
 *    l'agganciato alla conversazione e quelli dei documenti nel contesto —
 *    perché scriverne tremila a ogni messaggio è I/O buttato, e per gli
 *    altri c'è lo strumento.
 */
async function scriviIndiciTenant(
  directory: string,
  perPath: Map<string, DocumentoWorkspace>,
  clienti: ClienteWorkspace[],
  inGioco: Set<string>,
): Promise<void> {
  const privati = [...perPath.entries()].filter(([, d]) => d.archivio === 'privato');
  const allegati = [...perPath.entries()].filter(([, d]) => d.archivio === 'conversazione');
  const conPubblico = [...perPath.values()].some((d) => d.archivio === 'pubblico');

  /* Testo libero dentro una tabella Markdown: le barre verticali e gli a
     capo la spezzerebbero riga per riga. */
  const cella = (testo: string): string => testo.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/').trim();

  const rigaDoc = ([path, d]: [string, DocumentoWorkspace]): string =>
    `| \`${posix.basename(path)}\` | ${cella(d.titolo)} | ${d.cliente ? cella(d.cliente) : '—'} | ${d.tipologia} | ${d.compagnia ?? '—'} | ${d.ramo ?? '—'} | ${d.numeroPagine ?? '?'} | ${d.etichette.join(', ') || '—'} | ${d.descrizione ? cella(d.descrizione) : '—'} |${d.documentoDiRiferimento ? ' ★' : ''}`;
  const intestazione =
    '| File | Titolo | Cliente | Tipologia | Compagnia | Ramo | Pagine | Etichette | Cosa contiene |\n|---|---|---|---|---|---|---|---|---|';

  const senzaCliente = privati.filter(([, d]) => !d.clienteId);

  const radice =
    '# Indice della workspace\n\n' +
    '- `archivio-pubblico/` — set informativi delle compagnie (DIP, DIP Aggiuntivo, Condizioni, glossari), per compagnia/ramo/prodotto/edizione. Ogni cartella ha il suo `INDICE.md`.\n' +
    (conPubblico
      ? `- \`archivio-pubblico/${NOME_GLOSSARIO}\` — con quali parole i contratti scrivono i rischi che l'utente nomina a modo suo. Aprilo quando una ricerca non dà risultati, prima di concludere che una garanzia non c'è.\n`
      : '') +
    `- \`tenant/clienti/\` — una cartella per cliente, con i suoi documenti. L'elenco è in \`tenant/clienti/INDICE.md\`: **cercaci dentro con Grep**, non leggerlo.\n` +
    `- \`tenant/documenti/\` — i documenti privati che un cliente non ce l'hanno (${senzaCliente.length}): circolari, modulistica, note tecniche. Per tipologia.\n` +
    `- \`tenant/allegati/\` — gli allegati della conversazione in corso (${allegati.length}). Vedi \`tenant/allegati/INDICE.md\`.\n`;
  await writeFile(join(directory, 'INDICE.md'), radice, 'utf8');

  // Un indice per cartella: si raggruppa per directory del path materializzato.
  const perCartella = new Map<string, Array<[string, DocumentoWorkspace]>>();
  for (const voce of privati) {
    const cartella = posix.dirname(voce[0]);
    const elenco = perCartella.get(cartella);
    if (elenco) elenco.push(voce);
    else perCartella.set(cartella, [voce]);
  }

  // --- Il ruolino dei clienti ----------------------------------------------

  await mkdir(join(directory, 'tenant', 'clienti'), { recursive: true });
  const quanti = clienti.length;
  const ruolino =
    '# I clienti dell’agenzia\n\n' +
    (quanti
      ? `Sono ${quanti}. **Questo file si cerca con Grep**, non si legge: trova la riga del cliente che ti serve e apri la sua cartella.\n\n` +
        '| Cliente | Cartella | Tipo | Documenti | Anche come | Etichette |\n|---|---|---|---|---|---|\n' +
        clienti
          .map(
            (c) =>
              `| ${cella(c.nome)} | \`tenant/clienti/${cartellaCliente(c.nome, c.id)}/\` | ${c.tipo} | ${c.documenti} | ${c.alias.length ? cella(c.alias.join(', ')) : '—'} | ${c.etichette.length ? cella(c.etichette.join(', ')) : '—'} |`,
          )
          .join('\n') +
        '\n\n' +
        'La colonna «Anche come» sono le forme con cui il cliente compare sui documenti: se un nome non lo trovi, cercalo lì.\n' +
        'Un cliente con zero documenti esiste lo stesso: la sua cartella non c’è, e di lui sai quello che dice questa riga.\n'
      : 'Nessun cliente in anagrafica.\n');
  await writeFile(join(directory, 'tenant', 'clienti', 'INDICE.md'), ruolino, 'utf8');

  const perId = new Map(clienti.map((c) => [c.id, c]));

  // --- Una cartella per cliente, col suo indice (e la scheda se è in gioco)
  for (const [cartella, documenti] of perCartella) {
    if (!cartella.startsWith('tenant/clienti/')) continue;
    await mkdir(join(directory, ...cartella.split('/')), { recursive: true });
    const id = cartella.slice(cartella.lastIndexOf('--') + 2);
    const cliente = perId.get(id);
    const nome = cliente?.nome ?? documenti[0]?.[1].cliente ?? cartella;
    await writeFile(
      join(directory, ...cartella.split('/'), 'INDICE.md'),
      `# ${nome}\n\n` +
        `${documenti.length} document${documenti.length === 1 ? 'o' : 'i'} in archivio.\n\n` +
        `${intestazione}\n${documenti.map(rigaDoc).join('\n')}\n` +
        (cliente && inGioco.has(id) ? '\nChi è, i suoi recapiti e le sue scadenze: `SCHEDA.md`.\n' : ''),
      'utf8',
    );
    if (cliente && inGioco.has(id)) {
      await writeFile(
        join(directory, ...cartella.split('/'), 'SCHEDA.md'),
        schedaCliente(cliente, documenti),
        'utf8',
      );
    }
  }

  /* Un cliente in gioco può non avere ancora documenti: la sua cartella non
     nascerebbe, e la scheda — che è il motivo per cui lo si è menzionato —
     non ci sarebbe. Si crea qui. */
  for (const id of inGioco) {
    const cliente = perId.get(id);
    if (!cliente) continue;
    const cartella = `tenant/clienti/${cartellaCliente(cliente.nome, cliente.id)}`;
    if (perCartella.has(cartella)) continue;
    await mkdir(join(directory, ...cartella.split('/')), { recursive: true });
    await writeFile(
      join(directory, ...cartella.split('/'), 'SCHEDA.md'),
      schedaCliente(cliente, []),
      'utf8',
    );
  }

  // --- Quello che un cliente non ce l'ha -----------------------------------

  await mkdir(join(directory, 'tenant', 'documenti'), { recursive: true });
  const mappa = [...perCartella.entries()]
    .filter(([c]) => c.startsWith('tenant/documenti/'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, docs]) => `- \`${c}/\` — ${docs.length} document${docs.length === 1 ? 'o' : 'i'}`)
    .join('\n');
  await writeFile(
    join(directory, 'tenant', 'documenti', 'INDICE.md'),
    '# Documenti senza cliente\n\n' +
      (senzaCliente.length
        ? 'Circolari, modulistica, note tecniche, convenzioni: roba dell’agenzia, non di qualcuno. Per tipologia.\n\n' +
          `${mappa || '(nessuna)'}\n\n` +
          'I documenti di un cliente stanno in `tenant/clienti/`, una cartella per ciascuno.\n' +
          '\n★ = documento di riferimento dell’agenzia (contesto permanente).\n'
        : 'Nessuno: ogni documento privato è intestato a un cliente.\n'),
    'utf8',
  );

  for (const [cartella, documenti] of perCartella) {
    if (!cartella.startsWith('tenant/documenti/')) continue;
    await mkdir(join(directory, ...cartella.split('/')), { recursive: true });
    await writeFile(
      join(directory, ...cartella.split('/'), 'INDICE.md'),
      `# ${cartella.replace('tenant/documenti/', '')}\n\n${intestazione}\n${documenti.map(rigaDoc).join('\n')}\n`,
      'utf8',
    );
  }

  await mkdir(join(directory, 'tenant', 'allegati'), { recursive: true });
  await writeFile(
    join(directory, 'tenant', 'allegati', 'INDICE.md'),
    '# Allegati della conversazione\n\n' +
      (allegati.length
        ? `${intestazione}\n${allegati.map(rigaDoc).join('\n')}\n` +
          (allegati.some(([, d]) => d.immagine)
            ? '\nGli allegati che sono immagini hanno il **file dell’immagine** accanto al loro `.md`, con lo stesso nome: aprilo con Read per guardarla davvero (colori, impaginazione, stile). Il `.md` resta la fonte da citare.\n'
            : '') +
          (allegati.some(([, d]) => d.originale)
            ? '\nGli allegati che non finiscono in `.md` sono i **file originali**, PDF o immagini, senza trascrizione: aprili con Read (un PDF di più di 10 pagine a blocchi, col parametro `pages`, al massimo 20 pagine per volta). Si citano col loro nome e con il numero di pagina del PDF; un’immagine è pagina 1.\n'
            : '')
        : 'Nessun allegato.\n'),
    'utf8',
  );
}

/**
 * Un cliente come lo vede la workspace.
 *
 * I recapiti stanno qui ma finiscono su disco **solo nella scheda di un
 * cliente in gioco**: il ruolino porta ciò che serve a trovarlo (nome,
 * forme alternative, quanti documenti), non i suoi dati personali.
 */
interface ClienteWorkspace {
  id: string;
  nome: string;
  tipo: string;
  alias: string[];
  etichette: string[];
  documenti: number;
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  nato_il: string | null;
  note: string | null;
  codice_fiscale: string | null;
  partita_iva: string | null;
}

async function clientiDelTenant(db: pg.Pool, tenantId: string): Promise<ClienteWorkspace[]> {
  const r = await db.query<ClienteWorkspace>(
    `select c.id, c.nome, c.tipo, c.alias, c.etichette,
            c.email, c.telefono, c.indirizzo, to_char(c.nato_il, 'YYYY-MM-DD') as nato_il,
            c.note, c.codice_fiscale, c.partita_iva,
            (select count(*) from velia.documenti d
              where d.tenant_id = c.tenant_id and d.cliente_id = c.id)::int as documenti
       from velia.clienti c
      where c.tenant_id = $1 and c.stato = 'attivo'
      order by c.nome`,
    [tenantId],
  );
  return r.rows;
}

/**
 * La scheda di un cliente: quello che di lui non si vede dai documenti.
 *
 * È un **dato dell'agenzia**, non una fonte: le regole dicono di non
 * citarla, perché una citazione deve puntare a un documento con la sua
 * pagina, e un recapito non ha pagine.
 */
function schedaCliente(c: ClienteWorkspace, documenti: Array<[string, DocumentoWorkspace]>): string {
  const righe = [
    `# ${c.nome}`,
    '',
    `- Tipo: ${c.tipo}`,
    ...(c.codice_fiscale ? [`- Codice fiscale: ${c.codice_fiscale}`] : []),
    ...(c.partita_iva ? [`- Partita IVA: ${c.partita_iva}`] : []),
    ...(c.nato_il ? [`- Nato il: ${c.nato_il}`] : []),
    ...(c.email ? [`- Email: ${c.email}`] : []),
    ...(c.telefono ? [`- Telefono: ${c.telefono}`] : []),
    ...(c.indirizzo ? [`- Indirizzo: ${c.indirizzo}`] : []),
    ...(c.alias.length ? [`- Sui documenti compare anche come: ${c.alias.join(', ')}`] : []),
    ...(c.etichette.length ? [`- Etichette: ${c.etichette.join(', ')}`] : []),
    '',
  ];
  if (c.note?.trim()) righe.push('## Note dell’agenzia', '', c.note.trim(), '');

  const conScadenza = documenti
    .map(([, d]) => d)
    .filter((d) => d.scadenza)
    .sort((a, b) => (a.scadenza ?? '').localeCompare(b.scadenza ?? ''));
  if (conScadenza.length) {
    righe.push(
      '## Scadenze',
      '',
      ...conScadenza.map(
        (d) => `- ${d.scadenza} — ${d.titolo}${d.numeroPolizza ? ` (polizza ${d.numeroPolizza})` : ''}`,
      ),
      '',
    );
  }

  righe.push(
    `## I suoi documenti (${documenti.length})`,
    '',
    documenti.length
      ? 'Sono i file di questa cartella: l’elenco con i titoli è in `INDICE.md`.'
      : 'Nessun documento in archivio.',
    '',
    'Questa scheda è un **dato dell’agenzia**, non un documento: non si cita nel blocco finale.',
    '',
  );
  return righe.join('\n');
}


/** Hard link se il filesystem lo permette (stesso volume), altrimenti copia. */
async function collega(origine: string, destinazione: string): Promise<void> {
  await mkdir(join(destinazione, '..'), { recursive: true });
  try {
    await link(origine, destinazione);
  } catch {
    await copyFile(origine, destinazione);
  }
}

/**
 * La cache dei file dello Storage sul disco del worker, per path. Ogni
 * voce porta la versione con cui è stata scaricata: quella del catalogo
 * per i documenti, l'età per gli indici.
 */
class Cache {
  constructor(
    private readonly radice: string,
    private readonly archivio: ArchivioFile,
  ) {}

  private voce(percorso: string): { file: string; meta: string } {
    const chiave = createHash('sha1').update(percorso).digest('hex');
    return { file: join(this.radice, chiave), meta: join(this.radice, `${chiave}.json`) };
  }

  /** Il file locale per un path dello Storage, aggiornato alla versione data. */
  async file(percorso: string, versione: string): Promise<string> {
    const { file, meta } = this.voce(percorso);
    const m = await leggiMeta(meta);
    if (m && m.versione === versione && !m.mancante && (await esiste(file))) return file;
    const contenuto = await this.archivio.scarica(percorso);
    await mkdir(this.radice, { recursive: true });
    await writeFile(file, contenuto);
    await writeFile(meta, JSON.stringify({ percorso, versione, scaricatoIl: Date.now() }), 'utf8');
    return file;
  }

  /** Come `file`, ma per ciò che non ha una versione: si rinfresca per età, e l'assenza si ricorda. */
  async fileConTtl(percorso: string, ttlMs: number): Promise<string | undefined> {
    const { file, meta } = this.voce(percorso);
    const m = await leggiMeta(meta);
    if (m && Date.now() - m.scaricatoIl < ttlMs) {
      if (m.mancante) return undefined;
      if (await esiste(file)) return file;
    }
    await mkdir(this.radice, { recursive: true });
    try {
      const contenuto = await this.archivio.scarica(percorso);
      await writeFile(file, contenuto);
      await writeFile(meta, JSON.stringify({ percorso, versione: 'ttl', scaricatoIl: Date.now() }), 'utf8');
      return file;
    } catch {
      await writeFile(
        meta,
        JSON.stringify({ percorso, versione: 'ttl', scaricatoIl: Date.now(), mancante: true }),
        'utf8',
      );
      return undefined;
    }
  }
}

interface Meta {
  percorso: string;
  versione: string;
  scaricatoIl: number;
  mancante?: boolean;
}

async function leggiMeta(percorso: string): Promise<Meta | undefined> {
  try {
    return JSON.parse(await readFile(percorso, 'utf8')) as Meta;
  } catch {
    return undefined;
  }
}

async function esiste(percorso: string): Promise<boolean> {
  try {
    await access(percorso, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}
