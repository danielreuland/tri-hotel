// Adminbereich: Login, Warteschlange, Detailprüfung, Freigabe, Objekte anlegen, Bilder, Aufgaben, Log.
// Rankings verwalten: routes/admin-rankings.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const rankings = require('../services/rankings');
const scoring = require('../services/scoring');
const submissions = require('../services/submissions');
const inquiries = require('../services/inquiries');
const featureService = require('../services/features');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const { normalizeUrl } = require('../lib/util');
const describer = require('../services/describer');
const media = require('../services/media');
const reviewlist = require('../services/reviewlist');
const tasks = require('../services/tasks');
const places = require('../services/places');
const basics = require('../services/basics');
const partners = require('../services/partners');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STATUS_LABELS = {
  received: 'eingegangen', verified: 'bestätigt', auto_check: 'in Auto-Prüfung', basics: 'wartet auf Grunddaten', admin_review: 'in Admin-Prüfung',
  live: 'live', rejected: 'abgelehnt', expired: 'verfallen', duplicate: 'Dublette',
};
const TRUST_LABELS = { 1: '1 – vom Betreiber bestätigt', 2: '2 – Admin geprüft', 3: '3 – Nutzer bestätigt', 4: '4 – automatisch' };
const TRUST_SOURCE = { 1: 'hotel', 2: 'admin', 3: 'users', 4: 'auto' };
const IMAGE_SOURCES = {
  owner_release: 'Schriftliche Freigabe des Betreibers', affiliate_feed: 'Partner-Feed', places_api: 'Places-API (mit Attribution)',
  user_upload: 'Nutzerfoto', own: 'Eigenes Foto', free_license: 'Freie Lizenz (nur generische Motive)',
};

router.use((req, res, next) => {
  res.locals.STATUS_LABELS = STATUS_LABELS;
  next();
});

// Ungültige IDs als 404 behandeln statt als Datenbankfehler
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const p of ['id', 'entityId', 'answerId', 'inquiryId', 'consentId']) {
  router.param(p, (req, res, next, value) => (UUID_RE.test(value) ? next() : next('route')));
}

// ---------- Login ----------

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

const safeNext = (next) => (/^\/admin(\/|$|\?)/.test(String(next || '')) ? String(next) : '/admin/aufgaben');

function renderLogin(res, { error = null, next = '/admin/aufgaben', status = 200 } = {}) {
  res.status(status).render('admin/login', {
    title: 'Admin-Login', error, next,
    googleEnabled: Boolean(config.google.clientId && config.google.clientSecret),
    passwordEnabled: config.adminPasswordLogin,
  });
}

// Anmeldung abschließen: neue Session (Schutz vor Session-Fixation), Login protokollieren
function finishLogin(req, res, user, next, method) {
  req.session.regenerate(async (err) => {
    if (err) return renderLogin(res, { error: 'Anmeldung fehlgeschlagen.', next, status: 500 });
    req.session.admin = { id: user.id, email: user.email };
    await db.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [user.id]);
    await logAction(user.id, 'admin_user', user.id, 'login', { method });
    req.session.save(() => res.redirect(safeNext(next)));
  });
}

router.get('/login', (req, res) => renderLogin(res, { next: safeNext(req.query.next), error: req.query.fehler || null }));

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const next = safeNext(req.body.next);
  if (!config.adminPasswordLogin) return renderLogin(res, { error: 'Bitte mit Google anmelden.', next, status: 403 });
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await db.one('SELECT * FROM admin_users WHERE email = $1', [email]);
  const ok = user && user.password_hash && (await bcrypt.compare(String(req.body.password || ''), user.password_hash));
  if (!ok) return renderLogin(res, { error: 'E-Mail oder Passwort falsch.', next, status: 401 });
  finishLogin(req, res, user, next, 'password');
}));

// ---------- Login mit Google (OpenID Connect, Authorization Code + PKCE) ----------
// Zugang nur, wenn die bestätigte Google-E-Mail in admin_users steht.
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const googleRedirectUri = () => `${config.baseUrl}/admin/auth/google/callback`;

router.get('/auth/google', loginLimiter, (req, res) => {
  if (!config.google.clientId) return renderLogin(res, { error: 'Google-Login ist noch nicht eingerichtet.', status: 503 });
  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  req.session.oauth = { state, verifier, next: safeNext(req.query.next), at: Date.now() };
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email',
    state,
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  req.session.save(() => res.redirect(`${GOOGLE_AUTH}?${params}`));
});

router.get('/auth/google/callback', loginLimiter, wrap(async (req, res) => {
  const o = req.session.oauth;
  delete req.session.oauth;
  const fail = (msg) => renderLogin(res, { error: msg, status: 401, next: (o && o.next) || '/admin/aufgaben' });
  if (!o || !req.query.state || req.query.state !== o.state || Date.now() - o.at > 10 * 60 * 1000) {
    return fail('Die Anmeldung ist abgelaufen. Bitte erneut versuchen.');
  }
  if (req.query.error || !req.query.code) return fail('Anmeldung bei Google abgebrochen.');

  const tokenRes = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(req.query.code), client_id: config.google.clientId, client_secret: config.google.clientSecret,
      redirect_uri: googleRedirectUri(), grant_type: 'authorization_code', code_verifier: o.verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenRes.ok) return fail('Google hat die Anmeldung nicht bestätigt.');
  const { id_token: idToken } = await tokenRes.json();
  // Das ID-Token kommt direkt per HTTPS vom Token-Endpunkt; geprüft werden Aussteller, Empfänger, Ablauf, E-Mail.
  let claims;
  try {
    claims = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return fail('Antwort von Google ungültig.');
  }
  const issuerOk = ['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss);
  if (!issuerOk || claims.aud !== config.google.clientId || claims.exp * 1000 < Date.now() || !claims.email_verified) {
    return fail('Antwort von Google ungültig.');
  }
  const email = String(claims.email || '').toLowerCase();
  const user = await db.one(
    `SELECT * FROM admin_users WHERE google_sub = $1 OR (google_sub IS NULL AND lower(email) = $2) ORDER BY google_sub NULLS LAST LIMIT 1`,
    [claims.sub, email]
  );
  if (!user) return fail(`Das Google-Konto ${email} ist für den Admin nicht freigeschaltet.`);
  if (!user.google_sub) await db.query('UPDATE admin_users SET google_sub = $2 WHERE id = $1', [user.id, claims.sub]);
  finishLogin(req, res, user, o.next, 'google');
}));

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

router.use(requireAdmin);

// ---------- Warteschlange ----------

// Suche ohne Groß-/Kleinschreibung und Akzente (Postgres ohne unaccent-Erweiterung: translate)
const FOLD_FROM = 'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿ';
const FOLD_TO = 'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyy';
const foldSql = (expr) => `lower(translate(coalesce(${expr}, ''), '${FOLD_FROM}', '${FOLD_TO}'))`;
const foldJs = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const QUEUE_LIMIT = 300;
const { countryName, inRegion } = require('../lib/seo');

// Startseite: Dashboard. Alte Listen-Adressen (/admin?status=…) leiten auf die Liste unter /admin/objekte.
router.get('/', wrap(async (req, res) => {
  if (['status', 'ranking', 'q', 'land', 'region'].some((k) => req.query[k] !== undefined)) {
    return res.redirect(`/admin/objekte${req.originalUrl.slice(req.originalUrl.indexOf('?'))}`);
  }
  const data = await require('../services/dashboard').load(req.site || (await db.one('SELECT * FROM sites ORDER BY is_default DESC LIMIT 1')));
  res.render('admin/dashboard', { title: 'Dashboard', d: data, plausibleKey: Boolean(config.plausibleApiKey) });
}));

// Objekt-Liste: Status-Pillen, Ranking, Suche (Name, Ort, Website), Land, Region – alles kombinierbar.
// Zahlen an Pillen und Auswahllisten berücksichtigen die jeweils anderen Filter.
router.get('/objekte', wrap(async (req, res) => {
  const status = STATUS_LABELS[req.query.status] ? req.query.status : req.query.status === 'alle' ? null : 'admin_review';
  const rankingId = UUID_RE.test(req.query.ranking || '') ? req.query.ranking : null;
  const q = String(req.query.q || '').trim().slice(0, 100);
  const land = /^[A-Za-z]{2}$/.test(req.query.land || '') ? req.query.land.toUpperCase() : null;
  const allRegions = await db.many(`SELECT id, name, lat, lng, radius_km FROM regions WHERE status = 'active' ORDER BY name`);
  const region = allRegions.find((r) => r.id === req.query.region) || null;

  const params = [rankingId];
  const where = ['($1::uuid IS NULL OR s.ranking_id = $1)'];
  if (q) {
    params.push(`%${foldJs(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    const p = `$${params.length}`;
    where.push(`(${['s.entity_name', 'e.name', 'COALESCE(e.city, s.city)', 'COALESCE(e.website, s.website)'].map((c) => `${foldSql(c)} LIKE ${p}`).join(' OR ')})`);
  }
  // alle Meldungen zu Ranking + Suche; Status, Land und Region werden darauf angewendet (so stimmen alle Zahlen)
  const base = await db.many(
    `SELECT s.*, e.name AS current_name, e.lat, e.lng, upper(COALESCE(e.country, s.country)) AS cc,
            r.name AS ranking_name, r.score_name, er.score, er.completeness, er.ko_reason, e.slug,
            (SELECT name FROM entities d WHERE d.id = s.possible_duplicate_of) AS possible_duplicate_name,
            (SELECT email FROM admin_users u WHERE u.id = s.created_by) AS created_by_email,
            COALESCE((r.formula->>'min_completeness')::numeric, 70) AS min_completeness
       FROM submissions s JOIN rankings r ON r.id = s.ranking_id
       LEFT JOIN entity_rankings er ON er.entity_id = s.entity_id AND er.ranking_id = s.ranking_id
       LEFT JOIN entities e ON e.id = s.entity_id
      WHERE ${where.join(' AND ')}
      ORDER BY s.created_at DESC`, params);
  const byStatus = (r) => !status || r.status === status;
  const byLand = (r) => !land || r.cc === land;
  const byRegion = (r) => !region || inRegion(r, region);

  const matching = base.filter((r) => byStatus(r) && byLand(r) && byRegion(r));
  const rows = matching.slice(0, QUEUE_LIMIT);
  const countMap = {};
  for (const r of base) if (byLand(r) && byRegion(r)) countMap[r.status] = (countMap[r.status] || 0) + 1;
  const counts = Object.entries(countMap).map(([st, n]) => ({ status: st, n }));
  const countryMap = {};
  for (const r of base) if (r.cc && byStatus(r) && byRegion(r)) countryMap[r.cc] = (countryMap[r.cc] || 0) + 1;
  const countries = Object.entries(countryMap).map(([code, n]) => ({ code, n, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const regionOptions = allRegions.map((g) => ({ id: g.id, name: g.name, n: base.filter((r) => byStatus(r) && byLand(r) && inRegion(r, g)).length }))
    .filter((g) => g.n || (region && g.id === region.id));

  // Offene Prüfpunkte je Objekt (nur Admin-Prüfung und live)
  for (const r of rows) {
    if (!r.entity_id || !['admin_review', 'live'].includes(r.status)) continue;
    const l = await reviewlist.load(r.id);
    if (l) r.review = { open: l.review.open, blockers: l.review.blockers };
  }
  const allRankings = await db.many(`SELECT id, name FROM rankings ORDER BY name`);
  res.render('admin/queue', {
    title: 'Warteschlange', rows, total: matching.length, limit: QUEUE_LIMIT, status, rankingId, counts, allRankings,
    q, land, regionId: region ? region.id : null, countries, regionOptions,
  });
}));

// ---------- Detailansicht ----------

async function loadDetail(id) {
  const sub = await db.one(
    `SELECT s.*, u.email AS created_by_email FROM submissions s LEFT JOIN admin_users u ON u.id = s.created_by WHERE s.id = $1`, [id]
  );
  if (!sub) return null;
  const ranking = await rankings.getRanking(sub.ranking_id);
  const [categories, criteria] = await Promise.all([rankings.getCategories(ranking.id), rankings.getCriteria(ranking.id)]);
  let entity = null;
  let er = null;
  let facts = [];
  let climate = [];
  let images = [];
  if (sub.entity_id) {
    entity = await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]);
    er = await db.one('SELECT * FROM entity_rankings WHERE entity_id = $1 AND ranking_id = $2', [entity.id, ranking.id]);
    facts = await rankings.getFacts(entity.id, ranking.id);
    climate = await rankings.getClimate(entity.id);
    images = await db.many('SELECT * FROM entity_images WHERE entity_id = $1 ORDER BY sort_order, created_at', [entity.id]);
  }
  const result = scoring.computeScore(criteria, rankings.factMap(facts), climate, await rankings.scoreOptions(ranking));
  const emails = await db.many('SELECT * FROM email_log WHERE submission_id = $1 ORDER BY created_at', [sub.id]);
  // Mögliche Dublette (oder bereits als Dublette abgeschlossen): Vergleichsobjekt laden
  const dupId = sub.possible_duplicate_of || (sub.status === 'duplicate' ? sub.entity_id : null);
  const duplicateOf = dupId ? await db.one('SELECT id, name, city, country, website, slug FROM entities WHERE id = $1', [dupId]) : null;
  // Anfragen an den Betreiber mit Antworten
  let inquiryList = [];
  let unclear = [];
  if (entity) {
    inquiryList = await db.many(
      `SELECT * FROM inquiries WHERE entity_id = $1 AND ranking_id = $2 ORDER BY created_at DESC`, [entity.id, ranking.id]
    );
    const answers = inquiryList.length
      ? await db.many(`SELECT * FROM inquiry_answers WHERE inquiry_id = ANY($1::uuid[]) ORDER BY created_at`, [inquiryList.map((i) => i.id)])
      : [];
    const featureAnswers = inquiryList.length
      ? await db.many(`SELECT a.*, f.label FROM inquiry_feature_answers a JOIN features f ON f.id = a.feature_id WHERE a.inquiry_id = ANY($1::uuid[]) ORDER BY a.known DESC, f.sort_order, f.label`, [inquiryList.map((i) => i.id)])
      : [];
    for (const i of inquiryList) {
      i.answers = answers.filter((a) => a.inquiry_id === i.id);
      i.featureAnswers = featureAnswers.filter((a) => a.inquiry_id === i.id);
    }
    unclear = inquiries.unclearCriteria(criteria, facts);
  }
  const consents = entity
    ? await db.many(`SELECT * FROM consents WHERE entity_id = $1 AND site_id = $2 ORDER BY withdrawn_at NULLS FIRST, granted_at DESC`, [entity.id, ranking.site_id])
    : [];
  const personas = Object.fromEntries((await db.many('SELECT id, name FROM personas')).map((p) => [p.id, p.name]));
  // Leistungen: Katalog, abgeleitete (aus Fakten) und manuell gepflegte
  const featureCatalog = await featureService.catalog(ranking.entity_type);
  const present = entity ? await featureService.forEntity(ranking.entity_type, entity.id) : [];
  const manualFeatures = entity ? await db.many('SELECT * FROM entity_features WHERE entity_id = $1', [entity.id]) : [];
  // Anfragen: Vorschlag „Bekannte Angaben bestätigen lassen“ (Werte Stufe 2/4 ohne die gefragten, erfasste Leistungen)
  const confirmFeatureList = featureCatalog.filter((f) => !f.derive && manualFeatures.some((m) => m.feature_id === f.id));
  const offerFeatureCount = featureCatalog.filter((f) => !f.derive && !manualFeatures.some((m) => m.feature_id === f.id)).length;
  const confirmDefaults = (askedIds) => inquiries.defaultConfirmSelection(criteria, facts, askedIds, confirmFeatureList.map((f) => f.id));
  // KI-Verbrauch dieses Objekts und des laufenden Monats
  const llmUsage = entity
    ? await db.many(`SELECT * FROM llm_usage WHERE entity_id = $1 OR submission_id = $2 ORDER BY created_at DESC`, [entity.id, sub.id])
    : await db.many(`SELECT * FROM llm_usage WHERE submission_id = $1 ORDER BY created_at DESC`, [sub.id]);
  const llmMonth = await require('../lib/llm').monthSpend();
  // Beschreibungstext: gespeicherter Stand + ob die Fakten seitdem geändert wurden
  let text = null;
  let textStale = false;
  if (entity) {
    text = await db.one('SELECT * FROM entity_texts WHERE entity_id = $1 AND ranking_id = $2', [entity.id, ranking.id]);
    if (text && text.input_hash) textStale = describer.inputHash(await describer.gather(entity.id, ranking.id)) !== text.input_hash;
  }
  // Bewertung, die der Melder zusammen mit dem Vorschlag abgegeben hat (wartet bis zur Freigabe)
  const heldReview = await require('../services/reviews').heldFor(sub.id);
  // Partnerlinks (alle Programme, auch inaktive, damit Links vorbereitet werden können)
  const partnerPrograms = entity ? await partners.programs() : [];
  const partnerLinks = entity ? await db.many('SELECT * FROM entity_links WHERE entity_id = $1', [entity.id]) : [];
  const partnerAbsent = entity ? (await db.many('SELECT program_id FROM entity_link_absences WHERE entity_id = $1', [entity.id])).map((r) => r.program_id) : [];
  // Verknüpfte Quellen (z. B. Camp-Anbieter dieses Objekts) für Kriterien mit link_source
  const campLinks = entity && criteria.some((c) => c.link_source === 'camp_providers') ? await require('../services/camps').forEntity(entity.id) : [];
  // Camp-Anbieter in diesem Objekt pflegen (Auswahl aller Anbieter der Site)
  // Herkunft: Hotel-Meldung aus der automatischen Camp-Prüfung
  const campSource = sub.source_camp_provider_id ? await db.one('SELECT id, name FROM camp_providers WHERE id = $1', [sub.source_camp_provider_id]) : null;
  const hunterSvc = require('../services/hunter');
  const hunterInfo = hunterSvc.enabled() ? { enabled: true, ...(await hunterSvc.quota()) } : { enabled: false };
  const campProviderOptions = entity ? await require('../services/camps').providerOptions(ranking.site_id) : [];
  const campSelectedIds = entity ? (await db.many('SELECT DISTINCT provider_id FROM camp_provider_hotels WHERE entity_id = $1', [entity.id])).map((r) => r.provider_id) : [];
  // Postfach: Verlauf mit dem Betreiber (gesendete und eingegangene Mails), Absender-Auswahl
  const mailThread = entity ? await require('../services/mailbox').thread({ entityId: entity.id }) : [];
  const adminMail = require('./admin-mail');
  const mailPersonas = entity ? await adminMail.personas() : [];
  const mailDefaultPersona = adminMail.defaultPersona(mailPersonas, null);
  // Grunddaten (Website, Google-Eintrag, Koordinaten) – Voraussetzung für die Auto-Prüfung
  const basicsMissing = entity ? basics.missing(entity) : [];
  return {
    basicsMissing, BASICS_KEYS: basics.KEYS, placesEnabledForBasics: places.enabled(),
    mailThread, mailPersonas, mailDefaultPersona,
    partnerAbsent, campLinks, campSource, hunterInfo, campProviderOptions, campSelectedIds, heldReview, partnerPrograms, partnerLinks,
    sub, ranking, categories, criteria, entity, er, facts, climate, images, result, emails, inquiryList, unclear, consents, personas,
    featureCatalog, presentFeatureIds: present.map((f) => f.id), manualFeatures, duplicateOf, llmUsage, llmMonth, text, textStale,
    confirmFeatureList, offerFeatureCount, confirmDefaults,
  };
}

router.get('/meldungen/:id', wrap(async (req, res, next) => {
  const d = await loadDetail(req.params.id);
  if (!d) return next();
  const factByCrit = Object.fromEntries(d.facts.map((f) => [f.criterion_id, f]));
  const detailByCrit = Object.fromEntries(d.result.details.map((x) => [x.criterionId, x]));
  const criteriaByCode = Object.fromEntries(d.criteria.map((c) => [c.code, c]));
  const dismissals = d.entity ? await db.many('SELECT * FROM review_dismissals WHERE entity_id = $1 AND ranking_id = $2', [d.entity.id, d.ranking.id]) : [];
  const review = reviewlist.build(d, dismissals);
  // Ergebnis der Google-Suche nur einmal anzeigen (wird nicht gespeichert)
  const ps = req.session.placeSearch;
  const placeSearch = ps && ps.sub === req.params.id ? ps : null;
  if (ps) delete req.session.placeSearch;
  res.render('admin/detail', {
    review,
    placeSearch,
    placesEnabled: places.enabled(),
    bestMonths: require('../lib/seo').bestMonths(d.ranking.formula, d.climate),
    placesMapsLink: places.mapsLink,
    title: d.entity ? d.entity.name : d.sub.entity_name,
    ...d,
    factByCrit,
    detailByCrit,
    criteriaByCode,
    TRUST_LABELS,
    IMAGE_SOURCES,
    CONSENT_TYPES: require('../lib/consents').TYPES,
    describeValue: scoring.describeValue,
    SUMMARY_MAX: describer.SUMMARY_MAX,
    MAX_IMAGES: media.MAX_PER_ENTITY,
    flash: req.query.ok || null,
    error: req.query.fehler || null,
  });
}));

// Formularwert -> Wert-JSON. Ergebnis: undefined = unbekannt, null = ungültig
function parseAdminValue(c, raw) {
  const s = c.scoring;
  if (s.type === 'option') return scoring.optionValue(s, raw); // eine Ausprägung oder Liste (Mehrfachauswahl)
  const v = raw === undefined || raw === null ? '' : String(raw).trim();
  if (v === '') return undefined;
  switch (s.type) {
    case 'bool':
      return v === 'true' ? { bool: true } : v === 'false' ? { bool: false } : null;
    case 'rating':
    case 'bands': {
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? { number: n } : null;
    }
    default:
      return undefined; // climate: kommt aus climate_monthly
  }
}

router.post('/meldungen/:id/fakten', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const criteria = await rankings.getCriteria(sub.ranking_id);
  const existing = Object.fromEntries((await rankings.getFacts(sub.entity_id, sub.ranking_id)).map((f) => [f.criterion_id, f]));
  const input = req.body.facts || {};
  const adminId = req.session.admin.id;
  const errors = [];

  await db.tx(async (client) => {
    for (const c of criteria) {
      const f = input[c.id];
      if (!f || scoring.isDerived(c)) continue;
      const value = parseAdminValue(c, f.value);
      const old = existing[c.id];
      if (value === null) {
        errors.push(c.label);
        continue;
      }
      if (value === undefined) {
        if (old) {
          await client.query('DELETE FROM entity_facts WHERE id = $1', [old.id]);
          await logAction(adminId, 'fact', old.id, 'delete_fact', { criterion: c.code, old: old.value }, client);
        }
        continue;
      }
      const trust = TRUST_SOURCE[Number(f.trust)] ? Number(f.trust) : 2;
      const evidenceUrl = normalizeUrl(f.evidence_url) || null;
      const evidenceText = String(f.evidence_text || '').trim().slice(0, 1000) || null;
      const disputed = f.disputed === 'on';
      const valueChanged = !old || JSON.stringify(old.value) !== JSON.stringify(value);
      const changed =
        valueChanged || old.trust_level !== trust || old.evidence_url !== evidenceUrl || old.evidence_text !== evidenceText || old.disputed !== disputed;
      if (!changed) continue;
      const row = await client.query(
        `INSERT INTO entity_facts (entity_id, criterion_id, value, source, trust_level, evidence_url, evidence_text, disputed, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (entity_id, criterion_id) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source,
           trust_level = EXCLUDED.trust_level, evidence_url = EXCLUDED.evidence_url, evidence_text = EXCLUDED.evidence_text,
           disputed = EXCLUDED.disputed,
           checked_at = CASE WHEN entity_facts.value <> EXCLUDED.value OR entity_facts.trust_level <> EXCLUDED.trust_level
                             THEN now() ELSE entity_facts.checked_at END
         RETURNING id`,
        [sub.entity_id, c.id, JSON.stringify(value), TRUST_SOURCE[trust], trust, evidenceUrl, evidenceText, disputed]
      );
      await logAction(adminId, 'fact', row.rows[0].id, 'edit_fact', {
        criterion: c.code, old: old ? { value: old.value, trust: old.trust_level } : null, new: { value, trust },
      }, client);
    }
  });
  await rankings.recomputeEntity(sub.entity_id, sub.ranking_id);
  const q = errors.length ? `fehler=${encodeURIComponent('Ungültige Werte: ' + errors.join(', '))}` : 'ok=Fakten+gespeichert';
  res.redirect(`/admin/meldungen/${sub.id}?${q}#fakten`);
}));

// Live-Score-Vorschau beim Bearbeiten (ohne zu speichern)
router.post('/api/score-preview', wrap(async (req, res) => {
  if (!UUID_RE.test(String(req.body.submissionId || ''))) return res.status(400).json({ error: 'submissionId' });
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.body.submissionId]);
  if (!sub) return res.status(404).json({ error: 'not found' });
  const ranking = await rankings.getRanking(sub.ranking_id);
  const criteria = await rankings.getCriteria(ranking.id);
  const facts = {};
  for (const c of criteria) {
    const raw = req.body.facts && req.body.facts[c.id];
    const v = parseAdminValue(c, raw);
    if (v) facts[c.id] = v;
  }
  const climate = sub.entity_id ? await rankings.getClimate(sub.entity_id) : [];
  const r = scoring.computeScore(criteria, facts, climate, await rankings.scoreOptions(ranking));
  res.json({
    score: r.score, factScore: r.factScore, completeness: r.completeness, label: r.label, ko: r.ko, koReason: r.koReason,
    eligible: r.eligible, month: r.month, details: r.details.map((d) => ({ id: d.criterionId, points: d.points, known: d.known, invalid: d.invalid })),
  });
}));

router.post('/meldungen/:id/objekt', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const old = await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]);
  const b = req.body;
  const num = (v) => (String(v || '').trim() === '' ? null : Number(String(v).replace(',', '.')));
  const upd = {
    name: String(b.name || old.name).trim(),
    city: String(b.city || '').trim() || null,
    country: String(b.country || '').trim().toUpperCase().slice(0, 2) || null,
    website: normalizeUrl(b.website),
    lat: num(b.lat),
    lng: num(b.lng),
    // Buchungslinks laufen über Partnerlinks (entity_links); alte Felder bleiben unverändert
    booking_url: old.booking_url,
    booking_provider: old.booking_provider,
    contact_email: String(b.contact_email || '').trim().toLowerCase() || null,
  };
  // Google Place ID (optional, nur für den exakten Link zu den Google-Bewertungen)
  const placeId = String(b.google_place_id || '').trim();
  if (placeId && !/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) {
    return res.redirect(`/admin/meldungen/${sub.id}?fehler=${encodeURIComponent('Google Place ID ungültig (Beispiel: ChIJ…).')}`);
  }
  if (upd.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(upd.contact_email)) {
    return res.redirect(`/admin/meldungen/${sub.id}?fehler=${encodeURIComponent('Kontakt-E-Mail ist ungültig.')}`);
  }
  const emailChanged = (old.contact_email || null) !== upd.contact_email;
  await db.query(
    `UPDATE entities SET name=$2, city=$3, country=$4, website=$5, lat=$6, lng=$7, booking_url=$8, booking_provider=$9,
       contact_email=$10,
       attributes = CASE WHEN $12 = '' THEN attributes - 'google_place_id' ELSE attributes || jsonb_build_object('google_place_id', $12::text) END,
       contact_email_source = CASE WHEN $11 THEN 'admin' ELSE contact_email_source END,
       contact_email_evidence = CASE WHEN $11 THEN NULL ELSE contact_email_evidence END,
       updated_at=now() WHERE id=$1`,
    [old.id, upd.name, upd.city, upd.country, upd.website, upd.lat, upd.lng, upd.booking_url, upd.booking_provider,
      upd.contact_email, emailChanged, placeId]
  );
  if (placeId !== ((old.attributes || {}).google_place_id || '')) {
    await logAction(req.session.admin.id, 'entity', old.id, 'edit_google_place_id', { new: placeId || null });
    if (placeId) {
      await db.query(`UPDATE entities SET attributes = (attributes - 'google_place_suggestion' - 'no_google_place') || jsonb_build_object('google_place_source', jsonb_build_object('via', 'admin', 'at', now())) WHERE id = $1`, [old.id]);
    } else {
      await db.query(`UPDATE entities SET attributes = attributes - 'google_place_source' WHERE id = $1`, [old.id]);
    }
  }
  // Koordinaten von Hand geändert: gelten als manuell und werden nie automatisch überschrieben
  const same = (a, b) => (a === null || a === undefined || a === '' ? b === null : b !== null && Math.abs(Number(a) - b) < 1e-7);
  const coordsChanged = !same(old.lat, upd.lat) || !same(old.lng, upd.lng);
  if (coordsChanged) {
    await db.query(upd.lat !== null && upd.lng !== null
      ? `UPDATE entities SET attributes = (attributes - 'geo_suggestion') || jsonb_build_object('geo_source', 'Admin: von Hand eingetragen', 'geo_manual', true) WHERE id = $1`
      : `UPDATE entities SET attributes = attributes - 'geo_source' - 'geo_manual' WHERE id = $1`, [old.id]);
  }
  const diff = Object.fromEntries(Object.entries(upd).filter(([k, v]) => String(old[k] ?? '') !== String(v ?? '')).map(([k, v]) => [k, { old: old[k], new: v }]));
  if (Object.keys(diff).length) await logAction(req.session.admin.id, 'entity', old.id, 'edit_entity', diff);
  const note = await basics.continueIfReady(sub.id, { coordsChanged: coordsChanged && upd.lat !== null });
  res.redirect(`/admin/meldungen/${sub.id}?ok=${encodeURIComponent(`Stammdaten gespeichert${note ? ` – ${note}` : ''}`)}`);
}));

// Kontaktadresse suchen (OpenStreetMap, dann Hunter.io), Vorschlag übernehmen oder verwerfen
router.post('/meldungen/:id/kontakt-suche', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  const msg = await require('../services/contacts').fallback(t.entity, { force: true });
  await logAction(req.session.admin.id, 'entity', t.entity.id, 'search_contact_email', { result: msg });
  res.redirect(backTo(t.sub.id, 'ok', msg));
}));

router.post('/meldungen/:id/kontakt-vorschlag/uebernehmen', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  const s = await require('../services/contacts').acceptSuggestion(t.entity.id, req.session.admin.id);
  res.redirect(backTo(t.sub.id, 'ok', s ? `Kontaktadresse ${s.email} übernommen` : 'Kein Vorschlag vorhanden'));
}));

router.post('/meldungen/:id/kontakt-vorschlag/verwerfen', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  await require('../services/contacts').dismissSuggestion(t.entity.id, req.session.admin.id);
  res.redirect(backTo(t.sub.id, 'ok', 'Vorschlag verworfen'));
}));

// Camp-Anbieter, die in diesem Objekt Camps durchführen (gleiche Tabelle wie im Anbieter-Formular)
router.post('/meldungen/:id/camp-anbieter', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  const { site_id: siteId } = await db.one('SELECT r.site_id FROM submissions s JOIN rankings r ON r.id = s.ranking_id WHERE s.id = $1', [t.sub.id]);
  const allowed = new Set((await require('../services/camps').providerOptions(siteId)).map((p) => p.id));
  const ids = [...new Set([].concat(req.body.providers || []).filter((v) => UUID_RE.test(v) && allowed.has(v)))];
  const r = await db.tx(async (c) => {
    const out = await require('../services/camps').setEntityProviders(c, t.entity, ids);
    if (out.added.length || out.removed.length) await logAction(req.session.admin.id, 'entity', t.entity.id, 'edit_camp_providers', out, c);
    return out;
  });
  const msg = r.added.length || r.removed.length ? `Camp-Anbieter gespeichert (${r.added.length} hinzugefügt, ${r.removed.length} entfernt)` : 'Keine Änderung';
  res.redirect(`/admin/meldungen/${t.sub.id}?ok=${encodeURIComponent(msg)}#camp-anbieter`);
}));

// Partnerlinks eines Objekts (Booking.com, HolidayCheck …): je Programm Buchungs- und Bewertungsseite
router.post('/meldungen/:id/partnerlinks', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  const { errors, changes } = await partners.saveLinks(t.entity.id, req.body.links, req.session.admin.id);
  if (changes.length) await logAction(req.session.admin.id, 'entity', t.entity.id, 'edit_partner_links', { changes });
  const msg = errors.length ? errors.join(' ') : changes.length ? `Partnerlinks gespeichert (${changes.length} Änderung${changes.length === 1 ? "" : "en"})` : 'Keine Änderung';
  res.redirect(`/admin/meldungen/${t.sub.id}?${errors.length ? 'fehler' : 'ok'}=${encodeURIComponent(msg)}#partnerlinks`);
}));

// ---------- Google Place ID (Suche über die Places API, Übernahme nur durch den Admin) ----------

const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
const subEntity = async (subId) => {
  const sub = UUID_RE.test(subId) ? await db.one('SELECT id, entity_id FROM submissions WHERE id = $1', [subId]) : null;
  return sub && sub.entity_id ? { sub, entity: await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]) } : null;
};
const backTo = (subId, key, msg) => `/admin/meldungen/${subId}?${key}=${encodeURIComponent(msg)}#stammdaten`;

router.post('/meldungen/:id/google-suche', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  try {
    // ohne Koordinaten entscheidet Land, Ort/PLZ und Name über den eindeutigen Treffer (wie in der Auto-Prüfung)
    const r = await places.identify(t.entity);
    const candidates = r.candidates.map(({ location, ...c }) => c); // Google-Positionen nicht in die Sitzung
    req.session.placeSearch = { sub: t.sub.id, query: r.query, candidates, pick: r.pick && r.pick.id };
    req.session.save(() => res.redirect(`/admin/meldungen/${t.sub.id}#stammdaten`));
  } catch (err) {
    res.redirect(backTo(t.sub.id, 'fehler', err.message));
  }
}));

router.post('/meldungen/:id/google-place', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  const placeId = String(req.body.place_id || '').trim();
  if (!PLACE_ID_RE.test(placeId)) return res.redirect(backTo(t.sub.id, 'fehler', 'Google Place ID ungültig.'));
  await places.accept(t.entity.id, placeId);
  await logAction(req.session.admin.id, 'entity', t.entity.id, 'edit_google_place_id', { new: placeId, via: 'google_search' });
  const note = await basics.continueIfReady(t.sub.id);
  res.redirect(backTo(t.sub.id, 'ok', `Google Place ID übernommen${note ? ` – ${note}` : ''}`));
}));

// Grunddaten: Koordinaten per Klick in die Karte oder aus dem Vorschlag übernehmen (gelten als vom Admin gesetzt)
router.post('/meldungen/:id/koordinaten', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  const num = (v) => Number(String(v || '').replace(',', '.'));
  const how = { karte: 'in der Karte gesetzt', vorschlag: 'Vorschlag bestätigt' }[req.body.how] || 'von Hand eingetragen';
  try {
    await basics.setManual(t.entity.id, num(req.body.lat), num(req.body.lng), how, req.session.admin.id);
  } catch (err) {
    return res.redirect(backTo(t.sub.id, 'fehler', err.message));
  }
  const note = await basics.continueIfReady(t.sub.id, { coordsChanged: true });
  res.redirect(`/admin/meldungen/${t.sub.id}?ok=${encodeURIComponent(`Koordinaten gespeichert${note ? ` – ${note}` : ''}`)}#grunddaten`);
}));

// Grunddaten: „Keine Website“ bzw. „Kein Google-Eintrag“ markieren (oder Markierung aufheben)
router.post('/meldungen/:id/grunddaten/fehlt', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  try {
    await basics.setAbsent(t.entity.id, String(req.body.key || ''), req.body.absent === '1', req.session.admin.id);
  } catch (err) {
    return res.redirect(backTo(t.sub.id, 'fehler', err.message));
  }
  const note = await basics.continueIfReady(t.sub.id);
  res.redirect(`/admin/meldungen/${t.sub.id}?ok=${encodeURIComponent(`Gespeichert${note ? ` – ${note}` : ''}`)}#grunddaten`);
}));

router.post('/meldungen/:id/google-verwerfen', wrap(async (req, res, next) => {
  const t = await subEntity(req.params.id);
  if (!t) return next();
  await places.dismiss(t.entity.id);
  res.redirect(backTo(t.sub.id, 'ok', 'Vorschlag verworfen'));
}));

// Übersicht aller Objekte: Place ID vorhanden, vorgeschlagen, unklar oder noch nicht gesucht
router.get('/google-orte', wrap(async (req, res) => {
  const list = await db.many(
    `SELECT e.id, e.name, e.city, e.country, e.lat, e.attributes,
            (SELECT s.id FROM submissions s WHERE s.entity_id = e.id ORDER BY s.created_at DESC LIMIT 1) AS sub_id,
            (SELECT string_agg(DISTINCT er.status::text, ', ') FROM entity_rankings er WHERE er.entity_id = e.id) AS statuses
       FROM entities e
      WHERE EXISTS (SELECT 1 FROM entity_rankings er WHERE er.entity_id = e.id AND er.status IN ('in_review', 'live'))
      ORDER BY lower(e.name)`);
  const state = (e) => {
    const a = e.attributes || {};
    if (a.google_place_id) return 'set';
    return (a.google_place_suggestion || {}).status || 'open';
  };
  for (const e of list) e.state = state(e);
  res.render('admin/google-places', {
    title: 'Google Place IDs', list, placesEnabled: places.enabled(), mapsLink: places.mapsLink, MAX_DISTANCE_M: places.MAX_DISTANCE_M,
    flash: req.query.ok || null, error: req.query.fehler || null,
  });
}));

// Sammelsuche: alle Objekte ohne Place ID und ohne bisherigen Vorschlag (mit alle=1 auch unklare/verworfene erneut)
router.post('/google-orte/suchen', wrap(async (req, res) => {
  if (!places.enabled()) return res.redirect('/admin/google-orte?fehler=GOOGLE_PLACES_KEY+fehlt');
  const again = req.body.alle === '1';
  const list = await db.many(
    `SELECT e.* FROM entities e
      WHERE NOT (e.attributes ? 'google_place_id')
        AND ($1 OR NOT (e.attributes ? 'google_place_suggestion') OR e.attributes->'google_place_suggestion'->>'status' = 'error')
        AND EXISTS (SELECT 1 FROM entity_rankings er WHERE er.entity_id = e.id AND er.status IN ('in_review', 'live'))
      ORDER BY lower(e.name) LIMIT 60`, [again]);
  const count = { found: 0, unclear: 0, none: 0, error: 0 };
  let lastError = null;
  for (const e of list) {
    try {
      count[(await places.suggest(e)).status] += 1;
    } catch (err) {
      count.error += 1;
      lastError = err.message;
      if (/API key|PERMISSION|403|401/i.test(err.message)) break; // Schlüsselproblem: nicht weiter versuchen
    }
  }
  await logAction(req.session.admin.id, 'admin_user', req.session.admin.id, 'google_place_bulk_search', count);
  const msg = `${list.length} gesucht: ${count.found} eindeutig, ${count.unclear} unklar, ${count.none} ohne Treffer${count.error ? `, ${count.error} Fehler` : ''}`;
  res.redirect(`/admin/google-orte?${lastError ? `fehler=${encodeURIComponent(`${msg} – ${lastError}`)}` : `ok=${encodeURIComponent(msg)}`}`);
}));

router.post('/google-orte/:entityId/uebernehmen', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.entityId)) return next();
  const e = await db.one('SELECT id, attributes FROM entities WHERE id = $1', [req.params.entityId]);
  const s = e && (e.attributes || {}).google_place_suggestion;
  if (!s || s.status !== 'found' || !PLACE_ID_RE.test(s.id || '')) return res.redirect('/admin/google-orte?fehler=Kein+Vorschlag+vorhanden');
  await places.accept(e.id, s.id);
  await logAction(req.session.admin.id, 'entity', e.id, 'edit_google_place_id', { new: s.id, via: 'google_suggestion' });
  res.redirect(`/admin/google-orte?ok=Place+ID+%C3%BCbernommen#e-${e.id}`);
}));

router.post('/google-orte/:entityId/verwerfen', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.entityId)) return next();
  await places.dismiss(req.params.entityId);
  res.redirect(`/admin/google-orte?ok=Vorschlag+verworfen#e-${req.params.entityId}`);
}));

router.post('/meldungen/:id/freigeben', wrap(async (req, res) => {
  try {
    await submissions.approve(req.params.id, req.session.admin.id);
    const sub = await db.one('SELECT submitter_email, verified_by FROM submissions WHERE id = $1', [req.params.id]);
    res.redirect(`/admin/meldungen/${req.params.id}?ok=${encodeURIComponent(submissions.mayMailSubmitter(sub) ? 'Freigegeben und Mail versendet' : 'Freigegeben')}`);
  } catch (err) {
    res.redirect(`/admin/meldungen/${req.params.id}?fehler=${encodeURIComponent(err.message)}`);
  }
}));

// Unbestätigte Meldung ohne E-Mail-Bestätigung in die Auto-Prüfung geben
router.post('/meldungen/:id/bestaetigen', wrap(async (req, res) => {
  try {
    await submissions.verifyByAdmin(req.params.id, req.session.admin.id);
    res.redirect(`/admin/meldungen/${req.params.id}?ok=${encodeURIComponent('Auto-Prüfung läuft – Seite in etwa einer Minute neu laden')}`);
  } catch (err) {
    res.redirect(`/admin/meldungen/${req.params.id}?fehler=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/meldungen/:id/ablehnen', wrap(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.redirect(`/admin/meldungen/${req.params.id}?fehler=Bitte+eine+Begr%C3%BCndung+angeben`);
  await submissions.reject(req.params.id, req.session.admin.id, reason);
  res.redirect(`/admin/meldungen/${req.params.id}?ok=Abgelehnt`);
}));

router.post('/meldungen/:id/dublette', wrap(async (req, res) => {
  try {
    if (req.body.decision === 'same') {
      await submissions.confirmDuplicate(req.params.id, req.session.admin.id);
      return res.redirect(`/admin/meldungen/${req.params.id}?ok=Als+Dublette+zusammengef%C3%BChrt`);
    }
    await submissions.rejectDuplicate(req.params.id, req.session.admin.id);
    res.redirect(`/admin/meldungen/${req.params.id}?ok=${encodeURIComponent('Eigenes Objekt – Auto-Prüfung läuft')}`);
  } catch (err) {
    res.redirect(`/admin/meldungen/${req.params.id}?fehler=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/meldungen/:id/zurueckstellen', wrap(async (req, res) => {
  await submissions.hold(req.params.id, req.session.admin.id, String(req.body.note || '').trim());
  res.redirect(`/admin/meldungen/${req.params.id}?ok=Notiz+gespeichert`);
}));

router.post('/meldungen/:id/pruefen', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub) return next();
  if (!['verified', 'auto_check', 'basics', 'admin_review'].includes(sub.status)) {
    return res.redirect(`/admin/meldungen/${sub.id}?fehler=Auto-Pr%C3%BCfung+nur+vor+der+Freigabe+m%C3%B6glich`);
  }
  await submissions.setStatus(sub.id, 'verified');
  await logAction(req.session.admin.id, 'submission', sub.id, 'rerun_auto_check');
  const jobs = require('../jobs/auto-check');
  jobs.run(sub.id).catch((err) => console.error('[admin] auto-check', err));
  res.redirect(`/admin/meldungen/${sub.id}?ok=Auto-Pr%C3%BCfung+l%C3%A4uft`);
}));

// Alle automatischen Vorschläge mit Fundstelle (und nicht strittig) als „Admin geprüft“ übernehmen
router.post('/meldungen/:id/vorschlaege-bestaetigen', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const rows = await db.many(
    `UPDATE entity_facts f SET trust_level = 2, source = 'admin', checked_at = now()
      FROM criteria c WHERE c.id = f.criterion_id AND c.ranking_id = $2
        AND f.entity_id = $1 AND f.trust_level = 4 AND f.evidence_url IS NOT NULL AND NOT f.disputed
      RETURNING f.id, c.code`,
    [sub.entity_id, sub.ranking_id]
  );
  for (const r of rows) await logAction(req.session.admin.id, 'fact', r.id, 'confirm_auto_fact', { criterion: r.code });
  await rankings.recomputeEntity(sub.entity_id, sub.ranking_id);
  res.redirect(`/admin/meldungen/${sub.id}?ok=${encodeURIComponent(`${rows.length} Vorschläge als geprüft übernommen`)}#fakten`);
}));

// Einzelnen Vorschlag unverändert übernehmen (Stufe 4 -> 2), sofort gespeichert; Antwort für die Prüfansicht
router.post('/meldungen/:id/fakten/:critId/uebernehmen', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.critId)) return next();
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const row = await db.one(
    `UPDATE entity_facts f SET trust_level = 2, source = 'admin', checked_at = now(), disputed = false
       FROM criteria c WHERE c.id = f.criterion_id AND c.ranking_id = $3
        AND f.entity_id = $1 AND f.criterion_id = $2 AND f.trust_level = 4
      RETURNING f.id, c.code`,
    [sub.entity_id, req.params.critId, sub.ranking_id]);
  if (!row) return res.status(409).json({ error: 'Kein offener Vorschlag – bitte Seite neu laden.' });
  await logAction(req.session.admin.id, 'fact', row.id, 'confirm_auto_fact', { criterion: row.code });
  const result = await rankings.recomputeEntity(sub.entity_id, sub.ranking_id);
  res.json({ ok: true, score: result.score, completeness: result.completeness });
}));

// Live-Objekt: Auto-Prüfung im Hintergrund wiederholen, Objekt bleibt online (neue Werte nur als Vorschläge)
router.post('/meldungen/:id/aktualisieren', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub) return next();
  if (sub.status !== 'live' || !sub.entity_id) {
    return res.redirect(`/admin/meldungen/${sub.id}?fehler=${encodeURIComponent('Nur für freigegebene Objekte – sonst „Auto-Prüfung erneut starten“.')}`);
  }
  await logAction(req.session.admin.id, 'submission', sub.id, 'refresh_auto_check');
  await submissions.appendLog(sub.id, 'Daten aktualisieren', true, 'Vom Admin gestartet – Objekt bleibt online.');
  const jobs = require('../jobs/auto-check');
  jobs.run(sub.id, { refresh: true }).catch((err) => console.error('[admin] refresh', err));
  res.redirect(`/admin/meldungen/${sub.id}?ok=${encodeURIComponent('Aktualisierung läuft – Seite in 1–2 Minuten neu laden')}`);
}));

// ---------- Leistungen je Objekt (nur Katalog-Einträge ohne Ableitung) ----------

router.post('/meldungen/:id/leistungen', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const entity = await db.one('SELECT entity_type FROM entities WHERE id = $1', [sub.entity_id]);
  const manualCatalog = (await featureService.catalog(entity.entity_type)).filter((f) => !f.derive);
  const wanted = new Set([].concat(req.body.features || []));
  const existing = await db.many('SELECT * FROM entity_features WHERE entity_id = $1', [sub.entity_id]);
  const has = new Set(existing.map((e) => e.feature_id));
  const added = [];
  const removed = [];
  await db.tx(async (c) => {
    for (const f of manualCatalog) {
      if (wanted.has(f.id) && !has.has(f.id)) {
        await c.query(
          `INSERT INTO entity_features (entity_id, feature_id, source, trust_level) VALUES ($1, $2, 'admin', 2)`, [sub.entity_id, f.id]
        );
        added.push(f.code);
      } else if (!wanted.has(f.id) && has.has(f.id)) {
        await c.query('DELETE FROM entity_features WHERE entity_id = $1 AND feature_id = $2', [sub.entity_id, f.id]);
        removed.push(f.code);
      } else if (wanted.has(f.id) && req.body[`confirm_${f.id}`] === 'on') {
        // automatisch vorgeschlagene Leistung bestätigen
        await c.query(
          `UPDATE entity_features SET source = 'admin', trust_level = 2, checked_at = now() WHERE entity_id = $1 AND feature_id = $2 AND trust_level = 4`,
          [sub.entity_id, f.id]
        );
      }
    }
    if (added.length || removed.length) await logAction(req.session.admin.id, 'entity', sub.entity_id, 'edit_features', { added, removed }, c);
  });
  res.redirect(`/admin/meldungen/${sub.id}?ok=Leistungen+gespeichert#leistungen`);
}));

// ---------- Anfragen an den Betreiber ----------

// Rücksprung nur auf interne Admin-Seiten (kein offener Redirect)
function safeBack(v) {
  const back = String(v || '');
  return /^\/admin(\/[\w\/-]*)?(#[\w-]+)?$/.test(back) ? back : '/admin/aufgaben';
}

// Auswahl „Bekannte Angaben bestätigen lassen“ aus dem Formular
function confirmFields(body) {
  return {
    confirmCriteriaIds: [].concat(body.confirm_criteria || []).filter((v) => UUID_RE.test(v)),
    confirmFeatureIds: [].concat(body.confirm_features || []).filter((v) => UUID_RE.test(v)),
    offerFeatures: body.offer_features === 'on',
  };
}

router.post('/meldungen/:id/anfrage', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const ids = [].concat(req.body.criteria || []).filter((v) => UUID_RE.test(v));
  try {
    await inquiries.startDraft({
      entityId: sub.entity_id, rankingId: sub.ranking_id, submissionId: sub.id, criteriaIds: ids,
      askPhotos: req.body.ask_photos === 'on', adminNote: String(req.body.note || '').trim().slice(0, 1000), adminId: req.session.admin.id,
      ...confirmFields(req.body),
    });
    res.redirect(`/admin/meldungen/${sub.id}?ok=${encodeURIComponent('Entwurf formuliert – bitte prüfen und senden.')}#anfragen`);
  } catch (err) {
    res.redirect(`/admin/meldungen/${sub.id}?fehler=${encodeURIComponent(err.message)}#anfragen`);
  }
}));

router.post('/antworten/:answerId/uebernehmen', wrap(async (req, res) => {
  await inquiries.acceptAnswer(req.params.answerId, req.session.admin.id);
  res.redirect(safeBack(req.body.back));
}));

router.post('/antworten/:answerId/verwerfen', wrap(async (req, res) => {
  await inquiries.rejectAnswer(req.params.answerId, req.session.admin.id);
  res.redirect(safeBack(req.body.back));
}));

// Leistungen laut Betreiber übernehmen oder verwerfen; alle unveränderten Bestätigungen einer Anfrage auf einmal
router.post('/leistungs-antworten/:answerId/uebernehmen', wrap(async (req, res) => {
  if (UUID_RE.test(req.params.answerId)) await inquiries.acceptFeatureAnswer(req.params.answerId, req.session.admin.id);
  res.redirect(safeBack(req.body.back));
}));

router.post('/leistungs-antworten/:answerId/verwerfen', wrap(async (req, res) => {
  if (UUID_RE.test(req.params.answerId)) await inquiries.rejectFeatureAnswer(req.params.answerId, req.session.admin.id);
  res.redirect(safeBack(req.body.back));
}));

router.post('/anfragen/:inquiryId/bestaetigungen-uebernehmen', wrap(async (req, res) => {
  const back = safeBack(req.body.back);
  if (!UUID_RE.test(req.params.inquiryId)) return res.redirect(back);
  const r = await inquiries.acceptConfirmations(req.params.inquiryId, req.session.admin.id);
  res.redirect(withParam(back, 'ok', `${r.values} Werte und ${r.features} Leistungen als vom Betreiber bestätigt übernommen.`));
}));

// Einwilligungen: manuell erfassen (z. B. telefonisch/schriftlich) und widerrufen
router.post('/objekte/:entityId/einwilligungen', wrap(async (req, res) => {
  const back = safeBack(req.body.back);
  try {
    await inquiries.addConsent({
      entityId: req.params.entityId, siteId: req.body.site_id, type: req.body.type,
      contactEmail: String(req.body.contact_email || '').trim(), contactName: String(req.body.contact_name || '').trim(),
      note: String(req.body.note || '').trim(), adminId: req.session.admin.id,
    });
    res.redirect(back);
  } catch (err) {
    res.redirect(`${back.split('#')[0]}?fehler=${encodeURIComponent(err.message)}#einwilligungen`);
  }
}));

router.post('/einwilligungen/:consentId/widerrufen', wrap(async (req, res) => {
  await inquiries.withdrawConsent(req.params.consentId, req.session.admin.id, String(req.body.note || '').trim());
  res.redirect(safeBack(req.body.back));
}));

// Prüfpunkt als erledigt markieren (erscheint wieder, wenn er sich ändert) bzw. alle wieder einblenden
router.post('/pruefpunkte/erledigt', wrap(async (req, res) => {
  const b = req.body;
  const back = backOrNull(b.back) || '/admin/aufgaben';
  if (!UUID_RE.test(b.entity_id || '') || !UUID_RE.test(b.ranking_id || '') || !String(b.key || '').trim()) return res.redirect(back);
  await db.query(
    `INSERT INTO review_dismissals (entity_id, ranking_id, item_key, fingerprint, dismissed_by) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (entity_id, ranking_id, item_key) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, dismissed_by = EXCLUDED.dismissed_by, dismissed_at = now()`,
    [b.entity_id, b.ranking_id, String(b.key).slice(0, 120), String(b.fingerprint || '').slice(0, 2000), req.session.admin.id]
  );
  await logAction(req.session.admin.id, 'entity', b.entity_id, 'dismiss_review_item', { key: b.key });
  res.redirect(back);
}));

router.post('/pruefpunkte/zuruecksetzen', wrap(async (req, res) => {
  const b = req.body;
  if (UUID_RE.test(b.entity_id || '') && UUID_RE.test(b.ranking_id || '')) {
    await db.query('DELETE FROM review_dismissals WHERE entity_id = $1 AND ranking_id = $2', [b.entity_id, b.ranking_id]);
    await logAction(req.session.admin.id, 'entity', b.entity_id, 'reset_review_items');
  }
  res.redirect(backOrNull(b.back) || '/admin/aufgaben');
}));

// Übersicht aller Anfragen an Betreiber: an welches Objekt, an welche Adresse, von wem, mit welchem Stand
const INQUIRY_FILTERS = {
  offen: { label: 'offen (Entwurf, geplant, versendet)', where: `i.status IN ('draft','queued','sent')` },
  draft: { label: 'Entwürfe zur Freigabe', where: `i.status = 'draft'` },
  sent: { label: 'versendet, ohne Antwort', where: `i.status IN ('queued','sent')` },
  answered: { label: 'beantwortet', where: `i.status = 'answered'` },
  failed: { label: 'fehlgeschlagen', where: `i.status = 'failed'` },
  closed: { label: 'abgelaufen oder geschlossen', where: `i.status IN ('expired','closed')` },
  alle: { label: 'alle', where: 'true' },
};
const INQUIRY_STATUS = { draft: 'Entwurf', queued: 'wird formuliert', sent: 'versendet', answered: 'beantwortet', expired: 'abgelaufen', failed: 'fehlgeschlagen', closed: 'geschlossen' };

router.get('/anfragen', wrap(async (req, res) => {
  const status = INQUIRY_FILTERS[req.query.status] ? req.query.status : 'offen';
  const q = String(req.query.q || '').trim().slice(0, 100);
  const rows = await db.many(
    `SELECT i.*, e.name AS entity_name, e.city, p.name AS persona_name, u.email AS created_by_email, a.email AS approved_by_email,
            (SELECT array_agg(c.label ORDER BY c.sort_order) FROM criteria c WHERE c.id = ANY(i.criteria_ids)) AS criteria_labels,
            (SELECT count(*)::int FROM inquiry_answers x WHERE x.inquiry_id = i.id AND x.status = 'pending')
              + (SELECT count(*)::int FROM inquiry_feature_answers x WHERE x.inquiry_id = i.id AND x.status = 'pending') AS pending_answers,
            COALESCE(i.submission_id, (SELECT s.id FROM submissions s WHERE s.entity_id = i.entity_id ORDER BY s.created_at DESC LIMIT 1)) AS sub_id
       FROM inquiries i JOIN entities e ON e.id = i.entity_id
       LEFT JOIN personas p ON p.id = i.persona_id
       LEFT JOIN admin_users u ON u.id = i.created_by LEFT JOIN admin_users a ON a.id = i.approved_by
      WHERE ${INQUIRY_FILTERS[status].where} AND ($1::text IS NULL OR e.name ILIKE $1 OR i.recipient ILIKE $1)
      ORDER BY (i.status = 'draft') DESC, COALESCE(i.answered_at, i.sent_at, i.created_at) DESC LIMIT 300`,
    [q ? `%${q}%` : null]
  );
  const counts = Object.fromEntries(await Promise.all(Object.entries(INQUIRY_FILTERS).map(async ([k, f]) =>
    [k, (await db.one(`SELECT count(*)::int AS n FROM inquiries i WHERE ${f.where}`)).n])));
  res.render('admin/inquiries', { title: 'Anfragen', rows, status, q, counts, INQUIRY_FILTERS, INQUIRY_STATUS, mailProvider: config.mail.provider });
}));

// Entwurf formulieren (Fragen, Fotos und Hinweis aus dem Formular), dann geprüften Text senden, oder verwerfen
router.post('/anfragen/:inquiryId/formulieren', wrap(async (req, res) => {
  const back = backOrNull(req.body.back) || '/admin/anfragen';
  try {
    await inquiries.formulate(req.params.inquiryId, {
      criteriaIds: [].concat(req.body.criteria || []).filter((v) => UUID_RE.test(v)),
      askPhotos: req.body.ask_photos === 'on',
      adminNote: String(req.body.note || '').trim().slice(0, 1000),
      ...confirmFields(req.body),
    }, req.session.admin.id);
    res.redirect(withParam(back, 'ok', 'Entwurf formuliert – bitte prüfen und senden.'));
  } catch (err) {
    res.redirect(withParam(back, 'fehler', err.message));
  }
}));

router.post('/anfragen/:inquiryId/freigeben', wrap(async (req, res) => {
  const back = backOrNull(req.body.back) || '/admin/anfragen';
  try {
    await inquiries.approveDraft(req.params.inquiryId, {
      subject: String(req.body.subject || ''), body: String(req.body.body || '').slice(0, 6000),
    }, req.session.admin.id);
    res.redirect(withParam(back, 'ok', 'Anfrage wird versendet.'));
  } catch (err) {
    res.redirect(withParam(back, 'fehler', err.message));
  }
}));

router.post('/anfragen/:inquiryId/verwerfen', wrap(async (req, res) => {
  await inquiries.discardDraft(req.params.inquiryId, req.session.admin.id);
  res.redirect(withParam(backOrNull(req.body.back) || '/admin/anfragen', 'ok', 'Entwurf verworfen'));
}));

router.post('/anfragen/:inquiryId/schliessen', wrap(async (req, res) => {
  await inquiries.close(req.params.inquiryId, req.session.admin.id);
  res.redirect(safeBack(req.body.back));
}));

// ---------- Objekt selbst anlegen (ohne Bestätigungsmail) ----------

router.get('/neu', wrap(async (req, res) => {
  const all = await db.many(`SELECT * FROM rankings WHERE status <> 'archived' ORDER BY is_default DESC, name`);
  res.render('admin/new', { title: 'Objekt anlegen', rankings: all, errors: [], form: {} });
}));

router.post('/neu', wrap(async (req, res) => {
  const ranking = UUID_RE.test(req.body.ranking_id || '') ? await rankings.getRanking(req.body.ranking_id) : null;
  const form = {
    name: String(req.body.name || '').trim(),
    city: String(req.body.city || '').trim(),
    country: String(req.body.country || '').trim().toUpperCase(),
    website: normalizeUrl(req.body.website),
    notes: String(req.body.notes || '').trim() || null,
  };
  const errors = [];
  if (!ranking) errors.push('Ranking wählen.');
  if (!form.name || !form.city) errors.push('Name und Ort sind Pflicht.');
  if (!/^[A-Z]{2}$/.test(form.country)) errors.push('Land als zweistelliger Code (z. B. ES).');
  if (!form.website) errors.push('Gültige Website angeben.');
  if (errors.length) {
    const all = await db.many(`SELECT * FROM rankings WHERE status <> 'archived' ORDER BY is_default DESC, name`);
    return res.status(422).render('admin/new', { title: 'Objekt anlegen', rankings: all, errors, form: { ...form, ranking_id: req.body.ranking_id } });
  }
  const sub = await submissions.create(ranking, form, { adminId: req.session.admin.id });
  res.redirect(`/admin/meldungen/${sub.id}?ok=Angelegt%2C+Auto-Pr%C3%BCfung+l%C3%A4uft`);
}));

// ---------- Bilder ----------

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(config.uploadDir, { recursive: true });
      cb(null, config.uploadDir);
    },
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

router.post('/objekte/:entityId/bilder', upload.single('file'), wrap(async (req, res) => {
  const b = req.body;
  const back = backOrNull(b.back) || `/admin/meldungen/${b.submission_id}#bilder`;
  const fail = (msg) => {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.redirect(withParam(back, 'fehler', msg));
  };
  const missing = ['license', 'credit', 'release_proof'].filter((k) => !String(b[k] || '').trim());
  if (!req.file || !IMAGE_SOURCES[b.source] || missing.length) return fail('Bild, Quelle, Lizenz, Urhebervermerk und Nachweis sind Pflicht.');
  const { n } = await db.one('SELECT count(*)::int AS n FROM entity_images WHERE entity_id = $1', [req.params.entityId]);
  if (n >= media.MAX_PER_ENTITY) return fail(`Höchstens ${media.MAX_PER_ENTITY} Bilder je Objekt – bitte erst ein Bild entfernen.`);
  // WebP-Varianten erzeugen, Original verwerfen
  const id = crypto.randomUUID();
  let info;
  try {
    info = await media.processEntityImage(id, req.file.path);
  } catch (err) {
    return fail(`Bild konnte nicht verarbeitet werden: ${err.message}`);
  }
  fs.unlink(req.file.path, () => {});
  await db.query(
    `INSERT INTO entity_images (id, entity_id, storage_path, source, license, credit, source_url, release_proof, valid_until, is_primary, width, height, variants)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, req.params.entityId, `entity-images/${id}`, b.source, b.license.trim(), b.credit.trim(), normalizeUrl(b.source_url),
      b.release_proof.trim(), b.valid_until || null, b.is_primary === 'on', info.width, info.height, info.variants]
  );
  await logAction(req.session.admin.id, 'image', id, 'upload_image', { source: b.source, license: b.license });
  res.redirect(withParam(back, 'ok', 'Bild hochgeladen – noch nicht freigegeben'));
}));

// Übersicht aller Objektbilder: Freigaben, ablaufende Rechte, Quelle, Suche nach Objekt
const IMAGE_FILTERS = {
  pending: { label: 'wartet auf Freigabe', where: 'i.approved_at IS NULL' },
  expiring: { label: 'Rechte laufen in 30 Tagen ab', where: `i.valid_until BETWEEN current_date AND current_date + 30` },
  expired: { label: 'Rechte abgelaufen', where: 'i.valid_until < current_date' },
  approved: { label: 'freigegeben und gültig', where: 'i.approved_at IS NOT NULL AND (i.valid_until IS NULL OR i.valid_until >= current_date)' },
  all: { label: 'alle', where: 'true' },
};
const IMAGES_PER_PAGE = 50;

router.get('/bilder', wrap(async (req, res) => {
  const status = IMAGE_FILTERS[req.query.status] ? req.query.status : 'pending';
  const source = IMAGE_SOURCES[req.query.quelle] ? req.query.quelle : null;
  const q = String(req.query.q || '').trim().slice(0, 100);
  const page = Math.max(1, Math.min(1000, Number(req.query.seite) || 1));
  const params = [source, q ? `%${q}%` : null];
  const from = `FROM entity_images i JOIN entities e ON e.id = i.entity_id
     WHERE ${IMAGE_FILTERS[status].where} AND ($1::image_source IS NULL OR i.source = $1) AND ($2::text IS NULL OR e.name ILIKE $2 OR e.city ILIKE $2)`;
  const { n } = await db.one(`SELECT count(*)::int AS n ${from}`, params);
  const rows = await db.many(
    `SELECT i.*, e.name AS entity_name, e.city,
            (SELECT s.id FROM submissions s WHERE s.entity_id = e.id ORDER BY s.created_at DESC LIMIT 1) AS submission_id
       ${from} ORDER BY i.approved_at IS NULL DESC, i.valid_until NULLS LAST, i.created_at DESC
      LIMIT ${IMAGES_PER_PAGE} OFFSET $3`,
    [...params, (page - 1) * IMAGES_PER_PAGE]
  );
  const counts = Object.fromEntries(await Promise.all(Object.entries(IMAGE_FILTERS).map(async ([k, f]) =>
    [k, (await db.one(`SELECT count(*)::int AS n FROM entity_images i WHERE ${f.where}`)).n])));
  res.render('admin/images', {
    title: 'Bilder', rows, total: n, page, pages: Math.max(1, Math.ceil(n / IMAGES_PER_PAGE)),
    status, source, q, counts, IMAGE_FILTERS, IMAGE_SOURCES, MAX_PER_ENTITY: media.MAX_PER_ENTITY,
    back: req.originalUrl, flash: req.query.ok || null, error: req.query.fehler || null,
  });
}));

// Vorschau im Admin (auch nicht freigegebene Bilder): kleinste Variante bzw. Original bei Altbeständen
router.get('/bilder/:id/datei', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const img = await db.one('SELECT id, storage_path, variants FROM entity_images WHERE id = $1', [req.params.id]);
  if (!img) return next();
  const file = img.variants.length ? media.entityFileFor(img.id, img.variants[0]) : path.join(config.uploadDir, path.basename(img.storage_path));
  res.sendFile(file);
}));

router.post('/bilder/:id/freigeben', wrap(async (req, res) => {
  await db.query('UPDATE entity_images SET approved_at = now(), approved_by = $2 WHERE id = $1', [req.params.id, req.session.admin.id]);
  await logAction(req.session.admin.id, 'image', req.params.id, 'approve_image');
  res.redirect(withParam(backOrNull(req.body.back) || `/admin/meldungen/${req.body.submission_id}#bilder`, 'ok', 'Bild freigegeben'));
}));

// Löschen = auch Takedown auf Verlangen des Rechteinhabers
router.post('/bilder/:id/loeschen', wrap(async (req, res) => {
  const img = await db.one('DELETE FROM entity_images WHERE id = $1 RETURNING *', [req.params.id]);
  if (img) {
    media.removeEntityFiles(img);
    await logAction(req.session.admin.id, 'image', img.id, 'delete_image', { reason: req.body.reason || null, license: img.license, credit: img.credit });
  }
  res.redirect(withParam(backOrNull(req.body.back) || `/admin/meldungen/${req.body.submission_id}#bilder`, 'ok', 'Bild entfernt'));
}));

// Rücksprung nur innerhalb des Admins (mit Query), sonst null
function backOrNull(v) {
  const s = String(v || '');
  return /^\/admin(\/|$|\?)/.test(s) && !s.startsWith('//') ? s : null;
}

// Parameter vor einem #anker einfügen
function withParam(url, key, value) {
  const [base, hash] = url.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}${hash ? `#${hash}` : ''}`;
}

// ---------- Beschreibungstext ----------

async function subWithEntity(id) {
  const sub = await db.one('SELECT id, entity_id, ranking_id FROM submissions WHERE id = $1', [id]);
  return sub && sub.entity_id ? sub : null;
}

// Entwurf aus den geprüften Daten erzeugen (überschreibt den bisherigen Entwurf, Status wird „Entwurf“)
router.post('/meldungen/:id/text/erzeugen', wrap(async (req, res, next) => {
  const sub = await subWithEntity(req.params.id);
  if (!sub) return next();
  const back = `/admin/meldungen/${sub.id}`;
  if (config.llm.provider !== 'anthropic') return res.redirect(`${back}?fehler=${encodeURIComponent('Kein KI-Anbieter eingerichtet (LLM_PROVIDER).')}#text`);
  const input = await describer.gather(sub.entity_id, sub.ranking_id);
  const example = await describer.styleExample(sub.ranking_id, sub.entity_id);
  let out;
  try {
    out = await describer.generate(input, example);
  } catch (err) {
    console.error('[describer]', err.message);
    return res.redirect(`${back}?fehler=${encodeURIComponent(`Text konnte nicht erzeugt werden: ${err.message.slice(0, 200)}`)}#text`);
  }
  if (out.usage) {
    await require('../lib/llm').record({ purpose: 'description', model: out.usage.model, usage: out.usage.raw, entityId: sub.entity_id, submissionId: sub.id });
  }
  if (!out.text) return res.redirect(`${back}?fehler=${encodeURIComponent('Das Modell hat keinen Text geliefert.')}#text`);
  await db.query(
    `INSERT INTO entity_texts (entity_id, ranking_id, summary, body, generated_summary, generated_body, input_hash, model, generated_at, status, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $3, $4, $5, $6, now(), 'draft', $7, now())
     ON CONFLICT (entity_id, ranking_id) DO UPDATE SET summary = EXCLUDED.summary, body = EXCLUDED.body,
       generated_summary = EXCLUDED.summary, generated_body = EXCLUDED.body, input_hash = EXCLUDED.input_hash,
       model = EXCLUDED.model, generated_at = now(), status = 'draft', updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [sub.entity_id, sub.ranking_id, out.text.summary, out.text.body, describer.inputHash(input), out.usage.model, req.session.admin.id]
  );
  await logAction(req.session.admin.id, 'entity', sub.entity_id, 'generate_text', { model: out.usage.model, style_example: example ? example.name : null });
  res.redirect(`${back}?ok=${encodeURIComponent('Entwurf erzeugt – bitte prüfen und freigeben')}#text`);
}));

// Speichern, Freigeben, Zurückziehen
router.post('/meldungen/:id/text', wrap(async (req, res, next) => {
  const sub = await subWithEntity(req.params.id);
  if (!sub) return next();
  const back = `/admin/meldungen/${sub.id}`;
  const summary = describer.shorten(req.body.summary, describer.SUMMARY_MAX);
  const body = String(req.body.body || '').replace(/\r/g, '').trim().slice(0, 8000);
  const action = ['save', 'publish', 'unpublish'].includes(req.body.action) ? req.body.action : 'save';
  if (action === 'publish' && (!summary || !body)) return res.redirect(`${back}?fehler=${encodeURIComponent('Kurzbeschreibung und Text sind zum Freigeben nötig.')}#text`);
  const existing = await db.one('SELECT * FROM entity_texts WHERE entity_id = $1 AND ranking_id = $2', [sub.entity_id, sub.ranking_id]);
  // Von Hand geschrieben oder bearbeitet: Fingerabdruck auf den aktuellen Stand setzen, wenn der Admin freigibt
  const hash = action === 'publish' ? describer.inputHash(await describer.gather(sub.entity_id, sub.ranking_id)) : existing && existing.input_hash;
  const status = action === 'publish' ? 'published' : action === 'unpublish' ? 'draft' : (existing ? existing.status : 'draft');
  await db.query(
    `INSERT INTO entity_texts (entity_id, ranking_id, summary, body, input_hash, status, published_at, published_by, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'published' THEN now() END, CASE WHEN $6 = 'published' THEN $7::uuid END, $7, now())
     ON CONFLICT (entity_id, ranking_id) DO UPDATE SET summary = EXCLUDED.summary, body = EXCLUDED.body, input_hash = EXCLUDED.input_hash,
       status = EXCLUDED.status, updated_by = EXCLUDED.updated_by, updated_at = now(),
       published_at = CASE WHEN EXCLUDED.status = 'published' AND $8 THEN now() ELSE entity_texts.published_at END,
       published_by = CASE WHEN EXCLUDED.status = 'published' AND $8 THEN EXCLUDED.updated_by ELSE entity_texts.published_by END`,
    [sub.entity_id, sub.ranking_id, summary, body, hash, status, req.session.admin.id, action === 'publish']
  );
  await logAction(req.session.admin.id, 'entity', sub.entity_id, `text_${action}`, { status });
  const msg = { save: 'Text gespeichert', publish: 'Text freigegeben – jetzt auf der Profilseite sichtbar', unpublish: 'Text zurückgezogen' }[action];
  res.redirect(`${back}?ok=${encodeURIComponent(msg)}#text`);
}));

// Redaktionelle Notizen: zusätzliche Grundlage für den KI-Entwurf (Text wird danach als veraltet markiert)
router.post('/meldungen/:id/text/notizen', wrap(async (req, res, next) => {
  const sub = await subWithEntity(req.params.id);
  if (!sub) return next();
  const notes = String(req.body.notes || '').replace(/\r/g, '').trim().slice(0, 3000);
  await db.query(
    `INSERT INTO entity_texts (entity_id, ranking_id, notes, updated_by, updated_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (entity_id, ranking_id) DO UPDATE SET notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [sub.entity_id, sub.ranking_id, notes, req.session.admin.id]);
  await logAction(req.session.admin.id, 'entity', sub.entity_id, 'text_notes', { length: notes.length });
  res.redirect(`/admin/meldungen/${sub.id}?ok=${encodeURIComponent('Notizen gespeichert')}#text`);
}));

// Dokumentation der KI-Texte: Prompt, Modell, Stilvorlage, Überarbeitungsquote
router.get('/ki-texte', wrap(async (req, res) => {
  const list = await db.many(`SELECT * FROM rankings WHERE status <> 'archived' ORDER BY is_default DESC, name`);
  const ranking = list.find((r) => r.id === req.query.ranking) || list[0];
  const texts = ranking ? await db.many(
    `SELECT t.status, t.model, t.generated_at, t.published_at, t.notes <> '' AS has_notes,
            t.generated_body IS NOT NULL AS has_original, t.generated_body IS DISTINCT FROM t.body AS edited,
            length(t.body) AS len, e.name, (SELECT s.id FROM submissions s WHERE s.entity_id = e.id ORDER BY s.created_at DESC LIMIT 1) AS sub_id
       FROM entity_texts t JOIN entities e ON e.id = t.entity_id
      WHERE t.ranking_id = $1 AND (t.body <> '' OR t.notes <> '') ORDER BY t.updated_at DESC`, [ranking.id]) : [];
  const example = ranking ? await describer.styleExample(ranking.id, '00000000-0000-0000-0000-000000000000') : null;
  res.render('admin/ai-texts', {
    title: 'KI-Texte', rankings: list, ranking, texts, example,
    template: ranking ? describer.promptTemplate(ranking) : '', model: config.llm.models.describe,
  });
}));

// ---------- Aufgaben ----------

router.get('/aufgaben', wrap(async (req, res) => {
  await tasks.sync();
  const assignee = ['me', 'none'].includes(req.query.wer) ? req.query.wer : null;
  const label = tasks.LABELS[req.query.label] ? req.query.label : null;
  const columns = await tasks.board({ assignee, label, me: req.session.admin.id });
  const labelCounts = await tasks.openCounts({ assignee, me: req.session.admin.id });
  const team = await db.many(`SELECT id, email, display_name FROM admin_users ORDER BY COALESCE(display_name, email)`);
  res.render('admin/tasks', {
    title: 'Aufgaben', columns, team, assignee, label, labelCounts, STATUSES: tasks.STATUSES, LABELS: tasks.LABELS, me: req.session.admin.id,
    flash: req.query.ok || null, error: req.query.fehler || null,
  });
}));

// Karte verschieben (Drag & Drop: JSON mit Reihenfolge; ohne JavaScript: Formular mit Zielspalte)
router.post('/aufgaben/:id/verschieben', wrap(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).end();
  const order = Array.isArray(req.body.order) ? req.body.order.filter((x) => UUID_RE.test(x)) : null;
  try {
    const assignee = await tasks.move(req.params.id, req.body.status, order, req.session.admin.id);
    if (req.is('json')) return res.json({ ok: true, assignee });
    res.redirect(backOrNull(req.body.back) || '/admin/aufgaben');
  } catch (err) {
    if (req.is('json')) return res.status(400).json({ error: err.message });
    res.redirect(`/admin/aufgaben?fehler=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/aufgaben/:id/zuweisen', wrap(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(404).end();
  const who = UUID_RE.test(req.body.assignee_id || '') ? req.body.assignee_id : null;
  await tasks.assign(req.params.id, who, req.session.admin.id);
  if (req.is('json')) return res.json({ ok: true });
  res.redirect(backOrNull(req.body.back) || '/admin/aufgaben');
}));

router.post('/aufgaben', wrap(async (req, res) => {
  try {
    await tasks.createManual({
      title: req.body.title, note: req.body.note, link: req.body.link,
      assigneeId: UUID_RE.test(req.body.assignee_id || '') ? req.body.assignee_id : null,
    }, req.session.admin.id);
    res.redirect('/admin/aufgaben?ok=Aufgabe+angelegt');
  } catch (err) {
    res.redirect(`/admin/aufgaben?fehler=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/aufgaben/:id/loeschen', wrap(async (req, res) => {
  if (UUID_RE.test(req.params.id)) await tasks.removeManual(req.params.id, req.session.admin.id);
  res.redirect('/admin/aufgaben?ok=Aufgabe+gel%C3%B6scht');
}));

// ---------- Kontaktnachrichten ----------

router.get('/kontakt', wrap(async (req, res) => {
  const open = await db.many(`SELECT * FROM contact_messages WHERE handled_at IS NULL ORDER BY created_at`);
  const handled = await db.many(
    `SELECT m.*, u.email AS handled_by_email FROM contact_messages m LEFT JOIN admin_users u ON u.id = m.handled_by
      WHERE m.handled_at IS NOT NULL ORDER BY m.handled_at DESC LIMIT 50`);
  res.render('admin/contact', { title: 'Kontakt', open, handled, flash: req.query.ok || null });
}));

router.post('/kontakt/:id/erledigt', wrap(async (req, res) => {
  if (UUID_RE.test(req.params.id)) {
    await db.query('UPDATE contact_messages SET handled_at = now(), handled_by = $2 WHERE id = $1 AND handled_at IS NULL', [req.params.id, req.session.admin.id]);
    await logAction(req.session.admin.id, 'contact', req.params.id, 'handle_contact');
  }
  res.redirect('/admin/kontakt?ok=Als+erledigt+markiert');
}));

// ---------- Team: Admins freischalten (Login mit Google über die E-Mail-Adresse) ----------

router.get('/team', wrap(async (req, res) => {
  const rows = await db.many(`SELECT id, email, google_sub IS NOT NULL AS linked, password_hash IS NOT NULL AS has_password, last_login_at, created_at FROM admin_users ORDER BY email`);
  res.render('admin/team', { title: 'Team', rows, me: req.session.admin.id, flash: req.query.ok || null, error: req.query.fehler || null });
}));

router.post('/team', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.redirect('/admin/team?fehler=Ung%C3%BCltige+E-Mail-Adresse');
  const row = await db.one(`INSERT INTO admin_users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING id`, [email]);
  if (row) await logAction(req.session.admin.id, 'admin_user', row.id, 'add_admin', { email });
  res.redirect(`/admin/team?ok=${encodeURIComponent(`${email} freigeschaltet`)}`);
}));

router.post('/team/:id/entfernen', wrap(async (req, res) => {
  if (req.params.id === req.session.admin.id) return res.redirect('/admin/team?fehler=Du+kannst+dich+nicht+selbst+entfernen');
  const row = await db.one(`DELETE FROM admin_users WHERE id = $1 RETURNING email`, [req.params.id]);
  if (row) await logAction(req.session.admin.id, 'admin_user', req.params.id, 'remove_admin', { email: row.email });
  res.redirect('/admin/team?ok=Zugang+entfernt');
}));

// ---------- Audit-Log ----------

router.get('/log', wrap(async (req, res) => {
  const rows = await db.many(
    `SELECT a.*, u.email, p.name AS persona_name FROM admin_actions a
       LEFT JOIN admin_users u ON u.id = a.admin_id LEFT JOIN personas p ON p.id = a.persona_id
      ORDER BY a.created_at DESC LIMIT 300`
  );
  res.render('admin/log', { title: 'Log', rows });
}));

module.exports = router;
module.exports.parseAdminValue = parseAdminValue;
