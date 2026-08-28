import Anthropic from '@anthropic-ai/sdk';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import { configurazione } from '../../config.js';
import { conIdentita, type Identita } from '../../db/identita.js';

/**
 * I suggerimenti della schermata iniziale: domande di partenza sul
 * contesto dell'agenzia, non il seguito dell'ultima conversazione.
 *
 * Fino al 29/08/2026 li scriveva il worker a ogni risposta, «le prossime
 * domande» su domanda e risposta appena date: in home, il giorno dopo,
 * suonavano fuori contesto. Ora li genera l'API in background, per utente,
 * a partire da ciò che l'agenzia ha davvero: i documenti del suo archivio,
 * compagnie e prodotti dell'archivio pubblico, i ricordi, i temi ricorrenti
 * delle sue conversazioni (i soli titoli). Un lotto vale
 * `SUGGERIMENTI_ORE_VALIDITA` ore, o meno se nel frattempo l'archivio
 * privato è cambiato. Stesso schema dei saluti: chi chiede riceve il lotto
 * che c'è, la generazione non fa aspettare nessuno.
 */
export interface GeneratoreSuggerimenti {
  genera(contesto: ContestoSuggerimenti): Promise<string[]>;
}

export interface ContestoSuggerimenti {
  /** «Set informativo Km&Servizi (Cattolica, Auto)», dal più recente. */
  archivioPrivato: string[];
  /** «Cattolica - AUTOPIÙ (Auto)»: compagnia, prodotto e ramo delle edizioni correnti. */
  archivioPubblico: string[];
  /** I ricordi attivi visibili all'utente: quelli dell'agenzia e i suoi personali. */
  ricordi: string[];
  /** I titoli delle ultime conversazioni dell'utente: indizio di temi, non da continuare. */
  temiRecenti: string[];
}

export const SUGGERIMENTI_PER_LOTTO = 6;

const ISTRUZIONI = `Sei chi propone le domande di partenza nella schermata iniziale di Velia, piattaforma AI per intermediari assicurativi italiani (agenzie, broker). L'utente non ha ancora scritto niente: i suggerimenti sono domande pronte da cliccare, che deve poter fare così come sono.

Ricevi il contesto dell'agenzia: i documenti del suo archivio privato, compagnie e prodotti disponibili nell'archivio pubblico, i ricordi che Velia ha su agenzia e utente (prassi, clienti, preferenze) e i titoli delle ultime conversazioni, come indizio dei temi ricorrenti.

Scrivi ${SUGGERIMENTI_PER_LOTTO} domande in italiano, in prima persona come le scriverebbe l'utente (imperativo o domanda diretta: «Confronta…», «Che franchigie prevede…», «La polizza X copre…?»).

Regole:
- ogni domanda è autosufficiente e generale: NON è il seguito di una conversazione precedente e non presuppone niente di già detto;
- ancorata a ciò che l'agenzia ha davvero: nomina compagnia, prodotto o garanzia presi dal contesto; se il contesto è povero, domande utili sui prodotti dell'archivio pubblico;
- varie per tipo: un confronto fra due prodotti o compagnie, una domanda su franchigie, massimali o esclusioni di una garanzia, cosa copre una polizza in un caso concreto, una tabella o un documento da produrre, una prassi dell'agenzia;
- massimo 14 parole, senza emoji, senza virgolette, senza trattini lunghi, niente numerazione;
- i ricordi servono a capire di cosa si occupa l'agenzia: mai citarli testualmente, mai dati di clienti (nomi, targhe, importi).

Rispondi SOLO con un array JSON di ${SUGGERIMENTI_PER_LOTTO} stringhe. Niente testo fuori dall'array.`;

export class GeneratoreSuggerimentiAnthropic implements GeneratoreSuggerimenti {
  private readonly client: Anthropic;
  readonly modello: string;

  constructor() {
    const config = configurazione();
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY mancante in .env: la generazione dei suggerimenti la richiede.');
    }
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    this.modello = config.MODELLO_SUGGERIMENTI;
  }

  async genera(contesto: ContestoSuggerimenti): Promise<string[]> {
    const messaggio = await this.client.messages.create({
      model: this.modello,
      /* Largo: sui modelli col pensiero adattivo il ragionamento conta nel tetto. */
      max_tokens: 6000,
      system: ISTRUZIONI,
      messages: [{ role: 'user', content: descriviContesto(contesto) }],
    });
    const testo = messaggio.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    try {
      return interpretaSuggerimenti(testo);
    } catch (errore) {
      throw new Error(`${(errore as Error).message} (stop_reason: ${messaggio.stop_reason ?? '?'})`, { cause: errore });
    }
  }
}

function elenco(titolo: string, voci: string[]): string[] {
  return [titolo, ...(voci.length ? voci.map((v) => `- ${v}`) : ['- (nessuno)']), ''];
}

/** Il messaggio utente: il contesto, sezione per sezione. */
export function descriviContesto(contesto: ContestoSuggerimenti): string {
  return [
    ...elenco("Archivio privato dell'agenzia (dal più recente):", contesto.archivioPrivato),
    ...elenco('Archivio pubblico (compagnia - prodotto (ramo)):', contesto.archivioPubblico),
    ...elenco('Ricordi su agenzia e utente:', contesto.ricordi),
    ...elenco('Temi ricorrenti (titoli delle ultime conversazioni, da non continuare):', contesto.temiRecenti),
  ]
    .join('\n')
    .trim();
}

export const schemaSuggerimenti = z.array(z.string().trim().min(1).max(300)).min(1).max(12);

/** Dal testo del modello all'elenco: tollera il JSON dentro una recinzione; se non c'è, lancia. */
export function interpretaSuggerimenti(testo: string): string[] {
  const inizio = testo.indexOf('[');
  const fine = testo.lastIndexOf(']');
  if (inizio < 0 || fine <= inizio) throw new Error('risposta senza array JSON');
  return schemaSuggerimenti.parse(JSON.parse(testo.slice(inizio, fine + 1)));
}

/* ------------------------------------------------------------------ */
/* Il filtro                                                            */
/* ------------------------------------------------------------------ */

const LUNGHEZZA_MASSIMA = 140;
const CARATTERI_AMMESSI = /^[\p{Script=Latin}\p{N}\s.,;:!?'’«»()/%&+-]+$/u;

/** Una domanda per volta: normalizza spazi, virgolette e trattini lunghi; scarta quel che non regge. */
export function ripulisciSuggerimento(grezzo: string): string | undefined {
  const testo = grezzo
    .replace(/\s*[—–]\s*/g, ' - ')
    .replace(/[“”"]/g, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[«»'\s]+|[«»'\s]+$/g, '');
  if (testo.length < 8 || testo.length > LUNGHEZZA_MASSIMA) return undefined;
  if (!CARATTERI_AMMESSI.test(testo)) return undefined;
  return testo;
}

/** Il lotto filtrato: domande valide e distinte, mai più di `SUGGERIMENTI_PER_LOTTO`. */
export function ripulisciSuggerimenti(grezzi: string[]): string[] {
  const viste = new Set<string>();
  const tenuti: string[] = [];
  for (const grezzo of grezzi) {
    const testo = ripulisciSuggerimento(grezzo);
    if (!testo) continue;
    const chiave = testo.toLowerCase();
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    tenuti.push(testo);
    if (tenuti.length >= SUGGERIMENTI_PER_LOTTO) break;
  }
  return tenuti;
}

/* ------------------------------------------------------------------ */
/* Il contesto dal database                                             */
/* ------------------------------------------------------------------ */

const LIMITI = { privato: 40, pubblico: 60, ricordi: 25, temi: 15 };

function conParentesi(...parti: (string | null | undefined)[]): string {
  const dentro = parti.filter(Boolean).join(', ');
  return dentro ? ` (${dentro})` : '';
}

/** Legge il contesto con l'identità dell'utente: la RLS decide cosa vede, qui si compone soltanto. */
export async function raccogliContesto(client: pg.ClientBase, identita: Identita): Promise<ContestoSuggerimenti> {
  const privato = await client.query<{ titolo: string; tipologia: string; compagnia: string | null; ramo: string | null }>(
    `select d.titolo, d.tipologia, c.nome as compagnia, r.nome as ramo
     from velia.documenti d
     left join velia.compagnie c on c.id = d.compagnia_id
     left join velia.rami r on r.id = d.ramo_id
     where d.archivio = 'privato' and d.tenant_id = $1 and d.stato = 'pronto'
     order by d.caricato_il desc nulls last, d.id limit ${LIMITI.privato}`,
    [identita.tenantId],
  );
  const pubblico = await client.query<{ compagnia: string; prodotto: string; ramo: string }>(
    `select distinct c.nome as compagnia, d.prodotto, r.nome as ramo
     from velia.documenti d
     join velia.compagnie c on c.id = d.compagnia_id
     join velia.rami r on r.id = d.ramo_id
     where d.archivio = 'pubblico' and d.edizione_corrente
     order by 1, 2 limit ${LIMITI.pubblico}`,
  );
  const ricordi = await client.query<{ testo: string }>(
    `select testo from velia.ricordi
     where tenant_id = $1 and attivo and (ambito = 'tenant' or utente_id = $2)
     order by updated_at desc, id limit ${LIMITI.ricordi}`,
    [identita.tenantId, identita.utenteId],
  );
  const temi = await client.query<{ titolo: string }>(
    `select titolo from velia.conversazioni
     where autore_id = $1 and titolo <> 'Nuova conversazione'
     order by updated_at desc, id limit ${LIMITI.temi}`,
    [identita.utenteId],
  );
  return {
    archivioPrivato: privato.rows.map((r) => `${r.titolo}${conParentesi(r.tipologia, r.compagnia, r.ramo)}`),
    archivioPubblico: pubblico.rows.map((r) => `${r.compagnia} - ${r.prodotto} (${r.ramo})`),
    ricordi: ricordi.rows.map((r) => r.testo),
    temiRecenti: temi.rows.map((r) => r.titolo),
  };
}

/* ------------------------------------------------------------------ */
/* Il servizio                                                          */
/* ------------------------------------------------------------------ */

export interface LottoSuggerimenti {
  generatoIl: string;
  testi: string[];
}

/** Quel che la rotta legge: il lotto dell'utente e quando l'archivio privato è cambiato l'ultima volta. */
export interface StatoSuggerimenti {
  lotto: LottoSuggerimenti | undefined;
  archivioAggiornatoIl: Date | undefined;
}

export interface OpzioniServizioSuggerimenti {
  /** Nei test: un generatore finto. Di default quello Anthropic, costruito al primo uso. */
  generatore?: GeneratoreSuggerimenti;
  /** Nei test: il pool su cui leggere il contesto e scrivere. Di default quello del processo. */
  pool?: () => pg.Pool;
  oreValidita?: number;
  adesso?: () => Date;
}

export class ServizioSuggerimenti {
  private generatore: GeneratoreSuggerimenti | undefined;
  private generatoreCercato = false;
  /** Una generazione alla volta per utente. */
  private readonly inCorso = new Map<string, Promise<void>>();

  constructor(private readonly opzioni: OpzioniServizioSuggerimenti = {}) {}

  static async leggi(client: pg.ClientBase, identita: Identita): Promise<StatoSuggerimenti> {
    /* Un lotto solo per utente (il nuovo cancella il vecchio): l'ordine di
       lettura è quello di scrittura, un millisecondo per riga. */
    const righe = await client.query<{ testo: string; created_at: Date }>(
      `select testo, created_at from velia.suggerimenti
       where utente_id = $1 order by created_at, id limit ${SUGGERIMENTI_PER_LOTTO}`,
      [identita.utenteId],
    );
    const archivio = await client.query<{ al: Date | null }>(
      `select max(caricato_il) as al from velia.documenti where archivio = 'privato' and tenant_id = $1`,
      [identita.tenantId],
    );
    const prima = righe.rows[0];
    return {
      lotto: prima ? { generatoIl: prima.created_at.toISOString(), testi: righe.rows.map((r) => r.testo) } : undefined,
      archivioAggiornatoIl: archivio.rows[0]?.al ?? undefined,
    };
  }

  /**
   * Se il lotto manca, è scaduto o è più vecchio dell'ultimo documento
   * caricato, ne genera uno nuovo in background per questo utente. Chi
   * chiama non aspetta. Un errore finisce nel log e si riprova alla
   * richiesta successiva.
   */
  rinfresca(stato: StatoSuggerimenti, identita: Identita, log: FastifyBaseLogger): void {
    if (this.inCorso.has(identita.utenteId)) return;
    const adesso = this.opzioni.adesso?.() ?? new Date();
    const oreValidita = this.opzioni.oreValidita ?? configurazione().SUGGERIMENTI_ORE_VALIDITA;
    const { lotto, archivioAggiornatoIl } = stato;
    if (lotto) {
      const generatoIl = Date.parse(lotto.generatoIl);
      const scaduto = adesso.getTime() - generatoIl >= oreValidita * 3_600_000;
      const superato = archivioAggiornatoIl !== undefined && archivioAggiornatoIl.getTime() > generatoIl;
      if (!scaduto && !superato) return;
    }
    const generatore = this.trovaGeneratore(log);
    if (!generatore) return;

    const lavoro = this.genera(generatore, identita, adesso, log).finally(() => {
      this.inCorso.delete(identita.utenteId);
    });
    this.inCorso.set(identita.utenteId, lavoro);
  }

  /** Nei test: aspetta la generazione in corso per l'utente, se c'è. */
  async attendi(utenteId: string): Promise<void> {
    await this.inCorso.get(utenteId);
  }

  private trovaGeneratore(log: FastifyBaseLogger): GeneratoreSuggerimenti | undefined {
    if (this.generatoreCercato) return this.generatore;
    this.generatoreCercato = true;
    try {
      this.generatore = this.opzioni.generatore ?? generatoreDallaConfigurazione();
    } catch (errore) {
      log.warn({ err: errore }, 'suggerimenti: generatore non disponibile, restano gli esempi');
    }
    return this.generatore;
  }

  private async genera(
    generatore: GeneratoreSuggerimenti,
    identita: Identita,
    adesso: Date,
    log: FastifyBaseLogger,
  ): Promise<void> {
    try {
      const pool = this.opzioni.pool ? this.opzioni.pool() : (await import('../../db/pool.js')).poolDb();
      const contesto = await conIdentita(pool, identita, (client) => raccogliContesto(client, identita));
      const testi = ripulisciSuggerimenti(await generatore.genera(contesto));
      if (!testi.length) throw new Error('nessun suggerimento ha passato il filtro');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`delete from velia.suggerimenti where utente_id = $1`, [identita.utenteId]);
        for (const [i, testo] of testi.entries()) {
          await client.query(
            `insert into velia.suggerimenti (tenant_id, utente_id, testo, created_at) values ($1, $2, $3, $4)`,
            [identita.tenantId, identita.utenteId, testo, new Date(adesso.getTime() + i)],
          );
        }
        await client.query('commit');
      } catch (errore) {
        await client.query('rollback').catch(() => undefined);
        throw errore;
      } finally {
        client.release();
      }
      const modello = generatore instanceof GeneratoreSuggerimentiAnthropic ? generatore.modello : 'finto';
      log.info({ modello, suggerimenti: testi.length, utente: identita.utenteId }, 'suggerimenti: nuovo lotto generato');
    } catch (errore) {
      log.warn({ err: errore, utente: identita.utenteId }, 'suggerimenti: generazione fallita, resta il lotto precedente');
    }
  }
}

/** Il generatore vero solo con la chiave e se non spento: altrimenti restano gli esempi del FE. */
function generatoreDallaConfigurazione(): GeneratoreSuggerimenti | undefined {
  const config = configurazione();
  if (!config.ANTHROPIC_API_KEY || config.SUGGERIMENTI_GENERAZIONE === 'no') return undefined;
  return new GeneratoreSuggerimentiAnthropic();
}
