import { analizzaMarkdown, testoPiano, type Blocco, type Segmento } from './blocchi.js';

/**
 * Una risposta della chat in forma di email e di testo semplice: la stessa
 * analisi dei blocchi dei compositori PDF/DOCX/XLSX, così titoli, elenchi e
 * tabelle restano quelli della bolla. L'HTML è quello che regge nei client
 * di posta - tabelle e stili in linea, niente CSS esterno - con l'identità
 * dell'agenzia (colore, firma, recapiti) in testa e in coda.
 */

export interface RichiestaEmailRisposta {
  /** Il titolo della conversazione: fa da oggetto. */
  titolo: string;
  /** Markdown leggero: il testo della risposta, com'è. */
  testo: string;
  /** Le fonti per esteso, una per riga («Titolo - p. N»). */
  fonti: string[];
  daParteDi: { nome: string; agenzia: string };
  identita: { colorePrimario: string; firma: string; recapiti: string };
}

export interface EmailComposta {
  oggetto: string;
  testo: string;
  html: string;
}

/** Il testo semplice di una risposta: il corpo piatto e le fonti in coda (anche l'export TXT). */
export function testoSemplice(testo: string, fonti: string[]): string {
  const righe = testoPiano(analizzaMarkdown(testo));
  if (fonti.length) righe.push('', 'Fonti', ...fonti.map((f) => `- ${f}`));
  return righe.join('\n').trim() + '\n';
}

function scappa(testo: string): string {
  return testo
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function inlinea(segmenti: Segmento[]): string {
  return segmenti.map((s) => (s.grassetto ? `<strong>${scappa(s.testo)}</strong>` : scappa(s.testo))).join('');
}

const STILE_P = 'margin:0 0 12px;font-size:15px;line-height:1.55;color:#1c1a15;';
const STILE_TD = 'padding:6px 10px;border:1px solid #e3e0d6;font-size:14px;line-height:1.4;vertical-align:top;';

/** I blocchi in HTML da posta: elenchi consecutivi in un solo `<ul>`, tabelle con la prima riga in testa. */
export function htmlDaBlocchi(blocchi: Blocco[]): string {
  const parti: string[] = [];
  let elenco: string[] = [];
  const chiudiElenco = (): void => {
    if (elenco.length) {
      parti.push(`<ul style="margin:0 0 12px;padding-left:22px;">${elenco.join('')}</ul>`);
      elenco = [];
    }
  };
  for (const b of blocchi) {
    if (b.tipo !== 'voce-elenco') chiudiElenco();
    switch (b.tipo) {
      case 'titolo': {
        const dimensione = b.livello === 1 ? 20 : b.livello === 2 ? 17 : 15;
        parti.push(
          `<h${b.livello + 1} style="margin:18px 0 8px;font-size:${dimensione}px;line-height:1.3;color:#1c1a15;">${scappa(b.testo)}</h${b.livello + 1}>`,
        );
        break;
      }
      case 'paragrafo':
        parti.push(`<p style="${STILE_P}">${inlinea(b.segmenti)}</p>`);
        break;
      case 'voce-elenco':
        elenco.push(`<li style="${STILE_P}margin-bottom:4px;">${inlinea(b.segmenti)}</li>`);
        break;
      case 'tabella': {
        const [testa, ...corpo] = b.righe;
        const righe = [
          testa ? `<tr>${testa.map((c) => `<th style="${STILE_TD}text-align:left;background:#f4f2ec;">${scappa(c)}</th>`).join('')}</tr>` : '',
          ...corpo.map((r) => `<tr>${r.map((c) => `<td style="${STILE_TD}">${scappa(c)}</td>`).join('')}</tr>`),
        ].join('');
        parti.push(`<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 12px;">${righe}</table>`);
        break;
      }
    }
  }
  chiudiElenco();
  return parti.join('');
}

export function componiEmailRisposta(r: RichiestaEmailRisposta): EmailComposta {
  const oggetto = r.titolo.trim() || 'Risposta di Velia';
  const corpo = htmlDaBlocchi(analizzaMarkdown(r.testo));
  const fonti = r.fonti.length
    ? `<p style="${STILE_P}margin-top:20px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6f6a5e;">Fonti</p>` +
      `<ul style="margin:0 0 12px;padding-left:22px;">${r.fonti.map((f) => `<li style="${STILE_P}margin-bottom:2px;font-size:13px;color:#4a463d;">${scappa(f)}</li>`).join('')}</ul>`
    : '';
  const firma = [r.identita.firma, r.identita.recapiti]
    .filter((x) => x.trim())
    .map((x) => `<p style="${STILE_P}margin:0;font-size:13px;color:#4a463d;white-space:pre-line;">${scappa(x)}</p>`)
    .join('');

  const html =
    `<div style="max-width:640px;margin:0 auto;padding:24px;font-family:Helvetica,Arial,sans-serif;background:#ffffff;">` +
    `<div style="border-top:4px solid ${scappa(r.identita.colorePrimario)};padding-top:16px;margin-bottom:20px;">` +
    `<p style="${STILE_P}margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6f6a5e;">${scappa(r.daParteDi.agenzia)}</p>` +
    `<h1 style="margin:6px 0 0;font-size:22px;line-height:1.25;color:#1c1a15;">${scappa(oggetto)}</h1>` +
    `</div>` +
    corpo +
    fonti +
    `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #e3e0d6;">${firma}` +
    `<p style="${STILE_P}margin:12px 0 0;font-size:12px;color:#8a8577;">Inviata da ${scappa(r.daParteDi.nome)} con Velia, l'assistente dell'agenzia.</p>` +
    `</div></div>`;

  const testo =
    `${r.daParteDi.agenzia}\n${oggetto}\n\n` +
    testoSemplice(r.testo, r.fonti) +
    `\n${[r.identita.firma, r.identita.recapiti].filter((x) => x.trim()).join('\n')}\n` +
    `\nInviata da ${r.daParteDi.nome} con Velia, l'assistente dell'agenzia.\n`;

  return { oggetto, testo, html };
}
