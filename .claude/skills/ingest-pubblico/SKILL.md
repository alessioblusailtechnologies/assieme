---
name: ingest-pubblico
description: Popola l'Archivio Pubblico di VELIA lavorando in sessione, senza API a consumo. Con la sola compagnia (e un ramo) scopre il catalogo prodotti sul sito della compagnia e lo propone; con compagnia e prodotto (o un PDF/URL) fa l'ingestion del set informativo (ricerca e download, estrazione locale del testo, rifinitura in Markdown con ancore, caricamento su Storage e catalogo). Uso: /ingest-pubblico <compagnia> [ramo] oppure /ingest-pubblico <compagnia> <prodotto> [url-o-file.pdf].
---

# /ingest-pubblico

Tutto in sessione, coi token dell'abbonamento: nessun modello via API. Le
convenzioni di formato sono in `local-ingestion/ISTRUZIONI.md` (header dei
`.md`, ancore assolute, INDICE, controlli): quel file comanda, questa skill
è il procedimento.

Due modi di chiamarla:

- `/ingest-pubblico <compagnia> [ramo]` → **scoperta del catalogo** (§0), poi
  ingestion dei prodotti scelti;
- `/ingest-pubblico <compagnia> <prodotto> [url-o-file.pdf]` → ingestion
  diretta (§1 in poi).

## 0. Scopri il catalogo (solo compagnia)

Il committente non deve conoscere i prodotti: li trovi tu.

- Cerca la pagina dei **documenti precontrattuali / set informativi** della
  compagnia (WebSearch: «<compagnia> set informativo <ramo>», «<compagnia>
  documenti precontrattuali», «<compagnia> DIP aggiuntivo»), poi leggila con
  WebFetch chiedendo l'elenco dei prodotti con edizione e URL dei PDF. I
  grandi gruppi tengono un indice per marchio (es. Generali: «prodotti
  brand Cattolica»; Unipol: «documentazione prodotti»); segui i link finché
  non hai gli URL dei PDF.
- Ramo di default: **auto** (è ciò che l'agenzia pilota confronta); con un
  ramo esplicito cerca quello. Ignora prodotti chiusi alla vendita, salvo
  richiesta.
- Presenta una tabella: prodotto · marchio · tipo veicolo/target · edizione
  · pagine (se note) · URL del set · già in archivio sì/no (guarda
  `be-node/dati/catalogo-archivio.json`). Segnala i set che non hai trovato
  come PDF unico (DIP e Condizioni separati: si caricano come documenti
  logici dello stesso set).
- **Aspetta la scelta** del committente (uno, alcuni, «tutti»), poi procedi
  con §1-6 per ciascun prodotto scelto, uno alla volta, chiedendo la
  conferma della mappa dei documenti (§2) per ognuno.

## 1. Trova il PDF

- Se l'argomento è un file in `local-ingestion/originali/`, usa quello.
- Se è un URL, scaricalo con `curl -L -o local-ingestion/originali/<nome>.pdf <url>`.
- Altrimenti cerca con WebSearch: «set informativo <prodotto> <compagnia> pdf»,
  «<compagnia> <prodotto> DIP aggiuntivo condizioni di assicurazione». Il
  set informativo è di norma un PDF unico (DIP + DIP aggiuntivo + Condizioni
  + privacy) nella sezione «documenti precontrattuali» del sito della
  compagnia. Preferisci l'edizione più recente; annota l'URL.
- Verifica che sia un PDF vero (`file`/firma `%PDF-`) e che abbia testo:
  `node be-node/tools/estrai-testo-pdf.mjs <pdf> --sonda`. Se la sonda non
  produce testo (scansione), FERMATI e dillo al committente.

## 2. Capisci il set (sonda)

Dalla sonda e dall'indice in testa al PDF ricava: compagnia (ragione
sociale), prodotto e sinonimi commerciali, modello, **edizione gg/mm/aaaa**,
i **documenti logici** con i loro **range di pagina assoluti**, totale
pagine. Presentali al committente in una tabella e **aspetta la conferma**
prima di convertire: è l'unico punto in cui serve un occhio umano.

## 3. Estrai ed edita

Albero: `local-ingestion/lavorazione/archivio-pubblico/<compagnia>/<ramo>/<prodotto>/ed-AAAA-MM/`
(slug minuscoli con trattini; ramo fra `auto`, `casa`, `salute`, `vita`,
`imprese`, `altro`).

Per ogni documento logico:
`node be-node/tools/estrai-testo-pdf.mjs <pdf> --da <inizio> --a <fine> --uscita <albero>/<file>.md`
(file: `dip.md`, `dip-aggiuntivo.md`, `condizioni-di-assicurazione.md`,
`informativa-privacy.md`, `riferimenti-utili.md`, `glossario.md`).

Poi rifinisci ogni file, leggendolo: header in testa nel formato esatto
delle ISTRUZIONI (Pagine `da–a di totale` con trattino en, file = nome
esatto del PDF), titoli Markdown con la numerazione originale, tabelle
Markdown al posto delle righe con ` | `, via intestazioni e piè di pagina
ripetuti. **Mai toccare le ancore `[pag. N]`**, mai spostare testo fra
pagine. Le pagine di sola grafica restano con la sola ancora.

Scrivi `INDICE.md` come nelle ISTRUZIONI (§4): sinonimi del prodotto,
tabella dei documenti, mappa delle sezioni delle Condizioni, `## Garanzie e
rischi trattati` con la pagina di ogni garanzia, edizione
corrente/storiche. Se il prodotto ha già un'edizione in archivio
(`be-node/dati/catalogo-archivio.json`), aggiorna anche il suo INDICE.

## 4. Controlla (ISTRUZIONI §5)

Almeno 3 ancore e 2 numeri a campione per documento, aprendo il PDF con
Read alla pagina indicata; range non sovrapposti; nessuna tabella spezzata;
2 garanzie a campione dell'elenco aperte alla pagina che dichiarano.
Se qualcosa non torna, correggi e ricontrolla.

## 5. Carica

```
node be-node/tools/carica-archivio.mjs local-ingestion/lavorazione/archivio-pubblico
node be-node/tools/genera-seed.mjs
cd be-node && npx vitest run test/integrazione-documenti.spec.ts
```

I test del catalogo asseriscono i totali: aggiornali insieme al
caricamento. Committa SOLO `be-node/dati/catalogo-archivio.json`,
`be-node/supabase/seed.sql` e i test toccati (mai PDF né `.md`):
`Archivio: entra il set <Compagnia> <Prodotto> (ed. gg/mm/aaaa)`.

## 6. Riferisci

Al committente: cosa è entrato (documenti, pagine, edizione), l'URL di
origine, i controlli fatti, le porzioni illeggibili segnalate, e se
un'edizione precedente è passata a «superata».
