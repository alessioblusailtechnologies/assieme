import type pg from 'pg';

import type {
  EmailPiano,
  LetturaPiano,
  PianoAgente,
  RiferimentoRichiesta,
  TipoRiferimento,
} from '../../contratto/agenti.js';
import { risolviDestinatario } from '../../email/destinatari.js';
import type { PianoGrezzo } from './interprete.js';

/**
 * Dal piano scritto dal modello al piano che si mostra (14/09/2026).
 *
 * Il modello nomina i destinatari a parole; qui diventano persone
 * dell'anagrafica o indirizzi scritti nella richiesta, e un nome che non si
 * risolve resta nel piano come tale, col motivo: la conferma lo aspetta.
 * I riferimenti delle letture si tengono solo se sono davvero nella
 * richiesta: un marcatore inventato non diventa un link.
 */

const MARCATORE = /^@\[(documento|prodotto|cliente):([^\]]+)\]$/;

export async function componiPiano(
  db: pg.Pool,
  chi: { tenantId: string; utenteId: string },
  grezzo: PianoGrezzo,
  riferimenti: RiferimentoRichiesta[],
): Promise<PianoAgente> {
  const citato = (testo: string | undefined): { tipo: TipoRiferimento; chiave: string } | undefined => {
    const m = testo ? MARCATORE.exec(testo.trim()) : null;
    if (!m) return undefined;
    const tipo = m[1] as TipoRiferimento;
    const chiave = m[2]!;
    return riferimenti.some((r) => r.tipo === tipo && r.chiave === chiave) ? { tipo, chiave } : undefined;
  };

  const email: EmailPiano[] = [];
  for (const e of grezzo.email) {
    const marcatore = MARCATORE.exec(e.a.trim());
    const cliente = marcatore?.[1] === 'cliente' ? citato(e.a) : undefined;
    let destinatario: EmailPiano['destinatario'];
    if (marcatore && !cliente) {
      destinatario = {
        tipo: 'non-risolto',
        richiesto: 'un riferimento della richiesta',
        motivo: 'Il destinatario referenziato non è un cliente in anagrafica.',
      };
    } else {
      const esito = await risolviDestinatario(db, chi, cliente ? cliente.chiave : e.a);
      const richiesto = cliente ? (riferimenti.find((r) => r.tipo === 'cliente' && r.chiave === cliente.chiave)?.titolo ?? e.a) : e.a;
      destinatario =
        esito.esito === 'trovato' ? esito.destinatario : { tipo: 'non-risolto', richiesto, motivo: esito.perUtente };
    }
    email.push({
      destinatario,
      ...(e.oggetto && { oggetto: e.oggetto }),
      contenuto: e.contenuto,
      allegati: e.allegati,
    });
  }

  return {
    obiettivo: grezzo.obiettivo,
    passi: grezzo.passi.map((p) => ({ tipo: p.tipo, titolo: p.titolo, ...(p.dettaglio && { dettaglio: p.dettaglio }) })),
    letture: grezzo.letture.map((l): LetturaPiano => {
      const riferimento = citato(l.riferimento);
      return { tipo: l.tipo, etichetta: l.etichetta, ...(riferimento && { riferimento }) };
    }),
    file: grezzo.file.map((f) => ({ formato: f.formato.toLowerCase().replace(/^\./, ''), descrizione: f.descrizione })),
    email,
    dubbi: grezzo.dubbi,
  };
}

/** Perché il piano non si può confermare così com'è; assente se si può. */
export function bloccoConferma(piano: PianoAgente | null | undefined): string | undefined {
  const mancanti = (piano?.email ?? []).flatMap((e) => (e.destinatario.tipo === 'non-risolto' ? [e.destinatario] : []));
  if (!mancanti.length) return undefined;
  if (mancanti.length === 1) {
    const [unico] = mancanti;
    return `Prima di confermare sistema il destinatario «${unico!.richiesto}»: ${unico!.motivo}`;
  }
  return `Prima di confermare sistema i destinatari ${mancanti.map((m) => `«${m.richiesto}»`).join(', ')}: ${mancanti.map((m) => m.motivo).join(' ')}`;
}
