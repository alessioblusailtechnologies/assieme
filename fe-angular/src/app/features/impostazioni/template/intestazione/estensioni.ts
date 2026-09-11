import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

import {
  Allineamento,
  Dimensione,
  ETICHETTE_CAMPO,
  NomeCampo,
  PUNTI_DIMENSIONE,
} from '@core/models';

/**
 * I pezzi dello schema vincolato che TipTap non ha già (11/09/2026).
 *
 * I nomi sono quelli del contratto (`be-node/src/contratto/intestazione.ts`):
 * `campo`, `immagine`, `colonne`, `colonna`, e l'attributo `fontSize` del
 * `textStyle`. Il JSON che esce dall'editor è quello che il backend valida,
 * senza traduzioni in mezzo: se l'editor non sa fare una cosa, il server
 * non la riceve.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    campo: {
      inserisciCampo: (nome: NomeCampo) => ReturnType;
    };
    immagine: {
      inserisciImmagine: (attrs: {
        id: string;
        larghezza: number;
        allineamento: Allineamento;
      }) => ReturnType;
      impostaImmagine: (
        attrs: Partial<{ larghezza: number; allineamento: Allineamento }>,
      ) => ReturnType;
    };
    colonne: {
      inserisciColonne: (quante: 2 | 3) => ReturnType;
      togliColonne: () => ReturnType;
      testoAccanto: () => ReturnType;
    };
    dimensione: {
      impostaDimensione: (dimensione: Dimensione) => ReturnType;
    };
  }
}

/** Un campo che il motore risolve al momento di generare: nell'editor è una targhetta. */
export const Campo = Node.create({
  name: 'campo',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      nome: {
        default: 'pagina',
        parseHTML: (el) => el.getAttribute('data-campo'),
        renderHTML: (attrs) => ({ 'data-campo': attrs['nome'] }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-campo]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'campo-fascia', contenteditable: 'false' }),
      ETICHETTE_CAMPO[node.attrs['nome'] as NomeCampo] ?? node.attrs['nome'],
    ];
  },

  renderText({ node }) {
    return `{${node.attrs['nome']}}`;
  },

  addCommands() {
    return {
      inserisciCampo:
        (nome) =>
        ({ commands }) =>
          commands.insertContent({ type: 'campo', attrs: { nome } }),
    };
  },
});

export interface OpzioniImmagine {
  /** Dall'id all'indirizzo da mostrare: l'immagine si scarica col token, non da un `src` nudo. */
  risolvi: (id: string) => Promise<string | undefined>;
}

/** Un logo o un marchio, largo quanti millimetri si vuole sulla carta. */
export const Immagine = Node.create<OpzioniImmagine>({
  name: 'immagine',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { risolvi: () => Promise.resolve(undefined) };
  },

  /* Negli attributi `data-`, e non in `id`: un copia e incolla fra le due fasce ripassa dall'HTML. */
  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-id') ?? '',
        renderHTML: (attrs) => ({ 'data-id': attrs['id'] }),
      },
      larghezza: {
        default: 30,
        parseHTML: (el) => Number(el.getAttribute('data-larghezza')) || 30,
        renderHTML: (attrs) => ({ 'data-larghezza': attrs['larghezza'] }),
      },
      allineamento: {
        default: 'left',
        parseHTML: (el) => el.getAttribute('data-allineamento') ?? 'left',
        renderHTML: (attrs) => ({ 'data-allineamento': attrs['allineamento'] }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-immagine]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-immagine': '' })];
  },

  addNodeView() {
    const risolvi = this.options.risolvi;
    return ({ node }) => {
      const dom = document.createElement('figure');
      dom.className = 'immagine-fascia';
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      dom.append(img);
      let idCorrente = '';
      const applica = (n: typeof node): void => {
        dom.style.textAlign = n.attrs['allineamento'] as string;
        /* `--mm` è un millimetro alla scala del foglio (`editor-intestazione.scss`). */
        img.style.width = `calc(${n.attrs['larghezza'] as number} * var(--mm, 1mm))`;
        const id = n.attrs['id'] as string;
        if (id !== idCorrente) {
          idCorrente = id;
          void risolvi(id).then((url) => {
            if (url && idCorrente === id) img.src = url;
          });
        }
      };
      applica(node);
      return {
        dom,
        update: (aggiornato) => {
          if (aggiornato.type.name !== 'immagine') return false;
          applica(aggiornato);
          return true;
        },
        selectNode: () => dom.classList.add('is-selezionata'),
        deselectNode: () => dom.classList.remove('is-selezionata'),
      };
    };
  },

  addCommands() {
    return {
      inserisciImmagine:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: 'immagine', attrs }),
      impostaImmagine:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes('immagine', attrs),
    };
  },
});

/** Una colonna: paragrafi e immagini, niente colonne dentro colonne. */
export const Colonna = Node.create({
  name: 'colonna',
  content: '(paragraph | immagine)+',
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-colonna]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-colonna': '', class: 'colonna-fascia' }),
      0,
    ];
  },
});

/** Una riga a due o tre colonne: il logo a sinistra e i recapiti a destra, per dire. */
export const Colonne = Node.create({
  name: 'colonne',
  group: 'block',
  content: 'colonna{2,3}',
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-colonne]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-colonne': '', class: 'colonne-fascia' }),
      0,
    ];
  },

  addCommands() {
    return {
      inserisciColonne:
        (quante) =>
        ({ commands }) =>
          commands.insertContent({
            type: 'colonne',
            content: Array.from({ length: quante }, () => ({
              type: 'colonna',
              content: [{ type: 'paragraph' }],
            })),
          }),

      /* Le colonne se ne vanno e il loro contenuto resta, una colonna dopo l'altra. */
      togliColonne:
        () =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          for (let profondita = $from.depth; profondita > 0; profondita--) {
            const nodo = $from.node(profondita);
            if (nodo.type.name !== 'colonne') continue;
            const inizio = $from.before(profondita);
            const blocchi: (typeof nodo)[] = [];
            nodo.forEach((colonna) => colonna.forEach((blocco) => blocchi.push(blocco)));
            if (dispatch) dispatch(state.tr.replaceWith(inizio, inizio + nodo.nodeSize, blocchi));
            return true;
          }
          return false;
        },

      /*
       * Il testo accanto a un logo: l'immagine è un blocco e occupa la sua
       * riga, così resta identica in PDF e in Word. Per scriverle a fianco
       * diventa la prima di due colonne, e il cursore va nella seconda.
       */
      testoAccanto:
        () =>
        ({ state, tr, dispatch }) => {
          const { selection, schema } = state;
          if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'immagine')
            return false;
          for (let profondita = selection.$from.depth; profondita > 0; profondita--) {
            if (selection.$from.node(profondita).type.name === 'colonne') return false;
          }
          const tipi = schema.nodes;
          const prima = tipi['colonna']!.create(null, selection.node);
          const riga = tipi['colonne']!.create(null, [
            prima,
            tipi['colonna']!.create(null, tipi['paragraph']!.create()),
          ]);
          if (dispatch) {
            tr.replaceWith(selection.from, selection.to, riga);
            /* Dentro la riga, oltre la prima colonna, dentro la seconda e il suo paragrafo. */
            const cursore = selection.from + 1 + prima.nodeSize + 2;
            tr.setSelection(TextSelection.create(tr.doc, cursore)).scrollIntoView();
          }
          return true;
        },
    };
  },
});

/**
 * I tre corpi del testo, come attributo del `textStyle`: `piccolo`,
 * `grande`, e nessun valore per `normale`. Le misure sono in punti, le
 * stesse del motore, alla scala del foglio (`--pt`): così un a capo
 * nell'editor è un a capo nel PDF.
 */
export const DimensioneTesto = Extension.create({
  name: 'dimensione',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-dimensione'),
            renderHTML: (attrs) => {
              const dimensione = attrs['fontSize'] as Dimensione | null;
              return dimensione
                ? {
                    'data-dimensione': dimensione,
                    style: `font-size: calc(${PUNTI_DIMENSIONE[dimensione]} * var(--pt, 1pt))`,
                  }
                : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      impostaDimensione:
        (dimensione) =>
        ({ chain }) =>
          dimensione === 'normale'
            ? chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
            : chain().setMark('textStyle', { fontSize: dimensione }).run(),
    };
  },
});
