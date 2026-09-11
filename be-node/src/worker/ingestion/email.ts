import msgreader from '@kenjiuno/msgreader';
import { simpleParser, type AddressObject } from 'mailparser';

import { markdownDaPaginaWeb } from './html.js';

/**
 * Le email (11/09/2026, fase 3 di `PIANO-LINK-E-FORMATI.md`): un `.eml`
 * (anche una PEC) o un `.msg` di Outlook diventano un documento con
 * intestazioni e corpo, e i loro allegati file a sé.
 *
 * Il corpo è il testo della mail; se c'è solo HTML, il suo testo. Gli
 * allegati non entrano nel Markdown dell'email, che ne dà l'elenco: in
 * archivio diventano documenti a sé (letti ciascuno per quello che è), in
 * chat li apre l'allegato veloce. Le immagini dentro il corpo (loghi,
 * firme) e la firma S/MIME di una PEC (`smime.p7s`) non sono allegati per
 * nessuno: si saltano.
 */

export interface AllegatoEmail {
  nome: string;
  mimetype: string;
  contenuto: Buffer;
}

export interface EmailLetta {
  oggetto: string;
  markdown: string;
  allegati: AllegatoEmail[];
}

const FIRMA_OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/* Il pacchetto è CommonJS con `exports.default`: sotto NodeNext l'import di
   default ne prende il modulo intero, e la classe sta in `.default`. */
const MsgReader = msgreader.default;

export async function leggiEmail(contenuto: Buffer): Promise<EmailLetta> {
  return contenuto.subarray(0, 8).equals(FIRMA_OLE) ? leggiMsg(contenuto) : leggiEml(contenuto);
}

function saltare(nome: string, mimetype: string): boolean {
  return /^smime\.p7s$/i.test(nome) || /pkcs7-signature/i.test(mimetype);
}

async function leggiEml(contenuto: Buffer): Promise<EmailLetta> {
  const m = await simpleParser(contenuto, { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true });
  /* «Nome <indirizzo>», senza le virgolette che `text` mette attorno al nome. */
  const indirizzi = (a: AddressObject | AddressObject[] | undefined) =>
    (Array.isArray(a) ? a : a ? [a] : [])
      .flatMap((x) => x.value)
      .map((v) => (v.name && v.address ? `${v.name} <${v.address}>` : v.name || v.address || ''))
      .filter(Boolean)
      .join(', ');
  const corpo = m.text?.trim() || (typeof m.html === 'string' ? markdownDaPaginaWeb(m.html) : '');
  const allegati: AllegatoEmail[] = [];
  for (const a of m.attachments) {
    /* Le immagini citate dal corpo (cid:) sono il corpo, non allegati. */
    if (a.related || (a.contentDisposition === 'inline' && a.contentId && /^image\//.test(a.contentType))) continue;
    const nome = a.filename || `allegato-${allegati.length + 1}${a.contentType === 'message/rfc822' ? '.eml' : ''}`;
    if (saltare(nome, a.contentType)) continue;
    allegati.push({ nome, mimetype: a.contentType || 'application/octet-stream', contenuto: a.content });
  }
  return componi(
    m.subject ?? '',
    [
      ['Da', indirizzi(m.from)],
      ['A', indirizzi(m.to)],
      ['Cc', indirizzi(m.cc)],
      ['Data', m.date ? m.date.toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' }) : ''],
    ],
    corpo,
    allegati,
  );
}

function leggiMsg(contenuto: Buffer): Promise<EmailLetta> {
  const lettore = new MsgReader(contenuto.buffer.slice(contenuto.byteOffset, contenuto.byteOffset + contenuto.byteLength) as ArrayBuffer);
  const dati = lettore.getFileData();
  const destinatari = (tipo: 'to' | 'cc') =>
    (dati.recipients ?? [])
      .filter((r) => (r.recipType ?? 'to') === tipo)
      .map((r) => (r.name && (r.smtpAddress ?? r.email) ? `${r.name} <${r.smtpAddress ?? r.email}>` : (r.name ?? r.smtpAddress ?? r.email ?? '')))
      .filter(Boolean)
      .join(', ');
  const html = dati.bodyHtml ?? (dati.html ? Buffer.from(dati.html).toString('utf8') : '');
  const corpo = dati.body?.trim() || (html ? markdownDaPaginaWeb(html) : '');
  const allegati: AllegatoEmail[] = [];
  for (const a of dati.attachments ?? []) {
    /* Una mail inoltrata come allegato di Outlook: il lettore non ne dà i byte, se ne dice il nome. */
    if (a.innerMsgContent) continue;
    try {
      const file = lettore.getAttachment(a);
      const nome = file.fileName || a.fileName || `allegato-${allegati.length + 1}`;
      const mimetype = a.attachMimeTag || 'application/octet-stream';
      if (saltare(nome, mimetype) || !file.content?.length) continue;
      allegati.push({ nome, mimetype, contenuto: Buffer.from(file.content) });
    } catch {
      /* Un allegato che non si estrae non ferma la mail. */
    }
  }
  const data = dati.messageDeliveryTime ?? dati.clientSubmitTime ?? dati.creationTime;
  return Promise.resolve(
    componi(
      dati.subject ?? '',
      [
        ['Da', dati.senderName && dati.senderEmail ? `${dati.senderName} <${dati.senderEmail}>` : (dati.senderName ?? dati.senderEmail ?? '')],
        ['A', destinatari('to')],
        ['Cc', destinatari('cc')],
        ['Data', data ? new Date(data).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' }) : ''],
      ],
      corpo,
      allegati,
    ),
  );
}

function componi(oggetto: string, intestazioni: Array<[string, string]>, corpo: string, allegati: AllegatoEmail[]): EmailLetta {
  const righe = [`# ${oggetto.trim() || 'Email senza oggetto'}`, ''];
  for (const [nome, valore] of intestazioni) if (valore.trim()) righe.push(`- **${nome}:** ${valore.trim()}`);
  righe.push('', corpo.trim() || '_(Email senza testo.)_');
  if (allegati.length) {
    righe.push('', '## Allegati', '');
    for (const a of allegati) righe.push(`- ${a.nome} (${Math.max(1, Math.round(a.contenuto.length / 1024))} KB)`);
  }
  return { oggetto: oggetto.trim(), markdown: righe.join('\n'), allegati };
}
