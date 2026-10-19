// KI-Mails der Personas (Mia, Lara, Ben): Mustertext je Anlass + Persona-Definition.
// Beim Formulieren gilt die Mischung (siehe inquiry-agent.buildPrompt):
//   feste Regeln (hier, nicht änderbar) + Rolle & Stil der Persona + Mustertext und Pflichtpunkte des Anlasses
//   + konkrete Angaben (Objekt, Fragen, Hinweis) + Stilbeispiel (zuletzt von Hand überarbeitete, gesendete Mail).
// Ist die KI nicht verfügbar, wird der ausgefüllte Mustertext wörtlich verwendet.
const db = require('../db');

const LINK = '{{LINK}}';

// Anlässe. ai: KI formuliert (sonst wird der Mustertext nur ausgefüllt). vars: erlaubte Platzhalter, sections: {{#x}}…{{/x}}
const KEYS = {
  inquiry: {
    label: 'Datenanfrage', persona: 'data_inquiry', ai: true,
    trigger: 'Anfrage an den Betreiber (Reiter Kommunikation → Entwurf formulieren)',
    vars: { marke: 'Name der Site', objekt: 'Name des Objekts', objekte: 'Objekte (Mehrzahl, z. B. „Hotels“)', objekt_art: 'Objektart (Einzahl, z. B. „Hotel“)', name: 'Vorname der Persona', anzahl: 'Anzahl bekannter Angaben zum Bestätigen', LINK: 'persönlicher Antwortlink (Pflicht)' },
    sections: { fotos: 'nur, wenn Fotos angefragt werden', bestaetigen: 'nur, wenn bekannte Angaben bestätigt werden sollen' },
  },
  inquiry_reminder: {
    label: 'Erinnerung zur Datenanfrage', persona: 'data_inquiry', ai: false,
    trigger: 'automatisch 7 Tage nach der Anfrage, wenn keine Antwort kam',
    vars: { marke: 'Name der Site', objekt: 'Name des Objekts', name: 'Vorname der Persona', betreff: 'Betreff der Anfrage', text: 'Text der Anfrage (mit Antwortlink)', LINK: 'persönlicher Antwortlink' },
    sections: {},
  },
};

const DEFAULTS = {
  inquiry: {
    de: {
      subject: 'Kurze Rückfrage zu Ihrem Profil: {{objekt}}',
      body: `Sehr geehrte Damen und Herren,

{{marke}} ist eine unabhängige Übersicht über {{objekte}}, bewertet nach geprüften Fakten. {{objekt}} ist bei uns erfasst. Damit Ihr Profil vollständig und korrekt ist, haben wir ein paar kurze Fragen zu Ihrem Angebot.

Die Beantwortung dauert etwa zwei Minuten:
{{LINK}}
{{#bestaetigen}}
Außerdem haben wir {{anzahl}} Angaben zu Ihrem Haus erfasst – über denselben Link können Sie diese kurz prüfen und bei Bedarf korrigieren.
{{/bestaetigen}}
{{#fotos}}
Über denselben Link können Sie uns auch gern Fotos Ihres Hauses mit Nutzungserlaubnis senden. Wir zeigen sie mit Ihrem Urhebervermerk auf Ihrem Profil.
{{/fotos}}
Ihre Angaben werden auf Ihrem Profil als „vom {{objekt_art}} bestätigt“ gekennzeichnet. Der Eintrag ist kostenlos; die Platzierung lässt sich nicht kaufen.

Sie können auch einfach auf diese Mail antworten.

Mit freundlichen Grüßen
{{name}}`,
      must: `In einem Satz erklären, warum wir fragen
Antworten werden auf dem Profil als „vom Betreiber bestätigt“ gekennzeichnet
Der Eintrag ist kostenlos, die Platzierung nicht käuflich
Man kann auch einfach auf die Mail antworten`,
    },
    en: {
      subject: 'Quick question about your profile: {{objekt}}',
      body: `Dear Sir or Madam,

{{marke}} is an independent overview of {{objekte}} for athletes, rated on verified facts. {{objekt}} is listed with us. To make sure your profile is complete and correct, we have a few short questions about your facilities.

Answering takes about two minutes:
{{LINK}}
{{#bestaetigen}}
We have also recorded {{anzahl}} details about your property – using the same link, you can quickly check them and correct anything if needed.
{{/bestaetigen}}
{{#fotos}}
Using the same link, you are welcome to send us photos of your property along with permission to use them. We will show them on your profile with your photo credit.
{{/fotos}}
Your answers will be marked on your profile as confirmed by you. The listing is free of charge; rankings cannot be bought.

You are also welcome to simply reply to this email.

Kind regards
{{name}}`,
      must: `Explain in one sentence why we are asking
Answers are marked on the profile as confirmed by the operator
The listing is free of charge, rankings cannot be bought
They can also simply reply to this email`,
    },
  },
  inquiry_reminder: {
    de: {
      subject: 'Erinnerung: {{betreff}}',
      body: `Guten Tag,

vor einer Woche haben wir Ihnen die folgende Anfrage geschickt. Falls sie untergegangen ist: Der Link ist weiterhin gültig, und Sie können auch einfach auf diese Mail antworten.

-------- Ursprüngliche Nachricht --------
{{text}}`,
      must: '',
    },
    en: {
      subject: 'Reminder: {{betreff}}',
      body: `Hello,

a week ago we sent you the request below. In case it got lost: the link is still valid, and you can also simply reply to this email.

-------- Original message --------
{{text}}`,
      must: '',
    },
  },
};

// Feste Regeln für jede KI-Mail (Neutralität, Transparenz, Recht) – im Admin sichtbar, nicht änderbar
function rules({ askPhotos = false } = {}) {
  return [
    'Höchstens 150 Wörter. Keine Werbung, keine Angebote, keine Preise, keine Versprechen zur Platzierung.',
    `Der persönliche Antwortlink steht genau als ${LINK} auf einer eigenen Zeile. Keine anderen Links oder URLs.`,
    'Nur nach den ausgewählten Punkten fragen, nichts erfinden, keine Angaben über das Objekt behaupten.',
    'Unterschreibe nur mit dem Vornamen der Persona. Einen Hinweis auf KI fügen wir selbst an – schreibe keinen.',
    'Gib dich nicht als Mensch aus und behaupte keine persönlichen Erfahrungen.',
    askPhotos
      ? 'Bitte zusätzlich höflich um Fotos des Hauses mit Nutzungserlaubnis über denselben Link; sie erscheinen mit Urhebervermerk auf dem Profil. Keine Pflicht.'
      : 'Nicht nach Fotos fragen.',
  ];
}

const LANGUAGES = { de: 'Deutsch', en: 'Englisch' };

// Platzhalter ausfüllen; {{LINK}} bleibt stehen (wird erst beim Versand ersetzt), unbekannte bleiben sichtbar
function fill(text, vars = {}, flags = {}) {
  let out = String(text || '').replace(/\r/g, '');
  out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (m, k, inner) => (flags[k] ? inner : ''));
  out = out.replace(/\{\{(\w+)\}\}/g, (m, k) => (k === 'LINK' || !(k in vars) || vars[k] === null || vars[k] === undefined ? m : String(vars[k])));
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Unbekannte Platzhalter oder Abschnitte (für die Prüfung beim Speichern)
function unknownPlaceholders(key, ...texts) {
  const k = KEYS[key];
  const out = new Set();
  for (const t of texts) {
    for (const [, name] of String(t || '').matchAll(/\{\{(\w+)\}\}/g)) if (!(name in k.vars)) out.add(name);
    for (const [, name] of String(t || '').matchAll(/\{\{[#/](\w+)\}\}/g)) if (!(name in k.sections)) out.add(`#${name}`);
  }
  return [...out];
}

function mustList(must) {
  return String(must || '').split('\n').map((l) => l.replace(/^[-•*\s]+/, '').trim()).filter(Boolean);
}

// Gespeicherte Fassung der Site oder Standard
async function get(siteId, key, language = 'de') {
  const lang = DEFAULTS[key][language] ? language : 'de';
  const row = siteId ? await db.one(`SELECT * FROM ai_mail_templates WHERE site_id = $1 AND key = $2 AND language = $3`, [siteId, key, lang]) : null;
  return row ? { ...row, custom: true } : { ...DEFAULTS[key][lang], key, language: lang, custom: false };
}

// Stilbeispiel: zuletzt gesendete Anfrage, deren KI-Text von Hand überarbeitet wurde (gleiche Sprache, ohne KI-Hinweis)
async function inquiryExample(language, excludeId = null) {
  const row = await db.one(
    `SELECT subject, body FROM inquiries
      WHERE status IN ('sent', 'answered', 'expired', 'closed') AND sent_at IS NOT NULL AND language = $1
        AND generated_body IS NOT NULL AND body <> generated_body AND ($2::uuid IS NULL OR id <> $2)
      ORDER BY sent_at DESC LIMIT 1`, [language, excludeId]);
  return row ? { subject: row.subject, body: stripDisclosure(row.body) } : null;
}

// Der KI-Hinweis steht nach einer Zeile „--“ und gehört nicht ins Stilbeispiel
function stripDisclosure(body) {
  return String(body || '').split(/\n--\n/)[0].trim();
}

module.exports = { LINK, KEYS, DEFAULTS, LANGUAGES, rules, fill, unknownPlaceholders, mustList, get, inquiryExample, stripDisclosure };
