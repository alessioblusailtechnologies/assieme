import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { BozzaEmail, Id } from '@core/models';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Campo } from '@shared/ui/campo/campo';
import { Cassetto } from '@shared/ui/cassetto/cassetto';
import { Icona } from '@shared/ui/icona/icona';
import { htmlRisposta } from '@shared/testi/testo-risposta';
import { ChatStore } from '../chat-store';

/** Sopra questa misura il testo si apre a richiesta: una mail lunga non deve spingere via la risposta. */
const CARATTERI_A_VISTA = 480;
const RIGHE_A_VISTA = 8;

const E_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * L'email che l'assistente ha preparato, sotto la risposta (14/09/2026).
 *
 * Come il riordino proposto, la scheda esiste perché il motore non spedisce:
 * scrive la bozza e si ferma. Qui la si legge per intero - a chi, con che
 * oggetto, che cosa dice, che cosa allega - e parte solo da Invia, con
 * l'identità di chi clicca. Modifica apre il cassetto per correggerla prima.
 *
 * A decisione presa i pulsanti spariscono e resta il racconto: chi rilegge
 * la conversazione deve sapere che cosa è partito, a chi e quando.
 */
@Component({
  selector: 'app-email-pronta',
  imports: [Bottone, Campo, Cassetto, Icona],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './email-pronta.html',
  styleUrl: './email-pronta.scss',
  host: {
    '[class.is-decisa]': 'email().stato !== "bozza"',
  },
})
export class EmailPronta {
  readonly email = input.required<BozzaEmail>();
  /** Vero mentre la risposta scorre: la bozza si legge già, ma si invia a risposta salvata. */
  readonly inArrivo = input(false);

  protected readonly store = inject(ChatStore);

  protected readonly daDecidere = computed(() => this.email().stato === 'bozza');
  protected readonly inCorso = computed(() => this.store.bozzaInLavoro(this.email().id));
  protected readonly fermi = computed(() => this.inCorso() || this.inArrivo());

  /** Il titolo dice subito a che punto è: una cosa da decidere, o una già fatta. */
  protected readonly titolo = computed(() => {
    const e = this.email();
    switch (e.stato) {
      case 'inviata':
        return e.simulata ? 'Email simulata' : 'Email inviata';
      case 'annullata':
        return 'Email annullata';
      default:
        return 'Email pronta';
    }
  });

  /** A chi, come lo si riconosce: il nome, e accanto l'indirizzo a cui arriva davvero. */
  protected readonly destinatario = computed(() => {
    const d = this.email().destinatario;
    return d.nome ? `${d.nome} <${d.a}>` : d.a;
  });

  protected readonly quando = computed(() => {
    const il = this.email().decisaIl;
    return il
      ? new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
          new Date(il),
        )
      : '';
  });

  protected readonly corpoHtml = computed(() => htmlRisposta(this.email().corpo));
  protected readonly lunga = computed(() => {
    const corpo = this.email().corpo;
    return corpo.length > CARATTERI_A_VISTA || corpo.split('\n').length > RIGHE_A_VISTA;
  });
  protected readonly espansa = signal(false);

  // --- Modifica -----------------------------------------------------------

  protected readonly inModifica = signal(false);
  protected readonly a = signal('');
  protected readonly oggetto = signal('');
  protected readonly corpo = signal('');
  protected readonly tenuti = signal<ReadonlySet<Id>>(new Set());

  protected readonly valida = computed(
    () => E_EMAIL.test(this.a().trim()) && !!this.oggetto().trim() && !!this.corpo().trim(),
  );

  /** Scritto a mano un altro indirizzo, la bozza non va più al cliente: lo si dice prima di salvare. */
  protected readonly lasciaAnagrafica = computed(() => {
    const d = this.email().destinatario;
    return !!d.nome && this.a().trim().toLowerCase() !== d.a.toLowerCase();
  });

  protected apriModifica(): void {
    const e = this.email();
    this.a.set(e.destinatario.a);
    this.oggetto.set(e.oggetto);
    this.corpo.set(e.corpo);
    this.tenuti.set(new Set(e.allegati.map((x) => x.id)));
    this.inModifica.set(true);
  }

  protected alternaAllegato(id: Id): void {
    this.tenuti.update((tenuti) => {
      const nuovi = new Set(tenuti);
      if (nuovi.has(id)) nuovi.delete(id);
      else nuovi.add(id);
      return nuovi;
    });
  }

  protected salva(evento: Event): void {
    evento.preventDefault();
    if (!this.valida()) return;
    const e = this.email();
    this.store.modificaBozza(
      e,
      {
        a: this.a().trim(),
        oggetto: this.oggetto().trim(),
        corpo: this.corpo().trim(),
        allegati: e.allegati.filter((x) => this.tenuti().has(x.id)).map((x) => x.id),
      },
      () => this.inModifica.set(false),
    );
  }

  protected invia(): void {
    this.store.inviaBozza(this.email());
  }

  protected annulla(): void {
    this.store.annullaBozza(this.email());
  }
}
