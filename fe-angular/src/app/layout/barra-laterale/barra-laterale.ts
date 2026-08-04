import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonDirective } from 'primeng/button';

import { GruppoNavigazione, NAVIGAZIONE } from '../navigazione';
import { Icona } from '@shared/ui/icona/icona';
import { SessioneStore } from '@core/auth/sessione-store';

/**
 * Barra laterale di navigazione.
 *
 * Comprimibile: su un confronto fra polizze la larghezza dello schermo è
 * spazio di lettura, e 232px recuperati si vedono. Da compressa restano le
 * sole icone, con il titolo nel `title` — è il motivo per cui il registro
 * delle icone usa nomi di dominio e non di disegno.
 */
@Component({
  selector: 'app-barra-laterale',
  imports: [ButtonDirective, Icona, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './barra-laterale.html',
  styleUrl: './barra-laterale.scss',
  host: {
    '[class.is-compressa]': 'compressa()',
  },
})
export class BarraLaterale {
  private readonly sessione = inject(SessioneStore);

  readonly compressa = model(false);

  /**
   * Le voci senza permesso sono per tutti; quelle con permesso compaiono
   * solo a chi ce l'ha. Filtriamo qui e non nel template perché un gruppo
   * rimasto senza voci non deve lasciare in pagina la propria intestazione.
   */
  readonly gruppi = computed<GruppoNavigazione[]>(() =>
    NAVIGAZIONE.map((g) => ({
      ...g,
      voci: g.voci.filter((v) => !v.permesso || this.sessione.puo(v.permesso)),
    })).filter((g) => g.voci.length > 0),
  );
}
