# Velia — Testi homepage v2 (angolo dominante: la memoria)

Filo conduttore: **Velia impara e non dimentica.** Ogni sezione ora o promette la memoria, o la dimostra, o la protegge. Le keyword SEO (software AI agenzie assicurative, broker, confronto polizze, set informativi) scendono da H1 a lead + statement — copertura invariata.
Mappato su `src/data/home.ts` per il copia-incolla.

---

## SEO (`index.astro`)

**Title (58 caratteri):**
> Velia — AI per agenzie assicurative, broker e intermediari

**Meta description (151 caratteri):**
> L'AI per agenzie e broker che impara le tue regole e non le dimentica. Confronta polizze e preventivi con la fonte citata, sempre. Richiedi una demo.

---

## 1. Hero

**H1:**
> L'AI che impara come lavora
> la tua agenzia. E non lo dimentica.

**Lead (ora porta lui la keyword primaria):**
> Velia è l'intelligenza artificiale per la distribuzione assicurativa: legge i set informativi, confronta le garanzie con la fonte citata — e ricorda le tue regole, da una conversazione all'altra.

**CTA:** Richiedi una demo · Guarda Velia al lavoro

---

## 2. Statement

**Frase forte:**
> Le AI generiche ripartono da zero a ogni conversazione. Velia no.

**Frase attenuata:**
> Lavora sui documenti che hai già in archivio, ragiona con i criteri della tua agenzia e lascia sempre a te l'ultima parola.

*Perché:* la frase forte pianta il contrasto che nessun tool a confronto documentale secco può copiare — e la parola "no" da sola, dopo il punto, è il momento più memorabile della pagina.

---

## 3. Product shot

- **Refuso:** "Chiedi ad Velia" → **"Chiedi a Velia…"** (`ProductShot.astro:67`)
- **Caption nascosta riallineata:** *"Confronto ramo auto: polizza Active Veicoli AUTOPIÙ e preventivo Unipol garanzia per garanzia, con fonte citata per ogni valore."* (`ProductShot.astro:36-39`)
- **Sintesi (qui la memoria si vede in azione):**
> 9 differenze rilevanti su 54 garanzie. Gli infortuni del conducente non risultano carenza: gliel'hai spiegato una volta — la tua agenzia li copre a parte.

*Questa riga è l'H1 che si avvera: il visitatore ha appena letto "non lo dimentica" e due scroll dopo lo vede succedere su un caso vero.*

---

## 4. Memoria viva (ora è il cuore della pagina)

**Occhiello:** Memoria viva
**Titolo (richiama l'H1 e lo mantiene):**
> Ecco cosa significa non dimenticare

**Corpo:**
> Le cartelle condivise conservano e basta: non collegano, non ricordano, non rispondono. In Velia ogni documento letto entra in qualcosa che cresce — le regole che le detti, le scelte che ti vede fare, i casi che avete già risolto insieme. Il lunedì sa quello che le hai spiegato il venerdì.

**Le tre righe:**
- **Le tue regole** — Scrivi in italiano come valuta la tua agenzia. Vale da subito, per tutti i colleghi.
- **Quello che impara** — Prassi, eccezioni e preferenze: spiegate una volta, mai più ripetute.
- **Sempre tuo** — Consulti, correggi, cancelli. Quello che Velia impara resta dell'agenzia.

**CTA:** Come funziona la memoria viva → `/piattaforma#memoria`

*Se vuoi tenere "Un archivio che risponde invece di aspettare" (che resta ottimo), spostalo a occhiello lungo o riusalo su `/piattaforma`.*

---

## 5. Ticker casi d'uso

**Intro:**
> Ogni giorno, le agenzie usano Velia per

Voci invariate tranne: "Proposte per il cliente" → **"Proposte pronte per il cliente"**.

---

## 6. Testimonianza → "Dal campo"

Già perfettamente in tema — è la storia della memoria:

> Un'agenzia pilota ci ha spiegato una volta sola, in italiano, che gli infortuni del conducente li copre sempre con una polizza a parte. Da allora Velia non li segnala più come carenza: ragiona come ragionano loro.

**CTA:** Guarda la dimostrazione → `/clienti`

---

## 7. Dimostrazioni

**Titolo:**
> Tre dimostrazioni. Documenti veri, nessun trucco.

**Card:**
1. Un preventivo concorrente smontato in dieci minuti
2. Dieci prodotti, una tabella, ogni casella con la sua fonte
3. Le nuove edizioni ti trovano loro — non il contrario

---

## 8. Numeri

**Intro:**
> Meno tempo sui documenti,
> più tempo con i clienti

| Etichetta | Valore |
|---|---|
| Documenti da caricare per iniziare | **Zero** |
| Volte che devi ripetere una regola | **Una** |
| Risposte con la fonte citata | **100%** |
| Documenti in un solo confronto — gli altri si fermano a 5 | **Decine** |
| Compagnie già in archivio | **In crescita** |

*Novità: "Volte che devi ripetere una regola: Una" — è la statistica-manifesto dell'angolo memoria, e Zero/Una/100% in fila fanno un ritmo perfetto. Per far posto ho tolto "Formati per il cliente: 4" (il meno differenziante dei cinque); se vuoi tenerlo, portali a sei.*

---

## 9. Sicurezza

**Titolo:**
> Accuratezza e riservatezza,
> prima di ogni altra cosa

**Corpo (chiude il cerchio: la memoria è potente perché è tua):**
> Velia cita sempre da dove arriva una risposta — e quando non lo sa, lo dice. I tuoi documenti restano tuoi e quello che impara resta dell'agenzia: non esce, non finisce ad altri clienti, non addestra nessun modello.

Badge invariati (il badge "Memoria — Che controlli tu" ora ha molto più peso: valuta di metterlo per primo).

---

## 10. CTA finale

**Titolo:**
> Spiegale come lavori.
> Una volta sola.

**CTA:** Richiedi una demo

*Alternativa più classica: "Un'AI che domani ricorda quello che le spieghi oggi".*

---

## Barra annunci (per quando la riaccendi)

1. **Novità** — Tabelle di analisi: decine di prodotti a confronto, la fonte in ogni casella
2. **Novità** — I tuoi archivi ora parlano anche con gli strumenti AI che già usi
3. **Novità** — Documenti per il cliente già impaginati, col tuo marchio

---

## Note SEO sulla scelta

- L'H1 senza keyword esatta non è un problema: "intelligenza artificiale per la distribuzione assicurativa" apre il lead (above the fold), il title e la meta description coprono le query commerciali, lo statement aggiunge il contrasto semantico. Google pesa l'insieme.
- Aggiornare i dati strutturati `SoftwareApplication` con la nuova description e aggiungere la memoria persistente all'elenco funzionalità.
- Il filo narrativo ora è un arco: promessa (hero) → prova (product shot, sintesi infortuni) → spiegazione (memoria viva) → conferma dal campo (sez. 6) → garanzia (sicurezza) → chiusura ("una volta sola"). Ogni sezione paga quella prima.