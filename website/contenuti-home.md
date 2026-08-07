# Contenuti della homepage — inventario completo

Estratto dal codice il 07/08/2026, dopo le modifiche a titolo e barra annunci.

**Dove si modifica cosa:** quasi tutti i testi vivono in `src/data/home.ts`;
i pochi hard-coded nei componenti sono segnalati con il percorso del file.

---

## Struttura della pagina (ordine delle sezioni, da `src/pages/index.astro`)

```
┌─ <head> — SEO (title, description, dati strutturati)
├─ [Barra annunci — SPENTA per il lancio]
├─ Header di navigazione (sito-wide)
│
├─ 1. Hero                  sfondo scuro, foto segnaposto
├─ 2. Statement             posizionamento in due frasi
├─ 3. Product shot          riproduzione dell'interfaccia di confronto
├─ 4. Memoria viva          sezione scura con grafo animato
├─ 5. Ticker casi d'uso     7 voci a scorrimento verticale
├─ 6. Testimonianza         ⚠️ segnaposto
│
│  — da qui la pagina resta scura fino al fondo —
├─ 7. Dimostrazioni         3 card video + nastro loghi ⚠️ segnaposto
├─ 8. Numeri                5 statistiche di progetto
├─ 9. Sicurezza             promessa breve + 6 badge
├─ 10. CTA finale           invito alla demo
│
└─ Footer (sito-wide)
```

---

## SEO (`src/pages/index.astro`)

| Campo | Testo |
|---|---|
| `<title>` | Velia \| Software AI per agenzie assicurative e broker |
| Meta description | L'assistente AI per agenzie, broker e intermediari: i set informativi già in archivio, i tuoi documenti accanto ai loro, ogni risposta con la fonte citata. |

La pagina porta anche un blocco dati strutturati `SoftwareApplication`
(descrizione, elenco funzionalità, pubblico) visibile solo ai motori.

---

## 1. Hero (`src/data/home.ts` → `hero`; bottoni in `src/components/home/Hero.astro`)

- **H1:** L'intelligenza artificiale / per la distribuzione assicurativa
- **Lead:** Le agenzie, i broker e gli intermediari più esigenti usano Velia per leggere i documenti, confrontare le condizioni e rispondere ai clienti con la fonte sempre citata.
- **CTA primaria:** Richiedi una demo → `/demo`
- **CTA secondaria:** I nostri clienti → `/clienti`
- ⚠️ Segnaposto: fotografia di sfondo ("agenzia / cliente in riunione") e nastro di 8 loghi cliente.

## 2. Statement (`src/data/home.ts` → `statement`)

- **Frase forte:** Velia è l'intelligenza artificiale pensata per la distribuzione assicurativa.
- **Frase attenuata:** Lavora sui documenti che hai già, ragiona con i criteri della tua agenzia e lascia a te l'ultima parola.
- ⚠️ Dopo il nuovo H1, la frase forte è quasi identica al titolo della hero: da riscrivere.

## 3. Product shot (`src/data/home.ts` → `productShot`)

Riproduzione statica dell'interfaccia (markup vero, leggibile da screen reader e motori).

- **Breadcrumb:** Fascicolo / Rinnovo auto — cliente Rossi
- **Tab:** Confronto · Esporta
- **Titolo tabella:** Ramo auto — la polizza in corso e il preventivo a confronto
- **Colonne:** Garanzia · Active Veicoli AUTOPIÙ · Preventivo Unipol

| Garanzia | Active Veicoli AUTOPIÙ | Preventivo Unipol |
|---|---|---|
| Massimale RCA | € 6.450.000 | € 25.000.000 *(evidenziata come migliorativa)* |
| Franchigia kasko | € 500 | € 750 |
| Scoperto atti vandalici | 10% | 15% *(evidenziata come peggiorativa)* |
| Infortuni del conducente | Inclusa | Non prevista |

- **Sintesi:** 9 differenze rilevanti su 54 garanzie. Gli infortuni del conducente non risultano carenza: la tua agenzia li copre a parte.
- **Citazioni:** autopiu_cda.pdf · art. 12 p. 34 — preventivo_unipol.pdf · sez. 3 p. 2
- **Campo prompt (decorativo):** Chiedi ad Velia… · Invia
- ⚠️ Refuso: "Chiedi **ad** Velia" → "Chiedi **a** Velia" (`ProductShot.astro:67`).
- ⚠️ Incoerenza: la caption nascosta della tabella parla di "proposta Generali … polizza RC Professionale", ma la tabella mostra il ramo auto AUTOPIÙ/Unipol (`ProductShot.astro:36-39`).

## 4. Memoria viva (`src/data/home.ts` → `memory`)

- **Occhiello:** Memoria viva
- **Titolo:** Un archivio che risponde invece di aspettare
- **Corpo:** Le cartelle condivise conservano. Non collegano, non ricordano, non rispondono. Qui ogni documento letto entra a far parte di qualcosa che cresce: le regole che gli detti, le scelte che ti vede fare, la casistica che avete già risolto.
- **Tre righe:**
  - **Le tue regole** — Scrivi in italiano come valuta la tua agenzia. Vale da subito, per tutti i colleghi
  - **Quello che impara** — Prassi, pratiche ricorrenti e preferenze: non devi ripeterle a ogni conversazione
  - **Sempre tuo** — Consulti, correggi e cancelli quello che ha imparato. Le tue regole vengono prima
- **CTA:** Come funziona la memoria viva → `/piattaforma#memoria`

## 5. Ticker dei casi d'uso (`src/data/home.ts` → `useCases`)

- **Intro:** Le agenzie / usano Velia per
- **Le 7 voci:** Confronto polizze · Analisi delle garanzie · Lettura dei capitolati · Verifica dei preventivi · Ricerca fra le condizioni · Archivio documentale · Proposte per il cliente
- **CTA:** Esplora la piattaforma → `/piattaforma`

## 6. Testimonianza ⚠️ SEGNAPOSTO (`src/data/home.ts` → `testimonial`)

- **Citazione:** «Gli altri strumenti ci segnalavano come carenza una garanzia che noi copriamo da sempre a parte. Ad Velia l'abbiamo spiegato una volta, in italiano, e da allora ragiona come ragioniamo noi.»
- **Firma:** Nome Cognome · Titolare · Agenzia pilota
- **CTA:** Guarda la dimostrazione → `/clienti`
- ⚠️ Da sostituire prima della pubblicazione: c'è una sola agenzia pilota e nessuna citazione autorizzata. Anche il ritratto è segnaposto.
- ⚠️ Refuso: "**Ad** Velia" → "**A** Velia".

## 7. Dimostrazioni (`src/data/home.ts` → `stories`; titoli sezione in `Stories.astro`)

- **Titolo:** Tre dimostrazioni, su documenti veri
- **CTA:** Vedi tutte le dimostrazioni → `/clienti`
- **Le 3 card:**
  1. Un preventivo concorrente smontato in dieci minuti → `/clienti#confronto-auto`
  2. Dieci prodotti a confronto in una tabella sola → `/clienti#tabella-analisi`
  3. Le nuove edizioni segnalate senza andarle a cercare → `/clienti#agente-edizioni`
- ⚠️ Segnaposto: nastro di 6 loghi cliente sotto le card.

## 8. Numeri (`src/data/home.ts` → `stats`, `statsIntro`)

- **Intro:** Meno tempo sui documenti, / più tempo sui clienti

| Etichetta | Valore |
|---|---|
| Documenti da caricare per cominciare | 0 |
| Risposte con la fonte citata | 100% |
| Formati per i documenti al cliente | 4 |
| Documenti a confronto, contro i 5 degli altri | Decine |
| Compagnie già in archivio | In crescita |

Nota di progetto: sono scelte di prodotto, non numeri di adozione (pre-lancio).

## 9. Sicurezza (`src/data/home.ts` → `security`)

- **Titolo:** Accuratezza e riservatezza, / prima di ogni altra cosa
- **Corpo:** Velia cita sempre da dove viene una risposta e dice quando non lo sa. I tuoi documenti restano tuoi: non escono dall'agenzia, non finiscono in mano ad altri clienti, non addestrano nulla.
- **CTA:** Approfondisci la sicurezza → `/sicurezza`
- **I 6 badge** (marchio — testo → destinazione):
  - Fonte — Ogni risposta citata → `/sicurezza#citazione`
  - Non so — Mai una risposta inventata → `/sicurezza#non-copertura`
  - Solo tuoi — Documenti riservati → `/sicurezza#isolamento`
  - GDPR — Trattamento conforme → `/sicurezza#gdpr`
  - Tracce — Fonti sempre tracciate → `/sicurezza#tracciabilita`
  - Memoria — Che controlli tu → `/sicurezza#memoria`

## 10. CTA finale (`src/components/CtaBanner.astro`)

- **Titolo:** Porta l'AI professionale dentro la tua agenzia
- **CTA:** Richiedi una demo → `/demo`

---

## Barra annunci — spenta, testi conservati (`src/config/site.ts` → `announcements`)

1. **Novità** — Tabelle: decine di prodotti a confronto, con la fonte in ogni casella
2. **Novità** — I tuoi archivi ora raggiungibili anche dagli strumenti AI che già usi
3. **Novità** — I documenti per il cliente escono già impaginati con il tuo marchio

---

## Cose da sistemare prima di andare online (riepilogo)

1. **Statement** quasi identico al nuovo H1 (sez. 2) — da riscrivere.
2. **Testimonianza** interamente segnaposto (sez. 6) — sostituire o togliere.
3. **Loghi cliente**: 8 nella hero + 6 sotto le dimostrazioni, tutti segnaposto.
4. **Fotografia hero** e **ritratto testimonianza**: segnaposto tratteggiati.
5. Refuso ricorrente "**ad** Velia" → "**a** Velia" (product shot e testimonianza).
6. Caption nascosta del product shot incoerente con la tabella (Generali/RC Professionale vs ramo auto).
7. Le card "Dimostrazioni" puntano ad ancore di `/clienti` — verificare che esistano davvero.
