# Ingestion locale — istruzioni operative per Claude

Queste istruzioni servono a fare **a mano, in sessione**, quello che la
pipeline automatica (`be-node/src/worker/ingestion/`) fa con Haiku: portare
un set di PDF assicurativi dentro l'archivio di Velia, convertiti in
Markdown fedele con ancore di pagina. È lo stesso procedimento con cui è
nato il primo archivio (esperimento del 06/08/2026): il risultato di quel
lavoro — `esperimento-motore/workspace/` — è **il campione d'oro**: in ogni
dubbio di formato, guardare lì.

Quando usare la via manuale invece della pipeline: per un set nuovo di cui
si vuole giudicare la qualità da vicino, per costruire il campione di
confronto della conversione automatica, o quando la pipeline non è ancora
attiva per quel tipo di documento.

## Prerequisiti

- I PDF originali in `local-ingestion/originali/` (cartella **gitignorata**:
  i byte dei documenti non entrano mai nel repository — punto aperto §6.2
  dell'analisi requisiti).
- `be-node/.env` configurato (serve per il caricamento su Storage e catalogo).

## 0. Da qui in poi c'è la skill

Il procedimento è incapsulato nella skill `/ingest-pubblico <compagnia> <prodotto> [url-o-pdf]`
(`.claude/skills/ingest-pubblico/SKILL.md`): ricerca e download del PDF, estrazione
locale del testo con `be-node/tools/estrai-testo-pdf.mjs` (pdfjs, nessun modello,
ancore `[pag. N]` già al posto giusto), rifinitura in sessione, controlli, caricamento.
I PDF a due colonne (i DIP) vanno riscritti guardando la pagina con Read; le pagine
con informazioni solo in immagine si trascrivono a mano e si segnalano nel report.
Il manifesto `catalogo-archivio.json` si AGGIORNA per id: l'albero di lavorazione può
contenere un set solo.

## 1. Studia il PDF prima di convertire

Leggi le prime pagine del PDF (strumento Read, il PDF si legge a pagine).
Devi rispondere a queste domande prima di scrivere una riga:

- **Quali documenti logici contiene?** Un set informativo è una raccolta:
  DIP, DIP Aggiuntivo, Condizioni di Assicurazione (spesso col Glossario
  dentro), informativa privacy, riferimenti utili. L'indice in testa al PDF
  di solito li elenca con le pagine.
- **Compagnia, prodotto, modello, edizione** (data gg/mm/aaaa) — stanno in
  copertina o nel colophon.
- **I range di pagina di ciascun documento logico** nel PDF complessivo:
  serviranno per gli header e per `pagina_inizio` a catalogo.

## 2. Prepara l'albero di lavorazione

```
local-ingestion/lavorazione/archivio-pubblico/
  <compagnia>/<ramo>/<prodotto>/
    ed-AAAA-MM/
      INDICE.md
      dip.md
      dip-aggiuntivo.md
      condizioni-di-assicurazione.md
      informativa-privacy.md        (se presente)
      riferimenti-utili.md          (se presente)
      glossario.md                  (solo se è un documento a sé)
```

Nomi delle cartelle in kebab-case (`unipolsai`, `auto`,
`km-servizi-autovetture`). **I nomi dei file sono un contratto**: il
back-office deriva la tipologia dal nome del file, non dall'header
(`dip.md` → dip, `condizioni-di-assicurazione.md` → condizioni-assicurazione,
`informativa-privacy.md` e `riferimenti-utili.md` → altro).

## 3. Converti ogni documento logico

Ogni `.md` inizia con **questo header, esattamente in questo formato** — il
back-office lo parsa per costruire il catalogo:

```markdown
# DIP Danni — UnipolSai Km&Servizi Autovetture

> **Compagnia**: UnipolSai Assicurazioni S.p.A. · **Prodotto**: Km&Servizi Autovetture · **Tipologia**: DIP Danni · **Modello**: SI/09050/C01/00000/C · **Edizione**: 01/11/2022 · **Pagine nel PDF**: 1–6 di 212 (file `WEB_KM&S+AUTOVETTURE_11-2022.pdf`)
```

Campi obbligatori: Compagnia, Prodotto, Edizione (gg/mm/aaaa), Pagine nel
PDF (`da–a di totale`, trattino en `–`), file (il nome esatto del PDF in
`originali/`). Il Modello se c'è.

Poi il contenuto, con le regole del mestiere (le stesse del prompt della
pipeline, `be-node/src/worker/ingestion/convenzioni.ts` — se ne cambi una,
cambiala in entrambi i posti):

1. **Fedeltà assoluta.** Trascrivi, non riassumere. Numeri, franchigie,
   massimali, percentuali, riferimenti ad articoli: identici all'originale.
2. **Ancore di pagina.** Prima del contenuto di ogni pagina, `[pag. N]` su
   riga propria, con N = pagina **assoluta nel PDF complessivo** (non
   relativa al documento logico). Le ancore sono ciò che rende verificabile
   ogni citazione: mai saltarne una, mai stimarle.
3. **Tabelle intere.** Le tabelle di garanzie/massimali/franchigie diventano
   tabelle Markdown complete. Se una tabella attraversa più pagine,
   l'ancora va prima della continuazione e l'intestazione si ripete.
4. **Struttura.** Titoli Markdown per articoli e sezioni con la numerazione
   originale (`### Art. 2.4 — Esclusioni`). Elenchi e lettere come
   nell'originale.
5. **Niente decorazione.** Ometti intestazioni/piè di pagina ripetitivi; mai
   contenuto normativo.
6. **Testo illeggibile.** `> [!ATTENZIONE] Porzione non leggibile a pag. N`
   e avanti: mai inventare.
7. **Pagine senza testo.** Una pagina di sola grafica, copertina o
   separatore produce la sua ancora `[pag. N]` e nient'altro: niente note,
   niente descrizioni della grafica.

## 4. Scrivi l'INDICE.md dell'edizione

Il formato del campione (`esperimento-motore/workspace/.../ed-2022-11/INDICE.md`):

- titolo: `# <Compagnia> <Prodotto> — Set informativo ed. gg/mm/aaaa`
- riga dei campi (Compagnia, Ramo, Modello, Edizione) e l'indicazione se è
  l'**edizione corrente in archivio**, con il rimando alle storiche
  (`../ed-AAAA-MM/`);
- **sinonimi e varianti del nome** commerciale (è ciò che permette al
  motore di capire che "Km e Servizi" e "KM&SERVIZI" sono lo stesso
  prodotto);
- eventuale **nota di edizione** (documenti commerciali che citano
  un'edizione non in archivio);
- la **tabella dei documenti del set**: file | documento | pagine;
- la **mappa delle sezioni** delle Condizioni di Assicurazione (le
  macro-sezioni con i loro range di pagina): è la bussola del motore;
- le **garanzie e i rischi** che il set tratta, in una sezione
  `## Garanzie e rischi trattati`: un elenco puntato con il nome della
  garanzia **come lo scrive il documento**, la pagina dove comincia, e fra
  parentesi i rischi concreti che nomina.

  ```markdown
  ## Garanzie e rischi trattati

  - Incendio e furto [pag. 16] (incendio, esplosione, scoppio, furto totale
    e parziale, rapina, tentato furto)
  - Eventi naturali [pag. 18] (grandine, trombe d'aria, alluvione,
    sovraccarico di neve, caduta di alberi)
  - Cristalli [pag. 19] (parabrezza, lunotto, vetri laterali)
  - Assistenza stradale [pag. 22] (traino, soccorso, auto sostitutiva)
  ```

  Serve a una domanda che oggi non ha risposta senza aprire tutto: «quali
  prodotti in archivio coprono i cristalli?». Senza questa sezione l'indice
  dice **che prodotto è**, non **quali rischi tratta**, e il motore deve
  grepare l'archivio intero sperando di indovinare la parola.

  Due regole: si scrivono i nomi che stanno nel documento, non i nomi
  giusti in generale (se la compagnia la chiama «Eventi sociopolitici», si
  scrive così); e si elencano le garanzie **trattate**, comprese quelle
  opzionali o escluse, perché anche un «non è previsto» è una risposta.
  L'indice non promette coperture: dice dove guardare.

Se il prodotto ha più edizioni, aggiorna anche gli INDICE delle edizioni
esistenti (quale è la corrente) e l'INDICE di radice dell'archivio.

## 5. Controlli di qualità (obbligatori, a campione)

Prima di caricare, verifica — aprendo il PDF vero con Read alle pagine in
questione — almeno:

- **3 ancore a campione** per documento (inizio, metà, fine): il testo dopo
  `[pag. N]` sta davvero a pagina N del PDF;
- **2 numeri a campione** (un massimale, una franchigia): identici;
- i **range di pagina** negli header coincidono con l'indice del PDF e non
  si sovrappongono tra documenti;
- nessuna tabella spezzata a metà riga;
- **2 garanzie a campione** dell'elenco «Garanzie e rischi trattati»: la
  pagina indicata è quella dove la garanzia comincia davvero, e cade dentro
  il range che la mappa delle sezioni le assegna. Una pagina sbagliata qui
  non produce una citazione sbagliata (l'indice non si cita), ma manda il
  motore ad aprire la sezione sbagliata, e da lì la risposta è «non è
  previsto» su una garanzia che c'era.

Se un controllo fallisce, si corregge e si ricontrolla: un archivio con
ancore sbagliate produce citazioni sbagliate, ed è peggio di nessun archivio.

## 6. Carica e cataloga

```powershell
node be-node/tools/carica-archivio.mjs local-ingestion/lavorazione/archivio-pubblico
node be-node/tools/genera-seed.mjs
```

Il back-office carica PDF e `.md` su Storage, scrive il catalogo in
Postgres leggendo gli header, e aggiorna il manifesto
`be-node/dati/catalogo-archivio.json`. (Cerca i PDF originali in
`local-ingestion/originali/` — il nome nel campo `file` dell'header deve
combaciare.) Poi:

```powershell
cd be-node; npx vitest run   # la suite deve restare verde
```

Attenzione: i test del dominio documentale asseriscono i totali del
catalogo — con documenti nuovi vanno aggiornati insieme al caricamento.

## 7. Commit

Si committano **solo**: `be-node/dati/catalogo-archivio.json` (metadati),
`be-node/supabase/seed.sql` (rigenerato) e gli eventuali test aggiornati.
**Mai** i PDF né i `.md` (contenuti proprietari delle compagnie:
`lavorazione/` e `originali/` sono gitignorati). Messaggio di commit nello
stile del repo, es.: `Archivio: entra il set <Compagnia> <Prodotto> (ed. X, Y)`.

## Errori già fatti, da non ripetere

- **Ancore relative al documento logico** invece che al PDF complessivo:
  tutte le citazioni risultano sbagliate di un offset.
- **Date in formato ISO nell'header**: il campo Edizione è gg/mm/aaaa; il
  back-office lo converte lui.
- **Trattino sbagliato nei range**: `1-6` (trattino semplice) non viene
  parsato; serve `1–6` (trattino en).
- Dimenticare di **rieseguire genera-seed**: la CI va rossa con lo schema
  giusto e il seed vecchio.
