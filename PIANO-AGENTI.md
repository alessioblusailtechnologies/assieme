# Agenti: il piano

Richiesta del committente del 14/09/2026, con le decisioni prese lo stesso giorno. Sostituisce l'editor degli agenti a sei passi e il motore degli agenti in sola lettura.

> Oltre al nome e alla frequenza, tutta la creazione dell'agente deve essere la stessa barra della chat, con documenti e clienti referenziabili. Al salvataggio viene creato un piano «visivo» di quello che l'AI ha interpretato. Deve poter inviare anche le email (anche la chat normale lo deve fare), creare file eccetera. L'esecuzione deve avere le stesse capacità della chat.

## Decisioni del committente (14/09/2026)

1. **Email a destinatari fissati.** In chat l'AI *prepara* l'email (destinatario, oggetto, testo, allegati) e sotto la risposta compare una scheda con «Invia»: parte solo col clic. Un agente spedisce **solo** ai destinatari scritti nella sua definizione e mostrati nel piano confermato (l'utente, i colleghi, l'email in anagrafica di un cliente), mai a un indirizzo deciso durante l'esecuzione.
2. **Il piano va confermato.** Dopo il salvataggio l'agente resta in attesa e mostra il piano; parte, anche pianificato, solo dopo «Conferma e attiva». Cambiare la richiesta, i riferimenti o la frequenza rimette il piano da confermare.
3. **Tutto nel testo.** Restano come campi solo il nome e la frequenza. Il formato dell'esito, i file, le email, che cosa leggere si scrivono nella richiesta. I parametri all'avvio spariscono; gli agenti esistenti e la libreria predefinita si convertono.

Proposta tecnica accettata insieme alle decisioni: **ogni esecuzione è una conversazione dell'agente**, lavorata dallo stesso motore della chat.

## Da dove si parte (ricognizione del 14/09/2026)

- **Editor** (`features/agenti/editor`): sei passi a campi separati (nome e descrizione, istruzioni in una textarea, fonti `documento | selezione | documenti-riferimento`, formato `testo | tabella | documento`, parametri, pianificazione). Non esistono fonti «prodotto» né «cliente».
- **Motore** (`worker/agenti/gestore.ts`): la chat in sola lettura. Niente `creaStrumentiMotore`, niente sandbox, niente link, niente strumenti sui clienti, niente eventi né passi; il blocco citazioni è obbligatorio e il «documento» è un PDF ricostruito dal testo a ogni download.
- **Composer della chat**: inietta `ChatStore` e ne usa 29 membri. Il modello è testo semplice più una lista di riferimenti: la posizione dei chip nel testo si perde (`testoEditor` li scarta). Da riusare serve una barra che non conosca lo store.
- **Email**: solo le rotte cliccate dall'utente (`POST /api/conversazioni/:id/messaggi/:mid/email` e `/:id/email`) su Resend, un destinatario, **niente allegati**, nessun registro. Nessuno strumento del motore. Il worker su Render non ha `RESEND_API_KEY` né `EMAIL_MITTENTE`.

## Il modello

### La definizione dell'agente

| Campo | Che cos'è |
|---|---|
| `nome` | Come prima. |
| `pianificazione` | Come prima (frequenza, orario, giorno). |
| `richiesta` | Il testo scritto nella barra, **con i riferimenti al loro posto**: `@[documento:<id>]`, `@[prodotto:<compagniaId>:<prodotto>]`, `@[cliente:<id>]`. Riaprendo l'agente i chip tornano dov'erano. |
| `piano` | Il piano interpretato dall'AI (vedi sotto), jsonb. |
| `piano_stato` | `in-lettura` (l'AI lo sta scrivendo) · `da-confermare` · `confermato`. |
| `piano_confermato_da` / `_il` | Chi l'ha confermato e quando. |

- Un **prodotto** si referenzia senza edizione: all'esecuzione vale quella in vigore in quel momento (gli insiemi vivi di RF-E-10). Il chip nella barra mostra l'edizione di oggi.
- `attivo` resta, ma un agente non confermato non si accoda mai: il tick pianificato e l'avvio manuale lo rifiutano.
- `descrizione`, `istruzioni`, `fonti`, `formato_output`, `parametri` escono dal contratto. Le colonne si svuotano con la conversione e poi si eliminano.

### Il piano

Lo scrive un modello (non agentico, una chiamata) al salvataggio, in JSON validato:

```ts
interface PianoAgente {
  obiettivo: string;                       // una frase
  passi: Array<{ tipo: 'leggi' | 'cerca' | 'confronta' | 'genera-file' | 'invia-email' | 'altro'; titolo: string; dettaglio?: string }>;
  letture: Array<{ tipo: 'documento' | 'prodotto' | 'cliente' | 'archivio'; etichetta: string; riferimento?: string }>;
  file: Array<{ formato: string; descrizione: string }>;
  email: Array<{ destinatario: { tipo: 'utente'; id: string } | { tipo: 'cliente'; id: string }; etichetta: string; indirizzo?: string; contenuto: string; allegati: string[] }>;
  dubbi: string[];                          // ciò che non ha capito, destinatari senza email
}
```

- I **destinatari** si risolvono in id veri: «a me» è chi salva, un collega per nome fra gli utenti del tenant, un cliente dai riferimenti. L'indirizzo si legge **al momento dell'invio** (un'email corretta in anagrafica vale da subito), ma il destinatario è fissato dal piano.
- Un destinatario senza email, o un nome che non corrisponde a nessuno, va nei `dubbi` e **blocca la conferma** con il motivo scritto.

### L'esecuzione è una conversazione

- `conversazioni.agente_id` (e `agenti_esecuzioni.conversazione_id`): ogni esecuzione apre una conversazione dell'agente, autore chi l'ha creato, con i riferimenti nel contesto e il cliente agganciato se la richiesta ne nomina uno solo.
- Il job `agente` scrive il messaggio dell'utente (la richiesta con i riferimenti resi leggibili, più i passi del piano confermato) e poi lavora **lo stesso turno della chat**: strumenti, sandbox, clienti, passi visibili, citazioni tollerate come in chat, consumi con origine `agente`.
- Le conversazioni degli agenti **non stanno nello storico della chat**: si aprono dalla pagina dell'agente, e si possono proseguire.

### L'email

- Strumento `prepara_email` in chat: scrive una **bozza** (`velia.email_bozze`, legata a conversazione e messaggio) ed emette un evento; sotto la risposta compare la scheda con Modifica e Invia. L'invio è una rotta chiamata dall'utente, con la sua identità (`reply_to` suo).
- Strumento `invia_email` negli agenti: accetta **solo** un destinatario del piano confermato, per chiave; un destinatario diverso torna al modello come rifiuto motivato. Spedisce subito.
- **Allegati**: i file generati nel turno (Storage `generati/`), in base64 verso Resend.
- **Registro**: `velia.email_inviate` (tenant, conversazione, esecuzione se c'è, destinatario, oggetto, allegati, esito, simulata, istante). Ogni email spedita, dalla chat o da un agente, lascia una riga.

## Le fasi

### Fase 1 · La barra condivisa

**Fatta il 14/09/2026.**

- Spostare in `shared/ui/barra-richiesta/` le parti del composer che non conoscono la chat: l'editor dei chip (`editor-testo.ts`), il riconoscimento della `@` (`menzione.ts`) e gli stili di campo e chip (un partial condiviso).
- Costruirci sopra la barra nuova (`ui-barra-richiesta`), che non conosce `ChatStore`: testo e chip, selettore `@` con prodotti e clienti, modello a `model()`, slot per i pulsanti propri di chi la usa.
- Serializzazione con i riferimenti al loro posto (`@[tipo:chiave]`) e ricostruzione dei chip in linea.
- **Il composer della chat resta com'è** e importa le stesse funzioni dal posto nuovo. Scelta del 14/09, rileggendolo: mescola barra, allegati, livelli, dettatura e invio, e il modello della chat (testo più lista di riferimenti) ha test e comportamenti che non conviene rimettere in gioco per gli agenti. Aspetto, chip e selettore sono gli stessi perché il codice e gli stili sono gli stessi.
- Test: serializzazione e ricostruzione, la chat invariata (suite esistente).

### Fase 2 · L'email in chat

**Fatta il 14/09/2026** (migrazione `20260914090000_email.sql` applicata online).

- Migrazione: `email_bozze` (destinatario risolto, oggetto, corpo, allegati, stato `bozza | inviata | annullata`) ed `email_inviate` (il registro, origine `risposta | conversazione | bozza | agente`); proprietario `velia_app`, policy restrittiva per l'ospite.
- `email/invio.ts` con gli allegati (base64, tetto 25 MB) ed `EMAIL_INVIO=simulato`, che i test accendono perché il `.env` locale ha la chiave; `generazione/email.ts` compone l'email scritta per chi la riceve (firma di chi manda, niente titolo di conversazione); `email/destinatari.ts` risolve «me», un indirizzo, un collega o un cliente dell'anagrafica, e quando non trova non indovina.
- Strumento `prepara_email` nel motore (allegati per nome fra i documenti generati nella conversazione), sezione di prompt, evento `email`; le bozze se ne vanno se la risposta non si salva.
- Rotte: `PATCH /api/conversazioni/:id/email/:eid`, `POST …/invio` (in transazione con la bozza bloccata: due clic spediscono una volta), `POST …/annulla`. Ogni invio, anche «Invia email» sotto una risposta o sul filo, lascia una riga nel registro.
- FE: scheda «Email pronta» sotto la risposta (`email-pronta.ts`), cassetto per modificarla, stato dopo l'invio; Invia resta fermo finché la risposta scorre.
- Le variabili email sul worker **non servono ancora**: in chat spedisce l'API. Serviranno a `invia_email` degli agenti (Fase 4).

### Fase 3 · La definizione dell'agente

**Fatta il 14/09/2026** (migrazione `20260914130000_agenti_richiesta.sql` applicata online; `20260914140000_agenti_via_i_campi.sql` da applicare a rilascio fatto).

- Migrazione in due tempi: la prima aggiunge `richiesta`, `piano`, `piano_stato` (`non-letto | da-confermare | confermato`), `piano_errore`, la conferma, converte gli agenti esistenti (istruzioni, documenti come riferimenti, porzioni, formato e parametri come frasi) e lascia i campi vecchi senza vincoli, perché il codice in esercizio li legge ancora; la seconda li toglie. Il tick accoda solo i piani confermati e prende coda e tenant come parametri facoltativi, per i test.
- Lettore del piano (`api/agenti/interprete.ts`, `MODELLO_PIANO`, default Sonnet): uno strumento a schema fisso, i destinatari ancora a parole; `piano.ts` li risolve con `email/destinatari.ts` e un destinatario non risolto blocca la conferma col motivo. I riferimenti si idratano a ogni lettura (`src/agenti/riferimenti.ts`, condiviso con il worker).
- Rotte: creare e cambiare la richiesta la fanno leggere (fuori transazione, si scrive solo se la richiesta non è cambiata nel frattempo; una lettura fallita lascia il piano di prima con l'errore); cambiare quando corre rimette da confermare, sospendere no; `POST /:id/piano` rilegge, `POST /:id/conferma` conferma e attiva; senza conferma niente esecuzione (409 `PIANO_DA_CONFERMARE`). Via parametri all'avvio e documento dell'esecuzione.
- L'esecuzione di prima resta in piedi fino alla Fase 4: legge la richiesta coi riferimenti risolti e i passi del piano, e dichiara che file ed email non li produce ancora.
- Libreria predefinita riscritta come richieste, con le parti da completare fra parentesi quadre.
- FE: editor con nome, barra (`ui-barra-richiesta`) e quando; pagina dell'agente con la scheda del piano (`piano-agente.ts`), la richiesta coi chip e lo storico; elenco con «piano da confermare».
- Collaudo col lettore vero: prodotto referenziato con «@», piano con passi, file ed email «a me» risolta, conferma, chip ritrovato in modifica. Per «una tabella» il lettore ha scelto da sé un PDF: da tenere d'occhio.

### Fase 4 · L'esecuzione come conversazione

- Migrazione: `conversazioni.agente_id`, `agenti_esecuzioni.conversazione_id`; il tick accoda solo i confermati.
- Il job `agente` apre la conversazione e lavora il turno della chat; `invia_email` limitato ai destinatari del piano; lo stato dell'esecuzione segue il turno.
- Lo storico delle chat esclude le conversazioni degli agenti.
- FE: pagina dell'esecuzione con passi, esito, file ed email inviate; «Continua in chat».

### Fase 5 · Collaudo e rifiniture

- Collaudo col motore vero di un agente che legge, genera un PDF e lo manda all'utente.
- Aggiornare i documenti di piano e la memoria.

## Quello che resta aperto

- Le variabili email (`RESEND_API_KEY`, `EMAIL_MITTENTE`) sul worker servono dalla Fase 4 e vanno messe anche su Render: `render.yaml` ha modifiche locali del committente non ancora committate.
- La produzione (progetto Supabase nuovo) riceverà queste migrazioni al primo avvio.
- `20260914140000_agenti_via_i_campi.sql` va applicata quando il codice della Fase 3 è in esercizio su Render.
- I mock del front-end (`mocks/agenti.mjs`, `mocks/data/agenti*.json`) hanno ancora la forma di prima: gli agenti in sviluppo passano dal backend vero.
