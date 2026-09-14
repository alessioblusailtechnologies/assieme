import type pg from 'pg';

import { configurazione } from '../../config.js';
import {
  percorsoDocumentoGenerato,
  type AllegatoBozza,
  type BozzaEmail,
  type DestinatarioBozza,
} from '../../contratto/conversazioni.js';
import {
  inviaEmail,
  nomeAllegato,
  type EmailDaInviare,
  type EsitoInvio,
  type OpzioniInvio,
} from '../../email/invio.js';
import { componiEmailLibera } from '../../generazione/email.js';
import type { ArchivioFile } from '../ingestion/archivio-file.js';

/**
 * L'email che un agente spedisce (14/09/2026, fase 4 di PIANO-AGENTI.md).
 *
 * In chat l'email parte dal clic dell'utente; per un agente il clic è la
 * conferma del piano, che elenca i destinatari. Qui arriva un destinatario
 * già scelto fra quelli: l'indirizzo si rilegge adesso dall'anagrafica (un
 * cliente che ha cambiato email la riceve al nuovo indirizzo), il mittente
 * è quello della piattaforma, la firma e le risposte sono di chi ha avviato
 * l'esecuzione o creato l'agente.
 *
 * Un tentativo ripetuto non rimanda niente: se dalla stessa esecuzione allo
 * stesso indirizzo è già partita un'email con lo stesso oggetto, si
 * restituisce quella. Ogni invio lascia la bozza `inviata` nella
 * conversazione, dove la scheda la racconta, e una riga nel registro.
 */

export interface TurnoDellEmail {
  tenantId: string;
  conversazioneId: string;
  /** La risposta che la manda: la scheda vive con lei. */
  messaggioId: string;
  esecuzioneId: string;
  /** Chi firma: chi ha avviato l'esecuzione a mano, o chi ha creato l'agente. */
  autoreId: string;
}

export interface EmailDellAgente {
  destinatario: DestinatarioBozza;
  oggetto: string;
  corpo: string;
  allegati: AllegatoBozza[];
}

type Invio = (email: EmailDaInviare, opzioni: OpzioniInvio) => Promise<EsitoInvio>;

interface RigaInviata {
  id: string;
  destinatario_tipo: DestinatarioBozza['tipo'];
  destinatario_id: string | null;
  destinatario_nome: string | null;
  a: string;
  oggetto: string;
  corpo: string;
  allegati: AllegatoBozza[];
  simulata: boolean | null;
  deciso_il: Date | null;
}

const COLONNE = `id, destinatario_tipo, destinatario_id, destinatario_nome, a, oggetto, corpo, allegati, simulata, deciso_il`;

const registro: OpzioniInvio['log'] = {
  info: (obj, msg) => console.log(`[email] ${msg}`, JSON.stringify(obj).slice(0, 400)),
  warn: (obj, msg) => console.warn(`[email] ${msg}`, JSON.stringify(obj).slice(0, 400)),
};

const senzaTrattiniLunghi = (testo: string): string => testo.replace(/\s[—–]\s/g, ' - ').replace(/[—–]/g, '-');

export async function inviaEmailDellAgente(
  db: pg.Pool,
  archivio: ArchivioFile,
  turno: TurnoDellEmail,
  email: EmailDellAgente,
  invia: Invio = inviaEmail,
): Promise<{ bozza: BozzaEmail; giaInviata: boolean }> {
  const a = await indirizzoDiOggi(db, turno.tenantId, email.destinatario);
  const oggetto = senzaTrattiniLunghi(email.oggetto).trim();
  const corpo = senzaTrattiniLunghi(email.corpo);

  const gia = await db.query<RigaInviata>(
    `select b.id, b.destinatario_tipo, b.destinatario_id, b.destinatario_nome, b.a, b.oggetto, b.corpo,
            b.allegati, b.simulata, b.deciso_il
       from velia.email_inviate i
       join velia.email_bozze b on b.id = i.bozza_id
      where i.esecuzione_id = $1 and lower(i.a) = lower($2) and i.oggetto = $3
      limit 1`,
    [turno.esecuzioneId, a, oggetto],
  );
  if (gia.rows[0]) return { bozza: versoBozza(gia.rows[0]), giaInviata: true };

  const firma = (
    await db.query<{ nome: string; cognome: string; email: string | null; agenzia: string }>(
      `select u.nome, u.cognome, u.email, t.nome as agenzia
         from velia.utenti u join velia.tenant t on t.id = u.tenant_id
        where u.id = $1 and u.tenant_id = $2`,
      [turno.autoreId, turno.tenantId],
    )
  ).rows[0];
  if (!firma) throw new Error('chi firma l’email non è più nell’agenzia.');

  const allegati = await Promise.all(
    email.allegati.map(async (x) => ({
      nome: nomeAllegato(x.nome, x.formato),
      contenuto: await archivio.scarica(percorsoDocumentoGenerato(turno.tenantId, x.id, x.formato)),
    })),
  );
  const composta = componiEmailLibera({
    oggetto,
    corpo,
    daParteDi: { nome: `${firma.nome} ${firma.cognome}`.trim(), agenzia: firma.agenzia },
  });
  const config = configurazione();
  const { simulata } = await invia(
    { a, ...composta, rispondiA: firma.email ?? undefined, allegati },
    {
      apiKey: config.RESEND_API_KEY,
      mittente: config.EMAIL_MITTENTE,
      produzione: process.env['NODE_ENV'] === 'production',
      simula: config.EMAIL_INVIO === 'simulato',
      log: registro,
    },
  );

  const d = email.destinatario;
  const r = await db.query<RigaInviata>(
    `insert into velia.email_bozze
       (tenant_id, conversazione_id, messaggio_id, destinatario_tipo, destinatario_id, destinatario_nome,
        a, oggetto, corpo, allegati, stato, simulata, deciso_il)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'inviata', $11, now())
     returning ${COLONNE}`,
    [
      turno.tenantId,
      turno.conversazioneId,
      turno.messaggioId,
      d.tipo,
      d.id ?? null,
      d.nome ?? null,
      a,
      oggetto,
      corpo,
      JSON.stringify(email.allegati),
      simulata,
    ],
  );
  const riga = r.rows[0]!;
  await db.query(
    `insert into velia.email_inviate
       (tenant_id, utente_id, origine, conversazione_id, bozza_id, esecuzione_id, a, oggetto, allegati, simulata)
     values ($1, null, 'agente', $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      turno.tenantId,
      turno.conversazioneId,
      riga.id,
      turno.esecuzioneId,
      a,
      oggetto,
      JSON.stringify(allegati.map((x) => x.nome)),
      simulata,
    ],
  );
  return { bozza: versoBozza(riga), giaInviata: false };
}

/** L'indirizzo di oggi: un collega o un cliente si rileggono, un indirizzo scritto resta quello. */
async function indirizzoDiOggi(db: pg.Pool, tenantId: string, d: DestinatarioBozza): Promise<string> {
  if (d.tipo === 'utente' && d.id) {
    const r = await db.query<{ email: string | null }>(
      `select email from velia.utenti where id = $1 and tenant_id = $2`,
      [d.id, tenantId],
    );
    const a = r.rows[0]?.email?.trim();
    if (!a) throw new Error(`${d.nome ?? 'il collega'} non ha più un indirizzo email.`);
    return a;
  }
  if (d.tipo === 'cliente' && d.id) {
    const r = await db.query<{ email: string | null }>(
      `select email from velia.clienti where id = $1 and tenant_id = $2`,
      [d.id, tenantId],
    );
    const a = r.rows[0]?.email?.trim();
    if (!a) throw new Error(`${d.nome ?? 'il cliente'} non ha più un indirizzo email in anagrafica.`);
    return a;
  }
  return d.a;
}

function versoBozza(r: RigaInviata): BozzaEmail {
  return {
    id: r.id,
    destinatario: {
      tipo: r.destinatario_tipo,
      ...(r.destinatario_id && { id: r.destinatario_id }),
      ...(r.destinatario_nome && { nome: r.destinatario_nome }),
      a: r.a,
    },
    oggetto: r.oggetto,
    corpo: r.corpo,
    allegati: r.allegati ?? [],
    stato: 'inviata',
    ...(r.simulata !== null && { simulata: r.simulata }),
    ...(r.deciso_il && { decisaIl: r.deciso_il.toISOString() }),
  };
}
