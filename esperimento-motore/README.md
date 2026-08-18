# Esperimento del motore agentico

Prova manuale del motore descritto in `VELIA-motore-agentico.md` (§8):
prima di scrivere il backend, il motore va dimostrato su questa macchina con
i documenti reali del caso pilota. Se convince qui, il resto è idraulica.

## Struttura

```
esperimento-motore/
  originali/      ← metti qui i PDF (mai nel repo: .gitignore)
  workspace/      ← il mondo che il modello naviga
    CLAUDE.md     ← le regole del motore (fa da prompt di sistema)
    archivio-pubblico/…   ← i set informativi convertiti in .md
    tenant/…              ← preventivi/polizze del pilota convertiti
  risultati/      ← un .json per interrogazione, con le misure
  interroga.ps1   ← lancia un'interrogazione e stampa le misure
```

## Procedura

1. **Posiziona i PDF** in `originali/` (set informativo Cattolica "Active
   Veicoli AUTOPIÙ", preventivo Unipol, e ciò che vuoi mettere alla prova).
2. **Conversione** — chiedi a Claude Code di convertirli: ogni PDF diventa un
   `.md` con ancore `[pag. N]`, collocato nell'albero di `workspace/` con i
   suoi `INDICE.md`. (In produzione questo passo sarà la pipeline di
   ingestion automatica; qui lo facciamo in sessione per giudicarne la
   qualità da vicino.)
3. **Interroga**:

   ```powershell
   .\interroga.ps1 -Domanda "Confronta le esclusioni della garanzia cristalli tra il set informativo Cattolica e il preventivo Unipol"
   .\interroga.ps1 -Domanda "..." -Model claude-opus-5   # per confrontare i modelli
   ```

4. **Giudica** — per ogni risposta: le citazioni puntano a pagine giuste?
   le informazioni trovate sono complete (verifica sul PDF)? quanti turni,
   secondi, token, dollari? I numeri finiscono in `risultati/` e alimentano
   le decisioni aperte 1, 2 e 4 del documento di architettura.

## Nota su autenticazione e costi

L'esperimento usa la CLI autenticata di questa macchina: va bene per una
prova di sviluppo. Il worker di produzione userà una API key dedicata
(`chat-analisi.txt`): mai abbonamenti personali dietro un prodotto
multi-utente.
