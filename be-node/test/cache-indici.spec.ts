import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArchivioFile } from '../src/worker/ingestion/archivio-file.js';
import { Cache } from '../src/worker/motore/workspace.js';

/** Lo Storage in memoria: conta i download, e sbaglia quando glielo si dice. */
function archivioFinto(file: Record<string, string>) {
  const conta = { scaricati: 0 };
  let guasto = false;
  const archivio: ArchivioFile = {
    scarica: async (percorso) => {
      conta.scaricati++;
      await new Promise((r) => setTimeout(r, 5));
      if (guasto || !(percorso in file)) throw new Error(`scaricamento fallito (${percorso})`);
      return Buffer.from(file[percorso]!);
    },
    carica: async () => {},
    elimina: async () => {},
  };
  return { archivio, conta, guasta: (s: boolean) => (guasto = s) };
}

const INDICE = 'unipolsai/auto/INDICE.md';

describe('Cache degli INDICE.md', () => {
  let radice: string;
  beforeEach(async () => {
    radice = await mkdtemp(join(tmpdir(), 'velia-cache-'));
  });
  afterEach(async () => {
    await rm(radice, { recursive: true, force: true, maxRetries: 5 });
  });

  it('scaduto, si serve subito quello che c’è e si riscarica dietro', async () => {
    const storage: Record<string, string> = { [INDICE]: 'vecchio' };
    const { archivio, conta } = archivioFinto(storage);
    const cache = new Cache(radice, archivio);

    await cache.fileConTtl(INDICE, 60_000);
    storage[INDICE] = 'nuovo';

    /* TTL a zero: tutto è scaduto. La risposta non aspetta lo Storage. */
    const servito = await cache.fileConTtl(INDICE, 0);
    expect(await readFile(servito!, 'utf8')).toBe('vecchio');

    await vi.waitFor(async () => expect(await readFile(servito!, 'utf8')).toBe('nuovo'));
    expect(conta.scaricati).toBe(2);
  });

  it('con più domande insieme lo stesso indice si scarica una volta', async () => {
    const { archivio, conta } = archivioFinto({ [INDICE]: 'x' });
    const cache = new Cache(radice, archivio);

    await Promise.all([1, 2, 3, 4].map(() => cache.fileConTtl(INDICE, 60_000)));
    expect(conta.scaricati).toBe(1);
  });

  it('i download hanno un tetto, anche con duecento indici insieme', async () => {
    const percorsi = Array.from({ length: 200 }, (_, i) => `compagnia/ramo-${i}/INDICE.md`);
    let inCorso = 0;
    let massimo = 0;
    const archivio: ArchivioFile = {
      scarica: async (percorso) => {
        massimo = Math.max(massimo, ++inCorso);
        await new Promise((r) => setTimeout(r, 2));
        inCorso--;
        return Buffer.from(percorso);
      },
      carica: async () => {},
      elimina: async () => {},
    };
    const cache = new Cache(radice, archivio);

    const file = await Promise.all(percorsi.map((p) => cache.fileConTtl(p, 60_000)));
    expect(file.every(Boolean)).toBe(true);
    expect(massimo).toBeGreaterThan(1);
    expect(massimo).toBeLessThanOrEqual(16);
  });

  it('un rinfresco fallito tiene la copia che c’era', async () => {
    const f = archivioFinto({ [INDICE]: 'buono' });
    const cache = new Cache(radice, f.archivio);
    await cache.fileConTtl(INDICE, 60_000);

    const meta = join(radice, `${createHash('sha1').update(INDICE).digest('hex')}.json`);
    const leggiMeta = async () => JSON.parse(await readFile(meta, 'utf8')) as { scaricatoIl: number; mancante?: boolean };
    const prima = (await leggiMeta()).scaricatoIl;

    f.guasta(true);
    await cache.fileConTtl(INDICE, 0);
    await vi.waitFor(async () => expect((await leggiMeta()).scaricatoIl).toBeGreaterThan(prima));

    expect((await leggiMeta()).mancante).toBeUndefined();
    const dopo = await cache.fileConTtl(INDICE, 60_000);
    expect(await readFile(dopo!, 'utf8')).toBe('buono');
  });

  it('l’assenza si ricorda, e scaduta non fa aspettare', async () => {
    const storage: Record<string, string> = {};
    const { archivio, conta } = archivioFinto(storage);
    const cache = new Cache(radice, archivio);

    expect(await cache.fileConTtl(INDICE, 60_000)).toBeUndefined();
    expect(await cache.fileConTtl(INDICE, 60_000)).toBeUndefined();
    expect(conta.scaricati).toBe(1);

    /* Nel frattempo l'indice è arrivato: lo trova il messaggio dopo. */
    storage[INDICE] = 'arrivato';
    expect(await cache.fileConTtl(INDICE, 0)).toBeUndefined();
    await vi.waitFor(async () => {
      const ora = await cache.fileConTtl(INDICE, 60_000);
      expect(ora && (await readFile(ora, 'utf8'))).toBe('arrivato');
    });
  });
});
