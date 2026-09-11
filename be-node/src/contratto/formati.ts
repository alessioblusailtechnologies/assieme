/**
 * I formati dei file che escono da VELIA (11/09/2026, fase 1 di
 * `PIANO-LINK-E-FORMATI.md`): la sandbox consegna qualsiasi file, e il
 * formato di un documento generato è la sua estensione.
 *
 * L'unico limite sono gli eseguibili: un'agenzia non ne ha bisogno, e un
 * cliente non deve ricevere un programma da VELIA. Lo stesso elenco sta nel
 * runner della sandbox (`sandbox/server.mjs`), che non importa da qui: il
 * worker lo riapplica comunque, perché il runner è un altro servizio.
 */

export const ESTENSIONI_ESEGUIBILI: ReadonlySet<string> = new Set([
  'exe', 'msi', 'msp', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'msc', 'lnk', 'reg',
  'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta',
  'jar', 'apk', 'app', 'dmg', 'pkg', 'deb', 'rpm', 'sh', 'run', 'bin',
]);

/** Un'estensione come la scrive un file: lettere e cifre, corta. */
export const E_ESTENSIONE = /^[a-z0-9]{1,10}$/;

/** L'estensione di un nome di file, in minuscolo; vuota se non ce n'è una valida. */
export function estensioneDi(nome: string): string {
  const punto = nome.lastIndexOf('.');
  if (punto <= 0 || punto === nome.length - 1) return '';
  const e = nome.slice(punto + 1).toLowerCase();
  return E_ESTENSIONE.test(e) ? e : '';
}

/** Se un file di quel formato si può consegnare: un'estensione valida, e non un eseguibile. */
export function consegnabile(formato: string): boolean {
  return E_ESTENSIONE.test(formato) && !ESTENSIONI_ESEGUIBILI.has(formato);
}

/** I formati su cui il worker stampa intestazione e piè dell'agenzia. */
export const FORMATI_TIMBRABILI = ['pdf', 'docx', 'xlsx'] as const;

export type FormatoTimbrabile = (typeof FORMATI_TIMBRABILI)[number];

export function timbrabile(formato: string): formato is FormatoTimbrabile {
  return (FORMATI_TIMBRABILI as readonly string[]).includes(formato);
}

const TIPI: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  tsv: 'text/tab-separated-values; charset=utf-8',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  ics: 'text/calendar; charset=utf-8',
  vcf: 'text/vcard; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  '7z': 'application/x-7z-compressed',
  eml: 'message/rfc822',
  epub: 'application/epub+zip',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

/** Il tipo MIME di un formato; un formato che non conosciamo è un file binario generico. */
export function mimeDi(formato: string): string {
  return TIPI[formato] ?? 'application/octet-stream';
}
