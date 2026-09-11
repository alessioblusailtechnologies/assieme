import type { JSONContent } from '@tiptap/core';

import {
  Allineamento,
  Colonne,
  Dimensione,
  Fascia,
  Immagine,
  Inline,
  Marca,
  NomeCampo,
  Paragrafo,
} from '@core/models';

/**
 * Dal JSON di TipTap a quello del contratto (11/09/2026).
 *
 * L'editor produce già solo nodi dello schema, ma ci mette del suo: attributi
 * a `null`, un paragrafo vuoto in coda (serve a poter scrivere dopo un logo),
 * colori incollati come `rgb(…)`, larghezze lette dall'HTML come stringhe.
 * Qui si riportano alla forma che il backend valida, e che un'agenzia senza
 * niente di scritto salva come `content: []`.
 */

const ID_IMMAGINE = /^img-[0-9a-f]{12}\.(png|jpg)$/;
const ALLINEAMENTI: readonly Allineamento[] = ['left', 'center', 'right'];
const DIMENSIONI: readonly Dimensione[] = ['piccolo', 'normale', 'grande'];
const CAMPI: readonly NomeCampo[] = ['pagina', 'pagine', 'data', 'titolo', 'agenzia'];

/** Gli stessi tetti di `be-node/src/contratto/intestazione.ts`. */
export const LIMITI = { blocchi: 20, bloccoColonna: 10, inline: 60, testo: 500 } as const;

const allineamento = (valore: unknown): Allineamento | undefined =>
  ALLINEAMENTI.includes(valore as Allineamento) ? (valore as Allineamento) : undefined;

/** `#abc`, `#aabbcc` e `rgb(r, g, b)` diventano `#aabbcc`; il resto non è un colore. */
export function coloreEsadecimale(valore: unknown): string | undefined {
  if (typeof valore !== 'string') return undefined;
  const v = valore.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join('')}`;
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(v);
  if (!rgb) return undefined;
  return `#${rgb
    .slice(1, 4)
    .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function marche(grezze: JSONContent['marks']): Marca[] | undefined {
  const fuori: Marca[] = [];
  for (const m of grezze ?? []) {
    if (m.type === 'bold' || m.type === 'italic' || m.type === 'underline') {
      fuori.push({ type: m.type });
    } else if (m.type === 'textStyle') {
      const colore = coloreEsadecimale(m.attrs?.['color']);
      const dimensione = DIMENSIONI.includes(m.attrs?.['fontSize'] as Dimensione)
        ? (m.attrs?.['fontSize'] as Dimensione)
        : undefined;
      if (colore || (dimensione && dimensione !== 'normale')) {
        fuori.push({
          type: 'textStyle',
          attrs: {
            ...(colore && { color: colore }),
            ...(dimensione && dimensione !== 'normale' && { fontSize: dimensione }),
          },
        });
      }
    }
  }
  return fuori.length ? fuori : undefined;
}

function inline(nodi: JSONContent[] | undefined): Inline[] {
  const fuori: Inline[] = [];
  for (const n of nodi ?? []) {
    if (n.type === 'hardBreak') {
      fuori.push({ type: 'hardBreak' });
    } else if (n.type === 'campo') {
      const nome = n.attrs?.['nome'] as NomeCampo;
      if (!CAMPI.includes(nome)) continue;
      const m = marche(n.marks);
      fuori.push({ type: 'campo', attrs: { nome }, ...(m && { marks: m }) });
    } else if (n.type === 'text' && n.text) {
      const m = marche(n.marks);
      /* Un testo lungo si spezza a 500 caratteri: il server ne vuole di più corti, la carta non se ne accorge. */
      for (let i = 0; i < n.text.length; i += LIMITI.testo) {
        fuori.push({
          type: 'text',
          text: n.text.slice(i, i + LIMITI.testo),
          ...(m && { marks: m }),
        });
      }
    }
  }
  return fuori;
}

function paragrafo(n: JSONContent): Paragrafo {
  const allinea = allineamento(n.attrs?.['textAlign']);
  const contenuto = inline(n.content);
  return {
    type: 'paragraph',
    ...(allinea && allinea !== 'left' && { attrs: { textAlign: allinea } }),
    ...(contenuto.length && { content: contenuto }),
  };
}

function immagine(n: JSONContent): Immagine | undefined {
  const id = n.attrs?.['id'];
  if (typeof id !== 'string' || !ID_IMMAGINE.test(id)) return undefined;
  const larghezza = Math.round(Math.min(180, Math.max(5, Number(n.attrs?.['larghezza']) || 30)));
  const allinea = allineamento(n.attrs?.['allineamento']) ?? 'left';
  /* Il testo accanto si scrive solo quando c'è: al centro non esiste, e «sotto» è il comportamento di sempre. */
  const accanto = n.attrs?.['testo'] === 'accanto' && allinea !== 'center';
  const distanza = Math.round(Math.min(30, Math.max(0, Number(n.attrs?.['distanza'] ?? 3) || 0)));
  return {
    type: 'immagine',
    attrs: {
      id,
      larghezza,
      allineamento: allinea,
      ...(accanto && { testo: 'accanto' as const, distanza }),
    },
  };
}

function colonne(n: JSONContent): Colonne | undefined {
  const colonne = (n.content ?? [])
    .filter((c) => c.type === 'colonna')
    .map((c) => ({
      type: 'colonna' as const,
      content: (c.content ?? [])
        .map((b) =>
          b.type === 'paragraph' ? paragrafo(b) : b.type === 'immagine' ? immagine(b) : undefined,
        )
        .filter((b): b is Paragrafo | Immagine => !!b),
    }))
    .map((c) => (c.content.length ? c : { ...c, content: [{ type: 'paragraph' as const }] }));
  return colonne.length >= 2 ? { type: 'colonne', content: colonne.slice(0, 3) } : undefined;
}

const paragrafoVuoto = (b: Fascia['content'][number]): boolean =>
  b.type === 'paragraph' && !b.content?.length;

/** Il JSON dell'editor, portato alla forma del contratto. */
export function fasciaDaEditor(json: JSONContent): Fascia {
  const blocchi: Fascia['content'] = [];
  for (const n of json.content ?? []) {
    const b =
      n.type === 'paragraph'
        ? paragrafo(n)
        : n.type === 'immagine'
          ? immagine(n)
          : n.type === 'colonne'
            ? colonne(n)
            : undefined;
    if (b) blocchi.push(b);
  }
  /* I paragrafi vuoti in coda non si vedono nell'editor ma sulla carta occupano una riga. */
  while (blocchi.length && paragrafoVuoto(blocchi[blocchi.length - 1]!)) blocchi.pop();
  return { type: 'doc', content: blocchi };
}

/** Il primo tetto superato, detto a parole; `undefined` se la fascia sta nei limiti. */
export function limiteSuperato(fascia: Fascia): string | undefined {
  if (fascia.content.length > LIMITI.blocchi) {
    return `al massimo ${LIMITI.blocchi} righe e blocchi`;
  }
  const paragrafi: Paragrafo[] = [];
  for (const b of fascia.content) {
    if (b.type === 'paragraph') paragrafi.push(b);
    if (b.type === 'colonne') {
      for (const c of b.content) {
        if (c.content.length > LIMITI.bloccoColonna)
          return `al massimo ${LIMITI.bloccoColonna} righe per colonna`;
        for (const x of c.content) if (x.type === 'paragraph') paragrafi.push(x);
      }
    }
  }
  if (paragrafi.some((p) => (p.content?.length ?? 0) > LIMITI.inline))
    return 'una riga ha troppi pezzi di testo diversi';
  return undefined;
}

/** Il contenuto da dare all'editor: una fascia vuota è un paragrafo vuoto, dove mettere il cursore. */
export function fasciaPerEditor(fascia: Fascia): JSONContent {
  return fascia.content.length
    ? (fascia as JSONContent)
    : { type: 'doc', content: [{ type: 'paragraph' }] };
}
