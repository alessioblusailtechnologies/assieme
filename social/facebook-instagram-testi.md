# Testi per le pagine Facebook e Instagram di Velia

## Facebook

### Descrizione (campo breve, massimo 255 caratteri)

> Conosce come lavori, risponde come voi. Velia è l'AI per agenzie,
> broker e intermediari assicurativi: risposte dagli archivi
> dell'agenzia, confronti verificabili e documenti pronti col tuo
> marchio. Un prodotto Blusail Technologies.

231 caratteri: rientra nel limite di 255 del campo descrizione.

### Informazioni (campo lungo)

Stesso testo della «Panoramica» LinkedIn, vedi `linkedin-testi.md`: le
pagine devono raccontare la stessa storia con le stesse parole.

## Instagram

Instagram non ha copertina: servono solo il logo e la biografia.

### Biografia (massimo 150 caratteri)

> Conosce come lavori, risponde come voi.
> AI per agenzie, broker e intermediari.
> Un prodotto Blusail Technologies

111 caratteri su tre righe. Nel campo sito: `sonovelia.it`.

## Le immagini in questa cartella

| File | Uso | Formato |
| --- | --- | --- |
| `velia-logo-facebook.png` | foto profilo della pagina Facebook | 500x500 |
| `velia-copertina-facebook.png` | copertina della pagina Facebook | 1640x624, l'820x312 consigliato a doppia densità |
| `velia-logo-instagram.png` | foto profilo Instagram | 500x500, la V centrata resta dentro il ritaglio circolare |

La copertina Facebook tiene il testo dentro la fascia centrale
(x fino a 1460 su 1640): sul telefono restano visibili i 640 pixel
centrali degli 820, e il testo deve sopravvivere al ritaglio. La parte
bassa a sinistra è decorativa: in pagina ci si sovrappone la foto
profilo. Per rigenerare:
`powershell -ExecutionPolicy Bypass -File social/genera-social.ps1`.
