// Interface "mailer": send({ to, template, data, site, persona, submissionId, inquiryId, entityId, … }).
// Jede Mail bekommt eine eigene Message-ID (im Versandprotokoll), damit Antworten im Postfach zugeordnet werden können.
// Absender, Antwortadresse, Marke und Links kommen aus der Site; Agenten-Mails tragen den Namen der Persona.
// Anbieter über MAIL_PROVIDER: 'console' (nur Log, Entwicklung) oder 'smtp'
// (jeder EU-Anbieter mit SMTP, z. B. Brevo, Mailjet, IONOS). Weitere Anbieter als
// zusätzliche Transport-Funktion ergänzen.
const path = require('path');
const crypto = require('crypto');
const ejs = require('ejs');
const config = require('../config');
const db = require('../db');
const sites = require('./sites');

const mailtemplates = require('./mailtemplates');

// Abmeldelink: Diese Mails löst der Empfänger selbst aus, sie gehen trotz Abmeldung raus (dazu jede Antwort auf eine Mail von ihm)
const OPT_OUT_EXEMPT = new Set(['verify', 'live', 'rejected', 'duplicate', 'review-verify', 'lead-verify', 'request-verify', 'inquiry-answered', 'daily-report']);
const optOutApplies = (template, inReplyTo) => !inReplyTo && !OPT_OUT_EXEMPT.has(template);

// Hat sich dieser Betrieb oder diese Adresse über den Abmeldelink abgemeldet?
async function optedOut(to, entityId = null) {
  return Boolean(await db.one(
    `SELECT 1 AS x FROM entities WHERE inquiry_opt_out_at IS NOT NULL AND (id = $1 OR lower(contact_email) = lower($2)) LIMIT 1`, [entityId, to]
  ));
}

// Betreff für Mails ohne Vorlage (Agenten-Mails setzen ihn selbst)
const SUBJECTS = {};

// Aktive Vorlage der Site oder Standardtext
async function templateFor(site, key, language = 'de') {
  const row = site
    ? await db.one(`SELECT subject, body FROM email_templates WHERE site_id = $1 AND key = $2 AND language = $3 AND active`, [site.id, key, language])
    : null;
  return row || mailtemplates.DEFAULTS[key];
}

let smtpTransport = null;

async function sendSmtp({ from, to, subject, html, text, replyTo, messageId, inReplyTo, references, headers }) {
  if (!smtpTransport) {
    const nodemailer = require('nodemailer');
    smtpTransport = nodemailer.createTransport({
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      secure: config.mail.smtp.port === 465,
      auth: { user: config.mail.smtp.user, pass: config.mail.smtp.pass },
    });
  }
  const info = await smtpTransport.sendMail({
    from, to, subject, html, text, replyTo: replyTo || undefined, messageId,
    inReplyTo: inReplyTo || undefined, references: references && references.length ? references : undefined, headers: headers || undefined,
  });
  return info.messageId;
}

async function sendConsole({ from, to, subject, text }) {
  console.log(`[mail] von ${from} an ${to}: ${subject}\n${text}\n`);
  return 'console';
}

const transports = { console: sendConsole, smtp: sendSmtp };

// Eigene Message-ID mit der Domain des Absenders: <zufall@tri-hotel.de>
function newMessageId(from) {
  const m = /@([^\s>]+)>?\s*$/.exec(String(from || ''));
  return `<${crypto.randomUUID()}@${m ? m[1].toLowerCase() : 'localhost'}>`;
}

// Abmeldung im Mail-Kopf: Mailprogramme bieten sie direkt an (RFC 8058, ein POST auf die Adresse meldet ab)
function unsubscribeHeaders(url) {
  return url ? { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : null;
}

function htmlToText(html) {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// entityId/campProviderId: Bezug für Postfach und Verlauf; inReplyTo/references: Antwort auf eine eingegangene Mail;
// keepBody: Text im Protokoll speichern (nur für Nachrichten aus dem Admin, nie für Mails mit Bestätigungslinks)
async function send({
  to, template, data, site = null, persona = null, submissionId = null, inquiryId = null, replyTo: replyToOverride = null,
  entityId = null, campProviderId = null, inReplyTo = null, references = null, keepBody = false, sentBy = null, replyToMessage = null,
  unsubscribeUrl = null,
}) {
  const transport = transports[config.mail.provider];
  if (!transport) throw new Error(`Unbekannter MAIL_PROVIDER „${config.mail.provider}“`);
  const s = site || (await sites.getDefault());
  if (optOutApplies(template, inReplyTo) && await optedOut(to, entityId)) {
    await db.query(
      `INSERT INTO email_log (submission_id, inquiry_id, recipient, template, status, subject, site_id, entity_id, camp_provider_id, sent_by)
       VALUES ($1, $2, $3, $4, 'blocked', $5, $6, $7, $8, $9)`,
      [submissionId, inquiryId, to, template, (data && data.subject) || null, s ? s.id : null, entityId, campProviderId, sentBy]
    );
    return false;
  }
  const locals = { ...data, site: s, baseUrl: sites.urlFor(s) };
  const from = sites.mailFrom(s, persona);
  const ownPersona = (config.mail.personaSender === 'own' || (persona && persona.own_sender)) && persona && persona.email;
  const replyTo = replyToOverride || (ownPersona ? persona.email : null) || (s && s.mail_reply_to) || config.mail.replyTo;
  // Im Admin gepflegte Vorlage der Site, sonst Standardtext; Agenten-Mails (inquiry) bleiben EJS mit Agententext
  let html;
  let subject;
  if (mailtemplates.DEFAULTS[template]) {
    const tpl = await templateFor(s, template);
    ({ html, subject } = await mailtemplates.render(tpl, template, data, s, locals.baseUrl));
  } else {
    html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'emails', `${template}.ejs`), locals);
    subject = locals.subject || (SUBJECTS[template] ? SUBJECTS[template](locals) : s.name);
  }
  let status = 'sent';
  let providerId = null;
  const messageId = newMessageId(from);
  const text = htmlToText(html);
  try {
    providerId = await transport({ from, to, subject, html, text, replyTo, messageId, inReplyTo, references, headers: unsubscribeHeaders(unsubscribeUrl) });
  } catch (err) {
    status = 'failed';
    console.error(`[mail] Versand fehlgeschlagen (${template} an ${to}):`, err.message);
  }
  await db.query(
    `INSERT INTO email_log (submission_id, inquiry_id, recipient, template, status, provider_id, subject, site_id,
       message_id, entity_id, camp_provider_id, persona_id, body_text, sent_by, reply_to_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [submissionId, inquiryId, to, template, status, providerId, subject, s ? s.id : null,
      messageId, entityId, campProviderId, persona ? persona.id : null, keepBody ? text : null, sentBy, replyToMessage]
  );
  return status === 'sent';
}

module.exports = {
  unsubscribeHeaders, send, templateFor, newMessageId, htmlToText, optedOut, optOutApplies };
