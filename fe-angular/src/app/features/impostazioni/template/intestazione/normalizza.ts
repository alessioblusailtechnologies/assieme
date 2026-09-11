import type { JSONContent } from '@tiptap/core';

import {
  ALTEZZA_MASSIMA_FASCIA,
  Allineamento,
  Ancoraggio,
  CORPO_BASE,
  CORPO_MASSIMO,
  CORPO_MINIMO,
  COLORE_TESTO,
  Elemento,
  Famiglia,
  Fascia,
  Inline,
  LARGHEZZA_FOGLIO,
  Marca,
  NomeCampo,
  Paragrafo,
} from '@core/models';

/**
 * Dalla tela dell'editor al contratto (11/09/2026).
 *
 * TipTap ci mette del suo nel testo delle caselle (attributi a `null`,
 * colori incollati come `rgb(…)`), e il trascinamento lascia coordinate coi
 * decimali del pixel. Qui tutto torna alla forma che il backend valida:
 * millimetri al decimo, corpi al mezzo punto, colori esadecimali, ogni
 * elemento dentro la sua fascia.
 */

const ID_IMMAGINE = /^img-[0-9a-f]{12}\.(png|jpg)$/;
const ID_ELEMENTO = /^[A-Za-z0-9_-]{1,40}$/;
const ALLINEAMENTI: readonly Allineamento[] = ['left', 'center', 'right'];
const ANCORAGGI: readonly Ancoraggio[] = ['top', 'middle', 'bottom'];
const FAMIGLIE: readonly Famiglia[] = ['sans', 'serif', 'mono'];
const CAMPI: readonly NomeCampo[] = ['pagina', 'pagine', 'data', 'titolo', 'agenzia'];

/** Gli stessi tetti di `be-node/src/contratto/intestazione.ts`. */
export const LIMITI = { elementi: 40, paragrafi: 30, inline: 80, testo: 500 } as const;

/** Un millimetro al decimo: la precisione che si salva. */
export const decimo = (mm: number): number => Math.round(mm * 10) / 10;

const entro = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const numero = (v: unknown, riserva: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : riserva;
};

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

/** Un corpo in punti, al mezzo punto e nei limiti; `undefined` se non è un numero. */
export function corpoValido(valore: unknown): number | undefined {
  const n = Number(valore);
  if (valore === null || valore === '' || !Number.isFinite(n) || n <= 0) return undefined;
  return entro(Math.round(n * 2) / 2, CORPO_MINIMO, CORPO_MASSIMO);
}

function marche(grezze: JSONContent['marks']): Marca[] | undefined {
  const fuori: Marca[] = [];
  for (const m of grezze ?? []) {
    if (m.type === 'bold' || m.type === 'italic' || m.type === 'underline') {
      fuori.push({ type: m.type });
    } else if (m.type === 'textStyle') {
      const color = coloreEsadecimale(m.attrs?.['color']);
      const fontSize = corpoValido(m.attrs?.['fontSize']);
      const famiglia = m.attrs?.['fontFamily'] as Famiglia;
      const fontFamily = FAMIGLIE.includes(famiglia) ? famiglia : undefined;
      if (color || fontSize || fontFamily) {
        fuori.push({
          type: 'textStyle',
          attrs: {
            ...(color && { color }),
            ...(fontSize && { fontSize }),
            ...(fontFamily && { fontFamily }),
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
  const allinea = n.attrs?.['textAlign'] as Allineamento;
  const contenuto = inline(n.content);
  return {
    type: 'paragraph',
    ...(ALLINEAMENTI.includes(allinea) && allinea !== 'left' && { attrs: { textAlign: allinea } }),
    ...(contenuto.length && { content: contenuto }),
  };
}

/** Il testo di una casella, dal JSON dell'editor (o dal contratto stesso) ai paragrafi del contratto: sempre almeno uno. */
export function paragrafiDaEditor(json: JSONContent | JSONContent[] | undefined): Paragrafo[] {
  const nodi = Array.isArray(json) ? json : (json?.content ?? []);
  const paragrafi = nodi.filter((n) => n.type === 'paragraph').map(paragrafo);
  return paragrafi.length ? paragrafi : [{ type: 'paragraph' }];
}

/** Una casella senza testo né campi: se ne va quando si smette di scriverci. */
export function testoVuoto(paragrafi: readonly Paragrafo[]): boolean {
  return paragrafi.every((p) => !p.content?.some((n) => n.type !== 'hardBreak'));
}

function elemento(e: Elemento, altezzaFascia: number): Elemento | undefined {
  if (typeof e?.id !== 'string' || !ID_ELEMENTO.test(e.id)) return undefined;
  const larghezza = decimo(entro(numero(e.larghezza, 10), 0.1, LARGHEZZA_FOGLIO));
  const altezza = decimo(entro(numero(e.altezza, 5), 0.1, ALTEZZA_MASSIMA_FASCIA));
  const geometria = {
    id: e.id,
    x: decimo(entro(numero(e.x, 0), 0, LARGHEZZA_FOGLIO - larghezza)),
    y: decimo(entro(numero(e.y, 0), 0, Math.max(0, altezzaFascia - altezza))),
    larghezza,
    altezza,
  };
  if (e.tipo === 'testo') {
    return {
      tipo: 'testo',
      ...geometria,
      verticale: ANCORAGGI.includes(e.verticale) ? e.verticale : 'top',
      dimensione: corpoValido(e.dimensione) ?? CORPO_BASE,
      famiglia: FAMIGLIE.includes(e.famiglia) ? e.famiglia : 'sans',
      colore: coloreEsadecimale(e.colore) ?? COLORE_TESTO,
      paragrafi: paragrafiDaEditor(e.paragrafi as JSONContent[]),
    };
  }
  if (e.tipo === 'immagine') {
    return ID_IMMAGINE.test(e.immagine)
      ? { tipo: 'immagine', ...geometria, immagine: e.immagine }
      : undefined;
  }
  if (e.tipo === 'forma') {
    return { tipo: 'forma', ...geometria, colore: coloreEsadecimale(e.colore) ?? COLORE_TESTO };
  }
  return undefined;
}

/**
 * La fascia nella forma del contratto: alta almeno quanto il suo elemento
 * più basso (lo schema del server rifiuta chi ne esce), gli elementi dentro
 * il foglio, quelli che non si sanno riprodurre fuori.
 */
export function fasciaNormalizzata(fascia: Fascia): Fascia {
  const grezzi = fascia.elementi ?? [];
  const fondo = Math.max(0, ...grezzi.map((e) => numero(e.y, 0) + numero(e.altezza, 0)));
  const altezza = grezzi.length
    ? decimo(entro(Math.max(numero(fascia.altezza, 0), fondo), 0, ALTEZZA_MASSIMA_FASCIA))
    : 0;
  return {
    altezza,
    elementi: grezzi.flatMap((e) => elemento(e, altezza) ?? []),
  };
}

/** Il primo tetto superato, detto a parole; `undefined` se la fascia sta nei limiti. */
export function limiteSuperato(fascia: Fascia): string | undefined {
  if (fascia.elementi.length > LIMITI.elementi) return `al massimo ${LIMITI.elementi} elementi`;
  for (const e of fascia.elementi) {
    if (e.tipo !== 'testo') continue;
    if (e.paragrafi.length > LIMITI.paragrafi)
      return `al massimo ${LIMITI.paragrafi} righe per casella di testo`;
    if (e.paragrafi.some((p) => (p.content?.length ?? 0) > LIMITI.inline))
      return 'una riga ha troppi pezzi di testo diversi';
  }
  return undefined;
}
