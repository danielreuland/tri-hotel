// Antwortformular für Betreiber: /anfrage/:token (persönlicher Link aus der Anfrage-Mail).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const inquiries = require('../services/inquiries');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(config.uploadDir, { recursive: true });
      cb(null, config.uploadDir);
    },
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: inquiries.MAX_PHOTOS },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

function render(res, found, extra = {}) {
  const { inquiry, entity, site } = found;
  res.render('public/inquiry', {
    title: inquiry.language === 'de' ? 'Ihre Angaben' : 'Your details',
    noindex: true,
    inquiry,
    entity,
    lang: inquiry.language,
    consents: inquiries.formConsents(inquiry.language, site, entity.name),
    maxPhotos: inquiries.MAX_PHOTOS,
    errors: [],
    form: {},
    ...extra,
  });
}

function closedPage(res, found) {
  const de = !found.inquiry || found.inquiry.language === 'de';
  const msg = {
    invalid: de ? 'Dieser Link ist uns nicht bekannt.' : 'We do not recognise this link.',
    expired: de ? 'Dieser Link ist abgelaufen. Antworten Sie gern einfach auf unsere Mail.' : 'This link has expired. Feel free to simply reply to our email.',
    answered: de ? 'Vielen Dank, Ihre Antwort ist bereits bei uns eingegangen.' : 'Thank you, we have already received your answer.',
  }[found.status];
  res.status(found.status === 'invalid' ? 404 : 200).render('public/error', { title: de ? 'Anfrage' : 'Request', message: msg, noindex: true });
}

router.get('/anfrage/:token', wrap(async (req, res) => {
  const found = await inquiries.findByToken(req.params.token);
  if (found.status !== 'ok') return closedPage(res, found);
  render(res, found);
}));

router.post('/anfrage/:token', limiter, (req, res, next) => {
  upload.array('photos', inquiries.MAX_PHOTOS)(req, res, (err) => {
    if (err) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'Ein Foto ist größer als 8 MB.' : 'Fotos konnten nicht hochgeladen werden.';
    }
    next();
  });
}, wrap(async (req, res) => {
  const found = await inquiries.findByToken(req.params.token);
  if (found.status !== 'ok') {
    for (const f of req.files || []) fs.unlink(f.path, () => {});
    return closedPage(res, found);
  }
  if (req.uploadError) {
    for (const f of req.files || []) fs.unlink(f.path, () => {});
    return render(res, found, { errors: [req.uploadError], form: req.body });
  }
  const result = await inquiries.submitAnswers(found.inquiry, found.entity, found.site, req.body, req.files || []);
  if (result.errors.length) return render(res, found, { errors: result.errors, form: req.body });
  res.render('public/inquiry-done', { title: found.inquiry.language === 'de' ? 'Vielen Dank' : 'Thank you', noindex: true, lang: found.inquiry.language, result });
}));

module.exports = router;
