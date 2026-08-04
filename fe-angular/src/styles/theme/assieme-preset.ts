import { definePreset } from '@primeuix/themes';
import Nora from '@primeuix/themes/nora';

/**
 * Preset PrimeNG di ASSIEME.
 *
 * Base: **Nora**. Dei quattro preset disponibili è quello di impostazione
 * enterprise — angoli quasi assenti, transizioni a zero, densità già da
 * applicativo gestionale. È il punto di partenza più vicino, e ogni token
 * che non dobbiamo sovrascrivere è un token che non dovremo mantenere.
 *
 * Regola: **tutto ciò che riguarda l'aspetto di PrimeNG si risolve qui.**
 * Il CSS in `_primeng-overrides.scss` è l'eccezione, non la norma.
 */

/*
 * Rampa dell'accento.
 *
 * Quattro valori vengono dal design originale e non si toccano: 100, 300,
 * 400 e 600. Gli altri sono interpolati per dare a PrimeNG la scala completa
 * che si aspetta — servono a stati di dettaglio (fondi tenui, bordi attivi)
 * che nel sito vetrina non esistevano perché non c'erano componenti
 * interattivi complessi.
 *
 * Va in `semantic.primary` e non in un livello primitivo nostro: il tipo
 * `Primitive` di PrimeNG non ammette chiavi arbitrarie, e passare per
 * `primary` è comunque il meccanismo previsto — i riferimenti diventano
 * `{primary.600}`, leggibili da chiunque conosca PrimeNG.
 */
const accento = {
  50: '#f2f5fa',
  100: '#e7edf7', // --c-accent-soft — fondo dei chip di citazione
  200: '#cdd9ea',
  300: '#9fb4d6', // --c-accent-hover
  400: '#7f97c4', // --c-accent-on-dark
  500: '#5a77a8',
  600: '#2f4b7c', // --c-accent — il blu ASSIEME
  700: '#263c63',
  800: '#1e3050',
  900: '#17243c',
  950: '#101a2b',
};

/*
 * Scala delle superfici, costruita sui grigi del design invece che sui
 * `slate`/`zinc` di Tailwind che Nora porta di serie. È la sostituzione che
 * più di ogni altra fa sembrare l'interfaccia ASSIEME e non PrimeNG: i grigi
 * del brand hanno una punta di blu che i grigi neutri non hanno.
 */
const superfici = {
  0: '#ffffff', // --c-surface
  50: '#fbfcfd', // --c-surface-soft
  100: '#f4f5f7', // --c-page
  200: '#eaecef', // --c-page-alt
  300: '#dde0e5', // --c-line
  400: '#c9cfd8', // --c-accent-hairline
  500: '#98a1ac', // --c-text-mute
  600: '#78818e', // --c-text-3
  700: '#3a424c', // --c-text-2
  800: '#22282f', // --c-ink-raise-2
  900: '#1b2027', // --c-ink-raise
  950: '#14181d', // --c-ink
};

export const AssiemePreset = definePreset(Nora, {
  primitive: {
    /*
     * Nel design originale non esiste un solo elemento arrotondato: è metà
     * del carattere del prodotto. Va azzerato qui, alla radice, altrimenti
     * riemerge componente per componente — Nora usa `border.radius.xs` come
     * default di campi, contenuti e overlay.
     */
    borderRadius: {
      none: '0',
      xs: '0',
      sm: '0',
      md: '0',
      lg: '0',
      xl: '0',
    },
  },

  semantic: {
    /*
     * 14px: la densità da strumento di lavoro. Coincide con `--t-body` e
     * con il default di Nora, quindi lo ripetiamo solo per renderlo esplicito
     * — è un valore che non deve cambiare per sbaglio.
     */
    typography: {
      fontFamily: 'var(--f-sans)',
      fontSize: '0.875rem',
      lineHeight: '1.5',
    },

    /* Nora azzera già le transizioni. Lo confermiamo: su un gestionale le
       animazioni dei componenti sono attrito, non finitura. */
    transitionDuration: '0s',

    primary: {
      ...accento,
      color: '{primary.600}',
      contrastColor: '#ffffff',
      hoverColor: '{primary.700}',
      activeColor: '{primary.800}',
    },

    surface: superfici,

    text: {
      color: '{surface.950}', // --c-text
      hoverColor: '{surface.950}',
      mutedColor: '{surface.600}', // --c-text-3
      hoverMutedColor: '{surface.700}',
    },

    /*
     * Selezione ed evidenziazione: fondo tenue e testo scuro, non blu pieno
     * con testo bianco. In una lista di documenti la riga selezionata deve
     * restare leggibile insieme alle altre, non gridare.
     */
    highlight: {
      background: '{primary.100}',
      focusBackground: '{primary.200}',
      color: '{primary.800}',
      focusColor: '{primary.900}',
    },

    focusRing: {
      width: '2px',
      style: 'solid',
      color: '{primary.color}',
      offset: '2px',
      shadow: 'none',
    },

    content: {
      borderRadius: '0',
      background: '{surface.0}',
      hoverBackground: '{surface.100}',
      borderColor: '{surface.300}', // --c-line
      color: '{text.color}',
      hoverColor: '{text.hover.color}',
    },

    /*
     * Campi. Nora borda con `surface.500` (#98a1ac): troppo pesante accanto
     * ai filetti da 1px del design. Scendiamo a `surface.300` (--c-line) e
     * scuriamo solo su focus, così un form denso resta calmo.
     */
    formField: {
      borderRadius: '0',
      paddingX: '0.625rem',
      paddingY: '0.375rem',
      background: '{surface.0}',
      borderColor: '{surface.300}',
      hoverBorderColor: '{surface.400}',
      focusBorderColor: '{primary.color}',
      invalidBorderColor: '#a63d2f', // --c-neg, il rosso del design
      color: '{text.color}',
      placeholderColor: '{surface.500}',
      filledBackground: '{surface.100}',
      shadow: 'none',
      focusRing: {
        width: '2px',
        style: 'solid',
        color: '{primary.color}',
        offset: '-1px',
        shadow: 'none',
      },
    },

    /*
     * Overlay senza ombre diffuse: il design costruisce la profondità con i
     * bordi, non con le sfocature. Un bordo netto tiene anche su fondo
     * chiaro, dove un'ombra tenue sparisce.
     */
    overlay: {
      select: {
        borderRadius: '0',
        shadow: 'none',
        background: '{surface.0}',
        borderColor: '{surface.300}',
        color: '{text.color}',
      },
      popover: {
        borderRadius: '0',
        padding: '0.75rem',
        shadow: 'none',
        background: '{surface.0}',
        borderColor: '{surface.300}',
        color: '{text.color}',
      },
      modal: {
        borderRadius: '0',
        padding: '1.25rem',
        shadow: '0 12px 32px -12px rgb(20 24 29 / 25%)',
        background: '{surface.0}',
        borderColor: '{surface.300}',
        color: '{text.color}',
      },
      navigation: {
        shadow: 'none',
      },
    },

    list: {
      option: {
        borderRadius: '0',
        padding: '0.375rem 0.625rem',
        focusBackground: '{surface.100}',
        selectedBackground: '{highlight.background}',
        selectedFocusBackground: '{highlight.focus.background}',
        color: '{text.color}',
        selectedColor: '{highlight.color}',
      },
    },

    navigation: {
      item: {
        borderRadius: '0',
        padding: '0.375rem 0.625rem',
        focusBackground: '{surface.100}',
        activeBackground: '{primary.100}',
        color: '{text.color}',
        focusColor: '{text.color}',
        activeColor: '{primary.800}',
      },
    },

    mask: {
      background: 'rgb(20 24 29 / 45%)', // --c-ink al 45%
      color: '{surface.200}',
    },
  },

  components: {
    /*
     * Il percorso di navigazione non è un componente a sé: è una riga di
     * metadati sopra il titolo. Senza fondo, senza spaziatura propria e con
     * il corpo più piccolo, si integra nella testata invece di sembrarci
     * appoggiato sopra.
     */
    breadcrumb: {
      root: {
        padding: '0',
        background: 'transparent',
        gap: '0.5rem',
      },
      item: {
        color: '{surface.600}',
        hoverColor: '{primary.color}',
        borderRadius: '0',
        label: {
          fontSize: '0.6875rem', // --t-mono
        },
      },
      separator: {
        color: '{surface.400}',
      },
    },

    button: {
      root: {
        borderRadius: '0',
        gap: '0.5rem',
        paddingX: '0.875rem',
        paddingY: '0.5rem',
        sm: { fontSize: '0.75rem', paddingX: '0.625rem', paddingY: '0.3125rem' },
        label: { fontWeight: '400' },
      },
    },
  },
});
