import PizZip from 'pizzip';

import type { FileRicevuto } from './formati.js';

/**
 * L'importazione di un archivio esistente.
 *
 * Un'agenzia non arriva mai senza documenti: arriva con la sua
 * cartellazione, fatta in anni di lavoro, ed è da quella che nasce la
 * convenzione. Quindi l'importazione **deve conservare i percorsi**: un
 * upload che li appiattisce butta via esattamente l'informazione da cui
 * dipende tutto il resto della Fase 10.
 *
 * Due strade, stesso risultato. Il browser sa mandare una cartella intera
 * (`webkitdirectory`) e allora ogni file porta il suo percorso relativo in
 * un campo che lo precede; oppure si carica uno zip, e i percorsi sono già
 * dentro. PizZip è già una dipendenza (arriva con docxtemplater): non serve
 * altro.
 */

/** Oltre questo numero di file uno zip non è un archivio d'agenzia, è un problema. */
const MASSIMI_INGRESSI = 500;

export interface FileConPercorso extends FileRicevuto {
  /** Il percorso relativo di origine, cartelle comprese: `Clienti/Rossi Mario/polizza.pdf`. */
  percorso?: string;
  /**
   * Viene da uno zip aperto qui. Cambia una cosa sola, ma importante: in un
   * lotto normale un formato che non sappiamo leggere rifiuta tutto (415,
   * contratto di Fase 2), mentre in un archivio d'agenzia ci sono sempre un
   * `.doc` del 2009 e un `thumbs.db`, e far fallire l'importazione intera
   * per quelli sarebbe una crudeltà. Quelli si saltano e si dice quali.
   */
  daZip?: boolean;
}

export function eZip(file: FileRicevuto): boolean {
  // Firma PK\x03\x04 e nome che lo dichiara: né l'una né l'altro da soli,
  // perché anche un .docx comincia per PK.
  return (
    /\.zip$/i.test(file.nome) &&
    file.contenuto.length > 4 &&
    file.contenuto[0] === 0x50 &&
    file.contenuto[1] === 0x4b
  );
}

/**
 * Lo zip diventa i file che contiene, col percorso addosso. Le cartelle, le
 * voci di sistema e i file vuoti si saltano: nessuno vuole `__MACOSX` nel
 * proprio archivio.
 */
export function espandiZip(zip: FileRicevuto): FileConPercorso[] {
  let archivio: PizZip;
  try {
    archivio = new PizZip(zip.contenuto);
  } catch {
    return [];
  }

  const espansi: FileConPercorso[] = [];
  for (const nome of Object.keys(archivio.files)) {
    if (espansi.length >= MASSIMI_INGRESSI) break;
    const voce = archivio.files[nome];
    if (!voce || voce.dir) continue;
    const percorso = normalizzaPercorso(nome);
    if (!percorso) continue;
    const base = percorso.split('/').pop()!;
    if (!base || base.startsWith('.')) continue;

    const contenuto = Buffer.from(voce.asUint8Array());
    if (!contenuto.length) continue;
    espansi.push({
      nome: base,
      mimetype: 'application/octet-stream',
      contenuto,
      troncato: false,
      percorso,
      daZip: true,
    });
  }
  return espansi;
}

/**
 * Il percorso ripulito: niente risalite, niente radici assolute, niente
 * cartelle di servizio. Uno zip è contenuto altrui, e il percorso che porta
 * finisce a costruire cartelle: si tratta come tale.
 */
export function normalizzaPercorso(grezzo: string): string | null {
  const parti = grezzo
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p && p !== '.' && p !== '..');
  if (!parti.length) return null;
  if (parti.some((p) => p === '__MACOSX' || p === '.DS_Store')) return null;
  return parti.join('/');
}

/** Le sole cartelle del percorso, senza il nome del file. */
export function cartelleDelPercorso(percorso: string | undefined): string[] {
  if (!percorso) return [];
  const parti = percorso.split('/').filter(Boolean);
  return parti.slice(0, -1);
}
