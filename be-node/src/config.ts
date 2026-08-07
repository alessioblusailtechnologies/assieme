import { fileURLToPath } from 'node:url';

import { z } from 'zod';

/**
 * Configurazione dal solo ambiente, validata all'avvio: un processo con
 * configurazione sbagliata deve morire subito e con un messaggio chiaro,
 * non fallire alla prima richiesta.
 *
 * Il progetto Supabase è quello online (nessuno stack locale): i valori
 * stanno in `be-node/.env` (mai nel repository — vedi `.env.example`).
 */
const schemaAmbiente = z.object({
  /** https://<ref>.supabase.co */
  SUPABASE_URL: z.string().url(),
  /** Chiave pubblica: la usa l'API insieme al JWT dell'utente (RLS attiva). */
  SUPABASE_ANON_KEY: z.string().min(1),
  /** Chiave di servizio: solo worker e job di sistema. Scavalca la RLS. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /**
   * Segreto JWT del progetto (progetti con chiavi legacy HS256, com'è il
   * nostro: il JWKS è vuoto). Se un domani il progetto migra alle signing
   * key asimmetriche, si toglie da .env e la verifica passa da sola al JWKS.
   */
  SUPABASE_JWT_SECRET: z.string().optional(),
  /**
   * Connessione Postgres diretta (pooler in modalità sessione o connessione
   * diretta): serve a worker (LISTEN/NOTIFY, pgmq) e test di integrazione.
   * Opzionale perché l'API pura ne fa a meno: chi la usa fallisce con un
   * messaggio chiaro se manca (poolDb).
   */
  DATABASE_URL: z.string().min(1).optional(),
  /** Conversione documenti (Haiku) e, in Fase 3, motore agentico. */
  ANTHROPIC_API_KEY: z.string().optional(),
  PORTA_API: z.coerce.number().int().default(3002),
  LOG_LIVELLO: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Configurazione = z.infer<typeof schemaAmbiente>;

let cache: Configurazione | undefined;

export function configurazione(ambiente: NodeJS.ProcessEnv = process.env): Configurazione {
  if (!cache) {
    // Node 24: carica be-node/.env se esiste; in CI le variabili arrivano
    // dall'ambiente e il file non c'è.
    try {
      process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
    } catch {
      /* nessun .env: va bene così */
    }
    const esito = schemaAmbiente.safeParse(ambiente);
    if (!esito.success) {
      const campi = esito.error.issues.map((p) => p.path.join('.')).join(', ');
      throw new Error(
        `Configurazione mancante o non valida (${campi}). Copia .env.example in .env e compila i puntamenti del progetto Supabase.`,
      );
    }
    cache = esito.data;
  }
  return cache;
}
