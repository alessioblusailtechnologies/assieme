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
import { Icona } from '@shared/ui/icona/icona';
import { Paginazione } from '@shared/ui/paginazione/paginazione';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import {
  ESTENSIONI_DOCUMENTO,
  FORMATI_DOCUMENTO,
  StatoElaborazione,
  TipologiaDocumento,
} from '@core/models';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';
import { dimensioneLeggibile } from '@shared/testi/misura';

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
 * stato (RF-B-05) e la zona di caricamento.
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
  protected readonly estensioni = ESTENSIONI_DOCUMENTO;
  protected readonly formati = FORMATI_DOCUMENTO;
  protected readonly tipologie = TIPOLOGIE_PRIVATE;

  protected readonly briciole: VoceBriciola[] = [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Archivio privato' },
  ];

  protected readonly documenti = computed(() => this.store.documenti());

  /** Quanti file stanno salendo e a che punto sono, in una cifra sola. */
  protected readonly caricamento = computed(() => {
    const inCorso = this.store.coda().filter((v) => v.stato === 'in-corso');
    if (!inCorso.length) return undefined;
    const somma = inCorso.reduce((s, v) => s + v.percentuale, 0);
    return { conteggio: inCorso.length, percentuale: Math.round(somma / inCorso.length) };
  });

  /**
   * RF-B-08: quanto pesa l'archivio, accanto al conteggio. Il limite serve
   * solo alla misura massima del singolo file sotto la zona di caricamento.
   */
  protected readonly spazio = computed(() => {
    const s = this.store.spazio();
    if (!s) return undefined;
    return {
      usato: dimensioneLeggibile(s.usatoByte),
      /* Si accende solo quando il problema è vicino: un indicatore sempre
         colorato smette di essere un segnale. */
      inEsaurimento: s.usatoByte / s.limiteByte >= 0.8,
      limiteFileByte: s.limiteFileByte,
    };
  });
}
