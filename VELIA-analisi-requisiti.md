# VELIA — Analisi dei Requisiti

| Campo | Valore |
|---|---|
| Prodotto | VELIA |
| Versione documento | 0.9 (bozza) |
| Data | 04/08/2026 |
| Stato | In lavorazione |
| Autore | Blusail Technologies S.R.L.S. |

---

## 1. Introduzione

### 1.1 Scopo del documento

Questo documento raccoglie e formalizza i requisiti funzionali e non funzionali di VELIA, piattaforma AI per il settore assicurativo. La presente versione copre il nucleo iniziale del prodotto: l'**archivio documentale pubblico precaricato**, l'**archivio privato per utente/agenzia**, la **referenziazione dei documenti all'interno della chat conversazionale**, le **tabelle di analisi** multi-documento e la **condivisione** di conversazioni e tabelle all'interno del tenant, il **sistema di impostazioni** — scelta del modello/provider AI e personalizzazione della metodologia di ragionamento tramite istruzioni, che comprendono sia regole scritte sia documenti di riferimento — e la sezione **Agenti**, per la creazione di task AI eseguibili manualmente o su pianificazione, oltre alla generazione di **output client-ready** su template grafici precaricati, all'esposizione delle capacità della piattaforma tramite **server MCP**, utilizzabile dai client AI compatibili del tenant, e alla **memoria persistente** dell'assistente, che accumula il contesto del tenant nel tempo. Funzionalità successive (es. automazioni verticali su rinnovi e retention, integrazioni con sistemi esterni) saranno oggetto di versioni future del documento.

### 1.2 Ambito del prodotto

VELIA è un assistente AI interrogabile in linguaggio naturale, pensato per **agenzie assicurative, broker e intermediari**. Il valore centrale è permettere all'operatore di porre domande, ottenere risposte puntuali ed effettuare confronti su set informativi, condizioni di polizza e preventivi, senza dover leggere manualmente documenti lunghi decine o centinaia di pagine.

Il differenziale rispetto ai competitor esistenti (es. Navisio.ai, limitato alla comparazione documentale su massimo 5 documenti, senza archivio precaricato né integrazioni) è la combinazione di:

1. una knowledge base pubblica già pronta all'uso al primo accesso;
2. uno spazio privato per i documenti dell'agenzia;
3. un'interfaccia conversazionale in cui i documenti di entrambi gli archivi sono cittadini di prima classe, richiamabili esplicitamente e confrontabili su larga scala tramite tabelle di analisi;
4. la possibilità di personalizzare il modo in cui l'AI ragiona, adattandolo alla prassi operativa della singola agenzia — l'esatto limite riscontrato in Navisio, che valuta i documenti secondo criteri fissi non modificabili dall'utente;
5. output pronti per la consegna al cliente finale, generati su template graficamente coerenti e brandizzabili dall'agenzia;
6. il DNA d'Agenzia: istruzioni personalizzate — regole scritte e documenti di riferimento — e memoria persistente formano uno strato di personalizzazione che si accumula conversazione dopo conversazione, rendendo il sistema sempre più preciso — mentre i tool concorrenti ripartono da zero a ogni sessione.

### 1.3 Definizioni e glossario

| Termine | Definizione |
|---|---|
| Set informativo | Insieme dei documenti precontrattuali che le compagnie sono obbligate a pubblicare per ciascun prodotto assicurativo (ai sensi del Regolamento IVASS 41/2018): DIP, DIP Aggiuntivo, Condizioni di Assicurazione, glossario. |
| DIP / DIP Aggiuntivo | Documento Informativo Precontrattuale (base e aggiuntivo) di un prodotto assicurativo. |
| Archivio Pubblico | Repository documentale precaricato e gestito centralmente da VELIA, contenente i set informativi e i documenti pubblici delle compagnie. |
| Archivio Privato | Repository documentale riservato a una singola agenzia/utenza, popolato tramite upload dagli utenti. |
| Referenziazione | Azione con cui l'utente richiama esplicitamente uno o più documenti (pubblici o privati) all'interno di un messaggio in chat, rendendoli parte del contesto della risposta. |
| Tenant | Unità organizzativa cliente (agenzia, broker, intermediario) a cui appartengono utenti e Archivio Privato. |
| Istruzioni personalizzate | Insieme di regole e indicazioni in linguaggio naturale, definite dal tenant, che condizionano la metodologia di analisi e ragionamento dell'AI (criteri di valutazione delle garanzie, prassi dell'agenzia, convenzioni interne). |
| Provider AI | Fornitore terzo dei modelli linguistici utilizzati dal sistema (es. Anthropic, OpenAI, Google). |
| Agente | Task AI definito dall'utente (istruzioni, fonti documentali, output atteso), eseguibile su richiesta manuale o secondo una pianificazione ricorrente. |
| Esecuzione (run) | Singola istanza di lavoro di un agente, con stato, esito, output e log associati. |
| Template di output | Modello grafico precaricato (PDF, DOCX, XLSX, PPTX) con struttura, stili e segnaposto, usato per generare documenti a partire dai contenuti prodotti da chat e agenti. |
| Output client-ready | Documento generato su template, graficamente coerente e pronto per la consegna al cliente finale dell'agenzia. |
| Tabella di analisi | Tabella strutturata generata dall'AI su un insieme di documenti selezionati (righe) e criteri di estrazione (colonne), con citazione per ogni cella; interrogabile, salvabile ed esportabile. |
| Documenti di riferimento | Documenti interni del tenant (convenzioni, note tecniche, casistica, testi tipo) che il tenant designa come contesto permanente: l'AI li consulta automaticamente, senza referenziazione esplicita. Risiedono nelle Istruzioni (Modulo D) insieme alle regole scritte, e come queste hanno un ambito di validità. *In versione 0.8 erano un'area dell'Archivio Privato chiamata "knowledge base di agenzia" (ex RF-B-09).* |
| MCP (Model Context Protocol) | Protocollo standard che permette a client AI esterni (es. Claude, ChatGPT) di utilizzare strumenti e dati esposti da un server terzo. |
| Server MCP di VELIA | Componente della piattaforma che espone le capacità di VELIA (ricerca e interrogazione degli archivi) come tool MCP richiamabili dai client AI del tenant. |
| Memoria persistente | Insieme di informazioni durevoli che l'assistente apprende dalle interazioni (prassi, contesto su clienti e pratiche, preferenze) e riutilizza automaticamente nelle conversazioni ed esecuzioni successive del tenant. |
| DNA d'Agenzia | Nome collettivo dello strato di personalizzazione del tenant: le istruzioni personalizzate del Modulo D — regole scritte (RF-D-04) e documenti di riferimento (RF-D-14) — e la memoria persistente del Modulo G. È ciò che rende le risposte di VELIA uniche per ciascuna agenzia. |

### 1.4 Attori

| Attore | Descrizione |
|---|---|
| Operatore di agenzia | Utente finale principale: agente, subagente, impiegato di agenzia, broker o collaboratore. Consulta gli archivi e interagisce con la chat. |
| Amministratore di tenant | Utente dell'agenzia con permessi di gestione: utenti del tenant, organizzazione dell'Archivio Privato. |
| Gestore piattaforma (VELIA) | Team interno che cura popolamento, aggiornamento e qualità dell'Archivio Pubblico. |

---

## 2. Descrizione generale del sistema

Il sistema si articola in tre moduli fortemente integrati:

**Modulo A — Archivio Pubblico.** Libreria documentale precaricata, uguale per tutti i tenant, contenente i set informativi e i documenti pubblici delle polizze delle principali compagnie operanti sul mercato italiano. L'utente la trova già popolata al primo accesso: è il "catalogo" su cui interrogare il sistema fin da subito, senza alcun onere di caricamento.

**Modulo B — Archivio Privato.** Spazio documentale isolato per tenant, in cui gli utenti caricano documenti propri: preventivi, polizze emesse, appendici, corrispondenza tecnica e qualunque altro documento utile al lavoro quotidiano. Un documento dell'Archivio Privato può essere promosso a documento di riferimento (Modulo D), diventando così contesto permanente per tutte le conversazioni del tenant.

**Modulo C — Chat conversazionale con referenziazione documentale.** Interfaccia di dialogo in linguaggio naturale. I documenti di entrambi gli archivi possono essere richiamati esplicitamente nei messaggi; le risposte del sistema si fondano sul contenuto dei documenti referenziati (ed eventualmente su quelli recuperati automaticamente), con citazioni verificabili. Il modulo comprende anche le tabelle di analisi — confronti strutturati multi-documento con citazione per ogni cella, interrogabili a loro volta in chat — e la condivisione di conversazioni e tabelle con gli altri utenti del tenant.

**Modulo D — Impostazioni e personalizzazione.** Sezione di configurazione in cui il tenant sceglie il modello e il provider AI utilizzati dal sistema e definisce le **istruzioni** che governano la metodologia di ragionamento dell'AI.

Le istruzioni sono di due nature, distinte ma governate allo stesso modo — deliberate, curate dall'amministratore, sempre attive salvo sospensione:

- **Regole scritte** in linguaggio naturale, che condizionano il *giudizio*. Il caso emblematico è la garanzia infortuni del conducente, che un'analisi a criteri fissi segnalerebbe come mancanza grave, mentre un'agenzia può ometterla deliberatamente perché abbina sempre una polizza infortuni personale.
- **Documenti di riferimento** — convenzioni attive, note tecniche, casistica risolta, testi tipo — che forniscono *fonti*: a differenza delle regole possono essere citati, e la citazione è ciò su cui poggia la verificabilità del sistema (RF-C-04).

Entrambi hanno un ambito di validità (generale, per ramo, per compagnia): un documento di riferimento entra nel contesto solo quando è pertinente, e non a ogni interrogazione. È il presidio contro il costo del contesto permanente (punto aperto §6.12, RNF-05).

Nelle Impostazioni risiede anche la libreria dei template di output: modelli grafici precaricati nei formati PDF, DOCX, XLSX e PPTX che danno coerenza visiva ai documenti generati dalla chat e dagli agenti, personalizzabili con l'identità dell'agenzia.

**Modulo E — Agenti.** Sezione in cui l'utente crea e gestisce agenti: task AI definiti una volta — istruzioni, fonti documentali, output atteso — ed eseguibili sia manualmente su richiesta, sia in modo ricorrente tramite pianificazione. Gli agenti estendono VELIA da strumento interrogativo a strumento operativo: attività ripetitive dell'agenzia (es. verifica periodica di nuove edizioni dei set informativi, riepiloghi ricorrenti sui documenti in archivio) vengono automatizzate e producono risultati consultabili e notificati.

**Modulo F — Server MCP.** Componente che espone le capacità della piattaforma verso l'esterno tramite Model Context Protocol: il tenant collega il proprio client AI abituale (Claude, ChatGPT o altro client compatibile) e da lì ricerca e interroga l'Archivio Pubblico e il proprio Archivio Privato come strumenti nativi. VELIA diventa così anche infrastruttura, oltre che applicazione: il valore degli archivi raggiunge l'utente anche negli ambienti AI che già utilizza.

**Modulo G — Memoria persistente.** L'assistente non riparte da zero a ogni conversazione: apprende e conserva le informazioni durevoli che emergono dal lavoro quotidiano — le prassi dell'agenzia, il contesto su clienti e pratiche ricorrenti, le decisioni già prese, le preferenze di formato — e le riutilizza automaticamente in chat e nelle esecuzioni degli agenti. Con il tempo il sistema conosce l'agenzia come un collaboratore storico: è il meccanismo che rende VELIA più prezioso a ogni settimana d'uso e progressivamente più difficile da sostituire. La memoria è trasparente per costruzione: consultabile, modificabile e cancellabile dall'utente.

I meccanismi di personalizzazione — le istruzioni del Modulo D, nelle loro due nature di regole scritte (RF-D-04) e documenti di riferimento (RF-D-14), e la memoria persistente del Modulo G — formano insieme il **DNA d'Agenzia**: le regole dette, i documenti di riferimento e il contesto appreso che rendono le risposte di VELIA uniche per ciascun tenant. Il DNA d'Agenzia cresce con l'uso, non è replicabile da un concorrente che parte da zero e costituisce il principale valore accumulato dal cliente sulla piattaforma.

La linea di separazione è il **modo in cui nascono**: le istruzioni sono deliberate e autorevoli — qualcuno le ha scritte o caricate — mentre la memoria è dedotta e fallibile. Da qui discende la precedenza sancita da RF-G-04: in caso di conflitto vincono le istruzioni. E da qui discende anche il criterio pratico con cui l'utente sceglie dove mettere una cosa: se è una regola su *come giudicare* è una regola scritta; se è un contenuto che va citato, o è più lungo di una pagina, è un documento di riferimento.

Il flusso d'uso tipico: l'operatore riceve un preventivo dal cliente → lo carica nell'Archivio Privato → in chat lo referenzia insieme al set informativo (già presente nell'Archivio Pubblico) del prodotto concorrente → chiede un confronto tra garanzie, massimali, franchigie ed esclusioni → ottiene una risposta strutturata con riferimenti puntuali ai passaggi dei documenti, valutata secondo le istruzioni personalizzate della propria agenzia.

---

## 3. Requisiti funzionali

Convenzione: i requisiti sono identificati come `RF-<modulo>-<numero>`. Priorità: **M** (Must, indispensabile per la prima release), **S** (Should, importante ma differibile), **C** (Could, desiderabile).

### 3.1 Modulo A — Archivio Pubblico precaricato

| ID | Requisito | Priorità |
|---|---|---|
| RF-A-01 | Il sistema DEVE mettere a disposizione di tutti i tenant un archivio documentale precaricato contenente i set informativi (DIP, DIP Aggiuntivo, Condizioni di Assicurazione) e gli altri documenti pubblici dei prodotti delle compagnie assicurative. | M |
| RF-A-02 | Ogni documento dell'Archivio Pubblico DEVE essere corredato di metadati strutturati: compagnia, prodotto, ramo/area di bisogno (es. RC Auto, Infortuni, Casa, Vita), tipologia di documento (DIP, CdA, ecc.), data di edizione/decorrenza, versione. | M |
| RF-A-03 | L'utente DEVE poter navigare l'archivio per compagnia, ramo e prodotto, e ricercare documenti per parola chiave sui metadati e sul titolo. | M |
| RF-A-04 | L'Archivio Pubblico DEVE gestire il versionamento dei set informativi: a parità di prodotto possono coesistere più edizioni, ciascuna con il proprio periodo di validità; l'edizione corrente è evidenziata come predefinita. | M |
| RF-A-05 | L'Archivio Pubblico DEVE essere in sola lettura per i tenant: solo il gestore piattaforma può aggiungere, aggiornare o ritirare documenti. | M |
| RF-A-06 | Il gestore piattaforma DEVE disporre di strumenti interni (back-office) per il caricamento massivo, l'aggiornamento e la correzione dei documenti e dei relativi metadati. | M |
| RF-A-07 | Il sistema DOVREBBE tracciare e mostrare la data di ultimo aggiornamento dell'archivio per compagnia, così che l'utente possa valutare la freschezza dei contenuti. | S |
| RF-A-08 | L'utente DOVREBBE poter segnalare dall'interfaccia un documento mancante, obsoleto o errato (es. nuova edizione non ancora presente), generando una richiesta verso il gestore piattaforma. | S |
| RF-A-09 | L'utente POTREBBE poter marcare come "preferiti" documenti o prodotti di uso frequente, per un accesso rapido. | C |
| RF-A-10 | Il sistema POTREBBE notificare all'utente la pubblicazione di una nuova edizione di un set informativo che ha tra i preferiti o che ha referenziato di recente. | C |

### 3.2 Modulo B — Archivio Privato

| ID | Requisito | Priorità |
|---|---|---|
| RF-B-01 | Ogni tenant DEVE disporre di un Archivio Privato isolato, non visibile né accessibile ad altri tenant in alcuna circostanza (inclusi indicizzazione, retrieval e risposte della chat). | M |
| RF-B-02 | L'utente DEVE poter caricare documenti nell'Archivio Privato tramite upload da interfaccia (singolo e multiplo). Formato minimo supportato: PDF; formati aggiuntivi auspicabili: DOCX, immagini/scansioni. | M |
| RF-B-03 | All'upload il sistema DEVE acquisire/derivare metadati di base (titolo, data caricamento, utente caricante) e DOVREBBE proporre una classificazione assistita (tipologia documento, compagnia, cliente/pratica di riferimento) modificabile dall'utente. | M/S |
| RF-B-04 | L'utente DEVE poter organizzare i documenti privati (cartelle e/o etichette), rinominarli ed eliminarli. | M |
| RF-B-05 | I documenti caricati DEVONO essere resi disponibili alla referenziazione in chat entro un tempo breve e con indicazione chiara dello stato di elaborazione (in coda / pronto / errore). | M |
| RF-B-06 | Il sistema DEVE gestire documenti scansionati tramite OCR, oppure — in prima release — segnalare esplicitamente all'utente i documenti non leggibili automaticamente. | S |
| RF-B-07 | L'amministratore di tenant DOVREBBE poter definire la visibilità dei documenti privati: condivisi con tutto il tenant oppure riservati al singolo utente caricante. | S |
| RF-B-08 | Il sistema DOVREBBE applicare limiti configurabili per tenant (spazio complessivo, dimensione massima per file) coerenti con il piano commerciale. | S |
| RF-B-09 | L'utente DEVE poter promuovere un documento dell'Archivio Privato a documento di riferimento (RF-D-14) senza ricaricarlo, e la scheda del documento DEVE indicare se lo è. | M |

### 3.3 Modulo C — Chat conversazionale e referenziazione

| ID | Requisito | Priorità |
|---|---|---|
| RF-C-01 | Il sistema DEVE offrire un'interfaccia di chat in linguaggio naturale (italiano) con conversazioni persistenti, rinominabili e consultabili nello storico. | M |
| RF-C-02 | Nel comporre un messaggio, l'utente DEVE poter referenziare esplicitamente uno o più documenti da entrambi gli archivi, tramite un selettore contestuale (es. digitando `@` o tramite pulsante di allegato) con ricerca per titolo, compagnia, prodotto. | M |
| RF-C-03 | I documenti referenziati DEVONO entrare a far parte del contesto della conversazione e rimanere richiamabili nei messaggi successivi senza doverli riselezionare, finché l'utente non li rimuove. | M |
| RF-C-04 | Le risposte fondate sui documenti DEVONO includere citazioni verificabili: riferimento al documento e alla posizione (pagina/sezione/articolo) da cui l'informazione è tratta. | M |
| RF-C-05 | L'utente DEVE poter aprire il documento citato direttamente dalla citazione, idealmente posizionato sul passaggio rilevante. | S |
| RF-C-06 | Il sistema DEVE supportare il confronto tra due o più documenti referenziati (es. preventivo privato vs. set informativo pubblico), producendo un output strutturato su garanzie, massimali, franchigie, scoperti ed esclusioni. | M |
| RF-C-07 | Il numero di documenti referenziabili in una singola conversazione DEVE essere significativamente superiore al limite dei competitor (riferimento: Navisio max 5) e comunque comunicato chiaramente all'utente se presente. | M |
| RF-C-08 | Quando la risposta non è supportata dai documenti disponibili, il sistema DEVE dichiararlo esplicitamente invece di produrre contenuto non verificabile. | M |
| RF-C-09 | Se l'utente pone una domanda su un prodotto senza referenziare documenti, il sistema DOVREBBE proporre i documenti pertinenti trovati nell'Archivio Pubblico (ed eventualmente nel Privato) e chiedere conferma prima di usarli come fonte. | S |
| RF-C-10 | L'utente DEVE poter esportare la risposta come documento client-ready applicando uno dei template di output (RF-D-10): scelta del template, generazione nel formato corrispondente (PDF, DOCX, XLSX, PPTX) e download. Resta comunque disponibile la copia rapida del contenuto. | M |
| RF-C-11 | L'utente DEVE poter creare una tabella di analisi selezionando più documenti da entrambi gli archivi (righe) e definendo i criteri di estrazione (colonne): set predefiniti per ramo (garanzie, massimali, franchigie, scoperti, esclusioni) oppure colonne personalizzate espresse in linguaggio naturale. | M |
| RF-C-12 | Ogni cella della tabella DEVE riportare la citazione al passaggio di origine (documento e posizione); quando il dato non è presente nel documento, la cella DEVE dichiararlo esplicitamente ("non presente"), in coerenza con RF-C-08. | M |
| RF-C-13 | La tabella generata DOVREBBE essere interrogabile in chat (sintesi, confronti, isolamento di valori — es. "quale ha la franchigia più bassa?"). | S |
| RF-C-14 | Le tabelle DOVREBBERO poter essere salvate, riaperte e aggiornate (aggiunta/rimozione di documenti e colonne) ed esportate tramite i template di output (RF-D-10), in particolare in formato XLSX. | S |
| RF-C-15 | L'utente DOVREBBE poter condividere conversazioni e tabelle di analisi con altri utenti del proprio tenant, in sola lettura o con possibilità di duplicarle per proseguire il lavoro in autonomia. | S |

### 3.4 Modulo D — Impostazioni e personalizzazione

| ID | Requisito | Priorità |
|---|---|---|
| RF-D-01 | Il sistema DEVE offrire una sezione Impostazioni accessibile dall'interfaccia, con visibilità e permessi differenziati per ruolo (amministratore di tenant vs. operatore). | M |
| RF-D-02 | L'amministratore di tenant DEVE poter selezionare il provider AI e il modello utilizzati dal sistema, tra quelli supportati dalla piattaforma. L'architettura DEVE astrarre il provider (layer multi-provider) in modo da poter aggiungere o sostituire modelli senza impatti sui moduli funzionali. | M |
| RF-D-03 | Per ciascun modello selezionabile il sistema DOVREBBE mostrare informazioni sintetiche utili alla scelta: caratteristiche, adeguatezza ai compiti documentali, eventuale impatto su costi/limiti del piano. | S |
| RF-D-04 | Il sistema DEVE offrire un pannello di istruzioni personalizzate in cui il tenant definisce, in linguaggio naturale, regole e criteri che condizionano la metodologia di analisi e ragionamento dell'AI (es. "non segnalare come carenza l'assenza della garanzia infortuni del conducente: l'agenzia la copre con polizza infortuni dedicata"). | M |
| RF-D-05 | Le istruzioni personalizzate DEVONO essere applicate in modo coerente a tutte le conversazioni del tenant; quando una risposta è influenzata da un'istruzione, il sistema DOVREBBE renderlo esplicito (es. nota "valutato secondo la regola X"). | M/S |
| RF-D-06 | Le istruzioni DOVREBBERO poter essere organizzate per ambito (generali, per ramo, per compagnia) e attivate/disattivate singolarmente. | S |
| RF-D-07 | Il sistema DOVREBBE mantenere uno storico delle modifiche a istruzioni e impostazioni (chi, cosa, quando), a fini di audit e diagnosi di risposte inattese. | S |
| RF-D-08 | Le istruzioni personalizzate NON DEVONO poter compromettere i vincoli di accuratezza del sistema: l'obbligo di citazione (RF-C-04) e la dichiarazione di non-copertura (RF-C-08) restano sempre attivi. Le istruzioni orientano il giudizio e i criteri di valutazione, non alterano i fatti documentali. | M |
| RF-D-09 | L'utente POTREBBE disporre di una modalità di prova per verificare l'effetto di una nuova istruzione su un caso reale prima di attivarla per tutto il tenant. | C |
| RF-D-10 | Il sistema DEVE fornire una libreria di template di output precaricati nei formati PDF, DOCX, XLSX e PPTX, utilizzabili per generare documenti a partire dalle risposte della chat (RF-C-10) e dagli output degli agenti (RF-E-13). | M |
| RF-D-11 | Ogni template DEVE definire struttura, stili tipografici, intestazione/piè di pagina e segnaposto per i contenuti generati (titolo, destinatario, data, corpo, tabelle comparative), così che documenti diversi risultino graficamente coerenti tra loro. | M |
| RF-D-12 | Il tenant DOVREBBE poter personalizzare i template con la propria identità visiva (logo, colori, dati di contatto, firma) e caricare template propri conformi allo schema dei segnaposto. | S |
| RF-D-13 | L'amministratore di tenant DOVREBBE poter associare un template predefinito a ciascuna tipologia di output (es. confronto polizze → template comparativo; riepilogo garanzie → template scheda prodotto). | S |
| RF-D-14 | Le istruzioni DEVONO poter comprendere **documenti di riferimento** (convenzioni, note tecniche, casistica, testi tipo), caricati direttamente o promossi dall'Archivio Privato: sono contesto permanente, consultato automaticamente dall'AI senza referenziazione esplicita. Come le regole scritte hanno un ambito (RF-D-06) e sono attivabili singolarmente. *Sostituisce RF-B-09 della versione 0.8.* | M |
| RF-D-15 | La gestione dei documenti di riferimento DOVREBBE essere riservata all'amministratore di tenant; la chat DOVREBBE indicare quando una risposta vi attinge, distinguendolo dagli altri segnali di provenienza (RF-D-05, RF-G-03). *Sostituisce RF-B-10 della versione 0.8.* | S |
| RF-D-16 | La sezione DEVE mostrare quanti documenti di riferimento sono attivi e il loro peso complessivo: essendo contesto permanente incidono sul costo di ogni interrogazione (punto aperto §6.12, RNF-05), e l'interfaccia deve scoraggiarne l'accumulo invece di favorirlo. | S |

### 3.5 Modulo E — Agenti

| ID | Requisito | Priorità |
|---|---|---|
| RF-E-01 | Il sistema DEVE offrire una sezione "Agenti" in cui l'utente crea, modifica, duplica, attiva/disattiva ed elimina gli agenti del proprio tenant. | M |
| RF-E-02 | Un agente DEVE essere definito almeno da: nome, descrizione, istruzioni del task in linguaggio naturale, fonti documentali di riferimento (singoli documenti o intere porzioni dell'Archivio Pubblico e/o Privato), formato dell'output atteso. | M |
| RF-E-03 | L'utente DEVE poter eseguire un agente manualmente, on demand, con esito consultabile in piattaforma. | M |
| RF-E-04 | L'utente DEVE poter pianificare l'esecuzione ricorrente di un agente (es. giornaliera, settimanale, mensile, con orario), con possibilità di sospendere e riprendere la pianificazione. | M |
| RF-E-05 | All'esecuzione manuale l'utente DOVREBBE poter fornire parametri di input variabili previsti dalla definizione dell'agente (es. il documento su cui operare in quella specifica esecuzione). | S |
| RF-E-06 | Il sistema DEVE mantenere per ciascun agente uno storico delle esecuzioni: data/ora, modalità (manuale/schedulata), stato (in corso, completata, fallita), output prodotto e log sintetico. | M |
| RF-E-07 | Gli output degli agenti DEVONO essere consultabili in piattaforma; il sistema DOVREBBE notificare l'utente al completamento delle esecuzioni pianificate (in-app e/o email). | M/S |
| RF-E-08 | Le esecuzioni degli agenti DEVONO rispettare gli stessi vincoli della chat: isolamento del tenant (RF-B-01), istruzioni personalizzate del Modulo D, obbligo di citazione (RF-C-04) e dichiarazione di non-copertura (RF-C-08). | M |
| RF-E-09 | Il sistema DEVE applicare limiti per tenant sulle esecuzioni (numero di agenti attivi, frequenza minima di schedulazione, esecuzioni concorrenti), coerenti con il piano commerciale e con RNF-05. | M |
| RF-E-10 | Il sistema DOVREBBE offrire una libreria di agenti predefiniti (template) attivabili e personalizzabili (es. monitoraggio di nuove edizioni dei set informativi dei prodotti preferiti, riepilogo settimanale dei documenti caricati nell'Archivio Privato). | S |
| RF-E-11 | In caso di esecuzione fallita, il sistema DOVREBBE riprovare secondo una politica di retry e segnalare all'utente i fallimenti persistenti. | S |
| RF-E-12 | L'utente POTREBBE poter avviare una conversazione in chat a partire dall'output di un'esecuzione, per approfondirne i risultati con i medesimi documenti in contesto. | C |
| RF-E-13 | La definizione di un agente DEVE poter specificare un template di output (RF-D-10): in tal caso ogni esecuzione produce, oltre al contenuto consultabile in piattaforma, il documento generato sul template, scaricabile dallo storico esecuzioni. | M |

### 3.6 Modulo F — Server MCP

| ID | Requisito | Priorità |
|---|---|---|
| RF-F-01 | Il sistema DEVE esporre un server MCP che rende disponibili come tool, ai client AI compatibili, le capacità di base della piattaforma: ricerca dei documenti per metadati (compagnia, prodotto, ramo, tipologia, edizione), lettura/estratto del contenuto e interrogazione di un documento specifico, sia sull'Archivio Pubblico sia sull'Archivio Privato del tenant. | M |
| RF-F-02 | L'accesso via MCP DEVE avvenire con credenziali dedicate per tenant/utente, generabili e revocabili dalla sezione Impostazioni, e DEVE rispettare le stesse regole di isolamento e visibilità dell'applicazione (RF-B-01, RF-B-07). | M |
| RF-F-03 | Le interazioni effettuate via MCP DEVONO essere conteggiate nei limiti di piano del tenant al pari di quelle in applicazione e tracciate nei log (RNF-05, RNF-07). | M |
| RF-F-04 | La piattaforma DOVREBBE fornire documentazione di configurazione per i principali client MCP e mostrare in Impostazioni lo stato delle connessioni attive. | S |
| RF-F-05 | La documentazione DEVE chiarire che le risposte generate nel client esterno non sono governate dalle istruzioni personalizzate né dai vincoli di citazione di VELIA; il sistema POTREBBE esporre le istruzioni del tenant come risorsa MCP opzionale per mitigare questo scarto. | M/C |
| RF-F-06 | L'esposizione via MCP di capacità avanzate (tabelle di analisi, esecuzione di agenti, generazione su template) POTREBBE essere introdotta in versioni successive, previa valutazione di sicurezza e costi. | C |

### 3.7 Modulo G — Memoria persistente

| ID | Requisito | Priorità |
|---|---|---|
| RF-G-01 | Il sistema DEVE mantenere una memoria persistente che apprende automaticamente dalle conversazioni e dalle esecuzioni le informazioni durevoli del tenant — prassi operative, contesto su clienti e pratiche ricorrenti, decisioni prese, preferenze di lavoro — e le applica nelle interazioni successive senza che l'utente debba ripeterle. | M |
| RF-G-02 | La memoria DOVREBBE essere organizzata su due livelli: memoria di tenant (condivisa tra gli utenti dell'agenzia) e memoria personale del singolo utente (preferenze individuali). | S |
| RF-G-03 | La memoria DEVE essere trasparente e controllabile: un pannello dedicato DEVE consentire di consultare, modificare ed eliminare i singoli ricordi; quando una risposta si fonda su un ricordo, il sistema DOVREBBE renderlo riconoscibile. | M |
| RF-G-04 | In caso di conflitto, le istruzioni personalizzate esplicite (RF-D-04) DEVONO prevalere sui ricordi appresi automaticamente: la memoria integra, non sostituisce, le regole del tenant. | M |
| RF-G-05 | La memoria NON DEVE registrare categorie particolari di dati personali degli assicurati (es. dati sanitari, art. 9 GDPR) né dati eccedenti rispetto alla finalità; DEVE essere prevista una politica di retention e la cancellazione effettiva su richiesta (coerenza con RNF-03). | M |
| RF-G-06 | La memoria DOVREBBE alimentare anche le esecuzioni degli agenti (Modulo E), così che i task pianificati beneficino del contesto accumulato del tenant. | S |
| RF-G-07 | L'utente DOVREBBE poter registrare esplicitamente un ricordo dalla chat (es. "ricordati che...") con conferma visibile del salvataggio. | S |

---

## 4. Requisiti non funzionali

| ID | Requisito | Note |
|---|---|---|
| RNF-01 | **Accuratezza.** Le risposte basate su documenti devono essere fedeli al testo di origine; il tasso di allucinazione deve essere minimizzato per progettazione (citazioni obbligatorie, dichiarazione di non-copertura). L'approccio di retrieval è una decisione architetturale aperta: il RAG classico a chunking è considerato inadeguato al dominio (vedi §6). | Critico: nel dominio assicurativo un'informazione errata su una garanzia ha impatto diretto sul lavoro dell'intermediario. |
| RNF-02 | **Sicurezza e isolamento.** Isolamento rigoroso tra tenant a livello di dati, indici e contesto conversazionale. Cifratura dei documenti a riposo e in transito. | — |
| RNF-03 | **Privacy e conformità.** I documenti privati possono contenere dati personali di clienti finali: trattamento conforme al GDPR (titolarità/responsabilità da definire contrattualmente, registro trattamenti, cancellazione effettiva su richiesta). | Da approfondire con consulenza legale. |
| RNF-04 | **Prestazioni.** Prima risposta della chat percepibile entro pochi secondi (streaming); elaborazione post-upload di un documento tipico (≤100 pagine) completata in tempi compatibili con l'uso in sessione. | Target numerici da fissare. |
| RNF-05 | **Sostenibilità dei costi.** Il costo variabile per interazione deve essere compatibile con un pricing per tenant nell'ordine di ~€279/mese: l'architettura deve essere progettata con il costo per query come vincolo di primo livello. | — |
| RNF-06 | **Usabilità.** Utenza target non tecnica: la referenziazione dei documenti e la lettura delle citazioni devono essere immediate, senza formazione dedicata. | — |
| RNF-07 | **Tracciabilità.** Log delle conversazioni e delle fonti utilizzate per ciascuna risposta, a supporto di audit interni e miglioramento qualità. | — |

---

## 5. Vincoli e assunzioni

1. **Lingua e mercato:** prima release focalizzata su mercato italiano e documentazione in lingua italiana.
2. **Naming e dominio:** il nome di prodotto confermato è VELIA; la scelta del dominio è in corso e non impatta i requisiti qui descritti.
3. **Cliente pilota:** è disponibile un'agenzia assicurativa pilota con documenti reali; il test case di riferimento per il Modulo C è il confronto ramo auto tra polizza Cattolica/Generali "Active Veicoli AUTOPIÙ con Telematica" e un preventivo Unipol sullo stesso veicolo.
4. **Dipendenza da provider AI terzi:** il sistema si appoggia a modelli di provider esterni; disponibilità, versioni, prezzi e termini d'uso sono variabili esogene. Il layer di astrazione multi-provider (RF-D-02) è il presidio architetturale di questo rischio.
5. **Perimetro della prima release:** le automazioni verticali su rinnovi/retention e le integrazioni con sistemi esterni restano fuori dal perimetro di questo documento; la sezione Agenti (Modulo E) ne costituisce però la base abilitante, e i moduli qui descritti devono essere progettati senza precluderne l'introduzione. Fa eccezione il server MCP (Modulo F), che non è un'integrazione con i gestionali di agenzia ma un'esposizione di VELIA verso i client AI dell'utente.

---

## 6. Punti aperti

| # | Punto aperto | Impatto |
|---|---|---|
| 1 | **Sourcing dell'Archivio Pubblico:** come vengono raccolti e mantenuti aggiornati i set informativi (raccolta manuale, scraping dei siti compagnie, feed/accordi)? Con quale frequenza di aggiornamento e quale copertura iniziale (quante compagnie, quali rami)? | Determina effort operativo ricorrente e credibilità del prodotto al lancio. |
| 2 | **Aspetti legali sul ridistribuire documenti pubblici:** i set informativi sono pubblici per obbligo normativo, ma va verificata la liceità della loro aggregazione e ridistribuzione in piattaforma. | Rischio legale da chiudere prima del lancio. |
| 3 | **Architettura di retrieval:** RAG classico ritenuto inadeguato; alternative in valutazione: knowledge base a note interconnesse ("wiki LLM"), lettura agentica da filesystem, approcci ibridi. Da decidere anche in funzione del vincolo costi (RNF-05). | Decisione architetturale fondante. |
| 4 | **Limite documenti per conversazione (RF-C-07):** fissare il valore effettivo in base a test su contesto, qualità e costi. | UX e posizionamento competitivo. |
| 5 | **Granularità della visibilità nell'Archivio Privato (RF-B-07):** serve davvero il livello per-utente in prima release o basta il livello tenant? Da validare col cliente pilota. | Scope prima release. |
| 6 | **Gestione documenti scansionati (RF-B-06):** OCR in prima release o rimandato? | Scope prima release. |
| 7 | **Provider e modelli supportati al lancio (RF-D-02):** quali provider/modelli offrire in prima release e con quale granularità di scelta (solo a livello tenant o anche per singola conversazione)? Gestione delle chiavi API: incluse nel servizio VELIA o "bring your own key"? Impatta direttamente RNF-05 e il pricing. | Decisione di prodotto e commerciale. |
| 8 | **Governance delle istruzioni (RF-D-04, RF-D-14):** chi può crearle e modificarle (solo l'amministratore?), serve un flusso di approvazione, e come intercettare istruzioni mal formulate che degradano la qualità delle risposte? Vale per le regole scritte quanto per i documenti di riferimento. | Qualità e responsabilità professionale. |
| 9 | **Sostenibilità delle esecuzioni schedulate (RF-E-04, RF-E-09):** le esecuzioni ricorrenti consumano AI anche senza utente attivo; da definire i limiti di piano (frequenza minima, numero di run mensili inclusi) per non erodere la marginalità del canone. | Sostenibilità economica (RNF-05). |
| 10 | **Canali di notifica degli agenti (RF-E-07):** solo in-app o anche email/altri canali? Da validare col cliente pilota. | UX e scope prima release. |
| 11 | **Set di template al lancio (RF-D-10):** quali tipologie servono in prima release (confronto polizze, riepilogo garanzie, proposta di rinnovo, report interno) e in quali formati prioritari? La generazione fedele ha complessità tecnica molto diversa per formato: PDF/DOCX più lineari, XLSX e PPTX più onerosi. | Scope prima release ed effort tecnico. |
| 12 | **Dimensionamento di tabelle e documenti di riferimento (RF-C-11, RF-D-14):** limiti su documenti × colonne per tabella e sull'ampiezza del contesto permanente, che incide sul costo di ogni singola query. L'ambito di validità (RF-D-06) mitiga il problema — un documento entra in contesto solo quando pertinente — ma non lo elimina. Da definire in coerenza con RNF-05. | Sostenibilità economica e UX. |
| 13 | **Perimetro e pricing dell'accesso MCP (Modulo F):** quali tool esporre al lancio, come conteggiare e prezzare le interazioni provenienti dai client esterni (incluse nel canone? pacchetto dedicato?), e policy di sicurezza per l'accesso programmatico all'Archivio Privato. | Decisione di prodotto, commerciale e di sicurezza. |
| 14 | **Regole di apprendimento e perimetro privacy della memoria (Modulo G):** cosa merita di essere memorizzato e cosa no (dati dei clienti finali, basi giuridiche GDPR, retention), come prevenire ricordi errati o obsoleti che degradano le risposte, e come comunicare al tenant il funzionamento della memoria in modo che generi fiducia e non diffidenza. | Privacy, qualità e fiducia. |

---

## 7. Storico delle revisioni

### 0.9 — 04/08/2026

**La knowledge base di agenzia confluisce nelle Istruzioni (Modulo D).**

Non esiste più come area dell'Archivio Privato. I documenti di riferimento
diventano una delle due nature delle istruzioni, accanto alle regole scritte.

*Perché.* Istruzioni e documenti di riferimento hanno lo stesso modello di
governo — deliberati, curati dall'amministratore, sempre attivi — mentre la
memoria persistente è l'unica automatica e fallibile. Il taglio precedente
separava due cose uguali e le teneva lontane dalla terza. In più, con
l'utente costretto a scegliere fra tre contenitori dai confini sottili, lo
stesso contenuto sarebbe finito in due posti diversi, con l'inevitabile
divergenza a seguire.

*Conseguenza che vale da sola la modifica.* I documenti di riferimento
ereditano l'**ambito di validità** delle istruzioni (RF-D-06), che la
knowledge base non aveva: entrano nel contesto solo quando pertinenti,
invece che a ogni interrogazione. Il costo del contesto permanente — punto
aperto §6.12, vincolo RNF-05 — passa da fisso a condizionato.

| Cambiamento | |
|---|---|
| RF-B-09 | riscritto: ora è la promozione di un documento dell'Archivio Privato a documento di riferimento |
| RF-B-10 | rimosso, confluito in RF-D-15 |
| RF-D-14 | nuovo — documenti di riferimento (sostituisce l'ex RF-B-09) |
| RF-D-15 | nuovo — governo e segnale di provenienza (sostituisce l'ex RF-B-10) |
| RF-D-16 | nuovo — visibilità del peso del contesto permanente |
| §1.1, §1.3, §2, §6.8, §6.12 | allineati |

---

*Prossime revisioni previste: requisiti di integrazione con sistemi esterni; requisiti delle automazioni su rinnovi e retention; dashboard di utilizzo per l'amministratore; spazi condivisi tra organizzazioni; modello dei ruoli e permessi di dettaglio; requisiti di onboarding tenant.*
