import { TipologiaDocumento } from '@core/models';

/**
 * Come si chiamano le cose nell'interfaccia.
 *
 * I codici del contratto (`dip-aggiuntivo`) non si mostrano mai all'utente:
 * un intermediario legge "DIP Aggiuntivo", con le maiuscole giuste, perché è
 * il nome che quel documento ha sul tavolo e nel Regolamento IVASS 41/2018.
 *
 * Sta in `shared/` e non in una funzionalità perché le stesse etichette
 * servono all'archivio privato, alla chat e alle tabelle di analisi: una
 * tipologia che si chiama in due modi diversi in due schermate è un difetto
 * che nessuno segnala e tutti notano.
 */
const TIPOLOGIE: Record<TipologiaDocumento, string> = {
  dip: 'DIP',
  'dip-aggiuntivo': 'DIP Aggiuntivo',
  'condizioni-assicurazione': 'Condizioni di Assicurazione',
  glossario: 'Glossario',
  preventivo: 'Preventivo',
  polizza: 'Polizza',
  appendice: 'Appendice',
  convenzione: 'Convenzione',
  'nota-tecnica': 'Nota tecnica',
  altro: 'Altro',
};

export function etichettaTipologia(t: TipologiaDocumento): string {
  return TIPOLOGIE[t];
}

/** Le tipologie selezionabili nei filtri dell'Archivio Pubblico. */
export const TIPOLOGIE_PUBBLICHE: { valore: TipologiaDocumento; etichetta: string }[] = (
  ['dip', 'dip-aggiuntivo', 'condizioni-assicurazione', 'glossario'] as const
).map((valore) => ({ valore, etichetta: TIPOLOGIE[valore] }));

/**
 * Forma breve per gli spazi stretti (celle di tabella, chip di citazione).
 * "Condizioni di Assicurazione" per esteso manderebbe a capo ogni riga.
 */
const ABBREVIAZIONI: Partial<Record<TipologiaDocumento, string>> = {
  'dip-aggiuntivo': 'DIP Agg.',
  'condizioni-assicurazione': 'CdA',
};

export function etichettaTipologiaBreve(t: TipologiaDocumento): string {
  return ABBREVIAZIONI[t] ?? TIPOLOGIE[t];
}

/**
 * Ritocchi di sola resa ai nomi delle compagnie: l'archivio conserva i nomi
 * con cui i documenti sono stati emessi (le edizioni storiche SONO
 * UnipolSai), ma l'interfaccia parla al presente — e oggi la compagnia si
 * chiama Unipol. Solo etichetta: id e dati non cambiano mai.
 */
const NOMI_COMPAGNIA: Record<string, string> = {
  'cmp-unipolsai': 'Unipol',
};

export function nomeCompagnia(id: string | undefined, nome: string): string {
  return (id && NOMI_COMPAGNIA[id]) || nome;
}
