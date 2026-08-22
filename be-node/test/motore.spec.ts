import { describe, expect, it } from 'vitest';

import { titoloDaMessaggio } from '../src/contratto/conversazioni.js';
import { FlussoTesto } from '../src/worker/motore/flusso-testo.js';
import { MARCATORE_CITAZIONI, promptSistema, promptUtente, type DnaAgenzia } from '../src/worker/motore/regole.js';
import { dentro, etichettaAttivita } from '../src/worker/motore/sessione.js';
import {
  ErroreValidazione,
  limiteInoltro,
  margineMarcatore,
  normalizzaPath,
  separaBlocco,
  validaBlocco,
} from '../src/worker/motore/validazione.js';
import { percorsoNellaWorkspace, slug, type DocumentoWorkspace } from '../src/worker/motore/workspace.js';

/**
 * Le parti pure del motore: senza database, senza SDK, senza rete. Sono le
 * regole con cui il worker legge e verifica ciò che il modello produce.
 */

const doc = (parziale: Partial<DocumentoWorkspace> & { id: string; titolo: string }): DocumentoWorkspace => ({
  archivio: 'pubblico',
  tipologia: 'dip',
  numeroPagine: 10,
  paginaMassima: 10,
  compagnia: null,
  ramo: null,
  compagniaId: null,
  ramoId: null,
  prodotto: null,
  edizione: null,
  riferimentoCliente: null,
  etichette: [],
  documentoDiRiferimento: false,
  ...parziale,
});

const dnaVuoto: DnaAgenzia = { istruzioni: [], riferimenti: [], ricordi: [] };

describe('il blocco velia-citazioni', () => {
  it('si separa dal testo visibile e si legge anche con testo dopo la chiusura', () => {
    const testo = `Risposta con fonte *(DIP, pag. 3)*.\n\n${MARCATORE_CITAZIONI}\n{"citazioni":[{"file":"a/dip.md","pagina":3,"estratto":"franchigia € 200"}],"provenienze":[],"nonSupportato":false}\n\`\`\`\n`;
    const { visibile, blocco, problemi } = separaBlocco(testo);
    expect(visibile).toBe('Risposta con fonte *(DIP, pag. 3)*.');
    expect(problemi).toEqual([]);
    expect(blocco?.citazioni[0]).toMatchObject({ file: 'a/dip.md', pagina: 3 });
  });

  it('senza blocco o con JSON rotto: visibile intero e problema dichiarato', () => {
    expect(separaBlocco('Solo testo.').problemi[0]).toMatch(/mancante/);
    const rotto = separaBlocco(`Testo\n${MARCATORE_CITAZIONI}\n{non json\n\`\`\``);
    expect(rotto.visibile).toBe('Testo');
    expect(rotto.blocco).toBeUndefined();
    expect(rotto.problemi[0]).toMatch(/non valido/);
  });

  it('margineMarcatore trattiene solo la coda che potrebbe essere l’inizio del marcatore', () => {
    expect(margineMarcatore('Testo normale.')).toBe(0);
    expect(margineMarcatore('Testo.\n```vel')).toBe('\n```vel'.length);
    expect(margineMarcatore('Testo.\n')).toBe(1);
    expect(margineMarcatore('codice ```js')).toBe(0);
  });

  it('limiteInoltro: mai oltre l’inizio del blocco, anche quando il blocco è già tutto nel buffer', () => {
    expect(limiteInoltro('Risposta.')).toBe('Risposta.'.length);
    expect(limiteInoltro('Risposta.\n```vel')).toBe('Risposta.'.length);
    const conBlocco = `Risposta.\n${MARCATORE_CITAZIONI}\n{"citazioni":[]}\n\`\`\``;
    expect(limiteInoltro(conBlocco)).toBe('Risposta.'.length);
    expect(limiteInoltro(`${MARCATORE_CITAZIONI}\n{}`)).toBe(0);
  });
});

describe('FlussoTesto: cosa vede l’utente e cosa legge il validatore', () => {
  function registratore() {
    const passi: Array<{ tipo: string; testo: string }> = [];
    const flusso = new FlussoTesto(
      (p) => {
        passi.push({ tipo: p.tipo, testo: p.tipo === 'testo' ? p.delta : p.etichetta });
        return Promise.resolve();
      },
      40, // soglia bassa per i test
    );
    return { flusso, passi, testo: () => passi.filter((p) => p.tipo === 'testo').map((p) => p.testo).join('') };
  }

  it('la risposta finale: si inoltra a pezzi, il blocco resta fuori, il completo lo contiene', async () => {
    const { flusso, passi, testo } = registratore();
    flusso.inizioTurno();
    for (const d of ['La franchigia è € 200 ', '*(DIP, pag. 3)*. Altre righe di risposta qui.', '\n\n```vel', 'ia-citazioni\n{"citazioni":[]}', '\n```']) {
      await flusso.delta(d);
    }
    await flusso.fineTurno('end_turn');
    expect(testo()).toBe('La franchigia è € 200 *(DIP, pag. 3)*. Altre righe di risposta qui.');
    expect(passi.every((p) => p.tipo === 'testo')).toBe(true);
    expect(flusso.testoVisibile).toBe(testo());
    expect(flusso.testoCompleto).toContain(MARCATORE_CITAZIONI);
    expect(flusso.testoCompleto.startsWith(flusso.testoVisibile)).toBe(true);
  });

  it('un testo breve prima di un tool è narrazione → attività; uno lungo è già risposta', async () => {
    const { flusso, passi } = registratore();
    flusso.inizioTurno();
    await flusso.delta('Cerco nelle condizioni.');
    await flusso.fineTurno('tool_use');
    expect(passi).toEqual([{ tipo: 'attivita', testo: 'Cerco nelle condizioni.' }]);

    flusso.inizioTurno();
    await flusso.delta('Una risposta che supera la soglia di quaranta caratteri e continua ancora.');
    await flusso.fineTurno('tool_use');
    flusso.inizioTurno();
    await flusso.delta('Fine.');
    await flusso.fineTurno('end_turn');
    expect(flusso.testoVisibile).toBe('Una risposta che supera la soglia di quaranta caratteri e continua ancora.\n\nFine.');
  });

  it('una risposta sotto soglia arriva tutta a fine turno, e il blocco non passa mai', async () => {
    const { flusso, testo } = registratore();
    flusso.inizioTurno();
    await flusso.delta(`Sì.\n${MARCATORE_CITAZIONI}\n{"citazioni":[],"nonSupportato":true}\n\`\`\``);
    await flusso.fineTurno('end_turn');
    expect(testo()).toBe('Sì.');
    expect(flusso.testoCompleto).toContain('"nonSupportato":true');
  });
});

describe('validaBlocco', () => {
  const perPath = new Map<string, DocumentoWorkspace>([
    ['archivio-pubblico/unipolsai/auto/km/ed-2022-11/dip.md', doc({ id: 'doc-1', titolo: 'DIP Km&Servizi' })],
    ['tenant/documenti/preventivo/rossi--doc-priv-1.md', doc({ id: 'doc-priv-1', titolo: 'Preventivo Rossi', archivio: 'privato', numeroPagine: null, paginaMassima: null })],
  ]);
  const dna: DnaAgenzia = {
    istruzioni: [{ id: 'ist-1', titolo: 'Massimali prudenziali', testo: '…' }],
    riferimenti: [{ id: 'doc-priv-9', titolo: 'Convenzione flotte', path: 'tenant/documenti/convenzione/x.md' }],
    ricordi: [{ id: 'ric-1', testo: 'Le officine di Torino nord hanno tempi lunghi.', categoria: 'decisione' }],
  };

  it('traduce file → documento, pagina e articolo, e le provenienze con le etichette del contratto', () => {
    const esito = validaBlocco(
      {
        citazioni: [
          { file: './archivio-pubblico/unipolsai/auto/km/ed-2022-11/dip.md', pagina: 4, estratto: 'Franchigia € 200', articolo: '2.4' },
          { file: 'tenant\\documenti\\preventivo\\rossi--doc-priv-1.md', pagina: 99, estratto: 'Premio € 84' },
          { file: 'archivio-pubblico/unipolsai/auto/km/ed-2022-11/dip.md', pagina: 4, estratto: 'Franchigia € 200' },
        ],
        provenienze: [
          { tipo: 'regola', id: 'ist-1' },
          { tipo: 'documento-riferimento', id: 'doc-priv-9' },
          { tipo: 'memoria', id: 'ric-1' },
          { tipo: 'memoria', id: 'ric-ignoto' },
        ],
        nonSupportato: false,
      },
      perPath,
      dna,
    );
    expect(esito.citazioni).toHaveLength(2); // il doppione sparisce
    expect(esito.citazioni[0]).toMatchObject({
      documentoId: 'doc-1',
      documentoTitolo: 'DIP Km&Servizi',
      archivio: 'pubblico',
      posizione: { pagina: 4, articolo: '2.4' },
      estratto: 'Franchigia € 200',
    });
    expect(esito.citazioni[1]).toMatchObject({ documentoId: 'doc-priv-1', archivio: 'privato', posizione: { pagina: 99 } });
    expect(esito.provenienze.map((p) => p.tipo)).toEqual(['regola', 'documento-riferimento', 'memoria']);
    expect(esito.provenienze[0]?.etichetta).toBe('valutato secondo la regola "Massimali prudenziali"');
    expect(esito.avvisi.some((a) => a.includes('ric-ignoto'))).toBe(true);
  });

  it('un file inesistente o una pagina oltre la fine fanno fallire la risposta', () => {
    expect(() =>
      validaBlocco({ citazioni: [{ file: 'inventato.md', pagina: 1, estratto: 'x' }], provenienze: [], nonSupportato: false }, perPath, dnaVuoto),
    ).toThrow(ErroreValidazione);
    let catturato: unknown;
    try {
      validaBlocco(
        { citazioni: [{ file: 'archivio-pubblico/unipolsai/auto/km/ed-2022-11/dip.md', pagina: 11, estratto: 'x' }], provenienze: [], nonSupportato: false },
        perPath,
        dnaVuoto,
      );
    } catch (e) {
      catturato = e;
    }
    expect(catturato).toBeInstanceOf(ErroreValidazione);
    expect((catturato as ErroreValidazione).dettagli[0]).toMatch(/pag\. 11 .*citabile \(10\)/);
  });

  it('una citazione a un INDICE.md si ignora con un avviso: è una mappa, non una fonte', () => {
    const esito = validaBlocco(
      { citazioni: [{ file: 'archivio-pubblico/unipolsai/INDICE.md', pagina: 1, estratto: 'x' }], provenienze: [], nonSupportato: true },
      perPath,
      dnaVuoto,
    );
    expect(esito.citazioni).toEqual([]);
    expect(esito.avvisi[0]).toMatch(/INDICE ignorata/);
  });

  it('nessuna citazione e nessuna non-copertura è un avviso, non un errore', () => {
    const esito = validaBlocco({ citazioni: [], provenienze: [], nonSupportato: false }, perPath, dnaVuoto);
    expect(esito.citazioni).toEqual([]);
    expect(esito.avvisi[0]).toMatch(/senza citazioni/);
  });

  it('normalizzaPath accetta backslash, ./ e / iniziali', () => {
    expect(normalizzaPath('.\\tenant\\x.md')).toBe('tenant/x.md');
    expect(normalizzaPath('/archivio-pubblico/a.md')).toBe('archivio-pubblico/a.md');
  });
});

describe('workspace e sessione, le parti pure', () => {
  it('il path nella workspace: pubblico = path dello Storage, privato per tipologia, allegato a parte', () => {
    expect(percorsoNellaWorkspace({ id: 'd', archivio: 'pubblico', titolo: 'x', tipologia: 'dip', path_md: 'archivio-pubblico/a/dip.md' })).toBe('archivio-pubblico/a/dip.md');
    expect(percorsoNellaWorkspace({ id: 'doc-priv-1', archivio: 'privato', titolo: 'Preventivo Rossi Mario', tipologia: 'preventivo', path_md: 'tenant/t/documenti/doc-priv-1.md' })).toBe('tenant/documenti/preventivo/preventivo-rossi-mario--doc-priv-1.md');
    expect(percorsoNellaWorkspace({ id: 'all-1', archivio: 'conversazione', titolo: 'Polizza', tipologia: 'altro', path_md: 'x' })).toBe('tenant/allegati/polizza--all-1.md');
    expect(slug('Condizioni — Assicurazione Auto (ed. 2022)')).toBe('condizioni-assicurazione-auto-ed-2022');
  });

  it('dentro(): solo i path nella workspace, relativi o assoluti, passano', () => {
    const radice = process.platform === 'win32' ? 'C:\\ws\\job' : '/ws/job';
    expect(dentro(radice, 'tenant/documenti/x.md')).toBe(true);
    expect(dentro(radice, `${radice}${process.platform === 'win32' ? '\\' : '/'}a.md`)).toBe(true);
    expect(dentro(radice, '../altro/x.md')).toBe(false);
    expect(dentro(radice, process.platform === 'win32' ? 'C:\\Windows\\system.ini' : '/etc/passwd')).toBe(false);
    expect(dentro(radice, '\\prova.md')).toBe(true); // il Read a volte scrive così: è la radice
  });

  it('le etichette delle attività parlano all’utente', () => {
    const radice = process.platform === 'win32' ? 'C:\\ws\\job' : '/ws/job';
    expect(etichettaAttivita('Grep', { pattern: 'cristalli', path: 'archivio-pubblico/u/dip.md' }, radice)).toBe('Cerco «cristalli» in dip.md');
    expect(etichettaAttivita('Read', { file_path: 'tenant/documenti/p/rossi--x.md', offset: 120 }, radice)).toBe('Leggo rossi--x.md dalla riga 120');
    expect(etichettaAttivita('Glob', { pattern: '**/INDICE.md' }, radice)).toBe('Cerco i documenti **/INDICE.md');
  });

  it('titoloDaMessaggio: 60 caratteri al confine di parola, con i puntini', () => {
    expect(titoloDaMessaggio('  Che franchigie   prevede la garanzia furto? ')).toBe('Che franchigie prevede la garanzia furto?');
    const lungo = titoloDaMessaggio('Confronta il set informativo AUTOPIÙ con il preventivo UnipolSai per la Fiat 500X del cliente Rossi');
    expect(lungo.length).toBeLessThanOrEqual(61);
    expect(lungo.endsWith('…')).toBe(true);
    expect(lungo).not.toMatch(/\s…$/);
  });

  it('i prompt portano regole, DNA con id, contesto e storia', () => {
    const sistema = promptSistema({
      istruzioni: [{ id: 'ist-1', titolo: 'Regola', testo: 'Testo regola' }],
      riferimenti: [],
      ricordi: [{ id: 'ric-1', testo: 'Ricordo', categoria: 'prassi' }],
    });
    expect(sistema).toContain(MARCATORE_CITAZIONI);
    expect(sistema).toContain('[id: ist-1]');
    expect(sistema).toContain('[id: ric-1]');
    const utente = promptUtente({
      documenti: [{ path: 'tenant/documenti/p/a.md', titolo: 'A', archivio: 'privato' }],
      mancanti: [{ titolo: 'B', motivo: 'elaborazione non ancora conclusa' }],
      storia: [{ autore: 'utente', testo: 'Prima domanda' }, { autore: 'assistente', testo: 'Prima risposta' }],
      domanda: 'Seconda domanda',
    });
    expect(utente).toContain('`tenant/documenti/p/a.md`');
    expect(utente).toContain('B: elaborazione non ancora conclusa');
    expect(utente.indexOf('Prima domanda')).toBeLessThan(utente.indexOf('Seconda domanda'));
  });
});
