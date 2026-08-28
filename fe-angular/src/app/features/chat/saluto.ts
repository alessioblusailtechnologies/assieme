import { FasciaSaluto, LottoSaluti } from '@core/models';

/**
 * Il saluto della schermata iniziale: contestuale e un po' personale, come
 * l'ingresso di un collega — non una formula fissa.
 *
 * Le frasi arrivano con la sessione: un lotto generato dal modello per
 * fascia oraria, con il segnaposto `{nome}`, rinnovato ogni giorno dal
 * server (vedi `be-node/src/api/sessione/saluti.ts`). Qui restano le frasi
 * fisse come rete di sicurezza: lotto assente (prima generazione, chiave
 * mancante) o fascia vuota (il filtro ha scartato tutto), si usano quelle.
 *
 * La scelta della variante è stabile per ora: cambia al cambio d'ora, non a
 * ogni refresh, così la pagina non «balbetta». L'ora è quella del browser.
 */

interface Fascia {
  id: FasciaSaluto;
  /** Ora di inizio inclusa, di fine esclusa. */
  da: number;
  a: number;
  fisse: string[];
}

const FASCE: Fascia[] = [
  {
    // Notte fonda: chi è qui a quest'ora se lo merita, un sorriso.
    id: 'notte',
    da: 0,
    a: 5,
    fisse: ['Ancora in piedi, {nome}?', 'Notte fonda, {nome}. Ci pensiamo noi.', 'Ciao {nome}, di cosa hai bisogno?'],
  },
  {
    id: 'alba',
    da: 5,
    a: 9,
    fisse: [
      'Buongiorno {nome}, primi in agenzia.',
      'Il caffè, i documenti, e via: buongiorno {nome}.',
      'Buongiorno {nome}, si comincia presto oggi.',
    ],
  },
  {
    id: 'mattina',
    da: 9,
    a: 13,
    fisse: [
      'Buongiorno {nome}, di cosa hai bisogno?',
      'Ciao {nome}, su cosa lavoriamo?',
      'Buongiorno {nome}. Polizze, preventivi, confronti: dimmi tu.',
    ],
  },
  {
    id: 'pranzo',
    da: 13,
    a: 15,
    fisse: [
      'Pausa pranzo operosa, {nome}?',
      'Ciao {nome}, riprendiamo da dove eravamo?',
      'Buon pomeriggio {nome}, di cosa hai bisogno?',
    ],
  },
  {
    id: 'pomeriggio',
    da: 15,
    a: 19,
    fisse: [
      'Buon pomeriggio {nome}, su cosa lavoriamo?',
      'Ciao {nome}, di cosa hai bisogno?',
      'Il pomeriggio è per i confronti, {nome}: dimmi tu.',
    ],
  },
  {
    id: 'sera',
    da: 19,
    a: 24,
    fisse: [
      'Buonasera {nome}, chiudiamo bene la giornata?',
      'Ancora al lavoro, {nome}? Facciamo in fretta.',
      'Buonasera {nome}, di cosa hai bisogno?',
    ],
  },
];

/** Senza nome (sessione non ancora idratata) le frasi reggono lo stesso. */
const SENZA_NOME = 'Di cosa hai bisogno?';

/** La fascia di un'ora del giorno. */
export function fasciaPer(ora: number): FasciaSaluto {
  return (FASCE.find((f) => ora >= f.da && ora < f.a) ?? FASCE[2]).id;
}

export function salutoPer(momento: Date, nome?: string, lotto?: LottoSaluti): string {
  if (!nome) return SENZA_NOME;
  const ora = momento.getHours();
  const fascia = FASCE.find((f) => ora >= f.da && ora < f.a) ?? FASCE[2];
  const generate = lotto?.frasi[fascia.id] ?? [];
  const varianti = generate.length ? generate : fascia.fisse;
  const inizioAnno = new Date(momento.getFullYear(), 0, 1);
  const giornoDellAnno = Math.floor((+momento - +inizioAnno) / 86_400_000);
  const variante = varianti[(giornoDellAnno * 24 + ora) % varianti.length];
  return variante.replace('{nome}', nome);
}
