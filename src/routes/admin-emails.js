// Systemmails verwalten: Texte je Site bearbeiten (mit Platzhaltern), Vorschau, Testmail, Versandprotokoll.
const express = require('express');
const db = require('../db');
const config = require('../config');
const mailer = require('../services/mailer');
const mailtemplates = require('../services/mailtemplates');
const sitesService = require('../services/sites');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = Object.keys(mailtemplates.DEFAULTS);
const LOG_PER_PAGE = 50;

router.use(requireAdmin);

async function siteFrom(req) {
  const all = await db.many(`SELECT * FROM sites ORDER BY is_default DESC, name`);
  const id = UUID_RE.test(req.query.site || req.body.site_id || '') ? (req.query.site || req.body.site_id) : null;
  return { all, site: all.find((s) => s.id === id) || all[0] };
}

// Übersicht: Vorlagen + Versandprotokoll
router.get('/', wrap(async (req, res) => {
  const { all, site } = await siteFrom(req);
  const rows = await db.many(
    `SELECT t.*, u.email AS updated_by_email FROM email_templates t LEFT JOIN admin_users u ON u.id = t.updated_by WHERE t.site_id = $1`, [site.id]);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const status = ['sent', 'failed'].includes(req.query.status) ? req.query.status : null;
  const template = /^[a-z-]{2,40}$/.test(req.query.vorlage || '') ? req.query.vorlage : null;
  const page = Math.max(1, Math.min(500, Number(req.query.seite) || 1));
  const params = [status, template];
  const where = `($1::text IS NULL OR l.status = $1) AND ($2::text IS NULL OR l.template = $2)`;
  const { n } = await db.one(`SELECT count(*)::int AS n FROM email_log l WHERE ${where}`, params);
  const log = await db.many(
    `SELECT l.*, s.entity_name, e.name AS inquiry_entity FROM email_log l
       LEFT JOIN submissions s ON s.id = l.submission_id
       LEFT JOIN inquiries i ON i.id = l.inquiry_id LEFT JOIN entities e ON e.id = i.entity_id
      WHERE ${where} ORDER BY l.created_at DESC LIMIT ${LOG_PER_PAGE} OFFSET $3`,
    [...params, (page - 1) * LOG_PER_PAGE]
  );
  res.render('admin/emails', {
    title: 'E-Mails', sites: all, site, byKey, DEFAULTS: mailtemplates.DEFAULTS, KEYS, log, total: n, page,
    pages: Math.max(1, Math.ceil(n / LOG_PER_PAGE)), status, template, provider: config.mail.provider,
    flash: req.query.ok || null,
  });
}));

async function renderEdit(req, res, site, key, draft, extra = {}) {
  const def = mailtemplates.DEFAULTS[key];
  const saved = await db.one(
    `SELECT t.*, u.email AS updated_by_email FROM email_templates t LEFT JOIN admin_users u ON u.id = t.updated_by
      WHERE t.site_id = $1 AND t.key = $2 AND t.language = 'de'`, [site.id, key]);
  const tpl = draft || (saved && saved.active ? saved : def);
  const preview = await mailtemplates.render(tpl, key, mailtemplates.sampleData(key, site), site, sitesService.urlFor(site));
  res.render('admin/email-edit', {
    title: `E-Mail: ${def.label}`, site, key, def, saved, tpl, preview,
    vars: { ...mailtemplates.VARS.common, ...(mailtemplates.VARS[key] || {}) },
    errors: [], flash: req.query.ok || null, adminEmail: req.session.admin.email, provider: config.mail.provider, ...extra,
  });
}

router.get('/:key', wrap(async (req, res, next) => {
  if (!KEYS.includes(req.params.key)) return next();
  const { site } = await siteFrom(req);
  await renderEdit(req, res, site, req.params.key, null);
}));

router.post('/:key', wrap(async (req, res, next) => {
  const key = req.params.key;
  if (!KEYS.includes(key)) return next();
  const { site } = await siteFrom(req);
  const action = ['preview', 'save', 'reset', 'test'].includes(req.body.action) ? req.body.action : 'preview';
  const back = `/admin/emails/${key}?site=${site.id}`;

  if (action === 'reset') {
    const old = await db.one(`DELETE FROM email_templates WHERE site_id = $1 AND key = $2 AND language = 'de' RETURNING subject, body, version`, [site.id, key]);
    await logAction(req.session.admin.id, 'email_template', site.id, 'reset_email_template', { key, previous: old });
    return res.redirect(`${back}&ok=${encodeURIComponent('Standardtext wiederhergestellt')}`);
  }
  if (action === 'test') {
    const ok = await mailer.send({ to: req.session.admin.email, template: key, site, data: mailtemplates.sampleData(key, site) });
    const msg = !ok ? 'Testmail fehlgeschlagen – siehe Versandprotokoll'
      : config.mail.provider === 'console' ? 'Testmail nur ins Server-Log geschrieben (Mailversand noch nicht eingerichtet)'
        : `Testmail an ${req.session.admin.email} gesendet`;
    return res.redirect(`${back}&ok=${encodeURIComponent(msg)}`);
  }

  const draft = { subject: String(req.body.subject || '').trim().slice(0, 200), body: String(req.body.body || '').replace(/\r/g, '').trim().slice(0, 6000) };
  const errors = [];
  if (!draft.subject || !draft.body) errors.push('Betreff und Text dürfen nicht leer sein.');
  const unknown = mailtemplates.unknownPlaceholders(key, draft.subject, draft.body);
  if (unknown.length) errors.push(`Unbekannte Platzhalter: ${unknown.map((u) => `{{${u}}}`).join(', ')}`);
  if (action === 'preview' || errors.length) return renderEdit(req, res, site, key, draft, { errors, unsaved: true });

  const prev = await db.one(`SELECT subject, body, version FROM email_templates WHERE site_id = $1 AND key = $2 AND language = 'de'`, [site.id, key]);
  await db.query(
    `INSERT INTO email_templates (site_id, key, language, subject, body, active, version, updated_by, updated_at)
     VALUES ($1, $2, 'de', $3, $4, true, 1, $5, now())
     ON CONFLICT (site_id, key, language) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, active = true,
       version = email_templates.version + 1, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [site.id, key, draft.subject, draft.body, req.session.admin.id]
  );
  await logAction(req.session.admin.id, 'email_template', site.id, 'edit_email_template', { key, previous: prev });
  res.redirect(`${back}&ok=${encodeURIComponent('Gespeichert – gilt ab der nächsten Mail')}`);
}));

module.exports = router;
