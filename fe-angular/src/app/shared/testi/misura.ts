const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/**
 * Il peso di un file in forma leggibile.
 *
 * L'unità si sceglie da sé: un preventivo di 240 KB scritto come "0.2 MB"
 * sembra vuoto, e un archivio da 5 GB scritto in MB non si legge. Un decimale
 * sopra il megabyte, nessuno sotto — sui kilobyte è rumore.
 *
 * Le migliaia non si separano di proposito: "1.024 KB" in italiano si legge
 * come un decimale, ed è il tipo di ambiguità che in un limite di spazio non
 * ci si può permettere.
 */
export function dimensioneLeggibile(byte: number | undefined): string {
  if (byte === undefined || !Number.isFinite(byte) || byte < 0) return '-';
  if (byte < KB) return `${byte} B`;
  if (byte < MB) return `${Math.round(byte / KB)} KB`;
  if (byte < GB) return `${(byte / MB).toFixed(1)} MB`;
  return `${(byte / GB).toFixed(1)} GB`;
}
