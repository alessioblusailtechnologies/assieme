# Testi per il canale YouTube di Velia

Il canale è già indicato in `website/src/config/site.ts`:
`https://www.youtube.com/@sonovelia`.

## Descrizione del canale (massimo 1000 caratteri)

Velia è l'AI per agenzie, broker e intermediari assicurativi: conosce
come lavora la tua agenzia e risponde con le sue parole.

Su questo canale la vedi all'opera: le risposte con la fonte citata in
ogni passaggio, i confronti tra decine di prodotti in tabelle
verificabili, i documenti per il cliente già impaginati col marchio
dell'agenzia.

Velia è un prodotto di Blusail Technologies S.r.l.s.
Scrivici: ciao@sonovelia.it · sonovelia.it

*(circa 430 caratteri, il limite del campo è 1000)*

## Le immagini in questa cartella

| File | Uso | Formato |
| --- | --- | --- |
| `velia-logo-youtube.png` | foto profilo del canale | 800x800, la V centrata resta dentro il ritaglio circolare |
| `velia-copertina-youtube.png` | immagine del banner | 2560x1440, il formato che YouTube chiede per coprire anche la TV |

Il banner è il formato più delicato: su TV si vede il quadro intero,
sul desktop una striscia orizzontale, sul telefono ancora meno. L'unico
rettangolo visibile ovunque è l'area sicura centrale di 1235x338, e
tutto il testo sta lì dentro; il resto del quadro è fotogramma e
inchiostro. Per rigenerare:
`powershell -ExecutionPolicy Bypass -File social/genera-social.ps1`.
