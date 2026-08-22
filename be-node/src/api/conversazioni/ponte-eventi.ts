import type pg from 'pg';

import { ascoltaEventi, type PuntatoreEvento } from '../../worker/eventi.js';

/**
 * Il lato API del ponte SSE (piano §3.1): UNA connessione in LISTEN per
 * processo, e lo smistamento per job a chi ha uno stream aperto. Il NOTIFY
 * porta solo il puntatore; i dati dell'evento si rileggono da `eventi_job`
 * — che è anche il replay: chi si iscrive a job già partito riceve prima
 * il pregresso, poi il vivo, senza doppioni grazie all'id crescente.
 */

export interface EventoJob {
  id: number;
  tipo: string;
  dati: Record<string, unknown>;
}

type Consegna = (evento: EventoJob) => void;

export class PonteEventi {
  private iscritti = new Map<string, Set<Consegna>>();
  private chiusura: (() => Promise<void>) | undefined;
  private avvio: Promise<void> | undefined;

  constructor(
    private readonly db: pg.Pool,
    private readonly creaClient: () => pg.Client,
  ) {}

  /** Apre il LISTEN alla prima iscrizione (pigro: l'API senza chat non lo paga). */
  private assicuraAscolto(): Promise<void> {
    this.avvio ??= ascoltaEventi(this.creaClient, (p) => void this.consegna(p)).then((chiudi) => {
      this.chiusura = chiudi;
    });
    return this.avvio;
  }

  private async consegna(p: PuntatoreEvento): Promise<void> {
    const destinatari = this.iscritti.get(p.jobId);
    if (!destinatari?.size) return;
    const riga = await this.db.query<{ id: string; tipo: string; dati: Record<string, unknown> }>(
      `select id, tipo, dati from velia.eventi_job where id = $1`,
      [p.eventoId],
    );
    const r = riga.rows[0];
    if (!r) return;
    const evento: EventoJob = { id: Number(r.id), tipo: r.tipo, dati: r.dati };
    for (const d of destinatari) d(evento);
  }

  /**
   * Si iscrive agli eventi di un job: prima il pregresso (dall'id dato in
   * poi), poi il vivo. Restituisce la disiscrizione. Gli eventi arrivano in
   * ordine di id e mai due volte.
   */
  async iscriviti(jobId: string, consegna: Consegna, dopoId = 0): Promise<() => void> {
    await this.assicuraAscolto();
    let ultimo = dopoId;
    const filtrata: Consegna = (e) => {
      if (e.id <= ultimo) return;
      ultimo = e.id;
      consegna(e);
    };
    let insieme = this.iscritti.get(jobId);
    if (!insieme) {
      insieme = new Set();
      this.iscritti.set(jobId, insieme);
    }
    insieme.add(filtrata);

    const pregresso = await this.db.query<{ id: string; tipo: string; dati: Record<string, unknown> }>(
      `select id, tipo, dati from velia.eventi_job where job_id = $1 and id > $2 order by id`,
      [jobId, dopoId],
    );
    for (const r of pregresso.rows) filtrata({ id: Number(r.id), tipo: r.tipo, dati: r.dati });

    const destinatari = insieme;
    return () => {
      destinatari.delete(filtrata);
      if (!destinatari.size) this.iscritti.delete(jobId);
    };
  }

  async chiudi(): Promise<void> {
    await this.chiusura?.();
    this.chiusura = undefined;
    this.avvio = undefined;
    this.iscritti.clear();
  }
}
