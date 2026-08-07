import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AccessoApi } from '@core/auth/accesso-api';
import { SessioneStore } from '@core/auth/sessione-store';
import { TokenStore } from '@core/auth/token-store';
import { ErroreApi } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { GrafoMemoria } from '@shared/ui/grafo-memoria/grafo-memoria';

/**
 * La schermata di accesso — l'unica rotta fuori dalla shell.
 *
 * Il piano FE aveva dichiarato l'autenticazione reale fuori perimetro; è
 * entrata come primo pezzo della Fase 1 del backend. Il patto di
 * `SessioneStore` regge: dopo il login si ricarica la sessione e il resto
 * dell'applicazione non sa nulla di token e credenziali.
 */
@Component({
  selector: 'app-accesso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Bottone, Campo, GrafoMemoria],
  templateUrl: './accesso.html',
  styleUrl: './accesso.scss',
})
export class Accesso {
  private readonly api = inject(AccessoApi);
  private readonly token = inject(TokenStore);
  private readonly sessione = inject(SessioneStore);
  private readonly router = inject(Router);

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
        this.sessione.ricarica();
        void this.router.navigateByUrl('/');
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
