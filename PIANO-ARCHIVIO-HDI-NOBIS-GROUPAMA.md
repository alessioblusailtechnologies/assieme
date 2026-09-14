# Piano archivio - HDI, Nobis e Groupama, le tre compagnie a un ramo solo

Censimento fatto il 13/09/2026 sui tre siti. Da qui si riprende senza
rifare la ricognizione.

## Perché

Va data in demo l'applicativo a un agente che lavora con **Generali,
Zurich, Nobis, Groupama, HDI e Unipol**. L'archivio pubblico è condiviso:
l'agente cerca i suoi prodotti, e dove non c'è nulla la risposta è «non
lo so».

Al 14/09/2026, chiuso il lotto HDI:

| Compagnia | Rami | Prodotti | Doc | Pagine |
|---|---|---|---|---|
| UnipolSai | 8 | 25 | 138 | 2.827 |
| Zurich | 5 | 16 | 51 | 1.124 |
| Generali | 4 | 9 | 34 | 730 |
| **HDI** | **5** | 10 | 33 | 445 |
| **Nobis** | **1** (auto) | 8 | 60 | 591 |
| Allianz | 1 (auto) | 5 | 30 | 688 |
| AXA | 1 (auto) | 6 | 22 | 542 |
| **Groupama** | **1** (auto) | 5 | 15 | 336 |
| Cattolica | 1 (auto) | 1 | 3 | 140 |

Totale: **386 documenti, 7.423 pagine**.

Delle tre compagnie a un ramo solo, **HDI è uscita dal gruppo** il
14/09/2026: ha cinque rami (auto, viaggi, cyber, infortuni, casa) ed è la
terza dell'archivio per copertura. Restano Nobis e Groupama, che
rispondono ancora **solo sull'auto**. Di Nobis, leader di mercato sul
viaggio, in archivio non c'è una sola polizza viaggio. Generali ha il suo
piano a parte, **PIANO-ARCHIVIO-GENERALI.md**.

## Il quadro, dopo il censimento

| | Prodotti ingeribili | Pagine stimate | Forma di pubblicazione |
|---|---|---|---|
| HDI | 41, di cui **4 fatti** | ~1.350 | **sempre a pezzi: 3 file** (DIP + DIP aggiuntivo + Condizioni), da concatenare ogni volta |
| Nobis | 41 | ~1.800 | **sempre set unico**, un PDF per prodotto |
| Groupama | 83 | ~4.800 | **96% set unico**; a pezzi solo i tre previdenziali |

Nessuno dei tre siti è dietro challenge: si leggono con WebFetch, senza
Chrome. **I numeri di pagine sono tutti stime**, perché nessuno dei tre
espone il conteggio: sono calibrate sui set auto già in archivio (HDI
22-65 pagine a set, Nobis ~13,5 KB per pagina dal `Content-Length`,
Groupama 57-81 a set). Errore atteso ±25%: **verificato sul lotto HDI,
dove le quattro stime hanno sbagliato fino al 35% sul singolo set ma solo
del 2% in aggregato** (180 stimate contro 177 vere).

## Stato

**Lotto HDI: chiuso il 14/09/2026.** Quattro set, quattro rami nuovi, un
commit per set. 177 pagine, ~6,0 milioni di token, catalogo da 373 a 386
documenti.

| Set | Ramo aperto | Pagine (stimate → vere) | Token | Correzioni del secondo sguardo |
|---|---|---|---|---|
| **# Viaggio Singolo** | `viaggi` | 30 → **36** | ~1,05 M | 12 |
| **Rischi Informatici HDI** | `cyber` | 35 → **32** | ~1,04 M | 0 |
| **Protezione Infortuni HDI** | `infortuni` | 40 → **54** | ~1,95 M | 6 |
| **Globale Casa** | `casa` | 75 → **55** | ~1,95 M | 4 |

Convenzioni del lotto in `lavorazione-visiva/convenzioni-hdi.md` (esteso
il 14/09) e `convenzioni-hdi-viaggi.md`.

Fuori piano, nella stessa sessione: **riparati gli otto INDICE
dell'archivio che erano rimasti senza la sezione `## Garanzie e rischi
trattati`** (i due Scudo Cyber, i tre Focus, i due Contratto Base di
Generali, Unica Servizi Telematici). Da 2,6-3,2 KB a 20-89 KB, 717 voci
di garanzia aggiunte, ~2,0 M di token. Ora tutti e 66 gli INDICE hanno
quella sezione. Restano da decidere una decina di correzioni al testo
preesistente di quegli indici, segnalate e non applicate: vedi
«Correzioni in sospeso» in fondo.

### Prossimi lotti

- [ ] **Nobis, primo lotto**, in corso dal 14/09/2026. I quattro PDF sono
  gia scaricati in `local-ingestion/in-arrivo/nobis-lotto1/`: **227 pagine
  vere** contro le ~180 stimate, quindi ~7,7 M al costo misurato.
  Convenzioni in `lavorazione-visiva/convenzioni-nobis.md`.
  - [x] **Nobis Viaggio Easy Completa** (ed. 05/2026, 59 pagine, 4
    documenti): in archivio, apre il ramo `viaggi` per Nobis. Catalogo a
    390 documenti.
  - [ ] Filo diretto Tutela (`tutela`, 32 pagine)
  - [ ] Commercio su Misura (`imprese`, 44 pagine)
  - [ ] Nobis Casa & Noi (`casa`, **92** pagine contro le ~60 stimate)
- [ ] **Groupama, primo lotto a costo minimo**: Casa Senza Confini
  (`casa`), Groupama Benessere InSalute (`salute`), Groupama Protezione
  Infortuni (`infortuni`), Tutela Legale Famiglia (`tutela`). ~280 pagine
  stimate, **~9,5 M**.
- [ ] **Groupama, Agrirama e DinamicaBusiness 360**: ~280 pagine, **~9,5 M**.
  Apre `agricoltura`, ramo nuovo per l'intero archivio: va deciso se
  serve alla demo.

## Il primo lotto, compagnia per compagnia

Il criterio è uno solo: **quanti rami nuovi si aprono per token speso**.
Un ramo scoperto è una risposta «non lo so» in demo; un secondo prodotto
in un ramo già coperto è profondità, che serve dopo.

### HDI - FATTO il 14/09/2026

I quattro set sono in archivio: `viaggi`, `cyber`, `infortuni`, `casa`.
Restano fuori, se un giorno servissero: **Professionista HDI Lex** (5892,
~30 pagine), unico modo di aprire `tutela` in HDI perché per i privati la
tutela legale è sempre una garanzia dentro altre polizze, e i buchi di
mobilità elencati più sotto.

Che cosa hanno portato dentro, oltre al ramo:

- **# Viaggio Singolo**: tre combinazioni predefinite Large/Medium/Small.
  Nessuna garanzia infortuni, nonostante il Glossario definisca morte e
  invalidità; spese mediche in Italia ferme a 1.000 euro anche in Large
  contro 3.000.000 fuori Italia.
- **Rischi Informatici HDI**: secondo cyber del catalogo, e primo
  confronto possibile con Unipol Scudo Cyber. Due sezioni contro tre,
  niente tutela legale, ma in più i Costi e spese PCI e la responsabilità
  multimediale. Nessun importo nelle Condizioni: massimali e franchigie
  stanno solo nel DIP Aggiuntivo.
- **Protezione Infortuni HDI**: fino a 10 persone con un contratto, quattro
  sezioni, 17 garanzie in una matrice di composizione, sei franchigie e
  cinque tabelle di valutazione. La franchigia 3% assorbibile paga fino al
  200% della somma assicurata: non è una franchigia, è un moltiplicatore.
- **Globale Casa**: cinque sezioni. La sezione Incendio è **all risks
  vera**, quindi l'elenco dei rischi coperti non esiste e va letto per
  differenza dalle 32 esclusioni. **Nessuna copertura catastrofale in
  nessuna forma**, a differenza di Unipol e Generali nello stesso ramo.

### Nobis - quattro rami in ~180 pagine

| Set | Ramo che apre | Pagine | Pagina prodotto (sotto `nobis.it/assicurazioni/`) |
|---|---|---|---|
| **Filo diretto Tutela** | `tutela` | ~30 | `privati/casa/filo-diretto-tutela/` |
| **Nobis Viaggio Easy Completa** | `viaggi` | ~45 | `privati/viaggi/nobis-viaggio-easy/set-informativi/` |
| **Commercio su Misura** | `imprese` | ~45 | `business/casa-e-varie/commercio-su-misura/` |
| **Nobis Casa & Noi** | `casa` | ~60 | `privati/casa/nobis-casa-e-noi/` |

**Viaggio Easy è il set più importante dei tre lotti.** Nobis è leader di
mercato sul viaggio e ha una gamma di sei varianti (Completa,
Annullamento, Incoming, Schengen, Spese Mediche, Gruppi) più Più Viaggi
annuale: nessun'altra compagnia dell'archivio ha una gamma viaggio vera.
Se dopo il primo lotto si vuole profondità da qualche parte, è lì.

Commercio su Misura ha lo stesso taglio di Focus Commercio di Unipol, già
in archivio: si confrontano.

### Groupama - quattro rami in ~280 pagine (o ~470 per il taglio ricco)

Due strade, e vale la pena scegliere consapevolmente.

**A costo minimo** (~280 pagine, apre `casa`, `salute`, `infortuni`, `tutela`):

| Set | Ramo | Pagine |
|---|---|---|
| **Casa Senza Confini** | `casa` | ~110 |
| **Groupama Benessere InSalute** | `salute` | ~80 |
| **Groupama Protezione Infortuni** | `infortuni` | ~60 |
| **Tutela Legale Famiglia** | `tutela` | ~30 |

**A resa massima** (~470 pagine, apre anche `imprese` e di fatto il cyber):
si sostituiscono gli ultimi due con **Agrirama** (~130) e
**DinamicaBusiness 360** (~150).

- **Agrirama** apre l'agricoltura, dove Groupama è storicamente forte
  (nasce come mutua agricola) e dove **l'archivio è a zero per tutte e
  nove le compagnie**. Un solo file copre incendio, furto, RC, infortuni e
  tutela legale dell'azienda agricola.
- **DinamicaBusiness 360** è l'unico posto dove il cyber di Groupama è
  scritto: la compagnia **non ha un prodotto cyber autonomo**, è un modulo
  interno. Copre da solo le sei landing PMI (artigiani, bar, alimentare,
  tessile, trasporti, cyber).

## L'ordine consigliato

1. ~~**HDI, primo lotto**~~ **fatto il 14/09/2026** (177 pagine, 6,0 M).
2. **Nobis, primo lotto** (~180 pagine, ~6 M). Porta in archivio la gamma
   viaggio che manca a tutti, ed è la compagnia più economica da ingerire
   delle tre: set unico, un PDF per prodotto, nessuna concatenazione.
3. **Groupama, primo lotto a costo minimo** (~280 pagine, ~9,5 M).
4. **Groupama, Agrirama e DinamicaBusiness 360** (~280 pagine, ~9,5 M).
   Da qui in poi si sta aprendo `agricoltura`, ramo nuovo per l'intero
   archivio: va deciso se serve alla demo.

Coi passi 2 e 3, **~460 pagine e circa 15,5 milioni di token**, anche
Nobis e Groupama passano da un ramo a cinque.

## Quanto costa, e su che base

**Numeri rifatti il 14/09/2026 sul lotto HDI**, che è il primo lotto
misurato per intero set per set. I vecchi numeri, presi dal lotto Unipol,
sottostimavano del 70%.

| Set | Pagine | Trascrizione | Secondo sguardo | INDICE | Totale | Token a pagina |
|---|---|---|---|---|---|---|
| # Viaggio Singolo | 36 | 465 mila | 303 mila | 233 mila | ~1,05 M | 29 mila |
| Rischi Informatici | 32 | 645 mila | 117 mila | 239 mila | ~1,04 M | 32 mila |
| Protezione Infortuni | 54 | 1,25 M | 351 mila | 310 mila | ~1,95 M | 36 mila |
| Globale Casa | 55 | 1,24 M | 330 mila | 342 mila | ~1,95 M | 35 mila |

La regola pratica diventa **pagine × 34 mila token**, con un pavimento di
**~1 milione a set**. Sotto le ~40 pagine il costo per pagina non scende
più, perché l'INDICE pesa un quarto del totale e non si comprime.

Perché il triplo della stima vecchia:

- **il grassetto si misura**. In questi PDF il grassetto è **sintetico**:
  nessun font Bold incorporato, quindi né `pdftohtml` né il nome del font
  lo distinguono, e va misurato sullo spessore delle aste su un rendering
  a 400-800 dpi. Farlo blocco per blocco ha portato la trascrizione da
  ~13 a ~23 mila token a pagina. Toglierlo farebbe risparmiare un terzo
  del lotto, ma il primo set ha mostrato sei celle marcate in grassetto
  che erano solo sottolineate;
- **l'INDICE è cresciuto di standard**. La mediana d'archivio è 46 KB;
  quelli di questo lotto vanno da 54 a 115 KB. Costano 230-340 mila token
  l'uno e non si comprimono;
- **il secondo sguardo costa poco quando la trascrizione è buona**
  (117 mila sul set cyber, zero correzioni) e caro quando c'è da guardare
  (351 mila sul set infortuni). È il costo giusto da pagare: su quel set
  ha trovato una frase riformulata invece che copiata.

Il costo scende se in archivio c'è già un **gemello dello stesso ramo** da
cui copiare taglio e tono dell'INDICE. Per i due lotti che restano il
gemello c'è quasi sempre: `viaggi` ha ora quattro prodotti, `casa` sette,
`tutela` due, `imprese` tre, `salute` due, `infortuni` quattro. L'unico
senza gemello è **agricoltura**.

Più 4 dollari ogni 1.000 pagine di Mistral OCR, che è il testimone.

**Le stime di pagine del censimento sbagliano parecchio sul singolo set**
(Protezione Infortuni 40 stimate contro 54 vere, Globale Casa 75 contro
55), ma tengono in aggregato: 180 stimate contro 177 vere sul lotto. Per
decidere se fare un set, va bene la stima; per dire quanto costa, il
numero vero si sa solo dopo aver scaricato i pezzi.

## Come pubblicano, e dove sono le trappole

### HDI

- **Mai un set unico**: sempre tre file su host esterno
  `hdiassicurazioni.youser.tech/upl/documents/prodotti/<cartella>/`, da
  concatenare nell'ordine DIP → DIP aggiuntivo → Condizioni.
- Codici modello leggibili: radice numerica per prodotto, prefisso
  `DP`/`DS` = DIP, `DAP`/`DAS` = DIP aggiuntivo, `P`/`S` = Condizioni;
  serie `5xxx`/`7xxx` danni, `4xxx` persona; suffisso `_MM_AAAA`.
- **Nessuna edizione storica** esposta, verificato anche con Chrome vero.
- **Un gruppo di prodotti ha le Condizioni ferme al 01/2019** mentre DIP e
  DIP aggiuntivo sono 2026: va annotato nelle convenzioni del lotto,
  altrimenti sembra un errore di raccolta.
- Molti nomi di file **con spazi**, da URL-encodare; lo slug della pagina
  è spesso diverso dalla cartella dei documenti, quindi l'URL non si
  deriva dallo slug.
- **Il tronco «RC Rischi Diversi» (5621)**: cinque prodotti (RC beni
  immobili E, insegnanti B, musei A, sport C, alberghi F) condividono lo
  **stesso DIP e le stesse Condizioni** e si distinguono solo per il DIP
  aggiuntivo. Ingerirli come cinque set separati duplicherebbe due terzi
  del contenuto: vanno fatti come un set madre più cinque appendici.
- Le pagine «professionisti» e «aziende» di molti prodotti sono gemelle e
  puntano **agli stessi PDF**: è un set solo, non due.
- Da escludere: **HDI Insieme** non è un prodotto ma il servizio scatola
  nera di Auto HDI Autovettura; `globale-infortuni-pmi` risponde 404.

### Nobis

- **Un solo soggetto giuridico**: Nobis Compagnia di Assicurazioni S.p.A.
  (Gruppo IVA AXA Italia dal 2025), che ha assorbito Filo diretto
  Assicurazioni e il portafoglio danni di Darag Italia. «Nobis» e «Filo
  diretto» sono due **marchi commerciali**, non due compagnie: a catalogo
  restano tutti `cmp-nobis`. `filodiretto.it` non risolve più.
- **Sempre set unico**, un PDF per prodotto. Nessuna concatenazione,
  nessun modulo condiviso, nessun sito protetto: è la compagnia più
  economica da ingerire delle tre.
- URL dei PDF sotto `/Sites/402/WebExplorer/...` (402 è il sito corrente;
  390 e 394 sono i vecchi, alcuni link puntano ancora lì e funzionano).
- **Attenzione all'edizione**: il codice in copertina (`NCE.2022-2026.001`)
  è modello più edizione tariffaria; la data vera è l'«aggiornato alla
  data del...» nel DIP. Il `Last-Modified` HTTP è un indizio, non la data
  d'edizione.
- Pagina indice utile per battezzare i set:
  `/assicurazioni/schede-prodotto-per-i-distributori-pog/`, che elenca
  codici modello e nomi ufficiali.
- Da escludere in blocco: `/assicurazioni/polizze-connesse-finanziamenti/`
  elenca oltre 120 set (GAP, kasko finanziaria, protezione pneumatici) per
  18 finanziarie, con tutte le storiche. Sono accessori auto venduti in
  concessionaria, ramo già chiuso.
- Da escludere: i prodotti **fuori commercio ex Darag** (Nobis Casa 2019,
  Filodiretto Casa, Casa Serena, Soluzione Condominio e altri), PDF
  2020-2021 da 2-3 MB, quasi certamente scansioni: ingestione cara e
  valore basso. E i prodotti con la sola scheda POG e nessun set.
- **Nobis Vita** (`nobisvita.it`) è una compagnia sorella: fuori perimetro.

### Groupama

- **96% set unico**: un PDF per prodotto, copertina + DIP + DIP aggiuntivo
  + Condizioni + glossario. PDF su `cdn.groupama.it/app/uploads/AAAA/MM/`,
  i legacy su `www.groupama.it/app/uploads/`.
- Il censimento si fa dal **`product-sitemap.xml`** (65 pagine prodotto):
  i link ai PDF sono già nel sorgente HTML, non serve Chrome.
- **Molte etichette di edizione sulla pagina sono stantie**: dicono «ED
  12-2019» ma linkano il PDF 02/2026. L'edizione vera è nel nome del file,
  non nel testo del link.
- Le cinque polizze grandine e agevolate stanno sulla pagina «coperture
  personalizzate», non su quella agricoltura: senza censimento non si
  trovano.
- Le 11 pagine per singola professione sono **landing di marketing**:
  puntano tutte a tre set più Groupama Professioni. Non sono 11 prodotti.
  Stesso discorso per artigiani, bar, impresa alimentare, tessile,
  trasporto merci.
- **Niente viaggi, niente cyber autonomo, niente micromobilità.** I primi
  due non esistono a catalogo; il cyber è un modulo dentro
  DinamicaBusiness 360 e DinamicaPlus Commercio.
- I tre previdenziali (PIP, Programma Per Te, Programma Open) non sono set
  informativi ISVAP ma Nota Informativa più schede più regolamento, su
  12-28 file. Costo alto, resa bassa: fuori dal primo giro.

## Che cosa manca ancora sulla mobilità

Il ramo auto di queste tre compagnie è considerato chiuso, ma il
censimento ha trovato dei buchi. Sono fuori dai lotti qui sopra, e vanno
presi solo se serve completezza sulla mobilità:

| Compagnia | Prodotto | Pagine | Nota |
|---|---|---|---|
| HDI | **Mio Camper / Polizza del Camperista** | ~50 | globale multigaranzia, non un RC: il più rilevante dei due |
| HDI | **Unità da Diporto** (T7021) | ~30 | DIP 07/2025, Condizioni 01/2019 |
| Groupama | **Ondamica** (natanti) | ~70 | ed. 01/2026 |
| Groupama | **Globale GT Yacht** | ~60 | ed. 02/2026 agg. 09/2026 |
| Groupama | **Contratto Base** Autovetture e Motoveicoli | ~30 cad. | i due Preventivass, ed. 11/2021 |

**Groupama non vende micromobilità**: `mobilita-alternativa/` è una pagina
editoriale senza prodotto. Non è un buco dell'archivio, è un buco del
catalogo. Nobis copre monopattini e quadricicli dentro **Nobis Bike**, che
è già in archivio.

## Il giro completo su un set

È lo stesso dei lotti Unipol e Generali, e sta scritto per esteso in
**PIANO-ARCHIVIO-UNIPOL.md**, sezione «Il giro completo su un set»:
procurare (`/procura-set`), trascrivere a blocchi con un coordinatore per
set, assemblare, i due testimoni meccanici, il secondo sguardo sulle
pagine segnalate più una ogni dieci a caso, l'INDICE col gemello accanto,
il caricamento con un commit per set.

Le lezioni che valgono anche qui, tutte in PIANO-ARCHIVIO-UNIPOL.md,
sezione «Cosa ha insegnato questo lotto». Le tre che pesano di più:

- **il grassetto si misura, non si giudica a occhio**
  (`pdftohtml -xml -fontfullname`);
- **i «numeri comparsi» del testimone di fedeltà sono il sintomo di numeri
  inventati**, e vanno girati al secondo sguardo come domanda esplicita;
- **un errore trovato una volta si previene**, mettendolo nel prompt del
  coordinatore, invece di ricorreggerlo a valle.

## Cosa ha insegnato il lotto HDI

Da mettere nel prompt dei coordinatori dei prossimi lotti, perché un
errore trovato una volta si previene invece di ricorreggerlo a valle.

- **I trascrittori normalizzano i refusi senza accorgersene.** Sul primo
  set hanno scritto «franchigie» dove la pagina stampa «franchie», «subito»
  dove stampa «subìto», «originariamente previsto» dove stampa
  «originariamente Assicurato». Va detto esplicitamente nel prompt che i
  refusi si copiano, accenti e parentesi spaiate comprese. Detto così, dal
  secondo set in poi i trascrittori hanno cominciato a **segnalarli da
  soli** nel loro report finale.
- **Il guasto peggiore non è il refuso, è la parafrasi.** Sul set
  infortuni una frase delle norme sui sinistri era stata riformulata
  invece che copiata. Il testimone di fedeltà l'ha vista come sei parole
  perse e una comparsa: quel profilo - **parole perse e comparse insieme
  nella stessa pagina** - è il sintomo da girare sempre al secondo sguardo
  come domanda esplicita.
- **Il grassetto sintetico va misurato, e la misura va chiesta nel
  prompt.** `pdftohtml -xml -fontfullname` qui non serve: non c'è un font
  Bold. Si misura lo spessore delle aste su un rendering a 400-800 dpi
  (regolare ~9 px a 800 dpi, grassetto 12-14). Senza questa istruzione il
  primo set ha marcato in grassetto sei celle che erano sottolineate.
- **I confini dei documenti li decidono i pezzi scaricati, non i piè di
  pagina.** `mappa-set.mjs` ha sbagliato su tre set su quattro, mettendo
  la copertina delle Condizioni dentro il DIP Aggiuntivo, perché la
  copertina non porta piè. Siccome HDI pubblica sempre a pezzi, il numero
  di pagine di ogni PDF scaricato è la verità: DIP 2, DIP Aggiuntivo 4,
  il resto è il libretto.
- **Le tabelle riepilogative possono essere immagini raster.** Nel set
  viaggi la tabella dei tre livelli (pagg. 35-36) e le tre del DIP
  Aggiuntivo non hanno layer di testo: `verifica-fedelta.mjs` le segnala
  sempre come «numeri comparsi» e non può dire nulla. Lì l'unico giudice è
  l'occhio su ritagli a 500 dpi o più, cella per cella.
- **Un set vale anche per quello che non ha.** Le cose più utili
  all'agente, in questo lotto, sono assenze: Globale Casa non ha
  copertura catastrofale, # Viaggio Singolo non ha garanzia infortuni,
  Rischi Informatici non ha tutela legale né un solo importo nelle
  Condizioni. Vanno scritte nell'INDICE in una sezione apposita, o il
  motore le deduce sbagliate.

## Correzioni in sospeso sugli otto INDICE riparati

Trovate riparandoli il 14/09/2026, **segnalate e non applicate**: toccano
testo scritto in sessioni precedenti e la decisione è del committente.

Errori di fatto (si correggono a colpo sicuro):

- **Scudo Cyber ed. 07/2024**: pag. 60 è elencata fra le bianche, ma è il
  retro di copertina e porta modello ed edizione del fascicolo.
- **Unica Servizi Telematici**: due rimandi a pag. 88 che vanno a pag. 89
  (informare i conducenti, divieto d'uso ai dipendenti).
- **Focus Ufficio e Studi**: la sintesi della Sezione Furto comincia a
  pag. 70, non a 71.
- **Generali Contratto Base Autovetture**: la tabella dei documenti dà le
  Condizioni come «ed. 04/2024», che è la data di ultimo aggiornamento
  sulla copertina; il piè di ogni pagina stampa «Ed. 72025».
- **Generali Contratto Base Motoveicoli**: il titolo della Parte III è
  troncato e perde «e automaticamente prestate», cioè proprio il pezzo che
  dice che la clausola non è opzionale.

Difetto sistematico (vale su tutti e otto, è una riscrittura):

- **I sinonimi sono parafrasi inventate**, non le diciture dei documenti.
  Chi cerca con le parole stampate («Contratto base R.C. Motoveicoli»,
  «Settore: MOTOVEICOLI», «SEZIONE DANNI DA RESPONSABILITÀ CIVILE VERSO
  TERZI») non trova. Rifarli costa poco ma va fatto set per set.

## Decisioni prese, da non rimettere in discussione

- **Il criterio è i rami nuovi per token speso**, non la completezza per
  compagnia. Un ramo scoperto è un «non lo so» in demo; un secondo
  prodotto in un ramo coperto è profondità, che viene dopo.
- **Il ramo auto delle tre compagnie resta chiuso** salvo i buchi elencati
  sopra, che si prendono solo se serve completezza.
- **Un set per volta, un commit per set**, e il test
  `integrazione-documenti.spec.ts` va aggiornato ogni volta, commento
  compreso.
- **Nobis resta una compagnia sola a catalogo** (`cmp-nobis`), coi due
  marchi distinti solo nel nome del prodotto.
