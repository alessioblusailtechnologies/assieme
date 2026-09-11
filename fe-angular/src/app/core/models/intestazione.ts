import { IsoDateTime } from './comune';

/**
 * Intestazione e piè di pagina dell'agenzia (11/09/2026), specchio di
 * `be-node/src/contratto/intestazione.ts`: il backend è la fonte di questo
 * contratto e lo valida, un elemento fuori schema è un 400.
 *
 * Ciascuna fascia è una tela larga quanto il foglio A4: caselle di testo,
 * immagini e forme stanno dove l'agenzia le mette, in millimetri
 * dall'angolo in alto a sinistra della fascia. La testa parte dal bordo
 * alto della pagina, il piede finisce su quello basso. Il testo di una
 * casella è il JSON di TipTap, vincolato a ciò che il motore sa riprodurre
 * identico in PDF e in Word.
 */

export type Allineamento = 'left' | 'center' | 'right';
/** Dove sta il testo in una casella più alta di lui. */
export type Ancoraggio = 'top' | 'middle' | 'bottom';
/** Helvetica, Times e Courier: i font standard del PDF (in Word Arial, Times New Roman, Courier New). */
export type Famiglia = 'sans' | 'serif' | 'mono';
export type NomeCampo = 'pagina' | 'pagine' | 'data' | 'titolo' | 'agenzia';

export type Marca =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | {
      type: 'textStyle';
      /** `fontSize` in punti. */
      attrs?: { color?: string | null; fontSize?: number | null; fontFamily?: Famiglia | null };
    };

export type Inline =
  | { type: 'text'; text: string; marks?: Marca[] }
  | { type: 'hardBreak' }
  | { type: 'campo'; attrs: { nome: NomeCampo }; marks?: Marca[] };

export interface Paragrafo {
  type: 'paragraph';
  attrs?: { textAlign?: Allineamento | null };
  content?: Inline[];
}

/** Posizione e misure in millimetri, dall'angolo in alto a sinistra della fascia. */
export interface Geometria {
  id: string;
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
}

/**
 * Una casella di testo: corpo (in punti), famiglia e colore del testo che
 * non ne dice altri. È alta almeno quanto il suo testo; `verticale` dice
 * dove sta il testo quando lei è più alta.
 */
export interface ElementoTesto extends Geometria {
  tipo: 'testo';
  verticale: Ancoraggio;
  dimensione: number;
  famiglia: Famiglia;
  colore: string;
  paragrafi: Paragrafo[];
}

export interface ElementoImmagine extends Geometria {
  tipo: 'immagine';
  /** L'id dell'immagine caricata. */
  immagine: string;
}

/** Un rettangolo pieno: una linea, se basso; una banda di colore, se largo. */
export interface ElementoForma extends Geometria {
  tipo: 'forma';
  colore: string;
}

export type Elemento = ElementoTesto | ElementoImmagine | ElementoForma;

export interface Fascia {
  /** In millimetri. */
  altezza: number;
  /** Dal fondo alla cima: l'ultimo copre gli altri. */
  elementi: Elemento[];
}

export interface Intestazione {
  intestazione: Fascia;
  piede: Fascia;
}

/** La risposta di `GET /api/intestazione`. */
export interface IntestazioneSalvata extends Intestazione {
  /** Assente finché nessuno l'ha mai salvata: vale quella di partenza. */
  aggiornataIl?: IsoDateTime;
}

/** Un'immagine caricata: l'id da mettere nell'elemento, e dove si scarica. */
export interface ImmagineCaricata {
  id: string;
  url: string;
}

/** Il foglio A4 e i margini del corpo dei documenti (56 pt), in millimetri. */
export const LARGHEZZA_FOGLIO = 210;
export const MARGINE_FOGLIO = (56 * 25.4) / 72;
export const ALTEZZA_MASSIMA_FASCIA = 100;

/** Il corpo e il colore del testo di una casella nuova: gli stessi del motore. */
export const CORPO_BASE = 9;
export const COLORE_TESTO = '#262626';
export const CORPO_MINIMO = 5;
export const CORPO_MASSIMO = 72;

/** Come si mostrano le tre famiglie nell'editor: font con le metriche di quelli del PDF. */
export const FONT_FAMIGLIA: Record<Famiglia, string> = {
  sans: "helvetica, arial, 'Liberation Sans', sans-serif",
  serif: "'Times New Roman', times, 'Liberation Serif', serif",
  mono: "'Courier New', courier, 'Liberation Mono', monospace",
};

export const ETICHETTE_FAMIGLIA: Record<Famiglia, string> = {
  sans: 'Helvetica',
  serif: 'Times',
  mono: 'Courier',
};

export const ETICHETTE_CAMPO: Record<NomeCampo, string> = {
  pagina: 'N. pagina',
  pagine: 'Pagine totali',
  data: 'Data',
  titolo: 'Titolo del documento',
  agenzia: 'Nome dell’agenzia',
};
