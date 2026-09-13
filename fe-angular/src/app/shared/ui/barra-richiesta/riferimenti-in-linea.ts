import type { RiferimentoDocumento } from '@core/models';

import { CLASSE_CHIP } from './editor-testo';

/**
 * I riferimenti **al loro posto** nel testo (14/09/2026).
 *
 * Il composer della chat manda testo semplice più una lista di id: dove
 * stava un chip non interessa, perché il messaggio parte e basta. La
 * richiesta di un agente invece si riapre, si corregge, si rilegge fra un
 * mese: «confronta @Rossi con @Km&Servizi» non è la stessa frase se i due
 * chip tornano in fila davanti al testo. Qui la posizione si scrive dentro
 * il testo, con un marcatore per riferimento:
 *
 *     Confronta @[documento:doc-priv-1] con @[prodotto:cmp-unipol:Km&Servizi:ed-7] per @[cliente:<uuid>]
 *
 * Il marcatore porta solo tipo e chiave: il titolo del chip arriva a parte
 * (`RiferimentoBarra`), così rinominare un documento non riscrive le
 * richieste che lo citano.
 */

/** Ciò che un chip della barra rappresenta, con quanto serve a disegnarlo. */
export type RiferimentoBarra =
  | { tipo: 'documento'; chiave: string; titolo: string; archivio: RiferimentoDocumento['archivio'] }
  /** Un prodotto: la chiave è quella del set, i documenti sono quelli dell'edizione scelta. */
  | { tipo: 'prodotto'; chiave: string; titolo: string; documenti: RiferimentoDocumento[] }
  | { tipo: 'cliente'; chiave: string; titolo: string };

export type TipoRiferimento = RiferimentoBarra['tipo'];

export type SegmentoRichiesta = { testo: string } | { tipo: TipoRiferimento; chiave: string };

/** Gli attributi con cui un chip dice che cosa rappresenta, per tornare marcatore. */
export const ATTR_TIPO_RIFERIMENTO = 'data-tipo-riferimento';
export const ATTR_CHIAVE_RIFERIMENTO = 'data-chiave-riferimento';

/*
 * La chiave arriva fino alla parentesi quadra chiusa: quella di un set
 * contiene i due punti (`compagnia:prodotto:edizione`), e un'espressione più
 * stretta la taglierebbe a metà.
 */
const MARCATORE = /@\[(documento|prodotto|cliente):([^\]]+)\]/g;

export function marcatore(r: { tipo: TipoRiferimento; chiave: string }): string {
  return `@[${r.tipo}:${r.chiave}]`;
}

/** Il testo spezzato in parole e riferimenti, nell'ordine in cui compaiono. */
export function segmenti(testo: string): SegmentoRichiesta[] {
  const esito: SegmentoRichiesta[] = [];
  let ultimo = 0;
  for (const m of testo.matchAll(MARCATORE)) {
    const inizio = m.index ?? 0;
    if (inizio > ultimo) esito.push({ testo: testo.slice(ultimo, inizio) });
    esito.push({ tipo: m[1] as TipoRiferimento, chiave: m[2]! });
    ultimo = inizio + m[0].length;
  }
  if (ultimo < testo.length) esito.push({ testo: testo.slice(ultimo) });
  return esito;
}

/** I riferimenti citati nel testo, senza doppioni, nell'ordine della prima comparsa. */
export function riferimentiNelTesto(testo: string): { tipo: TipoRiferimento; chiave: string }[] {
  const visti = new Set<string>();
  const esito: { tipo: TipoRiferimento; chiave: string }[] = [];
  for (const s of segmenti(testo)) {
    if (!('tipo' in s)) continue;
    const id = marcatore(s);
    if (visti.has(id)) continue;
    visti.add(id);
    esito.push(s);
  }
  return esito;
}

/**
 * Il testo come lo si legge: i riferimenti diventano «titolo». Serve a chi
 * deve mostrarlo senza chip, e al piano che l'AI legge.
 */
export function testoLeggibile(testo: string, riferimenti: RiferimentoBarra[]): string {
  return segmenti(testo)
    .map((s) => {
      if (!('tipo' in s)) return s.testo;
      const r = riferimenti.find((x) => x.tipo === s.tipo && x.chiave === s.chiave);
      return r ? `«${r.titolo}»` : '«riferimento non più disponibile»';
    })
    .join('');
}

/**
 * Il testo dell'editor con i chip al loro posto, come marcatori.
 *
 * Gemella di `testoEditor`, che i chip li salta: le posizioni del cursore e
 * la menzione `@` continuano a ragionare sul testo senza chip, mentre quello
 * che si salva è questo.
 */
export function testoConMarcatori(radice: HTMLElement): string {
  let testo = '';
  const visita = (nodo: Node): void => {
    for (const figlio of Array.from(nodo.childNodes)) {
      if (figlio.nodeType === Node.TEXT_NODE) {
        testo += figlio.textContent ?? '';
      } else if (figlio.nodeName === 'BR') {
        testo += '\n';
      } else if (figlio.nodeType === Node.ELEMENT_NODE) {
        const elemento = figlio as HTMLElement;
        if (elemento.classList.contains(CLASSE_CHIP)) {
          const tipo = elemento.getAttribute(ATTR_TIPO_RIFERIMENTO) as TipoRiferimento | null;
          const chiave = elemento.getAttribute(ATTR_CHIAVE_RIFERIMENTO);
          if (tipo && chiave) testo += marcatore({ tipo, chiave });
        } else {
          visita(elemento);
        }
      }
    }
  };
  visita(radice);
  return testo;
}
