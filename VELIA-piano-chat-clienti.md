# VELIA — Piano: chat per i clienti dell'agenzia

| Campo | Valore |
|---|---|
| Documento | Piano della funzionalità «chat cliente» |
| Versione | 0.1 (bozza da rivedere) |
| Data | 07/09/2026 |
| Riferimenti | `VELIA-analisi-requisiti.md` v0.10 · `VELIA-piano-sviluppo-be.md` · `VELIA-motore-agentico.md` |
| Decisioni già prese | ruolo `ospite` con utenza vera · cono composto **solo a mano** · il ragionamento si mostra anche al cliente |

---

## 1. Che cosa si costruisce

L'agenzia crea una chat destinata a un suo cliente. Ne definisce il **cono di
lettura** — quali cartelle dell'Archivio Privato e quali documenti pubblici
l'assistente può leggere — e le **istruzioni** con cui deve rispondere. Ne
esce un **link**: il cliente lo apre e fa domande sulla propria polizza,
sulle coperture, sull'agenzia.

**Criterio di uscita.** Un cliente con il link di una chat non può, in nessun
modo — domanda diretta, domanda obliqua, ricarica, manomissione del token —
vedere un documento fuori dal proprio cono. Questa è la funzionalità: tutto
il resto è contorno.

---

## 2. La decisione che questa funzionalità richiede

Va scritta qui prima del codice, perché non è una scelta tecnica.

L'analisi requisiti, sul Modulo H, dichiara **non negoziabile** che «nessun
contenuto generato dall'AI viene inviato in autonomia: ogni invio verso il
cliente finale richiede l'approvazione esplicita di un utente».

Una chat per il cliente è per costruzione il contrario: risposte generate
che arrivano al cliente senza nessuno in mezzo. Chi risponde di una risposta
sbagliata resta l'intermediario, e il settore è vigilato.

Non è un motivo per non farla. È un motivo per:

1. **modificare esplicitamente quel principio in `VELIA-analisi-requisiti.md`**
   invece di aggirarlo in silenzio: il documento deve dire che esiste un
   canale diretto e a quali condizioni;
2. costruire la prudenza **dentro il prompt** (§6), non nella speranza;
3. dare all'agenzia il **registro** di ciò che è stato chiesto e risposto
   (§8): se il canale è diretto, almeno non è opaco.

Finché il punto 1 non è fatto, questa funzionalità è in contrasto dichiarato
col documento dei requisiti.

---

## 3. Modello dati

```sql
velia.chat_clienti
  id            uuid pk
  tenant_id     uuid not null           -- l'agenzia proprietaria
  cliente_id    uuid null               -- l'anagrafica, quando c'è
  ospite_id     uuid not null           -- l'utenza ospite (velia.utenti)
  titolo        text not null           -- «Mario Rossi — polizza auto»
  istruzioni    text                    -- le istruzioni di questa chat
  token_hash    text not null           -- del segreto nel link; mai in chiaro
  stato         text                    -- attiva | sospesa | scaduta
  scade_il      timestamptz null
  tetto_domande int null                -- null = nessun tetto
  domande_fatte int not null default 0
  creata_da     uuid not null
  created_at, updated_at

velia.chat_clienti_cartelle   (chat_id, cartella_id)   -- cono privato
velia.chat_clienti_documenti  (chat_id, documento_id)  -- cono pubblico
```

Il cono si compone **solo a mano** (decisione del 07/09): nessuna
precompilazione da `cartelle.cliente_id`. Ogni chat si costruisce da zero,
cartella per cartella. È la scelta che sbaglia di meno, e il costo — lavoro
ripetitivo su molti clienti — va tenuto d'occhio: se diventa un problema, la
scorciatoia si aggiunge dopo senza cambiare il modello.

**Le conversazioni restano quelle.** `velia.conversazioni` prende una colonna
`chat_cliente_id uuid null`, e `autore_id` diventa annullabile. Così job,
messaggi, eventi, SSE, ripresa di sessione e il pannello del ragionamento
funzionano identici: non esiste una seconda catena da mantenere.

**I consumi**: `velia.consumi.origine` guadagna il valore `chat-cliente`
accanto a `app` e `agente` (si scrive in `worker/memoria/gestore.ts:105` e
nel gestore dell'interrogazione). Serve a rispondere alla domanda «quanto mi
costano i clienti» separatamente da «quanto mi costa l'agenzia».

---

## 4. L'identità: il ruolo ospite

L'ospite è **un'utenza vera**: una riga in `auth.users` (il vincolo di chiave
esterna su `velia.utenti.id` la impone) e una in `velia.utenti` con
`ruolo = 'ospite'`, `tenant_id` dell'agenzia, `stato` come gli altri.

Modifiche puntuali:

| Dove | Oggi | Domani |
|---|---|---|
| `velia.utenti` vincolo `utenti_ruolo_check` | `operatore \| amministratore` | `+ ospite` |
| `api/plugins/auth.ts:90` | rifiuta ogni ruolo diverso dai due | accetta anche `ospite` |
| `db/identita.ts` `Identita.ruolo` | unione di due | unione di tre |
| `richiediAmministratore` | invariato | invariato: l'ospite non è amministratore, quindi è già escluso da tutto ciò che protegge |

**La sessione.** Rotta nuova `POST /api/sessione/ospite { token }`, pubblica
come `/api/sessione/accesso`: verifica il token contro `token_hash`,
controlla stato, scadenza e tetto, e restituisce una sessione **breve** per
l'utenza ospite. Da lì in poi non cambia nulla: `auth.ts` verifica, la RLS
filtra, `conIdentita` mette i claim.

Il token nel link è l'unica credenziale. Il link è **nominale** — è legato a
un'utenza, non è un ingresso anonimo — e questo va detto al cliente quando
glielo si manda. Restano indispensabili scadenza, revoca e tetto (§8),
perché un link inoltrato resta valido: è l'equivalente di una chiave di casa
prestata.

### 4.1 Nessun token da emettere

La domanda sembrava essere «JWT firmato da noi o sessione Supabase vera».
Non è nessuna delle due, per due fatti che si incastrano:

1. il front-end **non parla mai con Supabase**: nessun riferimento nel
   codice, tutto passa dalla nostra API;
2. `conIdentita` (`db/identita.ts`) **costruisce da sé i claim** che la RLS
   legge — `set_config('request.jwt.claims', …)` a partire da un oggetto
   `Identita` — e non verifica nessun JWT.

Quindi l'ospite si autentica **col solo token opaco del link**: `auth.ts`
guadagna un ramo che, quando il token non è un `Bearer` di Supabase, lo
risolve contro `chat_clienti` e costruisce l'`Identita`. Non emettiamo mai
niente che funzioni fuori dalla nostra API: nessun token da revocare
altrove, nessuna sessione da invalidare, nessun segreto condiviso in giro.

La revoca diventa una riga: `stato = 'sospesa'`, e la richiesta successiva
non trova più un'identità da costruire. Effetto immediato, non a scadenza.

---

## 5. Il cono, applicato due volte

L'isolamento fra agenzie, nel piano BE, è «applicato due volte: dalle policy
sul database e fisicamente dalla working directory del job». Il cono deve
avere la stessa doppiezza, e per una ragione precisa: **il worker non passa
dalla RLS** — usa la connessione di sistema su job già autorizzati.

### 5.1 Il presidio fisico

`worker/motore/workspace.ts:141` è l'unica query che decide che cosa entra
nella directory che il motore può leggere. Oggi la riga 154 dice «tutto il
privato del tenant». Per una conversazione con `chat_cliente_id` diventa:

- **privato**: solo i documenti la cui `cartella_id` sta nel sottoalbero di
  una cartella del cono;
- **pubblico**: solo i documenti in `chat_clienti_documenti` — non più tutto
  l'Archivio Pubblico;
- **allegati di conversazione**: quelli di questa conversazione, invariato.

Ciò che è fuori dal cono **non viene scritto su disco**. Il motore ha Read,
Grep e Glob confinati alla directory (`sessione.ts`, controllo `dentro()`):
quello che non c'è non si trova, non per una regola ma per assenza.

Vanno rifatti di conseguenza gli `INDICE.md` e la convenzione dell'archivio,
che oggi descrivono l'albero intero: dentro una chat cliente devono
descrivere solo il cono, o diventano essi stessi la fuga di notizie.

### 5.2 Il presidio logico

Policy RLS nuove, agganciate a `velia.ruolo_corrente()` — che **esiste già** a
database. Forma:

```sql
create policy documenti_lettura_ospite on velia.documenti for select using (
  velia.ruolo_corrente() = 'ospite'
  and tenant_id = velia.tenant_corrente()
  and id in (select documento_id from velia.documenti_nel_cono(auth.uid()))
);
```

`velia.documenti_nel_cono(ospite)` è una funzione `security definer` che
risolve, per le chat attive di quell'ospite, i documenti pubblici scelti più
tutti i documenti nel **sottoalbero** delle cartelle del cono.

**Qui sta il lavoro vero.** La ricorsione dell'albero oggi vive in
TypeScript (`api/cartelle/rotte.ts:507`), non in SQL: va scritta come CTE
ricorsiva. È la riga che separa «il cliente Rossi» da «la polizza di
Bianchi», e va provata con test che tentano di attraversarla, non solo con
test che la usano bene.

Le stesse policy servono, in versione ristretta, su `cartelle`,
`conversazioni`, `messaggi`.

---

## 6. Il prompt del cliente è un prompt diverso

Non è quello dell'agenzia con una riga in più. `REGOLE_MOTORE`
(`worker/motore/regole.ts:18`) dice testualmente: «Rispondi in italiano, **per
un professionista del settore** che userà la tua risposta nel lavoro con i
clienti: precisione prima di tutto». Serve un `REGOLE_MOTORE_CLIENTE` con:

- **registro diverso**: si parla a chi la polizza la subisce, non a chi la
  vende. Niente gergo non spiegato, niente sigle senza scioglierle;
- **prudenza esplicita**: mai una cifra, un massimale o un «sei coperto»
  senza la citazione del documento da cui viene;
- **il confine dichiarato**: quello che l'assistente non trova nei documenti
  del cono non lo sa, e lo dice. Non stima, non deduce, non rassicura;
- **la via d'uscita, sempre disponibile**: «questo lo verifica l'agenzia»
  con il rimando al contatto. Un cliente che resta con un dubbio deve
  finire da un umano, non da una risposta approssimata;
- **niente consulenza**: non suggerisce di cambiare, integrare o disdire.

Sopra a questo si aggiungono le istruzioni della chat scritte dall'agenzia.

Le istruzioni generali dell'agenzia (`caricaDna`, `regole.ts:103`) **non
entrano**: sono scritte per il lavoro interno e possono contenere criteri
commerciali che al cliente non vanno detti. Se l'agenzia vuole una regola
anche qui, la scrive nelle istruzioni della chat.

Stessa ragione per la memoria: la chat cliente **non legge i ricordi** del
tenant e **non ne scrive**. Quello che un cliente racconta non deve entrare
nel DNA d'agenzia passando da una porta che nessuno sorveglia.

---

## 7. Che cosa il cliente non ha

Il motore, dentro una chat cliente, perde gli strumenti che non gli servono
e che non deve avere:

| Tolto | Perché |
|---|---|
| `esporta_subito`, `esportazione_elaborata` | produrre documenti a nome dell'agenzia è cosa dell'agenzia |
| `proponi_riordino` | l'archivio non è suo |
| Invio email | idem |
| Scrittura in memoria | §6 |
| Referenziazione `@` di documenti | il contesto è il cono, non una scelta del cliente |
| Allegati | un caricamento anonimo nell'Archivio Privato è un vettore, non una funzionalità |

Il pannello del ragionamento invece **si mostra** (decisione del 07/09), e c'è
una ragione per cui è sicuro: le etichette nominano i documenti per titolo,
ma il motore può toccare solo ciò che è nel cono. Non può nominare il
documento di un altro cliente perché non sa che esiste. Il cono non protegge
solo le risposte: rende mostrabile anche il lavoro.

---

## 8. Tetti, scadenza, revoca, registro

Ogni domanda costa fra 0,43 e 0,99 USD (misura del 06/08/2026). Un link
condivisibile senza limiti è un portafoglio aperto: basta che finisca in una
chat di famiglia.

- **tetto di domande per chat** (`tetto_domande`), superato il quale la chat
  risponde che l'agenzia è stata avvisata — non un errore tecnico;
- **scadenza** (`scade_il`), con default sensato alla creazione;
- **revoca immediata** (`stato = 'sospesa'`): il link muore, l'utenza resta;
- **tetto per tenant**, riusando il 429 `QUOTA_SUPERATA` che già esiste
  (`contratto/errori.ts:68`);
- **registro**: l'agenzia vede le conversazioni delle proprie chat cliente.
  Non è sorveglianza, è la contropartita di aver aperto un canale diretto.

---

## 9. Le fasi

L'ordine non è per visibilità ma per rischio: prima ciò che, se sbagliato,
non si scopre guardando lo schermo.

### Fase 1 — Il ruolo e il cono (backend, nessuna interfaccia)

Ruolo `ospite`; tabelle di §3; funzione `documenti_nel_cono` e policy RLS;
filtro in `materializzaWorkspace`; `INDICE.md` e convenzione ristretti al
cono; rotta `POST /api/sessione/ospite`; prompt di §6; strumenti tolti di §7.

**Criterio di uscita:** una batteria di test d'integrazione in cui un ospite
di un cono tenta di raggiungere documenti di un altro cono, di un altro
cliente e di un altro tenant — per rotta API, per domanda in chat e per
contenuto della workspace — e non ci riesce mai. **Finché questi test non
sono verdi non si costruisce nient'altro.**

### Fase 2 — La schermata dell'agenzia

Creare la chat, comporre il cono a mano (albero delle cartelle con
selezione, ricerca fra i documenti pubblici), scrivere le istruzioni,
generare il link, revocarlo, vedere il consumo.

**Criterio di uscita:** un'agenzia crea una chat completa senza toccare il
database, e vede il link una volta sola (dopo si rigenera, non si rilegge).

### Fase 3 — La chat del cliente

Pagina fuori dalla shell, come `/accesso`: «è una porta, non una stanza».
Composer ridotto, niente barra laterale, niente archivi, niente esportazioni.
Il ragionamento c'è. In fondo, il contatto dell'agenzia sempre visibile.

**Criterio di uscita:** provata su telefono (390 px) prima che su scrivania —
un cliente la apre dal messaggio che ha ricevuto.

### Fase 4 — Tetti, scadenza e registro

Il §8 per intero, più la vista dell'agenzia su che cosa è stato chiesto.

**Criterio di uscita:** superato il tetto la chat lo dice bene, e l'agenzia
se ne accorge senza guardare i log.

---

## 10. Quello che resta aperto

1. **Il principio del Modulo H** (§2): va modificato nei requisiti, e la
   modifica è una decisione del committente, non dello sviluppo.
2. ~~La forma della sessione ospite~~ — **risolto** in §4.1: nessun token
   emesso, l'ospite si autentica col token opaco del link.
3. **Il dominio del link.** Oggi l'app vive su `app-dev.sonovelia.it` e la
   produzione non esiste ancora (né `app.` né `api.` risolvono). Un link che
   va a un cliente finale è la prima cosa davvero pubblica del prodotto:
   merita un indirizzo scelto, non quello che capita.
4. **Che cosa succede quando il cliente chiede qualcosa che non è nel cono.**
   Silenzio prudente, oppure un modo per chiedere all'agenzia di allargarlo?
   La seconda è più utile e più delicata.
5. **Le lingue.** Il sito sta diventando bilingue con la Francia come primo
   mercato. Una chat cliente in francese non è una traduzione di etichette:
   è un altro prompt e un altro registro.
