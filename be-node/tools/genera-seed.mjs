/**
 * Genera `supabase/seed.sql` dalle fixture dei mock (`mocks/data/`): stesse
 * compagnie, stessi rami, stesso tenant demo del caso pilota. Le fixture
 * restano la fonte; questo file si rigenera, non si modifica a mano.
 *
 *   node tools/genera-seed.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const DATI = join(QUI, '..', '..', 'mocks', 'data');

const leggi = (nome) => JSON.parse(readFileSync(join(DATI, nome), 'utf8'));
const apice = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`);

const compagnie = leggi('compagnie.json');
const rami = leggi('rami.json');

/**
 * Il tenant demo del caso pilota. L'id fisso permette a seed-utenti e alle
 * fixture successive di riferirlo; 'tnt-001' delle fixture diventa questo
 * uuid (il FE tratta gli id come opachi).
 */
const TENANT_DEMO = '11111111-1111-4111-8111-111111111111';

const righe = [];
righe.push('-- Generato da tools/genera-seed.mjs — non modificare a mano.');
righe.push('');
righe.push('insert into assieme.tenant (id, nome, piano) values');
righe.push(`  ('${TENANT_DEMO}', 'Assicurazioni Meridiana S.r.l.', 'agenzia')`);
righe.push('on conflict (id) do update set nome = excluded.nome, piano = excluded.piano;');
righe.push('');
righe.push('insert into assieme.compagnie (id, nome, ultimo_aggiornamento) values');
righe.push(
  compagnie
    .map((c) => `  (${apice(c.id)}, ${apice(c.nome)}, ${apice(c.ultimoAggiornamento)})`)
    .join(',\n'),
);
righe.push(
  'on conflict (id) do update set nome = excluded.nome, ultimo_aggiornamento = excluded.ultimo_aggiornamento;',
);
righe.push('');
righe.push('insert into assieme.rami (id, nome, codice) values');
righe.push(rami.map((r) => `  (${apice(r.id)}, ${apice(r.nome)}, ${apice(r.codice)})`).join(',\n'));
righe.push('on conflict (id) do update set nome = excluded.nome, codice = excluded.codice;');
righe.push('');

const documenti = leggi('documenti-pubblici.json');
righe.push(
  'insert into assieme.documenti (id, archivio, titolo, tipologia, numero_pagine, compagnia_id, ramo_id, prodotto, edizione_id, edizione_etichetta, edizione_valida_dal, edizione_valida_al, edizione_corrente) values',
);
righe.push(
  documenti
    .map(
      (d) =>
        `  (${apice(d.id)}, 'pubblico', ${apice(d.titolo)}, ${apice(d.tipologia)}, ${d.numeroPagine ?? 'null'}, ${apice(d.compagniaId)}, ${apice(d.ramoId)}, ${apice(d.prodotto)}, ${apice(d.edizione.id)}, ${apice(d.edizione.etichetta)}, ${apice(d.edizione.validaDal)}, ${apice(d.edizione.validaAl)}, ${d.edizione.corrente})`,
    )
    .join(',\n'),
);
righe.push(
  'on conflict (id) do update set titolo = excluded.titolo, tipologia = excluded.tipologia, numero_pagine = excluded.numero_pagine, compagnia_id = excluded.compagnia_id, ramo_id = excluded.ramo_id, prodotto = excluded.prodotto, edizione_id = excluded.edizione_id, edizione_etichetta = excluded.edizione_etichetta, edizione_valida_dal = excluded.edizione_valida_dal, edizione_valida_al = excluded.edizione_valida_al, edizione_corrente = excluded.edizione_corrente;',
);
righe.push('');

writeFileSync(join(QUI, '..', 'supabase', 'seed.sql'), righe.join('\n'), 'utf8');
console.log(
  `seed.sql generato: 1 tenant, ${compagnie.length} compagnie, ${rami.length} rami, ${documenti.length} documenti`,
);
