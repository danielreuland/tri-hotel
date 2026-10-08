// Sites (Mandanten) verwalten: Marke, Domains, Farben, Absender, Impressumsangaben, virtuelle Mitarbeiter.
const express = require('express');
const db = require('../db');
const sites = require('../services/sites');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const { isEmail } = require('../lib/util');
const palettes = require('../lib/palettes');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const STATUSES = { draft: 'Entwurf', active: 'aktiv', archived: 'archiviert' };
const ROLES = { data_inquiry: 'Datenprüfung (Anfragen an Betreiber)', social: 'Social Media', partnerships: 'Kooperationen' };

router.use(requireAdmin);
for (const p of ['id', 'pid']) router.param(p, (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

function readForm(b) {
  const errors = [];
  const f = {
    code: String(b.code || '').trim(),
    name: String(b.name || '').trim(),
    logo_text: String(b.logo_text || '').trim().toUpperCase(),
    primary_domain: String(b.primary_domain || '').trim().toLowerCase(),
    domains: String(b.domains || '').split(/[\s,]+/).map((d) => d.trim().toLowerCase()).filter(Boolean),
    theme: { preset: palettes.PALETTES[b.preset] ? b.preset : 'pool', light: {}, dark: {} },
    mail_from: String(b.mail_from || '').trim().toLowerCase(),
    mail_reply_to: String(b.mail_reply_to || '').trim().toLowerCase() || null,
    legal: {
      owner: String(b.legal_owner || '').trim(),
      address: String(b.legal_address || '').trim(),
      email: String(b.legal_email || '').trim(),
      responsible: String(b.legal_responsible || '').trim(),
    },
    status: STATUSES[b.status] ? b.status : 'draft',
  };
  if (!/^[a-z0-9-]+$/.test(f.code)) errors.push('Code: nur Kleinbuchstaben, Ziffern und Bindestriche.');
  if (!f.name || !f.logo_text) errors.push('Name und Logo-Text sind Pflicht.');
  if (!DOMAIN_RE.test(f.primary_domain)) errors.push('Hauptdomain ungültig (z. B. hybrid-hotel.de).');
  for (const d of f.domains) if (!DOMAIN_RE.test(d)) errors.push(`Domain ungültig: ${d}`);
  // Einzelne Farben überschreiben: JSON {"cta":"#c2452a"} je Modus, nur bekannte Tokens und #rrggbb
  for (const mode of ['light', 'dark']) {
    const raw = String(b[`theme_${mode}`] || '').trim();
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      for (const [k, v] of Object.entries(obj)) {
        if (!palettes.TOKENS.includes(k)) errors.push(`Farbe ${mode}: unbekannter Name „${k}“.`);
        else if (!COLOR_RE.test(v)) errors.push(`Farbe ${mode}.${k}: Format #rrggbb.`);
        else f.theme[mode][k] = v.toLowerCase();
      }
    } catch {
      errors.push(`Farben ${mode === 'light' ? 'hell' : 'dunkel'}: kein gültiges JSON.`);
    }
  }
  if (!isEmail(f.mail_from)) errors.push('Absender-Adresse ungültig.');
  if (f.mail_reply_to && !isEmail(f.mail_reply_to)) errors.push('Antwortadresse ungültig.');
  return { f, errors };
}

router.get('/', wrap(async (req, res) => {
  const rows = await db.many(
    `SELECT s.*, (SELECT count(*)::int FROM rankings r WHERE r.site_id = s.id) AS ranking_count
       FROM sites s ORDER BY s.is_default DESC, s.name`
  );
  res.render('admin/sites', { title: 'Sites', rows, STATUSES, flash: req.query.ok || null });
}));

router.get('/neu', (req, res) => {
  res.render('admin/site-form', {
    title: 'Neue Site', s: { theme: { preset: 'pool', light: {}, dark: {} }, legal: {}, domains: [], status: 'draft' },
    personas: [], errors: [], STATUSES, ROLES, isNew: true, PALETTES: palettes.PALETTES, TOKENS: palettes.TOKENS,
  });
});

router.post('/neu', wrap(async (req, res) => {
  const { f, errors } = readForm(req.body);
  if (errors.length) return res.status(422).render('admin/site-form', { title: 'Neue Site', s: f, personas: [], errors, STATUSES, ROLES, isNew: true, PALETTES: palettes.PALETTES, TOKENS: palettes.TOKENS });
  try {
    const row = await db.one(
      `INSERT INTO sites (code, name, logo_text, primary_domain, domains, theme, mail_from, mail_reply_to, legal, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [f.code, f.name, f.logo_text, f.primary_domain, f.domains, JSON.stringify(f.theme), f.mail_from, f.mail_reply_to, JSON.stringify(f.legal), f.status]
    );
    // Jede Site startet mit drei virtuellen Mitarbeitern, Namen im Formular anpassbar
    for (const [role, name] of [['data_inquiry', 'Mia'], ['social', 'Lara'], ['partnerships', 'Ben']]) {
      await db.query(`INSERT INTO personas (site_id, name, role, title) VALUES ($1, $2, $3, $4)`, [row.id, name, role, `Digitale Assistenz ${ROLES[role]}`]);
    }
    await logAction(req.session.admin.id, 'site', row.id, 'create_site', { code: f.code });
    sites.clearCache();
    res.redirect(`/admin/sites/${row.id}?ok=Site+angelegt`);
  } catch (err) {
    if (err.code !== '23505') throw err;
    res.status(422).render('admin/site-form', { title: 'Neue Site', s: f, personas: [], errors: ['Code oder Domain ist schon vergeben.'], STATUSES, ROLES, isNew: true, PALETTES: palettes.PALETTES, TOKENS: palettes.TOKENS });
  }
}));

async function renderEdit(req, res, site, form, errors = []) {
  const personas = await db.many(`SELECT * FROM personas WHERE site_id = $1 ORDER BY role`, [site.id]);
  res.status(errors.length ? 422 : 200).render('admin/site-form', {
    title: site.name, s: form || site, siteId: site.id, isDefault: site.is_default, personas, errors, STATUSES, ROLES, isNew: false, flash: req.query.ok || null,
    PALETTES: palettes.PALETTES, TOKENS: palettes.TOKENS,
  });
}

router.get('/:id', wrap(async (req, res, next) => {
  const site = await db.one('SELECT * FROM sites WHERE id = $1', [req.params.id]);
  if (!site) return next();
  await renderEdit(req, res, site);
}));

router.post('/:id', wrap(async (req, res, next) => {
  const site = await db.one('SELECT * FROM sites WHERE id = $1', [req.params.id]);
  if (!site) return next();
  const { f, errors } = readForm(req.body);
  if (site.is_default && f.status !== 'active') errors.push('Die Standard-Site muss aktiv bleiben.');
  if (errors.length) return renderEdit(req, res, site, f, errors);
  try {
    await db.query(
      `UPDATE sites SET code=$2, name=$3, logo_text=$4, primary_domain=$5, domains=$6, theme=$7, mail_from=$8, mail_reply_to=$9,
         legal=$10, status=$11, updated_at=now() WHERE id=$1`,
      [site.id, f.code, f.name, f.logo_text, f.primary_domain, f.domains, JSON.stringify(f.theme), f.mail_from, f.mail_reply_to, JSON.stringify(f.legal), f.status]
    );
  } catch (err) {
    if (err.code !== '23505') throw err;
    return renderEdit(req, res, site, f, ['Code oder Domain ist schon vergeben.']);
  }
  await logAction(req.session.admin.id, 'site', site.id, 'edit_site', { name: f.name, domains: [f.primary_domain, ...f.domains] });
  sites.clearCache();
  res.redirect(`/admin/sites/${site.id}?ok=Gespeichert`);
}));

router.post('/:id/personas/:pid', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 40);
  const title = String(req.body.title || '').trim().slice(0, 80);
  const email = String(req.body.email || '').trim().toLowerCase() || null;
  if (!name || !title || (email && !isEmail(email))) return res.redirect(`/admin/sites/${req.params.id}?ok=Name%2C+Titel+und+g%C3%BCltige+E-Mail+angeben#personas`);
  await db.query(
    `UPDATE personas SET name = $3, title = $4, email = $5, active = $6 WHERE id = $2 AND site_id = $1`,
    [req.params.id, req.params.pid, name, title, email, req.body.active === 'on']
  );
  await logAction(req.session.admin.id, 'persona', req.params.pid, 'edit_persona', { name, title, email });
  res.redirect(`/admin/sites/${req.params.id}?ok=Mitarbeiter+gespeichert#personas`);
}));

module.exports = router;
