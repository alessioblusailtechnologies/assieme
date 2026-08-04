/**
 * Contratto di dominio di ASSIEME.
 *
 * Questi tipi sono la specifica che il backend dovrà implementare. Sono
 * scritti dal front-end perché è il front-end a conoscere l'esperienza d'uso
 * — ma da qui in avanti vanno trattati come contratto condiviso: una
 * modifica va concordata, non fatta.
 *
 * La controparte eseguibile vive in `mocks/assieme.json`: stesse rotte,
 * stesse forme. Se i due divergono, il front-end si rompe subito — ed è
 * l'unica garanzia che restino allineati.
 */

export * from './comune';
export * from './utente';
export * from './documento';
export * from './citazione';
export * from './conversazione';
export * from './tabella';
export * from './agente';
export * from './memoria';
export * from './impostazioni';
