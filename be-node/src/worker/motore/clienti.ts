import type pg from 'pg';

/**
 * Le due domande sui clienti che i **file non sanno fare**.
 *
 * La workspace risponde benissimo a «cosa ha Rossi»: c'è una cartella col
 * suo nome. Non risponde a «chi ha l'RC auto in scadenza a marzo», perché
 * quella non è una domanda sui documenti ma sui **dati**, e i dati stanno
 * in Postgres. Un Grep su tremila schede sarebbe una scansione lineare
 * scritta a mano, con l'aggravante di dipendere da come sono formattate.
 *
 * Sta in un modulo suo, e non dentro `strumenti.ts`, per una ragione sola:
 * qui si esce dalla directory. Tutto il resto del motore lavora su file che
 * qualcuno ha deciso di scrivere; queste due funzioni interrogano il
 * database, e vanno guardate con l'attenzione che si dà a una porta.
 *
 * Il confine resta quello di sempre: **tenant obbligatorio in ogni query**,
 * e i tool che le usano si montano solo per l'agenzia — mai in una chat
 * cliente, dove «gli altri clienti» non devono nemmeno esistere come idea.
 */

export interface FiltriRicercaClienti {
  nome?: string | undefined;
  etichetta?: string | undefined;
  tipo?: 'persona' | 'azienda' | undefined;
  compagnia?: string | undefined;
  ramo?: string | undefined;
  scadenzaDa?: string | undefined;
  scadenzaA?: string | undefined;
  senzaDocumenti?: boolean | undefined;
  limite?: number | undefined;
}

export interface RigaCliente {
  id: string;
  nome: string;
  tipo: string;
  alias: string[];
  etichette: string[];
  documenti: number;
  prossima_scadenza: string | null;
}

const LIMITE_PREDEFINITO = 25;
const LIMITE_MASSIMO = 100;

/**
 * I clienti che rispondono ai filtri, con quanti documenti hanno e la
 * prossima scadenza.
 *
 * Il nome si cerca sul **normalizzato**, che è la stessa funzione con cui
 * l'ingestion riconosce un contraente: chi scrive «rossi mario» trova
 * «Rossi Mario S.r.l.», e chi scrive «ROSSI M.» lo trova per alias.
 */
export async function cercaClienti(
  db: pg.Pool,
  tenantId: string,
  filtri: FiltriRicercaClienti,
): Promise<RigaCliente[]> {
  const parametri: unknown[] = [tenantId];
  const par = (v: unknown): string => {
    parametri.push(v);
    return `$${parametri.length}`;
  };
  const dove: string[] = [];

  if (filtri.nome?.trim()) {
    const q = par(filtri.nome.trim());
    dove.push(`(c.nome_normalizzato like '%' || velia.normalizza_nome(${q}) || '%'
                or exists (select 1 from unnest(c.alias) a
                           where velia.normalizza_nome(a) like '%' || velia.normalizza_nome(${q}) || '%'))`);
  }
  if (filtri.etichetta) dove.push(`${par(filtri.etichetta)} = any(c.etichette)`);
  if (filtri.tipo) dove.push(`c.tipo = ${par(filtri.tipo)}`);

  /* I filtri sui documenti sono un `exists`: il cliente che ha almeno un
     documento così. Metterli in join moltiplicherebbe le righe, e a chi
     chiede «chi ha l'auto in scadenza» interessa l'elenco dei clienti. */
  const suiDocumenti: string[] = [];
  if (filtri.compagnia) {
    suiDocumenti.push(`exists (select 1 from velia.compagnie cc
                               where cc.id = d.compagnia_id
                                 and extensions.unaccent(lower(cc.nome)) like '%' || extensions.unaccent(lower(${par(filtri.compagnia)})) || '%')`);
  }
  if (filtri.ramo) {
    suiDocumenti.push(`exists (select 1 from velia.rami rr
                               where rr.id = d.ramo_id
                                 and extensions.unaccent(lower(rr.nome)) like '%' || extensions.unaccent(lower(${par(filtri.ramo)})) || '%')`);
  }
  if (filtri.scadenzaDa) suiDocumenti.push(`d.scadenza >= ${par(filtri.scadenzaDa)}::date`);
  if (filtri.scadenzaA) suiDocumenti.push(`d.scadenza <= ${par(filtri.scadenzaA)}::date`);

  if (suiDocumenti.length) {
    dove.push(`exists (select 1 from velia.documenti d
                       where d.tenant_id = c.tenant_id and d.cliente_id = c.id
                         and ${suiDocumenti.join(' and ')})`);
  }
  if (filtri.senzaDocumenti) {
    dove.push(`not exists (select 1 from velia.documenti d
                           where d.tenant_id = c.tenant_id and d.cliente_id = c.id)`);
  }

  const limite = Math.min(Math.max(filtri.limite ?? LIMITE_PREDEFINITO, 1), LIMITE_MASSIMO);
  const r = await db.query<RigaCliente>(
    `select c.id, c.nome, c.tipo, c.alias, c.etichette,
            (select count(*) from velia.documenti d
              where d.tenant_id = c.tenant_id and d.cliente_id = c.id)::int as documenti,
            (select to_char(min(d.scadenza), 'YYYY-MM-DD') from velia.documenti d
              where d.tenant_id = c.tenant_id and d.cliente_id = c.id
                and d.scadenza >= current_date) as prossima_scadenza
       from velia.clienti c
      where c.tenant_id = $1 and c.stato = 'attivo'
        ${dove.length ? `and ${dove.join(' and ')}` : ''}
      order by c.nome
      limit ${limite}`,
    parametri,
  );
  return r.rows;
}

export interface SchedaClienteMotore {
  id: string;
  nome: string;
  tipo: string;
  alias: string[];
  etichette: string[];
  codice_fiscale: string | null;
  partita_iva: string | null;
  nato_il: string | null;
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  note: string | null;
}

export interface DocumentoDiCliente {
  id: string;
  titolo: string;
  tipologia: string;
  compagnia: string | null;
  ramo: string | null;
  numero_polizza: string | null;
  decorrenza: string | null;
  scadenza: string | null;
}

/**
 * Un cliente per nome, e i suoi documenti.
 *
 * Il nome si risolve come lo risolve l'ingestion: esatto sul normalizzato,
 * poi sugli alias, poi per somiglianza. Se restano più candidati **non si
 * sceglie**: si restituiscono tutti, e a decidere è chi ha fatto la
 * domanda. Un cliente sbagliato in una risposta non si vede.
 */
export async function schedaCliente(
  db: pg.Pool,
  tenantId: string,
  nomeOId: string,
): Promise<
  | { esito: 'trovato'; cliente: SchedaClienteMotore; documenti: DocumentoDiCliente[] }
  | { esito: 'ambiguo'; candidati: Array<{ id: string; nome: string }> }
  | { esito: 'assente' }
> {
  const cliente = await db.query<SchedaClienteMotore>(
    `select id, nome, tipo, alias, etichette, codice_fiscale, partita_iva,
            to_char(nato_il, 'YYYY-MM-DD') as nato_il, email, telefono, indirizzo, note
       from velia.clienti
      where tenant_id = $1
        and (id::text = $2
             or nome_normalizzato = velia.normalizza_nome($2)
             or exists (select 1 from unnest(alias) a
                        where velia.normalizza_nome(a) = velia.normalizza_nome($2)))
      limit 2`,
    [tenantId, nomeOId],
  );

  if (cliente.rows.length > 1) {
    return {
      esito: 'ambiguo',
      candidati: cliente.rows.map((c) => ({ id: c.id, nome: c.nome })),
    };
  }

  let trovato = cliente.rows[0];
  if (!trovato) {
    /* Per somiglianza, e solo se ce n'è uno solo sopra soglia: due «Rossi»
       si mostrano a chi ha chiesto, non si indovinano. */
    const simili = await db.query<SchedaClienteMotore>(
      `select id, nome, tipo, alias, etichette, codice_fiscale, partita_iva,
              to_char(nato_il, 'YYYY-MM-DD') as nato_il, email, telefono, indirizzo, note
         from velia.clienti
        where tenant_id = $1
          and extensions.similarity(nome_normalizzato, velia.normalizza_nome($2)) > 0.45
        order by extensions.similarity(nome_normalizzato, velia.normalizza_nome($2)) desc
        limit 5`,
      [tenantId, nomeOId],
    );
    if (!simili.rows.length) return { esito: 'assente' };
    if (simili.rows.length > 1) {
      return {
        esito: 'ambiguo',
        candidati: simili.rows.map((c) => ({ id: c.id, nome: c.nome })),
      };
    }
    trovato = simili.rows[0]!;
  }

  const documenti = await db.query<DocumentoDiCliente>(
    `select d.id, d.titolo, d.tipologia, c.nome as compagnia, r.nome as ramo,
            d.numero_polizza,
            to_char(d.decorrenza, 'YYYY-MM-DD') as decorrenza,
            to_char(d.scadenza, 'YYYY-MM-DD') as scadenza
       from velia.documenti d
       left join velia.compagnie c on c.id = d.compagnia_id
       left join velia.rami r on r.id = d.ramo_id
      where d.tenant_id = $1 and d.cliente_id = $2 and d.archivio = 'privato'
      order by d.scadenza desc nulls last, d.caricato_il desc
      limit 100`,
    [tenantId, trovato.id],
  );

  return { esito: 'trovato', cliente: trovato, documenti: documenti.rows };
}
