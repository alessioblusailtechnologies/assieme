# Il francese di Velia: glossario e regole di scrittura

| Campo | Valore |
|---|---|
| Documento | Fase 1 del piano multilingua |
| Data | 05/09/2026 |
| Mercato | Francia, Belgio, Lussemburgo |
| Riferimento | `PIANO-MULTILINGUA.md` §5 e §8 |

Questo documento chiude le decisioni di lessico e di posizionamento. Da qui
in avanti non si discute più mentre si scrive: si scrive.

---

## 1. Le tre decisioni di posizionamento

### 1.1 L'Archivio pubblico si dichiara

**Decisione del committente, 05/09/2026.** In francese la biblioteca di
mercato si racconta come l'italiano racconta l'Archivio pubblico: **c'è, è
ordinata e la teniamo aggiornata noi**. Il primo giorno il cabinet fa
domande, non caricamenti.

Questa decisione ribalta la proposta iniziale di questo documento, che era di
guidare con archivio privato, metodo e memoria. Il motivo del ribaltamento è
che l'ingestion del mercato francese si farà: la promessa non descrive lo
stato di oggi ma il prodotto che il cabinet troverà.

Va tenuto presente cosa comporta: **la frase è vera dal giorno in cui la
biblioteca francese esiste, non da quando la pagina va online.** Se il sito
francese si pubblica prima dell'ingestion, per quel tratto di tempo la home
promette qualcosa che alla prima demo non si può mostrare. La sequenza
sicura è: ingestion del primo lotto francese, poi accensione di
`LINGUE_ATTIVE`.

Le stringhe interessate, tutte in `src/i18n/fr/`:

| Dove | Testo francese |
|---|---|
| Scheda della piattaforma | «Le marché français de l'assurance est déjà dedans» |
| Blocco di approfondimento | «Vous ne partez jamais de zéro» |
| Riga del blocco | «Les produits des principaux assureurs français, chargés et entretenus par nous» |
| Azione del blocco | «Demandez quelles compagnies sont déjà couvertes» |
| Glossario | «Vous n'avez pas à la charger : elle est là» |
| Azienda | «Le marché est là dès le premier jour» |

### 1.2 I numeri della home

Gli stessi cinque dell'italiano, con una sola differenza:

- Documents à déposer pour commencer : **zéro**
- Fois où vous expliquez une règle : **une**
- Réponses avec la source citée : **100 %**
- Documents dans une seule comparaison : **des dizaines**
- Compagnies déjà en bibliothèque : **les principales**

L'ultimo dice «les principales» e non un conteggio. L'italiano dice «più di
30» perché quelle trenta si possono contare; il numero francese si scrive
quando l'ingestion l'ha prodotto, non prima. Dichiarare che la biblioteca
esiste e inventare quante compagnie contiene sono due cose diverse: la prima
è una decisione di posizionamento, la seconda un dato.

### 1.3 Nessun nome di compagnia nella tabella dimostrativa

La riproduzione dell'interfaccia in home confronta due prodotti. In italiano
sono «Active Veicoli AUTOPIÙ» e «Preventivo Unipol». In francese **non si
mettono nomi di compagnie francesi vere in un confronto inventato**: sono
marchi altrui in una scena che non è mai avvenuta.

Le colonne diventano «Contrat en cours» e «Devis concurrent», le citazioni
`conditions_generales.pdf` e `devis_concurrent.pdf`. Si perde un po' di
concretezza e si evita un problema.

### 1.4 Il titolare resta italiano

Le note legali francesi citano **Blusail Technologies S.r.l.s.**, che è
l'entità reale: non esiste una società francese e inventarne una in una
pagina legale sarebbe grave. Nel testo francese si dice quale versione fa
fede e si nomina l'autorità di controllo competente per chi legge (CNIL in
Francia, APD in Belgio, CNPD in Lussemburgo).

⚠️ **Questa parte va riletta da chi ha scritto l'informativa italiana prima
della pubblicazione.** Tradurre un'informativa privacy non è un lavoro di
copy.

---

## 2. Registro

**Si dà del «vous».** L'italiano di Velia dà del tu, e in Italia nel B2B
tecnologico funziona. In Francia, rivolgersi a un courtier dandogli del tu è
un errore di registro che segnala subito una traduzione fatta male. Il «vous»
non è freddo: è la forma normale fra professionisti.

**Si dice «cabinet».** È il termine che copre courtiers e mandataires, ed è
come si chiamano fra loro. «Agence» resta dove si parla specificamente
dell'agent général. Mai «agence» come sinonimo generico: in Francia
un'agenzia è quella dell'agent général di una compagnia, non lo studio del
courtier.

**Tipografia francese.** Spazio unificatore prima di `:` `;` `!` `?` e dentro
i caporali `«  »`. È il segno più visibile che il testo è stato scritto in
francese e non voltato. Nei dizionari si usa il carattere U+00A0, non uno
spazio normale, così non va mai a capo da solo.

**Niente trattini lunghi**, come in italiano: il separatore è il trattino
semplice.

**Le percentuali** si scrivono con lo spazio: `100 %`, non `100%`.

---

## 3. Glossario di dominio

| Italiano | Francese | Nota |
|---|---|---|
| set informativo | documentation précontractuelle | il pacchetto completo |
| DIP | IPID | *document d'information sur le produit d'assurance*, formato europeo |
| DIP Aggiuntivo | document d'information complémentaire | in Francia il complemento sta nella notice d'information |
| Condizioni di Assicurazione | conditions générales | e `conditions particulières` per il singolo contratto |
| polizza | contrat | «police» esiste ma suona datato |
| preventivo | devis | |
| garanzia | garantie | |
| massimale | plafond de garantie | |
| franchigia | franchise en valeur absolue | |
| scoperto | franchise proportionnelle | **in Francia non esiste «scoperto» come voce distinta**: è una franchigia espressa in percentuale. La distinzione italiana va resa così, non tradotta alla lettera |
| sinistro | sinistre | |
| ramo | branche | |
| agenzia (generico) | cabinet | vedi §2 |
| agente | agent général | |
| broker | courtier | |
| intermediario | intermédiaire d'assurance | le categorie ORIAS: COA, AGA, MIA, MA |
| capitolato | cahier des charges | |
| tutela legale | protection juridique | |
| RC Professionale | RC Professionnelle | |
| retroattività | reprise du passé | e `garantie subséquente` per la coda successiva |
| claims made | base réclamation | |
| adeguatezza | devoir de conseil | **non è una traduzione, è l'obbligo equivalente** nel diritto francese, e ha lo stesso peso pratico |
| infortuni del conducente | protection du conducteur | garanzia che esiste anche in Francia, quindi l'esempio regge |
| IVASS | ORIAS (registro), ACPR (vigilanza) | FSMA in Belgio, CAA in Lussemburgo |
| Garante privacy | CNIL | APD in Belgio, CNPD in Lussemburgo |
| GDPR | RGPD | |
| Archivio pubblico | bibliothèque de marché | vedi §1.1 per come si racconta |
| Memoria viva | mémoire vivante | |

---

## 4. Cosa non si traduce

- **Velia**, il nome del prodotto.
- **Blusail Technologies S.r.l.s.**, la ragione sociale, che nei testi arriva
  dal segnaposto `{azienda}`.
- I nomi dei formati: PDF, DOCX, XLSX, PPTX.
- WhatsApp.
