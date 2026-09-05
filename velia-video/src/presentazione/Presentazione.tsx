/**
 * La presentazione francese di Velia.
 *
 * Una composizione sola che disegna la diapositiva richiesta dalla prop
 * `pagina`: `tools/presentazione.mjs` la rende una volta per pagina in PDF
 * vettoriale e poi cuce i fogli in un unico file.
 *
 * Il montaggio segue quello del sito: fondo chiaro per il lavoro, fondo
 * alternato per gli approfondimenti, fondo scuro per la copertina, la
 * sicurezza e la chiusura.
 */

import { AbsoluteFill } from 'remotion';
import {
  Attacco,
  C,
  Diapositiva,
  F,
  Marchio,
  mono,
  Titolo,
  useFonts,
} from './base';
import { diapositive, testi, type NomeDiapositiva } from './testi';

const TOTALE = diapositive.length;

/* ---------------------------------------------------------------------- */
/* Mattoni condivisi                                                       */
/* ---------------------------------------------------------------------- */

/** Righe termine/dettaglio: lo stesso blocco del sito. */
const Righe: React.FC<{
  voci: { termine: string; dettaglio: string }[];
  scuro?: boolean;
  colonne?: 1 | 2;
}> = ({ voci, scuro = false, colonne = 1 }) => (
  <dl
    style={{
      /* In fondo, non subito sotto l'attacco: appoggiate in alto
         lasciavano un vuoto in mezzo alla pagina. */
      marginTop: 'auto',
      marginBottom: 0,
      display: 'grid',
      gridTemplateColumns: colonne === 2 ? '1fr 1fr' : '1fr',
      gap: colonne === 2 ? '0 72px' : 0,
    }}
  >
    {voci.map((v) => (
      <div
        key={v.termine}
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          gap: 32,
          padding: '22px 0',
          borderTop: `1px solid ${scuro ? C.lineOnInk : C.line}`,
        }}
      >
        <dt style={{ ...mono, fontSize: 16, color: scuro ? C.accentChiaro : C.accent }}>
          {v.termine}
        </dt>
        <dd
          style={{
            margin: 0,
            fontSize: 23,
            lineHeight: 1.5,
            color: scuro ? C.testoSuInk2 : C.text2,
          }}
        >
          {v.dettaglio}
        </dd>
      </div>
    ))}
  </dl>
);

/* ---------------------------------------------------------------------- */
/* Le diapositive                                                          */
/* ---------------------------------------------------------------------- */

const Copertina: React.FC = () => {
  useFonts();
  const t = testi.copertina;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.ink,
        color: C.testoSuInk,
        fontFamily: F.lettura,
        padding: '110px 120px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Il tratteggio diagonale della testata del sito. */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, #24221c 0 14px, #2e2b24 14px 28px)',
          opacity: 0.55,
        }}
      />
      <AbsoluteFill
        style={{ background: 'linear-gradient(90deg, #1c1a15 38%, rgba(28,26,21,0.72) 100%)' }}
      />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18 }}>
        <Marchio size={46} chiaro />
        <span style={{ fontFamily: F.interfaccia, fontSize: 34 }}>{t.marchio}</span>
      </div>

      <div style={{ position: 'relative' }}>
        <h1
          style={{
            fontFamily: F.interfaccia,
            fontWeight: 400,
            fontSize: 82,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            margin: 0,
            maxWidth: '17ch',
          }}
        >
          {t.titolo}
        </h1>
        <p
          style={{
            fontSize: 28,
            lineHeight: 1.5,
            margin: '38px 0 0',
            maxWidth: '58ch',
            color: C.testoSuInk2,
          }}
        >
          {t.sottotitolo}
        </p>
      </div>

      <p style={{ ...mono, position: 'relative', color: C.testoSuInk2, margin: 0 }}>
        {t.piede}
      </p>
    </AbsoluteFill>
  );
};

const Constat: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.constat;
  return (
    <Diapositiva occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <Titolo>{t.titolo}</Titolo>
      <Attacco>{t.attacco}</Attacco>
      <div
        style={{
          marginTop: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          backgroundColor: C.line,
          border: `1px solid ${C.line}`,
        }}
      >
        {t.cifre.map((c) => (
          <div key={c.etichetta} style={{ backgroundColor: C.page, padding: '38px 36px' }}>
            <p
              style={{
                fontFamily: F.interfaccia,
                fontSize: 62,
                lineHeight: 1,
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              {c.valore}
            </p>
            <p style={{ fontSize: 20, lineHeight: 1.45, margin: '18px 0 0', color: C.text3 }}>
              {c.etichetta}
            </p>
          </div>
        ))}
      </div>
    </Diapositiva>
  );
};

const Differenza: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.differenza;
  return (
    <Diapositiva tono="alterna" occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <Titolo piccolo>{t.titolo}</Titolo>
      <Attacco>{t.attacco}</Attacco>
      <div
        style={{
          marginTop: 'auto',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 28,
        }}
      >
        {t.colonne.map((col, i) => (
          <div
            key={col.titolo}
            style={{
              backgroundColor: i === 1 ? C.ink : C.surface,
              color: i === 1 ? C.testoSuInk : C.text,
              border: `1px solid ${i === 1 ? C.ink : C.line}`,
              padding: '36px 40px 40px',
            }}
          >
            <p
              style={{
                ...mono,
                color: i === 1 ? C.accentChiaro : C.text3,
                margin: '0 0 26px',
              }}
            >
              {col.titolo}
            </p>
            {col.voci.map((v) => (
              <p
                key={v}
                style={{
                  fontSize: 22,
                  lineHeight: 1.45,
                  margin: '0 0 18px',
                  paddingLeft: 26,
                  position: 'relative',
                  color: i === 1 ? C.testoSuInk : C.text2,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 0,
                    color: i === 1 ? C.accentChiaro : C.textMute,
                  }}
                >
                  {i === 1 ? '→' : '·'}
                </span>
                {v}
              </p>
            ))}
          </div>
        ))}
      </div>
    </Diapositiva>
  );
};

const Ecran: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.ecran;
  const colore = (tono?: 'pos' | 'neg') =>
    tono === 'pos' ? C.pos : tono === 'neg' ? C.neg : C.text;
  return (
    <Diapositiva occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <Titolo piccolo>{t.titolo}</Titolo>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 460px', gap: 64, marginTop: 44 }}>
        {/* La tabella, con la stessa impaginazione dell'applicativo. */}
        <div style={{ border: `1px solid ${C.line}`, backgroundColor: C.surface }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1fr 1fr',
              gap: 20,
              padding: '18px 28px',
              backgroundColor: C.pageAlt,
            }}
          >
            {t.colonne.map((c) => (
              <span key={c} style={{ ...mono, fontSize: 14 }}>
                {c}
              </span>
            ))}
          </div>
          {t.righe.map((r, i) => (
            <div
              key={r.label}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 1fr 1fr',
                gap: 20,
                padding: '20px 28px',
                borderTop: i === 0 ? 'none' : `1px solid ${C.lineSoft}`,
                fontSize: 21,
              }}
            >
              <span style={{ color: C.text2 }}>{r.label}</span>
              <span style={{ color: colore(r.a.tono) }}>{r.a.value}</span>
              <span style={{ color: colore(r.b.tono) }}>{r.b.value}</span>
            </div>
          ))}
        </div>

        <div>
          <p style={{ fontSize: 23, lineHeight: 1.55, margin: 0, color: C.text2 }}>{t.attacco}</p>
          <p style={{ ...mono, margin: '36px 0 14px' }}>Sources</p>
          {t.fonti.map((f) => (
            <p
              key={f}
              style={{
                fontFamily: F.interfaccia,
                fontSize: 17,
                lineHeight: 1.6,
                margin: '0 0 8px',
                color: C.accent,
              }}
            >
              {f}
            </p>
          ))}
        </div>
      </div>
    </Diapositiva>
  );
};

const Strumenti: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.strumenti;
  return (
    <Diapositiva tono="alterna" occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <Titolo piccolo>{t.titolo}</Titolo>
      <Attacco>{t.attacco}</Attacco>
      <div
        style={{
          /* Dieci schede su cinque righe: con la spaziatura degli altri
             blocchi l'ultima riga finiva sotto il piè di pagina. Qui il
             passo è più stretto e la griglia si prende l'altezza che resta. */
          marginTop: 34,
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridAutoRows: '1fr',
          gap: 1,
          backgroundColor: C.line,
          border: `1px solid ${C.line}`,
        }}
      >
        {t.voci.map((v) => (
          <div
            key={v.nome}
            style={{
              backgroundColor: C.page,
              padding: '16px 26px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <p
              style={{
                fontFamily: F.interfaccia,
                fontSize: 23,
                margin: '0 0 6px',
                color: C.text,
              }}
            >
              {v.nome}
            </p>
            <p style={{ fontSize: 16.5, lineHeight: 1.4, margin: 0, color: C.text3 }}>{v.riga}</p>
          </div>
        ))}
      </div>
    </Diapositiva>
  );
};

/** Le tre pagine costruite allo stesso modo: titolo, attacco, righe. */
const Approfondimento: React.FC<{
  n: number;
  dati: {
    occhiello: string;
    titolo: string;
    attacco: string;
    righe: { termine: string; dettaglio: string }[];
  };
  tono?: 'chiara' | 'alterna' | 'scura';
  coda?: React.ReactNode;
}> = ({ n, dati, tono = 'chiara', coda }) => (
  <Diapositiva tono={tono} occhiello={dati.occhiello} numero={n} totale={TOTALE}>
    <Titolo piccolo scuro={tono === 'scura'}>
      {dati.titolo}
    </Titolo>
    <Attacco scuro={tono === 'scura'}>{dati.attacco}</Attacco>
    <Righe voci={dati.righe} scuro={tono === 'scura'} />
    {coda}
  </Diapositiva>
);

const Documents: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.documents;
  return (
    <Approfondimento
      n={n}
      dati={t}
      coda={
        <div style={{ marginTop: 'auto', display: 'flex', gap: 14, paddingTop: 40 }}>
          {t.formati.map((f) => (
            <span
              key={f}
              style={{
                ...mono,
                fontSize: 16,
                color: C.accent,
                border: `1px solid ${C.line}`,
                backgroundColor: C.surface,
                padding: '12px 22px',
              }}
            >
              {f}
            </span>
          ))}
        </div>
      }
    />
  );
};

const Agents: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.agents;
  return (
    <Approfondimento
      n={n}
      dati={t}
      tono="alterna"
      coda={
        <p
          style={{
            marginTop: 'auto',
            paddingTop: 36,
            fontSize: 20,
            lineHeight: 1.55,
            color: C.text3,
            maxWidth: '80ch',
            borderLeft: `2px solid ${C.accent}`,
            paddingLeft: 24,
          }}
        >
          {t.avvertenza}
        </p>
      }
    />
  );
};

const Securite: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.securite;
  return (
    <Diapositiva tono="scura" occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <Titolo piccolo scuro>
        {t.titolo}
      </Titolo>
      <Attacco scuro>{t.attacco}</Attacco>
      <div
        style={{
          marginTop: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          backgroundColor: C.lineOnInk,
          border: `1px solid ${C.lineOnInk}`,
        }}
      >
        {t.impegni.map((i) => (
          <div key={i.nome} style={{ backgroundColor: C.ink, padding: '28px 30px 32px' }}>
            <span
              style={{
                ...mono,
                fontSize: 14,
                color: C.accentChiaro,
                border: `1px solid ${C.lineOnInk}`,
                padding: '7px 14px',
                display: 'inline-block',
              }}
            >
              {i.marchio}
            </span>
            <p
              style={{
                fontFamily: F.interfaccia,
                fontSize: 23,
                margin: '20px 0 8px',
                color: C.testoSuInk,
              }}
            >
              {i.nome}
            </p>
            <p style={{ fontSize: 18, lineHeight: 1.45, margin: 0, color: C.testoSuInk2 }}>
              {i.riga}
            </p>
          </div>
        ))}
      </div>
    </Diapositiva>
  );
};

const PourQui: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.pourQui;
  return (
    <Diapositiva occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <Titolo piccolo>{t.titolo}</Titolo>
      <Attacco>{t.attacco}</Attacco>
      <div
        style={{
          marginTop: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 28,
        }}
      >
        {t.profili.map((p) => (
          <div key={p.nome} style={{ borderTop: `2px solid ${C.accent}`, paddingTop: 24 }}>
            <p style={{ fontFamily: F.interfaccia, fontSize: 27, margin: '0 0 14px' }}>{p.nome}</p>
            <p style={{ fontSize: 19, lineHeight: 1.5, margin: 0, color: C.text3 }}>{p.riga}</p>
          </div>
        ))}
      </div>
    </Diapositiva>
  );
};

const Demarrer: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.demarrer;
  return (
    <Diapositiva tono="alterna" occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <Titolo piccolo>{t.titolo}</Titolo>
      <div style={{ marginTop: 'auto', display: 'grid', gap: 0 }}>
        {t.passi.map((p) => (
          <div
            key={p.numero}
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 380px 1fr',
              gap: 36,
              alignItems: 'baseline',
              padding: '30px 0',
              borderTop: `1px solid ${C.line}`,
            }}
          >
            <span
              style={{
                fontFamily: F.interfaccia,
                fontSize: 44,
                color: C.accent,
                letterSpacing: '-0.02em',
              }}
            >
              {p.numero}
            </span>
            <span style={{ fontFamily: F.interfaccia, fontSize: 28 }}>{p.nome}</span>
            <span style={{ fontSize: 20, lineHeight: 1.5, color: C.text3 }}>{p.riga}</span>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 40, fontSize: 21, color: C.text2 }}>{t.nota}</p>
    </Diapositiva>
  );
};

const Chiusura: React.FC = () => {
  useFonts();
  const t = testi.chiusura;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.ink,
        color: C.testoSuInk,
        fontFamily: F.lettura,
        padding: '110px 120px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <Marchio size={46} chiaro />
        <span style={{ fontFamily: F.interfaccia, fontSize: 34 }}>Velia</span>
      </div>

      <div>
        <h2
          style={{
            fontFamily: F.interfaccia,
            fontWeight: 400,
            fontSize: 72,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            margin: 0,
            maxWidth: '20ch',
          }}
        >
          {t.titolo}
        </h2>
        <div style={{ display: 'flex', gap: 56, marginTop: 56, alignItems: 'center' }}>
          <span
            style={{
              backgroundColor: C.testoSuInk,
              color: C.ink,
              fontSize: 24,
              padding: '20px 38px',
              fontFamily: F.interfaccia,
            }}
          >
            {t.invito}
          </span>
          <span style={{ fontSize: 26, color: C.testoSuInk }}>{t.sito}</span>
          <span style={{ fontSize: 26, color: C.testoSuInk2 }}>{t.email}</span>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.lineOnInk}`, paddingTop: 26 }}>
        <p style={{ ...mono, color: C.testoSuInk2, margin: '0 0 12px' }}>{t.societa}</p>
        <p style={{ fontSize: 17, lineHeight: 1.5, color: C.testoSuInk2, margin: 0, maxWidth: '95ch' }}>
          {t.nota}
        </p>
      </div>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------------- */

export type PresentazioneProps = { pagina: number };

export const Presentazione: React.FC<PresentazioneProps> = ({ pagina }) => {
  const nome: NomeDiapositiva = diapositive[pagina - 1] ?? diapositive[0]!;

  switch (nome) {
    case 'copertina':
      return <Copertina />;
    case 'constat':
      return <Constat n={pagina} />;
    case 'differenza':
      return <Differenza n={pagina} />;
    case 'ecran':
      return <Ecran n={pagina} />;
    case 'strumenti':
      return <Strumenti n={pagina} />;
    case 'bibliotheque':
      return <Approfondimento n={pagina} dati={testi.bibliotheque} />;
    case 'methode':
      return <Approfondimento n={pagina} dati={testi.methode} tono="alterna" />;
    case 'memoire':
      return <Approfondimento n={pagina} dati={testi.memoire} tono="scura" />;
    case 'documents':
      return <Documents n={pagina} />;
    case 'agents':
      return <Agents n={pagina} />;
    case 'securite':
      return <Securite n={pagina} />;
    case 'pourQui':
      return <PourQui n={pagina} />;
    case 'demarrer':
      return <Demarrer n={pagina} />;
    case 'chiusura':
      return <Chiusura />;
  }
};
