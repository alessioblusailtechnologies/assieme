import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Accordion } from '@shared/ui/accordion/accordion';
import { Citazione, RiferimentoDocumento } from '@core/models';
import { ChipCitazione } from '@shared/ui/citazione/chip-citazione';
import { Icona } from '@shared/ui/icona/icona';
import { ChatStore, MessaggioInStream } from '../chat-store';
import { Suggerimento } from '@shared/ui/suggerimento/suggerimento';
import { htmlRisposta, testoConFontiPerEsteso, type RimandiRisposta } from '@shared/testi/testo-risposta';

/**
 * Un messaggio del filo: domanda dell'utente o risposta dell'assistente.
 *
 * La risposta porta con sé tutto ciò che la rende verificabile e
 * spiegabile — citazioni (RF-C-04), provenienze (RF-D-05/15, RF-G-03),
 * dichiarazione di non-copertura (RF-C-08) — e i suoi stati transitori:
 * streaming in corso, interrotta, caduta a metà.
 */
@Component({
  selector: 'app-bolla-messaggio',
  imports: [Accordion, ChipCitazione, Icona, RouterLink, Suggerimento],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bolla-messaggio.html',
  styleUrl: './bolla-messaggio.scss',
  host: {
    '[class.is-utente]': 'messaggio().autore === "utente"',
    '[class.is-assistente]': 'messaggio().autore === "assistente"',
    /* I chip dei rimandi sono ancore dentro `[innerHTML]`: il click si
       raccoglie sull'host (le ancore sono già focalizzabili e rispondono a
       Invio da sole) e si smista in `suRimando`. */
    '(click)': 'suRimando($event)',
  },
})
export class BollaMessaggio {
  readonly messaggio = input.required<MessaggioInStream>();

  /**
   * Il contesto della conversazione, per dare un titolo ai documenti
   * referenziati nel messaggio: il messaggio porta i soli id (contratto), i
   * titoli stanno nel contesto. Un documento rimosso dal contesto dopo
   * l'invio non si risolve più e il suo chip non compare: il filo mostra il
   * contesto di oggi, non la storia di ieri.
   */
  readonly contesto = input<RiferimentoDocumento[]>([]);

  readonly apriCitazione = output<Citazione>();

  /**
   * Le fonti come rimandi nel testo (29/08/2026): il motore scrive `[1]` nel
   * punto esatto e il renderer lo fa diventare chip. In streaming le fonti
   * arrivano dopo il testo: i rimandi aspettano. Istruzioni e memoria non
   * entrano nel testo: stanno nel loro accordion in coda al messaggio.
   */
  private readonly rimandi = computed<RimandiRisposta>(() => {
    const m = this.messaggio();
    return { citazioni: m.citazioni, attesa: Boolean(m.inCorso) };
  });

  protected readonly html = computed(() => htmlRisposta(this.messaggio().testo, this.rimandi()));

  /** Il messaggio usa i rimandi: l'elenco delle fonti in coda serve solo per ciò che il testo non richiama. */
  protected readonly haRimandi = computed(() => this.messaggio().citazioni.some((c) => c.rimandi?.length));

  /** I numeri che compaiono davvero nel testo. */
  private readonly numeriUsati = computed(
    () => new Set([...this.messaggio().testo.matchAll(/\[(\d{1,2})\]/g)].map((r) => Number(r[1]))),
  );

  /** Le fonti elencate dal motore ma mai richiamate nel testo: in coda, per completezza. */
  protected readonly altreFonti = computed(() => {
    if (!this.haRimandi() || this.messaggio().inCorso) return [];
    const numeri = this.numeriUsati();
    return this.messaggio().citazioni.filter((c) => !(c.rimandi ?? []).some((n) => numeri.has(n)));
  });

  /**
   * I chip nel testo sono ancore con frammento dentro `[innerHTML]`: il
   * click si intercetta qui, una volta per bolla, e si passa a chi apre il
   * documento.
   */
  protected suRimando(evento: Event): void {
    const ancora = (evento.target as HTMLElement | null)?.closest?.('a.rimando');
    if (!ancora) return;
    evento.preventDefault();
    const href = ancora.getAttribute('href') ?? '';
    if (!href.startsWith('#fonte:')) return;
    const citazione = this.messaggio().citazioni.find((c) => c.id === href.slice('#fonte:'.length));
    if (citazione) this.apriCitazione.emit(citazione);
  }

  /**
   * Mentre la risposta esce, i paragrafi già chiusi si rendono in Markdown
   * e l'ultimo, quello che sta crescendo, si rende parola per parola: ogni
   * parola nuova nasce con una dissolvenza (vedi `.parola` nello stile). A
   * risposta finita torna tutto Markdown, in un colpo solo.
   */
  protected readonly inDattilografia = computed(() => Boolean(this.messaggio().inCorso) && !!this.messaggio().testo);

  private readonly spezzato = computed(() => {
    const testo = this.messaggio().testo;
    const taglio = testo.lastIndexOf('\n\n');
    return taglio < 0
      ? { stabile: '', corrente: testo }
      : { stabile: testo.slice(0, taglio), corrente: testo.slice(taglio + 2) };
  });

  protected readonly htmlStabile = computed(() => htmlRisposta(this.spezzato().stabile, this.rimandi()));

  /**
   * Una tabella Markdown che sta arrivando (righe che cominciano con «|»)
   * non si mostra come testo grezzo: al suo posto uno scheletro di tabella
   * che cresce con le righe ricevute, finché il blocco si chiude e la
   * tabella vera prende il suo posto.
   */
  protected readonly tabellaInArrivo = computed(() => {
    const corrente = this.spezzato().corrente;
    if (!/^\s*\|/m.test(corrente)) return undefined;
    const righe = corrente.split('\n').filter((r) => /^\s*\|/.test(r) && !/^\s*\|[\s:|-]+\|?\s*$/.test(r));
    const colonne = Math.max(2, Math.min(6, (righe[0]?.match(/\|/g)?.length ?? 3) - 1));
    return { righe: Math.max(2, Math.min(8, righe.length)), colonne };
  });

  protected readonly celleScheletro = computed(() => {
    const t = this.tabellaInArrivo();
    return t ? Array.from({ length: t.righe }, () => Array.from({ length: t.colonne }, (_, i) => i)) : [];
  });

  /** Le parole del paragrafo in corso, spazi compresi: una sola per span, tracciate per posizione. */
  protected readonly paroleCorrenti = computed(() =>
    this.spezzato()
      .corrente.split(/(\s+)/)
      .filter((p) => p.length > 0),
  );

  protected readonly referenziati = computed(() => {
    const perId = new Map(this.contesto().map((d) => [d.id, d]));
    return this.messaggio()
      .documentiReferenziati.map((id) => perId.get(id))
      .filter((d): d is RiferimentoDocumento => !!d);
  });

  /** Da chiuso l'accordion delle fonti deve già dire quanto e da dove. */
  protected readonly riepilogoFonti = computed(() => {
    const citazioni = this.messaggio().citazioni;
    const documenti = new Set(citazioni.map((c) => c.documentoId)).size;
    const passaggi = citazioni.length === 1 ? '1 passaggio' : `${citazioni.length} passaggi`;
    const fonti = documenti === 1 ? '1 documento' : `${documenti} documenti`;
    return `${passaggi} in ${fonti}`;
  });

  /**
   * I documenti generati stanno nella bolla e nel pannello Output: lo
   * scaricamento è uno solo, e vive nello store — così le due liste
   * mostrano la stessa attesa sulla stessa riga.
   */
  protected readonly store = inject(ChatStore);

  /** RF-C-10: la copia rapida resta sempre disponibile, accanto all'esportazione. */
  protected readonly copiato = signal(false);

  protected copia(): void {
    /* Negli appunti i rimandi non dicono niente: le fonti vanno per esteso. */
    const testo = testoConFontiPerEsteso(this.messaggio().testo, this.rimandi());
    void navigator.clipboard.writeText(testo).then(() => {
      this.copiato.set(true);
      setTimeout(() => this.copiato.set(false), 2000);
    });
  }

  /** Cosa c'è dentro, prima di aprire: «2 istruzioni · 3 dalla memoria». */
  protected readonly riepilogoProvenienze = computed(() => {
    const p = this.messaggio().provenienze;
    const conta = (tipo: string) => p.filter((x) => x.tipo === tipo).length;
    const parti: string[] = [];
    const regole = conta('regola');
    const riferimenti = conta('documento-riferimento');
    const memoria = conta('memoria');
    if (regole) parti.push(regole === 1 ? '1 istruzione' : `${regole} istruzioni`);
    if (riferimenti) parti.push(riferimenti === 1 ? '1 documento di riferimento' : `${riferimenti} documenti di riferimento`);
    if (memoria) parti.push(`${memoria} dalla memoria`);
    return parti.join(' · ');
  });

  /** Le voci si chiamano come i pannelli che le governano: mai «ricordo». */
  protected readonly etichetteProvenienza: Record<string, string> = {
    regola: 'Istruzione',
    'documento-riferimento': 'Documento di riferimento',
    memoria: 'Memoria',
  };

  /** Dove si governa ciascun segnale: il ricordo in Memoria, il resto nelle Istruzioni. */
  protected readonly percorsiProvenienza: Record<string, string> = {
    regola: '/impostazioni/istruzioni',
    'documento-riferimento': '/impostazioni/istruzioni',
    memoria: '/memoria',
  };
}
