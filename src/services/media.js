// Medienbibliothek je Site: Stimmungsbilder für allgemeine Bereiche (nie als Foto eines bestimmten Objekts).
// Upload -> WebP-Varianten in <UPLOAD_DIR>/site-media, Zuordnung zu einem Platz (slot) oder einer Region.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');

const DIR = path.join(config.uploadDir, 'site-media');
const WIDTHS = [640, 1280, 1920];

// Plätze, an denen die öffentlichen Seiten ein Bild zeigen können
const SLOTS = {
  home_hero: 'Startseite – Kopfbereich',
  cta_band: 'Startseite – Abschluss-Band („hinzufügen“)',
  method: 'Methodik-Seite – Kopfbereich',
  submit: 'Formular „hinzufügen“ – Seitenbild',
};

function fileFor(id, width) {
  return path.join(DIR, `${id}-${width}.webp`);
}

// Original -> WebP-Varianten (nie größer als das Original). Liefert Maße und erzeugte Breiten.
async function processUpload(id, sourcePath) {
  const sharp = require('sharp');
  await fs.promises.mkdir(DIR, { recursive: true });
  const meta = await sharp(sourcePath).rotate().metadata();
  const width = meta.autoOrient ? meta.autoOrient.width : meta.width;
  const height = meta.autoOrient ? meta.autoOrient.height : meta.height;
  const widths = WIDTHS.filter((w) => w <= width);
  if (!widths.length) widths.push(width);
  for (const w of widths) {
    await sharp(sourcePath).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(fileFor(id, w));
  }
  return { width, height, variants: widths };
}

function removeFiles(m) {
  for (const w of m.variants || []) fs.unlink(fileFor(m.id, w), () => {});
}

// Kleiner Zwischenspeicher je Site (wird bei jeder Admin-Änderung geleert)
const cache = new Map();
const TTL_MS = 60 * 1000;

async function forSite(siteId) {
  if (!siteId) return { slots: {}, regions: {} };
  const hit = cache.get(siteId);
  if (hit && hit.at > Date.now() - TTL_MS) return hit.data;
  const rows = await db.many(`SELECT * FROM site_media WHERE site_id = $1 AND (slot IS NOT NULL OR region_id IS NOT NULL)`, [siteId]);
  const data = { slots: {}, regions: {} };
  for (const m of rows) {
    if (m.slot) data.slots[m.slot] = m;
    if (m.region_id) data.regions[m.region_id] = m;
  }
  cache.set(siteId, { at: Date.now(), data });
  return data;
}

function invalidate() {
  cache.clear();
}

// Attribute für <img>: src (mittlere Breite), srcset, width/height gegen Layoutsprünge
function imgAttrs(m) {
  if (!m) return '';
  const v = m.variants || [];
  const mid = v.includes(1280) ? 1280 : v[v.length - 1];
  const url = (w) => `/bild/${m.id}-${w}.webp`;
  const h = Math.round((m.height * mid) / m.width);
  return `src="${url(mid)}" srcset="${v.map((w) => `${url(w)} ${w}w`).join(', ')}" width="${mid}" height="${h}" style="object-position:${String(m.focal || '50% 50%').replace(/[^0-9% .a-z-]/gi, '')}"`;
}

module.exports = { SLOTS, WIDTHS, DIR, fileFor, processUpload, removeFiles, forSite, invalidate, imgAttrs };
