import { NomeIcona, REGISTRO_ICONE } from '@shared/ui/icona/registro-icone';

/**
 * L'editor del composer è un `contenteditable` che il componente possiede
 * via DOM: testo libero e, tra le parole, i chip dei documenti referenziati
 * (non editabili: il cursore li scavalca, Backspace li toglie come un'unità).
 *
 * Queste funzioni sono pure sul DOM — ricevono la radice dell'editor — e
 * sono le uniche a conoscerne la struttura: il resto del componente ragiona
 * in termini di testo (la bozza) e di posizione del cursore nel testo, come
 * faceva con la textarea. I chip non contano caratteri; un `<br>` conta come
 * un a capo.
 */

export const CLASSE_CHIP = 'riferimento';
const ATTR_ID = 'data-id';
const ATTR_CHIAVE = 'data-chiave';

export interface ChipDocumento {
  id: string;
  titolo: string;
  archivio: 'pubblico' | 'privato' | 'conversazione';
}

export interface ChipAllegato {
  chiave: number;
  nome: string;
  stato: 'caricamento' | 'errore';
  messaggio?: string;
}

const eChip = (n: Node): n is HTMLElement =>
  n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).classList.contains(CLASSE_CHIP);

/** Visita in ordine di documento i nodi che contano: testi e `<br>`; i chip si saltano interi. */
function* foglie(radice: Node): Generator<Node> {
  for (const figlio of Array.from(radice.childNodes)) {
    if (eChip(figlio)) continue;
    if (figlio.nodeType === Node.TEXT_NODE) yield figlio;
    else if (figlio.nodeName === 'BR') yield figlio;
    else yield* foglie(figlio);
  }
}

const lunghezza = (n: Node): number => (n.nodeName === 'BR' ? 1 : (n.textContent ?? '').length);

/** Il testo in composizione, chip esclusi. */
export function testoEditor(radice: HTMLElement): string {
  let testo = '';
  for (const n of foglie(radice)) testo += n.nodeName === 'BR' ? '\n' : n.textContent;
  return testo;
}

/** Gli id dei chip di documento presenti, nell'ordine del testo. */
export function idChip(radice: HTMLElement): string[] {
  return Array.from(radice.querySelectorAll<HTMLElement>(`.${CLASSE_CHIP}[${ATTR_ID}]`)).map(
    (c) => c.getAttribute(ATTR_ID)!,
  );
}

export function chipPerId(radice: HTMLElement, id: string): HTMLElement | null {
  for (const c of radice.querySelectorAll<HTMLElement>(`.${CLASSE_CHIP}[${ATTR_ID}]`)) {
    if (c.getAttribute(ATTR_ID) === id) return c;
  }
  return null;
}

export function chipAllegatoPerChiave(radice: HTMLElement, chiave: number): HTMLElement | null {
  for (const c of radice.querySelectorAll<HTMLElement>(`.${CLASSE_CHIP}[${ATTR_CHIAVE}]`)) {
    if (c.getAttribute(ATTR_CHIAVE) === String(chiave)) return c;
  }
  return null;
}

/**
 * La posizione del cursore nel testo (chip esclusi). Se la selezione non sta
 * nell'editor, la fine del testo.
 */
export function posizioneCursore(radice: HTMLElement, selezione: Selection | null): number {
  const ancora = selezione?.focusNode;
  if (!ancora || !radice.contains(ancora)) return testoEditor(radice).length;
  const offset = selezione.focusOffset;

  /* Il cursore può stare in un nodo di testo (offset in caratteri) o in un
     elemento (offset = indice del figlio): si conta tutto ciò che precede. */
  let conteggio = 0;
  const dentroElemento = ancora.nodeType === Node.ELEMENT_NODE;
  const confine = dentroElemento ? (ancora.childNodes[offset] ?? null) : ancora;
  for (const n of foglie(radice)) {
    if (confine && (n === confine || (confine.contains(n) && confine !== n))) {
      if (!dentroElemento) return conteggio + Math.min(offset, lunghezza(n));
      return conteggio;
    }
    if (dentroElemento && confine === null && ancora !== radice && ancora.contains(n)) {
      // offset oltre l'ultimo figlio di un elemento interno: tutto il suo testo conta
      conteggio += lunghezza(n);
      continue;
    }
    conteggio += lunghezza(n);
  }
  return conteggio;
}

/** Il punto nel DOM (nodo e offset) per una posizione del testo. */
export function puntoDaPosizione(radice: HTMLElement, posizione: number): { nodo: Node; offset: number } {
  let conteggio = 0;
  let ultimo: Node | undefined;
  for (const n of foglie(radice)) {
    const len = lunghezza(n);
    if (n.nodeType === Node.TEXT_NODE && posizione <= conteggio + len) {
      return { nodo: n, offset: posizione - conteggio };
    }
    if (n.nodeName === 'BR' && posizione <= conteggio) {
      return puntoPrima(n);
    }
    conteggio += len;
    ultimo = n;
  }
  // Oltre la fine: dopo l'ultimo nodo, o in coda alla radice.
  if (ultimo) return puntoDopo(ultimo);
  return { nodo: radice, offset: radice.childNodes.length };
}

function puntoDopo(n: Node): { nodo: Node; offset: number } {
  const padre = n.parentNode!;
  return { nodo: padre, offset: Array.from(padre.childNodes).indexOf(n as ChildNode) + 1 };
}

function puntoPrima(n: Node): { nodo: Node; offset: number } {
  const padre = n.parentNode!;
  return { nodo: padre, offset: Array.from(padre.childNodes).indexOf(n as ChildNode) };
}

/** Mette il cursore a una posizione del testo. */
export function posizionaCursore(radice: HTMLElement, posizione: number): void {
  const { nodo, offset } = puntoDaPosizione(radice, posizione);
  const selezione = radice.ownerDocument.getSelection();
  if (!selezione) return;
  const intervallo = radice.ownerDocument.createRange();
  intervallo.setStart(nodo, offset);
  intervallo.collapse(true);
  selezione.removeAllRanges();
  selezione.addRange(intervallo);
}

/**
 * Sostituisce l'intervallo di testo `[da, a)` con un nodo e lascia il
 * cursore subito dopo. Serve a trasformare la `@query` nel chip scelto, e a
 * inserire testo al cursore (`da === a`).
 */
export function sostituisciIntervallo(radice: HTMLElement, da: number, a: number, nodo: Node): void {
  const inizio = puntoDaPosizione(radice, da);
  const fine = puntoDaPosizione(radice, a);
  const intervallo = radice.ownerDocument.createRange();
  intervallo.setStart(inizio.nodo, inizio.offset);
  intervallo.setEnd(fine.nodo, fine.offset);
  intervallo.deleteContents();
  intervallo.insertNode(nodo);
  intervallo.setStartAfter(nodo);
  intervallo.collapse(true);
  const selezione = radice.ownerDocument.getSelection();
  if (selezione) {
    selezione.removeAllRanges();
    selezione.addRange(intervallo);
  }
  radice.normalize();
}

/** L'editor è vuoto davvero (niente testo, niente chip)? Allora si svuota anche dei `<br>` residui. */
export function ripulisciSeVuoto(radice: HTMLElement): boolean {
  if (testoEditor(radice).trim() === '' && !radice.querySelector(`.${CLASSE_CHIP}`)) {
    radice.replaceChildren();
    return true;
  }
  return false;
}

/** Il chip di un documento referenziato, con l'icona del suo archivio e la × per toglierlo. */
export function creaChipDocumento(doc: ChipDocumento, togli: () => void): HTMLElement {
  const icona: NomeIcona =
    doc.archivio === 'pubblico' ? 'archivio-pubblico' : doc.archivio === 'privato' ? 'archivio-privato' : 'allega';
  const chip = scheletroChip();
  chip.setAttribute(ATTR_ID, doc.id);
  chip.append(creaSvgIcona(icona, 12), titolo(doc.titolo), bottoneTogli(`Togli il riferimento a ${doc.titolo}`, togli));
  return chip;
}

/** Il chip di un allegato in caricamento (o fallito): transitorio, diventa un riferimento appena pronto. */
export function creaChipAllegato(allegato: ChipAllegato, togli: () => void): HTMLElement {
  const chip = scheletroChip();
  chip.setAttribute(ATTR_CHIAVE, String(allegato.chiave));
  chip.classList.toggle('is-errore', allegato.stato === 'errore');
  const icona = creaSvgIcona(allegato.stato === 'errore' ? 'errore' : 'in-corso', 12);
  if (allegato.stato === 'caricamento') icona.classList.add('gira');
  const stato = document.createElement('span');
  stato.className = 'mono riferimento__stato';
  stato.textContent = allegato.stato === 'errore' ? (allegato.messaggio ?? 'errore') : 'caricamento…';
  chip.append(icona, titolo(allegato.nome), stato);
  if (allegato.stato === 'errore') chip.append(bottoneTogli(`Togli l’allegato ${allegato.nome}`, togli));
  return chip;
}

function scheletroChip(): HTMLElement {
  const chip = document.createElement('span');
  chip.className = CLASSE_CHIP;
  chip.setAttribute('contenteditable', 'false');
  return chip;
}

function titolo(testo: string): HTMLElement {
  const t = document.createElement('span');
  t.className = 'riferimento__titolo';
  t.textContent = testo;
  return t;
}

function bottoneTogli(etichetta: string, togli: () => void): HTMLElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'riferimento__togli';
  b.setAttribute('aria-label', etichetta);
  b.append(creaSvgIcona('chiudi', 11));
  b.addEventListener('mousedown', (e) => e.preventDefault()); // il fuoco resta nell'editor
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    togli();
  });
  return b;
}

/** L'icona del registro come SVG vero: i chip nascono fuori da Angular. */
export function creaSvgIcona(nome: NomeIcona, dimensione: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(dimensione));
  svg.setAttribute('height', String(dimensione));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('color', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attributi] of REGISTRO_ICONE[nome]) {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attributi)) {
      el.setAttribute(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), String(v));
    }
    svg.append(el);
  }
  return svg;
}
