# Ingestion locale

Cartella di lavoro per portare nuovi set documentali nell'archivio di Velia
**a mano, in sessione con Claude** — il procedimento con cui è nato il primo
archivio (UnipolSai Km&Servizi).

- **`ISTRUZIONI.md`** — il procedimento completo, passo per passo: sono le
  istruzioni da dare a Claude (o da fargli leggere) quando c'è un set nuovo
  da lavorare.
- **`originali/`** — i PDF da convertire. Mai nel repository.
- **`lavorazione/`** — l'albero dei Markdown convertiti, nel layout del
  motore. Mai nel repository: a valle del caricamento i contenuti vivono
  nello Storage, nel repo entra solo il manifesto dei metadati.

Il campione d'oro del formato è `esperimento-motore/workspace/`.
