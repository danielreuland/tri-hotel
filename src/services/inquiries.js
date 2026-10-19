// Anfragen an Betreiber: unklare Werte bestätigen lassen und Fotos mit Nutzungserlaubnis einholen.
// queued -> (Agent + Versand) -> sent -> answered | expired ; Fehler -> failed ; Admin schließt -> closed
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const media = require('./media');
const db = require('../db');
const config = require('../config');
const mailer = require('./mailer');
const rankings = require('./rankings');
const agent = require('./inquiry-agent');
const aimail = require('./aimail');
const featureService = require('./features');
const sites = require('./sites');
const consentTexts = require('../lib/consents');
const { logAction } = require('../lib/audit');
const { newToken, sha256, isEmail, formatDate } = require('../lib/util');

const VALID_DAYS = 30;
const REMINDER_AFTER_DAYS = 7;
const MAX_PHOTOS = 8;

let enqueue = async () => {};
function setEnqueue(fn) {
  enqueue = fn;
}

const { unclearCriteria } = agent;

// Wortlaute für das Antwortformular
function formConsents(language, site, entityName) {
  const t = (type) => consentTexts.text(type, language, site.name, entityName);
  return { photos_profile: t('photos_profile'), photos_social: t('photos_social'), partner_contact: t('partner_contact') };
}

async function start({ entityId, rankingId, submissionId, criteriaIds, askPhotos, adminNote, adminId }) {
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [entityId]);
  if (!entity) throw new Error('Objekt nicht gefunden.');
  if (!isEmail(entity.contact_email)) throw new Error('Bitte zuerst die Kontakt-E-Mail des Betreibers in den Stammdaten eintragen.');
  const criteria = (await rankings.getCriteria(rankingId)).filter((c) => criteriaIds.includes(c.id) && agent.isAskable(c));
  if (!criteria.length && !askPhotos) throw new Error('Bitte mindestens einen Wert oder die Fotos auswählen.');
  const ranking = await rankings.getRanking(rankingId);
  const persona = await sites.persona(ranking.site_id, 'data_inquiry');

  let row;
  try {
    row = await db.one(
      `INSERT INTO inquiries (entity_id, ranking_id, submission_id, recipient, language, criteria_ids, admin_note, ask_photos, created_by, persona_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [entity.id, rankingId, submissionId || null, entity.contact_email, agent.languageFor(entity.country),
        criteria.map((c) => c.id), adminNote || null, Boolean(askPhotos), adminId, persona ? persona.id : null]
    );
  } catch (err) {
    if (err.code === '23505') throw new Error('Es läuft bereits eine offene Anfrage an diesen Betreiber.');
    throw err;
  }
  await logAction(adminId, 'inquiry', row.id, 'start_inquiry', { criteria: criteria.map((c) => c.code), askPhotos: Boolean(askPhotos) });
  await enqueue('inquiry-send', { inquiryId: row.id });
  return row;
}

// ---------- Entwürfe aus der Auto-Prüfung ----------

const MAX_DRAFT_QUESTIONS = 8;

// Fragen für einen Entwurf: erst unbekannte, dann strittige, dann automatisch ermittelte – je nach Punkten
function draftCriteria(criteria, facts) {
  const byCrit = new Map(facts.map((f) => [f.criterion_id, f]));
  const rank = (c) => {
    const f = byCrit.get(c.id);
    return !f ? 0 : f.disputed ? 1 : 2;
  };
  return unclearCriteria(criteria, facts)
    .sort((a, b) => rank(a) - rank(b) || b.max_points - a.max_points)
    .slice(0, MAX_DRAFT_QUESTIONS);
}

// Legt einen Entwurf an, wenn es offene Punkte, eine Kontaktadresse und keine offene Anfrage gibt.
// Ergebnis: { created: bool, reason, inquiry? }
async function createDraft({ entityId, rankingId, submissionId }) {
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [entityId]);
  if (!entity) return { created: false, reason: 'Objekt nicht gefunden.' };
  if (!isEmail(entity.contact_email)) return { created: false, reason: 'Keine Kontakt-E-Mail – kein Entwurf.' };
  const open = await db.one(`SELECT status FROM inquiries WHERE entity_id = $1 AND ranking_id = $2 AND status IN ('draft','queued','sent')`, [entityId, rankingId]);
  if (open) return { created: false, reason: `Es gibt schon eine offene Anfrage (${open.status === 'draft' ? 'Entwurf' : 'läuft'}).` };
  const criteria = await rankings.getCriteria(rankingId);
  const facts = await rankings.getFacts(entityId, rankingId);
  const ask = draftCriteria(criteria, facts);
  const hasImage = await db.one('SELECT 1 FROM entity_images WHERE entity_id = $1 AND approved_at IS NOT NULL LIMIT 1', [entityId]);
  if (!ask.length) return { created: false, reason: 'Keine offenen Punkte, die man beim Betreiber erfragen kann.' };
  const ranking = await rankings.getRanking(rankingId);
  const persona = await sites.persona(ranking.site_id, 'data_inquiry');
  try {
    const row = await db.one(
      `INSERT INTO inquiries (entity_id, ranking_id, submission_id, recipient, language, criteria_ids, ask_photos, persona_id, status, auto_created)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',true) RETURNING *`,
      [entityId, rankingId, submissionId || null, entity.contact_email, agent.languageFor(entity.country), ask.map((c) => c.id), !hasImage, persona ? persona.id : null]
    );
    await logAction(null, 'inquiry', row.id, 'draft_inquiry', { criteria: ask.map((c) => c.code), recipient: entity.contact_email });
    return { created: true, reason: `Entwurf mit ${ask.length} Fragen${!hasImage ? ' und Foto-Anfrage' : ''} an ${entity.contact_email} – wartet auf Freigabe.`, inquiry: row };
  } catch (err) {
    if (err.code === '23505') return { created: false, reason: 'Es gibt schon eine offene Anfrage.' };
    throw err;
  }
}

// Neue Anfrage aus dem Admin: als Entwurf anlegen und gleich formulieren (gesendet wird erst nach Prüfung)
async function startDraft({ entityId, rankingId, submissionId, criteriaIds, askPhotos, adminNote, adminId, confirmCriteriaIds, confirmFeatureIds, offerFeatures }) {
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [entityId]);
  if (!entity) throw new Error('Objekt nicht gefunden.');
  if (!isEmail(entity.contact_email)) throw new Error('Bitte zuerst die Kontakt-E-Mail des Betreibers in den Stammdaten eintragen.');
  const open = await db.one(`SELECT status FROM inquiries WHERE entity_id = $1 AND ranking_id = $2 AND status IN ('draft','queued','sent')`, [entityId, rankingId]);
  if (open) throw new Error(open.status === 'draft' ? 'Es gibt schon einen Entwurf.' : 'Es läuft bereits eine offene Anfrage an diesen Betreiber.');
  const ranking = await rankings.getRanking(rankingId);
  const persona = await sites.persona(ranking.site_id, 'data_inquiry');
  const row = await db.one(
    `INSERT INTO inquiries (entity_id, ranking_id, submission_id, recipient, language, criteria_ids, ask_photos, created_by, persona_id, status)
     VALUES ($1,$2,$3,$4,$5,'{}',false,$6,$7,'draft') RETURNING *`,
    [entity.id, rankingId, submissionId || null, entity.contact_email, agent.languageFor(entity.country), adminId, persona ? persona.id : null]
  );
  await logAction(adminId, 'inquiry', row.id, 'draft_inquiry', { recipient: entity.contact_email });
  try {
    return await formulate(row.id, { criteriaIds, askPhotos, adminNote, confirmCriteriaIds, confirmFeatureIds, offerFeatures }, adminId);
  } catch (err) {
    // ohne gültige Auswahl keinen leeren Entwurf stehen lassen
    await db.query(`DELETE FROM inquiries WHERE id = $1 AND status = 'draft' AND body IS NULL`, [row.id]);
    throw err;
  }
}

// ---------- Bekannte Angaben bestätigen lassen ----------

// Leistungen, die je Objekt gepflegt werden (ohne Ableitung aus einem Fakt) – nur diese kann der Betreiber bestätigen
async function manualFeatures(entityType, entityId) {
  const catalog = (await featureService.catalog(entityType)).filter((ft) => !ft.derive);
  const present = new Set((await db.many('SELECT feature_id FROM entity_features WHERE entity_id = $1', [entityId])).map((r) => r.feature_id));
  return { catalog, present };
}

// Vorschlag fürs Formular: bekannte Werte mit Vertrauensstufe 2 oder 4 (ohne die gefragten) und alle erfassten Leistungen
function defaultConfirmSelection(criteria, facts, askedIds, presentFeatureIds) {
  const byCrit = new Map(facts.map((f) => [f.criterion_id, f]));
  return {
    criteriaIds: criteria.filter((c) => {
      const f = byCrit.get(c.id);
      return agent.isAskable(c) && f && !f.disputed && [2, 4].includes(f.trust_level) && agent.formValue(c, f.value) && !askedIds.includes(c.id);
    }).map((c) => c.id),
    featureIds: [...presentFeatureIds],
  };
}

// Auswahl prüfen: nur bekannte, erfragbare Werte (nicht zugleich gefragt) und erfasste Leistungen.
// offerIds: feste Liste „Bieten Sie außerdem …?“; ohne sie mit offer = true alle übrigen Leistungen des Katalogs
async function confirmSelection({ entity, ranking, criteria, facts, askedIds, criteriaIds = [], featureIds = [], offer = false, offerIds = null }) {
  const factBy = new Map(facts.map((f) => [f.criterion_id, f]));
  const crit = criteria.filter((c) => criteriaIds.includes(c.id) && !askedIds.includes(c.id) && agent.isAskable(c)
    && factBy.get(c.id) && agent.formValue(c, factBy.get(c.id).value));
  const { catalog, present } = await manualFeatures(ranking.entity_type, entity.id);
  const features = catalog.filter((ft) => present.has(ft.id) && featureIds.includes(ft.id));
  const offerList = offerIds ? catalog.filter((ft) => offerIds.includes(ft.id) && !present.has(ft.id))
    : offer ? catalog.filter((ft) => !present.has(ft.id)) : [];
  return { criteria: crit, features, offer: offerList };
}

// Knopf in der Mail passend zum Inhalt
function buttonKind(inq) {
  if ((inq.criteria_ids || []).length) return 'answer';
  if ((inq.confirm_criteria_ids || []).length || (inq.confirm_feature_ids || []).length) return 'confirm';
  return inq.ask_photos ? 'photos' : 'answer';
}

// Entwurf formulieren: Auswahl speichern, Agent schreibt Betreff, Text und Fragen. Der Entwurf bleibt Entwurf.
async function formulate(inquiryId, { criteriaIds, askPhotos, adminNote, confirmCriteriaIds = [], confirmFeatureIds = [], offerFeatures = false }, adminId) {
  const inq = await db.one('SELECT * FROM inquiries WHERE id = $1', [inquiryId]);
  if (!inq || inq.status !== 'draft') throw new Error('Kein offener Entwurf.');
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [inq.entity_id]);
  if (!isEmail(entity && entity.contact_email)) throw new Error('Bitte zuerst die Kontakt-E-Mail des Betreibers eintragen.');
  const ranking = await rankings.getRanking(inq.ranking_id);
  const allCriteria = await rankings.getCriteria(inq.ranking_id);
  const criteria = allCriteria.filter((c) => criteriaIds.includes(c.id) && agent.isAskable(c));
  const site = await sites.forRanking(ranking);
  const persona = await personaOf(inq);
  const factRows = await rankings.getFacts(entity.id, ranking.id);
  const facts = Object.fromEntries(factRows.map((f) => [f.criterion_id, f]));
  const confirm = await confirmSelection({
    entity, ranking, criteria: allCriteria, facts: factRows, askedIds: criteria.map((c) => c.id),
    criteriaIds: confirmCriteriaIds, featureIds: confirmFeatureIds, offer: Boolean(offerFeatures),
  });
  if (!criteria.length && !askPhotos && !agent.confirmCount(confirm)) throw new Error('Bitte mindestens einen Wert, eine Bestätigung oder die Fotos auswählen.');
  const language = agent.languageFor(entity.country);
  const template = await aimail.get(site.id, 'inquiry', language);
  const example = await aimail.inquiryExample(language, inq.id);
  const draft = await agent.draftInquiry({
    entity, ranking, criteria, facts, language, adminNote: adminNote || null, askPhotos: Boolean(askPhotos), persona, brand: site.name,
    template, example, confirm,
  });
  if (draft.usage) {
    await require('../lib/llm').record({ purpose: 'inquiry', model: draft.usage.model, usage: draft.usage.raw, entityId: entity.id, inquiryId: inq.id });
  }
  const row = await db.one(
    `UPDATE inquiries SET criteria_ids = $2, ask_photos = $3, admin_note = $4, recipient = $5, language = $6,
       subject = $7, body = $8, questions = $9, error = $10, generated_subject = $7, generated_body = $8,
       confirm_criteria_ids = $11, confirm_feature_ids = $12, offer_feature_ids = $13, confirmations = $14, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [inq.id, criteria.map((c) => c.id), Boolean(askPhotos), adminNote || null, entity.contact_email, language,
      draft.subject, draft.body, JSON.stringify(draft.questions),
      draft.usedFallback && config.llm.provider !== 'none' ? 'Agent nicht verfügbar, Vorlage verwendet' : null,
      confirm.criteria.map((c) => c.id), confirm.features.map((ft) => ft.id), confirm.offer.map((ft) => ft.id),
      JSON.stringify(draft.confirmations || {})]
  );
  await logAction(adminId, 'inquiry', inq.id, 'formulate_inquiry', {
    criteria: criteria.map((c) => c.code), askPhotos: Boolean(askPhotos),
    confirm: confirm.criteria.map((c) => c.code), confirmFeatures: confirm.features.map((ft) => ft.code), offerFeatures: confirm.offer.length,
  });
  return row;
}

// Formulierten Entwurf (ggf. bearbeitet) freigeben und versenden
async function approveDraft(inquiryId, { subject, body }, adminId) {
  const inq = await db.one('SELECT * FROM inquiries WHERE id = $1', [inquiryId]);
  if (!inq || inq.status !== 'draft') throw new Error('Kein offener Entwurf.');
  if (!inq.body) throw new Error('Bitte zuerst den Entwurf formulieren.');
  const entity = await db.one('SELECT contact_email FROM entities WHERE id = $1', [inq.entity_id]);
  if (!isEmail(entity && entity.contact_email)) throw new Error('Bitte zuerst die Kontakt-E-Mail des Betreibers eintragen.');
  const subj = String(subject || '').trim().slice(0, 150);
  let text = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!subj || text.length < 20) throw new Error('Betreff und Text dürfen nicht leer sein.');
  // genau ein Antwortlink: Platzhalter muss drinbleiben (sonst ans Ende setzen)
  if (!text.includes(agent.LINK)) text = `${text}\n\n${agent.LINK}`;
  await db.query(
    `UPDATE inquiries SET status = 'queued', subject = $2, body = $3, recipient = $4,
       approved_by = $5, approved_at = now(), created_by = COALESCE(created_by, $5), updated_at = now() WHERE id = $1`,
    [inq.id, subj, text, entity.contact_email, adminId]
  );
  await logAction(adminId, 'inquiry', inq.id, 'approve_inquiry_draft', { edited: subj !== inq.subject || text !== inq.body });
  await enqueue('inquiry-send', { inquiryId: inq.id });
}

async function discardDraft(inquiryId, adminId) {
  const r = await db.query(`UPDATE inquiries SET status = 'closed', error = 'Entwurf verworfen', updated_at = now() WHERE id = $1 AND status = 'draft'`, [inquiryId]);
  if (r.rowCount) await logAction(adminId, 'inquiry', inquiryId, 'discard_inquiry_draft');
}

function answerUrl(site, token) {
  return `${sites.urlFor(site)}/anfrage/${token}`;
}

async function personaOf(inq) {
  return inq.persona_id ? db.one('SELECT * FROM personas WHERE id = $1', [inq.persona_id]) : null;
}

async function send(inquiryId) {
  const inq = await db.one('SELECT * FROM inquiries WHERE id = $1', [inquiryId]);
  if (!inq || inq.status !== 'queued') return;
  try {
    const entity = await db.one('SELECT * FROM entities WHERE id = $1', [inq.entity_id]);
    const ranking = await rankings.getRanking(inq.ranking_id);
    const site = await sites.forRanking(ranking);
    const persona = await personaOf(inq);
    const allCriteria = await rankings.getCriteria(inq.ranking_id);
    const criteria = allCriteria.filter((c) => inq.criteria_ids.includes(c.id));
    const factRows = await rankings.getFacts(entity.id, ranking.id);
    const facts = Object.fromEntries(factRows.map((f) => [f.criterion_id, f]));
    // Im Admin formulierter und freigegebener Text wird unverändert versendet; sonst formuliert der Agent jetzt
    const draft = inq.body
      ? { subject: inq.subject, body: inq.body, questions: inq.questions || [], confirmations: inq.confirmations || {}, usedFallback: false }
      : await agent.draftInquiry({
        entity, ranking, criteria, facts, language: inq.language, adminNote: inq.admin_note, askPhotos: inq.ask_photos,
        persona, brand: site.name,
        template: await aimail.get(site.id, 'inquiry', inq.language),
        example: await aimail.inquiryExample(inq.language, inq.id),
        confirm: await confirmSelection({
          entity, ranking, criteria: allCriteria, facts: factRows, askedIds: inq.criteria_ids,
          criteriaIds: inq.confirm_criteria_ids || [], featureIds: inq.confirm_feature_ids || [], offerIds: inq.offer_feature_ids || [],
        }),
      });
    if (draft.usage) {
      await require('../lib/llm').record({ purpose: 'inquiry', model: draft.usage.model, usage: draft.usage.raw, entityId: entity.id, inquiryId: inq.id });
    }
    const tok = newToken();
    const ok = await mailer.send({
      to: inq.recipient,
      template: 'inquiry',
      site,
      persona,
      inquiryId: inq.id,
      entityId: inq.entity_id,
      data: { subject: draft.subject, text: draft.body.split(agent.LINK).join(answerUrl(site, tok.token)), language: inq.language, cta: buttonKind(inq) },
    });
    if (!ok) throw new Error('Mailversand fehlgeschlagen.');
    // Gespeichert wird der Text mit Platzhalter – der Antwortlink selbst liegt nur als Hash vor.
    await db.query(
      `UPDATE inquiries SET status = 'sent', subject = $2, body = $3, questions = $4, token_hash = $5, sent_at = now(),
         expires_at = now() + make_interval(days => $6), error = $7, confirmations = $8, updated_at = now() WHERE id = $1`,
      [inq.id, draft.subject, draft.body, JSON.stringify(draft.questions), tok.hash, VALID_DAYS,
        inq.body ? null : draft.usedFallback && config.llm.provider !== 'none' ? 'Agent nicht verfügbar, Vorlage verwendet' : null,
        JSON.stringify(draft.confirmations || {})]
    );
    await logAction(null, 'inquiry', inq.id, 'send_inquiry', { recipient: inq.recipient, persona: persona && persona.name }, db, persona && persona.id);
  } catch (err) {
    console.error('[inquiries] Versand', inq.id, err.message);
    await db.query(`UPDATE inquiries SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [inq.id, err.message]);
  }
}

async function findByToken(token) {
  const inq = await db.one('SELECT * FROM inquiries WHERE token_hash = $1', [sha256(token)]);
  if (!inq) return { status: 'invalid' };
  if (inq.status === 'answered') return { status: 'answered', inquiry: inq };
  if (inq.status !== 'sent' || new Date(inq.expires_at) < new Date()) return { status: 'expired', inquiry: inq };
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [inq.entity_id]);
  const ranking = await rankings.getRanking(inq.ranking_id);
  const site = await sites.forRanking(ranking);
  return { status: 'ok', inquiry: inq, entity, site };
}

// Prüft die ersten Bytes, damit nur echte Bilder gespeichert werden.
function isImageFile(file) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buf, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP';
  return jpeg || png || webp;
}

// Antwort des Betreibers speichern. Werte werden NICHT direkt übernommen, der Admin prüft.
async function submitAnswers(inq, entity, site, body, files = []) {
  const errors = [];
  const allCriteria = await rankings.getCriteria(inq.ranking_id);
  const criteria = allCriteria.filter((c) => inq.criteria_ids.includes(c.id));
  // Bekannte Angaben: bestätigt oder korrigiert (Liste aus der Anfrage), Leistungen nur nach „Liste geprüft“
  const confirmed = agent.parseConfirmAnswers(inq.confirmations, body, allCriteria);
  const answers = [];
  for (const c of criteria) {
    const raw = body[`q_${c.id}`];
    if (raw === undefined || raw === '') continue;
    const value = raw === 'unknown' ? null : agent.toFactValue(c, raw);
    if (raw !== 'unknown' && !value) continue;
    answers.push({ criterionId: c.id, value, comment: String(body[`c_${c.id}`] || '').trim().slice(0, 500) || null });
  }

  for (const label of confirmed.incomplete) {
    errors.push(inq.language === 'de' ? `„${label}“: Bitte den richtigen Wert auswählen.` : `“${label}”: please choose the correct value.`);
  }
  const photos = inq.ask_photos ? files : [];
  const credit = String(body.photo_credit || '').trim().slice(0, 200);
  if (photos.length) {
    if (body.photo_consent !== 'on') errors.push(inq.language === 'de' ? 'Bitte die Nutzungserlaubnis für die Fotos bestätigen.' : 'Please confirm the permission to use the photos.');
    if (!credit) errors.push(inq.language === 'de' ? 'Bitte einen Urhebervermerk angeben.' : 'Please enter a photo credit.');
    if (photos.length > MAX_PHOTOS) errors.push(inq.language === 'de' ? `Höchstens ${MAX_PHOTOS} Fotos.` : `At most ${MAX_PHOTOS} photos.`);
    for (const f of photos) if (!isImageFile(f.path)) errors.push(`${f.originalname}: kein gültiges Bild (JPG, PNG, WebP).`);
  }
  if (!answers.length && !confirmed.criteria.length && !confirmed.features.length && !photos.length
    && !String(body.note || '').trim() && body.consent_partner_contact !== 'on') {
    errors.push(inq.language === 'de' ? 'Bitte mindestens eine Frage beantworten.' : 'Please answer at least one question.');
  }
  if (photos.length && !errors.length) {
    const { n } = await db.one('SELECT count(*)::int AS n FROM entity_images WHERE entity_id = $1', [entity.id]);
    if (n + photos.length > media.MAX_PER_ENTITY) {
      const free = Math.max(media.MAX_PER_ENTITY - n, 0);
      errors.push(inq.language === 'de' ? `Es sind noch ${free} Fotos möglich.` : `You can add ${free} more photos.`);
    }
  }
  if (errors.length) {
    for (const f of files) fs.unlink(f.path, () => {});
    return { errors };
  }
  // Fotos als WebP-Varianten speichern, Originale verwerfen
  const processed = [];
  try {
    for (const f of photos) {
      const id = crypto.randomUUID();
      processed.push({ id, ...(await media.processEntityImage(id, f.path)) });
    }
  } catch (err) {
    for (const p of processed) media.removeEntityFiles(p);
    for (const f of files) fs.unlink(f.path, () => {});
    return { errors: [inq.language === 'de' ? 'Ein Foto konnte nicht verarbeitet werden.' : 'A photo could not be processed.'] };
  }
  for (const f of files) fs.unlink(f.path, () => {});

  const replyName = String(body.reply_name || '').trim().slice(0, 200) || null;
  const note = String(body.note || '').trim().slice(0, 2000) || null;
  const at = new Date();
  const texts = formConsents(inq.language, site, entity.name);
  // Einwilligungen: jede nur mit eigenem, nicht vorausgewähltem Häkchen
  const granted = [];
  if (photos.length) granted.push('photos_profile');
  if (photos.length && body.consent_photos_social === 'on') granted.push('photos_social');
  if (body.consent_partner_contact === 'on') granted.push('partner_contact');
  await db.tx(async (client) => {
    for (const a of answers) {
      await client.query(
        `INSERT INTO inquiry_answers (inquiry_id, criterion_id, value, comment) VALUES ($1, $2, $3, $4)
         ON CONFLICT (inquiry_id, criterion_id) DO NOTHING`,
        [inq.id, a.criterionId, a.value === null ? null : JSON.stringify(a.value), a.comment]
      );
    }
    for (const a of confirmed.criteria) {
      await client.query(
        `INSERT INTO inquiry_answers (inquiry_id, criterion_id, value, comment, kind, previous) VALUES ($1, $2, $3, $4, 'confirm', $5)
         ON CONFLICT (inquiry_id, criterion_id) DO NOTHING`,
        [inq.id, a.criterionId, JSON.stringify(a.value), a.comment, a.previous ? JSON.stringify(a.previous) : null]
      );
    }
    for (const ft of confirmed.features) {
      await client.query(
        `INSERT INTO inquiry_feature_answers (inquiry_id, feature_id, offered, known) VALUES ($1, $2, $3, $4)
         ON CONFLICT (inquiry_id, feature_id) DO NOTHING`,
        [inq.id, ft.featureId, ft.offered, ft.known]
      );
    }
    for (const type of granted) {
      await client.query(
        `INSERT INTO consents (entity_id, site_id, type, source, inquiry_id, contact_email, contact_name, text_version, text)
         VALUES ($1, $2, $3, 'inquiry', $4, $5, $6, $7, $8)
         ON CONFLICT (entity_id, site_id, type) WHERE withdrawn_at IS NULL DO NOTHING`,
        [entity.id, site.id, type, inq.id, inq.recipient, replyName, consentTexts.VERSION, texts[type]]
      );
    }
    const proof = `Upload über Anfrage ${inq.id} am ${at.toISOString()} von ${replyName || 'ohne Namen'} (${inq.recipient}); `
      + `Einwilligungen ${granted.join(', ')} (Wortlaut ${consentTexts.VERSION}, siehe Einwilligungen im Admin)`;
    for (const p of processed) {
      await client.query(
        `INSERT INTO entity_images (id, entity_id, storage_path, source, license, credit, release_proof, inquiry_id, width, height, variants)
         VALUES ($1, $2, $3, 'owner_release', $4, $5, $6, $7, $8, $9, $10)`,
        [p.id, entity.id, `entity-images/${p.id}`, 'Nutzungserlaubnis des Betreibers', credit, proof, inq.id, p.width, p.height, p.variants]
      );
    }
    await client.query(
      `UPDATE inquiries SET status = 'answered', answered_at = now(), reply_name = $2, reply_note = $3, updated_at = now() WHERE id = $1`,
      [inq.id, replyName, note]
    );
    await logAction(null, 'inquiry', inq.id, 'answered', { answers: answers.length, confirmed: confirmed.criteria.length, features: confirmed.features.length, photos: photos.length, consents: granted }, client);
  });
  if (config.mail.adminNotify) {
    await mailer.send({
      to: config.mail.adminNotify,
      template: 'inquiry-answered',
      site,
      inquiryId: inq.id,
      entityId: inq.entity_id,
      data: {
        entityName: entity.name, answers: answers.length + confirmed.criteria.length + confirmed.features.length, photos: photos.length, consents: granted.map((t) => consentTexts.TYPES[t]),
        link: `${config.baseUrl}/admin/${inq.submission_id ? `meldungen/${inq.submission_id}` : 'aufgaben'}#anfragen`,
      },
    });
  }
  return { errors: [], answers: answers.length + confirmed.criteria.length + confirmed.features.length, photos: photos.length, consents: granted };
}

async function acceptAnswer(answerId, adminId) {
  const a = await db.one(
    `SELECT a.*, i.entity_id, i.ranking_id, i.answered_at FROM inquiry_answers a JOIN inquiries i ON i.id = a.inquiry_id WHERE a.id = $1`,
    [answerId]
  );
  if (!a || a.status !== 'pending') return null;
  await db.tx(async (client) => {
    if (a.value) {
      const unchanged = a.kind === 'confirm' && JSON.stringify(a.value) === JSON.stringify(a.previous);
      const evidence = `${unchanged ? 'Vom Betreiber bestätigt am' : 'Antwort des Betreibers vom'} ${formatDate(a.answered_at)}${a.comment ? `: ${a.comment}` : ''}`;
      const row = await client.query(
        `INSERT INTO entity_facts (entity_id, criterion_id, value, source, trust_level, evidence_url, evidence_text, disputed, checked_at)
         VALUES ($1, $2, $3, 'hotel', 1, NULL, $4, false, now())
         ON CONFLICT (entity_id, criterion_id) DO UPDATE SET value = EXCLUDED.value, source = 'hotel', trust_level = 1,
           evidence_url = NULL, evidence_text = EXCLUDED.evidence_text, disputed = false, checked_at = now()
         RETURNING id`,
        [a.entity_id, a.criterion_id, JSON.stringify(a.value), evidence]
      );
      await logAction(adminId, 'fact', row.rows[0].id, 'accept_operator_answer', { answer: a.id, value: a.value }, client);
    }
    await client.query(`UPDATE inquiry_answers SET status = 'accepted', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [a.id, adminId]);
  });
  await rankings.recomputeEntity(a.entity_id, a.ranking_id);
  return a;
}

async function rejectAnswer(answerId, adminId) {
  await db.query(
    `UPDATE inquiry_answers SET status = 'rejected', reviewed_by = $2, reviewed_at = now() WHERE id = $1 AND status = 'pending'`,
    [answerId, adminId]
  );
  await logAction(adminId, 'inquiry_answer', answerId, 'reject_operator_answer');
}

// Leistung laut Betreiber: angeboten → als „vom Betreiber“ (Stufe 1) speichern, nicht angeboten → entfernen
async function acceptFeatureAnswer(answerId, adminId) {
  const a = await db.one(
    `SELECT a.*, i.entity_id, i.ranking_id, i.answered_at FROM inquiry_feature_answers a JOIN inquiries i ON i.id = a.inquiry_id WHERE a.id = $1`,
    [answerId]
  );
  if (!a || a.status !== 'pending') return null;
  await db.tx(async (client) => {
    if (a.offered) {
      const evidence = `${a.known ? 'Vom Betreiber bestätigt am' : 'Angabe des Betreibers vom'} ${formatDate(a.answered_at)}`;
      await client.query(
        `INSERT INTO entity_features (entity_id, feature_id, source, trust_level, evidence_url, evidence_text, checked_at)
         VALUES ($1, $2, 'hotel', 1, NULL, $3, now())
         ON CONFLICT (entity_id, feature_id) DO UPDATE SET source = 'hotel', trust_level = 1, evidence_url = NULL,
           evidence_text = EXCLUDED.evidence_text, checked_at = now()`,
        [a.entity_id, a.feature_id, evidence]
      );
    } else {
      await client.query('DELETE FROM entity_features WHERE entity_id = $1 AND feature_id = $2', [a.entity_id, a.feature_id]);
    }
    await client.query(`UPDATE inquiry_feature_answers SET status = 'accepted', reviewed_by = $2, reviewed_at = now() WHERE id = $1`, [a.id, adminId]);
    await logAction(adminId, 'entity', a.entity_id, 'accept_operator_feature', { answer: a.id, feature: a.feature_id, offered: a.offered }, client);
  });
  return a;
}

async function rejectFeatureAnswer(answerId, adminId) {
  await db.query(
    `UPDATE inquiry_feature_answers SET status = 'rejected', reviewed_by = $2, reviewed_at = now() WHERE id = $1 AND status = 'pending'`,
    [answerId, adminId]
  );
  await logAction(adminId, 'inquiry_feature_answer', answerId, 'reject_operator_feature');
}

// Alle unveränderten Bestätigungen einer Anfrage übernehmen (Werte wie bisher, erfasste Leistungen weiter angeboten).
// Korrekturen und neue Leistungen bleiben zur Einzelprüfung stehen.
async function acceptConfirmations(inquiryId, adminId) {
  const values = await db.many(
    `SELECT id FROM inquiry_answers WHERE inquiry_id = $1 AND status = 'pending' AND kind = 'confirm' AND value = previous`, [inquiryId]
  );
  const features = await db.many(
    `SELECT id FROM inquiry_feature_answers WHERE inquiry_id = $1 AND status = 'pending' AND known AND offered`, [inquiryId]
  );
  for (const v of values) await acceptAnswer(v.id, adminId);
  for (const ft of features) await acceptFeatureAnswer(ft.id, adminId);
  return { values: values.length, features: features.length };
}

async function close(inquiryId, adminId) {
  await db.query(`UPDATE inquiries SET status = 'closed', updated_at = now() WHERE id = $1 AND status IN ('queued','sent','failed')`, [inquiryId]);
  await logAction(adminId, 'inquiry', inquiryId, 'close_inquiry');
}

// Täglich: einmal erinnern nach 7 Tagen (mit neuem Link), nach 30 Tagen verfallen lassen.
async function dailyMaintenance() {
  const expired = await db.query(`UPDATE inquiries SET status = 'expired', updated_at = now() WHERE status = 'sent' AND expires_at < now()`);
  const due = await db.many(
    `SELECT * FROM inquiries i WHERE status = 'sent' AND reminder_sent_at IS NULL
       AND sent_at < now() - make_interval(days => $1) AND expires_at > now()
       -- keine Erinnerung, wenn der Betreiber per Mail geantwortet hat
       AND NOT EXISTS (SELECT 1 FROM mail_messages m WHERE m.inquiry_id = i.id AND m.kind = 'mail')`,
    [REMINDER_AFTER_DAYS]
  );
  for (const inq of due) {
    const tok = newToken();
    const site = await sites.forRanking(await rankings.getRanking(inq.ranking_id));
    const persona = await personaOf(inq);
    const entity = await db.one('SELECT name FROM entities WHERE id = $1', [inq.entity_id]);
    const tpl = await aimail.get(site.id, 'inquiry_reminder', inq.language);
    const vars = { marke: site.name, objekt: entity ? entity.name : '', name: persona ? persona.name : site.name, betreff: inq.subject, text: inq.body };
    const url = answerUrl(site, tok.token);
    const ok = await mailer.send({
      to: inq.recipient,
      template: 'inquiry',
      site,
      persona,
      inquiryId: inq.id,
      entityId: inq.entity_id,
      data: {
        subject: aimail.fill(tpl.subject, vars).slice(0, 200),
        text: aimail.fill(tpl.body, vars).split(agent.LINK).join(url),
        language: inq.language,
        cta: buttonKind(inq),
      },
    });
    if (ok) await db.query(`UPDATE inquiries SET token_hash = $2, reminder_sent_at = now(), updated_at = now() WHERE id = $1`, [inq.id, tok.hash]);
  }
  return { expired: expired.rowCount, reminded: due.length };
}

// ---------- Einwilligungen (Admin) ----------

// Gilt eine Einwilligung? Grundlage für automatisierte Abläufe (z. B. n8n-Webhooks).
async function hasConsent(entityId, siteId, type) {
  return Boolean(await db.one(
    `SELECT 1 FROM consents WHERE entity_id = $1 AND site_id = $2 AND type = $3 AND withdrawn_at IS NULL`, [entityId, siteId, type]
  ));
}

async function addConsent({ entityId, siteId, type, contactEmail, contactName, note, adminId }) {
  if (!consentTexts.TYPES[type]) throw new Error('Unbekannte Einwilligung.');
  const entity = await db.one('SELECT name FROM entities WHERE id = $1', [entityId]);
  const site = await sites.get(siteId);
  const row = await db.one(
    `INSERT INTO consents (entity_id, site_id, type, source, contact_email, contact_name, text_version, text, note, created_by)
     VALUES ($1, $2, $3, 'admin', $4, $5, $6, $7, $8, $9)
     ON CONFLICT (entity_id, site_id, type) WHERE withdrawn_at IS NULL DO NOTHING RETURNING id`,
    [entityId, siteId, type, contactEmail || null, contactName || null, consentTexts.VERSION,
      consentTexts.text(type, 'de', site.name, entity.name), note || null, adminId]
  );
  if (!row) throw new Error('Diese Einwilligung liegt bereits vor.');
  await logAction(adminId, 'consent', row.id, 'add_consent', { type, note });
}

async function withdrawConsent(consentId, adminId, note) {
  await db.query(
    `UPDATE consents SET withdrawn_at = now(), withdrawn_by = $2, note = COALESCE(note || ' · ', '') || $3 WHERE id = $1 AND withdrawn_at IS NULL`,
    [consentId, adminId, `Widerruf: ${note || 'ohne Angabe'}`]
  );
  await logAction(adminId, 'consent', consentId, 'withdraw_consent', { note });
}

module.exports = {
  createDraft,
  startDraft,
  formulate,
  approveDraft,
  discardDraft,
  draftCriteria,
  defaultConfirmSelection, manualFeatures, buttonKind, acceptFeatureAnswer, rejectFeatureAnswer, acceptConfirmations,
  setEnqueue, unclearCriteria, formConsents, hasConsent, addConsent, withdrawConsent, start, send, findByToken, submitAnswers, acceptAnswer, rejectAnswer, close,
  dailyMaintenance, isImageFile, MAX_PHOTOS,
};
