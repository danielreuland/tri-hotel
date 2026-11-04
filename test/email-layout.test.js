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

const mail = 'Guten Tag\n\nhttps://example.test/anfrage/abc\n\nViele Grüße\n\n--\nWarum Sie diese Mail erhalten: Text\nDatenschutz: https://example.test/datenschutz';

test('Anfrage-Mail: Link nur als Knopf, nicht zusätzlich als Adresse', async () => {
  const html = await ejs.renderFile(path.join(views, 'inquiry.ejs'), { ...base, language: 'de', text: mail });
  assert.match(html, /<a href="https:\/\/example\.test\/anfrage\/abc" style="[^"]*"[^>]*>Jetzt Angaben ergänzen und Fotos hochladen<\/a>/);
  assert.equal(html.split('https://example.test/anfrage/abc').length - 1, 1);
});

test('Anfrage-Mail: rechtliche Fußzeile bei einem Menschen klein und grau, auch die Links', async () => {
  const html = await ejs.renderFile(path.join(views, 'inquiry.ejs'), { ...base, language: 'de', text: mail, smallFooter: true });
  assert.match(html, /<p style="color:#6a737d;font-size:12px">--<br>Warum Sie diese Mail erhalten: Text<br>Datenschutz: <a href="https:\/\/example\.test\/datenschutz" style="color:#6a737d">/);
});

test('Anfrage-Mail: Absatz mit „--“ (KI-Hinweis) bleibt ohne Kennzeichen normal', async () => {
  const html = await ejs.renderFile(path.join(views, 'inquiry.ejs'), { ...base, language: 'de', text: mail });
  assert.doesNotMatch(html, /<p style="color:#6a737d;font-size:12px">--/);
  assert.match(html, /<p>--<br>Warum Sie diese Mail erhalten/);
});

test('Mail-Fußzeile: ohne Sprachangabe bleibt es Deutsch', async () => {
  const html = await ejs.renderFile(path.join(views, '_layout_bottom.ejs'), { site: base.site, baseUrl: base.baseUrl });
  assert.match(html, /neutrale Rankings mit geprüften Fakten/);
});
