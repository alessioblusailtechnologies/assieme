import { coloreEsadecimale, fasciaDaEditor, fasciaPerEditor, limiteSuperato } from './normalizza';

describe('normalizza', () => {
  it('i colori incollati diventano esadecimali, il resto si perde', () => {
    expect(coloreEsadecimale('rgb(47, 75, 124)')).toBe('#2f4b7c');
    expect(coloreEsadecimale('#ABC')).toBe('#aabbcc');
    expect(coloreEsadecimale('#2F4B7C')).toBe('#2f4b7c');
    expect(coloreEsadecimale('var(--c-accent)')).toBeUndefined();
    expect(coloreEsadecimale(null)).toBeUndefined();
  });

  it('toglie gli attributi vuoti e i paragrafi vuoti in coda', () => {
    const fascia = fasciaDaEditor({
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
                { type: 'textStyle', attrs: { color: null, fontSize: null } },
              ],
            },
          ],
        },
        { type: 'paragraph', attrs: { textAlign: 'left' } },
        { type: 'paragraph', attrs: { textAlign: null } },
      ],
    });
    expect(fascia).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Agenzia Rossi', marks: [{ type: 'bold' }] }],
        },
      ],
    });
  });

  it('un editor vuoto salva una fascia vuota, e una fascia vuota torna un paragrafo dove scrivere', () => {
    expect(fasciaDaEditor({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual({
      type: 'doc',
      content: [],
    });
    expect(fasciaPerEditor({ type: 'doc', content: [] })).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    });
  });

  it('i nodi fuori schema e le immagini senza id valido non passano', () => {
    const fascia = fasciaDaEditor({
      type: 'doc',
      content: [
        { type: 'bulletList', content: [] },
        { type: 'immagine', attrs: { id: '', larghezza: 30, allineamento: 'left' } },
        {
          type: 'immagine',
          attrs: { id: 'img-0123456789ab.png', larghezza: '400', allineamento: 'justify' },
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://x' } }] },
            { type: 'campo', attrs: { nome: 'pagina' } },
            { type: 'campo', attrs: { nome: 'inventato' } },
          ],
        },
      ],
    });
    expect(fascia.content).toEqual([
      {
        type: 'immagine',
        attrs: { id: 'img-0123456789ab.png', larghezza: 180, allineamento: 'left' },
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'link' },
          { type: 'campo', attrs: { nome: 'pagina' } },
        ],
      },
    ]);
  });

  it('il testo accanto resta solo dove ha un lato, con la distanza nei limiti', () => {
    const img = (attrs: Record<string, unknown>) =>
      fasciaDaEditor({
        type: 'doc',
        content: [
          { type: 'immagine', attrs: { id: 'img-0123456789ab.png', larghezza: 30, ...attrs } },
        ],
      }).content[0];
    expect(img({ allineamento: 'right', testo: 'accanto', distanza: 50 })).toEqual({
      type: 'immagine',
      attrs: {
        id: 'img-0123456789ab.png',
        larghezza: 30,
        allineamento: 'right',
        testo: 'accanto',
        distanza: 30,
      },
    });
    expect(img({ allineamento: 'center', testo: 'accanto', distanza: 5 })).toEqual({
      type: 'immagine',
      attrs: { id: 'img-0123456789ab.png', larghezza: 30, allineamento: 'center' },
    });
    expect(img({ allineamento: 'left', testo: 'sotto', distanza: 3 })).toEqual({
      type: 'immagine',
      attrs: { id: 'img-0123456789ab.png', larghezza: 30, allineamento: 'left' },
    });
  });

  it('un testo più lungo di 500 caratteri si spezza, con gli stessi segni', () => {
    const fascia = fasciaDaEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'a'.repeat(1200), marks: [{ type: 'italic' }] }],
        },
      ],
    });
    const pezzi = (fascia.content[0] as { content: { text: string; marks: unknown }[] }).content;
    expect(pezzi.map((p) => p.text.length)).toEqual([500, 500, 200]);
    expect(pezzi.every((p) => JSON.stringify(p.marks) === '[{"type":"italic"}]')).toBe(true);
  });

  it('le colonne restano colonne, e una colonna svuotata tiene un paragrafo', () => {
    const fascia = fasciaDaEditor({
      type: 'doc',
      content: [
        {
          type: 'colonne',
          content: [
            {
              type: 'colonna',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'sx' }] }],
            },
            { type: 'colonna', content: [] },
          ],
        },
      ],
    });
    expect(fascia.content).toEqual([
      {
        type: 'colonne',
        content: [
          {
            type: 'colonna',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'sx' }] }],
          },
          { type: 'colonna', content: [{ type: 'paragraph' }] },
        ],
      },
    ]);
  });

  it('dice il tetto superato prima che lo dica il server', () => {
    const molti = {
      type: 'doc' as const,
      content: Array.from({ length: 21 }, () => ({ type: 'paragraph' as const })),
    };
    expect(limiteSuperato(molti)).toMatch(/20/);
    expect(limiteSuperato({ type: 'doc', content: [] })).toBeUndefined();
  });
});
