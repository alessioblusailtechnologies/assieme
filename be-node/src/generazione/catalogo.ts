import type pg from 'pg';

import type { Citazione } from '../contratto/conversazioni.js';
import {
  INTESTAZIONE_INIZIALE,
  immaginiDellaFascia,
  schemaIntestazione,
  type Intestazione,
} from '../contratto/intestazione.js';
import type { FormatoModello, ModelloRiferimento, StatoAnteprima } from '../contratto/template.js';
import type { ArchivioFile } from '../worker/ingestion/archivio-file.js';
import { dimensioniImmagine, tipoImmagine, type FasceDocumento, type ImmagineFascia } from './intestazione.js';

/**
 * I modelli di riferimento e l'intestazione dell'agenzia, letti dal
 * database: le funzioni che API (esporta chat/tabelle, documento degli
 * agenti) e worker (i tool dei documenti in chat, la sandbox) condividono.
 * Niente Fastify qui.
 *
 * Dall'11/09/2026 (fase 3 di `PIANO-INTESTAZIONE-MODELLI.md`) i modelli
 * servono solo alla sandbox («Genera da modello»); i documenti
 * deterministici escono col layout di VELIA e l'intestazione dell'agenzia
 * (`fasceDelTenant`).
 */

export interface RigaModello {
  id: string;
  tenant_id: string;
  nome: string;
  formato: FormatoModello;
  descrizione: string;
  intestazione_agenzia: boolean;
  anteprima: StatoAnteprima;
  path_file: string;
  path_anteprima: string | null;
  created_at: Date;
}

const COLONNE = `id, tenant_id, nome, formato, descrizione, intestazione_agenzia, anteprima, path_file,
  path_anteprima, created_at`;

/** Dove sta il file di un modello, e la sua anteprima convertita in PDF. */
export const percorsoModello = (tenantId: string, id: string, formato: string): string =>
  `tenant/${tenantId}/template/${id}.${formato}`;

export const percorsoAnteprimaModello = (tenantId: string, id: string): string =>
  `tenant/${tenantId}/template/${id}-anteprima.pdf`;

export async function modelloPerId(client: pg.ClientBase, id: string): Promise<RigaModello | undefined> {
  const r = await client.query<RigaModello>(`select ${COLONNE} from velia.template where id = $1`, [id]);
  return r.rows[0];
}

/** I modelli del tenant, per data di caricamento. */
export async function modelliDelTenant(client: pg.ClientBase, tenantId: string): Promise<RigaModello[]> {
  const r = await client.query<RigaModello>(
    `select ${COLONNE} from velia.template where tenant_id = $1 order by created_at, id`,
    [tenantId],
  );
  return r.rows;
}

export function versoModello(r: RigaModello): ModelloRiferimento {
  return {
    id: r.id,
    nome: r.nome,
    formato: r.formato,
    descrizione: r.descrizione,
    intestazioneAgenzia: r.intestazione_agenzia,
    anteprima: r.formato === 'pdf' ? 'pronta' : r.anteprima,
    caricatoIl: r.created_at.toISOString(),
  };
}

export async function elencoModelli(client: pg.ClientBase, tenantId: string): Promise<ModelloRiferimento[]> {
  return (await modelliDelTenant(client, tenantId)).map(versoModello);
}

/**
 * Il modello dal nome che il motore della chat passa, come l'ha detto
 * l'utente: preciso (senza maiuscole) o l'unico che lo contiene, oppure
 * l'id. Pura: provata a parte.
 */
export function scegliModello(
  modelli: RigaModello[],
  nome: string,
): { esito: 'ok'; modello: RigaModello } | { esito: 'non-trovato'; motivo: string } {
  const cercato = nome.trim().toLowerCase();
  const preciso = modelli.find((m) => m.id === cercato || m.nome.toLowerCase() === cercato);
  const parziali = modelli.filter((m) => m.nome.toLowerCase().includes(cercato));
  const scelto = preciso ?? (parziali.length === 1 ? parziali[0] : undefined);
  if (scelto) return { esito: 'ok', modello: scelto };
  const disponibili = modelli.length
    ? `Modelli dell’agenzia: ${modelli.map((m) => `«${m.nome}» (${m.formato})`).join(', ')}.`
    : 'L’agenzia non ha modelli caricati: procedi senza, o indica solo il formato.';
  return {
    esito: 'non-trovato',
    motivo:
      parziali.length > 1
        ? `Più modelli corrispondono a «${nome}»: ${parziali.map((m) => `«${m.nome}»`).join(', ')}. Chiedi all’utente quale vuole.`
        : `Nessun modello chiamato «${nome}». ${disponibili}`,
  };
}

/** Parole di un nome di modello che non bastano a dire che lo si è nominato. */
const PAROLE_VUOTE = new Set([
  'della', 'delle', 'dello', 'degli', 'nella', 'nelle', 'nello', 'sulla', 'sulle', 'alla', 'alle',
  'dalla', 'dalle', 'documento', 'documenti', 'agenzia',
]);

const normalizza = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Se un modello è stato chiesto: dall'utente in questa conversazione (lo
 * nomina, per intero o con una parola sua, oppure chiede «il modello» senza
 * dire quale) o dal DNA d'Agenzia (una regola o un ricordo che lo nomina).
 *
 * Serve al tool della chat per scartare un modello senza «quando usarlo»
 * che il motore ha preso solo perché c'era: l'11/09/2026 una presentazione
 * chiesta a parole è uscita con lo stile dello «Standard CI CD_v5.4», l'unico
 * modello della tenant, che nessuno aveva nominato. Larga di proposito: un
 * falso sì lascia decidere al prompt, com'era prima; un falso no
 * toglierebbe all'utente il modello che ha chiesto. Pura: provata a parte.
 */
export function modelloChiesto(nome: string, testi: { utente: string[]; agenzia: string[] }): boolean {
  const utente = ` ${testi.utente.map(normalizza).join(' ')} `;
  if (/ (modell[oi]|template) /.test(utente)) return true;
  const tutto = `${utente}${testi.agenzia.map(normalizza).join(' ')} `;
  const parole = normalizza(nome).split(' ').filter(Boolean);
  if (parole.length && tutto.includes(` ${parole.join(' ')} `)) return true;
  return parole.some((p) => p.length >= 4 && /\p{L}/u.test(p) && !PAROLE_VUOTE.has(p) && tutto.includes(` ${p} `));
}

/** Le fonti nella forma del mock: «Titolo — art. X, p. N». */
export function fontiDaCitazioni(citazioni: Citazione[]): string[] {
  return citazioni.map((c) => {
    const posizione = [
      c.posizione.articolo ? `art. ${c.posizione.articolo}` : c.posizione.sezione,
      `p. ${c.posizione.pagina}`,
    ]
      .filter(Boolean)
      .join(', ');
    return `${c.documentoTitolo} - ${posizione}`;
  });
}

// ---------------------------------------------------------------------------
// Intestazione e piè di pagina (11/09/2026)
// ---------------------------------------------------------------------------

/** Dove sta un'immagine dell'intestazione: l'id porta già l'estensione. */
export const percorsoImmagineIntestazione = (tenantId: string, id: string): string =>
  `tenant/${tenantId}/intestazione/${id}`;

/** Intestazione e piè salvati dal tenant; senza una riga, quelli di partenza. */
export async function intestazioneDelTenant(
  client: pg.ClientBase,
  tenantId: string,
): Promise<Intestazione & { aggiornataIl?: Date }> {
  const r = await client.query<{ intestazione: unknown; piede: unknown; aggiornata_il: Date }>(
    `select intestazione, piede, aggiornata_il from velia.intestazione where tenant_id = $1`,
    [tenantId],
  );
  const riga = r.rows[0];
  if (!riga) return INTESTAZIONE_INIZIALE;
  /* Salvata da una versione dello schema che non torna più: meglio il
     documento di partenza che un documento che non esce. */
  const esito = schemaIntestazione.safeParse({ intestazione: riga.intestazione, piede: riga.piede });
  return esito.success ? { ...esito.data, aggiornataIl: riga.aggiornata_il } : INTESTAZIONE_INIZIALE;
}

/**
 * Le fasce pronte per generare: il JSON, le immagini che cita (una che
 * manca nello Storage si salta, non ferma nulla) e i campi che non
 * dipendono dalla pagina.
 */
export async function fascePerGenerazione(
  archivio: ArchivioFile,
  tenantId: string,
  intestazione: Intestazione,
  campi: { titolo: string; agenzia: string },
): Promise<FasceDocumento> {
  const immagini = new Map<string, ImmagineFascia>();
  const ids = new Set([...immaginiDellaFascia(intestazione.intestazione), ...immaginiDellaFascia(intestazione.piede)]);
  for (const id of ids) {
    try {
      const byte = await archivio.scarica(percorsoImmagineIntestazione(tenantId, id));
      const tipo = tipoImmagine(byte);
      const dimensioni = dimensioniImmagine(byte);
      if (tipo && dimensioni) immagini.set(id, { byte, tipo, ...dimensioni });
    } catch {
      /* sparita dallo Storage: il documento esce senza */
    }
  }
  return {
    intestazione: intestazione.intestazione,
    piede: intestazione.piede,
    immagini,
    campi: {
      titolo: campi.titolo,
      agenzia: campi.agenzia,
      data: new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()),
    },
  };
}

/** Tutto in una: le fasce del tenant, col suo nome per il campo «agenzia». */
export async function fasceDelTenant(
  client: pg.ClientBase,
  archivio: ArchivioFile,
  tenantId: string,
  titolo: string,
): Promise<FasceDocumento> {
  const [intestazione, tenant] = await Promise.all([
    intestazioneDelTenant(client, tenantId),
    client.query<{ nome: string }>(`select nome from velia.tenant where id = $1`, [tenantId]),
  ]);
  return fascePerGenerazione(archivio, tenantId, intestazione, { titolo, agenzia: tenant.rows[0]?.nome ?? '' });
}
