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
