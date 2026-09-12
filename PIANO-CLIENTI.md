# Clienti: il piano

12/09/2026. Richiesta del committente: i clienti diventano una **sezione**, un piccolo CRM con dentro l'anagrafica e i suoi documenti; la chat cliente si trasferisce lì, in una scheda sua; l'Archivio Privato torna a essere un **elenco piatto di documenti etichettabili**; e nasce il concetto di **documenti del cliente**. Tutto questo entra nel motore agentico: si menziona un cliente come si menziona un documento, e il motore naviga i dati e i documenti dei clienti.

Non è un rimescolamento di schermate, è un **cambio di asse portante**. Dalla Fase 10 (02/09/2026) l'asse era la cartella e il cliente era una cartella dentro un albero libero; da qui l'asse è il cliente, e l'archivio torna un magazzino con le sue faccette. Per un'agenzia è l'asse giusto: nessuno pensa «dove sta il file», pensa «cosa ha Rossi».

E si porta dietro una semplificazione vera. Sparisce il pezzo più fragile della Fase 10 — decidere in quale ramo di un albero libero collocare un documento (`archivio/collocazione.ts`, `convenzione.ts`, `albero.ts`, il tool `proponi_riordino`) — e resta la risoluzione del cliente (`archivio/clienti.ts`), che è la parte buona, già scritta e già collaudata: normalizzazione, alias, identificativi fiscali, candidati per somiglianza, e il modello solo sugli ambigui.

**Stato**: **Fasi 1-6 fatte** (12/09/2026): l'albero è smontato, le API dei clienti ci sono, l'ingestion intesta ed etichetta da sé, la sezione Clienti si vede, l'archivio si lavora in blocco e la chat col cliente si apre dalla sua scheda. Resta la 7, il motore.

**Niente di tutto questo è in produzione**, e il committente può svuotare l'Archivio Privato (12/09/2026). Quindi non c'è nessuna migrazione di dati da progettare: le tabelle dell'albero si eliminano subito e il codice che le serve se ne va con loro, nella prima fase invece che nell'ultima. L'Archivio **Pubblico** non si tocca: i lotti trascritti (Zurich, HDI, Unipol, Allianz, AXA, Generali, Nobis…) non hanno niente a che vedere con le cartelle, che sono del tenant.

## Decisioni del committente (12/09/2026)

- **L'albero delle cartelle si elimina del tutto.** Niente `velia.cartelle`, niente convenzione osservata, niente collocazione automatica, niente `proponi_riordino`. Restano cliente, etichette e faccette (tipologia, compagnia, ramo, date, stato).
- **L'Archivio Privato mostra tutto**, con la colonna e il filtro «Cliente». Un solo magazzino: chi cerca un documento lo trova sempre, senza doversi ricordare se ha un cliente attaccato.
- **Niente entità polizza.** Numero di polizza, decorrenza e scadenza restano metadati del documento (`velia.documenti` ce li ha già): si filtrano e si mostrano, non diventano un oggetto.
- **Il cono di lettura di una chat cliente è il cliente**: i suoi documenti, sempre e per costruzione, più i documenti pubblici e privati aggiunti a mano — e quelli tolti a mano.
- **Niente migrazione di dati**: non si è in produzione e l'Archivio Privato si può svuotare. Si taglia, non si traghetta.

## Le tre parole

**Cliente.** L'entità: nome, alias, tipo, identificativi, contatti, note, etichette. Esiste già a database (`velia.clienti`, migrazione `20260901140000_cartelle.sql`), ha già la risoluzione e la fusione; non ha una schermata. È questa la cosa che manca.

**Documenti del cliente.** Non è un secondo archivio: è **la vista** dei documenti che hanno quel `cliente_id`. Una tabella `documenti` sola, una ingestion sola, un visualizzatore solo, un sistema di citazioni solo. Cambia solo da dove ci si arriva, e cosa succede caricando: dentro un cliente il `cliente_id` si mette da sé, in archivio lo **propone** il risolutore.

**Archivio Privato.** Tutti i documenti privati dell'agenzia in un elenco piatto, ordinabile e filtrabile per cliente, tipologia, compagnia, ramo, etichette, stato e date. Quello che nella Fase 10 era «Da sistemare» qui si chiama **«Senza cliente»**, e non è un errore: circolari, modulistica, note tecniche e convenzioni un cliente non ce l'hanno per natura.

## Modello dati

Tutto in schema `velia`, Supabase solo online, migrazioni applicate con `tools/applica-migrazione.mjs`. Ogni tabella creata da una migrazione va assegnata a `velia_app`, o l'app la legge a zero righe in silenzio.

```
velia.clienti                        (esiste: nome, nome_normalizzato, tipo, codice_fiscale,
                                      partita_iva, alias)
  + email text
  + telefono text
  + indirizzo text
  + nato_il date                     facoltativo, ma in assicurazione serve
  + note text
  + etichette text[] not null default '{}'   segmentazione ("in rinnovo", "VIP")
  + stato text not null default 'attivo'     'attivo' | 'archiviato'

velia.documenti
    cliente_id                       resta, ed è l'unico aggancio
    etichette                        resta, e da qui è portante
  + cliente_da_confermare boolean    la proposta dell'ingestion, finché nessuno la conferma
  - cartella_id
  - collocazione_proposta
  - collocazione_da_confermare

velia.conversazioni
  + cliente_id uuid references velia.clienti (id) on delete set null

velia.chat_clienti
    cliente_id                       da facoltativo a obbligatorio
velia.chat_clienti_documenti
  + escluso boolean not null default false   la stessa tabella dice "in più" e "in meno"
- velia.chat_clienti_cartelle

- velia.cartelle
- velia.convenzione_archivio
```

Indici: `documenti (tenant_id, cliente_id)`, `conversazioni (tenant_id, cliente_id)`, `clienti using gin (etichette)`. L'indice unico sul nome normalizzato e quello trigram per la somiglianza restano come sono: sono ciò che fa funzionare la risoluzione.

Le etichette restano un `text[]` sui documenti: non serve una tabella per rinominarle e fonderle, serve una rotta che faccia l'aggiornamento massivo. Una tabella si aggiunge il giorno in cui un'etichetta dovrà portarsi dietro un colore o una descrizione.

## Niente migrazione: si svuota e si ricarica

Non essendo in produzione, il travaso «la cartella diventa un'etichetta» non si scrive. L'Archivio Privato dei tenant demo e di collaudo si svuota e si ricarica dopo la Fase 3, quando l'ingestion propone cliente ed etichette nella forma nuova: è anche il modo migliore di collaudarla, perché un archivio ricaricato è un archivio che ha attraversato la catena vera.

Due precisazioni, perché «svuotare» sia una parola precisa:

- **Si svuota il privato, non il pubblico.** `velia.cartelle` è del tenant; i documenti pubblici non hanno cartelle e non hanno clienti. Le settimane di trascrizione dei lotti non sono in gioco.
- **Si svuotano anche i documenti di riferimento e gli allegati di chat**, che sono documenti privati a tutti gli effetti: i riferimenti dell'agenzia (`velia.riferimenti`) vanno ricaricati dalle Impostazioni, e le conversazioni vecchie resteranno con allegati e citazioni che puntano a righe sparite. Su un tenant demo è accettabile; se il committente vuole conservare una conversazione di dimostrazione, va salvata prima.

Ne discende l'ordine delle fasi: **si taglia subito**. Le tabelle dell'albero e il codice che le serve se ne vanno nella Fase 1, non in una pulizia finale, e da lì in poi non c'è più un secondo asse da tenere vivo mentre si costruisce il primo.

## Il motore agentico

### La workspace cambia forma

`worker/motore/workspace.ts` materializza oggi l'albero dell'agenzia. Da qui:

```
INDICE.md
archivio-pubblico/…                        invariato
tenant/
  clienti/
    INDICE.md                              il ruolino: una riga per cliente
    rossi-mario--<idcliente>/
      SCHEDA.md                            anagrafica, contatti, etichette, note, i suoi documenti
      <titolo>--<iddoc>.md
  documenti/                               i documenti senza cliente
    polizze/ preventivi/ appendici/ …      per tipologia (insieme chiuso, non un albero)
      INDICE.md
  allegati/                                invariato
```

Due accorgimenti che decidono se questo regge su un'agenzia da tremila clienti:

- **Il ruolino dei clienti è un file da *grepare*, non da leggere.** Tremila righe `nome | id | tipo | documenti | una riga di sintesi` sono duecento kilobyte: il modello ci cerca dentro il nome e ottiene la cartella, non se lo legge tutto. Le regole del prompt devono dirlo con queste parole, o il modello lo aprirà con Read.
- **`SCHEDA.md` si scrive solo per i clienti in gioco** — quelli menzionati o agganciati alla conversazione — come già si fa con le immagini del contesto. Per tutti gli altri c'è lo strumento. Scrivere tremila schede a ogni messaggio è I/O buttato.

### Gli strumenti: i file navigano, gli strumenti interrogano

I file sanno rispondere a «cosa ha assicurato Rossi». Non sanno rispondere a «chi ha l'RC auto in scadenza a marzo»: quella è una domanda sui dati, e i dati stanno in Postgres. Due strumenti nuovi in `worker/motore/strumenti.ts`, **di sola lettura**, sempre filtrati per tenant, e **montati solo per l'agenzia** — mai in una chat cliente, con lo stesso meccanismo con cui oggi `proponi_riordino` c'è solo se c'è `suProposta`:

- `cerca_clienti` — filtri per nome, etichetta, tipo, compagnia, ramo, tipologia, finestra di decorrenza o scadenza, con o senza documenti. Torna una tabella breve: nome, id, cartella nella workspace, numero di documenti, prossime scadenze. È la funzione che trasforma l'archivio in un portafoglio.
- `scheda_cliente` — la scheda completa di un cliente, anche di uno che documenti non ne ha (e che quindi in workspace non ha una cartella).

Il confine non si allarga: questi strumenti vedono esattamente ciò che vedrebbe la workspace dell'agenzia, e in una chat cliente non esistono. Il presidio fisico resta quello che è sempre stato — ciò che non è su disco non si legge — e il presidio logico si riscrive qui, perché il worker parla al database con la connessione di sistema e sotto non c'è la RLS.

### La menzione

Il selettore del composer (`@`) diventa a due sezioni: **Clienti** e **Documenti**. Menzionare un cliente **non** infila duecento documenti nel contesto: aggancia la conversazione al cliente (`conversazioni.cliente_id`), materializza la sua `SCHEDA.md` e il suo indice, e lascia che sia il motore a leggere quello che gli serve. Il contesto documentale resta quello che è: i documenti scelti a mano.

### La proposta

`proponi_riordino` diventa **`proponi_assegnazione`**: assegna un cliente a uno o più documenti, aggiunge o toglie etichette. Cambia l'oggetto, non il meccanismo — il modello non scrive mai, deposita una proposta, l'utente la vede sotto la risposta e la applica l'API con l'identità di chi approva. Si riusano `velia.proposte_archivio`, `archivio/proposta.ts` e il componente `proposta-riordino` del FE, con operazioni nuove.

### Le regole

`worker/motore/regole.ts`: la sezione «Il mondo in cui lavori» descrive la forma nuova; nasce una sezione «I clienti» (come si trova un cliente, quando si usa il ruolino e quando lo strumento, che la scheda è un dato e non una fonte da citare). Le regole della chat cliente non cambiano: il cliente non deve sapere che esistono altri clienti, ed è la prima cosa da riprovare quando il cono cambia definizione.

## Dati personali

Il CRM è il posto dove i dati personali finalmente stanno: codice fiscale, contatti, indirizzo, data di nascita. Due vincoli, da rispettare mentre lo si costruisce:

- **La memoria continua a non impararli.** Il perimetro (`worker/memoria/perimetro.ts`) scarta codici fiscali, IBAN, email, telefoni, indirizzi, targhe e le categorie dell'art. 9: resta com'è. L'anagrafica è un dato strutturato con una finalità; un ricordo è una frase che gira in ogni prompt.
- **La cancellazione diventa un gesto solo.** Eliminare un cliente porta via i suoi documenti, le sue chat e le sue conversazioni, e la schermata lo dice prima di farlo, col conteggio. Oggi la stessa operazione è una caccia.

## Le fasi

### ✅ Fase 1 · Tabula rasa (12/09/2026)

Una migrazione sola (`20260912120000_clienti.sql`, applicata online), che toglie prima di aggiungere: `drop` di `velia.cartelle`, `velia.convenzione_archivio`, `velia.chat_clienti_cartelle` e delle colonne `cartella_id`, `collocazione_proposta`, `collocazione_da_confermare`; colonne nuove su `clienti` (recapiti, note, etichette, stato), `documenti` (`cliente_da_confermare`), `conversazioni` (`cliente_id`), `chat_clienti_documenti` (`escluso`); `chat_clienti.cliente_id` obbligatorio e in `cascade`; indici.

**Trappola trovata applicandola**: la tabella va buttata **prima** della funzione. `cartelle_ospite_solo_cono` è una policy su `velia.cartelle` che chiama `velia.cartelle_nel_cono()`, quindi finché la tabella c'è la funzione non si può eliminare (`2BP01`). Morta la tabella, muore la policy, e la funzione resta sola.

L'archivio **non** è stato svuotato: la migrazione non lo richiedeva (i documenti perdono la cartella, non la riga), e i 22 documenti privati del tenant demo sono ancora lì, la maggior parte senza cliente. Lo svuotamento vero, con la ricarica, resta per la Fase 3. Le 4 chat cliente esistenti sono state eliminate dalla migrazione: erano tutte senza cliente, e il loro cono era fatto di cartelle.

Nella stessa fase se n'è andato il codice che serviva l'albero: `archivio/albero.ts`, `archivio/collocazione.ts`, `archivio/convenzione.ts`, le rotte `/api/cartelle` e `/api/convenzione` (diventate `src/api/clienti/rotte.ts`), `contratto/cartelle.ts` → `contratto/clienti.ts`, l'API e i modelli delle cartelle nel FE, la schermata Impostazioni → Archivio, `mocks/cartelle.mjs` → `mocks/clienti.mjs`, `cartelle.spec.ts`, `integrazione-cartelle.spec.ts`, `integrazione-proposte.spec.ts`. `Interrogabile` si è spostato in `db/interrogabile.ts`: non era mai stato un concetto dell'archivio.

**Due cose sono state fatte qui invece che dopo**, perché rimandarle voleva dire lasciare in giro roba rotta:

- **La proposta è stata convertita, non rimossa** (era previsto il contrario). `proponi_riordino` è diventato `proponi_assegnazione`: intestare documenti a un cliente, aggiungere e togliere etichette. Il meccanismo non cambia — il motore non scrive, deposita; la scrittura la fa l'API con l'identità di chi approva — e cambiano solo le operazioni (`archivio/proposta.ts`, `contratto/conversazioni.ts`, il componente del FE). Un cliente si risolve per nome fra quelli in anagrafica, e **qui non ne nascono di nuovi**.
- **La schermata dell'archivio è già piatta**: senza albero non poteva restare un gestore di file. Ha il filtro per cliente e «Senza cliente» dentro la tendina dei filtri. Quello che resta alla Fase 5 è il lavoro in blocco (selezione multipla, assegnazione massiva, gestione delle etichette) e la coda dei «da confermare».

Il motore materializza i privati **per tipologia**, come prima della Fase 10, e gli `INDICE.md` hanno ora la colonna **Cliente**: è con quella che risponde a «cosa ha Rossi», e le regole dicono di cercarla con Grep.

*Collaudato*: BE 313 test unità + 42 d'integrazione sulle rotte toccate (chat clienti, cono, archivio privato) verdi; FE 235 test, build di produzione e lint verdi. Restano rossi 4 test di `integrazione-agenti` sui limiti di concorrenza, che **fallivano già prima** di questa fase col worker di sviluppo acceso (verificato ripartendo da `HEAD`), e 3 errori di lint in `test/integrazione-conversazioni.spec.ts`, anch'essi precedenti.

### ✅ Fase 2 · API dei clienti e dei documenti (12/09/2026)

- `GET/POST/PATCH/DELETE /api/clienti`, `GET /api/clienti/:id` (scheda con conteggi e prossime scadenze), `GET /api/clienti/:id/documenti`, `POST /api/clienti/:id/fondi` (esiste), `GET /api/clienti/etichette`.
- `GET /api/documenti-privati` guadagna i filtri per cliente e «senza cliente», perde `cartellaId`, `soloQui` e `daSistemare`.
- `PATCH /api/documenti-privati/:id` perde `cartellaId`; assegnare un cliente a mano spegne `cliente_da_confermare`.
- Assegnazione massiva: `POST /api/documenti-privati/assegna` (cliente ed etichette su una selezione).
- Rinomina e fusione di un'etichetta su tutto il tenant.

Fatto come previsto, con tre precisazioni:

- **`GET /api/clienti/:id/documenti` non esiste, ed è meglio così.** I documenti di un cliente si chiedono all'archivio con `?clienteId=`, che ha già ricerca, faccette, stato di elaborazione e paginazione. Una seconda rotta con meno capacità avrebbe reso la scheda del cliente più povera dell'archivio, e sarebbe stato un contratto in più da tenere allineato.
- `GET /api/clienti/:id` è la **scheda**: il cliente più le sue conversazioni, il conteggio delle chat e le scadenze future dei suoi documenti. Solo quelle che devono ancora arrivare: uno scadenzario che comincia dal 2019 non è uno scadenzario.
- `DELETE /api/clienti/:id?documenti=senza-cliente|elimina` dice sempre che fine fanno i documenti, e con `elimina` porta via anche i file dallo Storage, fuori dalla transazione (se i byte non se ne vanno resta qualche file muto, non una riga che punta al nulla).

In più: `POST /api/documenti-privati/assegna` (cliente ed etichette su una selezione, con le etichette che si sommano invece di sostituirsi), `PATCH`/`DELETE /api/etichette/:nome` (rinominare ovunque, che è anche il modo di fondere due etichette) e `GET /api/clienti/etichette`.

*Collaudato*: `test/integrazione-clienti.spec.ts`, 8 test sul giorno dopo l'importazione — creare col quasi-doppione, ritrovare per alias e codice fiscale, assegnare in blocco, rinominare e fondere un'etichetta, la scheda, la fusione di due clienti sdoppiati, l'eliminazione.

### ✅ Fase 3 · Ingestion (12/09/2026)

Il passo 3b (`risolviCliente`) era già arrivato con la Fase 1. Qui si aggiunge il **3c, le etichette** (`archivio/etichette.ts`), e qui c'è la scelta che conta:

**Le etichette si derivano da fatti, non si chiedono a un modello.** Compagnia e ramo vengono dalla tassonomia (quindi si scrivono sempre uguali), l'annualità dalla decorrenza, e i pezzi del percorso con cui il file è arrivato diventano etichette invece che cartelle. La ragione è pratica prima che economica: una faccetta serve finché il vocabolario è piccolo, e un modello che inventa etichette libere produce «RC Auto», «Rc auto» e «Auto» sullo stesso ramo — a quel punto filtrare non serve più. Si scartano i contenitori (`Clienti/`, `Polizze/`: valgono per tutti), il nome del cliente (è già un'entità sua) e le numerazioni di cartelle; il tetto è sei etichette, e non si toglie mai niente a ciò che l'utente ha scritto.

**Due difetti trovati collaudando**, che senza una prova su un documento vero non si sarebbero visti:

- i nomi di compagnia e ramo vanno passati **insieme alla proposta**, non riletti dalla riga: la riga del documento è stata letta prima che la classificazione la scrivesse, e la prima lavorazione usciva senza etichette mentre la seconda le aveva. Ora `proponiClassificazione` restituisce anche `compagniaNome` e `ramoNome`;
- `tools/rilavora-ingestion.ts` costruiva un job finto in **camelCase** mentre il gestore legge `job.tenant_id`: intestazione ed etichette si saltavano in silenzio, e il documento tornava «pronto» come se tutto fosse a posto. Lo stesso tool ora rilavora un id esplicito **in qualunque stato** (non solo in errore) e si crea il job quando la coda l'ha già ripulito: dopo un cambio alla catena, ripassarla su documenti veri è l'unico modo onesto di sapere se funziona.

*Collaudato*: 8 test d'unità su `etichetteProposte` (contano più le cose che **non** diventano etichetta), un test d'integrazione che intesta ed etichetta con la catena vera e prova che rilavorare non duplica, e **una rilavorazione su un documento vero dell'archivio demo**: `slide-preventivo-auto-mercedes-cla-scrimieri-andrea` è stato intestato a «SCRIMIERI ANDREA» (`via: nome`, cioè match esatto sul nome normalizzato: nessuna chiamata al modello e nessun cliente doppione) e ha preso «UnipolSai Assicurazioni», «RC Auto e veicoli», «2026».

Sull'archivio demo, oggi: 22 documenti privati, 2 con cliente, 6 prenderebbero almeno un'etichetta con i dati che hanno già. Gli altri sono in gran parte materiale di prova (README, indirizzari, time-track) o documenti entrati prima che il classificatore estraesse il contraente: **la ricarica vera resta da fare**, ed è un'operazione che costa chiamate al modello (lettura visiva, un documento alla volta), quindi la decide il committente.

### ✅ Fase 4 · La sezione Clienti (12/09/2026)

Rotta `/clienti`, voce in navigazione nel gruppo «Lavoro» (Chat, Clienti, Tabelle); «Chat per i clienti» esce da «Automazione».

- **Elenco**: ricerca per nome, alias, codice fiscale e partita IVA; faccette per etichetta, tipo e «con documenti»; creazione, fusione, eliminazione.
- **Scheda `/clienti/:id`**, a schede:
  - **Anagrafica** — dati, alias (che si imparano da soli e qui si correggono), contatti, note, etichette, eliminazione col conteggio di ciò che porta via.
  - **Documenti** — lo stesso elenco dell'archivio, filtrato sul cliente, con l'area di rilascio che assegna il cliente da sé.
  - **Chat** — le chat cliente di questo cliente (Fase 6).

Fatta con due aggiunte rispetto al piano:

- **La scheda aperta sta nell'indirizzo** (`?scheda=documenti`), non in un signal: «guarda i documenti di Rossi» si manda a un collega con un link, e il tasto Indietro torna dov'era. È la stessa regola che l'archivio applicava alla cartella aperta.
- **Caricare dalla scheda intesta da sé**: il file sale e il cliente si mette senza sceglierlo dopo. È il gesto per cui si è lì.

Prima, una toppa dovuta: creare una chat cliente rispondeva 400 da quando `cliente_id` è obbligatorio. Ora la finestra di creazione chiede il cliente, e da lui riempie nome e cognome dell'ospite se sono vuoti.

*Collaudato*: schermate a 1440 e a 390 (elenco, scheda, documenti): nessuno scorrimento orizzontale, una colonna sola sul telefono. `ng lint` e 235 test FE verdi.

### ✅ Fase 5 · L'Archivio Privato piatto (12/09/2026)

Metà era arrivata con la Fase 1 (via albero e briciole; filtro per cliente e «Senza cliente»). Qui il **lavoro in blocco**, che è quello che serve il giorno dell'importazione: una casella su ogni riga, «Seleziona tutti», e una barra che compare solo con qualcosa di selezionato — quanti sono, a chi intestarli, che etichetta aggiungere.

Tre scelte che vale la pena ricordare:

- **Confermare non riassegna.** `POST /api/documenti-privati/assegna` accetta `confermaCliente: true`: spegne la domanda lasciando il cliente che l'ingestion aveva proposto. È il gesto con cui si svuota la coda dopo un'importazione, e senza si dovrebbe riassegnare uno per uno ciò che era già giusto.
- **Le etichette si rinominano da dentro il filtro.** Si filtra per un'etichetta, si vede che cosa contiene, e lì accanto la si rinomina o la si toglie da tutti. Una schermata di gestione a parte vorrebbe dire cambiare il nome di un'etichetta senza avere sotto gli occhi i documenti che la portano; e rinominarla nel nome di un'altra è come si fondono.
- **La selezione non sopravvive a un cambio di filtro**, per costruzione: «assegna i selezionati» dopo che la pagina è cambiata sotto vorrebbe dire scrivere su documenti che non si stanno più guardando.

La coda delle proposte («Solo i clienti da confermare») ha una porta nei filtri e un indirizzo suo (`?vista=da-confermare`): un filtro che esiste solo nell'URL non lo trova nessuno.

*Collaudato*: 5 test nuovi sullo store (la selezione, l'assegnazione che svuota la selezione, il filtro che segue l'etichetta rinominata) e 1 d'integrazione sulla conferma in blocco; il giro completo provato in un Chrome vero — seleziona, scegli il cliente, «Intesta», e il documento esce dalla vista «senza cliente» (19 → 18) mentre la barra si chiude. **Difetto trovato guardando il telefono**: la riga era diventata un contenitore con dentro il collegamento, e la regola per schermi stretti mandava a capo il contenitore invece del collegamento — i titoli sparivano. Corretto, e riguardato.

### ✅ Fase 6 · Le chat cliente dentro il cliente (12/09/2026)

Il cono era già stato riscritto con la Fase 1, da tutte e due le parti — `documentiPerWorkspace` per il worker e `velia.documenti_nel_cono()` per le policy, due definizioni gemelle e volutamente duplicate. Qui arriva il lato dell'agenzia.

**Il cono si guarda, non si immagina.** La scheda della chat elenca i documenti che il cliente leggerà davvero — sono i suoi, che il server ricalcola a ogni domanda — e accanto a ciascuno c'è «Non mostrarlo». Escludere lascia la riga al suo posto, barrata: è un'eccezione, e deve vedersi che lo è. Dire soltanto «legge i suoi documenti» avrebbe chiesto all'agenzia di fidarsi di una frase.

**La chat si apre dalla scheda del cliente**, dove si sa già per chi è. Il modulo vive in un componente solo (`features/chat-clienti/creazione/`), usato anche dall'elenco: due moduli gemelli avrebbero cominciato a divergere al primo campo aggiunto. Non passa dallo store delle chat — quello è fornito dalla rotta `/chat-clienti` e dalla scheda di un cliente non esiste (`NG0201`) — ma dall'API, che è di radice.

**Nome e cognome si indovinano solo quando non c'è ambiguità.** «SCRIMIERI ANDREA» si divide; «De Vincentis Alessio» no, e i campi restano da riempire. Due campi vuoti sono meglio di due campi pieni e sbagliati, perché i secondi non li rilegge nessuno e il cliente si vedrebbe chiamare «De» dal primo messaggio.

`/chat-clienti` resta la vista d'insieme: chi, stato, costo, il link da copiare. La nota che diceva «il link si vede una volta sola» è stata corretta — dal 07/09 si rilegge da ogni riga, e una bugia nell'interfaccia costa più di una riga sbagliata nel codice.

*Collaudato*: il giro intero in un Chrome vero, dalla scheda di SCRIMIERI ANDREA — modulo precompilato, chat creata, cono con i suoi **2 documenti** (compreso quello intestato dall'ingestion in Fase 3), uno escluso, e poi eliminata, che rimuove anche l'utenza ospite. `ng lint` pulito, 240 test FE, build di produzione verde.

### Fase 7 · Il motore

Workspace nella forma nuova, ruolino, `SCHEDA.md` per i clienti in gioco, i due strumenti, `proponi_assegnazione`, regole riscritte, menzione `@cliente` nel composer, `conversazioni.cliente_id` con la scheda «Conversazioni» del cliente.

*Collaudo*: tre domande vere in chat sull'archivio ricaricato — «cosa ha Rossi», «chi ha l'auto in scadenza a marzo», «assegna questi tre documenti a Bianchi» — con le citazioni verificate, e il giro di `tools/collaudo-motore.ts` come dopo ogni ritocco al prompt.

## Quello che si butta

Vale la pena scriverlo, perché è il guadagno vero, e succede tutto nella Fase 1: `archivio/albero.ts`, `archivio/collocazione.ts`, `archivio/convenzione.ts`, la parte di `archivio/proposta.ts` che risolve i percorsi, le rotte `/api/cartelle` e `/api/convenzione`, lo store e le schermate dell'albero nel FE, `cartelle.spec.ts`, `integrazione-cartelle.spec.ts` e i pezzi di `integrazione-proposte`. Oggi 28 file backend e 27 frontend nominano le cartelle: la maggior parte per una riga, alcuni per esistere.

## Quello che resta aperto

- **La polizza come entità** è esclusa per decisione, e va bene finché i documenti di un cliente sono pochi. Il giorno in cui un cliente ne avrà trenta su cinque polizze, l'elenco piatto chiederà un raggruppamento: i metadati per farlo (`numero_polizza`, `decorrenza`, `scadenza`) ci sono già, e nessuna scelta di questo piano lo impedisce.
- **Le scadenze** non hanno ancora un posto: una volta che i dati stanno sul cliente, lo scadenzario è una query e un agente. Fuori da questo piano.
- **L'import dell'anagrafica** da un gestionale (CSV, Excel): prevedibile alla prima agenzia vera, non previsto qui.
