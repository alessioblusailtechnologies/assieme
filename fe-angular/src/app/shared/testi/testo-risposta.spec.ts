import { htmlRisposta } from './testo-risposta';

describe('htmlRisposta', () => {
  it('separa i paragrafi sulla riga vuota', () => {
    expect(htmlRisposta('primo\n\nsecondo')).toBe('<p>primo</p><p>secondo</p>');
  });

  it('rende grassetto, corsivo e codice in linea', () => {
    expect(htmlRisposta('**Massimale RC** a `6.450.000`')).toBe(
      '<p><strong>Massimale RC</strong> a <code>6.450.000</code></p>',
    );
    expect(htmlRisposta('Franchigia € 200 *(Condizioni di Assicurazione, pag. 103)*.')).toBe(
      '<p>Franchigia € 200 <em>(Condizioni di Assicurazione, pag. 103)</em>.</p>',
    );
    expect(htmlRisposta('2 * 3 * 4 e **forte**')).toBe('<p>2 * 3 * 4 e <strong>forte</strong></p>');
  });

  it('un solo a-capo diventa interruzione di riga, non paragrafo', () => {
    expect(htmlRisposta('riga uno\nriga due')).toBe('<p>riga uno<br>riga due</p>');
  });

  it('neutralizza l HTML nel testo, anche dentro tabelle e titoli', () => {
    /* Il testo arriva dal server, ma finisce in [innerHTML]: qualunque
       markup passante deve uscire come testo, non come elemento. */
    expect(htmlRisposta('<img src=x> & <b>ciao</b>')).toBe(
      '<p>&lt;img src=x&gt; &amp; &lt;b&gt;ciao&lt;/b&gt;</p>',
    );
    expect(htmlRisposta('## <script>x</script>')).toBe('<h4>&lt;script&gt;x&lt;/script&gt;</h4>');
    expect(htmlRisposta('| a |\n|---|\n| <i>b</i> |')).toContain('<td>&lt;i&gt;b&lt;/i&gt;</td>');
  });

  it('ignora paragrafi vuoti in testa e in coda', () => {
    expect(htmlRisposta('\n\ntesto\n\n')).toBe('<p>testo</p>');
  });

  it('i titoli scendono di due livelli: dentro la bolla il massimo è h3', () => {
    expect(htmlRisposta('# Uno\n## Due\n### Tre\n#### Quattro')).toBe(
      '<h3>Uno</h3><h4>Due</h4><h5>Tre</h5><h5>Quattro</h5>',
    );
    expect(htmlRisposta('## In breve\nLa polizza è…')).toBe('<h4>In breve</h4><p>La polizza è…</p>');
  });

  it('le tabelle: intestazione, riga separatrice ignorata, celle con markdown in linea', () => {
    const md = '| Garanzia | Fonte |\n|---|---|\n| **R.C.A.** | *CdA, pag. 62* |\n| C.V.T. | pag. 76 |';
    expect(htmlRisposta(md)).toBe(
      '<div class="tabella"><table>' +
        '<thead><tr><th>Garanzia</th><th>Fonte</th></tr></thead>' +
        '<tbody><tr><td><strong>R.C.A.</strong></td><td><em>CdA, pag. 62</em></td></tr><tr><td>C.V.T.</td><td>pag. 76</td></tr></tbody>' +
        '</table></div>',
    );
    // In streaming una tabella può essere solo l'intestazione: si rende lo stesso.
    expect(htmlRisposta('| a | b |\n|---|---|')).toBe(
      '<div class="tabella"><table><thead><tr><th>a</th><th>b</th></tr></thead></table></div>',
    );
  });

  it('elenchi puntati e numerati, con le righe rientrate nella stessa voce', () => {
    expect(htmlRisposta('- uno\n- due\n  continua\n- tre')).toBe('<ul><li>uno</li><li>due continua</li><li>tre</li></ul>');
    expect(htmlRisposta('1. **Regolarità pura**: resta\n2. Corsi di guida')).toBe(
      '<ol><li><strong>Regolarità pura</strong>: resta</li><li>Corsi di guida</li></ol>',
    );
  });

  it('citazioni in blocco e righe orizzontali', () => {
    expect(htmlRisposta('> «Furto e Rapina | € 15.200» (pag. 2)')).toBe(
      '<blockquote><p>«Furto e Rapina | € 15.200» (pag. 2)</p></blockquote>',
    );
    expect(htmlRisposta('prima\n\n---\n\ndopo')).toBe('<p>prima</p><hr><p>dopo</p>');
  });

  it('un blocco che comincia subito dopo un paragrafo chiude il paragrafo', () => {
    expect(htmlRisposta('Testo\n## Titolo\n- voce')).toBe('<p>Testo</p><h4>Titolo</h4><ul><li>voce</li></ul>');
  });
});
