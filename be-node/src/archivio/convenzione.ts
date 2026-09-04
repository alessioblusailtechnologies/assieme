import { createHash } from 'node:crypto';

import type { RuoloFigli } from '../contratto/cartelle.js';
import {
  caricaCartelle,
  indicizza,
  percorsoDi,
  type Interrogabile,
  type RigaCartella,
} from './albero.js';

/**
 * La convenzione: come è organizzato **questo** archivio, osservata e non
 * configurata.
 *
 * Un'agenzia non arriva mai senza documenti: arriva con la sua cartellazione,
 * fatta in anni di lavoro. Quindi non le si chiede di descriverla, la si
 * guarda. Il risultato è un testo breve che va al modello in due momenti —
 * quando deve collocare un documento nuovo e quando deve cercare — e che
 * all'interrogazione è il contenuto dell'`INDICE.md` di radice, cioè il file
 * che `regole.ts` gli dice già di leggere per primo. È il `CLAUDE.md`
 * dell'archivio (doc motore §3.3).
 *
 * Il vincolo che tiene in piedi tutto: **descrive la forma, mai le istanze**.
 * Tremila clienti non si elencano, si dice «al livello 1 ci sono i clienti»
 * e il modello ci arriva con Glob. Senza questa regola il testo crescerebbe
 * con l'archivio e non entrerebbe più in nessun prompt.
 */

/** Chi scrive la riga di una cartella libera guardando cosa contiene. */
export interface Descrittore {
  descrivi(
    cartelle: Array<{ id: string; percorso: string; titoli: string[] }>,
  ): Promise<Map<string, string>>;
}

/** Quante cartelle libere si descrivono per ricalcolo: il resto al giro dopo. */
const DESCRIZIONI_PER_GIRO = 20;
/** Quante cartelle libere si elencano nel testo, prima di riassumere. */
const MASSIME_LIBERE = 40;
/**
 * Quanti figli servono per etichettare un livello. Due, perché i segnali
 * forti non hanno bisogno di prove: due cartelle `2025` e `2026` sono anni e
 * non c'è altra lettura. Il caso rischioso è quello dei clienti, che si
 * riconosce per esclusione, e infatti ne pretende cinque.
 */
const MINIMI_PER_RUOLO = 2;

const SINGOLARE: Record<RuoloFigli, string> = {
  clienti: 'cliente',
  anni: 'anno',
  compagnie: 'compagnia',
  rami: 'ramo',
  tipologie: 'tipologia di documento',
  prodotti: 'prodotto',
};

/** I nomi con cui una cartella di tipologia si chiama davvero, in agenzia. */
const NOMI_TIPOLOGIA = [
  'preventivi', 'preventivo', 'polizze', 'polizza', 'appendici', 'appendice',
  'convenzioni', 'convenzione', 'note tecniche', 'nota tecnica', 'quietanze',
  'sinistri', 'sinistro', 'documenti', 'contratti', 'contratto', 'corrispondenza',
  'dip', 'condizioni', 'set informativi', 'allegati', 'varie',
];

function chiave(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface Vocabolari {
  compagnie: Set<string>;
  rami: Set<string>;
}

async function caricaVocabolari(client: Interrogabile): Promise<Vocabolari> {
  const [c, r] = await Promise.all([
    client.query<{ nome: string }>('select nome from velia.compagnie'),
    client.query<{ nome: string }>('select nome from velia.rami'),
  ]);
  return {
    compagnie: new Set(c.rows.map((x) => chiave(x.nome))),
    rami: new Set(r.rows.map((x) => chiave(x.nome))),
  };
}

export interface RuoloDedotto {
  ruolo: RuoloFigli;
  /** Quota di figli che confermano l'etichetta: sotto 0,6 non si scrive niente. */
  quota: number;
}

/**
 * I nomi con cui una cartella **dichiara** cosa contiene.
 *
 * È la prova più forte che ci sia e per un po' me la sono persa: guardavo i
 * nomi dei figli per indovinare cosa fossero, mentre una cartella chiamata
 * `Clienti/` lo sta già dicendo. Senza questo, un'agenzia che comincia con
 * due o tre clienti non vedeva mai riconosciuto il proprio livello — e
 * quindi non le veniva collocato niente, per sempre.
 */
const NOMI_CHE_DICHIARANO: Array<[RuoloFigli, string[]]> = [
  ['clienti', ['clienti', 'cliente', 'clientela', 'assicurati', 'contraenti', 'portafoglio', 'anagrafica']],
  ['compagnie', ['compagnie', 'compagnia', 'imprese', 'imprese assicurative']],
  ['rami', ['rami', 'ramo']],
  ['anni', ['anni', 'anno', 'annualita', 'annualita assicurative', 'esercizi']],
  ['tipologie', ['tipologie', 'tipologia', 'tipi di documento']],
  ['prodotti', ['prodotti', 'prodotto', 'polizze per prodotto']],
];

/**
 * Che cosa sono questi figli. Nessun modello: un livello di `2024 2025 2026`
 * è un anno e si vede, e questo è il novanta per cento del lavoro.
 *
 * `nomePadre` è la prima cosa che si guarda, perché una cartella che si
 * chiama «Clienti» sta dichiarando cosa contiene: una dichiarazione batte
 * qualunque indizio ricavato dai figli, e basta **un solo** figlio per
 * fidarsene — è la differenza fra un archivio che comincia a organizzarsi
 * dal primo giorno e uno che aspetta di avere cinque clienti.
 */
export function deduciRuolo(
  nomi: string[],
  vocabolari: Vocabolari,
  nomePadre?: string,
): RuoloDedotto | null {
  if (!nomi.length) return null;

  if (nomePadre) {
    const dichiarato = chiave(nomePadre);
    for (const [ruolo, nomiPadre] of NOMI_CHE_DICHIARANO) {
      if (nomiPadre.includes(dichiarato)) return { ruolo, quota: 1 };
    }
  }

  if (nomi.length < MINIMI_PER_RUOLO) return null;
  const chiavi = nomi.map(chiave);

  const quota = (predicato: (n: string) => boolean): number =>
    chiavi.filter(predicato).length / chiavi.length;

  const candidati: RuoloDedotto[] = [
    { ruolo: 'anni', quota: quota((n) => /^(19|20)\d\d$/.test(n)) },
    { ruolo: 'compagnie', quota: quota((n) => vocabolari.compagnie.has(n)) },
    { ruolo: 'rami', quota: quota((n) => vocabolari.rami.has(n)) },
    { ruolo: 'tipologie', quota: quota((n) => NOMI_TIPOLOGIA.includes(n)) },
  ];
  const migliore = candidati.sort((a, b) => b.quota - a.quota)[0]!;
  if (migliore.quota >= 0.6) return migliore;

  /* I clienti si riconoscono per esclusione, ed è l'unico caso in cui ci si
     permette: un livello largo di nomi propri che non sono anni, compagnie,
     rami né tipologie, in un archivio di agenzia, sono i clienti. È una
     proposta come le altre, e l'utente la corregge in una riga. */
  const nomiPropri = quota((n) => {
    const parole = n.split(' ').filter(Boolean);
    return parole.length >= 1 && parole.length <= 5 && !/^\d+$/.test(n) && !NOMI_TIPOLOGIA.includes(n);
  });
  if (nomi.length >= 5 && nomiPropri >= 0.8) return { ruolo: 'clienti', quota: nomiPropri };
  return null;
}

/**
 * Il ricalcolo: etichetta i livelli, fa scrivere le righe delle cartelle
 * libere, e rende il testo.
 *
 * Le etichette sono **lente a cambiare** di proposito: una già scritta si
 * sostituisce solo davanti a un'evidenza più forte, mai al primo
 * controesempio. Se cambiasse ogni giorno la collocazione diventerebbe
 * imprevedibile («ieri archiviava per anno, oggi per ramo») e l'utente
 * smetterebbe di fidarsi.
 */
export async function ricalcolaConvenzione(
  client: Interrogabile,
  tenantId: string,
  descrittore?: Descrittore,
): Promise<{ testo: string; impronta: string; ruoliScritti: number; descrizioniScritte: number }> {
  const righe = await caricaCartelle(client, tenantId);
  const vocabolari = await caricaVocabolari(client);

  const figliDi = new Map<string | null, RigaCartella[]>();
  for (const r of righe) {
    const elenco = figliDi.get(r.parent_id);
    if (elenco) elenco.push(r);
    else figliDi.set(r.parent_id, [r]);
  }

  // --- Strato 1: la forma, senza modello ------------------------------------
  let ruoliScritti = 0;
  for (const riga of righe) {
    const figli = figliDi.get(riga.id) ?? [];
    const dedotto = deduciRuolo(
      figli.map((f) => f.nome),
      vocabolari,
      riga.nome,
    );
    const nuovo = dedotto?.ruolo ?? null;
    if (nuovo === riga.ruolo_figli) continue;
    // Lenta a cambiare: si sovrascrive un'etichetta esistente solo con una
    // deduzione forte, e non si cancella mai per assenza di prove.
    if (riga.ruolo_figli && (!dedotto || dedotto.quota < 0.8)) continue;
    if (!nuovo) continue;
    await client.query(`update velia.cartelle set ruolo_figli = $2 where id = $1`, [riga.id, nuovo]);
    riga.ruolo_figli = nuovo;
    ruoliScritti += 1;
  }

  // --- Strato 2: il significato delle cartelle libere ------------------------
  const per = indicizza(righe);
  const ruoloDelPadre = (r: RigaCartella): RuoloFigli | null =>
    r.parent_id ? (per.get(r.parent_id)?.ruolo_figli ?? null) : null;

  let descrizioniScritte = 0;
  if (descrittore) {
    /* Solo le cartelle libere: le istanze di un livello (un cliente, un anno)
       non si descrivono una per una, sarebbe esattamente l'elenco che questa
       convenzione non deve contenere. */
    const daDescrivere = righe
      .filter((r) => !r.descrizione_da_utente && !r.descrizione && ruoloDelPadre(r) === null)
      .slice(0, DESCRIZIONI_PER_GIRO);
    if (daDescrivere.length) {
      const titoli = await titoliPerCartella(
        client,
        tenantId,
        daDescrivere.map((r) => r.id),
      );
      const conContenuto = daDescrivere
        .filter((r) => (titoli.get(r.id) ?? []).length > 0)
        .map((r) => ({ id: r.id, percorso: percorsoDi(r.id, per), titoli: titoli.get(r.id)! }));
      if (conContenuto.length) {
        try {
          const descrizioni = await descrittore.descrivi(conContenuto);
          for (const [id, testo] of descrizioni) {
            const pulito = testo.trim().slice(0, 500);
            if (!pulito) continue;
            /* `and not descrizione_da_utente`: se un umano ha scritto mentre
               calcolavamo, la sua riga resta. La mano vince, sempre. */
            await client.query(
              `update velia.cartelle set descrizione = $2
               where id = $1 and not descrizione_da_utente`,
              [id, pulito],
            );
            const riga = per.get(id);
            if (riga) riga.descrizione = pulito;
            descrizioniScritte += 1;
          }
        } catch {
          /* Una descrizione mancata non è un ricalcolo fallito: la forma,
             che è la parte che conta, è già scritta. */
        }
      }
    }
  }

  const testo = rendiTesto(righe, figliDi);
  const impronta = improntaAlbero(righe);
  await client.query(
    `insert into velia.convenzione_archivio (tenant_id, testo, impronta, da_ricalcolare, calcolata_il)
     values ($1, $2, $3, false, now())
     on conflict (tenant_id) do update
       set testo = excluded.testo, impronta = excluded.impronta,
           da_ricalcolare = false, calcolata_il = now(), updated_at = now()`,
    [tenantId, testo, impronta],
  );
  return { testo, impronta, ruoliScritti, descrizioniScritte };
}

/** I titoli dentro una cartella: il materiale da cui si capisce cosa ci va. */
async function titoliPerCartella(
  client: Interrogabile,
  tenantId: string,
  cartelle: string[],
): Promise<Map<string, string[]>> {
  if (!cartelle.length) return new Map();
  const r = await client.query<{ cartella_id: string; titoli: string[] }>(
    `select cartella_id, (array_agg(titolo order by caricato_il desc))[1:12] as titoli
     from velia.documenti
     where archivio = 'privato' and tenant_id = $1 and cartella_id = any($2)
     group by cartella_id`,
    [tenantId, cartelle],
  );
  return new Map(r.rows.map((x) => [x.cartella_id, x.titoli]));
}

/**
 * Il testo che va al modello.
 *
 * La regola di scrittura è una sola e va tenuta: si scende dentro le
 * cartelle libere, mai dentro le istanze di un livello. «Clienti» produce
 * una riga; i tremila clienti che ci stanno dentro, zero.
 */
export function rendiTesto(
  righe: RigaCartella[],
  figliDi: Map<string | null, RigaCartella[]>,
): string {
  if (!righe.length) {
    return (
      "# Come è organizzato l'Archivio Privato\n\n" +
      "L'archivio non ha ancora cartelle: i documenti stanno tutti in «Da sistemare».\n"
    );
  }

  const linee: string[] = [];
  let libereScritte = 0;
  let libereSaltate = 0;

  const scendi = (nodo: RigaCartella, profondita: number, percorso: string): void => {
    const figli = figliDi.get(nodo.id) ?? [];
    const rientro = '  '.repeat(profondita);

    if (libereScritte >= MASSIME_LIBERE) {
      libereSaltate += 1;
      return;
    }
    libereScritte += 1;
    linee.push(
      `${rientro}- \`${percorso}/\`${nodo.descrizione ? ` — ${nodo.descrizione}` : ''}`,
    );

    if (nodo.ruolo_figli) {
      // Il livello ha un significato: si dice quello, non i nomi che contiene.
      linee.push(
        `${rientro}  - i figli sono **${nodo.ruolo_figli}** (${figli.length} cartelle, non elencate qui)`,
      );
      descriviSotto(figli, profondita + 2, nodo.ruolo_figli);
      return;
    }
    if (profondita >= 4) return;
    for (const figlio of figli) scendi(figlio, profondita + 1, `${percorso}/${figlio.nome}`);
  };

  /** Dentro le istanze: si guarda che forma hanno *tutte*, non una per una. */
  const descriviSotto = (istanze: RigaCartella[], profondita: number, ruolo: RuoloFigli): void => {
    if (profondita >= 8) return;
    const conteggi = new Map<RuoloFigli, number>();
    const nipoti: RigaCartella[] = [];
    for (const i of istanze) {
      if (i.ruolo_figli) conteggi.set(i.ruolo_figli, (conteggi.get(i.ruolo_figli) ?? 0) + 1);
      nipoti.push(...(figliDi.get(i.id) ?? []));
    }
    const maggioranza = [...conteggi.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!maggioranza || maggioranza[1] / istanze.length < 0.4) return;
    const rientro = '  '.repeat(profondita);
    linee.push(`${rientro}- dentro ogni ${SINGOLARE[ruolo]} → **${maggioranza[0]}**`);
    descriviSotto(nipoti, profondita + 1, maggioranza[0]);
  };

  for (const radice of figliDi.get(null) ?? []) scendi(radice, 0, radice.nome);

  const coda = libereSaltate
    ? `\n(e altre ${libereSaltate} cartelle non elencate: usa Glob per vederle)\n`
    : '';

  return (
    "# Come è organizzato l'Archivio Privato\n\n" +
    "Questo è l'albero dell'agenzia, con il significato dei livelli. I nomi delle singole cartelle di un livello etichettato **non sono elencati**: per trovarli usa `Glob`.\n\n" +
    `${linee.join('\n')}\n${coda}\n` +
    'I documenti che non è stato possibile collocare stanno in `Da sistemare/`: ci sono, si leggono e si citano come tutti gli altri.\n'
  );
}

/**
 * L'impronta della *forma* dell'albero: cambia quando cambia la struttura,
 * non quando arriva un documento. È ciò che rende il ricalcolo un'operazione
 * rara invece che una tassa su ogni upload.
 */
export function improntaAlbero(righe: RigaCartella[]): string {
  const linee = righe
    .map((r) => `${r.parent_id ?? '-'}|${r.slug}|${r.ruolo_figli ?? '-'}|${r.descrizione ?? ''}`)
    .sort();
  return createHash('sha256').update(linee.join('\n')).digest('hex').slice(0, 32);
}

/**
 * Il ricalcolo in differita: si fa solo se l'albero è cambiato di forma.
 *
 * È la traduzione in codice della regola «si aggiorna quando cambiano le
 * cartelle, non a ogni file»: chi carica quaranta documenti in una cartella
 * che esiste già non paga niente, chi crea o sposta una cartella paga un
 * ricalcolo, una volta.
 */
export async function assicuraConvenzioneAggiornata(
  client: Interrogabile,
  tenantId: string,
  descrittore?: Descrittore,
): Promise<boolean> {
  const r = await client.query<{ da_ricalcolare: boolean }>(
    `select da_ricalcolare from velia.convenzione_archivio where tenant_id = $1`,
    [tenantId],
  );
  // Nessuna riga = mai calcolata: è il primo giro, e c'è tutto da guardare.
  if (r.rows[0] && !r.rows[0].da_ricalcolare) return false;
  await ricalcolaConvenzione(client, tenantId, descrittore);
  return true;
}

/**
 * La convenzione che vale: la correzione umana se c'è, altrimenti quella
 * osservata. È questa, e solo questa, che va nei prompt.
 */
export async function convenzioneEffettiva(
  client: Interrogabile,
  tenantId: string,
): Promise<string> {
  const r = await client.query<{ testo: string; testo_utente: string | null }>(
    `select testo, testo_utente from velia.convenzione_archivio where tenant_id = $1`,
    [tenantId],
  );
  const riga = r.rows[0];
  if (!riga) return '';
  return (riga.testo_utente ?? '').trim() || riga.testo;
}
