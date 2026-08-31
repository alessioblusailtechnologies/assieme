import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import {
  schemaAvvioEsecuzione,
  schemaModificheAgente,
  schemaNuovoAgente,
  type Agente,
  type AgenteRiepilogo,
  type EsecuzioneAgente,
  type EsecuzioneRiepilogo,
  type FonteAgente,
  type LimitiAgenti,
  type NuovaFonteAgente,
  type ParametroAgente,
  type Pianificazione,
  type RigaLog,
} from '../../contratto/agenti.js';
import type { Citazione } from '../../contratto/conversazioni.js';
import { ErroreApi } from '../../contratto/errori.js';
import { leggiDatoDiPiattaforma } from '../../dati.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { richiediCrediti } from '../crediti/rotte.js';
import { generaDocumento } from '../../generazione/generatore.js';
import { accoda } from '../../worker/coda.js';
import { ArchivioStorage, type ArchivioFile } from '../../worker/ingestion/archivio-file.js';
import {
  fontiDaCitazioni,
  identitaDelTenant,
  templatePerId,
  versoIdentitaGenerazione,
  versoRisolto,
  type RigaIdentita,
} from '../template/rotte.js';

/**
 * Gli agenti (RF-E-01…E-13): le rotte che il FE chiama da
 * `core/api/agenti-api.ts`, col comportamento fissato da `mocks/agenti.mjs`.
 *
 * Qui vive la definizione e il suo governo; l'esecuzione è del worker (job
 * `agente`) e si segue col polling dello storico — la notifica in-app del FE
 * nasce dal polling che vede la transizione, nessun canale in più. La
 * pianificazione non tocca l'API: il tick di pg_cron accoda da sé ciò che
 * `prossima_esecuzione` dice scaduto.
 *
 * I limiti (RF-E-09) si applicano due volte: esposti da `GET /api/agenti/
 * limiti` perché il FE li dica prima, imposti qui perché l'interfaccia non
 * è una garanzia — 409 sull'attivazione oltre soglia, 429 con
 * `ritentaTraSecondi` sulle esecuzioni concorrenti.
 */

interface RigaAgente {
  id: string;
  nome: string;
  descrizione: string;
  istruzioni: string;
  fonti: NuovaFonteAgente[];
  formato_output: Agente['formatoOutput'];
  template_output_id: string | null;
  parametri: ParametroAgente[];
  pian_frequenza: Pianificazione['frequenza'] | null;
  pian_orario: string | null;
  pian_giorno_settimana: number | null;
  pian_giorno_mese: number | null;
  pian_sospesa: boolean;
  attivo: boolean;
  creato_da: string | null;
  updated_at: Date;
}

interface RigaEsecuzione {
  id: string;
  agente_id: string;
  avviata_il: Date;
  conclusa_il: Date | null;
  modalita: 'manuale' | 'pianificata';
  stato: EsecuzioneAgente['stato'];
  parametri: Record<string, string> | null;
  tentativi: number;
  output: string | null;
  citazioni: Citazione[];
  template_output_id: string | null;
  log: RigaLog[];
  errore: string | null;
}

const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const agenteNonTrovato = (): ErroreApi => ErroreApi.nonTrovato('Agente inesistente.');

const SQL_AGENTE = `
  select id, nome, descrizione, istruzioni, fonti, formato_output, template_output_id,
         parametri, pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese,
         pian_sospesa, attivo, creato_da, updated_at
  from velia.agenti`;

const SQL_ESECUZIONE = `
  select id, agente_id, avviata_il, conclusa_il, modalita, stato, parametri, tentativi,
         output, citazioni, template_output_id, log, errore
  from velia.agenti_esecuzioni`;

/** La libreria dei predefiniti (RF-E-10): dato di piattaforma, già idratato. */
let predefiniti: unknown[] | undefined;
function libreriaPredefiniti(): unknown[] {
  predefiniti ??= JSON.parse(leggiDatoDiPiattaforma('agenti-predefiniti.json')) as unknown[];
  return predefiniti;
}

export interface OpzioniAgenti {
  /** Nei test: un archivio finto al posto dello Storage (per il documento su template). */
  archivio?: ArchivioFile;
}

export function registraRotteAgenti(app: FastifyInstance, opzioni: OpzioniAgenti = {}): void {
  let archivioStorage: ArchivioFile | undefined;
  const archivio = (): ArchivioFile => opzioni.archivio ?? (archivioStorage ??= new ArchivioStorage());

  /** L'elenco è la plancia: attivi prima, poi per nome. */
  app.get('/api/agenti', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<RigaAgente & { numero_fonti: number }>(
        `${SQL_AGENTE.replace('from velia.agenti', ', jsonb_array_length(fonti) as numero_fonti\n  from velia.agenti')}
         where tenant_id = $1
         order by attivo desc, nome collate "it-x-icu"`,
        [richiesta.identita.tenantId],
      );
      const elementi: AgenteRiepilogo[] = [];
      for (const riga of righe.rows) {
        const ultima = await client.query<RigaEsecuzione>(
          `${SQL_ESECUZIONE} where agente_id = $1 order by avviata_il desc limit 1`,
          [riga.id],
        );
        elementi.push({
          id: riga.id,
          nome: riga.nome,
          descrizione: riga.descrizione,
          attivo: riga.attivo,
          formatoOutput: riga.formato_output,
          ...(versoPianificazione(riga) && { pianificazione: versoPianificazione(riga)! }),
          numeroFonti: riga.numero_fonti,
          ...(ultima.rows[0] && { ultimaEsecuzione: versoRiepilogoEsecuzione(ultima.rows[0]) }),
        });
      }
      return { elementi, totale: elementi.length, pagina: 1, perPagina: elementi.length };
    });
  });

  app.get('/api/agenti/predefiniti', () => libreriaPredefiniti());

  /** RF-E-09: soglie e consumi correnti, da dire prima che l'errore arrivi. */
  app.get('/api/agenti/limiti', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, (client) =>
      limitiDelTenant(client, richiesta.identita.tenantId),
    );
  });

  /** Creazione (RF-E-01/02). Il limite si applica subito: l'agente nasce attivo. */
  app.post('/api/agenti', async (richiesta, risposta) => {
    const esito = schemaNuovoAgente.safeParse(richiesta.body ?? {});
    if (!esito.success) {
      throw new ErroreApi(
        400,
        'AGENTE_INCOMPLETO',
        'Servono almeno un nome, le istruzioni del task e una fonte documentale.',
      );
    }
    const nuovo = esito.data;

    const agente = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const limiti = await limitiDelTenant(client, richiesta.identita.tenantId);
      if (limiti.agentiAttivi >= limiti.agentiAttiviMax) {
        throw ErroreApi.conflitto(
          'LIMITE_AGENTI',
          `Il piano consente ${limiti.agentiAttiviMax} agenti attivi: disattivane uno per attivarne un altro.`,
        );
      }
      if (nuovo.pianificazione) verificaFrequenza(nuovo.pianificazione.frequenza, limiti.frequenzaMinima);
      const templateId =
        nuovo.templateOutputId && (await templatePerId(client, nuovo.templateOutputId))
          ? nuovo.templateOutputId
          : null;

      const p = nuovo.pianificazione;
      const r = await client.query<{ id: string }>(
        `insert into velia.agenti
           (tenant_id, nome, descrizione, istruzioni, fonti, formato_output, template_output_id,
            parametri, pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese,
            pian_sospesa, prossima_esecuzione, creato_da)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 case when $9::text is not null and not $13
                   then velia.prossimo_tick($9, $10, $11, $12) end,
                 $14)
         returning id`,
        [
          richiesta.identita.tenantId,
          nuovo.nome,
          nuovo.descrizione,
          nuovo.istruzioni,
          JSON.stringify(nuovo.fonti),
          nuovo.formatoOutput,
          templateId,
          JSON.stringify(nuovo.parametri),
          p?.frequenza ?? null,
          p?.orario ?? null,
          p?.giornoSettimana ?? null,
          p?.giornoMese ?? null,
          p?.sospesa ?? false,
          richiesta.identita.utenteId,
        ],
      );
      return (await agenteCompleto(client, richiesta.identita.tenantId, r.rows[0]!.id))!;
    });
    void risposta.code(201);
    return agente;
  });

  app.get<{ Params: { id: string } }>('/api/agenti/:id', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const agente = await agenteCompleto(client, richiesta.identita.tenantId, controllaId(richiesta.params.id));
      if (!agente) throw agenteNonTrovato();
      return agente;
    });
  });

  /** RF-E-01 (modifica, attiva/disattiva) e RF-E-04 (sospensione pianificazione). */
  app.patch<{ Params: { id: string } }>('/api/agenti/:id', async (richiesta) => {
    const esito = schemaModificheAgente.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche all’agente non valide.');
    const m = esito.data;

    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esistente = await righeAgente(client, richiesta.identita.tenantId, controllaId(richiesta.params.id));
      if (!esistente) throw agenteNonTrovato();

      const limiti = await limitiDelTenant(client, richiesta.identita.tenantId);
      if (m.attivo === true && !esistente.attivo && limiti.agentiAttivi >= limiti.agentiAttiviMax) {
        throw ErroreApi.conflitto(
          'LIMITE_AGENTI',
          `Il piano consente ${limiti.agentiAttiviMax} agenti attivi: disattivane uno per attivarne un altro.`,
        );
      }
      if (m.pianificazione) verificaFrequenza(m.pianificazione.frequenza, limiti.frequenzaMinima);

      const assegnazioni: string[] = ['updated_at = now()'];
      const parametri: unknown[] = [esistente.id, richiesta.identita.tenantId];
      const par = (v: unknown): string => {
        parametri.push(v);
        return `$${parametri.length}`;
      };
      if (m.nome !== undefined) assegnazioni.push(`nome = ${par(m.nome)}`);
      if (m.descrizione !== undefined) assegnazioni.push(`descrizione = ${par(m.descrizione)}`);
      if (m.istruzioni !== undefined) assegnazioni.push(`istruzioni = ${par(m.istruzioni)}`);
      if (m.fonti !== undefined) assegnazioni.push(`fonti = ${par(JSON.stringify(m.fonti))}::jsonb`);
      if (m.formatoOutput !== undefined) assegnazioni.push(`formato_output = ${par(m.formatoOutput)}`);
      if (m.templateOutputId !== undefined) {
        const valido =
          m.templateOutputId && (await templatePerId(client, m.templateOutputId)) ? m.templateOutputId : null;
        if (m.templateOutputId === null || valido) assegnazioni.push(`template_output_id = ${par(valido)}`);
      }
      if (m.parametri !== undefined) assegnazioni.push(`parametri = ${par(JSON.stringify(m.parametri))}::jsonb`);
      if (m.pianificazione !== undefined) {
        const p = m.pianificazione;
        assegnazioni.push(
          `pian_frequenza = ${par(p?.frequenza ?? null)}`,
          `pian_orario = ${par(p?.orario ?? null)}`,
          `pian_giorno_settimana = ${par(p?.giornoSettimana ?? null)}`,
          `pian_giorno_mese = ${par(p?.giornoMese ?? null)}`,
          `pian_sospesa = ${par(p?.sospesa ?? false)}`,
        );
      }
      if (m.attivo !== undefined) assegnazioni.push(`attivo = ${par(m.attivo)}`);

      await client.query(
        `update velia.agenti set ${assegnazioni.join(', ')} where id = $1 and tenant_id = $2`,
        parametri,
      );
      /* La prossima occorrenza segue SEMPRE lo stato dopo la modifica:
         sospendere o disattivare la azzera, riattivare la ricalcola. */
      await client.query(
        `update velia.agenti
         set prossima_esecuzione = case
           when attivo and not pian_sospesa and pian_frequenza is not null
             then velia.prossimo_tick(pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese)
           end
         where id = $1 and tenant_id = $2`,
        [esistente.id, richiesta.identita.tenantId],
      );
      return (await agenteCompleto(client, richiesta.identita.tenantId, esistente.id))!;
    });
  });

  app.delete<{ Params: { id: string } }>('/api/agenti/:id', async (richiesta, risposta) => {
    await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const r = await client.query(`delete from velia.agenti where id = $1 and tenant_id = $2`, [
        controllaId(richiesta.params.id),
        richiesta.identita.tenantId,
      ]);
      if (!r.rowCount) throw agenteNonTrovato();
    });
    return risposta.code(204).send();
  });

  /** La copia nasce disattiva e con la pianificazione sospesa: duplicare non raddoppia le esecuzioni di nascosto. */
  app.post<{ Params: { id: string } }>('/api/agenti/:id/duplica', async (richiesta, risposta) => {
    const copia = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const originale = await righeAgente(client, richiesta.identita.tenantId, controllaId(richiesta.params.id));
      if (!originale) throw agenteNonTrovato();
      const r = await client.query<{ id: string }>(
        `insert into velia.agenti
           (tenant_id, nome, descrizione, istruzioni, fonti, formato_output, template_output_id,
            parametri, pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese,
            pian_sospesa, prossima_esecuzione, attivo, creato_da)
         select tenant_id, $3, descrizione, istruzioni, fonti, formato_output, template_output_id,
                parametri, pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese,
                true, null, false, $4
         from velia.agenti where id = $1 and tenant_id = $2
         returning id`,
        [originale.id, richiesta.identita.tenantId, `Copia di ${originale.nome}`, richiesta.identita.utenteId],
      );
      return (await agenteCompleto(client, richiesta.identita.tenantId, r.rows[0]!.id))!;
    });
    void risposta.code(201);
    return copia;
  });

  /** Lo storico (RF-E-06), la più recente in cima. */
  app.get<{ Params: { id: string } }>('/api/agenti/:id/esecuzioni', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const agente = await righeAgente(client, richiesta.identita.tenantId, controllaId(richiesta.params.id));
      if (!agente) throw agenteNonTrovato();
      const righe = await client.query<RigaEsecuzione>(
        `${SQL_ESECUZIONE} where agente_id = $1 order by avviata_il desc, id`,
        [agente.id],
      );
      const elementi = righe.rows.map(versoRiepilogoEsecuzione);
      return { elementi, totale: elementi.length, pagina: 1, perPagina: elementi.length };
    });
  });

  /** Esecuzione manuale (RF-E-03/05): nasce in coda, si segue col polling. */
  app.post<{ Params: { id: string } }>('/api/agenti/:id/esecuzioni', async (richiesta, risposta) => {
    const corpo = schemaAvvioEsecuzione.safeParse(richiesta.body ?? {});
    if (!corpo.success) throw ErroreApi.datiNonValidi('Parametri di avvio non validi.');
    /* Pricing: dopo la forma, prima del lavoro — senza crediti non si parte. */
    await richiediCrediti(poolDb(), richiesta.identita.tenantId);

    const esecuzione = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const agente = await righeAgente(client, richiesta.identita.tenantId, controllaId(richiesta.params.id));
      if (!agente) throw agenteNonTrovato();
      if (!agente.attivo) {
        throw ErroreApi.conflitto('AGENTE_DISATTIVO', 'L’agente è disattivato: riattivalo per poterlo eseguire.');
      }
      const limiti = await limitiDelTenant(client, richiesta.identita.tenantId);
      if (limiti.esecuzioniInCorso >= limiti.esecuzioniConcorrentiMax) {
        throw new ErroreApi(
          429,
          'LIMITE_ESECUZIONI',
          `Il piano consente ${limiti.esecuzioniConcorrentiMax} esecuzioni contemporanee: attendi che una si concluda.`,
          20,
        );
      }

      const parametri: Record<string, string> = {};
      for (const parametro of agente.parametri) {
        const valore = corpo.data.parametri?.[parametro.chiave];
        if (valore) {
          if (parametro.tipo === 'documento') {
            const doc = await client.query(`select 1 from velia.documenti where id = $1`, [valore]);
            if (!doc.rowCount) {
              throw new ErroreApi(
                400,
                'PARAMETRO_NON_VALIDO',
                `Il documento indicato per «${parametro.etichetta}» non esiste negli archivi.`,
              );
            }
          }
          parametri[parametro.chiave] = valore;
        } else if (parametro.obbligatorio) {
          throw new ErroreApi(
            400,
            'PARAMETRI_MANCANTI',
            `Manca il parametro obbligatorio «${parametro.etichetta}».`,
          );
        }
      }

      const r = await client.query<RigaEsecuzione>(
        `insert into velia.agenti_esecuzioni (agente_id, tenant_id, modalita, parametri, log)
         values ($1, $2, 'manuale', $3, $4)
         returning id, agente_id, avviata_il, conclusa_il, modalita, stato, parametri, tentativi,
                   output, citazioni, template_output_id, log, errore`,
        [
          agente.id,
          richiesta.identita.tenantId,
          Object.keys(parametri).length ? JSON.stringify(parametri) : null,
          JSON.stringify([
            { istante: new Date().toISOString(), livello: 'info', messaggio: 'Esecuzione accodata.' },
          ]),
        ],
      );
      return versoEsecuzione(r.rows[0]!);
    });

    try {
      await accoda(
        poolDb(),
        'agente',
        { esecuzioneId: esecuzione.id, utenteId: richiesta.identita.utenteId },
        { tenantId: richiesta.identita.tenantId, utenteId: richiesta.identita.utenteId },
      );
    } catch (errore) {
      richiesta.log.error({ err: errore, esecuzioneId: esecuzione.id }, 'accodamento agente fallito');
      await poolDb().query(
        `update velia.agenti_esecuzioni
         set stato = 'fallita', conclusa_il = now(), errore = $2 where id = $1`,
        [esecuzione.id, 'Non è stato possibile avviare l’esecuzione: riprova.'],
      );
      throw new ErroreApi(500, 'ERRORE_INTERNO', 'Non è stato possibile avviare l’esecuzione: riprova.');
    }
    void risposta.code(201);
    return esecuzione;
  });

  /** L'esito pieno (RF-E-06/07). */
  app.get<{ Params: { id: string; eid: string } }>('/api/agenti/:id/esecuzioni/:eid', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const esecuzione = await esecuzionePerId(client, richiesta.identita, richiesta.params.id, richiesta.params.eid);
      return versoEsecuzione(esecuzione);
    });
  });

  /** Il documento sul template (RF-E-13), scaricabile dallo storico: la Fase 4 al lavoro. */
  app.get<{ Params: { id: string; eid: string } }>(
    '/api/agenti/:id/esecuzioni/:eid/documento',
    async (richiesta, risposta) => {
      const { esecuzione, agente, template, identita } = await conIdentita(
        poolDb(),
        richiesta.identita,
        async (client) => {
          const esecuzione = await esecuzionePerId(client, richiesta.identita, richiesta.params.id, richiesta.params.eid);
          return {
            esecuzione,
            agente: (await righeAgente(client, richiesta.identita.tenantId, richiesta.params.id))!,
            template: esecuzione.template_output_id
              ? await templatePerId(client, esecuzione.template_output_id)
              : undefined,
            identita: await identitaDelTenant(client, richiesta.identita.tenantId),
          };
        },
      );
      if (!template || !esecuzione.output || esecuzione.stato !== 'completata') {
        throw ErroreApi.nonTrovato('Questa esecuzione non ha prodotto un documento.');
      }
      const risolto = versoRisolto(template);
      const fileTemplate = await archivio().scarica(template.path_file);
      const logo = await caricaLogo(identita);
      const file = await generaDocumento({
        template: risolto,
        fileTemplate,
        titolo: `${agente.nome} - esito`,
        testo: esecuzione.output,
        fonti: fontiDaCitazioni(esecuzione.citazioni),
        identita: { ...versoIdentitaGenerazione(identita), ...(logo && { logo }) },
      });

      const slug = agente.nome
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return risposta
        .header('Content-Type', file.contentType)
        .header('Content-Length', file.byte.length)
        .header('Content-Disposition', `attachment; filename="${slug}-${esecuzione.id}.${template.formato}"`)
        .send(file.byte);
    },
  );

  async function caricaLogo(riga: RigaIdentita): Promise<{ byte: Buffer; tipo: string } | undefined> {
    if (!riga.logo_path || !riga.logo_tipo) return undefined;
    try {
      return { byte: await archivio().scarica(riga.logo_path), tipo: riga.logo_tipo };
    } catch {
      return undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Letture e forme
// ---------------------------------------------------------------------------

function controllaId(id: string): string {
  if (!E_UUID.test(id)) throw agenteNonTrovato();
  return id;
}

async function righeAgente(
  client: pg.ClientBase,
  tenantId: string,
  id: string,
): Promise<RigaAgente | undefined> {
  const r = await client.query<RigaAgente>(`${SQL_AGENTE} where id = $1 and tenant_id = $2`, [id, tenantId]);
  return r.rows[0];
}

function versoPianificazione(r: RigaAgente): Pianificazione | undefined {
  if (!r.pian_frequenza) return undefined;
  return {
    frequenza: r.pian_frequenza,
    orario: r.pian_orario ?? '08:00',
    ...(r.pian_giorno_settimana !== null && { giornoSettimana: r.pian_giorno_settimana }),
    ...(r.pian_giorno_mese !== null && { giornoMese: r.pian_giorno_mese }),
    sospesa: r.pian_sospesa,
  };
}

/** Le fonti escono idratate con l'etichetta pronta, come il contesto della chat. */
async function idrataFonti(
  client: pg.ClientBase,
  fonti: NuovaFonteAgente[],
): Promise<FonteAgente[]> {
  const idratate: FonteAgente[] = [];
  for (const fonte of fonti) {
    if (fonte.tipo === 'documenti-riferimento') {
      idratate.push({ ...fonte, etichetta: 'Documenti di riferimento dell’agenzia' });
    } else if (fonte.tipo === 'documento') {
      const r = await client.query<{ titolo: string }>(`select titolo from velia.documenti where id = $1`, [
        fonte.documentoId,
      ]);
      idratate.push({
        ...fonte,
        etichetta: r.rows[0]?.titolo ?? `Documento ${fonte.documentoId} (non più disponibile)`,
      });
    } else {
      const dettagli: string[] = [];
      if (fonte.compagniaId) {
        const r = await client.query<{ nome: string }>(`select nome from velia.compagnie where id = $1`, [
          fonte.compagniaId,
        ]);
        if (r.rows[0]) dettagli.push(r.rows[0].nome);
      }
      if (fonte.ramoId) {
        const r = await client.query<{ nome: string }>(`select nome from velia.rami where id = $1`, [fonte.ramoId]);
        if (r.rows[0]) dettagli.push(r.rows[0].nome);
      }
      if (fonte.soloPreferiti) dettagli.push('solo preferiti');
      const radice = fonte.archivio === 'pubblico' ? 'Archivio Pubblico' : 'Archivio Privato';
      idratate.push({ ...fonte, etichetta: dettagli.length ? `${radice} - ${dettagli.join(', ')}` : `${radice} - tutto` });
    }
  }
  return idratate;
}

async function agenteCompleto(
  client: pg.ClientBase,
  tenantId: string,
  id: string,
): Promise<Agente | undefined> {
  const riga = await righeAgente(client, tenantId, id);
  if (!riga) return undefined;
  return {
    id: riga.id,
    nome: riga.nome,
    descrizione: riga.descrizione,
    istruzioni: riga.istruzioni,
    fonti: await idrataFonti(client, riga.fonti),
    formatoOutput: riga.formato_output,
    ...(riga.template_output_id && { templateOutputId: riga.template_output_id }),
    parametri: riga.parametri,
    ...(versoPianificazione(riga) && { pianificazione: versoPianificazione(riga)! }),
    attivo: riga.attivo,
    creatoDa: riga.creato_da ?? '',
    aggiornatoIl: riga.updated_at.toISOString(),
  };
}

function documentoUrl(r: RigaEsecuzione): string | undefined {
  return r.stato === 'completata' && r.template_output_id && r.output
    ? `/api/agenti/${r.agente_id}/esecuzioni/${r.id}/documento`
    : undefined;
}

function versoRiepilogoEsecuzione(r: RigaEsecuzione): EsecuzioneRiepilogo {
  return {
    id: r.id,
    agenteId: r.agente_id,
    avviataIl: r.avviata_il.toISOString(),
    ...(r.conclusa_il && { conclusaIl: r.conclusa_il.toISOString() }),
    modalita: r.modalita,
    stato: r.stato,
    tentativi: r.tentativi,
    ...(documentoUrl(r) && { documentoGeneratoUrl: documentoUrl(r)! }),
    ...(r.errore && { errore: r.errore }),
  };
}

function versoEsecuzione(r: RigaEsecuzione): EsecuzioneAgente & { template_output_id?: string | null } {
  return {
    ...versoRiepilogoEsecuzione(r),
    ...(r.parametri && Object.keys(r.parametri).length && { parametri: r.parametri }),
    ...(r.output !== null && { output: r.output }),
    citazioni: r.citazioni,
    log: r.log,
  };
}

async function esecuzionePerId(
  client: pg.ClientBase,
  identita: Identita,
  agenteId: string,
  esecuzioneId: string,
): Promise<RigaEsecuzione> {
  const nonTrovata = new ErroreApi(404, 'NON_TROVATA', 'Esecuzione inesistente.');
  const agente = await righeAgente(client, identita.tenantId, controllaId(agenteId));
  if (!agente) throw agenteNonTrovato();
  if (!E_UUID.test(esecuzioneId)) throw nonTrovata;
  const r = await client.query<RigaEsecuzione>(`${SQL_ESECUZIONE} where id = $1 and agente_id = $2`, [
    esecuzioneId,
    agente.id,
  ]);
  if (!r.rows[0]) throw nonTrovata;
  return r.rows[0];
}

async function limitiDelTenant(client: pg.ClientBase, tenantId: string): Promise<LimitiAgenti> {
  const limiti = await client.query<{
    limite_agenti_attivi: number;
    limite_esecuzioni_concorrenti: number;
    frequenza_minima_agenti: LimitiAgenti['frequenzaMinima'];
  }>(
    `select limite_agenti_attivi, limite_esecuzioni_concorrenti, frequenza_minima_agenti
     from velia.tenant where id = $1`,
    [tenantId],
  );
  const l = limiti.rows[0];
  if (!l) throw ErroreApi.permessoNegato();
  const attivi = await client.query<{ n: number }>(
    `select count(*)::int as n from velia.agenti where tenant_id = $1 and attivo`,
    [tenantId],
  );
  const inCorso = await client.query<{ n: number }>(
    `select count(*)::int as n from velia.agenti_esecuzioni
     where tenant_id = $1 and stato in ('in-coda', 'in-corso')`,
    [tenantId],
  );
  return {
    agentiAttiviMax: l.limite_agenti_attivi,
    agentiAttivi: attivi.rows[0]?.n ?? 0,
    esecuzioniConcorrentiMax: l.limite_esecuzioni_concorrenti,
    esecuzioniInCorso: inCorso.rows[0]?.n ?? 0,
    frequenzaMinima: l.frequenza_minima_agenti,
  };
}

/** RF-E-09: la pianificazione più fitta ammessa dal piano. */
function verificaFrequenza(
  richiesta: LimitiAgenti['frequenzaMinima'],
  minima: LimitiAgenti['frequenzaMinima'],
): void {
  const fittezza = { giornaliera: 3, settimanale: 2, mensile: 1 } as const;
  if (fittezza[richiesta] > fittezza[minima]) {
    throw ErroreApi.conflitto(
      'LIMITE_FREQUENZA',
      `Il piano consente al massimo una pianificazione ${minima}.`,
    );
  }
}
