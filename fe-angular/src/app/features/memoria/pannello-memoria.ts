import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import { Id, ModificheRicordo, Ricordo } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { EtichettaStato } from '@shared/ui/etichetta-stato/etichetta-stato';
import { GrafoMemoria } from '@shared/ui/grafo-memoria/grafo-memoria';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Suggerimento } from '@shared/ui/suggerimento/suggerimento';
import { Tag } from '@shared/ui/tag/tag';
import { MemoriaApi } from '@core/api/memoria-api';

import { CATEGORIE_RICORDO } from './categorie';
import { GloboMemoria } from './globo-memoria';

type FiltroAmbito = 'tutti' | Ricordo['ambito'];

type VistaMemoria = 'elenco' | 'globo';

const CHIAVE_VISTA = 'velia.memoria.vista';

/** La vista scelta si ricorda sul browser; senza storage si riparte dall'elenco. */
function leggiVista(): VistaMemoria {
  try {
    return localStorage.getItem(CHIAVE_VISTA) === 'globo' ? 'globo' : 'elenco';
  } catch {
    return 'elenco';
  }
}

/**
 * Il pannello della memoria (RF-G-03): ciò che il sistema ha imparato,
 * consultabile, modificabile e cancellabile ricordo per ricordo. È uno dei
 * tre pilastri del DNA d'Agenzia, e sta al primo livello proprio perché una
 * personalizzazione che non si vede non genera fiducia. Si apre con la scena
 * della memoria viva — il grafo del sito a tutta larghezza, su carta chiara,
 * con i numeri dei ricordi — e sotto l'elenco, a tutta larghezza anche lui.
 *
 * Due livelli (RF-G-02): la memoria dell'agenzia, condivisa, e quella
 * personale — il server mostra solo la propria. La memoria si alimenta
 * **solo imparando** (RF-G-01, registrazione esplicita rimossa su
 * indicazione del committente): qui la si governa — si corregge, si sospende,
 * si elimina. In caso di conflitto le istruzioni scritte prevalgono comunque
 * (RF-G-04), e la figura in testa lo dice.
 */
@Component({
  selector: 'app-pannello-memoria',
  imports: [
    Bottone,
    Briciole,
    Campo,
    DatePipe,
    EtichettaStato,
    GloboMemoria,
    GrafoMemoria,
    Icona,
    RouterLink,
    Scheletro,
    StatoVuoto,
    Suggerimento,
    Tag,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pannello-memoria.html',
  styleUrl: './pannello-memoria.scss',
})
export class PannelloMemoria {
  private readonly api = inject(MemoriaApi);

  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Memoria' },
  ];

  protected readonly categorie = CATEGORIE_RICORDO;

  private readonly risorsa = httpResource<Ricordo[]>(() => this.api.urlElenco());

  protected readonly ricordi = computed(() => (this.risorsa.hasValue() ? this.risorsa.value() : []));
  protected readonly inCaricamento = this.risorsa.isLoading;
  protected readonly errore = this.risorsa.error;

  protected riprova(): void {
    this.risorsa.reload();
  }

  // --- Le due viste: l'elenco che governa, il globo che mostra i legami ---

  protected readonly vista = signal<VistaMemoria>(leggiVista());

  private readonly ricordaVista = effect(() => {
    const vista = this.vista();
    try {
      localStorage.setItem(CHIAVE_VISTA, vista);
    } catch {
      /* senza storage la scelta vive quanto la pagina */
    }
  });

  // --- Filtri (a schermo, l'elenco è già tutto qui) -----------------------

  protected readonly filtroAmbito = signal<FiltroAmbito>('tutti');
  protected readonly ricerca = signal('');

  protected readonly filtrati = computed(() => {
    const ambito = this.filtroAmbito();
    const termine = this.ricerca().trim().toLowerCase();
    return this.ricordi().filter((r) => {
      if (ambito !== 'tutti' && r.ambito !== ambito) return false;
      if (termine && !r.testo.toLowerCase().includes(termine)) return false;
      return true;
    });
  });

  protected etichettaCategoria(categoria: Ricordo['categoria']): string {
    return this.categorie.find((c) => c.valore === categoria)?.etichetta ?? categoria;
  }

  // --- Modifica in linea (RF-G-03) ----------------------------------------

  protected readonly inModifica = signal<Id | undefined>(undefined);
  protected readonly testoBozza = signal('');

  protected avviaModifica(ricordo: Ricordo): void {
    this.inModifica.set(ricordo.id);
    this.testoBozza.set(ricordo.testo);
  }

  protected confermaModifica(ricordo: Ricordo): void {
    const testo = this.testoBozza().trim();
    this.inModifica.set(undefined);
    if (!testo || testo === ricordo.testo) return;
    this.applica(ricordo.id, { testo });
  }

  /** Due soli ambiti: lo spostamento è un'azione sola, non una tendina. */
  protected alternaAmbito(ricordo: Ricordo): void {
    this.applica(ricordo.id, { ambito: ricordo.ambito === 'tenant' ? 'personale' : 'tenant' });
  }

  /** Sospendere ferma il ricordo senza perderlo: la via reversibile. */
  protected alternaAttivo(ricordo: Ricordo): void {
    this.applica(ricordo.id, { attivo: !ricordo.attivo });
  }

  private applica(id: Id, modifiche: ModificheRicordo): void {
    this.api.modifica(id, modifiche).subscribe({ next: () => this.risorsa.reload() });
  }

  // --- Eliminazione (conferma a due passi, come ovunque) ------------------

  protected readonly confermaEliminazione = signal<Id | undefined>(undefined);

  protected elimina(ricordo: Ricordo): void {
    if (this.confermaEliminazione() !== ricordo.id) {
      this.confermaEliminazione.set(ricordo.id);
      return;
    }
    this.confermaEliminazione.set(undefined);
    this.api.elimina(ricordo.id).subscribe({ next: () => this.risorsa.reload() });
  }

}
