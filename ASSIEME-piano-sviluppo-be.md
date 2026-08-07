# ASSIEME — Piano di sviluppo Back-end

| Campo | Valore |
|---|---|
| Documento | Piano di sviluppo BE |
| Versione | 0.1 (bozza) |
| Data | 07/08/2026 |
| Riferimenti | `ASSIEME-analisi-requisiti.md` v0.9 · `ASSIEME-motore-agentico.md` v0.1 · `ASSIEME-piano-sviluppo-fe.md` v0.4 |
| Stack | Node.js · Supabase (Postgres, Auth, Storage, Queues) |
| Progetto | `be-node/` (nuova cartella, stesso repository) |

---

## 1. Obiettivo e criterio di uscita

Costruire il backend che **sostituisce il server mock endpoint per endpoint**, senza che il front-end cambi una riga di codice applicativo.

Il contratto esiste già, in tre forme che devono restare la fonte di verità:

1. **le interfacce TypeScript** in `fe-angular/src/app/core/models/` — la forma dei dati;
2. **i servizi** in `fe-angular/src/app/core/api/` — rotte, verbi, codici di errore attesi;
3. **il mock eseguibile** (`mocks/assieme.json` + `mocks/*.mjs`) — il comportamento: idratazione dei riferimenti, macchine a stati, framing SSE, file generati.

Il backend non progetta un'API nuova: **onora questa**. Ogni deviazione necessaria è una modifica di contratto, va discussa e riportata nei modelli FE e nei mock, mai introdotta di nascosto.

**Criterio di uscita per ogni fase:** il proxy Mockoon in modalità inoltro punta al backend, le rotte implementate vengono tolte dal mock, e l'applicazione FE funziona identica a prima — questa è la transizione graduale già prevista dal piano FE (§6): si passa endpoint per endpoint, con l'applicazione sempre in piedi.

**Prerequisito dichiarato:** il motore agentico va validato **prima** di costruirci attorno l'idraulica (`ASSIEME-motore-agentico.md` §8, `esperimento-motore/`). Le misure già raccolte (06/08/2026: 0,43–0,99 USD e 94–128 s per domanda puntuale su percorso agentico) alimentano le decisioni su modello, budget per query e percorsi rapidi futuri.

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

Nel mock la sessione è finta e il ruolo viaggia in `X-Assieme-Ruolo`. Nel backend:

- login e sessione con Supabase Auth (email/password; l'invito nasce `invitato` e diventa attivo al primo accesso — contratto Fase 5 FE);
- il JWT porta `tenant_id` e `ruolo` (`operatore` | `amministratore`) in `app_metadata` — mai modificabili dall'utente;
- le rotte da amministratore rifiutano con **403** esattamente dove il mock già lo fa (impostazioni in scrittura, utenti, MCP, documenti di riferimento);
- su sé stessi né ruolo né stato (**409**, contratto Fase 5);
- il **Gestore piattaforma** (RF-A-06) è un ruolo di piattaforma fuori dai tenant, usato solo dal back-office (Fase 1).

L'interceptor FE che oggi aggiunge l'header di sviluppo diventerà l'interceptor che allega il token: è l'unico ritocco FE previsto da tutto questo piano, ed era già messo in conto (`conversazioni-api.ts`: «domani l'autenticazione vera lo firmerà senza codice dedicato»).

---

## 4. I documenti vivono in due mondi

È la decisione architetturale centrale, e discende da `ASSIEME-motore-agentico.md`: **il filesystem È l'indice**. Postgres cataloga, Storage conserva, ma il motore naviga un albero di file Markdown.

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
- **Il progetto è condiviso con altre applicazioni** (tabelle in `public`, schema `koya`): tutto ASSIEME vive nello **schema `assieme`** — tabelle e funzioni. `public` non si tocca.
- **Ruolo dedicato `assieme_app`**: login del worker e dei test, proprietario delle sole tabelle ASSIEME (quindi bypassa la RLS *solo* lì), membro di `authenticated` per il `set local role` di `conIdentita`. La password di `postgres` non è mai servita. **Ogni migrazione futura che crea tabelle deve chiudersi con `alter table … owner to assieme_app`.**
- **JWT legacy HS256**: il progetto ha il JWKS vuoto; la verifica usa `SUPABASE_JWT_SECRET` in `.env`. Se il progetto migrasse alle signing key, si toglie la variabile e il plugin passa da solo al JWKS.
- **`supabase db push` è rotto su questo progetto** (il ruolo `cli_login_postgres` della piattaforma non è più alterabile): le migrazioni si applicano via Management API (`POST /v1/projects/:ref/database/query`) e si registrano a mano in `supabase_migrations.schema_migrations`.
- **La connessione diretta passa dal session pooler** (`aws-1-eu-north-1.pooler.supabase.com:5432`, utente `assieme_app.<ref>`): LISTEN/NOTIFY non attraversa il transaction pooler. Password nel `DATABASE_URL` percent-encoded.
- **La RLS filtra, non lancia**: una scrittura senza policy tocca 0 righe senza errore. I test di isolamento contano le righe, non aspettano eccezioni.
- **PostgREST espone anche `assieme`** (`db_schema: public,graphql_public,koya,assieme`): nei futuri PATCH di configurazione vanno **preservati gli schemi altrui**.
- Codici d'errore aggiunti al vocabolario del mock: `NON_AUTENTICATO` (401, il mock non aveva autenticazione) e `DATI_NON_VALIDI` (400 di validazione).

### Fase 1 — Archivio Pubblico e ingestion · ~8 giorni · RF-A-01…A-07, A-09

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

- Storage: bucket e layout dei path; servizio file (PDF per il visualizzatore — il contratto FE apre il PDF sul passaggio citato)
- **Back-office (RF-A-06), forma minima:** CLI/script di caricamento massivo con metadati, rigenerazione indici, ritiro documenti — un'interfaccia grafica interna è rimandata finché il team piattaforma è chi sviluppa
- Pipeline di conversione con Haiku: prompt, ancore di pagina, verifica di fedeltà a campione sui PDF del pilota; `INDICE.md` generati con sinonimi commerciali
- Endpoint di navigazione e ricerca: la logica di `mocks/api-stub.mjs` (ricerca insensibile agli accenti, filtri opzionali, ordine di lettura del set informativo, edizioni, preferiti, paginazione) portata su SQL
- RF-A-08 (segnalazione documento mancante/errato): tabella + endpoint, S ma economico qui

### Fase 2 — Archivio Privato · ~6 giorni · RF-B-01…B-05, B-07…B-09

- Upload (singolo e multiplo) → pipeline di ingestion con stati e polling (contratto `mocks/archivio-privato.mjs`); classificazione assistita come proposta
- Organizzazione: etichette, rinomina, eliminazione (che rimuove **anche** md e cache del worker — la cancellazione è effettiva, RNF-03)
- Limiti per tenant (RF-B-08): spazio e dimensione massima, applicati all'upload, esposti al FE
- Promozione a documento di riferimento (RF-B-09): il governo sta nelle Istruzioni, qui solo il flag e la scheda che lo indica
- Visibilità per-utente (RF-B-07): lo schema la prevede dal principio (colonna `visibilita`), l'applicazione si attiva se il pilota la chiede (punto aperto §6.5)

### Fase 3 — Motore agentico e chat · ~10 giorni · RF-C-01…C-09, RF-D-05/08/15, RF-G-04

La fase più delicata del piano: il §4.3 per intero, più il ponte SSE del §3.1.

- CRUD conversazioni, contesto documentale, allegati di conversazione (riuso pipeline, collocazione fuori archivio)
- Job di interrogazione: workspace isolata, sessione SDK coi soli tool di lettura, prompt di sistema con le regole inderogabili e il DNA d'Agenzia (istruzioni e ricordi letti dal DB — le tabelle esistono dalla Fase 0, i pannelli di gestione arrivano in Fase 6/8)
- Streaming SSE conforme a `EventoStream`, riconciliazione `messaggioUtenteId`, persistenza solo a risposta completa, annullamento esplicito
- Validazione dell'output: citazioni verso documenti reali del contesto, con posizione; provenienza dichiarata; precedenza istruzioni > ricordi (RF-G-04) nel prompt
- `audit_risposte` e `consumi` popolati da subito: i numeri per il router futuro si raccolgono dal primo giorno
- RF-C-09 (proposta di documenti pertinenti senza referenziazione): il motore può cercare nell'Archivio Pubblico della workspace e proporre — con conferma, come chiede il requisito

### Fase 4 — Generazione documenti su template · ~7 giorni · RF-D-10…D-13, RF-C-10

Isolata perché tre moduli la riusano (chat, tabelle, agenti) e perché la fedeltà per formato ha complessità molto diversa (punto aperto §6.11).

- `generazione/`: motore a segnaposto per **PDF, DOCX, XLSX** (PPTX rimandato, già deciso in Fase 5 FE); librerie da scegliere qui con una prova per formato — il contratto pretende file *apribili e fedeli al template*, i mock generavano file minimi
- Gestione template: libreria precaricata, template del tenant, identità visiva (logo, colori, contatti), predefinito per tipologia; **anteprima sempre PDF** qualunque sia il formato (contratto Fase 5 FE)
- Esportazione della chat (RF-C-10): endpoint `…/messaggi/:id/esporta` con download vero
- I template sono file nello Storage + riga di catalogo; la generazione è sincrona se sta sotto qualche secondo, altrimenti passa in coda con lo stesso pattern di polling già noto al FE

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
- Documentazione di configurazione per i client principali + avvertenza RF-F-05 (le risposte nel client esterno non sono governate dalle istruzioni ASSIEME); l'esposizione delle istruzioni come risorsa MCP opzionale: C, dopo-lancio
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
