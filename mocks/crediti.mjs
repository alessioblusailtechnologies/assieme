/**
 * Crediti: la parte del mock che tiene i conti (pricing).
 *
 * Il canone include un lotto al mese, i pacchetti comprati non scadono, ogni
 * operazione AI addebita il peso della classe di modello. Qui i numeri sono
 * fissi: servono a mostrare la pagina, non a fare i conti veri.
 */

const PESI = { opus: 10, sonnet: 5, haiku: 3, open: 2, conversione: 1, perUsd: 25 };

const MOVIMENTI = [
  { id: 'crd-010', tipo: 'addebito', crediti: -10, operazione: 'risposta', modello: 'claude-opus-5', descrizione: 'Risposta in chat: Confronta il set informativo AUTOPIÙ con il preventivo…', istante: '2026-08-24T16:12:00+02:00' },
  { id: 'crd-009', tipo: 'addebito', crediti: -30, operazione: 'tabella', modello: 'claude-opus-5', descrizione: 'Tabella di analisi, 3 righe', istante: '2026-08-24T11:40:00+02:00' },
  { id: 'crd-008', tipo: 'addebito', crediti: -1, operazione: 'risposta', modello: 'zai-org/GLM-5.2', descrizione: 'Risposta in chat: Che franchigia prevede la garanzia cristalli?', istante: '2026-08-23T17:05:00+02:00' },
  { id: 'crd-011', tipo: 'addebito', crediti: -1, operazione: 'risposta', modello: 'claude-opus-5', descrizione: 'Risposta in chat: Ciao, chi sei?', istante: '2026-08-24T09:02:00+02:00' },
  { id: 'crd-007', tipo: 'addebito', crediti: -1, operazione: 'conversione', descrizione: 'Conversione di «Preventivo Rossi»', istante: '2026-08-23T16:58:00+02:00' },
  { id: 'crd-006', tipo: 'addebito', crediti: -10, operazione: 'agente', modello: 'claude-opus-5', descrizione: 'Agente «Monitoraggio nuove edizioni dei preferiti»', istante: '2026-08-23T08:00:00+02:00' },
  { id: 'crd-005', tipo: 'pacchetto', crediti: 1000, descrizione: 'Pacchetto da 1.000 crediti', istante: '2026-08-20T10:30:00+02:00' },
];

const RIEPILOGO = {
  saldo: { inclusi: 600, inclusiUsati: 53, acquistati: 1000, acquistatiUsati: 0, disponibili: 1547 },
  pesi: PESI,
  meseCorrente: { risposta: 12, tabella: 30, agente: 10, conversione: 1 },
  movimenti: MOVIMENTI,
};

/**
 * Gestisce le rotte dei crediti.
 * Restituisce `true` se ha risposto, `false` se la rotta non è sua.
 */
export async function gestisci(req, res, url, deps) {
  const { inviaJson } = deps;
  if (url.pathname !== '/api/crediti') return false;
  if (req.method === 'GET') {
    inviaJson(res, 200, RIEPILOGO);
    return true;
  }
  return false;
}
