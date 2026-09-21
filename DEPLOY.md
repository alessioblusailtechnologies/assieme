# Deploy di VELIA

Tre pezzi, tre posti:

| Pezzo | Dove | Perché |
|---|---|---|
| Sito (Astro) | Cloudflare Pages | già lì |
| App (Angular, `fe-angular/`) | **Render** Static Site nel Blueprint, `app.sonovelia.it` (dev: `app-dev.sonovelia.it`) | statica, gratis, stesso pannello di API e worker; Cloudflare Pages resta l'alternativa (§2) |
| Backend (`be-node/`: API + worker + sandbox) | **Render**, regione **Francoforte**, `api.sonovelia.it` (dev: `api-dev.sonovelia.it`; la guida Railway sotto resta come riferimento, i passi sono equivalenti) | processi sempre accesi, processo figlio dell'Agent SDK, stream SSE, disco per le workspace: niente serverless. Residenza UE (RNF-03) |
| Database e Storage | Supabase: `hcxiloivukbdcfcugksg` per dev e locale, un progetto suo per la produzione (§4) | |

Due ambienti, due Blueprint dallo stesso repo:

| Ambiente | Ramo | File | Servizi | Domini |
|---|---|---|---|---|
| dev | `develop` | `render.yaml` | `velia-api`, `velia-worker`, `velia-sandbox`, `velia-app` | `api-dev.` / `app-dev.sonovelia.it` |
| produzione | `main` | `render.prod.yaml` | gli stessi col suffisso `-prod` | `api.` / `app.sonovelia.it` |

Un file per ambiente perché a ogni sync il Blueprint riscrive le variabili con `value:`: un indirizzo corretto a mano nel pannello tornerebbe quello del file.

---

## 1. Backend su Render (scelto il 25/08/2026)

Ogni Blueprint definisce API e worker dalla stessa immagine `be-node/Dockerfile`, più il runner della sandbox (§2b) e il sito dell'app (§2):

1. Render → *New* → *Blueprint* → connetti il repo GitHub, scegli il ramo e il *Blueprint Path* (`render.yaml` per dev, `render.prod.yaml` per la produzione). Nascono l'API (Web Service, Docker, health check `/api/salute`, piano Starter) e il worker (Background Worker, Docker, disco 5 GB su `/app/.velia-worker`, piano Standard: 2 GB di memoria per il processo figlio dell'Agent SDK). Regione Francoforte.
2. Al primo *Apply* Render chiede i valori con `sync: false`: Supabase (`DATABASE_URL` in **modalità sessione**, porta 5432), le chiavi Anthropic, Mistral e Resend, e per la sandbox la sua chiave Anthropic dedicata. Dopo la creazione la sync non li tocca più; le chiavi facoltative (DeepSeek, HostYourAI, AKI) si aggiungono dal pannello e la sync le conserva.
3. *Custom Domains*: il file di produzione li dichiara (`domains`); Render dà il CNAME da mettere su Cloudflare DNS (proxy Cloudflare va bene, lo stream SSE manda un battito ogni pochi secondi).
4. Deploy automatico a ogni push sul ramo del Blueprint. Controllo: `curl https://api.sonovelia.it/api/salute` (la `versione` è il commit deployato); nei log del worker «avviato, in ascolto sulla coda».

Da sapere su Render: `PORT` la assegna lui (il server la legge); i piani gratuiti si addormentano e non hanno dischi, quindi non vanno bene né per l'API (SSE) né per il worker; il disco persistente fa sì che il worker non possa scalare a più istanze (e va bene così: la coda è una).

## 1b. Backend su Railway (alternativa, stessa immagine)

Un'immagine sola (`be-node/Dockerfile`) e **due servizi** dallo stesso repo: il comando di avvio li distingue.

### Primo avvio (una volta)

1. Railway → *New Project* → *Deploy from GitHub repo* → questo repository.
2. Servizio **api**:
   - *Settings → Source*: root directory `be-node`, config file `railway.api.json`.
   - *Settings → Networking*: genera il dominio, poi *Custom domain* `api.sonovelia.it` (Railway dà il CNAME da mettere su Cloudflare DNS: in modalità proxy va bene, il ponte SSE manda un battito ogni pochi secondi e il proxy non chiude).
   - Regione: Amsterdam.
3. Servizio **worker**: *New service* dallo stesso repo, root `be-node`, config file `railway.worker.json`, regione Amsterdam. Nessuna porta pubblica.
   - *Volume*: monta un volume su `/app/.velia-worker` (cache delle workspace; ricostruibile dallo Storage, ma evita di riscaricare i documenti a ogni job). 2-5 GB bastano.
   - *Settings → Resources*: memoria almeno **2 GB** (l'Agent SDK lancia un processo figlio durante i job).
4. Variabili (su entrambi i servizi, salvo dove indicato). Usa *Shared variables* del progetto e referenziale:

   | Variabile | Valore | Note |
   |---|---|---|
   | `SUPABASE_URL` | `https://hcxiloivukbdcfcugksg.supabase.co` | |
   | `SUPABASE_ANON_KEY` | dalla dashboard Supabase | |
   | `SUPABASE_SERVICE_ROLE_KEY` | dalla dashboard Supabase | segreto |
   | `SUPABASE_JWT_SECRET` | dalla dashboard Supabase (chiavi legacy HS256) | segreto |
   | `DATABASE_URL` | pooler Supabase in **modalità sessione** (porta 5432) | il worker usa LISTEN/NOTIFY: non il transaction pooler |
   | `ANTHROPIC_API_KEY` | chiave Anthropic | segreto |
   | `HOSTYOURAI_API_KEY` | chiave HostYourAI (`hyai-…`) | opzionale: senza, GLM/Kimi restano schede |
   | `DEEPSEEK_API_KEY` | chiave DeepSeek (`sk-…`) | serve al livello Avanzato: sull'api lo rende selezionabile, sul worker fa rispondere la chat **e dal 21/09/2026 trascrive i documenti** dei tenant su Avanzato. Senza, quei documenti finiscono in errore (gli altri no). Server in Cina: i documenti escono dall'UE |
   | `MODELLO_LETTURA_VISIVA` | vuoto | di norma vuoto: chi trascrive segue il livello del tenant (Medio Sonnet, Avanzato DeepSeek, Boost Opus). Valorizzato forza lo stesso modello per tutti: `claude-opus-5` riporta tutto su Anthropic |
   | `MODELLO_INGESTION` | `claude-opus-5` | default; chi classifica e chi ricontrolla le pagine segnalate |
   | `TESTIMONI_PAROLE_TOLLERATE` | `5` | default; quante parole di scarto i testimoni lasciano passare prima del secondo sguardo |
   | `RESEND_API_KEY` | chiave Resend (`re_…`) | opzionale: senza, «Invia email» risponde 503 in produzione (in locale l'invio è simulato nel log) |
   | `EMAIL_MITTENTE` | `Velia <noreply@sonovelia.it>` | default; il dominio va verificato su Resend |
   | `MISTRAL_API_KEY` | chiave Mistral | opzionale: senza, la dettatura nel composer risponde 503 |
   | `MODELLO_MOTORE` | `claude-opus-5` | default |
   | `MOTORE_EFFORT` | `medium` | opzionale, vedi costi |
   | `BASE_LINK_PAGINE` | `https://api.sonovelia.it` | la radice dei link delle pagine condivise (`/p/<token>`), servite dall'API; su api e worker |
   | `CORS_ORIGINI` | `https://app.sonovelia.it` | **solo api** |
   | `LOG_LIVELLO` | `info` | |

   `PORT` la assegna Railway; `CARTELLA_WORKER` è già `/app/.velia-worker` nell'immagine.
5. Deploy: parte da solo al push su `main`. Health check dell'API su `/api/salute`.

### Migrazioni

Non girano al deploy: si applicano come sempre da locale con `node tools/applica-migrazione.mjs supabase/migrations/<file>.sql` (Management API + ledger), **prima** di pushare il codice che le richiede.

### Controlli dopo il primo deploy

```
curl https://api.sonovelia.it/api/salute            # {"stato":"ok"}
```
Poi login dall'app e una domanda in chat: il job passa dal worker (log del servizio worker: «avviato, in ascolto sulla coda»).

---

## 2. App: Render Static Site (nel Blueprint) o Cloudflare Pages

Col Blueprint nasce anche **velia-app** (Static Site: root `fe-angular`, build `npm ci && npx ng build`, publish `dist/fe-angular/browser`, `NODE_VERSION=24`, rewrite `/*` → `/index.html` per il routing della SPA). Custom domain `app.sonovelia.it` dal pannello del servizio, CNAME su Cloudflare DNS. L'indirizzo dell'API lo scrive il build in `config.js` dalla variabile **`VELIA_API_BASE`** del servizio (`https://api.sonovelia.it/api` in produzione). **Ambiente dev su Render** (progetto separato dal ramo `develop`): sul sito statico `VELIA_API_BASE=https://api-dev.sonovelia.it/api`, sull'API dev `CORS_ORIGINI` = l'origine dell'app dev; stesso `render.yaml`, cambiano solo ramo e variabili.

In alternativa, Cloudflare Pages:

1. Cloudflare → *Workers & Pages* → *Create* → *Pages* → connetti il repo.
2. Impostazioni di build:
   - Root directory: `fe-angular`
   - Build command: `npm ci && npx ng build`
   - Build output directory: `dist/fe-angular/browser`
   - Variabile `NODE_VERSION` = `24`
3. *Custom domains*: `app.sonovelia.it`.
4. Dove sta l'API lo dice **`public/config.js`** (`window.veliaApiBase`), letto a runtime: oggi `https://api.sonovelia.it/api`. Per un ambiente di prova basta cambiare quel file, senza ricompilare.
5. `public/_redirects` manda ogni percorso a `index.html` (routing della SPA).

---

## 2b. Sandbox documentale: il runner su Render (dal 29/08/2026)

La generazione di documenti da template gira nel servizio privato **`velia-sandbox`** del Blueprint (`type: pserv`, stessa immagine `be-node/sandbox/Dockerfile`, piano con 4 GB), sempre acceso, sulla rete privata di Render: il worker lo raggiunge con `SANDBOX_AVVIATORE=render`, `SANDBOX_URL` (host e porta interni, `fromService`) e `SANDBOX_TOKEN` (segreto generato da Render e condiviso ai due servizi). Un job per volta: `POST /reset` svuota `/lavoro` fra un job e l'altro e risponde 409 finché una sessione è in corso (il worker aspetta fino a `SANDBOX_ATTESA_MS`, 10 minuti). Sul runner non ci sono database né Storage: solo la workspace del job corrente. Render non concede `NET_ADMIN`, quindi il runner parte con `SANDBOX_RETE=aperta`: la CLI e i comandi del modello girano come utente `lavoro` ma con la rete del container (la chiave Anthropic resta nel processo `proxy`, con un altro utente). Variabili del servizio: `PORT=10000`, `SANDBOX_RETE=aperta`, `SANDBOX_TOKEN` (generato), `ANTHROPIC_API_KEY` (dedicata, con tetto di spesa). Per più documenti in parallelo si alzano le istanze del servizio.

In locale: `docker run -d -e SANDBOX_RETE=aperta -e PORT=10000 -e SANDBOX_TOKEN=<segreto> -e ANTHROPIC_API_KEY=... -p 127.0.0.1:18080:10000 velia-sandbox` e nel `.env` del worker `SANDBOX_AVVIATORE=render`, `SANDBOX_URL=http://127.0.0.1:18080`, `SANDBOX_TOKEN=<segreto>`; oppure `SANDBOX_AVVIATORE=docker` (un container per job).

**Dal 21/09/2026 la sandbox è Claude Code puro e completo** (decisione del committente: prima la qualità, la sicurezza la darà un'infrastruttura adeguata): prompt di sistema e strumenti di Claude Code (rete, WebFetch/WebSearch, sotto-agenti compresi), tutte le skill di `anthropics/skills` più quelle di VELIA in `be-node/sandbox/skills/`, il worker aggiunge al prompt solo i fatti del lavoro (`istruzioni.ts`), tetti larghi (`SANDBOX_MAX_TURNI=200`, `SANDBOX_BUDGET_USD=10`), e la rete del modello è **aperta per impostazione predefinita** ovunque. Il namespace isolato resta su richiesta con `SANDBOX_RETE=isolata` (serve `NET_ADMIN`). Il marchio dell'agenzia lo integra la sandbox su ogni formato (`/lavoro/carta/`): VELIA non timbra più i documenti di «Genera da modello».

## 2c. Sandbox su Fly.io (dismessa il 29/08/2026)

Le Machine Fly morivano a 300 s esatti dallo start, anche da ferme e con `autostop` spento (stop richiesto via API da qualcosa fuori dal nostro codice; causa non trovata). L'avviatore `fly` resta nel codice per chi volesse riprovare; quanto segue è la configurazione di allora.

Render (o Railway) tiene API e worker; l'Esportazione elaborata (il motore documentale con Python, LibreOffice e Chromium) gira in una **Machine Fly.io per job**, ad Amsterdam, senza rete verso i nostri servizi e senza segreti: il worker la crea, le manda i file, esegue i comandi del modello, ritira i documenti e la distrugge. Si paga solo il tempo delle Machine attive.

Fatto una volta (25/08/2026, org `personal`): app `velia-sandbox` creata via Machines API, IPv4 condiviso e IPv6 allocati (servono al worker per raggiungere la Machine passando dal proxy di Fly con l'intestazione `fly-force-instance-id`).

Aggiornare l'immagine (ogni volta che cambia `be-node/sandbox/`):

```
cd be-node
docker build -t velia-sandbox -f sandbox/Dockerfile sandbox
echo "$FLY_API_TOKEN" | docker login registry.fly.io -u x --password-stdin
docker tag velia-sandbox registry.fly.io/velia-sandbox:latest
docker push registry.fly.io/velia-sandbox:latest
```

Variabili del **worker** (già nel `render.yaml`): `SANDBOX_AVVIATORE=fly`, `SANDBOX_IMMAGINE=registry.fly.io/velia-sandbox:latest`, `FLY_API_TOKEN` (token di organizzazione), `FLY_APP_SANDBOX=velia-sandbox`, `FLY_REGIONE=ams`, **`ANTHROPIC_API_KEY_SANDBOX`** (una chiave dedicata, creata in un workspace Anthropic separato con tetto di spesa mensile: è quella che entra nella Machine, dietro un proxy locale; senza, si usa `ANTHROPIC_API_KEY`). Senza `SANDBOX_AVVIATORE` l'Esportazione elaborata si dichiara non disponibile e il resto funziona.

Dentro la Machine gira Claude Code (Agent SDK) con le skill di Anthropic; fino al 21/09/2026 in un network namespace isolato che raggiungeva solo il proxy della chiave, da allora con la rete aperta salvo `SANDBOX_RETE=isolata` (vedi sopra). In locale, con Docker, il container parte con `--cap-add NET_ADMIN --cap-add SYS_ADMIN`, che servono solo al namespace isolato.

Prova dal locale: `npx tsx tools/collaudo-elaborata.ts pdf "<istruzioni>" [template]` con `SANDBOX_AVVIATORE=fly` in `.env`.

## 3. Cose da sapere

- **Segreti**: solo nelle variabili della piattaforma (Render/Railway), mai nell'immagine né nel repo. `.env` resta locale.
- **CORS**: l'API accetta solo le origini in `CORS_ORIGINI`. Il token viaggia in `Authorization`, non nei cookie.
- **Costi**, per ambiente: Render Starter (7 $) per l'API + Standard (25 $) per il worker + disco (~1 $) + Pro (4 GB, ~85 $) per la sandbox; il sito statico è gratis; in produzione Supabase Pro (25 $). I costi AI sono in `velia.consumi`, per tenant.
- **Residenza dei dati**: Render Francoforte e Supabase in UE; Opus via API Anthropic diretta passa dagli USA (vedi la nota nel piano su Bedrock Francoforte); **DeepSeek, in Cina, vede la chat e ogni pagina dei documenti caricati dai tenant sul livello Avanzato** (dal 21/09/2026 la trascrizione segue il livello: chi resta su Medio o Boost non manda niente in Cina). È una scelta dell'agenzia, e la scheda del livello deve dirlo; appena c'è un instradamento europeo si cambia il modello dietro ad Avanzato in `contratto/modelli.ts`. Da sistemare prima della produzione: sub-responsabile nel registro dei trattamenti e informativa alle agenzie.
- **Aggiornare**: push su `develop` → dev, push su `main` → produzione. Le migrazioni prima, a mano, su **ciascuno** dei due progetti Supabase.

---

## 4. La produzione: il primo avvio

Al 13/09/2026 la produzione non c'è: `api.sonovelia.it` e `app.sonovelia.it` non risolvono. L'ordine conta: database, chiavi, codice su `main`, Render, DNS.

### 4.1 Supabase: un progetto suo

Non quello di dev, per due ragioni che la configurazione non aggira:

- la coda `lavori` è scritta per nome nelle funzioni SQL dei cron (agenti, memoria): sullo stesso database il worker dev la leggerebbe e lavorerebbe i job dei clienti col codice di `develop`;
- nel progetto dev ci sono il tenant demo e gli utenti con la password demo.

Piano Pro (backup giornalieri, niente pausa per inattività), regione UE. Poi:

1. **Il ledger delle migrazioni.** Lo crea la CLI al primo push, quindi su un progetto nuovo può mancare. Nel SQL editor:
   ```sql
   create schema if not exists supabase_migrations;
   create table if not exists supabase_migrations.schema_migrations (
     version text primary key, statements text[], name text
   );
   ```
2. **Le migrazioni**, tutte e in ordine. Le variabili della shell vincono su `be-node/.env` (`process.loadEnvFile` non sovrascrive quelle già presenti), quindi lo strumento di sempre si punta al progetto nuovo senza toccare il file. Da `be-node/`, in PowerShell:
   ```powershell
   $env:SUPABASE_PROJECT_REF = '<ref di produzione>'
   $env:SUPABASE_ACCESS_TOKEN = '<token>'
   foreach ($f in Get-ChildItem supabase/migrations/*.sql | Sort-Object Name) {
     node tools/applica-migrazione.mjs $f.FullName
     if ($LASTEXITCODE -ne 0) { break }
   }
   ```
   Le migrazioni già registrate si saltano: dopo un errore il ciclo si rilancia così com'è.
3. **La password di `velia_app`.** Se il ruolo non c'è, `20260807125900_ruolo_app.sql` lo crea con la password segnaposto degli ambienti effimeri. Subito dopo le migrazioni: `alter role velia_app with password '<password forte>';`. `DATABASE_URL` diventa `postgresql://velia_app.<ref>:<password>@<host del pooler>:5432/postgres`.
4. **Il bucket `archivio`**, privato (*Storage → New bucket*): nessuna migrazione lo crea.
5. **Auth**: *Site URL* `https://app.sonovelia.it`; iscrizioni pubbliche spente (gli utenti li crea l'API con la service role); SMTP personalizzato (Resend va bene) se si useranno gli inviti, vedi §4.6.
6. **L'Archivio Pubblico si copia dal progetto dev**, non si ricarica dagli alberi locali. Dev è lo stato verificato: secondo sguardo fatto, test del catalogo sui totali, manifesto e righe coincidono. Gli alberi di `local-ingestion/` sono cartelle di lavoro di una macchina sola, fuori da git, divise in tre alberi e con lavori in corso: al 13/09/2026 quattro INDICE ritoccati dopo il caricamento e 20 file di set non ancora caricati. Ricaricare da lì porterebbe in produzione lavoro non verificato.
   Al 13/09/2026 in dev: 354 documenti, 93 edizioni, 9 compagnie con documenti (12 in anagrafica), 10 rami; sotto `archivio-pubblico/` nel bucket 541 file per 208 MB. La copia, in quest'ordine:
   - `velia.compagnie` e `velia.rami`, tutte le righe;
   - `velia.documenti` con `archivio = 'pubblico'`, tutte le colonne così come sono;
   - gli oggetti del bucket `archivio` sotto `archivio-pubblico/` (PDF, `.md`, INDICE).

   Non si copiano gli oggetti `tenant/…` (i documenti privati del tenant demo) né `seed.sql`, che porta con sé il tenant demo; il glossario dei rischi viene dal codice. Lo strumento della copia è **da scrivere** (idempotente, confronto per eTag e peso, a secco per default). Dopo il primo avvio serve per ogni set nuovo: si carica in dev come oggi, poi si promuove in produzione con la copia.
   **Mai** `tools/seed-utenti.mjs` in produzione: crea gli utenti demo con una password scritta nel codice.
7. **Il primo tenant e il suo amministratore**, a mano: non c'è uno strumento. *Authentication → Add user* con email in minuscolo, password e *Auto Confirm*; poi:
   ```sql
   insert into velia.tenant (nome) values ('<ragione sociale>') returning id;

   update auth.users
      set raw_app_meta_data = raw_app_meta_data
          || jsonb_build_object('tenant_id', '<id del tenant>', 'ruolo', 'amministratore')
    where email = '<email>';

   insert into velia.utenti (id, tenant_id, nome, cognome, email, ruolo)
   select id, '<id del tenant>', '<nome>', '<cognome>', email, 'amministratore'
     from auth.users where email = '<email>';
   ```
   Tenant e ruolo arrivano all'API dal JWT (`app_metadata`): un utente senza è respinto con 403. Il profilo nasce `invitato` e diventa `attivo` al primo accesso.

### 4.2 Account e chiavi

| Servizio | Cosa | Dove va |
|---|---|---|
| Anthropic | un workspace di produzione e due chiavi: una per API e worker, una per la sandbox con tetto di spesa | `ANTHROPIC_API_KEY` su api e worker; `ANTHROPIC_API_KEY` su `velia-sandbox-prod` |
| Supabase | URL, anon key, service role key, `DATABASE_URL` | api e worker |
| Mistral | una chiave: dettatura (api) e testimone OCR (worker) | api e worker |
| Resend | una chiave, e il dominio `sonovelia.it` verificato | solo api |
| DeepSeek, HostYourAI, AKI | facoltative, dal pannello | api e worker |

`SUPABASE_JWT_SECRET` serve solo se il progetto usa le chiavi JWT legacy HS256: senza, l'API verifica i token col JWKS del progetto. Se il progetto dà solo le chiavi API nuove (`sb_publishable_…` / `sb_secret_…`), provarle prima dal locale, con le variabili nella shell: un login e una domanda.

### 4.3 Codice e Render

1. `develop` in `main`, con la CI `be` verde. Prima il merge e poi il Blueprint: un Blueprint creato su un `main` vecchio deploya il codice vecchio.
2. *New → Blueprint* → questo repo, ramo `main`, *Blueprint Path* `render.prod.yaml`; i valori `sync: false` sono quelli di §4.2.
3. Da qui ogni push su `main` va in produzione: le migrazioni sul progetto di produzione vanno applicate prima.

### 4.4 DNS (Cloudflare, zona `sonovelia.it`)

- `api` e `app`: i CNAME che Render mostra per `velia-api-prod` e `velia-app-prod`;
- i record TXT (SPF, DKIM) che Resend dà per il mittente `noreply@sonovelia.it`;
- `chat.sonovelia.it` **non** va nel DNS: è il dominio finto delle email degli ospiti, a cui nessuno scrive;
- sul progetto Pages del sito, `APP_URL=https://app.sonovelia.it` e un nuovo build: finché è vuota il sito non mostra «Accedi».

### 4.5 Collaudo

1. `curl https://api.sonovelia.it/api/salute`: la `versione` è l'ultimo commit di `main`.
2. Login dell'amministratore e una domanda in chat (log del worker: «avviato, in ascolto sulla coda»).
3. Un documento caricato arriva a `pronto`.
4. «Genera da modello» consegna il file; «Invia email» arriva; la dettatura trascrive.
5. Un link `/p/…` e una chat cliente aprono `api.` e `app.sonovelia.it`, non i domini dev.
6. Un controllo di disponibilità esterno su `/api/salute`.

### 4.6 Buchi noti

- **Inviti e password.** L'app ha solo il login con email e password: nessuna pagina accetta il link d'invito né recupera una password. Quando un amministratore invita un collega, Supabase manda un link che l'app non gestisce e l'utente resta senza password. Finché la pagina non c'è, la password la imposta chi ha la service role (Admin API, `auth.admin.updateUserById`).
- **DeepSeek**: con la chiave, i documenti del livello Avanzato escono dall'UE.
