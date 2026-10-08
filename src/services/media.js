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

// Original -> WebP-Varianten (nie größer als das Original) unter <dir>/<id>-<breite>.webp.
// Liefert Maße und erzeugte Breiten. Das Original löscht der Aufrufer.
async function processImage(sourcePath, dir, id) {
  const sharp = require('sharp');
  await fs.promises.mkdir(dir, { recursive: true });
  const meta = await sharp(sourcePath).rotate().metadata();
  const width = meta.autoOrient ? meta.autoOrient.width : meta.width;
  const height = meta.autoOrient ? meta.autoOrient.height : meta.height;
  const widths = WIDTHS.filter((w) => w <= width);
  if (!widths.length) widths.push(width);
  for (const w of widths) {
    await sharp(sourcePath).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, `${id}-${w}.webp`));
  }
  return { width, height, variants: widths };
}

function processUpload(id, sourcePath) {
  return processImage(sourcePath, DIR, id);
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

// Attribute für <img>: src (mittlere Breite), srcset, width/height gegen Layoutsprünge.
// prefix: /bild (Stimmungsbilder) oder /media (Objektbilder)
function imgAttrs(m, prefix = '/bild') {
  if (!m || !(m.variants || []).length) return '';
  const v = m.variants;
  const mid = v.includes(1280) ? 1280 : v[v.length - 1];
  const url = (w) => `${prefix}/${m.id}-${w}.webp`;
  const h = Math.round((m.height * mid) / m.width);
  return `src="${url(mid)}" srcset="${v.map((w) => `${url(w)} ${w}w`).join(', ')}" width="${mid}" height="${h}" style="object-position:${String(m.focal || '50% 50%').replace(/[^0-9% .a-z-]/gi, '')}"`;
}

// ---------- Objektbilder (entity_images) ----------
const ENTITY_DIR = path.join(config.uploadDir, 'entity-images');
const MAX_PER_ENTITY = 8;

function entityFileFor(id, width) {
  return path.join(ENTITY_DIR, `${id}-${width}.webp`);
}

function processEntityImage(id, sourcePath) {
  return processImage(sourcePath, ENTITY_DIR, id);
}

// Varianten und (bei Altbeständen) das Original entfernen
function removeEntityFiles(img) {
  for (const w of img.variants || []) fs.unlink(entityFileFor(img.id, w), () => {});
  if (img.storage_path && !(img.variants || []).length) fs.unlink(path.join(config.uploadDir, path.basename(img.storage_path)), () => {});
}

const entityImgAttrs = (img) => imgAttrs(img, '/media');

module.exports = {
  SLOTS, WIDTHS, DIR, fileFor, processImage, processUpload, removeFiles, forSite, invalidate, imgAttrs,
  ENTITY_DIR, MAX_PER_ENTITY, entityFileFor, processEntityImage, removeEntityFiles, entityImgAttrs,
};
