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
import { CellaEdizione } from './celle/cella-edizione';
import { CellaEspansione, ParametriCellaEspansione } from './celle/cella-espansione';
import { CellaPreferito, ParametriCellaPreferito } from './celle/cella-preferito';
import { CellaProdotto } from './celle/cella-prodotto';
import { Icona } from '@shared/ui/icona/icona';
import {
  ALTEZZA_INTESTAZIONE_DOCUMENTI,
  ALTEZZA_RIGA_DOCUMENTO,
  RigaDocumenti,
} from './celle/riga-documenti';
import { RigaArchivio, idRiga } from './celle/riga-archivio';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { TIPOLOGIE_PUBBLICHE } from '@shared/testi/etichette';
import { assiemeGridTheme } from '@theme/ag-grid-theme';
import { environment } from '@env';

/** Altezza di una riga di prodotto. */
const ALTEZZA_PRODOTTO = 52;

/**
 * Archivio Pubblico — elenco per prodotto.
 *
 * RF-A-03 chiede la navigazione «per compagnia, ramo e **prodotto**»: la
 * griglia elenca prodotti, e ogni riga si apre sui documenti del suo set
 * informativo. Elencare i documenti uno per uno mostrerebbe quarantotto voci
 * dove l'intermediario ne ha in mente venti, ripetendo quattro volte
 * compagnia e ramo per dire ogni volta la stessa cosa.
 *
 * L'espansione è fatta con le **righe a tutta larghezza**, non col
 * master/detail: quello è AG Grid Enterprise, queste sono Community e
 * bastano. Vedi `riga-archivio.ts`.
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

  /**
   * Lista piatta: ogni prodotto, e subito dopo — se aperto — la riga con i
   * suoi documenti. La gerarchia sta qui, non nella griglia.
   */
  protected readonly righe = computed<RigaArchivio[]>(() =>
    this.store.prodotti().flatMap((prodotto) =>
      this.store.espanso(prodotto.id)
        ? [
            { tipo: 'prodotto' as const, prodotto },
            { tipo: 'documenti' as const, prodotto },
          ]
        : [{ tipo: 'prodotto' as const, prodotto }],
    ),
  );

  protected readonly opzioniGriglia: GridOptions<RigaArchivio> = {
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
    headerHeight: 40,
    animateRows: false,
    suppressCellFocus: true,
    localeText: { noRowsToShow: 'Nessun prodotto' },

    /* Le righe dei documenti non hanno colonne: occupano tutta la larghezza
       e il loro contenuto lo decide un componente nostro. */
    isFullWidthRow: (p) => p.rowNode.data?.tipo === 'documenti',
    fullWidthCellRenderer: RigaDocumenti,

    /* L'altezza della riga espansa dipende da quanti documenti mostra:
       calcolarla qui evita sia il taglio sia lo spazio vuoto in fondo. */
    getRowHeight: (p) =>
      p.data?.tipo === 'documenti'
        ? ALTEZZA_INTESTAZIONE_DOCUMENTI + p.data.prodotto.documenti.length * ALTEZZA_RIGA_DOCUMENTO
        : ALTEZZA_PRODOTTO,
  };

  protected readonly colonne: ColDef<RigaArchivio>[] = [
    {
      colId: 'espansione',
      headerName: '',
      cellRenderer: CellaEspansione,
      cellRendererParams: {
        espanso: (id) => this.store.espanso(id),
        alterna: (id) => this.store.alternaEspansione(id),
      } satisfies ParametriCellaEspansione,
      width: 44,
      minWidth: 44,
      maxWidth: 44,
      resizable: false,
    },
    {
      colId: 'preferito',
      headerName: '',
      cellRenderer: CellaPreferito,
      cellRendererParams: {
        alterna: (prodotto, preferito) => this.store.cambiaPreferito(prodotto, preferito),
      } satisfies ParametriCellaPreferito,
      width: 48,
      minWidth: 48,
      maxWidth: 48,
      resizable: false,
    },
    {
      colId: 'prodotto',
      headerName: 'Prodotto',
      cellRenderer: CellaProdotto,
      flex: 3,
      minWidth: 280,
    },
    {
      colId: 'compagnia',
      headerName: 'Compagnia',
      valueGetter: (p) => p.data?.prodotto.compagnia.nome,
      flex: 2,
      minWidth: 170,
    },
    {
      colId: 'ramo',
      headerName: 'Ramo',
      valueGetter: (p) => p.data?.prodotto.ramo.nome,
      flex: 2,
      minWidth: 150,
    },
    {
      colId: 'edizione',
      headerName: 'Edizione corrente',
      cellRenderer: CellaEdizione,
      width: 210,
      minWidth: 190,
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

  protected readonly chiaveRiga = (p: { data: RigaArchivio }) => idRiga(p.data);

  protected cambiaPagina(evento: PaginatorState): void {
    this.store.pagina.set((evento.page ?? 0) + 1);
    /* Cambiando pagina le espansioni aperte non hanno più senso: si
       riferiscono a prodotti che non sono più a schermo. */
    this.store.chiudiTutto();
  }
}
