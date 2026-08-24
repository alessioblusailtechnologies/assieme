# VELIA — Piano di sviluppo Back-end

| Campo | Valore |
|---|---|
| Documento | Piano di sviluppo BE |
| Versione | 0.1 (bozza) |
| Data | 07/08/2026 |
| Riferimenti | `VELIA-analisi-requisiti.md` v0.9 · `VELIA-motore-agentico.md` v0.1 · `VELIA-piano-sviluppo-fe.md` v0.4 |
| Stack | Node.js · Supabase (Postgres, Auth, Storage, Queues) |
| Progetto | `be-node/` (nuova cartella, stesso repository) |

---

## 1. Obiettivo e criterio di uscita

Costruire il backend che **sostituisce il server mock endpoint per endpoint**, senza che il front-end cambi una riga di codice applicativo.

Il contratto esiste già, in tre forme che devono restare la fonte di verità:

1. **le interfacce TypeScript** in `fe-angular/src/app/core/models/` — la forma dei dati;
2. **i servizi** in `fe-angular/src/app/core/api/` — rotte, verbi, codici di errore attesi;
3. **il mock eseguibile** (`mocks/velia.json` + `mocks/*.mjs`) — il comportamento: idratazione dei riferimenti, macchine a stati, framing SSE, file generati.

Il backend non progetta un'API nuova: **onora questa**. Ogni deviazione necessaria è una modifica di contratto, va discussa e riportata nei modelli FE e nei mock, mai introdotta di nascosto.

**Criterio di uscita per ogni fase:** il proxy Mockoon in modalità inoltro punta al backend, le rotte implementate vengono tolte dal mock, e l'applicazione FE funziona identica a prima — questa è la transizione graduale già prevista dal piano FE (§6): si passa endpoint per endpoint, con l'applicazione sempre in piedi.

**Prerequisito dichiarato:** il motore agentico va validato **prima** di costruirci attorno l'idraulica (`VELIA-motore-agentico.md` §8, `esperimento-motore/`). Le misure già raccolte (06/08/2026: 0,43–0,99 USD e 94–128 s per domanda puntuale su percorso agentico) alimentano le decisioni su modello, budget per query e percorsi rapidi futuri.

---

## 2. Stack

| Elemento | Scelta | Nota |
|---|---|---|
| Runtime | Node.js 24 LTS | stessa versione del FE |
| Linguaggio | TypeScript, `strict` | i modelli di `core/models` si portano qui come tipi condivisi del contratto |
| Framework HTTP | **Fastify** | leggero, schema-first, streaming di risposta senza attriti (serve per SSE) |
| Validazione | **Zod** | ogni corpo in ingresso e **ogni output del modello** prima della persistenza (il worker è l'unico scrivano) |
| Database | **Supabase Postgres** | migrazioni SQL versionate con la **Supabase CLI** (`supabase/migrations/`), tipi generati con `supabase gen types typescript` |
| Autenticazione | **Supabase Auth** | inviti, sessioni, JWT; `tenant_id` e `ruolo` in `app_metadata` |
| File | **Supabase Storage** | PDF originali e Markdown convertiti; il layout dei path replica l'albero del motore (§4.2) |
| Coda | **Supabase Queues (pgmq)** | job persistiti nel database: niente infrastruttura in più, semantica at-least-once |
| Pianificazione | **pg_cron** | esecuzioni ricorrenti degli agenti (RF-E-04) |
| Motore AI | **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) | il worker; API key dedicata in variabile d'ambiente, mai abbonamenti personali (`chat-analisi.txt`) |
| Log | pino | log strutturati; l'audit di compliance però sta nel database, non nei log (§5) |
| Test | Vitest | stessa scelta del FE |

Versioni puntuali delle librerie: da fissare in Fase 0 con `npm outdated` alla mano, non qui — questo documento invecchia meno delle dipendenze.

Due regole trasversali, prese pari pari dai documenti di architettura:

- **Il modello non scrive mai.** Nessun tool di scrittura DB o filesystem nell'ambiente dell'SDK; il worker valida l'output contro schema Zod e persiste lui. Solo ciò che passa la validazione diventa risposta.
- **RLS sempre attiva.** L'API server parla a Postgres **con il JWT dell'utente** (le policy RLS filtrano per tenant); solo il worker e i job di sistema usano la service role key. L'isolamento del tenant è così applicato due volte: dalle policy sul database e fisicamente dalla working directory del job (§4.3).

---

## 3. Architettura

```
FE Angular ──HTTP──▶ API server (Fastify)
                        │  CRUD sincroni: legge/scrive Postgres via RLS
                        │  operazioni AI: accoda un job (pgmq) e...
                        │    ...chat: tiene aperta la risposta SSE,
                        │       inoltra gli eventi del job man mano
                        ▼
                     Postgres (Supabase) ◀──── pg_cron (agenti pianificati)
                        ▲         │ LISTEN/NOTIFY (eventi job → API)
                        │         ▼
                     Worker (Node + Agent SDK)
                        │  pesca i job, materializza la workspace,
                        │  lancia la sessione (Grep/Glob/Read soltanto),
                        │  valida l'output, persiste, emette eventi
                        ▼
                     Storage (Supabase) ⇄ cache locale su disco
                     [pdf originali + md con ancore + INDICE.md]
```

Due processi, un repository:

```
be-node/
├── src/
│   ├── api/            # Fastify: rotte per dominio, speculari a fe-angular/core/api
│   │   ├── documenti/  archivio-privato/  conversazioni/  tabelle/
│   │   ├── agenti/     impostazioni/      memoria/        mcp/
│   │   └── plugins/    # auth (JWT Supabase), errori, limiti di piano, sse
│   ├── worker/         # consumer pgmq: un modulo per tipo di job
│   │   ├── ingestion/  # pipeline PDF → md (§4.2)
│   │   ├── interrogazione/  # chat e tabelle: sessione Agent SDK (§4.3)
│   │   ├── agenti/     # esecuzioni manuali e pianificate
│   │   └── memoria/    # estrazione a fine conversazione
│   ├── motore/         # astrazione provider (RF-D-02): interfaccia + impl. Anthropic
│   ├── generazione/    # documenti su template: PDF, DOCX, XLSX (Fase 4)
│   ├── contratto/      # tipi e schemi Zod condivisi API/worker (specchio di core/models)
│   └── db/             # client, query, tipi generati
├── supabase/
│   ├── migrations/     # la verità sullo schema
│   └── seed.sql        # fixture di sviluppo (dalle fixture dei mock)
└── mcp/                # server MCP (Fase 9)
```

In sviluppo i due processi girano insieme (`npm run dev` avvia entrambi + `supabase start` per l'ambiente locale); in produzione si separano quando serve. La comunicazione passa **solo dal database** (coda + LISTEN/NOTIFY): nessuna porta tra i processi, e il worker fa solo connessioni in uscita — il vincolo di deployment già fissato in `chat-analisi.txt`.

### 3.1 Il ponte SSE, la parte da progettare meglio

Il contratto FE è fisso e non negoziabile (Fase 3 FE): **lo streaming è la risposta al `POST /api/conversazioni/:id/messaggi`**, framing SSE interpretato da `core/api/sse.ts`, eventi `EventoStream` (`core/models/conversazione.ts` è la specifica dei tipi di evento; l'evento `inizio` porta `messaggioUtenteId` per la riconciliazione ottimistica; il messaggio dell'assistente si persiste **solo a risposta completa**).

Flusso: l'API riceve il POST → persiste il messaggio utente → accoda il job → apre la risposta SSE ed emette `inizio` → si mette in ascolto (`LISTEN`) sul canale del job → il worker, a ogni passo della sessione, `NOTIFY` con l'evento (attività di ricerca, testo parziale, citazioni…) → l'API lo inoltra nel flusso → a job concluso emette l'evento finale e chiude.

Conseguenze da non perdere:

- **La disconnessione non uccide il job.** Se il client chiude (o cade la rete), il worker finisce comunque e persiste: alla riapertura della conversazione la risposta c'è. È il motivo per cui il pattern a coda esiste.
- **L'annullamento esplicito sì.** Il FE interrompe la richiesta HTTP per «ferma la risposta»: l'API deve distinguere l'abort del client dalla caduta di rete (l'abort arriva prima che il flusso sia esaurito e con la richiesta annullata) e in quel caso segnare il job `annullato`; il worker controlla il flag tra un turno e l'altro della sessione e si ferma. Da progettare in Fase 3, con test.
- **Il payload di NOTIFY ha un limite (8000 byte):** gli eventi grandi si scrivono in una tabella `eventi_job` e il NOTIFY porta solo il puntatore. La tabella è anche il replay per l'audit.

### 3.2 Autenticazione: cosa sostituisce cosa

Nel mock la sessione è finta e il ruolo viaggia in `X-Velia-Ruolo`. Nel backend:

- login e sessione con Supabase Auth (email/password; l'invito nasce `invitato` e diventa attivo al primo accesso — contratto Fase 5 FE);
- il JWT porta `tenant_id` e `ruolo` (`operatore` | `amministratore`) in `app_metadata` — mai modificabili dall'utente;
- le rotte da amministratore rifiutano con **403** esattamente dove il mock già lo fa (impostazioni in scrittura, utenti, MCP, documenti di riferimento);
- su sé stessi né ruolo né stato (**409**, contratto Fase 5);
- il **Gestore piattaforma** (RF-A-06) è un ruolo di piattaforma fuori dai tenant, usato solo dal back-office (Fase 1).

L'interceptor FE che oggi aggiunge l'header di sviluppo diventerà l'interceptor che allega il token: è l'unico ritocco FE previsto da tutto questo piano, ed era già messo in conto (`conversazioni-api.ts`: «domani l'autenticazione vera lo firmerà senza codice dedicato»).

---

## 4. I documenti vivono in due mondi

È la decisione architetturale centrale, e discende da `VELIA-motore-agentico.md`: **il filesystem È l'indice**. Postgres cataloga, Storage conserva, ma il motore naviga un albero di file Markdown.

### 4.1 Chi è la verità su cosa

| Mondo | Contiene | È la verità su |
|---|---|---|
| **Postgres** | metadati, stati, relazioni, contesto conversazioni | navigazione, ricerca UI, permessi, versionamento (RF-A-04) |
| **Storage** | PDF originale + `.md` convertito + `INDICE.md`, path speculari all'albero §3.2 del doc motore | il contenuto dei documenti |
| **Disco del worker** | cache materializzata dallo Storage | niente: è ricostruibile sempre, si invalida per etag |

Il PDF resta l'artefatto che l'utente vede e scarica (`GET /api/documenti/:id/file` e simili servono dallo Storage con URL firmati o proxy); il `.md` è la rappresentazione di lavoro del motore. Due facce dello stesso documento, collegate dalla riga di catalogo.

### 4.2 Pipeline di ingestion (job `ingestion`)

All'upload nell'Archivio Privato, all'allegato di conversazione, e al caricamento da back-office per il Pubblico — una pipeline sola, tre ingressi:

1. **Acquisizione** — PDF nello Storage, riga di catalogo in stato `in-coda` (il FE fa già polling su questi stati: contratto RF-B-05, macchina a stati in `mocks/archivio-privato.mjs`);
2. **Conversione** — PDF → Markdown con ancore `[pag. N]`, eseguita da un **modello economico (Haiku)**: è l'unica chiamata API che contiene i byte di un documento. Scansioni senza testo → stato `errore` con motivo leggibile (RF-B-06 prima release, punto aperto §6.6);
3. **Classificazione** — tipologia, compagnia, ramo, prodotto, edizione proposte dal modello, confermabili dall'utente (RF-B-03): si salvano come *proposta*, il FE le mostra già come provvisorie;
4. **Collocazione** — il `.md` va al suo posto nell'albero dello Storage, gli `INDICE.md` coinvolti (prodotto, compagnia, radice) si rigenerano; gli allegati di conversazione vanno sotto `tenant/<tid>/conversazioni/<id>/allegati/`, **fuori dagli archivi** (contratto Fase 3 FE);
5. **Pronto** — stato `pronto`, il documento è referenziabile.

La qualità del sistema si gioca qui, non nel prompt di query: quando una risposta è scadente la prima domanda è «il documento era convertito bene?». Il prompt di conversione e la verifica di fedeltà a campione si progettano con i PDF del pilota (decisione aperta n. 2 del doc motore).

### 4.3 Il job di interrogazione (chat, tabelle, agenti — un motore solo)

1. Il worker **materializza la workspace**: una directory temporanea per job con dentro *soltanto* l'archivio del tenant e l'Archivio Pubblico in sola lettura (link/copie dalla cache locale). L'isolamento è fisico: ciò che non c'è non si può leggere.
2. Sessione Agent SDK: tool **`Grep`, `Glob`, `Read` e nient'altro**; prompt di sistema = regole del mestiere (obbligo di citazione, dichiarazione di non-copertura — RF-D-08: inderogabili) + **DNA d'Agenzia** del tenant (regole scritte attive e pertinenti per ambito, ricordi attivi, documenti di riferimento pertinenti come path nella workspace); prompt utente = domanda + path dei documenti nel contesto della conversazione.
3. Ogni passo emette un evento verso il FE (§3.1): l'utente vede il lavoro, non uno spinner.
4. A fine sessione il worker valida con Zod: la risposta c'è? le citazioni puntano a documenti reali del contesto, con pagina? Se no: errore e retry. Poi persiste messaggio, citazioni, provenienza (regola / documento di riferimento / ricordo — il modello dichiara nel formato di output quali ha usato), consumi.
5. **Multi-turno:** ogni messaggio è un job nuovo; il contesto si ricostruisce dal database (storia + path correnti) con il **prompt caching** a rendere economico il colpo successivo sulla stessa pratica. Worker senza stato: qualunque worker può prendere qualunque job. (Alternativa — riprendere la sessione SDK — scartata per ora: lega il job al worker; da rivalutare coi numeri.)
6. **Budget per job:** tetto di turni e token (decisione aperta n. 4 del doc motore); al raggiungimento il worker chiude con risposta parziale dichiarata o errore, mai silenziosamente.
7. L'**extended thinking** si attiva solo qui, mai sui futuri percorsi rapidi; l'MVP è a motore unico, il router coi percorsi rapidi viene dopo, sui numeri reali (doc motore §7).

Confinamento OS del worker (container/utente dedicato per job): seconda cinta di mura, da decidere col deployment (decisione aperta n. 3) — la prima release parte con directory per job + processo con permessi minimi.

---

## 5. Schema dati — le tabelle e le scelte che le attraversano

Prefisso implicito: tutte le tabelle di tenant hanno `tenant_id` + policy RLS; `created_at`/`updated_at` ovunque; id `uuid`.

| Tabella | Note dal contratto |
|---|---|
| `tenant`, `utenti` | `utenti` estende `auth.users` (profilo, ruolo, stato `invitato/attivo/sospeso` — mai eliminazione) |
| `documenti` | discriminati `archivio: pubblico/privato/conversazione`; metadati RF-A-02; stato elaborazione; path Storage di pdf e md; flag preferito per utente (tabella ponte); etichette |
| `edizioni` | versionamento RF-A-04, la corrente evidenziata; data ultimo aggiornamento per compagnia (RF-A-07) |
| `compagnie`, `rami` | tassonomia di navigazione; nel contratto i documenti escono **idratati** con gli oggetti completi (`api-stub.mjs`) — lo fa una vista o la query, mai il FE |
| `conversazioni`, `messaggi` | contesto documentale = array di riferimenti sulla conversazione (RF-C-03, «costa zero»: solo path/id); citazioni in tabella figlia o jsonb validato; condivisione nel tenant (RF-C-15) |
| `tabelle_analisi`, `celle` | cella = `ValoreEstratto`: valore + citazioni complete + `non-presente`/`non-determinabile`/`in-attesa`; il popolamento aggiorna cella per cella e il FE fa polling su `GET /api/tabelle/:id` |
| `istruzioni` | le due nature: regole scritte e documenti di riferimento (questi puntano a `documenti`, con origine `caricato/promosso` — il promosso si idrata dall'archivio a ogni lettura, contratto Fase 5); ambito (generale/ramo/compagnia), attivazione singola |
| `ricordi` | livello tenant/personale; `attivo` per la sospensione reversibile; cancellazione **effettiva** (RF-G-05); nessuna `POST` dal client: nascono solo dal job di apprendimento |
| `agenti`, `esecuzioni` | pianificazione (frequenze ammesse dal piano), `tentativi` sull'esecuzione, log sintetico, esito con citazioni, documento generato (path Storage) |
| `template_output` | formato, segnaposto, predefinito per tipologia (unico: assegnarlo lo toglie a chi lo portava), identità visiva del tenant |
| `credenziali_mcp` | **solo hash** del token + forma mascherata; revoca definitiva; `connessioni` per lo stato |
| `jobs` (+ code pgmq) | tipo, payload, stato, tentativi, `annullato`; `eventi_job` per streaming e replay |
| `consumi` | per tenant/job/origine (app o MCP — RF-F-03): token in/out, modello, costo stimato. Alimenta i limiti di piano (RF-B-08, RF-E-09) e il futuro router |
| `storico_impostazioni` | RF-D-07: chi, cosa, quando su ogni mutazione di impostazioni — il mock lo fa già, il backend lo fa a trigger o nel service layer |
| `audit_risposte` | RNF-07, «audit trail gratis»: per ogni risposta persistita — domanda, documenti letti, citazioni, token, modello, timestamp. Materiale di compliance, con retention propria |

Scelte trasversali già fissate dal contratto FE, da onorare nello schema:

- **L'incertezza è un valore di prima classe** (RF-C-08/C-12): `non-presente` e `non-determinabile` sono stati della cella, non errori; la non-copertura vive nel testo della risposta ma l'evento `non-supportato` resta nel contratto SSE.
- **La provenienza ha tre tipi** (regola / documento di riferimento / ricordo) ed è persistita col messaggio: il FE la mostra e la collega al pannello che la governa.
- **Le mutazioni restituiscono l'oggetto aggiornato** (tabelle, contesto conversazione…): il FE applica senza ricaricare.
- **La separazione degli ambiti della memoria la fa il server** (RF-G-02): `GET /api/ricordi` = tenant + personali dell'utente corrente, mai i colleghi; nessun parametro client, decide la sessione (con RLS è gratis).

---

## 6. Fasi

Stime per **uno sviluppatore BE a tempo pieno**, da ricalibrare dopo la Fase 0. Ogni fase chiude con: test sul contratto (le risposte del backend validate contro gli schemi Zod del contratto, gli stessi casi che i mock coprono), rotte tolte dal mock, FE verificato contro il backend, sezione della fase aggiornata qui con le «decisioni di contratto da sapere» — lo stesso metodo che ha funzionato per il FE.

### ✅ Fase 0 — Fondamenta — **completata** (07/08/2026)

- `be-node/` con Fastify + TS + Zod; `contratto/` popolato dai modelli di `core/models`
- Progetto Supabase + CLI; prime migrazioni: tenant, utenti, tassonomie
- Supabase Auth: login, JWT con `tenant_id`/`ruolo`; plugin Fastify di autenticazione e autorizzazione; RLS di base e test che la dimostrano (un utente del tenant A **non può** leggere il tenant B, provato contro il database vero)
- Modello degli errori identico al mock: forme di 403/404/409/429 (`ritentaTraSecondi`)/500 che il FE già gestisce
- pgmq + scheletro del worker (pesca, retry, dead letter); LISTEN/NOTIFY funzionante end-to-end su un job finto
- Seed di sviluppo dalle fixture dei mock: stesso caso pilota, stessi dati — le demo restano identiche
- CI: build, lint, test, migrazioni applicate da zero

**Decisioni di infrastruttura da sapere:**

- **Niente Supabase locale su questa macchina** (indicazione del committente): si lavora sul progetto online `hcxiloivukbdcfcugksg` (eu-north-1). Lo stack effimero della CLI gira **solo in CI**.
- **Il progetto è condiviso con altre applicazioni** (tabelle in `public`, schema `koya`): tutto VELIA vive nello **schema `velia`** — tabelle e funzioni. `public` non si tocca.
- **Ruolo dedicato `velia_app`**: login del worker e dei test, proprietario delle sole tabelle VELIA (quindi bypassa la RLS *solo* lì), membro di `authenticated` per il `set local role` di `conIdentita`. La password di `postgres` non è mai servita. **Ogni migrazione futura che crea tabelle deve chiudersi con `alter table … owner to velia_app`.**
- **JWT legacy HS256**: il progetto ha il JWKS vuoto; la verifica usa `SUPABASE_JWT_SECRET` in `.env`. Se il progetto migrasse alle signing key, si toglie la variabile e il plugin passa da solo al JWKS.
- **`supabase db push` è rotto su questo progetto** (il ruolo `cli_login_postgres` della piattaforma non è più alterabile): le migrazioni si applicano via Management API (`POST /v1/projects/:ref/database/query`) e si registrano a mano in `supabase_migrations.schema_migrations`.
- **La connessione diretta passa dal session pooler** (`aws-1-eu-north-1.pooler.supabase.com:5432`, utente `velia_app.<ref>`): LISTEN/NOTIFY non attraversa il transaction pooler. Password nel `DATABASE_URL` percent-encoded.
- **La RLS filtra, non lancia**: una scrittura senza policy tocca 0 righe senza errore. I test di isolamento contano le righe, non aspettano eccezioni.
- **PostgREST espone anche `velia`** (`db_schema: public,graphql_public,koya,velia`): nei futuri PATCH di configurazione vanno **preservati gli schemi altrui**.
- Codici d'errore aggiunti al vocabolario del mock: `NON_AUTENTICATO` (401, il mock non aveva autenticazione) e `DATI_NON_VALIDI` (400 di validazione).

### ✅ Fase 1 — Archivio Pubblico e ingestion — **completata** (07/08/2026) · RF-A-01…A-07, A-09

La pipeline di ingestion (§4.2) nasce qui, sul Pubblico, dove i documenti li carichiamo noi: si mette a punto la conversione senza utenti di mezzo.

**✅ Primo pezzo completato (07/08/2026): accesso e sessione** — su indicazione del committente, perché lo switchover non si fa senza porta d'ingresso. Decisioni di contratto da sapere:

- **Tre rotte nuove**: `POST /api/sessione/accesso` (email+password → `EsitoAccesso`: token + sessione già idratata), `POST /api/sessione/aggiorna` (il refresh token di Supabase **ruota a ogni uso**), `GET /api/sessione` (identica alla fixture del mock — la promessa di `SessioneStore` mantenuta). Le prime due sono le uniche rotte pubbliche oltre la sonda di vita.
- **Codici nuovi**: `CREDENZIALI_NON_VALIDE` (401 al login), `UTENTE_SOSPESO` (403, niente token: sospeso = fuori). L'`invitato` diventa `attivo` al primo accesso e `ultimo_accesso` si aggiorna a ogni login (contratto Fase 5 FE).
- **I permessi li afferma il server** (`permessiPerRuolo`): vocabolario del tipo `Permesso` del FE — la fixture mock portava ancora `knowledge-base.gestisci` (v0.8), corretta in `riferimenti.gestisci`.
- **FE**: rotta `/accesso` fuori dalla shell; `TokenStore` (localStorage) + interceptor che allega il Bearer, sul 401 rinnova una volta (rinnovo condiviso fra richieste concorrenti) e riprova, altrimenti pulisce e porta ad `/accesso`; «Esci» nella barra superiore, visibile solo con token veri. **Senza token la catena è trasparente**: mock e demo self-contained funzionano come sempre, nessun login davanti alla demo.
- **Proxy**: `/api/sessione` → `localhost:3002` — il primo endpoint dello switchover. `npm run dev` del FE ora avvia anche il backend (`npm:be`).
- Rimandati con motivo: revoca server-side dei token all'uscita (logout Supabase) e recupero password — hanno senso con la gestione utenti completa della Fase 6.

**✅ Secondo pezzo completato (07/08/2026): switchover dei documenti pubblici** — `/api/documenti` (elenco, dettaglio, file, preferito), `/api/compagnie` e `/api/rami` rispondono dal backend. Decisioni di contratto da sapere:

- **La logica dello stub è diventata SQL**: ricerca tutte-le-parole senza accenti con `extensions.unaccent`, ordinamento con collazione `it-x-icu`, ordine di lettura del set informativo via `array_position`, busta `{elementi, totale, pagina, perPagina}` col totale in window function.
- **I preferiti sono per utente** (tabella `preferiti` + policy RLS sulle sole righe proprie): nel mock era un booleano globale perché il mock ha un utente solo. Il seed marca gli stessi 6 documenti della fixture per ogni utente demo, e il test d'integrazione dimostra che il preferito di un utente non si vede dall'altro.
- **`documenti` nasce col discriminante `archivio`** (pubblico/privato/conversazione) e il vincolo che il pubblico non ha tenant e il resto sì; l'edizione vive sulla riga, le «altre edizioni» sono le righe sorelle per (compagnia, prodotto, tipologia). Id testuali: sono già il contratto delle fixture e delle URL.
- **Il PDF resta generato dal generatore del mock** (`mocks/pdf.mjs`, riusato dal BE): ponte dichiarato finché lo Storage non entra col punto 2 della fase.
- **Il mock non perde le rotte**: servono alla demo self-contained (`tools/serve-demo.mjs`). In sviluppo è il **proxy** a decidere chi risponde — e `/api/documenti-privati` DEVE precedere `/api/documenti` nel proxy, perché ne è un prefisso e resta al mock fino alla Fase 2.
- Prima CI verde sul push `76e8919`: migrazioni da zero + 29 test sullo stack effimero.

**✅ Terzo pezzo completato (07/08/2026): l'archivio è reale** — su indicazione del committente («non mockiamo niente adesso») le 48 fixture inventate sono uscite dal catalogo; dentro c'è il set informativo vero del pilota: **UnipolSai Km&Servizi Autovetture, edizioni 01/2019 e 11/2022** (10 documenti, PDF originali da ~2 MB + Markdown con ancore dall'esperimento del motore). Decisioni da sapere:

- **Back-office prima forma** (RF-A-06): `tools/carica-archivio.mjs` percorre un albero nel layout del motore, carica su Storage (bucket `archivio`, privato) PDF e `.md` con gli INDICE, cataloga in Postgres leggendo i metadati **dagli header dei Markdown** (titolo, prodotto, edizione, pagine, file d'origine), e scrive il manifesto `be-node/dati/catalogo-archivio.json`.
- **Il manifesto è il seed**: soli metadati (mai contenuti — punto aperto §6.2 sulla ridistribuzione), committato; in CI il catalogo c'è, i byte no, e il test del PDF si salta lì.
- **Un'edizione = un PDF**: i documenti del set (DIP, Aggiuntivo, Condizioni…) sono porzioni logiche dello stesso PDF (194/212 pagine); ogni riga porta il proprio `numero_pagine` ma `fileUrl` serve l'originale intero, e le ancore `[pag. N]` dei Markdown riferiscono le pagine del PDF complessivo — è ciò che serve alle citazioni della Fase 3.
- **Niente generatore**: il file esce dallo Storage o è un 404 `FILE_MANCANTE` leggibile. L'autorizzazione al file è la lettura di catalogo via RLS.
- **Le date restano stringhe** (`pg.types.setTypeParser(DATE)`): come JS `Date` a mezzanotte locale, ogni data di validità scivolava al giorno prima in serializzazione (fuso a est di Greenwich).
- I preferiti demo ora marcano DIP e Condizioni dell'edizione corrente; `informativa-privacy` e `riferimenti-utili` sono `tipologia: altro`.

**✅ Quarto pezzo completato (07/08/2026): la pipeline di ingestion — costruita, non eseguita.** Su indicazione del committente il codice è pronto ma nessuna conversione è partita: la prima girerà su un documento scelto, con il campione manuale dell'esperimento come metro. Decisioni da sapere:

- **Il convertitore è Haiku via SDK ufficiale** (`ConvertitoreHaiku`, streaming, PDF come document block base64): la conversione è il costo fisso per documento (doc motore §4), il modello economico è il dimensionamento voluto. La chiave vive in `.env` (`ANTHROPIC_API_KEY`, opzionale in config: l'API server non la richiede).
- **Il PDF si spezza client-side** (`pdf-lib`, blocchi da 20 pagine): l'API accetta al massimo 100 pagine per richiesta sui modelli a contesto 200K, e il set vero ne ha 212. Ogni blocco riceve la pagina assoluta di partenza: le ancore `[pag. N]` restano sulla numerazione del PDF complessivo, senza rimappature.
- **Le convenzioni sono un contratto in due lingue**: il prompt della pipeline (`src/worker/ingestion/convenzioni.ts`) e le istruzioni per l'ingestion manuale (`local-ingestion/ISTRUZIONI.md`) dicono le stesse regole — fedeltà assoluta, ancore assolute, tabelle intere, header parsabile dal back-office. Se una cambia, cambia l'altra.
- **`documenti` ha ora `stato` + `errore_elaborazione`** (RF-B-05/06): in-coda → in-elaborazione → pronto, o errore col motivo leggibile. Il gestore aggiorna lo stato a ogni passo ed emette eventi (`ingestion-inizio/avanzamento/fine`) sul canale dei job.
- **Il gestore è a dipendenze iniettate** (convertitore, archivio file): i test percorrono la pipeline intera contro il database vero con finti al posto di AI e Storage — zero chiamate, zero spesa. Il gestore vero si costruisce pigramente alla prima chiamata: l'API server importa il modulo senza pretendere la chiave.
- **`local-ingestion/`** è il playbook delle ingestion manuali in sessione (il procedimento del primo archivio): studio del PDF, albero di lavorazione, conversione con le regole, INDICE, controlli di qualità obbligatori a campione, caricamento col back-office, cosa si committa (solo metadati) e gli errori già fatti da non ripetere. `originali/` e `lavorazione/` sono gitignorate.

**✅ Collaudo della pipeline (07/08/2026): la prima conversione vera regge il confronto col campione.** `tools/collaudo-conversione.ts` (tsx) converte un range di pagine di un PDF locale col ConvertitoreHaiku vero, senza toccare database né Storage: l'output finisce in `local-ingestion/lavorazione/` (gitignorata). Primo giro sul DIP ed. 11/2022 (pagg. 1–6 di 212): contenuto quasi alla lettera identico al campione manuale, numeri tutti esatti (massimali € 6.450.000/€ 1.300.000, maggiorazione 3,6%), ancore assolute giuste. Un solo scostamento di convenzione — le pagine di sola grafica ricevevano un callout invece dell'ancora nuda — risolto con la **regola 7** («pagine senza testo: solo l'ancora») aggiunta al prompt e a `local-ingestion/ISTRUZIONI.md`; il secondo giro combacia. Il collaudo di un documento costa centesimi: farne uno a ogni ritocco del prompt.

**✅ Fase 1 completata (07/08/2026) — ultimo pezzo: le segnalazioni (RF-A-08).** Il contratto non esisteva nel mock: è nato qui, in tutte le sue controparti (contratto BE `contratto/segnalazioni.ts`, FE `core/models/segnalazione.ts` + `core/api/segnalazioni-api.ts`, stub in `mocks/api-stub.mjs`, proxy su 3002). Decisioni da sapere:

- **Una riga, non un ticket**: `velia.segnalazioni` (tipo mancante/obsoleto/errato, messaggio ≤2000, `documento_id` nullo per «manca un documento», `on delete set null` se il documento segnalato viene ritirato). Nessuno stato, nessuna lettura utente: le legge il gestore della piattaforma con la connessione di sistema.
- **La RLS firma la riga**: la policy di insert pretende `tenant_id = velia.tenant_corrente()` e `utente_id = auth.uid()` — segnalare a nome d'altri non è un divieto applicativo, è una riga che il database non lascia scrivere. Il riferimento a un documento passa dalla lettura di catalogo: ciò che non si vede non si segnala.
- **La segnalazione sta dove nasce il dubbio**: nella scheda del documento (col riferimento già compilato, default «contiene un errore») e in coda all'elenco (senza riferimento, default «manca un documento») — un innesco discreto e un cassetto col modulo, non una pagina a parte. Conferma con notifica; l'errore lo racconta l'interceptor come per tutto il resto.
- Migrazione applicata al progetto live via Management API + ledger, come da prassi del progetto.

- Storage: bucket e layout dei path; servizio file (PDF per il visualizzatore — il contratto FE apre il PDF sul passaggio citato)
- **Back-office (RF-A-06), forma minima:** CLI/script di caricamento massivo con metadati, rigenerazione indici, ritiro documenti — un'interfaccia grafica interna è rimandata finché il team piattaforma è chi sviluppa
- Pipeline di conversione con Haiku: prompt, ancore di pagina, verifica di fedeltà a campione sui PDF del pilota; `INDICE.md` generati con sinonimi commerciali
- Endpoint di navigazione e ricerca: la logica di `mocks/api-stub.mjs` (ricerca insensibile agli accenti, filtri opzionali, ordine di lettura del set informativo, edizioni, preferiti, paginazione) portata su SQL
- RF-A-08 (segnalazione documento mancante/errato): tabella + endpoint, S ma economico qui

### ✅ Fase 2 — Archivio Privato — **completata** (22/08/2026) · RF-B-01…B-05, B-07…B-09

Lo switchover dell'Archivio Privato: `/api/documenti-privati` (elenco, upload, scheda, modifica, eliminazione, file, riferimento), `/api/etichette` e `/api/spazio` rispondono dal backend; il mock resta per la demo self-contained (`tools/serve-demo.mjs` non conosce il 3002, per scelta). Decisioni di contratto da sapere:

- **Un privato è una riga di `documenti` con `archivio = 'privato'`**: stesso catalogo, stessa pipeline, stesso visualizzatore. La migrazione `20260822100000_archivio_privato.sql` aggiunge le colonne del privato (`caricato_da/il`, `dimensione_byte`, `nome_file`, `visibilita`, `documento_di_riferimento`, `riferimento_cliente`, `classificazione_da_confermare`, `etichette text[]` con GIN) e i limiti di piano sul tenant (`limite_spazio_byte` 5 GB, `limite_file_byte` 20 MB — i default del mock, il piano commerciale li cambia per tenant, mai nel codice).
- **L'isolamento (RF-B-01) è la RLS, non il codice**: `documenti_lettura` estesa al privato del proprio tenant; insert firmato (`caricato_da = auth.uid()`), update e delete dentro il tenant. Le query ripetono `tenant_id = …` per l'indice, non per fidarsi; il test dimostra che un altro tenant non vede una riga nemmeno per id. `archivio-privato.carica/elimina` sono permessi dell'operatore: nessuna guardia di ruolo sulle rotte.
- **Upload multipart (`@fastify/multipart`), campo `file` ripetuto, lotto atomico come nel mock**: 400 `NESSUN_FILE`, 413 `FILE_TROPPO_GRANDE`, 507 `SPAZIO_ESAURITO`, più un codice nuovo — **415 `FORMATO_NON_SUPPORTATO`**: la pipeline converte solo PDF (RF-B-02, formato minimo) e si rifiuta subito con un motivo leggibile, non in coda; si verifica la firma `%PDF-`, non il nome. Il mock lo replica per estensione; la zona di caricamento del FE sull'Archivio Privato propone solo `.pdf`. I file si bufferizzano (tetto duro 64 MB/30 file nel plugin, il limite vero è quello del tenant). Ordine: byte nello Storage → righe (firmate dalla RLS) → job; se qualcosa si rompe a metà, i byte già caricati si tolgono.
- **Lo Storage del privato è piatto per tenant**: `tenant/<tenantId>/documenti/<id>.pdf` e `.md` (stesso bucket `archivio`). L'albero navigabile del motore (doc motore §3.2) e gli `INDICE.md` del privato si materializzano in Fase 3 dai metadati di Postgres — Postgres è la verità sulla navigazione, lo Storage sui contenuti (§4.1). Id `doc-priv-<12 hex>`.
- **La pipeline ha il passo 3**: `Classificatore` (Haiku, una chiamata breve sull'inizio del Markdown + nome file + tassonomie) propone tipologia, compagnia, ramo e cliente/pratica; scrive solo se `classificazione_da_confermare` è ancora vero (`… where classificazione_da_confermare`: se l'utente ha confermato mentre convertivamo, la proposta non scrive). Il flag resta vero finché l'utente non tocca i metadati (PATCH, anche vuota = conferma, come nel mock). Una proposta mancata non è un'ingestion fallita (evento `ingestion-classificazione-saltata`). Id fuori tassonomia → null.
- **L'errore parla all'utente** (`ErroreIngestion` con `messaggioUtente`): sul documento va il motivo leggibile, nel job quello tecnico. RF-B-06 prima release: una conversione senza una riga di testo (solo ancore/callout) è `errore` col messaggio della scansione muta; un PDF che pdf-lib non apre è «non è un PDF leggibile». Il resto è un messaggio generico («riprova, poi segnala»).
- **PATCH**: sei chiavi (`titolo`, `tipologia`, `compagniaId`, `ramoId`, `riferimentoCliente`, `etichette`), `.strict()`; **`null` svuota** riferimento cliente/compagnia/ramo (il FE oggi non sa svuotare il riferimento: il contratto glielo permette da qui); compagnia/ramo inesistenti → 400; etichette trim + dedup, max 30 × 60 caratteri. `soloRiferimenti=false` è falso (niente `z.coerce.boolean()`).
- **DELETE è effettivo (RNF-03)**: riga, PDF e Markdown spariscono insieme — lo Storage si svuota dentro la transazione, se fallisce la riga resta e si riprova. La cache del worker non esiste ancora (arriva con la workspace di Fase 3: andrà invalidata qui).
- **`/api/spazio` è a costo basso** (il polling lo chiede ogni 2 s): somma e conteggio sull'indice parziale del tenant + la riga di `tenant`. `/api/etichette`: `unnest` + conteggio, ordinate per uso e poi nome in `it-x-icu`.
- **Il worker entra nel dev stack**: `npm run dev` del FE avvia anche `be:worker` (`dev:worker` di be-node). Senza, ogni upload resterebbe `in-coda` per sempre.
- **`tools/applica-migrazione.mjs`**: la prassi «Management API + ledger» è uno script (`--elenco` per il registro, `<file.sql>` per applicare e registrare; idempotente).
- Test: `test/archivio-privato.spec.ts` (contratto, senza db) e `test/integrazione-archivio-privato.spec.ts` (flusso intero contro il progetto vero con Storage/AI finti: 13 casi, inclusi limiti, isolamento, scansione muta, conferma-prima-della-proposta). Il `.env.example` ora cita `ANTHROPIC_API_KEY`.
- Rimandati con motivo: visibilità per-utente (RF-B-07: colonna in schema, nessuna rotta la scrive — si attiva se il pilota la chiede); successo parziale dell'upload (il FE marca il lotto, servirebbe un contratto `{creati, rifiutati}` che non esiste); formati oltre il PDF (DOCX/immagini: la pipeline non li converte, meglio un 415 onesto).

### ✅ Fase 3 — Motore agentico e chat — **completata** (22/08/2026) · RF-C-01…C-09, RF-D-05/08/15, RF-G-04

Il §4.3 per intero e il ponte SSE del §3.1: `/api/conversazioni` risponde dal backend (proxy su 3002; resta al mock solo `…/messaggi/:mid/esporta`, che è Fase 4 — il proxy lo distingue con una regola regex). **Collaudato col motore vero**: «Che franchigie e scoperti prevede la garanzia Furto e Rapina nella Km&Servizi UnipolSai?» → 19 turni, 137 s, 0,63 $ (Opus 5), 17 citazioni **tutte verificate** dal worker contro file e pagine reali, testo in streaming identico a quello persistito (`tools/collaudo-motore.ts`, esito in `local-ingestion/lavorazione/`). Decisioni da sapere:

- **Il motore è l'Agent SDK** (`@anthropic-ai/claude-agent-sdk`, `query()`), come da doc motore §2: `tools`/`allowedTools` = Read, Grep, Glob e nient'altro; `cwd` = la workspace del job; `permissionMode: 'default'` + hook `PreToolUse` che **nega ogni path fuori dalla workspace** (seconda cinta: il Read accetta assoluti) e osserva l'annullamento a ogni passo; `maxTurns`/`maxBudgetUsd` come budget (decisione aperta 4: `MOTORE_MAX_TURNI=40`, `MOTORE_BUDGET_USD=3`, si misurano); modello da `MODELLO_MOTORE` (decisione aperta 1: default `claude-opus-5`, l'esperimento dà Sonnet a metà prezzo e tempo con qualità inferiore — si decide coi numeri di `audit_risposte`). `persistSession: false`, `settingSources: []`: nessun file locale dell'utente entra nella sessione. L'SDK gira in `be-node` con la chiave di `.env`, mai abbonamenti personali.
- **La workspace è materializzata per job dai metadati di Postgres** (`worker/motore/workspace.ts`): l'Archivio Pubblico intero nell'albero dello Storage (con gli `INDICE.md` accanto), il privato del tenant (solo `pronto`) in `tenant/documenti/<tipologia>/<slug>--<id>.md`, gli allegati della conversazione in `tenant/allegati/<slug>--<id>.md`, più `INDICE.md` **generati** per radice, privato e allegati (tabella con titolo, tipologia, compagnia, ramo, cliente, pagine, etichette, ★ riferimento). Il file name porta l'id: è così che una citazione torna a un documento. Cache su disco per path con la versione della riga (`updated_at`; gli indici pubblici per età, 1 h); hard link nella workspace, copia se il volume non li permette; la workspace si rimuove a fine job. La DELETE del privato non deve invalidare nulla: la materializzazione parte sempre dal catalogo.
- **Il modello chiude ogni risposta con un blocco ```` ```velia-citazioni ```` JSON** (`{citazioni:[{file,pagina,estratto,articolo?}], provenienze:[{tipo,id}], nonSupportato}`) che il FE non vede: il worker lo separa (`margineMarcatore` trattiene la coda dello streaming che potrebbe esserne l'inizio), lo valida e lo traduce nelle forme del contratto. **Una citazione a un file inesistente o oltre l'ultima pagina citabile è un'allucinazione e boccia la risposta** (evento `errore` «citava passaggi non verificabili», messaggio non persistito, job `fallito` con `ErroreNonRitentabile` — ritentare un'allucinazione non la aggiusta; il retry del ciclo resta per i guasti d'infrastruttura). Pagina massima: per i pubblici è l'ultima pagina del **PDF condiviso dell'edizione** (le ancore sono del PDF intero, Fase 1), per privati/allegati `numero_pagine`. Gli `INDICE.md` citati si ignorano con avviso (mappe, non fonti); provenienze con id ignoti si ignorano; nessuna citazione senza non-copertura è un avviso nell'audit, non un errore.
- **Streaming: narrazione vs risposta** (`worker/motore/flusso-testo.ts`, classe pura `FlussoTesto` con test sintetici — le prove dal vivo hanno trovato due bug qui, prima di isolarla). Il testo fra due tool è narrazione e diventa un evento `attivita`; il testo oltre 300 caratteri si inoltra man mano (è la risposta); quando un turno chiude con `tool_use` dopo aver già inoltrato, si separa con una riga vuota e si prosegue. L'inoltro non supera mai l'inizio del blocco finale (`limiteInoltro`: marcatore già completo, coda che potrebbe esserne l'inizio, spazi in coda): **`testoVisibile` è ciò che l'utente ha visto e che si persiste, `testoCompleto` aggiunge il blocco per il validatore**. Le attività nascono dall'hook (`Cerco «x» in y.md`, `Leggo z.md dalla riga N`) e dalla narrazione breve.
- **Prove dal vivo (22/08, dallo stack `npm run dev` del FE, attraverso il proxy)**: upload del preventivo reale del pilota → `pronto` in ~2 min con classificazione proposta corretta (preventivo · UnipolSai · RC Auto · cliente e numero di preventivo); conversazione con DIP + Condizioni + preventivo privato, domanda di confronto → 174 s, 19 citazioni validate (7 sul privato), 0,71 $; «ferma la risposta» → job `annullato` in 1 passo, nulla persistito; follow-up multi-turno (Kasko) → 118 s, 14 citazioni, testo in streaming = testo persistito. Presa in carico 1,3 s a coda pulita.
- **Regole 5 e 6 del prompt, nate da un'interazione vera (24/08)**: *mai sostituire l'oggetto della domanda* — se il documento chiesto non c'è, il motore dichiara, elenca il pertinente, propone e SI FERMA ad aspettare conferma (prima eseguiva da solo il confronto «probabilmente utile»); *il mondo interno non si nomina* — mai percorsi, file, «workspace» o INDICE nella risposta: documenti per titolo, archivi per nome. Una sentinella non bloccante (`avvisiEsposizione`) annota nell'audit ogni esposizione residua. Ricollaudato sul caso reale: si ferma e chiede, zero avvisi. Il motore **dà del tu** (24/08, ricollaudato): strumento personale, non corrispondenza formale. Ogni ritocco al prompt del motore si ricollauda con `tools/collaudo-motore.ts` (centesimi), come per la conversione.
- **FE, dopo le prove al monitor**: la bolla rende il Markdown del motore (`shared/testi/testo-risposta.ts`: titoli scalati a h3–h5, tabelle con scorrimento, elenchi, citazioni in blocco, corsivo delle fonti, righe orizzontali — sempre a mano, HTML scappato, soli elementi che il sanitizer lascia passare); le fonti stanno in un accordion **chiuso** con «N passaggi in M documenti», perché il motore cita ogni passaggio letto. **I documenti referenziati stanno nel messaggio, tra le parole** — sia nella bolla inviata sia nel composer, che è diventato un editor `contenteditable` governato via DOM (`features/chat/composer/editor-testo.ts`: chip non editabili, `@query` → chip sul posto, Backspace toglie il chip e il riferimento, Invio invia, Shift+Invio a capo, incolla solo testo); lo store resta la verità (bozza = testo, riferimenti = documenti), la posizione dei chip nel testo è di chi scrive.
- **Il worker nello stack dev gira con `node --watch --import tsx`** (script `worker` di be-node, `be:worker` del FE): `tsx watch` sotto `concurrently` su Windows nasce e non parte mai (né output né lavoro) — `dev:worker` con `tsx watch` resta per l'uso da terminale.
- **Contratto chat: due aggiunte additive, concordate come tali.** Evento `attivita {etichetta}` (il FE mostrava un segnaposto statico: ora mostra l'ultimo passo finché il testo non arriva — `EventoStream`, `ChatStore`, `BollaMessaggio`) e `Citazione.archivio` esteso a `'conversazione'` (gli allegati sono citabili: il visualizzatore li apre da `urlFileAllegato`). Tutto il resto è il contratto del mock: `Paginato` a pagina unica ordinato per `aggiornataIl` desc, contesto idratato (id non risolvibili spariscono), `GET …/messaggi` array nudo crescente, 404 `NON_TROVATA` per la conversazione e `NON_TROVATO` per il resto, 409 `NON_PRONTO` sui privati non pronti (gli allegati sono sempre referenziabili), `PATCH` con titolo solo se non vuoto e `aggiornataIl` sempre, `DELETE` 204 a cascata, titolo dal primo messaggio con la regola dei 60 caratteri.
- **Il ponte SSE** (`api/conversazioni/ponte-eventi.ts` + `trasmettiStream`): una connessione LISTEN per processo, aperta pigramente alla prima iscrizione; il NOTIFY porta il puntatore, i dati si rileggono da `eventi_job`, **che è anche il replay** (chi si iscrive a job già partito riceve prima il pregresso, senza doppioni grazie all'id crescente). L'API pre-genera l'id del messaggio assistente e lo manda nell'`inizio` (il worker persiste la riga con quell'id a fine risposta); frame `data: <json>\n\n` solo LF, `X-Accel-Buffering: no`, battito `:\n\n` ogni 15 s, ultimo evento sempre `fine` o `errore`. Il worker emette gli eventi **già nella forma del contratto FE** (`dati` = l'evento intero): l'API inoltra, non traduce.
- **Annullamento = chiusura del client prima di `fine`**: l'API segna il job `annullato` (solo se ancora `in-coda`/`in-esecuzione`), il worker lo vede nell'hook al primo tool successivo e con una sentinella ogni 3 s, abortisce la sessione, non persiste, non emette `fine`; restano audit-free ma **consumi sì** (i token si sono spesi). Una caduta di rete che arriva come chiusura pulita fa lo stesso: non è distinguibile, e un job fermato costa meno di uno che paga per nessuno — la promessa del §3.1 («alla riapertura la risposta c'è») vale solo se il socket non si chiude; da rivedere con un annullamento esplicito nel contratto se il pilota lo chiede. Il ciclo non sovrascrive più `annullato` con `completato`; `prossimo()` salta gli orfani nello stesso giro.
- **Allegati di conversazione**: `POST /api/conversazioni/allegati` (multipart, un file, solo PDF, limite del tenant) → riga di `documenti` con `archivio = 'conversazione'` in `tenant/<tid>/allegati/<id>.pdf` (fuori dagli archivi; **non** sotto la conversazione, perché nascono prima di lei), stessa pipeline di ingestion, 201 col solo riferimento. Il worker **aspetta fino a 2 minuti** gli allegati del contesto ancora in conversione (evento `attivita` «Aspetto l'elaborazione di …»), poi parte con ciò che c'è dichiarando al modello i mancanti. Gli allegati orfani spariscono con l'ultima conversazione che li referenzia (riga + Storage).
- **DNA d'Agenzia**: le tabelle `istruzioni` e `ricordi` nascono qui con la forma del mock (le rotte di gestione arrivano in Fase 6/8); il prompt porta istruzioni attive pertinenti (generali + per ramo/compagnia dei documenti in contesto), ricordi attivi del tenant + personali dell'utente (RF-G-02, separazione fatta dal server) e i documenti di riferimento (★) come path, con gli id che il modello dichiara nelle provenienze; **le istruzioni prevalgono sui ricordi** è scritto nelle regole (RF-G-04). Le provenienze escono con le etichette del contratto (`valutato secondo la regola "…"`, `consultato il documento di riferimento "…"`, `tenuto conto di: …`) — anche `documento-riferimento`, che il mock non emetteva mai.
- **Il titolo della conversazione è a due tempi** (24/08): all'invio del primo messaggio l'API mette il provvisorio (le prime parole, regola dei 60), e a risposta pronta il worker lo sostituisce con un titolo sensato generato da Haiku su domanda+risposta (`worker/motore/titolista.ts`), **solo se è ancora il provvisorio** (`where titolo = $provvisorio`: una rinomina dell'utente vince) e prima del `fine` (il FE ricarica lo storico lì). Un titolo mancato non è un errore (evento `titolo-saltato`).
- **La home è personale** (24/08): saluto contestuale per fascia oraria e nome (curato nel FE, `features/chat/saluto.ts` — nessuna chiamata: dev'esserci al primo dipinto), e **suggerimenti generati dal motore**: a fine risposta Haiku scrive le tre prossime domande sensate (`worker/motore/suggeritore.ts`), salvate per utente in `velia.suggerimenti` (sostituite a ogni risposta, RLS di sola lettura propria) e servite da `GET /api/suggerimenti`; la home completa con gli esempi fissi quando mancano (utente nuovo, demo mock). Migrazione `20260824190000`. Sottotitolo senza «in italiano».
- **Multi-turno** (piano §4.3.5): ogni messaggio è un job nuovo; la storia si ricostruisce dal DB nel prompt utente (ultimi ~24 k caratteri, dal più vecchio), il prompt caching dell'harness fa il resto (collaudo: 249 k token letti da cache su 19 turni).
- **`audit_risposte` e `consumi`** si scrivono a ogni risposta (anche bocciata o annullata per i consumi): domanda, risposta, documenti letti (dai Read dell'hook), citazioni + avvisi, modello, turni, durata, token, costo. RLS attiva senza policy: li legge il back-office, l'amministratore di tenant in Fase 6.
- **RF-C-09**: senza documenti in contesto il motore cerca da sé e propone nel testo («Ho cercato io nell'archivio pubblico…», l'ha fatto nel collaudo); la conferma con azione dedicata non ha contratto nel FE e resta per dopo.
- Migrazione `20260822150000_conversazioni.sql` applicata con `tools/applica-migrazione.mjs`. Test: `test/motore.spec.ts` (13, le parti pure) e `test/integrazione-conversazioni.spec.ts` (7, flusso intero con **motore finto**: CRUD, allegato, workspace vera, SSE dall'accodamento alla persistenza, citazioni inventate → errore, non-supportato/budget, annullamento, DELETE a cascata). Il worker dev ha bisogno di `ANTHROPIC_API_KEY` per il motore vero. **I test d'integrazione che spazzano dati girano sul tenant di COLLAUDO** (`2222…`, utenti `t.uno`/`t.due@collaudo.sonovelia.it`, creati da `tools/seed-utenti.mjs`; 24/08): mai più pulizie sul tenant demo, che è quello delle prove al browser — e la suite locale si lancia sempre a worker dev fermo (stessa coda). In CI le suite con login si saltano da sole (niente `SUPABASE_JWT_SECRET` nello stack effimero).
- Rimandati con motivo: esportazione su template (Fase 4, rotta ancora al mock); confinamento OS del worker (decisione aperta 3, col deployment); annullamento esplicito nel contratto; paginazione dello storico (contratto senza parametri).

### ✅ Fase 4 — Generazione documenti su template — **completata** (24/08/2026) · RF-D-10…D-13, RF-C-10

`/api/template`, `/api/identita-visiva` e l'esportazione della chat rispondono dal backend: il proxy manda tutto al 3002 e la regola regex sull'esporta sparisce (le conversazioni sono intere del BE). Il mock resta per la demo, allineato sui due punti di contratto (PPTX, schema dei segnaposto). Decisioni da sapere:

- **Le librerie, scelte con la prova per formato** (`test/generazione.spec.ts`: ogni file generato si *riapre* — il PDF con pdf-lib, DOCX e XLSX come gli archivi che sono — e contiene il testo che ci abbiamo messo): **pdf-lib** (già in casa dalla Fase 1) per il PDF, **docx** per il DOCX, **exceljs** per l'XLSX, **docxtemplater + pizzip** per riempire i template DOCX del tenant. La generazione è **sincrona** (un documento sta sotto il secondo); il passaggio in coda aspetta un caso che lo chieda (le tabelle di Fase 5).
- **`src/generazione/` è un ingresso solo** (`generaDocumento`) per chat, tabelle e agenti: `blocchi.ts` analizza il Markdown leggero delle risposte (titoli, grassetti, elenchi, tabelle) una volta per tutti i formati; i compositori impaginano con l'**identità visiva** (logo e firma in testa, filo e accenti del colore primario, recapiti e numero di pagina in calce).
- **Due nature di template.** Le righe di **piattaforma** (`tenant_id` null, stessi id e testi della fixture del mock: `tpl-001…004`) hanno il layout nel codice e nessun file; quelle del **tenant** sono file veri in `tenant/<tid>/template/<id>.<fmt>` + riga di catalogo (`velia.template`). Lo **schema dei segnaposto** è `{{titolo}}`, `{{destinatario}}`, `{{data}}`, `{{contenuto}}`, `{{fonti}}`: l'upload pretende `{{contenuto}}` nei DOCX/XLSX (400 `SEGNAPOSTO_MANCANTI`, il posto del testo generato) e lo trova anche spezzato nelle run di Word (si leggono le parti XML senza tag); un template **PDF** del tenant è una carta intestata — la sua prima pagina fa da sfondo a ogni pagina generata. Lotto atomico, firma dei byte verificata, 413 sul troncato.
- **PPTX si rifiuta con un motivo leggibile** (415 `FORMATO_NON_SUPPORTATO`, upload ed esporta): il FE lo dichiarava già rimandato (Fase 5 FE, §6.11); il mock è stato allineato — e la sua anteprima ora mostra lo schema dei segnaposto vero (`{{contenuto}}`/`{{fonti}}`, non più `{{corpo}}`/`{{tabella}}`).
- **Il predefinito per tipologia (RF-D-13) è stato del tenant**, anche quando indica un template di piattaforma: vive in `velia.template_predefiniti` (chiave `tenant, tipologia` = l'unicità; una riga a `template_id` null sopprime il default di libreria, nessuna riga lo lascia valere). Il PATCH risponde con l'elenco intero, come nel contratto. DELETE solo sui propri (409 `PRECARICATO`), riga e file insieme.
- **Identità visiva (RF-D-12)**: una riga per tenant (`velia.identita_visiva`), GET coi default finché non c'è (`#2f4b7c`); il logo sta nello Storage (`tenant/<tid>/identita/logo`) e accetta **solo PNG o JPEG** (415 altrimenti): sono i formati che pdf-lib e docx incorporano; un logo illeggibile non fa mai fallire una generazione (si ignora).
- **L'anteprima è sempre PDF** (RF-D-11): un template PDF del tenant si mostra com'è; per gli altri si impagina la scheda della struttura (segnaposto, e per i template propri quelli davvero trovati nel file) **con l'identità visiva applicata** — che è l'impaginazione della generazione, non un'immagine finta.
- **Esportazione (RF-C-10)**: `POST …/messaggi/:mid/esporta` sincrono, visibilità del messaggio via RLS (l'operatore sull'altrui non condiviso prende 404), fonti nella forma del mock (`Titolo — art. X, p. N`), `Content-Disposition: attachment` col nome-slug del mock. Id malformati → 404, mai un errore SQL.
- **`velia.impostazioni_storico` nasce qui** (RF-D-07): ogni mutazione di template e identità lascia la voce «chi, cosa, quando» dentro la stessa transazione; la rotta di lettura arriva in Fase 6 con le altre impostazioni. Scritture da amministratore (`template.gestisci`): 403 dalla rotta, isolamento dalla RLS.
- **Fix collaterale da sapere**: la pulizia della suite di Fase 0 (`delete … where nome like '%(test)'`) si portava via il **tenant di collaudo** in cascata, utenti compresi — era questo a rompere le run successive. Ora cancella solo i tenant che crea lei, e il tenant di collaudo si chiama «Agenzia di Collaudo» senza esca `(test)` (`tools/seed-utenti.mjs`, rieseguito).
- Migrazione `20260825090000_template.sql` (catalogo + predefiniti + identità + storico, RLS, libreria precaricata inserita lì: è dato di piattaforma). Test: `test/generazione.spec.ts` (10), `test/template.spec.ts` (7, contratto senza db), `test/integrazione-template.spec.ts` (11, tenant di collaudo, Storage finto, db vero). Suite completa 116/116, due volte di fila.
- Rimandati con motivo: PPTX (§6.11, il più oneroso); generazione in coda (nessun caso sotto i tempi sincroni la chiede ancora); `{{destinatario}}` resta vuoto nell'esporta chat (il contratto del messaggio non porta un cliente — arriverà dalle tabelle/agenti dove il dato c'è).

### Fase 5 — Tabelle di analisi · ~6 giorni · RF-C-11…C-15

- Creazione: la tabella nasce con celle `in-attesa`, un job per il popolamento **cella per cella** (o per gruppi per documento: si decide misurando), aggiornamento progressivo, polling del FE finché `stato === 'in-generazione'` — contratto Fase 4 FE, nessuno streaming
- Ogni cella passa dalla stessa validazione delle risposte di chat: citazione completa (pagina, articolo, riquadro — dalla cella si apre il visualizzatore) o dichiarazione `non presente`
- Criteri predefiniti risolti dal server sui rami dei documenti scelti (`GET /api/tabelle/criteri?documenti=…`)
- Mutazioni a generazione in corso (aggiunta/rimozione documenti e colonne): il job riconcilia, le mutazioni restituiscono la tabella aggiornata
- «Interroga in chat» = ponte: conversazione nuova con gli stessi documenti (RF-C-13, già così nel contratto); condivisione nel tenant in sola lettura + «Duplica» (RF-C-15); esportazione XLSX via Fase 4 — la conferma che serviva al punto 8 del §14 FE
- Regalo dichiarato dal doc motore (§7): questa estrazione è la base del futuro lookup strutturato — lo schema delle celle si disegna già pensandoci

### Fase 6 — Impostazioni complete · ~5 giorni · RF-D-01…D-04, D-06/07, D-14/16, utenti

- Modello e provider (RF-D-02): l'astrazione `motore/` formalizzata — interfaccia unica, prima implementazione Anthropic con scelta del modello; schede informative (RF-D-03) come dati di configurazione
- Istruzioni: CRUD delle due nature, ambiti, attivazione singola; documenti di riferimento con le due origini e l'idratazione dei promossi; peso del contesto permanente (RF-D-16) calcolato dai md
- Storico unico (RF-D-07): `GET /api/impostazioni/storico?oggetti=…`, registrato su ogni mutazione
- Utenti del tenant: invito (email via Supabase Auth), ruolo, sospensione — mai eliminazione; 409 su sé stessi
- RF-D-09 (modalità di prova di una regola) resta rimandato, come nel FE — ha senso ora che l'AI è vera, ma è priorità C: si mette nel dopo-lancio

### Fase 7 — Agenti · ~7 giorni · RF-E-01…E-13

- CRUD agenti; fonti idratate in lettura, forma nuda in scrittura; porzioni di archivio come fonte (ramo/compagnia/preferiti — insiemi vivi risolti a ogni esecuzione: è il punto del monitoraggio nuove edizioni)
- Esecuzione = **lo stesso job di interrogazione con un ingresso diverso**; manuale con parametri (RF-E-05), pianificata con pg_cron che accoda al tick — il worker resta uno
- Storico con polling (contratto Fase 6 FE: la notifica in-app nasce dal polling che vede la transizione, nessun canale in più); retry raccontato (`tentativi`, avvisi nel log, fallimento persistente dopo 3)
- Limiti applicati due volte (RF-E-09): esposti da `GET /api/agenti/limiti`, imposti dal server — 409 sull'attivazione oltre soglia, 429 con `ritentaTraSecondi` sulle concorrenti; le esecuzioni pianificate consumano dal piano (punto aperto §6.9: i numeri dei limiti sono decisione commerciale, il meccanismo si fa ora)
- Predefiniti = copia (la libreria è sola lettura); documento su template via Fase 4, scaricabile dallo storico
- Canali di notifica oltre l'in-app (email — punto aperto §6.10): predisposto, attivato a decisione presa

### Fase 8 — Memoria · ~5 giorni · RF-G-01…G-06

- Job di **apprendimento a fine conversazione**: un modello economico estrae candidati ricordi (prassi, contesto, preferenze), il worker valida e persiste con collegamento alla conversazione d'origine; niente registrazione esplicita (RF-G-07 rimosso — contratto Fase 7 FE: solo `GET`/`PATCH`/`DELETE`)
- **Perimetro GDPR nel prompt e nella validazione** (RF-G-05): mai categorie particolari (art. 9) né dati eccedenti; il validatore scarta, non solo il prompt — doppia applicazione anche qui
- Governo: correzione, sospensione (`attivo: false` = fuori dalle risposte, dentro il pannello), cancellazione effettiva, spostamento personale⇄tenant con le regole del contratto
- La memoria entra nel prompt del motore (chat **e** agenti, RF-G-06) filtrata per ambito e livello; retention configurabile: meccanismo ora, politica quando la consulenza legale la fissa (RNF-03)

### Fase 9 — Server MCP · ~5 giorni · RF-F-01…F-05

- `mcp/`: server MCP che espone **ricerca per metadati, lettura/estratto, interrogazione di un documento** su entrambi gli archivi — sono gli stessi servizi dell'API e la stessa preparazione del filesystem: un motore solo, più ingressi
- Autenticazione con credenziali dedicate (Fase 7 FE: token in chiaro una volta sola, hash sul server, revoca definitiva che chiude le connessioni); stato connessioni in Impostazioni
- **Stesso isolamento e stessi conteggi** (RF-F-02/03): le chiamate MCP passano dal medesimo strato di autorizzazione e scrivono in `consumi` con origine `mcp`
- Documentazione di configurazione per i client principali + avvertenza RF-F-05 (le risposte nel client esterno non sono governate dalle istruzioni VELIA); l'esposizione delle istruzioni come risorsa MCP opzionale: C, dopo-lancio
- Capacità avanzate via MCP (RF-F-06): fuori, come da requisito

**Totale indicativo: ~65 giorni-uomo** (~13 settimane per una persona), esclusi i punti rimandati dichiarati. La Fase 3 è quella con la varianza più alta: dipende da quanto l'esperimento del motore ha già sgrossato prompt e conversione.

---

## 7. Ordine di esecuzione

Le fasi 0→3 sono la spina dorsale e vanno in sequenza: dopo la Fase 3 esiste il prodotto vero sul caso pilota (archivi reali + chat col motore vero), ed è il momento del **primo switchover visibile**: la demo passa dal mock al backend.

Dalla 4 in poi l'ordine può piegarsi alle priorità commerciali — le fasi 4/5 (esportazioni e tabelle) servono la demo al pilota; 6/7/8/9 sono tra loro indipendenti. L'unica dipendenza rigida: la 4 prima della 5 e della 7 (entrambe esportano su template).

---

## 8. Fatto significa fatto — la versione backend

Un endpoint è completo quando ha tutti e sei:

1. **Contratto** — risposta validata contro lo schema Zod del contratto; gli stessi casi del mock (inclusi 403/409/429) coperti da test
2. **RLS dimostrata** — test di isolamento cross-tenant per ogni tabella toccata
3. **Errori leggibili** — la forma d'errore che il FE già mostra, mai stack trace
4. **Audit e consumi** — se l'endpoint tocca l'AI, registra; se muta impostazioni, storicizza
5. **Idempotenza dei job** — ogni consumer pgmq rilegge lo stato prima di agire: at-least-once significa che i doppi arrivi succedono
6. **Rotta tolta dal mock** — e FE verificato contro il backend

---

## 9. Cosa serve deciso — e cosa serve da voi

| # | Questione | Serve entro | Impatto se non deciso |
|---|---|---|---|
| 1 | **Esito dell'esperimento del motore** (§8 doc motore): modello al lancio (Sonnet vs Opus), budget turni/token per job | Fase 0 | La Fase 3 parte al buio; i costi per query restano stime |
| 2 | **Supabase: cloud o self-hosted?** Il cloud (regione UE) è la via rapida; i documenti privati contengono dati personali di clienti finali → la scelta va passata dalla consulenza legale GDPR (RNF-03) insieme al DPA di Supabase e Anthropic | Fase 0 | Blocca la creazione del progetto e i termini col pilota |
| 3 | **Dove gira il worker**: VM centrale multi-tenant (consigliata in prima release, con confinamento per job) o macchina per agenzia (il disegno originale di `chat-analisi.txt`)? | Fase 0 | Cambia deployment, sync della cache, story di sicurezza |
| 4 | **Chiavi API AI: incluse nel servizio o BYO key?** (punto aperto §6.7) Impatta RNF-05, pricing e il layer multi-provider | Fase 3 | La configurazione del motore per tenant resta provvisoria |
| 5 | **Copertura iniziale dell'Archivio Pubblico e liceità della ridistribuzione** (punti aperti §6.1/6.2) | Fase 1 | Il back-office carica documenti che forse non si possono ridistribuire |
| 6 | **Limiti di piano numerici** (spazio, esecuzioni, frequenze — punti aperti §6.9/6.12) | Fase 7 | Il meccanismo c'è, i numeri no: si lancia con valori prudenti da rivedere |
| 7 | **Canali di notifica** (§6.10) e **limite documenti per conversazione** (§6.4) | Fase 7 / Fase 3 | Già rimandati nel FE; il BE predispone e aspetta |
| 8 | **Politica di retention** di memoria e audit (RNF-03, RF-G-05) | Fase 8 | Meccanismo senza politica: rischio di conservare troppo |

---

## 10. Passo successivo

Chiudere l'esperimento del motore con i PDF reali del pilota (è il prerequisito dichiarato, e i primi numeri ci sono già), decidere i punti 2 e 3 della tabella qui sopra, e partire con la **Fase 0**: repository, Supabase, auth, RLS dimostrata, coda funzionante. Come per il FE, è la fase che non mostra nulla e determina la velocità di tutte le altre.
