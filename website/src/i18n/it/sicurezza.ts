/**
 * ⚠️ Nessuna certificazione dichiarata: il documento di analisi non ne
 * stabilisce alcuna. SOC 2, ISO 27001/27701/42001 e la conformità IVASS
 * erano segnaposto del design.
 *
 * La pagina è volutamente corta. Chi valuta vuole sei risposte secche; chi
 * deve compilare un questionario di sicurezza ci scrive.
 */

import type { Chiusura, MetaPagina, Testata } from '~/i18n/tipi';

const meta: MetaPagina = {
  title: 'Sicurezza',
  description:
    'Ogni risposta citata, mai una risposta inventata, documenti riservati alla tua agenzia e memoria che controlli tu: gli impegni di Velia.',
};

const testata: Testata = {
  eyebrow: 'Sicurezza',
  title: 'Un dato sbagliato è peggio di un dato mancante',
  lead: "Di quello che consigli rispondi tu. Per questo l'accuratezza in Velia non è una funzione fra le altre: è il vincolo attorno a cui è costruito il resto.",
};

const briciola = 'Sicurezza';

const impegni: {
  title: string;
  voci: { id: string; mark: string; name: string; body: string }[];
} = {
  title: 'Sei impegni, scritti prima del contratto',
  voci: [
    {
      id: 'citazione',
      mark: 'Fonte',
      name: 'Ogni risposta citata',
      body: "Sotto ogni affermazione trovi il documento e il punto esatto, pagina e articolo, da cui viene. Vale in chat, in ogni casella delle tabelle e in quello che producono gli agenti.",
    },
    {
      id: 'non-copertura',
      mark: 'Non so',
      name: 'Mai una risposta inventata',
      body: 'Se nei documenti la risposta non c\'è, Velia lo dice. Nelle tabelle la casella riporta "non presente". Un dato verosimile ma sbagliato su una garanzia è peggio di un dato mancante.',
    },
    {
      id: 'isolamento',
      mark: 'Solo tuoi',
      name: 'Documenti riservati',
      body: "Quello che carichi resta della tua agenzia. Non compare nelle risposte date ad altri clienti, non è raggiungibile da fuori e viaggia cifrato.",
    },
    {
      id: 'gdpr',
      mark: 'GDPR',
      name: 'Trattamento conforme',
      body: "Nei tuoi documenti ci sono dati dei tuoi clienti. Il trattamento segue il Regolamento europeo, i ruoli sono definiti per contratto e la titolarità del dato resta tua.",
    },
    {
      id: 'tracciabilita',
      mark: 'Tracce',
      name: 'Fonti sempre tracciate',
      body: "Di ogni risposta resta traccia dei documenti usati. Serve a te per i controlli interni e a noi per capire perché una risposta è uscita così.",
    },
    {
      id: 'memoria',
      mark: 'Memoria',
      name: 'Che controlli tu',
      body: "Quello che Velia impara lo puoi leggere, correggere e cancellare. I dati sanitari degli assicurati non li registra affatto, e le tue regole vengono sempre prima di quello che ha dedotto.",
    },
  ],
};

const domande: { title: string; voci: { q: string; a: string }[] } = {
  title: 'Domande frequenti',
  voci: [
    {
      q: 'I miei documenti servono ad addestrare i modelli?',
      a: 'No. Restano nella tua agenzia e servono solo a rispondere alle tue domande. I contratti con i fornitori dei modelli escludono l\'uso dei contenuti per l\'addestramento.',
    },
    {
      q: "Un'altra agenzia può vedere i miei documenti?",
      a: 'No, in nessun caso. Ogni agenzia lavora in uno spazio separato: un tuo documento non può comparire nella risposta data a qualcun altro.',
    },
    {
      q: 'Posso fidarmi senza rileggere il documento?',
      a: "La risposta ti dice dove guardare, e dalla citazione apri il punto esatto. Velia accorcia il tempo della verifica, non ti solleva dal farla: la consulenza la firmi tu.",
    },
    {
      q: 'Avete certificazioni di sicurezza?',
      a: "Non ancora, e preferiamo dirlo invece di lasciarlo intendere. Il percorso è avviato. Nel frattempo gli impegni di questa pagina sono contrattuali, e ai questionari di sicurezza rispondiamo per esteso.",
    },
  ],
};

const chiusura: Chiusura = {
  title: 'Serve il questionario di sicurezza compilato?',
  cta: 'Scrivici',
  link: { rotta: 'demo' },
};

const sicurezza = {
  meta,
  testata,
  briciola,
  impegni,
  domande,
  chiusura,
};

export default sicurezza;
