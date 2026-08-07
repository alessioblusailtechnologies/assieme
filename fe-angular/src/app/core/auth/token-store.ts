import { Injectable, signal } from '@angular/core';

const CHIAVE = 'assieme.token';

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

  readonly tokenAccesso = () => this.stato()?.accesso;
  readonly tokenAggiornamento = () => this.stato()?.aggiornamento;

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
