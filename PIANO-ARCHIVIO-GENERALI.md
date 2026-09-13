# Piano archivio - copertura per la demo in agenzia

Stato al 13/09/2026. Da qui si riprende in una sessione nuova senza rifare
la ricognizione.

## Perché

Va data in demo l'applicativo a un agente che lavora con **Generali,
Zurich, Nobis, Groupama, HDI e Unipol**. In demo l'archivio pubblico è
condiviso: l'agente cercherà i suoi prodotti, e dove non c'è nulla la
risposta è «non lo so». La copertura di quelle sei compagnie è quindi il
lavoro che vale.

## Come siamo messi (catalogo vivo, `velia.documenti`, archivio pubblico)

| Compagnia | Rami coperti | Prodotti | Doc | Pagine |
|---|---|---|---|---|
| UnipolSai | auto, imprese, cyber | 13 | 82 | ~2.050 |
| Zurich | auto, casa, infortuni, salute, viaggi | 16 | 51 | ~1.120 |
| Nobis | auto (natanti, bici, conducente) | 8 | 60 | ~590 |
| HDI | auto | 6 | 20 | ~270 |
| Groupama | auto | 5 | 15 | ~340 |
| **Generali** | auto, viaggi, casa, **tutela** | 6 | 22 | ~440 |

Fuori tabella: Allianz, AXA, Cattolica (gruppo Generali, AUTOPIÙ).

I rami `ram-rc-prof` e `ram-vita` sono **vuoti per tutte le compagnie**;
`ram-tutela` lo era fino al 13/09, quando ci è entrato Immagina Adesso
Armonia. Il totale a catalogo è 305 documenti (il test
`integrazione-documenti.spec.ts` asserisce quel numero: va aggiornato a
ogni caricamento).

Di Generali c'erano solo i due **Contratto Base** (autovetture 07/2025,
motoveicoli 01/2026): la RCA minima di legge, che non vende nessuno. Dal
13/09 ci sono anche **Sei in Viaggio**, **Immagina Strade Nuove** **Immagina Adesso Casa** e **Immagina Adesso Armonia** (vedi sotto).

## Il catalogo Generali, per ramo

Ricognizione fatta su generali.it il 13/09/2026 (pagine di categoria lette
con `elenca-link.mjs`, che apre Chrome vero: i link ai set stanno in una
scheda che curl non vede).

Tre forme di pubblicazione, e cambiano il lavoro:

- **set unico per prodotto** (auto e mobilità): un PDF con copertina, DIP,
  DIP aggiuntivo e condizioni;
- **prodotto modulare** (Immagina Adesso, famiglia ATTIVA imprese): un set
  per modulo più un file «Norme comuni» che vale per tutti;
- **documenti a pezzi** (Sei in Viaggio, Obiettivo Salute, Sei in Sicurezza
  in Circolazione, RC Cavalli): DIP, DIP aggiuntivo e condizioni separati,
  da concatenare.

### Auto e mobilità (`ram-auto`)

| Prodotto | Copre | Edizione |
|---|---|---|
| Immagina Strade Nuove | autovetture, il prodotto di punta | 07/2025, **in archivio** |
| Immagina Strade Nuove Passione Moto | moto e scooter (+ appendice monopattini) | 01/2026 |
| Generali Sei in Auto - Altri Veicoli | autobus, macchine operatrici | 01/2026 |
| ATTIVA Veicoli commerciali | autocarri e furgoni (+ appendice telematica) | 05/2025 |
| ATTIVA Macchine agricole | trattori e mezzi agricoli | 10/2025 |
| Ruote da Collezione | auto e moto storiche | 02/2021 fino al 30/09/2026, poi **10/2026** |
| GenMar | barche, natanti, fuoribordo | 01/2019 |
| Sei in Sicurezza in Circolazione | infortuni del conducente, 2 varianti, 6 file da concatenare | agg. 02/2026 |
| Contratto Base Autovetture / Motoveicoli | **già in archivio** | 07/2025, 01/2026 |

### Casa, famiglia, persona

**Immagina Adesso** è il modulare retail: quattro moduli più le Norme
comuni, e da solo apre quattro rami.

| Modulo | Ramo | Edizione |
|---|---|---|
| CASA | `ram-casa` | 28/06/2025, **in archivio** |
| ARMONIA (RC vita privata + tutela legale) | `ram-tutela` | 28/06/2025, **in archivio** |
| SALUTE E BENESSERE | `ram-salute` | 11/07/2026 |
| CUCCIOLO (cane, gatto) | `ram-casa` | 28/06/2025, agg. 11/07/2026 |
| Norme comuni | trasversale | 28/06/2025 |

Accanto: **ViviCondominio** (07/2026, esiste anche in inglese e tedesco),
**Generali Sei in Viaggio** (fatto), **Obiettivo Salute** in due varianti
(italiani all'estero, stranieri in Italia, 3 pezzi ciascuna), **RC Cavalli**
(3 pezzi), **ARTE Generali Private** (documenti non esposti sulla pagina,
da cercare).

### Imprese e professioni

| Prodotto | Ramo | Forma | Edizione |
|---|---|---|---|
| ATTIVA Commercio (negozi, bar, ristoranti, servizi) | `ram-imprese` | 4 varianti (esercente/proprietario x commerciale/servizi), moduli Attività, Patrimonio, Digitale, Mobilità + Norme comuni: **17 file** | 02/2026 |
| ATTIVA Imprese&Artigiani | `ram-imprese` | modulare, 9 file | 02/2026 e 06/2025 |
| ATTIVA Turismo | `ram-imprese` | modulare, 8 file | 06/2025 |
| ATTIVA Agricoltura (+ Raccolto, Zootecnia) | `ram-imprese` | modulare, 9 file | 06/2025 |
| Cyber Lion | `ram-cyber` | file unico | 06/2025 |
| ATTIVA Professione Sanitaria | `ram-rc-prof` | 2 set (con e senza collaboratori) | 07/2026 |
| ATTIVA Professione Liberale | `ram-rc-prof` | **un set per professione** (agente immobiliare, amministratore di condominio, fiscale e contabile, CED...) | 02/2026 e 07/2026 |
| ATTIVA Professione Tecnica, Progettista esterno, Asseveratore, Dipendente pubblico, Docenti, Avvocati | `ram-rc-prof` | stessa forma, una pagina per professione | varie |
| ATTIVA Welfare, White Collars | `ram-vita` / `ram-salute` | documenti sulla pagina | varie |

Senza set scaricabili (si vendono in agenzia): GeneraImpresa 360,
GeneraTrasporti, GenerAmbiente, GeneraEnergia, Sei in Salvo Aziende,
Rischi finanziari e Cauzioni, grandi imprese.

Vita e previdenza (Scegli col Cuore Progetti e Per chi ami, Scegli per una
Lungavita, Pensione Immediata): esistono, ma sono KID e DIP Vita, forma
documentale diversa. Fuori dal piano per ora.

C'è un indice a parte per i **prodotti a brand Cattolica** (Active Impresa
Commercio, Turismo, Cyber Risk): conta solo se l'agenzia viene da lì.

## Lotto 1, in corso

PDF già scaricati, con `LOTTO.json` scritto, in
`local-ingestion/in-arrivo/generali-auto/` e `.../generali-persona/`
(cartelle gitignorate: se sparisce il disco, gli URL sono nei LOTTO.json).

| # | Set | Ramo | Ed. | Pagine | Stato |
|---|---|---|---|---|---|
| 1 | Generali Sei in Viaggio | viaggi | 25/07/2015 | 39 | **in archivio** (13/09) |
| 2 | Immagina Strade Nuove (auto) | auto | 01/07/2025 | 144 | **in archivio** (13/09) |
| 3 | Immagina Adesso Cucciolo | casa | 28/06/2025 | 51 | da fare |
| 4 | Immagina Adesso Armonia | tutela | 28/06/2025 | 53 | **in archivio** (13/09) |
| 5 | Immagina Adesso Norme comuni | (trasversale) | 28/06/2025 | 14 | **trascritte** (13/09), da replicare negli altri moduli |
| 6 | ViviCondominio | casa | 11/07/2026 | 120 | da fare |
| 7 | Immagina Strade Nuove Passione Moto | auto | 01/2026 | 122 | da fare |
| 8 | Immagina Adesso Casa | casa | 28/06/2025 | 140 | **in archivio** (13/09) |
| 9 | Immagina Adesso Salute e Benessere | salute | 11/07/2026 | 366 | da fare |

Lotto 2 (mobilità estesa): Altri Veicoli, Veicoli commerciali, Macchine
agricole, Ruote da Collezione (con la 10/2026 che entra il 1° ottobre),
GenMar, Sei in Sicurezza in Circolazione.
Lotto 3 (imprese e professioni): ATTIVA Commercio, Imprese&Artigiani,
Turismo, Cyber Lion, Professione Sanitaria e Liberale. Apre `ram-rc-prof`.

## Quanto costa, misurato

Sul primo set (39 pagine), token di subagenti:

| Fase | Token |
|---|---|
| Trascrizione, 4 blocchi da 10 pagine | 385.962 |
| Secondo sguardo, 20 pagine | 150.993 |
| Secondo sguardo corto, 4 pagine | 109.341 |
| Scrittura dell'INDICE | 184.321 |
| **Totale** | **830.617** |

Sul secondo set (Immagina Strade Nuove, 144 pagine): 1.305.684 di
trascrizione in 15 blocchi, 363.687 di secondo sguardo (6 pagine segnalate
più 14 a campione), 276.645 di INDICE, **1.946.016 in tutto**, cioè
**13.500 token a pagina**. Il set grande costa meno a pagina del piccolo:
l'INDICE e i testimoni si spalmano, e con la cornice riconosciuta bene il
testimone OCR ha segnalato 6 pagine su 140 invece di 18 su 39.

**Circa 21.000 token a pagina sul set piccolo, 13.500 sul grande**, più l'orchestrazione, più 4 dollari ogni
1.000 pagine di Mistral OCR (il testimone). Le 659 pagine che restano
del lotto 1 valgono quindi **una dozzina di milioni di token**: più di una
sessione. Si va un set alla volta, e il modulo Salute e Benessere (366
pagine, 7-8 milioni) vuole una sessione sua.

Tre leve per abbassare il costo, non ancora provate:
1. blocchi da 20 pagine invece di 10 (la skill dice 10 perché chi trascrive
   a lungo comincia a riassumere: va provato su un set piccolo e
   confrontato con gli scarti del testimone);
2. stringere ancora il filtro della cornice nel testimone OCR (sul primo
   set segnalava 34 pagine su 39 per il solo piè di pagina; ora 18);
3. tagliare i set a bassa resa per la demo (Cucciolo).

Sul terzo set (Immagina Adesso Casa, 140 pagine più le 13 delle Norme
comuni): 1.697.062 di trascrizione in 16 blocchi, 466.641 di secondo
sguardo in quattro passate, 371.934 di INDICE, **2.535.637 in tutto**,
cioè **16.500 token a pagina**. Le Norme comuni sono trascritte una volta
sola e si replicano negli altri tre moduli: quel costo non si ripete.

Sul quarto set (Immagina Adesso Armonia, 53 pagine): 649.521 di
trascrizione in 6 blocchi, 103.912 di secondo sguardo in una passata sola,
250.394 di INDICE, **1.003.827 in tutto**, cioè **19.000 token a pagina**.
Sui set piccoli l'INDICE pesa un quarto del totale e non si comprime.

## Decisioni prese, da non rimettere in discussione

- **Un modulo è un prodotto a sé in archivio** (`Immagina Adesso Casa`,
  `Immagina Adesso Salute e Benessere`...). Le **Norme comuni** si
  trascrivono una volta e si replicano come `norme-comuni.md` dentro ogni
  edizione dei moduli: il caricatore cataloga come tipologia `altro`
  qualunque nome di file fuori dalla tabella, quindi funziona senza
  toccare codice. Altrimenti il motore legge un modulo senza le norme che
  lo governano.
- **L'edizione del set la dà il colophon delle Condizioni** (come per
  Unipol), non l'etichetta del link sul sito. Sei in Viaggio: Condizioni
  Mod. AV08/01 Ediz. 25.07.2015, quindi `ed-2015-07`, anche se il DIP
  aggiuntivo è aggiornato al 14/01/2026.
- **Armonia va in `ram-tutela`**, Cucciolo in `ram-casa` (non esiste un
  ramo animali e non vale la pena aprirlo per un modulo).
- `mappa-set.mjs` intitola il DIP aggiuntivo «R.C. Auto» anche fuori
  dall'auto: si corregge a mano nel manifesto. Difetto noto, non ancora
  sistemato.
- L'header dei `.md` prende il `modello` unico del manifesto: se i
  documenti hanno modelli diversi (Sei in Viaggio: DIP e DIPA Mod. A12,
  Condizioni Mod. AV08/01) si corregge a mano dopo `assembla-set.mjs`.

## Strumenti sistemati strada facendo (commit `267dffb`)

- `concatena-pdf.mjs`: un pezzo cifrato faceva fallire `pdfunite`, e
  `pdf-lib` con `ignoreEncryption` copiava i flussi ancora cifrati
  producendo un PDF che pdfjs non apre più. Ora in mezzo c'è **mupdf**,
  che decifra salvando.
- `testimone-ocr.mjs`: la cornice si riconosceva dalle prime due e ultime
  due righe della pagina, e un piè di pagina di quattro righe più la
  linguetta laterale della sezione non ci stanno. Ora sono le prime 4 e le
  ultime 8.

## Il giro completo su un set

```
# 1. il PDF sta già in local-ingestion/in-arrivo/generali-<ramo>/
cp local-ingestion/in-arrivo/generali-<ramo>/<File>.pdf local-ingestion/originali/
node be-node/tools/mappa-set.mjs local-ingestion/originali/<File>.pdf \
  --manifesto local-ingestion/lavorazione-visiva/manifesti/generali-<prodotto>-<AAAA-MM>.json \
  --compagnia "Generali Italia S.p.A." --compagnia-slug generali --ramo <ramo> \
  --prodotto "<Prodotto>" --prodotto-slug <slug> --edizione gg/mm/aaaa
# 2. guardare copertina, confini e ultima pagina con Read, correggere il manifesto
# 3. subagenti a blocchi di 10 pagine (vedi skill /ingest-visivo §2)
node be-node/tools/assembla-set.mjs local-ingestion/lavorazione-visiva/manifesti/<set>.json
node be-node/tools/testimone-ocr.mjs local-ingestion/lavorazione-visiva/manifesti/<set>.json
node be-node/tools/verifica-fedelta.mjs local-ingestion/lavorazione-visiva/archivio-pubblico/generali/<ramo>
# 4. secondo sguardo su quel che segnalano i due testimoni (sono elenchi diversi: guardarli entrambi)
# 5. INDICE.md sul modello di un set dello stesso ramo già in archivio
# 6. caricamento: copiare SOLO il set in un albero temporaneo, per non ricaricare tutto
mkdir -p local-ingestion/lavorazione-visiva/solo-questo/generali/<ramo>
cp -r local-ingestion/lavorazione-visiva/archivio-pubblico/generali/<ramo>/<prodotto> \
      local-ingestion/lavorazione-visiva/solo-questo/generali/<ramo>/
node be-node/tools/carica-archivio.mjs local-ingestion/lavorazione-visiva/solo-questo
rm -rf local-ingestion/lavorazione-visiva/solo-questo
node be-node/tools/genera-seed.mjs
cd be-node && npx vitest run test/integrazione-documenti.spec.ts   # worker dev fermo, totale da aggiornare
```

Si committa solo `be-node/dati/catalogo-archivio.json`,
`be-node/supabase/seed.sql`, i test toccati e `mocks/data/compagnie.json`
se entra una compagnia nuova. Mai PDF né `.md`.

## Cosa ha trovato il controllo, sul primo set

7 pagine corrette su 39. Tre errori veri (una congiunzione che cambiava il
perimetro della clausola arbitrale, una parola normalizzata, due omissioni)
e quattro refusi dello stampato che il trascrittore aveva silenziosamente
aggiustato. L'INDICE porta un blocco «Dove i documenti non coincidono» con
dodici punti: il più grosso è che il DIP aggiuntivo è aggiornato al
14/01/2026 mentre le Condizioni sono ferme al 2015, e sulla segnalazione
di un legale all'estero uno dice 500 euro e l'altro 5.000.
