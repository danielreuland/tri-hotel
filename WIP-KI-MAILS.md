# Übergabe: KI-Mails (Persona + Mustertext je Anlass)

Stand 19.10.2026. Auf dem Firmen-Mac hat eine Sicherheitssoftware (Bitdefender/ManageEngine) drei Dateien gesperrt.
Diese Notiz enthält deren geplanten Inhalt. Auf dem privaten Mac: Branch `wip-ki-mails` auschecken, die Punkte unten
umsetzen, testen (auf dem Server, `npm test`), nach `main` mergen, deployen und diese Datei löschen.

Ziel (mit Daniel abgestimmt): Beim Formulieren mischt die KI
**feste Regeln (Code)** + **Rolle & Stil der Persona** (`personas.style`) + **Mustertext und Pflichtpunkte des Anlasses**
(`ai_mail_templates`, Admin: Einstellungen → E-Mail-Vorlagen → KI-Mails) + konkrete Angaben + **Stilbeispiel**
(zuletzt von Hand überarbeitete, gesendete Anfrage). Ohne KI wird der ausgefüllte Mustertext wörtlich verwendet.
Anlässe jetzt: `inquiry` (Datenanfrage, KI) und `inquiry_reminder` (Erinnerung, ohne KI), je Deutsch/Englisch.

## Schon im Branch (lesbar committed)

- `db/migrations/042_ai_mail_templates.sql` – personas.style (+ Startfassungen Mia/Lara/Ben), Tabelle ai_mail_templates,
  inquiries.generated_subject/generated_body
- `src/services/inquiry-agent.js` – `templateVars`, `fallbackDraft` nutzt `ctx.template`, `buildPrompt(ctx)` (exportiert),
  `draftAnthropic` nutzt `buildPrompt`. Benötigt `src/services/aimail.js` (siehe unten, fehlt noch!)
- `src/views/admin/ai-mail-edit.ejs` – Bearbeiten-Seite je Anlass (Mustertext, Pflichtpunkte, Vorschau, Prompt, Regeln, Stilbeispiel)
- `src/views/admin/emails.ejs` – Abschnitt „KI-Mails der Personas“ (braucht `AI_KEYS`, `AI_LANGUAGES`, `aiRows`, `personas` aus der Route)
- `src/views/admin/site-form.ejs` – Feld „Rolle & Stil“ je Persona
- `src/views/admin/ai-texts.ejs` – Verweis auf KI-Mails

## Noch zu tun

### 1. `src/services/aimail.js` neu anlegen (Inhalt am Ende dieser Datei)

### 2. `src/routes/admin-emails.js`
a) Vor `async function renderEdit(` einfügen: Block „KI-Mails“ (Abschnitt B am Ende dieser Datei) – Routen
   `GET/POST /ki/:key` (müssen vor `/:key` stehen), Render `admin/ai-mail-edit`.
b) In `router.get('/')` vor `res.render('admin/emails', {`:
```js
  const aiRows = await db.many(`SELECT t.key, t.language, t.version, t.updated_at FROM ai_mail_templates t WHERE t.site_id = $1`, [site.id]);
  const personas = await db.many(`SELECT role, name, style FROM personas WHERE site_id = $1`, [site.id]);
```
   und im Render-Objekt ergänzen: `AI_KEYS: aimail.KEYS, AI_LANGUAGES: aimail.LANGUAGES, aiRows, personas,`
   (ohne das stürzt /admin/emails ab!)

### 3. `src/routes/admin-sites.js` – Persona speichern mit `style`
In `router.post('/:id/personas/:pid'`:
```js
  const style = String(req.body.style || '').replace(/\r/g, '').trim().slice(0, 2000) || null;
  ...
  `UPDATE personas SET name = $3, title = $4, email = $5, active = $6, style = $7 WHERE id = $2 AND site_id = $1`,
  [req.params.id, req.params.pid, name, title, email, req.body.active === 'on', style]
```

### 4. `src/services/inquiries.js`
- `formulate()`: vor `agent.draftInquiry` laden
  `const template = await aimail.get(site.id, 'inquiry', language);`
  `const example = await aimail.inquiryExample(language, inq.id);`
  und `template, example` in den ctx geben. Persona mit `style` laden (`personaOf` liefert `SELECT *`, passt nach Migration).
  Beim UPDATE zusätzlich `generated_subject = draft.subject, generated_body = draft.body` speichern.
- `send()` (Pfad ohne vorformulierten Text): ebenso `template` + `example` übergeben.
- `dailyMaintenance()` Erinnerung: statt `'Erinnerung: ' + inq.subject` / `inq.body`:
  `const tpl = await aimail.get(site.id, 'inquiry_reminder', inq.language);`
  `vars = { marke: site.name, objekt: entity.name, name: persona?.name || site.name, betreff: inq.subject, text: inq.body }`
  `subject = aimail.fill(tpl.subject, vars)`, `text = aimail.fill(tpl.body, vars)`; dann Antwortlink einsetzen.
- Antwortlink überall mit `split(agent.LINK).join(url)` statt `.replace(...)` (falls {{LINK}} mehrfach vorkommt).

### 5. Tests `test/aimail.test.js`
`fill` (Platzhalter, Abschnitt {{#fotos}} an/aus, {{LINK}} bleibt, Leerzeilen), `unknownPlaceholders`, `mustList`,
`stripDisclosure`, `buildPrompt` enthält Persona-Stil, Pflichtpunkte, Mustertext, Stilbeispiel und feste Regeln,
`fallbackDraft` mit `template` ergibt ausgefüllten Mustertext. Bestehende Tests (inquiry.test.js) müssen grün bleiben.

### 6. Deploy
`git pull && npm run migrate && npm test && pm2 reload tri-hotel`; danach /admin/emails, /admin/emails/ki/inquiry,
/admin/sites/<id> aufrufen und einen Entwurf formulieren.

---

## A) `src/services/aimail.js`

```js
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
    vars: { marke: 'Name der Site', objekt: 'Name des Objekts', objekte: 'Objekte (Mehrzahl, z. B. „Hotels“)', objekt_art: 'Objektart (Einzahl, z. B. „Hotel“)', name: 'Vorname der Persona', LINK: 'persönlicher Antwortlink (Pflicht)' },
    sections: { fotos: 'nur, wenn Fotos angefragt werden' },
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
```

## B) Block für `src/routes/admin-emails.js` (vor `async function renderEdit(`)

```js
// ---------- KI-Mails der Personas: Mustertext + Pflichtpunkte je Anlass und Sprache ----------

const aimail = require('../services/aimail');
const agent = require('../services/inquiry-agent');
const rankingsService = require('../services/rankings');

async function renderAiEdit(req, res, site, key, language, draft, extra = {}) {
  const def = aimail.KEYS[key];
  const saved = await db.one(
    `SELECT t.*, u.email AS updated_by_email FROM ai_mail_templates t LEFT JOIN admin_users u ON u.id = t.updated_by
      WHERE t.site_id = $1 AND t.key = $2 AND t.language = $3`, [site.id, key, language]);
  const tpl = draft || (await aimail.get(site.id, key, language));
  const persona = await db.one(`SELECT * FROM personas WHERE site_id = $1 AND role = $2`, [site.id, def.persona]);
  // Vorschau mit einem Beispielobjekt des Standard-Rankings (ohne KI-Aufruf)
  const ranking = await db.one(`SELECT * FROM rankings WHERE site_id = $1 ORDER BY is_default DESC, created_at LIMIT 1`, [site.id])
    || await db.one(`SELECT * FROM rankings WHERE is_default LIMIT 1`);
  const sampleEntity = { name: `${ranking ? ranking.entity_label_sg : 'Objekt'} Beispiel`, city: 'Playa Blanca', country: language === 'de' ? 'DE' : 'ES' };
  const criteria = ranking ? (await rankingsService.getCriteria(ranking.id)).filter(agent.isAskable).slice(0, 2) : [];
  const ctx = { entity: sampleEntity, ranking: ranking || { name: site.name, entity_label_sg: 'Objekt', entity_label_pl: 'Objekte' }, criteria, facts: {}, language, brand: site.name, askPhotos: true, persona, template: tpl };
  const fallback = agent.fallbackDraft(ctx);
  const example = key === 'inquiry' ? await aimail.inquiryExample(language) : null;
  const prompt = def.ai ? agent.buildPrompt({ ...ctx, example }) : null;
  res.render('admin/ai-mail-edit', {
    title: `KI-Mail: ${def.label}`, site, key, def, language, saved, tpl, persona, fallback, prompt, example,
    LANGUAGES: aimail.LANGUAGES, RULES: aimail.rules({ askPhotos: true }),
    errors: [], flash: req.query.ok || null, ...extra,
  });
}

router.get('/ki/:key', wrap(async (req, res, next) => {
  if (!aimail.KEYS[req.params.key]) return next();
  const { site } = await siteFrom(req);
  const language = aimail.LANGUAGES[req.query.sprache] ? req.query.sprache : 'de';
  await renderAiEdit(req, res, site, req.params.key, language, null);
}));

router.post('/ki/:key', wrap(async (req, res, next) => {
  const key = req.params.key;
  if (!aimail.KEYS[key]) return next();
  const { site } = await siteFrom(req);
  const language = aimail.LANGUAGES[req.body.language] ? req.body.language : 'de';
  const back = `/admin/emails/ki/${key}?site=${site.id}&sprache=${language}`;
  const action = ['preview', 'save', 'reset'].includes(req.body.action) ? req.body.action : 'preview';
  if (action === 'reset') {
    const old = await db.one(`DELETE FROM ai_mail_templates WHERE site_id = $1 AND key = $2 AND language = $3 RETURNING subject, body, must, version`, [site.id, key, language]);
    await logAction(req.session.admin.id, 'email_template', site.id, 'reset_ai_mail_template', { key, language, previous: old });
    return res.redirect(`${back}&ok=${encodeURIComponent('Standardtext wiederhergestellt')}`);
  }
  const draft = {
    subject: String(req.body.subject || '').trim().slice(0, 200),
    body: String(req.body.body || '').replace(/\r/g, '').trim().slice(0, 6000),
    must: String(req.body.must || '').replace(/\r/g, '').trim().slice(0, 2000),
  };
  const errors = [];
  if (!draft.subject || !draft.body) errors.push('Betreff und Mustertext dürfen nicht leer sein.');
  const unknown = aimail.unknownPlaceholders(key, draft.subject, draft.body);
  if (unknown.length) errors.push(`Unbekannte Platzhalter: ${unknown.map((u) => `{{${u}}}`).join(', ')}`);
  if (key === 'inquiry' && !draft.body.includes(aimail.LINK)) errors.push(`Der Mustertext braucht den Antwortlink ${aimail.LINK}.`);
  if (key === 'inquiry_reminder' && !draft.body.includes('{{text}}') && !draft.body.includes(aimail.LINK)) errors.push('Die Erinnerung braucht {{text}} (Anfrage mit Link) oder {{LINK}}.');
  if (action === 'preview' || errors.length) return renderAiEdit(req, res, site, key, language, draft, { errors, unsaved: true });
  const prev = await db.one(`SELECT subject, body, must, version FROM ai_mail_templates WHERE site_id = $1 AND key = $2 AND language = $3`, [site.id, key, language]);
  await db.query(
    `INSERT INTO ai_mail_templates (site_id, key, language, subject, body, must, version, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, $7, now())
     ON CONFLICT (site_id, key, language) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, must = EXCLUDED.must,
       version = ai_mail_templates.version + 1, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [site.id, key, language, draft.subject, draft.body, draft.must || null, req.session.admin.id]);
  await logAction(req.session.admin.id, 'email_template', site.id, 'edit_ai_mail_template', { key, language, previous: prev });
  res.redirect(`${back}&ok=${encodeURIComponent('Gespeichert – gilt ab dem nächsten Entwurf')}`);
}));
```
