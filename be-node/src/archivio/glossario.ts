/**
 * Il glossario dei rischi: come si chiama, nei contratti italiani, quello
 * che l'utente nomina a modo suo.
 *
 * Nasce da un limite preciso del motore. La ricerca è lessicale (Grep), e
 * gli `INDICE.md` sanno i sinonimi dei **nomi commerciali** («FD Car» =
 * «Filo diretto Car»), non quelli dei **rischi**: nessun indice dice che
 * chi chiede «se mi si rompe un tubo» sta chiedendo dei «danni da acqua
 * condotta». Senza quel ponte il Grep torna a mani vuote e la risposta
 * diventa «non è coperto» quando la garanzia c'era, scritta con altre
 * parole. È il modo più silenzioso che abbiamo di sbagliare.
 *
 * Sta qui e non nel prompt di sistema perché è un elenco lungo che serve
 * di rado: `regole.ts` dice al modello di aprirlo quando una ricerca non
 * dà risultati, e per il resto non costa niente. Sta nel codice e non
 * nello Storage perché è sapere sul mestiere, non sull'archivio: non
 * cambia quando entra una compagnia nuova, e va versionato con il prompt
 * che lo cita.
 *
 * Vincolo di forma: **elenca nomi, mai coperture**. Non dice cosa copre
 * una polizza, dice come potrebbe essere scritto ciò che si sta cercando.
 * La risposta viene sempre e solo dal documento.
 */

/** Il nome del file nella workspace, sotto `archivio-pubblico/`. */
export const NOME_GLOSSARIO = 'GLOSSARIO.md';

export const GLOSSARIO_RISCHI = `# Glossario dei rischi e delle varianti

Serve a **cercare**, non a rispondere: dice con quali parole i contratti
italiani scrivono ciò che l'utente ha chiesto a parole sue. Se un Grep non
dà risultati, prova qui le varianti prima di concludere che una garanzia
non c'è.

Questo file non è una fonte: non si cita mai, e non dice che cosa un
prodotto copra. La copertura la dicono le Condizioni di Assicurazione.

## Le parole del contratto

| Cosa cerchi | Come lo scrivono i contratti |
|---|---|
| Quanto paga al massimo | massimale, somma assicurata, capitale assicurato, limite di indennizzo, limite di risarcimento, sottolimite, disponibilità |
| Quanto resta a carico dell'assicurato | franchigia, franchigia assoluta, scoperto, minimo non indennizzabile, minimo scoperto, quota a carico dell'Assicurato |
| Che cosa non è coperto | esclusioni, delimitazioni, rischi esclusi, limitazioni, «l'assicurazione non è operante», «sono esclusi i danni», «non sono considerati sinistri» |
| Attesa prima che la garanzia parta | carenza, periodo di carenza, franchigia temporale, termine di aspettativa |
| Quando l'assicuratore si rivale | rivalsa, diritto di rivalsa, regresso, surrogazione, surroga (art. 1916 c.c.) |
| Fine e rinnovo del contratto | disdetta, recesso, tacito rinnovo, rinnovo automatico, cessazione, risoluzione |
| Quanto si paga e come | premio, rata, frazionamento, rateazione, appendice di variazione, regolazione del premio |
| Quello che viene pagato | indennizzo (danni propri), risarcimento (responsabilità civile), liquidazione, rimborso |
| Chi è chi | Contraente (firma e paga), Assicurato (è esposto al rischio), Beneficiario (incassa), Terzo (l'estraneo danneggiato) |
| Se si è assicurato per meno del valore | regola proporzionale, sottoassicurazione, proporzionale (art. 1907 c.c.), deroga alla proporzionale |
| Come si denuncia | denuncia di sinistro, avviso di sinistro, obblighi in caso di sinistro, termini di denuncia |
| Comportamenti che fanno decadere | dolo, colpa grave, aggravamento del rischio, dichiarazioni inesatte o reticenti (artt. 1892-1893 c.c.) |
| Dove vale | estensione territoriale, ambito territoriale, validità territoriale |
| Quando vale | decorrenza, scadenza, periodo di assicurazione, operatività, retroattività (nelle claims made) |

## Auto e veicoli

| Cosa cerchi | Come lo scrivono i contratti |
|---|---|
| Responsabilità verso gli altri | R.C. Auto, R.C.A., Responsabilità Civile Autoveicoli, «danni involontariamente cagionati a terzi» |
| Danni al proprio veicolo | Kasko, Casco, Collisione, Danni Accidentali, Corpi Veicoli Terrestri (C.V.T.), Avaria |
| Urto con un altro veicolo identificato | Collisione, Kasko collisione, Mini Kasko |
| Furto | furto, furto totale, furto parziale, tentato furto, rapina, appropriazione indebita |
| Incendio | incendio, esplosione, scoppio, azione del fulmine |
| Vandalismo | atti vandalici, atti dolosi di terzi, eventi sociopolitici, tumulti popolari, scioperi, sommosse, terrorismo, sabotaggio |
| Maltempo | eventi naturali, eventi atmosferici, grandine, trombe d'aria, uragano, alluvione, inondazione, allagamento, frana, sovraccarico di neve, caduta di alberi |
| Vetri rotti | cristalli, rottura dei cristalli, vetri, parabrezza, lunotto |
| Rimasti a piedi | assistenza, assistenza stradale, soccorso stradale, traino, depannage, auto sostitutiva, vettura in sostituzione, rientro dei passeggeri |
| Spese legali | tutela legale, tutela giudiziaria, difesa penale, recupero danni |
| Chi guida si fa male | infortuni del conducente, infortuni conducente, invalidità permanente da infortunio |
| Sconti e classe di merito | bonus/malus, classe di merito (C.U.), attestato di rischio, bonus protetto, tutela bonus |
| Chi può guidare | guida esperta, guida esclusiva, guida libera, guida giovane, età del conducente |
| Scatola nera | dispositivo telematico, scatola nera, black box, apparato satellitare, sistema di localizzazione |
| Rivalse tipiche | guida in stato di ebbrezza, sotto l'effetto di sostanze, patente scaduta o non idonea, veicolo non revisionato, trasporto non conforme |
| Quanto vale l'auto rubata | valore commerciale, valore a nuovo, valore assicurato, Quattroruote, Eurotax |
| Danni dopo l'incendio ad altri | ricorso terzi da incendio, R.C.T. da incendio |
| Chi paga se l'altro non è assicurato | Fondo di Garanzia per le Vittime della Strada, veicolo non identificato, risarcimento diretto, indennizzo diretto (C.A.R.D.) |

## Casa, fabbricati, imprese

| Cosa cerchi | Come lo scrivono i contratti |
|---|---|
| Un tubo che perde o scoppia | danni da acqua, acqua condotta, rottura di tubazioni, occlusione, spargimento d'acqua, traboccamento, rigurgito di fogne, gelo, ricerca del guasto, spese di ricerca e riparazione |
| Incendio e affini | incendio, fulmine, esplosione, scoppio, implosione, fumo, urto di veicoli, caduta di aeromobili |
| Danni all'impianto elettrico | fenomeno elettrico, corto circuito, sovratensione, danni da elettricità |
| Furto in casa o in azienda | furto, rapina, estorsione, scasso, effrazione, destrezza, portavalori, guardiania, mezzi di chiusura |
| Maltempo | eventi atmosferici, grandine, vento, sovraccarico neve, allagamento, alluvione, inondazione, terremoto, catastrofali |
| Danni causati agli altri | R.C.T., Responsabilità Civile verso Terzi, R.C. della proprietà, R.C. della conduzione, R.C.O. (verso i prestatori d'opera), R.C. prodotti |
| Danni al conduttore/proprietario | ricorso terzi, ricorso locatari, rischio locativo, danni ai locali |
| Perdite indirette | danni indiretti, perdita di pigione, maggiori costi, interruzione di esercizio, business interruption, indennità aggiuntiva |
| Vetrine | cristalli, lastre, vetrine, insegne |
| Macchine e impianti | guasti macchine, rotture accidentali, elettronica, apparecchiature elettroniche, all risks |
| Merci deperibili | merci in refrigerazione, danni da mancata refrigerazione |
| Chi lavora in azienda | infortuni dei dipendenti, R.C.O., malattie professionali, INAIL |

## Cyber

| Cosa cerchi | Come lo scrivono i contratti |
|---|---|
| Dati rubati o esposti | violazione dei dati, data breach, perdita di dati, trattamento illecito, notifica al Garante |
| Riscatto | ransomware, estorsione informatica, cyber estorsione, richiesta di riscatto |
| Sistemi fermi | interruzione dell'attività, interruzione di rete, business interruption informatica, ripristino dei dati e dei sistemi |
| Truffe | frode informatica, ingegneria sociale, social engineering, phishing, dirottamento di pagamenti |
| Responsabilità verso terzi | responsabilità per violazione della privacy, R.C. trattamento dati, sanzioni del Garante (dove assicurabili) |

## Persone

| Cosa cerchi | Come lo scrivono i contratti |
|---|---|
| Infortunio | infortunio, morte da infortunio, invalidità permanente, inabilità temporanea, diaria da inabilità |
| Ricovero | diaria da ricovero, indennità giornaliera, day hospital, convalescenza |
| Spese di cura | rimborso spese mediche, grandi interventi chirurgici, alta specializzazione, ticket, prestazioni odontoiatriche |
| Malattia grave | malattie gravi, dread disease, non autosufficienza, long term care |
| Vita | caso morte, temporanea caso morte (T.C.M.), capitale caso morte, premorienza |

## Come chiede l'utente, come sta nel documento

- «se scoppia un tubo», «mi è entrata acqua dal piano di sopra» → danni da
  acqua condotta, spargimento d'acqua, rigurgito
- «se mi rubano la macchina» → furto totale; se rubano solo dei pezzi →
  furto parziale
- «se grandina» → eventi naturali / eventi atmosferici
- «se mi rompono lo specchietto» → atti vandalici (se doloso), collisione o
  danni accidentali (se urto)
- «se rompo il parabrezza» → cristalli
- «se resto a piedi» → assistenza stradale, traino, auto sostitutiva
- «se sono in torto» → R.C.A.; «se ho ragione» → risarcimento diretto,
  C.A.R.D.
- «se mi tampona uno senza assicurazione» → Fondo di Garanzia per le
  Vittime della Strada
- «quanto mi rimborsano» → massimale e franchigia, sempre insieme
- «da quando vale» → decorrenza, e per certe garanzie la carenza
- «se non pago» → mora, sospensione della garanzia (art. 1901 c.c.)

## Dove guardare, nell'ordine

1. Il **DIP** e il **DIP Aggiuntivo** dicono in poche pagine che cosa c'è e
   che cosa no: buoni per orientarsi e per capire quale nome usa quella
   compagnia.
2. Le **Condizioni di Assicurazione** sono il testo che vincola: la
   risposta si fonda lì, mai sul solo DIP.
3. Il **Glossario** o le **Definizioni** delle Condizioni (di solito la
   prima sezione) dicono come quel contratto usa una parola: se il termine
   è definito lì, la definizione del contratto batte questo glossario.
`;
