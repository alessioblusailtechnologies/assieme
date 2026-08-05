import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';

import { Badge } from '@shared/ui/badge/badge';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { Icona } from '@shared/ui/icona/icona';
import { Ruolo, Utente } from '@core/models';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import { SessioneStore } from '@core/auth/sessione-store';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';
import { UtentiApi } from '@core/api/utenti-api';

const RUOLI: { valore: Ruolo; etichetta: string }[] = [
  { valore: 'operatore', etichetta: 'Operatore' },
  { valore: 'amministratore', etichetta: 'Amministratore' },
];

/**
 * Gestione utenti del tenant (RF-D-01) — la prima schermata in cui i
 * permessi decidono tutto: senza `utenti.gestisci` non compare nemmeno la
 * voce di navigazione, e chi ci arriva per indirizzo trova la spiegazione,
 * non un errore.
 *
 * Nessuna eliminazione: un utente si sospende. Su sé stessi né ruolo né
 * stato — un amministratore che si declassa chiude la porta e butta la
 * chiave, e il server (mock compreso) lo rifiuta comunque.
 */
@Component({
  selector: 'app-utenti',
  imports: [Badge, Bottone, Campo, Cassetto, DatePipe, Icona, Scheletro, Select, StatoVuoto, Tag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './utenti.html',
  styleUrl: './utenti.scss',
})
export class Utenti {
  private readonly api = inject(UtentiApi);
  private readonly sessione = inject(SessioneStore);

  protected readonly ruoli = RUOLI;

  protected readonly puoGestire = computed(() => this.sessione.puo('utenti.gestisci'));
  protected readonly ioStesso = computed(() => this.sessione.utente()?.id);

  /* La risorsa parte solo con il permesso: senza, niente chiamata e niente
     403 nel pannello di rete — il server resta comunque l'ultima linea. */
  private readonly risorsa = httpResource<Utente[]>(() =>
    this.puoGestire() ? this.api.urlElenco() : undefined,
  );

  protected readonly utenti = computed(() => (this.risorsa.hasValue() ? this.risorsa.value() : []));
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;

  protected riprova(): void {
    this.risorsa.reload();
  }

  protected cambiaRuolo(utente: Utente, valore: unknown): void {
    const ruolo = valore as Ruolo;
    if (ruolo === utente.ruolo) return;
    this.api.cambiaRuolo(utente.id, ruolo).subscribe({ next: () => this.risorsa.reload() });
  }

  protected alternaStato(utente: Utente): void {
    const stato = utente.stato === 'sospeso' ? 'attivo' : 'sospeso';
    this.api.impostaStato(utente.id, stato).subscribe({ next: () => this.risorsa.reload() });
  }

  // --- Invito -------------------------------------------------------------

  protected readonly cassettoInvito = signal(false);
  protected readonly bozzaNome = signal('');
  protected readonly bozzaCognome = signal('');
  protected readonly bozzaEmail = signal('');
  protected readonly bozzaRuolo = signal<Ruolo>('operatore');
  protected readonly inInvito = signal(false);

  protected apriInvito(): void {
    this.bozzaNome.set('');
    this.bozzaCognome.set('');
    this.bozzaEmail.set('');
    this.bozzaRuolo.set('operatore');
    this.cassettoInvito.set(true);
  }

  protected readonly invitoValido = computed(
    () =>
      !!this.bozzaNome().trim() &&
      !!this.bozzaCognome().trim() &&
      /.+@.+\..+/.test(this.bozzaEmail().trim()),
  );

  protected invita(): void {
    if (!this.invitoValido() || this.inInvito()) return;
    this.inInvito.set(true);
    this.api
      .invita({
        nome: this.bozzaNome().trim(),
        cognome: this.bozzaCognome().trim(),
        email: this.bozzaEmail().trim(),
        ruolo: this.bozzaRuolo(),
      })
      .subscribe({
        next: () => {
          this.risorsa.reload();
          this.inInvito.set(false);
          this.cassettoInvito.set(false);
        },
        error: () => this.inInvito.set(false),
      });
  }
}
