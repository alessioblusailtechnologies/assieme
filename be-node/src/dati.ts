import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * I dati di piattaforma stanno in `be-node/dati/` e si leggono a runtime: la
 * libreria degli agenti predefiniti (RF-E-10) è il primo caso.
 *
 * Il livello a cui cercarli dipende da come gira il processo. In sviluppo il
 * codice sta in `src/`, e `dati/` è un livello sopra; nell'immagine il
 * compilato vive in `dist/src/` (`node dist/src/api/server.js`) mentre il
 * Dockerfile mette `dati` accanto a `dist`, quindi i livelli sono due. È la
 * stessa faccenda del `.env` in `config.ts`, e si risolve allo stesso modo:
 * si provano i candidati invece di indovinare.
 *
 * Indovinarne uno solo non si vede in prova, perché test e stack di sviluppo
 * girano da `src`: si vede in produzione, dove la lettura fallisce e la rotta
 * risponde 500.
 */
export function leggiDatoDiPiattaforma(nome: string, base: string | URL = import.meta.url): string {
  for (const candidato of [`../dati/${nome}`, `../../dati/${nome}`]) {
    try {
      return readFileSync(fileURLToPath(new URL(candidato, base)), 'utf8');
    } catch {
      /* non è questo il livello: si prova quello sopra */
    }
  }
  throw new Error(`Dato di piattaforma non trovato: dati/${nome}`);
}
