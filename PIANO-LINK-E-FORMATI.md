# Link e formati: il piano

11/09/2026. Nasce dalla conversazione di prova su Unipol Scudo Cyber: l'agente voleva una presentazione per il cliente, da vedere sul telefono, e il motore ha risposto che una pagina interattiva non la sa consegnare perché i formati sono PDF, DOCX, XLSX e PPTX. Tre richieste del committente:

1. **Nessun limite sui formati in uscita**: la sandbox consegna qualsiasi file (pagina web interattiva, immagine, PowerPoint, CSV, ZIP…), non solo PDF, Word ed Excel.
2. **Pagine con link**: un documento generato si condivide col cliente come link, che si apre dal telefono.
3. **Nessun limite sui formati in ingresso**: si carica qualsiasi file; VELIA lo rende leggibile quando può, e l'originale resta sempre disponibile.

**Stato**: tutte e tre le fasi fatte l'11/09/2026. Fasi 1 e 2 collaudate col motore della chat e la sandbox veri (pagina HTML interattiva generata, link creato dal motore, pagina servita isolata); fase 3 collaudata coi test (riconoscimento, buste .p7m DER/BER/doppie/base64, email con PEC annidata, immagini in PNG, job di lettura per ogni famiglia) e con la conversione vera di Word, SVG e PowerPoint nel LibreOffice della sandbox (circa 4 s ciascuno). La trascrizione di audio e video usa il Voxtral della dettatura, con dieci minuti di tempo massimo: provata su un parlato italiano sintetico (voce Elsa di Windows), trascritto giusto in 0,6 s col gergo al suo posto («RCA», «Kasko»). Un video vero non è ancora stato provato: se Voxtral non ne prende la traccia audio, il documento va in errore e il messaggio dice di caricare solo l'audio.

## Decisioni del committente (11/09/2026)

- **Accesso**: chi ha il link. Token casuale lungo (come le chat cliente), revocabile e rigenerabile. Niente PIN.
- **Scadenza**: 30 giorni di default; l'agente la cambia (anche «nessuna») o revoca il link.
- **Chi crea il link**: il pulsante «Condividi link» su ogni documento generato, e il motore quando in chat si chiede una pagina da mandare al cliente.
- **Aperture**: nessun tracciamento. La pagina si apre e basta: niente contatori, niente IP, niente cookie.

## Scelte tecniche

- **L'unico limite di formato in uscita sono gli eseguibili** (`exe`, `msi`, `bat`, `cmd`, `com`, `scr`, `ps1`, `vbs`, `js`, `jar`, `apk`, `sh`, `app`, `dmg`…): un'agenzia non ne ha bisogno, e un cliente non deve ricevere un programma da VELIA.
- **Le pagine HTML generate le serve l'API, isolate**: `Content-Security-Policy` con `sandbox allow-scripts` (origine opaca, nessun accesso all'app né ai suoi dati), nessuna risorsa esterna, nessuna chiamata di rete (`connect-src 'none'`), `noindex`, `no-referrer`, `nosniff`. Per questo la pagina è **un file solo, autosufficiente**: CSS, script e immagini dentro l'HTML.
- **Dimensione**: resta il limite per file del piano del tenant (20 MB di default). È un limite di spazio, non di formato.
- Intestazione e piè dell'agenzia si stampano come oggi su PDF, Word ed Excel. Sugli altri formati (pagine, immagini, PowerPoint) il marchio lo mette la sandbox, con logo e dati dell'agenzia che il worker le passa in `/lavoro/carta/`.

## Fase 1 · Uscita in qualsiasi formato

- **Runner della sandbox** (`be-node/sandbox/server.mjs`): `consegna` accetta qualsiasi estensione tranne gli eseguibili, e un file senza estensione no. Corregge il PowerPoint, oggi rifiutato qui anche se il resto della catena lo accetta. Si ripubblica `velia-sandbox`.
- **Worker** (`worker/sandbox/esportazione.ts`): niente più elenco dei formati consegnabili; il timbro dell'agenzia solo su PDF, Word ed Excel (`timbra.ts` rifiuta gli altri invece di trattarli da Excel); per gli altri formati la carta dell'agenzia in `/lavoro/carta/` (loghi e testi di intestazione e piè).
- **Tipi**: `DocumentoGenerato.formato` è l'estensione (stringa), MIME da una tabella con ripiego `application/octet-stream` (`generazione/formati.ts`).
- **Download** (`GET /api/conversazioni/:id/documenti/:did`): tipo col ripiego, `nosniff`, sempre `attachment`.
- **Prompt**: lo strumento della chat dice che la sandbox consegna qualsiasi formato; il prompt della sandbox produce «il file richiesto», con una sezione per le pagine web (un file solo, mobile first, niente rete, controllo con uno screenshot a 390 px) e una per le immagini.
- **FE**: il formato è una stringa; il riquadro del documento mostra l'estensione com'è.

## Fase 2 · Pagine con link

- **Dati**: `velia.pagine_condivise` (`tenant_id`, `conversazione_id`, `documento_id`, `nome`, `formato`, `token_hash` unico, `token` in chiaro per rimostrarlo, `scade_il`, `creata_da`, `creata_il`), un link per documento, proprietario `velia_app`, RLS per tenant.
- **API dell'agenzia**: `GET` / `PUT` / `DELETE /api/conversazioni/:id/documenti/:did/link`. `PUT` crea il link (token nuovo) o ne cambia la scadenza; `DELETE` lo revoca (un `PUT` dopo ne crea uno nuovo).
- **Pagina pubblica**: `GET /p/:token` sull'API, fuori dall'autenticazione. HTML, PDF, immagini e testo si aprono nel browser; gli altri formati hanno una pagina minima col nome del file e il pulsante per scaricarlo (`/p/:token/file`). Link scaduto, revocato o inesistente: la stessa pagina «link non più attivo», 404. Header di isolamento come sopra, `Cache-Control: private, no-store`.
- **Indirizzo**: `BASE_LINK_PAGINE` (default l'API dev). Un dominio dedicato (es. `pagine.sonovelia.it` sul servizio API) si aggiunge senza toccare il codice.
- **Motore**: strumento `condividi_link` (un documento generato in questa conversazione, per nome; senza nome l'ultimo), che restituisce l'indirizzo da scrivere in risposta. Il prompt dice di usarlo quando l'utente chiede una pagina o un documento da mandare al cliente.
- **FE**: accanto a ogni documento generato, «Condividi link»: indirizzo da copiare, «Invia su WhatsApp», scadenza (7, 30, 90 giorni, nessuna), «Revoca».

## Fase 3 · Ingresso in qualsiasi formato

Si accetta qualsiasi file, in archivio, negli allegati della chat, fra i documenti di riferimento e fra i modelli. Per ogni famiglia, ciò che il motore riceve:

| Famiglia | Esempi | Il motore riceve |
|---|---|---|
| Testo | txt, md, csv, tsv, json, xml, html, yaml, ics, vcf, log | il testo (HTML in Markdown, CSV in tabella) |
| Office | doc, xls, ppt, pptx, odt, ods, odp, rtf, pages, numbers, key | conversione col LibreOffice della sandbox, poi la via del PDF (o di Word/Excel) |
| Immagini | webp, gif, heic, tiff, bmp, svg | conversione in PNG, poi la via delle immagini |
| Email | eml, msg | intestazioni e corpo in Markdown; gli allegati come documenti a sé |
| Archivi | zip (anche in chat) | ogni file come documento a sé |
| Firmati | p7m | il file contenuto, estratto e rilavorato |
| Audio | mp3, m4a, wav, ogg, opus (vocali WhatsApp) | la trascrizione di Voxtral |
| Video | mp4, mov | l'audio estratto e trascritto |
| Altro | qualsiasi | una scheda col nome e il tipo; l'originale resta per la sandbox |

Come è stata fatta:

- **Riconoscimento** (`worker/ingestion/riconoscimento.ts`, spostato dall'API perché lo usano anche le letture; `api/archivio-privato/formati.ts` lo riesporta): ogni file ha sempre una famiglia, i byte confermano quella dichiarata o la correggono, e senza conferma è `altro`. Nessun 415. `preparaFile` porta a PNG le immagini (`sharp`, e `heic-convert` per le HEIC) e rinomina il file; `allegatiDaEmail` estrae gli allegati, anche quelli del messaggio originale dentro una PEC.
- **Database**: migrazione `20260911220000_formati_qualsiasi.sql` (APPLICATA): famiglie nuove su `documenti.formato`, `template.formato` = estensione.
- **Caricamento**: in archivio gli allegati di un'email diventano documenti a sé nella stessa cartella; da uno zip entra tutto tranne i file di sistema (Thumbs.db, desktop.ini, ~$…); uno zip che non si apre entra com'è. Allegati della chat e documenti di riferimento senza più filtri.
- **Lettura** (`worker/ingestion/gestore.ts`, `rendiLeggibile`): .p7m sbustato (`firmati.ts`, lettore BER senza dipendenze) e riletto per quello che contiene; Office in PDF (`worker/sandbox/conversione.ts`); audio e video trascritti (Voxtral, spostato in `src/trascrizione/`); `altro` con la sua scheda. L'allegato veloce resta istantaneo per PDF, immagini, testo, pagine web, email (col testo degli allegati) e file non leggibili; per Office, audio, video e firmati passa dal worker.
- **Workspace**: la scheda di un file `altro` nel contesto ha l'originale accanto, per la sandbox.
- **Modelli di riferimento** di qualsiasi formato tranne gli eseguibili; PDF e Office si aprono per controllarli. **Intestazione**: loghi di qualsiasi formato immagine, portati a PNG.
- **FE**: niente filtri `accept`, si incolla qualsiasi immagine, i formati dei modelli si mostrano con l'estensione.
- Sicurezza: le macro non girano (LibreOffice senza interfaccia, nella sandbox); un'immagine oltre i 100 megapixel non si apre; SVG e HTML caricati non si mostrano mai nell'app (il download è sempre `attachment`).

## Fuori da questo piano

- Allegati alle email: «Invia email» oggi non allega i documenti generati.
- Velocità della generazione (analisi dell'11/09/2026: contenuto scritto due volte da chat e sandbox, fonti riverificate, controlli pagina per pagina).
- Più sandbox in parallelo: oggi il runner lavora un job per volta, e le conversioni della fase 3 si mettono in fila con le generazioni.
