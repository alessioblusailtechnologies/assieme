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

- **Blocchi**: paragrafo (allineamento a sinistra, al centro, a destra); immagine (larghezza, allineamento); riga a colonne (2 o 3, ognuna con paragrafi e immagini).
- **Testo**: grassetto, corsivo, sottolineato; tre dimensioni (piccolo, normale, grande); colori: quello dell'agenzia, grigio, nero.
- **Campi automatici**: numero di pagina, pagine totali, data, titolo del documento, nome dell'agenzia. Partita IVA, iscrizione RUI e simili si scrivono come testo, una volta.
- **Fuori schema**: tabelle libere, elenchi, link, font a scelta, sfondi. Sono ciò che fa divergere l'anteprima dal documento.
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

- **PDF** (pdf-lib): impagina intestazione e piè nella larghezza utile, ne misura l'altezza e da quella ricava i margini del corpo. I campi si risolvono pagina per pagina: le pagine totali si conoscono dopo aver impaginato il corpo.
- **Word** (`docx`): `Header` e `Footer` con paragrafi, `ImageRun`, una tabella senza bordi per le colonne, campi `PAGE` e `NUMPAGES`.
- **Excel** (exceljs, `headerFooter`): solo testo. Le colonne vanno in `&L`, `&C`, `&R`; un paragrafo senza colonne va nella sezione del suo allineamento; campi `&P`, `&N`, `&D`; le immagini non ci sono.
- **Sui file della sandbox** (`generazione/timbra.ts`, deciso in fase 3 al posto di `carta.pdf` e `carta.docx`): l'intestazione la mette il worker dopo la consegna, con lo stesso motore. PDF: le fasce disegnate su ogni pagina, coi numeri giusti; Word: header e footer dell'agenzia al posto di quelli del documento, in ogni sezione (prima pagina diversa e pari/dispari spente); Excel: le fasce di stampa scritte nell'XML di ogni foglio, senza riscrivere il file con ExcelJS (perderebbe grafici e formati di openpyxl). Alla sandbox si dicono solo i margini da lasciare liberi (`misureFasce`).

### Front-end

- Pagina a due schede, con lo stesso schema di Istruzioni (`role="tablist"`, `.scheda`).
- `features/impostazioni/template/intestazione/`: un componente nostro sopra `@tiptap/core` e le sue estensioni open (paragraph, text, bold, italic, underline, hard-break, text-align, text-style, color, undo-redo, gapcursor, trailing-node, placeholder), più i nodi nostri: `immagine`, `colonne`/`colonna` e `campo`. Niente wrapper di terzi.
- Barra degli strumenti con i nostri pulsanti e i token del design system.
- Tela in proporzione A4, alla larghezza utile vera, così un a capo nell'editor è un a capo nel PDF.
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

## Aperto

- **Prima pagina diversa** (intestazione piena sulla prima, compatta sulle altre): dopo, se serve.
- **Intestazione nelle email**: no, per ora.
- **Fedeltà di LibreOffice sui .pptx** nell'anteprima: da vedere su un file vero.
- **Il runner della sandbox fa un job per volta**: la conversione di un'anteprima aspetta in coda come gli altri lavori.
- **Il numero di pagina nel footer Word**, aperto con LibreOffice, esce un filo più grande del testo accanto (il campo prende il corpo del paragrafo): in Word da verificare.