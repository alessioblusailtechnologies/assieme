import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ClientiApi, EtichettaCliente } from '@core/api/clienti-api';
import type { Cliente, ErroreApi, Paginato } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Tag } from '@shared/ui/tag/tag';

/**
 * I clienti dell'agenzia.
 *
 * La schermata fa due cose, e sono le due che si fanno davvero: **trovare**
 * qualcuno (per nome, per come compare sui documenti, per codice fiscale) e
 * **crearlo** quando non c'è. Tutto il resto — cosa ha, cosa gli si è
 * detto, quali chat sono aperte — sta nella sua scheda, che è un posto solo.
 *
 * La riga dice il nome e quanti documenti ha: il conteggio non è un
 * dettaglio, è il modo in cui si vede a colpo d'occhio chi è stato importato
 * male (zero documenti su un cliente vecchio vuol dire che qualcosa non ha
 * trovato il suo posto).
 */
@Component({
  selector: 'app-elenco-clienti',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Bottone,
    Briciole,
    Campo,
    FormsModule,
    Icona,
    RouterLink,
    Scheletro,
    Select,
    StatoVuoto,
    Tag,
  ],
  templateUrl: './elenco-clienti.html',
  styleUrl: './elenco-clienti.scss',
})
export class ElencoClienti {
  private readonly api = inject(ClientiApi);
  private readonly router = inject(Router);

  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Clienti' },
  ];

  // --- Ricerca e faccette ---------------------------------------------------

  protected readonly ricerca = signal('');
  protected readonly etichetta = signal<string | undefined>(undefined);
  protected readonly tipo = signal<'persona' | 'azienda' | undefined>(undefined);

  protected readonly tipi = [
    { valore: 'persona', etichetta: 'Persone' },
    { valore: 'azienda', etichetta: 'Aziende' },
  ];

  private readonly risorsa = httpResource<Paginato<Cliente>>(() =>
    this.api.url({
      q: this.ricerca(),
      ...(this.etichetta() && { etichetta: this.etichetta()! }),
      ...(this.tipo() && { tipo: this.tipo()! }),
    }),
  );

  private readonly risorsaEtichette = httpResource<EtichettaCliente[]>(() =>
    this.api.urlEtichette(),
  );

  protected readonly clienti = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value().elementi : [],
  );
  protected readonly totale = computed(() =>
    this.risorsa.hasValue() ? this.risorsa.value().totale : 0,
  );
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;
  protected readonly etichette = computed(() =>
    this.risorsaEtichette.hasValue() ? this.risorsaEtichette.value() : [],
  );

  protected readonly filtriAttivi = computed(
    () => Boolean(this.ricerca().trim() || this.etichetta() || this.tipo()),
  );

  protected azzeraFiltri(): void {
    this.ricerca.set('');
    this.etichetta.set(undefined);
    this.tipo.set(undefined);
  }

  // --- Creazione ------------------------------------------------------------

  protected readonly inCreazione = signal(false);
  protected readonly nuovoNome = signal('');
  protected readonly salvataggio = signal(false);
  /**
   * L'avviso sul quasi-doppione. Non è un errore da mostrare e basta: il
   * nome resta nel campo, perché «Rossi Mario Giuseppe» accanto a «Rossi
   * Mario» può essere legittimo e chi lo sta scrivendo lo sa.
   */
  protected readonly avviso = signal<string | undefined>(undefined);

  protected apriCreazione(): void {
    this.inCreazione.set(true);
    this.nuovoNome.set(this.ricerca().trim());
    this.avviso.set(undefined);
  }

  protected annullaCreazione(): void {
    this.inCreazione.set(false);
    this.nuovoNome.set('');
    this.avviso.set(undefined);
  }

  protected crea(): void {
    const nome = this.nuovoNome().trim();
    if (!nome || this.salvataggio()) return;
    this.salvataggio.set(true);
    this.avviso.set(undefined);
    this.api.crea({ nome }).subscribe({
      next: (cliente) => {
        this.salvataggio.set(false);
        this.annullaCreazione();
        /* Si entra subito nella sua scheda: chi crea un cliente lo fa per
           metterci qualcosa dentro, non per vederlo comparire in un elenco. */
        void this.router.navigate(['/clienti', cliente.id]);
      },
      error: (err: HttpErrorResponse) => {
        this.salvataggio.set(false);
        const api = err.error as ErroreApi | null;
        this.avviso.set(api?.messaggio ?? 'Non è stato possibile creare il cliente.');
      },
    });
  }

  protected riprova(): void {
    this.risorsa.reload();
  }
}
