const test = require('node:test');
const assert = require('node:assert/strict');
const partners = require('../src/services/partners');

const booking = { domains: ['booking.com'], link_params: { aid: '123' }, link_template: null };

test('Partnerlinks: nur https und nur erlaubte Domains', () => {
  assert.equal(partners.allowedUrl(booking, 'https://www.booking.com/hotel/es/x.html'), 'https://www.booking.com/hotel/es/x.html');
  assert.equal(partners.allowedUrl(booking, 'http://www.booking.com/hotel/es/x.html'), null);
  assert.equal(partners.allowedUrl(booking, 'https://evil-booking.com/x'), null);
  assert.equal(partners.allowedUrl(booking, 'https://booking.com.evil.net/x'), null);
  assert.equal(partners.allowedUrl({ domains: [] }, 'https://hotel-beispiel.es/buchen'), 'https://hotel-beispiel.es/buchen');
  assert.equal(partners.allowedUrl(booking, 'kein link'), null);
});

test('Partnerlinks: Kennung anhängen oder Netzwerk-Vorlage verwenden', () => {
  assert.equal(partners.buildUrl(booking, 'https://www.booking.com/hotel/es/x.html?lang=de'), 'https://www.booking.com/hotel/es/x.html?lang=de&aid=123');
  assert.equal(partners.buildUrl(booking, 'https://www.booking.com/x.html?aid=999'), 'https://www.booking.com/x.html?aid=999', 'vorhandene Kennung bleibt');
  const awin = { link_template: 'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued={url_enc}' };
  assert.equal(partners.buildUrl(awin, 'https://www.holidaycheck.de/hi/x/1?a=b'),
    'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued=https%3A%2F%2Fwww.holidaycheck.de%2Fhi%2Fx%2F1%3Fa%3Db');
  assert.equal(partners.monetized({ link_params: {} }), false);
  assert.equal(partners.monetized(booking), true);
});

test('Suchseite des Anbieters für Objekte ohne eigenen Link', () => {
  const p = { search_url: 'https://www.expedia.de/Hotel-Search?destination={q}' };
  assert.equal(partners.searchUrl(p, { name: 'Playitas Hotel', city: 'Las Playitas' }), 'https://www.expedia.de/Hotel-Search?destination=Playitas%20Hotel%20Las%20Playitas');
  assert.equal(partners.searchUrl({ search_url: 'https://x.de/suche' }, { name: 'A' }), null, 'ohne {q} kein Suchlink');
  assert.equal(partners.searchUrl({ search_url: null }, { name: 'A' }), null);
  // mit Partnerkennung wird der Suchlink wie jeder andere Link ergänzt
  const url = partners.buildUrl({ link_params: { affcid: 'X1' } }, partners.searchUrl(p, { name: 'Café & Bar', city: null }));
  assert.match(url, /destination=Caf%C3%A9(\+|%20)%26(\+|%20)Bar/);
  assert.match(url, /affcid=X1/);
});

test('Partnerlinks gruppieren: Weiterleitung über /go oder direkt (z. B. Expedia), Markenhinweis', () => {
  const awin = 'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued={url_enc}';
  const groups = partners.groupLinks([
    { code: 'expedia', name: 'Expedia', kind: 'booking', url: 'https://www.expedia.de/Hotel-Search?destination=X', link_template: awin, direct_link: true, trademark_notice: 'EXPEDIA ist eine Marke …', monetized: true },
    { code: 'tripadvisor', name: 'Tripadvisor', kind: 'reviews', url: 'https://www.tripadvisor.de/Search?q=X', direct_link: false, monetized: false },
  ], 'hotel-x');
  const ex = groups.find((g) => g.code === 'expedia');
  assert.match(ex.href.booking, /^https:\/\/www\.awin1\.com\/cread\.php\?awinmid=1&awinaffid=2&ued=https%3A%2F%2Fwww\.expedia\.de/);
  assert.equal(ex.count.booking, '/go/hotel-x/expedia/klick');
  assert.equal(ex.trademark_notice, 'EXPEDIA ist eine Marke …');
  const ta = groups.find((g) => g.code === 'tripadvisor');
  assert.equal(ta.href.reviews, '/go/hotel-x/tripadvisor/bewertungen');
  assert.equal(ta.count.reviews, null);
});
