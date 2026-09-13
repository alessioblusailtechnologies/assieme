# Piano archivio - HDI, Nobis e Groupama, le tre compagnie a un ramo solo

Censimento fatto il 13/09/2026 sui tre siti. Da qui si riprende senza
rifare la ricognizione.

## Perché

Va data in demo l'applicativo a un agente che lavora con **Generali,
Zurich, Nobis, Groupama, HDI e Unipol**. L'archivio pubblico è condiviso:
l'agente cerca i suoi prodotti, e dove non c'è nulla la risposta è «non
lo so».

Al 13/09/2026, dopo il lotto Unipol:

| Compagnia | Rami | Prodotti | Doc | Pagine |
|---|---|---|---|---|
| UnipolSai | 8 | 25 | 138 | 2.827 |
| Zurich | 5 | 16 | 51 | 1.124 |
| Generali | 4 | 9 | 34 | 730 |
| **Nobis** | **1** (auto) | 8 | 60 | 591 |
| **HDI** | **1** (auto) | 6 | 20 | 268 |
| **Groupama** | **1** (auto) | 5 | 15 | 336 |

Tre delle sei compagnie dell'agente rispondono **solo sull'auto**. Di
Nobis, che è leader di mercato sul viaggio, in archivio non c'è una sola
polizza viaggio. Questo piano copre quelle tre; Generali ha il suo,
**PIANO-ARCHIVIO-GENERALI.md**.

## Il quadro, dopo il censimento

| | Prodotti ingeribili | Pagine stimate | Forma di pubblicazione |
|---|---|---|---|
| HDI | 41 | ~1.350 | **sempre a pezzi: 3 file** (DIP + DIP aggiuntivo + Condizioni), da concatenare ogni volta |
| Nobis | 41 | ~1.800 | **sempre set unico**, un PDF per prodotto |
| Groupama | 83 | ~4.800 | **96% set unico**; a pezzi solo i tre previdenziali |

Nessuno dei tre siti è dietro challenge: si leggono con WebFetch, senza
Chrome. **I numeri di pagine sono tutti stime**, perché nessuno dei tre
espone il conteggio: sono calibrate sui set auto già in archivio (HDI
22-65 pagine a set, Nobis ~13,5 KB per pagina dal `Content-Length`,
Groupama 57-81 a set). Errore atteso ±25%.

## Il primo lotto, compagnia per compagnia

Il criterio è uno solo: **quanti rami nuovi si aprono per token speso**.
Un ramo scoperto è una risposta «non lo so» in demo; un secondo prodotto
in un ramo già coperto è profondità, che serve dopo.

### HDI - quattro rami in ~180 pagine

| Set | Ramo che apre | Pagine | Pagina prodotto (sotto `hdiassicurazioni.it/it/`) |
|---|---|---|---|
| **#Viaggio Singolo** (5771) | `viaggi` | ~30 | `privati/protezione-e-salute/viaggio-singolo` |
| **Rischi Informatici HDI** (5881) | `cyber` | ~35 | `business/aziende/beni-e-attivita/rischi-informatici-hdi` |
| **Protezione Infortuni HDI** (4291) | `infortuni` | ~40 | `privati/protezione-e-salute/protezione-infortuni-hdi` |
| **Globale Casa** (5811) | `casa` | ~75 | `privati/casa-e-beni/globale-casa` |

Globale Casa da solo porta dentro RC vita privata, assistenza, tutela
legale famiglia e animali, più un allegato «Second opinion veterinaria».
Rischi Informatici mette HDI a confronto sul cyber, dove oggi c'è solo
Unipol Scudo Cyber.

Quinto passo, se serve: **Professionista HDI Lex** (5892, ~30 pagine) è
l'**unico** modo di aprire `tutela` in HDI, perché per i privati la
tutela legale è sempre una garanzia dentro altre polizze. Si scarica
dalla stessa pagina di Professionista HDI.

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

1. **HDI, primo lotto** (~180 pagine, ~4 M). Il rapporto rami/token
   migliore dei tre, e sono quattro set piccoli: si chiude in mezza
   sessione.
2. **Nobis, primo lotto** (~180 pagine, ~4 M). Stesso costo, e porta in
   archivio la gamma viaggio che manca a tutti.
3. **Groupama, primo lotto a costo minimo** (~280 pagine, ~5,5 M).
4. **Groupama, Agrirama e DinamicaBusiness 360** (~280 pagine, ~4,5 M).
   Da qui in poi si sta aprendo `agricoltura`, che è un ramo nuovo per
   l'intero archivio: va deciso se serve alla demo.

Con i primi tre passi, **~640 pagine e circa 13,5 milioni di token**, le
tre compagnie passano da un ramo a cinque ciascuna.

## Quanto costa, e su che base

I consumi misurati sul lotto Unipol e sui primi set Generali:

| Dimensione del set | Token a pagina |
|---|---|
| grande (oltre 120 pagine) | 13-17 mila |
| medio (50-120) | 19-24 mila |
| piccolo (sotto 50) | 21-25 mila |

Sui set piccoli l'INDICE pesa un quarto del totale e **non si comprime**:
sotto le ~40 pagine il costo per pagina non scende più. Vale la regola
pratica: **pagine × 20 mila token**, con un pavimento di ~800 mila token
a set.

Il costo scende se in archivio c'è già un **gemello dello stesso ramo**
da cui copiare taglio e tono dell'INDICE. Per questi tre lotti il gemello
c'è quasi sempre, perché Unipol e Zurich coprono ormai otto rami fra
loro: `viaggi` ha Zurich e Generali, `casa` ne ha sei, `tutela` ha Unipol
e Generali, `cyber` ha Unipol, `imprese` ha Unipol. L'unico senza gemello
è **agricoltura**.

Più 4 dollari ogni 1.000 pagine di Mistral OCR, che è il testimone.

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
