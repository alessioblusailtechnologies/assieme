import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

/** La scelta dell'utente. `sistema` non è un colore: è una delega. */
export type Tema = 'sistema' | 'chiaro' | 'scuro';

/** Il tema che finisce davvero sullo schermo. */
export type TemaReso = 'chiaro' | 'scuro';

const CHIAVE = 'velia.tema';
const INTERROGAZIONE = '(prefers-color-scheme: dark)';

/**
 * Il colore che il browser dipinge attorno alla pagina — la barra degli
 * indirizzi su Android, la testata della schermata in Safari. Sono `--c-page`
 * dei due temi, scritti a mano perché a un `<meta>` non si può dare una
 * variabile CSS.
 */
const COLORE_BARRA: Record<TemaReso, string> = {
  chiaro: '#faf9f7',
  scuro: '#151412',
};

/**
 * Il tema dell'interfaccia.
 *
 * Tre scelte, non due: `chiaro`, `scuro` e `sistema` — che è quella
 * predefinita, e vuol dire «come il resto del computer». È la sola che
 * cambia da sola durante la sessione: chi ha il Mac impostato per passare
 * allo scuro al tramonto vede VELIA seguirlo senza toccare niente.
 *
 * Il resto dell'applicazione non interroga mai questo store. Tutto quello
 * che fa è posare `data-tema` sull'elemento radice: da lì in poi decidono i
 * token (`styles/_tokens.scss`), e nessun componente sa in che tema sta.
 *
 * La scelta vive in `localStorage` e non sul server: è una preferenza della
 * postazione, non dell'account — la stessa persona può volere lo scuro sul
 * portatile della sera e il chiaro sul monitor dell'ufficio.
 */
@Injectable({ providedIn: 'root' })
export class TemaStore {
  /** Cosa ha scelto l'utente. */
  readonly scelta = signal<Tema>(leggi());

  /** Cosa dice il sistema operativo, aggiornato mentre l'applicazione è aperta. */
  private readonly sistema = signal<TemaReso>('chiaro');

  /** Cosa si vede: la scelta, o la delega risolta. */
  readonly reso = computed<TemaReso>(() => {
    const scelta = this.scelta();
    return scelta === 'sistema' ? this.sistema() : scelta;
  });

  constructor() {
    const media =
      typeof window.matchMedia === 'function' ? window.matchMedia(INTERROGAZIONE) : undefined;

    if (media) {
      this.sistema.set(media.matches ? 'scuro' : 'chiaro');

      const ascolta = (evento: MediaQueryListEvent): void =>
        this.sistema.set(evento.matches ? 'scuro' : 'chiaro');
      media.addEventListener('change', ascolta);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', ascolta));
    }

    effect(() => this.applica(this.reso()));
  }

  /** La scelta esplicita: si ricorda. */
  imposta(tema: Tema): void {
    this.scelta.set(tema);
    try {
      localStorage.setItem(CHIAVE, tema);
    } catch {
      /* storage pieno o negato: il tema vale per questa sessione e basta */
    }
  }

  /**
   * L'interruttore della barra superiore: porta all'opposto di ciò che si
   * vede adesso. Da `sistema` si esce così — chi tocca l'interruttore ha
   * appena detto di volere quel colore, non più la delega.
   */
  alterna(): void {
    this.imposta(this.reso() === 'scuro' ? 'chiaro' : 'scuro');
  }

  private applica(tema: TemaReso): void {
    const radice = document.documentElement;

    /*
     * La transizione dura solo il cambio. Tenerla accesa sempre vorrebbe
     * dire far animare il colore di ogni elemento a ogni passaggio del
     * mouse: la classe si mette, si aspetta l'animazione, si toglie.
     */
    if (radice.dataset['tema'] && radice.dataset['tema'] !== tema) {
      radice.classList.add('tema-in-transito');
      window.setTimeout(() => radice.classList.remove('tema-in-transito'), 260);
    }

    radice.dataset['tema'] = tema;

    const barra = document.querySelector('meta[name="theme-color"]');
    barra?.setAttribute('content', COLORE_BARRA[tema]);
  }
}

function leggi(): Tema {
  try {
    const salvato = localStorage.getItem(CHIAVE);
    return salvato === 'chiaro' || salvato === 'scuro' || salvato === 'sistema'
      ? salvato
      : 'sistema';
  } catch {
    return 'sistema';
  }
}
