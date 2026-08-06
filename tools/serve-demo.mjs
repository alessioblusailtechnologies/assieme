/**
 * Server per la demo pubblica.
 *
 * Espone **una sola porta** che serve la build di produzione e inoltra le
 * chiamate `/api` ai due server mock. È ciò che si punta con un tunnel
 * (ngrok, Cloudflare Tunnel) invece del dev server.
 *
 * Perché non tunnellare direttamente `ng serve`:
 *
 * - il dev server mostra il **pannello di sviluppo**, i sorgenti in chiaro e
 *   un bundle non ottimizzato — non è ciò che si fa vedere a un cliente;
 * - Vite rifiuta gli Host header sconosciuti, quindi rifiuterebbe le
 *   richieste che arrivano dal dominio del tunnel;
 * - servirebbero tre porte esposte invece di una.
 *
 * Nessuna dipendenza esterna: solo moduli di Node. Un server che esiste per
 * mostrare il prodotto non deve portarsi dietro una catena di pacchetti da
 * mantenere.
 *
 * ⚠️ **Non c'è autenticazione.** Chiunque abbia l'indirizzo vede tutto. I
 * dati sono finti, ma il prodotto no: l'indirizzo va trattato come
 * riservato. Le risposte portano `X-Robots-Tag: noindex, nofollow` e la
 * build include un `robots.txt` che vieta tutto, ma quelli valgono per i
 * motori di ricerca educati, non per chi riceve il collegamento.
 *
 * Avvio: `npm run demo` dalla cartella `fe-angular`.
 */

import { createServer, request as richiestaHttp } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORTA = Number(process.env.PORTA ?? 8080);
const QUI = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(QUI, '..', 'fe-angular', 'dist', 'fe-angular', 'browser');

/** Stessa suddivisione del proxy di sviluppo: chi ha logica sta sul 3001. */
const INSTRADAMENTO = [
  { prefisso: '/api/documenti', porta: 3001 },
  { prefisso: '/api/etichette', porta: 3001 },
  { prefisso: '/api/spazio', porta: 3001 },
  { prefisso: '/api/conversazioni', porta: 3001 },
  { prefisso: '/api/template', porta: 3001 },
  { prefisso: '/api/tabelle', porta: 3001 },
  { prefisso: '/api/modelli', porta: 3001 },
  { prefisso: '/api/istruzioni', porta: 3001 },
  { prefisso: '/api/utenti', porta: 3001 },
  { prefisso: '/api/identita-visiva', porta: 3001 },
  { prefisso: '/api/impostazioni', porta: 3001 },
  { prefisso: '/api/agenti', porta: 3001 },
  { prefisso: '/api', porta: 3000 },
];

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Inoltra la richiesta al mock, in streaming.
 *
 * `pipe` e non "leggi tutto poi rispondi": lo streaming della chat (SSE)
 * deve arrivare al browser man mano che il server lo produce. Bufferizzare
 * qui vanificherebbe l'unica cosa che quello stub esiste per fare.
 */
function inoltra(req, res, porta) {
  const monte = richiestaHttp(
    { host: '127.0.0.1', port: porta, path: req.url, method: req.method, headers: req.headers },
    (rispostaMonte) => {
      res.writeHead(rispostaMonte.statusCode ?? 502, rispostaMonte.headers);
      rispostaMonte.pipe(res);
    },
  );

  monte.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        codice: 'MOCK_NON_RAGGIUNGIBILE',
        messaggio: `Il server mock sulla porta ${porta} non risponde.`,
      }),
    );
  });

  req.pipe(monte);
}

function serviFile(res, percorso, stato = 200) {
  res.writeHead(stato, {
    'Content-Type': TIPI[extname(percorso)] ?? 'application/octet-stream',
    'Content-Length': statSync(percorso).size,
    /* I file con impronta nel nome sono immutabili; index.html no, altrimenti
       una nuova build non arriverebbe mai a chi ha già aperto la pagina. */
    'Cache-Control': percorso.endsWith('index.html')
      ? 'no-cache'
      : 'public, max-age=31536000, immutable',
  });
  createReadStream(percorso).pipe(res);
}

const server = createServer((req, res) => {
  /* Vale per ogni risposta, anche per i file: un motore di ricerca che
     arrivasse a un JavaScript non deve indicizzarlo. */
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  const url = new URL(req.url ?? '/', `http://localhost:${PORTA}`);
  const percorso = url.pathname;

  const rotta = INSTRADAMENTO.find((r) => percorso.startsWith(r.prefisso));
  if (rotta) {
    inoltra(req, res, rotta.porta);
    return;
  }

  /*
   * `normalize` prima di unire: senza, un percorso con "../.." servirebbe
   * qualsiasi file del disco. È il difetto classico dei server statici
   * scritti a mano, e vale la pena non averlo nemmeno in una demo.
   */
  const richiesto = join(DIST, normalize(percorso).replace(/^(\.\.[/\\])+/, ''));
  if (!richiesto.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }

  if (existsSync(richiesto) && statSync(richiesto).isFile()) {
    serviFile(res, richiesto);
    return;
  }

  /*
   * Un file mancante è 404, non un ripiego.
   *
   * Il ripiego a pagina singola vale per i percorsi **senza estensione** —
   * quelle sono rotte di Angular e le risolve il router nel browser. Un
   * percorso che finisce in `.woff2` o `.js` è invece una richiesta di file:
   * rispondere `index.html` con 200 le fa credere di aver ricevuto il file,
   * e il browser prova a interpretare dell'HTML come font o come script.
   * Sembra innocuo perché ripiega comunque, ma nasconde l'errore vero e
   * rende difficile capire perché una risorsa non arrivi.
   */
  if (extname(percorso)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('File non trovato.');
    return;
  }

  const indice = join(DIST, 'index.html');
  if (existsSync(indice)) {
    serviFile(res, indice);
    return;
  }

  res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Build non trovata: eseguire prima "npm run build".');
});

server.listen(PORTA, () => {
  console.log(`[demo] build servita da ${DIST}`);
  console.log(`[demo] in ascolto su http://localhost:${PORTA}`);
  console.log('[demo] /api -> 3000 (Mockoon); documenti, conversazioni e template -> 3001');
  console.log('[demo] nessuna autenticazione: trattare l\'indirizzo come riservato');
});
