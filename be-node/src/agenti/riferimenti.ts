import type pg from 'pg';

import {
  riferimentiNellaRichiesta,
  scomponiChiaveSet,
  type RiferimentoRichiesta,
} from '../contratto/agenti.js';
import type { RiferimentoDocumento, SetDiRiferimento } from '../contratto/conversazioni.js';

/**
 * I riferimenti della richiesta di un agente, risolti adesso (14/09/2026).
 *
 * La richiesta conserva solo tipo e chiave: il titolo si legge a ogni
 * apertura, così rinominare un documento non riscrive le richieste che lo
 * citano, e un documento eliminato sparisce dall'elenco (il chip in pagina
 * lo dice). Lo usano l'API, che li mostra e li passa al lettore del piano,
 * e il worker, che ne fa il contesto dell'esecuzione.
 *
 * Un documento privato conta solo se è del tenant; un prodotto sono i
 * documenti pubblici del suo set, nell'edizione scelta.
 */

const E_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RigaDocumento {
  id: string;
  titolo: string;
  archivio: 'pubblico' | 'privato';
  compagnia_id: string | null;
  compagnia: string | null;
  prodotto: string | null;
  edizione_id: string | null;
  edizione_etichetta: string | null;
  edizione_corrente: boolean;
}

const COLONNE = `d.id, d.titolo, d.archivio, d.compagnia_id, c.nome as compagnia, d.prodotto,
                 d.edizione_id::text as edizione_id, d.edizione_etichetta, d.edizione_corrente`;

function versoRiferimento(d: RigaDocumento): RiferimentoDocumento {
  const set: SetDiRiferimento | undefined =
    d.archivio === 'pubblico' && d.compagnia_id && d.prodotto && d.edizione_id
      ? {
          chiave: `${d.compagnia_id}:${d.prodotto}:${d.edizione_id}`,
          prodotto: d.prodotto,
          compagnia: d.compagnia ?? d.compagnia_id,
          edizione: d.edizione_etichetta ?? '',
          corrente: d.edizione_corrente,
        }
      : undefined;
  return { id: d.id, titolo: d.titolo, archivio: d.archivio, ...(set && { set }) };
}

export async function idrataRiferimenti(
  client: pg.ClientBase,
  tenantId: string,
  richiesta: string,
): Promise<RiferimentoRichiesta[]> {
  const citati = riferimentiNellaRichiesta(richiesta);
  if (!citati.length) return [];

  const documenti = new Map<string, RiferimentoDocumento>();
  const idsDocumenti = citati.filter((r) => r.tipo === 'documento').map((r) => r.chiave);
  if (idsDocumenti.length) {
    const r = await client.query<RigaDocumento>(
      `select ${COLONNE}
         from velia.documenti d
         left join velia.compagnie c on c.id = d.compagnia_id
        where d.id = any($1)
          and (d.archivio = 'pubblico' or (d.archivio = 'privato' and d.tenant_id = $2))`,
      [idsDocumenti, tenantId],
    );
    for (const d of r.rows) documenti.set(d.id, versoRiferimento(d));
  }

  const prodotti = new Map<string, RiferimentoDocumento[]>();
  for (const citato of citati.filter((r) => r.tipo === 'prodotto')) {
    const parti = scomponiChiaveSet(citato.chiave);
    if (!parti) continue;
    const r = await client.query<RigaDocumento>(
      `select ${COLONNE}
         from velia.documenti d
         left join velia.compagnie c on c.id = d.compagnia_id
        where d.archivio = 'pubblico' and d.compagnia_id = $1 and d.prodotto = $2 and d.edizione_id::text = $3
        order by d.tipologia, d.id`,
      [parti.compagniaId, parti.prodotto, parti.edizioneId],
    );
    if (r.rows.length) prodotti.set(citato.chiave, r.rows.map(versoRiferimento));
  }

  const clienti = new Map<string, string>();
  const idsClienti = citati.filter((r) => r.tipo === 'cliente' && E_UUID.test(r.chiave)).map((r) => r.chiave);
  if (idsClienti.length) {
    const r = await client.query<{ id: string; nome: string }>(
      `select id, nome from velia.clienti where id = any($1::uuid[]) and tenant_id = $2`,
      [idsClienti, tenantId],
    );
    for (const c of r.rows) clienti.set(c.id, c.nome);
  }

  return citati.flatMap((citato): RiferimentoRichiesta[] => {
    if (citato.tipo === 'documento') {
      const d = documenti.get(citato.chiave);
      return d && d.archivio !== 'conversazione'
        ? [{ tipo: 'documento', chiave: citato.chiave, titolo: d.titolo, archivio: d.archivio }]
        : [];
    }
    if (citato.tipo === 'prodotto') {
      const docs = prodotti.get(citato.chiave);
      const set = docs?.[0]?.set;
      if (!docs?.length || !set) return [];
      const titolo = set.edizione ? `${set.prodotto}, ${set.edizione}` : set.prodotto;
      return [{ tipo: 'prodotto', chiave: citato.chiave, titolo, documenti: docs }];
    }
    const nome = clienti.get(citato.chiave);
    return nome ? [{ tipo: 'cliente', chiave: citato.chiave, titolo: nome }] : [];
  });
}

/** I documenti che i riferimenti portano con sé: quelli citati e quelli dei prodotti. */
export function documentiDeiRiferimenti(riferimenti: RiferimentoRichiesta[]): string[] {
  return [
    ...new Set(
      riferimenti.flatMap((r) =>
        r.tipo === 'documento' ? [r.chiave] : r.tipo === 'prodotto' ? r.documenti.map((d) => d.id) : [],
      ),
    ),
  ];
}
