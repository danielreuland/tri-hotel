const test = require('node:test');
const assert = require('node:assert/strict');
const inquiries = require('../src/services/inquiries');

test('inquiries.draftCriteria: unbekannt vor strittig vor Vorschlag, je nach Punkten, höchstens 8', () => {
  const opt = (id, pts) => ({ id, label: id, max_points: pts, scoring: { type: 'option', points: { a: pts, none: 0 } } });
  const criteria = [opt('auto', 12), opt('unk-small', 2), opt('unk-big', 6), opt('disp', 3), opt('ok', 10), { id: 'rate', max_points: 10, scoring: { type: 'rating', min: 0, max: 10 } }];
  const facts = [
    { criterion_id: 'auto', trust_level: 4, disputed: false },
    { criterion_id: 'disp', trust_level: 2, disputed: true },
    { criterion_id: 'ok', trust_level: 2, disputed: false },
  ];
  assert.deepEqual(inquiries.draftCriteria(criteria, facts).map((c) => c.id), ['unk-big', 'unk-small', 'disp', 'auto']);
  const many = Array.from({ length: 12 }, (_, i) => opt(`c${i}`, i));
  assert.equal(inquiries.draftCriteria(many, []).length, 8);
});

test('inquiries.dailyMaintenance: Erinnerung mit eigenem Link, der Link der ersten Mail bleibt gültig', async (t) => {
  const db = require('../src/db');
  const mailer = require('../src/services/mailer');
  const rankings = require('../src/services/rankings');
  const sites = require('../src/services/sites');
  const aimail = require('../src/services/aimail');
  const agent = require('../src/services/inquiry-agent');
  const { sha256 } = require('../src/lib/util');

  const inq = { id: 'i1', ranking_id: 'r1', entity_id: 'e1', persona_id: null, recipient: 'hotel@example.org', language: 'de', subject: 'Betreff', body: `Text ${agent.LINK}`, token_hash: 'erster-hash' };
  const updates = [];
  t.mock.method(db, 'query', async (sql, params) => {
    if (/SET status = 'expired'/.test(sql)) return { rowCount: 0 };
    updates.push({ sql, params });
    return { rowCount: 1, rows: [] };
  });
  t.mock.method(db, 'many', async () => [inq]);
  t.mock.method(db, 'one', async () => ({ name: 'Testhotel' }));
  t.mock.method(rankings, 'getRanking', async () => ({ id: 'r1' }));
  t.mock.method(sites, 'forRanking', async () => ({ id: 's1', name: 'Testseite' }));
  t.mock.method(sites, 'urlFor', () => 'https://example.org');
  t.mock.method(aimail, 'get', async () => ({ subject: 'Erinnerung: {{betreff}}', body: 'Der Link gilt weiter.\n{{text}}' }));
  const sent = [];
  t.mock.method(mailer, 'send', async (m) => { sent.push(m); return true; });

  const r = await inquiries.dailyMaintenance();
  assert.equal(r.reminded, 1);
  const token = /\/anfrage\/(\S+)/.exec(sent[0].data.text)[1];
  assert.equal(updates.length, 1);
  assert.match(updates[0].sql, /reminder_token_hash = \$2/);
  assert.ok(!/[^_]token_hash = /.test(updates[0].sql.replace('reminder_token_hash', '')), 'token_hash der ersten Mail bleibt unverändert');
  assert.equal(updates[0].params[1], sha256(token));
});

test('inquiries.findByToken: findet die Anfrage über den Link der ersten Mail und der Erinnerung', async (t) => {
  const db = require('../src/db');
  const { sha256 } = require('../src/lib/util');
  const row = { id: 'i1', status: 'answered', token_hash: sha256('erster'), reminder_token_hash: sha256('erinnerung') };
  t.mock.method(db, 'one', async (sql, [hash]) => {
    assert.match(sql, /token_hash = \$1 OR reminder_token_hash = \$1/);
    return hash === row.token_hash || hash === row.reminder_token_hash ? row : null;
  });
  assert.equal((await inquiries.findByToken('erster')).status, 'answered');
  assert.equal((await inquiries.findByToken('erinnerung')).status, 'answered');
  assert.equal((await inquiries.findByToken('falsch')).status, 'invalid');
});

// --- Feste Vorlage der ersten Anfrage (Hotel-Ansprache, Paket P1) ---
const fixedTemplate = {
  fixed: true, subject: '{{objekt}} auf Beispiel – kurz prüfen?',
  body: 'Guten Tag,\n\n{{#platz}}{{objekt}} hat Score {{score}}, Platz {{platz}} von {{gesamt}}.{{/platz}}{{#ohne_platz}}{{objekt}} ist erfasst.{{/ohne_platz}}{{#kernfakten}} Erfasst: {{kernfakten}}.{{/kernfakten}}\n{{#hotelseite}}\nSeite: {{hotelseite}}\n{{/hotelseite}}\n\n{{LINK}}\n\n--\nDatenschutz: {{datenschutz}}\nAbmelden: {{abmelden}}',
};
const fixedCtx = (over = {}) => ({
  entity: { name: 'Hotel Muster', city: 'Ort', country: 'ES' }, ranking: { name: 'R', entity_label_sg: 'Hotel', entity_label_pl: 'Hotels' },
  criteria: [], facts: {}, language: 'en', brand: 'Beispiel', askPhotos: true, template: fixedTemplate,
  persona: { name: 'Daniel Reuland', title: 'Gründer', is_ai: false },
  profile: { scoreText: '78', rank: 5, total: 51, keyFacts: ['50-m-Becken', 'Sauna'], url: 'https://x.test/hotel/m', privacyUrl: 'https://x.test/privacy' },
  ...over,
});

test('feste Vorlage: Text wörtlich, Modelltext wird ignoriert, übersetzte Leistungen werden übernommen, kein KI-Hinweis bei Menschen', () => {
  const agent = require('../src/services/inquiry-agent');
  const out = agent.sanitizeDraft({ subject: 'Anderer Betreff', body: 'Ganz anderer Text vom Modell, der lang genug ist, um sonst übernommen zu werden, also achtzig Zeichen.\n{{LINK}}', questions: [], confirm_items: [], feature_items: [], key_facts: '50 m pool, sauna' }, fixedCtx());
  assert.equal(out.subject, 'Hotel Muster auf Beispiel – kurz prüfen?');
  assert.match(out.body, /Hotel Muster hat Score 78, Platz 5 von 51\. Erfasst: 50 m pool, sauna\./);
  assert.match(out.body, /Seite: https:\/\/x\.test\/hotel\/m/);
  assert.match(out.body, /Abmelden: \{\{abmelden\}\}/, 'Abmeldelink wird erst beim Versand ersetzt');
  assert.ok(!/Ganz anderer/.test(out.body));
  assert.ok(!/KI|AI assistant/.test(out.body));
});

test('feste Vorlage: ohne Platz, Leistungen und öffentliche Seite fallen die Sätze weg; ohne Modell keine deutschen Leistungen in Englisch', () => {
  const agent = require('../src/services/inquiry-agent');
  const none = agent.sanitizeDraft(null, fixedCtx({ profile: { keyFacts: [], privacyUrl: 'https://x.test/privacy' } }));
  assert.match(none.body, /Hotel Muster ist erfasst\./);
  assert.ok(!/Platz|Erfasst:|Seite:|\{\{(platz|score|gesamt|hotelseite|kernfakten)\}\}/.test(none.body), none.body);
  const noModel = agent.sanitizeDraft(null, fixedCtx());
  assert.ok(!/Erfasst:|50-m-Becken/.test(noModel.body), noModel.body);
  assert.match(noModel.body, /Hotel Muster hat Score 78/);
  const noModelDe = agent.sanitizeDraft(null, fixedCtx({ language: 'de' }));
  assert.match(noModelDe.body, /Erfasst: 50-m-Becken, Sauna\./);
});

test('Prompt der festen Vorlage: kein Mustertext, Übersetzung der Leistungen nur außerhalb von Deutsch', () => {
  const agent = require('../src/services/inquiry-agent');
  const en = agent.buildPrompt(fixedCtx());
  assert.match(en, /fest vorgegeben/);
  assert.match(en, /key_facts: Übersetze.*50-m-Becken, Sauna/);
  assert.ok(!/Mustertext/.test(en));
  assert.match(agent.buildPrompt(fixedCtx({ language: 'de' })), /key_facts: leer lassen/);
});

test('KI-Persona behält den KI-Hinweis', () => {
  const agent = require('../src/services/inquiry-agent');
  const out = agent.sanitizeDraft(null, fixedCtx({ persona: { name: 'Mia', title: 'Assistenz' } }));
  assert.match(out.body, /AI assistant/);
});

test('Feste Vorlage: Herkunft der Adresse steht nur bei Adressen von der Website des Hotels', () => {
  const agent = require('../src/services/inquiry-agent');
  const template = { fixed: true, subject: 'S', body: 'Text {{LINK}} lang genug für die Prüfung der Mindestlänge dieses Mailtextes, damit nichts ersetzt wird.\n\n--\nGrund.{{#adresse_website}} Von Ihrer Website.{{/adresse_website}}' };
  const body = (addressFromWebsite) => agent.sanitizeDraft(null, fixedCtx({ template, profile: { addressFromWebsite, keyFacts: [] } })).body;
  assert.match(body(true), /Grund\. Von Ihrer Website\./);
  assert.doesNotMatch(body(false), /Von Ihrer Website/);
  assert.deepEqual(require('../src/services/aimail').unknownPlaceholders('inquiry', '{{#adresse_website}}x{{/adresse_website}}'), []);
});

test('Erinnerung: neuer Text mit Absender der ersten Mail, KI-Hinweis vor dem Zitat, Abmeldelink im Zitat', async (t) => {
  const db = require('../src/db');
  const mailer = require('../src/services/mailer');
  const rankings = require('../src/services/rankings');
  const sites = require('../src/services/sites');
  const aimail = require('../src/services/aimail');
  const agent = require('../src/services/inquiry-agent');
  const inq = { id: 'i1', ranking_id: 'r1', entity_id: 'e1', persona_id: 'p1', recipient: 'hotel@example.org', language: 'de', subject: 'Betreff', body: `Text\n\n${agent.LINK}\n\n--\n[Abmelden]({{abmelden}})` };
  t.mock.method(db, 'query', async () => ({ rowCount: 0, rows: [] }));
  t.mock.method(db, 'many', async () => [inq]);
  t.mock.method(db, 'one', async (sql) => (/personas/.test(sql) ? { id: 'p1', name: 'Daniel Reuland', is_ai: false } : { name: 'Testhotel' }));
  t.mock.method(rankings, 'getRanking', async () => ({ id: 'r1' }));
  t.mock.method(sites, 'forRanking', async () => ({ id: 's1', name: 'Testseite' }));
  t.mock.method(sites, 'urlFor', () => 'https://example.org');
  t.mock.method(sites, 'persona', async () => ({ name: 'Mia', title: 'Digitale Assistenz', is_ai: true }));
  t.mock.method(aimail, 'get', async (siteId, key, lang) => aimail.DEFAULTS[key][lang]);
  const sent = [];
  t.mock.method(mailer, 'send', async (m) => { sent.push(m); return true; });
  await inquiries.dailyMaintenance();
  const text = sent[0].data.text;
  assert.match(text, /^Hallo,\n\nbestimmt ist die erste E-Mail von Daniel untergegangen/);
  assert.match(text, /An wen darf ich mich wenden\?/);
  assert.match(text, /Viele Grüße\nMia\nDigitale Assistenz von Testseite\nDiese Nachricht/, 'Name und Rolle in eigenen Zeilen');
  assert.ok(text.indexOf('KI-Assistenz') < text.indexOf('Ursprüngliche Nachricht'), 'KI-Hinweis vor dem Zitat');
  assert.equal(text.match(/KI-Assistenz/g).length, 1, 'nur einmal');
  assert.match(text, /\[Abmelden\]\(https:\/\/example\.org\/anfrage\/\S+\/abmelden\)/);
  assert.equal(sent[0].persona.name, 'Mia');
  assert.match(sent[0].unsubscribeUrl, /^https:\/\/example\.org\/anfrage\/\S+\/abmelden$/, 'Abmeldung auch im Mail-Kopf der Erinnerung');
  assert.ok(!/\{\{/.test(text), 'keine offenen Platzhalter');
  assert.deepEqual(inquiries.reminderVars({ name: 'Marke' }, { name: 'Mia', is_ai: true }, null, 'de').absender, 'Marke', 'KI-Absender: Marke');
});

test('Erster Aufruf: Browser zählt, Scanner nicht; Abmeldung im Mail-Kopf', () => {
  const mailer = require('../src/services/mailer');
  assert.equal(inquiries.isHumanVisit('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'), true);
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1)', 'python-requests/2.31', 'Barracuda Sentinel (EE)', 'curl/8.4', '', undefined]) {
    assert.equal(inquiries.isHumanVisit(ua), false, String(ua));
  }
  assert.deepEqual(mailer.unsubscribeHeaders('https://x.example/anfrage/t/abmelden'), {
    'List-Unsubscribe': '<https://x.example/anfrage/t/abmelden>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  });
  assert.equal(mailer.unsubscribeHeaders(null), null);
});
