// Formular „hinzufügen“ (/<objekttyp>-hinzufuegen, z. B. /hotel-hinzufuegen) und Bestätigungslink.
// Öffentlich heißt es „Vorschlag“, intern (Admin, Datenbank) weiter „Meldung“/submission.
// Version 1: nur für das Ranking des Hosts; Formular und Pipeline sind ranking-parametrisiert.
const express = require('express');
const rateLimit = require('express-rate-limit');
const submissions = require('../services/submissions');
const rankings = require('../services/rankings');
const { normalizeUrl, isEmail } = require('../lib/util');

const router = express.Router();

const ROLES = { guest: 'Gast', coach: 'Trainer', owner: 'Betreiber', other: 'Sonstiges' };

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('public/error', { title: 'Zu viele Vorschläge', message: 'Bitte versuche es in einer Stunde noch einmal.' }),
});

async function formRanking(req, res, next) {
  const r = req.hostRanking;
  if (!r || req.params.type !== r.entity_type) return next('route');
  req.ranking = r;
  // Kriterien, die der Melder optional angeben darf (criteria.scoring.ask_submitter)
  req.askCriteria = (await rankings.getCriteria(r.id)).filter(
    (c) => c.scoring.ask_submitter && ['option', 'bool'].includes(c.scoring.type)
  );
  next();
}

function render(req, res, form = { hints: {} }, errors = []) {
  res.status(errors.length ? 422 : 200).render('public/submit', {
    title: `${req.ranking.entity_label_sg} hinzufügen`,
    ranking: req.ranking,
    askCriteria: req.askCriteria,
    form,
    errors,
    roles: ROLES,
  });
}

function validHint(c, v) {
  if (c.scoring.type === 'bool') return v === 'true' || v === 'false';
  return Object.prototype.hasOwnProperty.call(c.scoring.points || {}, v);
}

function validate(body, askCriteria) {
  const errors = [];
  const form = {
    name: String(body.name || '').trim().slice(0, 200),
    city: String(body.city || '').trim().slice(0, 120),
    country: String(body.country || '').trim().toUpperCase().slice(0, 2),
    website: normalizeUrl(body.website),
    email: String(body.email || '').trim().toLowerCase().slice(0, 200),
    role: ROLES[body.role] ? body.role : null,
    notes: String(body.notes || '').trim().slice(0, 2000) || null,
    hints: {},
  };
  // Optionale Angaben des Melders: hint_<kriterium-code>, nur gültige Ausprägungen
  for (const c of askCriteria) {
    const v = String(body[`hint_${c.code}`] || '');
    if (v && validHint(c, v)) form.hints[c.code] = v;
  }
  if (!form.name) errors.push('Bitte den Namen angeben.');
  if (!form.city) errors.push('Bitte den Ort angeben.');
  if (!/^[A-Z]{2}$/.test(form.country)) errors.push('Bitte ein Land auswählen.');
  if (!form.website) errors.push('Bitte eine gültige Website angeben.');
  if (!isEmail(form.email)) errors.push('Bitte eine gültige E-Mail-Adresse angeben.');
  if (body.privacy !== 'on') errors.push('Bitte der Datenschutzerklärung zustimmen.');
  return { form, errors };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/:type-hinzufuegen', wrap(formRanking), (req, res) => render(req, res));

// Alte Adresse /<objekttyp>-melden dauerhaft weiterleiten
router.get('/:type-melden', (req, res, next) => {
  if (!req.hostRanking || req.params.type !== req.hostRanking.entity_type) return next();
  res.redirect(301, `/${req.params.type}-hinzufuegen`);
});

router.post('/:type-hinzufuegen', wrap(formRanking), submitLimiter, async (req, res, next) => {
  try {
    // Honeypot: echte Nutzer sehen das Feld nicht
    if (req.body.company_url) return res.render('public/submitted', { title: 'Danke', ranking: req.ranking });
    const { form, errors } = validate(req.body, req.askCriteria);
    if (errors.length) return render(req, res, { ...form, website: req.body.website }, errors);
    if ((await submissions.recentCountByIp(req.ip)) >= 10) {
      return render(req, res, form, ['Von deinem Anschluss kamen heute schon viele Vorschläge. Bitte versuche es morgen wieder.']);
    }
    await submissions.create(req.ranking, form, { ip: req.ip });
    res.render('public/submitted', { title: 'Danke', ranking: req.ranking });
  } catch (err) {
    next(err);
  }
});

router.get('/bestaetigen/:token', async (req, res, next) => {
  try {
    const result = await submissions.verify(req.params.token);
    res.render('public/verified', { title: 'Bestätigung', result: result.status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
