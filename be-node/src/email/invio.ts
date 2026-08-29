import { ErroreApi } from '../contratto/errori.js';

/**
 * L'invio di un'email dall'applicazione («Invia email» sotto una risposta,
 * 29/08/2026). Resend via HTTP, senza dipendenze: un provider transazionale
 * europeo-compatibile con un solo endpoint, che basta per il volume di
 * un'agenzia. Senza chiave, fuori produzione l'email si scrive nel log e
 * l'invio si dichiara simulato (il flusso si prova lo stesso); in produzione
 * si risponde 503, chiaro e senza fingere.
 */

export interface EmailDaInviare {
  a: string;
  oggetto: string;
  testo: string;
  html: string;
  /** A chi arriva una risposta: l'utente che ha inviato, non la casella di piattaforma. */
  rispondiA?: string | undefined;
}

export interface OpzioniInvio {
  apiKey?: string | undefined;
  /** «Nome <indirizzo>», il mittente verificato sul provider. */
  mittente: string;
  produzione: boolean;
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void };
}

export interface EsitoInvio {
  simulata: boolean;
}

const ENDPOINT_RESEND = 'https://api.resend.com/emails';

export async function inviaEmail(email: EmailDaInviare, opzioni: OpzioniInvio): Promise<EsitoInvio> {
  if (!opzioni.apiKey) {
    if (opzioni.produzione) {
      throw new ErroreApi(503, 'EMAIL_NON_CONFIGURATA', "L'invio email non è configurato su questo ambiente.");
    }
    opzioni.log.info({ a: email.a, oggetto: email.oggetto, testo: email.testo }, 'email simulata: RESEND_API_KEY assente');
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
