# ASSIEME — Front-end

Angular 22 · PrimeNG 22 · AG Grid 36 · Hugeicons · Mockoon

Stato: **Fase 0 completata** (fondamenta). Le schermate sono segnaposto che
dichiarano la fase in cui verranno costruite. Vedi
[`../ASSIEME-piano-sviluppo-fe.md`](../ASSIEME-piano-sviluppo-fe.md).

---

## Avvio

```bash
npm install
npm run dev
```

`npm run dev` avvia tre processi insieme:

| Processo | Porta | Cosa fa |
|---|---|---|
| `mock` | 3000 | Mockoon: tutte le API REST |
| `mock:sse` | 3001 | stub SSE: il solo streaming della chat |
| `start` | 4200 | dev server Angular |

Il front-end chiama sempre `/api/...`. Il proxy (`proxy.conf.json`) smista:
`/api/stream` → 3001, tutto il resto → 3000. **Il codice applicativo non sa
chi risponde** — è il punto di tutta l'impostazione: quando arriverà il
backend cambia l'indirizzo nel proxy e nient'altro.

Comandi singoli: `npm run mock`, `npm run mock:sse`, `npm start`.

```bash
npm run build   # build di produzione
npm test        # Vitest
npm run lint    # ESLint + regole sui template
```

---

## Il server mock

Vive in [`../mocks/`](../mocks/), **fuori da questa cartella**: non è codice
front-end, è il contratto condiviso col backend. L'ambiente
`mocks/assieme.json` è una specifica eseguibile — chi implementerà il backend
lo avvia e vede rotte, header e forme di risposta attese.

- `mocks/assieme.json` — ambiente Mockoon (rotte e regole)
- `mocks/data/*.json` — fixture
- `mocks/sse-stub.mjs` — streaming della chat

### Perché uno stub separato per lo streaming

**Mockoon non supporta SSE** (issue #990 sul repository, bassa priorità).
Supporta i WebSocket da v9, ma se il backend userà SSE — lo standard di fatto
per lo streaming dei modelli linguistici — costruire la chat su WebSocket
significherebbe riscrivere poi la parte più delicata dell'applicazione.
Quaranta righe di Node tengono il trasporto identico a quello di produzione.

> **Decisione aperta col backend: SSE o WebSocket?** Se WebSocket, lo stub si
> butta e si usa Mockoon.

### Simulare rete lenta ed errori

Il pannello **dev** in basso a destra (solo fuori produzione) imposta header
che Mockoon interpreta:

| Header | Effetto |
|---|---|
| `X-Assieme-Ruolo` | `operatore` \| `amministratore` — cambia la sessione restituita |
| `X-Mock-Latenza: 3000` | risposta dopo 3 s invece dei 400 ms di base |
| `X-Mock-Errore` | `500` \| `403` \| `429` \| `timeout` — vale per una chiamata sola |

Gli errori sono errori veri, con `HttpErrorResponse` veri: il codice li
gestisce come gestirà quelli di produzione. Nessun ramo condizionale
nell'applicazione finge alcunché.

La simulazione degli errori sta in **una sola rotta** (`all /*`, prima di
tutte) in modalità `FALLBACK`: senza l'header nessuna regola combacia e la
richiesta prosegue verso la rotta vera.

### Quando arriverà il backend

Mockoon ha una **modalità proxy**: si punta `proxyHost` al backend reale e si
cancellano dall'ambiente le rotte man mano che vengono implementate. Le
richieste senza rotta mock proseguono verso il server vero. Si passa endpoint
per endpoint, con l'applicazione sempre funzionante.

---

## Struttura

```
src/
├── app/
│   ├── core/          servizi singleton, modelli, interceptor, sessione, strumenti dev
│   │   ├── models/    ⚠️ il contratto verso il backend — modifiche da concordare
│   │   ├── auth/      sessione e permessi
│   │   └── sviluppo/  pannello dev (fuori dalla produzione)
│   ├── shared/        primitive riusabili (`ui-*`) e segnaposto
│   ├── layout/        shell, barra laterale, barra superiore, navigazione
│   └── features/      una cartella per modulo, in lazy loading
└── styles/
    ├── _tokens.scss   token dal sito + estensioni applicative
    └── theme/         preset PrimeNG e tema AG Grid
```

**`features/` non importa mai da un altro `features/`.** Ciò che serve a due
funzionalità sale in `shared/` o `core/`. È l'unica regola che tiene
navigabile un'applicazione di questa dimensione a sei mesi di distanza.

Alias: `@core/*`, `@shared/*`, `@layout/*`, `@features/*`, `@theme/*`, `@env`.

---

## Convenzioni

- **Zoneless.** `zone.js` non è installato: ogni stato che l'interfaccia
  mostra **deve** essere un signal. Un campo di classe normale non innesca il
  ridisegno — è l'errore più facile da fare in questa versione.
- Componenti standalone, `input()` / `output()` / `model()`, mai
  `@Input`/`@Output`.
- `@if` / `@for` / `@switch`, mai `*ngIf` / `*ngFor`.
- `inject()` invece dell'iniezione da costruttore.
- Nessun `Observable` nei componenti: la conversione avviene nei servizi.
- PrimeNG importato per componente, mai in blocco.
- Prefissi: `ui-` per le primitive di `shared/ui` (non conoscono il dominio,
  si usano ovunque), `app-` per tutto il resto.
- Nomi di dominio in italiano (`Documento`, `Conversazione`), inglese per i
  tecnicismi (`ApiService`, `interceptor`).

### Permessi

Mai `ruolo() === 'amministratore'` in un template. Sempre:

```ts
sessione.puo('istruzioni.gestisci');
```

Il modello dei ruoli è ancora aperto nell'analisi dei requisiti: quando
arriverà quello definitivo deve cambiare `core/auth/sessione-store.ts` e
nient'altro.

### `httpResource` e lo stato d'errore

`risorsa.value()` **solleva un'eccezione** quando la risorsa è in errore.
Letto direttamente in un template, il fallimento di una chiamata farebbe
saltare la rilevazione delle modifiche e lascerebbe l'utente davanti a una
pagina bianca. Esporre sempre il valore così:

```ts
readonly dato = computed(() => (this.risorsa.hasValue() ? this.risorsa.value() : undefined));
```

---

## Tema

Il tema **non** è un foglio di stile: è TypeScript.

- `styles/theme/assieme-preset.ts` — preset PrimeNG su base **Nora**
- `styles/theme/ag-grid-theme.ts` — tema AG Grid via Theming API (i CSS dei
  temi sono deprecati da v33)

Per cambiare l'aspetto di un componente PrimeNG **si parte sempre dal
preset**. `styles/_primeng-overrides.scss` è l'eccezione, per i dettagli che
i token non raggiungono, e ogni regola lì dentro va motivata. Tenerlo corto è
un indicatore di salute del tema.

Due dettagli che sembrano minori e non lo sono:

- **`--radius: 0` ovunque.** Nel design originale non esiste un solo elemento
  arrotondato: è metà del carattere del prodotto.
- **`color-scheme: light` su `:root`.** I preset PrimeNG esprimono quasi ogni
  colore con la funzione CSS `light-dark()`, che sceglie in base a
  `color-scheme` e non al selettore di tema. Senza quella riga, un utente col
  sistema operativo in modalità scura vedrebbe i valori scuri anche a
  modalità scura disattivata.

### Icone

Tre set convivono. La regola:

| Dove | Set |
|---|---|
| Navigazione, azioni, stati vuoti, pulsanti | **Hugeicons**, via `<ui-icon>` |
| Interni ai componenti PrimeNG | PrimeIcons, salvo eccezioni |
| Griglia AG Grid | Hugeicons via `iconOverrides` |

I nomi in `<ui-icon>` sono **di dominio, non di disegno**: `documento`,
`agente`, `memoria`. Cambiare il disegno di un'icona è una riga nel registro,
non una caccia in trenta template.

## Licenza PrimeNG

⚠️ **Da PrimeNG 22 la libreria non è più MIT.** PrimeTek ha archiviato il
repository il 29/06/2026 e ha spostato PrimeNG, PrimeReact e PrimeVue sotto
licenza commerciale *PrimeUI*. Le versioni MIT esistenti (≤ 21) restano MIT,
ma richiedono Angular ≤ 21: tornare indietro significherebbe retrocedere
anche Angular e perdere `httpResource` e Signal Forms stabili.

Usiamo la **Community License**, gratuita per organizzazioni con fatturato
< 1 M USD, < 5 sviluppatori, < 10 dipendenti e < 3 M USD di capitale esterno.

| | |
|---|---|
| Chiave | `environment.ts` → `primeuiLicense`, passata a `providePrimeNG({ license })` |
| Emessa | 04/08/2026 |
| **Scade** | **04/08/2027** — rinnovo gratuito riconfermando i requisiti su [primeui.store/primeui](https://primeui.store/primeui), 30 giorni di tolleranza |

La chiave sta nel repository ed entra nel bundle: la licenza dichiara
espressamente che «may appear in your application bundle and contains no
sensitive data». La verifica è offline, senza telemetria.

**Senza chiave valida** PrimeNG inietta un banner rosso *"Invalid PrimeUI
License"* in basso a destra, in uno shadow root chiuso, visibile anche in
sviluppo. Non va nascosto: la licenza vieta di rimuovere i meccanismi di
licenza. Se scade, si rinnova.

Da mettere in conto: quando ASSIEME supererà il milione di fatturato servirà
la **licenza commerciale**, 599 USD per sviluppatore fino al 31/12/2026, poi
799. Perpetua sulle versioni coperte, un anno di aggiornamenti, e include i
componenti PRO — fra cui lo Scheduler, che potrebbe servire per la
pianificazione degli agenti (RF-E-04).

## AG Grid

Community, non Enterprise. **L'esportazione XLSX è una funzionalità
Enterprise** (da 999 USD per sviluppatore) e non la compriamo: RF-C-14
rimanda a RF-D-10, cioè esportazione su template grafico dell'agenzia — un
XLSX brandizzato non lo produce un pulsante della griglia, lo produce il
backend.

AG Grid va importato **solo** dentro `features/tabelle/`, che è in lazy
loading: nel bundle iniziale non deve entrare.
