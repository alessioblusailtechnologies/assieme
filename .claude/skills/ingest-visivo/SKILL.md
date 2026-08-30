---
name: ingest-visivo
description: Popola l'Archivio Pubblico di VELIA leggendo ogni pagina del PDF con gli occhi del modello, senza estrazione deterministica del testo come fonte. Il modello trascrive pagina per pagina a blocchi piccoli (subagenti a contesto fresco), due testimoni meccanici confrontano numeri e parole (Mistral OCR sul PDF intero, una chiamata; il layer di testo pdfjs), un secondo sguardo in contesto separato controlla le pagine segnalate. Uso: /ingest-visivo <cartella-di-lotto di /procura-set> (salta la ricerca) oppure /ingest-visivo <manifesto.json> oppure /ingest-visivo <compagnia> <prodotto> [url-o-file.pdf].
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
  assemblato, nel layout che `carica-archivio.mjs` si aspetta. Può tenere
  più set: il caricamento è idempotente e il manifesto si aggiorna per id;
- `ocr/<nome-pdf-senza-estensione>/` la lettura Mistral OCR per pagina
  (testimone, §4a), richiesta una volta sola per PDF.

## 1. Trova i PDF e fai la mappa

Tre punti di partenza, dal più comodo:

- **Cartella di lotto** di `/procura-set`
  (`local-ingestion/in-arrivo/<compagnia-slug>-<ramo>/` con i PDF e
  `LOTTO.json`): **niente ricerca**. Per ogni voce del lotto: copia il PDF
  in `local-ingestion/originali/` se non c'è già (il caricatore e i
  testimoni lo cercano lì), poi
  `node be-node/tools/mappa-set.mjs local-ingestion/originali/<file>.pdf --manifesto local-ingestion/lavorazione-visiva/manifesti/<compagnia-slug>-<prodotto-slug>-<AAAA-MM>.json --compagnia … --compagnia-slug … --ramo … --prodotto … --prodotto-slug … [--edizione …] [--modello …]`
  coi campi presi da `LOTTO.json`: lo script propone i documenti logici
  dai piè di pagina («DIP Ed. … 1 di 3») e stampa la copertina. Se nel
  lotto non c'è LOTTO.json, ricava compagnia e prodotto dalla copertina.
- **Manifesto già fatto**: verificane i confini come sotto.
- **Compagnia + prodotto (+ URL o file)**: cerca e scarica come in
  `/procura-set` §1 e §3, poi come sopra.

Poi, per ogni set: guarda con Read la copertina, le pagine di confine fra
un documento e l'altro e l'ultima; completa nel manifesto **edizione
gg/mm/aaaa**, modello, ragione sociale, e correggi i range se il piè di
pagina ha ingannato (il DIP Aggiuntivo comincia dove finisce il DIP: lo
decide la pagina, non l'indice). Le pagine bianche fra due documenti
restano fuori; una bianca dentro un documento ci resta dentro.

Presenta **una sola tabella** per tutto il lotto (set · file · edizione ·
documenti coi range · pagine) e **aspetta la conferma** del committente.
È l'unico punto in cui serve un occhio umano. (Se il committente ha già
dato il via libera, procedi.) Da qui in poi §2-5 per ogni set, in
sequenza o coi blocchi di più set in parallelo; §6 una volta sola per il
lotto.

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

**Se un blocco muore con «Output blocked by content filtering policy»**
(è successo, in modo deterministico, sulle pagine «Norme di legge
richiamate in polizza»: articoli del Codice civile riportati per esteso),
non insistere oltre un secondo tentativo a blocco più piccolo: per quelle
sole pagine prendi la lettura Mistral OCR (`lavorazione-visiva/ocr/<pdf>/pag-NNNN.md`,
la fa `testimone-ocr.mjs`), togli i rimandi alle immagini e il titolo
corrente, normalizza i titoli (`##` sezione, `### Art. N`), e salvala come
file-pagina. Quelle pagine vanno **sempre** al secondo sguardo (che le
confronta con la pagina senza doverle riscrivere) e si dichiarano nel
report come «ricavate dall'OCR».

## 3. Assembla

```
node be-node/tools/assembla-set.mjs local-ingestion/lavorazione-visiva/manifesti/<set>.json
```

Scrive i `.md` dell'edizione (header nel formato delle ISTRUZIONI, ancora
`[pag. N]` per ogni pagina, contenuto del file-pagina sotto) e si rifiuta
se manca una pagina. Elenca le pagine con `[!ATTENZIONE]`: vanno nel
report finale.

## 4. Verifica a due strati

**4a. Due testimoni meccanici**, che non possono inventare:

```
node be-node/tools/testimone-ocr.mjs local-ingestion/lavorazione-visiva/manifesti/<set>.json --dettaglio
node be-node/tools/verifica-fedelta.mjs local-ingestion/lavorazione-visiva/archivio-pubblico --dettaglio
```

Il primo chiama **Mistral OCR una volta sola sul PDF intero** ($4 ogni
1.000 pagine, chiave `MISTRAL_API_KEY` in `be-node/.env`; la lettura si
salva in `lavorazione-visiva/ocr/<pdf>/` e non si richiede due volte) e
confronta, pagina per pagina, la trascrizione con la lettura OCR **e** col
layer di testo pdfjs: un numero assente nella trascrizione ma presente in
entrambi i testimoni è **CERTO**; visto da uno solo è da **guardare**; le
pagine dove pdfjs è cieco (testo dentro immagini, scansioni) le giudica il
solo OCR, ed è l'unico testimone possibile lì. Chiude con l'elenco delle
pagine per il secondo sguardo. Mistral non scrive mai il testo finale:
serve a dire dove guardare (collaudo del 30/08: sui numeri è alla pari
con la lettura a occhio, ma sbaglia qualche parola in modo plausibile,
«gestisce» → «gestione», quindi è testimone, non fonte).

Il secondo lavora sul set assemblato col solo pdfjs (senza OCR se la
chiave manca). Scarti che sono normali e non richiedono correzione:
«sezione N» comparsa (titoli in grafica che pdfjs non vede), sillabazioni
del layer di testo, intestazioni ripetute di tabelle a più gruppi di
colonne unificate.

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
(mai PDF né `.md`): `Archivio: entra il set <Compagnia> <Prodotto> (ed. gg/mm/aaaa)`,
oppure per un lotto `Archivio: entrano i set <Compagnia> <ramo> (<Prodotto> ed. …, <Prodotto> ed. …)`.

## 7. Riferisci

Al committente: cosa è entrato (documenti, pagine, edizione), l'URL o il
file di origine, i blocchi trascritti, l'esito del testimone (pagine
pulite / con scarti spiegati / sospese), le correzioni del secondo
sguardo, le porzioni segnalate `[!ATTENZIONE]`, e se un'edizione
precedente è passata a «superata».
