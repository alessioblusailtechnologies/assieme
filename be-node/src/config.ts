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
   * Il modello dell'estrazione dei ricordi (Fase 8): un compito da lettore,
   * non da consulente, che gira dopo OGNI risposta. Fisso, non segue il
   * modello del tenant: su Opus pesava fino al 40% dei job semplici
   * (analisi consumi del 26/08/2026) per dire quasi sempre «niente».
   */
  MODELLO_MEMORIA: z.string().default('claude-sonnet-5'),
  /**
   * I saluti della schermata iniziale (28/08/2026): un lotto di frasi per
   * fascia oraria, generato dall'API quando quello in tabella è più vecchio
   * di `SALUTI_ORE_VALIDITA`. Una chiamata al giorno da pochi centesimi:
   * il confronto del 29/08/2026 sullo stesso prompt dava Haiku legnoso,
   * Sonnet naturale, Opus con un gradino in più di concretezza d'agenzia
   * («Caffè e prime pratiche», «Il telefono tace un po'»); per ~1,5 $ al
   * mese la prima riga che l'utente legge merita Opus. Si cambia da qui.
   */
  MODELLO_SALUTI: z.string().default('claude-opus-5'),
  SALUTI_ORE_VALIDITA: z.coerce.number().positive().default(24),
  /** `no` spegne la generazione (i test la tengono spenta): restano le frasi fisse del FE. */
  SALUTI_GENERAZIONE: z.enum(['si', 'no']).default('si'),
  /**
   * I suggerimenti della home (29/08/2026): domande di partenza sul
   * contesto dell'agenzia, un lotto per utente generato dall'API quando
   * quello in tabella è scaduto o l'archivio privato è cambiato. Per utente
   * e per giorno: Sonnet regge il rapporto qualità/costo (~1 centesimo a
   * lotto); Opus se si vuole il gradino in più.
   */
  MODELLO_SUGGERIMENTI: z.string().default('claude-sonnet-5'),
  /**
   * «Scrivi il prompt» nel composer (29/08/2026): riscrive l'abbozzo
   * dell'utente come richiesta completa. Una chiamata breve a ogni clic:
   * Sonnet basta e costa poco.
   */
  MODELLO_PROMPT: z.string().default('claude-sonnet-5'),
  SUGGERIMENTI_ORE_VALIDITA: z.coerce.number().positive().default(24),
  /** `no` spegne la generazione (i test la tengono spenta): restano gli esempi del FE. */
  SUGGERIMENTI_GENERAZIONE: z.enum(['si', 'no']).default('si'),
  /**
   * Modelli open hostati in Europa via HostYourAI (API Anthropic-compatibili,
   * RF-D-03): con la chiave, le voci HostYourAI del catalogo diventano
   * selezionabili e il motore le chiama con la stessa sessione, cambiando
   * solo endpoint e chiave. Senza, restano schede informative.
   */
  HOSTYOURAI_API_KEY: z.string().optional(),
  HOSTYOURAI_BASE_URL: z.string().url().default('https://hostyourai.com'),
  /**
   * L'invio email («Invia email» sotto una risposta, 29/08/2026): Resend via
   * HTTP, nessuna dipendenza. Senza chiave, fuori produzione l'email finisce
   * nel log e l'invio si dichiara simulato (il flusso si prova lo stesso);
   * in produzione l'invio risponde 503. Il mittente va verificato su Resend.
   */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_MITTENTE: z.string().default('Velia <noreply@sonovelia.it>'),
  /**
   * La dettatura nel composer (29/08/2026): Voxtral di Mistral (dati in
   * UE, 0,003 $/min). Senza chiave il microfono dice che non è configurato.
   * `voxtral-mini-latest` è Voxtral Mini Transcribe 2.
   */
  MISTRAL_API_KEY: z.string().optional(),
  MODELLO_TRASCRIZIONE: z.string().default('voxtral-mini-latest'),
  MOTORE_MAX_TURNI: z.coerce.number().int().min(1).default(40),
  MOTORE_BUDGET_USD: z.coerce.number().positive().default(3),
  MOTORE_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  /**
   * Ripresa di sessione nel multi-turno: il messaggio successivo riprende la
   * sessione SDK del precedente (trascrizione sul disco del worker) invece
   * di ripartire con la storia nel prompt. Misura del 26/08/2026: follow-up
   * a -76% di costo. `no` per tornare al job pieno a ogni messaggio.
   */
  MOTORE_RIPRESA: z.enum(['si', 'no']).default('si'),
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
  SANDBOX_AVVIATORE: z.enum(['docker', 'fly', 'render']).optional(),
  SANDBOX_IMMAGINE: z.string().default('velia-sandbox'),
  /**
   * `render` (29/08/2026): il runner della sandbox è un servizio sempre
   * acceso sulla rete privata (Render Private Service dalla stessa immagine,
   * con `SANDBOX_RETE=aperta`): qui il suo indirizzo e il segreto condiviso.
   */
  /* Anche senza schema («velia-sandbox:10000», com'è da Render): lo completa l'avviatore. */
  SANDBOX_URL: z.string().min(1).optional(),
  SANDBOX_TOKEN: z.string().min(16).optional(),
  /** Quanto il worker aspetta che il runner si liberi da un altro job (ms). */
  SANDBOX_ATTESA_MS: z.coerce.number().int().positive().default(10 * 60_000),
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
