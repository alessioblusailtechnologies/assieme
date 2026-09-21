---
name: carta-intestata-pdf
description: Usare un modello PDF come carta intestata (logo, intestazione, piè di pagina, filigrane di un altro ente da conservare pixel per pixel) stampandoci sopra un contenuto nuovo, anche su più pagine. Da usare quando il modello di riferimento in /lavoro/modello/ è un PDF e la sua intestazione va tenuta così com'è.
---

# Un modello PDF come carta intestata

Un modello PDF con la sua carta intestata si USA, non si imita: logo, intestazione, piè di pagina, colori e filigrane restano quelli, pixel per pixel, perché il contenuto nuovo si stampa SOPRA la pagina del modello.

1. **Guarda e misura.** `pdftoppm -png -r 100 -f 1 -l 2 <modello.pdf> /lavoro/tmp/mod` e leggi le immagini. Individua le fasce occupate da intestazione (logo) e piè di pagina e lo spazio libero per il corpo. A 100 dpi, 1 mm = 3,94 px; una pagina A4 è 210×297 mm. Annota colori dominanti e font (`pdffonts <modello.pdf>`), e i testi delle diciture (`pdftotext -layout <modello.pdf> -`).
2. **Il contenuto, da solo.** Scrivi l'HTML del solo corpo e stampalo con Chromium (`chromium-headless --print-to-pdf=<out.pdf> --no-pdf-header-footer <file.html>`) con `@page { size: A4; margin: <alto> <destro> <basso> <sinistro> }`, dove i margini alto e basso lasciano LIBERE le fasce misurate al punto 1 (più 5 mm di respiro). Nessuno sfondo pieno (né sul body né sui blocchi): il modello deve vedersi attraverso.
3. **Sovrapponi con pypdf.** Ogni pagina del contenuto va stampata sulla pagina del modello: la prima sulla pagina 1 del modello; le successive sulla pagina 2 se il modello ne ha una (di solito è la carta intestata «seguente»), altrimenti ancora sulla 1:

```python
from copy import deepcopy
from pypdf import PdfReader, PdfWriter
mod, cont, out = PdfReader('/lavoro/modello/<file>.pdf'), PdfReader('/lavoro/tmp/contenuto.pdf'), PdfWriter()
for i, pagina in enumerate(cont.pages):
    base = deepcopy(mod.pages[0] if i == 0 or len(mod.pages) < 2 else mod.pages[1])
    base.merge_page(pagina)
    out.add_page(base)
out.write('/lavoro/output/<nome>.pdf')
```

4. **Se la pagina del modello ha testo nel corpo** (è un esempio già compilato, non una carta intestata vuota), non puoi usarla come sfondo intero: costruisci la carta intestata e poi torna al punto 3. Rendi la pagina a 200 dpi, ritaglia con Pillow la sola fascia dell'intestazione (dal bordo superiore a sotto il logo, righe di protocollo comprese se fanno parte della carta) e quella del piè (dalla riga sopra gli indirizzi al bordo inferiore), `Image.open(...).crop((0, y1, w, y2))`, e componi un PDF A4 di UNA pagina, `carta.pdf`, con le due immagini a larghezza piena ai bordi e il centro vuoto: in HTML stampato con Chromium (`@page { size: A4; margin: 0 }`, un `div` alto 297 mm con le due `img` in `position: absolute` a `top: 0` e `bottom: 0`), oppure con reportlab (`canvas.drawImage`). Poi usa `carta.pdf` come modello al punto 3 (`mod.pages[0]` per tutte le pagine) e stampa il contenuto con i margini alto e basso che lasciano libere le due fasce. Non usare `position: fixed` per intestazione e piè nel PDF del contenuto: la sovrapposizione con pypdf è deterministica e vale per qualsiasi numero di pagine. Se il ritaglio viene male (fasce mescolate al testo) estrai il logo a piena risoluzione con `pdfimages -png <modello.pdf> /lavoro/tmp/img` e ricostruisci intestazione e piè con quello, i colori campionati e le diciture copiate alla lettera da `pdftotext`.
5. **Controlla che la carta ci sia.** Nelle pagine prodotte logo, intestazione e piè del modello devono comparire su OGNI pagina, senza che il contenuto li copra o li sbordi.

Per un DOCX da un modello PDF vale lo stesso principio: le fasce ritagliate diventano le immagini di intestazione e piè di pagina del DOCX (skill docx).
