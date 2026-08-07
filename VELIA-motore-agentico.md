# VELIA — Il Motore Agentico

| Campo | Valore |
|---|---|
| Prodotto | VELIA |
| Versione documento | 0.1 (bozza) |
| Data | 06/08/2026 |
| Stato | In lavorazione |
| Autore | Blusail Technologies S.R.L.S. |
| Documenti collegati | `VELIA-analisi-requisiti.md` (v0.9), `chat-analisi.txt` |

Questo documento fissa l'architettura del motore AI di VELIA: come il sistema
legge i documenti, come risponde, e perché è costruito così. Risolve il punto
aperto §6.3 dell'analisi dei requisiti ("Architettura di retrieval") e
costituisce la base tecnica su cui verrà progettato il backend.

---

## 1. La decisione: retrieval agentico su filesystem

VELIA non usa il RAG classico a chunking e non invia i documenti nel contesto
delle chiamate API. Usa un terzo approccio: **i documenti stanno fermi su disco,
ed è il modello che li naviga** — con gli stessi strumenti con cui uno
sviluppatore naviga un codebase: `grep`, `glob`, lettura di file.

I due approcci scartati, e perché:

**RAG a chunking.** Il documento viene spezzato in frammenti, indicizzato per
similarità semantica, e a ogni domanda si recuperano i k frammenti "più
simili". I problemi sono strutturali, non di implementazione: un chunking
sbagliato distrugge informazione (una tabella di garanzie spezzata a metà); un
retrieval per similarità è un colpo secco — se recupera il frammento sbagliato
non c'è correzione, il modello risponde su ciò che ha ricevuto; e il frammento
arriva fuori dal suo contesto (un massimale senza sapere di quale garanzia, di
quale variante di prodotto). In un dominio dove un'informazione errata su una
garanzia ha impatto diretto sul lavoro dell'intermediario (RNF-01), un sistema
che può sbagliare *silenziosamente* è inaccettabile.

**Contesto integrale via API.** Tutti i documenti referenziati vengono inviati
nel prompt a ogni interrogazione. Funziona su due documenti, non scala: una
conversazione con dieci set informativi (RF-C-07 impone di superare largamente
il limite di 5 dei competitor) significa centinaia di migliaia di token pagati
a ogni messaggio, latenze da decine di secondi anche per domande banali, e un
costo per query incompatibile con RNF-05.

**Retrieval agentico.** Il modello riceve la domanda e una directory di lavoro,
e cerca da sé: greppa un termine, valuta i risultati, apre le sezioni
promettenti, si accorge che il documento usa un sinonimo ("scoperto" invece di
"franchigia"), riprova, compone la risposta. È **ricerca iterativa e
auto-correttiva**: dove il RAG fa un tentativo e se sbaglia amen, qui il
modello vede che il risultato non basta e cambia strategia. Legge il testo
vero, intero, nel suo contesto — non un frammento deciso da un algoritmo di
chunking sei mesi prima.

Questo approccio è reso praticabile da una capability recente e in rapido
miglioramento: i modelli attuali sono addestrati intensivamente proprio sul
loop di ricerca con tool (è il motore di Claude Code, che di questo pattern è
la dimostrazione su scala). VELIA costruisce sul punto di massima forza dei
modelli, non contro le loro debolezze.

---

## 2. Anatomia di un'interrogazione

Il caso pilota: l'operatore ha referenziato il set informativo Cattolica
"Active Veicoli AUTOPIÙ" (Archivio Pubblico) e un preventivo Unipol caricato
nell'Archivio Privato, e chiede: *"confronta le esclusioni della garanzia
cristalli"*.

1. Il backend accoda un **job** con la domanda, i path dei documenti
   referenziati e l'identità del tenant.
2. Un **worker** avvia una sessione dell'**Agent SDK** (lo stesso motore della
   CLI di Claude, in forma programmatica) con:
   - *working directory*: uno spazio che contiene **solo** l'archivio del
     tenant e l'Archivio Pubblico in sola lettura;
   - *tool consentiti*: `Grep`, `Glob`, `Read` — e nient'altro: niente
     scrittura, niente shell, niente rete;
   - *prompt di sistema*: le regole del mestiere di VELIA (obbligo di
     citazione, dichiarazione di non-copertura) più il **DNA d'Agenzia** del
     tenant — istruzioni personalizzate e ricordi pertinenti (Moduli D e G);
   - *prompt utente*: la domanda e i path dei documenti referenziati.
3. Il modello lavora: greppa "cristalli" nei due documenti → trova gli
   articoli pertinenti → legge le sezioni con le righe di contesto intorno →
   nota che il preventivo rimanda alle condizioni generali per le esclusioni →
   apre il documento giusto alla sezione giusta → costruisce il confronto.
4. Ogni passo emette un **evento strutturato** che il worker inoltra al
   frontend via SSE: "cerco 'cristalli' nelle condizioni Cattolica… apro
   pag. 41 del preventivo…". L'utente vede il lavoro in corso, non uno
   spinner muto.
5. A fine esecuzione il worker — **non il modello** — valida l'output contro
   uno schema (la risposta c'è? le citazioni ci sono e puntano a documenti
   reali?) e lo persiste. Solo ciò che passa la validazione diventa risposta;
   il resto va in errore e retry. Il modello non ha mai credenziali di
   scrittura verso il database: il worker è l'unico scrivano.

Tempi attesi del percorso completo: 30–90 secondi. È il percorso *nobile*,
per le domande che lo meritano; la sezione §7 spiega come i percorsi rapidi
si aggiungeranno dopo.

---

## 3. Il principio fondante: il filesystem È l'indice

La grep funziona se il terreno è grep-abile. Il lavoro che nel RAG va
nell'indicizzazione vettoriale, qui va nella **preparazione del filesystem** —
ed è un lavoro che si fa una volta per documento, non a ogni query. Tre
regole:

### 3.1 Conversione PDF → Markdown con ancore di pagina

I PDF non si greppano in modo affidabile (encoding, layout a colonne, tabelle
spezzate dal flusso di testo). All'ingestion ogni documento viene convertito
in un `.md` pulito e fedele, con marcatori di pagina inline:

```markdown
[pag. 14]

### Art. 2.4 — Esclusioni della garanzia Cristalli

Sono esclusi dall'indennizzo:
a) i danni determinati da …
```

La conversione risolve due problemi con una mossa sola: la ricerca testuale
funziona, e **le citazioni diventano un sottoprodotto della lettura** — il
modello cita "CdA Cattolica, pag. 14" perché l'ancora è nel testo che ha
davanti, non perché un post-processing prova a ricostruire la provenienza.
Il frontend apre il PDF originale a pagina 14 (RF-C-04, RF-C-05).

Il PDF originale resta l'artefatto che l'utente vede e scarica; il Markdown è
la rappresentazione di lavoro del motore. Sono due facce dello stesso
documento, collegate dai metadati.

### 3.2 I metadati vivono nei path

```
archivio-pubblico/
  cattolica/
    auto/
      active-veicoli-autopiu/
        ed-2026-01/
          INDICE.md
          dip.md
          dip-aggiuntivo.md
          condizioni-di-assicurazione.md
        ed-2025-06/
          …
tenant/
  documenti/
    preventivi/
      2026-07-rossi-unipol-kmsicuri.md
    polizze/
      …
```

Con questa struttura `glob cattolica/auto/**` è già una query per
compagnia+ramo, senza passare da un database. Il versionamento delle edizioni
(RF-A-04) è una cartella per edizione; la corrente è indicata nell'INDICE.

I metadati restano *anche* in Postgres — servono a navigazione, ricerca UI e
amministrazione — ma il motore non dipende dal database per orientarsi: il
filesystem è autosufficiente.

### 3.3 File indice generati

Ogni cartella di prodotto contiene un `INDICE.md` generato automaticamente
all'ingestion (mai a mano): elenco dei documenti con tipologia e numero di
pagine, edizione corrente, e i **sinonimi commerciali** del prodotto ("Active
Veicoli" = "AUTOPIÙ" = il nome in gergo con cui lo chiama l'agenzia). È
l'equivalente del `CLAUDE.md` di un repository: il modello lo legge per primo
e non gira a vuoto. Gli indici di livello superiore (per compagnia, per
archivio) danno la mappa d'insieme.

**Conseguenza architetturale da tenere ferma:** la qualità del sistema si
sposta dall'inference all'ingestion. Una pipeline di conversione curata, e il
motore di query resta semplice e robusto. Quando una risposta è scadente, la
prima domanda da farsi è "il documento era convertito bene?", non "il prompt
era sbagliato?".

---

## 4. La pipeline di ingestion

All'upload (Archivio Privato) o al caricamento da back-office (Archivio
Pubblico), in coda asincrona con stati visibili all'utente (RF-B-05):

1. **Acquisizione** — il PDF originale va nello storage a oggetti; nasce la
   riga di catalogo in Postgres (stato: `in-elaborazione`).
2. **Conversione** — PDF → Markdown con ancore di pagina. Per i documenti
   assicurativi (tabelle di garanzie, layout a colonne) i tool meccanici tipo
   `pdftotext` maciullano le tabelle: la conversione la fa un **modello
   economico** (Haiku) che legge il PDF e produce Markdown fedele. Costa una
   volta per documento, non a ogni query. I documenti scansionati senza testo
   estraibile vengono segnalati come non leggibili (RF-B-06, prima release).
3. **Classificazione** — tipologia, compagnia, ramo, prodotto, edizione:
   proposti dal modello, confermabili dall'utente (RF-B-03).
4. **Collocazione** — il `.md` va al suo posto nell'albero (§3.2), gli
   `INDICE.md` coinvolti vengono rigenerati.
5. **Pronto** — il documento è referenziabile in chat (stato: `pronto`).

La conversione via modello è il principale costo fisso per documento della
piattaforma; il suo dimensionamento (modello, prompt, verifica di fedeltà a
campione) è la prima cosa da misurare nell'esperimento pilota (§8).

### 4.1 Da dove entrano i documenti in chat

Vale un chiarimento, perché è l'equivoco più facile su questa architettura:
**l'SDK non è un canale di trasporto dei documenti**. Nessun file viene
"inviato" al modello; il modello legge dal disco ciò che l'ingestion ha già
preparato. I tre momenti:

- **Creazione della conversazione** — una riga in Postgres (titolo, tenant,
  contesto documentale vuoto). Nessuna sessione SDK, nessuna operazione sul
  filesystem.
- **Referenziazione di un documento d'archivio** (`@`) — il documento è già
  sul filesystem, convertito all'upload in archivio: la referenziazione
  aggiunge solo il suo *path* al contesto della conversazione, persistito
  sulla riga della conversazione. È il motivo per cui la persistenza del
  contesto (RF-C-03) costa zero: ogni job porta al modello la domanda e la
  lista di path correnti, mai i contenuti.
- **Allegato di conversazione** — l'unico caso in cui un file viaggia, e
  viaggia via upload HTTP dal frontend all'API server, non via SDK. Da lì
  percorre la stessa pipeline di ingestion (§4), ma viene collocato in una
  cartella legata alla conversazione (es.
  `tenant/conversazioni/<id>/allegati/`), fuori dagli archivi — coerente con
  la scelta già consolidata nel frontend. Superato lo stato `pronto`, è un
  path come tutti gli altri.

L'unica chiamata API che contiene i byte di un documento è la conversione
una tantum (passo 2 della pipeline). Tutto il resto del sistema — chat, agenti, MCP — parla
per path: se l'utente allega un preventivo di 60 pagine e chiede della sola
franchigia cristalli, il modello ne leggerà tre.

Nel multi-turno ogni messaggio è un job nuovo; la continuità (storia della
conversazione + contesto documentale) viene ridata al modello riprendendo la
sessione SDK oppure ricostruendo il contesto dal database — dettaglio da
fissare in progettazione, con il prompt caching a rendere economico il
secondo colpo sulla stessa pratica.

---

## 5. Isolamento tenant per costruzione

RF-B-01 impone che nessun dato di un tenant possa raggiungerne un altro,
inclusi retrieval e risposte. Con il retrieval agentico l'isolamento è
**fisico, non promesso**: la working directory di ogni job contiene
esclusivamente l'archivio del tenant proprietario del job e l'Archivio
Pubblico in sola lettura. Il modello non può leggere ciò che non esiste nel
suo mondo — non c'è un indice condiviso da filtrare, non c'è una query da
sbagliare. A regime, l'esecuzione del worker è confinata anche a livello di
sistema operativo (container/utente dedicato per job), come seconda cinta di
mura.

È un isolamento più semplice da dimostrare — a un cliente, a un auditor — di
qualunque filtro logico su un indice condiviso.

---

## 6. Il contorno del motore: coda, validazione, audit

Il motore vive dentro il pattern già fissato in `chat-analisi.txt`:

- **Coda in ingresso** — ogni interrogazione è un job persistito. Niente
  timeout HTTP su esecuzioni lunghe; se cade la connessione la risposta
  arriva comunque; cinque colleghi che interrogano insieme sono cinque job
  che il sistema smaltisce al ritmo che regge (i limiti reali sono i rate
  limit del provider, non le macchine).
- **Il worker è l'unico scrivano** — il modello produce output; il worker lo
  valida contro schema e lo persiste. Mai un tool di scrittura DB
  nell'ambiente del modello.
- **Audit trail gratis** (RNF-07) — ogni risposta persistita porta con sé
  domanda, documenti letti, citazioni, token consumati, timestamp, modello
  usato. Nel settore assicurativo questo non è logging: è materiale di
  compliance.
- **Autenticazione con API key** (variabile d'ambiente sul worker), mai
  abbonamenti personali: è l'unica configurazione conforme ai termini d'uso
  per un prodotto commerciale multi-utente.

Gli **Agenti** (Modulo E) e la **Memoria** (Modulo G) non hanno un motore
proprio: un agente schedulato è lo stesso job con un trigger cron invece che
un utente; l'apprendimento della memoria è un job di estrazione che gira a
fine conversazione. Il **server MCP** (Modulo F) espone ricerca e lettura
sugli stessi archivi preparati. Un motore solo, più ingressi.

---

## 7. L'MVP è a motore unico; il router viene dopo

L'analisi economica (`chat-analisi.txt`) prevede un router che smista le
domande su quattro percorsi: lookup strutturato (1–3 s), confronto
precomputato (<1 s), sessione con caching (2–5 s), percorso agentico
completo (30–90 s). Quel disegno resta l'obiettivo a regime — è ciò che
rende sostenibile RNF-05 — ma **non si costruisce per primo**.

L'MVP usa il percorso agentico come **motore unico**: un solo percorso, il
più corretto, quello che dimostra il valore sul caso pilota. Lookup
strutturato e precompute si aggiungono dopo, come ottimizzazioni di costo e
latenza su un sistema che già funziona — non prima, come scommesse su quali
domande arriveranno. L'ordine è deliberato:

1. prima la correttezza dimostrata (motore agentico + citazioni),
2. poi la misura (quali domande fanno gli utenti veri, quanto costano),
3. poi l'ottimizzazione (router e percorsi rapidi dove i numeri lo chiedono).

### Passo futuro dichiarato: estrazione strutturata + lookup

L'esperimento del 06/08/2026 ha misurato il motivo per cui questo passo
esiste: una **domanda puntuale** ("che franchigia ha il Furto nel
preventivo?") sul percorso agentico costa 0,43–0,99 USD e 94–128 secondi
(Sonnet/Opus), perché il modello rifà ogni volta l'interpretazione dei dati
(glossario, sigle, condizioni). Quel lavoro non cambia mai per un documento
dato: va fatto **una volta, all'ingestion**, e salvato come dati.

Il disegno, quando verrà il momento:

1. **Estrazione strutturata all'ingestion** — un passo aggiuntivo della
   pipeline (§4): un modello compila uno schema fisso per documento
   (garanzie, somme, franchigie/scoperti, premi, condizioni), validato dal
   worker con Zod. Ogni valore porta la sua **citazione** (file + pagina
   dalle ancore) e le ambiguità si risolvono qui, una volta, con nota di
   interpretazione; i campi incerti si marcano `da_verificare`.
2. **Dati in Postgres** — tabelle per tenant; la domanda puntuale diventa
   una query SQL + formattazione con un modello economico: 1–3 s, centesimi.
3. **Router davanti a tutto** — un classificatore economico smista:
   lookup se le entità matchano dati estratti; agentico per le domande
   aperte/interpretative; degradazione all'agentico (mai un "non c'è"
   sbagliato) quando il dato estratto manca o è marcato incerto.
4. **Regalo collaterale** — le tabelle di analisi (RF-C-11/12: documenti ×
   criteri con citazione per cella) sono esattamente l'output di questa
   estrazione: stesso investimento, due funzionalità.

Due accortezze già note per il percorso agentico: l'extended thinking si
attiva solo qui (mai sui futuri percorsi rapidi), e il **prompt caching**
va sfruttato nelle conversazioni multi-turno sulla stessa pratica — taglia
latenza e costi insieme.

---

## 8. La prova prima del codice

Prima di scrivere il backend, il motore va dimostrato a mano, perché ogni sua
parte è verificabile senza infrastruttura:

1. prendere i PDF reali del caso pilota (set informativo Cattolica "Active
   Veicoli AUTOPIÙ" + preventivo Unipol);
2. convertirli in Markdown con ancore di pagina (anche con un prompt manuale,
   per ora);
3. disporli nell'albero di §3.2 con i loro `INDICE.md`;
4. lanciare la CLI di Claude su quella cartella, con i soli tool di lettura,
   col prompt di sistema abbozzato e la domanda del confronto;
5. giudicare: le citazioni sono giuste? le esclusioni trovate sono tutte?
   quanti turni, quanti token, quanti secondi?

Se il motore convince qui, tutto il resto del backend è idraulica attorno a
un nucleo già validato. Se non convince, abbiamo speso una giornata invece di
un mese. I numeri raccolti (token per query, secondi, qualità della
conversione) sono anche la base del dimensionamento economico (RNF-05).

---

## 9. Decisioni aperte

| # | Decisione | Stato |
|---|---|---|
| 1 | **Modello del motore agentico al lancio** (Sonnet vs Opus: qualità vs costo/latenza sul percorso lungo) | Da misurare nell'esperimento §8 |
| 2 | **Prompt e verifica della conversione** PDF→MD (fedeltà delle tabelle, gestione documenti >100 pagine, verifica a campione) | Da progettare con i PDF del pilota |
| 3 | **Confinamento OS del worker** (container per job da subito, o utente dedicato in prima release) | Da decidere col deployment |
| 4 | **Budget per query del percorso agentico** (tetto di turni/token per job, comportamento al raggiungimento) | Da fissare dopo le prime misure |
| 5 | **Multi-provider (RF-D-02)**: l'astrazione vive al livello del motore, non della singola chiamata; prima implementazione Anthropic con scelta del modello. Formalizzare l'interfaccia. | Impostazione concordata, da dettagliare |
