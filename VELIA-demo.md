# VELIA — Demo dal vivo a un agente

| Campo | Valore |
|---|---|
| Destinatario | Un agente assicurativo (non un tecnico, non un investitore) |
| Durata | 35 minuti; versione corta da 15 in fondo |
| Ambiente | `app-dev.sonovelia.it` contro `api-dev.sonovelia.it` |
| Lingua | Italiano |
| Data | 07/09/2026 |

---

## 1. Il principio

Un agente non compra un'intelligenza artificiale. Compra tre cose: **non
sbagliare**, **finire prima**, **fare bella figura col cliente**. La demo
deve toccarle in quest'ordine, perché è l'ordine in cui lui decide.

Da qui discendono due scelte che vanno tenute anche quando la conversazione
scappa:

**Non si parte dall'archivio.** Che Velia abbia dentro le condizioni delle
compagnie è la cosa che l'agente si aspetta, e non è quella che lo convince:
i documenti ce li ha già anche lui, in una cartella. Si parte dalla domanda a
cui lui oggi impiega venti minuti a rispondere.

**Non si dice mai «l'intelligenza artificiale».** Si dice cosa fa. «Legge le
condizioni e ti dice a quale pagina l'ha letto» vale più di qualunque
aggettivo, e non evoca il sospetto che il sistema si inventi le cose - che è
esattamente il sospetto da disinnescare nei primi cinque minuti.

---

## 2. Preparazione

Questa è la parte che salva la demo. Va fatta **il giorno prima**, non
mezz'ora prima, perché una parte richiede che qualcosa giri.

### 2.1 Ripulire l'ambiente dev

Lo stato di dev oggi è quello di un banco di collaudo, e davanti a un agente
si vede tutto. Cosa c'è, e cosa va tolto o rinominato:

| Dove | Cosa si vede oggi | Da fare |
|---|---|---|
| Barra laterale | 57 conversazioni, ne mostra le ultime 20, con i nomi delle prove | Archiviare o cancellare tutto quello che non serve alla demo |
| Archivio Privato | Cartelle `TEST ALESSIO` e `IN` accanto a `Clienti` e `Compagnie` | Cancellare le due; l'albero deve leggersi come quello di un'agenzia |
| Clienti | `De Vincentis Alessio` accanto a `WISELYST S.R.L.` | Togliere il cliente col tuo nome: l'agente lo nota e capisce che è un giocattolo |
| Tabelle | `Tabella test emanuele`, `Tabella di test alessio`, `Test una colonna` | Cancellare tutte e tre e prepararne una vera (§2.3) |
| Agenti | Uno solo, `Preventivo automatico`, descrizione «test» | Rinominarlo o rifarlo, e attivarne almeno un altro dalla libreria |
| Template | Uno solo, chiamato `pi24 -chiastra & patteera - Comunicazione.pdf chiastra e pattera risposta cciaa` | Caricare un template pulito con un nome che si possa leggere ad alta voce |
| Memoria | **Zero ricordi** | Vedi §2.2: senza questo la tappa 4 non esiste |
| Chat per i clienti | La chat di prova `Andrea Scrimieri`, con dentro le domande delle prove | Rifarla pulita col nome di un cliente che ha una cartella vera (§2.4) |

Il resto del materiale invece è buono e non va toccato: **151 documenti
pubblici** (27 prodotti, 6 compagnie, rami auto/cyber/imprese) e **41
documenti privati**.

### 2.2 Riempire la memoria

Il pannello Memoria è a zero, ed è la tappa che più differenzia Velia da un
chatbot. Non si popola a mano: i ricordi nascono dalle conversazioni. Quindi
il giorno prima **si fanno tre o quattro conversazioni vere** con dentro le
informazioni che un'agenzia darebbe naturalmente:

- come si chiama l'agenzia e di quali compagnie è mandataria;
- che i preventivi auto si fanno partendo da un prodotto di riferimento;
- una convenzione o una regola interna («ai clienti storici applichiamo…»);
- una preferenza sul formato delle comunicazioni al cliente.

Poi si controlla che nel pannello siano comparsi, e si cancella quello che
è venuto storto. Ogni ricordo rimanda alla conversazione da cui è emerso:
durante la demo quel rimando va mostrato, è la prova che il sistema non se
l'è inventato.

### 2.3 Preparare le reti di sicurezza

Una domanda sul percorso agentico costa **da 94 a 128 secondi**. In mezz'ora
di demo se ne possono fare tre o quattro, non di più, e ognuna va coperta con
qualcosa da dire o da guardare. Quindi:

- **Una conversazione già fatta con la stessa domanda della tappa 1**, tenuta
  aperta in una scheda del browser. Se il worker fa i capricci, si passa lì e
  la demo non si ferma. Non è barare: è la stessa risposta, prodotta ieri.
- **Una tabella di confronto già costruita e popolata**, per la tappa 3. La
  costruzione dal vivo si mostra fino al momento in cui parte il calcolo,
  poi si passa a quella pronta.
- **Un'esecuzione di agente già andata a buon fine**, con il suo esito, per
  la tappa 5.
- **Un documento già generato dal template**, per la tappa 2.

### 2.4 Preparare la chat del cliente

La Tappa 7 vuole **una chat cliente già pronta**, con un cono vero. Da
`Chat per i clienti → Nuova chat`:

1. titolo e nome di un cliente plausibile (uno di quelli che hanno già una
   cartella: sull'ambiente di prova c'è WISELYST S.R.L.);
2. nel cono, **la sua cartella** e i **tre documenti** di un prodotto auto
   dell'Archivio Pubblico — bastano quelli, e il confronto con «l'archivio
   intero» si racconta meglio se il cono è visibilmente stretto;
3. un'istruzione che si veda all'opera, per esempio: *«Se chiede di un
   sinistro in corso, rimandalo sempre allo sportello.»*;
4. **si copia il link e si apre una volta prima della demo**: serve a
   scaldare la conversazione e a verificare che il cono risponda davvero.

Due cose da sapere, o la tappa si inceppa:

- una chat con il **cono vuoto** non risponde nulla. L'elenco lo segnala in
  giallo, la scheda con un avviso: se li vedi, il cono non è stato salvato;
- una domanda del cliente costa come le altre, **circa un minuto e mezzo**.
  Nella Tappa 7 conviene farne una sola, e sceglierla corta.

> Il link va bene condividerlo a schermo: è un ambiente di prova con
> documenti pubblici e una cartella finta. Con un'agenzia vera, invece,
> quel link è una chiave di casa — e va detto proprio così.

### 2.5 La checklist dei dieci minuti prima

1. **Spegnere il worker locale.** Il worker su Render dev pesca dalla stessa
   coda di quello sulla tua macchina: se sono accesi entrambi si contendono i
   job e la risposta della demo può finire sul processo sbagliato. Questo è
   il modo più stupido di rovinare una demo, ed è anche il più probabile.
2. `curl https://api-dev.sonovelia.it/api/salute` deve rispondere 200.
3. Aprire `app-dev.sonovelia.it`, entrare come **Marta Ferrero**
   (amministratore): serve per far vedere gli Agenti e le Impostazioni.
4. Fare **una domanda qualsiasi** e aspettare che risponda. Serve a scaldare
   il worker e a verificare che l'anello completo giri oggi.
5. Schede aperte e pronte, nell'ordine della scaletta. Niente da cercare
   mentre lui guarda.
6. Notifiche del sistema operativo spente.

> **Non esiste una produzione.** `app.sonovelia.it` e `api.sonovelia.it` non
> risolvono nemmeno in DNS. Se l'agente chiede «e quindi domani mi collego
> dove?», la risposta onesta è che l'ambiente pubblico si accende quando c'è
> il primo cliente. Non promettere un indirizzo che non c'è.

---

## 3. La scaletta, trentacinque minuti

### Apertura — due minuti, a schermo spento

Non si apre il portatile subito. Si fa una domanda e si ascolta:

> «Quando un cliente ti chiama e ti chiede una cosa specifica - se una certa
> situazione è coperta, cosa succede se presta l'auto al figlio - tu quanto ci
> metti a rispondergli con certezza? E dove vai a guardare?»

Serve a due cose. Prima: la risposta che dà diventa **la domanda della tappa
1**, e la demo smette di essere una recita. Seconda: si stabilisce che il
problema non è trovare il documento, è leggerlo tutto ogni volta.

Se non ha voglia di rispondere, si parte con la domanda preparata:

> «Con la Allianz Nuova 4R, il cliente presta l'auto al figlio neopatentato e
> quello fa un sinistro. Cosa succede alla garanzia?»

### Tappa 1 — La domanda vera · sei minuti

**Cosa si fa.** Si scrive la domanda nella chat e si manda.

**Cosa si dice mentre lavora.** Sono due minuti: non si sta zitti e non ci si
scusa del tempo. Si commenta quello che scorre a schermo.

> «Guarda cosa sta facendo. Non sta cercando la risposta in una memoria dove
> l'ha già messa: sta aprendo le condizioni di assicurazione e le sta
> leggendo, come faresti tu. Per questo ci mette un minuto e mezzo invece di
> un secondo. Un sistema che risponde in un secondo su una polizza, o l'ha
> letta prima e si fida della sua memoria, o se la sta inventando.»

Se l'attesa si allunga, si riempie mostrando dove sta pescando: si apre
l'Archivio Pubblico in un'altra scheda e si scorrono le compagnie.

**Che cosa chiedere, per far comparire anche un ricordo.** La domanda di
copertura da sola **non produce nessun ricordo**, ed è giusto così:
l'estrattore scarta i fatti documentali, che stanno già nei documenti. Per
far vedere anche la memoria bisogna dire una **regola**, e conviene
attaccarla alla domanda invece di farne una frase a parte:

> «Da noi, quando si confrontano due kasko, si guarda prima lo scoperto e
> poi il massimale: è quello che il cliente sente in fattura. Con questo
> criterio, sulla grandine come stanno la Nuova 4R e la Nobis Car?»

Esce una risposta vera **e** un ricordo. Il dettaglio su cosa vale e cosa
no è in §3bis.

**Il momento che conta.** Quando la risposta arriva, **non la si legge**. Si
clicca su una citazione: si apre il documento, alla pagina esatta.

> «Questo è il punto. Non ti sto chiedendo di fidarti. Ogni frase che ti dice
> ha sotto la pagina da cui viene, e tu la puoi aprire davanti al cliente.
> Se domani quella risposta finisce in una contestazione, tu hai la carta.»

Per un agente questa è la frase più importante di tutta la demo. La
responsabilità professionale è sua, e un sistema che non gliela lascia
verificare non lo comprerà mai.

**Il bonus da un secondo.** Se sotto un messaggio compare l'etichetta
**Memorizzato**, la si indica: «vedi, questa cosa se l'è segnata». È il
gancio per la tappa 4, e non costa tempo.

### Tappa 2 — Dalla risposta al documento · cinque minuti

**Cosa si fa.** Si indicano i pulsanti sotto la risposta:

- **Esporta la risposta come Word, PDF o testo**
- **Genera un documento da un template dell'agenzia**
- **Invia la risposta per email**

Si clicca il secondo, si sceglie il template dell'agenzia, si guarda uscire
il documento.

**Cosa si dice.**

> «Il tuo cliente non vuole una chat. Vuole una lettera con la tua carta
> intestata. Quello che hai appena visto non finisce qui dentro: esce nel
> formato con cui lavori tu, sul tuo modello, e parte per email senza che tu
> copi e incolli niente.»

**Perché sta qui e non alla fine.** È il momento in cui l'agente smette di
vedere un giocattolo e vede il proprio lavoro finito. Se la demo dovesse
interrompersi dopo dieci minuti, deve aver già visto questo.

### Tappa 3 — Il confronto fra compagnie · cinque minuti

**Cosa si fa.** Sezione **Tabelle** → **Nuova tabella**. Si scelgono tre o
quattro prodotti auto di compagnie diverse - ci sono tutti, e sono veri:

| Compagnia | Prodotto |
|---|---|
| Allianz | Nuova 4R |
| AXA | Nuova Protezione Auto |
| Nobis | Nobis Car |
| UnipolSai | Km&Servizi Autovetture |
| Generali | Contratto Base Autovetture |
| Cattolica | Active Veicoli AUTOPIÙ |

Poi si aggiunge una colonna **scrivendo in italiano** cosa si vuole sapere:
«l'assistenza stradale è compresa o è un'opzione?», «qual è la franchigia
sulla kasko?», «da quanti anni di patente scatta la riduzione?».

**Cosa si dice.**

> «Le colonne non le scelgo da un menu. Le scrivo. Se domani ti serve
> confrontare una cosa a cui nessuno aveva pensato, la scrivi e lui va a
> cercarla in tutte le polizze insieme.»

**La rete.** Il calcolo delle celle richiede tempo. Si mostra la costruzione,
si fa partire, e si passa alla tabella già pronta di §2.3. Da lì si mostra
**Interroga in chat** su una riga: dal confronto si torna alla domanda
puntuale.

**Se il tempo stringe, questa è la prima tappa da tagliare.**

### Tappa 4 — La memoria · tre minuti

**Cosa si fa.** Sezione **Memoria**. Si apre la vista **Globo**, poi si passa
all'**Elenco** e si filtra su **Dell'agenzia**. Si prende un ricordo e si
clicca **Apri la conversazione da cui è emerso**.

**Cosa si dice.**

> «Questo è quello che ha imparato sulla tua agenzia lavorando con te. Non
> gliel'ho configurato io: è uscito dalle conversazioni. E qui sotto c'è da
> dove viene, così se ha capito male lo correggi o lo cancelli.»
>
> «La differenza con un chatbot è tutta qui. Un chatbot ogni mattina riparte
> da zero e tu ogni mattina gli rispieghi chi sei. Questo no.»

Poi si mostra che si può **correggere** il testo di un ricordo. Il controllo
sopra quello che il sistema crede di sapere è ciò che rende accettabile
l'idea che si ricordi qualcosa.

### Tappa 5 — Il lavoro che gira da solo · quattro minuti

**Cosa si fa.** Sezione **Agenti** → **Libreria - agenti predefiniti**. Si
leggono i quattro nomi ad alta voce:

- **Controllo scadenze e rinnovi** - a inizio mese passa in rassegna polizze
  e convenzioni e segnala le scadenze dei sessanta giorni successivi;
- **Monitoraggio nuove edizioni dei preferiti** - ogni mattina controlla i
  set informativi dei prodotti segnati e avvisa quando escono edizioni nuove;
- **Riepilogo settimanale dell'Archivio Privato**;
- **Verifica di un preventivo** - confronta un preventivo con un prodotto di
  riferimento, garanzia per garanzia.

Si apre l'esecuzione già andata a buon fine (§2.3) e si mostra l'esito, le
**Fonti**, e **Approfondisci in chat**.

**Cosa si dice.**

> «Le prime due cose non gliele chiedi. Le fa. La mattina apri e c'è già il
> foglio delle scadenze, o l'avviso che Allianz ha cambiato edizione su un
> prodotto che tu vendi. Quante volte è successo che te ne sei accorto tardi?»

Il monitoraggio delle nuove edizioni è l'argomento che funziona meglio con
chi il mestiere lo fa da vent'anni: è un errore che ha già commesso.

### Tappa 6 — L'Archivio Privato · due minuti

**Cosa si fa.** Si apre l'albero: **Clienti** con dentro le cartelle dei
clienti veri, **Compagnie**. Si entra in una cartella cliente.

**Cosa si dice.**

> «Fin qui ti ho fatto vedere i documenti delle compagnie, che sono uguali
> per tutti. Qui ci sono i tuoi: le polizze che hai emesso, le convenzioni,
> le pratiche. Nella stessa ricerca, con le stesse domande. E restano tue,
> su server europei.»

Chiusura naturale: si è partiti da fuori e si è arrivati dentro casa sua.

### Tappa 7 — La chat che dai al tuo cliente · cinque minuti

È la cosa che nessun agente si aspetta, e per questo va per ultima: dopo
l'ha vista, e tutto il resto si ricolora di conseguenza.

**Cosa si fa.** Si apre **Chat per i clienti** e si mostra una chat già
pronta (§2.4). Poi si entra nella scheda e si fa vedere **il cono di
lettura**: le cartelle spuntate e i prodotti scelti.

> «Questa non è una chat per te. È una chat per il tuo cliente, e legge
> soltanto quello che decidi tu: questa cartella, questi prodotti. Non ha
> modo di arrivare a un altro cliente, perché quei documenti per lei non
> esistono proprio.»

Poi si copia il link e **lo si apre in un'altra scheda**, come farebbe il
cliente dal telefono. Si fa una domanda semplice:

> «Buongiorno, la grandine è coperta dalla mia polizza?»

**Il momento che conta.** Non è la risposta: è **come** risponde.

> «Guarda come le parla. Le dà del lei. E soprattutto guarda cosa fa qui:
> dice che la sua polizza personale non ce l'ha, quindi non può confermarle
> se la garanzia è attiva — e la manda da te. Non prova a fare il tuo
> lavoro.»

Questa è la frase che vende la funzione a un intermediario, perché risponde
alla sua prima paura: che una macchina dica a un suo cliente qualcosa di
sbagliato e poi la firma sia la sua.

**Poi si chiude la porta, davanti a lui.** Si torna nella scheda e si preme
**Sospendi il link**; si ricarica la pagina del cliente e non funziona più.

> «Il link è tuo, non suo. Lo spegni quando vuoi, e da quel momento non
> legge più niente.»

**Cosa non dire.** Non si promette che risponde a tutto: il cono è stretto
per scelta. E non si nasconde che al cliente arrivano risposte senza che
nessuno le abbia riviste — se lo chiede, è una domanda giusta e la risposta
sta in §5.

### Chiusura — tre minuti

Non si riassume la demo: l'ha appena vista. Si chiede.

> «Delle cose che hai visto, quale ti toglierebbe più tempo dalle giornate?»

La risposta dice cosa vendergli e cosa costruire dopo. Poi la proposta
concreta: **un mese sui suoi documenti veri**, con il suo archivio caricato e
i suoi template. Non una prova generica: la sua agenzia dentro.

---

## 3bis. Che cosa dire perché la memoria impari qualcosa

Serve saperlo prima di salire sul palco, perché **la maggior parte delle
frasi non produce nessun ricordo**, e non è un guasto.

L'estrattore ha una regola sola, ed è severa: *un ricordo vale se,
ricomparendo in una conversazione futura, cambierebbe la risposta*. Al
massimo tre per scambio, e meglio nessuno che uno debole.

### Le quattro cose che diventano un ricordo

| Categoria | Che cos'è | Una frase che funziona |
|---|---|---|
| **prassi** | come lavora l'agenzia | «Da noi, nel confronto fra due kasko, si guarda prima lo scoperto e poi il massimale.» |
| **cliente** | contesto stabile su un cliente, utile a servirlo | «La WISELYST ha la flotta tutta a noleggio: le proposte vanno impostate su quello.» |
| **preferenza** | come vuole le cose chi parla | «Le risposte che poi giro al cliente le voglio sempre chiuse con una tabella di confronto.» |
| **decisione** | una scelta presa | «Da quest'anno il nostro riferimento per l'auto è la Nuova 4R: i preventivi li confrontiamo con quella.» |

L'ambito lo decide l'estrattore da solo: **dell'agenzia** se vale per tutti,
**personale** se riguarda solo chi sta parlando. Nel pannello Memoria sono
due filtri diversi, e in demo è una cosa che si mostra bene.

### Quello che non diventa un ricordo, e perché

- **la domanda di copertura** («la grandine è coperta?»): è un fatto
  documentale, sta nei documenti e da lì si rilegge;
- **il racconto di quello che si sta facendo** («ho bisogno di confrontare
  due preventivi»): è un episodio, non una regola;
- **cosa c'è o non c'è in archivio**: cambia, e si guarda nell'archivio;
- **una valutazione su un caso singolo**, a meno che non la si dichiari
  come regola generale. È la differenza fra «qui conviene la kasko» e «da
  noi si propone la kasko sopra i tre anni di vita del veicolo».

### La trappola da evitare davanti a un agente

L'estrattore ha un **perimetro GDPR inderogabile**: rifiuta qualunque
ricordo che contenga codice fiscale, IBAN, email, telefono, data di
nascita, indirizzo, targa, o dati sulla salute. Se in demo si nomina un
cliente vero con i suoi dati, non esce nessun ricordo — e sembrerà che la
funzione non vada, mentre sta facendo esattamente il suo mestiere.

Il nome di un'azienda cliente va bene. I dettagli delle persone no.

### Come mostrarlo bene

1. la regola si dice **dentro** la domanda, non come frase isolata: così la
   risposta è comunque utile e la demo non si ferma;
2. quando il testo finisce **non si passa oltre**: il ricordo arriva dopo,
   col passo «Cerco qualcosa da ricordare», e compare l'etichetta
   **Memorizzato** sotto la risposta;
3. alla Tappa 4 si apre il pannello Memoria e si ritrova lì quello appena
   detto, con il rimando alla conversazione da cui è uscito. È la prova che
   non è un trucco.

> Sul tenant della demo la memoria è **accesa** e i ricordi sono **zero**:
> il primo che si crea è visibilmente il primo. È un vantaggio raro, e vale
> la pena non sprecarlo con una frase che non produce niente.

---

## 4. Cosa non mostrare, e cosa non dire

| Non mostrare | Perché |
|---|---|
| **Impostazioni → MCP** e la scelta dei modelli | Roba da tecnico. A un agente comunica solo che il prodotto è complicato |
| **Segnalazioni**, log, code | Idem |
| Qualunque sezione con dentro dati di prova non ripuliti | Vedi §2.1 |

| Non dire | Dire invece |
|---|---|
| «Usa Claude / GPT / un LLM» | «Legge i documenti e ti dice dove l'ha letto» |
| «Costa X crediti a domanda» | I crediti sono stati tolti dal prodotto il 01/09. Non esistono più: non nominarli |
| «È in produzione» | «L'ambiente pubblico si accende col primo cliente» |
| «Non sbaglia mai» | «Ti fa vedere la pagina, così controlli tu». È più forte e non ti espone |
| «Ci mette un po' perché è lento» | «Ci mette un minuto perché sta leggendo davvero» |

---

## 5. Le domande che farà, e come si risponde

**«E se sbaglia?»**
Ti dà sempre la pagina. La responsabilità resta tua, come adesso, ma il tempo
per verificare passa da venti minuti a venti secondi.

**«I miei dati dove finiscono?»**
Server europei. I documenti della tua agenzia sono separati da quelli di
chiunque altro, e il sistema non li usa per addestrare niente.

**«Ci sono tutte le compagnie?»**
Oggi ce ne sono sei, con ventisette prodotti, sui rami auto, cyber e imprese.
Le compagnie che ti servono si aggiungono: è lavoro di giorni, non di mesi.
*(Non promettere «ci sono tutte»: si verifica in due minuti ed è la fine
della credibilità.)*

**«Quanto costa?»**
Se il prezzo non è ancora deciso per lui, non improvvisarlo davanti allo
schermo: «facciamo il mese di prova sui tuoi documenti, il numero te lo do
con una proposta scritta».

**«Lo sa usare la mia segretaria?»**
Si scrive una domanda in italiano. Se sa mandare un messaggio, sa usarlo. E
si può anche dettare a voce, col microfono nella barra del messaggio.

**«Quanto ci mette a partire?»**
Il tempo di caricare i suoi documenti e i suoi template. L'archivio delle
compagnie c'è già.

**«E se dice una cosa sbagliata al mio cliente?»**
È **la** domanda sulla chat cliente, e arriverà. Non va aggirata.

Quello che si può dire con onestà: legge solo i documenti che gli hai dato
tu; non dà consigli e non dice se una polizza conviene; ogni numero che
scrive porta la pagina da cui viene; quello che non trova lo dichiara invece
di indovinarlo; e su qualunque cosa riguardi un caso concreto rimanda in
agenzia. È scritto nelle sue regole, non è una speranza — nella Tappa 7 l'ha
appena visto succedere.

Quello che **non** si può dire è che non sbaglierà mai. E se insiste, la
risposta vera è: «lo tieni spento finché non ti fidi, e lo accendi su un
cliente alla volta». Il link si sospende in un clic, e questo è un
argomento migliore di qualunque rassicurazione.

**«Il cliente può vedere i documenti di un altro?»**
No, e non per una regola scritta da qualche parte: i documenti fuori dal
cono **non vengono nemmeno messi** dove l'assistente può leggerli. Non li
trova perché per lui non esistono.

---

## 6. Piano B

| Se succede | Cosa fai |
|---|---|
| La risposta non arriva in tre minuti | Passi alla scheda con la conversazione già fatta. «Questa è la stessa domanda di ieri, così non ti faccio aspettare» |
| L'app non si apre | Hai la registrazione o gli screenshot su un'altra macchina. Non provi a riavviare niente davanti a lui |
| Una tabella resta vuota | Passi a quella pronta, senza commentare |
| Ti chiede una compagnia che non c'è | «Non ce l'ho ancora. Vuoi che ce la metta per la prossima volta?» - e diventa il motivo del secondo incontro |
| Ti chiede una funzione che non esiste | «No, oggi non lo fa.» Punto. Un no netto compra più fiducia di un forse |

---

## 7. Versione da quindici minuti

Si tengono quattro pezzi e si tagliano tabelle, archivio privato e la vista
Globo della memoria.

| Minuti | Tappa |
|---|---|
| 2 | Apertura a schermo spento: la sua domanda |
| 6 | La domanda vera in chat, la citazione che si apre alla pagina |
| 4 | Il documento generato sul template e mandato per email |
| 3 | Gli agenti sui cicli: scadenze e nuove edizioni |

La memoria si porta a casa gratis, indicando l'etichetta **Memorizzato**
sotto la risposta durante la seconda tappa — a patto che la domanda porti
dentro una regola, come spiega §3bis.

**Lo scambio che vale la pena valutare.** Se l'agente che hai davanti è uno
che il tempo lo misura in clienti e non in ore, i tre minuti degli agenti si
danno alla **chat del cliente**: si apre il link, si fa una domanda, si fa
vedere che rimanda in agenzia, e si sospende. Colpisce più forte, e apre una
conversazione commerciale diversa — non «mi fai risparmiare tempo» ma «posso
dare qualcosa ai miei clienti che gli altri non danno».

Non si fanno entrambe in quindici minuti: sono due domande al motore, e sono
tre minuti solo di attesa.
