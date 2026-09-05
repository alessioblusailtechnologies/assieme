import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Le guide di /risorse: un file Markdown per guida, in una cartella per
 * lingua. Sono pagine evergreen, non un blog: conta la data di aggiornamento,
 * non quella di uscita, e nessuna cadenza obbligata.
 *
 * ⚠️ Una collection per lingua, con la `base` che punta **dentro** la
 * cartella della lingua. È deliberato: l'id di una voce nasce dal percorso
 * relativo alla `base`, quindi una collection sola con pattern `** / *.md`
 * darebbe id come `it/memoria-agenzia-assicurativa` e l'URL diventerebbe
 * `/risorse/it/memoria-agenzia-assicurativa`. Due URL già indicizzati rotti
 * per una cartella. Così invece gli id italiani restano quelli di sempre.
 */

/** Ciò che le due lingue condividono. Il `filone` cambia, ed è l'unica cosa. */
const campiComuni = {
  title: z.string(),
  /** Riassunto per meta description, card e anteprima social. */
  description: z.string().max(170),
  /** Attacco sotto il titolo, una o due frasi. */
  lead: z.string(),
  /**
   * L'id della stessa guida nell'altra lingua. Serve agli hreflang: le guide
   * sono rotte dinamiche e non stanno nella tabella delle rotte, quindi il
   * legame fra le due versioni va dichiarato qui. Assente finché la
   * traduzione non esiste: meglio nessun alternate che uno rotto.
   */
  gemella: z.string().optional(),
  published: z.coerce.date(),
  updated: z.coerce.date(),
  /** Ordine nell'indice di /risorse: più basso, più in alto. */
  order: z.number().default(100),
  draft: z.boolean().default(false),
};

const guide = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guide/it' }),
  schema: z.object({
    ...campiComuni,
    /** Il filone: compare come etichetta sulla card e nel breadcrumb. */
    filone: z.enum(['AI in agenzia', 'Metodo', 'Documenti', 'Glossario operativo']),
  }),
});

const guideFr = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guide/fr' }),
  schema: z.object({
    ...campiComuni,
    filone: z.enum(['IA en cabinet', 'Méthode', 'Documents', 'Glossaire opérationnel']),
  }),
});

export const collections = { guide, guideFr };
