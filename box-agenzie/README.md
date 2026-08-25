# Box Velia per le agenzie: le tavole di stampa

Tutto quello che va in tipografia (o dal fornitore delle incisioni) per la
box di promozione alle agenzie. Il concept completo (contenuti, tre cerchi,
sequenza d'apertura, costi) è nell'artifact «Box Velia per le agenzie».

## Come si rigenera

```bash
cd box-agenzie
npm install          # solo la prima volta (qrcode)
node genera-tavole.mjs            # tutte le tavole
node genera-tavole.mjs lettera    # una sola, per id
```

Serve Google Chrome installato: l'HTML delle tavole diventa PDF vettoriale
con i font del sito incorporati (TWK Ghost e Geist da `website/public/fonts`).
Per ogni pezzo escono `out/pdf/<id>.pdf` (il file per la tipografia) e
`out/png/<id>.png` (anteprima con il colore della carta, per approvare).

- `tavole.mjs` è il sorgente: un oggetto per pezzo, con formato al rifilo,
  pagine (fronte, retro, matrici, guide) e i dati d'esempio (`ESEMPIO`) per i
  pezzi a dato variabile. Si cambia qui e si rilancia.
- `comune.css` ha i token del sito in millimetri, i crocini, l'etichetta
  tecnica e le linee guida magenta (piega, foro, fustella: non si stampano).
- `build/` e `node_modules/` sono ignorati da git.

## Regole di stampa

- Ogni pagina è il **formato al rifilo + 3 mm di abbondanza** su ogni lato,
  più 7 mm per i crocini. L'etichetta in basso dice pezzo, formato, pagina,
  carta e colori.
- I pezzi su carta avorio hanno lo **sfondo vuoto** nel PDF: l'avorio è la
  carta (Fedrigoni Materica Gesso, Sirio Color Perla o simili), non un colore
  stampato. Il PNG lo mostra solo per l'anteprima.
- Il **blu Velia** (`#2f4b7c`) va a **tinta piatta** su tutte le superfici,
  così punto del coperchio, sigillo e cartellini sono lo stesso blu. Il
  Pantone lo sceglie la tipografia con una prova colore; non fidarsi della
  conversione automatica. Sul coperchio scuro il blu del punto è il tono «su
  scuro» del sito (`#7f97c4`), da tradurre nella lamina blu più vicina.
- Le **matrici** (coperchio a caldo, copertina del taccuino a secco, timbro,
  incisioni) sono in nero su bianco, 1:1: il nero è la lamina, il rilievo, la
  gomma o l'incisione.
- Le **linee magenta tratteggiate** sono guide (piega della lettera, foro del
  cartellino, fustella del sigillo) e non vanno stampate.
- Coperchi: la tavola è il piano superiore; la fustella del rivestimento con
  fianchi e risvolti la dà lo scatolificio, e gli elementi si riposizionano
  mantenendo le distanze dai bordi.
- Da verificare prima di stampare la **licenza di TWK Ghost** per l'uso a
  stampa; in caso contrario si passa a Geist (open source) cambiando `--ft`
  in `comune.css`.

## I pezzi

| id | pezzo | formato | pagine |
| --- | --- | --- | --- |
| `coperchio-premium` | coperchio scuro, scritte a caldo | 240 × 170 | anteprima, matrice caldo avorio, matrice caldo blu |
| `coperchio-firma` | idem, scatola a libro | 300 × 220 | idem |
| `interno-coperchio-premium` | «Quello che risolvete oggi, domani è già risolto.» in blu | 234 × 164 | 1 |
| `interno-coperchio-firma` | idem | 294 × 214 | 1 |
| `velina` | gli Agenti degli astratti (orbite), 1 colore | 500 × 700 | 1 |
| `sigillo` | V bianca su blu, Ø 40 | 40 × 40 | stampa, guida fustella |
| `lettera` | carta intestata A5 | 148 × 210 | con testo d'esempio, sola intestazione |
| `foglio-di-velia` | domanda, risposta, MEMORIA e FONTE | 148 × 210 | 1, dato variabile |
| `card-accesso` | QR + codice | 85 × 55 | fronte, retro |
| `card-promesse` | le tre promesse | 100 × 150 | fronte, retro |
| `cartellino-memoria` | tag con foro | 35 × 70 | fronte, retro |
| `taccuino` | copertina a secco, prima pagina, pagina con colonna La prossima volta | 148 × 210 | 3 |
| `calendario` | carte del calendario perpetuo (mese, giorno) | 105 × 74 | 2 |
| `fascetta-pausa` | «Il quarto d'ora che Velia vi restituisce.» | 220 × 45 | 1 |
| `timbro` | matrice «In memoria» | 47 × 18 | 1 |
| `incisioni` | base del calendario e penna, vettori | 120 × 40 | 1 |

## Dato variabile

Lettera, foglio di Velia e card d'accesso cambiano per agenzia (o per ramo
nella Premium). Oggi i testi d'esempio stanno in `ESEMPIO` dentro
`tavole.mjs`; il passo successivo è un generatore che legge una tabella
(agenzia, slug, persona, domanda, risposta, fonte, memoria, codice) e produce
un PDF per riga con lo stesso motore.
