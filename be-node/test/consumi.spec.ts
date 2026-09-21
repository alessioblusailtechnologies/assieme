import { describe, expect, it } from 'vitest';

import { costoATariffa, tariffaPerModello } from '../src/contratto/modelli.js';
import { contando, ContatoreConsumi, registraConsumi, segnaUso } from '../src/worker/consumi.js';

/**
 * I consumi dell'ingestion (RF-F-03): fino al 19/09/2026 la parte più cara
 * della piattaforma non scriveva una riga in `velia.consumi`. Qui si prova
 * che i token si sommano per modello, che il prezzo è quello del listino di
 * chi lo serve, e che nessuno di questi conti può far fallire un'ingestion.
 */

const uso = (input: number, output: number, cacheLettura = 0, cacheScrittura = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheLettura,
  cache_creation_input_tokens: cacheScrittura,
});

/** Un finto pool: registra le query invece di eseguirle. */
function dbFinto(rompi = false) {
  const query: Array<{ sql: string; valori: unknown[] }> = [];
  return {
    query,
    pool: {
      query: (sql: string, valori: unknown[]) => {
        if (rompi) return Promise.reject(new Error('database irraggiungibile'));
        query.push({ sql, valori });
        return Promise.resolve({ rows: [] });
      },
    } as never,
  };
}

describe('il contatore di un job', () => {
  it('somma per modello e prezza al listino di chi lo serve', () => {
    const contatore = new ContatoreConsumi();
    contatore.aggiungi('deepseek-flash', { input: 1000, output: 2000, cacheLettura: 0, cacheScrittura: 0 });
    contatore.aggiungi('deepseek-flash', { input: 500, output: 0, cacheLettura: 0, cacheScrittura: 0 });
    contatore.aggiungi('claude-opus-5', { input: 1000, output: 1000, cacheLettura: 0, cacheScrittura: 0 });

    const voci = contatore.voci();
    expect(voci).toHaveLength(2);
    const deepseek = voci.find((v) => v.modello === 'deepseek-flash')!;
    expect(deepseek.uso).toEqual({ input: 1500, output: 2000, cacheLettura: 0, cacheScrittura: 0 });
    // 1.500 × 0,30 + 2.000 × 1,20 per milione
    expect(deepseek.costoUsd).toBeCloseTo(0.002850, 6);
    // 1.000 × 5 + 1.000 × 25 per milione
    expect(voci.find((v) => v.modello === 'claude-opus-5')!.costoUsd).toBeCloseTo(0.03, 6);
  });

  it('un modello senza listino vale zero ma resta scritto col suo nome', () => {
    const contatore = new ContatoreConsumi();
    contatore.aggiungi('un-modello-sperimentale', { input: 9999, output: 9999, cacheLettura: 0, cacheScrittura: 0 });
    expect(contatore.voci()).toEqual([
      {
        modello: 'un-modello-sperimentale',
        uso: { input: 9999, output: 9999, cacheLettura: 0, cacheScrittura: 0 },
        costoUsd: 0,
      },
    ]);
  });
});

describe('il listino', () => {
  it('su Anthropic la scrittura in cache costa più della lettura', () => {
    const tariffa = tariffaPerModello('claude-opus-5')!;
    const lettura = costoATariffa({ input: 0, output: 0, cacheLettura: 1_000_000, cacheScrittura: 0 }, tariffa);
    const scrittura = costoATariffa({ input: 0, output: 0, cacheLettura: 0, cacheScrittura: 1_000_000 }, tariffa);
    expect(lettura).toBeCloseTo(0.5, 6);
    expect(scrittura).toBeCloseTo(6.25, 6);
  });

  it('su un gateway che non la distingue, scrivere vale come leggere (come prima)', () => {
    const tariffa = tariffaPerModello('mistral-large-2512')!;
    expect(costoATariffa({ input: 0, output: 0, cacheLettura: 1_000_000, cacheScrittura: 0 }, tariffa)).toBeCloseTo(
      costoATariffa({ input: 0, output: 0, cacheLettura: 0, cacheScrittura: 1_000_000 }, tariffa),
      6,
    );
  });
});

describe('segnaUso', () => {
  it('fuori da un job non fa niente: un convertitore chiamato da solo non scrive consumi', () => {
    expect(() => segnaUso('claude-opus-5', uso(10, 10))).not.toThrow();
  });

  it('dentro un job scrive sul contatore di quel job', async () => {
    const contatore = new ContatoreConsumi();
    await contando(contatore, async () => {
      segnaUso('deepseek-flash', uso(100, 200));
      /* Anche da un ramo annidato e asincrono: è tutto lo stesso job. */
      await Promise.all([
        Promise.resolve().then(() => segnaUso('deepseek-flash', uso(1, 2))),
        Promise.resolve().then(() => segnaUso('claude-opus-5', uso(3, 4))),
      ]);
    });
    expect(contatore.voci().find((v) => v.modello === 'deepseek-flash')!.uso).toMatchObject({
      input: 101,
      output: 202,
    });
    expect(contatore.voci()).toHaveLength(2);
  });

  it('due job in parallelo non si mescolano i conti', async () => {
    const primo = new ContatoreConsumi();
    const secondo = new ContatoreConsumi();
    await Promise.all([
      contando(primo, () => Promise.resolve(segnaUso('claude-opus-5', uso(10, 0)))),
      contando(secondo, () => Promise.resolve(segnaUso('claude-opus-5', uso(70, 0)))),
    ]);
    expect(primo.voci()[0]!.uso.input).toBe(10);
    expect(secondo.voci()[0]!.uso.input).toBe(70);
  });

  it('dove input_tokens comprende già la cache (AKI.IO) non la conta due volte', async () => {
    const contatore = new ContatoreConsumi();
    await contando(contatore, () =>
      Promise.resolve(segnaUso('deepseek-v4-flash-0731-284b', uso(1000, 0, 800, 0))),
    );
    expect(contatore.voci()[0]!.uso).toMatchObject({ input: 200, cacheLettura: 800 });
  });

  it('su DeepSeek diretta, che la tiene a parte come Anthropic, l’input resta quello', async () => {
    const contatore = new ContatoreConsumi();
    await contando(contatore, () => Promise.resolve(segnaUso('deepseek-flash', uso(1000, 0, 800, 0))));
    expect(contatore.voci()[0]!.uso).toMatchObject({ input: 1000, cacheLettura: 800 });
  });
});

describe('la scrittura delle righe', () => {
  it('una riga per modello, origine ingestion', async () => {
    const { pool, query } = dbFinto();
    const contatore = new ContatoreConsumi();
    contatore.aggiungi('deepseek-flash', { input: 10, output: 20, cacheLettura: 1, cacheScrittura: 2 });
    contatore.aggiungi('claude-opus-5', { input: 30, output: 40, cacheLettura: 0, cacheScrittura: 0 });

    await registraConsumi(pool, 'tenant-1', 'job-1', contatore);

    expect(query).toHaveLength(2);
    expect(query[0]!.sql).toContain('insert into velia.consumi');
    expect(query[0]!.valori.slice(0, 8)).toEqual(['tenant-1', 'job-1', 'ingestion', 'deepseek-flash', 10, 20, 1, 2]);
  });

  it('senza tenant o senza consumi non scrive niente', async () => {
    const { pool, query } = dbFinto();
    const pieno = new ContatoreConsumi();
    pieno.aggiungi('claude-opus-5', { input: 1, output: 1, cacheLettura: 0, cacheScrittura: 0 });
    await registraConsumi(pool, null, 'job-1', pieno);
    await registraConsumi(pool, 'tenant-1', 'job-1', new ContatoreConsumi());
    expect(query).toHaveLength(0);
  });

  it('se i conti non si scrivono, il documento resta pronto lo stesso', async () => {
    const { pool } = dbFinto(true);
    const contatore = new ContatoreConsumi();
    contatore.aggiungi('claude-opus-5', { input: 1, output: 1, cacheLettura: 0, cacheScrittura: 0 });
    await expect(registraConsumi(pool, 'tenant-1', 'job-1', contatore)).resolves.toBeUndefined();
  });
});
