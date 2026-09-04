import { describe, expect, it } from 'vitest';

import { titoloDaMessaggio } from '../src/contratto/conversazioni.js';
import { FlussoTesto } from '../src/worker/motore/flusso-testo.js';
import { MARCATORE_CITAZIONI, promptRipresa, promptSistema, promptUtente, REGOLE_MOTORE, type DnaAgenzia } from '../src/worker/motore/regole.js';
import { dentro, etichettaAttivita, semplificaPattern } from '../src/worker/motore/sessione.js';
import { ripulisciTitolo } from '../src/worker/motore/titolista.js';
import {
  avvisiEsposizione,
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
  descrizione: null,
  immagine: null,
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
    expect(flusso.testoVisibile).toBe(testo());
    expect(flusso.testoCompleto).toContain(MARCATORE_CITAZIONI);
    expect(flusso.testoCompleto.startsWith(flusso.testoVisibile)).toBe(true);
    /* Quando comincia il blocco, l'utente lo sa — e l'annuncio arriva DOPO
       l'ultimo testo, così nessun delta successivo lo spegne. */
    expect(passi.at(-1)).toEqual({ tipo: 'attivita', testo: 'Raccolgo le fonti della risposta' });
    expect(passi.filter((p) => p.tipo === 'attivita')).toHaveLength(1);
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

  it('una risposta sotto soglia parte appena compare il blocco, che non passa mai', async () => {
    const { flusso, passi, testo } = registratore();
    flusso.inizioTurno();
    await flusso.delta(`Sì.\n${MARCATORE_CITAZIONI}\n{"citazioni":[],"nonSupportato":true}\n\`\`\``);
    await flusso.fineTurno('end_turn');
    expect(testo()).toBe('Sì.');
    expect(flusso.testoCompleto).toContain('"nonSupportato":true');
    expect(passi.map((p) => p.tipo)).toEqual(['testo', 'attivita']);
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
    // I rimandi: la posizione nel blocco; il doppione ([3]) resta un numero valido per la prima.
    expect(esito.citazioni[0]?.rimandi).toEqual([1, 3]);
    expect(esito.citazioni[1]?.rimandi).toEqual([2]);
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

  it('una citazione a un INDICE.md o al GLOSSARIO.md si ignora con un avviso: sono mappe, non fonti', () => {
    for (const file of ['archivio-pubblico/unipolsai/INDICE.md', 'archivio-pubblico/GLOSSARIO.md']) {
      const esito = validaBlocco(
        { citazioni: [{ file, pagina: 1, estratto: 'x' }], provenienze: [], nonSupportato: true },
        perPath,
        dnaVuoto,
      );
      expect(esito.citazioni).toEqual([]);
      expect(esito.avvisi[0]).toMatch(/mappa ignorata/);
    }
  });

  it('una citazione al file di un’immagine vale per il suo documento: è lo stesso', () => {
    /* Il modello ha guardato l'immagine con Read e cita il file che ha
       aperto. Il documento è quello del `.md` che le sta accanto. */
    const conImmagine = new Map(perPath).set(
      'tenant/allegati/sfondo--all-1.md',
      doc({ id: 'all-1', titolo: 'sfondo_16_9', archivio: 'conversazione', numeroPagine: 1, paginaMassima: 1 }),
    );
    const esito = validaBlocco(
      {
        citazioni: [{ file: 'tenant/allegati/sfondo--all-1.jpg', pagina: 1, estratto: 'logo bianco su fondo nero' }],
        provenienze: [],
        nonSupportato: false,
      },
      conImmagine,
      dnaVuoto,
    );
    expect(esito.citazioni[0]).toMatchObject({ documentoId: 'all-1', documentoTitolo: 'sfondo_16_9' });
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

  it('le etichette delle attività parlano all’utente: titoli, mai file né sintassi', () => {
    const radice = process.platform === 'win32' ? 'C:\\ws\\job' : '/ws/job';
    const titoli = new Map([
      ['archivio-pubblico/u/dip.md', 'DIP Danni — UnipolSai Km&Servizi'],
      ['tenant/documenti/p/rossi--x.md', 'Preventivo Rossi'],
    ]);
    const titoloPer = (p: string) => titoli.get(p);
    expect(etichettaAttivita('Grep', { pattern: 'cristalli', path: 'archivio-pubblico/u/dip.md' }, radice, titoloPer)).toBe(
      'Cerco «cristalli» in «DIP Danni — UnipolSai Km&Servizi»',
    );
    expect(etichettaAttivita('Grep', { pattern: '[Ff]urto|[Rr]apina' }, radice, titoloPer)).toBe(
      'Cerco «furto, rapina» negli archivi',
    );
    expect(etichettaAttivita('Grep', { pattern: '^\\[pag\\. (9[0-9])\\]', path: 'archivio-pubblico/u/dip.md' }, radice, titoloPer)).toBe(
      'Cerco nel testo in «DIP Danni — UnipolSai Km&Servizi»',
    );
    expect(etichettaAttivita('Read', { file_path: 'tenant/documenti/p/rossi--x.md', offset: 120 }, radice, titoloPer)).toBe(
      'Continuo a leggere «Preventivo Rossi»',
    );
    expect(etichettaAttivita('Read', { file_path: 'archivio-pubblico/u/INDICE.md' }, radice, titoloPer)).toBe(
      'Consulto l’indice dell’archivio',
    );
    expect(etichettaAttivita('Read', { file_path: 'sconosciuto.md' }, radice, titoloPer)).toBe('Leggo un documento');
    expect(etichettaAttivita('Glob', { pattern: '**/*.md' }, radice, titoloPer)).toBe(
      'Guardo quali documenti ci sono in archivio',
    );
  });

  it('semplificaPattern: classi di maiuscole sciolte, alternative a virgole, regex intraducibili scartate', () => {
    expect(semplificaPattern('[Ff]ranchigia|[Ss]coperto')).toBe('franchigia, scoperto');
    expect(semplificaPattern('Art\\. 3\\.5\\.7')).toBe('Art. 3.5.7');
    expect(semplificaPattern('massimale')).toBe('massimale');
    expect(semplificaPattern('^\\[pag\\. \\d+\\]')).toBeUndefined();
    expect(semplificaPattern('(a|b){2,}')).toBeUndefined();
    expect(semplificaPattern('')).toBeUndefined();
  });

  it('titoloDaMessaggio: 60 caratteri al confine di parola, con i puntini', () => {
    expect(titoloDaMessaggio('  Che franchigie   prevede la garanzia furto? ')).toBe('Che franchigie prevede la garanzia furto?');
    const lungo = titoloDaMessaggio('Confronta il set informativo AUTOPIÙ con il preventivo UnipolSai per la Fiat 500X del cliente Rossi');
    expect(lungo.length).toBeLessThanOrEqual(61);
    expect(lungo.endsWith('…')).toBe(true);
    expect(lungo).not.toMatch(/\s…$/);
  });

  it('le regole vietano di sostituire l’oggetto della domanda e di nominare il mondo interno', () => {
    expect(REGOLE_MOTORE).toContain("Mai sostituire l'oggetto della domanda");
    expect(REGOLE_MOTORE).toContain('aspetta la conferma');
    expect(REGOLE_MOTORE).toContain('Il mondo interno non si nomina');
    expect(REGOLE_MOTORE).toContain('«Archivio Pubblico» e «Archivio Privato»');
    expect(REGOLE_MOTORE).toContain('Dai del tu');
    expect(REGOLE_MOTORE).not.toContain('vuole che proceda');
  });

  it('avvisiEsposizione segnala percorsi e nomi di file nel testo visibile', () => {
    expect(avvisiEsposizione('In archivio-pubblico/unipolsai/ trovi il DIP.')).toHaveLength(1);
    expect(avvisiEsposizione('Vedi tenant/allegati/INDICE.md nella workspace')).toHaveLength(1);
    expect(avvisiEsposizione('Ho letto condizioni-di-assicurazione.md a pag. 76')).toHaveLength(1);
    expect(avvisiEsposizione('La garanzia Furto prevede scoperto 10% *(Condizioni, pag. 103)*.')).toEqual([]);
  });

  it('ripulisciTitolo: una riga, senza virgolette né punto, troncato al confine di parola', () => {
    expect(ripulisciTitolo('«Franchigie Furto e Rapina Km&Servizi».')).toBe('Franchigie Furto e Rapina Km&Servizi');
    expect(ripulisciTitolo('"Titolo"\ncon una seconda riga')).toBe('Titolo');
    expect(ripulisciTitolo('  \n  ')).toBe('');
    const lungo = ripulisciTitolo('Confronto molto dettagliato delle garanzie accessorie fra la polizza vecchia e quella nuova');
    expect(lungo.length).toBeLessThanOrEqual(61);
    expect(lungo.endsWith('…')).toBe(true);
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

  it('il riordino si racconta solo dove il tool c’è: la chat sì, un agente pianificato no', () => {
    const dna: DnaAgenzia = { istruzioni: [], riferimenti: [], ricordi: [] };
    /* Un agente che gira di notte non ha nessuno a cui chiedere
       l'approvazione: descrivergli uno strumento che non ha sarebbe
       insegnargli a promettere qualcosa che non può fare. */
    expect(promptSistema(dna)).not.toContain('proponi_riordino');
    const conChat = promptSistema(dna, [], true);
    expect(conChat).toContain('proponi_riordino');
    expect(conChat).toContain('Riordinare l’archivio');
  });

  it('il prompt di ripresa: niente storia (è già nel contesto della sessione), contesto e domanda sì', () => {
    const conDocumenti = promptRipresa({
      documenti: [{ path: 'tenant/documenti/p/a.md', titolo: 'A', archivio: 'privato' }],
      mancanti: [{ titolo: 'B', motivo: 'elaborazione non ancora conclusa' }],
      domanda: 'Seconda domanda',
    });
    expect(conDocumenti).toContain('`tenant/documenti/p/a.md`');
    expect(conDocumenti).toContain('B: elaborazione non ancora conclusa');
    expect(conDocumenti).not.toContain('Conversazione finora');
    expect(conDocumenti.trimEnd().endsWith('Seconda domanda')).toBe(true);
    /* Senza contesto non si manda a cercare negli archivi: la sessione sa già cosa ha letto. */
    const nudo = promptRipresa({ documenti: [], mancanti: [], domanda: 'E per i cristalli?' });
    expect(nudo).toBe('Domanda dell’utente:\nE per i cristalli?');
  });
});
