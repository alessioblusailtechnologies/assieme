import { ALTEZZA_MASSIMA_FASCIA, LARGHEZZA_FOGLIO, MARGINE_FOGLIO } from '@core/models';

/**
 * La geometria della tela (11/09/2026): tutto in millimetri, nelle
 * coordinate della fascia (l'origine è l'angolo in alto a sinistra, la
 * larghezza è quella del foglio). Funzioni pure: l'editor le chiama coi
 * rettangoli che vede, e ci pensa lui a disegnare e a salvare.
 */

export interface Rettangolo {
  x: number;
  y: number;
  larghezza: number;
  altezza: number;
}

/** Una guida da disegnare mentre si trascina: una linea verticale (`x`) o orizzontale (`y`). */
export interface Guida {
  asse: 'x' | 'y';
  valore: number;
}

export type Maniglia = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type Allineamento = 'sinistra' | 'centro' | 'destra' | 'alto' | 'mezzo' | 'basso';

export interface Riferimenti {
  x: number[];
  y: number[];
}

const DESTRA_MARGINE = LARGHEZZA_FOGLIO - MARGINE_FOGLIO;

/** Il rettangolo che li contiene tutti. */
export function contorno(rettangoli: readonly Rettangolo[]): Rettangolo {
  const x = Math.min(...rettangoli.map((r) => r.x));
  const y = Math.min(...rettangoli.map((r) => r.y));
  const destra = Math.max(...rettangoli.map((r) => r.x + r.larghezza));
  const fondo = Math.max(...rettangoli.map((r) => r.y + r.altezza));
  return { x, y, larghezza: destra - x, altezza: fondo - y };
}

export function siToccano(a: Rettangolo, b: Rettangolo): boolean {
  return (
    a.x < b.x + b.larghezza &&
    b.x < a.x + a.larghezza &&
    a.y < b.y + b.altezza &&
    b.y < a.y + a.altezza
  );
}

/**
 * Dove si aggancia chi si muove: bordi e centro del foglio, i margini del
 * corpo dei documenti, cima, metà e fondo della fascia, e bordi e centri
 * degli altri elementi.
 */
export function riferimenti(altezzaFascia: number, altri: readonly Rettangolo[]): Riferimenti {
  return {
    x: [
      0,
      MARGINE_FOGLIO,
      LARGHEZZA_FOGLIO / 2,
      DESTRA_MARGINE,
      LARGHEZZA_FOGLIO,
      ...altri.flatMap((r) => [r.x, r.x + r.larghezza / 2, r.x + r.larghezza]),
    ],
    y: [
      0,
      altezzaFascia / 2,
      altezzaFascia,
      ...altri.flatMap((r) => [r.y, r.y + r.altezza / 2, r.y + r.altezza]),
    ],
  };
}

/** Il riferimento più vicino a uno dei candidati, entro la soglia: lo scarto da aggiungere, e dove disegnare la guida. */
function piuVicino(
  candidati: readonly number[],
  riferimenti: readonly number[],
  soglia: number,
): { scarto: number; valore: number } | undefined {
  let migliore: { scarto: number; valore: number } | undefined;
  for (const c of candidati) {
    for (const r of riferimenti) {
      const scarto = r - c;
      if (
        Math.abs(scarto) <= soglia &&
        (!migliore || Math.abs(scarto) < Math.abs(migliore.scarto))
      ) {
        migliore = { scarto, valore: r };
      }
    }
  }
  return migliore;
}

/**
 * Lo spostamento che porta il rettangolo ad agganciarsi, sui due assi, e le
 * guide da mostrare. Si agganciano il bordo sinistro, il centro e il bordo
 * destro (in alto, a metà, in basso): quelli che `lati` lascia muovere.
 */
export function aggancia(
  r: Rettangolo,
  rif: Riferimenti,
  soglia: number,
  lati: {
    x: readonly ('inizio' | 'centro' | 'fine')[];
    y: readonly ('inizio' | 'centro' | 'fine')[];
  } = {
    x: ['inizio', 'centro', 'fine'],
    y: ['inizio', 'centro', 'fine'],
  },
): { dx: number; dy: number; guide: Guida[] } {
  const posizione = (inizio: number, misura: number, lato: 'inizio' | 'centro' | 'fine'): number =>
    lato === 'inizio' ? inizio : lato === 'centro' ? inizio + misura / 2 : inizio + misura;
  const sx = piuVicino(
    lati.x.map((l) => posizione(r.x, r.larghezza, l)),
    rif.x,
    soglia,
  );
  const sy = piuVicino(
    lati.y.map((l) => posizione(r.y, r.altezza, l)),
    rif.y,
    soglia,
  );
  const guide: Guida[] = [];
  if (sx) guide.push({ asse: 'x', valore: sx.valore });
  if (sy) guide.push({ asse: 'y', valore: sy.valore });
  return { dx: sx?.scarto ?? 0, dy: sy?.scarto ?? 0, guide };
}

/** Dentro il foglio in larghezza, e fra la cima e l'altezza massima di una fascia. */
export function nelFoglio(r: Rettangolo): Rettangolo {
  const larghezza = Math.min(r.larghezza, LARGHEZZA_FOGLIO);
  const altezza = Math.min(r.altezza, ALTEZZA_MASSIMA_FASCIA);
  return {
    x: Math.min(Math.max(0, r.x), LARGHEZZA_FOGLIO - larghezza),
    y: Math.min(Math.max(0, r.y), ALTEZZA_MASSIMA_FASCIA - altezza),
    larghezza,
    altezza,
  };
}

/**
 * Il rettangolo ridimensionato da una maniglia, tenendo fermo il lato (o
 * l'angolo) opposto. Con `proporzioni` (le immagini, dagli angoli) la
 * misura che cambia di più trascina l'altra.
 */
export function ridimensiona(
  inizio: Rettangolo,
  maniglia: Maniglia,
  dx: number,
  dy: number,
  opzioni: { minimo: { larghezza: number; altezza: number }; proporzioni?: boolean },
): Rettangolo {
  const { minimo } = opzioni;
  const ovest = maniglia.includes('w');
  const est = maniglia.includes('e');
  const nord = maniglia.includes('n');
  const sud = maniglia.includes('s');

  let larghezza = inizio.larghezza + (est ? dx : ovest ? -dx : 0);
  let altezza = inizio.altezza + (sud ? dy : nord ? -dy : 0);
  /* Non oltre i bordi del foglio né sopra la cima della fascia, dal lato che si tira. */
  if (ovest) larghezza = Math.min(larghezza, inizio.x + inizio.larghezza);
  if (est) larghezza = Math.min(larghezza, LARGHEZZA_FOGLIO - inizio.x);
  if (nord) altezza = Math.min(altezza, inizio.y + inizio.altezza);
  if (sud) altezza = Math.min(altezza, ALTEZZA_MASSIMA_FASCIA - inizio.y);
  larghezza = Math.max(minimo.larghezza, larghezza);
  altezza = Math.max(minimo.altezza, altezza);

  if (opzioni.proporzioni && (est || ovest) && (nord || sud)) {
    const scala = Math.max(larghezza / inizio.larghezza, altezza / inizio.altezza);
    const tetto = Math.min(
      (ovest ? inizio.x + inizio.larghezza : LARGHEZZA_FOGLIO - inizio.x) / inizio.larghezza,
      (nord ? inizio.y + inizio.altezza : ALTEZZA_MASSIMA_FASCIA - inizio.y) / inizio.altezza,
    );
    const minima = Math.max(minimo.larghezza / inizio.larghezza, minimo.altezza / inizio.altezza);
    const s = Math.max(minima, Math.min(scala, tetto));
    larghezza = inizio.larghezza * s;
    altezza = inizio.altezza * s;
  }

  return {
    x: ovest ? inizio.x + inizio.larghezza - larghezza : inizio.x,
    y: nord ? inizio.y + inizio.altezza - altezza : inizio.y,
    larghezza,
    altezza,
  };
}

/**
 * Le posizioni allineate. Con più elementi si allineano fra loro (al
 * contorno della selezione); uno da solo si allinea ai margini del corpo in
 * orizzontale, e alla fascia in verticale.
 */
export function allinea(
  selezione: readonly Rettangolo[],
  come: Allineamento,
  altezzaFascia: number,
): { x: number; y: number }[] {
  const rif =
    selezione.length > 1
      ? contorno(selezione)
      : {
          x: MARGINE_FOGLIO,
          y: 0,
          larghezza: DESTRA_MARGINE - MARGINE_FOGLIO,
          altezza: altezzaFascia,
        };
  return selezione.map((r) => {
    switch (come) {
      case 'sinistra':
        return { x: rif.x, y: r.y };
      case 'centro':
        return { x: rif.x + (rif.larghezza - r.larghezza) / 2, y: r.y };
      case 'destra':
        return { x: rif.x + rif.larghezza - r.larghezza, y: r.y };
      case 'alto':
        return { x: r.x, y: rif.y };
      case 'mezzo':
        return { x: r.x, y: rif.y + (rif.altezza - r.altezza) / 2 };
      case 'basso':
        return { x: r.x, y: rif.y + rif.altezza - r.altezza };
    }
  });
}

/** Gli spazi uguali fra il primo e l'ultimo, sull'asse: gli estremi restano dove sono. Servono almeno tre elementi. */
export function distribuisci(
  selezione: readonly Rettangolo[],
  asse: 'x' | 'y',
): { x: number; y: number }[] {
  const posizioni = selezione.map((r) => ({ x: r.x, y: r.y }));
  if (selezione.length < 3) return posizioni;
  const misura = (r: Rettangolo): number => (asse === 'x' ? r.larghezza : r.altezza);
  const inizio = (r: Rettangolo): number => (asse === 'x' ? r.x : r.y);
  const ordine = selezione.map((r, i) => ({ r, i })).sort((a, b) => inizio(a.r) - inizio(b.r));
  const primo = ordine[0]!.r;
  const ultimo = ordine[ordine.length - 1]!.r;
  const spazio = inizio(ultimo) + misura(ultimo) - inizio(primo);
  const vuoto = (spazio - selezione.reduce((s, r) => s + misura(r), 0)) / (selezione.length - 1);
  let cursore = inizio(primo);
  for (const { r, i } of ordine) {
    posizioni[i] = asse === 'x' ? { x: cursore, y: r.y } : { x: r.x, y: cursore };
    cursore += misura(r) + vuoto;
  }
  return posizioni;
}
