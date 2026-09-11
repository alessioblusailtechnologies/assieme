/** `heic-convert` non porta i suoi tipi: qui solo ciò che usiamo (`worker/ingestion/immagini.ts`). */
declare module 'heic-convert' {
  export default function convertiHeic(opzioni: {
    buffer: Buffer | Uint8Array | ArrayBuffer;
    format: 'PNG' | 'JPEG';
    quality?: number;
  }): Promise<ArrayBuffer | Uint8Array>;
}
