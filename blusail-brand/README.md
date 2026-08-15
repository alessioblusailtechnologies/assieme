# Blusail — il marchio

Redesign del logo aziendale di Blusail Technologies S.r.l.s.

## Il concetto

Il nome viene da una storia di famiglia: alla figlia del fondatore, da
piccola, piacevano le vele blu del villaggio Valtur. Il marchio la
astrae senza illustrarla: **due tratti curvi che salgono, uno grande e
uno piccolo**. Chi conosce la storia ci vede le due vele, il genitore e
la bambina; chi non la conosce vede slancio e crescita. Niente barca,
niente acqua: è un'azienda tecnologica, non marittima.

## Le forme e le voci

- **Wordmark**: TWK Ghost Medium, lo stesso taglio con cui firma Velia.
  Le lettere sono convertite in tracciati: i file non dipendono dai font
  installati.
- **Palette**: i token di Velia. Blu del marchio `#2F4B7C`, vela piccola
  `#7F97C4`, inchiostro `#1C1A15`; sul fondo scuro le vele salgono ai blu
  leggibili (`#7F97C4` / `#9FB4D6`) e il testo va in crema `#F5F1E8`.

## I file

| File | Uso |
| --- | --- |
| `blusail-logo.svg` | orizzontale su fondo chiaro: tratti, Blusail e TECHNOLOGIES |
| `blusail-logo-scuro.svg` | orizzontale su fondo scuro |
| `blusail-nome.svg` | solo il nome con la riga TECHNOLOGIES, senza marchio |
| `blusail-marchio.svg` | i soli tratti, per spazi stretti |
| `blusail-marchio-scuro.svg` | i soli tratti, su fondo scuro |
| `blusail-app.svg` | il quadrato blu con i tratti: avatar, favicon, icona app |

## Rigenerare

```
npm install
node genera-logo.mjs
```

Tutte le misure e i colori stanno in `genera-logo.mjs`.

## Avvertenza sulla licenza del font

TWK Ghost è in uso sotto la licenza del sito: prima di adottare il logo
come marchio ufficiale (registrazione, materiali stampati) va verificato
che la licenza copra l'uso in un logotipo.
