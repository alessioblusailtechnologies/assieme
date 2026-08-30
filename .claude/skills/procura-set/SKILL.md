---
name: procura-set
description: Procura i set informativi di una compagnia assicurativa (DIP, DIP aggiuntivo, Condizioni) dal suo sito e li deposita in una cartella di lotto da cui /ingest-visivo parte senza cercare nulla. Scopre il catalogo prodotti del ramo, propone la tabella, scarica i PDF scelti (Chrome vero per i siti dietro Cloudflare, concatenazione per i set pubblicati a pezzi) e scrive LOTTO.json. Uso: /procura-set <compagnia> [ramo] (ramo di default: auto).
---

# /procura-set

Tutto in sessione, coi token dell'abbonamento. Questa skill **procura**:
non legge, non trascrive, non carica. Il risultato è una cartella di lotto
che `/ingest-visivo <cartella>` prende in consegna.

Cartella di lotto (gitignorata): `local-ingestion/in-arrivo/<compagnia-slug>-<ramo>/`
- i PDF dei set, uno per prodotto, col nome `<Compagnia>_<Prodotto>_<ed-AAAA-MM>.pdf`
  (senza spazi, senza caratteri strani: quel nome finisce nell'header dei
  `.md` e a catalogo);
- `LOTTO.json`: un elemento per set, nell'ordine della tabella:

```json
[
  {
    "compagnia": "Zurich Insurance Company Ltd",
    "compagniaSlug": "zurich",
    "ramo": "auto",
    "prodotto": "Zurich Auto",
    "prodottoSlug": "zurich-auto",
    "edizione": "01/03/2026",
    "modello": "",
    "file": "Zurich_Auto_ed-2026-03.pdf",
    "url": "https://…/set-informativo.pdf",
    "urlPagina": "https://…/documenti-precontrattuali",
    "pagine": 84,
    "pezzi": ["dip.pdf", "dipa.pdf", "condizioni.pdf"],
    "note": "edizione dedotta dal DIP; DIP e Condizioni pubblicati separati e concatenati"
  }
]
```

`edizione` e `modello` si mettono se si leggono dalla pagina o dalla
copertina, altrimenti restano vuoti: li completa `/ingest-visivo`
guardando il PDF. `pezzi` solo se il set è stato concatenato.

## 1. Scopri il catalogo

Il committente non deve conoscere i prodotti: li trovi tu.

- Ramo di default **auto**; con un ramo esplicito cerca quello (`casa`,
  `salute`, `vita`, `imprese`, `altro`).
- Cerca la pagina dei **documenti precontrattuali / set informativi** della
  compagnia (WebSearch: «<compagnia> set informativo <ramo>», «<compagnia>
  documenti precontrattuali», «<compagnia> DIP aggiuntivo <ramo>»), poi
  leggila con WebFetch chiedendo l'elenco dei prodotti con edizione e URL
  dei PDF. I grandi gruppi tengono un indice per marchio (Generali:
  «prodotti brand …»; Unipol: «documentazione prodotti»); segui i link
  finché non hai gli URL dei PDF. Le pagine prodotto spesso elencano anche
  le **edizioni storiche**: annotale, il committente può volerle.
- Se WebFetch non vede i link (la pagina li disegna con JavaScript, o li
  tiene in una scheda «Documenti»: Zurich) o torna una challenge
  (Cloudflare: Allianz), leggi la pagina con Chrome vero:
  `node be-node/tools/elenca-link.mjs <url>` elenca i link ai documenti
  (`.pdf`, `download?`, `get_file?`, archivi); `--clicca "Documenti
  Informativi"` apre prima la scheda con quel testo esatto (cercalo con
  `--testo`, che stampa il testo della pagina: serve anche per edizioni,
  date e ragione sociale); `--tutti` per ogni link della pagina.
- Ignora i prodotti chiusi alla vendita, salvo richiesta.
- Controlla cosa c'è già in archivio: `be-node/dati/catalogo-archivio.json`
  (campo `prodotto`, `compagniaId`, `edizione.etichetta`).

## 2. Proponi e aspetta la scelta

Tabella: prodotto · marchio · tipo veicolo/target · edizione · pagine (se
note) · URL · già in archivio (sì/edizione/no) · note (set a pezzi, sito
dietro challenge). **Aspetta la scelta** del committente: uno, alcuni,
«tutti», «anche le storiche». Se il committente ha già detto «tutti» nella
richiesta, procedi senza aspettare.

## 3. Scarica

Per ogni set scelto, in `local-ingestion/in-arrivo/<compagnia-slug>-<ramo>/`:

- `node be-node/tools/scarica-pdf.mjs <url> <cartella>/<file>.pdf` verifica
  la firma `%PDF-` e stampa le pagine. Con 403 o HTML al posto del PDF:
  `--chrome [--pagina <url-indice>]` (Chrome di sistema, passa la
  challenge, prende il PDF dal contesto della pagina).
- Set pubblicato a pezzi (DIP, DIP aggiuntivo, Condizioni separati: AXA):
  scarica i pezzi in `<cartella>/pezzi/` e uniscili nell'ordine DIP → DIP
  aggiuntivo → Condizioni → altro con
  `node be-node/tools/concatena-pdf.mjs <cartella>/<file>.pdf <pezzi…>`;
  annota i pezzi e i range in `note`.
- PDF che non ha testo (`node be-node/tools/estrai-testo-pdf.mjs <pdf> --sonda`
  vuoto): va bene lo stesso, `/ingest-visivo` legge a occhio; annotalo.
- Scrivi `LOTTO.json` alla fine, con tutti i campi che conosci.

## 4. Riferisci

Al committente: la cartella, la tabella di ciò che è stato scaricato
(file, pagine, edizione, URL), ciò che non si è trovato o non si è
riusciti a scaricare e perché, i set a pezzi concatenati, e se la
compagnia è **nuova per l'archivio** (non è in `mocks/data/compagnie.json`
né in `velia.compagnie` online: va aggiunta in entrambi prima del
caricamento, il loader inserisce solo documenti). Chiudi con il comando
per continuare: `/ingest-visivo local-ingestion/in-arrivo/<compagnia-slug>-<ramo>`.

## Cose imparate sui siti

- **allianz.it** è dietro Cloudflare con challenge JS: curl e fetch prendono
  403, serve `--chrome`. Pagina indice: «Preventivi Auto, Set Informativi».
- **axa.it** pubblica DIP/DIPA/Condizioni separati con link
  `/c/document_library/get_file?uuid=…`: si concatenano; pdf-lib non apre
  alcuni PDF AXA, `pdfunite` sì.
- **nobis.it**: pagine prodotto `/assicurazioni/privati/auto/<slug>/` e
  `/assicurazioni/business/auto/nobis-truck/`, con le edizioni storiche;
  l'edizione è la data «aggiornato alla data del …» del DIP, non
  l'«edizione tariffaria» in copertina.
- **generali.it**: set unico per prodotto (copertina + DIP + DIPA +
  Condizioni), edizione in copertina come «Ed. 72025» = 07/2025; il DIP
  Aggiuntivo porta una data propria più recente.
- **unipol.it** (UnipolSai è diventata Unipol Assicurazioni S.p.A.: stesso
  `cmp-unipolsai` a catalogo, ragione sociale nuova nell'header): i set
  stanno nell'archivio documentale `www.unipol.it/api/pub/ueba/download/doc/v1/fascicoli/<uuid>`
  (fetch diretta ok). **I motori di ricerca indicizzano fascicoli vecchi**:
  l'uuid corrente è quello linkato dalla pagina prodotto (`elenca-link.mjs
  <pagina> --tutti | grep fascicol`), e va confrontato col trovato
  (md5, copertina, edizione a pag. delle Condizioni); l'edizione storica
  resta scaricabile e può entrare come `ed-` superata. L'edizione è nella
  copertina interna delle Condizioni («Modello SI/… - Ed. gg/mm/aaaa») e
  nel retro; il DIP non porta data, il DIP aggiuntivo sì. Pagine prodotto:
  `/aziende/lavoro/<prodotto>` (PMI), `/persone/…`.
- **zurich.it**: due marchi con due ragioni sociali. Agenzie: ZuriGò Auto
  / Moto / Altri Veicoli e Zurich BluDrive, prodotti di **Zurich Insurance
  Europe AG - Rappresentanza Generale per l'Italia**, pagine
  `/persone/mobilita/auto/zurigo-auto`, `/persone/mobilita/zurigo-moto`,
  `/persone/mobilita/auto/zurich-bludrive`, `/persone/mobilita/zurigo-altri-veicoli`,
  coi set nella scheda «Documenti» (ZuriGò Auto) o «Documenti Informativi»
  (le altre), nome file «Set Informativo 0626» = 06/2026, edizioni
  storiche accanto (0625v2). Diretta: Zurich Connect Auto / Moto e Ciclo /
  Furgoni, prodotti di **Zurich Insurance Company Ltd**, sulla pagina
  `/zurich-connect` (nome file `P.35002_Auto_SI_ZIC_1123` = 11/2023).
  I PDF si scaricano con la fetch diretta solo nella forma
  `api/archiviodigitale/download?guid=…&filename=…`: la forma `?uuid=…`
  che gira nei motori di ricerca risponde 400 anche a Chrome. Le «Tabelle
  di corrispondenza classe di merito» sono allegati, non set.
