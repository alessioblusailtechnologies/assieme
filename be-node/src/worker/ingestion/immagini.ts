import sharp from 'sharp';

/**
 * Le immagini che non sono PNG o JPEG (11/09/2026, fase 3 di
 * `PIANO-LINK-E-FORMATI.md`): WEBP, GIF, TIFF, BMP, AVIF e le HEIC degli
 * iPhone diventano PNG, perché il resto della catena (il PDF di una pagina
 * per il visualizzatore, la lettura del modello) prende PNG e JPEG.
 *
 * `sharp` legge quasi tutto; le HEIC no (il suo libvips non ha il codec
 * HEVC), e per quelle c'è `heic-convert`, in WebAssembly. Di una GIF animata
 * o di un TIFF di più pagine si tiene la prima; l'orientamento della foto si
 * applica, così una foto scattata in verticale resta in verticale.
 */

/** Oltre questo un'immagine non è una foto, è un attacco (100 megapixel). */
const PIXEL_MASSIMI = 100_000_000;

function eIsoConMarca(contenuto: Buffer): boolean {
  return contenuto.subarray(4, 8).toString('latin1') === 'ftyp';
}

export async function inPng(contenuto: Buffer): Promise<Buffer> {
  try {
    return await sharp(contenuto, { limitInputPixels: PIXEL_MASSIMI }).rotate().png().toBuffer();
  } catch (errore) {
    if (!eIsoConMarca(contenuto)) throw errore;
    const { default: convertiHeic } = await import('heic-convert');
    const png = await convertiHeic({ buffer: contenuto, format: 'PNG' });
    return Buffer.from(png instanceof ArrayBuffer ? new Uint8Array(png) : png);
  }
}
