/**
 * Resa del testo delle risposte.
 *
 * Il motore (Fase 3 BE) scrive Markdown vero: titoli, tabelle di confronto,
 * elenchi, citazioni in blocco, corsivo per le fonti *(Titolo, pag. N)*. La
 * resa resta fatta a mano, per le stesse ragioni di prima: il vocabolario è
 * chiuso — si rendono i costrutti che il motore usa davvero, niente link,
 * immagini o HTML passante — e l'output usa solo elementi che il sanitizer
 * di Angular lascia passare (`p`, `h3`-`h5`, `ul`/`ol`/`li`, `table`,
 * `blockquote`, `hr`, `strong`, `em`, `code`, `br`, `div`), quindi il
 * binding a `[innerHTML]` resta sotto la sua protezione senza
 * `bypassSecurityTrust`. Tutto il testo passa da `scappaHtml` prima di
 * qualunque sostituzione: ciò che arriva dal server esce come testo.
 *
 * Durante lo streaming il testo cresce a pezzi: ogni blocco si rende con
 * quello che c'è (una tabella a metà è una tabella con meno righe).
 */

import { Citazione, Provenienza, etichettaCitazione } from '@core/models';

const RIGA_TITOLO = /^(#{1,6})\s+(.+?)\s*#*$/;
const RIGA_ELENCO = /^\s*(?:[-*•]|\d+[.)])\s+/;
const RIGA_ELENCO_NUMERATO = /^\s*\d+[.)]\s+/;
const RIGA_CITAZIONE = /^\s*>\s?/;
const RIGA_TABELLA = /^\s*\|/;
const RIGA_SEPARATORE_TABELLA = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const RIGA_ORIZZONTALE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

function scappaHtml(testo: string): string {
  return testo.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function scappaAttributo(testo: string): string {
  return scappaHtml(testo).replaceAll('"', '&quot;');
}

/* ---------- I rimandi: fonti e provenienze nel punto esatto ---------- */

/**
 * Il motore richiama le fonti nel testo con `[1]`, `[2]`… (posizione nel
 * blocco delle citazioni) e istruzioni, riferimenti e memoria con `[a]`,
 * `[b]`… (posizione nelle provenienze). Qui ogni rimando diventa un chip
 * nel punto in cui sta: un'ancora con frammento (`#fonte:id`,
 * `#provenienza:id`) che il sanitizer lascia passare, e che la bolla
 * intercetta al click. In streaming (`attesa`) le fonti non sono ancora
 * arrivate: il rimando si mostra come pillola in attesa.
 */
export interface RimandiRisposta {
  citazioni?: Citazione[];
  provenienze?: Provenienza[];
  /** Vero mentre la risposta esce: i rimandi senza fonte aspettano, non spariscono. */
  attesa?: boolean;
}

/** `[a]` è la prima provenienza (1). */
export function letteraRimando(n: number): string {
  return String.fromCharCode(96 + n);
}

/** Il titolo del documento senza il prodotto: «DIP Danni — Allianz Bonus Malus…» → «DIP Danni». */
export function titoloBreve(titolo: string): string {
  return titolo.split(/\s+[—–-]\s+/)[0]?.trim() || titolo;
}

const ETICHETTE_PROVENIENZA: Record<Provenienza['tipo'], string> = {
  regola: 'Istruzione',
  'documento-riferimento': 'Riferimento',
  memoria: 'Memoria',
};

/** Il nome dentro l'etichetta: `valutato secondo la regola "Massimali prudenziali"` → «Massimali prudenziali». */
function nomeProvenienza(p: Provenienza): string | undefined {
  return p.tipo === 'memoria' ? undefined : /"([^"]+)"/.exec(p.etichetta)?.[1];
}

interface MappaRimandi {
  fonti: Map<number, Citazione>;
  provenienze: Map<string, Provenienza>;
  attesa: boolean;
  /** Senza alcun rimando dichiarato (messaggi vecchi, testo qualsiasi) le parentesi restano testo. */
  attivi: boolean;
}

function mappaRimandi(r: RimandiRisposta | undefined): MappaRimandi {
  const fonti = new Map<number, Citazione>();
  for (const c of r?.citazioni ?? []) for (const n of c.rimandi ?? []) fonti.set(n, c);
  const provenienze = new Map<string, Provenienza>();
  for (const p of r?.provenienze ?? []) for (const n of p.rimandi ?? []) provenienze.set(letteraRimando(n), p);
  const attesa = Boolean(r?.attesa);
  return { fonti, provenienze, attesa, attivi: attesa || fonti.size > 0 || provenienze.size > 0 };
}

/** Lo stato della resa in corso: `htmlRisposta` lo imposta, `inlinea` lo legge. */
let rimandi: MappaRimandi = mappaRimandi(undefined);

function chipFonte(c: Citazione): string {
  const posizione = c.posizione.articolo ? `art. ${c.posizione.articolo}, p. ${c.posizione.pagina}` : `p. ${c.posizione.pagina}`;
  const titolo = scappaAttributo(`${c.documentoTitolo} - ${posizione}: «${c.estratto}»`);
  return (
    `<a class="rimando rimando--fonte" href="#fonte:${c.id}" title="${titolo}">` +
    `${scappaHtml(titoloBreve(c.documentoTitolo))}<span class="rimando__pos">p. ${c.posizione.pagina}</span></a>`
  );
}

function chipProvenienza(p: Provenienza): string {
  const nome = nomeProvenienza(p);
  return (
    `<a class="rimando rimando--${p.tipo}" href="#provenienza:${p.origineId}" title="${scappaAttributo(p.etichetta)}">` +
    `${ETICHETTE_PROVENIENZA[p.tipo]}${nome ? `<span class="rimando__pos">${scappaHtml(nome)}</span>` : ''}</a>`
  );
}

/** I rimandi `[n]` e `[a]` dentro un frammento già formattato. */
function rimandiInlinea(html: string): string {
  if (!rimandi.attivi) return html;
  return html.replace(/ ?\[(\d{1,2}|[a-z])\]/g, (tutto, chiave: string) => {
    const spazio = tutto.startsWith(' ') ? ' ' : '';
    const numero = Number(chiave);
    const fonte = Number.isInteger(numero) ? rimandi.fonti.get(numero) : undefined;
    if (fonte) return `${spazio}${chipFonte(fonte)}`;
    const provenienza = Number.isInteger(numero) ? undefined : rimandi.provenienze.get(chiave);
    if (provenienza) return `${spazio}${chipProvenienza(provenienza)}`;
    // Senza fonte: in attesa mentre la risposta esce, altrimenti sparisce (l'audit lo sa già).
    return rimandi.attesa ? `${spazio}<span class="rimando rimando--attesa">${chiave}</span>` : '';
  });
}

/** Grassetto, corsivo, codice in linea — sul testo già scappato — e i rimandi. */
function inlinea(testo: string): string {
  return rimandiInlinea(
    scappaHtml(testo)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
      // Corsivo: asterischi aderenti al testo, così «2 * 3 * 4» resta aritmetica.
      .replace(/(^|[^*\w])\*(\S(?:[^*\n]*?\S)?)\*(?!\*)/g, '$1<em>$2</em>'),
  );
}

/**
 * Il testo per la copia e per chi non vede i chip: ogni `[n]` diventa la
 * fonte per esteso fra parentesi, i rimandi alle provenienze spariscono.
 */
export function testoConFontiPerEsteso(testo: string, r: RimandiRisposta): string {
  const mappa = mappaRimandi({ ...r, attesa: false });
  if (!mappa.attivi) return testo;
  return testo.replace(/ ?\[(\d{1,2}|[a-z])\]/g, (tutto, chiave: string) => {
    const fonte = mappa.fonti.get(Number(chiave));
    if (fonte) return ` (${etichettaCitazione(fonte)})`;
    return mappa.provenienze.has(chiave) ? '' : tutto;
  });
}

/** Le celle di una riga di tabella, senza i pipe ai bordi. */
function celle(riga: string): string[] {
  const pulita = riga.trim().replace(/^\|/, '').replace(/\|$/, '');
  return pulita.split('|').map((c) => c.trim());
}

function iniziaBlocco(riga: string): boolean {
  return (
    RIGA_TITOLO.test(riga) ||
    RIGA_ELENCO.test(riga) ||
    RIGA_CITAZIONE.test(riga) ||
    RIGA_TABELLA.test(riga) ||
    RIGA_ORIZZONTALE.test(riga)
  );
}

/** Da Markdown a HTML per `[innerHTML]`; con i rimandi, le fonti diventano chip nel punto esatto. */
export function htmlRisposta(testo: string, conRimandi?: RimandiRisposta): string {
  rimandi = mappaRimandi(conRimandi);
  const righe = testo.replaceAll('\r\n', '\n').split('\n');
  const uscita: string[] = [];
  let i = 0;

  while (i < righe.length) {
    const riga = righe[i]!;
    if (!riga.trim()) {
      i++;
      continue;
    }

    const titolo = RIGA_TITOLO.exec(riga);
    if (titolo) {
      // Dentro una bolla il titolo di primo livello è già un h3: la gerarchia resta.
      const livello = Math.min(2 + Math.max(titolo[1]!.length, 1), 5);
      uscita.push(`<h${livello}>${inlinea(titolo[2]!)}</h${livello}>`);
      i++;
      continue;
    }

    if (RIGA_ORIZZONTALE.test(riga)) {
      uscita.push('<hr>');
      i++;
      continue;
    }

    if (RIGA_TABELLA.test(riga)) {
      const blocco: string[] = [];
      while (i < righe.length && RIGA_TABELLA.test(righe[i]!)) blocco.push(righe[i++]!);
      const [testa, ...resto] = blocco;
      const corpo = resto.filter((r) => !RIGA_SEPARATORE_TABELLA.test(r));
      const intestazione = `<thead><tr>${celle(testa!).map((c) => `<th>${inlinea(c)}</th>`).join('')}</tr></thead>`;
      const righeCorpo = corpo
        .map((r) => `<tr>${celle(r).map((c) => `<td>${inlinea(c)}</td>`).join('')}</tr>`)
        .join('');
      uscita.push(`<div class="tabella"><table>${intestazione}${righeCorpo ? `<tbody>${righeCorpo}</tbody>` : ''}</table></div>`);
      continue;
    }

    if (RIGA_CITAZIONE.test(riga)) {
      const blocco: string[] = [];
      while (i < righe.length && RIGA_CITAZIONE.test(righe[i]!)) blocco.push(righe[i++]!.replace(RIGA_CITAZIONE, ''));
      uscita.push(`<blockquote><p>${blocco.map(inlinea).join('<br>')}</p></blockquote>`);
      continue;
    }

    if (RIGA_ELENCO.test(riga)) {
      const numerato = RIGA_ELENCO_NUMERATO.test(riga);
      const voci: string[] = [];
      while (i < righe.length && RIGA_ELENCO.test(righe[i]!) && RIGA_ELENCO_NUMERATO.test(righe[i]!) === numerato) {
        let voce = righe[i++]!.replace(RIGA_ELENCO, '');
        // Le righe rientrate che seguono appartengono alla stessa voce.
        while (i < righe.length && righe[i]!.trim() && /^\s{2,}/.test(righe[i]!) && !RIGA_ELENCO.test(righe[i]!)) {
          voce += ` ${righe[i++]!.trim()}`;
        }
        voci.push(`<li>${inlinea(voce)}</li>`);
      }
      uscita.push(`<${numerato ? 'ol' : 'ul'}>${voci.join('')}</${numerato ? 'ol' : 'ul'}>`);
      continue;
    }

    // Paragrafo: fino alla riga vuota o all'inizio di un altro blocco.
    const paragrafo: string[] = [riga];
    i++;
    while (i < righe.length && righe[i]!.trim() && !iniziaBlocco(righe[i]!)) paragrafo.push(righe[i++]!);
    uscita.push(`<p>${paragrafo.map((r) => inlinea(r.trim())).join('<br>')}</p>`);
  }

  return uscita.join('');
}
