import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';

import { ArchivioPrivatoStore } from '../archivio-privato-store';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { CellaApri } from '@shared/griglia/cella-apri';
import { CellaDocumento } from './celle/cella-documento';
import { CellaStato } from './celle/cella-stato';
import { CellaTipologia } from '@shared/griglia/cella-tipologia';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { CodaCaricamento } from '@shared/caricamento/coda-caricamento';
import { Icona } from '@shared/ui/icona/icona';
import { Paginazione } from '@shared/ui/paginazione/paginazione';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import { StatoElaborazione, TipologiaDocumento } from '@core/models';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';

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
    Bottone,
    Briciole,
    Campo,
    CellaApri,
    CellaDocumento,
    CellaStato,
    CellaTipologia,
    Checkbox,
    CodaCaricamento,
    DatePipe,
    Icona,
    Paginazione,
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

  protected readonly stati = STATI;
  protected readonly tipologie = TIPOLOGIE_PRIVATE;

  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Archivio privato' },
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
}
