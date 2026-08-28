import Anthropic from '@anthropic-ai/sdk';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import { configurazione } from '../../config.js';
import { FASCE_SALUTO, type FasciaSaluto, type LottoSaluti } from '../../contratto/sessione.js';

/**
 * I saluti della schermata iniziale, generati dal modello.
 *
 * Un lotto: per ogni fascia oraria una manciata di frasi con il segnaposto
 * `{nome}`. Lo genera l'API quando quello in tabella è più vecchio di
 * `SALUTI_ORE_VALIDITA`, in background e una sola volta per processo:
 * la richiesta che lo trova scaduto riceve intanto il lotto vecchio, la
 * successiva quello nuovo. Niente cron: nessun costo quando nessuno entra.
 *
 * Il modello non vede nomi di utenti né tenant: riceve solo il calendario
 * (giorno, stagione, festività vicine) e il tono. Le frasi passano da un
 * filtro che scarta quel che non regge (segnaposto mancante, emoji, forme
 * al maschile/femminile, lunghezza); una fascia rimasta vuota lascia al
 * FE le sue frasi fisse.
 */
export interface GeneratoreSaluti {
  genera(contesto: ContestoSaluti): Promise<Partial<Record<FasciaSaluto, string[]>>>;
}

/** Quel che il modello sa del momento in cui le frasi verranno lette. */
export interface ContestoSaluti {
  /** Es. «giovedì 28 agosto 2026». */
  data: string;
  stagione: string;
  /** Es. «Ferragosto (domani, sabato 15 agosto)»; vuoto se non ce ne sono a ridosso. */
  festivita: string[];
  fineSettimana: boolean;
}

export const FRASI_PER_FASCIA = 5;

const DESCRIZIONE_FASCE: Record<FasciaSaluto, string> = {
  notte: 'dalle 0 alle 5: chi è qui a quest’ora lavora tardi, si merita un sorriso',
  alba: 'dalle 5 alle 9: mattino presto, i primi ad arrivare in agenzia',
  mattina: 'dalle 9 alle 13: piena mattina di lavoro',
  pranzo: 'dalle 13 alle 15: ora di pranzo',
  pomeriggio: 'dalle 15 alle 19: pomeriggio',
  sera: 'dalle 19 alle 24: sera, la giornata si chiude',
};

const ISTRUZIONI = `Scrivi i saluti della schermata iniziale di Velia, piattaforma AI per intermediari assicurativi italiani (agenzie, broker). Il saluto è il titolo che l'utente legge appena entra, prima di scrivere la domanda: una riga, come l'ingresso di un collega che ti conosce.

Ricevi il calendario del giorno e le sei fasce orarie. Per OGNI fascia scrivi ${FRASI_PER_FASCIA} frasi diverse tra loro, in italiano, dando del tu.

Regole:
- ogni frase contiene il segnaposto {nome} una volta sola (verrà sostituito dal nome dell'utente);
- da 4 a 12 parole, massimo 70 caratteri, una riga, senza emoji, senza virgolette, senza trattini lunghi;
- tono sobrio e caldo, mai ruffiano, mai da pubblicità, mai brusco; al massimo un punto esclamativo, e raramente;
- italiano pieno: niente anglicismi (weekend, week, last minute, ok); non nominare Velia;
- niente forme che presuppongono il genere (no «benvenuto», «pronto», «stanco»): usa giri neutri;
- niente meteo, niente attualità, niente battute su sinistri, incidenti o disgrazie;
- il calendario si usa con parsimonia: in ogni fascia AL MASSIMO UNA frase può accennare al giorno della settimana, al fine settimana o a una festa; le altre devono valere per qualsiasi giorno;
- non far notare più di una volta per fascia che l'utente lavora in un orario o in un giorno insolito;
- almeno metà delle frasi finisce con un invito concreto a cominciare (una domanda, «dimmi tu», «su cosa lavoriamo»).

Esempi del tono giusto: «Buongiorno {nome}, su cosa lavoriamo?» · «Il caffè, i documenti, e via: buongiorno {nome}.» · «Ancora in piedi, {nome}?» · «Il pomeriggio è per i confronti, {nome}: dimmi tu.» · «Buonasera {nome}, chiudiamo bene la giornata?». Non copiarli: scrivine di nuovi.

Rispondi SOLO con un oggetto JSON con le chiavi ${FASCE_SALUTO.map((f) => `"${f}"`).join(', ')}, ognuna un array di ${FRASI_PER_FASCIA} stringhe. Niente testo fuori dal JSON.`;

export class GeneratoreSalutiAnthropic implements GeneratoreSaluti {
  private readonly client: Anthropic;
  readonly modello: string;

  constructor() {
    const config = configurazione();
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY mancante in .env: la generazione dei saluti la richiede.');
    }
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    this.modello = config.MODELLO_SALUTI;
  }

  async genera(contesto: ContestoSaluti): Promise<Partial<Record<FasciaSaluto, string[]>>> {
    const messaggio = await this.client.messages.create({
      model: this.modello,
      /* Largo: sui modelli col pensiero adattivo il ragionamento conta nel
         tetto, e un lotto troncato è un lotto perso. Si paga solo l'usato. */
      max_tokens: 6000,
      system: ISTRUZIONI,
      messages: [{ role: 'user', content: descriviContesto(contesto) }],
    });
    const testo = messaggio.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    try {
      return interpretaLotto(testo);
    } catch (errore) {
      throw new Error(`${(errore as Error).message} (stop_reason: ${messaggio.stop_reason ?? '?'})`, { cause: errore });
    }
  }
}

/** Il messaggio utente: il calendario e le fasce, senza altro. */
export function descriviContesto(contesto: ContestoSaluti): string {
  const righe = [
    `Oggi è ${contesto.data}, ${contesto.stagione}${contesto.fineSettimana ? ', fine settimana' : ''}.`,
    contesto.festivita.length
      ? `Festività a ridosso: ${contesto.festivita.join('; ')}.`
      : 'Nessuna festività a ridosso.',
    '',
    'Fasce orarie:',
    ...FASCE_SALUTO.map((f) => `- ${f}: ${DESCRIZIONE_FASCE[f]}`),
  ];
  return righe.join('\n');
}

const schemaLotto = z.object({
  notte: z.array(z.string()).default([]),
  alba: z.array(z.string()).default([]),
  mattina: z.array(z.string()).default([]),
  pranzo: z.array(z.string()).default([]),
  pomeriggio: z.array(z.string()).default([]),
  sera: z.array(z.string()).default([]),
});

/** Dal testo del modello all'oggetto: tollera il JSON dentro una recinzione; se non c'è, lancia. */
export function interpretaLotto(testo: string): Record<FasciaSaluto, string[]> {
  const inizio = testo.indexOf('{');
  const fine = testo.lastIndexOf('}');
  if (inizio < 0 || fine <= inizio) throw new Error('risposta senza oggetto JSON');
  return schemaLotto.parse(JSON.parse(testo.slice(inizio, fine + 1)));
}

/* ------------------------------------------------------------------ */
/* Il filtro                                                            */
/* ------------------------------------------------------------------ */

const LUNGHEZZA_MASSIMA = 80;
/** Lettere latine (accenti compresi), cifre, spazio e la punteggiatura di una frase. */
const CARATTERI_AMMESSI = /^[\p{Script=Latin}\p{N}\s.,;:!?'’«»()\-{}]+$/u;
/** «pronto/a», «pronta(o)»: la forma doppia che si vuole evitare. */
const FORMA_DOPPIA = /[a-zà-ú]\/[oa]\b|\((?:o|a)\)/i;
/** Anglicismi e autocitazioni che il prompt vieta e il modello ogni tanto infila lo stesso. */
const PAROLE_VIETATE = /\b(weekend|week|last minute|ok|velia)\b/i;
/**
 * Aggettivi rivolti alla persona che ne presuppongono il genere: il prompt
 * li vieta, il modello ogni tanto li infila («pronto a», «primo ad
 * arrivare»). Lista corta e mirata: le parole ambigue (solo, prima) restano.
 */
const AGGETTIVI_DI_GENERE =
  /\b(pront[oa]|benvenut[oa]|stanc[oa]|conness[oa]|operativ[oa]|attiv[oa]|concentrat[oa]|immers[oa]|sveglio|mattinier[oa]|nottambul[oa]|indaffarat[oa]|impegnat[oa]|caric[oa]|sol[oa] in|prim[oa] (?:ad|in|a))\b/i;

/**
 * Una frase per volta: normalizza quel che si può (spazi, virgolette,
 * trattini lunghi) e scarta il resto. Torna `undefined` se non regge.
 */
export function ripulisciFrase(grezza: string): string | undefined {
  const frase = grezza
    .replace(/\s*[—–]\s*/g, ' - ')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[«»'\s]+|[«»'\s]+$/g, '');
  if (frase.length < 6 || frase.length > LUNGHEZZA_MASSIMA) return undefined;
  if (frase.split('{nome}').length !== 2) return undefined;
  if (!CARATTERI_AMMESSI.test(frase)) return undefined;
  if (/[{}]/.test(frase.replace('{nome}', ''))) return undefined;
  if (FORMA_DOPPIA.test(frase)) return undefined;
  if (PAROLE_VIETATE.test(frase)) return undefined;
  if (AGGETTIVI_DI_GENERE.test(frase)) return undefined;
  if ((frase.match(/!/g) ?? []).length > 1) return undefined;
  return frase;
}

/** Il lotto filtrato: per fascia, frasi valide e distinte, mai più di `FRASI_PER_FASCIA`. */
export function ripulisciLotto(grezzo: Partial<Record<FasciaSaluto, string[]>>): Record<FasciaSaluto, string[]> {
  const pulito = {} as Record<FasciaSaluto, string[]>;
  for (const fascia of FASCE_SALUTO) {
    const viste = new Set<string>();
    const tenute: string[] = [];
    for (const grezza of grezzo[fascia] ?? []) {
      const frase = ripulisciFrase(grezza);
      if (!frase) continue;
      const chiave = frase.toLowerCase();
      if (viste.has(chiave)) continue;
      viste.add(chiave);
      tenute.push(frase);
      if (tenute.length >= FRASI_PER_FASCIA) break;
    }
    pulito[fascia] = tenute;
  }
  return pulito;
}

/* ------------------------------------------------------------------ */
/* Il calendario                                                        */
/* ------------------------------------------------------------------ */

const FUSO = 'Europe/Rome';

interface GiornoRoma {
  anno: number;
  mese: number;
  giorno: number;
  /** 0 = domenica, come `Date#getDay`. */
  giornoSettimana: number;
}

/** La data civile a Roma: l'API può girare in UTC, gli utenti no. */
function giornoRoma(momento: Date): GiornoRoma {
  const parti = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(momento);
  const valore = (tipo: string) => parti.find((p) => p.type === tipo)?.value ?? '';
  const settimana = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    anno: Number(valore('year')),
    mese: Number(valore('month')),
    giorno: Number(valore('day')),
    giornoSettimana: settimana.indexOf(valore('weekday')),
  };
}

/** Pasqua gregoriana (algoritmo di Meeus/Jones/Butcher): mese e giorno. */
export function pasqua(anno: number): { mese: number; giorno: number } {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return { mese, giorno };
}

/** Le festività italiane dell'anno, con la data in UTC (serve solo a contare i giorni). */
export function festivitaDellAnno(anno: number): { nome: string; data: Date }[] {
  const fisse: [number, number, string][] = [
    [1, 1, 'Capodanno'],
    [1, 6, 'Epifania'],
    [4, 25, 'Festa della Liberazione'],
    [5, 1, 'Festa dei lavoratori'],
    [6, 2, 'Festa della Repubblica'],
    [8, 15, 'Ferragosto'],
    [11, 1, 'Ognissanti'],
    [12, 8, 'Immacolata'],
    [12, 24, 'Vigilia di Natale'],
    [12, 25, 'Natale'],
    [12, 26, 'Santo Stefano'],
    [12, 31, 'San Silvestro'],
  ];
  const p = pasqua(anno);
  const giornoPasqua = Date.UTC(anno, p.mese - 1, p.giorno);
  return [
    ...fisse.map(([mese, giorno, nome]) => ({ nome, data: new Date(Date.UTC(anno, mese - 1, giorno)) })),
    { nome: 'Pasqua', data: new Date(giornoPasqua) },
    { nome: 'Pasquetta', data: new Date(giornoPasqua + 86_400_000) },
  ];
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
];

function stagioneDi(mese: number): string {
  if (mese === 12 || mese <= 2) return 'inverno';
  if (mese <= 5) return 'primavera';
  if (mese <= 8) return 'estate';
  return 'autunno';
}

/** Il contesto del momento: oggi (a Roma) e le festività entro tre giorni, oggi compreso. */
export function contestoPer(momento: Date): ContestoSaluti {
  const oggi = giornoRoma(momento);
  const oggiUtc = Date.UTC(oggi.anno, oggi.mese - 1, oggi.giorno);
  const festivita = [...festivitaDellAnno(oggi.anno), ...festivitaDellAnno(oggi.anno + 1)]
    .map((f) => ({ ...f, fra: Math.round((f.data.getTime() - oggiUtc) / 86_400_000) }))
    .filter((f) => f.fra >= 0 && f.fra <= 3)
    .sort((a, b) => a.fra - b.fra)
    .map((f) => {
      const quando = f.fra === 0 ? 'oggi' : f.fra === 1 ? 'domani' : `fra ${f.fra} giorni`;
      return `${f.nome} (${quando}, ${GIORNI[f.data.getUTCDay()]} ${f.data.getUTCDate()} ${MESI[f.data.getUTCMonth()]})`;
    });
  return {
    data: `${GIORNI[oggi.giornoSettimana]} ${oggi.giorno} ${MESI[oggi.mese - 1]} ${oggi.anno}`,
    stagione: stagioneDi(oggi.mese),
    festivita,
    fineSettimana: oggi.giornoSettimana === 0 || oggi.giornoSettimana === 6,
  };
}

/* ------------------------------------------------------------------ */
/* Il servizio                                                          */
/* ------------------------------------------------------------------ */

interface RigaSaluti {
  generato_il: Date;
  frasi: Partial<Record<FasciaSaluto, string[]>>;
}

export interface OpzioniServizioSaluti {
  /** Nei test: un generatore finto. Di default quello Anthropic, costruito al primo uso. */
  generatore?: GeneratoreSaluti;
  /** Nei test: il pool su cui scrivere. Di default quello del processo. */
  pool?: () => pg.Pool;
  oreValidita?: number;
  adesso?: () => Date;
}

export class ServizioSaluti {
  private generatore: GeneratoreSaluti | undefined;
  private generatoreCercato = false;
  private inCorso: Promise<void> | undefined;

  constructor(private readonly opzioni: OpzioniServizioSaluti = {}) {}

  /** Il lotto più recente, letto col client di chi chiama (dentro la RLS, o di sistema). */
  static async leggi(client: pg.ClientBase | pg.Pool): Promise<LottoSaluti | undefined> {
    const righe = await client.query<RigaSaluti>(
      'select generato_il, frasi from velia.saluti order by generato_il desc limit 1',
    );
    const riga = righe.rows[0];
    if (!riga) return undefined;
    return { generatoIl: riga.generato_il.toISOString(), frasi: ripulisciLotto(riga.frasi) };
  }

  /**
   * Se il lotto manca o è scaduto, ne genera uno nuovo in background. Chi
   * chiama non aspetta: risponde col lotto che ha. Una generazione alla
   * volta per processo; un errore finisce nel log e si riprova alla
   * richiesta successiva.
   */
  rinfresca(lotto: LottoSaluti | undefined, log: FastifyBaseLogger): void {
    if (this.inCorso) return;
    const adesso = this.opzioni.adesso?.() ?? new Date();
    const oreValidita = this.opzioni.oreValidita ?? configurazione().SALUTI_ORE_VALIDITA;
    if (lotto && adesso.getTime() - Date.parse(lotto.generatoIl) < oreValidita * 3_600_000) return;
    const generatore = this.trovaGeneratore(log);
    if (!generatore) return;

    this.inCorso = this.genera(generatore, adesso, log).finally(() => {
      this.inCorso = undefined;
    });
  }

  /** Nei test: aspetta la generazione in corso, se c'è. */
  async attendi(): Promise<void> {
    await this.inCorso;
  }

  private trovaGeneratore(log: FastifyBaseLogger): GeneratoreSaluti | undefined {
    if (this.generatoreCercato) return this.generatore;
    this.generatoreCercato = true;
    try {
      this.generatore = this.opzioni.generatore ?? generatoreDallaConfigurazione();
    } catch (errore) {
      log.warn({ err: errore }, 'saluti: generatore non disponibile, restano le frasi fisse');
    }
    return this.generatore;
  }

  private async genera(generatore: GeneratoreSaluti, adesso: Date, log: FastifyBaseLogger): Promise<void> {
    try {
      const grezzo = await generatore.genera(contestoPer(adesso));
      const frasi = ripulisciLotto(grezzo);
      const totale = FASCE_SALUTO.reduce((n, f) => n + frasi[f].length, 0);
      if (totale === 0) throw new Error('nessuna frase ha passato il filtro');
      const modello = generatore instanceof GeneratoreSalutiAnthropic ? generatore.modello : 'finto';
      const pool = this.opzioni.pool ? this.opzioni.pool() : (await import('../../db/pool.js')).poolDb();
      await pool.query('insert into velia.saluti (generato_il, modello, frasi) values ($1, $2, $3)', [
        adesso,
        modello,
        JSON.stringify(frasi),
      ]);
      log.info({ modello, frasi: totale }, 'saluti: nuovo lotto generato');
    } catch (errore) {
      log.warn({ err: errore }, 'saluti: generazione fallita, resta il lotto precedente');
    }
  }
}

/** Il generatore vero solo con la chiave e se non spento: altrimenti restano le frasi fisse del FE. */
function generatoreDallaConfigurazione(): GeneratoreSaluti | undefined {
  const config = configurazione();
  if (!config.ANTHROPIC_API_KEY || config.SALUTI_GENERAZIONE === 'no') return undefined;
  return new GeneratoreSalutiAnthropic();
}
