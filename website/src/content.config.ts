import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Le guide di /risorse: un file Markdown per guida in `src/content/guide/`.
 * Sono pagine evergreen, non un blog: conta la data di aggiornamento, non
 * quella di uscita, e nessuna cadenza obbligata.
 */
const guide = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guide' }),
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
