/**
 * I file firmati digitalmente, `.p7m` (11/09/2026, fase 3 di
 * `PIANO-LINK-E-FORMATI.md`): una busta CAdES che contiene il documento
 * vero, quasi sempre un PDF. In agenzia arrivano di continuo (contratti,
 * atti, PEC), e il contenuto si legge sbustandolo; la busta resta come
 * originale, perché è lei ad avere valore legale.
 *
 * La firma non si verifica: qui interessa il contenuto, e la verifica di una
 * firma qualificata è un altro mestiere. Si legge solo la struttura CMS
 * (`ContentInfo` → `SignedData` → `encapContentInfo` → `eContent`), in BER,
 * perché molti firmatari usano le lunghezze indefinite e l'OCTET STRING a
 * pezzi. Una busta dentro una busta (`.p7m.p7m`) si sbusta di nuovo; una
 * busta in base64 (con o senza intestazione PEM) si decodifica prima.
 */

interface Elemento {
  classe: number;
  costruito: boolean;
  tag: number;
  /** Il contenuto, fra `inizio` e `fine`. */
  inizio: number;
  fine: number;
  /** Dove comincia l'elemento successivo. */
  dopo: number;
}

const OID_SIGNED_DATA = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02]);

/** Un elemento BER a partire da `pos`, con la sua fine anche a lunghezza indefinita. */
function leggi(buf: Buffer, pos: number, profondita = 0): Elemento {
  if (profondita > 64) throw new Error('struttura troppo annidata');
  if (pos + 2 > buf.length) throw new Error('elemento troncato');
  const primo = buf[pos]!;
  const classe = primo >> 6;
  const costruito = (primo & 0x20) !== 0;
  let tag = primo & 0x1f;
  let p = pos + 1;
  if (tag === 0x1f) {
    tag = 0;
    let b: number;
    do {
      b = buf[p++]!;
      tag = (tag << 7) | (b & 0x7f);
    } while (b & 0x80 && p < buf.length);
  }
  const l = buf[p++]!;
  if (l === 0x80) {
    /* Lunghezza indefinita: i figli fino alla coppia di zeri. */
    if (!costruito) throw new Error('lunghezza indefinita su un primitivo');
    const inizio = p;
    let q = p;
    while (!(buf[q] === 0 && buf[q + 1] === 0)) {
      if (q >= buf.length) throw new Error('fine del contenuto mancante');
      q = leggi(buf, q, profondita + 1).dopo;
    }
    return { classe, costruito, tag, inizio, fine: q, dopo: q + 2 };
  }
  let lunghezza = l;
  if (l & 0x80) {
    const byte = l & 0x7f;
    if (byte > 4) throw new Error('lunghezza impossibile');
    lunghezza = 0;
    for (let i = 0; i < byte; i++) lunghezza = lunghezza * 256 + buf[p++]!;
  }
  const fine = p + lunghezza;
  if (fine > buf.length) throw new Error('elemento oltre la fine del file');
  return { classe, costruito, tag, inizio: p, fine, dopo: fine };
}

function figli(buf: Buffer, e: Elemento): Elemento[] {
  const elenco: Elemento[] = [];
  for (let p = e.inizio; p < e.fine; ) {
    const f = leggi(buf, p);
    elenco.push(f);
    p = f.dopo;
  }
  return elenco;
}

/** Un OCTET STRING, anche a pezzi (BER costruito): i byte concatenati. */
function ottetti(buf: Buffer, e: Elemento): Buffer {
  if (!e.costruito) return buf.subarray(e.inizio, e.fine);
  return Buffer.concat(figli(buf, e).map((f) => ottetti(buf, f)));
}

/** Una busta in testo (base64, con o senza PEM) diventa i suoi byte. */
function decodificaSeTesto(contenuto: Buffer): Buffer {
  const testa = contenuto.subarray(0, 64).toString('latin1');
  if (contenuto[0] === 0x30) return contenuto;
  if (/^(-----BEGIN|[A-Za-z0-9+/=\r\n]+$)/.test(testa)) {
    const pulito = contenuto
      .toString('latin1')
      .replace(/-----(BEGIN|END)[^-]*-----/g, '')
      .replace(/[^A-Za-z0-9+/=]/g, '');
    const decodificato = Buffer.from(pulito, 'base64');
    if (decodificato[0] === 0x30) return decodificato;
  }
  return contenuto;
}

/** Il contenuto di una busta SignedData, o `undefined` se non è una busta (o la firma è staccata). */
function contenutoDellaBusta(buf: Buffer): Buffer | undefined {
  const radice = leggi(buf, 0);
  if (radice.tag !== 0x10) return undefined;
  const [tipo, contenuto] = figli(buf, radice);
  if (!tipo || tipo.tag !== 0x06 || !buf.subarray(tipo.inizio, tipo.fine).equals(OID_SIGNED_DATA)) return undefined;
  if (!contenuto || contenuto.classe !== 2 || contenuto.tag !== 0) return undefined;
  const signedData = figli(buf, contenuto)[0];
  if (!signedData || signedData.tag !== 0x10) return undefined;
  /* version, digestAlgorithms, encapContentInfo, … */
  const encap = figli(buf, signedData)[2];
  if (!encap || encap.tag !== 0x10) return undefined;
  const eContent = figli(buf, encap)[1];
  if (!eContent || eContent.classe !== 2 || eContent.tag !== 0) return undefined;
  const stringa = figli(buf, eContent)[0];
  return stringa ? ottetti(buf, stringa) : undefined;
}

export interface FileSbustato {
  contenuto: Buffer;
  /** Il nome senza le estensioni della busta: `contratto.pdf.p7m` → `contratto.pdf`. */
  nome: string;
}

/**
 * Il file firmato dentro la busta. Lancia un errore se la busta non si legge
 * o non contiene il documento (una firma «staccata», il `.p7s`, non lo porta).
 */
export function sbustaP7m(contenuto: Buffer, nome: string): FileSbustato {
  let byte = decodificaSeTesto(contenuto);
  let nomeInterno = nome;
  for (let giri = 0; giri < 4; giri++) {
    let dentro: Buffer | undefined;
    try {
      dentro = contenutoDellaBusta(byte);
    } catch (errore) {
      if (giri === 0) throw errore;
      break;
    }
    if (!dentro) {
      if (giri === 0) throw new Error('il file non contiene un documento firmato');
      break;
    }
    byte = decodificaSeTesto(dentro);
    nomeInterno = nomeInterno.replace(/\.p7m$/i, '');
    if (!/\.p7m$/i.test(nomeInterno) && byte[0] !== 0x30) break;
  }
  return { contenuto: byte, nome: nomeInterno || 'documento' };
}
