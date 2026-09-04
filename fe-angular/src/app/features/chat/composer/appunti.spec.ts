import { immaginiIncollate } from './appunti';

/** Gli appunti come li vede il gestore dell'incolla: i file e il testo. */
function appunti(files: File[], testo = ''): DataTransfer {
  return { files, getData: (tipo: string) => (tipo === 'text/plain' ? testo : '') } as unknown as DataTransfer;
}

const png = (nome = 'image.png') => new File([new Uint8Array([1, 2, 3])], nome, { type: 'image/png' });

/** Un'ora fissa: il nome dell'immagine incollata la porta dentro. */
const ORA = new Date(2026, 8, 4, 9, 5);

describe('le immagini negli appunti', () => {
  it('non trova niente in appunti vuoti o di solo testo', () => {
    expect(immaginiIncollate(null)).toEqual({ leggibili: [], scartate: 0 });
    expect(immaginiIncollate(appunti([]))).toEqual({ leggibili: [], scartate: 0 });
    expect(immaginiIncollate(appunti([], 'due righe'))).toEqual({ leggibili: [], scartate: 0 });
  });

  it('prende PNG e JPEG e li chiama con l’ora, perché arrivano tutti «image.png»', () => {
    const esito = immaginiIncollate(appunti([png(), png()]), ORA);
    expect(esito.scartate).toBe(0);
    expect(esito.leggibili.map((f) => f.name)).toEqual([
      'Immagine incollata 9.05.png',
      'Immagine incollata 9.05 (2).png',
    ]);
    expect(esito.leggibili[0].type).toBe('image/png');
  });

  it('tiene l’estensione giusta per un JPEG', () => {
    const jpeg = new File([new Uint8Array([1])], 'foto.jpeg', { type: 'image/jpeg' });
    expect(immaginiIncollate(appunti([jpeg]), ORA).leggibili[0].name).toBe('Immagine incollata 9.05.jpg');
  });

  it('conta le immagini che non sappiamo leggere invece di allegarle', () => {
    const webp = new File([new Uint8Array([1])], 'x.webp', { type: 'image/webp' });
    const esito = immaginiIncollate(appunti([png(), webp]), ORA);
    expect(esito.leggibili.length).toBe(1);
    expect(esito.scartate).toBe(1);
  });

  it('non guarda i file che non sono immagini: quelli si allegano dal menù', () => {
    const pdf = new File([new Uint8Array([1])], 'polizza.pdf', { type: 'application/pdf' });
    expect(immaginiIncollate(appunti([pdf]), ORA)).toEqual({ leggibili: [], scartate: 0 });
  });

  it('col testo negli appunti vince il testo: copiando da Excel arriva anche l’immagine', () => {
    /* Il gesto quotidiano è incollare la tabella, non allegarne la figura. */
    expect(immaginiIncollate(appunti([png()], 'Garanzia\tMassimale'), ORA)).toEqual({
      leggibili: [],
      scartate: 0,
    });
  });
});
