import type {
  OperazioneArchivio,
  PropostaArchivio,
} from '../contratto/conversazioni.js';
import {
  assicuraCartella,
  caricaCartelle,
  indicizza,
  percorsoDi,
  segnaDaRicalcolare,
  type Interrogabile,
} from './albero.js';

/**
 * Il riordino che l'assistente propone e l'utente approva.
 *
 * Due momenti separati, e la separazione è il punto. **Risolvere** avviene
 * nel worker mentre il modello parla: si traduce quello che ha detto a
 * parole («metti la fattura sotto Blusail») in operazioni su id veri, e si
 * rifiuta tutto ciò che non torna, così l'utente non si trova davanti una
 * proposta che non si può applicare. **Applicare** avviene solo dopo un clic,
 * nell'API, con l'identità di chi approva.
 *
 * Il modello non scrive mai: qui non guadagna uno strumento di scrittura,
 * guadagna la possibilità di chiedere.
 */

/** Come il modello descrive un'operazione: a parole, non per id. */
export interface OperazioneChiesta {
  azione: 'crea-cartella' | 'sposta-documento';
  /** Per `crea-cartella`: il nome della cartella nuova. */
  nome?: string;
  /** Per `crea-cartella`: il percorso della cartella che la conterrà. */
  dentro?: string;
  /** Per `sposta-documento`: il path nella workspace, o l'id del documento. */
  documento?: string;
  /** Per `sposta-documento`: il percorso della cartella di destinazione. */
  verso?: string;
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

/** Confronto fra percorsi come li scrive un umano: senza accenti né maiuscole. */
function chiave(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^tenant\/documenti\//, '')
    .replace(/[^a-z0-9/]+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim();
}

/**
 * Da quello che il modello ha detto alle operazioni su id veri.
 *
 * Tutto ciò che non si risolve viene **rifiutato con un motivo**, e il motivo
 * torna al modello: meglio che si corregga subito, dentro la stessa risposta,
 * che proporre all'utente un riordino che poi non si applica.
 */
export async function risolviProposta(
  client: Interrogabile,
  tenantId: string,
  chieste: OperazioneChiesta[],
): Promise<EsitoRisoluzione> {
  const righe = await caricaCartelle(client, tenantId);
  const per = indicizza(righe);
  const percorsi = new Map(righe.map((r) => [chiave(percorsoDi(r.id, per)), r]));

  const operazioni: OperazioneArchivio[] = [];
  const rifiutate: string[] = [];
  /* Le cartelle che questa stessa proposta creerà: una può essere la
     destinazione di uno spostamento più avanti nell'elenco. */
  const inArrivo = new Set<string>();

  for (const chiesta of chieste) {
    if (chiesta.azione === 'crea-cartella') {
      const nome = (chiesta.nome ?? '').trim();
      if (!nome) {
        rifiutate.push('una creazione senza nome della cartella');
        continue;
      }
      const dentro = chiesta.dentro?.trim();
      const padre = dentro ? percorsi.get(chiave(dentro)) : undefined;
      if (dentro && !padre && !inArrivo.has(chiave(dentro))) {
        rifiutate.push(`«${dentro}» non è una cartella dell'archivio`);
        continue;
      }
      const percorsoNuovo = chiave(dentro ? `${dentro}/${nome}` : nome);
      if (percorsi.has(percorsoNuovo) || inArrivo.has(percorsoNuovo)) {
        rifiutate.push(`«${nome}» dentro «${dentro ?? 'la radice'}» esiste già`);
        continue;
      }
      inArrivo.add(percorsoNuovo);
      operazioni.push({
        azione: 'crea-cartella',
        nome,
        ...(padre && { dentroId: padre.id }),
        ...(dentro && { dentro }),
      });
      continue;
    }

    const id = idDelDocumento(chiesta.documento ?? '');
    if (!id) {
      rifiutate.push(`«${chiesta.documento ?? ''}» non è un documento riconoscibile`);
      continue;
    }
    const doc = await client.query<{ id: string; titolo: string }>(
      `select id, titolo from velia.documenti
       where id = $1 and tenant_id = $2 and archivio = 'privato'`,
      [id, tenantId],
    );
    const riga = doc.rows[0];
    if (!riga) {
      rifiutate.push(`il documento «${id}» non è nell'archivio privato di questa agenzia`);
      continue;
    }
    const verso = (chiesta.verso ?? '').trim();
    const destinazione = percorsi.get(chiave(verso));
    if (!verso) {
      rifiutate.push(`manca la cartella di destinazione per «${riga.titolo}»`);
      continue;
    }
    if (!destinazione && !inArrivo.has(chiave(verso))) {
      rifiutate.push(`«${verso}» non è una cartella dell'archivio`);
      continue;
    }
    operazioni.push({
      azione: 'sposta-documento',
      documentoId: riga.id,
      titolo: riga.titolo,
      ...(destinazione && { versoId: destinazione.id }),
      verso,
    });
  }

  return { operazioni, rifiutate };
}

/**
 * L'applicazione, dopo il clic. In ordine, perché una cartella creata dalla
 * prima operazione può essere la destinazione della seconda.
 *
 * Non è una transazione sola per scelta: se a metà qualcosa non si può più
 * fare — l'utente ha spostato una cartella nel frattempo — quello che è
 * riuscito resta, e si dice cosa non è passato. Annullare a metà un riordino
 * già visibile confonderebbe più di quanto protegga.
 */
export async function applicaProposta(
  client: Interrogabile,
  tenantId: string,
  operazioni: OperazioneArchivio[],
): Promise<{ fatte: number; mancate: string[] }> {
  const mancate: string[] = [];
  let fatte = 0;
  /* I nomi delle cartelle create qui dentro, per gli spostamenti che le
     riferiscono senza id. */
  const create = new Map<string, string>();

  for (const op of operazioni) {
    try {
      if (op.azione === 'crea-cartella') {
        const id = await assicuraCartella(client, tenantId, {
          parentId: op.dentroId ?? null,
          nome: op.nome,
        });
        create.set(chiave(op.dentro ? `${op.dentro}/${op.nome}` : op.nome), id);
        fatte += 1;
        continue;
      }

      const versoId = op.versoId ?? create.get(chiave(op.verso)) ?? null;
      if (!versoId) {
        mancate.push(`«${op.titolo}»: la cartella «${op.verso}» non esiste più`);
        continue;
      }
      /* La destinazione dev'essere ancora una cartella di questo tenant: fra
         la proposta e il clic può essere stata eliminata da qualcun altro. */
      const esiste = await client.query(
        `select 1 from velia.cartelle where id = $1 and tenant_id = $2`,
        [versoId, tenantId],
      );
      if (!esiste.rowCount) {
        mancate.push(`«${op.titolo}»: la cartella «${op.verso}» non esiste più`);
        continue;
      }
      /* Spostare a mano è definitivo, e approvare è spostare a mano: la
         collocazione non torna più in discussione (stessa regola della
         scheda del documento). */
      const spostato = await client.query(
        `update velia.documenti
         set cartella_id = $3, collocazione_da_confermare = false
         where id = $1 and tenant_id = $2 and archivio = 'privato'`,
        [op.documentoId, tenantId, versoId],
      );
      if (!spostato.rowCount) {
        mancate.push(`«${op.titolo}» non è più nell'archivio`);
        continue;
      }
      fatte += 1;
    } catch (errore) {
      mancate.push(
        `${op.azione === 'crea-cartella' ? `«${op.nome}»` : `«${op.titolo}»`}: ${
          errore instanceof Error ? errore.message : String(errore)
        }`,
      );
    }
  }

  if (fatte) await segnaDaRicalcolare(client, tenantId);
  return { fatte, mancate };
}

/** Il riepilogo che il modello riceve e ripete all'utente, in una riga. */
export function raccontaProposta(proposta: PropostaArchivio): string {
  return proposta.operazioni
    .map((op) =>
      op.azione === 'crea-cartella'
        ? `creare «${op.nome}»${op.dentro ? ` dentro «${op.dentro}»` : ' in cima all’archivio'}`
        : `spostare «${op.titolo}» in «${op.verso}»`,
    )
    .join(', ');
}
