// Rankings verwalten: anlegen, bearbeiten, duplizieren, Standard setzen,
// Kategorien und Kriterien pflegen, Scores neu berechnen. Alles ohne Code-Änderung.
const express = require('express');
const db = require('../db');
const rankings = require('../services/rankings');
const scoring = require('../services/scoring');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STATUSES = { draft: 'Entwurf', active: 'aktiv', archived: 'archiviert' };
const VALUE_TYPES = { option: 'Auswahl', bool: 'Ja/Nein', rating: 'Admin-Einstufung', number: 'Zahl / Klima' };

router.use(requireAdmin);
for (const p of ['id', 'cid']) router.param(p, (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

function parseJson(text, fallback) {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { value: fallback, error: true };
  }
}

function readRankingForm(body) {
  const errors = [];
  const f = {
    code: String(body.code || '').trim(),
    slug: String(body.slug || '').trim(),
    name: String(body.name || '').trim(),
    score_name: String(body.score_name || '').trim() || 'Score',
    description: String(body.description || '').trim() || null,
    entity_type: String(body.entity_type || '').trim(),
    entity_label_sg: String(body.entity_label_sg || '').trim(),
    entity_label_pl: String(body.entity_label_pl || '').trim(),
    subdomain: String(body.subdomain || '').trim().toLowerCase() || null,
    status: STATUSES[body.status] ? body.status : 'draft',
    formulaText: String(body.formula || '{}'),
    labelsText: String(body.labels || '[]'),
    contentText: String(body.content || '{}'),
    site_id: UUID_RE.test(body.site_id || '') ? body.site_id : null,
  };
  if (!f.site_id) errors.push('Bitte eine Site wählen.');
  for (const k of ['code', 'slug', 'entity_type']) if (!SLUG_RE.test(f[k])) errors.push(`${k}: nur Kleinbuchstaben, Ziffern und Bindestriche.`);
  if (f.subdomain && !SLUG_RE.test(f.subdomain)) errors.push('Subdomain: nur Kleinbuchstaben, Ziffern und Bindestriche.');
  if (!f.name || !f.entity_label_sg || !f.entity_label_pl) errors.push('Name und Objekt-Beschriftungen sind Pflicht.');

  const formula = parseJson(f.formulaText, {});
  if (formula.error || typeof formula.value !== 'object' || Array.isArray(formula.value)) errors.push('Formel ist kein gültiges JSON-Objekt.');
  else {
    for (const [k, v] of Object.entries(formula.value)) if (typeof v !== 'number') errors.push(`Formel: „${k}“ muss eine Zahl sein.`);
    const fw = formula.value.fact_weight ?? 0.6;
    const aw = formula.value.athlete_weight ?? 0.4;
    if (Math.abs(fw + aw - 1) > 0.001) errors.push('Formel: fact_weight + athlete_weight muss 1 ergeben.');
  }
  const labels = parseJson(f.labelsText, []);
  if (labels.error || !Array.isArray(labels.value) || labels.value.some((l) => typeof l.min !== 'number' || !l.label)) {
    errors.push('Labels: JSON-Liste aus {"min": Zahl, "label": "Text"}.');
  }
  const content = parseJson(f.contentText, {});
  if (content.error || typeof content.value !== 'object' || Array.isArray(content.value)) errors.push('Landingpage-Texte: JSON-Objekt aus Texten.');
  f.formula = formula.value;
  f.labels = labels.value;
  f.content = content.value;
  return { f, errors };
}

// ---------- Übersicht ----------

const allSites = () => db.many(`SELECT id, name, primary_domain FROM sites WHERE status <> 'archived' ORDER BY is_default DESC, name`);

router.get('/', wrap(async (req, res) => {
  const rows = await db.many(
    `SELECT r.*, s.name AS site_name, s.primary_domain,
       (SELECT count(*)::int FROM criteria c WHERE c.ranking_id = r.id AND c.active) AS criteria_count,
       (SELECT COALESCE(sum(max_points), 0)::int FROM criteria c WHERE c.ranking_id = r.id AND c.active) AS points_sum,
       (SELECT count(*)::int FROM entity_rankings er WHERE er.ranking_id = r.id AND er.status = 'live') AS live_count
       FROM rankings r JOIN sites s ON s.id = r.site_id ORDER BY s.is_default DESC, s.name, r.is_default DESC, r.status, r.name`
  );
  res.render('admin/rankings', { title: 'Rankings', rows, STATUSES, flash: req.query.ok || null });
}));

const NEW_DEFAULTS = {
  formulaText: JSON.stringify(scoring.DEFAULT_FORMULA, null, 2),
  labelsText: JSON.stringify([{ min: 85, label: 'Top' }, { min: 70, label: 'Sehr gut' }, { min: 55, label: 'Gut' }, { min: 0, label: 'Eingeschränkt' }], null, 2),
  contentText: JSON.stringify({ hero_eyebrow: '', hero_title: '', hero_highlight: '', hero_text: '', cta_title: '', cta_text: '' }, null, 2),
  status: 'draft',
};

router.get('/neu', wrap(async (req, res) => {
  res.render('admin/ranking-form', { title: 'Neues Ranking', r: NEW_DEFAULTS, errors: [], STATUSES, isNew: true, sites: await allSites() });
}));

router.post('/neu', wrap(async (req, res) => {
  const { f, errors } = readRankingForm(req.body);
  if (errors.length) return res.status(422).render('admin/ranking-form', { title: 'Neues Ranking', r: f, errors, STATUSES, isNew: true, sites: await allSites() });
  try {
    const row = await db.one(
      `INSERT INTO rankings (code, slug, name, score_name, description, entity_type, entity_label_sg, entity_label_pl, subdomain, formula, labels, status, content, site_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [f.code, f.slug, f.name, f.score_name, f.description, f.entity_type, f.entity_label_sg, f.entity_label_pl, f.subdomain,
        JSON.stringify(f.formula), JSON.stringify(f.labels), f.status, JSON.stringify(f.content), f.site_id]
    );
    await logAction(req.session.admin.id, 'ranking', row.id, 'create_ranking', { code: f.code });
    res.redirect(`/admin/rankings/${row.id}?ok=Ranking+angelegt`);
  } catch (err) {
    if (err.code !== '23505') throw err;
    res.status(422).render('admin/ranking-form', { title: 'Neues Ranking', r: f, errors: ['Code, Slug oder Subdomain ist schon vergeben.'], STATUSES, isNew: true, sites: await allSites() });
  }
}));

// ---------- Bearbeiten ----------

async function renderEdit(req, res, ranking, { errors = [], form = null } = {}) {
  const [categories, criteria] = await Promise.all([
    rankings.getCategories(ranking.id),
    rankings.getCriteria(ranking.id, { includeInactive: true }),
  ]);
  const pointsSum = criteria.filter((c) => c.active).reduce((s, c) => s + c.max_points, 0);
  const warnings = criteria.flatMap((c) => scoring.validateCriterion(c).warnings.map((w) => `${c.code}: ${w}`));
  res.status(errors.length ? 422 : 200).render('admin/ranking-edit', {
    title: ranking.name,
    ranking,
    r: form || {
      ...ranking,
      formulaText: JSON.stringify(ranking.formula, null, 2),
      labelsText: JSON.stringify(ranking.labels, null, 2),
      contentText: JSON.stringify(ranking.content || {}, null, 2),
    },
    categories,
    criteria,
    pointsSum,
    warnings,
    errors,
    STATUSES,
    VALUE_TYPES,
    sites: await allSites(),
    flash: req.query.ok || null,
  });
}

router.get('/:id', wrap(async (req, res, next) => {
  const ranking = await rankings.getRanking(req.params.id);
  if (!ranking) return next();
  await renderEdit(req, res, ranking);
}));

router.post('/:id', wrap(async (req, res, next) => {
  const ranking = await rankings.getRanking(req.params.id);
  if (!ranking) return next();
  const { f, errors } = readRankingForm(req.body);
  if (ranking.is_default && f.status !== 'active') errors.push('Das Standard-Ranking muss aktiv bleiben.');
  if (errors.length) return renderEdit(req, res, ranking, { errors, form: f });
  try {
    await db.query(
      `UPDATE rankings SET code=$2, slug=$3, name=$4, score_name=$5, description=$6, entity_type=$7, entity_label_sg=$8,
         entity_label_pl=$9, subdomain=$10, formula=$11, labels=$12, status=$13, content=$14, site_id=$15, updated_at=now() WHERE id=$1`,
      [ranking.id, f.code, f.slug, f.name, f.score_name, f.description, f.entity_type, f.entity_label_sg, f.entity_label_pl,
        f.subdomain, JSON.stringify(f.formula), JSON.stringify(f.labels), f.status, JSON.stringify(f.content), f.site_id]
    );
  } catch (err) {
    if (err.code !== '23505') throw err;
    return renderEdit(req, res, ranking, { errors: ['Code, Slug oder Subdomain ist schon vergeben.'], form: f });
  }
  await logAction(req.session.admin.id, 'ranking', ranking.id, 'edit_ranking', {
    old: { formula: ranking.formula, labels: ranking.labels, status: ranking.status }, new: { formula: f.formula, labels: f.labels, status: f.status },
  });
  const n = await rankings.recomputeRanking(ranking.id);
  res.redirect(`/admin/rankings/${ranking.id}?ok=${encodeURIComponent(`Gespeichert, ${n} Scores neu berechnet`)}`);
}));

router.post('/:id/standard', wrap(async (req, res) => {
  await db.tx(async (c) => {
    const r = await c.query(`SELECT status, site_id FROM rankings WHERE id = $1`, [req.params.id]);
    if (!r.rows[0] || r.rows[0].status !== 'active') throw new Error('Nur aktive Rankings können Standard sein.');
    await c.query('UPDATE rankings SET is_default = false WHERE is_default AND site_id = $1', [r.rows[0].site_id]);
    await c.query('UPDATE rankings SET is_default = true WHERE id = $1', [req.params.id]);
    await logAction(req.session.admin.id, 'ranking', req.params.id, 'set_default', null, c);
  });
  res.redirect('/admin/rankings?ok=Standard-Ranking+gesetzt');
}));

// Duplizieren: Stammdaten, Kategorien und Kriterien als Vorlage, Status Entwurf
router.post('/:id/duplizieren', wrap(async (req, res) => {
  const newId = await db.tx(async (c) => {
    const src = (await c.query('SELECT * FROM rankings WHERE id = $1', [req.params.id])).rows[0];
    const suffix = `-kopie-${Date.now().toString(36)}`;
    const copy = (
      await c.query(
        `INSERT INTO rankings (code, slug, name, score_name, description, entity_type, entity_label_sg, entity_label_pl, formula, labels, content, site_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft') RETURNING id`,
        [src.code + suffix, src.slug + suffix, `${src.name} (Kopie)`, src.score_name, src.description, src.entity_type,
          src.entity_label_sg, src.entity_label_pl, JSON.stringify(src.formula), JSON.stringify(src.labels), JSON.stringify(src.content || {}), src.site_id]
      )
    ).rows[0];
    const cats = (await c.query('SELECT * FROM ranking_categories WHERE ranking_id = $1', [src.id])).rows;
    for (const cat of cats) {
      const newCat = (
        await c.query(`INSERT INTO ranking_categories (ranking_id, code, label, sort_order) VALUES ($1,$2,$3,$4) RETURNING id`,
          [copy.id, cat.code, cat.label, cat.sort_order])
      ).rows[0];
      await c.query(
        `INSERT INTO criteria (ranking_id, category_id, code, label, value_type, scoring, max_points, is_ko, sort_order, active)
         SELECT $1, $2, code, label, value_type, scoring, max_points, is_ko, sort_order, active FROM criteria WHERE category_id = $3`,
        [copy.id, newCat.id, cat.id]
      );
    }
    await logAction(req.session.admin.id, 'ranking', copy.id, 'duplicate_ranking', { from: src.code }, c);
    return copy.id;
  });
  res.redirect(`/admin/rankings/${newId}?ok=Kopie+angelegt+%E2%80%93+bitte+Code%2C+Slug+und+Name+anpassen`);
}));

router.post('/:id/neu-berechnen', wrap(async (req, res) => {
  const n = await rankings.recomputeRanking(req.params.id);
  await logAction(req.session.admin.id, 'ranking', req.params.id, 'recompute', { count: n });
  res.redirect(`/admin/rankings/${req.params.id}?ok=${n}+Scores+neu+berechnet`);
}));

// ---------- Kategorien ----------

router.post('/:id/kategorien', wrap(async (req, res) => {
  const code = String(req.body.code || '').trim();
  const label = String(req.body.label || '').trim();
  if (!SLUG_RE.test(code.replace(/_/g, '-')) || !label) return res.redirect(`/admin/rankings/${req.params.id}?ok=Code+und+Bezeichnung+angeben`);
  const row = await db.one(
    `INSERT INTO ranking_categories (ranking_id, code, label, sort_order) VALUES ($1,$2,$3,$4)
     ON CONFLICT (ranking_id, code) DO NOTHING RETURNING id`,
    [req.params.id, code, label, Number(req.body.sort_order) || 99]
  );
  if (row) await logAction(req.session.admin.id, 'ranking', req.params.id, 'add_category', { code, label });
  res.redirect(`/admin/rankings/${req.params.id}?ok=Kategorie+gespeichert#kategorien`);
}));

router.post('/:id/kategorien/:cid', wrap(async (req, res) => {
  await db.query(`UPDATE ranking_categories SET label = $3, sort_order = $4 WHERE id = $2 AND ranking_id = $1`,
    [req.params.id, req.params.cid, String(req.body.label || '').trim(), Number(req.body.sort_order) || 0]);
  await logAction(req.session.admin.id, 'ranking', req.params.id, 'edit_category', { id: req.params.cid, label: req.body.label });
  res.redirect(`/admin/rankings/${req.params.id}?ok=Kategorie+gespeichert#kategorien`);
}));

// ---------- Kriterien ----------

async function renderCriterion(req, res, ranking, c, errors = [], warnings = []) {
  const categories = await rankings.getCategories(ranking.id);
  res.status(errors.length ? 422 : 200).render('admin/criterion-form', {
    title: c.id ? `Kriterium ${c.code}` : 'Neues Kriterium', ranking, c, categories, errors, warnings, VALUE_TYPES,
  });
}

router.get('/:id/kriterien/neu', wrap(async (req, res, next) => {
  const ranking = await rankings.getRanking(req.params.id);
  if (!ranking) return next();
  await renderCriterion(req, res, ranking, {
    value_type: 'bool', scoringText: '{"type":"bool","points_true":2}', max_points: 2, sort_order: 999, active: true, is_ko: false,
  });
}));

router.get('/:id/kriterien/:cid', wrap(async (req, res, next) => {
  const ranking = await rankings.getRanking(req.params.id);
  const c = await db.one('SELECT * FROM criteria WHERE id = $1 AND ranking_id = $2', [req.params.cid, req.params.id]);
  if (!ranking || !c) return next();
  await renderCriterion(req, res, ranking, { ...c, scoringText: JSON.stringify(c.scoring, null, 2) }, [], scoring.validateCriterion(c).warnings);
}));

router.post('/:id/kriterien/:cid?', wrap(async (req, res, next) => {
  const ranking = await rankings.getRanking(req.params.id);
  if (!ranking) return next();
  const b = req.body;
  const parsed = parseJson(String(b.scoring || ''), null);
  const c = {
    id: req.params.cid || null,
    code: String(b.code || '').trim(),
    label: String(b.label || '').trim(),
    category_id: b.category_id,
    value_type: b.value_type,
    scoring: parsed.value,
    scoringText: String(b.scoring || ''),
    max_points: Number(b.max_points),
    is_ko: b.is_ko === 'on',
    sort_order: Number(b.sort_order) || 0,
    active: b.active === 'on',
  };
  const { errors, warnings } = scoring.validateCriterion(c);
  if (parsed.error) errors.unshift('Punkteschema ist kein gültiges JSON.');
  if (!/^[a-z0-9_]+$/.test(c.code)) errors.push('Code: nur Kleinbuchstaben, Ziffern und Unterstriche.');
  if (!c.label) errors.push('Bezeichnung fehlt.');
  if (!Number.isInteger(c.max_points) || c.max_points < 0) errors.push('Maximale Punkte als ganze Zahl ≥ 0.');
  const cat = UUID_RE.test(c.category_id || '') && (await db.one('SELECT id FROM ranking_categories WHERE id = $1 AND ranking_id = $2', [c.category_id, ranking.id]));
  if (!cat) errors.push('Kategorie wählen.');
  if (errors.length) return renderCriterion(req, res, ranking, c, errors, warnings);

  const old = c.id ? await db.one('SELECT * FROM criteria WHERE id = $1 AND ranking_id = $2', [c.id, ranking.id]) : null;
  if (c.id && !old) return next();
  try {
    if (old) {
      // Jede Katalogänderung erhöht die Version; danach werden die Scores neu berechnet.
      await db.query(
        `UPDATE criteria SET code=$3, label=$4, category_id=$5, value_type=$6, scoring=$7, max_points=$8, is_ko=$9,
           sort_order=$10, active=$11, version = version + 1 WHERE id=$1 AND ranking_id=$2`,
        [c.id, ranking.id, c.code, c.label, c.category_id, c.value_type, JSON.stringify(c.scoring), c.max_points, c.is_ko, c.sort_order, c.active]
      );
      await logAction(req.session.admin.id, 'criterion', c.id, 'edit_criterion', {
        old: { scoring: old.scoring, max_points: old.max_points, is_ko: old.is_ko, active: old.active, version: old.version },
        new: { scoring: c.scoring, max_points: c.max_points, is_ko: c.is_ko, active: c.active },
      });
    } else {
      const row = await db.one(
        `INSERT INTO criteria (ranking_id, category_id, code, label, value_type, scoring, max_points, is_ko, sort_order, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [ranking.id, c.category_id, c.code, c.label, c.value_type, JSON.stringify(c.scoring), c.max_points, c.is_ko, c.sort_order, c.active]
      );
      await logAction(req.session.admin.id, 'criterion', row.id, 'create_criterion', { code: c.code, scoring: c.scoring });
    }
  } catch (err) {
    if (err.code !== '23505') throw err;
    return renderCriterion(req, res, ranking, c, ['Dieser Code existiert in diesem Ranking schon.'], warnings);
  }
  const n = await rankings.recomputeRanking(ranking.id);
  res.redirect(`/admin/rankings/${ranking.id}?ok=${encodeURIComponent(`Kriterium gespeichert, ${n} Scores neu berechnet`)}#kriterien`);
}));

module.exports = router;
