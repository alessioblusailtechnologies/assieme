/**
 * Il worker di prova del 22/09/2026, su questa macchina: Claude Code
 * completo al posto del motore della chat e della sandbox, e il LibreOffice
 * della macchina al posto del container, come in una sessione di Claude
 * Code aperta da qui, con quattro domande della chat alla volta. Imposta le
 * variabili che mancano (senza toccare `.env`, che vince solo su quelle non
 * impostate) e avvia il worker di sempre.
 *
 *   npm run worker:claude-code                                → la coda del `.env` (lavori_locale)
 *   $env:CODA_LAVORI='lavori'; npm run worker:claude-code     → le code di velia-dev
 *
 * Le cartelle sono quelle di questa macchina: Python 3.13 installato per
 * l'utente, LibreOffice dall'MSI ufficiale.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

const PYTHON = join(homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313');
const LIBREOFFICE = 'C:\\Program Files\\LibreOffice\\program';

process.env['MOTORE_CHAT'] ??= 'claude-code';
process.env['CLAUDE_CODE_PATH'] ??= [PYTHON, join(PYTHON, 'Scripts'), LIBREOFFICE].join(';');
process.env['LIBREOFFICE'] ??= join(LIBREOFFICE, 'soffice.exe');
/* Quattro domande alla volta (22/09/2026, il committente): ognuna è un
   processo di Claude Code, e una risposta senza tetti può durare minuti. */
process.env['CONCORRENZA_CHAT'] ??= '4';

await import('../src/worker/main.js');
