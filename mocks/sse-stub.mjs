/**
 * Stub SSE per lo streaming della chat.
 *
 * Perché esiste: **Mockoon non supporta i Server-Sent Events.** La richiesta
 * è aperta sul repository del progetto (issue #990) ed è classificata come
 * miglioria a bassa priorità. Mockoon supporta i WebSocket da v9, ma se il
 * backend userà SSE — lo standard di fatto per lo streaming dei modelli
 * linguistici — costruire la chat su WebSocket significherebbe riscrivere
 * poi la parte più delicata dell'applicazione.
 *
 * Quaranta righe di Node risolvono il problema mantenendo il trasporto
 * identico a quello di produzione: il codice del front-end che consuma
 * questo stream è già quello definitivo.
 *
 * ⚠️ Decisione ancora aperta col backend: se lo streaming sarà su WebSocket
 * anziché SSE, questo file si butta e si usa Mockoon. Vale la pena
 * chiarirlo prima di costruire la Fase 3.
 *
 * Avvio: `npm run mock:sse` (o `npm run dev`, che avvia tutto).
 */

import { createServer } from 'node:http';

const PORTA = 3001;

/** Ritmo di emissione: abbastanza lento da vedere il testo comparire. */
const MS_PER_BLOCCO = 45;

/*
 * Risposta di esempio sul caso pilota indicato nell'analisi dei requisiti
 * (§5.3): confronto ramo auto fra il set informativo Generali e il
 * preventivo UnipolSai sullo stesso veicolo.
 *
 * Il testo è verosimile ma inventato. Diventerà fedele quando arriveranno i
 * PDF reali del cliente pilota — ed è il motivo per cui quella richiesta sta
 * in cima all'elenco delle cose che servono dal committente.
 */
const RISPOSTA = `Ho confrontato le due proposte sulle voci che incidono di più sul premio e sulla tutela dell'assicurato.

**Massimale RC** — Le due proposte si equivalgono: 6.450.000 € per sinistro su entrambe, di cui 1.300.000 € per danni a cose. È il massimale minimo di legge, quindi nessuna delle due offre un vantaggio su questa voce.

**Franchigia furto e incendio** — Qui la differenza è netta. La proposta Generali applica una franchigia fissa di 250 €, quella UnipolSai uno scoperto del 10% con un minimo di 500 €. Su un sinistro da 8.000 € significa 250 € contro 800 €.

**Garanzia infortuni del conducente** — Presente nella proposta Generali con massimale di 100.000 €, assente in quella UnipolSai.

**Assistenza stradale** — Entrambe la prevedono, ma la proposta UnipolSai include il traino illimitato mentre quella Generali lo limita a 50 km dal luogo del fermo.

In sintesi: la proposta Generali tutela meglio sui danni al veicolo e sulla persona del conducente; quella UnipolSai è più conveniente sull'assistenza. La scelta dipende dall'uso prevalente del veicolo.`;

const CITAZIONI = [
  {
    id: 'cit-001',
    documentoId: 'doc-pub-002',
    documentoTitolo: 'DIP Aggiuntivo — Active Veicoli AUTOPIÙ con Telematica',
    archivio: 'pubblico',
    posizione: { pagina: 8, articolo: '12', sezione: 'Responsabilità civile' },
    estratto:
      'Il massimale per sinistro è pari a euro 6.450.000, di cui euro 1.300.000 per danni a cose.',
  },
  {
    id: 'cit-002',
    documentoId: 'doc-pub-003',
    documentoTitolo: 'Condizioni di Assicurazione — Active Veicoli AUTOPIÙ con Telematica',
    archivio: 'pubblico',
    posizione: { pagina: 41, articolo: '27', sezione: 'Furto e incendio' },
    estratto:
      'La garanzia è prestata con applicazione di una franchigia fissa di euro 250 per ciascun sinistro.',
  },
  {
    id: 'cit-003',
    documentoId: 'doc-priv-014',
    documentoTitolo: 'Preventivo UnipolSai — Fiat 500X targa GK492ZR',
    archivio: 'privato',
    posizione: { pagina: 3, sezione: 'Garanzie accessorie' },
    estratto:
      'Furto e Incendio: scoperto 10% con il minimo di euro 500 per ciascun sinistro.',
  },
];

/*
 * RF-D-05: quando una risposta è influenzata da un'istruzione personalizzata
 * del tenant, il sistema deve renderlo esplicito. Lo stub lo emette perché
 * l'interfaccia della Fase 3 dovrà saperlo mostrare fin dal primo giorno,
 * non aggiungerlo dopo.
 */
const PROVENIENZE = [
  {
    tipo: 'istruzione',
    origineId: 'ist-003',
    etichetta: 'valutato secondo la regola "Infortuni del conducente"',
  },
];

/** Spezza il testo in blocchi di parole: simula il ritmo di un modello. */
function blocchi(testo) {
  return testo.match(/\S+\s*/g) ?? [];
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORTA}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    });
    res.end();
    return;
  }

  if (!url.pathname.startsWith('/api/stream')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ codice: 'NON_TROVATO', messaggio: 'Rotta non gestita dallo stub.' }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    /* Senza questo, un eventuale reverse proxy bufferizza e lo streaming
       arriva tutto insieme: il difetto più insidioso da diagnosticare. */
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });

  /** Un evento del contratto `EventoStream` (core/models/conversazione.ts). */
  const invia = (evento) => res.write(`data: ${JSON.stringify(evento)}\n\n`);
  const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

  let interrotto = false;
  req.on('close', () => {
    interrotto = true;
  });

  const messaggioId = `msg-${Date.now()}`;
  invia({ tipo: 'inizio', messaggioId });

  /* Pausa iniziale: il modello vero ci mette un attimo prima del primo
     token, e l'interfaccia deve mostrare qualcosa in quel vuoto. */
  await attendi(700);

  for (const blocco of blocchi(RISPOSTA)) {
    if (interrotto) return;
    invia({ tipo: 'testo', delta: blocco });
    await attendi(MS_PER_BLOCCO);
  }

  /* Citazioni e provenienze arrivano in coda, come farebbe un backend che
     le consolida a risposta completa. Se il backend vero le emetterà via via,
     l'interfaccia deve reggere entrambi i casi: è il motivo per cui sono
     eventi separati e non campi di un unico oggetto finale. */
  for (const citazione of CITAZIONI) {
    if (interrotto) return;
    invia({ tipo: 'citazione', citazione });
    await attendi(120);
  }

  for (const provenienza of PROVENIENZE) {
    if (interrotto) return;
    invia({ tipo: 'provenienza', provenienza });
    await attendi(120);
  }

  invia({ tipo: 'fine' });
  res.end();
});

server.listen(PORTA, () => {
  console.log(`[sse-stub] streaming chat su http://localhost:${PORTA}/api/stream`);
  console.log('[sse-stub] Mockoon non supporta SSE: questo stub copre il solo endpoint di stream.');
});
