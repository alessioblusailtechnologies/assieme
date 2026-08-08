import { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile } from 'remotion';

/**
 * Schermate statiche dell'applicativo, per le card delle dimostrazioni sul
 * sito. Verranno sfocate: contano composizione, colori e densità, non il
 * dettaglio. Stessa shell e stessi token del FE usati in MemoriaViva.
 */

export const SHOT_W = 1260;
export const SHOT_H = 840;

const C = {
  page: '#FAF9F7',
  pageAlt: '#EEEDEA',
  surface: '#FFFFFF',
  line: '#E4E2DD',
  lineSoft: '#EEEDEA',
  text: '#1C1A15',
  text2: '#45423A',
  text3: '#767268',
  textMute: '#9B978B',
  accent: '#2F4B7C',
  pos: '#2E6B4F',
  posSoft: '#E9F1EC',
  neg: '#A63D2F',
  warn: '#8A6116',
  warnSoft: '#F9F1DE',
};

const F = {
  interfaccia: "'TWKGhost', Georgia, serif",
  lettura: "'Geist', 'Helvetica Neue', sans-serif",
};

const mono: React.CSSProperties = {
  fontFamily: F.interfaccia,
  fontSize: 12,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: C.text3,
};

const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    Promise.all([
      new FontFace('Geist', `url(${staticFile('fonts/GeistVF.woff2')})`, {
        weight: '100 900',
      }).load(),
      new FontFace('TWKGhost', `url(${staticFile('fonts/TWKGhost-Regular.woff2')})`, {
        weight: '400',
      }).load(),
      new FontFace('TWKGhost', `url(${staticFile('fonts/TWKGhost-Medium.woff2')})`, {
        weight: '500',
      }).load(),
    ]).then((fonts) => {
      for (const f of fonts) document.fonts.add(f);
      continueRender(handle);
    });
  }, [handle]);
};

/* Guscio compatto: barra a icone e barra superiore, come nell'app. */
const Shell: React.FC<{ attiva: number; children: React.ReactNode }> = ({ attiva, children }) => (
  <AbsoluteFill style={{ background: C.page, fontFamily: F.lettura }}>
    <div
      style={{
        position: 'absolute',
        left: 56,
        top: 52,
        right: 0,
        bottom: 0,
        background: C.surface,
      }}
    />
    {/* Barra laterale */}
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 56,
        height: SHOT_H,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: C.page,
        borderRight: `1px solid ${C.lineSoft}`,
      }}
    >
      <div style={{ display: 'grid', placeItems: 'center', height: 52 }}>
        <svg width={26} height={26} viewBox="0 0 28 28" style={{ borderRadius: 6 }}>
          <rect width="28" height="28" fill={C.accent} />
          <text
            x="14"
            y="14"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Georgia, serif"
            fontSize="18"
            fill="#fff"
          >
            V
          </text>
        </svg>
      </div>
      <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 34,
              height: 34,
              borderRadius: 7,
              background: i === attiva ? C.pageAlt : 'transparent',
              color: i === attiva ? C.text : C.text3,
            }}
          >
            <svg width={15} height={15} viewBox="0 0 16 16" fill="none">
              <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </div>
        ))}
      </div>
    </div>
    {/* Barra superiore */}
    <div
      style={{
        position: 'absolute',
        left: 56,
        top: 0,
        right: 0,
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        background: C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: F.interfaccia, fontSize: 15, color: C.text }}>Ciao, sono Velia.</span>
        <span style={{ width: 1, height: 18, background: C.line }} />
        <span style={{ fontSize: 14, color: C.text2 }}>Agenzia Ferrero</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ ...mono, textTransform: 'none', letterSpacing: '0.06em' }}>07/08/2026 18:12</span>
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 26,
            height: 26,
            borderRadius: 999,
            background: C.pageAlt,
            fontSize: 12,
            color: C.text2,
          }}
        >
          M
        </span>
      </div>
    </div>
    {/* Area di lavoro */}
    <div style={{ position: 'absolute', left: 56 + 36, top: 52 + 30, right: 36, bottom: 0 }}>{children}</div>
  </AbsoluteFill>
);

/* ---------------------------------------------------------------------------
 * Tabella di analisi: dieci prodotti a confronto, la fonte in ogni casella.
 * ------------------------------------------------------------------------ */

const PRODOTTI = ['AUTOPIÙ', 'Unipol', 'Generali', 'Allianz', 'AXA', 'Zurich'];
const RIGHE = [
  ['Massimale RCA', '€ 6,45M', '€ 25M', '€ 10M', '€ 26M', '€ 15M', '€ 20M'],
  ['Franchigia kasko', '€ 500', '€ 750', '€ 600', '€ 500', '€ 800', '€ 650'],
  ['Atti vandalici', '10%', '15%', '10%', '5%', '12%', '10%'],
  ['Infortuni conducente', 'Inclusa', 'No', 'Opz.', 'Inclusa', 'Opz.', 'Inclusa'],
  ['Cristalli', '€ 1.000', '€ 800', '€ 1.200', '€ 1.000', '€ 900', '€ 1.100'],
  ['Eventi naturali', 'Sì', 'Sì', 'Sì', 'Opz.', 'Sì', 'Sì'],
  ['Furto e incendio', 'A nuovo', 'Comm.', 'A nuovo', 'A nuovo', 'Comm.', 'A nuovo'],
  ['Assistenza', 'Base', 'Estesa', 'Base', 'Estesa', 'Base', 'Estesa'],
  ['Tutela legale', '€ 10k', '€ 15k', '€ 12k', '€ 10k', '€ 20k', '€ 15k'],
  ['Rivalsa', 'Sì', 'No', 'Sì', 'Sì', 'No', 'Opz.'],
];

export const TabellaStill: React.FC = () => {
  useFonts();
  return (
    <Shell attiva={1}>
      <div style={{ fontFamily: F.interfaccia, fontWeight: 500, fontSize: 26, color: C.text, marginBottom: 6 }}>
        Ramo auto — dieci prodotti a confronto
      </div>
      <div style={{ ...mono, marginBottom: 18 }}>54 garanzie · fonte citata in ogni casella</div>
      <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, overflow: 'hidden' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr repeat(6, 1fr)',
            background: C.pageAlt,
            borderBottom: `1px solid ${C.line}`,
            padding: '10px 14px',
            gap: '0 10px',
          }}
        >
          <span style={{ ...mono, fontSize: 11 }}>Garanzia</span>
          {PRODOTTI.map((p) => (
            <span key={p} style={{ ...mono, fontSize: 11 }}>
              {p}
            </span>
          ))}
        </div>
        {RIGHE.map((r, i) => (
          <div
            key={r[0]}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr repeat(6, 1fr)',
              padding: '11px 14px',
              gap: '0 10px',
              borderTop: i > 0 ? `1px solid ${C.lineSoft}` : 'none',
              fontSize: 14,
            }}
          >
            <span style={{ color: C.text2 }}>{r[0]}</span>
            {r.slice(1).map((v, k) => (
              <span key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ color: v === 'No' ? C.neg : v === 'Inclusa' || v === 'Estesa' ? C.pos : C.text }}>
                  {v}
                </span>
                <span style={{ ...mono, fontSize: 9, letterSpacing: '0.06em', color: C.textMute }}>
                  p.{(i * 7 + k * 3) % 40 + 2}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </Shell>
  );
};

/* ---------------------------------------------------------------------------
 * Agenti: il lavoro ricorrente che si ripete da solo.
 * ------------------------------------------------------------------------ */

const AGENTI = [
  {
    nome: 'Nuove edizioni dei set informativi',
    desc: 'Controlla le compagnie in archivio e segnala le edizioni aggiornate.',
    stato: 'PRONTO',
    quando: 'Ogni lunedì · 07:00',
    esito: 'Ultima esecuzione: 3 nuove edizioni segnalate',
  },
  {
    nome: 'Confronto preventivi in arrivo',
    desc: 'Confronta ogni preventivo ricevuto con la polizza in corso del cliente.',
    stato: 'IN CORSO',
    quando: 'A ogni documento nuovo',
    esito: 'In esecuzione da 40 secondi…',
  },
  {
    nome: 'Riepilogo settimanale per la direzione',
    desc: 'Prepara il riepilogo dei confronti della settimana, già impaginato.',
    stato: 'PRONTO',
    quando: 'Ogni venerdì · 18:00',
    esito: 'Ultima esecuzione: riepilogo consegnato',
  },
];

export const AgentiStill: React.FC = () => {
  useFonts();
  return (
    <Shell attiva={4}>
      <div style={{ fontFamily: F.interfaccia, fontWeight: 500, fontSize: 26, color: C.text, marginBottom: 6 }}>
        Agenti
      </div>
      <div style={{ ...mono, marginBottom: 18 }}>Il lavoro ricorrente, su pianificazione</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {AGENTI.map((a) => (
          <div
            key={a.nome}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 20,
              padding: '18px 22px',
              border: `1px solid ${C.lineSoft}`,
              borderRadius: 8,
              background: C.surface,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontFamily: F.interfaccia, fontWeight: 500, fontSize: 19, color: C.text }}>
                {a.nome}
              </span>
              <span style={{ fontSize: 14, color: C.text3 }}>{a.desc}</span>
              <span style={{ fontSize: 13.5, color: C.text2 }}>{a.esito}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flex: 'none' }}>
              <span
                style={{
                  ...mono,
                  fontSize: 10.5,
                  padding: '3px 9px',
                  background: a.stato === 'IN CORSO' ? C.warnSoft : C.posSoft,
                  color: a.stato === 'IN CORSO' ? C.warn : C.pos,
                }}
              >
                {a.stato}
              </span>
              <span style={{ ...mono, fontSize: 11, textTransform: 'none', letterSpacing: '0.05em' }}>
                {a.quando}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
};
