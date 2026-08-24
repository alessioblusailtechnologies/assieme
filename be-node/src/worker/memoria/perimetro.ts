import { CATEGORIE_RICORDO, type AmbitoRicordo, type CategoriaRicordo } from '../../contratto/memoria.js';

/**
 * Il perimetro della memoria (RF-G-05): ciò che NON si impara, applicato
 * dal validatore e non solo dal prompt — doppia applicazione, come per le
 * citazioni. Un candidato che sfiora una categoria particolare (art. 9
 * GDPR) o porta dati eccedenti (identificativi, contatti, coordinate
 * bancarie) si scarta con un motivo leggibile; il motivo finisce negli
 * eventi del job, mai nel ricordo.
 *
 * Le liste sono volutamente prudenti: un ricordo perso costa poco, un dato
 * di salute in memoria costa una violazione.
 */

export interface CandidatoRicordo {
  testo: string;
  categoria: CategoriaRicordo;
  ambito: AmbitoRicordo;
}

export type EsitoPerimetro = { esito: 'ok' } | { esito: 'scartato'; motivo: string };

const LUNGHEZZA_MIN = 20;
const LUNGHEZZA_MAX = 400;

/** Art. 9: salute, vita sessuale, convinzioni, appartenenze, origine, biometria. */
const ART_9: Array<[RegExp, string]> = [
  /* «Salute», «malattia», «invalidità», «infortuni» sono anche rami e
     garanzie: qui contano i termini che descrivono una persona. */
  [/\b(malat[oa]\b|patolog|diagnos|terapi|disabil|handicap|ricoverat|tumor|oncolog|depress|psichiatr|psicolog|gravidanz|incint|infortun[io]\s+(subit|avut|pregress)|hiv\b|sieroposit|cartella clinica|cardiopat|diabet|epilessi|celiac|tossicodipend|alcolis)/i, 'dati relativi alla salute'],
  [/\b(orientamento sessuale|omosessual|eterosessual|bisessual|transessual|transgender|vita sessuale|gay\b|lesbic)/i, 'vita o orientamento sessuale'],
  [/\b(religio|cattolic|musulman|islamic|ebre[oi]|ebraic|evangelic|protestant|ateo|ate[ai]\b|buddist|induist|testimon[ei] di geova|confession[ei] religios)/i, 'convinzioni religiose'],
  [/\b(sindacat|iscritt[oa] alla cgil|cisl\b|uil\b|partito|vota (per|il|la)|elettor|politic[ao]\s+(di|del|della)|militant|di sinistra|di destra|comunist|fascist|leghist)/i, 'opinioni politiche o appartenenza sindacale'],
  [/\b(etni|razz[ai]|origine razziale|colore della pelle|rom\b|sinti|extracomunitari|immigrat[oa]\s+(clandestin|irregolar))/i, 'origine razziale o etnica'],
  [/\b(genetic|biometric|impront[ae] digital|dna\b|riconoscimento facciale)/i, 'dati genetici o biometrici'],
  [/\b(condann|precedenti penali|casellario|fedina|process[oa]to|imputat|reato|arrest|carcer|detenut)/i, 'condanne penali e reati (art. 10)'],
];

/** Dati eccedenti: identificativi diretti e contatti di persone. */
const ECCEDENTI: Array<[RegExp, string]> = [
  [/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/, 'codice fiscale'],
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/, 'IBAN'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/, 'indirizzo email'],
  [/(?:\+39\s?)?(?:\d[\s.-]?){9,11}\d/, 'numero di telefono'],
  [/\b(nat[oa]\s+(il|a|nel)\b|data di nascita|anni di età)/i, 'data di nascita o età'],
  [/\b(via|viale|piazza|corso|largo|vicolo)\s+[A-Za-zÀ-ú'.\s]+\s\d{1,4}\b/i, 'indirizzo di residenza'],
  [/\b(password|pin\b|credenzial|numero (di )?carta|carta di credito)/i, 'credenziali o dati di pagamento'],
  [/\b(targa\s+[A-Z]{2}\s?\d{3}\s?[A-Z]{2}|\b[A-Z]{2}\d{3}[A-Z]{2}\b)/, 'targa del veicolo'],
];

export function valutaPerimetro(candidato: CandidatoRicordo): EsitoPerimetro {
  const testo = candidato.testo.trim();
  if (testo.length < LUNGHEZZA_MIN) return { esito: 'scartato', motivo: 'troppo breve per essere un ricordo' };
  if (testo.length > LUNGHEZZA_MAX) return { esito: 'scartato', motivo: `oltre i ${LUNGHEZZA_MAX} caratteri` };
  if (!(CATEGORIE_RICORDO as readonly string[]).includes(candidato.categoria)) {
    return { esito: 'scartato', motivo: `categoria sconosciuta «${candidato.categoria}»` };
  }
  for (const [regex, motivo] of ART_9) {
    if (regex.test(testo)) return { esito: 'scartato', motivo: `categoria particolare (art. 9 GDPR): ${motivo}` };
  }
  for (const [regex, motivo] of ECCEDENTI) {
    if (regex.test(testo)) return { esito: 'scartato', motivo: `dato eccedente: ${motivo}` };
  }
  return { esito: 'ok' };
}

/**
 * L'ambito lo decide il server, non il modello: una preferenza è di chi
 * l'ha espressa (personale); prassi, clienti e decisioni sono dell'agenzia
 * a meno che il modello non le abbia sentite come personali.
 */
export function ambitoEffettivo(candidato: CandidatoRicordo): AmbitoRicordo {
  if (candidato.categoria === 'preferenza') return 'personale';
  return candidato.ambito === 'personale' ? 'personale' : 'tenant';
}
