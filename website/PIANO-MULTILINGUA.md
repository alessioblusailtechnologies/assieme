# Sito sonovelia.it: piano multilingua

| Campo | Valore |
|---|---|
| Documento | Piano multilingua del sito istituzionale |
| Versione | 0.1 |
| Data | 05/09/2026 |
| Progetto | `website/` - Astro 5.18.2, build statica su Cloudflare Pages |
| Prima lingua | Francese (mercato Francia e BeLux) |

---

## 1. Le quattro decisioni prese

1. **Il francese non è una traduzione, è un adattamento.** Il destinatario è
   il mercato francofono Francia/Belgio/Lussemburgo. Cambia il lessico
   (IPID e non DIP, courtier e non broker), cambiano i riferimenti normativi
   (ORIAS e ACPR, FSMA in Belgio) e cambia una promessa di prodotto: vedi §8.
2. **URL in sottocartella `/fr/`.** Italiano alla radice senza prefisso.
   Un solo dominio, un solo progetto Pages, autorità di dominio condivisa.
3. **Slug tradotti**: `/fr/plateforme`, non `/fr/piattaforma`. Serve una
   tabella di corrispondenza it-fr, che diventa la sorgente unica per
   hreflang, sitemap e cambio lingua.
4. **Perimetro completo**: tutte le pagine, comprese legale, risorse e le
   due guide.

---

## 2. Da dove partiamo

Il sito oggi ha 14 rotte, 2 guide in content collection e 3 endpoint
generati. La copy sta in tre posti diversi:

| Dove | Esempio | Quanto |
|---|---|---|
| `src/data/home.ts` | hero, statement, memoria, storie | ~1.100 parole |
| Costanti nel frontmatter delle pagine | l'array `products` in `piattaforma.astro` | la maggior parte |
| Letterali nel markup e nei props | `title="Tutta l'agenzia, una sola intelligenza"` | il resto |
| `src/config/site.ts` | navigazione, footer, annunci | ~60 etichette |
| `src/content/guide/*.md` | le due guide | ~2.450 parole |

Totale da tradurre: circa **8.500 parole**, più una cinquantina di stringhe
di interfaccia e le stringhe dello script di validazione in `demo.astro`.

I componenti sono quasi tutti presentazionali e ricevono props: è la
condizione che rende fattibile il multilingua senza duplicare markup.

---

## 3. Architettura

### 3.1 La tabella delle rotte è la sorgente unica

`src/i18n/rotte.ts`:

```ts
export const rotte = {
  home:        { it: '/',                   fr: '/fr' },
  piattaforma: { it: '/piattaforma',        fr: '/fr/plateforme' },
  soluzioni:   { it: '/soluzioni',          fr: '/fr/solutions' },
  clienti:     { it: '/clienti',            fr: '/fr/clients' },
  sicurezza:   { it: '/sicurezza',          fr: '/fr/securite' },
  risorse:     { it: '/risorse',            fr: '/fr/ressources' },
  azienda:     { it: '/azienda',            fr: '/fr/entreprise' },
  demo:        { it: '/demo',               fr: '/fr/demander-une-demo' },
  demoGrazie:  { it: '/demo/grazie',        fr: '/fr/demander-une-demo/merci' },
  privacy:     { it: '/legale/privacy',     fr: '/fr/legal/confidentialite' },
  cookie:      { it: '/legale/cookie',      fr: '/fr/legal/cookies' },
  noteLegali:  { it: '/legale/note-legali', fr: '/fr/legal/mentions-legales' },
} as const satisfies Record<string, Record<Lingua, string>>;
```

Da qui tre funzioni, e nient'altro tocca i percorsi a mano:

- `percorso(chiave, lingua)` per ogni `href` in navigazione, footer e CTA;
- `gemella(pathname)` per il cambio lingua e per gli hreflang;
- `linguaDi(pathname)` per il layout.

`gemella()` restituisce `undefined` quando la pagina corrente non ha
corrispondente: il selettore di lingua in quel caso punta alla home
dell'altra lingua invece di produrre un link rotto.

### 3.2 I dizionari, tipizzati

```
src/i18n/
  lingue.ts        codice, htmlLang, ogLocale, hreflang, locale Intl
  rotte.ts         la tabella di sopra
  tipi.ts          il tipo di ogni dizionario, dichiarato una volta
  index.ts         contenuti(lingua) -> dizionario
  it/  comune.ts home.ts piattaforma.ts soluzioni.ts clienti.ts
       sicurezza.ts risorse.ts azienda.ts demo.ts legale/*.ts
  fr/  stessi file, stesse chiavi
```

Ogni modulo chiude con `satisfies ContenutiPiattaforma`. Una chiave che
manca in francese, o una che avanza, **non compila**: `astro check` è già
nello script di build, quindi la rete di sicurezza esiste il giorno zero e
non va costruita.

### 3.2-bis Dove il markup **è** il contenuto

La regola «markup scritto una volta sola» vale per le pagine costruite a
componenti. Non vale per la prosa: pagine legali e guide hanno il contenuto
*dentro* il markup (liste, grassetti, tabelle, rimandi), e le due lingue non
hanno nemmeno le stesse sezioni, perché cambiano l'autorità di controllo
citata e quale versione fa fede. Lì ogni lingua ha il suo file, e il layout
mette a fattor comune solo la cornice.

### 3.3 Le pagine diventano gusci

Il markup resta scritto una volta sola. Il corpo di ogni pagina si sposta in
`src/views/<Pagina>.astro`, che riceve `lingua` e legge il dizionario:

```
src/views/Piattaforma.astro        il markup, una volta
src/pages/piattaforma.astro        <Piattaforma lingua="it" />
src/pages/fr/plateforme.astro      <Piattaforma lingua="fr" />
```

**Scartata** l'alternativa a rotta dinamica (`[...percorso].astro` con
`getStaticPaths`): con `build.format: 'file'` e il prefisso presente in una
lingua sola diventa illeggibile, e i file di pagina espliciti si trovano con
un grep.

**Nota sul formato di build.** Con `format: 'file'` la home francese va
scritta come `src/pages/fr.astro` (emette `fr.html`, servito su `/fr`) e le
sottopagine sotto `src/pages/fr/`. È lo stesso schema che il sito usa già per
`demo.astro` più la cartella `demo/`.

### 3.4 SEO

- `BaseLayout` prende `lingua`, imposta `<html lang>` e passa tutto sotto.
- `Seo.astro` calcola gli alternate da `gemella(pathname)` ed emette:
  `hreflang="it-IT"`, `hreflang="fr-FR"`, `hreflang="x-default"` sull'italiano.
  Le rotte dinamiche (guide) passano gli alternate come prop.
- **Ogni pagina dichiara anche sé stessa** fra gli alternate. Un hreflang
  senza autoriferimento, o non ricambiato dalla pagina gemella, Google lo
  ignora in blocco: si perde il beneficio senza accorgersene.
- **Il canonical della pagina francese punta alla pagina francese.** È
  l'errore classico del multilingua: canonicalizzare il francese
  sull'italiano cancella dall'indice tutto ciò che stiamo costruendo.
  Il canonical oggi si calcola dal pathname corrente, quindi funziona già:
  va solo evitato di passare l'override `canonical` a mano.
- `og:locale` per lingua, `og:locale:alternate` per l'altra.
- JSON-LD: `inLanguage` per lingua; `Organization` mantiene lo **stesso**
  `@id` in entrambe le lingue (è la stessa entità), cambia solo la
  descrizione; `areaServed` diventa l'unione dei paesi serviti.
- Sitemap: **va tolto** il blocco `i18n` che l'integrazione ha oggi
  (`locales: { it: 'it-IT' }`), perché assume che le lingue condividano lo
  slug. Verificato nel sorgente di `@astrojs/sitemap` 3.7.3: `parseI18nUrl`
  spezza l'URL sul prefisso di lingua e raggruppa per il percorso residuo,
  quindi `/piattaforma` e `/fr/plateforme` non si incontrerebbero mai e non
  uscirebbe alcun alternate. Gli alternate si iniettano invece in
  `serialize()` valorizzando `item.links` dalla tabella delle rotte:
  sempre da sorgente, `serialize` riceve e riscrive `links` e il namespace
  `xhtml` è attivo di default.
- Nella stessa `serialize()` le priorità oggi sono scritte su percorsi
  italiani letterali (`['/piattaforma', '/soluzioni', '/demo']`,
  `path.startsWith('/legale/')`). Vanno riscritte sulle chiavi di rotta,
  altrimenti le pagine francesi finiscono tutte a 0.7 e le legali francesi
  pesano più delle italiane.
- `robots.txt` invariato, un solo indice di sitemap.
- Search Console non va toccata: la proprietà è di tipo **Dominio**, quindi
  `/fr/` ci rientra da sola. Si ripresenta solo la sitemap.
- I link nel corpo delle pagine italiane restano italiani. L'unico ponte fra
  le lingue è il selettore, che è un link annotato con `hreflang`.
- `llms.txt`: generatore parametrico per lingua, italiano su `/llms.txt` e
  francese su `/fr/llms.txt`, ciascuno che cita l'altro.

Nell'`astro.config.mjs` si aggiunge il blocco `i18n` con
`defaultLocale: 'it'`, `locales: ['it', 'fr']`,
`routing: { prefixDefaultLocale: false }`. Serve solo per `Astro.currentLocale`
e per la coerenza dichiarativa. **Niente `fallback`**: genererebbe pagine
francesi con dentro l'italiano, che è esattamente il contenuto che gli
hreflang promettono di non essere.

### 3.5 Selettore di lingua

Componente `SelettoreLingua.astro` in due punti: barra desktop e pannello
mobile. Link testuale `IT / FR` con `hreflang` e `lang` sull'ancora.
**Nessun redirect automatico** su `Accept-Language`: rompe la scansione dei
crawler e sposta le persone contro la loro volontà. Facoltativo, in coda:
una riga discreta che a chi ha il browser in francese propone la versione
francese, con la scelta ricordata in `localStorage`.

### 3.6 Le guide

**Due collection separate, non una sola con la lingua dentro l'id.**

```ts
const guideIt = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guide/it' }),
  schema: guidaSchema,
});
const guideFr = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guide/fr' }),
  schema: guidaSchema,
});
```

Il motivo è verificato nel sorgente del glob loader di Astro: l'id di una
voce nasce dal percorso **relativo alla `base`**. Con una collection unica e
pattern `**/*.md` l'id diventerebbe `it/memoria-agenzia-assicurativa`, e
`/risorse/${g.id}` produrrebbe `/risorse/it/memoria-agenzia-assicurativa`.
Sarebbe la rottura di due URL già indicizzati, causata da una cartella.
Con la `base` che punta dentro la cartella di lingua gli id italiani restano
**identici a oggi**, carattere per carattere, e il file italiano si sposta
soltanto di cartella.

Frontmatter con una chiave `gemella` che lega le due versioni per gli
hreflang.

**Vincolo assoluto**: gli URL italiani non cambiano. `/risorse/<slug>` resta
identico. Il sito è indicizzato dal 21 agosto e quell'autorità non si butta
via per una riorganizzazione di cartelle.

### 3.7 Modulo demo

Il form va a Web3Forms. Per lingua cambiano `subject`, `from_name` e
`redirect`, e si aggiunge un campo nascosto `lingua` così che una richiesta
francese si riconosca in casella. Le stringhe dello script client
(validazione, errori, «Invio in corso») passano dal markup allo script via
attributi `data-*` sul form.

---

## 4. Le rotte francesi

| Chiave | Italiano | Francese |
|---|---|---|
| home | `/` | `/fr` |
| piattaforma | `/piattaforma` | `/fr/plateforme` |
| soluzioni | `/soluzioni` | `/fr/solutions` |
| clienti | `/clienti` | `/fr/clients` |
| sicurezza | `/sicurezza` | `/fr/securite` |
| risorse | `/risorse` | `/fr/ressources` |
| guida | `/risorse/<slug>` | `/fr/ressources/<slug-fr>` |
| azienda | `/azienda` | `/fr/entreprise` |
| demo | `/demo` | `/fr/demander-une-demo` |
| grazie | `/demo/grazie` | `/fr/demander-une-demo/merci` |
| privacy | `/legale/privacy` | `/fr/legal/confidentialite` |
| cookie | `/legale/cookie` | `/fr/legal/cookies` |
| note legali | `/legale/note-legali` | `/fr/legal/mentions-legales` |
| 404 | `/404` | `/fr/404` |
| llms | `/llms.txt` | `/fr/llms.txt` |

Gli slug senza accenti nell'URL (`securite`, non `sécurité`): è la prassi
francese ed evita la codifica percentuale nei link condivisi.

---

## 5. Glossario di dominio

Prima di scrivere una riga di francese si fissa `website/glossario-fr.md`.
Non è pedanteria: è ciò che separa un sito credibile da uno tradotto.

| Italiano | Francese |
|---|---|
| set informativo | documentation précontractuelle |
| DIP | IPID (document d'information sur le produit d'assurance) |
| DIP Aggiuntivo | document d'information complémentaire |
| Condizioni di Assicurazione | conditions générales |
| polizza | contrat, police |
| preventivo | devis |
| garanzia | garantie |
| massimale | plafond de garantie |
| franchigia | franchise |
| scoperto | découvert |
| sinistro | sinistre |
| ramo | branche |
| agenzia, agente | agence, agent général |
| broker | courtier |
| intermediario | intermédiaire d'assurance |
| capitolato | cahier des charges |
| tutela legale | protection juridique |
| RC Professionale | RC Professionnelle |
| IVASS | ORIAS (registro), ACPR (vigilanza), FSMA in Belgio |
| Garante privacy | CNIL in Francia, APD in Belgio, CNPD in Lussemburgo |

---

## 6. Fasi

### ✅ Fase 0 - Impianto, senza una parola di francese - **fatta** (05/09/2026)

Tabella delle rotte, dizionari italiani, viste, layout e SEO consapevoli
della lingua, selettore di lingua, sitemap con hreflang, `llms.txt`
parametrico.

**Com'è andato il collaudo.** Build prima, build dopo, confronto. Il `diff -r`
grezzo è inservibile: spostando il markup da `pages/` a `views/` cambiano gli
identificatori di scope degli stili di Astro, e con loro ogni hash di file.
Confrontando al netto di quel rumore:

- **stili: zero differenze**, a meno dell'ordine dei blocchi in linea, che
  dipende dall'ordine di import e a parità di specificità non sposta nulla;
- **markup: quattro pagine identiche a meno della spaziatura** (una frase
  indentata nel sorgente e la stessa presa da una variabile arrivano con
  spazi diversi ai bordi del paragrafo), e la pagina demo diversa solo per
  gli attributi `data-*` nuovi e il campo `lingua`;
- URL, titoli, description, canonical, sitemap e `llms.txt`: **invariati**.

Il confronto ha trovato una regressione vera, poi corretta: nel rifare la
mappatura delle guide era sparito l'`id` dalle schede di `/risorse`, cioè
l'ancora di ogni card. È esattamente il motivo per cui il criterio di uscita
è un confronto meccanico e non un'occhiata alle pagine.

**Due decisioni prese lavorando**, entrambe registrate qui sopra:

1. la prosa (legali e guide) resta markup per lingua, §3.2-bis;
2. l'indice delle guide arriva alla vista come prop dal guscio di pagina, e
   non viene letto dentro la vista: così una lingua senza guide non può
   finire per mostrare quelle di un'altra.

**Cosa rende inerte l'impianto finché il francese non c'è.** Un solo
interruttore, `LINGUE_ATTIVE` in `src/config/rotte.mjs`. Con la sola lingua
italiana non esce un hreflang, il selettore di lingua non compare e la
sitemap resta quella di prima. Acceso il francese, tutto si attiva insieme.
Provato per davvero: accendendolo con due sole pagine francesi di prova
escono hreflang reciproci e con autoriferimento su entrambi i lati, canonical
francese che punta a sé stesso, `<html lang="fr">`, `og:locale` francese con
alternato italiano, `xhtml:link` nella sitemap e priorità 0,9 sulla pagina
francese presa dalla chiave di rotta.

**La rete di sicurezza.** `scripts/verify.mjs` ora controlla anche gli
hreflang: alternate verso pagine inesistenti, alternate non ricambiati,
pagine che non nominano sé stesse. Nella prova con due sole pagine francesi
li ha segnalati tutti, uno per uno. La sitemap, dal canto suo, dichiara un
alternate solo verso percorsi che la build ha davvero prodotto.

**Il contratto per le fasi seguenti**: `LINGUE_ATTIVE` si tocca solo quando
il francese è completo, e `node scripts/verify.mjs` dopo la build è la prova
che lo è.

### ✅ Fase 1 - Glossario e posizionamento francese - **fatta** (05/09/2026)

In `glossario-fr.md`: il glossario di dominio, le regole di registro e le
tre decisioni di §8, chiuse sulla proposta predefinita. Si dà del «vous», lo
studio è un «cabinet» e non un'«agence», e la biblioteca di mercato non si
promette come già pronta.

### ✅ Fase 2 - Pagine commerciali - **fatta** (05/09/2026)

Dizionario francese completo in `src/i18n/fr/`, non solo le pagine
commerciali: il tipo `Contenuti` è derivato da quello italiano, quindi o ci
sono tutte le chiavi o non compila. Le pagine sono gusci come in italiano.

La tipografia francese (spazio unificatore prima di `:` `;` `!` `?` e dentro
i caporali) **non si scrive a mano**: `spazia()` attraversa il dizionario e
`spaziaHtml()` fa lo stesso sulla prosa resa dai layout. Scrivere U+00A0
dentro duecento stringhe sarebbe stato illeggibile e alla prima modifica
sarebbe tornato uno spazio normale.

### ✅ Fase 3 - Demo, ringraziamento, 404, endpoint - **fatta** (05/09/2026)

Modulo con le stringhe di validazione dal dizionario, campo `lingua` verso
Web3Forms, oggetto della mail in francese, `/fr/404` e `/fr/llms.txt`.

### ✅ Fase 4 - Legale - **scritta** (05/09/2026), ⚠️ **da rileggere**

Le tre pagine ci sono, come prosa per lingua. Rispetto all'italiano cambiano
l'autorità di controllo (CNIL, APD, CNPD), il riferimento normativo sui
cookie (art. 82 della loi Informatique et Libertés al posto dell'art. 122 del
Codice privacy), e una dichiarazione esplicita che la versione italiana fa
fede. Le mentions légales dicono anche, a scanso di equivoci, che Velia non è
un intermediario d'assicurazione e non è iscritta ad alcun registro.

**Non si pubblica finché non le rilegge chi ha scritto quelle italiane.**
Tradurre un'informativa non è un lavoro di copy.

### Fase 5 - Risorse e guide - ~1,5 giorni

Content collection multilingua, indice `/fr/ressources`, le due guide
riscritte in francese (~2.450 parole editoriali dense: qui l'adattamento
pesa più che altrove, perché gli esempi sono italiani).

### ⚠️ Fase 5-bis - I media della home sono in italiano

Emerso guardando la home francese negli screenshot, non previsto dal piano.

Il filmato `media/memoria-viva.mp4` è la composizione Remotion della
conversazione: mostra «Confronta 3 preventivi Unipol con la polizza auto del
cliente Rossi», massimali, franchigie e infortuni del conducente. **In
italiano.** È il primo blocco visivo sotto l'attacco della home francese, e
vanifica da solo il lavoro di adattamento: un courtier vede una pagina scritta
per lui e un prodotto che parla un'altra lingua.

Stessa cosa, meno vistosa perché sfocate, per le tre schermate delle
dimostrazioni (`demo-confronto.jpg`, `demo-tabella.jpg`, `demo-agenti.jpg`).

Serve un render francese della composizione da `velia-video/`: è lavoro di
Remotion, non di copy, e va messo in conto prima della messa online. Nel
frattempo l'alternativa è togliere il filmato dalla sola home francese.

### Fase 6 - Rifinitura e messa online - ~mezza giornata

Controllo impaginazione a 390, 820 e 1440 con `tools/screenshot-mobile.mjs`
e `tools/screenshot-desktop.mjs`: **il francese è mediamente il 15-20% più
lungo dell'italiano**, e i punti che si rompono per primi sono le voci di
navigazione, le etichette dei bottoni e i titoli su tre righe della home.
Poi `astro check`, controllo dei link interni, validazione hreflang
reciproci, immagine OG francese, sitemap ripresentata in Search Console.

**Totale: 7-8 giorni di lavoro.**

---

## 7. Fatto significa fatto

Una fase è chiusa quando:

- `npm run build` passa, `astro check` compreso;
- `node scripts/verify.mjs` non segnala errori (link, ancore, hreflang,
  sitemap);
- gli URL italiani sono invariati (confronto con la `dist/` precedente);
- ogni pagina francese ha il suo hreflang reciproco e il canonical giusto;
- il selettore di lingua non produce mai un 404, nemmeno sulle pagine senza
  gemella;
- niente trattini lunghi nei testi pubblicati, in nessuna delle due lingue;
- un commit per fase, messaggio in italiano.

---

## 8. Il nodo aperto, e va sciolto prima della Fase 2

**L'Archivio pubblico oggi contiene prodotti italiani.** In archivio ci
sono Zurich, Cattolica, Nobis, Allianz, AXA, Generali, Unipol, Focus: set
informativi del mercato italiano. La pagina italiana promette «il mercato
assicurativo italiano è già dentro» ed è vero. La stessa frase in francese,
rivolta a un courtier di Lione, è falsa.

Tre strade, in ordine di preferenza:

1. **Guidare con il resto.** In francese la promessa d'ingresso diventa
   l'archivio dell'agenzia, il metodo e la memoria; l'archivio pubblico si
   presenta come qualcosa che si costruisce sul mercato del cliente. È
   onesto, è già vero, e non richiede lavoro di ingestion prima di andare
   online.
2. **Dichiarare la roadmap.** Si nomina l'archivio pubblico dicendo che il
   mercato francese è in caricamento. Credibile solo con una data.
3. **Caricare prima.** Un primo lotto di IPID e conditions générales
   francesi con `/procura-set` e `/ingest-visivo` prima della pubblicazione.
   È la versione più forte e la più cara: va decisa come progetto a sé.

Decisione predefinita se non arrivano indicazioni diverse: **la prima**.

Altre due cose da decidere nella stessa seduta:

- **I nomi nella tabella dimostrativa della home.** Oggi mostra «Active
  Veicoli AUTOPIÙ» e «Preventivo Unipol». In francese non si mettono nomi
  di compagnie francesi vere in un confronto inventato: si usano etichette
  neutre («contrat en cours», «devis concurrent»).
- **Chi è il titolare in Francia.** Le note legali francesi citano Blusail
  Technologies S.r.l.s. come oggi, o serve un riferimento locale. Cambia il
  testo legale e i dati strutturati.

---

## 9. Rischi

| Rischio | Peso | Cosa facciamo |
|---|---|---|
| Promessa di prodotto non vera in Francia | alto | §8, deciso prima della Fase 2 |
| Testo legale tradotto senza rilettura | alto | la Fase 4 non si pubblica da sola |
| URL italiani che cambiano riorganizzando le guide | alto | due collection con `base` dentro la cartella di lingua (§3.6), più confronto `dist/` a ogni fase |
| hreflang non reciproci o senza autoriferimento | medio | generati tutti dalla stessa tabella, mai a mano; controllo in Fase 6 |
| Traduzioni che invecchiano rispetto all'italiano | medio | i tipi bloccano le chiavi mancanti, non quelle stantie: ogni modifica di copy si fa nelle due lingue nello stesso commit |
| Impaginazione rotta dal francese più lungo | medio | Fase 6, con gli screenshot |
| 404 francese su Cloudflare Pages | basso | Pages dovrebbe servire il `404.html` più vicino risalendo le cartelle: **da verificare in collaudo**; se non lo fa, la 404 unica diventa bilingue |
| Doppio costo di manutenzione da qui in avanti | certo | è il prezzo del multilingua, va messo in conto adesso |

---

## 9-bis. Lo stato intermedio, e perché è sicuro

Fra «il francese esiste nel codice» e «il francese è online» c'è un tratto in
cui le pagine sono costruite ma non pronte. Quel tratto è reso sicuro da un
solo interruttore, `LINGUE_ATTIVE` in `src/config/rotte.mjs`. Finché il
francese non è dentro quell'array:

- ogni pagina francese esce con `noindex, nofollow`;
- nessuna pagina francese entra nella sitemap;
- non si emette un solo hreflang, in nessuna delle due lingue;
- il selettore di lingua non compare sulle pagine italiane.

Si possono quindi guardare, rivedere e correggere senza che finiscano in
Google a metà. Le pagine francesi mostrano un ritorno all'italiano nel
selettore, il che è utile a chi le sta rivedendo e innocuo per gli altri:
ci si arriva solo digitando l'URL.

Acceso l'interruttore, si attiva tutto insieme. La prova che si possa
accendere è `node scripts/verify.mjs` senza errori dopo la build.

## 10. Passo successivo

Fase 0. Non produce nulla di visibile e vale metà del lavoro: quando i
dizionari italiani esistono e le pagine sono gusci, aggiungere una terza
lingua costa solo la traduzione.
