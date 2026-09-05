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
 *
 * Il francese entra qui come `guideFr` con base `./src/content/guide/fr`.
 */
const guide = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guide/it' }),
  schema: z.object({
    title: z.string(),
    /** Riassunto per meta description, card e anteprima social. */
    description: z.string().max(170),
    /** Attacco sotto il titolo, una o due frasi. */
    lead: z.string(),
    /** Il filone: compare come etichetta sulla card e nel breadcrumb. */
    filone: z.enum(['AI in agenzia', 'Metodo', 'Documenti', 'Glossario operativo']),
    published: z.coerce.date(),
    updated: z.coerce.date(),
    /** Ordine nell'indice di /risorse: più basso, più in alto. */
    order: z.number().default(100),
    draft: z.boolean().default(false),
  }),
});

export const collections = { guide };
