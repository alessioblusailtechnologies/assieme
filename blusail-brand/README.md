# Blusail — il marchio

Redesign del logo aziendale di Blusail Technologies S.r.l.s.

## Il concetto

Il nome viene da una storia di famiglia: alla figlia del fondatore, da
piccola, piacevano le vele blu del villaggio Valtur. Il marchio la
racconta senza dirla: **due vele, una grande e una piccola**, in
navigazione insieme sulla stessa acqua. La vela piccola sta davanti,
nel blu più chiaro: è lei che dà il nome a tutto.

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
| `blusail-logo.svg` | orizzontale su fondo chiaro, la versione d'uso quotidiano |
| `blusail-logo-scuro.svg` | orizzontale su fondo scuro |
| `blusail-logo-verticale.svg` | impilato, per avatar larghi e chiusure di documento |
| `blusail-marchio.svg` | le sole vele, per favicon e spazi stretti |
| `blusail-marchio-scuro.svg` | le sole vele, su fondo scuro |

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
