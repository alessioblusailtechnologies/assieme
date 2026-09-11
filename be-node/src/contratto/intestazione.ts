import { z } from 'zod';

/**
 * Intestazione e piè di pagina dell'agenzia (11/09/2026), al posto
 * dell'identità visiva: il marchio dell'agenzia su ogni documento che esce
 * da VELIA sta solo qui.
 *
 * Ciascuna delle due fasce è il documento JSON dell'editor (TipTap, fase 2
 * di `PIANO-INTESTAZIONE-MODELLI.md`), ma di uno schema **vincolato** a ciò
 * che si sa riprodurre identico in PDF e in Word: paragrafi allineati,
 * testo con pochi segni, immagini, una riga fino a tre colonne, campi che
 * si risolvono pagina per pagina. Tabelle libere, elenchi, link, font a
 * scelta e sfondi non ci sono: sono ciò che fa divergere l'anteprima dal
 * documento.
 *
 * Il backend non si fida dell'editor: un nodo fuori schema è un 400. Gli
 * attributi sconosciuti di un nodo noto invece si scartano (zod li toglie),
 * perché la resa legge solo quelli che conosce.
 */

export const ALLINEAMENTI = ['left', 'center', 'right'] as const;
export type Allineamento = (typeof ALLINEAMENTI)[number];

export const DIMENSIONI = ['piccolo', 'normale', 'grande'] as const;
export type Dimensione = (typeof DIMENSIONI)[number];

/** I campi che si risolvono al momento di generare, alcuni pagina per pagina. */
export const CAMPI = ['pagina', 'pagine', 'data', 'titolo', 'agenzia'] as const;
export type NomeCampo = (typeof CAMPI)[number];

/** L'id di un'immagine caricata, con la sua estensione: è anche il nome del file nello Storage. */
export const E_ID_IMMAGINE = /^img-[0-9a-f]{12}\.(png|jpg)$/;

const colore = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const schemaMarca = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('underline') }),
  z.object({
    type: z.literal('textStyle'),
    attrs: z
      .object({
        color: colore.nullable().optional(),
        fontSize: z.enum(DIMENSIONI).nullable().optional(),
      })
      .optional(),
  }),
]);

export type Marca = z.infer<typeof schemaMarca>;

const marche = z.array(schemaMarca).max(6).optional();

const schemaInline = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1).max(500), marks: marche }),
  z.object({ type: z.literal('hardBreak') }),
  z.object({ type: z.literal('campo'), attrs: z.object({ nome: z.enum(CAMPI) }), marks: marche }),
]);

export type Inline = z.infer<typeof schemaInline>;

const schemaParagrafo = z.object({
  type: z.literal('paragraph'),
  attrs: z.object({ textAlign: z.enum(ALLINEAMENTI).nullable().optional() }).optional(),
  content: z.array(schemaInline).max(60).optional(),
});

/**
 * Dove va il testo che segue un'immagine: sotto (l'immagine ha la sua
 * riga) o accanto, come il «testo intorno» di Word: l'immagine sta a
 * sinistra o a destra e i paragrafi dopo le scorrono a fianco, a
 * `distanza` millimetri, finché non la superano in altezza. Un'immagine
 * al centro ha sempre il testo sotto.
 */
export const DISPOSIZIONI_TESTO = ['sotto', 'accanto'] as const;
export type DisposizioneTesto = (typeof DISPOSIZIONI_TESTO)[number];

const schemaImmagine = z.object({
  type: z.literal('immagine'),
  attrs: z.object({
    id: z.string().regex(E_ID_IMMAGINE),
    /** In millimetri, sulla carta. */
    larghezza: z.number().min(5).max(180),
    allineamento: z.enum(ALLINEAMENTI).default('left'),
    testo: z.enum(DISPOSIZIONI_TESTO).default('sotto'),
    /** In millimetri, fra l'immagine e il testo accanto. */
    distanza: z.number().min(0).max(30).default(3),
  }),
});

const schemaColonna = z.object({
  type: z.literal('colonna'),
  content: z.array(z.union([schemaParagrafo, schemaImmagine])).min(1).max(10),
});

const schemaColonne = z.object({
  type: z.literal('colonne'),
  content: z.array(schemaColonna).min(2).max(3),
});

export type Paragrafo = z.infer<typeof schemaParagrafo>;
export type Immagine = z.infer<typeof schemaImmagine>;
export type Colonne = z.infer<typeof schemaColonne>;
export type BloccoColonna = Paragrafo | Immagine;
export type Blocco = Paragrafo | Immagine | Colonne;

export const schemaFascia = z.object({
  type: z.literal('doc'),
  content: z.array(z.union([schemaParagrafo, schemaImmagine, schemaColonne])).max(20).default([]),
});

export type Fascia = z.infer<typeof schemaFascia>;

/** Corpo di `PUT /api/intestazione` e di `POST /api/intestazione/anteprima`. */
export const schemaIntestazione = z.object({
  intestazione: schemaFascia,
  piede: schemaFascia,
});

export type Intestazione = z.infer<typeof schemaIntestazione>;

export const schemaAnteprima = schemaIntestazione.extend({
  formato: z.enum(['pdf', 'docx']).default('pdf'),
});

/** La risposta di `GET /api/intestazione`. */
export interface IntestazioneSalvata extends Intestazione {
  /** Assente finché nessuno l'ha mai salvata: allora vale quella di partenza. */
  aggiornataIl?: string;
}

/** La risposta al caricamento di un'immagine: l'id da mettere nel nodo, e dove vederla. */
export interface ImmagineCaricata {
  id: string;
  url: string;
}

export const FASCIA_VUOTA: Fascia = { type: 'doc', content: [] };

/**
 * Il punto di partenza di un'agenzia che non ha ancora scritto niente:
 * intestazione vuota, e nel piè il solo numero di pagina, a destra. È ciò
 * che un documento senza marchio deve comunque avere.
 */
export const INTESTAZIONE_INIZIALE: Intestazione = {
  intestazione: FASCIA_VUOTA,
  piede: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: 'right' },
        content: [
          { type: 'text', text: 'Pagina ', marks: [{ type: 'textStyle', attrs: { fontSize: 'piccolo' } }] },
          { type: 'campo', attrs: { nome: 'pagina' }, marks: [{ type: 'textStyle', attrs: { fontSize: 'piccolo' } }] },
          { type: 'text', text: ' di ', marks: [{ type: 'textStyle', attrs: { fontSize: 'piccolo' } }] },
          { type: 'campo', attrs: { nome: 'pagine' }, marks: [{ type: 'textStyle', attrs: { fontSize: 'piccolo' } }] },
        ],
      },
    ],
  },
};

/** Gli id delle immagini citate da una fascia, colonne comprese. */
export function immaginiDellaFascia(fascia: Fascia): string[] {
  const ids: string[] = [];
  for (const blocco of fascia.content) {
    if (blocco.type === 'immagine') ids.push(blocco.attrs.id);
    if (blocco.type === 'colonne') {
      for (const colonna of blocco.content) {
        for (const b of colonna.content) if (b.type === 'immagine') ids.push(b.attrs.id);
      }
    }
  }
  return ids;
}
