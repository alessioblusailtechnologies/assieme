import { IsoDateTime } from './comune';

/**
 * Intestazione e piè di pagina dell'agenzia (11/09/2026), specchio di
 * `be-node/src/contratto/intestazione.ts`: il backend è la fonte di questo
 * contratto e lo valida, un nodo fuori schema è un 400.
 *
 * Ciascuna fascia è il documento JSON di TipTap, ma di uno schema vincolato
 * a ciò che il motore sa riprodurre identico in PDF e in Word: paragrafi
 * allineati, testo con pochi segni, immagini, una riga fino a tre colonne,
 * campi che si risolvono pagina per pagina.
 */

export type Allineamento = 'left' | 'center' | 'right';
export type Dimensione = 'piccolo' | 'normale' | 'grande';
export type NomeCampo = 'pagina' | 'pagine' | 'data' | 'titolo' | 'agenzia';

export type Marca =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'underline' }
  | { type: 'textStyle'; attrs?: { color?: string | null; fontSize?: Dimensione | null } };

export type Inline =
  | { type: 'text'; text: string; marks?: Marca[] }
  | { type: 'hardBreak' }
  | { type: 'campo'; attrs: { nome: NomeCampo }; marks?: Marca[] };

export interface Paragrafo {
  type: 'paragraph';
  attrs?: { textAlign?: Allineamento | null };
  content?: Inline[];
}

export interface Immagine {
  type: 'immagine';
  /** `larghezza` in millimetri, sulla carta. */
  attrs: { id: string; larghezza: number; allineamento: Allineamento };
}

export interface Colonne {
  type: 'colonne';
  content: { type: 'colonna'; content: (Paragrafo | Immagine)[] }[];
}

export interface Fascia {
  type: 'doc';
  content: (Paragrafo | Immagine | Colonne)[];
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

/** Un'immagine caricata: l'id da mettere nel nodo, e dove si scarica. */
export interface ImmagineCaricata {
  id: string;
  url: string;
}

/** Le misure dei tre corpi, in punti: le stesse del motore, così l'editor è in scala. */
export const PUNTI_DIMENSIONE: Record<Dimensione, number> = {
  piccolo: 7.5,
  normale: 9,
  grande: 12,
};

export const ETICHETTE_CAMPO: Record<NomeCampo, string> = {
  pagina: 'N. pagina',
  pagine: 'Pagine totali',
  data: 'Data',
  titolo: 'Titolo del documento',
  agenzia: 'Nome dell’agenzia',
};
