import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { httpResource } from '@angular/common/http';

import {
  Agente,
  AgentePredefinito,
  Compagnia,
  FonteAgente,
  FormatoOutputAgente,
  FrequenzaPianificazione,
  Id,
  LimitiAgenti,
  NuovaFonteAgente,
  ParametroAgente,
  Pianificazione,
  Ramo,
  RiferimentoDocumento,
  TemplateOutput,
} from '@core/models';
import { AgentiApi } from '@core/api/agenti-api';
import { Bottone } from '@shared/ui/bottone/bottone';
import { Briciole, VoceBriciola } from '@shared/ui/briciole/briciole';
import { Campo } from '@shared/ui/campo/campo';
import { Checkbox } from '@shared/ui/checkbox/checkbox';
import { ConversazioniApi } from '@core/api/conversazioni-api';
import { DocumentiApi } from '@core/api/documenti-api';
import { Icona } from '@shared/ui/icona/icona';
import { Select } from '@shared/ui/select/select';
import { SelettoreDocumenti } from '@shared/ui/selettore-documenti/selettore-documenti';
import { GIORNI_SETTIMANA, frequenzeAmmesse } from '../pianificazione';

/**
 * Editor dell'agente (RF-E-01/02): serve la creazione e la modifica, e la
 * creazione può partire già compilata da un predefinito della libreria
 * (RF-E-10, `?predefinito=`).
 *
 * I passi seguono l'ordine in cui si ragiona: cosa fa (istruzioni), su cosa
 * lavora (fonti), cosa produce (output e template), cosa gli si può passare
 * all'avvio (parametri, RF-E-05), quando corre da solo (pianificazione,
 * RF-E-04 — con le frequenze che il piano ammette, RF-E-09).
 */
@Component({
  selector: 'app-editor-agente',
  imports: [
    Bottone,
    Briciole,
    Campo,
    Checkbox,
    Icona,
    RouterLink,
    Select,
    SelettoreDocumenti,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-agente.html',
  styleUrl: './editor-agente.scss',
})
export class EditorAgente {
  private readonly api = inject(AgentiApi);
  private readonly apiDocumenti = inject(DocumentiApi);
  private readonly apiConversazioni = inject(ConversazioniApi);
  private readonly router = inject(Router);

  /** Dalla rotta `/agenti/:id/modifica`; assente in creazione. */
  readonly id = input<Id | undefined>(undefined);
  /** Da `?predefinito=`: la definizione della libreria da cui partire. */
  readonly predefinito = input<Id | undefined>(undefined);

  protected readonly inModifica = computed(() => !!this.id());

  protected readonly briciole = computed<VoceBriciola[]>(() => [
    { etichetta: 'Home', percorso: '/' },
    { etichetta: 'Agenti', percorso: '/agenti' },
    { etichetta: this.inModifica() ? 'Modifica agente' : 'Nuovo agente' },
  ]);

  // --- Risorse di contorno ------------------------------------------------

  private readonly risorsaAgente = httpResource<Agente>(() => {
    const id = this.id();
    return id ? this.api.urlDettaglio(id) : undefined;
  });

  private readonly risorsaPredefiniti = httpResource<AgentePredefinito[]>(() =>
    this.predefinito() ? this.api.urlPredefiniti() : undefined,
  );

  private readonly risorsaLimiti = httpResource<LimitiAgenti>(() => this.api.urlLimiti());
  protected readonly limiti = computed(() =>
    this.risorsaLimiti.hasValue() ? this.risorsaLimiti.value() : undefined,
  );

  private readonly risorsaCompagnie = httpResource<Compagnia[]>(() =>
    this.apiDocumenti.urlCompagnie(),
  );
  protected readonly compagnie = computed(() =>
    this.risorsaCompagnie.hasValue() ? this.risorsaCompagnie.value() : [],
  );

  private readonly risorsaRami = httpResource<Ramo[]>(() => this.apiDocumenti.urlRami());
  protected readonly rami = computed(() => (this.risorsaRami.hasValue() ? this.risorsaRami.value() : []));

  private readonly risorsaTemplate = httpResource<TemplateOutput[]>(() =>
    this.apiConversazioni.urlTemplate(),
  );
  protected readonly opzioniTemplate = computed(() =>
    (this.risorsaTemplate.hasValue() ? this.risorsaTemplate.value() : []).map((t) => ({
      valore: t.id,
      etichetta: `${t.nome} (${t.formato.toUpperCase()})`,
    })),
  );

  // --- Il modulo ----------------------------------------------------------

  protected readonly nome = signal('');
  protected readonly descrizione = signal('');
  protected readonly istruzioni = signal('');
  protected readonly fonti = signal<FonteAgente[]>([]);
  protected readonly formatoOutput = signal<FormatoOutputAgente>('testo');
  protected readonly templateId = signal<Id | undefined>(undefined);
  protected readonly parametri = signal<ParametroAgente[]>([]);

  protected readonly pianificata = signal(false);
  protected readonly frequenza = signal<FrequenzaPianificazione>('giornaliera');
  protected readonly orario = signal('08:00');
  protected readonly giornoSettimana = signal(1);
  protected readonly giornoMese = signal(1);
  /** Conservata in modifica: sospendere non è compito dell'editor. */
  private readonly sospesa = signal(false);

  /* Il modulo si riempie una volta sola, quando la fonte dei dati arriva:
     l'agente in modifica, o il predefinito scelto in libreria. */
  private inizializzato = false;

  constructor() {
    effect(() => {
      if (this.inizializzato) return;
      if (this.inModifica()) {
        const agente = this.risorsaAgente.hasValue() ? this.risorsaAgente.value() : undefined;
        if (agente) this.compila(agente);
        return;
      }
      const idPredefinito = this.predefinito();
      if (!idPredefinito) return;
      const scelto = (this.risorsaPredefiniti.hasValue() ? this.risorsaPredefiniti.value() : []).find(
        (p) => p.id === idPredefinito,
      );
      if (scelto) this.compila(scelto);
    });
  }

  private compila(base: Agente | AgentePredefinito): void {
    this.inizializzato = true;
    this.nome.set(base.nome);
    this.descrizione.set(base.descrizione);
    this.istruzioni.set(base.istruzioni);
    this.fonti.set(base.fonti);
    this.formatoOutput.set(base.formatoOutput);
    this.parametri.set(base.parametri);

    /* `creatoDa` è obbligatorio sull'agente e assente sul predefinito: è il
       discriminante fra «modifica di un agente» e «parti dalla libreria». */
    if ('creatoDa' in base) this.templateId.set(base.templateOutputId);

    const pianificazione =
      'creatoDa' in base ? base.pianificazione : base.pianificazioneSuggerita;
    if (pianificazione) {
      this.pianificata.set(true);
      this.frequenza.set(pianificazione.frequenza);
      this.orario.set(pianificazione.orario);
      this.giornoSettimana.set(pianificazione.giornoSettimana ?? 1);
      this.giornoMese.set(pianificazione.giornoMese ?? 1);
      /* La suggerita non ha `sospesa` (è un suggerimento, non uno stato). */
      this.sospesa.set((pianificazione as Partial<Pianificazione>).sospesa ?? false);
    }
  }

  // --- Fonti (RF-E-02) ----------------------------------------------------

  protected readonly ricerca = signal('');
  protected readonly pannelloAperto = signal(false);
  private readonly selettore = viewChild(SelettoreDocumenti);

  protected readonly idDocumentiScelti = computed(() =>
    this.fonti()
      .filter((f) => f.tipo === 'documento')
      .map((f) => f.documentoId),
  );

  protected readonly idOpzioneAttiva = computed(() =>
    this.pannelloAperto() ? this.selettore()?.idOpzioneAttiva() : undefined,
  );

  protected aggiornaRicerca(evento: Event): void {
    this.ricerca.set((evento.target as HTMLInputElement).value);
    this.pannelloAperto.set(true);
  }

  protected suTasto(evento: KeyboardEvent): void {
    const selettore = this.selettore();
    if (!this.pannelloAperto() || !selettore) return;
    if (selettore.gestisciTasto(evento)) evento.preventDefault();
  }

  protected chiudiPannello(): void {
    this.pannelloAperto.set(false);
  }

  protected aggiungiDocumento(documento: RiferimentoDocumento): void {
    this.fonti.update((fonti) =>
      fonti.some((f) => f.tipo === 'documento' && f.documentoId === documento.id)
        ? fonti
        : [
            ...fonti,
            {
              tipo: 'documento',
              documentoId: documento.id,
              archivio: documento.archivio,
              etichetta: documento.titolo,
            },
          ],
    );
    this.ricerca.set('');
  }

  /* La porzione di archivio in costruzione (RF-E-02: insiemi che cambiano da
     soli nel tempo, come «tutti i preferiti del ramo auto»). */
  protected readonly selArchivio = signal<'pubblico' | 'privato'>('pubblico');
  protected readonly selCompagnia = signal<Id | undefined>(undefined);
  protected readonly selRamo = signal<Id | undefined>(undefined);
  protected readonly selPreferiti = signal(false);

  protected readonly opzioniArchivio = [
    { valore: 'pubblico', etichetta: 'Archivio Pubblico' },
    { valore: 'privato', etichetta: 'Archivio Privato' },
  ];

  protected aggiungiSelezione(): void {
    const archivio = this.selArchivio();
    const compagniaId = this.selCompagnia();
    const ramoId = this.selRamo();
    const soloPreferiti = archivio === 'pubblico' && this.selPreferiti();

    const dettagli = [
      this.compagnie().find((c) => c.id === compagniaId)?.nome,
      this.rami().find((r) => r.id === ramoId)?.nome,
      soloPreferiti ? 'solo preferiti' : undefined,
    ].filter(Boolean);
    const etichetta = `${archivio === 'pubblico' ? 'Archivio Pubblico' : 'Archivio Privato'} — ${
      dettagli.length ? dettagli.join(', ') : 'tutto'
    }`;

    const fonte: FonteAgente = {
      tipo: 'selezione',
      archivio,
      ...(ramoId ? { ramoId } : {}),
      ...(compagniaId ? { compagniaId } : {}),
      ...(soloPreferiti ? { soloPreferiti } : {}),
      etichetta,
    };
    this.fonti.update((fonti) =>
      fonti.some((f) => f.etichetta === etichetta) ? fonti : [...fonti, fonte],
    );
    this.selCompagnia.set(undefined);
    this.selRamo.set(undefined);
    this.selPreferiti.set(false);
  }

  protected readonly haRiferimenti = computed(() =>
    this.fonti().some((f) => f.tipo === 'documenti-riferimento'),
  );

  protected alternaRiferimenti(attivi: boolean): void {
    this.fonti.update((fonti) => {
      const senza = fonti.filter((f) => f.tipo !== 'documenti-riferimento');
      return attivi
        ? [...senza, { tipo: 'documenti-riferimento', etichetta: 'Documenti di riferimento dell’agenzia' }]
        : senza;
    });
  }

  protected rimuoviFonte(fonte: FonteAgente): void {
    this.fonti.update((fonti) => fonti.filter((f) => f !== fonte));
  }

  // --- Output (RF-E-02, RF-E-13) ------------------------------------------

  protected readonly opzioniFormato: { valore: FormatoOutputAgente; etichetta: string }[] = [
    { valore: 'testo', etichetta: 'Testo — risposta discorsiva con citazioni' },
    { valore: 'tabella', etichetta: 'Tabella — estrazione strutturata con citazioni' },
    { valore: 'documento', etichetta: 'Documento — file generato su un template' },
  ];

  /** Il formato `documento` senza template non produce nulla: il vincolo sta qui. */
  protected readonly serveTemplate = computed(() => this.formatoOutput() === 'documento');

  // --- Parametri (RF-E-05) ------------------------------------------------

  protected readonly bozzaParametro = signal('');
  protected readonly bozzaTipoParametro = signal<'testo' | 'documento'>('documento');
  protected readonly bozzaObbligatorio = signal(true);

  protected readonly opzioniTipoParametro = [
    { valore: 'documento', etichetta: 'Documento dagli archivi' },
    { valore: 'testo', etichetta: 'Testo libero' },
  ];

  protected aggiungiParametro(): void {
    const etichetta = this.bozzaParametro().replace(/\s+/g, ' ').trim();
    if (!etichetta) return;
    const chiave = etichetta
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!chiave || this.parametri().some((p) => p.chiave === chiave)) return;
    this.parametri.update((p) => [
      ...p,
      {
        chiave,
        etichetta,
        tipo: this.bozzaTipoParametro(),
        obbligatorio: this.bozzaObbligatorio(),
      },
    ]);
    this.bozzaParametro.set('');
  }

  protected rimuoviParametro(chiave: string): void {
    this.parametri.update((p) => p.filter((x) => x.chiave !== chiave));
  }

  // --- Pianificazione (RF-E-04, limiti RF-E-09) ---------------------------

  protected readonly opzioniFrequenza = computed(() =>
    frequenzeAmmesse(this.limiti()?.frequenzaMinima ?? 'giornaliera'),
  );

  protected readonly giorniSettimana = GIORNI_SETTIMANA;

  protected readonly giorniMese = Array.from({ length: 28 }, (_, i) => ({
    valore: i + 1,
    etichetta: `giorno ${i + 1}`,
  }));

  // --- Salvataggio --------------------------------------------------------

  protected readonly inSalvataggio = signal(false);

  protected readonly pronto = computed(
    () =>
      !!this.nome().trim() &&
      !!this.istruzioni().trim() &&
      this.fonti().length >= 1 &&
      (!this.serveTemplate() || !!this.templateId()),
  );

  private componiPianificazione(): Pianificazione | undefined {
    if (!this.pianificata()) return undefined;
    const frequenza = this.frequenza();
    return {
      frequenza,
      orario: this.orario() || '08:00',
      ...(frequenza === 'settimanale' ? { giornoSettimana: this.giornoSettimana() } : {}),
      ...(frequenza === 'mensile' ? { giornoMese: this.giornoMese() } : {}),
      sospesa: this.sospesa(),
    };
  }

  /** Le fonti come le vuole il contratto di richiesta: senza etichetta. */
  private componiFonti(): NuovaFonteAgente[] {
    return this.fonti().map((fonte): NuovaFonteAgente => {
      switch (fonte.tipo) {
        case 'documento':
          return { tipo: 'documento', documentoId: fonte.documentoId, archivio: fonte.archivio };
        case 'selezione':
          return {
            tipo: 'selezione',
            archivio: fonte.archivio,
            ...(fonte.ramoId ? { ramoId: fonte.ramoId } : {}),
            ...(fonte.compagniaId ? { compagniaId: fonte.compagniaId } : {}),
            ...(fonte.soloPreferiti ? { soloPreferiti: true } : {}),
          };
        default:
          return { tipo: 'documenti-riferimento' };
      }
    });
  }

  protected salva(): void {
    if (!this.pronto() || this.inSalvataggio()) return;
    this.inSalvataggio.set(true);

    const pianificazione = this.componiPianificazione();
    const comune = {
      nome: this.nome().trim(),
      descrizione: this.descrizione().trim(),
      istruzioni: this.istruzioni().trim(),
      fonti: this.componiFonti(),
      formatoOutput: this.formatoOutput(),
      parametri: this.parametri(),
    };

    const id = this.id();
    const richiesta = id
      ? this.api.modifica(id, {
          ...comune,
          templateOutputId: this.templateId() ?? null,
          pianificazione: pianificazione ?? null,
        })
      : this.api.crea({
          ...comune,
          ...(this.templateId() ? { templateOutputId: this.templateId() } : {}),
          ...(pianificazione ? { pianificazione } : {}),
        });

    richiesta.subscribe({
      next: (agente) => void this.router.navigate(['/agenti', agente.id]),
      /* Ad avvisare ha già pensato l'interceptor: qui si riabilita il
         pulsante, perché la bozza è tutta ancora in pagina. */
      error: () => this.inSalvataggio.set(false),
    });
  }
}
