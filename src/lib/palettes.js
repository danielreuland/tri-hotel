// Farbpaletten für Sites. Jede Palette setzt alle Farb-Tokens aus public/css/style.css für Hell und Dunkel.
// Eine Site wählt eine Palette (sites.theme.preset) und kann einzelne Tokens überschreiben (theme.light / theme.dark).
// Kontraste geprüft (WCAG 2.2): Text ≥ 4,5 : 1 auf dem jeweiligen Grund, siehe docs/farbvorschlag.html.
// Pool & Sonne: Mitmach-Button Koralle #FF7A59 mit Navy-Schrift #102A43 (5,7 : 1), in Hell und Dunkel gleich.

const TOKENS = [
  'bg', 'surface', 'surface-2', 'border', 'text', 'muted', 'heading',
  'accent', 'accent-strong', 'primary', 'primary-text', 'cta', 'cta-text',
  'header-bg', 'header-text', 'logo-accent', 'score-bg', 'score-text', 'score-ring',
];

const PALETTES = {
  pool: {
    name: 'Pool & Sonne (Navy, Türkis, Koralle)',
    light: {
      bg: '#f5f8fb', surface: '#ffffff', 'surface-2': '#eaf0f6', border: '#d8e1ea', text: '#102a43', muted: '#52637a', heading: '#12345a',
      accent: '#0dcfbd', 'accent-strong': '#0b6f6a', primary: '#12345a', 'primary-text': '#ffffff', cta: '#ff7a59', 'cta-text': '#102a43',
      'header-bg': '#12345a', 'header-text': '#ffffff', 'logo-accent': '#0dcfbd', 'score-bg': '#12345a', 'score-text': '#ffffff', 'score-ring': '#0dcfbd',
    },
    dark: {
      bg: '#0f1a24', surface: '#162433', 'surface-2': '#1d2e40', border: '#26384a', text: '#e7eef5', muted: '#93a4b5', heading: '#ffffff',
      accent: '#0dcfbd', 'accent-strong': '#3fd3c4', primary: '#0dcfbd', 'primary-text': '#04211e', cta: '#ff7a59', 'cta-text': '#102a43',
      'header-bg': '#0b1520', 'header-text': '#e7eef5', 'logo-accent': '#0dcfbd', 'score-bg': '#12345a', 'score-text': '#ffffff', 'score-ring': '#0dcfbd',
    },
  },
  startnummer: {
    name: 'Startnummer (Tinte, Signal-Orange)',
    light: {
      bg: '#f7f7f5', surface: '#ffffff', 'surface-2': '#efeee9', border: '#e0dfd8', text: '#14213d', muted: '#5c6475', heading: '#14213d',
      accent: '#f28c28', 'accent-strong': '#a64d00', primary: '#14213d', 'primary-text': '#ffffff', cta: '#f28c28', 'cta-text': '#14213d',
      'header-bg': '#14213d', 'header-text': '#ffffff', 'logo-accent': '#f28c28', 'score-bg': '#ffffff', 'score-text': '#14213d', 'score-ring': '#f28c28',
    },
    dark: {
      bg: '#11161f', surface: '#1a2130', 'surface-2': '#222b3c', border: '#2e3a4f', text: '#edeff3', muted: '#9aa3b5', heading: '#ffffff',
      accent: '#f28c28', 'accent-strong': '#ffad5c', primary: '#f28c28', 'primary-text': '#14213d', cta: '#f28c28', 'cta-text': '#14213d',
      'header-bg': '#0b1019', 'header-text': '#edeff3', 'logo-accent': '#f28c28', 'score-bg': '#14213d', 'score-text': '#ffffff', 'score-ring': '#f28c28',
    },
  },
  lagune: {
    name: 'Lagune (Petrol, Türkis – nah an triprep)',
    light: {
      bg: '#f6f9f9', surface: '#ffffff', 'surface-2': '#e8efef', border: '#d4dfdf', text: '#10212b', muted: '#55656d', heading: '#10212b',
      accent: '#0dcfbd', 'accent-strong': '#0a7c72', primary: '#0a7c72', 'primary-text': '#ffffff', cta: '#0dcfbd', 'cta-text': '#04211e',
      'header-bg': '#ffffff', 'header-text': '#10212b', 'logo-accent': '#0a7c72', 'score-bg': '#ffffff', 'score-text': '#0a7c72', 'score-ring': '#0a7c72',
    },
    dark: {
      bg: '#0d1117', surface: '#161b22', 'surface-2': '#1f2630', border: '#2d3540', text: '#e6edf3', muted: '#8b949e', heading: '#ffffff',
      accent: '#0dcfbd', 'accent-strong': '#0dcfbd', primary: '#0dcfbd', 'primary-text': '#04211e', cta: '#0dcfbd', 'cta-text': '#04211e',
      'header-bg': '#161b22', 'header-text': '#e6edf3', 'logo-accent': '#0dcfbd', 'score-bg': '#1f2630', 'score-text': '#0dcfbd', 'score-ring': '#0dcfbd',
    },
  },
};

const HEX = /^#[0-9a-f]{6}$/i;

// Palette + Überschreibungen -> { light: {...}, dark: {...} } nur mit gültigen Tokens und Hex-Werten
function resolve(theme) {
  const t = theme || {};
  const base = PALETTES[t.preset] || PALETTES.pool;
  const out = { light: {}, dark: {} };
  for (const mode of ['light', 'dark']) {
    for (const k of TOKENS) {
      const override = t[mode] && t[mode][k];
      const v = HEX.test(override || '') ? override : base[mode][k];
      out[mode][k] = v.toLowerCase();
    }
  }
  return out;
}

function soft(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, .14)`;
}

function declarations(vars) {
  const decl = Object.entries(vars).map(([k, v]) => `--${k}:${v}`);
  if (vars.accent) decl.push(`--accent-soft:${soft(vars.accent)}`);
  return decl.join(';');
}

// CSS für eine Site: Hell auf :root, Dunkel für System-Einstellung und ausdrückliche Wahl
function css(theme) {
  const r = resolve(theme);
  const dark = declarations(r.dark);
  return `:root{${declarations(r.light)}}`
    + `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}`
    + `:root[data-theme="dark"]{${dark}}`;
}

module.exports = { TOKENS, PALETTES, resolve, css };
