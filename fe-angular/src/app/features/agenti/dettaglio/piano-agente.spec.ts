import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { Agente } from '@core/models';
import { PianoAgenteScheda } from './piano-agente';

/**
 * La scheda del piano (14/09/2026): racconta che cosa farà l'agente, chiede
 * la conferma, e la tiene ferma se un destinatario non si è risolto.
 */
describe('PianoAgenteScheda', () => {
  const AGENTE: Agente = {
    id: 'agt-1',
    nome: 'Scadenze della settimana',
    richiesta: 'Cerca le scadenze e mandamele.',
    riferimenti: [],
    pianoStato: 'da-confermare',
    piano: {
      obiettivo: 'Sapere ogni lunedì chi ha una polizza in scadenza',
      passi: [
        { tipo: 'cerca', titolo: 'Cerca i clienti con polizze in scadenza' },
        { tipo: 'invia-email', titolo: 'Manda la tabella', dettaglio: 'Con il file Excel allegato.' },
      ],
      letture: [],
      file: [{ formato: 'xlsx', descrizione: 'La tabella delle scadenze' }],
      email: [
        {
          destinatario: { tipo: 'utente', id: 'u1', nome: 'Marta Ferrero', a: 'm.ferrero@esempio.it' },
          contenuto: 'La tabella delle scadenze.',
          allegati: ['La tabella delle scadenze'],
        },
      ],
      dubbi: [],
    },
    attivo: true,
    creatoDa: 'u1',
    aggiornatoIl: '2026-09-14T10:00:00.000Z',
  };

  async function monta(agente: Agente): Promise<ComponentFixture<PianoAgenteScheda>> {
    await TestBed.configureTestingModule({ imports: [PianoAgenteScheda] }).compileComponents();
    const fixture = TestBed.createComponent(PianoAgenteScheda);
    fixture.componentRef.setInput('agente', agente);
    fixture.detectChanges();
    return fixture;
  }

  const pulsante = (dom: HTMLElement, testo: string): HTMLButtonElement | undefined =>
    Array.from(dom.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes(testo));

  it('racconta obiettivo, passi, file e destinatari, e chiede la conferma', async () => {
    const fixture = await monta(AGENTE);
    const dom = fixture.nativeElement as HTMLElement;

    expect(dom.querySelector('.piano__stato')?.textContent).toBe('da confermare');
    expect(dom.querySelector('.piano__obiettivo')?.textContent).toBe('Sapere ogni lunedì chi ha una polizza in scadenza');
    expect(dom.querySelectorAll('.passo')).toHaveLength(2);
    expect(dom.textContent).toContain('Con il file Excel allegato.');
    expect(dom.querySelector('.voce__formato')?.textContent).toBe('xlsx');
    expect(dom.textContent).toContain('A Marta Ferrero <m.ferrero@esempio.it>');
    expect(dom.textContent).toContain('finché non confermi il piano');

    let confermato = false;
    fixture.componentInstance.conferma.subscribe(() => (confermato = true));
    pulsante(dom, 'Conferma e attiva')!.click();
    expect(confermato).toBe(true);
  });

  it('un destinatario non risolto tiene ferma la conferma e dice perché', async () => {
    const dom = (
      await monta({
        ...AGENTE,
        piano: {
          ...AGENTE.piano!,
          email: [
            {
              destinatario: { tipo: 'non-risolto', richiesto: 'Bianchi', motivo: '«Bianchi» non è in anagrafica.' },
              contenuto: 'x',
              allegati: [],
            },
          ],
        },
        bloccoConferma: 'Prima di confermare sistema il destinatario «Bianchi»: «Bianchi» non è in anagrafica.',
      })
    ).nativeElement as HTMLElement;

    expect(pulsante(dom, 'Conferma e attiva')!.disabled).toBe(true);
    expect(dom.querySelector('.email__voce.is-mancante')?.textContent).toContain('non è in anagrafica');
    expect(dom.textContent).toContain('Prima di confermare sistema il destinatario «Bianchi»');
  });

  it('confermato non chiede più niente; senza piano offre di leggere la richiesta', async () => {
    const confermato = (
      await monta({ ...AGENTE, pianoStato: 'confermato', pianoConfermatoIl: '2026-09-14T11:00:00.000Z' })
    ).nativeElement as HTMLElement;
    expect(confermato.querySelector('.piano__stato')?.textContent).toBe('confermato');
    expect(pulsante(confermato, 'Conferma e attiva')).toBeUndefined();
    expect(pulsante(confermato, 'Rileggi la richiesta')).toBeDefined();

    TestBed.resetTestingModule();
    const nonLetto = (
      await monta({
        ...AGENTE,
        pianoStato: 'non-letto',
        piano: undefined,
        pianoErrore: 'Non sono riuscito a leggere la richiesta: riprova fra poco.',
      })
    ).nativeElement as HTMLElement;
    expect(nonLetto.querySelector('.piano__errore')?.textContent).toContain('Non sono riuscito a leggere');
    expect(pulsante(nonLetto, 'Leggi la richiesta')).toBeDefined();
    expect(pulsante(nonLetto, 'Conferma e attiva')).toBeUndefined();
  });
});
