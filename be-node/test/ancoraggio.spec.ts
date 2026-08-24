import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Citazione } from '../src/contratto/conversazioni.js';
import { ancoraCitazioni, paginaDellEstratto } from '../src/worker/motore/ancoraggio.js';
import type { DocumentoWorkspace } from '../src/worker/motore/workspace.js';

/**
 * L'ancoraggio delle citazioni: la pagina la decide l'ancora sotto cui sta
 * l'estratto, non la dichiarazione del modello.
 */
const MD = `# Condizioni

[pag. 87]
### Sezione 9 - Atti Vandalici
Testo della sezione nove.

[pag. 88]
### Sezione 10 - Garanzia Cristalli
La garanzia opera solo se acquistata e riportata in Polizza.
Centri cristalli convenzionati con Generali Italia — In caso di Sinistro l’Assicurato può rivolgersi a un centro convenzionato.

[pag. 89]
#### Art. 3 - Ci sono limiti di copertura?
La garanzia è prestata con deduzione di una Franchigia fissa indicata in Polizza.
`;

describe('paginaDellEstratto', () => {
  it('trova la pagina dall’ancora che precede l’estratto, tollerando virgolette e spazi', () => {
    expect(paginaDellEstratto(MD, "In caso di Sinistro l'Assicurato può rivolgersi")).toBe(88);
    expect(paginaDellEstratto(MD, 'La garanzia è prestata con  deduzione di una Franchigia fissa')).toBe(89);
    expect(paginaDellEstratto(MD, 'Testo della sezione nove')).toBe(87);
  });

  it('accorcia l’estratto se il modello l’ha allungato; senza riscontro restituisce undefined', () => {
    expect(paginaDellEstratto(MD, 'La garanzia opera solo se acquistata e riportata in Polizza, come dice il contratto')).toBe(88);
    expect(paginaDellEstratto(MD, 'Questa frase non esiste nel documento')).toBeUndefined();
    expect(paginaDellEstratto('nessuna ancora qui', 'nessuna ancora')).toBeUndefined();
  });
});

describe('ancoraCitazioni', () => {
  let dir: string;
  const perPath = new Map<string, DocumentoWorkspace>();

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'velia-ancore-'));
    await writeFile(join(dir, 'condizioni.md'), MD, 'utf8');
    perPath.set('condizioni.md', { id: 'doc-1', titolo: 'Condizioni', archivio: 'pubblico' } as DocumentoWorkspace);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const cit = (pagina: number, estratto: string): Citazione => ({
    id: 'c',
    documentoId: 'doc-1',
    documentoTitolo: 'Condizioni',
    archivio: 'pubblico',
    posizione: { pagina },
    estratto,
  });

  it('corregge la pagina dichiarata con l’ancora reale e lo dice; lascia in pace quelle giuste', async () => {
    const esito = await ancoraCitazioni(dir, [cit(89, 'Centri cristalli convenzionati con Generali Italia'), cit(89, 'Franchigia fissa indicata in Polizza')], perPath);
    expect(esito.citazioni.map((c) => c.posizione.pagina)).toEqual([88, 89]);
    expect(esito.avvisi).toHaveLength(1);
    expect(esito.avvisi[0]).toContain('dichiarata 89');
    expect(esito.avvisi[0]).toContain('sta a 88');
  });

  it('un estratto introvabile non boccia: pagina com’era, avviso', async () => {
    const esito = await ancoraCitazioni(dir, [cit(88, 'Frase inventata dal modello')], perPath);
    expect(esito.citazioni[0]?.posizione.pagina).toBe(88);
    expect(esito.avvisi[0]).toContain('non trovato');
  });
});
