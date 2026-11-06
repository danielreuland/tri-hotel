const test = require('node:test');
const assert = require('node:assert/strict');
const finder = require('../src/services/website-finder');

const entity = { id: 'e1', name: 'JS Cape Colom', city: 'Felanitx', country: 'ES', attributes: {} };
const page = (title, body) => `<html><head><title>${title}</title><script>var x = 'Felanitx';</script></head><body>${body}</body></html>`;

test('website-finder.assess: Name in Titel oder Domain und Ort auf der Seite -> eindeutig', () => {
  assert.equal(finder.assess(entity, { url: 'https://www.jshotels.com/cape-colom', html: page('JS Cape Colom | Hotel', 'Calle Mayor, Felanitx') }).confidence, 'high');
  assert.equal(finder.assess(entity, { url: 'https://capecolom.es/', html: page('Willkommen', 'Felanitx, Mallorca') }).confidence, 'high', 'Name in der Domain');
});

test('website-finder.assess: ohne Ort oder nur im Text -> Vorschlag; fremde Seite und Portale -> abgelehnt', () => {
  assert.equal(finder.assess(entity, { url: 'https://x.com.es/', html: page('JS Cape Colom', 'Portocolom') }).confidence, 'check', 'Ort fehlt; Skript zählt nicht');
  assert.equal(finder.assess(entity, { url: 'https://jshotels.example/', html: page('Unsere Hotels', 'JS Cape Colom in Felanitx') }).ok, true);
  assert.equal(finder.assess(entity, { url: 'https://anderes-hotel.es/', html: page('Hotel Mar', 'Felanitx') }).ok, false);
  assert.equal(finder.assess(entity, { url: 'https://www.booking.com/hotel/es/js-cape-colom.html', html: page('JS Cape Colom', 'Felanitx') }).ok, false);
  assert.equal(finder.assess(entity, { url: 'https://de-de.facebook.com/jscapecolom', html: page('JS Cape Colom', 'Felanitx') }).ok, false);
});

test('website-finder.assess: nichts Triathlon-Spezifisches, zweites Objekt', () => {
  const gym = { name: 'Box Nord', city: 'Kiel', attributes: { address: { postal_code: '24103' } } };
  assert.equal(finder.assess(gym, { url: 'https://boxnord.de/', html: page('Start', 'Hafenstraße 1, 24103 Stadt') }).confidence, 'high', 'Postleitzahl zählt als Ort');
});

test('website-finder.isPublicUrl: nur öffentliche Adressen', () => {
  assert.equal(finder.isPublicUrl('https://hotel.example/de'), true);
  for (const bad of ['http://localhost:3010/', 'http://127.0.0.1/', 'http://[::1]/', 'ftp://hotel.example/', 'https://u:p@hotel.example/', 'https://hotel.example:3020/', 'http://intranet/', 'kein-link']) {
    assert.equal(finder.isPublicUrl(bad), false, bad);
  }
});

test('website-finder.urlFromAnswer: erste Adresse, die kein Portal ist', () => {
  assert.equal(finder.urlFromAnswer('https://www.jshotels.com/cape-colom.'), 'https://www.jshotels.com/cape-colom');
  assert.equal(finder.urlFromAnswer('https://www.booking.com/x und https://hotel.example/'), 'https://hotel.example/');
  assert.equal(finder.urlFromAnswer('KEINE'), null);
  assert.equal(finder.cleanUrl('https://hotel.example/de?utm=1#a'), 'https://hotel.example/de');
});

test('website-finder.find: OpenStreetMap eindeutig -> keine kostenpflichtige Websuche', async () => {
  let searched = 0;
  const r = await finder.find(entity, {
    findOsm: async () => ({ website: 'https://jshotels.example/', osmUrl: 'https://osm/1' }),
    search: async () => { searched += 1; return null; },
    fetchPageFn: async (url) => ({ url, html: page('JS Cape Colom', 'Felanitx') }),
  });
  assert.equal(searched, 0);
  assert.equal(r.url, 'https://jshotels.example/');
  assert.equal(r.source, 'OpenStreetMap');
  assert.equal(r.confidence, 'high');
});

test('website-finder.find: OSM unsicher oder leer -> Websuche; das Eindeutige gewinnt; nichts gefunden -> tried', async () => {
  const pages = {
    'https://osm.example/': page('JS Cape Colom', 'Portocolom'),
    'https://suche.example/': page('JS Cape Colom', 'Felanitx'),
  };
  const r = await finder.find(entity, {
    findOsm: async () => ({ website: 'https://osm.example/' }), search: async () => 'https://suche.example/',
    fetchPageFn: async (url) => ({ url, html: pages[url] }),
  });
  assert.equal(r.url, 'https://suche.example/');
  assert.equal(r.source, 'Websuche');
  const none = await finder.find(entity, { findOsm: async () => null, search: async () => null, fetchPageFn: async () => null });
  assert.equal(none.url, null);
  assert.equal(none.tried.length, 2);
});

test('website-finder.assess: Seite ohne lesbaren Namen, aber Teil des Namens in der Domain -> Vorschlag; kurze Wörter nicht im Fließtext', () => {
  const geo = { name: 'Geovillage Sport & Wellness Resort', city: 'Olbia', attributes: {} };
  assert.equal(finder.assess(geo, { url: 'https://geovillage.it/', html: page('Benvenuti', '') }).confidence, 'check');
  const js = { name: 'JS', city: 'Felanitx', attributes: {} };
  assert.equal(finder.assess(js, { url: 'https://anderes.es/', html: page('Hotel', 'objsect aktiv') }).ok, false, '„js“ steckt nur in einem anderen Wort');
});
