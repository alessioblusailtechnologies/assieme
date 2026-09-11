import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
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
import { Placeholder } from '@tiptap/extensions';
import { TextSelection } from '@tiptap/pm/state';

import { Paragrafo } from '@core/models';
import { Campo, StileTesto } from './estensioni';
import { paragrafiDaEditor } from './normalizza';

/** Ciò che la casella lascia decidere all'editor della tela: uscire, e la cronologia (che è una sola, per tutta la tela). */
export type TastoCasella = 'esci' | 'annulla' | 'ripeti';

/**
 * Il testo di una casella della tela (11/09/2026): un TipTap senza wrapper,
 * con le sole estensioni dello schema vincolato. Quello che si incolla da
 * fuori e non ci sta si perde all'ingresso.
 *
 * Si scrive solo quando la tela lo chiede (doppio clic, Invio): il resto
 * del tempo la casella si trascina, e il testo è sola lettura. Corpo,
 * famiglia e colore della casella li mette la tela sull'elemento che la
 * contiene; qui ci sono solo i segni dei pezzi di testo.
 */
@Component({
  selector: 'app-casella-testo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  host: { class: 'casella-testo' },
})
export class CasellaTesto {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly idElemento = input.required<string>();
  readonly paragrafi = input.required<Paragrafo[]>();
  /** Vero mentre ci si scrive dentro. */
  readonly inModifica = input(false);
  readonly cambiato = output<Paragrafo[]>();
  /** A ogni transazione, anche solo di selezione: la barra si ricalcola. */
  readonly transazione = output<void>();
  readonly tasto = output<TastoCasella>();
  /** L'altezza del testo in pixel, quando cambia: la casella non può essere più bassa. */
  readonly altezza = output<number>();

  /** Assente finché la vista non c'è. */
  editor: Editor | undefined;
  /** Il JSON dell'ultimo contenuto caricato o emesso: lo stesso che torna dalla tela non si ricarica. */
  private ultimo = '';
  /** Chi ha chiesto di scrivere prima che l'editor ci fosse: una casella appena aggiunta. */
  private inAttesa: { punto?: { x: number; y: number } } | undefined;

  constructor() {
    afterNextRender(() => this.crea());

    effect(() => {
      const paragrafi = this.paragrafi();
      untracked(() => this.carica(paragrafi));
    });

    effect(() => {
      const scrive = this.inModifica();
      untracked(() => {
        const editor = this.editor;
        if (!editor || editor.isEditable === scrive) return;
        editor.setEditable(scrive, false);
        if (!scrive) {
          /* Chi smette di scrivere non lascia una selezione blu nella casella. */
          const { tr, doc } = editor.state;
          editor.view.dispatch(tr.setSelection(TextSelection.create(doc, 1)));
          editor.view.dom.blur();
        }
      });
    });

    const osservatore =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(([voce]) => {
            if (voce) this.altezza.emit(voce.contentRect.height);
          });
    osservatore?.observe(this.host.nativeElement);

    inject(DestroyRef).onDestroy(() => {
      osservatore?.disconnect();
      this.editor?.destroy();
    });
  }

  private crea(): void {
    const editor = new Editor({
      element: this.host.nativeElement,
      editable: this.inModifica(),
      content: { type: 'doc', content: this.paragrafi() },
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
        StileTesto,
        TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right'] }),
        Campo,
        Placeholder.configure({ placeholder: 'Scrivi qui', showOnlyWhenEditable: false }),
      ],
      editorProps: {
        attributes: {
          'aria-label': 'Casella di testo',
          role: 'textbox',
          'aria-multiline': 'true',
        },
        handleKeyDown: (_vista, evento) => {
          if (evento.key === 'Escape') {
            this.tasto.emit('esci');
            return true;
          }
          if ((evento.ctrlKey || evento.metaKey) && !evento.altKey) {
            const tasto = evento.key.toLowerCase();
            if (tasto === 'z' || tasto === 'y') {
              this.tasto.emit(tasto === 'y' || evento.shiftKey ? 'ripeti' : 'annulla');
              return true;
            }
          }
          return false;
        },
      },
    });
    editor.on('transaction', () => this.transazione.emit());
    editor.on('update', () => {
      const paragrafi = paragrafiDaEditor(editor.getJSON());
      this.ultimo = JSON.stringify(paragrafi);
      this.cambiato.emit(paragrafi);
    });
    this.editor = editor;
    this.ultimo = JSON.stringify(paragrafiDaEditor(this.paragrafi()));
    if (this.inAttesa) {
      const { punto } = this.inAttesa;
      this.inAttesa = undefined;
      this.scrivi(punto);
    }
  }

  /** Il contenuto che arriva dalla tela (annulla, testo di tutta la casella): la selezione resta dov'era, se c'è ancora. */
  private carica(paragrafi: Paragrafo[]): void {
    const editor = this.editor;
    if (!editor) return;
    const json = JSON.stringify(paragrafiDaEditor(paragrafi));
    if (json === this.ultimo) return;
    this.ultimo = json;
    const { from, to } = editor.state.selection;
    editor
      .chain()
      .setMeta('addToHistory', false)
      .setContent({ type: 'doc', content: paragrafi }, { emitUpdate: false })
      .run();
    const fine = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: Math.min(from, fine), to: Math.min(to, fine) });
  }

  /** Comincia a scrivere dove si è cliccato (coordinate del client), o in fondo. */
  scrivi(punto?: { x: number; y: number }): void {
    const editor = this.editor;
    if (!editor) {
      this.inAttesa = { punto };
      return;
    }
    editor.setEditable(true, false);
    const pos = punto ? editor.view.posAtCoords({ left: punto.x, top: punto.y })?.pos : undefined;
    editor
      .chain()
      .focus(pos ?? 'end')
      .run();
  }
}
