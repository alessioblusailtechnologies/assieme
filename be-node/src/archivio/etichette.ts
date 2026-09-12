/**
 * Le etichette che l'ingestion propone da sé (`PIANO-CLIENTI.md`, Fase 3).
 *
 * Senza l'albero, le etichette sono ciò che tiene navigabile un archivio
 * piatto: sono l'unico asse trasversale rimasto, e un archivio in cui le
 * mette solo chi si ricorda di metterle non ne ha nessuno.
 *
 * Sono **derivate da fatti**, non chieste a un modello, e la ragione è
 * pratica prima che economica: una faccetta serve se il vocabolario è
 * piccolo e prevedibile. Un modello che inventa etichette libere produce
 * «RC Auto», «Rc auto», «Responsabilità civile auto» e «Auto» sullo stesso
 * ramo, e a quel punto filtrare non serve più a niente. Compagnia, ramo e
 * annualità invece si scrivono sempre uguali, perché vengono dalla
 * tassonomia e dalle date.
 *
 * Non si tolgono mai: si aggiungono a quelle che ci sono. Toglierne una
 * scritta a mano vorrebbe dire che il sistema sa meglio dell'utente come si
 * chiama il suo lavoro.
 */

export interface FattiEtichette {
  /** Il nome della compagnia riconosciuta dalla tassonomia, non quello detto dal modello. */
  compagnia?: string | null;
  ramo?: string | null;
  /** La decorrenza in ISO: in agenzia «2026» è l'annualità, non l'anno di caricamento. */
  decorrenza?: string | null;
  /**
   * Il percorso con cui il file è arrivato (`Clienti/Rossi Mario/Auto/polizza.pdf`).
   *
   * È l'unica cosa che si sa di come l'agenzia teneva organizzato il proprio
   * materiale, e buttarla sarebbe buttare l'unico lavoro di classificazione
   * già fatto da un umano. Diventa etichette, non cartelle.
   */
  percorsoOrigine?: string | null;
  /** Il cliente risolto: il suo nome nel percorso non diventa un'etichetta. */
  clienteNome?: string | null;
}

/** Quante etichette al massimo nascono da sole: oltre, è rumore. */
const MASSIME = 6;
const LUNGHEZZA_MAX = 60;

/**
 * I segmenti di percorso che non dicono niente di questo documento perché
 * valgono per tutti: sono contenitori, non classificazioni.
 */
const CONTENITORI = new Set([
  'clienti',
  'cliente',
  'documenti',
  'documento',
  'archivio',
  'archivi',
  'pratiche',
  'pratica',
  'polizze',
  'polizza',
  'preventivi',
  'preventivo',
  'appendici',
  'appendice',
  'varie',
  'altro',
  'altri',
  'generale',
  'generali',
  'scansioni',
  'scansione',
  'pdf',
  'file',
  'backup',
  'temp',
  'tmp',
  'nuova cartella',
  'desktop',
  'download',
  'downloads',
]);

export function etichetteProposte(fatti: FattiEtichette): string[] {
  const proposte: string[] = [];
  const aggiungi = (valore: string | null | undefined): void => {
    const pulito = (valore ?? '').trim().replace(/\s+/g, ' ');
    if (!pulito || pulito.length > LUNGHEZZA_MAX) return;
    if (proposte.some((p) => confronta(p) === confronta(pulito))) return;
    proposte.push(pulito);
  };

  aggiungi(fatti.compagnia);
  aggiungi(fatti.ramo);

  /* L'anno della **decorrenza**: in agenzia «2026» è l'annualità, e quello
     del caricamento non è un fatto sul documento ma su di noi. */
  const anno = (fatti.decorrenza ?? '').slice(0, 4);
  if (/^\d{4}$/.test(anno)) aggiungi(anno);

  for (const segmento of segmentiUtili(fatti)) aggiungi(segmento);

  return proposte.slice(0, MASSIME);
}

/**
 * I pezzi del percorso di origine che valgono come etichetta: né il nome
 * del file, né i contenitori, né il cliente (che è già un'entità sua, e
 * ripeterlo come etichetta sarebbe la stessa informazione due volte).
 */
function segmentiUtili(fatti: FattiEtichette): string[] {
  const percorso = (fatti.percorsoOrigine ?? '').trim();
  if (!percorso) return [];
  const cliente = confronta(fatti.clienteNome ?? '');
  return percorso
    .split('/')
    .slice(0, -1)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !CONTENITORI.has(confronta(s)))
    .filter((s) => !(cliente && confronta(s) === cliente))
    /* Un segmento tutto numeri che non sia un anno («001», «2») è una
       numerazione di cartelle, non una classificazione. */
    .filter((s) => !/^\d+$/.test(s) || /^(19|20)\d{2}$/.test(s));
}

/** Confronto fra etichette come le scriverebbe un umano: accenti e maiuscole non distinguono. */
function confronta(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Le etichette nuove da aggiungere a quelle che il documento ha già.
 *
 * Torna solo ciò che manca davvero: così il chiamante sa se vale la pena
 * scrivere, e l'evento del job dice qualcosa invece di ripetere ogni volta
 * le stesse quattro parole.
 */
export function etichetteDaAggiungere(esistenti: string[], proposte: string[]): string[] {
  const gia = new Set(esistenti.map(confronta));
  return proposte.filter((p) => !gia.has(confronta(p)));
}
