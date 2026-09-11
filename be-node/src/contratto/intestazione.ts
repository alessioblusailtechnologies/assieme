import { z } from 'zod';

/**
 * Intestazione e piè di pagina dell'agenzia (11/09/2026), al posto
 * dell'identità visiva: il marchio dell'agenzia su ogni documento che esce
 * da VELIA sta solo qui.
 *
 * Ciascuna delle due fasce è una **tela**: una striscia larga quanto il
 * foglio A4 e alta quanto si vuole, dove caselle di testo, immagini e forme
 * stanno dove l'agenzia le mette, in millimetri dal bordo del foglio. La
 * testa parte dal bordo alto della pagina, il piede finisce su quello basso.
 * È la libertà delle caselle di testo di Word, e si riproduce uguale in PDF
 * (il motore disegna alle coordinate) e in Word (caselle e immagini ancorate
 * alla pagina). Prima era un flusso di paragrafi, immagini e colonne, e il
 * testo accanto a un logo alto non si poteva centrare.
 *
 * Il testo di una casella è il JSON dell'editor (TipTap), vincolato a ciò
 * che si sa riprodurre: paragrafi allineati, pochi segni, tre famiglie di
 * font, campi che si risolvono pagina per pagina. Tabelle, elenchi e link
 * non ci sono.
 *
 * Il backend non si fida dell'editor: un elemento fuori schema, o fuori
 * dalla sua fascia, è un 400. Gli attributi sconosciuti di un nodo noto
 * invece si scartano (zod li toglie), perché la resa legge solo quelli che
 * conosce.
 */

export const ALLINEAMENTI = ['left', 'center', 'right'] as const;
export type Allineamento = (typeof ALLINEAMENTI)[number];

/** Dove sta il testo in una casella più alta di lui: in cima, a metà, in fondo. */
export const ANCORAGGI = ['top', 'middle', 'bottom'] as const;
export type Ancoraggio = (typeof ANCORAGGI)[number];

/** Le tre famiglie dei font standard del PDF: Helvetica, Times e Courier (in Word Arial, Times New Roman, Courier New). */
export const FAMIGLIE = ['sans', 'serif', 'mono'] as const;
export type Famiglia = (typeof FAMIGLIE)[number];

/** I campi che si risolvono al momento di generare, alcuni pagina per pagina. */
export const CAMPI = ['pagina', 'pagine', 'data', 'titolo', 'agenzia'] as const;
export type NomeCampo = (typeof CAMPI)[number];

/** L'id di un'immagine caricata, con la sua estensione: è anche il nome del file nello Storage. */
export const E_ID_IMMAGINE = /^img-[0-9a-f]{12}\.(png|jpg)$/;

/** Il foglio, in millimetri: le fasce sono larghe quanto lui. */
export const LARGHEZZA_FOGLIO = 210;
export const ALTEZZA_MASSIMA_FASCIA = 100;

/** Il corpo e il colore del testo di una casella che non dice altro. */
export const CORPO_BASE = 9;
export const COLORE_BASE = '#262626';

/** Quanto un elemento può sporgere dalla sua fascia prima di essere un errore: gli arrotondamenti dell'editor. */
const TOLLERANZA = 0.5;

const colore = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const corpo = z.number().min(5).max(72);

const schemaMarca = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('underline') }),
  z.object({
    type: z.literal('textStyle'),
    attrs: z
      .object({
        color: colore.nullable().optional(),
        /** In punti. */
        fontSize: corpo.nullable().optional(),
        fontFamily: z.enum(FAMIGLIE).nullable().optional(),
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
  content: z.array(schemaInline).max(80).optional(),
});

export type Paragrafo = z.infer<typeof schemaParagrafo>;

/** Posizione e misure di un elemento, in millimetri dall'angolo in alto a sinistra della sua fascia. */
const geometria = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  x: z.number().min(0).max(LARGHEZZA_FOGLIO),
  y: z.number().min(0).max(ALTEZZA_MASSIMA_FASCIA),
  larghezza: z.number().min(0.1).max(LARGHEZZA_FOGLIO),
  altezza: z.number().min(0.1).max(ALTEZZA_MASSIMA_FASCIA),
};

/**
 * Una casella di testo. Corpo, famiglia e colore sono quelli del testo che
 * non ne dice altri; i segni li cambiano a pezzi. La casella è alta almeno
 * quanto il suo testo: `altezza` conta quando è di più, e allora
 * `verticale` dice dove sta il testo.
 */
const schemaTesto = z.object({
  tipo: z.literal('testo'),
  ...geometria,
  verticale: z.enum(ANCORAGGI).default('top'),
  dimensione: corpo.default(CORPO_BASE),
  famiglia: z.enum(FAMIGLIE).default('sans'),
  colore: colore.default(COLORE_BASE),
  paragrafi: z.array(schemaParagrafo).min(1).max(30),
});

/** Un logo o un marchio, alle misure scelte (l'editor tiene le proporzioni). */
const schemaImmagine = z.object({
  tipo: z.literal('immagine'),
  ...geometria,
  immagine: z.string().regex(E_ID_IMMAGINE),
});

/** Un rettangolo pieno: una linea, se basso; una banda di colore, se largo. */
const schemaForma = z.object({
  tipo: z.literal('forma'),
  ...geometria,
  colore,
});

const schemaElemento = z.discriminatedUnion('tipo', [schemaTesto, schemaImmagine, schemaForma]);

export type ElementoTesto = z.infer<typeof schemaTesto>;
export type ElementoImmagine = z.infer<typeof schemaImmagine>;
export type ElementoForma = z.infer<typeof schemaForma>;
export type Elemento = z.infer<typeof schemaElemento>;

/** Una fascia: quanto è alta, e che cosa c'è dentro, dal fondo alla cima (l'ultimo copre gli altri). */
export const schemaFascia = z
  .object({
    altezza: z.number().min(0).max(ALTEZZA_MASSIMA_FASCIA),
    elementi: z.array(schemaElemento).max(40).default([]),
  })
  .superRefine((fascia, ctx) => {
    fascia.elementi.forEach((e, i) => {
      if (e.x + e.larghezza > LARGHEZZA_FOGLIO + TOLLERANZA || e.y + e.altezza > fascia.altezza + TOLLERANZA) {
        ctx.addIssue({ code: 'custom', path: ['elementi', i], message: 'elemento fuori dalla fascia' });
      }
    });
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

/** La risposta al caricamento di un'immagine: l'id da mettere nell'elemento, e dove vederla. */
export interface ImmagineCaricata {
  id: string;
  url: string;
}

export const FASCIA_VUOTA: Fascia = { altezza: 0, elementi: [] };

/**
 * Il punto di partenza di un'agenzia che non ha ancora scritto niente:
 * intestazione vuota, e nel piè il solo numero di pagina, a destra, sul
 * margine del testo. È ciò che un documento senza marchio deve comunque avere.
 */
export const INTESTAZIONE_INIZIALE: Intestazione = {
  intestazione: FASCIA_VUOTA,
  piede: {
    altezza: 15,
    elementi: [
      {
        tipo: 'testo',
        id: 'numero-pagina',
        x: 130.2,
        y: 1.7,
        larghezza: 60,
        altezza: 3.5,
        verticale: 'top',
        dimensione: 7.5,
        famiglia: 'sans',
        colore: COLORE_BASE,
        paragrafi: [
          {
            type: 'paragraph',
            attrs: { textAlign: 'right' },
            content: [
              { type: 'text', text: 'Pagina ' },
              { type: 'campo', attrs: { nome: 'pagina' } },
              { type: 'text', text: ' di ' },
              { type: 'campo', attrs: { nome: 'pagine' } },
            ],
          },
        ],
      },
    ],
  },
};

/** Gli id delle immagini citate da una fascia. */
export function immaginiDellaFascia(fascia: Fascia): string[] {
  return fascia.elementi.flatMap((e) => (e.tipo === 'immagine' ? [e.immagine] : []));
}
