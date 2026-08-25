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
  /** Conversione documenti (Haiku) e motore agentico (Agent SDK). */
  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * Il motore agentico (Fase 3). Modello e budget per job sono le decisioni
   * aperte 1 e 4 del doc motore: si misurano qui, non si cablano.
   */
  MODELLO_MOTORE: z.string().default('claude-opus-5'),
  /**
   * Il modello dell'estrazione per le tabelle (Fase 5): un lavoro più
   * meccanico della chat — di default lo stesso del motore, si abbassa
   * quando i numeri di `consumi` lo giustificano.
   */
  MODELLO_TABELLE: z.string().optional(),
  /**
   * Modelli open hostati in Europa via HostYourAI (API Anthropic-compatibili,
   * RF-D-03): con la chiave, le voci HostYourAI del catalogo diventano
   * selezionabili e il motore le chiama con la stessa sessione, cambiando
   * solo endpoint e chiave. Senza, restano schede informative.
   */
  HOSTYOURAI_API_KEY: z.string().optional(),
  HOSTYOURAI_BASE_URL: z.string().url().default('https://hostyourai.com'),
  MOTORE_MAX_TURNI: z.coerce.number().int().min(1).default(40),
  MOTORE_BUDGET_USD: z.coerce.number().positive().default(3),
  MOTORE_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  /**
   * Quanto silenzio del modello (nessun evento di stream) prima di chiudere
   * la sessione con errore: una chiamata appesa su un gateway terzo non
   * deve tenere un job «in esecuzione» per sempre.
   */
  MOTORE_SILENZIO_MS: z.coerce.number().int().positive().default(180_000),
  /** Dove il worker materializza workspace e cache dei documenti. */
  CARTELLA_WORKER: z.string().default('.velia-worker'),
  /** In locale; in produzione la porta la assegna la piattaforma in `PORT` (vedi server.ts). */
  PORTA_API: z.coerce.number().int().default(3002),
  /**
   * Origini del front-end ammesse (separate da virgola), quando app e API
   * stanno su host diversi — Cloudflare Pages da una parte, Railway
   * dall'altra. Vuota = niente CORS (stesso host, o dev server col proxy).
   */
  CORS_ORIGINI: z.string().optional(),
  LOG_LIVELLO: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * La sandbox dell'Esportazione elaborata: `docker` (in locale, immagine
   * costruita da `sandbox/Dockerfile`) o `fly` (una Machine per job).
   * Senza, l'Esportazione elaborata risponde che non è disponibile.
   */
  SANDBOX_AVVIATORE: z.enum(['docker', 'fly']).optional(),
  SANDBOX_IMMAGINE: z.string().default('velia-sandbox'),
  /** Tetto di turni e di spesa per una sessione documentale (più alti della chat: guarda e corregge). */
  SANDBOX_MAX_TURNI: z.coerce.number().int().min(1).default(60),
  SANDBOX_BUDGET_USD: z.coerce.number().positive().default(4),
  /**
   * La chiave Anthropic che entra nella sandbox (dedicata, con tetto di
   * spesa, in un workspace suo). In locale può essere la stessa della chat:
   * senza, si usa `ANTHROPIC_API_KEY`.
   */
  ANTHROPIC_API_KEY_SANDBOX: z.string().optional(),
  FLY_API_TOKEN: z.string().optional(),
  FLY_APP_SANDBOX: z.string().default('velia-sandbox'),
  FLY_REGIONE: z.string().default('ams'),
});

export type Configurazione = z.infer<typeof schemaAmbiente>;

let cache: Configurazione | undefined;

export function configurazione(ambiente: NodeJS.ProcessEnv = process.env): Configurazione {
  if (!cache) {
    // Node 24: carica be-node/.env se esiste; in CI le variabili arrivano
    // dall'ambiente e il file non c'è.
    /* Da `src/` il file è un livello sopra; da `dist/src/` due. In produzione
       (Railway) non c'è: le variabili arrivano dalla piattaforma. */
    for (const candidato of ['../.env', '../../.env']) {
      try {
        process.loadEnvFile(fileURLToPath(new URL(candidato, import.meta.url)));
        break;
      } catch {
        /* nessun .env qui: va bene così */
      }
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
