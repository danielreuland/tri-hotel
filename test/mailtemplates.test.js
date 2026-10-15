const test = require('node:test');
const assert = require('node:assert/strict');
const mt = require('../src/services/mailtemplates');

test('mailtemplates: Platzhalter, Fettschrift, Button, Absatz entfällt bei leerem Wert', () => {
  const vars = { hotel: 'Mar <Azul>', link: 'https://x.example/a', score: '', vorlaeufig: '' };
  const html = mt.bodyHtml('Hallo **{{hotel}}**\nzweite Zeile\n\n[Ansehen]({{link}})\n\nScore: {{score}}\n\nMehr: [hier]({{link}}){{vorlaeufig}}', vars);
  assert.match(html, /<p>Hallo <strong>Mar &lt;Azul&gt;<\/strong><br>zweite Zeile<\/p>/);
  assert.match(html, /<p><a href="https:\/\/x\.example\/a" style="[^"]+">Ansehen<\/a><\/p>/);
  assert.ok(!html.includes('Score:'), 'Absatz mit leerem Score entfällt');
  assert.match(html, /Mehr: <a href="https:\/\/x\.example\/a">hier<\/a>/, '{{vorlaeufig}} darf leer sein');
});

test('mailtemplates: keine Skripte oder fremden Link-Schemata', () => {
  const html = mt.bodyHtml('<script>x()</script> [klick](javascript:alert(1))', {});
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('href="javascript'));
});

test('mailtemplates: unbekannte Platzhalter werden gemeldet', () => {
  assert.deepEqual(mt.unknownPlaceholders('verify', 'Hi {{hotel}}', '{{link}} {{lnk}} {{score}}'), ['lnk', 'score']);
});

test('mailtemplates: alle Standardtexte mit Beispieldaten ohne offene Platzhalter', async () => {
  for (const key of Object.keys(mt.DEFAULTS)) {
    assert.deepEqual(mt.unknownPlaceholders(key, mt.DEFAULTS[key].subject, mt.DEFAULTS[key].body), [], key);
    const vars = mt.varsFor(key, mt.sampleData(key, null), { name: 'tri-hotel.de' }, 'https://tri-hotel.de');
    const html = mt.bodyHtml(mt.DEFAULTS[key].body, vars);
    assert.ok(!/\{\{/.test(html) && !/\{\{/.test(mt.fill(mt.DEFAULTS[key].subject, vars)), key);
  }
});

test('mailtemplates: Dublette ohne Link -> Hinweis „in Prüfung“ statt leerem Link', () => {
  const vars = mt.varsFor('duplicate', { entityName: 'H', link: null }, { name: 's' }, 'https://s.example');
  const html = mt.bodyHtml(mt.DEFAULTS.duplicate.body, vars);
  assert.ok(!html.includes('Hier ist die Seite'));
  assert.match(html, /gerade in Prüfung/);
});

test('mailtemplates: Hinweis zur mitgeschickten Bewertung nur, wenn es eine gibt', () => {
  const withReview = mt.varsFor('verify', { ranking: { name: 'R' }, entityName: 'H', link: 'L', hours: 72, withReview: true });
  assert.match(withReview.bewertung, /bestätigst du auch deine Bewertung/);
  assert.equal(mt.varsFor('verify', { ranking: { name: 'R' }, entityName: 'H', link: 'L', hours: 72 }).bewertung, '');
});
