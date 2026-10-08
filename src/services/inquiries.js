// Anfragen an Betreiber: unklare Werte bestätigen lassen und Fotos mit Nutzungserlaubnis einholen.
// queued -> (Agent + Versand) -> sent -> answered | expired ; Fehler -> failed ; Admin schließt -> closed
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');
const mailer = require('./mailer');
const rankings = require('./rankings');
const agent = require('./inquiry-agent');
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
    const criteria = (await rankings.getCriteria(inq.ranking_id)).filter((c) => inq.criteria_ids.includes(c.id));
    const facts = Object.fromEntries((await rankings.getFacts(entity.id, ranking.id)).map((f) => [f.criterion_id, f]));
    const draft = await agent.draftInquiry({
      entity, ranking, criteria, facts, language: inq.language, adminNote: inq.admin_note, askPhotos: inq.ask_photos,
      persona, brand: site.name,
    });
    const tok = newToken();
    const ok = await mailer.send({
      to: inq.recipient,
      template: 'inquiry',
      site,
      persona,
      inquiryId: inq.id,
      data: { subject: draft.subject, text: draft.body.replace(agent.LINK, answerUrl(site, tok.token)), language: inq.language },
    });
    if (!ok) throw new Error('Mailversand fehlgeschlagen.');
    // Gespeichert wird der Text mit Platzhalter – der Antwortlink selbst liegt nur als Hash vor.
    await db.query(
      `UPDATE inquiries SET status = 'sent', subject = $2, body = $3, questions = $4, token_hash = $5, sent_at = now(),
         expires_at = now() + make_interval(days => $6), error = $7, updated_at = now() WHERE id = $1`,
      [inq.id, draft.subject, draft.body, JSON.stringify(draft.questions), tok.hash, VALID_DAYS,
        draft.usedFallback && config.llm.provider !== 'none' ? 'Agent nicht verfügbar, Vorlage verwendet' : null]
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
  const criteria = (await rankings.getCriteria(inq.ranking_id)).filter((c) => inq.criteria_ids.includes(c.id));
  const answers = [];
  for (const c of criteria) {
    const raw = body[`q_${c.id}`];
    if (raw === undefined || raw === '') continue;
    const value = raw === 'unknown' ? null : agent.toFactValue(c, raw);
    if (raw !== 'unknown' && !value) continue;
    answers.push({ criterionId: c.id, value, comment: String(body[`c_${c.id}`] || '').trim().slice(0, 500) || null });
  }

  const photos = inq.ask_photos ? files : [];
  const credit = String(body.photo_credit || '').trim().slice(0, 200);
  if (photos.length) {
    if (body.photo_consent !== 'on') errors.push(inq.language === 'de' ? 'Bitte die Nutzungserlaubnis für die Fotos bestätigen.' : 'Please confirm the permission to use the photos.');
    if (!credit) errors.push(inq.language === 'de' ? 'Bitte einen Urhebervermerk angeben.' : 'Please enter a photo credit.');
    if (photos.length > MAX_PHOTOS) errors.push(inq.language === 'de' ? `Höchstens ${MAX_PHOTOS} Fotos.` : `At most ${MAX_PHOTOS} photos.`);
    for (const f of photos) if (!isImageFile(f.path)) errors.push(`${f.originalname}: kein gültiges Bild (JPG, PNG, WebP).`);
  }
  if (!answers.length && !photos.length && !String(body.note || '').trim() && body.consent_partner_contact !== 'on') {
    errors.push(inq.language === 'de' ? 'Bitte mindestens eine Frage beantworten.' : 'Please answer at least one question.');
  }
  if (errors.length) {
    for (const f of files) fs.unlink(f.path, () => {});
    return { errors };
  }

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
    for (const f of photos) {
      await client.query(
        `INSERT INTO entity_images (entity_id, storage_path, source, license, credit, release_proof, inquiry_id)
         VALUES ($1, $2, 'owner_release', $3, $4, $5, $6)`,
        [entity.id, path.basename(f.path), 'Nutzungserlaubnis des Betreibers', credit, proof, inq.id]
      );
    }
    await client.query(
      `UPDATE inquiries SET status = 'answered', answered_at = now(), reply_name = $2, reply_note = $3, updated_at = now() WHERE id = $1`,
      [inq.id, replyName, note]
    );
    await logAction(null, 'inquiry', inq.id, 'answered', { answers: answers.length, photos: photos.length, consents: granted }, client);
  });
  if (config.mail.adminNotify) {
    await mailer.send({
      to: config.mail.adminNotify,
      template: 'inquiry-answered',
      site,
      inquiryId: inq.id,
      data: {
        entityName: entity.name, answers: answers.length, photos: photos.length, consents: granted.map((t) => consentTexts.TYPES[t]),
        link: `${config.baseUrl}/admin/${inq.submission_id ? `meldungen/${inq.submission_id}` : 'aufgaben'}#anfragen`,
      },
    });
  }
  return { errors: [], answers: answers.length, photos: photos.length, consents: granted };
}

async function acceptAnswer(answerId, adminId) {
  const a = await db.one(
    `SELECT a.*, i.entity_id, i.ranking_id, i.answered_at FROM inquiry_answers a JOIN inquiries i ON i.id = a.inquiry_id WHERE a.id = $1`,
    [answerId]
  );
  if (!a || a.status !== 'pending') return null;
  await db.tx(async (client) => {
    if (a.value) {
      const evidence = `Antwort des Betreibers vom ${formatDate(a.answered_at)}${a.comment ? `: ${a.comment}` : ''}`;
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

async function close(inquiryId, adminId) {
  await db.query(`UPDATE inquiries SET status = 'closed', updated_at = now() WHERE id = $1 AND status IN ('queued','sent','failed')`, [inquiryId]);
  await logAction(adminId, 'inquiry', inquiryId, 'close_inquiry');
}

// Täglich: einmal erinnern nach 7 Tagen (mit neuem Link), nach 30 Tagen verfallen lassen.
async function dailyMaintenance() {
  const expired = await db.query(`UPDATE inquiries SET status = 'expired', updated_at = now() WHERE status = 'sent' AND expires_at < now()`);
  const due = await db.many(
    `SELECT * FROM inquiries WHERE status = 'sent' AND reminder_sent_at IS NULL
       AND sent_at < now() - make_interval(days => $1) AND expires_at > now()`,
    [REMINDER_AFTER_DAYS]
  );
  for (const inq of due) {
    const tok = newToken();
    const site = await sites.forRanking(await rankings.getRanking(inq.ranking_id));
    const persona = await personaOf(inq);
    const ok = await mailer.send({
      to: inq.recipient,
      template: 'inquiry',
      site,
      persona,
      inquiryId: inq.id,
      data: {
        subject: (inq.language === 'de' ? 'Erinnerung: ' : 'Reminder: ') + inq.subject,
        text: inq.body.replace(agent.LINK, answerUrl(site, tok.token)),
        language: inq.language,
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
  setEnqueue, unclearCriteria, formConsents, hasConsent, addConsent, withdrawConsent, start, send, findByToken, submitAnswers, acceptAnswer, rejectAnswer, close,
  dailyMaintenance, isImageFile, MAX_PHOTOS,
};
