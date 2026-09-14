import { DestroyRef, Injectable, inject, signal } from '@angular/core';

import { RICOMINCIA } from './ricomincia';

const CHIAVE = 'velia.token';
const CHIAVE_OSPITE = 'velia.ospite';

interface TokenSalvati {
  accesso: string;
  aggiornamento: string;
}

/**
 * I token della sessione, e nient'altro: chi è l'utente lo dice
 * `SessioneStore`, qui vive solo la credenziale tecnica.
 *
 * Persistiti in `localStorage` perché un ricaricamento della pagina non
 * deve buttare fuori l'utente. Se non ci sono token l'applicazione
 * funziona comunque dove il server non li pretende — è il caso del mock e
 * della demo self-contained, che non hanno autenticazione.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly stato = signal<TokenSalvati | undefined>(leggi());

  /**
   * Il token del link di una chat cliente (07/09/2026).
   *
   * Sta in `sessionStorage` e non in `localStorage`, cioè **vive in una
   * scheda sola**, per una ragione pratica: chi in agenzia apre il link di
   * un cliente per controllare come si vede non deve trovarsi buttato fuori
   * dalla propria sessione, né ritrovarsi ospite di sé stesso in tutte le
   * altre schede. Chiusa quella scheda, la credenziale sparisce.
   *
   * Non ha rinnovo perché non è un token che scade: è il segreto del link,
   * e vale finché l'agenzia lo lascia valere.
   */
  private readonly ospite = signal<string | undefined>(leggiOspite());

  readonly tokenAccesso = () => this.stato()?.accesso;
  readonly tokenAggiornamento = () => this.stato()?.aggiornamento;
  readonly tokenOspite = () => this.ospite();

  constructor() {
    /*
     * Un'altra scheda ha toccato la sessione (14/09/2026).
     *
     * Se è lo stesso utente che ha rinnovato, si prendono i token nuovi: il
     * rinnovo di Supabase ruota il token di aggiornamento, e quello tenuto
     * qui non varrebbe più. Se invece è uscito, o è entrato qualcun altro,
     * questa scheda ha ancora a schermo e in memoria i dati di prima: si
     * riparte da una pagina nuova, come dopo un accesso.
     *
     * La scheda di una chat cliente non si tocca: la sua credenziale è il
     * link, e la sessione dell'agenzia non la riguarda.
     */
    const ricomincia = inject(RICOMINCIA);
    const ascolta = (evento: StorageEvent): void => {
      /* `key` nullo: in un'altra scheda qualcuno ha svuotato lo storage. */
      if (evento.key !== CHIAVE && evento.key !== null) return;
      if (this.ospite()) return;

      const nuovi = leggi();
      if (utenteDel(nuovi?.accesso) === utenteDel(this.stato()?.accesso)) {
        this.stato.set(nuovi);
        return;
      }
      ricomincia('/');
    };
    window.addEventListener('storage', ascolta);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', ascolta));
  }

  impostaOspite(token: string): void {
    this.ospite.set(token);
    try {
      sessionStorage.setItem(CHIAVE_OSPITE, token);
    } catch {
      /* come sopra: la sessione vive comunque in memoria */
    }
  }

  pulisciOspite(): void {
    this.ospite.set(undefined);
    try {
      sessionStorage.removeItem(CHIAVE_OSPITE);
    } catch {
      /* come sopra */
    }
  }

  imposta(accesso: string, aggiornamento: string): void {
    const valore: TokenSalvati = { accesso, aggiornamento };
    this.stato.set(valore);
    try {
      localStorage.setItem(CHIAVE, JSON.stringify(valore));
    } catch {
      /* storage pieno o negato: la sessione vive comunque in memoria */
    }
  }

  pulisci(): void {
    this.stato.set(undefined);
    try {
      localStorage.removeItem(CHIAVE);
    } catch {
      /* come sopra */
    }
  }
}

/**
 * Il token dell'ospite, dall'archivio di scheda o **dall'indirizzo**.
 *
 * Leggerlo dall'URL qui, alla costruzione dello store, non è una comodità:
 * è l'unico momento abbastanza presto. L'applicazione chiede la sessione
 * appena si avvia, prima che il componente della chat cliente esista; senza
 * credenziale quella chiamata prende un 401, e il 401 porta alla porta
 * dell'agenzia — che è l'ultimo posto dove mandare un cliente.
 *
 * `/c/scaduto` è una pagina, non un token: si esclude per nome, e la
 * lunghezza minima scarta il resto.
 */
function leggiOspite(): string | undefined {
  try {
    const salvato = sessionStorage.getItem(CHIAVE_OSPITE);
    if (salvato) return salvato;

    const percorso = location.pathname.split('/').filter(Boolean);
    if (percorso[0] !== 'c' || !percorso[1] || percorso[1] === 'scaduto') return undefined;
    const token = decodeURIComponent(percorso[1]);
    if (token.length < 20) return undefined;
    sessionStorage.setItem(CHIAVE_OSPITE, token);
    return token;
  } catch {
    return undefined;
  }
}

function leggi(): TokenSalvati | undefined {
  try {
    const grezzo = localStorage.getItem(CHIAVE);
    if (!grezzo) return undefined;
    const valore = JSON.parse(grezzo) as TokenSalvati;
    return valore.accesso && valore.aggiornamento ? valore : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Di chi è il token d'accesso: il `sub` del JWT, letto e **non verificato**.
 * Qui serve solo a capire se la persona è cambiata; chi è davvero lo decide
 * il server, a ogni richiesta.
 */
function utenteDel(token: string | undefined): string | undefined {
  try {
    const carico = token?.split('.')[1];
    if (!carico) return undefined;
    const base64 = carico.replace(/-/g, '+').replace(/_/g, '/');
    const imbottito = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return (JSON.parse(atob(imbottito)) as { sub?: string }).sub;
  } catch {
    return undefined;
  }
}
