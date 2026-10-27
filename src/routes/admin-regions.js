// Regionen verwalten (SEO-Landingpages): Name, „auf/am/an …“, Mittelpunkt + Radius, Einleitungstext.
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const { slugify } = require('../lib/util');
const regionData = require('../services/region-data');
const regionText = require('../services/region-text');
const describer = require('../services/describer');
const config = require('../config');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(requireAdmin);
router.param('id', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

function readForm(b) {
  const errors = [];
  const num = (v) => Number(String(v || '').replace(',', '.'));
  const f = {
    site_id: UUID_RE.test(b.site_id || '') ? b.site_id : null,
    name: String(b.name || '').trim().slice(0, 80),
    name_in: String(b.name_in || '').trim().slice(0, 80),
    slug: slugify(b.slug || b.name),
    country: String(b.country || '').trim().toUpperCase().slice(0, 2),
    lat: num(b.lat), lng: num(b.lng), radius_km: num(b.radius_km),
    // Klimapunkt optional: beide leer = automatisch (Lage der Hotels bzw. tiefer gelegener Ort nahe der Mitte)
    climate_lat: String(b.climate_lat || '').trim() ? num(b.climate_lat) : null,
    climate_lng: String(b.climate_lng || '').trim() ? num(b.climate_lng) : null,
    intro: String(b.intro || '').trim().slice(0, 2000) || null,
    status: ['draft', 'active', 'archived'].includes(b.status) ? b.status : 'active',
    sort_order: Number(b.sort_order) || 100,
  };
  if (!f.site_id) errors.push('Site wählen.');
  if (!f.name || !f.name_in || !f.slug) errors.push('Name, „auf/am …“ und Slug sind Pflicht.');
  if (!/^[A-Z]{2}$/.test(f.country)) errors.push('Land als zweistelliger Code.');
  if (!(Math.abs(f.lat) <= 90) || !(Math.abs(f.lng) <= 180) || !(f.radius_km > 0 && f.radius_km <= 500)) errors.push('Koordinaten und Radius (1–500 km) prüfen.');
  if ((f.climate_lat === null) !== (f.climate_lng === null) || (f.climate_lat !== null && !(Math.abs(f.climate_lat) <= 90 && Math.abs(f.climate_lng) <= 180))) {
    errors.push('Klimapunkt: Breiten- und Längengrad angeben oder beide leer lassen.');
  }
  return { f, errors };
}

async function render(res, extra = {}) {
  const rows = await db.many(
    `SELECT r.*, s.name AS site_name, b.score AS bike_score, b.computed_at AS bike_at, b.error AS bike_error,
            (SELECT count(*)::int FROM region_climate_monthly c WHERE c.region_id = r.id) AS climate_months
       FROM regions r JOIN sites s ON s.id = r.site_id LEFT JOIN bike_areas b ON b.key = 'region:' || r.id
      ORDER BY s.name, r.sort_order, r.name`);
  const sites = await db.many(`SELECT id, name FROM sites ORDER BY is_default DESC, name`);
  res.render('admin/regions', { title: 'Regionen', rows, sites, errors: [], flash: null, edit: null, climatePointText: regionData.climatePointText, lowM: regionData.LOW_M, minHotels: regionData.MIN_HOTELS, ...extra });
}

router.get('/', wrap(async (req, res) => render(res, { flash: req.query.ok || null })));

// Daten je Region (Klima mit Wind/Sonne/Wasser, Radrevier aus OSM) im Hintergrund berechnen – dauert je Region 1–3 Minuten
router.post('/daten', wrap(async (req, res) => {
  regionData.refreshAll({ force: req.body.alle === '1', log: (t) => console.log('[regionen]', t) }).catch((err) => console.error('[regionen]', err.message));
  await logAction(req.session.admin.id, 'region', req.session.admin.id, 'refresh_all_region_data', { force: req.body.alle === '1' });
  res.redirect(`/admin/regionen?ok=${encodeURIComponent('Berechnung läuft im Hintergrund (je Region 1–3 Minuten) – Seite später neu laden')}`);
}));
router.post('/:id/daten', wrap(async (req, res, next) => {
  const region = await db.one('SELECT * FROM regions WHERE id = $1', [req.params.id]);
  if (!region) return next();
  regionData.refresh(region, { force: true, adminId: req.session.admin.id }).catch((err) => console.error('[regionen]', err.message));
  res.redirect(`/admin/regionen?ok=${encodeURIComponent(`${region.name}: Berechnung läuft (1–3 Minuten) – Seite später neu laden`)}`);
}));
router.get('/:id', wrap(async (req, res, next) => {
  const edit = await db.one('SELECT * FROM regions WHERE id = $1', [req.params.id]);
  if (!edit) return next();
  const text = await regionText.get(edit.id);
  let textStale = false;
  if (text && text.input_hash) {
    const input = await regionText.gather(edit);
    textStale = Boolean(input) && regionText.inputHash(input) !== text.input_hash;
  }
  render(res, { edit, text, textStale, textWords: text ? regionText.wordCount(text.body) : 0, flash: req.query.ok || null,
    errors: req.query.fehler ? [req.query.fehler] : [] });
}));

// Regionstext: KI-Entwurf erzeugen (überschreibt den Entwurf, Status „Entwurf“), speichern, freigeben, zurückziehen, Notizen
router.post('/:id/text/erzeugen', wrap(async (req, res, next) => {
  const region = await db.one('SELECT * FROM regions WHERE id = $1', [req.params.id]);
  if (!region) return next();
  const back = `/admin/regionen/${region.id}`;
  if (config.llm.provider !== 'anthropic') return res.redirect(`${back}?fehler=${encodeURIComponent('Kein KI-Anbieter eingerichtet (LLM_PROVIDER).')}#text`);
  const input = await regionText.gather(region);
  if (!input) return res.redirect(`${back}?fehler=${encodeURIComponent('Die Site hat kein Standard-Ranking.')}#text`);
  let out;
  try {
    out = await regionText.generate(input);
  } catch (err) {
    console.error('[region-text]', err.message);
    return res.redirect(`${back}?fehler=${encodeURIComponent(`Text konnte nicht erzeugt werden: ${err.message.slice(0, 200)}`)}#text`);
  }
  if (out.usage) await require('../lib/llm').record({ purpose: 'region_text', model: out.usage.model, usage: out.usage.raw });
  if (!out.text) return res.redirect(`${back}?fehler=${encodeURIComponent('Das Modell hat keinen Text geliefert.')}#text`);
  await db.query(
    `INSERT INTO region_texts (region_id, summary, body, generated_summary, generated_body, input_hash, model, generated_at, status, updated_by, updated_at)
     VALUES ($1, $2, $3, $2, $3, $4, $5, now(), 'draft', $6, now())
     ON CONFLICT (region_id) DO UPDATE SET summary = EXCLUDED.summary, body = EXCLUDED.body, generated_summary = EXCLUDED.summary,
       generated_body = EXCLUDED.body, input_hash = EXCLUDED.input_hash, model = EXCLUDED.model, generated_at = now(), status = 'draft',
       updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [region.id, out.text.summary, out.text.body, regionText.inputHash(input), out.usage.model, req.session.admin.id]);
  await logAction(req.session.admin.id, 'region', region.id, 'generate_region_text', { model: out.usage.model, words: regionText.wordCount(out.text.body) });
  res.redirect(`${back}?ok=${encodeURIComponent('Entwurf erzeugt – bitte prüfen und freigeben')}#text`);
}));

router.post('/:id/text', wrap(async (req, res, next) => {
  const region = await db.one('SELECT * FROM regions WHERE id = $1', [req.params.id]);
  if (!region) return next();
  const back = `/admin/regionen/${region.id}`;
  const summary = describer.shorten(req.body.summary, describer.SUMMARY_MAX);
  const body = String(req.body.body || '').replace(/\r/g, '').trim().slice(0, 12000);
  const action = ['save', 'publish', 'unpublish'].includes(req.body.action) ? req.body.action : 'save';
  if (action === 'publish' && (!summary || !body)) return res.redirect(`${back}?fehler=${encodeURIComponent('Kurzbeschreibung und Text sind zum Freigeben nötig.')}#text`);
  const existing = await regionText.get(region.id);
  const hash = action === 'publish' ? regionText.inputHash(await regionText.gather(region)) : existing && existing.input_hash;
  const status = action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : (existing ? existing.status : 'draft');
  await db.query(
    `INSERT INTO region_texts (region_id, summary, body, input_hash, status, published_at, published_by, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'published' THEN now() END, CASE WHEN $5 = 'published' THEN $6::uuid END, $6, now())
     ON CONFLICT (region_id) DO UPDATE SET summary = EXCLUDED.summary, body = EXCLUDED.body, input_hash = EXCLUDED.input_hash,
       status = EXCLUDED.status, updated_by = EXCLUDED.updated_by, updated_at = now(),
       published_at = CASE WHEN EXCLUDED.status = 'published' AND $7 THEN now() ELSE region_texts.published_at END,
       published_by = CASE WHEN EXCLUDED.status = 'published' AND $7 THEN EXCLUDED.updated_by ELSE region_texts.published_by END`,
    [region.id, summary, body, hash, status, req.session.admin.id, action === 'publish']);
  await logAction(req.session.admin.id, 'region', region.id, `region_text_${action}`, { status, words: regionText.wordCount(body) });
  const msg = { save: 'Text gespeichert', publish: 'Text freigegeben – jetzt auf der Regionsseite sichtbar', unpublish: 'Text zurückgezogen' }[action];
  res.redirect(`${back}?ok=${encodeURIComponent(msg)}#text`);
}));

router.post('/:id/text/notizen', wrap(async (req, res, next) => {
  const region = await db.one('SELECT id FROM regions WHERE id = $1', [req.params.id]);
  if (!region) return next();
  const notes = String(req.body.notes || '').replace(/\r/g, '').trim().slice(0, 3000);
  await db.query(
    `INSERT INTO region_texts (region_id, notes, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (region_id) DO UPDATE SET notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [region.id, notes, req.session.admin.id]);
  await logAction(req.session.admin.id, 'region', region.id, 'region_text_notes', { length: notes.length });
  res.redirect(`/admin/regionen/${region.id}?ok=${encodeURIComponent('Notizen gespeichert')}#text`);
}));

router.post('/:id?', wrap(async (req, res) => {
  const { f, errors } = readForm(req.body);
  if (errors.length) return render(res, { errors, edit: { ...f, id: req.params.id } });
  try {
    if (req.params.id) {
      await db.query(
        `UPDATE regions SET site_id=$2, name=$3, name_in=$4, slug=$5, country=$6, lat=$7, lng=$8, radius_km=$9, intro=$10, status=$11, sort_order=$12,
           climate_lat=$13, climate_lng=$14, updated_at=now() WHERE id=$1`,
        [req.params.id, f.site_id, f.name, f.name_in, f.slug, f.country, f.lat, f.lng, f.radius_km, f.intro, f.status, f.sort_order, f.climate_lat, f.climate_lng]
      );
      await logAction(req.session.admin.id, 'region', req.params.id, 'edit_region', { name: f.name, radius_km: f.radius_km, climate_lat: f.climate_lat, climate_lng: f.climate_lng });
    } else {
      const row = await db.one(
        `INSERT INTO regions (site_id, name, name_in, slug, country, lat, lng, radius_km, intro, status, sort_order, climate_lat, climate_lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [f.site_id, f.name, f.name_in, f.slug, f.country, f.lat, f.lng, f.radius_km, f.intro, f.status, f.sort_order, f.climate_lat, f.climate_lng]
      );
      await logAction(req.session.admin.id, 'region', row.id, 'create_region', { name: f.name });
    }
  } catch (err) {
    if (err.code !== '23505') throw err;
    return render(res, { errors: ['Diesen Slug gibt es auf der Site schon.'], edit: { ...f, id: req.params.id } });
  }
  res.redirect('/admin/regionen?ok=Gespeichert');
}));

module.exports = router;
