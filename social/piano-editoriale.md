# Piano editoriale social — settembre 2026

Il primo mese di pubblicazione per LinkedIn, Facebook e Instagram. Le
immagini stanno in `social/contenuti/` e si rigenerano con
`powershell -ExecutionPolicy Bypass -File social/genera-contenuti.ps1`.

## I principi

- **Una voce sola.** Velia parla in prima persona solo nella firma e nel
  «Ciao, sono Velia.»; il resto dei testi parla di lei in terza persona,
  come sul sito. Niente punti esclamativi, niente inglese di maniera,
  niente trattini lunghi.
- **Tre rubriche fisse**, così il feed si riconosce a colpo d'occhio:
  - *Sotto il cofano*: cosa fa il prodotto, un pezzo alla volta.
  - *La fonte, sempre*: la promessa di fiducia, il tema che distingue.
  - *Glossario* e *Dal campo*: il lato educativo e la vita d'agenzia.
- **Cadenza**: tre uscite a settimana. Il martedì il post di sostanza su
  LinkedIn (mattina, 8:30–9:00), il giovedì il carosello su Instagram e
  Facebook (12:30–13:00), il venerdì un'uscita leggera. Facebook
  riprende quasi tutto; Instagram solo ciò che regge in un'immagine.
- **Adattamenti**: su LinkedIn testi più distesi e niente hashtag oltre
  i 3–4; su Facebook lo stesso testo accorciato; su Instagram didascalia
  breve e il blocco hashtag fisso:
  `#assicurazioni #agenziaassicurativa #broker #intermediariassicurativi #insurtech #intelligenzaartificiale`
- **Caroselli su LinkedIn**: caricare le cinque tavole come documento
  (LinkedIn le sfoglia come un PDF) o come post a più immagini.
- **Link**: su LinkedIn il link a sonovelia.it va nel primo commento,
  non nel post (il feed penalizza i link esterni). Su Instagram il link
  è quello in bio.

## Il calendario in breve

| Data | Rubrica | Formato | Immagini | Dove |
| --- | --- | --- | --- | --- |
| mar 1/9 | Lancio | card | `card-lancio.png` | LI + FB + IG |
| gio 3/9 | La fonte, sempre | carosello 5 tavole | `carosello-fonti-1..5.png` | IG + FB + LI |
| ven 4/9 | La voce | card | `card-slogan.png` | IG (feed e storia) |
| mar 8/9 | Sotto il cofano | card | `card-confronto.png` | LI + FB |
| gio 10/9 | Glossario | carosello 5 tavole | `carosello-glossario-1..5.png` | IG + FB |
| ven 11/9 | Dal campo | card | `card-dal-campo.png` | LI |
| mar 15/9 | Sotto il cofano | card | `card-documenti.png` | LI + FB + IG |
| gio 17/9 | Dal campo | carosello 5 tavole | `carosello-settimana-1..5.png` | IG + FB + LI |
| ven 18/9 | Sotto il cofano | card | `card-strumenti.png` | LI |
| mar 22/9 | Il prodotto in video | video nativo | `website/public/media/memoria-viva.mp4` | IG Reel + LI + FB |
| gio 24/9 | Glossario, puntata 2 | carosello | da rigenerare, vedi nota | IG + FB |
| ven 25/9 | La voce | solo testo | nessuna | LI |
| mar 29/9 | Richiedi una demo | card | `card-demo.png` | LI + FB + IG |

Nota per il 24/9: il generatore è guidato dai dati, basta sostituire i
tre termini nello spec del carosello glossario (per la puntata 2:
Scoperto, Carenza, Regola proporzionale) e rilanciarlo.

Nota sugli screen dell'app: `card-confronto` (la tabella delle
garanzie), `card-dal-campo` e la tavola 2 del carosello fonti (la
risposta con FONTI e il cartellino MEMORIA) montano fotogrammi veri del
video della home, non mock. I sorgenti stanno in `social/screen/` e il
comando per estrarne altri è documentato in testa a
`genera-contenuti.ps1`. Il reel `velia-piattaforma.mp4` invece NON va
usato: è un vecchio mock col marchio «Assieme» e testo artefatto.

---

## I testi, uscita per uscita

### mar 1/9 — Lancio: «Ciao, sono Velia.»

**LinkedIn**

> Ciao, sono Velia.
>
> Sono l'AI di Blusail Technologies per la distribuzione assicurativa:
> agenzie, broker, intermediari. Conosco i prodotti, le circolari e la
> casistica che l'agenzia ha già risolto, e rispondo alle domande di
> tutti i giorni citando la fonte in ogni passaggio.
>
> Da oggi questa pagina racconta come lavoro, un pezzo alla volta: le
> risposte con la fonte, i confronti in tabella, i documenti che escono
> già impaginati col marchio dell'agenzia.
>
> Se nel frattempo volete vedermi all'opera, il sito è nel primo
> commento.

**Facebook**: stesso testo senza l'ultimo paragrafo, link diretto a
sonovelia.it in coda.

**Instagram**

> Ciao, sono Velia. L'AI che conosce come lavora la tua agenzia
> assicurativa e risponde con le sue parole. Qui raccontiamo come,
> un post alla volta. [blocco hashtag]

### gio 3/9 — Carosello «Da dove viene questa risposta?»

**Instagram e Facebook** (didascalia)

> Ogni risposta di Velia arriva con la fonte: il documento, la pagina,
> la data. E quando la fonte non c'è, lo dice. In un lavoro dove ogni
> parola pesa, è la differenza tra un consiglio e una scommessa.
> Sfoglia. [blocco hashtag su IG]

**LinkedIn** (post col documento allegato)

> In un settore vigilato la domanda giusta non è «l'AI risponde bene?»
> ma «da dove viene questa risposta?». Cinque tavole su come Velia
> tratta le fonti: sempre citate, mai inventate.

### ven 4/9 — Card «Conosce come lavori, risponde come voi.»

**Instagram** (feed e storia)

> Otto parole che spiegano tutto il progetto. [blocco hashtag]

### mar 8/9 — Le tabelle di confronto

**LinkedIn e Facebook**

> Decine di prodotti a confronto, la fonte in ogni casella.
>
> Le tabelle di analisi di Velia nascono per il momento in cui il
> cliente chiede «e rispetto a quella che ho adesso?»: garanzie,
> massimali e franchigie fianco a fianco, e ogni valore rimanda al
> punto esatto del fascicolo da cui viene. Verificabile riga per riga,
> anche dal cliente.

### gio 10/9 — Carosello glossario, puntata 1

**Instagram e Facebook**

> Franchigia, massimale, rivalsa: tre parole che in agenzia si
> spiegano dieci volte al giorno. Le abbiamo scritte come si spiegano
> al bancone, da girare a chi ne ha bisogno. Il glossario completo è
> su sonovelia.it. [blocco hashtag su IG]

### ven 11/9 — Dal campo

**LinkedIn**

> Quello che sa il collega più esperto, a portata di domanda.
>
> In ogni agenzia c'è la persona a cui tutti chiedono. Il punto debole
> è che quella conoscenza vive in una testa sola: quando è in ferie,
> l'agenzia rallenta. Velia impara dalla casistica risolta e la
> restituisce a tutti, con la fonte. La memoria smette di essere un
> fatto personale e diventa un patrimonio dell'agenzia.

### mar 15/9 — I documenti col marchio

**LinkedIn e Facebook**

> Il documento per il cliente esce già impaginato, col tuo marchio.
>
> La risposta giusta spesso deve diventare una pagina da mandare: un
> confronto, una sintesi, una spiegazione. Velia la impagina con
> l'intestazione dell'agenzia, pronta da inviare. Il tempo risparmiato
> non è quello della risposta: è quello del documento da confezionare
> dopo.

**Instagram**: la card con una riga sola: «Dalla domanda al documento
pronto, senza passare dall'impaginazione.» [blocco hashtag]

### gio 17/9 — Carosello «Una settimana in agenzia»

**Instagram e Facebook**

> Lunedì la circolare, mercoledì il preventivo da difendere, venerdì
> il documento per il cliente. Una settimana qualunque, con Velia alla
> scrivania. E il lunedì dopo, tutto quello che avete risolto è già
> memoria. [blocco hashtag su IG]

**LinkedIn** (post col documento allegato)

> Non un elenco di funzioni: una settimana qualunque, vista dalla
> scrivania di chi sta in agenzia. Cinque tavole.

### ven 18/9 — Gli archivi e gli strumenti AI

**LinkedIn**

> I tuoi archivi parlano anche con gli strumenti AI che già usi.
>
> Il lavoro fatto per ordinare documenti, regole e casistica dentro
> Velia non resta chiuso lì: gli archivi si collegano anche agli
> strumenti di AI che l'agenzia già usa. Un investimento solo, che
> vale per tutto il resto.

### mar 22/9 — Il prodotto in video

**Instagram Reel, LinkedIn e Facebook** (video nativo
`memoria-viva.mp4`, già nel repo)

> Una conversazione vera con Velia: la domanda, il confronto, la fonte
> citata, il documento. Novanta secondi, senza tagli. [blocco hashtag
> su IG]

### gio 24/9 — Carosello glossario, puntata 2

Stessa didascalia della puntata 1, coi termini nuovi: scoperto,
carenza, regola proporzionale. Tavole da rigenerare col generatore.

### ven 25/9 — Perché mi chiamo Velia (solo testo)

**LinkedIn**

> Una nota personale, per una volta.
>
> Velia si presenta per nome e parla in prima persona. Non è un vezzo:
> è una promessa di responsabilità. Un motore anonimo può permettersi
> risposte vaghe; qualcuno che si firma, no. Per questo ogni risposta
> porta la fonte, e quando la fonte non c'è, lo dico.
>
> firmato: Velia

### mar 29/9 — Chiusura del mese: la demo

**LinkedIn e Facebook**

> Un mese fa questa pagina ha iniziato a raccontare come lavora Velia:
> le fonti citate, le tabelle di confronto, i documenti col marchio,
> la memoria che resta all'agenzia.
>
> Il modo migliore per giudicare non è un post: è vederla all'opera
> sulla vostra casistica. La demo si richiede dal sito, due minuti.

**Instagram**

> Vedila all'opera sulla tua casistica. La demo si richiede dal link
> in bio. [blocco hashtag]

---

## Dopo settembre

Il mese due ripete lo schema con i pezzi che mancano: la sicurezza dei
dati (pagina /sicurezza del sito), gli agenti, la biblioteca pubblica,
la seconda puntata di «Una settimana in agenzia». Le rubriche e i
template grafici restano gli stessi: cambiano solo i dati nello spec
del generatore.
