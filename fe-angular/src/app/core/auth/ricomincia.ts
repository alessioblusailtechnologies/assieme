import { DOCUMENT, InjectionToken, inject } from '@angular/core';

/**
 * Riparte da una pagina nuova all'indirizzo dato: si azzera la memoria
 * dell'applicazione, non solo la rotta.
 *
 * Serve quando cambia **chi** la sta usando. Lo storico delle conversazioni
 * è uno store di root, e gli store della chat e dell'archivio privato sono
 * forniti a livello di rotta — che il router tiene vivi anche fuori dalla
 * sezione. Tutti hanno caricato i dati dell'utente di prima e nessuno ha
 * motivo di ricaricarli: il 14/09/2026, dopo «Esci» e un accesso con un
 * utente di un altro tenant, la barra laterale mostrava ancora le chat di
 * chi era uscito (aprirle dava errore, perché la RLS le negava) e l'archivio
 * privato i suoi documenti. Azzerare store per store vorrebbe dire un elenco
 * da tenere aggiornato a ogni store nuovo; una pagina nuova non dimentica
 * nessuno.
 *
 * È un token perché nei test una navigazione vera ricaricherebbe il runner.
 */
export const RICOMINCIA = new InjectionToken<(url: string) => void>('RICOMINCIA', {
  providedIn: 'root',
  factory: () => {
    const documento = inject(DOCUMENT);
    return (url) => documento.location.assign(url);
  },
});
