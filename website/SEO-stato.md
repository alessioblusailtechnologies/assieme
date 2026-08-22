# SEO di sonovelia.it: stato dell'arte

Aggiornato il 22 agosto 2026. Questo documento raccoglie cosa è stato
fatto, cosa è in corso e cosa resta da decidere per la visibilità del
sito nei motori di ricerca e negli assistenti AI. Si riprende da qui.

## In breve

- Il sito è **indicizzato da Google dal 21 agosto**: primo risultato per
  «sonovelia», sitemap letta (12 pagine, poi 14 con le guide).
- Gli strumenti sono tutti configurati: Google Search Console
  (proprietà Dominio, verifica via TXT), Bing Webmaster Tools (importato
  da Search Console), Cloudflare senza più interferenze sul robots.
- L'audit esterno del 21 agosto è stato ripulito: restano solo voci
  innocue (vedi sotto).
- La strategia di contenuto è partita: sezione guide in `/risorse`, due
  guide online, mappa di venti.
- Da decidere: Google Ads come ponte verso la coda lunga (vedi in fondo).

## Cosa è stato fatto nel codice

Tutto su `main`, in ordine:

| Commit | Cosa |
| --- | --- |
| `e3eba28` | `/sitemap.xml` alias dell'indice; `/llms.txt`; robots senza `Disallow: /404`; schema SoftwareApplication senza l'Offer senza prezzo; «Accedi» e «Stato del servizio» spariscono se `APP_URL`/`STATUS_URL` sono vuote |
| `2f445a2` | Titolo, descrizione e attacco della home usano «assicurazioni» (prima solo l'aggettivo); Organization e WebSite dichiarano `alternateName` «Sono Velia» e «Velia AI» |
| `0cd715e` | Content collection `guide`, layout `GuidaLayout` (schema Article, breadcrumb, «Altre guide»), rotta `/risorse/<slug>`, indice in `/risorse` dalla collection |
| `7340b13`, `072a19a` | Seconda guida (memoria); testata delle guide con la sola data di aggiornamento |
| `b7518c1` | Favicon: la V di Velia nelle PNG (erano ancora la A di Assieme), `favicon.ico` a 48px, link PNG 192 nel head |

### Come è fatta la parte SEO del sito

- `src/components/Seo.astro`: title, description, canonical (ripulito
  dall'`.html` di `build.format: 'file'`), robots meta, Open Graph,
  Twitter card, JSON-LD Organization + WebSite su ogni pagina, più gli
  schema passati dalla singola pagina (`schema` prop).
- Schema per pagina: SoftwareApplication (home), FAQPage (sicurezza),
  ContactPage (demo), BreadcrumbList (componente `Breadcrumbs`), Article
  (guide, in `GuidaLayout`).
- `src/pages/robots.txt.ts`, `sitemap.xml.ts`, `llms.txt.ts`: endpoint
  statici che seguono `SITE_URL`. La sitemap vera è
  `sitemap-index.xml` di `@astrojs/sitemap` (config in
  `astro.config.mjs`, con priorità per pagina e filtro della 404).
- `src/config/env.mjs`: `APP_URL` e `STATUS_URL` vuote finché
  `app.sonovelia.it` e `status.sonovelia.it` non esistono nel DNS.
  Quando esisteranno, valorizzarle e i link ricompaiono da soli.
- Favicon: `public/favicon.svg` (V su inchiostro), `favicon.ico`,
  `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, tutte rese da
  `velia-video/src/Favicon.tsx` (composizione `Favicon`, Still 1024) e
  ridimensionate con ffmpeg.

## Cosa è configurato fuori dal codice

- **Cloudflare** (dominio sonovelia.it): «Manage your robots.txt» su
  *Disable robots.txt configuration* (prima Cloudflare anteponeva il
  blocco Content Signals con direttive non standard e i Disallow per
  ClaudeBot, GPTBot, Google-Extended; l'audit lo segnava come errore e
  non leggeva più la riga Sitemap). «Block AI training bots» su *Do not
  block*: scelta deliberata, vogliamo essere letti e citati dagli
  assistenti AI, coerente con l'`llms.txt`.
- **Google Search Console**: proprietà Dominio `sonovelia.it`,
  verificata con record TXT nel DNS di Cloudflare (non rimuoverlo mai).
  Sitemap inviata (sia `sonovelia.it/sitemap-index.xml` sia con www).
  Indicizzazione richiesta per home, piattaforma, soluzioni, demo e per
  le due guide.
- **Bing Webmaster Tools**: importato da Search Console (copre anche
  DuckDuckGo, Ecosia, la ricerca di ChatGPT e Copilot).

## Le voci dell'audit rimaste, e perché non contano

- *Low word count* su `/demo/grazie`: è la pagina dopo l'invio del
  modulo, `noindex`, giusto che sia essenziale.
- *Low text-HTML ratio* sulla home: gli astratti SVG inline e il video.
  Scelta di design, nessun effetto sull'indicizzazione.
- Instagram «rotto» nei controlli dei link: risponde 429 ai bot, falso
  positivo.
- La favicon «A» nei risultati Google: risolta nel codice, ma il crawler
  delle favicon è lento, può restare giorni o una-due settimane.

## Cosa si sa delle ricerche (22 agosto)

- «sonovelia»: primo risultato, AI Overview che già riconosce «Sono
  Velia».
- «velia» e «velia assicurazioni»: la SERP è dominata dalla città antica
  (velia.it, Wikipedia, parco archeologico). Non c'è concorrenza
  assicurativa; è solo disambiguazione. Le modifiche di `2f445a2`
  (parola «assicurazioni», alternateName) più i segnali social dovrebbero
  portare la home in testa per «velia assicurazioni» in 1-3 mesi; «velia
  assicurazioni ai» in settimane.
- «assicurazioni ai»: i motori la leggono come «assicurazioni» generica,
  la pagina è di compagnie e comparatori (Generali, Prima, Facile.it).
  Non è una partita per un sito B2B nuovo, e chi la cerca vuole una
  polizza. La strada è la coda lunga.
- Coda lunga da presidiare (bassa concorrenza, intento perfetto): «AI
  per agenzie assicurative», «intelligenza artificiale agenzia
  assicurativa», «AI broker assicurativo», «software AI agenzia
  assicurativa», «confronto polizze AI», «chatgpt agenzia assicurativa».

## La strategia di contenuto: le guide

Decisioni prese: la sezione si chiama **Risorse** (non «Blog»), le
guide sono pagine evergreen senza cadenza obbligata, conta la data di
aggiornamento. Meglio cinque ottime che venti mediocri; se sono venti
ottime, tanto meglio. Ogni guida passa dalla revisione di Alessio (il
mestiere) prima del push, e diventa anche il post LinkedIn «di
sostanza» del martedì (`social/piano-editoriale.md`).

Come si aggiunge una guida: un file Markdown in
`src/content/guide/<slug>.md` con frontmatter `title`, `description`
(max 170 caratteri), `lead`, `filone` (AI in agenzia | Metodo |
Documenti | Glossario operativo), `published`, `updated`, `order`.
Finisce da sola nell'indice, nella sitemap e con lo schema Article.
Dopo il push: Search Console → Controllo URL → Richiedi indicizzazione
per la guida nuova e per `/risorse`.

Online:
1. `intelligenza-artificiale-agenzia-assicurativa` (AI in agenzia)
2. `memoria-agenzia-assicurativa` (AI in agenzia)

Mappa dei prossimi argomenti, per filone:

- **AI in agenzia**: AI e normativa (cosa può fare un'agenzia restando
  dentro le regole IVASS); come scegliere uno strumento AI per
  l'agenzia (le domande da fare al fornitore); gli agenti, il lavoro
  ricorrente che si fa da solo; l'AI e i dati del cliente, cosa chiedere
  sulla riservatezza.
- **Metodo**: confrontare un preventivo con la polizza in corso (già
  scritta, rimandata, da recuperare); mettere per iscritto le regole
  dell'agenzia; la tabella di analisi multi-prodotto, come si legge e
  come si presenta; il documento per il cliente, dalla risposta alla
  pagina impaginata.
- **Documenti**: leggere un set informativo in dieci minuti (DIP, DIP
  Aggiuntivo, Condizioni); dove stanno le esclusioni e perché si
  perdono; le nuove edizioni dei set informativi, come non perdersele.
- **Glossario operativo**: franchigia e scoperto; massimale per
  sinistro, per anno, per garanzia; claims made e retroattività; rivalsa;
  regola proporzionale; carenza; adeguatezza. Uno o due termini per
  guida, spiegati come al bancone, con gli errori che costano di più.

Ritmo sostenibile: due guide a settimana finché si regge la revisione,
poi una ogni due settimane.

## Da decidere: Google Ads

Valutato il 22 agosto. Gli annunci **non aiutano la SEO** (aste
separate, nessun effetto sull'organico). Possono avere senso **per le
demo**, come ponte di 30 giorni sulla coda lunga finché l'organico non
arriva: una sola campagna Search, keyword a frase (le query di coda
lunga sopra, più «chatgpt agenzia assicurativa»), negative rigorose
(assicurazione auto, preventivo, rc auto, polizza vita, lavoro, corso),
landing `/demo` con conversione tracciata sull'atterraggio in
`/demo/grazie`, 10-15 euro al giorno, solo Italia, solo orari d'ufficio,
niente campagne di marca. Criterio di successo da fissare prima (es.
tre richieste demo in 30 giorni). Prerequisiti lato sito: landing e
tracciamento della conversione. Decisione rimandata a dopo
l'indicizzazione delle guide.

## Cose da ricontrollare periodicamente

- Search Console → Pagine: quante indicizzate (atteso: tutte le
  pubbliche). Rendimento: le prime query e impressioni.
- La favicon nei risultati: deve diventare la V.
- Il titolo della home in SERP: deve diventare quello con
  «assicurazioni».
- «velia assicurazioni» e «velia assicurazioni ai»: posizione della home.
- Quando `app.` e `status.sonovelia.it` esistono: rimettere gli URL in
  `env.mjs`.
- Possibile automazione: IndexNow (Bing, Yandex e altri) chiamato dal
  deploy per avvisare delle pagine nuove; Google non lo supporta, lì
  resta la richiesta manuale in Search Console.
