// Systemmails, im Admin je Site bearbeitbar (Tabelle email_templates).
// Der Text ist einfacher Text mit Platzhaltern – kein Code:
//   {{hotel}}          Platzhalter (siehe VARS je Vorlage)
//   **fett**           Fettschrift
//   [Text](https://…)  Link; steht er allein in einem Absatz, wird er als Button gezeigt
//   Leerzeile          neuer Absatz
// Ein Absatz entfällt, wenn ein darin verwendeter Platzhalter leer ist (z. B. Score noch unbekannt);
// Ausnahme: Zusätze wie {{vorlaeufig}} oder {{fotos}} (OPTIONAL).
// Kopf (Marke) und Fuß (Impressum/Datenschutz) kommen immer aus dem festen Layout.
const path = require('path');
const ejs = require('ejs');

// Standardtexte (Ausgangsstand, „Auf Standard zurücksetzen“)
const DEFAULTS = {
  verify: {
    label: 'Vorschlag bestätigen',
    recipient: 'Melder (Formular „hinzufügen“)',
    trigger: 'direkt nach dem Absenden des Formulars',
    subject: 'Bitte bestätige deinen Vorschlag: {{hotel}}',
    body: `Hallo,

danke, dass du **{{hotel}}** für das Ranking „{{ranking}}“ vorgeschlagen hast.

Bitte bestätige deinen Vorschlag mit einem Klick:

[Vorschlag bestätigen]({{link}})

{{bewertung}}

Der Link ist {{stunden}} Stunden gültig. Danach prüfen wir die Angaben automatisch und von Hand und melden uns, sobald die Seite online ist.

Du hast nichts vorgeschlagen? Dann ignoriere diese Mail einfach – ohne Bestätigung wird nichts veröffentlicht.`,
  },
  live: {
    label: 'Seite ist online',
    recipient: 'Melder (nur mit bestätigter Adresse)',
    trigger: 'bei Freigabe im Admin',
    subject: '{{hotel}} ist jetzt online',
    body: `Hallo,

gute Nachrichten: **{{hotel}}** ist jetzt online.

[Seite ansehen]({{link}})

{{scorename}}: **{{score}}**{{vorlaeufig}}

Danke, dass du mithilfst, die Übersicht vollständiger zu machen.`,
  },
  rejected: {
    label: 'Absage',
    recipient: 'Melder (nur mit bestätigter Adresse)',
    trigger: 'bei Ablehnung im Admin',
    subject: 'Dein Vorschlag: {{hotel}}',
    body: `Hallo,

danke für deinen Vorschlag **{{hotel}}**. Leider können wir den Eintrag nicht in das Ranking „{{ranking}}“ aufnehmen.

**Begründung:** {{begruendung}}

Falls du Informationen hast, die das ändern, antworte gern auf diese Mail.`,
  },
  duplicate: {
    label: 'Schon vorhanden (Dublette)',
    recipient: 'Melder',
    trigger: 'wenn der Admin eine Dublette bestätigt',
    subject: '{{hotel}} ist schon bei uns',
    body: `Hallo,

danke für deinen Vorschlag! **{{hotel}}** ist bereits bei uns erfasst.

Hier ist die Seite: [{{link}}]({{link}})

{{in_pruefung}}`,
  },
  'review-verify': {
    label: 'Bewertung bestätigen',
    recipient: 'Gast, der eine Bewertung schreibt',
    trigger: 'direkt nach dem Absenden der Bewertung',
    subject: 'Bitte bestätige deine Bewertung: {{hotel}}',
    body: `Hallo {{name}},

danke für deine Bewertung von **{{hotel}}**!

Bitte bestätige sie mit einem Klick – erst dann prüfen wir sie und schalten sie frei:

[Bewertung bestätigen]({{link}})

Der Link ist {{stunden}} Stunden gültig. Du hast keine Bewertung geschrieben? Dann ignoriere diese Mail einfach – ohne Bestätigung wird nichts veröffentlicht.`,
  },
  'lead-verify': {
    label: 'Camp-Anfrage bestätigen',
    recipient: 'Interessent (Anfrage an einen Camp-Anbieter)',
    trigger: 'direkt nach dem Absenden der Anfrage',
    subject: 'Bitte bestätige deine Anfrage an {{anbieter}}',
    body: `Hallo {{name}},

danke für deine Anfrage an **{{anbieter}}**.

Bitte bestätige sie mit einem Klick – erst dann geben wir sie an den Anbieter weiter:

[Anfrage bestätigen]({{link}})

Der Link ist {{stunden}} Stunden gültig. Du hast nichts angefragt? Dann ignoriere diese Mail einfach – ohne Bestätigung geben wir nichts weiter.`,
  },
  'lead-forward': {
    label: 'Camp-Anfrage an Anbieter',
    recipient: 'Camp-Anbieter (Empfänger aus dem Anbieterprofil)',
    trigger: 'wenn eine bestätigte Anfrage im Admin weitergeleitet wird',
    subject: 'Neue Anfrage über {{site}}: {{name}}',
    body: `Hallo {{anbieter}},

über {{site}} hat sich jemand für ein Camp bei euch interessiert und der Weitergabe seiner Anfrage zugestimmt. Antwortet einfach auf diese Mail – sie geht direkt an den Interessenten.

{{anfrage}}

Bitte verwendet die Daten nur für diese Anfrage.`,
  },
  'request-verify': {
    label: 'Camp-Angebote anfordern bestätigen',
    recipient: 'Interessent (Anfrage an mehrere Camp-Anbieter)',
    trigger: 'direkt nach dem Absenden der Sammelanfrage',
    subject: 'Bitte bestätige deine Anfrage an {{anzahl}} Camp-Anbieter',
    body: `Hallo {{name}},

danke für deine Anfrage. Wir geben sie an diese Anbieter weiter:
{{anbieter}}

Bitte bestätige sie mit einem Klick – erst dann geht sie raus:

[Anfrage bestätigen]({{link}})

Der Link ist {{stunden}} Stunden gültig. Du hast nichts angefragt? Dann ignoriere diese Mail einfach – ohne Bestätigung geben wir nichts weiter.`,
  },
  'lead-followup': {
    label: 'Nachfrage an Camp-Anbieter (Ergebnis)',
    recipient: 'Camp-Anbieter (Empfänger der weitergeleiteten Anfrage)',
    trigger: '7 Tage nach der Weitergabe, wenn noch keine Rückmeldung vorliegt',
    subject: 'Kurze Rückfrage zur Anfrage von {{name}}',
    body: `Hallo {{anbieter}},

vor einer Woche haben wir euch die Anfrage von {{name}} ({{zeitraum}}) weitergeleitet. Konntet ihr ein Angebot schicken? Ein Klick genügt:

[Ja, Angebot geschickt]({{link_ja}})

[Kein Angebot möglich]({{link_nein}})

[Passt nicht zu unserem Angebot]({{link_passt_nicht}})

Damit sehen wir, ob die Anfragen bei euch richtig ankommen. Danke!`,
  },
  'inquiry-answered': {
    label: 'Antwort eines Betreibers (an Admin)',
    recipient: 'Admin (ADMIN_NOTIFY_EMAIL)',
    trigger: 'wenn ein Betreiber eine Anfrage beantwortet',
    subject: 'Antwort vom Betreiber: {{hotel}}',
    body: `**{{hotel}}** hat auf die Anfrage geantwortet: {{antworten}} Antwort(en){{fotos}}.

Neue Einwilligungen: **{{einwilligungen}}**

[In der Prüfansicht ansehen]({{link}}) – die Werte werden erst übernommen, wenn du sie bestätigst.`,
  },
};

// Platzhalter je Vorlage: Beschreibung für den Admin
const VARS = {
  common: { hotel: 'Name des Objekts', ranking: 'Name des Rankings', scorename: 'Scorename, z. B. TriScore', site: 'Name der Site', startseite: 'Adresse der Startseite' },
  verify: { link: 'Bestätigungslink', stunden: 'Gültigkeit des Links in Stunden', bewertung: 'Hinweis zur mitgeschickten Bewertung (leer, wenn keine)' },
  live: { link: 'Link zur Profilseite', score: 'Score (leer, wenn noch unbekannt)', vorlaeufig: '„ (vorläufig …)“, solange keine Bewertungen vorliegen' },
  rejected: { begruendung: 'Begründung aus dem Admin' },
  duplicate: { link: 'Link zur bestehenden Seite (leer, solange sie nicht online ist)', in_pruefung: 'Hinweis „gerade in Prüfung“, wenn noch nicht online' },
  'review-verify': { link: 'Bestätigungslink', stunden: 'Gültigkeit des Links in Stunden', name: 'Name des Gastes' },
  'lead-verify': { anbieter: 'Name des Camp-Anbieters', name: 'Name des Interessenten', link: 'Bestätigungslink', stunden: 'Gültigkeit des Links in Stunden' },
  'lead-forward': { anbieter: 'Name des Camp-Anbieters', name: 'Name des Interessenten', anfrage: 'alle Angaben der Anfrage (Zeitraum, Personen, Niveau, Hotel, Kontakt, Nachricht)' },
  'request-verify': { name: 'Name des Interessenten', anbieter: 'Liste der gewählten Anbieter', anzahl: 'Anzahl Anbieter', link: 'Bestätigungslink', stunden: 'Gültigkeit des Links in Stunden' },
  'lead-followup': { anbieter: 'Name des Camp-Anbieters', name: 'Name des Interessenten', zeitraum: 'Zeitraum der Anfrage', link_ja: 'Link „Angebot geschickt“', link_nein: 'Link „kein Angebot möglich“', link_passt_nicht: 'Link „passt nicht“' },
  'inquiry-answered': { link: 'Link zur Prüfansicht', antworten: 'Anzahl Antworten', fotos: '„, 2 Foto(s)“ oder leer', einwilligungen: 'neue Einwilligungen (leer, wenn keine)' },
};

// Beispielwerte für Vorschau und Testversand
function sampleData(key, site) {
  const ranking = { name: 'Triathlon-Hotels', score_name: 'TriScore' };
  const base = { ranking, entityName: 'Beispielhotel Mar Azul' };
  const url = `https://${(site && site.primary_domain) || 'tri-hotel.de'}`;
  return {
    verify: { ...base, link: `${url}/bestaetigen/beispiel`, hours: 72, withReview: true },
    live: { ...base, link: `${url}/hotel/beispielhotel-mar-azul`, score: 82, provisional: true },
    rejected: { ...base, reason: 'Im Umkreis von 5 km gibt es kein Becken mit mindestens 25 m.' },
    duplicate: { ...base, link: `${url}/hotel/beispielhotel-mar-azul` },
    'review-verify': { ...base, link: `${url}/bewertung-bestaetigen/beispiel`, hours: 72, name: 'Anna K.' },
    'lead-verify': { ...base, entityName: 'Beispiel-Camps', name: 'Anna', link: `${url}/anfrage-bestaetigen/beispiel`, hours: 72 },
    'lead-forward': { ...base, entityName: 'Beispiel-Camps', lead: { name: 'Anna K.', email: 'anna@example.com', phone: '+49 170 1234567', period_month: '2027-03-01', period_note: 'Osterferien', persons: 2, hotel_text: 'Beispielhotel Mar Azul', message: 'Wir suchen ein Camp mit Schwimmtechnik.' }, levelLabel: 'Fortgeschritten' },
    'request-verify': { ...base, name: 'Anna', providers: ['Beispiel-Camps', 'Muster-Coaching', 'Trainingslager Süd'], link: `${url}/angebote-bestaetigen/beispiel`, hours: 72 },
    'lead-followup': { ...base, entityName: 'Beispiel-Camps', name: 'Anna K.', period: 'März 2027', links: { offer_sent: `${url}/anbieter-rueckmeldung/beispiel/offer_sent`, no_offer: `${url}/anbieter-rueckmeldung/beispiel/no_offer`, not_relevant: `${url}/anbieter-rueckmeldung/beispiel/not_relevant` } },
    'inquiry-answered': { ...base, answers: 3, photos: 2, consents: ['Fotos im Profil'], link: `${url}/admin/meldungen/beispiel#anfragen` },
  }[key] || base;
}

// Daten aus dem Programm -> Platzhalterwerte (Texte, keine Objekte)
function varsFor(key, data, site, baseUrl) {
  const d = data || {};
  const r = d.ranking || {};
  const v = {
    hotel: d.entityName || '', ranking: r.name || '', scorename: r.score_name || '', site: (site && site.name) || '', startseite: baseUrl || '',
  };
  if (key === 'verify') {
    Object.assign(v, {
      link: d.link || '', stunden: String(d.hours || ''),
      bewertung: d.withReview ? '\nDamit bestätigst du auch deine Bewertung. Sie erscheint, sobald die Seite online ist und wir sie geprüft haben.\n' : '',
    });
  }
  if (key === 'live') {
    const known = d.score !== null && d.score !== undefined;
    Object.assign(v, { link: d.link || '', score: known ? String(d.score) : '', vorlaeufig: known && d.provisional ? ' (vorläufig, solange noch keine Bewertungen vorliegen)' : '' });
  }
  if (key === 'rejected') v.begruendung = d.reason || '';
  if (key === 'duplicate') {
    Object.assign(v, { link: d.link || '', in_pruefung: d.link ? '' : `Der Eintrag ist gerade in Prüfung. Sobald er online ist, findest du ihn auf ${baseUrl || ''}.` });
  }
  if (key === 'review-verify') Object.assign(v, { link: d.link || '', stunden: String(d.hours || ''), name: d.name || '' });
  if (key === 'lead-verify') Object.assign(v, { anbieter: d.entityName || '', name: d.name || '', link: d.link || '', stunden: String(d.hours || '') });
  if (key === 'lead-forward') {
    const l = d.lead || {};
    // Eingaben des Interessenten: keine Formatierungszeichen durchlassen (kein **fett**, keine [Links](…))
    const clean = (t) => String(t || '').replace(/[*[\]]/g, '').trim();
    const month = l.period_month ? new Date(l.period_month).toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '';
    const lines = [
      `Name: ${clean(l.name)}`,
      `E-Mail: ${clean(l.email)}`,
      l.phone ? `Telefon: ${clean(l.phone)}` : null,
      `Zeitraum: ${[month, clean(l.period_note)].filter(Boolean).join(' – ') || 'offen'}`,
      `Personen: ${l.persons || 'k. A.'}`,
      d.levelLabel ? `Niveau: ${d.levelLabel}` : null,
      l.hotel_text ? `Hotelwunsch: ${clean(l.hotel_text)}` : null,
      ...(d.extraLines || []).map(clean),
      l.message ? `Nachricht: ${clean(l.message)}` : null,
    ].filter(Boolean);
    Object.assign(v, { anbieter: d.entityName || '', name: clean(l.name), anfrage: lines.join('\n') });
  }
  if (key === 'request-verify') {
    const list = (d.providers || []).map((n) => `- ${String(n).replace(/[*[\]]/g, '')}`);
    Object.assign(v, { name: d.name || '', anbieter: list.join('\n'), anzahl: String(list.length), link: d.link || '', stunden: String(d.hours || '') });
  }
  if (key === 'lead-followup') {
    const lk = d.links || {};
    Object.assign(v, { anbieter: d.entityName || '', name: String(d.name || '').replace(/[*[\]]/g, ''), zeitraum: d.period || 'ohne festen Zeitraum',
      link_ja: lk.offer_sent || '', link_nein: lk.no_offer || '', link_passt_nicht: lk.not_relevant || '' });
  }
  if (key === 'inquiry-answered') {
    Object.assign(v, {
      link: d.link || '', antworten: String(d.answers ?? ''), fotos: d.photos ? `, ${d.photos} Foto(s)` : '',
      einwilligungen: (d.consents || []).join(', '),
    });
  }
  return v;
}

// Diese Platzhalter dürfen leer sein, ohne dass der Absatz entfällt (Zusätze innerhalb eines Satzes)
const OPTIONAL = new Set(['vorlaeufig', 'fotos']);

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BUTTON = 'display:inline-block;background:#0DCFBD;color:#04211e;padding:10px 20px;border-radius:999px;text-decoration:none;font-weight:bold';

function fill(text, vars) {
  return String(text).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// Unbekannte Platzhalter (Tippfehler) für die Prüfung beim Speichern
function unknownPlaceholders(key, ...texts) {
  const allowed = { ...VARS.common, ...(VARS[key] || {}) };
  const out = new Set();
  for (const t of texts) for (const m of String(t || '').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) if (!(m[1] in allowed)) out.add(m[1]);
  return [...out];
}

const safeUrl = (u) => (/^(https?:\/\/|mailto:)/i.test(u.trim()) ? u.trim() : null);

// Inline: **fett** und [Text](URL), alles andere maskiert
function inline(text) {
  let out = '';
  let last = 0;
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(last, m.index));
    if (m[1] !== undefined) out += `<strong>${esc(m[1])}</strong>`;
    else {
      const url = safeUrl(m[3]);
      out += url ? `<a href="${esc(url)}">${esc(m[2])}</a>` : esc(m[0]);
    }
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

// Text -> HTML-Absätze. Absätze mit leerem Platzhalter entfallen.
function bodyHtml(body, vars) {
  const paras = String(body || '').replace(/\r/g, '').split(/\n{2,}/);
  const html = [];
  for (const raw of paras) {
    const used = [...raw.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]);
    if (used.some((k) => k in vars && !OPTIONAL.has(k) && !String(vars[k]).trim())) continue;
    const para = fill(raw, vars).trim();
    if (!para) continue;
    const button = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(para);
    const url = button && safeUrl(button[2]);
    if (url) {
      html.push(`<p><a href="${esc(url)}" style="${BUTTON}">${esc(button[1])}</a></p>`);
    } else {
      html.push(`<p>${para.split('\n').map(inline).join('<br>')}</p>`);
    }
  }
  return html.join('\n');
}

async function render(tpl, key, data, site, baseUrl) {
  const vars = varsFor(key, data, site, baseUrl);
  const views = path.join(__dirname, '..', 'views', 'emails');
  const locals = { site, baseUrl };
  const top = await ejs.renderFile(path.join(views, '_layout_top.ejs'), locals);
  const bottom = await ejs.renderFile(path.join(views, '_layout_bottom.ejs'), locals);
  const subject = fill(tpl.subject, vars).replace(/\s+/g, ' ').trim();
  return { subject, html: `${top}\n${bodyHtml(tpl.body, vars)}\n${bottom}` };
}

module.exports = { DEFAULTS, VARS, sampleData, varsFor, fill, bodyHtml, inline, render, unknownPlaceholders };
