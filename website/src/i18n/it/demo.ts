import type { Destinazione } from '~/i18n/rotte';
import type { MetaPagina, Riga, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Richiedi una demo',
  description:
    'Trenta minuti, un tuo capitolato e nessun impegno: prenota una demo di Velia e guarda la piattaforma lavorare sui documenti della tua agenzia.',
};

const testata: Testata = {
  eyebrow: 'Demo',
  title: 'Portaci un capitolato, ti mostriamo il confronto',
  lead: "Le demo generiche non convincono nessuno. Preferiamo lavorare su un documento vero: in mezz'ora capisci se Velia ti fa risparmiare tempo oppure no.",
};

const briciola = 'Richiedi una demo';

const comeFunziona: { title: string; passi: Riga[]; contatto: string } = {
  title: 'Come funziona',
  passi: [
    {
      term: '30 minuti',
      detail:
        'Una videochiamata in cui ci racconti come lavori oggi e ti mostriamo la piattaforma su un caso simile al tuo.',
    },
    {
      term: 'Un tuo documento',
      detail:
        'Se vuoi, portiamo un tuo capitolato, anche anonimizzato, e lo confrontiamo dal vivo. È il modo più rapido per capire se serve.',
    },
    {
      term: 'Nessun impegno',
      detail:
        'Nessuna installazione, nessun contratto da firmare per provare. Se non fa al caso tuo te lo diciamo noi.',
    },
  ],
  contatto: 'Preferisci scrivere?',
};

/**
 * Il modulo. `oggetto` e `mittente` finiscono nella mail che arriva in
 * casella: tradotti, dicono da quale versione del sito è partita la
 * richiesta ancora prima di aprirla.
 */
const modulo: {
  oggetto: string;
  mittente: string;
  avvisoTitolo: string;
  avviso: string;
  obbligatorio: string;
  nome: string;
  ruolo: string;
  organizzazione: string;
  tipo: string;
  tipoVuoto: string;
  tipoVoci: string[];
  email: string;
  telefono: string;
  messaggio: string;
  messaggioEsempio: string;
  consensoPrima: string;
  consensoLink: string;
  consensoDopo: string;
  linkPrivacy: Destinazione;
  trappola: string;
  invia: string;
  nota: string;
} = {
  oggetto: 'Richiesta demo dal sito',
  mittente: 'Sito Velia',
  avvisoTitolo: 'Nota per chi pubblica il sito.',
  avviso:
    "non è impostata: il modulo non invia da nessuna parte. Configurala prima della messa online.",
  obbligatorio: 'obbligatorio',
  nome: 'Nome e cognome',
  ruolo: 'Ruolo',
  organizzazione: 'Organizzazione',
  tipo: 'Tipo di attività',
  tipoVuoto: 'Seleziona…',
  tipoVoci: ['Agenzia', 'Broker', 'Intermediario', 'Compagnia', 'Altro'],
  email: 'E-mail di lavoro',
  telefono: 'Telefono',
  messaggio: 'Che problema vorresti risolvere?',
  messaggioEsempio:
    'Es. confrontiamo capitolati RC Professionale e ci vuole mezza giornata a posizione.',
  consensoPrima: "Ho letto l'",
  consensoLink: 'informativa privacy',
  consensoDopo:
    ' e acconsento al trattamento dei miei dati per essere ricontattato.',
  linkPrivacy: { rotta: 'privacy' },
  trappola: 'Non spuntare questa casella',
  invia: 'Richiedi una demo',
  nota: 'Ti rispondiamo entro il giorno lavorativo successivo. I tuoi dati servono solo per ricontattarti e non vengono ceduti a terzi.',
};

/**
 * Le stringhe della validazione lato client. Passano al browser come
 * attributi `data-*` sul modulo: lo script è uno solo per tutte le lingue.
 * In `campiDaCorreggere` il segnaposto `{n}` è il numero dei campi.
 */
const validazione: {
  unCampo: string;
  campiDaCorreggere: string;
  nonConfigurato: string;
  invioFallito: string;
  invioInCorso: string;
} = {
  unCampo: 'Manca un campo obbligatorio, o il formato non è valido.',
  campiDaCorreggere: 'Ci sono {n} campi da correggere.',
  nonConfigurato:
    'Invio non configurato su questo ambiente. Scrivi a {email} e ti rispondiamo subito.',
  invioFallito:
    'Non siamo riusciti a inviare la richiesta. Riprova fra qualche istante, oppure scrivi a {email}.',
  invioInCorso: 'Invio in corso…',
};

const schemaNome = 'Richiedi una demo di Velia';

const demo = {
  meta,
  testata,
  briciola,
  comeFunziona,
  modulo,
  validazione,
  schemaNome,
};

export default demo;
