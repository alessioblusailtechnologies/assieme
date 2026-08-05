/**
 * Interpretazione di un flusso Server-Sent Events.
 *
 * Il browser ha `EventSource`, ma solo per GET senza corpo: l'invio di un
 * messaggio è un POST, quindi il flusso arriva dal backend `fetch` di
 * `HttpClient` come testo che cresce, e il framing SSE va interpretato qui.
 *
 * Funzioni pure su indici espliciti, senza stato interno: il testo arriva
 * **cumulativo** (ogni evento di progresso porta tutto il ricevuto, non il
 * solo delta), e il chiamante ricorda fin dove ha già letto. Questo le rende
 * banali da testare — ed è il punto: è la parte della chat che si rompe in
 * silenzio, con un blocco spezzato a metà fra due pacchetti TCP.
 */

/** Esito di una lettura: gli eventi completi trovati e fin dove si è arrivati. */
export interface LetturaSse {
  dati: string[];
  indice: number;
}

/**
 * Estrae dal testo cumulativo i blocchi SSE completi a partire da `da`.
 *
 * Un blocco termina con riga vuota (`\n\n` o `\r\n\r\n`): ciò che segue
 * l'ultimo terminatore è un blocco ancora in viaggio e resta lì, in attesa
 * del prossimo pacchetto. Con `flussoChiuso` anche il residuo viene letto:
 * a stream finito non arriverà nessun altro pacchetto a completarlo.
 */
export function leggiBlocchiSse(testo: string, da: number, flussoChiuso = false): LetturaSse {
  const dati: string[] = [];
  let indice = da;

  for (;;) {
    const fine = testo.indexOf('\n\n', indice);
    if (fine === -1) break;
    const dato = datoDelBlocco(testo.slice(indice, fine));
    if (dato !== undefined) dati.push(dato);
    indice = fine + 2;
  }

  if (flussoChiuso && indice < testo.length) {
    const dato = datoDelBlocco(testo.slice(indice));
    if (dato !== undefined) dati.push(dato);
    indice = testo.length;
  }

  return { dati, indice };
}

/**
 * Il campo `data` di un blocco: più righe `data:` si concatenano con `\n`,
 * come da specifica. Commenti (`:`) e altri campi (`event:`, `id:`) si
 * ignorano; un blocco senza `data` non è un evento.
 */
function datoDelBlocco(blocco: string): string | undefined {
  const righe = blocco.split(/\r?\n/);
  const dati: string[] = [];
  for (const riga of righe) {
    if (riga.startsWith('data:')) {
      dati.push(riga.slice(5).replace(/^ /, ''));
    }
  }
  return dati.length ? dati.join('\n') : undefined;
}
