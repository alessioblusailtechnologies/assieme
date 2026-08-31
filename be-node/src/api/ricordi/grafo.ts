import type { Citazione } from '../../contratto/conversazioni.js';
import type {
  GrafoMemoria,
  LegameGrafoMemoria,
  NodoGrafoMemoria,
  Ricordo,
} from '../../contratto/memoria.js';

/**
 * Il costruttore del globo: da righe già lette (e già filtrate dalla RLS)
 * alla forma del contratto. Puro apposta — la rotta legge, questo assembla,
 * il test unitario lo prova senza database.
 *
 * Le regole di composizione:
 *
 *  · un ricordo è sempre un nodo; il legame verso la conversazione d'origine
 *    esiste solo se quella conversazione è visibile (mai chiavi appese);
 *  · una conversazione entra solo se ha citazioni o ha originato ricordi —
 *    le chiacchiere senza fonti non ingombrano il globo;
 *  · il punto è la coppia documento+pagina: la stessa unità delle ancore
 *    `[pag. N]` dei Markdown d'archivio. Citazioni diverse sulla stessa
 *    pagina si accumulano nel peso, e resta la prima con l'articolo;
 *  · il documento nasce dalla citazione stessa (titolo e archivio ci sono
 *    già): se poi la riga d'archivio è visibile porta anche la compagnia.
 */

export interface ConversazionePerGrafo {
  id: string;
  titolo: string;
}

export interface CitazioniDiConversazione {
  conversazioneId: string;
  citazioni: Citazione[];
}

/** Una riga d'archivio citata ma fuori dal catalogo corrente (storica, privata). */
export interface DocumentoPerGrafo {
  id: string;
  titolo: string;
  compagniaId?: string;
  compagniaNome?: string;
}

/** Una riga del catalogo pubblico corrente: la trama del globo. */
export interface DocumentoCatalogo {
  id: string;
  titolo: string;
  prodotto: string;
  compagniaId: string;
  compagniaNome: string;
  ramoId: string;
  ramoNome: string;
}

const LUNGHEZZA_ETICHETTA = 64;

/** Un testo lungo si accorcia a parola intera: è un'etichetta, non una scheda. */
export function accorcia(testo: string, massimo = LUNGHEZZA_ETICHETTA): string {
  const pulito = testo.trim().replace(/\s+/g, ' ');
  if (pulito.length <= massimo) return pulito;
  const taglio = pulito.slice(0, massimo);
  const spazio = taglio.lastIndexOf(' ');
  return `${taglio.slice(0, spazio > massimo / 2 ? spazio : massimo)}…`;
}

/** L'etichetta del punto: come cita l'utente — l'articolo, poi la sezione, poi la pagina. */
function etichettaPunto(c: Citazione): string {
  const articolo = c.posizione.articolo?.trim();
  if (articolo) {
    /* I set reali portano spesso «Articolo 4 — …» già nel campo: il
       prefisso si aggiunge solo quando manca, mai «art. Articolo 4». */
    return /^art/i.test(articolo) ? accorcia(articolo, 36) : `art. ${accorcia(articolo, 30)}`;
  }
  if (c.posizione.sezione) return accorcia(c.posizione.sezione, 32);
  return `pag. ${c.posizione.pagina}`;
}

export function costruisciGrafoMemoria(
  ricordi: Ricordo[],
  conversazioni: ConversazionePerGrafo[],
  citazioniPerConversazione: CitazioniDiConversazione[],
  documenti: DocumentoPerGrafo[],
  catalogo: DocumentoCatalogo[] = [],
): GrafoMemoria {
  const nodi = new Map<string, NodoGrafoMemoria>();
  const legami = new Map<string, LegameGrafoMemoria>();

  const conversazioniPerId = new Map(conversazioni.map((c) => [c.id, c]));
  const documentiPerId = new Map(documenti.map((d) => [d.id, d]));
  const catalogoPerId = new Map(catalogo.map((d) => [d.id, d]));

  const nodo = (n: NodoGrafoMemoria): NodoGrafoMemoria => {
    const esistente = nodi.get(n.chiave);
    if (esistente) return esistente;
    nodi.set(n.chiave, n);
    return n;
  };

  const lega = (da: string, a: string): void => {
    const chiave = `${da}|${a}`;
    const esistente = legami.get(chiave);
    if (esistente) esistente.peso += 1;
    else legami.set(chiave, { da, a, peso: 1 });
  };

  /** Legame strutturale: esiste una volta sola, non accumula peso. */
  const legaStruttura = (da: string, a: string): boolean => {
    const chiave = `${da}|${a}`;
    if (legami.has(chiave)) return false;
    legami.set(chiave, { da, a, peso: 1 });
    return true;
  };

  // --- L'archivio: rami → compagnie → prodotti → documenti ----------------
  for (const riga of catalogo) {
    const ramo = nodo({
      chiave: `ramo:${riga.ramoId}`,
      tipo: 'ramo',
      etichetta: riga.ramoNome,
      peso: 0,
      id: riga.ramoId,
    });
    const compagnia = nodo({
      chiave: `compagnia:${riga.compagniaId}`,
      tipo: 'compagnia',
      etichetta: riga.compagniaNome,
      peso: 0,
      id: riga.compagniaId,
    });
    const chiaveProdotto = `prodotto:${riga.compagniaId}:${riga.prodotto}`;
    const prodotto = nodo({
      chiave: chiaveProdotto,
      tipo: 'prodotto',
      etichetta: accorcia(riga.prodotto, 40),
      peso: 0,
    });
    nodo({
      chiave: `documento:${riga.id}`,
      tipo: 'documento',
      etichetta: accorcia(riga.titolo, 56),
      peso: 1,
      id: riga.id,
      archivio: 'pubblico',
    });

    legaStruttura(`documento:${riga.id}`, chiaveProdotto);
    prodotto.peso += 1;
    if (legaStruttura(chiaveProdotto, compagnia.chiave)) compagnia.peso += 1;
    if (legaStruttura(chiaveProdotto, ramo.chiave)) ramo.peso += 1;
  }

  const nodoConversazione = (id: string): NodoGrafoMemoria | undefined => {
    const conversazione = conversazioniPerId.get(id);
    if (!conversazione) return undefined;
    return nodo({
      chiave: `conversazione:${id}`,
      tipo: 'conversazione',
      etichetta: accorcia(conversazione.titolo, 48),
      peso: 0,
      id,
    });
  };

  // --- Ricordi, e il ponte verso la conversazione d'origine ---------------
  for (const r of ricordi) {
    nodo({
      chiave: `ricordo:${r.id}`,
      tipo: 'ricordo',
      etichetta: accorcia(r.testo),
      peso: 1,
      id: r.id,
      categoria: r.categoria,
      ambito: r.ambito,
      attivo: r.attivo,
      testo: r.testo,
    });
    if (!r.origineConversazioneId) continue;
    const conversazione = nodoConversazione(r.origineConversazioneId);
    if (!conversazione) continue;
    conversazione.peso += 1;
    lega(`ricordo:${r.id}`, conversazione.chiave);
  }

  // --- Citazioni: conversazione → punto → documento -----------------------
  for (const { conversazioneId, citazioni } of citazioniPerConversazione) {
    const conversazione = nodoConversazione(conversazioneId);
    if (!conversazione) continue;

    for (const citazione of citazioni) {
      conversazione.peso += 1;

      const chiavePunto = `punto:${citazione.documentoId}@${citazione.posizione.pagina}`;
      const punto = nodo({
        chiave: chiavePunto,
        tipo: 'punto',
        etichetta: etichettaPunto(citazione),
        peso: 0,
        citazione,
      });
      punto.peso += 1;
      // La citazione con l'articolo vince su quella con la sola pagina.
      if (!punto.citazione?.posizione.articolo && citazione.posizione.articolo) {
        punto.citazione = citazione;
        punto.etichetta = etichettaPunto(citazione);
      }

      const rigaArchivio = documentiPerId.get(citazione.documentoId);
      const documento = nodo({
        chiave: `documento:${citazione.documentoId}`,
        tipo: 'documento',
        etichetta: accorcia(rigaArchivio?.titolo ?? citazione.documentoTitolo, 56),
        peso: 0,
        id: citazione.documentoId,
        archivio: citazione.archivio,
      });
      documento.peso += 1;

      lega(conversazione.chiave, chiavePunto);
      lega(chiavePunto, documento.chiave);

      /* Il documento del catalogo è già agganciato al suo prodotto; quello
         fuori catalogo (storico, privato) si appende alla compagnia se la
         riga d'archivio la conosce. */
      if (
        !catalogoPerId.has(citazione.documentoId) &&
        rigaArchivio?.compagniaId &&
        rigaArchivio.compagniaNome
      ) {
        const compagnia = nodo({
          chiave: `compagnia:${rigaArchivio.compagniaId}`,
          tipo: 'compagnia',
          etichetta: rigaArchivio.compagniaNome,
          peso: 0,
          id: rigaArchivio.compagniaId,
        });
        if (legaStruttura(documento.chiave, compagnia.chiave)) compagnia.peso += 1;
      }
    }
  }

  /* I nodi grossi prima: chi disegna mette gli hub sotto e i dettagli sopra,
     e un ordine stabile rende il globo identico a ogni apertura. */
  const ordinati = [...nodi.values()].sort(
    (a, b) => b.peso - a.peso || a.chiave.localeCompare(b.chiave),
  );

  return { nodi: ordinati, legami: [...legami.values()] };
}
