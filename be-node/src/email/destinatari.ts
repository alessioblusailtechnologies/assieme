import type pg from 'pg';

import type { DestinatarioBozza } from '../contratto/conversazioni.js';
import { schedaCliente } from '../worker/motore/clienti.js';

/**
 * A chi va un'email, detto a parole (14/09/2026): «me», un indirizzo, il nome
 * di un collega o di un cliente dell'anagrafica.
 *
 * Lo usa lo strumento `prepara_email` della chat, e lo userà il piano di un
 * agente: in tutti e due i casi l'indirizzo **non lo sceglie il modello**.
 * Viene dall'anagrafica o dalle parole dell'utente, e quando non si trova non
 * si indovina: il motivo torna indietro, scritto per il modello che deve
 * girarlo all'utente.
 */

export type EsitoDestinatario =
  | { esito: 'trovato'; destinatario: DestinatarioBozza }
  | { esito: 'non-trovato'; motivo: string };

const E_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

interface RigaUtente {
  id: string;
  nome: string;
  cognome: string;
  email: string | null;
}

const nomeUtente = (u: RigaUtente): string => `${u.nome} ${u.cognome}`.trim();

export async function risolviDestinatario(
  db: pg.Pool,
  chi: { tenantId: string; utenteId: string },
  richiesta: string,
): Promise<EsitoDestinatario> {
  const testo = richiesta.trim();
  if (!testo) return { esito: 'non-trovato', motivo: 'Manca il destinatario.' };

  if (/^(me|a me|io|me stess[oa])$/i.test(testo)) {
    const u = await db.query<RigaUtente>(
      `select id, nome, cognome, email from velia.utenti where id = $1 and tenant_id = $2`,
      [chi.utenteId, chi.tenantId],
    );
    const utente = u.rows[0];
    if (!utente?.email) return { esito: 'non-trovato', motivo: 'Non trovo l’indirizzo email dell’utente: chiediglielo.' };
    return {
      esito: 'trovato',
      destinatario: { tipo: 'utente', id: utente.id, nome: nomeUtente(utente), a: utente.email },
    };
  }

  if (E_EMAIL.test(testo)) return { esito: 'trovato', destinatario: { tipo: 'indirizzo', a: testo } };

  /* Un collega, per nome e cognome nell'uno o nell'altro ordine. L'ospite
     di una chat cliente è un utente del tenant, ma non un collega. */
  const colleghi = await db.query<RigaUtente>(
    `select id, nome, cognome, email from velia.utenti
      where tenant_id = $1 and ruolo <> 'ospite' and email is not null
        and (lower(trim(nome || ' ' || cognome)) = lower($2) or lower(trim(cognome || ' ' || nome)) = lower($2))
      limit 2`,
    [chi.tenantId, testo],
  );
  if (colleghi.rows.length > 1) {
    return {
      esito: 'non-trovato',
      motivo: `Nell’agenzia c’è più di un collega che si chiama «${testo}»: chiedi all’utente l’indirizzo.`,
    };
  }
  const collega = colleghi.rows[0];
  if (collega?.email) {
    return {
      esito: 'trovato',
      destinatario: { tipo: 'utente', id: collega.id, nome: nomeUtente(collega), a: collega.email },
    };
  }

  const esito = await schedaCliente(db, chi.tenantId, testo);
  if (esito.esito === 'ambiguo') {
    return {
      esito: 'non-trovato',
      motivo: `Più clienti somigliano a «${testo}»: ${esito.candidati.map((c) => `«${c.nome}»`).join(', ')}. Chiedi all’utente quale, invece di sceglierne uno.`,
    };
  }
  if (esito.esito === 'assente') {
    return {
      esito: 'non-trovato',
      motivo: `«${testo}» non è un indirizzo email, né un collega, né un cliente in anagrafica. Chiedi all’utente l’indirizzo.`,
    };
  }
  const { cliente } = esito;
  const indirizzo = cliente.email?.trim();
  if (!indirizzo) {
    return {
      esito: 'non-trovato',
      motivo: `${cliente.nome} è in anagrafica ma senza indirizzo email. Chiedi all’utente l’indirizzo, e ricordagli che può aggiungerlo alla scheda del cliente.`,
    };
  }
  return { esito: 'trovato', destinatario: { tipo: 'cliente', id: cliente.id, nome: cliente.nome, a: indirizzo } };
}
