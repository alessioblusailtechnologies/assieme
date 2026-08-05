import { htmlRisposta } from './testo-risposta';

describe('htmlRisposta', () => {
  it('separa i paragrafi sulla riga vuota', () => {
    expect(htmlRisposta('primo\n\nsecondo')).toBe('<p>primo</p><p>secondo</p>');
  });

  it('rende grassetto e codice in linea', () => {
    expect(htmlRisposta('**Massimale RC** a `6.450.000`')).toBe(
      '<p><strong>Massimale RC</strong> a <code>6.450.000</code></p>',
    );
  });

  it('un solo a-capo diventa interruzione di riga, non paragrafo', () => {
    expect(htmlRisposta('riga uno\nriga due')).toBe('<p>riga uno<br>riga due</p>');
  });

  it('neutralizza l HTML nel testo', () => {
    /* Il testo arriva dal server, ma finisce in [innerHTML]: qualunque
       markup passante deve uscire come testo, non come elemento. */
    expect(htmlRisposta('<img src=x> & <b>ciao</b>')).toBe(
      '<p>&lt;img src=x&gt; &amp; &lt;b&gt;ciao&lt;/b&gt;</p>',
    );
  });

  it('ignora paragrafi vuoti in testa e in coda', () => {
    expect(htmlRisposta('\n\ntesto\n\n')).toBe('<p>testo</p>');
  });
});
