import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { CodaCaricamento } from '@shared/caricamento/coda-caricamento';
import { DocumentoRiferimento, Id, RegolaIstruzione } from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { IstruzioniStore } from './istruzioni-store';
import { Scheletro } from '@shared/ui/scheletro/scheletro';
import { Select } from '@shared/ui/select/select';
import { StatoVuoto } from '@shared/ui/stato-vuoto/stato-vuoto';
import { Avviso } from '@shared/ui/avviso/avviso';
import { EtichettaStato } from '@shared/ui/etichetta-stato/etichetta-stato';
import { Tag } from '@shared/ui/tag/tag';
import { ZonaCaricamento } from '@shared/caricamento/zona-caricamento';
import { codificaAmbito, decodificaAmbito, etichettaAmbito, opzioniAmbito } from './ambito';
import { dimensioneLeggibile } from '@shared/testi/misura';

type Scheda = 'regole' | 'riferimenti';

/**
 * Istruzioni personalizzate — il cuore del DNA d'Agenzia (RF-D-04…D-16).
 *
 * Due schede, due nature: le **regole** dicono come giudicare, i
 * **documenti di riferimento** danno fonti citabili. La riga di guida in
 * testa esiste per una ragione precisa: è il modo più economico di evitare
 * che lo stesso contenuto finisca in entrambi i posti.
 *
 * Il governo è dell'amministratore (RF-D-15); l'operatore vede tutto in
 * lettura — sapere quali regole condizionano le risposte non è un
 * privilegio, è trasparenza.
 */
@Component({
  selector: 'app-istruzioni',
  providers: [IstruzioniStore],
  imports: [
    Avviso,
    Bottone,
    Campo,
    Cassetto,
    Checkbox,
    CodaCaricamento,
    DatePipe,
    EtichettaStato,
    Icona,
    RouterLink,
    Scheletro,
    Select,
    StatoVuoto,
    Tag,
    ZonaCaricamento,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './istruzioni.html',
  styleUrl: './istruzioni.scss',
})
export class Istruzioni {
  protected readonly store = inject(IstruzioniStore);

  protected readonly scheda = signal<Scheda>('regole');

  protected readonly opzioni = computed(() =>
    opzioniAmbito(this.store.rami(), this.store.compagnie()),
  );

  protected ambito(regolaODocumento: RegolaIstruzione | DocumentoRiferimento): string {
    return etichettaAmbito(regolaODocumento.ambito, this.store.rami(), this.store.compagnie());
  }

  protected ambitoCodificato(riferimento: DocumentoRiferimento): string {
    return codificaAmbito(riferimento.ambito);
  }

  protected cambiaAmbito(riferimento: DocumentoRiferimento, codice: unknown): void {
    this.store.modificaRiferimento(riferimento.id, { ambito: decodificaAmbito(String(codice)) });
  }

  protected misura(byte: number): string {
    return dimensioneLeggibile(byte);
  }

  // --- Form regola (creazione e modifica nello stesso cassetto) -----------

  protected readonly cassettoRegola = signal(false);
  protected readonly regolaInModifica = signal<RegolaIstruzione | undefined>(undefined);
  protected readonly bozzaTitolo = signal('');
  protected readonly bozzaTesto = signal('');
  protected readonly bozzaAmbito = signal('generale');
  protected readonly inSalvataggio = signal(false);

  protected apriNuovaRegola(): void {
    this.regolaInModifica.set(undefined);
    this.bozzaTitolo.set('');
    this.bozzaTesto.set('');
    this.bozzaAmbito.set('generale');
    this.cassettoRegola.set(true);
  }

  protected apriModificaRegola(regola: RegolaIstruzione): void {
    this.regolaInModifica.set(regola);
    this.bozzaTitolo.set(regola.titolo);
    this.bozzaTesto.set(regola.testo);
    this.bozzaAmbito.set(codificaAmbito(regola.ambito));
    this.cassettoRegola.set(true);
  }

  protected readonly bozzaValida = computed(
    () => !!this.bozzaTitolo().trim() && !!this.bozzaTesto().trim(),
  );

  protected salvaRegola(): void {
    if (!this.bozzaValida() || this.inSalvataggio()) return;
    this.inSalvataggio.set(true);

    const dati = {
      titolo: this.bozzaTitolo().trim(),
      testo: this.bozzaTesto().trim(),
      ambito: decodificaAmbito(this.bozzaAmbito()),
    };
    const chiudi = () => {
      this.inSalvataggio.set(false);
      this.cassettoRegola.set(false);
    };

    const inModifica = this.regolaInModifica();
    if (inModifica) this.store.modificaRegola(inModifica.id, dati, chiudi);
    else this.store.creaRegola(dati, chiudi);
  }

  // --- Eliminazioni a due passi -------------------------------------------

  /** L'id armato per l'eliminazione, regola o riferimento che sia. */
  protected readonly confermaEliminazione = signal<Id | undefined>(undefined);

  protected eliminaRegola(regola: RegolaIstruzione): void {
    if (this.confermaEliminazione() !== regola.id) {
      this.confermaEliminazione.set(regola.id);
      return;
    }
    this.store.eliminaRegola(regola.id);
    this.confermaEliminazione.set(undefined);
  }

  protected eliminaRiferimento(riferimento: DocumentoRiferimento): void {
    if (this.confermaEliminazione() !== riferimento.id) {
      this.confermaEliminazione.set(riferimento.id);
      return;
    }
    this.store.eliminaRiferimento(riferimento.id);
    this.confermaEliminazione.set(undefined);
  }

  protected cambiaScheda(scheda: Scheda): void {
    this.scheda.set(scheda);
    this.confermaEliminazione.set(undefined);
  }
}
