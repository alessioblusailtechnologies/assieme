import { ElementoTesto, Fascia } from '@core/models';
import {
  coloreEsadecimale,
  corpoValido,
  fasciaNormalizzata,
  limiteSuperato,
  paragrafiDaEditor,
  testoVuoto,
} from './normalizza';

const casella = (altro: Partial<ElementoTesto> = {}): ElementoTesto => ({
  tipo: 'testo',
  id: 't1',
  x: 20,
  y: 2,
  larghezza: 60,
  altezza: 5,
  verticale: 'top',
  dimensione: 9,
  famiglia: 'sans',
  colore: '#262626',
  paragrafi: [{ type: 'paragraph', content: [{ type: 'text', text: 'Agenzia Rossi' }] }],
  ...altro,
});

describe('normalizza', () => {
  it('i colori incollati diventano esadecimali, il resto si perde', () => {
    expect(coloreEsadecimale('rgb(47, 75, 124)')).toBe('#2f4b7c');
    expect(coloreEsadecimale('#ABC')).toBe('#aabbcc');
    expect(coloreEsadecimale('#2F4B7C')).toBe('#2f4b7c');
    expect(coloreEsadecimale('var(--c-accent)')).toBeUndefined();
    expect(coloreEsadecimale(null)).toBeUndefined();
  });

  it('i corpi vanno al mezzo punto, dentro i limiti del motore', () => {
    expect(corpoValido('9.3')).toBe(9.5);
    expect(corpoValido(3)).toBe(5);
    expect(corpoValido(200)).toBe(72);
    expect(corpoValido('')).toBeUndefined();
    expect(corpoValido(null)).toBeUndefined();
  });

  it('il testo di una casella: attributi vuoti via, segni nella forma del contratto', () => {
    const paragrafi = paragrafiDaEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null },
          content: [
            {
              type: 'text',
              text: 'Agenzia Rossi',
              marks: [
                { type: 'bold' },
                {
                  type: 'textStyle',
                  attrs: { color: 'rgb(200, 0, 0)', fontSize: '12', fontFamily: 'serif' },
                },
                {
                  type: 'textStyle',
                  attrs: { color: null, fontSize: null, fontFamily: 'Comic Sans' },
                },
                { type: 'link', attrs: { href: 'https://x' } },
              ],
            },
          ],
        },
        { type: 'paragraph', attrs: { textAlign: 'left' } },
        { type: 'bulletList', content: [] },
        {
          type: 'paragraph',
          attrs: { textAlign: 'right' },
          content: [{ type: 'campo', attrs: { nome: 'inventato' } }],
        },
      ],
    });
    expect(paragrafi).toEqual([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Agenzia Rossi',
            marks: [
              { type: 'bold' },
              { type: 'textStyle', attrs: { color: '#c80000', fontSize: 12, fontFamily: 'serif' } },
            ],
          },
        ],
      },
      { type: 'paragraph' },
      { type: 'paragraph', attrs: { textAlign: 'right' } },
    ]);
  });

  it('una casella ha sempre almeno un paragrafo, e senza testo né campi è vuota', () => {
    expect(paragrafiDaEditor({ type: 'doc', content: [] })).toEqual([{ type: 'paragraph' }]);
    expect(
      testoVuoto([{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'hardBreak' }] }]),
    ).toBe(true);
    expect(
      testoVuoto([{ type: 'paragraph', content: [{ type: 'campo', attrs: { nome: 'pagina' } }] }]),
    ).toBe(false);
  });

  it('un testo più lungo di 500 caratteri si spezza, con gli stessi segni', () => {
    const [p] = paragrafiDaEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'a'.repeat(1200), marks: [{ type: 'italic' }] }],
        },
      ],
    });
    const pezzi = p!.content as { text: string; marks: unknown }[];
    expect(pezzi.map((x) => x.text.length)).toEqual([500, 500, 200]);
    expect(pezzi.every((x) => JSON.stringify(x.marks) === '[{"type":"italic"}]')).toBe(true);
  });

  it('la fascia: millimetri al decimo, tutto dentro il foglio, alta quanto il suo elemento più basso', () => {
    const fascia = fasciaNormalizzata({
      altezza: 10,
      elementi: [
        casella({ x: 199.456, y: 7.04, larghezza: 30, altezza: 8.66 }),
        {
          tipo: 'immagine',
          id: 'i1',
          x: -4,
          y: 0,
          larghezza: 30,
          altezza: 12.34,
          immagine: 'img-0123456789ab.png',
        },
        {
          tipo: 'immagine',
          id: 'i2',
          x: 0,
          y: 0,
          larghezza: 30,
          altezza: 12,
          immagine: '../logo.png',
        },
        {
          tipo: 'forma',
          id: 'f1',
          x: 20,
          y: 3,
          larghezza: 170,
          altezza: 0.3,
          colore: 'rgb(47, 75, 124)',
        },
      ],
    });
    /* Il testo spostato dentro il bordo destro; la fascia allungata sotto la casella (7 + 8,7). */
    expect(fascia.altezza).toBe(15.7);
    expect(fascia.elementi).toEqual([
      { ...casella(), x: 180, y: 7, larghezza: 30, altezza: 8.7 },
      {
        tipo: 'immagine',
        id: 'i1',
        x: 0,
        y: 0,
        larghezza: 30,
        altezza: 12.3,
        immagine: 'img-0123456789ab.png',
      },
      { tipo: 'forma', id: 'f1', x: 20, y: 3, larghezza: 170, altezza: 0.3, colore: '#2f4b7c' },
    ]);
  });

  it('una fascia senza elementi è alta zero, e i valori strani di una casella tornano a quelli di sempre', () => {
    expect(fasciaNormalizzata({ altezza: 30, elementi: [] })).toEqual({ altezza: 0, elementi: [] });
    const [e] = fasciaNormalizzata({
      altezza: 10,
      elementi: [
        casella({
          verticale: 'giu' as never,
          dimensione: Number.NaN,
          famiglia: 'Arial' as never,
          colore: 'blu',
        }),
      ],
    }).elementi;
    expect(e).toMatchObject({
      verticale: 'top',
      dimensione: 9,
      famiglia: 'sans',
      colore: '#262626',
    });
  });

  it('dice il tetto superato prima che lo dica il server', () => {
    const molti: Fascia = {
      altezza: 20,
      elementi: Array.from({ length: 41 }, (_, i) => casella({ id: `t${i}` })),
    };
    expect(limiteSuperato(molti)).toMatch(/40/);
    const righe: Fascia = {
      altezza: 20,
      elementi: [
        casella({ paragrafi: Array.from({ length: 31 }, () => ({ type: 'paragraph' as const })) }),
      ],
    };
    expect(limiteSuperato(righe)).toMatch(/30/);
    expect(limiteSuperato({ altezza: 0, elementi: [] })).toBeUndefined();
  });
});
