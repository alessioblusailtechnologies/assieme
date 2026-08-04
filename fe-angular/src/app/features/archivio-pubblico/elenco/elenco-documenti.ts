import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Checkbox } from 'primeng/checkbox';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Paginator, PaginatorState } from 'primeng/paginator';
import { Select } from 'primeng/select';

import { ArchivioPubblicoStore } from '../archivio-pubblico-store';
import { Badge } from '@shared/ui/badge/badge';
import { Documento, DocumentoPubblico } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { TIPOLOGIE_PUBBLICHE, etichettaTipologiaBreve } from '@shared/testi/etichette';

/**
 * Archivio Pubblico — elenco.
 *
 * RF-A-03: navigazione per compagnia, ramo e prodotto, e ricerca per parola
 * chiave su titolo e metadati. RF-A-05: in sola lettura per i tenant, e la
 * schermata lo dice invece di lasciarlo scoprire a chi cerca il pulsante di
 * caricamento.
 *
 * La tabella è markup semantico, non AG Grid: qui servono una decina di
 * righe per pagina e nessuna interazione di cella. AG Grid entra in Fase 4
 * con le tabelle di analisi, dove virtualizzazione, colonne fissate e
 * renderer di cella si ripagano — e resta fuori dal bundle iniziale.
 */
@Component({
  selector: 'app-elenco-documenti',
  imports: [
    Badge,
    Checkbox,
    FormsModule,
    IconField,
    Icona,
    InputIcon,
    InputText,
    Paginator,
    RouterLink,
    Scheletro,
    Select,
    StatoVuoto,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-documenti.html',
  styleUrl: './elenco-documenti.scss',
})
export class ElencoDocumenti {
  protected readonly store = inject(ArchivioPubblicoStore);
  protected readonly tipologie = TIPOLOGIE_PUBBLICHE;
  protected readonly etichettaTipologia = etichettaTipologiaBreve;

  /**
   * Il contratto espone `Documento`, unione di pubblico e privato. Qui
   * l'archivio è pubblico per costruzione, ma il compilatore non lo sa: il
   * restringimento avviene una volta sola invece che in ogni riga del
   * template.
   */
  protected pubblico(d: Documento): DocumentoPubblico {
    return d as DocumentoPubblico;
  }

  protected cambiaPagina(evento: PaginatorState): void {
    this.store.pagina.set((evento.page ?? 0) + 1);
  }

  protected alternaPreferito(documento: Documento, evento: Event): void {
    evento.stopPropagation();
    evento.preventDefault();
    this.store.cambiaPreferito(documento, !this.pubblico(documento).preferito);
  }
}
