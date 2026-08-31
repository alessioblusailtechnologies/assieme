import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';

import { ConnessioneMcp, CredenzialeGenerata, CredenzialeMcp, Id } from '@core/models';
import { Badge } from '@shared/ui/badge/badge';
import { Avviso } from '@shared/ui/avviso/avviso';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { Icona } from '@shared/ui/icona/icona';
import { McpApi } from '@core/api/mcp-api';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { SessioneStore } from '@core/auth/sessione-store';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';

/**
 * Accesso MCP (RF-F-02, RF-F-04) — la superficie FE del Modulo F.
 *
 * Credenziali generabili e revocabili, con la regola dei token API: il
 * valore in chiaro compare **una volta sola**, alla generazione, e il
 * cassetto lo dice prima che sia troppo tardi. Sotto, lo stato delle
 * connessioni attive e le istruzioni di configurazione per i client.
 *
 * L'avvertenza di RF-F-05 sta accanto alle istruzioni: le risposte generate
 * nel client esterno non passano dalle istruzioni del tenant né dai vincoli
 * di citazione di VELIA — chi configura deve saperlo da subito.
 */
@Component({
  selector: 'app-accesso-mcp',
  imports: [Avviso, Badge, Bottone, Campo, Cassetto, DatePipe, Icona, Scheletro, StatoVuoto],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accesso-mcp.html',
  styleUrl: './accesso-mcp.scss',
})
export class AccessoMcp {
  private readonly api = inject(McpApi);
  private readonly sessione = inject(SessioneStore);

  protected readonly puoGestire = computed(() => this.sessione.puo('mcp.credenziali'));

  /* Le risorse partono solo con il permesso: il server resta l'ultima linea. */
  private readonly risorsa = httpResource<CredenzialeMcp[]>(() =>
    this.puoGestire() ? this.api.urlCredenziali() : undefined,
  );

  protected readonly credenziali = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value() : [],
  );
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;

  private readonly risorsaConnessioni = httpResource<ConnessioneMcp[]>(() =>
    this.puoGestire() ? this.api.urlConnessioni() : undefined,
  );

  protected readonly connessioni = computed(() =>
    this.risorsaConnessioni.hasValue() ? this.risorsaConnessioni.value() : [],
  );

  protected riprova(): void {
    this.risorsa.reload();
    this.risorsaConnessioni.reload();
  }

  protected nomeCredenziale(id: Id): string {
    return this.credenziali().find((c) => c.id === id)?.nome ?? id;
  }

  // --- Generazione (RF-F-02) ----------------------------------------------

  protected readonly cassettoGenera = signal(false);
  protected readonly bozzaNome = signal('');
  protected readonly inGenerazione = signal(false);
  /** La credenziale appena nata, col token in chiaro: esiste solo qui. */
  protected readonly generata = signal<CredenzialeGenerata | undefined>(undefined);
  protected readonly tokenCopiato = signal(false);

  protected apriGenera(): void {
    this.bozzaNome.set('');
    this.generata.set(undefined);
    this.tokenCopiato.set(false);
    this.cassettoGenera.set(true);
  }

  protected genera(): void {
    const nome = this.bozzaNome().trim();
    if (!nome || this.inGenerazione()) return;
    this.inGenerazione.set(true);
    this.api.genera(nome).subscribe({
      next: (credenziale) => {
        this.inGenerazione.set(false);
        this.generata.set(credenziale);
        this.risorsa.reload();
      },
      error: () => this.inGenerazione.set(false),
    });
  }

  protected copiaToken(): void {
    const token = this.generata()?.token;
    if (!token) return;
    void navigator.clipboard.writeText(token).then(() => {
      this.tokenCopiato.set(true);
      setTimeout(() => this.tokenCopiato.set(false), 2000);
    });
  }

  // --- Revoca (definitiva, conferma a due passi) --------------------------

  protected readonly confermaRevoca = signal<Id | undefined>(undefined);

  protected revoca(credenziale: CredenzialeMcp): void {
    if (this.confermaRevoca() !== credenziale.id) {
      this.confermaRevoca.set(credenziale.id);
      return;
    }
    this.confermaRevoca.set(undefined);
    this.api.revoca(credenziale.id).subscribe({
      next: () => {
        this.risorsa.reload();
        this.risorsaConnessioni.reload();
      },
    });
  }

  // --- Istruzioni di configurazione (RF-F-04) -----------------------------

  /** L'endpoint del server MCP di VELIA, come lo vedrà il client. */
  protected readonly endpointMcp = 'https://mcp.velia.it/v1';

  protected readonly esempioConfigurazione = `{
  "mcpServers": {
    "velia": {
      "url": "${'https://mcp.velia.it/v1'}",
      "headers": { "Authorization": "Bearer <il tuo token>" }
    }
  }
}`;

  protected readonly configCopiata = signal(false);

  protected copiaConfigurazione(): void {
    void navigator.clipboard.writeText(this.esempioConfigurazione).then(() => {
      this.configCopiata.set(true);
      setTimeout(() => this.configCopiata.set(false), 2000);
    });
  }
}
