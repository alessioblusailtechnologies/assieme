import type { Interrogabile } from './albero.js';

/**
 * La risoluzione del cliente: il pezzo difficile di tutta la Fase 10.
 *
 * Sapere che al livello 1 dell'albero ci sono i clienti non dice che
 * «ROSSI M.» è la cartella «Rossi Mario». Qui si decide, e si decide
 * **deterministicamente prima e col modello per ultimo**: normalizzazione,
 * match esatto su nome e alias (il caso normale di un'agenzia, che costa
 * zero chiamate), identificativi fiscali, candidati per somiglianza, e solo
 * sugli ambigui una domanda breve al modello con i soli candidati.
 *
 * Se resta il dubbio non si inventa: il documento va in «Da sistemare», che
 * è una condizione visibile e rimediabile in due secondi. Un cliente
 * sbagliato invece si scopre mesi dopo.
 */

export interface ClienteRisolto {
  id: string;
  nome: string;
  /** Vero se è nato adesso: serve a dirlo nell'evento del job. */
  creato: boolean;
  /** Come ci si è arrivati, per l'audit e per capire dove si sbaglia. */
  via: 'nome' | 'alias' | 'identificativo' | 'somiglianza' | 'modello' | 'creazione';
}

export interface DatiContraente {
  /** Il nome com'è scritto nel documento, non il cliente già risolto. */
  contraente: string | null | undefined;
  codiceFiscale?: string | null;
  partitaIva?: string | null;
  /** Il modello dice quanto ci crede: un cliente nuovo nasce solo da una fiducia alta. */
  fiducia?: 'alta' | 'media' | 'bassa';
}

export interface CandidatoCliente {
  id: string;
  nome: string;
  somiglianza: number;
}

/**
 * Chi scioglie l'ambiguità quando i candidati sono più d'uno. Interfaccia
 * perché il resto non deve sapere che c'è un modello dietro: nei test è una
 * risposta fissa, e senza sceglitore l'ambiguo resta ambiguo.
 */
export interface Sceglitore {
  scegli(domanda: {
    contraente: string;
    candidati: CandidatoCliente[];
    codiceFiscale?: string | null;
    partitaIva?: string | null;
  }): Promise<{ id: string } | { nuovo: true } | null>;
}

/** Sopra questa somiglianza, un candidato solo vale come certezza. */
const SOGLIA_CERTEZZA = 0.85;
/** Sotto questa, non è nemmeno un candidato da mostrare al modello. */
const SOGLIA_CANDIDATO = 0.45;
const MASSIMI_CANDIDATI = 5;

export async function risolviCliente(
  client: Interrogabile,
  tenantId: string,
  dati: DatiContraente,
  sceglitore?: Sceglitore,
): Promise<ClienteRisolto | null> {
  const contraente = (dati.contraente ?? '').trim();
  if (!contraente) return null;

  // 1. Match esatto sul nome normalizzato: passa dall'indice unico.
  const perNome = await client.query<{ id: string; nome: string }>(
    `select id, nome from velia.clienti
     where tenant_id = $1 and nome_normalizzato = velia.normalizza_nome($2)`,
    [tenantId, contraente],
  );
  if (perNome.rows[0]) return { ...perNome.rows[0], creato: false, via: 'nome' };

  // 2. Gli alias: le forme con cui il cliente compare davvero nei documenti.
  const perAlias = await client.query<{ id: string; nome: string }>(
    `select c.id, c.nome from velia.clienti c
     where c.tenant_id = $1
       and exists (
         select 1 from unnest(c.alias) a
         where velia.normalizza_nome(a) = velia.normalizza_nome($2)
       )
     limit 1`,
    [tenantId, contraente],
  );
  if (perAlias.rows[0]) return { ...perAlias.rows[0], creato: false, via: 'alias' };

  // 3. Codice fiscale e partita IVA: quando ci sono non lasciano dubbi.
  const cf = (dati.codiceFiscale ?? '').replace(/\s/g, '').toUpperCase() || null;
  const piva = (dati.partitaIva ?? '').replace(/\D/g, '') || null;
  if (cf || piva) {
    const perId = await client.query<{ id: string; nome: string }>(
      `select id, nome from velia.clienti
       where tenant_id = $1
         and ($2::text is not null and upper(replace(coalesce(codice_fiscale, ''), ' ', '')) = $2
              or $3::text is not null and regexp_replace(coalesce(partita_iva, ''), '\\D', '', 'g') = $3)
       limit 1`,
      [tenantId, cf, piva],
    );
    if (perId.rows[0]) {
      /* Il nome con cui compare qui è una forma nuova dello stesso cliente:
         impararla ora evita la stessa domanda al prossimo documento. */
      await aggiungiAlias(client, perId.rows[0].id, contraente);
      return { ...perId.rows[0], creato: false, via: 'identificativo' };
    }
  }

  // 4. I candidati per somiglianza, e solo quelli.
  const candidati = await cercaCandidati(client, tenantId, contraente);
  if (candidati.length === 1 && candidati[0]!.somiglianza >= SOGLIA_CERTEZZA) {
    await aggiungiAlias(client, candidati[0]!.id, contraente);
    return { id: candidati[0]!.id, nome: candidati[0]!.nome, creato: false, via: 'somiglianza' };
  }

  if (candidati.length && sceglitore) {
    const scelta = await sceglitore.scegli({
      contraente,
      candidati,
      ...(cf && { codiceFiscale: cf }),
      ...(piva && { partitaIva: piva }),
    });
    if (scelta && 'id' in scelta) {
      const scelto = candidati.find((c) => c.id === scelta.id);
      // Mai un id inventato: il modello sceglie fra i candidati, non oltre.
      if (scelto) {
        await aggiungiAlias(client, scelto.id, contraente);
        return { id: scelto.id, nome: scelto.nome, creato: false, via: 'modello' };
      }
    }
    if (!scelta) return null;
    // `{ nuovo: true }` cade nella creazione qui sotto, che ha la sua guardia.
  }

  /* Un cliente nuovo nasce solo se il modello ci crede davvero. Con la
     fiducia media o bassa si preferisce «Da sistemare»: una cartella in più
     con dentro il documento sbagliato è peggio di un documento da collocare. */
  if (dati.fiducia && dati.fiducia !== 'alta') return null;
  if (candidati.length && !sceglitore) return null;

  const creato = await creaCliente(client, tenantId, contraente);
  return { ...creato, creato: true, via: 'creazione' };
}

/** I clienti che somigliano abbastanza da meritare una domanda. */
export async function cercaCandidati(
  client: Interrogabile,
  tenantId: string,
  contraente: string,
): Promise<CandidatoCliente[]> {
  const r = await client.query<{ id: string; nome: string; somiglianza: number }>(
    `select id, nome,
            extensions.similarity(nome_normalizzato, velia.normalizza_nome($2)) as somiglianza
     from velia.clienti
     where tenant_id = $1
       and extensions.similarity(nome_normalizzato, velia.normalizza_nome($2)) > $3
     order by somiglianza desc
     limit $4`,
    [tenantId, contraente, SOGLIA_CANDIDATO, MASSIMI_CANDIDATI],
  );
  return r.rows.map((x) => ({ id: x.id, nome: x.nome, somiglianza: Number(x.somiglianza) }));
}

/**
 * Crea il cliente, e se qualcun altro l'ha creato nel frattempo restituisce
 * il suo: l'indice unico sul nome normalizzato è la verità, non la corsa.
 */
export async function creaCliente(
  client: Interrogabile,
  tenantId: string,
  nome: string,
  extra: { tipo?: 'persona' | 'azienda'; codiceFiscale?: string | null; partitaIva?: string | null } = {},
): Promise<{ id: string; nome: string }> {
  const tipo = extra.tipo ?? (sembraAzienda(nome) ? 'azienda' : 'persona');
  try {
    const r = await client.query<{ id: string; nome: string }>(
      `insert into velia.clienti (tenant_id, nome, nome_normalizzato, tipo, codice_fiscale, partita_iva)
       values ($1, $2, '', $3, $4, $5)
       returning id, nome`,
      [tenantId, nome.trim(), tipo, extra.codiceFiscale ?? null, extra.partitaIva ?? null],
    );
    return r.rows[0]!;
  } catch (errore) {
    if ((errore as { code?: string }).code !== '23505') throw errore;
    const r = await client.query<{ id: string; nome: string }>(
      `select id, nome from velia.clienti
       where tenant_id = $1 and nome_normalizzato = velia.normalizza_nome($2)`,
      [tenantId, nome],
    );
    if (!r.rows[0]) throw errore;
    return r.rows[0];
  }
}

/** «Rossi Mario S.r.l.» è un'azienda; l'euristica sbaglia, e l'utente corregge. */
function sembraAzienda(nome: string): boolean {
  return /\b(s\.?r\.?l|s\.?p\.?a|s\.?n\.?c|s\.?a\.?s|societ|coop|srls|scarl|spa|snc|sas)\b/i.test(nome);
}

/**
 * Impara una forma nuova dello stesso cliente. È ciò che fa sì che la
 * seconda volta la domanda non si ponga più: la risoluzione migliora
 * usandola, senza riaddestrare niente.
 */
export async function aggiungiAlias(
  client: Interrogabile,
  clienteId: string,
  forma: string,
): Promise<void> {
  await client.query(
    `update velia.clienti
     set alias = (
       select array_agg(distinct a) from unnest(alias || array[$2::text]) a
     )
     where id = $1
       and velia.normalizza_nome($2) <> nome_normalizzato
       and not exists (select 1 from unnest(alias) a where a = $2)`,
    [clienteId, forma.trim()],
  );
}

/**
 * Due clienti che erano lo stesso: il perduto cede documenti, alias e
 * cartella, poi sparisce. Serve il giorno dopo l'importazione, perché la
 * prima cosa che un'agenzia vede è un paio di clienti sdoppiati.
 */
export async function fondiClienti(
  client: Interrogabile,
  tenantId: string,
  vincitoreId: string,
  assorbitoId: string,
): Promise<void> {
  await client.query(
    `update velia.clienti vincitore
     set alias = (
       select array_agg(distinct a)
       from unnest(vincitore.alias || assorbito.alias || array[assorbito.nome]) a
       where velia.normalizza_nome(a) <> vincitore.nome_normalizzato
     )
     from velia.clienti assorbito
     where vincitore.id = $2 and assorbito.id = $3
       and vincitore.tenant_id = $1 and assorbito.tenant_id = $1`,
    [tenantId, vincitoreId, assorbitoId],
  );
  await client.query(
    `update velia.documenti set cliente_id = $2
     where tenant_id = $1 and cliente_id = $3`,
    [tenantId, vincitoreId, assorbitoId],
  );
  /* La cartella dell'assorbito non si butta: i documenti dentro restano
     dove l'utente li vede. Perde solo l'aggancio, così il vincitore resta
     l'unico ad averne uno (l'indice unico lo pretende). */
  await client.query(
    `update velia.cartelle set cliente_id = null
     where tenant_id = $1 and cliente_id = $2`,
    [tenantId, assorbitoId],
  );
  await client.query(`delete from velia.clienti where id = $2 and tenant_id = $1`, [
    tenantId,
    assorbitoId,
  ]);
}
