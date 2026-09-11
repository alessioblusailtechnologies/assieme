import type { Elemento, Fascia, Paragrafo } from '../contratto/intestazione.js';
import type { FasceDocumento } from './intestazione.js';

/**
 * La carta dell'agenzia per i formati su cui il worker non stampa niente
 * (11/09/2026, fase 1 di `PIANO-LINK-E-FORMATI.md`): pagine web, immagini,
 * PowerPoint. Lì il marchio lo disegna la sandbox, e le servono i materiali:
 * i loghi così come l'agenzia li ha caricati, e in `carta.md` il nome, i
 * testi di intestazione e piè e i colori, con dove stanno sul foglio.
 *
 * I campi della pagina (numero, pagine totali) non valgono per una pagina
 * web o un'immagine: il paragrafo che li contiene non si riporta.
 */

export interface FileCarta {
  /** Relativo a `/lavoro`. */
  path: string;
  byte: Buffer | string;
}

export function cartaPerSandbox(fasce: FasceDocumento): FileCarta[] {
  const file: FileCarta[] = [];
  for (const [id, immagine] of fasce.immagini) file.push({ path: `carta/${id}`, byte: immagine.byte });

  const righe = ['# La carta dell’agenzia', '', `Agenzia: ${fasce.campi.agenzia || '(nome non indicato)'}`];
  for (const [titolo, fascia] of [['Intestazione', fasce.intestazione], ['Piè di pagina', fasce.piede]] as const) {
    const voci = descriviFascia(fascia, fasce);
    if (voci.length) righe.push('', `## ${titolo}`, '', ...voci);
  }
  const colori = [...new Set([...fasce.intestazione.elementi, ...fasce.piede.elementi].flatMap(coloreDi))];
  if (colori.length) righe.push('', `Colori usati: ${colori.join(', ')}`);
  file.push({ path: 'carta/carta.md', byte: `${righe.join('\n')}\n` });
  return file;
}

/** Gli elementi di una fascia dall'alto in basso e da sinistra a destra, a parole. */
function descriviFascia(fascia: Fascia, fasce: FasceDocumento): string[] {
  const ordinati = [...fascia.elementi].sort((a, b) => a.y - b.y || a.x - b.x);
  const voci: string[] = [];
  for (const e of ordinati) {
    const dove = `${posizione(e)}, ${Math.round(e.larghezza)}×${Math.round(e.altezza)} mm`;
    if (e.tipo === 'immagine' && fasce.immagini.has(e.immagine)) {
      voci.push(`- Immagine \`/lavoro/carta/${e.immagine}\` (${dove})`);
    } else if (e.tipo === 'testo') {
      const testo = testoDeiParagrafi(e.paragrafi, fasce.campi);
      if (testo) voci.push(`- Testo (${dove}, ${e.dimensione} pt, ${e.colore}):`, ...testo.split('\n').map((r) => `  > ${r}`));
    }
  }
  return voci;
}

function posizione(e: Elemento): string {
  const centro = e.x + e.larghezza / 2;
  return centro < 70 ? 'a sinistra' : centro > 140 ? 'a destra' : 'al centro';
}

function coloreDi(e: Elemento): string[] {
  return e.tipo === 'immagine' ? [] : [e.colore.toLowerCase()];
}

function testoDeiParagrafi(paragrafi: Paragrafo[], campi: FasceDocumento['campi']): string {
  return paragrafi
    .filter((p) => !(p.content ?? []).some((n) => n.type === 'campo' && (n.attrs.nome === 'pagina' || n.attrs.nome === 'pagine')))
    .map((p) =>
      (p.content ?? [])
        .map((n) => (n.type === 'text' ? n.text : n.type === 'hardBreak' ? '\n' : n.type === 'campo' ? campi[n.attrs.nome as keyof typeof campi] : ''))
        .join('')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}
