import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { Icona } from '@shared/ui/icona/icona';
import { NomeIcona } from '@shared/ui/icona/registro-icone';
import { Tema, TemaReso, TemaStore } from '@core/tema/tema-store';

interface Opzione {
  valore: Tema;
  nome: string;
  spiega: string;
  icona: NomeIcona;
  /** I temi che la miniatura mostra: uno, o due tagliati in diagonale. */
  lati: TemaReso[];
}

const OPZIONI: Opzione[] = [
  {
    valore: 'sistema',
    nome: 'Come il sistema',
    spiega: 'Segue la modalità del computer, anche quando cambia da sola nell’arco della giornata.',
    icona: 'tema-sistema',
    lati: ['chiaro', 'scuro'],
  },
  {
    valore: 'chiaro',
    nome: 'Chiaro',
    spiega: 'Fondo avorio e superfici bianche. È l’aspetto di partenza di VELIA.',
    icona: 'tema-chiaro',
    lati: ['chiaro'],
  },
  {
    valore: 'scuro',
    nome: 'Scuro',
    spiega: 'Gli stessi colori letti al buio: comodo di sera e sui monitor molto luminosi.',
    icona: 'tema-scuro',
    lati: ['scuro'],
  },
];

/**
 * Aspetto: la scelta del tema.
 *
 * Tre schede con la miniatura dell'interfaccia, non tre voci di menu: il
 * tema è una cosa che si vede, e farlo vedere prima di sceglierlo risparmia
 * il giro di prova ed errore.
 *
 * È l'unica sottosezione delle Impostazioni che non parla col server —
 * niente permessi, niente salvataggio, niente attesa: la preferenza è della
 * postazione e vive in `localStorage` (vedi `TemaStore`).
 */
@Component({
  selector: 'app-aspetto',
  imports: [Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './aspetto.html',
  styleUrl: './aspetto.scss',
})
export class Aspetto {
  protected readonly tema = inject(TemaStore);
  protected readonly opzioni = OPZIONI;
}
