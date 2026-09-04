import type { RuoloFigli } from '../contratto/cartelle.js';
import type { TipologiaDocumento } from '../contratto/documenti.js';
import {
  type Interrogabile,
  assicuraCartella,
  caricaCartelle,
  indicizza,
  percorsoDi,
  slugCartella,
  type RigaCartella,
} from './albero.js';

/**
 * Dove va questo documento.
 *
 * La regola che tiene lontana la proliferazione è una sola e sta qui:
 * **l'AI crea una cartella solo dove la convenzione ammette istanze nuove**
 * — il livello dei clienti accetta un cliente nuovo, quello degli anni un
 * anno nuovo. Ovunque altro colloca in ciò che esiste già, oppure dichiara
 * «Da sistemare» e si ferma. Non c'è nessun caso in cui inventa un ramo
 * d'albero.
 *
 * E se non sa, non prova: «Da sistemare» è una condizione visibile che si
 * rimedia in due secondi, un documento nella cartella sbagliata si scopre
 * mesi dopo.
 */

export interface DatiCollocazione {
  clienteId?: string | null;
  clienteNome?: string | null;
  compagniaNome?: string | null;
  ramoNome?: string | null;
  prodotto?: string | null;
  tipologia: TipologiaDocumento;
  /** L'anno è quello della DECORRENZA: in agenzia «2026» è l'annualità. */
  decorrenza?: string | null;
  caricatoIl?: Date | string | null;
  titolo: string;
}

export interface EsitoCollocazione {
  cartellaId: string;
  percorso: string;
  /** Quante cartelle sono nate per collocarlo: zero è la norma a regime. */
  create: number;
}

/** Chi sceglie fra le cartelle libere, quando non c'è un cliente a fare strada. */
export interface Sceglicartella {
  scegli(domanda: {
    titolo: string;
    tipologia: string;
    convenzione: string;
    cartelle: Array<{ id: string; percorso: string; descrizione?: string }>;
  }): Promise<{ id: string } | null>;
}

/** Come si chiama, in una cartella, una tipologia di documento. */
export const ETICHETTA_TIPOLOGIA: Record<TipologiaDocumento, string> = {
  dip: 'DIP',
  'dip-aggiuntivo': 'DIP Aggiuntivo',
  'condizioni-assicurazione': 'Condizioni',
  glossario: 'Glossari',
  preventivo: 'Preventivi',
  polizza: 'Polizze',
  appendice: 'Appendici',
  convenzione: 'Convenzioni',
  'nota-tecnica': 'Note tecniche',
  altro: 'Varie',
};

/** Il valore che riempie un livello, o niente se il documento non ce l'ha. */
function valorePerRuolo(ruolo: RuoloFigli, dati: DatiCollocazione): string | null {
  switch (ruolo) {
    case 'clienti':
      return dati.clienteNome?.trim() || null;
    case 'anni': {
      const decorrenza = dati.decorrenza ? String(dati.decorrenza).slice(0, 4) : null;
      if (decorrenza && /^\d{4}$/.test(decorrenza)) return decorrenza;
      /* Senza decorrenza si ripiega sull'anno di caricamento, ma è un
         ripiego dichiarato: «2026» in agenzia vuol dire l'annualità, non il
         giorno in cui è stato caricato il PDF. */
      const caricato = dati.caricatoIl ? new Date(dati.caricatoIl) : null;
      return caricato && !Number.isNaN(caricato.getTime()) ? String(caricato.getFullYear()) : null;
    }
    case 'compagnie':
      return dati.compagniaNome?.trim() || null;
    case 'rami':
      return dati.ramoNome?.trim() || null;
    case 'prodotti':
      return dati.prodotto?.trim() || null;
    case 'tipologie':
      return ETICHETTA_TIPOLOGIA[dati.tipologia] ?? null;
  }
}

export async function collocaDocumento(
  client: Interrogabile,
  tenantId: string,
  dati: DatiCollocazione,
  opzioni: { sceglicartella?: Sceglicartella; convenzione?: string } = {},
): Promise<EsitoCollocazione | null> {
  const righe = await caricaCartelle(client, tenantId);
  if (!righe.length) return null;
  const per = indicizza(righe);
  let create = 0;

  let corrente: RigaCartella | null;

  if (dati.clienteId) {
    const suaCartella = righe.find((r) => r.cliente_id === dati.clienteId);
    if (suaCartella) {
      corrente = suaCartella;
    } else {
      /* Nessuna cartella per questo cliente: si può crearne una solo se
         esiste un livello che dichiara di contenere clienti. Se non c'è,
         l'archivio non è organizzato per cliente e non tocca a noi deciderlo. */
      const livello = righe.find((r) => r.ruolo_figli === 'clienti');
      const nome = dati.clienteNome?.trim();
      if (!livello || !nome) return null;
      /* Se una cartella con quel nome c'è già — l'ha fatta l'utente a mano,
         prima ancora che il cliente esistesse in anagrafica — non se ne crea
         un'altra: la si adotta, e l'aggancio al cliente lo mette
         `assicuraCartella`. Contarla come «creata» farebbe rifare la
         convenzione per niente. */
      const gia = righe.some((r) => r.parent_id === livello.id && r.slug === slugCartella(nome));
      const id = await assicuraCartella(client, tenantId, {
        parentId: livello.id,
        nome,
        clienteId: dati.clienteId,
        /* La cartella di un cliente nuovo nasce con la forma che hanno le
           altre: se in questa agenzia dentro ogni cliente ci sono gli anni,
           anche dentro questo ci saranno gli anni. Senza, il primo documento
           di ogni cliente nuovo si fermerebbe alla radice della sua pratica e
           l'archivio diventerebbe disomogeneo un cliente alla volta. */
        ruoloFigli: ruoloDeiFratelli(righe, livello.id),
      });
      if (!gia) create += 1;
      corrente = await ricarica(client, per, id);
      if (!corrente) return null;
    }
  } else {
    /* Senza cliente restano le cartelle libere: non si indovina un percorso,
       si sceglie fra quelle che esistono, e il modello vede la convenzione
       insieme all'elenco. Se non sceglie, «Da sistemare». */
    const libere = righe.filter((r) => !suoPadreHaRuolo(r, per) && !r.ruolo_figli);
    if (!opzioni.sceglicartella || !libere.length) return null;
    let scelta: { id: string } | null;
    try {
      scelta = await opzioni.sceglicartella.scegli({
        titolo: dati.titolo,
        tipologia: dati.tipologia,
        convenzione: opzioni.convenzione ?? '',
        cartelle: libere.map((r) => ({
          id: r.id,
          percorso: percorsoDi(r.id, per),
          ...(r.descrizione && { descrizione: r.descrizione }),
        })),
      });
    } catch {
      return null;
    }
    // Mai un id inventato: si sceglie fra le cartelle mostrate, non oltre.
    const idScelto = scelta?.id;
    const scelto = idScelto ? libere.find((r) => r.id === idScelto) : undefined;
    if (!scelto) return null;
    return { cartellaId: scelto.id, percorso: percorsoDi(scelto.id, per), create };
  }

  /* Da qui in giù si scende finché il livello dice cosa contiene e il
     documento ha il valore per riempirlo. Al primo livello senza risposta
     ci si ferma: meglio la cartella del cliente che una sottocartella
     inventata. */
  const visti = new Set<string>();
  while (corrente?.ruolo_figli && !visti.has(corrente.id)) {
    visti.add(corrente.id);
    const valore = valorePerRuolo(corrente.ruolo_figli, dati);
    if (!valore) break;
    const prima = await client.query<{ id: string }>(
      `select id from velia.cartelle where tenant_id = $1 and parent_id = $2`,
      [tenantId, corrente.id],
    );
    const id = await assicuraCartella(client, tenantId, { parentId: corrente.id, nome: valore });
    if (!prima.rows.some((x) => x.id === id)) create += 1;
    const prossimo = await ricarica(client, per, id);
    if (!prossimo) break;
    corrente = prossimo;
  }

  if (!corrente) return null;
  return { cartellaId: corrente.id, percorso: percorsoDi(corrente.id, per), create };
}

/**
 * La forma che hanno in maggioranza i figli di questo livello: è quella che
 * una istanza nuova deve ereditare. Serve la maggioranza vera, non un caso
 * isolato, altrimenti la prima cartella creata a mano da qualcuno detterebbe
 * legge su tutte le altre.
 */
function ruoloDeiFratelli(
  righe: RigaCartella[],
  livelloId: string,
): RuoloFigli | null {
  const fratelli = righe.filter((r) => r.parent_id === livelloId);
  if (!fratelli.length) return null;
  const conteggi = new Map<RuoloFigli, number>();
  for (const f of fratelli) {
    if (f.ruolo_figli) conteggi.set(f.ruolo_figli, (conteggi.get(f.ruolo_figli) ?? 0) + 1);
  }
  const migliore = [...conteggi.entries()].sort((a, b) => b[1] - a[1])[0];
  return migliore && migliore[1] / fratelli.length >= 0.5 ? migliore[0] : null;
}

function suoPadreHaRuolo(riga: RigaCartella, per: Map<string, RigaCartella>): boolean {
  return riga.parent_id ? Boolean(per.get(riga.parent_id)?.ruolo_figli) : false;
}

/** Una cartella appena creata non è nell'indice caricato all'inizio: si rilegge. */
async function ricarica(
  client: Interrogabile,
  per: Map<string, RigaCartella>,
  id: string,
): Promise<RigaCartella | null> {
  const gia = per.get(id);
  if (gia) return gia;
  const r = await client.query<RigaCartella>(
    `select id, parent_id, nome, slug, descrizione, descrizione_da_utente, ruolo_figli, cliente_id
     from velia.cartelle where id = $1`,
    [id],
  );
  const riga = r.rows[0];
  if (riga) per.set(riga.id, riga);
  return riga ?? null;
}
