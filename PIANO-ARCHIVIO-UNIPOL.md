# Piano archivio Unipol - chiudere il lotto lasciato a metà

Stato al 13/09/2026. Da qui si riprende in una sessione nuova senza rifare
la ricognizione né il censimento del sito.

## Da dove riprendere

Il lotto dei **27 set Unipol «principali»** (solo edizioni in vigore, né
storiche né future, ~3.034 pagine) si è fermato l'11/09/2026 con **1.635
pagine trascritte su 3.034**. Il 12/09 sono stati caricati **9 set auto**,
che sono in archivio; tutto il resto è fermo su disco.

Il primo passo di una sessione nuova è sempre questo:

```
node local-ingestion/lavorazione-visiva/strumenti/censimento-pagine.mjs
```

Stampa, set per set, quante pagine sono trascritte e **quali mancano**. È
la verità sul disco: il conteggio qui sotto è una fotografia del 13/09, il
censimento è sempre aggiornato.

**Il passo 1 è FATTO** (13/09/2026). I tre set già trascritti e mai
caricati sono in archivio, un commit per set:

| Set | Ramo | Ed. | Pagine | Commit |
|---|---|---|---|---|
| Tutela Legale Aziende | `tutela` | 01/03/2026 | 44 | `3cec00e` |
| Unica Infortuni | `infortuni` | 01/10/2025 | 110 | `57d66a7` |
| Unica Casa | `casa` | 01/10/2025 | 96 | `ebd9f75` |

Unipol passa da tre rami a sei: auto, imprese, cyber, **tutela**,
**infortuni**, **casa**. Il catalogo va da 317 a 331 documenti.

La prossima sessione riparte dal **passo 2**, i cinque parziali.

## Perché

Va data in demo l'applicativo a un agente che lavora con **Generali,
Zurich, Nobis, Groupama, HDI e Unipol**. In demo l'archivio pubblico è
condiviso: l'agente cerca i suoi prodotti, e dove non c'è nulla la
risposta è «non lo so».

Fino al 13/09 Unipol in archivio era **solo auto, imprese e cyber**: chi
chiedeva «la casa di Unipol», «gli infortuni», «la tutela legale» si
sentiva rispondere «non lo so» su materiale già trascritto. Era il buco
più stupido del catalogo, ed è stato il primo a chiudersi. **Restano
scoperti**: salute, viaggi, animali e condominio (passo 3), e il grosso
delle imprese (passo 4).

## Come siamo messi, set per set (13/09/2026)

Dal censimento. `COMPLETO` vuol dire trascritto, non caricato (salvo dove
è scritto che è in archivio).

### Lotto auto (11 set) - 9 in archivio dal 12/09

| Set | Pagine | Stato |
|---|---|---|
| Km&Servizi Autovetture | 316/316 | **in archivio** |
| Unica Autovetture | 112/112 | **in archivio** |
| Unica 2Ruote | 100/100 | **in archivio** |
| Unica Autocarri | 114/114 | **in archivio** |
| Unica Protezione Veicolo | 276/276 | **in archivio** |
| Unica Servizi Telematici | 96/96 | **in archivio** |
| Km&Servizi Autocarri | 188/188 | **in archivio** |
| Contratto Base R.C.A. Autovetture | 34/34 | **in archivio** |
| Contratto Base R.C.A. Ciclomotori e Motocicli | 30/30 | **in archivio** |
| Km&Servizi Monopattini elettrici | 21/56 | mancano 8-10 e 25-56 |
| Navigare Unità da diporto | 23/72 | mancano 8-10, 20 e 28-72 |

### Lotto casa e persona (8 set) - 2 in archivio dal 13/09

| Set | Pagine | Stato |
|---|---|---|
| Unica Casa | 96/96 | **in archivio** |
| Unica Infortuni | 110/110 | **in archivio** |
| Unica Famiglia | 37/76 | mancano 29-30 e 40-76 |
| Unica Mobilità | 14/88 | mancano 7-10 e 19-88 |
| Condominio Più | 0/112 | da cominciare |
| Unica Cane e Gatto | 0/66 | da cominciare |
| Unica Salute | 0/74 | da cominciare |
| Unica Viaggio | 0/64 | da cominciare |

### Lotto imprese (8 set) - 1 in archivio dal 13/09

| Set | Pagine | Stato |
|---|---|---|
| Tutela Legale Aziende | 44/44 | **in archivio** (ramo `tutela`) |
| Tutela Legale Professionisti | 24/44 | mancano 23-30 e 33-44 |
| Focus Impresa | 0/204 | da cominciare |
| Agricoltura e Servizi | 0/204 | da cominciare |
| Focus Impresa Artigiano | 0/180 | da cominciare |
| Albergo e Servizi | 0/152 | da cominciare |
| Infortuni Business | 0/74 | da cominciare |
| Protezione Impresa Catastrofali | 0/52 | da cominciare |

Fuori da questo lotto, già in archivio: Focus Commercio (3 set), Focus
Ufficio e Studi, Scudo Cyber in due edizioni.

## L'ordine di lavoro

1. ~~**I tre set pronti**~~ **FATTO il 13/09/2026** (250 pagine, solo
   controlli e INDICE). Unipol è passato da tre rami a sei. Era il passo
   con la resa più alta per token speso di tutto il piano, ed è costato
   **2,3 M**.
2. **I cinque parziali** (217 pagine da trascrivere): Monopattini 35,
   Navigare 49, Unica Famiglia 39, Unica Mobilità 74, Tutela Legale
   Professionisti 20. Chiudono cinque set con poco lavoro, e i primi due
   completano il lotto auto.
3. **Casa e persona da zero** (316 pagine): Condominio Più, Unica Salute,
   Unica Viaggio, Unica Cane e Gatto. Aprono `ram-salute` e `ram-viaggi`
   per Unipol, e danno un secondo prodotto condominio accanto a
   ViviCondomìnio di Generali e a quello di Zurich.
4. **Imprese da zero** (792 pagine, cinque set): è il blocco più pesante e
   il meno urgente per la demo, perché Unipol imprese ha già Focus
   Commercio e Focus Ufficio e Studi in archivio.

Un lotto per volta, **con commit separato**: mai caricare due lotti in un
colpo solo, o il conteggio dei documenti nel test non si sa più a chi
attribuirlo.

## Dov'è tutto, su disco

Le cartelle di lavorazione sono **gitignorate**: il materiale sta sul
disco di questa macchina e non nel repo.

- `local-ingestion/originali/` i 32 PDF Unipol, già scaricati.
- `local-ingestion/lavorazione-visiva/manifesti/unipolsai-*.json` i 27
  manifesti, con confini dei documenti già verificati.
- `local-ingestion/lavorazione-visiva/pagine/<pdf>/pag-NNNN.md` le
  trascrizioni pagina per pagina.
- `local-ingestion/lavorazione-visiva/ocr/<pdf>/` la lettura Mistral OCR
  di **tutte** le 3.034 pagine: **è già stata pagata**, non si richiede.
- `local-ingestion/lavorazione-visiva/archivio-pubblico/unipolsai/` i set
  assemblati (auto, cyber, imprese, e dal 13/09 tutela, infortuni, casa).
- `local-ingestion/in-arrivo/unipol-censimento-2026-09-11.tsv` il
  censimento completo di unipol.it: 164 set, ~12.200 pagine, con uuid e
  pagina di origine. Serve se si vuole allargare la cernita oltre i 27.

Strumenti, in `local-ingestion/lavorazione-visiva/strumenti/`:

- `censimento-pagine.mjs` che pagine mancano, set per set;
- `piani/<slug>.json` i blocchi da 10 pagine con il contesto, uno per set
  (25 piani già generati da `piano-blocchi.mjs`);
- `lista-secondo.mjs` costruisce la lista del secondo sguardo dagli output
  dei testimoni;
- `crop.mjs` e `render.mjs` per guardare una porzione di pagina ingrandita;
- `collaudo-deepseek.mjs` il collaudo del trascrittore alternativo.

Istruzioni riusabili per i subagenti, in
`local-ingestion/lavorazione-visiva/`:

- `convenzioni-unipol.md` le convenzioni di questo lotto;
- `istruzioni-blocco-unipol.md` il trascrittore di un blocco;
- `istruzioni-orchestratore-unipol.md` il **coordinatore di un set**, che
  lancia i blocchi a ondate e non guarda mai le pagine;
- `istruzioni-secondo-sguardo-unipol.md` il controllo.

## Il giro completo su un set

Per un set **già trascritto** si parte dal punto 2.

```
# 1. trascrizione: coordinatore per set, blocchi da 10 pagine
#    (vedi istruzioni-orchestratore-unipol.md e strumenti/piani/<slug>.json)

# 2. assemblaggio
node be-node/tools/assembla-set.mjs local-ingestion/lavorazione-visiva/manifesti/<set>.json

# 3. i due testimoni meccanici
node be-node/tools/testimone-ocr.mjs local-ingestion/lavorazione-visiva/manifesti/<set>.json --stretto
node be-node/tools/verifica-fedelta.mjs local-ingestion/lavorazione-visiva/archivio-pubblico/unipolsai/<ramo>/<prodotto> --dettaglio

# 4. secondo sguardo in contesto separato: le pagine segnalate dai due
#    testimoni (sono elenchi diversi: guardarli entrambi) più una pagina
#    ogni dieci fra le NON segnalate, scelta a caso

# 5. INDICE.md sul modello di un set Unipol dello stesso ramo già in
#    archivio (per casa e infortuni non ce n'è: usare
#    archivio-pubblico/unipolsai/imprese/focus-commercio/ed-2026-03/INDICE.md
#    per il taglio, e zurich/casa/... per le domande del ramo casa)

# 6. caricamento: copiare SOLO il set in un albero temporaneo
mkdir -p local-ingestion/lavorazione-visiva/solo-questo/unipolsai/<ramo>
cp -r local-ingestion/lavorazione-visiva/archivio-pubblico/unipolsai/<ramo>/<prodotto> \
      local-ingestion/lavorazione-visiva/solo-questo/unipolsai/<ramo>/
node be-node/tools/carica-archivio.mjs local-ingestion/lavorazione-visiva/solo-questo
rm -rf local-ingestion/lavorazione-visiva/solo-questo
node be-node/tools/genera-seed.mjs
cd be-node && npx vitest run test/integrazione-documenti.spec.ts   # worker dev fermo
```

Si committa solo `be-node/dati/catalogo-archivio.json`,
`be-node/supabase/seed.sql` e i test toccati. Mai PDF né `.md`.

Il test `integrazione-documenti.spec.ts` asserisce il **totale dei
documenti a catalogo** (331 dal 13/09/2026) con un commento che li spiega
compagnia per compagnia: va aggiornato a ogni caricamento, commento
compreso.

## Quanto costa, misurato

Sul lotto Unipol: trascrizione **~14.500 token a pagina**, secondo sguardo
**~7.800**, un INDICE **350-600 mila token** a set. Una finestra di
sessione ha retto ~27 milioni di token.

Sui set Generali lavorati il 13/09 (che usano lo stesso giro): 15.600
token a pagina su un set di 122 pagine con un gemello già in archivio,
19.400 su uno di 120 senza gemello, 20.000 su uno di 51. **L'INDICE è il
25-30% del totale e non si comprime**: cresce con la complessità del
prodotto, non con le pagine.

**Il passo 1, misurato riga per riga** (13/09/2026, 250 pagine già
trascritte):

| Set | Pagine | Secondo sguardo | INDICE | Totale |
|---|---|---|---|---|
| Tutela Legale Aziende | 44 | 263 k (2 agenti, 14 pagine) | 172 k | ~470 k |
| Unica Casa | 96 | 525 k (4 agenti, 28 pagine) | 255 k | ~800 k |
| Unica Infortuni | 110 | 644 k (5 agenti, 34 pagine) | 274 k | ~940 k |
| | 250 | 1,43 M | 0,70 M | **2,3 M** |

Sono numeri da leggere così:

- **Il secondo sguardo costa 18-19 mila token a pagina controllata**, più
  del doppio dei 7.800 stimati sul lotto vecchio. La differenza è il
  confronto parola per parola a tolleranza zero: ogni agente si costruisce
  un diff meccanico contro il layer di testo prima di guardare. Vale la
  spesa, ma va messa a preventivo per quello che è.
- **Un INDICE costa 170-275 mila token, non 350-600 mila**, quando in
  archivio c'è un gemello dello stesso ramo da cui copiare taglio e tono.
  È il risparmio più grosso disponibile e cresce da solo: ogni ramo
  aperto rende più economico il prossimo set di quel ramo.
- Un set già trascritto costa **9-10 mila token a pagina**, contro i
  15-20 mila di uno da trascrivere.

Da qui il conto dei quattro passi dell'ordine di lavoro:

| Passo | Pagine da trascrivere | Costo stimato |
|---|---|---|
| ~~1. I tre set pronti~~ | 0 | **2,3 M, misurati** (stima: 1,5 M) |
| 2. I cinque parziali | 217 | ~4,5 M |
| 3. Casa e persona da zero | 316 | ~6 M |
| 4. Imprese da zero | 792 | ~14 M |

Più 4 dollari ogni 1.000 pagine di Mistral OCR, **che per questi set è
già stata pagata**.

## Cosa ha insegnato questo lotto

- Il **coordinatore per set** (un subagente che lancia i blocchi e non
  legge le pagine) tiene pulito il contesto dell'orchestratore: 4-6
  coordinatori con parallelismo 2-4 tengono ~15 trascrittori insieme.
- **Fermare il coordinatore non ferma i suoi trascrittori**: vanno fermati
  uno per uno (`TaskStop`, con `ListAgents` per trovarli).
- Il limite è **20 subagenti contemporanei**. Due set da 120 pagine sono
  il massimo lavorabile davvero insieme senza spezzare la trascrizione in
  due ondate.
- Il filtro in uscita **non blocca più** le pagine «Norme di legge
  richiamate in polizza»: si trascrivono a occhio come le altre.
- I **facsimili con i bollini rossi numerati** (certificato, polizza,
  modulo C.A.I.) non hanno parole coperte: i bollini sono vettori
  disegnati sopra il modulo. Si converte la pagina in SVG
  (`pdftocairo -svg`), si tolgono i cerchi e le cifre, si ri-renderizza a
  800-1200 dpi e sotto c'è tutto.
- I trascrittori **normalizzano i refusi dello stampato** più spesso di
  quanto sembri, e i testimoni non li vedono (la parola c'è, è solo quella
  sbagliata). Il confronto parola per parola col layer di testo, chiesto
  esplicitamente al secondo sguardo, è l'unico modo di riprenderli.
- Il **secondo sguardo a campione** (una pagina ogni dieci fra le non
  segnalate) trova errori veri. Non è un passaggio di cortesia.
- **L'INDICE si scrive col gemello accanto**: un INDICE già in archivio
  dello stesso ramo (non della stessa compagnia) dimezza il costo e
  uniforma il taglio. Al 13/09 ogni ramo Unipol che resta da aprire ha
  già un gemello Zurich o Generali.
- Quando due agenti danno un giudizio **opposto sulla stessa cosa** (qui:
  la barra «INFORMATIVA PRIVACY» in testa alla prima pagina della
  privacy, presente in Tutela e Infortuni e assente in Casa), la risposta
  non è arbitrare a tavolino: si renderizzano le due pagine e si guardano
  una accanto all'altra. Avevano ragione tutti e due.
- I dubbi che un agente lascia aperti in fondo al resoconto **vanno letti
  e chiusi**: quello dell'INDICE di Casa («quale scala è stampata in
  calce, di 69 o di 70?») è costato una riga di `pdftotext` e ha
  trasformato un'ambiguità in un'incoerenza documentata del set.

## DeepSeek Flash come trascrittore: proposta aperta

Collaudato il 12/09/2026 su 20 pagine già verificate. `deepseek-flash`
legge le immagini (non i PDF: servono PNG da `pdftoppm`), endpoint
`https://api.deepseek.com/anthropic`, chiave `DEEPSEEK_API_KEY`.

**Pagina intera a 150 dpi**: 0 numeri sbagliati, 22 parole diverse su
~8.000, 12 pagine su 20 con almeno uno scarto. Le **mezze pagine a 220 dpi
vanno scartate** (una pagina quasi tutta persa, una duplicata). Errori
tipici: refusi inventati («Ebbrozza», «Riscarcimento»), parole scambiate
che cambiano senso («congiunti» → «coniugi», «Indennizzo» → «Indennità»,
«e» → «o»), refusi dello stampato normalizzati. Sono tutti errori che il
testimone `--stretto` vede.

**Proposta al committente, non ancora approvata**: DeepSeek trascrive le
pagine mancanti, Claude fa solo il secondo sguardo sulle segnalate. Se
approvata, il costo dei passi 2, 3 e 4 crolla. Se no, si va a occhio come
finora.

## Decisioni prese, da non rimettere in discussione

- **Solo edizioni in vigore**: niente storiche, niente future. La cernita
  dei 27 set è quella concordata col committente l'11/09.
- **Un lotto per volta, un commit per lotto.**
- Gli **allegati UnipolTech** (Unibox, Scatola Nera) sono documenti a sé
  dentro il set, con la loro `compagnia` nel manifesto: è il motivo per
  cui `assembla-set.mjs` ha il campo `compagnia` per documento.
- Il testimone si lancia con **`--stretto`** su questo lotto: tolleranza
  zero, e segnala anche le parole comparse.
