// Admin: Postfach – eingegangene Mails lesen, zuordnen, beantworten (als Mia, Lara, Ben oder als Team), erledigen.
const express = require('express');
const fs = require('fs');
const db = require('../db');
const config = require('../config');
const mailbox = require('../services/mailbox');
const { requireAdmin } = require('../middleware/context');

const router = express.Router();
router.use(requireAdmin);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v) => (UUID_RE.test(String(v || '')) ? String(v) : null);

async function personas() {
  return db.many(`SELECT p.*, s.name AS site_name FROM personas p JOIN sites s ON s.id = p.site_id WHERE p.active ORDER BY s.is_default DESC, p.name`);
}

// Vorauswahl: Persona der beantworteten Mail, sonst Mia (Objekte) bzw. Ben (Camp-Anbieter)
function defaultPersona(list, m) {
  if (m && m.persona_id) return m.persona_id;
  const role = m && m.camp_provider_id ? 'partnerships' : 'data_inquiry';
  const p = list.find((x) => x.role === role);
  return p ? p.id : '';
}

router.get('/', wrap(async (req, res) => {
  const filter = mailbox.FILTERS[req.query.status] ? req.query.status : 'neu';
  res.render('admin/mailbox', {
    title: 'Postfach', filter, rows: await mailbox.list(filter), counts: await mailbox.counts(),
    inbound: config.mail.inbound.provider, KINDS: mailbox.KINDS, MATCHED_BY: mailbox.MATCHED_BY,
    flash: req.query.ok || null, error: req.query.fehler || null,
  });
}));

// Jetzt abrufen (sonst alle 5 Minuten)
router.post('/abrufen', wrap(async (req, res) => {
  try {
    const r = await mailbox.poll();
    if (r.skipped) return res.redirect(`/admin/postfach?fehler=${encodeURIComponent('Kein Empfang konfiguriert (MAIL_INBOUND).')}`);
    res.redirect(`/admin/postfach?ok=${encodeURIComponent(`${r.stored} neue Mail(s) abgerufen${r.errors ? `, ${r.errors} Fehler` : ''}`)}`);
  } catch (err) {
    res.redirect(`/admin/postfach?fehler=${encodeURIComponent(`Abruf fehlgeschlagen: ${err.message}`)}`);
  }
}));

router.get('/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const m = await mailbox.get(req.params.id);
  if (!m) return next();
  const list = await personas();
  const thread = (m.entity_id || m.camp_provider_id) ? await mailbox.thread({ entityId: m.entity_id, campProviderId: m.camp_provider_id }) : [];
  const entities = await db.many(`SELECT id, name, city FROM entities ORDER BY lower(name) LIMIT 2000`);
  const providers = await db.many(`SELECT id, name FROM camp_providers ORDER BY lower(name)`);
  res.render('admin/mail', {
    title: m.subject || 'Mail', m, thread, entities, providers, personas: list, defaultPersona: defaultPersona(list, m),
    KINDS: mailbox.KINDS, MATCHED_BY: mailbox.MATCHED_BY, STATUS: mailbox.STATUS, replySubject: mailbox.replySubject,
    flash: req.query.ok || null, error: req.query.fehler || null,
  });
}));

router.get('/:id/anhang/:n', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id) || !/^\d{1,2}$/.test(req.params.n)) return next();
  const a = await mailbox.attachment(req.params.id, Number(req.params.n));
  if (!a || !fs.existsSync(a.path)) return next();
  // immer als Download, nie im Browser ausführen
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.download(a.path, a.name, { headers: { 'Content-Type': 'application/octet-stream' } });
}));

router.post('/:id/zuordnen', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const [kind, target] = String(req.body.target || '').split(':');
  await mailbox.assign(req.params.id, {
    entityId: kind === 'e' ? uuidOrNull(target) : null, campProviderId: kind === 'p' ? uuidOrNull(target) : null,
  }, req.session.admin.id);
  res.redirect(`/admin/postfach/${req.params.id}?ok=${encodeURIComponent(kind ? 'Zugeordnet' : 'Zuordnung entfernt')}`);
}));

router.post('/:id/status', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id) || !mailbox.STATUS[req.body.status]) return next();
  await mailbox.setStatus(req.params.id, req.body.status, req.session.admin.id);
  const msg = { new: 'Wieder offen', done: 'Erledigt', ignored: 'Ignoriert' }[req.body.status];
  res.redirect(req.body.status === 'new' ? `/admin/postfach/${req.params.id}?ok=${encodeURIComponent(msg)}` : `/admin/postfach?ok=${encodeURIComponent(msg)}`);
}));

router.post('/:id/antworten', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  try {
    await mailbox.compose({ messageId: req.params.id, text: String(req.body.text || '').slice(0, 20000), personaId: uuidOrNull(req.body.persona) }, req.session.admin.id);
  } catch (err) {
    return res.redirect(`/admin/postfach/${req.params.id}?fehler=${encodeURIComponent(err.message)}#antworten`);
  }
  res.redirect(`/admin/postfach/${req.params.id}?ok=${encodeURIComponent('Antwort gesendet, Mail erledigt')}`);
}));

// Neue Nachricht an ein Objekt (aus der Detailseite, Reiter Kommunikation)
router.post('/neu', wrap(async (req, res) => {
  const back = /^\/admin\/meldungen\/[0-9a-f-]{36}$/.test(String(req.body.back || '')) ? req.body.back : '/admin/postfach';
  try {
    await mailbox.compose({
      entityId: uuidOrNull(req.body.entity), to: String(req.body.to || '').trim(), subject: String(req.body.subject || '').slice(0, 300),
      text: String(req.body.text || '').slice(0, 20000), personaId: uuidOrNull(req.body.persona),
    }, req.session.admin.id);
  } catch (err) {
    return res.redirect(`${back}?fehler=${encodeURIComponent(err.message)}#postfach`);
  }
  res.redirect(`${back}?ok=${encodeURIComponent('Nachricht gesendet')}#postfach`);
}));

module.exports = router;
module.exports.personas = personas;
module.exports.defaultPersona = defaultPersona;
