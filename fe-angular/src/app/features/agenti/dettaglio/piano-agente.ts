import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';

import { Agente, DestinatarioNonRisolto, EmailPiano, LetturaPiano, PassoPiano, StatoPiano } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Icona } from '@shared/ui/icona/icona';
import type { NomeIcona } from '@shared/ui/icona/registro-icone';

const ETICHETTE_STATO: Record<StatoPiano, string> = {
  'non-letto': 'da leggere',
  'da-confermare': 'da confermare',
  confermato: 'confermato',
};

const ICONE_PASSO: Record<PassoPiano['tipo'], NomeIcona> = {
  leggi: 'documento',
  cerca: 'cerca',
  confronta: 'riferimenti',
  'genera-file': 'esporta',
  'invia-email': 'email',
  altro: 'agente',
};

const ICONE_LETTURA: Record<LetturaPiano['tipo'], NomeIcona> = {
  documento: 'documento',
  prodotto: 'archivio-pubblico',
  cliente: 'utente',
  archivio: 'archivio-privato',
};

/**
 * Il piano dell'agente, come Velia ha capito la richiesta (14/09/2026).
 *
 * È la cosa su cui si decide, e va letta per intero prima di confermare:
 * l'obiettivo, i passi nell'ordine, che cosa legge, che cosa prepara, a chi
 * scrive e che cosa è rimasto aperto. Un destinatario che non si è potuto
 * risolvere si vede in rosso, col motivo, e la conferma resta ferma.
 * Confermato, il piano resta a dire che cosa l'agente fa; la conferma si
 * toglie da sola quando la richiesta o quando corre cambiano.
 */
@Component({
  selector: 'app-piano-agente',
  imports: [Bottone, DatePipe, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './piano-agente.html',
  styleUrl: './piano-agente.scss',
})
export class PianoAgenteScheda {
  readonly agente = input.required<Agente>();
  readonly inConferma = input(false);
  readonly inLettura = input(false);

  readonly conferma = output<void>();
  readonly rileggi = output<void>();

  protected readonly piano = computed(() => this.agente().piano);
  protected readonly stato = computed(() => this.agente().pianoStato);
  protected readonly etichettaStato = computed(() => ETICHETTE_STATO[this.stato()]);

  protected iconaPasso(passo: PassoPiano): NomeIcona {
    return ICONE_PASSO[passo.tipo];
  }

  protected iconaLettura(lettura: LetturaPiano): NomeIcona {
    return ICONE_LETTURA[lettura.tipo];
  }

  protected nonRisolto(email: EmailPiano): DestinatarioNonRisolto | undefined {
    return email.destinatario.tipo === 'non-risolto' ? email.destinatario : undefined;
  }

  /** A chi, come lo si riconosce: il nome e l'indirizzo, o come la richiesta lo nomina. */
  protected destinatario(email: EmailPiano): string {
    const d = email.destinatario;
    if (d.tipo === 'non-risolto') return d.richiesto;
    return d.nome ? `${d.nome} <${d.a}>` : d.a;
  }
}
