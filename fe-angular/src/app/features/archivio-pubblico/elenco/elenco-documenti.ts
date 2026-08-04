import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColDef,
  ColumnAutoSizeModule,
  GridOptions,
  LocaleModule,
  Module,
  ValidationModule,
} from 'ag-grid-community';
import { Checkbox } from 'primeng/checkbox';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Paginator, PaginatorState } from 'primeng/paginator';
import { Select } from 'primeng/select';

import { ArchivioPubblicoStore } from '../archivio-pubblico-store';
import { Badge } from '@shared/ui/badge/badge';
import { Briciola, Briciole } from '@shared/ui/briciole/briciole';
import { CellaEdizione } from './celle/cella-edizione';
import { CellaPreferito, ParametriCellaPreferito } from './celle/cella-preferito';
import { CellaTipologia } from './celle/cella-tipologia';
import { CellaTitolo } from './celle/cella-titolo';
import { DocumentoPubblico } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { TIPOLOGIE_PUBBLICHE } from '@shared/testi/etichette';
import { assiemeGridTheme } from '@theme/ag-grid-theme';
import { environment } from '@env';

/**
 * Archivio Pubblico — elenco.
 *
 * RF-A-03: navigazione per compagnia, ramo e prodotto, e ricerca per parola
 * chiave su titolo e metadati. RF-A-05: in sola lettura per i tenant, e la
 * schermata lo dice invece di lasciarlo scoprire a chi cerca il pulsante di
 * caricamento.
 */
@Component({
  selector: 'app-elenco-documenti',
  imports: [
    AgGridAngular,
    Badge,
    Briciole,
    Checkbox,
    FormsModule,
    IconField,
    Icona,
    InputIcon,
    InputText,
    Paginator,
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
  protected readonly tema = assiemeGridTheme;

  protected readonly briciole: Briciola[] = [
    { etichetta: 'Archivi' },
    { etichetta: 'Pubblico' },
  ];

  /**
   * Moduli passati alla singola griglia invece che registrati globalmente.
   *
   * Da AG Grid v33 i moduli vanno dichiarati, e dichiararli qui li tiene nel
   * chunk pigro di questa funzionalità: il percorso di avvio
   * dell'applicazione non se ne accorge. Sono i pochi che servono davvero —
   * `AllCommunityModule` trascinerebbe filtri, editor e trascinamento che
   * questa schermata non usa.
   *
   * `ValidationModule` solo fuori produzione: è ciò che trasforma un
   * "modulo mancante" da griglia misteriosamente vuota in un messaggio che
   * dice quale modulo aggiungere.
   */
  protected readonly moduli: Module[] = [
    ClientSideRowModelModule,
    ColumnAutoSizeModule,
    CellStyleModule,
    LocaleModule,
    ...(environment.production ? [] : [ValidationModule]),
  ];

  protected readonly documenti = computed(
    () => this.store.documenti() as DocumentoPubblico[],
  );

  protected readonly opzioniGriglia: GridOptions<DocumentoPubblico> = {
    /* La griglia cresce con le righe invece di avere un'altezza fissa: con
       venti righe per pagina non serve scorrimento interno, e due barre di
       scorrimento annidate sono il modo più rapido per disorientare. */
    domLayout: 'autoHeight',
    rowHeight: 52,
    headerHeight: 40,
    animateRows: false,
    suppressCellFocus: true,
    localeText: { noRowsToShow: 'Nessun documento' },
  };

  protected readonly colonne: ColDef<DocumentoPubblico>[] = [
    {
      colId: 'preferito',
      headerName: '',
      cellRenderer: CellaPreferito,
      cellRendererParams: {
        alterna: (documento, preferito) => this.store.cambiaPreferito(documento, preferito),
      } satisfies ParametriCellaPreferito,
      width: 48,
      minWidth: 48,
      maxWidth: 48,
      resizable: false,
    },
    {
      colId: 'documento',
      headerName: 'Documento',
      cellRenderer: CellaTitolo,
      flex: 3,
      minWidth: 300,
    },
    {
      colId: 'compagnia',
      headerName: 'Compagnia',
      valueGetter: (p) => p.data?.compagnia.nome,
      flex: 2,
      minWidth: 170,
    },
    {
      colId: 'ramo',
      headerName: 'Ramo',
      valueGetter: (p) => p.data?.ramo.nome,
      flex: 2,
      minWidth: 150,
    },
    {
      colId: 'tipologia',
      headerName: 'Tipologia',
      cellRenderer: CellaTipologia,
      width: 150,
      minWidth: 130,
    },
    {
      colId: 'edizione',
      headerName: 'Edizione',
      cellRenderer: CellaEdizione,
      width: 200,
      minWidth: 180,
    },
    {
      colId: 'pagine',
      headerName: 'Pagine',
      valueGetter: (p) => p.data?.numeroPagine,
      width: 90,
      minWidth: 80,
      cellClass: 'cella-numerica',
    },
  ];

  protected readonly colonnaPredefinita: ColDef = {
    /*
     * Ordinamento disattivato di proposito.
     *
     * La paginazione è lato server: la griglia ha in mano solo la pagina
     * corrente, e ordinarla riordinerebbe venti righe su quarantotto
     * facendo credere all'utente di aver ordinato tutto l'archivio. Un
     * risultato sbagliato è peggio di una funzione assente. Tornerà quando
     * l'ordinamento sarà un parametro della richiesta.
     */
    sortable: false,
    resizable: true,
    suppressMovable: true,
  };

  protected readonly chiaveRiga = (p: { data: DocumentoPubblico }) => p.data.id;

  protected cambiaPagina(evento: PaginatorState): void {
    this.store.pagina.set((evento.page ?? 0) + 1);
  }
}
