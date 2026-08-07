# Sito Velia

Sito istituzionale di **Velia**, la piattaforma conversazionale AI per
agenzie assicurative, broker e intermediari.

Costruito con [Astro](https://astro.build) in modalità statica: nessun
runtime JavaScript sul client se non i tre frammenti descritti più sotto,
nessuna richiesta a domini di terze parti, nessun cookie.

---

## Avvio

```bash
npm install
npm run dev        # http://localhost:4321
```

| Comando            | Effetto                                                    |
| ------------------ | ---------------------------------------------------------- |
| `npm run dev`      | Server di sviluppo con ricaricamento a caldo                |
| `npm run build`    | Controllo dei tipi + generazione statica in `dist/`         |
| `npm run build:fast` | Solo generazione, senza `astro check`                    |
| `npm run preview`  | Serve `dist/` come lo farebbe l'hosting                     |
| `npm run check`    | Diagnostica TypeScript e Astro                              |
| `node scripts/verify.mjs` | Controlli sul sito compilato (vedi sotto)            |

---

## ⚠️ Da fare prima della messa online

Il sito è completo e pubblicabile, ma cinque cose vanno decise da voi. Sono
tutte concentrate in pochi punti, apposta.

### 1. Variabili d'ambiente

Definite in `src/config/env.mjs`, sovrascrivibili dall'ambiente di build:

| Variabile       | Predefinito                | A cosa serve                                     |
| --------------- | -------------------------- | ------------------------------------------------ |
| `SITE_URL`      | `https://www.sonovelia.it`   | Radice di canonical, sitemap e tag Open Graph     |
| `APP_URL`       | `https://app.sonovelia.it`   | Destinazione del pulsante «Accedi»                |
| `STATUS_URL`    | `https://status.sonovelia.it`| Pagina di stato del servizio                      |
| `FORM_ENDPOINT` | *(vuoto)*                  | Destinatario del modulo «Richiedi una demo»       |

**`FORM_ENDPOINT` è la più importante.** Finché è vuota, il modulo non invia
nulla: mostra un avviso in pagina e blocca l'invio con un messaggio, invece di
far finta di aver funzionato. Puntala al vostro CRM, a un servizio di raccolta
moduli o a una funzione serverless.

### 2. Numeri e affermazioni da verificare

I contenuti sono allineati al documento **«VELIA — Analisi dei Requisiti»
v0.8 (03/08/2026)**. Quello che il documento non copre è marcato come
segnaposto e raccolto in un punto solo:

- `src/data/home.ts` → `testimonial` — citazione segnaposto («Nome Cognome»,
  «Agenzia pilota»). Il prodotto ha una sola agenzia pilota: serve una
  citazione autorizzata prima di pubblicarla.
- Loghi cliente — due nastri tratteggiati, 8 slot in alto e 6 in basso.
- `src/data/home.ts` → `stats` — non sono metriche di adozione ma fatti di
  progetto (0 documenti da caricare, 2 archivi, 4 formati, 100% risposte
  citate). Verificate che restino veri quando il prodotto evolve.

**Rimosso rispetto al design, perché contraddiceva i requisiti:** le sei
certificazioni (SOC 2, ISO 27001/27701/42001, conformità IVASS), le metriche
di adozione (2.400 clienti, 1.200.000 documenti), i canali WhatsApp ed e-mail,
e le automazioni su rinnovi, sinistri e scadenze — queste ultime sono
esplicitamente fuori perimetro (§5.5 del documento).

Il prezzo indicativo di ~€279/mese citato in RNF-05 **non** compare sul sito:
nel documento è un vincolo di costo interno, non un listino.

### 3. Dati societari

Il titolare è **Blusail Technologies S.r.l.s.**; Velia è il prodotto.
`src/config/site.ts` contiene ragione sociale, e-mail e profili social. Sede
legale, partita IVA, REA e PEC sono marcati «da completare» nelle pagine
legali, e l'indirizzo non compare nei dati strutturati finché non è quello
reale. I testi legali sono una base ragionevole, **non un parere legale**.

### 4. Immagini

Il design consegna segnaposto tratteggiati, e così sono stati implementati.
Vanno sostituiti con materiale reale:

- fotografia dell'eroe (agenzia / cliente in riunione);
- loghi cliente nelle due fasce (8 slot in alto, 6 in basso);
- ritratto per la testimonianza (formato 3:4);
- copertine dei tre video nella sezione «Risultati reali».

Quando arriveranno, conviene passare al componente `<Image />` di Astro per
avere dimensioni esplicite e formati moderni.

### 5. Hosting

`astro.config.mjs` usa `build.format: 'file'` con `trailingSlash: 'never'`:
in `dist/` trovate `piattaforma.html` e il sito va servito su URL puliti
(`/piattaforma`). Netlify, Vercel e Cloudflare Pages lo fanno da soli. Con
Nginx serve `try_files $uri $uri.html $uri/ =404;`.

---

## Struttura

```
src/
  components/          Componenti condivisi (header, footer, SEO, blocchi)
    home/              Sezioni esclusive della homepage
  config/
    env.mjs            Costanti lette anche da astro.config.mjs
    site.ts            Identità, navigazione, footer, annunci
  data/home.ts         Tutti i contenuti della homepage
  layouts/             BaseLayout e LegalLayout
  pages/               Una pagina per file
  scripts/             Logica client (grafo della memoria)
  styles/              tokens.css, fonts.css, global.css
  utils/               Normalizzazione dei percorsi
public/
  fonts/               Newsreader e DM Mono self-ospitati
  og/                  Immagini per le anteprime social
scripts/
  generate-assets.ps1  Rigenera OG image e icone
  verify.mjs           Controlli sul sito compilato
```

### Pagine

`/` · `/piattaforma` · `/soluzioni` · `/clienti` · `/sicurezza` · `/risorse` ·
`/azienda` · `/demo` · `/legale/privacy` · `/legale/cookie` ·
`/legale/note-legali` · `404`

Nessun link di navigazione punta nel vuoto: `scripts/verify.mjs` lo verifica a
ogni build.

---

## Design

Il sito replica il design consegnato in `../velia-homepage.html`. Gli stili
inline dell'esportazione sono stati convertiti in un sistema di token
(`src/styles/tokens.css`) — colori, scala tipografica, spaziature — e in CSS
con ambito di componente.

**Tipografia.** Newsreader per i titoli (variable font 300–600), DM Mono per
etichette e riferimenti, Helvetica Neue per il corpo. I file `.woff2` sono
estratti dall'esportazione del design e serviti dal nostro dominio: nessuna
chiamata a `fonts.googleapis.com`, che trasferirebbe l'IP dei visitatori fuori
dall'Unione Europea — in contraddizione con quello che il sito stesso dichiara.

**Responsività.** Il design è a larghezza fissa (1280px). Il sito no: scala
in modo fluido con `clamp()` e riorganizza le griglie a 1080px, 1000px, 900px,
680px e 560px.

**Animazioni.** Tre, tutte rispettose di `prefers-reduced-motion`:

| Elemento              | Tecnica            | Con motion ridotta                     |
| --------------------- | ------------------ | -------------------------------------- |
| Barra annunci         | CSS marquee        | Si ferma e diventa scorrevole a mano   |
| Ticker dei casi d'uso | CSS keyframes      | Diventa un elenco statico completo     |
| Grafo della memoria   | Canvas 2D          | Disegna un solo fotogramma             |

Il grafo è portato dal modulo del design (`startGraph`) con tre aggiunte:
seme fisso perché la figura sia identica a ogni visita, avvio ritardato
all'ingresso nel viewport tramite `IntersectionObserver` e sospensione quando
la scheda passa in secondo piano.

---

## SEO e accessibilità

- `lang="it"`, un solo `<h1>` per pagina, gerarchia dei titoli coerente.
- `<title>` e `description` unici, lunghezze verificate automaticamente.
- Canonical su URL puliti, coerenti con la sitemap.
- Open Graph e Twitter Card con immagine PNG 1200×630 generata.
- Dati strutturati JSON-LD: `Organization` e `WebSite` ovunque,
  `SoftwareApplication` in home, `FAQPage` su `/sicurezza`, `ContactPage` su
  `/demo`, `BreadcrumbList` sulle pagine interne.
- `sitemap-index.xml` e `robots.txt` generati in fase di build.
- Link di salto al contenuto, `aria-current` sulla voce attiva, focus visibile
  su fondo chiaro e scuro, tabelle con intestazioni associate, modulo con
  etichette esplicite e validazione in italiano.

### Controlli automatici

```bash
npm run build && node scripts/verify.mjs
```

Verifica: link interni e ancore (537 alla consegna, tutti validi), unicità di
titoli e descrizioni, presenza dei canonical, un solo `<h1>` per pagina,
validità dei blocchi JSON-LD e corrispondenza fra pagine e sitemap. Esce con
codice 1 in caso di problemi, quindi è utilizzabile in CI.
