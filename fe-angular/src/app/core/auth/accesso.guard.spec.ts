import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';

import { accessoGuard, giaDentroGuard } from './accesso.guard';
import { TokenStore } from './token-store';

describe('accessoGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    TestBed.inject(TokenStore).pulisci();
  });

  it('senza token manda a /accesso, con token lascia entrare', () => {
    const router = TestBed.inject(Router);
    const senza = TestBed.runInInjectionContext(() => accessoGuard({} as never, [], {} as never));
    expect(senza instanceof UrlTree && router.serializeUrl(senza)).toBe('/accesso');

    TestBed.inject(TokenStore).imposta('acc', 'agg');
    expect(TestBed.runInInjectionContext(() => accessoGuard({} as never, [], {} as never))).toBe(true);
  });

  it('la pagina di accesso non si mostra a chi ha già una sessione', () => {
    const router = TestBed.inject(Router);
    expect(TestBed.runInInjectionContext(() => giaDentroGuard({} as never, [], {} as never))).toBe(true);

    TestBed.inject(TokenStore).imposta('acc', 'agg');
    const dentro = TestBed.runInInjectionContext(() => giaDentroGuard({} as never, [], {} as never));
    expect(dentro instanceof UrlTree && router.serializeUrl(dentro)).toBe('/');
  });
});
