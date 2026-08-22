import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { Citazione, Provenienza } from '../../contratto/conversazioni.js';
import { MARCATORE_CITAZIONI, type DnaAgenzia } from './regole.js';
import type { DocumentoWorkspace } from './workspace.js';

/**
 * La validazione a fine sessione (doc motore §2.5, piano §4.3.4): il
 * worker — non il modello — legge il blocco `velia-citazioni`, verifica che
 * ogni citazione punti a un file reale della workspace con una pagina
 * plausibile, e traduce il tutto nelle forme del contratto. Solo ciò che
 * passa diventa messaggio.
 */

export const schemaBlocco = z.object({
  citazioni: z
    .array(
      z.object({
        file: z.string().min(1),
        pagina: z.coerce.number().int().min(1),
        estratto: z.string().trim().min(1).max(1000),
        articolo: z.string().trim().max(120).nullable().optional(),
        sezione: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .default([]),
  provenienze: z
    .array(
      z.object({
        tipo: z.enum(['regola', 'documento-riferimento', 'memoria']),
        id: z.string().min(1),
      }),
    )
    .default([]),
  nonSupportato: z.boolean().default(false),
});

export type BloccoCitazioni = z.infer<typeof schemaBlocco>;

export class ErroreValidazione extends Error {
  constructor(
    messaggio: string,
    readonly dettagli: string[] = [],
  ) {
    super(messaggio);
    this.name = 'ErroreValidazione';
  }
}

/**
 * Separa il testo visibile dal blocco finale. Il blocco può mancare (il
 * modello non l'ha scritto): è un errore di validazione, non un testo.
 */
export function separaBlocco(testo: string): { visibile: string; blocco: BloccoCitazioni | undefined; problemi: string[] } {
  const indice = testo.lastIndexOf(MARCATORE_CITAZIONI);
  if (indice < 0) return { visibile: testo.trimEnd(), blocco: undefined, problemi: ['blocco velia-citazioni mancante'] };

  const visibile = testo.slice(0, indice).trimEnd();
  const dopo = testo.slice(indice + MARCATORE_CITAZIONI.length);
  const chiusura = dopo.indexOf('```');
  const grezzo = (chiusura >= 0 ? dopo.slice(0, chiusura) : dopo).trim();
  try {
    const blocco = schemaBlocco.parse(JSON.parse(grezzo));
    return { visibile, blocco, problemi: [] };
  } catch (errore) {
    return {
      visibile,
      blocco: undefined,
      problemi: [`blocco velia-citazioni non valido: ${errore instanceof Error ? errore.message : String(errore)}`],
    };
  }
}

/**
 * Quanti caratteri in coda al testo potrebbero essere l'inizio del
 * marcatore: si trattengono finché non si sa. Evita di far vedere
 * all'utente un "```vel" che poi sparisce.
 */
export function margineMarcatore(testo: string): number {
  const marcatore = `\n${MARCATORE_CITAZIONI}`;
  const massimo = Math.min(testo.length, marcatore.length);
  for (let n = massimo; n > 0; n--) {
    if (marcatore.startsWith(testo.slice(testo.length - n))) return n;
  }
  return 0;
}

export interface EsitoValidazione {
  citazioni: Citazione[];
  provenienze: Provenienza[];
  nonSupportato: boolean;
  /** Citazioni scartate e altri avvisi: finiscono nell'audit, non all'utente. */
  avvisi: string[];
}

/**
 * Dal blocco alle forme del contratto. Una citazione verso un file che non
 * esiste nella workspace, o verso una pagina oltre la fine, è un'allucinazione:
 * fa fallire la risposta (RF-D-08: la citazione è inderogabile, e una
 * citazione falsa è peggio di nessuna).
 */
export function validaBlocco(
  blocco: BloccoCitazioni,
  perPath: Map<string, DocumentoWorkspace>,
  dna: DnaAgenzia,
): EsitoValidazione {
  const avvisi: string[] = [];
  const errori: string[] = [];
  const citazioni: Citazione[] = [];
  const viste = new Set<string>();

  for (const c of blocco.citazioni) {
    const path = normalizzaPath(c.file);
    if (/(^|\/)INDICE\.md$/.test(path)) {
      // Gli indici sono mappe, non fonti: non hanno un documento da aprire.
      avvisi.push(`citazione a un INDICE ignorata: ${c.file}`);
      continue;
    }
    const doc = perPath.get(path);
    if (!doc) {
      errori.push(`citazione verso un file inesistente nella workspace: ${c.file}`);
      continue;
    }
    if (doc.paginaMassima !== null && c.pagina > doc.paginaMassima) {
      errori.push(
        `citazione a pag. ${c.pagina} di «${doc.titolo}», oltre l'ultima pagina citabile (${doc.paginaMassima})`,
      );
      continue;
    }
    const chiave = `${doc.id}|${c.pagina}|${c.estratto}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    citazioni.push({
      id: randomUUID(),
      documentoId: doc.id,
      documentoTitolo: doc.titolo,
      archivio: doc.archivio,
      posizione: {
        pagina: c.pagina,
        ...(c.articolo && { articolo: c.articolo }),
        ...(c.sezione && { sezione: c.sezione }),
      },
      estratto: c.estratto,
    });
  }

  if (errori.length) throw new ErroreValidazione('citazioni non verificabili', errori);

  const provenienze: Provenienza[] = [];
  for (const p of blocco.provenienze) {
    const trovata = etichettaProvenienza(p, dna);
    if (!trovata) {
      avvisi.push(`provenienza ignorata: ${p.tipo} ${p.id} non è nel DNA`);
      continue;
    }
    if (provenienze.some((x) => x.tipo === p.tipo && x.origineId === p.id)) continue;
    provenienze.push({ tipo: p.tipo, origineId: p.id, etichetta: trovata });
  }

  if (!citazioni.length && !blocco.nonSupportato) {
    avvisi.push('risposta senza citazioni e senza dichiarazione di non copertura');
  }

  return { citazioni, provenienze, nonSupportato: blocco.nonSupportato, avvisi };
}

function etichettaProvenienza(p: { tipo: Provenienza['tipo']; id: string }, dna: DnaAgenzia): string | undefined {
  switch (p.tipo) {
    case 'regola': {
      const i = dna.istruzioni.find((x) => x.id === p.id);
      return i && `valutato secondo la regola "${i.titolo}"`;
    }
    case 'documento-riferimento': {
      const r = dna.riferimenti.find((x) => x.id === p.id);
      return r && `consultato il documento di riferimento "${r.titolo}"`;
    }
    case 'memoria': {
      const r = dna.ricordi.find((x) => x.id === p.id);
      return r && `tenuto conto di: ${accorcia(r.testo, 80)}`;
    }
  }
}

function accorcia(testo: string, n: number): string {
  const pulito = testo.replace(/\s+/g, ' ').trim();
  return pulito.length <= n ? pulito : `${pulito.slice(0, n - 1).trimEnd()}…`;
}

/** Path come li scrive il modello → chiave della workspace (posix, relativo). */
export function normalizzaPath(p: string): string {
  return p
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}
