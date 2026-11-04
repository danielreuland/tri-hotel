const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const ejs = require('ejs');

const views = path.join(__dirname, '..', 'src', 'views', 'emails');
const base = { site: { name: 'tri-hotel.de', logo_text: 'TRI-HOTEL' }, baseUrl: 'https://example.test', text: 'Text', cta: 'profile' };

test('Mail-Fußzeile: englische Anfrage durchgehend auf Englisch', async () => {
  const html = await ejs.renderFile(path.join(views, 'inquiry.ejs'), { ...base, language: 'en' });
  assert.match(html, /neutral rankings with verified facts/);
  assert.match(html, />Legal notice</);
  assert.match(html, /href="https:\/\/example\.test\/privacy"[^>]*>Privacy</);
  assert.doesNotMatch(html, /neutrale Rankings|Datenschutz|Impressum</);
});

test('Mail-Fußzeile: deutsche Anfrage auf Deutsch', async () => {
  const html = await ejs.renderFile(path.join(views, 'inquiry.ejs'), { ...base, language: 'de' });
  assert.match(html, /neutrale Rankings mit geprüften Fakten/);
  assert.match(html, /href="https:\/\/example\.test\/datenschutz"[^>]*>Datenschutz</);
  assert.match(html, />Impressum</);
});

test('Mail-Fußzeile: ohne Sprachangabe bleibt es Deutsch', async () => {
  const html = await ejs.renderFile(path.join(views, '_layout_bottom.ejs'), { site: base.site, baseUrl: base.baseUrl });
  assert.match(html, /neutrale Rankings mit geprüften Fakten/);
});
