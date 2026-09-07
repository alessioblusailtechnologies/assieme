import type { FastifyInstance } from 'fastify';

import { configurazione } from '../../config.js';
import { ErroreApi } from '../../contratto/errori.js';
import {
  permessiPerRuolo,
  schemaAccesso,
  schemaAccessoOspite,
  schemaAggiorna,
  type EsitoAccesso,
  type LottoSaluti,
  type Sessione,
  type SessioneOspite,
} from '../../contratto/sessione.js';
import { conIdentita, type Identita } from '../../db/identita.js';
import { poolDb } from '../../db/pool.js';
import { risolviOspite } from './ospite.js';
import { ServizioSaluti } from './saluti.js';

export interface OpzioniSessione {
  /** Nei test: il servizio dei saluti con un generatore finto. */
  saluti?: ServizioSaluti;
}

/** La riga di profilo con il suo tenant, come esce dalla query. */
interface RigaProfilo {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  ruolo: Identita['ruolo'];
  stato: 'invitato' | 'attivo' | 'sospeso';
  ultimo_accesso: Date | null;
  tenant_id: string;
  tenant_nome: string;
  tenant_piano: Sessione['tenant']['piano'];
  tenant_logo_url: string | null;
}

const SQL_PROFILO = `
  select u.id, u.nome, u.cognome, u.email, u.ruolo, u.stato, u.ultimo_accesso,
         t.id as tenant_id, t.nome as tenant_nome, t.piano as tenant_piano,
         null as tenant_logo_url
  from velia.utenti u
  join velia.tenant t on t.id = u.tenant_id
  where u.id = $1`;

function versoSessione(riga: RigaProfilo, saluti: LottoSaluti | undefined): Sessione {
  return {
    utente: {
      id: riga.id,
      nome: riga.nome,
      cognome: riga.cognome,
      email: riga.email,
      ruolo: riga.ruolo,
      tenantId: riga.tenant_id,
      ...(riga.ultimo_accesso && { ultimoAccesso: riga.ultimo_accesso.toISOString() }),
    },
    tenant: {
      id: riga.tenant_id,
      nome: riga.tenant_nome,
      piano: riga.tenant_piano,
      ...(riga.tenant_logo_url && { logoUrl: riga.tenant_logo_url }),
    },
    permessi: permessiPerRuolo(riga.ruolo),
    ...(saluti && { saluti }),
  };
}

/** La risposta del token endpoint di Supabase Auth (i campi che usiamo). */
interface TokenSupabase {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string };
}

async function chiediToken(
  corpo: Record<string, string>,
  grantType: 'password' | 'refresh_token',
): Promise<TokenSupabase | undefined> {
  const config = configurazione();
  const risposta = await fetch(
    new URL(`/auth/v1/token?grant_type=${grantType}`, config.SUPABASE_URL),
    {
      method: 'POST',
      headers: { apikey: config.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    },
  );
  if (!risposta.ok) return undefined;
  return (await risposta.json()) as TokenSupabase;
}

/**
 * Accesso e sessione — il pezzo che il piano FE aveva dichiarato fuori
 * perimetro e che entra ora, come primo pezzo della Fase 1.
 *
 * `GET /api/sessione` mantiene la promessa scritta in `SessioneStore`:
 * cambia solo chi risponde, la forma è quella della fixture del mock.
 */
export function registraRotteSessione(app: FastifyInstance, opzioni: OpzioniSessione = {}): void {
  /* I saluti della home viaggiano con la sessione (28/08/2026): così ci
     sono al primo dipinto, senza una chiamata in più. Il lotto si rinfresca
     in background quando è scaduto; la risposta non aspetta. */
  const saluti = opzioni.saluti ?? new ServizioSaluti();

  /**
   * Login. La verifica delle credenziali la fa Supabase Auth; il profilo e
   * il suo stato li governa il nostro schema:
   * - `sospeso` → 403 senza token: sospendere significa non entrare più;
   * - `invitato` → diventa `attivo` al primo accesso (contratto Fase 5 FE);
   * - `ultimo_accesso` si aggiorna a ogni login.
   */
  app.post('/api/sessione/accesso', async (richiesta) => {
    const dati = schemaAccesso.safeParse(richiesta.body);
    if (!dati.success) {
      throw ErroreApi.datiNonValidi('Email e password sono obbligatorie.');
    }

    const token = await chiediToken(dati.data, 'password');
    if (!token) {
      throw new ErroreApi(401, 'CREDENZIALI_NON_VALIDE', 'Email o password non corretti.');
    }

    const db = poolDb();
    const profili = await db.query<RigaProfilo>(SQL_PROFILO, [token.user.id]);
    const profilo = profili.rows[0];
    if (!profilo) {
      // Utente Auth senza profilo VELIA: mal provisionato (o di un'altra
      // applicazione di questo progetto condiviso). Nessun accesso.
      richiesta.log.warn({ sub: token.user.id }, 'accesso senza profilo velia');
      throw ErroreApi.permessoNegato();
    }
    if (profilo.stato === 'sospeso') {
      throw new ErroreApi(403, 'UTENTE_SOSPESO', 'Questo account è stato sospeso.');
    }

    const adesso = new Date();
    await db.query(
      `update velia.utenti set stato = 'attivo', ultimo_accesso = $2 where id = $1`,
      [profilo.id, adesso],
    );
    profilo.stato = 'attivo';
    profilo.ultimo_accesso = adesso;

    const lotto = await ServizioSaluti.leggi(db);
    saluti.rinfresca(lotto, richiesta.log);

    const esito: EsitoAccesso = {
      tokenAccesso: token.access_token,
      tokenAggiornamento: token.refresh_token,
      scadeInSecondi: token.expires_in,
      sessione: versoSessione(profilo, lotto),
    };
    return esito;
  });

  /**
   * L'ingresso del cliente: il token del link, e nient'altro.
   *
   * Non restituisce credenziali perché non ce ne sono da restituire — il
   * token che il cliente ha già **è** la credenziale, e la manda a ogni
   * richiesta con lo schema `Ospite`. Questa rotta serve a due cose: dire
   * se il link vale ancora, e dare alla pagina il nome dell'agenzia da
   * scrivere in testa.
   *
   * Non aggiorna `ultimo_accesso` e non attiva niente: un ospite non è
   * personale dell'agenzia, e la sua utenza non ha uno stato da far
   * evolvere. Quello che c'è da governare è la chat, non la persona.
   */
  app.post('/api/sessione/ospite', async (richiesta) => {
    const dati = schemaAccessoOspite.safeParse(richiesta.body);
    if (!dati.success) throw ErroreApi.nonAutenticato('Questo collegamento non è più valido.');

    const db = poolDb();
    const { chatId, identita } = await risolviOspite(db, dati.data.token);

    /* Il logo resta fuori come in `SQL_PROFILO`, dove è `null`: non è ancora
       servito da nessuna parte, e una sola implementazione arriverà quando
       servirà davvero — meglio di due che divergono. */
    const righe = await db.query<{
      titolo: string;
      nome: string;
      cognome: string;
      tenant_nome: string;
    }>(
      `select k.titolo, u.nome, u.cognome, t.nome as tenant_nome
         from velia.chat_clienti k
         join velia.utenti u on u.id = k.ospite_id
         join velia.tenant t on t.id = k.tenant_id
        where k.id = $1`,
      [chatId],
    );
    const riga = righe.rows[0];
    if (!riga) throw ErroreApi.nonAutenticato('Questo collegamento non è più valido.');

    const esito: SessioneOspite = {
      chat: { id: chatId, titolo: riga.titolo },
      ospite: { id: identita.utenteId, nome: riga.nome, cognome: riga.cognome },
      agenzia: { id: identita.tenantId, nome: riga.tenant_nome },
    };
    return esito;
  });

  /** Rinnovo dei token: il refresh token di Supabase ruota a ogni uso. */
  app.post('/api/sessione/aggiorna', async (richiesta) => {
    const dati = schemaAggiorna.safeParse(richiesta.body);
    if (!dati.success) {
      throw ErroreApi.datiNonValidi('Token di aggiornamento mancante.');
    }

    const token = await chiediToken({ refresh_token: dati.data.tokenAggiornamento }, 'refresh_token');
    if (!token) {
      throw ErroreApi.nonAutenticato('Sessione scaduta, ripetere l’accesso.');
    }
    return {
      tokenAccesso: token.access_token,
      tokenAggiornamento: token.refresh_token,
      scadeInSecondi: token.expires_in,
    };
  });

  /**
   * La sessione corrente. Passa da `conIdentita`: la riga del profilo torna
   * attraverso la RLS, non nonostante — il primo endpoint vero è anche la
   * prima dimostrazione d'uso del meccanismo.
   */
  app.get('/api/sessione', async (richiesta) => {
    const { profilo, lotto } = await conIdentita(poolDb(), richiesta.identita, async (client) => {
      const righe = await client.query<RigaProfilo>(SQL_PROFILO, [richiesta.identita.utenteId]);
      return { profilo: righe.rows[0], lotto: await ServizioSaluti.leggi(client) };
    });
    if (!profilo) throw ErroreApi.permessoNegato();
    saluti.rinfresca(lotto, richiesta.log);
    return versoSessione(profilo, lotto);
  });
}
