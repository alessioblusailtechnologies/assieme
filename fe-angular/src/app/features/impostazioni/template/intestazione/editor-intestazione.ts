import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Editor } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { Gapcursor, Placeholder, TrailingNode, UndoRedo } from '@tiptap/extensions';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { firstValueFrom } from 'rxjs';

import {
  Allineamento,
  Dimensione,
  ETICHETTE_CAMPO,
  ErroreApi,
  Intestazione,
  NomeCampo,
} from '@core/models';
import { Icona } from '@shared/ui/icona/icona';
import { IntestazioneApi } from '@core/api/intestazione-api';
import { MenuAzioni, VoceMenu } from '@shared/ui/menu-azioni/menu-azioni';
import { Campo, Colonna, Colonne, DimensioneTesto, Immagine } from './estensioni';
import { coloreEsadecimale, fasciaDaEditor, fasciaPerEditor } from './normalizza';

type NomeFascia = 'intestazione' | 'piede';

interface StatoBarra {
  grassetto: boolean;
  corsivo: boolean;
  sottolineato: boolean;
  dimensione: Dimensione;
  colore: string | undefined;
  allineamento: Allineamento;
  /** L'immagine selezionata, se la selezione è un'immagine. */
  immagine: { larghezza: number } | undefined;
  inColonne: boolean;
  puoAnnullare: boolean;
  puoRipetere: boolean;
}

const STATO_INIZIALE: StatoBarra = {
  grassetto: false,
  corsivo: false,
  sottolineato: false,
  dimensione: 'normale',
  colore: undefined,
  allineamento: 'left',
  immagine: undefined,
  inColonne: false,
  puoAnnullare: false,
  puoRipetere: false,
};

/** Il colore del testo senza colore: lo stesso del motore (`generazione/intestazione.ts`). */
const COLORE_TESTO = '#262626';

/** Pochi colori, e quello del marchio lo si sceglie una volta: poi torna fra questi. */
const TINTE = [
  { valore: undefined, etichetta: 'Colore del testo' },
  { valore: '#737373', etichetta: 'Grigio' },
  { valore: '#2f4b7c', etichetta: 'Blu' },
] as const;

/** Gli esempi accanto ai campi, nel menù: che cosa diventeranno sulla carta. */
const ESEMPI_CAMPO: Record<NomeCampo, string> = {
  pagina: '3',
  pagine: '12',
  data: 'oggi',
  titolo: 'dal documento',
  agenzia: 'dal profilo',
};

const LARGHEZZA_IMMAGINE = 35;

/**
 * L'editor di intestazione e piè di pagina (11/09/2026).
 *
 * Un foglio A4 in scala con le due fasce da scrivere, la testa e il piede, e
 * una barra sola che lavora su quella dove sta il cursore: come in Word, e
 * senza raddoppiare i pulsanti. Sotto c'è TipTap senza wrapper, con le sole
 * estensioni dello schema vincolato (`estensioni.ts`): quello che si incolla
 * da fuori e non ci sta, si perde all'ingresso.
 *
 * Le misure sono quelle del motore, in punti: il foglio definisce `--pt` in
 * unità del contenitore, così alla larghezza che c'è un a capo nell'editor
 * cade dove cade nel PDF.
 */
@Component({
  selector: 'app-editor-intestazione',
  imports: [Icona, MenuAzioni],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-intestazione.html',
  styleUrl: './editor-intestazione.scss',
})
export class EditorIntestazione {
  private readonly api = inject(IntestazioneApi);

  /** Il contenuto da caricare: cambia al caricamento e ad «Annulla», non a ogni tasto. */
  readonly valore = input.required<Intestazione>();
  readonly modificabile = input(true);
  /** A ogni modifica, nella forma del contratto. */
  readonly cambiato = output<Intestazione>();

  private readonly zonaIntestazione =
    viewChild.required<ElementRef<HTMLElement>>('zonaIntestazione');
  private readonly zonaPiede = viewChild.required<ElementRef<HTMLElement>>('zonaPiede');
  private readonly sceltaFile = viewChild.required<ElementRef<HTMLInputElement>>('sceltaFile');

  private editori: Record<NomeFascia, Editor> | undefined;
  protected readonly attiva = signal<NomeFascia>('intestazione');
  /** Cresce a ogni transazione: la barra si ricalcola leggendolo. */
  private readonly versione = signal(0);

  protected readonly stato = computed<StatoBarra>(() => {
    this.versione();
    const editor = this.editori?.[this.attiva()];
    return editor ? statoDi(editor) : STATO_INIZIALE;
  });

  protected readonly tinte = TINTE;
  protected readonly coloreTesto = COLORE_TESTO;

  /** I colori scelti a mano già usati nelle due fasce: il marchio dell'agenzia, di solito. */
  protected readonly tinteUsate = computed(() => {
    this.versione();
    const note = new Set<string>(TINTE.flatMap((t) => (t.valore ? [t.valore] : [])));
    const usate = new Set<string>();
    for (const editor of Object.values(this.editori ?? {})) {
      editor.state.doc.descendants((nodo) => {
        for (const m of nodo.marks) {
          const c = coloreEsadecimale(m.attrs['color']);
          if (c && !note.has(c)) usate.add(c);
        }
      });
    }
    return [...usate].slice(0, 3);
  });

  protected readonly vociCampo: VoceMenu[] = (Object.keys(ETICHETTE_CAMPO) as NomeCampo[]).map(
    (nome) => ({
      etichetta: ETICHETTE_CAMPO[nome],
      dettaglio: ESEMPI_CAMPO[nome],
      azione: () => this.comando((c) => c.inserisciCampo(nome)),
    }),
  );

  protected readonly caricamentoImmagine = signal(false);
  protected readonly erroreImmagine = signal<string | undefined>(undefined);

  /** Le immagini scaricate, per id: si chiedono col token, una volta sola. */
  private readonly immagini = new Map<string, Promise<string | undefined>>();

  constructor() {
    afterNextRender(() => this.creaEditori());

    /* Il contenuto nuovo si carica senza entrare nella cronologia: «Annulla» non deve riportare al foglio bianco. */
    effect(() => {
      const valore = this.valore();
      untracked(() => {
        if (!this.editori) return;
        for (const nome of ['intestazione', 'piede'] as const) {
          this.editori[nome]
            .chain()
            .setMeta('addToHistory', false)
            .setContent(fasciaPerEditor(valore[nome]), { emitUpdate: false })
            .run();
        }
        this.versione.update((v) => v + 1);
      });
    });

    effect(() => {
      const modificabile = this.modificabile();
      untracked(() => {
        for (const editor of Object.values(this.editori ?? {}))
          editor.setEditable(modificabile, false);
      });
    });

    inject(DestroyRef).onDestroy(() => {
      for (const editor of Object.values(this.editori ?? {})) editor.destroy();
      for (const url of this.immagini.values()) void url.then((u) => u && URL.revokeObjectURL(u));
    });
  }

  private creaEditori(): void {
    const crea = (nome: NomeFascia, elemento: HTMLElement, segnaposto: string): Editor => {
      const editor = new Editor({
        element: elemento,
        editable: this.modificabile(),
        content: fasciaPerEditor(this.valore()[nome]),
        extensions: [
          Document,
          Paragraph,
          Text,
          HardBreak,
          Bold,
          Italic,
          Underline,
          TextStyle,
          Color,
          DimensioneTesto,
          TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right'] }),
          Campo,
          Immagine.configure({ risolvi: (id) => this.urlImmagine(id) }),
          Colonne,
          Colonna,
          UndoRedo,
          Gapcursor,
          TrailingNode,
          Placeholder.configure({ placeholder: segnaposto }),
        ],
        editorProps: {
          attributes: {
            'aria-label': nome === 'intestazione' ? 'Intestazione' : 'Piè di pagina',
            role: 'textbox',
            'aria-multiline': 'true',
          },
          handleClick: spostaDaNodoSelezionato,
        },
      });
      editor.on('transaction', () => this.versione.update((v) => v + 1));
      editor.on('focus', () => this.attiva.set(nome));
      editor.on('update', () => this.emetti());
      return editor;
    };
    this.editori = {
      intestazione: crea(
        'intestazione',
        this.zonaIntestazione().nativeElement,
        'Il nome dell’agenzia, i recapiti, il logo: quello che va in cima a ogni pagina.',
      ),
      piede: crea(
        'piede',
        this.zonaPiede().nativeElement,
        'Partita IVA, iscrizione RUI, numero di pagina.',
      ),
    };
    this.versione.update((v) => v + 1);
  }

  private emetti(): void {
    if (!this.editori) return;
    this.cambiato.emit({
      intestazione: fasciaDaEditor(this.editori.intestazione.getJSON()),
      piede: fasciaDaEditor(this.editori.piede.getJSON()),
    });
  }

  private urlImmagine(id: string): Promise<string | undefined> {
    let url = this.immagini.get(id);
    if (!url) {
      url = firstValueFrom(this.api.scaricaImmagine(id)).then(
        (blob) => URL.createObjectURL(blob),
        () => undefined,
      );
      this.immagini.set(id, url);
    }
    return url;
  }

  // --- Barra ----------------------------------------------------------------

  /** Un comando sulla fascia attiva, ridando il fuoco all'editor. */
  protected comando(
    esegui: (catena: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>,
  ): void {
    const editor = this.editori?.[this.attiva()];
    if (!editor) return;
    esegui(editor.chain().focus()).run();
  }

  protected attivaFascia(nome: NomeFascia): void {
    this.attiva.set(nome);
    this.editori?.[nome].commands.focus();
  }

  protected annulla(): void {
    this.comando((c) => c.undo());
  }

  protected ripeti(): void {
    this.comando((c) => c.redo());
  }

  protected grassetto(): void {
    this.comando((c) => c.toggleBold());
  }

  protected corsivo(): void {
    this.comando((c) => c.toggleItalic());
  }

  protected sottolineato(): void {
    this.comando((c) => c.toggleUnderline());
  }

  protected dimensione(valore: string): void {
    this.comando((c) => c.impostaDimensione(valore as Dimensione));
  }

  protected colore(valore: string | undefined): void {
    this.comando((c) => (valore ? c.setColor(valore) : c.unsetColor()));
  }

  protected allinea(allineamento: Allineamento): void {
    if (this.stato().immagine) this.comando((c) => c.impostaImmagine({ allineamento }));
    else this.comando((c) => c.setTextAlign(allineamento));
  }

  protected larghezzaImmagine(valore: string): void {
    const mm = Math.round(Number(valore));
    if (!Number.isFinite(mm) || mm < 5 || mm > 180) return;
    this.comando((c) => c.impostaImmagine({ larghezza: mm }));
  }

  protected togliImmagine(): void {
    this.comando((c) => c.deleteSelection());
  }

  protected colonne(quante: 2 | 3): void {
    this.comando((c) => c.inserisciColonne(quante));
  }

  protected togliColonne(): void {
    this.comando((c) => c.togliColonne());
  }

  protected scegliImmagine(): void {
    this.sceltaFile().nativeElement.click();
  }

  protected async caricaImmagine(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const file = campo.files?.[0];
    campo.value = '';
    if (!file) return;
    this.erroreImmagine.set(undefined);
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      this.erroreImmagine.set('Serve un PNG o un JPEG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.erroreImmagine.set('L’immagine supera i 2 MB.');
      return;
    }
    this.caricamentoImmagine.set(true);
    try {
      const { id } = await firstValueFrom(this.api.caricaImmagine(file));
      this.immagini.set(id, Promise.resolve(URL.createObjectURL(file)));
      this.comando((c) =>
        c.inserisciImmagine({ id, larghezza: LARGHEZZA_IMMAGINE, allineamento: 'left' }),
      );
    } catch (errore) {
      const api = errore instanceof HttpErrorResponse ? (errore.error as ErroreApi | null) : null;
      this.erroreImmagine.set(api?.messaggio ?? 'Caricamento dell’immagine non riuscito.');
    } finally {
      this.caricamentoImmagine.set(false);
    }
  }
}

/**
 * Con un'immagine selezionata, Chrome non sposta il cursore al clic su un
 * paragrafo vuoto: la selezione del nodo resta, e la prima lettera
 * scritta cancella il logo. Il clic fuori dal nodo lo si porta dove cade;
 * su un altro nodo (un'immagine, un campo) decide ProseMirror, che lo
 * seleziona.
 */
function spostaDaNodoSelezionato(view: EditorView, pos: number, evento: MouseEvent): boolean {
  const { selection, doc } = view.state;
  if (!(selection instanceof NodeSelection)) return false;
  if (pos >= selection.from && pos <= selection.to) return false;
  if ((evento.target as HTMLElement | null)?.closest('.immagine-fascia, .campo-fascia'))
    return false;
  view.dispatch(view.state.tr.setSelection(Selection.near(doc.resolve(pos))));
  return true;
}

function statoDi(editor: Editor): StatoBarra {
  const { selection } = editor.state;
  const stile = editor.getAttributes('textStyle');
  const immagine =
    selection instanceof NodeSelection && selection.node.type.name === 'immagine'
      ? selection.node
      : undefined;
  let inColonne = false;
  for (let profondita = selection.$from.depth; profondita > 0; profondita--) {
    if (selection.$from.node(profondita).type.name === 'colonne') inColonne = true;
  }
  return {
    grassetto: editor.isActive('bold'),
    corsivo: editor.isActive('italic'),
    sottolineato: editor.isActive('underline'),
    dimensione: (stile['fontSize'] as Dimensione | null) ?? 'normale',
    colore: coloreEsadecimale(stile['color']),
    allineamento: immagine
      ? (immagine.attrs['allineamento'] as Allineamento)
      : ((editor.getAttributes('paragraph')['textAlign'] as Allineamento | null) ?? 'left'),
    immagine: immagine ? { larghezza: immagine.attrs['larghezza'] as number } : undefined,
    inColonne,
    puoAnnullare: editor.can().undo(),
    puoRipetere: editor.can().redo(),
  };
}
