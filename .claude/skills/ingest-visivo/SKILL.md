---
name: ingest-visivo
description: Popola l'Archivio Pubblico di VELIA leggendo ogni pagina del PDF con gli occhi del modello, senza estrazione deterministica del testo come fonte. Il modello trascrive pagina per pagina a blocchi piccoli (subagenti a contesto fresco), la macchina fa da testimone (numeri e parole del layer di testo del PDF), un secondo sguardo in contesto separato controlla le pagine segnalate. Uso: /ingest-visivo <manifesto.json> oppure /ingest-visivo <compagnia> <prodotto> [url-o-file.pdf].
---

# /ingest-visivo

Tutto in sessione, coi token dell'abbonamento: nessun modello via API.
Il principio che distingue questa skill da `/ingest-pubblico`:
**il modello legge, la macchina controlla**. Mai il contrario. Nessun
triage per pagina, nessuna estrazione automatica come fonte: ogni pagina
viene guardata e trascritta, tabelle e immagini comprese.

Le convenzioni di formato (header dei `.md`, ancore assolute, INDICE) sono
quelle di `local-ingestion/ISTRUZIONI.md` §3-4: quel file comanda per il
formato, questa skill per il procedimento. Le regole di trascrizione per
chi guarda le pagine stanno in `REGOLE-TRASCRIZIONE.md` accanto a questo
file: si passano ai subagenti così come sono.

Albero di lavoro (gitignorato): `local-ingestion/lavorazione-visiva/`
- `manifesti/<compagnia>-<prodotto>-<AAAA-MM>.json` il manifesto del set
  (stesso formato di `local-ingestion/manifesti/`, vedi `prepara-set.mjs`);
- `pagine/<nome-pdf-senza-estensione>/pag-NNNN.md` una trascrizione per
  pagina, senza ancora (la mette l'assemblatore). **File vuoto = pagina
  vista e senza testo**; file assente = pagina non ancora trascritta;
- `archivio-pubblico/<compagnia>/<ramo>/<prodotto>/ed-AAAA-MM/` il set
  assemblato, nel layout che `carica-archivio.mjs` si aspetta. Un set alla
  volta: si svuota prima di assemblare il successivo.

## 1. Trova il PDF e fai la mappa

- Il PDF sta in `local-ingestion/originali/` (se è un URL:
  `curl -L -o local-ingestion/originali/<nome>.pdf <url>`; se manca, cerca
  come in `/ingest-pubblico` §0-1). Verifica la firma `%PDF-`.
- Guarda con Read le prime pagine (copertina, indice) e l'ultima: ricava
  compagnia (ragione sociale), prodotto e sinonimi, modello, **edizione
  gg/mm/aaaa**, i documenti logici coi **range di pagina assoluti** (il
  DIP Aggiuntivo comincia dove finisce il DIP, ecc.: controlla i confini
  guardando le pagine, non l'indice), il totale pagine.
- Scrivi il manifesto. Se il committente ha passato un manifesto già
  fatto, verificane i confini allo stesso modo.
- Presenta la mappa in tabella e **aspetta la conferma** del committente.
  È l'unico punto in cui serve un occhio umano. (Se il committente ha già
  dato il via libera sul manifesto, procedi.)

## 2. Trascrivi: ogni pagina, a occhio, a blocchi da 10

Dividi le pagine del PDF (tutte, anche copertina e bianche: producono un
file vuoto) in blocchi da **10 pagine**. Per ogni blocco lancia un
subagente (`Agent`, tipo `general-purpose`) in parallelo, con un prompt
che contiene:

- il percorso assoluto del PDF, il range di pagine del blocco e il totale;
- la cartella di uscita `pagine/<nome-pdf>/` e il nome dei file
  `pag-NNNN.md` (quattro cifre, pagina assoluta);
- l'istruzione di leggere `REGOLE-TRASCRIZIONE.md` e di guardare le pagine
  con `Read` passando `pages` (al massimo il blocco intero in una
  chiamata), poi di scrivere un file per pagina, **subito**, prima di
  passare alla successiva;
- il contesto del set (compagnia, prodotto, quale documento logico copre
  il blocco) perché riconosca intestazioni e piè di pagina da omettere;
- la richiesta di chiudere con l'elenco: pagine scritte, pagine vuote,
  pagine con `[!ATTENZIONE]`, tabelle che continuano oltre il blocco.

Il blocco è da 10 e non da 20 di proposito: chi trascrive a lungo comincia
a riassumere senza accorgersene. Il subagente parte a contesto fresco, e
l'orchestratore non si riempie di pagine. Non trascrivere in prima
persona nel contesto principale se il set supera le 10 pagine.

Quando tutti i blocchi sono chiusi: `ls` della cartella deve mostrare un
file per ogni pagina da 1 a N. Manca un file → rilancia quel blocco.

## 3. Assembla

```
node be-node/tools/assembla-set.mjs local-ingestion/lavorazione-visiva/manifesti/<set>.json
```

Scrive i `.md` dell'edizione (header nel formato delle ISTRUZIONI, ancora
`[pag. N]` per ogni pagina, contenuto del file-pagina sotto) e si rifiuta
se manca una pagina. Elenca le pagine con `[!ATTENZIONE]`: vanno nel
report finale.

## 4. Verifica a due strati

**4a. Testimone meccanico** (costa zero, non può inventare):

```
node be-node/tools/verifica-fedelta.mjs local-ingestion/lavorazione-visiva/archivio-pubblico --dettaglio
```

Per ogni pagina confronta i numeri e le parole del layer di testo del PDF
con la trascrizione. Un numero **perso** o **comparso** è sempre da
guardare. Le parole perse oltre la tolleranza pure. Le pagine **sospese**
(testo dentro un'immagine, pdfjs non vede) non hanno testimone: vanno
tutte al secondo sguardo.

**4b. Secondo sguardo** in contesto separato (mai lo stesso che ha
trascritto): un subagente con l'elenco delle pagine da ricontrollare, ossia
tutte quelle segnalate da 4a, tutte le sospese, tutte quelle con
`[!ATTENZIONE]`, più **una pagina ogni dieci** delle altre, scelta a caso.
Per ogni pagina il subagente guarda la pagina con Read e legge il file
`pag-NNNN.md`, e risponde a una domanda sola: «la trascrizione dice tutto
quello che dice la pagina, e solo quello?». Se trova scarti, **corregge il
file-pagina** e riferisce cosa ha cambiato (pagina, prima → dopo).

Se 4b ha corretto qualcosa: rilancia §3 e §4a. Si chiude quando 4a è
pulito (o gli scarti residui sono spiegati: sillabazioni, simboli, testo
del testimone intrecciato) e 4b non ha più correzioni.

## 5. INDICE e controllo finale

Scrivi `INDICE.md` nell'edizione come nelle ISTRUZIONI §4 (sinonimi,
tabella dei documenti, mappa delle sezioni delle Condizioni con le pagine
assolute, edizione corrente/storiche), leggendo i `.md` assemblati. Se il
prodotto ha già un'edizione in archivio (`be-node/dati/catalogo-archivio.json`),
aggiorna anche il suo INDICE.

Controllo finale a mano, come nelle ISTRUZIONI §5: 2 ancore a campione per
documento aperte con Read; range negli header non sovrapposti.

## 6. Carica

```
node be-node/tools/carica-archivio.mjs local-ingestion/lavorazione-visiva/archivio-pubblico
node be-node/tools/genera-seed.mjs
cd be-node && npx vitest run test/integrazione-documenti.spec.ts
```

Il worker dev deve essere fermo durante la suite. I test del catalogo
asseriscono i totali: aggiornali insieme al caricamento. Committa SOLO
`be-node/dati/catalogo-archivio.json`, `be-node/supabase/seed.sql`,
`mocks/data/compagnie.json` se è entrata una compagnia, e i test toccati
(mai PDF né `.md`): `Archivio: entra il set <Compagnia> <Prodotto> (ed. gg/mm/aaaa)`.

## 7. Riferisci

Al committente: cosa è entrato (documenti, pagine, edizione), l'URL o il
file di origine, i blocchi trascritti, l'esito del testimone (pagine
pulite / con scarti spiegati / sospese), le correzioni del secondo
sguardo, le porzioni segnalate `[!ATTENZIONE]`, e se un'edizione
precedente è passata a «superata».
