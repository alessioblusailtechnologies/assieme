/**
 * Il saluto della schermata iniziale: contestuale e un po' personale, come
 * l'ingresso di un collega — non una formula fissa. Niente modello di
 * linguaggio qui: una riga di testo non vale una chiamata, e il saluto deve
 * esserci al primo dipinto della pagina.
 *
 * La scelta è stabile per giornata (cambia domani, non a ogni refresh):
 * l'indice nasce dal giorno dell'anno, così la pagina non «balbetta».
 */

interface FasciaSaluto {
  /** Ora di inizio inclusa, di fine esclusa; a cavallo di mezzanotte si spezza in due. */
  da: number;
  a: number;
  varianti: ((nome: string) => string)[];
}

const FASCE: FasciaSaluto[] = [
  {
    // Notte fonda: chi è qui a quest'ora se lo merita, un sorriso.
    da: 0,
    a: 5,
    varianti: [
      (n) => `Ancora in piedi, ${n}?`,
      (n) => `Benvenuta o benvenuto, nottambulo ${n}.`,
      (n) => `Notte fonda, ${n}. Ci pensiamo noi.`,
    ],
  },
  {
    da: 5,
    a: 9,
    varianti: [
      (n) => `Buongiorno ${n}, primi in agenzia.`,
      (n) => `Il caffè, i documenti, e via: buongiorno ${n}.`,
      (n) => `Buongiorno ${n}, si comincia presto oggi.`,
    ],
  },
  {
    da: 9,
    a: 13,
    varianti: [
      (n) => `Buongiorno ${n}, di cosa hai bisogno?`,
      (n) => `Ciao ${n}, su cosa lavoriamo?`,
      (n) => `Buongiorno ${n}. Polizze, preventivi, confronti: dimmi tu.`,
    ],
  },
  {
    da: 13,
    a: 15,
    varianti: [
      (n) => `Pausa pranzo operosa, ${n}?`,
      (n) => `Ciao ${n}, riprendiamo da dove eravamo?`,
      (n) => `Buon pomeriggio ${n}, di cosa hai bisogno?`,
    ],
  },
  {
    da: 15,
    a: 19,
    varianti: [
      (n) => `Buon pomeriggio ${n}, su cosa lavoriamo?`,
      (n) => `Ciao ${n}, di cosa hai bisogno?`,
      (n) => `Il pomeriggio è per i confronti, ${n}: dimmi tu.`,
    ],
  },
  {
    da: 19,
    a: 24,
    varianti: [
      (n) => `Buonasera ${n}, chiudiamo bene la giornata?`,
      (n) => `Ancora al lavoro, ${n}? Facciamo in fretta.`,
      (n) => `Buonasera ${n}, di cosa hai bisogno?`,
    ],
  },
];

/** Senza nome (sessione non ancora idratata) le frasi reggono lo stesso. */
const SENZA_NOME = 'Di cosa hai bisogno?';

export function salutoPer(momento: Date, nome?: string): string {
  if (!nome) return SENZA_NOME;
  const ora = momento.getHours();
  const fascia = FASCE.find((f) => ora >= f.da && ora < f.a) ?? FASCE[2]!;
  const inizioAnno = new Date(momento.getFullYear(), 0, 1);
  const giornoDellAnno = Math.floor((+momento - +inizioAnno) / 86_400_000);
  const variante = fascia.varianti[giornoDellAnno % fascia.varianti.length]!;
  return variante(nome);
}
