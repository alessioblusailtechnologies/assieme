# Deploy di VELIA

Tre pezzi, tre posti:

| Pezzo | Dove | Perché |
|---|---|---|
| Sito (Astro) | Cloudflare Pages | già lì |
| App (Angular, `fe-angular/`) | Cloudflare Pages, `app.sonovelia.it` | è statica: CDN, TLS e DNS sullo stesso account del sito |
| Backend (`be-node/`: API + worker) | Railway, regione **Amsterdam** (`europe-west4`), `api.sonovelia.it` | processi sempre accesi, processo figlio dell'Agent SDK, stream SSE, disco per le workspace: niente serverless. Residenza UE (RNF-03) |
| Database e Storage | Supabase (già in cloud, progetto `hcxiloivukbdcfcugksg`) | invariato |

---

## 1. Backend su Railway

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
   | `MODELLO_MOTORE` | `claude-opus-5` | default |
   | `MOTORE_EFFORT` | `medium` | opzionale, vedi costi |
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

## 2. App su Cloudflare Pages

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

## 2b. Sandbox dell'Esportazione elaborata su Fly.io

Railway resta per API e worker; l'Esportazione elaborata (il motore documentale con Python, LibreOffice e Chromium) gira in una **Machine Fly.io per job**, ad Amsterdam, senza rete verso i nostri servizi e senza segreti: il worker la crea, le manda i file, esegue i comandi del modello, ritira i documenti e la distrugge. Si paga solo il tempo delle Machine attive.

Fatto una volta (25/08/2026, org `personal`): app `velia-sandbox` creata via Machines API, IPv4 condiviso e IPv6 allocati (servono al worker per raggiungere la Machine passando dal proxy di Fly con l'intestazione `fly-force-instance-id`).

Aggiornare l'immagine (ogni volta che cambia `be-node/sandbox/`):

```
cd be-node
docker build -t velia-sandbox -f sandbox/Dockerfile sandbox
echo "$FLY_API_TOKEN" | docker login registry.fly.io -u x --password-stdin
docker tag velia-sandbox registry.fly.io/velia-sandbox:latest
docker push registry.fly.io/velia-sandbox:latest
```

Variabili del **worker** su Railway: `SANDBOX_AVVIATORE=fly`, `SANDBOX_IMMAGINE=registry.fly.io/velia-sandbox:latest`, `FLY_API_TOKEN` (token di organizzazione), `FLY_APP_SANDBOX=velia-sandbox`, `FLY_REGIONE=ams`, **`ANTHROPIC_API_KEY_SANDBOX`** (una chiave dedicata, creata in un workspace Anthropic separato con tetto di spesa mensile: è quella che entra nella Machine, dietro un proxy locale; senza, si usa `ANTHROPIC_API_KEY`). Senza `SANDBOX_AVVIATORE` l'Esportazione elaborata si dichiara non disponibile e il resto funziona.

Dentro la Machine gira Claude Code (Agent SDK) con le skill documentali di Anthropic, in un network namespace isolato che raggiunge solo il proxy della chiave (nessun accesso a Internet dal modello). In locale, con Docker, il container parte con `--cap-add NET_ADMIN --cap-add SYS_ADMIN` per creare lo stesso namespace.

Prova dal locale: `npx tsx tools/collaudo-elaborata.ts pdf "<istruzioni>" [template]` con `SANDBOX_AVVIATORE=fly` in `.env`.

## 3. Cose da sapere

- **Segreti**: solo nelle variabili di Railway, mai nell'immagine né nel repo. `.env` resta locale.
- **CORS**: l'API accetta solo le origini in `CORS_ORIGINI`. Il token viaggia in `Authorization`, non nei cookie.
- **Costi**: Railway a consumo (~15-25 $/mese per i due servizi con poco traffico); Pages gratis. I costi AI sono in `velia.consumi`, per tenant.
- **Residenza dei dati**: Railway Amsterdam e Supabase in UE; Opus via API Anthropic diretta passa dagli USA (vedi la nota nel piano su Bedrock Francoforte).
- **Aggiornare**: push su `main` → Railway e Pages ricostruiscono. Le migrazioni prima, a mano.
