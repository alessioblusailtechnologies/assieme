import { z } from 'zod';

/**
 * La forma d'errore che il front-end conosce e gestisce — identica a quella
 * dei mock (`mocks/data/errore-*.json` e gli stub `.mjs`):
 *
 *   { codice: 'PERMESSO_NEGATO', messaggio: '…', ritentaTraSecondi?: n }
 *
 * `codice` è un identificatore stabile in maiuscolo su cui il FE può
 * ramificare; `messaggio` è testo italiano leggibile, mai uno stack trace.
 * `ritentaTraSecondi` compare solo sui 429 (contratto RF-E-09).
 */
export const schemaErroreApi = z.object({
  codice: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  messaggio: z.string().min(1),
  ritentaTraSecondi: z.number().int().positive().optional(),
});

export type CorpoErroreApi = z.infer<typeof schemaErroreApi>;

/**
 * L'errore applicativo che le rotte e i servizi lanciano. Il gestore
 * centrale (`api/plugins/errori.ts`) lo traduce nella risposta HTTP;
 * qualunque altra eccezione diventa un 500 ERRORE_INTERNO senza dettagli.
 */
export class ErroreApi extends Error {
  constructor(
    readonly stato: number,
    readonly codice: string,
    messaggio: string,
    readonly ritentaTraSecondi?: number,
  ) {
    super(messaggio);
    this.name = 'ErroreApi';
  }

  corpo(): CorpoErroreApi {
    return {
      codice: this.codice,
      messaggio: this.message,
      ...(this.ritentaTraSecondi !== undefined && {
        ritentaTraSecondi: this.ritentaTraSecondi,
      }),
    };
  }

  // Le forme ricorrenti, coi codici che il mock usa già.

  static nonTrovato(messaggio = 'Risorsa non trovata.'): ErroreApi {
    return new ErroreApi(404, 'NON_TROVATO', messaggio);
  }

  static permessoNegato(
    messaggio = "L'utente non dispone dei permessi necessari per questa operazione.",
  ): ErroreApi {
    return new ErroreApi(403, 'PERMESSO_NEGATO', messaggio);
  }

  static nonAutenticato(messaggio = 'Autenticazione richiesta.'): ErroreApi {
    return new ErroreApi(401, 'NON_AUTENTICATO', messaggio);
  }

  static conflitto(codice: string, messaggio: string): ErroreApi {
    return new ErroreApi(409, codice, messaggio);
  }

  static quotaSuperata(ritentaTraSecondi: number, messaggio = 'Limite di richieste del piano raggiunto.'): ErroreApi {
    return new ErroreApi(429, 'QUOTA_SUPERATA', messaggio, ritentaTraSecondi);
  }

  static datiNonValidi(messaggio: string): ErroreApi {
    return new ErroreApi(400, 'DATI_NON_VALIDI', messaggio);
  }
}
