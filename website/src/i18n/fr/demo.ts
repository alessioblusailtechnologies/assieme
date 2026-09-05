import type { Destinazione } from '~/i18n/rotte';
import type { MetaPagina, Riga, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Demander une démo',
  description:
    'Trente minutes, un de vos cahiers des charges, aucun engagement : regardez Velia travailler sur les documents de votre cabinet.',
};

const testata: Testata = {
  eyebrow: 'Démo',
  title: 'Apportez un cahier des charges, on vous montre la comparaison',
  lead: 'Les démos génériques ne convainquent personne. Nous préférons travailler sur un document réel : en une demi-heure, vous voyez si Velia vous fait gagner du temps ou non.',
};

const briciola = 'Demander une démo';

const comeFunziona: { title: string; passi: Riga[]; contatto: string } = {
  title: 'Comment cela se passe',
  passi: [
    {
      term: '30 minutes',
      detail:
        'Une visioconférence où vous nous racontez comment vous travaillez aujourd’hui, et où nous vous montrons la plateforme sur un cas proche du vôtre.',
    },
    {
      term: 'Un de vos documents',
      detail:
        'Si vous le souhaitez, nous prenons un de vos cahiers des charges, même anonymisé, et nous le comparons en direct. C’est le moyen le plus rapide de savoir si cela sert.',
    },
    {
      term: 'Aucun engagement',
      detail:
        'Aucune installation, aucun contrat à signer pour essayer. Si cela ne vous convient pas, c’est nous qui vous le dirons.',
    },
  ],
  contatto: 'Vous préférez écrire ?',
};

/**
 * `oggetto` e `mittente` finiscono nella mail che arriva in casella:
 * tradotti, dicono da quale versione del sito è partita la richiesta ancora
 * prima di aprirla. Il campo nascosto `lingua` lo dice in modo esplicito.
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
  oggetto: 'Demande de démo depuis le site',
  mittente: 'Site Velia (FR)',
  avvisoTitolo: 'Note pour qui publie le site.',
  avviso:
    'n’est pas définie : le formulaire n’envoie nulle part. À configurer avant la mise en ligne.',
  obbligatorio: 'obligatoire',
  nome: 'Nom et prénom',
  ruolo: 'Fonction',
  organizzazione: 'Cabinet ou société',
  tipo: 'Type d’activité',
  tipoVuoto: 'Sélectionnez…',
  tipoVoci: [
    'Cabinet de courtage',
    'Agence générale',
    'Mandataire',
    'Compagnie',
    'Autre',
  ],
  email: 'E-mail professionnel',
  telefono: 'Téléphone',
  messaggio: 'Quel problème aimeriez-vous résoudre ?',
  messaggioEsempio:
    'Ex. nous comparons des cahiers des charges en RC Professionnelle et cela nous prend une demi-journée par dossier.',
  consensoPrima: 'J’ai lu la ',
  consensoLink: 'politique de confidentialité',
  consensoDopo:
    ' et j’accepte le traitement de mes données pour être recontacté.',
  linkPrivacy: { rotta: 'privacy' },
  trappola: 'Ne cochez pas cette case',
  invia: 'Demander une démo',
  nota: 'Nous répondons sous un jour ouvré. Vos données servent uniquement à vous recontacter et ne sont cédées à personne.',
};

/**
 * Le stringhe della validazione lato client. In `campiDaCorreggere` il
 * segnaposto `{n}` è il numero dei campi; in `nonConfigurato` e
 * `invioFallito`, `{email}` è l'indirizzo di contatto.
 */
const validazione: {
  unCampo: string;
  campiDaCorreggere: string;
  nonConfigurato: string;
  invioFallito: string;
  invioInCorso: string;
} = {
  unCampo: 'Il manque un champ obligatoire, ou le format n’est pas valide.',
  campiDaCorreggere: 'Il y a {n} champs à corriger.',
  nonConfigurato:
    'Envoi non configuré sur cet environnement. Écrivez à {email} et nous vous répondons tout de suite.',
  invioFallito:
    'Nous n’avons pas réussi à envoyer votre demande. Réessayez dans un instant, ou écrivez à {email}.',
  invioInCorso: 'Envoi en cours…',
};

const schemaNome = 'Demander une démo de Velia';

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
