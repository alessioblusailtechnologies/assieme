import { ErroreApi } from '../contratto/errori.js';

/**
 * L'invio di un'email dall'applicazione («Invia email» sotto una risposta,
 * 29/08/2026). Resend via HTTP, senza dipendenze: un provider transazionale
 * europeo-compatibile con un solo endpoint, che basta per il volume di
 * un'agenzia. Senza chiave, fuori produzione l'email si scrive nel log e
 * l'invio si dichiara simulato (il flusso si prova lo stesso); in produzione
 * si risponde 503, chiaro e senza fingere.
 *
 * Dal 14/09/2026 porta anche allegati: i documenti generati in chat, dentro
 * l'email che l'assistente ha preparato e l'utente ha deciso di inviare.
 */

export interface AllegatoEmail {
  /** Il nome con cui arriva, estensione compresa. */
  nome: string;
  contenuto: Buffer;
}

export interface EmailDaInviare {
  a: string;
  oggetto: string;
  testo: string;
  html: string;
  /** A chi arriva una risposta: l'utente che ha inviato, non la casella di piattaforma. */
  rispondiA?: string | undefined;
  allegati?: AllegatoEmail[] | undefined;
}

export interface OpzioniInvio {
  apiKey?: string | undefined;
  /** «Nome <indirizzo>», il mittente verificato sul provider. */
  mittente: string;
  produzione: boolean;
  /**
   * Simula anche con la chiave (`EMAIL_INVIO=simulato`): nei test il `.env`
   * locale la chiave ce l'ha, e una suite non deve spedire posta vera. In
   * produzione non vale.
   */
  simula?: boolean | undefined;
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
}

export interface EsitoInvio {
  simulata: boolean;
}

const ENDPOINT_RESEND = 'https://api.resend.com/emails';

/**
 * Il nome con cui un documento generato arriva nella casella di chi lo
 * riceve: il suo titolo, leggibile e con gli accenti, senza i caratteri che
 * un sistema operativo rifiuta in un nome di file.
 */
export function nomeAllegato(nome: string, formato: string): string {
  const pulito = nome
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
  return `${pulito || 'documento'}.${formato}`;
}

/**
 * Resend accetta fino a 40 MB per email **dopo** la codifica base64, che
 * gonfia di un terzo: 25 MB di file lasciano margine al corpo.
 */
export const LIMITE_ALLEGATI_BYTE = 25 * 1024 * 1024;

export async function inviaEmail(email: EmailDaInviare, opzioni: OpzioniInvio): Promise<EsitoInvio> {
  const allegati = email.allegati ?? [];
  if (allegati.reduce((somma, a) => somma + a.contenuto.length, 0) > LIMITE_ALLEGATI_BYTE) {
    throw new ErroreApi(
      413,
      'ALLEGATI_TROPPO_GRANDI',
      "Gli allegati superano i 25 MB e l'email non può partire così: togline qualcuno, o manda il link del documento.",
    );
  }
  if (!opzioni.apiKey && opzioni.produzione) {
    throw new ErroreApi(503, 'EMAIL_NON_CONFIGURATA', "L'invio email non è configurato su questo ambiente.");
  }
  if (!opzioni.produzione && (!opzioni.apiKey || opzioni.simula)) {
    opzioni.log.info(
      { a: email.a, oggetto: email.oggetto, testo: email.testo, allegati: allegati.map((a) => a.nome) },
      opzioni.apiKey ? 'email simulata: EMAIL_INVIO=simulato' : 'email simulata: RESEND_API_KEY assente',
    );
    return { simulata: true };
  }

  const risposta = await fetch(ENDPOINT_RESEND, {
    method: 'POST',
    headers: { authorization: `Bearer ${opzioni.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: opzioni.mittente,
      to: [email.a],
      subject: email.oggetto,
      text: email.testo,
      html: email.html,
      ...(email.rispondiA && { reply_to: email.rispondiA }),
      ...(allegati.length && {
        attachments: allegati.map((a) => ({ filename: a.nome, content: a.contenuto.toString('base64') })),
      }),
    }),
  });
  if (!risposta.ok) {
    const dettaglio = await risposta.text().catch(() => '');
    opzioni.log.warn({ stato: risposta.status, dettaglio: dettaglio.slice(0, 500) }, 'invio email non riuscito');
    throw new ErroreApi(502, 'EMAIL_NON_INVIATA', motivoLeggibile(dettaglio));
  }
  return { simulata: false };
}

/**
 * I due rifiuti che si incontrano davvero, detti in italiano: il dominio del
 * mittente non ancora verificato, e il periodo di prova di Resend in cui si
 * spedisce solo al proprio indirizzo. Il resto resta generico: il dettaglio
 * è nel log.
 */
function motivoLeggibile(dettaglio: string): string {
  const messaggio = ((): string => {
    try {
      const corpo: unknown = JSON.parse(dettaglio);
      return typeof corpo === 'object' && corpo !== null && 'message' in corpo && typeof corpo.message === 'string'
        ? corpo.message
        : dettaglio;
    } catch {
      return dettaglio;
    }
  })();
  if (/not verified/i.test(messaggio)) {
    return "L'email non è partita: il dominio del mittente non è ancora verificato sul servizio di posta.";
  }
  if (/only send testing emails|your own email/i.test(messaggio)) {
    return "L'email non è partita: finché il dominio non è verificato si può spedire solo all'indirizzo del titolare dell'account di posta.";
  }
  return "L'email non è partita: riprova fra poco.";
}
