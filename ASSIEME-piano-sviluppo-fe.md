# ASSIEME — Piano di sviluppo Front-end

| Campo | Valore |
|---|---|
| Documento | Piano di sviluppo FE |
| Versione | 0.4 — design system proprio, via PrimeNG e AG Grid |
| Data | 05/08/2026 |
| Riferimento | `ASSIEME-analisi-requisiti.md` v0.9 |
| Progetto | `fe-angular/` — Angular 22.1.x |

---

## 1. Obiettivo di questa fase

Costruire **l'intero front-end funzionante contro un server mock**, senza backend applicativo.

Non è un prototipo usa-e-getta: è il front-end definitivo, che parla HTTP vero con un server vero. Cambia solo chi risponde. Da questo lavoro escono tre risultati che restano validi dopo:

1. **Un'applicazione dimostrabile** al cliente pilota e in demo commerciale, con dati realistici e persistenza di sessione.
2. **Il contratto API in due forme**: le interfacce TypeScript nel FE e l'ambiente Mockoon, che è una specifica *eseguibile* — il backend può lanciarlo e vedere esattamente quali richieste arrivano e quali risposte sono attese.
3. **Il tema applicativo**: PrimeNG e AG Grid ricondotti alla lingua visiva di ASSIEME, riusabile per tutto il resto del prodotto.

**Fuori perimetro adesso:** autenticazione reale, elaborazione documenti, chiamate ai provider AI, generazione dei documenti su template, server MCP. Tutto ciò che li riguarda esiste come interfaccia e come contratto, mai come implementazione.

**Criterio di uscita:** quando il backend espone i primi endpoint, cambia un indirizzo nel proxy. Nessun componente e nessun servizio di dominio va riscritto.

---

## 2. Stack — versioni verificate

| Elemento | Versione | Nota |
|---|---|---|
| Angular | 22.1.x | standalone, niente NgModule |
| TypeScript | 6.0.x | |
| Change detection | **zoneless** | default in v22, `zone.js` non è installato → **la reattività passa obbligatoriamente dai signal** |
| Componenti UI | **design system proprio** | `shared/ui` + `styles/_ui.scss`; nessuna libreria di componenti (v0.4 — prima PrimeNG, poi rimosso) |
| Tipografia | TWK Ghost + Geist | self-ospitati; Ghost (licenza Weltkern) è la voce dell'interfaccia, Geist (OFL, variabile) la voce di lettura |
| pdf.js | `pdfjs-dist` 6.x | visualizzatore con apertura sul passaggio citato (RF-C-05), caricato pigramente |
| Hugeicons | `@hugeicons/angular` 1.0.10 + `@hugeicons/core-free-icons` 4.2.3 | unico set di icone dell'applicazione |
| Mockoon CLI | 9.8.0 | server mock |
| Test | Vitest 4 | nuovo default Angular 22 |
| Node | 24.19.0 LTS | |

Due API di Angular 22 verificate nei tipi installati, entrambe **API pubblica stabile** (`@publicApi 22.0`):

- `httpResource()` — fetch dichiarativo che restituisce un `Resource` con signal di `value`/`status`/`error`, si ri-esegue da solo al cambiare dei signal da cui dipende l'URL.
- **Signal Forms** (`@angular/forms/signals`) — form a signal con validazione dichiarativa.

Da aggiungere: `angular-eslint`, `ng generate environments`, `concurrently` (per avviare mock e dev server insieme).

---

## 3. Interfaccia: PrimeNG tematizzato

> **Superato (08/2026):** su indicazione del committente PrimeNG è stato
> rimosso del tutto. L'interfaccia è il **design system proprio di ASSIEME**,
> ispirato a quello di Harvey (harvey.ai): scala di neutri caldi quasi
> bianchi con token semantici nominati per intento (`styles/_tokens.scss`),
> classi dei componenti in `styles/_ui.scss`, componenti `ui-*` in
> `shared/ui` (bottone, campo, select, checkbox, briciole, paginazione,
> tabella, tag, suggerimento, cassetto, menù, notifiche). Barra laterale
> chiara, angoli 8px, azione primaria nel blu del marchio (#2f4b7c), blu
> come segnale e mai come fondo decorativo. Tipografia a due voci,
> self-ospitata: **TWK Ghost** (interfaccia, titoli, etichette — il
> carattere del riferimento Harvey, licenza Weltkern: i sorgenti stanno
> fuori dal repository) e **Geist variabile** (lettura lunga: chat e celle
> dati, licenza OFL). Nessuna dipendenza di componenti, nessuna licenza di
> librerie UI. Questa sezione resta come storia.

PrimeNG 22 usa il **modo stilizzato a design token** su tre livelli — primitivi (palette), semantici (`primary.color`), di componente (`inputtext.background`). È esattamente la struttura che serve per portarci sopra i token di ASSIEME: si sovrascrivono i token, non si combatte il CSS.

### Preset di base: Nora

Dei quattro preset disponibili (Aura, Material, Lara, Nora), **Nora** è quello di impostazione enterprise, il meno arrotondato e il più sobrio — il punto di partenza più vicino all'estetica piatta e squadrata di ASSIEME. Su di esso si definisce il preset `assieme`:

```ts
// src/styles/theme/assieme-preset.ts
import Nora from '@primeuix/themes/nora';
import { definePreset } from '@primeuix/themes';

export const AssiemePreset = definePreset(Nora, {
  primitive: {
    borderRadius: { none: '0', xs: '0', sm: '0', md: '0', lg: '0', xl: '0' },
    assieme: {           // la palette del sito, invariata
      ink: '#14181d', page: '#f4f5f7', accent: '#2f4b7c',
      accentSoft: '#e7edf7', line: '#dde0e5',
      neg: '#a63d2f', pos: '#2e6b4f',
    },
  },
  semantic: {
    primary: { color: '{assieme.accent}', contrastColor: '#ffffff' },
    // …superfici, testo, bordi, stati
  },
});
```

Registrato una volta sola in `app.config.ts`:

```ts
providePrimeNG({ theme: { preset: AssiemePreset, options: { darkModeSelector: false } } })
```

Tre note che valgono in tutte le schermate:

- **Raggio di bordo a zero.** Non è un vezzo: nel design originale nessun elemento è arrotondato, ed è metà del carattere del prodotto. Va imposto a livello primitivo, altrimenti riemerge componente per componente.
- **Tipografia.** Newsreader per i titoli, DM Mono per etichette e citazioni, sans di sistema per il corpo. I `woff2` esistono già in `website/dist/fonts/`, si copiano in `public/fonts/`.
- **Densità.** Il sito è un documento da leggere, ASSIEME è uno strumento da usare otto ore al giorno: spaziature più compatte e testo di corpo a 14px, contro i 16 del sito.

### ⚠️ PrimeNG 22 non è più open source

Da questa versione PrimeTek ha spostato PrimeNG, PrimeReact e PrimeVue sotto
licenza commerciale **PrimeUI**; il repository è stato archiviato il
29/06/2026. Le versioni MIT precedenti restano MIT, ma la 21 richiede Angular
≤ 21: tornare indietro costerebbe anche `httpResource` e Signal Forms.

Senza chiave valida la libreria inietta un banner rosso *"Invalid PrimeUI
License"* in basso a destra, visibile anche in sviluppo, che la licenza vieta
di rimuovere.

- **Community**: gratuita se l'organizzazione sta sotto *tutte* le soglie —
  fatturato < 1 M USD, < 5 sviluppatori, < 10 dipendenti, < 3 M USD di
  capitale esterno. Validità 12 mesi, rinnovo gratuito.
- **Commerciale**: 599 USD per sviluppatore fino al 31/12/2026, poi 799.
  Perpetua sulle versioni coperte, un anno di aggiornamenti, componenti PRO
  inclusi.

**Stato: chiave Community attiva dal 04/08/2026, scade il 04/08/2027.**
Verificata con il verificatore di PrimeUI: `valid: true, status: active`.

Il punto da mettere nel piano economico, non da scoprire dopo: ASSIEME è un
SaaS a ~279 €/mese per tenant. Superato il milione di fatturato la Community
non è più utilizzabile e servirà la licenza commerciale — cifra irrilevante a
quel punto, ma va prevista.

### Cosa costruiamo comunque a mano

PrimeNG copre form, overlay, menu, notifiche, upload, calendario. Restano nostri i componenti che sono il prodotto e che nessuna libreria ha:

- **chip di citazione** (documento + posizione, apre il visualizzatore sul passaggio)
- **selettore `@` di referenziazione documentale**
- **bolla di messaggio in streaming**
- **badge di stato** (elaborazione documento, esecuzione agente)
- **indicatore di provenienza** (regola / documento di riferimento / ricordo — §7)

Vivono in `shared/ui`, costruiti sopra le primitive PrimeNG e CDK dove serve.

---

## 4. Tabelle: AG Grid 36

> **Superato (08/2026):** su indicazione del committente AG Grid è stato
> rimosso; con l'uscita di PrimeNG anche `p-table`. Gli elenchi usano la
> **tabella del design system** (`.ui-tabella` in `styles/_ui.scss`, HTML
> semantico); la tabella di analisi (Fase 4) andrà costruita lì sopra. Le
> avvertenze sulle licenze decadono.

Usiamo AG Grid per la **tabella di analisi** (RF-C-11…C-14) e per gli elenchi documentali densi.

### Tema via Theming API, non CSS

Da v33 i file CSS dei temi sono deprecati: il tema si definisce in codice e la griglia inietta il proprio CSS.

```ts
export const assiemeGridTheme = themeQuartz.withParams({
  accentColor: '#2f4b7c',
  borderColor: '#dde0e5',
  borderRadius: 0,
  wrapperBorderRadius: 0,
  headerFontFamily: "'DM Mono', monospace",
  headerTextColor: '#78818e',
  fontSize: 14,
  rowHoverColor: '#f5f8fc',
});
```

### Registrazione modulare, non `AllCommunityModule`

Da v33 i moduli vanno registrati esplicitamente. Registriamo **solo quelli usati**: importare tutto trascina nel bundle funzionalità che non tocchiamo mai.

### Tre avvertenze concrete

1. **AG Grid resta fuori dal bundle iniziale.** La funzionalità `tabelle/` è in lazy loading e AG Grid si importa solo lì. Il budget di Angular 22 è 500 kB di avviso / 1 MB di errore sul bundle iniziale: con AG Grid dentro si sfonda.
2. **La cella non è un valore, è un valore + una citazione + un possibile "non presente".** Serve un *cell renderer* nostro da subito (RF-C-12). Non è una decorazione: è il requisito di verificabilità che regge il prodotto.
3. **La tabella si popola progressivamente.** La generazione è lenta, cella per cella. Va progettata come tale dall'inizio — griglia già in pagina con celle in attesa, non spinner finché non è tutto pronto.

### ⚠️ L'esportazione XLSX è a pagamento

**Verificato sulla documentazione AG Grid: l'esportazione Excel è funzionalità Enterprise.** Community esporta solo CSV. Enterprise parte da **999 USD per sviluppatore**, licenza perpetua con un anno di aggiornamenti.

Riguarda RF-C-14, che chiede l'esportazione delle tabelle in XLSX. **Non serve comprarla**, e non per risparmiare: RF-C-14 rimanda a RF-D-10, cioè l'esportazione **applicando un template grafico dell'agenzia**. Un XLSX brandizzato su template non lo produce un pulsante della griglia: lo produce il backend. AG Grid Enterprise risolverebbe un problema che nel prodotto reale non è suo.

**Proposta: AG Grid Community, esportazione XLSX lato backend su template.** Nella fase mock il pulsante chiama l'endpoint e scarica un file preconfezionato.

Altre funzionalità Enterprise a cui rinunciamo: raggruppamento di righe, pivot, master/detail, menu di colonna, filtro a insieme. **Da verificare in Fase 4**: se la tabella di analisi ne richiedesse una davvero, la licenza torna in discussione — ma con un motivo di prodotto, non per un dettaglio di implementazione.

---

## 5. Icone: Hugeicons

`@hugeicons/angular` espone un componente a cui si passa l'icona importata da `@hugeicons/core-free-icons`: le icone sono dati, quindi entra nel bundle solo ciò che si usa.

Le incapsuliamo in un componente nostro, così che dimensioni e colori restino coerenti e la libreria sia sostituibile in un punto solo:

```html
<ui-icon name="fileAttachment" size="18" />
```

### Un solo set

Con l'uscita di PrimeNG e AG Grid (v0.4) è decaduta anche la vecchia regola
di convivenza fra tre set di icone: **Hugeicons è l'unico set
dell'applicazione**, sempre attraverso `ui-icon` e il registro dei nomi di
dominio. I componenti del design system che hanno bisogno di un segno lo
prendono da lì o lo disegnano in CSS (la spunta della checkbox è un
`clip-path`, non un'icona caricata).

Il set free ha coperto finora tutto il necessario; se un'icona mancasse, la
scelta fra catalogo Pro e SVG proprio si fa caso per caso.

---

## 6. Mock: Mockoon

### L'architettura

```
Componente
   ↓
DocumentiApiService            ← codice definitivo (HttpClient / httpResource)
   ↓ GET /api/documenti?ramo=auto
proxy del dev server Angular   ← proxy.conf.json
   ↓ http://localhost:3000
Mockoon CLI                    ← mocks/assieme.json + mocks/data/*.json
```

Il front-end fa richieste HTTP vere a un server vero. Nessun interceptor, nessun ramo `if (mock)` nel codice, nessuna implementazione doppia dei servizi. **Il codice che gira in sviluppo è, riga per riga, quello che andrà in produzione.**

```json
// proxy.conf.json
{ "/api": { "target": "http://localhost:3000", "secure": false } }
```

```json
// package.json
"scripts": {
  "mock": "mockoon-cli start --data ./mocks/assieme.json --port 3000",
  "dev":  "concurrently \"npm:mock\" \"ng serve\""
}
```

### Perché è la scelta giusta qui, al di là della richiesta

- **Il contratto diventa eseguibile.** L'ambiente Mockoon è un file JSON versionato: il backend lo apre e vede rotte, parametri, forme di risposta e codici di errore attesi. Vale più di qualsiasi documento di specifica, perché non può divergere dal FE senza che il FE si rompa.
- **Il mock non serve solo al FE.** Demo commerciali senza dipendere dall'ambiente di sviluppo, test end-to-end deterministici, onboarding di un nuovo sviluppatore con `npm run dev` e basta.
- **La transizione al backend vero è graduale, non un salto.** Mockoon ha una **modalità proxy**: le richieste che non trovano una rotta definita vengono inoltrate a un server reale. Si punta il proxy al backend e si cancellano dall'ambiente mock le rotte man mano che vengono implementate. Si passa endpoint per endpoint, con l'applicazione sempre funzionante. È il modo meno doloroso che conosca di fare questo passaggio.
- **Persistenza di sessione vera.** Con *data bucket* e *rotte CRUD*, una conversazione creata resta, un documento caricato compare in elenco. La demo si comporta come un'applicazione, non come una sequenza di schermate finte.

### I due limiti reali, verificati

**1. Mockoon non supporta SSE.** La richiesta è aperta sul repository (issue #990) ed è classificata come miglioria a bassa priorità. Serve per lo streaming della risposta in chat, che RNF-04 chiede esplicitamente.

Tre strade:

| | Come | Valutazione |
|---|---|---|
| A | **Piccolo stub Node SSE** (~40 righe) accanto a Mockoon, solo per l'endpoint di streaming | **Consigliata.** Il trasporto resta identico a quello che userà il backend (SSE è lo standard di fatto per lo streaming dei modelli). Il codice FE dello streaming è quello vero. |
| B | **WebSocket Mockoon** (supportati da v9) | Funziona subito, ma se il backend userà SSE il codice FE dello streaming andrà riscritto — proprio la parte più delicata della chat. |
| C | Simulare a blocchi lato client | Da evitare: la parte più rischiosa dell'applicazione resterebbe non esercitata fino all'arrivo del backend. |

**Decisione che serve da voi: il backend userà SSE o WebSocket per lo streaming della chat?** Se SSE — l'ipotesi più probabile — la strada A è quasi obbligata, e costa mezza giornata.

> **Risolto in Fase 3:** strada A. Lo streaming vive in `mocks/chat.mjs`
> come risposta SSE del `POST /api/conversazioni/:id/messaggi`; il contratto
> è `EventoStream` in `core/models/conversazione.ts`.

**2. Mockoon non fa la vera elaborazione asincrona.** RF-B-05 chiede che un documento caricato transiti fra *in coda → pronto → errore*. Si simula con regole di risposta a rotazione o con un contatore in data bucket: il polling successivo restituisce lo stato avanzato. Funziona, ma va progettato invece che dato per scontato.

### I JSON che genero io

Sotto `mocks/data/`, referenziati dalle rotte dell'ambiente:

| File | Contenuto |
|---|---|
| `compagnie.json`, `rami.json` | tassonomia di navigazione (RF-A-03) |
| `documenti-pubblici.json` | ~50 documenti su 8–10 compagnie, con metadati RF-A-02 completi ed edizioni multiple (RF-A-04) |
| `documenti-privati.json` | preventivi, polizze, appendici e corrispondenza del tenant |
| `conversazioni.json`, `messaggi.json` | conversazioni con documenti referenziati, citazioni, casi di non-copertura (RF-C-08) |
| `tabelle.json` | tabelle di analisi complete di citazione per cella e caselle "non presente" |
| `agenti.json`, `esecuzioni.json` | agenti con pianificazione e storico, incluse esecuzioni fallite |
| `istruzioni.json` | istruzioni personalizzate per ambito, incluso il caso infortuni del conducente citato nell'analisi |
| `ricordi.json` | memoria di tenant e personale, con origine |
| `template.json`, `utenti.json`, `tenant.json` | |

**Le fixture devono essere vere.** L'analisi indica già il caso pilota (§5.3): **Cattolica/Generali "Active Veicoli AUTOPIÙ con Telematica" contro un preventivo Unipol sullo stesso veicolo**. Si parte da lì: nomi di garanzie veri, massimali veri, citazioni con articolo e pagina.

Dati finti generici producono interfacce che sembrano funzionare e cedono al primo documento reale — colonne che non ci stanno, nomi di garanzie che vanno a capo tre volte. È il modo classico di scoprirlo troppo tardi.

**Serve da voi: i PDF reali del caso pilota.** È la richiesta più urgente di tutto il piano.

### Latenza ed errori

Latenza globale di 300–800 ms configurata nell'ambiente: senza, si progettano schermate che sembrano istantanee e collassano sul backend vero. Per ogni famiglia di rotte, una risposta di errore attivabile con una regola (header o parametro): 500, 403, quota superata (RF-B-08, RF-E-09). Un pannello di sviluppo in un angolo dell'applicazione permette di attivarli e di cambiare ruolo utente senza ricompilare.

---

## 7. Contratto dati

I modelli in `core/models/` e le rotte Mockoon **sono** la specifica per il backend. Vanno scritti presto e con cura; ogni modifica successiva è una modifica di contratto.

| Entità | Note dai requisiti |
|---|---|
| `Documento` | discriminato pubblico/privato; metadati RF-A-02; stato di elaborazione RF-B-05 |
| `EdizioneDocumento` | versionamento e validità (RF-A-04) |
| `Conversazione`, `Messaggio` | persistenti e rinominabili (RF-C-01); contesto documentale attivo (RF-C-03) |
| `Citazione` | documento + posizione. **Da fissare per primo:** attraversa chat, tabelle, agenti ed esportazioni |
| `TabellaAnalisi`, `CellaTabella` | valore + citazione + "non presente" (RF-C-12) |
| `Agente`, `EsecuzioneAgente` | definizione, pianificazione, storico con stato e log (RF-E-02/04/06) |
| `IstruzionePersonalizzata` | ambito, attivazione singola (RF-D-06) |
| `Ricordo` | livello tenant/utente, origine, modificabile (RF-G-02/03) |
| `TemplateOutput` | formato, segnaposto (RF-D-10/11) |
| `Utente`, `Tenant`, `Ruolo` | |

Due scelte trasversali da fare subito, perché toccano ogni schermata:

- **Come si rappresenta l'incertezza.** RF-C-08 e RF-C-12 impongono che il sistema dichiari quando un dato non è supportato dai documenti. Non è un caso d'errore: è un valore di prima classe nel modello, con un suo trattamento grafico ovunque compaia.
- **Come si rappresenta la provenienza.** RF-D-05 (risposta influenzata da una regola), RF-D-15 (attinge a un documento di riferimento), RF-G-03 (fondata su un ricordo). Tre segnali diversi che l'interfaccia deve mostrare senza diventare rumorosa: vanno progettati insieme, una volta sola. Il modello li codifica già dalla Fase 0 — `Provenienza` ha esattamente questi tre tipi.

---

## 8. Struttura del progetto

```
assieme/
├── fe-angular/
│   ├── proxy.conf.json
│   ├── public/fonts/        # TWK Ghost + Geist, self-ospitati
│   └── src/
│       ├── app/
│       │   ├── core/
│       │   │   ├── api/          # un servizio per dominio — il contratto verso il BE
│       │   │   ├── models/       # interfacce = specifica per il BE
│       │   │   ├── auth/         # sessione e ruolo (finti in questa fase)
│       │   │   ├── chat/         # storico conversazioni (condiviso con la barra laterale)
│       │   │   ├── notifiche/    # store delle notifiche a schermo
│       │   │   └── interceptors/ # errori, pannello di sviluppo
│       │   ├── shared/
│       │   │   ├── ui/           # il design system: bottone, campo, select,
│       │   │   │                 # checkbox, briciole, paginazione, tag, badge,
│       │   │   │                 # suggerimento, cassetto, menu-azioni, notifiche,
│       │   │   │                 # icona, chip-citazione, selettore-documenti,
│       │   │   │                 # visualizzatore-pdf, stato-vuoto, scheletro
│       │   │   ├── caricamento/  # zona e coda di caricamento
│       │   │   ├── griglia/      # celle condivise delle tabelle
│       │   │   └── testi/        # etichette, misure, resa markdown minimo
│       │   ├── layout/           # shell, barra laterale, barra superiore
│       │   └── features/         # una cartella per modulo, in lazy loading
│       │       ├── chat/
│       │       ├── archivio-pubblico/
│       │       ├── archivio-privato/
│       │       ├── tabelle/       # Fase 4, su .ui-tabella
│       │       ├── agenti/
│       │       └── impostazioni/
│       └── styles/
│           ├── _tokens.scss     # primitivi (neutri caldi) + semantici per intento
│           ├── _ui.scss         # le classi del design system
│           ├── _fonts.scss      # @font-face di Ghost e Geist
│           └── styles.scss
├── mocks/
│   ├── assieme.json         # ambiente Mockoon (versionato)
│   ├── data/*.json          # fixture
│   ├── api-stub.mjs         # endpoint con logica (ricerca, paginazione)
│   ├── archivio-privato.mjs # macchina a stati dell'elaborazione
│   ├── chat.mjs             # conversazioni, streaming SSE, esportazione
│   ├── pdf.mjs              # PDF generati per visualizzatore ed export
│   └── ufficio.mjs          # DOCX/XLSX minimi per l'esportazione
└── tools/
    ├── serve-demo.mjs       # demo self-contained su 8080
    └── tunnel.mjs           # quick tunnel Cloudflare per la demo
```

`mocks/` sta **fuori** da `fe-angular/`: non è codice front-end, è il contratto condiviso col backend. Lì lo troverà chi lo cerca.

Regola: **`features/` non importa mai da un altro `features/`**. Ciò che serve a due funzionalità sale in `shared/` o `core/`. È l'unica regola che tiene navigabile un'applicazione di questa dimensione a sei mesi di distanza.

---

## 9. Mappa delle rotte

```
/chat                          nuova conversazione (lo storico sta nella barra laterale)
/chat/:id                      conversazione
/archivio/pubblico             navigazione compagnia / ramo / prodotto (RF-A-03)
/archivio/pubblico/:id         scheda documento + visualizzatore
/archivio/privato              documenti del tenant
/archivio/privato/:id          scheda documento
/tabelle                       tabelle di analisi salvate
/tabelle/:id                   tabella
/agenti                        elenco agenti
/agenti/:id                    definizione + storico esecuzioni
/agenti/:id/esecuzioni/:runId  esito di una esecuzione
/memoria                       pannello memoria (RF-G-03)
/impostazioni/modello          provider e modello AI (RF-D-02)
/impostazioni/istruzioni       istruzioni personalizzate (RF-D-04)
/impostazioni/template         libreria template di output (RF-D-10)
/impostazioni/mcp              credenziali e connessioni MCP (RF-F-02/04)
/impostazioni/utenti           gestione utenti del tenant (solo amministratore)
```

Percorsi in italiano, coerenti col prodotto. Tutto in lazy loading.

Ho messo **`/memoria` al primo livello** anziché sotto Impostazioni: RF-G-03 la descrive come pannello dedicato e nell'analisi è uno dei tre pilastri del DNA d'Agenzia — sepolta nelle impostazioni si vede poco. È una scelta di prodotto, non tecnica: ditemi se preferite diversamente.

---

## 10. Roadmap

Stime indicative per **uno sviluppatore FE a tempo pieno**, comprensive di fixture, stati di caricamento/vuoto/errore e verifica responsive. Da ricalibrare dopo la Fase 0, che dà la misura reale del ritmo.

### Fase 0 — Fondamenta · ~6 giorni

Nessun requisito funzionale, ma tutto il resto poggia qui.

- Configurazione: PrimeNG + CDK + AG Grid + Hugeicons, ESLint, environment, alias, `proxy.conf.json`, script `npm run dev`
- **Preset PrimeNG `assieme`** e **tema AG Grid**: la parte che determina se il prodotto sembrerà ASSIEME o sembrerà PrimeNG
- Token e tipografia dal sito; font Newsreader e DM Mono da `website/dist/fonts/`
- Componente `ui-icon` e verifica copertura del set Hugeicons free
- **Ambiente Mockoon** con le prime fixture e la latenza configurata
- Shell applicativa: barra laterale, barra superiore, navigazione, responsive
- Autenticazione finta con selettore di ruolo (operatore / amministratore)
- Pannello di sviluppo: ruolo, latenza, forzatura errori

### ✅ Fase 1 — Archivio Pubblico — **completata** · RF-A-01…A-05, A-07, A-09

Navigazione per compagnia/ramo/prodotto, ricerca per parola chiave insensibile agli accenti, filtro per tipologia, edizioni multiple con evidenza della corrente, preferiti, paginazione. Scheda documento con metadati completi, altre edizioni dello stesso prodotto e data di ultimo aggiornamento dell'archivio per compagnia.

Il visualizzatore PDF è nato come segnaposto ed è stato sostituito in Fase 3 da quello vero (pdf.js), che sa aprirsi sul passaggio citato (RF-C-05) — il motivo per cui non era stato costruito prima.

**Deviazione dal piano, da sapere:** l'endpoint dei documenti non sta in Mockoon ma in `mocks/api-stub.mjs`. L'helper `filter` di Mockoon fa solo uguaglianza esatta e non regge ricerca testuale, filtri opzionali e paginazione senza diventare un blob Handlebars dentro una stringa JSON. Lo stub onora gli stessi header di Mockoon, quindi il pannello di sviluppo funziona identico su tutte le rotte. La regola: **Mockoon per i dati fissi e le regole, stub per gli endpoint con logica.**

### Fase 2 — Archivio Privato · ~5 giorni · RF-B-01…B-05, B-07, B-09

**È la prima fase in cui l'utente scrive.** Finora leggeva soltanto, e questo cambia tre cose ovunque: compaiono le operazioni che possono fallire a metà, compare il tempo (un documento caricato non è subito utilizzabile), e i permessi iniziano a contare davvero.

Caricamento con trascinamento e multiplo, coda di elaborazione con transizioni di stato, etichette, form metadati con classificazione assistita, scheda documento modificabile, promozione a documento di riferimento (RF-B-09).

Tre punti delicati:

- **La coda.** Dopo aver lasciato dieci file l'utente non deve trovarsi davanti a una finestra modale che nasconde l'archivio: le righe compaiono in cima all'elenco con il loro stato, e si continua a lavorare mentre i file salgono.
- **L'interrogazione periodica** dello stato va solo finché esistono documenti non assestati, e si ferma da sola. Un polling che continua a vuoto è il difetto che nessuno nota finché non guarda il pannello di rete.
- **Le proposte di classificazione devono vedersi come provvisorie.** In ambito assicurativo una compagnia sbagliata su un documento è un problema vero, e un campo precompilato che sembra confermato è peggio di un campo vuoto.

Il caricamento e la coda si costruiscono in `shared/`, non dentro la funzionalità: la Fase 5 li riusa per i documenti di riferimento, e due implementazioni della stessa macchina divergono sempre.

È anche la fase giusta per il primo form con **Signal Forms**: abbastanza reale da essere un test vero, abbastanza contenuto da poter tornare indietro. Se convince si estende; se no, il resto va con i Reactive Forms.

### ✅ Fase 3 — Chat, referenziazione, citazioni — **completata** · RF-C-01…C-10

Chat con risposta in streaming SSE, storico e rinomina; selettore `@` su entrambi gli archivi con navigazione da tastiera e senza mai perdere il fuoco dal campo (costruito a mano, non su `p-autocomplete`: il pannello è passivo, digitazione e tasti restano al composer); contesto documentale persistente e rimovibile; citazioni con apertura del PDF sul passaggio evidenziato (pdf.js, caricato solo alla prima resa); trattamento grafico della non-copertura; esportazione su template con download vero e copia rapida. **Nessun limite di documenti per conversazione** in questa fase: il valore verrà dai test (punto aperto §6.4), e il contratto non lo prevede finché non c'è.

**Decisioni di contratto da sapere:**

- **Lo streaming è la risposta al `POST /api/conversazioni/:id/messaggi`** — un giro solo, come fanno i backend dei modelli. Nel FE passa da `HttpClient` col backend fetch (eventi di progresso con `partialText`), non da `EventSource`: lo stream attraversa gli stessi interceptor di tutte le altre chiamate, pannello di sviluppo compreso. Il framing SSE è interpretato in `core/api/sse.ts`, con test sui tagli fra pacchetti.
- **Il contesto della conversazione esce idratato** (`RiferimentoDocumento`: id, titolo, archivio): la barra del contesto non fa una chiamata per documento.
- **L'evento `inizio` porta anche `messaggioUtenteId`**: il client riconcilia la propria copia ottimistica e un ricaricamento a stream aperto non duplica nulla. Il messaggio dell'assistente si persiste solo a risposta completa: uno stream interrotto non lascia mezzi messaggi nello storico.
- **Il mock genera file veri.** PDF multi-pagina per il visualizzatore (`mocks/pdf.mjs`, scritti a mano: catalogo, xref, Helvetica non incorporata), DOCX/XLSX minimi ma apribili per l'esportazione (`mocks/ufficio.mjs`, zip in modalità store). Le risposte della chat sono **scenari deterministici** guidati dal testo della domanda (`mocks/chat.mjs`) — «grandine» produce la non-copertura, «franchig» la risposta breve con due citazioni, il resto il confronto del caso pilota.

### ✅ Fase 4 — Tabelle di analisi — **completata** · RF-C-11…C-15

Costruttore in due scelte (prima i documenti dai due archivi, poi i criteri — riusa il selettore `@` della chat), griglia sulla `.ui-tabella` del design system con la cella `ValoreEstratto` (valore + citazioni, «non presente», «non determinabile»), popolamento progressivo con celle in attesa che pulsano e avanzamento in testata, salvataggio, rinomina, aggiunta/rimozione di documenti e colonne a generazione anche in corso, esportazione su template via backend, condivisione nel tenant con apertura in sola lettura e «Duplica» per proseguire (RF-C-15).

**Decisioni di contratto da sapere:**

- **Il popolamento è polling, non streaming.** La tabella nasce con le celle `in-attesa` e il FE richiede `GET /api/tabelle/:id` a intervalli finché `stato === 'in-generazione'`; il polling si ferma da solo. È lo schema già collaudato dell'elaborazione documenti (RF-B-05): una cella al secondo non è una risposta di chat, e il contratto resta a una sola forma di risposta.
- **La cella porta la citazione completa**, non la `CitazioneBreve`: da ogni cella si apre il visualizzatore sul passaggio (RF-C-12 con RF-C-05), e per farlo servono pagina, articolo e riquadro. `ValoreEstratto` ha ora un secondo parametro generico per il tipo di citazione; la forma breve resta per elenchi ed esiti.
- **I criteri predefiniti sono un endpoint**, non una costante nel FE: `GET /api/tabelle/criteri?documenti=…` — il server risolve i rami dei documenti scelti e propone i set pertinenti (RF-C-11). Fixture in `mocks/data/criteri-tabella.json`.
- **RF-C-13 (interrogare la tabella in chat) è un ponte, non una chat nuova:** «Interroga in chat» crea una conversazione con gli stessi documenti nel contesto e ci naviga. La domanda si fa lì, con le citazioni di risposta.
- **Le mutazioni restituiscono la tabella aggiornata** e il FE la applica senza ricaricare; le etichette di riga escono già pronte dal server, come il contesto idratato della chat.
- **Il mock genera celle deterministiche** (`mocks/tabelle.mjs`): per i documenti del caso pilota gli stessi numeri e le stesse posizioni degli scenari della chat, per il resto valori stabili da un hash di documento + colonna. Il «non presente» compare con regole fisse — un DIP sintetico non elenca le esclusioni — perché l'interfaccia deve mostrarlo davvero.

La verifica prevista qui («serve qualche funzionalità Enterprise di AG Grid?») è decaduta con AG Grid: la `.ui-tabella` con prima colonna fissa ha coperto tutto il necessario.

### ✅ Fase 5 — Impostazioni e personalizzazione — **completata** · RF-D-01…D-16

Sezione con shell propria e navigazione secondaria: **Modello AI** (schede informative, adeguatezza documentale, nota costi, storico modifiche), **Istruzioni** con le due schede — Regole in linguaggio naturale con ambito e attivazione (RF-D-04/06), Documenti di riferimento con caricamento riusato dalla Fase 2 e fusione dei promossi dall'Archivio Privato (RF-D-14) — **Template di output** (anteprima PDF dell'impaginazione, predefinito per tipologia, template propri, identità visiva con logo), **Utenti** (invito, ruolo, sospensione — mai eliminazione). La riga di guida («se dice *come giudicare* è una regola; se va citato è un documento») sta in testa alle schede; il peso del contesto permanente (RF-D-16) sta sopra l'elenco, con l'interruttore attivo/sospeso come igiene ordinaria.

**Decisioni di contratto da sapere:**

- **I permessi sono applicati due volte.** Le voci e i controlli compaiono con `puo()`; il mock rifiuta comunque le scritture senza `X-Assieme-Ruolo: amministratore` (403) — il pannello di sviluppo mostra davvero l'interfaccia dell'operatore, e il server resta l'ultima linea. L'operatore **vede** modello, istruzioni e template in lettura: sapere cosa condiziona le risposte è trasparenza, non privilegio.
- **I documenti di riferimento sono un elenco unico con due origini.** I promossi dall'Archivio Privato si idratano dall'archivio a ogni lettura (titolo e peso restano veri); il governo — ambito, attivazione — vive nelle Istruzioni. `DELETE` su un promosso toglie il ruolo e il documento resta nell'archivio; su un caricato diretto lo elimina.
- **Lo storico (RF-D-07) è un endpoint solo**, `GET /api/impostazioni/storico?oggetti=…`: ogni schermata mostra le voci sue, il modello (`VoceStoricoImpostazioni`) è comune. Ogni mutazione del mock registra chi, cosa e quando.
- **L'anteprima dei template è sempre PDF** (`GET /api/template/:id/anteprima`), qualunque sia il formato di generazione: mostra impaginazione e segnaposto (RF-D-11), non il file. Il predefinito per tipologia (RF-D-13) è unico: assegnarlo lo toglie a chi lo portava.
- **Formati al lancio: PDF, DOCX, XLSX; PPTX rimandato** (punto aperto §6.11) — la tipologia di output però non dipende dal formato, quindi il contratto non cambierà.
- **Utenti: niente eliminazione, si sospende**; su sé stessi né ruolo né stato (409). L'invito nasce `invitato` e diventa attivo al primo accesso.
- Rimandati con motivo: **RF-D-09** (modalità di prova di una regola — priorità C, ha senso con l'AI vera) e la **revoca credenziali MCP** (Fase 7, con il Modulo F).

### Fase 6 — Agenti · ~7 giorni · RF-E-01…E-13

Elenco e stati, creazione guidata (istruzioni, fonti, output, template), pianificazione ricorrente, esecuzione manuale, storico con log ed esito, notifiche in applicazione, libreria di agenti predefiniti.

### Fase 7 — Memoria e MCP · ~4 giorni · RF-G-01…G-07, RF-F-02/F-04

Pannello memoria consultabile, modificabile e cancellabile; distinzione tenant vs. personale; indicatore "risposta fondata su un ricordo" in chat; registrazione esplicita di un ricordo.

Il **Modulo F ha superficie FE minima**: generazione e revoca credenziali, stato connessioni, istruzioni di configurazione. Il valore del modulo è tutto nel backend.

**Totale indicativo: ~52 giorni-uomo** (~11 settimane per una persona). La confluenza della knowledge base nelle Istruzioni sposta un giorno dalla Fase 2 alla Fase 5, non ne aggiunge.

---

## 11. Ordine di esecuzione — due opzioni

**Opzione A — sequenziale (0 → 1 → 2 → 3 → …)**
Rispetta le dipendenze naturali: la chat presuppone documenti da referenziare. Ma la prima demo che *mostra il prodotto* arriva dopo ~18 giorni, e fino a lì si costruisce senza riscontro d'uso.

**Opzione B — fetta verticale sul caso pilota, poi allargamento — consigliata**

1. Fase 0 completa (~6 gg)
2. **Fetta verticale** (~8 gg): archivio pubblico ridotto a un elenco filtrabile, upload semplificato, chat funzionante con referenziazione e citazioni **sui soli documenti del caso pilota**. In fondo: una demo vera del confronto Cattolica/Generali vs. Unipol.
3. Poi si allarga per fasi, col riscontro del pilota già in mano.

Il costo è qualche giorno di rilavorazione sulla fetta; il beneficio è scoprire alla terza settimana anziché alla decima se il selettore `@` e la resa delle citazioni funzionano per chi lavora davvero in agenzia. In un dominio dove la fiducia nella citazione *è* il prodotto, quel riscontro vale più di quei giorni.

---

## 12. Fatto significa fatto

Una schermata è completa quando ha tutti e cinque:

1. **Caricamento** — skeleton, non uno spinner al centro dello schermo
2. **Vuoto** — con indicazione di cosa fare, non una pagina bianca
3. **Errore** — messaggio comprensibile e possibilità di riprovare
4. **Accessibilità** — navigabile da tastiera, etichette corrette, contrasto verificato. RNF-06 parla di utenza non tecnica: qui l'accessibilità *è* usabilità
5. **Responsive** — verificata a 1280px (desktop di riferimento) e a 768px

Test unitari (Vitest) sulla logica non banale: costruzione del contesto documentale, stati della tabella, validazione dei form. Non inseguiamo la copertura percentuale.

---

## 13. Convenzioni

- Componenti standalone, `input()` / `output()` / `model()` a signal, mai `@Input`/`@Output`
- Controllo di flusso nativo `@if` / `@for` / `@switch`, mai `*ngIf` / `*ngFor`
- `inject()` invece dell'iniezione da costruttore
- Nessun `Observable` nei componenti: la conversione avviene nei servizi (`toSignal`)
- Zoneless: **ogni stato che l'interfaccia mostra è un signal**. È l'errore più facile in questa versione — un campo di classe normale non innesca il ridisegno
- PrimeNG importato per componente nel `imports` di ciascun componente, mai in blocco
- Testi in italiano nei template, senza `@angular/localize`. Una seconda lingua sarebbe un intervento importante: lo accetto consapevolmente, il mercato di prima release è italiano (Vincolo §5.1)
- Nomi in italiano per rotte e concetti di dominio (`Documento`, `Conversazione`, `Agente`), in inglese per i tecnicismi (`ApiService`, `interceptor`)

---

## 14. Cosa serve deciso — e cosa serve da voi

In ordine di urgenza. Diverse voci rimandano ai punti aperti §6 dell'analisi.

| # | Questione | Serve entro | Impatto se non deciso |
|---|---|---|---|
| 1 | **PDF reali del caso pilota** (Cattolica/Generali + preventivo Unipol) | Fase 0 | Fixture inventate → interfacce che cedono sui dati veri |
| 2 | **Streaming chat: SSE o WebSocket?** (§6) | Fase 0 | Determina se serve lo stub SSE. Sbagliare significa riscrivere la parte più delicata della chat |
| 3 | **Modello di ruoli e permessi** — l'analisi lo rimanda alle prossime revisioni, ma il FE deve mostrare o nascondere elementi già in Fase 0 | Fase 0 | Guard e visibilità da rifare in ogni schermata |
| 4 | **Memoria: primo livello o dentro Impostazioni?** (§9) | Fase 0 | Navigazione |
| 5 | **Visibilità per-utente nell'Archivio Privato** — serve in prima release o basta il livello tenant? (punto aperto §6.5) | Fase 2 | Cambia il modello dati dei documenti e l'interfaccia di condivisione |
| 6 | **Limite documenti per conversazione** (punto aperto §6.4, RF-C-07) | Fase 3 | RF-C-07 chiede che il limite sia *comunicato chiaramente*: serve saperlo per progettare il messaggio |
| 7 | **Documenti scansionati / OCR in prima release?** (punto aperto §6.6) | Fase 2 | Stati aggiuntivi nella coda di elaborazione |
| 8 | **Esportazione XLSX lato backend — confermato?** (§4) | Fase 4 | Se dovesse restare al FE, servirebbe AG Grid Enterprise (da 999 USD/sviluppatore) o una libreria terza |
| 8-bis | **Rinnovo licenza PrimeUI Community entro il 04/08/2027** (§3) | ricorrente | Alla scadenza compare un banner rosso in produzione. 30 giorni di tolleranza. Da mettere in calendario, non nella memoria di qualcuno |
| 9 | **Formati template al lancio** (punto aperto §6.11) | Fase 5 | La scelta del template ha interfacce diverse per formato |
| 10 | **Canali di notifica agenti** — solo in-app o anche email? (punto aperto §6.10) | Fase 6 | Preferenze di notifica nelle impostazioni |

Sul punto 3: il modello dei ruoli è dato per rimandato nell'analisi, ma il front-end non può aspettarlo. Se non arriva in tempo procedo con l'assunzione minima — **due ruoli, operatore e amministratore di tenant, con l'amministratore che ha i permessi dell'operatore più la gestione di utenti, istruzioni e template** — e la segnalo come debito da rivedere.

---

## 15. Passo successivo

Se il piano regge, parto dalla **Fase 0**: dipendenze, preset PrimeNG, tema AG Grid, `ui-icon`, ambiente Mockoon con le prime fixture, shell applicativa. È la fase che non produce nulla di visibile al cliente e determina la velocità di tutte le altre.

Le due cose che mi servono da voi prima di arrivare a metà Fase 0 sono la **#1** (i PDF del caso pilota) e la **#2** (SSE o WebSocket).
