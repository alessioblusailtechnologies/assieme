import { Paragrafo } from '@core/models';
import {
  allineamentoComune,
  conAllineamento,
  conSegno,
  senzaStile,
  tuttiConSegno,
  valoreComune,
} from './testo';

const PARAGRAFI: Paragrafo[] = [
  {
    type: 'paragraph',
    content: [
      { type: 'text', text: 'Agenzia ', marks: [{ type: 'bold' }] },
      {
        type: 'text',
        text: 'Rossi',
        marks: [{ type: 'textStyle', attrs: { fontSize: 12, color: '#2f4b7c' } }],
      },
    ],
  },
  {
    type: 'paragraph',
    attrs: { textAlign: 'right' },
    content: [{ type: 'hardBreak' }, { type: 'campo', attrs: { nome: 'pagina' } }],
  },
];

describe('il testo di tutta la casella', () => {
  it('il grassetto su tutto, e via da tutto', () => {
    expect(tuttiConSegno(PARAGRAFI, 'bold')).toBe(false);
    const acceso = conSegno(PARAGRAFI, 'bold', true);
    expect(tuttiConSegno(acceso, 'bold')).toBe(true);
    /* Un segno solo per pezzo, anche dove c'era già. */
    expect(acceso[0]!.content![0]).toEqual({
      type: 'text',
      text: 'Agenzia ',
      marks: [{ type: 'bold' }],
    });
    const spento = conSegno(acceso, 'bold', false);
    expect(tuttiConSegno(spento, 'bold')).toBe(false);
    expect(spento[1]!.content![1]).toEqual({ type: 'campo', attrs: { nome: 'pagina' } });
  });

  it('togliere il corpo ai pezzi lascia il colore, e torna a valere quello della casella', () => {
    const senza = senzaStile(PARAGRAFI, 'fontSize');
    expect(senza[0]!.content![1]).toEqual({
      type: 'text',
      text: 'Rossi',
      marks: [{ type: 'textStyle', attrs: { color: '#2f4b7c' } }],
    });
    expect(valoreComune(senza, 'fontSize', 9)).toBe(9);
    expect(valoreComune(PARAGRAFI, 'fontSize', 9)).toBeUndefined();
    expect(senzaStile(senzaStile(PARAGRAFI, 'fontSize'), 'color')[0]!.content![1]).toEqual({
      type: 'text',
      text: 'Rossi',
    });
  });

  it('l’allineamento di tutti i paragrafi', () => {
    expect(allineamentoComune(PARAGRAFI)).toBeUndefined();
    const centrati = conAllineamento(PARAGRAFI, 'center');
    expect(allineamentoComune(centrati)).toBe('center');
    expect(conAllineamento(centrati, 'left')[1]).toEqual({
      type: 'paragraph',
      content: PARAGRAFI[1]!.content,
    });
  });
});
