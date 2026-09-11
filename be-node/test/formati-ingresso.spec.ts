import { readFileSync } from 'node:fs';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { estensionePerFormato, preparaFile, riconosciFormato, allegatiDaEmail } from '../src/api/archivio-privato/formati.js';
import { preparaAllegatoVeloce } from '../src/worker/ingestion/allegato-veloce.js';
import { leggiEmail } from '../src/worker/ingestion/email.js';
import { schedaFile } from '../src/worker/ingestion/estrattori.js';
import { sbustaP7m } from '../src/worker/ingestion/firmati.js';
import { markdownDaPaginaWeb } from '../src/worker/ingestion/html.js';
import { inPng } from '../src/worker/ingestion/immagini.js';

/**
 * Qualsiasi file in ingresso (11/09/2026, fase 3 di `PIANO-LINK-E-FORMATI.md`):
 * ogni file ha una famiglia, e ciò che non si sa leggere è `altro`, non un
 * rifiuto. Qui la parte meccanica: riconoscimento, immagini in PNG, buste
 * .p7m, email con gli allegati, pagine web, l'allegato veloce. Office e
 * trascrizione passano dal worker e hanno i loro collaudi.
 */

const file = (nome: string, contenuto: Buffer | string, mimetype = 'application/octet-stream') => ({
  nome,
  mimetype,
  contenuto: typeof contenuto === 'string' ? Buffer.from(contenuto, 'utf8') : contenuto,
  troncato: false,
});

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
const PDF_FIRMATO = Buffer.from('%PDF-1.4\n% documento firmato di prova\n');
const fixture = (nome: string) => readFileSync(new URL(`./fixture/p7m/${nome}`, import.meta.url));

describe('ogni file ha una famiglia', () => {
  it('le famiglie nuove si riconoscono da estensione e byte', () => {
    expect(riconosciFormato(file('pagina.html', '<!doctype html><p>ciao</p>'))).toBe('html');
    expect(riconosciFormato(file('posta.eml', 'From: a@b.it\r\nSubject: prova\r\n\r\ncorpo'))).toBe('email');
    expect(riconosciFormato(file('posta.msg', OLE))).toBe('email');
    expect(riconosciFormato(file('slide.pptx', ZIP))).toBe('office');
    expect(riconosciFormato(file('vecchio.doc', OLE))).toBe('office');
    expect(riconosciFormato(file('vecchio.xls', OLE))).toBe('office');
    expect(riconosciFormato(file('lettera.rtf', '{\\rtf1\\ansi ciao}'))).toBe('office');
    expect(riconosciFormato(file('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('office');
    expect(riconosciFormato(file('contratto.pdf.p7m', fixture('der.p7m')))).toBe('firmato');
    expect(riconosciFormato(file('vocale.opus', Buffer.from('OggS\0\0')))).toBe('audio');
    expect(riconosciFormato(file('sinistro.mp4', Buffer.from('\0\0\0\x18ftypmp42')))).toBe('video');
    expect(riconosciFormato(file('dati.json', '{"a":1}'))).toBe('testo');
    expect(riconosciFormato(file('elenco.tsv', 'a\tb\n1\t2'))).toBe('csv');
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(8)]);
    expect(riconosciFormato(file('foto.heic', heic))).toBe('immagine');
  });

  it('ciò che non si legge è «altro», e si conserva con la sua estensione', () => {
    expect(riconosciFormato(file('pianta.dwg', Buffer.from([0x41, 0x43, 0x31, 0x30, 0, 0, 0])))).toBe('altro');
    expect(riconosciFormato(file('senza-nome', Buffer.from([1, 2, 0, 3])))).toBe('altro');
    expect(riconosciFormato(file('vuoto.bin', Buffer.alloc(0)))).toBe('altro');
    /* Senza estensione ma testo: testo. */
    expect(riconosciFormato(file('appunti', 'solo testo'))).toBe('testo');
    /* Un .doc che è un PDF: i byte vincono. */
    expect(riconosciFormato(file('rinominato.doc', '%PDF-1.7\n'))).toBe('pdf');
    expect(estensionePerFormato('altro', 'pianta.dwg')).toBe('.dwg');
    expect(estensionePerFormato('altro', 'senza-nome')).toBe('.bin');
    expect(estensionePerFormato('office', 'slide.PPTX')).toBe('.pptx');
    expect(estensionePerFormato('pdf', 'rinominato.doc')).toBe('.pdf');
  });
});

describe('le immagini che non sono PNG o JPEG', () => {
  it('entrano già PNG, col nome che lo dice', async () => {
    const webp = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#2f4b7c' } }).webp().toBuffer();
    const { file: pronto, formato } = await preparaFile(file('foto.webp', webp, 'image/webp'));
    expect(formato).toBe('immagine');
    expect(pronto.nome).toBe('foto.png');
    expect(pronto.mimetype).toBe('image/png');
    expect(pronto.contenuto.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect((await sharp(pronto.contenuto).metadata()).width).toBe(4);
  });

  it('GIF e TIFF diventano PNG; un PNG resta com’è; un’immagine rotta è un file che non si legge', async () => {
    const gif = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).gif().toBuffer();
    const tiff = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#000000' } }).tiff().toBuffer();
    for (const b of [gif, tiff]) expect((await inPng(b)).subarray(1, 4).toString('latin1')).toBe('PNG');
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000000' } }).png().toBuffer();
    expect((await preparaFile(file('a.png', png))).file.contenuto).toBe(png);
    const rotta = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP'), Buffer.alloc(20)]);
    expect((await preparaFile(file('rotta.webp', rotta))).formato).toBe('altro');
  });
});

describe('i file firmati (.p7m)', () => {
  it('si sbustano in DER, in BER a lunghezza indefinita, in base64 e doppi', () => {
    for (const nome of ['der.p7m', 'ber.p7m']) {
      const s = sbustaP7m(fixture(nome), 'contratto.pdf.p7m');
      expect(s.contenuto.equals(PDF_FIRMATO), nome).toBe(true);
      expect(s.nome).toBe('contratto.pdf');
    }
    const pem = Buffer.from(`-----BEGIN PKCS7-----\n${fixture('der.p7m').toString('base64').replace(/.{64}/g, '$&\n')}\n-----END PKCS7-----\n`);
    expect(sbustaP7m(pem, 'contratto.pdf.p7m').contenuto.equals(PDF_FIRMATO)).toBe(true);
    const doppia = sbustaP7m(fixture('doppia.p7m'), 'contratto.pdf.p7m.p7m');
    expect(doppia.contenuto.equals(PDF_FIRMATO)).toBe(true);
    expect(doppia.nome).toBe('contratto.pdf');
  });

  it('una busta rotta, o che non è una busta, lo dice', () => {
    expect(() => sbustaP7m(Buffer.from('non sono una busta'), 'x.p7m')).toThrow();
    expect(() => sbustaP7m(fixture('der.p7m').subarray(0, 200), 'x.p7m')).toThrow();
  });
});

/** Un'email con testo, un PDF allegato, la firma di una PEC e, dentro, il messaggio originale con un suo allegato. */
function emlDiProva(): Buffer {
  const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');
  const interna = [
    'From: Cliente <cliente@esempio.it>',
    'To: Agenzia <agenzia@esempio.it>',
    'Subject: Denuncia sinistro',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="INT"',
    '',
    '--INT',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Vi allego il CID firmato.',
    '--INT',
    'Content-Type: text/plain; name="cid.txt"',
    'Content-Disposition: attachment; filename="cid.txt"',
    'Content-Transfer-Encoding: base64',
    '',
    b64('Constatazione amichevole: veicolo A tamponato.'),
    '--INT--',
    '',
  ].join('\r\n');
  return Buffer.from(
    [
      'From: Posta certificata <posta-certificata@pec.esempio.it>',
      'To: agenzia@pec.esempio.it',
      'Subject: POSTA CERTIFICATA: Denuncia sinistro',
      'Date: Fri, 11 Sep 2026 10:00:00 +0200',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="EST"',
      '',
      '--EST',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<html><body><p>Il giorno 11/09/2026 &egrave; stato consegnato il messaggio.</p></body></html>',
      '--EST',
      'Content-Type: application/pdf; name="polizza.pdf"',
      'Content-Disposition: attachment; filename="polizza.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      b64('%PDF-1.4\n%finta polizza\n'),
      '--EST',
      'Content-Type: message/rfc822; name="postacert.eml"',
      'Content-Disposition: attachment; filename="postacert.eml"',
      '',
      interna,
      '--EST',
      'Content-Type: application/pkcs7-signature; name="smime.p7s"',
      'Content-Disposition: attachment; filename="smime.p7s"',
      'Content-Transfer-Encoding: base64',
      '',
      b64('firma'),
      '--EST--',
      '',
    ].join('\r\n'),
  );
}

describe('le email', () => {
  it('intestazioni, corpo (anche solo HTML) ed elenco degli allegati; la firma della PEC no', async () => {
    const letta = await leggiEmail(emlDiProva());
    expect(letta.oggetto).toBe('POSTA CERTIFICATA: Denuncia sinistro');
    expect(letta.markdown).toContain('# POSTA CERTIFICATA: Denuncia sinistro');
    expect(letta.markdown).toContain('**Da:** Posta certificata <posta-certificata@pec.esempio.it>');
    expect(letta.markdown).toContain('è stato consegnato il messaggio');
    expect(letta.markdown).toContain('## Allegati');
    expect(letta.allegati.map((a) => a.nome)).toEqual(['polizza.pdf', 'postacert.eml']);
  });

  it('gli allegati a sé, compresi quelli del messaggio originale dentro la PEC', async () => {
    const allegati = await allegatiDaEmail(emlDiProva());
    expect(allegati.map((a) => a.nome)).toEqual(['polizza.pdf', 'postacert.eml', 'cid.txt']);
    expect(allegati[2]!.contenuto.toString('utf8')).toContain('veicolo A tamponato');
    expect(riconosciFormato(allegati[1]!)).toBe('email');
  });
});

describe('le pagine web', () => {
  it('titoli, paragrafi, elenchi e tabelle; niente script, stili e testa', () => {
    const md = markdownDaPaginaWeb(`<!doctype html><html><head><title>t</title><style>p{}</style></head>
      <body><script>alert(1)</script><h1 class="x">Scudo Cyber</h1><div><p>Massimale &amp; franchigia: &euro; 1.000&nbsp;per sinistro</p></div>
      <ul><li>RC terzi</li><li>Danni</li></ul><table><tr><th>Garanzia</th><th>Limite</th></tr><tr><td>PCI</td><td>10%</td></tr></table>
      <!-- nascosto --></body></html>`);
    expect(md).toContain('# Scudo Cyber');
    expect(md).toContain('Massimale & franchigia: € 1.000 per sinistro');
    expect(md).toContain('- RC terzi');
    expect(md).toContain('Garanzia | Limite');
    expect(md).toContain('PCI | 10%');
    expect(md).not.toMatch(/alert|p\{\}|nascosto|<title>/);
  });
});

describe('l’allegato veloce di ogni famiglia', () => {
  const veloce = (formato: Parameters<typeof preparaAllegatoVeloce>[0]['formato'], byte: Buffer | string, nome: string) =>
    preparaAllegatoVeloce({ formato, byte: typeof byte === 'string' ? Buffer.from(byte) : byte, titolo: nome.replace(/\.[^.]+$/, ''), nomeFile: nome });

  it('un file che non si legge ha la sua scheda, pronta subito', async () => {
    const v = await veloce('altro', Buffer.alloc(3 * 1024), 'pianta.dwg');
    expect(v?.markdown).toContain('File DWG di 3 KB');
    expect(v?.pdf?.subarray(0, 5).toString()).toBe('%PDF-');
    expect(schedaFile('senza-nome', 10)).toContain('File senza estensione, di 1 KB');
  });

  it('pagina web ed email si leggono subito; l’email porta dentro il testo degli allegati', async () => {
    expect((await veloce('html', '<h1>Proposta</h1><p>RC Auto</p>', 'proposta.html'))?.markdown).toContain('RC Auto');
    const email = await veloce('email', emlDiProva(), 'pec.eml');
    expect(email?.markdown).toContain('POSTA CERTIFICATA');
    expect(email?.markdown).toContain('## Allegato: cid.txt');
    expect(email?.markdown).toContain('veicolo A tamponato');
  });

  it('Office, audio, video e firmati li apre il worker', async () => {
    for (const formato of ['office', 'audio', 'video', 'firmato'] as const) {
      expect(await veloce(formato, ZIP, 'file.bin'), formato).toBeUndefined();
    }
  });
});
