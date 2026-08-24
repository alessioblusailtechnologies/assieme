/**
 * Dal testo di una risposta (Markdown leggero, quello che il motore produce
 * e la bolla del FE rende) a blocchi strutturati che i tre compositori —
 * PDF, DOCX, XLSX — impaginano ciascuno a modo suo. L'analisi è una sola
 * perché la fedeltà fra i formati parte da qui: stessi titoli, stessi
 * elenchi, stesse tabelle.
 */

export interface Segmento {
  testo: string;
  grassetto: boolean;
}

export type Blocco =
  | { tipo: 'titolo'; livello: 1 | 2 | 3; testo: string }
  | { tipo: 'paragrafo'; segmenti: Segmento[] }
  | { tipo: 'voce-elenco'; segmenti: Segmento[] }
  | { tipo: 'tabella'; righe: string[][] };

/** Inline: via i link (resta il testo), il codice e il corsivo; il grassetto lo tiene `segmenti`. */
function pulisciInline(testo: string): string {
  return testo
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}

/** Spezza sul `**`: i tratti dispari sono in grassetto. */
export function segmenti(testo: string): Segmento[] {
  const parti = pulisciInline(testo).split('**');
  const esito: Segmento[] = [];
  for (let i = 0; i < parti.length; i++) {
    const t = parti[i];
    if (t) esito.push({ testo: t, grassetto: i % 2 === 1 });
  }
  return esito.length ? esito : [{ testo: '', grassetto: false }];
}

const testoDi = (s: Segmento[]): string => s.map((x) => x.testo).join('');

/** Una riga di tabella Markdown → celle (senza i `|` di bordo). */
function celle(riga: string): string[] {
  return riga
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => pulisciInline(c.replaceAll('**', '')));
}

const eSeparatoreTabella = (riga: string): boolean => /^\s*\|?[\s:|-]+\|?\s*$/.test(riga) && riga.includes('-');

/**
 * L'analisi, riga per riga: titoli `#`, elenchi `-`/`1.`, tabelle `|…|`,
 * citazioni `>` come paragrafi, righe orizzontali ignorate. Le righe piene
 * consecutive si fondono in un paragrafo (è Markdown), la riga vuota chiude.
 */
export function analizzaMarkdown(testo: string): Blocco[] {
  const blocchi: Blocco[] = [];
  let paragrafo: string[] = [];

  const chiudiParagrafo = (): void => {
    if (paragrafo.length) {
      blocchi.push({ tipo: 'paragrafo', segmenti: segmenti(paragrafo.join(' ')) });
      paragrafo = [];
    }
  };

  const righe = testo.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < righe.length; i++) {
    const piena = righe[i]!.trim();

    if (!piena) {
      chiudiParagrafo();
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(piena)) {
      chiudiParagrafo();
      continue;
    }

    const titolo = /^(#{1,6})\s+(.*)$/.exec(piena);
    if (titolo) {
      chiudiParagrafo();
      const livello = Math.min(titolo[1]!.length, 3) as 1 | 2 | 3;
      blocchi.push({ tipo: 'titolo', livello, testo: pulisciInline(titolo[2]!.replaceAll('**', '')) });
      continue;
    }

    if (piena.startsWith('|')) {
      chiudiParagrafo();
      const righeTabella: string[][] = [];
      for (; i < righe.length && righe[i]!.trim().startsWith('|'); i++) {
        const r = righe[i]!.trim();
        if (!eSeparatoreTabella(r)) righeTabella.push(celle(r));
      }
      i--;
      if (righeTabella.length) blocchi.push({ tipo: 'tabella', righe: righeTabella });
      continue;
    }

    const voce = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(piena);
    if (voce) {
      chiudiParagrafo();
      blocchi.push({ tipo: 'voce-elenco', segmenti: segmenti(voce[1]!) });
      continue;
    }

    paragrafo.push(piena.startsWith('>') ? piena.replace(/^>\s?/, '') : piena);
  }
  chiudiParagrafo();
  return blocchi;
}

/** La versione piatta, per le celle XLSX e i segnaposto dei template propri. */
export function testoPiano(blocchi: Blocco[]): string[] {
  const righe: string[] = [];
  for (const b of blocchi) {
    switch (b.tipo) {
      case 'titolo':
        righe.push(b.testo.toUpperCase());
        break;
      case 'paragrafo':
        righe.push(testoDi(b.segmenti));
        break;
      case 'voce-elenco':
        righe.push(`• ${testoDi(b.segmenti)}`);
        break;
      case 'tabella':
        for (const r of b.righe) righe.push(r.join(' | '));
        break;
    }
  }
  return righe;
}
