import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { formatDate } from '@angular/common';
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
import { Breadcrumb } from 'primeng/breadcrumb';
import { ButtonDirective } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { MenuItem } from 'primeng/api';
import { Paginator, PaginatorState } from 'primeng/paginator';
import { Select } from 'primeng/select';

import { ArchivioPubblicoStore } from '../archivio-pubblico-store';
import { CellaAzione } from './celle/cella-azione';
import { CellaEdizione } from './celle/cella-edizione';
import { CellaTipologia } from './celle/cella-tipologia';
import { DocumentoPubblico } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { TIPOLOGIE_PUBBLICHE } from '@shared/testi/etichette';
import { assiemeGridTheme } from '@theme/ag-grid-theme';
import { environment } from '@env';

/**
 * Archivio Pubblico — elenco dei documenti.
 *
 * Una riga per documento: prodotto, compagnia, ramo, tipologia, edizione e
 * data di decorrenza, con l'azione per aprirne la scheda. La tipologia in
 * colonna è ciò che distingue le righe dello stesso prodotto — DIP, DIP
 * Aggiuntivo, Condizioni, Glossario — quindi il titolo per esteso non serve
 * e lascia spazio alle colonne che si confrontano davvero.
 *
 * RF-A-03: navigazione per compagnia, ramo e prodotto, e ricerca per parola
 * chiave su titolo e metadati. RF-A-05: in sola lettura per i tenant.
 */
@Component({
  selector: 'app-elenco-documenti',
  imports: [
    AgGridAngular,
    Breadcrumb,
    ButtonDirective,
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
  private readonly locale = inject(LOCALE_ID);

  protected readonly tipologie = TIPOLOGIE_PUBBLICHE;
  protected readonly tema = assiemeGridTheme;

  /**
   * Le etichette sono le stesse della barra laterale.
   *
   * Se la voce di menu dice "Archivio pubblico", il percorso deve dire
   * "Archivio pubblico": chiamare in due modi la stessa schermata è il tipo
   * di incoerenza che nessuno segnala e tutti notano.
   */
  protected readonly briciole: MenuItem[] = [
    { label: 'Home', routerLink: '/' },
    { label: 'Archivio pubblico', routerLink: '/archivio/pubblico' },
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

  protected readonly documenti = computed(() => this.store.documenti() as DocumentoPubblico[]);

  protected readonly opzioniGriglia: GridOptions<DocumentoPubblico> = {
    /*
     * Nessun `domLayout: 'autoHeight'`: la griglia prende l'altezza dal
     * contenitore, che a sua volta occupa lo spazio lasciato libero dalla
     * finestra.
     *
     * La differenza pratica sta nelle intestazioni e nella paginazione: con
     * l'altezza automatica scorreva la pagina intera, e a metà elenco non si
     * vedeva più a quale colonna appartenesse un valore né come cambiare
     * pagina. Ora scorrono solo le righe, mentre intestazioni, filtri e
     * paginazione restano fermi dove l'utente li ha lasciati.
     */
    rowHeight: 46,
    headerHeight: 40,
    animateRows: false,
    suppressCellFocus: true,
    localeText: { noRowsToShow: 'Nessun documento' },
  };

  protected readonly colonne: ColDef<DocumentoPubblico>[] = [
    {
      colId: 'prodotto',
      headerName: 'Prodotto',
      valueGetter: (p) => p.data?.prodotto,
      flex: 3,
      minWidth: 240,
      cellClass: 'cella-primaria',
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
      width: 160,
      minWidth: 140,
    },
    {
      colId: 'edizione',
      headerName: 'Edizione',
      cellRenderer: CellaEdizione,
      width: 200,
      minWidth: 180,
    },
    {
      colId: 'decorrenza',
      headerName: 'In vigore dal',
      /*
       * Data formattata nel `valueGetter` e non in un renderer: una cella di
       * solo testo non ha bisogno di un componente Angular, e venti
       * componenti in meno per pagina si sentono allo scorrimento.
       */
      valueGetter: (p) =>
        p.data ? formatDate(p.data.edizione.validaDal, 'dd/MM/yyyy', this.locale) : '',
      width: 130,
      minWidth: 120,
      cellClass: 'cella-numerica',
    },
    {
      colId: 'azione',
      headerName: '',
      cellRenderer: CellaAzione,
      width: 110,
      minWidth: 110,
      maxWidth: 110,
      resizable: false,
      /* Resta visibile anche scorrendo in orizzontale: l'azione della riga
         non deve essere la cosa che si perde per prima. */
      pinned: 'right',
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
