# Intestazione e modelli di riferimento: il piano

11/09/2026. Rifà la sezione **Impostazioni > Template di output**, che oggi tiene insieme tre cose diverse (file caricati con segnaposto e predefinito per formato, identità visiva, anteprima) e per questo è piena di rumore. Diventa una pagina a due schede:

1. **Intestazione e piè di pagina**: quelli dell'agenzia, composti in un editor, su ogni documento che esce da VELIA.
2. **Modelli di riferimento**: documenti di qualsiasi formato, da richiamare in chat con «Genera da modello».

Si parte da zero: nessuna migrazione di template, identità visiva o predefiniti esistenti. Il vecchio si toglie.

## Decisioni del committente (11/09/2026)

- **Editor**: TipTap, con uno schema vincolato a ciò che si riproduce identico in PDF e in Word.
- **Carta intestata PDF**: non esiste più nella scheda 1. Un PDF di carta intestata si carica fra i modelli, dove la sandbox lo usa come oggi.
- **Intestazione sui modelli**: si sceglie per modello. Di norma quella dell'agenzia; «tieni la sua» per i documenti da restituire come sono (un modulo di una compagnia).
- **Agenti e tabelle**: per ora solo intestazione e piè sul layout di VELIA. Il modello per gli agenti, se servirà, dopo.

## Scheda 1 · Intestazione e piè di pagina

### Dove si applica

| Documento | Cosa riceve |
|---|---|
| Esporta come PDF / Word (chat) | intestazione e piè |
| Documenti degli agenti | intestazione e piè |
| Tabelle in PDF / Word | intestazione e piè |
| Tabelle in Excel | solo il testo, nelle fasce di stampa di Excel (sinistra, centro, destra) |
| Genera da modello | intestazione e piè, salvo i modelli con «tieni la sua» |
| Esporta come testo semplice, Invia email | niente |

### Che cosa si può mettere (lo schema)

Dall'11/09/2026 pomeriggio ogni fascia è una **tela libera** (fase 4 qui sotto): il flusso di paragrafi, immagini e colonne della mattina non lasciava centrare un testo su un logo alto, né mettere un secondo logo accanto al testo.

- **La fascia**: larga quanto il foglio A4 (210 mm), alta quanto si vuole (`altezza`, fino a 100 mm). La testa parte dal bordo alto della pagina, il piede finisce su quello basso; le coordinate degli elementi sono in millimetri dall'angolo in alto a sinistra della fascia. Il corpo del documento comincia dopo la fascia e 16 pt di respiro, mai più vicino al bordo del margine di 56 pt.
- **Elementi** (`elementi`, dal fondo alla cima, al massimo 40): **casella di testo** (`x`, `y`, `larghezza`, `altezza`; `verticale` in cima, a metà o in fondo; corpo, famiglia e colore del testo della casella; i paragrafi di TipTap); **immagine** (alle misure scelte, l'editor tiene le proporzioni); **forma** (un rettangolo pieno: una linea se basso, una banda o uno sfondo se largo). Nessun elemento esce dalla fascia: il backend lo rifiuta con un 400.
- **Testo**: grassetto, corsivo, sottolineato; corpo in punti dal 5 al 72; tre famiglie (Helvetica, Times, Courier: i font standard del PDF, in Word Arial, Times New Roman, Courier New); colore libero. L'interlinea è 1,3 volte il corpo più grande della riga, mai meno del corpo della casella: così editor, PDF e Word vanno a capo e misurano uguale. Una casella è alta almeno quanto il suo testo.
- **Campi automatici**: numero di pagina, pagine totali, data, titolo del documento, nome dell'agenzia. Partita IVA, iscrizione RUI e simili si scrivono come testo, una volta.
- **Fuori schema**: tabelle libere, elenchi, link, rotazioni, trasparenze.
- Niente colore dell'agenzia accanto all'editor: l'identità visiva se n'è andata del tutto (decisione dell'11/09/2026). Il corpo dei documenti ha l'accento del layout di VELIA; il marchio dell'agenzia sta solo in intestazione e piè.

### Dati

- Tabella `velia.intestazione`: `tenant_id` (chiave), `intestazione jsonb`, `piede jsonb`, `aggiornata_il`, `aggiornata_da`. Proprietario `velia_app` (vedi la memoria sulle migrazioni: senza, l'app la legge a zero righe in silenzio). Lettura per i membri del tenant; scrittura dall'API dopo la guardia da amministratore.
- Immagini nello Storage, `tenant/<tid>/intestazione/<id>.<ext>`, citate per id nel JSON.
- Il backend valida il JSON con uno schema zod dello stesso vincolo dell'editor e rifiuta ciò che ne esce (400): l'editor non lo produce, ma l'API non se ne fida.
- Senza una riga, l'intestazione è vuota e il piè porta solo il numero di pagina.

### API

- `GET` / `PUT /api/intestazione`: il JSON di intestazione e piè.
- `POST /api/intestazione/immagini`, `GET /api/intestazione/immagini/:id`.
- `POST /api/intestazione/anteprima` (`formato: pdf | docx`): un documento d'esempio di due pagine col vero motore di resa, sul contenuto non ancora salvato.
- `/api/modelli` è già dei livelli AI: i modelli di documento restano sotto `/api/template`.

### Resa (`be-node/src/generazione/intestazione.ts`)

Un solo modulo che dal JSON produce:

- **PDF** (pdf-lib): ogni elemento si disegna alle sue coordinate; il testo di una casella va a capo nella sua larghezza (metriche carattere per carattere) e sta in cima, a metà o in fondo. L'altezza dell'intestazione è la sua, o di più se un testo sporge sotto; da lì il corpo ricava il margine. I campi si risolvono pagina per pagina: le pagine totali si conoscono dopo aver impaginato il corpo. Su un foglio che non è largo 210 mm (un file della sandbox in orizzontale) ciò che sta nel terzo destro resta sul bordo destro, quello nel terzo sinistro sul sinistro.
- **Word** (`docx`): `Header` e `Footer` con un paragrafo a interlinea esatta alto quanto la fascia (Word gli fa spazio e sposta il corpo), header e footer a filo del bordo (`pgMar` `header`/`footer` a 0). Immagini e forme sono disegni ancorati a quel paragrafo, dietro al testo. Le caselle di testo sono **cornici di paragrafo** (`w:framePr`) rispetto alla pagina, già spostate in cima, a metà o in fondo: le caselle DrawingML (`wps:txbx`) sarebbero più naturali, ma LibreOffice ne mette il testo nell'angolo della pagina quando il corpo del documento è corto (verificato col LibreOffice della sandbox), le cornici no. Campi `PAGE` e `NUMPAGES`.
- **Excel** (exceljs, `headerFooter`): solo testo. Ogni casella va nella sezione (`&L`, `&C`, `&R`) del terzo di foglio dove cade il suo centro, dall'alto in basso; campi `&P`, `&N`, `&D`; immagini e forme non ci sono.
- **Sui file della sandbox** (`generazione/timbra.ts`, deciso in fase 3 al posto di `carta.pdf` e `carta.docx`): l'intestazione la mette il worker dopo la consegna, con lo stesso motore. PDF: le fasce disegnate su ogni pagina, coi numeri giusti; Word: header e footer dell'agenzia al posto di quelli del documento, in ogni sezione, a filo del bordo e disposti sul foglio della prima sezione (prima pagina diversa e pari/dispari spente); Excel: le fasce di stampa scritte nell'XML di ogni foglio, senza riscrivere il file con ExcelJS (perderebbe grafici e formati di openpyxl). Alla sandbox si dicono solo i margini da lasciare liberi (`misureFasce`).

### Front-end

- Pagina a due schede, con lo stesso schema di Istruzioni (`role="tablist"`, `.scheda`).
- `features/impostazioni/template/intestazione/`: la tela (`editor-intestazione`), una casella di testo con un TipTap suo (`casella-testo`, estensioni open più il nodo `campo` e gli attributi `fontSize`/`fontFamily` del `textStyle`), la geometria pura (`tela.ts`: guide, maniglie, allinea, distribuisci), il testo di tutta una casella (`testo.ts`), la normalizzazione verso il contratto (`normalizza.ts`). Niente wrapper di terzi.
- Barra su tre righe fisse: aggiungi (testo, immagine, linea, riquadro, campo) e disponi (primo piano, dietro, duplica, elimina); allinea e distribuisci, con posizione e misure in millimetri (o l'altezza della fascia); l'aspetto di ciò che è selezionato (font, corpo, segni, colore, allineamento del testo, testo in cima, a metà o in fondo, casella adatta al testo; il colore di una forma; «Sostituisci» per un'immagine).
- Sulla tela: clic per selezionare, Maiuscolo per aggiungerne, lazo sul fondo; trascinare con le guide che attirano (margini, centro del foglio, metà della fascia, bordi e centri degli altri; Alt per staccarsi, Maiuscolo per andare dritti); maniglie (quattro angoli per le immagini, che tengono le proporzioni); il bordo verso il corpo si trascina per cambiare l'altezza della fascia; doppio clic (o Invio) per scrivere in una casella, Esc per uscirne, e una casella lasciata vuota se ne va. Frecce di mezzo millimetro (cinque con Maiuscolo), Canc, Ctrl+C/X/V/D/A/Z/Y. Una cronologia sola per tutto, testo compreso; un gesto o una raffica di frecce o di battute è una voce sola.
- Con la casella selezionata la barra vale per tutto il suo testo (corpo, famiglia e colore diventano della casella); mentre ci si scrive, per i pezzi selezionati.
- Foglio A4 in scala (`--mm`, `--pt` in unità del contenitore), così un a capo nell'editor è un a capo nel PDF.
- Anteprima: il PDF di `/api/intestazione/anteprima` nel visualizzatore PDF che c'è già.
- Da verificare prima di scrivere: `@tiptap/core` con Angular 22 senza zone.js (è headless, dovrebbe andare) e il peso nel bundle della rotta lazy.

## Scheda 2 · Modelli di riferimento

- **Caricamento**: Word, Excel, PowerPoint, PDF. Il nome viene dal file e si può rinominare. Una riga «quando usarlo», facoltativa ma consigliata: il motore della chat la legge per scegliere il modello giusto.
- **Per modello**: «Intestazione: dell'agenzia / la sua» (predefinito: dell'agenzia).
- **Anteprima**: un PDF si mostra com'è. Word, Excel e PowerPoint si convertono in PDF una volta, al caricamento, sul runner della sandbox (ha LibreOffice), con un job `anteprima-modello` in coda. Finché non c'è, la scheda mostra l'icona e «Scarica».
- **Dati**: `velia.template` riscritta come tabella dei modelli: `id`, `tenant_id`, `nome`, `descrizione`, `formato`, `path_file`, `intestazione_agenzia boolean`, `anteprima` (`assente | in-corso | pronta | errore`), `path_anteprima`, `creato_da`, `created_at`. Se ne vanno il predefinito, le righe di piattaforma, `identita_visiva` e il template degli agenti.
- **Chat**: «Genera documento da template» diventa **«Genera da modello»**. La finestra elenca i modelli con la loro riga, e il messaggio nel filo è «Genera da modello: «X»». Il tool `esportazione_elaborata` prende il modello per nome, e nel prompt c'è l'elenco dei modelli con la descrizione.
- **Sandbox**: il file del modello in `/lavoro/modello/`; consegna nel formato del modello, PowerPoint compreso. Con l'intestazione dell'agenzia (o senza modello) il prompt dice di lasciare libere le fasce, coi millimetri, e di non copiare la carta intestata del modello: header e piè li mette VELIA dopo la consegna. Con «la sua» comanda il modello, e un PDF si usa come carta intestata con la sovrapposizione pypdf di sempre. PowerPoint non riceve intestazione.

## Cosa cambia altrove

- **Esporta come** (PDF, Word, testo): layout di VELIA più intestazione e piè, senza scelta di template. Il tool `esporta_subito` perde il parametro del template.
- **Agenti**: via la scelta del template dall'editor dell'agente; il documento è layout di VELIA più intestazione.
- **Tabelle**: export per formato; l'Excel prende l'intestazione di stampa in solo testo.
- **Codice da togliere**: i segnaposto (`riempiDocx`, `riempiXlsx`), lo sfondo PDF di `componiPdf`, l'identità visiva, i predefiniti, i mock dei template.

## Fasi

1. **Intestazione, backend.** FATTA l'11/09/2026. Schema zod (`contratto/intestazione.ts`), tabella `velia.intestazione` (migrazione `20260911100000`, che cancella anche `velia.identita_visiva`), rotte `api/intestazione`, resa PDF/Word/Excel (`generazione/intestazione.ts`), anteprima; Esporta come, agenti, tabelle, strumento `esporta_subito` ed email senza identità né segnaposto; la sandbox senza la sezione dell'identità.
   Test: il testo dell'intestazione è su ogni pagina del PDF (pdfjs) coi numeri di pagina giusti; `header` e `footer` del DOCX portano testo, immagine e campi `PAGE`/`NUMPAGES`; le fasce di stampa dell'XLSX; un JSON fuori schema risponde 400; l'integrazione salva, serve l'immagine e fa l'anteprima col motore vero.
   Trovato strada facendo: `widthOfTextAtSize` di pdf-lib misura con la crenatura ma `drawText` disegna senza, e «P.IVA 0123» usciva «P.IVA0123». Ora si misura carattere per carattere (`generazione/misura.ts`), anche nel corpo dei documenti e nei PDF impaginati dall'ingestion.
2. **Intestazione, front-end.** FATTA l'11/09/2026. Pagina a schede (`?scheda=modelli` per arrivare alla seconda); `features/impostazioni/template/intestazione/`: le estensioni dello schema (`estensioni.ts`: campo, immagine, colonne, dimensione), la normalizzazione verso il contratto (`normalizza.ts`: colori incollati in esadecimale, paragrafi vuoti in coda tolti, testi oltre 500 caratteri spezzati, tetti dello schema detti prima del server), l'editor (un foglio A4 in scala con `--pt` in unità del contenitore, le due fasce, una barra sola che lavora sulla fascia col cursore) e la scheda (salva, annulla, anteprima PDF nel cassetto, prova in Word). TipTap 3.31.3 senza wrapper; il pezzo pesa nel solo chunk lazy della pagina.
   Test: normalizzazione e componente (grassetto dalla barra, campo dal menù nella fascia giusta, allineamento/dimensione/colonne nella forma del contratto, l'HTML incollato fuori schema si perde, larghezza e allineamento dell'immagine selezionata, ricarica senza cronologia, sola lettura per chi non amministra); screenshot desktop e mobile, anteprima col motore vero.
   Trovato strada facendo: con un'immagine selezionata, Chrome non sposta il cursore al clic su un paragrafo vuoto e la prima lettera cancellava il logo; il clic fuori dal nodo ora lo porta dove cade (`spostaDaNodoSelezionato`).
3. **Modelli.** FATTA l'11/09/2026. Migrazione `20260911120000_modelli_riferimento` (cancella i template di prima, toglie il predefinito e il template degli agenti, aggiunge intestazione e anteprima, e il tipo di job `anteprima-modello`); rotte `/api/template` per i modelli (quattro formati, PATCH di nome, «quando usarlo» e intestazione, anteprima, file); il job dell'anteprima col LibreOffice della sandbox (`worker/sandbox/anteprima.ts`); `generazione/timbra.ts`; sandbox, prompt della chat e tool sul modello; «Esporta come» e tabelle solo per formato; agenti col `documento` in PDF. FE: la scheda dei modelli (tutta area di rilascio, «quando usarlo» che si salva uscendo dal campo, intestazione a due segmenti, anteprima che si aggiorna da sola mentre si converte), «Genera da modello» in chat con indicazioni facoltative, tabelle e agenti senza template; i mock allineati.
   Test: timbro su PDF (pdfjs, numeri di pagina), Word (sezioni, prima pagina e pari/dispari, parti e immagini, idempotenza) ed Excel (fasce su ogni foglio, prima dei disegni); prompt della sandbox nei due casi; scelta del modello per nome; integrazione (caricamento dei quattro formati, anteprima accodata, PATCH, anteprima e file, job senza sandbox, eliminazione); componente della scheda. Verificati a mano col LibreOffice della sandbox: Word ed Excel timbrati si aprono con intestazione e numeri giusti, e l'anteprima di un Word si converte in 4 secondi.
   Collaudo con `tools/collaudo-elaborata.ts` su un modello Word con l'intestazione dell'agenzia: la sandbox lascia libere le fasce, il documento esce con logo, recapiti, RUI e «Pagina 1 di 1» (148 s, 0,75 USD). Il collaudo del modulo PDF «la sua» non l'ho fatto: è il percorso di prima, senza timbro, coperto dai test del prompt.

4. **La tela libera.** FATTA l'11/09/2026 pomeriggio, chiesta dal committente: «voglio massima libertà» (testo accanto a un logo alto senza poterlo centrare, un secondo logo che andava a capo). Il contratto delle fasce passa dal flusso di TipTap alla tela (`contratto/intestazione.ts`), il motore la rende in PDF, Word ed Excel come detto sopra, l'editor è rifatto da capo. Un'intestazione salvata col flusso della mattina non passa più lo schema: il GET la sostituisce con quella di partenza (niente migrazione: lo stesso giorno, solo prove).
   Test: schema (valori di partenza, elementi fuori fascia, il flusso di prima rifiutato); PDF con pdfjs (il nome a metà del logo, l'indirizzo che finisce sul margine destro, il RUI nel piè, il corpo sotto la fascia, il testo che va a capo nella casella e allunga la fascia, famiglie e corpi dei segni, un foglio orizzontale); Word (cornici alle coordinate in ventesimi di punto, disegni dietro al testo, id unici, paragrafo alto quanto la fascia, `pgMar` a filo); Excel per terzi del foglio; timbro con le distanze a zero in ogni sezione. FE: geometria, normalizzazione, testo di tutta la casella, e il componente (centrare in verticale due elementi, testo a metà di una casella allungata, trascinare con cronologia, frecce e Canc, barra su tutta la casella e sui pezzi, casella nuova in un posto libero che se vuota se ne va, campo in casella sua, linea e distribuisci, proporzioni di un'immagine, altezza minima della fascia, sola lettura). Collaudo con Chrome vero (puppeteer, upload intercettati e PUT bloccata sulla tenant demo) e resa della bozza col LibreOffice della sandbox: PDF e Word uguali all'editor.
   Trovato strada facendo: col `preventDefault` sul `pointerdown` (serve a non selezionare la pagina mentre si trascina) Chrome non manda il `dblclick`: il doppio clic lo riconosce l'editor. L'Esc che chiude una casella risaliva al foglio e toglieva anche la selezione.

## Aperto

- **Word e la sovrapposizione**: nelle fasce di Word le immagini e le forme stanno sempre dietro al testo (le caselle sono cornici); un'immagine messa sopra un testo nell'editor, in Word gli finisce sotto. Nel PDF l'ordine è quello della tela.

- **Prima pagina diversa** (intestazione piena sulla prima, compatta sulle altre): dopo, se serve.
- **Intestazione nelle email**: no, per ora.
- **Fedeltà di LibreOffice sui .pptx** nell'anteprima: da vedere su un file vero.
- **Il runner della sandbox fa un job per volta**: la conversione di un'anteprima aspetta in coda come gli altri lavori.
- **Il numero di pagina nel footer Word**, aperto con LibreOffice, esce un filo più grande del testo accanto (il campo prende il corpo del paragrafo): in Word da verificare.