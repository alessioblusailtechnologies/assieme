import { describe, expect, it } from 'vitest';

import { LIVELLI, modelloDelTenant } from '../src/contratto/modelli.js';
import { TrascrittoriPerModello, type Convertitore } from '../src/worker/ingestion/convertitore.js';

/**
 * Chi trascrive i documenti di un tenant (21/09/2026): il modello del
 * livello scelto nelle Impostazioni, come la chat. Il 19/09 era DeepSeek per
 * tutti, e i documenti di chi restava su Medio o Boost finivano in Cina lo
 * stesso.
 */

/** Un convertitore finto che ricorda per chi è nato. */
function finto(modello: string): Convertitore & { modello: string } {
  return { modello, convertiBlocco: () => Promise.resolve('') };
}

const sdkDi = (nome: string) => LIVELLI.find((l) => l.nome === nome)!.sdk;

describe('chi trascrive per un tenant', () => {
  it('segue il livello: Medio Sonnet, Avanzato DeepSeek, Boost Opus', () => {
    const trascrittori = new TrascrittoriPerModello({ predefinito: 'claude-opus-5' }, finto);
    expect(trascrittori.modelloPer(sdkDi('Medio'))).toBe('claude-sonnet-5');
    expect(trascrittori.modelloPer(sdkDi('Avanzato'))).toBe('deepseek-flash');
    expect(trascrittori.modelloPer(sdkDi('Boost'))).toBe('claude-opus-5');
  });

  it('chi non ha scelto, e un pubblico senza tenant, ha il default di piattaforma', () => {
    const trascrittori = new TrascrittoriPerModello({ predefinito: 'claude-opus-5' }, finto);
    expect(trascrittori.modelloPer(undefined)).toBe('claude-opus-5');
    /* Una scelta rimasta su un modello tolto dal catalogo non vale più:
       la filtra `modelloDelTenant`, come per la chat. */
    expect(trascrittori.modelloPer(modelloDelTenant('un-modello-tolto'))).toBe('claude-opus-5');
  });

  it('il modello forzato dalla piattaforma vince sul livello di chiunque', () => {
    const trascrittori = new TrascrittoriPerModello(
      { forzato: 'claude-opus-5', predefinito: 'claude-sonnet-5' },
      finto,
    );
    expect(trascrittori.modelloPer('deepseek-flash')).toBe('claude-opus-5');
    expect(trascrittori.modelloPer(undefined)).toBe('claude-opus-5');
  });

  it('un convertitore per modello, costruito una volta sola', () => {
    const nati: string[] = [];
    const trascrittori = new TrascrittoriPerModello({ predefinito: 'claude-opus-5' }, (modello) => {
      nati.push(modello);
      return finto(modello);
    });
    const primo = trascrittori.per('deepseek-flash');
    expect(trascrittori.per('deepseek-flash')).toBe(primo);
    expect((trascrittori.per(undefined) as ReturnType<typeof finto>).modello).toBe('claude-opus-5');
    expect(nati).toEqual(['deepseek-flash', 'claude-opus-5']);
  });

  it('un fornitore senza chiave fa fallire solo chi lo usa', () => {
    const trascrittori = new TrascrittoriPerModello({ predefinito: 'claude-opus-5' }, (modello) => {
      if (modello === 'deepseek-flash') throw new Error('DEEPSEEK_API_KEY mancante');
      return finto(modello);
    });
    expect(() => trascrittori.per('deepseek-flash')).toThrow('DEEPSEEK_API_KEY');
    expect(() => trascrittori.per('claude-sonnet-5')).not.toThrow();
  });
});
