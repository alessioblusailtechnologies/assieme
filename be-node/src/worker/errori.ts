/**
 * Un fallimento che ritentare non aggiusterebbe (risposta non validabile,
 * input impossibile): il ciclo lo porta subito a `fallito`, senza i giri di
 * retry pensati per i guasti d'infrastruttura.
 */
export class ErroreNonRitentabile extends Error {
  constructor(messaggio: string) {
    super(messaggio);
    this.name = 'ErroreNonRitentabile';
  }
}
