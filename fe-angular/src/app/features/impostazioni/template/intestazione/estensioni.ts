import { Extension, Node, mergeAttributes } from '@tiptap/core';

import {
  CORPO_MASSIMO,
  CORPO_MINIMO,
  ETICHETTE_CAMPO,
  FONT_FAMIGLIA,
  Famiglia,
  NomeCampo,
} from '@core/models';

/**
 * I pezzi dello schema vincolato che TipTap non ha già (11/09/2026), per il
 * testo di una casella della tela.
 *
 * I nomi sono quelli del contratto (`be-node/src/contratto/intestazione.ts`):
 * il nodo `campo`, e gli attributi `fontSize` (in punti) e `fontFamily`
 * (`sans`, `serif`, `mono`) del `textStyle`. Il JSON che esce dall'editor è
 * quello che il backend valida, senza traduzioni in mezzo.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    campo: {
      inserisciCampo: (nome: NomeCampo) => ReturnType;
    };
    stileTesto: {
      /** `null` torna al corpo della casella. */
      impostaCorpo: (punti: number | null) => ReturnType;
      /** `null` torna alla famiglia della casella. */
      impostaFamiglia: (famiglia: Famiglia | null) => ReturnType;
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

/** Un corpo incollato da fuori: `12pt`, o `16px` che sono 12 punti. */
function corpoDaStile(valore: string): number | null {
  const m = /^([\d.]+)(pt|px)$/.exec(valore.trim());
  if (!m) return null;
  const punti = m[2] === 'px' ? Number(m[1]) * 0.75 : Number(m[1]);
  return Number.isFinite(punti) && punti >= CORPO_MINIMO && punti <= CORPO_MASSIMO
    ? Math.round(punti * 2) / 2
    : null;
}

/** Una famiglia incollata da fuori, riportata alle tre che il PDF conosce; le altre tornano a quella della casella. */
function famigliaDaStile(valore: string): Famiglia | null {
  const v = valore.toLowerCase();
  if (/courier|mono/.test(v)) return 'mono';
  if (/times|georgia|garamond|(^|[^-])serif/.test(v)) return 'serif';
  return null;
}

/**
 * Corpo e famiglia come attributi del `textStyle`, accanto al colore. Le
 * misure sono alla scala del foglio (`--pt`), così un a capo nell'editor
 * cade dove cade nel PDF.
 */
export const StileTesto = Extension.create({
  name: 'stileTesto',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => {
              const dato = Number(el.getAttribute('data-corpo'));
              return dato || corpoDaStile(el.style.fontSize);
            },
            renderHTML: (attrs) => {
              const punti = attrs['fontSize'] as number | null;
              return punti
                ? { 'data-corpo': punti, style: `font-size: calc(${punti} * var(--pt, 1pt))` }
                : {};
            },
          },
          fontFamily: {
            default: null,
            parseHTML: (el) =>
              (el.getAttribute('data-famiglia') as Famiglia | null) ??
              famigliaDaStile(el.style.fontFamily),
            renderHTML: (attrs) => {
              const famiglia = attrs['fontFamily'] as Famiglia | null;
              return famiglia && FONT_FAMIGLIA[famiglia]
                ? { 'data-famiglia': famiglia, style: `font-family: ${FONT_FAMIGLIA[famiglia]}` }
                : {};
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      impostaCorpo:
        (punti) =>
        ({ chain }) =>
          punti
            ? chain().setMark('textStyle', { fontSize: punti }).run()
            : chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
      impostaFamiglia:
        (famiglia) =>
        ({ chain }) =>
          famiglia
            ? chain().setMark('textStyle', { fontFamily: famiglia }).run()
            : chain().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run(),
    };
  },
});
