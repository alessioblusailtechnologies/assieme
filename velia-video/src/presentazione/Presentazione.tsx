/**
 * La presentazione francese di Velia.
 *
 * Una composizione sola che disegna la diapositiva richiesta dalla prop
 * `pagina`: `tools/presentazione.mjs` la rende una volta per pagina in PDF
 * vettoriale e poi cuce i fogli in un unico file.
 *
 * Le pagine delle funzionalità non descrivono: mostrano. Ogni schermata è
 * l'interfaccia vera, disegnata in markup con gli stessi token del FE, e non
 * una fotografia. È il motivo per cui questa presentazione si fa qui.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender } from 'remotion';
import { Attacco, C, Diapositiva, F, Marchio, mono, Titolo, useFonts } from './base';
import {
  BollaAssistente,
  BollaUtente,
  Composer,
  EtichettaMemoria,
  Fonti,
  IconaDoc,
  monoStile,
  Pannello,
  Schermata,
  Tabella,
} from './app';
import { buildGraph, drawGraph, GRAPH_H, GRAPH_W } from '../graph';
import { composer, schermate } from './schermate';
import { diapositive, testi, type NomeDiapositiva } from './testi';

const TOTALE = diapositive.length;

/* ---------------------------------------------------------------------- */
/* Mattoni condivisi                                                       */
/* ---------------------------------------------------------------------- */

const Righe: React.FC<{
  voci: { termine: string; dettaglio: string }[];
  scuro?: boolean;
  compatte?: boolean;
}> = ({ voci, scuro = false, compatte = false }) => (
  <dl style={{ margin: 0, marginTop: compatte ? 32 : 'auto' }}>
    {voci.map((v) => (
      <div
        key={v.termine}
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: 28,
          padding: compatte ? '16px 0' : '22px 0',
          borderTop: `1px solid ${scuro ? C.lineOnInk : C.line}`,
        }}
      >
        <dt style={{ ...mono, fontSize: 15, color: scuro ? C.accentChiaro : C.accent }}>
          {v.termine}
        </dt>
        <dd
          style={{
            margin: 0,
            fontSize: compatte ? 20 : 23,
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

/**
 * Il telaio delle pagine funzionalità: a sinistra il perché, a destra il
 * prodotto. La schermata si disegna a grandezza naturale e poi si scala,
 * così i corpi del testo restano quelli dell'interfaccia vera.
 */
const PaginaSchermata: React.FC<{
  n: number;
  dati: { occhiello: string; titolo: string; attacco: string };
  tono?: 'chiara' | 'alterna';
  scala?: number;
  children: React.ReactNode;
}> = ({ n, dati, tono = 'chiara', scala = 0.94, children }) => (
  <Diapositiva tono={tono} occhiello={dati.occhiello} numero={n} totale={TOTALE}>
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: '500px 1fr',
        gap: 56,
        alignItems: 'center',
      }}
    >
      <div>
        <h2
          style={{
            fontFamily: F.interfaccia,
            fontWeight: 400,
            fontSize: 46,
            lineHeight: 1.12,
            letterSpacing: '-0.015em',
            margin: 0,
          }}
        >
          {dati.titolo}
        </h2>
        <p style={{ fontSize: 21, lineHeight: 1.55, margin: '24px 0 0', color: C.text2 }}>
          {dati.attacco}
        </p>
      </div>

      <div style={{ display: 'grid', placeItems: 'center', minWidth: 0 }}>
        <div style={{ transform: `scale(${scala})`, transformOrigin: 'center' }}>{children}</div>
      </div>
    </div>
  </Diapositiva>
);

/** La colonna della chat dentro la schermata. */
const Conversazione: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      maxWidth: 760,
      margin: '0 auto',
    }}
  >
    {children}
  </div>
);

/* ---------------------------------------------------------------------- */
/* Copertina, memoria, posizionamento                                      */
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
      <AbsoluteFill
        style={{
          backgroundImage: 'repeating-linear-gradient(135deg, #24221c 0 14px, #2e2b24 14px 28px)',
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

      <p style={{ ...mono, position: 'relative', color: C.testoSuInk2, margin: 0 }}>{t.piede}</p>
    </AbsoluteFill>
  );
};

/**
 * La memoria, con lo stesso grafo del sito.
 *
 * `drawGraph` disegna su canvas dentro un effetto, cioè dopo il primo paint:
 * senza `delayRender` Remotion fotograferebbe la diapositiva con il canvas
 * ancora vuoto.
 */
const Memoire: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.memoire;
  const model = useMemo(() => buildGraph(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => delayRender('grafo'));

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    /* Tema scuro, come la sezione «Mémoire vivante» del sito: il grafo
       vive sull'inchiostro, non su un riquadro chiaro incollato sopra. */
    drawGraph(ctx, model, 0.8, null, 1, 'scuro');
    continueRender(handle);
  }, [model, handle]);

  return (
    <Diapositiva tono="scura" occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: '620px 1fr',
          gap: 64,
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <canvas
            ref={canvasRef}
            width={GRAPH_W}
            height={GRAPH_H}
            style={{ width: 580, height: 558 }}
          />
          <p
            style={{
              ...mono,
              color: C.testoSuInk2,
              margin: 0,
              textAlign: 'center',
              maxWidth: 580,
            }}
          >
            {t.didascalia}
          </p>
        </div>

        <div>
          <h2
            style={{
              fontFamily: F.interfaccia,
              fontWeight: 400,
              fontSize: 52,
              lineHeight: 1.1,
              letterSpacing: '-0.015em',
              margin: 0,
              color: C.testoSuInk,
            }}
          >
            {t.titolo}
          </h2>
          <p style={{ fontSize: 21, lineHeight: 1.55, margin: '24px 0 0', color: C.testoSuInk2 }}>
            {t.attacco}
          </p>
          <Righe voci={t.righe} scuro compatte />
        </div>
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
      <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
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
            <p style={{ ...mono, color: i === 1 ? C.accentChiaro : C.text3, margin: '0 0 26px' }}>
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

/* ---------------------------------------------------------------------- */
/* Le schermate del prodotto                                               */
/* ---------------------------------------------------------------------- */

const Comparaison: React.FC<{ n: number }> = ({ n }) => {
  const s = schermate.comparaison;
  return (
    <PaginaSchermata n={n} dati={testi.comparaison}>
      <Schermata percorso={s.percorso} azioni={s.azioni}>
        <Conversazione>
          <BollaUtente testo={s.domanda} allegati={s.allegati} />
          <BollaAssistente>
            <span>{s.intro}</span>
            <Tabella colonne={s.colonne} righe={s.righe} />
            <span>{s.sintesi}</span>
          </BollaAssistente>
          <Composer testo={s.composer} />
        </Conversazione>
      </Schermata>
    </PaginaSchermata>
  );
};

const Citation: React.FC<{ n: number }> = ({ n }) => {
  const s = schermate.citation;
  return (
    <PaginaSchermata n={n} dati={testi.citation} tono="alterna">
      <Schermata percorso={s.percorso} azioni={s.azioni}>
        <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '1fr 390px', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <BollaUtente testo={s.domanda} />
            <BollaAssistente>
              <span>{s.risposta}</span>
              <Fonti etichetta={s.etichettaFonti} voci={s.fonti} />
            </BollaAssistente>
            <Composer testo={composer} />
          </div>

          {/* Il documento aperto sul punto citato: la verifica in un clic. */}
          <div
            style={{
              border: `1px solid ${C.lineSoft}`,
              borderRadius: 9,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: C.page,
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: `1px solid ${C.lineSoft}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ color: C.accent, display: 'flex' }}>
                <IconaDoc size={13} />
              </span>
              <span style={{ fontSize: 12.5, color: C.text2 }}>{s.documento.nome}</span>
              <span style={{ ...monoStile, marginLeft: 'auto', fontSize: 10 }}>
                {s.documento.pagina}
              </span>
            </div>
            <div style={{ padding: 16, background: C.surface, flex: 1 }}>
              <p
                style={{ fontFamily: F.interfaccia, fontSize: 14, margin: '0 0 12px', color: C.text }}
              >
                {s.documento.titolo}
              </p>
              {s.documento.righe.map((r, i) => (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    lineHeight: 1.75,
                    color: r.evidenzia ? C.text : C.text3,
                    background: r.evidenzia ? `${C.accent}14` : 'transparent',
                    boxShadow: r.evidenzia ? `inset 2px 0 0 ${C.accent}` : 'none',
                    paddingLeft: r.evidenzia ? 8 : 0,
                  }}
                >
                  {r.t}
                </p>
              ))}
            </div>
          </div>
        </div>
      </Schermata>
    </PaginaSchermata>
  );
};

const Sauvegarde: React.FC<{ n: number }> = ({ n }) => {
  const s = schermate.memoire;
  return (
    <PaginaSchermata n={n} dati={testi.sauvegarde}>
      <Schermata percorso={s.percorso}>
        <Conversazione>
          <BollaUtente testo={s.domanda} />
          <BollaAssistente>
            <span>{s.risposta}</span>
          </BollaAssistente>

          {/* La regola che diventa una voce di memoria, sotto gli occhi. */}
          <div
            style={{
              border: `1px solid ${C.accent}33`,
              background: `${C.accent}0A`,
              borderRadius: 10,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}
          >
            <span style={{ ...monoStile, color: C.accent }}>{s.salvataggio}</span>
            <span style={{ fontFamily: F.interfaccia, fontSize: 16, color: C.text }}>
              {s.voce.titolo}
            </span>
            <span style={{ fontSize: 13.5, lineHeight: 1.5, color: C.text2 }}>
              {s.voce.dettaglio}
            </span>
            <span
              style={{
                ...monoStile,
                fontSize: 10,
                textTransform: 'none',
                letterSpacing: '0.04em',
              }}
            >
              {s.voce.meta}
            </span>
          </div>
          <Composer testo={composer} />
        </Conversazione>
      </Schermata>
    </PaginaSchermata>
  );
};

const Rappel: React.FC<{ n: number }> = ({ n }) => {
  const s = schermate.rappel;
  return (
    <PaginaSchermata n={n} dati={testi.rappel} tono="alterna">
      <Schermata percorso={s.percorso}>
        <Conversazione>
          <BollaUtente testo={s.domanda} allegati={s.allegati} />
          <BollaAssistente>
            <span>{s.risposta}</span>
            <EtichettaMemoria etichetta={s.etichettaMemoria} testo={s.provenienza} />
            <Fonti etichetta={s.etichettaFonti} voci={s.fonti} />
          </BollaAssistente>
          <Composer testo={composer} />
        </Conversazione>
      </Schermata>
    </PaginaSchermata>
  );
};

const Instructions: React.FC<{ n: number }> = ({ n }) => {
  const s = schermate.instructions;
  return (
    <PaginaSchermata n={n} dati={testi.instructions}>
      <Schermata attiva="impostazioni" percorso={s.percorso} azioni={s.azioni}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Pannello titolo={s.pannello} azione={s.azionePannello} flex={1}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {s.voci.map((v) => (
                <div
                  key={v.titolo}
                  style={{
                    border: `1px solid ${C.lineSoft}`,
                    borderRadius: 8,
                    padding: '11px 14px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: F.interfaccia, fontSize: 15, margin: '0 0 4px' }}>
                      {v.titolo}
                    </p>
                    <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: C.text3 }}>
                      {v.testo}
                    </p>
                  </div>
                  <span
                    style={{
                      ...monoStile,
                      fontSize: 9.5,
                      border: `1px solid ${C.line}`,
                      borderRadius: 999,
                      padding: '4px 10px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v.stato}
                  </span>
                </div>
              ))}
            </div>
          </Pannello>

          <div
            style={{
              border: `1px solid ${C.accent}2E`,
              background: `${C.accent}0A`,
              borderRadius: 9,
              padding: '12px 16px',
            }}
          >
            <p style={{ ...monoStile, color: C.accent, margin: '0 0 6px' }}>{s.anteprima.titolo}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0, color: C.text2 }}>
              {s.anteprima.testo}
            </p>
          </div>
        </div>
      </Schermata>
    </PaginaSchermata>
  );
};

const Archive: React.FC<{ n: number }> = ({ n }) => {
  const s = schermate.archive;
  return (
    <PaginaSchermata n={n} dati={testi.archive} tono="alterna">
      <Schermata attiva="archivio" percorso={s.percorso} azioni={s.azioni}>
        <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '250px 1fr', gap: 16 }}>
          {/* L'albero: cartelle libere, la forma che gli dà il cabinet. */}
          <div
            style={{
              border: `1px solid ${C.lineSoft}`,
              borderRadius: 9,
              padding: '12px 8px',
              background: C.page,
            }}
          >
            {s.cartelle.map((c, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  paddingLeft: 10 + (c.livello ?? 0) * 16,
                  borderRadius: 6,
                  background: c.attiva ? C.pageAlt : 'transparent',
                  fontSize: 13.5,
                  color: c.attiva ? C.text : C.text2,
                }}
              >
                <span style={{ color: c.attiva ? C.accent : C.textMute, fontSize: 11 }}>
                  {c.aperta ? '▾' : '▸'}
                </span>
                <span style={{ flex: 1 }}>{c.nome}</span>
                <span style={{ ...monoStile, fontSize: 9.5 }}>{c.conta}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 9, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.1fr 0.7fr 0.7fr',
                  gap: 12,
                  padding: '10px 16px',
                  background: C.page,
                }}
              >
                {s.colonne.map((c) => (
                  <span key={c} style={{ ...monoStile, fontSize: 10 }}>
                    {c}
                  </span>
                ))}
              </div>
              {s.documenti.map((d, i) => (
                <div
                  key={d.nome}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.1fr 0.7fr 0.7fr',
                    gap: 12,
                    padding: '11px 16px',
                    borderTop: `1px solid ${C.lineSoft}`,
                    fontSize: 13,
                    alignItems: 'center',
                    background: i === 1 ? `${C.accent}08` : 'transparent',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.text }}>
                    <span style={{ color: C.textMute, display: 'flex' }}>
                      <IconaDoc size={12} />
                    </span>
                    {d.nome}
                  </span>
                  <span style={{ color: C.text3 }}>{d.tipo}</span>
                  <span style={{ color: C.text3 }}>{d.data}</span>
                  <span style={{ color: C.pos }}>{d.stato}</span>
                </div>
              ))}
            </div>
            <p style={{ ...monoStile, fontSize: 10, color: C.accent, margin: 0 }}>{s.nota}</p>
          </div>
        </div>
      </Schermata>
    </PaginaSchermata>
  );
};

const Tableaux: React.FC<{ n: number }> = ({ n }) => {
  const s = schermate.tableaux;
  return (
    <PaginaSchermata n={n} dati={testi.tableaux}>
      <Schermata attiva="tabelle" percorso={s.percorso} azioni={s.azioni}>
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Tabella colonne={s.colonne} righe={s.righe} compatta />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ ...monoStile, fontSize: 10, color: C.accent }}>{s.etichettaFonti}</span>
            <span style={{ fontSize: 12.5, color: C.text3 }}>{s.nota}</span>
          </div>
        </div>
      </Schermata>
    </PaginaSchermata>
  );
};

const Agents: React.FC<{ n: number }> = ({ n }) => {
  const s = schermate.agents;
  return (
    <PaginaSchermata n={n} dati={testi.agents} tono="alterna">
      <Schermata attiva="agenti" percorso={s.percorso} azioni={s.azioni}>
        <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '1fr 310px', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <Pannello titolo={s.pannello}>
              <div
                style={{
                  border: `1px solid ${C.line}`,
                  borderRadius: 8,
                  padding: '13px 15px',
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: C.text,
                  background: C.page,
                }}
              >
                {s.consegna}
              </div>
            </Pannello>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {s.campi.map((c) => (
                <div
                  key={c.etichetta}
                  style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: '10px 13px' }}
                >
                  <p style={{ ...monoStile, fontSize: 9.5, margin: '0 0 5px' }}>{c.etichetta}</p>
                  <p style={{ fontSize: 13, margin: 0, color: C.text }}>{c.valore}</p>
                </div>
              ))}
            </div>
          </div>

          <Pannello titolo={s.attivi}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {s.elenco.map((a) => (
                <div
                  key={a.nome}
                  style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: '10px 12px' }}
                >
                  <p style={{ fontSize: 13.5, margin: '0 0 4px', color: C.text }}>{a.nome}</p>
                  <div
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <span style={{ fontSize: 12, color: C.text3 }}>{a.quando}</span>
                    <span
                      style={{
                        ...monoStile,
                        fontSize: 9,
                        color: a.stato === 'Actif' ? C.pos : C.text3,
                      }}
                    >
                      {a.stato}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Pannello>
        </div>
      </Schermata>
    </PaginaSchermata>
  );
};

const Documents: React.FC<{ n: number }> = ({ n }) => {
  const s = schermate.documents;
  return (
    <PaginaSchermata n={n} dati={testi.documents}>
      <Schermata percorso={s.percorso} azioni={s.azioni}>
        <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '1fr 290px', gap: 16 }}>
          {/* L'anteprima del documento, col marchio del cabinet. */}
          <div
            style={{
              border: `1px solid ${C.lineSoft}`,
              borderRadius: 9,
              background: C.page,
              display: 'grid',
              placeItems: 'center',
              padding: 18,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 520,
                background: '#fff',
                border: `1px solid ${C.line}`,
                padding: '26px 30px',
                display: 'flex',
                flexDirection: 'column',
                gap: 13,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 12,
                  borderBottom: `2px solid ${C.accent}`,
                }}
              >
                <span style={{ fontFamily: F.interfaccia, fontSize: 16, color: C.accent }}>
                  {s.foglio.cabinet}
                </span>
                <span style={{ ...monoStile, fontSize: 9 }}>{s.foglio.cliente}</span>
              </div>
              <p style={{ fontFamily: F.interfaccia, fontSize: 19, margin: 0, color: C.text }}>
                {s.foglio.titolo}
              </p>
              {s.foglio.sezioni.map((x) => (
                <p
                  key={x}
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    margin: 0,
                    paddingLeft: 14,
                    position: 'relative',
                    color: C.text2,
                  }}
                >
                  <span style={{ position: 'absolute', left: 0, color: C.accent }}>·</span>
                  {x}
                </p>
              ))}
              <p
                style={{
                  ...monoStile,
                  fontSize: 9,
                  paddingTop: 12,
                  marginTop: 4,
                  marginBottom: 0,
                  borderTop: `1px solid ${C.lineSoft}`,
                }}
              >
                {s.foglio.piede}
              </p>
            </div>
          </div>

          <Pannello titolo={s.pannello}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {s.formati.map((f) => (
                <div
                  key={f}
                  style={{
                    border: `1px solid ${C.lineSoft}`,
                    borderRadius: 8,
                    padding: '11px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: 13.5,
                    color: C.text,
                  }}
                >
                  <span style={{ color: C.accent, display: 'flex' }}>
                    <IconaDoc size={13} />
                  </span>
                  {f}
                </div>
              ))}
            </div>
          </Pannello>
        </div>
      </Schermata>
    </PaginaSchermata>
  );
};

/* ---------------------------------------------------------------------- */
/* Pagine di testo                                                         */
/* ---------------------------------------------------------------------- */

const Ecosysteme: React.FC<{ n: number }> = ({ n }) => {
  const t = testi.ecosysteme;
  return (
    <Diapositiva occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <Titolo piccolo>{t.titolo}</Titolo>
      <Attacco>{t.attacco}</Attacco>
      <Righe voci={t.righe} />
      <p
        style={{
          paddingTop: 34,
          fontSize: 20,
          lineHeight: 1.55,
          color: C.text3,
          maxWidth: '80ch',
          borderLeft: `2px solid ${C.accent}`,
          paddingLeft: 24,
          marginBottom: 0,
        }}
      >
        {t.avvertenza}
      </p>
    </Diapositiva>
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
    <Diapositiva tono="alterna" occhiello={t.occhiello} numero={n} totale={TOTALE}>
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
    <Diapositiva occhiello={t.occhiello} numero={n} totale={TOTALE}>
      <Titolo piccolo>{t.titolo}</Titolo>
      <div style={{ marginTop: 'auto' }}>
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
        <p style={{ marginTop: 36, marginBottom: 0, fontSize: 21, color: C.text2 }}>{t.nota}</p>
      </div>
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
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.5,
            color: C.testoSuInk2,
            margin: 0,
            maxWidth: '95ch',
          }}
        >
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
    case 'memoire':
      return <Memoire n={pagina} />;
    case 'differenza':
      return <Differenza n={pagina} />;
    case 'comparaison':
      return <Comparaison n={pagina} />;
    case 'citation':
      return <Citation n={pagina} />;
    case 'sauvegarde':
      return <Sauvegarde n={pagina} />;
    case 'rappel':
      return <Rappel n={pagina} />;
    case 'instructions':
      return <Instructions n={pagina} />;
    case 'archive':
      return <Archive n={pagina} />;
    case 'tableaux':
      return <Tableaux n={pagina} />;
    case 'agents':
      return <Agents n={pagina} />;
    case 'documents':
      return <Documents n={pagina} />;
    case 'ecosysteme':
      return <Ecosysteme n={pagina} />;
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
