/**
 * DOCX e XLSX minimi per l'esportazione su template (RF-C-10).
 *
 * Un file Office è un archivio ZIP di XML: qui lo zip è scritto a mano in
 * modalità «store» (nessuna compressione) e gli XML sono il minimo che Word
 * ed Excel accettano. Il punto non è la fedeltà tipografica — quella la farà
 * il backend vero applicando il template dell'agenzia (RF-D-10) — ma che il
 * file scaricato in demo **si apra davvero**: un download che Word rifiuta
 * trasforma la dimostrazione della funzione nel suo contrario.
 */

// ---------------------------------------------------------------------------
// ZIP (store, senza compressione)
// ---------------------------------------------------------------------------

const TABELLA_CRC = (() => {
  const tabella = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabella[n] = c >>> 0;
  }
  return tabella;
})();

function crc32(dati) {
  let c = 0xffffffff;
  for (const byte of dati) c = TABELLA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Impacchetta `voci` — coppie nome/contenuto — in uno zip senza compressione.
 * @param {{nome: string, contenuto: string}[]} voci
 * @returns {Buffer}
 */
function zip(voci) {
  const locali = [];
  const centrali = [];
  let scostamento = 0;

  for (const { nome, contenuto } of voci) {
    const nomeByte = Buffer.from(nome, 'utf8');
    const dati = Buffer.from(contenuto, 'utf8');
    const crc = crc32(dati);

    const localeTesta = Buffer.alloc(30);
    localeTesta.writeUInt32LE(0x04034b50, 0);
    localeTesta.writeUInt16LE(20, 4); // versione richiesta
    localeTesta.writeUInt32LE(crc, 14);
    localeTesta.writeUInt32LE(dati.length, 18); // compresso = originale (store)
    localeTesta.writeUInt32LE(dati.length, 22);
    localeTesta.writeUInt16LE(nomeByte.length, 26);
    locali.push(localeTesta, nomeByte, dati);

    const centrale = Buffer.alloc(46);
    centrale.writeUInt32LE(0x02014b50, 0);
    centrale.writeUInt16LE(20, 6);
    centrale.writeUInt32LE(crc, 16);
    centrale.writeUInt32LE(dati.length, 20);
    centrale.writeUInt32LE(dati.length, 24);
    centrale.writeUInt16LE(nomeByte.length, 28);
    centrale.writeUInt32LE(scostamento, 42);
    centrali.push(centrale, nomeByte);

    scostamento += 30 + nomeByte.length + dati.length;
  }

  const corpoCentrale = Buffer.concat(centrali);
  const coda = Buffer.alloc(22);
  coda.writeUInt32LE(0x06054b50, 0);
  coda.writeUInt16LE(voci.length, 8);
  coda.writeUInt16LE(voci.length, 10);
  coda.writeUInt32LE(corpoCentrale.length, 12);
  coda.writeUInt32LE(scostamento, 16);

  return Buffer.concat([...locali, corpoCentrale, coda]);
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

const scappaXml = (testo) =>
  testo
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="{PARTE}"/>
</Relationships>`;

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

/**
 * Un documento Word: titolo, paragrafi del testo, fonti in coda.
 * Il markdown minimo si spiana: la fedeltà al template è compito del backend.
 * @returns {Buffer}
 */
export function generaDocx(titolo, testo, fonti = []) {
  const paragrafo = (t, grassetto = false) =>
    `<w:p><w:r>${grassetto ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${scappaXml(t)}</w:t></w:r></w:p>`;

  const corpo = [
    paragrafo(titolo, true),
    paragrafo('Documento simulato — generato da VELIA su template'),
    paragrafo(''),
    ...testo
      .replaceAll('**', '')
      .split(/\n{2,}/)
      .map((p) => paragrafo(p.replace(/\s+/g, ' ').trim())),
    ...(fonti.length ? [paragrafo(''), paragrafo('Fonti', true), ...fonti.map((f) => paragrafo(f))] : []),
  ].join('');

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${corpo}</w:body>
</w:document>`;

  const tipi = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  return zip([
    { nome: '[Content_Types].xml', contenuto: tipi },
    { nome: '_rels/.rels', contenuto: RELS.replace('{PARTE}', 'word/document.xml') },
    { nome: 'word/document.xml', contenuto: documento },
  ]);
}

// ---------------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------------

/**
 * Un foglio Excel con le righe date (array di array di stringhe), come
 * stringhe in linea: niente tabella condivisa, niente stili.
 * @returns {Buffer}
 */
export function generaXlsx(righe) {
  const cella = (testo) =>
    `<c t="inlineStr"><is><t xml:space="preserve">${scappaXml(testo)}</t></is></c>`;
  const foglio = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${righe.map((r) => `<row>${r.map(cella).join('')}</row>`).join('')}</sheetData>
</worksheet>`;

  const cartella = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Analisi" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const relazioniCartella = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const tipi = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  return zip([
    { nome: '[Content_Types].xml', contenuto: tipi },
    { nome: '_rels/.rels', contenuto: RELS.replace('{PARTE}', 'xl/workbook.xml') },
    { nome: 'xl/workbook.xml', contenuto: cartella },
    { nome: 'xl/_rels/workbook.xml.rels', contenuto: relazioniCartella },
    { nome: 'xl/worksheets/sheet1.xml', contenuto: foglio },
  ]);
}
