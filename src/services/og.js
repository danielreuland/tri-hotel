// Vorschaubilder (Open Graph, 1200×630) für Startseite, Objekt- und Regionsseiten.
// SVG-Vorlage in den Farben der Site, mit sharp nach PNG gewandelt und auf der Platte zwischengespeichert.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const palettes = require('../lib/palettes');

const CACHE_DIR = path.join(config.uploadDir, 'og');

function esc(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Text auf Zeilen umbrechen (grob nach Zeichen, reicht für Titel)
function wrap(text, max, lines) {
  const words = String(text || '').split(/\s+/);
  const out = [''];
  for (const w of words) {
    const cur = out[out.length - 1];
    if ((cur + ' ' + w).trim().length > max && cur) {
      if (out.length === lines) {
        out[out.length - 1] = `${cur}…`;
        return out;
      }
      out.push(w);
    } else out[out.length - 1] = `${cur} ${w}`.trim();
  }
  return out;
}

// { eyebrow, title, subtitle, score, label, site }
function svg({ eyebrow, title, subtitle, score, label, site }) {
  const c = palettes.resolve(site && site.theme).light;
  const logo = String((site && site.logo_text) || '');
  const dash = logo.indexOf('-');
  const logoSvg = dash > 0
    ? `${esc(logo.slice(0, dash))}<tspan fill="${c['logo-accent']}">-</tspan>${esc(logo.slice(dash + 1))}`
    : esc(logo);
  const lines = wrap(title, score !== null && score !== undefined ? 22 : 30, 3);
  const font = "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif";
  const titleSvg = lines.map((l, i) => `<text x="72" y="${250 + i * 78}" font-family="${font}" font-size="66" font-weight="700" fill="#ffffff">${esc(l)}</text>`).join('');
  const scoreSvg = score !== null && score !== undefined
    ? `<rect x="850" y="170" width="280" height="280" rx="36" fill="${c['score-bg']}" stroke="${c['score-ring']}" stroke-width="10"/>
       <text x="990" y="360" text-anchor="middle" font-family="${font}" font-size="150" font-weight="700" fill="${c['score-text']}">${esc(score)}</text>
       <text x="990" y="500" text-anchor="middle" font-family="${font}" font-size="30" font-weight="700" fill="#ffffff">${esc(label || '')}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${c['header-bg']}"/>
  <rect x="0" y="600" width="1200" height="30" fill="${c.accent}"/>
  <text x="72" y="110" font-family="${font}" font-size="40" font-weight="700" letter-spacing="3" fill="#ffffff">${logoSvg}</text>
  <text x="72" y="170" font-family="${font}" font-size="26" font-weight="700" letter-spacing="3" fill="${c.accent}">${esc(String(eyebrow || '').toUpperCase())}</text>
  ${titleSvg}
  <text x="72" y="${250 + lines.length * 78 + 20}" font-family="${font}" font-size="32" fill="#c9d6e3">${esc(subtitle || '')}</text>
  ${scoreSvg}
</svg>`;
}

// PNG liefern (aus dem Zwischenspeicher, sonst neu rendern)
async function png(data) {
  const source = svg(data);
  const key = crypto.createHash('sha1').update(source).digest('hex');
  const file = path.join(CACHE_DIR, `${key}.png`);
  if (fs.existsSync(file)) return fs.promises.readFile(file);
  const sharp = require('sharp');
  const buf = await sharp(Buffer.from(source)).png({ compressionLevel: 9 }).toBuffer();
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  await fs.promises.writeFile(file, buf);
  return buf;
}

module.exports = { svg, png, wrap };
