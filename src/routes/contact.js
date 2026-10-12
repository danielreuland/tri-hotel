// Kontaktformular: zweiter schneller Kontaktweg (Impressum). Nachrichten landen im Admin (Aufgaben-Board).
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { ipHash, isEmail } = require('../lib/util');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });

function render(res, extra = {}) {
  res.render('public/contact', { title: 'Kontakt', description: 'Kontakt zur Redaktion – Fragen, Hinweise zu Einträgen, Korrekturen.', errors: [], form: {}, sent: false, ...extra });
}

router.get('/kontakt', (req, res) => render(res));

router.post('/kontakt', limiter, wrap(async (req, res) => {
  const b = req.body;
  if (b.company_url) return render(res, { sent: true }); // Honeypot
  const form = { name: String(b.name || '').trim().slice(0, 120), email: String(b.email || '').trim().slice(0, 200), message: String(b.message || '').trim().slice(0, 5000) };
  const errors = [];
  if (!isEmail(form.email)) errors.push('Bitte eine gültige E-Mail-Adresse angeben, damit wir antworten können.');
  if (form.message.length < 10) errors.push('Bitte schreib uns ein paar Worte.');
  if (b.privacy !== 'on') errors.push('Bitte den Hinweis zum Datenschutz bestätigen.');
  if (errors.length) return render(res, { errors, form });
  await db.query(
    `INSERT INTO contact_messages (site_id, name, email, message, ip_hash) VALUES ($1, $2, $3, $4, $5)`,
    [req.site ? req.site.id : null, form.name || null, form.email, form.message, ipHash(req.ip)]
  );
  render(res, { sent: true });
}));

module.exports = router;
