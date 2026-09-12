import type { OperazioneArchivio, PropostaArchivio } from '../contratto/conversazioni.js';
import type { Interrogabile } from '../db/interrogabile.js';
import { cercaCandidati } from './clienti.js';

/**
 * Quello che l'assistente propone e l'utente approva.
 *
 * Due momenti separati, e la separazione è il punto. **Risolvere** avviene
 * nel worker mentre il modello parla: si traduce quello che ha detto a
 * parole («questi tre sono di Rossi») in operazioni su id veri, e si rifiuta
 * tutto ciò che non torna, così l'utente non si trova davanti una proposta
 * che non si può applicare. **Applicare** avviene solo dopo un clic,
 * nell'API, con l'identità di chi approva.
 *
 * Il modello non scrive mai: qui non guadagna uno strumento di scrittura,
 * guadagna la possibilità di chiedere.
 *
 * Dal 12/09/2026 l'oggetto della proposta cambia insieme all'archivio: non
 * più cartelle da creare e documenti da spostare, ma **di chi è un
 * documento e come si etichetta**. Il meccanismo è lo stesso, e resta lo
 * stesso perché era la parte giusta.
 */

/** Come il modello descrive un'operazione: a parole, non per id. */
export interface OperazioneChiesta {
  azione: 'intesta-documento' | 'etichetta-documento';
  /** Il path nella workspace, o l'id del documento. */
  documento?: string;
  /** `intesta-documento`: il cliente, per nome. */
  cliente?: string;
  /** `etichetta-documento`: le etichette da aggiungere e da togliere. */
  aggiungi?: string[];
  togli?: string[];
}

export interface EsitoRisoluzione {
  operazioni: OperazioneArchivio[];
  /** I motivi per cui qualcosa non si è potuto tradurre: tornano al modello. */
  rifiutate: string[];
}

/**
 * L'id di un documento come compare nella workspace
 * (`…/titolo--doc-priv-abc123.md`) o passato nudo.
 */
export function idDelDocumento(riferimento: string): string | null {
  const dalPath = /(doc-priv-[0-9a-f]+)/i.exec(riferimento);
  if (dalPath) return dalPath[1]!;
  return /^doc-priv-[0-9a-f]+$/i.test(riferimento.trim()) ? riferimento.trim() : null;
}

/** Sopra questa somiglianza, un cliente proposto per nome è quel cliente. */
const SOGLIA_CLIENTE = 0.85;

/**
 * Da quello che il modello ha detto alle operazioni su id veri.
 *
 * Tutto ciò che non si risolve viene **rifiutato con un motivo**, e il motivo
 * torna al modello: meglio che si corregga subito, dentro la stessa risposta,
 * che proporre all'utente un'operazione che poi non si applica.
 *
 * Un cliente si risolve solo se esiste già o se il nome è inequivocabile.
 * **Qui non nascono clienti nuovi**: crearne uno è un gesto dell'agenzia,
 * non l'effetto collaterale di una frase in chat.
 */
export async function risolviProposta(
  client: Interrogabile,
  tenantId: string,
  chieste: OperazioneChiesta[],
): Promise<EsitoRisoluzione> {
  const operazioni: OperazioneArchivio[] = [];
  const rifiutate: string[] = [];

  for (const chiesta of chieste) {
    const id = idDelDocumento(chiesta.documento ?? '');
    if (!id) {
      rifiutate.push(`«${chiesta.documento ?? ''}» non è un documento riconoscibile`);
      continue;
    }
    const doc = await client.query<{ id: string; titolo: string; etichette: string[] }>(
      `select id, titolo, etichette from velia.documenti
       where id = $1 and tenant_id = $2 and archivio = 'privato'`,
      [id, tenantId],
    );
    const riga = doc.rows[0];
    if (!riga) {
      rifiutate.push(`il documento «${id}» non è nell'archivio privato di questa agenzia`);
      continue;
    }

    if (chiesta.azione === 'intesta-documento') {
      const nome = (chiesta.cliente ?? '').trim();
      if (!nome) {
        rifiutate.push(`manca il cliente a cui intestare «${riga.titolo}»`);
        continue;
      }
      const cliente = await trovaCliente(client, tenantId, nome);
      if ('motivo' in cliente) {
        rifiutate.push(cliente.motivo);
        continue;
      }
      operazioni.push({
        azione: 'intesta-documento',
        documentoId: riga.id,
        titolo: riga.titolo,
        clienteId: cliente.id,
        cliente: cliente.nome,
      });
      continue;
    }

    const aggiungi = ripulisci(chiesta.aggiungi);
    const togli = ripulisci(chiesta.togli);
    if (!aggiungi.length && !togli.length) {
      rifiutate.push(`per «${riga.titolo}» non è stata indicata nessuna etichetta`);
      continue;
    }
    operazioni.push({
      azione: 'etichetta-documento',
      documentoId: riga.id,
      titolo: riga.titolo,
      aggiungi,
      togli,
    });
  }

  return { operazioni, rifiutate };
}

/**
 * Il cliente detto per nome, o il motivo per cui non si può usare.
 *
 * Prima il nome normalizzato e gli alias (che è il caso normale e costa una
 * query), poi la somiglianza. Un nome ambiguo non si indovina: si elencano i
 * candidati al modello, che chiede all'utente.
 */
async function trovaCliente(
  client: Interrogabile,
  tenantId: string,
  nome: string,
): Promise<{ id: string; nome: string } | { motivo: string }> {
  const esatto = await client.query<{ id: string; nome: string }>(
    `select id, nome from velia.clienti
     where tenant_id = $1
       and (nome_normalizzato = velia.normalizza_nome($2)
            or exists (select 1 from unnest(alias) a
                       where velia.normalizza_nome(a) = velia.normalizza_nome($2)))
     limit 1`,
    [tenantId, nome],
  );
  if (esatto.rows[0]) return esatto.rows[0];

  const candidati = await cercaCandidati(client, tenantId, nome);
  const certo = candidati.length === 1 && candidati[0]!.somiglianza >= SOGLIA_CLIENTE;
  if (certo) return { id: candidati[0]!.id, nome: candidati[0]!.nome };

  return {
    motivo: candidati.length
      ? `«${nome}» non è un cliente in anagrafica; i più simili sono ${candidati
          .map((c) => `«${c.nome}»`)
          .join(', ')}`
      : `«${nome}» non è un cliente in anagrafica, e va creato prima dalla sezione Clienti`,
  };
}

/** Etichette come le scriverebbe un umano: senza vuoti, senza doppioni. */
function ripulisci(etichette: string[] | undefined): string[] {
  return [...new Set((etichette ?? []).map((e) => e.trim()).filter(Boolean))].slice(0, 30);
}

/**
 * L'applicazione, dopo il clic.
 *
 * Non è una transazione sola per scelta: se a metà qualcosa non si può più
 * fare — un collega ha eliminato il documento nel frattempo — quello che è
 * riuscito resta, e si dice cosa non è passato. Annullare a metà un lavoro
 * già visibile confonderebbe più di quanto protegga.
 */
export async function applicaProposta(
  client: Interrogabile,
  tenantId: string,
  operazioni: OperazioneArchivio[],
): Promise<{ fatte: number; mancate: string[] }> {
  const mancate: string[] = [];
  let fatte = 0;

  for (const op of operazioni) {
    try {
      if (op.azione === 'intesta-documento') {
        /* Il cliente dev'essere ancora di questo tenant: fra la proposta e
           il clic può essere stato fuso o eliminato da qualcun altro. */
        const esiste = await client.query(
          `select 1 from velia.clienti where id = $1 and tenant_id = $2`,
          [op.clienteId, tenantId],
        );
        if (!esiste.rowCount) {
          mancate.push(`«${op.titolo}»: il cliente «${op.cliente}» non esiste più`);
          continue;
        }
        /* Intestare a mano è definitivo, e approvare è intestare a mano:
           `cliente_da_confermare` si spegne e nessuna rilavorazione rimette
           il documento in discussione (stessa regola della scheda). */
        const fatto = await client.query(
          `update velia.documenti
           set cliente_id = $3, cliente_da_confermare = false
           where id = $1 and tenant_id = $2 and archivio = 'privato'`,
          [op.documentoId, tenantId, op.clienteId],
        );
        if (!fatto.rowCount) {
          mancate.push(`«${op.titolo}» non è più nell'archivio`);
          continue;
        }
        fatte += 1;
        continue;
      }

      /* Le etichette si aggiungono e si tolgono, non si sostituiscono: la
         proposta parla di due o tre parole, e l'archivio ne può avere altre
         che nessuno ha chiesto di toccare. */
      const fatto = await client.query(
        `update velia.documenti
         set etichette = (
           select coalesce(array_agg(distinct e order by e), '{}')
           from unnest(etichette || $3::text[]) e
           where e <> all($4::text[])
         )
         where id = $1 and tenant_id = $2 and archivio = 'privato'`,
        [op.documentoId, tenantId, op.aggiungi, op.togli],
      );
      if (!fatto.rowCount) {
        mancate.push(`«${op.titolo}» non è più nell'archivio`);
        continue;
      }
      fatte += 1;
    } catch (errore) {
      mancate.push(`«${op.titolo}»: ${errore instanceof Error ? errore.message : String(errore)}`);
    }
  }

  return { fatte, mancate };
}

/** Il riepilogo che il modello riceve e ripete all'utente, in una riga. */
export function raccontaProposta(proposta: PropostaArchivio): string {
  return proposta.operazioni
    .map((op) =>
      op.azione === 'intesta-documento'
        ? `intestare «${op.titolo}» a «${op.cliente}»`
        : [
            op.aggiungi.length ? `aggiungere ${op.aggiungi.map((e) => `«${e}»`).join(', ')}` : '',
            op.togli.length ? `togliere ${op.togli.map((e) => `«${e}»`).join(', ')}` : '',
          ]
            .filter(Boolean)
            .join(' e ') + ` su «${op.titolo}»`,
    )
    .join('; ');
}
