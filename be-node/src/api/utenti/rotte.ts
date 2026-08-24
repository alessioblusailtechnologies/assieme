import type { FastifyInstance } from 'fastify';

import { ErroreApi } from '../../contratto/errori.js';
import { schemaModificheUtente, schemaNuovoUtente, type Utente } from '../../contratto/utenti.js';
import { poolDb } from '../../db/pool.js';
import { clientServizio } from '../../db/supabase.js';
import { richiediAmministratore } from '../plugins/auth.js';

/**
 * Gestione utenti del tenant (RF-D-01): elenco, invito, ruolo, sospensione
 * — mai eliminazione (chi se ne va lascia conversazioni, tabelle e regole
 * firmate col suo nome, e un elenco che perde gli autori diventa un
 * archivio di orfani).
 *
 * Le credenziali vivono in Supabase Auth: l'invito crea l'utente Auth con
 * `app_metadata` (tenant e ruolo, che l'utente non può scrivere) e la riga
 * di profilo `invitato` — che diventa `attivo` al primo accesso (Fase 1).
 * Le rotte usano la connessione di sistema dopo la guardia da
 * amministratore: il profilo attraversa due mondi (Auth + `velia.utenti`)
 * e dev'essere il server a tenerli d'accordo.
 */

interface RigaUtente {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: 'operatore' | 'amministratore';
  tenant_id: string;
  stato: 'attivo' | 'invitato' | 'sospeso';
  ultimo_accesso: Date | null;
}

const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SQL_UTENTE = `select id, nome, cognome, email, ruolo, tenant_id, stato, ultimo_accesso
  from velia.utenti`;

export function registraRotteUtenti(app: FastifyInstance): void {
  app.get('/api/utenti', async (richiesta) => {
    richiediAmministratore(richiesta);
    const righe = await poolDb().query<RigaUtente>(
      `${SQL_UTENTE} where tenant_id = $1 order by cognome collate "it-x-icu", nome`,
      [richiesta.identita.tenantId],
    );
    return righe.rows.map(versoUtente);
  });

  /** L'invito: l'utente nasce `invitato` e diventa attivo al primo accesso. */
  app.post('/api/utenti', async (richiesta, risposta) => {
    richiediAmministratore(richiesta);
    const esito = schemaNuovoUtente.safeParse(richiesta.body ?? {});
    if (!esito.success) {
      throw new ErroreApi(400, 'DATI_MANCANTI', 'Servono nome, cognome ed email.');
    }
    const nuovo = esito.data;
    const email = nuovo.email.toLowerCase();

    const esistente = await poolDb().query(`select 1 from velia.utenti where lower(email) = $1`, [email]);
    if (esistente.rowCount) {
      throw ErroreApi.conflitto('EMAIL_ESISTENTE', 'Un utente con questa email esiste già nel tenant.');
    }

    /* Prima Auth, poi il profilo: un utente Auth senza profilo non entra
       (l'accesso lo respinge), un profilo senza Auth sarebbe una riga morta. */
    const metadata = { tenant_id: richiesta.identita.tenantId, ruolo: nuovo.ruolo };
    const auth = clientServizio().auth.admin;
    let utenteId: string;
    const invito = await auth.inviteUserByEmail(email);
    if (!invito.error && invito.data.user) {
      utenteId = invito.data.user.id;
      const aggiornato = await auth.updateUserById(utenteId, { app_metadata: metadata });
      if (aggiornato.error) {
        richiesta.log.error({ err: aggiornato.error }, 'app_metadata non scritti sull’invitato');
        throw new ErroreApi(500, 'ERRORE_INTERNO', 'Non è stato possibile completare l’invito: riprova.');
      }
    } else {
      /* L'email d'invito può non partire (SMTP non configurato, limiti):
         l'utente si crea comunque, entrerà quando riceverà le credenziali
         per altra via — meglio un invito senza email che nessun invito. */
      richiesta.log.warn({ err: invito.error }, 'invito via email non riuscito: creazione diretta');
      const creato = await auth.createUser({ email, email_confirm: true, app_metadata: metadata });
      if (creato.error || !creato.data.user) {
        richiesta.log.error({ err: creato.error }, 'creazione utente Auth fallita');
        throw new ErroreApi(500, 'ERRORE_INTERNO', 'Non è stato possibile creare l’invito: riprova.');
      }
      utenteId = creato.data.user.id;
    }

    const riga = await poolDb().query<RigaUtente>(
      `insert into velia.utenti (id, tenant_id, nome, cognome, email, ruolo, stato)
       values ($1, $2, $3, $4, $5, $6, 'invitato')
       returning id, nome, cognome, email, ruolo, tenant_id, stato, ultimo_accesso`,
      [utenteId, richiesta.identita.tenantId, nuovo.nome, nuovo.cognome, email, nuovo.ruolo],
    );
    void risposta.code(201);
    return versoUtente(riga.rows[0]!);
  });

  /**
   * Ruolo e stato — su sé stessi nessuno dei due: un amministratore che si
   * declassa o si sospende chiude la porta e butta la chiave (409).
   */
  app.patch<{ Params: { id: string } }>('/api/utenti/:id', async (richiesta) => {
    richiediAmministratore(richiesta);
    const esito = schemaModificheUtente.safeParse(richiesta.body ?? {});
    if (!esito.success) throw ErroreApi.datiNonValidi('Modifiche non valide.');
    const m = esito.data;

    if (!E_UUID.test(richiesta.params.id)) throw ErroreApi.nonTrovato('Utente inesistente.');
    const r = await poolDb().query<RigaUtente>(`${SQL_UTENTE} where id = $1 and tenant_id = $2`, [
      richiesta.params.id,
      richiesta.identita.tenantId,
    ]);
    const utente = r.rows[0];
    if (!utente) throw ErroreApi.nonTrovato('Utente inesistente.');
    if (utente.id === richiesta.identita.utenteId) {
      throw ErroreApi.conflitto(
        'SE_STESSO',
        'Non puoi modificare il tuo ruolo o il tuo stato: chiedi a un altro amministratore.',
      );
    }

    if (m.ruolo && m.ruolo !== utente.ruolo) {
      /* Il ruolo vive anche nel token (app_metadata): va cambiato in Auth,
         o al prossimo accesso tornerebbe quello di prima. Quello vecchio
         resta valido finché il token in corso non scade. */
      const aggiornato = await clientServizio().auth.admin.updateUserById(utente.id, {
        app_metadata: { tenant_id: utente.tenant_id, ruolo: m.ruolo },
      });
      if (aggiornato.error) {
        richiesta.log.error({ err: aggiornato.error }, 'ruolo non scritto in Auth');
        throw new ErroreApi(500, 'ERRORE_INTERNO', 'Non è stato possibile cambiare il ruolo: riprova.');
      }
    }

    const aggiornata = await poolDb().query<RigaUtente>(
      `update velia.utenti set ruolo = coalesce($3, ruolo), stato = coalesce($4, stato)
       where id = $1 and tenant_id = $2
       returning id, nome, cognome, email, ruolo, tenant_id, stato, ultimo_accesso`,
      [utente.id, richiesta.identita.tenantId, m.ruolo ?? null, m.stato ?? null],
    );
    return versoUtente(aggiornata.rows[0]!);
  });
}

function versoUtente(r: RigaUtente): Utente {
  return {
    id: r.id,
    nome: r.nome,
    cognome: r.cognome,
    email: r.email,
    ruolo: r.ruolo,
    tenantId: r.tenant_id,
    stato: r.stato,
    ...(r.ultimo_accesso && { ultimoAccesso: r.ultimo_accesso.toISOString() }),
  };
}
