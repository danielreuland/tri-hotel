// Interface "mailer": send({ to, template, data, site, persona, submissionId, inquiryId }).
// Absender, Antwortadresse, Marke und Links kommen aus der Site; Agenten-Mails tragen den Namen der Persona.
// Anbieter über MAIL_PROVIDER: 'console' (nur Log, Entwicklung) oder 'smtp'
// (jeder EU-Anbieter mit SMTP, z. B. Brevo, Mailjet, IONOS). Weitere Anbieter als
// zusätzliche Transport-Funktion ergänzen.
const path = require('path');
const ejs = require('ejs');
const config = require('../config');
const db = require('../db');
const sites = require('./sites');

const SUBJECTS = {
  verify: (d) => `Bitte bestätige deinen Vorschlag: ${d.entityName}`,
  duplicate: (d) => `${d.entityName} ist schon bei uns`,
  rejected: (d) => `Dein Vorschlag: ${d.entityName}`,
  live: (d) => `${d.entityName} ist jetzt online`,
  'inquiry-answered': (d) => `Antwort vom Betreiber: ${d.entityName}`,
};

let smtpTransport = null;

async function sendSmtp({ from, to, subject, html, text, replyTo }) {
  if (!smtpTransport) {
    const nodemailer = require('nodemailer');
    smtpTransport = nodemailer.createTransport({
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      secure: config.mail.smtp.port === 465,
      auth: { user: config.mail.smtp.user, pass: config.mail.smtp.pass },
    });
  }
  const info = await smtpTransport.sendMail({ from, to, subject, html, text, replyTo: replyTo || undefined });
  return info.messageId;
}

async function sendConsole({ from, to, subject, text }) {
  console.log(`[mail] von ${from} an ${to}: ${subject}\n${text}\n`);
  return 'console';
}

const transports = { console: sendConsole, smtp: sendSmtp };

function htmlToText(html) {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function send({ to, template, data, site = null, persona = null, submissionId = null, inquiryId = null }) {
  const transport = transports[config.mail.provider];
  if (!transport) throw new Error(`Unbekannter MAIL_PROVIDER „${config.mail.provider}“`);
  const s = site || (await sites.getDefault());
  const locals = { ...data, site: s, baseUrl: sites.urlFor(s) };
  const from = sites.mailFrom(s, persona);
  const replyTo = (s && s.mail_reply_to) || config.mail.replyTo;
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'emails', `${template}.ejs`), locals);
  const subject = locals.subject || (SUBJECTS[template] ? SUBJECTS[template](locals) : s.name);
  let status = 'sent';
  let providerId = null;
  try {
    providerId = await transport({ from, to, subject, html, text: htmlToText(html), replyTo });
  } catch (err) {
    status = 'failed';
    console.error(`[mail] Versand fehlgeschlagen (${template} an ${to}):`, err.message);
  }
  await db.query(
    `INSERT INTO email_log (submission_id, inquiry_id, recipient, template, status, provider_id) VALUES ($1, $2, $3, $4, $5, $6)`,
    [submissionId, inquiryId, to, template, status, providerId]
  );
  return status === 'sent';
}

module.exports = { send };
