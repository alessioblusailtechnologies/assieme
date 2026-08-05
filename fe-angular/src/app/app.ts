import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { environment } from '@env';
import { Notifiche } from '@shared/ui/notifiche/notifiche';
import { PannelloSviluppo } from '@core/sviluppo/pannello-sviluppo';

/**
 * Radice dell'applicazione.
 *
 * Contiene solo ciò che vive sopra ogni schermata: l'uscita del router, le
 * notifiche e — fuori dalla produzione — il pannello di sviluppo. La
 * struttura visiva vera (barra laterale, barra superiore) è in `Shell`, che
 * è una rotta: così una futura pagina di accesso potrà stare fuori dalla
 * struttura senza dover smontare nulla.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Notifiche, PannelloSviluppo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly devTools = environment.devTools;
}
