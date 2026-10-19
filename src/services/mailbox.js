// Postfach: eingehende Mails (Antworten auf Mia, Lara, Ben und alles andere an die Sammeladresse).
// Abruf über eine austauschbare Quelle (services/mailsource/*: heute IMAP, später z. B. Gmail) – hier liegt nur,
// was unabhängig von der Quelle ist: Einordnen (Abwesenheit, unzustellbar), Zuordnen, Speichern, Antworten.
//
// Zuordnung (erste passende Regel gewinnt):
//   1. thread – In-Reply-To/References verweisen auf eine von uns versendete Mail (email_log.message_id)
//   2. sender – Absender ist Kontaktadresse genau eines Objekts, Empfänger einer Anfrage oder eines Camp-Anbieters
//   3. domain – Absender-Domain passt zur Website genau eines Objekts (nicht bei Freemail-Adressen)
// Sonst bleibt die Mail unzugeordnet und erscheint als Karte „zuordnen“ auf dem Board.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const mailer = require('./mailer');
const sites = require('./sites');
const { logAction } = require('../lib/audit');

const KINDS = { mail: 'Mail', auto_reply: 'Abwesenheit', bounce: 'Unzustellbar' };
const STATUS = { new: 'neu', done: 'erledigt', ignored: 'ignoriert' };
const MATCHED_BY = { thread: 'Antwort auf unsere Mail', sender: 'Absenderadresse', domain: 'Domain der Website', admin: 'von Hand' };
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_BODY = 100000;

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch', 'web.de', 't-online.de', 'outlook.com', 'outlook.de',
  'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 'me.com', 'aol.com', 'posteo.de',
  'mail.de', 'freenet.de', 'arcor.de', 'proton.me', 'protonmail.com', 'online.de', 'ionos.de', 'msn.com', 'libero.it', 'orange.fr',
]);

const lower = (s) => String(s || '').trim().toLowerCase();

// "<a@b> <c@d>" bzw. Array -> ['<a@b>', '<c@d>']
function extractIds(value) {
  const list = Array.isArray(value) ? value.join(' ') : String(value || '');
  return [...new Set(list.match(/<[^<>\s]+>/g) || [])];
}

function domainOf(email) {
  const m = /@([^@\s>]+)$/.exec(lower(email));
  return m ? m[1] : null;
}

// Registrierbare Domain (vereinfachte Regel: letzte zwei Teile, bei co.uk & Co. drei)
function baseDomain(host) {
  const parts = lower(host).replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const twoPart = /^(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoPart ? -3 : -2).join('.');
}

function websiteDomain(url) {
  try {
    return baseDomain(new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname);
  } catch {
    return null;
  }
}

// Art der Mail aus den Kopfzeilen: Abwesenheitsnotiz, Unzustellbarkeitsmeldung oder echte Mail
function classify({ headers = {}, fromEmail = '', subject = '', contentType = '' }) {
  const h = (k) => lower(headers[k]);
  const from = lower(fromEmail);
  const report = /multipart\/report/.test(lower(contentType)) && /delivery-status/.test(lower(contentType));
  if (report || /^(mailer-daemon|postmaster)@/.test(from) || /^(undeliver|delivery status notification|mail delivery failed|returned mail|unzustellbar|nicht zustellbar)/i.test(subject)) return 'bounce';
  const auto = h('auto-submitted');
  if ((auto && auto !== 'no') || headers['x-autoreply'] || headers['x-autorespond'] || /^(auto_reply|bulk|junk)$/.test(h('precedence'))
    || /^(automatische antwort|abwesenheitsnotiz|auto(matic)?[ -]?reply|out of (the )?office|abwesend)/i.test(subject)) return 'auto_reply';
  return 'mail';
}

// Reine Zuordnungslogik; lookups liefert die Datenbank (in Tests: Attrappen)
//   byMessageIds(ids) -> email_log-Zeile oder null
//   bySender(email) -> { entities: [...], inquiries: [...], providers: [...] }
//   byDomain(domain) -> [entity_id, ...]
async function match({ fromEmail, inReplyTo, refs = [], toEmails = [] }, lookups, personas = []) {
  const out = { entity_id: null, inquiry_id: null, camp_provider_id: null, persona_id: null, email_log_id: null, matched_by: null };
  // Persona aus der Empfängeradresse (mia@ …), falls Aliase/Weiterleitungen genutzt werden
  const to = toEmails.map(lower);
  const addressed = personas.find((p) => p.email && to.includes(lower(p.email)));
  if (addressed) out.persona_id = addressed.id;

  const ids = [...extractIds(inReplyTo), ...extractIds(refs).reverse()];
  if (ids.length) {
    const log = await lookups.byMessageIds(ids);
    if (log) {
      Object.assign(out, {
        email_log_id: log.id, entity_id: log.entity_id || null, inquiry_id: log.inquiry_id || null,
        camp_provider_id: log.camp_provider_id || null, persona_id: log.persona_id || out.persona_id, matched_by: 'thread',
      });
      if (out.entity_id || out.inquiry_id || out.camp_provider_id) return out;
    }
  }
  const s = await lookups.bySender(lower(fromEmail));
  const entityIds = [...new Set([...s.entities, ...s.inquiries.map((i) => i.entity_id)])];
  if (entityIds.length === 1) {
    const inq = s.inquiries.find((i) => i.entity_id === entityIds[0]);
    return { ...out, entity_id: entityIds[0], inquiry_id: out.inquiry_id || (inq ? inq.id : null), persona_id: out.persona_id || (inq && inq.persona_id) || null, matched_by: out.matched_by || 'sender' };
  }
  if (!entityIds.length && s.providers.length === 1) return { ...out, camp_provider_id: s.providers[0], matched_by: out.matched_by || 'sender' };
  const domain = domainOf(fromEmail);
  if (!entityIds.length && domain && !FREEMAIL.has(domain)) {
    const byDomain = await lookups.byDomain(baseDomain(domain));
    if (byDomain.length === 1) return { ...out, entity_id: byDomain[0], matched_by: out.matched_by || 'domain' };
  }
  return out;
}

const dbLookups = {
  async byMessageIds(ids) {
    return db.one(`SELECT id, entity_id, inquiry_id, camp_provider_id, persona_id FROM email_log WHERE message_id = ANY($1::text[]) ORDER BY created_at DESC LIMIT 1`, [ids]);
  },
  async bySender(email) {
    if (!email) return { entities: [], inquiries: [], providers: [] };
    const entities = (await db.many(`SELECT id FROM entities WHERE lower(contact_email) = $1`, [email])).map((r) => r.id);
    const inquiries = await db.many(`SELECT id, entity_id, persona_id FROM inquiries WHERE lower(recipient) = $1 ORDER BY created_at DESC`, [email]);
    const providers = (await db.many(`SELECT id FROM camp_providers WHERE lower(lead_email) = $1`, [email])).map((r) => r.id);
    return { entities, inquiries, providers };
  },
  async byDomain(domain) {
    const rows = await db.many(`SELECT id, website FROM entities WHERE website ILIKE $1`, [`%${domain}%`]);
    return rows.filter((r) => websiteDomain(r.website) === domain).map((r) => r.id);
  },
};

// Anhänge außerhalb des öffentlichen Verzeichnisses speichern (Download nur im Admin)
async function saveAttachments(id, attachments = []) {
  const list = [];
  const dir = path.join(config.uploadDir, 'mail', id);
  for (const [i, a] of attachments.entries()) {
    const name = String(a.filename || `anhang-${i + 1}`).replace(/[^\w.\- äöüÄÖÜß]/g, '_').slice(0, 120);
    if (a.related || (a.contentDisposition === 'inline' && /^image\//.test(a.contentType || '') && a.size < 20000)) continue; // Logos/Signaturbilder
    if (list.length >= MAX_ATTACHMENTS || !a.content || a.size > MAX_ATTACHMENT_BYTES) {
      list.push({ name, size: a.size || 0, skipped: true });
      continue;
    }
    await fs.mkdir(dir, { recursive: true });
    const file = `${i + 1}-${crypto.randomBytes(4).toString('hex')}`;
    await fs.writeFile(path.join(dir, file), a.content);
    list.push({ file, name, type: a.contentType || 'application/octet-stream', size: a.size || a.content.length });
  }
  return list;
}

function textOf(parsed) {
  const t = parsed.text || (parsed.html ? mailer.htmlToText(String(parsed.html)) : '');
  return t.slice(0, MAX_BODY);
}

// Eine geparste Mail (mailparser-Format) speichern. Rückgabe: Zeile oder null (bereits vorhanden)
async function ingest(parsed, source) {
  const messageId = parsed.messageId ? (extractIds(parsed.messageId)[0] || parsed.messageId) : null;
  if (messageId && await db.one('SELECT 1 FROM mail_messages WHERE message_id = $1', [messageId])) return null;
  const from = (parsed.from && parsed.from.value && parsed.from.value[0]) || {};
  const toList = [parsed.to, parsed.cc].flatMap((x) => (x ? (Array.isArray(x) ? x : [x]) : [])).flatMap((x) => x.value || []).map((v) => lower(v.address)).filter(Boolean);
  const headers = Object.fromEntries([...(parsed.headers || new Map())].map(([k, v]) => [k, typeof v === 'object' && v && v.value ? v.value : String(v)]));
  const contentType = parsed.headers && parsed.headers.get('content-type') ? JSON.stringify(parsed.headers.get('content-type')) : '';
  const kind = classify({ headers, fromEmail: from.address, subject: parsed.subject || '', contentType });
  const refs = extractIds(parsed.references);
  const personas = await db.many('SELECT id, email FROM personas');
  const m = await match({ fromEmail: from.address, inReplyTo: parsed.inReplyTo, refs, toEmails: toList }, dbLookups, personas);
  // Unzustellbar: die Originalmail steckt meist im Anhang – deren Message-ID ebenfalls prüfen
  if (kind === 'bounce' && !m.email_log_id) {
    const inner = extractIds(textOf(parsed).match(/Message-ID:\s*<[^>]+>/gi) || []);
    const log = inner.length ? await dbLookups.byMessageIds(inner) : null;
    if (log) Object.assign(m, { email_log_id: log.id, entity_id: log.entity_id, inquiry_id: log.inquiry_id, camp_provider_id: log.camp_provider_id, persona_id: log.persona_id, matched_by: 'thread' });
  }
  const id = crypto.randomUUID();
  const attachments = kind === 'mail' ? await saveAttachments(id, parsed.attachments) : [];
  const row = await db.one(
    `INSERT INTO mail_messages (id, source, message_id, in_reply_to, refs, from_email, from_name, to_emails, subject, body_text, sent_at, kind,
       entity_id, inquiry_id, camp_provider_id, persona_id, email_log_id, matched_by, status, attachments)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [id, source, messageId, extractIds(parsed.inReplyTo)[0] || null, refs, lower(from.address) || 'unbekannt', from.name || null, toList,
      (parsed.subject || '').slice(0, 500), textOf(parsed), parsed.date || null, kind,
      m.entity_id, m.inquiry_id, m.camp_provider_id, m.persona_id, m.email_log_id, m.matched_by,
      kind === 'auto_reply' ? 'ignored' : 'new', JSON.stringify(attachments)]);
  if (kind === 'bounce' && m.email_log_id) {
    await db.query(`UPDATE email_log SET status = 'bounced' WHERE id = $1`, [m.email_log_id]);
    if (m.inquiry_id) {
      await db.query(`UPDATE inquiries SET status = 'failed', error = $2, updated_at = now() WHERE id = $1 AND status IN ('sent', 'queued')`,
        [m.inquiry_id, `Unzustellbar – Adresse prüfen (Meldung vom ${new Date().toLocaleDateString('de-DE')})`]);
      // die Fehlermeldung erscheint als Karte „Anfrage fehlgeschlagen“
      await db.query(`UPDATE mail_messages SET status = 'done', handled_at = now() WHERE id = $1`, [id]);
    }
  }
  return row;
}

// Abruf über die konfigurierte Quelle; jede erfolgreich gespeicherte Mail wird in der Quelle als verarbeitet markiert
async function poll() {
  const provider = config.mail.inbound.provider;
  if (provider === 'none') return { skipped: true };
  const source = require(`./mailsource/${provider}`);
  const { simpleParser } = require('mailparser');
  const r = { fetched: 0, stored: 0, errors: 0 };
  await source.run(async (raw) => {
    r.fetched += 1;
    try {
      const parsed = await simpleParser(raw);
      if (await ingest(parsed, provider)) r.stored += 1;
      return true;
    } catch (err) {
      r.errors += 1;
      console.error('[mailbox] Mail nicht verarbeitet:', err.message);
      return false;
    }
  });
  return r;
}

const SELECT = `SELECT m.*, e.name AS entity_name, p.name AS persona_name, cp.name AS provider_name, u.email AS handled_by_email,
    (SELECT s.id FROM submissions s WHERE s.entity_id = m.entity_id ORDER BY s.created_at DESC LIMIT 1) AS submission_id
  FROM mail_messages m LEFT JOIN entities e ON e.id = m.entity_id LEFT JOIN personas p ON p.id = m.persona_id
  LEFT JOIN camp_providers cp ON cp.id = m.camp_provider_id LEFT JOIN admin_users u ON u.id = m.handled_by`;

const FILTERS = {
  neu: `m.status = 'new'`,
  offen: `m.status = 'new' AND m.entity_id IS NULL AND m.camp_provider_id IS NULL`,
  erledigt: `m.status = 'done'`,
  ignoriert: `m.status = 'ignored'`,
  alle: 'true',
};

async function list(filter = 'neu') {
  return db.many(`${SELECT} WHERE ${FILTERS[filter] || FILTERS.neu} ORDER BY m.received_at DESC LIMIT 200`);
}

async function counts() {
  return Object.fromEntries((await db.many(
    `SELECT status, count(*)::int AS n, count(*) FILTER (WHERE entity_id IS NULL AND camp_provider_id IS NULL)::int AS unassigned FROM mail_messages GROUP BY status`))
    .map((r) => [r.status, r]));
}

async function get(id) {
  return db.one(`${SELECT} WHERE m.id = $1`, [id]);
}

// Verlauf: unsere Mails (mit Bezug) und eingegangene Mails zu einem Objekt bzw. Camp-Anbieter, zeitlich sortiert
async function thread({ entityId = null, campProviderId = null }) {
  const outgoing = await db.many(
    `SELECT l.id::text, 'out' AS direction, l.created_at AS at, l.recipient AS address, l.subject, l.body_text, l.template, l.status, l.inquiry_id,
            p.name AS persona_name, u.email AS sent_by_email
       FROM email_log l LEFT JOIN personas p ON p.id = l.persona_id LEFT JOIN admin_users u ON u.id = l.sent_by
      WHERE ($1::uuid IS NOT NULL AND l.entity_id = $1) OR ($2::uuid IS NOT NULL AND l.camp_provider_id = $2)`, [entityId, campProviderId]);
  const incoming = await db.many(
    `SELECT m.id::text, 'in' AS direction, m.received_at AS at, m.from_email AS address, m.from_name, m.subject, m.body_text, m.kind, m.status, m.inquiry_id, m.attachments
       FROM mail_messages m WHERE ($1::uuid IS NOT NULL AND m.entity_id = $1) OR ($2::uuid IS NOT NULL AND m.camp_provider_id = $2)`, [entityId, campProviderId]);
  return [...outgoing, ...incoming].sort((a, b) => new Date(a.at) - new Date(b.at));
}

async function assign(id, { entityId = null, campProviderId = null }, adminId) {
  await db.query(`UPDATE mail_messages SET entity_id = $2, camp_provider_id = $3, matched_by = CASE WHEN $2::uuid IS NULL AND $3::uuid IS NULL THEN NULL ELSE 'admin' END WHERE id = $1`,
    [id, entityId, campProviderId]);
  await logAction(adminId, 'mail', id, 'assign_mail', { entity: entityId, provider: campProviderId });
}

async function setStatus(id, status, adminId) {
  if (!STATUS[status]) throw new Error('Unbekannter Status.');
  await db.query(`UPDATE mail_messages SET status = $2, handled_at = CASE WHEN $2 = 'new' THEN NULL ELSE now() END,
                    handled_by = CASE WHEN $2 = 'new' THEN NULL ELSE $3::uuid END WHERE id = $1`, [id, status, adminId]);
  await logAction(adminId, 'mail', id, 'mail_status', { status });
}

// Zitat der Ursprungsmail unter der Antwort
function quote(msg) {
  if (!msg || !msg.body_text) return '';
  const when = new Date(msg.sent_at || msg.received_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
  const lines = msg.body_text.trim().slice(0, 4000).split('\n').map((l) => `> ${l}`);
  return `\n\nAm ${when} schrieb ${msg.from_name || msg.from_email}:\n${lines.join('\n')}`;
}

const replySubject = (subject) => (/^(re|aw|antw):/i.test(String(subject || '').trim()) ? subject : `Re: ${subject || ''}`.trim());

// Nachricht aus dem Admin – als Antwort auf eine eingegangene Mail (messageId) oder neu an ein Objekt (entityId + to)
async function compose({ messageId = null, entityId = null, campProviderId = null, to = null, subject, text, personaId = null }, adminId) {
  const body = String(text || '').trim();
  if (!body) throw new Error('Bitte einen Text eingeben.');
  const orig = messageId ? await get(messageId) : null;
  if (messageId && !orig) throw new Error('Mail nicht gefunden.');
  const recipient = lower(orig ? orig.from_email : to);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) throw new Error('Keine gültige Empfängeradresse.');
  const persona = personaId ? await db.one('SELECT * FROM personas WHERE id = $1', [personaId]) : null;
  const site = persona ? await sites.get(persona.site_id) : await sites.getDefault();
  const subj = orig ? replySubject(orig.subject) : String(subject || '').trim();
  if (!subj) throw new Error('Bitte einen Betreff angeben.');
  const ok = await mailer.send({
    to: recipient, template: 'message', site, persona,
    data: { subject: subj.slice(0, 300), text: body, quoted: orig ? quote(orig).trim() : '', persona },
    entityId: orig ? orig.entity_id : entityId, campProviderId: orig ? orig.camp_provider_id : campProviderId,
    inquiryId: orig ? orig.inquiry_id : null,
    inReplyTo: orig ? orig.message_id : null, references: orig ? [...orig.refs, orig.message_id].filter(Boolean) : null,
    keepBody: true, sentBy: adminId, replyToMessage: orig ? orig.id : null,
  });
  if (!ok) throw new Error('Versand fehlgeschlagen – bitte später erneut versuchen.');
  if (orig && orig.status === 'new') await setStatus(orig.id, 'done', adminId);
  const ref = orig ? orig.id : (entityId || campProviderId);
  if (ref) await logAction(adminId, 'mail', ref, 'send_mail', { to: recipient, persona: persona && persona.name });
}

async function attachment(id, n) {
  const m = await db.one('SELECT attachments FROM mail_messages WHERE id = $1', [id]);
  const a = m && m.attachments[n];
  if (!a || !a.file) return null;
  return { ...a, path: path.join(config.uploadDir, 'mail', id, a.file) };
}

// Löschfrist: Mails samt Anhängen (RETENTION.mailMonths, siehe services/retention.js)
async function purge() {
  const { RETENTION } = require('./retention');
  const old = await db.many(`SELECT id FROM mail_messages WHERE received_at < now() - make_interval(months => $1)`, [RETENTION.mailMonths]);
  for (const m of old) await fs.rm(path.join(config.uploadDir, 'mail', m.id), { recursive: true, force: true });
  if (old.length) await db.query('DELETE FROM mail_messages WHERE id = ANY($1::uuid[])', [old.map((m) => m.id)]);
  return old.length;
}

module.exports = {
  KINDS, STATUS, MATCHED_BY, FILTERS, FREEMAIL,
  extractIds, domainOf, baseDomain, websiteDomain, classify, match, replySubject, quote,
  ingest, poll, list, counts, get, thread, assign, setStatus, compose, attachment, purge,
};
