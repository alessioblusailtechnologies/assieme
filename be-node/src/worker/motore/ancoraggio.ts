import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Citazione } from '../../contratto/conversazioni.js';
import type { DocumentoWorkspace } from './workspace.js';

/**
 * L'ancoraggio delle citazioni: il modello dichiara «pagina N», ma la
 * verità è l'ancora `[pag. N]` sotto cui sta davvero l'estratto nel
 * Markdown. Collaudo AUTOPIÙ (25/08): Sonnet citava pag. 89 per passaggi
 * che nel PDF stanno a pag. 88 — la citazione era «valida» (file e pagina
 * esistono) ma sbagliata di uno. Qui si cerca l'estratto nel file e si
 * corregge la pagina con l'ancora reale, dicendolo negli avvisi; se
 * l'estratto non si trova, la pagina resta quella dichiarata, con avviso.
 *
 * Non boccia mai: una citazione a pagina sbagliata è un errore da
 * correggere, non un'allucinazione.
 */

export interface EsitoAncoraggio {
  citazioni: Citazione[];
  avvisi: string[];
}

export async function ancoraCitazioni(
  directory: string,
  citazioni: Citazione[],
  perPath: Map<string, DocumentoWorkspace>,
): Promise<EsitoAncoraggio> {
  const pathPerId = new Map<string, string>();
  for (const [path, d] of perPath) pathPerId.set(d.id, path);
  const testi = new Map<string, string>();
  const avvisi: string[] = [];
  const corrette: Citazione[] = [];

  for (const c of citazioni) {
    const path = pathPerId.get(c.documentoId);
    if (!path) {
      corrette.push(c);
      continue;
    }
    let testo = testi.get(path);
    if (testo === undefined) {
      testo = await readFile(join(directory, path), 'utf8').catch(() => '');
      testi.set(path, testo);
    }
    const trovata = paginaDellEstratto(testo, c.estratto);
    if (trovata === undefined) {
      avvisi.push(`estratto non trovato nel testo di «${c.documentoTitolo}» (pag. ${c.posizione.pagina} non verificata)`);
      corrette.push(c);
    } else if (trovata !== c.posizione.pagina) {
      avvisi.push(`pagina corretta per «${c.documentoTitolo}»: dichiarata ${c.posizione.pagina}, l’estratto sta a ${trovata}`);
      corrette.push({ ...c, posizione: { ...c.posizione, pagina: trovata } });
    } else {
      corrette.push(c);
    }
  }
  return { citazioni: corrette, avvisi };
}

/**
 * La pagina sotto la cui ancora sta l'estratto, o undefined se l'estratto
 * non si trova. Il confronto è tollerante: spazi compressi, minuscole,
 * virgolette e trattini normalizzati; si prova con l'estratto intero, poi
 * con i primi 60 e 30 caratteri (il modello a volte accorcia o allunga).
 */
export function paginaDellEstratto(testoMd: string, estratto: string): number | undefined {
  const norma = (s: string) =>
    s
      .toLowerCase()
      .replace(/[’‘`´]/g, "'")
      .replace(/[“”«»]/g, '"')
      .replace(/[‐‑‒–—]/g, '-')
      .replace(/­/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  /* Il testo normalizzato conserva le ancore: si mappa ogni posizione
     all'ultima ancora che la precede. */
  const testo = norma(testoMd);
  const ancore: Array<{ indice: number; pagina: number }> = [];
  for (const m of testo.matchAll(/\[pag\. (\d+)\]/g)) ancore.push({ indice: m.index ?? 0, pagina: Number(m[1]) });
  if (!ancore.length) return undefined;

  const cercato = norma(estratto).replace(/^[.…\s]+|[.…\s]+$/g, '');
  const candidati = [cercato, cercato.slice(0, 60), cercato.slice(0, 30)].filter((c) => c.length >= 12);
  for (const candidato of candidati) {
    const indice = testo.indexOf(candidato);
    if (indice < 0) continue;
    let pagina: number | undefined;
    for (const a of ancore) {
      if (a.indice <= indice) pagina = a.pagina;
      else break;
    }
    return pagina;
  }
  return undefined;
}
