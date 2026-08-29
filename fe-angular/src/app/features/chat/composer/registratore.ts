/**
 * Il microfono del composer: una registrazione per volta, dal clic che la
 * apre al clic che la chiude, e in mezzo niente. `MediaRecorder` sceglie il
 * contenitore che il browser sa scrivere (WebM/Opus in Chrome, Edge e
 * Firefox; MP4 in Safari); il server accetta entrambi.
 *
 * Il flusso del microfono si chiude sempre a fine registrazione: la spia
 * «in uso» del browser si spegne, e non si tiene aperto niente in ascolto.
 */

const CONTENITORI = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];

export class ErroreMicrofono extends Error {
  constructor(
    readonly motivo: 'non-supportato' | 'negato' | 'assente' | 'occupato',
    messaggio: string,
  ) {
    super(messaggio);
    this.name = 'ErroreMicrofono';
  }
}

export class Registratore {
  private registratore?: MediaRecorder;
  private flusso?: MediaStream;
  private pezzi: Blob[] = [];

  static supportato(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  get attivo(): boolean {
    return this.registratore?.state === 'recording';
  }

  async avvia(): Promise<void> {
    if (!Registratore.supportato()) {
      throw new ErroreMicrofono('non-supportato', 'Questo browser non sa registrare dal microfono.');
    }
    if (this.attivo) return;
    let flusso: MediaStream;
    try {
      flusso = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (errore) {
      const nome = (errore as { name?: string }).name ?? '';
      if (nome === 'NotAllowedError' || nome === 'SecurityError') {
        throw new ErroreMicrofono('negato', 'Il browser non ha il permesso di usare il microfono: concedilo dalla barra degli indirizzi.');
      }
      if (nome === 'NotFoundError' || nome === 'OverconstrainedError') {
        throw new ErroreMicrofono(
          'assente',
          'Nessun microfono trovato. In Desktop remoto va abilitata la registrazione audio nel client (Risorse locali › Audio remoto › Registra da questo computer).',
        );
      }
      throw new ErroreMicrofono('occupato', 'Il microfono non è disponibile: forse lo sta usando un altro programma.');
    }
    const tipo = CONTENITORI.find((c) => MediaRecorder.isTypeSupported(c));
    this.flusso = flusso;
    this.pezzi = [];
    this.registratore = new MediaRecorder(flusso, tipo ? { mimeType: tipo } : undefined);
    this.registratore.ondataavailable = (e) => {
      if (e.data.size) this.pezzi.push(e.data);
    };
    this.registratore.start();
  }

  /** Chiude la registrazione e il microfono; l'audio raccolto, o vuoto se non c'era niente. */
  ferma(): Promise<Blob> {
    const registratore = this.registratore;
    if (!registratore || registratore.state === 'inactive') {
      this.chiudiFlusso();
      return Promise.resolve(new Blob([], { type: 'audio/webm' }));
    }
    return new Promise((risolvi) => {
      registratore.onstop = () => {
        const tipo = registratore.mimeType || 'audio/webm';
        const audio = new Blob(this.pezzi, { type: tipo });
        this.pezzi = [];
        this.registratore = undefined;
        this.chiudiFlusso();
        risolvi(audio);
      };
      registratore.stop();
    });
  }

  private chiudiFlusso(): void {
    for (const traccia of this.flusso?.getTracks() ?? []) traccia.stop();
    this.flusso = undefined;
  }
}
