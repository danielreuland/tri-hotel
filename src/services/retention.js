// Löschfristen (siehe Datenschutzerklärung). Läuft täglich; jede Regel ist eine einzelne Anweisung.
// Fristen hier ändern = Datenschutzerklärung anpassen (RETENTION wird dort angezeigt).
const db = require('../db');

const RETENTION = {
  ipHashDays: 30,             // IP-Hash aus Meldungen und Kontaktnachrichten (Missbrauchsschutz)
  submitterMonths: 6,         // E-Mail des Melders nach Abschluss der Meldung
  emailLogMonths: 12,         // Versandprotokoll
  contactMonths: 12,          // Kontaktnachrichten nach Erledigung
  inquiryMonths: 24,          // Name und Nachricht aus Betreiber-Antworten nach Abschluss der Anfrage
  consentYearsAfterEnd: 3,    // Einwilligungsnachweise nach Widerruf
  reviewEmailMonths: 6,       // E-Mail aus Bewertungen nach Freigabe/Ablehnung
  reviewUnconfirmedDays: 7,   // unbestätigte Bewertungen (mit Fotos) löschen
  heldReviewDays: 7,          // Bewertung zu einem Vorschlag, der abgelaufen ist (nicht bestätigt)
};

async function run() {
  const r = {};
  const q = async (key, sql, params) => { r[key] = (await db.query(sql, params)).rowCount; };
  await q('ipHashes', `UPDATE submissions SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < now() - make_interval(days => $1)`, [RETENTION.ipHashDays]);
  await q('contactIpHashes', `UPDATE contact_messages SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < now() - make_interval(days => $1)`, [RETENTION.ipHashDays]);
  await q('submitters',
    `UPDATE submissions SET submitter_email = NULL, anonymized_at = now()
      WHERE submitter_email IS NOT NULL AND status IN ('live','rejected','expired','duplicate')
        AND updated_at < now() - make_interval(months => $1)`, [RETENTION.submitterMonths]);
  await q('emailLog', `DELETE FROM email_log WHERE created_at < now() - make_interval(months => $1)`, [RETENTION.emailLogMonths]);
  await q('contacts', `DELETE FROM contact_messages WHERE handled_at IS NOT NULL AND handled_at < now() - make_interval(months => $1)`, [RETENTION.contactMonths]);
  await q('inquiries',
    `UPDATE inquiries SET reply_name = NULL, reply_note = NULL, anonymized_at = now()
      WHERE anonymized_at IS NULL AND status IN ('answered','expired','closed','failed')
        AND updated_at < now() - make_interval(months => $1)`, [RETENTION.inquiryMonths]);
  await q('reviewEmails',
    `UPDATE reviews SET email = NULL, updated_at = now() WHERE email IS NOT NULL AND status IN ('published', 'rejected')
        AND updated_at < now() - make_interval(months => $1)`, [RETENTION.reviewEmailMonths]);
  await q('reviewIpHashes', `UPDATE reviews SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < now() - make_interval(days => $1)`, [RETENTION.ipHashDays]);
  // Unbestätigte Bewertungen samt Fotos entfernen (nicht die vom Admin freigeschalteten)
  const stale = await db.many(`SELECT id FROM reviews WHERE status = 'received' AND verified_by IS NULL AND created_at < now() - make_interval(days => $1)`, [RETENTION.reviewUnconfirmedDays]);
  for (const s of stale) await require('./reviews').remove(s.id, null);
  r.reviewsUnconfirmed = stale.length;
  // Bewertungen zu Vorschlägen, die nie bestätigt wurden (abgelehnte werden sofort gelöscht)
  const heldStale = await db.many(
    `SELECT r.id FROM reviews r JOIN submissions s ON s.id = r.submission_id
      WHERE r.status = 'held' AND s.status IN ('expired', 'rejected') AND s.updated_at < now() - make_interval(days => $1)`, [RETENTION.heldReviewDays]);
  for (const s of heldStale) await require('./reviews').remove(s.id, null);
  r.reviewsHeldExpired = heldStale.length;
  await q('consents', `DELETE FROM consents WHERE withdrawn_at IS NOT NULL AND withdrawn_at < now() - make_interval(years => $1)`, [RETENTION.consentYearsAfterEnd]);
  return r;
}

module.exports = { RETENTION, run };
