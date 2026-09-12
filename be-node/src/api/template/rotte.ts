import { randomBytes } from 'node:crypto';

import ExcelJS from 'exceljs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { PDFDocument } from 'pdf-lib';
import type pg from 'pg';
import PizZip from 'pizzip';

import type { Citazione } from '../../contratto/conversazioni.js';

import { ErroreApi } from '../../contratto/errori.js';
import { consegnabile, estensioneDi, mimeDi } from '../../contratto/formati.js';
import {
  FORMATI_MODELLO,
  schemaEsportaRisposta,
  schemaPatchModello,
  type FormatoModello,
  type ModelloRiferimento,
} from '../../contratto/template.js';
import {
  elencoModelli,
  fasceDelTenant,
  fontiDaCitazioni,
  modelloPerId,
  percorsoModello,
  versoModello,
} from '../../generazione/catalogo.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { testoSemplice } from '../../generazione/email.js';
import { trascriviConversazione, type MessaggioDaTrascrivere } from '../../generazione/filo.js';
import { generaDocumento, NOME_DOCUMENTO, nomeFileGenerato } from '../../generazione/generatore.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { accoda } from '../../worker/coda.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';

/**
 * I modelli di riferimento dell'agenzia e l'esportazione della chat
 * (11/09/2026, fase 3 di `PIANO-INTESTAZIONE-MODELLI.md`).
 *
 * Un modello è un documento dell'agenzia di qualsiasi formato (PDF, Word,
 * Excel, PowerPoint), quanti se ne vogliono, ognuno col nome con cui lo si
 * richiama e una riga «quando usarlo». Lo usa solo la sandbox, con «Genera
 * da modello»; «Esporta come» esce col layout di VELIA e l'intestazione
 * dell'agenzia. La rotta resta `/api/template`: `/api/modelli` è dei
 * livelli AI.
 *
 * L'anteprima: un PDF si mostra com'è; Word, Excel e PowerPoint si
 * convertono in PDF una volta, al caricamento, col job `anteprima-modello`
 * sul runner della sandbox. Finché non c'è, il file si scarica.
 *
 * Le scritture sono dell'amministratore (`template.gestisci`): il 403 parte
 * da qui, l'isolamento fra tenant resta della RLS.
 */

export { fontiDaCitazioni } from '../../generazione/catalogo.js';

const nuovoId = (): string => `tpl-${randomBytes(6).toString('hex')}`;

const FIRMA_PDF = Buffer.from('%PDF-');
const FIRMA_ZIP = Buffer.from('PK');

/** Id di conversazioni e messaggi: uuid. Un id malformato è un 404, non un errore SQL. */
const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una riga di `velia.messaggi` come serve alla trascrizione della chat. */
interface RigaTrascrizione extends MessaggioDaTrascrivere {
  autore: 'utente' | 'assistente';
}

const NOME_FORMATO: Record<string, string> = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint' };

export interface OpzioniTemplate {
  /** Nei test: un archivio finto al posto dello Storage. */
  archivio?: ArchivioFile;
  /** Nei test: chi accoda il job dell'anteprima, al posto della coda vera. */
  accodaAnteprima?: (modelloId: string, identita: Identita) => Promise<unknown>;
}

export function registraRotteTemplate(app: FastifyInstance, opzioni: OpzioniTemplate = {}): void {
  let archivioStorage: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => opzioni.archivio ?? (archivioStorage ??= new ArchivioStorage());
  const accodaAnteprima =
    opzioni.accodaAnteprima ??
    ((modelloId: string, identita: Identita) =>
      accoda(poolDb(), 'anteprima-modello', { modelloId }, { tenantId: identita.tenantId, utenteId: identita.utenteId }));

  // --- I modelli di riferimento --------------------------------------------

  /** L'elenco che la chat usa e Impostazioni governa. */
  app.get('/api/template', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, (client) => elencoModelli(client, richiesta.identita.tenantId));
  });

  /**
   * Il caricamento: uno o più file, di qualsiasi formato tranne gli
   * eseguibili (dall'11/09/2026). Il nome è quello del file, senza
   * estensione; si cambia col PATCH. Il lotto è atomico: si valida tutto,
   * poi si crea tutto. Per tutto ciò che non è un PDF parte la conversione
   * dell'anteprima col LibreOffice della sandbox; se non riesce, il modello
   * si scarica.
   */
  app.post('/api/template', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    if (!richiesta.isMultipart()) {
      throw ErroreApi.datiNonValidi('Il caricamento richiede multipart/form-data.');
    }

    const ricevuti: Array<{ nome: string; formato: FormatoModello; contenuto: Buffer }> = [];
    for await (const parte of richiesta.parts()) {
      if (parte.type !== 'file' || !parte.filename) continue;
      const contenuto = await parte.toBuffer();
      const formato = await verificaModello(parte.filename, contenuto, parte.file.truncated);
      ricevuti.push({ nome: parte.filename, formato, contenuto });
    }
    if (!ricevuti.length) {
      throw new ErroreApi(400, 'NESSUN_FILE', 'La richiesta non contiene file.');
    }

    const { tenantId, utenteId } = richiesta.identita;
    const daCreare = ricevuti.map((f) => ({ ...f, id: nuovoId() }));
    const caricati: string[] = [];
    let creati: ModelloRiferimento[];
    try {
      for (const f of daCreare) {
        const percorso = percorsoModello(tenantId, f.id, f.formato);
        await archivio().carica(percorso, f.contenuto, mimeDi(f.formato));
        caricati.push(percorso);
      }
      creati = await conIdentita(poolDb(), richiesta.identita, async (client) => {
        const esiti: ModelloRiferimento[] = [];
        for (const f of daCreare) {
          const nome = f.nome.replace(/\.[^.]+$/, '') || f.nome;
          /* `clock_timestamp()`, non `now()`: nello stesso lotto l'ordine è quello dei file. */
          await client.query(
            `insert into velia.template (id, tenant_id, nome, formato, descrizione, path_file, anteprima, creato_da, created_at)
             values ($1, $2, $3, $4, '', $5, $6, $7, clock_timestamp())`,
            [f.id, tenantId, nome, f.formato, percorsoModello(tenantId, f.id, f.formato), f.formato === 'pdf' ? 'pronta' : 'in-corso', utenteId],
          );
          await registraStorico(client, richiesta.identita, 'creazione', 'template', `Caricato il modello «${nome}»`);
          esiti.push(versoModello((await modelloPerId(client, f.id))!));
        }
        return esiti;
      });
    } catch (errore) {
      await archivio()
        .elimina(caricati)
        .catch((e: unknown) => richiesta.log.warn({ err: e, caricati }, 'pulizia storage fallita'));
      throw errore;
    }

    /* L'anteprima dopo il commit: il worker deve trovare la riga. Una coda che non risponde non annulla il caricamento. */
    for (const m of creati.filter((m) => m.formato !== 'pdf')) {
      await accodaAnteprima(m.id, richiesta.identita).catch(async (e: unknown) => {
        richiesta.log.warn({ err: e, modello: m.id }, 'anteprima non accodata');
        await poolDb().query(`update velia.template set anteprima = 'errore' where id = $1`, [m.id]);
        m.anteprima = 'errore';
      });
    }
    void risposta.code(201);
    return { creati };
  });

  /** Nome, «quando usarlo» e intestazione. Risponde con l'elenco intero: il FE ridipinge da qui. */
  app.patch<{ Params: { id: string } }>('/api/template/:id', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaPatchModello.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche al modello non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const { tenantId } = richiesta.identita;
      const modello = await modelloPerId(client, richiesta.params.id);
      if (!modello) throw ErroreApi.nonTrovato('Modello inesistente.');

      const nome = m.nome ?? modello.nome;
      await client.query(
        `update velia.template set nome = $3, descrizione = $4, intestazione_agenzia = $5 where id = $1 and tenant_id = $2`,
        [modello.id, tenantId, nome, m.descrizione ?? modello.descrizione, m.intestazioneAgenzia ?? modello.intestazione_agenzia],
      );
      if (nome !== modello.nome) {
        await registraStorico(client, richiesta.identita, 'modifica', 'template', `Il modello «${modello.nome}» si chiama ora «${nome}»`);
      }
      if (m.descrizione !== undefined && m.descrizione !== modello.descrizione) {
        await registraStorico(client, richiesta.identita, 'modifica', 'template', `Cambiato «quando usarlo» di «${nome}»`);
      }
      if (m.intestazioneAgenzia !== undefined && m.intestazioneAgenzia !== modello.intestazione_agenzia) {
        await registraStorico(
          client,
          richiesta.identita,
          'modifica',
          'template',
          m.intestazioneAgenzia
            ? `«${nome}» esce con l'intestazione dell'agenzia`
            : `«${nome}» tiene la sua intestazione`,
        );
      }
      return elencoModelli(client, tenantId);
    });
  });

  /** Riga, file e anteprima insieme. */
  app.delete<{ Params: { id: string } }>('/api/template/:id', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const modello = await modelloPerId(client, richiesta.params.id);
      if (!modello) throw ErroreApi.nonTrovato('Modello inesistente.');
      await client.query(`delete from velia.template where id = $1 and tenant_id = $2`, [
        modello.id,
        richiesta.identita.tenantId,
      ]);
      await archivio().elimina([modello.path_file, ...(modello.path_anteprima ? [modello.path_anteprima] : [])]);
      await registraStorico(client, richiesta.identita, 'eliminazione', 'template', `Eliminato il modello «${modello.nome}»`);
    });
    return risposta.code(204).send();
  });

  /** L'anteprima, sempre PDF: il file stesso, o la conversione quando è pronta. */
  app.get<{ Params: { id: string } }>('/api/template/:id/anteprima', async (richiesta, risposta) => {
    const modello = await conIdentita(poolDb(), richiesta.identita, (client) => modelloPerId(client, richiesta.params.id));
    if (!modello) throw ErroreApi.nonTrovato('Modello inesistente.');
    const percorso = modello.formato === 'pdf' ? modello.path_file : modello.anteprima === 'pronta' ? modello.path_anteprima : null;
    if (!percorso) {
      throw new ErroreApi(404, 'ANTEPRIMA_NON_PRONTA', `L'anteprima di «${modello.nome}» non è disponibile: scarica il file.`);
    }
    return inviaFile(risposta, await archivio().scarica(percorso), 'application/pdf', 'inline');
  });

  /** Il file originale, com'è stato caricato. */
  app.get<{ Params: { id: string } }>('/api/template/:id/file', async (richiesta, risposta) => {
    const modello = await conIdentita(poolDb(), richiesta.identita, (client) => modelloPerId(client, richiesta.params.id));
    if (!modello) throw ErroreApi.nonTrovato('Modello inesistente.');
    return inviaFile(
      risposta,
      await archivio().scarica(modello.path_file),
      mimeDi(modello.formato),
      `attachment; filename="${nomeFileGenerato(modello.nome, modello.formato)}"`,
    );
  });

  // --- Esportazione della chat (RF-C-10) -----------------------------------

  /**
   * «Esporta come» (29/08/2026): il testo del messaggio e le sue fonti, col
   * layout di VELIA e l'intestazione dell'agenzia, titolati come la
   * conversazione. Sincrona: un documento sta sotto qualche secondo. Il
   * formato `txt` è il testo piatto con le fonti, senza fasce.
   */
  app.post<{ Params: { id: string; mid: string } }>(
    '/api/conversazioni/:id/messaggi/:mid/esporta',
    async (richiesta, risposta) => {
      const esito = schemaEsportaRisposta.safeParse(richiesta.body ?? {});
      if (!esito.success) throw ErroreApi.datiNonValidi('Indica il formato su cui esportare.');
      if (!E_UUID.test(richiesta.params.id) || !E_UUID.test(richiesta.params.mid)) {
        throw ErroreApi.nonTrovato('Messaggio inesistente.');
      }
      const { formato } = esito.data;

      const letto = await conIdentita(poolDb(), richiesta.identita, async (client) => {
        const m = await client.query<{ testo: string; citazioni: Citazione[]; titolo: string }>(
          `select m.testo, m.citazioni, c.titolo
           from velia.messaggi m join velia.conversazioni c on c.id = m.conversazione_id
           where m.conversazione_id = $1 and m.id = $2 and m.tenant_id = $3`,
          [richiesta.params.id, richiesta.params.mid, richiesta.identita.tenantId],
        );
        const messaggio = m.rows[0];
        if (!messaggio || formato === 'txt') return { messaggio };
        const titolo = messaggio.titolo.trim() || NOME_DOCUMENTO;
        return { messaggio, fasce: await fasceDelTenant(client, archivio(), richiesta.identita.tenantId, titolo) };
      });
      const { messaggio } = letto;
      if (!messaggio) throw ErroreApi.nonTrovato('Messaggio inesistente.');

      if (formato === 'txt' || !letto.fasce) {
        const testo = testoSemplice(messaggio.testo, fontiDaCitazioni(messaggio.citazioni));
        return inviaFile(risposta, Buffer.from(testo, 'utf8'), 'text/plain; charset=utf-8', 'attachment; filename="risposta.txt"');
      }

      const titolo = messaggio.titolo.trim() || NOME_DOCUMENTO;
      const file = await generaDocumento({
        formato,
        nome: titolo,
        titolo,
        testo: messaggio.testo,
        fonti: fontiDaCitazioni(messaggio.citazioni),
        fasce: letto.fasce,
      });

      return inviaFile(risposta, file.byte, file.contentType, `attachment; filename="${file.nomeFile}"`);
    },
  );

  /**
   * «Esporta come» sulla **conversazione intera** (12/09/2026): domande e
   * risposte in fila, con le fonti di tutte le risposte in coda, nello
   * stesso formato e con lo stesso layout della singola risposta.
   *
   * È la stessa azione, con un altro perimetro: una consulenza è fatta di
   * più giri, e consegnarne uno solo obbliga a ricomporre il resto a mano.
   */
  app.post<{ Params: { id: string } }>(
    '/api/conversazioni/:id/esporta',
    async (richiesta, risposta) => {
      const esito = schemaEsportaRisposta.safeParse(richiesta.body ?? {});
      if (!esito.success) throw ErroreApi.datiNonValidi('Indica il formato su cui esportare.');
      if (!E_UUID.test(richiesta.params.id)) throw ErroreApi.nonTrovato('Conversazione inesistente.');
      const { formato } = esito.data;

      const letto = await conIdentita(poolDb(), richiesta.identita, async (client) => {
        const c = await client.query<{ titolo: string }>(
          `select titolo from velia.conversazioni where id = $1 and tenant_id = $2`,
          [richiesta.params.id, richiesta.identita.tenantId],
        );
        if (!c.rowCount) return undefined;
        const m = await client.query<RigaTrascrizione>(
          `select autore, testo, citazioni from velia.messaggi
           where conversazione_id = $1 and tenant_id = $2
           order by inviato_il, id`,
          [richiesta.params.id, richiesta.identita.tenantId],
        );
        const titolo = c.rows[0]!.titolo.trim() || NOME_DOCUMENTO;
        return {
          titolo,
          messaggi: m.rows,
          ...(formato !== 'txt' && {
            fasce: await fasceDelTenant(client, archivio(), richiesta.identita.tenantId, titolo),
          }),
        };
      });
      if (!letto) throw ErroreApi.nonTrovato('Conversazione inesistente.');

      const { testo, fonti } = trascriviConversazione(letto.messaggi);
      if (!testo) throw ErroreApi.datiNonValidi('La conversazione non ha ancora niente da esportare.');

      if (formato === 'txt' || !letto.fasce) {
        const piano = `${letto.titolo}\n\n${testoSemplice(testo, fonti)}`;
        return inviaFile(
          risposta,
          Buffer.from(piano, 'utf8'),
          'text/plain; charset=utf-8',
          `attachment; filename="${nomeFileGenerato(letto.titolo, 'txt')}"`,
        );
      }

      const file = await generaDocumento({
        formato,
        nome: letto.titolo,
        titolo: letto.titolo,
        testo,
        fonti,
        fasce: letto.fasce,
      });

      return inviaFile(risposta, file.byte, file.contentType, `attachment; filename="${file.nomeFile}"`);
    },
  );
}

// ---------------------------------------------------------------------------
// Condivise
// ---------------------------------------------------------------------------

/** La voce «chi, cosa, quando» di RF-D-07: ogni mutazione delle impostazioni la scrive. */
export async function registraStorico(
  client: pg.ClientBase,
  identita: Identita,
  azione: 'creazione' | 'modifica' | 'attivazione' | 'disattivazione' | 'eliminazione',
  oggetto: 'regola' | 'documento-riferimento' | 'modello' | 'template',
  descrizione: string,
): Promise<void> {
  await client.query(
    `insert into velia.impostazioni_storico (tenant_id, utente_id, azione, oggetto, descrizione)
     values ($1, $2, $3, $4, $5)`,
    [identita.tenantId, identita.utenteId, azione, oggetto, descrizione],
  );
}

/**
 * Il controllo all'ingresso: formato dall'estensione, firma dei byte, e che
 * il file si apra davvero. Dall'11/09/2026 qualsiasi formato tranne gli
 * eseguibili; PDF, Word, Excel e PowerPoint si aprono per controllarli, gli
 * altri basta che non siano vuoti.
 */
async function verificaModello(nome: string, contenuto: Buffer, troncato: boolean): Promise<FormatoModello> {
  if (troncato) {
    throw new ErroreApi(413, 'FILE_TROPPO_GRANDE', `«${nome}» supera il limite per i modelli.`);
  }
  const estensione = estensioneDi(nome);
  if (!estensione || !consegnabile(estensione)) {
    throw new ErroreApi(
      400,
      'FORMATO_NON_AMMESSO',
      estensione
        ? `«${nome}»: un programma eseguibile non può essere un modello.`
        : `«${nome}» non ha un'estensione: aggiungine una che dica il formato (.docx, .pdf, .html…).`,
    );
  }
  if (!contenuto.length) throw new ErroreApi(400, 'FORMATO_NON_AMMESSO', `«${nome}» è vuoto.`);
  if (!(FORMATI_MODELLO as readonly string[]).includes(estensione)) return estensione;
  const illeggibile = (): ErroreApi =>
    new ErroreApi(400, 'FORMATO_NON_AMMESSO', `«${nome}» non è un file ${NOME_FORMATO[estensione]} leggibile.`);

  if (estensione === 'pdf') {
    if (!contenuto.subarray(0, 1024).includes(FIRMA_PDF)) throw illeggibile();
    try {
      await PDFDocument.load(contenuto, { ignoreEncryption: true });
    } catch {
      throw illeggibile();
    }
    return 'pdf';
  }

  if (!contenuto.subarray(0, 4).includes(FIRMA_ZIP)) throw illeggibile();
  try {
    if (estensione === 'xlsx') {
      await new ExcelJS.Workbook().xlsx.load(contenuto as unknown as ExcelJS.Buffer);
    } else {
      const parte = estensione === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml';
      if (!new PizZip(contenuto).file(parte)) throw new Error(`senza ${parte}`);
    }
  } catch {
    throw illeggibile();
  }
  return estensione;
}

function inviaFile(
  risposta: FastifyReply,
  byte: Buffer,
  contentType: string,
  disposition: string,
): FastifyReply {
  return risposta
    .header('Content-Type', contentType)
    .header('Content-Length', byte.length)
    .header('Content-Disposition', disposition)
    .send(byte);
}
