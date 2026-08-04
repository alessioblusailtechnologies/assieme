import { iconOverrides, themeQuartz } from 'ag-grid-community';

/**
 * Tema AG Grid di ASSIEME.
 *
 * Da AG Grid v33 i file CSS dei temi sono deprecati: il tema si definisce in
 * codice e la griglia inietta il proprio CSS. Meglio così — significa che
 * questi valori possono venire dalla stessa fonte del resto del design invece
 * di vivere in un foglio di stile separato che si allontana col tempo.
 *
 * Usato dalla tabella di analisi (RF-C-11…C-14) e dagli elenchi documentali
 * densi. Importato **solo** dalle funzionalità che lo usano: AG Grid deve
 * restare fuori dal bundle iniziale.
 */

/*
 * I **colori** sono scritti per esteso e non come `var(--c-line)`: AG Grid ne
 * calcola dei derivati (contrasti, trasparenze) e su una `var()` non può
 * farlo. Il duplicato è voluto e va tenuto allineato a `_tokens.scss` — sono
 * una dozzina di valori, e sbagliarne uno si vede a colpo d'occhio.
 *
 * I **caratteri** invece passano dalle variabili CSS, perché lì non c'è nulla
 * da calcolare: AG Grid si limita a inoltrare il valore. Scriverli per
 * esteso — come facevo prima — significa che la griglia resta l'unica parte
 * dell'applicazione sorda a un cambio di tipografia. Difetto trovato
 * provando le accoppiate: tutto cambiava tranne la tabella.
 */
const t = {
  accento: '#2f4b7c',
  accentoSoft: '#e7edf7',
  linea: '#dde0e5',
  lineaSoft: '#eef0f3',
  superficie: '#ffffff',
  superficieTint: '#f5f8fc',
  testo: '#14181d',
  testoMeta: '#78818e',
  sans: 'var(--f-sans)',
  mono: 'var(--f-mono)',
};

/*
 * Le icone della griglia passano a Hugeicons come il resto dell'applicazione.
 * Sono poche e `iconOverrides` le sostituisce in blocco: è il caso in cui
 * allinearsi costa poco, al contrario delle icone interne di PrimeNG.
 *
 * `type: 'image'` con SVG in linea evita di caricare un font di icone in più.
 * Le sostituzioni vere si aggiungono in Fase 4, quando la griglia entra in
 * scena e si vede quali icone compaiono davvero.
 */
const iconeAssieme = iconOverrides({ type: 'image', mask: true, icons: {} });

export const assiemeGridTheme = themeQuartz
  .withPart(iconeAssieme)
  .withParams({
    /* ---------- Colore ---------- */
    accentColor: t.accento,
    backgroundColor: t.superficie,
    foregroundColor: t.testo,
    borderColor: t.linea,
    chromeBackgroundColor: t.superficie,

    /* ---------- Angoli: zero, come tutto il resto ---------- */
    borderRadius: 0,
    wrapperBorderRadius: 0,

    /* ---------- Tipografia ---------- */
    fontFamily: t.sans,
    fontSize: 14,

    /*
     * Intestazioni in mono maiuscolo: nel design è il segnale che distingue
     * un metadato dal contenuto. Vale nella tabella di confronto quanto nel
     * resto dell'interfaccia.
     */
    headerFontFamily: t.mono,
    headerFontSize: 11,
    headerFontWeight: 400,
    headerTextColor: t.testoMeta,
    headerBackgroundColor: t.superficie,

    /*
     * ---------- Righe ----------
     *
     * Niente `rowHeight` e `headerHeight` qui: sono decisioni della singola
     * griglia, non del tema. La tabella di analisi della Fase 4 avrà celle
     * con citazione e vorrà righe ben più alte di un elenco documentale, e
     * un valore piantato nel tema comune si trasformerebbe in un
     * `gridOptions` che lo contraddice — con il dubbio, ogni volta, su quale
     * dei due stia vincendo.
     */
    oddRowBackgroundColor: t.superficie,
    rowHoverColor: t.superficieTint,
    selectedRowBackgroundColor: t.accentoSoft,

    /*
     * Separatori di riga molto tenui e nessun bordo di colonna: nel design
     * la tabella di confronto è tenuta insieme dall'allineamento, non da una
     * griglia disegnata. Le linee verticali la farebbero sembrare un foglio
     * di calcolo, che è precisamente ciò che il prodotto non è.
     */
    rowBorder: { style: 'solid', width: 1, color: t.lineaSoft },
    columnBorder: false,
    headerColumnBorder: false,
    wrapperBorder: { style: 'solid', width: 1, color: t.linea },

    cellHorizontalPadding: 14,
  });
