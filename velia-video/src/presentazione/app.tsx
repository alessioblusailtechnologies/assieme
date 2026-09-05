/**
 * L'interfaccia di Velia, ferma, per le diapositive.
 *
 * Non sono immagini: è la stessa interfaccia disegnata in markup, con gli
 * stessi token del FE e la stessa shell di MemoriaViva. È il motivo per cui
 * questa presentazione si fa con Remotion e non con un editor: le schermate
 * si scrivono, si correggono e si rifanno in un'altra lingua senza
 * rifotografare nulla.
 *
 * Qui c'è solo la scenografia: barra laterale, testata, area di lavoro e i
 * mattoni della conversazione. Cosa mostrano lo dicono le diapositive.
 */

import { C, F } from './base';

export const APP_W = 1180;
export const APP_H = 648;

const SIDEBAR_W = 62;
const TOPBAR_H = 52;

const mono: React.CSSProperties = {
  fontFamily: F.interfaccia,
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: C.text3,
};

/* ------------------------------------------------------------------ icone */

const tratto = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' } as const;

export const IconaDoc: React.FC<{ size?: number }> = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path
      d="M4 1.5h5.2L13 5.3V14a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 4 14V1.5Z"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <path d="M9 1.5V5.5H13" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

/** I glifi della barra laterale, nello stesso ordine del prodotto. */
const GlifoNav: React.FC<{ tipo: string }> = ({ tipo }) => {
  const s = 16;
  switch (tipo) {
    case 'chat':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <path d="M2 3.5h12v7.5H6L3 13.5v-2.5H2z" {...tratto} strokeLinejoin="round" />
        </svg>
      );
    case 'tabelle':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" {...tratto} />
          <path d="M2 6.5h12M6.5 3v10" {...tratto} />
        </svg>
      );
    case 'agenti':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5.5" {...tratto} />
          <path
            d="M8 2.5V0.8M5.8 6.8h.01M10.2 6.8h.01M5.5 10a3.4 3.4 0 0 0 5 0"
            {...tratto}
            strokeLinecap="round"
          />
        </svg>
      );
    case 'memoria':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="5" cy="5" r="1.6" fill="currentColor" />
          <circle cx="11.5" cy="7" r="1.2" fill="currentColor" />
          <circle cx="7" cy="11.5" r="1.2" fill="currentColor" />
          <path d="M6 6l4.5 1M6 6l.8 4.3M11 8l-3.4 3" {...tratto} strokeWidth="0.9" />
        </svg>
      );
    case 'impostazioni':
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="2.2" {...tratto} />
          <path
            d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4"
            {...tratto}
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 16 16">
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...tratto} />
          <path d="M5.5 6h5M5.5 9h5" {...tratto} strokeLinecap="round" />
        </svg>
      );
  }
};

const NAV = ['chat', 'tabelle', 'archivio', 'archivio', 'agenti', 'memoria', 'impostazioni'];

/* ------------------------------------------------------------- la cornice */

/**
 * La finestra dell'applicativo. `attiva` è il glifo acceso nella barra
 * laterale, `percorso` la briciola in testata.
 */
export const Schermata: React.FC<{
  attiva?: string;
  percorso: string;
  azioni?: string[];
  children: React.ReactNode;
}> = ({ attiva = 'chat', percorso, azioni, children }) => (
  <div
    style={{
      width: APP_W,
      height: APP_H,
      background: C.page,
      border: `1px solid ${C.line}`,
      borderRadius: 10,
      overflow: 'hidden',
      display: 'flex',
      fontFamily: F.lettura,
      boxShadow: '0 18px 48px rgba(28,26,21,0.10)',
    }}
  >
    {/* barra laterale */}
    <div
      style={{
        width: SIDEBAR_W,
        borderRight: `1px solid ${C.lineSoft}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: C.page,
      }}
    >
      <div style={{ display: 'grid', placeItems: 'center', height: TOPBAR_H }}>
        <svg width={26} height={26} viewBox="0 0 28 28" style={{ borderRadius: 6 }}>
          <rect width="28" height="28" fill={C.accent} />
          <text
            x="14"
            y="14"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="Georgia, serif"
            fontSize="17"
            fill="#ffffff"
          >
            V
          </text>
        </svg>
      </div>
      <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {NAV.map((n, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 34,
              height: 34,
              borderRadius: 8,
              background: n === attiva && i === NAV.indexOf(attiva) ? C.pageAlt : 'transparent',
              color: n === attiva && i === NAV.indexOf(attiva) ? C.text : C.textMute,
            }}
          >
            <GlifoNav tipo={n} />
          </div>
        ))}
      </div>
    </div>

    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* testata */}
      <div
        style={{
          height: TOPBAR_H,
          borderBottom: `1px solid ${C.lineSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          background: C.page,
        }}
      >
        <span style={{ ...mono, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'none', color: C.text3 }}>
          {percorso}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {azioni?.map((a) => (
            <span
              key={a}
              style={{
                border: `1px solid ${C.line}`,
                borderRadius: 6,
                padding: '5px 11px',
                fontSize: 12.5,
                color: C.text2,
                background: C.surface,
              }}
            >
              {a}
            </span>
          ))}
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 26,
              height: 26,
              borderRadius: 999,
              background: C.pageAlt,
              color: C.text2,
              fontSize: 12,
            }}
          >
            M
          </span>
        </div>
      </div>

      {/* area di lavoro */}
      <div style={{ flex: 1, background: C.surface, padding: 22, minHeight: 0, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  </div>
);

/* --------------------------------------------------- mattoni della chat */

export const BollaUtente: React.FC<{ testo: string; allegati?: string[] }> = ({
  testo,
  allegati,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 }}>
    <div
      style={{
        background: C.pageAlt,
        borderRadius: 12,
        padding: '11px 16px',
        fontSize: 15,
        lineHeight: 1.5,
        color: C.text,
        maxWidth: '76%',
      }}
    >
      {testo}
    </div>
    {allegati && (
      <div style={{ display: 'flex', gap: 7 }}>
        {allegati.map((a) => (
          <span
            key={a}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 11px',
              borderRadius: 999,
              border: `1px solid ${C.line}`,
              background: C.surface,
              fontSize: 12.5,
              color: C.text3,
            }}
          >
            <IconaDoc />
            {a}
          </span>
        ))}
      </div>
    )}
  </div>
);

export const BollaAssistente: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      border: `1px solid ${C.lineSoft}`,
      borderRadius: 12,
      padding: '15px 18px',
      background: C.surface,
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      fontSize: 15,
      lineHeight: 1.55,
      color: C.text,
    }}
  >
    {children}
  </div>
);

/** Le fonti sotto una risposta: è la promessa del prodotto, resa visibile. */
export const Fonti: React.FC<{ etichetta: string; voci: string[] }> = ({ etichetta, voci }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
    <span style={{ ...mono }}>{etichetta}</span>
    {voci.map((v) => (
      <span
        key={v}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 11px',
          borderRadius: 999,
          border: `1px solid ${C.accent}33`,
          background: `${C.accent}0F`,
          fontFamily: F.interfaccia,
          fontSize: 12.5,
          color: C.accent,
        }}
      >
        <IconaDoc size={12} />
        {v}
      </span>
    ))}
  </div>
);

/** Il cartellino «Mémoire»: dice che una regola del cabinet è stata applicata. */
export const EtichettaMemoria: React.FC<{ etichetta: string; testo: string }> = ({
  etichetta,
  testo,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '9px 13px',
      borderRadius: 8,
      background: C.pageAlt,
      borderLeft: `2px solid ${C.accent}`,
    }}
  >
    <span style={{ ...mono, color: C.accent }}>{etichetta}</span>
    <span style={{ fontSize: 13.5, color: C.text2 }}>{testo}</span>
  </div>
);

/** La tabella di confronto, con i toni delle celle. */
export const Tabella: React.FC<{
  colonne: string[];
  righe: { label: string; celle: { v: string; tono?: 'pos' | 'neg' }[] }[];
  compatta?: boolean;
}> = ({ colonne, righe, compatta = false }) => {
  const colore = (t?: 'pos' | 'neg') => (t === 'pos' ? C.pos : t === 'neg' ? C.neg : C.text);
  const griglia = `1.5fr ${colonne
    .slice(1)
    .map(() => '1fr')
    .join(' ')}`;
  return (
    <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: griglia,
          gap: 12,
          padding: compatta ? '8px 14px' : '10px 16px',
          background: C.pageAlt,
        }}
      >
        {colonne.map((c) => (
          <span key={c} style={{ ...mono, fontSize: 10.5 }}>
            {c}
          </span>
        ))}
      </div>
      {righe.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: 'grid',
            gridTemplateColumns: griglia,
            gap: 12,
            padding: compatta ? '7px 14px' : '9px 16px',
            borderTop: i === 0 ? 'none' : `1px solid ${C.lineSoft}`,
            fontSize: compatta ? 12.5 : 14,
          }}
        >
          <span style={{ color: C.text2 }}>{r.label}</span>
          {r.celle.map((c, j) => (
            <span key={j} style={{ color: colore(c.tono) }}>
              {c.v}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

/** La barra di composizione in fondo alla chat. */
export const Composer: React.FC<{ testo: string }> = ({ testo }) => (
  <div
    style={{
      marginTop: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      border: `1px solid ${C.line}`,
      borderRadius: 10,
      padding: '11px 14px',
      background: C.surface,
    }}
  >
    <span style={{ color: C.textMute, fontSize: 15 }}>@</span>
    <span style={{ flex: 1, color: C.textMute, fontSize: 14.5 }}>{testo}</span>
    <span
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 28,
        height: 28,
        borderRadius: 7,
        background: C.accent,
        color: '#fff',
        fontSize: 13,
      }}
    >
      ➤
    </span>
  </div>
);

/** Un pannello con intestazione, per le schermate che non sono chat. */
export const Pannello: React.FC<{
  titolo: string;
  azione?: string;
  children: React.ReactNode;
  flex?: number;
}> = ({ titolo, azione, children, flex }) => (
  <div
    style={{
      flex,
      minHeight: 0,
      border: `1px solid ${C.lineSoft}`,
      borderRadius: 9,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: `1px solid ${C.lineSoft}`,
        background: C.page,
      }}
    >
      <span style={{ ...mono, fontSize: 10.5 }}>{titolo}</span>
      {azione && (
        <span style={{ fontSize: 12, color: C.accent, fontFamily: F.interfaccia }}>{azione}</span>
      )}
    </div>
    <div style={{ flex: 1, minHeight: 0, padding: 14, overflow: 'hidden' }}>{children}</div>
  </div>
);

export const monoStile = mono;
