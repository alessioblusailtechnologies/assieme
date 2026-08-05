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
  TooltipModule,
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

import { ArchivioPrivatoStore } from '../archivio-privato-store';
import { CellaApri, ParametriCellaApri } from '@shared/griglia/cella-apri';
import { CellaDocumento } from './celle/cella-documento';
import { CellaStato } from './celle/cella-stato';
import { CellaTipologia } from '@shared/griglia/cella-tipologia';
import { CodaCaricamento } from '@shared/caricamento/coda-caricamento';
import { DocumentoPrivato, StatoElaborazione, TipologiaDocumento } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';
import { assiemeGridTheme } from '@theme/ag-grid-theme';
import { environment } from '@env';

const STATI: { valore: StatoElaborazione; etichetta: string }[] = [
  { valore: 'pronto', etichetta: 'Pronti' },
  { valore: 'in-elaborazione', etichetta: 'In elaborazione' },
  { valore: 'in-coda', etichetta: 'In coda' },
  { valore: 'errore', etichetta: 'Non leggibili' },
];

const TIPOLOGIE_PRIVATE: { valore: TipologiaDocumento; etichetta: string }[] = [
  { valore: 'preventivo', etichetta: 'Preventivo' },
  { valore: 'polizza', etichetta: 'Polizza' },
  { valore: 'appendice', etichetta: 'Appendice' },
  { valore: 'convenzione', etichetta: 'Convenzione' },
  { valore: 'nota-tecnica', etichetta: 'Nota tecnica' },
  { valore: 'altro', etichetta: 'Altro' },
];

/**
 * Archivio Privato — elenco.
 *
 * La differenza sostanziale rispetto all'archivio pubblico è che qui si
 * scrive: si carica, si etichetta, si elimina. Ne discendono la colonna di
 * stato (RF-B-05), la zona di caricamento e la coda.
 */
@Component({
  selector: 'app-elenco-privati',
  imports: [
    AgGridAngular,
    Breadcrumb,
    ButtonDirective,
    Checkbox,
    CodaCaricamento,
    FormsModule,
    IconField,
    Icona,
    InputIcon,
    InputText,
    Paginator,
    Scheletro,
    Select,
    StatoVuoto,
    ZonaCaricamento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './elenco-privati.html',
  styleUrl: './elenco-privati.scss',
})
export class ElencoPrivati {
  protected readonly store = inject(ArchivioPrivatoStore);
  private readonly locale = inject(LOCALE_ID);

  protected readonly tema = assiemeGridTheme;
  protected readonly stati = STATI;
  protected readonly tipologie = TIPOLOGIE_PRIVATE;

  protected readonly briciole: MenuItem[] = [
    { label: 'Home', routerLink: '/' },
    { label: 'Archivio privato', routerLink: '/archivio/privato' },
  ];

  protected readonly moduli: Module[] = [
    ClientSideRowModelModule,
    ColumnAutoSizeModule,
    CellStyleModule,
    LocaleModule,
    /* Il motivo per cui un documento non è leggibile sta in un suggerimento:
       è una frase, e una colonna non è il posto per una frase. */
    TooltipModule,
    ...(environment.production ? [] : [ValidationModule]),
  ];

  protected readonly documenti = computed(() => this.store.documenti());

  /** RF-B-08: quanto spazio resta, in forma leggibile. */
  protected readonly spazio = computed(() => {
    const s = this.store.spazio();
    if (!s) return undefined;
    const percentuale = Math.round((s.usatoByte / s.limiteByte) * 100);
    return {
      testo: `${(s.usatoByte / 1024 / 1024).toFixed(0)} MB di ${(s.limiteByte / 1024 / 1024 / 1024).toFixed(0)} GB`,
      percentuale,
      /* Si accende solo quando il problema è vicino: un indicatore sempre
         colorato smette di essere un segnale. */
      inEsaurimento: percentuale >= 80,
      limiteFileByte: s.limiteFileByte,
    };
  });

  protected readonly opzioniGriglia: GridOptions<DocumentoPrivato> = {
    rowHeight: 52,
    headerHeight: 40,
    animateRows: false,
    suppressCellFocus: true,
    localeText: { noRowsToShow: 'Nessun documento' },
  };

  protected readonly colonne: ColDef<DocumentoPrivato>[] = [
    {
      colId: 'documento',
      headerName: 'Documento',
      cellRenderer: CellaDocumento,
      flex: 4,
      minWidth: 300,
    },
    {
      colId: 'tipologia',
      headerName: 'Tipologia',
      cellRenderer: CellaTipologia,
      width: 150,
      minWidth: 130,
    },
    {
      colId: 'stato',
      headerName: 'Stato',
      cellRenderer: CellaStato,
      width: 160,
      minWidth: 140,
    },
    {
      colId: 'caricato',
      headerName: 'Caricato il',
      valueGetter: (p) => (p.data ? formatDate(p.data.caricatoIl, 'dd/MM/yyyy', this.locale) : ''),
      width: 130,
      minWidth: 120,
      cellClass: 'cella-numerica',
    },
    {
      colId: 'azione',
      headerName: '',
      cellRenderer: CellaApri,
      cellRendererParams: { base: '/archivio/privato' } satisfies ParametriCellaApri,
      width: 110,
      minWidth: 110,
      maxWidth: 110,
      resizable: false,
      pinned: 'right',
    },
  ];

  protected readonly colonnaPredefinita: ColDef = {
    /* Come nell'archivio pubblico: la paginazione è lato server e ordinare
       la sola pagina corrente farebbe credere di aver ordinato tutto. */
    sortable: false,
    resizable: true,
    suppressMovable: true,
  };

  protected readonly chiaveRiga = (p: { data: DocumentoPrivato }) => p.data.id;

  protected cambiaPagina(evento: PaginatorState): void {
    this.store.pagina.set((evento.page ?? 0) + 1);
  }
}
