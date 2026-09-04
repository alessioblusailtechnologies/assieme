/**
 * Che cosa arriva dagli appunti quando si incolla nel composer.
 *
 * L'editor accetta solo testo semplice: il markup di fuori non entra. Ma
 * un'immagine non è markup, è contenuto — lo screenshot di un preventivo,
 * la foto di un libretto, un ritaglio di condizioni — e chi ce l'ha negli
 * appunti si aspetta di poterla incollare come farebbe ovunque.
 *
 * Qui sta solo la decisione, pura e provabile: quali file degli appunti
 * sono immagini che sappiamo leggere, come si chiamano, e quante ne
 * restano fuori. Dove finiscono lo decide il composer.
 */

/** I formati immagine che l'ingestion sa leggere (`documenti-privati.ts`). */
const MIME_LEGGIBILI = ['image/png', 'image/jpeg'];

export interface ImmaginiIncollate {
  /** Le immagini da allegare, già col loro nome. */
  leggibili: File[];
  /** Quante sono rimaste fuori perché in un formato che non leggiamo. */
  scartate: number;
}

/**
 * Le immagini negli appunti, se ce ne sono.
 *
 * **Il testo vince**, e non è una preferenza estetica: copiando una tabella
 * da Excel o un paragrafo da Word, Windows mette negli appunti anche la
 * versione a immagine. Se vincesse quella, incollare da Excel smetterebbe
 * di incollare la tabella e allegherebbe una figura — un gesto quotidiano
 * rotto per far funzionare un gesto raro.
 *
 * Uno screenshot, un ritaglio, un'immagine copiata dal browser non portano
 * testo con sé: è lì che questa strada si apre.
 */
export function immaginiIncollate(dati: DataTransfer | null, ora = new Date()): ImmaginiIncollate {
  if ((dati?.getData('text/plain') ?? '').trim()) return { leggibili: [], scartate: 0 };
  const immagini = [...(dati?.files ?? [])].filter((f) => f.type.startsWith('image/'));
  const leggibili = immagini.filter((f) => MIME_LEGGIBILI.includes(f.type));
  return {
    leggibili: leggibili.map((f, indice) => nomina(f, ora, indice)),
    scartate: immagini.length - leggibili.length,
  };
}

/**
 * Gli screenshot arrivano tutti chiamati `image.png`: nel contesto della
 * conversazione diventerebbero una fila di chip identici, e il titolo del
 * documento pure. L'ora è l'unica cosa che di un'immagine incollata si sa
 * davvero, e basta a distinguerle; l'indice serve solo quando ne arrivano
 * più d'una nello stesso gesto.
 */
function nomina(file: File, ora: Date, indice: number): File {
  const orario = `${ora.getHours()}.${`${ora.getMinutes()}`.padStart(2, '0')}`;
  const progressivo = indice > 0 ? ` (${indice + 1})` : '';
  const estensione = file.type === 'image/jpeg' ? '.jpg' : '.png';
  return new File([file], `Immagine incollata ${orario}${progressivo}${estensione}`, {
    type: file.type,
  });
}
