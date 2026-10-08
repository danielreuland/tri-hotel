// Wortlaute der Einwilligungen (versioniert). Bei jeder inhaltlichen Änderung VERSION erhöhen –
// gespeichert wird immer der Wortlaut, dem tatsächlich zugestimmt wurde.
// Entwurf: vor dem Livegang rechtlich prüfen lassen.
const VERSION = '2026-10b';

const TYPES = {
  photos_profile: 'Fotos auf dem Profil',
  photos_social: 'Fotos in Social Media',
  partner_contact: 'Kontakt zu Kooperationen',
};

const TEXTS = {
  de: {
    photos_profile: (brand, name) =>
      `Ich bin berechtigt, diese Fotos zur Verfügung zu stellen, und erlaube ${brand}, sie unentgeltlich und zeitlich unbefristet auf dem Profil von ${name} mit dem angegebenen Urhebervermerk zu zeigen. Ich kann die Erlaubnis jederzeit per E-Mail widerrufen.`,
    photos_social: (brand, name) =>
      `Zusätzlich darf ${brand} diese Fotos mit Urhebervermerk in eigenen Social-Media-Beiträgen über ${name} verwenden (z. B. Instagram). Widerruf jederzeit per E-Mail; bereits veröffentlichte Beiträge werden dann entfernt.`,
    partner_contact: (brand) =>
      `Ich möchte von ${brand} per E-Mail über Kooperationsmöglichkeiten informiert werden (z. B. Direktbuchung, Angebote für Sportler). Die Einwilligung ist freiwillig, hat keinen Einfluss auf Bewertung oder Platzierung und kann jederzeit widerrufen werden.`,
  },
  en: {
    photos_profile: (brand, name) =>
      `I am entitled to provide these photos and allow ${brand} to show them free of charge and without time limit on the profile of ${name} with the photo credit given. I can withdraw this permission at any time by email.`,
    photos_social: (brand, name) =>
      `In addition, ${brand} may use these photos with the photo credit in its own social media posts about ${name} (e.g. Instagram). Withdrawal at any time by email; posts already published will then be removed.`,
    partner_contact: (brand) =>
      `I would like ${brand} to inform me by email about cooperation opportunities (e.g. direct booking, offers for athletes). This consent is voluntary, has no influence on rating or ranking, and can be withdrawn at any time.`,
  },
};

function text(type, language, brand, entityName) {
  const t = (TEXTS[language] || TEXTS.de)[type];
  if (!t) throw new Error(`Unbekannte Einwilligung „${type}“`);
  return t(brand, entityName);
}

// Hinweis unter jeder Mail eines Agenten (Transparenzpflicht für KI, EU AI Act Art. 50)
function aiDisclosure(language, persona, brand) {
  return language === 'de'
    ? `${persona.name} · ${persona.title} von ${brand}\nDiese Nachricht wurde von unserer KI-Assistenz verfasst. Ihre Antwort liest ein Mensch aus unserem Team.`
    : `${persona.name} · AI assistant at ${brand}\nThis message was written by our AI assistant. A member of our team reads your reply.`;
}

module.exports = { VERSION, TYPES, text, aiDisclosure };
