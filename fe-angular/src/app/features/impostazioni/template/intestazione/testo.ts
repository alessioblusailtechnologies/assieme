import { Allineamento, Inline, Marca, Paragrafo } from '@core/models';

/**
 * Il testo di una casella trattato tutto insieme (11/09/2026): quando la
 * casella è selezionata ma non ci si sta scrivendo dentro, grassetto,
 * allineamento, corpo e colore valgono per tutta la casella, come in
 * PowerPoint. Sono trasformazioni del JSON del contratto, senza editor.
 */

export type Segno = 'bold' | 'italic' | 'underline';
export type AttributoStile = 'color' | 'fontSize' | 'fontFamily';

type ConMarche = Exclude<Inline, { type: 'hardBreak' }>;

const conMarche = (n: Inline): n is ConMarche => n.type !== 'hardBreak';

const pezzi = (paragrafi: readonly Paragrafo[]): ConMarche[] =>
  paragrafi.flatMap((p) => (p.content ?? []).filter(conMarche));

function rimarca(
  paragrafi: readonly Paragrafo[],
  cambia: (marche: Marca[]) => Marca[],
): Paragrafo[] {
  return paragrafi.map((p) =>
    p.content
      ? {
          ...p,
          content: p.content.map((n) => {
            if (!conMarche(n)) return n;
            const marks = cambia(n.marks ?? []);
            const resto = { ...n };
            delete resto.marks;
            return marks.length ? { ...resto, marks } : resto;
          }),
        }
      : p,
  );
}

/** Tutto il testo della casella ha il segno (e ce n'è). */
export function tuttiConSegno(paragrafi: readonly Paragrafo[], segno: Segno): boolean {
  const tutti = pezzi(paragrafi);
  return tutti.length > 0 && tutti.every((n) => n.marks?.some((m) => m.type === segno));
}

/** Il segno su tutto il testo della casella, o via da tutto. */
export function conSegno(
  paragrafi: readonly Paragrafo[],
  segno: Segno,
  acceso: boolean,
): Paragrafo[] {
  return rimarca(paragrafi, (marche) => {
    const altre = marche.filter((m) => m.type !== segno);
    return acceso ? [...altre, { type: segno }] : altre;
  });
}

/** Toglie un attributo dello stile a tutto il testo: torna a valere quello della casella. */
export function senzaStile(
  paragrafi: readonly Paragrafo[],
  attributo: AttributoStile,
): Paragrafo[] {
  return rimarca(paragrafi, (marche) =>
    marche.flatMap((m) => {
      if (m.type !== 'textStyle' || !m.attrs) return [m];
      const attrs = { ...m.attrs };
      delete attrs[attributo];
      return Object.values(attrs).some((v) => v !== null && v !== undefined)
        ? [{ type: 'textStyle' as const, attrs }]
        : [];
    }),
  );
}

export function conAllineamento(
  paragrafi: readonly Paragrafo[],
  allineamento: Allineamento,
): Paragrafo[] {
  return paragrafi.map((p) => {
    const senza: Paragrafo = { ...p };
    delete senza.attrs;
    return allineamento === 'left' ? senza : { ...senza, attrs: { textAlign: allineamento } };
  });
}

/** Il valore di un attributo se tutto il testo lo condivide (contando quello della casella dove il testo non ne dice), altrimenti `undefined`. */
export function valoreComune<T>(
  paragrafi: readonly Paragrafo[],
  attributo: AttributoStile,
  base: T,
): T | undefined {
  const valori = new Set<unknown>();
  for (const n of pezzi(paragrafi)) {
    const stile = n.marks?.find(
      (m): m is Extract<Marca, { type: 'textStyle' }> => m.type === 'textStyle',
    );
    valori.add(stile?.attrs?.[attributo] ?? base);
  }
  if (!valori.size) return base;
  return valori.size === 1 ? ([...valori][0] as T) : undefined;
}

/** L'allineamento dei paragrafi, se tutti lo condividono. */
export function allineamentoComune(paragrafi: readonly Paragrafo[]): Allineamento | undefined {
  const valori = new Set(paragrafi.map((p) => p.attrs?.textAlign ?? 'left'));
  return valori.size === 1 ? [...valori][0] : undefined;
}
