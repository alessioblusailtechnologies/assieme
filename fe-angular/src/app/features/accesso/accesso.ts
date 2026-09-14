import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AccessoApi } from '@core/auth/accesso-api';
import { RICOMINCIA } from '@core/auth/ricomincia';
import { TokenStore } from '@core/auth/token-store';
import { ErroreApi } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Icona } from '@shared/ui/icona/icona';

/**
 * La schermata di accesso — l'unica rotta fuori dalla shell.
 *
 * Il piano FE aveva dichiarato l'autenticazione reale fuori perimetro; è
 * entrata come primo pezzo della Fase 1 del backend. Il patto di
 * `SessioneStore` regge: dopo il login l'applicazione riparte, la sessione
 * si carica col token nuovo e il resto non sa nulla di token e credenziali.
 */
@Component({
  selector: 'app-accesso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Bottone, Campo, Icona],
  templateUrl: './accesso.html',
  styleUrl: './accesso.scss',
})
export class Accesso {
  private readonly api = inject(AccessoApi);
  private readonly token = inject(TokenStore);
  private readonly ricomincia = inject(RICOMINCIA);

  readonly email = signal('');
  readonly password = signal('');
  readonly inCorso = signal(false);
  readonly errore = signal<string | undefined>(undefined);

  invia(): void {
    if (this.inCorso() || !this.email().trim() || !this.password()) return;
    this.inCorso.set(true);
    this.errore.set(undefined);

    this.api.accedi({ email: this.email().trim(), password: this.password() }).subscribe({
      next: (esito) => {
        this.token.imposta(esito.tokenAccesso, esito.tokenAggiornamento);
        /* Una pagina nuova e non una navigazione: la memoria di questa scheda
           può avere ancora i dati di chi è entrato prima, da qualunque porta
           sia uscito — «Esci», sessione scaduta, un'altra scheda. `inCorso`
           resta acceso: il pulsante non torna cliccabile mentre si riparte. */
        this.ricomincia('/');
      },
      error: (err: unknown) => {
        this.inCorso.set(false);
        this.errore.set(messaggioAccesso(err));
      },
    });
  }
}

function messaggioAccesso(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const api = err.error as ErroreApi | null;
    if (api?.codice === 'CREDENZIALI_NON_VALIDE') return 'Email o password non corretti.';
    if (api?.codice === 'UTENTE_SOSPESO')
      return 'Questo account è stato sospeso. Rivolgiti all’amministratore della tua agenzia.';
    if (err.status === 0) return 'Non riusciamo a raggiungere il server. Controlla la rete e riprova.';
  }
  return 'Non è stato possibile accedere. Riprova fra qualche istante.';
}
