/**
 * Generatore di PDF finti.
 *
 * Il visualizzatore della Fase 3 deve aprire un documento **sulla pagina
 * citata** (RF-C-05): servono PDF veri, col numero di pagine dichiarato nei
 * metadati, non segnaposto. Questo modulo li scrive a mano — intestazione,
 * oggetti, xref — perché un PDF di solo testo con font di base non richiede
 * una libreria: Helvetica non si incorpora, i contenuti sono flussi non
 * compressi, e il risultato si apre ovunque.
 *
 * Il testo è riempitivo dichiarato: ogni pagina dice di essere una
 * simulazione. Quando arriveranno i PDF reali del cliente pilota, questo
 * modulo resta per i documenti a cui non corrisponde un file vero.
 */

const LARGHEZZA = 595; // A4 in punti
const ALTEZZA = 842;

/**
 * WinAnsi copre le accentate italiane ma la codifica qui è latin1: ciò che
 * non vi rientra si sostituisce, perché un titolo con una lineetta lunga non
 * deve corrompere il file.
 */
function sanifica(testo) {
  return testo
    .replaceAll('-', '-')
    .replaceAll('–', '-')
    .replaceAll('’', "'")
    .replaceAll('‘', "'")
    .replaceAll('“', '"')
    .replaceAll('”', '"')
    .replaceAll('€', 'EUR')
    .replaceAll('…', '...')
    .replace(/[^\x20-\xff\n]/g, '?');
}

const scappa = (testo) => testo.replace(/[\\()]/g, (c) => `\\${c}`);

/** Righe di riempimento, deterministiche per pagina: la demo è ripetibile. */
function righePagina(titolo, pagina, totale) {
  const righe = [
    { testo: 'DOCUMENTO SIMULATO - ambiente di sviluppo VELIA', dim: 8 },
    { testo: '', dim: 10 },
    { testo: titolo, dim: 14 },
    { testo: `Pagina ${pagina} di ${totale}`, dim: 9 },
    { testo: '', dim: 10 },
  ];
  const paragrafi = [
    `Art. ${pagina * 3 - 2} - Oggetto della garanzia. La Societa' presta le garanzie indicate`,
    'nella scheda di polizza nei limiti dei massimali, delle franchigie e degli',
    'scoperti pattuiti, secondo le condizioni che seguono.',
    '',
    `Art. ${pagina * 3 - 1} - Esclusioni. Sono esclusi i danni verificatisi in conseguenza di`,
    "atti dolosi dell'assicurato, nonche' i danni non direttamente riconducibili",
    'agli eventi garantiti, salvo quanto diversamente pattuito.',
    '',
    `Art. ${pagina * 3} - Obblighi in caso di sinistro. L'assicurato deve dare avviso del`,
    'sinistro entro i termini previsti, fornendo ogni documentazione utile alla',
    'valutazione del danno.',
  ];
  for (const p of paragrafi) righe.push({ testo: p, dim: 10 });
  return righe;
}

/**
 * Costruisce un PDF da un testo: il titolo in testa, poi i paragrafi
 * impaginati a larghezza fissa. Serve all'esportazione su template
 * (RF-C-10): il contenuto è quello vero della risposta, non riempitivo.
 * @returns {Buffer}
 */
export function generaPdfDaTesto(titolo, testo) {
  const RIGHE_PER_PAGINA = 38;
  const LARGHEZZA_RIGA = 88;

  const righe = [];
  for (const paragrafo of sanifica(testo).replaceAll('**', '').split(/\n{2,}/)) {
    let riga = '';
    for (const parola of paragrafo.replace(/\s+/g, ' ').trim().split(' ')) {
      if ((riga + ' ' + parola).trim().length > LARGHEZZA_RIGA) {
        righe.push(riga);
        riga = parola;
      } else {
        riga = (riga + ' ' + parola).trim();
      }
    }
    if (riga) righe.push(riga);
    righe.push('');
  }

  const paginate = [];
  for (let i = 0; i < righe.length; i += RIGHE_PER_PAGINA) {
    paginate.push(righe.slice(i, i + RIGHE_PER_PAGINA));
  }

  return componiPdf(sanifica(titolo), paginate.length || 1, (pagina) => {
    const contenuto = [
      { testo: 'DOCUMENTO SIMULATO - generato da VELIA su template', dim: 8 },
      { testo: '', dim: 10 },
      ...(pagina === 1 ? [{ testo: sanifica(titolo), dim: 14 }, { testo: '', dim: 10 }] : []),
    ];
    for (const riga of paginate[pagina - 1] ?? []) contenuto.push({ testo: riga, dim: 10 });
    return contenuto;
  });
}

/**
 * Costruisce un PDF di `numeroPagine` pagine per il documento dato.
 * @returns {Buffer}
 */
export function generaPdf(titolo, numeroPagine) {
  const titoloPulito = sanifica(titolo);
  return componiPdf(titoloPulito, numeroPagine, (pagina, totale) =>
    righePagina(titoloPulito, pagina, totale),
  );
}

/**
 * L'impalcatura comune: oggetti, flussi di contenuto, tabella xref.
 * `contenutoPagina(pagina, totale)` restituisce le righe da scrivere.
 * @returns {Buffer}
 */
function componiPdf(titolo, numeroPagine, contenutoPagina) {
  const pagine = Math.max(1, numeroPagine ?? 1);

  /* Oggetti: 1 catalogo, 2 albero pagine, 3 font; poi per ogni pagina un
     oggetto pagina e un flusso di contenuto. */
  const oggetti = [];
  const idPagina = (i) => 4 + i * 2;
  const idContenuto = (i) => 5 + i * 2;

  oggetti[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  oggetti[2] = `<< /Type /Pages /Count ${pagine} /Kids [${Array.from(
    { length: pagine },
    (_, i) => `${idPagina(i)} 0 R`,
  ).join(' ')}] >>`;
  oggetti[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;

  for (let i = 0; i < pagine; i++) {
    const righe = contenutoPagina(i + 1, pagine);
    let y = ALTEZZA - 64;
    const comandi = ['BT', '/F1 10 Tf'];
    for (const riga of righe) {
      if (riga.testo) {
        comandi.push(`/F1 ${riga.dim} Tf`, `1 0 0 1 56 ${y} Tm`, `(${scappa(riga.testo)}) Tj`);
      }
      y -= riga.dim * 1.9;
    }
    comandi.push('ET');
    const flusso = comandi.join('\n');

    oggetti[idPagina(i)] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGHEZZA} ${ALTEZZA}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${idContenuto(i)} 0 R >>`;
    oggetti[idContenuto(i)] = { flusso };
  }

  // --- Serializzazione con offset per la tabella xref ---
  let corpo = '%PDF-1.4\n';
  const offset = [];
  for (let n = 1; n < oggetti.length; n++) {
    offset[n] = Buffer.byteLength(corpo, 'latin1');
    const oggetto = oggetti[n];
    corpo +=
      typeof oggetto === 'string'
        ? `${n} 0 obj\n${oggetto}\nendobj\n`
        : `${n} 0 obj\n<< /Length ${Buffer.byteLength(oggetto.flusso, 'latin1')} >>\nstream\n${oggetto.flusso}\nendstream\nendobj\n`;
  }

  const inizioXref = Buffer.byteLength(corpo, 'latin1');
  corpo += `xref\n0 ${oggetti.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < oggetti.length; n++) {
    corpo += `${String(offset[n]).padStart(10, '0')} 00000 n \n`;
  }
  corpo += `trailer\n<< /Size ${oggetti.length} /Root 1 0 R >>\nstartxref\n${inizioXref}\n%%EOF\n`;

  return Buffer.from(corpo, 'latin1');
}
