/**
 * I testi che finiscono nei meta e nei dati strutturati di ogni pagina.
 *
 * L'entità `Organization` resta una sola fra le lingue e mantiene lo stesso
 * `@id`: qui cambiano solo la descrizione, l'area servita e la lingua
 * dichiarata.
 */

const seo = {
  immagineAlt: 'Velia, la piattaforma AI per la distribuzione assicurativa',
  organizzazione: {
    alternateName: ['Sono Velia', 'Velia AI'],
    description:
      'Velia è l’assistente AI per agenzie assicurative, broker e intermediari: un archivio di set informativi già pronto, i documenti dell’agenzia accanto ai loro e ogni risposta con la citazione al passaggio di origine.',
    areaServita: 'Italia',
  },
};

export default seo;
