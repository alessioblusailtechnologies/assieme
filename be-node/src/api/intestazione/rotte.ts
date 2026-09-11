import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { ErroreApi } from '../../contratto/errori.js';
import {
  E_ID_IMMAGINE,
  immaginiDellaFascia,
  schemaAnteprima,
  schemaIntestazione,
  type ImmagineCaricata,
  type IntestazioneSalvata,
} from '../../contratto/intestazione.js';
import { conIdentita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { fascePerGenerazione, intestazioneDelTenant, percorsoImmagineIntestazione } from '../../generazione/catalogo.js';
import { generaDocumento } from '../../generazione/generatore.js';
import { dimensioniImmagine, tipoImmagine } from '../../generazione/intestazione.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';
import { richiediAmministratore } from '../plugins/auth.js';
import { registraStorico } from '../template/rotte.js';

/**
 * Intestazione e piè di pagina dell'agenzia (11/09/2026), al posto
 * dell'identità visiva: la scheda 1 di Impostazioni > Template di output
 * (`PIANO-INTESTAZIONE-MODELLI.md`).
 *
 * Il JSON lo scrive l'editor e lo valida lo schema vincolato del contratto:
 * un nodo fuori schema è un 400. Le immagini (loghi, marchi) si caricano a
 * parte e il JSON le cita per id; lo Storage le tiene sotto il tenant, così
 * un id di un altro tenant non punta a niente.
 *
 * L'anteprima usa il motore vero, sul contenuto che le si manda: l'editor
 * la chiede prima di salvare, e quel che mostra è quel che uscirà.
 *
 * Le scritture sono dell'amministratore; leggere e vedere l'anteprima no,
 * perché sapere come escono i documenti dell'agenzia non è un privilegio.
 */

export interface OpzioniIntestazione {
  /** Nei test: un archivio finto al posto dello Storage. */
  archivio?: ArchivioFile;
}

/** Un logo pesa poco: oltre, è una foto finita lì per sbaglio. */
const LIMITE_IMMAGINE = 2 * 1024 * 1024;

const nuovoIdImmagine = (tipo: 'png' | 'jpg'): string => `img-${randomBytes(6).toString('hex')}.${tipo}`;

/** Il documento d'esempio dell'anteprima: tutto quello che il layout sa fare, su due pagine, per vedere girare i numeri. */
const TESTO_ANTEPRIMA = [
  '## Oggetto',
  '',
  'Questa è l’anteprima di un documento generato da VELIA: l’intestazione e il piè di pagina sono quelli che stai componendo, il resto è il layout di ogni esportazione.',
  '',
  '## Garanzie principali',
  '',
  '- **Responsabilità civile**: massimale unico di € 10.000.000 per sinistro.',
  '- **Incendio e furto**: scoperto del 10% con minimo di € 250.',
  '- **Assistenza stradale**: traino fino a 50 km dal luogo del fermo.',
  '',
  '| Garanzia | Franchigia | Massimale |',
  '| --- | --- | --- |',
  '| Cristalli | € 150 | € 1.500 |',
  '| Eventi atmosferici | 10%, minimo € 500 | valore commerciale |',
  '| Kasko | € 1.000 | valore commerciale |',
  '',
  '## Note',
  '',
  ...Array.from({ length: 14 }, () => [
    'I dati riportati sono di esempio. Nei documenti veri qui c’è il testo della risposta o dell’analisi, con le fonti in coda: titolo del documento, articolo e pagina.',
    '',
  ]).flat(),
].join('\n');

export function registraRotteIntestazione(app: FastifyInstance, opzioni: OpzioniIntestazione = {}): void {
  let archivioStorage: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => opzioni.archivio ?? (archivioStorage ??= new ArchivioStorage());

  app.get('/api/intestazione', async (richiesta): Promise<IntestazioneSalvata> => {
    const salvata = await conIdentita(poolDb(), richiesta.identita, (client) =>
      intestazioneDelTenant(client, richiesta.identita.tenantId),
    );
    return {
      intestazione: salvata.intestazione,
      piede: salvata.piede,
      ...(salvata.aggiornataIl && { aggiornataIl: salvata.aggiornataIl.toISOString() }),
    };
  });

  app.put('/api/intestazione', async (richiesta): Promise<IntestazioneSalvata> => {
    richiediAmministratore(richiesta);
    const esito = schemaIntestazione.safeParse(richiesta.body ?? {});
    if (!esito.success) {
      throw ErroreApi.datiNonValidi('Intestazione o piè di pagina contengono qualcosa che i documenti non sanno riprodurre.');
    }
    const { tenantId } = richiesta.identita;

    /* Un'immagine che non è stata caricata (o è di un altro tenant) non si
       salva: il documento uscirebbe senza, e nessuno capirebbe perché. */
    for (const id of new Set([...immaginiDellaFascia(esito.data.intestazione), ...immaginiDellaFascia(esito.data.piede)])) {
      try {
        await archivio().scarica(percorsoImmagineIntestazione(tenantId, id));
      } catch {
        throw ErroreApi.datiNonValidi('Un’immagine dell’intestazione non è stata caricata: aggiungila di nuovo.');
      }
    }

    const aggiornataIl = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const r = await client.query<{ aggiornata_il: Date }>(
        `insert into velia.intestazione (tenant_id, intestazione, piede, aggiornata_da)
         values ($1, $2, $3, $4)
         on conflict (tenant_id) do update
           set intestazione = excluded.intestazione, piede = excluded.piede,
               aggiornata_il = now(), aggiornata_da = excluded.aggiornata_da
         returning aggiornata_il`,
        [tenantId, JSON.stringify(esito.data.intestazione), JSON.stringify(esito.data.piede), richiesta.identita.utenteId],
      );
      await registraStorico(client, richiesta.identita, 'modifica', 'template', 'Modificati intestazione e piè di pagina');
      return r.rows[0]!.aggiornata_il;
    });
    return { ...esito.data, aggiornataIl: aggiornataIl.toISOString() };
  });

  /** Un logo o un marchio: PNG o JPEG, riconosciuti dai byte e non dal nome. */
  app.post('/api/intestazione/immagini', async (richiesta, risposta): Promise<ImmagineCaricata> => {
    richiediAmministratore(richiesta);
    if (!richiesta.isMultipart()) throw ErroreApi.datiNonValidi('Il caricamento richiede multipart/form-data.');
    let byte: Buffer | undefined;
    for await (const parte of richiesta.parts()) {
      if (parte.type !== 'file') continue;
      const contenuto = await parte.toBuffer();
      byte ??= contenuto;
    }
    if (!byte) throw new ErroreApi(400, 'FILE_MANCANTE', 'Nessuna immagine nel caricamento.');
    if (byte.length > LIMITE_IMMAGINE) {
      throw new ErroreApi(413, 'FILE_TROPPO_GRANDE', 'L’immagine supera i 2 MB: per un logo basta molto meno.');
    }
    const tipo = tipoImmagine(byte);
    if (!tipo || !dimensioniImmagine(byte)) {
      throw new ErroreApi(415, 'FORMATO_NON_SUPPORTATO', 'L’immagine dev’essere un PNG o un JPEG.');
    }
    const id = nuovoIdImmagine(tipo);
    await archivio().carica(
      percorsoImmagineIntestazione(richiesta.identita.tenantId, id),
      byte,
      tipo === 'png' ? 'image/png' : 'image/jpeg',
    );
    void risposta.code(201);
    return { id, url: `/api/intestazione/immagini/${id}` };
  });

  app.get<{ Params: { id: string } }>('/api/intestazione/immagini/:id', async (richiesta, risposta) => {
    const { id } = richiesta.params;
    if (!E_ID_IMMAGINE.test(id)) throw ErroreApi.nonTrovato('Immagine inesistente.');
    let byte: Buffer;
    try {
      byte = await archivio().scarica(percorsoImmagineIntestazione(richiesta.identita.tenantId, id));
    } catch {
      throw ErroreApi.nonTrovato('Immagine inesistente.');
    }
    return risposta
      .header('Content-Type', id.endsWith('.png') ? 'image/png' : 'image/jpeg')
      .header('Cache-Control', 'private, max-age=86400')
      .send(byte);
  });

  /** Il documento d'esempio col contenuto che si sta componendo, prima di salvarlo. */
  app.post('/api/intestazione/anteprima', async (richiesta, risposta) => {
    const esito = schemaAnteprima.safeParse(richiesta.body ?? {});
    if (!esito.success) {
      throw ErroreApi.datiNonValidi('Intestazione o piè di pagina contengono qualcosa che i documenti non sanno riprodurre.');
    }
    const { tenantId } = richiesta.identita;
    const agenzia = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const r = await client.query<{ nome: string }>(`select nome from velia.tenant where id = $1`, [tenantId]);
      return r.rows[0]?.nome ?? '';
    });
    const titolo = 'Documento di esempio';
    const fasce = await fascePerGenerazione(archivio(), tenantId, esito.data, { titolo, agenzia });
    const file = await generaDocumento({
      formato: esito.data.formato,
      nome: 'anteprima-intestazione',
      titolo,
      testo: TESTO_ANTEPRIMA,
      fonti: ['Condizioni di Assicurazione (esempio) - art. 4, p. 12'],
      fasce,
    });
    return risposta
      .header('Content-Type', file.contentType)
      .header('Content-Length', file.byte.length)
      .header(
        'Content-Disposition',
        esito.data.formato === 'pdf' ? 'inline' : `attachment; filename="${file.nomeFile}"`,
      )
      .send(file.byte);
  });
}
