import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type pg from 'pg';

import { idrataRiferimenti } from '../../agenti/riferimenti.js';
import {
  schemaModificheAgente,
  schemaNuovoAgente,
  testoLeggibile,
  type Agente,
  type AgentePredefinito,
  type AgenteRiepilogo,
  type EsecuzioneAgente,
  type EsecuzioneRiepilogo,
  type LimitiAgenti,
  type PianoAgente,
  type Pianificazione,
  type RigaLog,
  type StatoPiano,
} from '../../contratto/agenti.js';
import type { Citazione } from '../../contratto/conversazioni.js';
import { ErroreApi } from '../../contratto/errori.js';
import { leggiDatoDiPiattaforma } from '../../dati.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { accoda } from '../../worker/coda.js';
import { interpreteDallaConfigurazione, type InterpretePiano } from './interprete.js';
import { bloccoConferma, componiPiano } from './piano.js';

/**
 * Gli agenti (RF-E-01…E-13): le rotte che il FE chiama da
 * `core/api/agenti-api.ts`.
 *
 * Dal 14/09/2026 (PIANO-AGENTI.md, fase 3) la definizione è un nome, una
 * frequenza e una richiesta. Salvare una richiesta nuova la fa leggere a un
 * modello, che ne scrive il piano; il piano si conferma con
 * `POST /:id/conferma`, e solo un piano confermato parte, a mano o dal tick.
 * Cambiare la richiesta rimette il piano da leggere; cambiare quando corre
 * lo rimette da confermare.
 *
 * L'esecuzione è del worker (job `agente`) e si segue col polling dello
 * storico. I limiti (RF-E-09) si applicano qui, perché l'interfaccia non è
 * una garanzia: 409 sull'attivazione oltre soglia, 429 con
 * `ritentaTraSecondi` sulle esecuzioni concorrenti.
 */

interface RigaAgente {
  id: string;
  nome: string;
  richiesta: string;
  piano: PianoAgente | null;
  piano_stato: StatoPiano;
  piano_errore: string | null;
  piano_confermato_il: Date | null;
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
  tentativi: number;
  output: string | null;
  citazioni: Citazione[];
  log: RigaLog[];
  errore: string | null;
}

const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const agenteNonTrovato = (): ErroreApi => ErroreApi.nonTrovato('Agente inesistente.');
const limiteAgenti = (massimo: number): ErroreApi =>
  ErroreApi.conflitto(
    'LIMITE_AGENTI',
    `Il piano consente ${massimo} agenti attivi: disattivane uno per attivarne un altro.`,
  );

const SQL_AGENTE = `
  select id, nome, richiesta, piano, piano_stato, piano_errore, piano_confermato_il,
         pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese,
         pian_sospesa, attivo, creato_da, updated_at
  from velia.agenti`;

const SQL_ESECUZIONE = `
  select id, agente_id, avviata_il, conclusa_il, modalita, stato, tentativi, output, citazioni, log, errore
  from velia.agenti_esecuzioni`;

/** La libreria dei predefiniti (RF-E-10): dato di piattaforma. */
let predefiniti: AgentePredefinito[] | undefined;
function libreriaPredefiniti(): AgentePredefinito[] {
  predefiniti ??= JSON.parse(leggiDatoDiPiattaforma('agenti-predefiniti.json')) as AgentePredefinito[];
  return predefiniti;
}

export interface OpzioniAgenti {
  /** Nei test: chi legge la richiesta al posto del modello. */
  interprete?: InterpretePiano;
}

export function registraRotteAgenti(app: FastifyInstance, opzioni: OpzioniAgenti = {}): void {
  /* Il lettore vero si costruisce al primo uso: senza chiave resta assente,
     e il piano dice che la lettura non è disponibile. */
  let lettoreProprio: InterpretePiano | null | undefined;
  const interprete = (): InterpretePiano | undefined => {
    if (opzioni.interprete) return opzioni.interprete;
    lettoreProprio ??= interpreteDallaConfigurazione() ?? null;
    return lettoreProprio ?? undefined;
  };

  /**
   * La lettura della richiesta: fuori da ogni transazione, perché il modello
   * ci mette qualche secondo e una transazione aperta per tutto quel tempo
   * non serve a nessuno. Si scrive solo se la richiesta è ancora quella
   * letta: una correzione arrivata nel frattempo ha chiesto la sua lettura.
   * Se la lettura non riesce il piano di prima resta, con l'errore accanto.
   */
  async function leggiPiano(identita: Identita, id: string, log: FastifyBaseLogger): Promise<void> {
    const dati = await conIdentita(poolDb(), identita, async (client) => {
      const riga = await righeAgente(client, identita.tenantId, id);
      if (!riga) return undefined;
      const tenant = await client.query<{ nome: string }>(`select nome from velia.tenant where id = $1`, [
        identita.tenantId,
      ]);
      return {
        riga,
        agenzia: tenant.rows[0]?.nome ?? '',
        riferimenti: await idrataRiferimenti(client, identita.tenantId, riga.richiesta),
      };
    });
    if (!dati) return;
    const { riga, agenzia, riferimenti } = dati;

    const scrivi = (assegnazioni: string, valori: unknown[]) =>
      conIdentita(poolDb(), identita, (client) =>
        client.query(
          `update velia.agenti set ${assegnazioni} where id = $1 and tenant_id = $2 and richiesta = $3`,
          [id, identita.tenantId, riga.richiesta, ...valori],
        ),
      );

    const lettore = interprete();
    if (!lettore) {
      await scrivi('piano_errore = $4', ['La lettura della richiesta non è disponibile su questo ambiente.']);
      return;
    }
    try {
      const pianificazione = versoPianificazione(riga);
      const grezzo = await lettore.interpreta({
        agenzia,
        nome: riga.nome,
        richiesta: testoLeggibile(riga.richiesta, riferimenti, { marcatori: true }),
        riferimenti: riferimenti.map(({ tipo, chiave, titolo }) => ({ tipo, chiave, titolo })),
        quando: pianificazione ? descriviPianificazione(pianificazione) : undefined,
      });
      const piano = await componiPiano(
        poolDb(),
        { tenantId: identita.tenantId, utenteId: identita.utenteId },
        grezzo,
        riferimenti,
      );
      await scrivi(
        `piano = $4::jsonb, piano_stato = 'da-confermare', piano_errore = null,
         piano_confermato_da = null, piano_confermato_il = null, prossima_esecuzione = null`,
        [JSON.stringify(piano)],
      );
    } catch (errore) {
      log.warn({ err: errore, agenteId: id }, 'lettura del piano dell’agente non riuscita');
      await scrivi('piano_errore = $4', ['Non sono riuscito a leggere la richiesta: riprova fra poco.']);
    }
  }

  /** L'elenco è la plancia: attivi prima, poi per nome. */
  app.get('/api/agenti', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<RigaAgente>(
        `${SQL_AGENTE} where tenant_id = $1 order by attivo desc, nome collate "it-x-icu"`,
        [richiesta.identita.tenantId],
      );
      const elementi: AgenteRiepilogo[] = [];
      for (const riga of righe.rows) {
        const ultima = await client.query<RigaEsecuzione>(
          `${SQL_ESECUZIONE} where agente_id = $1 order by avviata_il desc limit 1`,
          [riga.id],
        );
        const pianificazione = versoPianificazione(riga);
        elementi.push({
          id: riga.id,
          nome: riga.nome,
          ...(riga.piano?.obiettivo && { obiettivo: riga.piano.obiettivo }),
          attivo: riga.attivo,
          pianoStato: riga.piano_stato,
          ...(pianificazione && { pianificazione }),
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

  /**
   * Creazione (RF-E-01/02): l'agente nasce attivo ma col piano da leggere;
   * la risposta arriva col piano già scritto, o con il motivo per cui non c'è.
   */
  app.post('/api/agenti', async (richiesta, risposta) => {
    const esito = schemaNuovoAgente.safeParse(richiesta.body ?? {});
    if (!esito.success) {
      throw new ErroreApi(400, 'AGENTE_INCOMPLETO', 'Servono un nome e la richiesta.');
    }
    const nuovo = esito.data;
    const { identita } = richiesta;

    const id = await conIdentita(poolDb(), identita, async (client) => {
      const limiti = await limitiDelTenant(client, identita.tenantId);
      if (limiti.agentiAttivi >= limiti.agentiAttiviMax) throw limiteAgenti(limiti.agentiAttiviMax);
      if (nuovo.pianificazione) verificaFrequenza(nuovo.pianificazione.frequenza, limiti.frequenzaMinima);

      const p = nuovo.pianificazione;
      const r = await client.query<{ id: string }>(
        `insert into velia.agenti
           (tenant_id, nome, richiesta, pian_frequenza, pian_orario, pian_giorno_settimana,
            pian_giorno_mese, pian_sospesa, creato_da)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning id`,
        [
          identita.tenantId,
          nuovo.nome,
          nuovo.richiesta,
          p?.frequenza ?? null,
          p?.orario ?? null,
          p?.giornoSettimana ?? null,
          p?.giornoMese ?? null,
          p?.sospesa ?? false,
          identita.utenteId,
        ],
      );
      return r.rows[0]!.id;
    });

    await leggiPiano(identita, id, richiesta.log);
    void risposta.code(201);
    return conIdentita(poolDb(), identita, async (client) => (await agenteCompleto(client, identita.tenantId, id))!);
  });

  app.get<{ Params: { id: string } }>('/api/agenti/:id', async (richiesta) => {
    return conIdentita(poolDb(), richiesta.identita, async (client) => {
      const agente = await agenteCompleto(client, richiesta.identita.tenantId, controllaId(richiesta.params.id));
      if (!agente) throw agenteNonTrovato();
      return agente;
    });
  });

  /**
   * RF-E-01 (modifica, attiva/disattiva) e RF-E-04 (sospensione). Una
   * richiesta diversa si rilegge e rimette il piano da confermare; una
   * cadenza diversa lo rimette da confermare senza rileggerlo, perché quando
   * corre fa parte di ciò che si conferma. Sospendere e riprendere no.
   */
  app.patch<{ Params: { id: string } }>('/api/agenti/:id', async (richiesta) => {
    const esito = schemaModificheAgente.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche all’agente non valide.');
    const m = esito.data;
    const { identita } = richiesta;

    const { id, daRileggere } = await conIdentita(poolDb(), identita, async (client) => {
      const esistente = await righeAgente(client, identita.tenantId, controllaId(richiesta.params.id));
      if (!esistente) throw agenteNonTrovato();

      const limiti = await limitiDelTenant(client, identita.tenantId);
      if (m.attivo === true && !esistente.attivo && limiti.agentiAttivi >= limiti.agentiAttiviMax) {
        throw limiteAgenti(limiti.agentiAttiviMax);
      }
      if (m.pianificazione) verificaFrequenza(m.pianificazione.frequenza, limiti.frequenzaMinima);

      const nuovaRichiesta = m.richiesta !== undefined && m.richiesta !== esistente.richiesta;
      const nuovaCadenza =
        m.pianificazione !== undefined && !stessaCadenza(versoPianificazione(esistente), m.pianificazione);

      const assegnazioni: string[] = ['updated_at = now()'];
      const parametri: unknown[] = [esistente.id, identita.tenantId];
      const par = (v: unknown): string => {
        parametri.push(v);
        return `$${parametri.length}`;
      };
      if (m.nome !== undefined) assegnazioni.push(`nome = ${par(m.nome)}`);
      if (nuovaRichiesta) {
        assegnazioni.push(
          `richiesta = ${par(m.richiesta)}`,
          'piano = null',
          `piano_stato = 'non-letto'`,
          'piano_errore = null',
          'piano_confermato_da = null',
          'piano_confermato_il = null',
        );
      } else if (nuovaCadenza) {
        assegnazioni.push(
          `piano_stato = case when piano_stato = 'confermato' then 'da-confermare' else piano_stato end`,
          'piano_confermato_da = null',
          'piano_confermato_il = null',
        );
      }
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
      await aggiornaProssima(client, esistente.id, identita.tenantId);
      return { id: esistente.id, daRileggere: nuovaRichiesta };
    });

    if (daRileggere) await leggiPiano(identita, id, richiesta.log);
    return conIdentita(poolDb(), identita, async (client) => (await agenteCompleto(client, identita.tenantId, id))!);
  });

  /** «Rileggi la richiesta»: un piano nuovo, da confermare di nuovo. */
  app.post<{ Params: { id: string } }>('/api/agenti/:id/piano', async (richiesta) => {
    const id = controllaId(richiesta.params.id);
    const { identita } = richiesta;
    const esiste = await conIdentita(poolDb(), identita, (client) => righeAgente(client, identita.tenantId, id));
    if (!esiste) throw agenteNonTrovato();
    await leggiPiano(identita, id, richiesta.log);
    return conIdentita(poolDb(), identita, async (client) => (await agenteCompleto(client, identita.tenantId, id))!);
  });

  /**
   * «Conferma e attiva»: da qui l'agente può partire, a mano e dal tick. Si
   * conferma solo un piano letto e con ogni destinatario risolto; confermare
   * attiva, e l'attivazione rispetta il limite del piano commerciale.
   */
  app.post<{ Params: { id: string } }>('/api/agenti/:id/conferma', async (richiesta) => {
    const id = controllaId(richiesta.params.id);
    const { identita } = richiesta;
    return conIdentita(poolDb(), identita, async (client) => {
      const agente = await righeAgente(client, identita.tenantId, id);
      if (!agente) throw agenteNonTrovato();
      if (agente.piano_stato === 'confermato') {
        throw ErroreApi.conflitto('PIANO_GIA_CONFERMATO', 'Il piano è già confermato.');
      }
      if (agente.piano_stato !== 'da-confermare' || !agente.piano) {
        throw ErroreApi.conflitto('PIANO_NON_LETTO', 'Il piano non è ancora pronto: prima leggi la richiesta.');
      }
      const blocco = bloccoConferma(agente.piano);
      if (blocco) throw ErroreApi.conflitto('PIANO_BLOCCATO', blocco);
      if (!agente.attivo) {
        const limiti = await limitiDelTenant(client, identita.tenantId);
        if (limiti.agentiAttivi >= limiti.agentiAttiviMax) throw limiteAgenti(limiti.agentiAttiviMax);
      }

      await client.query(
        `update velia.agenti
            set piano_stato = 'confermato', piano_confermato_da = $3, piano_confermato_il = now(), attivo = true
          where id = $1 and tenant_id = $2`,
        [agente.id, identita.tenantId, identita.utenteId],
      );
      await aggiornaProssima(client, agente.id, identita.tenantId);
      return (await agenteCompleto(client, identita.tenantId, agente.id))!;
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

  /**
   * La copia nasce disattiva, con la pianificazione sospesa e il piano da
   * confermare: duplicare non raddoppia le esecuzioni, né le email, di nascosto.
   */
  app.post<{ Params: { id: string } }>('/api/agenti/:id/duplica', async (richiesta, risposta) => {
    const copia = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const originale = await righeAgente(client, richiesta.identita.tenantId, controllaId(richiesta.params.id));
      if (!originale) throw agenteNonTrovato();
      const r = await client.query<{ id: string }>(
        `insert into velia.agenti
           (tenant_id, nome, richiesta, piano, piano_stato, pian_frequenza, pian_orario,
            pian_giorno_settimana, pian_giorno_mese, pian_sospesa, prossima_esecuzione, attivo, creato_da)
         select tenant_id, $3, richiesta, piano,
                case when piano is null then 'non-letto' else 'da-confermare' end,
                pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese, true, null, false, $4
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

  /** Esecuzione manuale (RF-E-03): solo col piano confermato; nasce in coda, si segue col polling. */
  app.post<{ Params: { id: string } }>('/api/agenti/:id/esecuzioni', async (richiesta, risposta) => {
    const esecuzione = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const agente = await righeAgente(client, richiesta.identita.tenantId, controllaId(richiesta.params.id));
      if (!agente) throw agenteNonTrovato();
      if (!agente.attivo) {
        throw ErroreApi.conflitto('AGENTE_DISATTIVO', 'L’agente è disattivato: riattivalo per poterlo eseguire.');
      }
      if (agente.piano_stato !== 'confermato') {
        throw ErroreApi.conflitto(
          'PIANO_DA_CONFERMARE',
          'Il piano dell’agente non è confermato: confermalo prima di eseguirlo.',
        );
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

      const r = await client.query<RigaEsecuzione>(
        `insert into velia.agenti_esecuzioni (agente_id, tenant_id, modalita, log)
         values ($1, $2, 'manuale', $3)
         returning id, agente_id, avviata_il, conclusa_il, modalita, stato, tentativi,
                   output, citazioni, log, errore`,
        [
          agente.id,
          richiesta.identita.tenantId,
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

/** Quando corre, lasciando fuori la sospensione: sospendere non cambia il patto. */
function stessaCadenza(
  prima: Pianificazione | undefined,
  dopo: {
    frequenza: Pianificazione['frequenza'];
    orario: string;
    giornoSettimana?: number | undefined;
    giornoMese?: number | undefined;
  } | null,
): boolean {
  if (!prima || !dopo) return !prima && !dopo;
  return (
    prima.frequenza === dopo.frequenza &&
    prima.orario === dopo.orario &&
    (prima.giornoSettimana ?? null) === (dopo.giornoSettimana ?? null) &&
    (prima.giornoMese ?? null) === (dopo.giornoMese ?? null)
  );
}

const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

/** Quando corre, a parole: per il lettore del piano. */
function descriviPianificazione(p: Pianificazione): string {
  switch (p.frequenza) {
    case 'giornaliera':
      return `ogni giorno alle ${p.orario}`;
    case 'settimanale':
      return `ogni ${GIORNI[(p.giornoSettimana ?? 1) - 1]} alle ${p.orario}`;
    case 'mensile':
      return `il giorno ${p.giornoMese ?? 1} di ogni mese alle ${p.orario}`;
  }
}

/**
 * La prossima occorrenza segue SEMPRE lo stato dopo la scrittura: c'è solo
 * per un agente attivo, non sospeso, pianificato e col piano confermato.
 */
async function aggiornaProssima(client: pg.ClientBase, id: string, tenantId: string): Promise<void> {
  await client.query(
    `update velia.agenti
        set prossima_esecuzione = case
          when attivo and not pian_sospesa and pian_frequenza is not null and piano_stato = 'confermato'
            then velia.prossimo_tick(pian_frequenza, pian_orario, pian_giorno_settimana, pian_giorno_mese)
          end
      where id = $1 and tenant_id = $2`,
    [id, tenantId],
  );
}

async function agenteCompleto(
  client: pg.ClientBase,
  tenantId: string,
  id: string,
): Promise<Agente | undefined> {
  const riga = await righeAgente(client, tenantId, id);
  if (!riga) return undefined;
  const pianificazione = versoPianificazione(riga);
  const blocco = riga.piano_stato === 'da-confermare' ? bloccoConferma(riga.piano) : undefined;
  return {
    id: riga.id,
    nome: riga.nome,
    richiesta: riga.richiesta,
    riferimenti: await idrataRiferimenti(client, tenantId, riga.richiesta),
    ...(riga.piano && { piano: riga.piano }),
    pianoStato: riga.piano_stato,
    ...(riga.piano_errore && { pianoErrore: riga.piano_errore }),
    ...(riga.piano_confermato_il && { pianoConfermatoIl: riga.piano_confermato_il.toISOString() }),
    ...(blocco && { bloccoConferma: blocco }),
    ...(pianificazione && { pianificazione }),
    attivo: riga.attivo,
    creatoDa: riga.creato_da ?? '',
    aggiornatoIl: riga.updated_at.toISOString(),
  };
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
    ...(r.errore && { errore: r.errore }),
  };
}

function versoEsecuzione(r: RigaEsecuzione): EsecuzioneAgente {
  return {
    ...versoRiepilogoEsecuzione(r),
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
