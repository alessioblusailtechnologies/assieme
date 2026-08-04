# ASSIEME

Piattaforma AI per il settore assicurativo — assistente interrogabile in
linguaggio naturale per agenzie, broker e intermediari.

**Blusail Technologies S.R.L.S.**

---

## Cosa c'è in questo repository

| Cartella | Contenuto |
|---|---|
| [`fe-angular/`](fe-angular/) | Applicazione front-end — Angular 22, PrimeNG, AG Grid |
| [`mocks/`](mocks/) | Server mock (Mockoon) + stub SSE — **il contratto verso il backend** |
| [`website/`](website/) | Sito vetrina — Astro |

| Documento | Contenuto |
|---|---|
| [`ASSIEME-analisi-requisiti.md`](ASSIEME-analisi-requisiti.md) | Requisiti funzionali e non funzionali, v0.8 |
| [`ASSIEME-piano-sviluppo-fe.md`](ASSIEME-piano-sviluppo-fe.md) | Piano di sviluppo front-end, fasi e decisioni aperte |

`mocks/` sta fuori da `fe-angular/` di proposito: non è codice front-end, è
la specifica eseguibile delle API. Chi implementerà il backend lo avvia e
vede rotte, header e forme di risposta attese.

## Avvio rapido

```bash
cd fe-angular
npm install
npm run dev      # Mockoon (3000) + stub SSE (3001) + Angular (4200)
```

Dettagli, convenzioni e note sulle licenze: [`fe-angular/README.md`](fe-angular/README.md).

## Stato

**Fase 0 completata** — fondamenta: tema, struttura applicativa, contratto
dati, server mock, autenticazione simulata con selettore di ruolo. Le
schermate sono segnaposto che dichiarano la fase in cui verranno costruite.

Le fasi successive e le decisioni ancora aperte sono nel piano di sviluppo.

## Licenze di terze parti

- **PrimeNG 22** non è più MIT: usiamo la *PrimeUI Community License*
  (gratuita, soggetta a requisiti di dimensione aziendale, **rinnovo entro il
  04/08/2027**). Vedi `fe-angular/README.md`.
- **AG Grid** in versione Community (MIT). L'esportazione XLSX è Enterprise e
  non la usiamo: l'export su template è compito del backend.
