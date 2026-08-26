import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { AMBITI_RICORDO, CATEGORIE_RICORDO } from '../../contratto/memoria.js';
import type { Motore } from '../motore/sessione.js';
import type { CandidatoRicordo } from './perimetro.js';

/**
 * L'estrazione dei candidati ricordi (RF-G-01) dagli scambi di una
 * conversazione: lo STESSO motore della chat e delle tabelle (Agent SDK)
 * ma col suo modello (MODELLO_MEMORIA, non quello del tenant: è un compito
 * da lettore che gira dopo ogni risposta, non vale un modello di punta)
 * legge gli scambi e propone ciò che vale la pena tenere — prassi
 * dell'agenzia, contesto su un cliente, preferenze dell'utente, decisioni.
 * Il worker poi valida (perimetro GDPR, doppioni) e persiste: il modello
 * propone, non scrive.
 *
 * Interfaccia perché il gestore non deve sapere chi estrae: nei test è un
 * copione.
 */

export interface ScambioConversazione {
  autore: 'utente' | 'assistente';
  testo: string;
}

export interface EsitoEstrazione {
  candidati: CandidatoRicordo[];
  modello: string;
  token: { input: number; output: number; cacheLettura: number; cacheScrittura: number };
  costoUsd: number;
}

export interface OpzioniEstrazione {
  /** Il modello scelto dal tenant; senza, il default del motore. */
  modello?: string;
}

export interface EstrattoreRicordi {
  estrai(scambi: ScambioConversazione[], giaNoti: string[], opzioni?: OpzioniEstrazione): Promise<EsitoEstrazione>;
}

export const ISTRUZIONI_ESTRAZIONE = `Sei la memoria di Velia, piattaforma AI per intermediari assicurativi italiani. Leggi gli ultimi scambi di una conversazione tra un utente dell'agenzia e l'assistente e proponi i ricordi che vale la pena conservare per le conversazioni future.

Un ricordo è una frase sola, autonoma, in italiano, comprensibile senza la conversazione: una prassi dell'agenzia («L'agenzia privilegia…»), un'informazione operativa stabile su un cliente (azienda o persona) utile a servirlo, una preferenza sul modo di lavorare o sul formato delle risposte («Preferisce…»), una decisione presa. Mai «L'utente…» come soggetto: scrivi il ricordo come lo direbbe un collega che lo sa.

NON è un ricordo:
- un riassunto o un episodio della conversazione («ha chiesto di confrontare…», «ha necessità di…»);
- un fatto documentale o normativo (sta nei documenti) o un'informazione generica sul settore;
- cosa contiene o non contiene l'archivio, quali edizioni ci sono, cosa manca: cambia, e si legge dall'archivio;
- una valutazione tecnica fatta in un caso specifico, a meno che l'utente non l'abbia dichiarata come regola generale.

Alza l'asticella: al massimo 3 ricordi, e meglio nessuno che uno debole. Un ricordo vale se, ricomparendo in una conversazione futura, cambierebbe la risposta.

Categorie: "prassi" (come lavora l'agenzia), "cliente" (contesto su un cliente), "preferenza" (come vuole le cose l'utente), "decisione" (una scelta presa), "altro".
Ambito: "tenant" se vale per tutta l'agenzia, "personale" se riguarda solo l'utente che parla.

PERIMETRO INDEROGABILE (GDPR). Non proporre MAI ricordi che contengano o lascino intuire:
- dati sulla salute, la vita sessuale, le convinzioni religiose o politiche, l'appartenenza sindacale, l'origine etnica, dati genetici o biometrici, condanne o reati — di chiunque;
- identificativi e contatti di persone: codice fiscale, IBAN, email, telefono, data di nascita, indirizzo di residenza, targa, credenziali, dati di pagamento;
- qualunque dettaglio non necessario allo scopo del ricordo (minimizzazione): il nome di un'azienda cliente va bene, i dettagli privati dei suoi dipendenti no.
Se un'informazione utile è intrecciata con un dato vietato, riformulala senza il dato o lasciala perdere.

Non ripetere i ricordi già noti (te li elenco), né proporre variazioni minime di quelli. Se gli scambi non contengono nulla che valga la pena ricordare, è una risposta corretta: array vuoto.

Non usare alcuno strumento: hai già tutto nel messaggio. Rispondi subito e SOLO con un array JSON (al massimo 3 elementi) di oggetti {"testo": string, "categoria": string, "ambito": string}. Niente testo fuori dall'array.`;

const schemaCandidato = z.object({
  testo: z.string().trim().min(1).max(1000),
  categoria: z.enum(CATEGORIE_RICORDO).catch('altro'),
  ambito: z.enum(AMBITI_RICORDO).catch('tenant'),
});

export const schemaCandidati = z.array(schemaCandidato).max(10);

/**
 * L'estrattore sul motore vero: una sessione senza documenti (directory
 * vuota, così le mura del motore restano le stesse) con le istruzioni di
 * estrazione al posto delle regole della chat.
 */
export class EstrattoreMotore implements EstrattoreRicordi {
  constructor(
    private readonly motore: Motore,
    /** Dove aprire la directory vuota della sessione. */
    private readonly radice: string,
  ) {}

  async estrai(
    scambi: ScambioConversazione[],
    giaNoti: string[],
    opzioni: OpzioniEstrazione = {},
  ): Promise<EsitoEstrazione> {
    const directory = await mkdtemp(join(this.radice, 'memoria-'));
    try {
      const esito = await this.motore.interroga(
        {
          directory,
          promptSistema: ISTRUZIONI_ESTRAZIONE,
          promptUtente: promptEstrazione(scambi, giaNoti),
          ...(opzioni.modello && { modello: opzioni.modello }),
        },
        { passo: () => Promise.resolve(), annullato: () => Promise.resolve(false) },
      );
      if (esito.terminato !== 'completato') {
        throw new Error(`estrazione ${esito.terminato}: ${esito.errore ?? ''}`);
      }
      return {
        candidati: interpretaCandidati(esito.testo),
        modello: esito.modello,
        token: esito.token,
        costoUsd: esito.costoUsd,
      };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/** Gli scambi per il modello (tagliati) e i ricordi già noti. */
export function promptEstrazione(scambi: ScambioConversazione[], giaNoti: string[]): string {
  const parti: string[] = [];
  if (giaNoti.length) {
    parti.push('Ricordi già noti (non ripeterli):');
    for (const t of giaNoti.slice(0, 60)) parti.push(`- ${t}`);
    parti.push('');
  }
  parti.push('Scambi:');
  for (const s of scambi) {
    parti.push(`\n[${s.autore === 'utente' ? 'Utente' : 'Assistente'}]\n${s.testo.slice(0, 6000)}`);
  }
  return parti.join('\n');
}

/** Dal testo del modello ai candidati: tollera il JSON dentro una recinzione; se non c'è un array, lancia. */
export function interpretaCandidati(testo: string): CandidatoRicordo[] {
  const inizio = testo.indexOf('[');
  const fine = testo.lastIndexOf(']');
  if (inizio < 0 || fine <= inizio) throw new Error('risposta senza array JSON');
  return schemaCandidati.parse(JSON.parse(testo.slice(inizio, fine + 1)));
}
