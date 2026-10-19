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

async function sendSmtp({ from, to, subject, html, text, replyTo, messageId, inReplyTo, references }) {
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
    inReplyTo: inReplyTo || undefined, references: references && references.length ? references : undefined,
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
}) {
  const transport = transports[config.mail.provider];
  if (!transport) throw new Error(`Unbekannter MAIL_PROVIDER „${config.mail.provider}“`);
  const s = site || (await sites.getDefault());
  const locals = { ...data, site: s, baseUrl: sites.urlFor(s) };
  const from = sites.mailFrom(s, persona);
  const ownPersona = config.mail.personaSender === 'own' && persona && persona.email;
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
    providerId = await transport({ from, to, subject, html, text, replyTo, messageId, inReplyTo, references });
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

module.exports = { send, templateFor, newMessageId, htmlToText };
