// Le tavole di stampa della box Velia, una voce per pezzo.
// Ogni pezzo ha il formato al rifilo (mm) e una o più pagine (fronte, retro,
// matrici a caldo, guide). Il generatore aggiunge abbondanza, crocini,
// etichetta tecnica e produce PDF e PNG. Vedi genera-tavole.mjs.

const DATA = '20/08/2026';

/* Dati d'esempio per i pezzi a dato variabile (agenzia, persona, domanda). */
export const ESEMPIO = {
  agenzia: 'Agenzia Bianchi & Partner',
  slug: 'bianchi-partner',
  persona: 'Gentile dott.ssa Bianchi,',
  codice: '48 21 07',
  url: 'sonovelia.it/benvenuto/bianchi-partner',
  data: '3 settembre 2026',
  domanda:
    'Nella multirischi Impresa Sicura, la garanzia eventi atmosferici copre i pannelli fotovoltaici installati sul tetto del capannone?',
  risposta: [
    'Sì, ma con due condizioni. La garanzia eventi atmosferici opera sui pannelli fotovoltaici solo se sono stati dichiarati in polizza come «impianti fissi» e il danno deriva da grandine, vento o tromba d’aria. Resta escluso il danno da neve se il carico supera quello previsto dal progetto dell’impianto.',
    'La vostra agenzia nel 2025 ha gestito un caso analogo (sinistro Rossi Srl) applicando lo scoperto del 10% previsto dall’art. 14: la stessa regola vale qui.',
  ],
  fonte: 'Condizioni Impresa Sicura, ed. 03/2025, art. 12 e 14',
  memoria: 'Nota pratica sinistro Rossi Srl, 11/2025',
};

const firma = (size) =>
  `<span style="font-family:var(--ft);font-weight:500;font-size:${size};letter-spacing:-.015em">sono Velia<span class="dot"></span></span>`;

const ciao = (size, color = 'var(--avorio)', dotColor = 'var(--blu-su-scuro)', lh = 1.02) =>
  `<div style="font-family:var(--ft);font-weight:500;font-size:${size};line-height:${lh};letter-spacing:-.025em;color:${color}">Ciao,<br>sono Velia<span class="dot" style="background:${dotColor}"></span></div>`;

/* ------------------------------------------------------------------ */
/* Coperchio: piano superiore. Rivestimento scuro, tutto a caldo.      */
/* ------------------------------------------------------------------ */
const coperchio = (id, W, H, fs, nome) => {
  const mx = Math.round(W * 0.095); // margine sinistro del testo
  const corner = (H * 0.02).toFixed(2) + 'mm';
  const cornerSize = Math.max(3, H * 0.019).toFixed(2) + 'mm';
  const pad = Math.round(H * 0.055);
  const inner = (fg, bg, dot, corners) => `
    <div class="full" style="background:${bg}"></div>
    <div class="trim" style="padding:0 ${mx}mm">
      <div style="position:absolute;left:${mx}mm;top:50%;transform:translateY(-56%)">${ciao(fs + 'mm', fg, dot)}</div>
      <div style="position:absolute;left:${pad}mm;bottom:${pad}mm;font:${cornerSize}/1 var(--ft);letter-spacing:.04em;color:${corners}">ciao@sonovelia.it</div>
      <div style="position:absolute;right:${pad}mm;bottom:${pad}mm;font:${cornerSize}/1 var(--ft);letter-spacing:.04em;color:${corners}">sonovelia.it</div>
    </div>`;
  return {
    id,
    titolo: `Coperchio ${nome}`,
    w: W,
    h: H,
    pagine: [
      { lab: `anteprima · rivestimento scuro, scritte a caldo avorio, punto a caldo blu`, html: inner('var(--avorio)', '#1c1a15', 'var(--blu-su-scuro)', 'rgba(250,249,247,.7)') },
      { lab: `matrice a caldo AVORIO · nero = lamina (testo e angoli) · 1:1`, html: inner('#000', '#fff', 'transparent', '#000') },
      { lab: `matrice a caldo BLU · nero = lamina (solo il punto) · 1:1`, html: inner('transparent', '#fff', '#000', 'transparent') },
    ],
    note: `Piano superiore del coperchio, ${W} × ${H} mm al rifilo. La fustella del rivestimento (fianchi e risvolti) la fornisce lo scatolificio: gli elementi vanno riposizionati sulla fustella mantenendo le distanze dai bordi di questa tavola.`,
  };
};

const internoCoperchio = (id, W, H, nome) => ({
  id,
  titolo: `Interno coperchio ${nome}`,
  w: W,
  h: H,
  pagine: [
    {
      lab: 'carta avorio · 1 colore, blu · 1:1',
      html: `<div class="full paper-avorio"></div>
        <div class="trim" style="display:grid;place-items:center">
          <div style="font-family:var(--ft);font-weight:500;font-size:${(H * 0.024).toFixed(1)}mm;color:var(--blu);letter-spacing:-.01em">Quello che risolvete oggi, domani è già risolto.</div>
        </div>`,
    },
  ],
  note: `Pannello interno del coperchio, ${W} × ${H} mm. Solo la frase della memoria, centrata, in blu.`,
});

/* ------------------------------------------------------------------ */
/* Velina: la Biblioteca degli astratti, ferma, in un colore.          */
/* ------------------------------------------------------------------ */
const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const gauss = (d, sigma) => Math.exp(-(d * d) / (2 * sigma * sigma));

const velinaSvg = (W, H) => {
  // Gli «Agenti» degli astratti: orbite che chiudono giri interi, un punto per agente.
  const parts = [];
  const systems = [
    [118, 150, 3], [368, 260, 4], [130, 430, 3], [372, 560, 3], [250, 660, 2],
  ];
  let k = 0;
  systems.forEach(([cx, cy, n]) => {
    for (let i = 0; i < n; i++) {
      const r = 26 + i * 27 + rnd(k) * 9;
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="none" stroke="#2f4b7c" stroke-width="0.45" opacity="${(0.15 + rnd(k + 3) * 0.12).toFixed(2)}"/>`);
      const dots = 1 + Math.floor(rnd(k + 7) * 2);
      for (let d = 0; d < dots; d++) {
        const a = rnd(k + 11 + d * 5) * Math.PI * 2;
        parts.push(`<circle cx="${(cx + Math.cos(a) * r).toFixed(1)}" cy="${(cy + Math.sin(a) * r).toFixed(1)}" r="${(1.3 + rnd(k + 17 + d) * 1.1).toFixed(2)}" fill="#2f4b7c" opacity="${(0.4 + rnd(k + 23 + d) * 0.45).toFixed(2)}"/>`);
      }
      k += 31;
    }
    parts.push(`<circle cx="${cx}" cy="${cy}" r="2.4" fill="#2f4b7c" opacity="0.8"/>`);
  });
  for (let i = 0; i < 46; i++) {
    parts.push(`<circle cx="${(rnd(900 + i) * W).toFixed(1)}" cy="${(rnd(950 + i) * H).toFixed(1)}" r="0.7" fill="#2f4b7c" opacity="${(0.12 + rnd(970 + i) * 0.18).toFixed(2)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0">${parts.join('')}</svg>`;
};

const velina = {
  id: 'velina',
  titolo: 'Velina',
  w: 500,
  h: 700,
  pagine: [
    {
      lab: 'velina 17 g avorio · 1 colore, blu (tinta piatta, con retini) · motivo «Agenti», al vivo',
      html: `<div class="full paper-avorio"></div><div class="full">${velinaSvg(506, 706)}</div>`,
    },
  ],
  note: 'Gli «Agenti» degli astratti del sito, fermi: orbite che chiudono giri interi, un punto per ogni agente sulle operazioni che tornano. Un solo colore a retino; il foglio si piega in quattro attorno al contenuto.',
};

/* ------------------------------------------------------------------ */
/* Sigillo Ø 40 mm.                                                    */
/* ------------------------------------------------------------------ */
const sigillo = {
  id: 'sigillo',
  titolo: 'Sigillo',
  w: 40,
  h: 40,
  pagine: [
    {
      lab: 'adesivo in carta naturale · fondo blu al vivo, V in bianco (riserva) · fustella circolare Ø 40',
      html: `<div class="full" style="background:var(--blu)"></div>
        <div class="trim" style="display:grid;place-items:center"><span style="font-family:var(--fv);font-size:24mm;line-height:1;color:#fff;transform:translateY(-4%)">V</span></div>`,
    },
    {
      lab: 'guida fustella · Ø 40 mm · non stampare',
      html: `<div class="trim"><div class="guide" style="inset:0;border-width:0.2mm;border-radius:50%"></div></div>`,
    },
  ],
  note: 'Il marchio della chat (la V serif su blu) diventa il sigillo che chiude il coperchio.',
};

/* ------------------------------------------------------------------ */
/* Lettera: carta intestata A4, piegata a metà in A5.                  */
/* ------------------------------------------------------------------ */
const letteraCorpo = `
  <p>${ESEMPIO.persona}</p>
  <p>le scrivo perché l’agenzia Bianchi &amp; Partner lavora con tre compagnie e una casistica che in pochi hanno. Velia è un’assistente che ricorda quello che la vostra agenzia ha già risolto, prepara risposte e documenti già impaginati col vostro marchio, e tiene d’occhio le operazioni che tornano: rinnovi, quietanze, scadenze.</p>
  <p>Il foglio qui sotto è la risposta che avrebbe dato a voi, oggi, su una domanda del ramo property. Leggetelo con il vostro occhio, non col nostro.</p>
  <p>Se vi incuriosisce, la card in fondo alla scatola apre una demo sui vostri documenti, entro quindici giorni.</p>
  <p style="margin-top:7mm">Alessio De Vincentis<br><span style="color:var(--mute);font-size:.9em">Blusail Technologies</span></p>`;

const letteraPagina = (conCorpo) => `
  <div class="full paper-avorio"></div>
  <div class="trim" style="padding:18mm 16mm 14mm 16mm">
    <div style="font-family:var(--ft);font-weight:500;font-size:7.4mm;line-height:1.05;letter-spacing:-.02em">Ciao, sono Velia<span class="dot"></span></div>
    <div style="font-family:var(--ft);font-size:3mm;color:var(--mute);margin-top:1.8mm">o meglio: sono Alessio, che l’ha costruita.</div>
    <div style="margin-top:${conCorpo ? 14 : 0}mm;font-family:var(--fl);font-size:3.3mm;line-height:1.55;max-width:116mm;display:grid;gap:2.8mm">${conCorpo ? letteraCorpo : ''}</div>
    <div style="position:absolute;left:16mm;right:16mm;bottom:12mm;display:flex;justify-content:space-between;font-family:var(--ft);font-weight:500;font-size:2.5mm;letter-spacing:.14em;text-transform:uppercase;color:var(--mute)">
      <span>Blusail Technologies</span><span>ciao@sonovelia.it&nbsp;&nbsp;·&nbsp;&nbsp;sonovelia.it</span>
    </div>
  </div>`;

const lettera = {
  id: 'lettera',
  titolo: 'Lettera',
  w: 148,
  h: 210,
  pagine: [
    { lab: 'A5 su 160 g avorio · nero + blu · testo d’esempio, dato variabile', html: letteraPagina(true) },
    { lab: 'A5 su 160 g avorio · sola intestazione, per la lettera scritta a mano (Box Firma)', html: letteraPagina(false) },
  ],
  note: 'Carta intestata A5, foglio piano (non piegato): il saluto grande, la riga «o meglio…», il corpo in Geist. La pagina 2 è l’intestazione vuota per le lettere a mano del Cerchio 1.',
};

/* ------------------------------------------------------------------ */
/* Il foglio di Velia, A5.                                             */
/* ------------------------------------------------------------------ */
const foglioVelia = {
  id: 'foglio-di-velia',
  titolo: 'Il foglio di Velia',
  w: 148,
  h: 210,
  pagine: [
    {
      lab: 'A5 su 170 g avorio · quadricromia (cartellini) · dato variabile per agenzia o ramo',
      html: `<div class="full paper-avorio"></div>
      <div class="trim" style="padding:14mm 14mm 12mm">
        <div style="display:flex;justify-content:space-between;align-items:baseline" class="eyebrow"><span style="font-size:2.5mm">Il foglio di Velia</span><span style="font-size:2.5mm">${ESEMPIO.agenzia}</span></div>
        <div style="margin-top:14mm;position:relative;padding-left:6mm;font-family:var(--ft);font-weight:500;font-size:4.9mm;line-height:1.3;letter-spacing:-.01em">
          <span style="position:absolute;left:0;top:1.9mm;width:2.2mm;height:2.2mm;border-radius:50%;background:var(--blu)"></span>${ESEMPIO.domanda}
        </div>
        <div style="margin-top:7mm;border:0.25mm solid var(--linea);border-radius:1.2mm;padding:5.5mm 6mm 5mm;font-family:var(--fl);font-size:3.35mm;line-height:1.55;display:grid;gap:2.6mm">
          <p>${ESEMPIO.risposta[0]}</p>
          <p>${ESEMPIO.risposta[1]}</p>
          <div style="display:flex;gap:2mm;flex-wrap:wrap;margin-top:1.5mm;font-size:2.6mm">
            <span class="chip mem"><b>MEMORIA</b>${ESEMPIO.memoria}</span>
            <span class="chip"><b>FONTE</b>${ESEMPIO.fonte}</span>
          </div>
        </div>
        <div style="position:absolute;left:14mm;bottom:24mm">${firma('5mm')}</div>
        <div style="position:absolute;left:14mm;right:14mm;bottom:12mm;display:flex;justify-content:space-between;font-family:var(--fl);font-size:2.6mm;color:var(--mute)">
          <span>Risposta generata con Velia il ${ESEMPIO.data}</span><span>sonovelia.it</span>
        </div>
      </div>`,
    },
  ],
  note: 'La chat del prodotto su carta: domanda, risposta, e per primo il cartellino MEMORIA, il richiamo al caso che l’agenzia aveva già risolto. La cornice della risposta è a filetto (niente fondo bianco: la carta è già avorio).',
};

/* ------------------------------------------------------------------ */
/* Card d’accesso 85 × 55, fronte e retro.                           */
/* ------------------------------------------------------------------ */
const cardAccesso = {
  id: 'card-accesso',
  titolo: 'Card d’accesso',
  w: 85,
  h: 55,
  pagine: [
    {
      lab: 'fronte · 350 g avorio · nero + blu · QR e codice a dato variabile · angoli vivi',
      html: `<div class="full paper-avorio"></div>
      <div class="trim" style="padding:6mm 6.5mm;display:grid;grid-template-columns:1fr 23mm;gap:4mm">
        <div style="display:flex;flex-direction:column">
          <span class="eyebrow" style="font-size:2.2mm">Il vostro accesso</span>
          <div style="font-family:var(--ft);font-size:3.3mm;line-height:1.3;margin-top:2.2mm">sonovelia.it/benvenuto/<br>${ESEMPIO.slug}</div>
          <div style="font-family:var(--ft);font-weight:500;font-size:5.2mm;letter-spacing:.16em;margin-top:3mm;font-variant-numeric:tabular-nums">${ESEMPIO.codice}</div>
          <div style="font-family:var(--fl);font-size:2.25mm;line-height:1.35;color:var(--mute);margin-top:auto;max-width:46mm">Una demo sui vostri documenti, entro quindici giorni da quando lo chiedete.</div>
        </div>
        <div style="width:23mm;height:23mm;align-self:start">__QR__</div>
      </div>`,
    },
    {
      lab: 'retro · 350 g avorio · nero + blu',
      html: `<div class="full paper-avorio"></div>
      <div class="trim" style="display:grid;place-items:center">
        <div style="text-align:center">${firma('7mm')}<div style="font-family:var(--fl);font-size:2.3mm;color:var(--mute);margin-top:2.5mm">ciao@sonovelia.it</div></div>
      </div>`,
    },
  ],
  note: 'Un QR con il parametro dell’agenzia, il codice a sei cifre per chi preferisce scrivere. Il QR d’esempio punta a sonovelia.it/benvenuto/' + ESEMPIO.slug + '.',
};

/* ------------------------------------------------------------------ */
/* Card delle tre promesse 100 × 150, fronte e retro.                  */
/* ------------------------------------------------------------------ */
const promesse = [
  ['La memoria dell’agenzia', 'Quello che avete già risolto, non si risolve due volte.'],
  ['Documenti pronti da mandare', 'Già impaginati, col vostro marchio.'],
  ['Gli agenti sui cicli', 'Rinnovi, quietanze, scadenze: Velia li vede arrivare.'],
];
const cardPromesse = {
  id: 'card-promesse',
  titolo: 'Card delle tre promesse',
  w: 100,
  h: 150,
  pagine: [
    {
      lab: 'fronte · 350 g avorio · nero + blu',
      html: `<div class="full paper-avorio"></div>
      <div class="trim" style="padding:12mm 11mm 11mm;display:flex;flex-direction:column">
        <span class="eyebrow" style="font-size:2.5mm">Le tre promesse</span>
        <div style="margin-top:16mm;display:grid;gap:12mm">
          ${promesse.map(([t, s]) => `<div style="position:relative;padding-left:6mm">
            <span style="position:absolute;left:0;top:1.8mm;width:2.1mm;height:2.1mm;border-radius:50%;background:var(--blu)"></span>
            <div style="font-family:var(--ft);font-weight:500;font-size:4.6mm;line-height:1.2;letter-spacing:-.01em">${t}</div>
            <div style="font-family:var(--fl);font-size:3mm;line-height:1.45;color:var(--mute);margin-top:1.2mm">${s}</div>
          </div>`).join('')}
        </div>
        <div style="margin-top:auto"><div style="font-family:var(--fl);font-size:2.5mm;line-height:1.4;color:var(--mute);margin-bottom:4mm;max-width:70mm">E la fonte citata in ogni passaggio. Ma quella, ormai, la diamo per scontata.</div>${firma('5.2mm')}</div>
      </div>`,
    },
    {
      lab: 'retro · 350 g avorio · nero + blu',
      html: `<div class="full paper-avorio"></div>
      <div class="trim" style="display:grid;place-items:center">
        <div style="text-align:center;display:grid;gap:5mm;justify-items:center">
          <span class="marchio" style="width:14mm;height:14mm;font-size:9mm;line-height:1">V</span>
          <div style="font-family:var(--fl);font-size:2.6mm;color:var(--mute);line-height:1.5">sonovelia.it<br>ciao@sonovelia.it</div>
        </div>
      </div>`,
    },
  ],
  note: 'Nella Busta fa il lavoro di tutta la scatola. Il retro porta il marchio della chat.',
};

/* ------------------------------------------------------------------ */
/* Cartellino MEMORIA 35 × 70, foro Ø 4 a 6 mm dal bordo alto.         */
/* ------------------------------------------------------------------ */
const cartellino = {
  id: 'cartellino-memoria',
  titolo: 'Cartellino MEMORIA',
  w: 35,
  h: 70,
  pagine: [
    {
      lab: 'fronte · 300 g bianco · nero · foro Ø 4 mm (guida magenta, non stampare)',
      html: `<div class="full paper-bianco"></div>
      <div class="trim" style="padding:14mm 4mm 5mm;display:flex;flex-direction:column;justify-content:space-between">
        <span style="align-self:flex-start;border:0.2mm solid var(--linea-soft);border-radius:0.6mm;padding:1.1mm 1.6mm;font-family:var(--ft);font-weight:500;font-size:2.3mm;letter-spacing:.18em;color:#45423a">MEMORIA</span>
        <span class="marchio" style="width:5mm;height:5mm;font-size:3.3mm;line-height:1">V</span>
        <div class="guide" style="left:calc(50% - 2.1mm);top:4mm;width:4.2mm;height:4.2mm;border-width:0.2mm;border-radius:50%"></div>
      </div>`,
    },
    {
      lab: 'retro · 300 g bianco · nero',
      html: `<div class="full paper-bianco"></div>
      <div class="trim" style="padding:14mm 4mm 5mm;display:flex;flex-direction:column;justify-content:space-between">
        <div style="font-family:var(--fl);font-size:2.7mm;line-height:1.45;color:#45423a">Quello che la vostra agenzia ha già risolto, Velia lo ricorda.</div>
        <span style="font-family:var(--fl);font-size:2.1mm;color:var(--mute)">sonovelia.it</span>
        <div class="guide" style="left:calc(50% - 2.1mm);top:4mm;width:4.2mm;height:4.2mm;border-width:0.2mm;border-radius:50%"></div>
      </div>`,
    },
  ],
  note: 'Replica il cartellino MEMORIA delle risposte. Cordino di cotone nel foro, appeso al taccuino.',
};

/* ------------------------------------------------------------------ */
/* Taccuino A5: copertina a secco, prima pagina, pagina interna.       */
/* ------------------------------------------------------------------ */
const righe = () => {
  const out = [];
  for (let y = 22; y <= 196; y += 7.5) out.push(`<div style="position:absolute;left:14mm;right:10mm;top:${y}mm;height:0.15mm;background:var(--linea)"></div>`);
  return out.join('');
};
const taccuino = {
  id: 'taccuino',
  titolo: 'Taccuino',
  w: 148,
  h: 210,
  pagine: [
    {
      lab: 'copertina · matrice a SECCO (nero = bassorilievo) · 1:1 · copertina rigida avorio',
      html: `<div class="full" style="background:#fff"></div>
      <div class="trim" style="display:grid;place-items:center"><span style="font-family:var(--fv);font-size:46mm;line-height:1;color:#000;transform:translateY(-3%)">V</span></div>`,
    },
    {
      lab: 'prima pagina · 90 g avorio · nero + blu',
      html: `<div class="full paper-avorio"></div>
      <div class="trim" style="padding:58mm 18mm 14mm">
        <div style="font-family:var(--ft);font-weight:500;font-size:5.6mm;line-height:1.25;letter-spacing:-.015em;max-width:100mm">Questo taccuino ha una colonna in più.<br>Si chiama La prossima volta.</div>
        <div style="font-family:var(--fl);font-size:3.1mm;line-height:1.5;color:var(--mute);margin-top:6mm;max-width:96mm">Quando chiudete un caso, annotate a lato quello che vi servirà quando ricapita. È il lavoro che Velia fa da sola, su tutto l’archivio dell’agenzia.</div>
        <div style="position:absolute;left:18mm;bottom:14mm">${firma('4.2mm')}</div>
      </div>`,
    },
    {
      lab: 'pagina interna (96 pagine) · 90 g avorio · 1 colore, grigio caldo + blu per il titolo',
      html: `<div class="full paper-avorio"></div>
      <div class="trim">
        ${righe()}
        <div style="position:absolute;left:104mm;top:14mm;bottom:10mm;width:0.15mm;background:var(--linea)"></div>
        <div class="eyebrow" style="position:absolute;left:107mm;top:15mm;font-size:2.1mm;line-height:1.35;color:var(--blu)">La prossima<br>volta</div>
      </div>`,
    },
  ],
  note: 'A5 rilegato, 96 pagine. La copertina ha solo la V a secco; la colonna «La prossima volta» a destra di ogni pagina è l’idea del taccuino: quello che si annota oggi serve quando il caso ricapita.',
};

/* ------------------------------------------------------------------ */
/* Calendario perpetuo: le carte, 105 × 74. Base in legno (incisioni).  */
/* ------------------------------------------------------------------ */
const calendario = {
  id: 'calendario',
  titolo: 'Calendario perpetuo',
  w: 105,
  h: 74,
  pagine: [
    {
      lab: 'carta del mese · 350 g avorio · nero + blu · esempio: il set completo sono 12 mesi',
      html: `<div class="full paper-avorio"></div>
      <div class="trim" style="display:flex;flex-direction:column;padding:8mm 9mm 7mm">
        <span class="eyebrow" style="font-size:2.2mm">Le operazioni che tornano</span>
        <div style="margin:auto 0;font-family:var(--ft);font-weight:500;font-size:13mm;line-height:1;letter-spacing:-.02em">Settembre</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-family:var(--fl);font-size:2.4mm;color:var(--mute)">rinnovi · quietanze · scadenze</span>${firma('3.4mm')}</div>
      </div>`,
    },
    {
      lab: 'carta del giorno · 350 g avorio · nero · esempio: il set completo sono 31 giorni',
      html: `<div class="full paper-avorio"></div>
      <div class="trim" style="display:grid;place-items:center">
        <div style="font-family:var(--ft);font-weight:500;font-size:40mm;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums">12</div>
      </div>`,
    },
  ],
  note: 'Calendario perpetuo da scrivania: base in legno incisa (vedi tavola incisioni) e carte intercambiabili 105 × 74. È l’oggetto delle operazioni cicliche: i rinnovi tornano ogni anno, gli agenti di Velia li vedono arrivare. Il set completo (12 mesi e 31 giorni) si genera da questo stesso file. Solo Box Firma.',
};

/* ------------------------------------------------------------------ */
/* Fascetta della pausa 220 × 45.                                      */
/* ------------------------------------------------------------------ */
const fascetta = {
  id: 'fascetta-pausa',
  titolo: 'Fascetta della pausa',
  w: 220,
  h: 45,
  pagine: [
    {
      lab: '200 g avorio · nero + blu · si chiude sul retro con un punto di colla',
      html: `<div class="full paper-avorio"></div>
      <div class="trim" style="display:grid;grid-template-columns:1fr auto;align-items:center;padding:0 14mm">
        <div style="font-family:var(--ft);font-weight:500;font-size:6.2mm;letter-spacing:-.015em">Il quarto d’ora che Velia vi restituisce.</div>
        <div>${firma('4mm')}</div>
      </div>`,
    },
  ],
  note: 'Avvolge il tè o il cioccolato. Facoltativa nella Premium.',
};

/* ------------------------------------------------------------------ */
/* Timbro 47 × 18 e incisioni: matrici in nero.                        */
/* ------------------------------------------------------------------ */
const timbro = {
  id: 'timbro',
  titolo: 'Timbro «In memoria»',
  w: 47,
  h: 18,
  pagine: [
    {
      lab: 'matrice timbro autoinchiostrante 47 × 18 · nero = gomma · inchiostro blu',
      html: `<div class="full" style="background:#fff"></div>
      <div class="trim" style="display:grid;grid-template-columns:auto 1fr;gap:3mm;align-items:center;padding:0 3mm">
        <span style="display:grid;place-items:center;width:10mm;height:10mm;border:0.5mm solid #000;border-radius:18%;font-family:var(--fv);font-size:6.8mm;line-height:1;color:#000">V</span>
        <div style="font-family:var(--ft);font-weight:500;font-size:4.1mm;line-height:1.15;letter-spacing:.1em;color:#000">IN MEMORIA</div>
      </div>`,
    },
  ],
  note: 'Solo Box Firma. Quando una pratica si chiude, si timbra e si archivia: da lì Velia la ricorda.',
};

const incisioni = {
  id: 'incisioni',
  titolo: 'Incisioni (calendario, penna)',
  w: 120,
  h: 40,
  pagine: [
    {
      lab: 'vettori per incisione laser · 1:1 · nero = inciso',
      html: `<div class="full" style="background:#fff"></div>
      <div class="trim" style="padding:6mm 8mm;display:grid;grid-template-columns:1fr auto;align-items:center;gap:10mm">
        <div>
          <div style="font-family:var(--ft);font-weight:500;font-size:5mm;letter-spacing:-.015em;color:#000">sono Velia.</div>
          <div style="font-family:var(--fl);font-size:2.1mm;color:#000;margin-top:3mm">base del calendario perpetuo · fascia 90 × 10 mm · adattare in scala mantenendo le proporzioni</div>
        </div>
        <div style="text-align:center">
          <span style="font-family:var(--fv);font-size:9mm;line-height:1;color:#000">V</span>
          <div style="font-family:var(--fl);font-size:2.1mm;color:#000;margin-top:2mm">clip della penna · 4 mm</div>
        </div>
      </div>`,
    },
  ],
  note: 'Testi in vettore per il fornitore delle incisioni: la scritta sulla base del calendario e la V sulla penna.',
};

export const TAVOLE = [
  coperchio('coperchio-premium', 240, 170, 34, 'Premium (240 × 170)'),
  coperchio('coperchio-firma', 300, 220, 43, 'Firma (300 × 220)'),
  internoCoperchio('interno-coperchio-premium', 234, 164, 'Premium'),
  internoCoperchio('interno-coperchio-firma', 294, 214, 'Firma'),
  velina,
  sigillo,
  lettera,
  foglioVelia,
  cardAccesso,
  cardPromesse,
  cartellino,
  taccuino,
  calendario,
  fascetta,
  timbro,
  incisioni,
];

export { DATA };
